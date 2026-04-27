#!/usr/bin/env node
/**
 * reports-adapter.mjs — Extract structured metadata from career-ops reports
 *
 * Mirrors the regex extraction from dashboard/internal/data/career.go:
 * URL, Score, Archetype, TL;DR, Legitimacy from report headers.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { parseExportControlVerdict, parseVisaVerdict } from '../lib/work-auth.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS = join(BASE, '..', '..');
const TRACKER_DATA = join(BASE, '..', 'data');
const REPORTS_DIR = join(CAREER_OPS, 'reports');

const RE_URL = /\*\*URL:\*\*\s*(https?:\/\/\S+)/;
const RE_SCORE = /\*\*Score:\*\*\s*([\d.]+\/5)/;
const RE_ARCHETYPE = /\*\*Arquetipo[^:]*:\*\*\s*(.+)/i;
const RE_LEGITIMACY = /\*\*Legitimacy:\*\*\s*(.+)/;
const RE_VISA = /\*\*Visa:\*\*\s*(.+)/;
const RE_TLDR = /\*\*TL;DR\*\*\s*\|?\s*(.+)/;
const RE_TITLE = /^#\s+Evaluaci[oó]n:\s+(.+)/m;
const RE_REMOTE = /\*\*Remote\*\*\s*\|?\s*(.+)/;

export function parseReport(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const header = content.substring(0, 2000);

  return {
    filename: basename(filePath),
    title: header.match(RE_TITLE)?.[1]?.trim() || basename(filePath, '.md'),
    url: header.match(RE_URL)?.[1] || null,
    score: header.match(RE_SCORE)?.[1] || null,
    archetype: header.match(RE_ARCHETYPE)?.[1]?.trim() || null,
    legitimacy: header.match(RE_LEGITIMACY)?.[1]?.trim() || null,
    visa: header.match(RE_VISA)?.[1]?.trim() || null,
    visa_verdict: parseVisaVerdict(header),
    export_control: parseExportControlVerdict(header),
    tldr: header.match(RE_TLDR)?.[1]?.trim() || null,
    remote: header.match(RE_REMOTE)?.[1]?.trim() || null,
  };
}

export function parseAllReports() {
  if (!existsSync(REPORTS_DIR)) return [];
  const files = readdirSync(REPORTS_DIR).filter(f => f.endsWith('.md') && /^\d{3}-/.test(f));
  return files.map(f => parseReport(join(REPORTS_DIR, f)));
}

export function run() {
  const reports = parseAllReports();
  const output = {
    generated_at: new Date().toISOString(),
    source: REPORTS_DIR,
    count: reports.length,
    reports,
  };

  const outPath = join(TRACKER_DATA, 'reports.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  return output;
}

if (process.argv[1]?.endsWith('reports-adapter.mjs')) {
  const result = run();
  console.log(`Parsed ${result.count} reports → WEB-TRACKER/data/reports.json`);
}
