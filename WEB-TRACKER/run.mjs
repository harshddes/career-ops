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

import { execFile } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';

const BASE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const modeIdx = args.indexOf('--mode');
const MODE = modeIdx !== -1 ? args[modeIdx + 1] : 'assisted';
const NO_OPEN = args.includes('--no-open');

console.log(`
╔══════════════════════════════════════════════════╗
║       FUSION PIVOT — Research OS v1.0.0          ║
║       Mode: ${MODE.toUpperCase().padEnd(36)}║
╚══════════════════════════════════════════════════╝
`);

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

// ── Step 1: Sync career-ops data ────────────────────────────────────

console.log('[boot] Syncing career-ops data...');
await runScript('adapters/sync-all.mjs');

// ── Step 2: Initial scan ────────────────────────────────────────────

if (MODE !== 'manual') {
  console.log('[boot] Running initial fusion job scan...');
  await runScript('fusion-scan.mjs', ['--all']);

  console.log('[boot] Running initial PhD/lab scan...');
  await runScript('phd-scan.mjs', ['--all']);

  if (MODE === 'autopilot') {
    console.log('[boot] Processing events through research gate...');
    await runScript('deep-research-gate.mjs');
  }
}

// ── Step 3: Start server ────────────────────────────────────────────

const { startServer } = await import('./server.mjs');
const server = await startServer();

// ── Step 4: Open browser ────────────────────────────────────────────

if (!NO_OPEN) {
  const { exec } = await import('child_process');
  const url = 'http://localhost:3737';
  const platform = process.platform;
  if (platform === 'win32') exec(`start ${url}`);
  else if (platform === 'darwin') exec(`open ${url}`);
  else exec(`xdg-open ${url}`);
}

// ── Step 5: Schedule cron jobs ──────────────────────────────────────

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

  // Jobs to Consider liveness: weekly, archive closed/missing postings
  cron.schedule('0 9 * * 1', async () => {
    console.log(`\n[cron] Checking Jobs to Consider liveness...`);
    await runScript('jobs-to-consider-liveness.mjs');
    await runScript('adapters/sync-all.mjs');
  });

  if (MODE === 'autopilot') {
    // Deep research gate: every 4 hours
    cron.schedule('0 */4 * * *', async () => {
      console.log(`\n[cron] Processing research gate...`);
      await runScript('deep-research-gate.mjs');
    });
  }

  console.log(`[cron] Scheduled: jobs (8h), PhD (48h), sync (2h), jobs liveness (weekly)${MODE === 'autopilot' ? ', gate (4h)' : ''}`);
}

console.log(`\n[ready] Dashboard running at http://localhost:3737`);
console.log(`[ready] Press Ctrl+C to stop\n`);
