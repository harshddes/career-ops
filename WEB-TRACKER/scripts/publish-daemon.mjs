#!/usr/bin/env node
/**
 * publish-daemon.mjs — Watch local dashboard data and auto-push to harshddes.github.io
 */

import { watch } from 'chokidar';
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateStaticSnapshot } from '../lib/generate-static-snapshot.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const TRACKER = join(BASE, '..');
const CAREER_OPS = join(TRACKER, '..');
const GITHUB_IO = join(CAREER_OPS, '..', 'harshddes.github.io');
const OUTPUT_DIR = join(GITHUB_IO, 'career-dashboard');
const LOG_DIR = join(TRACKER, 'runtime');
const LOG_FILE = join(LOG_DIR, 'publish-daemon.log');
const DEBOUNCE_MS = 45_000;
const PUSH_RETRIES = 3;

const WATCH_PATHS = [
  join(TRACKER, 'data'),
  join(CAREER_OPS, 'data'),
  join(CAREER_OPS, 'data', 'application-dashboard.json'),
  join(CAREER_OPS, 'data', 'jobs-to-consider.json'),
  join(CAREER_OPS, 'data', 'jobs-to-consider-user-state.json'),
  join(CAREER_OPS, 'data', 'research-prospect-user-state.json'),
];

let debounceTimer = null;
let publishing = false;
let queued = false;
let ignoreWatch = false;

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(LOG_FILE, `${line}\n`, 'utf-8');
}

function runGit(args) {
  return execFileSync('git', args, {
    cwd: GITHUB_IO,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function gitPushWithRetry() {
  let lastError = null;
  for (let attempt = 1; attempt <= PUSH_RETRIES; attempt += 1) {
    try {
      runGit(['push', 'origin', 'main']);
      return;
    } catch (err) {
      lastError = err;
      log(`git push attempt ${attempt}/${PUSH_RETRIES} failed: ${err.message}`);
    }
  }
  throw lastError;
}

function gitHasChanges() {
  const status = runGit(['status', '--porcelain', 'career-dashboard']);
  return Boolean(status);
}

function ensurePublishBranch() {
  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'main') {
    log(`Switching GitHub Pages repo from ${branch} to main`);
    runGit(['checkout', 'main']);
    runGit(['pull', '--ff-only', 'origin', 'main']);
  }
}

async function publishOnce() {
  if (publishing) {
    queued = true;
    return;
  }

  publishing = true;
  ignoreWatch = true;
  try {
    if (!existsSync(GITHUB_IO)) {
      throw new Error(`GitHub Pages repo not found: ${GITHUB_IO}`);
    }

    log('Generating static snapshot...');
    const manifest = await generateStaticSnapshot({ outputDir: OUTPUT_DIR, skipSync: false });
    if (manifest.errors?.length) {
      log(`Snapshot completed with ${manifest.errors.length} API warning(s)`);
    }

    if (!gitHasChanges()) {
      log('No git changes in career-dashboard/ — skipping commit/push');
      return;
    }

    ensurePublishBranch();
    runGit(['add', 'career-dashboard']);
    runGit(['commit', '-m', 'auto-sync career dashboard']);
    log('Committed career-dashboard/ snapshot');
    gitPushWithRetry();
    log('Pushed to GitHub Pages remote');
  } catch (err) {
    log(`Publish failed: ${err.message}`);
  } finally {
    publishing = false;
    ignoreWatch = false;
    if (queued) {
      queued = false;
      schedulePublish('queued');
    }
  }
}

function schedulePublish(reason = 'change') {
  if (ignoreWatch || publishing) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    log(`Debounce elapsed (${reason}) — publishing`);
    publishOnce();
  }, DEBOUNCE_MS);
  log(`Scheduled publish in ${DEBOUNCE_MS / 1000}s (${reason})`);
}

function validateEnvironment() {
  if (!existsSync(join(GITHUB_IO, '.git'))) {
    throw new Error(`Expected git repo at ${GITHUB_IO}`);
  }
  try {
    runGit(['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new Error('git is not available or harshddes.github.io is not a git repo');
  }
}

function startWatcher() {
  const watcher = watch(WATCH_PATHS, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 100 },
    ignored: (filePath) => /\.tmp/i.test(filePath),
  });

  watcher.on('add', path => schedulePublish(`add ${path}`));
  watcher.on('change', path => schedulePublish(`change ${path}`));
  watcher.on('unlink', path => schedulePublish(`unlink ${path}`));
  watcher.on('error', err => log(`Watcher error: ${err.message}`));

  log(`Watching ${WATCH_PATHS.length} path(s)`);
  log(`Output → ${OUTPUT_DIR}`);
  log(`Public URL → https://harshddes.github.io/career-dashboard/`);
}

async function main() {
  validateEnvironment();
  startWatcher();

  if (process.argv.includes('--initial-sync')) {
    log('Running initial sync');
    await publishOnce();
  }
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
