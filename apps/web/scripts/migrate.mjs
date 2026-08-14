#!/usr/bin/env node
/** Apply schema. Safe to run on every ingest. */
import { applySchema, createDb } from '../src/db.mjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.log('DATABASE_URL unset — skip migrate.');
  process.exit(0);
}

const db = await createDb(connectionString);
try {
  await applySchema(db);
  console.log(JSON.stringify({ ok: true, migrated: true }));
} finally {
  if (db.pool) await db.pool.end().catch(() => {});
}
