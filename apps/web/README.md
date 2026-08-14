# Career OS — public web (Phase 0)

**Full plan (phases 0–4):** [PLAN.md](PLAN.md)

This is a **new** multi-tenant website. It does not replace the local dashboard at `http://127.0.0.1:3737/dashboard/fusion-pivot-dashboard.html`.

`:8787` is this public app. `:3737` is your personal Fusion Pivot. They are different processes. Nothing answers on 8787 until `npm run dev` is running **on the same machine as the browser**.

Anyone can create a workspace. Job catalogs are shared. Status, notes, and later CVs are private. Isolation is enforced in SQL (RLS) and in the API.

## $0 deploy path

1. Create a [Neon](https://neon.tech) Free project (no credit card). Copy `DATABASE_URL`.
2. Create a [Cloudflare](https://dash.cloudflare.com) account. This folder is a Worker / Pages app (`wrangler.toml`).
3. Optional: Google Cloud OAuth client with scopes `openid email profile` only.
4. Optional: [Resend](https://resend.com) free key for magic-link email.
5. Put secrets in Cloudflare and in the GitHub Action secret `DATABASE_URL`.
6. Keep this app in a **public** GitHub repo so Actions minutes stay free.

Local dashboard, Networking PII, and `cv.md` stay on your PC.

## Local

```bash
cd apps/web
npm install
npm test
npm run dev
```

Open `http://127.0.0.1:8787`. Register two emails in two browsers and confirm notes do not leak.

If the browser says `ERR_CONNECTION_REFUSED` on `:8787`:

1. Confirm the terminal printed `Career OS web listening on http://127.0.0.1:8787`. Opening the page during `npm install` / `npm test` will refuse.
2. Run `curl http://127.0.0.1:8787/` **on the same machine as the browser**. `127.0.0.1` is that computer, not a cloud VM.
3. On your PC: `git checkout cursor/zero-cost-public-saas-0a19 && cd apps/web && npm install && npm run dev`.
4. `:3737` is Fusion Pivot. `:8787` is this app. They are not interchangeable.

## What this phase proves

- Login (email/password now; Google when secrets exist)
- Two users cannot read each other’s overlays
- EURAXESS list is a compact shared catalog, not a 6–8 MB JSON dump
- Catalog upserts are a public GitHub Action, not a paid always-on worker

Auth tables here are small and tested on PGlite. [Neon Auth / Better Auth](https://neon.com/docs/auth/overview) can replace the session layer later without changing `catalog_jobs` / `job_overlays`.
