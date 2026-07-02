# Templates

System-layer template files used by career-ops scripts and modes. These files are auto-updated when you run `npm run update` -- put user customizations in the user-layer files instead (see DATA_CONTRACT.md).

## Files

| File | Used By | Purpose |
|------|---------|---------|
| `cv-template.html` | `generate-pdf.mjs` | Legacy/fallback HTML resume template and reusable HTML/PDF pattern for cover letters |
| `cv-template.tex` | `generate-latex.mjs` | Generic LaTeX/Overleaf template reference |
| `portals.example.yml` | Onboarding | Example portal scanner configuration (copy to `portals.yml` to activate) |
| `states.yml` | `verify-pipeline.mjs`, `normalize-statuses.mjs`, `merge-tracker.mjs` | Canonical application states and their aliases |

### cv-template.html

The legacy HTML resume template rendered by Playwright into PDF. New tailored resumes should use the LaTeX flow in `modes/pdf.md`. Keep this template for older outputs, tests, and any explicit HTML fallback.

**Design:** Space Grotesk headings + DM Sans body, single-column ATS-safe layout, self-hosted fonts from `fonts/`.

**Customization:** Edit this file only for legacy HTML resumes or HTML/PDF styling patterns. For active LaTeX resume design, use a user-approved LaTeX reference or `templates/cv-template.tex`.

### cv-template.tex

Generic LaTeX template for Overleaf-compatible CV generation. Use this when no user-approved personal LaTeX reference is available.

**Design:** Single-column ATS-safe layout using standard CTAN packages (`fontawesome5`, `enumitem`, `hyperref`, `titlesec`). No custom fonts or external dependencies; uploads directly to Overleaf.

**Usage:**
```bash
# Compile LaTeX resumes with xelatex (default)
node generate-latex.mjs output/cv-name-company-date.tex

# Or specify a custom output path
node generate-latex.mjs output/cv-name-company-date.tex output/custom-name.pdf
```

**Prerequisites:** `xelatex` via [MiKTeX](https://miktex.org/) (Windows) or TeX Live (Linux/macOS) for `fontspec`-based resumes. The script also supports `--engine=lualatex` and `--engine=pdflatex` for compatible files. Alternatively, upload the `.tex` file directly to [Overleaf](https://www.overleaf.com).

**Customization:** Edit this file for the generic fallback template. If the user provides a personal LaTeX reference, use that instead and keep it in user-layer files.

### portals.example.yml

Pre-configured portal scanner with 45+ tracked companies and search queries. Contains title filters, company career page URLs, Greenhouse API endpoints, and WebSearch queries.

**To activate:** Copy to project root as `portals.yml` and customize `title_filter.positive` keywords for your target roles. Add or remove companies as needed.

### states.yml

Defines the 8 canonical application states (`Evaluated`, `Applied`, `Responded`, `Interview`, `Offer`, `Rejected`, `Discarded`, `SKIP`) with aliases for common variants. All pipeline scripts validate statuses against this file.

**Do not rename states** -- the dashboard and all scripts depend on these exact IDs. You can add aliases if you encounter new variants that should map to an existing state.
