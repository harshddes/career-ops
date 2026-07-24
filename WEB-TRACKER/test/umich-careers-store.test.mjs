import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  mergeUmichCrawl,
  normalizeUmichOpportunityRecord,
  patchUmichOpportunity,
  findUmichOpportunity,
  readUmichOpportunities,
  rescoreUmichOpportunities,
  syncUmichOpportunitiesToDashboard,
} from '../lib/umich-careers/opportunity-store.mjs';

function tempStore() {
  return join(mkdtempSync(join(tmpdir(), 'umich-store-test-')), 'store.json');
}

const NUCLEAR_ROW = {
  job_id: '111',
  title: 'Nuclear Engineering Research Associate',
  url: 'https://careers.umich.edu/job_detail/111/nuclear-engineering-research-associate',
  department: 'NERS',
  work_location: 'Ann Arbor Campus',
  date_posted: '2026-07-20T09:00:00-04:00',
  employment_type: 'Full-Time',
};

const CUSTODIAN_ROW = {
  job_id: '222',
  title: 'Custodian II',
  url: 'https://careers.umich.edu/job_detail/222/custodian-ii',
  department: 'Facilities',
  work_location: 'Ann Arbor Campus',
  date_posted: '2026-07-20T09:00:00-04:00',
  employment_type: 'Part-Time',
};

const NUCLEAR_DETAIL = new Map([
  ['111', {
    working_title: 'Nuclear Engineering Research Associate',
    job_title: 'Research Associate',
    description_text: 'Support fission reactor experiments, radiation detection instrumentation, and plasma diagnostics.',
    posting_end_date: '2099-01-01',
    employment_type: 'Full-Time',
    salary_text: '$70,000.00 - $85,000.00',
    regular_temporary: 'Regular',
  }],
]);

test('merge dedupes by job id, scores, and keeps everything searchable', () => {
  const file = tempStore();
  const { store, newOpportunities } = mergeUmichCrawl([NUCLEAR_ROW, CUSTODIAN_ROW], NUCLEAR_DETAIL, {
    completeCrawl: true,
    filePath: file,
  });
  assert.equal(newOpportunities.length, 2);
  assert.equal(store.opportunities.length, 2);
  const nuclear = store.opportunities.find(item => item.job_id === '111');
  const custodian = store.opportunities.find(item => item.job_id === '222');
  assert.equal(nuclear.segment, 'apply_now');
  assert.equal(nuclear.salary_text, '$70,000.00 - $85,000.00');
  assert.equal(custodian.segment, 'other');
  assert.equal(custodian.status, 'open');
  // Priority segments sort before other.
  assert.equal(store.opportunities[0].job_id, '111');
});

test('closure requires two consecutive complete crawls; partial crawls never close', () => {
  const file = tempStore();
  mergeUmichCrawl([NUCLEAR_ROW, CUSTODIAN_ROW], NUCLEAR_DETAIL, { completeCrawl: true, filePath: file });

  // Complete crawl 1 without 222 — counted but still open.
  mergeUmichCrawl([NUCLEAR_ROW], new Map(), { completeCrawl: true, filePath: file });
  let record = readUmichOpportunities(file).opportunities.find(item => item.job_id === '222');
  assert.equal(record.status, 'open');
  assert.equal(record.missing_crawl_count, 1);

  // Partial crawl without 222 — no increment.
  mergeUmichCrawl([], new Map(), { completeCrawl: false, filePath: file });
  record = readUmichOpportunities(file).opportunities.find(item => item.job_id === '222');
  assert.equal(record.missing_crawl_count, 1);

  // Complete crawl 2 without 222 — closed.
  const { closedCount } = mergeUmichCrawl([NUCLEAR_ROW], new Map(), { completeCrawl: true, filePath: file });
  assert.equal(closedCount, 1);
  record = readUmichOpportunities(file).opportunities.find(item => item.job_id === '222');
  assert.equal(record.status, 'closed');
  assert.equal(record.segment, 'closed');
  assert.match(record.closed_reason, /consecutive complete crawls/);
});

test('reappearing posting reopens with reset bookkeeping', () => {
  const file = tempStore();
  mergeUmichCrawl([NUCLEAR_ROW, CUSTODIAN_ROW], NUCLEAR_DETAIL, { completeCrawl: true, filePath: file });
  mergeUmichCrawl([NUCLEAR_ROW], new Map(), { completeCrawl: true, filePath: file });
  mergeUmichCrawl([NUCLEAR_ROW], new Map(), { completeCrawl: true, filePath: file });
  mergeUmichCrawl([NUCLEAR_ROW, CUSTODIAN_ROW], NUCLEAR_DETAIL, { completeCrawl: true, filePath: file });
  const record = readUmichOpportunities(file).opportunities.find(item => item.job_id === '222');
  assert.equal(record.status, 'open');
  assert.equal(record.missing_crawl_count, 0);
  assert.equal(record.closed_reason, '');
});

test('merge preserves first_seen and jobs_to_consider_id across updates', () => {
  const file = tempStore();
  mergeUmichCrawl([NUCLEAR_ROW], NUCLEAR_DETAIL, { completeCrawl: true, filePath: file });
  const before = readUmichOpportunities(file).opportunities[0];
  patchUmichOpportunity(before.id, { jobs_to_consider_id: 'ners-nuclear-engineering-research-associate' }, file);
  mergeUmichCrawl([NUCLEAR_ROW], NUCLEAR_DETAIL, { completeCrawl: true, filePath: file });
  const after = readUmichOpportunities(file).opportunities[0];
  assert.equal(after.first_seen, before.first_seen);
  assert.equal(after.jobs_to_consider_id, 'ners-nuclear-engineering-research-associate');
});

test('rescore applies current policy and closes past end dates', () => {
  const file = tempStore();
  mergeUmichCrawl([NUCLEAR_ROW], new Map([['111', {
    ...NUCLEAR_DETAIL.get('111'),
    posting_end_date: '2020-01-01',
  }]]), { completeCrawl: true, filePath: file });
  const store = rescoreUmichOpportunities({ filePath: file, now: new Date('2026-07-21T12:00:00Z') });
  const record = store.opportunities[0];
  assert.equal(record.status, 'closed');
  assert.equal(record.segment, 'closed');
});

test('dashboard sync trims long descriptions but keeps every record', () => {
  const file = tempStore();
  const longDescription = `plasma diagnostics ${'materials science instrumentation detail '.repeat(80)}`;
  mergeUmichCrawl([NUCLEAR_ROW], new Map([['111', {
    ...NUCLEAR_DETAIL.get('111'),
    description_text: longDescription,
  }]]), { completeCrawl: true, filePath: file });
  const outputPath = join(mkdtempSync(join(tmpdir(), 'umich-dash-test-')), 'dashboard.json');
  const output = syncUmichOpportunitiesToDashboard({ sourcePath: file, outputPath });
  assert.equal(output.opportunities.length, 1);
  assert.ok(output.opportunities[0].description.length < longDescription.length);
  assert.ok(output.opportunities[0].description.endsWith('…'));
  assert.equal(output.total, 1);
  assert.ok(output.scan_health.total_count === 1);
});

test('normalize produces stable ids and canonical statuses', () => {
  const record = normalizeUmichOpportunityRecord({ job_id: '99', title: 'X', status: 'bogus' });
  assert.equal(record.id, 'umich-careers-99');
  assert.equal(record.status, 'open');
  const closed = normalizeUmichOpportunityRecord({ job_id: '99', title: 'X', status: 'closed', segment: 'apply_now' });
  assert.equal(closed.segment, 'closed');
});

test('manual archive survives merge and can be restored', () => {
  const filePath = tempStore();
  const details = new Map([
    ['111', {
      working_title: 'Nuclear Engineering Research Associate',
      job_title: 'Research Associate',
      employment_type: 'Full-Time',
      department: 'NERS',
      description_text: 'Nuclear engineering plasma diagnostics laboratory role.',
      posting_end_date: '2026-12-01',
    }],
  ]);
  mergeUmichCrawl([NUCLEAR_ROW], details, { completeCrawl: false, filePath });
  const archived = patchUmichOpportunity('umich-careers-111', {
    archived: true,
    archive_reason: 'Archived from dashboard.',
    archived_at: '2026-07-21T12:00:00.000Z',
    visible: false,
  }, filePath);
  assert.equal(archived.opportunity.archived, true);

  mergeUmichCrawl([NUCLEAR_ROW], details, { completeCrawl: false, filePath });
  const afterMerge = findUmichOpportunity('umich-careers-111', readUmichOpportunities(filePath));
  assert.equal(afterMerge.archived, true);
  assert.match(afterMerge.archive_reason, /Archived from dashboard/);

  const restored = patchUmichOpportunity('umich-careers-111', {
    archived: false,
    archive_reason: '',
    archived_at: '',
  }, filePath);
  assert.equal(restored.opportunity.archived, false);
});

test('applied fields survive merge', () => {
  const filePath = tempStore();
  const details = new Map([
    ['111', {
      working_title: 'Nuclear Engineering Research Associate',
      job_title: 'Research Associate',
      employment_type: 'Full-Time',
      department: 'NERS',
      description_text: 'Nuclear engineering plasma diagnostics laboratory role.',
      posting_end_date: '2026-12-01',
    }],
  ]);
  mergeUmichCrawl([NUCLEAR_ROW], details, { completeCrawl: false, filePath });
  patchUmichOpportunity('umich-careers-111', {
    applied: true,
    applied_at: '2026-07-21T16:00:00.000Z',
    application_num: 52,
  }, filePath);
  mergeUmichCrawl([NUCLEAR_ROW], details, { completeCrawl: false, filePath });
  const after = findUmichOpportunity('umich-careers-111', readUmichOpportunities(filePath));
  assert.equal(after.applied, true);
  assert.equal(after.application_num, 52);
  assert.equal(after.applied_at, '2026-07-21T16:00:00.000Z');
});
