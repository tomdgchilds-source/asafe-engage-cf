-- applied-historically: yes
-- source: POST /api/admin/apply-quote-drafts-schema (worker/index.ts, first commit 7e6f94c, removed 2026-09-11)
-- Persistence for the quoting AI drafts. worker/routes/quote.ts also runs
-- this defensively on first POST.

CREATE TABLE IF NOT EXISTS quote_drafts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR,
  survey_id VARCHAR,
  rep_user_id VARCHAR NOT NULL,
  draft_json JSONB NOT NULL,
  pdf_r2_key VARCHAR,
  total_aed NUMERIC(12,2),
  aggregate_pas13_verdict VARCHAR,
  status VARCHAR NOT NULL DEFAULT 'draft',
  share_token VARCHAR,
  share_token_expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quote_drafts_rep_idx ON quote_drafts(rep_user_id);
CREATE INDEX IF NOT EXISTS quote_drafts_project_idx ON quote_drafts(project_id);
CREATE INDEX IF NOT EXISTS quote_drafts_survey_idx ON quote_drafts(survey_id);
CREATE INDEX IF NOT EXISTS quote_drafts_token_idx ON quote_drafts(share_token);
