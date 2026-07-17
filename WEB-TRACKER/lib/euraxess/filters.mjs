/**
 * EURAXESS dashboard filter predicates.
 * Client-side only — match against fields already on each opportunity card.
 * No invented server-side facet store.
 */

function textOf(item = {}) {
  const breakdown = item.score_breakdown || {};
  return [
    item.title,
    item.summary,
    item.fit_rationale,
    item.academic_level,
    item.researcher_profile,
    ...(item.research_fields || []),
    ...(breakdown.strong_matches || []),
    ...(breakdown.adjacent_matches || []),
    ...(breakdown.physical_hardware_anchors || []),
  ].filter(Boolean).join(' ');
}

function titleOf(item = {}) {
  return String(item.title || '');
}

/** Role from the job title — what the posting is hiring for. */
export function euraxessRole(item = {}) {
  const title = titleOf(item);
  if (/\b(post[- ]?doc|post[- ]?doctoral|assistant professor|associate professor|full professor|tenure[- ]track|faculty position|lecturer)\b/i.test(title)) {
    return 'postdoc_faculty';
  }
  if (/\b(phd|doctoral|doctorate|marie\s+curie|dc\d{1,2})\b/i.test(title)) {
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

/**
 * Topic from title + summary + research_fields + score keywords.
 * Ordered: Harsh's hardware domains first, then adjacent engineering, then residual buckets.
 * `other` is only for unreadable junk titles.
 */
export function euraxessTopic(item = {}) {
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

export function euraxessIsArchived(item = {}) {
  return Boolean(item.archived) || item.status === 'archived' || item.score_band === 'archive';
}

export function euraxessHasArtifacts(item = {}) {
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

export function euraxessWorkerStatus(item = {}) {
  return String(item.automation?.worker_status || item.worker_status || '');
}

export const EURAXESS_EXECUTION_STAGES = [
  'ready_for_application',
  'making_artifacts',
  'artifacts_ready',
  'applied',
];

export function euraxessExecutionStage(item = {}) {
  const stage = String(item.execution?.stage || '').trim();
  return EURAXESS_EXECUTION_STAGES.includes(stage) ? stage : null;
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
 * }} filters
 */
export function euraxessMatchesFilters(item = {}, filters = {}) {
  const scoreBand = filters.scoreBand || 'visible';
  const role = filters.role || 'all';
  const topic = filters.topic || 'all';
  const status = filters.status || 'all';
  const ready = filters.ready || 'all';
  const query = String(filters.query || '').trim().toLowerCase();
  const archived = euraxessIsArchived(item);
  const band = item.score_band || '';
  const executionStage = euraxessExecutionStage(item);
  const isApplied = executionStage === 'applied';

  if (scoreBand === 'visible') {
    const active = !archived && !isApplied && (['top_priority', 'strong_review', 'adjacent_review'].includes(band) || item.visible);
    if (!active && !archived && !isApplied) return false;
  } else if (scoreBand === 'archive') {
    if (!archived) return false;
  } else if (scoreBand !== 'all' && band !== scoreBand) {
    return false;
  }

  if (role !== 'all' && euraxessRole(item) !== role) return false;
  if (topic !== 'all' && euraxessTopic(item) !== topic) return false;

  if (status === 'still_apply') {
    if (!['open', 'open_unverified', 'needs_deadline_verification'].includes(item.status) || archived || isApplied) return false;
  } else if (status === 'archived') {
    if (!archived) return false;
  } else if (status === 'applied') {
    if (!isApplied) return false;
  } else if (status !== 'all' && item.status !== status) {
    return false;
  }

  const worker = euraxessWorkerStatus(item);
  if (ready === 'has_artifact' && !euraxessHasArtifacts(item)) return false;
  if (ready === 'needs_worker' && !['needs_worker', 'runner_unavailable'].includes(worker)) return false;
  if (ready === 'queued' && !worker.startsWith('queued')) return false;

  if (query) {
    const haystack = [
      item.title,
      item.institution,
      item.country,
      item.summary,
      item.fit_rationale,
      item.score_band,
      item.status,
      worker,
      euraxessRole(item),
      euraxessTopic(item),
      executionStage,
      ...(item.score_breakdown?.strong_matches || []),
      ...(item.score_breakdown?.adjacent_matches || []),
      ...(item.risk_flags || []),
    ].join(' ').toLowerCase();
    if (!haystack.includes(query)) return false;
  }

  return true;
}

export const EURAXESS_ROLE_LABELS = {
  phd: 'PhD / doctoral',
  engineer: 'Engineer / technician',
  researcher: 'Researcher / scientist',
  postdoc_faculty: 'Postdoc / faculty',
  other: 'Other',
};

export const EURAXESS_TOPIC_LABELS = {
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

export const EURAXESS_EXECUTION_LABELS = {
  ready_for_application: 'Ready for application',
  making_artifacts: 'Making artifacts',
  artifacts_ready: 'Artifacts ready',
  applied: 'Applied',
};
