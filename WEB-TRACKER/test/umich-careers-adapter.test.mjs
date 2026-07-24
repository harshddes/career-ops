import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  crawlCatalog,
  parseBeginEndDate,
  parseDetailPage,
  parseLandingCounts,
  parseListingPage,
} from '../lib/umich-careers/source-adapter.mjs';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'umich-careers');
const landingHtml = readFileSync(join(FIXTURES, 'landing.html'), 'utf-8');
const listingHtml = readFileSync(join(FIXTURES, 'listing-f-page0.html'), 'utf-8');
const detailHtml = readFileSync(join(FIXTURES, 'detail-265519.html'), 'utf-8');

test('landing counts parse authoritative totals', () => {
  const counts = parseLandingCounts(landingHtml);
  assert.ok(counts.fullTime > 0, `expected fullTime > 0, got ${counts.fullTime}`);
  assert.ok(counts.partTime > 0, `expected partTime > 0, got ${counts.partTime}`);
  // Fixture values are live snapshots; assert exact parse of the saved HTML.
  const full = Number(landingHtml.match(/Full-Time\s*\((\d+)\)/i)?.[1] || 0);
  const part = Number(landingHtml.match(/Part-Time\s*\((\d+)\)/i)?.[1] || 0);
  assert.equal(counts.fullTime, full);
  assert.equal(counts.partTime, part);
});

test('listing page parses 50 rows with ids, titles, and next pager', () => {
  const parsed = parseListingPage(listingHtml, { employmentType: 'F' });
  assert.equal(parsed.rows.length, 50);
  assert.equal(parsed.nextPagePath, '/browse-jobs/positions/F?page=1');
  const first = parsed.rows[0];
  assert.match(first.job_id, /^\d+$/);
  assert.ok(first.title.length > 0);
  assert.match(first.url, /^https:\/\/careers\.umich\.edu\/job_detail\/\d+\//);
  assert.equal(first.employment_type, 'Full-Time');
  assert.ok(first.department.length > 0);
});

test('detail page parses all structured sidebar fields and the description', () => {
  const detail = parseDetailPage(detailHtml);
  assert.equal(detail.job_id, '265519');
  assert.equal(detail.working_title, 'Senior Electrical Engineer');
  assert.equal(detail.job_title, 'Electrical Engineer Lead');
  assert.equal(detail.employment_type, 'Full-Time');
  assert.equal(detail.regular_temporary, 'Regular');
  assert.equal(detail.modes_of_work, 'Hybrid');
  assert.equal(detail.department, 'AEC-Architecture & Engineering');
  assert.equal(detail.posting_begin_date, '2026-03-02');
  assert.equal(detail.posting_end_date, '2026-07-31');
  assert.equal(detail.salary_text, '$115,000.00 - $142,900.00');
  assert.equal(detail.career_interest, 'Engineering & Architecture');
  assert.equal(detail.apply_url, 'https://careers.umich.edu/job_detail/apply/265519');
  assert.ok(detail.description_text.length > 2000);
  assert.match(detail.description_text, /Mission Statement\s+Facilities/);
  assert.match(detail.description_text, /Michigan Electrical Code/);
});

test('posting begin/end date parser handles the site format', () => {
  assert.deepEqual(parseBeginEndDate('3/02/2026 - 7/31/2026'), { begin: '2026-03-02', end: '2026-07-31' });
  assert.deepEqual(parseBeginEndDate(''), { begin: '', end: '' });
  assert.deepEqual(parseBeginEndDate('12/1/2026'), { begin: '2026-12-01', end: '' });
});

test('crawl marks itself incomplete when a pagination request fails', async () => {
  const fetchImpl = async url => {
    if (url.endsWith('/browse-jobs/positions/F')) {
      return { ok: true, status: 200, text: async () => listingHtml };
    }
    // page=1 and the P catalog fail hard
    return { ok: false, status: 503, text: async () => '', headers: { get: () => null } };
  };
  const result = await crawlCatalog({ fetchImpl, pageDelayMs: 0, types: ['F', 'P'] });
  assert.equal(result.complete, false);
  assert.equal(result.rows.length, 50);
  assert.ok(result.errors.length >= 1);
});

test('crawl follows the pager to completion on success', async () => {
  const lastPage = listingHtml
    .replace(/<a href="\/browse-jobs\/positions\/F\?page=1"[^>]*rel="next">[\s\S]*?<\/a>/, '')
    .replace(/rel="next"/g, '');
  const fetchImpl = async url => {
    if (url.endsWith('?page=1')) return { ok: true, status: 200, text: async () => lastPage };
    return { ok: true, status: 200, text: async () => listingHtml };
  };
  const result = await crawlCatalog({ fetchImpl, pageDelayMs: 0, types: ['F'] });
  assert.equal(result.complete, true);
  // 50 unique ids: page 0 and page 1 fixture share the same rows, deduped by job id.
  assert.equal(result.rows.length, 50);
  assert.equal(result.pagesFetched, 2);
  // Landing reconciliation uses the sum of per-page rows (100), not unique ids.
  assert.equal(result.countsByType.F, 100);
  assert.equal(result.uniqueCountsByType.F, 50);
});
