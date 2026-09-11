-- applied-historically: yes
-- source: GET /api/admin/fix-schema (worker/index.ts, first commit 9b0fd46, removed 2026-09-11)
-- Adds OAuth / password-reset / job-role / active-project columns on users,
-- creates customer_companies, projects, project_contacts,
-- user_service_selections, partner_codes, partner_code_redemptions,
-- approval_tokens and order_audit_log, and back-fills late-added columns on
-- cart_items, cart_project_info, layout_drawings and orders.

ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expiry TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_role VARCHAR DEFAULT 'BDM';
ALTER TABLE users ADD COLUMN IF NOT EXISTS active_project_id VARCHAR;

CREATE TABLE IF NOT EXISTS customer_companies (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  logo_url VARCHAR,
  industry VARCHAR,
  billing_address TEXT,
  city VARCHAR,
  country VARCHAR,
  website VARCHAR,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_companies_user_idx ON customer_companies (user_id);
CREATE INDEX IF NOT EXISTS customer_companies_name_lower_idx ON customer_companies (lower(name));

CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  customer_company_id VARCHAR,
  name VARCHAR NOT NULL,
  location VARCHAR,
  description TEXT,
  status VARCHAR DEFAULT 'active',
  default_delivery_address TEXT,
  default_installation_complexity VARCHAR,
  preferred_reciprocal_commitment_ids JSONB,
  preferred_service_option_id VARCHAR,
  last_accessed_at TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_user_idx ON projects (user_id);
CREATE INDEX IF NOT EXISTS projects_customer_idx ON projects (customer_company_id);
CREATE INDEX IF NOT EXISTS projects_last_accessed_idx ON projects (last_accessed_at);

CREATE TABLE IF NOT EXISTS project_contacts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL,
  customer_company_id VARCHAR,
  name VARCHAR NOT NULL,
  job_title VARCHAR,
  email VARCHAR,
  mobile VARCHAR,
  role VARCHAR,
  notes TEXT,
  last_interacted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_contacts_project_idx ON project_contacts (project_id);
CREATE INDEX IF NOT EXISTS project_contacts_email_idx ON project_contacts (lower(email));

ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS restrictor_height DECIMAL;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS restrictor_width DECIMAL;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS topple_height DECIMAL;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS topple_width DECIMAL;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS calculator_images JSONB;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS selected_variant JSONB;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS application_area TEXT;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS column_length VARCHAR;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS column_width VARCHAR;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS sides_to_protect INTEGER;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS length_spacers INTEGER;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS width_spacers INTEGER;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS impact_calculation_id VARCHAR;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS calculation_context JSONB;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS reference_images JSONB;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS installation_location TEXT;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS requires_delivery BOOLEAN DEFAULT false;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS delivery_latitude DECIMAL(10,8);
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS delivery_longitude DECIMAL(11,8);
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS requires_installation BOOLEAN DEFAULT false;

ALTER TABLE cart_project_info ADD COLUMN IF NOT EXISTS company_logo_url VARCHAR;

CREATE TABLE IF NOT EXISTS user_service_selections (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  service_option_id VARCHAR NOT NULL,
  is_selected BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_codes (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR NOT NULL UNIQUE,
  partner_name VARCHAR NOT NULL,
  discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 1 AND 35),
  valid_from TIMESTAMP,
  valid_to TIMESTAMP,
  usage_cap INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by VARCHAR,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_codes_code_lower_idx ON partner_codes (LOWER(code));

ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS dwg_number VARCHAR;
ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS revision VARCHAR;
ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS drawing_date VARCHAR;
ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS drawing_title VARCHAR;
ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS drawing_scale VARCHAR;
ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS author VARCHAR;
ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS checked_by VARCHAR;
ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS revision_history JSONB;
ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS notes_section TEXT;

CREATE TABLE IF NOT EXISTS partner_code_redemptions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_code_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  order_id VARCHAR,
  cart_subtotal NUMERIC(12,2),
  discount_percent_applied INTEGER NOT NULL,
  redeemed_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_redemptions_code_idx ON partner_code_redemptions (partner_code_id);
CREATE INDEX IF NOT EXISTS partner_redemptions_user_idx ON partner_code_redemptions (user_id);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS marketing_signature JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS next_approver_emails JSONB;

CREATE TABLE IF NOT EXISTS approval_tokens (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR NOT NULL UNIQUE,
  order_id VARCHAR NOT NULL REFERENCES orders(id),
  section VARCHAR NOT NULL,
  expected_email VARCHAR NOT NULL,
  issued_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  revoked_at TIMESTAMP,
  created_by VARCHAR REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_tokens_token ON approval_tokens (token);
CREATE INDEX IF NOT EXISTS idx_approval_tokens_order ON approval_tokens (order_id);

CREATE TABLE IF NOT EXISTS order_audit_log (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id VARCHAR NOT NULL REFERENCES orders(id),
  event_type VARCHAR NOT NULL,
  section VARCHAR,
  actor_user_id VARCHAR REFERENCES users(id),
  actor_email VARCHAR,
  details JSONB,
  ip_address VARCHAR,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_audit_log_order ON order_audit_log (order_id);
CREATE INDEX IF NOT EXISTS idx_order_audit_log_created ON order_audit_log (created_at);
