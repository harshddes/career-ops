#!/usr/bin/env node
/**
 * Batch-evaluate all Oklo Greenhouse postings and write portfolio + role reports.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const jobs = JSON.parse(fs.readFileSync(path.join(ROOT, 'batch/oklo-jobs-raw.json'), 'utf8')).jobs;
const DATE = '2026-07-01';

function stripHtml(html = '') {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function exportFlags(text) {
  const flags = [];
  if (/u\.s\. person/i.test(text)) flags.push('U.S. person language');
  if (/export control/i.test(text)) flags.push('export control');
  if (/itar/i.test(text)) flags.push('ITAR');
  if (/part 810/i.test(text)) flags.push('10 CFR Part 810');
  if (/security clearance/i.test(text)) flags.push('clearance');
  return flags;
}

const skipTitle =
  /director|counsel|procurement|sourcing|supply chain|insurance|controller|licensing manager|radiochemist|training instructor|construction field|civil and environmental|environmental specialist|network systems|facility operations|project planner|capital cost|power origination|contracts &|contracts and|quality assurance lead|special projects manager|junior radiochemist|radiation safety|fuels licensing|global supply|direct procurement|project controller|software lifecycle specialist|human factors|regulatory engineer|external hazards|external quality|nuclear training|senior counsel|senior manager|sr\. manager|manager,/i;

function analyzeJob(job) {
  const text = stripHtml(job.content);
  const title = job.title;
  const url = job.absolute_url;
  const location = job.location?.name || 'Unknown';
  const exportCtrl = exportFlags(text);
  const years = [...text.matchAll(/(\d+)\+?\s*(?:\+?\s*)?years/gi)].map((m) => parseInt(m[1], 10));
  const minYears = years.length ? Math.max(...years) : 0;

  let archetype = 'General Engineering';
  let technicalFit = 2.0;
  let notes = [];

  if (/hardware test engineer/i.test(title)) {
    archetype = 'Test / Instrumentation Engineer';
    technicalFit = 4.6;
    notes.push('Best direct match: thermo-hydraulic test execution, DAQ, lab automation');
    if (minYears >= 4) notes.push(`JD asks ${minYears}+ years regulated test experience — graduate lab density may read junior`);
  } else if (/thermal hydraulic test/i.test(title)) {
    archetype = 'Fluids / Test Engineer';
    technicalFit = 4.5;
    notes.push('Strong fluids + hands-on test overlap (Uranian CFD, LVACCS rig)');
    if (minYears >= 5) notes.push(`JD asks ${minYears}+ years — experience gap vs title`);
  } else if (/instrumentation and control/i.test(title)) {
    archetype = 'Instrumentation & Controls Engineer';
    technicalFit = 3.8;
    notes.push('DAQ, sensors, commissioning overlap; degree asks EE + 7+ years');
  } else if (/mechatronics/i.test(title)) {
    archetype = 'Mechatronics / Automation Engineer';
    technicalFit = 4.2;
    notes.push('Automation, sensors, prototyping; hot-cell robotics is stretch but mechanical + controls adjacent');
  } else if (/open call/i.test(title)) {
    archetype = 'General Engineering (Entry Router)';
    technicalFit = 4.3;
    notes.push('Best visa/export probe path — Oklo explicitly wants compelling cover letter');
  } else if (/systems engineer, requirements/i.test(title)) {
    archetype = 'Systems / Requirements Engineer';
    technicalFit = 4.1;
    notes.push('TestBedz requirement flowdown + UOP RTM map directly');
    if (minYears >= 3) notes.push(`JD asks ${minYears}-5 years requirements in regulated industries`);
  } else if (/software engineer$/i.test(title)) {
    archetype = 'Software / Simulation Engineer';
    technicalFit = 3.6;
    notes.push('Python/simulation overlap; CS degree + 3+ years industry preferred');
  } else if (/reactor core thermal fluids/i.test(title)) {
    archetype = 'Thermal-Fluids / Reactor Engineer';
    technicalFit = 4.0;
    notes.push('CFD/thermal fluids coursework + HPC sensitivity studies');
  } else if (/neutronics|cfd engineer|fuel performance|process engineer|mechanical design engineer|hot cell|fire protection|technical product|hardware integration|hardware test technician|senior process controls|senior electrical engineer - fuel|senior mechanical design|core mechanical|radioactive waste|general application - nuclear fuel/i.test(title)) {
    archetype = 'Nuclear / Mechanical / Process Engineering';
    technicalFit = 3.2;
    notes.push('Partial overlap depending on subdomain; check seniority and domain depth');
    if (/senior|sr\./i.test(title)) technicalFit -= 0.5;
    if (/technician/i.test(title)) technicalFit -= 0.4;
  } else if (skipTitle.test(title)) {
    archetype = 'Non-target function';
    technicalFit = 1.2;
    notes.push('Outside instrumentation/test/systems target stack');
  } else {
    technicalFit = 2.0;
    notes.push('Low overlap with plasma instrumentation / test automation profile');
  }

  // Harsh-specific boosts
  const fitText = `${title} ${text}`.toLowerCase();
  for (const kw of ['python', 'test', 'daq', 'thermal', 'fluid', 'vacuum', 'instrumentation', 'automation', 'simulation', 'calibration', 'data acquisition', 'commissioning']) {
    if (fitText.includes(kw)) technicalFit += 0.03;
  }

  // Company-wide export-control penalty (deep research)
  let visaPenalty = 0.4;
  if (exportCtrl.length) visaPenalty += 0.3;

  technicalFit = Math.round(Math.min(5, Math.max(1, technicalFit)) * 10) / 10;
  const overall = Math.round(Math.max(1, technicalFit - visaPenalty) * 10) / 10;

  let recommendation = 'SKIP';
  if (skipTitle.test(title) && technicalFit < 2.5) recommendation = 'SKIP (role mismatch)';
  else if (exportCtrl.length && overall < 3.5) recommendation = 'SKIP (export control language)';
  else if (overall >= 4.0) recommendation = 'APPLY (verify export/sponsorship first)';
  else if (overall >= 3.5) recommendation = 'CONSIDER';
  else if (overall >= 3.0) recommendation = 'STRETCH';
  else recommendation = 'SKIP';

  return {
    id: job.id,
    title,
    url,
    location,
    archetype,
    technicalFit,
    overall,
    minYears,
    exportCtrl,
    recommendation,
    notes,
    textPreview: text.slice(0, 1200),
  };
}

const analyzed = jobs.map((j) => analyzeJob(j)).sort((a, b) => b.overall - a.overall || b.technicalFit - a.technicalFit);

const reportsDir = path.join(ROOT, 'reports');
fs.mkdirSync(reportsDir, { recursive: true });

let reportNum = 30;
const detailedSlugs = new Set([
  'open-call-for-engineers',
  'hardware-test-engineer',
  'thermal-hydraulic-test-engineer',
  'mechatronics-engineer',
  'systems-engineer-requirements-and-integration',
  'software-engineer',
  'reactor-core-thermal-fluids-engineer',
  'instrumentation-and-control-engineer-fuel-recycling',
  'mechanical-design-engineer-fuel-recycling',
  'process-engineer',
]);

const reportIndex = [];

function writeReport(num, slug, title, body) {
  const file = `${String(num).padStart(3, '0')}-oklo-${slug}-${DATE}.md`;
  fs.writeFileSync(path.join(reportsDir, file), body);
  reportIndex.push({ num, slug, title, file });
  return file;
}

const masterRows = analyzed.map((r, i) => {
  const rank = i + 1;
  return `| ${rank} | ${r.title} | ${r.location} | ${r.technicalFit}/5 | ${r.overall}/5 | ${r.recommendation} | [${r.url}](${r.url}) |`;
});

const applyList = analyzed.filter((r) => r.recommendation.startsWith('APPLY'));
const considerList = analyzed.filter((r) => r.recommendation === 'CONSIDER');
const stretchList = analyzed.filter((r) => r.recommendation === 'STRETCH');

const masterBody = `# Oklo — Full Portfolio Evaluation (60 Roles)

**Date:** ${DATE}  
**Company:** [Oklo Inc.](https://oklo.com) — advanced fission / Aurora sodium-cooled fast reactor  
**Board:** [Greenhouse — Oklo](https://job-boards.greenhouse.io/oklo)  
**Deep research:** \`batch/oklo-company-research-2026-07-01.json\`  
**Legitimacy (company):** High Confidence — active hiring, Aurora-INL ground broken Sep 2025, ~$2.54B cash Q1 2026  
**Visa / export (candidate):** F-1 OPT — **company-wide ITAR / 10 CFR Part 810 risk**; zero public H-1B LCA filings for Oklo Inc. on h1bdata.info  

---

## Executive Summary

Oklo is a **real, well-funded advanced fission startup** building sodium-cooled fast reactors (Aurora). For Harsh's instrumentation/test/systems profile, the **strongest technical matches** are Idaho Falls test roles and the **Open Call for Engineers** router.

**Critical gate:** Deep research and multiple fuel-recycling postings include explicit **U.S. person / export control** language. F-1 OPT does not qualify as a U.S. person under ITAR/Part 810 without a deemed-export license. Treat Oklo as **high-risk for visa/export** until HR confirms scope per role.

### Shortlist — Apply (after export/sponsorship probe)

| Priority | Role | Score | Why |
|----------|------|-------|-----|
| 1 | Open Call for Engineers | ${analyzed.find((r) => /open call/i.test(r.title))?.overall ?? '—'}/5 | Lowest-friction entry; compelling cover letter requested; route to test/systems teams |
| 2 | Hardware Test Engineer | ${analyzed.find((r) => /hardware test engineer/i.test(r.title))?.overall ?? '—'}/5 | Best technical match — thermo-hydraulic test, DAQ, lab execution (4+ yr ask) |
| 3 | Systems Engineer, Requirements and Integration | ${analyzed.find((r) => /systems engineer, requirements/i.test(r.title))?.overall ?? '—'}/5 | TestBedz + mission RTM experience maps to regulated requirements |
| 4 | Mechatronics Engineer | ${analyzed.find((r) => /mechatronics/i.test(r.title))?.overall ?? '—'}/5 | Automation, sensors, prototyping; hot-cell robotics stretch |

### Do Not Apply (role mismatch — 28 roles)

Procurement, legal, finance, licensing managers, radiochemistry, construction supervision, facility ops, directors, environmental specialists, network tech, training instructors, etc.

### Do Not Apply (export language in JD — examples)

Instrumentation and Control Engineer - Fuel Recycling and several senior fuel-recycling/hardware integration postings include **U.S. person** clauses.

---

## Full Ranking (60 roles)

| Rank | Role | Location | Technical Fit | Overall | Recommendation | URL |
|------|------|----------|---------------|---------|----------------|-----|
${masterRows.join('\n')}

---

## Company Context (from parallel deep research)

- **Technology:** Generation IV sodium-cooled fast reactor (Aurora), HALEU metallic fuel; Aurora-INL under DOE authorization ([NucNet Sep 2025](https://www.nucnet.org/news/oklo-breaks-ground-at-idaho-site-for-first-aurora-advanced-reactor-project-9-1-2025))
- **Funding:** SPAC May 2024; ~$2.54B cash Q1 2026 after ATM raises
- **H-1B:** No indexed LCAs for "Oklo Inc." on [h1bdata.info](https://h1bdata.info/index.php?em=Oklo+Inc)
- **Export:** 10 CFR Part 810 applies to unclassified nuclear technology transfers to foreign nationals ([DOE Part 810](https://www.energy.gov/nnsa/10-cfr-part-810))
- **Culture signal:** Small-team startup; Glassdoor ~5.0 (CA); Santa Clara HQ + Idaho Falls test/isotopes sites

---

## Recommended Application Strategy

1. **Lead with Open Call** — one tailored cover letter framing instrumentation/test/systems path; ask export + H-1B early.
2. **Parallel apply** to Hardware Test Engineer + Systems Engineer R&I if Open Call does not route within ~1 week.
3. **Do not spray** fuel-recycling senior roles with explicit U.S. person language unless HR pre-clears foreign-national scope.
4. **Artifacts generated:** CV + cover letter + email for top 4 shortlist in \`output/oklo/\`.

---

## Appendix — Skip Digest (compact)

${analyzed
  .filter((r) => r.recommendation.startsWith('SKIP'))
  .map((r) => `- **${r.title}** (${r.overall}/5) — ${r.notes[0] || r.recommendation}`)
  .join('\n')}
`;

writeReport(reportNum++, 'portfolio-master', 'Oklo Portfolio Master', masterBody);

function detailedReport(r, num) {
  const slug = slugify(r.title);
  const exportSection =
    r.exportCtrl.length > 0
      ? `**Export control language in JD:** ${r.exportCtrl.join(', ')} — likely **hard block** for F-1 OPT unless employer pursues deemed-export authorization.`
      : `**Export control language in JD:** Not explicit in posting text. **Company-level Part 810/ITAR still applies** — confirm with recruiter before investing.`;

  return `# Evaluation: Oklo — ${r.title}

**Date:** ${DATE}  
**Archetype:** ${r.archetype}  
**Technical Fit:** ${r.technicalFit}/5  
**Overall Score:** ${r.overall}/5 (after visa/export penalty)  
**URL:** ${r.url}  
**Location:** ${r.location}  
**Legitimacy:** High Confidence — active Greenhouse posting  
**Visa:** F-1 OPT; H-1B sponsorship unproven at Oklo; ${exportSection}  
**Recommendation:** **${r.recommendation}**

---

## A) Role Summary

| Field | Value |
|---|---|
| **Archetype** | ${r.archetype} |
| **Domain** | Advanced fission / Aurora test & deployment |
| **Function** | See JD excerpt below |
| **Seniority signal** | ${r.minYears ? `${r.minYears}+ years mentioned in JD` : 'Not specified / entry-friendly'} |
| **Remote** | ${r.location} |
| **TL;DR** | ${r.notes.join(' ')} |

## B) CV Match (Harsh Desai)

| JD Theme | Match | Evidence |
|---|---|---|
| Test plan / execution / reporting | ${/test/i.test(r.title + r.textPreview) ? 'Strong' : 'Partial'} | LVACCS HV test workflow; TestBedz qualification routing |
| Thermo-hydraulic / fluids reasoning | ${/thermal|fluid|hydraulic/i.test(r.title + r.textPreview) ? 'Strong adjacent' : 'Partial'} | Uranian cloud-resolving HPC; ANSYS Fluent coursework |
| Instrumentation / DAQ / controls | ${/instrument|control|daq|hardware test/i.test(r.title + r.textPreview) ? 'Strong' : 'Partial'} | PyVISA DAQ sync; Keithley/TDK Lambda sequencing; FPGA readout |
| Systems / requirements | ${/systems|requirements|integration/i.test(r.title + r.textPreview) ? 'Strong' : 'Partial'} | TestBedz flowdown; UOP communications RTM |
| Python automation | Strong | LVACCS GUI/automation; pyspedas analysis |
| Regulated industry tenure | Gap | Graduate research density vs ${r.minYears || 'N/A'}+ yr industry asks |
| Nuclear operations depth | Gap | Honest pivot from space plasma instrumentation |

## C) Level and Strategy

Position Harsh as **instrumentation-first systems engineer** transferring measurement rigor into nuclear test environments. Do not claim tokamak/reactor operations ownership.

## D) Comp and Demand

Oklo is ramping headcount with strong cash position; test/instrumentation roles likely mid-market engineering comp (verify at screen). No public salary on most postings.

## E) Personalization Plan

| Change | Why |
|---|---|
| Lead LVACCS test automation + 98.6% DAQ sync | Test execution credibility |
| Elevate TestBedz requirements flowdown | Systems/requirements roles |
| Add Uranian/ANSYS fluids bullet | Thermal-hydraulic roles |
| Compact profile line on space→nuclear test pivot | Fusion/nuclear postings |

## F) Interview Stories

| Story | Source |
|---|---|
| HV-safe repeatable test workflow | LVACCS |
| Requirements traceability under constraints | TestBedz / UOP |
| Fluids sensitivity interpretation | Uranian HPC |
| Detector calibration discipline | CEM/ESA series |

## G) Posting Legitimacy

Active Greenhouse listing as of ${DATE}. Oklo hiring is consistent with Aurora-INL deployment and fuel-recycling buildout.

---

## JD Excerpt

${r.textPreview}...
`;
}

for (const r of analyzed) {
  const slug = slugify(r.title);
  if (detailedSlugs.has(slug)) {
    writeReport(reportNum++, slug, r.title, detailedReport(r, reportNum));
  }
}

const manifest = {
  date: DATE,
  company: 'Oklo',
  totalJobs: analyzed.length,
  apply: applyList.map((r) => ({ title: r.title, url: r.url, overall: r.overall })),
  consider: considerList.map((r) => ({ title: r.title, url: r.url, overall: r.overall })),
  reports: reportIndex,
};
fs.writeFileSync(path.join(ROOT, 'batch/oklo-evaluation-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
