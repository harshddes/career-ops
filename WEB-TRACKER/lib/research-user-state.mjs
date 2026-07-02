import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_TRACKER_DIR = join(LIB_DIR, '..');
const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
export const RESEARCH_USER_STATE_FILE = join(CAREER_OPS_DIR, 'data', 'research-prospect-user-state.json');
export const DASHBOARD_RESEARCH_USER_STATE_FILE = join(WEB_TRACKER_DIR, 'data', 'research-prospect-user-state.json');

const USER_STATE_FIELDS = ['status', 'last_contacted', 'last_followed_up', 'follow_up_date', 'notes'];

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

export function sourceIdFromCanonicalPath(filePath = '') {
  const base = basename(filePath).toLowerCase();
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

export function patchResearchUserState(sourceId, prospectId, fields = {}) {
  const source = cleanSourceId(sourceId);
  const id = cleanText(prospectId);
  if (!id) return null;

  const store = readResearchUserState();
  const current = store.sources[source]?.[id] || {};
  const nextFields = { ...current, updated_at: new Date().toISOString() };
  for (const field of USER_STATE_FIELDS) {
    if (fields[field] !== undefined) nextFields[field] = fields[field];
  }

  store.sources[source] = {
    ...(store.sources[source] || {}),
    [id]: nextFields,
  };
  store.updated_at = new Date().toISOString();
  atomicWrite(RESEARCH_USER_STATE_FILE, `${JSON.stringify(store, null, 2)}\n`);
  mirrorUserState(store);
  return nextFields;
}

export function applyUserStateToProspect(prospect, sourceId) {
  const source = cleanSourceId(sourceId);
  const id = cleanText(prospect?.id);
  if (!id) return prospect;

  const saved = readResearchUserState().sources[source]?.[id];
  if (!saved) return prospect;

  const merged = { ...prospect };
  for (const field of USER_STATE_FIELDS) {
    if (saved[field] !== undefined) {
      merged[field] = saved[field];
    }
  }
  if (saved.status !== undefined) merged.status = saved.status;
  return merged;
}

export function applyUserStateToStore(store, sourceId) {
  if (!Array.isArray(store?.prospects)) return store;
  return {
    ...store,
    prospects: store.prospects.map(prospect => applyUserStateToProspect(prospect, sourceId)),
  };
}

export function syncResearchUserStateToDashboard() {
  const store = readResearchUserState();
  mirrorUserState(store);
  return store;
}

const BOOTSTRAP_SOURCES = {
  umich: 'umich-research-prospects.json',
  kth: 'kth-research-prospects.json',
  ipp: 'ipp-research-prospects.json',
  'private-co': 'private-co-phd-paths.json',
};

export function bootstrapResearchUserStateFromCanonical() {
  let migrated = 0;
  const overlay = readResearchUserState();
  for (const [sourceId, fileName] of Object.entries(BOOTSTRAP_SOURCES)) {
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
      patchResearchUserState(sourceId, id, {
        status: prospect.status,
        last_contacted: prospect.last_contacted || '',
        last_followed_up: prospect.last_followed_up || '',
        follow_up_date: prospect.follow_up_date || '',
        notes: prospect.notes || '',
      });
      migrated++;
    }
  }
  return migrated;
}
