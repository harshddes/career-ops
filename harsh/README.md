# Harsh Resume References

This folder contains Harsh-specific resume reference assets. Treat these files as user-layer content, not upstream system templates.

## Optional Resume Style Reference

- `Harsh_Desai_Resume_OnePage_AlignedFullSkills_A4.tex`
- `Harsh_Desai_Resume_OnePage_AlignedFullSkills_A4.pdf`

Use these only as an optional personal LaTeX style reference when the user wants this specific design. They define a visual structure, spacing, section order, and command style, but the workflow must not require them.

The user may edit, replace, move, or delete these files at any time. If they are absent, resume generation should use another user-approved LaTeX reference or fall back to `../templates/cv-template.tex`.

## Source Of Truth

These files are not factual sources. For resume content, always read:

- `../cv.md`
- `../article-digest.md`
- `../config/profile.yml`
- `../modes/_profile.md`

If a fact appears here but not in `cv.md` or `article-digest.md`, ask before using it.

## Compile

The active sample uses `fontspec`, so compile with `xelatex` through:

```bash
npm run latex -- harsh/Harsh_Desai_Resume_OnePage_AlignedFullSkills_A4.tex output/cv-harsh-desai-latex-smoke.pdf
```

New tailored resumes should be saved under `output/` as:

- `output/cv-{candidate}-{company-role}-{YYYY-MM-DD}.tex`
- `output/cv-{candidate}-{company-role}-{YYYY-MM-DD}.pdf`
