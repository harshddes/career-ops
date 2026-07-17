#!/usr/bin/env node
/**
 * Build mechatronics/robotics outreach enrichment for ME faculty already (or newly)
 * present in the U-M research prospect store.
 *
 * Source of truth for roster: ME area page + deep research run.
 * Honesty: no invented emails/pubs; only published profile facts + outreach ranking.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyResearchFitScoring } from '../lib/research-fit-scoring.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESEARCH_DIR = join(__dirname, '..', 'research');
const RESEARCH_DATE = '2026-07-09';
const AREA_URL = 'https://me.engin.umich.edu/research/areas/mechatronics-robotics/';
const SOURCE_REPORT = 'WEB-TRACKER/research/umich-me-mechatronics-robotics-outreach-prospects-2026.json';
const DEEP_RUN = 'trun_dd47611047ba4519bc486f709ae0d38c';

/** Outreach segregation from deep research + profile extract. */
const ROSTER = [
  {
    slug: 'kenn-oldham',
    name: 'Kenn Oldham',
    outreach_tier: 'T1',
    score: 4.6,
    tier: 'A',
    email: 'oldham@umich.edu',
    lab: 'Vibration and Acoustics Laboratory: Microsystems',
    lab_url: 'http://microsystems.engin.umich.edu/',
    title: 'Professor, Mechanical Engineering',
    interests: 'Micro-mechatronic systems for endoscopic imaging; micro-robotic systems for manipulation and autonomous locomotion; novel sensing; MEMS modeling, system identification, and state estimation.',
    methods: ['MEMS sensing', 'optical imaging instrumentation', 'system identification', 'micro-mechatronics'],
    pitch: 'Offer detector/optical-chain calibration, DAQ automation, and MEMS readout support — not MEMS fabrication leadership.',
    design_heavy: false,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'jing-tang',
    name: 'Jing Tang',
    outreach_tier: 'T1',
    score: 4.5,
    tier: 'A',
    email: 'jingtang@umich.edu',
    lab: 'Tang Group',
    lab_url: 'https://tang.engin.umich.edu/',
    title: 'Assistant Professor, Mechanical Engineering',
    interests: 'Critical minerals/materials, batteries, catalysis, electrochemistry; autonomous laboratory and AI-powered materials discovery; materials synthesis, manufacturing, and characterization.',
    methods: ['autonomous lab systems', 'materials characterization', 'experimental automation'],
    pitch: 'Pitch as instrumentation/DAQ backbone for autonomous-lab workflows (sensors, vacuum/atmosphere interfaces, test automation).',
    design_heavy: false,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'nima-fazeli',
    name: 'Nima Fazeli',
    outreach_tier: 'T1',
    score: 4.4,
    tier: 'A',
    email: 'nfz@umich.edu',
    lab: 'Manipulation and Machine Intelligence Lab',
    lab_url: 'https://www.mmintlab.com/',
    title: 'Assistant Professor, Mechanical Engineering; Assistant Professor, Robotics',
    interests: 'Robotic manipulation, physical interaction and contact, robot learning and control, state estimation.',
    methods: ['robotic test platforms', 'force/contact sensing', 'state estimation', 'controls'],
    pitch: 'Offer sensor calibration, high-rate DAQ, and test-platform instrumentation for contact-rich experiments.',
    design_heavy: false,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'kira-barton',
    name: 'Kira Barton',
    outreach_tier: 'T1',
    score: 4.4,
    tier: 'A',
    email: 'bartonkl@umich.edu',
    lab: 'Barton Research Group',
    lab_url: 'https://brg.engin.umich.edu/',
    title: 'Professor, Mechanical Engineering; Professor, Robotics; Miller Faculty Scholar',
    interests: 'Control theory and applications; iterative learning control; multi-agent systems; human/robot collaborations; smart manufacturing; manufacturing robotics; micro/nano-scale printing.',
    methods: ['controls', 'smart manufacturing', 'process sensing', 'experimental systems'],
    pitch: 'Frame around industrial-style DAQ, in-line sensing quality, and closed-loop testbed automation — not ILC theory authorship.',
    design_heavy: false,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'christopher-vermillion',
    name: 'Christopher Vermillion',
    outreach_tier: 'T1',
    score: 4.3,
    tier: 'A',
    email: 'cvermill@umich.edu',
    lab: 'CORE Lab (Control & Optimization of Renewables & Energy)',
    lab_url: '',
    title: 'Associate Professor, Mechanical Engineering',
    interests: 'Optimal control and design optimization for renewable energy; tethered wind and marine hydrokinetic systems; mission planning for renewably powered robotic networks; connected/autonomous vehicles for fuel economy.',
    methods: ['controls', 'instrumented energy test rigs', 'mechatronic experiments'],
    pitch: 'Lead with test-rig instrumentation, synchronized DAQ, and experimental automation for tethered energy systems.',
    design_heavy: false,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'chinedum-okwudire',
    name: 'Chinedum Okwudire',
    outreach_tier: 'T2',
    score: 4.1,
    tier: 'A',
    email: 'okwudire@umich.edu',
    lab: 'Smart and Sustainable Automation Research Lab',
    lab_url: 'http://s2a-lab.engin.umich.edu/',
    title: 'Professor, Mechanical Engineering; Director, UMAMI',
    interests: 'Manufacturing automation: additive manufacturing, nano-positioning, machining, distributed manufacturing, and smart manufacturing systems.',
    methods: ['nano-positioning', 'machine-tool mechatronics', 'manufacturing automation', 'controls'],
    pitch: 'Offer cyber-physical instrumentation and DAQ automation on precision machine tools / AM testbeds.',
    design_heavy: false,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'chenhui-shao',
    name: 'Chenhui Shao',
    outreach_tier: 'T2',
    score: 3.9,
    tier: 'B',
    email: '',
    lab: 'Shao Manufacturing Lab',
    lab_url: 'https://shaolab.engin.umich.edu',
    title: 'Associate Professor, Mechanical Engineering',
    interests: 'Smart manufacturing; in-situ process monitoring and real-time control; robotic additive manufacturing; 3D metrology; human-robot collaboration.',
    methods: ['in-situ process sensing', 'manufacturing monitoring', 'metrology', 'controls'],
    pitch: 'Map optical/DAQ experience to in-situ AM process monitoring stacks.',
    design_heavy: false,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'uduak-inyang-udoh',
    name: 'Uduak Inyang-Udoh',
    outreach_tier: 'T2',
    score: 3.8,
    tier: 'B',
    email: 'uduak@umich.edu',
    lab: 'Autonomous & Intelligent Systems (AI-Sys) Lab',
    lab_url: 'https://aisys.engin.umich.edu/',
    title: 'Assistant Professor, Mechanical Engineering',
    interests: 'Control theory, graph theory, and physics-guided machine learning for data-rich advanced manufacturing, thermal and energy storage systems.',
    methods: ['controls', 'data-rich experiments', 'manufacturing sensing'],
    pitch: 'Pitch instrumentation/data engineer for thermal/energy/manufacturing experiments.',
    design_heavy: false,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'daniel-bruder',
    name: 'Daniel Bruder',
    outreach_tier: 'T2',
    score: 3.7,
    tier: 'B',
    email: 'bruderd@umich.edu',
    lab: 'FREE Lab',
    lab_url: 'http://www.freelaboratory.org/',
    title: 'Assistant Professor, Mechanical Engineering',
    interests: 'Design, modeling, and control of soft and other non-traditional robotic systems for safe assistance in unstructured environments.',
    methods: ['soft robotics', 'controls', 'experimental platforms'],
    pitch: 'Honest framing: historical design only; offer sensing, actuation control interfaces, and test-bench automation.',
    design_heavy: true,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'elliott-rouse',
    name: 'Elliott Rouse',
    outreach_tier: 'T2',
    score: 3.7,
    tier: 'B',
    email: 'ejrouse@umich.edu',
    lab: 'Neurobionics Lab',
    lab_url: 'https://neurobionics.engin.umich.edu/',
    title: 'Associate Professor, Mechanical Engineering; Associate Professor, Robotics',
    interests: 'Precision machine design; exoskeletons / robotic prostheses; brushless motors; human locomotion dynamics; biomechanics.',
    methods: ['wearable robot hardware', 'embedded test systems', 'precision electromechanics'],
    pitch: 'Instrumentation/DAQ/embedded contributor for wearable hardware — not current mechanism designer.',
    design_heavy: true,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'brent-gillespie',
    name: 'Brent Gillespie',
    outreach_tier: 'T2',
    score: 3.6,
    tier: 'B',
    email: 'brentg@umich.edu',
    lab: 'Haptix Lab',
    lab_url: 'https://haptixlab.engin.umich.edu/',
    title: 'Professor, Mechanical Engineering; Professor, Robotics',
    interests: 'Haptic interface and robotics.',
    methods: ['haptics', 'force sensing', 'real-time control'],
    pitch: 'Offer force-sensing calibration and real-time DAQ support for haptic test rigs.',
    design_heavy: false,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'tulga-ersal',
    name: 'Tulga Ersal',
    outreach_tier: 'T2',
    score: 3.4,
    tier: 'B',
    email: 'tersal@umich.edu',
    lab: 'autonomous / semi-autonomous vehicles',
    lab_url: '',
    title: 'Associate Professor, Mechanical Engineering',
    interests: 'Autonomous and semi-autonomous vehicles; human-autonomy interactions.',
    methods: ['controls', 'modeling', 'vehicle testbeds'],
    pitch: 'Only if hardware testbeds exist: sensor sync / DAQ for CAV experiments. Verify before claiming fit.',
    design_heavy: false,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'gabor-orosz',
    name: 'Gabor Orosz',
    outreach_tier: 'T2',
    score: 3.3,
    tier: 'B',
    email: '',
    lab: 'nonlinear dynamics / control',
    lab_url: '',
    title: 'Professor, Mechanical Engineering; Professor, Civil and Environmental Engineering',
    interests: 'Nonlinear dynamics and control, time delay systems, connected and automated vehicles, traffic flow.',
    methods: ['dynamics', 'controls', 'modeling'],
    pitch: 'Conditional: time-synchronized logging / hardware DAQ only if group runs physical experiments.',
    design_heavy: false,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'ramanarayan-vasudevan',
    name: 'Ramanarayan Vasudevan',
    outreach_tier: 'T2',
    score: 3.5,
    tier: 'B',
    email: 'ramv@umich.edu',
    lab: 'Roahm Lab',
    lab_url: 'http://www.roahmlab.com/',
    title: 'Associate Professor, Mechanical Engineering; Associate Professor, Robotics',
    interests: 'Optimization, modeling, design, and control of robotic systems that interact with humans and the environment.',
    methods: ['robot control', 'optimization', 'experimental robotics'],
    pitch: 'Hardware/experimental-rig support; verify current funded projects before outreach.',
    design_heavy: false,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'shorya-awtar',
    name: 'Shorya Awtar',
    outreach_tier: 'T3',
    score: 3.6,
    tier: 'B',
    email: 'awtar@umich.edu',
    lab: 'Precision Systems Design Laboratory',
    lab_url: 'https://psdl.engin.umich.edu/',
    title: 'Professor, Mechanical Engineering; Joseph E. Shigley Collegiate Professor of Engineering',
    interests: 'Mechanical design, precision engineering, human-centric design, mechatronic systems, and robotics; flexure mechanisms, electromagnetic actuators, medical devices, precision motion stages, MEMS.',
    methods: ['precision mechatronics', 'actuators', 'experimental systems'],
    pitch: 'Design-heavy lab: pitch as instrumentation/DAQ/test-validation contributor; admit design depth is historical.',
    design_heavy: true,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'diann-brei',
    name: 'Diann Brei',
    outreach_tier: 'T3',
    score: 3.5,
    tier: 'B',
    email: 'dibrei@umich.edu',
    lab: 'design / smart materials',
    lab_url: '',
    title: 'Professor, Mechanical Engineering',
    interests: 'Design; smart materials and structures; sensor and actuator design; structural dynamics; vibration and noise control; mechatronics, smart mechanisms.',
    methods: ['smart materials', 'sensors/actuators', 'mechatronics'],
    pitch: 'Offer sensor/actuator characterization setups and test automation; do not claim current design leadership.',
    design_heavy: true,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'albert-shih',
    name: 'Albert Shih',
    outreach_tier: 'T3',
    score: 3.6,
    tier: 'B',
    email: 'shiha@umich.edu',
    lab: 'Biomedical Manufacturing and Design Lab',
    lab_url: 'https://sites.google.com/umich.edu/shihlabs',
    title: 'Professor, Mechanical Engineering; Professor, Biomedical Engineering',
    interests: 'Manufacturing; semiconductor manufacturing; biomedical device design/manufacturing; computed tomography for inspection; additive manufacturing; cyber-physical manufacturing for assistive technology.',
    methods: ['CT inspection', 'manufacturing metrology', 'cyber-physical systems'],
    pitch: 'Best design-adjacent bridge: CT/inspection automation and calibrated sensing — biomedical domain OK if instrumentation is the hook.',
    design_heavy: true,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'kathleen-sienko',
    name: 'Kathleen Sienko',
    outreach_tier: 'T3',
    score: 3.2,
    tier: 'B',
    email: 'sienko@umich.edu',
    lab: 'Sienko Research Group',
    lab_url: 'http://sienkolab.engin.umich.edu/',
    title: 'Professor, Mechanical Engineering; Arthur F. Thurnau Professor',
    interests: 'Sensory augmentation, rehabilitation engineering, biomechanics, medical device design, design science.',
    methods: ['sensors for health', 'medical device prototyping', 'biomechanics'],
    pitch: 'Only if interested in rehab/medical sensing; instrumentation bridge is real, plasma bridge is not.',
    design_heavy: true,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'talia-moore',
    name: 'Talia Moore',
    outreach_tier: 'T3',
    score: 3.1,
    tier: 'B',
    email: 'taliaym@umich.edu',
    lab: 'EMbirLab',
    lab_url: 'https://www.embirlab.com/',
    title: 'Assistant Professor, Mechanical Engineering; Assistant Professor, Robotics',
    interests: 'Dynamics of terrestrial locomotion; bio-inspired design and robotics; soft robotics; animal-robot interaction.',
    methods: ['bio-inspired robotics', 'locomotion experiments', 'soft robotics'],
    pitch: 'Conditional: high-rate sensing on locomotion rigs only; weak plasma/instrumentation overlap otherwise.',
    design_heavy: true,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'bogdan-epureanu',
    name: 'Bogdan Epureanu',
    outreach_tier: 'T3',
    score: 3.2,
    tier: 'B',
    email: 'epureanu@umich.edu',
    lab: 'Epureanu Research Group',
    lab_url: '',
    title: 'Professor, Mechanical Engineering',
    interests: 'Biological/epidemiological systems, aerospace and automotive structures, turbomachinery; system identification and control for smart structures; linear/nonlinear dynamics experiments.',
    methods: ['system identification', 'dynamics experiments', 'smart structures'],
    pitch: 'Reach out only with a concrete sensing/ID paper hook.',
    design_heavy: false,
    role_note: 'tenure_track_pi',
  },
  {
    slug: 'yun-chen',
    name: 'Yun Chen',
    outreach_tier: 'T4',
    score: 2.8,
    tier: 'C',
    email: 'cyshi@umich.edu',
    lab: 'AI-enabled communication / sensing',
    lab_url: '',
    title: 'Associate Research Scientist, Mechanical Engineering',
    interests: 'AI-enabled communication, sensing, and robotic systems; hardware-software co-design; programmable sensing environments for robotics and cyber-physical systems.',
    methods: ['sensing systems', 'hardware-software co-design', 'robotics'],
    pitch: 'Secondary contact / collaborator path; prefer a tenure-track PI first.',
    design_heavy: false,
    role_note: 'research_scientist',
  },
  {
    slug: 'lauro-ojeda',
    name: 'Lauro Ojeda',
    outreach_tier: 'T4',
    score: 2.9,
    tier: 'C',
    email: 'lojeda@umich.edu',
    lab: 'inertial sensing / sensor data fusion',
    lab_url: '',
    title: 'Research Scientist, Mechanical Engineering',
    interests: 'Inertial sensing, sensor data fusion, Kalman filtering, localization, biomechanics, and human gait analysis.',
    methods: ['inertial sensing', 'sensor fusion', 'Kalman filtering'],
    pitch: 'Strong sensing chat; weak as sole PhD advisor unless a sponsoring PI is involved.',
    design_heavy: false,
    role_note: 'research_scientist',
  },
  {
    slug: 'sridhar-kota',
    name: 'Sridhar Kota',
    outreach_tier: 'T4',
    score: 1.8,
    tier: 'D',
    email: 'kota@umich.edu',
    lab: 'Compliant Systems Design Laboratory',
    lab_url: 'http://csdl.engin.umich.edu/',
    title: 'Professor Emeritus, Mechanical Engineering',
    interests: 'Bio-inspired engineering design; soft robots; compliant and shape-adaptive systems; topology optimization of compliant mechanisms; design for manufacturability.',
    methods: ['compliant mechanisms', 'soft robots', 'design optimization'],
    pitch: 'Emeritus — network only; active student pipeline unclear.',
    design_heavy: true,
    role_note: 'emeritus',
    include: true,
  },
  {
    slug: 'kristan-hilby',
    name: 'Kristan Hilby',
    outreach_tier: 'T4',
    score: 1.5,
    tier: 'D',
    email: 'khilby@umich.edu',
    lab: 'teaching / mechatronics instruction',
    lab_url: '',
    title: 'LEO Lecturer III, Mechanical Engineering',
    interests: 'Teaching-focused mechatronics instruction; no research group listed on ME profile.',
    methods: ['teaching'],
    pitch: 'Skip for research/PhD outreach; lecturer track only.',
    design_heavy: false,
    role_note: 'lecturer',
    include: true,
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
    'mechatronics & robotics',
    `mechatronics outreach ${entry.outreach_tier}`,
    ...(entry.design_heavy ? ['design-adjacent instrumentation'] : ['experimental systems']),
    ...(entry.methods.some(m => /sensor|daq|sensing|optical|mems/i.test(m)) ? ['DAQ'] : ['controls']),
  ].slice(0, 5);

  const evidence = [
    source('ME Mechatronics & Robotics area', AREA_URL),
    source('ME faculty profile', profileUrl),
    source('Deep research outreach report', 'WEB-TRACKER/research/umich-me-mechatronics-robotics-outreach-2026.json', `run ${DEEP_RUN}`),
  ];
  if (entry.lab_url) evidence.push(source(entry.lab || 'Lab page', entry.lab_url));

  const fit = entry.role_note === 'emeritus' || entry.role_note === 'lecturer'
    ? `Listed on ME Mechatronics & Robotics page but ${entry.role_note}; keep as low-priority network node only.`
    : entry.design_heavy
      ? `Mechatronics/robotics design-adjacent lab (${entry.outreach_tier}). Fit is instrumentation/DAQ/test-validation transfer, not current mechanism-design depth.`
      : `Mechatronics/robotics experimental-systems fit (${entry.outreach_tier}). Maps to sensing, DAQ automation, controls interfaces, and test-rig support from plasma/instrumentation background.`;

  return applyResearchFitScoring({
    id: `umich-${entry.slug}-mechatronics`,
    name: entry.name,
    title: entry.title,
    unit: 'Michigan Engineering',
    department: 'Mechanical Engineering',
    lab: entry.lab,
    role_type: entry.role_note === 'lecturer' ? 'faculty_or_research_staff' : 'faculty_or_research_staff',
    campus: 'Ann Arbor',
    profile_url: profileUrl,
    lab_url: entry.lab_url || '',
    contact_email: entry.email || '',
    contact_page: profileUrl,
    phone: '',
    research_keywords: keywords.length ? keywords : ['mechatronics', 'robotics'],
    methods: entry.methods,
    facilities: entry.lab ? [entry.lab] : [],
    transfer_vectors: vectors,
    research_fields: ['Mechatronics & Robotics'],
    outreach_tier: '',
    area_assessments: {
      'Mechatronics & Robotics': {
        roster_tier: entry.outreach_tier,
        design_heavy: Boolean(entry.design_heavy),
      },
    },
    design_heavy: Boolean(entry.design_heavy),
    role_note: entry.role_note,
    hiring_signals: [],
    evidence,
    fit_rationale: fit,
    outreach_angle: entry.pitch,
    likely_route: entry.role_note === 'tenure_track_pi'
      ? 'Research staff / RA / PhD conversation with tenure-track PI.'
      : entry.role_note === 'research_scientist'
        ? 'Secondary research-scientist contact; prefer sponsoring PI.'
        : 'Informational / network only.',
    opt_h1b_notes: 'University research roles can be cap-exempt H-1B candidates, but timeline must be raised early.',
    uncertainty_notes: entry.email
      ? 'Confirm current openings and one recent paper before outreach.'
      : 'Email missing or obscured on profile extract; verify on faculty page before outreach.',
    research_interests_summary: entry.interests,
    recent_publication: '',
    status: 'not_contacted',
    source_report: SOURCE_REPORT,
    first_seen: `${RESEARCH_DATE}T00:00:00.000Z`,
  });
}

function main() {
  const prospects = ROSTER.map(buildProspect);
  prospects.sort((a, b) => Number(b.score) - Number(a.score) || a.name.localeCompare(b.name));
  const byOutreach = prospects.reduce((acc, p) => {
    const tier = p.area_assessments?.['Mechatronics & Robotics']?.roster_tier || 'unset';
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {});
  const out = {
    scope: 'U-M ME Mechatronics & Robotics outreach prospects',
    research_run: DEEP_RUN,
    research_date: RESEARCH_DATE,
    source_report: SOURCE_REPORT,
    area_url: AREA_URL,
    segregation: {
      T1: 'Strongest experimental-systems / sensing / DAQ fit',
      T2: 'Conditional transfer; verify lab methods before email',
      T3: 'Design-heavy or weaker overlap; honest instrumentation framing only',
      T4: 'Emeritus / lecturer / research-scientist secondary contacts',
    },
    counts: {
      total: prospects.length,
      by_outreach_tier: byOutreach,
      by_score_tier: prospects.reduce((acc, p) => {
        acc[p.tier] = (acc[p.tier] || 0) + 1;
        return acc;
      }, {}),
      with_email: prospects.filter(p => p.contact_email).length,
    },
    prospects,
  };
  mkdirSync(RESEARCH_DIR, { recursive: true });
  const outPath = join(RESEARCH_DIR, 'umich-me-mechatronics-robotics-outreach-prospects-2026.json');
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${prospects.length} mechatronics outreach prospects -> ${outPath}`);
  console.log(`Outreach tiers: ${JSON.stringify(byOutreach)}`);
}

main();
