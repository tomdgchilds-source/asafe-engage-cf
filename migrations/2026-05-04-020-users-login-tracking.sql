-- applied-historically: yes
-- source: POST /api/admin/apply-login-tracking (worker/index.ts, first commit 41fd117, removed 2026-09-11)
-- Drives the admin usage report (active vs dormant users).

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;
UPDATE users SET login_count = 0 WHERE login_count IS NULL;
