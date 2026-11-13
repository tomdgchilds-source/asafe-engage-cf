/**
 * Writes migrations/<OFFICES_MIGRATION_ID>.sql from shared/offices.ts.
 *
 *   npx tsx scripts/buildOfficesMigration.ts && npm run migrations:index
 *
 * The SQL itself is built by shared/officesMigrationSql.ts so the unit test
 * can compare the committed file with the office records.
 */
import fs from "node:fs";
import path from "node:path";
import { OFFICES_MIGRATION_ID, buildOfficesMigrationSql } from "../shared/officesMigrationSql";

const out = path.resolve(import.meta.dirname, "..", "migrations", `${OFFICES_MIGRATION_ID}.sql`);
fs.writeFileSync(out, buildOfficesMigrationSql());
console.log(`Wrote ${path.relative(process.cwd(), out)}`);
