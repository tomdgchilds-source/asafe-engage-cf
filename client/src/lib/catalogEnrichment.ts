// Sideloads the richer impact-rating metadata (vehicleTest narrative,
// impactRatingRaw string, PAS 13 method/certified) from the scraped
// A-SAFE catalog that isn't yet persisted on the `products` table.
// Cards call getCatalogEnrichment(productName) at render to fill in the
// hover card / PAS 13 tooltip.
//
// Once these fields are ingested into the schema (separate follow-up),
// this loader can be deleted.

import catalog from "../../../scripts/data/asafe-catalog.json";

interface CatalogEntry {
  familyName: string;
  impactRating: number | null;
  impactRatingRaw: string | null;
  vehicleTest: string | null;
  pas13: {
    certified?: boolean;
    sections?: string[];
    method?: string | null;
    joules?: number | null;
  } | null;
}

export interface CatalogEnrichment {
  impactRatingRaw: string | null;
  vehicleTest: string | null;
  pas13Method: string | null;
  pas13Certified: boolean;
}

// Normalise for fuzzy name matching — lower case, strip punctuation and
// size/variant suffixes so "iFlex Pedestrian 3 Rail (Cold Storage)"
// still matches the family record.
function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const entries = ((catalog as unknown as { products?: CatalogEntry[] }).products
  || (catalog as unknown as CatalogEntry[])) as CatalogEntry[];

const byNormName = new Map<string, CatalogEntry>();
for (const e of entries) {
  if (e?.familyName) byNormName.set(normalise(e.familyName), e);
}

export function getCatalogEnrichment(productName: string | null | undefined): CatalogEnrichment | null {
  if (!productName) return null;
  const norm = normalise(productName);
  let entry = byNormName.get(norm);

  // Loose fallback: substring match — useful for cart item names that
  // may append a variant suffix we haven't stripped.
  if (!entry) {
    for (const [key, val] of Array.from(byNormName.entries())) {
      if (norm.includes(key) || key.includes(norm)) {
        entry = val;
        break;
      }
    }
  }

  if (!entry) return null;
  return {
    impactRatingRaw: entry.impactRatingRaw || null,
    vehicleTest: entry.vehicleTest || null,
    pas13Method: entry.pas13?.method || null,
    pas13Certified: !!entry.pas13?.certified,
  };
}
