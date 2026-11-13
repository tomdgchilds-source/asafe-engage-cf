/**
 * Guard: office addresses, phone numbers and contact emails live in
 * shared/offices.ts (and the SQL migrations generated from it) and nowhere
 * else. A literal street address anywhere in client/src, worker, shared or
 * scripts is how the Riyadh/Dubai mix-up slipped through, and literal
 * mailboxes are how every country ended up with an invented
 * <country>@asafe.com address, so this fails the build on one.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  A_SAFE_OFFICES,
  A_SAFE_WHATSAPP_ME,
  QUOTES_EMAIL,
  SALES_EMAIL,
  SALES_EMAIL_KSA,
  phoneDigits,
} from "./offices";

const ROOT = resolve(import.meta.dirname, "..");
const SCAN_DIRS = ["client/src", "worker", "shared", "scripts", "e2e", "migrations"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".html", ".md", ".json", ".sql"]);
// e2e/qa holds gitignored throwaway QA specs that legitimately assert the
// address text appears on the Contact page.
const SKIP_DIRS = new Set(["node_modules", "dist", ".wrangler", "assets", "brand", "qa"]);
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

// ─────────────────────────────────────────────────────────────────────────
// Contact details: emails, phone numbers, WhatsApp
// ─────────────────────────────────────────────────────────────────────────

const isTest = (file: string) => /\.(test|spec)\.tsx?$/.test(file);

/** shared/offices.ts, migrations/, the seed script and tests: the only homes for a contact literal. */
const contactAllowed = (file: string) =>
  file === "shared/offices.ts" || file.startsWith("migrations/") || file === "scripts/seedOffices.ts" || isTest(file);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const anyOf = (values: Iterable<string>) => new RegExp([...new Set(values)].map(escapeRe).join("|"));

describe("office contact literals", () => {
  const officeEmails = new Set(A_SAFE_OFFICES.map((o) => o.email));

  it("covers the 18 contact mailboxes asafe.com publishes", () => {
    // UK Ltd and HQ Ltd share one, as do the two US offices: 20 offices, 18 mailboxes.
    expect(officeEmails.size).toBe(18);
    for (const email of officeEmails) expect(email).toMatch(/^[a-z.]+@(asafe|a-safe|asafeau)\.[a-z.]+$/);
  });

  it("country contact emails appear only in shared/offices.ts, migrations/, the seed script and tests", () => {
    const hits = filesContaining(anyOf(officeEmails));
    expect(hits).toContain("shared/offices.ts");
    expect(hits.filter((f) => !contactAllowed(f))).toEqual([]);
  });

  it("the internal sales / quotes mailboxes are only spelled out in shared/offices.ts and tests", () => {
    const hits = filesContaining(anyOf([SALES_EMAIL, QUOTES_EMAIL, SALES_EMAIL_KSA]));
    expect(hits.filter((f) => f !== "shared/offices.ts" && !isTest(f))).toEqual([]);
  });

  it("no invented <country>@asafe.com (or legal@ / info@asafe.ae) mailbox anywhere", () => {
    const invented =
      /\b(?:australia|belgium|canada|japan|denmark|mexico|france|germany|italy|netherlands|poland|spain|sweden|usa|uae|ksa|saudi|uk)@asafe\.com\b|\b(?:legal|info|contact|hello)@asafe\.(?:ae|sa)\b/;
    expect(filesContaining(invented).filter((f) => !isTest(f))).toEqual([]);
  });

  it("office phone numbers appear only in shared/offices.ts, migrations/, the seed script and tests", () => {
    const numbers: string[] = [];
    for (const o of A_SAFE_OFFICES) {
      for (const p of o.phones) numbers.push(p.display, phoneDigits(p.tel));
    }
    const hits = filesContaining(anyOf(numbers));
    expect(hits).toContain("shared/offices.ts");
    expect(hits.filter((f) => !contactAllowed(f))).toEqual([]);
  });

  it("WhatsApp links are built from the shared number, never a literal wa.me/<digits>", () => {
    const whatsAppDigits = phoneDigits(A_SAFE_WHATSAPP_ME);
    const literal = new RegExp(`wa\\.me/\\+?\\d|${escapeRe(A_SAFE_WHATSAPP_ME)}|${whatsAppDigits}|${whatsAppDigits.slice(3)}`);
    expect(filesContaining(literal).filter((f) => f !== "shared/offices.ts" && !isTest(f))).toEqual([]);
  });

  it("the personal mobiles the app used to publish as WhatsApp / phone contacts are gone", () => {
    const retired = /50 ?388 ?1285|50 ?477 ?7499|58 ?599 ?2500/;
    expect(filesContaining(retired)).toEqual([]);
  });
});
