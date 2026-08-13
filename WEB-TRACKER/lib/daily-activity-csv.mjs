import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_TRACKER_DIR = join(LIB_DIR, '..');
const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
const DIGESTS_DIR = join(CAREER_OPS_DIR, 'output', 'digests');

const CSV_COLUMNS = [
  'section',
  'date',
  'timezone',
  'dashboard_area',
  'type',
  'company_or_institution',
  'title_or_person',
  'status',
  'contact',
  'email',
  'follow_up_date',
  'source',
  'notes',
  'record_id',
];

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function csvEscape(value) {
  const text = cleanText(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvRow(values = []) {
  return values.map(csvEscape).join(',');
}

export function dailyActivityCsvPath(localDate) {
  return join(DIGESTS_DIR, `today-activity-${localDate}.csv`);
}

export function appendDailyActivityCsvRow(event = {}) {
  const localDate = cleanText(event.local_date);
  if (!localDate) return null;

  mkdirSync(DIGESTS_DIR, { recursive: true });
  const filePath = dailyActivityCsvPath(localDate);
  const email = cleanText(event.metadata?.email || event.email);
  const row = csvRow([
    'Audit Activity',
    event.local_date,
    event.timezone,
    event.domain,
    event.action,
    event.company,
    event.subject_label,
    event.status,
    event.subject_label,
    email,
    event.metadata?.follow_up_date || '',
    event.source || event.domain || '',
    event.notes,
    event.subject_id || event.id || '',
  ]);

  if (!existsSync(filePath)) {
    appendFileSync(filePath, `${csvRow(CSV_COLUMNS)}\n`, 'utf-8');
  }
  appendFileSync(filePath, `${row}\n`, 'utf-8');
  return filePath;
}

function snapshotRows(activity = {}) {
  // Contacted already includes Networking people — do not emit a second Networking section.
  const sections = [
    ['Applied Today', 'Applications', activity.details?.applied_today || []],
    ['Contacted Today', 'Research / Applications / Networking', activity.details?.contacted_today || []],
    ['Followed Today', 'Research / Networking', activity.details?.followed_today || []],
    ['Follow-ups Due Today', 'Follow-ups', activity.details?.followups_due_today || []],
  ];
  const seen = new Set();
  const out = [];
  for (const [section, dashboardArea, rows] of sections) {
    for (const row of rows) {
      const key = [section, row.id, row.date, row.status].map(cleanText).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        section,
        date: row.date || row.followup_date || activity.date || '',
        timezone: activity.timeZone || '',
        dashboard_area: row.dashboard_area || dashboardArea,
        type: row.type || '',
        company_or_institution: row.company || '',
        title_or_person: row.title || '',
        status: row.status || '',
        contact: row.contact || '',
        email: row.email || '',
        follow_up_date: row.followup_date || '',
        source: row.source || '',
        notes: row.notes || '',
        record_id: row.id || '',
      });
    }
  }
  return out;
}

export function writeDailyActivityCsv(activity = {}) {
  const localDate = cleanText(activity.date);
  if (!localDate) return null;

  mkdirSync(DIGESTS_DIR, { recursive: true });
  const filePath = dailyActivityCsvPath(localDate);
  const rows = snapshotRows(activity);
  const content = [
    csvRow(CSV_COLUMNS),
    ...rows.map(row => csvRow(CSV_COLUMNS.map(column => row[column]))),
  ].join('\n');
  writeFileSync(filePath, `${content}\n`, 'utf-8');
  return filePath;
}
