#!/usr/bin/env node
/**
 * Pixxel networking research upsert for order network-research-1785247172281-01r27o.
 * Evidence-only candidates; no LinkedIn scrape; no auto-contact.
 */

import {
  syncNetworkingToDashboard,
  upsertNetworkingOrganization,
  upsertNetworkingPerson,
} from '../lib/networking/store.mjs';
import {
  completeNetworkingResearch,
  markNetworkingResearchReviewReady,
} from '../lib/networking/factory.mjs';

const CAPTURED_AT = new Date().toISOString();
const ORDER_ID = 'network-research-1785247172281-01r27o';
const TEAM_URL = 'https://www.pixxel.space/team';
const NRO_NEWS = 'https://www.pixxel.space/news/pixxel-awarded-nro-strategic-commercial-enhancements-contract-for-hyperspectral-remote-sensing-capabilities';
const JEREMY_SITE = 'https://www.jeremyalankravitz.com/';
const SVSW_ALLYSON = 'https://svsw.events/speakers/allyson-jenkins';
const MEGA_FACILITY = 'https://www.pixxel.space/news/pixxel-opens-first-of-its-kind-spacecraft-manufacturing-facility-in-bengaluru-india';

function source(field, observedValue, url, title, confidence = 0.95, sourceType = 'official') {
  return {
    field,
    observed_value: observedValue,
    url,
    title,
    source_type: sourceType,
    captured_at: CAPTURED_AT,
    confidence,
  };
}

function linkedinFromTeam(url) {
  return {
    linkedin: {
      state: 'available',
      profile_url: url,
      thread_url: '',
      last_touch_at: '',
      next_permitted_touch_at: '',
      unanswered_followups: 0,
      notes: 'Profile URL published on Pixxel official team page (not scraped)',
    },
  };
}

const org = upsertNetworkingOrganization({
  id: 'network-org-pixxel',
  name: 'Pixxel',
  aliases: ['Pixxel Space', 'Pixxel Space Technologies', 'Pixxel Space Technologies, Inc.', 'Pixxel Federal'],
  domain: 'pixxel.space',
  website: 'https://www.pixxel.space/',
  tier: 'A',
  strategy_status: 'active',
  locations: [
    'Bengaluru, Karnataka, India',
    'El Segundo, CA, USA (2301 Rosecrans Ave)',
    'Washington, DC area (Public Sector / Federal)',
  ],
  tags: [
    'hyperspectral',
    'earth-observation',
    'spacecraft-ops',
    'calibration',
    'us-branch',
    'india-hq',
  ],
  opportunity_ids: [
    'pixxel-spacecraft-controller',
    'pixxel-calibration-engineer',
  ],
  organization_units: [
    {
      name: 'Mission Control / Spacecraft Operations',
      focus: 'Mission control room in Bengaluru MegaPixxel facility; spacecraft controller and mission operations roles',
      source_url: MEGA_FACILITY,
    },
    {
      name: 'Payload / Calibration',
      focus: 'Hyperspectral payload radiometric/geometric calibration and in-flight calibration',
      source_url: 'https://jobs.techstars.com/companies/pixxel-2/jobs/81755296-calibration-engineer',
    },
    {
      name: 'Pixxel Federal / US Public Sector',
      focus: 'US government and NRO hyperspectral contracts; El Segundo + DC presence',
      source_url: NRO_NEWS,
    },
  ],
  feasibility_label: 'Strong — public US office (El Segundo) + Bengaluru mission control; applied Spacecraft Controller and Calibration Engineer roles',
  feasibility_notes: [
    'Research focus: Spacecraft Controller + Calibration Engineer (Darwinbox pixxel-P-S-10).',
    'US branch confirmed via company LinkedIn locality El Segundo and Jeremy Kravitz personal site listing 2301 Rosecrans Ave Suite 4150.',
    'No explicit public University of Michigan or VIT alumni evidence found without LinkedIn scraping — affinity tags left empty.',
    'Named IC spacecraft-controller peers are not on the public team page; route Spacecraft Controller outreach via SVP Engineering / CTO / CSO.',
  ].join(' '),
  source_refs: [
    source(
      'team_page',
      'Official Pixxel leadership roster with titles and LinkedIn profile links.',
      TEAM_URL,
      'Pixxel — Meet the Team',
      0.99,
    ),
    source(
      'us_office',
      'El Segundo, California office at 2301 Rosecrans Avenue supports North American operations.',
      'https://exa.ai/websets/directory/pixxel-offices',
      'Pixxel office locations directory',
      0.85,
      'directory',
    ),
    source(
      'mission_control',
      'MegaPixxel Bengaluru facility houses a mission control room alongside AIT clean rooms.',
      MEGA_FACILITY,
      'Pixxel Opens Spacecraft Manufacturing Facility in Bengaluru',
      0.97,
    ),
    source(
      'nro_us_federal',
      'NRO SCE contract execution by Pixxel Federal team led by Allyson Jenkins; Ryan McKinney quoted as CRO.',
      NRO_NEWS,
      'Pixxel Awarded NRO SCE Contract',
      0.98,
    ),
  ],
  notes: 'Prioritize contacts for spacecraft operations / ground segment / mission control and payload radiometric / sensor calibration. Prefer US-based staff when applying or networking toward US branch.',
}).organization;

const people = [
  {
    display_name: 'Tanya Pallavi',
    title: 'Head of People Practices',
    personas: ['recruiter'],
    location: '',
    organization_unit: 'People / Talent',
    linkedin_url: 'https://www.linkedin.com/in/tanya-pallavi-she-her-b3180425/',
    fit_reasons: [
      'Official Head of People Practices — primary recruiter persona for Spacecraft Controller and Calibration Engineer applications.',
      'Listed on Pixxel team page as talent/HR leadership.',
    ],
    notes: 'Recruiter lane for Darwinbox applied roles; do not auto-contact.',
    source_refs: [
      source('title', 'Head of People Practices', TEAM_URL, 'Pixxel — Meet the Team', 0.99),
    ],
  },
  {
    display_name: 'Ravi Suhag',
    title: 'SVP, Engineering',
    personas: ['hiring_manager'],
    location: '',
    organization_unit: 'Engineering',
    linkedin_url: 'https://www.linkedin.com/in/ravisuhag/',
    fit_reasons: [
      'SVP Engineering oversees cross-functional engineering including satellite production — natural hiring manager for Spacecraft Controller / mission ops adjacent roles.',
      'Public bios cite Blue Origin mission automation background (relevant to spacecraft operations path).',
    ],
    notes: 'Primary engineering hiring-manager target for Spacecraft Controller research focus.',
    source_refs: [
      source('title', 'SVP, Engineering', TEAM_URL, 'Pixxel — Meet the Team', 0.99),
      source(
        'background',
        'Directory bio: M.S. Aerospace MIT; Blue Origin suborbital launch systems and mission automation.',
        'https://exa.ai/websets/directory/pixxel-executives',
        'Pixxel executives directory',
        0.8,
        'directory',
      ),
    ],
  },
  {
    display_name: 'Kshitij Khandelwal',
    title: 'Founder and CTO',
    personas: ['hiring_manager'],
    location: 'Bengaluru, India',
    organization_unit: 'Technology / Payload',
    linkedin_url: 'https://www.linkedin.com/in/khandelwalkshitij/',
    fit_reasons: [
      'CTO owns technology roadmap including hyperspectral payloads — hiring-manager path for Calibration Engineer and spacecraft systems.',
      'Co-founder listed on official team page.',
    ],
    notes: 'CTO lane for payload/calibration and spacecraft systems.',
    source_refs: [
      source('title', 'Founder and CTO', TEAM_URL, 'Pixxel — Meet the Team', 0.99),
    ],
  },
  {
    display_name: 'Eiji Yafuso',
    title: 'Chief Science Officer',
    personas: ['hiring_manager', 'peer'],
    location: 'United States',
    organization_unit: 'Science / Operations',
    linkedin_url: 'https://www.linkedin.com/in/eiji-yafuso-9ab79/',
    fit_reasons: [
      'CSO guides scientific agenda for hyperspectral observations — top hiring-manager/peer for Calibration Engineer and radiometric/sensor science.',
      'Public ResearchGate profile includes infrared portable calibration unit publication; team page lists US-facing science leadership.',
      'US-based per public profile locality signals; relevant to US-branch networking ask.',
    ],
    notes: 'Calibration / science hiring manager; US-linked. Affinity umich/vit not claimed (no public evidence).',
    source_refs: [
      source('title', 'Chief Science Officer', TEAM_URL, 'Pixxel — Meet the Team', 0.99),
      source(
        'calibration_pub',
        'Infrared portable calibration unit (1993) — field IR calibration platform for imaging/spectral instruments.',
        'https://www.researchgate.net/profile/Eiji-Yafuso',
        'Eiji Yafuso — ResearchGate',
        0.9,
        'publication',
      ),
    ],
  },
  {
    display_name: 'Jeremy Kravitz',
    title: 'VP, Analytics / Senior Hyperspectral Scientist',
    personas: ['peer'],
    location: 'El Segundo, CA, USA',
    organization_unit: 'Analytics / Science',
    linkedin_url: 'https://www.linkedin.com/in/jeremy-kravitz-07bb5612a/',
    github_url: 'https://github.com/JAKravitz',
    email: 'jeremy@pixxel.space',
    fit_reasons: [
      'Self-published El Segundo Pixxel address + work email; senior hyperspectral scientist / VP Analytics — peer for calibration-adjacent science and US branch.',
      'Personal site states current work with Pixxel on advanced hyperspectral satellite imagery.',
    ],
    notes: 'Strongest US technical peer with published work email. Prefer science/calibration conversation over cold sales pitch.',
    channel_states: {
      ...linkedinFromTeam('https://www.linkedin.com/in/jeremy-kravitz-07bb5612a/'),
      email: {
        state: 'available',
        profile_url: '',
        thread_url: '',
        last_touch_at: '',
        next_permitted_touch_at: '',
        unanswered_followups: 0,
        notes: 'Work email published on personal site jeremyalankravitz.com',
      },
      github: {
        state: 'available',
        profile_url: 'https://github.com/JAKravitz',
        thread_url: '',
        last_touch_at: '',
        next_permitted_touch_at: '',
        unanswered_followups: 0,
        notes: 'Public GitHub linked from personal site',
      },
    },
    source_refs: [
      source('title', 'VP, Analytics', TEAM_URL, 'Pixxel — Meet the Team', 0.99),
      source(
        'title_alt',
        'Senior Hyperspectral Scientist; currently working with Pixxel',
        JEREMY_SITE,
        'Jeremy Kravitz personal site',
        0.98,
        'personal_site',
      ),
      source(
        'location',
        'Pixxel — 2301 Rosecrans ave suite 4150, El Segundo CA 90245',
        JEREMY_SITE,
        'Jeremy Kravitz personal site',
        0.98,
        'personal_site',
      ),
      source(
        'email',
        'jeremy@pixxel.space',
        JEREMY_SITE,
        'Jeremy Kravitz personal site',
        0.98,
        'personal_site',
      ),
      source(
        'github',
        'https://github.com/JAKravitz',
        JEREMY_SITE,
        'Jeremy Kravitz personal site',
        0.95,
        'personal_site',
      ),
    ],
  },
  {
    display_name: 'Allyson Jenkins',
    title: 'VP, Public Sector',
    personas: ['hiring_manager'],
    location: 'Washington, DC / USA',
    organization_unit: 'Pixxel Federal / Public Sector',
    linkedin_url: 'https://www.linkedin.com/in/allysonjenkins/',
    fit_reasons: [
      'Leads US public-sector / Pixxel Federal team — key US-branch hiring-manager surface.',
      'Quoted on Pixxel NRO SCE contract news as VP Public Sector leading Federal execution.',
      'Conference bio (Silicon Valley Space Week) confirms VP Public Sector at Pixxel Space Technologies.',
    ],
    notes: 'US Federal / NRO lane. Useful for US-branch networking even if applied roles are India-posted.',
    source_refs: [
      source('title', 'VP, Public Sector', TEAM_URL, 'Pixxel — Meet the Team', 0.99),
      source(
        'nro_quote',
        'Execution will be handled by Pixxel Federal team, led by Allyson Jenkins.',
        NRO_NEWS,
        'Pixxel Awarded NRO SCE Contract',
        0.98,
      ),
      source(
        'speaker_bio',
        'Vice President, Public Sector — Pixxel Space Technologies',
        SVSW_ALLYSON,
        'Silicon Valley Space Week — Allyson Jenkins',
        0.96,
        'conference',
      ),
    ],
  },
  {
    display_name: 'Ryan McKinney',
    title: 'Chief Revenue Officer',
    personas: ['hiring_manager'],
    location: 'United States',
    organization_unit: 'Revenue / Go-to-Market',
    linkedin_url: 'https://www.linkedin.com/in/ryan-mckinney-b5aa70/',
    fit_reasons: [
      'CRO quoted on US NRO contract news — US commercial/gov GTM leadership.',
      'Listed on official Pixxel leadership team page.',
    ],
    notes: 'US commercial leadership; secondary to engineering/science for applied technical roles.',
    source_refs: [
      source('title', 'Chief Revenue Officer', TEAM_URL, 'Pixxel — Meet the Team', 0.99),
      source(
        'nro_quote',
        'Said Ryan McKinney, Chief Revenue Officer, Pixxel — NRO SCE announcement.',
        NRO_NEWS,
        'Pixxel Awarded NRO SCE Contract',
        0.98,
      ),
    ],
  },
  {
    display_name: 'Manas Gupta',
    title: 'VP, Electronics',
    personas: ['peer', 'hiring_manager'],
    location: 'Bengaluru, India',
    organization_unit: 'Electronics / Avionics / Payload',
    linkedin_url: 'https://www.linkedin.com/in/guptamanas1/',
    fit_reasons: [
      'VP Electronics for payload and bus electronics — peer/hiring-manager adjacency to Calibration Engineer optical/electronics integration.',
      'Official team page leadership listing.',
    ],
    notes: 'Payload electronics peer for calibration/integration conversations.',
    source_refs: [
      source('title', 'VP, Electronics', TEAM_URL, 'Pixxel — Meet the Team', 0.99),
    ],
  },
  {
    display_name: 'Tejaswi Hareesh',
    title: 'VP, Mechanics',
    personas: ['peer'],
    location: 'Bengaluru, India',
    organization_unit: 'Mechanics / Structures / Thermal',
    linkedin_url: 'https://www.linkedin.com/in/tejaswi-hareesh/',
    fit_reasons: [
      'VP Mechanics for satellite structural/thermal platforms — peer adjacent to spacecraft hardware and optomechanical calibration fixtures.',
      'Official team page leadership listing.',
    ],
    notes: 'Spacecraft hardware peer; secondary to ops controller path.',
    source_refs: [
      source('title', 'VP, Mechanics', TEAM_URL, 'Pixxel — Meet the Team', 0.99),
    ],
  },
  {
    display_name: 'Abhilash Bhat',
    title: 'Chief of Staff',
    personas: ['peer'],
    location: '',
    organization_unit: 'Executive / Launch PMO',
    linkedin_url: 'https://www.linkedin.com/in/abhilashbhat/',
    fit_reasons: [
      'Chief of Staff; directory bios credit launch program management for Firefly — coordination node near spacecraft operations delivery.',
      'Official team page listing.',
    ],
    notes: 'Ops/program coordination peer; not a spacecraft controller IC.',
    source_refs: [
      source('title', 'Chief of Staff', TEAM_URL, 'Pixxel — Meet the Team', 0.99),
      source(
        'launch_pmo',
        'Directory bio: led launch program management office for Firefly satellite series.',
        'https://exa.ai/websets/directory/pixxel-executives',
        'Pixxel executives directory',
        0.8,
        'directory',
      ),
    ],
  },
];

const candidateIds = [];
for (const person of people) {
  const channel_states = person.channel_states || linkedinFromTeam(person.linkedin_url);
  const result = upsertNetworkingPerson({
    display_name: person.display_name,
    title: person.title,
    current_organization_id: org.id,
    current_organization: org.name,
    organization_unit: person.organization_unit || '',
    location: person.location || '',
    personas: person.personas,
    affinity_tags: [],
    relationship_stage: 'identified',
    review_status: 'review_ready',
    fit_reasons: person.fit_reasons,
    linkedin_url: person.linkedin_url || '',
    github_url: person.github_url || '',
    email: person.email || '',
    opportunity_ids: [
      'pixxel-spacecraft-controller',
      'pixxel-calibration-engineer',
    ],
    notes: person.notes || '',
    source_refs: person.source_refs,
    channel_states,
  });
  candidateIds.push(result.person.id);
  console.log(`upserted ${result.person.id} (${result.person.review_status})`);
}

markNetworkingResearchReviewReady(ORDER_ID, candidateIds);
completeNetworkingResearch(ORDER_ID);
syncNetworkingToDashboard();

console.log(JSON.stringify({
  order_id: ORDER_ID,
  organization_id: org.id,
  candidate_count: candidateIds.length,
  candidate_person_ids: candidateIds,
  affinity_note: 'No explicit public UMich or VIT alumni evidence found; affinity_tags left empty.',
  us_branch_highlights: [
    'Jeremy Kravitz — El Segundo + jeremy@pixxel.space',
    'Allyson Jenkins — US Public Sector / Federal',
    'Eiji Yafuso — CSO with US locality signals',
    'Ryan McKinney — CRO on US NRO announcement',
  ],
}, null, 2));
