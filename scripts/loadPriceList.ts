/**
 * scripts/loadPriceList.ts
 *
 * Idempotent loader that reconciles the current A-SAFE UAE price list
 * (AED) into the products + product_variants tables.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/loadPriceList.ts [--dry-run] [--file path]
 *
 *   --dry-run        Print the plan without mutating the DB.
 *   --file <path>    Override the default pricelist JSON path.
 *
 * Behaviour:
 *  - Reads scripts/data/pricelist-aed-2025v1.json.
 *  - For every product family found there:
 *      * Upserts a row in `products` (match-by-name, case-insensitive).
 *      * Stamps the canonical SKU/description/category/pricingLogic/flags.
 *      * Sets `price` / `basePricePerMeter` for back-compat with code that
 *        still reads those fields on the products table.
 *      * Deletes ALL existing variants for that product and re-inserts the
 *        current variant set from the JSON. Prices are therefore
 *        authoritative from the JSON on every run.
 *  - Writes an audit record (priceListSource, priceListVersion,
 *    priceListEffectiveDate, updatedAt=now) so a future loader can detect
 *    stale data.
 *  - Does NOT touch products that aren't mentioned in the JSON. That keeps
 *    this script composable with seedProducts.ts (which loads families
 *    that aren't on the price list).
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, ilike, sql } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { products, productVariants } from "../shared/schema";

// ─────────────────────────────────────────────────────────────
// Types matching pricelist-aed-2025v1.json
// ─────────────────────────────────────────────────────────────
type FamilyByLength = {
  family: string;
  priceBy: "length";
  isNew?: boolean;
  variants: Array<{
    name: string;
    lengthMm: number;
    priceAed: number;
  }>;
};
type CategoryByLength = {
  category: string;
  products: FamilyByLength[];
};
type FlatItem = {
  name: string;
  sku?: string | null;
  priceAed: number;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  kind?: string; // "post" | "top-rail" | "gate"
  _note?: string;
};
type CategoryFlat = {
  category: string;
  priceBy: "unit" | "component" | "rate";
  notes?: string;
  items: FlatItem[];
};
type PriceList = {
  _meta: {
    source: string;
    version: string;
    currency: string;
    effectiveDate: string;
  };
  categories: Array<CategoryByLength | CategoryFlat>;
};

// ─────────────────────────────────────────────────────────────
// Category → app taxonomy
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
      "Self-closing hydraulic swing gate for mezzanine edges, stair landings, and walkway entries. Maintains fall protection when personnel pass through.",
    applications: ["Mezzanine Edges", "Stair Landings", "Walkway Entries"],
    industries: ["Logistics", "Manufacturing", "Warehousing"],
    features: ["Self-closing", "Hydraulic damper", "Modular post + gate"],
  },
  "Traffic Gate": {
    category: "gates",
    subcategory: "traffic",
    description:
      "Wide-opening traffic gate for controlled vehicle access points. Absorbs accidental impacts and returns to closed position.",
    applications: ["Secured Vehicle Access", "Loading Dock Entry"],
    industries: ["Logistics", "Manufacturing"],
    features: ["Impact-absorbing", "Spanning widths 2m–3m", "High visibility"],
  },
  "Retractable Barrier": {
    category: "retractable",
    subcategory: "belt-tape",
    description:
      "Retractable belt and tape barriers for temporary walkway/works cordoning. Available in post-to-post, post-to-wall, and wall-to-wall configurations.",
    applications: ["Temporary Barriers", "Racking Maintenance Zones", "Works Cordoning"],
    industries: ["Logistics", "Manufacturing", "Events"],
    features: ["Retractable belt/tape", "Portable", "Multiple mounting configurations"],
  },
  "Truck / Coach / Car Stops": {
    category: "stops",
    subcategory: "wheel-stop",
    description:
      "Wheel stops that prevent over-travel at parking bays, loading docks, and service areas. Sized per vehicle class.",
    applications: ["Parking Bays", "Loading Docks", "Service Areas"],
    industries: ["Logistics", "Transport", "Commercial"],
    features: ["Sized per vehicle class", "Fix-to-floor", "Impact absorbing"],
  },
  "Slider Base Plates": {
    category: "accessories",
    subcategory: "base-plate",
    description:
      "Sliding base plate that lets iFlex / eFlex posts shift horizontally on impact rather than shear. Reduces floor anchor damage.",
    applications: ["Post Base Impact Isolation"],
    industries: ["Logistics", "Manufacturing"],
    features: ["Sliding post mount", "Reduced floor damage", "Retrofit existing posts"],
  },
  "RackGuards": {
    category: "rack-protection",
    subcategory: "rackguard",
    description:
      "Upright-mounted rack frame protection. Available in multiple heights and profile sizes to match the racking spec; priced at a single rate per unit.",
    applications: ["Racking Upright Protection", "Aisle Column Protection"],
    industries: ["Logistics", "E-commerce", "Retail Distribution"],
    features: [
      "Multiple height options",
      "Clips to upright profile",
      "No floor anchoring",
    ],
  },
  "Alarm Bar": {
    category: "accessories",
    subcategory: "alarm",
    description:
      "Audible / visual alarm bar that triggers when the barrier it is fitted to is impacted. Alerts supervisors to an impact event in real time.",
    applications: ["Impact Alerting", "Safety Monitoring"],
    industries: ["Logistics", "Manufacturing"],
    features: ["Audible/visual alarm", "Barrier-mounted", "Impact-activated"],
  },
  "Dock Buffer": {
    category: "accessories",
    subcategory: "dock-buffer",
    description:
      "Pair of dock buffers fitted to loading bay walls to absorb reversing HGV impact. Sold as a pair.",
    applications: ["Loading Dock Walls", "Trailer Alignment Zones"],
    industries: ["Logistics", "Distribution"],
    features: ["Sold as pair", "Impact absorbing", "Wall-mounted"],
  },
  "Cold Storage - Pedestrian Barriers": {
    category: "pedestrian-guardrails",
    subcategory: "cold-storage",
    isColdStorage: true,
    description:
      "Cold-storage-rated pedestrian barrier. White powder-coat finish and elastomer formulated for sub-zero performance.",
    applications: ["Cold Storage Walkways", "Freezer Aisles", "Chilled Warehouse Segregation"],
    industries: ["Cold Storage", "Food & Beverage", "Pharma"],
    features: [
      "Cold-rated polymer",
      "White powder-coated hardware",
      "Same modular system as standard iFlex",
    ],
    pas13Compliant: true,
  },
  "Cold Storage - Traffic Barriers": {
    category: "traffic-guardrails",
    subcategory: "cold-storage",
    isColdStorage: true,
    description:
      "Cold-storage-rated traffic barrier. White finish, cold-grade elastomer, same impact rating as standard iFlex.",
    applications: ["Cold Storage Aisles", "Freezer Loading Zones"],
    industries: ["Cold Storage", "Food & Beverage", "Pharma"],
    features: [
      "Cold-rated polymer",
      "White hardware",
      "PAS 13 compliant",
    ],
    pas13Compliant: true,
  },
  "Cold Storage - Bollard": {
    category: "bollards",
    subcategory: "cold-storage",
    isColdStorage: true,
    description:
      "Cold-storage iFlex 190 bollard. Same impact profile as standard iFlex 190 but formulated for sub-zero environments.",
    applications: ["Cold Store Columns", "Freezer Aisle Entries"],
    industries: ["Cold Storage", "Food & Beverage"],
    features: ["Cold-rated polymer", "White finish", "Anchored baseplate"],
  },
  "Cold Storage - RackGuards": {
    category: "rack-protection",
    subcategory: "cold-storage",
    isColdStorage: true,
    description:
      "Cold-storage RackGuard for sub-zero warehouse racking. Same profile options as standard RackGuard.",
    applications: ["Cold Store Racking", "Freezer Aisles"],
    industries: ["Cold Storage"],
    features: ["Cold-rated polymer", "Multiple heights and profiles", "White finish"],
  },
};

// Family-level descriptions for the product families that need tighter
// per-family copy (i.e. the families under a shared category header).
const FAMILY_OVERRIDES: Record<
  string,
  Partial<AppCategoryRule> & { isNew?: boolean }
> = {
  "eFlex Pedestrian Barrier": {
    description:
      "Two-rail pedestrian barrier using the lighter eFlex post profile. Ideal for walkway segregation in areas with incidental-only vehicle contact.",
  },
  "iFlex Pedestrian 3 Rail": {
    description:
      "Three-rail iFlex pedestrian barrier — the A-SAFE standard for walkway segregation in mixed forklift/pedestrian aisles.",
  },
  "130-T0-P3": {
    isNew: true,
    description:
      "Compact 130-profile 3-rail pedestrian barrier. Engineered for tighter aisles where full iFlex footprint is not practical.",
  },
  "eFlex Single Traffic+": {
    description:
      "eFlex single-rail traffic barrier with integrated pedestrian handrail (+). Segregates vehicle and pedestrian traffic in the same run.",
  },
  "iFlex Single Traffic+": {
    description:
      "iFlex single-rail traffic barrier with integrated pedestrian handrail (+). Full iFlex impact rating plus pedestrian segregation in one system.",
  },
  "iFlex Double Traffic+": {
    description:
      "iFlex double-rail traffic barrier with integrated pedestrian handrail (+). Highest iFlex impact rating combined with pedestrian segregation.",
  },
  "190-T1-P2": {
    isNew: true,
    description:
      "New 190-profile traffic/pedestrian combination barrier with 1 traffic rail and 2 pedestrian rails.",
  },
  "190-T2-P1": {
    isNew: true,
    description:
      "New 190-profile combination barrier with 2 traffic rails and 1 pedestrian rail.",
  },
  "eFlex Single Traffic Barrier": {
    description:
      "Single-rail traffic barrier using the eFlex post profile. Lighter footprint suited to lower-speed forklift zones.",
  },
  "iFlex Single Traffic": {
    description:
      "Single-rail iFlex traffic barrier — the workhorse traffic guardrail for warehouse aisles and production perimeters.",
  },
  "iFlex Double Traffic": {
    description:
      "Double-rail iFlex traffic barrier for heavier impact zones and taller vehicles.",
  },
  "190-T1-P0": {
    isNew: true,
    description:
      "New 190-profile single traffic-only barrier (no pedestrian rails).",
  },
  "190-T2-P0": {
    isNew: true,
    description:
      "New 190-profile double traffic-only barrier (no pedestrian rails).",
  },
  "Topple Barrier 2.08m with ForkGuard": {
    description:
      "2.08m-high topple barrier with integrated ForkGuard base. Stops stacked pallets from toppling into pedestrian aisles.",
  },
  "Topple Barrier 3.6m with ForkGuard": {
    description:
      "3.6m-high topple barrier with integrated ForkGuard base. For taller racking configurations.",
  },
  "Topple Barrier 5.3m with ForkGuard": {
    description:
      "5.3m-high topple barrier with integrated ForkGuard base. Full-height pallet topple protection for high-bay warehouses.",
  },
  "CS iFlex Pedestrian 3 Rail": {
    isNew: false,
    description:
      "Cold-storage variant of the iFlex Pedestrian 3 Rail barrier. Cold-grade elastomer and white finish for sub-zero environments.",
  },
  "CS iFlex Single Traffic+": {
    description:
      "Cold-storage variant of iFlex Single Traffic+ (with pedestrian handrail). Cold-grade elastomer, white finish.",
  },
  "CS iFlex Single Traffic": {
    description:
      "Cold-storage variant of iFlex Single Traffic. Cold-grade elastomer, white finish.",
  },
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function derivePricingForFamily(variants: FamilyByLength["variants"]): {
  representativePriceAed: number;
  perMeter: number;
} {
  // Use the shortest-length SKU as the representative "price" field
  // (what per_unit-reading code will show if it doesn't know how to query
  // variants). basePricePerMeter is the per-meter rate of the *longest*
  // SKU since per-meter pricing drops as length grows (fixed post cost
  // amortises), so longest gives the most accurate linear rate.
  const sorted = [...variants].sort((a, b) => a.lengthMm - b.lengthMm);
  const shortest = sorted[0];
  const longest = sorted[sorted.length - 1];
  return {
    representativePriceAed: shortest.priceAed,
    perMeter:
      Math.round((longest.priceAed / (longest.lengthMm / 1000)) * 100) / 100,
  };
}

function ruleFor(
  categoryName: string,
  familyName?: string,
): AppCategoryRule & { isNew?: boolean } {
  const base = CATEGORY_RULES[categoryName];
  if (!base) {
    throw new Error(
      `No category rule for "${categoryName}" — add one to CATEGORY_RULES`,
    );
  }
  if (familyName && FAMILY_OVERRIDES[familyName]) {
    return { ...base, ...FAMILY_OVERRIDES[familyName] };
  }
  return base;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

type LoaderPlan = {
  upserts: Array<{
    familyName: string;
    category: string;
    subcategory?: string;
    pricingLogic: string;
    isNew: boolean;
    isColdStorage: boolean;
    representativePriceAed: number;
    perMeterAed: number | null;
    sku: string | null;
    variantCount: number;
    variants: Array<{
      sku: string | null;
      name: string;
      variantType: string;
      lengthMm?: number;
      widthMm?: number;
      dimensionLabel?: string;
      colorLabel?: string;
      priceAed: number;
      kind?: string;
      isNew?: boolean;
    }>;
  }>;
};

function buildPlan(priceList: PriceList): LoaderPlan {
  const plan: LoaderPlan = { upserts: [] };

  for (const cat of priceList.categories) {
    // Length-priced categories (barriers, topple)
    if ("products" in cat) {
      for (const family of cat.products) {
        const rule = ruleFor(cat.category, family.family);
        const { representativePriceAed, perMeter } = derivePricingForFamily(
          family.variants,
        );
        plan.upserts.push({
          familyName: family.family,
          category: rule.category,
          subcategory: rule.subcategory,
          pricingLogic: "per_length",
          isNew: !!(family.isNew || rule.isNew),
          isColdStorage: !!rule.isColdStorage,
          representativePriceAed,
          perMeterAed: perMeter,
          sku: null,
          variantCount: family.variants.length,
          variants: family.variants.map((v) => ({
            sku: null,
            name: v.name,
            variantType: "length",
            lengthMm: v.lengthMm,
            priceAed: v.priceAed,
            isNew: !!family.isNew,
          })),
        });
      }
      continue;
    }

    // Flat (unit/component/rate) categories
    if ("items" in cat) {
      // Group items into families. For most flat categories each item IS its
      // own family. The exception: Rack End Barrier has 2 visual families
      // (single rail vs double rail) inside one category; we split those out.
      const families = groupFlatCategory(cat);
      for (const f of families) {
        const rule = ruleFor(cat.category, f.familyName);
        const first = f.items[0];
        const pricingLogic =
          cat.priceBy === "component"
            ? "per_component"
            : cat.priceBy === "rate"
              ? "per_rate"
              : "per_unit";
        plan.upserts.push({
          familyName: f.familyName,
          category: rule.category,
          subcategory: f.subcategoryOverride ?? rule.subcategory,
          pricingLogic,
          isNew: !!rule.isNew,
          isColdStorage: !!rule.isColdStorage,
          representativePriceAed: first.priceAed,
          perMeterAed: null,
          sku: first.sku ?? null,
          variantCount: f.items.length,
          variants: f.items.map((i) => ({
            sku: i.sku ?? null,
            name: i.name,
            variantType: cat.priceBy === "rate" ? "rate" : "size",
            lengthMm: i.lengthMm,
            widthMm: i.widthMm,
            dimensionLabel: extractDimensionLabel(i.name),
            colorLabel: extractColorLabel(i.name),
            priceAed: i.priceAed,
            kind: i.kind,
          })),
        });
      }
    }
  }

  return plan;
}

function groupFlatCategory(cat: CategoryFlat): Array<{
  familyName: string;
  subcategoryOverride?: string;
  items: FlatItem[];
}> {
  // Special case: Rack End Barrier has two families under one price-list section.
  if (cat.category === "Rack End Barrier") {
    const single = cat.items.filter((i) => /single rail/i.test(i.name));
    const double = cat.items.filter((i) => /double rail/i.test(i.name));
    const groups: ReturnType<typeof groupFlatCategory> = [];
    if (single.length)
      groups.push({
        familyName: "Rack End Barrier - Single Rail",
        subcategoryOverride: "rack-end-single",
        items: single,
      });
    if (double.length)
      groups.push({
        familyName: "Rack End Barrier - Double Rail",
        subcategoryOverride: "rack-end-double",
        items: double,
      });
    return groups;
  }

  // Special case: Height Restrictor has posts + top rails as separate families.
  if (cat.category === "Height Restrictor") {
    const posts = cat.items.filter((i) => i.kind === "post");
    const rails = cat.items.filter((i) => i.kind === "top-rail");
    const groups: ReturnType<typeof groupFlatCategory> = [];
    if (posts.length)
      groups.push({
        familyName: "iFlex Height Restrictor - Post",
        subcategoryOverride: "height-post",
        items: posts,
      });
    if (rails.length)
      groups.push({
        familyName: "iFlex Height Restrictor - Top Rail",
        subcategoryOverride: "height-top-rail",
        items: rails,
      });
    return groups;
  }

  // Special case: Swing Gate has gates + post as separate families.
  if (cat.category === "Swing Gate") {
    const gates = cat.items.filter((i) => i.kind === "gate");
    const posts = cat.items.filter((i) => i.kind === "post");
    const groups: ReturnType<typeof groupFlatCategory> = [];
    if (gates.length)
      groups.push({
        familyName: "Hydraulic Swing Gate (2R) - Self-Close",
        subcategoryOverride: "swing-gate",
        items: gates,
      });
    if (posts.length)
      groups.push({
        familyName: "Hydraulic Swing Gate (2R) - Post",
        subcategoryOverride: "swing-post",
        items: posts,
      });
    return groups;
  }

  // Special case: FlexiShield Column Guard has column guards + spacer sets.
  if (cat.category === "FlexiShield Column Guard") {
    const guards = cat.items.filter((i) => !/spacer/i.test(i.name));
    const spacers = cat.items.filter((i) => /spacer/i.test(i.name));
    const groups: ReturnType<typeof groupFlatCategory> = [];
    if (guards.length)
      groups.push({
        familyName: "FlexiShield Column Guard",
        subcategoryOverride: "column-guard",
        items: guards,
      });
    if (spacers.length)
      groups.push({
        familyName: "FlexiShield Column Guard - Spacer Set",
        subcategoryOverride: "column-guard-spacer",
        items: spacers,
      });
    return groups;
  }

  // Categories where each item is a distinct product family:
  //   Bollards (Monoplex vs iFlex vs Sign Post), Wheel stops (Truck/Coach/Car),
  //   Retractable Barrier (4 distinct kit types), Slider Base Plates.
  if (
    cat.category === "Bollards / Posts" ||
    cat.category === "Truck / Coach / Car Stops" ||
    cat.category === "Retractable Barrier" ||
    cat.category === "Slider Base Plates"
  ) {
    return cat.items.map((i) => ({
      familyName: i.name,
      items: [i],
    }));
  }

  // Default: the whole category is one family. For single-item categories
  // we use the item's name (nicer than the category header for things like
  // Cold Storage where the category label is just an organisational bucket).
  if (cat.items.length === 1) {
    return [
      {
        familyName: cat.items[0].name,
        items: cat.items,
      },
    ];
  }
  return [
    {
      familyName: cat.category,
      items: cat.items,
    },
  ];
}

function extractDimensionLabel(name: string): string | undefined {
  const m = name.match(/(\d+mm\s*[x×]\s*\d+mm)/i);
  return m ? m[1] : undefined;
}

function extractColorLabel(name: string): string | undefined {
  const m = name.match(/,\s*(Yellow|Black|White|BLK-YEL)\b/i);
  return m ? m[1] : undefined;
}

// ─────────────────────────────────────────────────────────────
// DB apply
// ─────────────────────────────────────────────────────────────

async function applyPlan(
  db: ReturnType<typeof drizzle>,
  plan: LoaderPlan,
  priceListMeta: PriceList["_meta"],
) {
  const effectiveDate = new Date(priceListMeta.effectiveDate);
  let inserted = 0;
  let updated = 0;
  let variantsInserted = 0;

  for (const entry of plan.upserts) {
    // Look up existing product by name (case-insensitive).
    const existingRows = await db
      .select()
      .from(products)
      .where(ilike(products.name, entry.familyName))
      .limit(1);

    const existing = existingRows[0];
    const rule = ruleFor(
      // figure out which rule — we tucked it into entry.category already.
      // For family-override text we recompute:
      pickRuleCategoryFor(entry),
      entry.familyName,
    );

    const priceFields = {
      price: entry.representativePriceAed.toFixed(2),
      basePricePerMeter:
        entry.perMeterAed != null ? entry.perMeterAed.toFixed(2) : null,
      currency: "AED",
      pricingLogic: entry.pricingLogic,
      sku: entry.sku,
      isNew: entry.isNew,
      isColdStorage: entry.isColdStorage,
      priceListSource: priceListMeta.source,
      priceListVersion: priceListMeta.version,
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
          subcategory: entry.subcategory ?? null,
          description: rule.description,
          applications: rule.applications,
          industries: rule.industries,
          features: rule.features,
          pas13Compliant: rule.pas13Compliant ?? false,
          isActive: true,
          ...priceFields,
        })
        .returning({ id: products.id });
      productId = row.id;
      inserted++;
    } else {
      productId = existing.id;
      // Only overwrite description/applications/industries/features when the
      // existing row doesn't have meaningful content. This keeps any manual
      // content edits intact while still fixing skeletal rows.
      const keepExistingText =
        existing.description && existing.description.length > 20;
      await db
        .update(products)
        .set({
          category: entry.category,
          subcategory: entry.subcategory ?? existing.subcategory,
          description: keepExistingText ? existing.description : rule.description,
          applications:
            existing.applications && isNonEmptyArray(existing.applications)
              ? existing.applications
              : rule.applications,
          industries:
            existing.industries && isNonEmptyArray(existing.industries)
              ? existing.industries
              : rule.industries,
          features:
            existing.features && isNonEmptyArray(existing.features)
              ? existing.features
              : rule.features,
          pas13Compliant: existing.pas13Compliant ?? rule.pas13Compliant ?? false,
          isActive: true,
          ...priceFields,
        })
        .where(eq(products.id, productId));
      updated++;
    }

    // Replace variants wholesale so re-runs are idempotent.
    await db.delete(productVariants).where(eq(productVariants.productId, productId));
    if (entry.variants.length > 0) {
      await db.insert(productVariants).values(
        entry.variants.map((v) => ({
          productId,
          sku: v.sku ?? null,
          name: v.name,
          variantType: v.variantType,
          kind: v.kind ?? null,
          lengthMm: v.lengthMm ?? null,
          widthMm: v.widthMm ?? null,
          dimensionLabel: v.dimensionLabel ?? null,
          colorLabel: v.colorLabel ?? null,
          priceAed: v.priceAed.toFixed(2),
          currency: "AED",
          isNew: !!v.isNew,
          isActive: true,
          metadata: null,
        })),
      );
      variantsInserted += entry.variants.length;
    }
  }

  return { inserted, updated, variantsInserted };
}

function isNonEmptyArray(x: unknown): boolean {
  return Array.isArray(x) && x.length > 0;
}

function pickRuleCategoryFor(entry: LoaderPlan["upserts"][number]): string {
  // Reverse-lookup by category key so CATEGORY_RULES rule stays authoritative.
  const byCategory: Record<string, string> = {
    "pedestrian-guardrails": entry.isColdStorage
      ? "Cold Storage - Pedestrian Barriers"
      : "Pedestrian Barriers",
    "traffic-guardrails": entry.isColdStorage
      ? "Cold Storage - Traffic Barriers"
      : "Traffic Barriers",
    "topple-barriers": "Topple Barrier",
    "bollards": entry.isColdStorage ? "Cold Storage - Bollard" : "Bollards / Posts",
    "column-protection":
      entry.subcategory === "corner-guard"
        ? "FlexiShield Corner Guard"
        : "FlexiShield Column Guard",
    "accessories": accessorySubForEntry(entry),
    "rack-protection":
      entry.subcategory === "rackguard"
        ? entry.isColdStorage
          ? "Cold Storage - RackGuards"
          : "RackGuards"
        : "Rack End Barrier",
    "height-restrictors": "Height Restrictor",
    "gates": entry.subcategory?.startsWith("swing")
      ? "Swing Gate"
      : "Traffic Gate",
    "retractable": "Retractable Barrier",
    "stops": "Truck / Coach / Car Stops",
  };
  return byCategory[entry.category] ?? entry.category;
}

function accessorySubForEntry(entry: LoaderPlan["upserts"][number]): string {
  const s = entry.subcategory ?? "";
  if (s === "step-guard") return "Step Guard";
  if (s === "forkguard") return "ForkGuard";
  if (s === "forkguard-hd") return "Heavy Duty ForkGuard";
  if (s === "bollard-bumper") return "Bollard Bumper";
  if (s === "base-plate") return "Slider Base Plates";
  if (s === "alarm") return "Alarm Bar";
  if (s === "dock-buffer") return "Dock Buffer";
  if (s === "column-guard-spacer") return "FlexiShield Column Guard";
  return "ForkGuard"; // fallback
}

// ─────────────────────────────────────────────────────────────
// Entrypoint
// ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fileIdx = args.indexOf("--file");
  const fileArg = fileIdx >= 0 ? args[fileIdx + 1] : undefined;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const filePath =
    fileArg ??
    path.resolve(__dirname, "data", "pricelist-aed-2025v1.json");

  if (!fs.existsSync(filePath)) {
    console.error(`Price list not found: ${filePath}`);
    process.exit(1);
  }

  const priceList = JSON.parse(fs.readFileSync(filePath, "utf8")) as PriceList;
  const plan = buildPlan(priceList);

  console.log(
    `[loadPriceList] source=${priceList._meta.source} version=${priceList._meta.version}`,
  );
  console.log(
    `[loadPriceList] plan: ${plan.upserts.length} product families, ${plan.upserts.reduce((s, u) => s + u.variantCount, 0)} variants`,
  );
  for (const u of plan.upserts) {
    const tag = u.isNew ? " [NEW]" : "";
    const cs = u.isColdStorage ? " [CS]" : "";
    console.log(
      `  - ${u.familyName}${tag}${cs}  (${u.pricingLogic}, ${u.variantCount} variants, AED ${u.representativePriceAed.toFixed(2)}+)`,
    );
  }

  if (dryRun) {
    console.log("[loadPriceList] --dry-run set, not writing to DB.");
    return;
  }

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set. Either set it, or rerun with --dry-run.",
    );
    process.exit(1);
  }

  const sqlClient = neon(DATABASE_URL);
  const db = drizzle(sqlClient);

  console.log("[loadPriceList] applying to DB...");
  const result = await applyPlan(db, plan, priceList._meta);
  console.log(
    `[loadPriceList] done. inserted=${result.inserted} updated=${result.updated} variants=${result.variantsInserted}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
