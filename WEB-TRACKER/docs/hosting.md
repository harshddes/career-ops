# Public snapshot vs the live dashboard

The working dashboard stays on this PC at **`http://127.0.0.1:3737/dashboard/fusion-pivot-dashboard.html`**. That address does not change. The `data/` directory, `cv.md`, and the Node process are the database.

No custom domain is bought for this project. Free hostnames already exist (`github.io`, `pages.dev`, the local URL above). A registrar checkout does not make tabs faster and does not move the writable app to the cloud.

## GitHub Pages / Cloudflare Pages — look only

`npm run publish:dashboard` runs `WEB-TRACKER/lib/generate-static-snapshot.mjs` and writes a **read-only photocopy** of selected JSON (list projections for the fat feeds). Existing public URL pattern: `harshddes.github.io/career-dashboard/`.

On that copy you can **look** at Today / Jobs / EURAXESS / PhDScanner / U-M after a publish. You **cannot**:

- mark Applied
- move kanban cards
- log Networking
- send digest email
- run scans

Networking people, Gmail thread links, notes, and research work orders are **intentionally excluded** from the snapshot. Publish is one-way: local folder → static files.

This is a website, not the working app. Other people see whatever you last published. The home PC can be off.

## Cloudflare Tunnel (optional) — full remote use while the PC is on

To mark Applied, move kanban, or use Networking from a phone, iPad, or another laptop:

1. Keep this PC on.
2. Keep `node run.mjs` (or Launch-CareerOps-Dashboard) serving **port 3737**.
3. Point a Cloudflare Tunnel (or Tailscale) at `127.0.0.1:3737`.
4. Put Cloudflare Access in front, limited to your umich email.

The local directory is still the database. If the PC sleeps, the tunnel dies.

## What is not in this pass

- Buying or registering a domain (Cloudflare Registrar, Namefi, Porkbun, or otherwise).
- Deploying Express to AWS/Azure with PII on the public internet.
- Replacing `data/` with a cloud database.
- Putting Networking on the public snapshot.

Student cloud credits do not change the security problem of putting Gmail/SMTP/Networking on a public VPS.
