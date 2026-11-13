/**
 * shared/officesMigrationSql.ts
 *
 * Builds the SQL that brings `global_offices` in line with shared/offices.ts.
 * scripts/buildOfficesMigration.ts writes the result to
 * migrations/<OFFICES_MIGRATION_ID>.sql and shared/officesMigration.test.ts
 * fails if that file is not exactly this output, so the table data and the
 * office records cannot drift.
 *
 * To change an office after this migration has run in production: edit
 * shared/offices.ts, give OFFICES_MIGRATION_ID a new dated id (and move any
 * row that now exists everywhere out of INSERTED_OFFICE_IDS), then run
 *   npx tsx scripts/buildOfficesMigration.ts && npm run migrations:index
 */
import {
  A_SAFE_HQ_RECORD,
  A_SAFE_INTERNATIONAL_RECORD,
  A_SAFE_OFFICES,
  A_SAFE_US_SALES_HQ_RECORD,
  officeAddressLines,
  officeRowValues,
  type OfficeRecord,
} from "./offices";

export const OFFICES_MIGRATION_ID = "2026-11-13-011-offices-from-website";

/** Offices published on asafe.com that had no `global_offices` row before this migration. */
export const INSERTED_OFFICE_IDS: ReadonlySet<string> = new Set([
  A_SAFE_HQ_RECORD.id,
  A_SAFE_INTERNATIONAL_RECORD.id,
  A_SAFE_US_SALES_HQ_RECORD.id,
]);

type SqlValue = string | number | boolean | null;

/** SQL literal. Latitude / longitude are already numeric text and are written as they stand. */
function lit(v: SqlValue): string {
  if (v === null) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  // migrations/README.md: no semicolons inside string literals; "--" would read as a comment to a human.
  if (v.includes(";") || v.includes("--")) throw new Error(`Office value cannot go in a migration literal: ${v}`);
  return `'${v.replace(/'/g, "''")}'`;
}

/** [column, SQL literal] pairs for every column the migration owns, in table order. */
function columns(o: OfficeRecord): Array<[string, string]> {
  const v = officeRowValues(o);
  return [
    ["company_name", lit(v.companyName)],
    ["region", lit(v.region)],
    ["country", lit(v.country)],
    ["city", lit(v.city)],
    ["address_line1", lit(v.addressLine1)],
    ["address_line2", lit(v.addressLine2)],
    ["address_line3", lit(v.addressLine3)],
    ["postal_code", lit(v.postalCode)],
    ["phone", lit(v.phone)],
    ["email", lit(v.email)],
    ["google_maps_url", lit(v.googleMapsUrl)],
    ["latitude", v.latitude],
    ["longitude", v.longitude],
    ["is_default", lit(v.isDefault)],
    ["sort_order", lit(v.sortOrder)],
  ];
}

function comment(o: OfficeRecord): string[] {
  const lines = [`-- ${o.country}: ${o.legalName}, ${officeAddressLines(o).slice(0, -1).join(", ")}.`];
  if (o.phones.length > 1) {
    lines.push(
      `-- Also published: ${o.phones.slice(1).map((p) => p.display).join(", ")} (no column, served from shared/offices.ts).`,
    );
  }
  if (!o.phoneVerified) lines.push("-- asafe.com lists no phone for this office: the existing number is kept, unverified.");
  if (!o.pinMatchesAddress) lines.push("-- The website pin is not at this address. It is stored as published and map links use the address.");
  return lines;
}

function updateStatement(o: OfficeRecord): string {
  const cols = columns(o);
  return [
    ...comment(o),
    "UPDATE global_offices",
    ...cols.map(([c, v], i) => `${i === 0 ? "SET " : "    "}${c} = ${v},`),
    "    updated_at = now()",
    `WHERE id = ${lit(o.id)}`,
    ...cols.map(([c, v], i) => `  ${i === 0 ? "AND (" : "  OR "}${c} IS DISTINCT FROM ${v}${i === cols.length - 1 ? ");" : ""}`),
  ].join("\n");
}

function insertStatement(o: OfficeRecord): string {
  const v = officeRowValues(o);
  const cols: Array<[string, string]> = [
    ["id", lit(v.id)],
    ["office_type", lit(v.officeType)],
    ["image_url", lit(v.imageUrl)],
    ["is_active", lit(v.isActive)],
    ...columns(o),
  ];
  return [
    ...comment(o),
    `INSERT INTO global_offices (${cols.map(([c]) => c).join(", ")})`,
    `VALUES (${cols.map(([, val]) => val).join(", ")})`,
    "ON CONFLICT (id) DO NOTHING;",
  ].join("\n");
}

export function buildOfficesMigrationSql(): string {
  const existing = A_SAFE_OFFICES.filter((o) => !INSERTED_OFFICE_IDS.has(o.id));
  const added = A_SAFE_OFFICES.filter((o) => INSERTED_OFFICE_IDS.has(o.id));
  const header = [
    "-- global_offices from asafe.com (2026-11-13).",
    "-- GENERATED from shared/offices.ts by scripts/buildOfficesMigration.ts. Do not edit by hand:",
    "-- shared/officesMigration.test.ts fails if this file and the office records differ.",
    "--",
    "-- The app had invented contact emails for most countries, friendly names in place of",
    "-- the legal entities, addresses without their diacritics and no map positions. Every",
    "-- value below is what the contact pages of https://www.asafe.com publish.",
    "--",
    `-- ${existing.length} UPDATEs target the existing rows by id. Each is guarded, so a re-run that finds`,
    `-- the row already correct changes nothing. ${added.length} INSERTs add the offices the website lists`,
    "-- that the app did not have, and do nothing when the id is already present.",
  ];
  return [header.join("\n"), ...existing.map(updateStatement), ...added.map(insertStatement)].join("\n\n") + "\n";
}
