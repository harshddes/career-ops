/**
 * Offline free-text job location → ISO-3166-1 alpha-2 country codes.
 * No geocoder. Tuned for career-ops shortlist location strings.
 */

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

const COUNTRY_NAME_TO_CODE = {
  usa: 'US',
  'united states': 'US',
  'united states of america': 'US',
  america: 'US',
  us: 'US',
  canada: 'CA',
  can: 'CA',
  'united kingdom': 'GB',
  uk: 'GB',
  britain: 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  germany: 'DE',
  deutschland: 'DE',
  de: 'DE',
  france: 'FR',
  fr: 'FR',
  italy: 'IT',
  italia: 'IT',
  it: 'IT',
  spain: 'ES',
  es: 'ES',
  switzerland: 'CH',
  ch: 'CH',
  sweden: 'SE',
  se: 'SE',
  belgium: 'BE',
  be: 'BE',
  netherlands: 'NL',
  holland: 'NL',
  nl: 'NL',
  luxembourg: 'LU',
  lu: 'LU',
  poland: 'PL',
  pl: 'PL',
  'new zealand': 'NZ',
  nz: 'NZ',
  india: 'IN',
  in: 'IN',
  japan: 'JP',
  jp: 'JP',
  singapore: 'SG',
  sg: 'SG',
  argentina: 'AR',
  ar: 'AR',
  australia: 'AU',
  au: 'AU',
  austria: 'AT',
  at: 'AT',
  portugal: 'PT',
  pt: 'PT',
  ireland: 'IE',
  ie: 'IE',
  denmark: 'DK',
  dk: 'DK',
  norway: 'NO',
  no: 'NO',
  finland: 'FI',
  fi: 'FI',
  'czech republic': 'CZ',
  czechia: 'CZ',
  china: 'CN',
  'hong kong': 'HK',
  'south korea': 'KR',
  korea: 'KR',
  taiwan: 'TW',
  brazil: 'BR',
  mexico: 'MX',
  israel: 'IL',
  'united arab emirates': 'AE',
  uae: 'AE',
  'saudi arabia': 'SA',
};

const CITY_HINTS = {
  berlin: 'DE',
  munich: 'DE',
  münchen: 'DE',
  muenchen: 'DE',
  dresden: 'DE',
  karlsruhe: 'DE',
  ottobrunn: 'DE',
  asslar: 'DE',
  auckland: 'NZ',
  waikato: 'NZ',
  wellington: 'NZ',
  singapore: 'SG',
  hyderabad: 'IN',
  bangalore: 'IN',
  bengaluru: 'IN',
  mumbai: 'IN',
  delhi: 'IN',
  toronto: 'CA',
  vancouver: 'CA',
  montreal: 'CA',
  richmond: 'CA', // often BC in this shortlist; overridden if US state present
  london: 'GB',
  oxford: 'GB',
  abingdon: 'GB',
  yarnton: 'GB',
  paris: 'FR',
  leuven: 'BE',
  brussels: 'BE',
  amsterdam: 'NL',
  stockholm: 'SE',
  kiruna: 'SE',
  zurich: 'CH',
  geneva: 'CH',
  tokyo: 'JP',
  osaka: 'JP',
  wroclaw: 'PL',
  wrocław: 'PL',
  trento: 'IT',
  povo: 'IT',
  'buenos aires': 'AR',
  luxembourg: 'LU',
  'palo alto': 'US',
  'san jose': 'US',
  'santa clara': 'US',
  'long beach': 'US',
  'oak ridge': 'US',
  knoxville: 'US',
  houston: 'US',
  denver: 'US',
  seattle: 'US',
  boston: 'US',
  chicago: 'US',
  'new york': 'US',
  'ann arbor': 'US',
  houghton: 'US',
};

const COUNTRY_DISPLAY = {
  US: 'United States',
  CA: 'Canada',
  GB: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  IT: 'Italy',
  ES: 'Spain',
  CH: 'Switzerland',
  SE: 'Sweden',
  BE: 'Belgium',
  NL: 'Netherlands',
  LU: 'Luxembourg',
  PL: 'Poland',
  NZ: 'New Zealand',
  IN: 'India',
  JP: 'Japan',
  SG: 'Singapore',
  AR: 'Argentina',
  AU: 'Australia',
  AT: 'Austria',
  PT: 'Portugal',
  IE: 'Ireland',
  DK: 'Denmark',
  NO: 'Norway',
  FI: 'Finland',
  CZ: 'Czechia',
  CN: 'China',
  HK: 'Hong Kong',
  KR: 'South Korea',
  TW: 'Taiwan',
  BR: 'Brazil',
  MX: 'Mexico',
  IL: 'Israel',
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
};

/** Region labels used by Jobs to Consider work-auth filters. */
export const REGION_BY_COUNTRY_CODE = {
  US: 'US',
  CA: 'North America',
  MX: 'North America',
  GB: 'UK',
  UK: 'UK',
  DE: 'Europe',
  FR: 'Europe',
  IT: 'Europe',
  ES: 'Europe',
  CH: 'Europe',
  SE: 'Europe',
  BE: 'Europe',
  NL: 'Europe',
  LU: 'Europe',
  PL: 'Europe',
  AT: 'Europe',
  PT: 'Europe',
  IE: 'Europe',
  DK: 'Europe',
  NO: 'Europe',
  FI: 'Europe',
  CZ: 'Europe',
  NZ: 'Oceania',
  AU: 'Oceania',
  IN: 'Asia',
  JP: 'Asia',
  SG: 'Asia',
  CN: 'Asia',
  HK: 'Asia',
  KR: 'Asia',
  TW: 'Asia',
  AR: 'Latin America',
  BR: 'Latin America',
  IL: 'Middle East',
  AE: 'Middle East',
  SA: 'Middle East',
};

const UNKNOWN_TOKENS = new Set(['any', 'multiple', 'various', 'tbd', 'n/a', 'na', 'worldwide', 'global']);

function cleanLocation(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripNoise(text) {
  return text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(on-?site|hybrid|remote field|partner site|hq|itinerant|r&s board|pale blue)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSegments(text) {
  // Prefer office separators before commas (commas often separate city/state).
  const primary = text.split(/\s*(?:\/|;|\bor\b|\band\b|&)\s*/i).map(s => s.trim()).filter(Boolean);
  if (primary.length > 1) return primary;
  return [text];
}

function normalizeCode(code) {
  if (!code) return null;
  const upper = String(code).toUpperCase();
  if (upper === 'UK') return 'GB';
  if (upper === 'CAN') return 'CA';
  return upper.length === 2 ? upper : null;
}

function lookupName(token) {
  const key = String(token || '').toLowerCase().trim();
  if (!key) return null;
  if (COUNTRY_NAME_TO_CODE[key]) return COUNTRY_NAME_TO_CODE[key];
  return null;
}

function lookupCity(token) {
  const key = String(token || '').toLowerCase().trim();
  if (!key) return null;
  if (CITY_HINTS[key]) return CITY_HINTS[key];
  // Try last comma-part cities like "Cerdanyola del Vallès"
  for (const [city, code] of Object.entries(CITY_HINTS)) {
    if (key.includes(city)) return code;
  }
  return null;
}

function parseSegment(segment) {
  const cleaned = stripNoise(segment);
  if (!cleaned) return null;

  const lower = cleaned.toLowerCase();
  if (UNKNOWN_TOKENS.has(lower)) return null;
  if (/^(remote|work from anywhere|distributed)$/i.test(cleaned)) return null;

  // Explicit country names anywhere in segment
  for (const [name, code] of Object.entries(COUNTRY_NAME_TO_CODE)) {
    if (name.length < 2) continue;
    const re = new RegExp(`(?:^|[,\\s])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[,\\s])`, 'i');
    if (re.test(cleaned) || lower === name) return code;
  }

  const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean);
  const tokens = parts.length ? parts : [cleaned];

  // Scan tokens from the end (country / state usually last)
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const tok = tokens[i];
    const compact = tok.replace(/\./g, '').trim();
    const upper = compact.toUpperCase();

    if (US_STATES.has(upper) && upper !== 'IN' && upper !== 'DE') {
      // IN/DE are both US states and country codes — prefer country only if
      // the segment also has an India/Germany name; otherwise US for City, ST.
      return 'US';
    }
    if (upper === 'IN' || upper === 'DE') {
      // Ambiguous: if preceding tokens look like US city-only with state IN/DE,
      // treat as US. If preceded by India/Germany city/name, country wins above.
      const prior = tokens.slice(0, i).join(' ').toLowerCase();
      if (/\b(india|hyderabad|bangalore|bengaluru|telangana|germany|berlin|munich|münchen|dresden)\b/.test(prior)) {
        return upper === 'IN' ? 'IN' : 'DE';
      }
      // "Berlin, DE" / "München, DE" — two-letter DE after city → Germany
      if (upper === 'DE' && tokens.length >= 2) return 'DE';
      if (upper === 'IN' && tokens.length >= 2) {
        // "City, IN" US Indiana vs India — shortlist uses "India" spelled out;
        // two-letter IN after US-like city → US
        return 'US';
      }
    }

    const asCountry = lookupName(compact) || normalizeCode(upper.length === 2 ? upper : null);
    if (asCountry && !US_STATES.has(asCountry)) return asCountry;
    if (asCountry === 'US' || asCountry === 'CA' || asCountry === 'GB') return asCountry;
  }

  // Two-letter ISO at end: "Berlin, DE"
  const last = tokens[tokens.length - 1]?.replace(/\./g, '').trim().toUpperCase();
  if (last && last.length === 2) {
    if (US_STATES.has(last) && last !== 'DE') return 'US';
    if (COUNTRY_DISPLAY[last] || COUNTRY_NAME_TO_CODE[last.toLowerCase()]) {
      return normalizeCode(last);
    }
    if (last === 'DE') return 'DE';
    if (last === 'NZ') return 'NZ';
    if (last === 'AR') return 'AR';
  }

  // City hints on full segment / first token
  const cityHit = lookupCity(cleaned) || lookupCity(tokens[0]);
  if (cityHit) {
    // "Richmond, BC, Canada" already caught; bare Richmond + BC
    if (/,\s*BC\b/i.test(cleaned) || /\bBritish Columbia\b/i.test(cleaned)) return 'CA';
    if (cityHit === 'CA' && US_STATES.has(last)) return 'US';
    return cityHit;
  }

  // "Stennis Space Center, MS" etc. — state already handled
  // France / Germany as whole-string
  const whole = lookupName(cleaned);
  if (whole) return whole;

  return null;
}

/**
 * @param {string} location
 * @returns {{
 *   country_code: string|null,
 *   countries: string[],
 *   country: string,
 *   region: string,
 *   is_unknown: boolean,
 *   is_remote: boolean,
 *   display_location: string,
 * }}
 */
export function locationToCountry(location = '') {
  const display_location = cleanLocation(location);
  const is_remote = /\b(work from anywhere|distributed only)\b/i.test(display_location)
    || /\bor remote\b/i.test(display_location)
    || /^remote$/i.test(display_location);

  if (!display_location) {
    return {
      country_code: null,
      countries: [],
      country: '',
      region: 'Unknown',
      is_unknown: true,
      is_remote: false,
      display_location: '',
    };
  }

  const lower = display_location.toLowerCase();
  if (UNKNOWN_TOKENS.has(lower) || lower === 'multiple' || lower === 'any') {
    return {
      country_code: null,
      countries: [],
      country: '',
      region: 'Unknown',
      is_unknown: true,
      is_remote: false,
      display_location,
    };
  }

  const segments = splitSegments(display_location);
  const codes = [];
  for (const segment of segments) {
    // For "Santa Clara, CA or Remote" — parse the non-remote half
    if (/^remote$/i.test(stripNoise(segment))) continue;
    const code = parseSegment(segment);
    if (code) codes.push(code);
  }

  // Fallback: parse whole string as one segment if splits failed
  if (!codes.length) {
    const code = parseSegment(display_location);
    if (code) codes.push(code);
  }

  const countries = [...new Set(codes.map(normalizeCode).filter(Boolean))];
  const country_code = countries[0] || null;
  const is_unknown = !country_code;

  return {
    country_code,
    countries,
    country: country_code ? (COUNTRY_DISPLAY[country_code] || country_code) : '',
    region: country_code ? (REGION_BY_COUNTRY_CODE[country_code] || 'Unknown') : 'Unknown',
    is_unknown,
    is_remote: Boolean(is_remote || /\bor remote\b/i.test(display_location)),
    display_location,
  };
}

export function countryDisplayName(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return 'Unknown';
  return COUNTRY_DISPLAY[normalized] || normalized;
}

export function regionForCountryCode(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return 'Unknown';
  return REGION_BY_COUNTRY_CODE[normalized] || 'Unknown';
}
