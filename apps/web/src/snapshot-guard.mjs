/**
 * Networking PII never leaves the tenant database.
 * Static snapshots, GitHub Pages, and public catalog upserts must not include these tables.
 */

export const PRIVATE_TABLES = Object.freeze([
  'work_orders',
  'workspace_people',
  'job_overlays',
  'sessions',
  'users',
  'magic_links',
]);

export const PUBLIC_CATALOG_TABLES = Object.freeze([
  'catalog_jobs',
  'catalog_job_details',
  'catalog_orgs',
  'scan_runs',
]);

export function workOrderContainsPii(lane) {
  return lane === 'networking';
}

export function isSnapshotSafeTable(name) {
  return PUBLIC_CATALOG_TABLES.includes(name);
}

export function filterSnapshotPayload(payload = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(payload)) {
    if (PRIVATE_TABLES.includes(key)) continue;
    if (key === 'work_orders' || key === 'people' || key === 'networking') continue;
    safe[key] = value;
  }
  return safe;
}
