import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHIVE_THRESHOLD,
  STRONG_THRESHOLD,
  VISIBLE_THRESHOLD,
  scoreEuraxessPosting,
} from '../lib/euraxess/scoring-profile.mjs';

const NOW = new Date('2026-07-09T12:00:00.000Z');

test('space science detector role clears adjacent/strong visibility', () => {
  const result = scoreEuraxessPosting({
    title: 'PhD position in space science detector technology',
    description: 'Spacecraft payload instrumentation, spectrometer calibration, and charged particle detectors for heliophysics.',
    institution: 'ESA partner lab',
    researcher_profile: 'First Stage Researcher (R1)',
    deadline_utc: '2099-05-01T00:00:00.000Z',
  }, NOW);

  assert.ok(result.score >= VISIBLE_THRESHOLD, `expected >= ${VISIBLE_THRESHOLD}, got ${result.score}`);
  assert.ok(['adjacent_review', 'strong_review', 'top_priority'].includes(result.score_band));
  assert.equal(result.visible, true);
  assert.equal(result.archived, false);
  assert.ok(result.score_breakdown.strong_matches.some(term => /space|detector|spectrometer|heliophysics|payload/.test(term)));
  assert.match(result.fit_rationale, /Strong match/i);
});

test('fusion diagnostics posting lands in strong review', () => {
  const result = scoreEuraxessPosting({
    title: 'Doctoral candidate in fusion plasma diagnostics',
    description: 'Tokamak diagnostics, DAQ, FPGA readout, vacuum instrumentation, and calibration.',
    institution: 'Fusion Institute',
    academic_level: 'PhD Positions',
    researcher_profile: 'First Stage Researcher (R1)',
    deadline_utc: '2099-06-01T00:00:00.000Z',
  }, NOW);

  assert.ok(result.score >= STRONG_THRESHOLD, `expected >= ${STRONG_THRESHOLD}, got ${result.score}`);
  assert.ok(['strong_review', 'top_priority'].includes(result.score_band));
  assert.equal(result.visible, true);
  assert.ok(result.score_breakdown.strong_matches.includes('fusion'));
  assert.ok(result.score_breakdown.strong_matches.includes('plasma'));
});

test('CERN detector technology and mass spectrometer vocabulary score up', () => {
  const cern = scoreEuraxessPosting({
    title: 'Research engineer — CERN detector technology',
    description: 'Magnetic spectrometer, TOF, ion optics, and readout electronics at CERN.',
    researcher_profile: 'Recognised Researcher (R2)',
    deadline_utc: '2099-08-01T00:00:00.000Z',
  }, NOW);
  assert.ok(cern.score >= STRONG_THRESHOLD, `CERN score ${cern.score}`);
  assert.ok(cern.score_breakdown.strong_matches.includes('cern'));

  const ms = scoreEuraxessPosting({
    title: 'Research engineer in mass spectrometry',
    description: 'ICP-MS, QMS, laser-induced plasma (LIP), and vacuum systems for analytical instrumentation.',
    researcher_profile: 'First Stage Researcher (R1)',
    deadline_utc: '2099-08-01T00:00:00.000Z',
  }, NOW);
  assert.ok(ms.score >= VISIBLE_THRESHOLD, `MS score ${ms.score}`);
  assert.ok(ms.score_breakdown.strong_matches.some(term => /spectrometer|icp-ms|qms|lip|laser-induced plasma/.test(term)));
});

test('dentistry and agriculture junk score into archive band', () => {
  const dental = scoreEuraxessPosting({
    title: 'PhD in clinical dentistry and orthodontics',
    description: 'Dental clinic research, nursing collaboration, and patient care pathways.',
    researcher_profile: 'First Stage Researcher (R1)',
    deadline_utc: '2099-09-01T00:00:00.000Z',
  }, NOW);
  assert.ok(dental.score < ARCHIVE_THRESHOLD || dental.score_band === 'archive', `dental score ${dental.score} band ${dental.score_band}`);
  assert.equal(dental.score_band, 'archive');
  assert.equal(dental.archived, true);
  assert.equal(dental.visible, false);
  assert.ok(dental.risk_flags.includes('negative_topic_match'));

  const agri = scoreEuraxessPosting({
    title: 'Sales and marketing role in agriculture sociology',
    description: 'HR recruitment for agricultural law and literature history projects.',
    deadline_utc: '2099-09-01T00:00:00.000Z',
  }, NOW);
  assert.equal(agri.score_band, 'archive');
  assert.equal(agri.archived, true);
});

test('lone weak adjacent terms do not inflate without role or domain anchor', () => {
  const weak = scoreEuraxessPosting({
    title: 'Data control sensor robotics assistant',
    description: 'General data and control work with sensors and robotics.',
    deadline_utc: '2099-09-01T00:00:00.000Z',
  }, NOW);
  assert.ok(weak.score < VISIBLE_THRESHOLD, `weak score should stay low, got ${weak.score}`);
  assert.equal(weak.score_band, 'archive');
  assert.ok(weak.score_breakdown.adjacent_matches.length === 0 || weak.score < VISIBLE_THRESHOLD);
});

test('laboratory + postdoc without domain stays archived', () => {
  const bio = scoreEuraxessPosting({
    title: 'Postdoctoral position in Biochemistry / Microbiology / Mycology',
    description: 'The Laboratory of Biochemistry has an open postdoctoral fellowship.',
    researcher_profile: 'Recognised Researcher (R2)',
    deadline_utc: '2099-09-01T00:00:00.000Z',
  }, NOW);
  assert.equal(bio.score_band, 'archive');
  assert.equal(bio.visible, false);
  assert.ok(bio.risk_flags.includes('role_not_targeted') || bio.risk_flags.includes('negative_topic_match'));
});

test('ALBA cryogenic project engineer stays visible', () => {
  const alba = scoreEuraxessPosting({
    title: 'Project Engineer (Cryogenic)',
    description: 'ALBA Synchrotron Simulations, Fluids & Cryogenics Group. Cryostats, cryocoolers, helium liquefaction plant, engineering analyses.',
    institution: 'ALBA Synchrotron Light Source',
    deadline_utc: '2099-07-15T12:00:00.000Z',
  }, NOW);
  assert.ok(alba.score >= VISIBLE_THRESHOLD, `ALBA score ${alba.score}`);
  assert.equal(alba.archived, false);
  assert.ok(alba.score_breakdown.strong_matches.some(t => /cryogenic|synchrotron/.test(t)));
});

test('KU Leuven EJM manufacturing PhD stays visible (not health junk)', () => {
  const leuven = scoreEuraxessPosting({
    title: 'Marie Curie PhD vacancy (DC2) on Cobot-assisted and digitally-monitored electrolyte jet micromachining (EJM)',
    description: 'Mechanical engineering, materials engineering, precision engineering, electrochemical micromachining, process monitoring for implant surface structuring. Supervised by Prof. dr. ir. Krishna Kumar Saxena.',
    institution: 'KU Leuven',
    researcher_profile: 'First Stage Researcher (R1)',
    deadline_utc: '2099-09-16T23:59:00.000Z',
  }, NOW);
  assert.ok(leuven.score >= VISIBLE_THRESHOLD, `Leuven score ${leuven.score}`);
  assert.equal(leuven.archived, false);
  assert.ok(!leuven.risk_flags.includes('role_not_targeted'));
  assert.ok(leuven.score_breakdown.strong_matches.some(t => /micromachining|electrolyte|electrochemical|process monitoring/.test(t))
    || leuven.score_breakdown.adjacent_matches.some(t => /mechanical|manufacturing|materials/.test(t)));
});

test('controlled does not count as control; space matches whole word only', () => {
  const chem = scoreEuraxessPosting({
    title: 'PhD position: additive controlled enantioselective crystallization',
    description: 'Crystal growth under additive-controlled conditions.',
    researcher_profile: 'First Stage Researcher (R1)',
    deadline_utc: '2099-09-01T00:00:00.000Z',
  }, NOW);
  assert.ok(!chem.score_breakdown.adjacent_matches.includes('control'));
  assert.ok(chem.score < VISIBLE_THRESHOLD, `chem false friend score ${chem.score}`);

  const space = scoreEuraxessPosting({
    title: 'PhD in space applications detector technology',
    description: 'Infrared detection payload for spacecraft experiments.',
    researcher_profile: 'First Stage Researcher (R1)',
    deadline_utc: '2099-09-01T00:00:00.000Z',
  }, NOW);
  assert.ok(space.score_breakdown.strong_matches.includes('space'));
  assert.ok(space.score >= VISIBLE_THRESHOLD);
});
