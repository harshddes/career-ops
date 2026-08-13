# CLEAR_QUEUE_SOP — Target Companies Exhibitor Lane

**Trigger phrases (any of these → execute immediately, zero questions):**
- Clear the queue in Target Companies
- Clear target companies queue
- Clear the exhibitor queue

**Lane identity:** `target-companies-exhibitor` only.  
Do **not** touch EURAXESS, PhDScanner, or Operations `agent-tasks.ndjson`.

## Step 0 — Read status first

1. Read `WEB-TRACKER/data/exhibitor-clear-queue.json` (canonical pending list).
2. If `pending_count === 0`: reply only `Target Companies exhibitor queue is empty.` and stop.
3. If pending: process **every** item in `pending[]` this session. Never ask which companies.

## Per pending company (in file order)

### 1. Mark in progress

```js
import {
  markExhibitorTaskInProgress,
  markExhibitorTaskCompleted,
} from './WEB-TRACKER/lib/exhibitor/factory.mjs';
import {
  patchExhibitorCompany,
  syncExhibitorCompaniesToDashboard,
} from './WEB-TRACKER/lib/exhibitor/company-store.mjs';
import {
  upsertConsiderJob,
  syncConsiderJobsToDashboard,
  slugify,
} from './WEB-TRACKER/lib/jobs-to-consider-store.mjs';

markExhibitorTaskInProgress(company_id);
```

### 2. Find careers portal

- Firecrawl `search` / `map` for official site + careers page.
- Prefer Greenhouse / Lever / Ashby / Workday board APIs when detected.
- Save discovered `website` + `careers_url` via `patchExhibitorCompany`.

### 3. Enumerate EVERY open posting

- Paginate until exhausted. Do not sample.
- Save raw inventory under `batch/exhibitors/{company-slug}/` (JSON and/or markdown).

### 4. Extract evidence for canonical scoring

Read `modes/_profile.md` + `config/profile.yml`.

For every posting, save the complete posting text and an
`opportunity-evidence-v1` fact sheet: exact quotes, source locations, approved
candidate fact IDs, and unresolved questions. Do not write a score, tier,
recommendation, penalty, eligibility result, confidence, or override. The
Jobs-to-Consider store invokes the deterministic engine and rejects direct
canonical score writes.

**Add to Jobs to Consider when the engine returns:** eligible/risky plus
`apply`, `consider`, or `adjacent`. Blocked and `skip` results stay in the
report. Review-required results may be added only with their review state
visible.

### 5. Upsert fit roles

```js
upsertConsiderJob({
  id: slugify(`${company}-${title}`),
  company,
  title,
  url,
  location,
  source: 'exhibitor-smallsat-2026',
  posting_text: fullPostingText,
  fit_summary: '...',
  notes: 'From Target Companies exhibitor clear-queue.',
  status: 'to_consider',
});
syncConsiderJobsToDashboard();
```

### 6. Write research report

Path: `reports/exhibitor-{company-slug}-{YYYY-MM-DD}.md`

Must include: company summary, booth, careers URL, full posting inventory, keep/skip table, work-auth notes, list of JTC ids added.

### 7. Attach to the same Target Companies card

```js
patchExhibitorCompany(company_id, {
  worker_status: 'research_ready', // or no_open_roles | no_fit
  website,
  careers_url,
  research_report: 'reports/exhibitor-....md',
  resources: { report_md: 'reports/exhibitor-....md' },
  jobs_found: [{ id, title, url, scoring: 'canonical result copied from stored JTC record' }],
  postings_scanned: N,
  postings_added: M,
  last_researched_at: new Date().toISOString(),
  fit_summary: '...',
  why_fit: '...', // or why_skip
});
syncExhibitorCompaniesToDashboard();
markExhibitorTaskCompleted(company_id);
```

On hard failure:

```js
markExhibitorTaskCompleted(company_id, { failed: true, error: 'concrete reason' });
```

### 8. Done criteria (mandatory)

Work is incomplete until:
1. Report exists on disk, **and**
2. Exhibitor company has `research_report` / `resources.report_md`, **and**
3. Dashboard sync ran — Target Companies → Exhibitor card shows **Artifacts** + JTC role button after refresh.

## Fit gate cheat sheet

| Outcome | `worker_status` | Jobs to Consider |
|---------|-----------------|------------------|
| Strong hardware/instrumentation fit | `research_ready` | Upsert roles |
| Weak/adjacent only | `research_ready` + `why_skip` | Report only |
| No careers / no openings | `no_open_roles` | None |
| Citizenship/ITAR hard block only | `no_fit` | None |
