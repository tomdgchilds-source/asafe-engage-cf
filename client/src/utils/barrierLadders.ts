/**
 * barrierLadders.ts
 *
 * Pure TypeScript helpers backing the "Good / Better / Best" barrier tier
 * system used across the cart tier-switcher, the generated order-form PDF,
 * and the Impact Calculator recommendation engine.
 *
 * No React. No runtime dependencies. The fixture JSON is imported
 * statically so the client bundle, the Cloudflare Worker, and any
 * server-side scripts all read the same ladder definitions.
 */

import laddersJson from "../../../scripts/data/barrier-ladders.json";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type BarrierTier = "good" | "better" | "best";

export interface LadderTierConfig {
  family: string;
  rationale: string;
}

export interface BarrierLadder {
  id: string;
  label: string;
  applicationAreas: string[];
  tiers: Record<BarrierTier, LadderTierConfig>;
}

export interface LaddersFile {
  _meta: {
    purpose: string;
    safetyFactors: Record<BarrierTier, number>;
  };
  ladders: BarrierLadder[];
}

// ---------------------------------------------------------------------------
// Fixture exports — single source of truth for client + server
// ---------------------------------------------------------------------------

export const LADDERS_FILE: LaddersFile = laddersJson as LaddersFile;
export const LADDERS: BarrierLadder[] = LADDERS_FILE.ladders;
export const SAFETY_FACTORS = LADDERS_FILE._meta.safetyFactors;

/** Canonical tier iteration order — weakest → strongest. */
export const TIER_ORDER: BarrierTier[] = ["good", "better", "best"];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Strip trailing length / colour / option suffixes so
 * "iFlex Single Traffic - 1600mm" matches the canonical
 * "iFlex Single Traffic" tier family string.
 *
 * We chop at the first " - " separator, which is the convention used
 * across the catalog for length (`- 1600mm`), colour (`- Yellow`), and
 * variant (`- Left Hand`) suffixes.
 */
function normaliseFamilyName(raw: string): string {
  if (!raw) return "";
  const dashIdx = raw.indexOf(" - ");
  const head = dashIdx >= 0 ? raw.slice(0, dashIdx) : raw;
  return head.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Public resolvers
// ---------------------------------------------------------------------------

/**
 * Resolve the ladder that contains a given product family name.
 * Case-insensitive; tolerant of trailing length/colour suffixes such as
 * `- 1600mm` or `- Yellow`.
 */
export function findLadderForFamily(
  productName: string,
): { ladder: BarrierLadder; tier: BarrierTier } | null {
  if (!productName) return null;
  const needle = normaliseFamilyName(productName);
  if (!needle) return null;

  for (const ladder of LADDERS) {
    for (const tier of TIER_ORDER) {
      const tierFamily = ladder.tiers[tier]?.family;
      if (!tierFamily) continue;
      if (normaliseFamilyName(tierFamily) === needle) {
        return { ladder, tier };
      }
    }
  }
  return null;
}

/**
 * Resolve a ladder by application area string using case-insensitive
 * substring matching. Returns the first ladder whose `applicationAreas`
 * list mentions the query (either the area contains the query, or the
 * query contains the area — either direction is a useful hit).
 */
export function findLadderForApplication(
  applicationArea: string,
): BarrierLadder | null {
  if (!applicationArea) return null;
  const needle = applicationArea.trim().toLowerCase();
  if (!needle) return null;

  for (const ladder of LADDERS) {
    for (const area of ladder.applicationAreas) {
      const hay = area.toLowerCase();
      if (hay.includes(needle) || needle.includes(hay)) {
        return ladder;
      }
    }
  }
  return null;
}

/**
 * Safety margin — `(productJoules - requiredJoules) / requiredJoules`.
 * Returns 0 when `requiredJoules` is null/undefined/0/negative, or when
 * `productJoules` is missing. Margin can be negative if the product is
 * weaker than the requirement.
 */
export function safetyMargin(
  productJoules: number | null | undefined,
  requiredJoules: number | null | undefined,
): number {
  if (requiredJoules == null || requiredJoules <= 0) return 0;
  if (productJoules == null) return 0;
  return (productJoules - requiredJoules) / requiredJoules;
}

/**
 * Given a required impact energy and (optional) risk level, recommend a
 * tier from the ladder.
 *
 * Precedence:
 *   1) `riskLevel === "critical"` → "best" (always top-tier for critical).
 *   2) `riskLevel === "high"`     → "better".
 *   3) Otherwise pick the LOWEST tier whose family meets the safety-factor
 *      threshold for the required joules — i.e. the first tier in
 *      `good → better → best` order where
 *        productJoulesLookup(family) >= requiredJoules * SAFETY_FACTORS[tier].
 *   4) If no tier qualifies by joules, return "best" (the strongest
 *      available barrier is still the best call we can make).
 *
 * When `requiredJoules` is null/undefined/0, we have nothing to compare
 * against, so we fall back to "better" as a sensible default (unless the
 * risk level bumps it to "best").
 */
export function recommendTier(
  requiredJoules: number | null | undefined,
  riskLevel: "critical" | "high" | "medium" | "low" | null | undefined,
  ladder: BarrierLadder,
  productJoulesLookup: (familyName: string) => number | null | undefined,
): BarrierTier {
  // 1) Risk-level overrides dominate the joules calculation.
  if (riskLevel === "critical") return "best";
  if (riskLevel === "high") return "better";

  // Without a required joules target there's nothing to compare against;
  // "better" is a safe mid-ladder default.
  if (requiredJoules == null || requiredJoules <= 0) return "better";

  // 3) Walk the ladder weakest → strongest and return the first tier
  //    whose product energy rating meets the required joules with the
  //    tier's safety factor applied.
  for (const tier of TIER_ORDER) {
    const factor = SAFETY_FACTORS[tier];
    const family = ladder.tiers[tier]?.family;
    if (!family) continue;
    const rating = productJoulesLookup(family);
    if (rating == null) continue;
    if (rating >= requiredJoules * factor) {
      return tier;
    }
  }

  // 4) Nothing in the ladder meets the threshold — fall back to "best".
  return "best";
}
