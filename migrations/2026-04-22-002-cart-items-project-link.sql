-- applied-historically: yes
-- source: POST /api/admin/apply-cart-project-link (worker/index.ts, first commit 427b7fd, removed 2026-09-11)
-- cart_items.project_id nullable FK -> projects (ON DELETE SET NULL) plus a
-- one-off back-fill from users.active_project_id. The UPDATE only touches
-- rows where project_id IS NULL, so re-running is a no-op.

ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS project_id VARCHAR REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS cart_items_project_idx ON cart_items(project_id);

UPDATE cart_items ci
SET project_id = u.active_project_id
FROM users u
WHERE ci.user_id = u.id
  AND ci.project_id IS NULL
  AND u.active_project_id IS NOT NULL;
