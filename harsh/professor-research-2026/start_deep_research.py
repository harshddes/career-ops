from __future__ import annotations

import csv
import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "normalized-professor-leads.csv"
RUN_DIR = ROOT / "deep-research-runs"
RUN_DIR.mkdir(exist_ok=True)
MANIFEST = ROOT / "deep-research-manifest.jsonl"

environment = os.environ.copy()
environment["PYTHONUTF8"] = "1"


def start_research(lead: dict[str, str]) -> dict[str, str]:
    lead_id = lead["lead_id"]
    name = lead["professor_name"]
    institution = lead["university"]
    prompt = f"""
Conduct extensive, source-cited research about this exact academic lead:
- Lead ID: {lead_id}
- Name or group: {name}
- Type: {lead["lead_type"]}
- Known institution: {institution}
- Known email: {lead["email"]}
- Known group: {lead["research_group"]}
- Research topics: {lead["research_interests"]}

First verify the identity and current affiliation; do not merge namesakes.

Funding scope:
- Find grants announced on or after 2024-01-01 and any grants still active now.
- Record exact grant title, funder, public amount and currency, award or
  announcement date, project dates, current status, this person's role
  (PI/co-PI/collaborator/etc.), what the funded work does, and direct source URLs.
- Prefer official funder award databases and official institutional announcements.
- Distinguish a competitive grant from a prize, consortium funding, institutional
  funding, or a mission budget. Do not claim funds are available for a PhD unless
  a source explicitly connects the funding to hiring or doctoral support.

Hiring scope:
- Find currently open PhD/doctoral researcher, research assistant, research staff,
  research engineer, or closely related research openings connected to this person
  or group.
- Also capture such postings published on or after 2026-01-01 that have closed,
  clearly marking them Closed/Historical.
- Record title, type, status, posted date, deadline, location, short description,
  direct official posting URL, and public LinkedIn post URL if one exists.
- Search public LinkedIn results/posts as discovery evidence, but corroborate with
  an official lab, university, institute, EURAXESS, or careers page when possible.

Return a concise structured report with: Identity; Recent/Active Funding; Recent
and Open Positions; LinkedIn Evidence; Confidence and Caveats; Sources. Every
positive claim must carry a direct URL. Explicitly say "No verified public evidence
found" where appropriate and explain what was checked.
""".strip()
    command = [
        "parallel-cli",
        "research",
        "run",
        " ".join(prompt.split()),
        "--processor",
        "pro-fast",
        "--no-wait",
        "--json",
    ]
    completed = subprocess.run(
        command,
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    raw_output = (completed.stdout + completed.stderr).strip()
    run_file = RUN_DIR / f"{lead_id}-run.json"
    run_file.write_text(raw_output, encoding="utf-8")

    if completed.returncode:
        return {
            "lead_id": lead_id,
            "name": name,
            "status": "launch_failed",
            "run_id": "",
            "monitor_url": "",
            "error": raw_output,
        }

    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        payload = {}

    run_id = str(
        payload.get("run_id")
        or payload.get("id")
        or payload.get("research_id")
        or ""
    )
    monitor_url = str(
        payload.get("monitor_url")
        or payload.get("url")
        or payload.get("monitoring_url")
        or ""
    )
    return {
        "lead_id": lead_id,
        "name": name,
        "status": "started" if run_id else "unparsed",
        "run_id": run_id,
        "monitor_url": monitor_url,
        "error": "" if run_id else raw_output,
    }


with SOURCE.open(encoding="utf-8-sig", newline="") as source_file:
    leads = list(csv.DictReader(source_file))

records: list[dict[str, str]] = []
with ThreadPoolExecutor(max_workers=4) as executor:
    futures = {executor.submit(start_research, lead): lead for lead in leads}
    for index, future in enumerate(as_completed(futures), start=1):
        record = future.result()
        records.append(record)
        print(
            f"[{index:02d}/{len(leads)}] {record['lead_id']}: {record['status']}",
            flush=True,
        )

records.sort(key=lambda item: item["lead_id"])
with MANIFEST.open("w", encoding="utf-8", newline="\n") as manifest_file:
    for record in records:
        manifest_file.write(json.dumps(record, ensure_ascii=False) + "\n")

failed = [record for record in records if record["status"] != "started"]
print(f"Started {len(records) - len(failed)} of {len(records)} deep-research runs.")
if failed:
    raise SystemExit(1)
