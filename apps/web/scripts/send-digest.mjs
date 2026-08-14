#!/usr/bin/env node
/**
 * Optional Resend digest of new catalog jobs.
 * Hard cap 100 emails per run (Resend free daily limit).
 * No-op without DATABASE_URL or RESEND_API_KEY.
 */

import { applySchema, createDb } from '../src/db.mjs';
import { jobsSince, listDigestRecipients, markDigestSent } from '../src/profile.mjs';
import { DIGEST_DAILY_CAP, sendResendEmail } from '../src/mail.mjs';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.log('DATABASE_URL unset — skip digest.');
  process.exit(0);
}
if (!process.env.RESEND_API_KEY) {
  console.log('RESEND_API_KEY unset — skip digest.');
  process.exit(0);
}

const db = await createDb(connectionString);
await applySchema(db);
const recipients = await listDigestRecipients(db);
const sent = [];
for (const recipient of recipients.slice(0, DIGEST_DAILY_CAP)) {
  const since = recipient.last_digest_at
    || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const jobs = await jobsSince(db, since, 15);
  if (!jobs.length) continue;
  const lines = jobs.map(job => `- ${job.title} (${job.institution}) ${job.url}`).join('\n');
  const result = await sendResendEmail(process.env, {
    to: recipient.email,
    subject: `Career OS — ${jobs.length} new catalog jobs`,
    text: `New compact catalog rows since your last digest:\n\n${lines}\n\nSign in to your Career OS workspace to queue research. This is not an auto-apply.`,
  });
  if (result.ok) {
    await markDigestSent(db, recipient.workspace_id);
    sent.push(recipient.email);
  }
}

console.log(JSON.stringify({ ok: true, considered: recipients.length, sent: sent.length }));
