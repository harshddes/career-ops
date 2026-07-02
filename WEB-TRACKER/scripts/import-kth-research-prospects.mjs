#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  WEB_TRACKER_DIR,
  syncResearchProspectsToDashboard,
  writeResearchProspects,
} from '../lib/research-prospect-store.mjs';

const RESEARCH_DATE = '2026-06-27';
const SOURCE_JSON = 'WEB-TRACKER/research/kth-fusion-epp-prospects-2026.json';
const SOURCE_REPORT = 'WEB-TRACKER/research/kth-fusion-epp-prospects-2026.md';
const RESEARCH_JSON_PATH = join(WEB_TRACKER_DIR, 'research', 'kth-fusion-epp-prospects-2026.json');
const RESEARCH_MD_PATH = join(WEB_TRACKER_DIR, 'research', 'kth-fusion-epp-prospects-2026.md');

const KTH_EMP_URL = 'https://www.kth.se/emp/department-of-electromagnetics-and-plasma-physics-1.1215770';
const KTH_FUSION_URL = 'https://www.kth.se/emp/research/fusion';
const KTH_PWI_URL = 'https://www.kth.se/emp/research/fusion/plasma-wall-interaction-pwi';
const KTH_PEDESTAL_URL = 'https://www.kth.se/emp/research/fusion/pedestal-physics';
const KTH_CONTROL_URL = 'https://www.kth.se/emp/research/fusion/plasma-control-1.1091471';
const KTH_EXTRAP_URL = 'https://www.kth.se/emp/research/fusion/extrap-1.897096';
const KTH_FAST_ELECTRON_URL = 'https://www.kth.se/emp/research/fusion/fast-electron-physics-1.1472187';
const KTH_SPACE_URL = 'https://www.kth.se/emp/research/space-and-plasma-physics';
const KTH_MMS_URL = 'https://www.kth.se/emp/research/space-and-plasma-physics/missions/ongoing-satellite-mi/mms-magnetospheric-multiscale-1.1016328';
const KTH_SOLAR_SYSTEM_URL = 'https://www.kth.se/emp/research/space-and-plasma-physics/area/solar-system-plasma-physics-1.1016426';
const KTH_VARBI_URL = 'https://kth.varbi.com/en/nl?o=2&os=1&s=0&ss=1';
const KTH_ADMISSION_URL = 'https://intra.kth.se/en/eecs/forskarutbildning/admission-1.813300';
const EUROFUSION_GRANTS_URL = 'https://euro-fusion.org/eurofusion-news/applications-open-for-the-2026-eurofusion-engineering-grants';
const EUROFUSION_AWARDS_URL = 'https://euro-fusion.org/eurofusion-news/2026-researcher-and-engineering-grants';
const EURAXESS_URL = 'https://euraxess.ec.europa.eu/jobs';
const CHALMERS_TUNDE_URL = 'https://www.chalmers.se/en/persons/tunde/';
const CHALMERS_PLASMA_THEORY_URL = 'https://ft.nephy.chalmers.se/?id=2&p=people';
const UPPSALA_TANDEM_CONTACT_URL = 'https://www.uu.se/en/centre/tandemlab/contact';
const UPPSALA_ENERGY_MATERIALS_URL = 'https://www.uu.se/en/centre/tandemlab/research-activities/materials-research/energy-materials';
const UPPSALA_IBA_URL = 'https://www.uu.se/en/centre/tandemlab/research-activities/materials-research/iba';

function source(label, url, note = '') {
  return { type: 'source', label, url, date: RESEARCH_DATE, note };
}

function hiring(label, url, note = '') {
  return { type: 'hiring_signal', label, url, date: RESEARCH_DATE, note };
}

function p(raw) {
  return {
    institution: 'kth',
    role_type: 'faculty_or_research_staff',
    campus: 'Stockholm / Sweden network',
    status: 'not_contacted',
    source_report: SOURCE_JSON,
    first_seen: `${RESEARCH_DATE}T00:00:00.000Z`,
    research_keywords: [],
    methods: [],
    facilities: [],
    transfer_vectors: [],
    hiring_signals: [],
    evidence: [],
    opt_h1b_notes: 'Swedish doctoral positions are salaried employee roles. Work-permit feasibility should be checked after a supervisor or posted position is identified.',
    ...raw,
  };
}

const prospects = [
  p({
    id: 'kth-marek-rubel-pwi',
    name: 'Marek Rubel',
    title: 'Professor emeritus',
    unit: 'KTH School of Electrical Engineering and Computer Science',
    department: 'Electromagnetics and Plasma Physics',
    lab: 'Plasma-Wall Interaction (PWI)',
    profile_url: 'https://www.kth.se/profile/rubel?l=en',
    lab_url: KTH_PWI_URL,
    contact_email: 'rubel@kth.se',
    phone: '+46 8 790 60 93',
    score: 4.9,
    tier: 'A',
    institution: 'kth',
    application_route: 'email_supervisor_first',
    application_url: KTH_ADMISSION_URL,
    research_keywords: ['plasma-wall interaction', 'ITER plasma-facing components', 'tritium inventory', 'dust formation', 'surface analysis'],
    methods: ['in-vessel diagnostics', 'surface analysis', 'nuclear microprobe', 'material migration studies', 'JET/WEST/W7-X sample analysis'],
    facilities: ['EXTRAP T2R', 'JET', 'WEST', 'Wendelstein 7-X', 'Uppsala Tandem Laboratory'],
    transfer_vectors: ['plasma diagnostics', 'vacuum systems', 'ion beam analysis', 'surface analysis', 'ITER materials'],
    hiring_signals: [hiring('KTH PWI research programme', KTH_PWI_URL, 'PWI page lists active ITER/EUROfusion tasks and in-vessel diagnostic development.')],
    fit_rationale: 'Highest-fit contact: PWI directly uses plasma-facing material diagnostics, tritium/fuel-inventory analysis, nuclear microprobes, and ITER-relevant material migration studies.',
    outreach_angle: 'Lead with LVACCS vacuum/HV plasma-source test automation plus SIMION/SRIM ion-analysis preparation for PWI/Uppsala Tandem workflows.',
    likely_route: 'Supervisor-first email, then KTH doctoral application or advertised KTH/Varbi position when a funded slot opens.',
    uncertainty_notes: 'Emeritus status means a younger co-supervisor should be confirmed before committing to a PhD plan.',
    evidence: [
      source('KTH PWI group page', KTH_PWI_URL),
      source('Marek Rubel KTH profile', 'https://www.kth.se/profile/rubel?l=en'),
      source('Uppsala Tandem Lab contact page', UPPSALA_TANDEM_CONTACT_URL),
    ],
  }),
  p({
    id: 'kth-henrik-bergsaker-pwi',
    name: 'Henrik Bergsåker',
    title: 'Associate professor',
    unit: 'KTH School of Electrical Engineering and Computer Science',
    department: 'Electromagnetics and Plasma Physics',
    lab: 'Plasma-Wall Interaction (PWI)',
    profile_url: 'https://www.kth.se/profile/henricb?l=en',
    lab_url: KTH_PWI_URL,
    contact_email: 'henricb@kth.se',
    phone: '+46 8 790 60 94',
    score: 4.8,
    tier: 'A',
    institution: 'kth',
    application_route: 'email_supervisor_first',
    application_url: KTH_ADMISSION_URL,
    research_keywords: ['plasma-facing materials', 'fusion technology', 'plasma-wall interaction', 'fuel retention'],
    methods: ['surface analysis', 'PFC diagnostics', 'fusion materials coursework', 'atomic physics for fusion'],
    facilities: ['EXTRAP T2R', 'Uppsala Tandem Laboratory'],
    transfer_vectors: ['plasma diagnostics', 'vacuum systems', 'surface analysis', 'fusion materials'],
    fit_rationale: 'Best active KTH PWI supervisor target: direct PWI alignment plus active teaching in fusion technology and atomic physics for fusion.',
    outreach_angle: 'Frame yourself as an experimental diagnostics/test engineer who can support sample exposure, post-exposure analysis, and repeatable test workflows.',
    likely_route: 'Email before posted vacancies; ask whether PWI expects a funded doctoral or project assistant opening tied to EUROfusion/ITER materials work.',
    evidence: [
      source('KTH PWI group page', KTH_PWI_URL),
      source('Henrik Bergsåker KTH profile', 'https://www.kth.se/profile/henricb?l=en'),
    ],
  }),
  p({
    id: 'kth-per-petersson-pwi',
    name: 'Per Petersson',
    title: 'Researcher; visiting researcher at Uppsala Tandem Laboratory',
    unit: 'KTH / Uppsala Tandem Laboratory',
    department: 'Electromagnetics and Plasma Physics',
    lab: 'Plasma-Wall Interaction (PWI); Uppsala Tandem Lab',
    profile_url: KTH_PWI_URL,
    lab_url: UPPSALA_TANDEM_CONTACT_URL,
    contact_email: 'ppeter@kth.se',
    phone: '+46 18 471 30 58',
    score: 4.7,
    tier: 'A',
    institution: 'kth',
    application_route: 'email_supervisor_first',
    application_url: KTH_ADMISSION_URL,
    research_keywords: ['ion beam analysis', 'plasma-facing materials', 'deuterium retention', 'surface analysis'],
    methods: ['ERDA', 'RBS', 'NRA', 'PIXE', 'ion beam materials analysis'],
    facilities: ['Uppsala Tandem Laboratory', 'EXTRAP T2R'],
    transfer_vectors: ['ion beam analysis', 'SIMION/SRIM', 'surface analysis', 'fusion materials'],
    fit_rationale: 'Strong practical bridge from KTH PWI into Uppsala beamline analysis; useful for understanding the hands-on workflow even if not the principal supervisor.',
    outreach_angle: 'Ask about how KTH PWI plans ion-beam analysis campaigns and where SIMION/SRIM or detector-readout skills would help.',
    likely_route: 'Secondary technical contact after Rubel/Bergsåker; possible co-supervisor or beamline collaborator.',
    evidence: [
      source('KTH PWI members list', KTH_PWI_URL),
      source('Uppsala Tandem Lab staff list', UPPSALA_TANDEM_CONTACT_URL),
      source('Uppsala IBA methods', UPPSALA_IBA_URL),
    ],
  }),
  p({
    id: 'kth-lorenzo-frassinetti-pedestal',
    name: 'Lorenzo Frassinetti',
    title: 'Professor',
    unit: 'KTH School of Electrical Engineering and Computer Science',
    department: 'Electromagnetics and Plasma Physics',
    lab: 'Pedestal Physics',
    profile_url: 'https://www.kth.se/profile/lorenzof?l=en',
    lab_url: KTH_PEDESTAL_URL,
    contact_email: 'lorenzof@kth.se',
    phone: '+46 8 790 65 75',
    score: 4.5,
    tier: 'A',
    institution: 'kth',
    application_route: 'email_supervisor_first',
    application_url: KTH_ADMISSION_URL,
    research_keywords: ['H-mode pedestal', 'JET', 'ASDEX Upgrade', 'TCV', 'MAST-U', 'ITER pedestal prediction'],
    methods: ['experimental data analysis', 'Python pedestal database workflows', 'MHD modelling', 'multi-tokamak experiments'],
    facilities: ['JET', 'ASDEX Upgrade', 'TCV', 'MAST-U'],
    transfer_vectors: ['plasma diagnostics', 'Python data analysis', 'fusion modelling', 'tokamak experiments'],
    hiring_signals: [hiring('Pedestal thesis route', KTH_PEDESTAL_URL, 'KTH page states doctoral positions are announced via the official KTH portal and describes project types.')],
    fit_rationale: 'Strong diagnostics/data-analysis fit through multi-machine pedestal databases, Python tooling, and experimental campaign analysis.',
    outreach_angle: 'Lead with plasma instrumentation plus Python data-processing discipline; ask whether pedestal database or diagnostic-analysis projects need a systems-minded engineer.',
    likely_route: 'Monitor KTH Varbi for PhD openings and send a targeted email referencing the JET/AUG/TCV/MAST-U database work.',
    evidence: [
      source('KTH Pedestal Physics group page', KTH_PEDESTAL_URL),
      source('Lorenzo Frassinetti KTH profile', 'https://www.kth.se/profile/lorenzof?l=en'),
    ],
  }),
  p({
    id: 'kth-per-brunsell-extrap-control',
    name: 'Per Brunsell',
    title: 'Professor; leader of EXTRAP T2R; Deputy Head of Division',
    unit: 'KTH School of Electrical Engineering and Computer Science',
    department: 'Electromagnetics and Plasma Physics',
    lab: 'Plasma Control / EXTRAP T2R',
    profile_url: 'https://www.kth.se/profile/brunsell?l=en',
    lab_url: KTH_CONTROL_URL,
    contact_email: 'brunsell@kth.se',
    phone: '+46 8 790 62 46',
    score: 4.5,
    tier: 'A',
    institution: 'kth',
    application_route: 'email_supervisor_first',
    application_url: KTH_ADMISSION_URL,
    research_keywords: ['EXTRAP T2R', 'resistive wall mode control', 'reversed-field pinch', 'digital feedback control', 'MHD instabilities'],
    methods: ['real-time control', 'sensor arrays', 'ADC/DAC feedback systems', 'plasma operation', 'system identification'],
    facilities: ['EXTRAP T2R'],
    transfer_vectors: ['plasma control', 'DAQ', 'FPGA/digital systems', 'high-voltage systems', 'vacuum systems'],
    hiring_signals: [hiring('Active supervision signal', 'https://www.kth.se/profile/brunsell?l=en', 'Profile states he currently supervises three PhD students.')],
    fit_rationale: 'Excellent controls/instrumentation backup to PWI: EXTRAP T2R uses sensor arrays, feedback control, digital controller logic, and plasma operation.',
    outreach_angle: 'Lead with high-voltage plasma-source operation, PyVISA automation, detector readout, and interest in RWM control diagnostics.',
    likely_route: 'Supervisor-first email for EXTRAP T2R control/diagnostic support; monitor KTH Varbi for EMP doctoral positions.',
    evidence: [
      source('KTH Plasma Control page', KTH_CONTROL_URL),
      source('KTH EXTRAP page', KTH_EXTRAP_URL),
      source('Per Brunsell KTH profile', 'https://www.kth.se/profile/brunsell?l=en'),
    ],
  }),
  p({
    id: 'kth-mathias-hoppe-fast-electrons',
    name: 'Mathias Hoppe',
    title: 'Assistant professor',
    unit: 'KTH School of Electrical Engineering and Computer Science',
    department: 'Electromagnetics and Plasma Physics',
    lab: 'Fast Electron Physics',
    profile_url: 'https://www.kth.se/profile/mhop?l=en',
    lab_url: KTH_FAST_ELECTRON_URL,
    contact_email: 'mhop@kth.se',
    phone: '+46 8 790 60 53',
    score: 4.0,
    tier: 'A',
    institution: 'kth',
    application_route: 'email_supervisor_first',
    application_url: KTH_ADMISSION_URL,
    research_keywords: ['runaway electrons', 'tokamak disruptions', 'DREAM', 'STREAM', 'SOFT', 'YODA', 'ITER'],
    methods: ['scientific computing', 'synthetic diagnostics', 'tokamak disruption modelling', 'fluid-kinetic simulation'],
    facilities: ['TCV collaboration', 'EUROfusion TSVV', 'ITER/ITPEA networks'],
    transfer_vectors: ['scientific computing', 'diagnostic modelling', 'Python/MATLAB analysis', 'fusion modelling'],
    hiring_signals: [hiring('Explicit thesis-project invitation', KTH_FAST_ELECTRON_URL, 'The group page invites students to contact Mathias about thesis and PhD topics.')],
    fit_rationale: 'Best modelling fallback: less hands-on than PWI, but synthetic diagnostics and fast-electron radiation modelling can use detector/readout intuition.',
    outreach_angle: 'Position your SSD readout and SIMION/SRIM work as instrumentation-aware modelling rather than pure theory.',
    likely_route: 'Direct email is appropriate because the group page explicitly invites thesis/PhD topic discussions.',
    evidence: [
      source('KTH Fast Electron Physics page', KTH_FAST_ELECTRON_URL),
      source('Mathias Hoppe KTH profile', 'https://www.kth.se/profile/mhop?l=en'),
    ],
  }),
  p({
    id: 'kth-per-arne-lindqvist-mms',
    name: 'Per Arne Lindqvist',
    title: 'Senior researcher',
    unit: 'KTH School of Electrical Engineering and Computer Science',
    department: 'Electromagnetics and Plasma Physics',
    lab: 'Space and Plasma Physics / MMS electric-field instrumentation',
    profile_url: 'https://www.kth.se/profile/pal?l=en',
    lab_url: KTH_MMS_URL,
    contact_email: 'pal@kth.se',
    phone: '+46 8 790 76 96',
    score: 4.2,
    tier: 'A',
    institution: 'kth',
    application_route: 'email_supervisor_first',
    application_url: KTH_ADMISSION_URL,
    research_keywords: ['space plasma instrumentation', 'electric field instruments', 'MMS', 'Cluster', 'spacecraft-plasma interactions'],
    methods: ['space plasma data analysis', 'electric field sensors', 'instrument electronics', 'measurement quality'],
    facilities: ['MMS', 'Cluster', 'Viking', 'Freja', 'Astrid'],
    transfer_vectors: ['space plasma instrumentation', 'detector readout', 'DAQ', 'space systems', 'sensors'],
    fit_rationale: 'One of the best non-fusion KTH matches because your space-plasma instrumentation and detector-readout background maps directly to electric-field instrument work.',
    outreach_angle: 'Ask for advice on KTH space-plasma instrument projects and whether doctoral work exists around measurement quality or spacecraft-plasma interactions.',
    likely_route: 'Exploratory supervisor/mentor contact; lower priority than fusion PWI if the immediate goal is fusion PhD.',
    evidence: [
      source('MMS mission page', KTH_MMS_URL),
      source('Per Arne Lindqvist KTH profile', 'https://www.kth.se/profile/pal?l=en'),
    ],
  }),
  p({
    id: 'kth-tomas-karlsson-space-plasma',
    name: 'Tomas Karlsson',
    title: 'Professor',
    unit: 'KTH School of Electrical Engineering and Computer Science',
    department: 'Electromagnetics and Plasma Physics',
    lab: 'Space and Plasma Physics',
    profile_url: 'https://www.kth.se/profile/tomask?l=en',
    lab_url: KTH_SPACE_URL,
    contact_email: 'tomask@kth.se',
    phone: '+46 8 790 77 01',
    score: 4.0,
    tier: 'A',
    institution: 'kth',
    application_route: 'email_supervisor_first',
    application_url: KTH_ADMISSION_URL,
    research_keywords: ['solar wind-magnetosphere-ionosphere interaction', 'bow shocks', 'magnetosheath jets', 'auroral physics'],
    methods: ['space plasma data analysis', 'MMS/Cluster observations', 'space physics teaching'],
    facilities: ['MMS', 'Cluster'],
    transfer_vectors: ['space plasma physics', 'data analysis', 'space systems', 'plasma instrumentation'],
    fit_rationale: 'Strong space-plasma academic fit, especially if you want a PhD bridge from UMich space systems into KTH EMP rather than fusion materials.',
    outreach_angle: 'Frame your M.Eng space systems, plasma coursework, and instrumentation background around MMS/Cluster data and space-plasma measurement problems.',
    likely_route: 'Secondary track if KTH fusion slots are closed; monitor EMP doctoral openings.',
    evidence: [
      source('Tomas Karlsson KTH profile', 'https://www.kth.se/profile/tomask?l=en'),
      source('Near Earth space area', 'https://www.kth.se/emp/research/space-and-plasma-physics/area/near-earth-space-1.1016425'),
    ],
  }),
  p({
    id: 'kth-mykola-ivchenko-space-systems',
    name: 'Mykola Ivchenko',
    title: 'Professor',
    unit: 'KTH School of Electrical Engineering and Computer Science',
    department: 'Electromagnetics and Plasma Physics',
    lab: 'Space and Plasma Physics / space systems',
    profile_url: 'https://www.kth.se/profile/nickolay?l=en',
    lab_url: KTH_SOLAR_SYSTEM_URL,
    contact_email: 'nickolay@kth.se',
    phone: '+46 8 790 76 74',
    score: 3.9,
    tier: 'B',
    institution: 'kth',
    application_route: 'email_supervisor_first',
    application_url: KTH_ADMISSION_URL,
    research_keywords: ['space systems', 'satellite data handling', 'plasma physics', 'solar system plasma physics'],
    methods: ['satellite operations', 'space environment engineering', 'plasma physics teaching'],
    facilities: ['BepiColombo', 'JUICE', 'MMS'],
    transfer_vectors: ['space systems', 'data handling', 'space plasma instrumentation', 'mission operations'],
    fit_rationale: 'Good space-systems bridge because he teaches satellite data handling, operation of space systems, and plasma physics in the same KTH division.',
    outreach_angle: 'Lead with M.Eng space systems and instrumentation/test background; ask about space-plasma instrumentation projects rather than fusion PWI.',
    likely_route: 'Secondary KTH EMP route; use if you want to preserve space-plasma PhD optionality.',
    evidence: [
      source('Mykola Ivchenko KTH profile', 'https://www.kth.se/profile/nickolay?l=en'),
      source('Solar system plasma physics page', KTH_SOLAR_SYSTEM_URL),
    ],
  }),
  p({
    id: 'kth-andris-vaivads-space-plasma',
    name: 'Andris Vaivads',
    title: 'Professor',
    unit: 'KTH School of Electrical Engineering and Computer Science',
    department: 'Electromagnetics and Plasma Physics',
    lab: 'Space and Plasma Physics',
    profile_url: 'https://www.kth.se/profile/vaivads?l=en',
    lab_url: KTH_SOLAR_SYSTEM_URL,
    contact_email: 'vaivads@kth.se',
    phone: '+46 8 790 76 97',
    score: 3.8,
    tier: 'B',
    institution: 'kth',
    application_route: 'email_supervisor_first',
    application_url: KTH_ADMISSION_URL,
    research_keywords: ['space plasma', 'solar system plasma physics', 'BepiColombo', 'JUICE'],
    methods: ['spacecraft measurements', 'plasma data analysis', 'mission science'],
    facilities: ['BepiColombo', 'JUICE'],
    transfer_vectors: ['space plasma physics', 'space systems', 'plasma instrumentation'],
    fit_rationale: 'Good broader EMP contact for space-plasma doctoral paths, but weaker than PWI for the fusion-materials theme.',
    outreach_angle: 'Ask about space-plasma research paths that use spacecraft instrumentation and data analysis.',
    likely_route: 'Secondary route after the fusion/PWI shortlist.',
    evidence: [
      source('Andris Vaivads KTH profile', 'https://www.kth.se/profile/vaivads?l=en'),
      source('Solar system plasma physics page', KTH_SOLAR_SYSTEM_URL),
    ],
  }),
  p({
    id: 'kth-lorenz-roth-planetary-plasma',
    name: 'Lorenz Roth',
    title: 'Associate professor',
    unit: 'KTH School of Electrical Engineering and Computer Science',
    department: 'Electromagnetics and Plasma Physics',
    lab: 'Solar System Plasma Physics',
    profile_url: 'https://www.kth.se/profile/lorenzr?l=en',
    lab_url: KTH_SOLAR_SYSTEM_URL,
    contact_email: 'lorenzr@kth.se',
    phone: '+46 8 790 76 91',
    score: 3.4,
    tier: 'B',
    institution: 'kth',
    application_route: 'kth_jobs_portal',
    application_url: KTH_VARBI_URL,
    research_keywords: ['planetary plasma environments', 'Galilean moons', 'Hubble', 'JWST', 'Juno', 'JUICE'],
    methods: ['remote telescope observations', 'in-situ spacecraft measurements', 'planetary environment modelling'],
    facilities: ['JWST', 'HST', 'Juno', 'JUICE'],
    transfer_vectors: ['space plasma physics', 'data analysis', 'scientific modelling'],
    hiring_signals: [hiring('Open-position-only PhD note', 'https://www.kth.se/profile/lorenzr?l=en', 'Profile asks prospective PhD candidates not to email and to apply only to open KTH positions.')],
    fit_rationale: 'Relevant space-plasma backup, but his profile explicitly discourages unsolicited PhD email.',
    outreach_angle: 'Do not cold-email for PhD; watch KTH posted positions and use only if an advertised project matches planetary plasma instrumentation/data analysis.',
    likely_route: 'Apply only through posted KTH positions.',
    evidence: [
      source('Lorenz Roth KTH profile', 'https://www.kth.se/profile/lorenzr?l=en'),
      source('Solar system plasma physics page', KTH_SOLAR_SYSTEM_URL),
    ],
  }),
  p({
    id: 'kth-anita-kullen-near-earth',
    name: 'Anita Kullen',
    title: 'Associate professor',
    unit: 'KTH School of Electrical Engineering and Computer Science',
    department: 'Electromagnetics and Plasma Physics',
    lab: 'Near Earth Space',
    profile_url: 'https://www.kth.se/profile/kullen?l=en',
    lab_url: 'https://www.kth.se/emp/research/space-and-plasma-physics/area/near-earth-space-1.1016425',
    contact_email: 'kullen@kth.se',
    phone: '+46 8 790 76 84',
    score: 3.3,
    tier: 'B',
    institution: 'kth',
    application_route: 'email_supervisor_first',
    application_url: KTH_ADMISSION_URL,
    research_keywords: ['near-Earth space', 'auroral physics', 'magnetosphere-ionosphere coupling'],
    methods: ['space plasma data analysis', 'MMS/Cluster mission science'],
    facilities: ['MMS', 'Cluster'],
    transfer_vectors: ['space plasma physics', 'data analysis', 'space systems'],
    fit_rationale: 'Useful broader space-plasma contact but less direct than instrument-heavy MMS contacts.',
    outreach_angle: 'Use only after higher-fit fusion and MMS instrumentation contacts.',
    likely_route: 'Secondary exploratory contact or posted KTH position route.',
    evidence: [
      source('Anita Kullen KTH profile', 'https://www.kth.se/profile/kullen?l=en'),
      source('Near Earth space team', 'https://www.kth.se/emp/research/space-and-plasma-physics/area/near-earth-space-1.1016425'),
    ],
  }),
  p({
    id: 'chalmers-tunde-fulop-plasma-theory',
    name: 'Tünde-Maria Fülöp',
    title: 'Full Professor, Subatomic, High Energy and Plasma Physics',
    unit: 'Chalmers University of Technology',
    department: 'Physics and Astronomy',
    lab: 'Chalmers Plasma Theory',
    profile_url: CHALMERS_TUNDE_URL,
    lab_url: CHALMERS_PLASMA_THEORY_URL,
    contact_email: 'tunde.fulop@chalmers.se',
    phone: '+46 31 772 31 80',
    score: 3.7,
    tier: 'B',
    institution: 'chalmers',
    application_route: 'email_supervisor_first',
    application_url: 'https://www.chalmers.se/en/education/doctoral-studies/',
    research_keywords: ['runaway electrons', 'plasma theory', 'tokamak disruption physics', 'EUROfusion'],
    methods: ['plasma theory', 'simulation tools', 'runaway-electron modelling'],
    facilities: ['Chalmers Plasma Theory'],
    transfer_vectors: ['fusion modelling', 'scientific computing', 'diagnostic interpretation'],
    fit_rationale: 'Important FP3/Swedish fusion-theory collaborator, especially for runaway-electron modelling, but less aligned with your hands-on diagnostics profile than KTH PWI.',
    outreach_angle: 'Use as a collaborator/contact if a KTH project needs Chalmers theory support; pitch instrumentation-aware modelling rather than lab operations.',
    likely_route: 'Chalmers doctoral postings or co-supervision through a KTH/FP3 project.',
    evidence: [
      source('Chalmers Tünde-Maria Fülöp profile', CHALMERS_TUNDE_URL),
      source('Chalmers Plasma Theory people page', CHALMERS_PLASMA_THEORY_URL),
      source('KTH Plasma Control collaboration with Chalmers', KTH_CONTROL_URL),
    ],
  }),
  p({
    id: 'uppsala-daniel-primetzhofer-tandem',
    name: 'Daniel Primetzhofer',
    title: 'Director, Tandem Laboratory',
    unit: 'Uppsala University',
    department: 'Tandem Laboratory',
    lab: 'Tandem Laboratory / Ion Technology Center',
    profile_url: 'https://www.uu.se/en/contact-and-organisation/staff?query=N11-1921',
    lab_url: UPPSALA_TANDEM_CONTACT_URL,
    contact_email: 'daniel.primetzhofer@physics.uu.se',
    phone: '+46 73 469 77 38',
    score: 4.3,
    tier: 'A',
    institution: 'uppsala',
    application_route: 'email_supervisor_first',
    application_url: 'https://www.uu.se/en/study/doctoral-studies',
    research_keywords: ['ion beam analysis', 'fusion materials', 'hydrogen in solids', 'reactor-relevant materials'],
    methods: ['in-situ ion beam analysis', 'operando materials studies', 'ERDA', 'RBS', 'NRA', 'PIXE'],
    facilities: ['Uppsala Tandem Laboratory'],
    transfer_vectors: ['ion beam analysis', 'SIMION/SRIM', 'surface analysis', 'fusion materials', 'vacuum systems'],
    fit_rationale: 'Best FP3-adjacent collaborator outside KTH because Tandem Lab is the named PWI ion-beam analysis partner and studies fusion plasma-facing materials.',
    outreach_angle: 'Ask about ion-beam analysis projects connected to KTH PWI and whether detector/readout or ion-trajectory simulation skills are useful.',
    likely_route: 'Uppsala doctoral/posting route or KTH PWI co-supervision via Tandem Lab.',
    evidence: [
      source('Uppsala Tandem Lab contact page', UPPSALA_TANDEM_CONTACT_URL),
      source('Uppsala fusion materials page', UPPSALA_ENERGY_MATERIALS_URL),
      source('Uppsala IBA methods page', UPPSALA_IBA_URL),
      source('KTH PWI cooperation list', KTH_PWI_URL),
    ],
  }),
  p({
    id: 'uppsala-tandem-lab-iba-contact',
    name: 'Uppsala Tandem Laboratory',
    title: 'Ion beam analysis facility contact',
    unit: 'Uppsala University',
    department: 'Tandem Laboratory',
    lab: 'Tandem Laboratory',
    profile_url: UPPSALA_TANDEM_CONTACT_URL,
    lab_url: UPPSALA_IBA_URL,
    contact_email: 'tandemlaboratoriet@physics.uu.se',
    phone: '+46 18 471 31 24',
    role_type: 'job_board_signal',
    score: 4.1,
    tier: 'A',
    institution: 'uppsala',
    application_route: 'email_supervisor_first',
    application_url: 'https://www.uu.se/en/study/doctoral-studies',
    research_keywords: ['ion beam analysis', 'fusion materials', 'plasma-facing components', 'hydrogen depth profiling'],
    methods: ['RBS', 'ERDA', 'NRA', 'PIXE', 'microbeam analysis'],
    facilities: ['Tandem Laboratory'],
    transfer_vectors: ['ion beam analysis', 'surface analysis', 'fusion materials', 'vacuum systems'],
    fit_rationale: 'Facility-level contact for the KTH PWI analysis chain; not a PI, but a high-signal place to understand beamline project needs.',
    outreach_angle: 'Use after KTH PWI contact to ask who handles PWI sample analysis and whether technical doctoral projects are opening.',
    likely_route: 'Facility inquiry and Uppsala doctoral postings; not the first cold email.',
    evidence: [
      source('Uppsala Tandem Lab contact page', UPPSALA_TANDEM_CONTACT_URL),
      source('Uppsala IBA methods page', UPPSALA_IBA_URL),
      source('Uppsala fusion materials page', UPPSALA_ENERGY_MATERIALS_URL),
    ],
  }),
  p({
    id: 'kth-varbi-emp-phd-monitor',
    name: 'KTH Varbi EMP/Fusion Doctoral Vacancies',
    title: 'Official KTH doctoral job portal monitor',
    unit: 'KTH Royal Institute of Technology',
    department: 'Doctoral recruitment',
    lab: 'KTH vacancies portal',
    profile_url: KTH_VARBI_URL,
    contact_email: 'doctoral-education-support@eecs.kth.se',
    role_type: 'job_board_signal',
    score: 4.0,
    tier: 'A',
    institution: 'kth',
    application_route: 'kth_jobs_portal',
    application_url: KTH_VARBI_URL,
    research_keywords: ['doctoral vacancies', 'EMP', 'fusion', 'plasma', 'KTH admissions'],
    methods: ['weekly vacancy monitoring'],
    transfer_vectors: ['PhD application route', 'hiring intelligence'],
    hiring_signals: [hiring('KTH Varbi vacancy portal', KTH_VARBI_URL, 'Official route for advertised doctoral positions at KTH.')],
    fit_rationale: 'This is the mandatory application channel when a funded KTH PhD slot is posted.',
    outreach_angle: 'Monitor weekly for EMP, fusion, plasma, PWI, EXTRAP, pedestal, or fast-electron keywords.',
    likely_route: 'Apply through Varbi, then email the matching PI with a focused fit memo.',
    evidence: [
      source('KTH vacancies portal', KTH_VARBI_URL),
      source('KTH EECS doctoral admission page', KTH_ADMISSION_URL),
    ],
  }),
  p({
    id: 'eurofusion-engineering-grants-monitor',
    name: 'EUROfusion Engineering / Researcher Grants',
    title: 'EUROfusion grant route for post-Master fusion placements',
    unit: 'EUROfusion',
    department: 'EUROfusion programme',
    lab: 'EUROfusion grants',
    profile_url: EUROFUSION_GRANTS_URL,
    role_type: 'job_board_signal',
    score: 3.8,
    tier: 'B',
    institution: 'eu_collaborator',
    application_route: 'euraxess_position',
    application_url: EUROFUSION_GRANTS_URL,
    research_keywords: ['EUROfusion grants', 'post-master engineering', 'fusion placements', 'ITER'],
    methods: ['grant-backed placement monitoring'],
    transfer_vectors: ['fusion network', 'grant route', 'research placement'],
    hiring_signals: [hiring('EUROfusion Engineering Grants', EUROFUSION_GRANTS_URL, 'EUROfusion opened engineering grants for young engineers entering the programme.')],
    fit_rationale: 'Useful non-PhD route into the same KTH/Chalmers/Uppsala network, especially if no KTH doctoral vacancy exists.',
    outreach_angle: 'Ask a target KTH PI whether your PWI diagnostics profile could support a EUROfusion Engineering Grant pitch.',
    likely_route: 'Grant-backed placement, not a standard university application.',
    evidence: [
      source('EUROfusion Engineering Grants', EUROFUSION_GRANTS_URL),
      source('EUROfusion 2026 awards', EUROFUSION_AWARDS_URL),
    ],
  }),
  p({
    id: 'euraxess-sweden-fusion-monitor',
    name: 'EURAXESS Sweden Fusion/Plasma Monitor',
    title: 'European research-job board signal',
    unit: 'EURAXESS',
    department: 'Research jobs',
    lab: 'Sweden fusion/plasma search',
    profile_url: EURAXESS_URL,
    role_type: 'job_board_signal',
    score: 3.6,
    tier: 'B',
    institution: 'eu_collaborator',
    application_route: 'euraxess_position',
    application_url: EURAXESS_URL,
    research_keywords: ['EURAXESS', 'Sweden', 'fusion', 'plasma', 'doctoral positions'],
    methods: ['weekly job-board monitoring'],
    transfer_vectors: ['PhD application route', 'research job monitoring'],
    fit_rationale: 'Backup monitor for cross-posted KTH, Chalmers, Uppsala, and EUROfusion doctoral positions.',
    outreach_angle: 'Use with keyword filters: Sweden, fusion, plasma, KTH, Chalmers, Uppsala, materials, diagnostics.',
    likely_route: 'Apply to posted positions only.',
    evidence: [source('EURAXESS jobs portal', EURAXESS_URL)],
  }),
];

function markdownReport() {
  const source = JSON.parse(readFileSync(RESEARCH_JSON_PATH, 'utf-8'));
  const content = source.output?.content || {};
  const sections = [
    ['Executive Summary', content.executive_summary],
    ['KTH EMP Scope And Fusion Groups', content['1_kth_emp_departmental_scope_and_fusion_subgroup_map']],
    ['Verified Personnel Roster', content['2_roster_of_kth_emp_epp_personnel_verified']],
    ['Broader Space And Plasma Physics', content['3_broader_plasma_physics_space_plasma_and_the_other_emp_divisions']],
    ['FP3 / EUROfusion Collaborators', content['4_fp3_eurofusion_style_collaborators_verifiable_on_kth_pages']],
    ['Swedish PhD Application Model', content['5_swedish_phd_application_model']],
    ['Official Application URLs', content['6_official_application_urls_consolidated']],
    ['Fit Map For Harsh Desai', content['7_fit_map_for_harsh_desai_pwi_diagnostics_priority_ranking']],
    ['Domain Breadth Audit', content['8_domain_breadth_audit_coverage_vs_domain_expert_checklist']],
    ['Synthesis', content['9_synthesis_cross_cutting_insights_and_tensions']],
    ['Direct Action Items', content['10_direct_action_items_for_harsh_desai']],
  ];
  return [
    '# KTH Fusion / EMP / FP3 Research Prospects',
    '',
    `**Compiled for:** Harsh Desai`,
    `**Date:** ${RESEARCH_DATE}`,
    `**Parallel run:** ${source.run_id || ''}`,
    '',
    ...sections.flatMap(([title, body]) => [`## ${title}`, '', body || '_No content returned._', '']),
  ].join('\n');
}

function validateProspects(items) {
  const errors = [];
  const seen = new Set();
  for (const prospect of items) {
    if (!prospect.name) errors.push(`${prospect.id || 'unknown'} missing name`);
    if (!prospect.department) errors.push(`${prospect.name || prospect.id} missing department`);
    if (!Number.isFinite(Number(prospect.score))) errors.push(`${prospect.name || prospect.id} missing score`);
    if (!prospect.evidence?.some(item => item.url) && !prospect.profile_url && !prospect.lab_url) {
      errors.push(`${prospect.name || prospect.id} missing source URL`);
    }
    const key = `${prospect.name}|${prospect.contact_email || prospect.profile_url}`;
    if (seen.has(key)) errors.push(`${prospect.name || prospect.id} appears duplicated`);
    seen.add(key);
  }
  return errors;
}

if (existsSync(RESEARCH_JSON_PATH) && !existsSync(RESEARCH_MD_PATH)) {
  writeFileSync(RESEARCH_MD_PATH, `${markdownReport()}\n`, 'utf-8');
}

const sortedProspects = [...prospects].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
const validationErrors = validateProspects(sortedProspects);
if (validationErrors.length) {
  console.error(validationErrors.map(error => `- ${error}`).join('\n'));
  process.exitCode = 1;
} else {
  const store = writeResearchProspects({
    scope: 'KTH Royal Institute of Technology and FP3 fusion research prospects',
    research_run: 'trun_dd47611047ba45198346da4ec9345d77',
    research_date: RESEARCH_DATE,
    source_report: SOURCE_REPORT,
    prospects: sortedProspects,
  }, { institution: 'kth', preserveUserState: true });
  const synced = syncResearchProspectsToDashboard({ institution: 'kth' });
  const directEmails = store.prospects.filter(prospect => prospect.contact_email).length;
  console.log(`Imported ${store.prospects.length} KTH / FP3 research prospects.`);
  console.log(`Dashboard mirror has ${synced.total} prospects.`);
  console.log(`Direct emails available: ${directEmails}.`);
}
