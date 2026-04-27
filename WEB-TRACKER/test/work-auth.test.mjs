import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWorkAuth, parseExportControlVerdict, parseVisaVerdict } from '../lib/work-auth.mjs';

test('normalizes confirmed H-1B source', () => {
  const auth = normalizeWorkAuth({ h1b_status: 'confirmed' });
  assert.equal(auth.h1b_sponsorship, 'confirmed');
  assert.equal(auth.region, 'US');
  assert.equal(auth.work_permit_model, 'us_sponsorship_possible');
});

test('normalizes EU source as local permit path', () => {
  const auth = normalizeWorkAuth({ h1b_status: 'n/a_eu' });
  assert.equal(auth.h1b_sponsorship, 'not_applicable');
  assert.equal(auth.region, 'Europe');
  assert.equal(auth.work_permit_model, 'local_work_permit_required');
});

test('parses visa and export-control text', () => {
  assert.equal(parseVisaVerdict('Visa: SKIP -- ITAR hard block'), 'skip');
  assert.equal(parseVisaVerdict('Visa: Caution -- export ctrl soft block'), 'caution');
  assert.equal(parseVisaVerdict('Visa: Clear'), 'clear');
  assert.equal(parseExportControlVerdict('must be a U.S. person'), 'hard_us_person');
  assert.equal(parseExportControlVerdict('ITAR/EAR may require export authorization'), 'soft_or_review');
});
