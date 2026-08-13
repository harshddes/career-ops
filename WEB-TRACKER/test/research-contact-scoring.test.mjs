import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  facultyEvidenceText,
  matchResearchConcepts,
  scoreResearchContact,
  RESEARCH_CONTACT_POLICY_VERSION,
} from '../lib/opportunity-scoring/index.mjs';
import { scoreResearchProspect } from '../lib/research-fit-scoring.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const gold = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'research-contact-scoring-gold.json'), 'utf8'));

function tierAllowed(actual, expected) {
  if (Array.isArray(expected)) return expected.includes(actual);
  return actual === expected;
}

test('research gold set recovers prime instrumentation contacts without letting relationship change Tier', () => {
  for (const caseItem of gold) {
    const scored = scoreResearchContact(caseItem.prospect);
    const expected = caseItem.expected;
    if (expected.min_score !== undefined) {
      assert.ok(scored.score >= expected.min_score, `${caseItem.id}: score ${scored.score} < ${expected.min_score}`);
    }
    if (expected.max_score !== undefined) {
      assert.ok(scored.score <= expected.max_score, `${caseItem.id}: score ${scored.score} > ${expected.max_score}`);
    }
    if (expected.tier !== undefined) {
      assert.ok(tierAllowed(scored.tier, expected.tier), `${caseItem.id}: tier ${scored.tier} not in ${JSON.stringify(expected.tier)}`);
    }
    if (expected.max_tier) {
      assert.ok(tierAllowed(scored.tier, expected.max_tier) || scored.tier === expected.max_tier, `${caseItem.id}: unexpected tier ${scored.tier}`);
    }
    if (expected.confidence) {
      assert.equal(scored.confidence, expected.confidence, `${caseItem.id}: confidence`);
    }
    const conceptIds = (scored.concepts || []).map(item => item.concept_id);
    for (const conceptId of expected.must_include_concepts || []) {
      assert.ok(conceptIds.includes(conceptId), `${caseItem.id}: missing concept ${conceptId}`);
    }
    for (const conceptId of expected.must_not_include_concepts || []) {
      assert.ok(!conceptIds.includes(conceptId), `${caseItem.id}: unexpected concept ${conceptId}`);
    }
    for (const flag of expected.risk_flags_include || []) {
      assert.ok(scored.risk_flags.includes(flag), `${caseItem.id}: missing risk ${flag}`);
    }
    if (expected.relationship_does_not_change_tier) {
      const withoutRelationship = scoreResearchContact({
        ...caseItem.prospect,
        status: 'not_contacted',
        outreach_status_detail: '',
        outreach_outcome: '',
      });
      assert.equal(scored.tier, withoutRelationship.tier, `${caseItem.id}: relationship altered Tier`);
      assert.equal(scored.score, withoutRelationship.score, `${caseItem.id}: relationship altered score`);
    }
  }
});

test('research adapter uses research-contact policy and isolates from job scorer', () => {
  const result = scoreResearchProspect({
    name: 'Martin Rubin',
    title: 'Space Mass Spectrometry',
    lab: 'Space Mass Spectrometry',
  });
  assert.equal(result.policy_version, RESEARCH_CONTACT_POLICY_VERSION);
  assert.equal(result.scoring_kind, 'research_contact');
  assert.ok(result.score >= 4.0);
  assert.ok(['A', 'B'].includes(result.tier));
  assert.equal(result.confidence, 'low');
  assert.ok(result.relationship_signal);
  assert.ok(result.funding_opening_signal);
});

test('unique concepts do not double-count synonyms and ignore outreach prose', () => {
  const text = facultyEvidenceText({
    title: 'Space Mass Spectrometry',
    current_focus: 'Space mass spectrometry and LIMS laser-ionization mass spectrometry',
    fit_rationale: 'Ignore this plasma diagnostics sales pitch',
    outreach_angle: 'Ignore tokamak vacuum chamber bait',
  });
  const matches = matchResearchConcepts(text);
  const spaceMs = matches.filter(item => item.concept_id === 'space_mass_spectrometry');
  assert.equal(spaceMs.length, 1);
  assert.equal(matches.some(item => item.concept_id === 'plasma_diagnostics'), false);
});

test('identical research evidence is reproducible', () => {
  const prospect = {
    title: 'Plasma Edge Physics and Diagnostics',
    current_focus: 'CXRS and Motional Stark Effect diagnostics on Magnum-PSI',
  };
  const first = scoreResearchContact(prospect);
  const second = scoreResearchContact(structuredClone(prospect));
  assert.equal(JSON.stringify(first.calculation_trace), JSON.stringify(second.calculation_trace));
  assert.equal(first.score, second.score);
});
