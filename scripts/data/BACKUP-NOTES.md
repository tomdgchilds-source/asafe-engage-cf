# R2 CSV Backup Notes

The worker dumps four core tables to the `R2_BUCKET` bucket every Sunday at
03:00 UTC, retaining 12 weeks of history per table.

## What runs, when, where

- **Tables:** `orders`, `projects`, `customer_companies`, `cart_items`
- **Schedule:** `0 3 * * SUN` (03:00 UTC every Sunday)
- **R2 bucket:** `asafe-engage-files` (bound as `R2_BUCKET` in `wrangler.toml`)
- **Keys:** `backups/<table>/<YYYY>/<YYYY-MM-DD>.csv`
- **Retention:** 12 weeks (~3 months). Older files are deleted at the tail
  of each run in a best-effort list-and-delete pass.
- **CSV format:** RFC 4180. JSONB columns are stringified inline; quotes,
  commas, and newlines in column values are escaped by wrapping the field
  in double-quotes and doubling any embedded quotes.

## How to restore

Restore is a manual workflow — there's no one-click "restore from last
backup" button, and that's deliberate: you almost always want to diff the
dump against the live DB before clobbering rows.

1. **Pull the CSV from R2.** Using `wrangler r2`:

   ```bash
   wrangler r2 object get asafe-engage-files \
     "backups/orders/2026/2026-04-19.csv" \
     --file restore/orders-2026-04-19.csv
   ```

   Pull all four tables for the target date.

2. **Seed into a staging Neon branch.** Create a branch off prod so you can
   diff without risk:

   ```bash
   # Using Neon CLI — create a branch
   neon branches create --project-id <id> --name restore-test-2026-04-19

   # Import the CSVs into the branch. Example for orders:
   psql $STAGING_DATABASE_URL -c "\copy orders FROM 'restore/orders-2026-04-19.csv' CSV HEADER"
   ```

   Adjust the `\copy` invocation per table. JSONB columns will need the
   `FORMAT csv` plus explicit column list if the table has since grown
   new columns.

3. **Test.** Point a local worker at the staging `DATABASE_URL`
   (`wrangler dev` + `.dev.vars`), smoke-test the affected flows, verify
   row counts and key records.

4. **Promote.** When you're satisfied, either:
   - Promote the Neon branch (fastest; atomic swap), or
   - Dump affected rows from staging and `COPY` them into prod in a
     transaction. Preferred when you only want to restore a subset.

Do not restore directly into prod. Always stage first — the dump is a flat
snapshot with no referential-integrity checking beyond what the `COPY` into
the fresh DB gives you, and it's easy to orphan rows if the schema has
drifted.

## Where the cron is defined

- `wrangler.toml` → `[triggers]` block → `crons = ["0 3 * * SUN"]`
- `worker/index.ts` → the `scheduled` export on the default export
- `worker/scheduled/backupExporter.ts` → the actual dump + retention logic

Redeploy (`npm run deploy`) after changing any of the above. Cloudflare
re-reads the cron schedule on every deploy.

## Verifying the next run

After a successful deploy you can inspect the configured cron via the
Workers dashboard (`Workers & Pages → asafe-engage → Triggers`). The
next-fire time is shown on that screen. Past runs appear in the
`scheduled` logs (`wrangler tail --format=pretty`) with a `[backup]`
prefix — each run logs one line per table plus retention pruning totals.

## Adding / removing tables from the dump

Edit the `BACKUP_TABLES` constant in
`worker/scheduled/backupExporter.ts`. Table names are from a fixed
allowlist — do **not** pass through user input; the table name is
interpolated into the `SELECT *` statement. Deploy after editing.

## Recovery-time expectations

- RPO (max data loss): up to 7 days (since the dump runs weekly).
- RTO (time to restore one table from CSV into a fresh Neon branch):
  typically under 30 minutes for tables in the low-hundreds-of-thousands
  range, longer for wide JSONB rows.

If the application grows past these tolerances, look at Neon PITR
(point-in-time recovery) rather than tightening the cron — restore-from-PITR
beats CSV round-trips for RPO and RTO.
