-- applied-historically: yes
-- source: POST /api/admin/apply-installation-notes-schema (worker/index.ts, first commit 880014e, removed 2026-09-11)
-- Free-text "what should the estimation team know about installing this?"
-- box on the project, rendered into the order-form PDF.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS installation_notes TEXT;
