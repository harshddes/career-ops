import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { findNetworkingOrganization, readNetworking } from './store.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const WEB_TRACKER_DIR = join(LIB_DIR, '..', '..');
export const NETWORKING_RESEARCH_QUEUE_FILE = process.env.NETWORKING_RESEARCH_QUEUE_FILE
  || join(WEB_TRACKER_DIR, 'data', 'networking-research-queue.json');
export const TRIGGER_PHRASE = 'Find new networking contacts';
export const RESEARCH_SOP_REL = 'WEB-TRACKER/lib/networking/NETWORKING_RESEARCH_SOP.md';

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Preserve paragraphs in research briefs; collapse only trailing/leading whitespace per line. */
function cleanNotes(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
    .trim();
}

function cleanArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))];
}

function mergeNotes(existing, incoming) {
  const prev = cleanNotes(existing);
  const next = cleanNotes(incoming);
  if (!next) return prev;
  if (!prev) return next;
  if (prev.includes(next)) return prev;
  return `${prev}\n${next}`;
}

function atomicWrite(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = join(dirname(filePath), `.${basename(filePath)}.tmp-${Date.now()}`);
  writeFileSync(tempPath, content, 'utf-8');
  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'EBUSY'].includes(error?.code)) throw error;
    writeFileSync(filePath, content, 'utf-8');
    try { unlinkSync(tempPath); } catch {}
  }
}

function emptyQueue() {
  return {
    version: 1,
    lane: 'networking-contact-research',
    trigger_phrase: TRIGGER_PHRASE,
    sop: RESEARCH_SOP_REL,
    updated_at: new Date().toISOString(),
    pending_count: 0,
    pending: [],
    completed: [],
  };
}

function normalizeResearchOrder(raw = {}) {
  const now = new Date().toISOString();
  const organizationName = cleanText(raw.organization_name || raw.company);
  return {
    id: cleanText(raw.id) || `network-research-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    organization_id: cleanText(raw.organization_id),
    organization_name: organizationName,
    opportunity_ids: cleanArray(raw.opportunity_ids),
    personas: cleanArray(raw.personas),
    affinity_paths: cleanArray(raw.affinity_paths),
    locations: cleanArray(raw.locations),
    exclusions: cleanArray(raw.exclusions),
    known_person_ids: cleanArray(raw.known_person_ids),
    source_preferences: cleanArray(raw.source_preferences),
    notes: cleanNotes(raw.notes),
    status: ['queued', 'in_progress', 'review_ready', 'completed', 'failed', 'canceled'].includes(raw.status)
      ? raw.status
      : 'queued',
    candidate_person_ids: cleanArray(raw.candidate_person_ids),
    error: cleanText(raw.error),
    created_at: cleanText(raw.created_at || now),
    updated_at: cleanText(raw.updated_at || now),
  };
}

export function readNetworkingResearchQueue(filePath = NETWORKING_RESEARCH_QUEUE_FILE) {
  if (!existsSync(filePath)) return emptyQueue();
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    const pending = Array.isArray(parsed.pending) ? parsed.pending.map(normalizeResearchOrder) : [];
    const completed = Array.isArray(parsed.completed) ? parsed.completed.map(normalizeResearchOrder) : [];
    return {
      ...emptyQueue(),
      ...parsed,
      version: 1,
      lane: 'networking-contact-research',
      trigger_phrase: TRIGGER_PHRASE,
      sop: RESEARCH_SOP_REL,
      pending_count: pending.length,
      pending,
      completed,
    };
  } catch {
    return emptyQueue();
  }
}

export function writeNetworkingResearchQueue(queue, filePath = NETWORKING_RESEARCH_QUEUE_FILE) {
  const pending = (queue.pending || []).map(normalizeResearchOrder);
  const completed = (queue.completed || []).map(normalizeResearchOrder).slice(-250);
  const next = {
    version: 1,
    lane: 'networking-contact-research',
    trigger_phrase: TRIGGER_PHRASE,
    sop: RESEARCH_SOP_REL,
    updated_at: new Date().toISOString(),
    pending_count: pending.length,
    pending,
    completed,
  };
  atomicWrite(filePath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function queueNetworkingResearch(raw = {}, filePath = NETWORKING_RESEARCH_QUEUE_FILE) {
  const queue = readNetworkingResearchQueue(filePath);
  const store = readNetworking();
  const organization = raw.organization_id
    ? findNetworkingOrganization(raw.organization_id, store)
    : findNetworkingOrganization(raw.organization_name || raw.company, store);
  const order = normalizeResearchOrder({
    ...raw,
    organization_id: raw.organization_id || organization?.id || '',
    organization_name: raw.organization_name || raw.company || organization?.name || '',
    known_person_ids: raw.known_person_ids?.length
      ? raw.known_person_ids
      : store.people.filter(person => (
          person.current_organization_id === organization?.id
          || person.current_organization.toLowerCase() === String(organization?.name || '').toLowerCase()
        )).map(person => person.id),
  });
  if (!order.organization_name) throw new Error('networking research order requires organization_name');

  const existingIndex = queue.pending.findIndex(item => (
    item.organization_id && item.organization_id === order.organization_id
    && ['queued', 'in_progress'].includes(item.status)
  ));
  if (existingIndex >= 0) {
    const existing = queue.pending[existingIndex];
    const merged = normalizeResearchOrder({
      ...existing,
      opportunity_ids: [...(existing.opportunity_ids || []), ...(order.opportunity_ids || [])],
      personas: [...(existing.personas || []), ...(order.personas || [])],
      affinity_paths: [...(existing.affinity_paths || []), ...(order.affinity_paths || [])],
      locations: [...(existing.locations || []), ...(order.locations || [])],
      exclusions: [...(existing.exclusions || []), ...(order.exclusions || [])],
      known_person_ids: [...(existing.known_person_ids || []), ...(order.known_person_ids || [])],
      source_preferences: [...(existing.source_preferences || []), ...(order.source_preferences || [])],
      notes: mergeNotes(existing.notes, order.notes),
      updated_at: new Date().toISOString(),
    });
    queue.pending[existingIndex] = merged;
    const next = writeNetworkingResearchQueue(queue, filePath);
    return { queue: next, order: merged, duplicate: true };
  }
  queue.pending.push(order);
  const next = writeNetworkingResearchQueue(queue, filePath);
  return { queue: next, order, duplicate: false };
}

function updateResearchOrder(id, updates, filePath = NETWORKING_RESEARCH_QUEUE_FILE) {
  const queue = readNetworkingResearchQueue(filePath);
  const index = queue.pending.findIndex(item => item.id === id);
  if (index < 0) throw new Error(`Networking research order not found: ${id}`);
  const previous = queue.pending[index];
  const order = normalizeResearchOrder({
    ...previous,
    ...updates,
    id: previous.id,
    updated_at: new Date().toISOString(),
  });
  if (['completed', 'failed', 'canceled'].includes(order.status)) {
    queue.pending.splice(index, 1);
    queue.completed.push(order);
  } else {
    queue.pending[index] = order;
  }
  const next = writeNetworkingResearchQueue(queue, filePath);
  return { queue: next, order };
}

export function markNetworkingResearchInProgress(id, filePath = NETWORKING_RESEARCH_QUEUE_FILE) {
  return updateResearchOrder(id, { status: 'in_progress', error: '' }, filePath);
}

export function markNetworkingResearchReviewReady(id, candidatePersonIds = [], filePath = NETWORKING_RESEARCH_QUEUE_FILE) {
  return updateResearchOrder(id, {
    status: 'review_ready',
    candidate_person_ids: cleanArray(candidatePersonIds),
    error: '',
  }, filePath);
}

export function completeNetworkingResearch(id, { failed = false, error = '' } = {}, filePath = NETWORKING_RESEARCH_QUEUE_FILE) {
  return updateResearchOrder(id, {
    status: failed ? 'failed' : 'completed',
    error: failed ? cleanText(error || 'research failed') : '',
  }, filePath);
}

/** Drop a pending research work order without deleting the organization or people. */
export function cancelNetworkingResearch(id, filePath = NETWORKING_RESEARCH_QUEUE_FILE) {
  return updateResearchOrder(id, {
    status: 'canceled',
    error: '',
  }, filePath);
}
