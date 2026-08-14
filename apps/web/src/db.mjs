import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_PATH = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');

/** Routes db.query() to the in-transaction client while withTenant/withServiceRole run. */
const scopedQuery = new AsyncLocalStorage();

export function loadSchemaSql() {
  return readFileSync(SCHEMA_PATH, 'utf8');
}

function mapRows(result) {
  if (Array.isArray(result)) return result;
  if (result?.rows) return result.rows;
  return [];
}

function attachQuery(db, rawQuery) {
  db.queryUnscoped = rawQuery;
  db.query = async (text, params = []) => {
    const scoped = scopedQuery.getStore();
    if (scoped) return scoped(text, params);
    return rawQuery(text, params);
  };
  return db;
}

export async function createPgliteDb() {
  const { PGlite } = await import('@electric-sql/pglite');
  const client = new PGlite();
  const rawQuery = async (text, params = []) => mapRows(await client.query(text, params));
  return attachQuery({
    kind: 'pglite',
    async exec(sql) {
      await client.exec(sql);
    },
  }, rawQuery);
}

async function configureNeonSockets() {
  const { neonConfig } = await import('@neondatabase/serverless');
  if (typeof WebSocket !== 'undefined') {
    neonConfig.webSocketConstructor = WebSocket;
    return true;
  }
  try {
    const { default: ws } = await import('ws');
    neonConfig.webSocketConstructor = ws;
    return true;
  } catch {
    return false;
  }
}

export async function createNeonDb(connectionString) {
  const sockets = await configureNeonSockets();
  if (sockets) {
    const { Pool } = await import('@neondatabase/serverless');
    const pool = new Pool({ connectionString, max: 5 });
    const rawQuery = async (text, params = []) => mapRows(await pool.query(text, params));
    return attachQuery({
      kind: 'neon',
      pool,
      async exec(sqlText) {
        for (const statement of splitSql(sqlText)) {
          if (statement) await pool.query(statement);
        }
      },
      async withRawClient(work) {
        const client = await pool.connect();
        try {
          const clientQuery = async (text, params = []) => mapRows(await client.query(text, params));
          return await work(clientQuery);
        } finally {
          client.release();
        }
      },
    }, rawQuery);
  }

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connectionString, { fullResults: true });
  const rawQuery = async (text, params = []) => mapRows(await sql.query(text, params));
  return attachQuery({
    kind: 'neon-http',
    async exec(sqlText) {
      for (const statement of splitSql(sqlText)) {
        if (statement) await sql.query(statement, []);
      }
    },
  }, rawQuery);
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

async function runInSession(db, setup, work) {
  const execute = async (rawQuery) => {
    await rawQuery('BEGIN', []);
    try {
      await setup(rawQuery);
      const result = await scopedQuery.run(rawQuery, work);
      await rawQuery('COMMIT', []);
      return result;
    } catch (error) {
      try { await rawQuery('ROLLBACK', []); } catch { /* ignore */ }
      throw error;
    }
  };
  if (typeof db.withRawClient === 'function') {
    return db.withRawClient(execute);
  }
  return execute(db.queryUnscoped);
}

export async function withTenant(db, { tenantId, userId }, work) {
  return runInSession(db, async (rawQuery) => {
    if (tenantId) await rawQuery("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    if (userId) await rawQuery("SELECT set_config('app.user_id', $1, true)", [userId]);
    try {
      await rawQuery('SET LOCAL ROLE app_user', []);
    } catch {
      // Role missing: RLS still applies to non-superuser Neon roles.
    }
  }, work);
}

export async function withServiceRole(db, work) {
  return runInSession(db, async (rawQuery) => {
    await rawQuery("SELECT set_config('app.service_role', $1, true)", ['1']);
  }, work);
}
