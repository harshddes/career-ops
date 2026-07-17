import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  patchEuraxessOpportunity,
  syncEuraxessOpportunitiesToDashboard,
} from '../lib/euraxess/opportunity-store.mjs';
import { AgentTaskQueue } from '../lib/agent-task-queue.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS = join(__dirname, '..', '..');
const today = '2026-07-13';
const now = new Date().toISOString();

const reports = [
  {
    id: 'euraxess-fusion-446951',
    slug: 'alba-synchrotron-project-engineer-cryogenic',
    pack: true,
    title: 'Project Engineer (Cryogenic)',
    url: 'https://euraxess.ec.europa.eu/jobs/446951',
    skipReason: '',
    body: `# EURAXESS Research: Project Engineer (Cryogenic)

**Institution:** ALBA Synchrotron Light Source
**URL:** https://euraxess.ec.europa.eu/jobs/446951
**Score:** 4.2/5
**Status:** open_unverified (EURAXESS shows deadline; ALBA careers index currently lists no open jobs — verify on CELLS before applying)
**Generated:** ${now}
**Research method:** Exa fetch of EURAXESS + ALBA careers (Parallel research unavailable — billing)

## Verification First
- **EURAXESS deadline:** 15 Jul 2026 - 12:00 (Europe/Brussels) — EXPIRES SOON
- **Start:** 1 Sep 2026 | Permanent | Full-time 35 h/week | Cerdanyola del Vallès, Barcelona
- **ALBA careers page** (https://www.cells.es/en/careers/jobs) fetched 2026-07-13: "There are currently no open job positions." Treat as high liveness risk until the CELLS posting is confirmed live.
- Do not submit without user review.

## Role Summary
Simulations, Fluids & Cryogenics Group (Engineering Division) — cryostats, cryocoolers, He/N₂ distribution, helium liquefaction plant, engineering analyses, project-lifecycle leadership for ALBA II 4th-generation upgrade.

## Requirements vs Harsh
| Requirement | Match |
|---|---|
| Master's Industrial/Mechanical/Thermal/Fluids | Partial — M.Eng Space Systems + B.Tech Mechanical |
| 3+ years engineer on related tasks | Weak — research/test experience, not 3y cryo plant PE |
| English B2+ | Strong |
| Cryogenics / He plant / project engineering | Adjacent — vacuum/cryo pump ops (CTI Hi-Vac), fluids coursework, systems/test leadership |

## Fit Rationale
Strong topical anchors (cryogenic, synchrotron facilities). Experience gap on industrial cryogenic project engineering tenure. Apply only if CELLS listing is confirmed open and Harsh wants Spain permanent-contract track.

## Sources
- https://euraxess.ec.europa.eu/jobs/446951
- https://www.cells.es/en/careers/jobs
- https://www.sercanto.es/detail/a/cryogenic-systems-project-engineer_cerdanyola-del-valles_309287512
`,
  },
  {
    id: 'euraxess-fusion-446818',
    slug: 'fbk-phd-plasmonic-antennas-ir-space',
    pack: false,
    title: 'PhD Candidate - Design, Fabrication and Characterization of Plasmonic Antennas for Infrared Detection in Space Applications',
    url: 'https://euraxess.ec.europa.eu/jobs/446818',
    skipReason: 'Reserved for Kenyan nationality only',
    body: `# EURAXESS Research: Plasmonic Antennas IR Detection (FBK)

**Institution:** Fondazione Bruno Kessler
**URL:** https://euraxess.ec.europa.eu/jobs/446818
**Score:** 4.0/5 (topical)
**Generated:** ${now}
**Research method:** Exa fetch EURAXESS (Parallel unavailable — billing)

## HARD BLOCKER
EURAXESS offer text states: **"This position is reserved for candidates of Kenyan nationality."**
Harsh is not eligible. **Do not draft or submit an application pack.**

## Verification First
- Deadline: 20 Jul 2026 - 23:59 (Europe/Rome)
- Start: 1 Nov 2026 | Temporary PhD | Trento
- Topic fit (IR detectors / space instrumentation) is high, but nationality constraint kills the path.

## Role Summary
Design, EM modelling, cleanroom fabrication, and optical/electrical characterization of plasmonic nanoantennas for IR detection in space payloads (astrophysics / EO).

## Recommendation
**SKIP / remove from application execution.** Keep card for topic awareness only.

## Sources
- https://euraxess.ec.europa.eu/jobs/446818
`,
  },
  {
    id: 'euraxess-fusion-446816',
    slug: 'fbk-phd-ti-lgad-soft-xray-space',
    pack: true,
    title: 'PhD Candidate - Development of 3D-Integrated Trench-Isolated LGADs For Detecting Low-Energy X-Rays In Space Experiments',
    url: 'https://euraxess.ec.europa.eu/jobs/446816',
    skipReason: '',
    body: `# EURAXESS Research: TI-LGAD Soft X-ray Detectors (FBK)

**Institution:** Fondazione Bruno Kessler
**URL:** https://euraxess.ec.europa.eu/jobs/446816
**Score:** 3.8/5
**Generated:** ${now}
**Research method:** Exa fetch EURAXESS + UniTrento/FBK public descriptions (Parallel unavailable — billing)

## Verification First
- Deadline: 20 Jul 2026 - 23:59 (Europe/Rome)
- Start: 1 Nov 2026 | Temporary PhD | FBK Povo / Trento
- No Kenyan-nationality reservation on this posting (unlike 446818). Still verify application portal / UniTrento SST call details before applying.

## Role Summary
Develop and characterize trench-isolated LGADs (TI-LGADs) with optimized backside entrance window for soft X-ray (~1 keV) space detection; couple to XPOL-III readout ASIC; lab characterization with IR/visible, X-ray, gamma, charged particles; build/optimize setups.

## Requirements vs Harsh
| Angle | Match |
|---|---|
| Silicon detector / SSD readout | Strong — FPGA SSD readout chain, Amptek DPPMCA, energy-resolution sizing |
| Space instrumentation | Strong — space plasma diagnostics / SPRL test workflows |
| Cleanroom device fabrication | Weak/adjacent — characterization-heavy; fabrication is FBK process team |
| PhD eligibility | M.Eng Space Systems — check UniTrento SST formal entry rules |

## Fit Rationale
Best FBK match in the queue: detector physics + space experiment framing aligns with Harsh's SSD/FPGA and lab characterization story. Lead with characterization + readout, not TCAD process ownership.

## Sources
- https://euraxess.ec.europa.eu/jobs/446816
- https://www.linkedin.com/posts/unitrento-fisica_space-science-and-technology-activity-7478432456073904128-v1i6
- https://doi.org/10.3390/s23136225
`,
  },
  {
    id: 'euraxess-fusion-447004',
    slug: 'ku-leuven-msca-dc2-ejm-cobot-micromachining',
    pack: true,
    title: 'Marie Curie PhD vacancy (DC2) on Cobot-assisted and digitally-monitored electrolyte jet micromachining (EJM)',
    url: 'https://euraxess.ec.europa.eu/jobs/447004',
    skipReason: '',
    body: `# EURAXESS Research: KU Leuven MSCA DC2 — Cobot EJM Micromachining

**Institution:** KU Leuven (MPE / Mechanical Engineering)
**URL:** https://euraxess.ec.europa.eu/jobs/447004
**Score:** 3.7/5
**Generated:** ${now}
**Research method:** Exa fetch EURAXESS + AcademicPositions mirror (Parallel unavailable — billing)

## Verification First
- Deadline: 16 Sep 2026 - 23:59 UTC (comfortable runway)
- Start: Oct/Nov 2026 (negotiable)
- Funding: Horizon Europe MSCA DN MicroMan4Health (https://www.microman4health.eu/)
- Apply only via KU Leuven online platform (email applications rejected)
- Mobility rule: must not have lived/worked in Belgium >12 months in last 3 years; no prior PhD

## Role Summary
Cobot-assisted, digitally monitored electrolyte jet micromachining for conformal surface structuring of orthopaedic hip implants; multiphysics modelling; HF current-pulse monitoring; data-driven process control; osteogenic-differentiation experiments on medical alloys. Secondments possible: TextureJet (UK), UIUC (USA), Mondragon (Spain).

## Requirements vs Harsh
| Angle | Match |
|---|---|
| Mech/materials/production Master's | Strong — B.Tech Mechanical + systems M.Eng |
| Experimental setups / lab | Strong — SPRL plasma testbeds, DAQ, DoE-ish workflows |
| Electrochemical manufacturing | Adjacent — not primary background |
| Process monitoring / data | Strong — Python DAQ, logging, automation |
| MedTech biology endpoints | Weak — osteogenic differentiation is secondary to Harsh narrative |

## Fit Rationale
Credible manufacturing / process-monitoring PhD path. Frame as precision electrochemical micromachining + instrumentation/control, not biomedical core. Contact: Prof. Krishna Kumar Saxena / Muhammad Hazak Arshad.

## Sources
- https://euraxess.ec.europa.eu/jobs/447004
- https://academicpositions.com/ad/ku-leuven/2026/marie-curie-phd-vacancy-dc2-on-cobot-assisted-and-digitally-monitored-electrolyte-jet-micromachining-ejm-process-for-athermal-surface-structuring-and-postprocessing-of-hip-implants-for-promoting-osteogenic-differentiation/250262
- https://www.microman4health.eu/
`,
  },
];

function jobIdFromUrl(url = '') {
  const m = String(url).match(/\/jobs\/(\d+)/);
  return m ? m[1] : '';
}

const queue = new AgentTaskQueue(join(CAREER_OPS, 'WEB-TRACKER', 'data', 'euraxess-agent-tasks.ndjson'));
const tasks = queue.list();

for (const r of reports) {
  const rel = `reports/euraxess-${r.slug}-${today}.md`;
  const abs = join(CAREER_OPS, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, r.body, 'utf8');

  const worker = r.pack ? 'needs_worker' : 'research_ready';
  patchEuraxessOpportunity(r.id, {
    research_report: rel,
    worker_status: worker,
    needs_research: false,
    needs_application_pack: Boolean(r.pack),
    resources: { report_md: rel, research_report: rel },
    artifacts: { research_report: rel },
    automation: {
      worker_status: worker,
      current_stage: r.pack ? 'needs_worker' : 'research_ready',
      last_error: r.pack
        ? 'Application pack queued for Cursor worker (Parallel billing blocked auto research; report written manually).'
        : (r.skipReason || ''),
      last_run_at: now,
      runner: 'cursor-manual',
    },
    decision: {
      apply_recommendation: r.pack ? 'draft_application_pack' : 'skip',
      rationale: r.skipReason || r.title,
      archive_reason: r.skipReason || '',
    },
    execution: r.pack
      ? { ready_checked: true, stage: 'making_artifacts', stage_updated_at: now }
      : { ready_checked: false, stage: null, stage_updated_at: now },
  });

  const eid = jobIdFromUrl(r.url);
  for (const t of tasks) {
    if (t.status !== 'queued') continue;
    const same = String(t.url || '').includes(eid) || String(t.title || '').slice(0, 48) === r.title.slice(0, 48);
    if (!same) continue;
    if (t.type === 'deep_research') {
      queue.update(t.id, {
        status: 'completed',
        notes: `${t.notes || ''} | Research report written: ${rel}`,
        result_path: rel,
      });
    } else if (t.type === 'application_artifact' && !r.pack) {
      queue.update(t.id, {
        status: 'cancelled',
        notes: `${t.notes || ''} | ${r.skipReason || 'No pack'}`,
      });
    }
  }
  console.log(JSON.stringify({ id: r.id, report: rel, pack: r.pack, skip: r.skipReason || null }));
}

syncEuraxessOpportunitiesToDashboard();
console.log(JSON.stringify({ synced: true }));
