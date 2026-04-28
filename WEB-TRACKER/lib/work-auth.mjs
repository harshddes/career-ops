const REGION_BY_COUNTRY = {
  US: 'US',
  CA: 'North America',
  UK: 'UK',
  GB: 'UK',
  CH: 'Europe',
  DE: 'Europe',
  FR: 'Europe',
  NL: 'Europe',
  SE: 'Europe',
  IT: 'Europe',
  JP: 'Asia',
  KR: 'Asia',
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

export function parseVisaVerdict(text = '') {
  const raw = String(text);
  const lower = raw.toLowerCase();
  if (lower.includes('visa: skip') || lower.includes('visa skip') || lower.includes('itar hard') || lower.includes('u.s. person')) {
    return 'skip';
  }
  if (lower.includes('visa: caution') || lower.includes('visa caution') || lower.includes('soft block') || lower.includes('export ctrl')) {
    return 'caution';
  }
  if (lower.includes('visa: clear') || lower.includes('visa clear')) return 'clear';
  return 'unknown';
}

export function parseExportControlVerdict(text = '') {
  const lower = String(text).toLowerCase();
  if (lower.includes('u.s. person') || lower.includes('citizens only') || lower.includes('clearance required') || lower.includes('ts/sci')) {
    return 'hard_us_person';
  }
  if (lower.includes('itar') || lower.includes('ear') || lower.includes('export control')) return 'soft_or_review';
  return 'unknown';
}
