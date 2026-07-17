from __future__ import annotations

import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "deep-research-manifest.jsonl"
OUTPUT_DIR = ROOT / "deep-research-results"
OUTPUT_DIR.mkdir(exist_ok=True)

environment = os.environ.copy()
environment["PYTHONUTF8"] = "1"


def completed_payload(path: Path) -> dict[str, object] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    if payload.get("status") != "completed":
        return None
    output = payload.get("output")
    if not isinstance(output, dict) or not isinstance(output.get("content"), dict):
        return None
    return payload


def render_markdown(payload: dict[str, object], output_path: Path) -> None:
    output = payload["output"]
    assert isinstance(output, dict)
    content = output["content"]
    assert isinstance(content, dict)

    headings = {
        "executive_summary": "Executive Summary",
        "identity": "Identity",
        "recent_active_funding_announced_2024_01_01_or_currently_active": (
            "Recent and Active Funding"
        ),
        "recent_and_open_positions_posted_2026_01_01": (
            "Recent and Open Positions"
        ),
        "linkedin_evidence": "LinkedIn Evidence",
        "confidence_and_caveats": "Confidence and Caveats",
        "synthesis": "Synthesis",
    }
    sections = [
        f"# Deep Research Report: {output_path.stem}",
        f"Research run: {payload.get('run_id', '')}",
    ]
    for key, heading in headings.items():
        sections.extend([f"## {heading}", str(content.get(key, ""))])

    citations: dict[str, str] = {}
    basis = output.get("basis", [])
    if isinstance(basis, list):
        for item in basis:
            if not isinstance(item, dict):
                continue
            for citation in item.get("citations", []):
                if not isinstance(citation, dict):
                    continue
                url = str(citation.get("url", "")).strip()
                title = str(citation.get("title", url)).strip()
                if url:
                    citations[url] = title
    sections.append("## Sources")
    sections.extend(f"- [{title}]({url})" for url, title in citations.items())
    output_path.write_text("\n\n".join(sections) + "\n", encoding="utf-8")


def poll_run(record: dict[str, str]) -> tuple[str, int, str]:
    lead_id = record["lead_id"]
    run_id = record["run_id"]
    output_base = OUTPUT_DIR / lead_id
    json_path = output_base.with_suffix(".json")
    markdown_path = output_base.with_suffix(".md")
    combined_output: list[str] = []

    payload = completed_payload(json_path)
    if payload:
        render_markdown(payload, markdown_path)
        return lead_id, 0, "already completed"

    for attempt in range(1, 5):
        command = [
            "parallel-cli",
            "research",
            "poll",
            run_id,
            "-o",
            str(output_base),
            "--timeout",
            "540",
        ]
        completed = subprocess.run(
            command,
            cwd=ROOT,
            env=environment,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=600,
            check=False,
        )
        combined_output.append(
            f"Attempt {attempt}\n{completed.stdout}\n{completed.stderr}".strip()
        )
        payload = completed_payload(json_path)
        if payload:
            render_markdown(payload, markdown_path)
            summary_path = OUTPUT_DIR / f"{lead_id}-executive-summary.txt"
            summary_path.write_text(
                "\n\n".join(combined_output),
                encoding="utf-8",
            )
            return lead_id, 0, f"completed on attempt {attempt}"

    summary_path = OUTPUT_DIR / f"{lead_id}-executive-summary.txt"
    summary_path.write_text("\n\n".join(combined_output), encoding="utf-8")
    return lead_id, 1, "polling did not produce a report after four attempts"


records = [
    json.loads(line)
    for line in MANIFEST.read_text(encoding="utf-8").splitlines()
    if line.strip()
]
started = [record for record in records if record.get("run_id")]

failures: list[str] = []
with ThreadPoolExecutor(max_workers=8) as executor:
    futures = {executor.submit(poll_run, record): record for record in started}
    for index, future in enumerate(as_completed(futures), start=1):
        lead_id, return_code, message = future.result()
        print(
            f"[{index:02d}/{len(started)}] {lead_id}: {message}",
            flush=True,
        )
        if return_code:
            failures.append(lead_id)

if failures:
    print(f"Failed polls: {', '.join(sorted(failures))}")
    raise SystemExit(1)

print(f"Completed deep research for {len(started)} leads.")
