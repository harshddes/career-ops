import { scoreOpportunity } from './engine.mjs';
import { scoreResearchContact } from './research-contact.mjs';

export function parseLegacyScore(value) {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function buildMigrationRow(lane, item, type, {
  now = new Date(),
  policy,
} = {}) {
  const legacyScore = item.legacy_score ?? item.score ?? '';
  const numericLegacyScore = parseLegacyScore(legacyScore);
  const scoring = String(type).toLowerCase() === 'research' || item.scoring_kind === 'research_contact'
    ? scoreResearchContact(item)
    : scoreOpportunity(item, { type, now, ...(policy ? { policy } : {}) });
  return {
    lane,
    id: item.id,
    title: item.title || item.name || '',
    legacy_score: legacyScore,
    canonical_score: scoring.score,
    delta: numericLegacyScore === null
      ? null
      : Number((scoring.score - numericLegacyScore).toFixed(2)),
    policy_version: scoring.policy_version,
    eligibility: scoring.eligibility?.status || 'clear',
    confidence: scoring.confidence,
    review_required: scoring.review_required,
    review_reasons: scoring.review_reasons,
    scoring,
  };
}
