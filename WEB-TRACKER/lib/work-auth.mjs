const REGION_BY_COUNTRY = {
  US: 'US',
  CA: 'North America',
  MX: 'North America',
  UK: 'UK',
  GB: 'UK',
  CH: 'Europe',
  DE: 'Europe',
  FR: 'Europe',
  NL: 'Europe',
  SE: 'Europe',
  IT: 'Europe',
  ES: 'Europe',
  BE: 'Europe',
  LU: 'Europe',
  PL: 'Europe',
  AT: 'Europe',
  PT: 'Europe',
  IE: 'Europe',
  DK: 'Europe',
  NO: 'Europe',
  FI: 'Europe',
  CZ: 'Europe',
  JP: 'Asia',
  KR: 'Asia',
  IN: 'Asia',
  SG: 'Asia',
  CN: 'Asia',
  HK: 'Asia',
  TW: 'Asia',
  NZ: 'Oceania',
  AU: 'Oceania',
  AR: 'Latin America',
  BR: 'Latin America',
  IL: 'Middle East',
  AE: 'Middle East',
  SA: 'Middle East',
};

const H1B_MAP = {
  confirmed: 'confirmed',
  likely: 'likely',
  mixed: 'mixed',
  unknown: 'unknown',
  cap_exempt: 'cap_exempt',
  restricted: 'unlikely',
  n_a: 'not_applicable',
  n_a_uk: 'not_applicable',
  n_a_eu: 'not_applicable',
  n_a_international: 'not_applicable',
};

function normalizeLegacyH1b(value) {
  const key = String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return H1B_MAP[key] || 'unknown';
}

function inferCountry(source) {
  if (source.country) return source.country;
  const status = String(source.h1b_status || '').toLowerCase();
  if (status.includes('uk')) return 'UK';
  if (status.includes('eu')) return 'EU';
  if (status.includes('international')) return 'International';
  if (source.source_type === 'admissions_page' || source.source_type === 'phd_board') return source.country || 'Unknown';
  return 'US';
}

function inferRegion(source, country) {
  if (source.region) return source.region;
  if (country === 'EU') return 'Europe';
  if (country === 'International') return 'International';
  return REGION_BY_COUNTRY[country] || 'Unknown';
}

function inferWorkPermitModel(source, h1bSponsorship, region) {
  if (source.work_permit_model) return source.work_permit_model;
  if (h1bSponsorship === 'confirmed' || h1bSponsorship === 'likely') return 'us_sponsorship_possible';
  if (h1bSponsorship === 'cap_exempt') return 'cap_exempt_sponsorship_possible';
  if (region === 'Europe' || region === 'UK') return 'local_work_permit_required';
  if (region === 'International') return 'international_org_rules';
  if (h1bSponsorship === 'unlikely') return 'sponsorship_unlikely';
  return 'needs_review';
}

function inferExportControlRisk(source) {
  if (source.export_control_risk) return source.export_control_risk;
  const text = `${source.name || ''} ${source.notes || ''} ${source.source_type || ''}`.toLowerCase();
  if (text.includes('itar') || text.includes('clearance') || text.includes('defense')) return 'elevated';
  if (text.includes('national lab') || source.h1b_status === 'restricted') return 'review';
  return 'unknown';
}

export function normalizeWorkAuth(source = {}) {
  const country = inferCountry(source);
  const region = inferRegion(source, country);
  const h1bSponsorship = source.h1b_sponsorship || normalizeLegacyH1b(source.h1b_status);
  const greenCardSponsorship = source.green_card_sponsorship || 'unknown';
  const exportControlRisk = inferExportControlRisk(source);
  const workPermitModel = inferWorkPermitModel(source, h1bSponsorship, region);

  return {
    country,
    region,
    h1b_sponsorship: h1bSponsorship,
    green_card_sponsorship: greenCardSponsorship,
    export_control_risk: exportControlRisk,
    work_permit_model: workPermitModel,
    work_auth_notes: source.work_auth_notes || source.notes || null,
  };
}

export function enrichOpportunityWithWorkAuth(opportunity, source = {}) {
  const workAuth = normalizeWorkAuth({ ...source, ...opportunity });
  const adjacentFit = classifyAdjacentField(opportunity);
  return {
    ...opportunity,
    ...workAuth,
    adjacent_fields: adjacentFit.fields,
    opt_story_strength: adjacentFit.opt_story_strength,
    opt_story_reason: adjacentFit.reason,
  };
}

export function classifyAdjacentField(opportunity = {}) {
  const text = `${opportunity.title || ''} ${opportunity.description || ''} ${opportunity.location || ''}`.toLowerCase();
  const fields = [];
  const checks = [
    ['aerospace systems', ['space', 'satellite', 'spacecraft', 'aerospace', 'avionics']],
    ['instrumentation and test', ['instrumentation', 'test engineer', 'integration', 'validation', 'verification', 'calibration']],
    ['sensors and diagnostics', ['sensor', 'diagnostic', 'detector', 'readout', 'daq', 'measurement']],
    ['plasma / vacuum / high voltage', ['plasma', 'vacuum', 'high voltage', 'hv', 'pulsed power', 'ion']],
    ['rf / emi / emc', ['rf', 'emi', 'emc', 'antenna', 'radio frequency']],
    ['semiconductor metrology', ['semiconductor', 'metrology', 'thin film', 'materials characterization', 'fab']],
    ['research engineering', ['research engineer', 'research scientist', 'lab', 'experimental']],
    ['energy systems', ['fusion', 'energy', 'power', 'reactor', 'nuclear']],
  ];

  for (const [field, keywords] of checks) {
    if (keywords.some(keyword => text.includes(keyword))) fields.push(field);
  }

  const uniqueFields = [...new Set(fields)];
  let opt_story_strength = 'weak';
  if (uniqueFields.some(f => ['aerospace systems', 'instrumentation and test', 'sensors and diagnostics', 'plasma / vacuum / high voltage'].includes(f))) {
    opt_story_strength = 'strong';
  } else if (uniqueFields.length > 0) {
    opt_story_strength = 'plausible';
  }

  return {
    fields: uniqueFields,
    opt_story_strength,
    reason: uniqueFields.length
      ? `Connect through ${uniqueFields.slice(0, 2).join(' + ')}.`
      : 'Needs a stronger technical relevance story before prioritizing.',
  };
}

/**
 * Nomenclature lock (FN playbook ↔ dashboard):
 * - Research "open / selective / closed" → Jobs `eligibility_band` + `export_control`
 * - Networking org `tier` A/B/C stays company strategy (do NOT rename to Jobs tiers)
 * - Research Prospects A–D and Target Companies 1/2/3 are unrelated ladders — leave alone
 */
export const ELIGIBILITY_BANDS = Object.freeze({
  open: 'open',
  selective: 'selective',
  closed: 'closed',
  unknown: 'unknown',
});

export function parseVisaVerdict(text = '') {
  const raw = String(text);
  const lower = raw.toLowerCase();
  if (
    lower.includes('visa: skip')
    || lower.includes('visa skip')
    || lower.includes('itar hard')
    || lower.includes('u.s. person')
    || lower.includes('us person')
    || lower.includes('citizens only')
    || lower.includes('citizenship required')
  ) {
    return 'skip';
  }
  if (
    lower.includes('visa: caution')
    || lower.includes('visa caution')
    || lower.includes('soft block')
    || lower.includes('export ctrl')
    || lower.includes('review jd + work-auth')
    || lower.includes('confirm sponsorship')
    || lower.includes('ask about sponsorship')
    || lower.includes('export-control scope')
  ) {
    return 'caution';
  }
  if (lower.includes('visa: clear') || lower.includes('visa clear')) return 'clear';
  return 'unknown';
}

export function parseExportControlVerdict(text = '') {
  const lower = String(text).toLowerCase();
  if (
    lower.includes('u.s. person')
    || lower.includes('us person')
    || lower.includes('citizens only')
    || lower.includes('citizenship required')
    || lower.includes('clearance required')
    || lower.includes('ts/sci')
    || lower.includes('itar hard')
    || lower.includes('visa skip')
    || lower.includes('visa: skip')
  ) {
    return 'hard_us_person';
  }
  if (
    lower.includes('itar')
    || /\bear\b/.test(lower)
    || lower.includes('deemed export')
    || lower.includes('export authorization')
    || lower.includes('munitions list')
  ) {
    return 'soft_or_review';
  }
  return 'unknown';
}

export function eligibilityBandFromSignals({
  export_control = '',
  visa_verdict = '',
  region = '',
  h1b_sponsorship = '',
} = {}) {
  if (export_control === 'hard_us_person' || visa_verdict === 'skip') {
    return ELIGIBILITY_BANDS.closed;
  }
  if (export_control === 'soft_or_review' || visa_verdict === 'caution') {
    return ELIGIBILITY_BANDS.selective;
  }
  const nonUs = region && !['US', 'Unknown', ''].includes(region);
  const openSponsorship = ['confirmed', 'likely', 'cap_exempt', 'not_applicable'].includes(h1b_sponsorship);
  if (visa_verdict === 'clear' || nonUs || openSponsorship) {
    return ELIGIBILITY_BANDS.open;
  }
  return ELIGIBILITY_BANDS.unknown;
}

/**
 * Infer Jobs To Consider eligibility from narrative fields without inventing a Jobs "tier".
 * Explicit structured values win over inference.
 */
export function enrichConsiderJobEligibility(job = {}) {
  const narrative = [
    job.recommendation,
    job.notes,
    job.fit_summary,
    job.work_auth_notes,
  ].filter(Boolean).join(' · ');

  const visa_verdict = job.visa_verdict || parseVisaVerdict(narrative);
  let export_control = String(job.export_control || '').trim();
  if (!export_control || export_control === 'unknown') {
    const parsed = parseExportControlVerdict(narrative);
    if (parsed !== 'unknown') export_control = parsed;
  }

  let export_control_risk = String(job.export_control_risk || '').trim();
  if (!export_control_risk || export_control_risk === 'unknown') {
    if (export_control === 'hard_us_person') export_control_risk = 'elevated';
    else if (export_control === 'soft_or_review') export_control_risk = 'review';
    else export_control_risk = inferExportControlRisk({
      ...job,
      notes: narrative,
      name: job.company,
    });
  }

  const adjacentSource = {
    title: job.title,
    description: `${job.fit_summary || ''} ${job.recommendation || ''} ${(job.adjacent_fields || []).join(' ')}`,
    location: job.location,
  };
  const adjacentFit = classifyAdjacentField(adjacentSource);
  const adjacent_fields = Array.isArray(job.adjacent_fields) && job.adjacent_fields.length
    ? job.adjacent_fields
    : adjacentFit.fields;
  const opt_story_strength = job.opt_story_strength || adjacentFit.opt_story_strength;

  let h1b_sponsorship = String(job.h1b_sponsorship || '').trim();
  if (!h1b_sponsorship) {
    h1b_sponsorship = normalizeLegacyH1b(job.h1b_status);
  }
  if ((!h1b_sponsorship || h1b_sponsorship === 'unknown') && job.region && job.region !== 'US') {
    h1b_sponsorship = 'not_applicable';
  }

  let green_card_sponsorship = String(job.green_card_sponsorship || '').trim() || 'unknown';
  const workAuth = normalizeWorkAuth({
    ...job,
    h1b_sponsorship,
    green_card_sponsorship,
    export_control_risk,
    region: job.region,
    country: job.country || job.country_code,
  });

  const eligibility_band = job.eligibility_band || eligibilityBandFromSignals({
    export_control,
    visa_verdict,
    region: job.region || workAuth.region,
    h1b_sponsorship: workAuth.h1b_sponsorship,
  });

  return {
    ...job,
    h1b_sponsorship: workAuth.h1b_sponsorship,
    green_card_sponsorship: workAuth.green_card_sponsorship === 'unknown' && green_card_sponsorship !== 'unknown'
      ? green_card_sponsorship
      : workAuth.green_card_sponsorship,
    export_control: export_control || '',
    export_control_risk: workAuth.export_control_risk,
    work_permit_model: job.work_permit_model || workAuth.work_permit_model,
    adjacent_fields,
    opt_story_strength,
    opt_story_reason: job.opt_story_reason || adjacentFit.reason,
    visa_verdict,
    eligibility_band,
  };
}

/** True when apply should be blocked for FN candidates (hard US-person gate). */
export function isHardUsPersonBlock(job = {}) {
  return String(job.export_control || '') === 'hard_us_person'
    || String(job.eligibility_band || '') === ELIGIBILITY_BANDS.closed
    || parseVisaVerdict(`${job.recommendation || ''} ${job.notes || ''}`) === 'skip';
}
