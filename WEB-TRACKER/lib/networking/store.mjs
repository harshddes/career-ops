import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { atomicWrite, compactJsonLine } from '../atomic-write.mjs';
import {
  canonicalizeExternalUrl,
  findDuplicateCandidates,
  normalizeEmail,
  normalizeGmailThreadUrl,
  normalizeName,
} from './identity.mjs';
import { rankNetworkingTasks } from './priority.mjs';
import {
  NETWORKING_CHANNELS,
  deriveNextNetworkingAction,
  enforceOutreachGuardrails,
  normalizeChannelState,
  normalizeRelationshipStage,
  normalizeReviewState,
  normalizeTaskState,
} from './workflow.mjs';
import {
  inferCareerDomainsFromOrg,
  normalizeCareerDomains,
} from '../career-domains.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const WEB_TRACKER_DIR = join(LIB_DIR, '..', '..');
export const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
export const CANONICAL_NETWORKING_FILE = process.env.NETWORKING_DATA_FILE
  || join(CAREER_OPS_DIR, 'data', 'networking.json');
export const DASHBOARD_NETWORKING_FILE = process.env.NETWORKING_DASHBOARD_FILE
  || join(WEB_TRACKER_DIR, 'data', 'networking.json');

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanLongText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function cleanNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanBoolean(value) {
  return value === true || value === 'true' || value === 1;
}

function cleanArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))];
}

function slugify(value) {
  return cleanText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function normalizeSourceRefs(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map((source, index) => {
      if (!source || typeof source !== 'object') return null;
      const url = canonicalizeExternalUrl(source.url);
      const observedValue = cleanText(source.observed_value || source.value);
      if (!url && !observedValue) return null;
      return {
        id: cleanText(source.id) || `source-${index + 1}-${slugify(url || observedValue).slice(0, 40)}`,
        field: cleanText(source.field),
        observed_value: observedValue,
        url,
        title: cleanText(source.title),
        source_type: cleanText(source.source_type || source.type || 'manual'),
        captured_at: cleanText(source.captured_at) || new Date().toISOString(),
        last_verified_at: cleanText(source.last_verified_at),
        confidence: Math.max(0, Math.min(1, cleanNumber(source.confidence, 0.5))),
      };
    })
    .filter(Boolean);
}

function normalizeOrganizationUnits(value = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map((unit, index) => {
      if (!unit || typeof unit !== 'object') return null;
      const name = cleanText(unit.name);
      if (!name) return null;
      return {
        id: cleanText(unit.id) || `network-unit-${slugify(name) || index + 1}`,
        name,
        parent_id: cleanText(unit.parent_id),
        focus: cleanText(unit.focus),
        source_url: canonicalizeExternalUrl(unit.source_url),
      };
    })
    .filter(Boolean);
}

function normalizeChannelStates(value = {}, previous = {}) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const prior = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
  const result = {};
  for (const channel of NETWORKING_CHANNELS) {
    const raw = input[channel] && typeof input[channel] === 'object' ? input[channel] : {};
    const before = prior[channel] && typeof prior[channel] === 'object' ? prior[channel] : {};
    const profileUrl = channel === 'gmail'
      ? ''
      : canonicalizeExternalUrl(raw.profile_url ?? before.profile_url);
    const threadInput = raw.thread_url ?? before.thread_url;
    const threadUrl = channel === 'gmail'
      ? normalizeGmailThreadUrl(threadInput)
      : canonicalizeExternalUrl(threadInput);
    const hasData = Object.keys(raw).length || Object.keys(before).length;
    if (!hasData) continue;
    result[channel] = {
      state: normalizeChannelState(raw.state ?? before.state),
      profile_url: profileUrl,
      thread_url: threadUrl,
      last_touch_at: cleanText(raw.last_touch_at ?? before.last_touch_at),
      next_permitted_touch_at: cleanText(raw.next_permitted_touch_at ?? before.next_permitted_touch_at),
      unanswered_followups: Math.max(0, cleanNumber(raw.unanswered_followups ?? before.unanswered_followups, 0)),
      notes: cleanLongText(raw.notes ?? before.notes),
    };
  }
  return result;
}

export function networkingOrganizationId(name) {
  const slug = slugify(name);
  return `network-org-${slug || Date.now()}`;
}

export function networkingPersonId(name, organization = '') {
  const slug = slugify([name, organization].filter(Boolean).join('-'));
  return `network-person-${slug || Date.now()}`;
}

export function normalizeNetworkingOrganization(raw = {}, { previous = null } = {}) {
  const name = cleanText(raw.name ?? previous?.name);
  const id = cleanText(raw.id) || previous?.id || networkingOrganizationId(name);
  const now = new Date().toISOString();
  const explicitDomains = raw.career_domains !== undefined
    ? normalizeCareerDomains(raw.career_domains)
    : (previous?.career_domains !== undefined ? normalizeCareerDomains(previous.career_domains) : null);
  const careerDomains = explicitDomains && explicitDomains.length
    ? explicitDomains
    : inferCareerDomainsFromOrg({
      name,
      tags: cleanArray(raw.tags ?? previous?.tags),
      notes: cleanLongText(raw.notes ?? previous?.notes),
      feasibility_notes: cleanLongText(raw.feasibility_notes ?? previous?.feasibility_notes),
      career_domains: previous?.career_domains,
    });
  return {
    id,
    name,
    normalized_name: normalizeName(name),
    aliases: cleanArray(raw.aliases ?? previous?.aliases),
    domain: cleanText(raw.domain ?? previous?.domain).toLowerCase(),
    website: canonicalizeExternalUrl(raw.website ?? previous?.website),
    tier: cleanText(raw.tier ?? previous?.tier),
    strategy_status: cleanText((raw.strategy_status ?? previous?.strategy_status) || 'active'),
    locations: cleanArray(raw.locations ?? previous?.locations),
    tags: cleanArray(raw.tags ?? previous?.tags),
    career_domains: careerDomains,
    opportunity_ids: cleanArray(raw.opportunity_ids ?? previous?.opportunity_ids),
    organization_units: normalizeOrganizationUnits(raw.organization_units ?? previous?.organization_units),
    feasibility_label: cleanText(raw.feasibility_label ?? previous?.feasibility_label),
    feasibility_notes: cleanLongText(raw.feasibility_notes ?? previous?.feasibility_notes),
    notes: cleanLongText(raw.notes ?? previous?.notes),
    source_refs: normalizeSourceRefs(raw.source_refs ?? previous?.source_refs),
    created_at: cleanText(raw.created_at || previous?.created_at || now),
    updated_at: cleanText(raw.updated_at || now),
  };
}

export function normalizeNetworkingPerson(raw = {}, { previous = null } = {}) {
  const displayName = cleanText(raw.display_name || raw.name || previous?.display_name);
  const organization = cleanText(raw.current_organization ?? raw.organization ?? previous?.current_organization);
  const id = cleanText(raw.id) || previous?.id || networkingPersonId(displayName, organization);
  const now = new Date().toISOString();
  const gmailInput = raw.gmail_thread_url ?? previous?.gmail_thread_url;
  const gmailThreadUrl = normalizeGmailThreadUrl(gmailInput);
  if (cleanText(gmailInput) && !gmailThreadUrl) {
    throw new Error('Gmail thread URL must use https://mail.google.com');
  }
  const channelStates = normalizeChannelStates(
    raw.channel_states === undefined ? previous?.channel_states : raw.channel_states,
    previous?.channel_states,
  );
  if (gmailThreadUrl) {
    channelStates.gmail = {
      ...(channelStates.gmail || {
        state: 'available',
        profile_url: '',
        last_touch_at: '',
        next_permitted_touch_at: '',
        unanswered_followups: 0,
        notes: '',
      }),
      thread_url: gmailThreadUrl,
    };
  }
  const relationshipStage = normalizeRelationshipStage(raw.relationship_stage ?? previous?.relationship_stage);
  const doNotContact = cleanBoolean(raw.do_not_contact ?? previous?.do_not_contact)
    || relationshipStage === 'do_not_contact';

  return {
    id,
    display_name: displayName,
    normalized_name: normalizeName(displayName),
    title: cleanText(raw.title ?? previous?.title),
    headline: cleanText(raw.headline ?? previous?.headline),
    current_organization_id: cleanText(raw.current_organization_id ?? previous?.current_organization_id),
    current_organization: organization,
    organization_unit: cleanText(raw.organization_unit ?? previous?.organization_unit),
    location: cleanText(raw.location ?? previous?.location),
    personas: cleanArray(raw.personas ?? previous?.personas),
    affinity_tags: cleanArray(raw.affinity_tags ?? previous?.affinity_tags),
    relationship_stage: doNotContact ? 'do_not_contact' : relationshipStage,
    relationship_strength: Math.max(0, Math.min(1, cleanNumber(raw.relationship_strength ?? previous?.relationship_strength, 0))),
    path_strength: Math.max(0, Math.min(1, cleanNumber(raw.path_strength ?? previous?.path_strength, 0))),
    fit_score: Math.max(0, Math.min(5, cleanNumber(raw.fit_score ?? previous?.fit_score, 0))),
    fit_reasons: cleanArray(raw.fit_reasons ?? previous?.fit_reasons),
    linkedin_degree_observed: cleanText(raw.linkedin_degree_observed ?? previous?.linkedin_degree_observed),
    linkedin_degree_observed_at: cleanText(raw.linkedin_degree_observed_at ?? previous?.linkedin_degree_observed_at),
    introduced_by_person_id: cleanText(raw.introduced_by_person_id ?? previous?.introduced_by_person_id),
    email: normalizeEmail(raw.email ?? previous?.email),
    linkedin_url: canonicalizeExternalUrl(raw.linkedin_url ?? previous?.linkedin_url),
    github_url: canonicalizeExternalUrl(raw.github_url ?? previous?.github_url),
    x_url: canonicalizeExternalUrl(raw.x_url ?? previous?.x_url),
    bluesky_url: canonicalizeExternalUrl(raw.bluesky_url ?? previous?.bluesky_url),
    mastodon_url: canonicalizeExternalUrl(raw.mastodon_url ?? previous?.mastodon_url),
    gmail_thread_url: gmailThreadUrl,
    channel_states: channelStates,
    opportunity_ids: cleanArray(raw.opportunity_ids ?? previous?.opportunity_ids),
    event_ids: cleanArray(raw.event_ids ?? previous?.event_ids),
    notes: cleanLongText(raw.notes ?? previous?.notes),
    source_refs: normalizeSourceRefs(raw.source_refs ?? previous?.source_refs),
    last_interaction_at: cleanText(raw.last_interaction_at ?? previous?.last_interaction_at),
    next_action_id: cleanText(raw.next_action_id ?? previous?.next_action_id),
    no_action_reason: cleanText(raw.no_action_reason ?? previous?.no_action_reason),
    do_not_contact: doNotContact,
    review_status: normalizeReviewState(raw.review_status ?? previous?.review_status),
    merged_into_id: cleanText(raw.merged_into_id ?? previous?.merged_into_id),
    created_at: cleanText(raw.created_at || previous?.created_at || now),
    updated_at: cleanText(raw.updated_at || now),
  };
}

function normalizeAffiliation(raw = {}) {
  const personId = cleanText(raw.person_id);
  const organizationId = cleanText(raw.organization_id);
  return {
    id: cleanText(raw.id) || `affiliation-${slugify(`${personId}-${organizationId}-${raw.title || ''}`)}`,
    person_id: personId,
    organization_id: organizationId,
    organization_name: cleanText(raw.organization_name),
    title: cleanText(raw.title),
    department: cleanText(raw.department),
    relationship_type: cleanText(raw.relationship_type || 'employment'),
    started_at: cleanText(raw.started_at),
    ended_at: cleanText(raw.ended_at),
    is_current: raw.is_current !== false,
    source: cleanText(raw.source || 'manual'),
    confidence: Math.max(0, Math.min(1, cleanNumber(raw.confidence, 0.5))),
  };
}

function normalizeEdge(raw = {}) {
  const from = cleanText(raw.from_person_id || 'self');
  const to = cleanText(raw.to_person_id);
  return {
    id: cleanText(raw.id) || `edge-${slugify(`${from}-${to}-${raw.type || 'knows'}`)}`,
    from_person_id: from,
    to_person_id: to,
    type: cleanText(raw.type || 'knows'),
    strength: Math.max(0, Math.min(1, cleanNumber(raw.strength, 0.5))),
    confidence: Math.max(0, Math.min(1, cleanNumber(raw.confidence, 0.5))),
    source: cleanText(raw.source || 'manual'),
    source_url: canonicalizeExternalUrl(raw.source_url),
    notes: cleanLongText(raw.notes),
    created_at: cleanText(raw.created_at) || new Date().toISOString(),
  };
}

function normalizeInteraction(raw = {}) {
  const now = new Date().toISOString();
  const gmailInput = raw.gmail_thread_url || (raw.channel === 'gmail' ? raw.thread_url : '');
  const gmailThreadUrl = normalizeGmailThreadUrl(gmailInput);
  if (cleanText(gmailInput) && !gmailThreadUrl) {
    throw new Error('Gmail thread URL must use https://mail.google.com');
  }
  return {
    id: cleanText(raw.id) || `interaction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    person_id: cleanText(raw.person_id),
    organization_id: cleanText(raw.organization_id),
    opportunity_ids: cleanArray(raw.opportunity_ids),
    event_id: cleanText(raw.event_id),
    type: cleanText(raw.type || 'note'),
    direction: cleanText(raw.direction || 'outbound'),
    channel: cleanText(raw.channel || 'note').toLowerCase(),
    occurred_at: cleanText(raw.occurred_at || now),
    subject: cleanText(raw.subject),
    summary: cleanLongText(raw.summary),
    gmail_thread_url: gmailThreadUrl,
    source: cleanText(raw.source || 'manual'),
    created_at: cleanText(raw.created_at || now),
  };
}

function normalizeTask(raw = {}, { previous = null } = {}) {
  const now = new Date().toISOString();
  return {
    id: cleanText(raw.id) || previous?.id || `network-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    person_id: cleanText(raw.person_id ?? previous?.person_id),
    organization_id: cleanText(raw.organization_id ?? previous?.organization_id),
    opportunity_ids: cleanArray(raw.opportunity_ids ?? previous?.opportunity_ids),
    action_type: cleanText((raw.action_type ?? previous?.action_type) || 'follow_up'),
    subject: cleanText((raw.subject ?? previous?.subject) || 'Networking next action'),
    state: normalizeTaskState(raw.state ?? previous?.state),
    due_at: cleanText(raw.due_at ?? previous?.due_at),
    remind_at: cleanText(raw.remind_at ?? previous?.remind_at),
    waiting_until: cleanText(raw.waiting_until ?? previous?.waiting_until),
    snoozed_until: cleanText(raw.snoozed_until ?? previous?.snoozed_until),
    blocked_reason: cleanText(raw.blocked_reason ?? previous?.blocked_reason),
    completed_at: cleanText(raw.completed_at ?? previous?.completed_at),
    outcome_value: cleanOptionalNumber(raw.outcome_value ?? previous?.outcome_value),
    relationship_momentum: cleanOptionalNumber(raw.relationship_momentum ?? previous?.relationship_momentum),
    path_quality: cleanOptionalNumber(raw.path_quality ?? previous?.path_quality),
    readiness: cleanOptionalNumber(raw.readiness ?? previous?.readiness),
    freshness: cleanOptionalNumber(raw.freshness ?? previous?.freshness),
    unanswered_followups: Math.max(0, cleanNumber(raw.unanswered_followups ?? previous?.unanswered_followups, 0)),
    notes: cleanLongText(raw.notes ?? previous?.notes),
    created_at: cleanText(raw.created_at || previous?.created_at || now),
    updated_at: cleanText(raw.updated_at || now),
  };
}

function normalizeEvent(raw = {}, { previous = null } = {}) {
  const now = new Date().toISOString();
  return {
    id: cleanText(raw.id) || previous?.id || `network-event-${slugify(raw.name || Date.now())}`,
    name: cleanText(raw.name ?? previous?.name),
    organization_id: cleanText(raw.organization_id ?? previous?.organization_id),
    url: canonicalizeExternalUrl(raw.url ?? previous?.url),
    starts_at: cleanText(raw.starts_at ?? previous?.starts_at),
    ends_at: cleanText(raw.ends_at ?? previous?.ends_at),
    location: cleanText(raw.location ?? previous?.location),
    status: cleanText((raw.status ?? previous?.status) || 'upcoming'),
    person_ids: cleanArray(raw.person_ids ?? previous?.person_ids),
    notes: cleanLongText(raw.notes ?? previous?.notes),
    created_at: cleanText(raw.created_at || previous?.created_at || now),
    updated_at: cleanText(raw.updated_at || now),
  };
}

function emptyStore() {
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    scope: 'Private local networking command center',
    organizations: [],
    people: [],
    affiliations: [],
    edges: [],
    interactions: [],
    tasks: [],
    events: [],
  };
}

function summarize(store) {
  const now = Date.now();
  const activeTasks = store.tasks.filter(task => ['open', 'waiting', 'snoozed', 'blocked'].includes(task.state));
  return {
    organizations: store.organizations.length,
    people: store.people.filter(person => !person.merged_into_id).length,
    active_relationships: store.people.filter(person => !['archived', 'declined', 'do_not_contact'].includes(person.relationship_stage)).length,
    warm_relationships: store.people.filter(person => ['warm', 'referral_eligible', 'referred'].includes(person.relationship_stage)).length,
    active_tasks: activeTasks.length,
    overdue_tasks: activeTasks.filter(task => task.due_at && Date.parse(task.due_at) < now).length,
    conversations: store.interactions.filter(item => ['conversation', 'meeting', 'call'].includes(item.type)).length,
    referrals: store.people.filter(person => person.relationship_stage === 'referred').length,
    upcoming_events: store.events.filter(event => event.status === 'upcoming' && (!event.starts_at || Date.parse(event.starts_at) >= now)).length,
  };
}

export function readNetworking(filePath = CANONICAL_NETWORKING_FILE) {
  if (!existsSync(filePath)) {
    const store = emptyStore();
    return { ...store, summary: summarize(store) };
  }
  const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
  const store = {
    ...emptyStore(),
    ...parsed,
    version: 1,
    organizations: Array.isArray(parsed.organizations) ? parsed.organizations.map(item => normalizeNetworkingOrganization(item)) : [],
    people: Array.isArray(parsed.people) ? parsed.people.map(item => normalizeNetworkingPerson(item)) : [],
    affiliations: Array.isArray(parsed.affiliations) ? parsed.affiliations.map(normalizeAffiliation) : [],
    edges: Array.isArray(parsed.edges) ? parsed.edges.map(normalizeEdge) : [],
    interactions: Array.isArray(parsed.interactions) ? parsed.interactions.map(normalizeInteraction) : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks.map(item => normalizeTask(item)) : [],
    events: Array.isArray(parsed.events) ? parsed.events.map(item => normalizeEvent(item)) : [],
  };
  return { ...store, summary: summarize(store) };
}

export function writeNetworking(store, filePath = CANONICAL_NETWORKING_FILE) {
  const next = {
    version: 1,
    generated_at: new Date().toISOString(),
    scope: 'Private local networking command center',
    organizations: (store.organizations || []).map(item => normalizeNetworkingOrganization(item)).sort((a, b) => a.name.localeCompare(b.name)),
    people: (store.people || []).map(item => normalizeNetworkingPerson(item)).sort((a, b) => a.display_name.localeCompare(b.display_name)),
    affiliations: (store.affiliations || []).map(normalizeAffiliation),
    edges: (store.edges || []).map(normalizeEdge),
    interactions: (store.interactions || []).map(normalizeInteraction).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    tasks: (store.tasks || []).map(item => normalizeTask(item)),
    events: (store.events || []).map(item => normalizeEvent(item)).sort((a, b) => String(a.starts_at || '9999').localeCompare(String(b.starts_at || '9999'))),
  };
  next.summary = summarize(next);
  atomicWrite(filePath, compactJsonLine(next));
  return next;
}

export function syncNetworkingToDashboard({
  sourcePath = CANONICAL_NETWORKING_FILE,
  outputPath = DASHBOARD_NETWORKING_FILE,
  write = false,
} = {}) {
  const store = readNetworking(sourcePath);
  const output = {
    ...store,
    generated_at: new Date().toISOString(),
    local_only: true,
    source: sourcePath,
  };
  if (write) atomicWrite(outputPath, compactJsonLine(output));
  return output;
}

export function findNetworkingPerson(idOrEmail, store = readNetworking()) {
  const needle = cleanText(idOrEmail).toLowerCase();
  return store.people.find(person => (
    person.id.toLowerCase() === needle
    || person.email === needle
    || person.linkedin_url.toLowerCase() === needle
  )) || null;
}

export function findNetworkingOrganization(idOrName, store = readNetworking()) {
  const needle = cleanText(idOrName).toLowerCase();
  return store.organizations.find(organization => (
    organization.id.toLowerCase() === needle
    || organization.normalized_name === normalizeName(needle)
  )) || null;
}

export function upsertNetworkingOrganization(raw = {}, filePath = CANONICAL_NETWORKING_FILE) {
  const store = readNetworking(filePath);
  const incoming = normalizeNetworkingOrganization(raw);
  if (!incoming.name) throw new Error('networking organization requires name');
  const index = store.organizations.findIndex(item => item.id === incoming.id || item.normalized_name === incoming.normalized_name);
  if (index < 0) {
    store.organizations.push(incoming);
  } else {
    const previous = store.organizations[index];
    // Union domains on update so research-queue / partial patches never wipe island membership.
    let mergedDomains = raw.career_domains !== undefined
      ? [...new Set([
        ...normalizeCareerDomains(previous.career_domains),
        ...normalizeCareerDomains(raw.career_domains),
      ])]
      : normalizeCareerDomains(previous.career_domains);
    if (mergedDomains.length > 1) {
      mergedDomains = mergedDomains.filter(domain => domain !== 'unassigned');
    }
    store.organizations[index] = normalizeNetworkingOrganization({
      ...previous,
      ...raw,
      id: previous.id,
      career_domains: mergedDomains.length ? mergedDomains : inferCareerDomainsFromOrg({
        ...previous,
        ...raw,
      }),
    }, { previous });
  }
  const next = writeNetworking(store, filePath);
  if (filePath === CANONICAL_NETWORKING_FILE) {
    try { syncNetworkingToDashboard({ sourcePath: filePath }); } catch { /* non-fatal */ }
  }
  return { store: next, organization: findNetworkingOrganization(incoming.id, next) || findNetworkingOrganization(incoming.name, next) };
}

export function upsertNetworkingPerson(raw = {}, filePath = CANONICAL_NETWORKING_FILE) {
  const store = readNetworking(filePath);
  const incoming = normalizeNetworkingPerson(raw);
  if (!incoming.display_name) throw new Error('networking person requires display_name');
  const duplicates = findDuplicateCandidates(incoming, store.people);
  const deterministic = duplicates.find(candidate => candidate.score >= 0.98);
  const index = store.people.findIndex(item => item.id === incoming.id || item.id === deterministic?.person_id);
  if (index < 0) {
    store.people.push({
      ...incoming,
      review_status: duplicates.length ? 'duplicate_review' : incoming.review_status,
    });
  } else {
    const previous = store.people[index];
    store.people[index] = normalizeNetworkingPerson({
      ...previous,
      ...raw,
      id: previous.id,
      channel_states: raw.channel_states === undefined
        ? previous.channel_states
        : { ...(previous.channel_states || {}), ...(raw.channel_states || {}) },
      source_refs: raw.source_refs === undefined
        ? previous.source_refs
        : [...(previous.source_refs || []), ...(raw.source_refs || [])],
    }, { previous });
  }
  const next = writeNetworking(store, filePath);
  const person = findNetworkingPerson(index < 0 ? incoming.id : store.people[index].id, next);
  return { store: next, person, duplicate_candidates: findDuplicateCandidates(person, next.people) };
}

export function patchNetworkingPerson(id, updates = {}, filePath = CANONICAL_NETWORKING_FILE) {
  const store = readNetworking(filePath);
  const index = store.people.findIndex(person => person.id === id);
  if (index < 0) throw new Error(`Networking person not found: ${id}`);
  const previous = store.people[index];
  if (updates.review_status && updates.review_status !== previous.review_status) {
    throw new Error('Use the candidate review action to approve or reject a researched person.');
  }
  const protectedStages = new Set([
    'outreach_ready',
    'contacted',
    'engaged',
    'conversation',
    'warm',
    'referral_eligible',
    'referred',
  ]);
  const nextStage = updates.relationship_stage === undefined
    ? previous.relationship_stage
    : updates.relationship_stage;
  const movingIntoProtected = protectedStages.has(nextStage)
    && nextStage !== previous.relationship_stage;
  const explicitKanbanMove = updates.approve_on_stage_move === true
    || updates.confirm_stage_move === true;
  // Strip UI-only flags before merge so they never persist on the person record.
  const {
    approve_on_stage_move: _approveOnStageMove,
    confirm_stage_move: _confirmStageMove,
    ...persistedUpdates
  } = updates;

  let reviewStatus = previous.review_status;
  if (movingIntoProtected && previous.review_status !== 'approved') {
    if (!explicitKanbanMove) {
      throw new Error('Approve this researched candidate before moving them into outreach.');
    }
    // Explicit Kanban/stage dropdown moves count as human approval of that person.
    reviewStatus = 'approved';
  }

  store.people[index] = normalizeNetworkingPerson({
    ...previous,
    ...persistedUpdates,
    id: previous.id,
    review_status: reviewStatus,
    channel_states: persistedUpdates.channel_states === undefined
      ? previous.channel_states
      : { ...(previous.channel_states || {}), ...(persistedUpdates.channel_states || {}) },
    source_refs: persistedUpdates.source_refs === undefined ? previous.source_refs : persistedUpdates.source_refs,
    updated_at: new Date().toISOString(),
  }, { previous });
  const next = writeNetworking(store, filePath);
  const person = findNetworkingPerson(previous.id, next);
  return { store: next, person, duplicate_candidates: findDuplicateCandidates(person, next.people) };
}

export function reviewNetworkingPerson(id, action, filePath = CANONICAL_NETWORKING_FILE) {
  const store = readNetworking(filePath);
  const index = store.people.findIndex(person => person.id === id);
  if (index < 0) throw new Error(`Networking person not found: ${id}`);
  if (!['approve', 'reject'].includes(action)) {
    throw new Error('Candidate review action must be approve or reject.');
  }
  const previous = store.people[index];
  if (previous.review_status !== 'review_ready') {
    throw new Error('Only review-ready candidates can be approved or rejected.');
  }
  const approved = action === 'approve';
  const relationshipStage = approved && ['identified', 'researching'].includes(previous.relationship_stage)
    ? 'qualified'
    : approved
      ? previous.relationship_stage
      : 'archived';
  store.people[index] = normalizeNetworkingPerson({
    ...previous,
    review_status: approved ? 'approved' : 'rejected',
    relationship_stage: relationshipStage,
    no_action_reason: approved ? '' : 'Rejected during candidate review',
    updated_at: new Date().toISOString(),
  }, { previous });
  const next = writeNetworking(store, filePath);
  return { store: next, person: findNetworkingPerson(id, next) };
}

export function deleteNetworkingPerson(id, filePath = CANONICAL_NETWORKING_FILE) {
  const store = readNetworking(filePath);
  const person = store.people.find(item => item.id === id);
  if (!person) throw new Error(`Networking person not found: ${id}`);
  store.people = store.people.filter(item => item.id !== id);
  store.affiliations = store.affiliations.filter(item => item.person_id !== id);
  store.edges = store.edges.filter(item => item.from_person_id !== id && item.to_person_id !== id);
  store.interactions = store.interactions.filter(item => item.person_id !== id);
  store.tasks = store.tasks.filter(item => item.person_id !== id);
  const next = writeNetworking(store, filePath);
  return { store: next, person };
}

export function upsertNetworkingEdge(raw = {}, filePath = CANONICAL_NETWORKING_FILE) {
  const store = readNetworking(filePath);
  const edge = normalizeEdge(raw);
  if (!edge.to_person_id) throw new Error('networking edge requires to_person_id');
  const index = store.edges.findIndex(item => item.id === edge.id);
  if (index < 0) store.edges.push(edge);
  else store.edges[index] = edge;
  return { store: writeNetworking(store, filePath), edge };
}

export function appendNetworkingInteraction(raw = {}, filePath = CANONICAL_NETWORKING_FILE) {
  const store = readNetworking(filePath);
  const interaction = normalizeInteraction(raw);
  if (!interaction.person_id) throw new Error('networking interaction requires person_id');
  const personIndex = store.people.findIndex(person => person.id === interaction.person_id);
  if (personIndex < 0) throw new Error(`Networking person not found: ${interaction.person_id}`);
  const person = store.people[personIndex];
  const isOutboundContact = interaction.direction === 'outbound'
    && interaction.channel !== 'note'
    && interaction.type !== 'note';
  if (isOutboundContact) {
    const guardrail = enforceOutreachGuardrails(person, interaction);
    if (!guardrail.allowed) throw new Error(guardrail.reason);
  }
  store.interactions.unshift(interaction);
  const channel = interaction.channel;
  const channelStates = { ...(person.channel_states || {}) };
  if (NETWORKING_CHANNELS.includes(channel)) {
    const previousChannel = channelStates[channel] || {};
    channelStates[channel] = {
      ...previousChannel,
      state: interaction.direction === 'inbound' ? 'replied' : 'contacted',
      last_touch_at: interaction.occurred_at,
      thread_url: interaction.gmail_thread_url || previousChannel.thread_url || '',
      unanswered_followups: interaction.direction === 'inbound'
        ? 0
        : Number(previousChannel.unanswered_followups || 0) + (interaction.type === 'follow_up' ? 1 : 0),
    };
  }
  const stageOrder = [
    'identified',
    'researching',
    'qualified',
    'outreach_ready',
    'contacted',
    'engaged',
    'conversation',
    'warm',
    'referral_eligible',
    'referred',
  ];
  const currentIndex = stageOrder.indexOf(person.relationship_stage);
  const isConversation = ['conversation', 'meeting', 'call'].includes(interaction.type);
  let stage = person.relationship_stage;
  if (isConversation) {
    const target = ['engaged', 'conversation'].includes(person.relationship_stage) ? 'warm' : 'conversation';
    if (currentIndex < stageOrder.indexOf(target)) stage = target;
  } else if (interaction.direction === 'inbound') {
    if (currentIndex < stageOrder.indexOf('engaged')) stage = 'engaged';
  } else if (isOutboundContact && currentIndex < stageOrder.indexOf('contacted')) {
    stage = 'contacted';
  }
  store.people[personIndex] = normalizeNetworkingPerson({
    ...person,
    relationship_stage: stage,
    channel_states: channelStates,
    gmail_thread_url: interaction.gmail_thread_url || person.gmail_thread_url,
    last_interaction_at: interaction.occurred_at,
  }, { previous: person });
  const next = writeNetworking(store, filePath);
  return { store: next, interaction, person: findNetworkingPerson(person.id, next) };
}

export function upsertNetworkingTask(raw = {}, filePath = CANONICAL_NETWORKING_FILE) {
  const store = readNetworking(filePath);
  const incoming = normalizeTask(raw);
  if (!incoming.person_id && !incoming.organization_id) throw new Error('networking task requires person_id or organization_id');
  const index = store.tasks.findIndex(task => task.id === incoming.id);
  if (index < 0) store.tasks.push(incoming);
  else store.tasks[index] = normalizeTask({ ...store.tasks[index], ...raw }, { previous: store.tasks[index] });
  const next = writeNetworking(store, filePath);
  return { store: next, task: next.tasks.find(task => task.id === incoming.id) };
}

export function patchNetworkingTask(id, updates = {}, filePath = CANONICAL_NETWORKING_FILE) {
  const store = readNetworking(filePath);
  const index = store.tasks.findIndex(task => task.id === id);
  if (index < 0) throw new Error(`Networking task not found: ${id}`);
  const previous = store.tasks[index];
  const completedAt = updates.state === 'completed' && !updates.completed_at
    ? new Date().toISOString()
    : updates.completed_at;
  store.tasks[index] = normalizeTask({
    ...previous,
    ...updates,
    completed_at: completedAt ?? previous.completed_at,
    updated_at: new Date().toISOString(),
  }, { previous });
  const next = writeNetworking(store, filePath);
  return { store: next, task: next.tasks.find(task => task.id === id) };
}

export function upsertNetworkingEvent(raw = {}, filePath = CANONICAL_NETWORKING_FILE) {
  const store = readNetworking(filePath);
  const incoming = normalizeEvent(raw);
  if (!incoming.name) throw new Error('networking event requires name');
  const index = store.events.findIndex(event => event.id === incoming.id);
  if (index < 0) store.events.push(incoming);
  else store.events[index] = normalizeEvent({ ...store.events[index], ...raw }, { previous: store.events[index] });
  const next = writeNetworking(store, filePath);
  return { store: next, event: next.events.find(event => event.id === incoming.id) };
}

export function buildNetworkingReadModel(store = readNetworking(), now = new Date(), options = {}) {
  const peopleById = Object.fromEntries(store.people.map(person => [person.id, person]));
  const focusOrganizationId = String(options.focus_organization_id || '').trim();
  const contextByTask = Object.fromEntries(store.tasks.map(task => [
    task.id,
    {
      person: peopleById[task.person_id] || {},
      focus_organization_id: focusOrganizationId,
    },
  ]));
  const rankedTasks = rankNetworkingTasks(store.tasks, contextByTask, now);
  const people = store.people.map(person => ({
    ...person,
    next_action: deriveNextNetworkingAction(person, store.tasks, now),
    duplicate_candidates: findDuplicateCandidates(person, store.people),
  }));
  return {
    ...store,
    people,
    ranked_tasks: rankedTasks,
    summary: summarize({ ...store, people }),
    local_only: true,
    focus_organization_id: focusOrganizationId || null,
  };
}
