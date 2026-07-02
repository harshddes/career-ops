#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  WEB_TRACKER_DIR,
  syncResearchProspectsToDashboard,
  writeResearchProspects,
} from '../lib/research-prospect-store.mjs';

const RESEARCH_DATE = '2026-06-27';
const SOURCE_JSON = 'WEB-TRACKER/research/ipp-iter-technology-diagnostics-prospects-2026.json';
const SOURCE_REPORT = 'WEB-TRACKER/research/ipp-iter-technology-diagnostics-prospects-2026.md';
const RESEARCH_JSON_PATH = join(WEB_TRACKER_DIR, 'research', 'ipp-iter-technology-diagnostics-prospects-2026.json');
const RESEARCH_MD_PATH = join(WEB_TRACKER_DIR, 'research', 'ipp-iter-technology-diagnostics-prospects-2026.md');

const IPP_HOME_URL = 'https://www.ipp.mpg.de/en';
const IPP_ITED_URL = 'https://www.ipp.mpg.de/technologie';
const IPP_FANTZ_URL = 'https://www.ipp.mpg.de/4464403/fantz';
const IPP_DIAGNOSTICS_URL = 'https://www.ipp.mpg.de/3704112/diagnostik';
const IPP_MEISTER_URL = 'https://www.ipp.mpg.de/person/139781/5497858';
const IPP_PRESSURE_GAUGES_URL = 'https://www.ipp.mpg.de/3704145/pressure_gauges';
const IPP_KLINGER_URL = 'https://www.ipp.mpg.de/1084836/klinger';
const IPP_W7X_URL = 'https://www.ipp.mpg.de/w7x';
const IPP_WOLF_URL = 'https://www.mpg.de/391046/plasma-physics-wolf';
const IPP_GREIFSWALD_URL = 'https://www.ipp.mpg.de/17313/greifswald';
const IPP_MC_DERMOTT_URL = 'http://ipp.mpg.de/5338813/Vorstellung_McDermott_2023';
const IPP_ASDEX_URL = 'https://www.ipp.mpg.de/16195/asdex';
const IPP_GUENTER_URL = 'http://ipp.mpg.de/1084794/guenter';
const IPP_HELANDER_URL = 'https://www.ipp.mpg.de/1084958/helander';
const IPP_HEPP_URL = 'https://www.ipp.mpg.de/yourphd';
const IPP_HEPP_ABOUT_URL = 'https://www.ipp.mpg.de/25364/about';
const IPP_FINANCIAL_SUPPORT_URL = 'https://www.ipp.mpg.de/3968816/Financial-Support';
const IPP_JOBS_URL = 'https://www.ipp.mpg.de/17953/stellen';
const EUROFUSION_GRANTS_URL = 'https://euro-fusion.org/eurofusion-news/applications-open-for-the-2026-eurofusion-engineering-grants';
const EURAXESS_URL = 'https://euraxess.ec.europa.eu/jobs';

function source(label, url, note = '') {
  return { type: 'source', label, url, date: RESEARCH_DATE, note };
}

function hiring(label, url, note = '') {
  return { type: 'hiring_signal', label, url, date: RESEARCH_DATE, note };
}

function p(raw) {
  return {
    source: 'ipp',
    institution: 'ipp',
    role_type: 'faculty_or_research_staff',
    campus: 'Germany / IPP network',
    status: 'not_contacted',
    source_report: SOURCE_JSON,
    first_seen: `${RESEARCH_DATE}T00:00:00.000Z`,
    research_keywords: [],
    methods: [],
    facilities: [],
    transfer_vectors: [],
    hiring_signals: [],
    evidence: [],
    opt_h1b_notes: 'German Max Planck doctoral contracts and researcher roles require German/EU work authorization processing. HEPP and IPP HR should confirm route and timing after supervisor interest.',
    ...raw,
  };
}

const prospects = [
  p({
    id: 'ipp-hans-meister-iter-diagnostics',
    name: 'Hans Meister',
    title: 'Dr.; ITER Diagnostics Group contact',
    unit: 'Max Planck Institute for Plasma Physics',
    department: 'ITER Technology & Diagnostics',
    lab: 'ITER Diagnostics Group',
    campus: 'Garching',
    profile_url: IPP_MEISTER_URL,
    lab_url: IPP_DIAGNOSTICS_URL,
    contact_email: 'hans.meister@ipp.mpg.de',
    phone: '+49 89 3299 1885',
    score: 5.0,
    tier: 'A',
    application_route: 'email_supervisor_first',
    application_url: IPP_HEPP_URL,
    research_keywords: ['ITER diagnostics', 'bolometry', 'pressure gauges', 'ASDEX pressure gauges', 'upper port diagnostics'],
    methods: ['bolometer cameras', 'ionization pressure gauges', 'tomographic reconstruction', 'sensor qualification', 'commissioning support'],
    facilities: ['ITER', 'ASDEX Upgrade', 'Garching diagnostics laboratories'],
    transfer_vectors: ['ITER diagnostics', 'FPGA/DAQ', 'detector readout', 'vacuum instrumentation', 'high-voltage systems'],
    hiring_signals: [hiring('ITER Diagnostics Group deliverables', IPP_DIAGNOSTICS_URL, 'IPP develops ITER bolometers and pressure gauges from design through commissioning.')],
    fit_rationale: 'Highest-fit IPP contact: ITER bolometry and pressure gauges directly intersect detector readout, DAQ, vacuum instrumentation, sensor electronics, and high-voltage test discipline.',
    outreach_angle: 'Lead with SSD FPGA readout plus LVACCS vacuum/HV DAQ automation; ask whether bolometer or pressure-gauge qualification projects need a doctoral researcher.',
    likely_route: 'Email Meister first with a one-page ITER diagnostics fit memo, then submit HEPP rolling application and watch IPP positions.',
    evidence: [
      source('ITER Diagnostics Group', IPP_DIAGNOSTICS_URL),
      source('Hans Meister IPP profile', IPP_MEISTER_URL),
      source('ITER pressure gauges', IPP_PRESSURE_GAUGES_URL),
    ],
  }),
  p({
    id: 'ipp-ursel-fantz-ited-nbi',
    name: 'Ursel Fantz',
    title: 'Prof. Dr.; Head of ITER Technology & Diagnostics Division',
    unit: 'Max Planck Institute for Plasma Physics',
    department: 'ITER Technology & Diagnostics',
    lab: 'ITED / Neutral Beam Injection',
    campus: 'Garching',
    profile_url: IPP_FANTZ_URL,
    lab_url: IPP_ITED_URL,
    contact_email: 'ursel.fantz@ipp.mpg.de',
    phone: '+49 89 3299 1958',
    score: 4.9,
    tier: 'A',
    application_route: 'email_supervisor_first',
    application_url: IPP_HEPP_URL,
    research_keywords: ['ITER Technology & Diagnostics', 'neutral beam injection', 'negative ion sources', 'ELISE', 'BATMAN Upgrade', 'DEMO NBI'],
    methods: ['negative-ion source development', 'neutral beam heating', 'beam characterization', 'ITER technology coordination'],
    facilities: ['ELISE', 'BATMAN Upgrade', 'ASDEX Upgrade', 'Wendelstein 7-X', 'ITER'],
    transfer_vectors: ['neutral beam injection', 'high-voltage systems', 'vacuum systems', 'plasma diagnostics', 'beam instrumentation'],
    hiring_signals: [hiring('ITED division scope', IPP_ITED_URL, 'Division hosts IPP technology contributions to ITER including NBI and diagnostics.')],
    fit_rationale: 'Best division-level gatekeeper for ITER technology; can route toward NBI, diagnostics, or cross-division ITER contributions.',
    outreach_angle: 'Frame your vacuum/HV plasma-source workflow and SIMION/SRIM beam intuition as a fit for negative-ion-source and beam-diagnostic test stands.',
    likely_route: 'Supervisor-first email plus HEPP application; ask which ITED group is most appropriate for an instrumentation-heavy doctoral profile.',
    evidence: [
      source('ITER Technology & Diagnostics division', IPP_ITED_URL),
      source('Ursel Fantz profile', IPP_FANTZ_URL),
    ],
  }),
  p({
    id: 'ipp-robert-wolf-nbi-heating',
    name: 'Robert Wolf',
    title: 'Prof. Dr.; Director and Scientific Member',
    unit: 'Max Planck Institute for Plasma Physics',
    department: 'Greifswald Branch / Experimental Heating',
    lab: 'W7-X heating and current drive / NBI-relevant research',
    campus: 'Greifswald',
    profile_url: IPP_WOLF_URL,
    lab_url: IPP_GREIFSWALD_URL,
    contact_email: 'robert.wolf@ipp.mpg.de',
    phone: '+49 3834 88 1205',
    score: 4.5,
    tier: 'A',
    application_route: 'email_supervisor_first',
    application_url: IPP_HEPP_URL,
    research_keywords: ['heating and current drive', 'JET', 'W7-X', 'neutral beam physics', 'fusion operations'],
    methods: ['experimental heating', 'neutral beam systems', 'operation planning', 'fusion diagnostics'],
    facilities: ['Wendelstein 7-X', 'JET', 'IPP Greifswald'],
    transfer_vectors: ['neutral beam injection', 'high-voltage systems', 'vacuum systems', 'beam diagnostics', 'fusion operations'],
    fit_rationale: 'Strong NBI/heating route for your HV/vacuum background, especially if you pitch beamline diagnostics and test-stand operations.',
    outreach_angle: 'Lead with plasma-source HV operations, vacuum testing, and ion-trajectory modelling interest; ask who owns W7-X/NBI diagnostic doctoral projects.',
    likely_route: 'Secondary to Fantz/Meister if the target is direct ITER, primary if you want W7-X heating or beam-test work.',
    evidence: [
      source('Robert Wolf MPG profile', IPP_WOLF_URL),
      source('IPP Greifswald branch', IPP_GREIFSWALD_URL),
      source('ITED NBI scope', IPP_ITED_URL),
    ],
  }),
  p({
    id: 'ipp-thomas-klinger-w7x',
    name: 'Thomas Klinger',
    title: 'Prof. Dr.; Head of Stellarator Dynamics and Transport; W7-X Scientific Director',
    unit: 'Max Planck Institute for Plasma Physics',
    department: 'Stellarator Dynamics and Transport',
    lab: 'Wendelstein 7-X',
    campus: 'Greifswald',
    profile_url: IPP_KLINGER_URL,
    lab_url: IPP_W7X_URL,
    contact_email: 'thomas.klinger@ipp.mpg.de',
    phone: '+49 3834 88 2501',
    score: 4.3,
    tier: 'A',
    application_route: 'email_supervisor_first',
    application_url: IPP_HEPP_URL,
    research_keywords: ['Wendelstein 7-X', 'stellarator dynamics', 'transport', 'long-pulse operation', 'plasma instabilities'],
    methods: ['stellarator experiments', 'long-pulse diagnostics', 'transport analysis', 'operation campaigns'],
    facilities: ['Wendelstein 7-X'],
    transfer_vectors: ['plasma diagnostics', 'DAQ', 'fusion operations', 'control systems', 'space plasma physics'],
    fit_rationale: 'Strong W7-X route: less direct ITER than ITED, but rich in diagnostics, long-pulse operations, control, and instrumentation-heavy campaigns.',
    outreach_angle: 'Position yourself as an instrumentation and test-automation engineer for long-pulse diagnostic reliability and operations data workflows.',
    likely_route: 'HEPP application plus targeted W7-X email if you want stellarator diagnostics or operations.',
    evidence: [
      source('Thomas Klinger IPP profile', IPP_KLINGER_URL),
      source('Wendelstein 7-X page', IPP_W7X_URL),
    ],
  }),
  p({
    id: 'ipp-rachael-mcdermott-asdex',
    name: 'Rachael McDermott',
    title: 'Dr.; Scientific Member and Director',
    unit: 'Max Planck Institute for Plasma Physics',
    department: 'ASDEX Upgrade / Experimental plasma transport and stability',
    lab: 'ASDEX Upgrade',
    campus: 'Garching',
    profile_url: IPP_MC_DERMOTT_URL,
    lab_url: IPP_ASDEX_URL,
    contact_email: '',
    phone: '',
    score: 4.2,
    tier: 'A',
    application_route: 'hepp_rolling_application',
    application_url: IPP_HEPP_URL,
    research_keywords: ['ASDEX Upgrade', 'plasma edge', 'transport', 'stability', 'diagnostics', 'scenario development'],
    methods: ['active spectroscopy', 'turbulence diagnostics', 'edge-stability analysis', 'scenario development'],
    facilities: ['ASDEX Upgrade'],
    transfer_vectors: ['plasma diagnostics', 'Python data analysis', 'fusion operations', 'control-room support'],
    fit_rationale: 'Strong ASDEX route because her division operates key diagnostics and systems for interpreting ASDEX Upgrade plasmas.',
    outreach_angle: 'Use HEPP application and mention diagnostic operations, automated test workflows, and plasma-edge instrumentation support.',
    likely_route: 'Apply through HEPP and IPP positions; direct email only after finding a public group contact or posted project.',
    uncertainty_notes: 'Direct public email was not confirmed in the official source pass.',
    evidence: [
      source('Rachael McDermott IPP announcement', IPP_MC_DERMOTT_URL),
      source('ASDEX Upgrade page', IPP_ASDEX_URL),
    ],
  }),
  p({
    id: 'ipp-tim-happel-asdex-transition',
    name: 'Tim Happel',
    title: 'Dr.; ASDEX Upgrade director / TUM transition signal',
    unit: 'Max Planck Institute for Plasma Physics',
    department: 'ASDEX Upgrade',
    lab: 'ASDEX Upgrade',
    campus: 'Garching',
    profile_url: IPP_ASDEX_URL,
    lab_url: IPP_ASDEX_URL,
    contact_email: '',
    phone: '',
    score: 3.7,
    tier: 'B',
    application_route: 'hepp_rolling_application',
    application_url: IPP_HEPP_URL,
    research_keywords: ['ASDEX Upgrade', 'divertor upgrade', 'scenario development', 'diagnostics'],
    methods: ['tokamak experiments', 'divertor instrumentation', 'diagnostic data analysis'],
    facilities: ['ASDEX Upgrade'],
    transfer_vectors: ['plasma diagnostics', 'DAQ', 'high-voltage systems', 'fusion operations'],
    fit_rationale: 'Relevant ASDEX contact/signal, but lower priority because the research output flagged a 2026 transition risk.',
    outreach_angle: 'Use as an ASDEX topic signal rather than first contact; prioritize McDermott or HEPP application routing.',
    likely_route: 'HEPP or posted ASDEX roles.',
    uncertainty_notes: 'Treat as a transition/hiring-signal record until a stable current profile/contact is verified.',
    evidence: [
      source('ASDEX Upgrade page', IPP_ASDEX_URL),
      source('Parallel IPP research report', SOURCE_JSON, 'Parallel flagged ASDEX leadership transition; verify before outreach.'),
    ],
  }),
  p({
    id: 'ipp-sibylle-guenter-directorate',
    name: 'Sibylle Guenter',
    title: 'Prof. Dr.; Scientific Director',
    unit: 'Max Planck Institute for Plasma Physics',
    department: 'Directorate',
    lab: 'IPP Directorate',
    campus: 'Garching',
    profile_url: IPP_GUENTER_URL,
    lab_url: IPP_HOME_URL,
    contact_email: 'sibylle.guenter@ipp.mpg.de',
    phone: '',
    score: 3.4,
    tier: 'B',
    application_route: 'ipp_jobs_portal',
    application_url: IPP_JOBS_URL,
    research_keywords: ['IPP scientific direction', 'fusion research strategy', 'ASDEX Upgrade', 'W7-X'],
    methods: ['institutional research direction', 'fusion programme strategy'],
    facilities: ['ASDEX Upgrade', 'Wendelstein 7-X'],
    transfer_vectors: ['institutional referral', 'fusion network', 'research strategy'],
    fit_rationale: 'High institutional relevance but not the right first technical contact for an instrumentation PhD.',
    outreach_angle: 'Use only if a formal application or referral path needs directorate-level routing.',
    likely_route: 'Do not cold-email first; use HEPP/IPP jobs and technical group contacts.',
    evidence: [
      source('IPP home page', IPP_HOME_URL),
      source('Sibylle Guenter IPP profile', IPP_GUENTER_URL),
    ],
  }),
  p({
    id: 'ipp-per-helander-stellarator-theory',
    name: 'Per Helander',
    title: 'Prof. Dr.; Director Greifswald; Head of Stellarator Theory',
    unit: 'Max Planck Institute for Plasma Physics',
    department: 'Stellarator Theory',
    lab: 'Stellarator Theory',
    campus: 'Greifswald',
    profile_url: IPP_HELANDER_URL,
    lab_url: IPP_GREIFSWALD_URL,
    contact_email: '',
    phone: '',
    score: 3.2,
    tier: 'B',
    application_route: 'hepp_rolling_application',
    application_url: IPP_HEPP_URL,
    research_keywords: ['stellarator theory', 'transport', 'fusion theory', 'W7-X'],
    methods: ['plasma theory', 'stellarator transport modelling', 'scientific computing'],
    facilities: ['Wendelstein 7-X'],
    transfer_vectors: ['fusion modelling', 'scientific computing', 'data interpretation'],
    fit_rationale: 'Important Greifswald scientific contact, but the fit is theory-heavy compared with your instrumentation/DAQ profile.',
    outreach_angle: 'Use only if you want a modelling-heavy W7-X route with diagnostics-validation framing.',
    likely_route: 'HEPP application rather than direct first outreach.',
    evidence: [
      source('Per Helander IPP profile', IPP_HELANDER_URL),
      source('IPP Greifswald branch', IPP_GREIFSWALD_URL),
    ],
  }),
  p({
    id: 'ipp-hepp-rolling-phd-application',
    name: 'IPP HEPP Rolling PhD Application',
    title: 'International Helmholtz Graduate School for Plasma Physics application route',
    unit: 'IPP / TUM / University of Greifswald',
    department: 'HEPP doctoral programme',
    lab: 'Garching and Greifswald doctoral pool',
    campus: 'Garching / Greifswald',
    profile_url: IPP_HEPP_URL,
    lab_url: IPP_HEPP_ABOUT_URL,
    contact_email: '',
    phone: '',
    role_type: 'job_board_signal',
    score: 4.5,
    tier: 'A',
    application_route: 'hepp_rolling_application',
    application_url: IPP_HEPP_URL,
    research_keywords: ['HEPP', 'rolling PhD application', 'IPP doctoral positions', 'TUM', 'University of Greifswald'],
    methods: ['rolling application pool', 'supervisor matching', 'doctoral contract'],
    transfer_vectors: ['PhD application route', 'supervisor matching', 'funding route'],
    hiring_signals: [hiring('HEPP rolling application', IPP_HEPP_URL, 'IPP states doctoral applications can be submitted any time and supervisors select from the pool.')],
    fit_rationale: 'This is the core IPP PhD mechanism; it matters even more than individual job ads because IPP says specific doctoral projects are usually not advertised.',
    outreach_angle: 'Submit HEPP after tailoring the statement to Meister/Fantz/Wolf/Klinger, not as a generic plasma application.',
    likely_route: 'Apply through HEPP while emailing technical contacts.',
    evidence: [
      source('HEPP application page', IPP_HEPP_URL),
      source('HEPP about page', IPP_HEPP_ABOUT_URL),
      source('HEPP financial support', IPP_FINANCIAL_SUPPORT_URL),
    ],
  }),
  p({
    id: 'ipp-open-positions-monitor',
    name: 'IPP Open Positions',
    title: 'Official IPP positions monitor',
    unit: 'Max Planck Institute for Plasma Physics',
    department: 'Personnel / Careers',
    lab: 'IPP vacancies',
    campus: 'Garching / Greifswald',
    profile_url: IPP_JOBS_URL,
    contact_email: '',
    role_type: 'job_board_signal',
    score: 4.1,
    tier: 'A',
    application_route: 'ipp_jobs_portal',
    application_url: IPP_JOBS_URL,
    research_keywords: ['IPP jobs', 'postdoctoral positions', 'research engineering', 'doctoral positions'],
    methods: ['weekly vacancy monitoring'],
    transfer_vectors: ['job-board monitoring', 'research engineer route', 'PhD application route'],
    hiring_signals: [hiring('IPP positions vacant', IPP_JOBS_URL, 'Official IPP careers page for Garching and Greifswald roles.')],
    fit_rationale: 'Required monitor for posted research engineer, doctoral, and postdoc roles, especially if HEPP alone is too broad.',
    outreach_angle: 'Filter for diagnostics, NBI, ASDEX Upgrade, W7-X, electronics, DAQ, control, and high-voltage keywords.',
    likely_route: 'Apply to listed roles; use a technical contact email as a parallel warm route.',
    evidence: [
      source('IPP positions vacant', IPP_JOBS_URL),
      source('IPP home career section', IPP_HOME_URL),
    ],
  }),
  p({
    id: 'ipp-eurofusion-grants-monitor',
    name: 'EUROfusion Engineering / Researcher Grants for IPP',
    title: 'EUROfusion grant route into IPP projects',
    unit: 'EUROfusion',
    department: 'Researcher and Engineering Grants',
    lab: 'EUROfusion / IPP network',
    campus: 'Germany / EUROfusion',
    profile_url: EUROFUSION_GRANTS_URL,
    role_type: 'job_board_signal',
    score: 3.8,
    tier: 'B',
    institution: 'eu_collaborator',
    source: 'ipp',
    application_route: 'eurofusion_route',
    application_url: EUROFUSION_GRANTS_URL,
    research_keywords: ['EUROfusion grants', 'engineering grants', 'fusion diagnostics', 'ITER technology'],
    methods: ['grant-backed placement monitoring'],
    transfer_vectors: ['fusion network', 'grant route', 'research placement'],
    fit_rationale: 'Useful parallel route if IPP group interest exists but no direct HEPP/job opening is ready.',
    outreach_angle: 'Ask Meister/Fantz whether a diagnostics or NBI project could be framed as a EUROfusion Engineering Grant.',
    likely_route: 'Grant-backed placement or research role.',
    evidence: [source('EUROfusion Engineering Grants', EUROFUSION_GRANTS_URL)],
  }),
  p({
    id: 'ipp-euraxess-germany-monitor',
    name: 'EURAXESS Germany IPP/Fusion Monitor',
    title: 'European research-job board signal',
    unit: 'EURAXESS',
    department: 'Research jobs',
    lab: 'Germany fusion/plasma search',
    campus: 'Germany / EU',
    profile_url: EURAXESS_URL,
    role_type: 'job_board_signal',
    score: 3.5,
    tier: 'B',
    institution: 'eu_collaborator',
    source: 'ipp',
    application_route: 'euraxess_position',
    application_url: EURAXESS_URL,
    research_keywords: ['EURAXESS Germany', 'fusion jobs', 'plasma PhD', 'IPP postings'],
    methods: ['weekly job-board monitoring'],
    transfer_vectors: ['research job monitoring', 'PhD application route'],
    fit_rationale: 'Backup monitor for externally posted IPP, Max Planck, TUM, Greifswald, and EUROfusion roles.',
    outreach_angle: 'Use filters for Germany, IPP, ITER, diagnostics, neutral beam, W7-X, ASDEX Upgrade, plasma.',
    likely_route: 'Apply to posted positions only.',
    evidence: [source('EURAXESS jobs portal', EURAXESS_URL)],
  }),
];

function markdownReport() {
  const sourceData = JSON.parse(readFileSync(RESEARCH_JSON_PATH, 'utf-8'));
  const content = sourceData.output?.content || {};
  const sections = [
    ['Executive Summary', content.executive_summary],
    ['IPP Structure And ITER Groups', content.ipp_division_structure_and_iter_relevant_groups],
    ['ITER Diagnostics Pipeline', content.iter_diagnostics_group_bolometer_and_pressure_gauge_pipelines],
    ['NBI And Heating Architecture', content.greifswald_nbi_and_heating_architecture],
    ['W7-X Diagnostics And Operations', content.w7_x_greifswald_diagnostics_operations_and_engineering_technology],
    ['ASDEX Upgrade ITER Test Bed', content.asdex_upgrade_iter_plasma_scenario_test_bed],
    ['Application Routes', content.application_routes_and_career_portals],
    ['Fit Ranking For Harsh Desai', content.harsh_desai_fit_ranking],
    ['Routing Strategy', content.synthesis_routing_strategy_and_time_bound_actions],
  ];
  return [
    '# Max Planck IPP ITER Technology / Diagnostics Prospects',
    '',
    `**Compiled for:** Harsh Desai`,
    `**Date:** ${RESEARCH_DATE}`,
    `**Parallel run:** ${sourceData.run_id || ''}`,
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
    scope: 'Max Planck IPP ITER technology and diagnostics research prospects',
    research_run: 'trun_dd47611047ba45198fed4e7b9a424cfd',
    research_date: RESEARCH_DATE,
    source_report: SOURCE_REPORT,
    prospects: sortedProspects,
  }, { source: 'ipp', preserveUserState: true });
  const synced = syncResearchProspectsToDashboard({ source: 'ipp' });
  const directEmails = store.prospects.filter(prospect => prospect.contact_email).length;
  console.log(`Imported ${store.prospects.length} IPP research prospects.`);
  console.log(`Dashboard mirror has ${synced.total} prospects.`);
  console.log(`Direct emails available: ${directEmails}.`);
}
