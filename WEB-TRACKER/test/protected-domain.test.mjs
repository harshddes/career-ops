import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyProtectedDomainFloor,
  matchProtectedDomain,
} from '../lib/protected-domain.mjs';
import {
  VISIBLE_THRESHOLD,
  scorePhdscannerPosting,
} from '../lib/phdscanner/scoring-profile.mjs';
import { scoreEuraxessPosting } from '../lib/euraxess/scoring-profile.mjs';

const NOW = new Date('2026-07-13T16:00:00.000Z');

test('Surrey nuclear scintillator stays visible without deadline', () => {
  const result = scorePhdscannerPosting({
    title: 'High Light Yield Perovskite Scintillators For Nuclear Security Gamma Applications',
    summary: 'Develop perovskite scintillator gamma detectors for nuclear security.',
    university: 'University of Surrey',
    country: 'United Kingdom',
  }, NOW);
  assert.ok(result.score >= VISIBLE_THRESHOLD, `score ${result.score}`);
  assert.equal(result.visible, true);
  assert.equal(result.archived, false);
  assert.notEqual(result.score_band, 'archive');
  assert.ok(result.risk_flags.includes('protected_domain_floor'));
  assert.ok(result.score_breakdown.protected_domain_matches.length > 0);
});

test('Surrey nuclear scintillator archives only when deadline passed', () => {
  const result = scorePhdscannerPosting({
    title: 'High Light Yield Perovskite Scintillators For Nuclear Security Gamma Applications',
    summary: 'Perovskite scintillator gamma detectors for nuclear security.',
    university: 'University of Surrey',
    deadline_utc: '2026-07-12T23:59:00.000Z',
  }, NOW);
  assert.equal(result.archived, true);
  assert.equal(result.visible, false);
  assert.equal(result.score_band, 'archive');
  assert.ok(result.risk_flags.includes('deadline_passed'));
  assert.ok(result.risk_flags.includes('protected_domain_deadline_passed'));
});

test('manufacturing / mechanical / aerospace / physics floors are visible', () => {
  for (const title of [
    'PhD in Additive Manufacturing of Precision Aerospace Components',
    'PhD in Mechanical Engineering for Cryogenic Systems',
    'Experimental Physics PhD: Atomic and Subatomic Measurements',
    'Laser Diagnostics for Fusion Plasma Research',
  ]) {
    const result = scorePhdscannerPosting({ title, summary: title, deadline_utc: '' }, NOW);
    assert.equal(result.archived, false, title);
    assert.equal(result.visible, true, title);
    assert.ok(result.score >= VISIBLE_THRESHOLD, `${title} score ${result.score}`);
  }
});

test('EURAXESS nuclear corium PhD is not buried without deadline', () => {
  const result = scoreEuraxessPosting({
    title: 'Long-term behavior of nuclear coriums in aqueous media: influence of fission products',
    summary: 'Nuclear fission product stability and oxide leaching studies.',
    institution: 'CNRS',
    academic_level: 'PhD',
  }, NOW);
  assert.equal(result.visible, true);
  assert.equal(result.archived, false);
  assert.ok(result.score >= VISIBLE_THRESHOLD);
});

test('dentistry still archives; postdoc nuclear still role-archives', () => {
  const dental = scorePhdscannerPosting({
    title: 'PhD in clinical dentistry and orthodontics',
    summary: 'Dental clinic research and nursing collaboration.',
    deadline_utc: '2099-09-01T00:00:00.000Z',
  }, NOW);
  assert.equal(dental.score_band, 'archive');

  const postdoc = scoreEuraxessPosting({
    title: 'Post-doctoral fellow in Particle- and Nuclear Physics',
    summary: 'Nuclear physics postdoc at CERN-adjacent lab.',
    deadline_utc: '2099-09-01T00:00:00.000Z',
  }, NOW);
  assert.equal(postdoc.archived, true);
  assert.ok(postdoc.risk_flags.includes('role_not_targeted') || postdoc.risk_flags.includes('protected_domain_wrong_role'));
});

test('matchProtectedDomain catches scintillator / gamma / nuclear', () => {
  const hits = matchProtectedDomain('High light yield perovskite scintillators for Nuclear Security gamma applications');
  assert.ok(hits.includes('nuclear') || hits.includes('scintillator') || hits.includes('gamma'));
});

test('applyProtectedDomainFloor ignores negative archive when protected and open', () => {
  const floored = applyProtectedDomainFloor({
    score: 1.9,
    score_band: 'archive',
    visible: false,
    archived: true,
    risk_flags: ['missing_deadline', 'negative_topic_match'],
    score_breakdown: {},
    fit_rationale: 'Penalty: history.',
  }, {
    protectedMatches: ['nuclear', 'physics'],
    roleArchiveMatches: [],
    visibleThreshold: 2.4,
    scoreBandFn: (score) => (score >= 2.4 ? 'adjacent_review' : 'archive'),
  });
  assert.equal(floored.archived, false);
  assert.equal(floored.visible, true);
  assert.ok(floored.score >= 2.4);
});

test('assertCanArchiveOpportunity blocks protected open cards', async () => {
  const { assertCanArchiveOpportunity } = await import('../lib/protected-domain.mjs');
  const blocked = assertCanArchiveOpportunity({
    title: 'Nuclear fusion plasma diagnostics PhD',
    deadline_utc: '',
  });
  assert.equal(blocked.allowed, false);
  const allowed = assertCanArchiveOpportunity({
    title: 'Nuclear fusion plasma diagnostics PhD',
    deadline_utc: '2020-01-01T00:00:00.000Z',
  });
  assert.equal(allowed.allowed, true);
});
