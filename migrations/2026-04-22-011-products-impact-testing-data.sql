-- applied-historically: yes
-- source: POST /api/admin/apply-master-testing-schema (worker/index.ts, first commit b201630, removed 2026-09-11)
-- Per-product geometry from the PRH-1012 master impact-testing document.

ALTER TABLE products ADD COLUMN IF NOT EXISTS impact_testing_data jsonb;
