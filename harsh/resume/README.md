# `harsh/resume/` — Resume variants

Living LaTeX sources and rendered PDF snapshots for targeted resume variants.

## Rules (non-negotiable)

1. **Edit the `.tex` in place** when iterating on content for a variant line.
2. **Never overwrite an existing PDF.** Every render gets a **new, relevant PDF filename**.
3. Compile with:

```bash
node generate-latex.mjs harsh/resume/<source>.tex harsh/resume/<NEW_RELEVANT_NAME>.pdf
```

4. `generate-latex.mjs` **refuses to overwrite** an existing PDF unless you pass `--force`. Use `--force` only when explicitly restoring/replacing a named file (e.g. recovering a destroyed snapshot).

## Naming

| Kind | Example |
|------|---------|
| Living LaTeX (editable) | `HarshDesai_July2026_Resume_Detectors.tex` |
| PDF snapshot (append-only) | `HarshDesai_July2026_Resume_Detectors.pdf` |
| New focus after edits | `HarshDesai_July2026_Resume_Instrumentation.pdf` |
| Another iteration | `HarshDesai_July2026_Resume_Instrumentation_v2.pdf` |
| Dated snapshot | `HarshDesai_2026-08-11_Resume_Instrumentation.pdf` |

Pattern: `HarshDesai_<month/year or date>_Resume_<focus>[_vN].pdf`

## Page fill (automated)

After every render, `generate-latex.mjs` runs `scripts/measure-pdf-fill.mjs` and warns if a one-page PDF is underfilled (`bottomGapIn > 0.9`) or overfilled (`Pages > 1`). Agents must fix fill before stopping — see `.cursor/rules/resume-pdf-fill-check.mdc`.

Manual check:

```bash
node scripts/measure-pdf-fill.mjs harsh/resume/<file.pdf>
```

## Current files (high level)

| File | Role |
|------|------|
| `HarshDesai_Resume_KLA_OptoMechanical.tex` | Living mech-first source (also used for UW-IDP final polish) |
| `HarshDesai_Resume_UW-IDP_Mechanical-Instrumentation_from-KLA_v2.pdf` | UW-IDP after 5 content edits |
| `HarshDesai_Resume_UW-IDP_Mechanical-Instrumentation_from-KLA_v3b.pdf` | **Submit candidate** — final keyword edits (mechanical system design / cross-functional / presentations); 1 page |
| `HarshDesai_July2026_Resume_Detectors.pdf` | Snapshot of the earlier detectors-focused content (do not overwrite) |
| `HarshDesai_July2026_Resume_Instrumentation.pdf` | General instrumentation-heavy snapshot (do not overwrite) |
| `HarshDesai_July2026_Resume_UW-IDP_Mechanical-Instrumentation.pdf` | UW-IDP v1 (underfilled — superseded) |
| `HarshDesai_July2026_Resume_UW-IDP_Mechanical-Instrumentation_v2.pdf` … `_v4.pdf` | Fill-iteration snapshots (superseded) |
| `HarshDesai_July2026_Resume_UW-IDP_Mechanical-Instrumentation_v5.pdf` | Fill OK but Education overlap bug |
| `HarshDesai_July2026_Resume_UW-IDP_Mechanical-Instrumentation_v6.pdf` | Current UW-IDP snapshot (Education layout fixed; fill ~95%) |
| `HarshDesai_*_Plasma*.pdf` / `*_Terafab_*` | Older plasma / Terafab-targeted snapshots and sources |
| `Harsh_Desai_One_Page_Resume.pdf` | Older one-page snapshot |

Build leftovers (`.aux`, `.log`, `.out`) may appear next to XeLaTeX runs; they are not deliverables.

## Agent note

Cursor rule: `.cursor/rules/resume-pdf-no-overwrite.mdc`
