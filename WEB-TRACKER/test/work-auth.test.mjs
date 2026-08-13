import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAdjacentField,
  enrichConsiderJobEligibility,
  eligibilityBandFromSignals,
  isHardUsPersonBlock,
  normalizeWorkAuth,
  parseExportControlVerdict,
  parseVisaVerdict,
} from '../lib/work-auth.mjs';
import { normalizeConsiderJob } from '../lib/jobs-to-consider-store.mjs';
import { assertConsiderJobApplyAllowed } from '../lib/jobs-networking-bridge.mjs';

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

test('classifies OPT story strength for adjacent STEM roles', () => {
  const fit = classifyAdjacentField({ title: 'Instrumentation and RF Test Engineer, Spacecraft Payloads' });
  assert.equal(fit.opt_story_strength, 'strong');
  assert.ok(fit.fields.includes('aerospace systems'));
  assert.ok(fit.fields.includes('instrumentation and test'));
});

test('enriches consider-job eligibility from exact posting restriction without Jobs tier field', () => {
  const job = normalizeConsiderJob({
    company: 'Defense Co',
    title: 'Avionics Engineer',
    region: 'US',
    posting_text: 'Applicants must be a U.S. person.',
  });
  assert.equal(job.export_control, 'hard_us_person');
  assert.equal(job.eligibility_band, 'closed');
  assert.equal(job.visa_verdict, 'skip');
  assert.equal(Object.hasOwn(job, 'tier'), false);
  assert.equal(isHardUsPersonBlock(job), true);
});

test('Europe region without ITAR narrative becomes open eligibility band', () => {
  const band = eligibilityBandFromSignals({
    export_control: '',
    visa_verdict: 'unknown',
    region: 'Europe',
    h1b_sponsorship: 'not_applicable',
  });
  assert.equal(band, 'open');
});

test('enrichConsiderJobEligibility fills soft review from work-auth recommendation text', () => {
  const enriched = enrichConsiderJobEligibility({
    company: 'Fusion Lab',
    title: 'Diagnostics Engineer',
    region: 'US',
    recommendation: 'Review JD + work-auth before apply',
  });
  assert.equal(enriched.visa_verdict, 'caution');
  assert.equal(enriched.eligibility_band, 'selective');
});

test('assertConsiderJobApplyAllowed blocks hard US-person without force', () => {
  const job = normalizeConsiderJob({
    company: 'Prime',
    title: 'Missile Engineer',
    posting_text: 'The applicant must be a U.S. person.',
  });
  assert.throws(
    () => assertConsiderJobApplyAllowed(job),
    /HARD_US_PERSON_APPLY_BLOCKED|Blocked: this posting/,
  );
  assert.equal(assertConsiderJobApplyAllowed(job, { force: true }), true);
});
