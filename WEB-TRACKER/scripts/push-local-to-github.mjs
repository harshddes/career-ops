#!/usr/bin/env node
/**
 * Nightly allowlisted git commit + push.
 * Never stages WEB-TRACKER/.env. Never force-pushes.
 */
import { spawnSync } from 'child_process';
import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_TRACKER_DIR = join(SCRIPT_DIR, '..');
const REPO_ROOT = join(WEB_TRACKER_DIR, '..');
const LOG_FILE = join(WEB_TRACKER_DIR, 'runtime', 'github-sync.log');
const APPLICATIONS_FILE = 'data/applications.md';

export const NEVER_STAGE = [
  'WEB-TRACKER/.env',
  '.env',
  'output',
  'WEB-TRACKER/runtime',
  'WEB-TRACKER/dashboard/vendor',
  'node_modules',
  'harsh/resume',
];

const SOURCE_PATHS = [
  'WEB-TRACKER/lib',
  'WEB-TRACKER/scripts',
  'WEB-TRACKER/test',
  'WEB-TRACKER/dashboard',
];

function hasArg(name) {
  return process.argv.includes(name);
}

function log(message) {
  const line = `[github-sync] ${new Date().toISOString()} ${message}\n`;
  mkdirSync(dirname(LOG_FILE), { recursive: true });
  appendFileSync(LOG_FILE, line);
  process.stdout.write(line);
}

function git(args, { allowFail = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) {
    if (allowFail) return { ok: false, stdout: '', stderr: result.error.message, status: 1 };
    throw result.error;
  }
  if (result.status !== 0 && !allowFail) {
    const stderr = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} failed (${result.status}): ${stderr}`);
  }
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function easternDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
}

function inProgressLock() {
  const gitDir = git(['rev-parse', '--git-dir']).stdout.trim();
  const locks = ['MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'];
  return locks.find(name => existsSync(join(REPO_ROOT, gitDir, name))) || '';
}

export function collectResetPaths() {
  return [
    ...NEVER_STAGE,
    'WEB-TRACKER/.env.local',
    '*.pdf',
  ];
}

export async function pushLocalToGithub({
  dryRun = false,
  now = new Date(),
} = {}) {
  git(['rev-parse', '--is-inside-work-tree']);
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  if (!branch || branch === 'HEAD') {
    return { ok: false, skipped: true, reason: 'detached_head' };
  }

  const lock = inProgressLock();
  if (lock) {
    return { ok: false, skipped: true, reason: `in_progress:${lock}` };
  }

  const message = `Nightly local sync ${easternDate(now)}`;
  if (dryRun) {
    return { ok: true, dry_run: true, branch, message };
  }

  git(['add', '-u', '--', '.']);
  git(['add', '--', ...SOURCE_PATHS], { allowFail: true });
  if (existsSync(join(REPO_ROOT, APPLICATIONS_FILE))) {
    git(['add', '-f', '--', APPLICATIONS_FILE]);
  }
  git(['reset', '-q', '--', ...collectResetPaths()], { allowFail: true });

  const staged = git(['diff', '--cached', '--name-only']).stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  const leaked = staged.filter(path => (
    path === 'WEB-TRACKER/.env'
    || path === '.env'
    || path.endsWith('/.env')
  ));
  if (leaked.length) {
    git(['reset', '-q', '--', ...leaked], { allowFail: true });
    return { ok: false, skipped: true, reason: 'refused_env', files: leaked };
  }

  if (!staged.length) {
    return { ok: true, skipped: true, reason: 'no_changes', branch };
  }

  git(['commit', '-m', message]);
  const upstream = git(['rev-parse', '--abbrev-ref', '@{upstream}'], { allowFail: true });
  if (!upstream.ok) {
    return { ok: false, committed: true, skipped: true, reason: 'no_upstream', branch, files: staged };
  }
  git(['push']);
  return { ok: true, pushed: true, branch, files: staged, message };
}

async function main() {
  try {
    const result = await pushLocalToGithub({ dryRun: hasArg('--dry-run') });
    log(JSON.stringify(result));
    if (!result.ok && !result.skipped) process.exitCode = 1;
  } catch (err) {
    log(`error: ${err.message || err}`);
    process.exitCode = 1;
  }
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  await main();
}
