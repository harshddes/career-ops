import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  loadOpportunityScoringPolicy,
  scoreOpportunity,
} from '../lib/opportunity-scoring/index.mjs';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const gold = JSON.parse(readFileSync(join(TEST_DIR, 'fixtures', 'opportunity-scoring-gold.json'), 'utf-8'));

test('gold set matches labeled eligibility, fit, review, and risk outcomes', () => {
  for (const fixture of gold.cases) {
    const result = scoreOpportunity(fixture.posting, {
      type: fixture.type,
      now: new Date(gold.now),
    });
    const expected = fixture.expected;
    assert.equal(result.policy_version, gold.policy_version, fixture.id);
    assert.equal(result.eligibility.status, expected.eligibility, fixture.id);
    if (expected.band) assert.equal(result.decision_band, expected.band, fixture.id);
    assert.equal(result.review_required, expected.review, fixture.id);
    if (expected.minimum_score !== undefined) {
      assert.ok(result.score >= expected.minimum_score, `${fixture.id}: ${result.score}`);
    }
    if (expected.maximum_score !== undefined) {
      assert.ok(result.score <= expected.maximum_score, `${fixture.id}: ${result.score}`);
    }
    if (expected.risk) assert.ok(result.risk_flags.includes(expected.risk), fixture.id);
  }
});

test('small weight changes do not reverse clear gold-set decisions', () => {
  const policy = loadOpportunityScoringPolicy();
  const adjusted = structuredClone(policy);
  adjusted.dimensions.daily_work_interest.weight -= 0.02;
  adjusted.dimensions.hands_on_alignment.weight += 0.02;

  for (const fixture of gold.cases.filter(item => !item.expected.review)) {
    const baseline = scoreOpportunity(fixture.posting, {
      type: fixture.type,
      now: new Date(gold.now),
      policy,
    });
    const changed = scoreOpportunity(fixture.posting, {
      type: fixture.type,
      now: new Date(gold.now),
      policy: adjusted,
    });
    assert.equal(changed.eligibility.status, baseline.eligibility.status, fixture.id);
    assert.equal(changed.decision_band, baseline.decision_band, fixture.id);
  }
});
