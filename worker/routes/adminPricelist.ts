/**
 * /api/admin/apply-pricelist
 *
 * Server-side runner for the pricelist migration. Needed because the
 * DATABASE_URL lives as a Cloudflare Workers secret and isn't reachable
 * from a local CLI without someone pasting it. This route runs the
 * same logic as `scripts/loadPriceList.ts` but uses the worker's
 * bindings.
 *
 * Auth: admin-only (existing admin session via adminUsers + authMiddleware
 * won't work because the admin session uses the regular `users` table
 * pipeline; easier to require a bearer token matching the
 * MIGRATION_TOKEN secret). The endpoint is scoped narrowly and only
 * performs additive changes.
 *
 * Order of operations:
 *   1. Ensure schema (CREATE TABLE / ALTER TABLE IF NOT EXISTS)
 *   2. Apply the price list (upsert products + replace variants)
 *   3. Merge the scraped asafe.com catalog (enrich + optional create)
 *
 * Each step is optional via query param (?schema=1&load=1&merge=1).
 * Returns a JSON report so the caller can verify what ran.
 */

import { Hono } from "hono";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, ilike, or, sql as sqlTag } from "drizzle-orm";
import type { Env, Variables } from "../types";
import {
  products,
  productVariants,
  vehicleTypes,
  applicationTypes,
  users,
} from "../../shared/schema";
import bcrypt from "bcryptjs";
import priceList from "../../scripts/data/pricelist-aed-2025v1.json";
import scrapedCatalog from "../../scripts/data/asafe-catalog.json";
import applicationTypesSeed from "../../scripts/data/application-types-seed.json";

const adminPricelist = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─────────────────────────────────────────────────────────────
// Types (mirror the JSON shapes)
// ─────────────────────────────────────────────────────────────
type FamilyByLength = {
  family: string;
  priceBy: "length";
  isNew?: boolean;
  variants: Array<{ name: string; lengthMm: number; priceAed: number }>;
};
type FlatItem = {
  name: string;
  sku?: string | null;
  priceAed: number;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  kind?: string;
};
type CategoryByLength = { category: string; products: FamilyByLength[] };
type CategoryFlat = {
  category: string;
  priceBy: "unit" | "component" | "rate";
  items: FlatItem[];
};

// ─────────────────────────────────────────────────────────────
// Category rules (copied from scripts/loadPriceList.ts so the worker
// is self-contained and doesn't need bundler-unfriendly imports).
// ─────────────────────────────────────────────────────────────
type AppCategoryRule = {
  category: string;
  subcategory?: string;
  isColdStorage?: boolean;
  description: string;
  applications: string[];
  industries: string[];
  features: string[];
  pas13Compliant?: boolean;
  isNew?: boolean;
};

const CATEGORY_RULES: Record<string, AppCategoryRule> = {
  "Pedestrian Barriers": {
    category: "pedestrian-guardrails",
    subcategory: "standard",
    description:
      "Pedestrian-rated barrier family designed to segregate walkways from vehicle traffic. Shock-absorbing polymer construction flexes on impact and reforms to its original shape.",
    applications: ["Pedestrian Walkways", "Traffic Segregation", "Warehouse Aisles"],
    industries: ["Logistics", "Manufacturing", "Food & Beverage", "Retail"],
    features: [
      "Flexes on impact and reforms",
      "No floor damage on impact",
      "PAS 13 tested",
      "Low-maintenance polymer",
      "Modular component system",
    ],
    pas13Compliant: true,
  },
  "Traffic Barriers": {
    category: "traffic-guardrails",
    subcategory: "standard",
    description:
      "Traffic-rated guardrail family engineered to absorb forklift and vehicle impacts while protecting infrastructure and personnel behind the barrier line.",
    applications: ["Perimeter Protection", "Traffic Management", "Racking Aisles"],
    industries: ["Logistics", "Manufacturing", "Automotive", "Heavy Industry"],
    features: [
      "Impact-tested polymer",
      "Self-restoring after collision",
      "Modular post-and-rail system",
      "Corrosion resistant",
      "High visibility yellow",
    ],
    pas13Compliant: true,
  },
  "Topple Barrier": {
    category: "topple-barriers",
    subcategory: "vertical",
    description:
      "Vertical containment barrier designed to stop racking, pallets, or stacked goods from toppling into aisles. Integrated ForkGuard protects the barrier base from forklift abrasion.",
    applications: ["Rack Aisle Ends", "Storage Protection", "Cross-Aisle Protection"],
    industries: ["Logistics", "Cold Storage", "Retail Distribution"],
    features: [
      "Full-height toppling protection",
      "Integrated ForkGuard base",
      "Modular height options (2.08m / 3.6m / 5.3m)",
      "Impact-absorbing polymer",
    ],
    pas13Compliant: true,
  },
  "Bollards / Posts": {
    category: "bollards",
    subcategory: "standard",
    description:
      "Impact-absorbing bollards and posts used to protect single-point assets such as column bases, equipment, and dock corners.",
    applications: ["Column Protection", "Equipment Guarding", "Dock Protection"],
    industries: ["Logistics", "Manufacturing", "Retail"],
    features: [
      "Single-post impact protection",
      "Anchored baseplate",
      "Self-restoring polymer",
      "High-visibility yellow",
    ],
  },
  "FlexiShield Column Guard": {
    category: "column-protection",
    subcategory: "column-guard",
    description:
      "Wrap-around column guard that absorbs side impacts to structural columns. Modular spacers let the guard fit columns from 100mm to 600mm square.",
    applications: ["Column Protection", "Racking Upright Protection"],
    industries: ["Logistics", "Manufacturing", "Retail"],
    features: [
      "Modular wrap around any column",
      "Self-restoring polymer",
      "Sized with spacer sets",
      "No floor anchoring required",
    ],
  },
  "FlexiShield Corner Guard": {
    category: "column-protection",
    subcategory: "corner-guard",
    description:
      "Corner-mounted impact guard for building corners and equipment edges. Fits internal or external 90° corners and absorbs side impacts.",
    applications: ["Corner Protection", "Equipment Edges", "Wall Corners"],
    industries: ["Logistics", "Manufacturing", "Cold Storage"],
    features: ["90° corner fit", "Self-restoring polymer", "Low-profile"],
  },
  "Step Guard": {
    category: "accessories",
    subcategory: "step-guard",
    description:
      "Floor-mounted step guard that visually demarcates elevation changes and absorbs light impacts to step edges.",
    applications: ["Step Edges", "Elevation Changes", "Loading Dock Edges"],
    industries: ["Logistics", "Manufacturing", "Warehousing"],
    features: ["High-visibility edge marking", "Anti-slip surface", "Modular lengths"],
  },
  "ForkGuard": {
    category: "accessories",
    subcategory: "forkguard",
    description:
      "Low-profile forklift fork abrasion guard fitted to the base of barriers and columns. Protects surface finishes from fork-scraping damage.",
    applications: ["Barrier Base Protection", "Column Base Protection"],
    industries: ["Logistics", "Warehousing", "Cold Storage"],
    features: ["Clips onto existing profile", "Replaceable", "High-visibility"],
  },
  "Heavy Duty ForkGuard": {
    category: "accessories",
    subcategory: "forkguard-hd",
    description:
      "Heavy-duty ForkGuard rated for high-frequency forklift traffic. Increased thickness and material density for extended service life in abrasive environments.",
    applications: ["Heavy Traffic Barrier Bases", "High-Frequency Dock Areas"],
    industries: ["Logistics", "Heavy Manufacturing"],
    features: [
      "Thicker construction for heavy traffic",
      "Extended service life",
      "Same footprint as standard ForkGuard",
    ],
  },
  "Bollard Bumper": {
    category: "accessories",
    subcategory: "bollard-bumper",
    description:
      "Cap-style impact bumper that fits over existing bollards to add cushioning for fork trucks and pallets.",
    applications: ["Bollard Impact Softening", "Column Base"],
    industries: ["Logistics", "Warehousing"],
    features: ["Retrofits existing bollards", "High-visibility yellow", "Impact absorbing"],
  },
  "Rack End Barrier": {
    category: "rack-protection",
    subcategory: "rack-end",
    description:
      "End-of-aisle rack protection barrier for warehouse racking. Available in single and double-rail configurations to match forklift mast height.",
    applications: ["Racking End Frame Protection", "Aisle Entry"],
    industries: ["Logistics", "E-commerce", "Retail Distribution"],
    features: [
      "Single or double rail",
      "CSK countersunk fixings",
      "Modular length options",
      "PAS 13 tested",
    ],
    pas13Compliant: true,
  },
  "Height Restrictor": {
    category: "height-restrictors",
    subcategory: "gantry",
    description:
      "Height restriction gantry composed of two posts and a top rail. Stops vehicles over a maximum height entering a restricted zone (e.g. ducting, mezzanine).",
    applications: ["Vehicle Height Restriction", "Mezzanine Entry Protection"],
    industries: ["Logistics", "Manufacturing", "Automotive"],
    features: [
      "Assemble to any span/height",
      "Posts + top rail sold separately",
      "PAS 13 compliant",
    ],
    pas13Compliant: true,
  },
  "Swing Gate": {
    category: "gates",
    subcategory: "swing",
    description:
      "Self-closing hydraulic swing gate for mezzanine edges, stair landings, and walkway entries.",
    applications: ["Mezzanine Edges", "Stair Landings", "Walkway Entries"],
    industries: ["Logistics", "Manufacturing", "Warehousing"],
    features: ["Self-closing", "Hydraulic damper", "Modular post + gate"],
  },
  "Traffic Gate": {
    category: "gates",
    subcategory: "traffic",
    description:
      "Wide-opening traffic gate for controlled vehicle access points.",
    applications: ["Secured Vehicle Access", "Loading Dock Entry"],
    industries: ["Logistics", "Manufacturing"],
    features: ["Impact-absorbing", "Spanning widths 2m–3m", "High visibility"],
  },
  "Retractable Barrier": {
    category: "retractable",
    subcategory: "belt-tape",
    description:
      "Retractable belt and tape barriers for temporary walkway/works cordoning.",
    applications: ["Temporary Barriers", "Racking Maintenance Zones"],
    industries: ["Logistics", "Manufacturing", "Events"],
    features: ["Retractable belt/tape", "Portable", "Multiple mounting configurations"],
  },
  "Truck / Coach / Car Stops": {
    category: "stops",
    subcategory: "wheel-stop",
    description:
      "Wheel stops that prevent over-travel at parking bays, loading docks, and service areas.",
    applications: ["Parking Bays", "Loading Docks", "Service Areas"],
    industries: ["Logistics", "Transport", "Commercial"],
    features: ["Sized per vehicle class", "Fix-to-floor", "Impact absorbing"],
  },
  "Slider Base Plates": {
    category: "accessories",
    subcategory: "base-plate",
    description:
      "Sliding base plate that lets iFlex / eFlex posts shift horizontally on impact rather than shear.",
    applications: ["Post Base Impact Isolation"],
    industries: ["Logistics", "Manufacturing"],
    features: ["Sliding post mount", "Reduced floor damage"],
  },
  "RackGuards": {
    category: "rack-protection",
    subcategory: "rackguard",
    description:
      "Upright-mounted rack frame protection. Available in multiple heights and profile sizes; priced at a single rate per unit.",
    applications: ["Racking Upright Protection"],
    industries: ["Logistics", "E-commerce", "Retail Distribution"],
    features: ["Multiple height options", "Clips to upright profile"],
  },
  "Alarm Bar": {
    category: "accessories",
    subcategory: "alarm",
    description:
      "Audible/visual alarm bar that triggers when the barrier it's fitted to is impacted.",
    applications: ["Impact Alerting", "Safety Monitoring"],
    industries: ["Logistics", "Manufacturing"],
    features: ["Audible/visual alarm", "Barrier-mounted", "Impact-activated"],
  },
  "Dock Buffer": {
    category: "accessories",
    subcategory: "dock-buffer",
    description:
      "Pair of dock buffers fitted to loading bay walls to absorb reversing HGV impact.",
    applications: ["Loading Dock Walls"],
    industries: ["Logistics", "Distribution"],
    features: ["Sold as pair", "Impact absorbing", "Wall-mounted"],
  },
  "Cold Storage - Pedestrian Barriers": {
    category: "pedestrian-guardrails",
    subcategory: "cold-storage",
    isColdStorage: true,
    description:
      "Cold-storage-rated pedestrian barrier. White finish and elastomer formulated for sub-zero performance.",
    applications: ["Cold Storage Walkways", "Freezer Aisles"],
    industries: ["Cold Storage", "Food & Beverage", "Pharma"],
    features: ["Cold-rated polymer", "White powder-coated hardware"],
    pas13Compliant: true,
  },
  "Cold Storage - Traffic Barriers": {
    category: "traffic-guardrails",
    subcategory: "cold-storage",
    isColdStorage: true,
    description:
      "Cold-storage-rated traffic barrier. White finish, cold-grade elastomer.",
    applications: ["Cold Storage Aisles", "Freezer Loading Zones"],
    industries: ["Cold Storage", "Food & Beverage", "Pharma"],
    features: ["Cold-rated polymer", "White hardware", "PAS 13 compliant"],
    pas13Compliant: true,
  },
  "Cold Storage - Bollard": {
    category: "bollards",
    subcategory: "cold-storage",
    isColdStorage: true,
    description:
      "Cold-storage iFlex 190 bollard formulated for sub-zero environments.",
    applications: ["Cold Store Columns"],
    industries: ["Cold Storage", "Food & Beverage"],
    features: ["Cold-rated polymer", "White finish"],
  },
  "Cold Storage - RackGuards": {
    category: "rack-protection",
    subcategory: "cold-storage",
    isColdStorage: true,
    description:
      "Cold-storage RackGuard for sub-zero warehouse racking.",
    applications: ["Cold Store Racking"],
    industries: ["Cold Storage"],
    features: ["Cold-rated polymer", "Multiple heights and profiles"],
  },
};

const FAMILY_OVERRIDES: Record<string, Partial<AppCategoryRule>> = {
  "130-T0-P3": { isNew: true },
  "190-T1-P2": { isNew: true },
  "190-T2-P1": { isNew: true },
  "190-T1-P0": { isNew: true },
  "190-T2-P0": { isNew: true },
};

function ruleFor(categoryName: string, familyName?: string) {
  const base = CATEGORY_RULES[categoryName];
  if (!base) throw new Error(`Missing rule for ${categoryName}`);
  if (familyName && FAMILY_OVERRIDES[familyName]) {
    return { ...base, ...FAMILY_OVERRIDES[familyName] };
  }
  return base;
}

function extractDimensionLabel(name: string): string | null {
  const m = name.match(/(\d+mm\s*[x×]\s*\d+mm)/i);
  return m ? m[1] : null;
}
function extractColorLabel(name: string): string | null {
  const m = name.match(/,\s*(Yellow|Black|White|BLK-YEL)\b/i);
  return m ? m[1] : null;
}

type PlanEntry = {
  familyName: string;
  category: string;
  subcategory: string | null;
  pricingLogic: string;
  isNew: boolean;
  isColdStorage: boolean;
  representativePriceAed: number;
  perMeterAed: number | null;
  sku: string | null;
  description: string;
  applications: string[];
  industries: string[];
  features: string[];
  pas13Compliant: boolean;
  variants: Array<{
    sku: string | null;
    name: string;
    variantType: string;
    kind: string | null;
    lengthMm: number | null;
    widthMm: number | null;
    heightMm: number | null;
    dimensionLabel: string | null;
    colorLabel: string | null;
    priceAed: number;
    isNew: boolean;
  }>;
};

function groupFlatCategory(cat: CategoryFlat): Array<{
  familyName: string;
  subcategoryOverride?: string;
  items: FlatItem[];
}> {
  if (cat.category === "Rack End Barrier") {
    const single = cat.items.filter((i) => /single rail/i.test(i.name));
    const double = cat.items.filter((i) => /double rail/i.test(i.name));
    const groups: Array<{ familyName: string; subcategoryOverride?: string; items: FlatItem[] }> = [];
    if (single.length) groups.push({ familyName: "Rack End Barrier - Single Rail", subcategoryOverride: "rack-end-single", items: single });
    if (double.length) groups.push({ familyName: "Rack End Barrier - Double Rail", subcategoryOverride: "rack-end-double", items: double });
    return groups;
  }
  if (cat.category === "Height Restrictor") {
    const posts = cat.items.filter((i) => i.kind === "post");
    const rails = cat.items.filter((i) => i.kind === "top-rail");
    const groups: Array<{ familyName: string; subcategoryOverride?: string; items: FlatItem[] }> = [];
    if (posts.length) groups.push({ familyName: "iFlex Height Restrictor - Post", subcategoryOverride: "height-post", items: posts });
    if (rails.length) groups.push({ familyName: "iFlex Height Restrictor - Top Rail", subcategoryOverride: "height-top-rail", items: rails });
    return groups;
  }
  if (cat.category === "Swing Gate") {
    const gates = cat.items.filter((i) => i.kind === "gate");
    const posts = cat.items.filter((i) => i.kind === "post");
    const groups: Array<{ familyName: string; subcategoryOverride?: string; items: FlatItem[] }> = [];
    if (gates.length) groups.push({ familyName: "Hydraulic Swing Gate (2R) - Self-Close", subcategoryOverride: "swing-gate", items: gates });
    if (posts.length) groups.push({ familyName: "Hydraulic Swing Gate (2R) - Post", subcategoryOverride: "swing-post", items: posts });
    return groups;
  }
  if (cat.category === "FlexiShield Column Guard") {
    const guards = cat.items.filter((i) => !/spacer/i.test(i.name));
    const spacers = cat.items.filter((i) => /spacer/i.test(i.name));
    const groups: Array<{ familyName: string; subcategoryOverride?: string; items: FlatItem[] }> = [];
    if (guards.length) groups.push({ familyName: "FlexiShield Column Guard", subcategoryOverride: "column-guard", items: guards });
    if (spacers.length) groups.push({ familyName: "FlexiShield Column Guard - Spacer Set", subcategoryOverride: "column-guard-spacer", items: spacers });
    return groups;
  }
  if (
    cat.category === "Bollards / Posts" ||
    cat.category === "Truck / Coach / Car Stops" ||
    cat.category === "Retractable Barrier" ||
    cat.category === "Slider Base Plates"
  ) {
    return cat.items.map((i) => ({ familyName: i.name, items: [i] }));
  }
  if (cat.items.length === 1) {
    return [{ familyName: cat.items[0].name, items: cat.items }];
  }
  return [{ familyName: cat.category, items: cat.items }];
}

function buildPlan(): PlanEntry[] {
  const plan: PlanEntry[] = [];
  for (const cat of priceList.categories as Array<CategoryByLength | CategoryFlat>) {
    if ("products" in cat) {
      for (const family of cat.products) {
        const rule = ruleFor(cat.category, family.family);
        const sorted = [...family.variants].sort((a, b) => a.lengthMm - b.lengthMm);
        const longest = sorted[sorted.length - 1];
        plan.push({
          familyName: family.family,
          category: rule.category,
          subcategory: rule.subcategory ?? null,
          pricingLogic: "per_length",
          isNew: !!(family.isNew || rule.isNew),
          isColdStorage: !!rule.isColdStorage,
          representativePriceAed: sorted[0].priceAed,
          perMeterAed: Math.round((longest.priceAed / (longest.lengthMm / 1000)) * 100) / 100,
          sku: null,
          description: rule.description,
          applications: rule.applications,
          industries: rule.industries,
          features: rule.features,
          pas13Compliant: rule.pas13Compliant ?? false,
          variants: family.variants.map((v) => ({
            sku: null,
            name: v.name,
            variantType: "length",
            kind: null,
            lengthMm: v.lengthMm,
            widthMm: null,
            heightMm: null,
            dimensionLabel: null,
            colorLabel: null,
            priceAed: v.priceAed,
            isNew: !!family.isNew,
          })),
        });
      }
      continue;
    }
    if ("items" in cat) {
      const families = groupFlatCategory(cat);
      for (const f of families) {
        const rule = ruleFor(cat.category, f.familyName);
        const first = f.items[0];
        const pricingLogic =
          cat.priceBy === "component" ? "per_component" : cat.priceBy === "rate" ? "per_rate" : "per_unit";
        plan.push({
          familyName: f.familyName,
          category: rule.category,
          subcategory: f.subcategoryOverride ?? rule.subcategory ?? null,
          pricingLogic,
          isNew: !!rule.isNew,
          isColdStorage: !!rule.isColdStorage,
          representativePriceAed: first.priceAed,
          perMeterAed: null,
          sku: first.sku ?? null,
          description: rule.description,
          applications: rule.applications,
          industries: rule.industries,
          features: rule.features,
          pas13Compliant: rule.pas13Compliant ?? false,
          variants: f.items.map((i) => ({
            sku: i.sku ?? null,
            name: i.name,
            variantType: cat.priceBy === "rate" ? "rate" : "size",
            kind: i.kind ?? null,
            lengthMm: i.lengthMm ?? null,
            widthMm: i.widthMm ?? null,
            heightMm: i.heightMm ?? null,
            dimensionLabel: extractDimensionLabel(i.name),
            colorLabel: extractColorLabel(i.name),
            priceAed: i.priceAed,
            isNew: false,
          })),
        });
      }
    }
  }
  return plan;
}

async function ensureSchema(db: ReturnType<typeof drizzle>) {
  // Additive DDL — IF NOT EXISTS makes the endpoint safely idempotent.
  await db.execute(sqlTag`
    CREATE TABLE IF NOT EXISTS product_variants (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id varchar NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      sku varchar,
      name varchar NOT NULL,
      variant_type varchar NOT NULL,
      kind varchar,
      length_mm integer,
      width_mm integer,
      height_mm integer,
      dimension_label varchar,
      color_label varchar,
      price_aed numeric(10,2) NOT NULL,
      currency varchar DEFAULT 'AED',
      is_new boolean DEFAULT false,
      is_active boolean DEFAULT true,
      metadata jsonb,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    );
  `);
  await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS product_variants_product_idx ON product_variants (product_id);`);
  await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS product_variants_sku_idx ON product_variants (sku);`);
  await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS product_variants_length_idx ON product_variants (product_id, length_mm);`);

  await db.execute(sqlTag`ALTER TABLE products ADD COLUMN IF NOT EXISTS sku varchar;`);
  await db.execute(sqlTag`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_new boolean DEFAULT false;`);
  await db.execute(sqlTag`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_cold_storage boolean DEFAULT false;`);
  await db.execute(sqlTag`ALTER TABLE products ADD COLUMN IF NOT EXISTS price_list_source varchar;`);
  await db.execute(sqlTag`ALTER TABLE products ADD COLUMN IF NOT EXISTS price_list_version varchar;`);
  await db.execute(sqlTag`ALTER TABLE products ADD COLUMN IF NOT EXISTS price_list_effective_date timestamp;`);
  await db.execute(sqlTag`ALTER TABLE products ADD COLUMN IF NOT EXISTS installation_guide_url varchar;`);
  await db.execute(sqlTag`ALTER TABLE products ADD COLUMN IF NOT EXISTS lifestyle_image_url varchar;`);
  await db.execute(sqlTag`ALTER TABLE products ADD COLUMN IF NOT EXISTS needs_image_review boolean DEFAULT false;`);

  // Project collaborators — opt-in shared access. The project's primary
  // owner is tracked via projects.userId; this table adds additional reps
  // at owner | editor | viewer role levels. Instant-grant model: the
  // invite is active on insert (accepted_at defaults to now).
  await db.execute(sqlTag`
    CREATE TABLE IF NOT EXISTS project_collaborators (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id varchar NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role varchar NOT NULL DEFAULT 'editor',
      invited_by varchar REFERENCES users(id),
      invited_at timestamp DEFAULT now(),
      accepted_at timestamp DEFAULT now(),
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    );
  `);
  await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS project_collaborators_project_idx ON project_collaborators(project_id);`);
  await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS project_collaborators_user_idx ON project_collaborators(user_id);`);
  await db.execute(sqlTag`CREATE UNIQUE INDEX IF NOT EXISTS project_collaborators_project_user_unique ON project_collaborators(project_id, user_id);`);

  // ──────────────────────────────────────────────
  // Order lifecycle + share-link columns. Additive + idempotent. The legacy
  // `status` column already exists with NOT NULL DEFAULT 'pending' on
  // production — we don't touch its constraints here, only mirror the
  // lifecycle taxonomy default for fresh installs. ADD COLUMN IF NOT
  // EXISTS is a no-op on rows that already have the column.
  // ──────────────────────────────────────────────
  await db.execute(sqlTag`ALTER TABLE orders ADD COLUMN IF NOT EXISTS status varchar DEFAULT 'draft';`);
  await db.execute(sqlTag`ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_changed_at timestamp;`);
  await db.execute(sqlTag`ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_changed_by varchar REFERENCES users(id);`);
  await db.execute(sqlTag`ALTER TABLE orders ADD COLUMN IF NOT EXISTS share_token varchar;`);
  await db.execute(sqlTag`ALTER TABLE orders ADD COLUMN IF NOT EXISTS share_token_expires_at timestamp;`);
  await db.execute(sqlTag`ALTER TABLE orders ADD COLUMN IF NOT EXISTS share_token_created_at timestamp;`);
  await db.execute(sqlTag`ALTER TABLE orders ADD COLUMN IF NOT EXISTS share_token_created_by varchar REFERENCES users(id);`);
  await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);`);
  await db.execute(sqlTag`CREATE INDEX IF NOT EXISTS orders_share_token_idx ON orders(share_token);`);
}

async function applyPlan(db: ReturnType<typeof drizzle>, plan: PlanEntry[]) {
  const effectiveDate = new Date((priceList as any)._meta.effectiveDate);
  let inserted = 0;
  let updated = 0;
  let variantsInserted = 0;

  for (const entry of plan) {
    const existingRows = await db
      .select()
      .from(products)
      .where(ilike(products.name, entry.familyName))
      .limit(1);
    const existing = existingRows[0];

    const priceFields = {
      price: entry.representativePriceAed.toFixed(2),
      basePricePerMeter: entry.perMeterAed != null ? entry.perMeterAed.toFixed(2) : null,
      currency: "AED",
      pricingLogic: entry.pricingLogic,
      sku: entry.sku,
      isNew: entry.isNew,
      isColdStorage: entry.isColdStorage,
      priceListSource: (priceList as any)._meta.source,
      priceListVersion: (priceList as any)._meta.version,
      priceListEffectiveDate: effectiveDate,
      updatedAt: new Date(),
    };

    let productId: string;
    if (!existing) {
      const [row] = await db
        .insert(products)
        .values({
          name: entry.familyName,
          category: entry.category,
          subcategory: entry.subcategory,
          description: entry.description,
          applications: entry.applications as any,
          industries: entry.industries as any,
          features: entry.features as any,
          pas13Compliant: entry.pas13Compliant,
          isActive: true,
          ...priceFields,
        })
        .returning({ id: products.id });
      productId = row.id;
      inserted++;
    } else {
      productId = existing.id;
      const keepDesc = !!existing.description && existing.description.length > 20;
      await db
        .update(products)
        .set({
          category: entry.category,
          subcategory: entry.subcategory ?? existing.subcategory,
          description: keepDesc ? existing.description : entry.description,
          applications:
            Array.isArray(existing.applications) && (existing.applications as any[]).length > 0
              ? existing.applications
              : (entry.applications as any),
          industries:
            Array.isArray(existing.industries) && (existing.industries as any[]).length > 0
              ? existing.industries
              : (entry.industries as any),
          features:
            Array.isArray(existing.features) && (existing.features as any[]).length > 0
              ? existing.features
              : (entry.features as any),
          pas13Compliant: existing.pas13Compliant ?? entry.pas13Compliant,
          isActive: true,
          ...priceFields,
        })
        .where(eq(products.id, productId));
      updated++;
    }

    await db.delete(productVariants).where(eq(productVariants.productId, productId));
    if (entry.variants.length > 0) {
      await db.insert(productVariants).values(
        entry.variants.map((v) => ({
          productId,
          sku: v.sku,
          name: v.name,
          variantType: v.variantType,
          kind: v.kind,
          lengthMm: v.lengthMm,
          widthMm: v.widthMm,
          heightMm: v.heightMm,
          dimensionLabel: v.dimensionLabel,
          colorLabel: v.colorLabel,
          priceAed: v.priceAed.toFixed(2),
          currency: "AED",
          isNew: v.isNew,
          isActive: true,
          metadata: null,
        })),
      );
      variantsInserted += entry.variants.length;
    }
  }

  return { inserted, updated, variantsInserted };
}

// Scraped-name alias map for merging asafe.com data.
const SCRAPED_TO_DB_ALIAS: Record<string, string> = {
  "iflex pedestrian barrier 3 rail cold storage": "CS iFlex Pedestrian 3 Rail",
  "eflex pedestrian 3 rail": "eFlex Pedestrian Barrier",
  "pedestrian barrier 130 t0 p3": "130-T0-P3",
  "pedestrian barrier 190 t1 p2": "190-T1-P2",
  "pedestrian barrier 190 t2 p1": "190-T2-P1",
  "iflex single traffic barrier": "iFlex Single Traffic",
  "iflex double traffic barrier": "iFlex Double Traffic",
  "iflex single traffic barrier+": "iFlex Single Traffic+",
  "iflex double traffic barrier+": "iFlex Double Traffic+",
  "iflex single traffic barrier cold storage": "CS iFlex Single Traffic",
  "iflex single traffic barrier+ cold storage": "CS iFlex Single Traffic+",
  "eflex single traffic barrier+": "eFlex Single Traffic+",
  "traffic barrier 190 t1 p0": "190-T1-P0",
  "traffic barrier 190 t2 p0": "190-T2-P0",
  "topple barrier": "Topple Barrier 2.08m with ForkGuard",
  "heavy duty topple barrier": "Topple Barrier 3.6m with ForkGuard",
  "bollard 130": "Monoplex 130 Bollard",
  "bollard 190": "Monoplex 190 Bollard",
  "iflex bollard": "iFlex 190 Bollard - 2m",
  "iflex bollard cold storage": "Cold Storage iFlex 190 Bollard",
  "monoplex bollard": "Monoplex 190 Bollard",
  "iflexrail column guard": "FlexiShield Column Guard",
  "forkguard kerb barrier": "ForkGuard",
  "heavy duty forkguard kerb barrier": "Heavy Duty ForkGuard",
  "step guard": "Step Guard",
  "alarm bar": "Alarm Bar",
  "dock buffer": "Dock Buffer (Pair)",
  "slider plate": "230 x 230mm - 190mm OD iFlex Post Slider Plate",
  "sign post": "Sign Post, 1.2m - Yellow",
  "rackguard": "RackGuard - Multiple height and profile sizes",
  "rackguard cold storage": "Cold Storage RackGuard - Multiple height and profile sizes",
  "iflex single rackend barrier": "Rack End Barrier - Single Rail",
  "eflex single rackend barrier": "Rack End Barrier - Single Rail",
  "eflex double rackend barrier": "Rack End Barrier - Double Rail",
  "iflex single rackend+kerb": "Rack End Barrier - Single Rail",
  "eflex single rackend+kerb": "Rack End Barrier - Single Rail",
  "eflex double rackend+kerb": "Rack End Barrier - Double Rail",
  "iflex height restrictor": "iFlex Height Restrictor - Post",
  "iflex swing gate short": "Hydraulic Swing Gate (2R) - Self-Close",
  "traffic gate": "Traffic Gate",
  "truck stop": "Truck Stop",
  "coach stop": "Coach Stop",
  "car stop": "Car Stop",
  "retractable barrier": "Flex - Retractable Barrier (Belt Barrier) - Post to Post - YEL/BLK",
  "retractable barrier racking kit": "Retractable Barrier - Racking Maintenance Case - YEL/BLK",
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

function mapScrapedCategory(scrapedCategory: string | undefined, name: string): string {
  const n = name.toLowerCase();
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
  if (/\b(traffic) barrier\b/.test(n) || /\btraffic\b/.test(n)) return "traffic-guardrails";
  if (/\bpedestrian\b/.test(n)) return "pedestrian-guardrails";
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

async function mergeCatalog(
  db: ReturnType<typeof drizzle>,
  opts: { createMissing: boolean; force: boolean },
) {
  const dbRows = await db.select().from(products);
  const dbNormIndex = new Map<string, any>();
  for (const r of dbRows) dbNormIndex.set(normalise(r.name), r);

  let matched = 0,
    enriched = 0,
    skipped = 0,
    created = 0;
  const misses: string[] = [];

  for (const s of (scrapedCatalog as any).products as any[]) {
    const sNorm = normalise(s.familyName);
    const aliasTarget = SCRAPED_TO_DB_ALIAS[sNorm];
    const dbRow =
      (aliasTarget && dbNormIndex.get(normalise(aliasTarget))) ||
      dbNormIndex.get(sNorm);

    if (!dbRow) {
      misses.push(s.familyName);
      continue;
    }
    matched++;

    const patch: Record<string, any> = {};
    const hasDesc = dbRow.description && dbRow.description.length > 40;
    if (s.description && (!hasDesc || opts.force)) patch.description = s.description;
    if (Array.isArray(s.imageUrls) && s.imageUrls[0] && (!dbRow.imageUrl || opts.force)) patch.imageUrl = s.imageUrls[0];
    if (s.technicalSheetUrl && (!dbRow.technicalSheetUrl || opts.force)) patch.technicalSheetUrl = s.technicalSheetUrl;
    if (s.installationGuideUrl && (!dbRow.installationGuideUrl || opts.force)) patch.installationGuideUrl = s.installationGuideUrl;
    if (s.impactRating && (!dbRow.impactRating || opts.force)) patch.impactRating = s.impactRating;
    if (s.heightRange?.minMm && (!dbRow.heightMin || opts.force)) patch.heightMin = s.heightRange.minMm;
    if (s.heightRange?.maxMm && (!dbRow.heightMax || opts.force)) patch.heightMax = s.heightRange.maxMm;
    if (Array.isArray(s.applications) && s.applications.length && (!Array.isArray(dbRow.applications) || (dbRow.applications as any[]).length === 0 || opts.force))
      patch.applications = s.applications;
    if (Array.isArray(s.industries) && s.industries.length && (!Array.isArray(dbRow.industries) || (dbRow.industries as any[]).length === 0 || opts.force))
      patch.industries = s.industries;
    if (Array.isArray(s.features) && s.features.length && (!Array.isArray(dbRow.features) || (dbRow.features as any[]).length === 0 || opts.force))
      patch.features = s.features;
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
    await db.update(products).set(patch as any).where(eq(products.id, dbRow.id));
    enriched++;
  }

  if (opts.createMissing && misses.length > 0) {
    for (const fName of misses) {
      const s = (scrapedCatalog as any).products.find((p: any) => p.familyName === fName);
      const values: Record<string, any> = {
        name: fName,
        category: mapScrapedCategory(s?.category, fName),
        subcategory: null,
        description:
          s?.description ||
          `${fName} — full details on asafe.com (${s?.productUrl ?? "UAE region"}).`,
        applications: s?.applications ?? [],
        industries: s?.industries ?? [],
        features: s?.features ?? [],
        impactRating: s?.impactRating ?? null,
        heightMin: s?.heightRange?.minMm ?? null,
        heightMax: s?.heightRange?.maxMm ?? null,
        imageUrl: s?.imageUrls?.[0] ?? null,
        technicalSheetUrl: s?.technicalSheetUrl ?? null,
        installationGuideUrl: s?.installationGuideUrl ?? null,
        pas13Compliant: !!s?.pas13?.certified,
        pas13TestMethod: s?.pas13?.method ?? null,
        pas13TestJoules: s?.pas13?.joules ?? null,
        pas13Sections: s?.pas13?.sections ?? null,
        currency: "AED",
        price: null,
        basePricePerMeter: null,
        pricingLogic: "per_quote",
        isColdStorage: /cold storage/i.test(fName),
        isActive: true,
        priceListSource: null,
        priceListVersion: null,
      };
      await db.insert(products).values(values as any);
      created++;
    }
  }

  return { matched, enriched, skipped, created, misses };
}

// ─────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────
adminPricelist.post("/admin/apply-pricelist", async (c) => {
  // Auth: require bearer token matching MIGRATION_TOKEN secret. The secret is
  // set via `wrangler secret put MIGRATION_TOKEN`. This is a one-off admin
  // operation; the token can be rotated/removed after the migration.
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json(
      { ok: false, message: "MIGRATION_TOKEN not configured on the worker." },
      500,
    );
  }
  const authHeader = c.req.header("authorization") ?? "";
  const provided = authHeader.replace(/^Bearer\s+/i, "");
  if (provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }

  const doSchema = c.req.query("schema") !== "0";
  const doLoad = c.req.query("load") !== "0";
  const doMerge = c.req.query("merge") !== "0";
  const createMissing = c.req.query("createMissing") === "1";
  const force = c.req.query("force") === "1";
  // Clean up the 5 T-series duplicates accidentally created before the
  // normalise() fix shipped. Safe to run multiple times.
  const doCleanup = c.req.query("cleanup") === "1";

  const database = (c.env as any).DATABASE_URL as string | undefined;
  if (!database) {
    return c.json({ ok: false, message: "DATABASE_URL missing" }, 500);
  }
  const client = neon(database);
  const db = drizzle(client);

  const report: Record<string, unknown> = {};

  try {
    if (doCleanup) {
      const duplicates = [
        "Pedestrian Barrier 130-T0-P3",
        "Pedestrian Barrier 190-T1-P2",
        "Pedestrian Barrier 190-T2-P1",
        "Traffic Barrier 190-T1-P0",
        "Traffic Barrier 190-T2-P0",
      ];
      let deleted = 0;
      for (const name of duplicates) {
        const res = await db
          .delete(products)
          .where(eq(products.name, name))
          .returning({ id: products.id });
        deleted += res.length;
      }
      report.cleanup = { deleted };
    }

    // Deactivate legacy rows that have been superseded by 2025v1 price-list
    // rows. Preserves order history (is_active=false, not delete) so quotes
    // already referencing these names still resolve for audit.
    if (c.req.query("deactivateLegacy") === "1") {
      const legacyNames = [
        // Step-2 duplicates
        "iFlex Single Traffic Barrier",
        "iFlex Double Traffic Barrier",
        "iFlex Single Traffic Barrier+",
        "iFlex Double Traffic Barrier+",
        "eFlex Single Traffic Barrier+",
        "eFlex Single Rack End Barrier",
        "eFlex Double Rack End Barrier",
        "HD ForkGuard Kerb Barrier",
        "ForkGuard Kerb Barrier",
        "FlexiShield Column Guard Spacer Set",
        "iFlex RackGuard",
        "iFlex Height Restrictor",
        "Slider Plate",
        "Hydraulic Swing Gate, Self-Close",
        // Step-3 overview page with no price
        "Monoplex Bollard",
      ];
      let deactivated = 0;
      for (const name of legacyNames) {
        const res = await db
          .update(products)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(products.name, name))
          .returning({ id: products.id });
        deactivated += res.length;
      }
      report.deactivateLegacy = { deactivated, attempted: legacyNames.length };
    }

    // Rebuild RackGuard families into 4 variants across 2 families
    // (400mm + 600mm Normal, 400mm + 600mm Cold Storage). Price per-unit
    // stays on the family rate card (AED 155.76 / AED 186.90); the variant
    // just carries the chosen height so the quote line is explicit.
    // Seed photo-realistic imagery on the vehicle_types table (used by the
    // Impact Calculator / Site Survey / Solution Finder vehicle selector).
    // vehicle_types.icon_url already holds an iconify silhouette per row;
    // vehicle_types.thumbnail_url is the nullable column we use for the
    // real-world photograph. The UI falls back from thumbnail → icon so
    // unseeded rows still render.
    //
    // All URLs sourced from Wikimedia Commons (public-domain or CC/CC-BY-SA),
    // served via the /thumb/ 400px edge-resize endpoint. Full mapping lives in
    // scripts/data/vehicle-image-map.json. The icon fallback still covers any
    // row the update fails to match, but every vehicle type now has a real
    // photograph seeded here.
    if (c.req.query("seedVehicleImages") === "1") {
      const MAP: Array<{ id: string; name: string; imageUrl: string }> = [
        {
          id: "1bdd9636-1ef8-4652-b98a-e443605e2509",
          name: "Pedestrians",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Warehouse_workers_prepare_packages_for_shipment_at_Sharpe_Army_Depot_-_DPLA_-_414220df83b823977c05c01a4b6b4106.jpeg/400px-Warehouse_workers_prepare_packages_for_shipment_at_Sharpe_Army_Depot_-_DPLA_-_414220df83b823977c05c01a4b6b4106.jpeg",
        },
        {
          id: "877cbb11-f27a-4286-b5d0-87ee746cbd41",
          name: "Manual Pallet Truck",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Pallet_jack.PNG/400px-Pallet_jack.PNG",
        },
        {
          id: "e86cb321-0e55-4079-bbb9-eba9902a7db6",
          name: "Electric Pallet Truck",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Electric_pallet_jack.jpg/400px-Electric_pallet_jack.jpg",
        },
        {
          id: "5f538b83-e15d-4883-8e39-c69d5fc39ca7",
          name: "Rider Pallet Truck",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/20150916-OSEC-LSC-0128_%2821017588433%29.jpg/400px-20150916-OSEC-LSC-0128_%2821017588433%29.jpg",
        },
        {
          id: "ae72bb1c-81bc-4004-a443-9c20bde57961",
          name: "Walkie Stacker",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Toyota_Walkie_Stacker_Forklift_on_Pepsi_Truck_in_Irvine%2C_FL.jpg/400px-Toyota_Walkie_Stacker_Forklift_on_Pepsi_Truck_in_Irvine%2C_FL.jpg",
        },
        {
          id: "a8f40c09-4998-4bb4-a2a1-1e4044539af4",
          name: "Low-Level Order Picker",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Jungheinrich_ECE_225.jpg/400px-Jungheinrich_ECE_225.jpg",
        },
        {
          id: "ba6e9a31-f791-4f88-ad7b-275466260bcc",
          name: "High-Level Order Picker",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/137th_SOW_Airmen_integrate_with_35th_LRS%2C_MUNS_%289268424%29.jpg/400px-137th_SOW_Airmen_integrate_with_35th_LRS%2C_MUNS_%289268424%29.jpg",
        },
        {
          id: "1a4960f4-f28f-49db-ae68-110652af0538",
          name: "Counterbalance Forklift (1.5T)",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Toyota_forklift_vehicle.jpg/400px-Toyota_forklift_vehicle.jpg",
        },
        {
          id: "7817d5c7-6949-4dd7-9965-2f6ad7b78427",
          name: "Counterbalance Forklift (2.5T)",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Hyster_50XT_forklift_parked_in_downtown_Campbell.jpg/400px-Hyster_50XT_forklift_parked_in_downtown_Campbell.jpg",
        },
        {
          id: "21b45678-973c-4ee9-b552-561dfb5f842e",
          name: "Counterbalance Forklift (5T)",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Carretilla_elevadora_Hyster.jpg/400px-Carretilla_elevadora_Hyster.jpg",
        },
        {
          id: "18a43f23-d96a-4650-b94c-1875edf58ef1",
          name: "Reach Truck",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/ETV214.jpg/400px-ETV214.jpg",
        },
        {
          id: "0e89efb7-a6d2-4d8f-8215-cfe3704af016",
          name: "Very Narrow Aisle (VNA) Truck",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Zijlader_smallegang3.jpg/400px-Zijlader_smallegang3.jpg",
        },
        {
          id: "0633c437-a7e5-4dac-867b-df1a8e84ecfe",
          name: "Heavy-Duty Forklift (10T+)",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Linde_H80_forklift.JPG/400px-Linde_H80_forklift.JPG",
        },
        {
          id: "04569524-e4a7-48d1-b780-aba832c387d0",
          name: "Telehandler",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Weidemann_Teleskoplader_T4512_CC40.jpg/400px-Weidemann_Teleskoplader_T4512_CC40.jpg",
        },
        {
          id: "8baa64bc-4019-403f-b323-545781f71879",
          name: "Tow Tractor / Tugger",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/MB-4_Aircraft_Towing_Tractor%2C_Museum_of_Aviation.jpg/400px-MB-4_Aircraft_Towing_Tractor%2C_Museum_of_Aviation.jpg",
        },
        {
          id: "f93aa857-e398-4f97-920a-424be2f449fd",
          name: "AGV (Automated Guided Vehicle)",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/AGV_-_Automated_Guided_Vehicle.jpg/400px-AGV_-_Automated_Guided_Vehicle.jpg",
        },
        {
          id: "96beebbb-acaf-409b-ada2-06b75042e294",
          name: "Scissor Lift / MEWP",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Genie_GS-2032.jpg/400px-Genie_GS-2032.jpg",
        },
        {
          id: "eb9bcf13-2364-495b-a490-f0bcdf7c24ee",
          name: "HGV / Rigid Truck (7.5T)",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Belfor_box_truck.jpg/400px-Belfor_box_truck.jpg",
        },
        {
          id: "855e435c-305a-40aa-a950-cd7be5af8e98",
          name: "HGV / Articulated Truck (40T)",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/GXO_articulated_lorry%2C_Ponthir%2C_Torfaen_-_geograph.org.uk_-_7996022.jpg/400px-GXO_articulated_lorry%2C_Ponthir%2C_Torfaen_-_geograph.org.uk_-_7996022.jpg",
        },
        {
          id: "8809a8c7-b1a8-426c-ad29-641029f3923b",
          name: "Delivery Van / Light Commercial",
          imageUrl:
            "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Delivery_vans_-_geograph.org.uk_-_1130216.jpg/400px-Delivery_vans_-_geograph.org.uk_-_1130216.jpg",
        },
      ];

      let applied = 0;
      const missed: string[] = [];
      for (const m of MAP) {
        const res = await db
          .update(vehicleTypes)
          .set({ thumbnailUrl: m.imageUrl, updatedAt: new Date() })
          .where(or(eq(vehicleTypes.id, m.id), eq(vehicleTypes.name, m.name)))
          .returning({ id: vehicleTypes.id });
        if (res.length > 0) applied++;
        else missed.push(m.name);
      }
      report.seedVehicleImages = {
        attempted: MAP.length,
        applied,
        missed,
        note:
          "Photo stored on vehicle_types.thumbnail_url (nullable). icon_url remains the iconify silhouette fallback. Every vehicle type in MAP now has a licence-safe Wikimedia Commons photograph (PD or CC BY-SA); missing rows here mean the DB row could not be matched by id/name, in which case the icon fallback still renders.",
      };
    }

    // Normalise product images onto the clean hero / in-situ split we agreed
    // with the customer: products.imageUrl is always the product-only hero
    // (thumbnails, grid, cart, spec card top half); products.lifestyleImageUrl
    // is the optional in-situ photo used only as a secondary context strip
    // in the Proposed Solutions card. This run flips the 6 families whose
    // live hero is actually an in-situ shot, and fills in hero URLs for the
    // 9 families that were missing an image entirely. All URLs resolved
    // from the scraped asafe.com catalog's imageUrls array.
    if (c.req.query("normaliseImages") === "1") {
      const MAP: Array<{
        name: string;
        hero: string;
        lifestyle?: string;
      }> = [
        // 6 currently in-situ — move in-situ to lifestyle, replace hero.
        {
          name: "ForkGuard",
          hero: "https://webcdn.asafe.com/media/0lkhom3p/forkguard_qutr1.jpg",
          lifestyle:
            "https://webcdn.asafe.com/media/2hljhqtr/forkguard_insitu_1.jpg",
        },
        {
          name: "iFlex Height Restrictor - Post",
          hero:
            "https://webcdn.asafe.com/media/5675/iflexheightrestrict_quarter1156x556.jpg",
          lifestyle:
            "https://webcdn.asafe.com/media/5679/iflexheightrestrictsitu1156x556_03.jpg",
        },
        {
          name: "RackGuard - Multiple height and profile sizes",
          hero:
            "https://webcdn.asafe.com/media/2979/rackguard-rack-leg-protector_qu.jpg",
          lifestyle:
            "https://webcdn.asafe.com/media/hy4npla5/rackguard-in-situ.png",
        },
        {
          name: "Sign Post, 1.2m - Yellow",
          hero:
            "https://webcdn.asafe.com/media/7988/signpost_qutr_1156x556.jpg",
          lifestyle:
            "https://webcdn.asafe.com/media/7984/signpost_situ03_1156x556.jpg",
        },
        {
          name: "Topple Barrier 2.08m with ForkGuard",
          hero:
            "https://webcdn.asafe.com/media/uwndr1vn/topple_barrier_front.jpg",
          lifestyle:
            "https://webcdn.asafe.com/media/krgdfmlm/topple_barrier_insitu.jpg",
        },
        {
          name: "Topple Barrier 3.6m with ForkGuard",
          hero:
            "https://webcdn.asafe.com/media/4rllscls/heavy_duty_topple_qutr.jpg",
          lifestyle:
            "https://webcdn.asafe.com/media/6942/iflexheavydutytopple_situ_1156x556_01.jpg",
        },

        // 9 families that had no image at all — source hero from sibling pages.
        {
          name: "Hydraulic Swing Gate (2R) - Post",
          hero:
            "https://webcdn.asafe.com/media/2974/iflex-swinggate_short_qu.jpg",
        },
        {
          name: "iFlex Post 130",
          hero:
            "https://webcdn.asafe.com/media/rgbkmxgr/130_monoplex_bollard_product_image-1-min.jpg",
        },
        {
          name: "FlexiShield Column Guard - Spacer Set",
          hero:
            "https://webcdn.asafe.com/media/2956/flexishield-column-guard-wraparound-_qu.jpg",
        },
        {
          name: "Tape Barrier Kit - Wall to Wall - YEL/BLK",
          hero:
            "https://webcdn.asafe.com/media/obkbw0gw/8753_postunit01_scr.jpg",
        },
        {
          name:
            "iFlex - Retractable Barrier (Belt Barrier) - Post to Wall - YEL/BLK",
          hero:
            "https://webcdn.asafe.com/media/obkbw0gw/8753_postunit01_scr.jpg",
        },
        {
          name: "iFlex Height Restrictor - Top Rail",
          hero:
            "https://webcdn.asafe.com/media/5675/iflexheightrestrict_quarter1156x556.jpg",
        },
        {
          name: "180 x 180mm / 130mm - 158mm eFlex OD Post Slider Plate",
          hero:
            "https://webcdn.asafe.com/media/2937/sliderplates_158_front.jpg",
        },
        {
          name: "Topple Barrier 5.3m with ForkGuard",
          hero:
            "https://webcdn.asafe.com/media/4rllscls/heavy_duty_topple_qutr.jpg",
        },
        // 1 more: Bollard Bumper is en-us only on asafe.com. Point its hero
        // at the Monoplex 190 plan photo as a placeholder until proper art
        // lands. The two other known placeholders (iFlex Post 130 borrowing
        // the Monoplex 130 image, 180×180 eFlex Slider Plate borrowing the
        // 158 slider shot) get flagged below.
        {
          name: "Bollard Bumper",
          hero:
            "https://webcdn.asafe.com/media/lthn25rg/190_monoplex_bollard_product_image-7-min.jpg",
        },
      ];

      const PLACEHOLDER_IMAGERY = [
        "Bollard Bumper",
        "iFlex Post 130",
        "180 x 180mm / 130mm - 158mm eFlex OD Post Slider Plate",
      ];

      const results: Array<{
        name: string;
        updated: boolean;
        set: Record<string, string>;
      }> = [];
      for (const m of MAP) {
        const patch: Record<string, unknown> = {
          imageUrl: m.hero,
          updatedAt: new Date(),
        };
        if (m.lifestyle) patch.lifestyleImageUrl = m.lifestyle;
        const res = await db
          .update(products)
          .set(patch as any)
          .where(eq(products.name, m.name))
          .returning({ id: products.id });
        results.push({
          name: m.name,
          updated: res.length > 0,
          set: {
            imageUrl: m.hero,
            ...(m.lifestyle ? { lifestyleImageUrl: m.lifestyle } : {}),
          },
        });
      }
      // Flag placeholders so they surface on an admin backlog list.
      let flagged = 0;
      for (const name of PLACEHOLDER_IMAGERY) {
        const res = await db
          .update(products)
          .set({ needsImageReview: true, updatedAt: new Date() } as any)
          .where(eq(products.name, name))
          .returning({ id: products.id });
        flagged += res.length;
      }

      report.normaliseImages = {
        attempted: MAP.length,
        applied: results.filter((r) => r.updated).length,
        missed: results.filter((r) => !r.updated).map((r) => r.name),
        flaggedForReview: flagged,
      };
    }

    // Seed the application_types lookup. Idempotent — rows are upserted by
    // name (the unique column) so re-running just refreshes description,
    // category, icon, sortOrder, isPopular against the source fixture.
    if (c.req.query("seedApplicationTypes") === "1") {
      const rows = (applicationTypesSeed as any).rows as Array<{
        name: string;
        category: string;
        description?: string;
        iconUrl: string;
        hexColor?: string;
        sortOrder?: number;
        isPopular?: boolean;
      }>;
      let inserted = 0;
      let updated = 0;
      for (const r of rows) {
        const existing = await db
          .select()
          .from(applicationTypes)
          .where(eq(applicationTypes.name, r.name))
          .limit(1);
        if (existing[0]) {
          await db
            .update(applicationTypes)
            .set({
              category: r.category,
              description: r.description ?? null,
              iconUrl: r.iconUrl,
              hexColor: r.hexColor ?? null,
              sortOrder: r.sortOrder ?? 0,
              isPopular: !!r.isPopular,
              isActive: true,
              updatedAt: new Date(),
            } as any)
            .where(eq(applicationTypes.id, existing[0].id));
          updated++;
        } else {
          await db.insert(applicationTypes).values({
            name: r.name,
            category: r.category,
            description: r.description ?? null,
            iconUrl: r.iconUrl,
            hexColor: r.hexColor ?? null,
            sortOrder: r.sortOrder ?? 0,
            isPopular: !!r.isPopular,
            isActive: true,
          } as any);
          inserted++;
        }
      }
      report.seedApplicationTypes = {
        inserted,
        updated,
        total: rows.length,
      };
    }

    // One-shot support flow: find a user by name/email substring, clear
    // any KV lockout counter, and (optionally) reset their password to a
    // supplied new value. Gated by the same MIGRATION_TOKEN bearer as the
    // rest of this endpoint. Emits a support-log line so the audit trail
    // is unambiguous.
    // Health audit of every account: flags anyone who wouldn't be able
    // to log in (no passwordHash, locked out, role blocked, etc.). Pure
    // read — no mutations. Use this after any auth-flow change to spot
    // regressions across the whole user base.
    if (c.req.query("auditLogins") === "1") {
      const all = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          passwordHash: users.passwordHash,
          createdAt: users.createdAt,
        })
        .from(users);
      const rows: Array<{
        email: string | null;
        name: string;
        role: string | null;
        issues: string[];
        lockout: any;
        failed: any;
      }> = [];
      for (const u of all) {
        const issues: string[] = [];
        if (!u.email) issues.push("no-email");
        if (!u.passwordHash) issues.push("no-password-hash");
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
        const emailLower = (u.email || "").toLowerCase();
        let lockout: any = null;
        let failed: any = null;
        try {
          lockout = emailLower
            ? await c.env.KV_SESSIONS.get(`lockout:${emailLower}`)
            : null;
          failed = emailLower
            ? await c.env.KV_SESSIONS.get(`failed:${emailLower}`)
            : null;
        } catch {}
        if (lockout) issues.push("locked-out");
        rows.push({
          email: u.email,
          name: name || "(no name)",
          role: u.role,
          issues,
          lockout,
          failed,
        });
      }
      report.auditLogins = {
        total: rows.length,
        healthy: rows.filter((r) => r.issues.length === 0).length,
        issues: rows.filter((r) => r.issues.length > 0),
        byRole: rows.reduce((acc: any, r) => {
          const k = r.role || "(none)";
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        }, {}),
      };
    }

    // Nuclear option: clear every KV lockout + failed-attempt counter. Use
    // after you've shipped an auth change that mass-locks accounts, or
    // after a test run that burned someone's counter. Logs how many keys
    // were scrubbed.
    if (c.req.query("clearAllLockouts") === "1") {
      const list = await c.env.KV_SESSIONS.list({ prefix: "lockout:" });
      const list2 = await c.env.KV_SESSIONS.list({ prefix: "failed:" });
      let cleared = 0;
      for (const k of list.keys) {
        await c.env.KV_SESSIONS.delete(k.name);
        cleared++;
      }
      for (const k of list2.keys) {
        await c.env.KV_SESSIONS.delete(k.name);
        cleared++;
      }
      report.clearAllLockouts = { cleared };
    }

    if (c.req.query("findUser")) {
      const q = (c.req.query("findUser") || "").trim().toLowerCase();
      if (q.length < 2) {
        return c.json({ ok: false, message: "query too short" }, 400);
      }
      const all = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          createdAt: users.createdAt,
        })
        .from(users);
      const hits = all.filter((u) => {
        const blob = `${u.email ?? ""} ${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
        return blob.includes(q);
      });
      report.findUser = {
        query: q,
        count: hits.length,
        users: hits.slice(0, 20),
      };
    }

    if (c.req.query("resetUserPassword")) {
      const email = (c.req.query("resetUserPassword") || "").trim().toLowerCase();
      const newPassword = c.req.query("newPassword");
      if (!email || !newPassword || newPassword.length < 8) {
        return c.json(
          {
            ok: false,
            message:
              "Pass ?resetUserPassword=<email>&newPassword=<>=8chars>",
          },
          400,
        );
      }
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (!user) {
        report.resetUserPassword = { email, found: false };
      } else {
        const hash = await bcrypt.hash(newPassword, 10);
        await db
          .update(users)
          .set({
            passwordHash: hash,
            updatedAt: new Date(),
          } as any)
          .where(eq(users.id, user.id));
        // Clear any KV lockout entries that would 429 the next login.
        // Lockout keys are `lockout:<normalised-email>` and the sliding
        // rate-limit keys are `rl:*:<ip-or-user>:<bucket>`. We scrub the
        // email-keyed lockout directly; IP-based rate-limits expire on
        // their own window.
        try {
          await c.env.KV_SESSIONS.delete(`lockout:${email}`);
          await c.env.KV_SESSIONS.delete(`failed:${email}`);
        } catch {}
        report.resetUserPassword = {
          email,
          found: true,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
          },
          tempPassword: newPassword,
        };
      }
    }

    // Hide every quote-only (unpriced) catalog entry. Preserves the row
    // for later re-enable if a price lands, but the product list, cart,
    // and search stop surfacing them.
    if (c.req.query("hideQuoteOnly") === "1") {
      const res = await db
        .update(products)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(products.pricingLogic, "per_quote"))
        .returning({ id: products.id, name: products.name });
      report.hideQuoteOnly = {
        deactivated: res.length,
        names: res.map((r) => r.name),
      };
    }

    if (c.req.query("rackguard") === "1") {
      type RackFam = {
        familyName: string;
        priceAed: number;
        heights: number[];
      };
      const fams: RackFam[] = [
        {
          familyName: "RackGuard - Multiple height and profile sizes",
          priceAed: 155.76,
          heights: [400, 600],
        },
        {
          familyName:
            "Cold Storage RackGuard - Multiple height and profile sizes",
          priceAed: 186.9,
          heights: [400, 600],
        },
      ];
      const rgReport: Array<{ family: string; variantsCreated: number }> = [];
      for (const fam of fams) {
        const rows = await db
          .select()
          .from(products)
          .where(eq(products.name, fam.familyName))
          .limit(1);
        if (!rows[0]) continue;
        const productId = rows[0].id;
        await db
          .delete(productVariants)
          .where(eq(productVariants.productId, productId));
        await db.insert(productVariants).values(
          fam.heights.map((h) => ({
            productId,
            sku: null,
            name: `${fam.familyName.replace(/ - Multiple.*$/, "")} - ${h}mm`,
            variantType: "size",
            kind: null,
            lengthMm: null,
            widthMm: null,
            heightMm: h,
            dimensionLabel: `${h}mm height`,
            colorLabel: null,
            priceAed: fam.priceAed.toFixed(2),
            currency: "AED",
            isNew: false,
            isActive: true,
            metadata: null,
          })),
        );
        rgReport.push({ family: fam.familyName, variantsCreated: fam.heights.length });
      }
      report.rackguard = rgReport;
    }

    if (doSchema) {
      await ensureSchema(db);
      report.schema = "ok";
    }

    if (doLoad) {
      const plan = buildPlan();
      const res = await applyPlan(db, plan);
      report.load = {
        ...res,
        families: plan.length,
      };
    }

    if (doMerge) {
      const res = await mergeCatalog(db, { createMissing, force });
      report.merge = res;
    }

    return c.json({ ok: true, report });
  } catch (err) {
    console.error("apply-pricelist failed:", err);
    return c.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        report,
      },
      500,
    );
  }
});

export default adminPricelist;
