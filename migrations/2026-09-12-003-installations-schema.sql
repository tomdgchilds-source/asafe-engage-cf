-- applied-historically: yes
-- source: POST /api/admin/apply-install-schema (worker/routes/installations.ts, first commit 76ca107, removed 2026-09-11)
-- Installation Timeline: the six installation tables (teams, team members,
-- installations, phases, milestones, team assignments) and their indexes.

CREATE TABLE IF NOT EXISTS install_teams (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  region VARCHAR,
  lead_contact_name VARCHAR,
  contact_email VARCHAR,
  contact_phone VARCHAR,
  capacity_jobs_per_week INTEGER DEFAULT 3,
  colour VARCHAR,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS install_teams_name_idx ON install_teams(name);
CREATE INDEX IF NOT EXISTS install_teams_active_idx ON install_teams(active);

CREATE TABLE IF NOT EXISTS install_team_members (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR NOT NULL REFERENCES install_teams(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  email VARCHAR,
  phone VARCHAR,
  role_in_team VARCHAR,
  certifications JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS install_team_members_team_idx ON install_team_members(team_id);

CREATE TABLE IF NOT EXISTS installations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR REFERENCES orders(id),
  project_id VARCHAR REFERENCES projects(id),
  customer_company_id VARCHAR REFERENCES customer_companies(id),
  created_by_user_id VARCHAR REFERENCES users(id),
  updated_by_user_id VARCHAR REFERENCES users(id),
  title VARCHAR NOT NULL,
  customer_name VARCHAR,
  location TEXT,
  contact_name VARCHAR,
  contact_email VARCHAR,
  contact_phone VARCHAR,
  source VARCHAR NOT NULL DEFAULT 'order_won',
  complexity VARCHAR NOT NULL DEFAULT 'standard',
  status VARCHAR NOT NULL DEFAULT 'planning',
  planned_start TIMESTAMP,
  planned_end TIMESTAMP,
  actual_start TIMESTAMP,
  actual_end TIMESTAMP,
  progress INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS installations_order_unique ON installations(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS installations_status_idx ON installations(status);
CREATE INDEX IF NOT EXISTS installations_planned_start_idx ON installations(planned_start);
CREATE INDEX IF NOT EXISTS installations_project_idx ON installations(project_id);

CREATE TABLE IF NOT EXISTS installation_phases (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id VARCHAR NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  name VARCHAR NOT NULL,
  description TEXT,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  status VARCHAR NOT NULL DEFAULT 'not_started',
  progress INTEGER NOT NULL DEFAULT 0,
  assigned_team_id VARCHAR REFERENCES install_teams(id),
  dependencies JSONB,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS installation_phases_installation_idx ON installation_phases(installation_id);
CREATE INDEX IF NOT EXISTS installation_phases_team_idx ON installation_phases(assigned_team_id);

CREATE TABLE IF NOT EXISTS installation_milestones (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id VARCHAR NOT NULL REFERENCES installation_phases(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  date TIMESTAMP,
  completed BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS installation_milestones_phase_idx ON installation_milestones(phase_id);

CREATE TABLE IF NOT EXISTS installation_assignments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id VARCHAR NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  team_id VARCHAR NOT NULL REFERENCES install_teams(id) ON DELETE RESTRICT,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS installation_assignments_install_idx ON installation_assignments(installation_id);
CREATE INDEX IF NOT EXISTS installation_assignments_team_idx ON installation_assignments(team_id);
