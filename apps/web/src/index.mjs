import { createApp } from './app.mjs';
import { createDb } from './db.mjs';

export default {
  async fetch(request, env, ctx) {
    if (!env.DATABASE_URL) {
      return new Response('DATABASE_URL is not set', { status: 500 });
    }
    const db = await createDb(env.DATABASE_URL);
    const app = createApp({
      db,
      env,
      seedStubCatalog: env.SEED_STUB_CATALOG === '1',
    });
    return app.fetch(request, env, ctx);
  },
};
