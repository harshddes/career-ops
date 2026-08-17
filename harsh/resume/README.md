# Resume folder — start here

**The only file to edit:** `HarshDesai_Resume.tex` (this folder, top level).

That file is the living recipe. Every PDF is a photograph of some recipe at one moment in time. You keep rewriting the recipe. You never replace an old photograph — you take a new one with a new name.

```text
harsh/resume/
  HarshDesai_Resume.tex          ← EDIT THIS
  pdfs-from-living-source/       ← PDFs rendered from HarshDesai_Resume.tex
  archive/                       ← old recipes + their PDFs (do not edit)
```

## Render a new PDF (never overwrite)

```bash
node generate-latex.mjs harsh/resume/HarshDesai_Resume.tex harsh/resume/pdfs-from-living-source/HarshDesai_YYYY-MM-DD_Resume_<focus>.pdf
```

Examples of a new name: `HarshDesai_2026-08-13_Resume_Instrumentation.pdf`, `HarshDesai_Resume_UW-IDP_v4.pdf`.

`generate-latex.mjs` refuses to overwrite an existing PDF unless you pass `--force`. Do not use `--force` unless you were explicitly asked to restore that exact file.

After every render, page fill must land in band (see `.cursor/rules/resume-pdf-fill-check.mdc`).

---

## Which PDF came from which LaTeX

### Living source — `HarshDesai_Resume.tex`

Former name: `HarshDesai_Resume_KLA_OptoMechanical.tex`. Same file, renamed: the content is the current mechanical / UW-IDP resume, not a KLA-only draft.

| PDF in `pdfs-from-living-source/` | What it is | Keep? |
|---|---|---|
| `…_from-KLA.pdf` | First render (2 pages — too long) | snapshot only |
| `…_from-KLA_v2.pdf` | Compressed to 1 page | snapshot only |
| `…_from-KLA_v3.pdf` | Keyword pass (spilled to 2 pages) | snapshot only |
| `…v3b.pdf` | **Best snapshot of this source** — 1 page, submit-candidate polish | yes |

### Archive — detectors line

Recipe: `archive/detectors-july2026/HarshDesai_July2026_Resume_Detectors.tex`  
Frozen. Do not keep editing this unless you are reviving that older detectors-heavy variant.

| PDF (same folder as the `.tex`) | Rendered from that detectors `.tex` |
|---|---|
| `HarshDesai_July2026_Resume_Detectors.pdf` | Original detectors-focused snapshot |
| `HarshDesai_July2026_Resume_Instrumentation.pdf` | Same source after an instrumentation pass |
| `…UW-IDP_Mechanical-Instrumentation.pdf` | UW-IDP v1 (underfilled, superseded) |
| `…_v2.pdf` … `…_v4.pdf` | Fill-iteration snapshots (superseded) |
| `…_v5.pdf` | Fill OK, Education overlap bug |
| `…_v6.pdf` | Last detectors-line UW-IDP snapshot (Education layout fixed) |

### Archive — Terafab / plasma line

| File | Role |
|---|---|
| `archive/terafab-plasma-july2026/HarshDesai_Terafab_PlasmaSystems_Resume.tex` | Frozen recipe that was actually compiled |
| `archive/terafab-plasma-july2026/Harsh_Desai_Terafab_Resume.tex` | Earlier content draft merged into the file above — not a second living source |
| `HarshDesai_Terafab_PlasmaSystems_Resume.pdf` | Render of the PlasmaSystems `.tex` (2026-07-28) |
| `HarshDesai_Resume_July2026_Plasma.pdf` | Same render, duplicate copy (identical size + timestamp) |

### Archive — leftover

| File | Role |
|---|---|
| `archive/legacy/Harsh_Desai_One_Page_Resume.pdf` | Older one-page snapshot (2026-07-15). No matching `.tex` in this folder. |

---

## Rules

1. Edit **only** `HarshDesai_Resume.tex` for new work.
2. Never overwrite an existing PDF. New render → new filename under `pdfs-from-living-source/`.
3. Do not put new PDFs in `archive/`. That tree is history.
4. Need an old variant (detectors / Terafab)? Copy its `.tex` out of `archive/` and start a new named file. Do not silently mutate the archive copy.

Cursor rule: `.cursor/rules/resume-pdf-no-overwrite.mdc`
