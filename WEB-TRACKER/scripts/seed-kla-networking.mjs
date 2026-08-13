#!/usr/bin/env node
/**
 * Seed KLA for Company Focus / Execute Mode:
 * - networking org (Ann Arbor hardware lane)
 * - ≤3 shortlisted Jobs to Consider (precision / electrical / technician)
 * - pin company focus + queue hub research (max 5 people, not per role)
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  pinCompanyFocus,
  syncCompanyFocusToDashboard,
} from '../lib/company-focus.mjs';
import {
  queueNetworkingResearch,
} from '../lib/networking/factory.mjs';
import {
  syncNetworkingToDashboard,
  upsertNetworkingOrganization,
} from '../lib/networking/store.mjs';
import {
  syncConsiderJobsToDashboard,
  upsertConsiderJob,
} from '../lib/jobs-to-consider-store.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS = join(HERE, '..', '..');
const CAPTURED_AT = new Date().toISOString();

const RESEARCH_BRIEF = [
  'Research focus: University of Michigan alumni and Ann Arbor KLA peers on precision mechanical / opto-mechanical / optical / instrumentation / process-control hardware teams.',
  'Also find Ann Arbor recruiters or talent partners who own hardware / mechanical / optical hiring.',
  'Exclude pure software, AI/ML, algorithm, and HPC software seats unless the person clearly owns hardware systems.',
  'Public sources only. Affinity tags require explicit public evidence. Max 5 candidates for the whole company (hub model — not 2–3 people per role).',
].join('\n');

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

const SHORTLIST = [
  {
    id: 'kla-sr-precision-machine-design-engineer-2638749',
    title: 'Senior Mechanical Design Engineer – Precision Systems',
    url: 'https://kla.wd1.myworkdayjobs.com/AnnArbor/job/Ann-Arbor-MI/Sr-Precision-Machine-Design-Engineer---Mechatronics-Systems_2638749-1',
    location: 'Ann Arbor, MI',
    notes: 'Lane match: precision mechanical / mechatronics for KLA tools. Primary shortlist for Execute Mode.',
    score: 4.2,
  },
  {
    id: 'kla-electrical-engineer-pcba-design-2638307',
    title: 'Electrical Engineer - PCBA Design',
    url: 'https://kla.wd1.myworkdayjobs.com/Search/job/Ann-Arbor-MI/Electrical-Engineer---PCBA-Design_2638307',
    location: 'Ann Arbor, MI',
    notes: 'Lane-adjacent hardware: PCBA design for instrumentation electronics. Secondary shortlist.',
    score: 3.6,
  },
  {
    id: 'kla-engineering-technician-2638373',
    title: 'Engineering Technician',
    url: 'https://kla.wd1.myworkdayjobs.com/Search/job/Ann-Arbor-MI/Engineering-Technician_2638373',
    location: 'Ann Arbor, MI',
    notes: 'Hands-on lab/build path. Tertiary shortlist only — verify seniority and scope before applying.',
    score: 3.2,
  },
];

const orgResult = upsertNetworkingOrganization({
  id: 'network-org-kla',
  name: 'KLA',
  aliases: ['KLA Corporation', 'KLA-Tencor', 'KLA Tencor', 'KLA-Tencor Corporation'],
  domain: 'kla.com',
  website: 'https://www.kla.com/',
  tier: 'A',
  strategy_status: 'active',
  locations: ['Ann Arbor, MI', 'Milpitas, CA', 'Hillsboro, OR', 'Phoenix, AZ'],
  tags: [
    'semiconductor',
    'process-control',
    'metrology',
    'inspection',
    'optical',
    'precision-mechanical',
    'ann-arbor',
  ],
  career_domains: ['sensors_mass_spec_vacuum', 'detectors'],
  opportunity_ids: SHORTLIST.map(job => job.id),
  feasibility_label: 'Ann Arbor hardware / precision / optical lane is the realistic focus; avoid spraying AI/HPC software postings',
  feasibility_notes: [
    'KLA Ann Arbor campus hosts 600+ engineers; Michigan talent pipeline is explicit.',
    'Execute Mode caps: ≤3 shortlisted roles and ≤5 hub contacts for the whole company.',
    'Do not network 2–3 people per requisition — company hub model only.',
    'Score each JD for OPT / export-control before applying; KLA historically files H-1B LCAs but posting text still wins.',
  ].join(' '),
  organization_units: [
    {
      name: 'Precision / Opto-Mechanical Systems (Ann Arbor)',
      focus: 'Precision mechanical design, mechatronics, opto-mechanical subsystems for next-gen process control tools',
      source_url: 'https://www.kla.com/michigan',
    },
    {
      name: 'Central Engineering / Optics modules',
      focus: 'Core optics and opto-mechanical modules shared across divisions',
      source_url: 'https://www.kla.com/michigan',
    },
  ],
  source_refs: [
    source(
      'ann_arbor_campus',
      'KLA Ann Arbor campus: 600+ engineers, physicists, data scientists; continuing to grow.',
      'https://www.kla.com/michigan',
      'KLA Ann Arbor careers',
      0.98,
    ),
    source(
      'precision_role',
      'Senior Mechanical Design Engineer – Precision Systems posted in Ann Arbor.',
      SHORTLIST[0].url,
      SHORTLIST[0].title,
      0.97,
      'job_posting',
    ),
  ],
});

const organization = orgResult.organization;
const shortlistedIds = [];

for (const role of SHORTLIST) {
  const store = upsertConsiderJob({
    id: role.id,
    company: 'KLA',
    title: role.title,
    url: role.url,
    location: role.location,
    country: 'US',
    source: 'kla-workday',
    status: 'considering',
    score: role.score,
    score_band: role.score >= 4 ? 'strong' : 'possible',
    recommendation: role.score >= 4 ? 'apply' : 'consider',
    fit_summary: role.notes,
    notes: role.notes,
    networking_org_id: organization.id,
    career_domains: ['sensors_mass_spec_vacuum', 'detectors'],
  });
  const job = store.jobs.find(item => item.id === role.id);
  if (job) shortlistedIds.push(job.id);
}

const focus = pinCompanyFocus({
  organization_id: organization.id,
  organization_name: organization.name,
  location_bias: 'Ann Arbor, MI',
  role_lane: 'ann-arbor-hardware-instrumentation',
  shortlisted_job_ids: shortlistedIds.slice(0, 3),
  contact_budget: 5,
  role_cap: 3,
  daily_outreach_cap: 1,
});

const research = queueNetworkingResearch({
  organization_id: organization.id,
  organization_name: organization.name,
  opportunity_ids: shortlistedIds,
  personas: ['peer', 'hiring_manager', 'recruiter'],
  affinity_paths: ['umich'],
  locations: ['Ann Arbor, MI'],
  exclusions: ['pure software', 'AI/ML algorithm-only', 'HPC software-only'],
  notes: RESEARCH_BRIEF,
});

syncNetworkingToDashboard();
syncConsiderJobsToDashboard();
syncCompanyFocusToDashboard();

const outDir = join(CAREER_OPS, 'output', 'kla');
mkdirSync(outDir, { recursive: true });
const enrichmentSeed = join(outDir, 'kla-role-shortlist.csv');
const csvHeader = 'job_id,company,title,url,location,lane_notes';
const csvRows = SHORTLIST.map(role => (
  [
    role.id,
    'KLA',
    `"${role.title.replace(/"/g, '""')}"`,
    role.url,
    `"${role.location}"`,
    `"${role.notes.replace(/"/g, '""')}"`,
  ].join(',')
));
writeFileSync(enrichmentSeed, `${csvHeader}\n${csvRows.join('\n')}\n`, 'utf-8');

console.log(JSON.stringify({
  organization_id: organization.id,
  shortlisted_job_ids: shortlistedIds,
  focus_playbook_step: focus.playbook_step,
  focus_next_action: focus.next_action?.type,
  research_order_id: research.order?.id,
  research_duplicate: Boolean(research.duplicate),
  enrichment_csv: 'output/kla/kla-role-shortlist.csv',
  trigger_phrase: 'Find new networking contacts',
}, null, 2));
