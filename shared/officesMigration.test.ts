/**
 * The office migration is generated from shared/offices.ts. These tests fail
 * if the committed .sql (or the bundled migrations/index.ts) no longer says
 * what the office records say.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { A_SAFE_OFFICES, officeRowValues } from "./offices";
import { INSERTED_OFFICE_IDS, OFFICES_MIGRATION_ID, buildOfficesMigrationSql } from "./officesMigrationSql";
import { MIGRATIONS } from "../migrations/index";

const FILE = resolve(import.meta.dirname, "..", "migrations", `${OFFICES_MIGRATION_ID}.sql`);
const sql = readFileSync(FILE, "utf8");

/** Statements with `--` comment lines removed, split on the terminating semicolon. */
const statements = sql
  .split("\n")
  .filter((l) => !l.startsWith("--"))
  .join("\n")
  .split(/;\s*(?:\n|$)/)
  .map((s) => s.trim())
  .filter(Boolean);

/** 'literal' -> literal, with doubled quotes folded back. */
const literalsOf = (statement: string) =>
  [...statement.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, "'"));

const statementFor = (id: string) => {
  const hits = statements.filter((s) => s.includes(`'${id}'`));
  expect(hits, `one statement for ${id}`).toHaveLength(1);
  return hits[0];
};

describe(`migrations/${OFFICES_MIGRATION_ID}.sql`, () => {
  it("is exactly what scripts/buildOfficesMigration.ts generates from shared/offices.ts", () => {
    expect(sql).toBe(buildOfficesMigrationSql());
  });

  it("is bundled in migrations/index.ts unchanged and pending by default", () => {
    const bundled = MIGRATIONS.find((m) => m.id === OFFICES_MIGRATION_ID);
    expect(bundled?.sql).toBe(sql);
    expect(bundled?.appliedHistorically).toBe(false);
  });

  it("updates the 17 existing rows by id and inserts the 3 new offices", () => {
    expect(statements).toHaveLength(A_SAFE_OFFICES.length);
    expect(statements.filter((s) => s.startsWith("UPDATE global_offices"))).toHaveLength(17);
    expect(statements.filter((s) => s.startsWith("INSERT INTO global_offices"))).toHaveLength(3);
    for (const o of A_SAFE_OFFICES) {
      const st = statementFor(o.id);
      expect(st.startsWith(INSERTED_OFFICE_IDS.has(o.id) ? "INSERT INTO" : "UPDATE")).toBe(true);
    }
  });

  it("carries every office's id, legal name, address, phone, email and map position", () => {
    for (const o of A_SAFE_OFFICES) {
      const st = statementFor(o.id);
      const literals = literalsOf(st);
      const v = officeRowValues(o);
      const strings = [v.id, v.companyName, v.region, v.country, v.city, v.addressLine1, v.addressLine2, v.addressLine3, v.postalCode, v.phone, v.email, v.googleMapsUrl];
      for (const value of strings) {
        if (value !== null) expect(literals, `${o.legalName}: ${value}`).toContain(value);
      }
      expect(o.phoneDisplay).toBe(v.phone);
      expect(st).toContain(v.latitude);
      expect(st).toContain(v.longitude);
      expect(Number(v.latitude)).toBeCloseTo(o.lat, 7);
      expect(Number(v.longitude)).toBeCloseTo(o.lng, 7);
    }
  });

  it("names every additional published phone next to its row", () => {
    for (const o of A_SAFE_OFFICES) {
      for (const extra of o.phones.slice(1)) expect(sql).toContain(extra.display);
    }
  });

  it("is idempotent: guarded UPDATEs, INSERT ... ON CONFLICT DO NOTHING, no deletes", () => {
    for (const st of statements) {
      if (st.startsWith("UPDATE")) {
        expect(st).toMatch(/WHERE id = '[0-9a-f-]{36}'\s+AND \(/);
        const sets = [...st.matchAll(/^(?:SET | {4})(\w+) = /gm)].map((m) => m[1]).filter((c) => c !== "updated_at");
        const guards = [...st.matchAll(/(\w+) IS DISTINCT FROM/g)].map((m) => m[1]);
        expect(guards).toEqual(sets);
      } else {
        expect(st).toMatch(/ON CONFLICT \(id\) DO NOTHING$/);
      }
    }
    expect(sql).not.toMatch(/\b(DELETE|DROP|TRUNCATE)\b/i);
  });

  it("follows the migration rules: no semicolons or comment markers inside literals", () => {
    for (const st of statements) {
      for (const literal of literalsOf(st)) {
        expect(literal).not.toContain(";");
        expect(literal).not.toContain("--");
      }
    }
  });

  it("keeps the invented <country>@asafe.com addresses out", () => {
    expect(sql).not.toMatch(/'(australia|belgium|canada|japan|denmark|mexico|france|germany|italy|netherlands|poland|spain|sweden|usa)@asafe\.com'/);
  });
});
