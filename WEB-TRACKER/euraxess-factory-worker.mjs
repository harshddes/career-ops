#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { processEuraxessFactory, RUNTIME_DIR } from './lib/euraxess/factory.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const LOCK_FILE = join(RUNTIME_DIR, 'euraxess-factory-worker.lock');
const LOCK_TTL_MS = 30 * 60_000;
const args = process.argv.slice(2);

mkdirSync(RUNTIME_DIR, { recursive: true });

function argValue(name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function flag(name) {
  return args.includes(name);
}

function acquireLock() {
  let lock = null;
  if (existsSync(LOCK_FILE)) {
    try {
      lock = JSON.parse(readFileSync(LOCK_FILE, 'utf-8'));
    } catch {
      lock = null;
    }
  }
  if (lock?.started_at) {
    const age = Date.now() - new Date(lock.started_at).getTime();
    if (Number.isFinite(age) && age < LOCK_TTL_MS) return false;
  }
  writeFileSync(LOCK_FILE, JSON.stringify({
    pid: process.pid,
    started_at: new Date().toISOString(),
    cwd: BASE,
  }, null, 2));
  return true;
}

function releaseLock() {
  try { unlinkSync(LOCK_FILE); } catch {}
}

async function main() {
  const dryRun = flag('--dry-run');
  const max = Number(argValue('--max', 3));
  const pollTimeoutSec = Number(argValue('--poll-timeout', dryRun ? 1 : 120));
  const force = flag('--force');

  if (!dryRun && !acquireLock()) {
    return {
      ok: true,
      skipped: true,
      reason: 'euraxess factory worker already running',
      lock_file: LOCK_FILE,
    };
  }
  try {
    const result = await processEuraxessFactory({
      max: Number.isFinite(max) && max > 0 ? max : 3,
      dryRun,
      force,
      retryFailures: flag('--retry-failures'),
      pollTimeoutSec: Number.isFinite(pollTimeoutSec) && pollTimeoutSec > 0 ? pollTimeoutSec : 120,
    });
    return { ok: true, ...result };
  } finally {
    if (!dryRun) releaseLock();
  }
}

const result = await main().catch(err => ({
  ok: false,
  generated_at: new Date().toISOString(),
  error: err?.stack || err?.message || String(err),
}));

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
