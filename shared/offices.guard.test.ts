/**
 * Guard: office addresses live in shared/offices.ts (and the SQL migration
 * that fixes the global_offices rows) and nowhere else. A literal street
 * address anywhere in client/src, worker, shared or scripts is how the
 * Riyadh/Dubai mix-up slipped through, so this fails the build on one.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SCAN_DIRS = ["client/src", "worker", "shared", "scripts", "e2e", "migrations"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".html", ".md", ".json", ".sql"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".wrangler", "assets", "brand"]);
const THIS_FILE = "shared/offices.guard.test.ts";

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (EXTENSIONS.has(name.slice(name.lastIndexOf(".")))) {
      out.push(full);
    }
  }
  return out;
}

function filesContaining(needle: RegExp): string[] {
  const hits: string[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const text = readFileSync(file, "utf8");
      if (needle.test(text)) hits.push(relative(ROOT, file));
    }
  }
  return hits.sort();
}

const allowed = (...extra: string[]) => (file: string) =>
  file === "shared/offices.ts" ||
  file.startsWith("migrations/") ||
  file === THIS_FILE ||
  extra.includes(file);

describe("office address literals", () => {
  it('"Al Malaz" appears only in shared/offices.ts and migrations/', () => {
    const hits = filesContaining(/Al Malaz/);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.filter((f) => !allowed()(f))).toEqual([]);
    expect(hits).toContain("shared/offices.ts");
  });

  it('"Office 220" appears only in shared/offices.ts, migrations/ and this test', () => {
    const hits = filesContaining(/Office #?220/);
    expect(hits.filter((f) => !allowed("shared/offices.test.ts")(f))).toEqual([]);
    expect(hits).toContain("shared/offices.ts");
  });

  it("no other Dubai South / Building A5 / 8842 literals outside the shared module", () => {
    const hits = filesContaining(/Dubai South|Building A5|8842 ?422|884 ?2422/);
    expect(hits.filter((f) => !allowed("shared/offices.test.ts", "worker/lib/pdf/reports/faqSheet.test.ts")(f))).toEqual([]);
  });

  it("the Riyadh street address appears only in the shared module", () => {
    const hits = filesContaining(/Mukhalad|Hamdhani/);
    expect(hits.filter((f) => !allowed("shared/offices.test.ts")(f))).toEqual([]);
  });
});
