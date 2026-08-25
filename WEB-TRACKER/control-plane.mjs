#!/usr/bin/env node
import { execFile } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { runPreflight } from './lib/preflight.mjs';
import { nodeScriptInvocation } from './lib/node-exec.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS = join(BASE, '..');
const DATA_DIR = join(BASE, 'data');
const RUNTIME_DIR = join(BASE, 'runtime');
const LOCK_FILE = join(RUNTIME_DIR, 'control-plane.lock');
const LOCK_TTL_MS = 2 * 60 * 60_000;
const args = process.argv.slice(2);

mkdirSync(RUNTIME_DIR, { recursive: true });

function hasArg(name) {
  return args.includes(name);
}

function acquireLock() {
  if (existsSync(LOCK_FILE)) {
    const startedAt = Number(readFileSync(LOCK_FILE, 'utf-8') || 0);
    const ageMs = Date.now() - startedAt;
    if (Number.isFinite(ageMs) && ageMs < LOCK_TTL_MS) {
      throw new Error('control-plane tick already running; lock file is fresh.');
    }
  }
  writeFileSync(LOCK_FILE, String(Date.now()), 'utf-8');
  return () => {
    try { writeFileSync(LOCK_FILE, '', 'utf-8'); } catch {}
  };
}

function runNode(script, scriptArgs = [], { cwd = BASE, timeoutMs = 180_000 } = {}) {
  return new Promise(resolve => {
    execFile(process.execPath, nodeScriptInvocation(join(BASE, script), scriptArgs), {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
    }, (err, stdout = '', stderr = '') => {
      resolve({
        script,
        ok: !err,
        exit_code: err?.code || 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error: err?.message || '',
      });
    });
  });
}

async function main() {
  const release = acquireLock();
  const steps = [];
  try {
    const preflight = await runPreflight({
      trackerDir: BASE,
      careerOpsDir: CAREER_OPS,
      checkHealth: hasArg('--health'),
      port: Number(process.env.PORT || 3737),
    });
    steps.push({ step: 'preflight', ok: preflight.ok, result: preflight });
    if (!preflight.json.every(item => item.ok)) {
      return { ok: false, steps, error: 'preflight JSON checks failed' };
    }

    steps.push({ step: 'euraxess-scan', ...(await runNode('euraxess-scan.mjs', hasArg('--all') ? ['--all', '--refresh-liveness'] : ['--refresh-liveness'])) });
    steps.push({ step: 'phdscanner-scan', ...(await runNode('phdscanner-scan.mjs', hasArg('--all') ? ['--all', '--refresh-liveness'] : ['--refresh-liveness'])) });
    steps.push({ step: 'findaphd-scan', ...(await runNode('findaphd-scan.mjs', hasArg('--all') ? ['--all', '--refresh-liveness'] : ['--refresh-liveness'], { timeoutMs: 600_000 })) });
    if (hasArg('--euraxess-factory')) {
      steps.push({ step: 'euraxess-factory-worker', ...(await runNode('euraxess-factory-worker.mjs', ['--max', '3'], { timeoutMs: 600_000 })) });
    }
    if (hasArg('--phdscanner-factory')) {
      steps.push({ step: 'phdscanner-factory-worker', ...(await runNode('phdscanner-factory-worker.mjs', ['--max', '3'], { timeoutMs: 600_000 })) });
    }
    steps.push({ step: 'sync-all', ...(await runNode(join('adapters', 'sync-all.mjs')) ) });
    if (hasArg('--autopilot')) {
      steps.push({ step: 'deep-research-gate', ...(await runNode('deep-research-gate.mjs')) });
    }
    if (hasArg('--publish')) {
      steps.push({ step: 'publish-dashboard', ...(await runNode(join('lib', 'generate-static-snapshot.mjs'), [], { timeoutMs: 300_000 })) });
    }

    return {
      ok: steps.every(step => step.ok !== false),
      generated_at: new Date().toISOString(),
      data_dir: DATA_DIR,
      steps,
    };
  } finally {
    release();
  }
}

const result = await main().catch(err => ({
  ok: false,
  generated_at: new Date().toISOString(),
  error: err.message,
}));
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
