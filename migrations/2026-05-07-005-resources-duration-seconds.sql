-- applied-historically: yes
-- source: POST /api/admin/apply-resource-duration-schema (worker/index.ts, first commit c31956f, removed 2026-09-11)
-- Whole-second runtime for video resources (M:SS badge on resource cards).

ALTER TABLE resources ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
