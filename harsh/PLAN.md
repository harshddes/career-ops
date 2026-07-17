# EURAXESS Autonomous Research + CV Factory

## Summary

Build a real EURAXESS factory on top of the current live-feed repair: discovery runs continuously, high-fit postings are researched automatically, application packs are generated as drafts, and every artifact is attached back to the dashboard. The system must never silently blank out, never violate EURAXESS access rules, and never submit/send applications automatically.

Default architecture:
- **RSS-first discovery** for compliant live monitoring.
- **Optional provider backfill** for more than the 20 RSS items.
- **Dedicated worker daemon** for research, reports, CVs, cover letters, and emails.
- **Dashboard-first observability** so every scan, skip, failure, artifact, and queue state is visible.
- **Local artifacts by default** because CV/profile data is private; cloud mirror handles discovery continuity.

## Key Changes

- Replace the current “queue only” worker with a full EURAXESS factory state machine:
  - `discovered -> scored -> queued_research -> research_ready -> queued_pack -> pack_ready -> user_review -> applied_or_archived`.
  - Add explicit statuses for `open_unverified`, `needs_deadline_verification`, `provider_limited`, `runner_unavailable`, `failed_retryable`, and `failed_final`.
  - Preserve every scanned item; default dashboard hides low-fit records but shows counts and reasons.

- Add a durable artifact runner:
  - Use `parallel-cli` for external research, since it is available now.
  - Use a configurable agent runner for artifact creation, defaulting to `codex exec` when enabled.
  - Run artifact generation in an isolated runtime workspace, then import only allowed outputs: `reports/`, `output/`, `data/jobs-to-consider.json`, EURAXESS store updates, and dashboard mirrors.
  - Require every worker result to emit a manifest with `opportunity_id`, `report_md`, `resources`, validation results, score, decision, and errors.
  - If the runner is unavailable, keep the posting visible as `needs_worker`; do not pretend work happened.

- Expand discovery beyond the 20-item RSS window without unsafe crawling:
  - Keep official RSS as the no-token primary source.
  - Add `euraxess-backfill.mjs` using only configured permitted providers: Apify token, imported CSV/JSON seed, or manual seed URLs.
  - Do not use direct EURAXESS query-string or `/jobs/*` crawling as a default path while robots rules block it.
  - Add search profiles for `fusion_plasma_diagnostics`, `instrumentation`, `space_plasma`, `controls_robotics`, and `mass_spectrometry`.
  - Dedupe by EURAXESS job id, URL, normalized title/institution, and provider id; skip already researched or archived records unless `--force`.

- Make the dashboard the control plane:
  - Run the full local server by default for the live dashboard; keep the fast server for static snapshots only.
  - Add EURAXESS Factory controls: scan now, backfill now, process queue, retry failures, pause automation, and show all scanned.
  - Add status panels for RSS health, provider coverage, factory queue, daily research budget, runner health, latest artifacts, and failed sources.
  - Add per-card actions: queue research, queue application pack, archive, mark duplicate, retry, and open artifacts.

- Automation and durability:
  - On startup: run EURAXESS scan first, then worker tick.
  - While dashboard is alive: RSS scan every 2 hours, worker tick every 15 minutes, backfill once daily if a provider token is configured.
  - Add Windows Task Scheduler registration for `CareerOpsEuraxessFactoryTick` every 30 minutes; fall back to Startup-folder autostart if registration fails.
  - Add GitHub Actions cloud mirror for hourly RSS discovery only; it writes scan snapshots/tasks, but local machine generates private CV/application artifacts when awake.

## Interfaces And Data

- Extend EURAXESS opportunity records with:
  - `coverage`: provider, feed window, backfill profile, first_seen, last_seen, duplicate_of.
  - `verification`: deadline source, status source, verified_at, verification_required.
  - `automation`: worker_status, current_stage, attempts, next_retry_at, last_error, runner.
  - `artifacts`: research_report, resume_tex, resume_pdf, cover_letter_pdf, email_draft, manifest_path.
  - `decision`: apply_recommendation, score, confidence, rationale, archive_reason.

- Add APIs on the full server:
  - `GET /api/euraxess/factory/status`
  - `POST /api/euraxess/factory/run`
  - `POST /api/euraxess/backfill`
  - `POST /api/euraxess/opportunities/:id/queue-research`
  - `POST /api/euraxess/opportunities/:id/queue-application-pack`
  - `POST /api/euraxess/opportunities/:id/archive`
  - `POST /api/euraxess/opportunities/:id/retry`

- Add commands:
  - `node WEB-TRACKER/euraxess-scan.mjs --all --refresh-liveness`
  - `node WEB-TRACKER/euraxess-backfill.mjs --profile fusion_plasma_diagnostics --max 500`
  - `node WEB-TRACKER/euraxess-factory-worker.mjs --max 3`
  - `node WEB-TRACKER/euraxess-factory-worker.mjs --dry-run --max 3`
  - `node WEB-TRACKER/control-plane.mjs --euraxess-factory --health`

## Test Plan

- Unit tests:
  - RSS parsing, XML cleanup, missing deadlines, scoring thresholds, dedupe, provider fallback, manual seed import.
  - Factory state transitions, retry/backoff, runner unavailable, manifest validation, allowed-output import.
  - Jobs-to-Consider linking and EURAXESS store/dashboard mirror sync.

- Integration tests:
  - Fixture RSS with one high-fit posting creates research and pack tasks.
  - Fake Parallel result produces a research report and updates the opportunity.
  - Fake agent runner creates resume/cover/email files, imports only allowed artifacts, and attaches resources.
  - Low-score postings remain archived but counted.
  - Provider failure shows dashboard/source-health errors instead of blank UI.

- Acceptance commands:
  - `node --test WEB-TRACKER/test/euraxess-*.test.mjs WEB-TRACKER/test/source-health.test.mjs`
  - `node WEB-TRACKER/preflight.mjs --health`
  - `node WEB-TRACKER/euraxess-scan.mjs --all --refresh-liveness`
  - `node WEB-TRACKER/euraxess-factory-worker.mjs --dry-run --max 3`
  - `node verify-pipeline.mjs`

## Assumptions And Defaults

- No application is ever submitted or emailed automatically.
- Draft artifacts may be generated automatically for score `>= 4.0`; research-only runs for score `>= 3.5`.
- Score `3.2-3.49` stays visible for review but does not trigger automatic artifacts.
- RSS remains the default no-secret source; full historical coverage requires Apify/imported seed/manual provider.
- Cloud automation prevents missed discovery while the laptop is off; private CV/application generation remains local unless explicit cloud secrets are configured later.
- If any worker changes files outside the allowlist, the run is marked `needs_user` and no dashboard record is promoted to ready.
