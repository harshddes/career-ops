from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
NORMALIZED = ROOT / "normalized-professor-leads.csv"
BULK_RESULTS = ROOT / "bulk-enrichment-results.json"
SEARCH_DIR = ROOT / "search-results"
REPORT_DIR = ROOT / "deep-research-results"
EXTRACT_DIR = ROOT / "extracted-sources"
TARGET = ROOT / "evidence-bundles.csv"


def read_csv_by_id(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8-sig", newline="") as source_file:
        return {
            row["lead_id"]: row
            for row in csv.DictReader(source_file)
            if row.get("lead_id")
        }


def compact_search(path: Path, name: str) -> str:
    if not path.exists():
        return ""
    payload = json.loads(path.read_text(encoding="utf-8"))
    surname = name.split()[-1].casefold() if name.split() else ""
    compact_results: list[dict[str, object]] = []
    for result in payload.get("results", []):
        text = json.dumps(result, ensure_ascii=False).casefold()
        if surname and surname not in text:
            continue
        compact_results.append(
            {
                "title": result.get("title"),
                "url": result.get("url"),
                "publish_date": result.get("publish_date"),
                "excerpts": [
                    excerpt[:1800] for excerpt in result.get("excerpts", [])[:2]
                ],
            }
        )
    return json.dumps(compact_results[:8], ensure_ascii=False)[:14000]


def compact_json(path: Path, limit: int) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")[:limit]


def read_bulk_results(path: Path) -> dict[str, dict[str, object]]:
    if not path.exists():
        return {}
    records = json.loads(path.read_text(encoding="utf-8"))
    by_id: dict[str, dict[str, object]] = {}
    for record in records:
        inputs = record.get("input", {})
        lead_id = inputs.get("lead_id") or inputs.get("\ufefflead_id")
        if lead_id:
            by_id[str(lead_id)] = record
    return by_id


normalized = read_csv_by_id(NORMALIZED)
bulk = read_bulk_results(BULK_RESULTS)

missing_reports = [
    lead_id
    for lead_id in normalized
    if not (REPORT_DIR / f"{lead_id}.md").exists()
]
if missing_reports:
    raise SystemExit(
        "Missing deep-research reports: " + ", ".join(missing_reports)
    )

fieldnames = [
    *next(iter(normalized.values())).keys(),
    "bulk_enrichment_evidence",
    "targeted_search_evidence",
    "deep_research_report",
    "extracted_authoritative_evidence",
]

rows: list[dict[str, str]] = []
for lead_id, lead in normalized.items():
    report_path = REPORT_DIR / f"{lead_id}.md"
    rows.append(
        {
            **lead,
            "bulk_enrichment_evidence": json.dumps(
                bulk.get(lead_id, {}),
                ensure_ascii=False,
            )[:12000],
            "targeted_search_evidence": compact_search(
                SEARCH_DIR / f"{lead_id}.json",
                lead["professor_name"],
            ),
            "deep_research_report": report_path.read_text(encoding="utf-8")[:36000],
            "extracted_authoritative_evidence": compact_json(
                EXTRACT_DIR / f"{lead_id}.json",
                24000,
            ),
        }
    )

with TARGET.open("w", encoding="utf-8-sig", newline="") as target_file:
    writer = csv.DictWriter(target_file, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f"Wrote {len(rows)} evidence bundles to {TARGET}")
