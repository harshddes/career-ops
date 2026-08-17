# Career OS — public web (agent-native)

**Plan:** [PLAN.md](PLAN.md)

This is a **new** multi-tenant workplace. It does not replace `http://127.0.0.1:3737/dashboard/fusion-pivot-dashboard.html`.

There is **no public phone URL until Neon + Cloudflare exist**. `:8787` is local only.

**You create the accounts.** Click-by-click: [SETUP.md](SETUP.md). Do not paste keys into chat.

## What it does (phases 0–4 in code)

- Login, isolated workspaces, compact feeds, Applied kanban
- Queue research → Copy prompt into Cursor → paste report back
- Hourly GitHub Action ingest (EURAXESS RSS, Fusion ATS, U-M listing, PhDScanner listing)
- Private CV text, keyword **rule scores**, browser print-to-PDF resume (no Gemini)
- Export JSON + delete account
- Optional Resend digest (max 100 emails/run)
- Privacy / Terms
- Docker Compose for the **local** `:3737` factory only

It does **not** run Cursor, Gemini, Gmail, LinkedIn scrape, or Playwright on Cloudflare.

## Local (terminal must stay open)

```bash
cd apps/web
npm install
npm test
npm run dev
```

Open `http://127.0.0.1:8787` on **this computer**.

## Public URL (any phone / laptop — no terminal)

You create free accounts (no card):

1. [Neon](https://neon.tech) → copy `DATABASE_URL`
2. [Cloudflare](https://dash.cloudflare.com) → API token with Workers deploy
3. GitHub repo secrets: `DATABASE_URL`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
4. Cloudflare Worker secret: `DATABASE_URL` (`npx wrangler secret put DATABASE_URL` in `apps/web`)
5. Optional: `RESEND_API_KEY`, Google OAuth `openid email profile`

Then `.github/workflows/public-web-deploy.yml` deploys (Actions → Run workflow, or after merge to `main`). The live URL is the Worker `*.workers.dev` hostname Wrangler prints. GitHub secrets are copied onto the Worker during that deploy. After that the site stays up without your PC.

Hourly scans: `.github/workflows/public-catalog-scan.yml` (no-op until `DATABASE_URL` is set).

## Optional local factory (Cursor / LaTeX)

```bash
docker compose -f docker-compose.factory.yml up --build
```

Still `http://127.0.0.1:3737/dashboard/fusion-pivot-dashboard.html`. Do not expose this container to the internet.
