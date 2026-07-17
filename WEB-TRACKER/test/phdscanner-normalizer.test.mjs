import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractPhdscannerExternalId,
  normalizePhdscannerPosting,
  parsePhdscannerFunding,
} from '../lib/phdscanner/normalizer.mjs';

test('extracts uuid from opportunity URL', () => {
  const url = 'https://www.phdscanner.com/opportunities/phd-vacancies-epfl-switzerland-phd-in-interpretable-ai-7177a261-0c47-4903-825a-e908e80453f9';
  assert.equal(extractPhdscannerExternalId(url), '7177a261-0c47-4903-825a-e908e80453f9');
});

test('normalizer builds phdscanner id and funding flags', () => {
  const opportunity = normalizePhdscannerPosting({
    url: 'https://www.phdscanner.com/opportunities/phd-vacancies-demo-germany-phd-in-plasma-diagnostics-plasma-diag-seed-001',
    title: 'PhD in Plasma Diagnostics and Spacecraft Instrumentation',
    university: 'Demo Plasma Institute',
    country: 'Germany',
    discipline: 'Physics',
    deadline: 'September 30, 2099',
    summary: 'Fully funded doctoral position on plasma diagnostics and FPGA readout.',
    fully_funded: true,
  }, { now: new Date('2026-07-01T00:00:00.000Z') });

  assert.match(opportunity.id, /^phdscanner-/);
  assert.equal(opportunity.source, 'phdscanner');
  assert.equal(opportunity.fully_funded, true);
  assert.equal(opportunity.university, 'Demo Plasma Institute');
  assert.ok(opportunity.deadline_utc);
  assert.ok(opportunity.score >= 3.2);
});

test('parsePhdscannerFunding detects self-funded vs fully funded', () => {
  const funded = parsePhdscannerFunding({ summary: 'This is a fully funded PhD with stipend.' });
  assert.equal(funded.fully_funded, true);
  const self = parsePhdscannerFunding({ summary: 'This position is self-funded by the student.' });
  assert.equal(self.fully_funded, false);
});
