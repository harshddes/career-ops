#!/usr/bin/env node
/**
 * server.mjs — Express server with SSE for live dashboard updates
 *
 * Serves the dashboard HTML and JSON data files.
 * Watches WEB-TRACKER/data/ for changes and pushes updates via SSE.
 */

import express from 'express';
import { watch } from 'chokidar';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, basename, resolve } from 'path';
import { fileURLToPath } from 'url';
import { ActionPlanStore } from './lib/action-plan.mjs';
import { createActionRegistry, listActions, runAction } from './lib/action-runner.mjs';
import { syncArtifactResources } from './lib/artifact-resource-sync.mjs';
import { AgentTaskQueue } from './lib/agent-task-queue.mjs';
import { JobStore } from './lib/job-store.mjs';
import { buildOutreachDraft } from './lib/outreach-drafts.mjs';
import { summarizeSourceHealth } from './lib/source-health.mjs';
import {
  CANONICAL_JOBS_FILE,
  deleteConsiderJob,
  findConsiderJob,
  patchConsiderJob,
  readConsiderJobs,
  syncConsiderJobsToDashboard,
  upsertConsiderJob,
} from './lib/jobs-to-consider-store.mjs';
import { runLivenessSweep } from './jobs-to-consider-liveness.mjs';
import {
  TRACKER_EDITABLE_FIELDS,
  TRACKER_METADATA_FIELDS,
  createTrackerRow,
  deleteTrackerRow,
  readDashboardData,
  updateDashboardSchedule,
  updateTrackerMetadata,
  updateTrackerRow,
} from '../update-tracker-row.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(BASE, 'data');
const DASHBOARD_DIR = join(BASE, 'dashboard');
const RESEARCH_DIR = join(BASE, 'research');
const PORT = process.env.PORT || 3737;
const HOST = process.env.HOST || '127.0.0.1';
const CAREER_OPS = join(BASE, '..');
const OUTPUT_DIR = join(CAREER_OPS, 'output');
const SOURCE_REGISTRY_FILE = join(BASE, 'config', 'source-registry.json');
const DEFAULT_LIVENESS_INTERVAL_MIN = 8 * 60;
const MIN_LIVENESS_INTERVAL_MIN = 15;
const MAX_TIMER_DELAY_MS = 2_147_000_000;

const app = express();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.header('Access-Control-Allow-Origin', origin || `http://${HOST}:${PORT}`);
  }
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use('/dashboard', express.static(DASHBOARD_DIR));
app.use('/research', express.static(RESEARCH_DIR));
app.use('/output', express.static(OUTPUT_DIR, {
  index: false,
  fallthrough: false,
}));

function safeDataPath(file) {
  if (!/^[\w.-]+\.(json|ndjson)$/.test(file)) return null;
  const base = resolve(DATA_DIR);
  const target = resolve(DATA_DIR, file);
  if (!target.startsWith(base)) return null;
  return target;
}

function safeCareerPath(relativePath, allowedRoots = ['reports', 'output']) {
  const clean = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!allowedRoots.some(root => clean === root || clean.startsWith(`${root}/`))) return null;
  const target = resolve(CAREER_OPS, clean);
  const insideAllowedRoot = allowedRoots.some(root => {
    const rootPath = resolve(CAREER_OPS, root);
    return target === rootPath || target.startsWith(`${rootPath}\\`) || target.startsWith(`${rootPath}/`);
  });
  if (!insideAllowedRoot) return null;
  return target;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function renderInlineMarkdown(value = '') {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const safeHref = escapeHtml(href);
    return `<a href="${safeHref}" target="_blank" rel="noreferrer">${label}</a>`;
  });
  html = html.replace(/&lt;(https?:\/\/[^&]+)&gt;/g, (_, href) => {
    const safeHref = escapeHtml(href);
    return `<a href="${safeHref}" target="_blank" rel="noreferrer">${safeHref}</a>`;
  });
  html = html.replace(/\b_([^_]+)_\b/g, '<em>$1</em>');
  return html;
}

function renderMarkdownPreview({ sourcePath, content }) {
  const title = basename(sourcePath);
  const blocks = [];
  let listItems = [];
  let tableRows = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(`<ul>${listItems.map(item => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`);
    listItems = [];
  };
  const flushTable = () => {
    if (!tableRows.length) return;
    const [header, ...body] = tableRows;
    const headerHtml = header.map(cell => `<th>${renderInlineMarkdown(cell)}</th>`).join('');
    const bodyHtml = body
      .map(row => `<tr>${row.map(cell => `<td>${renderInlineMarkdown(cell)}</td>`).join('')}</tr>`)
      .join('');
    blocks.push(`<div class="table-wrap"><table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`);
    tableRows = [];
  };
  const parseTableRow = (line) => line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
  const isTableSeparator = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushList();
      flushTable();
      continue;
    }
    if (isTableSeparator(line)) continue;
    if (/^\s*\|.+\|\s*$/.test(line)) {
      flushList();
      tableRows.push(parseTableRow(line));
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      flushTable();
      const level = Math.min(heading[1].length, 4);
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushList();
      flushTable();
      blocks.push('<hr>');
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushTable();
      listItems.push(bullet[1]);
      continue;
    }
    flushList();
    flushTable();
    blocks.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }
  flushList();
  flushTable();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; background: #0a0a0f; color: #e8e8f0; font-family: Arial, sans-serif; line-height: 1.55; }
    main { max-width: 980px; margin: 0 auto; padding: 42px 28px 72px; }
    h1, h2, h3, h4 { color: #00d4ff; line-height: 1.2; }
    h1 { color: #ff6b35; }
    p, li { color: #d7d7e2; }
    strong { color: #fff; font-weight: 700; }
    em { color: #c9c9ff; }
    a { color: #76ffa3; }
    code { background: #181824; padding: 0.1rem 0.3rem; border-radius: 4px; }
    ul { padding-left: 1.4rem; }
    hr { border: 0; border-top: 1px solid #2a2a3a; margin: 1.4rem 0; }
    .table-wrap { overflow-x: auto; margin: 1rem 0 1.5rem; border: 1px solid #2a2a3a; border-radius: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    th, td { padding: 0.65rem 0.75rem; border-bottom: 1px solid #2a2a3a; vertical-align: top; }
    th { color: #ffb86b; text-align: left; background: #12121a; font-weight: 700; }
    tr:last-child td { border-bottom: 0; }
  </style>
</head>
<body><main>${blocks.join('\n')}</main></body>
</html>`;
}

app.get('/data/:file', (req, res) => {
  const filePath = safeDataPath(req.params.file);
  if (!filePath) return res.status(400).json({ error: 'invalid file' });
  if (!existsSync(filePath)) return res.status(404).json({ error: 'not found' });

  const ext = req.params.file.split('.').pop();
  if (ext === 'json') {
    res.setHeader('Content-Type', 'application/json');
  } else if (ext === 'ndjson') {
    res.setHeader('Content-Type', 'application/x-ndjson');
  }
  res.send(readFileSync(filePath, 'utf-8'));
});

app.get('/data', (req, res) => {
  const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.json') || f.endsWith('.ndjson'));
  res.json({ files, data_dir: DATA_DIR });
});

app.get('/preview', (req, res) => {
  const filePath = safeCareerPath(req.query.path, ['reports', 'output']);
  if (!filePath) return res.status(400).send('Invalid preview path');
  if (!existsSync(filePath)) return res.status(404).send('Preview file not found');
  if (!/\.(md|txt)$/i.test(filePath)) return res.status(400).send('Preview supports markdown/text files only');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderMarkdownPreview({
    sourcePath: filePath,
    content: readFileSync(filePath, 'utf-8'),
  }));
});

// ── SSE endpoint ────────────────────────────────────────────────────

const sseClients = new Set();

app.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function broadcast(eventType, payload) {
  const data = JSON.stringify({ type: eventType, ...payload, timestamp: new Date().toISOString() });
  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`);
  }
}

function syncArtifactsToDashboard({ notify = false } = {}) {
  const artifacts = syncArtifactResources();
  const dashboard = syncConsiderJobsToDashboard();
  const completedTasks = completeSatisfiedArtifactTasks();
  if (notify || artifacts.changed) {
    broadcast('jobs_to_consider_updated', {
      total: dashboard.total,
      artifact_resources: artifacts.linked,
    });
  }
  return { artifacts, completedTasks, dashboard };
}

function completeSatisfiedArtifactTasks() {
  if (!taskQueue) return [];

  const store = readConsiderJobs();
  const completed = [];
  for (const task of taskQueue.list()) {
    if (task.type !== 'application_artifact') continue;
    if (['completed', 'cancelled'].includes(task.status)) continue;
    if (!task.source_id || !Array.isArray(task.expected_resources) || !task.expected_resources.length) continue;

    const job = findConsiderJob(task.source_id, store);
    if (!job) continue;
    const hasAllResources = task.expected_resources.every(key => Boolean(job.resources?.[key]));
    if (!hasAllResources) continue;

    const updated = taskQueue.update(task.id, {
      status: 'completed',
      notes: 'Completed automatically after expected job resources were linked.',
    });
    if (updated) {
      completed.push(updated);
      broadcast('agent_task_updated', { task: updated });
    }
  }
  return completed;
}

function readJsonFile(filePath, fallback = {}) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function configuredLivenessIntervalMin() {
  const envMinutes = positiveNumber(process.env.JOBS_TO_CONSIDER_LIVENESS_INTERVAL_MIN);
  if (envMinutes) return Math.max(MIN_LIVENESS_INTERVAL_MIN, envMinutes);

  const envHours = positiveNumber(process.env.JOBS_TO_CONSIDER_LIVENESS_INTERVAL_HOURS);
  if (envHours) return Math.max(MIN_LIVENESS_INTERVAL_MIN, envHours * 60);

  const registry = readJsonFile(SOURCE_REGISTRY_FILE, {});
  const configured = positiveNumber(registry.automation?.jobs_to_consider_liveness_interval_min)
    || positiveNumber(registry.liveness?.jobs_to_consider_interval_min)
    || positiveNumber(registry.cadence_policy?.jobs_to_consider?.default_interval_min)
    || positiveNumber(registry.cadence_policy?.job_api?.default_interval_min)
    || DEFAULT_LIVENESS_INTERVAL_MIN;

  return Math.max(MIN_LIVENESS_INTERVAL_MIN, configured);
}

function livenessDisabled() {
  return ['0', 'false', 'off', 'disabled'].includes(
    String(process.env.JOBS_TO_CONSIDER_LIVENESS || '').toLowerCase()
  );
}

function activeLivenessCandidates(store = readConsiderJobs()) {
  return store.jobs.filter(job => job.url && !['closed', 'archived'].includes(job.status));
}

function lastCheckedMs(job) {
  const parsed = Date.parse(job.last_checked || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function nextLivenessDelayMs(nowMs = Date.now()) {
  const intervalMs = configuredLivenessIntervalMin() * 60_000;
  if (livenessFailureCount > 0) {
    return Math.min(60 * 60_000, 5 * 60_000 * (2 ** Math.min(livenessFailureCount - 1, 4)));
  }

  const candidates = activeLivenessCandidates();
  if (!candidates.length) return intervalMs;

  const nextDueMs = Math.min(...candidates.map(job => lastCheckedMs(job) + intervalMs));
  if (!Number.isFinite(nextDueMs) || nextDueMs <= nowMs) return 2_000;
  return Math.max(2_000, nextDueMs - nowMs);
}

let livenessTimer = null;
let livenessSchedulerStarted = false;
let livenessSweepPromise = null;
let livenessFailureCount = 0;

function scheduleNextLivenessSweep(reason = 'scheduled') {
  if (livenessDisabled()) {
    console.log('[liveness-scheduler] disabled by JOBS_TO_CONSIDER_LIVENESS');
    return;
  }

  if (livenessTimer) clearTimeout(livenessTimer);
  const delayMs = Math.min(nextLivenessDelayMs(), MAX_TIMER_DELAY_MS);
  livenessTimer = setTimeout(() => {
    livenessTimer = null;
    runScheduledLivenessSweep(reason);
  }, delayMs);

  const minutes = Math.max(1, Math.round(delayMs / 60_000));
  console.log(`[liveness-scheduler] Next Jobs to Consider sweep in ~${minutes} min (${reason})`);
}

function queueLivenessSweep(reason = 'jobs updated') {
  if (!livenessSchedulerStarted || livenessDisabled()) return;
  if (livenessTimer) clearTimeout(livenessTimer);
  livenessTimer = setTimeout(() => {
    livenessTimer = null;
    runScheduledLivenessSweep(reason);
  }, 2_000);
}

async function runScheduledLivenessSweep(reason = 'scheduled') {
  if (livenessSweepPromise) {
    console.log(`[liveness-scheduler] Sweep already running; skipped ${reason}`);
    return livenessSweepPromise;
  }

  livenessSweepPromise = (async () => {
    try {
      console.log(`[liveness-scheduler] Starting Jobs to Consider sweep (${reason})`);
      broadcast('jobs_to_consider_liveness_started', { reason });
      const summary = await runLivenessSweep({ now: new Date() });
      const dashboard = syncArtifactsToDashboard({ notify: true }).dashboard;
      triggerSync();
      livenessFailureCount = 0;
      broadcast('jobs_to_consider_liveness_completed', {
        reason,
        summary,
        total: dashboard.total,
      });
      return summary;
    } catch (err) {
      livenessFailureCount += 1;
      console.warn(`[liveness-scheduler] Sweep failed: ${err.message}`);
      broadcast('jobs_to_consider_liveness_failed', { reason, error: err.message });
      return null;
    } finally {
      livenessSweepPromise = null;
      scheduleNextLivenessSweep('after sweep');
    }
  })();

  return livenessSweepPromise;
}

function startLivenessScheduler() {
  if (livenessSchedulerStarted) return;
  livenessSchedulerStarted = true;
  scheduleNextLivenessSweep('server start');
}

const jobStore = new JobStore(join(DATA_DIR, 'jobs.json'), (type, payload) => broadcast(type, payload));
const taskQueue = new AgentTaskQueue(join(DATA_DIR, 'agent-tasks.ndjson'));
const actionPlan = new ActionPlanStore(join(DATA_DIR, 'action-plan.json'));
const actionRegistry = createActionRegistry({ baseDir: BASE, repoRoot: CAREER_OPS, dataDir: DATA_DIR });

try {
  syncArtifactsToDashboard();
} catch (err) {
  console.warn(`[artifact-sync] startup sync failed: ${err.message}`);
}

// ── Local command/control API ─────────────────────────────────────────

app.get('/api/actions', (req, res) => {
  res.json({ actions: listActions(actionRegistry) });
});

app.post('/api/actions/:action', async (req, res) => {
  try {
    const job = await runAction({
      registry: actionRegistry,
      jobStore,
      actionId: req.params.action,
      input: req.body || {},
    });
    res.status(202).json({ job });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/jobs', (req, res) => {
  res.json({ jobs: jobStore.list() });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobStore.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json({ job });
});

app.get('/api/source-health', (req, res) => {
  const health = summarizeSourceHealth({
    registryPath: join(BASE, 'config', 'source-registry.json'),
    statePath: join(DATA_DIR, 'source-state.json'),
    jobsPath: join(DATA_DIR, 'fusion-jobs.json'),
    phdPath: join(DATA_DIR, 'phd-opportunities.json'),
  });
  res.json(health);
});

app.get('/api/contacts', (req, res) => {
  const contactsPath = join(BASE, 'config', 'contacts-registry.json');
  if (!existsSync(contactsPath)) return res.json({ contacts: [] });
  res.json(JSON.parse(readFileSync(contactsPath, 'utf-8')));
});

app.get('/api/action-plan', (req, res) => {
  res.json(actionPlan.dashboard());
});

app.patch('/api/action-plan/:id', (req, res) => {
  const result = actionPlan.updateTask(req.params.id, req.body?.action, req.body || {});
  if (!result) return res.status(404).json({ error: 'action item not found' });
  broadcast('action_plan_updated', result);
  res.json(result);
});

app.get('/api/applications/dashboard', (req, res) => {
  try {
    res.json(readDashboardData());
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read dashboard application data' });
  }
});

app.get('/api/jobs-to-consider', (req, res) => {
  try {
    res.json(readConsiderJobs());
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read jobs to consider' });
  }
});

app.post('/api/jobs-to-consider', (req, res) => {
  try {
    const store = upsertConsiderJob(req.body || {});
    const dashboard = syncConsiderJobsToDashboard();
    broadcast('jobs_to_consider_updated', { total: dashboard.total });
    queueLivenessSweep('job created');
    return res.status(201).json(store);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to create job to consider' });
  }
});

app.patch('/api/jobs-to-consider/:id', (req, res) => {
  try {
    const result = patchConsiderJob(req.params.id, req.body || {});
    const dashboard = syncConsiderJobsToDashboard();
    broadcast('jobs_to_consider_updated', { id: result.job.id, total: dashboard.total });
    if (req.body?.url || req.body?.status) queueLivenessSweep('job updated');
    return res.json(result);
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to update job to consider' });
  }
});

app.delete('/api/jobs-to-consider/:id', (req, res) => {
  try {
    const result = deleteConsiderJob(req.params.id);
    const dashboard = syncConsiderJobsToDashboard();
    triggerSync();
    broadcast('jobs_to_consider_deleted', { id: result.job.id, total: dashboard.total });
    broadcast('jobs_to_consider_updated', { id: result.job.id, total: dashboard.total });
    return res.json({ ...result, total: dashboard.total });
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to delete job to consider' });
  }
});

app.post('/api/jobs-to-consider/:id/apply', (req, res) => {
  try {
    const applied = req.body?.applied !== false;
    const store = readConsiderJobs();
    const job = findConsiderJob(req.params.id, store);
    if (!job) return res.status(404).json({ error: 'job not found' });

    if (!applied) {
      if (job.application_num) {
        try {
          deleteTrackerRow({ num: Number(job.application_num) });
        } catch (err) {
          if (!/not found/i.test(err?.message || '')) throw err;
        }
      }
      const result = patchConsiderJob(job.id, {
        status: 'to_consider',
        applied: false,
        application_num: null,
        applied_at: '',
      });
      const dashboard = syncConsiderJobsToDashboard();
      triggerSync();
      broadcast('jobs_to_consider_updated', { id: result.job.id, total: dashboard.total });
      broadcast('application_deleted', { num: job.application_num || null });
      return res.json({ job: result.job, application: null });
    }

    const reportPath = job.resources?.report_md || '';
    const report = reportPath
      ? `[${job.id.replace(/-/g, ' ')}](${reportPath})`
      : '-';
    const trackerResult = createTrackerRow({
      entry: {
        date: new Date().toISOString().slice(0, 10),
        company: job.company,
        role: job.title,
        score: job.score || 'N/A',
        status: 'Applied',
        pdf: Boolean(job.resources?.resume_pdf),
        report,
        notes: job.notes || job.fit_summary || 'Promoted from Jobs to Consider.',
      },
      metadata: {
        posting_url: job.url,
        way_to_apply: job.resources?.email_draft || '',
      },
    });

    const result = patchConsiderJob(job.id, {
      status: 'applied',
      applied: true,
      application_num: trackerResult.num,
      applied_at: new Date().toISOString(),
    });
    const dashboard = syncConsiderJobsToDashboard();
    triggerSync();
    broadcast('jobs_to_consider_updated', { id: result.job.id, total: dashboard.total });
    broadcast('application_updated', {
      num: trackerResult.num,
      created: !trackerResult.duplicate,
      duplicate: trackerResult.duplicate,
    });
    return res.json({ job: result.job, application: trackerResult });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to update applied state' });
  }
});

app.post('/api/applications', (req, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const allowed = new Set([...TRACKER_EDITABLE_FIELDS, ...TRACKER_METADATA_FIELDS, 'position']);
    const unknown = Object.keys(payload).filter(field => !allowed.has(field));
    if (unknown.length) {
      return res.status(400).json({ error: `unsupported fields: ${unknown.join(', ')}` });
    }

    const core = {};
    const metadata = {};
    for (const [field, value] of Object.entries(payload)) {
      if (TRACKER_EDITABLE_FIELDS.includes(field)) core[field] = value;
      if (TRACKER_METADATA_FIELDS.includes(field)) metadata[field] = value;
      if (field === 'position') core.role = value;
    }

    const result = createTrackerRow({ entry: core, metadata });
    triggerSync();
    broadcast('application_updated', { num: result.num, created: !result.duplicate, duplicate: result.duplicate });
    return res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to create application' });
  }
});

app.patch('/api/applications/:num', (req, res) => {
  try {
    const num = Number.parseInt(req.params.num, 10);
    if (!Number.isInteger(num) || num <= 0) {
      return res.status(400).json({ error: 'invalid application id' });
    }

    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const allowed = new Set([...TRACKER_EDITABLE_FIELDS, ...TRACKER_METADATA_FIELDS, 'position']);
    const unknown = Object.keys(payload).filter(field => !allowed.has(field));
    if (unknown.length) {
      return res.status(400).json({ error: `unsupported fields: ${unknown.join(', ')}` });
    }

    const core = {};
    const metadata = {};
    for (const [field, value] of Object.entries(payload)) {
      if (TRACKER_EDITABLE_FIELDS.includes(field)) core[field] = value;
      if (TRACKER_METADATA_FIELDS.includes(field)) metadata[field] = value;
      if (field === 'position') core.role = value;
    }

    const result = Object.keys(core).length
      ? updateTrackerRow({ num, updates: core })
      : { num, changed: false, updated_fields: [], entry: null };
    const metaResult = Object.keys(metadata).length
      ? updateTrackerMetadata({ num, updates: metadata })
      : { changed: false, updated_fields: [], metadata: readDashboardData().entries[String(num)] || {} };

    if (result.changed || metaResult.changed) {
      triggerSync();
      broadcast('application_updated', {
        num,
        updated_fields: [...result.updated_fields, ...metaResult.updated_fields],
      });
    }

    return res.json({ ...result, metadata: metaResult.metadata, changed: result.changed || metaResult.changed });
  } catch (err) {
    const message = err?.message || 'failed to update application';
    const status = /not found/i.test(message) ? 404 : 400;
    return res.status(status).json({ error: message });
  }
});

app.delete('/api/applications/:num', (req, res) => {
  try {
    const num = Number.parseInt(req.params.num, 10);
    if (!Number.isInteger(num) || num <= 0) {
      return res.status(400).json({ error: 'invalid application id' });
    }

    const result = deleteTrackerRow({ num });
    triggerSync();
    broadcast('application_deleted', { num });
    return res.json(result);
  } catch (err) {
    const message = err?.message || 'failed to delete application';
    const status = /not found/i.test(message) ? 404 : 400;
    return res.status(status).json({ error: message });
  }
});

app.patch('/api/applications/dashboard/schedule', (req, res) => {
  try {
    const result = updateDashboardSchedule({ updates: req.body || {} });
    broadcast('application_dashboard_updated', { section: 'schedule' });
    res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to update dashboard schedule' });
  }
});

app.get('/api/agent-tasks', (req, res) => {
  res.json({ tasks: taskQueue.list() });
});

app.post('/api/agent-tasks', (req, res) => {
  const task = taskQueue.create(req.body || {});
  broadcast('agent_task_created', { task });
  res.status(201).json({ task });
});

app.patch('/api/agent-tasks/:id', (req, res) => {
  const task = taskQueue.update(req.params.id, req.body || {});
  if (!task) return res.status(404).json({ error: 'task not found' });
  broadcast('agent_task_updated', { task });
  res.json({ task });
});

app.post('/api/outreach/draft', (req, res) => {
  res.json({ draft: buildOutreachDraft(req.body || {}) });
});

// ── File watcher on WEB-TRACKER/data ────────────────────────────────

const watcher = watch(DATA_DIR, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 500 },
});

watcher.on('change', (filePath) => {
  const file = basename(filePath);
  broadcast('data_updated', { file, path: filePath });
});

watcher.on('add', (filePath) => {
  const file = basename(filePath);
  broadcast('data_added', { file, path: filePath });
});

// ── File watcher on career-ops source files (instant sync) ──────────

const careerOpsFiles = [
  join(CAREER_OPS, 'data', 'applications.md'),
  CANONICAL_JOBS_FILE,
  join(CAREER_OPS, 'data', 'pipeline.md'),
  join(CAREER_OPS, 'data', 'scan-history.tsv'),
  join(CAREER_OPS, 'data', 'follow-ups.md'),
];
const reportsGlob = join(CAREER_OPS, 'reports', '*.md');

let syncDebounce = null;
async function triggerSync() {
  if (syncDebounce) return;
  syncDebounce = setTimeout(async () => {
    syncDebounce = null;
    try {
      const { execFile } = await import('child_process');
      execFile('node', [join(BASE, 'adapters', 'sync-all.mjs')], { cwd: BASE, timeout: 30_000 },
        (err, stdout) => {
          if (stdout) process.stdout.write(stdout);
          broadcast('career_ops_synced', { note: 'career-ops data refreshed' });
        });
    } catch {}
  }, 2000);
}

const careerOpsWatcher = watch([...careerOpsFiles, reportsGlob], {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 1000 },
});

careerOpsWatcher.on('change', () => triggerSync());
careerOpsWatcher.on('add', () => triggerSync());

let artifactSyncDebounce = null;
function triggerArtifactResourceSync() {
  if (artifactSyncDebounce) return;
  artifactSyncDebounce = setTimeout(() => {
    artifactSyncDebounce = null;
    try {
      syncArtifactsToDashboard({ notify: true });
    } catch (err) {
      console.warn(`[artifact-sync] output watcher sync failed: ${err.message}`);
    }
  }, 500);
}

const outputWatcherBase = resolve(OUTPUT_DIR);
const outputWatcher = watch(OUTPUT_DIR, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 1000 },
  ignored: (filePath, stats) => {
    if (resolve(filePath) === outputWatcherBase) return false;
    if (stats?.isDirectory?.()) return false;
    return !/\.(pdf|html|md)$/i.test(filePath);
  },
});

outputWatcher.on('change', () => triggerArtifactResourceSync());
outputWatcher.on('add', () => triggerArtifactResourceSync());

// ── Root redirect ───────────────────────────────────────────────────

app.get('/', (req, res) => res.redirect('/dashboard/fusion-pivot-dashboard.html'));

export function startServer(port = PORT, host = HOST) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const server = app.listen(port, host, () => {
      console.log(`\n  Dashboard: http://${host}:${port}`);
      console.log(`  SSE stream: http://${host}:${port}/stream`);
      console.log(`  Data API: http://${host}:${port}/data/<file>.json`);
      console.log(`  Control API: http://${host}:${port}/api/actions\n`);
      startLivenessScheduler();
      settled = true;
      resolve(server);
    });
    server.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

if (process.argv[1]?.endsWith('server.mjs')) {
  await startServer();
}
