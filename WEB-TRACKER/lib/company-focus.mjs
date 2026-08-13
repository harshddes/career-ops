/**
 * Company Focus / Execute Mode — one pinned company, capped roles/contacts, one next action.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readConsiderJobs } from './jobs-to-consider-store.mjs';
import { readNetworkingResearchQueue } from './networking/factory.mjs';
import { findNetworkingOrganization, readNetworking } from './networking/store.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const WEB_TRACKER_DIR = join(LIB_DIR, '..');
export const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
export const CANONICAL_COMPANY_FOCUS_FILE = process.env.COMPANY_FOCUS_DATA_FILE
  || join(CAREER_OPS_DIR, 'data', 'company-focus.json');
export const DASHBOARD_COMPANY_FOCUS_FILE = process.env.COMPANY_FOCUS_DASHBOARD_FILE
  || join(WEB_TRACKER_DIR, 'data', 'company-focus.json');

export const PLAYBOOK_STEPS = Object.freeze([
  'seed',
  'triage_roles',
  'research_hubs',
  'review',
  'outreach',
  'apply',
  'follow_up',
  'done_for_today',
]);

export const DEFAULT_ROLE_CAP = 3;
export const DEFAULT_CONTACT_BUDGET = 5;
export const DEFAULT_DAILY_OUTREACH_CAP = 1;
export const TRIGGER_PHRASE = 'Find new networking contacts';

const CONTACTED_STAGES = new Set([
  'contacted',
  'engaged',
  'conversation',
  'warm',
  'referral_eligible',
  'referred',
]);

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))];
}

function cleanNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function atomicWrite(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = join(dirname(filePath), `.${basename(filePath)}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  writeFileSync(tempPath, content, 'utf-8');
  const retryCodes = new Set(['EPERM', 'EACCES', 'EBUSY', 'EAGAIN', 'UNKNOWN']);
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      renameSync(tempPath, filePath);
      return;
    } catch (error) {
      lastError = error;
      if (!retryCodes.has(error?.code)) break;
      try {
        writeFileSync(filePath, content, 'utf-8');
        try { unlinkSync(tempPath); } catch {}
        return;
      } catch (writeError) {
        lastError = writeError;
        if (!retryCodes.has(writeError?.code)) break;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40 * (attempt + 1));
      }
    }
  }
  try { unlinkSync(tempPath); } catch {}
  throw lastError || new Error(`failed to write ${filePath}`);
}

function emptyNextAction() {
  return {
    type: 'done_for_today',
    title: 'No company pinned',
    why: 'Pin a company to start Execute Mode.',
    cta: 'Pin a company above',
    person_id: '',
    job_id: '',
    copy_text: '',
    cursor_phrase: '',
  };
}

export function emptyCompanyFocus() {
  return {
    version: 1,
    organization_id: '',
    organization_name: '',
    location_bias: '',
    role_lane: '',
    shortlisted_job_ids: [],
    contact_budget: DEFAULT_CONTACT_BUDGET,
    role_cap: DEFAULT_ROLE_CAP,
    daily_outreach_cap: DEFAULT_DAILY_OUTREACH_CAP,
    playbook_step: 'seed',
    next_action: emptyNextAction(),
    snoozed_until: '',
    last_outreach_at: '',
    outreach_count_today: 0,
    outreach_day_key: '',
    skipped_action_keys: [],
    updated_at: new Date().toISOString(),
  };
}

function normalizeNextAction(raw = {}) {
  return {
    type: cleanText(raw.type) || 'done_for_today',
    title: cleanText(raw.title),
    why: cleanText(raw.why),
    cta: cleanText(raw.cta),
    person_id: cleanText(raw.person_id),
    job_id: cleanText(raw.job_id),
    copy_text: String(raw.copy_text ?? '').trim(),
    cursor_phrase: cleanText(raw.cursor_phrase),
  };
}

export function normalizeCompanyFocus(raw = {}) {
  const roleCap = Math.max(1, Math.min(10, cleanNumber(raw.role_cap, DEFAULT_ROLE_CAP)));
  const contactBudget = Math.max(1, Math.min(20, cleanNumber(raw.contact_budget, DEFAULT_CONTACT_BUDGET)));
  const dailyOutreachCap = Math.max(1, Math.min(5, cleanNumber(raw.daily_outreach_cap, DEFAULT_DAILY_OUTREACH_CAP)));
  const playbookStep = PLAYBOOK_STEPS.includes(raw.playbook_step) ? raw.playbook_step : 'seed';
  return {
    version: 1,
    organization_id: cleanText(raw.organization_id),
    organization_name: cleanText(raw.organization_name),
    location_bias: cleanText(raw.location_bias),
    role_lane: cleanText(raw.role_lane),
    shortlisted_job_ids: cleanArray(raw.shortlisted_job_ids).slice(0, roleCap),
    contact_budget: contactBudget,
    role_cap: roleCap,
    daily_outreach_cap: dailyOutreachCap,
    playbook_step: playbookStep,
    next_action: normalizeNextAction(raw.next_action),
    snoozed_until: cleanText(raw.snoozed_until),
    last_outreach_at: cleanText(raw.last_outreach_at),
    outreach_count_today: Math.max(0, cleanNumber(raw.outreach_count_today, 0)),
    outreach_day_key: cleanText(raw.outreach_day_key),
    skipped_action_keys: cleanArray(raw.skipped_action_keys).slice(-40),
    updated_at: cleanText(raw.updated_at) || new Date().toISOString(),
  };
}

export function readCompanyFocus(filePath = CANONICAL_COMPANY_FOCUS_FILE) {
  if (!existsSync(filePath)) return emptyCompanyFocus();
  try {
    return normalizeCompanyFocus(JSON.parse(readFileSync(filePath, 'utf-8')));
  } catch {
    return emptyCompanyFocus();
  }
}

export function writeCompanyFocus(focus, filePath = CANONICAL_COMPANY_FOCUS_FILE) {
  const next = normalizeCompanyFocus({
    ...focus,
    updated_at: new Date().toISOString(),
  });
  atomicWrite(filePath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function syncCompanyFocusToDashboard({
  sourcePath = CANONICAL_COMPANY_FOCUS_FILE,
  targetPath = DASHBOARD_COMPANY_FOCUS_FILE,
} = {}) {
  const focus = readCompanyFocus(sourcePath);
  atomicWrite(targetPath, `${JSON.stringify(focus, null, 2)}\n`);
  return focus;
}

function localDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function refreshOutreachCounters(focus, now = new Date()) {
  const dayKey = localDayKey(now);
  if (focus.outreach_day_key === dayKey) return focus;
  return {
    ...focus,
    outreach_day_key: dayKey,
    outreach_count_today: 0,
  };
}

function actionKey(action = {}) {
  return [
    cleanText(action.type),
    cleanText(action.person_id),
    cleanText(action.job_id),
    cleanText(action.title),
  ].join('|');
}

function peopleForFocusOrg(focus, networkingStore) {
  const orgId = cleanText(focus.organization_id);
  const orgName = cleanText(focus.organization_name).toLowerCase();
  return (networkingStore.people || []).filter(person => {
    if (orgId && person.current_organization_id === orgId) return true;
    if (orgName && cleanText(person.current_organization).toLowerCase() === orgName) return true;
    return false;
  });
}

function shortlistedJobs(focus, jobsStore) {
  const byId = new Map((jobsStore.jobs || []).map(job => [job.id, job]));
  return cleanArray(focus.shortlisted_job_ids)
    .map(id => byId.get(id))
    .filter(Boolean);
}

function orgJobs(focus, jobsStore) {
  const orgName = cleanText(focus.organization_name).toLowerCase();
  if (!orgName) return [];
  return (jobsStore.jobs || []).filter(job => {
    if (job.status === 'closed' || job.status === 'archived') return false;
    return cleanText(job.company).toLowerCase().includes(orgName)
      || (orgName === 'kla' && /kla|kla-tencor|kla tencor/i.test(job.company || ''));
  });
}

function pendingResearchForOrg(focus, queue) {
  const orgId = cleanText(focus.organization_id);
  const orgName = cleanText(focus.organization_name).toLowerCase();
  return (queue.pending || []).find(order => (
    (orgId && order.organization_id === orgId)
    || (orgName && cleanText(order.organization_name).toLowerCase() === orgName)
  )) || null;
}

function draftOutreachCopy(person = {}, focus = {}) {
  const name = cleanText(person.display_name).split(/\s+/)[0] || 'there';
  const company = cleanText(focus.organization_name) || 'your team';
  const affinity = (person.affinity_tags || []).includes('umich')
    ? 'I am also at the University of Michigan'
    : 'I work on plasma / optical instrumentation and precision measurement hardware';
  return `Hi ${name} — ${affinity}, and I am exploring ${company}'s Ann Arbor hardware / precision / opto-mechanical work. Would you be open to a short chat about how your team approaches instrumentation and what makes candidates stand out? Happy to keep it to 15 minutes.`;
}

/**
 * Derive exactly one next action for Execute Mode.
 */
export function deriveCompanyFocusNextAction(focusInput = {}, {
  networkingStore = null,
  jobsStore = null,
  researchQueue = null,
  now = new Date(),
} = {}) {
  let focus = refreshOutreachCounters(normalizeCompanyFocus(focusInput), now);
  const networking = networkingStore || readNetworking();
  const jobs = jobsStore || readConsiderJobs();
  const queue = researchQueue || readNetworkingResearchQueue();
  const skipped = new Set(focus.skipped_action_keys || []);

  const make = (partial) => {
    const action = normalizeNextAction(partial);
    if (skipped.has(actionKey(action))) return null;
    return action;
  };

  if (focus.snoozed_until && Date.parse(focus.snoozed_until) > now.getTime()) {
    return {
      focus: { ...focus, playbook_step: 'done_for_today', next_action: normalizeNextAction({
        type: 'done_for_today',
        title: 'Snoozed',
        why: `Next move unlocks after ${focus.snoozed_until}.`,
        cta: 'Wait or clear snooze',
      }) },
      action: normalizeNextAction({
        type: 'done_for_today',
        title: 'Snoozed',
        why: `Next move unlocks after ${focus.snoozed_until}.`,
        cta: 'Wait or clear snooze',
      }),
    };
  }

  if (!focus.organization_id && !focus.organization_name) {
    const action = make({
      type: 'pin_company',
      title: 'Pin a focus company',
      why: 'Execute Mode needs one company so you stop deciding between dozens.',
      cta: 'Pin KLA (or another company)',
    }) || emptyNextAction();
    return {
      focus: { ...focus, playbook_step: 'seed', next_action: action },
      action,
    };
  }

  const org = findNetworkingOrganization(focus.organization_id || focus.organization_name, networking);
  if (!org) {
    const action = make({
      type: 'seed_org',
      title: `Seed ${focus.organization_name || 'company'} in Networking`,
      why: 'Create the company card before researching people or shortlisting roles.',
      cta: 'Run seed script / upsert organization',
    });
    if (action) {
      return { focus: { ...focus, playbook_step: 'seed', next_action: action }, action };
    }
  }

  const shortlist = shortlistedJobs(focus, jobs);
  const relatedJobs = shortlist.length ? shortlist : orgJobs(focus, jobs);
  if (shortlist.length === 0) {
    const action = make({
      type: 'triage_roles',
      title: `Shortlist up to ${focus.role_cap} roles at ${focus.organization_name}`,
      why: relatedJobs.length
        ? `${relatedJobs.length} related openings exist — pick ≤${focus.role_cap}, not the whole board.`
        : `No roles shortlisted yet. Add ≤${focus.role_cap} Ann Arbor hardware / instrumentation openings.`,
      cta: 'Pick roles (max 3)',
      job_id: relatedJobs[0]?.id || '',
    });
    if (action) {
      return { focus: { ...focus, playbook_step: 'triage_roles', next_action: action }, action };
    }
  }

  const people = peopleForFocusOrg(focus, networking);
  const pendingOrder = pendingResearchForOrg(focus, queue);
  const reviewReady = people.filter(person => person.review_status === 'review_ready' && !person.do_not_contact);
  const approved = people.filter(person => (
    person.review_status === 'approved'
    || CONTACTED_STAGES.has(person.relationship_stage)
    || person.relationship_stage === 'outreach_ready'
  ));
  const approvedActive = approved.filter(person => person.review_status !== 'rejected' && !person.do_not_contact);

  if (pendingOrder && pendingOrder.status === 'queued') {
    const action = make({
      type: 'run_research',
      title: 'Research hub contacts',
      why: `Research order queued for ${focus.organization_name}. Cap: ${focus.contact_budget} people for the whole company — not per role.`,
      cta: `In Cursor say: ${TRIGGER_PHRASE}`,
      cursor_phrase: TRIGGER_PHRASE,
    });
    if (action) {
      return { focus: { ...focus, playbook_step: 'research_hubs', next_action: action }, action };
    }
  }

  if (pendingOrder && pendingOrder.status === 'in_progress') {
    const action = make({
      type: 'run_research',
      title: 'Research in progress',
      why: 'Wait for Cursor to finish contact research, then refresh.',
      cta: `If stuck, say: ${TRIGGER_PHRASE}`,
      cursor_phrase: TRIGGER_PHRASE,
    });
    if (action) {
      return { focus: { ...focus, playbook_step: 'research_hubs', next_action: action }, action };
    }
  }

  if (reviewReady.length > 0 && approvedActive.length < focus.contact_budget) {
    const person = reviewReady[0];
    const action = make({
      type: 'review_person',
      title: `Approve or reject ${person.display_name}`,
      why: `Hub budget ${approvedActive.length}/${focus.contact_budget}. Review people for the company, not for each job.`,
      cta: 'Open Review people',
      person_id: person.id,
    });
    if (action) {
      return { focus: { ...focus, playbook_step: 'review', next_action: action }, action };
    }
  }

  if (approvedActive.length === 0 && !pendingOrder) {
    const action = make({
      type: 'queue_research',
      title: `Queue hub research for ${focus.organization_name}`,
      why: `No approved contacts yet. Find ≤${focus.contact_budget} hub people (alum peer, team engineer, recruiter).`,
      cta: 'Queue research (Start here)',
    });
    if (action) {
      return { focus: { ...focus, playbook_step: 'research_hubs', next_action: action }, action };
    }
  }

  const outreachReady = approvedActive.filter(person => (
    person.relationship_stage === 'outreach_ready'
    || person.relationship_stage === 'identified'
    || person.relationship_stage === 'researching'
    || person.review_status === 'approved'
  )).filter(person => !CONTACTED_STAGES.has(person.relationship_stage));

  if (
    outreachReady.length > 0
    && focus.outreach_count_today < focus.daily_outreach_cap
  ) {
    const person = outreachReady[0];
    const copy = draftOutreachCopy(person, focus);
    const action = make({
      type: 'outreach',
      title: `Send one message to ${person.display_name}`,
      why: `Daily cap ${focus.outreach_count_today}/${focus.daily_outreach_cap}. You send it — dashboard never auto-sends.`,
      cta: 'Copy message, then mark Done after you send',
      person_id: person.id,
      copy_text: copy,
    });
    if (action) {
      return { focus: { ...focus, playbook_step: 'outreach', next_action: action }, action };
    }
  }

  const unapplied = shortlist.filter(job => !job.applied && job.status !== 'applied');
  if (unapplied.length > 0) {
    const job = unapplied[0];
    const hasPack = Boolean(job.resources?.resume_pdf || job.resources?.cover_letter_pdf);
    const action = make({
      type: 'apply',
      title: hasPack
        ? `Apply: ${job.title}`
        : `Prepare / apply: ${job.title}`,
      why: hasPack
        ? 'Pack ready — submit yourself, then mark Done.'
        : 'Shortlisted role waiting. Generate pack or apply with your current resume.',
      cta: hasPack ? 'Open job + mark applied when done' : 'Open job posting',
      job_id: job.id,
    });
    if (action) {
      return { focus: { ...focus, playbook_step: 'apply', next_action: action }, action };
    }
  }

  const followUpPeople = approvedActive.filter(person => {
    if (!CONTACTED_STAGES.has(person.relationship_stage)) return false;
    const nextTouch = Date.parse(person.channel_states?.linkedin?.next_permitted_touch_at
      || person.channel_states?.email?.next_permitted_touch_at
      || '');
    if (Number.isFinite(nextTouch) && nextTouch > now.getTime()) return false;
    const unanswered = Number(person.channel_states?.linkedin?.unanswered_followups || 0)
      + Number(person.channel_states?.email?.unanswered_followups || 0);
    return unanswered < 2;
  });
  if (followUpPeople.length > 0 && focus.outreach_count_today < focus.daily_outreach_cap) {
    const person = followUpPeople[0];
    const action = make({
      type: 'follow_up',
      title: `Follow up with ${person.display_name}`,
      why: 'One gentle follow-up — still under the daily outreach cap.',
      cta: 'Send follow-up, then mark Done',
      person_id: person.id,
      copy_text: `Hi ${cleanText(person.display_name).split(/\s+/)[0] || 'there'} — just bumping my earlier note about ${focus.organization_name}. Happy to work around your schedule for a short chat.`,
    });
    if (action) {
      return { focus: { ...focus, playbook_step: 'follow_up', next_action: action }, action };
    }
  }

  const done = normalizeNextAction({
    type: 'done_for_today',
    title: 'Done for today',
    why: focus.outreach_count_today >= focus.daily_outreach_cap
      ? 'Daily outreach cap reached. Come back tomorrow.'
      : `Focus on ${focus.organization_name} is clear — no forced next move.`,
    cta: 'Stop. Protect the budget.',
  });
  return {
    focus: { ...focus, playbook_step: 'done_for_today', next_action: done },
    action: done,
  };
}

export function buildCompanyFocusReadModel({
  focus = readCompanyFocus(),
  networkingStore = readNetworking(),
  jobsStore = readConsiderJobs(),
  researchQueue = readNetworkingResearchQueue(),
  now = new Date(),
} = {}) {
  const derived = deriveCompanyFocusNextAction(focus, {
    networkingStore,
    jobsStore,
    researchQueue,
    now,
  });
  const people = peopleForFocusOrg(derived.focus, networkingStore);
  const shortlist = shortlistedJobs(derived.focus, jobsStore);
  const pendingOrder = pendingResearchForOrg(derived.focus, researchQueue);
  const approvedCount = people.filter(person => (
    person.review_status === 'approved' || CONTACTED_STAGES.has(person.relationship_stage)
  )).length;
  const reviewReadyCount = people.filter(person => person.review_status === 'review_ready').length;

  return {
    ...derived.focus,
    next_action: derived.action,
    progress: {
      org_seeded: Boolean(findNetworkingOrganization(
        derived.focus.organization_id || derived.focus.organization_name,
        networkingStore,
      )),
      roles_shortlisted: shortlist.length,
      role_cap: derived.focus.role_cap,
      contacts_approved: approvedCount,
      contacts_review_ready: reviewReadyCount,
      contact_budget: derived.focus.contact_budget,
      research_pending: Boolean(pendingOrder),
      outreach_today: derived.focus.outreach_count_today,
      daily_outreach_cap: derived.focus.daily_outreach_cap,
      playbook_step: derived.focus.playbook_step,
      steps: PLAYBOOK_STEPS.filter(step => step !== 'done_for_today'),
    },
  };
}

export function pinCompanyFocus(input = {}, filePath = CANONICAL_COMPANY_FOCUS_FILE) {
  const existing = readCompanyFocus(filePath);
  const organizationName = cleanText(input.organization_name || input.name || input.company);
  let organizationId = cleanText(input.organization_id);
  if (!organizationId && organizationName) {
    const found = findNetworkingOrganization(organizationName);
    if (found) organizationId = found.id;
  }
  if (!organizationId && !organizationName) {
    throw new Error('pin requires organization_id or organization_name');
  }
  const next = writeCompanyFocus({
    ...existing,
    organization_id: organizationId || existing.organization_id,
    organization_name: organizationName || existing.organization_name,
    location_bias: cleanText(input.location_bias) || existing.location_bias || 'Ann Arbor, MI',
    role_lane: cleanText(input.role_lane) || existing.role_lane || 'ann-arbor-hardware-instrumentation',
    shortlisted_job_ids: input.shortlisted_job_ids !== undefined
      ? cleanArray(input.shortlisted_job_ids)
      : existing.shortlisted_job_ids,
    contact_budget: input.contact_budget !== undefined
      ? cleanNumber(input.contact_budget, existing.contact_budget)
      : existing.contact_budget,
    role_cap: input.role_cap !== undefined
      ? cleanNumber(input.role_cap, existing.role_cap)
      : existing.role_cap,
    daily_outreach_cap: input.daily_outreach_cap !== undefined
      ? cleanNumber(input.daily_outreach_cap, existing.daily_outreach_cap)
      : existing.daily_outreach_cap,
    playbook_step: 'seed',
    snoozed_until: '',
    skipped_action_keys: [],
  }, filePath);
  syncCompanyFocusToDashboard({ sourcePath: filePath });
  return buildCompanyFocusReadModel({ focus: next });
}

export function updateCompanyFocus(updates = {}, filePath = CANONICAL_COMPANY_FOCUS_FILE) {
  const existing = readCompanyFocus(filePath);
  const merged = {
    ...existing,
    ...updates,
    shortlisted_job_ids: updates.shortlisted_job_ids !== undefined
      ? cleanArray(updates.shortlisted_job_ids).slice(0, cleanNumber(updates.role_cap, existing.role_cap))
      : existing.shortlisted_job_ids,
  };
  const next = writeCompanyFocus(merged, filePath);
  syncCompanyFocusToDashboard({ sourcePath: filePath });
  return buildCompanyFocusReadModel({ focus: next });
}

export function advanceCompanyFocus(input = {}, filePath = CANONICAL_COMPANY_FOCUS_FILE) {
  const actionName = cleanText(input.action || 'done').toLowerCase();
  let focus = refreshOutreachCounters(readCompanyFocus(filePath));
  const model = buildCompanyFocusReadModel({ focus });
  const current = model.next_action || emptyNextAction();

  if (actionName === 'snooze') {
    const hours = Math.max(1, cleanNumber(input.hours, 4));
    const until = new Date(Date.now() + hours * 3_600_000).toISOString();
    focus = writeCompanyFocus({ ...focus, snoozed_until: until }, filePath);
  } else if (actionName === 'skip') {
    const key = actionKey(current);
    focus = writeCompanyFocus({
      ...focus,
      skipped_action_keys: [...(focus.skipped_action_keys || []), key].slice(-40),
    }, filePath);
  } else if (actionName === 'clear_snooze') {
    focus = writeCompanyFocus({ ...focus, snoozed_until: '' }, filePath);
  } else {
    // done
    const patch = { ...focus, snoozed_until: '' };
    if (current.type === 'outreach' || current.type === 'follow_up') {
      patch.outreach_count_today = Number(focus.outreach_count_today || 0) + 1;
      patch.outreach_day_key = localDayKey();
      patch.last_outreach_at = new Date().toISOString();
    }
    if (current.type === 'triage_roles' && Array.isArray(input.shortlisted_job_ids)) {
      patch.shortlisted_job_ids = cleanArray(input.shortlisted_job_ids).slice(0, focus.role_cap);
    }
    focus = writeCompanyFocus(patch, filePath);
  }

  syncCompanyFocusToDashboard({ sourcePath: filePath });
  return buildCompanyFocusReadModel({ focus: readCompanyFocus(filePath) });
}
