import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createActionRegistry, listActions } from '../lib/action-runner.mjs';

function makeRegistry() {
  const base = mkdtempSync(join(tmpdir(), 'career-ops-actions-'));
  return createActionRegistry({
    baseDir: base,
    repoRoot: base,
    dataDir: join(base, 'data'),
  });
}

test('action registry exposes only named actions', () => {
  const registry = makeRegistry();
  const actions = listActions(registry);
  const ids = actions.map(a => a.id);
  assert.ok(ids.includes('sync_career_ops'));
  assert.ok(ids.includes('daily_brief'));
  assert.equal(ids.includes('rm -rf'), false);
});

test('actions include mutating metadata', () => {
  const registry = makeRegistry();
  assert.equal(registry.verify_pipeline.mutates, false);
  assert.equal(registry.scan_fusion_jobs.mutates, true);
});
