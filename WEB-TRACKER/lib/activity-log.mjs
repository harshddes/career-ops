import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const WEB_TRACKER_DIR = join(LIB_DIR, '..');
export const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
export const CAREER_ACTIVITY_LOG_FILE = join(CAREER_OPS_DIR, 'data', 'dashboard-activity-log.ndjson');
export const DASHBOARD_ACTIVITY_LOG_FILE = join(WEB_TRACKER_DIR, 'data', 'dashboard-activity-log.ndjson');
const DEFAULT_DIGEST_TIMEZONE = 'America/New_York';

let onActivityAppended = null;

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function localDateString(date = new Date(), timeZone = DEFAULT_DIGEST_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function atomicWrite(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = join(dirname(filePath), `.${basename(filePath)}.tmp-${Date.now()}`);
  writeFileSync(tempPath, content, 'utf-8');
  try {
    renameSync(tempPath, filePath);
  } catch (err) {
    if (!['EPERM', 'EACCES'].includes(err?.code)) throw err;
    writeFileSync(filePath, content, 'utf-8');
    try { unlinkSync(tempPath); } catch {}
  }
}

function readLines(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf-8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function normalizeEvent(raw = {}) {
  const occurredAt = cleanText(raw.occurred_at) || new Date().toISOString();
  const timeZone = cleanText(raw.timezone) || process.env.DAILY_DIGEST_TIMEZONE || process.env.TZ || DEFAULT_DIGEST_TIMEZONE;
  const localDate = cleanText(raw.local_date) || localDateString(new Date(occurredAt), timeZone);
  const domain = cleanText(raw.domain || 'dashboard');
  const action = cleanText(raw.action || raw.type || 'updated');
  const subjectId = cleanText(raw.subject_id || raw.id);
  return {
    id: cleanText(raw.id) || `${localDate}-${domain}-${action}-${subjectId || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurred_at: occurredAt,
    local_date: localDate,
    timezone: timeZone,
    domain,
    action,
    subject_id: subjectId,
    subject_label: cleanText(raw.subject_label),
    company: cleanText(raw.company),
    title: cleanText(raw.title),
    status: cleanText(raw.status),
    source: cleanText(raw.source),
    notes: cleanText(raw.notes),
    metadata: raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? raw.metadata
      : {},
  };
}

function parseEventLine(line) {
  try {
    return normalizeEvent(JSON.parse(line));
  } catch {
    return null;
  }
}

function mirrorActivityLog() {
  const content = readLines(CAREER_ACTIVITY_LOG_FILE).join('\n');
  atomicWrite(DASHBOARD_ACTIVITY_LOG_FILE, content ? `${content}\n` : '');
}

export function setActivityAppendedHook(callback) {
  onActivityAppended = typeof callback === 'function' ? callback : null;
}

export function appendActivityEvent(raw = {}, { filePath = CAREER_ACTIVITY_LOG_FILE } = {}) {
  const event = normalizeEvent(raw);
  const current = readLines(filePath);
  const next = `${current.concat(JSON.stringify(event)).join('\n')}\n`;
  atomicWrite(filePath, next);
  if (filePath === CAREER_ACTIVITY_LOG_FILE) mirrorActivityLog();
  onActivityAppended?.(event);
  return event;
}

export function readActivityEvents({
  filePath = CAREER_ACTIVITY_LOG_FILE,
  date = '',
  domain = '',
  action = '',
  timeZone = '',
} = {}) {
  const resolvedTimeZone = cleanText(timeZone) || process.env.DAILY_DIGEST_TIMEZONE || process.env.TZ || DEFAULT_DIGEST_TIMEZONE;
  return readLines(filePath)
    .map(parseEventLine)
    .filter(Boolean)
    .filter(event => {
      if (!date) return true;
      if (event.local_date === date) return true;
      return localDateString(new Date(event.occurred_at), resolvedTimeZone) === date;
    })
    .filter(event => !domain || event.domain === domain)
    .filter(event => !action || event.action === action);
}

export function syncActivityLogToDashboard() {
  mirrorActivityLog();
  return {
    source: CAREER_ACTIVITY_LOG_FILE,
    output: DASHBOARD_ACTIVITY_LOG_FILE,
    count: readActivityEvents().length,
  };
}
