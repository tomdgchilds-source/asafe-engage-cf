-- applied-historically: yes
-- source: POST /api/admin/apply-groundworks-schema (worker/index.ts, first commit f301860, removed 2026-09-11)
-- Per-product installation prerequisites (PRH-1005 GroundWorks).

ALTER TABLE products ADD COLUMN IF NOT EXISTS ground_works_data jsonb;
