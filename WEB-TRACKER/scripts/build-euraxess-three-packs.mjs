/**
 * Build EURAXESS application packs for ALBA, FBK LGAD, KU Leuven.
 * Pseudocode:
 * 1. Ensure company output dirs
 * 2. Write tailored .tex resumes from harsh baseline (role-biased bullets)
 * 3. Write cover-letter HTML + application emails
 * 4. Compile LaTeX + Playwright PDFs
 * 5. Patch EURAXESS + Jobs-to-Consider + mark agent tasks complete
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import {
  patchEuraxessOpportunity,
  syncEuraxessOpportunitiesToDashboard,
} from '../lib/euraxess/opportunity-store.mjs';
import {
  patchConsiderJob,
  syncConsiderJobsToDashboard,
  upsertConsiderJob,
} from '../lib/jobs-to-consider-store.mjs';
import { AgentTaskQueue } from '../lib/agent-task-queue.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const TODAY = '2026-07-13';
const now = new Date().toISOString();

function runNode(script, args) {
  const result = spawnSync(process.execPath, [join(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`${script} failed: ${result.stderr || result.stdout || result.error}`);
  }
  return result.stdout;
}

function coverLetterHtml({ title, recipientLines, greeting, paragraphs }) {
  const body = paragraphs.map(p => `<p>${p}</p>`).join('\n    ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Harsh Desai - ${title}</title>
  <style>
    body { font-variant-ligatures: none; margin: 0; color: #16202a; background: #fff; font-family: Calibri, Arial, sans-serif; font-size: 12.7px; line-height: 1.34; }
    h1 { margin: 0; font-family: Calibri, Arial, sans-serif; font-size: 24px; line-height: 1; color: #101820; }
    .rule { height: 2px; margin: 5px 0 5px; background: linear-gradient(to right, hsl(187,74%,32%), hsl(270,70%,45%)); }
    .contact { color: #34465a; font-size: 11.6px; margin-bottom: 15px; }
    p { margin: 0 0 8px; }
    .date { margin-bottom: 12px; }
    .recipient { margin-bottom: 12px; }
  </style>
</head>
<body>
  <main>
    <header><h1>Harsh Desai</h1><div class="rule"></div><div class="contact">Ann Arbor, MI, USA | harshdes@umich.edu | +1-734-548-1080<br>Portfolio: https://harshddes.github.io/ | LinkedIn: https://www.linkedin.com/in/harshddes/</div></header>
    <p class="date">July 13, 2026</p>
    <p class="recipient">${recipientLines.join('<br>')}</p>
    <p>Dear ${greeting},</p>
    ${body}
    <p>Thank you for your consideration.</p>
    <p>Best regards,<br>Harsh Desai</p>
  </main>
</body>
</html>
`;
}

function resumeTex({ roleHeader, skillBias, experienceBias, projectBias }) {
  const base = readFileSync(join(ROOT, 'harsh', 'Harsh_Desai_Resume_OnePage_AlignedFullSkills_A4.tex'), 'utf8');
  // Keep structure; inject a role-focused summary line after contact via skill/experience replacements.
  let tex = base;
  tex = tex.replace(
    '\\sectiontitle{TECHNICAL SKILLS}',
    `{\\itshape ${roleHeader}}\\par\\vspace{2.5pt}\n\n\\sectiontitle{TECHNICAL SKILLS}`,
  );
  if (skillBias) {
    tex = tex.replace(
      /\\skillline\{Instrumentation \\& DAQ \/ Hardware\}\{[^}]+\}/,
      `\\skillline{Instrumentation \\& DAQ / Hardware}{${skillBias}}`,
    );
  }
  if (experienceBias?.lvaccs) {
    tex = tex.replace(
      /\\resitem\{Validated a 1300 V hollow-cathode[^\n]+\}/,
      `\\resitem{${experienceBias.lvaccs}}`,
    );
  }
  if (experienceBias?.ssd) {
    tex = tex.replace(
      /\\resitem\{Designed an SSD readout roadmap[^\n]+\}/,
      `\\resitem{${experienceBias.ssd}}`,
    );
  }
  if (projectBias) {
    tex = tex.replace(
      /\\resitem\{Calibrated CEM detector response[^\n]+\}/,
      `\\resitem{${projectBias}}`,
    );
  }
  return tex;
}

const packs = [
  {
    id: 'euraxess-fusion-446951',
    companySlug: 'alba-synchrotron',
    company: 'ALBA Synchrotron Light Source',
    title: 'Project Engineer (Cryogenic)',
    roleSlug: 'project-engineer-cryogenic',
    url: 'https://euraxess.ec.europa.eu/jobs/446951',
    report: 'reports/euraxess-alba-synchrotron-project-engineer-cryogenic-2026-07-13.md',
    considerId: 'alba-synchrotron-project-engineer-cryogenic',
    location: 'Cerdanyola del Vallès, Spain',
    resume: {
      roleHeader: 'Target: Cryogenic / fluids project engineering for synchrotron facilities (ALBA II upgrade context).',
      skillBias: 'GPIB/IEEE-488, USB-serial, NI VISA (PyVISA), Keithley DAQ/SMU, TDK Lambda PSU sequencing, high-voltage switching, vacuum chamber operation (CTI-Cryogenics Hi-Vac / roughing to ~1 mTorr), He-plant-adjacent lab ops',
      experienceBias: {
        lvaccs: 'Owned HV-safe plasma-source test bring-up on a cryogenics-adjacent vacuum bench: discharge-box FMEA, PyVISA ignition/mass-flow control, PSU logging, and DAQ sync (15$\\rightarrow$5 steps, 98.6\\% synchronized coverage)',
        ssd: 'Built measurement-system ownership habits (ADC/sampling tradeoffs, FPGA timing limits, MATLAB$\\leftrightarrow$Vivado correlation) transferable to facility instrumentation and commissioning documentation',
      },
      projectBias: 'Ran detector/optics characterization workflows (bias maps, pulse-height distributions, transmission-function scans) that emphasize calibration discipline and experimental repeatability',
    },
    cover: {
      recipient: ['ALBA Synchrotron Hiring Team', 'Cerdanyola del Vallès, Spain'],
      greeting: 'ALBA Synchrotron Hiring Team',
      paragraphs: [
        'I am applying for the Project Engineer (Cryogenic) role because ALBA&rsquo;s Simulations, Fluids &amp; Cryogenics work sits at the intersection of facility hardware, thermal/fluids systems, and project ownership for the ALBA II upgrade. That is the kind of engineering I want to practice: keep cryogenic and fluid systems measurable, operable, and documented through design, integration, and operation.',
        'My path is space systems and plasma instrumentation, not a multi-year industrial helium-plant tenure. I am direct about that gap. What I do bring is mechanical foundations (B.Tech Mechanical), vacuum and cryogenics-adjacent lab operation (CTI Hi-Vac / roughing workflows), high-voltage-safe test sequencing, DAQ automation, and systems habits around requirements, failure modes, and repeatable commissioning.',
        'At Michigan&rsquo;s Space Physics Research Lab I currently support the LVACCS hollow-cathode plasma-source test rig: HV discharge-box protection validation, Keithley/TDK Lambda sequencing, mass-flow and ignition automation, and synchronized logging. That work is not identical to operating a helium liquefaction plant, but it is the same class of problem&mdash;protect hardware, make the process repeatable, and leave a measurement trail someone else can trust.',
        'I also bring FPGA-based solid-state detector readout work and CEM/ESA calibration experience, which trained me to treat instrumentation as a full chain from physical interface to usable data. For ALBA I would contribute fastest on cryogenic/fluid system integration support, test readiness, commissioning documentation, and closing loops between design intent and measured behavior while ramping on ALBA-specific cryo plant architecture.',
        'Please note I will re-verify the live CELLS posting before any submission, since the ALBA careers index can lag EURAXESS. I would value the chance to support ALBA II cryogenic systems with careful, hands-on project engineering.',
      ],
    },
    email: `Subject: Application — Project Engineer (Cryogenic) — Harsh Desai

Dear ALBA Synchrotron Hiring Team,

I am applying for the Project Engineer (Cryogenic) role (EURAXESS/CELLS). I work on HV-safe plasma-source testbeds, vacuum/cryogenics-adjacent lab operations, DAQ automation, and detector/readout measurement chains at the University of Michigan.

Attached:
- Resume (PDF)
- Cover letter (PDF)

I will confirm the live CELLS posting before final submission. Happy to discuss cryogenic/fluid system integration, commissioning documentation, and test readiness.

Best regards,
Harsh Desai
harshdes@umich.edu | +1-734-548-1080
https://harshddes.github.io/
`,
  },
  {
    id: 'euraxess-fusion-446816',
    companySlug: 'fondazione-bruno-kessler',
    company: 'Fondazione Bruno Kessler',
    title: 'PhD Candidate - Development of 3D-Integrated Trench-Isolated LGADs For Detecting Low-Energy X-Rays In Space Experiments',
    roleSlug: 'phd-ti-lgad-soft-xray-space',
    url: 'https://euraxess.ec.europa.eu/jobs/446816',
    report: 'reports/euraxess-fbk-phd-ti-lgad-soft-xray-space-2026-07-13.md',
    considerId: 'fondazione-bruno-kessler-phd-candidate-development-of-3d-integrated-trench-isolated-lgads-for-de',
    location: 'Trento / Povo, Italy',
    resume: {
      roleHeader: 'Target: Silicon detector characterization + space instrumentation (TI-LGAD soft X-ray / readout chain).',
      skillBias: 'GPIB/IEEE-488, NI VISA (PyVISA), Keithley DAQ/SMU, Amptek DPPMCA, CSA/ENC reasoning, FPGA design workflow, AMD Vivado, MATLAB HDL Coder, Zynq-7000/Eclypse Z7, vacuum chamber operation',
      experienceBias: {
        lvaccs: 'Built synchronized DAQ/test automation around plasma-source characterization: PyVISA control, PSU logging, and experimental repeatability under HV-safe operating envelopes',
        ssd: 'Designed an SSD readout roadmap against energy-resolution targets; evaluated 1 MSPS$\\rightarrow$125 MSPS digitization on Zynq-7000 with MATLAB HDL Coder$\\leftrightarrow$Vivado co-simulation and post-synthesis timing diagnosis',
      },
      projectBias: 'Mapped CEM bias/pulse-height/gain behavior and ESA transmission with SIMION/SRIM, treating detector settings as part of an end-to-end measurement chain',
    },
    cover: {
      recipient: ['Fondazione Bruno Kessler Hiring Team', 'Trento, Italy'],
      greeting: 'Fondazione Bruno Kessler Hiring Team',
      paragraphs: [
        'I am applying for the PhD on 3D-integrated trench-isolated LGADs for low-energy X-ray detection in space experiments because the posting is about the full detector path I care about: device behavior, characterization setups, radiation response, and coupling into a usable readout chain for space instruments.',
        'My background is space plasma instrumentation and solid-state detector readout, not a cleanroom process-integration career. I would not claim ownership of FBK&rsquo;s TI-LGAD fabrication flow. Where I am strongest is characterization, setup discipline, and readout/DAQ thinking: what the sensor is actually delivering, how the electronics and acquisition corrupt or preserve that signal, and how to make results comparable across campaigns.',
        'At Michigan I developed an FPGA-centered SSD readout roadmap on a Zynq-7000 platform, including ADC/sampling-rate tradeoffs against energy-resolution targets, MATLAB HDL Coder golden models, Vivado co-simulation, and timing-limit diagnosis. Separately I calibrated CEM response (bias maps, pulse-height distributions) and characterized electrostatic analyzer transmission with lab scans plus SIMION/SRIM. Those projects are the bridge to soft X-ray LGAD work: treat the detector as a measurement system, not a black box.',
        'I am currently supporting HV-safe plasma-source test automation at SPRL, which keeps me fluent in experimental repeatability, synchronized logging, and protecting hardware while iterating setups. For this PhD I would contribute fastest on IR/visible/X-ray/charged-particle characterization campaigns, setup optimization, and documentation that connects sensor physics to instrument performance, while ramping deeply on TI-LGAD process details and XPOL-III integration with the FBK team.',
        'I would be glad to discuss how my detector/readout and space-instrumentation background can support FBK&rsquo;s soft X-ray TI-LGAD characterization agenda.',
      ],
    },
    email: `Subject: PhD application — TI-LGAD soft X-ray detectors (FBK) — Harsh Desai

Dear Fondazione Bruno Kessler Hiring Team,

I am applying for the PhD on 3D-integrated trench-isolated LGADs for low-energy X-ray detection in space experiments (EURAXESS 446816). My work centers on SSD/FPGA readout chains, detector calibration, and space plasma instrumentation test workflows at the University of Michigan.

Attached:
- Resume (PDF)
- Cover letter (PDF)

I am especially interested in characterization setups, soft X-ray response, and readout-chain integration (including paths toward XPOL-III coupling).

Best regards,
Harsh Desai
harshdes@umich.edu | +1-734-548-1080
https://harshddes.github.io/
`,
  },
  {
    id: 'euraxess-fusion-447004',
    companySlug: 'ku-leuven',
    company: 'KU Leuven',
    title: 'Marie Curie PhD vacancy (DC2) on Cobot-assisted and digitally-monitored electrolyte jet micromachining (EJM)',
    roleSlug: 'msca-dc2-ejm-cobot-micromachining',
    url: 'https://euraxess.ec.europa.eu/jobs/447004',
    report: 'reports/euraxess-ku-leuven-msca-dc2-ejm-cobot-micromachining-2026-07-13.md',
    considerId: 'ku-leuven-marie-curie-phd-vacancy-dc2-on-cobot-assisted-and-digitally-monitored-electrolyte-jet-',
    location: 'Leuven, Belgium',
    resume: {
      roleHeader: 'Target: Precision manufacturing + digitally monitored process control (MSCA DC2 / EJM).',
      skillBias: 'Python test automation, NI VISA (PyVISA), Keithley DAQ, synchronized multi-stream logging, DoE-style parameter sweeps, ANSYS Fluent/Mechanical, SolidWorks/Fusion 360, vacuum/process hardware operation',
      experienceBias: {
        lvaccs: 'Automated a multi-parameter plasma-source process: ignition sequencing, mass-flow control, PSU coordination, and synchronized DAQ logging (15$\\rightarrow$5 manual steps; 98.6\\% coverage) for repeatable experimental runs',
        ssd: 'Translated measurement requirements into executable instrumentation architecture (sampling, timing, validation), a habit that transfers to digitally monitored manufacturing processes',
      },
      projectBias: 'Combined mechanical design/build (CANSAT mechanisms) with experimental characterization workflows, emphasizing process repeatability and data that can drive decisions',
    },
    cover: {
      recipient: ['KU Leuven MicroMan4Health Hiring Team', 'Department of Mechanical Engineering', 'Leuven, Belgium'],
      greeting: 'KU Leuven MicroMan4Health Hiring Team',
      paragraphs: [
        'I am applying for the MSCA DC2 PhD on cobot-assisted, digitally monitored electrolyte jet micromachining because the bottleneck is not slogans about &ldquo;smart manufacturing&rdquo;&mdash;it is making a non-conventional machining process measurable, controllable, and transferable across complex geometries. That is the work I want to do.',
        'I am a mechanical engineer by bachelor training and a space-systems / instrumentation engineer by master&rsquo;s training. I am not claiming deep prior ownership of electrochemical jet machining. The honest bridge is process monitoring and experimental systems: turn a physical process into synchronized signals, controllable actuators, and data that can actually train models or close a control loop.',
        'At Michigan&rsquo;s Space Physics Research Lab I automate hollow-cathode plasma-source testing: high-voltage sequencing, mass-flow and ignition workflows, Keithley DAQ integration, and Python/PyVISA logging that cut manual steps and raised synchronized coverage to 98.6%. That is the same muscle DC2 needs for high-frequency current-pulse monitoring and data-driven EJM control, even though the physics medium differs.',
        'I also bring mechanical design/build experience (CANSAT mechanisms, spacecraft environmental-test planning via TestBedz) and simulation habits from ANSYS/OpenFOAM coursework. For MicroMan4Health I would contribute fastest on cobot-assisted experimental setups, monitoring instrumentation, DoE-style campaigns, and multiphysics model validation against measured topographies, while ramping on EJM electrochemistry and implant-surface biology endpoints with the consortium.',
        'I understand MSCA mobility rules and will apply only through the KU Leuven online platform with the full required package. I would welcome the chance to discuss DC2 with Prof. Saxena&rsquo;s team.',
      ],
    },
    email: `Subject: MSCA DC2 application — Cobot-assisted EJM (MicroMan4Health) — Harsh Desai

Dear KU Leuven Hiring Team,

I am applying for the Marie Curie DC2 PhD on cobot-assisted, digitally monitored electrolyte jet micromachining (EURAXESS 447004 / MicroMan4Health). My background combines mechanical engineering with process-monitoring and DAQ automation from plasma-source testbeds at the University of Michigan.

I will submit the full package through the KU Leuven online application platform (motivation letter, CV, transcripts, thesis summary, references). Attached here for convenience:
- Resume (PDF)
- Cover letter (PDF)

Happy to discuss experimental monitoring, cobot-assisted setups, and data-driven process control for EJM.

Best regards,
Harsh Desai
harshdes@umich.edu | +1-734-548-1080
https://harshddes.github.io/
`,
  },
];

const results = [];

for (const pack of packs) {
  const dir = join(ROOT, 'output', pack.companySlug);
  mkdirSync(dir, { recursive: true });

  // Copy fonts from helion if present (optional)
  const fontSrc = join(ROOT, 'output', 'helion', 'fonts');
  const fontDst = join(dir, 'fonts');
  if (existsSync(fontSrc) && !existsSync(fontDst)) {
    mkdirSync(fontDst, { recursive: true });
    for (const f of ['SpaceGrotesk-VariableFont_wght.ttf', 'DMSans-VariableFont_opsz,wght.ttf']) {
      const s = join(fontSrc, f);
      if (existsSync(s)) copyFileSync(s, join(fontDst, f));
    }
  }

  const resumeBase = `cv-harsh-desai-${pack.companySlug}-${pack.roleSlug}-${TODAY}`;
  const coverBase = `cover-letter-harsh-desai-${pack.companySlug}-${pack.roleSlug}-${TODAY}`;
  const emailBase = `application-email-${pack.companySlug}-${pack.roleSlug}-${TODAY}`;

  const resumeTexPath = join(dir, `${resumeBase}.tex`);
  const resumePdfPath = join(dir, `${resumeBase}.pdf`);
  const coverHtmlPath = join(dir, `${coverBase}.html`);
  const coverPdfPath = join(dir, `${coverBase}.pdf`);
  const emailPath = join(dir, `${emailBase}.md`);

  writeFileSync(resumeTexPath, resumeTex(pack.resume), 'utf8');
  writeFileSync(coverHtmlPath, coverLetterHtml({
    title: pack.title,
    recipientLines: pack.cover.recipient,
    greeting: pack.cover.greeting,
    paragraphs: pack.cover.paragraphs,
  }), 'utf8');
  writeFileSync(emailPath, pack.email, 'utf8');

  runNode('generate-latex.mjs', [resumeTexPath, resumePdfPath]);
  runNode('generate-pdf.mjs', [coverHtmlPath, coverPdfPath, '--format=a4']);

  const toRel = (abs) => relative(ROOT, abs).replace(/\\/g, '/');

  const resources = {
    report_md: pack.report,
    research_report: pack.report,
    resume_tex: toRel(resumeTexPath),
    resume_pdf: toRel(resumePdfPath),
    cover_letter_pdf: toRel(coverPdfPath),
    email_draft: toRel(emailPath),
  };

  patchEuraxessOpportunity(pack.id, {
    research_report: pack.report,
    worker_status: 'pack_ready',
    needs_research: false,
    needs_application_pack: false,
    resources,
    artifacts: {
      research_report: pack.report,
      resume_pdf: resources.resume_pdf,
      cover_letter_pdf: resources.cover_letter_pdf,
      email_draft: resources.email_draft,
    },
    automation: {
      worker_status: 'pack_ready',
      current_stage: 'pack_ready',
      last_error: '',
      last_run_at: now,
      runner: 'cursor-manual',
    },
    decision: {
      apply_recommendation: 'ready_to_apply_after_review',
      rationale: pack.title,
    },
    execution: {
      ready_checked: true,
      stage: 'artifacts_ready',
      stage_updated_at: now,
    },
  });

  upsertConsiderJob({
    id: pack.considerId,
    company: pack.company,
    title: pack.title,
    url: pack.url,
    location: pack.location,
    status: 'to_consider',
    resources,
  });
  try {
    patchConsiderJob(pack.considerId, { resources });
  } catch {}

  results.push({ id: pack.id, resources });
}

syncEuraxessOpportunitiesToDashboard();
syncConsiderJobsToDashboard();

const queue = new AgentTaskQueue(join(ROOT, 'WEB-TRACKER', 'data', 'euraxess-agent-tasks.ndjson'));
for (const t of queue.list()) {
  if (t.status !== 'queued' || t.type !== 'application_artifact') continue;
  const hit = packs.some(p => String(t.url || '').includes(p.url.split('/').pop()) || String(t.title || '').includes(p.title.slice(0, 40)));
  if (hit) {
    queue.update(t.id, {
      status: 'completed',
      notes: `${t.notes || ''} | Pack generated ${TODAY}`,
      updated_at: now,
    });
  }
}

console.log(JSON.stringify({ ok: true, packs: results }, null, 2));
