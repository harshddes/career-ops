import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  getCachedTodayActivity,
  getTodayActivity,
  invalidateTodayActivityCache,
} from '../lib/today-activity.mjs';
import {
  invalidateResearchProspectReadCache,
  isUserStateOnlyPatch,
  patchResearchProspect,
} from '../lib/research-prospect-store.mjs';

const TZ = 'America/New_York';
const DATE = '2026-08-12';

function emptyInputs(overrides = {}) {
  return {
    date: DATE,
    timeZone: TZ,
    applications: [],
    researchProspects: [],
    networking: { people: [], interactions: [] },
    followups: [],
    ...overrides,
  };
}

test('followed today counts last_followed_up even after status leaves followed_up', () => {
  const activity = getTodayActivity(emptyInputs({
    researchProspects: [{
      id: 'jorns',
      name: 'Benjamin Jorns',
      status: 'responded_positive',
      last_contacted: DATE,
      last_followed_up: DATE,
      source_label: 'U-M Research',
    }],
  }));
  assert.equal(activity.summary.followed_today, 1);
  assert.equal(activity.summary.contacted_today, 1);
  assert.equal(activity.details.followed_today[0].title, 'Benjamin Jorns');
});

test('followed today matches followed_up without requiring retired follow_up status', () => {
  const followed = getTodayActivity(emptyInputs({
    researchProspects: [{
      id: 'krushelnick',
      name: 'Karl Krushelnick',
      status: 'followed_up',
      last_followed_up: DATE,
      source_label: 'U-M Research',
    }],
  }));
  assert.equal(followed.summary.followed_today, 1);

  const legacyStatusOnly = getTodayActivity(emptyInputs({
    researchProspects: [{
      id: 'legacy',
      name: 'Legacy Status',
      status: 'follow_up',
      last_followed_up: '',
      source_label: 'U-M Research',
    }],
  }));
  assert.equal(legacyStatusOnly.summary.followed_today, 0);
});

test('contacted then followed up the same day increments both counters', () => {
  const activity = getTodayActivity(emptyInputs({
    researchProspects: [{
      id: 'same-day',
      name: 'Same Day',
      status: 'followed_up',
      last_contacted: DATE,
      last_followed_up: DATE,
      source_label: 'U-M Research',
    }],
  }));
  assert.equal(activity.summary.contacted_today, 1);
  assert.equal(activity.summary.followed_today, 1);
});

test('networking outbound follow_up increments followed today', () => {
  const activity = getTodayActivity(emptyInputs({
    networking: {
      people: [{
        id: 'net-1',
        display_name: 'Networking Contact',
        current_organization: 'Helion',
        email: 'net@example.com',
        relationship_stage: 'contacted',
      }],
      interactions: [{
        person_id: 'net-1',
        type: 'follow_up',
        direction: 'outbound',
        channel: 'email',
        occurred_at: '2026-08-12T16:00:00.000Z',
        summary: 'Sent follow-up',
      }],
    },
  }));
  assert.equal(activity.summary.followed_today, 1);
  assert.equal(activity.details.followed_today[0].source, 'Networking');
  assert.equal(activity.details.followed_today[0].title, 'Networking Contact');
});

test('networking outbound first touch increments contacted today', () => {
  const activity = getTodayActivity(emptyInputs({
    networking: {
      people: [{
        id: 'net-2',
        display_name: 'First Touch',
        current_organization: 'CFS',
        relationship_stage: 'contacted',
      }],
      interactions: [{
        person_id: 'net-2',
        type: 'email',
        direction: 'outbound',
        channel: 'email',
        occurred_at: '2026-08-12T16:00:00.000Z',
        summary: 'Intro email',
      }],
    },
  }));
  assert.equal(activity.summary.contacted_today, 1);
  assert.equal(activity.summary.followed_today, 0);
});

test('today activity cache returns the same snapshot until invalidated', () => {
  invalidateTodayActivityCache();
  const first = getCachedTodayActivity({ date: DATE, timeZone: TZ });
  const second = getCachedTodayActivity({ date: DATE, timeZone: TZ });
  assert.equal(first, second);
  invalidateTodayActivityCache();
  const third = getCachedTodayActivity({ date: DATE, timeZone: TZ });
  assert.notEqual(first, third);
  assert.equal(third.date, DATE);
  invalidateTodayActivityCache();
});

test('user-state-only patches are detected without treating evidence as user state', () => {
  assert.equal(isUserStateOnlyPatch({ status: 'followed_up', last_followed_up: DATE, outreach: { stage: 'your_move' } }), true);
  assert.equal(isUserStateOnlyPatch({ status: 'followed_up', score: 4.8 }), false);
  assert.equal(isUserStateOnlyPatch({}), false);
});

test('user-state-only patch does not rewrite a large canonical prospects fixture', () => {
  const dir = mkdtempSync(join(tmpdir(), 'prospects-skip-write-'));
  const canonical = join(dir, 'umich-research-prospects.json');
  const userState = join(dir, 'user-state.json');
  const padding = 'x'.repeat(2500);
  const prospects = Array.from({ length: 60 }, (_, i) => ({
    id: `p-${i}`,
    name: i === 0 ? 'Fixture Person' : `Person ${i}`,
    title: 'Professor',
    department: 'Nuclear Engineering and Radiological Sciences',
    status: 'not_contacted',
    score: 3.1,
    fit_rationale: padding,
    evidence: [{ type: 'source', label: 'test', url: 'https://example.test/p', date: '2026-08-01' }],
  }));
  const fixture = {
    version: 1,
    generated_at: '2026-08-01T00:00:00.000Z',
    scope: 'test fixture',
    prospects,
  };
  writeFileSync(canonical, `${JSON.stringify(fixture, null, 2)}\n`);
  const before = readFileSync(canonical, 'utf-8');
  const beforeStat = statSync(canonical);
  invalidateResearchProspectReadCache(canonical);

  const result = patchResearchProspect('p-0', {
    status: 'followed_up',
    last_followed_up: DATE,
  }, { canonicalFile: canonical, userStateFile: userState });

  assert.equal(result.wrote_canonical, false);
  assert.equal(result.prospect.status, 'followed_up');
  assert.equal(statSync(canonical).mtimeMs, beforeStat.mtimeMs);
  assert.equal(readFileSync(canonical, 'utf-8'), before);
  const overlay = JSON.parse(readFileSync(userState, 'utf-8'));
  assert.equal(overlay.sources.umich['p-0'].status, 'followed_up');
  rmSync(dir, { recursive: true, force: true });
});

test('kanban mutations paint daily stats from the same response', () => {
  const html = readFileSync(new URL('../dashboard/fusion-pivot-dashboard.html', import.meta.url), 'utf-8');
  assert.match(html, /async function euraxessApplyOpportunity[\s\S]*applyTodayFromResponse\(result\)/);
  assert.match(html, /async function phdscannerApplyOpportunity[\s\S]*applyTodayFromResponse\(result\)/);
  assert.match(html, /async function moveNetworkingPersonStage[\s\S]*applyTodayFromResponse\(result\)/);
  assert.match(html, /async function logNetworkingInteraction[\s\S]*applyTodayFromResponse\(result\)/);
  assert.match(html, /id="today-stats-date"/);
  assert.match(html, /function shiftTodayStatsDate/);
  assert.match(html, /queuePulseLocalRender/);
  assert.match(html, /syncPhdRadarTimer/);
  assert.match(html, /queueVisibleDashboardRefresh\(\)/);
  assert.doesNotMatch(html, /queueRenderAllPanels\(\);/);
  assert.match(html, /skipCache: true/);
  assert.doesNotMatch(html, /lastTodaySummary = null;\s*syncTodayStatsNav/);
});

test('today-activity GET does not write CSV and uses the in-memory cache', () => {
  const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf-8');
  assert.match(source, /getCachedTodayActivity/);
  assert.match(source, /invalidateTodayActivityCache/);
  assert.match(source, /function todaySnapshotForResponse\(\) \{\s*invalidateTodayActivityCache\(\);/);
  const todayGet = source.match(/app\.get\('\/api\/today-activity', \(req, res\) => \{[\s\S]*?\n\}\);/);
  assert.ok(todayGet);
  assert.match(todayGet[0], /getCachedTodayActivity/);
  assert.doesNotMatch(todayGet[0], /writeDailyActivityCsv/);

  const fast = readFileSync(new URL('../server-fast.mjs', import.meta.url), 'utf-8');
  const fastGet = fast.match(/if \(pathname === '\/api\/today-activity'\) \{[\s\S]*?return true;\s*\}/);
  assert.ok(fastGet);
  assert.match(fastGet[0], /getCachedTodayActivity/);
  assert.doesNotMatch(fastGet[0], /today-activity\.json/);
  assert.doesNotMatch(fastGet[0], /writeDailyActivityCsv/);
});
