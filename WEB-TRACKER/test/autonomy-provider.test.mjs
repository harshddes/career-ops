import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ParallelResearchProvider } from '../lib/research-providers/parallel.mjs';

test('parallel provider reports remaining daily budget', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-parallel-'));
  const provider = new ParallelResearchProvider({
    cwd: dir,
    outputDir: join(dir, 'research-runs'),
    env: { AUTONOMY_DAILY_RESEARCH_LIMIT: '3' },
    runStore: { countToday: () => 2 },
  });

  assert.deepEqual(provider.budget(), {
    provider: 'parallel',
    used_today: 2,
    daily_limit: 3,
    remaining_today: 1,
    limited: false,
  });
});

test('parallel provider marks daily budget as limited', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-parallel-'));
  const provider = new ParallelResearchProvider({
    cwd: dir,
    outputDir: join(dir, 'research-runs'),
    env: { AUTONOMY_DAILY_RESEARCH_LIMIT: '1' },
    runStore: { countToday: () => 1 },
  });

  assert.equal(provider.budget().limited, true);
});
