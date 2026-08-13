import { withTenant } from './db.mjs';

const FEED_PAGE_SIZE = 48;

export async function upsertCatalogJobs(db, jobs) {
  for (const job of jobs) {
    await db.query(
      `INSERT INTO catalog_jobs
         (id, source, title, institution, country, url, score, score_band, deadline_text, visible, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         institution = EXCLUDED.institution,
         country = EXCLUDED.country,
         url = EXCLUDED.url,
         score = EXCLUDED.score,
         score_band = EXCLUDED.score_band,
         deadline_text = EXCLUDED.deadline_text,
         visible = EXCLUDED.visible,
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
      ],
    );
  }
  return jobs.length;
}

export async function listFeed(db, { source, tenantId, userId, limit = FEED_PAGE_SIZE }) {
  return withTenant(db, { tenantId, userId }, async () => {
    return db.query(
      `SELECT
         c.id, c.source, c.title, c.institution, c.country, c.url,
         c.score, c.score_band, c.deadline_text,
         o.status AS overlay_status,
         o.notes AS overlay_notes
       FROM catalog_jobs c
       LEFT JOIN job_overlays o
         ON o.job_id = c.id AND o.workspace_id = $1
       WHERE c.source = $2 AND c.visible = true
       ORDER BY c.score DESC NULLS LAST, c.updated_at DESC
       LIMIT $3`,
      [tenantId, source, limit],
    );
  });
}

export async function patchOverlay(db, { tenantId, userId, jobId, status, notes }) {
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
      [tenantId, jobId, status || 'saved', notes || ''],
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
    },
  ];
}
