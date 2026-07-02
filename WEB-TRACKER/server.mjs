#!/usr/bin/env node
/**
 * server.mjs — Express server with SSE for live dashboard updates
 *
 * Serves the dashboard HTML and JSON data files.
 * Watches WEB-TRACKER/data/ for changes and pushes updates via SSE.
 */

import { loadEnv } from './lib/load-env.mjs';

loadEnv();

import express from 'express';
import { watch } from 'chokidar';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, basename, resolve } from 'path';
import { fileURLToPath } from 'url';
import { ActionPlanStore } from './lib/action-plan.mjs';
import { createActionRegistry, listActions, runAction } from './lib/action-runner.mjs';
import { setActivityAppendedHook } from './lib/activity-log.mjs';
import { bootstrapResearchUserStateFromCanonical } from './lib/research-user-state.mjs';
import {
  logApplicationPatchEvents,
  logApplicationRecordedEvent,
  logJobConsiderPatchEvent,
  logResearchStatusEvent,
} from './lib/dashboard-activity.mjs';
import { syncArtifactResources } from './lib/artifact-resource-sync.mjs';
import { AgentTaskQueue } from './lib/agent-task-queue.mjs';
import { createAutonomyOrchestrator } from './lib/autonomy/orchestrator.mjs';
import { JobStore } from './lib/job-store.mjs';
import { ollamaJsonSanity } from './lib/local-llm/ollama-client.mjs';
import { pullOllamaModel, startOllama } from './lib/local-llm/ollama-runtime.mjs';
import { buildOutreachDraft } from './lib/outreach-drafts.mjs';
import { summarizeSourceHealth } from './lib/source-health.mjs';
import { buildExportBuffer, EXPORT_FORMATS, EXPORT_SCOPES } from './lib/dashboard-export.mjs';
import { buildDailyDigest, sendDailyDigest } from './lib/daily-digest.mjs';
import { smtpConfigFromEnv, validateSmtpConfig } from './lib/mail-sender.mjs';
import { writeDailyActivityCsv } from './lib/daily-activity-csv.mjs';
import {
  DEFAULT_DIGEST_TIMEZONE,
  buildTodaySnapshot,
  getTodayActivity,
  localDateString,
  mergeApplicationMetadata,
} from './lib/today-activity.mjs';
import { run as syncApplications } from './adapters/applications-adapter.mjs';
import {
  CANONICAL_JOBS_FILE,
  deleteConsiderJob,
  findConsiderJob,
  patchConsiderJob,
  readConsiderJobs,
  syncConsiderJobsToDashboard,
  upsertConsiderJob,
} from './lib/jobs-to-consider-store.mjs';
import {
  findResearchProspect,
  patchResearchProspect,
  readResearchProspects,
  syncResearchProspectsToDashboard,
  upsertResearchProspect,
} from './lib/research-prospect-store.mjs';
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
const SSE_HEARTBEAT_MS = 20_000;
const SERVER_KEEP_ALIVE_MS = 5 * 60_000;
const SERVER_HEADERS_TIMEOUT_MS = SERVER_KEEP_ALIVE_MS + 10_000;

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
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
function dashboardStaticHeaders(res, filePath) {
  if (/\.html$/i.test(filePath)) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
}

app.use('/dashboard', express.static(DASHBOARD_DIR, {
  setHeaders: dashboardStaticHeaders,
}));
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

function attachmentDisposition(filename) {
  const safeFilename = String(filename || 'career-ops-export')
    .replace(/[\r\n"]/g, '')
    .replace(/[\\/]/g, '-');
  return `attachment; filename="${safeFilename}"`;
}

function todaySnapshotForResponse() {
  const activity = buildTodaySnapshot({ timeZone: DEFAULT_DIGEST_TIMEZONE });
  writeDailyActivityCsv(activity);
  return {
    date: activity.date,
    timeZone: activity.timeZone,
    summary: activity.summary,
  };
}

function withToday(payload = {}) {
  return {
    ...payload,
    today: todaySnapshotForResponse(),
  };
}

function applicationsPayload() {
  const entries = mergeApplicationMetadata();
  const statusSummary = {};
  for (const entry of entries) {
    const status = String(entry.status || '').toLowerCase();
    statusSummary[status] = (statusSummary[status] || 0) + 1;
  }
  return {
    generated_at: new Date().toISOString(),
    count: entries.length,
    entries,
    status_summary: statusSummary,
  };
}

function parseEmailRecipients(value) {
  if (value === undefined || value === null || value === '') return [];
  const raw = Array.isArray(value) ? value : String(value).split(/[;,]/);
  const recipients = [...new Set(raw.map(item => String(item || '').trim()).filter(Boolean))];
  const invalid = recipients.filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (invalid.length) {
    throw new Error(`invalid recipient email: ${invalid.join(', ')}`);
  }
  return recipients;
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
  res.setHeader('Cache-Control', 'no-store');
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
    'X-Accel-Buffering': 'no',
  });

  res.flushHeaders?.();
  res.write('retry: 5000\n\n');
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  sseClients.add(res);
  const heartbeat = setInterval(() => {
    try {
      res.write(`: keep-alive ${new Date().toISOString()}\n\n`);
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, SSE_HEARTBEAT_MS);
  heartbeat.unref?.();

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

function broadcast(eventType, payload) {
  const data = JSON.stringify({ type: eventType, ...payload, timestamp: new Date().toISOString() });
  for (const client of sseClients) {
    try {
      client.write(`data: ${data}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

setActivityAppendedHook(event => broadcast('activity_updated', event));

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
const autonomy = createAutonomyOrchestrator({
  dataDir: DATA_DIR,
  careerOpsDir: CAREER_OPS,
  taskQueue,
  onEvent: (type, payload) => broadcast(type, payload),
});
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

app.get('/api/today-activity', (req, res) => {
  try {
    const activity = getTodayActivity({
      date: req.query.date,
      timeZone: req.query.timezone,
    });
    writeDailyActivityCsv(activity);
    return res.json(activity);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to build today activity' });
  }
});

app.get('/api/export/:scope', async (req, res) => {
  const scope = req.params.scope;
  const format = String(req.query.format || 'xlsx').toLowerCase();
  if (!EXPORT_SCOPES.has(scope)) return res.status(404).json({ error: `unsupported export scope: ${scope}` });
  if (!EXPORT_FORMATS.has(format)) return res.status(400).json({ error: `unsupported export format: ${format}` });

  try {
    const file = await buildExportBuffer({
      scope,
      format,
      date: req.query.date,
      timeZone: req.query.timezone,
    });
    if (scope === 'today-activity' && file.exportData?.activity) {
      writeDailyActivityCsv(file.exportData.activity);
    }
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', attachmentDisposition(file.filename));
    return res.send(file.buffer);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to export dashboard data' });
  }
});

app.get('/api/daily-digest/smtp-status', (_req, res) => {
  const config = smtpConfigFromEnv();
  const validation = validateSmtpConfig(config);
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '.env');
  return res.json({
    ok: validation.ok,
    missing: validation.missing,
    env_file: envPath,
    env_exists: existsSync(envPath),
    from: config.from || '',
    host: config.host || '',
    user: config.user || '',
    setup_hint: validation.ok
      ? 'SMTP is configured. Use Email Today CSV Now to send.'
      : 'Copy WEB-TRACKER/.env.example to WEB-TRACKER/.env, set SMTP_PASS to a Gmail App Password, then restart the dashboard.',
  });
});

app.post('/api/daily-digest/send', async (req, res) => {
  try {
    const recipients = parseEmailRecipients(req.body?.recipients || req.body?.recipient || req.body?.to);
    const options = {
      date: req.body?.date,
      timeZone: req.body?.timezone,
      recipients: recipients.length ? recipients : undefined,
    };
    if (req.body?.dry_run !== false) {
      const digest = await buildDailyDigest(options);
      return res.json({
        sent: false,
        dry_run: true,
        subject: digest.subject,
        recipients,
        activity: digest.activity,
        attachments: digest.attachments.map(attachment => ({
          filename: attachment.filename,
          contentType: attachment.contentType,
          bytes: attachment.content.length,
        })),
      });
    }

    const result = await sendDailyDigest(options);
    return res.json({ ...result, recipients });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to send daily digest' });
  }
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

app.get('/api/applications', (req, res) => {
  try {
    return res.json(applicationsPayload());
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read applications' });
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
    const updates = req.body || {};
    const result = patchConsiderJob(req.params.id, updates);
    if (updates.status !== undefined || updates.applied !== undefined) {
      logJobConsiderPatchEvent(result.job, updates);
    }
    const dashboard = syncConsiderJobsToDashboard();
    broadcast('jobs_to_consider_updated', { id: result.job.id, total: dashboard.total });
    if (updates.url || updates.status) queueLivenessSweep('job updated');
    return res.json(withToday(result));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to update job to consider' });
  }
});

app.delete('/api/jobs-to-consider/:id', (req, res) => {
  try {
    const result = deleteConsiderJob({ id: req.params.id, ...(req.body || {}) }, CANONICAL_JOBS_FILE, { missingOk: true });
    const dashboard = syncConsiderJobsToDashboard();
    triggerSync();
    const id = result.job?.id || req.params.id;
    broadcast('jobs_to_consider_deleted', { id, missing: Boolean(result.missing), total: dashboard.total });
    broadcast('jobs_to_consider_updated', { id, missing: Boolean(result.missing), total: dashboard.total });
    return res.json({ ...result, total: dashboard.total });
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to delete job to consider' });
  }
});

app.get('/api/research-prospects', (req, res) => {
  try {
    res.json(readResearchProspects());
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read research prospects' });
  }
});

app.post('/api/research-prospects', (req, res) => {
  try {
    const store = upsertResearchProspect(req.body || {});
    const dashboard = syncResearchProspectsToDashboard();
    broadcast('research_prospects_updated', { total: dashboard.total });
    return res.status(201).json(store);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to create research prospect' });
  }
});

app.patch('/api/research-prospects/:id', (req, res) => {
  try {
    const result = patchResearchProspect(req.params.id, req.body || {});
    const dashboard = syncResearchProspectsToDashboard();
    if (req.body?.status) logResearchStatusEvent(result.prospect, 'umich');
    broadcast('research_prospects_updated', { id: result.prospect.id, total: dashboard.total });
    return res.json(withToday(result));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to update research prospect' });
  }
});

app.get('/api/research-prospects/:id', (req, res) => {
  try {
    const prospect = findResearchProspect(req.params.id);
    if (!prospect) return res.status(404).json({ error: 'research prospect not found' });
    return res.json({ prospect });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read research prospect' });
  }
});

app.get('/api/kth-research-prospects', (req, res) => {
  try {
    res.json(readResearchProspects({ institution: 'kth' }));
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read KTH research prospects' });
  }
});

app.post('/api/kth-research-prospects', (req, res) => {
  try {
    const store = upsertResearchProspect({
      ...(req.body || {}),
      institution: req.body?.institution || 'kth',
    }, { institution: 'kth' });
    const dashboard = syncResearchProspectsToDashboard({ institution: 'kth' });
    broadcast('kth_research_prospects_updated', { total: dashboard.total });
    return res.status(201).json(store);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to create KTH research prospect' });
  }
});

app.patch('/api/kth-research-prospects/:id', (req, res) => {
  try {
    const result = patchResearchProspect(req.params.id, req.body || {}, { institution: 'kth' });
    const dashboard = syncResearchProspectsToDashboard({ institution: 'kth' });
    if (req.body?.status) logResearchStatusEvent(result.prospect, 'kth');
    broadcast('kth_research_prospects_updated', { id: result.prospect.id, total: dashboard.total });
    return res.json(withToday(result));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to update KTH research prospect' });
  }
});

app.get('/api/kth-research-prospects/:id', (req, res) => {
  try {
    const prospect = findResearchProspect(req.params.id, { institution: 'kth' });
    if (!prospect) return res.status(404).json({ error: 'KTH research prospect not found' });
    return res.json({ prospect });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read KTH research prospect' });
  }
});

app.get('/api/phd-research-prospects/:source', (req, res) => {
  try {
    res.json(readResearchProspects({ source: req.params.source }));
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read PhD research prospects' });
  }
});

app.post('/api/phd-research-prospects/:source', (req, res) => {
  const source = req.params.source;
  try {
    const store = upsertResearchProspect({
      ...(req.body || {}),
      source,
      institution: req.body?.institution || source,
    }, { source });
    const dashboard = syncResearchProspectsToDashboard({ source });
    broadcast('phd_research_prospects_updated', { source, total: dashboard.total });
    if (source === 'kth') broadcast('kth_research_prospects_updated', { total: dashboard.total });
    return res.status(201).json(store);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to create PhD research prospect' });
  }
});

app.patch('/api/phd-research-prospects/:source/:id', (req, res) => {
  const source = req.params.source;
  try {
    const result = patchResearchProspect(req.params.id, req.body || {}, { source });
    const dashboard = syncResearchProspectsToDashboard({ source });
    if (req.body?.status) logResearchStatusEvent(result.prospect, source);
    broadcast('phd_research_prospects_updated', { source, id: result.prospect.id, total: dashboard.total });
    if (source === 'kth') broadcast('kth_research_prospects_updated', { id: result.prospect.id, total: dashboard.total });
    return res.json(withToday(result));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to update PhD research prospect' });
  }
});

app.get('/api/phd-research-prospects/:source/:id', (req, res) => {
  try {
    const prospect = findResearchProspect(req.params.id, { source: req.params.source });
    if (!prospect) return res.status(404).json({ error: 'PhD research prospect not found' });
    return res.json({ prospect });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read PhD research prospect' });
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
      syncApplications();
      triggerSync();
      broadcast('jobs_to_consider_updated', { id: result.job.id, total: dashboard.total });
      broadcast('application_deleted', { num: job.application_num || null });
      return res.json(withToday({ job: result.job, application: null }));
    }

    const reportPath = job.resources?.report_md || '';
    const report = reportPath
      ? `[${job.id.replace(/-/g, ' ')}](${reportPath})`
      : '-';
    const trackerResult = createTrackerRow({
      entry: {
        date: localDateString(new Date(), DEFAULT_DIGEST_TIMEZONE),
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
        submitted_date: localDateString(new Date(), DEFAULT_DIGEST_TIMEZONE),
        way_to_apply: job.resources?.email_draft || '',
      },
    });

    const result = patchConsiderJob(job.id, {
      status: 'applied',
      applied: true,
      application_num: trackerResult.num,
      applied_at: new Date().toISOString(),
    });
    logJobConsiderPatchEvent(result.job, { applied: true, status: 'applied', application_num: trackerResult.num });
    const dashboard = syncConsiderJobsToDashboard();
    syncApplications();
    triggerSync();
    broadcast('jobs_to_consider_updated', { id: result.job.id, total: dashboard.total });
    broadcast('application_updated', {
      num: trackerResult.num,
      created: !trackerResult.duplicate,
      duplicate: trackerResult.duplicate,
    });
    return res.json(withToday({ job: result.job, application: trackerResult }));
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
    if (String(core.status || '').toLowerCase() === 'applied' && metadata.submitted_date === undefined) {
      metadata.submitted_date = localDateString(new Date(), DEFAULT_DIGEST_TIMEZONE);
    }

    const result = createTrackerRow({ entry: core, metadata });
    if (String(core.status || '').toLowerCase() === 'applied' || metadata.submitted_date) {
      logApplicationRecordedEvent({ num: result.num, core, metadata, payload });
    }
    syncApplications();
    triggerSync();
    broadcast('application_updated', { num: result.num, created: !result.duplicate, duplicate: result.duplicate });
    return res.status(result.duplicate ? 200 : 201).json(withToday(result));
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
    if (String(core.status || '').toLowerCase() === 'applied' && metadata.submitted_date === undefined) {
      metadata.submitted_date = localDateString(new Date(), DEFAULT_DIGEST_TIMEZONE);
    }

    const result = Object.keys(core).length
      ? updateTrackerRow({ num, updates: core })
      : { num, changed: false, updated_fields: [], entry: null };
    const metaResult = Object.keys(metadata).length
      ? updateTrackerMetadata({ num, updates: metadata })
      : { changed: false, updated_fields: [], metadata: readDashboardData().entries[String(num)] || {} };

    if (result.changed || metaResult.changed) {
      logApplicationPatchEvents({
        num,
        core,
        metadata: { ...metaResult.metadata, ...metadata },
        entry: result.entry || {},
        payload,
      });
      syncApplications();
      triggerSync();
      broadcast('application_updated', {
        num,
        updated_fields: [...result.updated_fields, ...metaResult.updated_fields],
      });
    }

    const entry = applicationsPayload().entries.find(item => Number(item.num) === num) || result.entry;
    return res.json(withToday({ ...result, entry, metadata: metaResult.metadata, changed: result.changed || metaResult.changed }));
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
    syncApplications();
    triggerSync();
    broadcast('application_deleted', { num });
    return res.json(withToday(result));
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

app.get('/api/autonomy/model-health', async (req, res) => {
  try {
    res.json(await autonomy.modelHealth());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/autonomy/model/start', async (req, res) => {
  try {
    res.json(await startOllama());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/autonomy/model/pull', async (req, res) => {
  try {
    res.json(await pullOllamaModel(req.body?.model || null));
  } catch (err) {
    res.status(400).json({ error: err.stderr || err.message });
  }
});

app.post('/api/autonomy/model/json-sanity', async (req, res) => {
  try {
    res.json({ ok: true, result: await ollamaJsonSanity({ model: req.body?.model || null }) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/autonomy/research-budget', (req, res) => {
  res.json(autonomy.researchBudget());
});

app.get('/api/autonomy/runs', (req, res) => {
  res.json({ runs: autonomy.listRuns(25) });
});

app.post('/api/autonomy/run-pending', (req, res) => {
  const input = req.body || {};
  const job = jobStore.create('process_ai_queue', input, {
    label: 'Process AI queue autonomously',
    description: 'Run queued tasks through Parallel research and local AI reasoning.',
  });
  jobStore.update(job.id, { status: 'running' });
  queueMicrotask(async () => {
    try {
      const result = await autonomy.runPending({
        maxTasks: input.max_tasks || input.max || 1,
        pollTimeoutSec: input.poll_timeout || input.poll_timeout_sec || 120,
        researchOnly: Boolean(input.research_only),
      });
      jobStore.appendLog(job.id, 'stdout', JSON.stringify(result, null, 2));
      jobStore.finish(job.id, 0);
      broadcast('autonomy_updated', result);
    } catch (err) {
      jobStore.appendLog(job.id, 'stderr', err.message);
      jobStore.finish(job.id, 1, err.message);
    }
  });
  res.status(202).json({ job });
});

app.post('/api/autonomy/tasks/:id/approve', async (req, res) => {
  try {
    const result = await autonomy.approveTask(req.params.id);
    broadcast('agent_task_updated', { task: result.task });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/autonomy/tasks/:id/reject', (req, res) => {
  try {
    const result = autonomy.rejectTask(req.params.id, req.body?.reason || 'Rejected by user.');
    broadcast('agent_task_updated', { task: result.task });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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

app.get('/healthz', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    mode: process.env.AUTONOMY_MODE || 'unknown',
    uptime_sec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => res.redirect('/dashboard/fusion-pivot-dashboard.html'));

export function startServer(port = PORT, host = HOST) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const server = app.listen(port, host, () => {
      const migrated = bootstrapResearchUserStateFromCanonical();
      if (migrated > 0) {
        console.log(`[boot] Migrated ${migrated} research prospect status(es) into user-state overlay`);
      }
      console.log(`\n  Dashboard: http://${host}:${port}`);
      console.log(`  SSE stream: http://${host}:${port}/stream`);
      console.log(`  Data API: http://${host}:${port}/data/<file>.json`);
      console.log(`  Control API: http://${host}:${port}/api/actions\n`);
      if (!['1', 'true', 'yes'].includes(String(process.env.PUBLISH_SNAPSHOT || '').toLowerCase())) {
        startLivenessScheduler();
      }
      settled = true;
      resolve(server);
    });
    server.keepAliveTimeout = SERVER_KEEP_ALIVE_MS;
    server.headersTimeout = SERVER_HEADERS_TIMEOUT_MS;
    server.requestTimeout = 0;
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
