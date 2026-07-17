import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  extractFindaphdExternalId,
  normalizeFindaphdPosting,
  parseFindaphdFunding,
} from '../lib/findaphd/normalizer.mjs';
import { parseFindaphdListingHtml } from '../lib/findaphd/source-adapter.mjs';
import {
  consolidatePhdBoardOpportunities,
  phdBoardDedupeKey,
  titleTokenJaccard,
} from '../lib/phdscanner/dedupe.mjs';
import {
  mergePhdscannerOpportunities,
  writePhdscannerOpportunities,
} from '../lib/phdscanner/opportunity-store.mjs';

const SAMPLE_HTML = `
<div id="SearchResults" class="search-results">
  <div class="resultsRow phd-result-row-standard phd-result row py-2 w-100 px-0 m-0" id="searchResultImpression0">
    <div class="instDeptRow phd-result__dept-inst">
      <div class="instLink phd-result__dept-inst--inst"><span class="phd-result__dept-inst--title">University of Southampton</span></div>
      <div class="deptLink phd-result__dept-inst--dept">Faculty of Engineering and Physical Sciences</div>
    </div>
    <a href="/phds/project/ai-based-virtual-microphone-technique-for-automotive-applications/?p189359">
      <div class="phd-result__title">AI-based virtual microphone technique for automotive applications</div>
    </a>
    <div class="desc phd-result__description">Supervisory Team. Prof Filippo Fazi. This project offers AI acoustics. Read more</div>
    Supervisor: Dr F. Fazi
    14 July 2026
    PhD Research Project
    Competition Funded PhD Project (UK Students Only)
    <a href="/phds/project/ai-based-virtual-microphone-technique-for-automotive-applications/?p189359">More details</a>
  </div>
  <div class="resultsRow phd-result-row-standard phd-result row" id="searchResultImpression1">
    <div class="instDeptRow phd-result__dept-inst">
      <div class="instLink phd-result__dept-inst--inst"><span class="phd-result__dept-inst--title">University of Agder</span></div>
    </div>
    <a href="/phds/project/phd-fellows-in-fusion-plasma-physics/?p197204">
      <div class="phd-result__title">PhD Fellows in Fusion Plasma Physics</div>
    </a>
    <div class="desc phd-result__description">Plasma diagnostics and instrumentation for fusion devices.</div>
    31 December 2099
    Funded PhD Project (Students Worldwide)
  </div>
</div>
`;

test('extracts FindAPhD project id from detail URL', () => {
  assert.equal(
    extractFindaphdExternalId('https://www.findaphd.com/phds/project/ai-based-virtual-microphone/?p189359'),
    '189359',
  );
});

test('parses FindAPhD listing HTML rows', () => {
  const postings = parseFindaphdListingHtml(SAMPLE_HTML);
  assert.ok(postings.length >= 2);
  assert.equal(postings[0].external_id, '189359');
  assert.match(postings[0].title || '', /virtual microphone/i);
  assert.match(postings[0].university || '', /Southampton/i);
  assert.match(postings[0].funding_label || '', /Competition Funded/i);
  assert.equal(postings[1].external_id, '197204');
});

test('funding badge maps to filter flags without being a score input', () => {
  const funding = parseFindaphdFunding({
    funding_label: 'Competition Funded PhD Project (UK Students Only)',
    title: 'Generic engineering topic without plasma keywords',
  });
  assert.equal(funding.fully_funded, true);
  const scored = normalizeFindaphdPosting({
    url: 'https://www.findaphd.com/phds/project/generic-topic/?p1',
    title: 'Generic engineering topic without plasma keywords',
    university: 'Demo University',
    funding_label: 'Competition Funded PhD Project (UK Students Only)',
    summary: 'Generic engineering topic without plasma keywords',
  });
  assert.equal(scored.fully_funded, true);
  assert.ok(scored.score < 3.2);
});

test('dedupe collapses PhDScanner + FindAPhD copies into one card', () => {
  const filePath = join(mkdtempSync(join(tmpdir(), 'phd-board-dedupe-')), 'phdscanner-opportunities.json');
  writePhdscannerOpportunities({ version: 1, opportunities: [] }, filePath);

  const key = phdBoardDedupeKey({
    title: 'PhD Fellows in Fusion Plasma Physics',
    university: 'University of Agder',
  });
  assert.ok(key.includes('agder'));
  assert.ok(titleTokenJaccard('PhD Fellows in Fusion Plasma Physics', 'Fellows in Fusion Plasma Physics') >= 0.85);

  const { store } = mergePhdscannerOpportunities([
    {
      id: 'phdscanner-abc',
      source: 'phdscanner',
      external_id: 'abc',
      title: 'PhD Fellows in Fusion Plasma Physics',
      university: 'University of Agder',
      url: 'https://www.phdscanner.com/opportunities/phd-vacancies-university-of-agder-norway-phd-fellows-in-fusion-plasma-physics-abc',
      score: 4.1,
      score_band: 'top_priority',
      status: 'open',
      summary: 'Fusion plasma diagnostics',
      sources: [{ source: 'phdscanner', url: 'https://www.phdscanner.com/opportunities/x-abc', external_id: 'abc' }],
    },
    {
      id: 'findaphd-197204',
      source: 'findaphd',
      external_id: '197204',
      title: 'PhD Fellows in Fusion Plasma Physics',
      university: 'University of Agder',
      url: 'https://www.findaphd.com/phds/project/phd-fellows-in-fusion-plasma-physics/?p197204',
      score: 4.0,
      score_band: 'top_priority',
      status: 'open',
      summary: 'Plasma diagnostics and instrumentation for fusion devices.',
      funding_label: 'Funded PhD Project (Students Worldwide)',
      fully_funded: true,
      sources: [{ source: 'findaphd', url: 'https://www.findaphd.com/phds/project/phd-fellows-in-fusion-plasma-physics/?p197204', external_id: '197204' }],
    },
  ], { filePath });

  const matches = store.opportunities.filter(item => /fusion plasma/i.test(item.title));
  assert.equal(matches.length, 1);
  assert.match(matches[0].id, /^phdboard-/);
  assert.ok((matches[0].sources || []).length >= 2);
  assert.match(matches[0].url, /findaphd\.com/);
});

test('consolidate helper merges fuzzy titles at same university', () => {
  const consolidated = consolidatePhdBoardOpportunities([
    {
      id: 'a',
      source: 'phdscanner',
      title: 'PhD in Plasma Diagnostics Instrumentation',
      university: 'Demo Uni',
      url: 'https://example.org/a',
      score: 3.8,
      sources: [{ source: 'phdscanner', url: 'https://example.org/a', external_id: 'a' }],
    },
    {
      id: 'b',
      source: 'findaphd',
      title: 'Plasma Diagnostics Instrumentation',
      university: 'Demo Uni',
      url: 'https://www.findaphd.com/phds/project/x/?p9',
      score: 3.9,
      sources: [{ source: 'findaphd', url: 'https://www.findaphd.com/phds/project/x/?p9', external_id: '9' }],
    },
  ]);
  assert.equal(consolidated.length, 1);
  assert.match(consolidated[0].url, /findaphd\.com/);
});
