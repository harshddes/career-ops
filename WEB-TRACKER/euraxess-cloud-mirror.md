# EURAXESS Cloud Mirror

Local scans run only while the dashboard process is alive. If the laptop is off or asleep, Windows and Node.js cannot fetch the EURAXESS RSS feed. The cloud mirror is the optional always-on layer.

## Recommended Shape

Use GitHub Actions on an hourly schedule to run the deterministic RSS scan:

```yaml
name: EURAXESS Live Feed

on:
  schedule:
    - cron: "17 * * * *"
  workflow_dispatch:

jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      - run: npm ci
      - run: node WEB-TRACKER/euraxess-scan.mjs --all --refresh-liveness
      - run: node WEB-TRACKER/euraxess-agent-worker.mjs --max 3
      - name: Commit EURAXESS snapshot
        run: |
          git config user.name "career-ops-bot"
          git config user.email "career-ops-bot@users.noreply.github.com"
          git add data/euraxess-opportunities.json WEB-TRACKER/data/euraxess-opportunities.json WEB-TRACKER/data/agent-tasks.ndjson data/jobs-to-consider.json WEB-TRACKER/data/jobs-to-consider.json
          git diff --cached --quiet || git commit -m "Update EURAXESS live feed"
          git push
```

## What Works Without Secrets

- Fetch official EURAXESS RSS.
- Parse and score postings.
- Archive low-fit postings while counting them in scan health.
- Queue high-fit task records.
- Link high-fit postings into Jobs to Consider.

## What Needs Secrets Or A Runner

- AI research reports.
- Tailored CVs, cover letters, and emails.
- Provider enrichment beyond public RSS.

Those should only run when a trusted local worker or cloud model key is configured. Until then, records stay visible as `needs_worker`.
