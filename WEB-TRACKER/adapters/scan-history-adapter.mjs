#!/usr/bin/env node
/**
 * scan-history-adapter.mjs — Parse career-ops scan-history.tsv into JSON
 *
 * Mirrors the TSV format from scan.mjs appendToScanHistory.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const BASE = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS = join(BASE, '..', '..');
const TRACKER_DATA = join(BASE, '..', 'data');
const HISTORY_FILE = join(CAREER_OPS, 'data', 'scan-history.tsv');

export function parseScanHistory() {
  if (!existsSync(HISTORY_FILE)) return [];
  const lines = readFileSync(HISTORY_FILE, 'utf-8').split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
  const entries = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length < 2) continue;

    const entry = {};
    for (let j = 0; j < headers.length; j++) {
      entry[headers[j]] = cols[j]?.trim() || '';
    }
    entries.push(entry);
  }

  return entries;
}

export function run() {
  const history = parseScanHistory();
  const output = {
    generated_at: new Date().toISOString(),
    source: HISTORY_FILE,
    count: history.length,
    entries: history,
  };

  const outPath = join(TRACKER_DATA, 'scan-history.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  return output;
}

if (process.argv[1]?.endsWith('scan-history-adapter.mjs')) {
  const result = run();
  console.log(`Parsed ${result.count} scan history entries → WEB-TRACKER/data/scan-history.json`);
}
