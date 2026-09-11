-- applied-historically: yes
-- source: POST /api/admin/apply-cart-accessories-schema (worker/index.ts, first commit 880014e, removed 2026-09-11)
-- Structured per-line accessory capture (SS bolts, dock buffers, plates, ...).
-- Vocabulary is canonical in shared/cartAccessories.ts.

ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS accessories JSONB;
