#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { fetchEuraxessPostings } from './lib/euraxess/source-adapter.mjs';
import { euraxessOpportunityFromProspect, normalizeEuraxessPosting } from './lib/euraxess/normalizer.mjs';
import { applyTranslationCache } from './lib/euraxess/translation-cache.mjs';
import {
  loadRegistry,
  loadState,
  saveState,
  getDueSources,
  recordPollResult,
  computeNextPoll,
} from './lib/cadence-engine.mjs';
import {
  mergeEuraxessOpportunities,
  readEuraxessOpportunities,
  rescoreEuraxessOpportunities,
  syncEuraxessOpportunitiesToDashboard,
  writeEuraxessOpportunities,
} from './lib/euraxess/opportunity-store.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(BASE, 'data');
const RUNTIME_DIR = join(BASE, 'runtime');
const EVENT_QUEUE = join(DATA_DIR, 'event-queue.ndjson');
const LOCK_FILE = join(RUNTIME_DIR, 'euraxess-scan.lock');
const LOCK_TTL_MS = 60 * 60_000;

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(RUNTIME_DIR, { recursive: true });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SCAN_ALL = args.includes('--all');
const REFRESH_LIVENESS = args.includes('--refresh-liveness');
const RESCORE = args.includes('--rescore');
const SOURCE_FILTER = args.includes('--source') ? args[args.indexOf('--source') + 1] : null;

function acquireLock() {
  if (DRY_RUN) return () => {};
  if (existsSync(LOCK_FILE)) {
    const ageMs = Date.now() - Number(readFileSync(LOCK_FILE, 'utf-8') || 0);
    if (Number.isFinite(ageMs) && ageMs < LOCK_TTL_MS) {
      throw new Error('EURAXESS scan already running; lock file is fresh.');
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
    type: 'new_euraxess_opportunities',
    source_id: source.id,
    source: source.id,
    count: highScoreOpen.length,
    timestamp: new Date().toISOString(),
    opportunity_ids: highScoreOpen.map(opportunity => opportunity.id).slice(0, 20),
    titles: highScoreOpen.map(opportunity => opportunity.title).slice(0, 5),
  })}\n`);
}

function refreshDeadlineStatuses(source, now = new Date()) {
  const existing = readEuraxessOpportunities();
  let changed = 0;
  const opportunities = (existing.opportunities || []).map(opportunity => {
    if (!opportunity.deadline_utc) return opportunity;
    const deadline = new Date(opportunity.deadline_utc);
    if (Number.isNaN(deadline.getTime()) || deadline.getTime() >= now.getTime()) return opportunity;
    if (opportunity.status === 'closed' && opportunity.liveness === 'closed') return opportunity;
    changed++;
    return {
      ...opportunity,
      status: 'closed',
      liveness: 'closed',
      liveness_reason: 'deadline has passed',
      needs_research: false,
      needs_application_pack: false,
      worker_status: 'not_needed',
      last_updated: now.toISOString(),
    };
  });
  if (!DRY_RUN && changed > 0) {
    writeEuraxessOpportunities({ ...existing, opportunities });
    syncEuraxessOpportunitiesToDashboard();
  }
  return changed;
}

async function scanSource(source, state) {
  const now = new Date();
  const result = await fetchEuraxessPostings(source);
  const status = result.status === 'ok' ? (result.http_status || 200) : result.status === 'blocked' ? 451 : 0;
  const opportunities = [];
  for (const posting of result.postings || []) {
    const prospect = normalizeEuraxessPosting(posting, { sourceId: source.id, now });
    const translated = await applyTranslationCache(prospect);
    opportunities.push(euraxessOpportunityFromProspect(translated, posting));
  }
  const scanSummary = {
    provider: result.provider,
    status: result.status,
    scanned_count: Number(result.scanned_count ?? opportunities.length),
    rss_item_count: Number(result.scanned_count ?? opportunities.length),
    last_error: result.status === 'ok' ? '' : result.reason || result.access?.reason || result.status,
    last_success: result.status === 'ok' ? now.toISOString() : '',
    attempts: result.attempts?.map(item => ({ provider: item.provider, status: item.status, access: item.access?.reason || '' })) || [],
  };
  const { store, newOpportunities } = DRY_RUN
    ? { store: readEuraxessOpportunities(), newOpportunities: opportunities }
    : mergeEuraxessOpportunities(opportunities, { scanSummary });

  recordPollResult(state, source.id, {
    changed: newOpportunities.length > 0,
    status,
    new_count: newOpportunities.length,
    error: result.status === 'ok' ? '' : result.reason || result.access?.reason || result.status,
    provider: result.provider,
    access_status: result.access?.reason || result.status,
    content_fingerprint: result.content_fingerprint,
  });
  state.sources[source.id].provider = result.provider;
  state.sources[source.id].access_status = result.access?.reason || result.status;
  state.sources[source.id].last_error = result.status === 'ok' ? '' : result.reason || result.access?.reason || result.status;
  state.sources[source.id].content_fingerprint = result.content_fingerprint || state.sources[source.id].content_fingerprint;
  const policy = registry.cadence_policy[source.source_type] || registry.cadence_policy.phd_board;
  state.sources[source.id].next_poll = computeNextPoll(source, state.sources[source.id], policy);

  if (!DRY_RUN) {
    // Always recompute scores for the full store so threshold/vocab changes apply immediately.
    rescoreEuraxessOpportunities();
    syncEuraxessOpportunitiesToDashboard();
    queueDiscoveryEvent(source, newOpportunities);
  }

  return {
    source_id: source.id,
    provider: result.provider,
    status: result.status,
    attempts: result.attempts?.map(item => ({ provider: item.provider, status: item.status, access: item.access?.reason || '' })) || [],
    fetched: opportunities.length,
    new_count: newOpportunities.length,
    visible_count: store.scan_summary?.visible_count || 0,
    archived_count: store.scan_summary?.archived_count || 0,
    high_score_open: newOpportunities.filter(opportunity => opportunity.needs_research && ['open', 'open_unverified'].includes(opportunity.status)).length,
  };
}

const releaseLock = acquireLock();
const registry = loadRegistry();
const state = loadState();

try {
  const euraxessSources = registry.sources.filter(source =>
    source.enabled && source.platform === 'euraxess'
  );
  let toScan;
  if (SOURCE_FILTER) {
    toScan = euraxessSources.filter(source => source.id === SOURCE_FILTER);
  } else if (SCAN_ALL) {
    toScan = euraxessSources;
  } else {
    const due = getDueSources(registry, state);
    toScan = due.filter(source => source.platform === 'euraxess');
  }

  if (REFRESH_LIVENESS) {
    let refreshed = 0;
    for (const source of euraxessSources) refreshed += refreshDeadlineStatuses(source);
    console.log(`[euraxess-scan] Refreshed ${refreshed} expired local EURAXESS prospect(s).`);
  }

  if (RESCORE && !DRY_RUN && !toScan?.length) {
    // Allow --rescore alone before toScan is computed; handled after toScan below too.
  }

  console.log(`\n[euraxess-scan] ${DRY_RUN ? '(DRY RUN) ' : ''}Scanning ${toScan.length} EURAXESS source(s)...\n`);
  const results = [];
  for (const source of toScan) {
    const result = await scanSource(source, state).catch(err => ({
      source_id: source.id,
      status: 'failed',
      error: err.message,
    }));
    results.push(result);
    console.log(`  ${source.id}: ${result.status} via ${result.provider || 'n/a'} — fetched ${result.fetched || 0}, new ${result.new_count || 0}`);
    if (result.error) console.log(`    ${result.error}`);
  }

  if (!DRY_RUN && (RESCORE || !toScan.length)) {
    const rescored = rescoreEuraxessOpportunities();
    syncEuraxessOpportunitiesToDashboard();
    console.log(`[euraxess-scan] Rescored ${rescored.opportunities?.length || 0} opportunities (visible ${rescored.scan_summary?.visible_count || 0}, archived ${rescored.scan_summary?.archived_count || 0}).`);
  }

  if (!DRY_RUN) saveState(state);
  const totalNew = results.reduce((sum, item) => sum + Number(item.new_count || 0), 0);
  console.log(`\n[euraxess-scan] ${totalNew} new EURAXESS prospect(s)\n`);
} finally {
  releaseLock();
}
