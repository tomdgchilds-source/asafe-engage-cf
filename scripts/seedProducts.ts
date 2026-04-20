import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { products } from "../shared/schema";
import * as fs from "fs";
import * as path from "path";

// Product family definitions with proper categorization and descriptions
const productFamilies: Record<string, {
  category: string;
  subcategory?: string;
  description: string;
  applications: string[];
  industries: string[];
  features: string[];
  pricingLogic: string;
  pas13Compliant?: boolean;
}> = {
  "eFlex Single Rack End Barrier": {
    category: "rack-protection",
    subcategory: "rack-end",
    description: "The eFlex Single Rack End Barrier is a high-performance polymer barrier designed to protect racking end frames from forklift impacts. Tested to absorb up to 11,600 joules of energy, it provides robust protection in warehouse environments while its flexible design allows it to return to its original shape after impact.",
    applications: ["Warehousing", "Racking Protection", "Forklift Areas"],
    industries: ["Logistics", "Manufacturing", "Retail", "E-commerce"],
    features: ["Self-restoring after impact", "No floor damage on impact", "Easy installation", "Low maintenance", "Polymer construction"],
    pricingLogic: "per_unit",
    pas13Compliant: true,
  },
  "eFlex Double Rack End Barrier": {
    category: "rack-protection",
    subcategory: "rack-end",
    description: "The eFlex Double Rack End Barrier provides enhanced double-rail protection for racking end frames. With superior energy absorption capacity, this barrier shields valuable racking infrastructure from the heaviest forklift impacts in busy warehouse environments.",
    applications: ["Warehousing", "Racking Protection", "Heavy Traffic Areas"],
    industries: ["Logistics", "Manufacturing", "Retail", "E-commerce"],
    features: ["Double rail protection", "Self-restoring after impact", "No floor damage", "Heavy-duty polymer", "Quick installation"],
    pricingLogic: "per_unit",
    pas13Compliant: true,
  },
  "Atlas Double Traffic Barrier": {
    category: "traffic-guardrails",
    subcategory: "double-rail",
    description: "The Atlas Double Traffic Barrier is a heavy-duty double-rail guardrail system engineered for the most demanding industrial environments. Tested to withstand impacts of 30,200 joules (3.0 T vehicle at 16 km/h), it provides maximum protection for pedestrians, structures, and equipment in high-traffic areas.",
    applications: ["Perimeter Protection", "Traffic Management", "Pedestrian Safety"],
    industries: ["Manufacturing", "Automotive", "Heavy Industry", "Logistics"],
    features: ["Highest impact resistance", "Double rail design", "Vehicle tested", "Modular system", "Corrosion resistant"],
    pricingLogic: "per_meter",
    pas13Compliant: true,
  },
  "Atlas Double Traffic Barrier+": {
    category: "traffic-guardrails",
    subcategory: "double-rail",
    description: "The Atlas Double Traffic Barrier+ builds on the Atlas platform with enhanced features including integrated handrail for added pedestrian safety. This premium barrier solution combines maximum vehicle impact protection with pedestrian guidance functionality.",
    applications: ["Perimeter Protection", "Pedestrian Walkways", "Mixed Traffic Zones"],
    industries: ["Manufacturing", "Automotive", "Heavy Industry", "Logistics"],
    features: ["Integrated handrail", "Maximum impact protection", "Dual functionality", "Modular design", "Premium finish"],
    pricingLogic: "per_meter",
    pas13Compliant: true,
  },
  "eFlex Single Traffic Barrier": {
    category: "traffic-guardrails",
    subcategory: "single-rail",
    description: "The eFlex Single Traffic Barrier is a flexible polymer guardrail that absorbs and deflects vehicle impacts up to 20,400 joules. Its revolutionary polymer construction means it springs back to shape after impact, dramatically reducing maintenance costs and downtime.",
    applications: ["Traffic Management", "Aisle Protection", "Perimeter Barriers"],
    industries: ["Logistics", "Manufacturing", "Food & Beverage", "Pharmaceutical"],
    features: ["Self-restoring polymer", "No paint transfer", "Zero maintenance", "5.3T vehicle tested", "Flexible design"],
    pricingLogic: "per_meter",
    pas13Compliant: true,
  },
  "eFlex Single Traffic Barrier+": {
    category: "traffic-guardrails",
    subcategory: "single-rail",
    description: "The eFlex Single Traffic Barrier+ combines the self-restoring polymer technology of the eFlex range with an integrated handrail for pedestrian guidance. Ideal for mixed-use environments where vehicle and pedestrian traffic coexist.",
    applications: ["Mixed Traffic Zones", "Pedestrian Walkways", "Aisle Protection"],
    industries: ["Logistics", "Manufacturing", "Food & Beverage", "Pharmaceutical"],
    features: ["Self-restoring polymer", "Integrated handrail", "Pedestrian guidance", "Zero maintenance", "Dual purpose"],
    pricingLogic: "per_meter",
    pas13Compliant: true,
  },
  "iFlex Double Traffic Barrier": {
    category: "traffic-guardrails",
    subcategory: "double-rail",
    description: "The iFlex Double Traffic Barrier delivers outstanding 41,000 joule impact protection through its innovative polymer and steel hybrid construction. Tested against a 10.6T vehicle at 10 km/h, it represents the pinnacle of industrial traffic barrier technology.",
    applications: ["Heavy Traffic Areas", "Perimeter Protection", "Building Protection"],
    industries: ["Manufacturing", "Automotive", "Heavy Industry", "Mining"],
    features: ["41,000J impact rating", "Polymer-steel hybrid", "10.6T vehicle tested", "Modular sections", "Industry-leading protection"],
    pricingLogic: "per_meter",
    pas13Compliant: true,
  },
  "iFlex Double Traffic Barrier+": {
    category: "traffic-guardrails",
    subcategory: "double-rail",
    description: "The iFlex Double Traffic Barrier+ is the premium version of the iFlex Double, featuring an integrated handrail and enhanced aesthetics. With 41,000 joule protection, it's the ultimate solution for high-risk areas requiring both vehicle and pedestrian safety.",
    applications: ["Heavy Traffic Areas", "Pedestrian Safety", "Mixed Use Areas"],
    industries: ["Manufacturing", "Automotive", "Heavy Industry", "Mining"],
    features: ["41,000J impact rating", "Integrated handrail", "Premium design", "10.6T vehicle tested", "Maximum protection"],
    pricingLogic: "per_meter",
    pas13Compliant: true,
  },
  "iFlex Single Traffic Barrier": {
    category: "traffic-guardrails",
    subcategory: "single-rail",
    description: "The iFlex Single Traffic Barrier combines robust 41,000 joule impact resistance with a compact single-rail profile. Perfect for areas where space is limited but maximum protection is still required against heavy vehicle impacts.",
    applications: ["Traffic Management", "Space-Limited Areas", "Perimeter Protection"],
    industries: ["Manufacturing", "Automotive", "Logistics", "Mining"],
    features: ["41,000J impact rating", "Compact profile", "Space efficient", "10.6T vehicle tested", "High strength"],
    pricingLogic: "per_meter",
    pas13Compliant: true,
  },
  "iFlex Single Traffic Barrier+": {
    category: "traffic-guardrails",
    subcategory: "single-rail",
    description: "The iFlex Single Traffic Barrier+ offers 30,200 joule impact protection in a single-rail format with an integrated handrail. This versatile barrier is ideal for environments that need both traffic separation and pedestrian guidance.",
    applications: ["Mixed Traffic Zones", "Pedestrian Routes", "Traffic Separation"],
    industries: ["Manufacturing", "Automotive", "Logistics", "Pharmaceutical"],
    features: ["30,200J impact rating", "Integrated handrail", "Single rail design", "7.8T vehicle tested", "Versatile"],
    pricingLogic: "per_meter",
    pas13Compliant: true,
  },
  "mFlex Single Traffic Barrier": {
    category: "traffic-guardrails",
    subcategory: "single-rail",
    description: "The mFlex Single Traffic Barrier is a cost-effective single-rail polymer barrier for lighter traffic environments. Its flexible construction absorbs minor impacts and springs back to shape, making it ideal for areas with smaller vehicles like pallet trucks.",
    applications: ["Light Traffic Areas", "Aisle Marking", "Traffic Guidance"],
    industries: ["Logistics", "Retail", "E-commerce", "Food & Beverage"],
    features: ["Cost-effective", "Flexible polymer", "Self-restoring", "Easy installation", "Lightweight"],
    pricingLogic: "per_meter",
  },
  "mFlex Double Traffic Barrier": {
    category: "traffic-guardrails",
    subcategory: "double-rail",
    description: "The mFlex Double Traffic Barrier provides double-rail protection for moderate traffic environments. An excellent balance of protection and cost-effectiveness for facilities using smaller MHE such as pallet trucks and low-level order pickers.",
    applications: ["Medium Traffic Areas", "Perimeter Protection", "Aisle Protection"],
    industries: ["Logistics", "Retail", "E-commerce", "Food & Beverage"],
    features: ["Double rail protection", "Moderate impact rating", "Cost-effective", "Self-restoring", "Versatile"],
    pricingLogic: "per_meter",
  },
  "flexishield column guard": {
    category: "column-protection",
    description: "FlexiShield Column Guards are precision-engineered polymer sleeves that protect structural columns from forklift and vehicle impacts. Available in a wide range of sizes to fit columns from 100mm to 600mm, they simply slide over existing columns for instant protection.",
    applications: ["Column Protection", "Structural Protection", "Warehousing"],
    industries: ["Logistics", "Manufacturing", "Retail", "All Industries"],
    features: ["Slide-on installation", "Multiple sizes available", "Yellow high-visibility", "No fixings required", "Polymer construction"],
    pricingLogic: "per_unit",
  },
  "flexishield corner guard": {
    category: "column-protection",
    subcategory: "corner-protection",
    description: "FlexiShield Corner Guards protect exposed wall corners and structural edges from impact damage. Quick and easy to install, they provide visible protection for building corners in warehouses, factories, and commercial facilities.",
    applications: ["Corner Protection", "Wall Protection", "Building Maintenance"],
    industries: ["All Industries", "Logistics", "Manufacturing", "Retail"],
    features: ["Easy installation", "High visibility", "Available in yellow and black", "Protects wall corners", "Cost-effective"],
    pricingLogic: "per_unit",
  },
  "iflex height restrictor": {
    category: "height-restrictors",
    description: "The iFlex Height Restrictor is a robust polymer height restriction barrier that prevents oversized vehicles from entering restricted areas. Tested to withstand 5,800 joules of impact (3.6T at 7 km/h), it provides both physical and visual height warning for vehicle operators.",
    applications: ["Height Restriction", "Access Control", "Loading Docks"],
    industries: ["Logistics", "Manufacturing", "Retail", "Transport"],
    features: ["5,800J impact tested", "Visual height warning", "Polymer construction", "Self-restoring", "Adjustable height"],
    pricingLogic: "per_unit",
    pas13Compliant: true,
  },
};

// Parse CSV data
function parseCSV(csvContent: string): Record<string, string>[] {
  const lines = csvContent.split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] || "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);

  // Read the complete products CSV (has tiered pricing and product families)
  const completeCSV = fs.readFileSync(
    path.join(__dirname, "../attached_assets/asafe_products_complete_1755642527052.csv"),
    "utf-8"
  );
  const completeRows = parseCSV(completeCSV);

  // Read the master database CSV (has individual items with dimensions)
  const masterCSV = fs.readFileSync(
    path.join(__dirname, "../attached_assets/asafe_master_database_normalized_1756063447141.csv"),
    "utf-8"
  );
  const masterRows = parseCSV(masterCSV);

  // Build product family data from both sources
  const familyData: Map<string, {
    impactRating: number | null;
    vehicleTest: string | null;
    imageUrl: string | null;
    price: string | null;
    pricePerMeter: string | null;
    heightMin: number | null;
    heightMax: number | null;
    pricingLogic: string;
    variants: string[];
  }> = new Map();

  // Process complete products CSV - get base pricing and impact ratings
  for (const row of completeRows) {
    const name = row.product_name?.toLowerCase();
    if (!name) continue;

    const existing = familyData.get(name);
    const joules = row.impact_joules ? parseInt(row.impact_joules.replace(/,/g, "")) : null;
    const imageUrl = row.image_url || null;
    const variant = row.variant || null;

    if (!existing) {
      // Per-item vs per-meter pricing
      const isPerMeter = row.price_basis === "per linear metre";
      familyData.set(name, {
        impactRating: joules,
        vehicleTest: row.vehicle_test || null,
        imageUrl,
        price: isPerMeter ? (row.price_2_10_m || row.price_aed || null) : (row.price_aed || null),
        pricePerMeter: isPerMeter ? (row.price_2_10_m || null) : null,
        heightMin: null,
        heightMax: null,
        pricingLogic: isPerMeter ? "per_meter" : "per_unit",
        variants: variant ? [variant] : [],
      });
    } else {
      if (!existing.impactRating && joules) existing.impactRating = joules;
      if (!existing.imageUrl && imageUrl) existing.imageUrl = imageUrl;
      if (variant) existing.variants.push(variant);
    }
  }

  // Process master database CSV - get dimensions
  for (const row of masterRows) {
    const family = row.Product_Family?.toLowerCase();
    if (!family) continue;

    const existing = familyData.get(family);
    const height = row.Height_mm ? parseFloat(row.Height_mm) : null;
    const joules = row.Joule_J ? parseFloat(row.Joule_J) : null;

    if (!existing) {
      familyData.set(family, {
        impactRating: joules ? Math.round(joules) : null,
        vehicleTest: null,
        imageUrl: row.Image_URL || null,
        price: row.Price_AED || null,
        pricePerMeter: null,
        heightMin: height ? Math.round(height) : null,
        heightMax: height ? Math.round(height) : null,
        pricingLogic: "per_unit",
        variants: row.Variant ? [row.Variant] : [],
      });
    } else {
      if (height) {
        if (!existing.heightMin || height < existing.heightMin) existing.heightMin = Math.round(height);
        if (!existing.heightMax || height > existing.heightMax) existing.heightMax = Math.round(height);
      }
      if (!existing.impactRating && joules) existing.impactRating = Math.round(joules);
      if (!existing.imageUrl && row.Image_URL) existing.imageUrl = row.Image_URL;
      if (!existing.price && row.Price_AED) existing.price = row.Price_AED;
      if (row.Variant && !existing.variants.includes(row.Variant)) {
        existing.variants.push(row.Variant);
      }
    }
  }

  console.log(`Found ${familyData.size} product families from CSV data\n`);

  // Now insert products
  let created = 0;
  for (const [familyNameLower, data] of familyData) {
    // Find matching family definition
    const familyKey = Object.keys(productFamilies).find(
      k => k.toLowerCase() === familyNameLower
    );

    const familyDef = familyKey ? productFamilies[familyKey] : null;
    const displayName = familyKey || familyNameLower.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    if (!familyDef) {
      console.log(`  Skipping "${displayName}" - no family definition found`);
      continue;
    }

    const specs: Record<string, any> = {};
    if (data.impactRating) specs.impactRating = `${data.impactRating.toLocaleString()} Joules`;
    if (data.vehicleTest) specs.vehicleTest = data.vehicleTest;
    if (data.heightMin && data.heightMax && data.heightMin !== data.heightMax) {
      specs.heightRange = `${data.heightMin}mm - ${data.heightMax}mm`;
    } else if (data.heightMin) {
      specs.height = `${data.heightMin}mm`;
    }
    if (data.variants.length > 0) {
      specs.variants = data.variants.slice(0, 10); // First 10 variants
      specs.variantCount = data.variants.length;
    }

    try {
      const [created_product] = await db.insert(products).values({
        id: crypto.randomUUID(),
        name: displayName,
        category: familyDef.category,
        subcategory: familyDef.subcategory || null,
        description: familyDef.description,
        specifications: specs,
        impactRating: data.impactRating,
        heightMin: data.heightMin,
        heightMax: data.heightMax,
        pas13Compliant: familyDef.pas13Compliant || false,
        price: data.price ? data.price.toString() : null,
        basePricePerMeter: data.pricePerMeter ? data.pricePerMeter.toString() : null,
        currency: "AED",
        imageUrl: data.imageUrl,
        applications: familyDef.applications,
        industries: familyDef.industries,
        features: familyDef.features,
        pricingLogic: familyDef.pricingLogic || data.pricingLogic,
        isActive: true,
      }).returning({ id: products.id, name: products.name });

      console.log(`  ✓ Created: ${created_product.name} (${created_product.id})`);
      created++;
    } catch (err: any) {
      console.error(`  ✗ Error creating "${displayName}": ${err.message}`);
    }
  }

  console.log(`\nDone! Created ${created} products.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
