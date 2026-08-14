import { createApp } from './app.mjs';
import { createDb } from './db.mjs';

let cachedDb;
const inflight = new Map();

async function dbFor(connectionString) {
  if (cachedDb) return cachedDb;
  let pending = inflight.get(connectionString);
  if (!pending) {
    pending = createDb(connectionString).then((db) => {
      cachedDb = db;
      inflight.delete(connectionString);
      return db;
    });
    inflight.set(connectionString, pending);
  }
  return pending;
}

export default {
  async fetch(request, env, ctx) {
    if (!env.DATABASE_URL) {
      return new Response('DATABASE_URL is not set', { status: 500 });
    }
    const db = await dbFor(env.DATABASE_URL);
    const app = createApp({
      db,
      env,
      seedStubCatalog: env.SEED_STUB_CATALOG === '1',
    });
    return app.fetch(request, env, ctx);
  },
};
