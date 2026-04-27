#!/usr/bin/env node
/**
 * pipeline-adapter.mjs — Parse career-ops pipeline.md inbox into JSON
 *
 * Extracts pending and processed URLs from the checkbox format
 * used by scan.mjs and pipeline.md.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const BASE = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS = join(BASE, '..', '..');
const TRACKER_DATA = join(BASE, '..', 'data');
const PIPELINE_FILE = join(CAREER_OPS, 'data', 'pipeline.md');

export function parsePipeline() {
  if (!existsSync(PIPELINE_FILE)) return { pending: [], processed: [] };

  const content = readFileSync(PIPELINE_FILE, 'utf-8');
  const pending = [];
  const processed = [];
  let section = 'pending';

  for (const line of content.split('\n')) {
    if (/^##\s*Procesadas/i.test(line) || /^##\s*Processed/i.test(line)) {
      section = 'processed';
      continue;
    }

    const match = line.match(/^- \[([ x])\]\s+(https?:\/\/\S+)\s*(?:\|\s*(.+?)\s*\|\s*(.+))?\s*$/);
    if (!match) continue;

    const entry = {
      done: match[1] === 'x',
      url: match[2],
      company: match[3]?.trim() || null,
      title: match[4]?.trim() || null,
    };

    if (section === 'processed' || entry.done) {
      processed.push(entry);
    } else {
      pending.push(entry);
    }
  }

  return { pending, processed };
}

export function run() {
  const pipeline = parsePipeline();
  const output = {
    generated_at: new Date().toISOString(),
    source: PIPELINE_FILE,
    pending_count: pipeline.pending.length,
    processed_count: pipeline.processed.length,
    ...pipeline,
  };

  const outPath = join(TRACKER_DATA, 'pipeline.json');
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  return output;
}

if (process.argv[1]?.endsWith('pipeline-adapter.mjs')) {
  const result = run();
  console.log(`Pipeline: ${result.pending_count} pending, ${result.processed_count} processed → WEB-TRACKER/data/pipeline.json`);
}
