#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fetchFindaphdPostings } from './lib/findaphd/source-adapter.mjs';
import { normalizeFindaphdPosting } from './lib/findaphd/normalizer.mjs';
import {
  loadRegistry,
  loadState,
  saveState,
  getDueSources,
  recordPollResult,
  computeNextPoll,
} from './lib/cadence-engine.mjs';
import {
  mergePhdscannerOpportunities,
  readPhdscannerOpportunities,
  syncPhdscannerOpportunitiesToDashboard,
} from './lib/phdscanner/opportunity-store.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(BASE, 'data');
const RUNTIME_DIR = join(BASE, 'runtime');
const EVENT_QUEUE = join(DATA_DIR, 'event-queue.ndjson');
const LOCK_FILE = join(RUNTIME_DIR, 'findaphd-scan.lock');
const LOCK_TTL_MS = 60 * 60_000;

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(RUNTIME_DIR, { recursive: true });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SCAN_ALL = args.includes('--all');
const REFRESH_LIVENESS = args.includes('--refresh-liveness');
const SOURCE_FILTER = args.includes('--source') ? args[args.indexOf('--source') + 1] : null;
const MAX_ITEMS = args.includes('--max') ? Number(args[args.indexOf('--max') + 1]) : null;
const NO_PLAYWRIGHT = args.includes('--no-playwright');

function acquireLock() {
  if (DRY_RUN) return () => {};
  if (existsSync(LOCK_FILE)) {
    const ageMs = Date.now() - Number(readFileSync(LOCK_FILE, 'utf-8') || 0);
    if (Number.isFinite(ageMs) && ageMs < LOCK_TTL_MS) {
      throw new Error('FindAPhD scan already running; lock file is fresh.');
    }
  }
  writeFileSync(LOCK_FILE, String(Date.now()), 'utf-8');
  return () => {
    try { writeFileSync(LOCK_FILE, '', 'utf-8'); } catch {}
  };
}

function queueDiscoveryEvent(source, opportunities) {
  const highScoreOpen = opportunities.filter(opportunity => opportunity.needs_research && ['open', 'open_unverified'].includes(opportunity.status));
  if (!highScoreOpen.length || DRY_RUN) return;
  appendFileSync(EVENT_QUEUE, `${JSON.stringify({
    type: 'new_findaphd_opportunities',
    source_id: source.id,
    source: source.id,
    count: highScoreOpen.length,
    timestamp: new Date().toISOString(),
    opportunity_ids: highScoreOpen.map(opportunity => opportunity.id).slice(0, 20),
    titles: highScoreOpen.map(opportunity => opportunity.title).slice(0, 5),
  })}\n`);
}

async function scanSource(source, state, registry) {
  const now = new Date();
  const sourceWithCaps = {
    ...source,
    max_items: Number.isFinite(MAX_ITEMS) && MAX_ITEMS > 0 ? MAX_ITEMS : source.max_items,
  };
  const result = await fetchFindaphdPostings(sourceWithCaps, { usePlaywright: !NO_PLAYWRIGHT });
  const status = result.status === 'ok' ? (result.http_status || 200) : result.status === 'blocked' ? 451 : 0;
  const opportunities = (result.postings || []).map(posting => normalizeFindaphdPosting(posting, {
    sourceId: source.id,
    now,
  }));
  const scanSummary = {
    provider: result.provider,
    status: result.status,
    scanned_count: Number(result.scanned_count ?? opportunities.length),
    findaphd_scanned_count: Number(result.scanned_count ?? opportunities.length),
    detail_fetches: Number(result.detail_fetches || 0),
    last_error: result.status === 'ok' ? '' : result.reason || result.access?.reason || result.status,
    last_success: result.status === 'ok' ? now.toISOString() : '',
    attempts: result.attempts?.map(item => ({ provider: item.provider, status: item.status, url: item.url || '', reason: item.reason || '' })) || [],
  };
  const { store, newOpportunities } = DRY_RUN
    ? { store: readPhdscannerOpportunities(), newOpportunities: opportunities }
    : mergePhdscannerOpportunities(opportunities, {
      scanSummary: {
        ...readPhdscannerOpportunities().scan_summary,
        ...scanSummary,
        findaphd_last_success: scanSummary.last_success,
      },
    });

  if (!DRY_RUN) {
    recordPollResult(state, source.id, {
      http_status: status,
      item_count: opportunities.length,
      new_count: newOpportunities.length,
      error: result.status === 'ok' ? null : result.reason || result.status,
    });
    state.sources[source.id] = {
      ...(state.sources[source.id] || {}),
      next_poll_at: computeNextPoll(source, state.sources[source.id] || {}, registry.cadence_policy || {}),
    };
    saveState(state);
    syncPhdscannerOpportunitiesToDashboard();
    queueDiscoveryEvent(source, opportunities);
  }

  return {
    source_id: source.id,
    status: result.status,
    scanned: opportunities.length,
    new_count: newOpportunities.length,
    visible: store.scan_summary?.visible_count,
    strong: store.scan_summary?.strong_count,
  };
}

async function main() {
  const release = acquireLock();
  try {
    if (REFRESH_LIVENESS) {
      // Shared store deadline refresh is handled by phdscanner-scan; noop here.
    }
    const registry = loadRegistry();
    const state = loadState();
    let sources = (registry.sources || []).filter(source => source.enabled !== false && source.platform === 'findaphd');
    if (SOURCE_FILTER) sources = sources.filter(source => source.id === SOURCE_FILTER);
    if (!SCAN_ALL) {
      const dueIds = new Set(getDueSources(registry, state).map(source => source.id));
      sources = sources.filter(source => dueIds.has(source.id));
    }
    if (!sources.length) {
      console.log(JSON.stringify({ ok: true, scanned_sources: 0, message: 'No due FindAPhD sources' }, null, 2));
      return;
    }
    const results = [];
    for (const source of sources) {
      results.push(await scanSource(source, state, registry));
    }
    console.log(JSON.stringify({ ok: true, dry_run: DRY_RUN, results }, null, 2));
  } finally {
    release();
  }
}

main().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
