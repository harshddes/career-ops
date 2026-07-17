/**
 * Cross-source PhD-board dedupe (PhDScanner + FindAPhD).
 * One visible card per university+title cluster.
 */
import { createHash } from 'crypto';

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

export function slugifyPhdText(value = '') {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b(ph\.?d\.?|doctoral|doctorate)\b/gi, ' ')
    .replace(/\b(in|on|at|for|the|a|an|and|of|with)\b/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function phdBoardDedupeKey(item = {}) {
  const university = slugifyPhdText(item.university || item.institution || '');
  const title = slugifyPhdText(item.title || '');
  if (!university || !title) return '';
  return `${university}|${title}`;
}

export function phdBoardClusterId(dedupeKey = '') {
  const key = cleanText(dedupeKey);
  if (!key) return '';
  return `phdboard-${createHash('sha1').update(key).digest('hex').slice(0, 16)}`;
}

function tokenSet(text = '') {
  return new Set(slugifyPhdText(text).split(' ').filter(Boolean));
}

export function titleTokenJaccard(a = '', b = '') {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / new Set([...left, ...right]).size;
}

function sameUniversity(a = {}, b = {}) {
  return slugifyPhdText(a.university || a.institution) === slugifyPhdText(b.university || b.institution);
}

function sourceEntry(item = {}) {
  const source = cleanText(item.source || 'phdscanner').toLowerCase() || 'phdscanner';
  return {
    source,
    url: cleanText(item.url),
    external_id: cleanText(item.external_id || item.id),
    provider: cleanText(item.provider || item.coverage?.provider),
  };
}

function preferPrimaryUrl(sources = []) {
  const findaphd = sources.find(item => item.source === 'findaphd' && item.url);
  if (findaphd) return findaphd.url;
  const phdscanner = sources.find(item => item.source === 'phdscanner' && item.url);
  if (phdscanner) return phdscanner.url;
  return sources.find(item => item.url)?.url || '';
}

function mergeClusterRecords(records = [], { now = new Date() } = {}) {
  if (!records.length) return null;
  const sorted = [...records].sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const best = sorted[0];
  const sourcesMap = new Map();
  for (const item of sorted) {
    const entries = Array.isArray(item.sources) && item.sources.length
      ? item.sources
      : [sourceEntry(item)];
    for (const entry of entries) {
      const key = `${entry.source}|${entry.external_id || entry.url}`;
      if (!sourcesMap.has(key) && entry.url) sourcesMap.set(key, entry);
    }
  }
  const sources = [...sourcesMap.values()];
  const primaryUrl = preferPrimaryUrl(sources);
  const primarySource = sources.find(item => item.url === primaryUrl)?.source
    || cleanText(best.source || 'phdscanner');
  const dedupeKey = phdBoardDedupeKey(best) || cleanText(best.dedupe_key);
  const id = phdBoardClusterId(dedupeKey) || best.id;
  const risk = [...new Set(sorted.flatMap(item => item.risk_flags || []))];
  const withExecution = sorted.find(item => item.execution?.ready_checked || item.execution?.stage) || best;
  const withArtifacts = sorted.find(item => item.research_report || item.resources?.resume_pdf || Object.keys(item.artifacts || {}).length) || best;

  return {
    ...best,
    id,
    dedupe_key: dedupeKey,
    source: primarySource,
    sources,
    url: primaryUrl || best.url,
    alt_urls: sources.filter(item => item.url && item.url !== primaryUrl).map(item => item.url),
    score: Math.max(...sorted.map(item => Number(item.score || 0))),
    score_band: sorted.map(item => item.score_band).sort((a, b) => {
      const rank = { top_priority: 4, strong_review: 3, adjacent_review: 2, archive: 1 };
      return (rank[b] || 0) - (rank[a] || 0);
    })[0] || best.score_band,
    risk_flags: risk,
    fully_funded: sorted.some(item => item.fully_funded),
    minimal_financial_barriers: sorted.some(item => item.minimal_financial_barriers),
    funding_label: sorted.map(item => item.funding_label).find(Boolean) || best.funding_label,
    deadline_text: sorted.map(item => item.deadline_text).find(Boolean) || best.deadline_text,
    deadline_utc: sorted.map(item => item.deadline_utc).find(Boolean) || best.deadline_utc,
    supervisor: sorted.map(item => item.supervisor).find(Boolean) || best.supervisor,
    summary: (best.summary && best.summary.length >= 80)
      ? best.summary
      : (sorted.map(item => item.summary).sort((a, b) => String(b || '').length - String(a || '').length)[0] || best.summary),
    execution: withExecution.execution || {},
    resources: { ...(withArtifacts.resources || {}), ...(best.resources || {}) },
    artifacts: { ...(withArtifacts.artifacts || {}), ...(best.artifacts || {}) },
    research_report: withArtifacts.research_report || best.research_report,
    worker_status: withExecution.worker_status && withExecution.worker_status !== 'not_needed'
      ? withExecution.worker_status
      : best.worker_status,
    automation: withExecution.automation || best.automation,
    first_seen: sorted.map(item => item.first_seen).filter(Boolean).sort()[0] || best.first_seen,
    last_updated: now.toISOString(),
  };
}

/**
 * Collapse opportunities that share university+title (exact key or fuzzy Jaccard).
 */
export function consolidatePhdBoardOpportunities(opportunities = [], { now = new Date(), jaccardThreshold = 0.85 } = {}) {
  const items = Array.isArray(opportunities) ? opportunities.filter(Boolean) : [];
  const clusters = [];
  for (const item of items) {
    const key = phdBoardDedupeKey(item);
    let matched = null;
    if (key) {
      matched = clusters.find(cluster => cluster.key === key);
    }
    if (!matched) {
      matched = clusters.find(cluster => {
        const seed = cluster.records[0];
        if (!sameUniversity(seed, item)) return false;
        return titleTokenJaccard(seed.title, item.title) >= jaccardThreshold;
      });
    }
    if (matched) {
      matched.records.push(item);
      if (!matched.key && key) matched.key = key;
    } else {
      clusters.push({ key, records: [item] });
    }
  }
  return clusters.map(cluster => mergeClusterRecords(cluster.records, { now })).filter(Boolean);
}
