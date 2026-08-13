import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import { writeToBuffer } from 'fast-csv';
import { readConsiderJobs } from './jobs-to-consider-store.mjs';
import { collectResearchProspects, getTodayActivity, localDateString, resolveDigestTimeZone } from './today-activity.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_TRACKER_DIR = join(LIB_DIR, '..');
const PHD_OPPORTUNITIES_FILE = join(WEB_TRACKER_DIR, 'data', 'phd-opportunities.json');

export const EXPORT_FORMATS = new Set(['xlsx', 'csv']);
export const EXPORT_SCOPES = new Set([
  'research-prospects',
  'phd-options',
  'jobs-to-consider',
  'today-activity',
]);

const CONTENT_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

const TODAY_COLUMNS = [
  { header: 'section', key: 'section', width: 24 },
  { header: 'date', key: 'date', width: 18 },
  { header: 'dashboard_area', key: 'dashboard_area', width: 20 },
  { header: 'type', key: 'type', width: 22 },
  { header: 'company_or_institution', key: 'company_or_institution', width: 28 },
  { header: 'title_or_person', key: 'title_or_person', width: 34 },
  { header: 'status', key: 'status', width: 18 },
  { header: 'contact', key: 'contact', width: 26 },
  { header: 'email', key: 'email', width: 28 },
  { header: 'follow_up_date', key: 'follow_up_date', width: 18 },
  { header: 'source', key: 'source', width: 24 },
  { header: 'notes', key: 'notes', width: 64 },
  { header: 'record_id', key: 'record_id', width: 32 },
];

const RESEARCH_COLUMNS = [
  { header: 'Source', key: 'source_label', width: 24 },
  { header: 'Status', key: 'status', width: 18 },
  { header: 'Tier', key: 'tier', width: 10 },
  { header: 'Score', key: 'score', width: 10 },
  { header: 'Name', key: 'name', width: 28 },
  { header: 'Title', key: 'title', width: 32 },
  { header: 'Institution', key: 'institution', width: 24 },
  { header: 'Department', key: 'department', width: 34 },
  { header: 'Lab', key: 'lab', width: 34 },
  { header: 'Email', key: 'contact_email', width: 30 },
  { header: 'Imported Outreach Group', key: 'outreach_category', width: 24 },
  { header: 'Imported Outreach Colour', key: 'outreach_color', width: 22 },
  { header: 'Original Outreach Status', key: 'outreach_status_detail', width: 34 },
  { header: 'Thread Outcome', key: 'outreach_outcome', width: 64 },
  { header: 'Last Contacted', key: 'last_contacted', width: 18 },
  { header: 'Last Followed Up', key: 'last_followed_up', width: 18 },
  { header: 'Follow-up Due', key: 'follow_up_date', width: 18 },
  { header: 'Route', key: 'likely_route', width: 28 },
  { header: 'Transfer Vectors', key: 'transfer_vectors', width: 42 },
  { header: 'Outreach Angle', key: 'outreach_angle', width: 64 },
  { header: 'Fit Rationale', key: 'fit_rationale', width: 64 },
  { header: 'Profile URL', key: 'profile_url', width: 42 },
  { header: 'Imported Notes', key: 'notes', width: 64 },
  { header: 'All Source Fields', key: 'source_details', width: 100 },
];

const JOB_COLUMNS = [
  { header: 'Status', key: 'status', width: 18 },
  { header: 'Applied', key: 'applied', width: 10 },
  { header: 'Company', key: 'company', width: 28 },
  { header: 'Title', key: 'title', width: 42 },
  { header: 'Location', key: 'location', width: 24 },
  { header: 'Country', key: 'country', width: 18 },
  { header: 'Country Code', key: 'country_code', width: 12 },
  { header: 'Score', key: 'score', width: 12 },
  { header: 'Region', key: 'region', width: 16 },
  { header: 'H-1B', key: 'h1b_status', width: 18 },
  { header: 'Export Control Risk', key: 'export_control_risk', width: 22 },
  { header: 'Liveness', key: 'liveness', width: 16 },
  { header: 'Applied At', key: 'applied_at', width: 24 },
  { header: 'First Seen', key: 'first_seen', width: 24 },
  { header: 'Recommendation', key: 'recommendation', width: 56 },
  { header: 'Notes', key: 'notes', width: 64 },
  { header: 'URL', key: 'url', width: 56 },
];

const PHD_OPPORTUNITY_COLUMNS = [
  { header: 'Source ID', key: 'source_id', width: 24 },
  { header: 'Name', key: 'name', width: 34 },
  { header: 'Source Type', key: 'source_type', width: 20 },
  { header: 'Country', key: 'country', width: 18 },
  { header: 'Region', key: 'region', width: 18 },
  { header: 'Deadline', key: 'deadline', width: 18 },
  { header: 'Opening Model', key: 'opening_model', width: 22 },
  { header: 'H-1B', key: 'h1b_status', width: 18 },
  { header: 'Work Permit Model', key: 'work_permit_model', width: 28 },
  { header: 'Export Control Risk', key: 'export_control_risk', width: 22 },
  { header: 'Needs Research', key: 'needs_deep_research', width: 16 },
  { header: 'Importance', key: 'importance', width: 14 },
  { header: 'Notes', key: 'notes', width: 56 },
  { header: 'URL', key: 'url', width: 56 },
];

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function readJsonFile(filePath, fallback) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function cellValue(value) {
  if (Array.isArray(value)) return value.map(cellValue).filter(Boolean).join('; ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return cleanText(value);
}

function normalizeRows(rows = [], columns = []) {
  return rows.map(row => Object.fromEntries(
    columns.map(column => [column.key, cellValue(row[column.key])])
  ));
}

function csvRowsForSheets(sheets = []) {
  return sheets.flatMap(sheet =>
    normalizeRows(sheet.rows, sheet.columns).map(row => ({
      Sheet: sheet.name,
      ...Object.fromEntries(sheet.columns.map(column => [column.header, row[column.key] || ''])),
    }))
  );
}

function csvHeaderBuffer(sheets = []) {
  const headers = [
    'Sheet',
    ...new Set(sheets.flatMap(sheet => sheet.columns.map(column => column.header))),
  ];
  const escaped = headers.map(header => `"${String(header).replace(/"/g, '""')}"`);
  return Buffer.from(`${escaped.join(',')}\n`, 'utf-8');
}

function csvHeaderBufferForColumns(columns = []) {
  const escaped = columns.map(column => `"${String(column.header).replace(/"/g, '""')}"`);
  return Buffer.from(`${escaped.join(',')}\n`, 'utf-8');
}

function safeSheetName(name = 'Sheet') {
  return cleanText(name)
    .replace(/[\][:*?/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 31) || 'Sheet';
}

function researchRows(sourceFilter) {
  return collectResearchProspects()
    .filter(prospect => !sourceFilter || sourceFilter(prospect))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || cleanText(a.name).localeCompare(cleanText(b.name)));
}

function jobRows() {
  return [...(readConsiderJobs().jobs || [])]
    .sort((a, b) => new Date(b.first_seen || 0) - new Date(a.first_seen || 0));
}

function phdOpportunityRows() {
  const data = readJsonFile(PHD_OPPORTUNITIES_FILE, { opportunities: [] });
  return Array.isArray(data.opportunities) ? data.opportunities : [];
}

function todayDetailRows(activity = {}) {
  // Flat CSV: Contacted already includes Networking — no second section.
  const sections = [
    ['Applied Today', 'Applications', activity.details?.applied_today || []],
    ['Contacted Today', 'Research / Applications / Networking', activity.details?.contacted_today || []],
    ['Followed Today', 'Research / Networking', activity.details?.followed_today || []],
    ['Follow-ups Due Today', 'Follow-ups', activity.details?.followups_due_today || []],
  ];
  const seen = new Set();
  const rows = [];
  for (const [section, dashboardArea, sectionRows] of sections) {
    for (const row of sectionRows) {
      const next = {
        section,
        date: row.date || row.followup_date || activity.date || '',
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
      };
      const key = [section, row.type, row.id, row.date, row.status].map(cleanText).join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(next);
    }
  }
  return rows;
}

function todaySheets({ date, timeZone }) {
  const activity = getTodayActivity({ date, timeZone });
  const flatRows = todayDetailRows(activity);
  return {
    title: `Today Activity ${activity.date}`,
    filenameBase: `today-activity-${activity.date}`,
    csvColumns: TODAY_COLUMNS,
    csvRows: flatRows,
    sheets: [
      {
        name: 'All Dashboard Activity',
        columns: TODAY_COLUMNS,
        rows: flatRows,
      },
      {
        name: 'Applied Today',
        columns: TODAY_COLUMNS,
        rows: activity.details.applied_today.map(row => ({ section: 'Applied Today', ...row })),
      },
      {
        name: 'Contacted Today',
        columns: TODAY_COLUMNS,
        rows: activity.details.contacted_today.map(row => ({ section: 'Contacted Today', ...row })),
      },
      {
        name: 'Followed Today',
        columns: TODAY_COLUMNS,
        rows: activity.details.followed_today.map(row => ({ section: 'Followed Today', ...row })),
      },
      {
        name: 'Followups Due',
        columns: TODAY_COLUMNS,
        rows: activity.details.followups_due_today.map(row => ({ section: 'Follow-ups Due Today', ...row })),
      },
      {
        name: 'Networking Today',
        columns: TODAY_COLUMNS,
        rows: (activity.details.networking_today || []).map(row => ({ section: 'Networking Today', ...row })),
      },
    ],
    activity,
  };
}

export function buildExportData({ scope, date = '', timeZone } = {}) {
  const resolvedTimeZone = resolveDigestTimeZone(timeZone);
  const exportDate = cleanText(date) || localDateString(new Date(), resolvedTimeZone);
  if (scope === 'research-prospects') {
    return {
      title: 'U-M Research Prospects',
      filenameBase: `research-prospects-${exportDate}`,
      sheets: [{
        name: 'U-M Research',
        columns: RESEARCH_COLUMNS,
        rows: researchRows(prospect => prospect.source === 'umich' || prospect.source_label === 'U-M Research'),
      }],
    };
  }

  if (scope === 'phd-options') {
    return {
      title: 'PhD Options',
      filenameBase: `phd-options-${exportDate}`,
      sheets: [
        {
          name: 'PhD Opportunities',
          columns: PHD_OPPORTUNITY_COLUMNS,
          rows: phdOpportunityRows(),
        },
        {
          name: 'Advisor Prospects',
          columns: RESEARCH_COLUMNS,
          rows: researchRows(prospect => prospect.source !== 'umich' && prospect.source_label !== 'U-M Research'),
        },
      ],
    };
  }

  if (scope === 'jobs-to-consider') {
    return {
      title: 'Jobs To Consider',
      filenameBase: `jobs-to-consider-${exportDate}`,
      sheets: [{
        name: 'Jobs To Consider',
        columns: JOB_COLUMNS,
        rows: jobRows(),
      }],
    };
  }

  if (scope === 'today-activity') {
    return todaySheets({ date: exportDate, timeZone: resolvedTimeZone });
  }

  throw new Error(`unsupported export scope: ${scope}`);
}

async function buildXlsxBuffer(exportData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'career-ops';
  workbook.created = new Date();
  workbook.modified = new Date();

  for (const sheet of exportData.sheets) {
    const worksheet = workbook.addWorksheet(safeSheetName(sheet.name));
    worksheet.columns = sheet.columns.map(column => ({
      header: column.header,
      key: column.key,
      width: column.width || 18,
    }));
    worksheet.addRows(normalizeRows(sheet.rows, sheet.columns));
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' },
    };
    worksheet.getRow(1).alignment = { vertical: 'middle' };
    worksheet.eachRow(row => {
      row.eachCell(cell => {
        cell.alignment = { vertical: 'top', wrapText: true };
      });
    });
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columns.length },
    };
  }

  const output = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(output) ? output : Buffer.from(output);
}

async function buildCsvBuffer(exportData) {
  if (exportData.csvRows && exportData.csvColumns) {
    const rows = normalizeRows(exportData.csvRows, exportData.csvColumns);
    if (!rows.length) return csvHeaderBufferForColumns(exportData.csvColumns);
    return writeToBuffer(rows, { headers: true });
  }
  const rows = csvRowsForSheets(exportData.sheets);
  if (!rows.length) return csvHeaderBuffer(exportData.sheets);
  return writeToBuffer(rows, { headers: true });
}

export async function buildExportBuffer({ scope, format = 'xlsx', date = '', timeZone } = {}) {
  const normalizedFormat = cleanText(format).toLowerCase() || 'xlsx';
  if (!EXPORT_FORMATS.has(normalizedFormat)) {
    throw new Error(`unsupported export format: ${format}`);
  }
  if (!EXPORT_SCOPES.has(scope)) {
    throw new Error(`unsupported export scope: ${scope}`);
  }

  const exportData = buildExportData({ scope, date, timeZone });
  const buffer = normalizedFormat === 'xlsx'
    ? await buildXlsxBuffer(exportData)
    : await buildCsvBuffer(exportData);

  return {
    buffer,
    contentType: CONTENT_TYPES[normalizedFormat],
    filename: `${exportData.filenameBase}.${normalizedFormat}`,
    exportData,
    format: normalizedFormat,
  };
}
