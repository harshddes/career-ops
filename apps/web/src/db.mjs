import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');

export function loadSchemaSql() {
  return readFileSync(SCHEMA_PATH, 'utf8');
}

function mapRows(result) {
  if (Array.isArray(result)) return result;
  if (result?.rows) return result.rows;
  return [];
}

export async function createPgliteDb() {
  const { PGlite } = await import('@electric-sql/pglite');
  const client = new PGlite();
  return {
    kind: 'pglite',
    async query(text, params = []) {
      const result = await client.query(text, params);
      return mapRows(result);
    },
    async exec(sql) {
      await client.exec(sql);
    },
  };
}

export async function createNeonDb(connectionString) {
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connectionString, { fullResults: true });
  return {
    kind: 'neon',
    async query(text, params = []) {
      const result = await sql.query(text, params);
      return mapRows(result);
    },
    async exec(sqlText) {
      for (const statement of splitSql(sqlText)) {
        if (statement) await sql.query(statement, []);
      }
    },
  };
}

export async function createDb(connectionString) {
  if (!connectionString || connectionString === 'pglite') {
    return createPgliteDb();
  }
  return createNeonDb(connectionString);
}

export async function applySchema(db) {
  await db.exec(loadSchemaSql());
  await ensureAppRole(db);
}

async function ensureAppRole(db) {
  try {
    await db.exec(`
      DO $$ BEGIN
        CREATE ROLE app_user NOLOGIN;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      GRANT USAGE ON SCHEMA public TO app_user;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
    `);
  } catch {
    // PGlite / locked-down Neon may not allow CREATE ROLE. HTTP isolation tests still run.
  }
}

export function splitSql(sql) {
  return sql
    .split(/;\s*\n/)
    .map(part => part.trim())
    .filter(part => part && !part.startsWith('--'));
}

export async function withTenant(db, { tenantId, userId }, work) {
  await db.query('BEGIN');
  try {
    if (tenantId) await db.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    if (userId) await db.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    try {
      await db.query('SET LOCAL ROLE app_user');
    } catch {
      // Role missing: RLS still applies to non-superuser Neon roles.
    }
    const result = await work();
    await db.query('COMMIT');
    return result;
  } catch (error) {
    try { await db.query('ROLLBACK'); } catch { /* ignore */ }
    throw error;
  }
}
