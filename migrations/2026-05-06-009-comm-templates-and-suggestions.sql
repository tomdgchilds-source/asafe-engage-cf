-- applied-historically: yes
-- source: POST /api/admin/apply-comm-templates-schema (worker/index.ts, first commit d142361, removed 2026-09-11)
-- Communication Plan tables. The default templates from
-- shared/commTemplates.ts are seeded by worker/routes/communication.ts on
-- first request (ensureCommTables), not here.

CREATE TABLE IF NOT EXISTS comm_templates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  channel VARCHAR NOT NULL,
  subject VARCHAR,
  body TEXT NOT NULL,
  trigger_event VARCHAR,
  trigger_offset_days INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comm_templates_scenario_idx ON comm_templates(scenario);
CREATE INDEX IF NOT EXISTS comm_templates_trigger_idx ON comm_templates(trigger_event);

CREATE TABLE IF NOT EXISTS comm_suggestions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR REFERENCES projects(id) ON DELETE CASCADE,
  template_id VARCHAR REFERENCES comm_templates(id) ON DELETE SET NULL,
  suggested_at TIMESTAMP DEFAULT now(),
  due_at TIMESTAMP,
  status VARCHAR DEFAULT 'pending',
  rendered_body TEXT,
  rendered_subject VARCHAR,
  rep_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comm_suggestions_rep_idx ON comm_suggestions(rep_user_id);
CREATE INDEX IF NOT EXISTS comm_suggestions_project_idx ON comm_suggestions(project_id);
CREATE INDEX IF NOT EXISTS comm_suggestions_status_idx ON comm_suggestions(status);
