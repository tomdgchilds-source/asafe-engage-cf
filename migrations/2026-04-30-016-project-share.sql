-- applied-historically: yes
-- source: POST /api/admin/apply-project-share-schema (worker/index.ts, first commit 456d9b0, removed 2026-09-11)
-- Public project share links (mirrors orders.share_token*), customer
-- approvals and a per-view audit table.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_token VARCHAR;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_token_expires_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_token_created_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_token_created_by VARCHAR;
CREATE INDEX IF NOT EXISTS projects_share_token_idx ON projects(share_token);

CREATE TABLE IF NOT EXISTS project_approvals (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  share_token VARCHAR,
  decision VARCHAR NOT NULL,
  approver_name VARCHAR,
  approver_email VARCHAR,
  comments TEXT,
  ip_address VARCHAR,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_approvals_project_idx ON project_approvals(project_id);

CREATE TABLE IF NOT EXISTS project_view_audit (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  share_token VARCHAR NOT NULL,
  ip_address VARCHAR,
  user_agent TEXT,
  viewed_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_view_audit_project_idx ON project_view_audit(project_id);
CREATE INDEX IF NOT EXISTS project_view_audit_token_idx ON project_view_audit(share_token);
CREATE INDEX IF NOT EXISTS project_view_audit_viewed_at_idx ON project_view_audit(viewed_at);
