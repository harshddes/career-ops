import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

const MAX_LOG_LINES = 500;
const MAX_JOBS = 100;

export class JobStore {
  constructor(filePath, onEvent = () => {}) {
    this.filePath = filePath;
    this.onEvent = onEvent;
    mkdirSync(dirname(filePath), { recursive: true });
    this.jobs = this.load();
  }

  load() {
    if (!existsSync(this.filePath)) return [];
    try {
      const data = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      return Array.isArray(data.jobs) ? data.jobs : [];
    } catch {
      return [];
    }
  }

  save() {
    const jobs = this.jobs.slice(-MAX_JOBS);
    this.jobs = jobs;
    writeFileSync(this.filePath, JSON.stringify({ generated_at: new Date().toISOString(), jobs }, null, 2));
  }

  list() {
    return [...this.jobs].sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0));
  }

  get(id) {
    return this.jobs.find(job => job.id === id) || null;
  }

  create(action, input = {}) {
    const now = new Date().toISOString();
    const job = {
      id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      action,
      input,
      status: 'queued',
      started_at: now,
      finished_at: null,
      exit_code: null,
      logs: [],
      error: null,
    };
    this.jobs.push(job);
    this.save();
    this.emit('job_created', { job });
    return job;
  }

  update(id, patch) {
    const job = this.get(id);
    if (!job) return null;
    Object.assign(job, patch);
    this.save();
    this.emit('job_updated', { job });
    return job;
  }

  appendLog(id, stream, text) {
    const job = this.get(id);
    if (!job) return null;
    const lines = String(text)
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => ({ at: new Date().toISOString(), stream, text: line }));
    job.logs.push(...lines);
    if (job.logs.length > MAX_LOG_LINES) job.logs = job.logs.slice(-MAX_LOG_LINES);
    this.save();
    for (const line of lines) this.emit('job_log', { job_id: id, line });
    return job;
  }

  finish(id, exitCode, error = null) {
    return this.update(id, {
      status: exitCode === 0 ? 'completed' : 'failed',
      exit_code: exitCode,
      finished_at: new Date().toISOString(),
      error,
    });
  }

  emit(type, payload) {
    this.onEvent(type, payload);
  }
}
