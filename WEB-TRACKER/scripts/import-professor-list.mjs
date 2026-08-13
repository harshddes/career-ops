#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import {
  PROFESSOR_LIST_SOURCE_ID,
  PROFESSOR_LIST_XLSX_URL,
  buildProfessorProspects,
  professorOutreachUserStateUpdates,
  professorRowsFromCsv,
  professorRowsFromHtml,
  professorRowsFromWorkbook,
} from '../lib/professor-list-import.mjs';
import {
  CAREER_OPS_DIR,
  syncResearchProspectsToDashboard,
  writeResearchProspects,
} from '../lib/research-prospect-store.mjs';
import { patchResearchUserState } from '../lib/research-user-state.mjs';

const AUDIT_HTML = join(CAREER_OPS_DIR, 'HarshD_Professors List', 'Email Audit 2025-26.html');
const ENRICHED_HTML = join(
  CAREER_OPS_DIR,
  'HarshD_Professors List',
  'HarshD_Professors_List_Research_Enriched_2026-07-10.html'
);
const ENRICHED_CSV = join(
  CAREER_OPS_DIR,
  'HarshD_Professors List',
  'HarshD_Professors List - HarshD_Professors_List_Research_Enriched_2026-07-10.csv'
);

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || '' : '';
}

async function workbookFromSource() {
  const xlsxPath = argumentValue('--xlsx');
  const workbook = new ExcelJS.Workbook();
  if (xlsxPath) {
    await workbook.xlsx.readFile(xlsxPath);
    return workbook;
  }
  if (process.argv.includes('--offline')) return null;

  const response = await fetch(PROFESSOR_LIST_XLSX_URL);
  if (!response.ok) throw new Error(`Google Sheets export failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await workbook.xlsx.load(buffer);
  return workbook;
}

async function rowsFromLocalSources() {
  if (!existsSync(AUDIT_HTML)) {
    throw new Error('Local Email Audit HTML export is missing.');
  }
  const htmlRows = professorRowsFromHtml({
    auditHtml: readFileSync(AUDIT_HTML, 'utf-8'),
    enrichedHtml: existsSync(ENRICHED_HTML) ? readFileSync(ENRICHED_HTML, 'utf-8') : '',
  });
  const enrichedRows = existsSync(ENRICHED_CSV)
    ? await professorRowsFromCsv(readFileSync(ENRICHED_CSV, 'utf-8'))
    : htmlRows.enrichedRows;
  if (!enrichedRows.length) {
    throw new Error('Local enriched professor CSV/HTML export is missing or empty.');
  }
  return { ...htmlRows, enrichedRows };
}

const localRows = await rowsFromLocalSources();
let workbookRows = null;
let inputMode = 'Email Audit HTML + enriched CSV';
try {
  const workbook = await workbookFromSource();
  if (workbook) {
    workbookRows = professorRowsFromWorkbook(workbook);
    inputMode += ' + XLSX tracker';
  }
} catch (error) {
  console.warn(`${error.message} Continuing with authoritative local exports.`);
}

const rows = {
  trackerRows: workbookRows?.trackerRows || [],
  auditRows: localRows.auditRows.length ? localRows.auditRows : (workbookRows?.auditRows || []),
  enrichedRows: localRows.enrichedRows.length ? localRows.enrichedRows : (workbookRows?.enrichedRows || []),
};

const prospects = buildProfessorProspects(rows);
if (!prospects.length) throw new Error('Professor-list import produced zero prospects.');

for (const update of professorOutreachUserStateUpdates(prospects)) {
  patchResearchUserState(update.sourceId, update.prospectId, update.fields);
}

const store = writeResearchProspects({
  scope: 'Harsh Desai professor and PhD advisor outreach list',
  source_report: 'HarshD_Professors List/HarshD_Professors_List_Research_Enriched_2026-07-10.html',
  source_research_csv: 'HarshD_Professors List/HarshD_Professors List - HarshD_Professors_List_Research_Enriched_2026-07-10.csv',
  source_sheet: PROFESSOR_LIST_XLSX_URL,
  import_mode: inputMode,
  prospects,
}, { source: PROFESSOR_LIST_SOURCE_ID, preserveUserState: true });
const dashboard = syncResearchProspectsToDashboard({ source: PROFESSOR_LIST_SOURCE_ID });

const byOutreach = store.prospects.reduce((summary, prospect) => {
  const key = prospect.outreach_category || 'unknown';
  summary[key] = (summary[key] || 0) + 1;
  return summary;
}, {});

console.log(JSON.stringify({
  input_mode: inputMode,
  imported: store.prospects.length,
  dashboard_total: dashboard.total,
  by_outreach: byOutreach,
}, null, 2));
