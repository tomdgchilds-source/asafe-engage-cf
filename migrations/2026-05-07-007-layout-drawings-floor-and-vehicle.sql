-- applied-historically: yes
-- source: POST /api/admin/apply-layout-drawing-schema (worker/index.ts, first commit 9a59973, removed 2026-09-11)
-- PAS 13 guardrail metadata: floor_type drives anchor/floor rules,
-- vehicle_type_id drives the vehicle-class mismatch rule.

ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS floor_type TEXT;
ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS vehicle_type_id VARCHAR REFERENCES vehicle_types(id) ON DELETE SET NULL;
