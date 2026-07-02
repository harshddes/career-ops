import { execFile } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { createLocalModelClient, localModelHealth } from '../local-llm/model-health.mjs';
import { ParallelResearchProvider } from '../research-providers/parallel.mjs';
import { patchConsiderJob } from '../jobs-to-consider-store.mjs';
import { classifyProposedWrites, summarizePolicy } from './policy-gate.mjs';
import { parseJsonObject, safeRelativePath, validateAutonomyResult } from './schemas.mjs';
import { AutonomyRunStore } from './store.mjs';

function readText(filePath, fallback = '') {
  if (!existsSync(filePath)) return fallback;
  return readFileSync(filePath, 'utf-8');
}

function compact(value, max = 12_000) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[truncated]`;
}

function runNode(scriptPath, args = [], cwd) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [scriptPath, ...args], { cwd, windowsHide: true, timeout: 120_000 }, (err, stdout = '', stderr = '') => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

function taskTopic(task) {
  return [
    `Research this career-ops task and collect current public context.`,
    task.company ? `Company: ${task.company}` : null,
    task.title ? `Role/Target: ${task.title}` : null,
    task.url ? `URL: ${task.url}` : null,
    task.prompt ? `Existing instructions: ${task.prompt}` : null,
    `Return facts useful for a job-fit evaluation, work authorization risk, compensation, posting legitimacy, and recommended tracker/report action.`,
  ].filter(Boolean).join('\n');
}

export class AutonomyOrchestrator {
  constructor({ dataDir, careerOpsDir, taskQueue, onEvent = () => {} }) {
    this.dataDir = dataDir;
    this.careerOpsDir = careerOpsDir;
    this.taskQueue = taskQueue;
    this.onEvent = onEvent;
    this.runStore = new AutonomyRunStore(join(dataDir, 'autonomy-runs.ndjson'));
    this.parallel = new ParallelResearchProvider({
      cwd: careerOpsDir,
      outputDir: join(dataDir, 'research-runs'),
      runStore: this.runStore,
    });
  }

  listRuns(limit = 25) {
    return this.runStore.list({ limit });
  }

  researchBudget() {
    return this.parallel.budget();
  }

  async modelHealth() {
    const [parallel, local] = await Promise.all([
      this.parallel.health(),
      localModelHealth(),
    ]);
    return { parallel, local };
  }

  openTasks() {
    return this.taskQueue.list()
      .filter(task => ['queued', 'in_progress'].includes(task.status))
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
  }

  async runPending({ maxTasks = 1, pollTimeoutSec = 120, researchOnly = false } = {}) {
    const tasks = this.openTasks().slice(0, Math.max(1, Number(maxTasks) || 1));
    const results = [];
    for (const task of tasks) {
      results.push(await this.processTask(task, { pollTimeoutSec, researchOnly }));
    }
    return {
      processed: results.length,
      results,
      budget: this.researchBudget(),
    };
  }

  async processTask(task, { pollTimeoutSec = 120, researchOnly = false } = {}) {
    const attempts = Number(task.attempts || 0) + 1;
    this.taskQueue.update(task.id, {
      status: 'in_progress',
      provider: task.provider || 'parallel',
      attempts,
      notes: 'Autonomy is researching this task.',
    });

    let research = {
      run_id: task.research_run_id,
      output_base: task.research_output_base,
      audit_id: task.autonomy_audit_id,
    };

    if (!research.run_id) {
      research = await this.parallel.start({
        task,
        topic: taskTopic(task),
        processor: task.processor || process.env.PARALLEL_PROCESSOR || 'pro-fast',
      });
      this.taskQueue.update(task.id, {
        research_run_id: research.run_id,
        research_result_url: research.result_url,
        research_output_base: research.output_base,
        autonomy_audit_id: research.audit_id,
      });
    }

    const poll = await this.parallel.poll({
      runId: research.run_id,
      outputBase: research.output_base,
      timeoutSec: pollTimeoutSec,
      auditId: research.audit_id,
    });

    if (poll.status === 'timeout') {
      const updated = this.taskQueue.update(task.id, {
        status: 'in_progress',
        next_poll_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        notes: 'Parallel research is still running; poll again later.',
      });
      this.onEvent('autonomy_task_updated', { task: updated });
      return { task_id: task.id, status: 'research_timeout', poll };
    }

    if (researchOnly) {
      const updated = this.taskQueue.update(task.id, {
        status: 'needs_user',
        result_path: poll.result_md,
        notes: 'Parallel research completed. Local reasoning was skipped by request.',
      });
      this.onEvent('autonomy_task_updated', { task: updated });
      return { task_id: task.id, status: 'research_completed', result_path: poll.result_md };
    }

    const { client: localModel, health: modelHealth } = await createLocalModelClient();
    if (!modelHealth.ok) {
      const updated = this.taskQueue.update(task.id, {
        status: 'needs_user',
        result_path: poll.result_md,
        notes: `Parallel research completed, but local model is unavailable: ${modelHealth.detail}`,
      });
      this.onEvent('autonomy_task_updated', { task: updated });
      return { task_id: task.id, status: 'model_unavailable', result_path: poll.result_md, model: modelHealth };
    }

    const modelResult = await this.reasonAboutTask(task, poll.result_text, localModel);
    const classifiedWrites = classifyProposedWrites(modelResult.proposed_writes);
    const policySummary = summarizePolicy(classifiedWrites);
    const approvalRequired = policySummary.approval_required > 0 || policySummary.dry_run > 0 || policySummary.forbidden > 0;
    const nextStatus = approvalRequired ? 'needs_user' : 'completed';
    const updated = this.taskQueue.update(task.id, {
      status: nextStatus,
      result_path: poll.result_md,
      proposed_writes: classifiedWrites,
      approval_required: approvalRequired,
      autonomy_result: {
        ...modelResult,
        policy: policySummary,
      },
      notes: approvalRequired
        ? 'Local model produced proposed actions that need review.'
        : 'Local model completed with no approval-required writes.',
    });

    this.runStore.append({
      provider: 'local_llm',
      status: 'completed',
      task_id: task.id,
      model: localModel.model || modelHealth.selected_model || modelHealth.model,
      policy: policySummary,
    });
    this.onEvent('autonomy_task_updated', { task: updated });
    return { task_id: task.id, status: nextStatus, policy: policySummary };
  }

  async reasonAboutTask(task, researchText, localModel) {
    const context = {
      cv: compact(readText(join(this.careerOpsDir, 'cv.md')), 8_000),
      profile: compact(readText(join(this.careerOpsDir, 'config', 'profile.yml')), 6_000),
      userProfile: compact(readText(join(this.careerOpsDir, 'modes', '_profile.md')), 6_000),
      digest: compact(readText(join(this.careerOpsDir, 'article-digest.md')), 4_000),
    };

    const system = [
      'You are the local autonomy analyst for a career-ops dashboard.',
      'Return strict JSON only. Do not include chain-of-thought.',
      'Never propose submitting applications, sending messages, or clicking Apply.',
      'Prefer proposed_writes that are drafts or tracker additions requiring approval.',
    ].join(' ');

    const user = JSON.stringify({
      task,
      research: compact(researchText, 12_000),
      context,
      required_schema: {
        verdict: 'apply | evaluate | skip | needs_review',
        score: 'number from 0 to 5 or null',
        summary: 'short user-facing summary',
        rationale: 'brief non-private rationale',
        evidence: ['facts with source names when available'],
        proposed_writes: [
          {
            action: 'report_draft | tracker_addition | jobs_to_consider_patch | dashboard_metadata | mark_duplicate_alert',
            summary: 'what this write would do',
            risk: 'low | medium | high',
            relative_path: 'optional safe path',
            content: 'optional write content',
            fields: 'optional structured data',
          },
        ],
        questions: ['optional user questions'],
      },
    });

    const raw = await localModel.chatJSON({ system, user });
    const parsed = parseJsonObject(raw);
    return validateAutonomyResult(parsed);
  }

  async approveTask(id) {
    const task = this.taskQueue.list().find(item => item.id === id);
    if (!task) throw new Error(`task not found: ${id}`);
    const writes = Array.isArray(task.proposed_writes) ? task.proposed_writes : [];
    const executed = [];
    const skipped = [];

    for (const write of writes) {
      if (write.policy?.lane === 'forbidden') {
        skipped.push({ action: write.action, reason: write.policy.reason });
        continue;
      }
      executed.push(await this.executeProposedWrite(write));
    }

    const updated = this.taskQueue.update(id, {
      status: 'completed',
      approval_required: false,
      notes: `Approved and executed ${executed.length} proposed write(s).`,
    });
    this.onEvent('autonomy_task_updated', { task: updated });
    return { task: updated, executed, skipped };
  }

  rejectTask(id, reason = 'Rejected by user.') {
    const updated = this.taskQueue.update(id, {
      status: 'cancelled',
      approval_required: false,
      notes: reason,
    });
    if (!updated) throw new Error(`task not found: ${id}`);
    this.onEvent('autonomy_task_updated', { task: updated });
    return { task: updated };
  }

  async executeProposedWrite(write) {
    if (write.action === 'report_draft') {
      const relativePath = safeRelativePath(write.relative_path, ['reports']);
      if (!relativePath) throw new Error('invalid report path');
      const target = resolve(this.careerOpsDir, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, String(write.content || ''), 'utf-8');
      return { action: write.action, path: relativePath };
    }

    if (write.action === 'tracker_addition') {
      const relativePath = safeRelativePath(write.relative_path, ['batch/tracker-additions'])
        || `batch/tracker-additions/autonomy-${Date.now()}.tsv`;
      const target = resolve(this.careerOpsDir, relativePath);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, String(write.content || write.tsv || ''), 'utf-8');
      await runNode(join(this.careerOpsDir, 'merge-tracker.mjs'), ['--verify'], this.careerOpsDir);
      return { action: write.action, path: relativePath, merged: true };
    }

    if (write.action === 'jobs_to_consider_patch') {
      const id = write.id || write.job_id || write.fields?.id;
      if (!id) throw new Error('jobs_to_consider_patch requires id');
      const result = patchConsiderJob(id, write.updates || write.fields?.updates || {});
      return { action: write.action, id, job: result.job };
    }

    return { action: write.action, skipped: true, reason: 'No filesystem write required.' };
  }
}

export function createAutonomyOrchestrator(options) {
  return new AutonomyOrchestrator(options);
}
