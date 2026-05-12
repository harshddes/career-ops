#!/usr/bin/env node
/**
 * sync-all.mjs — Run all career-ops adapters to produce WEB-TRACKER JSON snapshots
 *
 * One command to refresh all data from career-ops into WEB-TRACKER/data/*.json.
 * Idempotent. Safe to run on a schedule.
 */

import { run as syncApplications } from './applications-adapter.mjs';
import { run as syncPipeline } from './pipeline-adapter.mjs';
import { run as syncReports } from './reports-adapter.mjs';
import { run as syncScanHistory } from './scan-history-adapter.mjs';
import { run as syncPatterns } from './patterns-adapter.mjs';
import { run as syncFollowups } from './followups-adapter.mjs';
import { run as syncJobsToConsider } from './jobs-to-consider-adapter.mjs';

const adapters = [
  { name: 'applications', fn: syncApplications },
  { name: 'pipeline', fn: syncPipeline },
  { name: 'reports', fn: syncReports },
  { name: 'scan-history', fn: syncScanHistory },
  { name: 'patterns', fn: syncPatterns },
  { name: 'followups', fn: syncFollowups },
  { name: 'jobs-to-consider', fn: syncJobsToConsider },
];

console.log(`\n[sync-all] Refreshing ${adapters.length} career-ops data feeds...\n`);

let ok = 0;
let fail = 0;

for (const a of adapters) {
  try {
    const result = a.fn();
    const count = result?.count ?? result?.entries?.length ?? '?';
    console.log(`  ✅ ${a.name}: ${count} items`);
    ok++;
  } catch (err) {
    console.log(`  ❌ ${a.name}: ${err.message}`);
    fail++;
  }
}

console.log(`\n[sync-all] Done: ${ok} succeeded, ${fail} failed\n`);
