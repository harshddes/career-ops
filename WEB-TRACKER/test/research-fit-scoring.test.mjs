import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreResearchProspect } from '../lib/research-fit-scoring.mjs';
import { normalizeResearchProspect } from '../lib/research-prospect-store.mjs';

const officialEvidence = [
  { label: 'Faculty profile', url: 'https://example.edu/faculty/person' },
  { label: 'Lab page', url: 'https://example.edu/lab' },
];

test('Jing Tang autonomous-lab evidence cannot exceed Tier C', () => {
  const result = scoreResearchProspect({
    name: 'Jing Tang',
    title: 'Assistant Professor',
    lab: 'Tang Group',
    lab_url: 'https://tang.engin.umich.edu/',
    current_focus: 'Autonomous laboratory and AI-powered materials discovery for batteries, catalysis, and materials synthesis.',
    research_interests_summary: 'Artificial intelligence, machine learning, autonomous laboratory, electrochemistry, materials synthesis.',
    methods: ['autonomous lab systems', 'machine learning', 'materials characterization'],
    evidence: officialEvidence,
  });

  assert.equal(result.tier, 'C');
  assert.ok(result.score <= 2.9);
  assert.ok(result.cap_reasons.some(reason => /AI\/ML\/simulation\/theory dominates/i.test(reason)));
});

test('verified plasma diagnostics hardware can earn Tier A', () => {
  const result = scoreResearchProspect({
    name: 'Experimental Plasma PI',
    title: 'Professor',
    lab: 'Plasma Diagnostics Laboratory',
    lab_url: 'https://example.edu/plasma-lab',
    current_focus: 'Experimental plasma diagnostics using vacuum chambers, high-voltage pulsed power, optical diagnostics, particle detectors, calibration, and synchronized data acquisition.',
    methods: ['vacuum chamber experiments', 'optical diagnostics', 'detector calibration', 'DAQ'],
    facilities: ['high-voltage vacuum test stand'],
    evidence: officialEvidence,
  });

  assert.equal(result.tier, 'A');
  assert.ok(result.score >= 4);
  assert.equal(result.score_breakdown.independent_hardware_evidence, true);
});

test('strategic physical manufacturing is valued but does not auto-become A', () => {
  const result = scoreResearchProspect({
    name: 'Manufacturing PI',
    title: 'Associate Professor',
    lab: 'Advanced Manufacturing Lab',
    lab_url: 'https://example.edu/manufacturing-lab',
    current_focus: 'Experimental additive manufacturing and precision machining with in-situ process monitoring, metrology, mechanical testing, and complex hardware fabrication.',
    methods: ['LPBF experiments', 'process monitoring', 'metrology', 'machining'],
    facilities: ['metal additive manufacturing laboratory'],
    evidence: officialEvidence,
  });

  assert.equal(result.tier, 'B');
  assert.ok(result.score >= 3);
  assert.ok(result.verified_overlap.some(item => /additive manufacturing/i.test(item)));
});

test('simulation and theory remain capped without physical hardware', () => {
  const result = scoreResearchProspect({
    name: 'Computational PI',
    title: 'Professor',
    current_focus: 'Computational modeling, CFD simulations, high-performance computing, optimization, and theory.',
    methods: ['CFD', 'HPC', 'numerical modeling'],
    evidence: officialEvidence,
  });

  assert.ok(['C', 'D'].includes(result.tier));
  assert.ok(result.score <= 2.9);
  assert.equal(result.score_breakdown.computation_dominant, true);
});

test('area T1 and generated prose cannot inflate canonical fit', () => {
  const base = {
    name: 'AI Lab PI',
    title: 'Assistant Professor',
    outreach_tier: 'T1',
    priority: 'T1',
    current_focus: 'AI-powered autonomous laboratory, machine learning, simulation, and optimization.',
    methods: ['machine learning', 'software platform'],
    evidence: officialEvidence,
  };
  const clean = scoreResearchProspect(base);
  const contaminated = scoreResearchProspect({
    ...base,
    fit_rationale: 'Strong plasma diagnostics, vacuum, DAQ, detector, and instrumentation fit.',
    outreach_angle: 'Lead with high-voltage experimental systems.',
    transfer_vectors: ['plasma diagnostics', 'DAQ', 'vacuum'],
  });

  assert.deepEqual(contaminated, clean);
  assert.ok(contaminated.score <= 2.9);
});

test('normalization refreshes generated defense answers but preserves user response', () => {
  const normalized = normalizeResearchProspect({
    name: 'Current Work PI',
    title: 'Professor',
    department: 'Mechanical Engineering',
    lab: 'Hardware Lab',
    current_focus: 'Builds and tests vacuum instrumentation.',
    fit_rationale: 'Verified hardware fit.',
    defense_sheet: [{
      id: 'professor_work',
      question: 'What this professor works on',
      researched_answer: 'STALE GENERATED ANSWER',
      user_response: 'My saved note',
    }],
  });
  const row = normalized.defense_sheet.find(item => item.id === 'professor_work');

  assert.ok(!row.researched_answer.includes('STALE GENERATED ANSWER'));
  assert.ok(row.researched_answer.includes('Current work: Builds and tests vacuum instrumentation.'));
  assert.equal(row.user_response, 'My saved note');
});
