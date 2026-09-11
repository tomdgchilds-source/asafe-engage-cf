ALTER TABLE orders ADD COLUMN IF NOT EXISTS fx_rate_at_order numeric(12,6);
