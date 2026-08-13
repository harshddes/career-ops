import test from 'node:test';
import assert from 'node:assert/strict';
import {
  digestDateForSend,
  isWithinFixedDigestWindow,
  previousLocalDate,
} from '../lib/digest-send-window.mjs';

const TZ = 'America/New_York';

test('normal 23:59 window is open and uses that calendar day', () => {
  const now = new Date('2026-08-14T03:59:00.000Z'); // 23:59 ET Aug 13
  assert.equal(isWithinFixedDigestWindow(now, TZ), true);
  assert.equal(digestDateForSend(now, TZ), '2026-08-13');
});

test('normal 00:05 catch-up is yesterday, not the new morning', () => {
  const now = new Date('2026-08-14T04:05:00.000Z'); // 00:05 ET Aug 14
  assert.equal(isWithinFixedDigestWindow(now, TZ), true);
  assert.equal(digestDateForSend(now, TZ), '2026-08-13');
});

test('normal 00:15 is closed', () => {
  const now = new Date('2026-08-14T04:15:00.000Z'); // 00:15 ET Aug 14
  assert.equal(isWithinFixedDigestWindow(now, TZ), false);
});

test('one-night extension: 01:30 Aug 13 still sends the Aug 12 digest', () => {
  const now = new Date('2026-08-13T05:30:00.000Z'); // 01:30 ET Aug 13
  assert.equal(isWithinFixedDigestWindow(now, TZ), true);
  assert.equal(digestDateForSend(now, TZ), '2026-08-12');
});

test('one-night extension: 02:00 Aug 13 is the last allowed minute', () => {
  const now = new Date('2026-08-13T06:00:00.000Z'); // 02:00 ET Aug 13
  assert.equal(isWithinFixedDigestWindow(now, TZ), true);
  assert.equal(digestDateForSend(now, TZ), '2026-08-12');
});

test('one-night extension expires at 02:01 Aug 13', () => {
  const now = new Date('2026-08-13T06:01:00.000Z'); // 02:01 ET Aug 13
  assert.equal(isWithinFixedDigestWindow(now, TZ), false);
});

test('the next night is back to 23:59 only', () => {
  const late = new Date('2026-08-14T05:30:00.000Z'); // 01:30 ET Aug 14
  assert.equal(isWithinFixedDigestWindow(late, TZ), false);
  const onTime = new Date('2026-08-15T03:59:00.000Z'); // 23:59 ET Aug 14
  assert.equal(isWithinFixedDigestWindow(onTime, TZ), true);
  assert.equal(digestDateForSend(onTime, TZ), '2026-08-14');
});

test('previousLocalDate crosses month bounds', () => {
  assert.equal(previousLocalDate('2026-08-13'), '2026-08-12');
  assert.equal(previousLocalDate('2026-03-01'), '2026-02-28');
});
