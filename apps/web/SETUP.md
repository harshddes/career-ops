# Click-by-click: make Career OS public (no jargon)

You do **not** paste passwords or keys into Cursor chat. You paste them into **GitHub Secrets** (a locked box on GitHub). After that, tell the agent “secrets are in GitHub” — not the secret values.

Do the **required** blocks in order. Stop after Block 4 if you only want a public website. Blocks 5–6 are extra (email links, Sign in with Google).

Repo: [https://github.com/harshddes/career-ops](https://github.com/harshddes/career-ops)

---

## What you will have at the end of Block 4

A website address that looks like `https://career-os-web.<something>.workers.dev`. That address works on your phone. Your old dashboard `http://127.0.0.1:3737/...` stays on your computer.

---

## Block 1 — Neon (the database)

Neon’s Free plan is **$0/month**. [Neon plans](https://neon.com/docs/introduction/plans)

1. Open [https://console.neon.tech/signup](https://console.neon.tech/signup). Sign up with email, GitHub, or Google. [Sign up](https://neon.com/docs/get-started/signing-up)
2. Finish the onboarding screens that **create a Project**. [Onboarding](https://neon.com/docs/get-started/signing-up)
3. On the **Project Dashboard**, click **Connect**. [Get a connection string](https://neon.com/docs/connect/connect-from-any-app)
4. Leave **Connection pooling** on (the hostname should contain `-pooler`). Copy the whole string. It looks like `postgresql://...@ep-....neon.tech/...?sslmode=require`. That entire string **is** `DATABASE_URL`. [DATABASE_URL](https://neon.com/docs/connect/connect-from-any-app)
5. Paste it into a notes app on your computer for one minute. You will put it in GitHub in Block 3.

---

## Block 2 — Cloudflare (the public website host)

1. Open Cloudflare’s sign-up page and create an account with **Email** and **Password**, then **Create Account**. Confirm the email Cloudflare sends. [Create a Cloudflare account](https://developers.cloudflare.com/fundamentals/account/create-account/)
2. Copy your **Account ID**:
   - Dashboard → **Workers & Pages** → **Account Details** → copy **Account ID**, **or**
   - Press `Ctrl+K` / `Cmd+K`, type `Copy account ID`, select it. [Find account and zone IDs](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/)
   Save this as `CLOUDFLARE_ACCOUNT_ID`.
3. Make an API token Wrangler can use in GitHub:
   1. Cloudflare dashboard → **Account API tokens**.
   2. **Create Token**.
   3. Under permission policies, open **Custom** and select **Edit Cloudflare Workers**.
   4. Name the token. Limit it to **this one account**.
   5. Create it and copy the token **once**. [Workers GitHub Actions auth](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
   Save this as `CLOUDFLARE_API_TOKEN`.

---

## Block 3 — Put the three required secrets on GitHub

You need **write** access on this repo (you own it). [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)

1. Open [https://github.com/harshddes/career-ops](https://github.com/harshddes/career-ops)
2. Click **Settings**. If you do not see it, open the extra tabs menu and click **Settings**.
3. Sidebar: **Secrets and variables** → **Actions**.
4. Click the **Secrets** tab.
5. Click **New repository secret**. Add these **three**, one at a time (Name, then Secret, then **Add secret**):

| Name | Paste this |
|------|------------|
| `DATABASE_URL` | The Neon string from Block 1 |
| `CLOUDFLARE_API_TOKEN` | The token from Block 2 |
| `CLOUDFLARE_ACCOUNT_ID` | The Account ID from Block 2 |

Cloudflare’s own CI guide uses those two Cloudflare names. [Set up CI/CD](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)

---

## Block 4 — Turn the site on

1. Open [https://github.com/harshddes/career-ops/actions/workflows/public-web-deploy.yml](https://github.com/harshddes/career-ops/actions/workflows/public-web-deploy.yml)
2. Click **Run workflow**.
3. Branch: `main`.
4. Click the green **Run workflow** button.
5. Open the run. Wait until it is green.
6. In the **Deploy Cloudflare Worker** log, copy the `*.workers.dev` URL Wrangler prints. That is the public site.

**This site is already live** (after the 2026-08-14 green deploy):

[https://career-os-web.harshddes.workers.dev](https://career-os-web.harshddes.workers.dev)

The first two red runs were code bugs (schema comments, then a Worker file-path crash). After that, sign-in worked but the next page crashed (Cloudflare error 1101) because the public site cannot hold a database session. That is fixed: after **Create workspace** or **Sign in with email** you should land on **Today**.

Hourly job scans on a schedule only run from `main`. Until this branch is merged, deploy also fills the shared job catalog. You can still run [public-catalog-scan.yml](../../.github/workflows/public-catalog-scan.yml) by hand.

If a later run is red, do not paste secrets into chat. Paste the **error text with secrets starred out**.

---

## Block 5 — Optional: email magic links (Resend)

Skip this if password sign-in is enough.

1. Create a Resend account, then open the [API keys dashboard](https://resend.com/api-keys). [Manage API keys](https://resend.com/docs/dashboard/api-keys/introduction)
2. Sidebar **API Keys** → **Create API Key** → name it → permission **Sending access** (enough to send mail). Copy the key **once**. [Create an API key](https://resend.com/docs/create-an-api-key) and [changelog steps](https://resend.com/changelog/new-api-key-permissions)
3. GitHub → same Secrets page → **New repository secret**:
   - Name `RESEND_API_KEY`
   - Value the `re_...` key
4. Re-run **public-web-deploy**. Deploy already sets `APP_BASE_URL` to the `workers.dev` URL. Only add a GitHub secret named `APP_BASE_URL` if you later use a custom domain.

Until you add your own domain in Resend, test mail uses Resend’s onboarding sender (`onboarding@resend.dev` in this app). You can only send to **your own Resend signup email** until a domain is verified — that is Resend’s test-sender rule, not something this repo can bypass.

---

## Block 6 — Optional: Sign in with Google

Skip this if email + password is enough. Do this **after** you have the `workers.dev` URL from Block 4.

Google’s steps: [Manage OAuth Clients](https://support.google.com/cloud/answer/6158849)

1. Open the **Google Auth Platform Clients** page (Google Cloud Console). Create a project if asked. Register the app for Google Auth if asked.
2. Click **CREATE CLIENT**.
3. Application type: **Web application**.
4. Authorized redirect URI (must match exactly, HTTPS):

   `https://career-os-web.harshddes.workers.dev/api/auth/google/callback`

   Redirect URIs must be HTTPS (localhost is the exception). [Authorized redirect URIs](https://support.google.com/cloud/answer/6158849)
5. Click **CREATE**. Copy **Client ID** and **Client secret**. The secret is shown **once**.
6. GitHub secrets (deploy already writes `APP_BASE_URL` to the `workers.dev` URL):

| Name | Paste this |
|------|------------|
| `GOOGLE_CLIENT_ID` | Client ID |
| `GOOGLE_CLIENT_SECRET` | Client secret |

This app requests only `openid email profile` (see `apps/web/src/app.mjs`). Do **not** enable Gmail scopes.

7. Re-run **public-web-deploy**.

---

## What you send back to the agent

Send this, **not** the secret values:

- “I added `DATABASE_URL`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_ACCOUNT_ID` on GitHub.”
- The public `https://....workers.dev` URL from the deploy log (that URL is not a secret).
- Optional: “I also added Resend / Google.”

---

## What you do **not** create

- No Railway, no paid domain, no Gmail API, no Gemini key, no credit card for the $0 path.
