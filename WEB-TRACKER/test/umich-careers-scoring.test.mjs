import test from 'node:test';
import assert from 'node:assert/strict';
import { loadUmichScoringPolicy, scoreUmichPosting, UMICH_SEGMENTS } from '../lib/umich-careers/scoring-profile.mjs';

const NOW = new Date('2026-07-21T12:00:00.000Z');

function score(posting) {
  return scoreUmichPosting({ posting_end_date: '2099-01-01', status: 'open', ...posting }, NOW);
}

test('policy loads with user thresholds and version', () => {
  const policy = loadUmichScoringPolicy({ forceReload: true });
  assert.ok(policy.policy_version);
  assert.ok(policy.thresholds.apply_now >= policy.thresholds.high_relevance);
  assert.ok(policy.thresholds.high_relevance >= policy.thresholds.adjacent);
  assert.ok(Array.isArray(policy.domains.core) && policy.domains.core.length > 0);
});

test('nuclear research role with fit lands in apply_now', () => {
  const result = score({
    title: 'Nuclear Engineering Research Associate',
    department: 'NERS',
    description: 'Support fission reactor experiments, radiation detection instrumentation, and plasma diagnostics.',
  });
  assert.equal(result.segment, 'apply_now');
  assert.equal(result.direct_domain, true);
  assert.equal(result.visible, true);
});

test('space and aerospace get the proximity bonus and outrank generic strong domains', () => {
  const space = score({
    title: 'Spacecraft Instrumentation Engineer',
    description: 'Design payload instrumentation for heliophysics missions, spacecraft integration and satellite testing.',
  });
  const generic = score({
    title: 'Mechanical Engineer',
    description: 'General facilities mechanical engineering support.',
  });
  assert.ok(['apply_now', 'high_relevance'].includes(space.segment));
  assert.ok(space.score > generic.score, `space ${space.score} should outrank generic ${generic.score}`);
  assert.ok(space.score_breakdown.protected_domain_matches.includes('spacecraft'));
});

test('requested strong domains (MEMS, electrical) stay visible via the domain floor', () => {
  const mems = score({
    title: 'MEMS Research Engineer',
    description: 'Microfabrication of MEMS sensors, cleanroom semiconductor processing.',
  });
  assert.equal(mems.segment, 'adjacent');
  assert.equal(mems.visible, true);
  assert.equal(mems.direct_domain, false);

  const electrical = score({
    title: 'Senior Electrical Engineer',
    description: 'Substation, secondary power, lighting and fire alarm electrical systems for campus buildings.',
  });
  assert.equal(electrical.segment, 'other');
  assert.equal(electrical.visible, false);
});

test('commercialization fellowship stays separate from technical personal fit', () => {
  const result = score({
    title: 'Innovation Partnerships Fellow',
    job_title: 'Lic/Patent Assoc Tech Transfer',
    department: 'UMOR Innovation Partnerships',
    description: 'Research the commercial and patent potential of engineering and physical sciences inventions, identify licensees, market early-stage technologies, and coordinate PhD students.',
  });
  assert.equal(result.segment, 'other');
  assert.equal(result.direct_domain, false);
  assert.equal(result.visible, false);
});

test('project management is prioritized only when coupled to a requested technical domain', () => {
  const aerospace = score({
    title: 'Project Manager - Space Instrumentation',
    description: 'Manage spacecraft payload instrumentation development and aerospace engineering test milestones.',
  });
  const generic = score({
    title: 'Project Manager',
    description: 'Manage administrative scheduling, office moves, budgets, and stakeholder communications.',
  });
  assert.equal(aerospace.segment, 'apply_now');
  assert.equal(aerospace.visible, true);
  assert.equal(generic.direct_domain, false);
  assert.equal(generic.segment, 'other');
});

test('faculty and postdoc titles are wrong-role skips, not attractive averages', () => {
  const faculty = score({
    title: 'Assistant Professor of Aerospace Engineering',
    description: 'Tenure-track faculty position in aerospace engineering, spacecraft propulsion research.',
  });
  assert.equal(faculty.segment, 'other');
  assert.ok(faculty.risk_flags.includes('role_not_targeted'));

  const postdoc = score({
    title: 'Postdoctoral Fellow - Plasma Physics',
    description: 'Research in plasma physics and fusion diagnostics.',
  });
  assert.equal(postdoc.segment, 'other');
  assert.notEqual(postdoc.segment, 'apply_now');
});

test('false friends do not trigger domain matches', () => {
  const bloodPlasma = score({
    title: 'Phlebotomist - Plasma Donation Center',
    description: 'Collect blood plasma donations from patients at the plasma center.',
  });
  assert.equal(bloodPlasma.direct_domain, false);
  assert.equal(bloodPlasma.segment, 'other');

  const officeSpace = score({
    title: 'Space Planning Coordinator',
    description: 'Manage office space assignments and work space planning for campus buildings.',
  });
  assert.equal(officeSpace.direct_domain, false);

  const orgClimate = score({
    title: 'HR Climate Survey Specialist',
    description: 'Run the organizational climate survey and improve the workplace climate of inclusion.',
  });
  assert.equal(orgClimate.direct_domain, false);

  const nuclearMedicine = score({
    title: 'Nuclear Medicine Technologist',
    description: 'Perform nuclear medicine imaging procedures in radiology.',
  });
  assert.equal(nuclearMedicine.segment, 'other');
});

test('real climate science posting is a direct domain match', () => {
  const result = score({
    title: 'Climate Science Research Specialist',
    description: 'Atmospheric science research on climate models and space weather interactions with satellite observations.',
  });
  assert.equal(result.direct_domain, true);
  assert.equal(result.segment, 'adjacent');
  assert.equal(result.visible, true);
});

test('MS is interpreted as materials science, not a bare text match', () => {
  const materials = score({
    title: 'Materials Science Research Technician',
    description: 'Materials science characterization of alloys.',
  });
  assert.equal(materials.direct_domain, false);
  assert.equal(materials.segment, 'adjacent');

  const msWord = score({
    title: 'Administrative Assistant',
    description: 'Support MS Word and MS Excel document workflows for the dean\u2019s office.',
  });
  assert.equal(msWord.direct_domain, false);
  assert.equal(msWord.segment, 'other');
});

test('negative topics push non-domain postings to other but cannot bury domain matches', () => {
  const marketing = score({
    title: 'Marketing Communications Specialist',
    description: 'Develop marketing materials and fundraising campaigns for athletics.',
  });
  assert.equal(marketing.segment, 'other');

  const guarded = score({
    title: 'Nuclear Reactor Laboratory Engineer',
    description: 'Operate the research reactor; occasional marketing of outreach events and food service coordination for tours.',
  });
  assert.ok(guarded.visible, 'domain match must stay visible despite soft negatives');
  assert.notEqual(guarded.segment, 'other');
});

test('past posting end date closes the posting', () => {
  const result = scoreUmichPosting({
    title: 'Aerospace Engineer',
    description: 'Spacecraft systems.',
    posting_end_date: '2026-01-01',
    status: 'open',
  }, NOW);
  assert.equal(result.segment, 'closed');
  assert.equal(result.visible, false);
});

test('closing soon flag set within seven days', () => {
  const result = scoreUmichPosting({
    title: 'Aerospace Engineer',
    description: 'Spacecraft propulsion testing.',
    posting_end_date: '2026-07-25',
    status: 'open',
  }, NOW);
  assert.ok(result.risk_flags.includes('closing_soon'));
  assert.notEqual(result.segment, 'closed');
});

test('every segment value is canonical', () => {
  const samples = [
    score({ title: 'Nuclear Engineer', description: 'fusion plasma' }),
    score({ title: 'Custodian II', description: 'custodial services' }),
    score({ title: 'Research Laboratory Technician', description: 'general research laboratory support and calibration' }),
  ];
  for (const sample of samples) {
    assert.ok(UMICH_SEGMENTS.includes(sample.segment), `unknown segment ${sample.segment}`);
  }
});
