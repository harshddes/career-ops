import { scoreOpportunity } from './engine.mjs';

export const CANONICAL_SCORE_FIELDS = new Set([
  'score',
  'personal_fit',
  'score_band',
  'recommendation',
  'eligibility',
  'dimensions',
  'confidence',
  'policy_version',
  'posting_fingerprint',
  'calculation_trace',
  'review_required',
  'review_reasons',
]);

function cleanLegacyScore(value) {
  if (value === null || value === undefined || value === '') return '';
  return String(value).trim();
}

export function scoreRecord(record = {}, {
  type,
  extraction = null,
  now = new Date(),
  previous = null,
} = {}) {
  const scoring = scoreOpportunity(record, { type, extraction, now });
  const previousLegacy = cleanLegacyScore(previous?.legacy_score);
  const incomingLegacy = cleanLegacyScore(record.legacy_score);
  const unsupportedScore = record.scoring?.canonical === true
    ? ''
    : cleanLegacyScore(record.score);
  const legacyScore = previousLegacy || incomingLegacy || unsupportedScore;
  return {
    ...record,
    ...(legacyScore ? { legacy_score: legacyScore } : {}),
    score: scoring.score,
    score_band: scoring.score_band,
    fit_rationale: scoring.fit_rationale,
    risk_flags: scoring.risk_flags,
    score_breakdown: scoring.score_breakdown,
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
    recommendation: scoring.recommendation,
    urgency: scoring.urgency,
    scoring,
  };
}

export function externalScoreToLegacy(updates = {}, current = {}) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) return updates;
  const next = { ...updates };
  if (Object.prototype.hasOwnProperty.call(next, 'score') && next.scoring?.canonical !== true) {
    const attemptedScore = cleanLegacyScore(next.score);
    next.legacy_score = cleanLegacyScore(current.legacy_score || next.legacy_score || next.score);
    next.score_overrides = [
      ...(Array.isArray(current.score_overrides) ? current.score_overrides : []),
      {
        attempted_value: attemptedScore,
        disposition: 'rejected_as_canonical',
        recorded_at: new Date().toISOString(),
      },
    ];
    delete next.score;
  }
  for (const field of CANONICAL_SCORE_FIELDS) {
    if (field === 'score') continue;
    if (Object.prototype.hasOwnProperty.call(next, field) && next.scoring?.canonical !== true) {
      delete next[field];
    }
  }
  if (next.scoring?.canonical !== true) delete next.scoring;
  return next;
}

export function isCanonicalScoring(value) {
  return Boolean(
    value
    && value.canonical === true
    && typeof value.policy_version === 'string'
    && Number.isFinite(Number(value.score))
    && value.dimensions
    && value.calculation_trace,
  );
}
