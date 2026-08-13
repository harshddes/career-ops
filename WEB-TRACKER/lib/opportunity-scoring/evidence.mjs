import { createHash } from 'crypto';

export const EVIDENCE_SCHEMA_VERSION = 'opportunity-evidence-v1';
export const ALLOWED_CLAIM_FIELDS = new Set([
  'work_authorization',
  'clearance',
  'degree_level',
  'funding',
  'daily_work',
  'hands_on_work',
  'technical_domain',
  'role_level',
  'location',
  'deadline',
]);
const FORBIDDEN_AGENT_FIELDS = new Set([
  'score',
  'canonical_score',
  'fit_score',
  'score_band',
  'tier',
  'recommendation',
  'penalty',
  'override',
  'eligibility',
  'confidence',
]);

export function normalizeEvidenceText(value = '') {
  return String(value).replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}

export function fingerprintPosting(sourceText = '') {
  return createHash('sha256').update(String(sourceText), 'utf8').digest('hex');
}

function includesVerifiedQuote(sourceText, quote) {
  const rawSource = String(sourceText);
  const rawQuote = String(quote || '').trim();
  if (!rawQuote) return false;
  return rawSource.includes(rawQuote)
    || normalizeEvidenceText(rawSource).includes(normalizeEvidenceText(rawQuote));
}

function findForbiddenFields(value, path = '$', found = []) {
  if (!value || typeof value !== 'object') return found;
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (FORBIDDEN_AGENT_FIELDS.has(key)) found.push(nextPath);
    if (entry && typeof entry === 'object') findForbiddenFields(entry, nextPath, found);
  }
  return found;
}

export function validateEvidenceExtraction(extraction = {}, {
  sourceText = '',
  policy,
} = {}) {
  const accepted = [];
  const rejected = [];
  const unknowns = Array.isArray(extraction?.unknowns)
    ? extraction.unknowns.map(value => normalizeEvidenceText(value)).filter(Boolean)
    : [];
  const forbidden = findForbiddenFields(extraction);
  for (const field of forbidden) {
    rejected.push({ reason: 'agent_decision_field_forbidden', field });
  }

  if (extraction?.schema_version !== EVIDENCE_SCHEMA_VERSION) {
    rejected.push({
      reason: 'unsupported_schema_version',
      received: normalizeEvidenceText(extraction?.schema_version),
    });
  }

  const candidateFacts = new Set((policy?.candidate_facts || []).map(fact => fact.id));
  const claims = Array.isArray(extraction?.claims) ? extraction.claims : [];
  if (!Array.isArray(extraction?.claims)) {
    rejected.push({ reason: 'claims_must_be_an_array' });
  }

  claims.forEach((claim, index) => {
    const field = normalizeEvidenceText(claim?.field);
    const quote = String(claim?.quote || '').trim();
    const factIds = Array.isArray(claim?.candidate_fact_ids)
      ? [...new Set(claim.candidate_fact_ids.map(value => normalizeEvidenceText(value)).filter(Boolean))]
      : [];
    const reasons = [];
    if (!ALLOWED_CLAIM_FIELDS.has(field)) reasons.push('unsupported_claim_field');
    if (!includesVerifiedQuote(sourceText, quote)) reasons.push('quote_not_found_in_posting');
    const invalidFactIds = factIds.filter(id => !candidateFacts.has(id));
    if (invalidFactIds.length) reasons.push('unknown_candidate_fact_id');
    if (reasons.length) {
      rejected.push({ index, field, quote, invalid_candidate_fact_ids: invalidFactIds, reasons });
      return;
    }
    accepted.push({
      field,
      value: claim?.value ?? null,
      quote,
      source_location: normalizeEvidenceText(claim?.source_location) || 'posting',
      candidate_fact_ids: factIds,
    });
  });

  return {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    posting_fingerprint: fingerprintPosting(sourceText),
    accepted,
    rejected,
    unknowns,
    extractor: {
      provider: normalizeEvidenceText(extraction?.extractor?.provider),
      model: normalizeEvidenceText(extraction?.extractor?.model),
      run_id: normalizeEvidenceText(extraction?.extractor?.run_id),
    },
    valid: rejected.length === 0,
  };
}

export function createEvidenceExtractionTemplate() {
  return {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    source_url: '',
    claims: [{
      field: 'hands_on_work',
      value: '',
      quote: '',
      source_location: '',
      candidate_fact_ids: [],
    }],
    unknowns: [],
    extractor: { provider: '', model: '', run_id: '' },
  };
}
