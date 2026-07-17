import { createHash } from 'crypto';
import { scoreFindaphdPosting } from './scoring-profile.mjs';
import { parsePhdscannerFunding } from '../phdscanner/normalizer.mjs';
import { phdBoardDedupeKey } from '../phdscanner/dedupe.mjs';

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanArray(value = []) {
  if (Array.isArray(value)) return [...new Set(value.map(cleanText).filter(Boolean))];
  return cleanText(value).split(/[,;|]/).map(cleanText).filter(Boolean);
}

function sha256(value = '') {
  return createHash('sha256').update(String(value)).digest('hex');
}

function firstValue(raw = {}, keys = []) {
  for (const key of keys) {
    const value = raw[key];
    if (Array.isArray(value) && value.length) return value;
    if (typeof value === 'boolean') return value;
    const clean = cleanText(value);
    if (clean) return clean;
  }
  return '';
}

export function extractFindaphdExternalId(url = '', fallback = '') {
  const clean = cleanText(url);
  const fromQuery = clean.match(/[?&]p(\d+)\b/i)?.[1];
  if (fromQuery) return fromQuery;
  const fromPath = clean.match(/\/phds\/project\/[^/?#]+\/?\?p(\d+)/i)?.[1];
  if (fromPath) return fromPath;
  const slug = clean.match(/\/phds\/project\/([^/?#]+)/i)?.[1];
  if (slug) return slug.toLowerCase();
  return cleanText(fallback) || sha256(clean || String(fallback)).slice(0, 16);
}

function normalizeUrl(value = '') {
  const clean = cleanText(value);
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('/')) return `https://www.findaphd.com${clean}`;
  return clean;
}

function normalizeDeadline(value = '', { now = new Date() } = {}) {
  const clean = cleanText(value);
  if (!clean) return { deadline_text: '', deadline_utc: '' };
  if (/always taking applicants|applications accepted all year/i.test(clean)) {
    return { deadline_text: clean, deadline_utc: '' };
  }
  if (/deadline\s+passed|applications?\s+closed|no longer (?:accepting|open)/i.test(clean) && !/\d{4}/.test(clean)) {
    const yesterday = new Date(now.getTime() - 86_400_000);
    return { deadline_text: clean, deadline_utc: yesterday.toISOString() };
  }
  const dateMatch = clean.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (dateMatch) {
    const [, day, month, year] = dateMatch;
    const approx = new Date(`${month} ${day}, ${year} 23:59:00 UTC`);
    return {
      deadline_text: clean,
      deadline_utc: Number.isNaN(approx.getTime()) ? '' : approx.toISOString(),
    };
  }
  const isoish = clean.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (isoish) {
    const [, month, day, year] = isoish;
    const approx = new Date(`${month} ${day}, ${year} 23:59:00 UTC`);
    return {
      deadline_text: clean,
      deadline_utc: Number.isNaN(approx.getTime()) ? '' : approx.toISOString(),
    };
  }
  const parsed = new Date(clean);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(clean)) {
    return { deadline_text: clean, deadline_utc: parsed.toISOString() };
  }
  return { deadline_text: clean, deadline_utc: '' };
}

function opportunityStatus(deadlineUtc, now = new Date()) {
  if (!deadlineUtc) return 'open_unverified';
  const deadline = new Date(deadlineUtc);
  if (Number.isNaN(deadline.getTime())) return 'open_unverified';
  return deadline.getTime() < now.getTime() ? 'closed' : 'open';
}

/**
 * Map FindAPhD funding badges → filter flags only.
 */
export function parseFindaphdFunding(raw = {}) {
  const label = cleanText(firstValue(raw, ['funding_label', 'funding', 'funding_text', 'funding_badge']));
  const mapped = parsePhdscannerFunding({
    ...raw,
    funding_label: label,
    summary: [label, firstValue(raw, ['summary', 'description', 'title'])].join(' '),
  });
  const lower = label.toLowerCase();
  if (/competition funded|funded phd project|fully funded/i.test(lower) && !/self[- ]?funded/i.test(lower)) {
    mapped.fully_funded = true;
    mapped.minimal_financial_barriers = true;
    mapped.funding_label = label || mapped.funding_label || 'Competition funded';
  }
  if (/self[- ]?funded/i.test(lower)) {
    mapped.fully_funded = false;
    mapped.funding_label = label || 'Self-funded';
  }
  return mapped;
}

export function normalizeFindaphdPosting(raw = {}, { sourceId = 'findaphd-fusion', now = new Date() } = {}) {
  const url = normalizeUrl(firstValue(raw, ['url', 'posting_url', 'link', 'href']));
  const externalId = extractFindaphdExternalId(url, firstValue(raw, ['id', 'external_id', 'pid']));
  const title = cleanText(firstValue(raw, ['title', 'name', 'position', 'role']));
  const university = cleanText(firstValue(raw, ['university', 'institution', 'organisation', 'organization'])) || 'FindAPhD';
  const country = cleanText(firstValue(raw, ['country', 'location']));
  const discipline = cleanText(firstValue(raw, ['discipline', 'field', 'subject']));
  const department = cleanText(firstValue(raw, ['department', 'unit', 'faculty'])) || discipline;
  const supervisor = cleanText(firstValue(raw, ['supervisor', 'professor', 'advisor', 'pi']));
  const summary = cleanText(firstValue(raw, ['summary', 'description', 'snippet', 'text']));
  const researchFields = cleanArray(firstValue(raw, ['research_fields', 'fields']) || [discipline, department].filter(Boolean));
  const deadline = normalizeDeadline(firstValue(raw, ['deadline', 'deadline_text', 'application_deadline']), { now });
  const funding = parseFindaphdFunding(raw);
  const status = opportunityStatus(deadline.deadline_utc, now);
  const scoring = scoreFindaphdPosting({
    title,
    summary,
    description: summary,
    institution: university,
    university,
    country,
    discipline,
    department,
    supervisor,
    research_fields: researchFields,
    deadline_utc: deadline.deadline_utc,
  }, now);

  const id = `findaphd-${externalId}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const record = {
    id,
    source: 'findaphd',
    source_id: sourceId,
    provider: cleanText(raw.provider) || 'playwright_listing',
    external_id: String(externalId),
    url,
    title: title || `FindAPhD opportunity ${externalId}`,
    university,
    institution: university,
    country,
    discipline,
    department,
    supervisor,
    summary,
    posted_at: cleanText(raw.posted_at),
    published_at: cleanText(raw.published_at || raw.posted_at),
    deadline_text: deadline.deadline_text,
    deadline_utc: deadline.deadline_utc,
    status,
    liveness: ['open', 'open_unverified'].includes(status) ? 'active' : status,
    liveness_reason: status === 'closed' ? 'deadline has passed' : status === 'open_unverified' ? 'No hard deadline; verify posting before applying' : '',
    ...funding,
    score: scoring.score,
    score_band: scoring.score_band,
    tier: scoring.score >= 4.0 ? 'A' : scoring.score >= 3.2 ? 'B' : scoring.score >= 2.4 ? 'C' : 'D',
    visible: scoring.visible,
    archived: scoring.archived,
    fit_rationale: scoring.fit_rationale,
    risk_flags: scoring.risk_flags,
    score_breakdown: scoring.score_breakdown,
    research_fields: researchFields,
    academic_level: 'PhD',
    researcher_profile: 'R1',
    needs_research: scoring.needs_deep_research && ['open', 'open_unverified'].includes(status),
    needs_application_pack: scoring.needs_application_pack && ['open', 'open_unverified'].includes(status),
    worker_status: scoring.score >= 3.5 && ['open', 'open_unverified'].includes(status) ? 'queued' : 'not_needed',
    research_report: cleanText(raw.research_report),
    resources: raw.resources && typeof raw.resources === 'object' && !Array.isArray(raw.resources) ? raw.resources : {},
    artifacts: raw.artifacts && typeof raw.artifacts === 'object' && !Array.isArray(raw.artifacts) ? raw.artifacts : {},
    execution: raw.execution && typeof raw.execution === 'object' && !Array.isArray(raw.execution) ? raw.execution : {},
    sources: [{ source: 'findaphd', url, external_id: String(externalId), provider: cleanText(raw.provider) || 'playwright_listing' }],
    first_seen: cleanText(raw.first_seen) || now.toISOString(),
    last_updated: now.toISOString(),
  };
  record.dedupe_key = phdBoardDedupeKey(record);
  return record;
}
