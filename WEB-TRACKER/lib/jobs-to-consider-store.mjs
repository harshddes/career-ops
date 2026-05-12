import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const WEB_TRACKER_DIR = join(LIB_DIR, '..');
export const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
export const CAREER_DATA_DIR = join(CAREER_OPS_DIR, 'data');
export const DASHBOARD_DATA_DIR = join(WEB_TRACKER_DIR, 'data');
export const CANONICAL_JOBS_FILE = join(CAREER_DATA_DIR, 'jobs-to-consider.json');
export const DASHBOARD_JOBS_FILE = join(DASHBOARD_DATA_DIR, 'jobs-to-consider.json');

const ALLOWED_STATUSES = new Set(['to_consider', 'applied', 'closed', 'archived']);

function emptyStore() {
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    jobs: [],
  };
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

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

export function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || `job-${Date.now()}`;
}

function normalizeStatus(value, fallback = 'to_consider') {
  const status = cleanText(value || fallback).toLowerCase();
  if (ALLOWED_STATUSES.has(status)) return status;
  return fallback;
}

function normalizeResources(resources = {}) {
  if (!resources || typeof resources !== 'object' || Array.isArray(resources)) return {};
  const out = {};
  for (const [key, value] of Object.entries(resources)) {
    const clean = cleanText(value);
    if (clean) out[key] = clean;
  }
  return out;
}

export function normalizeConsiderJob(raw = {}) {
  const company = cleanText(raw.company);
  const title = cleanText(raw.title || raw.role);
  const id = cleanText(raw.id) || slugify(`${company}-${title}`);
  const status = normalizeStatus(raw.status, raw.applied ? 'applied' : 'to_consider');
  const now = new Date().toISOString();

  return {
    id,
    company,
    title,
    url: cleanText(raw.url),
    location: cleanText(raw.location),
    team: cleanText(raw.team),
    source: cleanText(raw.source || 'manual_research'),
    status,
    applied: Boolean(raw.applied || status === 'applied'),
    score: cleanText(raw.score),
    fit_summary: cleanText(raw.fit_summary),
    recommendation: cleanText(raw.recommendation),
    notes: cleanText(raw.notes),
    first_seen: cleanText(raw.first_seen || raw.created_at || now),
    last_updated: cleanText(raw.last_updated || now),
    last_checked: cleanText(raw.last_checked),
    liveness: cleanText(raw.liveness || 'active'),
    liveness_reason: cleanText(raw.liveness_reason),
    application_num: raw.application_num === undefined || raw.application_num === null
      ? null
      : Number(raw.application_num),
    applied_at: cleanText(raw.applied_at),
    resources: normalizeResources(raw.resources),
  };
}

export function readConsiderJobs(filePath = CANONICAL_JOBS_FILE) {
  if (!existsSync(filePath)) return emptyStore();
  const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
  const jobs = Array.isArray(parsed.jobs) ? parsed.jobs.map(normalizeConsiderJob) : [];
  return {
    ...emptyStore(),
    ...parsed,
    version: 1,
    jobs,
  };
}

export function writeConsiderJobs(store, filePath = CANONICAL_JOBS_FILE) {
  const next = {
    version: 1,
    generated_at: new Date().toISOString(),
    jobs: Array.isArray(store?.jobs) ? store.jobs.map(normalizeConsiderJob) : [],
  };
  atomicWrite(filePath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function findConsiderJob(id, store = readConsiderJobs()) {
  return store.jobs.find(job => job.id === id || job.url === id) || null;
}

export function upsertConsiderJob(raw, filePath = CANONICAL_JOBS_FILE) {
  const store = readConsiderJobs(filePath);
  const incoming = normalizeConsiderJob(raw);
  if (!incoming.company || !incoming.title) {
    throw new Error('company and title are required');
  }

  const index = store.jobs.findIndex(job => job.id === incoming.id || (incoming.url && job.url === incoming.url));
  if (index >= 0) {
    store.jobs[index] = normalizeConsiderJob({
      ...store.jobs[index],
      ...incoming,
      resources: { ...(store.jobs[index].resources || {}), ...(incoming.resources || {}) },
      first_seen: store.jobs[index].first_seen || incoming.first_seen,
      last_updated: new Date().toISOString(),
    });
  } else {
    store.jobs.unshift(incoming);
  }
  return writeConsiderJobs(store, filePath);
}

export function patchConsiderJob(id, updates = {}, filePath = CANONICAL_JOBS_FILE) {
  const store = readConsiderJobs(filePath);
  const index = store.jobs.findIndex(job => job.id === id || job.url === id);
  if (index < 0) throw new Error(`job not found: ${id}`);

  const current = store.jobs[index];
  const nextRaw = {
    ...current,
    ...updates,
    resources: updates.resources === undefined
      ? current.resources
      : { ...(current.resources || {}), ...(updates.resources || {}) },
    last_updated: new Date().toISOString(),
  };

  for (const [key, value] of Object.entries(updates)) {
    if (value === null) delete nextRaw[key];
  }

  store.jobs[index] = normalizeConsiderJob(nextRaw);
  const nextStore = writeConsiderJobs(store, filePath);
  return { store: nextStore, job: nextStore.jobs[index] };
}

export function syncConsiderJobsToDashboard({
  sourcePath = CANONICAL_JOBS_FILE,
  outputPath = DASHBOARD_JOBS_FILE,
} = {}) {
  const store = readConsiderJobs(sourcePath);
  const output = {
    ...store,
    generated_at: new Date().toISOString(),
    source: sourcePath,
    total: store.jobs.length,
    count: store.jobs.length,
    jobs: store.jobs,
    status_summary: store.jobs.reduce((acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    }, {}),
  };
  atomicWrite(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  return output;
}
