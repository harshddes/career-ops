#!/usr/bin/env node
/**
 * Operator / GitHub Action entry: upsert compact catalog rows from a JSON file.
 * Prefer scripts/run-catalog-ingest.mjs for live RSS/ATS fetches.
 * Exits 0 when DATABASE_URL is missing so public CI stays free and green.
 */

import { readFileSync } from 'node:fs';
import { applySchema, createDb } from '../src/db.mjs';
import { recordScanRun, stubEuraxessJobs, upsertCatalogJobs } from '../src/catalog.mjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.log('DATABASE_URL unset — skip catalog upsert (local/public CI).');
  process.exit(0);
}

const fromFile = process.argv[2];
let jobs = stubEuraxessJobs();
if (fromFile) {
  const parsed = JSON.parse(readFileSync(fromFile, 'utf8'));
  jobs = parsed.jobs || parsed;
}

const db = await createDb(connectionString);
await applySchema(db);
const count = await upsertCatalogJobs(db, jobs);
await recordScanRun(db, {
  source: 'file',
  status: 'ok',
  upserted: count,
  startedAt: new Date(),
  finishedAt: new Date(),
});
console.log(JSON.stringify({ ok: true, upserted: count }));
