import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  eligibleForFactory,
  nextFactoryStage,
  queuePhdscannerOpportunityWork,
  selectFactoryCandidates,
} from '../lib/phdscanner/factory.mjs';
import {
  normalizePhdscannerOpportunityRecord,
  patchPhdscannerOpportunity,
  writePhdscannerOpportunities,
} from '../lib/phdscanner/opportunity-store.mjs';

function tempStorePath() {
  return join(mkdtempSync(join(tmpdir(), 'career-ops-phdscanner-factory-')), 'phdscanner-opportunities.json');
}

test('PhDScanner factory normalization preserves nested automation and artifacts', () => {
  const item = normalizePhdscannerOpportunityRecord({
    id: 'phdscanner-123',
    title: 'Doctoral candidate in plasma diagnostics',
    url: 'https://www.phdscanner.com/opportunities/demo',
    university: 'Example Fusion Lab',
    score: 4.2,
    status: 'open_unverified',
    fully_funded: true,
    automation: {
      worker_status: 'queued_research',
      current_stage: 'queued_research',
      attempts: 2,
      last_error: 'previous transient failure',
    },
    artifacts: {
      research_report: 'reports/phdscanner-example.md',
    },
  });

  assert.equal(item.worker_status, 'queued_research');
  assert.equal(item.automation.attempts, 2);
  assert.equal(item.artifacts.research_report, 'reports/phdscanner-example.md');
  assert.equal(item.resources.report_md, 'reports/phdscanner-example.md');
  assert.equal(item.fully_funded, true);
});

test('patchPhdscannerOpportunity merges nested factory fields', () => {
  const filePath = tempStorePath();
  writePhdscannerOpportunities({
    version: 1,
    generated_at: '2026-07-05T00:00:00.000Z',
    scan_summary: {},
    opportunities: [
      {
        id: 'low',
        title: 'Low fit posting',
        url: 'https://example.org/low',
        university: 'Example',
        score: 1.5,
      },
      {
        id: 'target',
        title: 'Plasma diagnostics posting',
        url: 'https://example.org/target',
        university: 'Example',
        score: 4.5,
        automation: { attempts: 1, worker_status: 'queued_research' },
        resources: { existing: 'output/existing.pdf' },
      },
    ],
  }, filePath);

  const result = patchPhdscannerOpportunity('target', {
    worker_status: 'research_ready',
    automation: { worker_status: 'research_ready', current_stage: 'research_ready' },
    artifacts: { research_report: 'reports/phdscanner-target.md' },
    resources: { report_md: 'reports/phdscanner-target.md' },
  }, filePath);

  assert.equal(result.opportunity.id, 'target');
  assert.equal(result.opportunity.worker_status, 'research_ready');
  assert.equal(result.opportunity.artifacts.research_report, 'reports/phdscanner-target.md');
  assert.equal(result.opportunity.resources.existing, 'output/existing.pdf');
});

test('eligibleForFactory and nextFactoryStage honor research/pack thresholds', () => {
  const researchReady = {
    score: 3.6,
    status: 'open',
    worker_status: 'not_needed',
  };
  const packReady = {
    score: 4.2,
    status: 'open',
    worker_status: 'not_needed',
    artifacts: { research_report: 'reports/x.md' },
  };
  assert.equal(eligibleForFactory(researchReady), true);
  assert.equal(nextFactoryStage(researchReady), 'queued_research');
  assert.equal(nextFactoryStage(packReady), 'queued_pack');
  assert.equal(eligibleForFactory({ ...researchReady, score: 3.0 }), false);
});

test('selectFactoryCandidates picks open high-score items', () => {
  const store = {
    opportunities: [
      { id: 'a', score: 4.5, status: 'open', worker_status: 'not_needed', title: 'A' },
      { id: 'b', score: 2.0, status: 'open', worker_status: 'not_needed', title: 'B' },
      { id: 'c', score: 3.8, status: 'closed', worker_status: 'not_needed', title: 'C' },
    ],
  };
  const selected = selectFactoryCandidates(store, { max: 5 });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, 'a');
});

test('queuePhdscannerOpportunityWork creates dedicated lane tasks', () => {
  const queued = queuePhdscannerOpportunityWork({
    id: 'phdscanner-demo',
    title: 'PhD plasma diagnostics',
    university: 'Demo Lab',
    url: 'https://www.phdscanner.com/opportunities/demo',
    score: 4.1,
  }, { pack: false });
  assert.ok(queued.jobsToConsiderId);
  assert.ok(Array.isArray(queued.tasks));
});
