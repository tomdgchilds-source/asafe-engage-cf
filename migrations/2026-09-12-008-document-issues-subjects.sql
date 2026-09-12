-- Phase 3D document register (docs/superpowers/plans/2026-09-11-engage-phase3d-documents.md, Task PD6).
-- Drawing sheets (DS) are issued per layout drawing and installation
-- verification reports (IV) per installation; neither has an order or a
-- survey to key revisions on, so document_issues gets a subject column for
-- each. Existing rows are unaffected (both nullable).

ALTER TABLE document_issues ADD COLUMN IF NOT EXISTS drawing_id VARCHAR;
ALTER TABLE document_issues ADD COLUMN IF NOT EXISTS installation_id VARCHAR;
CREATE INDEX IF NOT EXISTS document_issues_drawing_idx ON document_issues (drawing_id);
CREATE INDEX IF NOT EXISTS document_issues_installation_idx ON document_issues (installation_id);
