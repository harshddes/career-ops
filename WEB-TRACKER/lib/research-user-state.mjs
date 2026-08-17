import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { allResearchSources, sourceIdFromProspectsFilename } from './phd-research-sources.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_TRACKER_DIR = join(LIB_DIR, '..');
const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
export const RESEARCH_USER_STATE_FILE = join(CAREER_OPS_DIR, 'data', 'research-prospect-user-state.json');
export const DASHBOARD_RESEARCH_USER_STATE_FILE = join(WEB_TRACKER_DIR, 'data', 'research-prospect-user-state.json');

const USER_STATE_FIELDS = ['status', 'last_contacted', 'last_followed_up', 'follow_up_date', 'notes', 'outreach'];

export const OUTREACH_STAGES = ['your_move', 'their_move', 'next_step_locked', 'finished'];
export const OUTREACH_RAIL_STATUSES = new Set(['contacted', 'followed_up', 'responded_positive']);
// Negatives park in Finished; only these leave the rail entirely.
export const OUTREACH_CLEAR_STATUSES = new Set(['archived', 'not_contacted']);

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanSourceId(value = 'umich') {
  const source = cleanText(value || 'umich').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return source || 'umich';
}

function atomicWrite(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = join(dirname(filePath), `.${basename(filePath)}.tmp-${Date.now()}`);
  writeFileSync(tempPath, content, 'utf-8');
  try {
    renameSync(tempPath, filePath);
  } catch (err) {
    if (!['EPERM', 'EACCES'].includes(err?.code)) throw err;
    writeFileSync(filePath, content, 'utf-8');
    try { unlinkSync(tempPath); } catch {}
  }
}

function emptyUserState() {
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    sources: {},
  };
}

export function normalizeProspectStatus(value = '') {
  let status = cleanText(value || 'not_contacted').toLowerCase();
  if (status === 'responded') status = 'responded_positive';
  // Legacy manual "follow_up" was retired into Contacted; new status is followed_up.
  if (status === 'follow_up') status = 'contacted';
  return status || 'not_contacted';
}

export function normalizeOutreachStage(value = '') {
  let stage = cleanText(value).toLowerCase();
  // Legacy warm-thread strip renamed to a terminal Finished lane.
  if (stage === 'follow_up_due') stage = 'finished';
  return OUTREACH_STAGES.includes(stage) ? stage : '';
}

export function normalizeOutreach(raw) {
  if (raw === null) {
    return { stage: '', stage_updated_at: '', entered_at: '', notes: '' };
  }
  if (!raw || typeof raw !== 'object') {
    return { stage: '', stage_updated_at: '', entered_at: '', notes: '' };
  }
  return {
    stage: normalizeOutreachStage(raw.stage),
    stage_updated_at: cleanText(raw.stage_updated_at),
    entered_at: cleanText(raw.entered_at),
    notes: cleanText(raw.notes),
  };
}

/**
 * Status / stage rules for the research outreach kanban.
 * - Silence nudge → Your move stamps Followed up (follow-up acknowledged).
 * - Your move → Their move keeps Followed up (waiting on reply).
 * - Next step locked → Finished is terminal (no further ask).
 * - Responded negatively parks in Finished (manual override can recover).
 * - Responded positively still auto-enters Your move for warm threads.
 */
export function applyOutreachSemantics({
  status,
  previousStatus,
  currentOutreach = null,
  currentFollowUpDate = '',
  outreachUpdate,
  followUpDateUpdate,
  today = '',
  now = new Date().toISOString(),
} = {}) {
  const normalizedStatus = normalizeProspectStatus(status);
  const priorStatus = normalizeProspectStatus(previousStatus ?? status);
  const previous = normalizeOutreach(currentOutreach);
  const explicitlyManagingOutreach = outreachUpdate !== undefined;
  let outreach = explicitlyManagingOutreach
    ? normalizeOutreach(outreachUpdate === null ? null : { ...previous, ...outreachUpdate })
    : { ...previous };

  if (explicitlyManagingOutreach && outreachUpdate !== null && typeof outreachUpdate === 'object') {
    const requestedStage = normalizeOutreachStage(outreachUpdate.stage);
    if (requestedStage && requestedStage !== previous.stage) {
      outreach.stage = requestedStage;
      outreach.stage_updated_at = now;
      if (!outreach.entered_at) outreach.entered_at = previous.entered_at || now;
    }
    if (outreachUpdate.stage === '' || outreachUpdate.stage === null) {
      outreach.stage = '';
      outreach.stage_updated_at = now;
    }
  }

  // Auto-enter only on transition into positive (or first positive with no outreach field).
  // Explicit Remove-from-rail passes outreach.stage='' and must stay off the rail.
  const becamePositive = normalizedStatus === 'responded_positive' && priorStatus !== 'responded_positive';
  if (
    normalizedStatus === 'responded_positive'
    && !outreach.stage
    && !explicitlyManagingOutreach
    && (becamePositive || !previous.stage_updated_at)
  ) {
    outreach = {
      stage: 'your_move',
      stage_updated_at: now,
      entered_at: previous.entered_at || now,
      notes: outreach.notes || previous.notes || '',
    };
  }

  // Dropdown "Followed up" with empty or Finished stage → Their move (undo from Finished).
  const becameFollowedUp = normalizedStatus === 'followed_up' && priorStatus !== 'followed_up';
  if (
    normalizedStatus === 'followed_up'
    && !explicitlyManagingOutreach
    && becameFollowedUp
    && (!outreach.stage || outreach.stage === 'finished')
  ) {
    outreach = {
      stage: 'their_move',
      stage_updated_at: now,
      entered_at: previous.entered_at || now,
      notes: outreach.notes || previous.notes || '',
    };
  }

  // Responded negatively → Finished (shared terminal shelf). Explicit stage='' still clears.
  const becameNegative = normalizedStatus === 'responded_negative' && priorStatus !== 'responded_negative';
  if (
    normalizedStatus === 'responded_negative'
    && !explicitlyManagingOutreach
    && (becameNegative || !outreach.stage)
  ) {
    outreach = {
      stage: 'finished',
      stage_updated_at: now,
      entered_at: previous.entered_at || now,
      notes: outreach.notes || previous.notes || '',
    };
  }

  // Contacted after Finished / negative: leave the terminal shelf for silence-nudge flow.
  const becameContacted = normalizedStatus === 'contacted' && priorStatus !== 'contacted';
  if (
    normalizedStatus === 'contacted'
    && !explicitlyManagingOutreach
    && becameContacted
    && (outreach.stage === 'finished' || previous.stage === 'finished')
  ) {
    outreach = {
      stage: '',
      stage_updated_at: now,
      entered_at: '',
      notes: outreach.notes || previous.notes || '',
    };
  }

  if (OUTREACH_CLEAR_STATUSES.has(normalizedStatus)) {
    if (outreach.stage || previous.stage) {
      outreach = {
        stage: '',
        stage_updated_at: now,
        entered_at: '',
        notes: outreach.notes || previous.notes || '',
      };
    }
  }

  let follow_up_date = followUpDateUpdate;
  if (follow_up_date === undefined) {
    follow_up_date = currentFollowUpDate;
  }

  return {
    outreach: normalizeOutreach(outreach),
    follow_up_date: follow_up_date === undefined ? undefined : cleanText(follow_up_date),
  };
}

export function sourceIdFromCanonicalPath(filePath = '') {
  const base = basename(filePath).toLowerCase();
  const dynamicSource = sourceIdFromProspectsFilename(base);
  if (dynamicSource) return dynamicSource;
  if (base.includes('umich')) return 'umich';
  if (base.includes('kth')) return 'kth';
  if (base.includes('ipp')) return 'ipp';
  if (base.includes('private-co')) return 'private-co';
  return 'umich';
}

export function readResearchUserState(filePath = RESEARCH_USER_STATE_FILE) {
  if (!existsSync(filePath)) return emptyUserState();
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    return {
      ...emptyUserState(),
      ...parsed,
      sources: parsed?.sources && typeof parsed.sources === 'object' ? parsed.sources : {},
    };
  } catch {
    return emptyUserState();
  }
}

function mirrorUserState(store) {
  atomicWrite(DASHBOARD_RESEARCH_USER_STATE_FILE, `${JSON.stringify(store, null, 2)}\n`);
}

export function patchResearchUserState(sourceId, prospectId, fields = {}, userStateFile = RESEARCH_USER_STATE_FILE) {
  const source = cleanSourceId(sourceId);
  const id = cleanText(prospectId);
  if (!id) return null;

  const store = readResearchUserState(userStateFile);
  const current = store.sources[source]?.[id] || {};
  const nextFields = { ...current, updated_at: new Date().toISOString() };

  const statusIncoming = fields.status !== undefined
    ? normalizeProspectStatus(fields.status)
    : normalizeProspectStatus(current.status);
  // Always persist the normalized status so legacy `responded` gets upgraded on write.
  if (fields.status !== undefined || current.status === 'responded') {
    nextFields.status = statusIncoming;
  }

  const semantics = applyOutreachSemantics({
    status: statusIncoming,
    previousStatus: current.status,
    currentOutreach: current.outreach,
    currentFollowUpDate: current.follow_up_date || '',
    outreachUpdate: fields.outreach,
    followUpDateUpdate: fields.follow_up_date,
  });

  for (const field of USER_STATE_FIELDS) {
    if (field === 'status') continue;
    if (field === 'outreach') {
      nextFields.outreach = semantics.outreach;
      continue;
    }
    if (field === 'follow_up_date' && semantics.follow_up_date !== undefined) {
      nextFields.follow_up_date = semantics.follow_up_date;
      continue;
    }
    if (fields[field] !== undefined) nextFields[field] = fields[field];
  }

  store.sources[source] = {
    ...(store.sources[source] || {}),
    [id]: nextFields,
  };
  store.updated_at = new Date().toISOString();
  atomicWrite(userStateFile, `${JSON.stringify(store, null, 2)}\n`);
  if (userStateFile === RESEARCH_USER_STATE_FILE) {
    mirrorUserState(store);
  }
  return nextFields;
}

export function applyUserStateToProspect(prospect, sourceId, userStateFile = RESEARCH_USER_STATE_FILE) {
  const source = cleanSourceId(sourceId);
  const id = cleanText(prospect?.id);
  if (!id) return prospect;

  const saved = readResearchUserState(userStateFile).sources[source]?.[id];
  if (!saved) {
    const status = normalizeProspectStatus(prospect?.status);
    let outreach = normalizeOutreach(prospect?.outreach);
    if (status === 'responded_positive' && !outreach.stage) {
      const now = new Date().toISOString();
      outreach = {
        stage: 'your_move',
        stage_updated_at: now,
        entered_at: now,
        notes: '',
      };
    }
    return {
      ...prospect,
      status,
      outreach,
    };
  }

  const merged = { ...prospect };
  for (const field of USER_STATE_FIELDS) {
    if (saved[field] !== undefined) {
      merged[field] = saved[field];
    }
  }
  merged.status = normalizeProspectStatus(saved.status !== undefined ? saved.status : prospect?.status);
  merged.outreach = normalizeOutreach(saved.outreach !== undefined ? saved.outreach : prospect?.outreach);

  // Legacy migrate: positive with never-saved outreach enters Your move once.
  // If outreach was saved with empty stage (Remove from rail), stay off-rail.
  // Also upgrade bare legacy `responded` user-state rows that never got an outreach object.
  const legacyResponded = saved.status === 'responded';
  if (
    merged.status === 'responded_positive'
    && !merged.outreach?.stage
    && (saved.outreach === undefined || legacyResponded)
  ) {
    const now = new Date().toISOString();
    merged.outreach = {
      stage: 'your_move',
      stage_updated_at: now,
      entered_at: now,
      notes: merged.outreach?.notes || '',
    };
  }
  return merged;
}

export function applyUserStateToStore(store, sourceId, userStateFile = RESEARCH_USER_STATE_FILE) {
  if (!Array.isArray(store?.prospects)) return store;
  return {
    ...store,
    prospects: store.prospects.map(prospect => applyUserStateToProspect(prospect, sourceId, userStateFile)),
  };
}

export function syncResearchUserStateToDashboard() {
  const store = readResearchUserState();
  mirrorUserState(store);
  return store;
}

export function bootstrapResearchUserStateFromCanonical() {
  let migrated = 0;
  const overlay = readResearchUserState();
  for (const source of allResearchSources()) {
    const sourceId = cleanSourceId(source.id);
    const fileName = source.prospects_file;
    const filePath = join(CAREER_OPS_DIR, 'data', fileName);
    if (!existsSync(filePath)) continue;
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      continue;
    }
    for (const prospect of parsed.prospects || []) {
      const id = cleanText(prospect?.id);
      if (!id || overlay.sources[sourceId]?.[id]?.status) continue;
      if (!prospect.status || prospect.status === 'not_contacted') continue;
      const status = normalizeProspectStatus(prospect.status);
      const semantics = applyOutreachSemantics({
        status,
        currentOutreach: prospect.outreach,
        currentFollowUpDate: prospect.follow_up_date || '',
      });
      patchResearchUserState(sourceId, id, {
        status,
        last_contacted: prospect.last_contacted || '',
        last_followed_up: prospect.last_followed_up || '',
        follow_up_date: semantics.follow_up_date ?? (prospect.follow_up_date || ''),
        notes: prospect.notes || '',
        outreach: semantics.outreach,
      });
      migrated++;
    }
  }
  return migrated;
}
