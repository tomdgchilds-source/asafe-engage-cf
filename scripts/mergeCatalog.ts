/**
 * scripts/mergeCatalog.ts
 *
 * Takes the scraped asafe.com catalog (scripts/data/asafe-catalog.json)
 * and enriches rows in the `products` table with the fields that can't
 * come from a price list: imageUrl, technicalSheetUrl, installationGuideUrl,
 * description, impactRating, PAS 13 metadata, applications, industries,
 * features, and height ranges.
 *
 * Match strategy: normalise both names (strip punctuation, whitespace, case)
 * and then attempt:
 *   1) exact normalised match on `products.name`
 *   2) substring match (scraped name contains db name, or vice versa)
 *   3) skip if still no match — log the misses so we can manually map.
 *
 * Fields on products are only overwritten when:
 *   - the new value is non-empty AND
 *   - the existing value is empty OR the --force flag is set.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/mergeCatalog.ts [--dry-run] [--force] [--file path]
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, ilike } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { products } from "../shared/schema";

type ScrapedProduct = {
  familyName: string;
  productUrl?: string;
  category?: string;
  description?: string;
  features?: string[];
  impactRating?: number | null;
  vehicleTest?: string | null;
  pas13?: {
    certified?: boolean;
    sections?: string[];
    method?: "pendulum" | "vehicle" | "sled" | null;
    joules?: number | null;
  } | null;
  variants?: Array<{ name?: string; lengthMm?: number }>;
  heightRange?: { minMm?: number; maxMm?: number } | null;
  heightMm?: number | null;
  applications?: string[];
  industries?: string[];
  imageUrls?: string[];
  technicalSheetUrl?: string | null;
  installationGuideUrl?: string | null;
  relatedProducts?: string[];
  rawText?: string;
};

type Catalog = {
  _meta: {
    scrapedAt: string;
    region: string;
    productCount: number;
    notes?: string[];
  };
  products: ScrapedProduct[];
};

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[™®©]/g, "")
    // Replace non-alphanumerics with spaces so "130-T0-P3" becomes
    // "130 t0 p3" (matching the alias-map keys) instead of "130t0p3".
    .replace(/[^a-z0-9+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Manual alias map: scraped-name (normalised) → price-list DB name (as stored).
// Built by comparing the scraped catalog against pricelist family names and
// fixing the systematic deltas (e.g. asafe.com prefixes "Pedestrian Barrier"
// in front of T-series SKUs; appends "Barrier" to traffic names).
const SCRAPED_TO_DB_ALIAS: Record<string, string> = {
  // Pedestrian barriers
  "iflex pedestrian barrier 3 rail cold storage": "CS iFlex Pedestrian 3 Rail",
  "eflex pedestrian 3 rail": "eFlex Pedestrian Barrier",
  "pedestrian barrier 130 t0 p3": "130-T0-P3",
  "pedestrian barrier 190 t1 p2": "190-T1-P2",
  "pedestrian barrier 190 t2 p1": "190-T2-P1",

  // Traffic barriers
  "iflex single traffic barrier": "iFlex Single Traffic",
  "iflex double traffic barrier": "iFlex Double Traffic",
  "iflex single traffic barrier+": "iFlex Single Traffic+",
  "iflex double traffic barrier+": "iFlex Double Traffic+",
  "iflex single traffic barrier cold storage": "CS iFlex Single Traffic",
  "iflex single traffic barrier+ cold storage": "CS iFlex Single Traffic+",
  "eflex single traffic barrier+": "eFlex Single Traffic+",
  "traffic barrier 190 t1 p0": "190-T1-P0",
  "traffic barrier 190 t2 p0": "190-T2-P0",

  // Topple
  "topple barrier": "Topple Barrier 2.08m with ForkGuard", // base page covers this size
  "heavy duty topple barrier": "Topple Barrier 3.6m with ForkGuard",

  // Bollards / Posts
  "bollard 130": "Monoplex 130 Bollard",
  "bollard 190": "Monoplex 190 Bollard",
  "iflex bollard": "iFlex 190 Bollard - 2m",
  "iflex bollard cold storage": "Cold Storage iFlex 190 Bollard",
  "monoplex bollard": "Monoplex 190 Bollard", // overview page — map to flagship

  // Column protection
  "iflexrail column guard": "FlexiShield Column Guard", // related product fallback

  // Accessories
  "forkguard kerb barrier": "ForkGuard",
  "heavy duty forkguard kerb barrier": "Heavy Duty ForkGuard",
  "step guard": "Step Guard",
  "alarm bar": "Alarm Bar",
  "dock buffer": "Dock Buffer (Pair)",
  "slider plate": "230 x 230mm - 190mm OD iFlex Post Slider Plate",
  "sign post": "Sign Post, 1.2m - Yellow",

  // Rack protection
  "rackguard": "RackGuard - Multiple height and profile sizes",
  "rackguard cold storage":
    "Cold Storage RackGuard - Multiple height and profile sizes",
  "iflex single rackend barrier": "Rack End Barrier - Single Rail",
  "eflex single rackend barrier": "Rack End Barrier - Single Rail",
  "eflex double rackend barrier": "Rack End Barrier - Double Rail",
  "iflex single rackend+kerb": "Rack End Barrier - Single Rail",
  "eflex single rackend+kerb": "Rack End Barrier - Single Rail",
  "eflex double rackend+kerb": "Rack End Barrier - Double Rail",

  // Height restrictors
  "iflex height restrictor": "iFlex Height Restrictor - Post",

  // Gates
  "iflex swing gate short": "Hydraulic Swing Gate (2R) - Self-Close",
  "traffic gate": "Traffic Gate",

  // Stops
  "truck stop": "Truck Stop",
  "coach stop": "Coach Stop",
  "car stop": "Car Stop",

  // Retractable
  "retractable barrier":
    "Flex - Retractable Barrier (Belt Barrier) - Post to Post - YEL/BLK",
  "retractable barrier racking kit":
    "Retractable Barrier - Racking Maintenance Case - YEL/BLK",
};

// scraped `category` → app category enum. Name heuristics run first because
// the scrape mis-categorises a few products (e.g. Alarm Bar → height-restrictors).
function mapScrapedCategoryToAppCategory(
  scrapedCategory: string | undefined,
  name: string,
): string {
  const n = name.toLowerCase();
  // High-confidence name-based mappings run first.
  if (/\balarm bar\b/.test(n)) return "accessories";
  if (/\bsign (cap|post)\b/.test(n)) return "accessories";
  if (/\bslider plate\b/.test(n)) return "accessories";
  if (/\bdock buffer\b/.test(n)) return "accessories";
  if (/\bforkguard\b/.test(n)) return "accessories";
  if (/\bunder guard\b/.test(n)) return "accessories";
  if (/\bstep guard\b/.test(n)) return "accessories";
  if (/\brackeye\b/.test(n)) return "accessories";
  if (/\brackend\b|\brack end\b|\brackguard\b/.test(n)) return "rack-protection";
  if (/\bheight restrictor\b/.test(n)) return "height-restrictors";
  if (/\b(slide|swing|traffic) gate\b/.test(n)) return "gates";
  if (/\b(truck|car|coach) stop\b/.test(n)) return "stops";
  if (/\bretractable\b/.test(n)) return "retractable";
  if (/\bbollard\b/.test(n)) return "bollards";
  if (/\bcolumn guard\b/.test(n)) return "column-protection";
  if (/\btopple\b/.test(n)) return "topple-barriers";
  if (/\bcar park barrier\b/.test(n)) return "traffic-guardrails";
  if (/\b(traffic) barrier\b/.test(n) || /\btraffic\b/.test(n))
    return "traffic-guardrails";
  if (/\bpedestrian\b/.test(n)) return "pedestrian-guardrails";

  // Fall back to scraped category.
  const c = (scrapedCategory ?? "").toLowerCase();
  if (c.includes("pedestrian")) return "pedestrian-guardrails";
  if (c.includes("traffic")) return "traffic-guardrails";
  if (c.includes("topple")) return "topple-barriers";
  if (c.includes("rack")) return "rack-protection";
  if (c.includes("column")) return "column-protection";
  if (c.includes("bollard")) return "bollards";
  if (c.includes("gate")) return "gates";
  if (c.includes("stop")) return "stops";
  if (c.includes("retract")) return "retractable";
  if (c.includes("height")) return "height-restrictors";
  return "accessories";
}

function inferSubcategory(name: string): string | null {
  const n = name.toLowerCase();
  if (/atlas/.test(n)) return "atlas";
  if (/mflex/.test(n)) return "mflex";
  if (/cold storage/.test(n)) return "cold-storage";
  if (/slide gate/.test(n)) return "slide";
  if (/swing gate/.test(n)) return "swing";
  if (/heavy duty|\bhd\b/.test(n)) return "heavy-duty";
  if (/rackeye/.test(n)) return "iot";
  if (/sign/.test(n)) return "signage";
  if (/under guard/.test(n)) return "under-guard";
  if (/padded/.test(n)) return "padded";
  if (/car park/.test(n)) return "car-park";
  return null;
}

function scoreMatch(scrapedNorm: string, dbNorm: string): number {
  if (scrapedNorm === dbNorm) return 100;
  if (scrapedNorm.includes(dbNorm) || dbNorm.includes(scrapedNorm)) {
    // prefer tighter substring matches
    const overlap = Math.min(scrapedNorm.length, dbNorm.length);
    const total = Math.max(scrapedNorm.length, dbNorm.length);
    return Math.round((overlap / total) * 90);
  }
  // token-overlap fallback
  const sTokens = new Set(scrapedNorm.split(" ").filter(Boolean));
  const dTokens = new Set(dbNorm.split(" ").filter(Boolean));
  if (sTokens.size === 0 || dTokens.size === 0) return 0;
  let shared = 0;
  for (const t of sTokens) if (dTokens.has(t)) shared++;
  const jaccard = shared / (sTokens.size + dTokens.size - shared);
  if (jaccard < 0.5) return 0;
  return Math.round(jaccard * 80);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  // --create-missing inserts scraped products that don't match any DB family.
  // They land as quote-only (price=null, pricingLogic=per_quote).
  const createMissing = args.includes("--create-missing");
  const fileIdx = args.indexOf("--file");
  const fileArg = fileIdx >= 0 ? args[fileIdx + 1] : undefined;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const filePath =
    fileArg ?? path.resolve(__dirname, "data", "asafe-catalog.json");

  if (!fs.existsSync(filePath)) {
    console.error(`Catalog not found: ${filePath}`);
    console.error(
      "Run the scrape agent first (it writes scripts/data/asafe-catalog.json).",
    );
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(filePath, "utf8")) as Catalog;
  console.log(
    `[mergeCatalog] loaded ${catalog.products.length} scraped products (region=${catalog._meta.region})`,
  );

  if (!process.env.DATABASE_URL && !dryRun) {
    console.error("DATABASE_URL not set. Use --dry-run or set it.");
    process.exit(1);
  }

  const sqlClient = process.env.DATABASE_URL
    ? neon(process.env.DATABASE_URL)
    : null;
  const db = sqlClient ? drizzle(sqlClient) : null;

  // Load all existing products once.
  let dbRows: Array<{
    id: string;
    name: string;
    description: string | null;
    impactRating: number | null;
    heightMin: number | null;
    heightMax: number | null;
    imageUrl: string | null;
    technicalSheetUrl: string | null;
    installationGuideUrl: string | null;
    applications: unknown;
    industries: unknown;
    features: unknown;
    pas13Compliant: boolean | null;
    pas13TestMethod: string | null;
    pas13TestJoules: number | null;
    pas13Sections: unknown;
  }> = [];
  if (db) {
    dbRows = (await db.select().from(products)) as typeof dbRows;
  }

  const dbNormIndex = new Map<string, typeof dbRows[number]>();
  for (const r of dbRows) dbNormIndex.set(normalise(r.name), r);

  const matches: Array<{
    scraped: ScrapedProduct;
    dbRow: typeof dbRows[number];
    score: number;
  }> = [];
  const misses: ScrapedProduct[] = [];
  const ambiguous: Array<{
    scraped: ScrapedProduct;
    candidates: Array<{ name: string; score: number }>;
  }> = [];

  for (const scraped of catalog.products) {
    const sNorm = normalise(scraped.familyName);
    if (!sNorm) continue;

    // 1) Alias map first (handles "Barrier" suffix differences, Cold Storage
    //    re-orderings, etc.).
    const aliasTarget = SCRAPED_TO_DB_ALIAS[sNorm];
    if (aliasTarget) {
      const via = dbNormIndex.get(normalise(aliasTarget));
      if (via) {
        matches.push({ scraped, dbRow: via, score: 100 });
        continue;
      }
    }

    // 2) Direct normalised match.
    const direct = dbNormIndex.get(sNorm);
    if (direct) {
      matches.push({ scraped, dbRow: direct, score: 100 });
      continue;
    }

    // 3) Fuzzy fallback.
    const scored = dbRows
      .map((r) => ({
        row: r,
        score: scoreMatch(sNorm, normalise(r.name)),
      }))
      .filter((x) => x.score >= 60)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      misses.push(scraped);
      continue;
    }
    if (scored.length > 1 && scored[0].score - scored[1].score < 10) {
      ambiguous.push({
        scraped,
        candidates: scored.slice(0, 4).map((s) => ({
          name: s.row.name,
          score: s.score,
        })),
      });
      continue;
    }
    matches.push({ scraped, dbRow: scored[0].row, score: scored[0].score });
  }

  console.log(
    `[mergeCatalog] matches=${matches.length} ambiguous=${ambiguous.length} misses=${misses.length}`,
  );
  if (misses.length) {
    console.log("[mergeCatalog] MISSES (scraped products with no DB family):");
    for (const m of misses) console.log(`  - ${m.familyName}`);
  }
  if (ambiguous.length) {
    console.log(
      "[mergeCatalog] AMBIGUOUS (pick manually by adding alias in scrape data):",
    );
    for (const a of ambiguous) {
      console.log(
        `  - ${a.scraped.familyName} → ${a.candidates
          .map((c) => `${c.name}(${c.score})`)
          .join(", ")}`,
      );
    }
  }

  let updated = 0;
  let skipped = 0;
  for (const m of matches) {
    const s = m.scraped;
    const r = m.dbRow;
    const patch: Record<string, unknown> = {};

    const hasExistingDesc = !!r.description && r.description.length > 40;
    if (s.description && (!hasExistingDesc || force)) {
      patch.description = s.description;
    }
    if (
      s.imageUrls &&
      s.imageUrls.length > 0 &&
      (!r.imageUrl || force)
    ) {
      patch.imageUrl = s.imageUrls[0];
    }
    if (s.technicalSheetUrl && (!r.technicalSheetUrl || force)) {
      patch.technicalSheetUrl = s.technicalSheetUrl;
    }
    if (s.installationGuideUrl && (!r.installationGuideUrl || force)) {
      patch.installationGuideUrl = s.installationGuideUrl;
    }
    if (s.impactRating && (!r.impactRating || force)) {
      patch.impactRating = s.impactRating;
    }
    if (s.heightRange?.minMm && (!r.heightMin || force)) {
      patch.heightMin = s.heightRange.minMm;
    }
    if (s.heightRange?.maxMm && (!r.heightMax || force)) {
      patch.heightMax = s.heightRange.maxMm;
    }
    if (
      s.applications &&
      s.applications.length > 0 &&
      (!Array.isArray(r.applications) || (r.applications as any[]).length === 0 || force)
    ) {
      patch.applications = s.applications;
    }
    if (
      s.industries &&
      s.industries.length > 0 &&
      (!Array.isArray(r.industries) || (r.industries as any[]).length === 0 || force)
    ) {
      patch.industries = s.industries;
    }
    if (
      s.features &&
      s.features.length > 0 &&
      (!Array.isArray(r.features) || (r.features as any[]).length === 0 || force)
    ) {
      patch.features = s.features;
    }
    if (s.pas13?.certified) {
      patch.pas13Compliant = true;
      if (s.pas13.method) patch.pas13TestMethod = s.pas13.method;
      if (s.pas13.joules) patch.pas13TestJoules = s.pas13.joules;
      if (s.pas13.sections) patch.pas13Sections = s.pas13.sections;
    }

    if (Object.keys(patch).length === 0) {
      skipped++;
      continue;
    }
    patch.updatedAt = new Date();

    console.log(
      `  UPDATE ${r.name} [${m.score}] — fields: ${Object.keys(patch).join(", ")}`,
    );

    if (!dryRun && db) {
      await db.update(products).set(patch as any).where(eq(products.id, r.id));
    }
    updated++;
  }

  console.log(
    `[mergeCatalog] updated=${updated} no-change=${skipped} missed=${misses.length}`,
  );

  // Optionally insert catalog-only products that don't appear on the price
  // list (Atlas/mFlex/RackEye/etc.). They go in as `per_quote` with no price
  // so the UI can surface them but redirect any purchase attempt to the
  // quote flow.
  let created = 0;
  if (createMissing && misses.length > 0) {
    for (const s of misses) {
      const name = s.familyName.trim();
      const category = mapScrapedCategoryToAppCategory(s.category, name);
      const values: Record<string, unknown> = {
        name,
        category,
        subcategory: inferSubcategory(name),
        description:
          s.description ||
          `${name} — full details on asafe.com (${s.productUrl ?? "UAE region"}).`,
        applications: s.applications ?? [],
        industries: s.industries ?? [],
        features: s.features ?? [],
        impactRating: s.impactRating ?? null,
        heightMin: s.heightRange?.minMm ?? null,
        heightMax: s.heightRange?.maxMm ?? null,
        imageUrl: s.imageUrls?.[0] ?? null,
        technicalSheetUrl: s.technicalSheetUrl ?? null,
        installationGuideUrl: s.installationGuideUrl ?? null,
        pas13Compliant: !!s.pas13?.certified,
        pas13TestMethod: s.pas13?.method ?? null,
        pas13TestJoules: s.pas13?.joules ?? null,
        pas13Sections: s.pas13?.sections ?? null,
        currency: "AED",
        price: null,
        basePricePerMeter: null,
        pricingLogic: "per_quote",
        isColdStorage: /cold storage/i.test(name),
        isActive: true,
        priceListSource: null,
        priceListVersion: null,
      };

      console.log(`  CREATE ${name} (category=${category}) [quote-only]`);
      if (!dryRun && db) {
        await db.insert(products).values(values as any);
      }
      created++;
    }
  } else if (misses.length > 0) {
    console.log(
      `[mergeCatalog] ${misses.length} catalog-only products skipped (pass --create-missing to insert as quote-only).`,
    );
  }

  console.log(`[mergeCatalog] created=${created}`);

  // Write a leftovers report so we can add overrides to the loader for
  // anything that the scrape found but the price list doesn't carry.
  const reportPath = path.resolve(__dirname, "data", "catalog-merge-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        scrapedAt: catalog._meta.scrapedAt,
        dryRun,
        force,
        matched: matches.map((m) => ({
          scraped: m.scraped.familyName,
          matchedTo: m.dbRow.name,
          score: m.score,
        })),
        missed: misses.map((m) => m.familyName),
        ambiguous: ambiguous.map((a) => ({
          scraped: a.scraped.familyName,
          candidates: a.candidates,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`[mergeCatalog] report → ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
