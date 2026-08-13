const COUNTRY_ALIASES = new Map([
  ['ch', 'CH'], ['switzerland', 'CH'], ['swiss', 'CH'],
  ['us', 'US'], ['usa', 'US'], ['united states', 'US'], ['united states of america', 'US'],
  ['nl', 'NL'], ['netherlands', 'NL'], ['the netherlands', 'NL'],
  ['de', 'DE'], ['germany', 'DE'],
  ['fr', 'FR'], ['france', 'FR'],
  ['uk', 'UK'], ['gb', 'UK'], ['united kingdom', 'UK'], ['great britain', 'UK'],
  ['it', 'IT'], ['italy', 'IT'],
]);

export const GRANT_PORTALS = {
  SNSF: { id: 'snsf', label: 'SNSF', method: 'scrape', country_codes: ['CH'] },
  NSF: { id: 'nsf', label: 'NSF Award API', method: 'api', country_codes: ['US'] },
  NIH: { id: 'nih', label: 'NIH RePORTER', method: 'api', country_codes: ['US'] },
  NWO: { id: 'nwo', label: 'NWO Open API', method: 'api', country_codes: ['NL'] },
  GEPRIS: { id: 'gepris', label: 'GEPRIS', method: 'scrape', country_codes: ['DE'] },
  ANR: { id: 'anr', label: 'ANR Open Data', method: 'api', country_codes: ['FR'] },
  GTR: { id: 'gtr', label: 'Gateway to Research', method: 'api', country_codes: ['UK'] },
  CORDIS: { id: 'cordis', label: 'CORDIS', method: 'api', country_codes: ['CH', 'NL', 'DE', 'FR', 'UK', 'IT'] },
  OPENCUP: { id: 'opencup', label: 'OpenCUP', method: 'cup_only', country_codes: ['IT'] },
};

function cleanText(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function inferredCountry(prospect = {}) {
  const text = `${prospect.institution || ''} ${prospect.campus || ''}`.toLowerCase();
  if (/\b(epfl|eth|swiss|bern|psi)\b/.test(text)) return 'CH';
  if (/\b(princeton|michigan|berkeley|johns hopkins|jhu|swri|colorado)\b/.test(text)) return 'US';
  if (/\b(eindhoven|differ)\b/.test(text)) return 'NL';
  if (/\b(max planck|ipp|garching|greifswald)\b/.test(text)) return 'DE';
  if (/\b(cnrs|sorbonne|toulouse|orl[eé]ans)\b/.test(text)) return 'FR';
  if (/\b(ucl|oxford|cambridge|imperial college)\b/.test(text)) return 'UK';
  return '';
}

export function normalizeProfessorCountry(prospect = {}) {
  const raw = cleanText(prospect.country || prospect.location || prospect.campus).toLowerCase();
  return COUNTRY_ALIASES.get(raw) || inferredCountry(prospect);
}

export function grantPortalsForProfessor(prospect = {}) {
  const countryCode = normalizeProfessorCountry(prospect);
  const portals = Object.values(GRANT_PORTALS)
    .filter(portal => portal.country_codes.includes(countryCode))
    .filter(portal => portal.id !== 'opencup' || cleanText(prospect.cup));
  return { country_code: countryCode, portals };
}

function portalRequest(portal, prospect) {
  const name = cleanText(prospect.name);
  const institution = cleanText(prospect.institution);
  const query = encodeURIComponent(name);
  if (portal.id === 'snsf') {
    // Keep the query simple; active-window filtering happens in normalizeActiveGrants.
    // Avoid shell-breaking `&end=` params on Windows command runners.
    return { url: `https://data.snf.ch/grants?q=${query}`, method: 'GET' };
  }
  if (portal.id === 'nsf') {
    return {
      url: `https://api.nsf.gov/services/v1/awards.json?pdPIName=${query}&printFields=id,title,startDate,expDate,fundsObligatedAmt,piFirstName,piLastName,awardeeName`,
      method: 'GET',
    };
  }
  if (portal.id === 'nih') {
    return {
      url: 'https://api.reporter.nih.gov/v2/projects/search',
      method: 'POST',
      body: { criteria: { pi_names: [{ any_name: name }] }, offset: 0, limit: 100 },
    };
  }
  if (portal.id === 'nwo') {
    return { url: `https://api.nwo.nl/?q=${query}`, method: 'GET' };
  }
  if (portal.id === 'gepris') {
    return { url: `https://gepris.dfg.de/gepris/OCTOPUS?context=person&task=doSearchExtended&findButton=historyCall&keywords_criterion=${query}`, method: 'GET' };
  }
  if (portal.id === 'anr') {
    return { url: `https://data.anr.fr/?q=${query}`, method: 'GET' };
  }
  if (portal.id === 'gtr') {
    return { url: `https://gtr.ukri.org/gtr/api/persons?term=${query}`, method: 'GET' };
  }
  if (portal.id === 'cordis') {
    return {
      url: `https://cordis.europa.eu/api/projects?format=json&q=${encodeURIComponent(`contenttype='project' AND (${name} OR ${institution})`)}`,
      method: 'GET',
    };
  }
  if (portal.id === 'opencup') {
    return { url: `https://www.opencup.gov.it/portale/web/opencup/home/progetto/-/cup/${encodeURIComponent(prospect.cup)}`, method: 'GET' };
  }
  return null;
}

export function buildGrantResearchPlan(prospect = {}) {
  const routed = grantPortalsForProfessor(prospect);
  return {
    prospect_id: cleanText(prospect.id),
    professor_name: cleanText(prospect.name),
    institution: cleanText(prospect.institution),
    country_code: routed.country_code,
    active_window: { start: '2026-01-01', end: '2040-12-31' },
    requests: routed.portals.map(portal => ({
      portal: portal.id,
      label: portal.label,
      access_method: portal.method,
      ...portalRequest(portal, prospect),
    })).filter(request => request.url),
  };
}
