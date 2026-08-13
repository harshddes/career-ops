import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMigrationRow,
  parseLegacyScore,
  scoreRecord,
} from '../lib/opportunity-scoring/index.mjs';

const NOW = new Date('2026-08-08T12:00:00.000Z');
const RECORD = {
  id: 'migration-fixture',
  title: 'Fusion Test Engineer',
  description: 'Visa sponsorship available. Build fusion vacuum chamber instrumentation, high-voltage detector electronics, DAQ, calibration hardware, and experimental test stands.',
  legacy_score: '2.1/5',
};

test('shadow migration parses formatted legacy scores without changing canonical arithmetic', () => {
  assert.equal(parseLegacyScore('4.6/5'), 4.6);
  assert.equal(parseLegacyScore('not scored'), null);

  const row = buildMigrationRow('fixture', RECORD, 'job', { now: NOW });
  assert.equal(row.legacy_score, '2.1/5');
  assert.equal(row.delta, Number((row.canonical_score - 2.1).toFixed(2)));
  assert.equal(row.policy_version, row.scoring.policy_version);
  assert.ok(row.scoring.calculation_trace);
  assert.ok(row.scoring.dimensions);
});

test('migration preserves history and never retains the historical maximum', () => {
  const migrated = scoreRecord({
    ...RECORD,
    score: 5,
    legacy_score: '5.0/5',
  }, { type: 'job', now: NOW });

  assert.equal(migrated.legacy_score, '5.0/5');
  assert.notEqual(migrated.score, 5);
  assert.equal(migrated.score, migrated.scoring.score);
  assert.equal(migrated.policy_version, migrated.scoring.policy_version);
  assert.ok(migrated.posting_fingerprint);
});
