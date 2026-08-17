import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseApplications } from '../adapters/applications-adapter.mjs';
import { readActivityEvents } from './activity-log.mjs';
import { readNetworking } from './networking/store.mjs';
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
  return dateOnly(prospect.last_contacted, timeZone) === date;
}

function researchFollowedToday(prospect, date, timeZone) {
  return dateOnly(prospect.last_followed_up, timeZone) === date;
}

function isOutboundNetworkingTouch(interaction = {}) {
  const type = cleanText(interaction.type).toLowerCase();
  const channel = cleanText(interaction.channel).toLowerCase();
  const direction = cleanText(interaction.direction).toLowerCase() || 'outbound';
  return direction === 'outbound' && type !== 'note' && channel !== 'note';
}

function networkingFollowedToday(interaction, date, timeZone) {
  return isOutboundNetworkingTouch(interaction)
    && cleanText(interaction.type).toLowerCase() === 'follow_up'
    && dateOnly(interaction.occurred_at, timeZone) === date;
}

function networkingContactedToday(interaction, date, timeZone) {
  return isOutboundNetworkingTouch(interaction)
    && cleanText(interaction.type).toLowerCase() !== 'follow_up'
    && dateOnly(interaction.occurred_at, timeZone) === date;
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

function networkingRow(person, interaction, type) {
  return {
    type,
    id: person?.id || interaction.person_id || interaction.id || '',
    date: interaction.occurred_at || '',
    company: person?.current_organization || '',
    title: person?.display_name || person?.name || '',
    status: person?.relationship_stage || interaction.type || '',
    contact: person?.display_name || person?.name || '',
    email: person?.email || '',
    followup_date: '',
    source: 'Networking',
    notes: interaction.summary || '',
  };
}

function dashboardAreaForRow(row = {}) {
  if (row.source === 'Networking' || String(row.type || '').startsWith('networking_')) return 'Networking';
  if (row.type === 'application') return 'Applications';
  if (row.source === 'U-M Research') return 'Research';
  return 'Research';
}

function isPhdResearchRow(row = {}) {
  return row.type !== 'application'
    && row.source !== 'U-M Research'
    && row.source !== 'Networking'
    && row.source !== 'Applications';
}

function peopleById(people = []) {
  const map = new Map();
  for (const person of people) {
    if (person?.id) map.set(person.id, person);
  }
  return map;
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

function loadNetworkingStore() {
  try {
    return readNetworking();
  } catch {
    return { people: [], interactions: [] };
  }
}

const todayActivityCache = new Map();

export function invalidateTodayActivityCache() {
  todayActivityCache.clear();
}

export function getCachedTodayActivity(options = {}) {
  const hasOverrides = options.applications !== undefined
    || options.researchProspects !== undefined
    || options.networking !== undefined
    || options.followups !== undefined;
  if (hasOverrides) return getTodayActivity(options);
  const resolvedTimeZone = resolveDigestTimeZone(options.timeZone);
  const targetDate = cleanText(options.date) || localDateString(new Date(), resolvedTimeZone);
  const key = `${targetDate}|${resolvedTimeZone}`;
  const hit = todayActivityCache.get(key);
  if (hit) return hit;
  const activity = getTodayActivity({
    date: targetDate,
    timeZone: resolvedTimeZone,
  });
  todayActivityCache.set(key, activity);
  return activity;
}

export function getTodayActivity({
  date = '',
  timeZone,
  applications,
  researchProspects,
  networking,
  followups,
} = {}) {
  const resolvedTimeZone = resolveDigestTimeZone(timeZone);
  const targetDate = cleanText(date) || localDateString(new Date(), resolvedTimeZone);
  const resolvedApplications = applications === undefined ? mergeApplicationMetadata() : applications;
  const resolvedProspects = researchProspects === undefined ? collectResearchProspects() : researchProspects;
  const resolvedFollowups = followups === undefined
    ? (readJsonFile(FOLLOWUPS_FILE, { entries: [] }).entries || [])
    : followups;
  const networkingStore = networking === undefined ? loadNetworkingStore() : networking;
  const activityEvents = readActivityEvents({ date: targetDate, timeZone: resolvedTimeZone });
  const people = peopleById(networkingStore?.people || []);

  const appliedFromTracker = resolvedApplications.filter(entry => applicationAppliedToday(entry, targetDate, resolvedTimeZone));
  const contactedFromPulse = resolvedApplications.filter(entry => pulseContactedToday(entry, targetDate, resolvedTimeZone));
  const contactedFromResearch = resolvedProspects.filter(prospect => researchContactedToday(prospect, targetDate, resolvedTimeZone));
  const followedFromResearch = resolvedProspects.filter(prospect => researchFollowedToday(prospect, targetDate, resolvedTimeZone));
  const contactedFromNetworking = (networkingStore?.interactions || [])
    .filter(interaction => networkingContactedToday(interaction, targetDate, resolvedTimeZone));
  const followedFromNetworking = (networkingStore?.interactions || [])
    .filter(interaction => networkingFollowedToday(interaction, targetDate, resolvedTimeZone));
  const applicationFollowupsDue = resolvedApplications.filter(entry => applicationFollowupDue(entry, targetDate, resolvedTimeZone));
  const applicationFollowupsOverdue = resolvedApplications.filter(entry => applicationFollowupOverdue(entry, targetDate, resolvedTimeZone));
  const cadenceFollowupsDue = resolvedFollowups.filter(entry => followupEntryDue(entry, targetDate));
  const cadenceFollowupsDueOrOverdue = resolvedFollowups.filter(entry => followupEntryDue(entry, targetDate, true));

  const appliedToday = uniqueRows([
    ...appliedFromTracker.map(applicationRow),
  ]);
  const contactedToday = uniqueRows([
    ...contactedFromPulse.map(applicationRow),
    ...contactedFromResearch.map(prospect => prospectRow(prospect, 'research_contact', 'last_contacted')),
    ...contactedFromNetworking.map(interaction => networkingRow(
      people.get(interaction.person_id),
      interaction,
      'networking_contact',
    )),
  ]);
  const followedToday = uniqueRows([
    ...followedFromResearch.map(prospect => prospectRow(prospect, 'research_follow_up', 'last_followed_up')),
    ...followedFromNetworking.map(interaction => networkingRow(
      people.get(interaction.person_id),
      interaction,
      'networking_follow_up',
    )),
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
    ...contactedToday.map(row => ({ dashboard_area: dashboardAreaForRow(row), occurred_at: row.date, ...row })),
    ...followedToday.map(row => ({ dashboard_area: dashboardAreaForRow(row), occurred_at: row.date, ...row })),
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
          : event.domain === 'networking'
            ? 'Networking'
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
      phd_events_today: contactedToday.filter(isPhdResearchRow).length + followedToday.filter(isPhdResearchRow).length,
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

export const buildTodaySnapshot = getCachedTodayActivity;
