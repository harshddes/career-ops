import { withTenant } from './db.mjs';
import { newId } from './auth.mjs';

export async function createPerson(db, {
  tenantId,
  userId,
  displayName,
  title = '',
  organizationName = '',
  orgId = null,
  publicUrls = [],
  notes = '',
} = {}) {
  const name = String(displayName || '').trim();
  if (!name) return { ok: false, error: 'display_name_required', status: 400 };
  return withTenant(db, { tenantId, userId }, async () => {
    const id = newId('person');
    await db.query(
      `INSERT INTO workspace_people
         (id, workspace_id, display_name, title, organization_name, org_id, public_urls, notes, review_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'identified', now(), now())`,
      [
        id,
        tenantId,
        name,
        title,
        organizationName,
        orgId,
        JSON.stringify(Array.isArray(publicUrls) ? publicUrls : []),
        notes,
      ],
    );
    const rows = await db.query('SELECT * FROM workspace_people WHERE id = $1', [id]);
    return { ok: true, person: rows[0] };
  });
}

export async function listPeople(db, { tenantId, userId } = {}) {
  return withTenant(db, { tenantId, userId }, async () => {
    return db.query(
      `SELECT * FROM workspace_people
        WHERE workspace_id = $1
        ORDER BY updated_at DESC`,
      [tenantId],
    );
  });
}

export async function getPerson(db, { personId, tenantId, userId }) {
  return withTenant(db, { tenantId, userId }, async () => {
    const rows = await db.query('SELECT * FROM workspace_people WHERE id = $1', [personId]);
    return rows[0] || null;
  });
}

export async function readPersonDirect(db, { tenantId, userId, personId }) {
  return withTenant(db, { tenantId, userId }, async () => {
    return db.query('SELECT * FROM workspace_people WHERE id = $1', [personId]);
  });
}
