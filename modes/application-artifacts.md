# Mode: application-artifacts -- Job-Specific Application Pack

Use this mode when a Jobs to Consider dashboard task asks for one or more application artifacts:

- Tailored resume PDF
- Cover letter PDF
- Application email draft

## Inputs

1. Read the queued task:
   - Company
   - Role/target title
   - Posting URL
   - Jobs to Consider ID
   - Requested artifact kind
   - Expected `job.resources` keys
2. Read `cv.md` as the source of truth.
3. Read `config/profile.yml`, `modes/_profile.md`, and `article-digest.md` when available.
4. Read the posting or existing report context. If the posting is unavailable, use the saved report and clearly note the limitation.

## Pre-Writing Assessment

Before generating a cover letter or application email, read `## Application Writing Strategy` in `modes/_profile.md` and apply it as the controlling user-specific guidance.

Do this assessment before writing any candidate-facing copy:

1. Classify the role using the profile's role classification matrix:
   - Pure space / spacecraft / space instrumentation
   - Fusion / nuclear / plasma / tokamak / reactor / diagnostics
   - General instrumentation / test / hardware / DAQ
   - Mechanical / aerospace hardware
   - Software-heavy
2. Identify the hiring bottleneck:
   - What is the company hiring someone to fix, build, measure, test, or keep from failing?
3. Select only the 2-3 strongest bridges from `cv.md` and `article-digest.md`.
4. Select project links from `article-digest.md` only when they support the role.
5. If the role is an adjacent-domain pivot, state the gap honestly and translate the instrumentation path without overclaiming.

The generated artifact should make the role-specific fit obvious. If the draft could fit many unrelated companies, rewrite it.

## Output Paths

Use today's date in `YYYY-MM-DD`.

- Resume HTML/PDF: `output/cv-{candidate}-{company-role}-{YYYY-MM-DD}.html` and `.pdf`
- Cover letter HTML/PDF: `output/cover-letter-{candidate}-{company-role}-{YYYY-MM-DD}.html` and `.pdf`
- Application email: `output/application-email-{company-role}-{YYYY-MM-DD}.md`

Use kebab-case for `{candidate}` and `{company-role}`. Keep files under `output/`.

## Tailored Resume

Follow `modes/pdf.md`.

The resume must stay truthful to `cv.md`. Reframe existing experience around the job description, but do not invent metrics, tools, publications, sponsorship signals, or responsibilities.

## Cover Letter

Match the format and writing style of:

`output/cover-letter-harsh-desai-pranos-fusion-instrumentation-engineer-2026-05-06.html`

Follow the cover-letter rules in `modes/_profile.md` first. In particular:

- Keep it one page.
- Write 5-7 short paragraphs unless the posting demands a shorter answer.
- Open with a direct reason for applying.
- Build around the hiring bottleneck from the pre-writing assessment.
- Pick only 2-3 strongest technical bridges.
- Explain adjacent-domain pivots honestly without apologizing.
- For fusion, nuclear, plasma, tokamak, reactor, or diagnostics roles, be clear that Harsh comes from space engineering and space plasma instrumentation, then translate to HV-safe testing, DAQ, detector/readout chains, calibration, plasma-source workflows, and measurement documentation.
- For pure space roles, lead directly with space instrumentation, spacecraft testing, plasma measurement, mission systems, detector/readout, calibration, and flight/test workflow.
- For software-heavy roles, focus on Python automation, DAQ tooling, GUIs, FPGA workflow, data processing, simulation, and test tools without presenting Harsh as a pure software engineer.

Structural requirements:

1. One page.
2. Plain selectable text, no images.
3. Same header pattern: name, gradient rule, compact contact block.
4. Date, recipient, greeting, 3-4 body paragraphs, thank-you line, signature.
5. Render PDF with `generate-pdf.mjs`.

Font scale:

- Body text: `12.7px`.
- Name/header: `24px`.
- Contact block: `11.6px`.
- Keep the letter to one page after rendering; shorten wording before reducing this font scale.

Writing requirements:

- Direct, specific, technical.
- Explain why the role maps to real candidate experience.
- Name the closest matching projects, instruments, tools, or workflows from `cv.md`.
- Bridge adjacent-domain experience without overclaiming exact domain ownership.
- Avoid cliches such as "passion for innovation", "passionate about", "aligns with my goals", "proven track record", "synergy", "cutting-edge", "seamless", "robust" as filler, and "results-oriented".
- Do not copy old cover letters. Use them only as style references.
- Do not dump every project.
- Use mass spectrometry or ion analysis only when the role involves diagnostics, gas composition, impurities, outgassing, vacuum systems, plasma-facing materials, detector response, instrument response, or analytical signal quality.
- For India-based fusion or nuclear companies, mention contributing to India's fusion capability at most once, and keep it grounded.
- Do not submit or send anything automatically.

## Application Email

The email must not repeat the cover letter. If both artifacts are generated, write the cover letter first, then write the email as a short wrapper with selected evidence links.

Use Markdown and follow this shape:

```markdown
Subject: {Role} - {Candidate Name}

Dear {Hiring Team or Contact Name},

I am applying for the {Role} role at {Company}. I have attached my CV and cover letter.

Attached:
- CV: `{cv-file-name}.pdf`
- Cover letter: `{cover-letter-file-name}.pdf`

{One short fit paragraph tailored to the role. Do not repeat the cover letter.}

Selected project links:
- {Most relevant proof point}: {url}
- {Second relevant proof point}: {url}
- {Optional third proof point, only if genuinely strong}: {url}

Best regards,
{Candidate Name}
{Email}
{LinkedIn}
```

Keep it short enough to paste directly into an email client.

Project-link rules:

- Use links as evidence, not decoration.
- Prefer 2 links; use 3 only when the third is genuinely strong.
- Do not attach a separate project-links document unless the company explicitly asks for one.
- Fusion / diagnostics / instrumentation: portfolio, SSD readout report, ion-optics/calibration bundle.
- DAQ / test automation: portfolio or GitHub, LVACCS/test automation link if available, SSD readout if relevant.
- Space instrumentation: portfolio, SSD readout report, ion-optics/calibration bundle, UOP mission report if relevant.
- Mechanical / aerospace hardware: CanSat, rocketry, or mechanical validation links only if directly relevant.

## Final Self-Check

Before saving candidate-facing artifacts, verify:

- The role classification is clear.
- The artifact is tailored to the actual job posting.
- The hiring bottleneck is addressed.
- The strongest evidence was selected, not every available project.
- The cover letter and email do not repeat each other.
- Any pivot is honest and confident.
- The language sounds like Harsh, not a corporate brochure.
- The artifact is short enough for a real human to read in one pass.

## Dashboard Attachment

After files are created, attach the relative paths to the source job with:

```http
PATCH /api/jobs-to-consider/{job-id}
Content-Type: application/json

{
  "resources": {
    "resume_pdf": "output/cv-...pdf",
    "cover_letter_pdf": "output/cover-letter-...pdf",
    "email_draft": "output/application-email-...md"
  }
}
```

Only include keys for artifacts that were actually generated. The dashboard will render download or preview links from these paths.
