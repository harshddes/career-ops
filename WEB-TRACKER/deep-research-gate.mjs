#!/usr/bin/env node
/**
 * deep-research-gate.mjs — Token-budgeted deep research trigger
 *
 * Reads the event queue, scores pending events, and decides which
 * deserve deep AI research vs. which should wait for user approval.
 *
 * Three routing outcomes:
 *   - auto_deep_research: high fit + high confidence → run immediately
 *   - needs_user_approval: medium score → add to approval queue
 *   - archive: low relevance → skip
 *
 * Token budget is tracked in data/token-budget.json to prevent runaway costs.
 *
 * Usage:
 *   node deep-research-gate.mjs              # process pending events
 *   node deep-research-gate.mjs --status     # show budget and queue status
 *   node deep-research-gate.mjs --reset      # reset daily budget
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const BASE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(BASE, 'data');
const EVENT_QUEUE_PATH = join(DATA_DIR, 'event-queue.ndjson');
const BUDGET_PATH = join(DATA_DIR, 'token-budget.json');
const APPROVAL_QUEUE_PATH = join(DATA_DIR, 'approval-queue.json');

mkdirSync(DATA_DIR, { recursive: true });

const args = process.argv.slice(2);

// ── Token Budget ────────────────────────────────────────────────────

const DEFAULT_BUDGET = {
  daily_limit: 50000,
  weekly_limit: 250000,
  per_deep_research_estimate: 8000,
  today_used: 0,
  week_used: 0,
  last_reset_date: null,
  last_week_reset: null,
};

function loadBudget() {
  if (!existsSync(BUDGET_PATH)) return { ...DEFAULT_BUDGET };
  const b = JSON.parse(readFileSync(BUDGET_PATH, 'utf-8'));

  const today = new Date().toISOString().split('T')[0];
  if (b.last_reset_date !== today) {
    b.today_used = 0;
    b.last_reset_date = today;
  }

  const weekNum = getISOWeek(new Date());
  if (b.last_week_reset !== weekNum) {
    b.week_used = 0;
    b.last_week_reset = weekNum;
  }

  return b;
}

function saveBudget(b) {
  writeFileSync(BUDGET_PATH, JSON.stringify(b, null, 2));
}

function canAffordDeepResearch(budget) {
  const est = budget.per_deep_research_estimate;
  return (budget.today_used + est <= budget.daily_limit) &&
         (budget.week_used + est <= budget.weekly_limit);
}

function chargeDeepResearch(budget) {
  budget.today_used += budget.per_deep_research_estimate;
  budget.week_used += budget.per_deep_research_estimate;
}

function getISOWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return `${date.getFullYear()}-W${Math.ceil(((date - week1) / 86400000 + 1) / 7)}`;
}

// ── Relevance scoring ───────────────────────────────────────────────

const expDecay = (ageDays, halfLife = 10) => Math.exp(-Math.log(2) * ageDays / halfLife);

export function scoreEvent(event, sourceImportance = 0.5) {
  const ageDays = (Date.now() - new Date(event.timestamp).getTime()) / 86400000;
  const recency = expDecay(ageDays);

  const typeWeight = {
    new_jobs: 0.9,
    phd_portal_changed: 0.85,
    deadline_approaching: 0.95,
    company_news: 0.6,
  }[event.type] || 0.5;

  const score =
    0.35 * typeWeight +
    0.30 * sourceImportance +
    0.20 * recency +
    0.15 * (event.count ? Math.min(event.count / 5, 1) : 0.5);

  return Math.max(0, Math.min(1, score));
}

export function routeEvent(score, budgetOk) {
  if (score >= 0.78 && budgetOk) return 'auto_deep_research';
  if (score >= 0.55) return 'needs_user_approval';
  return 'archive';
}

// ── Event queue processing ──────────────────────────────────────────

function loadEvents() {
  if (!existsSync(EVENT_QUEUE_PATH)) return [];
  const lines = readFileSync(EVENT_QUEUE_PATH, 'utf-8').split('\n').filter(l => l.trim());
  return lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function clearEvents() {
  writeFileSync(EVENT_QUEUE_PATH, '');
}

function loadApprovalQueue() {
  if (!existsSync(APPROVAL_QUEUE_PATH)) return [];
  return JSON.parse(readFileSync(APPROVAL_QUEUE_PATH, 'utf-8'));
}

function saveApprovalQueue(queue) {
  writeFileSync(APPROVAL_QUEUE_PATH, JSON.stringify(queue, null, 2));
}

// ── Load source importance from registry ────────────────────────────

function loadSourceImportance() {
  const regPath = join(BASE, 'config', 'source-registry.json');
  if (!existsSync(regPath)) return {};
  const reg = JSON.parse(readFileSync(regPath, 'utf-8'));
  const map = {};
  for (const s of reg.sources) map[s.id] = s.importance ?? 0.5;
  return map;
}

// ── Main ────────────────────────────────────────────────────────────

if (args.includes('--reset')) {
  saveBudget({ ...DEFAULT_BUDGET, last_reset_date: new Date().toISOString().split('T')[0] });
  console.log('Token budget reset.');
  process.exit(0);
}

const budget = loadBudget();

if (args.includes('--status')) {
  const events = loadEvents();
  const approvalQueue = loadApprovalQueue();
  console.log('\n[deep-research-gate] Status\n');
  console.log(`  Daily budget: ${budget.today_used}/${budget.daily_limit} tokens`);
  console.log(`  Weekly budget: ${budget.week_used}/${budget.weekly_limit} tokens`);
  console.log(`  Can afford deep research: ${canAffordDeepResearch(budget) ? 'YES' : 'NO'}`);
  console.log(`  Pending events: ${events.length}`);
  console.log(`  Approval queue: ${approvalQueue.length}`);
  console.log();
  process.exit(0);
}

const events = loadEvents();
if (events.length === 0) {
  console.log('[deep-research-gate] No pending events.');
  process.exit(0);
}

const importanceMap = loadSourceImportance();
const approvalQueue = loadApprovalQueue();

let autoCount = 0;
let approvalCount = 0;
let archiveCount = 0;

console.log(`\n[deep-research-gate] Processing ${events.length} events...\n`);

for (const event of events) {
  const importance = importanceMap[event.source_id] ?? 0.5;
  const score = scoreEvent(event, importance);
  const budgetOk = canAffordDeepResearch(budget);
  const route = routeEvent(score, budgetOk);

  if (route === 'auto_deep_research') {
    chargeDeepResearch(budget);
    autoCount++;
    console.log(`  AUTO  (${score.toFixed(2)}) ${event.type}: ${event.source_id} — ${event.titles?.join(', ') || event.name || ''}`);
  } else if (route === 'needs_user_approval') {
    approvalQueue.push({ ...event, score, route, queued_at: new Date().toISOString() });
    approvalCount++;
    console.log(`  QUEUE (${score.toFixed(2)}) ${event.type}: ${event.source_id}`);
  } else {
    archiveCount++;
    console.log(`  SKIP  (${score.toFixed(2)}) ${event.type}: ${event.source_id}`);
  }
}

saveBudget(budget);
saveApprovalQueue(approvalQueue);
clearEvents();

console.log(`\n[deep-research-gate] auto: ${autoCount}, queued: ${approvalCount}, archived: ${archiveCount}\n`);
