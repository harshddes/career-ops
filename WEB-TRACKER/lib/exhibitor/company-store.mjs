import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const WEB_TRACKER_DIR = join(LIB_DIR, '..', '..');
export const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
export const CAREER_DATA_DIR = join(CAREER_OPS_DIR, 'data');
export const DASHBOARD_DATA_DIR = join(WEB_TRACKER_DIR, 'data');
export const CANONICAL_EXHIBITOR_FILE = join(CAREER_DATA_DIR, 'exhibitor-companies.json');
export const DASHBOARD_EXHIBITOR_FILE = join(DASHBOARD_DATA_DIR, 'exhibitor-companies.json');

const VALID_WORKER_STATUSES = new Set([
  'seeded',
  'queued_research',
  'in_progress',
  'needs_worker',
  'research_ready',
  'no_open_roles',
  'no_fit',
  'failed_retryable',
  'failed_final',
]);

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanObject(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, cleanText(entry)])
      .filter(([, entry]) => entry),
  );
}

function cleanNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function atomicWrite(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = join(dirname(filePath), `.${basename(filePath)}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  writeFileSync(tempPath, content, 'utf-8');
  const retryCodes = new Set(['EPERM', 'EACCES', 'EBUSY', 'EAGAIN', 'UNKNOWN']);
  let lastErr = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      renameSync(tempPath, filePath);
      return;
    } catch (err) {
      lastErr = err;
      if (!retryCodes.has(err?.code)) break;
      try {
        writeFileSync(filePath, content, 'utf-8');
        try { unlinkSync(tempPath); } catch {}
        return;
      } catch (writeErr) {
        lastErr = writeErr;
        if (!retryCodes.has(writeErr?.code)) break;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40 * (attempt + 1));
      }
    }
  }
  try { unlinkSync(tempPath); } catch {}
  throw lastErr || new Error(`failed to write ${filePath}`);
}

export function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || `company-${Date.now()}`;
}

export function exhibitorCompanyId({ event = 'smallsat-2026', name = '' } = {}) {
  return `exhibitor-${slugify(event)}-${slugify(name)}`;
}

function normalizeWorkerStatus(value = '') {
  const status = cleanText(value || 'seeded').toLowerCase();
  return VALID_WORKER_STATUSES.has(status) ? status : 'seeded';
}

function normalizeJobsFound(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const id = cleanText(item.id);
      const title = cleanText(item.title);
      const url = cleanText(item.url);
      if (!id && !title && !url) return null;
      return {
        id,
        title,
        url,
        score: cleanText(item.score),
      };
    })
    .filter(Boolean);
}

export function normalizeExhibitorCompany(raw = {}, { previous = null } = {}) {
  const name = cleanText(raw.name || previous?.name);
  const event = cleanText(raw.event || previous?.event || 'smallsat-2026') || 'smallsat-2026';
  const id = cleanText(raw.id) || exhibitorCompanyId({ event, name });
  const now = new Date().toISOString();
  const rawResources = cleanObject(raw.resources || previous?.resources);
  const researchReport = cleanText(
    raw.research_report
    || rawResources.report_md
    || rawResources.research_report
    || previous?.research_report,
  );
  const resources = {
    ...rawResources,
    ...(researchReport ? { report_md: researchReport, research_report: researchReport } : {}),
  };

  return {
    id,
    name,
    booth: cleanText(raw.booth ?? previous?.booth),
    event,
    batch: cleanText(raw.batch || previous?.batch || 'N-R') || 'N-R',
    track: 'exhibitor',
    website: cleanText(raw.website ?? previous?.website),
    careers_url: cleanText(raw.careers_url ?? previous?.careers_url),
    worker_status: normalizeWorkerStatus(raw.worker_status ?? previous?.worker_status),
    fit_summary: cleanText(raw.fit_summary ?? previous?.fit_summary),
    why_fit: cleanText(raw.why_fit ?? previous?.why_fit),
    why_skip: cleanText(raw.why_skip ?? previous?.why_skip),
    research_report: researchReport,
    resources,
    jobs_found: normalizeJobsFound(raw.jobs_found !== undefined ? raw.jobs_found : previous?.jobs_found),
    postings_scanned: cleanNumber(raw.postings_scanned ?? previous?.postings_scanned, 0),
    postings_added: cleanNumber(raw.postings_added ?? previous?.postings_added, 0),
    last_researched_at: cleanText(raw.last_researched_at ?? previous?.last_researched_at),
    last_error: cleanText(raw.last_error ?? previous?.last_error),
    notes: cleanText(raw.notes ?? previous?.notes),
    task_id: cleanText(raw.task_id ?? previous?.task_id),
    prompt_path: cleanText(raw.prompt_path ?? previous?.prompt_path),
    first_seen: cleanText(raw.first_seen || previous?.first_seen || now),
    last_updated: cleanText(raw.last_updated || now),
  };
}

function emptyStore() {
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    scope: 'Conference exhibitor careers research (Target Companies track)',
    event: 'smallsat-2026',
    companies: [],
  };
}

function summarize(companies = []) {
  const byStatus = {};
  for (const company of companies) {
    const key = company.worker_status || 'seeded';
    byStatus[key] = (byStatus[key] || 0) + 1;
  }
  return {
    total: companies.length,
    queued_count: (byStatus.queued_research || 0) + (byStatus.needs_worker || 0) + (byStatus.in_progress || 0),
    researched_count: (byStatus.research_ready || 0) + (byStatus.no_open_roles || 0) + (byStatus.no_fit || 0),
    roles_linked: companies.reduce((n, c) => n + (c.jobs_found?.length || 0), 0),
    by_status: byStatus,
  };
}

export function readExhibitorCompanies(filePath = CANONICAL_EXHIBITOR_FILE) {
  if (!existsSync(filePath)) return emptyStore();
  const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
  const companies = Array.isArray(parsed.companies)
    ? parsed.companies.map(item => normalizeExhibitorCompany(item))
    : [];
  return {
    ...emptyStore(),
    ...parsed,
    version: 1,
    companies,
    summary: summarize(companies),
  };
}

export function writeExhibitorCompanies(store, filePath = CANONICAL_EXHIBITOR_FILE) {
  const companies = (Array.isArray(store?.companies) ? store.companies : [])
    .map(item => normalizeExhibitorCompany(item))
    .sort((a, b) => {
      const boothA = cleanText(a.booth);
      const boothB = cleanText(b.booth);
      const numA = Number(boothA);
      const numB = Number(boothB);
      if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) return numA - numB;
      return a.name.localeCompare(b.name);
    });
  const next = {
    version: 1,
    generated_at: new Date().toISOString(),
    scope: store?.scope || 'Conference exhibitor careers research (Target Companies track)',
    event: store?.event || 'smallsat-2026',
    summary: summarize(companies),
    companies,
  };
  atomicWrite(filePath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function findExhibitorCompany(idOrName, store = readExhibitorCompanies()) {
  const needle = cleanText(idOrName).toLowerCase();
  if (!needle) return null;
  return store.companies.find(item => (
    item.id === idOrName
    || item.id.toLowerCase() === needle
    || item.name.toLowerCase() === needle
  )) || null;
}

export function upsertExhibitorCompany(raw = {}, filePath = CANONICAL_EXHIBITOR_FILE) {
  const store = readExhibitorCompanies(filePath);
  const incoming = normalizeExhibitorCompany(raw);
  if (!incoming.id || !incoming.name) throw new Error('exhibitor company requires id and name');
  const index = store.companies.findIndex(item => item.id === incoming.id);
  if (index < 0) {
    store.companies.push(incoming);
  } else {
    store.companies[index] = normalizeExhibitorCompany({
      ...store.companies[index],
      ...incoming,
      resources: { ...(store.companies[index].resources || {}), ...(incoming.resources || {}) },
      jobs_found: incoming.jobs_found?.length ? incoming.jobs_found : store.companies[index].jobs_found,
      first_seen: store.companies[index].first_seen || incoming.first_seen,
    }, { previous: store.companies[index] });
  }
  const nextStore = writeExhibitorCompanies(store, filePath);
  return { store: nextStore, company: findExhibitorCompany(incoming.id, nextStore) };
}

export function patchExhibitorCompany(id, updates = {}, filePath = CANONICAL_EXHIBITOR_FILE) {
  const store = readExhibitorCompanies(filePath);
  const index = store.companies.findIndex(item => item.id === id || item.name === id);
  if (index < 0) throw new Error(`Exhibitor company not found: ${id}`);
  const previous = store.companies[index];
  store.companies[index] = normalizeExhibitorCompany({
    ...previous,
    ...updates,
    resources: updates.resources === undefined
      ? previous.resources
      : { ...(previous.resources || {}), ...(updates.resources || {}) },
    jobs_found: updates.jobs_found === undefined ? previous.jobs_found : updates.jobs_found,
    last_updated: new Date().toISOString(),
  }, { previous });
  const nextStore = writeExhibitorCompanies(store, filePath);
  return { store: nextStore, company: findExhibitorCompany(previous.id, nextStore) };
}

export function syncExhibitorCompaniesToDashboard({
  sourcePath = CANONICAL_EXHIBITOR_FILE,
  outputPath = DASHBOARD_EXHIBITOR_FILE,
} = {}) {
  const store = readExhibitorCompanies(sourcePath);
  atomicWrite(outputPath, `${JSON.stringify({
    ...store,
    generated_at: new Date().toISOString(),
    source: sourcePath,
    total: store.companies.length,
    count: store.companies.length,
  }, null, 2)}\n`);
  return readExhibitorCompanies(outputPath);
}
