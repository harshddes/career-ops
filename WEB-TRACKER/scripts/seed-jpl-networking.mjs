#!/usr/bin/env node

import {
  findNetworkingPerson,
  readNetworking,
  syncNetworkingToDashboard,
  upsertNetworkingOrganization,
  upsertNetworkingPerson,
} from '../lib/networking/store.mjs';
import {
  completeNetworkingResearch,
  markNetworkingResearchInProgress,
  markNetworkingResearchReviewReady,
  queueNetworkingResearch,
  readNetworkingResearchQueue,
} from '../lib/networking/factory.mjs';

const CAPTURED_AT = '2026-07-23T11:34:00.000Z';
const ORGANIZATION_NAME = 'NASA Jet Propulsion Laboratory';

function source(field, observedValue, url, title, confidence = 0.98) {
  return {
    field,
    observed_value: observedValue,
    url,
    title,
    source_type: 'official',
    captured_at: CAPTURED_AT,
    confidence,
  };
}

const organizationUnits = [
  {
    name: 'Microdevices Laboratory — In-Situ Instruments / Mass Spectrometry',
    focus: 'Miniature mass spectrometers and sensors for planetary and human-spaceflight use',
    source_url: 'https://microdevices.jpl.nasa.gov/capabilities/in-situ-instruments-mass-spectrometry/',
  },
  {
    name: 'Europa Clipper — Plasma and Field Instrumentation',
    focus: 'PIMS plasma measurements, ECM calibration, and next-generation magnetometers',
    source_url: 'https://www.jpl.nasa.gov/site/research/cjcochra/',
  },
  {
    name: 'Microdevices Laboratory — Advanced Detectors',
    focus: 'Detector arrays, low-energy particle detectors, focal planes, and instruments',
    source_url: 'https://microdevices.jpl.nasa.gov/capabilities/advanced-detectors/detectors-and-instruments/',
  },
  {
    name: 'Advanced MicroSensors and Microsystems',
    focus: 'Advanced microsensors, microsystems, and instrument-enabling devices',
    source_url: 'https://www.jpl.nasa.gov/site/research/minar/',
  },
  {
    name: 'Europa Clipper — MASPEX',
    focus: 'Mass Spectrometer for Planetary Exploration investigation interface',
    source_url: 'https://science.jpl.nasa.gov/people/choukroun/',
  },
  {
    name: 'Instrument Systems Section',
    focus: 'Strategic instrument-systems organization',
    source_url: 'https://scienceandtechnology.jpl.nasa.gov/andrea-donnellan',
  },
  {
    name: 'Planetary Plasma Science',
    focus: 'Planetary plasma environments and measurement interpretation',
    source_url: 'https://science.jpl.nasa.gov/people/jasinski/',
  },
];

const candidates = [
  {
    display_name: 'Murray Darrach',
    title: 'Mass Spectrometry Team Lead',
    organization_unit: 'Microdevices Laboratory — In-Situ Instruments / Mass Spectrometry',
    personas: ['technical_lead', 'mass_spectrometry'],
    fit_reasons: [
      'Direct overlap with miniature mass spectrometers, ion optics, detector behavior, and planetary instrumentation.',
      'Relevant technical-learning path; do not begin with a referral request.',
    ],
    source_refs: [
      source(
        'title',
        'Leads JPL mass-spectrometry efforts and a team developing miniature sensors for planetary and human-spaceflight use.',
        'https://microdevices.jpl.nasa.gov/capabilities/in-situ-instruments-mass-spectrometry/',
        'JPL Microdevices Laboratory — In-Situ Instruments: Mass Spectrometry',
      ),
    ],
  },
  {
    display_name: 'Corey Cochrane',
    title: 'ECM Calibration Lead and PIMS Investigation Scientist',
    organization_unit: 'Europa Clipper — Plasma and Field Instrumentation',
    personas: ['instrument_scientist', 'plasma_instrumentation_peer'],
    fit_reasons: [
      'Direct overlap with plasma measurement, magnetic-field calibration, and next-generation magnetometers.',
      'Strong peer-level technical-learning path for calibration and instrument validation.',
    ],
    source_refs: [
      source(
        'title',
        'ECM calibration lead and PIMS investigation scientist working on magnetic-field/plasma measurement and next-generation magnetometers.',
        'https://www.jpl.nasa.gov/site/research/cjcochra/',
        'Official JPL profile — Corey Cochrane',
      ),
    ],
  },
  {
    display_name: 'Shouleh Nikzad',
    title: 'Advanced Detectors Researcher',
    organization_unit: 'Microdevices Laboratory — Advanced Detectors',
    personas: ['technical_lead', 'detector_scientist'],
    fit_reasons: [
      'Direct overlap with detector arrays, low-energy particle detectors, focal planes, and instrument development.',
      'High-value technical map node; approach for learning, not an immediate referral.',
    ],
    source_refs: [
      source(
        'technical_focus',
        'Advanced detector arrays, low-energy particle detectors, focal planes, and instruments.',
        'https://science.jpl.nasa.gov/people/shouleh-nikzad/',
        'Official JPL Science profile — Shouleh Nikzad',
      ),
    ],
  },
  {
    display_name: 'Mina Rais-Zadeh',
    title: 'Group Supervisor, Advanced MicroSensors and Microsystems',
    organization_unit: 'Advanced MicroSensors and Microsystems',
    personas: ['group_supervisor', 'hiring_manager', 'umich_affinity'],
    affinity_tags: ['University of Michigan'],
    fit_reasons: [
      'Direct microsensor and microsystems relevance to instrument-enabling hardware.',
      'Official profile documents prior University of Michigan faculty service, creating an explicit U-M affinity path.',
    ],
    source_refs: [
      source(
        'title',
        'Group supervisor for Advanced MicroSensors and Microsystems.',
        'https://www.jpl.nasa.gov/site/research/minar/',
        'Official JPL profile — Mina Rais-Zadeh',
      ),
      source(
        'affinity_tags',
        'Previously served on University of Michigan faculty.',
        'https://www.jpl.nasa.gov/site/research/minar/',
        'Official JPL profile — University of Michigan history',
      ),
    ],
  },
  {
    display_name: 'Mathieu Choukroun',
    title: 'MASPEX Investigation Scientist, Europa Clipper',
    organization_unit: 'Europa Clipper — MASPEX',
    personas: ['investigation_scientist', 'mass_spectrometry'],
    fit_reasons: [
      'Mission-interface path connecting planetary science requirements to a flight mass spectrometer.',
      'Relevant to Harsh’s mass-spectrometry and ion-optics transition without implying direct mission-role eligibility.',
    ],
    source_refs: [
      source(
        'title',
        'MASPEX investigation scientist for Europa Clipper.',
        'https://science.jpl.nasa.gov/people/choukroun/',
        'Official JPL Science profile — Mathieu Choukroun',
      ),
    ],
  },
  {
    display_name: 'Sidharth Misra',
    title: 'JPL Instrument and Calibration Researcher',
    organization_unit: 'Instrument Systems Section',
    personas: ['instrumentation_peer', 'umich_affinity'],
    affinity_tags: ['University of Michigan'],
    fit_reasons: [
      'Official JPL profile provides an instrument/calibration path and explicit University of Michigan history.',
      'Potential lower-pressure technical-learning connection.',
    ],
    source_refs: [
      source(
        'technical_and_affinity_path',
        'Public JPL instrument/calibration role and explicit University of Michigan history.',
        'https://www.jpl.nasa.gov/site/research/smisra/',
        'Official JPL profile — Sidharth Misra',
      ),
    ],
  },
  {
    display_name: 'Maryam Salim',
    title: 'JPL Instrument and Calibration Researcher',
    organization_unit: 'Instrument Systems Section',
    personas: ['instrumentation_peer', 'umich_affinity'],
    affinity_tags: ['University of Michigan'],
    fit_reasons: [
      'Official JPL profile provides an instrument/calibration path and explicit University of Michigan history.',
      'Potential peer path for instrument validation and calibration learning.',
    ],
    source_refs: [
      source(
        'technical_and_affinity_path',
        'Public JPL instrument/calibration role and explicit University of Michigan history.',
        'https://www.jpl.nasa.gov/site/research/msalim/',
        'Official JPL profile — Maryam Salim',
      ),
    ],
  },
  {
    display_name: 'Imran Mehdi',
    title: 'JPL Instrument Technology and Calibration Researcher',
    organization_unit: 'Instrument Systems Section',
    personas: ['technical_lead', 'instrumentation', 'umich_affinity'],
    affinity_tags: ['University of Michigan'],
    fit_reasons: [
      'Official JPL profile provides an instrument/calibration path and explicit University of Michigan history.',
      'Senior technical map node; not a first cold-referral request.',
    ],
    source_refs: [
      source(
        'technical_and_affinity_path',
        'Public JPL instrument/calibration role and explicit University of Michigan history.',
        'https://www.jpl.nasa.gov/site/research/imehdi/',
        'Official JPL profile — Imran Mehdi',
      ),
    ],
  },
  {
    display_name: 'Jamie Jasinski',
    title: 'Planetary Plasma Scientist',
    organization_unit: 'Planetary Plasma Science',
    personas: ['scientific_peer', 'planetary_plasma'],
    fit_reasons: [
      'Planetary-plasma peer path relevant to Harsh’s space-plasma measurement and interpretation background.',
      'Lower-pressure scientific-learning path rather than an immediate referral ask.',
    ],
    source_refs: [
      source(
        'technical_focus',
        'Planetary plasma science and mission research.',
        'https://science.jpl.nasa.gov/people/jasinski/',
        'Official JPL Science profile — Jamie Jasinski',
      ),
    ],
  },
  {
    display_name: 'Sophia Zomerdijk-Russell',
    title: 'Planetary Plasma Scientist',
    organization_unit: 'Planetary Plasma Science',
    personas: ['scientific_peer', 'planetary_plasma'],
    fit_reasons: [
      'Planetary-plasma peer path relevant to Harsh’s space-plasma measurement and interpretation background.',
      'Lower-pressure scientific-learning path rather than an immediate referral ask.',
    ],
    source_refs: [
      source(
        'technical_focus',
        'Planetary plasma science and mission research.',
        'https://www.jpl.nasa.gov/site/research/szomerdi/',
        'Official JPL profile — Sophia Zomerdijk-Russell',
      ),
    ],
  },
  {
    display_name: 'Andrea Donnellan',
    title: 'Manager, Instrument Systems Section',
    organization_unit: 'Instrument Systems Section',
    personas: ['section_manager', 'strategic_map_node'],
    fit_reasons: [
      'Maps the senior instrument-systems organization and its branches.',
      'Strategic organizational node only; not a first cold-referral request.',
    ],
    source_refs: [
      source(
        'title',
        'Manager of JPL’s Instrument Systems Section.',
        'https://scienceandtechnology.jpl.nasa.gov/andrea-donnellan',
        'Official JPL Science and Technology profile — Andrea Donnellan',
      ),
    ],
  },
];

const organizationResult = upsertNetworkingOrganization({
  name: ORGANIZATION_NAME,
  aliases: ['NASA JPL', 'JPL'],
  domain: 'jpl.nasa.gov',
  website: 'https://www.jpl.nasa.gov/',
  tier: 'priority',
  strategy_status: 'active',
  locations: ['Pasadena, California'],
  tags: ['space instrumentation', 'planetary science', 'mass spectrometry', 'plasma instrumentation'],
  organization_units: organizationUnits,
  feasibility_label: 'Role-dependent / foreign-national review required',
  feasibility_notes: 'Do not treat JPL as a blanket hard block. Foreign-national access is reviewed role by role; cleared, export-controlled, or otherwise restricted assignments may still be unavailable.',
  notes: 'Private networking map built from official JPL, NASA, and Caltech sources. No inferred emails or LinkedIn profiles.',
  source_refs: [
    source(
      'careers',
      'Official JPL careers entry point.',
      'https://www.jpl.nasa.gov/jobs',
      'JPL Careers',
    ),
    source(
      'foreign_national_feasibility',
      'India is absent from NASA’s March 18, 2026 Designated Countries List; all foreign-national access remains subject to review.',
      'https://www.nasa.gov/wp-content/uploads/2026/03/designated-country-list-3-18-2026.pdf?emrc=44fa68',
      'NASA Designated Countries List — March 18, 2026',
    ),
    source(
      'foreign_national_feasibility',
      'JPL International Scholar orientation covers F-1 and H-1B support among other statuses.',
      'https://international.caltech.edu/documents/22431/JPL_FN_Orientation.pdf',
      'Caltech/JPL International Scholar Orientation — October 2025',
    ),
  ],
});

const organization = organizationResult.organization;
const existingPeople = readNetworking().people;
const candidateIds = [];

for (const candidate of candidates) {
  const existing = existingPeople.find(person => (
    person.display_name.toLowerCase() === candidate.display_name.toLowerCase()
    && person.current_organization === ORGANIZATION_NAME
  ));
  const result = upsertNetworkingPerson({
    ...candidate,
    current_organization_id: organization.id,
    current_organization: organization.name,
    relationship_stage: existing?.relationship_stage || 'researching',
    review_status: existing?.review_status || 'review_ready',
    channel_states: existing?.channel_states || {},
    email: existing?.email || '',
    linkedin_url: existing?.linkedin_url || '',
  });
  candidateIds.push(result.person.id);
}

const queue = readNetworkingResearchQueue();
let order = [...queue.pending, ...queue.completed].find(item => (
  item.organization_id === organization.id
  || item.organization_name === ORGANIZATION_NAME
));

if (!order) {
  order = queueNetworkingResearch({
    organization_id: organization.id,
    organization_name: organization.name,
    personas: ['instrumentation_peer', 'technical_lead', 'hiring_manager', 'scientific_peer'],
    affinity_paths: ['University of Michigan'],
    source_preferences: ['official_company_pages', 'mission_pages', 'instrument_pages', 'official_profiles'],
    notes: 'NASA JPL official-source map requested by the Simplify Networking and JPL plan.',
  }).order;
  markNetworkingResearchInProgress(order.id);
  markNetworkingResearchReviewReady(order.id, candidateIds);
  completeNetworkingResearch(order.id);
}

const dashboard = syncNetworkingToDashboard();
const verifiedPeople = candidateIds
  .map(id => findNetworkingPerson(id, dashboard))
  .filter(Boolean);

process.stdout.write(`${JSON.stringify({
  organization_id: organization.id,
  people_seeded: verifiedPeople.length,
  review_ready: verifiedPeople.filter(person => person.review_status === 'review_ready').length,
  dashboard_people: dashboard.summary.people,
}, null, 2)}\n`);
