import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const BASE = dirname(fileURLToPath(import.meta.url));
const DASHBOARD = join(BASE, '..', 'dashboard', 'fusion-pivot-dashboard.html');

test('networking dashboard tab wires views, drawer, and SSE refresh', () => {
  const html = readFileSync(DASHBOARD, 'utf-8');
  assert.match(html, /id="networking"/);
  assert.match(html, /function renderNetworking/);
  assert.match(html, /function setNetworkingView/);
  assert.match(html, /function openNetworkingPerson/);
  assert.match(html, /function attachNetworkingGmailLink/);
  assert.match(html, /function renderNetworkingFromSse/);
  assert.match(html, /networking_updated/);
  assert.match(html, /Find new networking contacts/);
  assert.match(html, /\/api\/networking/);
  assert.match(html, /id="networking-drawer-overlay"/);
  assert.match(html, /Paste Gmail thread URL/);
  assert.match(html, /Start here/);
  assert.match(html, /Review people/);
  assert.match(html, /Today’s moves/);
  assert.match(html, /Research this company/);
  assert.match(html, /Copy work-order details/);
  assert.match(html, /Find new networking contacts/);
  assert.match(html, /networking-recipe/);
  assert.match(html, /function reviewNetworkingCandidate/);
  assert.match(html, /networking-drawer-open/);
  assert.match(html, /event\.key === 'Escape'/);
  assert.match(html, /data-lane="discover"/);
  assert.match(html, /networking-pipeline-column\[data-lane="reach"\]/);
  assert.match(html, /class="[^"]*networking-start-here[^"]*"/);
  assert.match(html, /class="[^"]*networking-advanced[^"]*"/);
});

test('networking research SOP and cursor rule exist', () => {
  const sop = readFileSync(join(BASE, '..', 'lib', 'networking', 'NETWORKING_RESEARCH_SOP.md'), 'utf-8');
  assert.match(sop, /Find new networking contacts/);
  assert.match(sop, /Never scrape LinkedIn/);
  const rule = readFileSync(join(BASE, '..', '..', '.cursor', 'rules', 'networking-find-contacts.mdc'), 'utf-8');
  assert.match(rule, /networking-research-queue\.json/);
});
