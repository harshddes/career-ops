#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { buildDailyDigest, sendDailyDigest } from '../lib/daily-digest.mjs';
import { digestRecipients } from '../lib/today-activity.mjs';

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

async function main() {
  if (hasArg('--help') || hasArg('-h')) {
    printUsage();
    return;
  }

  const date = argValue('--date');
  const timeZone = argValue('--timezone') || process.env.DAILY_DIGEST_TIMEZONE || process.env.TZ;
  const recipients = argValue('--to');
  if (recipients) process.env.DAILY_DIGEST_RECIPIENTS = recipients;

  const resolvedRecipients = digestRecipients();

  if (hasArg('--send')) {
    const result = await sendDailyDigest({ date, timeZone });
    console.log(JSON.stringify({
      sent: true,
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
      recipients: resolvedRecipients,
      summary: result.activity.summary,
    }, null, 2));
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
    recipients: resolvedRecipients,
    summary: digest.activity.summary,
    files,
  }, null, 2));
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
