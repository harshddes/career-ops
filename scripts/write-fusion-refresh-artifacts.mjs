#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${contents.trim()}\n`, 'utf-8');
}

function appendOnce(path, marker, contents) {
  const current = existsSync(path) ? readFileSync(path, 'utf-8') : '';
  if (current.includes(marker)) return;
  writeFileSync(path, `${current.trim()}\n\n${contents.trim()}\n`, 'utf-8');
}

const researchMd = `
# Fusion Company Research - First Light, General Fusion, Kyoto Fusioneering

**Compiled for:** Harsh Desai (M.Eng Space Systems, UMich | F-1 OPT)  
**Last refreshed:** 2026-06-28  
**Sources:** Parallel CLI extracts for Kyoto Fusioneering and First Light Fusion; General Fusion ADP requisitions API; prior deep research \`trun_dd47611047ba4519a961be457b396d4a\`.

---

## Executive Summary

- **General Fusion now has the strongest actionable set**: 15 Richmond BC roles, including Research Technician, Mechanical Engineer - Diagnostics, Electrical Engineer, Controls Engineer, Diagnostic Physicist, and Diagnostic Physicist - Thomson Scattering.
- **Kyoto Fusioneering changed materially**: the old Electrical I&C and Cryogenics/Vacuum postings are no longer on the current open-positions page. The current technical opening is **Engineer (Fuel Cycle / Plant Technology)** in Karlsruhe.
- **First Light Fusion does have open roles**, but they are Senior/Lead HPC Engineer and IT Systems Engineer. The HPC role has some simulation-infrastructure adjacency; the IT role is a skip.
- **Dashboard bug found and fixed in code**: prior HRMOS/ADP/Hailey liveness checks treated JS-heavy or thin pages as closed. The refreshed script marks current roles active and keeps stale roles as closed history.
- **Best current application order**: General Fusion Research Technician, Kyoto Fusioneering Engineer, General Fusion Mechanical Engineer - Diagnostics, General Fusion Electrical Engineer/Controls as stretch backups.

---

## Current Role Ranking

| Rank | Score | Company | Role | Location | Verdict |
|---|---:|---|---|---|---|
| 1 | 4.2/5 | General Fusion | Research Technician | Richmond, BC | Apply if technician title is acceptable; best HV/plasma hands-on entry |
| 2 | 4.0/5 | Kyoto Fusioneering | Engineer (Fuel Cycle / Plant Technology) | Karlsruhe, DE | Apply; current best Kyoto target |
| 3 | 3.9/5 | General Fusion | Mechanical Engineer - Diagnostics | Richmond, BC | Apply; still active and strong |
| 4 | 3.8/5 | General Fusion | Electrical Engineer | Richmond, BC | Stretch; excellent DAQ/signal-chain overlap but senior |
| 5 | 3.7/5 | General Fusion | Controls Engineer | Richmond, BC | Backup; PLC/functional safety gap |
| 6 | 3.5/5 | General Fusion | Diagnostic Physicist | Richmond, BC | ITAR/work-permit inquiry first |
| 7 | 3.2/5 | General Fusion | Diagnostic Physicist - Thomson Scattering | Richmond, BC | Network/monitor; 5+ years laser diagnostics gap |
| 8 | 2.8/5 | General Fusion | Plasma Physicist | Richmond, BC | Skip for application; use for intel |
| 9 | 2.6/5 | First Light Fusion | Senior/Lead HPC Engineer | Yarnton, UK | Monitor only unless pivoting to HPC |
| 10 | 2.0/5 | Kyoto Fusioneering | Project Manager | Karlsruhe, DE | Skip; native German + PM tenure |
| 11 | 1.8/5 | First Light Fusion | IT Systems Engineer | Yarnton, UK | Skip |

---

## Kyoto Fusioneering

| Field | Current Finding |
|---|---|
| Careers page | https://kyotofusioneering.com/en/open_positions |
| Open roles | Engineer (KFEU, Germany-based); Project Manager (KFEU, Germany-based) |
| Strongest target | Engineer (Fuel Cycle / Plant Technology) |
| Geography | Karlsruhe, Germany |
| Cover letter | Not explicitly required in extract, but prepare one |
| Work authorization | German work permit / residence permit sponsorship, not H-1B |

### Engineer (Fuel Cycle / Plant Technology)

Role sits at the intersection of mechanical design, process engineering, and fusion technology development. It asks for CAD design, drawings, bills of materials, technical specifications, process simulations, system models, structural/flow analysis, qualification documentation, test plans, supplier engagement, and external test facility support. Essential requirements include BS/MS, 3+ years relevant experience, CAD drawing production, DFM, process design/P&ID, chemical engineering unit operations, and Microsoft tools. Desirables include I&C engineering, nuclear/fusion qualification, tritium fuel cycle systems, ASPEN, system model validation, ANSYS/FLUENT/OpenFOAM, and project management.

**Fit:** Strong enough to apply because it accepts mechanical/process profiles and names I&C/ANSYS/CFD as desirable. The gap is process/P&ID and tritium-specific design.

### Project Manager

Requires 5+ years project management, native German, client/supplier project control, PMBOK, multiple simultaneous projects, and review of mechanical design drawings. Low fit.

---

## General Fusion

| Field | Current Finding |
|---|---|
| Careers page | https://generalfusion.com/careers |
| Active roles | 15 Richmond BC roles verified through ADP API |
| Strongest targets | Research Technician; Mechanical Engineer - Diagnostics; Electrical Engineer; Controls Engineer |
| Work authorization | Canadian work permit / LMIA path; ask early |
| Export control | Unknown; ask HR before investing heavily in diagnostics roles |

### Current open roles from ADP

| Role | Salary CAD | Fit |
|---|---:|---|
| Research Technician | 74,000-88,000 | 4.2/5 |
| Electrical Engineer | 140,000-170,000 | 3.8/5 stretch |
| Analytical Mechanical Engineer | 95,000-115,000 | 3.2/5 |
| Diagnostic Physicist - Thomson Scattering | 115,000-135,000 | 3.2/5 |
| Plasma Physicist | 121,000-142,000 / 135,000-165,000 | 2.8/5 |
| Mechanical Engineer | 80,000-110,000 | 3.4/5 |
| Systems Engineer | 130,000-160,000 | 3.0/5 |
| Controls Engineer | 90,000-110,000 | 3.7/5 |
| Mechanical Engineer, Systems and Partnerships | 95,000-115,000 | 3.0/5 |
| Business Development Support Engineer | 95,000-115,000 | 2.4/5 |
| Diagnostic Physicist | 115,000-135,000 | 3.5/5 |
| Materials Engineer | 90,000-110,000 | 2.7/5 |
| Mechanical Engineer - Diagnostics | 78,000-95,000 | 3.9/5 |
| Future Opportunities | n/a | networking |

### Best GF target: Research Technician

The role supports high-voltage, electrical, and mechanical equipment for a large-scale plasma injector, including maintenance, troubleshooting, assembly, installation, testing, lithium handling, inventory, and safety in high-voltage/high-energy/chemical hazard environments. This maps directly to LVACCS HV test workflows, DAQ operations, vacuum/plasma lab discipline, and hands-on prototype work.

---

## First Light Fusion

| Field | Current Finding |
|---|---|
| Careers page | https://firstlightfusion.careers.haileyhr.app/ |
| Open roles | Senior/Lead HPC Engineer; IT Systems Engineer |
| Cover letter | Required by Hailey application form |
| Work authorization | Right to Work in UK question required |
| Sponsor signal | Prior research found UK Skilled Worker sponsor license |

### Senior/Lead HPC Engineer

Supports an air-gapped HPC cluster of over 10,000 cores. Requires Linux, high-performance storage, high-speed networking, scheduling systems, shell/Python scripting, Git, and simulation-requirements-to-platform implementation. Desirable: MPI, C++, Fortran, Ansible, profiling, Singularity/Apptainer, air-gapped networks. Low fit but real computational infrastructure adjacency.

### IT Systems Engineer

Mixed Linux/Windows IT support, Microsoft 365, endpoint/security tooling, user support, segmented networks, CAD/lab support. Skip.

---

## Strategy

1. Apply to **General Fusion Research Technician** first if the technician title is acceptable. It is the cleanest match to HV plasma lab execution.
2. Apply to **Kyoto Fusioneering Engineer** with a current, not stale, fuel-cycle/process-engineering resume. Do not reuse the old I&C cover letter without edits.
3. Keep **General Fusion Mechanical Engineer - Diagnostics** as the engineering-title target.
4. Use **General Fusion Electrical Engineer** and **Controls Engineer** as stretch backups.
5. Send the **General Fusion Diagnostic Physicist ITAR/work-permit inquiry** before applying to spectroscopy roles.
6. First Light Fusion is visible on the dashboard, but not a priority application track.
`;

write('WEB-TRACKER/research/fusion-firstlight-generalfusion-kyoto-2026.md', researchMd);

const fusionCompanies = {
  version: 1,
  track: 'fusion-three-company-sweep',
  generated_at: '2026-06-28T19:16:00.000Z',
  research_md: 'WEB-TRACKER/research/fusion-firstlight-generalfusion-kyoto-2026.md',
  companies: [
    {
      id: 'general-fusion',
      name: 'General Fusion',
      location: 'Richmond, BC, Canada',
      region: 'canada',
      tier: 1,
      sector_badge: 'MTF Fusion',
      summary: 'Magnetized Target Fusion company operating LM26 and hiring across diagnostics, controls, electrical, plasma, and lab technician roles.',
      why_fit: 'Best current volume of relevant roles: high-voltage plasma injector support, diagnostic mechanical interfaces, DAQ/signal chains, controls, and spectroscopy.',
      target_roles: ['Research Technician', 'Mechanical Engineer - Diagnostics', 'Electrical Engineer', 'Controls Engineer'],
      careers_url: 'https://generalfusion.com/careers',
      website_url: 'https://generalfusion.com',
      work_auth: { status: 'n_a_canada', notes: 'Canadian work permit / LMIA path. Ask early about export-control eligibility for non-US-person candidates.' },
      tags: ['fusion', 'Canada permit', 'diagnostics', 'HV/plasma'],
      jobs_found: [
        'general-fusion-research-technician-richmond',
        'general-fusion-mechanical-engineer-diagnostics-richmond',
        'general-fusion-electrical-engineer-richmond',
        'general-fusion-controls-engineer-richmond',
        'general-fusion-diagnostic-physicist-richmond',
        'general-fusion-diagnostic-physicist-thomson-scattering-richmond',
        'general-fusion-plasma-physicist-567333-richmond',
        'general-fusion-mechanical-engineer-richmond',
      ],
    },
    {
      id: 'kyoto-fusioneering',
      name: 'Kyoto Fusioneering',
      location: 'Karlsruhe, Germany; UK entity in Oxford',
      region: 'eu_ch',
      tier: 1,
      sector_badge: 'Fusion Plant Tech',
      summary: 'Fusion plant technology supplier focused on fuel cycle, gyrotrons, thermal/exhaust, and integrated systems.',
      why_fit: 'Current KFEU Engineer role matches mechanical design, qualification, ANSYS/CFD, test plans, and has I&C as a desirable bridge.',
      target_roles: ['Engineer (Fuel Cycle / Plant Technology)', 'Project Manager'],
      careers_url: 'https://kyotofusioneering.com/en/open_positions',
      website_url: 'https://kyotofusioneering.com',
      work_auth: { status: 'n_a_eu', notes: 'German work permit / residence permit sponsorship required. UK sponsor license does not apply to Karlsruhe roles.' },
      tags: ['fusion', 'Germany permit', 'fuel cycle', 'I&C desirable'],
      jobs_found: ['kyoto-fusioneering-engineer-fuel-cycle-karlsruhe', 'kyoto-fusioneering-project-manager-karlsruhe'],
    },
    {
      id: 'first-light-fusion',
      name: 'First Light Fusion',
      location: 'Yarnton, Oxfordshire, UK',
      region: 'uk',
      tier: 3,
      sector_badge: 'Projectile Fusion',
      summary: 'Projectile inertial fusion company with current openings in HPC and IT infrastructure.',
      why_fit: 'Open roles are real but do not match instrumentation. HPC has weak simulation-support adjacency; IT Systems Engineer is a skip.',
      target_roles: ['Senior / Lead HPC Engineer', 'IT Systems Engineer'],
      careers_url: 'https://firstlightfusion.careers.haileyhr.app/',
      website_url: 'https://firstlightfusion.com',
      work_auth: { status: 'n_a_eu', notes: 'UK Right to Work question required. Prior research found UK Skilled Worker sponsor license.' },
      tags: ['fusion', 'UK skilled worker possible', 'HPC low fit'],
      jobs_found: ['first-light-fusion-senior-lead-hpc-engineer-yarnton', 'first-light-fusion-it-systems-engineer-yarnton'],
    },
  ],
};

write('WEB-TRACKER/data/fusion-target-companies.json', JSON.stringify(fusionCompanies, null, 2));

const report025 = `
# Evaluation: Kyoto Fusioneering -- Engineer (Fuel Cycle / Plant Technology)

**Date:** 2026-06-28  
**Archetype:** Fusion Plant Engineering / Mechanical + Process Systems  
**Score:** 4.0/5  
**URL:** https://hrmos.co/pages/kfandsle/jobs/2230986973781717052  
**Legitimacy:** High Confidence  
**Visa:** German work permit / residence permit sponsorship required  
**PDF:** output/kyoto-fusioneering/cv-harsh-desai-kyoto-fusioneering-engineer-fuel-cycle-2026-06-28.pdf

---

## A) Role Summary

| Field | Value |
|---|---|
| **Archetype** | Fusion fuel-cycle component engineering |
| **Domain** | Mechanical design, process systems, qualification, tritium fuel cycle, CAD, FEA/CFD |
| **Function** | Design, model, qualify, document, and test fusion fuel-cycle components |
| **Seniority** | 3+ years relevant professional experience |
| **Remote** | On-site, Karlsruhe, Germany |
| **TL;DR** | Current best Kyoto target because it accepts mechanical/process profiles and names I&C, ANSYS, FLUENT, and OpenFOAM as useful bridges. |

## B) CV Match

| JD Requirement | CV Match | Evidence |
|---|---|---|
| BS/MS engineering | Strong | M.Eng Space Systems + B.Tech Mechanical |
| CAD design and drawings | Partial-strong | SolidWorks, Fusion 360, Inventor; competition mechanisms |
| Structural/flow analysis | Strong adjacent | ANSYS, OpenFOAM, CFD-backed rocket work |
| Qualification documentation/test plans | Strong | TestBedz and LVACCS test workflow documentation |
| I&C desirable | Strong adjacent | LVACCS DAQ/HV automation; FPGA detector readout |
| P&ID/process design | Gap | No direct process plant/P&ID project |
| Tritium/fuel cycle | Gap | Fusion transition; no tritium-specific work |

## C) Level and Strategy

Apply with an honest pivot: mechanical engineering + plasma instrumentation + test qualification, not tritium-process veteran cosplay. The sentence to use: "My strongest immediate contribution is in testable hardware design, qualification documentation, simulation-backed iteration, and I&C-aware experimental systems."

## D) Compensation and Demand

Salary is negotiable. This is a Karlsruhe on-site role in a fusion supplier expanding European plant-technology work.

## E) Personalization Plan

Lead with LVACCS, TestBedz, PentaShield, ANSYS/OpenFOAM, and calibration projects. Reduce the old I&C-only framing.

## F) Interview Plan

| Requirement | Story |
|---|---|
| Qualification and test plans | TestBedz + LVACCS repeatable workflow |
| CAD/analysis | CANSAT mechanisms + PentaShield/ANSYS |
| I&C desirable | Python/PyVISA DAQ and SSD FPGA readout |
| Fusion-adjacent ramp | Plasma diagnostics calibration series |

## G) Posting Legitimacy

**Assessment:** High Confidence - active HRMOS posting verified by Parallel extract on 2026-06-28.
`;

const report026 = `
# Evaluation: General Fusion -- Research Technician

**Date:** 2026-06-28  
**Archetype:** Fusion Plasma Test Technician / HV Experimental Hardware  
**Score:** 4.2/5  
**URL:** https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=3196ba6f-d49c-4493-9290-3d91489bdfa9&ccId=19000101_000001&type=JS&lang=en_CA&jobId=567646  
**Legitimacy:** High Confidence  
**Visa:** Canadian work permit / LMIA sponsorship required; confirm export-control scope  
**PDF:** output/general-fusion/cv-harsh-desai-general-fusion-research-technician-2026-06-28.pdf

---

## A) Role Summary

| Field | Value |
|---|---|
| **Archetype** | HV plasma injector research technician |
| **Domain** | High-voltage pulsed power, experimental equipment, lithium handling, mechanical/electrical troubleshooting |
| **Function** | Maintain, troubleshoot, assemble, install, and test plasma injector equipment |
| **Seniority** | 2-5 years shop/lab or hands-on mechanical equipment experience |
| **Remote** | On-site Richmond, BC; occasional shift work |
| **Comp** | $74,000-$88,000 CAD |
| **TL;DR** | Best current GF entry point if Harsh accepts technician title: it buys exactly the HV-safe plasma lab discipline he has been building. |

## B) CV Match

| JD Requirement | CV Match | Evidence |
|---|---|---|
| HV/high-energy safety | Strong | 1300 V LVACCS discharge-box FMEA and test sequencing |
| Lab/shop troubleshooting | Strong adjacent | Plasma-source test workflow, CANSAT hardware, rocket hardware |
| Assemble/install/test equipment | Strong adjacent | LVACCS, CANSAT, Spaceport America Cup |
| Equipment records and parts | Partial | TestBedz documentation; lab workflow records |
| Lithium handling | Gap | No direct lithium/chemical-hazard experience |
| 2-5 years technician clock | Partial | Graduate lab density, not classic technician tenure |

## C) Level and Strategy

This is the practical entry point. The title is less glamorous than "physicist," which is exactly why it may work. Apply if hands-on fusion machine exposure matters more than title vanity.

## D) Compensation and Demand

$74K-$88K CAD. This is below some engineering-title GF roles but above many entry lab technician bands and gives direct machine exposure.

## E) Personalization Plan

Lead with LVACCS HV workflow, vacuum/plasma operations, hardware safety, and DAQ repeatability. Keep FPGA as secondary.

## F) Interview Plan

| Requirement | Story |
|---|---|
| HV equipment safety | LVACCS FMEA and remote ignition |
| Troubleshooting prototype systems | Plasma-source test automation |
| Clean lab records | 98.6% synchronized logging coverage |
| Mechanical hands-on | CANSAT / Spaceport America Cup |

## G) Posting Legitimacy

**Assessment:** High Confidence - active ADP requisition 567646 verified 2026-06-28.
`;

const report027 = `
# Evaluation: General Fusion -- Electrical Engineer

**Date:** 2026-06-28  
**Archetype:** Fusion DAQ / Electrical Signal Chain  
**Score:** 3.8/5  
**URL:** https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=3196ba6f-d49c-4493-9290-3d91489bdfa9&ccId=19000101_000001&type=JS&lang=en_CA&jobId=567505  
**Legitimacy:** High Confidence  
**Visa:** Canadian work permit / LMIA sponsorship required  
**PDF:** not generated (stretch target)

---

## A) Role Summary

Senior electrical role for controls, DAQ pipelines, analog/digital signal chains, grounding, shielding, isolation, PCB lifecycle, and reliable operation in noisy high-voltage pulsed-power environments.

## B) Fit

Strong conceptual overlap with SSD readout, ADC sizing, FPGA workflow, noise constraints, and LVACCS HV/DAQ logging. Main gap is senior electrical ownership: PCB design, production release, and deep electrical engineering authority.

## G) Posting Legitimacy

High Confidence - active ADP requisition 567505 verified 2026-06-28.
`;

const report028 = `
# Evaluation: General Fusion -- Controls Engineer

**Date:** 2026-06-28  
**Archetype:** Fusion Controls / DAQ / HV Safety  
**Score:** 3.7/5  
**URL:** https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=3196ba6f-d49c-4493-9290-3d91489bdfa9&ccId=19000101_000001&type=JS&lang=en_CA&jobId=567023  
**Legitimacy:** High Confidence  
**Visa:** Canadian work permit / LMIA sponsorship required  
**PDF:** not generated (backup target)

---

## A) Role Summary

Controls architecture across high-voltage pulsed power, vacuum, gas handling, diagnostics, PLCs, motion control, DAQ, HMIs, P&IDs, safety systems, and functional safety standards.

## B) Fit

DAQ/HV/vacuum/plasma system integration overlaps well with LVACCS. Gaps are PLC, industrial safety standards, and mature controls architecture ownership.

## G) Posting Legitimacy

High Confidence - active ADP requisition 567023 verified 2026-06-28.
`;

const report029 = `
# Evaluation: First Light Fusion -- Senior / Lead HPC Engineer

**Date:** 2026-06-28  
**Archetype:** Scientific HPC Infrastructure  
**Score:** 2.6/5  
**URL:** https://firstlightfusion.careers.haileyhr.app/en-GB/job/74f8ee24-52bc-47fc-ba86-52693720bce9/2fc070df-bf40-4a36-b453-86858b7e785b/7b07d05d-f55f-4e5f-9d3b-e2e5baec7eee  
**Legitimacy:** High Confidence  
**Visa:** UK right-to-work question required; prior research found Skilled Worker sponsor license  
**PDF:** not generated

---

## A) Role Summary

Supports a 10,000+ core air-gapped HPC cluster for computational physics and data-driven engineering: Linux, storage, networking, schedulers, shell/Python, Git, CI/builds, Ansible, MPI/C++/Fortran desirable.

## B) Fit

Harsh has HPC user experience from Great Lakes and simulation work, but this is platform operations, not instrumentation. Apply only if pivoting away from lab hardware.

## G) Posting Legitimacy

High Confidence - Hailey HR posting and required cover-letter/right-to-work fields verified 2026-06-28.
`;

write('reports/025-kyoto-fusioneering-engineer-fuel-cycle-2026-06-28.md', report025);
write('reports/026-general-fusion-research-technician-2026-06-28.md', report026);
write('reports/027-general-fusion-electrical-engineer-2026-06-28.md', report027);
write('reports/028-general-fusion-controls-engineer-2026-06-28.md', report028);
write('reports/029-first-light-fusion-senior-lead-hpc-engineer-2026-06-28.md', report029);

const addendum = (status) => `
## 2026-06-28 Verification Addendum

${status}
`;

appendOnce('reports/015-kyoto-fusioneering-electrical-ic-engineer-2026-06-14.md', '2026-06-28 Verification Addendum', addendum('This posting is no longer listed on Kyoto Fusioneering current openings. The current technical KFEU target is `Engineer (Fuel Cycle / Plant Technology)` at `reports/025-kyoto-fusioneering-engineer-fuel-cycle-2026-06-28.md`. Keep this old I&C report as historical strategy only.'));
appendOnce('reports/016-kyoto-fusioneering-cryogenics-vacuum-engineer-2026-06-14.md', '2026-06-28 Verification Addendum', addendum('This posting is no longer listed on Kyoto Fusioneering current openings. Do not apply with this old cover letter unless the role reappears.'));
appendOnce('reports/017-general-fusion-mechanical-engineer-diagnostics-2026-06-14.md', '2026-06-28 Verification Addendum', addendum('Still active in the General Fusion ADP API as requisition 565684. It remains a strong engineering-title target, but Research Technician is now the strongest practical entry point.'));
appendOnce('reports/018-general-fusion-diagnostic-physicist-2026-06-14.md', '2026-06-28 Verification Addendum', addendum('Still active in the General Fusion ADP API as requisition 566419. A new `Diagnostic Physicist - Thomson Scattering` role is also active, but both spectroscopy roles remain conditional on export-control and work-permit clarification.'));

const baseCss = `
  <style>
    body { margin: 0; color: #16202a; background: #fff; font-family: Calibri, Arial, sans-serif; font-size: 10.7px; line-height: 1.43; }
    h1 { margin: 0; font-size: 22px; line-height: 1; color: #101820; }
    .rule { height: 2px; margin: 5px 0 5px; background: linear-gradient(to right, hsl(187,74%,32%), hsl(270,70%,45%)); }
    .contact { color: #34465a; font-size: 9.6px; margin-bottom: 18px; }
    p { margin: 0 0 10px; }
    .date { margin-bottom: 14px; }
    .recipient { margin-bottom: 14px; }
    .signature { margin-top: 14px; }
  </style>`;

function letter(title, recipient, body) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${baseCss}</head>
<body><main>
<header><h1>Harsh Desai</h1><div class="rule"></div><div class="contact">Ann Arbor, MI, USA | harshdes@umich.edu | +1-734-548-1080<br>Portfolio: https://harshddes.github.io/ | LinkedIn: https://www.linkedin.com/in/harshddes/</div></header>
<p class="date">June 28, 2026</p>
<p class="recipient">${recipient}</p>
<p>Dear Hiring Team,</p>
${body}
<p>Thank you for your consideration.</p>
<p class="signature">Sincerely,<br>Harsh Desai</p>
</main></body></html>`;
}

write('output/kyoto-fusioneering/cover-letter-harsh-desai-kyoto-fusioneering-engineer-fuel-cycle-2026-06-28.html', letter(
  'Harsh Desai - Kyoto Fusioneering Engineer Cover Letter',
  'Kyoto Fusioneering Hiring Team<br>KFEU Office, Karlsruhe, Germany',
  `
<p>I am applying for the Engineer role in Karlsruhe because the current posting sits in the exact middle ground I am trying to build into: mechanical design, process-aware engineering, qualification documentation, test plans, and fusion hardware that must eventually survive real plant constraints.</p>
<p>My background is not tritium fuel-cycle ownership yet. I am coming from mechanical engineering and space plasma instrumentation, where I have been building the habits that transfer into this role: simulation-backed design decisions, controlled test workflows, high-voltage-safe lab operation, documentation discipline, and instrumentation-aware hardware thinking.</p>
<p>At the University of Michigan Space Physics Research Lab, I work on the LVACCS hollow-cathode plasma-source test rig, combining HV discharge-box FMEA, Python/PyVISA control, DAQ synchronization, and repeatable plasma-source operation. I have also built requirement-flowdown logic for spacecraft environmental testing and worked through detector calibration and ion-optics projects where the engineering deliverable was not just a result, but a defensible measurement chain.</p>
<p>Your role asks for CAD, engineering drawings, qualification documentation, structural or flow analysis, supplier/test-facility coordination, and I&C as a desirable bridge. That is why I am interested: I can contribute first on testable design documentation, simulation-supported iteration, and I&C-aware experimental hardware while ramping on P&ID, process systems, and tritium fuel-cycle specifics.</p>
<p>I am willing to relocate to Karlsruhe and would require employer support for a German work permit / residence permit for employment.</p>`
));

write('output/general-fusion/cover-letter-harsh-desai-general-fusion-research-technician-2026-06-28.html', letter(
  'Harsh Desai - General Fusion Research Technician Cover Letter',
  'General Fusion Hiring Team<br>Richmond, BC, Canada',
  `
<p>I am applying for the Research Technician role because it is the most direct match I found in the current General Fusion openings: high-voltage equipment, plasma injector hardware, hands-on troubleshooting, assembly, testing, safety discipline, and experimental lab ownership.</p>
<p>I am finishing a space systems engineering path, but my recent work has been much more bench-and-machine than abstract. At Michigan's Space Physics Research Lab, I am characterizing the LVACCS hollow-cathode plasma-source test rig, including HV discharge-box protection analysis, remote ignition sequencing, DAQ logging, and repeatable plasma-source workflows. That work taught me the boring truth of serious labs: if the hardware is not safe, documented, and repeatable, the physics does not matter.</p>
<p>The General Fusion posting mentions high-voltage pulsed-power systems, experimental apparatus, large equipment, shop/lab troubleshooting, inventory discipline, and chemical hazards around lithium. I do not have lithium handling experience yet, so I would need training there. But I do have the core posture for this work: respect the hazard, understand the equipment, keep the setup clean, record what changed, and help the team keep the machine available during experiments.</p>
<p>I would be excited to contribute to LM26 from the practical side: maintaining equipment, helping assemble and test new hardware, supporting plasma operations, and learning the fusion-specific safety stack from people who already live it.</p>
<p>I am willing to relocate to Richmond and would need guidance on Canadian work-permit sponsorship. Because I am not a U.S. person, I would also appreciate early confirmation on any export-control constraints.</p>`
));

write('output/kyoto-fusioneering/application-email-kyoto-fusioneering-engineer-fuel-cycle-2026-06-28.md', `
Subject: Engineer (KFEU, Karlsruhe) - Harsh Desai

Dear Kyoto Fusioneering Hiring Team,

I am applying for the Engineer role at the KFEU office in Karlsruhe. My background combines mechanical engineering, space systems, plasma-source test workflows, DAQ/HV automation, detector calibration, and simulation-backed hardware reasoning.

Attached:
- CV: \`output/kyoto-fusioneering/cv-harsh-desai-kyoto-fusioneering-engineer-fuel-cycle-2026-06-28.pdf\`
- Cover letter: \`output/kyoto-fusioneering/cover-letter-harsh-desai-kyoto-fusioneering-engineer-fuel-cycle-2026-06-28.pdf\`

Project links:
- Portfolio: https://harshddes.github.io/
- SSD readout report: https://drive.google.com/file/d/1cb_1Vx5w__6OxFU2j2_Tn59uFXkM9p9M/view?usp=sharing
- Ion-optics and calibration bundle: https://drive.google.com/drive/folders/1jq9MJzKta6NcMG_vUZo8V0y0Yu7kmSK6?usp=sharing

I am willing to relocate to Karlsruhe and would require employer support for a German work permit / residence permit for employment.

Best regards,
Harsh Desai
harshdes@umich.edu
+1-734-548-1080
https://www.linkedin.com/in/harshddes/
`);

write('output/general-fusion/application-email-general-fusion-research-technician-2026-06-28.md', `
Subject: Research Technician - Harsh Desai

Dear General Fusion Hiring Team,

I am applying for the Research Technician role in Richmond, BC. My background is in plasma-source test workflows, HV-safe lab operation, DAQ automation, detector calibration, and hands-on experimental hardware support at the University of Michigan.

Attached:
- CV: \`output/general-fusion/cv-harsh-desai-general-fusion-research-technician-2026-06-28.pdf\`
- Cover letter: \`output/general-fusion/cover-letter-harsh-desai-general-fusion-research-technician-2026-06-28.pdf\`

Portfolio: https://harshddes.github.io/

I am willing to relocate to Richmond and would appreciate guidance on Canadian work-permit sponsorship. Because I am not a U.S. person, I would also like to confirm whether export-control restrictions would affect eligibility for this role.

Best regards,
Harsh Desai
harshdes@umich.edu
+1-734-548-1080
`);

const resumeHeader = (paper = 'a4paper') => `\\documentclass[10pt,${paper}]{article}
\\usepackage[${paper},left=0.46in,right=0.46in,top=0.34in,bottom=0.30in]{geometry}
\\usepackage{fontspec}
\\setmainfont{Tinos}
\\usepackage{xcolor}
\\usepackage{hyperref}
\\usepackage{enumitem}
\\usepackage{ragged2e}
\\usepackage{microtype}
\\definecolor{resumeBlue}{RGB}{31,78,121}
\\definecolor{linkBlue}{RGB}{0,0,238}
\\hypersetup{colorlinks=true,urlcolor=linkBlue,linkcolor=linkBlue}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0pt}
\\AtBeginDocument{\\fontsize{9.25pt}{10.15pt}\\selectfont}
\\newcommand{\\namefont}{\\fontsize{15.8pt}{17.0pt}\\bfseries\\color{resumeBlue}}
\\newcommand{\\sectionfont}{\\fontsize{10.9pt}{11.4pt}\\bfseries}
\\newcommand{\\headingfont}{\\bfseries}
\\newcommand{\\blueheading}{\\bfseries\\color{resumeBlue}}
\\newcommand{\\sectiontitle}[1]{\\vspace{4.2pt}{\\sectionfont #1}\\par\\vspace{1pt}\\rule{\\textwidth}{0.95pt}\\vspace{1.8pt}}
\\newcommand{\\entryheader}[2]{\\noindent{\\headingfont #1}\\hfill{\\blueheading #2}\\par\\vspace{0.1pt}}
\\newcommand{\\roleline}[2]{\\noindent#1\\hfill#2\\par\\vspace{-0.2pt}}
\\newcommand{\\skillline}[2]{\\textbf{#1:} #2\\par\\vspace{0.4pt}}
\\setlist[itemize]{leftmargin=0.205in,labelsep=0.115in,itemsep=0.25pt,topsep=0.45pt,parsep=0pt,partopsep=0pt,label=\\raisebox{0.08ex}{\\fontsize{9.2pt}{9.2pt}\\selectfont\\textbullet},before={\\justifying}}
\\newcommand{\\resitem}[1]{\\item #1}
\\begin{document}
\\noindent{\\namefont Harsh Desai}\\hfill{Ann Arbor, MI, USA $\\mid$ \\href{mailto:harshdes@umich.edu}{harshdes@umich.edu} $\\mid$ +1-734-548-1080 $\\mid$ \\href{https://linkedin.com/in/harshddes}{LinkedIn} $\\mid$ \\href{https://harshddes.github.io}{harshddes.github.io}}\\par
\\vspace{3.8pt}`;

const resumeFooter = '\\end{document}';

write('output/kyoto-fusioneering/cv-harsh-desai-kyoto-fusioneering-engineer-fuel-cycle-2026-06-28.tex', `${resumeHeader('a4paper')}
\\noindent{\\itshape Mechanical and space systems engineer focused on plasma-source test workflows, simulation-backed hardware decisions, qualification documentation, DAQ/HV automation, and calibration-heavy experimental systems.}\\par
\\sectiontitle{EDUCATION}
\\entryheader{University of Michigan}{Ann Arbor, MI, USA}
\\roleline{Master of Engineering, Space Systems Engineering $\\mid$ GPA: 3.79/4.0}{Aug 2024--Dec 2025}
\\entryheader{Vellore Institute of Technology}{Vellore, India}
\\roleline{Bachelor of Technology, Mechanical Engineering $\\mid$ GPA: 7.78/10}{Jul 2019--Jul 2023}
\\sectiontitle{TECHNICAL SKILLS}
\\skillline{Mechanical / Analysis}{SolidWorks, Fusion 360, Autodesk Inventor, ANSYS Fluent/Mechanical, OpenFOAM, PyANSYS, CFD-backed design iteration}
\\skillline{Test / Qualification}{Requirement flowdown, test plans, DAQ synchronization, HV test safety, vacuum chamber operation, calibration documentation}
\\skillline{Instrumentation}{Python/PyVISA, Keithley DAQs and SMUs, TDK Lambda PSUs, GPIB, serial logging, FPGA readout workflow}
\\skillline{Fusion-Adjacent Tools}{SIMION, SRIM, Amptek DPPMCA, MATLAB HDL Coder, Vivado}
\\sectiontitle{RESEARCH \\& ENGINEERING EXPERIENCE}
\\entryheader{Space Physics Research Lab, University of Michigan}{Ann Arbor, MI, USA}
\\roleline{Research Assistant, LVACCS Testing Rig Characterization}{Feb 2026--Present}
\\begin{itemize}
\\resitem{Validated a 1300 V hollow-cathode plasma-source workflow by combining HV discharge-box FMEA, Python/PyVISA ignition control, PSU logging, and DAQ synchronization.}
\\resitem{Built repeatable plasma-source operation workflows that reduced manual interactions 15$\\rightarrow$5 and achieved 98.6\\% synchronized logging coverage.}
\\end{itemize}
\\entryheader{Space Physics Research Lab, University of Michigan}{Ann Arbor, MI, USA}
\\roleline{Summer Intern, TestBedz Spacecraft Qualification Platform}{May 2025--Jul 2025}
\\begin{itemize}
\\resitem{Implemented requirement-flowdown and facility-routing logic for TVAC, vibration, and EMI qualification, mapping hardware profiles to facility operational limits across 6 workflows.}
\\end{itemize}
\\entryheader{PentaShield Technologies}{Vadodara, India}
\\roleline{Project Intern, CFD / Optimization Workflow}{Jun 2024--Aug 2024}
\\begin{itemize}
\\resitem{Automated parametric CFD and geometry-preprocessing workflows in ANSYS/PyFluent and PyOptiSLang for design validation and optimization studies.}
\\end{itemize}
\\sectiontitle{SELECTED TECHNICAL PROJECTS}
\\roleline{{\\headingfont Space Instrumentation Calibration \\& Ion-Optics Series}}{Jul 2025--Dec 2025}
\\begin{itemize}
\\resitem{Calibrated CEM and ESA measurement chains, connecting detector settings, transmission functions, uncertainty, and count-rate interpretation to documented signal quality.}
\\resitem{Modeled ion-optics behavior in SIMION/SRIM, including beam expansion, energy filtering, FWHM, and uncertainty propagation.}
\\end{itemize}
\\roleline{{\\headingfont CANSAT 2022 / Spaceport America Cup}}{2020--2022}
\\begin{itemize}
\\resitem{Built mechanical payload deployment, release, stabilization, and rocket trajectory simulation workflows under competition test constraints.}
\\end{itemize}
${resumeFooter}`);

write('output/general-fusion/cv-harsh-desai-general-fusion-research-technician-2026-06-28.tex', `${resumeHeader('letterpaper')}
\\noindent{\\itshape Hands-on plasma instrumentation engineer focused on high-voltage-safe lab operation, experimental equipment troubleshooting, DAQ logging, vacuum/plasma test workflows, and detector calibration.}\\par
\\sectiontitle{EDUCATION}
\\entryheader{University of Michigan}{Ann Arbor, MI, USA}
\\roleline{Master of Engineering, Space Systems Engineering $\\mid$ GPA: 3.79/4.0}{Aug 2024--Dec 2025}
\\entryheader{Vellore Institute of Technology}{Vellore, India}
\\roleline{Bachelor of Technology, Mechanical Engineering $\\mid$ GPA: 7.78/10}{Jul 2019--Jul 2023}
\\sectiontitle{TECHNICAL SKILLS}
\\skillline{Lab / Test Hardware}{High-voltage switching operations, TDK Lambda PSUs, Keithley DAQs and SMUs, GPIB, serial logging, vacuum chamber operation, hand-built payload mechanisms}
\\skillline{Plasma / Diagnostics}{Hollow-cathode plasma-source workflows, CEM/ESA calibration, SIMION, SRIM, Amptek DPPMCA, detector readout chains}
\\skillline{Programming / DAQ}{Python, PyVISA, PyMeasure, Tkinter GUIs, MATLAB, FPGA workflow, Vivado}
\\skillline{Mechanical Tools}{SolidWorks, Fusion 360, Autodesk Inventor, ANSYS, OpenFOAM, PyANSYS}
\\sectiontitle{RESEARCH \\& ENGINEERING EXPERIENCE}
\\entryheader{Space Physics Research Lab, University of Michigan}{Ann Arbor, MI, USA}
\\roleline{Research Assistant, LVACCS Testing Rig Characterization}{Feb 2026--Present}
\\begin{itemize}
\\resitem{Supported high-voltage plasma-source testing by combining discharge-box FMEA, remote ignition sequencing, PSU logging, Keithley DAQ synchronization, and hardware-protection workflows.}
\\resitem{Built Python/PyVISA + Tkinter automation that reduced manual test interactions 15$\\rightarrow$5 and improved repeatability across experimental runs.}
\\resitem{Operated around vacuum/plasma lab equipment, including CTI-Cryogenics Hi-Vac and roughing-pump workflow exposure down to 1 mTorr.}
\\end{itemize}
\\entryheader{Solar and Heliospheric Research Group, University of Michigan}{Ann Arbor, MI, USA}
\\roleline{Graduate Student Research Assistant, SSD Readout Chain}{Jan 2025--Dec 2025}
\\begin{itemize}
\\resitem{Evaluated detector readout architecture, ADC sampling-rate tradeoffs, noise limits, and FPGA digitization paths for particle pulse acquisition.}
\\end{itemize}
\\sectiontitle{SELECTED TECHNICAL PROJECTS}
\\roleline{{\\headingfont Space Instrumentation Calibration \\& Ion-Optics Series}}{Jul 2025--Dec 2025}
\\begin{itemize}
\\resitem{Calibrated CEM detector response using charge injection, CSA/shaper/MCA readout, bias scans, and pulse-height distributions to establish usable signal quality.}
\\resitem{Extracted ESA transmission functions from lab energy-angle scans and modeled ion-optics behavior in SIMION/SRIM.}
\\end{itemize}
\\roleline{{\\headingfont CANSAT / Spaceport America Cup Hardware}}{2020--2022}
\\begin{itemize}
\\resitem{Built payload release, tether deployment, camera stabilization, and rocket flight-prediction hardware/software under competition test constraints.}
\\end{itemize}
${resumeFooter}`);

console.log('Fusion refresh artifacts written.');
