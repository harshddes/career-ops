import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { AgentTaskQueue } from '../agent-task-queue.mjs';
import {
  findExhibitorCompany,
  patchExhibitorCompany,
  readExhibitorCompanies,
  syncExhibitorCompaniesToDashboard,
} from './company-store.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const WEB_TRACKER_DIR = join(LIB_DIR, '..', '..');
export const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
export const DATA_DIR = join(WEB_TRACKER_DIR, 'data');
export const RUNTIME_DIR = join(WEB_TRACKER_DIR, 'runtime');
/** Dedicated Target Companies exhibitor lane — never mix with EURAXESS / PhDScanner / shared agent-tasks. */
export const TASKS_FILE = join(DATA_DIR, 'exhibitor-agent-tasks.ndjson');
export const CLEAR_QUEUE_FILE = join(DATA_DIR, 'exhibitor-clear-queue.json');
export const FACTORY_RUN_DIR = join(RUNTIME_DIR, 'exhibitor-factory');
export const TRIGGER_PHRASE = 'Clear the queue in Target Companies';
export const CLEAR_QUEUE_SOP_REL = 'WEB-TRACKER/lib/exhibitor/CLEAR_QUEUE_SOP.md';

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function today() {
  return new Date().toISOString().slice(0, 10);
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

function relToCareer(filePath) {
  if (!filePath) return '';
  const rel = relative(CAREER_OPS_DIR, filePath).replace(/\\/g, '/');
  return rel && !rel.startsWith('..') ? rel : '';
}

function taskKey(task = {}) {
  return [task.type, task.source_id, task.company].filter(Boolean).join('|').toLowerCase();
}

function openResearchTasks(queue = new AgentTaskQueue(TASKS_FILE)) {
  return queue.list().filter(task => (
    task.type === 'deep_research'
    && task.provider === 'exhibitor'
    && ['queued', 'in_progress', 'needs_user'].includes(task.status)
  ));
}

function buildCompanyPrompt(company = {}, task = {}) {
  return [
    `# Exhibitor careers research — ${company.name}`,
    '',
    `**Trigger:** ${TRIGGER_PHRASE}`,
    `**SOP:** ${CLEAR_QUEUE_SOP_REL}`,
    `**Company id:** ${company.id}`,
    `**Booth:** ${company.booth || 'unknown'}`,
    `**Event:** ${company.event || 'smallsat-2026'}`,
    `**Batch:** ${company.batch || 'N-R'}`,
    `**Task id:** ${task.id || company.task_id || ''}`,
    company.website ? `**Website:** ${company.website}` : '',
    company.careers_url ? `**Careers URL:** ${company.careers_url}` : '',
    '',
    'Execute CLEAR_QUEUE_SOP.md for this company only after reading exhibitor-clear-queue.json.',
    'Enumerate every open careers posting. Score against modes/_profile.md. Upsert fit roles to Jobs to Consider.',
    'Attach research report to this exhibitor company card. Do not ask clarifying questions.',
    '',
  ].filter(Boolean).join('\n');
}

export function refreshExhibitorClearQueueStatus() {
  mkdirSync(DATA_DIR, { recursive: true });
  const queue = new AgentTaskQueue(TASKS_FILE);
  const store = readExhibitorCompanies();
  const openTasks = openResearchTasks(queue);
  const pending = [];

  for (const task of openTasks) {
    const company = findExhibitorCompany(task.source_id || task.company, store)
      || store.companies.find(c => c.task_id === task.id);
    if (!company) continue;
    const effectiveStatus = task.status === 'queued'
      ? (company.worker_status === 'needs_worker' ? 'needs_worker' : 'queued_research')
      : (task.status === 'in_progress' ? 'in_progress' : 'needs_worker');
    pending.push({
      company_id: company.id,
      company: company.name,
      booth: company.booth || '',
      task_id: task.id,
      status: effectiveStatus,
      prompt_path: company.prompt_path || '',
    });
  }

  // Also surface companies marked needs_worker even if task list briefly lags
  for (const company of store.companies) {
    if (!['queued_research', 'needs_worker', 'in_progress'].includes(company.worker_status)) continue;
    if (pending.some(item => item.company_id === company.id)) continue;
    pending.push({
      company_id: company.id,
      company: company.name,
      booth: company.booth || '',
      task_id: company.task_id || '',
      status: company.worker_status,
      prompt_path: company.prompt_path || '',
    });
  }

  const status = {
    version: 1,
    lane: 'target-companies-exhibitor',
    trigger_phrase: TRIGGER_PHRASE,
    updated_at: new Date().toISOString(),
    pending_count: pending.length,
    pending,
    instructions_for_agent: `Execute ${CLEAR_QUEUE_SOP_REL} for every pending item. Do not ask questions. Do not touch EURAXESS/PhDScanner/Operations queues.`,
  };
  atomicWrite(CLEAR_QUEUE_FILE, `${JSON.stringify(status, null, 2)}\n`);
  return status;
}

export function readExhibitorClearQueue() {
  if (!existsSync(CLEAR_QUEUE_FILE)) return refreshExhibitorClearQueueStatus();
  try {
    return JSON.parse(readFileSync(CLEAR_QUEUE_FILE, 'utf-8'));
  } catch {
    return refreshExhibitorClearQueueStatus();
  }
}

export function queueExhibitorCompanyWork(companyInput = {}) {
  const company = typeof companyInput === 'string'
    ? findExhibitorCompany(companyInput)
    : (companyInput?.id ? findExhibitorCompany(companyInput.id) : null) || companyInput;
  if (!company?.id) throw new Error('Exhibitor company required');

  const queue = new AgentTaskQueue(TASKS_FILE);
  const existing = queue.list();
  const researchTask = {
    type: 'deep_research',
    company: company.name,
    title: `${company.name} careers research`,
    url: company.careers_url || company.website || '',
    source_id: company.id,
    provider: 'exhibitor',
    mode: 'deep',
    notes: `Queued from Target Companies exhibitor track. Booth ${company.booth || '?'}. ${TRIGGER_PHRASE}`,
    prompt: buildCompanyPrompt(company),
  };

  let task = existing.find(item => (
    item.provider === 'exhibitor'
    && item.type === 'deep_research'
    && item.source_id === company.id
    && ['queued', 'in_progress', 'needs_user'].includes(item.status)
  ));
  if (!task) {
    const duplicate = existing.find(item => taskKey(item) === taskKey(researchTask) && item.status === 'queued');
    task = duplicate || queue.create(researchTask);
  }

  const patched = patchExhibitorCompany(company.id, {
    worker_status: 'queued_research',
    task_id: task.id,
    last_error: '',
  });
  syncExhibitorCompaniesToDashboard();
  const clearQueue = refreshExhibitorClearQueueStatus();
  return { company: patched.company, task, clear_queue: clearQueue };
}

export function processExhibitorFactory({ max = 20, force = false } = {}) {
  mkdirSync(FACTORY_RUN_DIR, { recursive: true });
  const queue = new AgentTaskQueue(TASKS_FILE);
  const store = readExhibitorCompanies();
  const results = [];

  const candidates = store.companies.filter(company => {
    if (force && company.worker_status === 'queued_research') return true;
    return ['queued_research', 'failed_retryable'].includes(company.worker_status);
  }).slice(0, Math.max(1, Number(max) || 20));

  for (const company of candidates) {
    let taskId = company.task_id;
    if (!taskId) {
      const queued = queueExhibitorCompanyWork(company);
      taskId = queued.task?.id;
    }
    const promptPath = join(FACTORY_RUN_DIR, `${today()}-${company.id}-prompt.md`);
    const promptRel = relToCareer(promptPath);
    const task = queue.list().find(item => item.id === taskId);
    atomicWrite(promptPath, buildCompanyPrompt(company, task || { id: taskId }));

    if (taskId) {
      queue.update(taskId, {
        status: 'needs_user',
        notes: `Ready for Cursor. Say: ${TRIGGER_PHRASE}`,
        result_path: promptRel,
      });
    }

    const patched = patchExhibitorCompany(company.id, {
      worker_status: 'needs_worker',
      task_id: taskId || '',
      prompt_path: promptRel,
      last_error: '',
    });

    results.push({
      id: company.id,
      company: company.name,
      status: 'needs_worker',
      stage: 'awaiting_cursor',
      task_id: taskId || '',
      prompt_path: promptRel,
    });
    void patched;
  }

  // Also promote any open queued tasks whose company was already queued_research
  for (const task of openResearchTasks(queue)) {
    if (results.some(item => item.task_id === task.id)) continue;
    if (task.status !== 'queued') continue;
    const company = findExhibitorCompany(task.source_id);
    if (!company) continue;
    if (results.length >= Math.max(1, Number(max) || 20) && !force) break;
    const promptPath = join(FACTORY_RUN_DIR, `${today()}-${company.id}-prompt.md`);
    const promptRel = relToCareer(promptPath);
    atomicWrite(promptPath, buildCompanyPrompt(company, task));
    queue.update(task.id, {
      status: 'needs_user',
      notes: `Ready for Cursor. Say: ${TRIGGER_PHRASE}`,
      result_path: promptRel,
    });
    patchExhibitorCompany(company.id, {
      worker_status: 'needs_worker',
      task_id: task.id,
      prompt_path: promptRel,
    });
    results.push({
      id: company.id,
      company: company.name,
      status: 'needs_worker',
      stage: 'awaiting_cursor',
      task_id: task.id,
      prompt_path: promptRel,
    });
  }

  syncExhibitorCompaniesToDashboard();
  const clearQueue = refreshExhibitorClearQueueStatus();
  return {
    generated_at: new Date().toISOString(),
    processed: results.length,
    results,
    clear_queue: clearQueue,
    message: results.length
      ? `Prepared ${results.length} exhibitor research work order(s). Tell Cursor: ${TRIGGER_PHRASE}`
      : 'No queued exhibitor companies. Queue research on a Target Companies → Exhibitor card first.',
  };
}

export function exhibitorFactoryStatus() {
  const clearQueue = refreshExhibitorClearQueueStatus();
  const store = readExhibitorCompanies();
  return {
    generated_at: new Date().toISOString(),
    lane: 'target-companies-exhibitor',
    trigger_phrase: TRIGGER_PHRASE,
    summary: store.summary,
    clear_queue: clearQueue,
  };
}

export function markExhibitorTaskInProgress(companyId) {
  const company = findExhibitorCompany(companyId);
  if (!company) throw new Error(`Exhibitor company not found: ${companyId}`);
  const queue = new AgentTaskQueue(TASKS_FILE);
  if (company.task_id) {
    queue.update(company.task_id, { status: 'in_progress' });
  }
  const patched = patchExhibitorCompany(company.id, { worker_status: 'in_progress' });
  syncExhibitorCompaniesToDashboard();
  refreshExhibitorClearQueueStatus();
  return patched.company;
}

export function markExhibitorTaskCompleted(companyId, { failed = false, error = '' } = {}) {
  const company = findExhibitorCompany(companyId);
  if (!company) throw new Error(`Exhibitor company not found: ${companyId}`);
  const queue = new AgentTaskQueue(TASKS_FILE);
  if (company.task_id) {
    queue.update(company.task_id, {
      status: failed ? 'failed' : 'completed',
      notes: failed ? (error || 'failed_retryable') : 'Completed via CLEAR_QUEUE_SOP',
    });
  }
  if (failed) {
    patchExhibitorCompany(company.id, {
      worker_status: 'failed_retryable',
      last_error: error || 'failed_retryable',
    });
  }
  syncExhibitorCompaniesToDashboard();
  return refreshExhibitorClearQueueStatus();
}
