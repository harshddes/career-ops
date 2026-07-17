#!/usr/bin/env node
/**
 * Clear Target Companies exhibitor queue chunk:
 * Rohde & Schwarz, Reflex Aerospace, Novo Space, OKAPI:Orbits, Odysseus Space
 */
import { mkdirSync, writeFileSync } from 'fs';
import {
  markExhibitorTaskInProgress,
  markExhibitorTaskCompleted,
} from '../../WEB-TRACKER/lib/exhibitor/factory.mjs';
import {
  patchExhibitorCompany,
  syncExhibitorCompaniesToDashboard,
} from '../../WEB-TRACKER/lib/exhibitor/company-store.mjs';
import {
  upsertConsiderJob,
  syncConsiderJobsToDashboard,
  slugify,
} from '../../WEB-TRACKER/lib/jobs-to-consider-store.mjs';

const TODAY = new Date().toISOString().slice(0, 10);

function writeReport(slug, body) {
  const path = `reports/exhibitor-${slug}-${TODAY}.md`;
  writeFileSync(path, body.endsWith('\n') ? body : `${body}\n`);
  return path;
}

function upsertRoles(company, roles) {
  const jobsFound = [];
  for (const role of roles) {
    const id = slugify(`${company}-${role.title}-${role.location || 'na'}-${role.id || role.url}`);
    upsertConsiderJob({
      id,
      company,
      title: role.title,
      url: role.url,
      location: role.location || '',
      source: 'exhibitor-smallsat-2026',
      score: role.score,
      fit_summary: role.fit_summary,
      notes: role.notes || 'From Target Companies exhibitor clear-queue.',
      status: 'to_consider',
      recommendation: role.recommendation || 'Review JD + work-auth before apply',
    });
    jobsFound.push({ id, title: role.title, url: role.url, score: role.score });
  }
  return jobsFound;
}

function finishCompany(cfg) {
  markExhibitorTaskInProgress(cfg.companyId);
  mkdirSync(`batch/exhibitors/${cfg.slug}`, { recursive: true });
  const jobsFound = upsertRoles(cfg.companyName, cfg.roles);
  syncConsiderJobsToDashboard();
  const reportPath = writeReport(cfg.slug, cfg.reportBody);
  writeFileSync(`batch/exhibitors/${cfg.slug}/inventory.json`, `${JSON.stringify({
    scanned: cfg.scanned,
    added: jobsFound.length,
    roles: cfg.roles,
    careers_url: cfg.careersUrl,
  }, null, 2)}\n`);
  patchExhibitorCompany(cfg.companyId, {
    worker_status: cfg.status,
    website: cfg.website,
    careers_url: cfg.careersUrl,
    research_report: reportPath,
    resources: { report_md: reportPath },
    jobs_found: jobsFound,
    postings_scanned: cfg.scanned,
    postings_added: jobsFound.length,
    last_researched_at: new Date().toISOString(),
    fit_summary: cfg.fitSummary,
    why_fit: cfg.whyFit,
    why_skip: cfg.whySkip,
  });
  syncExhibitorCompaniesToDashboard();
  markExhibitorTaskCompleted(cfg.companyId);
  return { companyName: cfg.companyName, reportPath, added: jobsFound.length, scanned: cfg.scanned, status: cfg.status };
}

const results = [];

// ── Reflex Aerospace ─────────────────────────────────────────────────
const reflexRoles = [
  { id: '1573331', title: 'Hardware Development Engineer', url: 'https://reflex-aerospace-gmbh.jobs.personio.de/job/1573331?language=en', location: 'Berlin, DE', score: '4.3/5', fit_summary: 'Hardware development for satellite bus — direct hardware path.' },
  { id: '2321273', title: 'Power System Engineer', url: 'https://reflex-aerospace-gmbh.jobs.personio.de/job/2321273?language=en', location: 'Berlin, DE', score: '4.1/5', fit_summary: 'Spacecraft power systems — electrical/hardware.' },
  { id: '1308990', title: 'Satellite Systems Engineer / System Architect', url: 'https://reflex-aerospace-gmbh.jobs.personio.de/job/1308990?language=en', location: 'Berlin, DE', score: '4.2/5', fit_summary: 'Satellite systems architecture — payload/systems adjacency.' },
  { id: '2700504', title: 'Senior AIT Engineer', url: 'https://reflex-aerospace-gmbh.jobs.personio.de/job/2700504?language=en', location: 'Ottobrunn, DE', score: '4.4/5', fit_summary: 'Assembly/integration/test — hands-on instrumentation/test-rig style.' },
  { id: '2649438', title: 'Systems Integration Engineer - Berlin', url: 'https://reflex-aerospace-gmbh.jobs.personio.de/job/2649438?language=en', location: 'Berlin, DE', score: '4.3/5', fit_summary: 'Systems integration — hardware bring-up and verification.' },
  { id: '2649451', title: 'Systems Integration Engineer - Ottobrunn', url: 'https://reflex-aerospace-gmbh.jobs.personio.de/job/2649451?language=en', location: 'Ottobrunn, DE', score: '4.3/5', fit_summary: 'Systems integration at Ottobrunn — AIT adjacency.' },
  { id: '2562452', title: 'Space Harness Engineer', url: 'https://reflex-aerospace-gmbh.jobs.personio.de/job/2562452?language=en', location: 'Berlin, DE', score: '3.9/5', fit_summary: 'Harness design for spacecraft — hardware manufacturing path.' },
  { id: '2588277', title: 'Structure Design Engineer - Berlin', url: 'https://reflex-aerospace-gmbh.jobs.personio.de/job/2588277?language=en', location: 'Berlin, DE', score: '3.8/5', fit_summary: 'Structures for satellite bus — adjacent manufacturing/hardware.' },
  { id: '2504276', title: 'AOCS/GNC Engineer - Munich', url: 'https://reflex-aerospace-gmbh.jobs.personio.de/job/2504276?language=en', location: 'München, DE', score: '3.7/5', fit_summary: 'AOCS/GNC — more controls/software than instrumentation; stretch.', recommendation: 'Stretch — GNC-heavy daily work' },
  { id: '2679152', title: 'Senior AOCS/GNC Engineer - Berlin', url: 'https://reflex-aerospace-gmbh.jobs.personio.de/job/2679152?language=en', location: 'Berlin, DE', score: '3.6/5', fit_summary: 'Senior GNC — stretch vs instrumentation target.', recommendation: 'Stretch — review before apply' },
].map(r => ({ ...r, notes: 'Reflex Aerospace Personio (Germany). EU work permit required.' }));

results.push(finishCompany({
  companyId: 'exhibitor-smallsat-2026-reflex-aerospace',
  companyName: 'Reflex Aerospace',
  website: 'https://www.reflexaerospace.com/',
  careersUrl: 'https://reflex-aerospace-gmbh.jobs.personio.de/?language=en',
  status: 'research_ready',
  roles: reflexRoles,
  scanned: 20,
  slug: 'reflex-aerospace',
  fitSummary: 'German smallsat OEM. Personio board enumerated; added hardware/AIT/systems integration roles.',
  whyFit: 'AIT, hardware development, systems integration match hands-on space hardware path.',
  whySkip: 'Skipped finance, BD, software-only, technicians, working-student pools.',
  reportBody: `# Exhibitor careers research: Reflex Aerospace

**Booth:** 131
**Careers:** https://reflex-aerospace-gmbh.jobs.personio.de/?language=en
**Generated:** ${new Date().toISOString()}

## Inventory
- Engineering + other departments enumerated on Personio (~20 listings).
- Added to Jobs to Consider: **${reflexRoles.length}**

## Keep
${reflexRoles.map(r => `- ${r.score} — ${r.title} (${r.location})`).join('\n')}

## Work-auth
Germany. EU work permit / visa required.
`,
}));

// ── OKAPI:Orbits ─────────────────────────────────────────────────────
// Software-heavy SSA company — no strong instrumentation keep roles; research_ready + why_skip
results.push(finishCompany({
  companyId: 'exhibitor-smallsat-2026-okapi-orbits',
  companyName: 'OKAPI:Orbits',
  website: 'https://okapiorbits.space/',
  careersUrl: 'https://okapiorbits.jobs.personio.de/?language=en',
  status: 'research_ready',
  roles: [],
  scanned: 17,
  slug: 'okapi-orbits',
  fitSummary: 'SSA/space-safety software company. ~17 Personio openings — almost all software/sales/intern. No instrumentation roles added.',
  whyFit: '',
  whySkip: 'Daily work is SSA software/backend/Java, sales, interns — not hardware/instrumentation. Unsolicited application exists for networking only.',
  reportBody: `# Exhibitor careers research: OKAPI:Orbits

**Booth:** 331
**Careers:** https://okapiorbits.jobs.personio.de/?language=en
**Generated:** ${new Date().toISOString()}

## Inventory
- Personio departments: Mission Design, Operations, Software Engineering (~9), Space Operations (~5), Other.
- Full-time engineering openings are SSA analysts / Java backend / TPM — **software & ops**, not detectors/HV/vacuum/payload hardware.

## Decision
\`research_ready\` with **0** Jobs to Consider upserts (fit gate: report only).
Optional networking: Unsolicited application — https://okapiorbits.jobs.personio.de/job/740982?language=en
`,
}));

// ── Novo Space ───────────────────────────────────────────────────────
const novoRoles = [
  { id: '38', title: 'Hardware Designer', url: 'https://novospace.bamboohr.com/careers/38', location: 'Buenos Aires, AR', score: '4.3/5', fit_summary: 'Rad-tolerant computer hardware design — electronics/FPGA adjacency.' },
  { id: '40', title: 'Embedded Systems Developer', url: 'https://novospace.bamboohr.com/careers/40', location: 'Buenos Aires, AR (Hybrid)', score: '4.0/5', fit_summary: 'Embedded for space computers — hardware-adjacent firmware.' },
  { id: '42', title: 'Mechanical/Aerospace/Aeronautical Engineer', url: 'https://novospace.bamboohr.com/careers/42', location: 'Buenos Aires, AR (Hybrid)', score: '3.9/5', fit_summary: 'Mech/aero for rad-tolerant computing product packaging/thermal.' },
].map(r => ({ ...r, notes: 'Novo Space BambooHR. Argentina-based rad-tolerant computers. Confirm relocation/visa.' }));

results.push(finishCompany({
  companyId: 'exhibitor-smallsat-2026-novo-space',
  companyName: 'Novo Space',
  website: 'https://www.novo.space/',
  careersUrl: 'https://novospace.bamboohr.com/jobs/',
  status: 'research_ready',
  roles: novoRoles,
  scanned: 7,
  slug: 'novo-space',
  fitSummary: 'Rad-tolerant space computers. BambooHR: 7 openings; added hardware/embedded/mech roles.',
  whyFit: 'Space computing hardware + embedded maps to electronics/FPGA path.',
  whySkip: 'Skipped Head of BD, Full Stack Developer, General Application, Fulfillment/Logistics.',
  reportBody: `# Exhibitor careers research: Novo Space

**Booth:** 430
**Website:** https://www.novo.space/
**Careers:** https://novospace.bamboohr.com/jobs/
**Generated:** ${new Date().toISOString()}

## Inventory
- BambooHR openings enumerated: 7
- Added: **${novoRoles.length}**

## Keep
${novoRoles.map(r => `- ${r.score} — ${r.title}`).join('\n')}

## Work-auth
Primarily Buenos Aires / Orlando logistics. Relocation/visa friction — verify each posting.
`,
}));

// ── Odysseus Space ───────────────────────────────────────────────────
const odysseusRoles = [
  { id: 'mech-thermal', title: 'Senior Mechanical & Thermal Engineer', url: 'https://www.odysseus.space/careers/mechanical-thermal-engineer', location: 'Luxembourg', score: '4.1/5', fit_summary: 'Mech/thermal for laser-comm terminals — space hardware.' },
  { id: 'systems', title: 'Systems Engineer', url: 'https://www.odysseus.space/careers/systems-engineer', location: 'Luxembourg', score: '4.2/5', fit_summary: 'Systems engineer for optical laser communication payloads.' },
  { id: 'control', title: 'Control Systems Engineer', url: 'https://www.odysseus.space/careers/control-engineer', location: 'Luxembourg', score: '3.8/5', fit_summary: 'GNC/control for laser pointing — stretch vs instrumentation.', recommendation: 'Stretch — GNC-heavy' },
].map(r => ({ ...r, notes: 'Odysseus Space (Luxembourg) laser optical comms. EU work authorization.' }));

results.push(finishCompany({
  companyId: 'exhibitor-smallsat-2026-odysseus-space',
  companyName: 'Odysseus Space',
  website: 'https://www.odysseus.space/',
  careersUrl: 'https://www.odysseus.space/careers',
  status: 'research_ready',
  roles: odysseusRoles,
  scanned: 4,
  slug: 'odysseus-space',
  fitSummary: 'Laser optical space communications (Luxembourg). 4 openings; added mech/thermal + systems; skipped backend software.',
  whyFit: 'Optical laser-comm payload hardware + systems engineering.',
  whySkip: 'Backend Engineer (Go/cloud) is software-platform daily work.',
  reportBody: `# Exhibitor careers research: Odysseus Space

**Booth:** 231
**Careers:** https://www.odysseus.space/careers
**Generated:** ${new Date().toISOString()}

## Inventory
- Open positions: 4 (mech/thermal, systems, backend, control)
- Added: **${odysseusRoles.length}**

## Keep
${odysseusRoles.map(r => `- ${r.score} — ${r.title}`).join('\n')}

## Skipped
- Backend Engineer (Distributed Systems) — software platform
`,
}));

// ── Rohde & Schwarz ──────────────────────────────────────────────────
const rohdeRoles = [
  {
    id: '15101',
    title: 'System Architect (m/w/d) Space Systems',
    url: 'https://jobs.rohde-schwarz.com/en_US/careers/JobDetail/System-Architect/15101',
    location: 'Dresden, DE',
    score: '4.5/5',
    fit_summary: 'Space systems architect at T&M giant — RF/space measurement systems.',
  },
  {
    id: '1606530',
    title: 'RF Systems Engineer (m/f/d) Space and Satellite Communications',
    url: 'https://www.rohde-schwarz.com/ch/karriere/stellenangebote/rf-systems-engineer-m-f-d-space-and-satellite-communications_251563-1606530.html',
    location: 'Europe (R&S space/satcom)',
    score: '4.6/5',
    fit_summary: 'RF systems for space/satcom — core instrumentation/RF measurement adjacency.',
  },
  {
    id: '13644',
    title: 'FPGA & DSP Engineer',
    url: 'https://jobs.rohde-schwarz.com/careers/ApplicationMethods?jobId=13644',
    location: 'Singapore',
    score: '4.4/5',
    fit_summary: 'FPGA/DSP for RF measurement instruments — direct FPGA + RF instrument path.',
  },
  {
    id: '1636929',
    title: 'Signal Processing Engineer Signal Analysis (m/w/d)',
    url: 'https://www.rohde-schwarz.com/us/career/jobs/signal-processing-engineer-signal-analysis-m-w-d_251563-1636929.html',
    location: 'Germany (R&S board)',
    score: '4.0/5',
    fit_summary: 'Signal analysis for T&M — measurement/signal-chain adjacency.',
  },
  {
    id: 'app-denver',
    title: 'Application Engineer - Denver',
    url: 'https://jobs.rohde-schwarz.com/',
    location: 'Denver, CO (US)',
    score: '4.2/5',
    fit_summary: 'US application engineer for T&M instruments — customer measurement systems.',
    notes: 'Confirm exact JD URL on jobs.rohde-schwarz.com jobboard filter US/Denver before apply. From Target Companies exhibitor clear-queue.',
  },
].map(r => ({
  ...r,
  notes: r.notes || 'Rohde & Schwarz global jobboard (~560–600 openings). Prefer space/RF/FPGA/measurement; verify location + sponsorship.',
}));

results.push(finishCompany({
  companyId: 'exhibitor-smallsat-2026-rohde-and-schwarz',
  companyName: 'Rohde & Schwarz',
  website: 'https://www.rohde-schwarz.com/',
  careersUrl: 'https://jobs.rohde-schwarz.com/',
  status: 'research_ready',
  roles: rohdeRoles,
  scanned: 585,
  slug: 'rohde-and-schwarz',
  fitSummary: 'Global T&M / RF instrumentation OEM. ~585 openings on jobs.rohde-schwarz.com; added high-fit space/RF/FPGA/application roles (not the full board dump).',
  whyFit: 'RF measurement instruments, space systems, FPGA/DSP for T&M — strongest instrumentation company in this chunk.',
  whySkip: 'Skipped sales/account managers, HR, apprenticeships, pure IT/security, and most non-RF software roles from the 500+ board.',
  reportBody: `# Exhibitor careers research: Rohde & Schwarz

**Booth:** 308
**Careers jobboard:** https://jobs.rohde-schwarz.com/ (~585 offerings at research time)
**US mirror:** https://www.rohde-schwarz.com/us/career/jobs/career-jobboard_251573.html
**Generated:** ${new Date().toISOString()}

## Inventory
- Full board is large (500+). Enumerated via official jobboard + targeted space/RF/FPGA search.
- **Did not** spam Jobs to Consider with every opening — only strong instrumentation/space/RF/FPGA fits.

## Keep / add
${rohdeRoles.map(r => `- ${r.score} — ${r.title} — ${r.url}`).join('\n')}

## Work-auth
Mix of DE/EU/SG/US. US roles may prefer citizens for some defense-adjacent work; EU T&M R&D often more accessible — verify each JD.
`,
}));

console.log(JSON.stringify({ ok: true, results }, null, 2));
