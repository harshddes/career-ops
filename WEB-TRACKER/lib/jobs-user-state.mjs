import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_TRACKER_DIR = join(LIB_DIR, '..');
const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');

export const JOBS_USER_STATE_FILE = join(CAREER_OPS_DIR, 'data', 'jobs-to-consider-user-state.json');
export const DASHBOARD_JOBS_USER_STATE_FILE = join(WEB_TRACKER_DIR, 'data', 'jobs-to-consider-user-state.json');

const USER_STATE_FIELDS = [
  'status',
  'applied',
  'applied_at',
  'application_num',
  'notes',
  'resources',
  'networking_org_id',
  'networking_person_ids',
  'networking_research_order_id',
];

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
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
    jobs: {},
  };
}

export function readJobsUserState(filePath = JOBS_USER_STATE_FILE) {
  if (!existsSync(filePath)) return emptyUserState();
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    return {
      ...emptyUserState(),
      ...parsed,
      jobs: parsed?.jobs && typeof parsed.jobs === 'object' ? parsed.jobs : {},
    };
  } catch {
    return emptyUserState();
  }
}

function mirrorJobsUserState(store) {
  atomicWrite(DASHBOARD_JOBS_USER_STATE_FILE, `${JSON.stringify(store, null, 2)}\n`);
}

export function patchJobsUserState(jobId, fields = {}) {
  const id = cleanText(jobId);
  if (!id) return null;

  const store = readJobsUserState();
  const current = store.jobs[id] || {};
  const nextFields = { ...current, updated_at: new Date().toISOString() };
  for (const field of USER_STATE_FIELDS) {
    if (fields[field] !== undefined) nextFields[field] = fields[field];
  }
  if (fields.resources && typeof fields.resources === 'object' && !Array.isArray(fields.resources)) {
    nextFields.resources = {
      ...(current.resources || {}),
      ...fields.resources,
    };
  }

  store.jobs[id] = nextFields;
  store.updated_at = new Date().toISOString();
  atomicWrite(JOBS_USER_STATE_FILE, `${JSON.stringify(store, null, 2)}\n`);
  mirrorJobsUserState(store);
  return nextFields;
}

export function removeJobsUserState(jobIds = [], filePath = JOBS_USER_STATE_FILE) {
  const ids = (Array.isArray(jobIds) ? jobIds : [jobIds]).map(cleanText).filter(Boolean);
  if (!ids.length) return null;

  const store = readJobsUserState(filePath);
  let changed = false;
  for (const id of ids) {
    if (store.jobs[id]) {
      delete store.jobs[id];
      changed = true;
    }
  }
  if (!changed) return store;

  store.updated_at = new Date().toISOString();
  atomicWrite(filePath, `${JSON.stringify(store, null, 2)}\n`);
  if (filePath === JOBS_USER_STATE_FILE) mirrorJobsUserState(store);
  return store;
}

export function applyJobsUserStateToJob(job = {}) {
  const saved = readJobsUserState().jobs[cleanText(job.id)];
  if (!saved) return job;
  const merged = { ...job };
  for (const field of USER_STATE_FIELDS) {
    if (saved[field] !== undefined) merged[field] = saved[field];
  }
  if (saved.resources && typeof saved.resources === 'object') {
    merged.resources = {
      ...(job.resources || {}),
      ...saved.resources,
    };
  }
  return merged;
}

export function applyJobsUserStateToStore(store = {}) {
  if (!Array.isArray(store.jobs)) return store;
  return {
    ...store,
    jobs: store.jobs.map(applyJobsUserStateToJob),
  };
}

export function syncJobsUserStateToDashboard() {
  const store = readJobsUserState();
  mirrorJobsUserState(store);
  return store;
}
