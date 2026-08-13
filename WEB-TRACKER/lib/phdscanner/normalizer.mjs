import { createHash } from 'crypto';
import { scorePhdscannerPosting } from './scoring-profile.mjs';
import { phdBoardDedupeKey } from './dedupe.mjs';

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

function normalizeUrl(value = '') {
  const clean = cleanText(value);
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('/')) return `https://www.phdscanner.com${clean}`;
  return clean;
}

export function extractPhdscannerExternalId(url = '', fallback = '') {
  const clean = cleanText(url);
  const uuid = clean.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1];
  if (uuid) return uuid.toLowerCase();
  const slug = clean.match(/\/opportunities\/([^/?#]+)/i)?.[1];
  if (slug) return slug.toLowerCase();
  return cleanText(fallback) || sha256(clean || String(fallback)).slice(0, 16);
}

function normalizeDeadline(value = '', { now = new Date() } = {}) {
  const clean = cleanText(value);
  if (!clean) return { deadline_text: '', deadline_utc: '' };

  // Explicit passed markers from rendered PhDScanner pages (no calendar date).
  if (/deadline\s+passed|applications?\s+closed|no longer (?:accepting|open)/i.test(clean) && !/\d{4}/.test(clean)) {
    const yesterday = new Date(now.getTime() - 86_400_000);
    return { deadline_text: clean, deadline_utc: yesterday.toISOString() };
  }

  const dateMatch = clean.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:\s*[-–]\s*(\d{1,2}):(\d{2}))?/);
  if (dateMatch) {
    const [, day, month, year, hour = '23', minute = '59'] = dateMatch;
    const parsedApprox = new Date(`${month} ${day}, ${year} ${hour}:${minute}:00 UTC`);
    return {
      deadline_text: clean,
      deadline_utc: Number.isNaN(parsedApprox.getTime()) ? '' : parsedApprox.toISOString(),
    };
  }
  const isoish = clean.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (isoish) {
    const [, month, day, year] = isoish;
    const parsedApprox = new Date(`${month} ${day}, ${year} 23:59:00 UTC`);
    return {
      deadline_text: clean,
      deadline_utc: Number.isNaN(parsedApprox.getTime()) ? '' : parsedApprox.toISOString(),
    };
  }
  const isoDate = clean.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    const parsedIso = new Date(`${isoDate[1]}-${isoDate[2]}-${isoDate[3]}T23:59:00.000Z`);
    return {
      deadline_text: clean,
      deadline_utc: Number.isNaN(parsedIso.getTime()) ? '' : parsedIso.toISOString(),
    };
  }
  const parsed = new Date(clean);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(clean)) {
    return { deadline_text: clean, deadline_utc: parsed.toISOString() };
  }
  return { deadline_text: clean, deadline_utc: '' };
}

function opportunityStatus(deadlineUtc, now = new Date(), { missingDeadlineStatus = 'open_unverified' } = {}) {
  if (!deadlineUtc) return missingDeadlineStatus;
  const deadline = new Date(deadlineUtc);
  if (Number.isNaN(deadline.getTime())) return missingDeadlineStatus;
  return deadline.getTime() < now.getTime() ? 'closed' : 'open';
}

/**
 * Parse funding cues from text. Used for filter flags only — never for score.
 */
export function parsePhdscannerFunding(raw = {}) {
  const label = cleanText(firstValue(raw, ['funding_label', 'funding', 'funding_text', 'salary', 'compensation']));
  const text = [
    label,
    firstValue(raw, ['summary', 'description', 'title']),
    raw.fully_funded === true ? 'fully funded' : '',
    raw.minimal_financial_barriers === true ? 'minimal financial barriers' : '',
  ].join(' ');
  const lower = text.toLowerCase();
  const selfFunded = /\bself[- ]?funded\b|\bno funding\b|\btuition only\b/i.test(lower);
  const fullyFunded = raw.fully_funded === true
    || (!selfFunded && /\bfully funded\b|\bfull funding\b|\bstipend\b|\btuition fees covered\b|\bliving stipend\b|\b100%\s+of\s+(?:the\s+)?(?:aap\s+)?net salary\b/i.test(lower));
  const minimalFinancialBarriers = raw.minimal_financial_barriers === true
    || fullyFunded
    || /\bminimal financial barriers\b|\bno tuition\b|\btuition waived\b|\bfee waiver\b/i.test(lower);
  return {
    funding_label: label || (fullyFunded ? 'Fully funded' : selfFunded ? 'Self-funded' : ''),
    fully_funded: Boolean(fullyFunded),
    minimal_financial_barriers: Boolean(minimalFinancialBarriers),
  };
}

export function normalizePhdscannerPosting(raw = {}, { sourceId = 'phdscanner-fusion', now = new Date() } = {}) {
  const url = normalizeUrl(firstValue(raw, ['url', 'posting_url', 'link', 'href', 'application_url']));
  const externalId = extractPhdscannerExternalId(url, firstValue(raw, ['id', 'external_id', 'uuid']));
  const title = cleanText(firstValue(raw, ['title', 'name', 'position', 'role']));
  const university = cleanText(firstValue(raw, ['university', 'institution', 'organisation', 'organization', 'company', 'employer'])) || 'PhDScanner';
  const country = cleanText(firstValue(raw, ['country', 'location', 'work_location']));
  const discipline = cleanText(firstValue(raw, ['discipline', 'field', 'research_field']));
  const department = cleanText(firstValue(raw, ['department', 'unit'])) || discipline;
  const supervisor = cleanText(firstValue(raw, ['supervisor', 'professor', 'advisor', 'pi']));
  const summary = cleanText(firstValue(raw, ['summary', 'description', 'snippet', 'text']));
  const researchFields = cleanArray(firstValue(raw, ['research_fields', 'research_field', 'fields']) || [discipline, department].filter(Boolean));
  const deadline = normalizeDeadline(
    firstValue(raw, ['deadline', 'application_deadline', 'deadline_text', 'expires_at']),
    { now },
  );
  const postedAt = cleanText(firstValue(raw, ['posted_at', 'postedAt', 'pubDate', 'published_at', 'publishedAt']));
  const publishedAt = cleanText(firstValue(raw, ['published_at', 'publishedAt', 'posted_at', 'postedAt'])) || postedAt;
  const funding = parsePhdscannerFunding(raw);
  const status = opportunityStatus(deadline.deadline_utc, now);
  const scoring = scorePhdscannerPosting({
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
    posted_at: postedAt,
    ...funding,
  }, now);

  const id = `phdscanner-${externalId}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const record = {
    id,
    source: 'phdscanner',
    source_id: sourceId,
    provider: cleanText(raw.provider),
    external_id: externalId,
    url,
    title: title || `PhDScanner opportunity ${externalId}`,
    university,
    institution: university,
    country,
    discipline,
    department,
    supervisor,
    summary,
    posted_at: postedAt,
    published_at: publishedAt,
    deadline_text: deadline.deadline_text,
    deadline_utc: deadline.deadline_utc,
    status,
    liveness: ['open', 'open_unverified'].includes(status) ? 'active' : status,
    liveness_reason: status === 'closed' ? 'deadline has passed' : status === 'open_unverified' ? 'No parsed deadline; verify posting before applying' : '',
    ...funding,
    score: scoring.score,
    score_band: scoring.score_band,
    tier: scoring.score >= 4.0 ? 'A' : scoring.score >= 3.2 ? 'B' : scoring.score >= 2.4 ? 'C' : 'D',
    visible: scoring.visible,
    archived: scoring.archived,
    fit_rationale: scoring.fit_rationale,
    risk_flags: scoring.risk_flags,
    score_breakdown: scoring.score_breakdown,
    scoring,
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
    first_seen: cleanText(raw.first_seen) || now.toISOString(),
    last_updated: now.toISOString(),
    sources: [{
      source: 'phdscanner',
      url,
      external_id: externalId,
      provider: cleanText(raw.provider),
    }],
  };
  record.dedupe_key = phdBoardDedupeKey(record);
  return record;
}

export function normalizePhdscannerOpportunity(raw = {}, options = {}) {
  return normalizePhdscannerPosting(raw, options);
}
