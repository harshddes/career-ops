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
import { AgentTaskQueue } from './lib/agent-task-queue.mjs';
import { JobStore } from './lib/job-store.mjs';
import { buildOutreachDraft } from './lib/outreach-drafts.mjs';
import { summarizeSourceHealth } from './lib/source-health.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(BASE, 'data');
const DASHBOARD_DIR = join(BASE, 'dashboard');
const RESEARCH_DIR = join(BASE, 'research');
const PORT = process.env.PORT || 3737;
const HOST = process.env.HOST || '127.0.0.1';
const CAREER_OPS = join(BASE, '..');

const app = express();

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.header('Access-Control-Allow-Origin', origin || `http://${HOST}:${PORT}`);
  }
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use('/dashboard', express.static(DASHBOARD_DIR));
app.use('/research', express.static(RESEARCH_DIR));

function safeDataPath(file) {
  if (!/^[\w.-]+\.(json|ndjson)$/.test(file)) return null;
  const base = resolve(DATA_DIR);
  const target = resolve(DATA_DIR, file);
  if (!target.startsWith(base)) return null;
  return target;
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

const jobStore = new JobStore(join(DATA_DIR, 'jobs.json'), (type, payload) => broadcast(type, payload));
const taskQueue = new AgentTaskQueue(join(DATA_DIR, 'agent-tasks.ndjson'));
const actionPlan = new ActionPlanStore(join(DATA_DIR, 'action-plan.json'));
const actionRegistry = createActionRegistry({ baseDir: BASE, repoRoot: CAREER_OPS, dataDir: DATA_DIR });

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
