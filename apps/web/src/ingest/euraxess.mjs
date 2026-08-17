import { projectEuraxessItem } from './project.mjs';

const FEED_URL = process.env.EURAXESS_FEED_URL || 'https://euraxess.ec.europa.eu/job-feed';

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
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

function firstXmlTag(item = '', tag = '') {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = item.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return cleanText(decodeXmlEntities(match?.[1] || ''));
}

function stripTags(value = '') {
  return decodeXmlEntities(value.replace(/<[^>]+>/g, ' '));
}

export function parseEuraxessRss(xml = '') {
  const items = [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
  return items.map(item => {
    const url = firstXmlTag(item, 'link');
    return {
      id: firstXmlTag(item, 'guid') || url.match(/\/jobs\/(\d+)/)?.[1] || url,
      title: firstXmlTag(item, 'title'),
      url,
      summary: stripTags(firstXmlTag(item, 'description')),
      institution: firstXmlTag(item, 'dc:creator') || firstXmlTag(item, 'creator') || 'EURAXESS',
      posted_at: firstXmlTag(item, 'pubDate'),
    };
  }).filter(item => item.title && item.url);
}

export async function fetchEuraxessCompact({ fetchImpl = fetch, feedUrl = FEED_URL } = {}) {
  const response = await fetchImpl(feedUrl, {
    headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
  });
  if (!response.ok) {
    throw new Error(`EURAXESS RSS HTTP ${response.status}`);
  }
  const xml = await response.text();
  return parseEuraxessRss(xml).map(projectEuraxessItem);
}
