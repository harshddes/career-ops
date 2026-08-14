import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.mjs';
import { applySchema, createPgliteDb } from '../src/db.mjs';
import { listDigestRecipients } from '../src/profile.mjs';
import { readOverlayDirect } from '../src/catalog.mjs';
import { readWorkOrderDirect } from '../src/work-orders.mjs';
import { readPersonDirect } from '../src/people.mjs';
import { compilePrompt } from '../src/prompt-compiler.mjs';
import { filterSnapshotPayload, isSnapshotSafeTable, workOrderContainsPii } from '../src/snapshot-guard.mjs';
import { ruleScore } from '../src/score.mjs';
import { parseEuraxessRss } from '../src/ingest/euraxess.mjs';
import { projectEuraxessItem, projectFusionJob, projectUmichRow, projectPhdscannerItem } from '../src/ingest/project.mjs';
import { parseUmichListingHtml } from '../src/ingest/umich.mjs';
import { parsePhdscannerListingCards, parsePhdscannerSitemap } from '../src/ingest/phdscanner.mjs';
import { fusionTitleFilter } from '../src/ingest/fusion.mjs';

async function setup() {
  const db = await createPgliteDb();
  await applySchema(db);
  const app = createApp({
    db,
    env: { ALLOW_INSECURE_MAGIC_LINK: '1' },
    seedStubCatalog: true,
  });
  return { db, app };
}

function sessionCookie(response) {
  const header = response.headers.get('set-cookie') || '';
  const match = header.match(/career_os_session=[^;]+/);
  assert.ok(match, `expected session cookie, got: ${header}`);
  return match[0];
}

async function register(app, email) {
  const response = await app.request('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'password1', name: email }),
  });
  assert.equal(response.status, 302, await response.text());
  return sessionCookie(response);
}

function jsonHeaders(cookie) {
  return {
    cookie,
    'content-type': 'application/json',
    accept: 'application/json',
  };
}

test('unauthenticated feed is rejected', async () => {
  const { app } = await setup();
  const response = await app.request('/api/feeds/euraxess');
  assert.equal(response.status, 401);
});

test('two workspaces cannot read each other overlays', async () => {
  const { db, app } = await setup();
  const cookieA = await register(app, 'ada@example.com');
  const cookieB = await register(app, 'bob@example.com');

  const saveA = await app.request('/api/overlays/euraxess-fusion-demo-1', {
    method: 'POST',
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ status: 'applied', notes: 'Ada private strategy' }),
  });
  assert.equal(saveA.status, 200, await saveA.text());

  const feedB = await app.request('/api/feeds/euraxess', { headers: { cookie: cookieB } });
  assert.equal(feedB.status, 200);
  const bodyB = await feedB.json();
  const jobB = bodyB.jobs.find(job => job.id === 'euraxess-fusion-demo-1');
  assert.ok(jobB);
  assert.notEqual(jobB.overlay_notes, 'Ada private strategy');
  assert.notEqual(jobB.overlay_status, 'applied');

  const feedA = await app.request('/api/feeds/euraxess', { headers: { cookie: cookieA } });
  const bodyA = await feedA.json();
  const jobA = bodyA.jobs.find(job => job.id === 'euraxess-fusion-demo-1');
  assert.equal(jobA.overlay_notes, 'Ada private strategy');
  assert.equal(jobA.overlay_status, 'applied');

  const meA = await (await app.request('/api/me', { headers: { cookie: cookieA } })).json();
  const meB = await (await app.request('/api/me', { headers: { cookie: cookieB } })).json();
  assert.notEqual(meA.workspace_id, meB.workspace_id);

  const leakedToB = await readOverlayDirect(db, {
    tenantId: meB.workspace_id,
    userId: meB.user_id,
    jobId: 'euraxess-fusion-demo-1',
  });
  assert.equal(leakedToB.length, 0);

  const visibleToA = await readOverlayDirect(db, {
    tenantId: meA.workspace_id,
    userId: meA.user_id,
    jobId: 'euraxess-fusion-demo-1',
  });
  assert.equal(visibleToA.length, 1);
  assert.equal(visibleToA[0].notes, 'Ada private strategy');
});

test('two workspaces cannot read each other work orders', async () => {
  const { db, app } = await setup();
  const cookieA = await register(app, 'ada-wo@example.com');
  const cookieB = await register(app, 'bob-wo@example.com');

  const queued = await app.request('/api/work-orders', {
    method: 'POST',
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ target_kind: 'job', target_id: 'euraxess-fusion-demo-1' }),
  });
  const created = await queued.json();
  assert.equal(queued.status, 200, JSON.stringify(created));
  assert.equal(created.ok, true);
  assert.match(created.order.prompt_text, /EURAXESS only/);
  assert.match(created.order.prompt_text, /Do not submit applications/);

  const copy = await app.request(`/api/work-orders/${created.order.id}/copy`, {
    method: 'POST',
    headers: jsonHeaders(cookieA),
  });
  const copied = await copy.json();
  assert.equal(copy.status, 200, JSON.stringify(copied));
  assert.equal(copied.ok, true);
  assert.equal(copied.order.status, 'copied');
  assert.ok(copied.prompt_text.includes(created.order.id));

  const inboxB = await app.request('/api/work-orders', { headers: { cookie: cookieB } });
  assert.equal(inboxB.status, 200);
  const bodyB = await inboxB.json();
  assert.equal(bodyB.orders.length, 0);

  const stolen = await app.request(`/api/work-orders/${created.order.id}`, {
    headers: { cookie: cookieB },
  });
  assert.equal(stolen.status, 404);

  const hijack = await app.request(`/api/work-orders/${created.order.id}/complete`, {
    method: 'POST',
    headers: jsonHeaders(cookieB),
    body: JSON.stringify({ result_md: 'stolen', status: 'completed' }),
  });
  assert.equal(hijack.status, 404);

  const meB = await (await app.request('/api/me', { headers: { cookie: cookieB } })).json();
  const leaked = await readWorkOrderDirect(db, {
    tenantId: meB.workspace_id,
    userId: meB.user_id,
    orderId: created.order.id,
  });
  assert.equal(leaked.length, 0);
});

test('complete work order stores pasted markdown for the owner only', async () => {
  const { app } = await setup();
  const cookie = await register(app, 'paste@example.com');
  const queued = await app.request('/api/work-orders', {
    method: 'POST',
    headers: jsonHeaders(cookie),
    body: JSON.stringify({ target_kind: 'org', target_id: 'org-helion-energy', lane: 'exhibitor' }),
  });
  const created = await queued.json();
  assert.equal(queued.status, 200, JSON.stringify(created));
  assert.match(created.order.prompt_text, /target-companies-exhibitor/);

  const done = await app.request(`/api/work-orders/${created.order.id}/complete`, {
    method: 'POST',
    headers: jsonHeaders(cookie),
    body: JSON.stringify({ result_md: '# Helion report', status: 'review_ready' }),
  });
  const body = await done.json();
  assert.equal(done.status, 200, JSON.stringify(body));
  assert.equal(body.order.result_md, '# Helion report');
  assert.equal(body.order.status, 'review_ready');
});

test('networking people and work orders stay private and marked PII', async () => {
  const { db, app } = await setup();
  const cookieA = await register(app, 'net-a@example.com');
  const cookieB = await register(app, 'net-b@example.com');

  const personRes = await app.request('/api/people', {
    method: 'POST',
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({
      display_name: 'Ada Recruiter',
      title: 'Recruiter',
      organization_name: 'Helion Energy',
      org_id: 'org-helion-energy',
    }),
  });
  const personBody = await personRes.json();
  assert.equal(personRes.status, 200, JSON.stringify(personBody));
  const person = personBody.person;

  const leakedPeople = await app.request('/api/people', { headers: { cookie: cookieB } });
  const peopleB = await leakedPeople.json();
  assert.equal(peopleB.people.length, 0);

  const meB = await (await app.request('/api/me', { headers: { cookie: cookieB } })).json();
  const leakedPersonRows = await readPersonDirect(db, {
    tenantId: meB.workspace_id,
    userId: meB.user_id,
    personId: person.id,
  });
  assert.equal(leakedPersonRows.length, 0);

  const queued = await app.request('/api/work-orders', {
    method: 'POST',
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ target_kind: 'person', target_id: person.id, lane: 'networking' }),
  });
  const created = await queued.json();
  assert.equal(queued.status, 200, JSON.stringify(created));
  assert.equal(created.order.contains_pii, true);
  assert.match(created.order.prompt_text, /Never scrape LinkedIn/);
  assert.equal(workOrderContainsPii('networking'), true);
  assert.equal(isSnapshotSafeTable('workspace_people'), false);
  assert.equal(isSnapshotSafeTable('catalog_jobs'), true);
  assert.deepEqual(
    filterSnapshotPayload({ catalog_jobs: [1], work_orders: [created.order], networking: { people: [person] } }),
    { catalog_jobs: [1] },
  );
});

test('applied kanban lists only the caller overlay', async () => {
  const { app } = await setup();
  const cookieA = await register(app, 'kanban-a@example.com');
  const cookieB = await register(app, 'kanban-b@example.com');
  await app.request('/api/overlays/euraxess-fusion-demo-1', {
    method: 'POST',
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ status: 'applied', notes: 'Ada applied' }),
  });
  const pageA = await app.request('/applied', { headers: { cookie: cookieA } });
  const htmlA = await pageA.text();
  assert.match(htmlA, /Ada applied|applied/i);
  assert.match(htmlA, /plasma diagnostics/);
  const pageB = await app.request('/applied', { headers: { cookie: cookieB } });
  const htmlB = await pageB.text();
  assert.doesNotMatch(htmlB, /Ada applied/);
});

test('catalog service key is required for upserts', async () => {
  const { app } = await setup();
  const denied = await app.request('/api/internal/catalog', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jobs: [] }),
  });
  assert.equal(denied.status, 401);
});

test('healthz does not require a session', async () => {
  const { app } = await setup();
  const response = await app.request('/healthz');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
});

test('prompt compiler keeps lanes isolated and forbids auto-send', async () => {
  const exhibitor = compilePrompt({
    lane: 'exhibitor',
    orderId: 'wo_test',
    target: { kind: 'org', id: 'org-helion-energy', title: 'Helion Energy' },
    baseUrl: 'http://127.0.0.1:8787',
  });
  assert.match(exhibitor, /target-companies-exhibitor/);
  assert.match(exhibitor, /Do not submit applications/);
  assert.doesNotMatch(exhibitor, /Find new networking contacts/);

  const networking = compilePrompt({
    lane: 'networking',
    orderId: 'wo_net',
    target: { kind: 'org', id: 'org-helion-energy', title: 'Helion Energy' },
  });
  assert.match(networking, /networking-contact-research/);
  assert.match(networking, /Never scrape LinkedIn/);
  assert.doesNotMatch(networking, /CLEAR_QUEUE_SOP/);
});

test('compact ingest projectors stay list-sized', async () => {
  const rss = parseEuraxessRss(`
    <rss><channel>
      <item><title>PhD fusion</title><link>https://euraxess.ec.europa.eu/jobs/42</link>
      <description>DAQ</description><dc:creator>ITER</dc:creator></item>
    </channel></rss>`);
  const euraxess = projectEuraxessItem(rss[0]);
  assert.equal(euraxess.source, 'euraxess');
  assert.equal(euraxess.id, 'euraxess-42');
  assert.ok(!('description_html' in euraxess));

  const fusion = projectFusionJob({
    title: 'Diagnostics Engineer',
    url: 'https://jobs.ashbyhq.com/helion/abc',
    company: 'Helion Energy',
    location: 'Everett, WA',
  }, { id: 'org-helion', name: 'Helion Energy' });
  assert.equal(fusion.source, 'fusion');
  assert.equal(fusion.org_id, 'org-helion');

  const umichHtml = `<table><tr><td>01/02/2026</td><td><a href="/job_detail/123">Lab Engineer</a></td><td>123</td><td>Engineering</td><td>Ann Arbor</td></tr></table>`;
  const umich = parseUmichListingHtml(umichHtml).map(projectUmichRow);
  assert.equal(umich[0].source, 'umich');
  assert.equal(umich[0].id, 'umich-123');

  const sitemap = parsePhdscannerSitemap('<urlset><loc>https://www.phdscanner.com/opportunities/phd-vacancies-epfl-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</loc></urlset>');
  const listing = parsePhdscannerListingCards('<a href="/opportunities/phd-vacancies-epfl-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"><h3>Funded PhD</h3></a>');
  assert.equal(projectPhdscannerItem(sitemap[0]).source, 'phdscanner');
  assert.equal(projectPhdscannerItem(listing[0]).title, 'Funded PhD');

  const match = fusionTitleFilter({
    title_filter: { positive: ['fusion', 'diagnos'], negative: ['sales'] },
  });
  assert.equal(match('Plasma diagnostics'), true);
  assert.equal(match('Account executive sales'), false);
});

test('logout clears the session cookie', async () => {
  const { app } = await setup();
  const cookie = await register(app, 'logout@example.com');
  const me = await app.request('/api/me', { headers: { cookie } });
  assert.equal(me.status, 200);
  const out = await app.request('/logout', { method: 'POST', headers: { cookie } });
  assert.equal(out.status, 302);
  const gone = await app.request('/api/me', { headers: { cookie } });
  assert.equal(gone.status, 401);
});

test('privacy and terms are public', async () => {
  const { app } = await setup();
  const privacy = await app.request('/privacy');
  assert.equal(privacy.status, 200);
  assert.match(await privacy.text(), /Privacy/);
  const terms = await app.request('/terms');
  assert.equal(terms.status, 200);
  assert.match(await terms.text(), /Terms/);
});

test('rule scores prefer fusion diagnostics titles', () => {
  const hot = ruleScore({ title: 'Plasma diagnostics FPGA DAQ', institution: 'ITER' }, {});
  const cold = ruleScore({ title: 'Account executive sales', institution: 'Acme' }, {});
  assert.ok(hot.score > cold.score);
  assert.ok(hot.hits.includes('plasma'));
});

test('CV text stays in the owner workspace and export/delete work', async () => {
  const { db, app } = await setup();
  const cookieA = await register(app, 'cv-a@example.com');
  const cookieB = await register(app, 'cv-b@example.com');

  const save = await app.request('/api/profile', {
    method: 'POST',
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({
      display_name: 'Ada',
      cv_text: 'Ada private CV FPGA',
      keywords: 'FPGA',
      digest_enabled: true,
    }),
  });
  const saved = await save.json();
  assert.equal(save.status, 200, JSON.stringify(saved));
  assert.equal(saved.profile.cv_text, 'Ada private CV FPGA');

  const exportA = await app.request('/api/export', { headers: { cookie: cookieA } });
  const dump = await exportA.json();
  assert.equal(dump.profile.cv_text, 'Ada private CV FPGA');
  assert.equal(dump.user.email, 'cv-a@example.com');

  const profileB = await app.request('/profile', { headers: { cookie: cookieB } });
  const htmlB = await profileB.text();
  assert.doesNotMatch(htmlB, /Ada private CV FPGA/);

  const feed = await app.request('/api/feeds/euraxess', { headers: { cookie: cookieA } });
  const feedBody = await feed.json();
  const job = feedBody.jobs.find(row => row.id === 'euraxess-fusion-demo-1');
  assert.ok(job.fit_score >= 1);

  const recipients = await listDigestRecipients(db);
  assert.ok(recipients.some(row => row.email === 'cv-a@example.com'));
  assert.equal(recipients.some(row => row.email === 'cv-b@example.com'), false);

  const denied = await app.request('/api/account/delete', {
    method: 'POST',
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ confirm: 'nope' }),
  });
  assert.equal(denied.status, 400);

  const gone = await app.request('/api/account/delete', {
    method: 'POST',
    headers: jsonHeaders(cookieA),
    body: JSON.stringify({ confirm: 'DELETE' }),
  });
  const goneBody = await gone.json();
  assert.equal(gone.status, 200, JSON.stringify(goneBody));

  const me = await app.request('/api/me', { headers: { cookie: cookieA } });
  assert.equal(me.status, 401);

  const afterDelete = await listDigestRecipients(db);
  assert.equal(afterDelete.some(row => row.email === 'cv-a@example.com'), false);

  assert.equal(isSnapshotSafeTable('workspace_profiles'), false);
  assert.deepEqual(
    filterSnapshotPayload({ catalog_jobs: [1], cv: 'secret', profiles: [{}] }),
    { catalog_jobs: [1] },
  );
});

