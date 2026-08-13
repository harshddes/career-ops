import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

test('today stats bar has date chrome, click-through, and pulse date routing', () => {
  const html = readFileSync(new URL('../dashboard/fusion-pivot-dashboard.html', import.meta.url), 'utf-8');
  assert.match(html, /id="today-stats-chrome"/);
  assert.match(html, /id="today-stats-detail"/);
  assert.match(html, /function shiftTodayStatsDate/);
  assert.match(html, /function resetTodayStatsDate/);
  assert.match(html, /function selectTodayStatsMetric/);
  assert.match(html, /function openTodayStatsRow/);
  assert.match(html, /function openTodayStatsApplication/);
  assert.match(html, /function openTodayStatsNetworking/);
  assert.match(html, /function openTodayStatsResearch/);
  assert.match(html, /id="pulse-row-\$\{escapeHTML\(String\(entry\.num\)\)\}"/);
  assert.match(html, /data-prospect-id="\$\{escapeHTML\(prospect\.id \|\| ''\)\}"/);
  assert.match(html, /pulseFilters\.__followupDate/);
  assert.match(html, /selectedTodayStatsDate\(\)/);
  assert.match(html, /scope === 'today-activity' \? selectedTodayStatsDate\(\)/);
});

test('fast server computes /api/today-activity from the date query', () => {
  const source = readFileSync(new URL('../server-fast.mjs', import.meta.url), 'utf-8');
  assert.match(source, /pathname === '\/api\/today-activity'/);
  assert.match(source, /url\.searchParams\.get\('date'\)/);
  assert.match(source, /getTodayActivity\(\{/);
  assert.doesNotMatch(source, /'\/api\/today-activity': 'today-activity\.json'/);
});
