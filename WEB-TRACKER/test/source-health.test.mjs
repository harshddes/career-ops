import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { summarizeSourceHealth } from '../lib/source-health.mjs';

test('summarizes failing and stale sources', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-health-'));
  const registryPath = join(dir, 'registry.json');
  const statePath = join(dir, 'state.json');
  const jobsPath = join(dir, 'jobs.json');
  const phdPath = join(dir, 'phd.json');
  writeFileSync(registryPath, JSON.stringify({
    sources: [
      { id: 'good', name: 'Good Source', source_type: 'job_api' },
      { id: 'bad', name: 'Bad Source', source_type: 'job_api', api_url: 'https://example.invalid' },
    ],
  }));
  writeFileSync(statePath, JSON.stringify({
    sources: {
      good: { last_status: 200, next_poll: '2099-01-01T00:00:00.000Z' },
      bad: {
        last_status: 404,
        next_poll: '2000-01-01T00:00:00.000Z',
        provider: 'direct_html_conservative',
        access_status: 'blocked',
        last_error: 'blocked by robots policy',
      },
    },
  }));
  writeFileSync(jobsPath, JSON.stringify({ generated_at: '2026-01-01T00:00:00.000Z' }));
  writeFileSync(phdPath, JSON.stringify({ generated_at: '2026-01-02T00:00:00.000Z' }));

  const summary = summarizeSourceHealth({ registryPath, statePath, jobsPath, phdPath }, new Date('2026-01-03T00:00:00.000Z'));
  assert.equal(summary.sources_total, 2);
  assert.equal(summary.failing_sources.length, 1);
  assert.equal(summary.stale_sources.length, 1);
  assert.equal(summary.status_counts[404], 1);
  assert.equal(summary.failing_sources[0].provider, 'direct_html_conservative');
  assert.equal(summary.failing_sources[0].access_status, 'blocked');
  assert.equal(summary.failing_sources[0].last_error, 'blocked by robots policy');
});
