import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySchemaSql } from './db.mjs';

export {
  createDb,
  createPgliteDb,
  splitSql,
  withServiceRole,
  withTenant,
} from './db.mjs';

export function loadSchemaSql() {
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'schema.sql'), 'utf8');
}

export async function applySchema(db) {
  await applySchemaSql(db, loadSchemaSql());
}
