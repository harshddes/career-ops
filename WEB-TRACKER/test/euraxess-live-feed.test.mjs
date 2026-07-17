import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseEuraxessRss } from '../lib/euraxess/source-adapter.mjs';
import { normalizeEuraxessOpportunity } from '../lib/euraxess/normalizer.mjs';
import {
  mergeEuraxessOpportunities,
  readEuraxessOpportunities,
  syncEuraxessOpportunitiesToDashboard,
} from '../lib/euraxess/opportunity-store.mjs';
import { startFastServer } from '../server-fast.mjs';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title><![CDATA[PhD candidate in plasma diagnostics and FPGA readout]]></title>
      <link>https://euraxess.ec.europa.eu/jobs/123456</link>
      <guid>123456</guid>
      <description><![CDATA[Fusion instrumentation, DAQ, FPGA, ADC, calibration, detector readout, particle diagnostics, plasma diagnostics, high voltage systems, SIMION, and vacuum hardware.]]></description>
      <pubDate>Mon, 22 Jun 2026 06:37:49 +0200</pubDate>
    </item>
  </channel>
</rss>`;

test('parses EURAXESS RSS items into posting records', () => {
  const postings = parseEuraxessRss(SAMPLE_RSS);
  assert.equal(postings.length, 1);
  assert.equal(postings[0].id, '123456');
  assert.equal(postings[0].url, 'https://euraxess.ec.europa.eu/jobs/123456');
  assert.match(postings[0].summary, /plasma diagnostics/);
  assert.equal(postings[0].provider, 'official_rss_feed');
});

test('normalizes RSS posting with posted_at and open_unverified status', () => {
  const [posting] = parseEuraxessRss(SAMPLE_RSS);
  const opportunity = normalizeEuraxessOpportunity(posting, {
    sourceId: 'euraxess-fusion',
    now: new Date('2026-07-01T00:00:00.000Z'),
  });
  assert.equal(opportunity.id, 'euraxess-fusion-123456');
  assert.equal(opportunity.status, 'open_unverified');
  assert.equal(opportunity.posted_at, 'Mon, 22 Jun 2026 06:37:49 +0200');
  assert.equal(opportunity.visible, true);
  assert.ok(opportunity.score >= 3.2);
  // Strong plasma/diagnostics hits clear research threshold → auto-queued for factory.
  assert.equal(opportunity.worker_status, 'queued');
});

test('writes EURAXESS store summary and syncs dashboard copy', () => {
  const dir = mkdtempSync(join(tmpdir(), 'euraxess-store-'));
  try {
    const canonical = join(dir, 'data', 'euraxess-opportunities.json');
    const dashboard = join(dir, 'dashboard', 'euraxess-opportunities.json');
    mkdirSync(join(dir, 'data'), { recursive: true });
    mkdirSync(join(dir, 'dashboard'), { recursive: true });
    const [posting] = parseEuraxessRss(SAMPLE_RSS);
    const opportunity = normalizeEuraxessOpportunity(posting, {
      sourceId: 'euraxess-fusion',
      now: new Date('2026-07-01T00:00:00.000Z'),
    });
    const { store } = mergeEuraxessOpportunities([opportunity], {
      filePath: canonical,
      scanSummary: {
        provider: 'official_or_permitted_feed',
        status: 'ok',
        scanned_count: 1,
        rss_item_count: 1,
        last_success: '2026-07-01T00:00:00.000Z',
      },
    });
    assert.equal(store.scan_summary.total_count, 1);
    assert.equal(store.scan_summary.visible_count, 1);
    assert.equal(store.scan_summary.queued_count, 1);
    assert.ok((store.scan_summary.strong_count ?? 0) + (store.scan_summary.adjacent_count ?? 0) >= 1);
    syncEuraxessOpportunitiesToDashboard({ sourcePath: canonical, outputPath: dashboard });
    const synced = JSON.parse(readFileSync(dashboard, 'utf-8'));
    assert.equal(synced.opportunities[0].id, 'euraxess-fusion-123456');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fast server exposes EURAXESS opportunities API', async () => {
  const server = await startFastServer(0, '127.0.0.1');
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/euraxess/opportunities`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body.opportunities), true);
    assert.ok(body.scan_summary);
    readEuraxessOpportunities();
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
