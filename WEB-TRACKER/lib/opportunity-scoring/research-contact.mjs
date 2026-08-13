/**
 * Dedicated research-contact technical-fit scorer.
 * Tier = technical fit only. Relationship / funding / openings never alter Tier.
 */
import { readFileSync } from 'fs';
import yaml from 'js-yaml';
import { fingerprintPosting } from './evidence.mjs';
import { DEFAULT_PROFILE_PATH } from './policy.mjs';
import {
  RESEARCH_CONCEPTS,
  conceptsByPolarity,
  facultyEvidenceText,
  matchResearchConcepts,
} from './concepts.mjs';

export const RESEARCH_EVIDENCE_SCHEMA_VERSION = 'research-evidence-v1';
export const RESEARCH_CONTACT_POLICY_VERSION = '2026-08-research-contact-v1';

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function rounded(value) {
  return Number(Math.max(0, Math.min(5, Number(value) || 0)).toFixed(1));
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function loadResearchContactScoringPolicy(profilePath = DEFAULT_PROFILE_PATH) {
  const profile = yaml.load(readFileSync(profilePath, 'utf8')) || {};
  const policy = profile.research_contact_scoring;
  if (!policy || typeof policy !== 'object') {
    throw new Error('research_contact_scoring is missing from profile.yml');
  }
  if (!String(policy.policy_version || '').trim()) {
    throw new Error('research_contact_scoring.policy_version is required');
  }
  const weights = Object.values(policy.dimensions || {}).map(item => Number(item?.weight));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(`research_contact_scoring weights must sum to 1; received ${total}`);
  }
  return policy;
}

function tierForScore(score, thresholds = {}) {
  if (score >= Number(thresholds.tier_a ?? 4)) return 'A';
  if (score >= Number(thresholds.tier_b ?? 3)) return 'B';
  if (score >= Number(thresholds.tier_c ?? 2)) return 'C';
  return 'D';
}

function dimension(id, score, policy, evidence = [], rationale = '') {
  const weight = Number(policy.dimensions[id]?.weight || 0);
  return {
    score: rounded(score),
    weight,
    contribution: Number((rounded(score) * weight).toFixed(2)),
    evidence,
    rationale,
  };
}

function relationshipSignal(prospect = {}) {
  const status = clean(prospect.status || prospect.outreach_category).toLowerCase();
  const detail = clean(prospect.outreach_status_detail || prospect.outreach_outcome).toLowerCase();
  if (status === 'responded_positive' || /strong positive|positive_reply/.test(`${status} ${detail}`)) {
    return {
      status: 'positive',
      label: 'Encouraging interaction',
      strength: 'strong',
      note: clean(prospect.outreach_outcome || prospect.outreach_status_detail || 'Positive reply on record'),
    };
  }
  if (status === 'responded_negative' || /replied/.test(status)) {
    return {
      status: 'replied',
      label: 'Reply on record',
      strength: 'neutral',
      note: clean(prospect.outreach_outcome || 'Reply recorded; not scored as technical fit'),
    };
  }
  if (status === 'contacted' || status === 'followed_up') {
    return {
      status: 'contacted',
      label: 'Contacted',
      strength: 'pending',
      note: 'Outreach sent; awaiting technical follow-up',
    };
  }
  return {
    status: 'none',
    label: 'No relationship signal used for Tier',
    strength: 'none',
    note: '',
  };
}

function fundingOpeningSignal(prospect = {}) {
  const openings = (prospect.hiring_signals || []).filter(item => item?.type === 'hiring_signal' || /opening|phd|position/i.test(item?.label || ''));
  const funding = (prospect.hiring_signals || []).filter(item => item?.type === 'funding_signal' || /grant|fund/i.test(item?.label || ''));
  const grants = Array.isArray(prospect.active_grants) ? prospect.active_grants : [];
  const openingStatus = clean(prospect.opportunity_status).toLowerCase();
  let status = 'none';
  if (openings.some(item => /open|active/i.test(item?.note || '')) || /open|active/.test(openingStatus)) {
    status = 'open_opening';
  } else if (openings.length || /closed|historical/.test(openingStatus)) {
    status = 'historical_opening';
  } else if (funding.length || grants.length) {
    status = 'funding_signal';
  }
  return {
    status,
    label: status === 'open_opening'
      ? 'Open hiring/opening signal'
      : status === 'historical_opening'
        ? 'Historical opening'
        : status === 'funding_signal'
          ? 'Funding signal'
          : 'No funding/opening signal',
    openings: openings.map(item => ({ label: item.label, note: item.note, url: item.url })),
    funding: [...funding, ...grants.map(grant => ({ label: grant.title, note: grant.funder, url: grant.source_url }))],
  };
}

function evidenceConfidence(prospect = {}, conceptMatches = []) {
  const reasons = [];
  let value = 1;
  const evidenceUrls = (prospect.evidence || []).filter(item => /^https?:\/\//i.test(item?.url || ''));
  const hasFocus = clean(prospect.current_focus).length >= 40
    || clean(prospect.research_interests_summary).length >= 40
    || (prospect.research_keywords || []).length >= 2;
  const hasMethods = (prospect.methods || []).length >= 1 || (prospect.facilities || []).length >= 1;
  const hasLab = Boolean(clean(prospect.lab_url) || clean(prospect.profile_url));
  const specificConcepts = conceptMatches.filter(item => ![
    'computation_theory',
    'inactive_route',
    'biomedical_only',
    'hardware_fabrication',
  ].includes(item.concept_id));

  if (evidenceUrls.length) {
    value += 1;
    reasons.push('official/profile source');
  }
  if (hasLab) {
    value += 0.7;
    reasons.push('lab or profile URL');
  }
  if (hasFocus) {
    value += 1;
    reasons.push('current work or interests described');
  }
  if (hasMethods) {
    value += 0.8;
    reasons.push('methods/facilities listed');
  }
  if (specificConcepts.length >= 2) {
    value += 0.5;
    reasons.push('multiple specific research concepts');
  }
  if (!hasFocus && specificConcepts.length <= 1) {
    value = Math.min(value, 2);
    reasons.push('thin source detail');
  }

  const numeric = rounded(value);
  const label = numeric >= 4 ? 'high' : numeric >= 2.5 ? 'medium' : 'low';
  return { value: numeric, label, reasons };
}

function skillTransferScore(conceptMatches, policy) {
  const matchedConceptIds = new Set(conceptMatches.map(item => item.concept_id));
  const facts = [];
  for (const fact of policy.candidate_facts || []) {
    const hit = (fact.concept_ids || []).filter(id => matchedConceptIds.has(id));
    if (hit.length) {
      facts.push({
        fact_id: fact.id,
        label: fact.label,
        matched_concept_ids: hit,
      });
    }
  }
  const score = facts.length >= 3 ? 5 : facts.length === 2 ? 4 : facts.length === 1 ? 3 : 1;
  return { score, facts };
}

function domainScore(domainMatches) {
  const ids = unique(domainMatches.map(item => item.concept_id));
  if (ids.some(id => [
    'space_mass_spectrometry',
    'plasma_diagnostics',
    'fusion_exhaust_diagnostics',
    'laser_plasma',
    'space_instrumentation',
    'fusion_plasma',
    'space_plasma',
    'magnum_psi',
  ].includes(id))) {
    return ids.length >= 2 ? 5 : 4.5;
  }
  if (ids.includes('electric_propulsion') || ids.includes('materials_manufacturing')) {
    return 3.8;
  }
  return ids.length ? 2.5 : 1;
}

const STRONG_METHOD_IDS = new Set([
  'space_mass_spectrometry',
  'plasma_diagnostics',
  'fusion_exhaust_diagnostics',
  'cxrs',
  'motional_stark_effect',
  'reflectometry',
  'multispectral_imaging',
  'particle_detection',
  'ion_optics',
  'vacuum_hv_daq',
  'laser_plasma',
  'magnum_psi',
  'space_instrumentation',
  'electric_propulsion',
  'environmental_test',
]);

function methodScore(methodMatches, domainMatches) {
  const ids = unique(methodMatches.map(item => item.concept_id));
  const specific = ids.filter(id => id !== 'hardware_fabrication');
  if (specific.some(id => STRONG_METHOD_IDS.has(id))) {
    return specific.filter(id => STRONG_METHOD_IDS.has(id)).length >= 2 ? 5 : 4.3;
  }
  if (specific.includes('materials_manufacturing')) {
    return 3.8;
  }
  if (ids.includes('hardware_fabrication') && domainMatches.length) {
    return 3.2;
  }
  return ids.length ? 2 : 1;
}

function routeScore(domainMatches, methodMatches, prospect = {}) {
  if (domainMatches.length && methodMatches.length) return 5;
  if (domainMatches.length) return 4;
  if (methodMatches.length) return 3.2;
  if (/group leader|principal investigator|professor|research scientist|institute scientist/i.test(prospect.title || '')) {
    return 2.5;
  }
  return 1.5;
}

function dailyWorkType({ domainMatches, methodMatches, computationMatches }) {
  if (methodMatches.length >= 2 && domainMatches.length) return 'core_experimental_hardware';
  if (methodMatches.length && domainMatches.length) return 'experimental_hardware';
  if (methodMatches.some(item => item.concept_id === 'materials_manufacturing')) {
    return 'strategic_materials_manufacturing_hardware';
  }
  if (computationMatches.length >= 2 && methodMatches.length < 1) return 'computation_theory_dominant';
  if (domainMatches.length) return 'domain_verified_methods_thin';
  return 'insufficiently_verified';
}

function rationaleFor(result) {
  const overlap = result.verified_overlap.slice(0, 4).join(', ');
  if (result.tier === 'A') {
    return `Direct technical fit via ${overlap}. Confidence ${result.confidence}; relationship and funding are separate signals.`;
  }
  if (result.tier === 'B') {
    return `Credible technical path via ${overlap}. Confidence ${result.confidence}; missing detail lowers confidence, not the domain itself.`;
  }
  if (result.tier === 'C') {
    return `Conditional technical fit${overlap ? ` via ${overlap}` : ''}. ${result.cap_reasons.join(' ') || 'Need clearer experimental/instrumentation concepts.'}`.trim();
  }
  return `Low technical priority. ${result.cap_reasons.join(' ') || 'Verified research concepts do not match the destination path.'}`.trim();
}

function outreachFor(result) {
  if (result.tier === 'A') return `Lead with ${result.verified_overlap.slice(0, 3).join(', ')} and ask about the current experimental bottleneck.`;
  if (result.tier === 'B') return `Ask how ${result.verified_overlap.slice(0, 3).join(', ')} supports current fusion-, space-, laser-, or manufacturing-hardware work.`;
  if (result.tier === 'C') return 'Only outreach after verifying a specific physical experiment, machine, instrument, or fabrication bottleneck.';
  return 'Do not prioritize for technical outreach; retain only as a network reference if useful.';
}

export function scoreResearchContact(prospect = {}, {
  policy = loadResearchContactScoringPolicy(),
} = {}) {
  const sourceText = facultyEvidenceText(prospect);
  const conceptMatches = matchResearchConcepts(sourceText, RESEARCH_CONCEPTS);
  const domainMatches = conceptsByPolarity(conceptMatches, 'domain');
  const methodMatches = conceptsByPolarity(conceptMatches, 'method');
  const computationMatches = conceptsByPolarity(conceptMatches, 'computation');
  const inactiveMatches = conceptsByPolarity(conceptMatches, 'inactive');
  const negativeMatches = conceptsByPolarity(conceptMatches, 'negative');
  const skill = skillTransferScore(conceptMatches, policy);
  const confidence = evidenceConfidence(prospect, conceptMatches);
  const relationship = relationshipSignal(prospect);
  const funding_opening = fundingOpeningSignal(prospect);

  const domain = domainScore(domainMatches);
  const method = methodScore(methodMatches, domainMatches);
  const route = routeScore(domainMatches, methodMatches, prospect);

  const dimensions = {
    domain_alignment: dimension('domain_alignment', domain, policy, domainMatches, `${domainMatches.length} domain concept(s)`),
    method_alignment: dimension('method_alignment', method, policy, methodMatches, `${methodMatches.length} method concept(s)`),
    skill_transfer: dimension('skill_transfer', skill.score, policy, skill.facts, `${skill.facts.length} approved CV fact(s)`),
    route_relevance: dimension('route_relevance', route, policy, [...domainMatches, ...methodMatches].slice(0, 6), 'Route relevance from verified concepts'),
  };

  let scoreBeforeGates = Number(Object.values(dimensions)
    .reduce((sum, entry) => sum + entry.contribution, 0)
    .toFixed(2));

  const caps = [];
  const capReasons = [];
  const strongMethodMatches = methodMatches.filter(item => STRONG_METHOD_IDS.has(item.concept_id));
  const computationDominant = computationMatches.length >= 1 && strongMethodMatches.length < 1;
  if (inactiveMatches.length) {
    caps.push({ id: 'inactive_route', maximum: Number(policy.rules.inactive_route_cap) });
    capReasons.push(`Inactive/non-target route: ${inactiveMatches.map(item => item.concept_id).join(', ')}`);
  }
  if (computationDominant) {
    caps.push({ id: 'computation_dominant', maximum: Number(policy.rules.computation_dominant_cap) });
    capReasons.push('AI/ML/simulation/theory dominates without substantial verified hardware.');
  }
  if (negativeMatches.length && !domainMatches.length) {
    caps.push({ id: 'biomedical_only', maximum: Number(policy.rules.biomedical_only_cap) });
    capReasons.push('Verified topic is outside the destination domains.');
  }

  const cappedScore = caps.reduce((value, cap) => Math.min(value, cap.maximum), scoreBeforeGates);
  const score = rounded(cappedScore);
  const tier = tierForScore(score, policy.thresholds);
  const verifiedOverlap = unique([
    ...domainMatches.map(item => item.concept_id),
    ...methodMatches.map(item => item.concept_id),
  ]).slice(0, 8);

  const missingEvidence = [];
  if (!clean(prospect.current_focus) && !clean(prospect.research_interests_summary) && !(prospect.research_keywords || []).length) {
    missingEvidence.push('current_focus');
  }
  if (!(prospect.methods || []).length) missingEvidence.push('methods');
  if (!(prospect.facilities || []).length) missingEvidence.push('facilities');
  if (!clean(prospect.lab_url) && !clean(prospect.profile_url)) missingEvidence.push('lab_or_profile_url');
  if (confidence.label === 'low') missingEvidence.push('independent_official_evidence');

  const reviewReasons = [];
  if (confidence.label === 'low') reviewReasons.push('low_confidence');
  if (!domainMatches.length && !methodMatches.length) reviewReasons.push('no_specific_research_concepts');
  if (missingEvidence.includes('current_focus')) reviewReasons.push('thin_source_detail');

  const workType = dailyWorkType({ domainMatches, methodMatches, computationMatches });
  const independentHardwareEvidence = methodMatches.length > 0;
  const substantialHardwareVerified = strongMethodMatches.length >= 2
    || (
      strongMethodMatches.length >= 1
      && domainMatches.length > 0
    );

  const result = {
    canonical: true,
    scoring_kind: 'research_contact',
    policy_version: policy.policy_version,
    posting_fingerprint: fingerprintPosting(sourceText),
    opportunity_type: 'research',
    score,
    personal_fit: score,
    score_before_gates: scoreBeforeGates,
    tier,
    priority: tier,
    tier_cap: caps.length ? (score <= 1.9 ? 'D' : 'C') : '',
    cap_reasons: capReasons,
    confidence: confidence.label,
    evidence_confidence: confidence,
    relationship_signal: relationship,
    funding_opening_signal: funding_opening,
    review_required: reviewReasons.length > 0,
    review_reasons: unique(reviewReasons),
    recalibration_pending: false,
    dimensions,
    concepts: conceptMatches,
    verified_overlap: verifiedOverlap,
    missing_evidence: unique(missingEvidence),
    daily_work_type: workType,
    calculation_trace: {
      formula: 'sum(research_dimension_score * weight), then deterministic caps',
      weighted_sum: scoreBeforeGates,
      floors: [],
      caps,
      final_score: score,
      concepts: conceptMatches.map(item => item.concept_id),
    },
    score_breakdown: {
      dimensions,
      daily_work_interest: dimensions.domain_alignment.score,
      hands_on_experimental: dimensions.method_alignment.score,
      direct_skill_contribution: dimensions.skill_transfer.score,
      strategic_learning_value: dimensions.route_relevance.score,
      active_lab_route: route,
      evidence_confidence: confidence.value,
      core_destination_matches: domainMatches.map(item => item.concept_id),
      enabling_hardware_matches: methodMatches.map(item => item.concept_id),
      hands_on_matches: methodMatches.map(item => item.concept_id),
      computation_theory_matches: computationMatches.map(item => item.concept_id),
      candidate_fact_ids: skill.facts.map(item => item.fact_id),
      protected_domain_matches: domainMatches.map(item => item.concept_id),
      computation_dominant: computationDominant,
      independent_hardware_evidence: independentHardwareEvidence,
      substantial_hardware_verified: substantialHardwareVerified,
      policy_version: policy.policy_version,
      strong_matches: verifiedOverlap,
      adjacent_matches: [],
      negative_matches: negativeMatches.map(item => item.concept_id),
    },
    risk_flags: unique([
      ...(computationDominant ? ['computation_dominant_no_hardware_anchor'] : []),
      ...(negativeMatches.length && !domainMatches.length ? ['negative_topic_match'] : []),
      ...(inactiveMatches.length ? ['inactive_route'] : []),
    ]),
    eligibility: {
      status: 'clear',
      reasons: [],
      unknowns: [],
      evidence: [],
    },
    evidence: conceptMatches,
    rejected_evidence: [],
    unknowns: unique(missingEvidence),
    extractor: { provider: 'deterministic', model: 'research-concept-matcher', run_id: '' },
    recommendation: reviewReasons.length ? 'review' : (tier === 'A' || tier === 'B' ? 'outreach' : 'watch'),
  };

  return {
    ...result,
    fit_rationale: rationaleFor(result),
    outreach_angle: outreachFor(result),
    transfer_vectors: verifiedOverlap.slice(0, 6),
    scoring: result,
  };
}

export function createResearchEvidenceTemplate() {
  return {
    schema_version: RESEARCH_EVIDENCE_SCHEMA_VERSION,
    claims: [{
      field: 'research_concept',
      value: '',
      quote: '',
      source_location: '',
      candidate_fact_ids: [],
    }],
    unknowns: [],
    extractor: { provider: '', model: '', run_id: '' },
  };
}
