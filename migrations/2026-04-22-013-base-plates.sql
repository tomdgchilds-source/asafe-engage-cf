-- applied-historically: yes
-- source: POST /api/admin/apply-base-plates-schema (worker/index.ts, first commit f8b4c11, removed 2026-09-11)
-- base_plates (plate SKUs from the Available Base Plates PDF) and the
-- product <-> plate compatibility junction.

CREATE TABLE IF NOT EXISTS base_plates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR NOT NULL UNIQUE,
  name VARCHAR NOT NULL,
  description TEXT,
  bolt_size VARCHAR,
  bolt_length_mm INTEGER,
  plate_dimensions_mm VARCHAR,
  coating VARCHAR,
  fixing_type VARCHAR,
  substrate_notes TEXT,
  is_standard_stock BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS base_plate_product_compatibility (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  base_plate_id VARCHAR NOT NULL REFERENCES base_plates(id) ON DELETE CASCADE,
  product_id VARCHAR NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT now(),
  CONSTRAINT bp_compat_unique UNIQUE (base_plate_id, product_id)
);
CREATE INDEX IF NOT EXISTS bp_compat_product_idx ON base_plate_product_compatibility (product_id);
CREATE INDEX IF NOT EXISTS bp_compat_plate_idx ON base_plate_product_compatibility (base_plate_id);
