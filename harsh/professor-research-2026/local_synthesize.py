from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
LEADS = ROOT / "normalized-professor-leads.csv"
BULK_RESULTS = ROOT / "bulk-enrichment-results.json"
REPORT_DIR = ROOT / "deep-research-results"
TARGET = ROOT / "structured-synthesis.csv"

FUNDING_KEY = "recent_active_funding_announced_2024_01_01_or_currently_active"
POSITIONS_KEY = "recent_and_open_positions_posted_2026_01_01"
URL_PATTERN = re.compile(r"https?://[^\s<>\]\)\"']+")
AMOUNT_PATTERN = re.compile(
    r"(?:(USD|EUR|CHF|GBP)\s*)?([$€£])?\s*"
    r"(\d[\d,.]*(?:\s*(?:million|billion|M|B))?)",
    re.IGNORECASE,
)

OUTPUT_FIELDS = [
    "lead_id",
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

VERIFIED_OVERRIDES: dict[str, dict[str, str]] = {
    "lead-010": {
        "opening_found": "Historical only",
        "opening_title": "Research Fellow in Heliospheric Physics (2 posts)",
        "opening_type": "Research Fellow / Postdoctoral",
        "opening_status": "Closed",
        "opening_posted_date": "2026-03-31",
        "opening_deadline": "2026-04-24",
        "opening_location": "UCL MSSL, Holmbury St Mary, Surrey, UK",
        "opening_summary": (
            "Two UCL MSSL research-fellow posts in heliospheric physics were "
            "advertised in Daniel Verscharen's research area. The deadline "
            "passed on 2026-04-24, so this is a recent hiring signal, not a "
            "current vacancy."
        ),
        "opening_official_url": (
            "https://www.ucl.ac.uk/work-at-ucl/search-ucl-jobs/details?"
            "nPostingId=17698&nPostingTargetId=42838&id="
            "Q1KFK026203F3VBQBLO8M8M07&LG=UK&languageSelect=UK&mask=ext"
        ),
    },
    "lead-017": {
        "opening_found": "No verified public evidence",
        "opening_title": "No verified 2026 opening",
        "opening_type": "None",
        "opening_status": "None",
        "opening_posted_date": "Not publicly stated",
        "opening_deadline": "None",
        "opening_location": "Not publicly stated",
        "opening_summary": (
            "No currently open or 2026-published role naming Hantao Ji as "
            "supervisor was verified. The Ji-linked Princeton postdoc found "
            "in research was posted before the 2026 window and is closed."
        ),
        "opening_official_url": "No verified URL",
    },
    "lead-024": {
        "opening_found": "Yes — rolling lab recruitment",
        "opening_title": "Prospective PhD, postdoctoral, and visiting researchers",
        "opening_type": "PhD / Postdoctoral / Visiting researcher",
        "opening_status": "Open",
        "opening_posted_date": "Not publicly stated",
        "opening_deadline": "Rolling / contact principal investigator",
        "opening_location": "Ann Arbor, Michigan, USA",
        "opening_summary": (
            "The Pratt Lab states that it is looking for prospective "
            "researchers at all levels and directs PhD, postdoctoral, and "
            "visiting candidates to contact Kerri Pratt with a CV and letter "
            "of interest. This is an active recruiting statement rather than "
            "a dated job requisition."
        ),
        "opening_official_url": "https://sites.lsa.umich.edu/prattlab/members/",
        "outreach_priority": "1-Highest",
        "priority_reason": (
            "The professor's current lab page explicitly invites prospective "
            "PhD and postdoctoral researchers to make contact."
        ),
    },
    "lead-028": {
        "grant_found": "No verified public evidence",
        "grant_title": "No verified personal competitive grant",
        "grant_funder": "Not publicly stated",
        "grant_amount": "Not publicly stated",
        "grant_currency": "Not publicly stated",
        "grant_award_date": "Not publicly stated",
        "grant_project_period": "Not publicly stated",
        "grant_role": "Not stated",
        "grant_status": "No verified public evidence",
        "opening_found": "Yes — department-level; supervisor unverified",
        "opening_title": "Postdoctoral Researcher — Heliophysics",
        "opening_type": "Postdoctoral",
        "opening_status": "Open",
        "opening_posted_date": "2026-03-23",
        "opening_deadline": "Not publicly stated",
        "opening_location": "Boulder, Colorado, USA",
        "opening_summary": (
            "A live SwRI postdoc covers PUNCH and Parker Solar Probe analysis. "
            "Mihir Desai directs SwRI's Department of Space Research and is a "
            "Parker Solar Probe co-investigator, but the posting does not name "
            "him as the direct supervisor."
        ),
        "opening_official_url": (
            "https://resapp.swri.org/ResApp/Job_Details.aspx?JOB_CD=19-00187"
        ),
        "evidence_confidence": "Medium",
        "outreach_priority": "2-High",
        "priority_reason": (
            "A current role is closely aligned with his department and mission "
            "work, but direct supervision is not publicly confirmed."
        ),
    },
    "lead-038": {
        "grant_found": "No verified public evidence",
        "grant_title": "No verified grant",
        "grant_funder": "Not publicly stated",
        "grant_amount": "Not publicly stated",
        "grant_currency": "Not publicly stated",
        "grant_award_date": "Not publicly stated",
        "grant_project_period": "Not publicly stated",
        "grant_role": "Not stated",
        "grant_status": "No verified public evidence",
        "opening_found": "No verified public evidence",
        "opening_title": "No Cohen-attributable opening",
        "opening_type": "None",
        "opening_status": "None",
        "opening_posted_date": "Not publicly stated",
        "opening_deadline": "None",
        "opening_location": "Not publicly stated",
        "opening_summary": (
            "The live PPPL AMSS postdoc found in the search concerns diamond "
            "color centers and microelectronics and is explicitly unrelated "
            "to Samuel Cohen's plasma research."
        ),
        "opening_official_url": "No verified URL",
        "outreach_priority": "4-Low",
        "priority_reason": (
            "No recent personal grant or directly connected opening was "
            "verified publicly."
        ),
    },
    "lead-044": {
        "opening_found": "Yes — group-level",
        "opening_title": (
            "Postdoc — Apophis Reference Model for ESA RAMSES mission"
        ),
        "opening_type": "Postdoctoral",
        "opening_status": "Open",
        "opening_posted_date": "2026",
        "opening_deadline": "2026-07-31",
        "opening_location": "Bern, Switzerland",
        "opening_summary": (
            "The University of Bern WP division and Astronomical Institute "
            "are recruiting a fully funded postdoc for the SNSF-backed "
            "Apophis/RAMSES project. Applications after July 31 may still be "
            "considered depending on availability."
        ),
        "opening_official_url": (
            "https://jobs.unibe.ch/job-vacancies/postdoc-position-space-"
            "research-and-planetary-sciences-astronomical-institute/"
            "4b1cf432-2b32-475d-a8f5-77360b278f2e"
        ),
        "evidence_confidence": "High",
        "outreach_priority": "1-Highest",
        "priority_reason": (
            "The retained group lead has a current, fully funded official "
            "postdoctoral vacancy."
        ),
    },
    "lead-052": {
        "opening_found": "Historical only",
        "opening_title": "PhD Position in Fusion Exhaust Plasma Diagnostics",
        "opening_type": "PhD / Doctoral researcher",
        "opening_status": "Closed",
        "opening_posted_date": "2026-05-12",
        "opening_deadline": "Not publicly stated",
        "opening_location": "Eindhoven, Netherlands",
        "opening_summary": (
            "A 2026 PhD posting named Ivo Classen as main supervisor. It is no "
            "longer present on DIFFER's current vacancies page, so it is "
            "recorded as a recent closed hiring signal."
        ),
        "opening_official_url": (
            "https://www.academicjobs.com/university-jobs/phd-position-in-the-"
            "field-of-fusion-exhaust-plasma-diagnostics-eindhoven-noord-"
            "brabant/664854"
        ),
        "evidence_confidence": "Medium",
        "outreach_priority": "3-Medium",
        "priority_reason": (
            "A directly supervised 2026 PhD posting was found, but it is no "
            "longer listed as a current DIFFER vacancy."
        ),
    },
    "lead-055": {
        "grant_found": "Yes",
        "grant_title": (
            "Plasma detachment in tokamaks: from the physics fundamentals to "
            "real-time control in reactor-relevant scenarios"
        ),
        "grant_funder": "Swiss National Science Foundation (SNSF)",
        "grant_amount": "810378",
        "grant_currency": "CHF",
        "grant_award_date": "2024-04-01",
        "grant_project_period": "2024-04-01 to 2028-03-31",
        "grant_role": "Principal investigator",
        "grant_status": "Active",
        "grant_purpose": (
            "The active SNSF project funds tokamak plasma-detachment physics "
            "and real-time control for reactor-relevant conditions."
        ),
        "grant_source_urls": "https://data.snf.ch/grants?q=Paolo+Ricci",
        "opening_found": "Yes",
        "opening_title": (
            "PhD — Simulation of the plasma dynamics at the tokamak edge"
        ),
        "opening_type": "PhD / Doctoral researcher",
        "opening_status": "Open",
        "opening_posted_date": "Not publicly stated",
        "opening_deadline": "Open year-round",
        "opening_location": "Lausanne, Switzerland",
        "opening_summary": (
            "EPFL SPC seeks PhD students throughout the year and names Prof. "
            "Paolo Ricci as contact for this tokamak-edge simulation project."
        ),
        "opening_official_url": (
            "https://www.epfl.ch/research/domains/swiss-plasma-center/"
            "education/education_doctoralschool/phdpositions"
        ),
        "evidence_confidence": "High",
        "outreach_priority": "1-Highest",
        "priority_reason": (
            "A directly named year-round PhD opening and an active personal "
            "SNSF grant are both verified on official sources."
        ),
    },
    "lead-062": {
        "grant_found": "No verified public evidence",
        "grant_title": "No verified personal competitive grant",
        "grant_funder": "Not publicly stated",
        "grant_amount": "Not publicly stated",
        "grant_currency": "Not publicly stated",
        "grant_award_date": "Not publicly stated",
        "grant_project_period": "Not publicly stated",
        "grant_role": "Not stated",
        "grant_status": "No verified public evidence",
        "opening_found": "Yes",
        "opening_title": (
            "Postdoctoral Researcher — JT-60SA diagnostic development and "
            "turbulence/transport studies"
        ),
        "opening_type": "Postdoctoral",
        "opening_status": "Open",
        "opening_posted_date": "2025-03-19",
        "opening_deadline": "Not publicly stated; earliest possible start",
        "opening_location": "Lausanne, Switzerland; extended work in Japan",
        "opening_summary": (
            "The current official EPFL SPC page seeks an EU or Swiss national "
            "for JT-60SA diagnostic development and names Dr. Stefano Coda as "
            "the contact."
        ),
        "opening_official_url": (
            "https://www.epfl.ch/research/domains/swiss-plasma-center/"
            "education/postdoc-positions/available-post-doctoral-positions"
        ),
        "opening_linkedin_url": "No verified public LinkedIn post",
        "evidence_confidence": "High",
        "outreach_priority": "1-Highest",
        "priority_reason": (
            "A live official postdoctoral vacancy directly names Stefano Coda "
            "as the contact."
        ),
    },
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as source_file:
        return list(csv.DictReader(source_file))


def bulk_by_id() -> dict[str, dict[str, Any]]:
    records = json.loads(BULK_RESULTS.read_text(encoding="utf-8"))
    result: dict[str, dict[str, Any]] = {}
    for record in records:
        inputs = record.get("input", {})
        lead_id = inputs.get("lead_id") or inputs.get("\ufefflead_id")
        if lead_id:
            result[str(lead_id)] = record.get("output", {})
    return result


def clean_markdown(text: str, limit: int = 1200) -> str:
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"\[[^\]]+\]\s*\[\d+\]", "", text)
    text = text.replace("**", "").replace("`", "")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit].rstrip()


def parse_tables(text: str) -> list[list[dict[str, str]]]:
    lines = text.splitlines()
    tables: list[list[dict[str, str]]] = []
    index = 0
    while index + 1 < len(lines):
        if not lines[index].strip().startswith("|"):
            index += 1
            continue
        header = [cell.strip() for cell in lines[index].strip().strip("|").split("|")]
        separator = lines[index + 1].replace("|", "").replace("-", "").replace(":", "").strip()
        if separator:
            index += 1
            continue
        index += 2
        rows: list[dict[str, str]] = []
        while index < len(lines) and lines[index].strip().startswith("|"):
            cells = [cell.strip() for cell in lines[index].strip().strip("|").split("|")]
            if len(cells) == len(header):
                rows.append(dict(zip(header, cells)))
            index += 1
        if rows:
            tables.append(rows)
    return tables


def field_value(row: dict[str, str], markers: tuple[str, ...]) -> str:
    for key, value in row.items():
        if any(marker in key.casefold() for marker in markers):
            return value.strip()
    return ""


def useful_row(row: dict[str, str]) -> bool:
    values = " ".join(row.values()).casefold()
    negative_markers = (
        "no verified",
        "no open",
        "none found",
        "not found",
        "no matching",
    )
    return (
        not all(token.casefold() in {"", "n/a", "none", "not found"} for token in row.values())
        and not any(marker in values for marker in negative_markers)
    )


def choose_table_row(text: str, kind: str) -> dict[str, str]:
    candidates: list[dict[str, str]] = []
    for table in parse_tables(text):
        headers = " ".join(table[0].keys()).casefold()
        if kind == "funding" and not any(
            marker in headers for marker in ("grant", "funder", "amount", "award")
        ):
            continue
        if kind == "opening" and not any(
            marker in headers for marker in ("title", "position", "status", "deadline")
        ):
            continue
        candidates.extend(row for row in table if useful_row(row))
    if kind == "opening":
        for row in candidates:
            status = field_value(row, ("status",))
            if status.casefold() == "open":
                return row
    return candidates[0] if candidates else {}


def citations(
    payload: dict[str, Any],
    field_markers: tuple[str, ...] = (),
) -> list[str]:
    urls: list[str] = []
    for item in payload.get("output", {}).get("basis", []):
        field_name = str(item.get("field", "")).casefold()
        if field_markers and not any(
            marker in field_name for marker in field_markers
        ):
            continue
        for citation in item.get("citations", []):
            url = str(citation.get("url", "")).strip()
            if url and url not in urls:
                urls.append(url)
    return urls


def first_url(urls: list[str], markers: tuple[str, ...] = ()) -> str:
    if markers:
        for url in urls:
            if any(marker in url.casefold() for marker in markers):
                return url
    return urls[0] if urls else ""


def identify_amount(text: str) -> tuple[str, str]:
    for match in AMOUNT_PATTERN.finditer(text):
        code, symbol, amount = match.groups()
        if not code and not symbol:
            continue
        currency = code.upper() if code else {"$": "USD", "€": "EUR", "£": "GBP"}.get(symbol, "")
        return amount, currency
    return "Not publicly stated", "Not publicly stated"


def find_date(text: str) -> str:
    match = re.search(r"\b(20(?:2[4-9]|3\d)(?:-\d{2}(?:-\d{2})?)?)\b", text)
    return match.group(1) if match else "Not publicly stated"


def identity_affiliation(identity_text: str, original: dict[str, str]) -> str:
    for table in parse_tables(identity_text):
        values: dict[str, str] = {}
        for row in table:
            label = field_value(row, ("field", "item", "attribute")).casefold()
            value = field_value(row, ("value", "finding"))
            if label and value:
                values[label] = clean_markdown(value, 240)
        institution = next(
            (value for key, value in values.items() if "institution" in key),
            "",
        )
        role = next(
            (value for key, value in values.items() if "role" in key or "title" in key),
            "",
        )
        if institution or role:
            return " — ".join(part for part in (role, institution) if part)
    return " — ".join(
        part for part in (original["research_group"], original["university"]) if part
    )


def grant_status(funding_text: str, found: bool) -> str:
    if not found:
        return "No verified public evidence"
    lower = funding_text.casefold()
    if "currently active" in lower or "active grant" in lower:
        return "Active"
    if "announced" in lower or "award" in lower:
        return "Announced or active"
    return "Unclear"


def opening_state(
    positions_text: str,
    opening_row: dict[str, str],
) -> tuple[str, str]:
    row_status = field_value(opening_row, ("status",))
    if row_status:
        normalized = row_status.casefold()
        if normalized == "open" or "currently open" in normalized:
            return "Yes", "Open"
        if "closed" in normalized or "historical" in normalized:
            return "Historical only", "Closed"

    lower = positions_text.casefold()
    positive_open = any(
        phrase in lower
        for phrase in (
            "confirmed open",
            "open hiring as of",
            "currently open:",
            "currently open position",
            "open positions (active hiring)",
        )
    )
    negative_open = any(
        phrase in lower
        for phrase in (
            "no verified open",
            "no currently open",
            "no open position",
            "no publicly listed",
            "not directly to",
            "not attributable",
        )
    )
    if positive_open and not negative_open:
        return "Yes", "Open"
    positive_closed = any(
        phrase in lower
        for phrase in (
            "posting is closed",
            "position is closed",
            "closed position",
            "historical posting",
            "closed/historical posting",
        )
    )
    if positive_closed and "no verified" not in lower:
        return "Historical only", "Historical"
    return "No verified public evidence", "None"


def inferred_opening_title(text: str) -> str:
    patterns = (
        r'PhD thesis titled\s+"([^"]+)"',
        r'advertises\s+"([^"]+)"',
        r'"(POSTDOCTORAL RESEARCHER[^"]+)"',
        r"\*\*Open[^*]*\*\*:\s*([^.\n]+)",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return clean_markdown(match.group(1), 500)
    return ""


leads = read_csv(LEADS)
bulk = bulk_by_id()
synthesis_rows: list[dict[str, str]] = []

for lead in leads:
    lead_id = lead["lead_id"]
    payload = json.loads((REPORT_DIR / f"{lead_id}.json").read_text(encoding="utf-8"))
    content = payload["output"]["content"]
    identity_text = str(content.get("identity", ""))
    funding_text = str(content.get(FUNDING_KEY, ""))
    positions_text = str(content.get(POSITIONS_KEY, ""))
    linkedin_text = str(content.get("linkedin_evidence", ""))
    caveats_text = str(content.get("confidence_and_caveats", ""))
    executive_text = str(content.get("executive_summary", ""))
    synthesis_text = str(content.get("synthesis", ""))
    bulk_output = bulk.get(lead_id, {})

    funding_evidence = funding_text or f"{executive_text}\n{synthesis_text}"
    positions_evidence = positions_text or f"{executive_text}\n{synthesis_text}"
    funding_row = choose_table_row(funding_evidence, "funding")
    opening_row = choose_table_row(positions_evidence, "opening")
    bulk_grants = list(bulk_output.get("grants", []))
    bulk_openings = list(bulk_output.get("research_openings", []))

    funding_lower = funding_evidence.casefold()
    negative_funding = any(
        phrase in funding_lower
        for phrase in (
            "no verified public evidence",
            "no competitive grant",
            "no verified competitive grant",
            "no public grant",
        )
    )
    grant_found = bool(funding_row) or (bool(bulk_grants) and not negative_funding)

    grant_title = field_value(funding_row, ("grant title", "title", "project"))
    if not grant_title and grant_found and bulk_grants:
        grant_title = clean_markdown(str(bulk_grants[0]), 320)
    grant_title = grant_title or "No verified grant"

    grant_funder = field_value(funding_row, ("funder", "agency", "sponsor"))
    if not grant_funder and grant_found:
        known_funders = re.findall(
            r"\b(NASA|NSF|DOE|ERC|SNSF|ANR|CNES|ESA|EUROfusion|Horizon Europe|UKRI|EPSRC)\b",
            f"{grant_title} {funding_evidence}",
            re.IGNORECASE,
        )
        grant_funder = " | ".join(dict.fromkeys(item.upper() for item in known_funders[:3]))
    grant_funder = grant_funder or "Not publicly stated"

    amount_source = field_value(funding_row, ("amount", "value", "funding")) or grant_title
    grant_amount, grant_currency = identify_amount(amount_source)
    grant_award_date = field_value(funding_row, ("award date", "date", "announced"))
    grant_award_date = find_date(grant_award_date or grant_title)
    grant_period = field_value(
        funding_row,
        ("project dates", "period", "duration", "start", "end"),
    ) or "Not publicly stated"
    grant_role = field_value(funding_row, ("role", "investigator"))
    if not grant_role and grant_found:
        role_match = re.search(
            r"\b(PI|co-PI|Co-I|principal investigator|investigator|collaborator)\b",
            f"{grant_title} {funding_evidence[:1200]}",
            re.IGNORECASE,
        )
        grant_role = role_match.group(1) if role_match else "Not stated"
    grant_role = grant_role or "Not stated"

    opening_found, opening_status = opening_state(
        positions_evidence,
        opening_row,
    )
    opening_title = field_value(opening_row, ("title", "position", "role"))
    if not opening_title and opening_status == "Open":
        opening_title = inferred_opening_title(positions_evidence)
    if not opening_title and bulk_openings:
        opening_title = clean_markdown(str(bulk_openings[0]), 320)
    opening_title = opening_title or "No verified opening"
    opening_type = field_value(opening_row, ("type", "category")) or (
        "Research position" if opening_found == "Yes" else "None"
    )
    opening_posted = field_value(opening_row, ("posted", "date"))
    opening_deadline = field_value(opening_row, ("deadline", "closing"))
    opening_location = field_value(opening_row, ("location", "place"))

    funding_urls = citations(payload, (FUNDING_KEY,))
    position_urls = citations(payload, (POSITIONS_KEY,))
    identity_urls = citations(payload, ("identity",))
    linkedin_urls = [
        url
        for url in citations(payload, ("linkedin",))
        if "linkedin.com" in url.casefold()
    ]
    all_urls = citations(payload)
    if not funding_urls and grant_found:
        funding_urls = all_urls[:6]
    if not position_urls and opening_found != "No verified public evidence":
        position_urls = all_urls

    official_profile = str(bulk_output.get("official_profile_url", "")).strip()
    if not official_profile:
        official_profile = first_url(
            identity_urls,
            ("people", "person", "profile", "researchportal"),
        )
    official_profile = official_profile or "No verified URL"

    unresolved = (
        "unresolved" in identity_text.casefold()
        or lead["professor_name"].casefold() == "prof. leone"
    )
    identity_status = (
        "Identity unresolved"
        if unresolved
        else ("Group lead" if lead["lead_type"] == "group" else "Verified")
    )

    direct_opening_url = field_value(
        opening_row,
        ("official posting url", "official url", "posting url", "url"),
    )
    if not direct_opening_url:
        direct_opening_url = first_url(
            position_urls,
            ("job", "career", "vacan", "position", "phd", "doctoral"),
        )
    linkedin_url = first_url(linkedin_urls, ("/posts/", "/feed/update/"))

    confidence_values = [
        str(item.get("confidence", "")).casefold()
        for item in payload["output"].get("basis", [])
    ]
    evidence_confidence = (
        "High"
        if confidence_values.count("high") >= 3 and not unresolved
        else ("Low" if unresolved else "Medium")
    )

    if unresolved:
        priority = "5-Unresolved"
        reason = "Identity could not be safely matched to one current academic."
    elif opening_status == "Open":
        if "not directly" in positions_text.casefold():
            priority = "2-High"
            reason = "A related open role exists, but direct supervision is not verified."
        else:
            priority = "1-Highest"
            reason = "A currently open research role is supported by public evidence."
    elif grant_found:
        priority = "2-High"
        reason = "Recent or active funding is verified, but no direct open role was confirmed."
    elif opening_found == "Historical only":
        priority = "3-Medium"
        reason = "Recent hiring activity exists, but the located role is no longer open."
    else:
        priority = "4-Low"
        reason = "No recent grant or directly connected opening was verified publicly."

    synthesis_row = {
        "lead_id": lead_id,
        "identity_status": identity_status,
        "current_affiliation": identity_affiliation(identity_text, lead),
        "official_profile_url": official_profile,
        "identity_notes": clean_markdown(identity_text, 700),
        "research_summary": (
            f"{lead['professor_name']} is associated with "
            f"{lead['research_group'] or lead['university']}. "
            f"Research focus: {lead['research_interests']}."
        ),
        "grant_found": "Yes" if grant_found else "No verified public evidence",
        "grant_title": clean_markdown(grant_title, 500),
        "grant_funder": grant_funder,
        "grant_amount": grant_amount,
        "grant_currency": grant_currency,
        "grant_award_date": grant_award_date,
        "grant_project_period": clean_markdown(grant_period, 200),
        "grant_role": grant_role,
        "grant_status": grant_status(funding_evidence, grant_found),
        "grant_purpose": clean_markdown(funding_evidence, 1600),
        "grant_source_urls": " | ".join(funding_urls),
        "opening_found": opening_found,
        "opening_title": clean_markdown(opening_title, 500),
        "opening_type": opening_type,
        "opening_status": opening_status,
        "opening_posted_date": opening_posted or "Not publicly stated",
        "opening_deadline": opening_deadline or (
            "Deadline unclear"
            if opening_found != "No verified public evidence"
            else "None"
        ),
        "opening_location": opening_location or (
            lead["location"] if opening_status == "Open" else "Not publicly stated"
        ),
        "opening_summary": clean_markdown(positions_evidence, 1600),
        "opening_official_url": direct_opening_url or "No verified URL",
        "opening_linkedin_url": (
            linkedin_url or "No verified public LinkedIn post"
        ),
        "evidence_confidence": evidence_confidence,
        "caveats": clean_markdown(caveats_text, 1000),
        "outreach_priority": priority,
        "priority_reason": reason,
        "all_source_urls": " | ".join(all_urls),
        "checked_date": "2026-07-10",
    }
    synthesis_row.update(VERIFIED_OVERRIDES.get(lead_id, {}))
    if not synthesis_row["official_profile_url"].startswith(
        ("https://", "http://")
    ):
        synthesis_row["official_profile_url"] = "No verified URL"

    row_urls = [
        url.strip()
        for url in synthesis_row["all_source_urls"].split(" | ")
        if url.strip().startswith(("https://", "http://"))
    ]
    for field in (
        "official_profile_url",
        "grant_source_urls",
        "opening_official_url",
        "opening_linkedin_url",
    ):
        for url in synthesis_row[field].split(" | "):
            url = url.strip()
            if url.startswith(("https://", "http://")) and url not in row_urls:
                row_urls.append(url)
    synthesis_row["all_source_urls"] = " | ".join(row_urls)
    synthesis_rows.append(synthesis_row)

with TARGET.open("w", encoding="utf-8-sig", newline="") as target_file:
    writer = csv.DictWriter(target_file, fieldnames=OUTPUT_FIELDS)
    writer.writeheader()
    writer.writerows(synthesis_rows)

print(f"Wrote local structured synthesis for {len(synthesis_rows)} leads to {TARGET}")
