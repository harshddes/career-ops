import { withTenant } from './db.mjs';
import { newId } from './auth.mjs';

export const FEED_PAGE_SIZE = 48;
export const FEED_SOURCES = ['euraxess', 'fusion', 'umich', 'phdscanner'];
export const OVERLAY_STATUSES = ['saved', 'applied', 'skipped', 'researching'];

function asIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function slugify(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'org';
}

export async function upsertCatalogOrgs(db, orgs = []) {
  for (const org of orgs) {
    const id = org.id || `org-${slugify(org.name)}`;
    await db.query(
      `INSERT INTO catalog_orgs
         (id, name, slug, website, careers_url, source, country, notes, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         slug = EXCLUDED.slug,
         website = COALESCE(NULLIF(EXCLUDED.website, ''), catalog_orgs.website),
         careers_url = COALESCE(NULLIF(EXCLUDED.careers_url, ''), catalog_orgs.careers_url),
         source = EXCLUDED.source,
         country = COALESCE(NULLIF(EXCLUDED.country, ''), catalog_orgs.country),
         notes = COALESCE(NULLIF(EXCLUDED.notes, ''), catalog_orgs.notes),
         updated_at = now()`,
      [
        id,
        org.name,
        org.slug || slugify(org.name),
        org.website || '',
        org.careers_url || '',
        org.source || '',
        org.country || '',
        org.notes || '',
      ],
    );
  }
  return orgs.length;
}

export async function upsertCatalogJobs(db, jobs = []) {
  const orgs = [];
  for (const job of jobs) {
    if (job.org && job.org.name) {
      orgs.push({
        id: job.org_id || job.org.id,
        name: job.org.name,
        website: job.org.website,
        careers_url: job.org.careers_url,
        source: job.source,
        country: job.org.country || job.country,
      });
    } else if (job.institution) {
      orgs.push({
        id: job.org_id || `org-${slugify(job.institution)}`,
        name: job.institution,
        source: job.source,
        country: job.country,
      });
    }
  }
  if (orgs.length) await upsertCatalogOrgs(db, orgs);

  for (const job of jobs) {
    const orgId = job.org_id || (job.institution ? `org-${slugify(job.institution)}` : null);
    await db.query(
      `INSERT INTO catalog_jobs
         (id, source, title, institution, country, url, score, score_band, deadline_text, visible, org_id, posted_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         institution = EXCLUDED.institution,
         country = EXCLUDED.country,
         url = EXCLUDED.url,
         score = EXCLUDED.score,
         score_band = EXCLUDED.score_band,
         deadline_text = EXCLUDED.deadline_text,
         visible = EXCLUDED.visible,
         org_id = COALESCE(EXCLUDED.org_id, catalog_jobs.org_id),
         posted_at = COALESCE(EXCLUDED.posted_at, catalog_jobs.posted_at),
         updated_at = now()`,
      [
        job.id,
        job.source,
        job.title,
        job.institution || '',
        job.country || '',
        job.url || '',
        job.score ?? null,
        job.score_band || '',
        job.deadline_text || '',
        job.visible !== false,
        orgId,
        asIso(job.posted_at),
      ],
    );
    if (job.summary || job.description || job.location || job.raw_json) {
      await db.query(
        `INSERT INTO catalog_job_details (job_id, summary, description, location, raw_json, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (job_id) DO UPDATE SET
           summary = EXCLUDED.summary,
           description = EXCLUDED.description,
           location = EXCLUDED.location,
           raw_json = CASE WHEN EXCLUDED.raw_json = '' THEN catalog_job_details.raw_json ELSE EXCLUDED.raw_json END,
           updated_at = now()`,
        [
          job.id,
          job.summary || '',
          job.description || '',
          job.location || '',
          typeof job.raw_json === 'string' ? job.raw_json : (job.raw_json ? JSON.stringify(job.raw_json) : ''),
        ],
      );
    }
  }
  return jobs.length;
}

export async function recordScanRun(db, { source, status, upserted = 0, error = '', startedAt, finishedAt }) {
  const id = newId('scan');
  await db.query(
    `INSERT INTO scan_runs (id, source, status, upserted, error, started_at, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      source,
      status,
      upserted,
      error || '',
      asIso(startedAt) || new Date().toISOString(),
      asIso(finishedAt) || new Date().toISOString(),
    ],
  );
  return id;
}

export async function latestScanRuns(db) {
  return db.query(
    `SELECT DISTINCT ON (source) id, source, status, upserted, error, started_at, finished_at
       FROM scan_runs
      ORDER BY source, started_at DESC`,
  );
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const json = atob(String(cursor).replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(json);
    if (!parsed?.i || !parsed?.u) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function encodeCursor(row) {
  if (!row) return null;
  const payload = JSON.stringify({ u: asIso(row.updated_at) || row.updated_at, i: row.id });
  return btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function listFeed(db, {
  source,
  tenantId,
  userId,
  limit = FEED_PAGE_SIZE,
  cursor = null,
} = {}) {
  const decoded = decodeCursor(cursor);
  return withTenant(db, { tenantId, userId }, async () => {
    const rows = await db.query(
      `SELECT
         c.id, c.source, c.title, c.institution, c.country, c.url,
         c.score, c.score_band, c.deadline_text, c.org_id, c.posted_at, c.updated_at,
         o.status AS overlay_status,
         o.notes AS overlay_notes
       FROM catalog_jobs c
       LEFT JOIN job_overlays o
         ON o.job_id = c.id AND o.workspace_id = $1
       WHERE c.source = $2 AND c.visible = true
         AND ($3::timestamptz IS NULL OR (c.updated_at, c.id) < ($3::timestamptz, $4))
       ORDER BY c.updated_at DESC, c.id DESC
       LIMIT $5`,
      [tenantId, source, decoded?.u || null, decoded?.i || '', limit + 1],
    );
    const hasMore = rows.length > limit;
    const jobs = hasMore ? rows.slice(0, limit) : rows;
    return {
      jobs,
      next_cursor: hasMore ? encodeCursor(jobs[jobs.length - 1]) : null,
    };
  });
}

export async function listRecentJobs(db, { tenantId, userId, limit = 12 } = {}) {
  return withTenant(db, { tenantId, userId }, async () => {
    return db.query(
      `SELECT
         c.id, c.source, c.title, c.institution, c.country, c.url,
         c.score, c.score_band, c.deadline_text, c.org_id, c.posted_at, c.updated_at,
         o.status AS overlay_status
       FROM catalog_jobs c
       LEFT JOIN job_overlays o
         ON o.job_id = c.id AND o.workspace_id = $1
       WHERE c.visible = true
       ORDER BY c.updated_at DESC, c.id DESC
       LIMIT $2`,
      [tenantId, limit],
    );
  });
}

export async function getJob(db, { jobId, tenantId, userId }) {
  return withTenant(db, { tenantId, userId }, async () => {
    const jobs = await db.query(
      `SELECT
         c.id, c.source, c.title, c.institution, c.country, c.url,
         c.score, c.score_band, c.deadline_text, c.org_id, c.posted_at, c.updated_at,
         d.summary, d.description, d.location,
         o.status AS overlay_status,
         o.notes AS overlay_notes
       FROM catalog_jobs c
       LEFT JOIN catalog_job_details d ON d.job_id = c.id
       LEFT JOIN job_overlays o
         ON o.job_id = c.id AND o.workspace_id = $1
       WHERE c.id = $2`,
      [tenantId, jobId],
    );
    return jobs[0] || null;
  });
}

export async function listOrgs(db, { tenantId, userId, limit = FEED_PAGE_SIZE } = {}) {
  return withTenant(db, { tenantId, userId }, async () => {
    return db.query(
      `SELECT o.id, o.name, o.slug, o.website, o.careers_url, o.source, o.country, o.notes, o.updated_at,
              COUNT(j.id)::int AS job_count
         FROM catalog_orgs o
         LEFT JOIN catalog_jobs j ON j.org_id = o.id AND j.visible = true
        GROUP BY o.id
        ORDER BY o.name ASC
        LIMIT $1`,
      [limit],
    );
  });
}

export async function getOrg(db, { orgId, tenantId, userId }) {
  return withTenant(db, { tenantId, userId }, async () => {
    const orgs = await db.query(
      `SELECT o.id, o.name, o.slug, o.website, o.careers_url, o.source, o.country, o.notes, o.updated_at
         FROM catalog_orgs o WHERE o.id = $1`,
      [orgId],
    );
    const org = orgs[0];
    if (!org) return null;
    const jobs = await db.query(
      `SELECT c.id, c.source, c.title, c.country, c.url, c.score, c.deadline_text,
              ov.status AS overlay_status
         FROM catalog_jobs c
         LEFT JOIN job_overlays ov
           ON ov.job_id = c.id AND ov.workspace_id = $1
        WHERE c.org_id = $2 AND c.visible = true
        ORDER BY c.updated_at DESC
        LIMIT 48`,
      [tenantId, orgId],
    );
    return { ...org, jobs };
  });
}

export async function listOverlays(db, { tenantId, userId, status = null }) {
  return withTenant(db, { tenantId, userId }, async () => {
    return db.query(
      `SELECT o.job_id, o.status, o.notes, o.updated_at,
              c.title, c.institution, c.source, c.url, c.score, c.country
         FROM job_overlays o
         JOIN catalog_jobs c ON c.id = o.job_id
        WHERE o.workspace_id = $1
          AND ($2::text IS NULL OR o.status = $2)
        ORDER BY o.updated_at DESC`,
      [tenantId, status],
    );
  });
}

export async function patchOverlay(db, { tenantId, userId, jobId, status, notes }) {
  const nextStatus = OVERLAY_STATUSES.includes(status) ? status : 'saved';
  return withTenant(db, { tenantId, userId }, async () => {
    const jobs = await db.query('SELECT id FROM catalog_jobs WHERE id = $1', [jobId]);
    if (!jobs[0]) return { ok: false, error: 'unknown_job' };
    await db.query(
      `INSERT INTO job_overlays (workspace_id, job_id, status, notes, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (workspace_id, job_id) DO UPDATE SET
         status = EXCLUDED.status,
         notes = EXCLUDED.notes,
         updated_at = now()`,
      [tenantId, jobId, nextStatus, notes || ''],
    );
    const rows = await db.query(
      'SELECT * FROM job_overlays WHERE workspace_id = $1 AND job_id = $2',
      [tenantId, jobId],
    );
    return { ok: true, overlay: rows[0] };
  });
}

export async function readOverlayDirect(db, { tenantId, userId, jobId }) {
  return withTenant(db, { tenantId, userId }, async () => {
    const rows = await db.query(
      'SELECT * FROM job_overlays WHERE job_id = $1',
      [jobId],
    );
    return rows;
  });
}

export function stubEuraxessJobs() {
  return [
    {
      id: 'euraxess-fusion-demo-1',
      source: 'euraxess',
      title: 'PhD position — plasma diagnostics and FPGA DAQ',
      institution: 'ITER Organization',
      country: 'France',
      url: 'https://euraxess.ec.europa.eu/jobs/000000',
      score: 4.4,
      score_band: 'top_priority',
      deadline_text: '2099-12-31',
      visible: true,
      summary: 'Stub EURAXESS row for local isolation tests.',
      org_id: 'org-iter-organization',
    },
    {
      id: 'euraxess-fusion-demo-2',
      source: 'euraxess',
      title: 'Postdoc — magnetic confinement diagnostics',
      institution: 'Max Planck Institute for Plasma Physics',
      country: 'Germany',
      url: 'https://euraxess.ec.europa.eu/jobs/000001',
      score: 4.1,
      score_band: 'strong_fit',
      deadline_text: '2099-11-15',
      visible: true,
      summary: 'Stub EURAXESS row for local isolation tests.',
      org_id: 'org-max-planck-institute-for-plasma-physics',
    },
  ];
}

export function stubOrgs() {
  return [
    {
      id: 'org-helion-energy',
      name: 'Helion Energy',
      slug: 'helion-energy',
      website: 'https://www.helionenergy.com',
      careers_url: 'https://jobs.ashbyhq.com/helion',
      source: 'fusion',
      country: 'United States',
    },
    {
      id: 'org-iter-organization',
      name: 'ITER Organization',
      slug: 'iter-organization',
      website: 'https://www.iter.org',
      source: 'euraxess',
      country: 'France',
    },
  ];
}
