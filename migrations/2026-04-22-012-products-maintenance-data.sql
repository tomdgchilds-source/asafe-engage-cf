-- applied-historically: yes
-- source: POST /api/admin/apply-maintenance-schema (worker/index.ts, first commit ffb7b0e, removed 2026-09-11)
-- Per-product maintenance / inspection / cleaning payload (PRH-1001).

ALTER TABLE products ADD COLUMN IF NOT EXISTS maintenance_data jsonb;
