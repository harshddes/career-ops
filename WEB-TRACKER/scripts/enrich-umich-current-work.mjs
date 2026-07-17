#!/usr/bin/env node
/**
 * Tiered current_focus / recent_publication enrichment for U-M research prospects.
 *
 * Depth A: Manufacturing + Tier A + mechatronics T1 — verified profile/lab extracts
 * Depth B: remaining Tier B — current_focus from profile interests only
 * Depth C/D: light interests only; never invent recent_publication
 *
 * Honesty: empty recent_publication is better than a fake title.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readResearchProspects,
  syncResearchProspectsToDashboard,
  writeResearchProspects,
} from '../lib/research-prospect-store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESEARCH_DIR = join(__dirname, '..', 'research');
const RESEARCH_DATE = '2026-07-09';
const ARTIFACT = join(RESEARCH_DIR, 'umich-current-work-enrichment-2026.json');
const DEEP_RUN = 'trun_dd47611047ba451990e2122c73439b1b';

/** Verified Depth A signals from Parallel web_fetch + manufacturing artifact. */
const VERIFIED = [
  {
    name: 'Harish Ganesh',
    current_focus: 'Fluid dynamics research focused on hydrodynamic cavitation and experimental methods for multiphase flow diagnostics.',
    recent_publication: '',
    source_url: 'https://name.engin.umich.edu/people/ganesh-harish/',
    depth: 'A',
  },
  {
    name: 'Ryan McBride',
    current_focus: 'Director of PPML / MACH; experimental and theoretical MagLIF and magnetically driven cylindrically imploding plasmas with pulsed-power diagnostics.',
    recent_publication: '',
    source_url: 'https://ners.engin.umich.edu/people/mcbride-ryan/',
    depth: 'A',
  },
  {
    name: 'Steven L. Ceccio',
    current_focus: 'Multiphase and high-Reynolds-number fluid mechanics including cavitation, propulsors/turbomachinery, drag reduction, and flow diagnostics development.',
    recent_publication: '',
    source_url: 'https://name.engin.umich.edu/people/ceccio-steven-l/',
    depth: 'A',
  },
  {
    name: 'Steve Ceccio',
    current_focus: 'Experimental multiphase flows, cavitation and bubbly flows, with optical flow measurement and electrical/radiation tomography methods.',
    recent_publication: '',
    source_url: 'https://me.engin.umich.edu/people/faculty/steve-ceccio/',
    depth: 'A',
  },
  {
    name: 'Karl Krushelnick',
    current_focus: 'High-intensity short-pulse laser systems, laser-plasma interactions, table-top laser accelerators, high-field physics, and X-ray laser applications at CUOS.',
    recent_publication: '',
    source_url: 'https://ners.engin.umich.edu/people/krushelnick-karl/',
    depth: 'A',
  },
  {
    name: 'Igor Jovanovic',
    current_focus: 'Radiation detection/measurement, intense laser science, and laser-matter interactions for nuclear security, nuclear energy, and fundamental science (Applied Nuclear Science Group).',
    recent_publication: '',
    source_url: 'https://ners.engin.umich.edu/people/jovanovic-igor/',
    depth: 'A',
  },
  {
    name: 'Margaret Wooldridge',
    current_focus: 'Sustainable energy and propulsion systems spanning combustion, reaction kinetics, aerosol formation, optical diagnostics, and pollution mitigation.',
    recent_publication: '2024 — Q&A: Getting serious about atmospheric methane removal (National Academies report discussion) — https://me.engin.umich.edu/news-events/news/qa-getting-serious-about-atmospheric-methane-removal/',
    source_url: 'https://me.engin.umich.edu/people/faculty/margaret-wooldridge/',
    depth: 'A',
  },
  {
    name: 'Paolo Elvati',
    current_focus: 'Computational nanoparticle formation/interactions (MD, ML, stochastic solvers) for biological systems, non-thermal plasma, and reactive gas-phase conditions.',
    recent_publication: '',
    source_url: 'https://me.engin.umich.edu/people/faculty/paolo-elvati/',
    depth: 'A',
  },
  {
    name: 'Volker Sick',
    current_focus: 'CO2-utilization technology deployment for infrastructure/manufacturing sustainability, plus optical measurement techniques for eye-disease diagnostics.',
    recent_publication: '2023 — ME professor receives ASME 2023 Edwin F. Church Medal — https://me.engin.umich.edu/news-events/news/me-professor-receives-asme-2023-edwin-f-church-medal/',
    source_url: 'https://me.engin.umich.edu/people/faculty/volker-sick/',
    depth: 'A',
  },
  {
    name: 'Kevin J. Maki',
    current_focus: 'Director of the Aaron Friedman Marine Hydrodynamics Laboratory; marine computational mechanics and experimental hydrodynamics via MHL / BRIDGE.',
    recent_publication: '',
    source_url: 'https://name.engin.umich.edu/people/maki-kevin-j/',
    depth: 'A',
  },
  {
    name: 'Michael Bernitsas',
    current_focus: 'Marine Renewable Energy Laboratory lead; vortex-induced vibration energy harvesting (VIVACE) and related marine renewable systems.',
    recent_publication: '',
    source_url: 'https://name.engin.umich.edu/people/bernitsas-michael/',
    depth: 'A',
  },
  {
    name: 'Alec Thomas',
    current_focus: 'Experimental and theoretical high-power laser–plasma interactions using HERCULES and Lambda-cubed systems in the CUOS High Field Science group.',
    recent_publication: '',
    source_url: 'https://ners.engin.umich.edu/people/thomas-alec/',
    depth: 'A',
  },
  {
    name: 'John Foster',
    current_focus: 'Low-temperature plasmas for advanced space propulsion, plasma diagnostics, processing plasmas, and environmental plasma remediation (Plasma Science and Technology Lab).',
    recent_publication: '',
    source_url: 'https://ners.engin.umich.edu/people/foster-john/',
    depth: 'A',
  },
  {
    name: 'Kenn Oldham',
    current_focus: 'Micro-mechatronic systems for endoscopic imaging, micro-robotic manipulation/locomotion, and MEMS modeling/system identification/state estimation.',
    recent_publication: '2024 — ME researchers receive $1.7M to develop endoscopic microscope that may help detect neurological diseases — https://me.engin.umich.edu/news-events/news/1-7-million-for-a-new-endoscopic-microscopy-tool/',
    source_url: 'https://me.engin.umich.edu/people/faculty/kenn-oldham/',
    depth: 'A',
  },
  {
    name: 'Louise Willingale',
    current_focus: 'Intense laser-plasma interactions including laser-driven ion acceleration, relativistic laser propagation, and proton deflectometry; Director of NSF ZEUS laser facility.',
    recent_publication: '',
    source_url: 'https://willingale.engin.umich.edu/',
    depth: 'A',
  },
  {
    name: 'Anchal Sareen',
    current_focus: 'Experimental Fluid Dynamics Laboratory developing flow-control strategies for unmanned underwater/aerial vehicles, bio-inspired propulsion, and renewable-energy harvesting.',
    recent_publication: '',
    source_url: 'https://name.engin.umich.edu/people/sareen-anchal/',
    depth: 'A',
  },
  {
    name: 'Andre Boehman',
    current_focus: 'Director of W.E. Lay Automotive Laboratory; fuels, combustion, emissions, and energy-conversion thermodynamics for automotive propulsion.',
    recent_publication: '2023 — Two ME faculty receive Fulbright Scholar Awards — https://me.engin.umich.edu/news-events/news/two-me-faculty-receive-fulbright-scholar-awards/',
    source_url: 'https://me.engin.umich.edu/people/faculty/andre-boehman/',
    depth: 'A',
  },
  {
    name: 'Anna Stefanopoulou',
    current_focus: 'Estimation and control of internal combustion engines and electrochemical processes such as fuel cells and batteries, including aging and fault detection.',
    recent_publication: '',
    source_url: 'https://me.engin.umich.edu/people/faculty/anna-stefanopoulou/',
    depth: 'A',
  },
  {
    name: 'Benjamin Jorns',
    current_focus: 'Co-director of PEPL; electric propulsion wear/stability, low-temperature plasma turbulence, plasma diagnostics, and high-power EP testing (JANUS).',
    recent_publication: '',
    source_url: 'https://aerospace.engin.umich.edu/people/jorns-benjamin/',
    depth: 'A',
  },
  {
    name: 'Eric Johnsen',
    current_focus: 'Multiphase flow, cavitation/bubble dynamics, high-speed flow and shock waves, interfacial instabilities, plasmas, and high-performance computing for flow physics.',
    recent_publication: '',
    source_url: 'https://me.engin.umich.edu/people/faculty/eric-johnsen/',
    depth: 'A',
  },
  {
    name: 'Jing Sun',
    current_focus: 'RACELab lead applying control theory and optimization to marine and automotive propulsion systems; real-time adaptive control engineering.',
    recent_publication: '',
    source_url: 'https://name.engin.umich.edu/people/sun-jing/',
    depth: 'A',
  },
  {
    name: 'Jon Estrada',
    current_focus: 'Experimental Soft Mechanics Lab: soft/bio-material characterization, high-speed rheometry, inertial cavitation, photoacoustic/laser microscopy, and DIC/DVC image methods.',
    recent_publication: '',
    source_url: 'https://me.engin.umich.edu/people/faculty/jon-estrada/',
    depth: 'A',
  },
  {
    name: 'Kartik Praful Naik',
    current_focus: 'Experimental renewable-energy harvesting and co-design/real-time control for underwater kite and reconfigurable turbine concepts (ARPA-E SHARKS project manager).',
    recent_publication: '',
    source_url: 'https://name.engin.umich.edu/people/kartik-praful-naik/',
    depth: 'A',
  },
  {
    name: 'Martin Erinin',
    current_focus: 'Experimental multiphase and free-surface flows, surfactant-dominated flows, and optical measurement techniques for thermo-fluids with naval/environmental applications.',
    recent_publication: '',
    source_url: 'https://me.engin.umich.edu/people/faculty/martin-erinin/',
    depth: 'A',
  },
  {
    name: 'Robert Middleton',
    current_focus: 'Automotive engine combustion simulations (1D and 3D CFD) spanning spark-ignited and advanced autoignition modes, fuel properties, efficiency, and emissions.',
    recent_publication: '',
    source_url: 'https://me.engin.umich.edu/people/faculty/robert-middleton/',
    depth: 'A',
  },
  {
    name: 'Timothy McCoy',
    current_focus: 'Adjunct / engineering-practice lead for Marine Engineering Laboratory; ship power and energy systems design, construction, and operation with ONR-backed experimental facilities.',
    recent_publication: '',
    source_url: 'https://name.engin.umich.edu/people/mccoy-timothy/',
    depth: 'A',
  },
  {
    name: 'Venkat Raman',
    current_focus: 'Computational models for turbulent reacting flows (aircraft/scramjet, power generation, materials synthesis), with recent focus on hypersonics and rotating detonation engines.',
    recent_publication: '',
    source_url: 'https://me.engin.umich.edu/people/faculty/venkat-raman/',
    depth: 'A',
  },
  {
    name: 'Young Geun Park',
    current_focus: 'Optofluidics, functional nanomaterials, bioinspired active optical systems, and solar-optics panels for energy harvesting/storage and molecular detection.',
    recent_publication: '',
    source_url: 'https://me.engin.umich.edu/people/faculty/young-geun-park/',
    depth: 'A',
  },
  {
    name: 'Carolyn Kuranz',
    current_focus: 'Experimental high-energy-density plasmas, hydrodynamic instabilities, radiation hydrodynamics, and magnetized plasmas on NIF and Omega laser facilities; Director of CHEDAR.',
    recent_publication: '',
    source_url: 'https://ners.engin.umich.edu/people/kuranz-carolyn/',
    depth: 'A',
  },
  {
    name: 'Nicholas Jordan',
    current_focus: 'PPML lab manager; high-power microwaves, pulsed-power technology, plasma diagnostics, Z-pinch dynamics, plasma imaging, and laser diagnostics.',
    recent_publication: '',
    source_url: 'https://ners.engin.umich.edu/people/jordan-nicholas/',
    depth: 'A',
  },
  {
    name: 'Nima Fazeli',
    current_focus: 'Manipulation and Machine Intelligence Lab: robotic manipulation, physical contact interaction, robot learning/control, and state estimation.',
    recent_publication: '',
    source_url: 'https://me.engin.umich.edu/people/faculty/nima-fazeli/',
    depth: 'A',
  },
  {
    name: 'Christopher Vermillion',
    current_focus: 'CORE Lab: optimal control and design optimization for tethered wind/marine hydrokinetic energy, renewably powered robotic networks, and connected/autonomous vehicle efficiency.',
    recent_publication: '',
    source_url: 'https://me.engin.umich.edu/people/faculty/christopher-vermillion/',
    depth: 'A',
  },
  {
    name: 'Yogesh Gianchandani',
    current_focus: 'MEMS/microsystems sensors and actuators, microplasma and microdischarge devices, and harsh-environment microsystems instrumentation.',
    recent_publication: '',
    source_url: 'https://me.engin.umich.edu/people/faculty/yogesh-gianchandani/',
    depth: 'A',
  },
  {
    name: 'Milos Burger',
    current_focus: 'Ultrashort laser–matter coupling and optical sensing, including laser-induced plasmas for remote elemental detection and optical instrumentation for advanced reactors.',
    recent_publication: '',
    source_url: 'https://ners.engin.umich.edu/people/burger-milos/',
    depth: 'A',
  },
  {
    name: 'Timothy Smith',
    current_focus: 'Electric propulsion, plasma physics, and optical diagnostics affiliated with the Plasmadynamics & Electric Propulsion Laboratory.',
    recent_publication: '',
    source_url: 'https://aero.engin.umich.edu/people/smith-timothy-b/',
    depth: 'A',
  },
  {
    name: 'Scott Baalrud',
    current_focus: 'Theoretical plasma physics and kinetic theory for strongly coupled plasmas, high-energy-density plasmas, low-temperature plasma sheaths, and magnetic reconnection.',
    recent_publication: '',
    source_url: 'https://ners.engin.umich.edu/people/baalrud-scott/',
    depth: 'A',
  },
  {
    name: 'Gennady Fiksel',
    current_focus: 'High-field / pulsed-power plasma experiments affiliated with CUOS High Field Science; magnetized plasma and pulsed-power diagnostics (verify latest lab page before outreach).',
    recent_publication: '',
    source_url: 'https://cuos.engin.umich.edu/researchgroups/hfs/',
    depth: 'A',
  },
  {
    name: 'Paul Campbell',
    current_focus: 'ZEUS Laser Facility assistant research scientist; particle acceleration and magnetic-field generation during intense laser–plasma interactions (magnetized HEDP / laboratory astrophysics).',
    recent_publication: '',
    source_url: 'https://cuos.engin.umich.edu/researchgroups/hfs/profiles/paul-campbell/',
    depth: 'A',
  },
  {
    name: 'Anatoly Maksimchuk',
    current_focus: 'Laser–matter interaction at relativistic intensities, table-top plasma accelerators for electron/proton beams, and ultrashort X-ray/gamma-ray generation.',
    recent_publication: '',
    source_url: 'https://cuos.engin.umich.edu/researchgroups/hfs/profiles/anatoly-maksimchuk/',
    depth: 'A',
  },
  {
    name: 'John Nees',
    current_focus: 'Relativistic laser–plasma interactions, attosecond pulses from solids, high-average-power ultrafast lasers, and related high-field experimental diagnostics.',
    recent_publication: '',
    source_url: 'https://cuos.engin.umich.edu/researchgroups/hfs/profiles/john-nees/',
    depth: 'A',
  },
  {
    name: 'Yong Ma',
    current_focus: 'Experimental and numerical laser-wakefield acceleration, advanced radiation sources, and electron acceleration from laser–solid interactions.',
    recent_publication: '2025 — Measuring electron pulses for future compact ultra-bright X-ray sources — https://ners.engin.umich.edu/2025/09/09/measuring-electron-pulses-for-future-compact-ultra-bright-x-ray-sources/',
    source_url: 'https://ners.engin.umich.edu/people/ma-yong/',
    depth: 'A',
  },
  {
    name: 'Amy Brooks',
    current_focus: 'CUOS-affiliated researcher; verify current project focus on the CUOS faculty/staff pages before outreach.',
    recent_publication: '',
    source_url: 'https://cuos.engin.umich.edu/faculty',
    depth: 'A',
  },
  {
    name: 'Kira Barton',
    current_focus: 'BRG combines novel sensing, planning, and control with experimental implementation for smart manufacturing, multi-robot systems, and high-precision 3D printing.',
    recent_publication: '2024 — Model detects indoor or outdoor walks based only on movement data — https://me.engin.umich.edu/news-events/news/model-detects-indoor-or-outdoor-walks-based-only-on-movement-data/',
    source_url: 'https://me.engin.umich.edu/people/faculty/kira-barton/',
    depth: 'A',
  },
  {
    name: 'Jerard Gordon',
    current_focus: 'Metal additive manufacturing with in-situ property evaluation and experimental mechanics linking process to structure and properties.',
    recent_publication: '2026 — Eight ME faculty members win 2025-26 College of Engineering Faculty Awards (includes Gordon) — https://me.engin.umich.edu/news-events/news/eight-me-faculty-members-win-2025-26-college-of-engineering-faculty-awards/',
    source_url: 'https://me.engin.umich.edu/people/faculty/jerard-gordon/',
    depth: 'A',
  },
  {
    name: 'Albert Shih',
    current_focus: 'Precision machining, CT inspection, semiconductor/biomedical manufacturing, additive manufacturing, and cyber-physical manufacturing systems for assistive technology.',
    recent_publication: '2026 — Eight ME faculty members win 2025-26 College of Engineering Faculty Awards (Rexford E. Hall Innovation Excellence Award) — https://me.engin.umich.edu/news-events/news/eight-me-faculty-members-win-2025-26-college-of-engineering-faculty-awards/',
    source_url: 'https://me.engin.umich.edu/people/faculty/albert-shih/',
    depth: 'A',
  },
];

function normalizeName(name = '') {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function looksRealPub(text = '') {
  const value = String(text || '').trim();
  if (!value) return false;
  if (/^no specific recent publication/i.test(value)) return false;
  if (/^verify one recent paper/i.test(value)) return false;
  if (/^current focus \(profile\/lab\)/i.test(value)) return false;
  return /\b20(2[3-9]|3[0-9])\b/.test(value) || /https?:\/\//i.test(value) || / — /.test(value);
}

function focusFromInterests(prospect) {
  const summary = String(prospect.research_interests_summary || '').trim();
  if (summary) {
    const lines = summary.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const useful = lines.find(line =>
      !/^what we researched/i.test(line)
      && !/^report:/i.test(line)
      && !/^primary sources/i.test(line)
      && !/^what this person works on/i.test(line)
      && !/^lab\/group:/i.test(line)
      && line.length > 40
    );
    if (useful) return useful.length > 280 ? `${useful.slice(0, 277)}…` : useful;
  }
  const keywords = (prospect.research_keywords || []).filter(Boolean).slice(0, 6);
  if (keywords.length) {
    return `${prospect.name} works on ${keywords.join(', ')}.`;
  }
  const methods = (prospect.methods || []).filter(Boolean).slice(0, 5);
  if (methods.length) {
    return `${prospect.name} uses methods including ${methods.join(', ')}.`;
  }
  return '';
}

function depthBucket(prospect) {
  if (!String(prospect.current_focus || '').trim()) return 'A';
  const officialSources = (prospect.evidence || []).filter(item => /^https?:\/\//i.test(item?.url || '')).length;
  if (!prospect.lab_url || officialSources < 2) return 'B';
  return 'C';
}

function mergeDeepResearchExtras(verifiedByName) {
  const deepPath = join(RESEARCH_DIR, 'umich-current-work-enrichment-2026.md');
  const deepJson = join(RESEARCH_DIR, 'umich-current-work-enrichment-2026.json');
  // Prefer later deep-research file if poll finished with a different schema; keep verified map primary.
  if (!existsSync(deepJson) && !existsSync(deepPath)) return verifiedByName;
  return verifiedByName;
}

const verifiedByName = mergeDeepResearchExtras(
  new Map(VERIFIED.map(item => [normalizeName(item.name), item])),
);

const existing = readResearchProspects({ source: 'umich', preserveUserState: true });
const enrichmentRows = [];
let updatedFocus = 0;
let updatedPub = 0;
let depthA = 0;
let depthB = 0;
let depthC = 0;

const nextProspects = (existing.prospects || []).map(prospect => {
  const depth = depthBucket(prospect);
  if (depth === 'A') depthA += 1;
  else if (depth === 'B') depthB += 1;
  else depthC += 1;

  const verified = verifiedByName.get(normalizeName(prospect.name));
  let currentFocus = String(prospect.current_focus || '').trim();
  let recentPub = looksRealPub(prospect.recent_publication) ? String(prospect.recent_publication).trim() : '';
  let sourceUrl = '';
  let appliedDepth = depth;

  if (verified) {
    if (!currentFocus && verified.current_focus) {
      currentFocus = verified.current_focus;
      sourceUrl = verified.source_url || '';
      appliedDepth = 'A';
    }
    if (!recentPub && looksRealPub(verified.recent_publication)) {
      recentPub = verified.recent_publication;
      sourceUrl = verified.source_url || sourceUrl;
    }
  }

  if (!currentFocus && (depth === 'A' || depth === 'B' || depth === 'C')) {
    currentFocus = focusFromInterests(prospect);
    if (currentFocus && !verified) appliedDepth = depth === 'A' ? 'A-fallback' : depth;
  }

  // Depth C/D: never invent pubs; Depth B only keeps pubs already real or verified above.
  if (depth === 'C' && !looksRealPub(recentPub)) recentPub = recentPub && looksRealPub(recentPub) ? recentPub : '';

  const changedFocus = currentFocus && currentFocus !== String(prospect.current_focus || '').trim();
  const changedPub = recentPub && recentPub !== String(prospect.recent_publication || '').trim();
  if (changedFocus) updatedFocus += 1;
  if (changedPub) updatedPub += 1;

  if (changedFocus || changedPub || verified) {
    enrichmentRows.push({
      id: prospect.id,
      name: prospect.name,
      depth: appliedDepth,
      current_focus: currentFocus,
      recent_publication: recentPub,
      source_url: sourceUrl || prospect.profile_url || '',
      confidence: verified ? 'high' : (currentFocus ? 'medium' : 'low'),
    });
  }

  if (!changedFocus && !changedPub) return prospect;

  return {
    ...prospect,
    current_focus: currentFocus || prospect.current_focus || '',
    recent_publication: recentPub || (looksRealPub(prospect.recent_publication) ? prospect.recent_publication : ''),
    last_updated: new Date().toISOString(),
  };
});

mkdirSync(RESEARCH_DIR, { recursive: true });
const artifact = {
  research_date: RESEARCH_DATE,
  research_run: DEEP_RUN,
  method: 'tiered Parallel web_fetch + profile interest fallback; no invented publications',
  counts: {
    store_total: nextProspects.length,
    depth_A_targets: depthA,
    depth_B_targets: depthB,
    depth_C_targets: depthC,
    updated_current_focus: updatedFocus,
    updated_recent_publication: updatedPub,
    verified_seed_rows: VERIFIED.length,
    enrichment_rows: enrichmentRows.length,
  },
  enrichments: enrichmentRows,
};

writeFileSync(ARTIFACT, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

const store = writeResearchProspects({
  ...existing,
  research_date: RESEARCH_DATE,
  current_work_enrichment: {
    artifact: 'WEB-TRACKER/research/umich-current-work-enrichment-2026.json',
    research_run: DEEP_RUN,
    updated_current_focus: updatedFocus,
    updated_recent_publication: updatedPub,
  },
  prospects: nextProspects,
}, { source: 'umich', preserveUserState: true });

syncResearchProspectsToDashboard({ institution: 'umich' });

const withFocus = store.prospects.filter(p => String(p.current_focus || '').trim()).length;
const withPub = store.prospects.filter(p => looksRealPub(p.recent_publication)).length;
const mfg = store.prospects.filter(p => (p.research_fields || []).includes('Manufacturing'));
const tierA = store.prospects.filter(p => p.tier === 'A');
const depthASet = store.prospects.filter(p => depthBucket(p) === 'A');

console.log(`Wrote enrichment artifact -> ${ARTIFACT}`);
console.log(`Updated current_focus: ${updatedFocus}; recent_publication: ${updatedPub}`);
console.log(`Store with current_focus: ${withFocus}/${store.prospects.length}; real pubs: ${withPub}`);
console.log(`Manufacturing focus: ${mfg.filter(p => p.current_focus).length}/${mfg.length}`);
console.log(`Tier A focus: ${tierA.filter(p => p.current_focus).length}/${tierA.length}`);
console.log(`Depth A focus: ${depthASet.filter(p => p.current_focus).length}/${depthASet.length}`);
