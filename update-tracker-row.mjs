#!/usr/bin/env node
/**
 * update-tracker-row.mjs
 *
 * Update a single row in data/applications.md by tracker number.
 * Supports core editable fields used by the dashboard:
 * company, role, score, status, notes.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const CAREER_OPS = dirname(fileURLToPath(import.meta.url));
const APPS_FILE = existsSync(join(CAREER_OPS, 'data/applications.md'))
  ? join(CAREER_OPS, 'data/applications.md')
  : join(CAREER_OPS, 'applications.md');
const DASHBOARD_DATA_FILE = join(CAREER_OPS, 'data/application-dashboard.json');

export const TRACKER_EDITABLE_FIELDS = ['date', 'company', 'role', 'score', 'status', 'pdf', 'report', 'notes'];
export const TRACKER_METADATA_FIELDS = [
  'division_field',
  'date_due',
  'posting_url',
  'submitted_date',
  'followup_date',
  'no_response_followup_date',
  'contact',
  'outreach_date',
  'response',
  'alignment',
  'way_to_apply',
  'email',
  'university',
  'department',
  'lab',
  'designation',
  'field',
  'research_interest',
  'missions',
  'linkedin_url',
];

const CANONICAL_STATUSES = ['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Rejected', 'Discarded', 'SKIP'];
const STATUS_ALIASES = {
  evaluated: 'Evaluated',
  evaluada: 'Evaluated',
  condicional: 'Evaluated',
  hold: 'Evaluated',
  evaluar: 'Evaluated',
  verificar: 'Evaluated',
  applied: 'Applied',
  aplicado: 'Applied',
  enviada: 'Applied',
  aplicada: 'Applied',
  sent: 'Applied',
  responded: 'Responded',
  respondido: 'Responded',
  interview: 'Interview',
  entrevista: 'Interview',
  offer: 'Offer',
  oferta: 'Offer',
  rejected: 'Rejected',
  rechazado: 'Rejected',
  rechazada: 'Rejected',
  discarded: 'Discarded',
  descartado: 'Discarded',
  descartada: 'Discarded',
  cerrada: 'Discarded',
  cancelada: 'Discarded',
  skip: 'SKIP',
  'no aplicar': 'SKIP',
  no_aplicar: 'SKIP',
  monitor: 'SKIP',
  'geo blocker': 'SKIP',
};

function collapseWhitespace(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeCell(value) {
  return collapseWhitespace(value).replace(/\|/g, '/');
}

function normalizeStatus(status) {
  const clean = collapseWhitespace(status).replace(/\*\*/g, '');
  if (!clean) throw new Error('status cannot be empty');
  const direct = CANONICAL_STATUSES.find(state => state.toLowerCase() === clean.toLowerCase());
  if (direct) return direct;
  const aliased = STATUS_ALIASES[clean.toLowerCase()];
  if (aliased) return aliased;
  throw new Error(`invalid status "${status}". Use one of: ${CANONICAL_STATUSES.join(', ')}`);
}

function normalizeScore(score) {
  const clean = collapseWhitespace(score).replace(/\*\*/g, '').toUpperCase();
  if (!clean) throw new Error('score cannot be empty');
  if (/^\d+(\.\d+)?\/5$/.test(clean)) return clean;
  if (clean === 'N/A' || clean === 'DUP') return clean;
  // jobs-to-consider.json often stores bare decimals (e.g. "4.3") without "/5"
  if (/^\d+(\.\d+)?$/.test(clean)) {
    const value = Number(clean);
    if (value >= 0 && value <= 5) return `${value.toFixed(1)}/5`;
  }
  throw new Error(`invalid score "${score}". Use X.X/5, N/A, or DUP`);
}

function normalizeDate(date) {
  const clean = sanitizeCell(date);
  if (!clean) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    throw new Error(`invalid date "${date}". Use YYYY-MM-DD`);
  }
  return clean;
}

function normalizePdf(pdf) {
  if (typeof pdf === 'boolean') return pdf ? '✅' : '❌';
  const clean = collapseWhitespace(pdf).toLowerCase();
  if (!clean) return '❌';
  if (clean.includes('✅') || ['true', 'yes', 'y', '1', 'done', 'generated'].includes(clean)) return '✅';
  if (clean.includes('❌') || ['false', 'no', 'n', '0', 'none', 'missing'].includes(clean)) return '❌';
  throw new Error(`invalid pdf value "${pdf}". Use yes/no or ✅/❌`);
}

function normalizeReport(report) {
  return sanitizeCell(report) || '-';
}

function parseAppLine(line) {
  if (!line.startsWith('|')) return null;
  const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
  if (cells.length < 8) return null;

  const num = Number.parseInt(cells[0], 10);
  if (!Number.isInteger(num) || num <= 0) return null;

  return {
    num,
    date: cells[1] || '',
    company: cells[2] || '',
    role: cells[3] || '',
    score: cells[4] || '',
    status: cells[5] || '',
    pdf: cells[6] || '',
    report: cells[7] || '',
    notes: cells[8] || '',
  };
}

function formatAppLine(entry) {
  return `| ${entry.num} | ${entry.date} | ${entry.company} | ${entry.role} | ${entry.score} | ${entry.status} | ${entry.pdf} | ${entry.report} | ${entry.notes} |`;
}

function sanitizeUpdates(rawUpdates = {}) {
  if (!rawUpdates || typeof rawUpdates !== 'object' || Array.isArray(rawUpdates)) {
    throw new Error('updates must be an object');
  }

  const unknownFields = Object.keys(rawUpdates).filter(field => !TRACKER_EDITABLE_FIELDS.includes(field));
  if (unknownFields.length) {
    throw new Error(`unsupported fields: ${unknownFields.join(', ')}`);
  }

  const updates = {};
  for (const field of TRACKER_EDITABLE_FIELDS) {
    if (rawUpdates[field] === undefined) continue;
    if (field === 'date') {
      updates.date = normalizeDate(rawUpdates.date);
      continue;
    }
    if (field === 'status') {
      updates.status = normalizeStatus(rawUpdates.status);
      continue;
    }
    if (field === 'score') {
      updates.score = normalizeScore(rawUpdates.score);
      continue;
    }
    if (field === 'pdf') {
      updates.pdf = normalizePdf(rawUpdates.pdf);
      continue;
    }
    if (field === 'report') {
      updates.report = normalizeReport(rawUpdates.report);
      continue;
    }
    updates[field] = sanitizeCell(rawUpdates[field]);
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('no editable fields supplied');
  }

  return updates;
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

function emptyDashboardData() {
  return {
    version: 1,
    entries: {},
    schedule: {
      slots: {},
      weeks: {},
    },
  };
}

export function readDashboardData(filePath = DASHBOARD_DATA_FILE) {
  if (!existsSync(filePath)) return emptyDashboardData();
  const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
  return {
    ...emptyDashboardData(),
    ...parsed,
    entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
    schedule: parsed.schedule && typeof parsed.schedule === 'object'
      ? { slots: parsed.schedule.slots || {}, weeks: parsed.schedule.weeks || {} }
      : emptyDashboardData().schedule,
  };
}

function writeDashboardData(data, filePath = DASHBOARD_DATA_FILE) {
  atomicWrite(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function sanitizeMetadata(rawMetadata = {}) {
  if (!rawMetadata || typeof rawMetadata !== 'object' || Array.isArray(rawMetadata)) {
    throw new Error('metadata must be an object');
  }

  const metadata = {};
  for (const field of TRACKER_METADATA_FIELDS) {
    if (rawMetadata[field] === undefined) continue;
    metadata[field] = sanitizeCell(rawMetadata[field]);
  }
  return metadata;
}

export function updateTrackerMetadata({ num, updates, filePath = DASHBOARD_DATA_FILE }) {
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error('application id must be a positive integer');
  }
  const cleanUpdates = sanitizeMetadata(updates);
  if (Object.keys(cleanUpdates).length === 0) {
    return { source: filePath, num, changed: false, updated_fields: [], metadata: readDashboardData(filePath).entries[String(num)] || {} };
  }

  const data = readDashboardData(filePath);
  const key = String(num);
  const current = data.entries[key] || {};
  const next = { ...current };
  let changed = false;
  for (const [field, value] of Object.entries(cleanUpdates)) {
    if (next[field] !== value) {
      next[field] = value;
      changed = true;
    }
  }
  data.entries[key] = next;
  if (changed) writeDashboardData(data, filePath);
  return { source: filePath, num, changed, updated_fields: Object.keys(cleanUpdates), metadata: next };
}

export function deleteTrackerMetadata({ num, filePath = DASHBOARD_DATA_FILE }) {
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error('application id must be a positive integer');
  }

  const data = readDashboardData(filePath);
  const key = String(num);
  const existed = Object.prototype.hasOwnProperty.call(data.entries, key);
  if (existed) {
    delete data.entries[key];
    writeDashboardData(data, filePath);
  }
  return { source: filePath, num, changed: existed };
}

export function updateDashboardSchedule({ updates, filePath = DASHBOARD_DATA_FILE }) {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new Error('schedule updates must be an object');
  }

  const data = readDashboardData(filePath);
  const nextSchedule = {
    slots: { ...(data.schedule?.slots || {}) },
    weeks: { ...(data.schedule?.weeks || {}) },
  };

  if (updates.slots && typeof updates.slots === 'object' && !Array.isArray(updates.slots)) {
    for (const [key, value] of Object.entries(updates.slots)) {
      nextSchedule.slots[sanitizeCell(key)] = sanitizeCell(value);
    }
  }

  if (updates.weeks && typeof updates.weeks === 'object' && !Array.isArray(updates.weeks)) {
    for (const [week, days] of Object.entries(updates.weeks)) {
      const cleanWeek = sanitizeCell(week);
      if (!days || typeof days !== 'object' || Array.isArray(days)) continue;
      nextSchedule.weeks[cleanWeek] = { ...(nextSchedule.weeks[cleanWeek] || {}) };
      for (const [day, checked] of Object.entries(days)) {
        nextSchedule.weeks[cleanWeek][sanitizeCell(day)] = Boolean(checked);
      }
    }
  }

  data.schedule = nextSchedule;
  writeDashboardData(data, filePath);
  return { source: filePath, schedule: nextSchedule };
}

function applicationsTemplate() {
  return [
    '# Applications Tracker',
    '',
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '',
  ].join('\n');
}

function normalizeKey(company, role) {
  return `${company.toLowerCase().replace(/[^a-z0-9]/g, '')}::${role.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

function readApplicationLines(filePath = APPS_FILE) {
  if (!existsSync(filePath)) return applicationsTemplate().split('\n');
  return readFileSync(filePath, 'utf-8').split('\n');
}

export function updateTrackerRow({ num, updates, filePath = APPS_FILE }) {
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error('application id must be a positive integer');
  }
  if (!existsSync(filePath)) {
    throw new Error(`tracker file not found: ${filePath}`);
  }

  const cleanUpdates = sanitizeUpdates(updates);
  const lines = readFileSync(filePath, 'utf-8').split('\n');
  let found = false;
  let changed = false;
  let updatedEntry = null;

  const nextLines = lines.map(line => {
    const parsed = parseAppLine(line);
    if (!parsed || parsed.num !== num) return line;

    found = true;
    const nextEntry = { ...parsed };
    for (const [field, value] of Object.entries(cleanUpdates)) {
      if (nextEntry[field] !== value) {
        nextEntry[field] = value;
        changed = true;
      }
    }
    updatedEntry = nextEntry;
    return formatAppLine(nextEntry);
  });

  if (!found) throw new Error(`application #${num} not found`);
  if (changed) {
    atomicWrite(filePath, nextLines.join('\n'));
  }

  return {
    source: filePath,
    num,
    changed,
    updated_fields: Object.keys(cleanUpdates),
    entry: updatedEntry,
  };
}

export function deleteTrackerRow({ num, filePath = APPS_FILE, metadataFilePath = DASHBOARD_DATA_FILE }) {
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error('application id must be a positive integer');
  }
  if (!existsSync(filePath)) {
    throw new Error(`tracker file not found: ${filePath}`);
  }

  const lines = readFileSync(filePath, 'utf-8').split('\n');
  let deletedEntry = null;
  const nextLines = lines.filter(line => {
    const parsed = parseAppLine(line);
    if (!parsed || parsed.num !== num) return true;
    deletedEntry = parsed;
    return false;
  });

  if (!deletedEntry) throw new Error(`application #${num} not found`);
  atomicWrite(filePath, nextLines.join('\n').replace(/\n{3,}$/g, '\n\n'));
  deleteTrackerMetadata({ num, filePath: metadataFilePath });

  return {
    source: filePath,
    num,
    changed: true,
    entry: deletedEntry,
  };
}

export function createTrackerRow({ entry = {}, metadata = {}, filePath = APPS_FILE }) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('entry must be an object');
  }

  const today = new Date().toISOString().slice(0, 10);
  const cleanEntry = {
    date: normalizeDate(entry.date || today),
    company: sanitizeCell(entry.company),
    role: sanitizeCell(entry.role || entry.position),
    score: normalizeScore(entry.score || 'N/A'),
    status: normalizeStatus(entry.status || 'Applied'),
    pdf: normalizePdf(entry.pdf || false),
    report: normalizeReport(entry.report || '-'),
    notes: sanitizeCell(entry.notes || ''),
  };

  if (!cleanEntry.company) throw new Error('company is required');
  if (!cleanEntry.role) throw new Error('role/position is required');

  const lines = readApplicationLines(filePath);
  const existing = [];
  let maxNum = 0;
  let lastRowIndex = -1;

  lines.forEach((line, index) => {
    const parsed = parseAppLine(line);
    if (!parsed) return;
    existing.push({ ...parsed, index });
    maxNum = Math.max(maxNum, parsed.num);
    lastRowIndex = index;
  });

  const duplicate = existing.find(row => normalizeKey(row.company, row.role) === normalizeKey(cleanEntry.company, cleanEntry.role));
  if (duplicate) {
    const result = updateTrackerRow({ num: duplicate.num, updates: cleanEntry, filePath });
    const metaResult = updateTrackerMetadata({ num: duplicate.num, updates: metadata });
    return {
      ...result,
      duplicate: true,
      metadata: metaResult.metadata,
    };
  }

  const nextEntry = {
    num: maxNum + 1,
    ...cleanEntry,
  };
  const nextLine = formatAppLine(nextEntry);
  if (lastRowIndex >= 0) {
    lines.splice(lastRowIndex + 1, 0, nextLine);
  } else {
    lines.push(nextLine);
  }
  atomicWrite(filePath, lines.join('\n').replace(/\n{3,}$/g, '\n\n'));

  const metaResult = updateTrackerMetadata({ num: nextEntry.num, updates: metadata });
  return {
    source: filePath,
    num: nextEntry.num,
    changed: true,
    duplicate: false,
    updated_fields: Object.keys(cleanEntry),
    entry: nextEntry,
    metadata: metaResult.metadata,
  };
}

function parseCli(argv) {
  const args = argv.slice(2);
  const updates = {};
  let num = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const value = args[i + 1];
    if (arg === '--num') {
      num = Number.parseInt(value, 10);
      i += 1;
      continue;
    }
    if (arg === '--company') {
      updates.company = value;
      i += 1;
      continue;
    }
    if (arg === '--date') {
      updates.date = value;
      i += 1;
      continue;
    }
    if (arg === '--role') {
      updates.role = value;
      i += 1;
      continue;
    }
    if (arg === '--score') {
      updates.score = value;
      i += 1;
      continue;
    }
    if (arg === '--status') {
      updates.status = value;
      i += 1;
      continue;
    }
    if (arg === '--notes') {
      updates.notes = value;
      i += 1;
      continue;
    }
    if (arg === '--pdf') {
      updates.pdf = value;
      i += 1;
      continue;
    }
    if (arg === '--report') {
      updates.report = value;
      i += 1;
      continue;
    }
  }

  return { num, updates };
}

if (process.argv[1]?.endsWith('update-tracker-row.mjs')) {
  try {
    const { num, updates } = parseCli(process.argv);
    const result = updateTrackerRow({ num, updates });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
