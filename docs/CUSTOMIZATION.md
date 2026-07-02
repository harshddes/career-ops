# Customization Guide

## Profile (config/profile.yml)

This is the single source of truth for your identity. All modes read from here.

Key sections:
- **candidate**: Name, email, phone, location, LinkedIn, portfolio
- **target_roles**: Your North Star roles and archetypes
- **narrative**: Your headline, exit story, superpowers, proof points
- **compensation**: Target range, minimum, currency
- **location**: Country, timezone, visa status, on-site availability

## Target Roles (modes/_profile.md)

The archetype table in `_profile.md` determines how offers are scored and CVs are framed. Edit the table to match YOUR career targets:

```markdown
| Archetype | Thematic axes | What they buy |
|-----------|---------------|---------------|
| **Your Role 1** | key skills | what they need |
| **Your Role 2** | key skills | what they need |
```

Also update the "Adaptive Framing" table to map YOUR specific projects to each archetype.

## Portals (portals.yml)

Copy from `templates/portals.example.yml` and customize:

1. **title_filter.positive**: Keywords matching your target roles
2. **title_filter.negative**: Tech stacks or domains to exclude
3. **search_queries**: WebSearch queries for job boards (Ashby, Greenhouse, Lever)
4. **tracked_companies**: Companies to check directly

## Resume Template Selection

Tailored resumes are LaTeX-first. Format guidance comes from:

1. A user-approved personal LaTeX reference, if one exists.
2. Files in `harsh/`, if present and the user wants that style.
3. The generic fallback `templates/cv-template.tex`.

Current optional personal reference:

- `harsh/Harsh_Desai_Resume_OnePage_AlignedFullSkills_A4.tex`
- `harsh/Harsh_Desai_Resume_OnePage_AlignedFullSkills_A4.pdf`

Edit the personal LaTeX sample only if you want to keep using that style. You can delete or replace it; the career-ops workflow should not depend on it. The resume-generation rules live in `modes/pdf.md`.

If the optional sample exists, compile it with:

```bash
npm run latex -- harsh/Harsh_Desai_Resume_OnePage_AlignedFullSkills_A4.tex output/cv-harsh-desai-latex-smoke.pdf
```

## Legacy HTML Resume Template (templates/cv-template.html)

The HTML template is retained for legacy HTML resumes, tests, and reusable HTML/PDF styling patterns. It is no longer the default for new tailored resumes.

It uses these design tokens:
- **Fonts**: Space Grotesk (headings) + DM Sans (body) -- self-hosted in `fonts/`
- **Colors**: Cyan primary (`hsl(187,74%,32%)`) + Purple accent (`hsl(270,70%,45%)`)
- **Layout**: Single-column, ATS-optimized

Only edit this file when intentionally changing legacy HTML output or cover-letter-adjacent HTML styling.

## Negotiation Scripts (modes/_shared.md)

The negotiation section provides frameworks for salary discussions. Replace the example scripts with your own:
- Target ranges
- Geographic arbitrage strategy
- Pushback responses

## Hooks (Optional)

Career-ops can integrate with external systems via Claude Code hooks. Example hooks:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "echo 'Career-ops session started'"
      }]
    }]
  }
}
```

Save hooks in `.claude/settings.json`.

## States (templates/states.yml)

The canonical states rarely need changing. If you add new states, update:
1. `templates/states.yml`
2. `normalize-statuses.mjs` (alias mappings)
3. `modes/_shared.md` (any references)
