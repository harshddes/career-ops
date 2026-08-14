import { serve } from '@hono/node-server';
import { applySchema, createDb } from './db.mjs';
import { createApp } from './app.mjs';
import { stubEuraxessJobs, stubOrgs, upsertCatalogJobs, upsertCatalogOrgs } from './catalog.mjs';

const env = process.env;
const db = await createDb(env.DATABASE_URL || 'pglite');
await applySchema(db);
if (env.SEED_STUB_CATALOG !== '0') {
  await upsertCatalogOrgs(db, stubOrgs());
  await upsertCatalogJobs(db, stubEuraxessJobs());
}

const app = createApp({
  db,
  env: { ...env, ALLOW_INSECURE_MAGIC_LINK: env.ALLOW_INSECURE_MAGIC_LINK || '1' },
  seedStubCatalog: env.SEED_STUB_CATALOG !== '0',
});

const port = Number(env.PORT || 8787);
const hostname = env.HOST || '127.0.0.1';
serve({ fetch: app.fetch, port, hostname });
console.log(`Career OS web listening on http://${hostname}:${port}`);
