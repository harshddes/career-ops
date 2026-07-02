# Fusion Company Research - First Light, General Fusion, Kyoto Fusioneering

**Compiled for:** Harsh Desai (M.Eng Space Systems, UMich | F-1 OPT)  
**Last refreshed:** 2026-06-28  
**Sources:** Parallel CLI extracts for Kyoto Fusioneering and First Light Fusion; General Fusion ADP requisitions API; prior deep research `trun_dd47611047ba4519a961be457b396d4a`.

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
