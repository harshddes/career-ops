from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path


WORKSPACE = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).with_name("normalized-professor-leads.csv")
TARGET = Path(__file__).with_name("parallel-enriched-leads.csv")

SOURCE_COLUMNS = [
    {"name": "lead_id", "description": "Stable lead identifier"},
    {"name": "lead_type", "description": "Person or institutional research group"},
    {
        "name": "professor_name",
        "description": "Professor, researcher, or research group name",
    },
    {"name": "email", "description": "Known contact email"},
    {"name": "university", "description": "Known institution or employer"},
    {"name": "research_group", "description": "Known lab or group"},
    {"name": "research_interests", "description": "Known research topics"},
]

INTENT = """
For every row, verify the exact identity and current affiliation; find an official
profile URL; find grants announced on or after 2024-01-01 or currently active
grants, including exact grant title, funder, amount and currency when public,
announcement or award date, project dates, investigator role, purpose, status,
and authoritative source URLs; find currently open PhD, doctoral researcher,
research assistant, research staff, research engineer, or closely related
research openings, plus any such posting published on or after 2026-01-01 even
if closed, with title, type, status, posted date, deadline, location, summary,
official posting URL, and public LinkedIn post URL when available. Prefer
official funder databases, university or lab pages, and official careers
postings. Never infer that grant money funds a PhD unless a source states it.
Use explicit No verified public evidence when nothing reliable is found.
""".strip()

command = [
    "parallel-cli",
    "enrich",
    "run",
    "--source-type",
    "csv",
    "--source",
    str(SOURCE),
    "--target",
    str(TARGET),
    "--source-columns",
    json.dumps(SOURCE_COLUMNS),
    "--intent",
    " ".join(INTENT.split()),
    "--no-wait",
]

environment = os.environ.copy()
environment["PYTHONUTF8"] = "1"

raise SystemExit(
    subprocess.run(
        command,
        cwd=WORKSPACE,
        env=environment,
        check=False,
    ).returncode
)
