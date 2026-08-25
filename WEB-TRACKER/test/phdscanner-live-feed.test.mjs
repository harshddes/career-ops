import './live-env.mjs';

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parsePhdscannerSitemap } from '../lib/phdscanner/source-adapter.mjs';
import { normalizePhdscannerOpportunity } from '../lib/phdscanner/normalizer.mjs';
import {
  mergePhdscannerOpportunities,
  readPhdscannerOpportunities,
  syncPhdscannerOpportunitiesToDashboard,
} from '../lib/phdscanner/opportunity-store.mjs';
import { startFastServer } from '../server-fast.mjs';

const SAMPLE_SITEMAP = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://www.phdscanner.com/opportunities/phd-vacancies-demo-institute-germany-phd-in-plasma-diagnostics-and-instrumentation-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee</loc></url>
</urlset>`;

test('parses PhDScanner sitemap into posting records with slug metadata', () => {
  const postings = parsePhdscannerSitemap(SAMPLE_SITEMAP);
  assert.equal(postings.length, 1);
  assert.equal(postings[0].id, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.match(postings[0].title || '', /Plasma/i);
  assert.equal(postings[0].country, 'Germany');
});

test('normalizes sitemap posting into scored opportunity', () => {
  const [posting] = parsePhdscannerSitemap(SAMPLE_SITEMAP);
  const opportunity = normalizePhdscannerOpportunity({
    ...posting,
    summary: 'Fully funded PhD on plasma diagnostics, FPGA readout, mass spectrometry, and vacuum instrumentation.',
    fully_funded: true,
    deadline: 'December 31, 2099',
  }, { now: new Date('2026-07-01T00:00:00.000Z') });
  assert.match(opportunity.id, /^phdscanner-/);
  assert.equal(opportunity.fully_funded, true);
  assert.ok(opportunity.score >= 3.2);
  assert.equal(opportunity.visible, true);
});

test('writes PhDScanner store and syncs dashboard copy', () => {
  const dir = mkdtempSync(join(tmpdir(), 'phdscanner-store-'));
  try {
    const canonical = join(dir, 'data', 'phdscanner-opportunities.json');
    const dashboard = join(dir, 'dashboard', 'phdscanner-opportunities.json');
    mkdirSync(join(dir, 'data'), { recursive: true });
    mkdirSync(join(dir, 'dashboard'), { recursive: true });
    const [posting] = parsePhdscannerSitemap(SAMPLE_SITEMAP);
    const opportunity = normalizePhdscannerOpportunity({
      ...posting,
      summary: 'Fully funded PhD on plasma diagnostics and FPGA readout.',
      fully_funded: true,
      deadline: 'December 31, 2099',
    }, { now: new Date('2026-07-01T00:00:00.000Z') });
    const { store } = mergePhdscannerOpportunities([opportunity], {
      filePath: canonical,
      scanSummary: {
        provider: 'sitemap_details',
        status: 'ok',
        scanned_count: 1,
        last_success: '2026-07-01T00:00:00.000Z',
      },
    });
    assert.equal(store.scan_summary.total_count, 1);
    assert.ok(store.scan_summary.visible_count >= 1);
    syncPhdscannerOpportunitiesToDashboard({ sourcePath: canonical, outputPath: dashboard, write: true });
    const synced = JSON.parse(readFileSync(dashboard, 'utf-8'));
    assert.match(synced.opportunities[0].id, /^(phdscanner-|phdboard-|findaphd-)/);
    assert.ok(synced.opportunities[0].sources?.length || synced.opportunities[0].source);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fast server exposes PhDScanner opportunities API', async () => {
  const server = await startFastServer(0, '127.0.0.1');
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/phdscanner/opportunities`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body.opportunities), true);
    assert.ok(body.scan_summary);
    readPhdscannerOpportunities();
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('dashboard PhDScanner tab mirrors EURAXESS execution UI hooks', () => {
  const html = readFileSync(new URL('../dashboard/fusion-pivot-dashboard.html', import.meta.url), 'utf8');
  for (const marker of [
    'id="phdscanner-kanban"',
    'phdscannerToggleReady',
    'renderPhdscannerKanban',
    'phdscannerRemoveFromKanban',
    'phdscannerSetExecution',
    'phdscannerApplyOpportunity',
    'Ready for application',
    'id="phdscanner-role"',
    'id="phdscanner-board-source"',
    'phdscannerSourceLinks',
    '/api/findaphd/scan',
  ]) {
    assert.match(html, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
