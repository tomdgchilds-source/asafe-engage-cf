-- Phase 3 / Task S1: per-photo records for the Survey Walk + AI usage log.
-- Idempotent: safe to re-run.

-- Per-photo records (replaces the photos_urls jsonb array for new surveys; old arrays still read)
CREATE TABLE IF NOT EXISTS survey_photos (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  site_survey_id varchar NOT NULL REFERENCES site_surveys(id) ON DELETE CASCADE,
  area_id       varchar REFERENCES site_survey_areas(id) ON DELETE SET NULL,
  zone_name     varchar,
  object_key    varchar NOT NULL,               -- R2 key
  width         integer, height integer,
  taken_at      timestamp DEFAULT now(),
  lat           double precision, lng double precision,
  voice_note    text,
  analysis      jsonb,                          -- VisionObservation, null until analysed
  analysis_status varchar NOT NULL DEFAULT 'pending', -- pending|done|failed|skipped
  analysis_model varchar,
  created_at    timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS survey_photos_survey_idx ON survey_photos(site_survey_id);

-- One row per LLM call so spend is auditable per survey.
CREATE TABLE IF NOT EXISTS ai_usage (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          varchar,                        -- call site, e.g. 'vision_photo'
  model         varchar,
  input_tokens  integer,
  output_tokens integer,
  cost_usd_est  numeric(10,6),
  survey_id     varchar,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_survey_idx ON ai_usage(survey_id);
