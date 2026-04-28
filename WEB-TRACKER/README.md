# WEB-TRACKER Control Plane

`WEB-TRACKER` is a local-only dashboard for running and monitoring the career-ops workflow.

## Run Locally

```powershell
cd WEB-TRACKER
npm install
npm run start:assisted
```

Open `http://127.0.0.1:3737`.

## Dashboard Control Model

The dashboard calls a local Express API in `server.mjs`. It only runs allowlisted actions; it does not accept arbitrary shell commands.

The control API is local-first:

- Server binds to `127.0.0.1` by default.
- Mutating endpoints only allow localhost origins.
- Scripts run through `spawn` with fixed command arguments.
- Job logs are stored in `WEB-TRACKER/data/jobs.json`, which is ignored by git.

## How To Use It

Start on the `Today` tab. The dashboard intentionally shows only a few actions:

1. Do the required action.
2. If you have energy, do the next two.
3. If the day is wrecked, do the minimum win.

Every action can be marked `Done`, `Defer`, `Blocked`, or `Waiting`. Repeatedly deferred work gets shrunk into a smaller action instead of becoming weekend debt.

The `Behind The Scenes` tab is for dashboard chores such as refreshing data and checking jobs. Start with `Update my dashboard`; you do not need to understand the underlying scripts.

## No Paid AI API Required

Normal operations are deterministic and run on this PC:

- Sync career-ops data
- Scan job APIs
- Scan PhD/lab/admissions sources
- Check liveness
- Analyze patterns
- Compute follow-up cadence
- Verify/merge tracker state
- Filter by H-1B, green-card/PERM, ITAR/export-control, and region

Agent-heavy tasks are queued instead of pretending to be automatic:

- Full job evaluation
- Tailored CV/report generation
- Deep research
- Contact draft refinement

The queue lives in `WEB-TRACKER/data/agent-tasks.ndjson` and is ignored by git.

## Windows Daily Automation

Register a login task:

```powershell
cd WEB-TRACKER
npm run install:windows-task
```

This starts `run.mjs --mode assisted --no-open` at login. Assisted mode runs scans and syncs, while applications and emails remain review-only.

## Key Files

- `server.mjs` — local web server and control API
- `run.mjs` — scheduler and dashboard boot
- `lib/action-runner.mjs` — allowlisted command registry
- `lib/job-store.mjs` — local job history and logs
- `lib/work-auth.mjs` — H-1B, green-card, export-control, and region normalization
- `dashboard/fusion-pivot-dashboard.html` — dashboard UI
