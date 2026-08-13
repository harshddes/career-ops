# Modo: oferta — Evaluación Completa A-G

Cuando el candidato pega una oferta (texto o URL), entregar SIEMPRE los 7 bloques (A-F evaluation + G legitimacy):

## Scoring boundary (MANDATORY)

Do not calculate, estimate, round, adjust, or recommend a score. Produce an
`opportunity-evidence-v1` fact sheet containing exact JD quotes, their source
locations, approved `opportunity_scoring.candidate_facts` IDs, and explicit
unknowns. Pass that fact sheet and the saved posting text to the canonical
scoring engine. Only copy the engine's returned eligibility, personal fit,
confidence, recommendation, policy version, and trace into the report.

## Paso 0 — Detección de Arquetipo

Clasificar la oferta en uno de los 6 arquetipos (ver `_shared.md`). Si es híbrido, indicar los 2 más cercanos. Esto determina:
- Qué proof points priorizar en bloque B
- Cómo reescribir el summary en bloque E
- Qué historias STAR preparar en bloque F

## Bloque A — Resumen del Rol

Tabla con:
- Arquetipo detectado
- Domain (platform/agentic/LLMOps/ML/enterprise)
- Function (build/consult/manage/deploy)
- Seniority
- Remote (full/hybrid/onsite)
- Team size (si se menciona)
- TL;DR en 1 frase

## Bloque B — Match con CV

Lee `cv.md`. Crea tabla con cada requisito del JD mapeado a líneas exactas del CV.

**Adaptado al arquetipo:**
- Si FDE → priorizar proof points de delivery rápida y client-facing
- Si SA → priorizar diseño de sistemas e integrations
- Si PM → priorizar product discovery y métricas
- Si LLMOps → priorizar evals, observability, pipelines
- Si Agentic → priorizar multi-agent, HITL, orchestration
- Si Transformation → priorizar change management, adoption, scaling

Sección de **gaps** con estrategia de mitigación para cada uno. Para cada gap:
1. ¿Es un hard blocker o un nice-to-have?
2. ¿Puede el candidato demostrar experiencia adyacente?
3. ¿Hay un proyecto portfolio que cubra este gap?
4. Plan de mitigación concreto (frase para cover letter, proyecto rápido, etc.)

## Bloque C — Nivel y Estrategia

1. **Nivel detectado** en el JD vs **nivel natural del candidato para ese arquetipo**
2. **Plan "vender senior sin mentir"**: frases específicas adaptadas al arquetipo, logros concretos a destacar, cómo posicionar la experiencia de founder como ventaja
3. **Plan "si me downlevelan"**: aceptar si comp es justa, negociar review a 6 meses, criterios de promoción claros

## Bloque D — Comp y Demanda

Usar WebSearch para:
- Salarios actuales del rol (Glassdoor, Levels.fyi, Blind)
- Reputación de compensación de la empresa
- Tendencia de demanda del rol

Tabla con datos y fuentes citadas. Si no hay datos, decirlo en vez de inventar.

## Bloque E — Plan de Personalización

| # | Sección | Estado actual | Cambio propuesto | Por qué |
|---|---------|---------------|------------------|---------|
| 1 | Summary | ... | ... | ... |
| ... | ... | ... | ... | ... |

Top 5 cambios al CV + Top 5 cambios a LinkedIn para maximizar match.

## Bloque F — Plan de Entrevistas

6-10 historias STAR+R mapeadas a requisitos del JD (STAR + **Reflection**):

| # | Requisito del JD | Historia STAR+R | S | T | A | R | Reflection |
|---|-----------------|-----------------|---|---|---|---|------------|

The **Reflection** column captures what was learned or what would be done differently. This signals seniority — junior candidates describe what happened, senior candidates extract lessons.

**Story Bank:** If `interview-prep/story-bank.md` exists, check if any of these stories are already there. If not, append new ones. Over time this builds a reusable bank of 5-10 master stories that can be adapted to any interview question.

**Seleccionadas y enmarcadas según el arquetipo:**
- FDE → enfatizar velocidad de entrega y client-facing
- SA → enfatizar decisiones de arquitectura
- PM → enfatizar discovery y trade-offs
- LLMOps → enfatizar métricas, evals, production hardening
- Agentic → enfatizar orchestration, error handling, HITL
- Transformation → enfatizar adopción, cambio organizacional

Incluir también:
- 1 case study recomendado (cuál de sus proyectos presentar y cómo)
- Preguntas red-flag y cómo responderlas (ej: "¿por qué vendiste tu empresa?", "¿tienes equipo de reports?")

## Bloque G — Posting Legitimacy

Analyze the job posting for signals that indicate whether this is a real, active opening. This helps the user prioritize their effort on opportunities most likely to result in a hiring process.

**Ethical framing:** Present observations, not accusations. Every signal has legitimate explanations. The user decides how to weigh them.

### Signals to analyze (in order):

**1. Posting Freshness** (from Playwright snapshot, already captured in Paso 0):
- Date posted or "X days ago" -- extract from page
- Apply button state (active / closed / missing / redirects to generic page)
- If URL redirected to generic careers page, note it

**2. Description Quality** (from JD text):
- Does it name specific technologies, frameworks, tools?
- Does it mention team size, reporting structure, or org context?
- Are requirements realistic? (years of experience vs technology age)
- Is there a clear scope for the first 6-12 months?
- Is salary/compensation mentioned?
- What ratio of the JD is role-specific vs generic boilerplate?
- Any internal contradictions? (entry-level title + staff requirements, etc.)

**3. Company Hiring Signals** (2-3 WebSearch queries, combine with Block D research):
- Search: `"{company}" layoffs {year}` -- note date, scale, departments
- Search: `"{company}" hiring freeze {year}` -- note any announcements
- If layoffs found: are they in the same department as this role?

**4. Reposting Detection** (from scan-history.tsv):
- Check if company + similar role title appeared before with a different URL
- Note how many times and over what period

**5. Role Market Context** (qualitative, no additional queries):
- Is this a common role that typically fills in 4-6 weeks?
- Does the role make sense for this company's business?
- Is the seniority level one that legitimately takes longer to fill?

### Output format:

**Assessment:** One of three tiers:
- **High Confidence** -- Multiple signals suggest a real, active opening
- **Proceed with Caution** -- Mixed signals worth noting
- **Suspicious** -- Multiple ghost job indicators, investigate before investing time

**Signals table:** Each signal observed with its finding and weight (Positive / Neutral / Concerning).

**Context Notes:** Any caveats (niche role, government job, evergreen position, etc.) that explain potentially concerning signals.

### Edge case handling:
- **Government/academic postings:** Longer timelines are standard. Adjust thresholds (60-90 days is normal).
- **Evergreen/continuous hire postings:** If the JD explicitly says "ongoing" or "rolling," note it as context -- this is not a ghost job, it is a pipeline role.
- **Niche/executive roles:** Staff+, VP, Director, or highly specialized roles legitimately stay open for months. Adjust age thresholds accordingly.
- **Startup / pre-revenue:** Early-stage companies may have vague JDs because the role is genuinely undefined. Weight description vagueness less heavily.
- **No date available:** If posting age cannot be determined and no other signals are concerning, default to "Proceed with Caution" with a note that limited data was available. NEVER default to "Suspicious" without evidence.
- **Recruiter-sourced (no public posting):** Freshness signals unavailable. Note that active recruiter contact is itself a positive legitimacy signal.

---

## Block H -- Visa & Work Authorization Analysis (MANDATORY)

**This block extracts evidence BEFORE the scoring engine and PDF generation.**
Do not decide the verdict yourself. Quote the restriction exactly, record
sponsorship evidence and unresolved facts, and let the canonical engine apply
the hard gate. If the engine returns blocked, do not generate a PDF.

**When to run:** ALWAYS run this block if `config/profile.yml` field `visa_status` is anything other than "U.S. Citizen" or "Permanent Resident". Skip this block only for U.S. citizens/green card holders.

### Step 1 -- Detect restrictions in JD text

Scan the full JD text (already extracted in Paso 0) for these keywords:

**Hard-block signals:**
- "must be a U.S. person" / "U.S. persons only"
- "U.S. citizens only" / "U.S. citizenship required"
- "active security clearance required" / "TS/SCI required" / "Secret clearance required"
- "ITAR restricted" + "must be U.S. person"

**Soft-block signals:**
- "This position requires compliance with Export Control Laws"
- "may require export authorization"
- "ability to obtain clearance"
- "ITAR/EAR" mentioned without explicit "must be U.S. person"
- "eligible to access export controlled information without a required export authorization, or eligible and reasonably likely to obtain the required export authorization" (this is the softer ITAR clause -- some companies will pursue a license for the right candidate)

**No restriction detected:** JD has no export/citizenship/clearance language at all.

### Step 2 -- Research company sponsorship history

Run 2-3 WebSearch queries:
- `"{company}" H-1B visa sponsorship site:h1bdata.info OR site:h1b.ai`
- `"{company}" green card PERM sponsorship`
- `"{company}" hires foreign nationals` (for smaller companies with no H-1B data)

Classify:
- **Active sponsor:** Company has recent H-1B LCA filings (within last 2 years) or public statements about sponsoring
- **Rare sponsor:** Few or old H-1B filings, or only for very senior roles
- **No record:** No H-1B filings found and no public evidence of sponsoring

### Step 3 -- Submit facts for deterministic verdict

The following table describes the engine policy; it is not permission for the
agent to write the verdict.

| JD Restriction | Company Sponsors? | Engine outcome |
|---|---|---|
| Hard block (U.S. person only) | Any | **SKIP** -- do not apply, do not generate PDF |
| TS/SCI or Secret clearance required | Any | **SKIP** -- cannot obtain as F-1 |
| Soft block (export auth possible) | Active sponsor | **Proceed with Caution** -- note risk in report header |
| Soft block | Rare/No record | **High Risk** -- likely skip unless exceptionally strong fit |
| No restriction | Active sponsor | **Clear** -- apply normally |
| No restriction | Rare/No record | **Proceed with Caution** -- ask about sponsorship early in process |

### Step 4 -- Impact on pipeline

- **SKIP verdict:** Still write the report (for tracking), but:
  - Mark status as `SKIP` in tracker (not `Evaluated`)
  - Do NOT generate a PDF
  - Add `**Visa:** SKIP -- {reason}` to the report header
  - Explain the blocking restriction clearly in the report body
- **Proceed with Caution verdict:**
  - Generate PDF as normal
  - Add `**Visa:** Caution -- {reason}` to the report header
  - Note the specific risk in Block H of the report
- **Clear verdict:**
  - Generate PDF as normal
  - Add `**Visa:** Clear` to the report header

### Output format in report

```
## H) Visa & Work Authorization

**JD Restriction Level:** {Hard Block / Soft Block / No Restriction}
**Restriction Evidence:** {exact quotes from JD}
**Company Sponsorship History:** {Active / Rare / No Record} -- {details}
**Verdict:** {SKIP / Proceed with Caution / High Risk / Clear}
**Reason:** {1-2 sentence explanation}
```

---

## Post-evaluation

ALWAYS after generating blocks A-H:

### 1. Guardar report .md

Guardar evaluación completa en `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`.

- `{###}` = siguiente número secuencial (3 dígitos, zero-padded)
- `{company-slug}` = nombre de empresa en lowercase, sin espacios (usar guiones)
- `{YYYY-MM-DD}` = fecha actual

**Formato del report:**

```markdown
# Evaluación: {Empresa} — {Rol}

**Fecha:** {YYYY-MM-DD}
**Arquetipo:** {detectado}
**Score:** {canonical engine personal_fit/5}
**Eligibility:** {canonical engine status}
**Confidence:** {canonical engine confidence}
**Policy:** {canonical engine policy_version}
**Legitimacy:** {High Confidence | Proceed with Caution | Suspicious}
**Visa:** {Clear | Caution -- reason | SKIP -- reason}
**PDF:** {path or pending or SKIP}

---

## A) Resumen del Rol
(contenido completo del bloque A)

## B) Match con CV
(contenido completo del bloque B)

## C) Nivel y Estrategia
(contenido completo del bloque C)

## D) Comp y Demanda
(contenido completo del bloque D)

## E) Plan de Personalización
(contenido completo del bloque E)

## F) Plan de Entrevistas
(contenido completo del bloque F)

## G) Posting Legitimacy
(full Block G content)

## H) Visa & Work Authorization
(full Block H content -- restriction level, evidence, sponsorship history, verdict)

## I) Draft Application Answers
(only if score >= 4.5 AND visa verdict is not SKIP)

---

## Keywords extraídas
(lista de 15-20 keywords del JD para ATS optimization)
```

### 2. Registrar en tracker

**SIEMPRE** registrar en `data/applications.md`:
- Siguiente número secuencial
- Fecha actual
- Empresa
- Rol
- Score: canonical engine personal fit (1-5); never an agent estimate
- Estado: `Evaluada`
- PDF: ❌ (o ✅ si auto-pipeline generó PDF)
- Report: link relativo al report .md (ej: `[001](reports/001-company-2026-01-01.md)`)

**Formato del tracker:**

```markdown
| # | Fecha | Empresa | Rol | Score | Estado | PDF | Report |
```
