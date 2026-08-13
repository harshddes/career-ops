import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';
import {
  buildProfessorProspects,
  htmlTableObjects,
  mapAuditOutreach,
  professorOutreachUserStateUpdates,
  professorRowsFromCsv,
  professorRowsFromWorkbook,
} from '../lib/professor-list-import.mjs';
import { normalizeResearchProspect } from '../lib/research-prospect-store.mjs';
import { normalizeActiveGrants } from '../lib/professor-grants/schema.mjs';
import { buildGrantResearchPlan, normalizeProfessorCountry } from '../lib/professor-grants/router.mjs';
import { parseNsfAwardsJson, parseSnsfGrantHtml } from '../lib/professor-grants/adapters.mjs';

const TEST_DIR = fileURLToPath(new URL('.', import.meta.url));
const DASHBOARD_HTML = join(TEST_DIR, '..', 'dashboard', 'fusion-pivot-dashboard.html');

test('maps verified email-audit outcomes without trusting a stale colour label', () => {
  assert.deepEqual(
    mapAuditOutreach({ 'Outreach Status': 'Strong positive signal', Colour: 'Yellow' }),
    {
      status: 'responded_positive',
      category: 'positive_reply',
      color: 'green',
      sourceColor: 'yellow',
    }
  );
  assert.equal(
    mapAuditOutreach({ 'Outreach Status': 'Replied / conversation', Colour: 'Yellow' }).category,
    'replied'
  );
  assert.equal(
    mapAuditOutreach({ 'Outreach Status': 'Contacted — no substantive reply', Colour: 'Red' }).category,
    'contacted_no_reply'
  );
  assert.equal(
    mapAuditOutreach({ 'Outreach Status': 'Not contacted', Colour: 'Dark Red' }).category,
    'not_contacted'
  );
});

test('merges tracker, audit, and enriched rows into one complete professor card', () => {
  const prospects = buildProfessorProspects({
    trackerRows: [{
      'Professor Name': 'Samuel Cohen',
      Email: 'scohen@pppl.gov',
      University: 'Princeton University',
      'Research Group': 'PPPL',
      'Research Interests': 'FRC, plasma diagnostics',
      Status: 'Sent',
      Notes: 'Original tracker note',
    }],
    auditRows: [{
      Contact: 'Samuel Cohen',
      'Email Used': 'scohen@pppl.gov',
      Institution: 'Princeton University',
      'Group / Context': 'PPPL',
      'Outreach Status': 'Strong positive signal',
      Colour: 'Green',
      'Crisp Thread Outcome': 'Held a meeting and referred another lead.',
      'Last Contact': '2026-02-19',
      'Direct Gmail Thread': 'Open thread 1',
      'Direct Gmail Thread URL': 'https://mail.google.com/mail/u/0/#all/thread',
    }],
    enrichedRows: [{
      lead_id: 'lead-038',
      lead_type: 'person',
      professor_name: 'Samuel Cohen',
      university_original: 'Princeton University',
      email: 'scohen@pppl.gov',
      current_affiliation: 'Senior scientist',
      location_original: 'USA',
      research_group_original: 'Princeton Plasma Physics Laboratory',
      research_interests_original: 'FRC, magnetic confinement fusion',
      research_theme_original: 'Plasma Physics & Fusion',
      official_profile_url: 'https://www.pppl.gov/people/sam-cohen',
      research_summary: 'Builds and studies field-reversed plasma systems.',
      opening_found: 'Yes',
      opening_title: 'Research role',
      opening_official_url: 'https://example.edu/opening',
      priority_reason: 'Direct experimental plasma overlap.',
    }],
  });

  assert.equal(prospects.length, 1);
  const [prospect] = prospects;
  assert.equal(prospect.id, 'professor-list-lead-038');
  assert.equal(prospect.status, 'responded_positive');
  assert.equal(prospect.outreach_category, 'positive_reply');
  assert.equal(prospect.application_url, 'https://example.edu/opening');
  assert.equal(prospect.gmail_thread_url, 'https://mail.google.com/mail/u/0/#all/thread');
  assert.equal(prospect.openings[0].application_url, 'https://example.edu/opening');
  assert.equal(prospect.source_details.tracker.Notes, 'Original tracker note');
  assert.equal(
    prospect.source_details.email_audit['Direct Gmail Thread URL'],
    'https://mail.google.com/mail/u/0/#all/thread'
  );
  assert.equal(prospect.source_details.enriched_research.opening_title, 'Research role');
});

test('maps enriched CSV grant and opening fields into first-class records', async () => {
  const csv = [
    'lead_id,professor_name,email,university_original,research_group_original,location_original,grant_found,grant_title,grant_funder,grant_amount,grant_currency,grant_project_period,grant_role,grant_status,grant_source_urls,opening_found,opening_title,opening_status,opening_official_url,checked_date',
    'lead-101,Ada Lovelace,ada@example.edu,Example University,Computing Lab,Switzerland,Yes,Future Instruments,SNSF,500000,CHF,01.09.2024 - 31.08.2028,PI,Active,https://data.snf.ch/grants/grant/101,Yes,Doctoral researcher,Open,https://example.edu/jobs/101,2026-07-10',
  ].join('\n');
  const enrichedRows = await professorRowsFromCsv(csv);
  const [prospect] = buildProfessorProspects({ enrichedRows });

  assert.equal(enrichedRows.length, 1);
  assert.equal(prospect.active_grants.length, 1);
  assert.equal(prospect.active_grants[0].end_date, '2028-08-31');
  assert.equal(prospect.active_grants[0].source_url, 'https://data.snf.ch/grants/grant/101');
  assert.equal(prospect.openings[0].application_url, 'https://example.edu/jobs/101');
  assert.equal(prospect.application_url, 'https://example.edu/jobs/101');
});

test('keeps verified imported outreach status authoritative over stale dashboard state', () => {
  const [update] = professorOutreachUserStateUpdates([{
    id: 'professor-list-lead-038',
    status: 'responded_positive',
    last_contacted: '2026-02-19',
    notes: 'Held a meeting and referred another lead.',
  }]);

  assert.deepEqual(update, {
    sourceId: 'professor-list',
    prospectId: 'professor-list-lead-038',
    fields: {
      status: 'responded_positive',
      last_contacted: '2026-02-19',
      notes: 'Held a meeting and referred another lead.',
    },
  });
});

test('extracts local Google Sheets HTML values and hyperlinks', () => {
  const html = `
    <table>
      <tr><th></th><td>Contact</td><td>Email Used</td><td>Direct Gmail Thread</td></tr>
      <tr><th>1</th><td>Ada Lovelace</td><td>ada@example.edu</td>
        <td><a href="https://mail.google.com/thread">Open thread</a></td></tr>
    </table>`;
  const rows = htmlTableObjects(html, 'Contact');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Contact, 'Ada Lovelace');
  assert.equal(rows[0]['Direct Gmail Thread URL'], 'https://mail.google.com/thread');
});

test('finds workbook headers even when presentation rows precede the data', () => {
  const workbook = new ExcelJS.Workbook();
  const tracker = workbook.addWorksheet('Tracker');
  for (let index = 0; index < 6; index += 1) tracker.addRow([]);
  tracker.addRow(['Professor Name', 'Email', 'University', 'Research Group']);
  tracker.addRow(['Ada Lovelace', 'ada@example.edu', 'Example University', 'Computing Lab']);

  const audit = workbook.addWorksheet('Email Audit 2025-26');
  audit.addRow(['Professor Outreach']);
  audit.addRow([]);
  audit.addRow(['Contact', 'Email Used', 'Outreach Status', 'Colour']);
  audit.addRow(['Ada Lovelace', 'ada@example.edu', 'Replied / conversation', 'Yellow']);

  const enriched = workbook.addWorksheet('HarshD_Professors_List_Research');
  enriched.addRow(['lead_id', 'professor_name', 'email', 'research_group_original']);
  enriched.addRow(['lead-001', 'Ada Lovelace', 'ada@example.edu', 'Computing Lab']);

  const rows = professorRowsFromWorkbook(workbook);
  assert.equal(rows.trackerRows.length, 1);
  assert.equal(rows.auditRows.length, 1);
  assert.equal(rows.enrichedRows.length, 1);
});

test('research prospect normalization keeps imported outreach and full source fields', () => {
  const prospect = normalizeResearchProspect({
    name: 'Ada Lovelace',
    department: 'Computing Lab',
    outreach_category: 'replied',
    outreach_color: 'yellow',
    outreach_status_detail: 'Replied / conversation',
    outreach_outcome: 'Asked for a follow-up.',
    gmail_thread_url: 'https://mail.google.com/mail/u/0/#inbox/thread',
    active_grants: [{
      title: 'Active award',
      funder: 'SNSF',
      end_date: '2028-08-31',
      source_url: 'https://data.snf.ch/grants/grant/101',
    }],
    source_details: { email_audit: { Colour: 'Yellow' } },
  });
  assert.equal(prospect.outreach_category, 'replied');
  assert.equal(prospect.outreach_color, 'yellow');
  assert.equal(prospect.source_details.email_audit.Colour, 'Yellow');
  assert.equal(prospect.gmail_thread_url, 'https://mail.google.com/mail/u/0/#inbox/thread');
  assert.equal(prospect.active_grants.length, 1);
});

test('grant window drops ended awards and keeps 2026-2040 or ongoing awards', () => {
  const grants = normalizeActiveGrants([
    { title: 'Expired', end_date: '2025-12-31' },
    { title: 'Current', end_date: '2028-08-31' },
    { title: 'Ongoing without date', status: 'Active' },
    { title: 'Implausibly distant', end_date: '2041-01-01' },
  ]);
  assert.deepEqual(grants.map(grant => grant.title), ['Current', 'Ongoing without date']);
});

test('country router selects national portals and EU cross-checks', () => {
  const swiss = buildGrantResearchPlan({
    id: 'professor-list-paolo-ricci',
    name: 'Paolo Ricci',
    institution: 'EPFL',
    country: 'Switzerland',
  });
  assert.equal(normalizeProfessorCountry({ country: 'USA' }), 'US');
  assert.deepEqual(swiss.requests.map(request => request.portal), ['snsf', 'cordis']);
  assert.match(swiss.requests[0].url, /data\.snf\.ch\/grants/);
});

test('SNSF and NSF fixtures normalize active grants and filter expired awards', () => {
  const snsfHtml = readFileSync(join(TEST_DIR, 'fixtures', 'professor-grants-snsf.html'), 'utf-8');
  const nsfJson = JSON.parse(readFileSync(join(TEST_DIR, 'fixtures', 'professor-grants-nsf.json'), 'utf-8'));
  const prospect = { name: 'Paolo Ricci', institution: 'EPFL' };
  const [snsf] = parseSnsfGrantHtml(snsfHtml, prospect, '2026-08-08T00:00:00.000Z');
  const nsf = parseNsfAwardsJson(nsfJson, { institution: 'Example University' }, '2026-08-08T00:00:00.000Z');

  assert.equal(snsf.grant_id, '10001273');
  assert.equal(snsf.end_date, '2029-08-31');
  assert.equal(nsf.length, 1);
  assert.equal(nsf[0].grant_id, '2612345');
  assert.equal(nsf[0].end_date, '2028-08-31');
});

test('PhD Options exposes Gmail, active grants, and complete source details', () => {
  const html = readFileSync(DASHBOARD_HTML, 'utf-8');
  assert.match(html, /id="phd-researchprospects-outreach"/);
  assert.match(html, /id="phd-outreach-kanban"/);
  assert.match(html, /value="positive_reply"/);
  assert.match(html, /value="contacted_no_reply"/);
  assert.match(html, /value="not_contacted"/);
  assert.match(html, /function prospectSourceDetailsHtml/);
  assert.match(html, /All imported source fields/);
  assert.match(html, /Open Gmail thread/);
  assert.match(html, /Active grants:/);
  assert.match(html, /No verified active grant ending 2026–2040 yet/);
  assert.match(html, /phd-researchprospects-active-grant/);
  assert.match(html, /patchPhdResearchProspectFields/);
  assert.match(html, /refreshOutreachKanbanLanes/);
  // Regression: never wipe PhD cache before the SSE skip guard (empty kanban mid-edit).
  assert.doesNotMatch(
    html,
    /phdResearchProspectsCache\.delete\(sourceId\);\s*if \(activeTabId\(\) === 'phdradar'\) renderPhdResearchProspectsFromSse/,
  );
  assert.match(html, /function markPhdResearchProspectsStale/);
  assert.match(html, /Never wipe the in-memory Map before this guard/);
});
