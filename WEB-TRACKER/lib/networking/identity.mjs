const PROFILE_HOSTS = new Set([
  'linkedin.com',
  'www.linkedin.com',
  'github.com',
  'x.com',
  'twitter.com',
  'bsky.app',
]);

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

export function normalizeName(value) {
  return cleanText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function canonicalizeExternalUrl(value) {
  const input = cleanText(value);
  if (!input) return '';
  try {
    const parsed = new URL(input);
    if (!['https:', 'http:'].includes(parsed.protocol)) return '';
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|trk|tracking|ref$|ref_)/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+/g, '/').replace(/\/$/, '');
    if (PROFILE_HOSTS.has(parsed.hostname)) parsed.protocol = 'https:';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function isSafeGmailThreadUrl(value) {
  const input = cleanText(value);
  if (!input) return false;
  try {
    const parsed = new URL(input);
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'mail.google.com';
  } catch {
    return false;
  }
}

export function normalizeGmailThreadUrl(value) {
  return isSafeGmailThreadUrl(value) ? cleanText(value) : '';
}

export function buildIdentityKeys(person = {}) {
  const keys = new Set();
  const email = normalizeEmail(person.email);
  const linkedin = canonicalizeExternalUrl(person.linkedin_url);
  const github = canonicalizeExternalUrl(person.github_url);
  const name = normalizeName(person.display_name || person.name);
  const organization = normalizeName(person.current_organization || person.organization);

  if (email) keys.add(`email:${email}`);
  if (linkedin) keys.add(`linkedin:${linkedin.toLowerCase()}`);
  if (github) keys.add(`github:${github.toLowerCase()}`);
  if (name && organization) keys.add(`name-org:${name}|${organization}`);
  return [...keys];
}

export function identityMatchScore(left = {}, right = {}) {
  const leftKeys = new Set(buildIdentityKeys(left));
  const rightKeys = new Set(buildIdentityKeys(right));
  if ([...leftKeys].some(key => rightKeys.has(key) && key.startsWith('email:'))) {
    return { score: 1, reasons: ['same normalized email'] };
  }
  if ([...leftKeys].some(key => rightKeys.has(key) && key.startsWith('linkedin:'))) {
    return { score: 1, reasons: ['same LinkedIn profile'] };
  }
  if ([...leftKeys].some(key => rightKeys.has(key) && key.startsWith('github:'))) {
    return { score: 0.98, reasons: ['same GitHub profile'] };
  }

  const reasons = [];
  let score = 0;
  const leftName = normalizeName(left.display_name || left.name);
  const rightName = normalizeName(right.display_name || right.name);
  const leftOrg = normalizeName(left.current_organization || left.organization);
  const rightOrg = normalizeName(right.current_organization || right.organization);
  const leftTitle = normalizeName(left.title);
  const rightTitle = normalizeName(right.title);

  if (leftName && leftName === rightName) {
    score += 0.62;
    reasons.push('same normalized name');
  }
  if (leftOrg && leftOrg === rightOrg) {
    score += 0.2;
    reasons.push('same organization');
  }
  if (leftTitle && rightTitle && leftTitle === rightTitle) {
    score += 0.08;
    reasons.push('same title');
  }
  return { score: Math.round(Math.min(0.9, score) * 100) / 100, reasons };
}

export function findDuplicateCandidates(person, people = []) {
  return people
    .filter(candidate => candidate?.id !== person?.id)
    .map(candidate => ({
      person_id: candidate.id,
      display_name: candidate.display_name,
      ...identityMatchScore(person, candidate),
    }))
    .filter(candidate => candidate.score >= 0.8)
    .sort((a, b) => b.score - a.score);
}
