export const PRIVATE_TABLES = Object.freeze([
  'work_orders',
  'workspace_people',
  'workspace_profiles',
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
    if (key === 'work_orders' || key === 'people' || key === 'networking' || key === 'profiles' || key === 'cv') continue;
    safe[key] = value;
  }
  return safe;
}
