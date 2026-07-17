import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEuraxessPosting } from '../lib/euraxess/normalizer.mjs';

test('normalizes and scores a strong EURAXESS diagnostics posting', () => {
  const prospect = normalizeEuraxessPosting({
    id: '12345',
    title: 'Doctoral candidate in plasma diagnostics and detector readout',
    institution: 'Example Fusion Institute',
    country: 'Germany',
    research_fields: ['Physics', 'Plasma physics', 'Electrical engineering'],
    academic_level: 'PhD Positions',
    researcher_profile: 'First Stage Researcher (R1)',
    deadline: '21 May 2099 - 23:59 (Europe/Berlin)',
    url: '/jobs/12345',
    description: 'Instrumentation, DAQ, FPGA readout, calibration, and high voltage diagnostics.',
    provider: 'manual_seed',
  }, { sourceId: 'euraxess-fusion', now: new Date('2026-07-01T00:00:00.000Z') });

  assert.equal(prospect.id, 'euraxess-fusion-12345');
  assert.equal(prospect.opportunity_status, 'open');
  assert.equal(prospect.needs_deep_research, true);
  assert.ok(prospect.score >= 4.2);
  assert.ok(prospect.transfer_vectors.includes('plasma'));
});

test('marks expired EURAXESS postings as closed and penalizes score', () => {
  const prospect = normalizeEuraxessPosting({
    id: 'expired',
    title: 'Research support position in plasma diagnostics',
    institution: 'Example Lab',
    deadline: '1 May 2026 - 23:59 (UTC)',
    url: 'https://euraxess.ec.europa.eu/jobs/999',
  }, { sourceId: 'euraxess-fusion', now: new Date('2026-07-01T00:00:00.000Z') });

  assert.equal(prospect.opportunity_status, 'closed');
  assert.equal(prospect.needs_deep_research, false);
  assert.ok(prospect.risk_flags.includes('deadline_passed'));
});
