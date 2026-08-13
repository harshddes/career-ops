#!/usr/bin/env node

import {
  findNetworkingPerson,
  syncNetworkingToDashboard,
  upsertNetworkingOrganization,
  upsertNetworkingPerson,
} from '../lib/networking/store.mjs';
import {
  completeNetworkingResearch,
  markNetworkingResearchReviewReady,
  readNetworkingResearchQueue,
} from '../lib/networking/factory.mjs';

const CAPTURED_AT = new Date().toISOString();
const ORDER_ID = 'network-research-1784941628011-y0m36o';

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

function channelEmail(notes) {
  return {
    email: {
      state: 'available',
      profile_url: '',
      thread_url: '',
      last_touch_at: '',
      next_permitted_touch_at: '',
      unanswered_followups: 0,
      notes,
    },
  };
}

const spacexOrg = upsertNetworkingOrganization({
  name: 'SpaceX',
  aliases: ['Space Exploration Technologies', 'Space Exploration Technologies Corp', 'Starlink'],
  domain: 'spacex.com',
  website: 'https://www.spacex.com/',
  tier: 'A',
  strategy_status: 'active',
  locations: ['Hawthorne, CA', 'Redmond, WA', 'Austin, TX', 'Bastrop, TX', 'Bangalore, India'],
  tags: ['itar-restricted-us', 'radiation-effects', 'starlink-silicon', 'cyclotron-test-customer'],
  feasibility_label: 'US technical roles ITAR-blocked for most foreign nationals; international Starlink supply + EU chip partners are the realistic niches',
  feasibility_notes: [
    'Radiation Effects Engineer / Sr. Radiation Effects Engineer (Hawthorne, Redmond) post US-person ITAR requirements (citizen, green card, refugee, asylee, or export authorization).',
    'US Starlink silicon / custom semiconductor / ASIC roles and US custom-silicon supply roles also carry the same ITAR US-person clause.',
    'SpaceX does not operate a public in-house cyclotron; Crew Dragon electronics SEE testing was performed at Texas A&M Cyclotron Institute Radiation Effects Facility.',
    'Niche path 1 (radiation/detectors): network TAMU cyclotron radiation-effects staff who already interface with SpaceX test campaigns — academic facility, not SpaceX employment.',
    'Niche path 2 (chips without US ITAR job): STMicroelectronics co-designs Starlink chips in France/Italy fabs; approach ST RF/MCU org, not SpaceX Hawthorne silicon.',
    'Niche path 3 (SpaceX employment outside US): Bangalore Global Supply Manager (Starlink) on spacexglobal board did not show the ITAR US-person block in the public posting excerpt; still not a radiation/detector engineering seat.',
    'No public University of Michigan or VIT alumni affinity evidence found for SpaceX radiation/silicon staff without LinkedIn scraping — affinity tags left empty.',
  ].join(' '),
  organization_units: [
    {
      name: 'Radiation Effects',
      focus: 'SEE/TID testing and analysis for Dragon, Falcon, Starship, Starlink, HLS avionics',
      source_url: 'https://job-boards.greenhouse.io/spacex/jobs/8605049002',
    },
    {
      name: 'Starlink Silicon / Custom Semiconductor',
      focus: 'ASIC, RFIC, custom silicon, semiconductor capital equipment for Starlink',
      source_url: 'https://www.spacex.com/careers/jobs?programs=Starlink',
    },
    {
      name: 'Starlink International Supply Chain',
      focus: 'Bangalore and other international Starlink sourcing / supplier development',
      source_url: 'https://www.spacex.com/careers/jobs?locations=Bangalore,%20India',
    },
  ],
  source_refs: [
    source(
      'itar_radiation_effects',
      'ITAR: applicant must be US citizen/national, lawful permanent resident, refugee, asylee, or eligible for required authorizations.',
      'https://startup.jobs/radiation-effects-engineer-spacex-8410823',
      'Radiation Effects Engineer at SpaceX — ITAR requirements',
      0.98,
      'job_posting',
    ),
    source(
      'itar_custom_silicon_us',
      'Global Sourcing Manager, Custom Silicon and Semiconductor (Starlink) US posting includes the same ITAR US-person clause.',
      'http://job-boards.greenhouse.io/spacex/jobs/8545510002',
      'Global Sourcing Manager, Custom Silicon and Semiconductor (Starlink)',
      0.97,
      'job_posting',
    ),
    source(
      'cyclotron_path',
      'Nearly 100 Crew Dragon electronic components were tested at Texas A&M Cyclotron Institute Radiation Effects Facility over ~3 years.',
      'https://stories.tamu.edu/news/2020/08/04/texas-am-cyclotron-institute-provides-radiation-effects-testing-for-spacex-crew-dragon-capsule',
      'Texas A&M Stories — Cyclotron radiation testing for Crew Dragon',
      0.99,
    ),
    source(
      'chip_partner_eu',
      'Starlink products co-designed with ST engineers in France and Italy; fabs in France; packaging/test in Malaysia and Malta.',
      'https://newsroom.st.com/media-center/press-item.html/t4741.html',
      'STMicroelectronics and SpaceX decade-long Starlink partnership',
      0.98,
    ),
    source(
      'bangalore_role',
      'Global Supply Manager (Starlink), Bangalore, India — international Starlink supply chain seat on SpaceX_Global board.',
      'https://job-boards.greenhouse.io/spacexglobal/jobs/8568740002',
      'Global Supply Manager (Starlink) — Bangalore',
      0.9,
      'job_posting',
    ),
  ],
  notes: 'Prioritize TAMU cyclotron radiation-test path and STMicro EU Starlink silicon path over cold outreach to ITAR-blocked US SpaceX engineers.',
}).organization;

const tamuOrg = upsertNetworkingOrganization({
  name: 'Texas A&M Cyclotron Institute',
  aliases: ['TAMU Cyclotron Institute', 'Texas A&M Radiation Effects Facility'],
  domain: 'tamu.edu',
  website: 'https://cyclotron.tamu.edu/',
  tier: 'A',
  strategy_status: 'active',
  locations: ['College Station, TX'],
  tags: ['cyclotron', 'radiation-effects-testing', 'spacex-customer-facility', 'particle-detectors'],
  feasibility_label: 'Contactable academic radiation-test facility that has publicly supported SpaceX Crew Dragon SEE campaigns',
  feasibility_notes: 'Best near-term networking surface for radiation detection / cyclotron / particle-beam testing adjacent to SpaceX without applying into ITAR-restricted SpaceX Radiation Effects seats.',
  organization_units: [
    {
      name: 'Radiation Effects Facility',
      focus: 'Heavy-ion and proton SEE testing for aerospace electronics customers including SpaceX',
      source_url: 'https://cyclotron.tamu.edu/ref',
    },
  ],
  source_refs: [
    source(
      'facility',
      'Radiation Effects Facility provides heavy-ion and proton testing for ionizing radiation effects on electronics.',
      'https://cyclotron.tamu.edu/ref',
      'TAMU Radiation Effects Facility',
    ),
    source(
      'spacex_customer',
      'SpaceX used TAMU cyclotron SEE testing for Crew Dragon critical electronics including touchscreen avionics path.',
      'https://stories.tamu.edu/news/2020/08/04/texas-am-cyclotron-institute-provides-radiation-effects-testing-for-spacex-crew-dragon-capsule',
      'Texas A&M Stories — SpaceX Crew Dragon testing',
      0.99,
    ),
  ],
}).organization;

const stOrg = upsertNetworkingOrganization({
  name: 'STMicroelectronics',
  aliases: ['ST', 'ST Micro'],
  domain: 'st.com',
  website: 'https://www.st.com/',
  tier: 'A',
  strategy_status: 'active',
  locations: ['France', 'Italy', 'Malaysia', 'Malta'],
  tags: ['starlink-chip-partner', 'bicmos', 'non-itar-eu-path'],
  feasibility_label: 'EU Starlink chip co-design partner — strongest public non-ITAR technical adjacency to SpaceX silicon',
  feasibility_notes: 'Approach for RF/phased-array / BiCMOS / manufacturing learning paths tied to Starlink; not a SpaceX US export-controlled seat.',
  organization_units: [
    {
      name: 'Microcontrollers, Digital ICs and RF Products Group',
      focus: 'BiCMOS and RF products co-designed for Starlink antennas and satellites',
      source_url: 'https://newsroom.st.com/media-center/press-item.html/t4741.html',
    },
  ],
  source_refs: [
    source(
      'starlink_partnership',
      'Decade-long SpaceX/Starlink collaboration; co-design in France/Italy; PLP packaging ramp >5M chips/day cited.',
      'https://newsroom.st.com/media-center/press-item.html/t4741.html',
      'ST and SpaceX Starlink partnership press release',
      0.98,
    ),
  ],
}).organization;

const candidates = [
  {
    display_name: 'Henry L. Clark',
    title: 'Radiation Effects Facility Manager / Accelerator Physicist',
    current_organization_id: tamuOrg.id,
    current_organization: tamuOrg.name,
    organization_unit: 'Radiation Effects Facility',
    location: 'College Station, TX',
    personas: ['peer', 'hiring_manager'],
    fit_reasons: [
      'Publicly named facility supervisor for the cyclotron SEE line SpaceX used to qualify Crew Dragon electronics.',
      'Primary beam-time scheduling contact — highest-leverage radiation/detector networking node adjacent to SpaceX.',
      'Do not treat as a SpaceX referral broker; approach for technical learning on SEE test methods and facility access norms.',
    ],
    email: 'clark@comp.tamu.edu',
    channel_states: channelEmail('Published on official TAMU Radiation Effects Facility contact page'),
    source_refs: [
      source(
        'title',
        'Radiation Effects Facility Manager; main contact for beam time scheduling, billing, and general facility questions.',
        'https://cyclotron.tamu.edu/ref/contact.html',
        'TAMU Radiation Effects Facility — Contact',
        0.99,
      ),
      source(
        'email',
        'clark@comp.tamu.edu',
        'https://cyclotron.tamu.edu/ref/contact.html',
        'TAMU Radiation Effects Facility — Contact',
        0.99,
      ),
      source(
        'spacex_relationship',
        'Quoted on SpaceX using TAMU accelerators to recreate space radiation for Crew Dragon electronics testing.',
        'https://stories.tamu.edu/news/2020/08/04/texas-am-cyclotron-institute-provides-radiation-effects-testing-for-spacex-crew-dragon-capsule',
        'Texas A&M Stories — SpaceX Crew Dragon testing',
        0.98,
      ),
    ],
    notes: 'SpaceX order map node via published cyclotron customer relationship. ITAR does not apply to contacting this academic facility.',
  },
  {
    display_name: 'Sherry J. Yennello',
    title: 'Director, Cyclotron Institute; Regents Professor of Chemistry',
    current_organization_id: tamuOrg.id,
    current_organization: tamuOrg.name,
    organization_unit: 'Cyclotron Institute',
    location: 'College Station, TX',
    personas: ['hiring_manager', 'peer'],
    fit_reasons: [
      'Institute director publicly credited TAMU cyclotron role in SpaceX Crew Dragon radiation-effects success.',
      'Also leads nuclear science / silicon-detector array work (FAUST) — aligned with particle-detector research narrative.',
    ],
    source_refs: [
      source(
        'title',
        'Texas A&M Regents Professor of Chemistry and Cyclotron Institute Director.',
        'https://stories.tamu.edu/news/2020/08/04/texas-am-cyclotron-institute-provides-radiation-effects-testing-for-spacex-crew-dragon-capsule',
        'Texas A&M Stories — SpaceX Crew Dragon testing',
        0.97,
      ),
      source(
        'research_focus',
        'Yennello Group experiments use FAUST silicon detector arrays and related nuclear instrumentation at TAMU.',
        'https://cyclotron.tamu.edu/sjygroup/',
        'SJY Group — Cyclotron Institute',
        0.92,
      ),
    ],
    notes: 'Senior academic contact; prefer Clark for operational SEE/beam questions before escalating.',
  },
  {
    display_name: 'Bruce Hyman',
    title: 'Radiation Effects Facility Operator IV',
    current_organization_id: tamuOrg.id,
    current_organization: tamuOrg.name,
    organization_unit: 'Radiation Effects Facility',
    location: 'College Station, TX',
    personas: ['peer'],
    fit_reasons: [
      'Published facility operator for beamline hardware, equipment receiving/shipping, and website contact — practical peer for radiation-test logistics.',
    ],
    email: 'hyman@comp.tamu.edu',
    channel_states: channelEmail('Published on official TAMU Radiation Effects Facility contact page (also bhyman@tamu.edu on facility footer)'),
    source_refs: [
      source(
        'title',
        'Radiation Effects Facility Operator IV; main contact for beamline hardware, equipment receiving/shipping, general facility and website questions.',
        'https://cyclotron.tamu.edu/ref/contact.html',
        'TAMU Radiation Effects Facility — Contact',
        0.99,
      ),
      source(
        'email',
        'hyman@comp.tamu.edu',
        'https://cyclotron.tamu.edu/ref/contact.html',
        'TAMU Radiation Effects Facility — Contact',
        0.99,
      ),
    ],
  },
  {
    display_name: 'Michael Millhollon',
    title: 'Radiation Effects Administrative Coordinator II',
    current_organization_id: tamuOrg.id,
    current_organization: tamuOrg.name,
    organization_unit: 'Radiation Effects Facility',
    location: 'College Station, TX',
    personas: ['peer'],
    fit_reasons: [
      'Published coordinator for visitor lists, dosimetry, and safety onboarding for SEE campaigns — useful if pursuing facility visits or collaborative test runs.',
    ],
    email: 'michael.millhollon@tamu.edu',
    channel_states: channelEmail('Published on official TAMU Radiation Effects Facility contact page'),
    source_refs: [
      source(
        'title',
        'Radiation Effects Administrative Coordinator II; main contact for equipment shipping/receiving, general facility and safety related questions.',
        'https://cyclotron.tamu.edu/ref/contact.html',
        'TAMU Radiation Effects Facility — Contact',
        0.99,
      ),
      source(
        'email',
        'michael.millhollon@tamu.edu',
        'https://cyclotron.tamu.edu/ref/contact.html',
        'TAMU Radiation Effects Facility — Contact',
        0.99,
      ),
    ],
  },
  {
    display_name: 'Brian Roeder',
    title: 'Accelerator Physicist II',
    current_organization_id: tamuOrg.id,
    current_organization: tamuOrg.name,
    organization_unit: 'Cyclotron Institute',
    location: 'College Station, TX',
    personas: ['peer'],
    fit_reasons: [
      'Published accelerator physicist on the same cyclotron staff supporting radiation-effects beam delivery — peer technical path into particle-accelerator operations.',
    ],
    email: 'broeder@comp.tamu.edu',
    channel_states: channelEmail('Published on official TAMU Radiation Effects Facility contact page'),
    source_refs: [
      source(
        'title',
        'Accelerator Physicist II',
        'https://cyclotron.tamu.edu/ref/contact.html',
        'TAMU Radiation Effects Facility — Contact',
        0.98,
      ),
      source(
        'email',
        'broeder@comp.tamu.edu',
        'https://cyclotron.tamu.edu/ref/contact.html',
        'TAMU Radiation Effects Facility — Contact',
        0.98,
      ),
    ],
  },
  {
    display_name: 'Gabriel Tabacaru',
    title: 'Accelerator Physicist II',
    current_organization_id: tamuOrg.id,
    current_organization: tamuOrg.name,
    organization_unit: 'Cyclotron Institute',
    location: 'College Station, TX',
    personas: ['peer'],
    fit_reasons: [
      'Published accelerator physicist on TAMU cyclotron staff — peer path for beam physics adjacent to SpaceX radiation-test campaigns.',
    ],
    email: 'tabacaru@comp.tamu.edu',
    channel_states: channelEmail('Published on official TAMU Radiation Effects Facility contact page'),
    source_refs: [
      source(
        'title',
        'Accelerator Physicist II',
        'https://cyclotron.tamu.edu/ref/contact.html',
        'TAMU Radiation Effects Facility — Contact',
        0.98,
      ),
      source(
        'email',
        'tabacaru@comp.tamu.edu',
        'https://cyclotron.tamu.edu/ref/contact.html',
        'TAMU Radiation Effects Facility — Contact',
        0.98,
      ),
    ],
  },
  {
    display_name: 'Remi El-Ouazzane',
    title: 'President, Microcontrollers, Digital ICs and RF Products Group',
    current_organization_id: stOrg.id,
    current_organization: stOrg.name,
    organization_unit: 'Microcontrollers, Digital ICs and RF Products Group',
    location: 'Europe',
    personas: ['hiring_manager'],
    fit_reasons: [
      'Named ST executive quoted on Starlink chip co-design/manufacturing partnership with SpaceX — map node for EU non-ITAR silicon path.',
      'Too senior for cold peer ask; use as org map only, then find working-level ST RF/BiCMOS engineers via public ST channels.',
    ],
    source_refs: [
      source(
        'title',
        'President, Microcontrollers, Digital ICs and RF Products Group; Executive Committee member.',
        'https://www.st.com/content/st_com/en/about/who-we-are/management.html',
        'STMicroelectronics management — Remi El-Ouazzane',
        0.99,
      ),
      source(
        'starlink_quote',
        'Quoted on co-designing key chips and high-volume manufacturing for Starlink terminals and satellites.',
        'https://newsroom.st.com/media-center/press-item.html/t4741.html',
        'ST and SpaceX Starlink partnership press release',
        0.97,
      ),
    ],
    notes: 'Strategic org map for Starlink silicon outside US ITAR employment. Do not auto-contact.',
  },
  {
    display_name: 'John Federspiel',
    title: 'Sr. Director, Starlink Product Engineering',
    current_organization_id: spacexOrg.id,
    current_organization: spacexOrg.name,
    organization_unit: 'Starlink Product Engineering',
    location: 'Austin, TX',
    personas: ['hiring_manager'],
    fit_reasons: [
      'Publicly self-declared SpaceX Starlink Product Engineering director — US product/hardware leadership map node.',
      'Expect ITAR constraint on any US SpaceX engineering referral; treat as awareness contact only unless US-person status is resolved.',
    ],
    linkedin_url: 'https://www.linkedin.com/in/john-federspiel-8ab7371b',
    channel_states: {
      linkedin: {
        state: 'available',
        profile_url: 'https://www.linkedin.com/in/john-federspiel-8ab7371b',
        thread_url: '',
        last_touch_at: '',
        next_permitted_touch_at: '',
        unanswered_followups: 0,
        notes: 'Public LinkedIn profile URL only; no scraping performed',
      },
    },
    source_refs: [
      source(
        'title',
        'Sr. Director, Starlink Product Engineering at SpaceX (Austin, TX).',
        'https://www.linkedin.com/in/john-federspiel-8ab7371b',
        'John Federspiel — LinkedIn public profile',
        0.85,
        'public_profile',
      ),
    ],
    notes: 'Only named SpaceX employee with clear public title in this niche search without LinkedIn scraping automation. US ITAR still applies to engineering seats under this org.',
  },
];

const candidateIds = [];
for (const candidate of candidates) {
  const result = upsertNetworkingPerson({
    ...candidate,
    relationship_stage: 'researching',
    review_status: 'review_ready',
    affinity_tags: [],
  });
  candidateIds.push(result.person.id);
}

markNetworkingResearchReviewReady(ORDER_ID, candidateIds);
completeNetworkingResearch(ORDER_ID);
const dashboard = syncNetworkingToDashboard();
const queue = readNetworkingResearchQueue();
const order = queue.completed.find(item => item.id === ORDER_ID);

process.stdout.write(`${JSON.stringify({
  order_id: ORDER_ID,
  order_status: order?.status || null,
  spacex_org_id: spacexOrg.id,
  tamu_org_id: tamuOrg.id,
  st_org_id: stOrg.id,
  candidate_person_ids: candidateIds,
  people: candidateIds.map(id => {
    const person = findNetworkingPerson(id, dashboard);
    return {
      id: person?.id,
      name: person?.display_name,
      org: person?.current_organization,
      title: person?.title,
      email: person?.email || null,
      review_status: person?.review_status,
    };
  }),
  pending_count: queue.pending_count,
}, null, 2)}\n`);
