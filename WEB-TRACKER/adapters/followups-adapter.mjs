#!/usr/bin/env node
/**
 * followups-adapter.mjs — Run followup-cadence.mjs and capture JSON output
 *
 * Wraps the existing career-ops script as a subprocess,
 * captures its JSON stdout, and writes to WEB-TRACKER/data.
 */

import { execFileSync } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const BASE = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS = join(BASE, '..', '..');
const TRACKER_DATA = join(BASE, '..', 'data');
const SCRIPT = join(CAREER_OPS, 'followup-cadence.mjs');

export function run() {
  if (!existsSync(SCRIPT)) {
    console.warn('followup-cadence.mjs not found — skipping');
    return null;
  }

  try {
    const raw = execFileSync('node', [SCRIPT], {
      cwd: CAREER_OPS,
      encoding: 'utf-8',
      timeout: 30_000,
    });

    const data = JSON.parse(raw);
    const output = {
      generated_at: new Date().toISOString(),
      source: SCRIPT,
      ...data,
    };

    const outPath = join(TRACKER_DATA, 'followups.json');
    writeFileSync(outPath, JSON.stringify(output, null, 2));
    return output;
  } catch (err) {
    const fallback = {
      generated_at: new Date().toISOString(),
      source: SCRIPT,
      error: err.message,
      note: 'No follow-up data or script error',
    };
    const outPath = join(TRACKER_DATA, 'followups.json');
    writeFileSync(outPath, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

if (process.argv[1]?.endsWith('followups-adapter.mjs')) {
  const result = run();
  if (result?.error) {
    console.log(`Followups: ${result.error}`);
  } else {
    console.log(`Follow-up cadence → WEB-TRACKER/data/followups.json`);
  }
}
