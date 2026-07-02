import { execFile } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';

function runCommand(command, args, { cwd, timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, timeout: timeoutMs, windowsHide: true }, (err, stdout = '', stderr = '') => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

function parseJsonFromStdout(stdout) {
  const text = String(stdout || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('parallel-cli did not return JSON');
  }
  return JSON.parse(text.slice(start, end + 1));
}

function slug(value) {
  return String(value || 'research')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'research';
}

export class ParallelResearchProvider {
  constructor({ cwd, outputDir, runStore, env = process.env } = {}) {
    this.cwd = cwd || process.cwd();
    this.outputDir = outputDir || join(this.cwd, 'WEB-TRACKER', 'data', 'research-runs');
    this.runStore = runStore;
    this.env = env;
    mkdirSync(this.outputDir, { recursive: true });
  }

  dailyLimit() {
    const parsed = Number(this.env.AUTONOMY_DAILY_RESEARCH_LIMIT || 3);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
  }

  budget() {
    const used = this.runStore?.countToday({ provider: 'parallel' }) || 0;
    const limit = this.dailyLimit();
    return {
      provider: 'parallel',
      used_today: used,
      daily_limit: limit,
      remaining_today: Math.max(0, limit - used),
      limited: used >= limit,
    };
  }

  async health() {
    try {
      const result = await runCommand('parallel-cli', ['--version'], { cwd: this.cwd, timeoutMs: 10_000 });
      return { ok: true, detail: (result.stdout || result.stderr || 'parallel-cli available').trim() };
    } catch (err) {
      return {
        ok: false,
        detail: err.code === 'ENOENT'
          ? 'parallel-cli is not installed or not on PATH.'
          : (err.stderr || err.message || 'parallel-cli unavailable').trim(),
      };
    }
  }

  outputBaseForTask(task) {
    const label = slug([task.company, task.title, task.id].filter(Boolean).join('-'));
    return join(this.outputDir, `${new Date().toISOString().slice(0, 10)}-${label}`);
  }

  async start({ task, topic, processor = 'pro-fast' }) {
    const budget = this.budget();
    if (budget.limited) {
      throw new Error(`Parallel daily research limit reached (${budget.used_today}/${budget.daily_limit}).`);
    }

    const run = await runCommand('parallel-cli', [
      'research',
      'run',
      topic,
      '--processor',
      processor,
      '--no-wait',
      '--json',
    ], { cwd: this.cwd, timeoutMs: 60_000 });

    const parsed = parseJsonFromStdout(run.stdout);
    const outputBase = this.outputBaseForTask(task);
    const record = this.runStore?.append({
      provider: 'parallel',
      status: 'submitted',
      task_id: task.id,
      run_id: parsed.run_id,
      result_url: parsed.result_url,
      processor: parsed.processor || processor,
      output_base: outputBase,
    });

    return {
      ...parsed,
      output_base: outputBase,
      audit_id: record?.id || null,
    };
  }

  async poll({ runId, outputBase, timeoutSec = 120, auditId = null }) {
    const safeTimeout = Math.max(5, Math.min(Number(timeoutSec) || 120, 540));
    try {
      await runCommand('parallel-cli', [
        'research',
        'poll',
        runId,
        '-o',
        outputBase,
        '--timeout',
        String(safeTimeout),
      ], { cwd: this.cwd, timeoutMs: (safeTimeout + 30) * 1000 });

      const jsonPath = `${outputBase}.json`;
      const mdPath = `${outputBase}.md`;
      const result = {
        status: 'completed',
        run_id: runId,
        result_json: existsSync(jsonPath) ? jsonPath : null,
        result_md: existsSync(mdPath) ? mdPath : null,
        result_text: existsSync(mdPath) ? readFileSync(mdPath, 'utf-8') : '',
      };
      if (auditId) this.runStore?.update(auditId, result);
      return result;
    } catch (err) {
      const timedOut = err.code === 5 || /timed out/i.test(`${err.stdout}\n${err.stderr}\n${err.message}`);
      const result = {
        status: timedOut ? 'timeout' : 'failed',
        run_id: runId,
        error: (err.stderr || err.message || 'parallel poll failed').trim(),
        output_hint: basename(outputBase),
      };
      if (auditId) this.runStore?.update(auditId, result);
      if (timedOut) return result;
      throw err;
    }
  }
}
