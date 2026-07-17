#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { fetchEuraxessPostings } from './lib/euraxess/source-adapter.mjs';
import { euraxessOpportunityFromProspect, normalizeEuraxessPosting } from './lib/euraxess/normalizer.mjs';
import {
  mergeEuraxessOpportunities,
  readEuraxessOpportunities,
  syncEuraxessOpportunitiesToDashboard,
  writeEuraxessOpportunities,
} from './lib/euraxess/opportunity-store.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(BASE, 'data');
const RUNTIME_DIR = join(BASE, 'runtime');
const REGISTRY_FILE = join(BASE, 'config', 'source-registry.json');
const LOCK_FILE = join(RUNTIME_DIR, 'euraxess-backfill.lock');
const LOCK_TTL_MS = 2 * 60 * 60_000;
const args = process.argv.slice(2);

const SEARCH_PROFILES = {
  fusion_plasma_diagnostics: ['fusion', 'plasma', 'diagnostics', 'diagnostic', 'tokamak', 'stellarator', 'neutron'],
  instrumentation: ['instrumentation', 'instrument', 'detector', 'sensor', 'DAQ', 'calibration', 'measurement'],
  space_plasma: ['space plasma', 'magnetosphere', 'heliophysics', 'ionosphere', 'plasma physics'],
  controls_robotics: ['controls', 'control systems', 'robotics', 'automation', 'mechatronics'],
  mass_spectrometry: ['mass spectrometry', 'ion optics', 'quadrupole', 'tof', 'mass analyzer'],
};

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(RUNTIME_DIR, { recursive: true });

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function argValue(name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function flag(name) {
  return args.includes(name);
}

function atomicWrite(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = join(dirname(filePath), `.${basename(filePath)}.tmp-${Date.now()}`);
  writeFileSync(tempPath, content, 'utf-8');
  try {
    renameSync(tempPath, filePath);
  } catch (err) {
    if (!['EPERM', 'EACCES'].includes(err?.code)) throw err;
    writeFileSync(filePath, content, 'utf-8');
    try { unlinkSync(tempPath); } catch {}
  }
}

function acquireLock() {
  if (flag('--dry-run')) return () => {};
  let lock = null;
  if (existsSync(LOCK_FILE)) {
    try {
      lock = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
    } catch {
      lock = null;
    }
  }
  if (lock?.started_at) {
    const age = Date.now() - new Date(lock.started_at).getTime();
    if (Number.isFinite(age) && age < LOCK_TTL_MS) {
      throw new Error('EURAXESS backfill already running; lock file is fresh.');
    }
  }
  atomicWrite(LOCK_FILE, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }, null, 2));
  return () => {
    try { unlinkSync(LOCK_FILE); } catch {}
  };
}

function loadRegistrySource() {
  const registry = JSON.parse(readFileSync(REGISTRY_FILE, 'utf-8'));
  return (registry.sources || []).find(source => source.id === 'euraxess-fusion') || {};
}

function jsonItems(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.jobs)) return value.jobs;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.postings)) return value.postings;
  if (Array.isArray(value?.prospects)) return value.prospects;
  if (Array.isArray(value?.opportunities)) return value.opportunities;
  return [];
}

function readImportedSeeds(source) {
  const candidates = [
    argValue('--seed', ''),
    process.env.EURAXESS_BACKFILL_SEED,
    join(DATA_DIR, cleanText(source.manual_seed_file || 'euraxess-seed-postings.json')),
    join(BASE, '..', 'data', 'euraxess-seed-postings.json'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const filePath = candidate.includes(':') || candidate.startsWith('\\\\') ? candidate : join(BASE, candidate);
    if (!existsSync(filePath)) continue;
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    return jsonItems(parsed).map(item => ({ ...item, provider: item.provider || 'manual_seed', seed_file: filePath }));
  }
  return [];
}

export function matchesBackfillProfile(posting = {}, profile = 'fusion_plasma_diagnostics') {
  const keywords = SEARCH_PROFILES[profile] || SEARCH_PROFILES.fusion_plasma_diagnostics;
  const haystack = [
    posting.title,
    posting.name,
    posting.summary,
    posting.description,
    posting.snippet,
    posting.institution,
    posting.company,
    posting.field,
    ...(Array.isArray(posting.research_fields) ? posting.research_fields : []),
  ].join(' ').toLowerCase();
  return keywords.some(keyword => haystack.includes(keyword.toLowerCase()));
}

export function euraxessBackfillDedupeKey(posting = {}) {
  const url = cleanText(posting.url || posting.link || posting.href || posting.application_url).toLowerCase();
  const id = cleanText(posting.id || posting.job_id || posting.offer_id || posting.external_id).toLowerCase();
  if (url.match(/\/jobs\/\d+/)) return url.match(/\/jobs\/(\d+)/)?.[1] || url;
  if (id) return id;
  return [
    posting.title || posting.name,
    posting.institution || posting.company || posting.organisation || posting.organization,
  ].map(cleanText).join('|').toLowerCase();
}

function knownBackfillKeys(store) {
  const keys = new Set();
  for (const item of store.opportunities || []) {
    keys.add(euraxessBackfillDedupeKey({
      id: item.external_id,
      url: item.url,
      title: item.title,
      institution: item.institution,
    }));
    if (!['archived', 'failed_final'].includes(item.status) && item.worker_status !== 'not_needed') continue;
  }
  return keys;
}

async function collectPostings({ source, profile, max }) {
  const seedPostings = readImportedSeeds(source).filter(item => matchesBackfillProfile(item, profile));
  const hasApify = Boolean(cleanText(process.env.APIFY_TOKEN || process.env.EURAXESS_APIFY_TOKEN));
  const providers = hasApify ? ['third_party_provider', 'manual_seed'] : ['manual_seed'];
  const result = await fetchEuraxessPostings({
    ...source,
    providers,
    max_items: max,
  }, {
    env: {
      ...process.env,
      EURAXESS_MAX_ITEMS: String(max),
      EURAXESS_PROVIDERS: providers.join(','),
    },
  }).catch(err => ({
    provider: 'configured_provider_backfill',
    status: 'failed',
    error: err?.message || String(err),
    postings: [],
    attempts: [],
  }));

  const providerPostings = (result.postings || []).filter(item => matchesBackfillProfile(item, profile));
  const byKey = new Map();
  for (const item of [...seedPostings, ...providerPostings]) {
    const key = euraxessBackfillDedupeKey(item);
    if (key && !byKey.has(key)) byKey.set(key, item);
  }
  return {
    result,
    postings: [...byKey.values()].slice(0, max),
    providers,
    seed_count: seedPostings.length,
    has_provider: hasApify || seedPostings.length > 0,
  };
}

async function runBackfill() {
  const release = acquireLock();
  try {
    const profile = argValue('--profile', 'fusion_plasma_diagnostics');
    const max = Math.max(1, Number(argValue('--max', 500)) || 500);
    const force = flag('--force');
    const dryRun = flag('--dry-run');
    const source = loadRegistrySource();
    const now = new Date();
    const store = readEuraxessOpportunities();
    const knownKeys = knownBackfillKeys(store);
    const { result, postings, providers, seed_count: seedCount, has_provider: hasProvider } = await collectPostings({ source, profile, max });
    const filtered = force ? postings : postings.filter(item => !knownKeys.has(euraxessBackfillDedupeKey(item)));
    const opportunities = filtered.map(posting => euraxessOpportunityFromProspect(
      normalizeEuraxessPosting({
        ...posting,
        provider: posting.provider || result.provider || 'manual_seed',
        backfill_profile: profile,
      }, { sourceId: source.id || 'euraxess-fusion', now }),
      posting
    ));

    const providerLimited = !hasProvider || (!opportunities.length && result.status !== 'ok');
    const scanSummary = {
      ...(store.scan_summary || {}),
      provider: result.provider || 'configured_provider_backfill',
      status: providerLimited ? 'provider_limited' : result.status || 'ok',
      backfill_profile: profile,
      backfill_scanned_count: postings.length,
      backfill_imported_count: opportunities.length,
      provider_coverage: providers.join(','),
      last_error: providerLimited
        ? 'Backfill requires APIFY_TOKEN/EURAXESS_APIFY_TOKEN or an imported WEB-TRACKER/data/euraxess-seed-postings.json seed.'
        : result.error || '',
      last_backfill: now.toISOString(),
      attempts: result.attempts?.map(item => ({ provider: item.provider, status: item.status, access: item.access?.reason || '' })) || [],
    };

    if (!dryRun) {
      if (opportunities.length) {
        mergeEuraxessOpportunities(opportunities, { scanSummary });
      } else {
        writeEuraxessOpportunities({ ...store, scan_summary: scanSummary });
      }
      syncEuraxessOpportunitiesToDashboard();
    }

    return {
      ok: true,
      generated_at: now.toISOString(),
      profile,
      max,
      dry_run: dryRun,
      force,
      provider_status: result.status || (hasProvider ? 'ok' : 'provider_limited'),
      provider: result.provider || 'configured_provider_backfill',
      seed_count: seedCount,
      scanned_count: postings.length,
      imported_count: opportunities.length,
      provider_limited: providerLimited,
      note: providerLimited ? scanSummary.last_error : '',
    };
  } finally {
    release();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await runBackfill().catch(err => ({
    ok: false,
    generated_at: new Date().toISOString(),
    error: err?.stack || err?.message || String(err),
  }));

  console.log(JSON.stringify(output, null, 2));
  process.exit(output.ok ? 0 : 1);
}
