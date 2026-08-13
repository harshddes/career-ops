# Jobs Domain Islands — Company Research (thin stub)

Jobs To Consider domain islands reuse the **Networking contact research** lane.

## Trigger phrase (unchanged)

`Find new networking contacts`

## What the Jobs UI does

1. **Add company to island** → upserts a networking organization with `career_domains[]` (no job required).
2. **Queue research** → `POST /api/networking/research-queue` with optional brief in `notes` (may include `career_domain=…` and “find open roles”).
3. Pending orders appear under the domain panel and on the Networking tab.

## Agent path

Follow [`NETWORKING_RESEARCH_SOP.md`](./networking/NETWORKING_RESEARCH_SOP.md) for people research.

If the brief asks for open roles: attach findings to the org `notes` / later upsert Jobs To Consider rows — do not invent applications.

## Related fields

| Field | Where |
|-------|--------|
| `career_domains[]` | Networking organization |
| World map country | Jobs explore filter (linked brushing) |
| Company chip | `liveJobsCompanyFilter` |
