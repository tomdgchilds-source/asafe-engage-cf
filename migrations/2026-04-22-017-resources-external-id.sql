-- applied-historically: yes
-- source: DDL section of POST /api/admin/ingest-installation-videos (worker/index.ts, first commit 1c5ec80, removed 2026-09-11)
-- YouTube id + share URL on resources so the install-video ingest can
-- upsert by video id. The three UPDATEs derive external_id from legacy
-- file_url shapes and only touch rows where it is still NULL.

ALTER TABLE resources ADD COLUMN IF NOT EXISTS external_id varchar;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS external_url varchar;
CREATE INDEX IF NOT EXISTS resources_external_id_idx ON resources (external_id);

UPDATE resources
SET external_id = regexp_replace(file_url, '^.*[?&]v=([A-Za-z0-9_-]{6,})(?:[&].*)?$', '\1')
WHERE external_id IS NULL
  AND file_url ~ '[?&]v=[A-Za-z0-9_-]{6,}';

UPDATE resources
SET external_id = regexp_replace(file_url, '^.*youtu\.be/([A-Za-z0-9_-]{6,}).*$', '\1')
WHERE external_id IS NULL
  AND file_url ~ 'youtu\.be/[A-Za-z0-9_-]{6,}';

UPDATE resources
SET external_id = regexp_replace(file_url, '^.*/embed/([A-Za-z0-9_-]{6,}).*$', '\1')
WHERE external_id IS NULL
  AND file_url ~ 'youtube\.com/embed/[A-Za-z0-9_-]{6,}';
