export const ACTIVE_GRANT_START = '2026-01-01';
export const ACTIVE_GRANT_END = '2040-12-31';

function cleanText(value = '') {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values = []) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

export function normalizeGrantDate(value = '') {
  const text = cleanText(value);
  if (!text || /not publicly stated|unknown|ongoing/i.test(text)) return '';

  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  const dayFirst = text.match(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/);
  if (dayFirst) {
    return `${dayFirst[3]}-${dayFirst[2].padStart(2, '0')}-${dayFirst[1].padStart(2, '0')}`;
  }

  const year = text.match(/\b(20\d{2})\b/);
  return year ? `${year[1]}-12-31` : '';
}

export function grantDatesFromPeriod(value = '') {
  const text = cleanText(value);
  if (!text) return { start_date: '', end_date: '' };
  const tokens = text.match(/\b(?:20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}[./]\d{1,2}[./]20\d{2})\b/g) || [];
  if (tokens.length >= 2) {
    return {
      start_date: normalizeGrantDate(tokens[0]),
      end_date: normalizeGrantDate(tokens.at(-1)),
    };
  }
  if (tokens.length === 1) {
    return { start_date: '', end_date: normalizeGrantDate(tokens[0]) };
  }
  const years = text.match(/\b20\d{2}\b/g) || [];
  return {
    start_date: years[0] ? `${years[0]}-01-01` : '',
    end_date: years.at(-1) ? `${years.at(-1)}-12-31` : '',
  };
}

export function isGrantInActiveWindow(grant = {}) {
  const endDate = normalizeGrantDate(grant.end_date);
  if (endDate) return endDate >= ACTIVE_GRANT_START && endDate <= ACTIVE_GRANT_END;
  return /\b(active|ongoing|laufend|announced|awarded|current)\b/i.test(cleanText(grant.status));
}

export function normalizeGrant(raw = {}) {
  const periodDates = grantDatesFromPeriod(raw.project_period || raw.period);
  const sourceUrls = uniqueStrings([
    ...(Array.isArray(raw.source_urls) ? raw.source_urls : []),
    raw.source_url,
  ]);
  return {
    title: cleanText(raw.title),
    funder: cleanText(raw.funder),
    pi_role: cleanText(raw.pi_role || raw.role),
    amount: cleanText(raw.amount),
    currency: cleanText(raw.currency),
    start_date: normalizeGrantDate(raw.start_date) || periodDates.start_date,
    end_date: normalizeGrantDate(raw.end_date) || periodDates.end_date,
    status: cleanText(raw.status),
    institution: cleanText(raw.institution),
    grant_id: cleanText(raw.grant_id || raw.id),
    source_url: sourceUrls[0] || '',
    source_urls: sourceUrls,
    confidence: cleanText(raw.confidence),
    checked_at: cleanText(raw.checked_at),
  };
}

export function normalizeActiveGrants(value = []) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map(normalizeGrant)
    .filter(grant => grant.title && isGrantInActiveWindow(grant))
    .filter(grant => {
      const key = `${grant.grant_id}|${grant.title}|${grant.end_date}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
