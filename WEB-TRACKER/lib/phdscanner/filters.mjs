/**
 * PhDScanner dashboard filter predicates.
 * Site filters (country/university/discipline/funded/date) + EURAXESS-style fit/topic.
 * Mutual exclusion: when country is set, discipline filter is ignored (and vice versa), matching PhDScanner.com.
 */

function textOf(item = {}) {
  const breakdown = item.score_breakdown || {};
  return [
    item.title,
    item.summary,
    item.fit_rationale,
    item.discipline,
    item.department,
    item.university,
    item.institution,
    ...(item.research_fields || []),
    ...(breakdown.strong_matches || []),
    ...(breakdown.adjacent_matches || []),
    ...(breakdown.physical_hardware_anchors || []),
  ].filter(Boolean).join(' ');
}

function titleOf(item = {}) {
  return String(item.title || '');
}

export function phdscannerRole(item = {}) {
  const title = titleOf(item);
  if (/\b(post[- ]?doc|post[- ]?doctoral|assistant professor|associate professor|full professor|tenure[- ]track|faculty position|lecturer)\b/i.test(title)) {
    return 'postdoc_faculty';
  }
  if (/\b(phd|doctoral|doctorate|marie\s+curie|dc\d{1,2}|doctoral fellow)\b/i.test(title)) {
    return 'phd';
  }
  if (/\b(engineer|technician|technologist)\b/i.test(title)) {
    return 'engineer';
  }
  if (/\b(researcher|scientist|research fellow|research associate)\b/i.test(title)) {
    return 'researcher';
  }
  return 'other';
}

export function phdscannerTopic(item = {}) {
  const text = textOf(item);
  const rules = [
    ['plasma', /\b(plasma|fusion|tokamak|stellarator|langmuir|neutral\s+beam|heliophysics)\b/i],
    ['space', /\b(space(?:craft|borne|flight)?|cubesat|astrophysics|payload|ionosphere|space\s+weather|space\s+systems|space\s+technologies|space\s+experiments|space\s+applications)\b/i],
    ['cryogenics', /\b(cryogen\w*|synchrotron|beamline|helium\s+liquefaction)\b/i],
    ['detectors', /\b(detector|instrumentation|spectrometer|mass\s+spectrom\w*|lgad|readout|fpga|daq|data\s+acquisition|plasmonic\s+antenna)\b/i],
    ['electronics', /\b(microelectronics|electronics|\belectronic\b|vlsi|\bpcb\b|embedded\s+system|circuit\s+design|digital\s+system|analog\s+circuit|\basic\b)\b/i],
    ['electrical', /\b(electrical\s+(?:engineering|power)|power\s+engineering|electromagnetic\s+compatibility|\bemc\b|electrically\s+heated|power\s+grid|institute\s+of\s+ele(?:c)?trical)\b/i],
    ['robotics', /\b(robot(?:ics|ic)?|human[- ]robot|\bcobot\b|mechatronic|cyber[- ]physical|\bcps\b)\b/i],
    ['manufacturing', /\b(manufactur\w*|micromachining|additive\s+manufacturing|electrolyte\s+jet|surface\s+structuring|mechanical\s+engineering|process\s+engineering|scrap\s+handling|green\s+steel|\bsteel\b|\beaf\b|electric\s+arc\s+furnace|discrete\s+element|particle[- ]based\s+(?:modell?ing|simulation|method)|vibratory\s+feeder|machines?\s+&\s+materials|industrial\s+loading)\b/i],
    ['materials', /\b(materials?\s+(?:science|engineering|physical)|engineering\s+materials|high[- ]entropy\s+alloy|metallurg\w*|polymer|condensed\s+matter|physical\s+chemistry|\bsorbent)/i],
    ['nuclear', /\b(nuclear|reactor|corium|radiation[- ]tolerant)\b/i],
    ['software_ai', /\b(artificial\s+intelligence|\bai\b|machine\s+learning|\bml\b|deep\s+learning|generative\s+ai|software|hpc|high\s+performance\s+computing|cybersecurit\w*|formal\s+methods|computational|neural\s+network|data\s+(?:science|management)|digital\s+twin|guix\s+for\s+hpc)\b/i],
    ['bio_chem', /\b(virolog\w*|biomedical|biolog\w*|biochem\w*|chemistry|chemical\s+engineering|clinical|medical\s+science|oncolog\w*|cardiovascular|cultivated\s+meat|plant\s+cell|migratoire|nursing|microbiology|optics\s+&\s+compressed|lipids)\b/i],
  ];
  for (const [id, pattern] of rules) {
    if (pattern.test(text)) return id;
  }
  return 'other';
}

export function phdscannerIsArchived(item = {}) {
  return Boolean(item.archived) || item.status === 'archived' || item.score_band === 'archive';
}

export function phdscannerHasArtifacts(item = {}) {
  return Boolean(
    item.research_report
    || item.artifacts?.research_report
    || item.resources?.report_md
    || item.resources?.resume_pdf
    || item.artifacts?.resume_pdf
    || item.resources?.cover_letter_pdf
    || item.artifacts?.cover_letter_pdf
    || item.resources?.email_draft
    || item.artifacts?.email_draft,
  );
}

export function phdscannerWorkerStatus(item = {}) {
  return String(item.automation?.worker_status || item.worker_status || '');
}

export const PHDSCANNER_EXECUTION_STAGES = [
  'ready_for_application',
  'making_artifacts',
  'artifacts_ready',
  'applied',
];

export function phdscannerExecutionStage(item = {}) {
  const stage = String(item.execution?.stage || '').trim();
  return PHDSCANNER_EXECUTION_STAGES.includes(stage) ? stage : null;
}

function normalizeFacet(value = '') {
  return String(value || '').trim().toLowerCase();
}

function parseDateMs(value = '') {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/**
 * Apply PhDScanner.com mutual exclusion:
 * - if country is set, ignore discipline
 * - if discipline is set and country is not, ignore country (already empty)
 */
export function resolvePhdscannerFacetFilters(filters = {}) {
  const country = String(filters.country || '').trim();
  const discipline = String(filters.discipline || '').trim();
  const university = String(filters.university || '').trim();
  if (country) {
    return { country, university, discipline: '' };
  }
  if (discipline) {
    return { country: '', university: '', discipline };
  }
  return { country: '', university, discipline: '' };
}

/**
 * @param {object} item
 * @param {{
 *   scoreBand?: string,
 *   role?: string,
 *   topic?: string,
 *   status?: string,
 *   ready?: string,
 *   query?: string,
 *   country?: string,
 *   university?: string,
 *   discipline?: string,
 *   fullyFunded?: boolean|string,
 *   minimalFinancialBarriers?: boolean|string,
 *   publishedFrom?: string,
 *   publishedTo?: string,
 * }} filters
 */
export function phdscannerMatchesFilters(item = {}, filters = {}) {
  const scoreBand = filters.scoreBand || 'visible';
  const role = filters.role || 'all';
  const topic = filters.topic || 'all';
  const status = filters.status || 'all';
  const ready = filters.ready || 'all';
  const boardSource = filters.boardSource || filters.source || 'all';
  const query = String(filters.query || '').trim().toLowerCase();
  const facets = resolvePhdscannerFacetFilters(filters);
  const archived = phdscannerIsArchived(item);
  const band = item.score_band || '';
  const executionStage = phdscannerExecutionStage(item);
  const isApplied = executionStage === 'applied';

  if (scoreBand === 'visible') {
    const active = !archived && !isApplied && (['top_priority', 'strong_review', 'adjacent_review'].includes(band) || item.visible);
    if (!active && !archived && !isApplied) return false;
  } else if (scoreBand === 'archive') {
    if (!archived) return false;
  } else if (scoreBand !== 'all' && band !== scoreBand) {
    return false;
  }

  if (boardSource !== 'all') {
    const sources = Array.isArray(item.sources) && item.sources.length
      ? item.sources.map(entry => String(entry.source || '').toLowerCase())
      : [String(item.source || 'phdscanner').toLowerCase()];
    if (!sources.includes(String(boardSource).toLowerCase())) return false;
  }

  if (role !== 'all' && phdscannerRole(item) !== role) return false;
  if (topic !== 'all' && phdscannerTopic(item) !== topic) return false;

  if (status === 'still_apply') {
    if (!['open', 'open_unverified', 'needs_deadline_verification'].includes(item.status) || archived || isApplied) return false;
  } else if (status === 'archived') {
    if (!archived) return false;
  } else if (status === 'applied') {
    if (!isApplied) return false;
  } else if (status !== 'all' && item.status !== status) {
    return false;
  }

  const worker = phdscannerWorkerStatus(item);
  if (ready === 'has_artifact' && !phdscannerHasArtifacts(item)) return false;
  if (ready === 'needs_worker' && !['needs_worker', 'runner_unavailable'].includes(worker)) return false;
  if (ready === 'queued' && !worker.startsWith('queued')) return false;

  if (facets.country && normalizeFacet(item.country) !== normalizeFacet(facets.country)) return false;
  if (facets.university) {
    const uni = normalizeFacet(item.university || item.institution);
    if (uni !== normalizeFacet(facets.university)) return false;
  }
  if (facets.discipline) {
    const disc = normalizeFacet(item.discipline || item.department || (item.research_fields || [])[0]);
    if (!disc.includes(normalizeFacet(facets.discipline)) && normalizeFacet(facets.discipline) !== disc) return false;
  }

  const fullyFunded = filters.fullyFunded;
  if (fullyFunded === true || fullyFunded === 'true' || fullyFunded === '1' || fullyFunded === 'on') {
    if (!item.fully_funded) return false;
  }
  const minimalBarriers = filters.minimalFinancialBarriers;
  if (minimalBarriers === true || minimalBarriers === 'true' || minimalBarriers === '1' || minimalBarriers === 'on') {
    if (!item.minimal_financial_barriers) return false;
  }

  const publishedFrom = parseDateMs(filters.publishedFrom);
  const publishedTo = parseDateMs(filters.publishedTo);
  const publishedAt = parseDateMs(item.published_at || item.posted_at);
  if (publishedFrom !== null && (publishedAt === null || publishedAt < publishedFrom)) return false;
  if (publishedTo !== null && (publishedAt === null || publishedAt > publishedTo)) return false;

  if (query) {
    const haystack = [
      item.title,
      item.university,
      item.institution,
      item.country,
      item.discipline,
      item.department,
      item.supervisor,
      item.summary,
      item.fit_rationale,
      item.score_band,
      item.status,
      item.funding_label,
      worker,
      phdscannerRole(item),
      phdscannerTopic(item),
      executionStage,
      ...(item.score_breakdown?.strong_matches || []),
      ...(item.score_breakdown?.adjacent_matches || []),
      ...(item.risk_flags || []),
    ].join(' ').toLowerCase();
    if (!haystack.includes(query)) return false;
  }

  return true;
}

export function collectPhdscannerFacets(items = []) {
  const countries = new Set();
  const universitiesByCountry = new Map();
  const disciplines = new Set();
  for (const item of items) {
    const country = String(item.country || '').trim();
    const university = String(item.university || item.institution || '').trim();
    const discipline = String(item.discipline || item.department || '').trim();
    if (country) countries.add(country);
    if (university) {
      if (!universitiesByCountry.has(country || '_all')) universitiesByCountry.set(country || '_all', new Set());
      universitiesByCountry.get(country || '_all').add(university);
      if (!universitiesByCountry.has('_all')) universitiesByCountry.set('_all', new Set());
      universitiesByCountry.get('_all').add(university);
    }
    if (discipline) disciplines.add(discipline);
  }
  return {
    countries: [...countries].sort((a, b) => a.localeCompare(b)),
    disciplines: [...disciplines].sort((a, b) => a.localeCompare(b)),
    universitiesByCountry: Object.fromEntries(
      [...universitiesByCountry.entries()].map(([k, set]) => [k, [...set].sort((a, b) => a.localeCompare(b))]),
    ),
  };
}

export const PHDSCANNER_ROLE_LABELS = {
  phd: 'PhD / doctoral',
  engineer: 'Engineer / technician',
  researcher: 'Researcher / scientist',
  postdoc_faculty: 'Postdoc / faculty',
  other: 'Other',
};

export const PHDSCANNER_TOPIC_LABELS = {
  plasma: 'Plasma / fusion',
  space: 'Space',
  cryogenics: 'Cryogenics / facilities',
  detectors: 'Detectors / instrumentation',
  electronics: 'Electronics',
  electrical: 'Electrical / power',
  manufacturing: 'Manufacturing / mechanical',
  materials: 'Materials',
  robotics: 'Robotics / mechatronics',
  nuclear: 'Nuclear',
  software_ai: 'Software / AI / compute',
  bio_chem: 'Bio / chem / medical',
  other: 'Unclassified',
};

export const PHDSCANNER_EXECUTION_LABELS = {
  ready_for_application: 'Ready for application',
  making_artifacts: 'Making artifacts',
  artifacts_ready: 'Artifacts ready',
  applied: 'Applied',
};
