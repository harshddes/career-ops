import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHIVE_THRESHOLD,
  STRONG_THRESHOLD,
  VISIBLE_THRESHOLD,
  scorePhdscannerPosting,
} from '../lib/phdscanner/scoring-profile.mjs';

const NOW = new Date('2026-07-09T12:00:00.000Z');

test('plasma diagnostics PhD clears strong visibility', () => {
  const result = scorePhdscannerPosting({
    title: 'PhD in Plasma Diagnostics and Spacecraft Instrumentation',
    summary: 'Tokamak diagnostics, Langmuir probes, mass spectrometry, FPGA readout, and vacuum instrumentation.',
    university: 'Demo Plasma Institute',
    country: 'Germany',
    deadline_utc: '2099-09-30T00:00:00.000Z',
  }, NOW);
  assert.ok(result.score >= STRONG_THRESHOLD, `score ${result.score}`);
  assert.equal(result.visible, true);
  assert.ok(result.score_breakdown.strong_matches.includes('plasma'));
});

test('funding flags do not change score', () => {
  const base = {
    title: 'PhD in cryogenic heat pipes',
    summary: 'Experimental cryogenics, thermal engineering, fluid mechanics.',
    university: 'Cranfield University',
    deadline_utc: '2099-08-31T00:00:00.000Z',
  };
  const unfunded = scorePhdscannerPosting(base, NOW);
  const funded = scorePhdscannerPosting({
    ...base,
    fully_funded: true,
    minimal_financial_barriers: true,
    funding_label: 'Fully funded with huge stipend bonus keywords funding tuition',
  }, NOW);
  assert.equal(unfunded.score, funded.score);
  assert.equal(unfunded.score_band, funded.score_band);
  assert.equal(funded.score_breakdown.funding_ignored, true);
});

test('dentistry junk archives', () => {
  const dental = scorePhdscannerPosting({
    title: 'PhD in clinical dentistry and orthodontics',
    summary: 'Dental clinic research and nursing collaboration.',
    deadline_utc: '2099-09-01T00:00:00.000Z',
  }, NOW);
  assert.equal(dental.score_band, 'archive');
  assert.equal(dental.archived, true);
  assert.ok(dental.score < ARCHIVE_THRESHOLD || dental.archived);
});

test('computation-dominant without hardware anchors is capped', () => {
  const result = scorePhdscannerPosting({
    title: 'PhD in artificial intelligence and machine learning',
    summary: 'Deep learning, computational modeling, data science, software development.',
    deadline_utc: '2099-10-01T00:00:00.000Z',
  }, NOW);
  assert.ok(result.score <= 2.9, `score ${result.score}`);
  assert.ok(result.risk_flags.includes('computation_dominant_no_hardware_anchor'));
});

test('visible threshold constant matches EURAXESS twin', () => {
  assert.equal(VISIBLE_THRESHOLD, 2.4);
  assert.equal(STRONG_THRESHOLD, 3.2);
});
