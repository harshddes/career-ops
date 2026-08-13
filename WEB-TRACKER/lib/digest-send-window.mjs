import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_DIGEST_TIMEZONE, localDateString } from './today-activity.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const DIGEST_SENT_DIR = join(LIB_DIR, '..', 'runtime', 'digest-sent');

/** One-night only: Aug 12 23:50 ET through Aug 13 02:00 ET still sends the Aug 12 digest. */
export const ONE_NIGHT_DIGEST_DATE = '2026-08-12';
export const ONE_NIGHT_WINDOW_END = { localDate: '2026-08-13', hour: 2, minute: 0 };

export function localClockParts(date = new Date(), timeZone = DEFAULT_DIGEST_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    hour: Number.parseInt(byType.hour, 10),
    minute: Number.parseInt(byType.minute, 10),
  };
}

export function previousLocalDate(ymd = '') {
  const match = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function minutesOfDay(hour, minute) {
  return (Number(hour) * 60) + Number(minute);
}

function isOneNightExtension(localDate, hour, minute) {
  if (localDate === ONE_NIGHT_DIGEST_DATE && minutesOfDay(hour, minute) >= minutesOfDay(23, 50)) {
    return true;
  }
  if (localDate === ONE_NIGHT_WINDOW_END.localDate
    && minutesOfDay(hour, minute) <= minutesOfDay(ONE_NIGHT_WINDOW_END.hour, ONE_NIGHT_WINDOW_END.minute)) {
    return true;
  }
  return false;
}

/** Automated sends: 23:50–00:10 Eastern, plus one night until 02:00 on 2026-08-13. */
export function isWithinFixedDigestWindow(date = new Date(), timeZone = DEFAULT_DIGEST_TIMEZONE) {
  const localDate = localDateString(date, timeZone);
  const { hour, minute } = localClockParts(date, timeZone);
  if (isOneNightExtension(localDate, hour, minute)) return true;
  if (hour === 23 && minute >= 50) return true;
  if (hour === 0 && minute <= 10) return true;
  return false;
}

/**
 * Activity date the scheduled send should cover.
 * Overnight catch-up (including the one-night 2 AM extension) still belongs to yesterday.
 */
export function digestDateForSend(date = new Date(), timeZone = DEFAULT_DIGEST_TIMEZONE) {
  const localDate = localDateString(date, timeZone);
  const { hour, minute } = localClockParts(date, timeZone);
  if (isOneNightExtension(localDate, hour, minute) && localDate === ONE_NIGHT_WINDOW_END.localDate) {
    return ONE_NIGHT_DIGEST_DATE;
  }
  if (hour === 0 && minute <= 10) return previousLocalDate(localDate);
  return localDate;
}

export function digestSentMarkerPath(digestDate = '') {
  return join(DIGEST_SENT_DIR, `${digestDate}.json`);
}

export function hasDigestBeenSent(digestDate = '') {
  const date = String(digestDate || '').trim();
  if (!date) return false;
  return existsSync(digestSentMarkerPath(date));
}

export function markDigestSent(digestDate, info = {}) {
  const date = String(digestDate || '').trim();
  if (!date) return null;
  mkdirSync(DIGEST_SENT_DIR, { recursive: true });
  const payload = {
    date,
    sent_at: new Date().toISOString(),
    messageId: info.messageId || '',
    accepted: info.accepted || [],
  };
  writeFileSync(digestSentMarkerPath(date), `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  return payload;
}

export function readDigestSentMarker(digestDate = '') {
  const filePath = digestSentMarkerPath(digestDate);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}
