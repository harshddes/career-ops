/**
 * FindAPhD source adapter — Playwright listing scrape (Cloudflare-gated HTML).
 * Scope: keyword searches + first N engineering pages; fit keywords preferred.
 */
import { extractFindaphdExternalId } from './normalizer.mjs';

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_KEYWORDS = [
  'plasma',
  'fusion',
  'diagnostics',
  'instrumentation',
  'cryogenic',
  'detector',
];
const FIT_TITLE_RE = /\b(plasma|fusion|diagnostic|instrumentation|cryogen|detector|spectrometer|fpga|daq|tokamak|stellarator|vacuum|beamline|space\s+plasma|payload)\b/i;

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeEntities(value = '') {
  return String(value ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function stripTags(value = '') {
  return decodeEntities(String(value).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

export function buildFindaphdKeywordUrl(keyword = '', { page = 1 } = {}) {
  const q = encodeURIComponent(cleanText(keyword));
  const pg = page > 1 ? `&PG=${page}` : '';
  return `https://www.findaphd.com/phds/?Keywords=${q}${pg}`;
}

export function buildFindaphdEngineeringUrl({ page = 1, sort = 'A' } = {}) {
  const base = 'https://www.findaphd.com/phds/engineering/?10M7o0';
  const params = [];
  if (sort) params.push(`Sort=${encodeURIComponent(sort)}`);
  if (page > 1) params.push(`PG=${page}`);
  return params.length ? `${base}&${params.join('&')}` : base;
}

/**
 * Parse FindAPhD search-result HTML into posting stubs.
 */
export function parseFindaphdListingHtml(html = '', { provider = 'playwright_listing' } = {}) {
  const rows = [...String(html).matchAll(/<div[^>]+class="[^"]*resultsRow[^"]*phd-result[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+class="[^"]*resultsRow[^"]*phd-result|<\/div>\s*<nav|id="Pager"|$)/gi)];
  const fallbackBlocks = rows.length
    ? rows.map(match => match[0])
    : [...String(html).matchAll(/<div[^>]+class="[^"]*phd-result-row-standard[^"]*"[^>]*>[\s\S]*?(?=<div[^>]+class="[^"]*phd-result-row-standard|id="Pager"|$)/gi)].map(m => m[0]);

  const postings = [];
  const seen = new Set();
  for (const block of fallbackBlocks) {
    const hrefMatch = block.match(/href="(\/phds\/project\/[^"?]+\/?\?p\d+[^"]*)"/i)
      || block.match(/href="(https?:\/\/www\.findaphd\.com\/phds\/project\/[^"?]+\/?\?p\d+[^"]*)"/i);
    if (!hrefMatch) continue;
    const path = decodeEntities(hrefMatch[1]);
    const url = path.startsWith('http') ? path : `https://www.findaphd.com${path}`;
    const externalId = extractFindaphdExternalId(url);
    if (!externalId || seen.has(externalId)) continue;
    seen.add(externalId);

    const titleMatch = block.match(/phd-result__title[^>]*>[\s\S]*?<a[^>]*>\s*([\s\S]*?)\s*<\/a>/i)
      || block.match(/AI-based[\s\S]{0,200}/i)
      || block.match(/<h[23][^>]*>\s*([\s\S]*?)\s*<\/h[23]>/i);
    let title = cleanText(stripTags(
      block.match(/class="[^"]*phd-result__title[^"]*"[^>]*>([\s\S]*?)<\/(?:div|h\d|a)>/i)?.[1]
      || '',
    ));
    if (!title) {
      // Title often sits as plain text after "Last chance" badge inside the card link region.
      const text = cleanText(stripTags(block));
      const lines = text.split(/\s{2,}|\n/).map(cleanText).filter(Boolean);
      title = lines.find(line => line.length > 20 && !/more details|last chance|supervisor|competition funded|phd research/i.test(line)) || '';
    }
    if (!title) {
      title = cleanText(url.match(/\/phds\/project\/([^/?#]+)/i)?.[1] || '').replace(/-/g, ' ');
    }

    const university = cleanText(stripTags(
      block.match(/phd-result__dept-inst--inst[\s\S]*?phd-result__dept-inst--title[^>]*>([\s\S]*?)<\//i)?.[1]
      || block.match(/University of [^<\n]+/i)?.[0]
      || '',
    ));
    const department = cleanText(stripTags(
      block.match(/phd-result__dept-inst--dept[\s\S]*?>([\s\S]*?)<\//i)?.[1] || '',
    ));
    const supervisor = cleanText(
      stripTags(block).match(/Supervisor:\s*([^\n]+?)(?:\d{1,2}\s+[A-Za-z]+\s+\d{4}|PhD Research|$)/i)?.[1] || '',
    );
    const deadlineText = cleanText(
      stripTags(block).match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4}|Always taking applicants|Applications accepted all year round)/i)?.[1] || '',
    );
    const fundingLabel = cleanText(
      stripTags(block).match(/(Competition Funded PhD Project[^.\n]*|Funded PhD Project[^.\n]*|Self-Funded PhD Students? Only|Self[- ]?Funded PhD Project[^.\n]*)/i)?.[1] || '',
    );
    const summary = cleanText(stripTags(
      block.match(/phd-result__description[^>]*>([\s\S]*?)(?:Read more|<\/div>)/i)?.[1] || '',
    )).slice(0, 600);

    postings.push({
      id: externalId,
      external_id: externalId,
      url,
      title,
      university,
      institution: university,
      department,
      discipline: department,
      supervisor,
      deadline: deadlineText,
      deadline_text: deadlineText,
      funding_label: fundingLabel,
      summary,
      provider,
    });
  }
  return postings;
}

export function listingMatchesFitKeywords(posting = {}) {
  const hay = `${posting.title || ''} ${posting.summary || ''} ${posting.department || ''}`;
  return FIT_TITLE_RE.test(hay);
}

async function fetchHtmlWithPlaywright(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    // Cloudflare interstitial
    await page.waitForTimeout(2500);
    try {
      await page.waitForSelector('.phd-result-row-standard, .resultsRow, #SearchResults', { timeout: 20_000 });
    } catch {
      // Continue; parser may still find content after challenge.
    }
    const html = await page.content();
    const title = await page.title();
    if (/just a moment/i.test(title) && !/phd-result/i.test(html)) {
      return { ok: false, status: 403, body: html, reason: 'cloudflare_challenge' };
    }
    return { ok: true, status: 200, body: html };
  } finally {
    await browser.close();
  }
}

async function fetchListing(url, { usePlaywright = true } = {}) {
  if (usePlaywright) {
    try {
      return await fetchHtmlWithPlaywright(url);
    } catch (err) {
      return { ok: false, status: 0, body: '', reason: err.message };
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'career-ops-findaphd-tracker/1.0 (+local personal research tracker)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Discover FindAPhD postings for a registry source.
 */
export async function fetchFindaphdPostings(source = {}, {
  usePlaywright = true,
  htmlFixtures = null,
} = {}) {
  const maxItems = Number(source.max_items || 200);
  const maxDetails = Number(source.max_details || 80);
  const engineeringPages = Number(source.engineering_pages || 3);
  const keywords = Array.isArray(source.keywords) && source.keywords.length
    ? source.keywords
    : DEFAULT_KEYWORDS;
  const attempts = [];
  const byId = new Map();

  const ingestHtml = (html, provider, url) => {
    const parsed = parseFindaphdListingHtml(html, { provider });
    attempts.push({ provider, status: 'ok', url, count: parsed.length });
    for (const item of parsed) {
      if (!byId.has(item.external_id)) byId.set(item.external_id, item);
    }
    return parsed;
  };

  if (Array.isArray(htmlFixtures) && htmlFixtures.length) {
    for (const fixture of htmlFixtures) {
      ingestHtml(fixture.html || fixture, 'fixture', fixture.url || 'fixture');
    }
  } else {
    // Keyword searches (page 1 each)
    for (const keyword of keywords) {
      const url = buildFindaphdKeywordUrl(keyword, { page: 1 });
      const res = await fetchListing(url, { usePlaywright });
      if (!res.ok) {
        attempts.push({ provider: 'keyword_listing', status: 'error', url, reason: res.reason || `HTTP ${res.status}` });
        continue;
      }
      ingestHtml(res.body, 'keyword_listing', url);
      if (byId.size >= maxItems) break;
    }

    // Engineering board: first N pages; keep fit titles + all from page 1
    for (let page = 1; page <= engineeringPages && byId.size < maxItems; page += 1) {
      const url = source.careers_url && page === 1 && /engineering/i.test(source.careers_url)
        ? source.careers_url
        : buildFindaphdEngineeringUrl({ page, sort: 'A' });
      const res = await fetchListing(url, { usePlaywright });
      if (!res.ok) {
        attempts.push({ provider: 'engineering_listing', status: 'error', url, reason: res.reason || `HTTP ${res.status}` });
        continue;
      }
      const parsed = parseFindaphdListingHtml(res.body, { provider: 'engineering_listing' });
      attempts.push({ provider: 'engineering_listing', status: 'ok', url, count: parsed.length });
      for (const item of parsed) {
        if (page > 1 && !listingMatchesFitKeywords(item)) continue;
        if (!byId.has(item.external_id)) byId.set(item.external_id, item);
        if (byId.size >= maxItems) break;
      }
    }
  }

  let postings = [...byId.values()];
  // Prefer fit matches when over cap
  if (postings.length > maxDetails) {
    const fit = postings.filter(listingMatchesFitKeywords);
    const rest = postings.filter(item => !listingMatchesFitKeywords(item));
    postings = [...fit, ...rest].slice(0, maxDetails);
  }

  const ok = postings.length > 0 || attempts.some(item => item.status === 'ok');
  return {
    status: ok ? 'ok' : 'blocked',
    provider: 'playwright_listing',
    postings,
    scanned_count: postings.length,
    detail_fetches: 0,
    attempts,
    reason: ok ? '' : (attempts.find(item => item.reason)?.reason || 'no_postings'),
    access: { allowed: true, reason: 'playwright_browser' },
  };
}
