import { AsyncLocalStorage } from 'node:async_hooks';

/** Routes db.query() to the in-transaction client while withTenant/withServiceRole run. */
const scopedQuery = new AsyncLocalStorage();

function mapRows(result) {
  if (Array.isArray(result)) return result;
  if (result?.rows) return result.rows;
  return [];
}

function isCloudflareWorker() {
  return typeof WebSocketPair !== 'undefined';
}

function shiftPlaceholders(text, by) {
  return String(text).replace(/\$(\d+)/g, (_, n) => `$${Number(n) + by}`);
}

/**
 * Cloudflare Workers cannot hold a Postgres session (BEGIN / SET LOCAL / COMMIT).
 * Fold tenant GUC binds into the same statement so FORCE RLS still sees app.tenant_id.
 */
export function bindTenantSql(text, params = [], { tenantId = '', userId = '', serviceRole = false } = {}) {
  const trimmed = String(text).trim();
  if (!trimmed) return { text, params };
  if (/^(BEGIN|COMMIT|ROLLBACK)\b/i.test(trimmed)) return { text: trimmed, params };
  if (/^SET\s+/i.test(trimmed)) return { text: trimmed, params };

  const extras = [tenantId || '', userId || '', serviceRole ? '1' : ''];
  const shifted = shiftPlaceholders(trimmed, extras.length);
  const authCte = `WITH _auth AS (
    SELECT
      set_config('app.tenant_id', NULLIF($1::text, ''), true) AS tenant_set,
      set_config('app.user_id', NULLIF($2::text, ''), true) AS user_set,
      set_config('app.service_role', NULLIF($3::text, ''), true) AS service_set
  )`;

  if (/^(SELECT|WITH)\b/i.test(trimmed)) {
    return {
      text: `${authCte}, _exec AS (${shifted}) SELECT _exec.* FROM _exec CROSS JOIN _auth`,
      params: [...extras, ...params],
    };
  }

  const inner = /\bRETURNING\b/i.test(trimmed) ? shifted : `${shifted} RETURNING *`;
  return {
    text: `${authCte}, _exec AS (${inner}) SELECT _exec.* FROM _exec CROSS JOIN _auth`,
    params: [...extras, ...params],
  };
}

function attachQuery(db, rawQuery) {
  db.queryUnscoped = rawQuery;
  db.query = async (text, params = []) => {
    const scoped = scopedQuery.getStore();
    if (typeof scoped === 'function') return scoped(text, params);
    if (scoped?.mode === 'bind') {
      const wrapped = bindTenantSql(text, params, scoped);
      return rawQuery(wrapped.text, wrapped.params);
    }
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

async function createNeonHttpDb(connectionString) {
  const { neon, neonConfig } = await import('@neondatabase/serverless');
  neonConfig.fetchConnectionCache = true;
  const sql = neon(connectionString, { fullResults: true });
  const rawQuery = async (text, params = []) => mapRows(await sql.query(text, params));
  return attachQuery({
    kind: 'neon-http',
    sessionTxn: false,
    async exec(sqlText) {
      for (const statement of splitSql(sqlText)) {
        if (statement) await sql.query(statement, []);
      }
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
  if (isCloudflareWorker()) {
    return createNeonHttpDb(connectionString);
  }

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

  return createNeonHttpDb(connectionString);
}

export async function createDb(connectionString) {
  if (!connectionString || connectionString === 'pglite') {
    return createPgliteDb();
  }
  return createNeonDb(connectionString);
}

export async function applySchemaSql(db, schemaSql) {
  await db.exec(schemaSql);
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
  const statements = [];
  let current = '';
  let inDollar = false;
  for (const line of String(sql).split('\n')) {
    const trimmed = line.trim();
    if (!inDollar && trimmed.startsWith('--')) continue;
    const dollars = line.match(/\$\$/g);
    if (dollars && dollars.length % 2 === 1) inDollar = !inDollar;
    current += `${line}\n`;
    if (!inDollar && /;\s*$/.test(trimmed)) {
      const stmt = current.trim().replace(/;+\s*$/, '');
      if (stmt) statements.push(stmt);
      current = '';
    }
  }
  const tail = current.trim().replace(/;+\s*$/, '');
  if (tail) statements.push(tail);
  return statements;
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

function usesBindTenant(db) {
  return db?.sessionTxn === false || db?.kind === 'neon-http';
}

export async function withTenant(db, { tenantId, userId }, work) {
  if (usesBindTenant(db)) {
    return scopedQuery.run({ mode: 'bind', tenantId, userId }, work);
  }
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
  if (usesBindTenant(db)) {
    return scopedQuery.run({ mode: 'bind', serviceRole: true }, work);
  }
  return runInSession(db, async (rawQuery) => {
    await rawQuery("SELECT set_config('app.service_role', $1, true)", ['1']);
  }, work);
}
