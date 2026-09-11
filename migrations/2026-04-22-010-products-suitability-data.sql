-- applied-historically: yes
-- source: POST /api/admin/apply-suitability-schema (worker/index.ts, first commit a8db44c, removed 2026-09-11)
-- Product Suitability spec-sheet payloads + vehicle label arrays, with the
-- GIN index the Impact Calculator cross-reference filter uses.
-- maintenance_data / ground_works_data were added here defensively because
-- Drizzle selects every declared column; migrations 012 and 014 repeat them.

ALTER TABLE products ADD COLUMN IF NOT EXISTS suitability_data jsonb;
ALTER TABLE vehicle_types ADD COLUMN IF NOT EXISTS suitability_labels jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS maintenance_data jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS ground_works_data jsonb;
CREATE INDEX IF NOT EXISTS products_suitability_vehicle_idx ON products USING GIN ((suitability_data -> 'vehicleSuitability'));
