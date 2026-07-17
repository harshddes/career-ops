from __future__ import annotations

import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parent
NORMALIZED = ROOT / "normalized-professor-leads.csv"
SYNTHESIS = ROOT / "structured-synthesis.csv"
TARGET = ROOT.parent / "HarshD_Professors_List_Research_Enriched_2026-07-10.csv"

ENRICHED_FIELDS = [
    "identity_status",
    "current_affiliation",
    "official_profile_url",
    "identity_notes",
    "research_summary",
    "grant_found",
    "grant_title",
    "grant_funder",
    "grant_amount",
    "grant_currency",
    "grant_award_date",
    "grant_project_period",
    "grant_role",
    "grant_status",
    "grant_purpose",
    "grant_source_urls",
    "opening_found",
    "opening_title",
    "opening_type",
    "opening_status",
    "opening_posted_date",
    "opening_deadline",
    "opening_location",
    "opening_summary",
    "opening_official_url",
    "opening_linkedin_url",
    "evidence_confidence",
    "caveats",
    "outreach_priority",
    "priority_reason",
    "all_source_urls",
    "checked_date",
]

FINAL_FIELDS = [
    "lead_id",
    "source_row",
    "lead_type",
    "professor_name",
    "email",
    "university_original",
    "current_affiliation",
    "location_original",
    "research_group_original",
    "research_interests_original",
    "research_theme_original",
    "identity_status",
    "official_profile_url",
    "identity_notes",
    "research_summary",
    "grant_found",
    "grant_title",
    "grant_funder",
    "grant_amount",
    "grant_currency",
    "grant_award_date",
    "grant_project_period",
    "grant_role",
    "grant_status",
    "grant_purpose",
    "grant_source_urls",
    "opening_found",
    "opening_title",
    "opening_type",
    "opening_status",
    "opening_posted_date",
    "opening_deadline",
    "opening_location",
    "opening_summary",
    "opening_official_url",
    "opening_linkedin_url",
    "evidence_confidence",
    "outreach_priority",
    "priority_reason",
    "caveats",
    "all_source_urls",
    "checked_date",
    "deep_research_report_path",
    "existing_accepting_applications_notes",
    "existing_url",
    "existing_status",
    "existing_notes",
]


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as source_file:
        return list(csv.DictReader(source_file))


normalized_rows = read_rows(NORMALIZED)
synthesis_by_id = {
    row["lead_id"]: row for row in read_rows(SYNTHESIS) if row.get("lead_id")
}

missing = [
    row["lead_id"]
    for row in normalized_rows
    if row["lead_id"] not in synthesis_by_id
]
if missing:
    raise SystemExit("Missing synthesis rows: " + ", ".join(missing))

final_rows: list[dict[str, str]] = []
for original in normalized_rows:
    synthesis = synthesis_by_id[original["lead_id"]]
    final_row = {
        "lead_id": original["lead_id"],
        "source_row": original["source_row"],
        "lead_type": original["lead_type"],
        "professor_name": original["professor_name"],
        "email": original["email"],
        "university_original": original["university"],
        "location_original": original["location"],
        "research_group_original": original["research_group"],
        "research_interests_original": original["research_interests"],
        "research_theme_original": original["research_theme"],
        "deep_research_report_path": (
            f"harsh/professor-research-2026/deep-research-results/"
            f"{original['lead_id']}.md"
        ),
        "existing_accepting_applications_notes": original[
            "accepting_applications_notes"
        ],
        "existing_url": original["existing_url"],
        "existing_status": original["existing_status"],
        "existing_notes": original["existing_notes"],
    }
    for field in ENRICHED_FIELDS:
        final_row[field] = synthesis.get(field, "").strip()
    final_rows.append(final_row)


def priority_key(row: dict[str, str]) -> tuple[int, int, str]:
    raw_priority = row["outreach_priority"].strip()
    try:
        numeric_priority = int(raw_priority.split("-", 1)[0])
    except (ValueError, IndexError):
        numeric_priority = 5
    open_rank = 0 if row["opening_status"].casefold() == "open" else 1
    return numeric_priority, open_rank, row["professor_name"].casefold()


final_rows.sort(key=priority_key)
with TARGET.open("w", encoding="utf-8-sig", newline="") as target_file:
    writer = csv.DictWriter(target_file, fieldnames=FINAL_FIELDS)
    writer.writeheader()
    writer.writerows(final_rows)

print(f"Wrote {len(final_rows)} ranked rows to {TARGET}")
