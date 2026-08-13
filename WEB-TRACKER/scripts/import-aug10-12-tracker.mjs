#!/usr/bin/env node
/**
 * Import Harsh's Aug 10–12 2026 Job & PhD Tracker into dashboard stores.
 * Match existing cards; do not mark unverified Handshake/GE items as Applied.
 */
import { createTrackerRow, updateTrackerMetadata, updateTrackerRow } from '../../update-tracker-row.mjs';
import { run as syncApplications } from '../adapters/applications-adapter.mjs';
import { appendActivityEvent } from '../lib/activity-log.mjs';
import { logResearchStatusEvent } from '../lib/dashboard-activity.mjs';
import {
  findConsiderJob,
  patchConsiderJob,
  syncConsiderJobsToDashboard,
  upsertConsiderJob,
} from '../lib/jobs-to-consider-store.mjs';
import {
  appendNetworkingInteraction,
  syncNetworkingToDashboard,
  upsertNetworkingOrganization,
  upsertNetworkingPerson,
  upsertNetworkingTask,
} from '../lib/networking/store.mjs';
import {
  patchResearchProspect,
  syncResearchProspectsToDashboard,
  upsertResearchProspect,
} from '../lib/research-prospect-store.mjs';
import {
  patchUmichOpportunity,
  syncUmichOpportunitiesToDashboard,
} from '../lib/umich-careers/opportunity-store.mjs';

const GMAIL = (id) => `https://mail.google.com/mail/#all/${id}`;
const iso = (stamp) => new Date(stamp).toISOString();

function activity({ local_date, occurred_at, domain, action, subject_id, subject_label, company, title, status, source, notes, metadata = {} }) {
  return appendActivityEvent({
    local_date,
    occurred_at: iso(occurred_at),
    timezone: 'America/New_York',
    domain,
    action,
    subject_id,
    subject_label,
    company,
    title,
    status,
    source,
    notes,
    metadata,
  });
}

function applyJob({
  company,
  title,
  url = '',
  location = '',
  source = 'manual_research',
  date,
  occurred_at,
  notes,
  track_kind = 'job',
  extra = {},
}) {
  const store = upsertConsiderJob({
    company,
    title,
    url,
    location,
    source,
    notes,
    ...extra,
  });
  const job = findConsiderJob({ company, title, url }, store) || store.jobs[0];
  const tracker = createTrackerRow({
    entry: {
      date,
      company,
      role: title,
      score: 'N/A',
      status: 'Applied',
      pdf: false,
      notes,
    },
    metadata: {
      posting_url: url,
      submitted_date: date,
      way_to_apply: extra.way_to_apply || '',
      track_kind,
    },
  });
  const patched = patchConsiderJob(job.id, {
    status: 'applied',
    applied: true,
    application_num: tracker.num,
    applied_at: iso(occurred_at),
    notes,
  });
  activity({
    local_date: date,
    occurred_at,
    domain: 'jobs',
    action: 'job_applied',
    subject_id: patched.job.id,
    subject_label: `${company} - ${title}`,
    company,
    title,
    status: 'applied',
    source: 'Jobs To Consider',
    notes,
    metadata: { application_num: tracker.num, url, applied_at: iso(occurred_at) },
  });
  return { job: patched.job, tracker };
}

function considerJob(raw) {
  const store = upsertConsiderJob(raw);
  const job = findConsiderJob({ company: raw.company, title: raw.title, url: raw.url }, store);
  patchConsiderJob(job.id, {
    status: 'to_consider',
    applied: false,
    notes: raw.notes,
  });
  return findConsiderJob(job.id);
}

function patchProspect(id, source, updates, event) {
  const { prospect } = patchResearchProspect(id, updates, { source });
  if (event) {
    activity({
      local_date: event.local_date,
      occurred_at: event.occurred_at,
      domain: source === 'umich' ? 'umich_research' : 'phd_options',
      action: `research_status_${prospect.status}`,
      subject_id: prospect.id,
      subject_label: prospect.name,
      company: prospect.institution || source,
      title: prospect.title || prospect.lab || prospect.department,
      status: prospect.status,
      source,
      notes: prospect.notes,
      metadata: {
        email: prospect.contact_email || '',
        last_contacted: prospect.last_contacted || '',
        last_followed_up: prospect.last_followed_up || '',
        follow_up_date: prospect.follow_up_date || '',
      },
    });
  } else {
    logResearchStatusEvent(prospect, source);
  }
  return prospect;
}

function upsertProspect(raw, source, event) {
  upsertResearchProspect({ ...raw, source }, { source });
  return patchProspect(raw.id, source, {
    status: raw.status,
    last_contacted: raw.last_contacted || '',
    last_followed_up: raw.last_followed_up || '',
    follow_up_date: raw.follow_up_date || '',
    notes: raw.notes,
    gmail_thread_url: raw.gmail_thread_url || '',
    outreach: raw.outreach,
    application_url: raw.application_url || '',
  }, event);
}

function org(name, extra = {}) {
  return upsertNetworkingOrganization({ name, ...extra }).organization;
}

function person(raw) {
  return upsertNetworkingPerson({
    review_status: 'approved',
    ...raw,
  }).person;
}

function touch({ person_id, organization_id, date, occurred_at, direction, type = 'email', subject, summary, gmail_thread_url }) {
  const result = appendNetworkingInteraction({
    person_id,
    organization_id,
    type,
    direction,
    channel: 'gmail',
    occurred_at: iso(occurred_at),
    subject,
    summary,
    gmail_thread_url,
    source: 'aug10-12-tracker',
  });
  activity({
    local_date: date,
    occurred_at,
    domain: 'networking',
    action: `networking_${direction === 'inbound' ? 'reply' : type === 'follow_up' ? 'follow_up' : 'contacted'}`,
    subject_id: person_id,
    subject_label: result.person.display_name,
    company: result.person.current_organization,
    title: result.person.title,
    status: result.person.relationship_stage,
    source: 'Networking Command Center',
    notes: summary,
    metadata: {
      person_id,
      organization_id: organization_id || '',
      channel: 'gmail',
      occurred_at: iso(occurred_at),
    },
  });
  return result.person;
}

function nextTask({ person_id, organization_id, subject, notes, due_at, state = 'waiting', waiting_until = '' }) {
  return upsertNetworkingTask({
    person_id,
    organization_id,
    action_type: 'follow_up',
    subject,
    state,
    due_at,
    waiting_until,
    notes,
  }).task;
}

const summary = {
  applications: [],
  jobs_consider: [],
  research: [],
  networking: [],
};

// ---------------------------------------------------------------------------
// 1. Confirmed applications + status changes
// ---------------------------------------------------------------------------
const cnrs = applyJob({
  company: 'CNRS / LATMOS',
  title: 'CDD Doctorant (H/F) en conception lidar vent pour le spatial / MADWIL',
  url: 'https://emploi.cnrs.fr/Offres/Doctorant/UMR8190-FRAMON-012/Default.aspx?lang=EN',
  location: 'France',
  source: 'cnrs-emploi',
  date: '2026-08-12',
  occurred_at: '2026-08-12T16:30:00-04:00',
  notes: 'Confirmed applied 2026-08-12. Explicit CNRS application receipt; under review. Ref UMR8190-FRAMON-012. Start listed as Oct 1, 2026. Gmail: ' + GMAIL('19ff7f72f8255b65'),
  track_kind: 'phd',
});
summary.applications.push(`#${cnrs.tracker.num} CNRS/LATMOS MADWIL PhD Applied`);

const kla = applyJob({
  company: 'KLA',
  title: 'Opto-Mechanical Design Engineer',
  url: 'https://kla.wd1.myworkdayjobs.com/Search/job/Ann-Arbor-MI/Opto-Mechanical-Design-Engineer_2533228',
  location: 'Ann Arbor, MI',
  source: 'kla-workday',
  date: '2026-08-11',
  occurred_at: '2026-08-11T14:20:00-04:00',
  notes: 'Confirmed applied 2026-08-11. Req 2533228. Application received; resumes under review; interviews expected. Mitchell Faust replied to networking outreach. Gmail: ' + GMAIL('19ff349855fc9d10'),
  extra: { networking_org_id: 'network-org-kla' },
});
summary.applications.push(`#${kla.tracker.num} KLA Opto-Mechanical Applied`);

const uw = applyJob({
  company: 'University of Wisconsin–Madison',
  title: 'Instrumentation Engineer/Mechanical Engineer',
  url: 'https://jobs.wisc.edu/jobs/jr10013359',
  location: 'Madison, WI',
  source: 'uw-madison',
  date: '2026-08-11',
  occurred_at: '2026-08-11T13:40:00-04:00',
  notes: 'Confirmed applied 2026-08-11. JR10013359. Application received; review after close date. Later generic “complete your application” reminders may be a separate started application — see Needs Verification. Gmail: ' + GMAIL('19ff2ecd0ebbe457'),
});
summary.applications.push(`#${uw.tracker.num} UW–Madison Instrumentation Applied`);

const thermal = applyJob({
  company: 'ThermalTech Engineering',
  title: 'Handshake application (exact title TBD)',
  location: 'United States',
  source: 'handshake',
  date: '2026-08-11',
  occurred_at: '2026-08-11T13:50:00-04:00',
  notes: 'Confirmed applied via Handshake 2026-08-11. Confirmation does not expose exact posting title — open Handshake “View application” to capture it. Gmail: ' + GMAIL('19ff2f24b3e8bace'),
});
summary.applications.push(`#${thermal.tracker.num} ThermalTech Applied (title TBD)`);

const temple = applyJob({
  company: 'Temple Allen Industries',
  title: 'Entry Level Machine Learning Engineer',
  location: 'United States',
  source: 'handshake',
  date: '2026-08-11',
  occurred_at: '2026-08-11T11:10:00-04:00',
  notes: 'Confirmed applied via Handshake 2026-08-11. Title mapped from Handshake job/event evidence. Gmail: ' + GMAIL('19ff189d94670a41'),
});
summary.applications.push(`#${temple.tracker.num} Temple Allen Applied`);

const arculus = applyJob({
  company: 'Arculus Solutions, Inc.',
  title: 'Mechatronics Engineer',
  location: 'United States',
  source: 'handshake',
  date: '2026-08-11',
  occurred_at: '2026-08-11T11:08:00-04:00',
  notes: 'Confirmed applied via Handshake 2026-08-11. Title mapped from same-day Handshake evidence. Gmail: ' + GMAIL('19ff189b6e0ac29a'),
});
summary.applications.push(`#${arculus.tracker.num} Arculus Applied`);

const indepth = applyJob({
  company: 'InDepth Engineering Solutions, LLC',
  title: 'Air Intake Systems Engineer',
  location: 'United States',
  source: 'handshake',
  date: '2026-08-11',
  occurred_at: '2026-08-11T11:06:00-04:00',
  notes: 'Confirmed applied via Handshake 2026-08-11. Title mapped from same-day Handshake evidence. Gmail: ' + GMAIL('19ff1898c8d3d28d'),
});
summary.applications.push(`#${indepth.tracker.num} InDepth Applied`);

const asmNotes = 'Applied 2026-07-28 via ASM careers / Greenhouse (gh_jid=4931155101). Rejected Aug 10, 2026. Status changed in the Aug 10–12 window. Gmail: ' + GMAIL('19fea28d7574c963');
updateTrackerRow({
  num: 82,
  updates: {
    status: 'Rejected',
    notes: asmNotes,
  },
});
patchConsiderJob('asm-engineer-field-process-hillsboro', {
  status: 'closed',
  applied: true,
  notes: asmNotes,
});
activity({
  local_date: '2026-08-10',
  occurred_at: '2026-08-10T12:00:00-04:00',
  domain: 'jobs',
  action: 'job_status_updated',
  subject_id: 'asm-engineer-field-process-hillsboro',
  subject_label: 'ASM - Engineer, Field Process (Hillsboro, OR)',
  company: 'ASM',
  title: 'Engineer, Field Process (Hillsboro, OR)',
  status: 'Rejected',
  source: 'Applications',
  notes: asmNotes,
  metadata: { application_num: 82, url: 'https://www.asm.com/open-vacancies/engineer-field-process-hillsboro-or-4931155101?gh_jid=4931155101' },
});
summary.applications.push('#82 ASM Field Process → Rejected');

const nqvlNotes = 'Applied from U-M Careers tracker (job 280189). Interview completed Aug 7 with Amy Brooks (Optics & Photonics / CUOS). Aug 11–12 follow-up: decision expected in the next 2–3 weeks. Harsh replied again Aug 12. Gmail: ' + GMAIL('19ff18b7d0b1f1dc');
updateTrackerRow({
  num: 69,
  updates: {
    status: 'Interview',
    notes: nqvlNotes,
  },
});
updateTrackerMetadata({
  num: 69,
  updates: {
    contact: 'Amy Brooks',
    response: 'Decision expected in next 2–3 weeks (email Aug 11–12).',
    followup_date: '2026-08-11',
    posting_url: 'https://careers.umich.edu/job_detail/280189/nqvl-project-manager',
  },
});
patchUmichOpportunity('umich-careers-280189', {
  applied: true,
  application_num: 69,
});
activity({
  local_date: '2026-08-11',
  occurred_at: '2026-08-11T16:20:00-04:00',
  domain: 'jobs',
  action: 'application_status_updated',
  subject_id: '69',
  subject_label: 'University of Michigan - NQVL Project Manager',
  company: 'University of Michigan',
  title: 'NQVL Project Manager',
  status: 'Interview',
  source: 'Applications',
  notes: nqvlNotes,
  metadata: { posting_url: 'https://careers.umich.edu/job_detail/280189/nqvl-project-manager' },
});
summary.applications.push('#69 U-M NQVL → Interview');

// ---------------------------------------------------------------------------
// 2. Needs verification / not confirmed applied  → Jobs to Consider
// ---------------------------------------------------------------------------
const iist = considerJob({
  company: 'IIST',
  title: 'Project Associate-I',
  source: 'iist-project-recruitment',
  location: 'India',
  notes: 'NOT confirmed submitted. 2026-08-10 registration/application credentials issued; email does not prove final submission. Verify portal status. Gmail: ' + GMAIL('19fedc2a7e57117b'),
});
summary.jobs_consider.push(`${iist.id} IIST Project Associate-I (unverified submit)`);

for (const row of [
  {
    title: 'Mechanical Engineer — Full Time Entry Level',
    gmail: '19ff33862f769ba5',
  },
  {
    title: 'Process Integration Engineer',
    gmail: '19ff338588024a7f',
  },
  {
    title: 'Triage Engineer (Entry-Level Propulsion Diagnostics Engineer)',
    gmail: '19ff33864c60feee',
  },
]) {
  const job = considerJob({
    company: 'Unknown (Handshake)',
    title: row.title,
    source: 'handshake',
    location: 'United States',
    notes: `Needs verification. Handshake calendar-sync event titled “Application for …” on 2026-08-11. No employer or application receipt found. Confirm employer + whether submission completed. Gmail: ${GMAIL(row.gmail)}`,
  });
  summary.jobs_consider.push(`${job.id} Handshake unverified`);
}

for (const row of [
  { title: 'Component & Development Test Engineer', req: 'R5047028' },
  { title: 'Fluid Systems Engineer – Aeroderivative', req: 'R5049438' },
  { title: 'Mechanical Engineer', req: 'R5049035' },
  { title: 'Advanced Manufacturing & Technology Engineer', req: 'R5048460' },
]) {
  const job = considerJob({
    company: 'GE Vernova',
    title: `${row.title} — ${row.req}`,
    url: `https://careers.gevernova.com/global/en/job/${row.req}`,
    source: 'ge-vernova',
    location: 'United States',
    notes: `Needs verification. Role sent to Kishan Srinivasan on 2026-08-11 for referral/help. No formal application confirmation found. Confirm whether it was actually submitted. Gmail: ${GMAIL('19ff3230365e6e6d')}`,
  });
  summary.jobs_consider.push(`${job.id} GE Vernova ${row.req} (referral, not confirmed)`);
}

const uwReminder = considerJob({
  company: 'University of Wisconsin–Madison',
  title: 'Possible second incomplete application (reminder emails)',
  source: 'uw-madison',
  location: 'Madison, WI',
  notes: 'Needs verification. Two “Don’t forget to complete your application” reminders on 2026-08-12 after the confirmed Instrumentation Engineer application (JR10013359). Could be a separate started application or a generic reminder. Check UW candidate portal. Gmail: ' + GMAIL('19ff8157e6dec6b4'),
});
summary.jobs_consider.push(`${uwReminder.id} UW reminder / possible 2nd app`);

// ---------------------------------------------------------------------------
// 3. Advertised PhD / considering routes → Jobs to Consider
// ---------------------------------------------------------------------------
const marschallJob = considerJob({
  company: 'University of Bern',
  title: 'PhD Position in Planetary Science — Prof. Marschall',
  url: 'https://jobs.unibe.ch/job-vacancies/phd-position-in-planetary-science/bc4620c4-24dc-44d9-a22d-91f182cbf79f',
  location: 'Bern, Switzerland',
  source: 'unibe-jobs',
  notes: 'Considering — current posting recommended by Martin Rubin on 2026-08-12 after Bern mass-spec funding discussion. Read posting and decide/apply quickly if fit.',
});
summary.jobs_consider.push(`${marschallJob.id} Bern Marschall PhD`);

for (const row of [
  {
    idHint: 'ads-2-13',
    company: 'University of Canterbury + Dawn Aerospace',
    title: 'ADS 2.13 — Microgravity thermofluids analysis and propellant management',
    notes: 'Considering — high priority. Ranked #1 in ADS shortlist (2026-08-12 chat). Verify advisor/funding/eligibility and apply if satisfied.',
  },
  {
    company: 'ADS / Auckland-linked project',
    title: 'ADS 2.11 — MANTA: Transforming Deorbit Sails into Space Debris Sensors',
    notes: 'Considering — high priority. Ranked #2 in ADS shortlist (2026-08-12 chat). Verify exact university/lab/advisor before applying.',
  },
  {
    company: 'ADS',
    title: 'ADS 2.20 — REEF: Rotating Experimental Environment Facility',
    notes: 'Considering — investigate. Shortlisted below top ADS priorities (2026-08-12 chat). Investigate advisor/facility/funding before applying.',
  },
  {
    company: 'ADS',
    title: 'ADS 2.18 — Phase-Contrast Optical Metrology for ultra-smooth space/defence optics',
    notes: 'Considering — stretch. Interesting optics stretch; lower fit than top ADS choices (2026-08-12 chat). Investigate before committing application time.',
  },
]) {
  const job = considerJob({
    company: row.company,
    title: row.title,
    source: 'ads-phd-shortlist',
    location: 'New Zealand',
    notes: row.notes,
  });
  summary.jobs_consider.push(`${job.id} ADS considering`);
}

const exodocs = considerJob({
  company: 'TUM / CLUPI',
  title: 'EXODOCS DC1 — CLUPI scientific-return optimization',
  source: 'exodocs',
  location: 'Germany',
  notes: 'Considering — formal deadline had already passed when contacted 2026-08-11. Asked D. Koschny whether recruitment is complete or related routes exist. Await reply. Gmail: ' + GMAIL('19fef796d49b9993'),
});
summary.jobs_consider.push(`${exodocs.id} EXODOCS DC1`);

const spacexClupi = considerJob({
  company: 'SPACE-X / CLUPI',
  title: 'CLUPI / EXODOCS doctoral project at SPACE-X',
  source: 'exodocs',
  location: 'Switzerland',
  notes: 'Considering — recruitment uncertain. Asked Jean-Luc Josset on 2026-08-11 whether SPACE-X doctoral recruitment remains possible. Await reply. Gmail: ' + GMAIL('19fef796cc642e3f'),
});
summary.jobs_consider.push(`${spacexClupi.id} SPACE-X CLUPI doctoral`);

// ---------------------------------------------------------------------------
// 4. Research / PhD Options — existing professor + UMich + private-co cards
// ---------------------------------------------------------------------------
patchProspect('professor-list-martin-rubin-university-of-bern', 'professor-list', {
  status: 'responded_positive',
  last_contacted: '2026-03-25',
  last_followed_up: '2026-08-10',
  follow_up_date: '',
  gmail_thread_url: GMAIL('19fea4ca782d29ac'),
  notes: 'Aug 10–12 follow-up on prospective PhD funding: no funding now; possibly next cycle starting Apr 2027. On Aug 12 he suggested Prof. Marschall’s planetary-science PhD posting. Next: review Marschall posting; keep Bern route warm. Prior: said background was suitable, no PhD funding, offered to circulate internally.',
  outreach: { stage: 'your_move', notes: 'Review Marschall posting; keep Rubin/Bern warm.' },
}, { local_date: '2026-08-12', occurred_at: '2026-08-12T10:00:00-04:00' });
summary.research.push('Martin Rubin → responded_positive (Marschall lead)');

patchProspect('professor-list-andr-galli-university-of-bern', 'professor-list', {
  status: 'followed_up',
  last_contacted: '2026-03-19',
  last_followed_up: '2026-08-12',
  follow_up_date: '',
  gmail_thread_url: GMAIL('19ff4abaf0f64fbb'),
  notes: 'Aug 12 reconnection: asked for advice / Zoom. No new reply found yet. Previously called the fit very promising, met by Zoom; blocked by group transition and 2027 employment limit. Keep Bern mass-spec network warm.',
  outreach: { stage: 'their_move', notes: 'Await Galli reply; keep Bern network warm.' },
}, { local_date: '2026-08-12', occurred_at: '2026-08-12T11:20:00-04:00' });
summary.research.push('André Galli → followed_up Aug 12');

patchProspect('professor-list-lead-001', 'professor-list', {
  status: 'contacted',
  last_contacted: '2026-08-10',
  last_followed_up: '',
  follow_up_date: '2026-08-17',
  gmail_thread_url: GMAIL('19fea4ca6b5512b8'),
  notes: 'Aug 10 funded-PhD inquiry (space plasma physics / Plasma Observatory). No reply found yet. Wait / follow up later.',
  outreach: { stage: 'their_move', notes: 'Await Retinò reply.' },
}, { local_date: '2026-08-10', occurred_at: '2026-08-10T18:10:00-04:00' });
summary.research.push('Alessandro Retinò → contacted Aug 10');

patchProspect('professor-list-lead-008', 'professor-list', {
  status: 'contacted',
  last_contacted: '2026-08-11',
  follow_up_date: '2026-08-18',
  gmail_thread_url: GMAIL('19ff0b19e844faf7'),
  notes: 'Aug 11: asked about reapplying and whether she expects to take a PhD student. Applied previous cycle, not admitted. No reply found yet. Wait; potential 2027 application.',
  outreach: { stage: 'their_move', notes: 'Await Jaynes; possible 2027 reapply.' },
}, { local_date: '2026-08-11', occurred_at: '2026-08-11T12:40:00-04:00' });
summary.research.push('Allison Jaynes → contacted Aug 11');

patchProspect('professor-list-lead-010', 'professor-list', {
  status: 'contacted',
  last_contacted: '2026-08-12',
  follow_up_date: '2026-08-19',
  gmail_thread_url: GMAIL('19ff4abaed757b98'),
  notes: 'Aug 12: asked if he expects to supervise a 2027 planetary plasma & instrumentation PhD / suitable project. MSSL was a previous-cycle application. No reply found yet.',
  outreach: { stage: 'their_move', notes: 'Await Coates 2027-intake reply.' },
}, { local_date: '2026-08-12', occurred_at: '2026-08-12T11:30:00-04:00' });
summary.research.push('Andrew Coates → contacted Aug 12');

patchProspect('professor-list-lead-007', 'professor-list', {
  status: 'followed_up',
  last_contacted: '2026-03-12',
  last_followed_up: '2026-08-12',
  follow_up_date: '',
  gmail_thread_url: GMAIL('19ff4abae8405506'),
  notes: 'Aug 12: asked whether an upcoming funded PhD or other CosmOrbitrap / planetary mass-spectrometry route is expected. No reply found yet. Initial PhD-fit email and later follow-up were sent.',
  outreach: { stage: 'their_move', notes: 'Await Briois funded-route reply.' },
}, { local_date: '2026-08-12', occurred_at: '2026-08-12T11:40:00-04:00' });
summary.research.push('Christelle Briois → followed_up Aug 12 CosmOrbitrap inquiry');

patchProspect('umich-nicholas-jordan-ppml', 'umich', {
  status: 'followed_up',
  last_contacted: '2026-07-13',
  last_followed_up: '2026-08-11',
  follow_up_date: '',
  gmail_thread_url: GMAIL('19ff0b19f753d120'),
  notes: 'Mid-August follow-up after lab tour (2026-08-11). Earlier said he probably will recruit Fall 2027, pending funding; no new reply found yet. Await response / possible hands-on involvement. Active long-term PPML prospect.',
  outreach: { stage: 'their_move', notes: 'Await Nick; Fall 2027 funding still uncertain.' },
}, { local_date: '2026-08-11', occurred_at: '2026-08-11T12:50:00-04:00' });
summary.research.push('Nicholas Jordan → followed_up Aug 11');

patchProspect('umich-amy-brooks-cuos', 'umich', {
  status: 'responded_positive',
  last_contacted: '2026-07-01',
  last_followed_up: '2026-08-11',
  follow_up_date: '',
  gmail_thread_url: GMAIL('19ff18b7d0b1f1dc'),
  notes: 'NQVL Project Manager interview completed Aug 7. Aug 11–12 follow-up: Amy said decision expected in the next 2–3 weeks. Harsh replied again Aug 12. Wait for hiring decision. This is the job-interview thread, not a PhD PI outreach.',
  outreach: { stage: 'their_move', notes: 'Wait for NQVL hiring decision (2–3 weeks from Aug 11).' },
}, { local_date: '2026-08-11', occurred_at: '2026-08-11T16:15:00-04:00' });
summary.research.push('Amy Brooks → responded_positive (NQVL decision window)');

patchProspect('tokamak-energy-industrial-phd', 'private-co', {
  status: 'followed_up',
  last_contacted: '2026-08-08',
  last_followed_up: '2026-08-10',
  follow_up_date: '',
  gmail_thread_url: GMAIL('19fea4ca60cc0453'),
  notes: 'Aug 10: asked Tokamak Energy Careers about late-2026 / 2027 ST40 plasma-diagnostics PhD sponsorship and university partners. No reply found yet. Also asked Hannah Willett which team/role best matches diagnostics + DAQ (networking, not a direct job ask). Track partner-university projects.',
  outreach: { stage: 'their_move', notes: 'Await careers reply; identify university partner projects.' },
}, { local_date: '2026-08-10', occurred_at: '2026-08-10T18:20:00-04:00' });
summary.research.push('Tokamak Energy industrial PhD → followed_up Aug 10');

upsertProspect({
  id: 'professor-list-detlef-koschny-tum-exodocs',
  name: 'D. Koschny',
  title: 'EXODOCS / CLUPI planetary camera',
  department: 'TUM',
  lab: 'CLUPI / EXODOCS',
  institution: 'Technical University of Munich',
  campus: 'Garching',
  country: 'Germany',
  research_keywords: ['planetary camera', 'CLUPI', 'EXODOCS', 'space instrumentation'],
  status: 'contacted',
  last_contacted: '2026-08-11',
  follow_up_date: '2026-08-18',
  gmail_thread_url: GMAIL('19fef796d49b9993'),
  notes: 'Aug 11: asked whether EXODOCS DC1 / CLUPI recruitment already completed and about related routes. Formal deadline had passed when contacted. No reply found yet.',
  outreach: { stage: 'their_move', notes: 'Clarify whether a late application or related route is possible.' },
  application_url: '',
}, 'professor-list', { local_date: '2026-08-11', occurred_at: '2026-08-11T10:30:00-04:00' });
summary.research.push('D. Koschny (new) → contacted');

upsertProspect({
  id: 'professor-list-jean-luc-josset-space-x-clupi',
  name: 'Jean-Luc Josset',
  title: 'CLUPI / SPACE-X doctoral recruitment',
  department: 'SPACE-X',
  lab: 'CLUPI',
  institution: 'SPACE-X / CLUPI',
  campus: 'Neuchâtel',
  country: 'Switzerland',
  research_keywords: ['CLUPI', 'planetary imaging', 'EXODOCS', 'space instrumentation'],
  status: 'contacted',
  last_contacted: '2026-08-11',
  follow_up_date: '2026-08-18',
  gmail_thread_url: GMAIL('19fef796cc642e3f'),
  notes: 'Aug 11: asked whether SPACE-X doctoral recruitment is still possible or if another CLUPI/EXODOCS route exists. Application period appears passed/uncertain. No reply found yet.',
  outreach: { stage: 'their_move', notes: 'Await Josset on whether doctoral recruitment remains possible.' },
}, 'professor-list', { local_date: '2026-08-11', occurred_at: '2026-08-11T10:32:00-04:00' });
summary.research.push('Jean-Luc Josset (new) → contacted');

upsertProspect({
  id: 'professor-list-gabriel-laupre-epfl-space-campus',
  name: 'Gabriel Laupré',
  title: 'EPFL Space Campus — ground-station / RF hardware',
  department: 'EPFL Space Campus',
  lab: 'Space Campus',
  institution: 'EPFL',
  campus: 'Lausanne',
  country: 'Switzerland',
  research_keywords: ['ground station', 'RF hardware', 'space systems', 'validation'],
  status: 'contacted',
  last_contacted: '2026-08-11',
  follow_up_date: '2026-08-18',
  gmail_thread_url: GMAIL('19fef7044d341b18'),
  notes: 'Aug 11: asked for a paid graduate research/project route or appropriate PhD supervisor (ground-station validation, synchronized RF hardware). No reply found yet.',
  outreach: { stage: 'their_move', notes: 'Await Laupré on research/PhD routing.' },
}, 'professor-list', { local_date: '2026-08-11', occurred_at: '2026-08-11T10:20:00-04:00' });
summary.research.push('Gabriel Laupré (new) → contacted');

upsertProspect({
  id: 'professor-list-marschall-university-of-bern-planetary-science',
  name: 'Prof. Marschall',
  title: 'PhD Position in Planetary Science',
  department: 'Space Research & Planetary Sciences',
  lab: 'Planetary Science',
  institution: 'University of Bern',
  campus: 'Bern',
  country: 'Switzerland',
  research_keywords: ['planetary science', 'space instrumentation'],
  status: 'not_contacted',
  application_url: 'https://jobs.unibe.ch/job-vacancies/phd-position-in-planetary-science/bc4620c4-24dc-44d9-a22d-91f182cbf79f',
  notes: 'Not contacted yet. Open posting recommended by Martin Rubin on 2026-08-12 after the Bern mass-spec funding discussion. Next: read posting and decide/apply quickly if fit.',
  outreach: { stage: 'your_move', notes: 'Read Marschall posting and decide/apply if fit.' },
}, 'professor-list', { local_date: '2026-08-12', occurred_at: '2026-08-12T10:05:00-04:00' });
summary.research.push('Prof. Marschall (new) → not_contacted, recommended');

// ---------------------------------------------------------------------------
// 5. Networking Command Center — industry / referral people
// ---------------------------------------------------------------------------
const klaOrg = org('KLA', { id: 'network-org-kla' });
const tokamakOrg = org('Tokamak Energy', { id: 'network-org-tokamak-energy' });
const camdenOrg = org('Camden Space', { tags: ['space', 'networking'] });
const swissmemOrg = org('Swissmem / Swiss Space Industries Group', { tags: ['switzerland', 'space', 'networking'] });
const geOrg = org('GE Vernova', { tags: ['energy', 'referral'] });
const umichOrg = org('University of Michigan', { tags: ['umich'] });

const faust = person({
  display_name: 'Mitchell Faust',
  current_organization_id: klaOrg.id,
  current_organization: 'KLA',
  title: 'Opto-Mechanical Design Engineer contact',
  relationship_stage: 'engaged',
  gmail_thread_url: GMAIL('19ff2b8ef9168364'),
  opportunity_ids: [kla.job.id],
  notes: 'Direct networking email about Opto-Mechanical Design Engineer req 2533228 and mechanical→opto-mechanical path. Replied Aug 12: KLA reviewing resumes and expects technical interviews. Application separately confirmed.',
  source_refs: [{ type: 'gmail', url: GMAIL('19ff2b8ef9168364'), label: 'Faust KLA thread' }],
});
touch({
  person_id: faust.id,
  organization_id: klaOrg.id,
  date: '2026-08-11',
  occurred_at: '2026-08-11T13:30:00-04:00',
  direction: 'outbound',
  subject: 'Opto-Mechanical Design Engineer req 2533228',
  summary: 'Direct networking email about the role and mechanical→opto-mechanical path.',
  gmail_thread_url: GMAIL('19ff2b8ef9168364'),
});
touch({
  person_id: faust.id,
  organization_id: klaOrg.id,
  date: '2026-08-12',
  occurred_at: '2026-08-12T09:30:00-04:00',
  direction: 'inbound',
  subject: 'KLA resumes under review; interviews expected',
  summary: 'Replied Aug 12; KLA reviewing resumes and expects technical interviews.',
  gmail_thread_url: GMAIL('19ff2b8ef9168364'),
});
nextTask({
  person_id: faust.id,
  organization_id: klaOrg.id,
  subject: 'Prepare for KLA technical interview; wait for formal scheduling',
  notes: 'Req 2533228. Application confirmed received.',
  due_at: '2026-08-19',
  state: 'waiting',
  waiting_until: '2026-08-19',
});
patchConsiderJob(kla.job.id, {
  networking_org_id: klaOrg.id,
  networking_person_ids: [faust.id],
});
summary.networking.push('Mitchell Faust (KLA) engaged + interview prep task');

const hannah = person({
  display_name: 'Hannah Willett',
  current_organization_id: tokamakOrg.id,
  current_organization: 'Tokamak Energy',
  title: 'ST40 diagnostics / fusion contact',
  relationship_stage: 'contacted',
  gmail_thread_url: GMAIL('19fea4ca652f7e03'),
  notes: 'Aug 10: asked which Tokamak Energy team/role best matches diagnostics + DAQ background (transition from space-plasma instrumentation). Networking/advice, not a direct job ask. No reply found yet.',
});
touch({
  person_id: hannah.id,
  organization_id: tokamakOrg.id,
  date: '2026-08-10',
  occurred_at: '2026-08-10T18:15:00-04:00',
  direction: 'outbound',
  subject: 'Diagnostics + DAQ fit at Tokamak Energy',
  summary: 'Asked which team/role best matches diagnostics + DAQ background; networking/advice, not a direct job ask.',
  gmail_thread_url: GMAIL('19fea4ca652f7e03'),
});
nextTask({
  person_id: hannah.id,
  organization_id: tokamakOrg.id,
  subject: 'Wait / follow up later with Hannah Willett',
  due_at: '2026-08-24',
  state: 'waiting',
  waiting_until: '2026-08-24',
});
summary.networking.push('Hannah Willett (Tokamak Energy) contacted');

const tokamakCareers = person({
  display_name: 'Tokamak Energy Careers',
  current_organization_id: tokamakOrg.id,
  current_organization: 'Tokamak Energy',
  title: 'Careers inbox',
  relationship_stage: 'contacted',
  gmail_thread_url: GMAIL('19fea4ca60cc0453'),
  notes: 'Organization inbox rather than named person. Aug 10: asked about late-2026 / 2027 sponsored PhD routes and university partners. No reply found yet.',
});
touch({
  person_id: tokamakCareers.id,
  organization_id: tokamakOrg.id,
  date: '2026-08-10',
  occurred_at: '2026-08-10T18:18:00-04:00',
  direction: 'outbound',
  subject: 'ST40 plasma diagnostics PhD sponsorship',
  summary: 'Asked about late-2026 / 2027 sponsored PhD routes and university partners.',
  gmail_thread_url: GMAIL('19fea4ca60cc0453'),
});
nextTask({
  person_id: tokamakCareers.id,
  organization_id: tokamakOrg.id,
  subject: 'Track Tokamak partner-university PhD projects',
  due_at: '2026-08-24',
  state: 'waiting',
  waiting_until: '2026-08-24',
});
summary.networking.push('Tokamak Energy Careers inbox contacted');

const grant = person({
  display_name: 'Grant Miars',
  current_organization_id: camdenOrg.id,
  current_organization: 'Camden Space',
  title: 'Camden Space contact',
  relationship_stage: 'conversation',
  gmail_thread_url: GMAIL('19ff2ccfb8394005'),
  notes: 'Warm existing contact. Aug 11: continued prior thread and asked to discuss Camden work. Grant said first contract is short/small and suggested touching base as current work wraps.',
});
touch({
  person_id: grant.id,
  organization_id: camdenOrg.id,
  date: '2026-08-11',
  occurred_at: '2026-08-11T13:55:00-04:00',
  direction: 'outbound',
  type: 'follow_up',
  subject: 'Camden Space — discuss possible engineering/research work',
  summary: 'Continued prior thread and asked to discuss Camden work.',
  gmail_thread_url: GMAIL('19ff2ccfb8394005'),
});
touch({
  person_id: grant.id,
  organization_id: camdenOrg.id,
  date: '2026-08-11',
  occurred_at: '2026-08-11T17:00:00-04:00',
  direction: 'inbound',
  type: 'email',
  subject: 'First contract short/small — touch base as work wraps',
  summary: 'Grant said first contract is short/small and suggested touching base as current work wraps.',
  gmail_thread_url: GMAIL('19ff2ccfb8394005'),
});
nextTask({
  person_id: grant.id,
  organization_id: camdenOrg.id,
  subject: 'Set up chat with Grant Miars when timing works',
  due_at: '2026-08-25',
  state: 'waiting',
  waiting_until: '2026-08-25',
});
summary.networking.push('Grant Miars (Camden Space) conversation');

const kishan = person({
  display_name: 'Kishan Srinivasan',
  current_organization_id: umichOrg.id,
  current_organization: 'University of Michigan / GE referral route',
  title: 'U-M contact — GE Vernova referral',
  relationship_stage: 'contacted',
  gmail_thread_url: GMAIL('19ff3230365e6e6d'),
  notes: 'Aug 11: sent 4 GE Vernova roles (R5047028, R5049438, R5049035, R5048460) for ease of communication / likely referral help. No formal application confirmation found for the 4 GE roles.',
});
touch({
  person_id: kishan.id,
  organization_id: geOrg.id,
  date: '2026-08-11',
  occurred_at: '2026-08-11T14:40:00-04:00',
  direction: 'outbound',
  subject: 'Four GE Vernova roles for referral / communication',
  summary: 'Sent role list R5047028, R5049438, R5049035, R5048460 for likely referral help. Confirm which roles were actually submitted.',
  gmail_thread_url: GMAIL('19ff3230365e6e6d'),
});
nextTask({
  person_id: kishan.id,
  organization_id: geOrg.id,
  subject: 'Confirm which GE Vernova roles were actually submitted',
  due_at: '2026-08-18',
  state: 'open',
});
summary.networking.push('Kishan Srinivasan GE referral contacted');

const keller = person({
  display_name: 'R. Keller',
  current_organization_id: swissmemOrg.id,
  current_organization: 'Swissmem / Swiss Space Industries Group',
  title: 'Swiss space-sector entry contact',
  relationship_stage: 'contacted',
  gmail_thread_url: GMAIL('19ff4abaf31b3c01'),
  notes: 'Aug 12 broad sector-networking outreach: asked for guidance on member companies, university groups, and entry routes in Swiss space (instrumentation/testing/research). No reply found yet.',
});
touch({
  person_id: keller.id,
  organization_id: swissmemOrg.id,
  date: '2026-08-12',
  occurred_at: '2026-08-12T11:10:00-04:00',
  direction: 'outbound',
  subject: 'Swiss space-sector entry — companies, groups, routes',
  summary: 'Asked for guidance on member companies, university groups, and entry routes.',
  gmail_thread_url: GMAIL('19ff4abaf31b3c01'),
});
nextTask({
  person_id: keller.id,
  organization_id: swissmemOrg.id,
  subject: 'Await Swissmem guidance / referrals',
  due_at: '2026-08-26',
  state: 'waiting',
  waiting_until: '2026-08-26',
});
summary.networking.push('R. Keller (Swissmem) contacted');

const amyNet = person({
  display_name: 'Amy Brooks',
  current_organization_id: umichOrg.id,
  current_organization: 'University of Michigan, Optics & Photonics / CUOS',
  title: 'Research Manager — NQVL hiring contact',
  relationship_stage: 'engaged',
  gmail_thread_url: GMAIL('19ff18b7d0b1f1dc'),
  notes: 'Followed up after Aug 7 NQVL Project Manager interview. Amy: decision expected in next 2–3 weeks. Harsh replied again Aug 12.',
});
touch({
  person_id: amyNet.id,
  organization_id: umichOrg.id,
  date: '2026-08-11',
  occurred_at: '2026-08-11T16:10:00-04:00',
  direction: 'outbound',
  type: 'follow_up',
  subject: 'NQVL Project Manager — decision timeline',
  summary: 'Followed up after Aug 7 interview for decision timeline.',
  gmail_thread_url: GMAIL('19ff18b7d0b1f1dc'),
});
touch({
  person_id: amyNet.id,
  organization_id: umichOrg.id,
  date: '2026-08-11',
  occurred_at: '2026-08-11T16:40:00-04:00',
  direction: 'inbound',
  subject: 'Decision expected in next 2–3 weeks',
  summary: 'Amy: decision expected in next 2–3 weeks.',
  gmail_thread_url: GMAIL('19ff18b7d0b1f1dc'),
});
nextTask({
  person_id: amyNet.id,
  organization_id: umichOrg.id,
  subject: 'Wait for NQVL hiring decision',
  due_at: '2026-09-01',
  state: 'waiting',
  waiting_until: '2026-09-01',
});
summary.networking.push('Amy Brooks (NQVL) engaged');

// ---------------------------------------------------------------------------
// 6. Sync dashboard projections
// ---------------------------------------------------------------------------
syncConsiderJobsToDashboard();
syncApplications();
syncUmichOpportunitiesToDashboard();
syncNetworkingToDashboard();
syncResearchProspectsToDashboard({ source: 'umich' });
syncResearchProspectsToDashboard({ source: 'professor-list' });
syncResearchProspectsToDashboard({ source: 'private-co' });

console.log(JSON.stringify({
  ok: true,
  applications: summary.applications,
  jobs_consider: summary.jobs_consider,
  research: summary.research,
  networking: summary.networking,
}, null, 2));
