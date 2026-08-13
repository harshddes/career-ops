#!/usr/bin/env node
/**
 * run.mjs — Single entry point for the Adaptive Fusion Research OS
 *
 * Three autonomy modes:
 *   autopilot  — scheduler + scans + gated deep research run automatically
 *   assisted   — scheduler runs scans; deep research waits for user approval
 *   manual     — only runs when you trigger commands explicitly
 *
 * Usage:
 *   node run.mjs                      # default: assisted mode
 *   node run.mjs --mode autopilot     # fully autonomous
 *   node run.mjs --mode manual        # server only, no crons
 *   node run.mjs --no-open            # don't auto-open browser
 */

import { loadEnv } from './lib/load-env.mjs';

const envLoad = loadEnv();

import { execFile } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

const BASE = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS = join(BASE, '..');
const args = process.argv.slice(2);

const modeIdx = args.indexOf('--mode');
const MODE = modeIdx !== -1 ? args[modeIdx + 1] : 'assisted';
const NO_OPEN = args.includes('--no-open');
process.env.AUTONOMY_MODE = MODE;

console.log(`
╔══════════════════════════════════════════════════╗
║       FUSION PIVOT — Research OS v1.0.0          ║
║       Mode: ${MODE.toUpperCase().padEnd(36)}║
╚══════════════════════════════════════════════════╝
`);

if (!envLoad.loaded) {
  console.log(`[boot] No .env file at ${envLoad.path}`);
  console.log('[boot] Daily email disabled until you copy WEB-TRACKER/.env.example → WEB-TRACKER/.env');
} else if (!process.env.SMTP_PASS) {
  console.log(`[boot] Loaded ${envLoad.path} but SMTP_PASS is empty`);
  console.log('[boot] Add a Gmail App Password: https://myaccount.google.com/apppasswords');
}

// ── Helper: run a script ────────────────────────────────────────────

function runScript(scriptPath, scriptArgs = [], { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve) => {
    const proc = execFile('node', [join(BASE, scriptPath), ...scriptArgs], {
      cwd: BASE,
      timeout: timeoutMs,
    }, (err, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      resolve(err ? 1 : 0);
    });
  });
}

function runCareerOpsScript(scriptPath, scriptArgs = []) {
  return new Promise((resolve) => {
    execFile('node', [join(CAREER_OPS, scriptPath), ...scriptArgs], {
      cwd: CAREER_OPS,
      timeout: 120_000,
    }, (err, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      resolve(err ? 1 : 0);
    });
  });
}

function envEnabled(value) {
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase());
}

async function checkAutonomyHealth() {
  try {
    const res = await fetch('http://127.0.0.1:3737/api/autonomy/model-health');
    if (!res.ok) {
      console.log(`[boot] Autonomy API check failed: HTTP ${res.status}`);
      return;
    }
    const health = await res.json();
    const local = health.local || {};
    console.log(`[boot] Autonomy API: ready`);
    console.log(`[boot] Local model: ${local.ok ? 'ready' : 'needs setup'}${local.selected_model ? ` (${local.selected_model})` : ''}`);
    if (!local.ok && Array.isArray(local.repair_actions) && local.repair_actions.length) {
      console.log(`[boot] Repair: ${local.repair_actions[0].description}`);
    }
  } catch (err) {
    console.log(`[boot] Autonomy health unavailable: ${err.message}`);
  }
}

async function runStartupWork() {
  if (MODE !== 'manual') {
    console.log('[boot] Running initial EURAXESS opportunity scan in background...');
    await runScript('euraxess-scan.mjs', ['--all', '--refresh-liveness']);
    await runScript('euraxess-factory-worker.mjs', ['--max', '3']);

    console.log('[boot] Running initial PhDScanner / PhD-board opportunity scan in background...');
    await runScript('phdscanner-scan.mjs', ['--all', '--refresh-liveness']);
    await runScript('phdscanner-factory-worker.mjs', ['--max', '3']);
    const findaphdCode = await runScript('findaphd-scan.mjs', ['--all', '--refresh-liveness'], { timeoutMs: 600_000 });
    if (findaphdCode) console.warn('[boot] FindAPhD scan exited non-zero (Cloudflare/playwright may need a later tick).');

    console.log('[boot] Running initial U-M Careers discovery sweep in background...');
    const umichCode = await runScript('umich-careers-scan.mjs', ['--discover'], { timeoutMs: 600_000 });
    if (umichCode) console.warn('[boot] U-M Careers discovery exited non-zero (will retry on cron).');
  }

  console.log('[boot] Syncing career-ops data in background...');
  await runScript('adapters/sync-all.mjs');

  if (MODE !== 'manual') {
    console.log('[boot] Running initial fusion job scan in background...');
    await runScript('fusion-scan.mjs', ['--all']);

    console.log('[boot] Running initial PhD/lab scan in background...');
    await runScript('phd-scan.mjs', ['--all']);

    if (MODE === 'autopilot') {
      console.log('[boot] Processing events through research gate in background...');
      await runScript('deep-research-gate.mjs');
    }
  }

  await checkAutonomyHealth();
  console.log('[boot] Background startup work complete.');
}

// ── Step 1: Start server first ──────────────────────────────────────
// Full server is the default: it implements every dashboard write endpoint
// (applications create/edit/delete, schedule, action plan, agent tasks, autonomy).
// The fast server is a read-mostly subset kept for static snapshot generation;
// opt in with CAREER_OPS_FAST_SERVER=1 only if you know you don't need writes.

if (envEnabled(process.env.CAREER_OPS_FAST_SERVER)) {
  const { startFastServer } = await import('./server-fast.mjs');
  await startFastServer();
} else {
  const { startServer } = await import('./server.mjs');
  await startServer();
}

// ── Step 2: Open browser ────────────────────────────────────────────

if (!NO_OPEN) {
  const { exec } = await import('child_process');
  const url = 'http://localhost:3737';
  const platform = process.platform;
  if (platform === 'win32') exec(`start ${url}`);
  else if (platform === 'darwin') exec(`open ${url}`);
  else exec(`xdg-open ${url}`);
}

// ── Step 3: Schedule cron jobs ──────────────────────────────────────

if (MODE !== 'manual') {
  // Job scan: every 8 hours
  cron.schedule('0 */8 * * *', async () => {
    console.log(`\n[cron] Running fusion job scan...`);
    await runScript('fusion-scan.mjs');
    await runScript('adapters/sync-all.mjs');
  });

  // PhD scan: every 48 hours (at 6am on odd days)
  cron.schedule('0 6 1-31/2 * *', async () => {
    console.log(`\n[cron] Running PhD/lab scan...`);
    await runScript('phd-scan.mjs');
    await runScript('adapters/sync-all.mjs');
  });

  // EURAXESS discovery: every 2 hours, offset away from busy top-of-hour cron.
  cron.schedule('17 */2 * * *', async () => {
    console.log(`\n[cron] Running EURAXESS opportunity scan...`);
    await runScript('euraxess-scan.mjs', ['--refresh-liveness']);
    await runScript('euraxess-factory-worker.mjs', ['--max', '3']);
    await runScript('adapters/sync-all.mjs');
  });

  // PhD board discovery (PhDScanner + FindAPhD): every 2 hours, offset from EURAXESS.
  cron.schedule('27 */2 * * *', async () => {
    console.log(`\n[cron] Running PhDScanner opportunity scan...`);
    await runScript('phdscanner-scan.mjs', ['--refresh-liveness']);
    await runScript('phdscanner-factory-worker.mjs', ['--max', '3']);
    console.log(`\n[cron] Running FindAPhD opportunity scan...`);
    await runScript('findaphd-scan.mjs', ['--refresh-liveness'], { timeoutMs: 600_000 });
    await runScript('adapters/sync-all.mjs');
  });

  // U-M Careers discovery: every 15 minutes (page-1 new IDs only).
  cron.schedule('*/15 * * * *', async () => {
    console.log(`\n[cron] Running U-M Careers discovery sweep...`);
    await runScript('umich-careers-scan.mjs', ['--discover'], { timeoutMs: 600_000 });
  });

  // U-M Careers full F/P reconciliation: every 6 hours.
  cron.schedule('7 */6 * * *', async () => {
    console.log(`\n[cron] Running U-M Careers full reconcile...`);
    await runScript('umich-careers-scan.mjs', ['--full'], { timeoutMs: 45 * 60_000 });
    await runScript('adapters/sync-all.mjs');
  });

  // U-M Careers rolling detail refresh: daily.
  cron.schedule('41 4 * * *', async () => {
    console.log(`\n[cron] Running U-M Careers detail refresh...`);
    await runScript('umich-careers-scan.mjs', ['--details'], { timeoutMs: 30 * 60_000 });
    await runScript('adapters/sync-all.mjs');
  });

  // EURAXESS factory: every 15 minutes while the dashboard process is alive.
  cron.schedule('*/15 * * * *', async () => {
    console.log(`\n[cron] Running EURAXESS factory worker tick...`);
    await runScript('euraxess-factory-worker.mjs', ['--max', '1']);
  });

  // PhDScanner factory: every 15 minutes, offset from EURAXESS factory.
  cron.schedule('7,22,37,52 * * * *', async () => {
    console.log(`\n[cron] Running PhDScanner factory worker tick...`);
    await runScript('phdscanner-factory-worker.mjs', ['--max', '1']);
  });

  if (process.env.APIFY_TOKEN || process.env.EURAXESS_APIFY_TOKEN) {
    cron.schedule('37 3 * * *', async () => {
      console.log(`\n[cron] Running EURAXESS provider backfill...`);
      await runScript('euraxess-backfill.mjs', ['--profile', 'fusion_plasma_diagnostics', '--max', '500']);
      await runScript('adapters/sync-all.mjs');
    });
  }

  // Career-ops data sync: every 2 hours
  cron.schedule('0 */2 * * *', async () => {
    console.log(`\n[cron] Syncing career-ops data...`);
    await runScript('adapters/sync-all.mjs');
  });

  if (MODE === 'autopilot') {
    // Deep research gate: every 4 hours
    cron.schedule('0 */4 * * *', async () => {
      console.log(`\n[cron] Processing research gate...`);
      await runScript('deep-research-gate.mjs');
    });
  }

  console.log(`[cron] Scheduled: jobs (8h), PhD (48h), EURAXESS scan (2h), PhD board scan (2h), U-M Careers discover (15m) + full (6h) + details (daily), EURAXESS factory (15m), PhDScanner factory (15m), sync (2h)${process.env.APIFY_TOKEN || process.env.EURAXESS_APIFY_TOKEN ? ', EURAXESS backfill (daily)' : ''}${MODE === 'autopilot' ? ', gate (4h)' : ''}`);
  if (envEnabled(process.env.JOBS_TO_CONSIDER_LIVENESS)) {
    console.log('[cron] Jobs to Consider liveness is scheduled by the dashboard server.');
  } else {
    console.log('[cron] Jobs to Consider liveness is off; use the control worker for heavy checks.');
  }
}

// Daily digest is independent of scan autonomy — still needs the process (or Windows task) awake.
const digestTimezone = process.env.DAILY_DIGEST_TIMEZONE || process.env.TZ || 'America/New_York';
async function runScheduledDigestCron(label) {
  console.log(`\n[cron] ${label}...`);
  try {
    await runScript('adapters/sync-all.mjs');
    await runCareerOpsScript('followup-cadence.mjs');
    const { sendScheduledDailyDigest } = await import('./scripts/send-daily-digest.mjs');
    const result = await sendScheduledDailyDigest({ timeZone: digestTimezone });
    if (result.skipped) {
      console.log(`[cron] Daily digest skipped: ${result.reason}${result.date ? ` (${result.date})` : ''}`);
      return;
    }
    console.log(`[cron] Daily digest sent: ${result.messageId || 'sent'} → ${(result.accepted || []).join(', ') || 'see SMTP log'}`);
  } catch (err) {
    console.error(`[cron] Daily digest failed: ${err.message}`);
  }
}
if (envEnabled(process.env.DAILY_DIGEST_ENABLED)) {
  cron.schedule('59 23 * * *', () => runScheduledDigestCron('Sending daily digest'), { timezone: digestTimezone });
  // One-night backup: 02:00 ET on 2026-08-13 still sends the Aug 12 digest; other nights no-op via the window check.
  cron.schedule('0 2 * * *', () => runScheduledDigestCron('Overnight digest window check'), { timezone: digestTimezone });
  console.log(`[cron] Daily digest armed for 23:59 ${digestTimezone} → ${(process.env.DAILY_DIGEST_RECIPIENTS || 'default recipients')}`);
  console.log('[cron] One-night 02:00 backup armed (2026-08-13 only; later nights skip)');
} else {
  console.log('[cron] Daily digest off (set DAILY_DIGEST_ENABLED=true in WEB-TRACKER/.env)');
}

console.log(`\n[ready] Dashboard running at http://localhost:3737`);
console.log(`[ready] Press Ctrl+C to stop\n`);

runStartupWork().catch(err => {
  console.error(`[boot] Background startup work failed: ${err.message}`);
});
