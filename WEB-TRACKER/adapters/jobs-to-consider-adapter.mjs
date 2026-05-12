#!/usr/bin/env node
/**
 * jobs-to-consider-adapter.mjs
 *
 * Mirrors the curated researched-job inbox into WEB-TRACKER/data so the
 * dashboard can render it like the other JSON snapshots.
 */

import { syncConsiderJobsToDashboard } from '../lib/jobs-to-consider-store.mjs';

export function run() {
  return syncConsiderJobsToDashboard();
}

if (process.argv[1]?.endsWith('jobs-to-consider-adapter.mjs')) {
  const result = run();
  console.log(`Synced ${result.total} jobs to consider -> WEB-TRACKER/data/jobs-to-consider.json`);
}
