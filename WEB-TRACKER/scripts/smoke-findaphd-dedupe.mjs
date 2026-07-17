import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fetchFindaphdPostings } from '../lib/findaphd/source-adapter.mjs';
import { normalizeFindaphdPosting } from '../lib/findaphd/normalizer.mjs';
import { mergePhdscannerOpportunities } from '../lib/phdscanner/opportunity-store.mjs';

const html = `
<div class="resultsRow phd-result-row-standard phd-result">
  <div class="phd-result__dept-inst--title">University of Agder</div>
  <a href="/phds/project/phd-fellows-in-fusion-plasma-physics/?p197204"><div class="phd-result__title">PhD Fellows in Fusion Plasma Physics</div></a>
  <div class="phd-result__description">Plasma diagnostics and instrumentation for fusion devices.</div>
  31 December 2099 Funded PhD Project (Students Worldwide)
</div>`;

const result = await fetchFindaphdPostings({ max_items: 10, max_details: 10 }, { htmlFixtures: [{ html }] });
const opps = result.postings.map(p => normalizeFindaphdPosting(p));
const filePath = join(mkdtempSync(join(tmpdir(), 'findaphd-smoke-')), 'phdscanner-opportunities.json');
const existing = [{
  id: 'phdscanner-dup',
  source: 'phdscanner',
  external_id: 'dup',
  title: 'PhD Fellows in Fusion Plasma Physics',
  university: 'University of Agder',
  url: 'https://www.phdscanner.com/opportunities/x-dup',
  score: 4.2,
  score_band: 'top_priority',
  status: 'open',
  summary: 'Fusion plasma',
  sources: [{ source: 'phdscanner', url: 'https://www.phdscanner.com/opportunities/x-dup', external_id: 'dup' }],
}];
const { store } = mergePhdscannerOpportunities([...existing, ...opps], {
  filePath,
  scanSummary: { status: 'ok', provider: 'fixture' },
});
const hit = store.opportunities.find(o => /fusion plasma/i.test(o.title));
console.log(JSON.stringify({
  ok: Boolean(hit && hit.sources?.length >= 2 && /findaphd/.test(hit.url || '')),
  count: store.opportunities.length,
  id: hit?.id,
  url: hit?.url,
  sources: hit?.sources?.map(s => s.source),
}, null, 2));
if (!hit || (hit.sources || []).length < 2) process.exit(1);
