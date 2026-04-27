#!/usr/bin/env node
/**
 * fusion-scan.mjs — Fusion company job scanner with adaptive scheduling
 *
 * Scans Greenhouse, Ashby, and Lever APIs for fusion companies defined
 * in config/source-registry.json. Uses conditional fetch (ETag/Last-Modified)
 * and adaptive cadence from lib/cadence-engine.mjs.
 *
 * Zero LLM tokens — pure HTTP + JSON.
 *
 * Usage:
 *   node fusion-scan.mjs              # scan due sources only
 *   node fusion-scan.mjs --all        # scan all enabled sources
 *   node fusion-scan.mjs --dry-run    # preview without writing
 *   node fusion-scan.mjs --source cfs # scan single source by ID
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchWithValidators, fingerprint } from './lib/conditional-fetch.mjs';
import { enrichOpportunityWithWorkAuth, normalizeWorkAuth } from './lib/work-auth.mjs';
import {
  loadRegistry, loadState, saveState,
  getDueSources, recordPollResult, computeNextPoll,
} from './lib/cadence-engine.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(BASE, 'data');
const JOBS_FILE = join(DATA_DIR, 'fusion-jobs.json');
const EVENT_QUEUE = join(DATA_DIR, 'event-queue.ndjson');

mkdirSync(DATA_DIR, { recursive: true });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SCAN_ALL = args.includes('--all');
const SOURCE_FILTER = args.includes('--source') ? args[args.indexOf('--source') + 1] : null;

const CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 12_000;

// ── API parsers (same logic as career-ops scan.mjs) ─────────────────

function parseGreenhouse(json, name) {
  return (json.jobs || []).map(j => ({
    title: j.title || '', url: j.absolute_url || '',
    company: name, location: j.location?.name || '',
    posted_at: j.updated_at || j.first_published_at || null,
  }));
}

function parseAshby(json, name) {
  return (json.jobs || []).map(j => ({
    title: j.title || '', url: j.jobUrl || '',
    company: name, location: j.location || '',
    posted_at: j.publishedAt || null,
    salary: j.compensation?.compensationTierSummary || null,
  }));
}

function parseLever(json, name) {
  if (!Array.isArray(json)) return [];
  return json.map(j => ({
    title: j.text || '', url: j.hostedUrl || '',
    company: name, location: j.categories?.location || '',
    posted_at: j.createdAt ? new Date(j.createdAt).toISOString() : null,
  }));
}

const PARSERS = { greenhouse: parseGreenhouse, ashby: parseAshby, lever: parseLever };

// ── Title filter ────────────────────────────────────────────────────

function buildFilter(registry) {
  const pos = (registry.title_filter?.positive || []).map(k => k.toLowerCase());
  const neg = (registry.title_filter?.negative || []).map(k => k.toLowerCase());
  return (title) => {
    const t = title.toLowerCase();
    return (pos.length === 0 || pos.some(k => t.includes(k))) && !neg.some(k => t.includes(k));
  };
}

// ── Dedup ───────────────────────────────────────────────────────────

function loadExistingJobs() {
  if (!existsSync(JOBS_FILE)) return { jobs: [], seen: new Set() };
  const data = JSON.parse(readFileSync(JOBS_FILE, 'utf-8'));
  const seen = new Set(data.jobs.map(j => j.url));
  return { jobs: data.jobs, seen };
}

// ── Scan a single API source ────────────────────────────────────────

async function scanApiSource(source, state, titleFilter) {
  if (!source.api_url) return { changed: false, new_jobs: [], status: 0 };

  const cache = {
    etag: state.sources[source.id]?.etag,
    lastModified: state.sources[source.id]?.last_modified,
  };

  const result = await fetchWithValidators(source.api_url, cache);

  if (!result.changed || !result.data) {
    return { changed: false, new_jobs: [], status: result.status, etag: result.etag, lastModified: result.lastModified };
  }

  const parser = PARSERS[source.platform];
  if (!parser) return { changed: false, new_jobs: [], status: result.status };

  const allJobs = parser(result.data, source.name);
  const filtered = allJobs.filter(j => titleFilter(j.title));
  const sourceWorkAuth = normalizeWorkAuth(source);

  return {
    changed: true,
    new_jobs: filtered.map(j => enrichOpportunityWithWorkAuth({
        ...j,
        source_id: source.id,
        source_type: source.source_type,
        h1b_status: source.h1b_status || 'unknown',
        h1b_sponsorship: sourceWorkAuth.h1b_sponsorship,
        green_card_sponsorship: sourceWorkAuth.green_card_sponsorship,
        first_seen: new Date().toISOString(),
        liveness: 'assumed_active',
      }, source)),
    total_fetched: allJobs.length,
    status: result.status,
    etag: result.etag,
    lastModified: result.lastModified,
  };
}

// ── Batch scan ──────────────────────────────────────────────────────

async function batchScan(sources, state, titleFilter, existingSeen) {
  const results = [];

  for (let i = 0; i < sources.length; i += CONCURRENCY) {
    const batch = sources.slice(i, i + CONCURRENCY);
    const promises = batch.map(s => scanApiSource(s, state, titleFilter).catch(err => ({
      changed: false, new_jobs: [], status: 0, error: err.message,
    })));
    const batchResults = await Promise.all(promises);

    for (let j = 0; j < batch.length; j++) {
      results.push({ source: batch[j], result: batchResults[j] });
    }
  }

  let totalNew = 0;
  const newJobs = [];

  for (const { source, result } of results) {
    const genuinelyNew = result.new_jobs.filter(j => !existingSeen.has(j.url));
    totalNew += genuinelyNew.length;
    newJobs.push(...genuinelyNew);

    const pollResult = {
      changed: genuinelyNew.length > 0,
      status: result.status,
      new_count: genuinelyNew.length,
      etag: result.etag,
      lastModified: result.lastModified,
    };

    recordPollResult(state, source.id, pollResult);

    const policy = registry.cadence_policy[source.source_type] || registry.cadence_policy.job_api;
    state.sources[source.id].next_poll = computeNextPoll(source, state.sources[source.id], policy);

    if (!DRY_RUN && genuinelyNew.length > 0) {
      const event = {
        type: 'new_jobs',
        source_id: source.id,
        count: genuinelyNew.length,
        timestamp: new Date().toISOString(),
        titles: genuinelyNew.map(j => j.title).slice(0, 5),
      };
      appendFileSync(EVENT_QUEUE, JSON.stringify(event) + '\n');
    }
  }

  return { totalNew, newJobs, results };
}

// ── Main ────────────────────────────────────────────────────────────

const registry = loadRegistry();
const state = loadState();
const titleFilter = buildFilter(registry);
const { jobs: existingJobs, seen: existingSeen } = loadExistingJobs();

const apiSources = registry.sources.filter(s =>
  s.enabled && s.api_url && ['job_api'].includes(s.source_type)
);

let toScan;
if (SOURCE_FILTER) {
  toScan = apiSources.filter(s => s.id === SOURCE_FILTER);
} else if (SCAN_ALL) {
  toScan = apiSources;
} else {
  toScan = getDueSources(registry, state).filter(s => s.api_url && s.source_type === 'job_api');
}

console.log(`\n[fusion-scan] ${DRY_RUN ? '(DRY RUN) ' : ''}Scanning ${toScan.length} sources...\n`);

const { totalNew, newJobs } = await batchScan(toScan, state, titleFilter, existingSeen);

if (!DRY_RUN) {
  const mergedJobs = [...existingJobs, ...newJobs];
  const output = {
    generated_at: new Date().toISOString(),
    total: mergedJobs.length,
    new_this_run: totalNew,
    jobs: mergedJobs,
  };
  writeFileSync(JOBS_FILE, JSON.stringify(output, null, 2));
  saveState(state);
}

console.log(`[fusion-scan] ${totalNew} new jobs found across ${toScan.length} sources`);
if (totalNew > 0) {
  for (const j of newJobs.slice(0, 10)) {
    console.log(`  + ${j.company} — ${j.title}`);
  }
  if (newJobs.length > 10) console.log(`  ... and ${newJobs.length - 10} more`);
}
console.log();
