from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "evidence-bundles.csv"
TARGET = ROOT / "structured-synthesis.csv"

SOURCE_COLUMNS = [
    {"name": "lead_id", "description": "Stable lead identifier"},
    {"name": "lead_type", "description": "Person or group"},
    {"name": "professor_name", "description": "Lead name"},
    {"name": "email", "description": "Known email"},
    {"name": "university", "description": "Original institution"},
    {"name": "research_group", "description": "Original lab or group"},
    {"name": "research_interests", "description": "Original research topics"},
    {
        "name": "bulk_enrichment_evidence",
        "description": "Parallel bulk web-enrichment evidence",
    },
    {
        "name": "targeted_search_evidence",
        "description": "Parallel targeted search results with URLs and excerpts",
    },
    {
        "name": "deep_research_report",
        "description": "Per-lead Parallel deep-research report with citations",
    },
    {
        "name": "extracted_authoritative_evidence",
        "description": "Full content extracted from selected authoritative sources",
    },
]

ENRICHED_COLUMNS = [
    {
        "name": "identity_status",
        "description": "Verified, Partially verified, Group lead, or Identity unresolved",
    },
    {
        "name": "current_affiliation",
        "description": "Current verified institution and role, concise",
    },
    {
        "name": "official_profile_url",
        "description": "One direct official institutional profile URL, or No verified URL",
    },
    {
        "name": "identity_notes",
        "description": "Short explanation of identity match or ambiguity",
    },
    {
        "name": "research_summary",
        "description": "Two-sentence current research summary based on cited evidence",
    },
    {
        "name": "grant_found",
        "description": "Yes or No verified public evidence; never infer",
    },
    {
        "name": "grant_title",
        "description": "Most relevant recent or active grant title; list additional grants with |",
    },
    {
        "name": "grant_funder",
        "description": "Grant funder matching grant_title; use | for multiple",
    },
    {
        "name": "grant_amount",
        "description": "Exact public amount without currency symbol, or Not publicly stated",
    },
    {
        "name": "grant_currency",
        "description": "ISO currency code, Multiple, or Not publicly stated",
    },
    {
        "name": "grant_award_date",
        "description": "YYYY-MM-DD when known, otherwise YYYY or Not publicly stated",
    },
    {
        "name": "grant_project_period",
        "description": "Start and end dates/years, or Not publicly stated",
    },
    {
        "name": "grant_role",
        "description": "PI, co-PI, investigator, collaborator, group-level, or Not stated",
    },
    {
        "name": "grant_status",
        "description": "Active, Announced, Completed, Mixed, or Unclear as of 2026-07-10",
    },
    {
        "name": "grant_purpose",
        "description": "One or two plain-language sentences on funded work",
    },
    {
        "name": "grant_source_urls",
        "description": "Direct supporting URLs separated by |; no invented URLs",
    },
    {
        "name": "opening_found",
        "description": "Yes, Historical only, or No verified public evidence",
    },
    {
        "name": "opening_title",
        "description": "Best matched role title; use | for multiple",
    },
    {
        "name": "opening_type",
        "description": "PhD, Doctoral researcher, Research assistant, Research staff, Research engineer, Other, or None",
    },
    {
        "name": "opening_status",
        "description": "Open, Closed, Historical, Deadline unclear, or None as of 2026-07-10",
    },
    {
        "name": "opening_posted_date",
        "description": "YYYY-MM-DD, YYYY-MM, YYYY, or Not publicly stated",
    },
    {
        "name": "opening_deadline",
        "description": "YYYY-MM-DD, Open until filled, Deadline unclear, or None",
    },
    {
        "name": "opening_location",
        "description": "Role location, or Not publicly stated",
    },
    {
        "name": "opening_summary",
        "description": "Two-sentence role summary and connection to this lead",
    },
    {
        "name": "opening_official_url",
        "description": "Direct official job/lab/institution posting URL, or No verified URL",
    },
    {
        "name": "opening_linkedin_url",
        "description": "Direct public LinkedIn hiring post URL, or No verified public LinkedIn post",
    },
    {
        "name": "evidence_confidence",
        "description": "High, Medium, or Low",
    },
    {
        "name": "caveats",
        "description": "Important limitations, stale pages, access barriers, or uncertainty",
    },
    {
        "name": "outreach_priority",
        "description": "1-Highest, 2-High, 3-Medium, 4-Low, or 5-Unresolved",
    },
    {
        "name": "priority_reason",
        "description": "One sentence: open role first, then active funding, then historical signal",
    },
    {
        "name": "all_source_urls",
        "description": "Deduplicated direct URLs supporting the row, separated by |",
    },
    {
        "name": "checked_date",
        "description": "Always 2026-07-10",
    },
]

environment = os.environ.copy()
environment["PYTHONUTF8"] = "1"

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
    "--enriched-columns",
    json.dumps(ENRICHED_COLUMNS),
    "--processor",
    "pro-fast",
    "--no-wait",
]

raise SystemExit(
    subprocess.run(
        command,
        cwd=ROOT,
        env=environment,
        check=False,
    ).returncode
)
