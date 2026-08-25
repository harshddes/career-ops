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
import { compactJson, encodeCompressedBody } from './lib/http-compress.mjs';
import {
  maybeProjectFeed,
  projectEuraxessListStore,
  projectPhdscannerListStore,
  projectResearchListStore,
  projectUmichListStore,
  projectJobsListStore,
} from './lib/feed-list-projection.mjs';
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
  logNetworkingActivity,
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
import { writeDailyActivityCsv } from './lib/daily-activity-csv.mjs';
import {
  DEFAULT_DIGEST_TIMEZONE,
  getCachedTodayActivity,
  invalidateTodayActivityCache,
  localDateString,
  mergeApplicationMetadata,
  peekCachedTodayActivity,
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
  assertConsiderJobApplyAllowed,
  enrichConsiderJobWithNetworking,
  enrichConsiderJobsStore,
  queueNetworkingForConsiderJob,
  unlinkCanceledResearchOrder,
} from './lib/jobs-networking-bridge.mjs';
import {
  findResearchProspect,
  patchResearchProspect,
  readResearchProspects,
  upsertResearchProspect,
} from './lib/research-prospect-store.mjs';
import {
  findEuraxessOpportunity,
  patchEuraxessOpportunity,
  readEuraxessOpportunities,
} from './lib/euraxess/opportunity-store.mjs';
import {
  EURAXESS_EXECUTION_STAGES,
  EURAXESS_TOPIC_LABELS,
  euraxessHasArtifacts,
  euraxessTopic,
} from './lib/euraxess/filters.mjs';
import {
  euraxessFactoryStatus,
  queueEuraxessOpportunityWork,
} from './lib/euraxess/factory.mjs';
import {
  findPhdscannerOpportunity,
  patchPhdscannerOpportunity,
  readPhdscannerOpportunities,
} from './lib/phdscanner/opportunity-store.mjs';
import {
  archiveUmichOpportunity,
  ensureUmichDashboardProjection,
  findUmichOpportunity,
  patchUmichOpportunity,
  readUmichOpportunities,
  unarchiveUmichOpportunity,
} from './lib/umich-careers/opportunity-store.mjs';
import { assertCanArchiveOpportunity } from './lib/protected-domain.mjs';
import {
  PHDSCANNER_EXECUTION_STAGES,
  PHDSCANNER_TOPIC_LABELS,
  phdscannerTopic,
} from './lib/phdscanner/filters.mjs';
import {
  phdscannerFactoryStatus,
  queuePhdscannerOpportunityWork,
} from './lib/phdscanner/factory.mjs';
import {
  findExhibitorCompany,
  patchExhibitorCompany,
  readExhibitorCompanies,
  syncExhibitorCompaniesToDashboard,
} from './lib/exhibitor/company-store.mjs';
import {
  exhibitorFactoryStatus,
  queueExhibitorCompanyWork,
  readExhibitorClearQueue,
  refreshExhibitorClearQueueStatus,
} from './lib/exhibitor/factory.mjs';
import {
  appendNetworkingInteraction,
  buildNetworkingReadModel,
  deleteNetworkingPerson,
  patchNetworkingPerson,
  patchNetworkingTask,
  readNetworking,
  reviewNetworkingPerson,
  syncNetworkingToDashboard,
  upsertNetworkingEdge,
  upsertNetworkingEvent,
  upsertNetworkingOrganization,
  upsertNetworkingPerson,
  upsertNetworkingTask,
} from './lib/networking/store.mjs';
import {
  cancelNetworkingResearch,
  completeNetworkingResearch,
  markNetworkingResearchInProgress,
  markNetworkingResearchReviewReady,
  queueNetworkingResearch,
  readNetworkingResearchQueue,
} from './lib/networking/factory.mjs';
import {
  advanceCompanyFocus,
  buildCompanyFocusReadModel,
  pinCompanyFocus,
  readCompanyFocus,
  syncCompanyFocusToDashboard,
  updateCompanyFocus,
} from './lib/company-focus.mjs';
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

import { eventLoopDelaySnapshot } from './lib/event-loop-monitor.mjs';
import { CAREER_DATA_DIR, FAT_JSON_FILES, fatJsonTable } from './lib/data-paths.mjs';
import { LIVE_TABLES, liveDataDir, liveEngineName, liveRowCount, readLiveOrImport } from './lib/db.mjs';
import { factoryWorkerArgs, spawnNodeJob } from './lib/spawn-job.mjs';
import { nodeScriptInvocation } from './lib/node-exec.mjs';
import { smtpConfigFromEnv, validateSmtpConfig } from './lib/mail-sender.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(BASE, 'data');
const RUNTIME_DIR = join(BASE, 'runtime');
const DASHBOARD_DIR = join(BASE, 'dashboard');
const RESEARCH_DIR = join(BASE, 'research');
const PORT = process.env.PORT || 3737;
const HOST = process.env.HOST || '127.0.0.1';
const CAREER_OPS = join(BASE, '..');
const OUTPUT_DIR = join(CAREER_OPS, 'output');
const REPORTS_DIR = join(CAREER_OPS, 'reports');
const SOURCE_REGISTRY_FILE = join(BASE, 'config', 'source-registry.json');
const DEFAULT_LIVENESS_INTERVAL_MIN = 8 * 60;
const MIN_LIVENESS_INTERVAL_MIN = 15;
const MAX_TIMER_DELAY_MS = 2_147_000_000;
const SSE_HEARTBEAT_MS = 20_000;
const SERVER_KEEP_ALIVE_MS = 5 * 60_000;
const SERVER_HEADERS_TIMEOUT_MS = SERVER_KEEP_ALIVE_MS + 10_000;

const app = express();
app.set('json spaces', 0);

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

app.use((req, res, next) => {
  res.json = (value) => {
    const body = compactJson(value);
    const { payload, encoding } = encodeCompressedBody(body, req.headers['accept-encoding']);
    const vary = new Set(String(res.getHeader('Vary') || '').split(',').map(part => part.trim()).filter(Boolean));
    vary.add('Origin');
    vary.add('Accept-Encoding');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Vary', [...vary].join(', '));
    if (encoding) res.setHeader('Content-Encoding', encoding);
    res.setHeader('Content-Length', payload.length);
    return res.end(payload);
  };
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
app.use('/reports', express.static(REPORTS_DIR, {
  index: false,
  fallthrough: false,
}));
app.use('/runtime', express.static(RUNTIME_DIR, {
  index: false,
  fallthrough: false,
}));
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

function todaySnapshotForResponse({ refresh = false } = {}) {
  if (refresh) {
    invalidateTodayActivityCache();
    const activity = getCachedTodayActivity({ timeZone: DEFAULT_DIGEST_TIMEZONE });
    return {
      date: activity.date,
      timeZone: activity.timeZone,
      summary: activity.summary,
    };
  }
  const cached = peekCachedTodayActivity({ timeZone: DEFAULT_DIGEST_TIMEZONE });
  return {
    date: cached?.date || localDateString(new Date(), DEFAULT_DIGEST_TIMEZONE),
    timeZone: cached?.timeZone || DEFAULT_DIGEST_TIMEZONE,
    summary: cached?.summary || null,
  };
}

function withToday(payload = {}, options = {}) {
  const rest = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'store'))
    : payload;
  return {
    ...rest,
    today: todaySnapshotForResponse(options),
  };
}

function opportunityTotal(result, table = 'euraxess_opportunities') {
  return liveRowCount(table) || result?.store?.opportunities?.length || 0;
}

function jobsTotal(result) {
  return liveRowCount('jobs_to_consider')
    || result?.store?.jobs?.length
    || result?.jobs?.length
    || 0;
}

function syncProspectsAfterPatch(result) {
  return { total: result?.store?.prospects?.length || 0 };
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
  const table = fatJsonTable(req.params.file);
  if (table && LIVE_TABLES[table]) {
    const jsonFile = LIVE_TABLES[table].jsonFile;
    try {
      return res.json(readLiveOrImport(table, join(CAREER_DATA_DIR, jsonFile)));
    } catch (err) {
      return res.status(400).json({ error: err?.message || 'failed to read live store' });
    }
  }
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

setActivityAppendedHook(event => {
  invalidateTodayActivityCache();
  broadcast('activity_updated', event);
});

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
  return !['1', 'true', 'yes', 'on', 'enabled'].includes(
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
      const { execFile } = await import('child_process');
      const summary = await new Promise((resolve, reject) => {
        execFile(process.execPath, nodeScriptInvocation(join(BASE, 'jobs-to-consider-liveness.mjs')), {
          cwd: BASE,
          timeout: 15 * 60_000,
          windowsHide: true,
        }, (err, stdout = '', stderr = '') => {
          if (err) {
            err.message = `${err.message}${stderr ? `\n${stderr.trim()}` : ''}`;
            reject(err);
            return;
          }
          const lines = stdout.trim().split('\n').filter(Boolean);
          resolve({ output: lines.at(-1) || 'liveness sweep completed' });
        });
      });
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
    const activity = getCachedTodayActivity({
      date: req.query.date,
      timeZone: req.query.timezone,
    });
    return res.json(activity);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to build today activity' });
  }
});

app.get('/api/export/:scope', async (req, res) => {
  const { buildExportBuffer, EXPORT_FORMATS, EXPORT_SCOPES } = await import('./lib/dashboard-export.mjs');
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
    recipients: config.recipients || [],
    timezone: process.env.DAILY_DIGEST_TIMEZONE || process.env.TZ || 'America/New_York',
    enabled: ['1', 'true', 'yes', 'y', 'on'].includes(String(process.env.DAILY_DIGEST_ENABLED || '').trim().toLowerCase()),
    setup_hint: validation.ok
      ? `SMTP is configured. Nightly digest + manual Email Today CSV go to: ${(config.recipients || []).join(', ') || 'no recipients'}.`
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
      const { buildDailyDigest } = await import('./lib/daily-digest.mjs');
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

    const { sendDailyDigest } = await import('./lib/daily-digest.mjs');
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
    res.json(maybeProjectFeed(req, enrichConsiderJobsStore(readConsiderJobs()), projectJobsListStore));
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read jobs to consider' });
  }
});

app.post('/api/jobs-to-consider', (req, res) => {
  try {
    const store = upsertConsiderJob(req.body || {});
    broadcast('jobs_to_consider_updated', { total: jobsTotal(store) });
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
    broadcast('jobs_to_consider_updated', { id: result.job.id, total: jobsTotal(result) });
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
    triggerSync();
    const id = result.job?.id || req.params.id;
    const total = jobsTotal(result);
    broadcast('jobs_to_consider_deleted', { id, missing: Boolean(result.missing), total });
    broadcast('jobs_to_consider_updated', { id, missing: Boolean(result.missing), total });
    return res.json({ ...result, total });
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to delete job to consider' });
  }
});

function publishNetworkingUpdate(payload = {}) {
  const dashboard = syncNetworkingToDashboard();
  broadcast('networking_updated', { ...payload, summary: dashboard.summary });
  return dashboard;
}

app.get('/api/networking', (_req, res) => {
  try {
    const focus = readCompanyFocus();
    return res.json(buildNetworkingReadModel(readNetworking(), new Date(), {
      focus_organization_id: focus.organization_id,
    }));
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read networking data' });
  }
});

app.post('/api/networking/organizations', (req, res) => {
  try {
    const result = upsertNetworkingOrganization(req.body || {});
    publishNetworkingUpdate({ organization_id: result.organization.id });
    logNetworkingActivity({ action: 'organization_saved', organization: result.organization });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to save networking organization' });
  }
});

app.post('/api/networking/people', (req, res) => {
  try {
    const result = upsertNetworkingPerson(req.body || {});
    publishNetworkingUpdate({ person_id: result.person.id });
    logNetworkingActivity({ action: 'person_saved', person: result.person });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to save networking person' });
  }
});

app.patch('/api/networking/people/:id', (req, res) => {
  try {
    const result = patchNetworkingPerson(req.params.id, req.body || {});
    publishNetworkingUpdate({ person_id: result.person.id });
    logNetworkingActivity({
      action: req.body?.relationship_stage ? 'relationship_stage_changed' : 'person_updated',
      person: result.person,
    });
    return res.json(withToday(result));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to update networking person' });
  }
});

app.patch('/api/networking/people/:id/review', (req, res) => {
  try {
    const result = reviewNetworkingPerson(req.params.id, req.body?.action);
    publishNetworkingUpdate({ person_id: result.person.id, review_status: result.person.review_status });
    logNetworkingActivity({
      action: result.person.review_status === 'approved' ? 'candidate_approved' : 'candidate_rejected',
      person: result.person,
    });
    return res.json(result);
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to review networking candidate' });
  }
});

app.delete('/api/networking/people/:id', (req, res) => {
  try {
    const result = deleteNetworkingPerson(req.params.id);
    publishNetworkingUpdate({ person_id: result.person.id, deleted: true });
    logNetworkingActivity({ action: 'person_deleted', person: result.person });
    return res.json(result);
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to delete networking person' });
  }
});

app.post('/api/networking/interactions', (req, res) => {
  try {
    const result = appendNetworkingInteraction(req.body || {});
    publishNetworkingUpdate({ person_id: result.person.id, interaction_id: result.interaction.id });
    logNetworkingActivity({
      action: 'interaction_logged',
      person: result.person,
      interaction: result.interaction,
    });
    return res.status(201).json(withToday(result));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to log networking interaction' });
  }
});

app.post('/api/networking/tasks', (req, res) => {
  try {
    const result = upsertNetworkingTask(req.body || {});
    publishNetworkingUpdate({ task_id: result.task.id });
    logNetworkingActivity({ action: 'task_saved', task: result.task });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to save networking task' });
  }
});

app.patch('/api/networking/tasks/:id', (req, res) => {
  try {
    const result = patchNetworkingTask(req.params.id, req.body || {});
    publishNetworkingUpdate({ task_id: result.task.id });
    logNetworkingActivity({
      action: result.task.state === 'completed' ? 'task_completed' : 'task_updated',
      task: result.task,
    });
    return res.json(result);
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to update networking task' });
  }
});

app.post('/api/networking/edges', (req, res) => {
  try {
    const result = upsertNetworkingEdge(req.body || {});
    publishNetworkingUpdate({ edge_id: result.edge.id });
    logNetworkingActivity({ action: 'path_saved', notes: result.edge.notes });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to save networking path' });
  }
});

app.post('/api/networking/events', (req, res) => {
  try {
    const result = upsertNetworkingEvent(req.body || {});
    publishNetworkingUpdate({ event_id: result.event.id });
    logNetworkingActivity({ action: 'event_saved', notes: result.event.name });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to save networking event' });
  }
});

app.get('/api/company-focus', (_req, res) => {
  try {
    return res.json(buildCompanyFocusReadModel({ focus: readCompanyFocus() }));
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read company focus' });
  }
});

app.put('/api/company-focus', (req, res) => {
  try {
    const result = updateCompanyFocus(req.body || {});
    broadcast('company_focus_updated', {
      organization_id: result.organization_id,
      playbook_step: result.playbook_step,
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to update company focus' });
  }
});

app.post('/api/company-focus/pin', (req, res) => {
  try {
    const result = pinCompanyFocus(req.body || {});
    broadcast('company_focus_updated', {
      organization_id: result.organization_id,
      playbook_step: result.playbook_step,
    });
    return res.status(201).json(result);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to pin company focus' });
  }
});

app.post('/api/company-focus/advance', (req, res) => {
  try {
    const result = advanceCompanyFocus(req.body || {});
    syncCompanyFocusToDashboard();
    broadcast('company_focus_updated', {
      organization_id: result.organization_id,
      playbook_step: result.playbook_step,
      next_action_type: result.next_action?.type,
    });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to advance company focus' });
  }
});

app.get('/api/networking/research-queue', (_req, res) => {
  try {
    return res.json(readNetworkingResearchQueue());
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read networking research queue' });
  }
});

app.post('/api/networking/research-queue', (req, res) => {
  try {
    const result = queueNetworkingResearch(req.body || {});
    broadcast('networking_research_queue_updated', { pending_count: result.queue.pending_count });
    logNetworkingActivity({ action: 'research_queued', notes: result.order.organization_name });
    return res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to queue networking research' });
  }
});

app.patch('/api/networking/research-queue/:id', (req, res) => {
  try {
    const action = req.body?.action;
    let result;
    if (action === 'start') result = markNetworkingResearchInProgress(req.params.id);
    else if (action === 'review_ready') result = markNetworkingResearchReviewReady(req.params.id, req.body?.candidate_person_ids || []);
    else if (action === 'complete') result = completeNetworkingResearch(req.params.id);
    else if (action === 'fail') result = completeNetworkingResearch(req.params.id, { failed: true, error: req.body?.error || '' });
    else if (action === 'cancel') {
      result = cancelNetworkingResearch(req.params.id);
      unlinkCanceledResearchOrder(result.order);
      syncConsiderJobsToDashboard();
      logNetworkingActivity({ action: 'research_canceled', notes: result.order.organization_name });
    }
    else throw new Error('networking research queue action must be start, review_ready, complete, fail, or cancel');
    broadcast('networking_research_queue_updated', { pending_count: result.queue.pending_count, order_id: result.order.id });
    if (action === 'cancel') broadcast('jobs_to_consider_updated', { reason: 'research_canceled' });
    return res.json(result);
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to update networking research order' });
  }
});

app.get('/api/research-prospects', (req, res) => {
  try {
    res.json(maybeProjectFeed(req, readResearchProspects(), projectResearchListStore));
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read research prospects' });
  }
});

app.post('/api/research-prospects', (req, res) => {
  try {
    const store = upsertResearchProspect(req.body || {});
    broadcast('research_prospects_updated', { total: store.prospects?.length || 0 });
    return res.status(201).json(store);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to create research prospect' });
  }
});

app.patch('/api/research-prospects/:id', (req, res) => {
  try {
    const result = patchResearchProspect(req.params.id, req.body || {});
    const dashboard = syncProspectsAfterPatch(result);
    if (req.body?.status) logResearchStatusEvent(result.prospect, 'umich');
    broadcast('research_prospects_updated', { id: result.prospect.id, total: dashboard.total });
    return res.json(withToday(result, { refresh: Boolean(req.body?.status) }));
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
    res.json(maybeProjectFeed(req, readResearchProspects({ institution: 'kth' }), projectResearchListStore));
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
    broadcast('kth_research_prospects_updated', { total: store.prospects?.length || 0 });
    return res.status(201).json(store);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to create KTH research prospect' });
  }
});

app.patch('/api/kth-research-prospects/:id', (req, res) => {
  try {
    const result = patchResearchProspect(req.params.id, req.body || {}, { institution: 'kth' });
    const dashboard = syncProspectsAfterPatch(result);
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
    res.json(maybeProjectFeed(req, readResearchProspects({ source: req.params.source }), projectResearchListStore));
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
    broadcast('phd_research_prospects_updated', { source, total: store.prospects?.length || 0 });
    if (source === 'kth') broadcast('kth_research_prospects_updated', { total: store.prospects?.length || 0 });
    return res.status(201).json(store);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to create PhD research prospect' });
  }
});

app.patch('/api/phd-research-prospects/:source/:id', (req, res) => {
  const source = req.params.source;
  try {
    const result = patchResearchProspect(req.params.id, req.body || {}, { source });
    const dashboard = syncProspectsAfterPatch(result, { source });
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

app.get('/api/euraxess/opportunities', (req, res) => {
  try {
    res.json(maybeProjectFeed(req, readEuraxessOpportunities(), projectEuraxessListStore));
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read EURAXESS opportunities' });
  }
});

app.get('/api/euraxess/health', (_req, res) => {
  try {
    const store = readEuraxessOpportunities();
    res.json({
      generated_at: new Date().toISOString(),
      ...store.scan_summary,
    });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read EURAXESS health' });
  }
});

app.get('/api/euraxess/factory/status', async (_req, res) => {
  try {
    res.json(await euraxessFactoryStatus());
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read EURAXESS factory status' });
  }
});

app.post('/api/euraxess/factory/run', (req, res) => {
  const input = req.body || {};
  const job = jobStore.create('euraxess_factory_run', input, {
    label: 'Run EURAXESS factory',
    description: 'Process queued/high-fit EURAXESS opportunities through research and draft artifact gates.',
  });
  spawnNodeJob({
    jobStore,
    job,
    baseDir: BASE,
    script: 'euraxess-factory-worker.mjs',
    args: factoryWorkerArgs(input),
    timeoutMs: 10 * 60_000,
    onSuccess: () => {
      broadcast('euraxess_factory_updated', { job_id: job.id });
      broadcast('euraxess_opportunities_updated', { total: readEuraxessOpportunities().opportunities?.length || 0 });
    },
    onFail: (err) => {
      broadcast('euraxess_factory_failed', { error: err?.message || String(err) });
    },
  });
  res.status(202).json({ job, queued: true });
});

app.get('/api/exhibitor/companies', (_req, res) => {
  try {
    res.json(readExhibitorCompanies());
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read exhibitor companies' });
  }
});

app.get('/api/exhibitor/clear-queue', (_req, res) => {
  try {
    res.json(readExhibitorClearQueue());
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read exhibitor clear-queue' });
  }
});

app.get('/api/exhibitor/factory/status', (_req, res) => {
  try {
    res.json(exhibitorFactoryStatus());
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read exhibitor factory status' });
  }
});

app.post('/api/exhibitor/factory/run', (req, res) => {
  const input = req.body || {};
  const job = jobStore.create('exhibitor_factory_run', input, {
    label: 'Process Target Companies exhibitor queue',
    description: 'Promote queued exhibitor research work orders for Cursor clear-queue.',
  });
  spawnNodeJob({
    jobStore,
    job,
    baseDir: BASE,
    script: 'exhibitor-factory-worker.mjs',
    args: factoryWorkerArgs({ ...input, max: input.max || 20 }),
    timeoutMs: 10 * 60_000,
    onSuccess: () => {
      broadcast('exhibitor_factory_updated', { job_id: job.id });
      broadcast('exhibitor_companies_updated', { total: readExhibitorCompanies().companies?.length || 0 });
    },
    onFail: (err) => {
      broadcast('exhibitor_factory_failed', { error: err?.message || String(err) });
    },
  });
  res.status(202).json({ job, queued: true });
});

app.get('/api/exhibitor/companies/:id', (req, res) => {
  try {
    const company = findExhibitorCompany(req.params.id, readExhibitorCompanies());
    if (!company) return res.status(404).json({ error: 'exhibitor company not found' });
    return res.json({ company });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read exhibitor company' });
  }
});

app.patch('/api/exhibitor/companies/:id', (req, res) => {
  try {
    const result = patchExhibitorCompany(req.params.id, req.body || {});
    syncExhibitorCompaniesToDashboard();
    refreshExhibitorClearQueueStatus();
    broadcast('exhibitor_companies_updated', { id: result.company?.id });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to patch exhibitor company' });
  }
});

app.post('/api/exhibitor/companies/:id/queue-research', (req, res) => {
  try {
    const existing = findExhibitorCompany(req.params.id, readExhibitorCompanies());
    if (!existing) return res.status(404).json({ error: 'exhibitor company not found' });
    const queued = queueExhibitorCompanyWork(existing);
    broadcast('exhibitor_companies_updated', { id: queued.company?.id });
    return res.json({
      company: queued.company,
      task: queued.task,
      clear_queue: queued.clear_queue,
      message: `Queued research for ${queued.company.name}. Hit Process queue, then tell Cursor: Clear the queue in Target Companies.`,
    });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to queue exhibitor research' });
  }
});

app.post('/api/euraxess/scan', (req, res) => {
  const input = req.body || {};
  const args = [];
  if (input.all !== false) args.push('--all');
  if (input.refresh_liveness !== false) args.push('--refresh-liveness');
  if (input.dry_run || input.dryRun) args.push('--dry-run');
  const job = jobStore.create('euraxess_scan', input, {
    label: 'Scan EURAXESS RSS',
    description: 'Refresh the official EURAXESS RSS feed and update the local opportunity store.',
  });
  jobStore.update(job.id, { status: 'running' });
  queueMicrotask(async () => {
    try {
      const { execFile } = await import('child_process');
      const result = await new Promise(resolve => {
        execFile(process.execPath, nodeScriptInvocation(join(BASE, 'euraxess-scan.mjs'), args), {
          cwd: BASE,
          timeout: 5 * 60_000,
          windowsHide: true,
        }, (err, stdout = '', stderr = '') => {
          resolve({ err, stdout, stderr });
        });
      });
      if (result.stdout) jobStore.appendLog(job.id, 'stdout', result.stdout);
      if (result.stderr) jobStore.appendLog(job.id, 'stderr', result.stderr);
      if (result.err) throw result.err;
      jobStore.finish(job.id, 0);
      broadcast('euraxess_opportunities_updated', { total: readEuraxessOpportunities().opportunities?.length || 0 });
    } catch (err) {
      jobStore.appendLog(job.id, 'stderr', err?.stack || err?.message || String(err));
      jobStore.finish(job.id, 1, err?.message || String(err));
      broadcast('euraxess_factory_failed', { error: err?.message || String(err) });
    }
  });
  res.status(202).json({ job });
});

app.post('/api/euraxess/backfill', (req, res) => {
  const input = req.body || {};
  const profile = String(input.profile || 'fusion_plasma_diagnostics');
  const max = String(Number(input.max || 500) || 500);
  const args = ['--profile', profile, '--max', max];
  if (input.force) args.push('--force');
  if (input.dry_run || input.dryRun) args.push('--dry-run');
  const job = jobStore.create('euraxess_backfill', input, {
    label: 'Backfill EURAXESS provider',
    description: 'Import EURAXESS opportunities from configured permitted providers or manual seed files.',
  });
  jobStore.update(job.id, { status: 'running' });
  queueMicrotask(async () => {
    try {
      const { execFile } = await import('child_process');
      const result = await new Promise(resolve => {
        execFile(process.execPath, nodeScriptInvocation(join(BASE, 'euraxess-backfill.mjs'), args), {
          cwd: BASE,
          timeout: 10 * 60_000,
          windowsHide: true,
        }, (err, stdout = '', stderr = '') => {
          resolve({ err, stdout, stderr });
        });
      });
      if (result.stdout) jobStore.appendLog(job.id, 'stdout', result.stdout);
      if (result.stderr) jobStore.appendLog(job.id, 'stderr', result.stderr);
      if (result.err) throw result.err;
      jobStore.finish(job.id, 0);
      broadcast('euraxess_factory_updated', { backfill: true });
      broadcast('euraxess_opportunities_updated', { total: readEuraxessOpportunities().opportunities?.length || 0 });
    } catch (err) {
      jobStore.appendLog(job.id, 'stderr', err?.stack || err?.message || String(err));
      jobStore.finish(job.id, 1, err?.message || String(err));
      broadcast('euraxess_factory_failed', { error: err?.message || String(err) });
    }
  });
  res.status(202).json({ job });
});

app.get('/api/euraxess/opportunities/:id', (req, res) => {
  try {
    const opportunity = findEuraxessOpportunity(req.params.id);
    if (!opportunity) return res.status(404).json({ error: 'EURAXESS opportunity not found' });
    return res.json({ opportunity });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read EURAXESS opportunity' });
  }
});

app.patch('/api/euraxess/opportunities/:id', (req, res) => {
  try {
    const result = patchEuraxessOpportunity(req.params.id, req.body || {});
    broadcast('euraxess_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result) });
    return res.json(withToday(result));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to update EURAXESS opportunity' });
  }
});

app.post('/api/euraxess/opportunities/:id/queue-research', (req, res) => {
  try {
    const result = patchEuraxessOpportunity(req.params.id, {
      worker_status: 'queued_research',
      needs_research: true,
      archived: false,
      visible: true,
      automation: {
        worker_status: 'queued_research',
        current_stage: 'queued_research',
        last_error: '',
        next_retry_at: '',
        runner: 'euraxess-factory',
      },
      notes: req.body?.notes,
    });
    const queued = queueEuraxessOpportunityWork(result.opportunity, { pack: false });
    broadcast('euraxess_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result) });
    return res.json(withToday({
      ...result,
      tasks: queued.tasks || [],
      message: `Queued research for ${result.opportunity.title}. Hit Process queue to run it.`,
    }));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to queue EURAXESS research' });
  }
});

app.post('/api/euraxess/opportunities/:id/queue-application-pack', (req, res) => {
  try {
    const result = patchEuraxessOpportunity(req.params.id, {
      worker_status: 'queued_pack',
      needs_research: true,
      needs_application_pack: true,
      archived: false,
      visible: true,
      automation: {
        worker_status: 'queued_pack',
        current_stage: 'queued_pack',
        last_error: '',
        next_retry_at: '',
        runner: 'euraxess-factory',
      },
      notes: req.body?.notes,
    });
    const queued = queueEuraxessOpportunityWork(result.opportunity, { pack: true });
    broadcast('euraxess_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result) });
    return res.json(withToday({
      ...result,
      tasks: queued.tasks || [],
      message: `Queued application pack for ${result.opportunity.title}. Hit Process queue or clear the Operations agent-task lane.`,
    }));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to queue EURAXESS application pack' });
  }
});

app.post('/api/euraxess/opportunities/:id/archive', (req, res) => {
  try {
    const existing = findEuraxessOpportunity(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: `EURAXESS opportunity not found: ${req.params.id}` });
    }
    const gate = assertCanArchiveOpportunity(existing, { force: Boolean(req.body?.force) });
    if (!gate.allowed) {
      return res.status(409).json({ error: gate.message, ...gate });
    }
    const result = patchEuraxessOpportunity(req.params.id, {
      status: 'archived',
      archived: true,
      visible: false,
      worker_status: 'not_needed',
      needs_research: false,
      needs_application_pack: false,
      automation: {
        worker_status: 'not_needed',
        current_stage: 'applied_or_archived',
        last_error: '',
      },
      decision: {
        archive_reason: req.body?.reason || req.body?.archive_reason || 'Archived from dashboard.',
      },
    });
    broadcast('euraxess_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result) });
    return res.json(withToday({
      ...result,
      message: `Archived: ${result.opportunity.title}`,
    }));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to archive EURAXESS opportunity' });
  }
});

app.post('/api/euraxess/opportunities/:id/retry', (req, res) => {
  try {
    const pack = Boolean(req.body?.pack);
    const result = patchEuraxessOpportunity(req.params.id, {
      worker_status: pack ? 'queued_pack' : 'queued_research',
      needs_research: true,
      needs_application_pack: pack,
      archived: false,
      visible: true,
      automation: {
        worker_status: pack ? 'queued_pack' : 'queued_research',
        current_stage: pack ? 'queued_pack' : 'queued_research',
        next_retry_at: '',
        last_error: '',
        runner: 'euraxess-factory',
      },
    });
    const queued = queueEuraxessOpportunityWork(result.opportunity, { pack });
    broadcast('euraxess_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result) });
    return res.json(withToday({
      ...result,
      tasks: queued.tasks || [],
      message: pack
        ? `Queued application pack for ${result.opportunity.title}. Hit Process queue or clear the Operations agent-task lane.`
        : `Queued research for ${result.opportunity.title}. Hit Process queue to run it.`,
    }));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to retry EURAXESS opportunity' });
  }
});

app.post('/api/euraxess/opportunities/:id/execution', (req, res) => {
  try {
    const existing = findEuraxessOpportunity(req.params.id);
    if (!existing) return res.status(404).json({ error: 'EURAXESS opportunity not found' });
    const body = req.body || {};
    const prev = existing.execution || {};
    let stage = body.stage !== undefined ? body.stage : prev.stage;
    let readyChecked = body.ready_checked !== undefined ? Boolean(body.ready_checked) : Boolean(prev.ready_checked);

    if (body.ready_checked === true && !stage) stage = 'ready_for_application';
    if (body.ready_checked === false) {
      stage = null;
      readyChecked = false;
    }
    if (stage && !EURAXESS_EXECUTION_STAGES.includes(stage)) {
      return res.status(400).json({ error: `invalid execution stage: ${stage}` });
    }
    if (stage === 'artifacts_ready' && !euraxessHasArtifacts(existing) && body.force !== true) {
      // allow stage even without artifacts — user may mark ready after attaching; warn only
    }
    if (stage === 'applied') {
      return res.status(400).json({ error: 'Use /apply to mark applied (creates PhD Applications tracker row).' });
    }

    const result = patchEuraxessOpportunity(req.params.id, {
      execution: {
        ...prev,
        stage: stage || null,
        ready_checked: readyChecked || Boolean(stage),
        stage_updated_at: new Date().toISOString(),
        notes: body.notes !== undefined ? String(body.notes || '') : (prev.notes || ''),
        application_num: prev.application_num ?? null,
        applied_at: prev.applied_at || '',
      },
      archived: false,
      visible: existing.visible !== false,
    });
    broadcast('euraxess_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result) });
    return res.json(withToday({
      ...result,
      message: result.opportunity.execution?.stage
        ? `Execution → ${result.opportunity.execution.stage}`
        : 'Removed from application execution rail',
    }));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to update EURAXESS execution stage' });
  }
});

app.post('/api/euraxess/opportunities/:id/apply', (req, res) => {
  try {
    const applied = req.body?.applied !== false;
    const existing = findEuraxessOpportunity(req.params.id);
    if (!existing) return res.status(404).json({ error: 'EURAXESS opportunity not found' });
    const prev = existing.execution || {};

    if (!applied) {
      if (prev.application_num) {
        try {
          deleteTrackerRow({ num: Number(prev.application_num) });
        } catch (err) {
          if (!/not found/i.test(err?.message || '')) throw err;
        }
      }
      const result = patchEuraxessOpportunity(req.params.id, {
        execution: {
          ...prev,
          stage: 'artifacts_ready',
          ready_checked: true,
          applied_at: '',
          application_num: null,
          stage_updated_at: new Date().toISOString(),
        },
      });
      syncApplications();
      triggerSync();
      broadcast('euraxess_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result) });
      broadcast('application_deleted', { num: prev.application_num || null });
      return res.json(withToday({ opportunity: result.opportunity, application: null }));
    }

    const topic = euraxessTopic(existing);
    const reportPath = existing.research_report || existing.artifacts?.research_report || existing.resources?.report_md || '';
    const report = reportPath
      ? `[${existing.external_id || existing.id}](${reportPath})`
      : '-';
    const trackerResult = createTrackerRow({
      entry: {
        date: localDateString(new Date(), DEFAULT_DIGEST_TIMEZONE),
        company: existing.institution || 'EURAXESS',
        role: existing.title,
        score: Number.isFinite(Number(existing.score)) ? `${Number(existing.score).toFixed(1)}/5` : 'N/A',
        status: 'Applied',
        pdf: Boolean(existing.resources?.resume_pdf || existing.artifacts?.resume_pdf),
        report,
        notes: existing.fit_rationale || 'Applied from EURAXESS Live Feed.',
      },
      metadata: {
        posting_url: existing.url,
        submitted_date: localDateString(new Date(), DEFAULT_DIGEST_TIMEZONE),
        university: existing.institution || '',
        field: EURAXESS_TOPIC_LABELS[topic] || topic || '',
        division_field: (existing.research_fields || []).join(', '),
        date_due: existing.deadline_text || '',
        way_to_apply: existing.resources?.email_draft || existing.url || '',
        track_kind: 'phd',
      },
    });

    const result = patchEuraxessOpportunity(req.params.id, {
      execution: {
        ...prev,
        stage: 'applied',
        ready_checked: true,
        applied_at: new Date().toISOString(),
        application_num: trackerResult.num,
        stage_updated_at: new Date().toISOString(),
      },
      archived: false,
      visible: true,
    });
    syncApplications();
    triggerSync();
    broadcast('euraxess_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result) });
    broadcast('application_updated', {
      num: trackerResult.num,
      created: !trackerResult.duplicate,
      duplicate: trackerResult.duplicate,
    });
    return res.json(withToday({ opportunity: result.opportunity, application: trackerResult }, { refresh: true }));
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to update EURAXESS applied state' });
  }
});

// ── U-M Careers tracker ─────────────────────────────────────────────

app.get('/api/umich-careers/opportunities', (req, res) => {
  try {
    res.json(maybeProjectFeed(req, ensureUmichDashboardProjection(), projectUmichListStore));
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read U-M Careers opportunities' });
  }
});

app.get('/api/umich-careers/health', (_req, res) => {
  try {
    const store = readUmichOpportunities();
    res.json({ generated_at: new Date().toISOString(), ...store.scan_health });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read U-M Careers health' });
  }
});

app.post('/api/umich-careers/scan', (req, res) => {
  const input = req.body || {};
  const mode = ['full', 'details', 'rescore', 'discover'].includes(String(input.mode)) ? String(input.mode) : 'discover';
  const args = [`--${mode}`];
  if (input.dry_run || input.dryRun) args.push('--dry-run');
  const job = jobStore.create('umich_careers_scan', input, {
    label: `Scan U-M Careers (${mode})`,
    description: 'Crawl the permitted careers.umich.edu browse catalogs and update the U-M Careers tracker.',
  });
  jobStore.update(job.id, { status: 'running' });
  queueMicrotask(async () => {
    try {
      const { execFile } = await import('child_process');
      const result = await new Promise(resolve => {
        execFile(process.execPath, nodeScriptInvocation(join(BASE, 'umich-careers-scan.mjs'), args), {
          cwd: BASE,
          timeout: (mode === 'full' ? 30 : 10) * 60_000,
          windowsHide: true,
        }, (err, stdout = '', stderr = '') => {
          resolve({ err, stdout, stderr });
        });
      });
      if (result.stdout) jobStore.appendLog(job.id, 'stdout', result.stdout);
      if (result.stderr) jobStore.appendLog(job.id, 'stderr', result.stderr);
      if (result.err) throw result.err;
      jobStore.finish(job.id, 0);
      broadcast('umich_careers_opportunities_updated', { total: readUmichOpportunities().opportunities?.length || 0 });
    } catch (err) {
      jobStore.appendLog(job.id, 'stderr', err?.stack || err?.message || String(err));
      jobStore.finish(job.id, 1, err?.message || String(err));
      broadcast('umich_careers_scan_failed', { error: err?.message || String(err) });
    }
  });
  res.status(202).json({ job });
});

app.get('/api/umich-careers/opportunities/:id', (req, res) => {
  try {
    const opportunity = findUmichOpportunity(req.params.id);
    if (!opportunity) return res.status(404).json({ error: 'U-M Careers opportunity not found' });
    return res.json({ opportunity });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read U-M Careers opportunity' });
  }
});

app.patch('/api/umich-careers/opportunities/:id', (req, res) => {
  try {
    const result = patchUmichOpportunity(req.params.id, req.body || {});
    broadcast('umich_careers_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result, 'umich_opportunities') });
    return res.json(result);
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to update U-M Careers opportunity' });
  }
});

app.post('/api/umich-careers/opportunities/:id/archive', (req, res) => {
  try {
    const existing = findUmichOpportunity(req.params.id);
    if (!existing) return res.status(404).json({ error: 'U-M Careers opportunity not found' });
    const gate = assertCanArchiveOpportunity(existing, { force: Boolean(req.body?.force) });
    if (!gate.allowed) {
      return res.status(409).json({ error: gate.message, ...gate });
    }
    const result = archiveUmichOpportunity(req.params.id, {
      reason: req.body?.reason || req.body?.archive_reason || 'Archived from dashboard.',
      force: Boolean(req.body?.force),
    });
    broadcast('umich_careers_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result, 'umich_opportunities') });
    return res.json({
      ...result,
      message: `Archived: ${result.opportunity.working_title || result.opportunity.title}`,
    });
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to archive U-M Careers opportunity' });
  }
});

app.post('/api/umich-careers/opportunities/:id/unarchive', (req, res) => {
  try {
    const result = unarchiveUmichOpportunity(req.params.id);
    broadcast('umich_careers_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result, 'umich_opportunities') });
    return res.json({
      ...result,
      message: `Restored from archive: ${result.opportunity.working_title || result.opportunity.title}`,
    });
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to unarchive U-M Careers opportunity' });
  }
});

app.post('/api/umich-careers/opportunities/:id/apply', (req, res) => {
  try {
    const applied = req.body?.applied !== false;
    const existing = findUmichOpportunity(req.params.id);
    if (!existing) return res.status(404).json({ error: 'U-M Careers opportunity not found' });

    if (!applied) {
      if (existing.application_num) {
        try {
          deleteTrackerRow({ num: Number(existing.application_num) });
        } catch (err) {
          if (!/not found/i.test(err?.message || '')) throw err;
        }
      }
      const result = patchUmichOpportunity(req.params.id, {
        applied: false,
        application_num: null,
        applied_at: '',
      });
      syncApplications();
      triggerSync();
      broadcast('umich_careers_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result, 'umich_opportunities') });
      broadcast('application_deleted', { num: existing.application_num || null });
      return res.json(withToday({
        opportunity: result.opportunity,
        application: null,
        message: 'Moved back out of Applications.',
      }));
    }

    const role = existing.working_title || existing.title || `U-M job ${existing.job_id}`;
    const score = Number.isFinite(Number(existing.score))
      ? `${Number(existing.score).toFixed(1)}/5`
      : 'N/A';
    const notes = [
      existing.fit_rationale,
      existing.job_id ? `U-M job opening ID ${existing.job_id}.` : '',
      existing.salary_text ? `Salary ${existing.salary_text}.` : '',
      existing.posting_end_date ? `Posting ends ${existing.posting_end_date}.` : '',
      'Applied from U-M Careers tracker.',
    ].filter(Boolean).join(' ');

    const trackerResult = createTrackerRow({
      entry: {
        date: localDateString(new Date(), DEFAULT_DIGEST_TIMEZONE),
        company: 'University of Michigan',
        role,
        score,
        status: 'Applied',
        pdf: false,
        report: '-',
        notes,
      },
      metadata: {
        posting_url: existing.url || existing.apply_url || '',
        submitted_date: localDateString(new Date(), DEFAULT_DIGEST_TIMEZONE),
        date_due: existing.posting_end_date || '',
        department: existing.department || '',
        division_field: existing.career_interest || existing.organizational_group || '',
        way_to_apply: existing.apply_url || existing.url || '',
        track_kind: 'job',
      },
    });

    const result = patchUmichOpportunity(req.params.id, {
      applied: true,
      application_num: trackerResult.num,
      applied_at: new Date().toISOString(),
      // Applied cards leave the active priority tray; keep archive flag as-is.
      archived: false,
      archive_reason: '',
      archived_at: '',
    });
    syncApplications();
    triggerSync();
    broadcast('umich_careers_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result, 'umich_opportunities') });
    broadcast('application_updated', {
      num: trackerResult.num,
      created: !trackerResult.duplicate,
      duplicate: trackerResult.duplicate,
    });
    return res.json(withToday({
      opportunity: result.opportunity,
      application: trackerResult,
      message: `Applied: ${role} → Applications #${trackerResult.num}`,
    }, { refresh: true }));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to update U-M Careers applied state' });
  }
});

app.post('/api/umich-careers/opportunities/:id/add-to-consider', (req, res) => {
  try {
    const existing = findUmichOpportunity(req.params.id);
    if (!existing) return res.status(404).json({ error: 'U-M Careers opportunity not found' });

    // Idempotent: reuse the linked Jobs to Consider entry when it still exists.
    const linked = existing.jobs_to_consider_id ? findConsiderJob(existing.jobs_to_consider_id) : null;
    const byUrl = linked || (existing.url ? findConsiderJob({ url: existing.url }) : null);
    if (byUrl) {
      if (!existing.jobs_to_consider_id || existing.jobs_to_consider_id !== byUrl.id) {
        patchUmichOpportunity(req.params.id, { jobs_to_consider_id: byUrl.id });
      }
      return res.json({ job: byUrl, created: false, message: 'Already on Jobs to Consider.' });
    }

    upsertConsiderJob({
      company: 'University of Michigan',
      title: existing.working_title || existing.title,
      url: existing.url,
      location: [existing.work_location, existing.city_location].filter(Boolean).join(' — '),
      team: existing.department,
      source: 'umich_careers',
      posting_text: [existing.working_title || existing.title, existing.description].filter(Boolean).join('\n'),
      legacy_score: existing.legacy_score || existing.score,
      fit_summary: existing.fit_rationale,
      notes: [
        `U-M job opening ID ${existing.job_id}.`,
        existing.salary_text ? `Salary ${existing.salary_text}.` : '',
        existing.posting_end_date ? `Posting ends ${existing.posting_end_date}.` : '',
      ].filter(Boolean).join(' '),
      region: 'US',
    });
    const job = findConsiderJob({ url: existing.url, company: 'University of Michigan', title: existing.working_title || existing.title });
    if (job) {
      patchUmichOpportunity(req.params.id, { jobs_to_consider_id: job.id });
    }
    broadcast('jobs_to_consider_updated', { total: readConsiderJobs().jobs.length });
    broadcast('umich_careers_opportunities_updated', { id: existing.id });
    return res.status(201).json({ job, created: true, message: 'Added to Jobs to Consider for review.' });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to add U-M Careers opportunity to Jobs to Consider' });
  }
});

app.get('/api/phdscanner/opportunities', (req, res) => {
  try {
    res.json(maybeProjectFeed(req, readPhdscannerOpportunities(), projectPhdscannerListStore));
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read PhDScanner opportunities' });
  }
});

app.get('/api/phdscanner/health', (_req, res) => {
  try {
    const store = readPhdscannerOpportunities();
    res.json({ generated_at: new Date().toISOString(), ...store.scan_summary });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read PhDScanner health' });
  }
});

app.get('/api/phdscanner/factory/status', async (_req, res) => {
  try {
    res.json(await phdscannerFactoryStatus());
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read PhDScanner factory status' });
  }
});

app.post('/api/phdscanner/factory/run', (req, res) => {
  const input = req.body || {};
  const job = jobStore.create('phdscanner_factory_run', input, {
    label: 'Run PhDScanner factory',
    description: 'Process queued/high-fit PhDScanner opportunities through research and draft artifact gates.',
  });
  spawnNodeJob({
    jobStore,
    job,
    baseDir: BASE,
    script: 'phdscanner-factory-worker.mjs',
    args: factoryWorkerArgs(input),
    timeoutMs: 10 * 60_000,
    onSuccess: () => {
      broadcast('phdscanner_factory_updated', { job_id: job.id });
      broadcast('phdscanner_opportunities_updated', { total: readPhdscannerOpportunities().opportunities?.length || 0 });
    },
    onFail: (err) => {
      broadcast('phdscanner_factory_failed', { error: err?.message || String(err) });
    },
  });
  res.status(202).json({ job, queued: true });
});

app.post('/api/phdscanner/scan', (req, res) => {
  const input = req.body || {};
  const args = [];
  if (input.all !== false) args.push('--all');
  if (input.refresh_liveness !== false) args.push('--refresh-liveness');
  if (input.dry_run || input.dryRun) args.push('--dry-run');
  if (input.max) args.push('--max', String(Number(input.max) || 200));
  const job = jobStore.create('phdscanner_scan', input, {
    label: 'Scan PhDScanner',
    description: 'Refresh PhDScanner sitemap/listing feed and update the local opportunity store.',
  });
  jobStore.update(job.id, { status: 'running' });
  queueMicrotask(async () => {
    try {
      const { execFile } = await import('child_process');
      const result = await new Promise(resolve => {
        execFile(process.execPath, nodeScriptInvocation(join(BASE, 'phdscanner-scan.mjs'), args), {
          cwd: BASE,
          timeout: 10 * 60_000,
          windowsHide: true,
        }, (err, stdout = '', stderr = '') => {
          resolve({ err, stdout, stderr });
        });
      });
      if (result.stdout) jobStore.appendLog(job.id, 'stdout', result.stdout);
      if (result.stderr) jobStore.appendLog(job.id, 'stderr', result.stderr);
      if (result.err) throw result.err;
      jobStore.finish(job.id, 0);
      broadcast('phdscanner_opportunities_updated', { total: readPhdscannerOpportunities().opportunities?.length || 0 });
    } catch (err) {
      jobStore.appendLog(job.id, 'stderr', err?.stack || err?.message || String(err));
      jobStore.finish(job.id, 1, err?.message || String(err));
      broadcast('phdscanner_factory_failed', { error: err?.message || String(err) });
    }
  });
  res.status(202).json({ job });
});

app.post('/api/findaphd/scan', (req, res) => {
  const input = req.body || {};
  const args = [];
  if (input.all !== false) args.push('--all');
  if (input.refresh_liveness !== false) args.push('--refresh-liveness');
  if (input.dry_run || input.dryRun) args.push('--dry-run');
  if (input.max) args.push('--max', String(Number(input.max) || 200));
  const job = jobStore.create('findaphd_scan', input, {
    label: 'Scan FindAPhD',
    description: 'Refresh FindAPhD listings into the unified PhD board feed with dedupe.',
  });
  jobStore.update(job.id, { status: 'running' });
  queueMicrotask(async () => {
    try {
      const { execFile } = await import('child_process');
      const result = await new Promise(resolve => {
        execFile(process.execPath, nodeScriptInvocation(join(BASE, 'findaphd-scan.mjs'), args), {
          cwd: BASE,
          timeout: 15 * 60_000,
          windowsHide: true,
        }, (err, stdout = '', stderr = '') => {
          resolve({ err, stdout, stderr });
        });
      });
      if (result.stdout) jobStore.appendLog(job.id, 'stdout', result.stdout);
      if (result.stderr) jobStore.appendLog(job.id, 'stderr', result.stderr);
      if (result.err) throw result.err;
      jobStore.finish(job.id, 0);
      broadcast('phdscanner_opportunities_updated', { total: readPhdscannerOpportunities().opportunities?.length || 0 });
    } catch (err) {
      jobStore.appendLog(job.id, 'stderr', err?.stack || err?.message || String(err));
      jobStore.finish(job.id, 1, err?.message || String(err));
      broadcast('phdscanner_factory_failed', { error: err?.message || String(err) });
    }
  });
  res.status(202).json({ job });
});

app.get('/api/phdscanner/opportunities/:id', (req, res) => {
  try {
    const opportunity = findPhdscannerOpportunity(req.params.id);
    if (!opportunity) return res.status(404).json({ error: 'PhDScanner opportunity not found' });
    return res.json({ opportunity });
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to read PhDScanner opportunity' });
  }
});

app.patch('/api/phdscanner/opportunities/:id', (req, res) => {
  try {
    const result = patchPhdscannerOpportunity(req.params.id, req.body || {});
    broadcast('phdscanner_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result, 'phdscanner_opportunities') });
    return res.json(withToday(result));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to patch PhDScanner opportunity' });
  }
});

app.post('/api/phdscanner/opportunities/:id/queue-research', (req, res) => {
  try {
    const result = patchPhdscannerOpportunity(req.params.id, {
      worker_status: 'queued_research',
      needs_research: true,
      archived: false,
      visible: true,
      automation: { worker_status: 'queued_research', current_stage: 'queued_research', last_error: '', runner: 'phdscanner-factory' },
    });
    const queued = queuePhdscannerOpportunityWork(result.opportunity, { pack: false });
    broadcast('phdscanner_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result, 'phdscanner_opportunities') });
    return res.json(withToday({ ...result, tasks: queued.tasks || [], message: `Queued research for ${result.opportunity.title}` }));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to queue PhDScanner research' });
  }
});

app.post('/api/phdscanner/opportunities/:id/queue-application-pack', (req, res) => {
  try {
    const result = patchPhdscannerOpportunity(req.params.id, {
      worker_status: 'queued_pack',
      needs_research: true,
      needs_application_pack: true,
      archived: false,
      visible: true,
      automation: { worker_status: 'queued_pack', current_stage: 'queued_pack', last_error: '', runner: 'phdscanner-factory' },
    });
    const queued = queuePhdscannerOpportunityWork(result.opportunity, { pack: true });
    broadcast('phdscanner_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result, 'phdscanner_opportunities') });
    return res.json(withToday({ ...result, tasks: queued.tasks || [], message: `Queued application pack for ${result.opportunity.title}` }));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to queue PhDScanner pack' });
  }
});

app.post('/api/phdscanner/opportunities/:id/archive', (req, res) => {
  try {
    const existing = findPhdscannerOpportunity(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: `PhDScanner opportunity not found: ${req.params.id}` });
    }
    const gate = assertCanArchiveOpportunity(existing, { force: Boolean(req.body?.force) });
    if (!gate.allowed) {
      return res.status(409).json({ error: gate.message, ...gate });
    }
    const result = patchPhdscannerOpportunity(req.params.id, {
      status: 'archived',
      archived: true,
      visible: false,
      worker_status: 'not_needed',
      needs_research: false,
      needs_application_pack: false,
      automation: { worker_status: 'not_needed', current_stage: 'applied_or_archived', last_error: '' },
      decision: { archive_reason: req.body?.reason || req.body?.archive_reason || 'Archived from dashboard.' },
    });
    broadcast('phdscanner_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result, 'phdscanner_opportunities') });
    return res.json(withToday({ ...result, message: `Archived: ${result.opportunity.title}` }));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to archive PhDScanner opportunity' });
  }
});

app.post('/api/phdscanner/opportunities/:id/retry', (req, res) => {
  try {
    const pack = Boolean(req.body?.pack);
    const result = patchPhdscannerOpportunity(req.params.id, {
      worker_status: pack ? 'queued_pack' : 'queued_research',
      needs_research: true,
      needs_application_pack: pack,
      archived: false,
      visible: true,
      automation: {
        worker_status: pack ? 'queued_pack' : 'queued_research',
        current_stage: pack ? 'queued_pack' : 'queued_research',
        last_error: '',
        next_retry_at: '',
        runner: 'phdscanner-factory',
      },
    });
    const queued = queuePhdscannerOpportunityWork(result.opportunity, { pack });
    broadcast('phdscanner_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result, 'phdscanner_opportunities') });
    return res.json(withToday({ ...result, tasks: queued.tasks || [] }));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to retry PhDScanner opportunity' });
  }
});

app.post('/api/phdscanner/opportunities/:id/execution', (req, res) => {
  try {
    const existing = findPhdscannerOpportunity(req.params.id);
    if (!existing) return res.status(404).json({ error: 'PhDScanner opportunity not found' });
    const prev = existing.execution || {};
    let stage = req.body?.stage !== undefined ? req.body.stage : prev.stage;
    let readyChecked = req.body?.ready_checked !== undefined ? Boolean(req.body.ready_checked) : Boolean(prev.ready_checked);
    if (req.body?.ready_checked === true && !stage) stage = 'ready_for_application';
    if (req.body?.ready_checked === false) { stage = null; readyChecked = false; }
    if (stage && !PHDSCANNER_EXECUTION_STAGES.includes(stage)) {
      return res.status(400).json({ error: `invalid execution stage: ${stage}` });
    }
    if (stage === 'applied') return res.status(400).json({ error: 'Use /apply to mark applied.' });
    const result = patchPhdscannerOpportunity(req.params.id, {
      execution: {
        ...prev,
        stage: stage || null,
        ready_checked: readyChecked || Boolean(stage),
        stage_updated_at: new Date().toISOString(),
        notes: req.body?.notes !== undefined ? String(req.body.notes || '') : (prev.notes || ''),
        application_num: prev.application_num ?? null,
        applied_at: prev.applied_at || '',
      },
      archived: false,
    });
    broadcast('phdscanner_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result, 'phdscanner_opportunities') });
    return res.json(withToday({
      ...result,
      message: result.opportunity.execution?.stage
        ? `Execution → ${result.opportunity.execution.stage}`
        : 'Removed from application execution rail',
    }));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to update PhDScanner execution stage' });
  }
});

app.post('/api/phdscanner/opportunities/:id/apply', (req, res) => {
  try {
    const applied = req.body?.applied !== false;
    const existing = findPhdscannerOpportunity(req.params.id);
    if (!existing) return res.status(404).json({ error: 'PhDScanner opportunity not found' });
    const prev = existing.execution || {};

    if (!applied) {
      if (prev.application_num) {
        try {
          deleteTrackerRow({ num: Number(prev.application_num) });
        } catch (err) {
          if (!/not found/i.test(err?.message || '')) throw err;
        }
      }
      const result = patchPhdscannerOpportunity(req.params.id, {
        execution: {
          ...prev,
          stage: 'artifacts_ready',
          ready_checked: true,
          applied_at: '',
          application_num: null,
          stage_updated_at: new Date().toISOString(),
        },
      });
      syncApplications();
      triggerSync();
      broadcast('phdscanner_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result, 'phdscanner_opportunities') });
      broadcast('application_deleted', { num: prev.application_num || null });
      return res.json(withToday({ opportunity: result.opportunity, application: null }));
    }

    const topic = phdscannerTopic(existing);
    const reportPath = existing.research_report || existing.artifacts?.research_report || existing.resources?.report_md || '';
    const report = reportPath
      ? `[${existing.external_id || existing.id}](${reportPath})`
      : '-';
    const trackerResult = createTrackerRow({
      entry: {
        date: localDateString(new Date(), DEFAULT_DIGEST_TIMEZONE),
        company: existing.university || existing.institution || 'PhDScanner',
        role: existing.title,
        score: Number.isFinite(Number(existing.score)) ? `${Number(existing.score).toFixed(1)}/5` : 'N/A',
        status: 'Applied',
        pdf: Boolean(existing.resources?.resume_pdf || existing.artifacts?.resume_pdf),
        report,
        notes: existing.fit_rationale || 'Applied from PhDScanner Feed.',
      },
      metadata: {
        posting_url: existing.url,
        submitted_date: localDateString(new Date(), DEFAULT_DIGEST_TIMEZONE),
        university: existing.university || existing.institution || '',
        field: PHDSCANNER_TOPIC_LABELS[topic] || topic || existing.discipline || '',
        division_field: (existing.research_fields || []).join(', '),
        date_due: existing.deadline_text || '',
        way_to_apply: existing.resources?.email_draft || existing.url || '',
        track_kind: 'phd',
      },
    });

    const result = patchPhdscannerOpportunity(req.params.id, {
      execution: {
        ...prev,
        stage: 'applied',
        ready_checked: true,
        applied_at: new Date().toISOString(),
        application_num: trackerResult.num,
        stage_updated_at: new Date().toISOString(),
      },
      archived: false,
      visible: true,
    });
    syncApplications();
    triggerSync();
    broadcast('phdscanner_opportunities_updated', { id: result.opportunity.id, total: opportunityTotal(result, 'phdscanner_opportunities') });
    broadcast('application_updated', {
      num: trackerResult.num,
      created: !trackerResult.duplicate,
      duplicate: trackerResult.duplicate,
    });
    return res.json(withToday({ opportunity: result.opportunity, application: trackerResult }, { refresh: true }));
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to update PhDScanner applied state' });
  }
});

app.post('/api/jobs-to-consider/:id/apply', (req, res) => {
  try {
    const applied = req.body?.applied !== false;
    const job = findConsiderJob(req.params.id);
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
      syncApplications();
      triggerSync();
      broadcast('jobs_to_consider_updated', { id: result.job.id, total: jobsTotal(result) });
      broadcast('application_deleted', { num: job.application_num || null });
      return res.json(withToday({ job: result.job, application: null }));
    }

    const reportPath = job.resources?.report_md || '';
    const report = reportPath
      ? `[${job.id.replace(/-/g, ' ')}](${reportPath})`
      : '-';
    assertConsiderJobApplyAllowed(job, { force: req.body?.force_apply === true });
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
        track_kind: 'job',
      },
    });

    const result = patchConsiderJob(job.id, {
      status: 'applied',
      applied: true,
      application_num: trackerResult.num,
      applied_at: new Date().toISOString(),
    });
    logJobConsiderPatchEvent(result.job, { applied: true, status: 'applied', application_num: trackerResult.num });
    let networking = null;
    if (req.body?.queue_networking === true) {
      try {
        networking = queueNetworkingForConsiderJob(result.job.id);
      } catch (err) {
        networking = { error: err?.message || 'failed to queue networking research' };
      }
    }
    syncApplications();
    triggerSync();
    broadcast('jobs_to_consider_updated', { id: result.job.id, total: jobsTotal(result) });
    broadcast('application_updated', {
      num: trackerResult.num,
      created: !trackerResult.duplicate,
      duplicate: trackerResult.duplicate,
    });
    if (networking?.order) {
      broadcast('networking_research_queue_updated', { order_id: networking.order.id });
      broadcast('networking_updated', {});
    }
    return res.json(withToday({
      job: enrichConsiderJobWithNetworking(networking?.job || result.job),
      application: trackerResult,
      networking,
    }));
  } catch (err) {
    return res.status(400).json({ error: err?.message || 'failed to update applied state' });
  }
});

app.post('/api/jobs-to-consider/:id/queue-networking', (req, res) => {
  try {
    const result = queueNetworkingForConsiderJob(req.params.id, {
      personas: req.body?.personas,
      notes: req.body?.notes || '',
    });
    broadcast('jobs_to_consider_updated', { id: result.job.id, total: jobsTotal(result) });
    broadcast('networking_research_queue_updated', { order_id: result.order.id, duplicate: result.duplicate });
    broadcast('networking_updated', { organization_id: result.organization?.id });
    logNetworkingActivity({
      action: 'research_queued',
      notes: `${result.organization?.name || ''} ← ${result.job.title}`,
    });
    return res.status(result.duplicate ? 200 : 201).json(withToday(result));
  } catch (err) {
    const status = /not found/i.test(err?.message || '') ? 404 : 400;
    return res.status(status).json({ error: err?.message || 'failed to queue networking for job' });
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

// ── File watchers ───────────────────────────────────────────────────

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
      execFile(process.execPath, nodeScriptInvocation(join(BASE, 'adapters', 'sync-all.mjs')), { cwd: BASE, timeout: 30_000 },
        (err, stdout) => {
          if (stdout) process.stdout.write(stdout);
          broadcast('career_ops_synced', { note: 'career-ops data refreshed' });
        });
    } catch {}
  }, 2000);
}

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

let watchersStarted = false;
function startFileWatchers() {
  if (watchersStarted) return;
  watchersStarted = true;

  const watcher = watch(DATA_DIR, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500 },
    ignored: (filePath) => {
      const file = basename(filePath);
      if (file.startsWith('.') && file.includes('.tmp-')) return true;
      if (file.endsWith('.lock')) return true;
      if (FAT_JSON_FILES.has(file)) return true;
      return false;
    },
  });

  watcher.on('change', (filePath) => {
    const file = basename(filePath);
    broadcast('data_updated', { file, path: filePath });
  });

  watcher.on('add', (filePath) => {
    const file = basename(filePath);
    broadcast('data_added', { file, path: filePath });
  });

  if (['1', 'true', 'yes', 'on', 'enabled'].includes(String(process.env.CAREER_OPS_AUTO_SYNC_WATCHER || '').toLowerCase())) {
    const careerOpsWatcher = watch([...careerOpsFiles, reportsGlob], {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 1000 },
    });

    careerOpsWatcher.on('change', () => triggerSync());
    careerOpsWatcher.on('add', () => triggerSync());
  }

  if (['1', 'true', 'yes'].includes(String(process.env.CAREER_OPS_OUTPUT_WATCHER || '').toLowerCase())) {
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
  }
}

// ── Root redirect ───────────────────────────────────────────────────

app.get('/healthz', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    mode: process.env.AUTONOMY_MODE || 'unknown',
    uptime_sec: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    research_prospect_statuses: [
      'not_contacted',
      'draft_ready',
      'contacted',
      'followed_up',
      'responded_positive',
      'responded_negative',
      'archived',
    ],
    outreach_kanban: true,
    silence_nudge_days: 7,
    eventLoopDelay: eventLoopDelaySnapshot(),
    liveStore: {
      engine: liveEngineName(),
      dir: liveDataDir(),
    },
  });
});

app.get('/', (req, res) => res.redirect('/dashboard/fusion-pivot-dashboard.html'));

export function startServer(port = PORT, host = HOST) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const server = app.listen(port, host, () => {
      const migrated = bootstrapResearchUserStateFromCanonical();
      syncNetworkingToDashboard();
      if (migrated > 0) {
        console.log(`[boot] Migrated ${migrated} research prospect status(es) into user-state overlay`);
      }
      console.log(`\n  Dashboard: http://${host}:${port}`);
      console.log(`  SSE stream: http://${host}:${port}/stream`);
      console.log(`  Data API: http://${host}:${port}/data/<file>.json`);
      console.log(`  Control API: http://${host}:${port}/api/actions\n`);
      const skipWatchers = ['1', 'true', 'yes'].includes(String(process.env.CAREER_OPS_SKIP_WATCHERS || '').toLowerCase());
      if (!skipWatchers) startFileWatchers();
      if (!skipWatchers && !['1', 'true', 'yes'].includes(String(process.env.PUBLISH_SNAPSHOT || '').toLowerCase())) {
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
