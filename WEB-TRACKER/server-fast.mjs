#!/usr/bin/env node
import { execFile } from 'child_process';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { createServer } from 'http';
import { extname, join, normalize } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { loadEnv } from './lib/load-env.mjs';
import { summarizeSourceHealth } from './lib/source-health.mjs';
import { DEFAULT_DIGEST_TIMEZONE, digestRecipients, getTodayActivity, localDateString } from './lib/today-activity.mjs';
import { logJobConsiderPatchEvent, logNetworkingActivity, logResearchStatusEvent } from './lib/dashboard-activity.mjs';
import { writeDailyActivityCsv } from './lib/daily-activity-csv.mjs';
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
  syncResearchProspectsToDashboard,
  upsertResearchProspect,
} from './lib/research-prospect-store.mjs';
import {
  findEuraxessOpportunity,
  patchEuraxessOpportunity,
  readEuraxessOpportunities,
  syncEuraxessOpportunitiesToDashboard,
} from './lib/euraxess/opportunity-store.mjs';
import {
  euraxessFactoryStatus,
  processEuraxessFactory,
  queueEuraxessOpportunityWork,
} from './lib/euraxess/factory.mjs';
import {
  findPhdscannerOpportunity,
  patchPhdscannerOpportunity,
  readPhdscannerOpportunities,
  syncPhdscannerOpportunitiesToDashboard,
} from './lib/phdscanner/opportunity-store.mjs';
import {
  phdscannerFactoryStatus,
  processPhdscannerFactory,
  queuePhdscannerOpportunityWork,
} from './lib/phdscanner/factory.mjs';
import {
  DASHBOARD_UMICH_FILE,
  readUmichOpportunities,
} from './lib/umich-careers/opportunity-store.mjs';
import {
  findExhibitorCompany,
  patchExhibitorCompany,
  readExhibitorCompanies,
  syncExhibitorCompaniesToDashboard,
} from './lib/exhibitor/company-store.mjs';
import {
  exhibitorFactoryStatus,
  processExhibitorFactory,
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
  createTrackerRow,
  deleteTrackerRow,
} from '../update-tracker-row.mjs';

loadEnv();

const BASE = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS = join(BASE, '..');
const DATA_DIR = join(BASE, 'data');
const RUNTIME_DIR = join(BASE, 'runtime');
const DASHBOARD_DIR = join(BASE, 'dashboard');
const OUTPUT_DIR = join(CAREER_OPS, 'output');
const REPORTS_DIR = join(CAREER_OPS, 'reports');
const PORT = Number(process.env.PORT || 3737);
const HOST = process.env.HOST || '127.0.0.1';
let jobCounter = 0;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ndjson': 'application/x-ndjson; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendJson(res, value, status = 200) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(`${JSON.stringify(value, null, 2)}\n`);
}

function sendText(res, value, status = 200) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(value);
}

function readBodyJson(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function createFastJob(type, input = {}) {
  return {
    id: `fast-${Date.now()}-${++jobCounter}`,
    type,
    input,
    status: 'running',
    created_at: new Date().toISOString(),
  };
}

function withToday(payload = {}) {
  const activity = getTodayActivity({ timeZone: DEFAULT_DIGEST_TIMEZONE });
  writeDailyActivityCsv(activity);
  return {
    ...payload,
    today: {
      date: activity.date,
      timeZone: activity.timeZone,
      summary: activity.summary,
    },
  };
}

function runNode(script, args = [], { timeoutMs = 10 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [join(BASE, script), ...args], {
      cwd: BASE,
      timeout: timeoutMs,
      windowsHide: true,
    }, (err, stdout = '', stderr = '') => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function readJson(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    return { error: err.message, path: filePath };
  }
}

function safeJoin(root, requestPath) {
  const clean = normalize(requestPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(root, clean);
  return filePath.startsWith(root) ? filePath : null;
}

function dataFile(name) {
  return safeJoin(DATA_DIR, name);
}

function loadPhdSourceFile(sourceId) {
  const registry = readJson(join(DATA_DIR, 'phd-prospect-sources.json'), { sources: [] });
  const source = (registry.sources || []).find(item => item.id === sourceId);
  return source?.prospects_file || `${sourceId}-research-prospects.json`;
}

function sourceHealth() {
  return summarizeSourceHealth({
    registryPath: join(BASE, 'config', 'source-registry.json'),
    statePath: join(DATA_DIR, 'source-state.json'),
    jobsPath: join(DATA_DIR, 'jobs-to-consider.json'),
    phdPath: join(DATA_DIR, 'phd-opportunities.json'),
  });
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

function serveFile(res, filePath) {
  if (!filePath || !existsSync(filePath)) {
    sendText(res, 'Not found', 404);
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(res);
}

async function routeApi(req, res, pathname, requestUrl = null) {
  if (pathname === '/api/today-activity') {
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    try {
      const url = requestUrl || new URL(req.url || '/', 'http://127.0.0.1');
      const activity = getTodayActivity({
        date: url.searchParams.get('date') || '',
        timeZone: url.searchParams.get('timezone') || DEFAULT_DIGEST_TIMEZONE,
      });
      writeDailyActivityCsv(activity);
      sendJson(res, activity);
    } catch (err) {
      sendJson(res, { error: err?.message || 'failed to build today activity' }, 400);
    }
    return true;
  }

  if (pathname === '/api/daily-digest/smtp-status') {
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    const { smtpConfigFromEnv, validateSmtpConfig } = await import('./lib/mail-sender.mjs');
    const config = smtpConfigFromEnv();
    const validation = validateSmtpConfig(config);
    const envPath = join(BASE, '.env');
    sendJson(res, {
      ok: validation.ok,
      missing: validation.missing,
      env_file: envPath,
      env_exists: existsSync(envPath),
      from: config.from || '',
      host: config.host || '',
      user: config.user || '',
      recipients: config.recipients || digestRecipients(),
      timezone: process.env.DAILY_DIGEST_TIMEZONE || process.env.TZ || DEFAULT_DIGEST_TIMEZONE,
      enabled: ['1', 'true', 'yes', 'y', 'on'].includes(String(process.env.DAILY_DIGEST_ENABLED || '').trim().toLowerCase()),
      setup_hint: validation.ok
        ? `SMTP is configured. Nightly digest + manual Email Today CSV go to: ${(config.recipients || []).join(', ') || 'no recipients'}.`
        : 'Copy WEB-TRACKER/.env.example to WEB-TRACKER/.env, set SMTP_PASS to a Gmail App Password, then restart the dashboard.',
    });
    return true;
  }

  if (pathname === '/api/daily-digest/send') {
    if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405), true;
    try {
      const body = await readBodyJson(req);
      const recipients = parseEmailRecipients(body?.recipients || body?.recipient || body?.to);
      const options = {
        date: body?.date,
        timeZone: body?.timezone,
        recipients: recipients.length ? recipients : undefined,
      };
      if (body?.dry_run !== false) {
        const { buildDailyDigest } = await import('./lib/daily-digest.mjs');
        const digest = await buildDailyDigest(options);
        sendJson(res, {
          sent: false,
          dry_run: true,
          subject: digest.subject,
          recipients: recipients.length ? recipients : digestRecipients(),
          activity: digest.activity,
          attachments: digest.attachments.map(attachment => ({
            filename: attachment.filename,
            contentType: attachment.contentType,
            bytes: attachment.content.length,
          })),
        });
        return true;
      }
      const { sendDailyDigest } = await import('./lib/daily-digest.mjs');
      const result = await sendDailyDigest(options);
      sendJson(res, {
        ...result,
        recipients: recipients.length ? recipients : digestRecipients(),
      });
      return true;
    } catch (err) {
      sendJson(res, { error: err?.message || 'failed to send daily digest' }, 400);
      return true;
    }
  }

  if (pathname === '/api/source-health') {
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    sendJson(res, sourceHealth());
    return true;
  }
  if (pathname === '/api/euraxess/opportunities') {
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    sendJson(res, readEuraxessOpportunities());
    return true;
  }
  if (pathname === '/api/phdscanner/opportunities') {
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    sendJson(res, readPhdscannerOpportunities());
    return true;
  }
  if (pathname === '/api/umich-careers/opportunities') {
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    sendJson(res, readUmichOpportunities(existsSync(DASHBOARD_UMICH_FILE) ? DASHBOARD_UMICH_FILE : undefined));
    return true;
  }
  if (pathname === '/api/umich-careers/health') {
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    const store = readUmichOpportunities();
    sendJson(res, {
      generated_at: new Date().toISOString(),
      ...store.scan_health,
    });
    return true;
  }
  if (pathname === '/api/exhibitor/companies') {
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    sendJson(res, readExhibitorCompanies());
    return true;
  }
  if (pathname === '/api/exhibitor/clear-queue') {
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    sendJson(res, readExhibitorClearQueue());
    return true;
  }
  if (pathname === '/api/exhibitor/factory/status') {
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    sendJson(res, exhibitorFactoryStatus());
    return true;
  }
  if (pathname === '/api/exhibitor/factory/run') {
    if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405), true;
    const input = await readBodyJson(req);
    const job = createFastJob('exhibitor_factory_run', input);
    try {
      const result = processExhibitorFactory({
        max: Number(input.max || 20),
        force: Boolean(input.force),
      });
      syncExhibitorCompaniesToDashboard();
      sendJson(res, {
        job: { ...job, status: 'completed' },
        result,
        summary: {
          processed: result.processed ?? result.results?.length ?? 0,
          results: (result.results || []).map(item => ({
            id: item.id,
            company: item.company,
            status: item.status,
            stage: item.stage,
          })),
          message: result.message,
        },
      });
    } catch (err) {
      sendJson(res, {
        job: { ...job, status: 'failed' },
        error: err?.message || String(err),
      }, 500);
    }
    return true;
  }
  if (pathname.startsWith('/api/exhibitor/companies/')) {
    const parts = pathname.split('/').filter(Boolean);
    // api exhibitor companies :id [queue-research]
    const id = decodeURIComponent(parts[3] || '');
    const action = parts[4] || '';
    if (!id) return sendJson(res, { error: 'missing id' }, 400), true;
    if (req.method === 'GET' && !action) {
      const company = findExhibitorCompany(id, readExhibitorCompanies());
      if (!company) return sendJson(res, { error: 'exhibitor company not found' }, 404), true;
      sendJson(res, { company });
      return true;
    }
    if (req.method === 'PATCH' && !action) {
      try {
        const body = await readBodyJson(req);
        const result = patchExhibitorCompany(id, body || {});
        syncExhibitorCompaniesToDashboard();
        refreshExhibitorClearQueueStatus();
        sendJson(res, result);
      } catch (err) {
        sendJson(res, { error: err?.message || String(err) }, 400);
      }
      return true;
    }
    if (req.method === 'POST' && action === 'queue-research') {
      try {
        const existing = findExhibitorCompany(id, readExhibitorCompanies());
        if (!existing) return sendJson(res, { error: 'exhibitor company not found' }, 404), true;
        const queued = queueExhibitorCompanyWork(existing);
        sendJson(res, {
          company: queued.company,
          task: queued.task,
          clear_queue: queued.clear_queue,
          message: `Queued research for ${queued.company.name}. Hit Process queue, then tell Cursor: Clear the queue in Target Companies.`,
        });
      } catch (err) {
        sendJson(res, { error: err?.message || String(err) }, 400);
      }
      return true;
    }
    return sendJson(res, { error: 'not found' }, 404), true;
  }
  if (pathname === '/api/euraxess/health') {
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    const store = readEuraxessOpportunities();
    sendJson(res, {
      generated_at: new Date().toISOString(),
      ...store.scan_summary,
    });
    return true;
  }
  if (pathname === '/api/phdscanner/health') {
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    const store = readPhdscannerOpportunities();
    sendJson(res, {
      generated_at: new Date().toISOString(),
      ...store.scan_summary,
    });
    return true;
  }
  if (pathname === '/api/euraxess/factory/status') {
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    sendJson(res, await euraxessFactoryStatus());
    return true;
  }
  if (pathname === '/api/phdscanner/factory/status') {
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    sendJson(res, await phdscannerFactoryStatus());
    return true;
  }
  if (pathname === '/api/euraxess/scan') {
    if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405), true;
    const input = await readBodyJson(req);
    const job = createFastJob('euraxess_scan', input);
    const args = [];
    if (input.all !== false) args.push('--all');
    if (input.refresh_liveness !== false) args.push('--refresh-liveness');
    if (input.dry_run || input.dryRun) args.push('--dry-run');
    runNode('euraxess-scan.mjs', args, { timeoutMs: 5 * 60_000 })
      .then(() => syncEuraxessOpportunitiesToDashboard())
      .catch(err => console.error(`[fast-server] EURAXESS scan failed: ${err.stderr || err.message}`));
    sendJson(res, { job }, 202);
    return true;
  }
  if (pathname === '/api/phdscanner/scan') {
    if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405), true;
    const input = await readBodyJson(req);
    const job = createFastJob('phdscanner_scan', input);
    const args = [];
    if (input.all !== false) args.push('--all');
    if (input.refresh_liveness !== false) args.push('--refresh-liveness');
    if (input.dry_run || input.dryRun) args.push('--dry-run');
    if (input.max) args.push('--max', String(Number(input.max) || 200));
    runNode('phdscanner-scan.mjs', args, { timeoutMs: 10 * 60_000 })
      .then(() => syncPhdscannerOpportunitiesToDashboard())
      .catch(err => console.error(`[fast-server] PhDScanner scan failed: ${err.stderr || err.message}`));
    sendJson(res, { job }, 202);
    return true;
  }
  if (pathname === '/api/findaphd/scan') {
    if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405), true;
    const input = await readBodyJson(req);
    const job = createFastJob('findaphd_scan', input);
    const args = [];
    if (input.all !== false) args.push('--all');
    if (input.refresh_liveness !== false) args.push('--refresh-liveness');
    if (input.dry_run || input.dryRun) args.push('--dry-run');
    if (input.max) args.push('--max', String(Number(input.max) || 200));
    runNode('findaphd-scan.mjs', args, { timeoutMs: 15 * 60_000 })
      .then(() => syncPhdscannerOpportunitiesToDashboard())
      .catch(err => console.error(`[fast-server] FindAPhD scan failed: ${err.stderr || err.message}`));
    sendJson(res, { job }, 202);
    return true;
  }
  if (pathname === '/api/euraxess/factory/run') {
    if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405), true;
    const input = await readBodyJson(req);
    const job = createFastJob('euraxess_factory_run', input);
    try {
      const result = await processEuraxessFactory({
        max: Number(input.max || 3),
        dryRun: Boolean(input.dry_run || input.dryRun),
        force: Boolean(input.force),
        retryFailures: Boolean(input.retry_failures || input.retryFailures),
        pollTimeoutSec: Number(input.poll_timeout_sec || input.poll_timeout || 90),
      });
      syncEuraxessOpportunitiesToDashboard();
      sendJson(res, {
        job: { ...job, status: 'completed' },
        result,
        summary: {
          processed: result.processed ?? result.results?.length ?? 0,
          results: (result.results || []).map(item => ({
            id: item.id,
            title: item.title,
            status: item.status,
            stage: item.stage,
          })),
        },
      });
    } catch (err) {
      sendJson(res, { job: { ...job, status: 'failed' }, error: err?.message || String(err) }, 500);
    }
    return true;
  }
  if (pathname === '/api/phdscanner/factory/run') {
    if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405), true;
    const input = await readBodyJson(req);
    const job = createFastJob('phdscanner_factory_run', input);
    try {
      const result = await processPhdscannerFactory({
        max: Number(input.max || 3),
        dryRun: Boolean(input.dry_run || input.dryRun),
        force: Boolean(input.force),
        retryFailures: Boolean(input.retry_failures || input.retryFailures),
        pollTimeoutSec: Number(input.poll_timeout_sec || input.poll_timeout || 90),
      });
      syncPhdscannerOpportunitiesToDashboard();
      sendJson(res, {
        job: { ...job, status: 'completed' },
        result,
        summary: {
          processed: result.processed ?? result.results?.length ?? 0,
          results: (result.results || []).map(item => ({
            id: item.id,
            title: item.title,
            status: item.status,
            stage: item.stage,
          })),
        },
      });
    } catch (err) {
      sendJson(res, { job: { ...job, status: 'failed' }, error: err?.message || String(err) }, 500);
    }
    return true;
  }
  if (pathname === '/api/euraxess/backfill') {
    if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405), true;
    const input = await readBodyJson(req);
    const job = createFastJob('euraxess_backfill', input);
    const args = ['--profile', String(input.profile || 'fusion_plasma_diagnostics'), '--max', String(Number(input.max || 500) || 500)];
    if (input.force) args.push('--force');
    if (input.dry_run || input.dryRun) args.push('--dry-run');
    runNode('euraxess-backfill.mjs', args, { timeoutMs: 10 * 60_000 })
      .catch(err => console.error(`[fast-server] EURAXESS backfill failed: ${err.stderr || err.message}`));
    sendJson(res, { job }, 202);
    return true;
  }
  if (pathname.startsWith('/api/euraxess/opportunities/')) {
    const parts = pathname.split('/');
    const action = parts.length > 5 ? parts.pop() : '';
    const id = decodeURIComponent(parts.pop() || '');
    if (req.method === 'POST' && ['queue-research', 'queue-application-pack', 'archive', 'retry', 'execution', 'apply'].includes(action)) {
      try {
        const input = await readBodyJson(req);
        const existing = findEuraxessOpportunity(id, readEuraxessOpportunities());
        if (!existing) {
          sendJson(res, { error: 'EURAXESS opportunity not found' }, 404);
          return true;
        }
        if (action === 'execution' || action === 'apply') {
          // Delegate to full server semantics via patch; keep fast path minimal for local UI.
          const { createTrackerRow, deleteTrackerRow } = await import('../update-tracker-row.mjs');
          const { EURAXESS_EXECUTION_STAGES, EURAXESS_TOPIC_LABELS, euraxessTopic } = await import('./lib/euraxess/filters.mjs');
          const { localDateString, DEFAULT_DIGEST_TIMEZONE } = await import('./lib/today-activity.mjs');
          if (action === 'execution') {
            const prev = existing.execution || {};
            let stage = input.stage !== undefined ? input.stage : prev.stage;
            let readyChecked = input.ready_checked !== undefined ? Boolean(input.ready_checked) : Boolean(prev.ready_checked);
            if (input.ready_checked === true && !stage) stage = 'ready_for_application';
            if (input.ready_checked === false) { stage = null; readyChecked = false; }
            if (stage && !EURAXESS_EXECUTION_STAGES.includes(stage)) {
              sendJson(res, { error: `invalid execution stage: ${stage}` }, 400);
              return true;
            }
            if (stage === 'applied') {
              sendJson(res, { error: 'Use /apply to mark applied.' }, 400);
              return true;
            }
            const result = patchEuraxessOpportunity(id, {
              execution: {
                ...prev,
                stage: stage || null,
                ready_checked: readyChecked || Boolean(stage),
                stage_updated_at: new Date().toISOString(),
                notes: input.notes !== undefined ? String(input.notes || '') : (prev.notes || ''),
                application_num: prev.application_num ?? null,
                applied_at: prev.applied_at || '',
              },
              archived: false,
            });
            syncEuraxessOpportunitiesToDashboard();
            sendJson(res, result);
            return true;
          }
          const applied = input.applied !== false;
          const prev = existing.execution || {};
          if (!applied) {
            if (prev.application_num) {
              try { deleteTrackerRow({ num: Number(prev.application_num) }); } catch {}
            }
            const result = patchEuraxessOpportunity(id, {
              execution: {
                ...prev,
                stage: 'artifacts_ready',
                ready_checked: true,
                applied_at: '',
                application_num: null,
                stage_updated_at: new Date().toISOString(),
              },
            });
            syncEuraxessOpportunitiesToDashboard();
            sendJson(res, { opportunity: result.opportunity, application: null });
            return true;
          }
          const topic = euraxessTopic(existing);
          const reportPath = existing.research_report || existing.artifacts?.research_report || existing.resources?.report_md || '';
          const trackerResult = createTrackerRow({
            entry: {
              date: localDateString(new Date(), DEFAULT_DIGEST_TIMEZONE),
              company: existing.institution || 'EURAXESS',
              role: existing.title,
              score: Number.isFinite(Number(existing.score)) ? `${Number(existing.score).toFixed(1)}/5` : 'N/A',
              status: 'Applied',
              pdf: Boolean(existing.resources?.resume_pdf || existing.artifacts?.resume_pdf),
              report: reportPath ? `[${existing.external_id || existing.id}](${reportPath})` : '-',
              notes: existing.fit_rationale || 'Applied from EURAXESS Live Feed.',
            },
            metadata: {
              posting_url: existing.url,
              submitted_date: localDateString(new Date(), DEFAULT_DIGEST_TIMEZONE),
              university: existing.institution || '',
              field: EURAXESS_TOPIC_LABELS[topic] || topic || '',
              track_kind: 'phd',
            },
          });
          const result = patchEuraxessOpportunity(id, {
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
          syncEuraxessOpportunitiesToDashboard();
          sendJson(res, { opportunity: result.opportunity, application: trackerResult });
          return true;
        }
        const pack = action === 'queue-application-pack' || (action === 'retry' && input.pack);
        const updates = action === 'archive'
          ? {
              status: 'archived',
              archived: true,
              visible: false,
              worker_status: 'not_needed',
              needs_research: false,
              needs_application_pack: false,
              automation: { worker_status: 'not_needed', current_stage: 'applied_or_archived', last_error: '' },
              decision: { archive_reason: input.reason || input.archive_reason || 'Archived from dashboard.' },
            }
          : {
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
                runner: 'euraxess-factory',
              },
            };
        const result = patchEuraxessOpportunity(id, updates);
        let tasks = [];
        if (action !== 'archive') {
          const queued = queueEuraxessOpportunityWork(result.opportunity, { pack });
          tasks = queued.tasks || [];
        }
        syncEuraxessOpportunitiesToDashboard();
        sendJson(res, {
          ...result,
          tasks,
          message: action === 'archive'
            ? `Archived: ${result.opportunity.title}`
            : pack
              ? `Queued application pack for ${result.opportunity.title}. Hit Process queue or clear the Operations agent-task lane.`
              : `Queued research for ${result.opportunity.title}. Hit Process queue to run it.`,
        });
      } catch (err) {
        sendJson(res, { error: err?.message || 'failed to update EURAXESS opportunity' }, 400);
      }
      return true;
    }
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    const opportunity = findEuraxessOpportunity(id, readEuraxessOpportunities());
    if (!opportunity) {
      sendJson(res, { error: 'EURAXESS opportunity not found' }, 404);
      return true;
    }
    sendJson(res, { opportunity });
    return true;
  }
  if (pathname.startsWith('/api/phdscanner/opportunities/')) {
    const parts = pathname.split('/');
    const action = parts.length > 5 ? parts.pop() : '';
    const id = decodeURIComponent(parts.pop() || '');
    if (req.method === 'POST' && ['queue-research', 'queue-application-pack', 'archive', 'retry', 'execution', 'apply'].includes(action)) {
      try {
        const input = await readBodyJson(req);
        const existing = findPhdscannerOpportunity(id, readPhdscannerOpportunities());
        if (!existing) {
          sendJson(res, { error: 'PhDScanner opportunity not found' }, 404);
          return true;
        }
        if (action === 'execution' || action === 'apply') {
          const { PHDSCANNER_EXECUTION_STAGES, PHDSCANNER_TOPIC_LABELS, phdscannerTopic } = await import('./lib/phdscanner/filters.mjs');
          if (action === 'execution') {
            const prev = existing.execution || {};
            let stage = input.stage !== undefined ? input.stage : prev.stage;
            let readyChecked = input.ready_checked !== undefined ? Boolean(input.ready_checked) : Boolean(prev.ready_checked);
            if (input.ready_checked === true && !stage) stage = 'ready_for_application';
            if (input.ready_checked === false) { stage = null; readyChecked = false; }
            if (stage && !PHDSCANNER_EXECUTION_STAGES.includes(stage)) {
              sendJson(res, { error: `invalid execution stage: ${stage}` }, 400);
              return true;
            }
            if (stage === 'applied') {
              sendJson(res, { error: 'Use /apply to mark applied.' }, 400);
              return true;
            }
            const result = patchPhdscannerOpportunity(id, {
              execution: {
                ...prev,
                stage: stage || null,
                ready_checked: readyChecked || Boolean(stage),
                stage_updated_at: new Date().toISOString(),
                notes: input.notes !== undefined ? String(input.notes || '') : (prev.notes || ''),
                application_num: prev.application_num ?? null,
                applied_at: prev.applied_at || '',
              },
              archived: false,
            });
            syncPhdscannerOpportunitiesToDashboard();
            sendJson(res, result);
            return true;
          }
          const applied = input.applied !== false;
          const prev = existing.execution || {};
          if (!applied) {
            if (prev.application_num) {
              try { deleteTrackerRow({ num: Number(prev.application_num) }); } catch {}
            }
            const result = patchPhdscannerOpportunity(id, {
              execution: {
                ...prev,
                stage: 'artifacts_ready',
                ready_checked: true,
                applied_at: '',
                application_num: null,
                stage_updated_at: new Date().toISOString(),
              },
            });
            syncPhdscannerOpportunitiesToDashboard();
            sendJson(res, { opportunity: result.opportunity, application: null });
            return true;
          }
          const topic = phdscannerTopic(existing);
          const trackerResult = createTrackerRow({
            entry: {
              date: localDateString(new Date(), DEFAULT_DIGEST_TIMEZONE),
              company: existing.university || existing.institution || 'PhDScanner',
              role: existing.title,
              score: existing.score || 'N/A',
              status: 'Applied',
              pdf: Boolean(existing.resources?.resume_pdf || existing.artifacts?.resume_pdf),
              report: existing.research_report || existing.artifacts?.research_report
                ? `[${existing.id}](${existing.research_report || existing.artifacts.research_report})`
                : '-',
              notes: existing.fit_rationale || 'Applied from PhDScanner Feed.',
            },
            metadata: {
              posting_url: existing.url,
              submitted_date: localDateString(new Date(), DEFAULT_DIGEST_TIMEZONE),
              university: existing.university || existing.institution || '',
              field: PHDSCANNER_TOPIC_LABELS[topic] || topic || existing.discipline || '',
              track_kind: 'phd',
            },
          });
          const result = patchPhdscannerOpportunity(id, {
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
          syncPhdscannerOpportunitiesToDashboard();
          sendJson(res, { opportunity: result.opportunity, application: trackerResult });
          return true;
        }
        const pack = action === 'queue-application-pack' || (action === 'retry' && input.pack);
        const updates = action === 'archive'
          ? {
              status: 'archived',
              archived: true,
              visible: false,
              worker_status: 'not_needed',
              needs_research: false,
              needs_application_pack: false,
              automation: { worker_status: 'not_needed', current_stage: 'applied_or_archived', last_error: '' },
              decision: { archive_reason: input.reason || input.archive_reason || 'Archived from dashboard.' },
            }
          : {
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
            };
        const result = patchPhdscannerOpportunity(id, updates);
        let tasks = [];
        if (action !== 'archive') {
          const queued = queuePhdscannerOpportunityWork(result.opportunity, { pack });
          tasks = queued.tasks || [];
        }
        syncPhdscannerOpportunitiesToDashboard();
        sendJson(res, {
          ...result,
          tasks,
          message: action === 'archive'
            ? `Archived: ${result.opportunity.title}`
            : pack
              ? `Queued application pack for ${result.opportunity.title}. Hit Process queue when ready.`
              : `Queued research for ${result.opportunity.title}. Hit Process queue to run it.`,
        });
      } catch (err) {
        sendJson(res, { error: err?.message || 'failed to update PhDScanner opportunity' }, 400);
      }
      return true;
    }
    if (req.method === 'PATCH') {
      try {
        const input = await readBodyJson(req);
        const result = patchPhdscannerOpportunity(id, input || {});
        syncPhdscannerOpportunitiesToDashboard();
        sendJson(res, result);
      } catch (err) {
        sendJson(res, { error: err?.message || 'failed to patch PhDScanner opportunity' }, 400);
      }
      return true;
    }
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    const opportunity = findPhdscannerOpportunity(id, readPhdscannerOpportunities());
    if (!opportunity) {
      sendJson(res, { error: 'PhDScanner opportunity not found' }, 404);
      return true;
    }
    sendJson(res, { opportunity });
    return true;
  }
  if (pathname === '/api/company-focus') {
    if (req.method === 'GET') {
      try {
        sendJson(res, buildCompanyFocusReadModel({ focus: readCompanyFocus() }));
      } catch (err) {
        sendJson(res, { error: err?.message || 'failed to read company focus' }, 400);
      }
      return true;
    }
    if (req.method === 'PUT') {
      try {
        const input = await readBodyJson(req);
        sendJson(res, updateCompanyFocus(input || {}));
      } catch (err) {
        sendJson(res, { error: err?.message || 'failed to update company focus' }, 400);
      }
      return true;
    }
    return sendJson(res, { error: 'method not allowed' }, 405), true;
  }
  if (pathname === '/api/company-focus/pin') {
    if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405), true;
    try {
      const input = await readBodyJson(req);
      sendJson(res, pinCompanyFocus(input || {}), 201);
    } catch (err) {
      sendJson(res, { error: err?.message || 'failed to pin company focus' }, 400);
    }
    return true;
  }
  if (pathname === '/api/company-focus/advance') {
    if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405), true;
    try {
      const input = await readBodyJson(req);
      const result = advanceCompanyFocus(input || {});
      syncCompanyFocusToDashboard();
      sendJson(res, result);
    } catch (err) {
      sendJson(res, { error: err?.message || 'failed to advance company focus' }, 400);
    }
    return true;
  }
  if (pathname === '/api/networking') {
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    try {
      const focus = readCompanyFocus();
      sendJson(res, buildNetworkingReadModel(readNetworking(), new Date(), {
        focus_organization_id: focus.organization_id,
      }));
    } catch (err) {
      sendJson(res, { error: err?.message || 'failed to read networking data' }, 400);
    }
    return true;
  }
  if (pathname === '/api/networking/organizations') {
    if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405), true;
    try {
      const input = await readBodyJson(req);
      const result = upsertNetworkingOrganization(input || {});
      syncNetworkingToDashboard();
      logNetworkingActivity({ action: 'organization_saved', organization: result.organization });
      sendJson(res, result, 201);
    } catch (err) {
      sendJson(res, { error: err?.message || 'failed to save networking organization' }, 400);
    }
    return true;
  }
  if (pathname === '/api/networking/people') {
    if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405), true;
    try {
      const input = await readBodyJson(req);
      const result = upsertNetworkingPerson(input || {});
      syncNetworkingToDashboard();
      logNetworkingActivity({ action: 'person_saved', person: result.person });
      sendJson(res, result, 201);
    } catch (err) {
      sendJson(res, { error: err?.message || 'failed to save networking person' }, 400);
    }
    return true;
  }
  if (pathname.startsWith('/api/networking/people/')) {
    const personPath = pathname.slice('/api/networking/people/'.length).split('/');
    const id = decodeURIComponent(personPath[0] || '');
    const personAction = personPath[1] || '';
    if (!id) return sendJson(res, { error: 'networking person id required' }, 400), true;
    if (personAction === 'review') {
      if (req.method !== 'PATCH') return sendJson(res, { error: 'method not allowed' }, 405), true;
      try {
        const input = await readBodyJson(req);
        const result = reviewNetworkingPerson(id, input.action);
        syncNetworkingToDashboard();
        logNetworkingActivity({
          action: result.person.review_status === 'approved' ? 'candidate_approved' : 'candidate_rejected',
          person: result.person,
        });
        sendJson(res, result);
      } catch (err) {
        const status = /not found/i.test(err?.message || '') ? 404 : 400;
        sendJson(res, { error: err?.message || 'failed to review networking candidate' }, status);
      }
      return true;
    }
    if (req.method === 'PATCH') {
      try {
        const input = await readBodyJson(req);
        const result = patchNetworkingPerson(id, input || {});
        syncNetworkingToDashboard();
        logNetworkingActivity({
          action: input?.relationship_stage ? 'relationship_stage_changed' : 'person_updated',
          person: result.person,
        });
        sendJson(res, result);
      } catch (err) {
        const status = /not found/i.test(err?.message || '') ? 404 : 400;
        sendJson(res, { error: err?.message || 'failed to update networking person' }, status);
      }
      return true;
    }
    if (req.method === 'DELETE') {
      try {
        const result = deleteNetworkingPerson(id);
        syncNetworkingToDashboard();
        logNetworkingActivity({ action: 'person_deleted', person: result.person });
        sendJson(res, result);
      } catch (err) {
        const status = /not found/i.test(err?.message || '') ? 404 : 400;
        sendJson(res, { error: err?.message || 'failed to delete networking person' }, status);
      }
      return true;
    }
    sendJson(res, { error: 'method not allowed' }, 405);
    return true;
  }
  if (pathname === '/api/networking/interactions') {
    if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405), true;
    try {
      const input = await readBodyJson(req);
      const result = appendNetworkingInteraction(input || {});
      syncNetworkingToDashboard();
      logNetworkingActivity({ action: 'interaction_logged', person: result.person, interaction: result.interaction });
      sendJson(res, result, 201);
    } catch (err) {
      const status = /not found/i.test(err?.message || '') ? 404 : 400;
      sendJson(res, { error: err?.message || 'failed to log networking interaction' }, status);
    }
    return true;
  }
  if (pathname === '/api/networking/tasks') {
    if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405), true;
    try {
      const input = await readBodyJson(req);
      const result = upsertNetworkingTask(input || {});
      syncNetworkingToDashboard();
      logNetworkingActivity({ action: 'task_saved', task: result.task });
      sendJson(res, result, 201);
    } catch (err) {
      sendJson(res, { error: err?.message || 'failed to save networking task' }, 400);
    }
    return true;
  }
  if (pathname.startsWith('/api/networking/tasks/')) {
    const id = decodeURIComponent(pathname.slice('/api/networking/tasks/'.length).split('/')[0] || '');
    if (req.method !== 'PATCH') return sendJson(res, { error: 'method not allowed' }, 405), true;
    try {
      const input = await readBodyJson(req);
      const result = patchNetworkingTask(id, input || {});
      syncNetworkingToDashboard();
      logNetworkingActivity({ action: result.task.state === 'completed' ? 'task_completed' : 'task_updated', task: result.task });
      sendJson(res, result);
    } catch (err) {
      const status = /not found/i.test(err?.message || '') ? 404 : 400;
      sendJson(res, { error: err?.message || 'failed to update networking task' }, status);
    }
    return true;
  }
  if (pathname === '/api/networking/edges') {
    if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405), true;
    try {
      const input = await readBodyJson(req);
      const result = upsertNetworkingEdge(input || {});
      syncNetworkingToDashboard();
      logNetworkingActivity({ action: 'path_saved', notes: result.edge.notes });
      sendJson(res, result, 201);
    } catch (err) {
      sendJson(res, { error: err?.message || 'failed to save networking path' }, 400);
    }
    return true;
  }
  if (pathname === '/api/networking/events') {
    if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405), true;
    try {
      const input = await readBodyJson(req);
      const result = upsertNetworkingEvent(input || {});
      syncNetworkingToDashboard();
      logNetworkingActivity({ action: 'event_saved', notes: result.event.name });
      sendJson(res, result, 201);
    } catch (err) {
      sendJson(res, { error: err?.message || 'failed to save networking event' }, 400);
    }
    return true;
  }
  if (pathname === '/api/networking/research-queue') {
    if (req.method === 'GET') {
      sendJson(res, readNetworkingResearchQueue());
      return true;
    }
    if (req.method === 'POST') {
      try {
        const input = await readBodyJson(req);
        const result = queueNetworkingResearch(input || {});
        logNetworkingActivity({ action: 'research_queued', notes: result.order.organization_name });
        sendJson(res, result, result.duplicate ? 200 : 201);
      } catch (err) {
        sendJson(res, { error: err?.message || 'failed to queue networking research' }, 400);
      }
      return true;
    }
    sendJson(res, { error: 'method not allowed' }, 405);
    return true;
  }
  if (pathname.startsWith('/api/networking/research-queue/')) {
    const id = decodeURIComponent(pathname.slice('/api/networking/research-queue/'.length).split('/')[0] || '');
    if (req.method !== 'PATCH') return sendJson(res, { error: 'method not allowed' }, 405), true;
    try {
      const input = await readBodyJson(req);
      let result;
      if (input.action === 'start') result = markNetworkingResearchInProgress(id);
      else if (input.action === 'review_ready') result = markNetworkingResearchReviewReady(id, input.candidate_person_ids || []);
      else if (input.action === 'complete') result = completeNetworkingResearch(id);
      else if (input.action === 'fail') result = completeNetworkingResearch(id, { failed: true, error: input.error || '' });
      else if (input.action === 'cancel') {
        result = cancelNetworkingResearch(id);
        unlinkCanceledResearchOrder(result.order);
        syncConsiderJobsToDashboard();
        logNetworkingActivity({ action: 'research_canceled', notes: result.order.organization_name });
      }
      else throw new Error('networking research queue action must be start, review_ready, complete, fail, or cancel');
      sendJson(res, result);
    } catch (err) {
      const status = /not found/i.test(err?.message || '') ? 404 : 400;
      sendJson(res, { error: err?.message || 'failed to update networking research order' }, status);
    }
    return true;
  }
  if (pathname === '/api/jobs-to-consider') {
    if (req.method === 'GET') {
      sendJson(res, enrichConsiderJobsStore(readConsiderJobs()));
      return true;
    }
    if (req.method === 'POST') {
      try {
        const input = await readBodyJson(req);
        const store = upsertConsiderJob(input || {});
        syncConsiderJobsToDashboard();
        sendJson(res, store, 201);
      } catch (err) {
        sendJson(res, { error: err?.message || 'failed to create job to consider' }, 400);
      }
      return true;
    }
    sendJson(res, { error: 'method not allowed' }, 405);
    return true;
  }
  if (pathname.startsWith('/api/jobs-to-consider/')) {
    const segments = pathname.split('/');
    const action = segments.length > 4 ? segments.pop() : '';
    const id = decodeURIComponent(segments.pop() || '');

    if (req.method === 'POST' && action === 'queue-networking') {
      try {
        const input = await readBodyJson(req);
        const result = queueNetworkingForConsiderJob(id, {
          personas: input?.personas,
          notes: input?.notes || '',
        });
        syncConsiderJobsToDashboard();
        logNetworkingActivity({
          action: 'research_queued',
          notes: `${result.organization?.name || ''} ← ${result.job.title}`,
        });
        sendJson(res, result, result.duplicate ? 200 : 201);
      } catch (err) {
        const status = /not found/i.test(err?.message || '') ? 404 : 400;
        sendJson(res, { error: err?.message || 'failed to queue networking for job' }, status);
      }
      return true;
    }

    if (req.method === 'POST' && action === 'apply') {
      try {
        const input = await readBodyJson(req);
        const applied = input.applied !== false;
        const store = readConsiderJobs();
        const job = findConsiderJob(id, store);
        if (!job) {
          sendJson(res, { error: 'job not found' }, 404);
          return true;
        }

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
          syncConsiderJobsToDashboard();
          syncApplications();
          sendJson(res, { job: enrichConsiderJobWithNetworking(result.job), application: null });
          return true;
        }

        const reportPath = job.resources?.report_md || '';
        const report = reportPath
          ? `[${job.id.replace(/-/g, ' ')}](${reportPath})`
          : '-';
        assertConsiderJobApplyAllowed(job, { force: input.force_apply === true });
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
        let networking = null;
        if (input.queue_networking === true) {
          try {
            networking = queueNetworkingForConsiderJob(result.job.id);
          } catch (err) {
            networking = { error: err?.message || 'failed to queue networking research' };
          }
        }
        syncConsiderJobsToDashboard();
        syncApplications();
        sendJson(res, {
          job: enrichConsiderJobWithNetworking(networking?.job || result.job),
          application: trackerResult,
          networking,
        });
      } catch (err) {
        sendJson(res, { error: err?.message || 'failed to update applied state' }, 400);
      }
      return true;
    }

    if (req.method === 'PATCH' && !action) {
      try {
        const updates = await readBodyJson(req);
        const result = patchConsiderJob(id, updates || {});
        if (updates.status !== undefined || updates.applied !== undefined) {
          logJobConsiderPatchEvent(result.job, updates);
        }
        syncConsiderJobsToDashboard();
        sendJson(res, result);
      } catch (err) {
        const status = /not found/i.test(err?.message || '') ? 404 : 400;
        sendJson(res, { error: err?.message || 'failed to update job to consider' }, status);
      }
      return true;
    }

    if (req.method === 'DELETE' && !action) {
      try {
        const input = await readBodyJson(req);
        const result = deleteConsiderJob({ id, ...(input || {}) }, CANONICAL_JOBS_FILE, { missingOk: true });
        const dashboard = syncConsiderJobsToDashboard();
        sendJson(res, { ...result, total: dashboard.total });
      } catch (err) {
        const status = /not found/i.test(err?.message || '') ? 404 : 400;
        sendJson(res, { error: err?.message || 'failed to delete job to consider' }, status);
      }
      return true;
    }

    sendJson(res, { error: 'method not allowed' }, 405);
    return true;
  }
  if (pathname === '/api/research-prospects') {
    if (req.method === 'GET') {
      sendJson(res, readResearchProspects({ source: 'umich' }));
      return true;
    }
    if (req.method === 'POST') {
      try {
        const input = await readBodyJson(req);
        const store = upsertResearchProspect(input || {}, { source: 'umich' });
        const dashboard = syncResearchProspectsToDashboard({ institution: 'umich' });
        sendJson(res, store, 201);
        void dashboard;
      } catch (err) {
        sendJson(res, { error: err?.message || 'failed to create research prospect' }, 400);
      }
      return true;
    }
    sendJson(res, { error: 'method not allowed' }, 405);
    return true;
  }
  if (pathname.startsWith('/api/research-prospects/')) {
    const id = decodeURIComponent(pathname.slice('/api/research-prospects/'.length).split('/')[0] || '');
    if (!id) {
      sendJson(res, { error: 'research prospect id required' }, 400);
      return true;
    }
    if (req.method === 'GET') {
      const prospect = findResearchProspect(id, { source: 'umich' });
      if (!prospect) {
        sendJson(res, { error: 'research prospect not found' }, 404);
        return true;
      }
      sendJson(res, { prospect });
      return true;
    }
    if (req.method === 'PATCH') {
      try {
        const updates = await readBodyJson(req);
        const result = patchResearchProspect(id, updates || {}, { source: 'umich' });
        const dashboard = syncResearchProspectsToDashboard({ institution: 'umich' });
        if (updates?.status) logResearchStatusEvent(result.prospect, 'umich');
        sendJson(res, withToday({ ...result, total: dashboard.total }));
      } catch (err) {
        const status = /not found/i.test(err?.message || '') ? 404 : 400;
        sendJson(res, { error: err?.message || 'failed to update research prospect' }, status);
      }
      return true;
    }
    sendJson(res, { error: 'method not allowed' }, 405);
    return true;
  }
  if (pathname.startsWith('/api/phd-research-prospects/')) {
    const parts = pathname.split('/').filter(Boolean);
    // ['api','phd-research-prospects', source] or [..., source, id]
    const sourceId = decodeURIComponent(parts[2] || '');
    const prospectId = parts.length >= 4 ? decodeURIComponent(parts[3] || '') : '';
    if (!sourceId) {
      sendJson(res, { error: 'PhD research source required' }, 400);
      return true;
    }

    if (!prospectId) {
      if (req.method === 'GET') {
        sendJson(res, readResearchProspects({ source: sourceId }));
        return true;
      }
      if (req.method === 'POST') {
        try {
          const input = await readBodyJson(req);
          const store = upsertResearchProspect({
            ...(input || {}),
            source: sourceId,
            institution: input?.institution || sourceId,
          }, { source: sourceId });
          syncResearchProspectsToDashboard({ source: sourceId });
          sendJson(res, store, 201);
        } catch (err) {
          sendJson(res, { error: err?.message || 'failed to create PhD research prospect' }, 400);
        }
        return true;
      }
      sendJson(res, { error: 'method not allowed' }, 405);
      return true;
    }

    if (req.method === 'GET') {
      const prospect = findResearchProspect(prospectId, { source: sourceId });
      if (!prospect) {
        sendJson(res, { error: 'PhD research prospect not found' }, 404);
        return true;
      }
      sendJson(res, { prospect });
      return true;
    }
    if (req.method === 'PATCH') {
      try {
        const updates = await readBodyJson(req);
        const result = patchResearchProspect(prospectId, updates || {}, { source: sourceId });
        const dashboard = syncResearchProspectsToDashboard({ source: sourceId });
        if (updates?.status) logResearchStatusEvent(result.prospect, sourceId);
        sendJson(res, withToday({ ...result, total: dashboard.total }));
      } catch (err) {
        const status = /not found/i.test(err?.message || '') ? 404 : 400;
        sendJson(res, { error: err?.message || 'failed to update PhD research prospect' }, status);
      }
      return true;
    }
    sendJson(res, { error: 'method not allowed' }, 405);
    return true;
  }

  const simpleFiles = {
    '/api/action-plan': 'action-plan.json',
    '/api/actions': 'actions.json',
    '/api/agent-tasks': 'agent-tasks.json',
    '/api/applications': 'applications.json',
    '/api/applications/dashboard': 'application-dashboard.json',
    '/api/autonomy/model-health': 'autonomy/model-health.json',
    '/api/autonomy/research-budget': 'autonomy/research-budget.json',
    '/api/autonomy/runs': 'autonomy/runs.json',
    '/api/contacts': 'contacts.json',
    '/api/jobs': 'jobs.json',
  };
  if (simpleFiles[pathname]) {
    if (req.method !== 'GET') return sendJson(res, { error: 'method not allowed' }, 405), true;
    sendJson(res, readJson(dataFile(simpleFiles[pathname]), {}));
    return true;
  }

  return false;
}

export function startFastServer(port = PORT, host = HOST) {
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (!origin || origin === 'null' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.setHeader('access-control-allow-origin', origin || '*');
    }
    res.setHeader('vary', 'Origin');
    res.setHeader('access-control-allow-headers', 'Content-Type');
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${host}:${port}`);
    const pathname = url.pathname;

    if (pathname === '/healthz') {
      sendJson(res, {
        ok: true,
        mode: process.env.AUTONOMY_MODE || 'unknown',
        server: 'fast-control',
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
      });
      return;
    }
    if (pathname === '/') {
      res.writeHead(302, { location: '/dashboard/fusion-pivot-dashboard.html' });
      res.end();
      return;
    }
    if (pathname === '/stream') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      });
      res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);
      return;
    }
    if (pathname.startsWith('/api/') && await routeApi(req, res, pathname, url)) return;
    if (pathname.startsWith('/data/')) {
      serveFile(res, dataFile(decodeURIComponent(pathname.slice('/data/'.length))));
      return;
    }
    if (pathname.startsWith('/dashboard/')) {
      serveFile(res, safeJoin(DASHBOARD_DIR, decodeURIComponent(pathname.slice('/dashboard/'.length))));
      return;
    }
    if (pathname.startsWith('/reports/')) {
      serveFile(res, safeJoin(REPORTS_DIR, decodeURIComponent(pathname.slice('/reports/'.length))));
      return;
    }
    if (pathname.startsWith('/output/')) {
      serveFile(res, safeJoin(OUTPUT_DIR, decodeURIComponent(pathname.slice('/output/'.length))));
      return;
    }
    if (pathname.startsWith('/runtime/')) {
      serveFile(res, safeJoin(RUNTIME_DIR, decodeURIComponent(pathname.slice('/runtime/'.length))));
      return;
    }

    sendText(res, 'Not found', 404);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      console.log(`\n  Dashboard: http://${host}:${port}`);
      console.log(`  Fast control server: http://${host}:${port}/healthz\n`);
      resolve(server);
    });
  });
}

if (process.argv[1]?.endsWith('server-fast.mjs')) {
  await startFastServer();
}
