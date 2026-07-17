import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  eligibleForFactory,
  nextFactoryStage,
  queueEuraxessOpportunityWork,
  selectFactoryCandidates,
} from '../lib/euraxess/factory.mjs';
import {
  normalizeEuraxessOpportunityRecord,
  patchEuraxessOpportunity,
  writeEuraxessOpportunities,
} from '../lib/euraxess/opportunity-store.mjs';
import {
  euraxessBackfillDedupeKey,
  matchesBackfillProfile,
} from '../euraxess-backfill.mjs';

function tempStorePath() {
  return join(mkdtempSync(join(tmpdir(), 'career-ops-euraxess-factory-')), 'euraxess-opportunities.json');
}

test('EURAXESS factory normalization preserves nested automation and artifacts', () => {
  const item = normalizeEuraxessOpportunityRecord({
    id: 'euraxess-fusion-123',
    title: 'Doctoral candidate in plasma diagnostics',
    url: 'https://euraxess.ec.europa.eu/jobs/123',
    institution: 'Example Fusion Lab',
    score: 4.2,
    status: 'open_unverified',
    automation: {
      worker_status: 'queued_research',
      current_stage: 'queued_research',
      attempts: 2,
      last_error: 'previous transient failure',
    },
    artifacts: {
      research_report: 'reports/euraxess-example.md',
    },
  });

  assert.equal(item.worker_status, 'queued_research');
  assert.equal(item.automation.attempts, 2);
  assert.equal(item.automation.current_stage, 'queued_research');
  assert.equal(item.artifacts.research_report, 'reports/euraxess-example.md');
  assert.equal(item.resources.report_md, 'reports/euraxess-example.md');
  assert.equal(item.verification.verification_required, true);
});

test('patchEuraxessOpportunity merges nested factory fields and returns the updated id after sorting', () => {
  const filePath = tempStorePath();
  writeEuraxessOpportunities({
    version: 1,
    generated_at: '2026-07-05T00:00:00.000Z',
    scan_summary: {},
    opportunities: [
      {
        id: 'low',
        title: 'Low fit posting',
        url: 'https://example.org/low',
        institution: 'Example',
        score: 1.5,
      },
      {
        id: 'target',
        title: 'Plasma diagnostics posting',
        url: 'https://example.org/target',
        institution: 'Example',
        score: 4.5,
        automation: { attempts: 1, worker_status: 'queued_research' },
        resources: { existing: 'output/existing.pdf' },
      },
    ],
  }, filePath);

  const result = patchEuraxessOpportunity('target', {
    worker_status: 'research_ready',
    automation: { worker_status: 'research_ready', current_stage: 'research_ready' },
    resources: { report_md: 'reports/euraxess-target.md' },
  }, filePath);

  assert.equal(result.opportunity.id, 'target');
  assert.equal(result.opportunity.worker_status, 'research_ready');
  assert.equal(result.opportunity.automation.attempts, 1);
  assert.equal(result.opportunity.automation.current_stage, 'research_ready');
  assert.equal(result.opportunity.resources.existing, 'output/existing.pdf');
  assert.equal(result.opportunity.resources.report_md, 'reports/euraxess-target.md');
});

test('factory candidate selection follows score, status, and stage rules', () => {
  const store = {
    opportunities: [
      { id: 'low', score: 2.9, status: 'open_unverified', worker_status: 'not_needed' },
      { id: 'low-failed', score: 2.2, status: 'open_unverified', worker_status: 'failed_retryable' },
      { id: 'expired', score: 4.8, status: 'closed', worker_status: 'queued_research' },
      { id: 'ready', score: 4.1, status: 'open', worker_status: 'research_ready' },
      { id: 'candidate', score: 3.8, status: 'open_unverified', worker_status: 'queued_research' },
      { id: 'failed-candidate', score: 4.2, status: 'open_unverified', worker_status: 'failed_retryable' },
    ],
  };

  assert.equal(eligibleForFactory(store.opportunities[0]), false);
  assert.equal(eligibleForFactory(store.opportunities[1]), false);
  assert.equal(eligibleForFactory(store.opportunities[4]), true);
  assert.equal(nextFactoryStage({ score: 4.2, status: 'open', artifacts: { research_report: 'reports/a.md' } }), 'queued_pack');
  assert.deepEqual(selectFactoryCandidates(store, { max: 3 }).map(item => item.id), ['failed-candidate', 'candidate']);
  assert.deepEqual(selectFactoryCandidates(store, { max: 3, retryFailures: true }).map(item => item.id), ['failed-candidate']);
});

test('backfill profile matching and dedupe prefer EURAXESS job ids', () => {
  const posting = {
    title: 'Postdoctoral researcher in space plasma instrumentation',
    url: 'https://euraxess.ec.europa.eu/jobs/987654',
    description: 'Detector instrumentation and calibration for heliophysics.',
  };

  assert.equal(matchesBackfillProfile(posting, 'space_plasma'), true);
  assert.equal(matchesBackfillProfile(posting, 'mass_spectrometry'), false);
  assert.equal(euraxessBackfillDedupeKey(posting), '987654');
});

test('queueEuraxessOpportunityWork creates research and pack agent tasks', () => {
  const stamp = Date.now();
  const opportunity = {
    id: `euraxess-fusion-test-${stamp}`,
    title: `PhD in plasma diagnostics ${stamp}`,
    url: `https://euraxess.ec.europa.eu/jobs/test-${stamp}`,
    institution: `Example Fusion Lab ${stamp}`,
    score: 4.1,
    fit_rationale: 'Strong match: plasma, diagnostics.',
  };

  const research = queueEuraxessOpportunityWork(opportunity, { pack: false });
  assert.ok(research.jobsToConsiderId);
  assert.ok(research.tasks.length >= 1);
  assert.equal(research.tasks[0].type, 'deep_research');

  const pack = queueEuraxessOpportunityWork(opportunity, { pack: true });
  assert.ok(pack.tasks.length >= 1);
  assert.equal(pack.tasks[0].type, 'application_artifact');
  assert.equal(pack.tasks[0].artifact_kind, 'application_pack');

  // Second queue should not duplicate when an identical task already exists.
  const again = queueEuraxessOpportunityWork(opportunity, { pack: false });
  assert.equal(again.tasks.length, 0);
});
