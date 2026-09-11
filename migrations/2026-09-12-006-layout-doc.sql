-- Phase 4 layout editor (docs/superpowers/plans/2026-09-11-engage-phase4-layout-editor.md, Task L0).
-- layout_drawings.document holds the versioned LayoutDoc JSON; document_version
-- is the optimistic-concurrency counter; export_object_key / export_version
-- track the last server-side vector PDF export in R2.
-- layout_markups rows are migrated lazily on first GET .../document and then
-- soft-deleted, so no data back-fill happens here.

ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS document JSONB;
ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS document_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS export_object_key VARCHAR;
ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS export_version INTEGER;
