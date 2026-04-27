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
      label: 'Sync career-ops data',
      mutates: true,
      description: 'Refresh WEB-TRACKER JSON snapshots from career-ops markdown and reports.',
      buildSteps: () => [nodeStep(baseDir, join(baseDir, 'adapters', 'sync-all.mjs'))],
    },
    scan_root_jobs: {
      label: 'Scan root career-ops portals',
      mutates: true,
      description: 'Run the root zero-token portal scanner.',
      buildSteps: ({ dry_run = true } = {}) => [
        nodeStep(repoRoot, join(repoRoot, 'scan.mjs'), dry_run ? ['--dry-run'] : []),
      ],
    },
    scan_fusion_jobs: {
      label: 'Scan fusion jobs',
      mutates: true,
      description: 'Run the fusion ATS API scanner.',
      buildSteps: ({ all = false, dry_run = false } = {}) => [
        nodeStep(baseDir, join(baseDir, 'fusion-scan.mjs'), [
          ...(all ? ['--all'] : []),
          ...(dry_run ? ['--dry-run'] : []),
        ]),
      ],
    },
    scan_phd_sources: {
      label: 'Scan PhD/lab sources',
      mutates: true,
      description: 'Run PhD, lab, and admissions page change detection.',
      buildSteps: ({ all = false, dry_run = false } = {}) => [
        nodeStep(baseDir, join(baseDir, 'phd-scan.mjs'), [
          ...(all ? ['--all'] : []),
          ...(dry_run ? ['--dry-run'] : []),
        ]),
      ],
    },
    research_gate_status: {
      label: 'Research gate status',
      mutates: false,
      description: 'Show token budget, pending events, and approval queue status.',
      buildSteps: () => [nodeStep(baseDir, join(baseDir, 'deep-research-gate.mjs'), ['--status'])],
    },
    research_gate_run: {
      label: 'Run research gate',
      mutates: true,
      description: 'Route queued scan events into auto, approval, or archive buckets.',
      buildSteps: () => [nodeStep(baseDir, join(baseDir, 'deep-research-gate.mjs'))],
    },
    verify_pipeline: {
      label: 'Verify pipeline',
      mutates: false,
      description: 'Run career-ops tracker and report integrity checks.',
      buildSteps: () => [nodeStep(repoRoot, join(repoRoot, 'verify-pipeline.mjs'))],
    },
    analyze_patterns: {
      label: 'Analyze patterns',
      mutates: false,
      description: 'Compute rejection/fit pattern analysis.',
      buildSteps: () => [nodeStep(repoRoot, join(repoRoot, 'analyze-patterns.mjs'))],
    },
    followup_cadence: {
      label: 'Follow-up cadence',
      mutates: false,
      description: 'Compute overdue and upcoming follow-up actions.',
      buildSteps: () => [nodeStep(repoRoot, join(repoRoot, 'followup-cadence.mjs'))],
    },
    merge_tracker: {
      label: 'Merge tracker additions',
      mutates: true,
      description: 'Merge TSV tracker additions and verify the pipeline.',
      buildSteps: () => [nodeStep(repoRoot, join(repoRoot, 'merge-tracker.mjs'), ['--verify'])],
    },
    check_liveness: {
      label: 'Check job liveness',
      mutates: false,
      description: 'Use Playwright to check whether selected job URLs are still active.',
      buildSteps: ({ urls = [] } = {}, ctx = {}) => {
        const cleanUrls = Array.isArray(urls) ? urls.map(String).filter(u => /^https?:\/\//.test(u)) : [];
        if (cleanUrls.length === 0) throw new Error('check_liveness requires at least one http(s) URL');
        const filePath = join(tempDir, `${ctx.jobId || 'liveness'}-urls.tmp`);
        writeFileSync(filePath, cleanUrls.join('\n'));
        return [nodeStep(repoRoot, join(repoRoot, 'check-liveness.mjs'), ['--file', filePath])];
      },
    },
    daily_brief: {
      label: 'Run daily brief',
      mutates: true,
      description: 'Run sync, scans, gate status, follow-up cadence, and pattern analysis in sequence.',
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
  }));
}

export async function runAction({ registry, jobStore, actionId, input = {} }) {
  const action = registry[actionId];
  if (!action) throw new Error(`Unknown action: ${actionId}`);

  const job = jobStore.create(actionId, input);
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
