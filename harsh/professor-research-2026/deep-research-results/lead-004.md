# Deep Research Report: lead-004

Research run: trun_dd47611047ba4519a5b69aff57be2939

## Executive Summary

- **Identity confirmed across four authoritative UNH channels**: UNH FindScholars ([executive_summary[0]] [32]), NH Space Grant Director page ([executive_summary[1]] [11]), UNH EOS Space Science Center ([executive_summary[2]] [3]), and Google Scholar ([executive_summary[3]] [10]) all report her as Research Professor, Space Science Center, Institute for Earth Oceans and Space. Email `toni.galvin@unh.edu` is shown on the official UNH FindScholars profile.
- **LinkedIn identity match disambiguated**: the LinkedIn profile `linkedin.com/in/antoinette-galvin-b0446091` lists `Research Professor at University of New Hampshire` in `Durham, New Hampshire, United States`, matching lead-004 exactly. Three other Antoinette Galvin profiles exist (one in Ireland, one misspelling "Hamphsire" in Hampton NH, one semi-retired in Ireland); none are the target.
- **NSF simple-search returns 7 hits for "Galvin Antoinette" in the active-funding scope**: the public NSF Award Search interface returns "Search Results (7)" at `nsf.gov/awardsearch/simpleSearchResult?queryText=Galvin+Antoinette&ActiveAwards=true`, but per-row extraction returned no award-level details because the rendered table content did not materialise in the scrape. This is recorded as nominal NSF presence requiring manual confirmation against `nsf.gov/awardsearch/showAward?AWD_ID=...` detail pages.
- **No public NASA/NIH/DOE specific award record for Galvin since 2024 located**: NASA TechPort and `science.nasa.gov` searches surfaced mission pages (IMAP, Solar Orbiter SWA) but no UNH-PI-level award doc. Searched with multiple phrasings; this should be re-verified against NASA NSPIRES and via `tracxn` for full coverage.
- **No verified public evidence of PhD/RA/postdoc openings tied to Galvin as of mid-2026**: searched the official UNH EOS Opportunities page (`eos.unh.edu/opportunities`), the SSC Student Opportunities page (`eos.unh.edu/space-science-center/student-opportunities`), the USNH job portal, and LinkedIn. Generic "Space Science Center" positions appear only on third-party aggregators (Indeed; Indeed reviews, not postings).
- **Activity type confirmation by instrumentation footprint**: her Google Scholar profile lists PI/co-PI roles on PLASTIC (STEREO), CELIAS (SOHO), SWICS (Ulysses), SWA (Solar Orbiter), and IMAP-related work; her NH Space Grant bio lists nine spacecraft. These imply funded missions, but mission budget vs. competitive grant delineation is not always publicly available at PI resolution.

## Identity

**Antoinette B. ("Toni") Galvin** - Research Professor, Space Science Center (SSC), Institute for the Study of Earth, Oceans, and Space (EOS), Department of Physics, University of New Hampshire (UNH); concurrently Director of the New Hampshire Space Grant Consortium (NHSGC).

| Field | Value | Source |
|---|---|---|
| Full name | Antoinette B. Galvin | UNH FindScholars profile |
| Preferred name | Toni Galvin | NH Space Grant Director page |
| Title | Research Professor, Space Science Center | UNH FindScholars, EOS directory |
| Secondary title | Director, NH Space Grant Consortium | nhsgc.unh.edu Director page |
| Email | toni.galvin@unh.edu | findscholars.unh.edu/display/agalvin |
| Institution | University of New Hampshire (Durham, NH) | nhsgc.unh.edu, eos.unh.edu |
| Group | Space Science Center (EOS) | eos.unh.edu/space-science-center |
| PhD | 1982, University of Maryland | nhsgc.unh.edu Director bio |
| Undergraduate | Purdue University | nhsgc.unh.edu Director bio |

**Research interests (verbatim from NH Space Grant bio)**: solar energetic particles and solar wind composition, charge states and relative abundances during coronal-hole, interstream, and coronal-mass-ejection flows; implications for coronal temperature gradients and elemental vs. photospheric abundances; isotopic abundances via SOHO results ([identity[0]] [11]).

**Instrumentation / mission activity**: PLASTIC (STEREO), CELIAS (SOHO), SWICS (Ulysses), Wind, ACE/SEPICA, ISEE-1 and ISEE-3/ICE; Solar Orbiter SWA composition sub-suite; IMAP-related. Listed on Google Scholar as canonical research lines ([identity[1]] [10]).

**Namesake disambiguation**: "Antoinette Galvin" returns at least three other LinkedIn profiles in the vespa `mixrank_linkedin_people` index - in Ireland (twice), and a Hampton, NH profile that misspells the employer as "University of New Hamphsire". Only `linkedin.com/in/antoinette-galvin-b0446091` (Research Professor @ UNH, Durham, NH) matches lead-004.

## Recent and Active Funding



## Recent and Open Positions



## LinkedIn Evidence

| Field | Value |
|---|---|
| Profile URL (matches lead-004) | linkedin.com/in/antoinette-galvin-b0446091 |
| Name | Antoinette Galvin |
| Headline | "Research Professor at University of New Hampshire" |
| Title | Research Professor |
| Company | University of New Hampshire |
| Locality | Durham, New Hampshire, United States |
| Source | vespa_query against mixrank_linkedin_people (LinkedIn) |
| Disambiguation | 3 namesake profiles (Ireland x2; Hampton, NH misspelling) explicitly excluded |

| Namesake profile | URL | Why not lead-004 |
|---|---|---|
| Antoinette Galvin (Ireland) | linkedin.com/in/antoinette-galvin-81a26620 | Country = Ireland, no UNH/SSC |
| Antoinette Galvin (Hampton, NH) | linkedin.com/in/antoinette-galvin-945aa7347 | Misspells UNH as "Hamphsire", not Research Professor |
| Antoinette Galvin (Ireland, semiretired) | linkedin.com/in/antoinette-galvin-2958504b | Country = Ireland, retired, Valhalla/Kenmare |

**No LinkedIn posts for any Antoinette Galvin profile were extracted in this run.** LinkedIn posts are gated behind auth and the vespa schema does not index public posts. If a recent post exists advertising a PhD opening or award, it would have to be located via Google `site:linkedin.com "Galvin" "University of New Hampshire"` and direct extract - a re-attempt is required to fill the LinkedIn Evidence cell.

## Confidence and Caveats

| Section | Confidence | Reason |
|---|---|---|
| Identity | High | Cross-confirmed across 4 UNH channels (FindScholars, NH Space Grant, EOS, Google Scholar) + LinkedIn match |
| LinkedIn profile match | High | Direct vespa hit; same name + Research Professor + UNH + Durham, NH |
| Funding (NSF, since 2024) | Nominal-but-partial | NSF simple search shows "Search Results (7)" but per-row award detail blocked by render |
| Funding (NASA/non-NSF) | Low | Only mission-level public records; no UNH-PI dollar line surfaced |
| Open Positions (since 2026-01-01) | None | USNH job portal not deeply scraped; only generic pages returned |
| Closed Historical Positions | None | Same; no archive scrape conducted |
| LinkedIn posts | None | Not extracted in this run |

**Specific things that should be re-checked before actioning lead-004:**

1. Manually open each of the 7 nominal NSF rows in the [confidence_and_caveats[0]] [42] and copy Award Number -> run `nsf.gov/awardsearch/showAward?AWD_ID=XXXX`. Confirm date >= 2024-01-01 and amount.
2. Search NSPIRES (NASA) with PI = Galvin, Antoinette B.; organization = University of New Hampshire.
3. Open `linkedin.com/in/antoinette-galvin-b0446091` directly and inspect activity/posts; if a posting points to any URL, record both LinkedIn URL and the official destination URL.
4. Pull `jobs.usnh.edu` filtered to Space Science Center / SSC since 2026-01-01.
5. Check the EOS Opportunities index for any new hires or graduate research position announcements 2025-2026 (`eos.unh.edu/opportunities`).
6. If a $4M+ UNH NASA mission sub-award (Solar Orbiter SWA, IMAP-Lo, STEREO/PLASTIC extend) is the candidate, those are tied to NASA mission budgets, not competitive grants - flag explicitly in the final report.

## Synthesis



## Sources

- [Galvin, Antoinette](https://findscholars.unh.edu/display/agalvin)

- [NHSGC Director Toni Galvin](https://www.nhsgc.unh.edu/about/galvin.shtml)

- [Space Science Center](https://eos.unh.edu/space-science-center)

- [Antoinette Galvin](https://scholar.google.com/citations?hl=en&user=8lF5AWwAAAAJ)

- [UNH Receives $8M NSF Grant to Advance New Hampshire's ...](https://www.unh.edu/unhtoday/news/release/2024/05/14/unh-receives-8m-nsf-grant-advance-new-hampshires-science-and-technology)

- [Search Results - NSF Award Search](https://www.nsf.gov/awardsearch/simpleSearchResult?queryText=Galvin+Antoinette&ActiveAwards=true)
