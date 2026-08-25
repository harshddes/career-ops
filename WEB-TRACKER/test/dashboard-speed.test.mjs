import './live-env.mjs';

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ActionPlanStore } from '../lib/action-plan.mjs';
import {
  jsonByteLength,
  maybeProjectFeed,
  projectEuraxessListStore,
  requestWantsFullView,
  requestWantsListView,
} from '../lib/feed-list-projection.mjs';
import { writeLiveCollection, resetLiveMemoryForTests } from '../lib/db.mjs';
import { resetLiveNormalizedCache } from '../lib/live-collection.mjs';
import { startFastServer } from '../server-fast.mjs';
import { startServer } from '../server.mjs';
import { syncEuraxessOpportunitiesToDashboard } from '../lib/euraxess/opportunity-store.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_HTML = join(ROOT, '..', 'dashboard', 'fusion-pivot-dashboard.html');
const ACTION_PLAN_FILE = join(ROOT, '..', 'data', 'action-plan.json');

function fatEuraxessStore(count = 24) {
  return {
    version: 1,
    generated_at: '2026-08-24T00:00:00.000Z',
    scan_summary: { total_count: count },
    opportunities: Array.from({ length: count }, (_, index) => ({
      id: `euraxess-fusion-${2000 + index}`,
      title: `Plasma diagnostics posting ${index}`,
      institution: 'ITER Organization',
      summary: 'x'.repeat(4000),
      fit_rationale: `Long rationale ${'fusion plasma FPGA DAQ '.repeat(40)}`,
      score: 4.2,
      visible: true,
      archived: false,
      coverage: { dump: 'y'.repeat(2000) },
      decision: { rationale: 'z'.repeat(2000) },
    })),
  };
}

function timed(ms) {
  return Date.now() - ms;
}

test('list view is the default and full blobs stay opt-in', () => {
  assert.equal(requestWantsListView({ url: '/api/euraxess/opportunities' }), true);
  assert.equal(requestWantsListView({ query: { view: 'list' } }), true);
  assert.equal(requestWantsFullView({ query: { view: 'full' } }), true);
  assert.equal(requestWantsListView({ query: { view: 'full' } }), false);

  const full = fatEuraxessStore(20);
  const listed = maybeProjectFeed({ url: '/api/euraxess/opportunities' }, full, projectEuraxessListStore);
  assert.equal(listed.view, 'list');
  assert.ok(!('coverage' in listed.opportunities[0]));
  assert.ok(jsonByteLength(listed) * 3 < jsonByteLength(full));
});

test('sync to dashboard is read-only unless write:true', () => {
  const dir = mkdtempSync(join(tmpdir(), 'euraxess-sync-'));
  const sourcePath = join(dir, 'source.json');
  const outputPath = join(dir, 'dashboard.json');
  writeFileSync(sourcePath, `${JSON.stringify(fatEuraxessStore(2))}\n`);
  const dry = syncEuraxessOpportunitiesToDashboard({ sourcePath, outputPath, write: false });
  assert.equal(dry.opportunities.length, 2);
  assert.equal(existsSync(outputPath), false);
  const written = syncEuraxessOpportunitiesToDashboard({ sourcePath, outputPath, write: true });
  assert.equal(written.opportunities[0].id, 'euraxess-fusion-2000');
  assert.match(readFileSync(outputPath, 'utf-8'), /euraxess-fusion-2000/);
});

test('atomic writes never sleep the HTTP thread', () => {
  const src = readFileSync(join(ROOT, '..', 'lib', 'atomic-write.mjs'), 'utf-8');
  assert.doesNotMatch(src, /Atomics\.wait/);
  assert.match(src, /JSON\.stringify\(value\)/);
});

test('factory run routes queue a worker instead of blocking the HTTP process', () => {
  const serverSrc = readFileSync(join(ROOT, '..', 'server.mjs'), 'utf-8');
  assert.match(serverSrc, /app\.post\('\/api\/euraxess\/factory\/run'/);
  assert.match(serverSrc, /res\.status\(202\)\.json\(\{ job, queued: true \}\)/);
  assert.match(serverSrc, /spawnNodeJob/);
  assert.match(serverSrc, /euraxess-factory-worker\.mjs/);
});

test('dashboard HTML uses list jobs fetch, optimistic Done, and queued factory', () => {
  const html = readFileSync(DASHBOARD_HTML, 'utf-8');
  assert.match(html, /\/api\/jobs-to-consider\?view=list/);
  assert.match(html, /pendingActionPlanSaves/);
  assert.match(html, /pendingEuraxessSaves/);
  assert.match(html, /shouldSkipDashboardSseRefresh/);
  assert.match(html, /result\.queued/);
  assert.match(html, /patchCachedOpportunity/);
  assert.match(html, /event-loop-health/);
  assert.match(html, /function formatEasternLongDate/);
  assert.match(html, /plan\?\.top_three/);
});

test('EURAXESS PATCH does not dual-write dashboard JSON', () => {
  const serverSrc = readFileSync(join(ROOT, '..', 'server.mjs'), 'utf-8');
  const patch = serverSrc.match(/app\.patch\('\/api\/euraxess\/opportunities\/:id', \(req, res\) => \{[\s\S]*?\n\}\);/);
  assert.ok(patch);
  assert.doesNotMatch(patch[0], /syncEuraxessOpportunitiesToDashboard/);
});

test('optional limit pages the list projection', () => {
  const full = fatEuraxessStore(20);
  const paged = maybeProjectFeed({ url: '/api/euraxess/opportunities?limit=48' }, full, projectEuraxessListStore);
  assert.equal(paged.opportunities.length, 20);
  assert.equal(paged.page.total, 20);
  const small = maybeProjectFeed({ url: '/api/euraxess/opportunities?limit=5&offset=2' }, full, projectEuraxessListStore);
  assert.equal(small.opportunities.length, 5);
  assert.equal(small.page.offset, 2);
  assert.equal(small.page.total, 20);
});

test('fast server healthz reports event-loop delay and default list EURAXESS', async () => {
  const server = await startFastServer(0, '127.0.0.1');
  try {
    const { port } = server.address();
    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(typeof body.eventLoopDelay?.p99_ms, 'number');
    assert.equal(typeof body.liveStore?.engine, 'string');

    const listRes = await fetch(`http://127.0.0.1:${port}/api/euraxess/opportunities`);
    const listBody = await listRes.json();
    assert.equal(listRes.status, 200);
    assert.equal(listBody.view, 'list');
    assert.equal(Array.isArray(listBody.opportunities), true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('PATCH action-plan and EURAXESS stay under 50ms; smtp-status stays hot during PATCH', async () => {
  process.env.PUBLISH_SNAPSHOT = '1';
  process.env.CAREER_OPS_SKIP_WATCHERS = '1';
  resetLiveMemoryForTests();
  resetLiveNormalizedCache();
  writeLiveCollection('euraxess_opportunities', fatEuraxessStore(8));

  const planDir = mkdtempSync(join(tmpdir(), 'action-plan-speed-'));
  const planStore = new ActionPlanStore(join(planDir, 'action-plan.json'));
  const planT0 = Date.now();
  planStore.updateTask('daily-one-outreach', 'waiting', { waiting_on: 'speed-test' }, new Date('2026-08-24T12:00:00.000Z'));
  assert.ok(timed(planT0) < 50, `local action-plan write took ${timed(planT0)}ms`);

  const hadPlan = existsSync(ACTION_PLAN_FILE);
  const originalPlan = hadPlan ? readFileSync(ACTION_PLAN_FILE, 'utf-8') : '';
  const server = await startServer(0, '127.0.0.1');
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;
    await fetch(`${base}/api/daily-digest/smtp-status`);
    await fetch(`${base}/api/euraxess/opportunities/euraxess-fusion-2000`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ notes: 'warmup' }),
    });

    const samples = [];
    for (let i = 0; i < 5; i += 1) {
      const t0 = Date.now();
      const smtpPromise = fetch(`${base}/api/daily-digest/smtp-status`).then(async res => {
        const smtpMs = timed(t0);
        const smtp = await res.json();
        return { smtpMs, ok: res.status === 200, hasHint: Boolean(smtp.setup_hint || smtp.ok === true || smtp.ok === false) };
      });
      const patchRes = await fetch(`${base}/api/euraxess/opportunities/euraxess-fusion-2000`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notes: `speed-${i}` }),
      });
      const patchMs = timed(t0);
      assert.equal(patchRes.status, 200, await patchRes.text());
      const smtp = await smtpPromise;
      assert.equal(smtp.ok, true);
      assert.ok(smtp.smtpMs < 50, `smtp-status waited ${smtp.smtpMs}ms during PATCH`);
      samples.push(patchMs);
    }

    const actionT0 = Date.now();
    const actionRes = await fetch(`${base}/api/action-plan/daily-one-outreach`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'waiting', waiting_on: 'speed-test' }),
    });
    const actionMs = timed(actionT0);
    assert.equal(actionRes.status, 200, await actionRes.text());
    assert.ok(actionMs < 50, `action-plan PATCH took ${actionMs}ms`);

    samples.sort((a, b) => a - b);
    const p95 = samples[Math.max(0, samples.length - 1)];
    assert.ok(p95 < 50, `EURAXESS PATCH p95 ${p95}ms samples=${samples.join(',')}`);
  } finally {
    if (hadPlan) writeFileSync(ACTION_PLAN_FILE, originalPlan);
    await new Promise(resolve => server.close(resolve));
  }
});
