#!/usr/bin/env node
/**
 * Operator / GitHub Action entry: upsert compact catalog rows.
 * Exits 0 when DATABASE_URL is missing so public CI stays free and green.
 */

import { readFileSync } from 'node:fs';
import { applySchema, createDb } from '../src/db.mjs';
import { stubEuraxessJobs, upsertCatalogJobs } from '../src/catalog.mjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.log('DATABASE_URL unset — skip catalog upsert (local/public CI).');
  process.exit(0);
}

const fromFile = process.argv[2];
const jobs = fromFile
  ? JSON.parse(readFileSync(fromFile, 'utf8')).jobs || JSON.parse(readFileSync(fromFile, 'utf8'))
  : stubEuraxessJobs();

const db = await createDb(connectionString);
await applySchema(db);
const count = await upsertCatalogJobs(db, jobs);
console.log(JSON.stringify({ ok: true, upserted: count }));
