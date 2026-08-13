#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { buildDailyDigest, sendDailyDigest } from '../lib/daily-digest.mjs';
import {
  digestDateForSend,
  hasDigestBeenSent,
  isWithinFixedDigestWindow,
  localClockParts,
  markDigestSent,
} from '../lib/digest-send-window.mjs';
import { digestRecipients, resolveDigestTimeZone } from '../lib/today-activity.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_TRACKER_DIR = join(SCRIPT_DIR, '..');
const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
const DIGEST_OUTPUT_DIR = join(CAREER_OPS_DIR, 'output', 'digests');

loadEnv({ dir: WEB_TRACKER_DIR });

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function printUsage() {
  console.log([
    'Usage:',
    '  node WEB-TRACKER/scripts/send-daily-digest.mjs --dry-run',
    '  node WEB-TRACKER/scripts/send-daily-digest.mjs --send',
    '',
    'Options:',
    '  --date YYYY-MM-DD       Build the digest for a specific date.',
    '  --timezone IANA_ZONE    Override DAILY_DIGEST_TIMEZONE.',
    '  --to a,b@example.com    Override DAILY_DIGEST_RECIPIENTS for this run.',
    '  --force                 Bypass the fixed 23:59 Eastern send window.',
  ].join('\n'));
}

function writeDryRunAttachments(digest) {
  mkdirSync(DIGEST_OUTPUT_DIR, { recursive: true });
  const files = [];
  for (const attachment of digest.attachments) {
    const filePath = join(DIGEST_OUTPUT_DIR, attachment.filename);
    writeFileSync(filePath, attachment.content);
    files.push(filePath);
  }
  const summaryPath = join(DIGEST_OUTPUT_DIR, `today-activity-${digest.activity.date}.json`);
  writeFileSync(summaryPath, `${JSON.stringify(digest.activity, null, 2)}\n`, 'utf-8');
  files.push(summaryPath);
  return files;
}

export async function sendScheduledDailyDigest({
  now = new Date(),
  force = false,
  date = '',
  timeZone = '',
} = {}) {
  const resolvedTimeZone = resolveDigestTimeZone(timeZone || process.env.DAILY_DIGEST_TIMEZONE || process.env.TZ);
  const resolvedRecipients = digestRecipients();
  const clock = localClockParts(now, resolvedTimeZone);

  if (!force && !isWithinFixedDigestWindow(now, resolvedTimeZone)) {
    return {
      sent: false,
      skipped: true,
      reason: 'outside_fixed_2359_window',
      timezone: resolvedTimeZone,
      local_time: `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`,
      allowed_window: '23:50-00:10 Eastern; one-night extension until 02:00 on 2026-08-13',
      recipients: resolvedRecipients,
      hint: 'Scheduled sends only run at 11:59 PM Eastern (tonight also until 2:00 AM). Use --force for a manual send.',
    };
  }

  const digestDate = date || digestDateForSend(now, resolvedTimeZone);
  if (!force && hasDigestBeenSent(digestDate)) {
    return {
      sent: false,
      skipped: true,
      reason: 'already_sent',
      date: digestDate,
      timezone: resolvedTimeZone,
      local_time: `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`,
      recipients: resolvedRecipients,
      hint: `Digest for ${digestDate} already sent; skipping duplicate.`,
    };
  }

  const result = await sendDailyDigest({ date: digestDate, timeZone: resolvedTimeZone });
  markDigestSent(digestDate, result);
  return {
    sent: true,
    date: digestDate,
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected,
    recipients: resolvedRecipients,
    summary: result.activity.summary,
  };
}

async function main() {
  if (hasArg('--help') || hasArg('-h')) {
    printUsage();
    return;
  }

  const date = argValue('--date');
  const timeZone = resolveDigestTimeZone(
    argValue('--timezone') || process.env.DAILY_DIGEST_TIMEZONE || process.env.TZ
  );
  const recipients = argValue('--to');
  if (recipients) process.env.DAILY_DIGEST_RECIPIENTS = recipients;

  if (hasArg('--send')) {
    const result = await sendScheduledDailyDigest({
      force: hasArg('--force'),
      date,
      timeZone,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const digest = await buildDailyDigest({ date, timeZone });
  const files = writeDryRunAttachments(digest);
  console.log(JSON.stringify({
    sent: false,
    dry_run: true,
    subject: digest.subject,
    date: digest.activity.date,
    timezone: digest.activity.timeZone,
    recipients: digestRecipients(),
    summary: digest.activity.summary,
    files,
  }, null, 2));
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase();
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  main().catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
