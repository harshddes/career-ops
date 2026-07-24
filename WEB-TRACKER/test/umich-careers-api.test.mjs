/**
 * U-M Careers API + dashboard contract tests.
 * Covers fast-server read endpoints and the dashboard tab markup contract.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { startFastServer } from '../server-fast.mjs';
import { readUmichOpportunities } from '../lib/umich-careers/opportunity-store.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_HTML = join(BASE, '..', 'dashboard', 'fusion-pivot-dashboard.html');

test('fast server exposes U-M Careers opportunities and health APIs', async () => {
  const server = await startFastServer(0, '127.0.0.1');
  try {
    const { port } = server.address();
    const oppRes = await fetch(`http://127.0.0.1:${port}/api/umich-careers/opportunities`);
    assert.equal(oppRes.status, 200);
    const oppBody = await oppRes.json();
    assert.equal(Array.isArray(oppBody.opportunities), true);
    assert.ok(oppBody.scan_health || oppBody.scan_summary || typeof oppBody.total === 'number');

    const healthRes = await fetch(`http://127.0.0.1:${port}/api/umich-careers/health`);
    assert.equal(healthRes.status, 200);
    const healthBody = await healthRes.json();
    assert.ok(healthBody.generated_at);

    // Store shape stays readable even when empty.
    const store = readUmichOpportunities();
    assert.equal(Array.isArray(store.opportunities), true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('dashboard U-M Careers tab exposes filters, pagination, and scan controls', () => {
  const html = readFileSync(DASHBOARD_HTML, 'utf-8');
  assert.match(html, /switchTab\('umichcareers'/);
  assert.match(html, /id="umichcareers"/);
  assert.match(html, /id="umich-segment"/);
  assert.match(html, /id="umich-domain"/);
  assert.match(html, /id="umich-employment"/);
  assert.match(html, /id="umich-search"/);
  assert.match(html, /renderUmichCareersFeed/);
  assert.match(html, /\/api\/umich-careers\/opportunities/);
  assert.match(html, /\/api\/umich-careers\/scan/);
  assert.match(html, /add-to-consider/);
  assert.match(html, /umichLoadMore/);
  assert.match(html, /UMICH_PAGE_SIZE/);
  assert.match(html, /umichOpportunityAction/);
  assert.match(html, /umichToggleApplied/);
  assert.match(html, /value="archived"/);
  assert.match(html, /value="applied"/);
  assert.match(html, />Archive</);
  assert.match(html, /job-apply-toggle/);
});
