import { createHash } from 'crypto';
import { scoreEuraxessPosting } from './scoring-profile.mjs';

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
    const clean = cleanText(value);
    if (clean) return clean;
  }
  return '';
}

function normalizeUrl(value = '') {
  const clean = cleanText(value);
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('/')) return `https://euraxess.ec.europa.eu${clean}`;
  return clean;
}

function normalizeDeadline(value = '', { now = new Date() } = {}) {
  const clean = cleanText(value);
  if (!clean) return { deadline_text: '', deadline_utc: '' };
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

function evidenceFor(raw = {}, url = '') {
  const evidence = [];
  if (url) evidence.push({ type: 'posting', label: 'EURAXESS posting', url });
  const provider = cleanText(raw.provider);
  if (provider) evidence.push({ type: 'provider', label: provider, note: `Collected via ${provider}` });
  return evidence;
}

export function normalizeEuraxessPosting(raw = {}, { sourceId = 'euraxess-fusion', now = new Date() } = {}) {
  const url = normalizeUrl(firstValue(raw, ['url', 'posting_url', 'link', 'href', 'application_url']));
  const externalId = cleanText(firstValue(raw, ['id', 'job_id', 'offer_id', 'external_id'])) || url.match(/\/jobs\/(\d+)/)?.[1] || sha256(url || JSON.stringify(raw)).slice(0, 16);
  const title = cleanText(firstValue(raw, ['title', 'name', 'position', 'role']));
  const institution = cleanText(firstValue(raw, ['institution', 'organisation', 'organization', 'company', 'employer', 'hiring_organisation'])) || 'EURAXESS';
  const country = cleanText(firstValue(raw, ['country', 'location', 'work_location']));
  const researchFields = cleanArray(firstValue(raw, ['research_fields', 'research_field', 'field', 'fields']));
  const academicLevel = cleanText(firstValue(raw, ['academic_level', 'type_of_position', 'position_type', 'job_type']));
  const researcherProfile = cleanText(firstValue(raw, ['researcher_profile', 'profile']));
  const sector = cleanText(firstValue(raw, ['sector']));
  const fundingProgramme = cleanText(firstValue(raw, ['funding_programme', 'funding_program', 'programme']));
  const summary = cleanText(firstValue(raw, ['summary', 'description', 'snippet', 'text']));
  const deadline = normalizeDeadline(firstValue(raw, ['deadline', 'application_deadline', 'deadline_text', 'expires_at']), { now });
  const postedAt = cleanText(firstValue(raw, ['posted_at', 'postedAt', 'pubDate', 'published_at']));
  const status = opportunityStatus(deadline.deadline_utc, now, {
    missingDeadlineStatus: raw.provider === 'official_rss_feed' ? 'open_unverified' : 'open_unverified',
  });
  const scoring = scoreEuraxessPosting({
    title,
    summary,
    description: summary,
    institution,
    country,
    research_fields: researchFields,
    academic_level: academicLevel,
    researcher_profile: researcherProfile,
    sector,
    funding_programme: fundingProgramme,
    deadline_utc: deadline.deadline_utc,
    posted_at: postedAt,
  }, now);
  const textForTranslation = [title, summary].filter(Boolean).join('\n\n');

  return {
    id: `${sourceId}-${externalId}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''),
    source: sourceId,
    provider: cleanText(raw.provider),
    external_id: externalId,
    name: title || `EURAXESS opportunity ${externalId}`,
    title: academicLevel || researcherProfile || 'Research opportunity',
    unit: researchFields[0] || sector || 'EURAXESS',
    department: researchFields[0] || sector || 'EURAXESS',
    lab: institution,
    institution,
    campus: country || 'Europe / International',
    role_type: 'euraxess_opportunity',
    application_route: 'EURAXESS posting',
    application_url: url,
    profile_url: url,
    contact_page: url,
    research_keywords: [...researchFields, academicLevel, researcherProfile].filter(Boolean),
    methods: [],
    facilities: [],
    transfer_vectors: scoring.score_breakdown.strong_matches,
    hiring_signals: deadline.deadline_text ? [{ type: 'deadline', label: 'Application deadline', note: deadline.deadline_text }] : [],
    evidence: evidenceFor(raw, url),
    score: scoring.score,
    tier: scoring.score >= 4.0 ? 'A' : scoring.score >= 3.2 ? 'B' : scoring.score >= 2.4 ? 'C' : 'D',
    priority: scoring.score_band,
    visible: scoring.visible,
    archived: scoring.archived,
    fit_rationale: scoring.fit_rationale,
    outreach_angle: scoring.score >= 3.5 ? 'Evaluate this EURAXESS opportunity against diagnostics, instrumentation, and plasma/space systems proof points before applying.' : '',
    likely_route: ['open', 'open_unverified'].includes(status) ? 'Apply through EURAXESS/employer instructions after verifying deadline/status' : status,
    uncertainty_notes: scoring.risk_flags.length ? `Risk flags: ${scoring.risk_flags.join(', ')}` : '',
    notes: summary,
    source_report: 'WEB-TRACKER/research/euraxess-fusion-research-prospects.md',
    first_seen: cleanText(raw.first_seen) || now.toISOString(),
    last_updated: now.toISOString(),
    opportunity_status: status,
    status,
    liveness: ['open', 'open_unverified'].includes(status) ? 'active' : status,
    liveness_reason: status === 'closed' ? 'deadline has passed' : status === 'open_unverified' ? 'RSS feed item has no parsed deadline; verify posting before applying' : '',
    posted_at: postedAt,
    deadline_text: deadline.deadline_text,
    deadline_utc: deadline.deadline_utc,
    country,
    research_fields: researchFields,
    academic_level: academicLevel,
    researcher_profile: researcherProfile,
    sector,
    funding_programme: fundingProgramme,
    language: cleanText(raw.language),
    translated_title: cleanText(raw.translated_title),
    translated_summary: cleanText(raw.translated_summary),
    translation_cache_key: textForTranslation ? sha256(textForTranslation) : '',
    score_band: scoring.score_band,
    score_breakdown: scoring.score_breakdown,
    scoring,
    risk_flags: scoring.risk_flags,
    needs_deep_research: scoring.needs_deep_research && ['open', 'open_unverified'].includes(status),
    needs_application_pack: scoring.needs_application_pack && ['open', 'open_unverified'].includes(status),
    worker_status: scoring.score >= 3.5 && ['open', 'open_unverified'].includes(status) ? 'queued' : 'not_needed',
    resources: raw.resources && typeof raw.resources === 'object' && !Array.isArray(raw.resources) ? raw.resources : {},
  };
}

export function normalizeEuraxessOpportunity(raw = {}, options = {}) {
  const prospect = normalizeEuraxessPosting(raw, options);
  return euraxessOpportunityFromProspect(prospect, raw);
}

export function euraxessOpportunityFromProspect(prospect = {}, raw = {}) {
  return {
    id: prospect.id,
    source: prospect.source,
    provider: prospect.provider,
    external_id: prospect.external_id,
    url: prospect.application_url,
    title: prospect.name,
    institution: prospect.institution,
    country: prospect.country || prospect.campus,
    summary: prospect.notes,
    posted_at: prospect.posted_at,
    deadline_text: prospect.deadline_text,
    deadline_utc: prospect.deadline_utc,
    status: prospect.opportunity_status,
    liveness: prospect.liveness,
    liveness_reason: prospect.liveness_reason,
    score: prospect.score,
    score_band: prospect.score_band,
    tier: prospect.tier,
    visible: prospect.visible !== undefined ? Boolean(prospect.visible) : prospect.score >= 2.4,
    archived: prospect.archived !== undefined ? Boolean(prospect.archived) : prospect.score < 2.4,
    fit_rationale: prospect.fit_rationale,
    risk_flags: prospect.risk_flags,
    score_breakdown: prospect.score_breakdown,
    scoring: prospect.scoring,
    research_fields: prospect.research_fields,
    academic_level: prospect.academic_level,
    researcher_profile: prospect.researcher_profile,
    language: prospect.language,
    translated_title: prospect.translated_title,
    translated_summary: prospect.translated_summary,
    needs_research: prospect.needs_deep_research,
    needs_application_pack: prospect.needs_application_pack,
    worker_status: prospect.worker_status,
    research_report: raw.research_report || prospect.research_report || '',
    resources: prospect.resources,
    jobs_to_consider_id: cleanText(raw.jobs_to_consider_id),
    first_seen: prospect.first_seen,
    last_updated: prospect.last_updated,
  };
}
