-- applied-historically: yes
-- source: POST /api/admin/apply-layout-project-link (worker/index.ts, first commit b48015c, removed 2026-09-11)
-- layout_drawings.project_id nullable FK -> projects (ON DELETE SET NULL) plus
-- a one-off back-fill from users.active_project_id (NULL rows only).

ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS project_id VARCHAR REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS layout_drawings_project_idx ON layout_drawings(project_id);

UPDATE layout_drawings ld
SET project_id = u.active_project_id
FROM users u
WHERE ld.user_id = u.id
  AND ld.project_id IS NULL
  AND u.active_project_id IS NOT NULL;
