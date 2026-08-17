import { projectUmichRow } from './project.mjs';

const CATALOG_URLS = {
  F: 'https://careers.umich.edu/browse-jobs/positions/F',
  P: 'https://careers.umich.edu/browse-jobs/positions/P',
};

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function decode(value = '') {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

export function parseUmichListingHtml(html = '', { employmentType = 'F' } = {}) {
  const rows = [];
  const trs = String(html).match(/<tr[\s\S]*?<\/tr>/gi) || [];
  for (const row of trs) {
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => match[1]);
    if (cells.length < 5) continue;
    const href = cells[1].match(/href=["']([^"']+)["']/i)?.[1] || '';
    const abs = href.startsWith('http') ? href : `https://careers.umich.edu${href}`;
    const jobId = cleanText(decode(cells[2].replace(/<[^>]+>/g, ''))) || abs.match(/\/job_detail\/(\d+)/)?.[1];
    const title = cleanText(decode((cells[1].match(/<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1] || cells[1]).replace(/<[^>]+>/g, '')));
    if (!jobId || !title) continue;
    rows.push({
      job_id: jobId,
      title,
      url: abs,
      date_posted: cleanText(decode(cells[0].replace(/<[^>]+>/g, ''))),
      department: cleanText(decode(cells[3].replace(/<[^>]+>/g, ''))),
      work_location: cleanText(decode(cells[4].replace(/<[^>]+>/g, ''))),
      catalog_type: employmentType,
    });
  }
  return rows;
}

export async function fetchUmichCompact({
  fetchImpl = fetch,
  maxPages = 2,
} = {}) {
  const jobs = [];
  for (const [type, url] of Object.entries(CATALOG_URLS)) {
    let next = url;
    for (let page = 0; page < maxPages && next; page += 1) {
      const response = await fetchImpl(next, { headers: { Accept: 'text/html' } });
      if (!response.ok) break;
      const html = await response.text();
      jobs.push(...parseUmichListingHtml(html, { employmentType: type }).map(projectUmichRow));
      const nextHref = html.match(/href=["']([^"']+)["'][^>]*>\s*Next/i)?.[1]
        || html.match(/rel=["']next["'][^>]*href=["']([^"']+)["']/i)?.[1]
        || '';
      next = nextHref
        ? (nextHref.startsWith('http') ? nextHref : `https://careers.umich.edu${nextHref}`)
        : '';
      if (next.includes('/search/')) break;
    }
  }
  const seen = new Set();
  return jobs.filter(job => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}
