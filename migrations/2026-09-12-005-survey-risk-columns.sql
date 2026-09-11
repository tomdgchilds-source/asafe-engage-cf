-- Phase 3 / Task S0 (applied by Task S4): risk-register columns on
-- site_survey_areas and snapshot / return-visit columns on site_surveys.
-- Idempotent: safe to re-run.

ALTER TABLE site_survey_areas ADD COLUMN IF NOT EXISTS likelihood integer;             -- 1..5
ALTER TABLE site_survey_areas ADD COLUMN IF NOT EXISTS severity integer;               -- 1..5
ALTER TABLE site_survey_areas ADD COLUMN IF NOT EXISTS risk_score integer;             -- likelihood*severity
ALTER TABLE site_survey_areas ADD COLUMN IF NOT EXISTS priority_rank integer;          -- 1 = most urgent within survey
ALTER TABLE site_survey_areas ADD COLUMN IF NOT EXISTS load_mass real;
ALTER TABLE site_survey_areas ADD COLUMN IF NOT EXISTS traffic_density varchar;        -- low|medium|high
ALTER TABLE site_survey_areas ADD COLUMN IF NOT EXISTS pedestrian_exposure varchar;    -- none|occasional|frequent|constant
ALTER TABLE site_survey_areas ADD COLUMN IF NOT EXISTS existing_protection varchar;    -- none|partial|adequate
ALTER TABLE site_survey_areas ADD COLUMN IF NOT EXISTS recommended_length_m real;      -- rep-entered run length for costing
ALTER TABLE site_survey_areas ADD COLUMN IF NOT EXISTS pas13_verdict jsonb;            -- output of pas13Verdict for the chosen product
ALTER TABLE site_survey_areas ADD COLUMN IF NOT EXISTS ai_observation text;

ALTER TABLE site_surveys ADD COLUMN IF NOT EXISTS previous_survey_id varchar REFERENCES site_surveys(id);
ALTER TABLE site_surveys ADD COLUMN IF NOT EXISTS snapshot jsonb;                      -- frozen SurveySnapshot at completion
ALTER TABLE site_surveys ADD COLUMN IF NOT EXISTS proposal_object_key varchar;         -- last rendered proposal PDF in R2
