# Mode: pdf -- ATS-Optimized PDF Generation

## Full Pipeline

1. Read `cv.md` as the single source of truth for all content
2. The JD must be in context (text or URL). If not, ask for it
3. Extract 15-20 keywords from the JD
4. Detect JD language (EN default)
5. Detect company location for paper format:
   - US/Canada -> `letter`
   - Rest of world -> `a4`
6. Detect role archetype -> adapt framing per `modes/_profile.md`
7. Rewrite Professional Summary:
   - Inject top 5 JD keywords naturally
   - Open with exit narrative bridge from `config/profile.yml` (e.g. "Mechanical engineering foundation moved into space systems and plasma diagnostics instrumentation at Michigan.")
   - End with portfolio URL inline (e.g. "Portfolio: harshddes.github.io")
8. Select top 3-4 most relevant projects for this specific role
9. Reorder experience bullets by relevance to JD (most relevant role first)
10. Build competency grid from JD requirements (6-8 keyword phrases as tags)
11. Inject JD keywords naturally into existing achievements (NEVER invent skills or experience)
12. Generate HTML using `templates/cv-template.html` (single ATS shell: dense Pranos/Fusion-style layout, Space Grotesk + DM Sans, `.tag` competency pills, `Selected Projects`, two-column Skills grid — match reference `output/cv-harsh-desai-pranos-fusion-instrumentation-engineer-2026-05-06.html`).
13. Read `name` from `config/profile.yml` -> normalize to kebab-case lowercase -> `{candidate}`
14. Write HTML to `output/cv-{candidate}-{company}-{YYYY-MM-DD}.html`
15. Run: `node generate-pdf.mjs output/cv-{candidate}-{company}-{YYYY-MM-DD}.html output/cv-{candidate}-{company}-{YYYY-MM-DD}.pdf --format={letter|a4}`
16. **DYNAMIC 1-PAGE CHECK (MANDATORY):** After generating, check page count. If >1 page, apply trim loop:
    a. Remove the lowest-relevance work experience entry (furthest from JD match)
    b. If still >1, condense the lowest-relevance project description
    c. If still >1, reduce body font-size by 0.3px and line-height by 0.05
    d. Regenerate and re-check. Repeat until exactly 1 page.
    e. NEVER go below 8.5px body font or 1.25 line-height -- if still >1 page at that floor, remove another low-relevance entry
17. If pages == 1 and significant whitespace remains at bottom (>15% of page blank), add content back:
    a. Add next-most-relevant experience entry or project from `cv.md`
    b. Expand bullet detail from `cv.md` source text (use full original wording, not condensed)
    c. Regenerate and re-check stays at 1 page
18. Report: PDF path, page count, file size
19. **ATS TEXT EXTRACTION VERIFY (MANDATORY):** After final PDF is confirmed at 1 page:
    a. Open the PDF in Playwright (`browser_navigate` to `file://` path)
    b. Select all text on the page (`Ctrl+A` or equivalent) and extract it
    c. Check that ALL section headers are present in extracted text: "Professional Summary", "Core Competencies", "Work Experience", "Selected Projects", "Education", "Skills", "Honors"
    d. Check that candidate name, email, and phone are extractable
    e. If any section is missing or text is garbled, flag the PDF as ATS-unsafe and investigate (likely a font embedding or layout issue)
    f. Report: "ATS text extraction: PASS (all 7 sections detected)" or "ATS text extraction: FAIL (missing: [list])"
20. **(OPTIONAL) External ATS score check:** User can request `ats-check` to upload the PDF to resumeatschecker.com or atsresumeschecker.com via browser automation and retrieve the score. This is not run automatically.

## Local Format Smoke Test

For non-JD sample generation from `cv.md` only (same HTML shell as job-tailored output):

```bash
node generate-cv.mjs --output=output/cv-harsh-desai-ats.html --pdf=output/cv-harsh-desai-ats.pdf --paper=letter
```

This renders the full Markdown CV into `templates/cv-template.html`; it is not JD-trimmed, so PDF page count may exceed one until the tailoring loop runs.

## STRICT 1-PAGE RULE

Every generated PDF MUST be exactly 1 page. No exceptions. The dynamic check in steps 16-17 enforces this. The goal is to MAXIMIZE content density within the 1-page constraint -- fill the page, don't leave it half empty.

## ATS Rules (clean parsing)

- Single primary column narrative (no side-by-side Experience columns); a two-column **Skills** subsection using CSS Grid is permitted for ATS output when using `templates/cv-template.html`.
- Standard section headers: "Professional Summary", "Work Experience", "Education", "Skills", "Selected Projects", "Honors"
- No text in images/SVGs
- No critical info in PDF headers/footers (ATS ignores them)
- UTF-8, selectable text (not rasterized)
- No nested tables
- JD keywords distributed: Summary (top 5), first bullet of each role, Skills section

## Design Spec

Concrete typography and spacing live in **`templates/cv-template.html`** (dense, Pranos-aligned one-page sizing). Values below summarize intent during tailoring iterations:
- **Fonts**: Space Grotesk (headings, 600-700) + DM Sans (body, 400-500)
- **Fonts self-hosted**: `fonts/`
- **Fallback font stacks (MANDATORY for ATS safety):** Body CSS must use `font-family: 'DM Sans', Calibri, Arial, sans-serif;` and headings must use `font-family: 'Space Grotesk', Calibri, Arial, sans-serif;` so that ATS parsers that ignore embedded web fonts still extract clean text via system fonts.
- **Header**: Name in Space Grotesk 22px bold + gradient line `linear-gradient(to right, hsl(187,74%,32%), hsl(270,70%,45%))` 2px + contact row
- **Section headers**: Space Grotesk 10px, uppercase, letter-spacing 0.06em, color cyan `hsl(187,74%,32%)`
- **Body**: DM Sans 9.2px, line-height 1.35 (calibrated for 1-page fit with full content)
- **Company names**: accent purple `hsl(270,70%,45%)`
- **Section margins**: 5px bottom
- **Job margins**: 4px bottom
- **Background**: pure white

These sizes are calibrated so that a full CV with 4-5 experience entries, 3 projects, education, skills, and honors fits exactly 1 page on US Letter. If content volume changes significantly, the dynamic check loop adjusts.

## Section Order (optimized for 6-second recruiter scan)

1. Header (name, gradient, contact row with portfolio link)
2. Professional Summary (3-4 lines, keyword-dense, exit narrative bridge, portfolio URL)
3. Core Competencies (6-9 keyword phrases in flex-grid tags)
4. Work Experience (reordered by JD relevance, not strictly chronological)
5. Selected Projects (top 3-4 most relevant)
6. Education
7. Skills
8. Honors

## Abbreviation and Naming Rules (CRITICAL)

### Abbreviations
- On first use of any non-obvious abbreviation, write the full form followed by the abbreviation in parentheses. All subsequent uses can use the abbreviation alone.
- **Obvious abbreviations that do NOT need expansion:** FPGA, PID, NASA, AAS, GPS, CFD, CAE, RF, DAQ, DMA, MHD, ADC, HV, CAD, ATS, TVAC, GPA, LED, USB, API, SDK, SQL
- **Abbreviations that MUST be expanded on first use:**
  - SA Cup -> Spaceport America Cup (SA Cup)
  - IREC -> Intercollegiate Rocket Engineering Competition (IREC)
  - SPRL -> Space Physics Research Lab (SPRL)
  - SHRG -> Solar and Heliospheric Research Group (SHRG)
  - SRAD -> Student Researched and Developed (SRAD)
  - FSW -> Flight Software (FSW)
  - CCMC -> Community Coordinated Modeling Center (CCMC)
  - SWMF -> Space Weather Modeling Framework (SWMF)
  - MAGE -> Multiscale Atmosphere-Geospace Environment (MAGE)
  - CEM -> Channel Electron Multiplier (CEM)
  - ESA -> Electrostatic Analyzer (ESA)
  - CSA -> charge-sensitive amplifier (CSA)
  - MCA -> multichannel analyzer (MCA)
  - FoM -> figure of merit (FoM)
  - FWHM -> full width at half maximum (FWHM)
  - TOF -> time-of-flight (TOF)
  - SSD -> Solid-State Detector (SSD)
  - UOP -> Uranian Orbiter and Probe (UOP)
  - DFM/DFA -> Design for Manufacturing/Assembly (DFM/DFA)
  - AI&T -> Assembly, Integration, and Test (AI&T)
  - V&V -> Verification and Validation (V&V)
- When in doubt, expand it. Better to over-expand than leave a recruiter confused.

### Institution and Organization Names
- ALWAYS use the full official name on first mention. Never use only an acronym for a university or organization:
  - VIT -> Vellore Institute of Technology (VIT)
  - CANSAT -> use "CANSAT" (it is the established competition name, not an abbreviation)
- For well-known organizations where the acronym IS the brand (NASA, AAS, IEEE), the acronym alone is fine.

### Person Names
- ALWAYS use full names for advisors and collaborators. Never "Prof. Battel" or "Dr. Leon" alone:
  - "Advisor: Dr. Omar Leon" (full first + last)
  - "Advisor: Prof. Steven Battel" (full first + last)
  - "Advisor: Prof. Stefano Livi" (full first + last)
  - "Advisor: Prof. Cheng Li" (full first + last)
  - "Advisor: Mojtaba Akhavan-Tafti" (full first + last)

### Honors Section Rules
- Do NOT just list a rank/achievement. Always include what was technically built or demonstrated:
  - BAD: "CANSAT 2022 (NASA & AAS) -- 7th worldwide out of 42 teams."
  - GOOD: "CANSAT 2022 (NASA & AAS) -- Engineered a 10 m tether-deployment mechanism with DC motor worm-gear spool and dual-servo 2-axis gimbal for camera stabilization; ranked 7th worldwide out of 42 teams."
  - BAD: "Special Achievers Award (VIT)"
  - GOOD: "Special Achievers Award, Vellore Institute of Technology (2019-22) -- Recognized for international competition representation including rocketry and satellite design."
- Keep each honor entry to 1-2 lines. Be technical but concise.

## Keyword Injection Strategy (ethical, truth-based)

Examples of legitimate reformulation:
- JD says "instrument operations" and CV says "test rig characterization" -> use "instrument operations and test rig characterization"
- JD says "ground support equipment" and CV says "environmental test facilitator" -> use "ground support equipment development and environmental test facilitation"
- JD says "anomaly detection" and CV says "root cause analysis" -> use "anomaly detection and root cause analysis"

**NEVER add skills the candidate does not have. Only reformulate real experience using the exact vocabulary of the JD.**

## Content Sourcing Rules

- ALL content must come from `cv.md`. Do not invent bullets, metrics, or experiences.
- Use the FULL original bullet text from `cv.md` as the starting point. Condense only if needed for 1-page fit (step 16), and even then prefer removing a low-relevance entry over butchering a high-relevance bullet.
- When rewriting bullets for JD alignment, the factual content must remain identical. Only the framing/vocabulary changes.

## Professional Writing Rules

(Inherited from `modes/_shared.md` -- these apply to all candidate-facing text)

- Native tech English. Short sentences, action verbs, no passive voice.
- Case study URLs in Professional Summary body (recruiter may only read the top third).
- Avoid cliches: "passionate about", "results-oriented", "proven track record", "leveraged", "spearheaded", "facilitated", "synergies", "robust", "seamless", "cutting-edge", "innovative"
- Vary sentence structure. Don't start every bullet with the same verb.
- Prefer specifics over abstractions. Name tools, name projects, name outcomes.

## Template HTML

Use `templates/cv-template.html` as the ATS shell — this is aligned with curated one-page emits (dense typography, `.tag` competency pills, `Selected Projects`, two-column `Skills`). Reference snapshot: `output/cv-harsh-desai-pranos-fusion-instrumentation-engineer-2026-05-06.html`. Do not resurrect parallel HTML/CSS variants (`cv-harsh-desai-ats-one-page-*`, bespoke `fonts/*.ttf` under `output/`, etc.). Job-tailoring loops adjust **copy** inside this shell; typography stays here.

When authoring HTML from scratch in this mode (without `generate-cv.mjs`), fill the placeholders below.


Placeholder reference:

| Placeholder | Content |
|---|---|
| `{{LANG}}` | `en` (or JD language) |
| `{{PAGE_WIDTH}}` | `7.25in` (Letter) / `7.2in` (A4) |
| `{{NAME}}` | from `config/profile.yml` |
| `{{PHONE}}` | from `config/profile.yml` |
| `{{EMAIL}}` | from `config/profile.yml` |
| `{{LOCATION}}` | city/region line (ATS plain text — no URL) |
| `{{LINKEDIN_DISPLAY}}` | host + path text (e.g. `linkedin.com/in/...`), not a clickable row of links unless required |
| `{{PORTFOLIO_LINE}}` | e.g. `Portfolio: harshddes.github.io` |
| `{{SECTION_SUMMARY}}` … | section titles (`Professional Summary`, `Core Competencies`, … `Honors`) |
| `{{SUMMARY_TEXT}}` | JD-tailored summary paragraph |
| `{{COMPETENCIES}}` | repeated `<span class="tag">…</span>` |
| `{{EXPERIENCE}}` | stacked `.item` blocks with bullets |
| `{{PROJECTS}}` | same structure for selected projects |
| `{{EDUCATION}}` | `.item` blocks + `<p>` for coursework narratives |
| `{{SKILLS}}` | two-column `.skills-grid` |
| `{{CERTIFICATIONS}}` | `Honors`: `<ul class="compact-list">…</ul>` |

**Deprecated:** Separate “wide” ATS markup (old `.job-header` layout, gigantic header, or unrelated CSS in one-off outputs). Treat anything not matching `templates/cv-template.html` as stale.

## Canva CV Generation (optional)

If `config/profile.yml` has `cv.canva_resume_design_id` set, offer the user a choice before generating:
- **"HTML/PDF (fast, ATS-optimized)"** — existing flow above
- **"Canva CV (visual, design-preserving)"** — new flow below

If the user has no `cv.canva_resume_design_id`, skip this prompt and use the HTML/PDF flow. If a legacy top-level `canva_resume_design_id` is present, treat it as equivalent and recommend moving it under `cv.` later.

### Canva workflow

#### Step 1 — Duplicate the base design

a. `export-design` the base design (using `cv.canva_resume_design_id`) as PDF → get download URL
b. `import-design-from-url` using that download URL → creates a new editable design (the duplicate)
c. Note the new `design_id` for the duplicate

#### Step 2 -- Read the design structure
a. `get-design-content` on the new design -> returns all text elements with their content
b. Map text elements to CV sections by content matching
c. If mapping fails, show the user what was found and ask for guidance

#### Step 3 -- Generate tailored content
Same content generation as the HTML flow (Steps 1-11 above):
- Rewrite Professional Summary with JD keywords + exit narrative
- Reorder experience bullets by JD relevance
- Select top competencies from JD requirements
- Inject keywords naturally (NEVER invent)
- Apply ALL abbreviation, naming, and honors rules from this file

**Character budget rule:** Each replacement text MUST be approximately the same length as the original (within +/-15% character count). Canva text boxes are fixed-size.

#### Step 4 -- Apply edits
a. `start-editing-transaction` on the duplicate design
b. `perform-editing-operations` with `find_and_replace_text` for each section
c. Reflow layout after text replacement (adjust element positions for even spacing)
d. Verify layout before commit via `get-design-thumbnail`
e. Show user the final preview and ask for approval
f. `commit-editing-transaction` to save (ONLY after user approval)

#### Step 5 -- Export and download PDF
a. `export-design` the duplicate as PDF
b. Download immediately (pre-signed URL expires in ~2 hours)
c. Verify download: `file output/cv-{candidate}-{company}-canva-{YYYY-MM-DD}.pdf` must show "PDF document"
d. Report: PDF path, file size, Canva design URL

#### Error handling
- If `import-design-from-url` fails -> fall back to HTML/PDF pipeline
- If text elements can't be mapped -> warn user, ask for manual mapping
- Always provide the Canva design URL for manual tweaking

## Post-generation

Update tracker if the offer is already registered: change PDF from X to checkmark.
