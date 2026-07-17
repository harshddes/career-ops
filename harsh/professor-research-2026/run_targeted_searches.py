from __future__ import annotations

import csv
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "normalized-professor-leads.csv"
OUTPUT_DIR = ROOT / "search-results"
OUTPUT_DIR.mkdir(exist_ok=True)

environment = os.environ.copy()
environment["PYTHONUTF8"] = "1"


def search_lead(lead: dict[str, str]) -> tuple[str, int, str]:
    lead_id = lead["lead_id"]
    name = lead["professor_name"]
    institution = lead["university"]
    research = lead["research_interests"]
    output = OUTPUT_DIR / f"{lead_id}.json"

    objective = (
        f"Verify {name} at {institution}. Find authoritative evidence of grants "
        "announced since 2024-01-01 or grants currently active, with exact title, "
        "funder, amount, date, project period, investigator role, and source. Find "
        "currently open PhD, doctoral researcher, research assistant, research "
        "staff, or research engineer positions, plus postings published since "
        "2026-01-01 even if now closed. Find public LinkedIn hiring posts and the "
        "matching official posting. Research context: "
        f"{research}. Do not confuse people with similar names."
    )
    queries = [
        f'"{name}" "{institution}" grant award funding 2024 2025 2026',
        f'"{name}" PhD position research assistant research staff hiring 2026',
        f'site:linkedin.com/posts "{name}" (PhD OR hiring OR position)',
        f'"{name}" lab openings vacancies students',
    ]
    command = [
        "parallel-cli",
        "search",
        objective,
        *[item for query in queries for item in ("-q", query)],
        "--after-date",
        "2024-01-01",
        "--json",
        "--max-results",
        "20",
        "--excerpt-max-chars-total",
        "27000",
        "-o",
        str(output),
    ]
    completed = subprocess.run(
        command,
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        timeout=360,
        check=False,
    )
    message = (completed.stdout + completed.stderr).strip()
    return lead_id, completed.returncode, message


with SOURCE.open(encoding="utf-8-sig", newline="") as source_file:
    leads = list(csv.DictReader(source_file))

failures: list[str] = []
with ThreadPoolExecutor(max_workers=6) as executor:
    futures = {executor.submit(search_lead, lead): lead for lead in leads}
    for index, future in enumerate(as_completed(futures), start=1):
        lead_id, return_code, message = future.result()
        print(f"[{index:02d}/{len(leads)}] {lead_id}: exit {return_code}", flush=True)
        if return_code:
            failures.append(f"{lead_id}: {message}")

if failures:
    print("\nFailures:")
    print("\n".join(failures))
    raise SystemExit(1)

print(f"Completed targeted searches for {len(leads)} leads.")
