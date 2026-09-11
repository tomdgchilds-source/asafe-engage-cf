-- applied-historically: yes
-- source: POST /api/admin/apply-email-log-schema (worker/index.ts, first commit 7e6f94c, removed 2026-09-11)
-- Resend send-attempt log behind /admin/email-log.

CREATE TABLE IF NOT EXISTS email_log (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "to" varchar NOT NULL,
  subject varchar NOT NULL,
  from_address varchar,
  status varchar NOT NULL,
  resend_id varchar,
  error_code varchar,
  error_message text,
  response_status integer,
  response_body text,
  caller_route varchar,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_log_created_at_idx ON email_log (created_at DESC);
