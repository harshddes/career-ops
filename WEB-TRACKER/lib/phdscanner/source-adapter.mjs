import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { extractPhdscannerExternalId, parsePhdscannerFunding } from './normalizer.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const TRACKER_DIR = join(LIB_DIR, '..', '..');
const DATA_DIR = join(TRACKER_DIR, 'data');
const CAREER_DATA_DIR = join(TRACKER_DIR, '..', 'data');
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_SITEMAP = 'https://www.phdscanner.com/sitemap-phdpositions-details-new.xml';
const DEFAULT_FUNDED_LISTING = 'https://www.phdscanner.com/phd-vacancies/standard?funded=true';

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanArray(value = []) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))];
}

function sha256(value = '') {
  return createHash('sha256').update(String(value)).digest('hex');
}

async function fetchText(url, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'career-ops-phdscanner-tracker/1.0 (+local personal research tracker)',
        Accept: 'application/xml,text/xml,application/json;q=0.9,text/html;q=0.8,*/*;q=0.7',
        ...headers,
      },
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body, headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

function robotsRuleToRegex(rule = '') {
  const raw = String(rule || '');
  const anchored = raw.endsWith('$');
  const body = anchored ? raw.slice(0, -1) : raw;
  const escaped = body
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`);
}

function parseRobotsForAllAgents(text = '') {
  const lines = String(text).split(/\r?\n/);
  const groups = [];
  let current = null;
  for (const line of lines) {
    const clean = line.replace(/#.*/, '').trim();
    if (!clean) continue;
    const match = clean.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === 'user-agent') {
      current = { agents: [value.toLowerCase()], rules: [] };
      groups.push(current);
    } else if (current && ['allow', 'disallow'].includes(key)) {
      current.rules.push({ type: key, value });
    }
  }
  return groups.filter(group => group.agents.includes('*')).flatMap(group => group.rules);
}

export function assessRobotsTextForUrl(robotsText, targetUrl) {
  const url = new URL(targetUrl);
  const pathWithSearch = `${url.pathname}${url.search}`;
  const matches = parseRobotsForAllAgents(robotsText)
    .filter(rule => rule.value && robotsRuleToRegex(rule.value).test(pathWithSearch))
    .sort((a, b) => b.value.length - a.value.length);
  const winner = matches[0] || null;
  const allowed = !winner || winner.type === 'allow';
  return {
    allowed,
    matched_rule: winner ? `${winner.type}: ${winner.value}` : '',
    reason: allowed ? 'allowed_by_robots' : `blocked_by_robots: ${winner.type}: ${winner.value}`,
  };
}

export async function assessDirectAccess(targetUrl) {
  const url = new URL(targetUrl);
  const robotsUrl = `${url.origin}/robots.txt`;
  const robots = await fetchText(robotsUrl, { timeoutMs: 12_000 });
  if (!robots.ok) {
    return {
      allowed: false,
      status: robots.status,
      robots_url: robotsUrl,
      reason: `robots.txt unavailable: HTTP ${robots.status}`,
    };
  }
  return {
    ...assessRobotsTextForUrl(robots.body, targetUrl),
    status: robots.status,
    robots_url: robotsUrl,
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function decodeXmlEntities(value = '') {
  return String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
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
  return decodeXmlEntities(String(value).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

export function parsePhdscannerSitemap(xml = '') {
  const locs = [...String(xml).matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map(match => cleanText(decodeXmlEntities(match[1])));
  return locs
    .filter(url => /\/opportunities\/phd-vacancies-/i.test(url))
    .map(url => {
      const fromSlug = parsePhdscannerUrlSlug(url);
      return {
        id: extractPhdscannerExternalId(url),
        external_id: extractPhdscannerExternalId(url),
        url,
        title: fromSlug.title || '',
        university: fromSlug.university || '',
        institution: fromSlug.university || '',
        country: fromSlug.country || '',
        summary: fromSlug.title || '',
        provider: 'sitemap_details',
      };
    })
    .filter(item => item.id && item.url);
}

function extractMeta(html = '', property = '') {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return cleanText(decodeXmlEntities(match[1]));
  }
  return '';
}

function extractLabeledField(text = '', label = '') {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`${escaped}\\s*[:\\n]\\s*([^\\n]{2,120})`, 'i'));
  return cleanText(match?.[1] || '');
}

export function parsePhdscannerUrlSlug(url = '') {
  const slug = cleanText(url).match(/\/opportunities\/phd-vacancies-([^/?#]+)/i)?.[1] || '';
  if (!slug) return {};
  const uuid = slug.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1] || '';
  const body = uuid ? slug.slice(0, -(uuid.length + 1)) : slug;
  const countries = [
    'united-kingdom', 'czech-republic', 'new-zealand', 'south-korea', 'switzerland',
    'netherlands', 'luxembourg', 'australia', 'germany', 'belgium', 'sweden', 'france',
    'denmark', 'finland', 'norway', 'austria', 'ireland', 'italy', 'spain', 'portugal',
    'poland', 'canada', 'japan', 'china', 'india', 'brazil',
  ];
  // Prefer longest country match as a whole hyphen-delimited segment.
  let best = null;
  for (const country of countries) {
    const token = `-${country}-`;
    const idx = body.indexOf(token);
    if (idx < 0) continue;
    if (!best || country.length > best.country.length) {
      best = {
        country,
        universitySlug: body.slice(0, idx),
        titleSlug: body.slice(idx + token.length),
      };
    }
  }
  if (best) {
    return {
      university: best.universitySlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      country: best.country.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      title: best.titleSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    };
  }
  return {
    title: body.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  };
}

export function parsePhdscannerDetailHtml(html = '', url = '') {
  const fromSlug = parsePhdscannerUrlSlug(url);
  const text = stripTags(html);
  const rawTitle = extractMeta(html, 'og:title')
    || cleanText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, ' ') || '')
    || cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\|.*$/, '') || '');
  const brandingTitle = /phdscanner|find your ideal phd|doctoral programs & research/i.test(rawTitle);
  const title = (!brandingTitle && rawTitle) ? rawTitle : (fromSlug.title || rawTitle || '');

  const rawDescription = extractMeta(html, 'og:description')
    || extractMeta(html, 'description')
    || cleanText(text.match(/Position Description([\s\S]{40,1200}?)(?:We offer|Requirements|Apply for this Position|Featured PhD)/i)?.[1] || '');
  const brandingDesc = /discover thousands of phd|find your ideal phd|empowering researchers/i.test(rawDescription);
  const description = (!brandingDesc && rawDescription) ? rawDescription : (fromSlug.title || rawDescription || title);

  let university = extractLabeledField(text, 'University')
    || cleanText(text.match(/\n([A-Z][^\n]{2,80})\s*[•·]\s*[^\n]+,\s*[A-Z][^\n]{2,40}/)?.[1] || '')
    || fromSlug.university
    || 'PhDScanner';
  if (/phdscanner/i.test(university)) university = fromSlug.university || university;

  const locationMatch = text.match(/([A-Za-z .'-]+),\s*([A-Za-z ]{2,40})\s*(?:Department|Supervisor|Deadline)/i);
  let country = extractLabeledField(text, 'Country')
    || cleanText(locationMatch?.[2] || '')
    || fromSlug.country
    || '';
  if (!country || /phdscanner/i.test(country)) country = fromSlug.country || country;

  const discipline = extractLabeledField(text, 'Department')
    || extractLabeledField(text, 'Discipline')
    || cleanText(text.match(/Deadline[\s\S]{0,40}?([A-Za-z][^\n]{2,80})\s*(?:Login|views)/i)?.[1] || '');
  const supervisor = extractLabeledField(text, 'Supervisor')
    || cleanText(text.match(/Supervisor\s+(Prof\.?\s+[^\n]{3,80}|Dr\.?\s+[^\n]{3,80}|[A-Z][^\n]{3,80})/i)?.[1] || '');
  const deadline = extractLabeledField(text, 'Application deadline')
    || extractLabeledField(text, 'Deadline')
    || cleanText(text.match(/Application deadline\s+([A-Za-z0-9 ,./-]{4,40}|Deadline passed)/i)?.[1] || '')
    || cleanText(text.match(/Deadline\s+(Deadline passed|[A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})/i)?.[1] || '')
    || cleanText(text.match(/Apply by\s+([A-Za-z0-9 ,./-]{4,40}|Open Deadline)/i)?.[1] || '');
  const funding = parsePhdscannerFunding({
    summary: description,
    title,
    funding_label: /\bfully funded\b/i.test(text) ? 'Fully funded' : (/\bself[- ]?funded\b/i.test(text) ? 'Self-funded' : ''),
    fully_funded: /\bfully funded\b/i.test(text),
  });

  return {
    id: extractPhdscannerExternalId(url),
    external_id: extractPhdscannerExternalId(url),
    url,
    title,
    university,
    institution: university,
    country: country.replace(/\b\w/g, c => c.toUpperCase()),
    discipline,
    department: discipline,
    supervisor,
    deadline,
    summary: description || title,
    ...funding,
    provider: 'detail_html',
  };
}

export function parsePhdscannerListingCards(html = {}, { fundedHint = false } = {}) {
  const body = typeof html === 'string' ? html : '';
  const cards = [];
  const linkMatches = [...body.matchAll(/href=["']([^"']*\/opportunities\/phd-vacancies-[^"']+)["']/gi)];
  const seen = new Set();
  for (const match of linkMatches) {
    const href = match[1].startsWith('http') ? match[1] : `https://www.phdscanner.com${match[1]}`;
    const id = extractPhdscannerExternalId(href);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const window = body.slice(Math.max(0, match.index - 200), Math.min(body.length, match.index + 900));
    const title = cleanText(stripTags(window.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i)?.[1] || window.match(/###?\s+([^\n<]+)/)?.[1] || ''));
    const summary = cleanText(stripTags(window.match(/Summary([\s\S]*?)(?:More Details|<\/)/i)?.[1] || ''));
    const uni = cleanText(stripTags(window.match(/([A-Z][^<\n]{2,80})\s*(?:\n|<).*?(?:Ghent|Leuven|Delft|EPFL|University)/i)?.[1] || ''));
    cards.push({
      id,
      external_id: id,
      url: href,
      title: title || `PhD opportunity ${id.slice(0, 8)}`,
      university: uni,
      institution: uni,
      summary,
      fully_funded: fundedHint || /\bfully funded\b/i.test(window),
      funding_label: fundedHint || /\bfully funded\b/i.test(window) ? 'Fully funded' : '',
      provider: 'listing_html',
    });
  }
  return cards;
}

function jsonFromMaybeText(text = '') {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.jobs)) return parsed.jobs;
  if (Array.isArray(parsed.items)) return parsed.items;
  if (Array.isArray(parsed.postings)) return parsed.postings;
  if (Array.isArray(parsed.opportunities)) return parsed.opportunities;
  return [];
}

async function fetchSitemapDetails(source, env) {
  const sitemapUrl = cleanText(source.sitemap_url || env.PHDSCANNER_SITEMAP_URL || DEFAULT_SITEMAP);
  const access = await assessDirectAccess(sitemapUrl);
  if (!access.allowed) return { provider: 'sitemap_details', status: 'blocked', access, postings: [] };
  const result = await fetchText(sitemapUrl, { timeoutMs: 45_000 });
  if (!result.ok) return { provider: 'sitemap_details', status: 'failed', http_status: result.status, access, postings: [] };
  const postings = parsePhdscannerSitemap(result.body);
  return {
    provider: 'sitemap_details',
    status: postings.length ? 'ok' : 'empty',
    http_status: result.status,
    access,
    postings,
    scanned_count: postings.length,
    full_snapshot: true,
  };
}

async function fetchFundedListing(source, env) {
  const listingUrl = cleanText(source.careers_url || env.PHDSCANNER_LISTING_URL || DEFAULT_FUNDED_LISTING);
  // robots disallows ?page= — funded=true alone is allowed
  if (/[?&]page=/i.test(listingUrl)) {
    return {
      provider: 'funded_listing',
      status: 'blocked',
      access: { allowed: false, reason: 'blocked_by_robots: disallow: /*?page=*' },
      postings: [],
    };
  }
  const access = await assessDirectAccess(listingUrl);
  if (!access.allowed) return { provider: 'funded_listing', status: 'blocked', access, postings: [] };
  const result = await fetchText(listingUrl);
  if (!result.ok) return { provider: 'funded_listing', status: 'failed', http_status: result.status, access, postings: [] };
  const postings = parsePhdscannerListingCards(result.body, { fundedHint: /funded=true/i.test(listingUrl) });
  return {
    provider: 'funded_listing',
    status: postings.length ? 'ok' : 'empty',
    http_status: result.status,
    access,
    postings,
    scanned_count: postings.length,
    full_snapshot: false,
  };
}

async function fetchDetailHtmlWithPlaywright(url, { timeoutMs = 45_000 } = {}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(2000);
    try {
      await page.waitForFunction(() => {
        const text = document.body?.innerText || '';
        return /Application deadline|Deadline|Supervisor|Start date/i.test(text)
          && !/Discover thousands of PhD/i.test(text.slice(0, 400));
      }, { timeout: 20_000 });
    } catch {
      // Parser may still recover partial fields.
    }
    const html = await page.content();
    return { ok: true, status: 200, body: html, provider: 'playwright_detail' };
  } finally {
    await browser.close();
  }
}

function isPhdscannerShellHtml(html = '', detail = {}) {
  const text = stripTags(html);
  const brandingHeavy = /discover thousands of phd|find your ideal phd|empowering researchers/i.test(text.slice(0, 800));
  const missingDeadline = !cleanText(detail.deadline);
  const tiny = String(html || '').length < 12_000;
  return missingDeadline && (brandingHeavy || tiny);
}

async function enrichDetails(postings = [], { maxDetails = 80, delayMs = 250, env = process.env } = {}) {
  const limit = Math.max(0, Number(env.PHDSCANNER_MAX_DETAILS || maxDetails) || 80);
  const usePlaywright = String(env.PHDSCANNER_PLAYWRIGHT_DETAILS || '1') !== '0';
  const enriched = [];
  let detailFetches = 0;
  for (const posting of postings) {
    if (detailFetches >= limit) {
      enriched.push(posting);
      continue;
    }
    if (!posting.url || posting.provider === 'manual_seed') {
      enriched.push(posting);
      continue;
    }
    // Skip detail fetch when listing already has rich fields
    if (posting.summary && posting.title && posting.university && posting.deadline) {
      enriched.push(posting);
      continue;
    }
    const access = await assessDirectAccess(posting.url);
    if (!access.allowed) {
      enriched.push({ ...posting, access_reason: access.reason });
      continue;
    }
    let result = await fetchText(posting.url);
    detailFetches += 1;
    if (!result.ok) {
      enriched.push(posting);
      continue;
    }
    let detail = parsePhdscannerDetailHtml(result.body, posting.url);
    if (usePlaywright && isPhdscannerShellHtml(result.body, detail)) {
      try {
        const rendered = await fetchDetailHtmlWithPlaywright(posting.url);
        if (rendered.ok) {
          result = rendered;
          detail = parsePhdscannerDetailHtml(rendered.body, posting.url);
          detail.provider = 'playwright_detail';
        }
      } catch (err) {
        detail.access_reason = `playwright_detail_failed: ${err.message}`;
      }
    }
    const brandingTitle = /phdscanner|find your ideal phd/i.test(detail.title || '');
    const brandingSummary = /discover thousands of phd|find your ideal phd/i.test(detail.summary || '');
    enriched.push({
      ...posting,
      ...detail,
      title: brandingTitle ? (posting.title || detail.title) : (detail.title || posting.title),
      summary: brandingSummary ? (posting.summary || posting.title || detail.summary) : (detail.summary || posting.summary),
      university: /phdscanner/i.test(detail.university || '') ? (posting.university || detail.university) : (detail.university || posting.university),
      country: detail.country || posting.country,
      deadline: detail.deadline || posting.deadline,
      fully_funded: posting.fully_funded || detail.fully_funded,
      minimal_financial_barriers: posting.minimal_financial_barriers || detail.minimal_financial_barriers,
      funding_label: detail.funding_label || posting.funding_label,
      provider: detail.provider || posting.provider || 'detail_html',
    });
    if (delayMs > 0) await sleep(delayMs);
  }
  return { postings: enriched, detail_fetches: detailFetches };
}

function readManualSeed(source) {
  const fileName = cleanText(source.manual_seed_file || 'phdscanner-seed-postings.json');
  const candidates = [
    join(DATA_DIR, fileName),
    join(CAREER_DATA_DIR, fileName),
  ];
  const file = candidates.find(path => existsSync(path));
  if (!file) return { provider: 'manual_seed', status: 'not_configured', postings: [] };
  const parsed = JSON.parse(readFileSync(file, 'utf-8'));
  return {
    provider: 'manual_seed',
    status: 'ok',
    postings: jsonFromMaybeText(JSON.stringify(parsed)).map(item => ({ ...item, provider: 'manual_seed' })),
    full_snapshot: false,
  };
}

function mergePostingMaps(...lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const item of list || []) {
      const id = extractPhdscannerExternalId(item.url || '', item.id || item.external_id);
      if (!id) continue;
      const previous = byId.get(id) || {};
      byId.set(id, {
        ...previous,
        ...item,
        id,
        external_id: id,
        fully_funded: Boolean(previous.fully_funded || item.fully_funded),
        minimal_financial_barriers: Boolean(previous.minimal_financial_barriers || item.minimal_financial_barriers),
        funding_label: cleanText(item.funding_label || previous.funding_label),
      });
    }
  }
  return [...byId.values()];
}

/**
 * Provider waterfall:
 * 1) sitemap detail URLs
 * 2) funded listing cards (no ?page=)
 * 3) detail enrich (capped)
 * 4) manual seed
 */
export async function fetchPhdscannerPostings(source = {}, { env = process.env } = {}) {
  const providers = cleanArray(
    cleanText(env.PHDSCANNER_PROVIDERS).split(',').filter(Boolean).length
      ? cleanText(env.PHDSCANNER_PROVIDERS).split(',')
      : (source.providers || 'sitemap_details,funded_listing,manual_seed'.split(',')),
  );
  const attempts = [];
  let sitemapPostings = [];
  let listingPostings = [];

  for (const provider of providers) {
    let result;
    if (provider === 'sitemap_details') {
      result = await fetchSitemapDetails(source, env);
      if (result.status === 'ok') sitemapPostings = result.postings;
    } else if (provider === 'funded_listing') {
      result = await fetchFundedListing(source, env);
      if (result.status === 'ok') listingPostings = result.postings;
    } else if (provider === 'manual_seed') {
      result = readManualSeed(source);
    } else {
      result = { provider, status: 'unknown_provider', postings: [] };
    }
    attempts.push(result);
  }

  let merged = mergePostingMaps(listingPostings, sitemapPostings);
  const fundedIntent = /funded=true/i.test(cleanText(source.careers_url || env.PHDSCANNER_LISTING_URL || ''));
  // Prefer funded listing intersection when available
  if (listingPostings.length && sitemapPostings.length) {
    const fundedIds = new Set(listingPostings.map(item => extractPhdscannerExternalId(item.url || '', item.id)));
    const fundedOnly = merged.filter(item => fundedIds.has(item.id) || item.fully_funded);
    if (fundedOnly.length) {
      merged = fundedOnly.map(item => ({ ...item, fully_funded: true, funding_label: item.funding_label || 'Fully funded' }));
    }
  } else if (listingPostings.length && !sitemapPostings.length) {
    merged = listingPostings.map(item => ({ ...item, fully_funded: true, funding_label: item.funding_label || 'Fully funded' }));
  } else if (fundedIntent && merged.length) {
    // Sitemap-only path while scanning the funded careers_url — keep funded default until detail says otherwise.
    merged = merged.map(item => (
      item.fully_funded === false
        ? item
        : { ...item, fully_funded: true, minimal_financial_barriers: true, funding_label: item.funding_label || 'Fully funded' }
    ));
  }

  const maxItems = Math.max(1, Number(env.PHDSCANNER_MAX_ITEMS || source.max_items || 200) || 200);
  merged = merged.slice(0, maxItems);

  if (!merged.length) {
    const seed = attempts.find(item => item.provider === 'manual_seed' && item.status === 'ok' && item.postings?.length);
    if (seed) {
      return {
        ...seed,
        attempts,
        content_fingerprint: sha256(JSON.stringify(seed.postings)),
      };
    }
    const last = attempts.find(item => item.status === 'blocked') || attempts.at(-1) || { provider: 'none', status: 'failed', postings: [] };
    return {
      ...last,
      attempts,
      postings: [],
      content_fingerprint: sha256(JSON.stringify(attempts)),
    };
  }

  const enrich = await enrichDetails(merged, {
    maxDetails: Number(env.PHDSCANNER_MAX_DETAILS || source.max_details || 80) || 80,
    delayMs: Number(env.PHDSCANNER_DETAIL_DELAY_MS || 200) || 200,
    env,
  });

  return {
    provider: listingPostings.length && sitemapPostings.length
      ? 'sitemap_details+funded_listing'
      : listingPostings.length
        ? 'funded_listing'
        : 'sitemap_details',
    status: 'ok',
    http_status: 200,
    postings: enrich.postings,
    scanned_count: enrich.postings.length,
    detail_fetches: enrich.detail_fetches,
    attempts,
    content_fingerprint: sha256(JSON.stringify(enrich.postings.map(item => item.id).sort())),
    full_snapshot: Boolean(sitemapPostings.length),
  };
}
