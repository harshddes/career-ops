from __future__ import annotations

import csv
import json
import os
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
LEADS_FILE = ROOT / "normalized-professor-leads.csv"
REPORT_DIR = ROOT / "deep-research-results"
OUTPUT_DIR = ROOT / "extracted-sources"
OUTPUT_DIR.mkdir(exist_ok=True)

URL_PATTERN = re.compile(r"https?://[^\s<>\]\)\"']+")
BLOCKED_DOMAINS = {
    "google.com",
    "www.google.com",
    "bing.com",
    "www.bing.com",
    "platform.parallel.ai",
}
PREFERRED_DOMAIN_MARKERS = (
    ".edu",
    ".gov",
    ".ac.",
    "cnrs.fr",
    "polytechnique.fr",
    "ucl.ac.uk",
    "colorado.edu",
    "uiowa.edu",
    "unh.edu",
    "asu.edu",
    "princeton.edu",
    "pppl.gov",
    "berkeley.edu",
    "swri.org",
    "jhuapl.edu",
    "umich.edu",
    "epfl.ch",
    "unibe.ch",
    "psi.ch",
    "ipp.mpg.de",
    "differ.nl",
    "tue.nl",
    "kth.se",
    "irap.omp.eu",
    "cordis.europa.eu",
    "ec.europa.eu",
    "euraxess.ec.europa.eu",
    "snf.ch",
    "anr.fr",
    "ukri.org",
    "linkedin.com",
)
PATH_MARKERS = (
    "grant",
    "award",
    "fund",
    "project",
    "job",
    "career",
    "vacan",
    "position",
    "phd",
    "doctoral",
    "people",
    "profile",
    "research",
    "lab",
)

environment = os.environ.copy()
environment["PYTHONUTF8"] = "1"


def clean_url(raw_url: str) -> str:
    return raw_url.rstrip(".,;:")


def score_url(url: str) -> int:
    parsed = urlparse(url)
    domain = parsed.netloc.lower()
    searchable = f"{domain}{parsed.path}".lower()
    if domain in BLOCKED_DOMAINS:
        return -100

    score = 0
    if any(marker in domain for marker in PREFERRED_DOMAIN_MARKERS):
        score += 8
    if any(marker in searchable for marker in PATH_MARKERS):
        score += 4
    if "linkedin.com/posts" in searchable:
        score += 3
    if any(noise in searchable for noise in ("glassdoor", "tracxn", "indeed")):
        score -= 8
    return score


def choose_urls(report_text: str) -> list[str]:
    unique_urls = list(dict.fromkeys(clean_url(url) for url in URL_PATTERN.findall(report_text)))
    ranked = sorted(unique_urls, key=lambda url: (-score_url(url), unique_urls.index(url)))
    preferred = [url for url in ranked if score_url(url) > 0]
    return (preferred or ranked)[:6]


def extract_lead(lead: dict[str, str]) -> tuple[str, int, str]:
    lead_id = lead["lead_id"]
    report_path = REPORT_DIR / f"{lead_id}.md"
    if not report_path.exists():
        return lead_id, 2, "deep-research report missing"

    urls = choose_urls(report_path.read_text(encoding="utf-8"))
    selection_path = OUTPUT_DIR / f"{lead_id}-selected-urls.json"
    selection_path.write_text(
        json.dumps(urls, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    if not urls:
        return lead_id, 0, "no source URLs in report"

    command = [
        "parallel-cli",
        "extract",
        *urls,
        "--objective",
        (
            f"Verify grant, funding, identity, and PhD or research job evidence "
            f"for {lead['professor_name']} at {lead['university']}. Preserve exact "
            "amounts, dates, investigator roles, job deadlines, status, and direct links."
        ),
        "--full-content",
        "--full-content-max-chars",
        "12000",
        "--excerpt-max-chars-total",
        "30000",
        "--json",
        "-o",
        str(OUTPUT_DIR / f"{lead_id}.json"),
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


with LEADS_FILE.open(encoding="utf-8-sig", newline="") as leads_file:
    leads = list(csv.DictReader(leads_file))

failures: list[str] = []
with ThreadPoolExecutor(max_workers=6) as executor:
    futures = {executor.submit(extract_lead, lead): lead for lead in leads}
    for index, future in enumerate(as_completed(futures), start=1):
        lead_id, return_code, message = future.result()
        print(f"[{index:02d}/{len(leads)}] {lead_id}: exit {return_code}", flush=True)
        if return_code:
            failures.append(f"{lead_id}: {message}")

if failures:
    print("\nFailures:")
    print("\n".join(failures))
    raise SystemExit(1)

print(f"Completed authoritative-source extraction for {len(leads)} leads.")
