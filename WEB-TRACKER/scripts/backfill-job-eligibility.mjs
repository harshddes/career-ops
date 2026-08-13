#!/usr/bin/env node
/**
 * Re-normalize Jobs to Consider so export_control / eligibility_band / H-1B
 * fields are populated from recommendation/notes (and stay out of user-state).
 */
import {
  readConsiderJobs,
  syncConsiderJobsToDashboard,
  writeConsiderJobs,
} from '../lib/jobs-to-consider-store.mjs';

const store = readConsiderJobs();

// Clear previously inferred auth fields so normalizeConsiderJob re-derives them
// from recommendation/notes with the current parsers.
for (const job of store.jobs) {
  job.export_control = '';
  job.export_control_risk = '';
  job.eligibility_band = '';
  job.visa_verdict = '';
  job.h1b_sponsorship = '';
  job.work_permit_model = '';
  job.opt_story_strength = '';
  job.adjacent_fields = [];
}

writeConsiderJobs(store);
const refreshed = readConsiderJobs();
const summary = {
  total: refreshed.jobs.length,
  hard_us_person: 0,
  soft_or_review: 0,
  open: 0,
  selective: 0,
  closed: 0,
  unknown: 0,
};

for (const job of refreshed.jobs) {
  if (job.export_control === 'hard_us_person') summary.hard_us_person += 1;
  else if (job.export_control === 'soft_or_review') summary.soft_or_review += 1;
  const band = job.eligibility_band || 'unknown';
  if (summary[band] !== undefined) summary[band] += 1;
  else summary.unknown += 1;
}

const dashboard = syncConsiderJobsToDashboard();
console.log(JSON.stringify({ ...summary, dashboard_total: dashboard.total }, null, 2));
