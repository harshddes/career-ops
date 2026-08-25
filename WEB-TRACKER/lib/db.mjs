/**
 * Live catalog store: one row PATCH, SQLite WAL (Node DatabaseSync).
 *
 * better-sqlite3 is the usual Node binding, but its native addon access-violates
 * on this Windows + Node 22.12 combo. Node's bundled SQLite (`node:sqlite`,
 * `--experimental-sqlite`) is the same engine: WAL, busy_timeout, JSON payload
 * column, indexed list fields.
 *
 * If the builtin is missing, a compact JSON WAL under getLiveDataDir() is used
 * so tests and one-off scripts still work. Production `run.mjs` re-execs with
 * the flag so the HTTP process and workers share SQLite.
 */
import { createRequire } from 'module';
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { atomicWrite, compactJsonLine } from './atomic-write.mjs';
import { getLiveDataDir } from './data-paths.mjs';
import { sqliteFlagEnabled } from './node-exec.mjs';

const require = createRequire(import.meta.url);
const WAL_COMPACT_AFTER = 64;
const SQLITE_FILE = 'career-ops.sqlite';
const ENGINE_FILE = '.engine';

export const LIVE_TABLES = {
  euraxess_opportunities: {
    itemKey: 'opportunities',
    jsonFile: 'euraxess-opportunities.json',
  },
  phdscanner_opportunities: {
    itemKey: 'opportunities',
    jsonFile: 'phdscanner-opportunities.json',
  },
  umich_opportunities: {
    itemKey: 'opportunities',
    jsonFile: 'umich-careers-opportunities.json',
  },
  research_prospects: {
    itemKey: 'prospects',
    jsonFile: 'umich-research-prospects.json',
  },
  jobs_to_consider: {
    itemKey: 'jobs',
    jsonFile: 'jobs-to-consider.json',
  },
};

const memory = new Map();
let sqliteDb = null;
let sqlitePath = '';

function loadDatabaseSync() {
  if (!sqliteFlagEnabled()) return null;
  try {
    return require('node:sqlite').DatabaseSync;
  } catch {
    return null;
  }
}

function liveRoot() {
  const dir = getLiveDataDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

function enginePath() {
  return join(liveRoot(), ENGINE_FILE);
}

function sqliteDbPath() {
  return join(liveRoot(), SQLITE_FILE);
}

function readEngineLock() {
  try {
    return readFileSync(enginePath(), 'utf-8').trim();
  } catch {
    return '';
  }
}

function writeEngineLock(kind) {
  writeFileSync(enginePath(), `${kind}\n`, 'utf-8');
}

function tableDir(table) {
  return join(liveRoot(), table);
}

function snapshotPath(table) {
  return join(tableDir(table), 'snapshot.json');
}

function walPath(table) {
  return join(tableDir(table), 'wal.ndjson');
}

function fileMtimeMs(filePath) {
  try {
    return existsSync(filePath) ? statSync(filePath).mtimeMs : 0;
  } catch {
    return 0;
  }
}

function jsonWalHasData(table) {
  return existsSync(snapshotPath(table)) || existsSync(walPath(table));
}

function emptyEnvelope(table, store = {}) {
  const itemKey = LIVE_TABLES[table].itemKey;
  const { [itemKey]: _omit, ...meta } = store || {};
  return {
    meta: { ...meta, generated_at: meta.generated_at || new Date().toISOString() },
    items: new Map(),
  };
}

function envelopeToStore(table, envelope) {
  const itemKey = LIVE_TABLES[table].itemKey;
  return {
    ...envelope.meta,
    [itemKey]: [...envelope.items.values()],
  };
}

function rowIndexFields(row = {}) {
  return {
    status: String(row.status || ''),
    score: Number(row.score || 0) || 0,
    archived: row.archived ? 1 : 0,
    visible: row.visible === false ? 0 : 1,
    updated_at: String(row.last_updated || row.updated_at || new Date().toISOString()),
  };
}

function sqliteAvailable() {
  return Boolean(loadDatabaseSync());
}

export function liveEngineName() {
  try {
    return ensureEngine();
  } catch {
    return readEngineLock() || (sqliteAvailable() ? 'sqlite' : 'json-wal');
  }
}

function ensureEngine() {
  const locked = readEngineLock();
  const sqliteOk = sqliteAvailable();
  if (locked === 'sqlite') {
    if (!sqliteOk) {
      throw new Error('Live catalog is SQLite. Restart with: node --experimental-sqlite');
    }
    return 'sqlite';
  }
  if (sqliteOk) {
    if (locked !== 'sqlite') writeEngineLock('sqlite');
    return 'sqlite';
  }
  if (locked === 'json-wal') return 'json-wal';
  writeEngineLock('json-wal');
  return 'json-wal';
}

function usingSqlite() {
  return ensureEngine() === 'sqlite';
}

function ensureSqliteSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS collection_meta (
      table_name TEXT PRIMARY KEY,
      json TEXT NOT NULL
    );
  `);
  for (const table of Object.keys(LIVE_TABLES)) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        status TEXT,
        score REAL,
        archived INTEGER,
        visible INTEGER,
        updated_at TEXT,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_${table}_status ON ${table}(status);
      CREATE INDEX IF NOT EXISTS idx_${table}_score ON ${table}(score);
      CREATE INDEX IF NOT EXISTS idx_${table}_archived ON ${table}(archived);
      CREATE INDEX IF NOT EXISTS idx_${table}_visible ON ${table}(visible);
      CREATE INDEX IF NOT EXISTS idx_${table}_updated_at ON ${table}(updated_at);
    `);
  }
}

function getSqlite() {
  const DatabaseSync = loadDatabaseSync();
  if (!DatabaseSync) throw new Error('node:sqlite is unavailable');
  const path = sqliteDbPath();
  if (sqliteDb && sqlitePath === path) return sqliteDb;
  if (sqliteDb) {
    try { sqliteDb.close(); } catch {}
    sqliteDb = null;
  }
  let db;
  try {
    db = new DatabaseSync(path, { timeout: 5000 });
  } catch {
    db = new DatabaseSync(path);
  }
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA synchronous = NORMAL;');
  ensureSqliteSchema(db);
  sqliteDb = db;
  sqlitePath = path;
  return db;
}

function sqliteStamp() {
  return `${fileMtimeMs(sqliteDbPath())}:${fileMtimeMs(`${sqliteDbPath()}-wal`)}`;
}

function sqliteReadMeta(db, table) {
  const row = db.prepare('SELECT json FROM collection_meta WHERE table_name = ?').get(table);
  if (!row?.json) return {};
  try {
    return JSON.parse(row.json) || {};
  } catch {
    return {};
  }
}

function sqliteWriteMeta(db, table, meta) {
  db.prepare(`
    INSERT INTO collection_meta (table_name, json) VALUES (?, ?)
    ON CONFLICT(table_name) DO UPDATE SET json = excluded.json
  `).run(table, JSON.stringify(meta || {}));
}

function sqliteLoadEnvelope(table) {
  const stamp = sqliteStamp();
  const cached = memory.get(table);
  if (cached && cached._stamp === stamp && cached._engine === 'sqlite') return cached;
  const db = getSqlite();
  const envelope = emptyEnvelope(table, sqliteReadMeta(db, table));
  const rows = db.prepare(`SELECT id, payload FROM ${table}`).all();
  for (const row of rows) {
    try {
      envelope.items.set(String(row.id), JSON.parse(row.payload));
    } catch {}
  }
  envelope._stamp = stamp;
  envelope._engine = 'sqlite';
  memory.set(table, envelope);
  return envelope;
}

function sqliteUpsertRow(db, table, row) {
  const id = String(row?.id || '');
  const index = rowIndexFields(row);
  db.prepare(`
    INSERT INTO ${table} (id, status, score, archived, visible, updated_at, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      score = excluded.score,
      archived = excluded.archived,
      visible = excluded.visible,
      updated_at = excluded.updated_at,
      payload = excluded.payload
  `).run(id, index.status, index.score, index.archived, index.visible, index.updated_at, JSON.stringify(row));
}

function sqliteWriteCollection(table, store) {
  const db = getSqlite();
  const itemKey = LIVE_TABLES[table].itemKey;
  const envelope = emptyEnvelope(table, store);
  const rows = Array.isArray(store?.[itemKey]) ? store[itemKey] : [];
  db.exec('BEGIN');
  try {
    db.prepare(`DELETE FROM ${table}`).run();
    for (const row of rows) {
      const id = String(row?.id || '');
      if (!id) continue;
      envelope.items.set(id, row);
      sqliteUpsertRow(db, table, row);
    }
    envelope.meta.generated_at = new Date().toISOString();
    sqliteWriteMeta(db, table, envelope.meta);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
  envelope._stamp = sqliteStamp();
  envelope._engine = 'sqlite';
  memory.set(table, envelope);
  return envelopeToStore(table, envelope);
}

function sqliteTableHasData(table) {
  if (!existsSync(sqliteDbPath())) return false;
  const db = getSqlite();
  const count = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
  return Number(count?.n || 0) > 0;
}

function maybeImportJsonWalIntoSqlite(table) {
  if (!jsonWalHasData(table)) return;
  if (sqliteTableHasData(table)) return;
  const store = envelopeToStore(table, loadJsonEnvelope(table));
  sqliteWriteCollection(table, store);
}

function diskStampJson(table) {
  return `${fileMtimeMs(snapshotPath(table))}:${fileMtimeMs(walPath(table))}`;
}

function applyWalOp(envelope, op) {
  if (op.op === 'put' && op.id) envelope.items.set(op.id, op.payload);
  if (op.op === 'delete' && op.id) envelope.items.delete(op.id);
  if (op.op === 'meta' && op.meta) envelope.meta = { ...envelope.meta, ...op.meta };
}

function loadJsonEnvelope(table) {
  const stamp = diskStampJson(table);
  const cached = memory.get(table);
  if (cached && cached._stamp === stamp && cached._engine === 'json-wal') return cached;
  const envelope = emptyEnvelope(table);
  const snapFile = snapshotPath(table);
  if (existsSync(snapFile)) {
    const parsed = JSON.parse(readFileSync(snapFile, 'utf-8'));
    envelope.meta = parsed.meta || {};
    const items = parsed.items && typeof parsed.items === 'object' ? parsed.items : {};
    for (const [id, row] of Object.entries(items)) {
      if (id) envelope.items.set(id, row);
    }
  }
  const walFile = walPath(table);
  if (existsSync(walFile)) {
    const lines = readFileSync(walFile, 'utf-8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      applyWalOp(envelope, JSON.parse(line));
    }
  }
  envelope._stamp = stamp;
  envelope._engine = 'json-wal';
  memory.set(table, envelope);
  return envelope;
}

function persistJsonSnapshot(table, envelope) {
  mkdirSync(tableDir(table), { recursive: true });
  atomicWrite(snapshotPath(table), compactJsonLine({
    meta: envelope.meta,
    items: Object.fromEntries(envelope.items),
  }));
  try { unlinkSync(walPath(table)); } catch {}
  envelope._stamp = diskStampJson(table);
  envelope._engine = 'json-wal';
}

function appendJsonWal(table, op) {
  mkdirSync(tableDir(table), { recursive: true });
  writeFileSync(walPath(table), compactJsonLine(op), { flag: 'a' });
}

function maybeCompactJson(table, envelope) {
  const walFile = walPath(table);
  if (!existsSync(walFile)) return;
  const size = readFileSync(walFile, 'utf-8').split('\n').filter(Boolean).length;
  if (size >= WAL_COMPACT_AFTER) persistJsonSnapshot(table, envelope);
}

function loadEnvelope(table) {
  if (usingSqlite()) {
    maybeImportJsonWalIntoSqlite(table);
    return sqliteLoadEnvelope(table);
  }
  return loadJsonEnvelope(table);
}

export function peekLiveStamp(table) {
  if (liveEngineName() === 'sqlite' && sqliteAvailable()) return sqliteStamp();
  return diskStampJson(table);
}

export function liveEnvelopeStamp(table) {
  return loadEnvelope(table)._stamp || '';
}

export function liveTableHasData(table) {
  if (usingSqlite()) {
    return sqliteTableHasData(table) || jsonWalHasData(table);
  }
  return jsonWalHasData(table);
}

export function readLiveCollection(table) {
  if (!LIVE_TABLES[table]) throw new Error(`unknown live table: ${table}`);
  return envelopeToStore(table, loadEnvelope(table));
}

export function liveRowCount(table) {
  if (!LIVE_TABLES[table]) return 0;
  if (usingSqlite()) {
    if (!existsSync(sqliteDbPath()) && !sqliteDb) return 0;
    const db = getSqlite();
    return Number(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n || 0);
  }
  const cached = memory.get(table);
  if (cached?.items) return cached.items.size;
  if (!jsonWalHasData(table)) return 0;
  return loadJsonEnvelope(table).items.size;
}

export function readLiveRow(table, id) {
  if (!LIVE_TABLES[table]) throw new Error(`unknown live table: ${table}`);
  const key = String(id || '');
  if (!key) return null;
  if (usingSqlite()) {
    const db = getSqlite();
    const row = db.prepare(`SELECT payload FROM ${table} WHERE id = ?`).get(key);
    if (!row?.payload) return null;
    try {
      return JSON.parse(row.payload);
    } catch {
      return null;
    }
  }
  return loadJsonEnvelope(table).items.get(key) || null;
}

export function writeLiveCollection(table, store) {
  if (!LIVE_TABLES[table]) throw new Error(`unknown live table: ${table}`);
  if (usingSqlite()) return sqliteWriteCollection(table, store);
  const itemKey = LIVE_TABLES[table].itemKey;
  const envelope = emptyEnvelope(table, store);
  for (const row of Array.isArray(store?.[itemKey]) ? store[itemKey] : []) {
    const id = String(row?.id || '');
    if (id) envelope.items.set(id, row);
  }
  envelope.meta.generated_at = new Date().toISOString();
  persistJsonSnapshot(table, envelope);
  memory.set(table, envelope);
  return envelopeToStore(table, envelope);
}

function stubStore(table, row, meta = {}) {
  return {
    ...meta,
    [LIVE_TABLES[table].itemKey]: [row],
  };
}

function patchMemoryRow(table, id, row, metaPatch = {}) {
  const cached = memory.get(table);
  if (!cached?.items) return;
  cached.items.set(id, row);
  if (metaPatch && Object.keys(metaPatch).length) {
    cached.meta = {
      ...cached.meta,
      ...metaPatch,
      generated_at: new Date().toISOString(),
    };
  }
  cached._stamp = usingSqlite() ? sqliteStamp() : diskStampJson(table);
}

export function upsertLiveRow(table, row, metaPatch = {}) {
  if (!LIVE_TABLES[table]) throw new Error(`unknown live table: ${table}`);
  const id = String(row?.id || '');
  if (!id) throw new Error('live row requires id');
  const patch = metaPatch && Object.keys(metaPatch).length ? metaPatch : null;
  if (usingSqlite()) {
    const db = getSqlite();
    let meta = patch ? { ...sqliteReadMeta(db, table), ...patch, generated_at: new Date().toISOString() } : null;
    db.exec('BEGIN');
    try {
      sqliteUpsertRow(db, table, row);
      if (meta) sqliteWriteMeta(db, table, meta);
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch {}
      throw err;
    }
    patchMemoryRow(table, id, row, patch || {});
    return stubStore(table, row, meta || memory.get(table)?.meta || {});
  }
  const envelope = loadJsonEnvelope(table);
  envelope.items.set(id, row);
  if (patch) {
    envelope.meta = { ...envelope.meta, ...patch, generated_at: new Date().toISOString() };
    appendJsonWal(table, { op: 'meta', meta: envelope.meta });
  } else {
    envelope.meta = { ...envelope.meta, generated_at: new Date().toISOString() };
  }
  appendJsonWal(table, { op: 'put', id, payload: row });
  envelope._stamp = diskStampJson(table);
  envelope._engine = 'json-wal';
  memory.set(table, envelope);
  maybeCompactJson(table, envelope);
  return stubStore(table, row, envelope.meta);
}

export function deleteLiveRow(table, id) {
  const key = String(id);
  if (usingSqlite()) {
    const db = getSqlite();
    const envelope = sqliteLoadEnvelope(table);
    envelope.items.delete(key);
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(key);
    envelope._stamp = sqliteStamp();
    envelope._engine = 'sqlite';
    memory.set(table, envelope);
    return envelopeToStore(table, envelope);
  }
  const envelope = loadJsonEnvelope(table);
  envelope.items.delete(key);
  appendJsonWal(table, { op: 'delete', id: key });
  envelope._stamp = diskStampJson(table);
  envelope._engine = 'json-wal';
  memory.set(table, envelope);
  maybeCompactJson(table, envelope);
  return envelopeToStore(table, envelope);
}

export function importLiveCollectionFromJson(table, jsonPath) {
  if (!existsSync(jsonPath)) return null;
  const parsed = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  return writeLiveCollection(table, parsed);
}

export function readLiveOrImport(table, jsonPath) {
  if (liveTableHasData(table)) return readLiveCollection(table);
  if (['0', 'false', 'no'].includes(String(process.env.CAREER_OPS_LIVE_IMPORT || '').toLowerCase())) {
    return readLiveCollection(table);
  }
  if (jsonPath && existsSync(jsonPath)) {
    memory.delete(table);
    return importLiveCollectionFromJson(table, jsonPath);
  }
  return readLiveCollection(table);
}

export function resetLiveMemoryForTests() {
  memory.clear();
  if (sqliteDb) {
    try { sqliteDb.close(); } catch {}
    sqliteDb = null;
    sqlitePath = '';
  }
}

export function liveDataDir() {
  return getLiveDataDir();
}

export function liveSqlitePath() {
  return sqliteDbPath();
}
