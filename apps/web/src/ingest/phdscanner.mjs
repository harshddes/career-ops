import { projectPhdscannerItem } from './project.mjs';

const SITEMAP_URL = process.env.PHDSCANNER_SITEMAP_URL
  || 'https://www.phdscanner.com/sitemap-phdpositions-details-new.xml';
const LISTING_URL = process.env.PHDSCANNER_LISTING_URL
  || 'https://www.phdscanner.com/phd-vacancies/standard?funded=true';

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeXmlEntities(value = '') {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

export function parsePhdscannerSitemap(xml = '') {
  const locs = [...String(xml).matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
    .map(match => cleanText(decodeXmlEntities(match[1])));
  return locs
    .filter(url => /\/opportunities\/phd-vacancies-/i.test(url))
    .map(url => {
      const slug = url.match(/\/opportunities\/phd-vacancies-([^/?#]+)/i)?.[1] || '';
      const uuid = slug.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1] || slug;
      return {
        id: uuid,
        url,
        title: slug.replace(/-/g, ' '),
      };
    });
}

export function parsePhdscannerListingCards(html = '') {
  const cards = [];
  const matches = [...String(html).matchAll(/href=["']([^"']*\/opportunities\/phd-vacancies-[^"']+)["']/gi)];
  const seen = new Set();
  for (const match of matches) {
    const href = match[1].startsWith('http') ? match[1] : `https://www.phdscanner.com${match[1]}`;
    const id = href.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1] || href;
    if (seen.has(id)) continue;
    seen.add(id);
    const window = html.slice(Math.max(0, match.index - 200), Math.min(html.length, match.index + 900));
    const title = cleanText((window.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i)?.[1] || '').replace(/<[^>]+>/g, ''));
    cards.push({
      id,
      url: href,
      title: title || `PhD opportunity ${String(id).slice(0, 8)}`,
      summary: '',
    });
  }
  return cards;
}

export async function fetchPhdscannerCompact({
  fetchImpl = fetch,
  maxItems = 200,
} = {}) {
  const jobs = [];
  try {
    const listing = await fetchImpl(LISTING_URL, { headers: { Accept: 'text/html' } });
    if (listing.ok) {
      jobs.push(...parsePhdscannerListingCards(await listing.text()).map(projectPhdscannerItem));
    }
  } catch {
    // Listing is optional; sitemap still yields compact URL/title rows.
  }
  if (jobs.length >= maxItems) return jobs.slice(0, maxItems);
  const sitemap = await fetchImpl(SITEMAP_URL, { headers: { Accept: 'application/xml, text/xml' } });
  if (!sitemap.ok) return jobs.slice(0, maxItems);
  const fromSitemap = parsePhdscannerSitemap(await sitemap.text()).map(projectPhdscannerItem);
  const seen = new Set(jobs.map(job => job.id));
  for (const job of fromSitemap) {
    if (seen.has(job.id)) continue;
    seen.add(job.id);
    jobs.push(job);
    if (jobs.length >= maxItems) break;
  }
  return jobs;
}
