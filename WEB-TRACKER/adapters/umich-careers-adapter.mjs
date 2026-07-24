/**
 * umich-careers-adapter.mjs — Sync U-M Careers store to the dashboard projection.
 */
import { syncUmichOpportunitiesToDashboard } from '../lib/umich-careers/opportunity-store.mjs';

export function run() {
  const store = syncUmichOpportunitiesToDashboard();
  return { count: store.opportunities?.length || 0, total: store.total || 0 };
}

if (process.argv[1]?.endsWith('umich-careers-adapter.mjs')) {
  const result = run();
  console.log(`Synced ${result.total} U-M Careers opportunities -> WEB-TRACKER/data/umich-careers-opportunities.json`);
}
