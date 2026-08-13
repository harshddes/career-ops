# Networking Contact Research SOP

**Trigger phrase:** `Find new networking contacts`

**Lane:** Networking Command Center only. Never mix with EURAXESS, PhDScanner, Target Companies exhibitor, or Operations `agent-tasks.ndjson`.

## Hard contract

1. Read `WEB-TRACKER/data/networking-research-queue.json`.
2. If `pending_count === 0`, reply only: `Networking research queue is empty.` and stop.
3. Process **every** pending order. Do not ask clarifying questions.
4. Never scrape LinkedIn, never automate LinkedIn messaging, never auto-send email.
5. Candidate people must enter `review_status: review_ready` (or equivalent review state) — never auto-contact.
6. Affinity tags (`umich`, `vit`, etc.) require **explicit public evidence**. Never infer ethnicity, nationality, immigration status, or “Indian” identity from names, photos, language, or social graphs.
7. Work is incomplete until candidates are upserted, the order is marked `review_ready` or `completed`, and `syncNetworkingToDashboard()` has run.

## FN strategy lanes (dashboard-native)

Do **not** invent a Jobs “Tier A/B/C”. Use existing fields:

| Lane | Networking org | Jobs posting gate | Research notes |
|------|----------------|-------------------|----------------|
| Apply hard | `tier=A`, `strategy_status=active` | not `export_control=hard_us_person` | Normal contact research |
| Selective | `tier=B` | `export_control=soft_or_review` / `eligibility_band=selective` | Confirm non-ITAR / work-auth early |
| Intel only | `tier=C`, `strategy_status=watch` | `export_control=hard_us_person` / closed | **Must** include `intel_only` in order notes — no “ask for ITAR exception” as the default ask |

If `order.notes` contains `intel_only` (or the org is tier C / ITAR-hard): find peers for **referrals to open lanes**, industry intel, or commercial/Europe sister orgs — never coach the user to apply to the closed posting.

## Entry points

| File | Role |
|------|------|
| `WEB-TRACKER/data/networking-research-queue.json` | Pending research work orders |
| `WEB-TRACKER/lib/networking/NETWORKING_RESEARCH_SOP.md` | This SOP |
| `WEB-TRACKER/lib/networking/factory.mjs` | Queue status transitions |
| `WEB-TRACKER/lib/networking/store.mjs` | Upsert people/orgs + dashboard sync |

## Mechanical steps per pending order

1. Call `markNetworkingResearchInProgress(order.id)`.
2. If `order.notes` (research focus) is non-empty, treat it as the **primary targeting brief**. Prioritize people/teams/domains named there over a generic org-wide sweep.
3. Prefer these sources in order:
   1. Official company / lab / team pages
   2. University of Michigan and VIT alumni resources the user can open (launcher notes only; do not bypass login walls)
   3. Public conference / event speaker lists
   4. ORCID Public API
   5. GitHub public profiles for technical relevance (no unsolicited email mining)
   6. Bluesky / Mastodon public profiles when self-declared role/org is clear
4. For each candidate, collect:
   - `display_name`, `title`, `current_organization`
   - `personas` such as `recruiter`, `peer`, `hiring_manager`
   - profile URLs the person published
   - `source_refs[]` with URL, field, observed value, capture time, confidence
   - `affinity_tags` only when education/alumni membership is explicitly stated
5. Deduplicate against existing people via email / LinkedIn URL / GitHub URL before creating a new record. Ambiguous name+org matches stay in duplicate review.
6. Upsert organization, then upsert people with:
   - `relationship_stage: identified` or `researching`
   - `review_status: review_ready`
   - channel states set to `available` only when a real channel URL/email is present
7. Call `markNetworkingResearchReviewReady(order.id, candidatePersonIds)`.
8. After the user can see candidates on the Networking tab, call `completeNetworkingResearch(order.id)` and `syncNetworkingToDashboard()`.

## Cancel / delete queue

Users may cancel a pending order via the dashboard (**Delete research queue**) or `cancelNetworkingResearch(order.id)`. That removes the work order only — organizations and people stay. Do not invent cancel as a research outcome; only process `pending` orders.

## Forbidden

- LinkedIn scraping, DOM reading, cookie/session automation, bulk connection requests
- Inferring sensitive attributes
- Bulk email enrichment of an entire company
- Auto-sending outreach or marking people `contacted` without user action
- Publishing networking PII into the static GitHub Pages snapshot

## Done checklist

- [ ] Every pending order processed
- [ ] `notes` / research focus honored when present
- [ ] Candidates have evidence / provenance
- [ ] No auto-contact
- [ ] Queue order is `review_ready` or `completed`
- [ ] Dashboard sync ran
- [ ] Networking tab shows the new people after refresh
