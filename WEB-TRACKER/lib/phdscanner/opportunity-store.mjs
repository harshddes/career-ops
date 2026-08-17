import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { scorePhdscannerPosting } from './scoring-profile.mjs';
import { consolidatePhdBoardOpportunities, phdBoardDedupeKey } from './dedupe.mjs';
import { externalScoreToLegacy } from '../opportunity-scoring/index.mjs';
import { readMtimeCachedStore, rememberMtimeStore } from '../mtime-store-cache.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const WEB_TRACKER_DIR = join(LIB_DIR, '..', '..');
export const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
export const CAREER_DATA_DIR = join(CAREER_OPS_DIR, 'data');
export const DASHBOARD_DATA_DIR = join(WEB_TRACKER_DIR, 'data');
export const CANONICAL_PHD_BOARD_FILE = join(CAREER_DATA_DIR, 'phd-board-opportunities.json');
export const CANONICAL_PHDSCANNER_FILE = join(CAREER_DATA_DIR, 'phdscanner-opportunities.json');
export const DASHBOARD_PHDSCANNER_FILE = join(DASHBOARD_DATA_DIR, 'phdscanner-opportunities.json');
export const DASHBOARD_PHD_BOARD_FILE = join(DASHBOARD_DATA_DIR, 'phd-board-opportunities.json');

const DEFAULT_SCAN_SUMMARY = {
  provider: '',
  status: 'never_run',
  scanned_count: 0,
  total_count: 0,
  visible_count: 0,
  archived_count: 0,
  queued_count: 0,
  top_priority_count: 0,
  last_success: '',
  last_error: '',
  threshold_visible: 2.4,
  threshold_strong: 3.2,
  threshold_archive: 2.4,
  attempts: [],
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

function canonicalRank(a, b) {
  const eligibility = { clear: 0, risky: 1, unknown: 2, blocked: 3 };
  const confidence = { high: 0, medium: 1, low: 2 };
  return (eligibility[a.eligibility?.status] ?? 2) - (eligibility[b.eligibility?.status] ?? 2)
    || Number(b.score || 0) - Number(a.score || 0)
    || (confidence[a.confidence] ?? 2) - (confidence[b.confidence] ?? 2)
    || a.title.localeCompare(b.title);
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
  const status = cleanText(value || 'open_unverified').toLowerCase();
  if ([
    'open',
    'open_unverified',
    'needs_deadline_verification',
    'provider_limited',
    'closed',
    'archived',
    'stale_pending_recheck',
    'removed_or_closed',
    'runner_unavailable',
    'failed_retryable',
    'failed_final',
  ].includes(status)) {
    return status;
  }
  return 'open_unverified';
}

function normalizeWorkerStatus(value = '', { score = 0, status = 'open_unverified' } = {}) {
  const clean = cleanText(value).toLowerCase();
  const valid = new Set([
    'not_needed',
    'queued',
    'queued_research',
    'research_ready',
    'queued_pack',
    'application_pack_ready',
    'pack_ready',
    'needs_worker',
    'runner_unavailable',
    'failed_retryable',
    'failed_final',
    'needs_user',
    'completed',
  ]);
  if (valid.has(clean)) return clean;
  return score >= 3.5 && !['closed', 'archived', 'removed_or_closed'].includes(status) ? 'queued' : 'not_needed';
}

function stageFor({ status, score, workerStatus, artifacts }) {
  if (['closed', 'archived', 'removed_or_closed'].includes(status)) return 'applied_or_archived';
  if (['failed_retryable', 'failed_final'].includes(workerStatus)) return workerStatus;
  if (['needs_worker', 'runner_unavailable'].includes(workerStatus)) return 'runner_unavailable';
  if (artifacts.resume_pdf || artifacts.cover_letter_pdf || artifacts.email_draft) return 'pack_ready';
  if (artifacts.research_report) return score >= 4.0 ? 'queued_pack' : 'research_ready';
  if (score >= 4.0) return 'queued_pack';
  if (score >= 3.5) return 'queued_research';
  if (score >= 3.2) return 'scored';
  return 'discovered';
}

function normalizeExecution(raw = {}, previous = {}) {
  const source = raw.execution && typeof raw.execution === 'object' && !Array.isArray(raw.execution)
    ? raw.execution
    : {};
  const prev = previous.execution && typeof previous.execution === 'object' && !Array.isArray(previous.execution)
    ? previous.execution
    : {};
  const stages = new Set(['ready_for_application', 'making_artifacts', 'artifacts_ready', 'applied']);
  const stageProvided = Object.prototype.hasOwnProperty.call(source, 'stage');
  const readyProvided = Object.prototype.hasOwnProperty.call(source, 'ready_checked');
  const stageRaw = stageProvided ? cleanText(source.stage) : cleanText(prev.stage);
  const stage = stages.has(stageRaw) ? stageRaw : null;
  let readyChecked = readyProvided
    ? Boolean(source.ready_checked)
    : (prev.ready_checked !== undefined ? Boolean(prev.ready_checked) : Boolean(stage));
  if (readyProvided && source.ready_checked === false) {
    return {
      stage: null,
      ready_checked: false,
      stage_updated_at: cleanText(source.stage_updated_at || prev.stage_updated_at),
      applied_at: '',
      application_num: null,
      notes: cleanText(source.notes ?? prev.notes),
    };
  }
  if (!readyChecked && !stage) {
    readyChecked = false;
  } else if (stage) {
    readyChecked = true;
  }
  return {
    stage: readyChecked ? (stage || 'ready_for_application') : null,
    ready_checked: readyChecked,
    stage_updated_at: cleanText(source.stage_updated_at || prev.stage_updated_at),
    applied_at: cleanText(source.applied_at || prev.applied_at),
    application_num: source.application_num !== undefined && source.application_num !== null && source.application_num !== ''
      ? cleanNumber(source.application_num, null)
      : (prev.application_num !== undefined && prev.application_num !== null && prev.application_num !== ''
        ? cleanNumber(prev.application_num, null)
        : null),
    notes: cleanText(source.notes ?? prev.notes),
  };
}

export function normalizePhdscannerOpportunityRecord(raw = {}, { previous = null } = {}) {
  const score = cleanNumber(raw.score, 0);
  const now = new Date().toISOString();
  const status = normalizeStatus(raw.status || raw.opportunity_status);
  const rawArtifacts = cleanObject(raw.artifacts);
  const rawResources = cleanObject(raw.resources);
  const artifacts = {
    research_report: cleanText(rawArtifacts.research_report || raw.research_report || rawResources.research_report || rawResources.report_md),
    resume_tex: cleanText(rawArtifacts.resume_tex || rawResources.resume_tex),
    resume_pdf: cleanText(rawArtifacts.resume_pdf || rawResources.resume_pdf),
    cover_letter_pdf: cleanText(rawArtifacts.cover_letter_pdf || rawResources.cover_letter_pdf),
    email_draft: cleanText(rawArtifacts.email_draft || rawResources.email_draft || rawResources.application_email),
    manifest_path: cleanText(rawArtifacts.manifest_path || rawResources.manifest_path),
  };
  const workerStatus = normalizeWorkerStatus(raw.worker_status || raw.automation?.worker_status, { score, status });
  const automation = {
    worker_status: workerStatus,
    current_stage: cleanText(raw.automation?.current_stage) || stageFor({ status, score, workerStatus, artifacts }),
    attempts: cleanNumber(raw.automation?.attempts ?? raw.attempts, 0),
    next_retry_at: cleanText(raw.automation?.next_retry_at || raw.next_retry_at),
    last_error: cleanText(raw.automation?.last_error || raw.last_error),
    runner: cleanText(raw.automation?.runner || raw.runner),
    last_run_at: cleanText(raw.automation?.last_run_at || raw.last_run_at),
  };
  const coverage = {
    provider: cleanText(raw.coverage?.provider || raw.provider || raw.source_provider),
    feed_window: cleanText(raw.coverage?.feed_window || raw.feed_window),
    backfill_profile: cleanText(raw.coverage?.backfill_profile || raw.backfill_profile),
    first_seen: cleanText(raw.coverage?.first_seen || raw.first_seen) || now,
    last_seen: cleanText(raw.coverage?.last_seen || raw.last_seen || raw.last_updated) || now,
    duplicate_of: cleanText(raw.coverage?.duplicate_of || raw.duplicate_of),
  };
  const verificationRequired = raw.verification?.verification_required !== undefined
    ? Boolean(raw.verification.verification_required)
    : status === 'open_unverified' || !cleanText(raw.deadline_utc);
  const verification = {
    deadline_source: cleanText(raw.verification?.deadline_source || (raw.deadline_utc ? 'parsed' : 'missing')),
    status_source: cleanText(raw.verification?.status_source || (status === 'open_unverified' ? 'rss_unverified' : 'parsed')),
    verified_at: cleanText(raw.verification?.verified_at || raw.verified_at),
    verification_required: verificationRequired,
  };
  const decision = {
    apply_recommendation: cleanText(raw.decision?.apply_recommendation || raw.apply_recommendation),
    score,
    confidence: raw.decision?.confidence === undefined ? null : cleanNumber(raw.decision.confidence, null),
    rationale: cleanText(raw.decision?.rationale || raw.fit_rationale),
    archive_reason: cleanText(raw.decision?.archive_reason || raw.archive_reason),
  };
  const resources = cleanObject({
    ...rawResources,
    ...(artifacts.research_report ? { research_report: artifacts.research_report, report_md: artifacts.research_report } : {}),
    ...(artifacts.resume_tex ? { resume_tex: artifacts.resume_tex } : {}),
    ...(artifacts.resume_pdf ? { resume_pdf: artifacts.resume_pdf } : {}),
    ...(artifacts.cover_letter_pdf ? { cover_letter_pdf: artifacts.cover_letter_pdf } : {}),
    ...(artifacts.email_draft ? { email_draft: artifacts.email_draft } : {}),
    ...(artifacts.manifest_path ? { manifest_path: artifacts.manifest_path } : {}),
  });
  const execution = normalizeExecution(raw, previous || raw);
  const sources = Array.isArray(raw.sources)
    ? raw.sources
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        source: cleanText(item.source || 'phdscanner'),
        url: cleanText(item.url),
        external_id: cleanText(item.external_id),
        provider: cleanText(item.provider),
      }))
      .filter(item => item.url || item.external_id)
    : [];
  if (!sources.length && cleanText(raw.url)) {
    sources.push({
      source: cleanText(raw.source || 'phdscanner'),
      url: cleanText(raw.url || raw.application_url || raw.profile_url),
      external_id: cleanText(raw.external_id || raw.id),
      provider: cleanText(raw.provider || raw.coverage?.provider),
    });
  }
  const altUrls = cleanArray(raw.alt_urls || sources.map(item => item.url).filter(url => url && url !== cleanText(raw.url)));
  const dedupeKey = cleanText(raw.dedupe_key) || phdBoardDedupeKey({
    title: raw.title,
    university: raw.university || raw.institution,
    institution: raw.institution || raw.university,
  });
  return {
    id: cleanText(raw.id),
    source: cleanText(raw.source || 'phdscanner'),
    sources,
    alt_urls: altUrls,
    dedupe_key: dedupeKey,
    provider: coverage.provider,
    external_id: cleanText(raw.external_id),
    url: cleanText(raw.url || raw.application_url || raw.profile_url),
    title: cleanText(raw.title || raw.name),
    institution: cleanText(raw.institution || raw.university || raw.company || 'PhDScanner'),
    university: cleanText(raw.university || raw.institution || raw.company || 'PhDScanner'),
    discipline: cleanText(raw.discipline || raw.department),
    department: cleanText(raw.department || raw.discipline),
    supervisor: cleanText(raw.supervisor),
    fully_funded: Boolean(raw.fully_funded),
    minimal_financial_barriers: Boolean(raw.minimal_financial_barriers),
    funding_label: cleanText(raw.funding_label),
    published_at: cleanText(raw.published_at || raw.posted_at),
    country: cleanText(raw.country || raw.location || raw.campus),
    summary: cleanText(raw.summary || raw.notes),
    posted_at: cleanText(raw.posted_at),
    deadline_text: cleanText(raw.deadline_text),
    deadline_utc: cleanText(raw.deadline_utc),
    status,
    liveness: cleanText(raw.liveness || (['open', 'open_unverified'].includes(status) ? 'active' : status)),
    liveness_reason: cleanText(raw.liveness_reason),
    score,
    score_band: cleanText(raw.score_band) || (score >= 4 ? 'top_priority' : score >= 3.2 ? 'strong_review' : score >= 2.4 ? 'adjacent_review' : 'archive'),
    tier: cleanText(raw.tier),
    visible: raw.visible === undefined ? score >= 2.4 && status !== 'archived' : Boolean(raw.visible),
    archived: raw.archived === undefined ? score < 2.4 || status === 'archived' : Boolean(raw.archived),
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
    research_fields: cleanArray(raw.research_fields),
    academic_level: cleanText(raw.academic_level),
    researcher_profile: cleanText(raw.researcher_profile),
    language: cleanText(raw.language),
    translated_title: cleanText(raw.translated_title),
    translated_summary: cleanText(raw.translated_summary),
    needs_research: Boolean(raw.needs_research || raw.needs_deep_research),
    needs_application_pack: Boolean(raw.needs_application_pack),
    worker_status: workerStatus,
    research_report: artifacts.research_report,
    resources,
    coverage,
    verification,
    automation,
    artifacts,
    decision,
    execution,
    jobs_to_consider_id: cleanText(raw.jobs_to_consider_id),
    first_seen: coverage.first_seen,
    last_updated: cleanText(raw.last_updated) || now,
  };
}

function summarize(opportunities = [], scanSummary = {}) {
  const total = opportunities.length;
  const visible = opportunities.filter(item => item.visible && !item.archived).length;
  const strong = opportunities.filter(item => !item.archived && ['top_priority', 'strong_review'].includes(item.score_band)).length;
  const adjacent = opportunities.filter(item => !item.archived && item.score_band === 'adjacent_review').length;
  const archived = opportunities.filter(item => item.archived).length;
  const queued = opportunities.filter(item => [
    'queued',
    'queued_research',
    'queued_pack',
    'needs_worker',
    'runner_unavailable',
  ].includes(item.worker_status)).length;
  const top = opportunities.filter(item => item.score >= 4.0).length;
  const factory = {
    research_ready_count: opportunities.filter(item => item.automation?.current_stage === 'research_ready' || item.worker_status === 'research_ready').length,
    pack_ready_count: opportunities.filter(item => ['pack_ready', 'application_pack_ready'].includes(item.automation?.current_stage) || ['pack_ready', 'application_pack_ready'].includes(item.worker_status)).length,
    needs_worker_count: opportunities.filter(item => ['needs_worker', 'runner_unavailable'].includes(item.worker_status)).length,
    failed_count: opportunities.filter(item => ['failed_retryable', 'failed_final'].includes(item.worker_status)).length,
    with_artifacts_count: opportunities.filter(item => item.research_report || item.artifacts?.research_report || item.resources?.resume_pdf || item.artifacts?.resume_pdf).length,
  };
  return {
    ...DEFAULT_SCAN_SUMMARY,
    ...scanSummary,
    total_count: total,
    visible_count: visible,
    strong_count: strong,
    adjacent_count: adjacent,
    archived_count: archived,
    queued_count: queued,
    top_priority_count: top,
    factory: {
      ...(scanSummary.factory || {}),
      ...factory,
    },
  };
}

function isManualArchive(item = {}) {
  const reason = cleanText(item.decision?.archive_reason || item.archive_reason);
  return item.status === 'archived' || /archived from dashboard/i.test(reason);
}

function shouldLiftProtectedManualArchive(item = {}, scoring = {}) {
  const protectedHits = scoring.score_breakdown?.protected_domain_matches || [];
  if (!protectedHits.length) return false;
  if ((scoring.risk_flags || []).includes('deadline_passed')) return false;
  if ((scoring.risk_flags || []).includes('role_not_targeted')) return false;
  if ((scoring.risk_flags || []).includes('protected_domain_wrong_role')) return false;
  return isManualArchive(item);
}

export function rescorePhdscannerOpportunities({ filePath = CANONICAL_PHDSCANNER_FILE, now = new Date() } = {}) {
  const existing = readPhdscannerOpportunities(filePath);
  const opportunities = (existing.opportunities || []).map(item => {
    const scoring = scorePhdscannerPosting({
      title: item.title,
      summary: item.summary,
      description: item.summary,
      institution: item.institution,
      university: item.university,
      country: item.country,
      discipline: item.discipline,
      department: item.department,
      supervisor: item.supervisor,
      research_fields: item.research_fields,
      academic_level: item.academic_level,
      researcher_profile: item.researcher_profile,
      deadline_utc: item.deadline_utc,
    }, now);
    const liftManual = shouldLiftProtectedManualArchive(item, scoring);
    const manual = isManualArchive(item) && !liftManual;
    const deadlinePassed = scoring.risk_flags.includes('deadline_passed');
    const nextStatus = manual
      ? 'archived'
      : (deadlinePassed ? 'closed' : (liftManual ? 'open_unverified' : item.status));
    const decision = liftManual
      ? {
        ...(item.decision && typeof item.decision === 'object' ? item.decision : {}),
        archive_reason: '',
        unarchived_reason: 'Protected domain floor: restored from manual archive (deadline not passed).',
      }
      : item.decision;
    return normalizePhdscannerOpportunityRecord({
      ...item,
      decision,
      archive_reason: liftManual ? '' : item.archive_reason,
      score: scoring.score,
      score_band: scoring.score_band,
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
      needs_research: scoring.needs_deep_research && ['open', 'open_unverified'].includes(nextStatus),
      needs_application_pack: scoring.needs_application_pack && ['open', 'open_unverified'].includes(nextStatus),
      visible: manual ? false : scoring.visible,
      archived: manual ? true : scoring.archived,
      status: nextStatus,
      liveness: nextStatus === 'closed' ? 'closed' : (liftManual ? 'active' : item.liveness),
      liveness_reason: deadlinePassed
        ? 'deadline has passed'
        : (liftManual ? 'Restored: protected domain without passed deadline' : (item.liveness_reason || '')),
      worker_status: item.worker_status && item.worker_status !== 'not_needed'
        ? item.worker_status
        : (scoring.needs_deep_research && ['open', 'open_unverified'].includes(nextStatus) ? 'queued' : 'not_needed'),
      last_updated: now.toISOString(),
    });
  });
  return writePhdscannerOpportunities({
    ...existing,
    scan_summary: {
      ...existing.scan_summary,
      last_success: existing.scan_summary?.last_success || now.toISOString(),
      rescored_at: now.toISOString(),
    },
    opportunities,
  }, filePath);
}

function emptyStore() {
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    scope: 'PhD board live research opportunities (PhDScanner + FindAPhD)',
    scan_summary: { ...DEFAULT_SCAN_SUMMARY },
    opportunities: [],
  };
}

function resolveReadPath(filePath = CANONICAL_PHDSCANNER_FILE) {
  if (existsSync(filePath)) return filePath;
  if (filePath === CANONICAL_PHDSCANNER_FILE && existsSync(CANONICAL_PHD_BOARD_FILE)) return CANONICAL_PHD_BOARD_FILE;
  if (filePath === CANONICAL_PHD_BOARD_FILE && existsSync(CANONICAL_PHDSCANNER_FILE)) return CANONICAL_PHDSCANNER_FILE;
  return filePath;
}

export function readPhdscannerOpportunities(filePath = CANONICAL_PHDSCANNER_FILE) {
  const resolved = resolveReadPath(filePath);
  return readMtimeCachedStore(resolved, {
    empty: emptyStore,
    parse: (parsed) => {
      const opportunities = Array.isArray(parsed.opportunities)
        ? parsed.opportunities.map(normalizePhdscannerOpportunityRecord)
        : [];
      return {
        ...emptyStore(),
        ...parsed,
        version: 1,
        opportunities,
        scan_summary: summarize(opportunities, parsed.scan_summary || {}),
      };
    },
  });
}

export function writePhdscannerOpportunities(store, filePath = CANONICAL_PHDSCANNER_FILE) {
  const opportunities = consolidatePhdBoardOpportunities(
    (Array.isArray(store?.opportunities) ? store.opportunities : []).map(normalizePhdscannerOpportunityRecord),
  )
    .map(normalizePhdscannerOpportunityRecord)
    .sort(canonicalRank);
  const next = {
    version: 1,
    generated_at: new Date().toISOString(),
    scope: store?.scope || 'PhD board live research opportunities (PhDScanner + FindAPhD)',
    scan_summary: summarize(opportunities, store?.scan_summary || {}),
    opportunities,
  };
  const payload = `${JSON.stringify(next, null, 2)}\n`;
  atomicWrite(filePath, payload);
  rememberMtimeStore(filePath, next);
  // Dual-write compatibility paths
  if (filePath === CANONICAL_PHDSCANNER_FILE) {
    atomicWrite(CANONICAL_PHD_BOARD_FILE, payload);
    rememberMtimeStore(CANONICAL_PHD_BOARD_FILE, next);
  }
  if (filePath === CANONICAL_PHD_BOARD_FILE) {
    atomicWrite(CANONICAL_PHDSCANNER_FILE, payload);
    rememberMtimeStore(CANONICAL_PHDSCANNER_FILE, next);
  }
  return next;
}

export function mergePhdscannerOpportunities(incoming = [], { scanSummary = {}, filePath = CANONICAL_PHDSCANNER_FILE } = {}) {
  const existing = readPhdscannerOpportunities(filePath);
  const byId = new Map(existing.opportunities.map(item => [item.id, item]));
  const byDedupe = new Map(
    existing.opportunities
      .filter(item => item.dedupe_key)
      .map(item => [item.dedupe_key, item]),
  );
  const newOpportunities = [];
  for (const raw of incoming) {
    const opportunity = normalizePhdscannerOpportunityRecord(raw);
    if (!opportunity.id) continue;
    const previous = byId.get(opportunity.id)
      || (opportunity.dedupe_key ? byDedupe.get(opportunity.dedupe_key) : null)
      || existing.opportunities.find(item => (item.sources || []).some(source =>
        source.external_id && source.external_id === opportunity.external_id
      ));
    if (!previous) newOpportunities.push(opportunity);
    const manual = previous && isManualArchive(previous);
    const merged = normalizePhdscannerOpportunityRecord({
      ...(previous || {}),
      ...opportunity,
      id: previous?.id?.startsWith('phdboard-') ? previous.id : opportunity.id,
      score: Math.max(Number(previous?.score || 0), Number(opportunity.score || 0)) || opportunity.score,
      score_band: Number(opportunity.score || 0) >= Number(previous?.score || 0) ? opportunity.score_band : (previous?.score_band || opportunity.score_band),
      fit_rationale: Number(opportunity.score || 0) >= Number(previous?.score || 0) ? opportunity.fit_rationale : (previous?.fit_rationale || opportunity.fit_rationale),
      risk_flags: [...new Set([...(previous?.risk_flags || []), ...(opportunity.risk_flags || [])])],
      score_breakdown: Number(opportunity.score || 0) >= Number(previous?.score || 0) ? opportunity.score_breakdown : (previous?.score_breakdown || opportunity.score_breakdown),
      visible: manual ? false : opportunity.visible,
      archived: manual ? true : opportunity.archived,
      status: manual ? 'archived' : opportunity.status,
      first_seen: previous?.first_seen || opportunity.first_seen,
      sources: [
        ...(previous?.sources || []),
        ...(opportunity.sources || [{
          source: opportunity.source,
          url: opportunity.url,
          external_id: opportunity.external_id,
          provider: opportunity.provider,
        }]),
      ],
      resources: { ...(previous?.resources || {}), ...(opportunity.resources || {}) },
      artifacts: { ...(previous?.artifacts || {}), ...(opportunity.artifacts || {}) },
      coverage: {
        ...(previous?.coverage || {}),
        ...(opportunity.coverage || {}),
        first_seen: previous?.coverage?.first_seen || previous?.first_seen || opportunity.coverage?.first_seen,
        last_seen: opportunity.coverage?.last_seen || new Date().toISOString(),
      },
      verification: { ...(previous?.verification || {}), ...(opportunity.verification || {}) },
      automation: previous?.automation?.current_stage && !['discovered', 'scored'].includes(previous.automation.current_stage)
        ? { ...(opportunity.automation || {}), ...(previous.automation || {}) }
        : { ...(previous?.automation || {}), ...(opportunity.automation || {}) },
      decision: {
        ...(previous?.decision || {}),
        ...(opportunity.decision || {}),
        ...(manual ? { archive_reason: previous.decision?.archive_reason || previous.archive_reason } : {}),
      },
      execution: previous?.execution || opportunity.execution,
      research_report: previous?.research_report || opportunity.research_report,
      jobs_to_consider_id: previous?.jobs_to_consider_id || opportunity.jobs_to_consider_id,
      worker_status: previous?.worker_status && previous.worker_status !== 'not_needed'
        ? previous.worker_status
        : opportunity.worker_status,
      last_updated: new Date().toISOString(),
    });
    // Drop stale source-specific id if we matched a cluster by dedupe.
    if (previous && previous.id !== opportunity.id) byId.delete(opportunity.id);
    byId.set(merged.id, merged);
    if (merged.dedupe_key) byDedupe.set(merged.dedupe_key, merged);
  }
  const store = writePhdscannerOpportunities({
    ...existing,
    scan_summary: {
      ...existing.scan_summary,
      ...scanSummary,
    },
    opportunities: [...byId.values()],
  }, filePath);
  return { store, newOpportunities };
}

export function findPhdscannerOpportunity(id, store = readPhdscannerOpportunities()) {
  const needle = String(id || '');
  return store.opportunities.find(item => (
    item.id === needle
    || item.external_id === needle
    || item.url === needle
    || item.dedupe_key === needle
    || (item.sources || []).some(source => source.external_id === needle || source.url === needle)
  )) || null;
}

export function patchPhdscannerOpportunity(id, updates = {}, filePath = CANONICAL_PHDSCANNER_FILE) {
  const store = readPhdscannerOpportunities(filePath);
  const index = store.opportunities.findIndex(item => (
    item.id === id
    || item.external_id === id
    || item.url === id
    || item.dedupe_key === id
    || (item.sources || []).some(source => source.external_id === id || source.url === id)
  ));
  if (index < 0) throw new Error(`PhDScanner opportunity not found: ${id}`);
  const previous = store.opportunities[index];
  updates = externalScoreToLegacy(updates, previous);
  store.opportunities[index] = normalizePhdscannerOpportunityRecord({
    ...previous,
    ...updates,
    resources: updates.resources === undefined
      ? previous.resources
      : { ...(previous.resources || {}), ...(updates.resources || {}) },
    artifacts: updates.artifacts === undefined
      ? previous.artifacts
      : { ...(previous.artifacts || {}), ...(updates.artifacts || {}) },
    coverage: updates.coverage === undefined
      ? previous.coverage
      : { ...(previous.coverage || {}), ...(updates.coverage || {}) },
    verification: updates.verification === undefined
      ? previous.verification
      : { ...(previous.verification || {}), ...(updates.verification || {}) },
    automation: updates.automation === undefined
      ? previous.automation
      : { ...(previous.automation || {}), ...(updates.automation || {}) },
    decision: updates.decision === undefined
      ? previous.decision
      : { ...(previous.decision || {}), ...(updates.decision || {}) },
    execution: updates.execution === undefined
      ? previous.execution
      : { ...(previous.execution || {}), ...(updates.execution || {}) },
    last_updated: new Date().toISOString(),
  }, { previous });
  const nextStore = writePhdscannerOpportunities(store, filePath);
  return { store: nextStore, opportunity: findPhdscannerOpportunity(id, nextStore) };
}

export function syncPhdscannerOpportunitiesToDashboard({
  sourcePath = CANONICAL_PHDSCANNER_FILE,
  outputPath = DASHBOARD_PHDSCANNER_FILE,
} = {}) {
  const store = readPhdscannerOpportunities(sourcePath);
  const payload = `${JSON.stringify({
    ...store,
    generated_at: new Date().toISOString(),
    source: sourcePath,
    total: store.opportunities.length,
    count: store.opportunities.length,
  }, null, 2)}\n`;
  atomicWrite(outputPath, payload);
  atomicWrite(DASHBOARD_PHD_BOARD_FILE, payload);
  return readPhdscannerOpportunities(outputPath);
}

