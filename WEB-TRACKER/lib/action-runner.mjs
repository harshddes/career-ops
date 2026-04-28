import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

function nodeStep(cwd, script, args = []) {
  return { command: process.execPath, args: [script, ...args], cwd };
}

export function createActionRegistry({ baseDir, repoRoot, dataDir }) {
  const tempDir = join(dataDir, 'tmp');
  mkdirSync(tempDir, { recursive: true });

  const registry = {
    sync_career_ops: {
      label: 'Refresh my dashboard data',
      mutates: true,
      description: 'Pull the latest applications, reports, follow-ups, and saved jobs into the dashboard.',
      after: 'Use this first if the numbers look stale.',
      buildSteps: () => [nodeStep(baseDir, join(baseDir, 'adapters', 'sync-all.mjs'))],
    },
    scan_root_jobs: {
      label: 'Find new broad job leads',
      mutates: true,
      description: 'Search the broader career-ops company list for possible jobs.',
      after: 'Review new leads in Jobs To Consider and ignore visa-dead roles.',
      buildSteps: ({ dry_run = true } = {}) => [
        nodeStep(repoRoot, join(repoRoot, 'scan.mjs'), dry_run ? ['--dry-run'] : []),
      ],
    },
    scan_fusion_jobs: {
      label: 'Find new fusion jobs',
      mutates: true,
      description: 'Check fusion-company job boards for roles matching instrumentation, diagnostics, test, and plasma keywords.',
      after: 'Queue one promising job for AI review.',
      buildSteps: ({ all = false, dry_run = false } = {}) => [
        nodeStep(baseDir, join(baseDir, 'fusion-scan.mjs'), [
          ...(all ? ['--all'] : []),
          ...(dry_run ? ['--dry-run'] : []),
        ]),
      ],
    },
    scan_phd_sources: {
      label: 'Check PhD and lab openings',
      mutates: true,
      description: 'Check lab, PhD, scholarship, and research pages for changes.',
      after: 'If something changed, ask Cursor to investigate the specific source.',
      buildSteps: ({ all = false, dry_run = false } = {}) => [
        nodeStep(baseDir, join(baseDir, 'phd-scan.mjs'), [
          ...(all ? ['--all'] : []),
          ...(dry_run ? ['--dry-run'] : []),
        ]),
      ],
    },
    research_gate_status: {
      label: 'Check what needs research',
      mutates: false,
      description: 'See whether new scanner events need deeper review.',
      after: 'Use this to decide what to ask the AI agent to research next.',
      buildSteps: () => [nodeStep(baseDir, join(baseDir, 'deep-research-gate.mjs'), ['--status'])],
    },
    research_gate_run: {
      label: 'Sort new research alerts',
      mutates: true,
      description: 'Sort scanner alerts into review, skip, or research buckets.',
      after: 'Review anything that lands in Needs AI Review.',
      buildSteps: () => [nodeStep(baseDir, join(baseDir, 'deep-research-gate.mjs'))],
    },
    verify_pipeline: {
      label: 'Check tracker for mistakes',
      mutates: false,
      description: 'Make sure application statuses, report links, scores, and duplicates are clean.',
      after: 'If this fails, ask Cursor to fix the tracker before applying to more roles.',
      buildSteps: () => [nodeStep(repoRoot, join(repoRoot, 'verify-pipeline.mjs'))],
    },
    analyze_patterns: {
      label: 'Find what is working',
      mutates: false,
      description: 'Look for patterns in scores, skips, and application outcomes.',
      after: 'Use the result in Weekly Review.',
      buildSteps: () => [nodeStep(repoRoot, join(repoRoot, 'analyze-patterns.mjs'))],
    },
    followup_cadence: {
      label: 'Check who needs a follow-up',
      mutates: false,
      description: 'Find companies or contacts that need a polite follow-up.',
      after: 'Send one follow-up if any are overdue.',
      buildSteps: () => [nodeStep(repoRoot, join(repoRoot, 'followup-cadence.mjs'))],
    },
    merge_tracker: {
      label: 'Save evaluated jobs to tracker',
      mutates: true,
      description: 'Move completed evaluation rows into the main application tracker.',
      after: 'Run “Check tracker for mistakes” if this reports a problem.',
      buildSteps: () => [nodeStep(repoRoot, join(repoRoot, 'merge-tracker.mjs'), ['--verify'])],
    },
    check_liveness: {
      label: 'Check if selected jobs are still open',
      mutates: false,
      description: 'Open selected job links in a browser and verify they have not closed.',
      after: 'Discard expired roles so they do not clog today’s plan.',
      buildSteps: ({ urls = [] } = {}, ctx = {}) => {
        const cleanUrls = Array.isArray(urls) ? urls.map(String).filter(u => /^https?:\/\//.test(u)) : [];
        if (cleanUrls.length === 0) throw new Error('check_liveness requires at least one http(s) URL');
        const filePath = join(tempDir, `${ctx.jobId || 'liveness'}-urls.tmp`);
        writeFileSync(filePath, cleanUrls.join('\n'));
        return [nodeStep(repoRoot, join(repoRoot, 'check-liveness.mjs'), ['--file', filePath])];
      },
    },
    daily_brief: {
      label: 'Update my dashboard',
      mutates: true,
      description: 'Run the normal daily refresh: sync data, scan jobs, check deadlines, follow-ups, and patterns.',
      after: 'Go to Today and do the first recommended action.',
      buildSteps: () => [
        nodeStep(baseDir, join(baseDir, 'adapters', 'sync-all.mjs')),
        nodeStep(baseDir, join(baseDir, 'fusion-scan.mjs')),
        nodeStep(baseDir, join(baseDir, 'phd-scan.mjs')),
        nodeStep(baseDir, join(baseDir, 'deep-research-gate.mjs'), ['--status']),
        nodeStep(repoRoot, join(repoRoot, 'followup-cadence.mjs')),
        nodeStep(repoRoot, join(repoRoot, 'analyze-patterns.mjs')),
      ],
    },
  };

  return registry;
}

export function listActions(registry) {
  return Object.entries(registry).map(([id, action]) => ({
    id,
    label: action.label,
    mutates: action.mutates,
    description: action.description,
    after: action.after,
  }));
}

export async function runAction({ registry, jobStore, actionId, input = {} }) {
  const action = registry[actionId];
  if (!action) throw new Error(`Unknown action: ${actionId}`);

  const job = jobStore.create(actionId, input, action);
  jobStore.update(job.id, { status: 'running' });

  queueMicrotask(async () => {
    try {
      const steps = action.buildSteps(input, { jobId: job.id });
      for (const step of steps) {
        await runStep(step, jobStore, job.id);
      }
      jobStore.finish(job.id, 0);
    } catch (err) {
      jobStore.appendLog(job.id, 'stderr', err.message);
      jobStore.finish(job.id, 1, err.message);
    }
  });

  return job;
}

function runStep(step, jobStore, jobId) {
  return new Promise((resolve, reject) => {
    if (!existsSync(step.cwd)) return reject(new Error(`Working directory does not exist: ${step.cwd}`));

    jobStore.appendLog(jobId, 'system', `$ ${[step.command, ...step.args].join(' ')}`);
    const child = spawn(step.command, step.args, {
      cwd: step.cwd,
      shell: false,
      windowsHide: true,
      env: { ...process.env },
    });

    child.stdout.on('data', chunk => jobStore.appendLog(jobId, 'stdout', chunk.toString()));
    child.stderr.on('data', chunk => jobStore.appendLog(jobId, 'stderr', chunk.toString()));
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Step exited with code ${code}`));
    });
  });
}
