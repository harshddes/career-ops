# Mode: pdf -- LaTeX ATS-Optimized Resume Generation

This mode generates role-targeted resumes as LaTeX first. The HTML resume pipeline is deprecated for resumes and should only be used as an explicit fallback. Cover letters still use the HTML -> PDF path documented in `modes/application-artifacts.md`.

## Resume Format Inputs

New tailored resumes are LaTeX-first. Format guidance comes from this priority order:

1. A user-provided or user-approved LaTeX sample, if one exists.
2. Files in `harsh/`, if present and the user wants to use them as personal style references.
3. The generic template `templates/cv-template.tex`.
4. Ask the user for a preferred format if no usable LaTeX reference exists.

Current optional personal style reference:

- Source: `harsh/Harsh_Desai_Resume_OnePage_AlignedFullSkills_A4.tex`
- Reference PDF: `harsh/Harsh_Desai_Resume_OnePage_AlignedFullSkills_A4.pdf`

The `harsh/` files are user-layer personal artifacts. They may be changed or deleted by the user. Never treat them as required workflow dependencies or factual sources. `cv.md` controls facts.

When `harsh/Harsh_Desai_Resume_OnePage_AlignedFullSkills_A4.tex` is present and selected as the style reference, follow its LaTeX script exactly:

- Preserve the same document class, geometry, font, color palette, macros, spacing commands, section order, heading style, bullet style, and compact one-page layout.
- Preserve the same baseline content structure unless the role genuinely requires adding a more relevant older experience or project.
- Tailoring means reordering sections/bullets for first-glance relevance, adding a compact role-specific summary when useful, and changing wording only where it improves role fit without changing the fact.
- Do not delete roles, projects, or leadership sections merely because a role is specific. Replace content only when the replacement is more relevant and the one-page format requires a tradeoff.
- If a tradeoff is needed, prefer swapping the least relevant item for a more relevant item from `cv.md`; report the swap clearly.

## Full Pipeline

1. Read `cv.md` as the single source of truth for resume content.
2. Read `config/profile.yml`, `modes/_profile.md`, and `article-digest.md` when available.
3. The JD must be in context as text, URL, saved report, or saved job entry. If not, ask for it.
4. Extract 15-20 keywords from the JD.
5. Detect JD language. English is the default unless the JD is clearly in another language.
6. Detect company location and choose paper target:
   - US/Canada -> `letter`, 1 page, no photo, no personal details beyond contact/work authorization when relevant.
   - Europe/India/global industry -> `a4`, 1 page by default; 2 pages only when the role is research-heavy and the user explicitly wants that variant.
   - Academic/PhD/research CV -> `a4`, 2+ pages allowed when requested.
7. Detect role archetype and adapt framing per `modes/_profile.md`.
8. Decide whether a short profile is needed:
   - Skip the summary/profile for direct-fit technical roles when the top third already sells the identity.
   - Add a compact profile only when it solves a pivot problem, especially fusion, nuclear, plasma, or non-space instrumentation roles.
   - If used, keep it factual and technical. Example: "Space systems engineer focused on plasma diagnostics instrumentation, HV-safe test workflows, DAQ automation, detector readout, and calibration-heavy experimental systems."
9. Reorder skills groups to match the JD. Do not invent skills.
10. Keep the same baseline content set from the selected LaTeX reference when possible. Do not cut projects or roles just because only 2-4 items are highly relevant.
11. Reorder experience bullets by relevance to the JD. The first bullet under each entry should carry the strongest role match.
12. Rewrite bullets only by reframing real experience. Preserve factual content, metrics, tools, dates, and ownership boundaries.
13. Generate a tailored `.tex` file by copying the chosen LaTeX reference structure first, then editing content inside that structure. Do not invent a new layout. If `harsh/` is missing, use `templates/cv-template.tex` or ask for a replacement style.
14. Read candidate name from `config/profile.yml`, normalize to kebab-case lowercase, and use it as `{candidate}`.
15. Write LaTeX to `output/{company-slug}/cv-{candidate}-{company-role}-{YYYY-MM-DD}.tex`. **Company-specific resumes always go in the company subfolder** (`{company-slug}` = kebab-case company name; create the folder if missing; reuse it for all future roles at the same company). See `.cursor/rules/output-company-folders.mdc`.
16. Compile with:

```bash
node generate-latex.mjs output/{company-slug}/cv-{candidate}-{company-role}-{YYYY-MM-DD}.tex output/{company-slug}/cv-{candidate}-{company-role}-{YYYY-MM-DD}.pdf --engine=xelatex
```

17. **Dynamic one-page check (mandatory for one-page variants):** If the generated PDF is more than 1 page, apply the trim loop:
    a. First tighten wording while preserving the same sections and baseline content.
    b. Reorder bullets so the most relevant evidence appears first.
    c. Remove or shorten a role-specific summary before removing factual experience.
    d. Reduce LaTeX body font size by 0.2pt and line height proportionally only after content tightening.
    e. Only if the resume still does not fit, swap or remove the least relevant item and report exactly what changed.
    f. Regenerate and re-check. Repeat until exactly 1 page.
    g. Do not go below 8.8pt body text for one-page technical resumes.
18. If the PDF is 1 page and has more than 15% blank space, add back the next-most-relevant bullet or project from `cv.md`.
19. Report: `.tex` path, PDF path, page count, file size, compiler engine, and any trimming decisions.
20. **ATS text extraction verify (mandatory):**
    a. Extract or copy PDF text.
    b. Confirm that candidate name, email, location, and expected section headers are present.
    c. Confirm the text order is sane: header -> education -> technical skills -> research/engineering experience -> selected technical projects -> projects/leadership or honors.
    d. If text is garbled or missing sections, flag the PDF as ATS-unsafe and fix the LaTeX before using it.
21. **Optional external ATS score check:** The user can request `ats-check` to upload the PDF to an ATS checker. Do not run this automatically.

## Local Format Smoke Test

If the optional `harsh/` sample exists, compile it as a local smoke test:

```bash
node generate-latex.mjs harsh/Harsh_Desai_Resume_OnePage_AlignedFullSkills_A4.tex output/cv-harsh-desai-latex-smoke.pdf --engine=xelatex
```

Use this only to verify local LaTeX tooling and the sample format. It is not JD-tailored. If the file is absent, skip this smoke test and compile the generated `.tex` instead.

## Strict Page Rules

- US/Canada technical resume: Letter, 1 page, no photo.
- Global/EU technical resume: A4, 1 page by default.
- EU research/PhD CV: A4, 2+ pages only when the role requires research depth and the user requests it.
- Swiss/German-style CV: A4. Photo is not obligatory; do not add one unless the user requests a local-norm variant.

For one-page variants, maximize relevant density without turning the document into a compressed legal contract. Trim low-signal content before shrinking typography.

## Five-Second Test

Every one-page technical resume must make these signals visible in the first fast scan:

- Harsh Desai.
- University of Michigan, Space Systems Engineering.
- Technical skills: HV, DAQ, Python/PyVISA, detector readout, FPGA, calibration.
- SPRL/LVACCS: 1300 V hollow-cathode plasma-source workflow.
- SHRG/Space 571: detector readout and calibration.

If a recruiter cannot see the target identity in five seconds, the resume failed even if the content is accurate.

## Role-Specific Targeting

### Fusion / Nuclear / Instrumentation

Story: "I have worked on high-voltage-safe plasma-source test workflows, DAQ synchronization, detector calibration, and readout-chain reasoning. I am pivoting from space plasma instrumentation into ground/fusion/nuclear experimental instrumentation."

Lead with:
- HV-safe test workflows.
- Plasma-source operations.
- DAQ synchronization and logging.
- Detector/readout chains.
- Calibration, uncertainty, and signal quality.

Usually select:
1. Space Instrumentation Calibration & Ion-Optics Series.
2. SHRG Solid-State Detector readout chain.
3. SPRL LVACCS.
4. CANSAT only when leadership/hardware proof is useful.

### Space / Aerospace Systems

Story: "I have space systems training, spacecraft charging/plasma test rig work, mission architecture, qualification workflow tooling, and student flight hardware background."

Lead with:
- Space systems engineering.
- Requirements traceability.
- Mission architecture.
- Environmental test workflows.
- Space plasma instrumentation.

Usually select:
1. SPRL LVACCS.
2. L3Harris Uranian Orbiter and Probe.
3. CANSAT / Spaceport America Cup.
4. Space 571 when instrumentation-heavy.

### FPGA / Detector Readout

Story: "I have detector readout architecture exposure, ADC sampling upgrade reasoning, Zynq/Vivado/HDL workflow, and timing analysis."

Lead with:
- Zynq-7000 / ADC pathway.
- AMD Vivado and MATLAB HDL Coder.
- Sampling-rate and energy-resolution reasoning.
- RTL timing analysis.
- Detector signal-chain quality.

Usually select:
1. SHRG Solid-State Detector readout chain.
2. Space Instrumentation Calibration & Ion-Optics Series.
3. SPRL DAQ automation.
4. CANSAT telemetry only if needed.

### Simulation-Heavy Roles

Story: "I can run physics models and interpret diagnostics, but my stronger market identity is experimental instrumentation plus computational support."

Lead with modeling only when the JD is truly simulation-heavy. Otherwise keep simulation as support for instrumentation decisions.

## Skills Section Rules

Keep skills near the top for technical roles. Reorder groups by role; do not move them to the bottom.

Use grouped lines like:

- **Instrumentation & DAQ:** HV test automation, Python/PyVISA, DAQ synchronization, Keithley DAQs/SMUs, TDK Lambda PSUs, GPIB/IEEE-488, USB-serial logging, CEM/ESA calibration, detector readout.
- **FPGA & Signal Chain:** Zynq-7000, Zmod ADC 1410, AMD Vivado, MATLAB HDL Coder, RTL timing analysis, ADC sampling tradeoffs, Verilog/VHDL fundamentals.
- **Simulation & Modeling:** SIMION, SRIM, SWMF/HYPERS, Great Lakes HPC, ANSYS Fluent, MATLAB, spacecraft/plasma instrumentation workflows.
- **Mechanical/Space Systems:** SolidWorks, Fusion 360, SpaceClaim, OpenFOAM, RocketPy, OpenRocket, mission architecture, requirements traceability.

For each application, reorder groups. Fusion role -> Instrumentation & DAQ first. Aerospace systems role -> Mechanical/Space Systems and requirements higher. FPGA role -> FPGA & Signal Chain first.

## Bullet Formula

Prefer:

```text
Built/validated/analyzed X using Y to improve/measure Z, quantified by N.
```

A strong bullet names the mechanism or system, the tool/method/workflow, and the measured result or engineering consequence. Do not let bullets become autobiography. The resume is a targeting instrument.

## Project Selection And Trimming

Use 2-4 projects max for one-page resumes.

Trim in this order when space is tight:
1. Interests.
2. Summary/profile unless it is doing real pivot work.
3. Oldest or least relevant project.
4. Low-relevance academic modeling project.
5. Second bullet under older roles.
6. Coursework/supervisor lines if not needed.
7. Awards without technical substance.

Do not cut role-critical evidence:
- SPRL LVACCS first bullet for instrumentation/fusion roles.
- SHRG Solid-State Detector readout bullets for electronics/instrumentation roles.
- Space 571 CEM/ESA calibration for fusion/instrumentation roles.
- Full skills inventory unless the role is extremely narrow.

## ATS Rules

- Use text-based PDF generated from LaTeX.
- Use standard section headers.
- Use a one-column body.
- No photos for US/Canada/UK.
- No date of birth, marital status, gender, or nationality unless a local application explicitly asks.
- No icons, images, sidebars, hidden text, or graphics carrying critical information.
- Keep links clickable but simple.
- Ensure all text is selectable in the PDF.
- Avoid layout tables that break reading order. The sample's simple alignment commands are acceptable.
- Always run the text extraction sanity check after compiling.

## LaTeX Design Spec

Match the selected LaTeX reference unless the user explicitly asks for a country/role variant. If no personal reference exists, use `templates/cv-template.tex` as the generic baseline.

Baseline traits:
- `article` class.
- `fontspec` with Tinos.
- Blue institution/project headers.
- Clear horizontal section rules.
- Left/right aligned title-location and role-date lines.
- One-column body.
- Compact but readable section spacing.
- Simple clickable links through `hyperref`.
- No icons.
- No images.

When adapting paper size:
- For A4, preserve the selected reference's visual hierarchy and density.
- For Letter, adjust `\documentclass`, `geometry`, and line breaks conservatively while keeping the same hierarchy and one-page target.

## Section Order

Default one-page technical order:

1. Header.
2. Education.
3. Technical Skills.
4. Research & Engineering Experience.
5. Selected Technical Projects.
6. Projects & Leadership or Honors.

Optional profile placement:
- If a pivot profile is needed, place it after the header and before Education.
- Keep it to 1-2 lines.
- Remove it first when space gets tight unless it is essential to explain the transition.

## Abbreviation and Naming Rules (Critical)

### Abbreviations

- On first use of any non-obvious abbreviation, write the full form followed by the abbreviation in parentheses. All subsequent uses can use the abbreviation alone.
- **Obvious abbreviations that do not need expansion:** FPGA, PID, NASA, AAS, GPS, CFD, CAE, RF, DAQ, DMA, MHD, ADC, HV, CAD, ATS, TVAC, GPA, LED, USB, API, SDK, SQL.
- **Abbreviations that must be expanded on first use:**
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
- When in doubt, expand it. It is better to over-expand once than make a recruiter decode the alphabet soup.

### Institution and Organization Names

- Always use the full official name on first mention. Never use only an acronym for a university or organization.
- VIT -> Vellore Institute of Technology (VIT)
- CANSAT -> use "CANSAT" because it is the established competition name.
- For organizations where the acronym is the brand, such as NASA, AAS, or IEEE, the acronym alone is fine.

### Person Names

- Always use full names for advisors and collaborators. Never use "Prof. Battel" or "Dr. Leon" alone:
  - Advisor: Dr. Omar Leon
  - Advisor: Prof. Steven Battel
  - Advisor: Prof. Stefano Livi
  - Advisor: Prof. Cheng Li
  - Advisor: Mojtaba Akhavan-Tafti

### Honors Section Rules

- Do not just list a rank or award. Include what was technically built or demonstrated.
- Bad: "CANSAT 2022 (NASA & AAS) -- 7th worldwide out of 42 teams."
- Good: "CANSAT 2022 (NASA & AAS) -- Engineered a 10 m tether-deployment mechanism with DC motor worm-gear spool and dual-servo 2-axis gimbal for camera stabilization; ranked 7th worldwide out of 42 teams."
- Keep each honor entry to 1-2 lines.

## Keyword Injection Strategy (Ethical, Truth-Based)

Examples of legitimate reformulation:
- JD says "instrument operations" and CV says "test rig characterization" -> use "instrument operations and test rig characterization."
- JD says "ground support equipment" and CV says "environmental test facilitator" -> use "ground support equipment development and environmental test facilitation."
- JD says "plasma source operations" and CV says "remote ignition workflow" -> use "plasma source operations and remote ignition workflow."
- JD says "synchronized acquisition" and CV says "DAQ synchronization" -> use "synchronized acquisition and DAQ synchronization."
- JD says "detector calibration" and CV says "CEM gain mapping" -> use "Channel Electron Multiplier (CEM) detector calibration and gain mapping."

Never add skills the candidate does not have. Only translate real experience into the employer's vocabulary.

## Content Sourcing Rules

- All factual content must come from `cv.md`.
- Use `article-digest.md` for proof-point prioritization and project links.
- For article/project metrics, `article-digest.md` takes precedence over `cv.md`.
- Use the full original bullet text from `cv.md` as the starting point. Condense only for one-page fit.
- When rewriting bullets for JD alignment, the factual content must remain identical. Only framing and vocabulary can change.
- Do not invent tools, metrics, publications, sponsorship signals, clearances, citizenship, responsibilities, or domain tenure.

## Professional Writing Rules

Inherited from `modes/_shared.md`; apply to all candidate-facing resume text:

- Native technical English.
- Short sentences, strong verbs, no passive voice unless technically cleaner.
- Avoid cliches: "passionate about", "results-oriented", "proven track record", "leveraged", "spearheaded", "facilitated", "synergies", "robust" as filler, "seamless", "cutting-edge", "innovative".
- Vary sentence structure. Do not start every bullet with the same verb.
- Prefer specifics over abstractions. Name tools, projects, instruments, and outcomes.

## Deprecated HTML Resume Path

The previous resume flow generated HTML with `templates/cv-template.html` and rendered it with `generate-pdf.mjs`. That path is now deprecated for resumes.

Keep these files because they are still useful for legacy outputs, tests, and cover-letter rendering:

- `templates/cv-template.html`
- `generate-cv.mjs`
- `generate-pdf.mjs`
- Existing `output/cv-*.html` reference artifacts

Do not use them for new tailored resumes unless LaTeX tooling is unavailable and the user approves a fallback.

## Optional Canva CV Path

The Canva visual CV path remains optional and separate. If `config/profile.yml` has `cv.canva_resume_design_id` set, offer Canva only when the user asks for a visual CV. Do not use Canva as the default technical resume path.

## Post-generation (mandatory tracker step)

Resume generation is **not complete** until the Jobs to Consider tracker is updated.

Immediately after writing and compiling the resume:

1. Attach both paths to `job.resources` (company subfolder included):
   - `resume_tex`: `output/{company-slug}/cv-{candidate}-{company-role}-{YYYY-MM-DD}.tex`
   - `resume_pdf`: `output/{company-slug}/cv-{candidate}-{company-role}-{YYYY-MM-DD}.pdf`
2. Create the job entry with `upsertConsiderJob()` if it does not exist yet.
3. Run `syncConsiderJobsToDashboard()`.

Follow the full tracker rules in `modes/application-artifacts.md` (`## MANDATORY: Jobs Tracker Attachment`). Do not wait for the user to ask.

The PDF is the application attachment. The `.tex` file is retained as the editable source.
