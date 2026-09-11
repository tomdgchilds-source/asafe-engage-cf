-- applied-historically: yes
-- source: POST /api/admin/apply-pas13-orders-schema (worker/index.ts, first commit eb0be47, removed 2026-09-11)
-- PAS 13:2017 borderline / not-aligned warnings captured at order time.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS pas_13_warnings jsonb;
