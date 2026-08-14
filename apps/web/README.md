# Career OS — public web (agent-native)

**Full earlier $0 plan:** [PLAN.md](PLAN.md)

This is a **new** multi-tenant workplace. It does not replace the local dashboard at `http://127.0.0.1:3737/dashboard/fusion-pivot-dashboard.html`.

`:8787` is this public app. `:3737` is your personal Fusion Pivot factory (LaTeX / Playwright). They are different processes.

## What it does

- Shared compact job catalog (EURAXESS, Fusion ATS, U-M Careers, PhDScanner listing)
- Private overlays (saved / applied kanban)
- **Queue research** on a job, company, or person → compiles a Cursor prompt
- **Inbox → Copy prompt** → paste into Cursor → paste the report back
- Daily/hourly ingest via GitHub Actions (not Cloudflare Workers)

It does **not** run Cursor, Gemini, Gmail, LinkedIn scrape, or Playwright. Lanes stay isolated (EURAXESS vs exhibitor vs networking).

Networking people and work-order results are RLS-private. They are never safe for a static snapshot (`src/snapshot-guard.mjs`).

## Local

```bash
cd apps/web
npm install
npm test
npm run dev
```

Open `http://127.0.0.1:8787` after the terminal prints `Career OS web listening`.

If the browser says `ERR_CONNECTION_REFUSED` on `:8787`, run `npm run dev` **on the same machine as the browser**.

## Cloud ingest

```bash
# no-op without DATABASE_URL (CI stays green)
npm run catalog:ingest -- --sources=euraxess,fusion,umich,phdscanner
```

GitHub Action: `.github/workflows/public-catalog-scan.yml` (hourly). Set repository secret `DATABASE_URL`.

Skipped in cloud: FindAPhD (bot wall), Apify backfill, per-user Playwright, factory workers.

## $0 deploy

1. Neon Free `DATABASE_URL`
2. Cloudflare Worker/Pages from this folder (`wrangler.toml`)
3. Optional Google OAuth (`openid email profile`)
4. Optional Resend
5. Secret `CATALOG_SERVICE_KEY` if you upsert via HTTP
