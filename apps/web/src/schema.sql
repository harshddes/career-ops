-- Public Career OS — Neon / PGlite schema
-- Shared catalog is readable by every signed-in tenant.
-- Private rows are isolated by app.tenant_id (workspace id).

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

CREATE INDEX IF NOT EXISTS catalog_jobs_source_visible_idx
  ON catalog_jobs (source, visible, updated_at DESC);

CREATE INDEX IF NOT EXISTS job_overlays_workspace_idx
  ON job_overlays (workspace_id);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE job_overlays ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_overlays FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;

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
