import { withServiceRole, withTenant } from './db.mjs';
import { listOverlays } from './catalog.mjs';
import { listWorkOrders } from './work-orders.mjs';
import { listPeople } from './people.mjs';

export async function getProfile(db, { tenantId, userId }) {
  return withTenant(db, { tenantId, userId }, async () => {
    const rows = await db.query(
      'SELECT * FROM workspace_profiles WHERE workspace_id = $1',
      [tenantId],
    );
    if (rows[0]) return rows[0];
    await db.query(
      `INSERT INTO workspace_profiles (workspace_id, display_name, cv_text, keywords, digest_enabled, updated_at)
       VALUES ($1, '', '', '', false, now())
       ON CONFLICT (workspace_id) DO NOTHING`,
      [tenantId],
    );
    const created = await db.query(
      'SELECT * FROM workspace_profiles WHERE workspace_id = $1',
      [tenantId],
    );
    return created[0] || {
      workspace_id: tenantId,
      display_name: '',
      cv_text: '',
      keywords: '',
      digest_enabled: false,
      last_digest_at: null,
    };
  });
}

export async function saveProfile(db, {
  tenantId,
  userId,
  displayName = '',
  cvText = '',
  keywords = '',
  digestEnabled = false,
}) {
  return withTenant(db, { tenantId, userId }, async () => {
    await db.query(
      `INSERT INTO workspace_profiles
         (workspace_id, display_name, cv_text, keywords, digest_enabled, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (workspace_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         cv_text = EXCLUDED.cv_text,
         keywords = EXCLUDED.keywords,
         digest_enabled = EXCLUDED.digest_enabled,
         updated_at = now()`,
      [tenantId, displayName, cvText, keywords, Boolean(digestEnabled)],
    );
    const rows = await db.query(
      'SELECT * FROM workspace_profiles WHERE workspace_id = $1',
      [tenantId],
    );
    return { ok: true, profile: rows[0] };
  });
}

export async function exportWorkspace(db, { tenantId, userId, email, name }) {
  const profile = await getProfile(db, { tenantId, userId });
  const overlays = await listOverlays(db, { tenantId, userId });
  const workOrders = await listWorkOrders(db, { tenantId, userId, openOnly: false });
  const people = await listPeople(db, { tenantId, userId });
  return {
    exported_at: new Date().toISOString(),
    user: { email, name, workspace_id: tenantId },
    profile,
    overlays,
    work_orders: workOrders,
    people,
  };
}

export async function deleteUserAndWorkspace(db, { userId, email }) {
  const workspaces = await db.query('SELECT id FROM workspaces WHERE user_id = $1', [userId]);
  for (const workspace of workspaces) {
    await withTenant(db, { tenantId: workspace.id, userId }, async () => {
      await db.query('DELETE FROM work_orders WHERE workspace_id = $1', [workspace.id]);
      await db.query('DELETE FROM workspace_people WHERE workspace_id = $1', [workspace.id]);
      await db.query('DELETE FROM workspace_profiles WHERE workspace_id = $1', [workspace.id]);
      await db.query('DELETE FROM job_overlays WHERE workspace_id = $1', [workspace.id]);
    });
    await db.query('DELETE FROM workspaces WHERE id = $1', [workspace.id]);
  }
  await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  await db.query('DELETE FROM magic_links WHERE email = $1', [email]);
  await db.query('DELETE FROM users WHERE id = $1', [userId]);
}

export async function listDigestRecipients(db) {
  return withServiceRole(db, async () => db.query(
    `SELECT p.workspace_id, p.display_name, p.last_digest_at, u.email, u.id AS user_id
       FROM workspace_profiles p
       JOIN workspaces w ON w.id = p.workspace_id
       JOIN users u ON u.id = w.user_id
      WHERE p.digest_enabled = true`,
  ));
}

export async function markDigestSent(db, workspaceId) {
  await withServiceRole(db, async () => {
    await db.query(
      'UPDATE workspace_profiles SET last_digest_at = now(), updated_at = now() WHERE workspace_id = $1',
      [workspaceId],
    );
  });
}

export async function jobsSince(db, sinceIso, limit = 20) {
  return db.query(
    `SELECT id, source, title, institution, url, updated_at
       FROM catalog_jobs
      WHERE visible = true AND updated_at >= $1::timestamptz
      ORDER BY updated_at DESC
      LIMIT $2`,
    [sinceIso, limit],
  );
}
