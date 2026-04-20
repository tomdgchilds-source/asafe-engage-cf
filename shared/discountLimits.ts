/**
 * Reciprocal-discount cap policy.
 *
 * Policy (GCC-tuned):
 * - The cap scales with order subtotal so small orders can't torch margin,
 *   while genuinely strategic deals can show the "big discount" headline
 *   GCC buyers expect.
 * - All thresholds are expressed in the **base currency (AED)**. Callers that
 *   operate in GBP / SAR / USD must convert subtotal → AED before evaluating.
 *
 * This helper is imported by BOTH the client (DiscountModal, OrderForm) and
 * the Cloudflare Worker (GET /api/discount-limit) so the two can't drift.
 */

export interface DiscountTier {
  /** Minimum subtotal (AED) for this tier to apply. */
  min: number;
  /** Maximum cap in % that the sum of selected reciprocal options may reach. */
  cap: number;
  /** Human-readable tier label for UI badges. */
  label: string;
  /** Short sales-facing rationale for why this tier exists. */
  rationale: string;
}

/**
 * Tiers in ascending subtotal order. Evaluation picks the LAST tier whose
 * `min` is less than or equal to the order's AED subtotal.
 */
export const DISCOUNT_TIERS: DiscountTier[] = [
  {
    min: 0,
    cap: 25,
    label: "Standard",
    rationale: "Baseline cap — GCC buyers expect a headline 25% without shaving early-deal margin.",
  },
  {
    min: 100_000,
    cap: 27,
    label: "Silver",
    rationale: "Mid-market orders (AED 100k–500k) unlock an extra 2 pts once the deal size supports it.",
  },
  {
    min: 500_000,
    cap: 28,
    label: "Gold",
    rationale: "Large orders (AED 500k–2m) qualify for Flagship Showcase and another point.",
  },
  {
    min: 2_000_000,
    cap: 30,
    label: "Platinum",
    rationale: "Strategic deals (> AED 2m) warrant the full 30% to close exclusivity + flagship together.",
  },
];

/**
 * Absolute ceiling regardless of tier. Lets us add future tiers without
 * hunting every hard-coded `30` in the codebase.
 */
export const HARD_DISCOUNT_CEILING = 30;

/**
 * Lifetime / rolling 12-month cap across all orders for a single customer.
 * (Not enforced here — this is the policy the enforcement layer should use.)
 */
export const LIFETIME_12MO_CEILING = 35;

/**
 * Partner-code discount cap. Partner codes in the database may be issued up
 * to 35%, but policy says the amount applied to any single order is clamped
 * to 15% — this keeps a misconfigured / leaked code from torching margin
 * before an admin notices. The 35% in the code record stays as the
 * negotiated headline rate with the partner; this ceiling is the
 * server-/client-side safety net.
 */
export const PARTNER_DISCOUNT_CAP = 15;

/**
 * Hard ceiling on the sum of reciprocal + partner discount applied to a
 * single order. Reciprocal alone is size-tiered (see DISCOUNT_TIERS, 25–30%)
 * and partner alone is capped at PARTNER_DISCOUNT_CAP — but when both
 * stack the combined total is still clamped to this number so the blended
 * headline never crosses the line that requires exec sign-off.
 */
export const COMBINED_DISCOUNT_CEILING = 40;

/**
 * Per-user rate-limit window for partner-code redemptions.
 * Both the "same code once per window" rule and the "total redemptions per
 * window" rule use the same rolling window so the UX stays predictable.
 */
export const PER_USER_SAME_CODE_WINDOW_MONTHS = 12;

/**
 * Maximum number of *any* partner-code redemptions a single user may make
 * inside the rolling PER_USER_SAME_CODE_WINDOW_MONTHS window. Prevents a
 * single user from farming every partner code in circulation.
 */
export const PER_USER_TOTAL_REDEMPTIONS_PER_WINDOW = 4;

/**
 * Compute the discount percentages that should actually apply to an order,
 * given the *raw* reciprocal total the user selected, the *raw* partner %
 * from the partner-code record, and the AED subtotal.
 *
 * All three caps are enforced here so callers (OrderForm, Cart, worker
 * order creation) can't drift:
 *  - reciprocal is clamped to `getDiscountCap(subtotal)` (tiered 25–30%)
 *  - partner is clamped to `PARTNER_DISCOUNT_CAP` (flat 15%)
 *  - the sum of the two post-clamp values is clamped to
 *    `COMBINED_DISCOUNT_CEILING` (40%), proportionally reducing the
 *    partner component first — partner is the "extra" on top of the
 *    negotiated reciprocal rate, so if we have to shave, we shave it.
 */
export function getCombinedDiscount(
  reciprocalPct: number,
  partnerPct: number,
  subtotalAed: number,
): { reciprocal: number; partner: number; combined: number } {
  const safeRecip = Number.isFinite(reciprocalPct) && reciprocalPct > 0 ? reciprocalPct : 0;
  const safePartner = Number.isFinite(partnerPct) && partnerPct > 0 ? partnerPct : 0;

  const reciprocalCapped = Math.min(safeRecip, getDiscountCap(subtotalAed));
  const partnerCapped = Math.min(safePartner, PARTNER_DISCOUNT_CAP);

  const rawCombined = reciprocalCapped + partnerCapped;
  if (rawCombined <= COMBINED_DISCOUNT_CEILING) {
    return {
      reciprocal: reciprocalCapped,
      partner: partnerCapped,
      combined: rawCombined,
    };
  }

  // Shave from the partner component first — reciprocal is the negotiated
  // baseline the customer "earned", partner is the bonus. If the bonus
  // can't fully stack, it's the thing that shrinks.
  const allowedPartner = Math.max(0, COMBINED_DISCOUNT_CEILING - reciprocalCapped);
  return {
    reciprocal: reciprocalCapped,
    partner: allowedPartner,
    combined: reciprocalCapped + allowedPartner,
  };
}

/**
 * Pick the tier that applies to the given AED subtotal.
 */
export function getDiscountTier(subtotalAed: number): DiscountTier {
  // Defensive: if subtotal is invalid, return the lowest tier.
  const safe = Number.isFinite(subtotalAed) && subtotalAed > 0 ? subtotalAed : 0;
  let chosen = DISCOUNT_TIERS[0];
  for (const t of DISCOUNT_TIERS) {
    if (safe >= t.min) chosen = t;
  }
  return chosen;
}

/**
 * Convenience: just the cap % for the given AED subtotal.
 */
export function getDiscountCap(subtotalAed: number): number {
  return getDiscountTier(subtotalAed).cap;
}

/**
 * Next tier-unlock amount (in AED) — used by the UI to nudge users toward a
 * bigger order with a "spend X more to unlock Y% extra" banner.
 * Returns null if already on the top tier.
 */
export function getNextTierUnlock(subtotalAed: number): {
  amountToNext: number;
  nextTier: DiscountTier;
} | null {
  const current = getDiscountTier(subtotalAed);
  const idx = DISCOUNT_TIERS.findIndex((t) => t.label === current.label);
  if (idx < 0 || idx >= DISCOUNT_TIERS.length - 1) return null;
  const next = DISCOUNT_TIERS[idx + 1];
  return { amountToNext: Math.max(0, next.min - subtotalAed), nextTier: next };
}
