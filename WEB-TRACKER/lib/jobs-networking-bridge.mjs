/**
 * Jobs ↔ Networking bridge: queue contact research for a consider-job company,
 * derive warm-path coverage, and keep opportunity_ids linked both ways.
 */
import {
  findConsiderJob,
  patchConsiderJob,
  readConsiderJobs,
  syncConsiderJobsToDashboard,
} from './jobs-to-consider-store.mjs';
import {
  queueNetworkingResearch,
  readNetworkingResearchQueue,
} from './networking/factory.mjs';
import {
  findNetworkingOrganization,
  readNetworking,
  syncNetworkingToDashboard,
  upsertNetworkingOrganization,
  writeNetworking,
} from './networking/store.mjs';
import { isHardUsPersonBlock } from './work-auth.mjs';

const DEFAULT_PERSONAS = ['hiring_manager', 'peer', 'recruiter'];

const CONTACTED_STAGES = new Set([
  'contacted',
  'engaged',
  'conversation',
  'warm',
  'referral_eligible',
  'referred',
]);
const WARM_STAGES = new Set(['warm', 'referral_eligible', 'referred']);
const REFERRED_STAGES = new Set(['referred']);

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(cleanText).filter(Boolean))];
}

function mergeOpportunityIds(existing = [], jobId) {
  return uniqueStrings([...(existing || []), jobId]);
}

export function peopleLinkedToJob(job = {}, networkingStore = readNetworking()) {
  const jobId = cleanText(job.id);
  const orgId = cleanText(job.networking_org_id);
  const explicit = new Set(uniqueStrings(job.networking_person_ids));
  return (networkingStore.people || []).filter(person => {
    if (explicit.has(person.id)) return true;
    if (jobId && (person.opportunity_ids || []).includes(jobId)) return true;
    if (orgId && person.current_organization_id === orgId) return true;
    return false;
  });
}

export function researchOrderForJob(job = {}, queue = readNetworkingResearchQueue()) {
  const orderId = cleanText(job.networking_research_order_id);
  const jobId = cleanText(job.id);
  const orgId = cleanText(job.networking_org_id);
  const all = [...(queue.pending || []), ...(queue.completed || [])];
  if (orderId) {
    const byId = all.find(order => order.id === orderId);
    if (byId) return byId;
  }
  return all.find(order => (
    (jobId && (order.opportunity_ids || []).includes(jobId))
    || (orgId && order.organization_id === orgId)
  )) || null;
}

/**
 * @returns {'none'|'queued'|'candidates'|'contacted'|'warm'|'referred'}
 */
export function deriveOutreachCoverage(job = {}, {
  networkingStore = readNetworking(),
  queue = readNetworkingResearchQueue(),
} = {}) {
  const people = peopleLinkedToJob(job, networkingStore);
  if (people.some(person => REFERRED_STAGES.has(person.relationship_stage))) return 'referred';
  if (people.some(person => WARM_STAGES.has(person.relationship_stage))) return 'warm';
  if (people.some(person => CONTACTED_STAGES.has(person.relationship_stage))) return 'contacted';
  if (people.length) return 'candidates';

  const order = researchOrderForJob(job, queue);
  if (order && ['queued', 'in_progress', 'review_ready'].includes(order.status)) return 'queued';
  return 'none';
}

export function outreachCoverageLabel(coverage, peopleCount = 0) {
  switch (coverage) {
    case 'referred':
      return peopleCount ? `${peopleCount} people · referred` : 'Referred path';
    case 'warm':
      return peopleCount ? `${peopleCount} people · warm` : 'Warm contacts';
    case 'contacted':
      return peopleCount ? `${peopleCount} people · contacted` : 'Contacted';
    case 'candidates':
      return peopleCount ? `${peopleCount} people · review` : 'Candidates ready';
    case 'queued':
      return 'Research queued';
    default:
      return 'No contacts yet';
  }
}

export function enrichConsiderJobWithNetworking(job = {}, {
  networkingStore = readNetworking(),
  queue = readNetworkingResearchQueue(),
} = {}) {
  const people = peopleLinkedToJob(job, networkingStore);
  const personIds = uniqueStrings([
    ...(job.networking_person_ids || []),
    ...people.map(person => person.id),
  ]);
  const coverage = deriveOutreachCoverage(
    { ...job, networking_person_ids: personIds },
    { networkingStore, queue },
  );
  const contactedCount = people.filter(person => CONTACTED_STAGES.has(person.relationship_stage)).length;
  const warmCount = people.filter(person => WARM_STAGES.has(person.relationship_stage)).length;
  return {
    ...job,
    networking_person_ids: personIds,
    outreach_coverage: coverage,
    outreach_coverage_label: outreachCoverageLabel(coverage, people.length),
    networking_people_count: people.length,
    networking_contacted_count: contactedCount,
    networking_warm_count: warmCount,
  };
}

export function enrichConsiderJobsStore(store = {}, options = {}) {
  const networkingStore = options.networkingStore || readNetworking();
  const queue = options.queue || readNetworkingResearchQueue();
  const jobs = Array.isArray(store.jobs)
    ? store.jobs.map(job => enrichConsiderJobWithNetworking(job, { networkingStore, queue }))
    : [];
  return { ...store, jobs };
}

/**
 * Resolve/create networking org for a job, queue research, link opportunity_ids, patch job.
 * Hard-ITAR jobs get intel_only research notes (no apply path).
 */
export function queueNetworkingForConsiderJob(jobId, {
  personas = DEFAULT_PERSONAS,
  notes = '',
  intel_only = null,
} = {}) {
  const job = findConsiderJob(jobId);
  if (!job) throw new Error(`job not found: ${jobId}`);
  if (!cleanText(job.company)) throw new Error('job requires company to queue networking research');

  const hardBlock = isHardUsPersonBlock(job);
  const intelOnly = intel_only === null ? hardBlock : Boolean(intel_only);

  const existingOrg = findNetworkingOrganization(job.company);
  const orgPatch = {
    id: existingOrg?.id,
    name: job.company,
    opportunity_ids: mergeOpportunityIds(existingOrg?.opportunity_ids, job.id),
    notes: existingOrg?.notes || '',
  };
  // Prefer existing strategy ladder; seed closed/watch when hard ITAR and unset.
  if (existingOrg?.tier) {
    orgPatch.tier = existingOrg.tier;
    orgPatch.strategy_status = existingOrg.strategy_status || 'active';
    orgPatch.feasibility_label = existingOrg.feasibility_label || '';
    orgPatch.feasibility_notes = existingOrg.feasibility_notes || '';
    orgPatch.tags = existingOrg.tags || [];
  } else if (hardBlock) {
    orgPatch.tier = 'C';
    orgPatch.strategy_status = 'watch';
    orgPatch.feasibility_label = existingOrg?.feasibility_label
      || 'US-person / ITAR hard gate — networking intel only, not an apply target';
    orgPatch.tags = uniqueStrings([...(existingOrg?.tags || []), 'intel-only', 'itar-hard']);
  }

  const orgResult = upsertNetworkingOrganization(orgPatch);
  const organization = orgResult.organization;

  // Keep opportunity_ids on the org after upsert merge.
  const networkingStore = readNetworking();
  const orgIndex = networkingStore.organizations.findIndex(item => item.id === organization.id);
  if (orgIndex >= 0) {
    networkingStore.organizations[orgIndex] = {
      ...networkingStore.organizations[orgIndex],
      opportunity_ids: mergeOpportunityIds(
        networkingStore.organizations[orgIndex].opportunity_ids,
        job.id,
      ),
    };
    writeNetworking(networkingStore);
  }

  const roleNote = [
    intelOnly ? 'intel_only' : '',
    `Jobs To Consider: ${job.title}`,
    job.url ? `Posting: ${job.url}` : '',
    hardBlock ? 'Hard US-person/ITAR gate — do not pitch apply; ask for open-lane referrals only' : '',
    notes,
  ].filter(Boolean).join(' · ');

  const queued = queueNetworkingResearch({
    organization_id: organization.id,
    organization_name: organization.name,
    opportunity_ids: [job.id],
    personas: personas.length ? personas : DEFAULT_PERSONAS,
    notes: roleNote,
  });

  const patched = patchConsiderJob(job.id, {
    networking_org_id: organization.id,
    networking_research_order_id: queued.order.id,
  });

  syncNetworkingToDashboard();
  syncConsiderJobsToDashboard();

  const enriched = enrichConsiderJobWithNetworking(patched.job);
  return {
    job: enriched,
    organization,
    order: queued.order,
    duplicate: Boolean(queued.duplicate),
    intel_only: intelOnly,
  };
}

/** Guard for apply endpoints — hard US-person jobs cannot be marked applied without force. */
export function assertConsiderJobApplyAllowed(job = {}, { force = false } = {}) {
  if (force) return true;
  if (!isHardUsPersonBlock(job)) return true;
  const err = new Error(
    'Blocked: this posting is tagged hard US-person / ITAR. Do not apply — use networking intel_only or force_apply after human override.',
  );
  err.code = 'HARD_US_PERSON_APPLY_BLOCKED';
  throw err;
}

export function jobsNeedingOutreachFollowup(jobs = [], {
  olderThanDays = 5,
  now = new Date(),
} = {}) {
  const ms = Math.max(1, Number(olderThanDays) || 5) * 24 * 60 * 60 * 1000;
  return jobs.filter(job => {
    if (!(job.applied || job.status === 'applied')) return false;
    const coverage = job.outreach_coverage || deriveOutreachCoverage(job);
    if (coverage !== 'none') return false;
    const appliedAt = Date.parse(job.applied_at || '');
    if (!Number.isFinite(appliedAt)) return false;
    return (now.getTime() - appliedAt) >= ms;
  });
}

/**
 * After canceling a research order: clear order links on Jobs to Consider.
 * Keeps networking_org_id so the company card remains.
 */
export function unlinkCanceledResearchOrder(order = {}) {
  const orderId = cleanText(order.id);
  const opportunityIds = new Set(uniqueStrings(order.opportunity_ids || []));
  const patchedJobs = [];

  const jobsStore = readConsiderJobs();
  const candidates = (jobsStore.jobs || []).filter(job => {
    if (orderId && cleanText(job.networking_research_order_id) === orderId) return true;
    if (opportunityIds.has(cleanText(job.id))) return true;
    return false;
  });

  for (const job of candidates) {
    const result = patchConsiderJob(job.id, { networking_research_order_id: '' });
    patchedJobs.push(result.job);
  }

  if (patchedJobs.length) syncConsiderJobsToDashboard();
  return { jobs: patchedJobs, cleared: patchedJobs.length };
}
