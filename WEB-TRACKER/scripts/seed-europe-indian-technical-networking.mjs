#!/usr/bin/env node
/**
 * Seed Indian technical contacts at European space companies (beyond ICEYE/Isar/RFA
 * careers-page fluff). Evidence from Exa people index + patents / conference papers.
 * Affinity tags only when education/org membership is explicit.
 */

import {
  reviewNetworkingPerson,
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
  return upsertNetworkingOrganization(raw).organization;
}

function seedPerson(raw) {
  return upsertNetworkingPerson({
    ...raw,
    relationship_stage: 'identified',
    review_status: 'review_ready',
  }).person;
}

// Archive prior low-value careers-page contacts (non-technical / not Indian path)
const REJECT_IDS = [
  'network-person-tapolina-jha-iceye',
  'network-person-oscar-gil-iceye',
  'network-person-rachel-finerman-iceye',
  'network-person-maria-terekhova-rocket-factory-augsburg',
  'network-person-aidan-isar-composites-isar-aerospace',
  'network-person-katherine-isar-valves-isar-aerospace',
  'network-person-larissa-isar-gnc-isar-aerospace',
  'network-person-ines-isar-software-isar-aerospace',
  'network-person-clara-isar-supply-chain-isar-aerospace',
  'network-person-vincenzo-messina-rocket-factory-augsburg',
];
const rejected = [];
for (const id of REJECT_IDS) {
  try {
    reviewNetworkingPerson(id, 'reject');
    rejected.push(id);
  } catch {
    // already rejected / not review_ready
  }
}

const exploration = seedOrg({
  name: 'The Exploration Company',
  aliases: ['Exploration Company', 'Nyx'],
  domain: 'exploration.space',
  website: 'https://www.exploration.space/',
  tier: 'A',
  strategy_status: 'active',
  locations: ['Gauting / Munich, Germany', 'France'],
  tags: ['newspace', 'germany', 'ex-isro-hires', 'europe-direct-hire'],
  feasibility_label: 'Strong signal — multiple Ex-ISRO / IIST engineers in technical roles in Germany',
  feasibility_notes: `Public profiles show Ex-ISRO AIT/RF/materials engineers on Nyx. See ${REPORT} addendum.`,
  source_refs: [
    source(
      'ex_isro_hiring_pattern',
      'Multiple public profiles: Ex-ISRO / IIST alumni in AIT, RF avionics, materials at The Exploration Company (Germany).',
      'https://linkedin.com/in/atin-aggarwal',
      'Atin Aggarwal — AIT MGSE Principal Engineer | Ex-ISRO',
      0.9,
      'profile_index',
    ),
  ],
});

const mynaric = seedOrg({
  name: 'Mynaric',
  aliases: ['Mynaric AG'],
  domain: 'mynaric.com',
  website: 'https://mynaric.com/',
  tier: 'A',
  strategy_status: 'active',
  locations: ['Munich, Germany', 'Jena, Germany'],
  tags: ['optical-comms', 'germany', 'radiation-assurance', 'europe-direct-hire'],
  feasibility_label: 'Strong for radiation/EEE PA talent — Indian PhD path into Germany',
  feasibility_notes: 'Optical laser terminals; PA/RHA roles hire internationally.',
});

const ariane = seedOrg({
  name: 'ArianeGroup',
  aliases: ['ArianeGroup GmbH', 'Airbus Safran Launchers'],
  domain: 'ariane.group',
  website: 'https://www.ariane.group/en/',
  tier: 'A',
  strategy_status: 'active',
  locations: ['Bremen, Germany', 'Les Mureaux, France', 'French Guiana'],
  tags: ['launchers', 'propulsion', 'germany', 'france', 'europe-direct-hire'],
  feasibility_label: 'Possible/Strong — Dynamics & Testing / propulsion hire international talent including India-educated',
});

const leonardo = seedOrg({
  name: 'Leonardo',
  aliases: ['Leonardo S.p.A.', 'Leonardo UK'],
  domain: 'leonardo.com',
  website: 'https://www.leonardo.com/',
  tier: 'B',
  strategy_status: 'active',
  locations: ['Italy', 'UK (Great Abington)', 'Germany'],
  tags: ['defence-space', 'uk', 'italy', 'europe-direct-hire'],
  feasibility_label: 'Possible — UK Skilled Worker / IT permits; defence clearance may limit some seats',
});

const ohb = seedOrg({
  name: 'OHB',
  aliases: ['OHB SE', 'OHB System AG'],
  domain: 'ohb.de',
  website: 'https://www.ohb.de/',
  tier: 'A',
  strategy_status: 'active',
  locations: ['Bremen, Germany', 'Oberpfaffenhofen, Germany'],
  tags: ['prime', 'germany', 'europe-direct-hire'],
  feasibility_label: 'Possible/Strong — Blue Card; Indians in software/systems roles publicly indexed',
});

const people = [
  {
    display_name: 'Atin Aggarwal',
    title: 'AIT MGSE Principal Engineer',
    current_organization: exploration.name,
    organization_id: exploration.id,
    personas: ['peer', 'hiring_manager'],
    linkedin_url: 'https://www.linkedin.com/in/atin-aggarwal',
    affinity_tags: [],
    notes: [
      'PRIORITY peer: Ex-ISRO VSSC Scientist/Engineer → Large Space Structures → The Exploration Company (Germany).',
      'IIST BTech Aerospace (India). Also TUM/NTU joint MSc — so NOT pure no-EU-study path, but closest Ex-ISRO AIT contact.',
      'Public patent inventor US11639052B2 (Rolls-Royce) with Atin AGGARWAL named.',
      'Ask about: how Ex-ISRO profiles clear German Blue Card / TEC hiring for AIT.',
    ].join(' '),
    channel_states: {
      linkedin: { state: 'available', profile_url: 'https://www.linkedin.com/in/atin-aggarwal', notes: 'Public profile indexed; do not auto-message.' },
    },
    source_refs: [
      source('title', 'AIT MGSE Principal Engineer at The Exploration Company', 'https://www.linkedin.com/in/atin-aggarwal', 'Atin Aggarwal profile', 0.95, 'profile_index'),
      source('india_education', 'BTech Aerospace Engineering, Indian Institute of Space Science and Technology (IIST)', 'https://www.linkedin.com/in/atin-aggarwal', 'IIST education', 0.95, 'profile_index'),
      source('india_employer', 'Scientist Engineer — Vikram Sarabhai Space Centre, ISRO (Thiruvananthapuram)', 'https://www.linkedin.com/in/atin-aggarwal', 'ISRO VSSC', 0.95, 'profile_index'),
      source('non_linkedin', 'Inventor AGGARWAL, ATIN on US11639052B2 Layer debonding (Rolls-Royce PLC)', 'https://patents.google.com/patent/US11639052B2/en', 'Google Patents US11639052B2', 0.98, 'patent'),
      source('path_note', 'Also holds TUM/NTU joint MSc — EU study present; still Ex-ISRO→EU industry peer', 'https://www.linkedin.com/in/atin-aggarwal', 'Education path', 0.9, 'profile_index'),
    ],
  },
  {
    display_name: 'Shrija Bhattacharyya',
    title: 'Avionics System Engineer - Radio Frequency',
    current_organization: exploration.name,
    organization_id: exploration.id,
    personas: ['peer'],
    linkedin_url: 'https://www.linkedin.com/in/shrijabhattacharyya95',
    affinity_tags: [],
    notes: [
      'Ex-SAC ISRO RF payload engineer → The Exploration Company (Nyx Earth RF).',
      'IIST BTech Avionics. Headline also lists TUM — so EU study likely present; still top RF peer.',
      'Ask about: SAC ISRO → Munich RF hire path and visa.',
    ].join(' '),
    channel_states: {
      linkedin: { state: 'available', profile_url: 'https://www.linkedin.com/in/shrijabhattacharyya95', notes: 'Avionics RF at TEC.' },
    },
    source_refs: [
      source('title', 'Avionics System Engineer - Radio Frequency at The Exploration Company', 'https://www.linkedin.com/in/shrijabhattacharyya95', 'Shrija Bhattacharyya profile', 0.95, 'profile_index'),
      source('india_employer', 'Space Applications Centre, ISRO — RF circuits & subsystems for Indian space program', 'https://www.linkedin.com/in/shrijabhattacharyya95', 'SAC ISRO', 0.95, 'profile_index'),
      source('india_education', 'BTech Avionics — IIST; headline also lists TUM', 'https://www.linkedin.com/in/shrijabhattacharyya95', 'IIST + TUM', 0.9, 'profile_index'),
    ],
  },
  {
    display_name: 'Neethu Nazar',
    title: 'Materials & Processes Engineer - Additive Manufacturing & Special Processes',
    current_organization: exploration.name,
    organization_id: exploration.id,
    personas: ['peer'],
    linkedin_url: 'https://www.linkedin.com/in/neethu-nazar',
    affinity_tags: [],
    notes: [
      'Ex-ISRO materials/AIT (LVM3, CE-20, HSP test vehicles) → Northwestern US MSc → The Exploration Company Germany.',
      'IIST Aerospace. No European degree — US study then EU work. Closest to user filter among TEC cohort.',
      'Ask about: ISRO→Europe hire without EU university.',
    ].join(' '),
    channel_states: {
      linkedin: { state: 'available', profile_url: 'https://www.linkedin.com/in/neethu-nazar', notes: 'Ex-ISRO AM/materials at TEC.' },
    },
    source_refs: [
      source('title', 'Materials & Processes Engineer - Additive Manufacturing @ The Exploration Company | Ex-ISRO', 'https://www.linkedin.com/in/neethu-nazar', 'Neethu Nazar profile', 0.95, 'profile_index'),
      source('india_employer', '3+ years ISRO scientist — cryogenic/semi-cryo/earth-storable engines & stages incl. LVM3, CE-20', 'https://www.linkedin.com/in/neethu-nazar', 'ISRO', 0.95, 'profile_index'),
      source('india_education', 'Aerospace Engineering — IIST; later Northwestern University MSc (USA), not Europe', 'https://www.linkedin.com/in/neethu-nazar', 'IIST + Northwestern path', 0.95, 'profile_index'),
    ],
  },
  {
    display_name: 'Anurag Gaggar',
    title: 'Senior Mechanical Engineer',
    current_organization: exploration.name,
    organization_id: exploration.id,
    personas: ['peer'],
    linkedin_url: 'https://www.linkedin.com/in/anuraggaggar',
    affinity_tags: ['umich'],
    notes: [
      'UMich MSc Aerospace (explicit) — affinity for Harsh. Also IIT Bombay Senior Research Fellow (AERB/Zircaloy).',
      'Path: Manchester BEng + UMich MSc + IITB research → Isar Aerospace structures → The Exploration Company.',
      'NOT no-EU-study (Manchester + Michigan), but Michigan peer in European NewSpace mechanical/launch structures.',
    ].join(' '),
    channel_states: {
      linkedin: { state: 'available', profile_url: 'https://www.linkedin.com/in/anuraggaggar', notes: 'Michigan alumni outreach angle.' },
    },
    source_refs: [
      source('title', 'Senior Mechanical Engineer at The Exploration Company; ex Structural Analysis Engineer Isar Aerospace', 'https://www.linkedin.com/in/anuraggaggar', 'Anurag Gaggar profile', 0.95, 'profile_index'),
      source('umich', 'Master of Science (MSc) Aerospace Engineering — University of Michigan Rackham', 'https://www.linkedin.com/in/anuraggaggar', 'UMich education', 0.98, 'profile_index'),
      source('india_org', 'Senior Research Fellow — Indian Institute of Technology Bombay (AERB-sponsored thermo-mechanical project)', 'https://www.linkedin.com/in/anuraggaggar', 'IIT Bombay', 0.95, 'profile_index'),
    ],
  },
  {
    display_name: 'Shrinivasrao Kulkarni',
    title: 'Senior Product Assurance Specialist (EEE / Radiation Hardness Assurance)',
    current_organization: mynaric.name,
    organization_id: mynaric.id,
    personas: ['peer'],
    linkedin_url: 'https://www.linkedin.com/in/shrinivasrao-kulkarni-b4039045',
    affinity_tags: [],
    notes: [
      'HIGHEST technical fit for Harsh radiation/detector path: EEE parts + Radiation Hardness Assurance at Mynaric (optical laser terminals, Germany).',
      'PhD physicist; India radiation experiments (IUAC New Delhi per research notes); international Germany/USA/India experience; ESA/NASA/ISRO programme exposure.',
      'Likely work-relocation into Germany PA/RHA — ask path explicitly.',
    ].join(' '),
    channel_states: {
      linkedin: { state: 'available', profile_url: 'https://www.linkedin.com/in/shrinivasrao-kulkarni-b4039045', notes: 'Radiation assurance peer.' },
    },
    source_refs: [
      source('title', 'EEE parts, Radiation Hardness Assurance, Cleanliness & Contamination at Mynaric', 'https://www.linkedin.com/in/shrinivasrao-kulkarni-b4039045', 'Shrinivasrao Kulkarni profile', 0.95, 'profile_index'),
      source('india_research', 'International experience Germany/USA/India; contributions to ESA, NASA, ISRO mission-related programmes; PhD radiation/space hardware background', 'https://www.linkedin.com/in/shrinivasrao-kulkarni-b4039045', 'Background summary', 0.9, 'profile_index'),
    ],
  },
  {
    display_name: 'Akshay Kulkarni',
    title: 'Development Engineer (Dynamics and Testing)',
    current_organization: ariane.name,
    organization_id: ariane.id,
    personas: ['peer'],
    linkedin_url: 'https://www.linkedin.com/in/akshaykulkarni1459',
    affinity_tags: [],
    notes: [
      'ArianeGroup GmbH Bremen — Dynamics & Testing. India: COEP BTech, BITS Pilani WILP MTech, IUCAA space-instrument mechanical design (3 years).',
      'THEN TU Delft MSc Aerospace — so EU study before full-time ArianeGroup. Still useful for Bremen launcher testing networking.',
      'Instrument/mechanical testing peer for Harsh plasma-instrumentation narrative.',
    ].join(' '),
    channel_states: {
      linkedin: { state: 'available', profile_url: 'https://www.linkedin.com/in/akshaykulkarni1459', notes: 'Dynamics & Testing Bremen.' },
    },
    source_refs: [
      source('title', 'Development Engineer — Dynamics and Testing, ArianeGroup GmbH Bremen', 'https://www.linkedin.com/in/akshaykulkarni1459', 'Akshay Kulkarni profile', 0.95, 'profile_index'),
      source('india_education', 'BTech Mechanical COEP; MTech Design Engineering BITS Pilani WILP; IUCAA space science instrument mechanical design', 'https://www.linkedin.com/in/akshaykulkarni1459', 'India education/work', 0.95, 'profile_index'),
      source('path_note', 'MSc Aerospace TU Delft 2020-2023 before ArianeGroup full-time — EU study path', 'https://www.linkedin.com/in/akshaykulkarni1459', 'Path honesty', 0.95, 'profile_index'),
    ],
  },
  {
    display_name: 'Anurag Niranjan',
    title: 'Failure Analysis Engineer',
    current_organization: leonardo.name,
    organization_id: leonardo.id,
    personas: ['peer'],
    linkedin_url: 'https://www.linkedin.com/in/anuragniranjan',
    affinity_tags: [],
    notes: [
      'Leonardo UK (Great Abington) Failure Analysis — IIT Bombay MTech Metallurgical Engineering & Materials Science (2013-2015) per deep-research + ResearchGate IITB affiliation.',
      'Treat as work-first into UK skilled route pending full CV confirmation.',
    ].join(' '),
    channel_states: {
      linkedin: { state: 'available', profile_url: 'https://www.linkedin.com/in/anuragniranjan', notes: 'Materials/failure analysis — secondary to Harsh primary instrumentation fit.' },
    },
    source_refs: [
      source('title', 'Failure Analysis Engineer — Leonardo UK', 'https://www.linkedin.com/in/anuragniranjan', 'Anurag Niranjan', 0.85, 'profile_index'),
      source('india_education', 'IIT Bombay affiliation (ResearchGate profile Anurag NIRANJAN | Indian Institute of Technology Bombay)', 'https://www.researchgate.net/profile/Anurag-Niranjan', 'ResearchGate IITB', 0.85, 'academic'),
    ],
  },
];

// Fix Shrija LinkedIn if we only have company URL — try common slug patterns via notes only
const seeded = people.map(seedPerson);
const sync = syncNetworkingToDashboard();

console.log(JSON.stringify({
  rejected_prior_fluff: rejected,
  orgs: [exploration.name, mynaric.name, ariane.name, leonardo.name, ohb.name],
  people: seeded.map(p => ({
    id: p.id,
    name: p.display_name,
    title: p.title,
    org: p.current_organization,
    affinity: p.affinity_tags,
    review: p.review_status,
  })),
  sync_ok: Boolean(sync),
}, null, 2));
