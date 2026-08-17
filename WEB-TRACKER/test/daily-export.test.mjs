import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildExportBuffer, buildExportData } from '../lib/dashboard-export.mjs';
import { buildDailyDigest } from '../lib/daily-digest.mjs';
import { smtpConfigFromEnv, validateSmtpConfig } from '../lib/mail-sender.mjs';
import { dateOnly, digestRecipients, localDateString } from '../lib/today-activity.mjs';
import { appendActivityEvent, readActivityEvents } from '../lib/activity-log.mjs';
import { appendDailyActivityCsvRow, dailyActivityCsvPath } from '../lib/daily-activity-csv.mjs';
import { deleteConsiderJob, readConsiderJobs, upsertConsiderJob, writeConsiderJobs } from '../lib/jobs-to-consider-store.mjs';
import { patchResearchProspect, readResearchProspects, writeResearchProspects } from '../lib/research-prospect-store.mjs';

test('uses the configured timezone for today boundaries', () => {
  assert.equal(dateOnly('2026-06-30T03:30:00.000Z', 'America/New_York'), '2026-06-29');
  assert.equal(localDateString(new Date('2026-06-30T03:30:00.000Z'), 'UTC'), '2026-06-30');
});

test('deduplicates digest recipients from environment', () => {
  assert.deepEqual(
    digestRecipients({ DAILY_DIGEST_RECIPIENTS: 'harsh@example.com, harsh@example.com;harshddes@gmail.com' }),
    ['harsh@example.com', 'harshddes@gmail.com']
  );
});

test('falls back to default digest inboxes when env and profile are unset', () => {
  const recipients = digestRecipients({});
  assert.ok(recipients.includes('harshddes@gmail.com'));
  assert.ok(recipients.includes('desaienggworks@gmail.com'));
  assert.ok(recipients.includes('namrataprayaan@gmail.com'));
});

test('validates generic SMTP configuration without sending mail', () => {
  const config = smtpConfigFromEnv({
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'apikey',
    SMTP_PASS: 'secret',
    SMTP_FROM: 'Career Ops <career@example.com>',
    DAILY_DIGEST_RECIPIENTS: 'harsh@example.com',
  });
  assert.equal(validateSmtpConfig(config).ok, true);
  assert.equal(config.secure, false);
  assert.equal(config.requireTLS, true);
});

test('builds export data and buffers for today activity', async () => {
  const data = buildExportData({ scope: 'today-activity', date: '2026-06-30', timeZone: 'America/New_York' });
  assert.equal(data.sheets.length, 6);
  assert.equal(data.sheets[0].name, 'All Dashboard Activity');
  assert.equal(data.sheets[5].name, 'Networking Today');

  const xlsx = await buildExportBuffer({ scope: 'today-activity', format: 'xlsx', date: '2026-06-30', timeZone: 'America/New_York' });
  const csv = await buildExportBuffer({ scope: 'today-activity', format: 'csv', date: '2026-06-30', timeZone: 'America/New_York' });
  assert.equal(xlsx.contentType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(csv.contentType, 'text/csv; charset=utf-8');
  assert.ok(xlsx.buffer.length > 0);
  assert.ok(Buffer.isBuffer(csv.buffer));
});

test('builds daily digest attachments from the same export path', async () => {
  const digest = await buildDailyDigest({ date: '2026-06-30', timeZone: 'America/New_York' });
  assert.match(digest.subject, /2026-06-30/);
  assert.ok(digest.attachments.length >= 2);
  assert.ok(digest.attachments.every(attachment => attachment.content.length > 0));
});

test('stamps contacted and followed-up dates on status changes using Eastern time', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-prospects-'));
  const filePath = join(dir, 'prospects.json');
  const today = localDateString(new Date(), 'America/New_York');
  writeResearchProspects({
    scope: 'Test prospects',
    prospects: [{
      id: 'plasma-lab-contact',
      name: 'Plasma Lab Contact',
      department: 'Space Physics',
      score: 4.2,
      status: 'not_contacted',
    }],
  }, filePath);

  patchResearchProspect('plasma-lab-contact', { status: 'contacted' }, filePath);
  let prospect = readResearchProspects(filePath).prospects[0];
  assert.equal(prospect.last_contacted, today);

  patchResearchProspect('plasma-lab-contact', { status: 'followed_up' }, filePath);
  prospect = readResearchProspects(filePath).prospects[0];
  assert.equal(prospect.last_followed_up, today);

  patchResearchProspect('plasma-lab-contact', { status: 'followed_up' }, filePath);
  prospect = readResearchProspects(filePath).prospects[0];
  assert.equal(prospect.last_followed_up, today);
});

test('research status patch survives API-style read after write', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-api-read-'));
  const filePath = join(dir, 'prospects.json');
  writeResearchProspects({
    scope: 'Test prospects',
    prospects: [{
      id: 'api-read-prof',
      name: 'API Read Professor',
      department: 'Nuclear Engineering',
      score: 4.1,
      status: 'not_contacted',
    }],
  }, filePath);

  patchResearchProspect('api-read-prof', { status: 'followed_up' }, filePath);
  const refreshed = readResearchProspects(filePath).prospects[0];
  assert.equal(refreshed.status, 'followed_up');
  assert.ok(refreshed.last_followed_up);
});

test('keeps an append-only activity log for dashboard actions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-activity-'));
  const filePath = join(dir, 'activity.ndjson');
  appendActivityEvent({
    domain: 'umich_research',
    action: 'research_status_contacted',
    subject_id: 'umich-example',
    subject_label: 'Example Professor',
    status: 'contacted',
    timezone: 'America/New_York',
    occurred_at: '2026-06-30T03:30:00.000Z',
  }, { filePath });

  const events = readActivityEvents({ filePath, date: '2026-06-29', timeZone: 'America/New_York' });
  assert.equal(events.length, 1);
  assert.equal(events[0].domain, 'umich_research');
  assert.equal(events[0].action, 'research_status_contacted');
});

test('appends a daily CSV row with Eastern local_date on activity events', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-csv-'));
  const filePath = join(dir, 'activity.ndjson');
  const event = appendActivityEvent({
    domain: 'phd_options',
    action: 'research_status_follow_up',
    subject_id: 'kth-example',
    subject_label: 'KTH Example',
    company: 'KTH',
    title: 'Professor',
    status: 'follow_up',
    timezone: 'America/New_York',
    local_date: '2026-06-29',
    occurred_at: '2026-06-30T03:30:00.000Z',
  }, { filePath });

  const csvPath = appendDailyActivityCsvRow(event);
  assert.ok(csvPath);
  assert.equal(existsSync(csvPath), true);
  const content = readFileSync(csvPath, 'utf-8');
  assert.match(content, /2026-06-29/);
  assert.match(content, /research_status_follow_up/);
  assert.equal(dailyActivityCsvPath('2026-06-29'), csvPath);
});

test('groups today activity events by action for counting', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-today-count-'));
  const filePath = join(dir, 'activity.ndjson');
  const date = '2099-01-15';
  appendActivityEvent({
    domain: 'umich_research',
    action: 'research_status_contacted',
    subject_id: 'umich-a',
    subject_label: 'Professor A',
    local_date: date,
    timezone: 'America/New_York',
  }, { filePath });
  appendActivityEvent({
    domain: 'phd_options',
    action: 'research_status_follow_up',
    subject_id: 'kth-b',
    subject_label: 'Professor B',
    local_date: date,
    timezone: 'America/New_York',
  }, { filePath });
  appendActivityEvent({
    domain: 'jobs',
    action: 'job_applied',
    subject_id: 'job-1',
    subject_label: 'Helion - Diagnostics',
    local_date: date,
    timezone: 'America/New_York',
  }, { filePath });

  const events = readActivityEvents({ filePath, date, timeZone: 'America/New_York' });
  assert.equal(events.length, 3);
  assert.equal(events.filter(event => event.domain === 'umich_research').length, 1);
  assert.equal(events.filter(event => event.domain === 'phd_options').length, 1);
  assert.equal(events.filter(event => event.domain === 'jobs').length, 1);
  assert.equal(events.filter(event => event.action === 'research_status_contacted').length, 1);
  assert.equal(events.filter(event => event.action === 'research_status_follow_up').length, 1);
  assert.equal(events.filter(event => event.action === 'job_applied').length, 1);
});

test('today tracker folds Networking contacts into Contacted once (no event inflation)', async () => {
  const { getTodayActivity } = await import('../lib/today-activity.mjs');
  const activity = getTodayActivity({ date: '2026-07-26', timeZone: 'America/New_York' });
  assert.ok(activity.details.networking_today, 'networking_today detail section exists');
  assert.equal(activity.summary.networking_today, activity.details.networking_today.length);

  const networkingContacted = activity.details.contacted_today.filter(row => row.source === 'Networking Command Center');
  assert.equal(
    activity.summary.networking_today,
    networkingContacted.length,
    'networking_today equals unique networking people inside contacted_today'
  );

  // One person must not appear twice inside contacted_today.
  const contactedIds = activity.details.contacted_today
    .map(row => String(row.id || row.title || '').toLowerCase())
    .filter(Boolean);
  assert.equal(contactedIds.length, new Set(contactedIds).size);

  const exportData = buildExportData({ scope: 'today-activity', date: '2026-07-26', timeZone: 'America/New_York' });
  assert.ok(exportData.sheets.some(sheet => sheet.name === 'Networking Today'));
  // Flat CSV must not re-list Networking under a second section (Contacted already has them).
  assert.equal(exportData.csvRows.some(row => row.section === 'Networking Today'), false);
  assert.ok(
    exportData.csvRows.some(row => row.section === 'Contacted Today' && row.source === 'Networking Command Center')
      || activity.summary.networking_today === 0
  );
});

test('research refresh preserves user-owned status fields', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-preserve-'));
  const filePath = join(dir, 'prospects.json');
  writeResearchProspects({
    scope: 'Test prospects',
    prospects: [{
      id: 'stable-professor',
      name: 'Stable Professor',
      department: 'Nuclear Engineering',
      score: 4.7,
      status: 'contacted',
      last_contacted: '2026-06-29',
      notes: 'Already emailed.',
    }],
  }, filePath);

  writeResearchProspects({
    scope: 'Test prospects refreshed',
    prospects: [{
      id: 'stable-professor',
      name: 'Stable Professor',
      department: 'Nuclear Engineering',
      score: 4.8,
      status: 'not_contacted',
      notes: '',
    }],
  }, { source: 'test', preserveUserState: true, canonicalFile: filePath });

  const prospect = readResearchProspects(filePath).prospects[0];
  assert.equal(prospect.status, 'contacted');
  assert.equal(prospect.last_contacted, '2026-06-29');
  assert.equal(prospect.notes, 'Already emailed.');
  assert.notEqual(prospect.score, 4.8);
  assert.equal(prospect.legacy_score, '4.8');
  assert.equal(prospect.policy_version, '2026-08-research-contact-v1');
});

test('jobs upsert preserves user-owned applied state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-jobs-preserve-'));
  const filePath = join(dir, 'jobs-to-consider.json');
  writeConsiderJobs({
    jobs: [{
      id: 'helion-diagnostics-engineer',
      company: 'Helion',
      title: 'Diagnostics Engineer',
      status: 'applied',
      applied: true,
      applied_at: '2026-07-01T12:00:00.000Z',
      notes: 'User applied today.',
      score: '4.5',
    }],
  }, filePath);

  upsertConsiderJob({
    id: 'helion-diagnostics-engineer',
    company: 'Helion',
    title: 'Diagnostics Engineer',
    status: 'to_consider',
    applied: false,
    notes: 'Scanner refresh should not wipe applied state.',
    score: '4.6',
  }, filePath);

  const job = readConsiderJobs(filePath).jobs[0];
  assert.equal(job.status, 'applied');
  assert.equal(job.applied, true);
  assert.equal(job.applied_at, '2026-07-01T12:00:00.000Z');
  assert.equal(job.notes, 'User applied today.');
  assert.notEqual(job.score, '4.6/5');
  assert.equal(job.legacy_score, '4.6');
  assert.equal(job.policy_version, '2026-08-unified-v1');
});

test('jobs delete resolves stale dashboard identities safely', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-jobs-delete-'));
  const filePath = join(dir, 'jobs-to-consider.json');
  writeConsiderJobs({
    jobs: [
      {
        id: 'ornl-gro-graduate-research-opportunities',
        company: 'Oak Ridge National Laboratory',
        title: 'Graduate Research Opportunities (GRO)',
        url: 'https://www.ornl.gov/content/graduate-research-ornl',
      },
      {
        id: 'ornl-postdoctoral-research-board',
        company: 'Oak Ridge National Laboratory',
        title: 'Postdoctoral Research (jobs board filter)',
        url: 'https://jobs.ornl.gov/search/?q=postdoctoral&sortColumn=referencedate&sortDirection=desc',
      },
    ],
  }, filePath);

  const byUrl = deleteConsiderJob({
    id: 'stale-rendered-id',
    url: 'https://www.ornl.gov/content/graduate-research-ornl',
  }, filePath);
  assert.equal(byUrl.job.id, 'ornl-gro-graduate-research-opportunities');

  const byCompanyTitle = deleteConsiderJob({
    id: 'oak-ridge-national-laboratory-postdoctoral-research-jobs-board-filter',
    company: 'Oak Ridge National Laboratory',
    title: 'Postdoctoral Research (jobs board filter)',
  }, filePath);
  assert.equal(byCompanyTitle.job.id, 'ornl-postdoctoral-research-board');

  const missing = deleteConsiderJob({ id: 'already-gone' }, filePath, { missingOk: true });
  assert.equal(missing.missing, true);
  assert.equal(readConsiderJobs(filePath).jobs.length, 0);
  assert.throws(() => deleteConsiderJob({ id: 'already-gone' }, filePath), /job not found: already-gone/);
});

test('today summary equals generated detail row counts', () => {
  const data = buildExportData({ scope: 'today-activity', date: '2099-01-15', timeZone: 'America/New_York' });
  const activity = data.activity;
  assert.equal(activity.summary.applied_today, activity.details.applied_today.length);
  assert.equal(activity.summary.contacted_today, activity.details.contacted_today.length);
  assert.equal(activity.summary.followed_today, activity.details.followed_today.length);
  assert.equal(activity.summary.followups_due_today, activity.details.followups_due_today.length);
  assert.equal(activity.summary.networking_today, activity.details.networking_today.length);
});

test('today CSV uses one deduplicated current-state table', async () => {
  const data = buildExportData({ scope: 'today-activity', date: '2099-01-15', timeZone: 'America/New_York' });
  // Networking people live under Contacted — do not add networking_today again.
  const expectedRows = data.activity.summary.applied_today
    + data.activity.summary.contacted_today
    + data.activity.summary.followed_today
    + data.activity.summary.followups_due_today;
  assert.equal(data.csvRows.length, expectedRows);

  const duplicateKeys = new Set();
  for (const row of data.csvRows) {
    const key = [row.section, row.id, row.date, row.status].join('|');
    assert.equal(duplicateKeys.has(key), false);
    duplicateKeys.add(key);
  }

  const csv = await buildExportBuffer({ scope: 'today-activity', format: 'csv', date: '2099-01-15', timeZone: 'America/New_York' });
  const content = csv.buffer.toString('utf-8');
  assert.equal(
    content.split('\n')[0].trim().replaceAll('"', ''),
    'section,date,dashboard_area,type,company_or_institution,title_or_person,status,contact,email,follow_up_date,source,notes,record_id'
  );
  assert.doesNotMatch(content, /All Dashboard Activity/);
});

test('today applied rows come from applications, not jobs-to-consider directly', () => {
  const source = readFileSync(new URL('../lib/today-activity.mjs', import.meta.url), 'utf-8');
  assert.doesNotMatch(source, /readConsiderJobs/);
  assert.doesNotMatch(source, /jobAppliedToday/);
  assert.doesNotMatch(source, /jobRow/);
  assert.match(source, /const appliedFromTracker = resolvedApplications\.filter/);
});

test('manual daily digest route validates recipients and sends regenerated attachments', () => {
  const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf-8');
  assert.match(source, /parseEmailRecipients/);
  assert.match(source, /invalid recipient email/);
  assert.match(source, /recipients: recipients\.length \? recipients : undefined/);
  assert.match(source, /sendDailyDigest\(options\)/);
});

test('research card dropdowns call the save handler instead of map index', () => {
  const html = readFileSync(new URL('../dashboard/fusion-pivot-dashboard.html', import.meta.url), 'utf-8');
  assert.match(html, /return `onchange="\$\{escapeHTML\(handler\)\}"`;/);
  assert.match(html, /visible\.map\(prospect => prospectCard\(prospect\)\)\.join\(''\)/);
  assert.doesNotMatch(html, /shown\.map\(prospectCard\)\.join\(''\)/);
});

test('dashboard client has resilience guards for scroll, fetch, and lazy boot', () => {
  const html = readFileSync(new URL('../dashboard/fusion-pivot-dashboard.html', import.meta.url), 'utf-8');
  assert.match(html, /apiInflightGet/);
  assert.match(html, /fetchWithTimeout/);
  assert.match(html, /LIVE_JOBS_SCROLL_STORAGE_KEY/);
  assert.match(html, /visibilitychange/);
  assert.match(html, /pagehide/);
  assert.match(html, /pageshow/);
  assert.match(html, /renderInitialDashboard\(\)/);
  assert.doesNotMatch(html, /renderAllPanels\(\);\s*renderTodayActivityTracker\(\);/);
});

test('server exposes lightweight health and heartbeat-backed SSE', () => {
  const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf-8');
  assert.match(source, /app\.get\('\/healthz'/);
  assert.match(source, /SSE_HEARTBEAT_MS/);
  assert.match(source, /: keep-alive/);
  assert.match(source, /no-cache, must-revalidate/);
  assert.match(source, /server\.requestTimeout = 0/);
});

test('Windows launcher detaches dashboard and health-checks startup', () => {
  const source = readFileSync(new URL('../../Launch-CareerOps-Dashboard.cmd', import.meta.url), 'utf-8');
  assert.match(source, /Start-Process/);
  assert.match(source, /dashboard\.out\.log/);
  assert.match(source, /dashboard\.err\.log/);
  assert.match(source, /\/healthz/);
  assert.match(source, /--no-open/);
  assert.match(source, /DASHBOARD_URL=http:\/\/127\.0\.0\.1:3737\/dashboard\/fusion-pivot-dashboard\.html/);
  assert.match(source, /HOST='%DASHBOARD_HOST%'/);
  assert.match(source, /PORT='%DASHBOARD_PORT%'/);
  assert.match(source, /:replace_stale_dashboard_process/);
  assert.match(source, /Stop-Process -Id \$ownerPid -Force/);
  assert.match(source, /:write_port_owner_pid/);
  assert.match(source, /I will not stop unrelated processes automatically/);
});

test('Windows autostart paths use the fixed-port launcher', () => {
  const startup = readFileSync(new URL('../scripts/install-user-startup.ps1', import.meta.url), 'utf-8');
  const task = readFileSync(new URL('../scripts/register-windows-task.ps1', import.meta.url), 'utf-8');
  assert.match(startup, /Launch-CareerOps-Dashboard\.cmd/);
  assert.match(startup, /--no-open/);
  assert.match(startup, /CAREER_OPS_ROOT/);
  assert.doesNotMatch(startup, /node run\.mjs/);
  assert.match(task, /Launch-CareerOps-Dashboard\.cmd/);
  assert.match(task, /--no-open/);
  assert.match(task, /New-ScheduledTaskAction -Execute \$cmd/);
  assert.doesNotMatch(task, /Get-Command node/);
  assert.match(task, /CareerOpsGithubSync/);
  assert.match(task, /Daily -At 11:50pm/);
  assert.match(task, /push-local-to-github\.cmd/);
  assert.match(task, /StartWhenAvailable = \$false/);
});
