/**
 * useBarrierLadders
 *
 * Thin client-side wrapper around the statically-imported `LADDERS`
 * constant from `@/utils/barrierLadders` combined with a React Query
 * fetch of `/api/products?grouped=false&pageSize=300`.
 *
 * The barrier-ladders fixture is bundled with the client (see the sibling
 * module) so we don't hit `/api/barrier-ladders` — that endpoint exists
 * only for server-side consumers and future dynamic ladders. The
 * product-catalogue fetch is the only network call we need to wire up
 * tier families to live price + impactRating values.
 *
 * Shared by `TierSwitcher` (cart line integration) and the Impact
 * Calculator's 3-tier recommendation cards.
 */
import { useQuery } from "@tanstack/react-query";
import {
  LADDERS,
  SAFETY_FACTORS,
  TIER_ORDER,
  type BarrierLadder,
  type BarrierTier,
} from "@/utils/barrierLadders";

/**
 * Minimal product row shape pulled from `/api/products?grouped=false`.
 * Deliberately a loose interface — the endpoint returns the full product
 * record and we only care about a handful of fields for tier resolution.
 */
export interface LadderProductRow {
  id: string;
  name: string;
  category?: string | null;
  subcategory?: string | null;
  price?: string | number | null;
  basePricePerMeter?: string | number | null;
  impactRating?: number | null;
  imageUrl?: string | null;
  heightMin?: number | null;
  heightMax?: number | null;
  // Variants are surfaced when `grouped=false` returns per-variant rows —
  // we still see the parent product fields (name etc.) with a lengthMm
  // attached. Also support a variants array for tolerance.
  lengthMm?: number | null;
  widthMm?: number | null;
  variants?: Array<{
    id?: string;
    name?: string;
    lengthMm?: number | null;
    length_mm?: number | null;
    price?: string | number | null;
    impactRating?: number | null;
  }>;
}

/** Strip "- 1600mm" / "- Yellow" / "- Left Hand" suffixes for matching. */
function normaliseName(raw: string | null | undefined): string {
  if (!raw) return "";
  const dashIdx = raw.indexOf(" - ");
  return (dashIdx >= 0 ? raw.slice(0, dashIdx) : raw).trim().toLowerCase();
}

/**
 * Coerce any pricing shape (string, number, null) into a clean number or
 * null. Hyphenated ranges ("120-180") use the low end — safer UX to
 * display the minimum price when the tier switcher can't pick a variant.
 */
function toPriceNumber(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw);
  if (s.includes("-")) {
    const low = parseFloat(s.split("-")[0]);
    return Number.isFinite(low) ? low : null;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export interface UseBarrierLaddersResult {
  ladders: BarrierLadder[];
  tierOrder: BarrierTier[];
  safetyFactors: Record<BarrierTier, number>;
  products: LadderProductRow[] | undefined;
  isLoading: boolean;
  /** All grouped=false rows whose name (minus suffix) matches the family. */
  findProductsForFamily: (familyName: string) => LadderProductRow[];
  /**
   * Best-effort unit price lookup for a family name.
   * - Uses `price` if present, else `basePricePerMeter`.
   * - Hyphen ranges collapse to the low end.
   * Returns `null` when no product matches or no price is available.
   */
  priceForFamily: (familyName: string) => number | null;
  /** Max impactRating seen across all rows matching this family. */
  joulesForFamily: (familyName: string) => number | null;
  /** First product row matching a family (for hero image / id / etc). */
  heroProductForFamily: (familyName: string) => LadderProductRow | null;
}

export function useBarrierLadders(): UseBarrierLaddersResult {
  const { data: products, isLoading } = useQuery<LadderProductRow[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await fetch(
        "/api/products?grouped=false&pageSize=300",
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to fetch products");
      const data = (await res.json()) as unknown;
      // The endpoint returns either an array or { products: [...] }.
      if (Array.isArray(data)) return data as LadderProductRow[];
      const maybe = data as { products?: LadderProductRow[] };
      return maybe.products ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const findProductsForFamily = (familyName: string): LadderProductRow[] => {
    if (!products || !familyName) return [];
    const needle = normaliseName(familyName);
    return products.filter((p) => normaliseName(p.name) === needle);
  };

  const priceForFamily = (familyName: string): number | null => {
    const rows = findProductsForFamily(familyName);
    if (rows.length === 0) return null;
    // Prefer the lowest flat `price`, falling back to basePricePerMeter
    // for per-metre barriers.
    let best: number | null = null;
    for (const r of rows) {
      const candidate =
        toPriceNumber(r.price) ?? toPriceNumber(r.basePricePerMeter);
      if (candidate != null && (best == null || candidate < best)) {
        best = candidate;
      }
    }
    return best;
  };

  const joulesForFamily = (familyName: string): number | null => {
    const rows = findProductsForFamily(familyName);
    if (rows.length === 0) return null;
    let best: number | null = null;
    for (const r of rows) {
      const j = typeof r.impactRating === "number" ? r.impactRating : null;
      if (j != null && (best == null || j > best)) best = j;
    }
    return best;
  };

  const heroProductForFamily = (familyName: string): LadderProductRow | null => {
    const rows = findProductsForFamily(familyName);
    return rows[0] ?? null;
  };

  return {
    ladders: LADDERS,
    tierOrder: TIER_ORDER,
    safetyFactors: SAFETY_FACTORS,
    products,
    isLoading,
    findProductsForFamily,
    priceForFamily,
    joulesForFamily,
    heroProductForFamily,
  };
}

/**
 * Pick the best variant-like product row for a given target lengthMm.
 * Preference: exact match → smallest length >= target → largest length
 * below target. Returns the row and its picked length in mm.
 *
 * When `rows` are whole-family products (not variants), we still walk
 * through looking at `lengthMm` on the row itself plus any `variants[]`.
 */
export function pickRowForLength(
  rows: LadderProductRow[],
  targetMm: number | null,
): { row: LadderProductRow; lengthMm: number | null } | null {
  if (!rows || rows.length === 0) return null;

  type Candidate = { row: LadderProductRow; lengthMm: number | null };
  const candidates: Candidate[] = [];

  for (const r of rows) {
    const rowLen =
      typeof r.lengthMm === "number" && r.lengthMm > 0 ? r.lengthMm : null;
    if (rowLen != null) candidates.push({ row: r, lengthMm: rowLen });

    if (Array.isArray(r.variants)) {
      for (const v of r.variants) {
        const vl =
          typeof v.lengthMm === "number"
            ? v.lengthMm
            : typeof v.length_mm === "number"
              ? v.length_mm
              : null;
        if (vl != null && vl > 0) {
          // Build a synthetic row carrying the variant's length + price
          // so downstream code can read it uniformly.
          candidates.push({
            row: {
              ...r,
              name: v.name ?? r.name,
              price: v.price ?? r.price,
              impactRating: v.impactRating ?? r.impactRating,
              lengthMm: vl,
            },
            lengthMm: vl,
          });
        }
      }
    }

    if (rowLen == null && !Array.isArray(r.variants)) {
      // Non-lengthed row — still useful as a fall-through candidate.
      candidates.push({ row: r, lengthMm: null });
    }
  }

  if (candidates.length === 0) return null;
  if (targetMm == null || targetMm <= 0) {
    // No target — return the first lengthed candidate, else the first.
    const lengthed = candidates.find((c) => c.lengthMm != null);
    return lengthed ?? candidates[0];
  }

  // Exact match wins.
  const exact = candidates.find((c) => c.lengthMm === targetMm);
  if (exact) return exact;

  // Round up preferably — smallest length >= target.
  const above = candidates
    .filter((c) => c.lengthMm != null && c.lengthMm >= targetMm)
    .sort((a, b) => (a.lengthMm! - b.lengthMm!));
  if (above.length > 0) return above[0];

  // Else closest below (largest length < target).
  const below = candidates
    .filter((c) => c.lengthMm != null && c.lengthMm < targetMm)
    .sort((a, b) => (b.lengthMm! - a.lengthMm!));
  if (below.length > 0) return below[0];

  return candidates[0];
}
