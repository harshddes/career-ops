# Mode: application-artifacts -- Job-Specific Application Pack

Use this mode when a Jobs to Consider dashboard task asks for one or more application artifacts:

- Tailored resume PDF
- Cover letter PDF
- Application email draft

## MANDATORY: Jobs Tracker Attachment (never skip)

**Every time you create any application resource** — resume `.tex`/`.pdf`, cover letter `.html`/`.pdf`, application email `.md`, evaluation report link, or any other `job.resources` artifact — you **must immediately register it on the Jobs to Consider tracker**. This is not optional, not deferred, and not something the user should have to request.

Treat artifact generation as **incomplete** until the tracker step is done.

### When to run

Run tracker attachment **in the same turn**, immediately after the file(s) are written and compiled. Do not end the task with files only in `output/`.

### How to attach

1. Find the job in `data/jobs-to-consider.json` by Jobs to Consider ID, posting URL, or `company` + `title`.
2. If no job exists, **create one** with `upsertConsiderJob()` — do not skip because the role was pasted ad hoc.
3. Patch `job.resources` with every path you actually generated. Only include keys for artifacts that exist.
4. Call `syncConsiderJobsToDashboard()` so `WEB-TRACKER/data/jobs-to-consider.json` and the dashboard website stay in sync.

**Preferred (works offline, no server required):**

```js
import { upsertConsiderJob, patchConsiderJob, syncConsiderJobsToDashboard } from './WEB-TRACKER/lib/jobs-to-consider-store.mjs';

// If the job already exists:
patchConsiderJob('job-id', {
  resources: {
    resume_tex: 'output/{company-slug}/cv-....tex',
    resume_pdf: 'output/{company-slug}/cv-....pdf',
    cover_letter_pdf: 'output/{company-slug}/cover-letter-....pdf',
    email_draft: 'output/{company-slug}/application-email-....md',
  },
});

// If the job does not exist yet:
upsertConsiderJob({
  id: 'company-role-slug',
  company: 'Company Name',
  title: 'Role Title',
  url: 'https://posting-url',
  location: 'City, Country',
  status: 'to_consider',
  resources: { /* same keys as above */ },
});

syncConsiderJobsToDashboard();
```

**Alternative (when WEB-TRACKER server is running):**

```http
PATCH /api/jobs-to-consider/{job-id}
Content-Type: application/json

{
  "resources": {
    "resume_tex": "output/cv-...tex",
    "resume_pdf": "output/cv-...pdf",
    "cover_letter_pdf": "output/cover-letter-...pdf",
    "email_draft": "output/application-email-...md"
  }
}
```

### Resource key map

| Artifact | `job.resources` key |
|----------|---------------------|
| Resume LaTeX source | `resume_tex` |
| Resume PDF | `resume_pdf` |
| Cover letter PDF | `cover_letter_pdf` |
| Application email draft | `email_draft` |
| Evaluation report | `report_md` |

### Completion rule

The workflow is done only when:

1. File(s) exist under `output/` (and PDFs are compiled when applicable), **and**
2. `data/jobs-to-consider.json` has the correct `resources` paths, **and**
3. Dashboard sync has been run.

Tell the user the tracker job ID and which resource keys were linked.

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
6. If the company already has one or more prior cover letters in `output/` or prior entries in `data/jobs-to-consider.json`, read them before drafting.

The generated artifact should make the role-specific fit obvious. If the draft could fit many unrelated companies, rewrite it.

## GOLD RULE -- Same Company, Different Role

When creating a cover letter for a role at a company that already has prior cover letters:

1. **Do not reuse near-duplicate language.** The new letter must be materially different, not a word-swap edit.
2. **Reframe for the new bottleneck.** Change the opening reason, strongest evidence set, and contribution path to match the current role.
3. **Use a different evidence mix.** Reuse only role-relevant overlap; choose a different 2-3-project bridge set whenever possible.
4. **Reference prior application only when true and recent.** You may explicitly mention prior application to another role at the same company only if that application was submitted within the last 30 days.
5. **Never imply an application was submitted if it was not.** Drafted artifacts alone are not submitted applications.
6. **If prior same-company application is older than 30 days, avoid "I already applied" language** unless there is verified re-engagement context.

If these checks fail, rewrite before saving.

## Output Paths

Use today's date in `YYYY-MM-DD`.

**ALWAYS save company-specific artifacts in a company subfolder: `output/{company-slug}/`.** One folder per company, reused for every future role at that company. Create it if missing. Only generic, non-company artifacts stay in the `output/` root. See `.cursor/rules/output-company-folders.mdc`.

- Resume LaTeX/PDF: `output/{company-slug}/cv-{candidate}-{company-role}-{YYYY-MM-DD}.tex` and `.pdf`
- Cover letter HTML/PDF: `output/{company-slug}/cover-letter-{candidate}-{company-role}-{YYYY-MM-DD}.html` and `.pdf`
- Application email: `output/{company-slug}/application-email-{company-role}-{YYYY-MM-DD}.md`

Use kebab-case for `{candidate}`, `{company-slug}`, and `{company-role}`. Keep files under `output/`. Tracker `job.resources` paths must include the company subfolder.

## Tailored Resume

Follow `modes/pdf.md`.

The resume must stay truthful to `cv.md`. Reframe existing experience around the job description, but do not invent metrics, tools, publications, sponsorship signals, or responsibilities.

Resumes are LaTeX-first. Generate the `.tex` source using the selected LaTeX reference from `modes/pdf.md`, then compile it with `generate-latex.mjs`. `harsh/` files are optional personal references, not required dependencies. Keep the old HTML resume path only as an explicit fallback if LaTeX tooling is unavailable and the user approves.

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

Before marking the task complete, verify:

- The role classification is clear.
- The artifact is tailored to the actual job posting.
- The hiring bottleneck is addressed.
- The strongest evidence was selected, not every available project.
- The cover letter and email do not repeat each other.
- Any pivot is honest and confident.
- The language sounds like Harsh, not a corporate brochure.
- The artifact is short enough for a real human to read in one pass.
- **Tracker attachment is done** — see `## MANDATORY: Jobs Tracker Attachment (never skip)` above. If `job.resources` is empty or stale, the task is not finished.
