/**
 * Feed list projections, gzip/brotli on JSON GETs, mtime cache, dashboard wiring.
 * Uses temp fixtures — never the live 6–8 MB stores.
 */

import './live-env.mjs';

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'http';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { gunzipSync, brotliDecompressSync } from 'zlib';
import { request as httpRequest } from 'http';
import {
  jsonByteLength,
  projectEuraxessListStore,
  projectPhdscannerListStore,
  projectResearchListStore,
  projectUmichListStore,
  requestWantsListView,
} from '../lib/feed-list-projection.mjs';
import { compactJson, encodeCompressedBody } from '../lib/http-compress.mjs';
import { getMtimeStoreCacheEntry } from '../lib/mtime-store-cache.mjs';
import {
  readEuraxessOpportunities,
  writeEuraxessOpportunities,
} from '../lib/euraxess/opportunity-store.mjs';
import { startFastServer } from '../server-fast.mjs';

const DASHBOARD_HTML = join(dirname(fileURLToPath(import.meta.url)), '..', 'dashboard', 'fusion-pivot-dashboard.html');

function fatEuraxessStore(count = 8) {
  return {
    version: 1,
    generated_at: '2026-08-13T00:00:00.000Z',
    scope: 'test',
    scan_summary: { total_count: count },
    opportunities: Array.from({ length: count }, (_, index) => ({
      id: `euraxess-fusion-${1000 + index}`,
      title: `Plasma diagnostics posting ${index}`,
      institution: 'ITER Organization',
      country: 'France',
      summary: 'x'.repeat(4000),
      fit_rationale: `Long rationale ${'fusion plasma FPGA DAQ '.repeat(80)}`,
      score: 4.2,
      score_band: 'top_priority',
      status: 'open_unverified',
      deadline_text: '2099-12-31',
      url: `https://euraxess.ec.europa.eu/jobs/${1000 + index}`,
      visible: true,
      archived: false,
      worker_status: 'queued',
      research_fields: ['plasma physics'],
      academic_level: 'PhD',
      coverage: { provider: 'rss', first_seen: '2026-01-01', last_seen: '2026-08-01', feed_window: 'x'.repeat(500) },
      verification: { deadline_source: 'parsed', status_source: 'rss', verification_required: true },
      automation: { worker_status: 'queued', current_stage: 'queued_research', last_error: '', attempts: 1 },
      decision: { apply_recommendation: 'review', rationale: 'y'.repeat(2000), archive_reason: '' },
      score_breakdown: {
        strong_matches: ['plasma', 'diagnostics'],
        notes: 'z'.repeat(3000),
      },
      artifacts: { research_report: `reports/euraxess-demo-${index}.md` },
      resources: { resume_pdf: `output/iter/cv-${index}.pdf` },
      execution: { stage: 'ready_for_application', ready_checked: true, application_num: null },
    })),
  };
}

function fetchRaw(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('list projections drop encyclopedic blobs and stay far smaller than full stores', () => {
  const euraxess = fatEuraxessStore(12);
  const euraxessList = projectEuraxessListStore(euraxess);
  assert.equal(euraxessList.view, 'list');
  assert.equal(euraxessList.opportunities.length, 12);
  assert.ok(!('coverage' in euraxessList.opportunities[0]));
  assert.ok(!euraxessList.opportunities[0].fit_rationale.includes('fusion plasma FPGA DAQ '.repeat(20)));
  assert.ok(euraxessList.opportunities[0].artifacts.research_report);
  assert.ok(jsonByteLength(euraxessList) * 4 < jsonByteLength(euraxess));

  const umich = {
    opportunities: [{
      id: 'umich-careers-1',
      title: 'Research Engineer',
      description: 'd'.repeat(8000),
      fit_rationale: 'nuclear plasma diagnostics '.repeat(40),
      score_breakdown: { nuclear_plasma_matches: ['plasma'], title_core_matches: ['engineer'] },
      segment: 'apply_now',
      status: 'open',
    }],
  };
  const umichList = projectUmichListStore(umich);
  assert.equal(umichList.opportunities[0].description, '');
  assert.deepEqual(umichList.opportunities[0].score_breakdown.nuclear_plasma_matches, ['plasma']);
  assert.ok(jsonByteLength(umichList) < jsonByteLength(umich) / 3);

  const phd = {
    opportunities: [{
      id: 'phdscanner-1',
      title: 'PhD in plasma diagnostics',
      university: 'KTH',
      summary: 's'.repeat(5000),
      fully_funded: true,
      sources: [{ source: 'phdscanner', url: 'https://example.test/p' }],
      automation: { worker_status: 'queued', current_stage: 'queued_research', last_error: '' },
      execution: { stage: null, ready_checked: false },
    }],
  };
  const phdList = projectPhdscannerListStore(phd);
  assert.equal(phdList.opportunities[0].fully_funded, true);
  assert.ok(phdList.opportunities[0].summary.length < 500);

  const research = {
    prospects: [{
      id: 'umich-alice',
      name: 'Alice Example',
      department: 'NERS',
      score: 4.1,
      status: 'contacted',
      contact_email: 'alice@example.edu',
      outreach_angle: 'Shared DAQ / diagnostics overlap.',
      outreach: { stage: 'your_move', last_touch_at: '2026-08-01' },
      evidence: Array.from({ length: 20 }, (_, i) => ({ type: 'paper', label: `Paper ${i}`, url: `https://example.test/${i}`, dump: 'e'.repeat(2000) })),
      defense_sheet: [{ id: 'q1', question: 'What do they work on?', answer: 'a'.repeat(4000) }],
      researched_answer: 'r'.repeat(8000),
    }],
  };
  const researchList = projectResearchListStore(research);
  assert.equal(researchList.prospects[0].name, 'Alice Example');
  assert.equal(researchList.prospects[0].outreach.stage, 'your_move');
  assert.equal(researchList.prospects[0].evidence, undefined);
  assert.equal(researchList.prospects[0].defense_sheet, undefined);
  assert.ok(jsonByteLength(researchList) * 5 < jsonByteLength(research));
});

test('requestWantsListView reads Express query and raw URLs', () => {
  assert.equal(requestWantsListView({ query: { view: 'list' } }), true);
  assert.equal(requestWantsListView({ url: '/api/euraxess/opportunities?view=list' }), true);
  assert.equal(requestWantsListView({ url: '/api/euraxess/opportunities' }), true);
  assert.equal(requestWantsListView({ query: { view: 'full' } }), false);
});

test('gzip and brotli wrap compact JSON above the size floor', () => {
  const json = compactJson({ padding: 'n'.repeat(2000), ok: true });
  assert.equal(json.includes('\n  '), false);
  const gzipped = encodeCompressedBody(json, 'gzip');
  assert.equal(gzipped.encoding, 'gzip');
  assert.deepEqual(JSON.parse(gunzipSync(gzipped.payload).toString('utf-8')), { padding: 'n'.repeat(2000), ok: true });
  const brotli = encodeCompressedBody(json, 'br, gzip');
  assert.equal(brotli.encoding, 'br');
  assert.equal(JSON.parse(brotliDecompressSync(brotli.payload).toString('utf-8')).ok, true);
  const tiny = encodeCompressedBody('{"ok":true}', 'gzip');
  assert.equal(tiny.encoding, '');
});

test('EURAXESS mtime cache returns the same object and skips a rewrite hit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'euraxess-mtime-'));
  const filePath = join(dir, 'euraxess-opportunities.json');
  const written = writeEuraxessOpportunities(fatEuraxessStore(3), filePath);
  const first = readEuraxessOpportunities(filePath);
  const second = readEuraxessOpportunities(filePath);
  assert.equal(first, second);
  assert.equal(first, written);
  const cached = getMtimeStoreCacheEntry(filePath);
  assert.ok(cached);
  assert.ok(cached.hits >= 1);
});

test('fast server gzips list JSON and honors view=list', async () => {
  const server = await startFastServer(0, '127.0.0.1');
  try {
    const { port } = server.address();
    const listRes = await fetch(`http://127.0.0.1:${port}/api/euraxess/opportunities?view=list`);
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.view, 'list');
    assert.equal(Array.isArray(listBody.opportunities), true);

    const raw = await fetchRaw(`http://127.0.0.1:${port}/api/euraxess/opportunities?view=list`, {
      'accept-encoding': 'gzip',
    });
    assert.equal(raw.status, 200);
    if ((raw.headers['content-encoding'] || '') === 'gzip') {
      const parsed = JSON.parse(gunzipSync(raw.body).toString('utf-8'));
      assert.equal(parsed.view, 'list');
    } else {
      const parsed = JSON.parse(raw.body.toString('utf-8'));
      assert.equal(parsed.view, 'list');
      assert.ok(raw.body.length < 512, 'tiny payloads may skip gzip');
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('dashboard feed tabs fetch view=list and do not force-render on tab switch', () => {
  const html = readFileSync(DASHBOARD_HTML, 'utf-8');
  assert.match(html, /\/api\/euraxess\/opportunities\?view=list/);
  assert.match(html, /\/api\/umich-careers\/opportunities\?view=list/);
  assert.match(html, /\/api\/phdscanner\/opportunities\?view=list/);
  assert.match(html, /\/api\/research-prospects\?view=list/);
  assert.match(html, /euraxessLoadMore/);
  assert.match(html, /researchProspectsLoadMore/);
  assert.match(html, /liveJobsLoadMore/);
  assert.match(html, /const FEED_PAGE_SIZE = 48/);

  const tabBlock = html.slice(html.indexOf('const TAB_RENDERERS'), html.indexOf('const FEED_PAGE_SIZE'));
  assert.match(tabBlock, /livejobs:\s*\(\)\s*=>\s*renderLiveJobs\(\)/);
  assert.match(tabBlock, /euraxess:\s*\(\)\s*=>\s*renderEuraxessFeed\(\)/);
  assert.match(tabBlock, /phdscanner:\s*\(\)\s*=>\s*renderPhdscannerFeed\(\)/);
  assert.match(tabBlock, /umichcareers:\s*\(\)\s*=>\s*renderUmichCareersFeed\(\)/);
  assert.match(tabBlock, /researchprospects:\s*\(\)\s*=>\s*renderResearchProspects\(\)/);
  assert.match(tabBlock, /networking:\s*\(\)\s*=>\s*renderNetworking\(\{\s*force:\s*true\s*\}\)/);
  assert.doesNotMatch(tabBlock, /renderEuraxessFeed\(\{\s*force:\s*true\s*\}\)/);
  assert.doesNotMatch(tabBlock, /renderLiveJobs\(\{\s*force:\s*true\s*\}\)/);
  assert.doesNotMatch(tabBlock, /renderUmichCareersFeed\(\{\s*force:\s*true\s*\}\)/);
  assert.doesNotMatch(tabBlock, /renderResearchProspects\(\{\s*force:\s*true\s*\}\)/);
  assert.doesNotMatch(tabBlock, /renderPhdscannerFeed\(\{\s*force:\s*true\s*\}\)/);
});

test('local gzip helper can drive a tiny HTTP JSON response', async () => {
  const payload = compactJson({ items: Array.from({ length: 40 }, (_, i) => ({ id: i, blob: 'q'.repeat(20) })) });
  const server = createServer((req, res) => {
    const { payload: body, encoding } = encodeCompressedBody(payload, req.headers['accept-encoding']);
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      ...(encoding ? { 'content-encoding': encoding } : {}),
    });
    res.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const raw = await fetchRaw(`http://127.0.0.1:${port}/`, { 'accept-encoding': 'gzip' });
    assert.equal(raw.headers['content-encoding'], 'gzip');
    assert.equal(JSON.parse(gunzipSync(raw.body).toString('utf-8')).items.length, 40);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
