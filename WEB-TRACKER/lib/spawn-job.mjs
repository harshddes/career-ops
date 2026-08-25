import { execFile } from 'child_process';
import { join } from 'path';
import { nodeScriptInvocation } from './node-exec.mjs';

export function spawnNodeJob({
  jobStore,
  job,
  baseDir,
  script,
  args = [],
  timeoutMs = 10 * 60_000,
  onSuccess,
  onFail,
}) {
  jobStore.update(job.id, { status: 'running' });
  queueMicrotask(async () => {
    try {
      const result = await new Promise(resolve => {
        execFile(process.execPath, nodeScriptInvocation(join(baseDir, script), args), {
          cwd: baseDir,
          timeout: timeoutMs,
          windowsHide: true,
        }, (err, stdout = '', stderr = '') => {
          resolve({ err, stdout, stderr });
        });
      });
      if (result.stdout) jobStore.appendLog(job.id, 'stdout', result.stdout);
      if (result.stderr) jobStore.appendLog(job.id, 'stderr', result.stderr);
      if (result.err) throw result.err;
      jobStore.finish(job.id, 0);
      if (onSuccess) await onSuccess(result);
    } catch (err) {
      jobStore.appendLog(job.id, 'stderr', err?.stack || err?.message || String(err));
      jobStore.finish(job.id, 1, err?.message || String(err));
      if (onFail) await onFail(err);
    }
  });
}

export function factoryWorkerArgs(input = {}) {
  const args = ['--max', String(Number(input.max || input.max_items || 3) || 3)];
  if (input.dry_run || input.dryRun) args.push('--dry-run');
  if (input.force) args.push('--force');
  if (input.retry_failures || input.retryFailures) args.push('--retry-failures');
  const poll = input.poll_timeout_sec || input.poll_timeout || input.pollTimeoutSec;
  if (poll) args.push('--poll-timeout', String(Number(poll) || 120));
  return args;
}
