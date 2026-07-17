import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const TRACKER_DIR = join(LIB_DIR, '..', '..');
const DATA_DIR = join(TRACKER_DIR, 'data');
const DEFAULT_TIMEOUT_MS = 20_000;

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
        'User-Agent': 'career-ops-euraxess-tracker/1.0 (+local personal research tracker)',
        Accept: 'application/rss+xml,application/xml,text/xml,application/json;q=0.9,text/html;q=0.8,*/*;q=0.7',
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

function jsonFromMaybeText(text = '') {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.jobs)) return parsed.jobs;
  if (Array.isArray(parsed.items)) return parsed.items;
  if (Array.isArray(parsed.postings)) return parsed.postings;
  if (Array.isArray(parsed.prospects)) return parsed.prospects;
  return [];
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
  return decodeXmlEntities(value.replace(/<[^>]+>/g, ' '));
}

function firstXmlTag(item = '', tag = '') {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = item.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return cleanText(decodeXmlEntities(match?.[1] || ''));
}

export function parseEuraxessRss(xml = '') {
  const items = [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
  return items.map(item => {
    const url = firstXmlTag(item, 'link');
    const guid = firstXmlTag(item, 'guid') || url.match(/\/jobs\/(\d+)/)?.[1] || sha256(url).slice(0, 12);
    return {
      id: guid,
      external_id: guid,
      title: firstXmlTag(item, 'title'),
      url,
      link: url,
      summary: stripTags(firstXmlTag(item, 'description')),
      description: stripTags(firstXmlTag(item, 'description')),
      institution: firstXmlTag(item, 'dc:creator') || firstXmlTag(item, 'creator') || 'EURAXESS',
      posted_at: firstXmlTag(item, 'pubDate'),
      provider: 'official_rss_feed',
    };
  }).filter(item => item.id && item.url && item.title);
}

function postingsFromFeedBody(body = '', contentType = '') {
  if (/xml|rss/i.test(contentType) || /^\s*<\?xml|^\s*<rss/i.test(body)) {
    return parseEuraxessRss(body);
  }
  return jsonFromMaybeText(body);
}

async function fetchPermittedFeed(source, env) {
  const feedUrl = cleanText(source.permitted_feed_url || env.EURAXESS_FEED_URL || 'https://euraxess.ec.europa.eu/job-feed');
  if (!feedUrl) return { provider: 'official_or_permitted_feed', status: 'not_configured', postings: [] };
  const access = await assessDirectAccess(feedUrl);
  if (!access.allowed) return { provider: 'official_or_permitted_feed', status: 'blocked', access, postings: [] };
  const result = await fetchText(feedUrl);
  if (!result.ok) return { provider: 'official_or_permitted_feed', status: 'failed', http_status: result.status, postings: [] };
  const postings = postingsFromFeedBody(result.body, result.headers.get('content-type') || '');
  return {
    provider: 'official_or_permitted_feed',
    status: 'ok',
    http_status: result.status,
    access,
    postings: postings.map(item => ({ ...item, provider: item.provider || 'official_or_permitted_feed' })),
    scanned_count: postings.length,
    full_snapshot: false,
  };
}

async function fetchApifyProvider(source, env) {
  const token = cleanText(env.APIFY_TOKEN || env.EURAXESS_APIFY_TOKEN);
  const actor = cleanText(env.EURAXESS_APIFY_ACTOR || source.apify_actor || 'nomad-jobs/euraxess-scraper');
  if (!token) return { provider: 'third_party_provider', status: 'not_configured', postings: [] };

  const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actor).replace('%2F', '~')}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const payload = JSON.stringify({
    startUrls: [{ url: source.careers_url || 'https://euraxess.ec.europa.eu/jobs' }],
    maxItems: Number(env.EURAXESS_MAX_ITEMS || source.max_items || 50),
  });
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  });
  const body = await res.text();
  if (!res.ok) {
    return { provider: 'third_party_provider', status: 'failed', http_status: res.status, postings: [] };
  }
  return {
    provider: 'third_party_provider',
    status: 'ok',
    http_status: res.status,
    postings: jsonFromMaybeText(body).map(item => ({ ...item, provider: 'third_party_provider' })),
    full_snapshot: true,
  };
}

function extractListingCards(html = '') {
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']*\/jobs\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  return links.map(match => {
    const href = match[1].startsWith('http') ? match[1] : `https://euraxess.ec.europa.eu${match[1]}`;
    const title = cleanText(match[2].replace(/<[^>]+>/g, ' '));
    return { id: href.match(/\/jobs\/(\d+)/)?.[1] || sha256(href).slice(0, 12), url: href, title, provider: 'direct_html_conservative' };
  }).filter(item => item.url && item.title);
}

async function fetchDirectHtml(source) {
  const url = cleanText(source.careers_url || 'https://euraxess.ec.europa.eu/jobs');
  const access = await assessDirectAccess(url);
  if (!access.allowed) return { provider: 'direct_html_conservative', status: 'blocked', access, postings: [] };
  const result = await fetchText(url);
  if (!result.ok) return { provider: 'direct_html_conservative', status: 'failed', http_status: result.status, access, postings: [] };
  return {
    provider: 'direct_html_conservative',
    status: 'ok',
    http_status: result.status,
    access,
    postings: extractListingCards(result.body),
    full_snapshot: false,
  };
}

function readManualSeed(source) {
  const file = join(DATA_DIR, cleanText(source.manual_seed_file || 'euraxess-seed-postings.json'));
  if (!existsSync(file)) return { provider: 'manual_seed', status: 'not_configured', postings: [] };
  const parsed = JSON.parse(readFileSync(file, 'utf-8'));
  return {
    provider: 'manual_seed',
    status: 'ok',
    postings: jsonFromMaybeText(JSON.stringify(parsed)).map(item => ({ ...item, provider: 'manual_seed' })),
    full_snapshot: false,
  };
}

export async function fetchEuraxessPostings(source = {}, { env = process.env } = {}) {
  const providers = cleanArray(source.providers || cleanText(env.EURAXESS_PROVIDERS || 'official_or_permitted_feed,third_party_provider,direct_html_conservative,manual_seed').split(','));
  const attempts = [];
  for (const provider of providers) {
    const result = provider === 'official_or_permitted_feed'
      ? await fetchPermittedFeed(source, env)
      : provider === 'third_party_provider'
        ? await fetchApifyProvider(source, env)
        : provider === 'direct_html_conservative'
          ? await fetchDirectHtml(source)
          : provider === 'manual_seed'
            ? readManualSeed(source)
            : { provider, status: 'unknown_provider', postings: [] };
    attempts.push(result);
    if (result.status === 'ok' && result.postings.length) {
      return {
        ...result,
        attempts,
        content_fingerprint: sha256(JSON.stringify(result.postings)),
      };
    }
  }
  const last = attempts.find(item => item.status === 'blocked') || attempts.at(-1) || { provider: 'none', status: 'failed', postings: [] };
  return {
    ...last,
    attempts,
    postings: [],
    content_fingerprint: sha256(JSON.stringify(attempts)),
  };
}
