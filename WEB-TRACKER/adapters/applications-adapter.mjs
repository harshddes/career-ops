#!/usr/bin/env node
/**
 * applications-adapter.mjs — Parse career-ops applications.md into JSON
 *
 * Mirrors the row-parsing logic from merge-tracker.mjs and career.go.
 * Reads data/applications.md, outputs normalized JSON to stdout or file.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseExportControlVerdict, parseVisaVerdict } from '../lib/work-auth.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS = join(BASE, '..', '..');
const TRACKER_DATA = join(BASE, '..', 'data');

const APPS_FILE = existsSync(join(CAREER_OPS, 'data/applications.md'))
  ? join(CAREER_OPS, 'data/applications.md')
  : join(CAREER_OPS, 'applications.md');

export function parseApplications() {
  if (!existsSync(APPS_FILE)) return [];
  const content = readFileSync(APPS_FILE, 'utf-8');
  const entries = [];

  for (const line of content.split('\n')) {
    if (!line.startsWith('|')) continue;
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 9) continue;
    const num = parseInt(parts[1]);
    if (isNaN(num) || num === 0) continue;

    const reportMatch = parts[8]?.match(/\]\(([^)]+)\)/);

    const notes = parts[9] || '';

    entries.push({
      num,
      date: parts[2],
      company: parts[3],
      role: parts[4],
      score: parts[5],
      score_num: parseFloat(parts[5]?.replace(/[^0-9.]/g, '')) || 0,
      status: parts[6],
      pdf: parts[7]?.includes('✅'),
      report_link: reportMatch ? reportMatch[1] : null,
      notes,
      visa_verdict: parseVisaVerdict(notes),
      export_control: parseExportControlVerdict(notes),
    });
  }

  return entries;
}

export function run() {
  const apps = parseApplications();
  const output = {
    generated_at: new Date().toISOString(),
    source: APPS_FILE,
    count: apps.length,
    entries: apps,
    status_summary: {},
  };

  for (const a of apps) {
    const s = a.status.toLowerCase();
    output.status_summary[s] = (output.status_summary[s] || 0) + 1;
  }

  const outPath = join(TRACKER_DATA, 'applications.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  return output;
}

if (process.argv[1]?.endsWith('applications-adapter.mjs')) {
  const result = run();
  console.log(`Parsed ${result.count} applications → WEB-TRACKER/data/applications.json`);
}
