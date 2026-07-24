/**
 * U-M Careers source adapter — permitted browse/detail HTML ingestion.
 *
 * Robots disallow /search/; use /browse-jobs/positions/{F|P} and /job_detail/.
 * Returns the shape expected by umich-careers-scan.mjs and the test suite.
 */
import * as cheerio from 'cheerio';
import { fetchWithValidators, fingerprint } from '../conditional-fetch.mjs';

export const UMICH_BASE = 'https://careers.umich.edu';
export const LANDING_URL = `${UMICH_BASE}/browse-jobs/positions`;
export const CATALOG_URLS = {
  F: `${UMICH_BASE}/browse-jobs/positions/F`,
  P: `${UMICH_BASE}/browse-jobs/positions/P`,
};

const DEFAULT_PAGE_DELAY_MS = 350;
const DEFAULT_DETAIL_CONCURRENCY = 2;
const DEFAULT_RETRIES = 3;

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function absoluteUrl(href = '') {
  const clean = cleanText(href);
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) return clean;
  if (clean.startsWith('/')) return `${UMICH_BASE}${clean}`;
  return `${UMICH_BASE}/${clean}`;
}

function employmentLabel(type = '') {
  const key = cleanText(type).toUpperCase();
  if (key === 'F' || /full/i.test(type)) return 'Full-Time';
  if (key === 'P' || /part/i.test(type)) return 'Part-Time';
  return cleanText(type);
}

function catalogKey(type = '') {
  const key = cleanText(type).toUpperCase();
  if (key === 'F' || /full/i.test(type)) return 'F';
  if (key === 'P' || /part/i.test(type)) return 'P';
  return key;
}

/** Convert M/D/YYYY (or MM/DD/YYYY) to YYYY-MM-DD. */
export function parseUsDate(value = '') {
  const clean = cleanText(value);
  const match = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return '';
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function parseBeginEndDate(value = '') {
  const clean = cleanText(value);
  if (!clean) return { begin: '', end: '' };
  const range = clean.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (range) return { begin: parseUsDate(range[1]), end: parseUsDate(range[2]) };
  const single = clean.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (single) return { begin: parseUsDate(single[1]), end: '' };
  return { begin: '', end: '' };
}

export function parseLandingCounts(html = '') {
  const $ = cheerio.load(html);
  const text = $('body').text();
  return {
    fullTime: Number(text.match(/Full-Time\s*\((\d+)\)/i)?.[1] || 0),
    partTime: Number(text.match(/Part-Time\s*\((\d+)\)/i)?.[1] || 0),
  };
}

export function parseListingPage(html = '', { employmentType = 'F' } = {}) {
  const $ = cheerio.load(html);
  const typeKey = catalogKey(employmentType);
  const rows = [];
  $('table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 5) return;
    const link = $(cells[1]).find('a').first();
    const href = absoluteUrl(link.attr('href') || '');
    const jobId = cleanText($(cells[2]).text()) || href.match(/\/job_detail\/(\d+)/)?.[1] || '';
    if (!jobId || !href) return;
    const postedRaw = cleanText($(cells[0]).text());
    rows.push({
      job_id: jobId,
      title: cleanText(link.text() || $(cells[1]).text()),
      url: href,
      date_posted: parseUsDate(postedRaw) || postedRaw,
      department: cleanText($(cells[3]).text()),
      work_location: cleanText($(cells[4]).text()),
      employment_type: employmentLabel(typeKey),
      catalog_type: typeKey,
    });
  });

  const nextHref = $('a[rel="next"]').attr('href')
    || $('a').filter((_, el) => /^next(?:\s+page)?$/i.test(cleanText($(el).text()))).first().attr('href')
    || '';
  let nextPagePath = '';
  if (nextHref) {
    try {
      const abs = absoluteUrl(nextHref);
      nextPagePath = new URL(abs).pathname + new URL(abs).search;
    } catch {
      nextPagePath = nextHref.startsWith('/') ? nextHref : `/${nextHref}`;
    }
  }
  return { rows, nextPagePath, page_fingerprint: fingerprint(html) };
}

function sectionBlocks($) {
  const blocks = [];
  $('h2').each((_, el) => {
    const heading = cleanText($(el).text());
    if (!heading || /utility|main navigation|footer|job detail/i.test(heading)) return;
    const chunks = [];
    let node = $(el).next();
    while (node.length && !/^h[12]$/i.test(node.prop('tagName') || '')) {
      const text = cleanText(node.text());
      if (text) chunks.push(text);
      node = node.next();
    }
    if (chunks.length) blocks.push(`${heading}\n${chunks.join('\n')}`);
  });
  return blocks;
}

function detailFields($) {
  const fields = {};
  $('h3').each((_, el) => {
    const label = cleanText($(el).text());
    if (!label) return;
    fields[label] = cleanText($(el).next().text());
  });
  return fields;
}

export function parseDetailPage(html = '', { url = '' } = {}) {
  const $ = cheerio.load(html);
  const fields = detailFields($);
  const jobId = cleanText(fields['Job Opening ID']) || url.match(/\/job_detail\/(\d+)/)?.[1] || '';
  const dates = parseBeginEndDate(fields['Posting Begin/End Date'] || '');
  const workLocationRaw = cleanText(fields['Work Location']);
  const workLocationLines = workLocationRaw.split(/\s{2,}|\n/).map(cleanText).filter(Boolean);
  const applyHref = $('a').filter((_, el) => /apply now/i.test(cleanText($(el).text()))).first().attr('href');
  const descriptionParts = sectionBlocks($);
  return {
    job_id: jobId,
    working_title: cleanText(fields['Working Title']) || cleanText($('h1').first().text()),
    job_title: cleanText(fields['Job Title']),
    work_location: workLocationLines[0] || workLocationRaw,
    city_location: workLocationLines.slice(1).join(', '),
    modes_of_work: cleanText(fields['Modes of Work']),
    employment_type: cleanText(fields['Full/Part Time']),
    regular_temporary: cleanText(fields['Regular/Temporary']),
    flsa_status: cleanText(fields['FLSA Status']),
    organizational_group: cleanText(fields['Organizational Group']),
    department: cleanText(fields['Department']),
    posting_begin_date: dates.begin,
    posting_end_date: dates.end,
    posting_begin_end_text: cleanText(fields['Posting Begin/End Date']),
    salary_text: cleanText(fields['Salary']),
    career_interest: cleanText(fields['Career Interest']),
    apply_url: absoluteUrl(applyHref || (jobId ? `/job_detail/apply/${jobId}` : '')),
    description_text: descriptionParts.join('\n\n'),
    detail_fingerprint: fingerprint(html),
  };
}

async function defaultFetch(url, { cache = {}, retries = DEFAULT_RETRIES } = {}) {
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = await fetchWithValidators(url, cache);
    if (result.status === 304) {
      return {
        ok: true,
        status: 304,
        text: async () => '',
        headers: { get: key => (key === 'etag' ? result.etag : key === 'last-modified' ? result.lastModified : null) },
        etag: result.etag,
        lastModified: result.lastModified,
      };
    }
    if (result.status >= 200 && result.status < 300 && result.data != null) {
      const body = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
      return {
        ok: true,
        status: result.status,
        text: async () => body,
        headers: { get: key => (key === 'etag' ? result.etag : key === 'last-modified' ? result.lastModified : null) },
        etag: result.etag,
        lastModified: result.lastModified,
      };
    }
    last = result;
    const retryable = result.status === 0 || result.status === 429 || result.status >= 500;
    if (!retryable || attempt === retries) break;
    await sleep(Math.min(8_000, 500 * (2 ** attempt)));
  }
  return {
    ok: false,
    status: last?.status || 0,
    text: async () => '',
    headers: { get: () => null },
    error: last?.error || `HTTP ${last?.status || 0}`,
  };
}

export async function fetchLandingCounts({ fetchImpl = defaultFetch } = {}) {
  const response = await fetchImpl(LANDING_URL);
  if (!response.ok) {
    return { ok: false, error: response.error || `HTTP ${response.status}`, fullTime: 0, partTime: 0 };
  }
  const html = await response.text();
  const counts = parseLandingCounts(html);
  return { ok: true, ...counts };
}

export async function crawlCatalogType(type = 'F', {
  maxPages = 500,
  pageDelayMs = DEFAULT_PAGE_DELAY_MS,
  fetchImpl = defaultFetch,
  onPage = null,
} = {}) {
  const typeKey = catalogKey(type);
  const startUrl = CATALOG_URLS[typeKey];
  if (!startUrl) throw new Error(`Unknown catalog type: ${type}`);

  const rows = [];
  const seen = new Set();
  const errors = [];
  let pagesFetched = 0;
  let pagesFailed = 0;
  let rawRowCount = 0;
  let nextPath = new URL(startUrl).pathname;
  let complete = true;

  for (let page = 0; page < maxPages && nextPath; page += 1) {
    const url = absoluteUrl(nextPath);
    const response = await fetchImpl(url);
    if (!response.ok) {
      pagesFailed += 1;
      complete = false;
      errors.push(`${typeKey} ${nextPath}: HTTP ${response.status}${response.error ? ` (${response.error})` : ''}`);
      break;
    }
    const html = await response.text();
    const parsed = parseListingPage(html, { employmentType: typeKey });
    pagesFetched += 1;
    // Landing totals match the sum of per-page rows (including rare cross-page
    // duplicates). Unique job IDs are what we store; rawRowCount is what we
    // reconcile against the landing page.
    rawRowCount += parsed.rows.length;
    for (const row of parsed.rows) {
      if (seen.has(row.job_id)) continue;
      seen.add(row.job_id);
      rows.push(row);
    }
    if (typeof onPage === 'function') {
      onPage({ type: typeKey, path: nextPath, rowCount: parsed.rows.length, url });
    }
    nextPath = parsed.nextPagePath;
    if (nextPath) await sleep(pageDelayMs);
  }

  return {
    type: typeKey,
    rows,
    errors,
    pagesFetched,
    pagesFailed,
    rawRowCount,
    uniqueCount: rows.length,
    complete,
  };
}

export async function crawlCatalog({
  types = ['F', 'P'],
  pageDelayMs = DEFAULT_PAGE_DELAY_MS,
  fetchImpl = defaultFetch,
  onPage = null,
  maxPages = 500,
} = {}) {
  const allRows = [];
  const seen = new Set();
  const errors = [];
  let pagesFetched = 0;
  let pagesFailed = 0;
  let complete = true;
  // countsByType = sum of page rows (matches landing totals).
  // uniqueCountsByType = distinct job IDs stored after dedupe.
  const countsByType = { F: 0, P: 0 };
  const uniqueCountsByType = { F: 0, P: 0 };

  for (const type of types) {
    const result = await crawlCatalogType(type, { maxPages, pageDelayMs, fetchImpl, onPage });
    pagesFetched += result.pagesFetched;
    pagesFailed += result.pagesFailed;
    errors.push(...result.errors);
    if (!result.complete) complete = false;
    countsByType[result.type] = result.rawRowCount;
    let uniqueForType = 0;
    for (const row of result.rows) {
      if (seen.has(row.job_id)) continue;
      seen.add(row.job_id);
      allRows.push(row);
      uniqueForType += 1;
    }
    uniqueCountsByType[result.type] = uniqueForType;
    await sleep(pageDelayMs);
  }

  return {
    rows: allRows,
    errors,
    pagesFetched,
    pagesFailed,
    complete,
    countsByType,
    uniqueCountsByType,
  };
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => run()));
  return results;
}

export async function hydrateDetails(rows = [], {
  concurrency = DEFAULT_DETAIL_CONCURRENCY,
  pageDelayMs = 200,
  fetchImpl = defaultFetch,
  onDetail = null,
} = {}) {
  const details = new Map();
  const failures = [];
  await mapPool(rows, concurrency, async (row) => {
    const jobId = cleanText(row.job_id);
    const url = cleanText(row.url);
    if (!jobId || !url) {
      failures.push({ job_id: jobId || 'unknown', error: 'missing job_id or url' });
      return;
    }
    try {
      const response = await fetchImpl(url);
      await sleep(pageDelayMs);
      if (!response.ok) {
        const error = response.error || `HTTP ${response.status}`;
        failures.push({ job_id: jobId, error });
        if (typeof onDetail === 'function') onDetail({ job_id: jobId, ok: false, error });
        return;
      }
      const html = await response.text();
      const detail = parseDetailPage(html, { url });
      details.set(jobId, detail);
      if (typeof onDetail === 'function') onDetail({ job_id: jobId, ok: true });
    } catch (err) {
      failures.push({ job_id: jobId, error: err.message });
      if (typeof onDetail === 'function') onDetail({ job_id: jobId, ok: false, error: err.message });
    }
  });
  return { details, failures };
}
