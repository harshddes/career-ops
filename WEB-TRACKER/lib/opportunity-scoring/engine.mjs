import { fingerprintPosting, validateEvidenceExtraction } from './evidence.mjs';
import { loadOpportunityScoringPolicy, validateOpportunityScoringPolicy } from './policy.mjs';

const CLOSED_STATES = new Set(['closed', 'archived', 'removed', 'removed_or_closed']);

function clean(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function termPattern(term) {
  return new RegExp(`(^|[^a-z0-9])(${escapeRegExp(term)})(?=$|[^a-z0-9])`, 'ig');
}

function matchTerms(sourceText, terms = []) {
  const matches = [];
  for (const term of terms) {
    const match = termPattern(term).exec(sourceText);
    if (match) {
      matches.push({
        term,
        quote: match[2],
        source_location: 'posting_text',
      });
    }
  }
  return matches;
}

function termExistsOutsideFalseFriends(sourceText, term, falseFriends = []) {
  let remaining = String(sourceText);
  for (const phrase of falseFriends) {
    if (String(phrase).toLowerCase().includes(String(term).toLowerCase())) {
      remaining = remaining.replace(new RegExp(escapeRegExp(phrase), 'ig'), ' ');
    }
  }
  return termPattern(term).test(remaining);
}

function sourceTextFor(posting = {}) {
  const parts = [
    posting.title,
    posting.working_title,
    posting.job_title,
    posting.summary,
    posting.description,
    posting.posting_text,
    posting.current_focus,
    posting.recent_publication,
    posting.research_interests_summary,
    posting.lab,
    posting.institution,
    posting.university,
    posting.department,
    posting.discipline,
    posting.career_interest,
    posting.academic_level,
    posting.researcher_profile,
    ...(Array.isArray(posting.research_fields) ? posting.research_fields : []),
    ...(Array.isArray(posting.methods) ? posting.methods : []),
    ...(Array.isArray(posting.facilities) ? posting.facilities : []),
  ];
  return parts.map(clean).filter(Boolean).join('\n');
}

function numericAnchor(count, anchors) {
  for (const [minimum, score] of anchors) {
    if (count >= minimum) return score;
  }
  return 0;
}

function scoreBand(score, thresholds) {
  if (score >= Number(thresholds.apply)) return 'apply';
  if (score >= Number(thresholds.consider)) return 'consider';
  if (score >= Number(thresholds.visible)) return 'adjacent';
  return 'skip';
}

function compatibilityBand(band) {
  return {
    apply: 'top_priority',
    consider: 'strong_review',
    adjacent: 'adjacent_review',
    skip: 'archive',
  }[band];
}

function evidenceList(matches = []) {
  return matches.map(match => ({
    source: 'direct_parser',
    term: match.term,
    quote: match.quote,
    source_location: match.source_location,
  }));
}

function dimension(id, score, policy, evidence = [], rationale = '') {
  const weight = Number(policy.dimensions[id].weight);
  return {
    score,
    weight,
    contribution: Number((score * weight).toFixed(4)),
    evidence,
    rationale,
  };
}

function deadlineState(posting, now) {
  const raw = posting.deadline_utc || posting.posting_end_date || posting.deadline;
  if (!clean(raw)) return { state: 'unknown', reason: 'deadline_not_stated' };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { state: 'unknown', reason: 'deadline_unparseable' };
  return parsed.getTime() < now.getTime()
    ? { state: 'blocked', reason: 'deadline_passed' }
    : { state: 'clear', reason: 'deadline_open' };
}

function urgencyFor(posting, now) {
  const raw = posting.deadline_utc || posting.posting_end_date || posting.deadline;
  if (!clean(raw)) return { status: 'unknown', days_remaining: null };
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { status: 'unknown', days_remaining: null };
  const days = Math.ceil((parsed.getTime() - now.getTime()) / 86_400_000);
  return {
    status: days < 0 ? 'overdue' : days <= 7 ? 'urgent' : days <= 30 ? 'soon' : 'normal',
    days_remaining: days,
  };
}

function eligibilityFor(posting, type, matches, now) {
  const status = clean(posting.status || posting.opportunity_status).toLowerCase();
  const reasons = [];
  const unknowns = [];
  const deadline = type === 'research'
    ? { state: 'clear', reason: 'not_applicable' }
    : deadlineState(posting, now);

  if (CLOSED_STATES.has(status)) reasons.push('posting_closed');
  if (deadline.state === 'blocked') reasons.push(deadline.reason);
  if (matches.hard_block.length) reasons.push('explicit_legal_or_clearance_block');
  if (deadline.state === 'unknown') unknowns.push(deadline.reason);

  if (reasons.length) {
    return { status: 'blocked', reasons, unknowns, evidence: evidenceList(matches.hard_block) };
  }
  if (matches.soft_block.length) {
    return {
      status: 'risky',
      reasons: ['work_authorization_or_export_control_risk'],
      unknowns,
      evidence: evidenceList(matches.soft_block),
    };
  }

  if (type === 'phd') {
    const fundingKnown = posting.fully_funded === true
      || clean(posting.funding_label)
      || /\b(funded|funding|stipend|studentship|tuition)\b/i.test(sourceTextFor(posting));
    if (!fundingKnown) unknowns.push('phd_funding_not_stated');
  }
  if (
    type === 'job'
    && !matches.hard_block.length
    && !matches.soft_block.length
    && !matches.work_auth_clear.length
  ) {
    unknowns.push('work_authorization_not_stated');
  }
  return {
    status: unknowns.length ? 'unknown' : 'clear',
    reasons: [],
    unknowns,
    evidence: [],
  };
}

function canonicalType(value = '') {
  const type = clean(value).toLowerCase();
  if (['phd', 'doctoral', 'euraxess', 'phdscanner', 'findaphd'].includes(type)) return 'phd';
  if (['research', 'research_prospect', 'faculty'].includes(type)) return 'research';
  return 'job';
}

export function scoreOpportunity(posting = {}, {
  type = posting.type || posting.source || 'job',
  policy = loadOpportunityScoringPolicy(),
  extraction = null,
  now = new Date(),
} = {}) {
  validateOpportunityScoringPolicy(policy);
  const opportunityType = canonicalType(type);
  const sourceText = sourceTextFor(posting);
  const urgency = urgencyFor(posting, now);
  const groups = policy.terms;
  const matches = Object.fromEntries(Object.entries(groups).map(([name, terms]) => [name, matchTerms(sourceText, terms)]));
  matches.destination = matches.destination.filter(match => (
    termExistsOutsideFalseFriends(sourceText, match.term, groups.false_friend || [])
  ));
  const extractions = Array.isArray(extraction) ? extraction : (extraction ? [extraction] : []);
  const validatedExtractions = extractions.map(item => (
    validateEvidenceExtraction(item, { sourceText, policy })
  ));
  const claimSignatures = validatedExtractions.map(result => JSON.stringify(
    result.accepted.map(claim => ({
      field: claim.field,
      value: claim.value,
      quote: claim.quote,
      candidate_fact_ids: claim.candidate_fact_ids,
    })),
  ));
  const extractionConflict = new Set(claimSignatures).size > 1;
  const extractionResult = validatedExtractions.length
    ? {
      ...validatedExtractions[0],
      rejected: validatedExtractions.flatMap(result => result.rejected),
      unknowns: [
        ...validatedExtractions.flatMap(result => result.unknowns),
        ...(extractionConflict ? ['extraction_conflict'] : []),
      ],
      valid: validatedExtractions.every(result => result.valid) && !extractionConflict,
      extractor: validatedExtractions.length === 1
        ? validatedExtractions[0].extractor
        : validatedExtractions.map(result => result.extractor),
    }
    : {
      accepted: [],
      rejected: [],
      unknowns: [],
      extractor: { provider: 'deterministic', model: 'direct-parser', run_id: '' },
      valid: true,
    };
  const eligibility = eligibilityFor(posting, opportunityType, matches, now);

  const candidateFactMatches = [];
  for (const fact of policy.candidate_facts) {
    const factTerms = matchTerms(sourceText, fact.terms);
    if (factTerms.length) {
      candidateFactMatches.push({
        fact_id: fact.id,
        label: fact.label,
        matched_terms: factTerms.map(match => match.term),
        quotes: factTerms.map(match => match.quote),
      });
    }
  }

  const computationDominant = matches.computation.length >= 2
    && matches.hands_on.length < 3
    && matches.destination.length === 0;
  const wrongRole = opportunityType !== 'research' && matches.wrong_role.length > 0;
  const negativeTopic = matches.negative_topic.length > 0 && matches.destination.length === 0;

  let dailyScore = 1;
  if (matches.destination.length && matches.hands_on.length >= 2) dailyScore = 5;
  else if (matches.destination.length && matches.hands_on.length) dailyScore = 4;
  else if (matches.hands_on.length >= 3) dailyScore = 4;
  else if (matches.hands_on.length || matches.adjacent.length >= 2) dailyScore = 3;
  else if (matches.destination.length || matches.adjacent.length) dailyScore = 2;
  if (computationDominant) dailyScore = Math.min(dailyScore, 1);
  if (wrongRole || negativeTopic) dailyScore = Math.min(dailyScore, 1);

  const handsOnScore = numericAnchor(matches.hands_on.length, [[5, 5], [3, 4], [2, 3], [1, 2], [0, 1]]);
  const directEvidenceScore = numericAnchor(candidateFactMatches.length, [[3, 5], [2, 4], [1, 3], [0, 1]]);
  const destinationScore = numericAnchor(matches.destination.length, [[3, 5], [2, 4], [1, 3], [0, 1]]);
  const levelScore = wrongRole ? 0 : (matches.role_positive.length ? 4 : 2);
  const feasibilityScore = {
    blocked: 0,
    risky: 2,
    unknown: 4,
    clear: 4,
  }[eligibility.status];

  const dimensions = {
    daily_work_interest: dimension(
      'daily_work_interest',
      dailyScore,
      policy,
      evidenceList([...matches.destination, ...matches.hands_on, ...matches.computation, ...matches.negative_topic]),
      computationDominant ? 'Computation dominates without verified physical work.' : 'Anchored from verified work and domain terms.',
    ),
    hands_on_alignment: dimension(
      'hands_on_alignment',
      handsOnScore,
      policy,
      evidenceList(matches.hands_on),
      `${matches.hands_on.length} physical-work anchors verified.`,
    ),
    direct_skill_evidence: dimension(
      'direct_skill_evidence',
      directEvidenceScore,
      policy,
      candidateFactMatches,
      `${candidateFactMatches.length} approved candidate fact(s) matched.`,
    ),
    destination_alignment: dimension(
      'destination_alignment',
      destinationScore,
      policy,
      evidenceList(matches.destination),
      `${matches.destination.length} destination anchor(s) verified.`,
    ),
    level_plausibility: dimension(
      'level_plausibility',
      levelScore,
      policy,
      evidenceList([...matches.role_positive, ...matches.wrong_role]),
      wrongRole ? 'A clearly senior academic role conflicts with the target level.' : 'Role level is anchored or remains uncertain.',
    ),
    application_feasibility: dimension(
      'application_feasibility',
      feasibilityScore,
      policy,
      eligibility.evidence,
      `Eligibility is ${eligibility.status}.`,
    ),
  };

  const scoreBeforeGates = Number(Object.values(dimensions)
    .reduce((sum, entry) => sum + entry.contribution, 0)
    .toFixed(2));
  const caps = [];
  if (eligibility.status === 'blocked') {
    caps.push({ id: 'hard_block', maximum: Number(policy.rules.hard_block_score_cap) });
  }
  if (computationDominant) {
    caps.push({ id: 'computation_dominant', maximum: Number(policy.rules.computation_dominant_cap) });
  }
  if (wrongRole) caps.push({ id: 'wrong_role', maximum: Number(policy.rules.wrong_role_cap) });
  if (negativeTopic) caps.push({ id: 'negative_topic', maximum: Number(policy.rules.wrong_role_cap) });
  if (opportunityType === 'research' && handsOnScore < 3) {
    caps.push({ id: 'research_hardware_evidence_gate', maximum: 2.9 });
  } else if (opportunityType === 'research' && handsOnScore < 4) {
    caps.push({ id: 'research_tier_a_hardware_gate', maximum: 3.9 });
  }

  const floors = [];
  if (
    (
      matches.destination.length
      || matches.adjacent.length >= 2
      || (matches.adjacent.length && matches.hands_on.length)
    )
    && (matches.role_positive.length || opportunityType === 'phd')
    && !wrongRole
    && !negativeTopic
    && eligibility.status !== 'blocked'
  ) {
    floors.push({
      id: 'protected_domain_visibility',
      minimum: Number(policy.rules.protected_domain_visibility_floor),
    });
  }
  if (opportunityType === 'research' && computationDominant) {
    floors.push({ id: 'conditional_learning_route', minimum: 2.0 });
  }
  const flooredScore = floors.reduce((value, floor) => Math.max(value, floor.minimum), scoreBeforeGates);
  const cappedScore = caps.reduce((value, cap) => Math.min(value, cap.maximum), flooredScore);
  const score = Number(Math.max(0, Math.min(5, cappedScore)).toFixed(1));
  const band = scoreBand(score, policy.thresholds);
  const unknowns = [...new Set([...eligibility.unknowns, ...extractionResult.unknowns])];

  let confidence = 'high';
  if (sourceText.length < 120 || extractionResult.rejected.length || unknowns.length >= 2) confidence = 'low';
  else if (sourceText.length < 500 || unknowns.length) confidence = 'medium';

  const reviewReasons = [];
  if (eligibility.status === 'unknown') reviewReasons.push('hard_gate_unknown');
  if (eligibility.status === 'risky') reviewReasons.push('eligibility_risky');
  if (confidence === 'low') reviewReasons.push('low_confidence');
  if (extractionResult.rejected.length) reviewReasons.push('rejected_or_malformed_extraction');
  if (extractionConflict) reviewReasons.push('conflicting_extractions');
  const margin = Number(policy.thresholds.borderline_margin);
  for (const [name, rawThreshold] of Object.entries(policy.thresholds)) {
    if (name === 'borderline_margin') continue;
    if (Math.abs(score - Number(rawThreshold)) <= margin) reviewReasons.push(`borderline_${name}`);
  }

  const reviewRequired = [...new Set(reviewReasons)].length > 0;
  const recommendation = eligibility.status === 'blocked'
    ? 'skip'
    : (reviewRequired ? 'review' : band);
  const riskFlags = [
    ...eligibility.reasons,
    ...(eligibility.reasons.includes('deadline_passed') && matches.destination.length
      ? ['protected_domain_deadline_passed']
      : []),
    ...(eligibility.status === 'risky' ? ['eligibility_risk'] : []),
    ...(floors.length ? ['protected_domain_floor'] : []),
    ...(computationDominant ? ['computation_dominant_no_hardware_anchor'] : []),
    ...(wrongRole ? ['role_not_targeted'] : []),
    ...(negativeTopic ? ['negative_topic_match'] : []),
    ...unknowns,
  ];

  return {
    canonical: true,
    policy_version: policy.policy_version,
    posting_fingerprint: fingerprintPosting(sourceText),
    opportunity_type: opportunityType,
    eligibility,
    score,
    personal_fit: score,
    score_before_gates: scoreBeforeGates,
    score_band: compatibilityBand(band),
    decision_band: band,
    recommendation,
    urgency,
    dimensions,
    evidence: extractionResult.accepted,
    rejected_evidence: extractionResult.rejected,
    unknowns,
    confidence,
    review_required: reviewRequired,
    review_reasons: [...new Set(reviewReasons)],
    calculation_trace: {
      formula: 'sum(dimension_score * dimension_weight), then deterministic caps',
      weighted_sum: scoreBeforeGates,
      floors,
      caps,
      final_score: score,
    },
    extractor: extractionResult.extractor,
    risk_flags: [...new Set(riskFlags)],
    score_breakdown: {
      dimensions,
      strong_matches: [...new Set([...matches.destination, ...matches.hands_on].map(match => match.term))],
      adjacent_matches: [...new Set(matches.adjacent.map(match => match.term))],
      negative_matches: [...new Set(matches.negative_topic.map(match => match.term))],
      candidate_fact_ids: candidateFactMatches.map(match => match.fact_id),
      role_matches: matches.role_positive.map(match => match.term),
      role_archive_matches: matches.wrong_role.map(match => match.term),
      protected_domain_matches: matches.destination.map(match => match.term),
      computation_dominant: computationDominant,
      independent_hardware_evidence: matches.hands_on.length > 0,
      policy_version: policy.policy_version,
    },
    visible: band !== 'skip' && eligibility.status !== 'blocked',
    archived: band === 'skip' || eligibility.status === 'blocked',
    needs_deep_research: reviewRequired && eligibility.status !== 'blocked',
    needs_application_pack: recommendation === 'apply',
    fit_rationale: `${band === 'apply' || band === 'consider' ? 'Strong match. ' : ''}${score.toFixed(1)}/5 ${band}; eligibility ${eligibility.status}; confidence ${confidence}.`,
  };
}
