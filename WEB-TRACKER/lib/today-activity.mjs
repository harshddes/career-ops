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
const DEFAULT_DIGEST_RECIPIENTS = [
  'harshddes@gmail.com',
  'desaienggworks@gmail.com',
  'namrataprayaan@gmail.com',
];
export const DEFAULT_DIGEST_TIMEZONE = 'America/New_York';

const NETWORKING_CONTACTED_STAGES = new Set([
  'contacted',
  'engaged',
  'conversation',
  'warm',
  'referral_eligible',
  'referred',
]);
const NETWORKING_FOLLOW_ACTIONS = new Set([
  'networking_task_completed',
  'networking_interaction_logged',
]);
const NETWORKING_CONTACT_ACTIONS = new Set([
  'networking_interaction_logged',
  'networking_relationship_stage_changed',
  'networking_person_saved',
  'networking_task_completed',
]);

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
    followup_date: event.metadata?.follow_up_date || event.metadata?.due_at || '',
    source: event.source || event.domain || 'Dashboard',
    notes: event.notes || '',
  };
}

function dashboardAreaForDomain(domain = '') {
  const clean = cleanText(domain).toLowerCase();
  if (clean === 'umich_research') return 'U-M Research';
  if (clean === 'phd_options') return 'PhD Options';
  if (clean === 'jobs') return 'Jobs';
  if (clean === 'networking') return 'Networking';
  return 'Dashboard';
}

function networkingPersonById(store, personId) {
  const needle = cleanText(personId).toLowerCase();
  if (!needle) return null;
  return (store.people || []).find(person => cleanText(person.id).toLowerCase() === needle) || null;
}

function networkingPersonRow(person, type, dateField, overrides = {}) {
  return {
    type,
    id: person.id || '',
    date: person[dateField] || overrides.date || '',
    company: person.current_organization || '',
    title: person.display_name || person.title || '',
    status: person.relationship_stage || '',
    contact: person.display_name || '',
    email: person.email || '',
    followup_date: overrides.followup_date || '',
    source: 'Networking Command Center',
    notes: person.notes || overrides.notes || '',
    ...overrides,
  };
}

function networkingEventIsContact(event) {
  const action = cleanText(event.action).toLowerCase();
  const status = cleanText(event.status).toLowerCase();
  if (!NETWORKING_CONTACT_ACTIONS.has(action)) return false;
  if (action === 'networking_relationship_stage_changed') {
    return NETWORKING_CONTACTED_STAGES.has(status);
  }
  if (action === 'networking_person_saved') {
    return NETWORKING_CONTACTED_STAGES.has(status);
  }
  if (action === 'networking_task_completed') {
    return true;
  }
  return action === 'networking_interaction_logged';
}

function networkingEventIsFollow(event) {
  const action = cleanText(event.action).toLowerCase();
  const status = cleanText(event.status).toLowerCase();
  const notes = cleanText(event.notes).toLowerCase();
  if (!NETWORKING_FOLLOW_ACTIONS.has(action)) return false;
  if (action === 'networking_task_completed') {
    return status === 'completed' || /follow/.test(notes) || /follow/.test(cleanText(event.title).toLowerCase());
  }
  return /follow/.test(status) || /follow/.test(notes) || /follow/.test(cleanText(event.title).toLowerCase());
}

function collectNetworkingToday(store, activityEvents, targetDate, timeZone) {
  const peopleById = new Map((store.people || []).map(person => [person.id, person]));
  const networkingEvents = activityEvents.filter(event => cleanText(event.domain).toLowerCase() === 'networking');

  // Contact signals from the audit log — used only as input to person-level dedupe.
  const contactedFromEvents = networkingEvents
    .filter(networkingEventIsContact)
    .map(event => ({
      ...eventRow(event),
      type: 'networking_contact',
      source: 'Networking Command Center',
    }));

  const followedFromEvents = networkingEvents
    .filter(networkingEventIsFollow)
    .map(event => ({
      ...eventRow(event),
      type: 'networking_follow_up',
      source: 'Networking Command Center',
    }));

  const interactionsToday = (store.interactions || []).filter(item => (
    dateOnly(item.occurred_at, timeZone) === targetDate
  ));
  const contactedFromInteractions = interactionsToday.map(item => {
    const person = peopleById.get(item.person_id) || null;
    return {
      type: 'networking_contact',
      id: item.person_id || item.id,
      date: item.occurred_at || '',
      company: person?.current_organization || '',
      title: person?.display_name || item.subject || item.type || '',
      status: person?.relationship_stage || item.type || 'contacted',
      contact: person?.display_name || '',
      email: person?.email || '',
      followup_date: '',
      source: 'Networking Command Center',
      notes: item.summary || item.subject || '',
    };
  });

  // Prefer last_interaction_at so note edits / org saves do not mint fake contacts.
  const stageTouchedToday = (store.people || []).filter(person => (
    NETWORKING_CONTACTED_STAGES.has(cleanText(person.relationship_stage).toLowerCase())
    && dateOnly(person.last_interaction_at, timeZone) === targetDate
  ));
  const contactedFromPeople = stageTouchedToday.map(person => (
    networkingPersonRow(person, 'networking_contact', 'last_interaction_at', {
      date: person.last_interaction_at || '',
    })
  ));

  const tasksDueToday = (store.tasks || []).filter(task => {
    const state = cleanText(task.state).toLowerCase();
    if (!['open', 'waiting', 'snoozed', 'blocked'].includes(state)) return false;
    return dateOnly(task.due_at, timeZone) === targetDate;
  });
  const followupsFromTasks = tasksDueToday.map(task => {
    const person = networkingPersonById(store, task.person_id);
    return {
      type: 'networking_followup_due',
      id: task.id || task.person_id || '',
      date: task.due_at || '',
      company: person?.current_organization || '',
      title: person?.display_name || task.subject || '',
      status: task.state || '',
      contact: person?.display_name || '',
      email: person?.email || '',
      followup_date: task.due_at || '',
      source: 'Networking Command Center',
      notes: task.notes || task.subject || '',
    };
  });

  const tasksCompletedToday = (store.tasks || []).filter(task => (
    cleanText(task.state).toLowerCase() === 'completed'
    && (
      dateOnly(task.completed_at, timeZone) === targetDate
      || dateOnly(task.updated_at, timeZone) === targetDate
    )
  ));
  const followedFromTasks = tasksCompletedToday.map(task => {
    const person = networkingPersonById(store, task.person_id);
    return {
      type: 'networking_follow_up',
      id: task.id || task.person_id || '',
      date: task.completed_at || task.updated_at || '',
      company: person?.current_organization || '',
      title: person?.display_name || task.subject || '',
      status: 'completed',
      contact: person?.display_name || '',
      email: person?.email || '',
      followup_date: task.due_at || '',
      source: 'Networking Command Center',
      notes: task.notes || task.subject || '',
    };
  });

  // One person contacted = one row. Do NOT count every activity-log side effect
  // (org save, research queue, stage change + interaction) as separate "networking" hits.
  const contactedToday = uniqueContactRows([
    ...contactedFromEvents,
    ...contactedFromInteractions,
    ...contactedFromPeople,
  ], timeZone);

  // Networking Today is the same people as networking contacts — not a second scoreboard.
  const networkingToday = contactedToday.map(row => ({
    ...row,
    dashboard_area: 'Networking',
    occurred_at: row.date,
  }));

  return {
    networkingToday,
    contactedToday,
    followedToday: uniqueContactRows([
      ...followedFromEvents,
      ...followedFromTasks,
    ], timeZone),
    followupsDueToday: uniqueRows(followupsFromTasks.map(row => ({
      ...row,
      date: dateOnly(row.date, timeZone) || row.date,
      followup_date: dateOnly(row.followup_date, timeZone) || row.followup_date,
    }))),
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

/** One person / org contact = one row, regardless of how many log events fired. */
function uniqueContactRows(rows = [], timeZone = DEFAULT_DIGEST_TIMEZONE) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const personKey = cleanText(row.id).toLowerCase()
      || cleanText(row.contact).toLowerCase()
      || cleanText(row.title).toLowerCase()
      || cleanText(row.email).toLowerCase();
    if (!personKey || seen.has(personKey)) continue;
    seen.add(personKey);
    out.push({
      ...row,
      type: row.type || 'networking_contact',
      date: dateOnly(row.date, timeZone) || row.date,
      source: row.source || 'Networking Command Center',
    });
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
  const networkingStore = readNetworking();
  const networking = collectNetworkingToday(networkingStore, activityEvents, targetDate, resolvedTimeZone);

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
  // Contacted is the umbrella: research + apps outreach + networking people, one row per person.
  const contactedToday = uniqueContactRows([
    ...contactedFromPulse.map(applicationRow),
    ...contactedFromResearch.map(prospect => prospectRow(prospect, 'research_contact', 'last_contacted')),
    ...networking.contactedToday,
  ], resolvedTimeZone);
  const followedToday = uniqueContactRows([
    ...followedFromResearch.map(prospect => prospectRow(prospect, 'research_follow_up', 'last_followed_up')),
    ...networking.followedToday,
  ], resolvedTimeZone);
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
    ...networking.followupsDueToday,
  ]);
  // Same people as networking rows inside contactedToday — never a second additive score.
  const networkingToday = networking.networkingToday;
  const networkingContactCount = contactedToday.filter(row => row.source === 'Networking Command Center').length;
  const allActivity = uniqueRows([
    ...appliedToday.map(row => ({ dashboard_area: 'Applications', occurred_at: row.date, ...row })),
    ...contactedToday.map(row => ({
      dashboard_area: row.source === 'Networking Command Center'
        ? 'Networking'
        : (row.type === 'application' ? 'Applications' : 'Research'),
      occurred_at: row.date,
      ...row,
    })),
    ...followedToday.map(row => ({
      dashboard_area: row.source === 'Networking Command Center' ? 'Networking' : 'Research',
      occurred_at: row.date,
      ...row,
    })),
    ...followupsDueToday.map(row => ({
      dashboard_area: row.source === 'Networking Command Center' ? 'Networking' : 'Follow-ups',
      occurred_at: row.followup_date || row.date,
      ...row,
    })),
  ]);
  const auditActivity = activityEvents.map(event => ({
    ...eventRow(event),
    dashboard_area: dashboardAreaForDomain(event.domain),
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
      // Kept for API/export compatibility; equals networking subset of contacted (not event spam).
      networking_today: networkingContactCount,
      dashboard_events_today: allActivity.length,
      umich_research_events_today: contactedToday.filter(row => row.source === 'U-M Research').length + followedToday.filter(row => row.source === 'U-M Research').length,
      job_events_today: appliedToday.filter(row => row.type === 'application').length + contactedToday.filter(row => row.type === 'application').length,
      phd_events_today: contactedToday.filter(row => row.source !== 'U-M Research' && row.source !== 'Networking Command Center' && row.type !== 'application').length
        + followedToday.filter(row => row.source !== 'U-M Research' && row.source !== 'Networking Command Center').length,
      networking_events_today: networkingContactCount,
      overdue_followups: applicationFollowupsOverdue.length + cadenceFollowupsDueOrOverdue.filter(entry => dateOnly(entry.nextFollowupDate) < targetDate).length,
    },
    details: {
      all_activity: allActivity,
      audit_activity: auditActivity,
      applied_today: appliedToday,
      contacted_today: contactedToday,
      followed_today: followedToday,
      followups_due_today: followupsDueToday,
      // Detail list kept for XLSX filter sheet; CSV/email do not re-count these under a second section.
      networking_today: networkingToday,
    },
  };
}

export const buildTodaySnapshot = getTodayActivity;
