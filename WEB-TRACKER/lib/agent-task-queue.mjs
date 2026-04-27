import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

const VALID_TYPES = new Set(['evaluation', 'pdf', 'deep_research', 'contact_draft', 'followup', 'custom']);
const VALID_STATUS = new Set(['queued', 'in_progress', 'needs_user', 'completed', 'failed', 'cancelled']);

function readTasks(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf-8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function writeTasks(filePath, tasks) {
  const body = tasks.map(task => JSON.stringify(task)).join('\n');
  writeFileSync(filePath, body ? `${body}\n` : '');
}

export class AgentTaskQueue {
  constructor(filePath) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
  }

  list() {
    return readTasks(this.filePath).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  create(input = {}) {
    const type = VALID_TYPES.has(input.type) ? input.type : 'custom';
    const now = new Date().toISOString();
    const task = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      status: 'queued',
      created_at: now,
      updated_at: now,
      company: input.company || null,
      title: input.title || null,
      url: input.url || null,
      source_id: input.source_id || null,
      mode: input.mode || this.defaultModeForType(type),
      work_auth: input.work_auth || null,
      prompt: input.prompt || this.buildPrompt({ ...input, type }),
      notes: input.notes || null,
    };
    appendFileSync(this.filePath, `${JSON.stringify(task)}\n`);
    return task;
  }

  update(id, patch = {}) {
    const tasks = readTasks(this.filePath);
    const idx = tasks.findIndex(task => task.id === id);
    if (idx === -1) return null;
    const status = patch.status && VALID_STATUS.has(patch.status) ? patch.status : tasks[idx].status;
    tasks[idx] = {
      ...tasks[idx],
      ...patch,
      status,
      updated_at: new Date().toISOString(),
    };
    writeTasks(this.filePath, tasks);
    return tasks[idx];
  }

  defaultModeForType(type) {
    return {
      evaluation: 'auto-pipeline',
      pdf: 'pdf',
      deep_research: 'deep',
      contact_draft: 'contacto',
      followup: 'followup',
    }[type] || 'custom';
  }

  buildPrompt(input) {
    const lines = [
      `Run career-ops mode: ${this.defaultModeForType(input.type)}`,
      input.company ? `Company: ${input.company}` : null,
      input.title ? `Role/Target: ${input.title}` : null,
      input.url ? `URL: ${input.url}` : null,
      input.work_auth ? `Work authorization context: ${JSON.stringify(input.work_auth)}` : null,
      'Use the existing career-ops rules. Do not submit applications or send messages automatically.',
    ].filter(Boolean);
    return lines.join('\n');
  }
}
