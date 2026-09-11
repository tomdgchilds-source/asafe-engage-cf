import { describe, it, expect } from "vitest";
import { splitSqlStatements } from "./migrations";
import { MIGRATIONS } from "../../migrations/index";

describe("splitSqlStatements", () => {
  it("splits on semicolons and drops full-line and inline comments", () => {
    const out = splitSqlStatements(`
      -- header
      CREATE TABLE IF NOT EXISTS t (
        id varchar PRIMARY KEY, -- R2 key
        note text
      );
      CREATE INDEX IF NOT EXISTS t_idx ON t(id);
    `);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("id varchar PRIMARY KEY,");
    expect(out[0]).not.toContain("R2 key");
    expect(out[1]).toBe("CREATE INDEX IF NOT EXISTS t_idx ON t(id)");
  });

  it("keeps semicolons and dashes inside string literals", () => {
    const out = splitSqlStatements(
      `UPDATE r SET x = 'a;b--c' WHERE y ~ '[?&]v=[A-Za-z0-9_-]{6,}'; SELECT 1;`,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("'a;b--c'");
    expect(out[0]).toContain("[A-Za-z0-9_-]{6,}");
  });

  it("passes double-quoted identifiers through", () => {
    const out = splitSqlStatements(`CREATE TABLE e ("to" varchar NOT NULL);`);
    expect(out).toEqual([`CREATE TABLE e ("to" varchar NOT NULL)`]);
  });

  it("every bundled migration yields at least one statement and no empty ones", () => {
    for (const m of MIGRATIONS) {
      const stmts = splitSqlStatements(m.sql);
      expect(stmts.length, m.id).toBeGreaterThan(0);
      for (const s of stmts) expect(s.trim().length, m.id).toBeGreaterThan(0);
    }
  });
});
