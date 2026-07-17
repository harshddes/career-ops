import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseApplications } from '../adapters/applications-adapter.mjs';
import { readActivityEvents } from './activity-log.mjs';
import { allResearchSources } from './phd-research-sources.mjs';
import { readResearchProspects } from './research-prospect-store.mjs';
import { readDashboardData } from '../../update-tracker-row.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_TRACKER_DIR = join(LIB_DIR, '..');
const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
const FOLLOWUPS_FILE = join(WEB_TRACKER_DIR, 'data', 'followups.json');
const PROFILE_FILE = join(CAREER_OPS_DIR, 'config', 'profile.yml');
const DEFAULT_DIGEST_RECIPIENTS = ['harshddes@gmail.com', 'desaienggworks@gmail.com'];
export const DEFAULT_DIGEST_TIMEZONE = 'America/New_York';

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function resolveDigestTimeZone(timeZone = '') {
  const cleaned = cleanText(timeZone);
  if (cleaned) return cleaned;
  return cleanText(process.env.DAILY_DIGEST_TIMEZONE)
    || cleanText(process.env.TZ)
    || DEFAULT_DIGEST_TIMEZONE;
}

export function localDateString(date = new Date(), timeZone = DEFAULT_DIGEST_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function dateOnly(value = '', timeZone = DEFAULT_DIGEST_TIMEZONE) {
  const text = cleanText(value);
  if (!text) return '';
  const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) return text;
  const isoMatch = text.match(/^\d{4}-\d{2}-\d{2}/);
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return localDateString(parsed, timeZone);
  return isoMatch ? isoMatch[0] : '';
}

function readJsonFile(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function profileEmail() {
  if (!existsSync(PROFILE_FILE)) return '';
  const content = readFileSync(PROFILE_FILE, 'utf-8');
  const match = content.match(/^\s*email:\s*["']?([^"'\n#]+)["']?/m);
  return cleanText(match?.[1]);
}

export function digestRecipients(env = process.env) {
  const explicit = cleanText(env.DAILY_DIGEST_RECIPIENTS || env.DIGEST_RECIPIENTS);
  if (explicit) {
    return uniqueBy(
      explicit.split(/[;,]/).map(cleanText).filter(Boolean),
      value => value.toLowerCase()
    );
  }

  return uniqueBy(
    [profileEmail(), ...DEFAULT_DIGEST_RECIPIENTS].filter(Boolean),
    value => value.toLowerCase()
  );
}

export function mergeApplicationMetadata(applications = parseApplications(), dashboard = readDashboardData()) {
  return applications.map(entry => {
    const metadata = dashboard.entries?.[String(entry.num)] || {};
    return {
      ...entry,
      ...metadata,
      num: entry.num,
      company: entry.company,
      role: entry.role,
      score: entry.score,
      status: entry.status,
      notes: entry.notes,
      tracker_date: entry.date,
      submitted_date: metadata.submitted_date || '',
      followup_date: metadata.followup_date || '',
      no_response_followup_date: metadata.no_response_followup_date || '',
      outreach_date: metadata.outreach_date || '',
    };
  });
}

export function collectResearchProspects() {
  return allResearchSources().flatMap(source => {
    const store = source.options ? readResearchProspects(source.options) : readResearchProspects();
    return (store.prospects || []).map(prospect => ({
      ...prospect,
      source: prospect.source || source.id,
      source_label: source.label,
    }));
  });
}

function applicationTrackingDate(entry, timeZone) {
  return dateOnly(entry.submitted_date, timeZone) || dateOnly(entry.tracker_date, timeZone);
}

function applicationAppliedToday(entry, date, timeZone) {
  const status = cleanText(entry.status).toLowerCase();
  return status === 'applied' && applicationTrackingDate(entry, timeZone) === date;
}

function pulseContactedToday(entry, date, timeZone) {
  return dateOnly(entry.outreach_date, timeZone) === date && Boolean(entry.contact || entry.email || entry.university || entry.lab);
}

function researchContactedToday(prospect, date, timeZone) {
  return cleanText(prospect.status).toLowerCase() === 'contacted'
    && dateOnly(prospect.last_contacted, timeZone) === date;
}

function researchFollowedToday(prospect, date, timeZone) {
  return cleanText(prospect.status).toLowerCase() === 'follow_up'
    && dateOnly(prospect.last_followed_up, timeZone) === date;
}

function applicationFollowupDue(entry, date, timeZone) {
  return dateOnly(entry.followup_date, timeZone) === date || dateOnly(entry.no_response_followup_date, timeZone) === date;
}

function applicationFollowupOverdue(entry, date, timeZone) {
  const dates = [entry.followup_date, entry.no_response_followup_date]
    .map(value => dateOnly(value, timeZone))
    .filter(Boolean);
  return dates.some(value => value < date);
}

function followupEntryDue(entry, date, includeOverdue = false) {
  const due = dateOnly(entry.nextFollowupDate);
  if (!due) return false;
  return includeOverdue ? due <= date : due === date;
}

function applicationRow(entry) {
  return {
    type: 'application',
    id: String(entry.num),
    date: entry.submitted_date || entry.tracker_date || '',
    company: entry.company || '',
    title: entry.role || '',
    status: entry.status || '',
    contact: entry.contact || '',
    email: entry.email || '',
    followup_date: entry.followup_date || entry.no_response_followup_date || '',
    source: 'Applications',
    notes: entry.notes || entry.alignment || '',
  };
}

function prospectRow(prospect, type, dateField) {
  return {
    type,
    id: prospect.id || prospect.profile_url || prospect.contact_email || '',
    date: prospect[dateField] || '',
    company: prospect.institution || prospect.source_label || prospect.source || '',
    title: prospect.name || '',
    status: prospect.status || '',
    contact: prospect.name || '',
    email: prospect.contact_email || '',
    followup_date: prospect.follow_up_date || '',
    source: prospect.source_label || prospect.source || 'Research',
    notes: prospect.outreach_angle || prospect.fit_rationale || prospect.notes || '',
  };
}

function eventRow(event) {
  return {
    type: event.action || 'activity',
    id: event.subject_id || event.id,
    date: event.local_date || event.occurred_at || '',
    company: event.company || '',
    title: event.subject_label || event.title || '',
    status: event.status || '',
    contact: event.subject_label || '',
    email: event.metadata?.email || '',
    followup_date: event.metadata?.follow_up_date || '',
    source: event.source || event.domain || 'Dashboard',
    notes: event.notes || '',
  };
}

function uniqueRows(rows = []) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = [row.type, row.id, row.date, row.status].map(cleanText).join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function getTodayActivity({ date = '', timeZone } = {}) {
  const resolvedTimeZone = resolveDigestTimeZone(timeZone);
  const targetDate = cleanText(date) || localDateString(new Date(), resolvedTimeZone);
  const applications = mergeApplicationMetadata();
  const researchProspects = collectResearchProspects();
  const followups = readJsonFile(FOLLOWUPS_FILE, { entries: [] }).entries || [];
  const activityEvents = readActivityEvents({ date: targetDate, timeZone: resolvedTimeZone });

  const appliedFromTracker = applications.filter(entry => applicationAppliedToday(entry, targetDate, resolvedTimeZone));
  const contactedFromPulse = applications.filter(entry => pulseContactedToday(entry, targetDate, resolvedTimeZone));
  const contactedFromResearch = researchProspects.filter(prospect => researchContactedToday(prospect, targetDate, resolvedTimeZone));
  const followedFromResearch = researchProspects.filter(prospect => researchFollowedToday(prospect, targetDate, resolvedTimeZone));
  const applicationFollowupsDue = applications.filter(entry => applicationFollowupDue(entry, targetDate, resolvedTimeZone));
  const applicationFollowupsOverdue = applications.filter(entry => applicationFollowupOverdue(entry, targetDate, resolvedTimeZone));
  const cadenceFollowupsDue = followups.filter(entry => followupEntryDue(entry, targetDate));
  const cadenceFollowupsDueOrOverdue = followups.filter(entry => followupEntryDue(entry, targetDate, true));

  const appliedToday = uniqueRows([
    ...appliedFromTracker.map(applicationRow),
  ]);
  const contactedToday = uniqueRows([
    ...contactedFromPulse.map(applicationRow),
    ...contactedFromResearch.map(prospect => prospectRow(prospect, 'research_contact', 'last_contacted')),
  ]);
  const followedToday = uniqueRows([
    ...followedFromResearch.map(prospect => prospectRow(prospect, 'research_follow_up', 'last_followed_up')),
  ]);
  const followupsDueToday = uniqueRows([
    ...applicationFollowupsDue.map(applicationRow),
    ...cadenceFollowupsDue.map(entry => ({
      type: 'followup_due',
      id: String(entry.num || entry.company || ''),
      date: entry.nextFollowupDate || '',
      company: entry.company || '',
      title: entry.role || '',
      status: entry.urgency || entry.status || '',
      contact: Array.isArray(entry.contacts) ? entry.contacts.join(', ') : '',
      email: '',
      followup_date: entry.nextFollowupDate || '',
      source: 'Follow-up Cadence',
      notes: entry.notes || '',
    })),
  ]);
  const allActivity = [
    ...appliedToday.map(row => ({ dashboard_area: 'Applications', occurred_at: row.date, ...row })),
    ...contactedToday.map(row => ({ dashboard_area: row.type === 'application' ? 'Applications' : 'Research', occurred_at: row.date, ...row })),
    ...followedToday.map(row => ({ dashboard_area: 'Research', occurred_at: row.date, ...row })),
    ...followupsDueToday.map(row => ({ dashboard_area: 'Follow-ups', occurred_at: row.followup_date || row.date, ...row })),
  ];
  const auditActivity = activityEvents.map(event => ({
    ...eventRow(event),
    dashboard_area: event.domain === 'umich_research'
      ? 'U-M Research'
      : event.domain === 'phd_options'
        ? 'PhD Options'
        : event.domain === 'jobs'
          ? 'Jobs'
          : 'Dashboard',
    occurred_at: event.occurred_at,
  }));

  return {
    date: targetDate,
    timeZone: resolvedTimeZone,
    generated_at: new Date().toISOString(),
    summary: {
      applied_today: appliedToday.length,
      contacted_today: contactedToday.length,
      followed_today: followedToday.length,
      followups_due_today: followupsDueToday.length,
      dashboard_events_today: allActivity.length,
      umich_research_events_today: contactedToday.filter(row => row.source === 'U-M Research').length + followedToday.filter(row => row.source === 'U-M Research').length,
      job_events_today: appliedToday.filter(row => row.type === 'application').length + contactedToday.filter(row => row.type === 'application').length,
      phd_events_today: contactedToday.filter(row => row.source !== 'U-M Research' && row.type !== 'application').length + followedToday.filter(row => row.source !== 'U-M Research').length,
      overdue_followups: applicationFollowupsOverdue.length + cadenceFollowupsDueOrOverdue.filter(entry => dateOnly(entry.nextFollowupDate) < targetDate).length,
    },
    details: {
      all_activity: allActivity,
      audit_activity: auditActivity,
      applied_today: appliedToday,
      contacted_today: contactedToday,
      followed_today: followedToday,
      followups_due_today: followupsDueToday,
    },
  };
}

export const buildTodaySnapshot = getTodayActivity;
