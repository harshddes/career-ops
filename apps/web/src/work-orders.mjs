import { withTenant } from './db.mjs';
import { newId } from './auth.mjs';
import { compilePrompt, defaultLaneFor, LANES, TARGET_KINDS } from './prompt-compiler.mjs';
import { getJob, getOrg } from './catalog.mjs';
import { getPerson } from './people.mjs';
import { workOrderContainsPii } from './snapshot-guard.mjs';

export const OPEN_STATUSES = ['queued', 'copied', 'in_progress', 'review_ready'];
export const ALL_STATUSES = [...OPEN_STATUSES, 'completed', 'failed'];

async function loadTarget(db, { tenantId, userId, targetKind, targetId }) {
  if (targetKind === 'job') {
    const job = await getJob(db, { jobId: targetId, tenantId, userId });
    if (!job) return null;
    return {
      kind: 'job',
      id: job.id,
      title: job.title,
      institution: job.institution,
      url: job.url,
      country: job.country,
      summary: job.summary || '',
      source: job.source,
      org_id: job.org_id,
    };
  }
  if (targetKind === 'org') {
    const org = await getOrg(db, { orgId: targetId, tenantId, userId });
    if (!org) return null;
    return {
      kind: 'org',
      id: org.id,
      title: org.name,
      name: org.name,
      institution: org.name,
      url: org.website || org.careers_url,
      website: org.website,
      careers_url: org.careers_url,
      country: org.country,
      source: org.source || 'exhibitor',
    };
  }
  if (targetKind === 'person') {
    const person = await getPerson(db, { personId: targetId, tenantId, userId });
    if (!person) return null;
    return {
      kind: 'person',
      id: person.id,
      title: person.display_name,
      name: person.display_name,
      institution: person.organization_name,
      url: '',
      source: 'networking',
    };
  }
  return null;
}

export async function createWorkOrder(db, {
  tenantId,
  userId,
  lane,
  targetKind,
  targetId,
  pack = false,
  baseUrl,
}) {
  if (!TARGET_KINDS.includes(targetKind)) return { ok: false, error: 'unknown_target_kind', status: 400 };
  const target = await loadTarget(db, { tenantId, userId, targetKind, targetId });
  if (!target) return { ok: false, error: 'unknown_target', status: 404 };

  const resolvedLane = LANES.includes(lane)
    ? lane
    : defaultLaneFor({ source: target.source, kind: targetKind, pack });
  const containsPii = workOrderContainsPii(resolvedLane);

  return withTenant(db, { tenantId, userId }, async () => {
    const existing = await db.query(
      `SELECT * FROM work_orders
        WHERE workspace_id = $1 AND lane = $2 AND target_kind = $3 AND target_id = $4
          AND status = ANY($5::text[])
        ORDER BY created_at DESC
        LIMIT 1`,
      [tenantId, resolvedLane, targetKind, targetId, OPEN_STATUSES],
    );
    if (existing[0]) return { ok: true, order: existing[0], deduped: true };

    const id = newId('wo');
    const promptText = compilePrompt({
      lane: resolvedLane,
      orderId: id,
      target,
      baseUrl,
    });
    await db.query(
      `INSERT INTO work_orders
         (id, workspace_id, lane, target_kind, target_id, title, status, prompt_text, result_md, contains_pii, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7, '', $8, now(), now())`,
      [id, tenantId, resolvedLane, targetKind, targetId, target.title || target.name, promptText, containsPii],
    );
    const rows = await db.query(
      'SELECT * FROM work_orders WHERE id = $1 AND workspace_id = $2',
      [id, tenantId],
    );
    return { ok: true, order: rows[0], deduped: false };
  });
}

export async function listWorkOrders(db, { tenantId, userId, openOnly = true } = {}) {
  return withTenant(db, { tenantId, userId }, async () => {
    return db.query(
      `SELECT * FROM work_orders
        WHERE workspace_id = $1
          AND ($2::boolean = false OR status = ANY($3::text[]))
        ORDER BY updated_at DESC`,
      [tenantId, openOnly, OPEN_STATUSES],
    );
  });
}

export async function getWorkOrder(db, { tenantId, userId, orderId }) {
  return withTenant(db, { tenantId, userId }, async () => {
    const rows = await db.query(
      'SELECT * FROM work_orders WHERE id = $1 AND workspace_id = $2',
      [orderId, tenantId],
    );
    return rows[0] || null;
  });
}

export async function markWorkOrderCopied(db, { tenantId, userId, orderId }) {
  return withTenant(db, { tenantId, userId }, async () => {
    const rows = await db.query(
      'SELECT * FROM work_orders WHERE id = $1 AND workspace_id = $2',
      [orderId, tenantId],
    );
    const order = rows[0];
    if (!order) return { ok: false, error: 'unknown_order', status: 404 };
    if (order.status === 'queued') {
      await db.query(
        `UPDATE work_orders SET status = 'copied', updated_at = now()
          WHERE id = $1 AND workspace_id = $2`,
        [orderId, tenantId],
      );
      order.status = 'copied';
    }
    return { ok: true, order, prompt_text: order.prompt_text };
  });
}

export async function completeWorkOrder(db, {
  tenantId,
  userId,
  orderId,
  resultMd = '',
  status = 'review_ready',
} = {}) {
  const next = ['review_ready', 'completed', 'failed', 'in_progress'].includes(status)
    ? status
    : 'review_ready';
  return withTenant(db, { tenantId, userId }, async () => {
    const rows = await db.query(
      'SELECT * FROM work_orders WHERE id = $1 AND workspace_id = $2',
      [orderId, tenantId],
    );
    if (!rows[0]) return { ok: false, error: 'unknown_order', status: 404 };
    await db.query(
      `UPDATE work_orders
          SET result_md = $2, status = $3, updated_at = now()
        WHERE id = $1 AND workspace_id = $4`,
      [orderId, resultMd || '', next, tenantId],
    );
    const updated = await db.query(
      'SELECT * FROM work_orders WHERE id = $1 AND workspace_id = $2',
      [orderId, tenantId],
    );
    return { ok: true, order: updated[0] };
  });
}

export async function readWorkOrderDirect(db, { tenantId, userId, orderId }) {
  return withTenant(db, { tenantId, userId }, async () => {
    return db.query('SELECT * FROM work_orders WHERE id = $1', [orderId]);
  });
}
