-- Phase 3D customer document system (docs/superpowers/plans/2026-09-11-engage-phase3d-documents.md, Task PD3).
-- document_refs is the per-(kind, month) counter behind ASU-<kind>-<yymm>-<seq>
-- references (shared/documents/refs.ts). document_issues records every ISSUED
-- render: reference, revision letter, the survey / order / project it was
-- rendered from, who issued it, and where the PDF sits in R2.

CREATE TABLE IF NOT EXISTS document_refs (
  kind VARCHAR NOT NULL,
  yymm VARCHAR NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, yymm)
);

CREATE TABLE IF NOT EXISTS document_issues (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR NOT NULL,
  ref VARCHAR NOT NULL,
  revision VARCHAR NOT NULL,
  survey_id VARCHAR,
  order_id VARCHAR,
  project_id VARCHAR,
  issued_by VARCHAR,
  issued_at TIMESTAMPTZ DEFAULT now(),
  object_key VARCHAR,
  status VARCHAR
);
CREATE INDEX IF NOT EXISTS document_issues_order_idx ON document_issues (order_id);
CREATE INDEX IF NOT EXISTS document_issues_survey_idx ON document_issues (survey_id);
CREATE INDEX IF NOT EXISTS document_issues_project_idx ON document_issues (project_id);
CREATE INDEX IF NOT EXISTS document_issues_ref_idx ON document_issues (ref);
