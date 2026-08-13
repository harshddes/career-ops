import * as cheerio from 'cheerio';
import { parseString } from 'fast-csv';
import { slugify } from './jobs-to-consider-store.mjs';
import { normalizeActiveGrants } from './professor-grants/schema.mjs';

export const PROFESSOR_LIST_SOURCE_ID = 'professor-list';
export const PROFESSOR_LIST_SHEET_ID = '1OVGib8rb5ZlT-519Q9_FdiphFzQI6u4zvUvdGIRRH1M';
export const PROFESSOR_LIST_XLSX_URL =
  `https://docs.google.com/spreadsheets/d/${PROFESSOR_LIST_SHEET_ID}/export?format=xlsx`;

const AUDIT_SHEET = 'Email Audit 2025-26';
const TRACKER_SHEET = 'Tracker';
const ENRICHED_SHEET_PREFIX = 'HarshD_Professors_List_Research';

function cleanText(value = '') {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanKey(value = '') {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function cleanRecord(record = {}) {
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, value]) => [cleanText(key), cleanText(value)])
      .filter(([key, value]) => key && value)
  );
}

function valueText(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value && typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
    if (value.text !== undefined) return valueText(value.text);
    if (value.result !== undefined) return valueText(value.result);
    if (value.formula !== undefined) return valueText(value.result ?? '');
  }
  return cleanText(value);
}

function cellText(cell) {
  if (!cell) return '';
  return valueText(cell.value ?? cell.text ?? '');
}

function cellHyperlink(cell) {
  return cleanText(cell?.hyperlink || cell?.value?.hyperlink || '');
}

function uniqueHeader(header, index, used) {
  const base = cleanText(header) || `column_${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base} ${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export function worksheetObjects(worksheet, headerRowNumber = 1) {
  if (!worksheet) return [];
  const headerRow = worksheet.getRow(headerRowNumber);
  const used = new Set();
  const headers = Array.from({ length: worksheet.columnCount }, (_, index) =>
    uniqueHeader(cellText(headerRow.getCell(index + 1)), index, used)
  );
  const rows = [];
  for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const record = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      const cell = row.getCell(index + 1);
      const text = cellText(cell);
      const hyperlink = cellHyperlink(cell);
      if (text) {
        record[header] = text;
        hasValue = true;
      }
      if (hyperlink) {
        record[`${header} URL`] = hyperlink;
        hasValue = true;
      }
    });
    if (hasValue) rows.push(record);
  }
  return rows;
}

function htmlRows(html = '') {
  const $ = cheerio.load(html);
  const rows = [];
  $('tr').each((_, tr) => {
    const cells = $(tr).find('td').map((__, cell) => {
      const anchor = $(cell).find('a[href]').first();
      return {
        text: cleanText($(cell).text()),
        hyperlink: cleanText(anchor.attr('href')),
      };
    }).get();
    rows.push(cells);
  });
  return rows;
}

export function htmlTableObjects(html = '', requiredHeader = '') {
  const rows = htmlRows(html);
  const required = cleanKey(requiredHeader);
  const headerIndex = rows.findIndex(row => row.some(cell => cleanKey(cell.text) === required));
  if (headerIndex < 0) return [];

  const used = new Set();
  const headers = rows[headerIndex].map((cell, index) => uniqueHeader(cell.text, index, used));
  return rows.slice(headerIndex + 1).map(row => {
    const record = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      const cell = row[index] || {};
      if (cell.text) {
        record[header] = cell.text;
        hasValue = true;
      }
      if (cell.hyperlink) {
        record[`${header} URL`] = cell.hyperlink;
        hasValue = true;
      }
    });
    return hasValue ? record : null;
  }).filter(Boolean);
}

function get(record = {}, ...names) {
  const byKey = new Map(Object.entries(record).map(([key, value]) => [cleanKey(key), value]));
  for (const name of names) {
    const value = byKey.get(cleanKey(name));
    if (cleanText(value)) return cleanText(value);
  }
  return '';
}

function splitList(value = '') {
  return [...new Set(
    cleanText(value)
      .split(/\s*(?:\||;|,\s+(?=[A-Z]))\s*/)
      .map(cleanText)
      .filter(Boolean)
  )];
}

function sourceUrls(...values) {
  const urls = [];
  for (const value of values) {
    const matches = cleanText(value).match(/https?:\/\/[^\s|,)]+/g) || [];
    urls.push(...matches.map(url => url.replace(/[.;]+$/, '')));
  }
  return [...new Set(urls)];
}

function firstUrl(...values) {
  return sourceUrls(...values)[0] || '';
}

function isSafeGmailUrl(value = '') {
  try {
    const parsed = new URL(cleanText(value));
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'mail.google.com';
  } catch {
    return false;
  }
}

function auditGmailLinks(audit = {}) {
  const entries = Object.entries(audit)
    .filter(([key]) => /gmail/i.test(key))
    .flatMap(([key, value]) => sourceUrls(value).map(url => ({ key, url })))
    .filter(item => isSafeGmailUrl(item.url));
  const threadUrls = [...new Set(
    entries.filter(item => !/search/i.test(item.key)).map(item => item.url)
  )];
  const searchUrl = entries.find(item => /search/i.test(item.key))?.url || '';
  return {
    gmail_thread_url: threadUrls[0] || '',
    gmail_thread_url_2: threadUrls[1] || '',
    gmail_search_url: searchUrl,
  };
}

function identityKey(record = {}) {
  const email = get(record, 'email', 'email used');
  const name = get(record, 'professor_name', 'professor name', 'contact');
  return {
    email: cleanText(email).toLowerCase(),
    name: cleanText(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(),
  };
}

function trackerOutreach(tracker = {}) {
  const status = get(tracker, 'status', 'replied').toLowerCase();
  if (/replied|reject/.test(status)) {
    return { status: 'responded_negative', category: 'replied', color: 'yellow' };
  }
  if (/sent|follow/.test(status)) {
    return { status: 'contacted', category: 'contacted_no_reply', color: 'red' };
  }
  if (/draft/.test(status)) {
    return { status: 'draft_ready', category: 'not_contacted', color: 'dark_red' };
  }
  return { status: 'not_contacted', category: 'not_contacted', color: 'dark_red' };
}

export function mapAuditOutreach(audit = {}, tracker = {}) {
  const statusText = get(audit, 'outreach status').toLowerCase();
  const sourceColor = get(audit, 'colour', 'color').toLowerCase();
  if (!statusText && !sourceColor) return trackerOutreach(tracker);

  if (/strong positive/.test(statusText) || sourceColor === 'green') {
    return {
      status: 'responded_positive',
      category: 'positive_reply',
      color: 'green',
      sourceColor,
    };
  }
  if (/not contacted|mailbox not contacted/.test(statusText) || /dark\s*red/.test(sourceColor)) {
    return {
      status: 'not_contacted',
      category: 'not_contacted',
      color: 'dark_red',
      sourceColor,
    };
  }
  if (/contacted|contact attempted|delivery failed|automated reply only/.test(statusText) || sourceColor === 'red') {
    return {
      status: 'contacted',
      category: 'contacted_no_reply',
      color: 'red',
      sourceColor,
    };
  }
  if (/replied|conversation|interview|referral|administrative|retired/.test(statusText)
      || ['yellow', 'student', 'retired'].includes(sourceColor)) {
    return {
      status: 'responded_negative',
      category: 'replied',
      color: 'yellow',
      sourceColor,
    };
  }
  return trackerOutreach(tracker);
}

function roleType(enriched = {}, audit = {}) {
  const leadType = get(enriched, 'lead_type').toLowerCase();
  const auditText = [
    get(audit, 'outreach status'),
    get(audit, 'group / context'),
    get(audit, 'corrections / notes'),
    get(audit, 'colour'),
  ].join(' ').toLowerCase();
  if (leadType === 'group') return 'lab_member_signal';
  if (/administrative|management assistant|hr advisor|hr \/ internships/.test(auditText)) {
    return 'administrative_contact';
  }
  if (/\bstudent\b|external collaborator/.test(auditText)) return 'peer_contact';
  return 'faculty_or_research_staff';
}

function evidenceFrom(enriched = {}, audit = {}) {
  const urls = sourceUrls(
    get(enriched, 'all_source_urls'),
    get(enriched, 'grant_source_urls'),
    get(enriched, 'official_profile_url'),
    get(enriched, 'opening_official_url'),
    get(audit, 'verification evidence url')
  );
  return urls.map((url, index) => ({
    type: 'source',
    label: index === 0 ? 'Professor-list primary source' : `Professor-list source ${index + 1}`,
    url,
    date: get(enriched, 'checked_date'),
  }));
}

function hiringSignalsFrom(enriched = {}) {
  const signals = [];
  const grantUrl = sourceUrls(get(enriched, 'grant_source_urls'))[0];
  const openingUrl = firstUrl(get(enriched, 'opening_official_url', 'opening official url'));
  if (get(enriched, 'grant_found') && !/^(no|none)/i.test(get(enriched, 'grant_found'))) {
    signals.push({
      type: 'funding_signal',
      label: get(enriched, 'grant_title') || 'Verified grant or funding signal',
      url: grantUrl,
      date: get(enriched, 'checked_date'),
      note: [
        get(enriched, 'grant_funder'),
        get(enriched, 'grant_amount'),
        get(enriched, 'grant_currency'),
        get(enriched, 'grant_project_period'),
        get(enriched, 'grant_status'),
      ].filter(Boolean).join(' · '),
    });
  }
  if (get(enriched, 'opening_found') && !/^(no|none)/i.test(get(enriched, 'opening_found'))) {
    signals.push({
      type: 'hiring_signal',
      label: get(enriched, 'opening_title') || 'Verified opening',
      url: openingUrl,
      date: get(enriched, 'opening_posted_date'),
      note: [
        get(enriched, 'opening_status'),
        get(enriched, 'opening_deadline'),
        get(enriched, 'opening_location'),
      ].filter(Boolean).join(' · '),
    });
  }
  return signals;
}

function activeGrantsFrom(enriched = {}, institution = '') {
  if (!/^yes\b/i.test(get(enriched, 'grant_found'))) return [];
  return normalizeActiveGrants([{
    title: get(enriched, 'grant_title'),
    funder: get(enriched, 'grant_funder'),
    amount: get(enriched, 'grant_amount'),
    currency: get(enriched, 'grant_currency'),
    project_period: get(enriched, 'grant_project_period'),
    pi_role: get(enriched, 'grant_role'),
    status: get(enriched, 'grant_status'),
    institution,
    source_urls: sourceUrls(get(enriched, 'grant_source_urls')),
    confidence: get(enriched, 'evidence_confidence'),
    checked_at: get(enriched, 'checked_date'),
  }]);
}

function openingsFrom(enriched = {}) {
  if (!/^yes\b/i.test(get(enriched, 'opening_found'))) return [];
  const applicationUrl = firstUrl(get(enriched, 'opening_official_url'));
  const linkedinUrl = firstUrl(get(enriched, 'opening_linkedin_url'));
  return [{
    title: get(enriched, 'opening_title') || 'Verified opening',
    type: get(enriched, 'opening_type'),
    status: get(enriched, 'opening_status'),
    posted_date: get(enriched, 'opening_posted_date'),
    deadline: get(enriched, 'opening_deadline'),
    location: get(enriched, 'opening_location'),
    summary: get(enriched, 'opening_summary'),
    application_url: applicationUrl,
    linkedin_url: linkedinUrl,
    source_urls: [...new Set([applicationUrl, linkedinUrl].filter(Boolean))],
  }];
}

function countryFrom(location = '', institution = '') {
  const text = `${location} ${institution}`.toLowerCase();
  if (/switzerland|epfl|bern|eth zurich|psi\b/.test(text)) return 'Switzerland';
  if (/germany|max planck|ipp\b/.test(text)) return 'Germany';
  if (/france|sorbonne|polytechnique|toulouse|cnrs|orl[ée]ans/.test(text)) return 'France';
  if (/netherlands|eindhoven|differ/.test(text)) return 'Netherlands';
  if (/sweden|kth\b/.test(text)) return 'Sweden';
  if (/\buk\b|united kingdom|ucl\b/.test(text)) return 'United Kingdom';
  if (/\busa\b|united states|princeton|berkeley|colorado|michigan|iowa|new hampshire|utsa|swri|asu\b/.test(text)) {
    return 'United States';
  }
  return cleanText(location);
}

function mergeNotes(...values) {
  return [...new Set(values.map(cleanText).filter(Boolean))].join(' | ');
}

function mergedSourceDetails(tracker, audit, enriched) {
  return {
    tracker: cleanRecord(tracker),
    email_audit: cleanRecord(audit),
    enriched_research: cleanRecord(enriched),
  };
}

function deriveMethodsAndFacilities({
  researchInterests = '',
  theme = '',
  department = '',
  title = '',
  researchSummary = '',
} = {}) {
  const text = [title, department, theme, researchInterests, researchSummary].join(' | ');
  const methods = [];
  const facilities = [];
  const pushUnique = (list, value) => {
    const cleaned = cleanText(value);
    if (cleaned && !list.includes(cleaned)) list.push(cleaned);
  };

  if (/diagnos/i.test(text)) pushUnique(methods, 'plasma diagnostics');
  if (/\bCXRS\b/i.test(text)) pushUnique(methods, 'CXRS');
  if (/motional\s+stark|\bMSE\b/i.test(text)) pushUnique(methods, 'Motional Stark Effect');
  if (/multispectral/i.test(text)) pushUnique(methods, 'multispectral imaging');
  if (/reflectometr/i.test(text)) pushUnique(methods, 'reflectometry');
  if (/mass\s+spectrom/i.test(text)) pushUnique(methods, 'mass spectrometry');
  if (/ion\s+optics|TOF|time[-\s]?of[-\s]?flight/i.test(text)) pushUnique(methods, 'ion optics');
  if (/detector|FPGA|scintillator|readout/i.test(text)) pushUnique(methods, 'detector instrumentation');
  if (/vacuum|high[-\s]?voltage|DAQ|data acquisition|calibrat/i.test(text)) {
    pushUnique(methods, 'vacuum / HV / DAQ hardware');
  }
  if (/additive manufacturing|LPBF|materials characterization|metrolog/i.test(text)) {
    pushUnique(methods, 'materials / manufacturing characterization');
  }
  if (/Magnum[-\s]?PSI/i.test(text)) pushUnique(facilities, 'Magnum-PSI');
  if (/\bITER\b/i.test(text)) pushUnique(facilities, 'ITER-related diagnostics');
  if (/\bZEUS\b|\bHERCULES\b|CUOS/i.test(text)) pushUnique(facilities, 'high-intensity laser facility');
  if (/LIMS/i.test(text)) pushUnique(facilities, 'LIMS');
  return { methods, facilities };
}

function createProspect(bundle = {}) {
  const tracker = bundle.tracker || {};
  const audit = bundle.audit || {};
  const enriched = bundle.enriched || {};
  const name = get(enriched, 'professor_name') || get(audit, 'contact') || get(tracker, 'professor name');
  const institution =
    get(enriched, 'university_original') || get(audit, 'institution') || get(tracker, 'university');
  const email =
    get(enriched, 'email') || get(audit, 'email used') || get(tracker, 'email');
  const location = get(enriched, 'location_original') || get(tracker, 'location');
  const department =
    get(enriched, 'research_group_original') || get(audit, 'group / context') || get(tracker, 'research group');
  const researchInterests =
    get(enriched, 'research_interests_original') || get(tracker, 'research interests');
  const theme = get(enriched, 'research_theme_original') || get(tracker, 'research theme');
  const researchSummary = get(enriched, 'research_summary') || researchInterests;
  const title = get(enriched, 'current_affiliation') || department;
  const derived = deriveMethodsAndFacilities({
    researchInterests,
    theme,
    department,
    title,
    researchSummary,
  });
  const outreach = mapAuditOutreach(audit, tracker);
  const gmailLinks = auditGmailLinks(audit);
  const leadId = get(enriched, 'lead_id');
  const profileUrl = firstUrl(
    get(enriched, 'official_profile_url'),
    get(enriched, 'existing_url'),
    get(tracker, 'url')
  );
  const openingUrl = firstUrl(get(enriched, 'opening_official_url'));
  const linkedinUrl = firstUrl(get(enriched, 'opening_linkedin_url'));
  const openingStatus = get(enriched, 'opening_status');
  const openings = openingsFrom(enriched);
  const sourceReport = get(enriched, 'deep_research_report_path')
    || 'HarshD_Professors List/HarshD_Professors_List_Research_Enriched_2026-07-10.html';

  return {
    id: `${PROFESSOR_LIST_SOURCE_ID}-${leadId || slugify(`${name}-${institution}`)}`,
    source: PROFESSOR_LIST_SOURCE_ID,
    external_id: leadId,
    provider: 'HarshD Professors List',
    name,
    title,
    unit: department || institution,
    department: department || institution || 'Unclassified research contact',
    departments: department ? [department] : [],
    lab: department,
    institution,
    role_type: roleType(enriched, audit),
    campus: location || countryFrom(location, institution),
    country: countryFrom(location, institution),
    profile_url: profileUrl,
    lab_url: profileUrl,
    linkedin_url: linkedinUrl,
    ...gmailLinks,
    contact_email: email,
    contact_page: profileUrl,
    research_fields: theme ? [theme] : [],
    research_keywords: splitList(researchInterests),
    methods: derived.methods,
    facilities: derived.facilities,
    transfer_vectors: splitList(theme),
    current_focus: researchSummary,
    research_interests_summary: researchSummary,
    fit_rationale: get(enriched, 'priority_reason') || get(enriched, 'research_summary') || researchInterests,
    outreach_angle: get(enriched, 'opening_summary') || get(audit, 'crisp thread outcome'),
    hiring_signals: hiringSignalsFrom(enriched),
    active_grants: activeGrantsFrom(enriched, institution),
    openings,
    evidence: evidenceFrom(enriched, audit),
    application_route: openingUrl ? 'verified_opening' : 'email_supervisor_first',
    application_url: openingUrl,
    likely_route: openingUrl
      ? `Review the verified ${get(enriched, 'opening_type') || 'opening'} and contact this person if appropriate.`
      : 'Use the verified profile and email before approaching this contact.',
    opportunity_status: openingStatus,
    deadline_text: get(enriched, 'opening_deadline'),
    uncertainty_notes: mergeNotes(get(enriched, 'caveats'), get(enriched, 'identity_notes')),
    status: outreach.status,
    outreach_category: outreach.category,
    outreach_color: outreach.color,
    outreach_source_color: outreach.sourceColor || get(audit, 'colour'),
    outreach_status_detail: get(audit, 'outreach status'),
    outreach_outcome: get(audit, 'crisp thread outcome'),
    verification_evidence: get(audit, 'verification evidence'),
    last_contacted: get(audit, 'last contact') || get(tracker, 'date sent'),
    notes: mergeNotes(
      get(audit, 'crisp thread outcome'),
      get(audit, 'corrections / notes'),
      get(tracker, 'notes'),
      get(enriched, 'existing_notes')
    ),
    source_details: mergedSourceDetails(tracker, audit, enriched),
    source_report: sourceReport,
    first_seen: get(enriched, 'checked_date') || get(audit, 'last contact') || new Date().toISOString(),
    last_updated: new Date().toISOString(),
  };
}

function mergeRows({ trackerRows = [], auditRows = [], enrichedRows = [] } = {}) {
  const bundles = [];
  const byEmail = new Map();
  const byName = new Map();

  const attach = (kind, row) => {
    const key = identityKey(row);
    let bundle = (key.email && byEmail.get(key.email)) || (key.name && byName.get(key.name));
    if (!bundle) {
      bundle = {};
      bundles.push(bundle);
    }
    bundle[kind] = { ...(bundle[kind] || {}), ...row };
    if (key.email) byEmail.set(key.email, bundle);
    if (key.name) byName.set(key.name, bundle);
  };

  trackerRows.forEach(row => attach('tracker', row));
  enrichedRows.forEach(row => attach('enriched', row));
  auditRows.forEach(row => attach('audit', row));
  return bundles;
}

export function buildProfessorProspects({
  trackerRows = [],
  auditRows = [],
  enrichedRows = [],
} = {}) {
  return mergeRows({ trackerRows, auditRows, enrichedRows })
    .map(createProspect)
    .filter(prospect => prospect.name && prospect.department)
    .sort((a, b) => {
      const rank = { positive_reply: 0, replied: 1, contacted_no_reply: 2, not_contacted: 3 };
      return (rank[a.outreach_category] ?? 9) - (rank[b.outreach_category] ?? 9)
        || a.name.localeCompare(b.name);
    });
}

export function professorOutreachUserStateUpdates(prospects = []) {
  return prospects
    .filter(prospect => cleanText(prospect?.id))
    .map(prospect => ({
      sourceId: PROFESSOR_LIST_SOURCE_ID,
      prospectId: cleanText(prospect.id),
      fields: {
        status: cleanText(prospect.status || 'not_contacted'),
        last_contacted: cleanText(prospect.last_contacted),
        notes: cleanText(prospect.notes),
      },
    }));
}

function worksheetHeaderRow(worksheet, requiredHeader, fallback = 1) {
  if (!worksheet) return fallback;
  const required = cleanKey(requiredHeader);
  const maxRow = Math.min(worksheet.rowCount, 25);
  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      if (cleanKey(cellText(row.getCell(column))) === required) return rowNumber;
    }
  }
  return fallback;
}

export function professorRowsFromWorkbook(workbook) {
  const tracker = workbook.getWorksheet(TRACKER_SHEET);
  const audit = workbook.getWorksheet(AUDIT_SHEET);
  const enriched = workbook.worksheets.find(sheet => sheet.name.startsWith(ENRICHED_SHEET_PREFIX));
  return {
    trackerRows: worksheetObjects(tracker, worksheetHeaderRow(tracker, 'Professor Name', 7))
      .filter(row => get(row, 'professor name')),
    auditRows: worksheetObjects(audit, worksheetHeaderRow(audit, 'Contact', 5))
      .filter(row => get(row, 'contact')),
    enrichedRows: worksheetObjects(enriched, worksheetHeaderRow(enriched, 'professor_name', 1))
      .filter(row => get(row, 'professor_name')),
  };
}

export function professorRowsFromHtml({ auditHtml = '', enrichedHtml = '' } = {}) {
  return {
    trackerRows: [],
    auditRows: htmlTableObjects(auditHtml, 'Contact')
      .filter(row => get(row, 'contact') && get(row, 'contact') !== 'Contact'),
    enrichedRows: htmlTableObjects(enrichedHtml, 'professor_name')
      .filter(row => get(row, 'professor_name') && get(row, 'professor_name') !== 'professor_name'),
  };
}

export function professorRowsFromCsv(enrichedCsv = '') {
  return new Promise((resolve, reject) => {
    const rows = [];
    parseString(String(enrichedCsv || ''), {
      headers: headers => headers.map(header => cleanText(header).replace(/^\uFEFF/, '')),
      ignoreEmpty: true,
      trim: true,
    })
      .on('error', reject)
      .on('data', row => rows.push(cleanRecord(row)))
      .on('end', () => resolve(
        rows.filter(row => get(row, 'professor_name') && get(row, 'professor_name') !== 'professor_name')
      ));
  });
}
