import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  EVIDENCE_SCHEMA_VERSION,
  externalScoreToLegacy,
  loadOpportunityScoringPolicy,
  scoreOpportunity,
  validateEvidenceExtraction,
} from '../lib/opportunity-scoring/index.mjs';
import { scoreEuraxessPosting } from '../lib/euraxess/scoring-profile.mjs';
import { scorePhdscannerPosting } from '../lib/phdscanner/scoring-profile.mjs';
import { scoreUmichPosting } from '../lib/umich-careers/scoring-profile.mjs';
import {
  findConsiderJob,
  patchConsiderJob,
  upsertConsiderJob,
} from '../lib/jobs-to-consider-store.mjs';

const NOW = new Date('2026-08-08T12:00:00.000Z');
const POSTING = {
  title: 'Fusion Plasma Diagnostics Engineer',
  description: 'Visa sponsorship available. Build tokamak vacuum instrumentation, detector readout, DAQ, high-voltage calibration hardware, and experimental test stands.',
  deadline_utc: '2027-01-01T23:59:00.000Z',
  fully_funded: true,
};

test('same policy, evidence, and clock produce byte-identical results', () => {
  const policy = loadOpportunityScoringPolicy();
  const first = scoreOpportunity(POSTING, { type: 'job', policy, now: NOW });
  const second = scoreOpportunity(structuredClone(POSTING), { type: 'job', policy, now: NOW });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('quote verification accepts exact evidence and rejects agent decisions', () => {
  const policy = loadOpportunityScoringPolicy();
  const valid = validateEvidenceExtraction({
    schema_version: EVIDENCE_SCHEMA_VERSION,
    claims: [{
      field: 'hands_on_work',
      value: 'verified',
      quote: 'detector readout, DAQ',
      source_location: 'requirements',
      candidate_fact_ids: ['fpga-detector-readout'],
    }],
    unknowns: [],
    extractor: { provider: 'fixture', model: 'small-model', run_id: 'one' },
  }, { sourceText: POSTING.description, policy });
  assert.equal(valid.valid, true);
  assert.equal(valid.accepted.length, 1);

  const invalid = validateEvidenceExtraction({
    schema_version: EVIDENCE_SCHEMA_VERSION,
    score: 4.9,
    recommendation: 'apply',
    claims: [{
      field: 'hands_on_work',
      value: 'verified',
      quote: 'a fabricated quotation',
      candidate_fact_ids: ['invented-cv-fact'],
    }],
    unknowns: [],
  }, { sourceText: POSTING.description, policy });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.rejected.some(item => item.reason === 'agent_decision_field_forbidden'));
  assert.ok(invalid.rejected.some(item => item.reasons?.includes('quote_not_found_in_posting')));
  assert.ok(invalid.rejected.some(item => item.reasons?.includes('unknown_candidate_fact_id')));
});

test('extractor identity cannot change canonical arithmetic', () => {
  const claim = {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    claims: [{
      field: 'technical_domain',
      value: 'fusion diagnostics',
      quote: 'tokamak vacuum instrumentation',
      source_location: 'description',
      candidate_fact_ids: ['lvaccs-hv-daq'],
    }],
    unknowns: [],
  };
  const weak = scoreOpportunity(POSTING, {
    type: 'job',
    now: NOW,
    extraction: { ...claim, extractor: { provider: 'test', model: 'weak', run_id: 'a' } },
  });
  const strong = scoreOpportunity(POSTING, {
    type: 'job',
    now: NOW,
    extraction: { ...claim, extractor: { provider: 'test', model: 'strong', run_id: 'b' } },
  });
  assert.equal(weak.score, strong.score);
  assert.deepEqual(weak.dimensions, strong.dimensions);
  assert.deepEqual(weak.calculation_trace, strong.calculation_trace);
});

test('malformed and conflicting extractor runs abstain for review', () => {
  const malformed = scoreOpportunity(POSTING, {
    type: 'job',
    now: NOW,
    extraction: { schema_version: 'wrong-version', claims: 'not-an-array' },
  });
  assert.equal(malformed.review_required, true);
  assert.equal(malformed.confidence, 'low');
  assert.ok(malformed.review_reasons.includes('rejected_or_malformed_extraction'));

  const base = {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    unknowns: [],
    extractor: { provider: 'fixture', model: 'small', run_id: 'one' },
  };
  const conflicting = scoreOpportunity(POSTING, {
    type: 'job',
    now: NOW,
    extraction: [
      {
        ...base,
        claims: [{
          field: 'technical_domain',
          value: 'fusion diagnostics',
          quote: 'tokamak vacuum instrumentation',
          source_location: 'description',
          candidate_fact_ids: ['lvaccs-hv-daq'],
        }],
      },
      {
        ...base,
        extractor: { ...base.extractor, run_id: 'two' },
        claims: [{
          field: 'technical_domain',
          value: 'detector electronics',
          quote: 'detector readout',
          source_location: 'description',
          candidate_fact_ids: ['fpga-detector-readout'],
        }],
      },
    ],
  });
  assert.equal(conflicting.review_required, true);
  assert.ok(conflicting.unknowns.includes('extraction_conflict'));
  assert.ok(conflicting.review_reasons.includes('conflicting_extractions'));
});

test('hard blockers, stale deadlines, and missing gates fail safely', () => {
  const blocked = scoreOpportunity({
    ...POSTING,
    description: `${POSTING.description} U.S. citizens only. Active Secret clearance required.`,
  }, { type: 'job', now: NOW });
  assert.equal(blocked.eligibility.status, 'blocked');
  assert.ok(blocked.score <= 1);

  const stale = scoreOpportunity({ ...POSTING, deadline_utc: '2025-01-01' }, { type: 'job', now: NOW });
  assert.equal(stale.eligibility.status, 'blocked');
  assert.ok(stale.risk_flags.includes('deadline_passed'));

  const unknown = scoreOpportunity({ title: 'Engineer' }, { type: 'job', now: NOW });
  assert.equal(unknown.eligibility.status, 'unknown');
  assert.equal(unknown.review_required, true);
  assert.equal(unknown.confidence, 'low');
});

test('all source adapters produce the same canonical score meaning', () => {
  const euraxess = scoreEuraxessPosting(POSTING, NOW);
  const phdscanner = scorePhdscannerPosting(POSTING, NOW);
  const umich = scoreUmichPosting(POSTING, NOW);
  assert.equal(euraxess.score, phdscanner.score);
  assert.equal(phdscanner.score, umich.score);
  assert.equal(euraxess.policy_version, umich.policy_version);
  assert.deepEqual(euraxess.dimensions, umich.dimensions);
});

test('external score fields are demoted and recorded, never trusted', () => {
  const result = externalScoreToLegacy({
    score: '4.9/5',
    confidence: 'high',
    recommendation: 'apply',
  }, { legacy_score: '3.2/5', score_overrides: [] });
  assert.equal(result.score, undefined);
  assert.equal(result.confidence, undefined);
  assert.equal(result.recommendation, undefined);
  assert.equal(result.legacy_score, '3.2/5');
  assert.equal(result.score_overrides.at(-1).attempted_value, '4.9/5');
});

test('Jobs to Consider write boundary preserves legacy score and recalculates canonical score', () => {
  const directory = mkdtempSync(join(tmpdir(), 'opportunity-score-'));
  const filePath = join(directory, 'jobs.json');
  try {
    upsertConsiderJob({
      id: 'boundary-job',
      company: 'Boundary Labs',
      title: POSTING.title,
      posting_text: POSTING.description,
      score: '0.1/5',
    }, filePath);
    const created = findConsiderJob('boundary-job', JSON.parse(readFileSync(filePath, 'utf-8')));
    assert.notEqual(created.score, 0.1);
    assert.equal(created.legacy_score, '0.1/5');
    const canonicalScore = created.score;

    patchConsiderJob('boundary-job', { score: '5.0/5' }, filePath);
    const patched = findConsiderJob('boundary-job', JSON.parse(readFileSync(filePath, 'utf-8')));
    assert.equal(patched.score, canonicalScore);
    assert.equal(patched.score_overrides.at(-1).attempted_value, '5.0/5');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
