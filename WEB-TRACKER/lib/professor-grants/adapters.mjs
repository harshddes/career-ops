import * as cheerio from 'cheerio';
import { grantDatesFromPeriod, normalizeActiveGrants } from './schema.mjs';
import { buildGrantResearchPlan } from './router.mjs';

function cleanText(value = '') {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function usDate(value = '') {
  const match = cleanText(value).match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  return match ? `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : cleanText(value);
}

export function parseSnsfGrantHtml(html = '', prospect = {}, checkedAt = new Date().toISOString()) {
  const raw = String(html || '');
  const grants = [];
  const $ = cheerio.load(raw);
  $('a[href*="/grants/grant/"]').each((_, anchor) => {
    const link = $(anchor);
    const href = new URL(link.attr('href'), 'https://data.snf.ch').href;
    const container = link.closest('article, tr, li, [data-grant], .grant, .result').first();
    const scope = container.length ? container : link.parent();
    const text = cleanText(scope.text());
    const dates = grantDatesFromPeriod(text);
    const amountMatch = text.match(/(?:CHF|EUR|USD)\s*[\d'.,]+|[\d'.,]+\s*(?:CHF|EUR|USD)/i);
    const currency = amountMatch?.[0].match(/CHF|EUR|USD/i)?.[0]?.toUpperCase() || '';
    const grantId = href.match(/\/grants\/grant\/([^/?#]+)/)?.[1] || '';
    grants.push({
      title: cleanText(
        scope.find('[data-field="title"], .title, h2, h3').first().text()
        || link.attr('title')
        || link.text()
      ),
      funder: 'SNSF',
      pi_role: cleanText(scope.attr('data-role') || 'PI'),
      amount: cleanText(amountMatch?.[0]?.replace(/CHF|EUR|USD/ig, '')),
      currency,
      start_date: scope.attr('data-start-date') || dates.start_date,
      end_date: scope.attr('data-end-date') || dates.end_date,
      status: cleanText(scope.attr('data-status') || (/\b(laufend|ongoing|active)\b/i.test(text) ? 'Active' : '')),
      institution: cleanText(prospect.institution),
      grant_id: grantId,
      source_url: href,
      confidence: 'official_portal',
      checked_at: checkedAt,
    });
  });

  // Firecrawl markdown fallback: [**Title**](https://data.snf.ch/grants/grant/ID) ... End: DD.MM.YYYY
  const markdownLink = /\[([^\]]+)\]\((https:\/\/data\.snf\.ch\/grants\/grant\/[^)\s]+)\)/g;
  let match;
  while ((match = markdownLink.exec(raw))) {
    const title = cleanText(match[1].replace(/\*\*/g, ''));
    const href = match[2];
    const grantId = href.match(/\/grants\/grant\/([^/?#]+)/)?.[1] || '';
    if (grants.some(grant => grant.grant_id === grantId || grant.source_url === href)) continue;
    const snippet = raw.slice(match.index, match.index + 900);
    const endMatch = snippet.match(/End:\s*(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})/i);
    const amountMatch = snippet.match(/Approved amount:\s*([\d'’.,]+)\s*(CHF|EUR|USD)/i);
    grants.push({
      title,
      funder: 'SNSF',
      pi_role: 'PI',
      amount: cleanText(amountMatch?.[1]),
      currency: cleanText(amountMatch?.[2] || 'CHF'),
      start_date: '',
      end_date: cleanText(endMatch?.[1]),
      status: 'Active',
      institution: cleanText(prospect.institution),
      grant_id: grantId,
      source_url: href,
      confidence: 'official_portal',
      checked_at: checkedAt,
    });
  }
  return normalizeActiveGrants(grants);
}

export function parseNsfAwardsJson(payload = {}, prospect = {}, checkedAt = new Date().toISOString()) {
  const awards = payload?.response?.award || payload?.awards || payload?.results || [];
  return normalizeActiveGrants((Array.isArray(awards) ? awards : [awards]).map(award => {
    const grantId = cleanText(award?.id || award?.awardId || award?.award_id);
    return {
      title: cleanText(award?.title || award?.awardTitle),
      funder: 'NSF',
      pi_role: 'Principal Investigator',
      amount: cleanText(award?.fundsObligatedAmt || award?.awardAmount || award?.amount),
      currency: 'USD',
      start_date: usDate(award?.startDate || award?.start_date),
      end_date: usDate(award?.expDate || award?.endDate || award?.end_date),
      status: cleanText(award?.status || 'Active'),
      institution: cleanText(award?.agency || award?.institution || prospect.institution),
      grant_id: grantId,
      source_url: grantId ? `https://www.nsf.gov/awardsearch/showAward?AWD_ID=${encodeURIComponent(grantId)}` : '',
      confidence: 'official_api',
      checked_at: checkedAt,
    };
  }));
}

export function parseNihReporterJson(payload = {}, prospect = {}, checkedAt = new Date().toISOString()) {
  const projects = payload?.results || payload?.projects || [];
  const targetName = cleanText(prospect.name).toLowerCase();
  const nameParts = targetName.split(/\s+/).filter(Boolean);
  const targetFirst = nameParts[0] || '';
  const targetLast = nameParts.at(-1) || '';
  const institutionHint = cleanText(prospect.institution).toLowerCase();
  return normalizeActiveGrants((Array.isArray(projects) ? projects : [])
    .filter(project => {
      const pis = Array.isArray(project?.principal_investigators) ? project.principal_investigators : [];
      const contact = cleanText(project?.contact_pi_name).toLowerCase();
      const piHit = pis.some(pi => {
        const full = cleanText(pi?.full_name || `${pi?.first_name || ''} ${pi?.last_name || ''}`).toLowerCase();
        return full.includes(targetLast) && (!targetFirst || full.includes(targetFirst));
      }) || (contact.includes(targetLast) && (!targetFirst || contact.includes(targetFirst)));
      if (!piHit) return false;
      if (!institutionHint) return true;
      const org = cleanText(project?.organization?.org_name).toLowerCase();
      if (!org) return true;
      const tokens = institutionHint.split(/[^a-z0-9]+/).filter(token => token.length > 3);
      return tokens.some(token => org.includes(token));
    })
    .map(project => {
      const grantId = cleanText(project?.project_num || project?.core_project_num || project?.project_id);
      return {
        title: cleanText(project?.project_title),
        funder: cleanText(project?.agency_ic_admin?.name || 'NIH'),
        pi_role: 'Principal Investigator',
        amount: cleanText(project?.award_amount),
        currency: 'USD',
        start_date: cleanText(project?.project_start_date),
        end_date: cleanText(project?.project_end_date),
        status: cleanText(project?.is_active === false ? 'Inactive' : 'Active'),
        institution: cleanText(project?.organization?.org_name || prospect.institution),
        grant_id: grantId,
        source_url: grantId ? `https://reporter.nih.gov/project-details/${encodeURIComponent(project?.appl_id || grantId)}` : '',
        confidence: 'official_api',
        checked_at: checkedAt,
      };
    }));
}

const PARSERS = {
  snsf: async (response, prospect, checkedAt) => parseSnsfGrantHtml(await response.text(), prospect, checkedAt),
  nsf: async (response, prospect, checkedAt) => parseNsfAwardsJson(await response.json(), prospect, checkedAt),
  nih: async (response, prospect, checkedAt) => parseNihReporterJson(await response.json(), prospect, checkedAt),
};

export async function collectProfessorGrants(prospect = {}, {
  fetchImpl = fetch,
  signal,
} = {}) {
  const plan = buildGrantResearchPlan(prospect);
  const checkedAt = new Date().toISOString();
  const grants = [];
  const attempts = [];
  for (const request of plan.requests) {
    const parser = PARSERS[request.portal];
    if (!parser) {
      attempts.push({ portal: request.portal, status: 'external_research_required', url: request.url });
      continue;
    }
    try {
      const response = await fetchImpl(request.url, {
        method: request.method,
        headers: {
          Accept: request.portal === 'snsf' ? 'text/html' : 'application/json',
          ...(request.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = await parser(response, prospect, checkedAt);
      grants.push(...parsed);
      attempts.push({ portal: request.portal, status: 'ok', found: parsed.length, url: request.url });
    } catch (error) {
      attempts.push({ portal: request.portal, status: 'error', error: error.message, url: request.url });
    }
  }
  return {
    ...plan,
    checked_at: checkedAt,
    grants: normalizeActiveGrants(grants),
    attempts,
  };
}
