/**
 * Career domain islands for Jobs To Consider dual-filter UI.
 * Domain membership lives on networking organizations (career_domains[]).
 */

export const CAREER_DOMAIN_IDS = Object.freeze([
  'plasma_diagnostics',
  'fusion_instrumentation',
  'space_instrumentation',
  'sensors_mass_spec_vacuum',
  'detectors',
  'particle_physics',
  'adjacent_aerospace',
  'unassigned',
]);

export const CAREER_DOMAIN_LABELS = Object.freeze({
  plasma_diagnostics: 'Plasma diagnostics',
  fusion_instrumentation: 'Fusion instrumentation',
  space_instrumentation: 'Space instrumentation',
  sensors_mass_spec_vacuum: 'Sensors / vacuum',
  detectors: 'Detectors',
  particle_physics: 'Particle physics',
  adjacent_aerospace: 'Adjacent aerospace',
  unassigned: 'Unassigned',
});

/** Explicit company → domains (normalized lowercase name keys). */
const COMPANY_DOMAIN_OVERRIDES = Object.freeze({
  'airbus defence and space': ['space_instrumentation', 'adjacent_aerospace'],
  'airbus': ['space_instrumentation', 'adjacent_aerospace'],
  'arianegroup': ['space_instrumentation', 'adjacent_aerospace'],
  'thales alenia space': ['space_instrumentation', 'adjacent_aerospace'],
  'european space agency': ['space_instrumentation'],
  'ohb': ['space_instrumentation', 'adjacent_aerospace'],
  'gmv': ['space_instrumentation'],
  'leonardo': ['adjacent_aerospace'],
  'reflex aerospace': ['adjacent_aerospace', 'space_instrumentation'],
  'isar aerospace': ['adjacent_aerospace', 'space_instrumentation'],
  'rocket factory augsburg': ['adjacent_aerospace', 'space_instrumentation'],
  'rocket lab': ['adjacent_aerospace', 'space_instrumentation'],
  'the exploration company': ['space_instrumentation'],
  'iceye': ['space_instrumentation', 'adjacent_aerospace'],
  'pixxel': ['space_instrumentation'],
  'redwire': ['space_instrumentation', 'adjacent_aerospace'],
  'odysseus space': ['space_instrumentation'],
  'novo space': ['space_instrumentation'],
  'muon space': ['space_instrumentation'],
  'pale blue': ['space_instrumentation'],
  'orbion space technology': ['space_instrumentation', 'plasma_diagnostics'],
  'skyroot aerospace': ['adjacent_aerospace'],
  'alba synchrotron light source': ['particle_physics', 'detectors'],
  'alba synchrotron': ['particle_physics', 'detectors'],
  'fondazione bruno kessler': ['detectors', 'particle_physics', 'sensors_mass_spec_vacuum'],
  'ku leuven': ['particle_physics', 'detectors'],
  'iter organization': ['fusion_instrumentation', 'plasma_diagnostics'],
  'ukaea': ['fusion_instrumentation', 'plasma_diagnostics'],
  'tokamak energy': ['fusion_instrumentation', 'plasma_diagnostics'],
  'commonwealth fusion systems': ['fusion_instrumentation', 'plasma_diagnostics'],
  'general fusion': ['fusion_instrumentation', 'plasma_diagnostics'],
  'first light fusion': ['fusion_instrumentation'],
  'helion': ['fusion_instrumentation', 'plasma_diagnostics'],
  'kyoto fusioneering': ['fusion_instrumentation'],
  'marathon fusion': ['fusion_instrumentation'],
  'pacific fusion': ['fusion_instrumentation'],
  'pranos fusion': ['fusion_instrumentation'],
  'pfeiffer vacuum': ['sensors_mass_spec_vacuum'],
  'vat group': ['sensors_mass_spec_vacuum'],
  'laboratory for atmospheric and space physics': ['plasma_diagnostics', 'space_instrumentation', 'detectors'],
  'nasa jet propulsion laboratory': ['space_instrumentation', 'detectors', 'sensors_mass_spec_vacuum'],
  'nasa marshall space flight center': ['space_instrumentation', 'plasma_diagnostics'],
  'oak ridge national laboratory': ['particle_physics', 'detectors', 'plasma_diagnostics'],
  'gem / oak ridge national laboratory': ['particle_physics', 'detectors'],
  'university of tennessee–ornl innovation institute': ['particle_physics', 'detectors'],
  'university of tennessee-ornl innovation institute': ['particle_physics', 'detectors'],
  'mynaric': ['detectors', 'sensors_mass_spec_vacuum'],
  'rohde & schwarz': ['detectors', 'sensors_mass_spec_vacuum'],
  'tesla': ['adjacent_aerospace'],
  'lockheed martin': ['adjacent_aerospace'],
  'northrop grumman': ['adjacent_aerospace'],
  'raytheon': ['adjacent_aerospace'],
  'l3harris': ['adjacent_aerospace'],
  'blue origin': ['space_instrumentation', 'adjacent_aerospace'],
  'spacex': ['space_instrumentation', 'adjacent_aerospace'],
  'k2 space': ['adjacent_aerospace', 'space_instrumentation'],
  'kla': ['sensors_mass_spec_vacuum', 'detectors'],
  'kla corporation': ['sensors_mass_spec_vacuum', 'detectors'],
  'kla-tencor': ['sensors_mass_spec_vacuum', 'detectors'],
  'kla tencor': ['sensors_mass_spec_vacuum', 'detectors'],
});

const TAG_TO_DOMAIN = Object.freeze({
  fusion: 'fusion_instrumentation',
  'europe-space': 'space_instrumentation',
  newspace: 'space_instrumentation',
  propulsion: 'space_instrumentation',
  launch: 'space_instrumentation',
  launchers: 'space_instrumentation',
  esa: 'space_instrumentation',
  'space instrumentation': 'space_instrumentation',
  'space-physics': 'plasma_diagnostics',
  instrumentation: 'sensors_mass_spec_vacuum',
  'mass spectrometry': 'sensors_mass_spec_vacuum',
  'optical-comms': 'detectors',
  'planetary science': 'space_instrumentation',
  'mission-ops': 'adjacent_aerospace',
  'defence-space': 'adjacent_aerospace',
  sar: 'adjacent_aerospace',
  'radiation-assurance': 'detectors',
  synchrotron: 'particle_physics',
  detector: 'detectors',
  cern: 'particle_physics',
});

const ADJACENT_FIELD_TO_DOMAIN = Object.freeze({
  'plasma / vacuum / high voltage': 'plasma_diagnostics',
  'energy systems': 'fusion_instrumentation',
  'sensors and diagnostics': 'sensors_mass_spec_vacuum',
  'instrumentation and test': 'sensors_mass_spec_vacuum',
  'aerospace systems': 'adjacent_aerospace',
});

const KEYWORD_DOMAIN_RULES = Object.freeze([
  ['particle_physics', [
    'synchrotron', 'beamline', 'particle physic', 'accelerator', 'cern', 'hep ',
    'high energy physic', 'cyclotron', 'collider', 'light source',
  ]],
  ['detectors', [
    'detector', 'photodetector', 'silicon sensor', 'cmos sensor', 'mcp ',
    'microchannel', 'scintillator', 'calorimeter', 'tracking detector',
    'x-ray detector', 'photon counting',
  ]],
  ['plasma_diagnostics', [
    'plasma diagnostic', 'plasma diagnostics', 'langmuir', 'spectroscopy plasma',
    'plasma facing', 'plasma physic', 'electric propulsion', 'hall thruster',
  ]],
  ['fusion_instrumentation', [
    'fusion', 'tokamak', 'stellarator', 'iter', 'ukaea', 'helion',
    'commonwealth fusion', 'fusioneering',
  ]],
  ['space_instrumentation', [
    'space instrument', 'spacecraft', 'satellite payload', 'payload instrument',
    'remote sensing satellite', 'earth observation',
  ]],
  ['sensors_mass_spec_vacuum', [
    'mass spec', 'mass spectrom', 'vacuum', 'uhv', 'ion gauge', 'rga',
    'quadrupole', 'pfeiffer',
  ]],
  ['adjacent_aerospace', [
    'aerospace', 'avionics', 'launch vehicle', 'rocket', 'defence and space',
    'defense and space', 'aeronautic',
  ]],
]);

function normalizeCompanyKey(name = '') {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function isCareerDomainId(value = '') {
  return CAREER_DOMAIN_IDS.includes(String(value || '').trim());
}

export function careerDomainLabel(id = '') {
  const key = String(id || '').trim();
  return CAREER_DOMAIN_LABELS[key] || key || '—';
}

export function normalizeCareerDomains(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    const id = String(item || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (!isCareerDomainId(id)) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function domainsFromCompanyName(name = '') {
  const key = normalizeCompanyKey(name);
  if (!key) return [];
  if (COMPANY_DOMAIN_OVERRIDES[key]) return [...COMPANY_DOMAIN_OVERRIDES[key]];
  // Prefix / contains match for longer official names
  for (const [alias, domains] of Object.entries(COMPANY_DOMAIN_OVERRIDES)) {
    if (key.includes(alias) || alias.includes(key)) return [...domains];
  }
  return [];
}

function dropUnassignedIfOthers(domains) {
  const unique = [...new Set(domains.filter(Boolean))];
  if (unique.length > 1) return unique.filter(domain => domain !== 'unassigned');
  return unique;
}

/** Infer domains from networking org tags / notes / name. */
export function inferCareerDomainsFromOrg(org = {}) {
  const found = new Set(domainsFromCompanyName(org.name));
  for (const tag of org.tags || []) {
    const mapped = TAG_TO_DOMAIN[String(tag || '').toLowerCase()];
    if (mapped) found.add(mapped);
  }
  const haystack = [
    org.name,
    org.notes,
    org.feasibility_notes,
    ...(org.tags || []),
  ].join(' ').toLowerCase();
  for (const [domain, keywords] of KEYWORD_DOMAIN_RULES) {
    if (keywords.some(keyword => haystack.includes(keyword))) found.add(domain);
  }
  if (!found.size) found.add('unassigned');
  return dropUnassignedIfOthers([...found]);
}

/** Soft fallback for jobs that are not yet linked to an org with career_domains. */
export function inferCareerDomainsFromJob(job = {}) {
  const found = new Set(domainsFromCompanyName(job.company));
  for (const field of job.adjacent_fields || []) {
    const mapped = ADJACENT_FIELD_TO_DOMAIN[String(field || '').toLowerCase()];
    if (mapped) found.add(mapped);
  }
  const haystack = [
    job.company,
    job.title,
    job.fit_summary,
    job.recommendation,
    job.team,
    ...(job.adjacent_fields || []),
  ].join(' ').toLowerCase();
  for (const [domain, keywords] of KEYWORD_DOMAIN_RULES) {
    if (keywords.some(keyword => haystack.includes(keyword))) found.add(domain);
  }
  return dropUnassignedIfOthers([...found]);
}

export function orgHasCareerDomain(org = {}, domainId = '') {
  if (!domainId || domainId === 'all') return true;
  const domains = normalizeCareerDomains(org.career_domains);
  if (domains.includes(domainId)) return true;
  if (!domains.length || (domains.length === 1 && domains[0] === 'unassigned')) {
    return inferCareerDomainsFromOrg(org).includes(domainId);
  }
  // Also allow override inference to catch stale narrow seeds (e.g. Airbus only space).
  return inferCareerDomainsFromOrg(org).includes(domainId);
}

export function jobMatchesCareerDomain(job = {}, domainId = '', orgById = new Map(), orgByName = new Map()) {
  if (!domainId || domainId === 'all') return true;
  const orgId = String(job.networking_org_id || '').trim();
  if (orgId && orgById.has(orgId)) {
    return orgHasCareerDomain(orgById.get(orgId), domainId);
  }
  const companyKey = String(job.company || '').trim().toLowerCase();
  if (companyKey && orgByName.has(companyKey)) {
    return orgHasCareerDomain(orgByName.get(companyKey), domainId);
  }
  return inferCareerDomainsFromJob(job).includes(domainId);
}
