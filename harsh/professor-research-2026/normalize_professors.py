from __future__ import annotations

import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "harsh" / "HarshD_Professors List - Tracker (1).csv"
TARGET = Path(__file__).with_name("normalized-professor-leads.csv")

FIELDS = [
    "lead_id",
    "source_row",
    "lead_type",
    "professor_name",
    "email",
    "university",
    "location",
    "research_group",
    "research_interests",
    "research_theme",
    "accepting_applications_notes",
    "existing_url",
    "existing_status",
    "existing_notes",
]

SPLITS = {
    53: [
        ("Pascale Hennequin", "person"),
        ("Laure Vermare", "person"),
    ],
    54: [
        (
            "Max Planck Institute for Plasma Physics — ITER Technology & Diagnostics",
            "group",
        )
    ],
    55: [
        ("Quentin Nénon", "person"),
        ("Nicolas André", "person"),
        ("IRAP — PEPS space-plasma teams", "group"),
    ],
    56: [
        ("Ivo Classen", "person"),
        ("Marco de Baar", "person"),
    ],
    57: [
        ("KTH Plasma-Wall Interaction / Fusion Research Groups", "group"),
    ],
}


def source_record(row: list[str]) -> dict[str, str]:
    padded = row + [""] * max(0, 19 - len(row))
    return {
        "email": padded[2].strip(),
        "university": padded[3].strip(),
        "location": padded[4].strip(),
        "research_group": padded[5].strip(),
        "research_interests": padded[6].strip(),
        "research_theme": padded[7].strip(),
        "accepting_applications_notes": padded[8].strip(),
        "existing_url": padded[9].strip(),
        "existing_status": padded[10].strip(),
        "existing_notes": padded[15].strip(),
    }


with SOURCE.open(encoding="utf-8-sig", newline="") as source_file:
    source_rows = list(csv.reader(source_file))

normalized: list[dict[str, str]] = []
lead_number = 1

for source_row_number, row in enumerate(source_rows, start=1):
    if source_row_number < 8 or not row or len(row) < 2 or not row[1].strip():
        continue

    identities = SPLITS.get(
        source_row_number,
        [(row[1].strip(), "group" if "Group" in row[1] else "person")],
    )
    shared = source_record(row)

    for name, lead_type in identities:
        normalized.append(
            {
                "lead_id": f"lead-{lead_number:03d}",
                "source_row": str(source_row_number),
                "lead_type": lead_type,
                "professor_name": name,
                **shared,
            }
        )
        lead_number += 1

with TARGET.open("w", encoding="utf-8-sig", newline="") as target_file:
    writer = csv.DictWriter(target_file, fieldnames=FIELDS)
    writer.writeheader()
    writer.writerows(normalized)

print(f"Wrote {len(normalized)} normalized leads to {TARGET}")
