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
import { sendDailyDigest } from './lib/daily-digest.mjs';

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

function runScript(scriptPath, scriptArgs = []) {
  return new Promise((resolve) => {
    const proc = execFile('node', [join(BASE, scriptPath), ...scriptArgs], {
      cwd: BASE,
      timeout: 120_000,
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

const { startServer } = await import('./server.mjs');
await startServer();

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

  // Career-ops data sync: every 2 hours
  cron.schedule('0 */2 * * *', async () => {
    console.log(`\n[cron] Syncing career-ops data...`);
    await runScript('adapters/sync-all.mjs');
  });

  const digestTimezone = process.env.DAILY_DIGEST_TIMEZONE || process.env.TZ || 'America/New_York';
  if (envEnabled(process.env.DAILY_DIGEST_ENABLED)) {
    cron.schedule('59 23 * * *', async () => {
      console.log(`\n[cron] Sending daily digest...`);
      try {
        await runScript('adapters/sync-all.mjs');
        await runCareerOpsScript('followup-cadence.mjs');
        const result = await sendDailyDigest({ timeZone: digestTimezone });
        console.log(`[cron] Daily digest sent: ${result.messageId || 'sent'}`);
      } catch (err) {
        console.error(`[cron] Daily digest failed: ${err.message}`);
      }
    }, { timezone: digestTimezone });
  }

  if (MODE === 'autopilot') {
    // Deep research gate: every 4 hours
    cron.schedule('0 */4 * * *', async () => {
      console.log(`\n[cron] Processing research gate...`);
      await runScript('deep-research-gate.mjs');
    });
  }

  console.log(`[cron] Scheduled: jobs (8h), PhD (48h), sync (2h)${MODE === 'autopilot' ? ', gate (4h)' : ''}${envEnabled(process.env.DAILY_DIGEST_ENABLED) ? `, daily digest (23:59 ${digestTimezone})` : ''}`);
  console.log('[cron] Jobs to Consider liveness is scheduled by the dashboard server.');
}

console.log(`\n[ready] Dashboard running at http://localhost:3737`);
console.log(`[ready] Press Ctrl+C to stop\n`);

runStartupWork().catch(err => {
  console.error(`[boot] Background startup work failed: ${err.message}`);
});
