import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.mjs';
import { applySchema, createPgliteDb } from '../src/db.mjs';
import { readOverlayDirect } from '../src/catalog.mjs';

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
    headers: {
      cookie: cookieA,
      'content-type': 'application/json',
      accept: 'application/json',
    },
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
