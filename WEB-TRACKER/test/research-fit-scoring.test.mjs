import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreResearchProspect, RESEARCH_FIT_POLICY_VERSION } from '../lib/research-fit-scoring.mjs';
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

  assert.ok(['C', 'D'].includes(result.tier));
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
  assert.ok(result.score >= 4.0);
  assert.equal(result.score_breakdown.independent_hardware_evidence, true);
});

test('strategic physical manufacturing is valued but does not auto-become A', () => {
  const result = scoreResearchProspect({
    name: 'Manufacturing PI',
    title: 'Professor',
    lab: 'Additive Manufacturing Lab',
    lab_url: 'https://example.edu/am-lab',
    current_focus: 'Additive manufacturing, LPBF process monitoring, metrology, and materials characterization for plasma-facing components.',
    methods: ['additive manufacturing', 'metrology', 'materials characterization'],
    facilities: ['LPBF machine'],
    evidence: officialEvidence,
  });

  assert.ok(result.score >= 3.0);
  assert.ok(['A', 'B'].includes(result.tier));
  assert.ok(result.verified_overlap.some(item => /materials_manufacturing|hardware_fabrication/.test(item)));
});

test('simulation and theory remain capped without physical hardware', () => {
  const result = scoreResearchProspect({
    name: 'Simulation PI',
    title: 'Professor of Computational Modeling',
    current_focus: 'Numerical simulation, computational modeling, HPC, and theoretical fluid modeling.',
    methods: ['simulation', 'computational modeling', 'HPC'],
    evidence: officialEvidence,
  });

  assert.ok(result.score <= 2.9);
  assert.ok(['C', 'D'].includes(result.tier));
  assert.equal(result.score_breakdown.computation_dominant, true);
});

test('area T1 and generated prose cannot inflate canonical fit', () => {
  const clean = scoreResearchProspect({
    name: 'Thin Record',
    title: 'Assistant Professor of Chemistry',
    current_focus: 'General chemistry education research',
    evidence: officialEvidence,
  });
  const contaminated = scoreResearchProspect({
    name: 'Thin Record',
    title: 'Assistant Professor of Chemistry',
    current_focus: 'General chemistry education research',
    fit_rationale: 'Direct plasma diagnostics and tokamak vacuum chamber fit with FPGA detector readout',
    outreach_angle: 'Lead with Magnum-PSI and CXRS',
    transfer_vectors: ['plasma diagnostics', 'mass spectrometry'],
    evidence: officialEvidence,
  });
  assert.equal(clean.score, contaminated.score);
  assert.equal(clean.tier, contaminated.tier);
});

test('normalization refreshes generated defense answers but preserves user response', () => {
  const normalized = normalizeResearchProspect({
    name: 'Defense Sheet PI',
    title: 'Professor',
    department: 'Nuclear Engineering',
    lab: 'Diagnostics Lab',
    current_focus: 'Experimental plasma diagnostics and detector calibration on a vacuum test stand',
    methods: ['plasma diagnostics', 'detector calibration'],
    facilities: ['vacuum test stand'],
    evidence: officialEvidence,
    defense_sheet: [
      {
        id: 'professor_work',
        question: 'What this professor works on',
        researched_answer: 'old',
        user_response: 'keep my notes',
      },
    ],
  });
  assert.equal(normalized.policy_version, RESEARCH_FIT_POLICY_VERSION);
  assert.ok(normalized.defense_sheet[0].researched_answer !== 'old');
  assert.equal(normalized.defense_sheet[0].user_response, 'keep my notes');
  assert.ok(normalized.relationship_signal);
  assert.ok(normalized.funding_opening_signal);
});

test('prime-domain title alone is not Tier C just because methods are empty', () => {
  const result = scoreResearchProspect({
    name: 'Martin Rubin',
    title: 'Space Mass Spectrometry',
    lab: 'Space Mass Spectrometry',
    methods: [],
    facilities: [],
    current_focus: '',
  });
  assert.ok(result.score >= 4.0, `expected high fit, got ${result.score}`);
  assert.ok(['A', 'B'].includes(result.tier));
  assert.equal(result.confidence, 'low');
});
