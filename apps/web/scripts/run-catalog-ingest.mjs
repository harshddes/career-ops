#!/usr/bin/env node
/**
 * GitHub Action / operator ingest: compact catalog upsert.
 * Exits 0 when DATABASE_URL is missing so public CI stays green.
 * Does not write 6–8 MB JSON stores. Does not run Playwright.
 */

import { applySchema, createDb } from '../src/db.mjs';
import { recordScanRun, upsertCatalogJobs } from '../src/catalog.mjs';
import { fetchEuraxessCompact } from '../src/ingest/euraxess.mjs';
import { fetchFusionCompact } from '../src/ingest/fusion.mjs';
import { fetchUmichCompact } from '../src/ingest/umich.mjs';
import { fetchPhdscannerCompact } from '../src/ingest/phdscanner.mjs';

const SOURCES = {
  euraxess: fetchEuraxessCompact,
  fusion: fetchFusionCompact,
  umich: fetchUmichCompact,
  phdscanner: fetchPhdscannerCompact,
};

function parseSources(argv) {
  const flag = argv.find(arg => arg.startsWith('--sources='));
  const list = flag
    ? flag.slice('--sources='.length)
    : (argv.includes('--sources') ? argv[argv.indexOf('--sources') + 1] : 'euraxess,fusion,umich,phdscanner');
  return list.split(',').map(part => part.trim()).filter(part => SOURCES[part]);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.log('DATABASE_URL unset — skip catalog ingest (local/public CI).');
  process.exit(0);
}

const sources = parseSources(process.argv.slice(2));
const db = await createDb(connectionString);
await applySchema(db);

const summary = [];
for (const source of sources) {
  const startedAt = new Date();
  try {
    const jobs = await SOURCES[source]();
    const upserted = await upsertCatalogJobs(db, jobs);
    await recordScanRun(db, {
      source,
      status: 'ok',
      upserted,
      startedAt,
      finishedAt: new Date(),
    });
    summary.push({ source, ok: true, upserted });
  } catch (error) {
    await recordScanRun(db, {
      source,
      status: 'failed',
      upserted: 0,
      error: error?.message || String(error),
      startedAt,
      finishedAt: new Date(),
    });
    summary.push({ source, ok: false, error: error?.message || String(error) });
  }
}

console.log(JSON.stringify({ ok: summary.every(item => item.ok), sources: summary }));
if (summary.some(item => !item.ok) && summary.every(item => !item.ok)) process.exit(1);
