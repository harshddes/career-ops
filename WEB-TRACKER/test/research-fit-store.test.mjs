import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const canonical = JSON.parse(readFileSync(join(ROOT, 'data', 'umich-research-prospects.json'), 'utf8'));
const dashboard = JSON.parse(readFileSync(join(ROOT, 'WEB-TRACKER', 'data', 'umich-research-prospects.json'), 'utf8'));

function nameKey(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

test('canonical and dashboard U-M stores are synchronized row by row', () => {
  assert.equal(dashboard.prospects.length, canonical.prospects.length);
  const dashboardById = new Map(dashboard.prospects.map(item => [item.id, item]));
  for (const prospect of canonical.prospects) {
    const mirrored = dashboardById.get(prospect.id);
    assert.ok(mirrored, `missing dashboard row ${prospect.id}`);
    for (const field of ['score', 'tier', 'current_focus', 'daily_work_type', 'tier_cap']) {
      assert.deepEqual(mirrored[field], prospect[field], `${prospect.name}: ${field} differs`);
    }
    assert.deepEqual(mirrored.score_breakdown, prospect.score_breakdown, `${prospect.name}: score breakdown differs`);
    assert.deepEqual(mirrored.cap_reasons, prospect.cap_reasons, `${prospect.name}: cap reasons differ`);
    assert.deepEqual(mirrored.area_assessments, prospect.area_assessments, `${prospect.name}: area assessments differ`);
  }
});

test('canonical people are deduplicated and known joint appointments occur once', () => {
  const names = canonical.prospects.map(item => nameKey(item.name));
  assert.equal(new Set(names).size, names.length);
  for (const expectedName of ['Michael Bernitsas', 'Anchal Sareen', 'Jing Sun', 'Lei Zuo', 'Krishnan Mahesh', 'Karthik Duraisamy', 'Pingsha Dong']) {
    assert.equal(canonical.prospects.filter(item => nameKey(item.name) === nameKey(expectedName)).length, 1, `${expectedName} was not reconciled`);
  }
});

test('all rows persist canonical scoring fields and area ranks cannot set priority', () => {
  for (const prospect of canonical.prospects) {
    assert.equal(prospect.priority, prospect.tier, `${prospect.name}: priority is not canonical tier`);
    assert.equal(prospect.outreach_tier, '', `${prospect.name}: legacy outreach tier survived`);
    assert.ok(prospect.score_breakdown && typeof prospect.score_breakdown === 'object', `${prospect.name}: missing score breakdown`);
    assert.ok(prospect.score_audit && typeof prospect.score_audit === 'object', `${prospect.name}: missing score audit`);
    assert.ok(prospect.daily_work_type, `${prospect.name}: missing daily work type`);
    assert.ok(Array.isArray(prospect.cap_reasons), `${prospect.name}: cap reasons not persisted`);
    assert.ok(Array.isArray(prospect.verified_overlap), `${prospect.name}: verified overlap not persisted`);
    assert.ok(prospect.area_assessments && typeof prospect.area_assessments === 'object', `${prospect.name}: area assessments not persisted`);
  }
});

test('every Tier A/B row has tier-appropriate verified physical-work evidence', () => {
  const top = canonical.prospects.filter(item => ['A', 'B'].includes(item.tier));
  for (const prospect of top) {
    assert.ok(prospect.verified_overlap.length >= 1, `${prospect.name}: weak overlap`);
    assert.ok(prospect.score_breakdown.independent_hardware_evidence, `${prospect.name}: no independent hardware evidence`);
    if (prospect.tier === 'A') {
      assert.ok(prospect.score_breakdown.substantial_hardware_verified, `${prospect.name}: Tier A lacks substantial physical work`);
    }
    assert.ok(prospect.fit_rationale.trim().length >= 20, `${prospect.name}: explanation is missing`);
    assert.ok(prospect.calculation_trace?.final_score === prospect.score, `${prospect.name}: calculation trace differs`);
  }
});

test('Jing Tang is rescored from evidence instead of retaining a person-specific legacy cap', () => {
  const jing = canonical.prospects.find(item => item.name === 'Jing Tang');
  assert.ok(jing);
  assert.equal(jing.policy_version, '2026-08-research-contact-v1');
  assert.equal(jing.score, jing.scoring.score);
  assert.equal(jing.tier, jing.priority);
  assert.ok(jing.score_breakdown.dimensions);
  assert.ok(!jing.cap_reasons.some(reason => /Jing Tang/i.test(reason)));
});

test('research-contact cards expose relationship and funding outside technical Tier', () => {
  for (const prospect of canonical.prospects.slice(0, 20)) {
    assert.ok(prospect.relationship_signal && typeof prospect.relationship_signal === 'object', `${prospect.name}: missing relationship signal`);
    assert.ok(prospect.funding_opening_signal && typeof prospect.funding_opening_signal === 'object', `${prospect.name}: missing funding signal`);
    assert.equal(prospect.scoring_kind, 'research_contact');
  }
});
