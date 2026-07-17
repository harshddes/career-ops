#!/usr/bin/env node
/**
 * Build Manufacturing outreach prospects from the locked Related Faculty roster
 * on https://me.engin.umich.edu/research/areas/manufacturing/
 *
 * Honesty: emails/labs/pubs only from profile/lab extracts + verified news.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyResearchFitScoring } from '../lib/research-fit-scoring.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESEARCH_DIR = join(__dirname, '..', 'research');
const RESEARCH_DATE = '2026-07-09';
const AREA_URL = 'https://me.engin.umich.edu/research/areas/manufacturing/';
const SOURCE_REPORT = 'WEB-TRACKER/research/umich-me-manufacturing-outreach-prospects-2026.json';
const DEEP_RUN = 'trun_dd47611047ba4519a557c2ce4e3b5f75';

/** Locked 17-name Related Faculty roster + scoring from profile/lab extracts. */
const ROSTER = [
  {
    slug: 'chinedum-okwudire',
    name: 'Chinedum Okwudire',
    outreach_tier: 'T1',
    score: 4.7,
    tier: 'A',
    email: 'okwudire@umich.edu',
    title: 'Professor, Mechanical Engineering; Director, UMAMI',
    lab: 'Smart and Sustainable Automation Research Lab (S2A)',
    lab_url: 'http://s2a-lab.engin.umich.edu/',
    interests: 'Manufacturing automation with applications in additive manufacturing (3D printing), nano-positioning, machining, distributed manufacturing, and smart manufacturing systems.',
    current_focus: 'S2A Lab improves manufacturing machines via mechatronics, sensing, actuation, computing, and controls, with a key focus on additive manufacturing including LPBF laser-path optimization and vibration-compensated printing.',
    recent_publication: '2024 — Ulendo HC laser-path optimization add-in for Dyndrite LPBF Pro (heat-compensation algorithm from Okwudire U-M research; reported ~50% mean deformation / ~88% residual stress reduction) — https://www.digitalengineering247.com/article/ulendo-introduces-add-in-to-dyndrite-lpbf-pro',
    methods: ['LPBF laser-path optimization', 'vibration compensation', 'AM machine controls', 'nano-positioning', 'DAQ/sensing for machines'],
    flags: { laser_or_optical: true, lpbf_am: true, process_sensing: true, sheet_metal_or_forming: false },
    primary: 'LPBF / AM instrumentation & laser-path process control',
    secondary: 'medium',
    role_note: 'tenure_track_pi',
    pitch: 'Lead with LPBF/AM process instrumentation: laser-path / heat-compensation monitoring, vibration-aware machine DAQ, and test automation around metal AM — not laser-physics authorship. S2A is actively seeking PhD students/postdocs.',
  },
  {
    slug: 'chenhui-shao',
    name: 'Chenhui Shao',
    outreach_tier: 'T1',
    score: 4.5,
    tier: 'A',
    email: 'chshao@umich.edu',
    title: 'Associate Professor, Mechanical Engineering',
    lab: 'Connected and Intelligent Manufacturing Systems (CIMS) Lab',
    lab_url: 'https://shaolab.engin.umich.edu/',
    interests: 'Smart manufacturing; machine learning; in-situ process monitoring and real-time control; materials joining; robotic additive manufacturing; 3D metrology; human-robot collaboration.',
    current_focus: 'CIMS Lab advances in-situ process monitoring, real-time control, vision-based inspection, materials joining, and robotic additive manufacturing for quality and efficiency.',
    recent_publication: '2026 — Hybrid synthetic data generation with domain randomization enables zero-shot vision-based part inspection under extreme class imbalance (Journal of Manufacturing Processes) — https://shaolab.engin.umich.edu/paper-on-hybrid-sdg-enables-zero-shot-vision-based-part-inspection-published-in-journal-of-manufacturing-processes/',
    methods: ['in-situ process monitoring', 'vision inspection', 'real-time control', '3D metrology', 'robotic AM'],
    flags: { laser_or_optical: true, lpbf_am: true, process_sensing: true, sheet_metal_or_forming: false },
    primary: 'in-situ process sensing / monitoring / metrology',
    secondary: 'medium',
    role_note: 'tenure_track_pi',
    pitch: 'Pitch DAQ, optical/vision sensing, and process-monitoring automation for joining/AM quality control. Strong weld-monitoring industry impact history.',
  },
  {
    slug: 'kira-barton',
    name: 'Kira Barton',
    outreach_tier: 'T1',
    score: 4.4,
    tier: 'A',
    email: 'bartonkl@umich.edu',
    title: 'Professor, Mechanical Engineering; Professor, Robotics; Miller Faculty Scholar',
    lab: 'Barton Research Group',
    lab_url: 'https://brg.engin.umich.edu/',
    interests: 'Control theory and applications; iterative learning control; multi-agent systems; human/robot collaborations; smart manufacturing; manufacturing robotics; high-performance micro/nano-scale printing.',
    current_focus: 'BRG combines novel sensing, planning, and control with experimental implementation for smart manufacturing, multi-robot systems, and high-precision 3D printing.',
    recent_publication: '',
    methods: ['smart manufacturing controls', 'sensing + experimental systems', 'micro/nano printing', 'manufacturing robotics'],
    flags: { laser_or_optical: false, lpbf_am: true, process_sensing: true, sheet_metal_or_forming: false },
    primary: 'manufacturing controls + sensing/experimental systems',
    secondary: 'low',
    role_note: 'tenure_track_pi',
    pitch: 'Frame around industrial-style DAQ, sensor calibration, and closed-loop testbeds for smart manufacturing / precision printing — not ILC theory authorship.',
  },
  {
    slug: 'jerard-gordon',
    name: 'Jerard Gordon',
    outreach_tier: 'T1',
    score: 4.2,
    tier: 'A',
    email: 'jerardvg@umich.edu',
    title: 'Assistant Professor, Mechanical Engineering',
    lab: 'Gordon Group',
    lab_url: 'https://gordongroup.engin.umich.edu/',
    interests: 'Process-structure-property relationships of advanced materials; metal additive manufacturing; in-situ property evaluation; experimental and computational mechanics; materials discovery; design and manufacturing.',
    current_focus: 'Metal additive manufacturing with in-situ property evaluation and experimental mechanics linking process to structure and properties.',
    recent_publication: '',
    methods: ['metal AM', 'in-situ property evaluation', 'experimental mechanics'],
    flags: { laser_or_optical: true, lpbf_am: true, process_sensing: true, sheet_metal_or_forming: false },
    primary: 'metal AM in-situ evaluation / experimental systems',
    secondary: 'medium',
    role_note: 'tenure_track_pi',
    pitch: 'Offer in-situ sensing, DAQ, and experimental-rig automation for metal AM property evaluation. Laser/optical diagnostics transfer is honest if framed as measurement, not laser design.',
  },
  {
    slug: 'albert-shih',
    name: 'Albert Shih',
    outreach_tier: 'T2',
    score: 3.9,
    tier: 'B',
    email: 'shiha@umich.edu',
    title: 'Professor, Mechanical Engineering; Professor, Biomedical Engineering; Yoram Koren Collegiate Professor',
    lab: 'Biomedical Manufacturing and Design Lab',
    lab_url: 'https://sites.google.com/umich.edu/shihlabs',
    interests: 'Manufacturing; semiconductor manufacturing; biomedical device design/manufacturing; computed tomography for inspection; precision machining; additive manufacturing; cyber-physical manufacturing for assistive technology.',
    current_focus: 'Precision machining, CT inspection, semiconductor/biomedical manufacturing, and cyber-physical manufacturing systems including assistive-technology devices.',
    recent_publication: '',
    methods: ['CT inspection', 'precision machining', 'AM', 'metrology'],
    flags: { laser_or_optical: false, lpbf_am: true, process_sensing: true, sheet_metal_or_forming: false },
    primary: 'metrology / CT inspection / machining instrumentation',
    secondary: 'high',
    role_note: 'tenure_track_pi',
    pitch: 'Best bridge is CT/inspection automation and calibrated sensing on manufacturing testbeds. Secondary: industrial manufacturing systems learning relevant to production/assembly.',
  },
  {
    slug: 'jing-tang',
    name: 'Jing Tang',
    outreach_tier: 'T2',
    score: 4.0,
    tier: 'A',
    email: 'jingtang@umich.edu',
    title: 'Assistant Professor, Mechanical Engineering',
    lab: 'Tang Group',
    lab_url: 'https://tang.engin.umich.edu/',
    interests: 'Critical minerals/materials, batteries, catalysis, electrochemistry; materials synthesis, manufacturing, and characterization; autonomous laboratory / AI-powered materials discovery.',
    current_focus: 'Autonomous laboratory and AI-powered materials discovery/manufacturing characterization for critical minerals, batteries, and related materials systems.',
    recent_publication: '2025 — AI-driven laboratory project selected for OVPR Bold Challenges Boost cohort (autonomous laboratory) — https://me.engin.umich.edu/news-events/news/ai-driven-laboratory-project-receives-boost-funding-from-ovpr/',
    methods: ['autonomous lab systems', 'materials characterization', 'experimental automation'],
    flags: { laser_or_optical: false, lpbf_am: false, process_sensing: true, sheet_metal_or_forming: false },
    primary: 'autonomous-lab instrumentation / experimental automation',
    secondary: 'low',
    role_note: 'tenure_track_pi',
    pitch: 'Own instrumentation/DAQ backbone for autonomous-lab synthesis and characterization workflows.',
  },
  {
    slug: 'uduak-inyang-udoh',
    name: 'Uduak Inyang-Udoh',
    outreach_tier: 'T2',
    score: 3.8,
    tier: 'B',
    email: 'udinyang@umich.edu',
    title: 'Assistant Professor, Mechanical Engineering',
    lab: 'Autonomous & Intelligent Systems (AI-Sys) Lab',
    lab_url: 'https://aisys.engin.umich.edu/',
    interests: 'Control theory, graph theory, and physics-guided machine learning for data-rich advanced manufacturing, thermal and energy storage systems.',
    current_focus: 'Physics-guided ML and controls for data-rich advanced manufacturing and thermal/energy storage experiments.',
    recent_publication: '',
    methods: ['controls', 'data-rich manufacturing experiments', 'sensing'],
    flags: { laser_or_optical: false, lpbf_am: false, process_sensing: true, sheet_metal_or_forming: false },
    primary: 'data-rich manufacturing sensing / controls',
    secondary: 'low',
    role_note: 'tenure_track_pi',
    pitch: 'Pitch instrumentation/data engineer for manufacturing and thermal/energy experiments.',
  },
  {
    slug: 'neil-dasgupta',
    name: 'Neil Dasgupta',
    outreach_tier: 'T2',
    score: 3.9,
    tier: 'B',
    email: 'ndasgupt@umich.edu',
    title: 'Professor, Mechanical Engineering; Professor, Materials Science and Engineering',
    lab: 'Dasgupta Research Group',
    lab_url: 'https://dasgupta.engin.umich.edu/',
    interests: 'Renewable energy and energy storage; batteries; solar energy; catalysis; nanomanufacturing; atomic layer deposition; in situ/operando electrochemistry; high-resolution microscopy and spectroscopy.',
    current_focus: 'Nanomanufacturing and energy devices with in situ/operando characterization, ALD, and advanced microscopy/spectroscopy of nanomaterials.',
    recent_publication: '2023 — $3M NSF grant to boost state-of-the-art solar manufacturing — https://me.engin.umich.edu/news-events/news/3m-nsf-grant-to-boost-state-of-the-art-solar-manufacturing/',
    methods: ['nanomanufacturing', 'in situ/operando characterization', 'ALD', 'spectroscopy'],
    flags: { laser_or_optical: true, lpbf_am: false, process_sensing: true, sheet_metal_or_forming: false },
    primary: 'nanomanufacturing + in-situ optical/spectroscopic characterization',
    secondary: 'low',
    role_note: 'tenure_track_pi',
    pitch: 'Optical/spectroscopic diagnostics and vacuum/DAQ discipline transfer to in situ nanomanufacturing characterization — not battery chemistry mastery.',
  },
  {
    slug: 'xiaogan-liang',
    name: 'Xiaogan Liang',
    outreach_tier: 'T2',
    score: 3.8,
    tier: 'B',
    email: 'xiaoganl@umich.edu',
    title: 'Professor, Mechanical Engineering; Associate Chair for Undergraduate Education',
    lab: 'Nanoengineering and Nanodevice Laboratory',
    lab_url: 'https://nnl.engin.umich.edu/',
    interests: 'Advanced nanofabrication, nanomanufacturing, and microsystem technologies for nanoelectronics, nanophotonics, integrated biosensing, and airborne sensing on microdrones.',
    current_focus: 'Nanofabrication/nanomanufacturing of devices for nanophotonics, biosensing, and microsystem sensing platforms.',
    recent_publication: '',
    methods: ['nanofabrication', 'nanomanufacturing', 'microsystem sensing'],
    flags: { laser_or_optical: true, lpbf_am: false, process_sensing: true, sheet_metal_or_forming: false },
    primary: 'nanomanufacturing / microsystem sensing instrumentation',
    secondary: 'low',
    role_note: 'tenure_track_pi',
    pitch: 'Offer microsystem sensing/instrumentation and measurement automation; do not claim nanofabrication process ownership.',
  },
  {
    slug: 'mihaela-banu',
    name: 'Mihaela Banu',
    outreach_tier: 'T2',
    score: 3.7,
    tier: 'B',
    email: 'mbanu@umich.edu',
    title: 'Professor, Mechanical Engineering; OVPR Collegiate Research Professor',
    lab: 'Banu research (lightweight materials / forming)',
    lab_url: 'https://mbanu.engin.umich.edu/',
    interests: 'Lightweight materials; micro- and nanocellulose composites; natural fiber composites and manufacturing processes for automotive and aerospace; multi-scale modeling; simulation of forming processes.',
    current_focus: 'Manufacturing processes and forming simulation for lightweight composites aimed at automotive and aerospace applications.',
    recent_publication: '',
    methods: ['forming process simulation', 'composites manufacturing', 'lightweight materials'],
    flags: { laser_or_optical: false, lpbf_am: false, process_sensing: false, sheet_metal_or_forming: true },
    primary: 'forming / composites manufacturing processes',
    secondary: 'high',
    role_note: 'tenure_track_pi',
    pitch: 'Secondary manufacturing-learning fit is strong (automotive forming/composites). Primary research help only if experimental process sensing/DAQ is needed — verify before claiming instrumentation fit.',
  },
  {
    slug: 'jeffrey-abell',
    name: 'Jeffrey Abell',
    outreach_tier: 'T2',
    score: 3.6,
    tier: 'B',
    email: 'jaabell@umich.edu',
    title: 'Professor of Practice, Mechanical Engineering',
    lab: 'advanced manufacturing practice / industry translation',
    lab_url: '',
    interests: 'Industry-focused advanced manufacturing research opportunities; weld/process monitoring and manufacturing implementation (S.M. Wu Research Implementation Award, 2025).',
    current_focus: 'Professor of practice translating ~40 years of industry manufacturing experience into advanced manufacturing research opportunities at U-M ME.',
    recent_publication: '2025 — Jeff Abell joins U-M ME as professor of practice focusing on advanced manufacturing research opportunities — https://me.engin.umich.edu/news-events/news/jeff-abell-brings-industry-expertise-in-manufacturing-as-professor-of-practice/',
    methods: ['manufacturing process monitoring', 'industry translation', 'weld monitoring adjacency'],
    flags: { laser_or_optical: false, lpbf_am: false, process_sensing: true, sheet_metal_or_forming: true },
    primary: 'process monitoring / industry manufacturing systems',
    secondary: 'high',
    role_note: 'professor_of_practice',
    pitch: 'Strong secondary fit for industrial manufacturing learning (automotive/power-sector production). Ask about active experimental monitoring projects before pitching PhD-style research.',
  },
  {
    slug: 'wenda-tan',
    name: 'Wenda Tan',
    outreach_tier: 'T3',
    score: 3.3,
    tier: 'B',
    email: 'wendatan@umich.edu',
    title: 'Associate Professor, Mechanical Engineering',
    lab: 'physics-based manufacturing process modeling',
    lab_url: '',
    interests: 'Physics-based modeling for advanced manufacturing: CFD and computational materials modeling for additive manufacturing, welding, casting, powder metallurgy, and electrohydrodynamic printing.',
    current_focus: 'Computational modeling of AM, welding, casting, and related manufacturing processes rather than primarily experimental hardware labs.',
    recent_publication: '',
    methods: ['CFD for AM/welding', 'computational materials modeling'],
    flags: { laser_or_optical: true, lpbf_am: true, process_sensing: false, sheet_metal_or_forming: false },
    primary: 'computational AM/welding process modeling',
    secondary: 'medium',
    role_note: 'tenure_track_pi',
    pitch: 'Mostly computational — only outreach if they need experimental validation/DAQ partners. Do not pitch as primary experimental-systems home.',
  },
  {
    slug: 'daniel-cooper',
    name: 'Daniel Cooper',
    outreach_tier: 'T3',
    score: 3.2,
    tier: 'B',
    email: 'drcooper@umich.edu',
    title: 'Associate Professor, Mechanical Engineering; Director, Global CO₂ Initiative',
    lab: 'Resourceful Manufacturing and Design group (ReMaDe)',
    lab_url: 'http://remade.engin.umich.edu/',
    interests: 'Manufacturing and sustainability across scales: emissions/cost analyses of processes, factories, and material supply chains; technical analysis to capitalize on opportunities.',
    current_focus: 'Sustainable manufacturing systems analysis and resourceful manufacturing/design, including factory and supply-chain scale opportunities.',
    recent_publication: '2026 — Storied U-M manufacturing research space opens after $4.45 million in upgrades — https://me.engin.umich.edu/news-events/news/storied-u-m-manufacturing-research-space-opens-after-4-45-million-in-upgrades/',
    methods: ['sustainable manufacturing analysis', 'process/factory systems'],
    flags: { laser_or_optical: false, lpbf_am: false, process_sensing: false, sheet_metal_or_forming: true },
    primary: 'sustainable manufacturing systems',
    secondary: 'high',
    role_note: 'tenure_track_pi',
    pitch: 'Secondary manufacturing-learning fit is real; primary instrumentation fit is weak unless a specific experimental monitoring project exists.',
  },
  {
    slug: 'steve-skerlos',
    name: 'Steve Skerlos',
    outreach_tier: 'T3',
    score: 3.1,
    tier: 'B',
    email: 'skerlos@umich.edu',
    title: 'Professor, Mechanical Engineering; Professor, Civil and Environmental Engineering',
    lab: 'sustainable technology systems',
    lab_url: 'https://about.me/steve_skerlos',
    interests: 'Environmental and sustainable technology systems; life cycle product design optimization; pollution prevention for manufacturing; metalworking fluid formulation; membrane filtration; technology policy.',
    current_focus: 'Sustainable manufacturing technology systems, metalworking fluids, and pollution-prevention technologies for manufacturing processes.',
    recent_publication: '',
    methods: ['sustainable manufacturing tech', 'metalworking fluids', 'process environmental systems'],
    flags: { laser_or_optical: false, lpbf_am: false, process_sensing: false, sheet_metal_or_forming: true },
    primary: 'sustainable machining / manufacturing process tech',
    secondary: 'high',
    role_note: 'tenure_track_pi',
    pitch: 'Useful for manufacturing-process learning (machining fluids/sustainability). Instrumentation bridge only if lab needs sensing/DAQ on process experiments.',
  },
  {
    slug: 'alauddin-ahmed',
    name: 'Alauddin Ahmed',
    outreach_tier: 'T3',
    score: 2.9,
    tier: 'C',
    email: 'alauddin@umich.edu',
    title: 'Associate Research Scientist, Mechanical Engineering',
    lab: 'energy storage / materials-by-design (computational)',
    lab_url: '',
    interests: 'Energy storage and battery manufacturing-related materials; nanoporous materials; applied ML/AI, DFT, MD; materials by design.',
    current_focus: 'Computational materials-by-design for energy storage and battery-related manufacturing materials rather than shop-floor manufacturing labs.',
    recent_publication: '',
    methods: ['computational materials', 'ML for materials', 'battery materials'],
    flags: { laser_or_optical: false, lpbf_am: false, process_sensing: false, sheet_metal_or_forming: false },
    primary: 'computational battery/materials manufacturing',
    secondary: 'low',
    role_note: 'research_scientist',
    pitch: 'Low experimental-systems fit; secondary contact only if a sponsoring PI needs materials-computation collaboration.',
  },
  {
    slug: 'nicole-friedberg',
    name: 'Nicole Friedberg',
    outreach_tier: 'T4',
    score: 1.6,
    tier: 'D',
    email: 'nfried@umich.edu',
    title: 'LEO Lecturer III, Mechanical Engineering',
    lab: 'teaching / MEng practicum',
    lab_url: 'https://me.engin.umich.edu/academics/integrative-systems-design/meng-practicum-partnership/',
    interests: 'Lecturer on statistical analysis, Six Sigma, project management, supply chain, quality engineering; industry experience in defense, aerospace, automotive, and financial industries.',
    current_focus: 'Teaching-focused manufacturing/quality/project-management instruction; no research group listed.',
    recent_publication: '',
    methods: ['teaching', 'quality engineering', 'Six Sigma'],
    flags: { laser_or_optical: false, lpbf_am: false, process_sensing: false, sheet_metal_or_forming: true },
    primary: 'teaching / quality systems',
    secondary: 'medium',
    role_note: 'lecturer',
    pitch: 'Skip for research/PhD outreach; possible informational chat on industrial quality/manufacturing practice only.',
  },
  {
    slug: 'jun-ni',
    name: 'Jun Ni',
    outreach_tier: 'T4',
    score: 1.7,
    tier: 'D',
    email: 'junni@umich.edu',
    title: 'Professor Emeritus, Mechanical Engineering; Shien-Ming (Sam) Wu Collegiate Professor Emeritus of Manufacturing Science',
    lab: 'S.M. Wu Manufacturing Research Center',
    lab_url: 'http://wumrc.engin.umich.edu/',
    interests: 'Intelligent maintenance of large industrial systems; optimization of manufacturing operations; manufacturing process modeling; precision engineering and metrology; quality control.',
    current_focus: 'Emeritus manufacturing science leader historically tied to Wu Manufacturing Research Center; active student pipeline unclear.',
    recent_publication: '',
    methods: ['manufacturing process modeling', 'metrology', 'quality control'],
    flags: { laser_or_optical: false, lpbf_am: false, process_sensing: true, sheet_metal_or_forming: true },
    primary: 'emeritus manufacturing science / metrology',
    secondary: 'medium',
    role_note: 'emeritus',
    pitch: 'Network only. Prefer active Wu-center researchers or current Manufacturing T1/T2 PIs for applications.',
  },
];

function source(label, url, note = '') {
  return { type: 'source', label, url, date: RESEARCH_DATE, note };
}

function buildProspect(entry) {
  const profileUrl = `https://me.engin.umich.edu/people/faculty/${entry.slug}/`;
  const keywords = entry.interests
    .split(/[;,]|\band\b/i)
    .map(s => s.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(s => s.length >= 3 && s.length <= 70)
    .slice(0, 8);

  const vectors = [
    'manufacturing',
    `manufacturing outreach ${entry.outreach_tier}`,
    entry.flags.lpbf_am ? 'LPBF / AM' : 'experimental systems',
    entry.flags.process_sensing ? 'process sensing' : 'DAQ',
    entry.flags.laser_or_optical ? 'optical diagnostics' : 'controls',
  ].slice(0, 5);

  const evidence = [
    source('ME Manufacturing area (Related Faculty)', AREA_URL),
    source('ME faculty profile', profileUrl),
    source('Deep research run', `WEB-TRACKER/research/umich-me-manufacturing-outreach-2026.json`, `run ${DEEP_RUN}`),
  ];
  if (entry.lab_url) evidence.push(source(entry.lab || 'Lab page', entry.lab_url));
  if (entry.recent_publication) {
    const urlMatch = entry.recent_publication.match(/https?:\/\/\S+/);
    if (urlMatch) evidence.push(source('Recent signal', urlMatch[0]));
  }

  const fit = entry.role_note === 'emeritus' || entry.role_note === 'lecturer'
    ? `Listed on ME Manufacturing Related Faculty but ${entry.role_note}; keep as low-priority network node only.`
    : `Manufacturing current work: ${entry.current_focus} Primary help fit: ${entry.primary}. Secondary manufacturing-learning relevance: ${entry.secondary}.`;

  return applyResearchFitScoring({
    id: `umich-${entry.slug}-manufacturing`,
    name: entry.name,
    title: entry.title,
    unit: 'Michigan Engineering',
    department: 'Mechanical Engineering',
    lab: entry.lab,
    role_type: 'faculty_or_research_staff',
    campus: 'Ann Arbor',
    profile_url: profileUrl,
    lab_url: entry.lab_url || '',
    contact_email: entry.email || '',
    contact_page: profileUrl,
    phone: '',
    research_keywords: keywords.length ? keywords : ['manufacturing'],
    methods: entry.methods,
    facilities: entry.lab ? [entry.lab] : [],
    transfer_vectors: vectors,
    research_fields: ['Manufacturing'],
    outreach_tier: '',
    area_assessments: {
      Manufacturing: {
        roster_tier: entry.outreach_tier,
        primary_fit: entry.primary,
        secondary_learning: entry.secondary,
      },
    },
    manufacturing_fit_primary: entry.primary,
    manufacturing_fit_secondary: entry.secondary,
    current_focus: entry.current_focus,
    laser_or_optical_flag: entry.flags.laser_or_optical,
    lpbf_am_flag: entry.flags.lpbf_am,
    process_sensing_flag: entry.flags.process_sensing,
    sheet_metal_or_forming_flag: entry.flags.sheet_metal_or_forming,
    design_heavy: false,
    role_note: entry.role_note,
    hiring_signals: entry.slug === 'chinedum-okwudire'
      ? [{ type: 'source', label: 'S2A Lab openings for PhD/postdocs', url: 'http://s2a-lab.engin.umich.edu/', date: RESEARCH_DATE, note: 'Lab page states seeking PhD students and postdocs' }]
      : [],
    evidence,
    fit_rationale: fit,
    outreach_angle: entry.pitch,
    likely_route: entry.role_note === 'tenure_track_pi'
      ? 'Research staff / RA / PhD conversation with tenure-track PI.'
      : entry.role_note === 'professor_of_practice'
        ? 'Industry-translation / project conversation; confirm research openings.'
        : entry.role_note === 'research_scientist'
          ? 'Secondary research-scientist contact; prefer sponsoring PI.'
          : 'Informational / network only.',
    opt_h1b_notes: 'University research roles can be cap-exempt H-1B candidates, but timeline must be raised early.',
    uncertainty_notes: entry.email
      ? 'Confirm current openings and verify one recent paper before outreach.'
      : 'Email missing or obscured; verify on faculty page before outreach.',
    research_interests_summary: entry.interests,
    recent_publication: entry.recent_publication || '',
    status: 'not_contacted',
    source_report: SOURCE_REPORT,
    first_seen: `${RESEARCH_DATE}T00:00:00.000Z`,
  });
}

function main() {
  const prospects = ROSTER.map(buildProspect);
  prospects.sort((a, b) => Number(b.score) - Number(a.score) || a.name.localeCompare(b.name));
  const byOutreach = prospects.reduce((acc, p) => {
    const tier = p.area_assessments?.Manufacturing?.roster_tier || 'unset';
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {});
  const out = {
    scope: 'U-M ME Manufacturing outreach prospects',
    research_run: DEEP_RUN,
    research_date: RESEARCH_DATE,
    source_report: SOURCE_REPORT,
    area_url: AREA_URL,
    roster_source: 'Related Faculty on ME Manufacturing area page (17 names)',
    segregation: {
      T1: 'Strongest LPBF/AM / process-sensing / manufacturing experimental-systems fit',
      T2: 'Solid manufacturing sensing/metrology/nanomanufacturing or high secondary learning fit',
      T3: 'Computational/sustainability-heavy or weaker experimental path',
      T4: 'Emeritus / lecturer / secondary-only',
    },
    counts: {
      total: prospects.length,
      by_outreach_tier: byOutreach,
      with_email: prospects.filter(p => p.contact_email).length,
      with_recent_publication: prospects.filter(p => p.recent_publication).length,
      with_current_focus: prospects.filter(p => p.current_focus).length,
    },
    prospects,
  };
  mkdirSync(RESEARCH_DIR, { recursive: true });
  const outPath = join(RESEARCH_DIR, 'umich-me-manufacturing-outreach-prospects-2026.json');
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${prospects.length} manufacturing prospects -> ${outPath}`);
  console.log(`Outreach tiers: ${JSON.stringify(byOutreach)}`);
  console.log(`Recent pubs filled: ${out.counts.with_recent_publication}`);
}

main();
