// ────────────────────────────────────────────────────────────────────────────
// worker/routes/products.options.ts
//
// Pure helpers for the grouped GET /api/products response: which card a
// bollard row belongs to, and the `options` list of every card (one per
// priced sub-size). Kept out of products.ts so they can be unit-tested
// without a DB.
// ────────────────────────────────────────────────────────────────────────────

export {
  deriveColour,
  deriveFamilyOptions,
  deriveHeightMm,
  findProductSubSize,
  formatHeightMm,
  parseHeightMetresFromName,
  productSubSizes,
  type FamilyOption,
  type OptionSource,
  type SubSize,
} from "../../shared/productOptions";

/** Card name of the standard iFlex 190 bollard line (835 mm, 1.2 m and 2 m). */
export const IFLEX_190_BOLLARD_FAMILY = "iFlex 190 Bollard";

/**
 * Bollard grouping.
 *
 * Sales feedback (Shahla, Micah — May 5): all bollard variants of the same
 * model + impact rating live under ONE card; the variant axis (colour,
 * height, OD) lives inside. The actual SKUs ship as "Heavy Duty Bollard,
 * Yellow, GALV" / "Heavy Duty Bollard, Grey, GALV" under a priceless
 * "iFlex Heavy Duty Bollard" parent, so all three roll up into that card
 * (the phantom parent contributes metadata only — see products.ts).
 *
 * Owner feedback (Tom): the 1.2 m rows "Bollard, Yellow" / "Bollard, Grey"
 * are the 1.2 m iFlex 190 bollards, so they share the card of the 2 m SKU
 * "iFlex 190 Bollard - 2m". One card; its options are the rows' priced
 * sub-sizes (see shared/productOptions.ts).
 *
 * Cold Storage, Heavy Duty, Monoplex 130/190, iFlex Post 130 and Sign Post
 * stay separate per their distinct impact ratings / model lines.
 *
 * Returns null when the name needs no re-grouping; the caller falls back to
 * the raw product name.
 */
export function resolveBollardGroupKey(name: string): string | null {
  if (name.includes("Cold Storage iFlex 190 Bollard")) {
    return "Cold Storage iFlex 190 Bollard";
  }
  if (name === "iFlex Heavy Duty Bollard" || name.startsWith("Heavy Duty Bollard")) {
    return "iFlex Heavy Duty Bollard";
  }
  if (name === "Monoplex 130 Bollard") return "Monoplex 130 Bollard";
  if (name === "Monoplex 190 Bollard") return "Monoplex 190 Bollard";
  if (name === "iFlex Post 130") return "iFlex Post 130";
  if (name.startsWith("Sign Post")) return name; // each sign-post line stays distinct
  if (name.startsWith("iFlex 190 Bollard")) return IFLEX_190_BOLLARD_FAMILY;
  if (/^Bollard, (Yellow|Grey)/.test(name)) return IFLEX_190_BOLLARD_FAMILY;
  return null;
}
