import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { applyJobsUserStateToStore, patchJobsUserState, removeJobsUserState } from './jobs-user-state.mjs';

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

function normalizeStringArray(value = []) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean);
}

function normalizeJobScore(value) {
  const clean = cleanText(value);
  if (!clean) return '';
  if (/^\d+(\.\d+)?\/5$/i.test(clean)) {
    return `${Number(clean.replace(/\/5$/i, '')).toFixed(1)}/5`;
  }
  if (/^\d+(\.\d+)?$/.test(clean)) {
    const num = Number(clean);
    if (num >= 0 && num <= 5) return `${num.toFixed(1)}/5`;
  }
  return clean;
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
    score: normalizeJobScore(raw.score),
    fit_summary: cleanText(raw.fit_summary),
    recommendation: cleanText(raw.recommendation),
    notes: cleanText(raw.notes),
    first_seen: cleanText(raw.first_seen || raw.created_at || now),
    last_updated: cleanText(raw.last_updated || now),
    last_checked: cleanText(raw.last_checked),
    region: cleanText(raw.region),
    h1b_status: cleanText(raw.h1b_status),
    h1b_sponsorship: cleanText(raw.h1b_sponsorship),
    green_card_sponsorship: cleanText(raw.green_card_sponsorship),
    export_control: cleanText(raw.export_control),
    export_control_risk: cleanText(raw.export_control_risk),
    opt_story_strength: cleanText(raw.opt_story_strength),
    adjacent_fields: normalizeStringArray(raw.adjacent_fields),
    liveness: cleanText(raw.liveness || 'active'),
    liveness_reason: cleanText(raw.liveness_reason),
    // Exempts bot-walled career sites (e.g. Tesla/Akamai) from automated liveness
    // sweeps, which misclassify blocked pages as expired postings.
    liveness_exempt: Boolean(raw.liveness_exempt),
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
  return applyJobsUserStateToStore({
    ...emptyStore(),
    ...parsed,
    version: 1,
    jobs,
  });
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

function normalizeLookup(input = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input)
    ? input
    : { id: input };
  const id = cleanText(raw.id || raw.lookup || raw.key);
  const url = cleanText(raw.url);
  const company = cleanText(raw.company);
  const title = cleanText(raw.title || raw.role);
  const slugs = new Set([
    id,
    company && title ? slugify(`${company}-${title}`) : '',
  ].filter(Boolean));
  return {
    id,
    url,
    company,
    title,
    companyKey: company.toLowerCase(),
    titleKey: title.toLowerCase(),
    slugs,
  };
}

function jobMatchesLookup(job, lookup) {
  if (!job || !lookup) return false;
  if (lookup.id && (job.id === lookup.id || job.url === lookup.id)) return true;
  if (lookup.url && job.url === lookup.url) return true;
  if (lookup.slugs.has(job.id)) return true;
  if (
    lookup.companyKey
    && lookup.titleKey
    && cleanText(job.company).toLowerCase() === lookup.companyKey
    && cleanText(job.title).toLowerCase() === lookup.titleKey
  ) {
    return true;
  }
  if (lookup.companyKey && lookup.titleKey && lookup.slugs.has(slugify(`${job.company}-${job.title}`))) {
    return true;
  }
  return false;
}

export function findConsiderJobIndex(input, store = readConsiderJobs()) {
  const lookup = normalizeLookup(input);
  return store.jobs.findIndex(job => jobMatchesLookup(job, lookup));
}

export function findConsiderJob(input, store = readConsiderJobs()) {
  const index = findConsiderJobIndex(input, store);
  return index >= 0 ? store.jobs[index] : null;
}

export function upsertConsiderJob(raw, filePath = CANONICAL_JOBS_FILE) {
  const store = readConsiderJobs(filePath);
  const incoming = normalizeConsiderJob(raw);
  if (!incoming.company || !incoming.title) {
    throw new Error('company and title are required');
  }

  const index = store.jobs.findIndex(job => job.id === incoming.id || (incoming.url && job.url === incoming.url));
  if (index >= 0) {
    const existing = store.jobs[index];
    store.jobs[index] = normalizeConsiderJob({
      ...existing,
      ...incoming,
      status: existing.status,
      applied: existing.applied,
      applied_at: existing.applied_at,
      application_num: existing.application_num,
      notes: existing.notes || incoming.notes,
      resources: { ...(incoming.resources || {}), ...(existing.resources || {}) },
      first_seen: existing.first_seen || incoming.first_seen,
      last_updated: new Date().toISOString(),
    });
  } else {
    store.jobs.unshift(incoming);
  }
  return writeConsiderJobs(store, filePath);
}

export function patchConsiderJob(id, updates = {}, filePath = CANONICAL_JOBS_FILE) {
  const store = readConsiderJobs(filePath);
  const index = findConsiderJobIndex({ id, ...updates }, store);
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
  patchJobsUserState(store.jobs[index].id, {
    status: store.jobs[index].status,
    applied: store.jobs[index].applied,
    applied_at: store.jobs[index].applied_at,
    application_num: store.jobs[index].application_num,
    notes: store.jobs[index].notes,
    resources: store.jobs[index].resources,
  });
  const nextStore = writeConsiderJobs(store, filePath);
  return { store: nextStore, job: nextStore.jobs[index] };
}

export function deleteConsiderJob(input, filePath = CANONICAL_JOBS_FILE, options = {}) {
  const store = readConsiderJobs(filePath);
  const lookup = normalizeLookup(input);
  const index = findConsiderJobIndex(lookup, store);
  if (index < 0) {
    if (options.missingOk) {
      if (filePath === CANONICAL_JOBS_FILE) removeJobsUserState([lookup.id, lookup.url]);
      return { store, job: null, missing: true, lookup };
    }
    throw new Error(`job not found: ${lookup.id || lookup.url || 'unknown'}`);
  }

  const [job] = store.jobs.splice(index, 1);
  if (filePath === CANONICAL_JOBS_FILE) removeJobsUserState([lookup.id, lookup.url, job.id, job.url]);
  const nextStore = writeConsiderJobs(store, filePath);
  return { store: nextStore, job, missing: false, lookup };
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
