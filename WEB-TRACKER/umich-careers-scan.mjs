#!/usr/bin/env node
/**
 * umich-careers-scan.mjs — University of Michigan Careers scanner
 *
 * Modes (mutually exclusive; --discover is the default):
 *   --discover            Page-1 sweep of the F and P catalogs for new job IDs.
 *                         Hydrates details for new postings only. Never closes.
 *   --full                Complete F/P inventory reconciliation. Closure only
 *                         happens after two consecutive complete crawls miss a
 *                         posting AND per-type counts match the landing page.
 *   --details             Rolling detail refresh for the stalest open postings.
 *   --rescore             Rescore the existing store (no network).
 *
 * Options:
 *   --max-details N       Cap detail hydrations this run (default 900 full / 120 discover / 80 details)
 *   --dry-run             Fetch and report without writing
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  crawlCatalog,
  crawlCatalogType,
  fetchLandingCounts,
  hydrateDetails,
} from './lib/umich-careers/source-adapter.mjs';
import {
  mergeUmichCrawl,
  patchUmichOpportunity,
  readUmichOpportunities,
  rescoreUmichOpportunities,
  syncUmichOpportunitiesToDashboard,
  writeUmichOpportunities,
} from './lib/umich-careers/opportunity-store.mjs';
import { loadRegistry, loadState, recordPollResult, saveState } from './lib/cadence-engine.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(BASE, 'data');
const RUNTIME_DIR = join(BASE, 'runtime');
const EVENT_QUEUE = join(DATA_DIR, 'event-queue.ndjson');
const LOCK_FILE = join(RUNTIME_DIR, 'umich-careers-scan.lock');
const LOCK_TTL_MS = 2 * 60 * 60_000;
const SOURCE_ID = 'umich-careers';

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(RUNTIME_DIR, { recursive: true });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MODE = args.includes('--full') ? 'full'
  : args.includes('--details') ? 'details'
    : args.includes('--rescore') ? 'rescore'
      : 'discover';
const maxDetailsIdx = args.indexOf('--max-details');
const MAX_DETAILS = maxDetailsIdx !== -1
  ? Number(args[maxDetailsIdx + 1])
  : (MODE === 'full' ? 900 : MODE === 'details' ? 80 : 120);

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

/** Atomic exclusive PID lock with stale-lock recovery. */
function acquireLock() {
  if (DRY_RUN) return () => {};
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }), { flag: 'wx' });
      return () => {
        try { unlinkSync(LOCK_FILE); } catch {}
      };
    } catch (err) {
      if (err?.code !== 'EEXIST') throw err;
      let stale = true;
      try {
        const lock = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
        const ageMs = Date.now() - new Date(lock.started).getTime();
        stale = !Number.isFinite(ageMs) || ageMs > LOCK_TTL_MS || !pidAlive(Number(lock.pid));
      } catch {
        stale = true;
      }
      if (!stale) throw new Error('U-M Careers scan already running; lock is fresh and its process is alive.');
      try { unlinkSync(LOCK_FILE); } catch {}
    }
  }
  throw new Error('U-M Careers scan could not acquire lock after stale-lock recovery.');
}

function queueDiscoveryEvent(newOpportunities = []) {
  const priority = newOpportunities.filter(item => ['apply_now', 'high_relevance'].includes(item.segment));
  if (!priority.length || DRY_RUN) return;
  appendFileSync(EVENT_QUEUE, `${JSON.stringify({
    type: 'new_umich_careers_opportunities',
    source_id: SOURCE_ID,
    source: SOURCE_ID,
    count: priority.length,
    timestamp: new Date().toISOString(),
    opportunity_ids: priority.map(item => item.id).slice(0, 20),
    titles: priority.map(item => item.title).slice(0, 5),
  })}\n`);
}

function recordCadence({ changed, status, newCount, error }) {
  if (DRY_RUN) return;
  try {
    const registry = loadRegistry();
    if (!registry.sources.some(source => source.id === SOURCE_ID)) return;
    const state = loadState();
    recordPollResult(state, SOURCE_ID, {
      changed,
      status,
      new_count: newCount,
      error: error || '',
      provider: 'direct_html_browse',
      access_status: error ? 'error' : 'ok',
    });
    // run.mjs owns the schedule; keep next_poll advisory only.
    state.sources[SOURCE_ID].next_poll = new Date(Date.now() + 15 * 60_000).toISOString();
    saveState(state);
  } catch (err) {
    console.warn(`[umich-scan] cadence state update failed: ${err.message}`);
  }
}

async function hydrateAndMerge(rows, { completeCrawl, scanHealth, landing }) {
  const existing = readUmichOpportunities();
  const known = new Map(existing.opportunities.map(item => [item.job_id, item]));

  const needsDetail = rows.filter(row => {
    const prev = known.get(row.job_id);
    return !prev || !prev.detail_fetched_at;
  }).slice(0, MAX_DETAILS);

  console.log(`[umich-scan] Hydrating ${needsDetail.length} detail page(s) (cap ${MAX_DETAILS})...`);
  const { details, failures } = await hydrateDetails(needsDetail, {
    onDetail: ({ job_id: jobId, ok }) => {
      if (!ok) console.log(`  detail failed: ${jobId}`);
    },
  });

  if (DRY_RUN) {
    console.log(`[umich-scan] (dry run) would merge ${rows.length} row(s), ${details.size} detail(s), ${failures.length} failure(s)`);
    return { newOpportunities: [], closedCount: 0, detailFailures: failures.length };
  }

  const { store, newOpportunities, closedCount } = mergeUmichCrawl(rows, details, {
    completeCrawl,
    scanHealth: {
      ...scanHealth,
      detail_failures: failures.length,
      landing_counts: landing ? { fullTime: landing.fullTime, partTime: landing.partTime } : (scanHealth.landing_counts || {}),
    },
  });

  for (const failure of failures) {
    try {
      patchUmichOpportunity(`umich-careers-${failure.job_id}`, { detail_error: failure.error });
    } catch {}
  }

  syncUmichOpportunitiesToDashboard();
  queueDiscoveryEvent(newOpportunities);
  return {
    newOpportunities,
    closedCount,
    detailFailures: failures.length,
    totals: store.scan_health,
  };
}

async function runDiscover() {
  const started = new Date().toISOString();
  console.log('[umich-scan] Discovery sweep: page 1 of F and P catalogs...');
  const rows = [];
  const errors = [];
  for (const type of ['F', 'P']) {
    const result = await crawlCatalogType(type, { maxPages: 1 });
    rows.push(...result.rows);
    errors.push(...result.errors);
  }
  if (!rows.length) {
    throw new Error(`discovery parsed zero rows — ${errors.join('; ') || 'markup change suspected'}`);
  }
  const result = await hydrateAndMerge(rows, {
    completeCrawl: false,
    scanHealth: {
      status: errors.length ? 'partial' : 'ok',
      last_mode: 'discover',
      last_started: started,
      last_success: errors.length ? '' : new Date().toISOString(),
      last_error: errors.join('; '),
      errors: errors.slice(0, 10),
    },
  });
  console.log(`[umich-scan] Discovery: ${rows.length} row(s) on page 1, ${result.newOpportunities.length} new posting(s).`);
  return { changed: result.newOpportunities.length > 0, newCount: result.newOpportunities.length, error: errors.join('; ') };
}

async function runFull() {
  const started = new Date().toISOString();
  console.log('[umich-scan] Full reconciliation: landing counts + complete F/P crawl...');
  const landing = await fetchLandingCounts();
  if (!landing.ok) console.warn(`[umich-scan] Landing counts unavailable: ${landing.error}`);

  const crawl = await crawlCatalog({
    onPage: ({ type, path, rowCount }) => console.log(`  ${type} ${path}: ${rowCount} rows`),
  });

  const countsReconciled = landing.ok
    && crawl.complete
    && crawl.countsByType.F === landing.fullTime
    && crawl.countsByType.P === landing.partTime;
  const completeCrawl = crawl.complete && countsReconciled;

  const errors = [...crawl.errors];
  if (landing.ok && crawl.complete && !countsReconciled) {
    errors.push(`count mismatch: crawled F=${crawl.countsByType.F}/P=${crawl.countsByType.P} vs landing F=${landing.fullTime}/P=${landing.partTime}`);
  }
  if (!crawl.rows.length) {
    throw new Error(`full crawl parsed zero rows — ${errors.join('; ') || 'markup change suspected'}`);
  }

  const result = await hydrateAndMerge(crawl.rows, {
    completeCrawl,
    landing,
    scanHealth: {
      status: completeCrawl ? 'ok' : 'partial',
      last_mode: 'full',
      last_started: started,
      last_success: new Date().toISOString(),
      last_full_reconcile: completeCrawl ? new Date().toISOString() : undefined,
      last_error: errors.join('; '),
      pages_fetched: crawl.pagesFetched,
      pages_failed: crawl.pagesFailed,
      crawled_counts: crawl.countsByType,
      counts_reconciled: countsReconciled,
      errors: errors.slice(0, 10),
    },
  });

  const unique = crawl.uniqueCountsByType || crawl.countsByType;
  console.log(`[umich-scan] Full crawl: ${crawl.rows.length} unique posting(s) (page-rows F=${crawl.countsByType.F}/P=${crawl.countsByType.P}, unique F=${unique.F}/P=${unique.P}), complete=${completeCrawl}, new=${result.newOpportunities.length}, closed=${result.closedCount}, detail failures=${result.detailFailures}.`);
  if (!completeCrawl) {
    console.warn(`[umich-scan] Crawl incomplete or counts mismatched — closure bookkeeping skipped. ${errors.join('; ')}`);
  }
  return { changed: result.newOpportunities.length > 0 || result.closedCount > 0, newCount: result.newOpportunities.length, error: completeCrawl ? '' : errors.join('; ') };
}

async function runDetails() {
  const started = new Date().toISOString();
  const store = readUmichOpportunities();
  const stale = store.opportunities
    .filter(item => item.status === 'open')
    .sort((a, b) => String(a.detail_fetched_at || '').localeCompare(String(b.detail_fetched_at || '')))
    .slice(0, MAX_DETAILS)
    .map(item => ({ job_id: item.job_id, url: item.url }));

  if (!stale.length) {
    console.log('[umich-scan] Detail refresh: nothing to refresh.');
    return { changed: false, newCount: 0, error: '' };
  }

  console.log(`[umich-scan] Detail refresh: ${stale.length} stalest posting(s)...`);
  const { details, failures } = await hydrateDetails(stale);
  if (DRY_RUN) {
    console.log(`[umich-scan] (dry run) refreshed ${details.size}, failed ${failures.length}`);
    return { changed: false, newCount: 0, error: '' };
  }

  // Reuse merge for the refreshed rows only; not a complete crawl.
  const rows = stale.filter(row => details.has(row.job_id)).map(row => {
    const item = store.opportunities.find(entry => entry.job_id === row.job_id);
    return {
      job_id: row.job_id,
      title: item?.title || '',
      url: row.url,
      department: item?.department || '',
      work_location: item?.work_location || '',
      date_posted: item?.date_posted || '',
      employment_type: item?.employment_type || '',
    };
  });
  const { newOpportunities } = mergeUmichCrawl(rows, details, {
    completeCrawl: false,
    scanHealth: {
      status: failures.length ? 'partial' : 'ok',
      last_mode: 'details',
      last_started: started,
      last_success: new Date().toISOString(),
      last_error: failures.length ? `${failures.length} detail fetch(es) failed` : '',
      detail_failures: failures.length,
    },
  });
  syncUmichOpportunitiesToDashboard();
  console.log(`[umich-scan] Detail refresh done: ${details.size} refreshed, ${failures.length} failed.`);
  return { changed: newOpportunities.length > 0, newCount: newOpportunities.length, error: '' };
}

function runRescore() {
  if (DRY_RUN) {
    console.log('[umich-scan] (dry run) rescore skipped.');
    return { changed: false, newCount: 0, error: '' };
  }
  const store = rescoreUmichOpportunities();
  syncUmichOpportunitiesToDashboard();
  console.log(`[umich-scan] Rescored ${store.opportunities.length} posting(s): apply_now=${store.scan_health.apply_now_count}, high_relevance=${store.scan_health.high_relevance_count}, adjacent=${store.scan_health.adjacent_count}, other=${store.scan_health.other_count}, closed=${store.scan_health.closed_count}.`);
  return { changed: false, newCount: 0, error: '' };
}

const releaseLock = acquireLock();
try {
  console.log(`\n[umich-scan] ${DRY_RUN ? '(DRY RUN) ' : ''}Mode: ${MODE}\n`);
  let outcome;
  if (MODE === 'full') outcome = await runFull();
  else if (MODE === 'details') outcome = await runDetails();
  else if (MODE === 'rescore') outcome = runRescore();
  else outcome = await runDiscover();
  recordCadence({ changed: outcome.changed, status: outcome.error ? 206 : 200, newCount: outcome.newCount, error: outcome.error });
} catch (err) {
  console.error(`[umich-scan] FAILED: ${err.message}`);
  // Preserve last known-good store; surface the failure on the dashboard health strip.
  if (!DRY_RUN) {
    try {
      const existing = readUmichOpportunities();
      writeUmichOpportunities({
        ...existing,
        scan_health: {
          ...existing.scan_health,
          status: 'error',
          last_mode: MODE,
          last_error: err.message,
          errors: [err.message],
        },
      });
      syncUmichOpportunitiesToDashboard();
    } catch {}
  }
  recordCadence({ changed: false, status: 0, newCount: 0, error: err.message });
  process.exitCode = 1;
} finally {
  releaseLock();
}
