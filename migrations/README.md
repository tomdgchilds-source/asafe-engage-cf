# Database migrations

There is no local database and nobody runs `psql` against production. Schema
changes are plain SQL files in this directory, applied from the admin UI at
`/admin/migrations` (API: `GET /api/admin/migrations`,
`POST /api/admin/migrations/apply`, both admin-session gated; the apply route
additionally requires `Authorization: Bearer <MIGRATION_TOKEN>` when that
Worker secret is set).

## Adding a migration

1. Create `migrations/YYYY-MM-DD-NNN-<slug>.sql`. `NNN` is a three-digit
   sequence; files are applied in filename order.
2. Every statement must be idempotent (`CREATE TABLE IF NOT EXISTS`,
   `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `UPDATE ... WHERE
   col IS NULL`, `INSERT ... ON CONFLICT DO NOTHING`). A re-run of any file
   must be a no-op.
3. Terminate statements with `;`. `--` comments are fine (full-line or inline).
   Do not use `$$` bodies or semicolons inside string literals.
4. Run `npm run migrations:index` to regenerate `migrations/index.ts` (the
   Worker bundle embeds the SQL; there is no filesystem at runtime). Commit
   both files.
5. Deploy, open `/admin/migrations`, click **Apply pending**. Each file runs
   inside its own transaction and is recorded in `schema_migrations`
   (`id`, `applied_at`, `applied_by`, `note`). A failure stops the run at that
   file; fix the SQL and re-apply.

Files whose header contains `-- applied-historically: yes` were applied to
production through the ad-hoc `apply-*-schema` endpoints that used to live in
`worker/index.ts` (removed 2026-09-11). They are auto-inserted into
`schema_migrations` with note `historical` the first time the list is fetched,
so they never run again. They are kept so a fresh database can be brought to
the production shape by applying everything in order.

Note: `worker/routes/installations.ts` still carries its own
`POST /api/admin/apply-install-schema` endpoint, and `worker/routes/quote.ts`,
`worker/routes/communication.ts` and `worker/scheduled/commSuggestionsScanner.ts`
run defensive `CREATE TABLE IF NOT EXISTS` on first use. Those files are owned
by other tasks; their DDL should move here when they are next touched.

## Retired data-load endpoints

These `worker/index.ts` endpoints loaded data from bundled files (or inline
constants) rather than changing the schema. They have already run in
production and were deleted on 2026-09-11. Recover the code from the commit
listed (`git show <hash>:worker/index.ts`).

| Route | What it did | First commit |
| --- | --- | --- |
| `GET /api/admin/seed-products` | Seeded `products` + `product_pricing` from `worker/data/seedData.ts` (33 families) | `9b0fd46` |
| `GET /api/admin/seed-case-studies` | Seeded `case_studies` from `worker/data/seedData.ts` | `9b0fd46` |
| `GET /api/admin/seed-options` | Upserted `discount_options`, `service_care_options` and four starter `partner_codes` (inline constants) | `9b0fd46` |
| `GET /api/admin/seed-faqs` | Seeded `faqs` from an inline list of ~50 FAQs | `9b0fd46` |
| `GET /api/admin/seed-vehicle-types` | Seeded `vehicle_types` from an inline list of 20 MHE types | `9b0fd46` |
| `POST /api/admin/apply-vehicle-thumbnails` | Set `vehicle_types.thumbnail_url` from `scripts/data/vehicle-image-map-local.json` | `667df5b` |
| `POST /api/admin/apply-impact-corrections` | Patched `products.impact_rating` / PAS 13 fields from `scripts/data/impact-verification-patch.json` (or `cert-impact-patch.json` with `?source=cert`) | `99aa076` |
| `POST /api/admin/sync-catalog-to-db` | Synced impact rating + PAS 13 fields from `scripts/data/asafe-catalog.json` onto `products` | `61a7e3a` |
| `POST /api/admin/apply-comm-templates-schema` (seed part) | Seeded `comm_templates` from `shared/commTemplates.ts`; `worker/routes/communication.ts` now does this on first request. DDL kept as migration 009 | `d142361` |
| `POST /api/admin/upload-certificates` | Created `resources` rows + `product_resources` links for the 10 R2-hosted certificate PDFs from `scripts/data/certificate-manifest.json` | `8ab2cdc` |
| `POST /api/admin/fix-barrier-pricing` | Normalised `products.pricing_logic` per `scripts/data/barrier-pricing-fix.json` | `f8e9051` |
| `GET /api/admin/seed-resources` | Seeded `resources` from an inline list of ~50 videos, datasheets and guides | `9b0fd46` |
| `GET /api/admin/update-product-images` | Set `products.image_url` from an inline name -> CDN URL map | `9b0fd46` |
| `POST /api/admin/ingest-product-suitability` | Wrote `products.suitability_data` from `scripts/data/product-suitability.json` | `a8db44c` |
| `POST /api/admin/apply-suitability-overrides` | Back-filled `suitability_data` from `scripts/data/suitability-overrides.json` and widened Loading Docks taxonomy from `scripts/data/dock-application-overrides.json` | `d4e540c` |
| `POST /api/admin/widen-atlas-vehicle-suitability` | Added HGV / heavy-FLT labels to the two Atlas rows' `suitability_data.vehicleSuitability` | `6533fb0` |
| `POST /api/admin/apply-vehicle-suitability-labels` | Wrote `vehicle_types.suitability_labels` from `shared/vehicleSuitabilityMap.ts` | `a8db44c` |
| `POST /api/admin/apply-master-testing` | Wrote `products.impact_testing_data` + rating fields from `scripts/data/master-testing-patch.json` | `b201630` |
| `POST /api/admin/upload-master-testing-resource` | Created the "Product Impact Testing — Master Document" `resources` row | `b201630` |
| `POST /api/admin/ingest-maintenance-data` | Wrote `products.maintenance_data` from `scripts/data/product-maintenance.json` | `a8db44c` |
| `POST /api/admin/upload-maintenance-guide` | Created the "A-SAFE Product Maintenance Guide (PRH-1001)" `resources` row | `ffb7b0e` |
| `POST /api/admin/seed-heavy-duty-bollard` | Inserted the iFlex Heavy Duty Bollard product from `scripts/data/asafe-catalog.json` | `bf287b1` |
| `POST /api/admin/ingest-base-plates` | Upserted `base_plates` + compatibility edges from `scripts/data/base-plates.json` | `f6f4c96` |
| `POST /api/admin/upload-base-plates-pdf` | Created the "Available Base Plates" `resources` row | `f8b4c11` |
| `POST /api/admin/ingest-groundworks` | Wrote `products.ground_works_data` from `scripts/data/product-groundworks.json` | `f6f4c96` |
| `POST /api/admin/upload-groundworks-resource` | Created the "A-SAFE Ground Works Guide" `resources` row and linked every product with ground-works data | `f301860` |
| `POST /api/admin/seed-pas13-resource` | Created the PAS 13:2017 `resources` row pointing at `standards/pas-13-2017.pdf` in R2 | `0829c36` |
| `POST /api/admin/ingest-installation-videos` | Upserted install-video `resources` rows + `product_resources` edges from `scripts/data/installation-videos.json`. DDL kept as migration 017 | `1c5ec80` |
| `POST /api/admin/backfill-resource-durations` | Filled `resources.duration_seconds` from Whisper JSON in R2 and `scripts/data/installation-videos.json` | `d5303d4` |
| `POST /api/admin/test-install-team-email/:installationAssignmentId` | Ops diagnostic: re-sent the install-team video digest for an assignment | `5883390` |
