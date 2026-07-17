#!/usr/bin/env node
/**
 * Enrich CUOS structure into U-M research prospects (2026-07-13 deep research).
 * Preserves outreach user-state; rebuilds scoring from faculty evidence.
 */
import { applyResearchFitScoring } from '../lib/research-fit-scoring.mjs';
import {
  findResearchProspect,
  syncResearchProspectsToDashboard,
  upsertResearchProspect,
} from '../lib/research-prospect-store.mjs';

const DATE = '2026-07-13';
const STRUCTURE = 'WEB-TRACKER/research/cuos-structure-2026.md';
const SOURCE_REPORT = STRUCTURE;

function src(label, url, note = '') {
  return { type: 'source', label, url, date: DATE, note };
}

function report(label, path) {
  return { type: 'source', label, url: '', date: DATE, note: path };
}

function enrich(base) {
  return applyResearchFitScoring({
    role_type: 'faculty_or_research_staff',
    campus: 'Ann Arbor',
    unit: 'Michigan Engineering',
    source_report: SOURCE_REPORT,
    ...base,
  });
}

function mergeWithoutWipingOutreach(id, patch) {
  const existing = findResearchProspect(id) || {};
  const next = enrich({
    ...existing,
    ...patch,
    id: existing.id || id,
    name: patch.name || existing.name,
    department: patch.department || existing.department,
    evidence: [...(existing.evidence || []), ...(patch.evidence || [])],
    hiring_signals: [...(existing.hiring_signals || []), ...(patch.hiring_signals || [])],
    status: existing.status || patch.status || 'not_contacted',
    last_contacted: existing.last_contacted || '',
    last_followed_up: existing.last_followed_up || '',
    follow_up_date: existing.follow_up_date || '',
    outreach: existing.outreach || patch.outreach || {},
  });
  if (patch.notes) next.notes = patch.notes;
  upsertResearchProspect(next);
  return { id: next.id, score: next.score, tier: next.tier, status: next.status };
}

const updates = [
  {
    id: 'umich-almantas-galvanauskas-fiber-lasers',
    name: 'Almantas Galvanauskas',
    title: 'Professor',
    department: 'Electrical Engineering and Computer Science',
    lab: 'CUOS Ultrafast and High Power Fiber Lasers',
    profile_url: 'https://galvanauskas.engin.umich.edu/',
    lab_url: 'https://cuos.engin.umich.edu/researchgroups/uhpfiberlasers/',
    contact_email: 'almantas@umich.edu',
    contact_page: 'https://galvanauskas.engin.umich.edu/',
    phone: '734-615-7166',
    research_keywords: [
      'high-power fiber lasers',
      'ultrafast fiber CPA',
      'chirally coupled core fiber',
      'coherent beam combining',
      'laser-plasma accelerator drivers',
      'laser-driven EUV and X-ray sources',
      'high intensity laser-matter interactions',
    ],
    methods: [
      'fiber laser systems',
      'chirped pulse amplification',
      'coherent pulse stacking',
      'high-power optics',
      'ultrafast laser instrumentation',
      'experimental laser-plasma driver development',
    ],
    facilities: ['CUOS', 'Galvanauskas Fiber Laser Lab', 'Optics and Photonics Lab'],
    transfer_vectors: [
      'optical/laser diagnostics',
      'laser-plasma experiments',
      'instrumentation',
      'experimental work',
    ],
    current_focus: 'High-power ultrafast fiber lasers for nonlinear optics, high-intensity laser-matter interactions, laser-driven secondary radiation (gamma/X-ray), and developing a new generation of laser-plasma accelerator drivers using CCC fibers, coherent combining, and fiber CPA.',
    research_interests_summary: 'CUOS PI for Ultrafast and High Power Fiber Lasers. Invented CCC fibers and coherent pulse stacking; active PhD group on mid-IR Er:ZBLAN CPA, nonlinear compression, pulse contrast, CCC arrays, and EUV generation.',
    recent_publication: 'High average power ultrafast laser technologies for driving future advanced accelerators (Journal of Instrumentation, 2023); mid-IR Er:ZBLAN fiber CPA / pulse generation papers 2020-2022.',
    likely_route: 'PhD / research staff in fiber CPA systems feeding high-intensity or laser-plasma experiments.',
    notes: `CUOS fiber-laser PI (not HFS). Reports: ${STRUCTURE}; WEB-TRACKER/research/cuos-groups/ultrafast-high-power-fiber-lasers.md; WEB-TRACKER/research/cuos-people/almantas-galvanauskas.md`,
    uncertainty_notes: 'Hire path is Galvanauskas lab directly — HFS Join Us (Karl/Alec/Louise) does not cover this group.',
    evidence: [
      src('CUOS people table', 'https://cuos.engin.umich.edu/faculty/'),
      src('CUOS contact leads', 'https://cuos.engin.umich.edu/contact/'),
      src('Galvanauskas lab', 'https://galvanauskas.engin.umich.edu/'),
      src('ECE profile — laser-plasma accelerator drivers', 'https://eecs.engin.umich.edu/people/galvanauskas-almantas/'),
      src('Active students page', 'https://galvanauskas.engin.umich.edu/students/'),
      report('Person report', 'WEB-TRACKER/research/cuos-people/almantas-galvanauskas.md'),
      report('Group report', 'WEB-TRACKER/research/cuos-groups/ultrafast-high-power-fiber-lasers.md'),
    ],
    hiring_signals: [
      {
        type: 'hiring_signal',
        label: 'Active PhD cohort listed on lab site',
        url: 'https://galvanauskas.engin.umich.edu/students/',
        date: DATE,
        note: 'Multiple current PhD students — living group; email PI for openings.',
      },
    ],
  },
  {
    id: 'umich-ted-norris-ultrafast',
    name: 'Ted Norris',
    title: 'Professor',
    department: 'Electrical Engineering and Computer Science',
    lab: 'CUOS Ultrafast Science; Optics for Sensing theme',
    profile_url: 'https://norris.engin.umich.edu/',
    lab_url: 'https://cuos.engin.umich.edu/researchgroups/ultrafast-science/',
    contact_email: 'tnorris@umich.edu',
    phone: '734-764-9269',
    research_keywords: [
      'ultrafast optics',
      'femtosecond spectroscopy',
      'THz generation and imaging',
      'semiconductor nanostructures',
      'biological imaging',
      'in-vivo sensing',
    ],
    methods: [
      'femtosecond optical measurement',
      'THz diagnostics',
      'ultrafast spectroscopy',
      'multiphoton / confocal imaging',
    ],
    facilities: ['CUOS', 'Norris Ultrafast Lab'],
    transfer_vectors: [
      'optical/laser diagnostics',
      'measurement/diagnostics',
      'instrumentation',
      'sensors/process monitoring',
    ],
    current_focus: 'Propagation and applications of ultrashort pulses: semiconductor nanostructure dynamics, THz generation/imaging, and ultrafast methods for biological imaging and in-vivo sensing. CUOS Contact lead for Ultrafast Science; best live faculty anchor for the Sensing/Nanomedicine theme page.',
    research_interests_summary: 'CUOS Ultrafast Science PI. Sensing/Nanomedicine CUOS card has no separate faculty-table PI — route biomedical optics interest through Norris.',
    likely_route: 'PhD / research collaboration in ultrafast measurement or biophotonics.',
    notes: `CUOS Ultrafast Science PI (+ sensing theme). Reports: ${STRUCTURE}; WEB-TRACKER/research/cuos-groups/ultrafast-science.md; WEB-TRACKER/research/cuos-groups/optics-sensing-nanomedicine.md; WEB-TRACKER/research/cuos-people/ted-norris.md`,
    uncertainty_notes: 'Sensing/Nanomedicine page is a theme, not a separate Join Us list.',
    evidence: [
      src('CUOS contact', 'https://cuos.engin.umich.edu/contact/'),
      src('Norris lab', 'https://norris.engin.umich.edu/'),
      src('Ultrafast Science group', 'https://cuos.engin.umich.edu/researchgroups/ultrafast-science/'),
      src('Sensing/Nanomedicine theme', 'https://cuos.engin.umich.edu/researchgroups/sensing-and-nanomedicine/'),
      report('Person report', 'WEB-TRACKER/research/cuos-people/ted-norris.md'),
    ],
  },
  {
    id: 'umich-steve-yalisove-materials-laser',
    name: 'Steve Yalisove',
    title: 'Professor',
    department: 'Materials Science and Engineering',
    lab: 'CUOS Materials Science',
    profile_url: 'https://mse.engin.umich.edu/people/smy',
    lab_url: 'https://cuos.engin.umich.edu/researchgroups/material-science/',
    contact_email: 'smy@umich.edu',
    phone: '734-764-4346',
    research_keywords: [
      'ultrafast laser-material interaction',
      'femtosecond ablation',
      'fsLIBS',
      'pump-probe ultrafast microscopy',
      'laser microfluidics manufacturing',
      'surface and interface materials',
    ],
    methods: [
      'pump-probe ultrafast microscopy',
      'femtosecond LIBS',
      'SEM/TEM characterization',
      'in-situ optical probes',
      'MBE thin-film growth',
    ],
    facilities: ['CUOS', 'Yalisove Lab'],
    transfer_vectors: [
      'optical/laser diagnostics',
      'experimental materials characterization',
      'metrology/NDE/process inspection',
      'sensors/process monitoring',
      'experimental work',
    ],
    current_focus: 'Ultrafast laser damage and material removal in metals/semiconductors; pump-probe imaging; fsLIBS; ultrafast-laser nano/microfluidic channel manufacturing; epitaxial film growth and surface science.',
    research_interests_summary: 'Named CUOS Materials Science lead on Contact and Faculty pages. Independent hiring from High Field Science.',
    likely_route: 'PhD / research staff in ultrafast laser materials processing and optical diagnostics.',
    notes: `CUOS Materials PI. Reports: ${STRUCTURE}; WEB-TRACKER/research/cuos-groups/material-science.md; WEB-TRACKER/research/cuos-people/steve-yalisove.md`,
    evidence: [
      src('MSE profile', 'https://mse.engin.umich.edu/people/smy'),
      src('CUOS materials group', 'https://cuos.engin.umich.edu/researchgroups/material-science/'),
      src('CUOS contact', 'https://cuos.engin.umich.edu/contact/'),
      report('Person report', 'WEB-TRACKER/research/cuos-people/steve-yalisove.md'),
    ],
  },
  {
    id: 'umich-zhaohui-zhong-cuos-nanoelectronics',
    name: 'Zhaohui Zhong',
    title: 'Associate Professor',
    department: 'Electrical Engineering and Computer Science',
    lab: 'CUOS Ultrafast Nanoelectronics; Zhong Lab',
    profile_url: 'https://ece.engin.umich.edu/personnel/zhong-zhaohui/',
    lab_url: 'http://web.eecs.umich.edu/zhonglab/',
    contact_email: 'zzhong@umich.edu',
    phone: '734-647-1953',
    research_keywords: [
      'THz nanoelectronics',
      'graphene and carbon nanotube devices',
      'nanophotonics',
      'chemical and biological sensing',
      'nanomaterial synthesis',
    ],
    methods: [
      'nanodevice fabrication',
      'microwave/THz device measurement',
      'nanomaterial synthesis',
    ],
    facilities: ['Zhong Lab', 'CUOS (affiliated group page)'],
    transfer_vectors: ['sensors/process monitoring', 'instrumentation'],
    current_focus: 'Carbon-nanotube and graphene THz/microwave nanoelectronics and nanophotonics; sensors; nanomaterial synthesis. Linked from CUOS Ultrafast Nanoelectronics page; not listed on CUOS People faculty table.',
    research_interests_summary: 'CUOS-affiliated ECE nanoelectronics PI. Separate from HFS and fiber-laser hiring.',
    likely_route: 'ECE PhD in nanoelectronics/THz devices — low priority for plasma-diagnostics path.',
    notes: `CUOS Nanoelectronics PI. Reports: ${STRUCTURE}; WEB-TRACKER/research/cuos-groups/ultrafast-nanoelectronics.md; WEB-TRACKER/research/cuos-people/zhaohui-zhong.md`,
    evidence: [
      src('CUOS nanoelectronics group', 'https://cuos.engin.umich.edu/researchgroups/ultrafast-nanoelectronics/'),
      src('Zhong Lab', 'http://web.eecs.umich.edu/zhonglab/'),
      src('ECE profile', 'https://ece.engin.umich.edu/personnel/zhong-zhaohui/'),
      report('Person report', 'WEB-TRACKER/research/cuos-people/zhaohui-zhong.md'),
    ],
  },
  {
    id: 'umich-john-whitaker-cuos-microwave',
    name: 'John Whitaker',
    title: 'Research Scientist (legacy listing)',
    department: 'Electrical Engineering and Computer Science',
    lab: 'CUOS Ultrafast Microwave Photonics (legacy page)',
    profile_url: 'https://cuos.engin.umich.edu/researchgroups/ultrafast-microwave-photonics/people/',
    lab_url: 'https://cuos.engin.umich.edu/researchgroups/ultrafast-microwave-photonics/',
    contact_email: '',
    research_keywords: ['microwave photonics', 'THz pulsed beams', 'electro-optic probing'],
    methods: ['optically based EM field probes', 'pulsed THz imaging'],
    facilities: ['CUOS (historic Ultrafast Microwave Photonics)'],
    transfer_vectors: ['measurement/diagnostics'],
    current_focus: 'Listed on CUOS Microwave Photonics people page with older student names. Not present on current CUOS Faculty table or Contact leads — treat hiring status as unverified/legacy.',
    research_interests_summary: 'Do not prioritize outreach until activity is reconfirmed.',
    likely_route: 'Unverified — prefer Norris or Zhong for THz topics.',
    notes: `LEGACY FLAG. Reports: ${STRUCTURE}; WEB-TRACKER/research/cuos-groups/ultrafast-microwave-photonics.md; WEB-TRACKER/research/cuos-people/john-whitaker.md`,
    uncertainty_notes: 'Not on https://cuos.engin.umich.edu/faculty/ — confirm before any outreach.',
    evidence: [
      src('Microwave Photonics people', 'https://cuos.engin.umich.edu/researchgroups/ultrafast-microwave-photonics/people/'),
      src('CUOS faculty table (absence check)', 'https://cuos.engin.umich.edu/faculty/'),
      report('Person report', 'WEB-TRACKER/research/cuos-people/john-whitaker.md'),
    ],
  },
  {
    id: 'umich-karl-krushelnick-cuos-zeus',
    name: 'Karl Krushelnick',
    title: 'Professor; Director, CUOS; Director, NSF ZEUS Laser Facility',
    department: 'Nuclear Engineering and Radiological Sciences',
    lab: 'CUOS High Field Science; ZEUS',
    profile_url: 'https://ners.engin.umich.edu/people/krushelnick-karl/',
    lab_url: 'https://cuos.engin.umich.edu/researchgroups/hfs/',
    contact_email: 'kmkr@umich.edu',
    phone: '734-763-4877',
    research_keywords: [
      'laser-plasma interactions',
      'ultra-high intensity lasers',
      'ZEUS',
      'relativistic plasma',
      'high-energy-density plasma',
    ],
    methods: [
      'high-power lasers',
      'laser-plasma diagnostics',
      'particle acceleration',
      'optical diagnostics',
    ],
    facilities: ['CUOS', 'ZEUS', 'HERCULES'],
    transfer_vectors: [
      'plasma diagnostics',
      'laser-plasma experiments',
      'optical/laser diagnostics',
      'vacuum/high-voltage systems',
      'instrumentation',
      'experimental work',
    ],
    current_focus: 'Director of CUOS and NSF ZEUS. High Field Science leadership. Named on HFS Join Us for PhD interest together with Alec Thomas and Louise Willingale — that list is HFS-only, not all of CUOS.',
    research_interests_summary: 'CUOS center director + High Field Science / ZEUS. Separate PIs exist for fiber lasers (Galvanauskas), materials (Yalisove), ultrafast science (Norris), nanoelectronics (Zhong).',
    likely_route: 'PhD / research staff in HFS or ZEUS laser-plasma experiments.',
    notes: `HFS/ZEUS. Structure: ${STRUCTURE}. Group: WEB-TRACKER/research/cuos-groups/high-field-science.md. Person: WEB-TRACKER/research/cuos-people/karl-krushelnick.md`,
    evidence: [
      src('HFS Join Us', 'https://cuos.engin.umich.edu/researchgroups/hfs/join-us/'),
      src('CUOS contact', 'https://cuos.engin.umich.edu/contact/'),
      src('ZEUS facility', 'https://zeus.engin.umich.edu/'),
      report('Structure report', STRUCTURE),
      report('Person report', 'WEB-TRACKER/research/cuos-people/karl-krushelnick.md'),
    ],
    hiring_signals: [
      {
        type: 'hiring_signal',
        label: 'HFS Join Us — contact Karl/Alec/Louise for High Field PhD',
        url: 'https://cuos.engin.umich.edu/researchgroups/hfs/join-us/',
        date: DATE,
        note: 'Explicit HFS-only graduate recruiting page.',
      },
    ],
  },
  {
    id: 'umich-alec-thomas-cuos',
    name: 'Alec Thomas',
    title: 'Associate Professor',
    department: 'Nuclear Engineering and Radiological Sciences',
    lab: 'CUOS High Field Science',
    profile_url: 'https://ners.engin.umich.edu/people/alec-thomas/',
    lab_url: 'https://cuos.engin.umich.edu/researchgroups/hfs/',
    contact_email: 'agrt@umich.edu',
    phone: '734-763-6008',
    research_keywords: [
      'laser-plasma acceleration',
      'high-field science',
      'plasma theory and computation',
      'relativistic laser-plasma',
    ],
    methods: ['laser-plasma experiments', 'plasma simulation', 'optical diagnostics'],
    facilities: ['CUOS', 'ZEUS', 'HERCULES'],
    transfer_vectors: [
      'plasma diagnostics',
      'laser-plasma experiments',
      'optical/laser diagnostics',
      'experimental work',
    ],
    current_focus: 'High Field Science faculty named on HFS Join Us for graduate research. Theory/computation and laser-plasma program.',
    notes: `HFS only. ${STRUCTURE}; WEB-TRACKER/research/cuos-people/alec-thomas.md`,
    evidence: [
      src('HFS Join Us', 'https://cuos.engin.umich.edu/researchgroups/hfs/join-us/'),
      src('HFS profile', 'https://cuos.engin.umich.edu/researchgroups/hfs/profiles/alexander-thomas/'),
      report('Person report', 'WEB-TRACKER/research/cuos-people/alec-thomas.md'),
    ],
  },
  {
    id: 'umich-louise-willingale-zeus',
    name: 'Louise Willingale',
    title: 'Associate Professor; Associate Director, ZEUS',
    department: 'Electrical Engineering and Computer Science',
    lab: 'ZEUS; CUOS High Field Science',
    profile_url: 'https://willingale.engin.umich.edu/',
    lab_url: 'https://cuos.engin.umich.edu/researchgroups/hfs/',
    contact_email: 'wlouise@umich.edu',
    phone: '734-763-4980',
    research_keywords: [
      'ZEUS',
      'high-intensity laser plasma',
      'plasma acceleration',
      'optical diagnostics',
      'charged-particle diagnostics',
    ],
    methods: [
      'high-power laser experiments',
      'plasma diagnostics',
      'charged-particle diagnostics',
    ],
    facilities: ['ZEUS', 'CUOS'],
    transfer_vectors: [
      'plasma diagnostics',
      'laser-plasma experiments',
      'optical/laser diagnostics',
      'detector/readout instrumentation',
      'experimental work',
    ],
    current_focus: 'ZEUS Associate Director and HFS faculty on Join Us graduate recruiting list. High-intensity laser-plasma experiments and diagnostics.',
    notes: `HFS/ZEUS. ${STRUCTURE}; WEB-TRACKER/research/cuos-people/louise-willingale.md`,
    evidence: [
      src('HFS Join Us', 'https://cuos.engin.umich.edu/researchgroups/hfs/join-us/'),
      src('Willingale lab', 'https://willingale.engin.umich.edu/'),
      src('ZEUS', 'https://zeus.engin.umich.edu/'),
      report('Person report', 'WEB-TRACKER/research/cuos-people/louise-willingale.md'),
    ],
  },
  {
    id: 'umich-igor-jovanovic-ansg',
    name: 'Igor Jovanovic',
    title: 'Professor',
    department: 'Nuclear Engineering and Radiological Sciences',
    lab: 'Applied Nuclear Science Group; CUOS High Field Science',
    profile_url: 'https://ners.engin.umich.edu/people/jovanovic-igor/',
    lab_url: 'https://ansg.engin.umich.edu/',
    contact_email: 'ijov@umich.edu',
    phone: '734-647-4989',
    research_keywords: [
      'nuclear instrumentation',
      'laser-driven neutron sources',
      'radiation detection',
      'ultrafast optics',
    ],
    methods: [
      'nuclear detection',
      'laser diagnostics',
      'neutron sources',
      'optical spectroscopy',
    ],
    facilities: ['ANSG', 'CUOS'],
    transfer_vectors: [
      'optical/laser diagnostics',
      'detector/readout instrumentation',
      'measurement/diagnostics',
      'instrumentation',
    ],
    current_focus: 'ANSG PI and CUOS High Field Science affiliate on People table. Nuclear instrumentation and laser-driven radiation sources — separate lab from Karl/Alec/Louise Join Us list but scientifically adjacent.',
    notes: `CUOS HFS affiliate + ANSG. ${STRUCTURE}; WEB-TRACKER/research/cuos-people/igor-jovanovic.md`,
    evidence: [
      src('CUOS faculty', 'https://cuos.engin.umich.edu/faculty/'),
      src('ANSG', 'https://ansg.engin.umich.edu/'),
      report('Person report', 'WEB-TRACKER/research/cuos-people/igor-jovanovic.md'),
    ],
  },
  {
    id: 'umich-amy-brooks-cuos',
    name: 'Amy Brooks',
    title: 'Research Manager',
    department: 'CUOS Staff',
    lab: 'CUOS Staff',
    profile_url: 'https://cuos.engin.umich.edu/faculty/',
    lab_url: 'https://cuos.engin.umich.edu/',
    contact_email: 'brooksab@umich.edu',
    phone: '734-936-2957',
    research_keywords: ['CUOS administration'],
    methods: [],
    facilities: ['CUOS'],
    transfer_vectors: [],
    current_focus: 'CUOS Research Manager (staff). Administrative routing only — not a research PI.',
    research_interests_summary: 'Staff contact for logistics; research outreach goes to group PIs.',
    notes: `Staff. ${STRUCTURE}; WEB-TRACKER/research/cuos-people/amy-brooks.md`,
    evidence: [
      src('CUOS faculty/staff table', 'https://cuos.engin.umich.edu/faculty/'),
      report('Person report', 'WEB-TRACKER/research/cuos-people/amy-brooks.md'),
    ],
  },
];

updates.find((u) => u.id === 'umich-louise-willingale-zeus').contact_email = 'wlouise@umich.edu';

const results = [];
for (const update of updates) {
  results.push(mergeWithoutWipingOutreach(update.id, update));
}

const synced = syncResearchProspectsToDashboard({ institution: 'umich' });
console.log(JSON.stringify({
  enriched: results.length,
  results,
  dashboard_total: synced.total,
  structure_report: STRUCTURE,
}, null, 2));
