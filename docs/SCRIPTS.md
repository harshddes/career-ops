# Scripts Reference

All scripts live in the project root as `.mjs` modules and are exposed via `npm run <name>`.

## Quick Reference

| Command | Script | Purpose |
|---------|--------|---------|
| `npm run doctor` | `doctor.mjs` | Validate setup prerequisites |
| `npm run verify` | `verify-pipeline.mjs` | Check pipeline data integrity |
| `npm run normalize` | `normalize-statuses.mjs` | Fix non-canonical statuses |
| `npm run dedup` | `dedup-tracker.mjs` | Remove duplicate tracker entries |
| `npm run merge` | `merge-tracker.mjs` | Merge batch TSVs into applications.md |
| `npm run pdf` | `generate-pdf.mjs` | Convert HTML to ATS-optimized PDF |
| `npm run latex` | `generate-latex.mjs` | Compile LaTeX resume source to PDF |
| `npm run sync-check` | `cv-sync-check.mjs` | Validate CV/profile consistency |
| `npm run update:check` | `update-system.mjs check` | Check for upstream updates |
| `npm run update` | `update-system.mjs apply` | Apply upstream update |
| `npm run rollback` | `update-system.mjs rollback` | Rollback last update |
| `npm run liveness` | `check-liveness.mjs` | Test if job URLs are still active |
| `npm run scan` | `scan.mjs` | Zero-token portal scanner |

---

## doctor

Validates that all prerequisites are in place: Node.js >= 18, dependencies installed, Playwright chromium, required files (`cv.md`, `config/profile.yml`, `portals.yml`), fonts directory, and auto-creates `data/`, `output/`, `reports/` if missing.

```bash
npm run doctor
```

**Exit codes:** `0` all checks passed, `1` one or more checks failed (fix messages printed).

---

## verify

Health check for pipeline data integrity. Validates `data/applications.md` against seven rules: canonical statuses (per `templates/states.yml`), no duplicate company+role pairs, all report links point to existing files, scores match `X.XX/5` / `N/A` / `DUP`, rows have proper pipe-delimited format, no pending TSVs in `batch/tracker-additions/`, and no markdown bold in scores.

```bash
npm run verify
```

**Exit codes:** `0` pipeline clean (zero errors), `1` errors found. Warnings (e.g. possible duplicates) do not cause a non-zero exit.

---

## normalize

Maps non-canonical statuses to their canonical equivalents and strips markdown bold and dates from the status column. Aliases like `Enviada` become `Aplicado`, `CERRADA` becomes `Descartado`, etc. DUPLICADO info is moved to the notes column.

```bash
npm run normalize             # apply changes
npm run normalize -- --dry-run  # preview without writing
```

Creates a `.bak` backup of `applications.md` before writing.

**Exit codes:** `0` always (changes or no changes).

---

## dedup

Removes duplicate entries from `applications.md` by grouping on normalized company name + fuzzy role match. Keeps the entry with the highest score. If a removed entry had a more advanced pipeline status, that status is promoted to the keeper.

```bash
npm run dedup             # apply changes
npm run dedup -- --dry-run  # preview without writing
```

Creates a `.bak` backup before writing.

**Exit codes:** `0` always.

---

## merge

Merges batch tracker additions (`batch/tracker-additions/*.tsv`) into `applications.md`. Handles 9-column TSV, 8-column TSV, and pipe-delimited markdown formats. Detects duplicates by report number, entry number, and company+role fuzzy match. Higher-scored re-evaluations update existing entries in place.

```bash
npm run merge                 # apply merge
npm run merge -- --dry-run    # preview without writing
npm run merge -- --verify     # merge then run verify-pipeline
```

Processed TSVs are moved to `batch/tracker-additions/merged/`.

**Exit codes:** `0` success, `1` verification errors (with `--verify`).

---

## pdf

Renders an HTML file to a print-quality, ATS-parseable PDF via headless Chromium. This remains the active renderer for cover letters and legacy HTML PDFs. New tailored resumes should use `npm run latex`.

```bash
npm run pdf -- input.html output.pdf
npm run pdf -- input.html output.pdf --format=letter   # US letter
npm run pdf -- input.html output.pdf --format=a4        # A4 (default)
```

**Exit codes:** `0` PDF generated, `1` missing arguments or generation failure.

---

## latex

Compiles a LaTeX resume source file to PDF. The default engine is `xelatex` because personal resume references may use `fontspec`.

```bash
npm run latex -- output/cv-harsh-company-date.tex output/cv-harsh-company-date.pdf
npm run latex -- harsh/Harsh_Desai_Resume_OnePage_AlignedFullSkills_A4.tex output/cv-harsh-desai-latex-smoke.pdf --engine=xelatex
npm run latex -- output/cv-name.tex output/cv-name.pdf --engine=lualatex
```

**Exit codes:** `0` PDF generated, `1` missing arguments, missing TeX engine, or compiler failure.

After generating a tailored resume or cover letter, agents **must** attach `output/` paths to `data/jobs-to-consider.json` (`job.resources`) and run dashboard sync in the same turn. See `modes/application-artifacts.md` (`## MANDATORY: Jobs Tracker Attachment`).

---

## sync-check

Validates that the career-ops setup is internally consistent: `cv.md` exists and is not too short, `config/profile.yml` exists with required fields, no hardcoded metrics in `modes/_shared.md` or `batch/batch-prompt.md`, and `article-digest.md` freshness (warns if older than 30 days).

```bash
npm run sync-check
```

**Exit codes:** `0` no errors (warnings allowed), `1` errors found.

---

## update:check

Checks whether a newer version of career-ops is available upstream. Outputs JSON to stdout:

```bash
npm run update:check
```

Possible JSON responses:

| `status` | Meaning |
|----------|---------|
| `up-to-date` | Local version matches remote |
| `update-available` | Newer version exists (includes `local`, `remote`, `changelog`) |
| `dismissed` | User dismissed the update prompt |
| `offline` | Could not reach GitHub |

**Exit codes:** `0` always.

---

## update

Applies the upstream update. Creates a backup branch (`backup-pre-update-{version}`), fetches from the canonical repo, checks out only system-layer files, runs `npm install`, and commits. User-layer files (`cv.md`, `config/profile.yml`, `data/`, etc.) are never touched.

```bash
npm run update
```

**Exit codes:** `0` success, `1` lock conflict or safety violation.

---

## rollback

Restores system-layer files from the most recent backup branch created during an update.

```bash
npm run rollback
```

**Exit codes:** `0` success, `1` no backup branch found or git error.

---

## liveness

Tests whether job posting URLs are still live using headless Chromium. Detects expired patterns (e.g. "job no longer available"), HTTP 404/410, ATS redirect patterns, and apply-button presence. Supports multi-language expired patterns (English, German, French).

```bash
npm run liveness -- https://example.com/job/123
npm run liveness -- https://a.com/job/1 https://b.com/job/2
npm run liveness -- --file urls.txt
```

Each URL gets a verdict: `active`, `expired`, or `uncertain` with a reason.

**Exit codes:** `0` all URLs active, `1` any expired or uncertain.

---

## scan

Zero-token portal scanner. Hits ATS APIs (Greenhouse, Ashby, Lever) and career pages directly — no LLM tokens consumed. Reads `portals.yml` for target companies and search queries, outputs matching listings to stdout and optionally appends to `data/pipeline.md`.

```bash
npm run scan
```

**Exit codes:** `0` scan completed, `1` configuration error or no portals.yml found.

---

## Company Focus / KLA Execute Mode (WEB-TRACKER)

Pins one company so Networking + Jobs collapse to a single next move (hub contacts, not 2–3 people per role).

```bash
# Seed KLA org + ≤3 Ann Arbor hardware roles + pin focus + queue research
node WEB-TRACKER/scripts/seed-kla-networking.mjs
```

Then open `http://127.0.0.1:3737/dashboard/fusion-pivot-dashboard.html` → **Networking** → **Execute Mode**.

When the card says to research contacts, say in Cursor: `Find new networking contacts`.

State files:
- `data/company-focus.json` (canonical)
- `WEB-TRACKER/data/company-focus.json` (dashboard mirror)

APIs: `GET/PUT /api/company-focus`, `POST /api/company-focus/pin`, `POST /api/company-focus/advance`.

---

## Daily digest email (WEB-TRACKER)

Sends a nightly summary of today's dashboard activity (applied, contacted, followed, networking, follow-ups) with XLSX/CSV attachments and the live audit CSV from `output/digests/today-activity-YYYY-MM-DD.csv`.

### Gmail App Password setup

1. Enable 2-Step Verification on your Google account.
2. Open [Google App Passwords](https://myaccount.google.com/apppasswords) and create a password for "Mail" / "Other (Career-Ops)".
3. Copy `WEB-TRACKER/.env.example` to `WEB-TRACKER/.env` and set:
   - `SMTP_USER` / `SMTP_FROM` — your Gmail address (default: `harshddes@gmail.com`)
   - `SMTP_PASS` — the 16-character app password (not your regular Gmail password)
   - `DAILY_DIGEST_RECIPIENTS` — comma-separated recipients (default: `harshddes@gmail.com,desaienggworks@gmail.com`)
4. All "today" bucketing uses `DAILY_DIGEST_TIMEZONE=America/New_York`.
5. Reliability: register the Windows task so sleep does not skip nights:

```powershell
powershell -ExecutionPolicy Bypass -File WEB-TRACKER/scripts/register-windows-task.ps1
```

That creates `CareerOpsDailyDigest` at 11:59 PM local with `StartWhenAvailable` (runs after the PC wakes if it missed 23:59). The in-process `run.mjs` cron is a backup only while that Node process is alive.

```bash
# Dry run (no email sent)
node WEB-TRACKER/scripts/send-daily-digest.mjs

# Send to configured recipients
node WEB-TRACKER/scripts/send-daily-digest.mjs --send

# Send to a specific address
node WEB-TRACKER/scripts/send-daily-digest.mjs --send --to harshddes@gmail.com,desaienggworks@gmail.com
```

**Blockers:** Email will not send until `SMTP_PASS` is set in `WEB-TRACKER/.env`. Without SMTP env vars, dry-run still builds attachments locally. Missed days usually mean the PC was asleep/off at 23:59 and no Windows digest task was registered — not a Gmail recipient bug.
