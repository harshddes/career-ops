/**
 * U-M Careers opportunity store.
 *
 * Canonical store (with full descriptions): data/umich-careers-opportunities.json
 * Dashboard projection (descriptions trimmed): WEB-TRACKER/data/umich-careers-opportunities.json
 *
 * Closure contract: a posting missing from the catalog is only marked closed
 * after two consecutive COMPLETE crawls (every pagination request succeeded
 * and per-type counts reconcile with the landing page) fail to list it, or
 * when its own posting end date has passed. Partial scans never delete or
 * close anything.
 */

import { existsSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { scoreUmichPosting, UMICH_SEGMENTS } from './scoring-profile.mjs';
import { externalScoreToLegacy } from '../opportunity-scoring/index.mjs';
import { readMtimeCachedStore, rememberMtimeStore } from '../mtime-store-cache.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const WEB_TRACKER_DIR = join(LIB_DIR, '..', '..');
export const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
export const CAREER_DATA_DIR = join(CAREER_OPS_DIR, 'data');
export const DASHBOARD_DATA_DIR = join(WEB_TRACKER_DIR, 'data');
export const CANONICAL_UMICH_FILE = join(CAREER_DATA_DIR, 'umich-careers-opportunities.json');
export const DASHBOARD_UMICH_FILE = join(DASHBOARD_DATA_DIR, 'umich-careers-opportunities.json');

/** Cards keep enough description for evidence context without shipping ~1MB to the browser. */
export const DASHBOARD_DESCRIPTION_CHARS = 600;
const MISSED_CRAWLS_TO_CLOSE = 2;

const DEFAULT_SCAN_HEALTH = {
  status: 'never_run',
  last_mode: '',
  last_started: '',
  last_success: '',
  last_full_reconcile: '',
  last_error: '',
  complete: false,
  pages_fetched: 0,
  pages_failed: 0,
  landing_counts: { fullTime: null, partTime: null },
  crawled_counts: { F: 0, P: 0 },
  counts_reconciled: false,
  detail_failures: 0,
  errors: [],
};

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanArray(value = []) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))];
}

function cleanObject(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
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

function normalizeStatus(value = '') {
  const status = cleanText(value || 'open').toLowerCase();
  return ['open', 'closed', 'removed'].includes(status) ? status : 'open';
}

/** User-hid a card from the active feed (EURAXESS/PhDScanner-equivalent). */
export function umichIsManualArchive(item = {}) {
  return Boolean(item?.archived);
}

function normalizeSegment(value = '') {
  const segment = cleanText(value).toLowerCase();
  return UMICH_SEGMENTS.includes(segment) ? segment : 'other';
}

export function normalizeUmichOpportunityRecord(raw = {}) {
  const now = new Date().toISOString();
  const jobId = cleanText(raw.job_id || raw.external_id);
  const status = normalizeStatus(raw.status);
  return {
    id: cleanText(raw.id) || (jobId ? `umich-careers-${jobId}` : ''),
    source: 'umich_careers',
    job_id: jobId,
    url: cleanText(raw.url),
    apply_url: cleanText(raw.apply_url),
    title: cleanText(raw.title),
    working_title: cleanText(raw.working_title),
    job_title: cleanText(raw.job_title),
    department: cleanText(raw.department),
    organizational_group: cleanText(raw.organizational_group),
    career_interest: cleanText(raw.career_interest),
    work_location: cleanText(raw.work_location),
    city_location: cleanText(raw.city_location),
    modes_of_work: cleanText(raw.modes_of_work),
    employment_type: cleanText(raw.employment_type),
    catalog_type: (() => {
      const key = cleanText(raw.catalog_type).toUpperCase();
      if (key === 'F' || key === 'P') return key;
      if (/full/i.test(raw.employment_type || '')) return 'F';
      if (/part/i.test(raw.employment_type || '')) return 'P';
      return key;
    })(),
    regular_temporary: cleanText(raw.regular_temporary),
    flsa_status: cleanText(raw.flsa_status),
    salary_text: cleanText(raw.salary_text),
    date_posted: cleanText(raw.date_posted),
    posting_begin_date: cleanText(raw.posting_begin_date),
    posting_end_date: cleanText(raw.posting_end_date),
    posting_begin_end_text: cleanText(raw.posting_begin_end_text),
    description: String(raw.description ?? '').trim(),
    description_hash: cleanText(raw.description_hash),
    detail_fetched_at: cleanText(raw.detail_fetched_at),
    detail_error: cleanText(raw.detail_error),
    status,
    closed_reason: cleanText(raw.closed_reason),
    closed_at: cleanText(raw.closed_at),
    archived: Boolean(raw.archived),
    archive_reason: cleanText(raw.archive_reason || raw.decision?.archive_reason),
    archived_at: cleanText(raw.archived_at),
    missing_crawl_count: Math.max(0, Math.trunc(cleanNumber(raw.missing_crawl_count, 0))),
    score: cleanNumber(raw.score, 0),
    segment: status === 'open' ? normalizeSegment(raw.segment) : 'closed',
    visible: raw.visible === undefined ? false : Boolean(raw.visible),
    direct_domain: Boolean(raw.direct_domain),
    fit_rationale: cleanText(raw.fit_rationale),
    risk_flags: cleanArray(raw.risk_flags),
    score_breakdown: cleanObject(raw.score_breakdown),
    legacy_score: cleanText(raw.legacy_score),
    score_overrides: Array.isArray(raw.score_overrides) ? raw.score_overrides : [],
    policy_version: cleanText(raw.policy_version || raw.scoring?.policy_version),
    posting_fingerprint: cleanText(raw.posting_fingerprint || raw.scoring?.posting_fingerprint),
    eligibility: cleanObject(raw.eligibility || raw.scoring?.eligibility),
    dimensions: cleanObject(raw.dimensions || raw.scoring?.dimensions),
    evidence: Array.isArray(raw.evidence) ? raw.evidence : (raw.scoring?.evidence || []),
    rejected_evidence: Array.isArray(raw.rejected_evidence) ? raw.rejected_evidence : (raw.scoring?.rejected_evidence || []),
    unknowns: cleanArray(raw.unknowns || raw.scoring?.unknowns),
    confidence: cleanText(raw.confidence || raw.scoring?.confidence),
    review_required: Boolean(raw.review_required ?? raw.scoring?.review_required),
    review_reasons: cleanArray(raw.review_reasons || raw.scoring?.review_reasons),
    calculation_trace: cleanObject(raw.calculation_trace || raw.scoring?.calculation_trace),
    score_before_gates: cleanNumber(raw.score_before_gates ?? raw.scoring?.score_before_gates, 0),
    extractor: cleanObject(raw.extractor || raw.scoring?.extractor),
    urgency: cleanObject(raw.urgency || raw.scoring?.urgency),
    scoring: cleanObject(raw.scoring),
    jobs_to_consider_id: cleanText(raw.jobs_to_consider_id),
    applied: Boolean(raw.applied),
    applied_at: cleanText(raw.applied_at),
    application_num: raw.application_num === null || raw.application_num === undefined || raw.application_num === ''
      ? null
      : Math.trunc(cleanNumber(raw.application_num, 0)) || null,
    first_seen: cleanText(raw.first_seen) || now,
    last_seen: cleanText(raw.last_seen) || now,
    last_updated: cleanText(raw.last_updated) || now,
  };
}

export function descriptionHash(text = '') {
  const str = String(text);
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function summarize(opportunities = [], scanHealth = {}) {
  const open = opportunities.filter(item => item.status === 'open');
  const archived = opportunities.filter(item => item.archived);
  const segmentCounts = {};
  for (const segment of UMICH_SEGMENTS) segmentCounts[segment] = 0;
  for (const item of opportunities) {
    segmentCounts[item.segment] = (segmentCounts[item.segment] || 0) + 1;
  }
  return {
    ...DEFAULT_SCAN_HEALTH,
    ...scanHealth,
    total_count: opportunities.length,
    open_count: open.length,
    closed_count: opportunities.length - open.length,
    archived_count: archived.length,
    applied_count: opportunities.filter(item => item.applied).length,
    apply_now_count: opportunities.filter(item => !item.archived && !item.applied && item.segment === 'apply_now').length,
    high_relevance_count: opportunities.filter(item => !item.archived && !item.applied && item.segment === 'high_relevance').length,
    adjacent_count: opportunities.filter(item => !item.archived && !item.applied && item.segment === 'adjacent').length,
    other_count: opportunities.filter(item => !item.archived && !item.applied && item.segment === 'other').length,
    segment_counts: segmentCounts,
    full_time_count: open.filter(item => !item.archived && /full/i.test(item.employment_type)).length,
    part_time_count: open.filter(item => !item.archived && /part/i.test(item.employment_type)).length,
    missing_detail_count: open.filter(item => !item.detail_fetched_at).length,
  };
}

function emptyStore() {
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    scope: 'University of Michigan Careers — full/part-time postings',
    scan_health: { ...DEFAULT_SCAN_HEALTH },
    opportunities: [],
  };
}

export function readUmichOpportunities(filePath = CANONICAL_UMICH_FILE) {
  return readMtimeCachedStore(filePath, {
    empty: emptyStore,
    parse: (parsed) => {
      const opportunities = Array.isArray(parsed.opportunities)
        ? parsed.opportunities.map(normalizeUmichOpportunityRecord).filter(item => item.id)
        : [];
      return {
        ...emptyStore(),
        ...parsed,
        version: 1,
        opportunities,
        scan_health: summarize(opportunities, parsed.scan_health || {}),
      };
    },
  });
}

const SEGMENT_ORDER = Object.fromEntries(UMICH_SEGMENTS.map((segment, index) => [segment, index]));

function canonicalRank(a, b) {
  const eligibility = { clear: 0, risky: 1, unknown: 2, blocked: 3 };
  const confidence = { high: 0, medium: 1, low: 2 };
  return (eligibility[a.eligibility?.status] ?? 2) - (eligibility[b.eligibility?.status] ?? 2)
    || Number(b.score || 0) - Number(a.score || 0)
    || (confidence[a.confidence] ?? 2) - (confidence[b.confidence] ?? 2)
    || (SEGMENT_ORDER[a.segment] ?? 9) - (SEGMENT_ORDER[b.segment] ?? 9)
    || a.title.localeCompare(b.title);
}

export function writeUmichOpportunities(store, filePath = CANONICAL_UMICH_FILE) {
  const opportunities = (Array.isArray(store?.opportunities) ? store.opportunities : [])
    .map(normalizeUmichOpportunityRecord)
    .filter(item => item.id)
    .sort(canonicalRank);
  const next = {
    version: 1,
    generated_at: new Date().toISOString(),
    scope: store?.scope || 'University of Michigan Careers — full/part-time postings',
    scan_health: summarize(opportunities, store?.scan_health || {}),
    opportunities,
  };
  atomicWrite(filePath, `${JSON.stringify(next, null, 2)}\n`);
  rememberMtimeStore(filePath, next);
  return next;
}

function rescoreRecord(item, now) {
  const scoring = scoreUmichPosting({
    title: item.title,
    working_title: item.working_title,
    job_title: item.job_title,
    department: item.department,
    career_interest: item.career_interest,
    organizational_group: item.organizational_group,
    description: item.description,
    posting_end_date: item.posting_end_date,
    status: item.status,
  }, now);
  const closedByDate = scoring.segment === 'closed' && item.status === 'open';
  return normalizeUmichOpportunityRecord({
    ...item,
    score: scoring.score,
    segment: scoring.segment,
    visible: item.archived ? false : scoring.visible,
    direct_domain: scoring.direct_domain,
    fit_rationale: scoring.fit_rationale,
    risk_flags: scoring.risk_flags,
    score_breakdown: scoring.score_breakdown,
    legacy_score: item.legacy_score || item.score,
    policy_version: scoring.policy_version,
    posting_fingerprint: scoring.posting_fingerprint,
    eligibility: scoring.eligibility,
    dimensions: scoring.dimensions,
    evidence: scoring.evidence,
    rejected_evidence: scoring.rejected_evidence,
    unknowns: scoring.unknowns,
    confidence: scoring.confidence,
    review_required: scoring.review_required,
    review_reasons: scoring.review_reasons,
    calculation_trace: scoring.calculation_trace,
    score_before_gates: scoring.score_before_gates,
    extractor: scoring.extractor,
    urgency: scoring.urgency,
    scoring,
    status: closedByDate ? 'closed' : item.status,
    closed_reason: closedByDate ? (item.closed_reason || 'posting end date passed') : item.closed_reason,
    closed_at: closedByDate ? (item.closed_at || now.toISOString()) : item.closed_at,
      // Manual archive survives rescans/rescores until the user unarchives.
      archived: Boolean(item.archived),
      archive_reason: item.archive_reason,
      archived_at: item.archived_at,
      // Applied state survives rescans until the user unchecks Applied.
      applied: Boolean(item.applied),
      applied_at: item.applied_at,
      application_num: item.application_num,
      last_updated: now.toISOString(),
  });
}

export function rescoreUmichOpportunities({ filePath = CANONICAL_UMICH_FILE, now = new Date() } = {}) {
  const existing = readUmichOpportunities(filePath);
  const opportunities = (existing.opportunities || []).map(item => rescoreRecord(item, now));
  return writeUmichOpportunities({
    ...existing,
    scan_health: { ...existing.scan_health, rescored_at: now.toISOString() },
    opportunities,
  }, filePath);
}

/**
 * Merge crawled rows (+optional hydrated details) into the store.
 *
 * @param {Array} rows        - listing rows from crawlCatalog()
 * @param {Map}   details     - Map<job_id, detail> from hydrateDetails()
 * @param {object} options
 *   - completeCrawl: every pagination request succeeded AND counts reconciled;
 *     enables missing-posting bookkeeping (never mark closed on partial data).
 *   - scanHealth: health fields persisted onto the store.
 */
export function mergeUmichCrawl(rows = [], details = new Map(), {
  completeCrawl = false,
  scanHealth = {},
  filePath = CANONICAL_UMICH_FILE,
  now = new Date(),
} = {}) {
  const existing = readUmichOpportunities(filePath);
  const byId = new Map(existing.opportunities.map(item => [item.id, item]));
  const seenIds = new Set();
  const newOpportunities = [];
  const nowIso = now.toISOString();

  for (const row of rows) {
    const jobId = cleanText(row.job_id);
    if (!jobId) continue;
    const id = `umich-careers-${jobId}`;
    seenIds.add(id);
    const previous = byId.get(id) || null;
    const detail = details.get(jobId) || null;

    const merged = normalizeUmichOpportunityRecord({
      ...(previous || {}),
      ...row,
      ...(detail ? {
        working_title: detail.working_title,
        job_title: detail.job_title,
        work_location: detail.work_location || row.work_location,
        city_location: detail.city_location,
        modes_of_work: detail.modes_of_work,
        employment_type: detail.employment_type || row.employment_type,
        regular_temporary: detail.regular_temporary,
        flsa_status: detail.flsa_status,
        organizational_group: detail.organizational_group,
        department: detail.department || row.department,
        posting_begin_date: detail.posting_begin_date,
        posting_end_date: detail.posting_end_date,
        posting_begin_end_text: detail.posting_begin_end_text,
        salary_text: detail.salary_text,
        career_interest: detail.career_interest,
        apply_url: detail.apply_url,
        description: detail.description_text,
        description_hash: descriptionHash(detail.description_text),
        detail_fetched_at: nowIso,
        detail_error: '',
      } : {}),
      id,
      job_id: jobId,
      status: 'open',
      closed_reason: '',
      closed_at: '',
      missing_crawl_count: 0,
      first_seen: previous?.first_seen || nowIso,
      last_seen: nowIso,
      last_updated: nowIso,
      jobs_to_consider_id: previous?.jobs_to_consider_id || '',
      // Manual archive survives crawl merges until the user unarchives.
      archived: Boolean(previous?.archived),
      archive_reason: previous?.archive_reason || '',
      archived_at: previous?.archived_at || '',
      // Applied state + Applications tracker link survive crawl merges.
      applied: Boolean(previous?.applied),
      applied_at: previous?.applied_at || '',
      application_num: previous?.application_num ?? null,
    });

    // A previously closed posting that reappears in the catalog is reopened.
    const rescored = rescoreRecord(merged, now);
    if (!previous) newOpportunities.push(rescored);
    byId.set(id, rescored);
  }

  let closedCount = 0;
  if (completeCrawl) {
    for (const [id, item] of byId) {
      if (seenIds.has(id) || item.status !== 'open') continue;
      const missing = item.missing_crawl_count + 1;
      if (missing >= MISSED_CRAWLS_TO_CLOSE) {
        closedCount += 1;
        byId.set(id, normalizeUmichOpportunityRecord({
          ...item,
          status: 'closed',
          segment: 'closed',
          visible: false,
          closed_reason: `absent from ${MISSED_CRAWLS_TO_CLOSE} consecutive complete crawls`,
          closed_at: nowIso,
          missing_crawl_count: missing,
          last_updated: nowIso,
        }));
      } else {
        byId.set(id, normalizeUmichOpportunityRecord({
          ...item,
          missing_crawl_count: missing,
          last_updated: nowIso,
        }));
      }
    }
  }

  const store = writeUmichOpportunities({
    ...existing,
    scan_health: {
      ...existing.scan_health,
      ...scanHealth,
      complete: completeCrawl,
    },
    opportunities: [...byId.values()],
  }, filePath);

  return { store, newOpportunities, closedCount };
}

export function findUmichOpportunity(id, store = readUmichOpportunities()) {
  const needle = cleanText(id);
  return store.opportunities.find(item => item.id === needle || item.job_id === needle || item.url === needle) || null;
}

export function patchUmichOpportunity(id, updates = {}, filePath = CANONICAL_UMICH_FILE) {
  const store = readUmichOpportunities(filePath);
  const needle = cleanText(id);
  const index = store.opportunities.findIndex(item => item.id === needle || item.job_id === needle || item.url === needle);
  if (index < 0) throw new Error(`U-M Careers opportunity not found: ${id}`);
  const previous = store.opportunities[index];
  updates = externalScoreToLegacy(updates, previous);
  store.opportunities[index] = normalizeUmichOpportunityRecord({
    ...previous,
    ...updates,
    score_breakdown: updates.score_breakdown === undefined
      ? previous.score_breakdown
      : { ...(previous.score_breakdown || {}), ...(updates.score_breakdown || {}) },
    last_updated: new Date().toISOString(),
  });
  const nextStore = writeUmichOpportunities(store, filePath);
  return { store: nextStore, opportunity: findUmichOpportunity(needle, nextStore) };
}

export function archiveUmichOpportunity(id, {
  reason = 'Archived from dashboard.',
  force = false,
  filePath = CANONICAL_UMICH_FILE,
} = {}) {
  const existing = findUmichOpportunity(id, readUmichOpportunities(filePath));
  if (!existing) throw new Error(`U-M Careers opportunity not found: ${id}`);
  // Reuse the same protected-domain gate as EURAXESS/PhDScanner when available.
  // Callers in server.mjs invoke assertCanArchiveOpportunity before this helper.
  void force;
  return patchUmichOpportunity(id, {
    archived: true,
    visible: false,
    archive_reason: reason,
    archived_at: new Date().toISOString(),
  }, filePath);
}

export function unarchiveUmichOpportunity(id, filePath = CANONICAL_UMICH_FILE) {
  const existing = findUmichOpportunity(id, readUmichOpportunities(filePath));
  if (!existing) throw new Error(`U-M Careers opportunity not found: ${id}`);
  return patchUmichOpportunity(id, {
    archived: false,
    archive_reason: '',
    archived_at: '',
    visible: existing.segment !== 'closed' && existing.status === 'open',
  }, filePath);
}

/** Dashboard projection: same records, descriptions trimmed for the browser. */
export function syncUmichOpportunitiesToDashboard({
  sourcePath = CANONICAL_UMICH_FILE,
  outputPath = DASHBOARD_UMICH_FILE,
} = {}) {
  const store = readUmichOpportunities(sourcePath);
  const opportunities = store.opportunities.map(item => ({
    ...item,
    description: item.description.length > DASHBOARD_DESCRIPTION_CHARS
      ? `${item.description.slice(0, DASHBOARD_DESCRIPTION_CHARS)}…`
      : item.description,
  }));
  const output = {
    ...store,
    generated_at: new Date().toISOString(),
    source: sourcePath,
    total: opportunities.length,
    count: opportunities.length,
    opportunities,
  };
  atomicWrite(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  rememberMtimeStore(outputPath, output);
  return output;
}

function fileMtimeMs(filePath) {
  try {
    return existsSync(filePath) ? statSync(filePath).mtimeMs : 0;
  } catch {
    return 0;
  }
}

/** Build the trimmed dashboard copy when missing or older than the canonical store. */
export function ensureUmichDashboardProjection({
  sourcePath = CANONICAL_UMICH_FILE,
  outputPath = DASHBOARD_UMICH_FILE,
} = {}) {
  if (!existsSync(sourcePath)) {
    return readUmichOpportunities(existsSync(outputPath) ? outputPath : sourcePath);
  }
  const needsSync = !existsSync(outputPath) || fileMtimeMs(sourcePath) > fileMtimeMs(outputPath);
  if (needsSync) syncUmichOpportunitiesToDashboard({ sourcePath, outputPath });
  return readUmichOpportunities(outputPath);
}
