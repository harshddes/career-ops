#!/usr/bin/env node
/**
 * Seed Networking Command Center with Europe space employers that publicly
 * support international hire / visa relocation, plus named people from
 * official careers pages (no LinkedIn scrape).
 *
 * Context: research report reports/europe-space-direct-hire-no-eu-degree-2026-07-25.md
 */

import {
  syncNetworkingToDashboard,
  upsertNetworkingOrganization,
  upsertNetworkingPerson,
} from '../lib/networking/store.mjs';

const CAPTURED_AT = new Date().toISOString();
const REPORT = 'reports/europe-space-direct-hire-no-eu-degree-2026-07-25.md';

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

function seedOrg(raw) {
  const { organization } = upsertNetworkingOrganization(raw);
  return organization;
}

function seedPerson(raw) {
  const { person } = upsertNetworkingPerson({
    ...raw,
    relationship_stage: raw.relationship_stage || 'identified',
    review_status: 'review_ready',
    affinity_tags: [],
  });
  return person;
}

const iceye = seedOrg({
  name: 'ICEYE',
  aliases: ['Iceye'],
  domain: 'iceye.com',
  website: 'https://www.iceye.com/',
  tier: 'A',
  strategy_status: 'active',
  locations: ['Espoo, Finland', 'Poland', 'Spain', 'Germany', 'UK'],
  tags: ['newspace', 'sar', 'europe-direct-hire', 'visa-sponsorship'],
  feasibility_label: 'Strong — public visa/relocation support for most international hires; 75+ nationalities claimed',
  feasibility_notes: [
    'Official recruitment FAQ: hires internationally; relocation and/or visa support for most roles/locations, assessed case by case.',
    'Careers page: employees from more than 75 different countries (public employee quote).',
    'Best path for non-EU / no-EU-degree candidates seeking commercial space (not ESA staff).',
    `Research: ${REPORT}`,
  ].join(' '),
  organization_units: [
    {
      name: 'Spacecraft Engineering',
      focus: 'SAR microsatellite constellation engineering',
      source_url: 'https://www.iceye.com/careers',
    },
  ],
  source_refs: [
    source(
      'visa_relocation',
      'Do you support relocation and visas? For most roles and locations we provide relocation and/or visa support, assessed case by case.',
      'https://www.iceye.com/careers/recruitment',
      'ICEYE Recruitment FAQ',
      0.98,
    ),
    source(
      'international_workforce',
      'We have employees from more than 75 different countries!',
      'https://www.iceye.com/careers',
      'ICEYE Careers — Cultural Diversity quote',
      0.95,
    ),
  ],
});

const isar = seedOrg({
  name: 'Isar Aerospace',
  aliases: ['Isar Aerospace SE'],
  domain: 'isaraerospace.com',
  website: 'https://www.isaraerospace.com/',
  tier: 'A',
  strategy_status: 'active',
  locations: ['Ottobrunn / Munich, Germany', 'Kiruna, Sweden', 'Andøya, Norway'],
  tags: ['newspace', 'launch', 'germany', 'europe-direct-hire'],
  feasibility_label: 'Strong — international team messaging; large open eng board in Germany (Blue Card path)',
  feasibility_notes: [
    'Careers: workplace of people from all over the world; English or German applications.',
    'Germany Blue Card shortage STEM thresholds apply for sponsored skilled hires.',
    `Research: ${REPORT}`,
  ].join(' '),
  source_refs: [
    source(
      'international_team',
      'A workplace full of talented and down-to-earth people from all over the world.',
      'https://www.isaraerospace.com/career',
      'Isar Aerospace Career',
      0.92,
    ),
  ],
});

const rfa = seedOrg({
  name: 'Rocket Factory Augsburg',
  aliases: ['RFA', 'Rocket Factory Augsburg AG'],
  domain: 'rfa.space',
  website: 'https://www.rfa.space/',
  tier: 'A',
  strategy_status: 'active',
  locations: ['Augsburg, Germany', 'Portugal', 'Shetland / UK'],
  tags: ['newspace', 'launch', 'germany', 'europe-direct-hire'],
  feasibility_label: 'Strong — Greenhouse postings claim 300+ colleagues from 40+ countries',
  feasibility_notes: [
    'Public careers / Greenhouse: work alongside 300+ colleagues from over 40 countries.',
    'Germany Blue Card path for engineering roles; Portugal/UK sites also relevant.',
    `Research: ${REPORT}`,
  ].join(' '),
  source_refs: [
    source(
      'international_workforce',
      'Work alongside 300+ colleagues from over 40 countries and take ownership from day one.',
      'https://job-boards.eu.greenhouse.io/rocketfactoryaugsburgag/jobs/4841879101',
      'RFA Greenhouse job posting — international team claim',
      0.93,
      'job_posting',
    ),
  ],
});

for (const org of [
  {
    name: 'OHB',
    aliases: ['OHB SE', 'OHB System'],
    domain: 'ohb.de',
    website: 'https://www.ohb.de/',
    locations: ['Bremen, Germany', 'Munich, Germany', 'Sweden'],
    feasibility_label: 'Possible/Strong — private German prime; Blue Card; not bound by ESA nationality rules',
  },
  {
    name: 'Airbus Defence and Space',
    aliases: ['Airbus DS', 'Airbus Defence & Space'],
    domain: 'airbus.com',
    website: 'https://www.airbus.com/en/careers',
    locations: ['Germany', 'France', 'Spain', 'UK', 'Netherlands'],
    feasibility_label: 'Strong/Possible — Blue Card / Talent / Skilled Worker; India→Europe ICT also common',
  },
  {
    name: 'Thales Alenia Space',
    aliases: ['TAS'],
    domain: 'thalesaleniaspace.com',
    website: 'https://www.thalesaleniaspace.com/',
    locations: ['France', 'Italy', 'Spain', 'UK', 'Belgium'],
    feasibility_label: 'Strong/Possible — FR Passeport Talent / IT work permits for non-EU engineers',
  },
  {
    name: 'GMV',
    aliases: ['GMV Innovating Solutions'],
    domain: 'gmv.com',
    website: 'https://www.gmv.com/',
    locations: ['Madrid, Spain', 'EU offices'],
    feasibility_label: 'Possible/Strong — Spanish highly qualified worker permits for engineers',
  },
  {
    name: 'European Space Agency',
    aliases: ['ESA'],
    domain: 'esa.int',
    website: 'https://www.esa.int/About_Us/Careers_at_ESA',
    locations: ['ESTEC NL', 'ESOC DE', 'ESRIN IT', 'ESAC ES', 'HQ FR'],
    feasibility_label: 'Closed for Indian nationals as ESA staff — contractors only',
    tags: ['esa', 'nationality-restricted'],
  },
]) {
  seedOrg({
    ...org,
    tier: org.name === 'European Space Agency' ? 'C' : 'B',
    strategy_status: org.name === 'European Space Agency' ? 'watch' : 'active',
    tags: org.tags || ['europe-space', 'europe-direct-hire'],
    feasibility_notes: `See ${REPORT}. ESA FAQ: non-Member-State nationals cannot apply for ESA staff.`,
    source_refs: org.name === 'European Space Agency'
      ? [
          source(
            'nationality_gate',
            'I am not a national of one of the ESA Member States. Can I still apply? Unfortunately, this is not possible.',
            'https://www.esa.int/content/view/full/489484',
            'ESA Careers FAQ',
            0.99,
          ),
        ]
      : [
          source(
            'research_report',
            org.feasibility_label,
            `https://github.com/local/${REPORT}`,
            'Europe space direct-hire research report',
            0.7,
            'research',
          ),
        ],
  });
}

const people = [
  {
    display_name: 'Tapolina Jha',
    title: 'Software Engineer',
    current_organization: iceye.name,
    organization_id: iceye.id,
    personas: ['peer'],
    notes: 'Public ICEYE careers quote on 75-country workforce. Contact for culture / international hiring process — do not infer personal immigration path.',
    source_refs: [
      source(
        'title',
        'Software Engineer',
        'https://www.iceye.com/careers',
        'ICEYE Careers — Cultural Diversity',
        0.95,
      ),
      source(
        'quote_workforce',
        'We have employees from more than 75 different countries!',
        'https://www.iceye.com/careers',
        'ICEYE Careers',
        0.95,
      ),
    ],
  },
  {
    display_name: 'Oscar Gil',
    title: 'Director of Spacecraft Engineering',
    current_organization: iceye.name,
    organization_id: iceye.id,
    personas: ['hiring_manager', 'peer'],
    notes: 'Named on ICEYE careers. Useful spacecraft-engineering networking target. Bio mentions joining during masters — may be study-path; do not claim no-EU-study.',
    source_refs: [
      source(
        'title',
        'Director of Spacecraft Engineering',
        'https://www.iceye.com/careers',
        'ICEYE Careers — Revolutionary approach',
        0.95,
      ),
    ],
  },
  {
    display_name: 'Rachel Finerman',
    title: 'Customer Operations & Satellite Planning Manager',
    current_organization: iceye.name,
    organization_id: iceye.id,
    personas: ['peer'],
    notes: 'Named on ICEYE careers (ops/planning). Informational outreach only.',
    source_refs: [
      source(
        'title',
        'Customer Operations & Satellite Planning Manager',
        'https://www.iceye.com/careers',
        'ICEYE Careers — Career development',
        0.95,
      ),
    ],
  },
  {
    display_name: 'Vincenzo Messina',
    title: 'Test Data Engineer',
    current_organization: rfa.name,
    organization_id: rfa.id,
    personas: ['peer'],
    notes: 'RFA Meet the Team — propulsion test data. Strong overlap with instrumentation/DAQ interests.',
    source_refs: [
      source(
        'title',
        'Test Data Engineer — propulsion test data from Augsburg and rest of Europe',
        'https://www.rfa.space/career',
        'RFA Careers — Meet the Team',
        0.94,
      ),
    ],
  },
  {
    display_name: 'Maria Terekhova',
    title: 'Head of Business Development',
    current_organization: rfa.name,
    organization_id: rfa.id,
    personas: ['peer'],
    notes: 'RFA Meet the Team — partnerships with EC, ESA, DLR. Not a technical hiring manager.',
    source_refs: [
      source(
        'title',
        'Head of Business Development — EC/ESA/DLR partnerships',
        'https://www.rfa.space/career',
        'RFA Careers — Meet the Team',
        0.94,
      ),
    ],
  },
  {
    display_name: 'Aidan (Isar Composites)',
    title: 'Team Leader Composites',
    current_organization: isar.name,
    organization_id: isar.id,
    personas: ['peer'],
    notes: 'First name only on public Isar video card. Use company careers channel; surname unknown from public page.',
    source_refs: [
      source(
        'title',
        'Team Leader Composites',
        'https://www.isaraerospace.com/career',
        'Isar Aerospace — Meet your future colleagues',
        0.85,
      ),
    ],
  },
  {
    display_name: 'Katherine (Isar Valves)',
    title: 'Team Lead Launch Vehicle Valves',
    current_organization: isar.name,
    organization_id: isar.id,
    personas: ['peer'],
    notes: 'First name only on public Isar video card.',
    source_refs: [
      source(
        'title',
        'Team Lead Launch Vehicle Valves',
        'https://www.isaraerospace.com/career',
        'Isar Aerospace — Meet your future colleagues',
        0.85,
      ),
    ],
  },
  {
    display_name: 'Larissa (Isar GNC)',
    title: 'Guidance & Trajectory Optimization Engineer',
    current_organization: isar.name,
    organization_id: isar.id,
    personas: ['peer'],
    notes: 'First name only on public Isar video card.',
    source_refs: [
      source(
        'title',
        'Guidance & Trajectory Optimization Engineer',
        'https://www.isaraerospace.com/career',
        'Isar Aerospace — Meet your future colleagues',
        0.85,
      ),
    ],
  },
  {
    display_name: 'Inés (Isar Software)',
    title: 'Junior Software Engineer',
    current_organization: isar.name,
    organization_id: isar.id,
    personas: ['peer'],
    notes: 'First name only on public Isar video card. Early-career signal.',
    source_refs: [
      source(
        'title',
        'Junior Software Engineer',
        'https://www.isaraerospace.com/career',
        'Isar Aerospace — Meet your future colleagues',
        0.85,
      ),
    ],
  },
  {
    display_name: 'Clara (Isar Supply Chain)',
    title: 'Head of Supply Chain Management',
    current_organization: isar.name,
    organization_id: isar.id,
    personas: ['peer'],
    notes: 'First name only on public Isar video card.',
    source_refs: [
      source(
        'title',
        'Head of Supply Chain Management',
        'https://www.isaraerospace.com/career',
        'Isar Aerospace — Meet your future colleagues',
        0.85,
      ),
    ],
  },
];

const seededPeople = people.map(seedPerson);
const sync = syncNetworkingToDashboard();

console.log(JSON.stringify({
  organizations: ['ICEYE', 'Isar Aerospace', 'Rocket Factory Augsburg', 'OHB', 'Airbus Defence and Space', 'Thales Alenia Space', 'GMV', 'European Space Agency'],
  people_seeded: seededPeople.map(p => ({ id: p.id, name: p.display_name, org: p.current_organization, review: p.review_status })),
  sync_ok: Boolean(sync),
  report: REPORT,
}, null, 2));
