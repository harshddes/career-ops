import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysYmd,
  isSilenceNudgeDue,
  SILENCE_NUDGE_DAYS,
} from '../lib/research-prospect-store.mjs';

test('addDaysYmd advances calendar days', () => {
  assert.equal(addDaysYmd('2026-07-13', SILENCE_NUDGE_DAYS), '2026-07-20');
  assert.equal(addDaysYmd('2026-07-28', 7), '2026-08-04');
});

test('silence nudge due when contacted and follow_up_date elapsed', () => {
  assert.equal(isSilenceNudgeDue({
    status: 'contacted',
    last_contacted: '2026-07-01',
    follow_up_date: '2026-07-08',
  }, '2026-07-13'), true);
  assert.equal(isSilenceNudgeDue({
    status: 'contacted',
    last_contacted: '2026-07-12',
    follow_up_date: '2026-07-19',
  }, '2026-07-13'), false);
  assert.equal(isSilenceNudgeDue({
    status: 'responded_positive',
    last_contacted: '2026-07-01',
    follow_up_date: '2026-07-08',
  }, '2026-07-13'), false);
});

test('silence nudge falls back to last_contacted + 7 days', () => {
  assert.equal(isSilenceNudgeDue({
    status: 'contacted',
    last_contacted: '2026-07-01',
  }, '2026-07-08'), true);
  assert.equal(isSilenceNudgeDue({
    status: 'contacted',
    last_contacted: '2026-07-01',
  }, '2026-07-07'), false);
});
