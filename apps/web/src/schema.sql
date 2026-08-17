-- Public Career OS — Neon / PGlite schema
-- Shared catalog is readable by every signed-in tenant.
-- Private rows are isolated by app.tenant_id (workspace id).
-- Networking PII lives only in RLS tables. Never export it to static snapshots.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS magic_links (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  careers_url TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_jobs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  institution TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  score DOUBLE PRECISION,
  score_band TEXT NOT NULL DEFAULT '',
  deadline_text TEXT NOT NULL DEFAULT '',
  visible BOOLEAN NOT NULL DEFAULT true,
  org_id TEXT,
  posted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE catalog_jobs ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE catalog_jobs ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS catalog_job_details (
  job_id TEXT PRIMARY KEY REFERENCES catalog_jobs(id) ON DELETE CASCADE,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_overlays (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES catalog_jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'saved',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, job_id)
);

CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lane TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  prompt_text TEXT NOT NULL DEFAULT '',
  result_md TEXT NOT NULL DEFAULT '',
  contains_pii BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_people (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  organization_name TEXT NOT NULL DEFAULT '',
  org_id TEXT,
  public_urls TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  review_status TEXT NOT NULL DEFAULT 'identified',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scan_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  upserted INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS catalog_jobs_source_visible_idx
  ON catalog_jobs (source, visible, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS catalog_jobs_org_idx ON catalog_jobs (org_id);
CREATE INDEX IF NOT EXISTS catalog_orgs_source_idx ON catalog_orgs (source, name);
CREATE INDEX IF NOT EXISTS job_overlays_workspace_idx ON job_overlays (workspace_id, status);
CREATE INDEX IF NOT EXISTS work_orders_workspace_status_idx
  ON work_orders (workspace_id, status, updated_at DESC);
CREATE TABLE IF NOT EXISTS workspace_profiles (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  cv_text TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '',
  digest_enabled BOOLEAN NOT NULL DEFAULT false,
  last_digest_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_people_workspace_idx
  ON workspace_people (workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS scan_runs_source_idx ON scan_runs (source, started_at DESC);

-- Signup/session rows are written by the connection owner without app.tenant_id.
-- ENABLE without FORCE so that role can insert. app_user still hits the policies.
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces NO FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions NO FORCE ROW LEVEL SECURITY;
-- Private workspace rows: FORCE so even the table owner needs app.tenant_id
-- (set on one Postgres session inside withTenant).
ALTER TABLE job_overlays ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_overlays FORCE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_people FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspaces_tenant ON workspaces;
CREATE POLICY workspaces_tenant ON workspaces
  USING (id = current_setting('app.tenant_id', true))
  WITH CHECK (id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS overlays_tenant ON job_overlays;
CREATE POLICY overlays_tenant ON job_overlays
  USING (workspace_id = current_setting('app.tenant_id', true))
  WITH CHECK (workspace_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS sessions_owner ON sessions;
CREATE POLICY sessions_owner ON sessions
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

DROP POLICY IF EXISTS work_orders_tenant ON work_orders;
CREATE POLICY work_orders_tenant ON work_orders
  USING (workspace_id = current_setting('app.tenant_id', true))
  WITH CHECK (workspace_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS workspace_people_tenant ON workspace_people;
CREATE POLICY workspace_people_tenant ON workspace_people
  USING (workspace_id = current_setting('app.tenant_id', true))
  WITH CHECK (workspace_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS workspace_profiles_tenant ON workspace_profiles;
CREATE POLICY workspace_profiles_tenant ON workspace_profiles
  USING (workspace_id = current_setting('app.tenant_id', true))
  WITH CHECK (workspace_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS workspace_profiles_service ON workspace_profiles;
CREATE POLICY workspace_profiles_service ON workspace_profiles
  USING (current_setting('app.service_role', true) = '1')
  WITH CHECK (current_setting('app.service_role', true) = '1');
