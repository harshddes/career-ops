#!/usr/bin/env node
/** Generate tailored Oklo CV .tex variants from base template. */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASE = fs.readFileSync(path.join(ROOT, 'harsh/Harsh_Desai_Resume_OnePage_AlignedFullSkills_A4.tex'), 'utf8');
const DATE = '2026-07-01';
const OUT = path.join(ROOT, 'output/oklo');

const variants = [
  {
    slug: 'open-call-for-engineers',
    profile:
      '\\noindent{\\textit{Instrumentation-first systems engineer: HV-safe test workflows, DAQ automation, detector calibration, and physics-aware hardware verification. Pivoting from space plasma diagnostics into nuclear test environments.}}\\par\\vspace{2pt}',
  },
  {
    slug: 'hardware-test-engineer',
    skillsOrder: ['Instrumentation', 'Mechanical', 'Programming', 'FPGA'],
    profile:
      '\\noindent{\\textit{Test and instrumentation engineer focused on thermo-hydraulic hardware validation, Python/PyVISA DAQ automation, repeatable test execution, and data-backed reporting.}}\\par\\vspace{2pt}',
  },
  {
    slug: 'systems-engineer-requirements-and-integration',
    profile:
      '\\noindent{\\textit{Systems engineer focused on requirements traceability, verification planning, and cross-disciplinary integration for hardware test and mission systems.}}\\par\\vspace{2pt}',
    swapExperience: true,
  },
  {
    slug: 'mechatronics-engineer',
    profile:
      '\\noindent{\\textit{Mechatronics-adjacent engineer combining electromechanical prototyping, sensor integration, automation controls, and hands-on test iteration.}}\\par\\vspace{2pt}',
    mechFirst: true,
  },
];

function injectProfile(tex, profile) {
  return tex.replace('\\vspace{3.8pt}\n\n\\sectiontitle{EDUCATION}', `\\vspace{3.8pt}\n${profile}\n\\sectiontitle{EDUCATION}`);
}

function reorderSkills(tex, mechFirst) {
  if (!mechFirst) return tex;
  const block = tex.match(/\\sectiontitle\{TECHNICAL SKILLS\}[\s\S]*?\\sectiontitle\{RESEARCH/)[0];
  const lines = block.split('\n').filter((l) => l.startsWith('\\skillline'));
  const mech = lines.find((l) => l.includes('Mechanical'));
  const inst = lines.find((l) => l.includes('Instrumentation'));
  const prog = lines.find((l) => l.includes('Programming'));
  const fpga = lines.find((l) => l.includes('FPGA'));
  const reordered = [mech, inst, prog, fpga].filter(Boolean).join('\n');
  return tex.replace(block, `\\sectiontitle{TECHNICAL SKILLS}\n${reordered}\n\n\\sectiontitle{RESEARCH`);
}

function swapTestBedzFirst(tex) {
  const lvaccs = `\\entryheader{Space Physics Research Lab, University of Michigan}{Ann Arbor, MI, USA}
\\roleline{Research Assistant, LVACCS Testing Rig Characterization}{Feb 2026--Present}
\\begin{itemize}
  \\resitem{Validated a 1300 V hollow-cathode plasma-source test workflow by combining HV discharge-box FMEA, Python/PyVISA ignition control, PSU logging, and DAQ synchronization; cut manual steps 15$\\rightarrow$5 and achieved 98.6\\% synchronized data}
  \\resitem{Characterized remote ignition and post-run processing workflows for Spacecraft Charging Device test readiness, improving experimental repeatability and saving $\\sim$15 minutes of processing per run}
\\end{itemize}
\\smallv
\\roleline{Summer Intern, TestBedz Spacecraft Qualification Platform}{May 2025--Jul 2025}
\\begin{itemize}
  \\resitem{Built a full-stack requirement-flowdown platform for TVAC, vibration, and EMI test submissions, matching spacecraft hardware profiles to facility limits across 6 test-type workflows}
\\end{itemize}`;

  const swapped = `\\entryheader{Space Physics Research Lab, University of Michigan}{Ann Arbor, MI, USA}
\\roleline{Summer Intern, TestBedz Spacecraft Qualification Platform}{May 2025--Jul 2025}
\\begin{itemize}
  \\resitem{Built a full-stack requirement-flowdown platform for TVAC, vibration, and EMI test submissions, matching spacecraft hardware profiles to facility limits across 6 test-type workflows}
\\end{itemize}
\\smallv
\\roleline{Research Assistant, LVACCS Testing Rig Characterization}{Feb 2026--Present}
\\begin{itemize}
  \\resitem{Validated a 1300 V hollow-cathode plasma-source test workflow by combining HV discharge-box FMEA, Python/PyVISA ignition control, PSU logging, and DAQ synchronization; cut manual steps 15$\\rightarrow$5 and achieved 98.6\\% synchronized data}
  \\resitem{Characterized remote ignition and post-run processing workflows for Spacecraft Charging Device test readiness, improving experimental repeatability and saving $\\sim$15 minutes of processing per run}
\\end{itemize}`;

  return tex.replace(lvaccs, swapped);
}

for (const v of variants) {
  let tex = BASE;
  if (v.profile) tex = injectProfile(tex, v.profile);
  if (v.mechFirst) tex = reorderSkills(tex, true);
  if (v.swapExperience) tex = swapTestBedzFirst(tex);
  const outFile = path.join(OUT, `cv-harsh-desai-oklo-${v.slug}-${DATE}.tex`);
  fs.writeFileSync(outFile, tex);
  console.log('wrote', outFile);
}
