/**
 * Generates migrations/index.ts from the .sql files in migrations/.
 *
 *   npm run migrations:index
 *
 * Every `YYYY-MM-DD-NNN-<slug>.sql` becomes one entry, sorted by filename.
 * A file whose header contains `-- applied-historically: yes` is treated as
 * already applied in production (it ran through a now-removed HTTP endpoint)
 * and is auto-recorded in schema_migrations on first listing; anything else
 * is pending until an admin applies it from /admin/migrations.
 *
 * The output is committed so the Worker bundle embeds the SQL at build time
 * (there is no filesystem at runtime on Cloudflare).
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "migrations");
const out = path.join(dir, "index.ts");

const FILE_RE = /^\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9-]+\.sql$/;

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const bad = files.filter((f) => !FILE_RE.test(f));
if (bad.length) {
  console.error(
    `Migration filenames must match YYYY-MM-DD-NNN-<slug>.sql:\n  ${bad.join("\n  ")}`,
  );
  process.exit(1);
}

const entries = files.map((file) => {
  const sql = fs.readFileSync(path.join(dir, file), "utf8");
  const appliedHistorically = /^--\s*applied-historically:\s*yes\s*$/im.test(sql);
  return { id: file.replace(/\.sql$/, ""), sql, appliedHistorically };
});

const lines: string[] = [
  "// GENERATED FILE — do not edit by hand.",
  "// Rebuild with `npm run migrations:index` after adding a .sql file to migrations/.",
  "",
  "export interface MigrationFile {",
  "  id: string;",
  "  sql: string;",
  "  appliedHistorically: boolean;",
  "}",
  "",
  "export const MIGRATIONS: MigrationFile[] = [",
];
for (const e of entries) {
  lines.push("  {");
  lines.push(`    id: ${JSON.stringify(e.id)},`);
  lines.push(`    appliedHistorically: ${e.appliedHistorically},`);
  lines.push(`    sql: ${JSON.stringify(e.sql)},`);
  lines.push("  },");
}
lines.push("];", "");

fs.writeFileSync(out, lines.join("\n"));
console.log(
  `Wrote ${path.relative(root, out)} with ${entries.length} migration(s) ` +
    `(${entries.filter((e) => e.appliedHistorically).length} historical, ` +
    `${entries.filter((e) => !e.appliedHistorically).length} pending by default).`,
);
