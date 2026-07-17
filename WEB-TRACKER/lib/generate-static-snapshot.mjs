#!/usr/bin/env node
/**
 * generate-static-snapshot.mjs — Build read-only GitHub Pages bundle for career-dashboard/
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const BASE = dirname(fileURLToPath(import.meta.url));
const TRACKER = join(BASE, '..');
const CAREER_OPS = join(TRACKER, '..');
const DATA_DIR = join(TRACKER, 'data');
const DASHBOARD_HTML = join(TRACKER, 'dashboard', 'fusion-pivot-dashboard.html');
const DEFAULT_OUTPUT = join(CAREER_OPS, '..', 'harshddes.github.io', 'career-dashboard');
const DASHBOARD_TIMEZONE = 'America/New_York';

function easternISODate(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: DASHBOARD_TIMEZONE });
}

function ensureDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function writeJson(filePath, value) {
  ensureDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function apiSnapshotPath(outputDir, apiPath) {
  const pathname = apiPath.split('?')[0];
  if (pathname === '/api/today-activity') {
    return join(outputDir, 'static-api', 'api', 'today-activity.json');
  }
  return join(outputDir, 'static-api', pathname.slice(1) + '.json');
}

async function fetchJson(baseUrl, apiPath) {
  const url = `${baseUrl}${apiPath}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${apiPath} → HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  return res.json();
}

export function collectApiPaths(phdSources = []) {
  const paths = [
    '/api/actions',
    '/api/jobs',
    '/api/source-health',
    '/api/contacts',
    '/api/action-plan',
    '/api/applications/dashboard',
    '/api/applications',
    '/api/jobs-to-consider',
    '/api/research-prospects',
    '/api/euraxess/opportunities',
    '/api/euraxess/health',
    '/api/phdscanner/opportunities',
    '/api/phdscanner/health',
    '/api/exhibitor/companies',
    '/api/exhibitor/clear-queue',
    '/api/exhibitor/factory/status',
    '/api/agent-tasks',
    '/api/autonomy/model-health',
    '/api/autonomy/research-budget',
    '/api/autonomy/runs',
    `/api/today-activity?date=${encodeURIComponent(easternISODate())}&timezone=${encodeURIComponent(DASHBOARD_TIMEZONE)}`,
  ];

  for (const source of phdSources) {
    if (source?.id) paths.push(`/api/phd-research-prospects/${encodeURIComponent(source.id)}`);
  }

  return paths;
}

function loadPhdSources() {
  const file = join(DATA_DIR, 'phd-prospect-sources.json');
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, 'utf-8'));
    return Array.isArray(data?.sources) ? data.sources : [];
  } catch {
    return [];
  }
}

function runSyncAll() {
  execFileSync('node', [join(TRACKER, 'adapters', 'sync-all.mjs')], {
    cwd: TRACKER,
    stdio: 'inherit',
  });
}

function copyDataFiles(outputDir) {
  const outData = join(outputDir, 'data');
  mkdirSync(outData, { recursive: true });
  if (!existsSync(DATA_DIR)) return [];

  const copied = [];
  for (const name of readdirSync(DATA_DIR)) {
    if (!/\.(json|ndjson)$/i.test(name)) continue;
    cpSync(join(DATA_DIR, name), join(outData, name));
    copied.push(name);
  }
  return copied;
}

function buildIndexHtml() {
  let html = readFileSync(DASHBOARD_HTML, 'utf-8');
  if (!html.includes('name="career-dashboard-mode"')) {
    html = html.replace(
      '<meta charset="UTF-8">',
      '<meta charset="UTF-8">\n<meta name="career-dashboard-mode" content="static">',
    );
  } else {
    html = html.replace(
      'name="career-dashboard-mode" content="dynamic"',
      'name="career-dashboard-mode" content="static"',
    );
  }
  return html;
}

export async function generateStaticSnapshot(options = {}) {
  const outputDir = options.outputDir || DEFAULT_OUTPUT;
  const skipSync = Boolean(options.skipSync);

  if (!skipSync) runSyncAll();

  process.env.JOBS_TO_CONSIDER_LIVENESS = 'off';
  process.env.PUBLISH_SNAPSHOT = '1';

  const phdSources = loadPhdSources();
  const port = options.port || (45000 + Math.floor(Math.random() * 5000));
  const host = '127.0.0.1';

  const { startFastServer } = await import('../server-fast.mjs');
  const server = await startFastServer(port, host);
  const baseUrl = `http://${host}:${port}`;

  const manifest = {
    published_at: new Date().toISOString(),
    output_dir: outputDir,
    data_files: [],
    api_snapshots: [],
    errors: [],
  };

  try {
    mkdirSync(outputDir, { recursive: true });
    manifest.data_files = copyDataFiles(outputDir);

    for (const apiPath of collectApiPaths(phdSources)) {
      try {
        const payload = await fetchJson(baseUrl, apiPath);
        const target = apiSnapshotPath(outputDir, apiPath);
        writeJson(target, payload);
        manifest.api_snapshots.push(apiPath.split('?')[0]);
      } catch (err) {
        manifest.errors.push({ path: apiPath, error: err.message });
      }
    }

    writeFileSync(join(outputDir, 'index.html'), buildIndexHtml(), 'utf-8');
    writeJson(join(outputDir, 'publish-manifest.json'), manifest);
  } finally {
    await new Promise((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  }

  if (manifest.errors.length) {
    console.warn(`[publish] ${manifest.errors.length} API snapshot(s) failed:`);
    for (const item of manifest.errors) console.warn(`  - ${item.path}: ${item.error}`);
  }

  console.log(`[publish] Snapshot written to ${outputDir}`);
  console.log(`[publish] Data files: ${manifest.data_files.length}, API snapshots: ${manifest.api_snapshots.length}`);
  return manifest;
}

if (process.argv[1]?.endsWith('generate-static-snapshot.mjs')) {
  const outputIdx = process.argv.indexOf('--output');
  const outputDir = outputIdx !== -1 ? process.argv[outputIdx + 1] : DEFAULT_OUTPUT;
  const skipSync = process.argv.includes('--skip-sync');
  const manifest = await generateStaticSnapshot({ outputDir, skipSync });
  process.exit(manifest.errors?.length ? 1 : 0);
}
