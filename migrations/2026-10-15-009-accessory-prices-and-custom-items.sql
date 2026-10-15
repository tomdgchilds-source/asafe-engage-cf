-- Accessory price list + custom cart lines (2026-10-15).
-- (1) accessory_prices: the live price list behind the cart's accessory
--     picker. Seeded below from shared/cartAccessories.ts ACCESSORY_CATALOGUE
--     (real SKUs from scripts/data/pricelist-aed-2025v1.json carry a price;
--     everything else is NULL + price_to_confirm until estimation confirms).
--     Admins edit rows via PATCH /api/admin/accessory-prices/:code.
-- (2) cart_items: is_custom / custom_category / pricing_basis for rep-authored
--     lines (POST /api/cart/custom) and accessory_lines (jsonb AccessoryLine[])
--     for priced accessory sub-lines (PATCH /api/cart/:id/accessories).
-- (3) custom_items_library: per-rep reusable custom line items.
-- Every statement is idempotent; the seed is INSERT ... ON CONFLICT DO NOTHING
-- so admin-edited prices are never overwritten by a re-run.

CREATE TABLE IF NOT EXISTS accessory_prices (
  code VARCHAR PRIMARY KEY,
  label VARCHAR NOT NULL,
  "group" VARCHAR NOT NULL,
  unit VARCHAR NOT NULL DEFAULT 'each',
  price_aed NUMERIC(12,2),
  price_to_confirm BOOLEAN NOT NULL DEFAULT true,
  applies_to_families TEXT[],
  sku VARCHAR,
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accessory_prices_group_idx ON accessory_prices ("group");

ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS is_custom BOOLEAN DEFAULT false;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS custom_category VARCHAR;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS pricing_basis VARCHAR DEFAULT 'price_list';
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS accessory_lines JSONB;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS custom_items_library (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  product_name VARCHAR NOT NULL,
  description TEXT,
  custom_category VARCHAR NOT NULL DEFAULT 'other',
  pricing_type VARCHAR NOT NULL DEFAULT 'standard_item',
  unit_price_aed NUMERIC(12,2) NOT NULL,
  requires_delivery BOOLEAN NOT NULL DEFAULT false,
  requires_installation BOOLEAN NOT NULL DEFAULT false,
  pricing_basis VARCHAR NOT NULL DEFAULT 'rep_estimate',
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS custom_items_library_user_idx ON custom_items_library (user_id);

-- Seed: one row per catalogue code. Column order:
-- (code, label, "group", unit, price_aed, price_to_confirm, applies_to_families, sku)
INSERT INTO accessory_prices (code, label, "group", unit, price_aed, price_to_confirm, applies_to_families, sku) VALUES
  ('fixing-zinc-plated', 'Standard zinc-plated fixings', 'fixings', 'per_post', NULL, true, NULL, NULL),
  ('fixing-stainless-steel', 'Stainless steel (SS) fixings', 'fixings', 'per_post', NULL, true, NULL, NULL),
  ('fixing-countersunk', 'Countersunk fixings', 'fixings', 'per_post', NULL, true, NULL, NULL),
  ('fixing-chemical-anchor', 'Chemical anchors', 'fixings', 'per_post', NULL, true, NULL, NULL),
  ('fixing-through-bolt', 'Through-bolts', 'fixings', 'per_post', NULL, true, NULL, NULL),
  ('weld-plate', 'Weld plate', 'plates', 'per_post', NULL, true, NULL, NULL),
  ('slider-plate-iflex-190', 'iFlex 190 Post Slider Plate (230 × 230 mm)', 'plates', 'per_post', 513.00, false, ARRAY['iFlex']::text[], 'B-03-01-0021'),
  ('slider-plate-eflex', 'eFlex Post Slider Plate (180 × 180 mm)', 'plates', 'per_post', 327.00, false, ARRAY['eFlex']::text[], 'B-03-01-0040'),
  ('dock-buffer-pair', 'Dock Buffer (Pair)', 'dock', 'per_pair', 2287.08, false, NULL, 'A-01-22-0002'),
  ('dock-buffer-standard', 'Dock buffer — standard', 'dock', 'each', NULL, true, NULL, NULL),
  ('dock-buffer-heavy-duty', 'Dock buffer — heavy-duty', 'dock', 'each', NULL, true, NULL, NULL),
  ('l-bracket', 'L-bracket', 'brackets', 'each', NULL, true, NULL, NULL),
  ('bollard-cap', 'Bollard cap', 'caps', 'each', NULL, true, NULL, NULL),
  ('height-extension', 'Height extension', 'extensions', 'per_post', NULL, true, NULL, NULL),
  ('spacer-flexishield-100-black', 'FlexiShield Column Guard Spacer set — 100 mm, Black', 'spacers', 'each', 612.96, false, ARRAY['FlexiShield']::text[], 'A-01-14-0051'),
  ('spacer-flexishield-100-yellow', 'FlexiShield Column Guard Spacer set — 100 mm, Yellow', 'spacers', 'each', 834.48, false, ARRAY['FlexiShield']::text[], 'A-01-14-0052'),
  ('spacer-flexishield-150-black', 'FlexiShield Column Guard Spacer set — 150 mm, Black', 'spacers', 'each', 640.92, false, ARRAY['FlexiShield']::text[], 'A-01-14-0053'),
  ('spacer-flexishield-150-yellow', 'FlexiShield Column Guard Spacer set — 150 mm, Yellow', 'spacers', 'each', 873.84, false, ARRAY['FlexiShield']::text[], 'A-01-14-0054'),
  ('spacer-flexishield-300-black', 'FlexiShield Column Guard Spacer set — 300 mm, Black', 'spacers', 'each', 701.88, false, ARRAY['FlexiShield']::text[], 'A-01-14-0055'),
  ('spacer-flexishield-300-yellow', 'FlexiShield Column Guard Spacer set — 300 mm, Yellow', 'spacers', 'each', 959.52, false, ARRAY['FlexiShield']::text[], 'A-01-14-0056'),
  ('other-accessory', 'Other accessory (see notes)', 'other', 'each', NULL, true, NULL, NULL)
ON CONFLICT (code) DO NOTHING;
