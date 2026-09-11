/**
 * Length-segmented pricing plan for one-piece-per-nominal-length families
 * (Rack End Barrier, Step Guard, ForkGuard, HD ForkGuard).
 *
 * These products ship as ONE barrier per nominal length (900, 1100, 2000,
 * 2400 mm, ...). The old behaviour greedily filled the run with several
 * barriers, so a 2.5 m request became 1× 2400 + 1× 900 and the price
 * doubled at the boundary (Mohammed Bassil, 5 May feedback: doubling at
 * 2.5 m, identical price at 2.6 m). Reps do not buy two barriers to make
 * up 100 mm; they fit one and pay an extension at the linear-metre rate.
 *
 * Rule:
 *   - target ≤ longest variant: pick the smallest variant whose nominal
 *     length ≥ target (or the smallest variant if the target is below
 *     every variant). Price is that variant's unit price.
 *   - target > longest variant: the longest variant is the base piece and
 *     the overflow is charged per metre at
 *     `extensionRatePerM = longest.priceAed / (longest.lengthMm / 1000)`.
 *
 * Pure function. Used by the client quote builder and by the server when it
 * prices a per-length line, so the two agree.
 */

export interface LengthVariant {
  sku: string;
  lengthMm: number;
  priceAed: number;
}

export interface LengthPlan {
  basePiece: LengthVariant;
  /** Overflow beyond the base piece, in mm. 0 when a single piece covers it. */
  extensionMm: number;
  /** AED per metre for the overflow, derived from the longest variant. */
  extensionRatePerM: number;
  /** extensionMm / 1000 × extensionRatePerM, 2 dp. */
  extensionChargeAed: number;
  /** basePiece.priceAed + extensionChargeAed, 2 dp. */
  totalPrice: number;
  /** The target the plan was built for, in mm. */
  requestedMm: number;
  /** e.g. "1 × 2400 mm" or "1 × 2400 mm + 0.10 m extension @ 1000.00 AED/m". */
  label: string;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Returns null when there is no usable variant (positive length AND price)
 * or the target is not a positive finite number of millimetres.
 */
export function planLength(variants: LengthVariant[], targetMm: number): LengthPlan | null {
  const requestedMm = Math.round(Number(targetMm));
  if (!Number.isFinite(requestedMm) || requestedMm <= 0) return null;

  const usable = (variants ?? [])
    .map((v) => ({ sku: v.sku, lengthMm: Number(v.lengthMm), priceAed: Number(v.priceAed) }))
    .filter((v) => Number.isFinite(v.lengthMm) && v.lengthMm > 0 && Number.isFinite(v.priceAed) && v.priceAed > 0)
    .sort((a, b) => a.lengthMm - b.lengthMm);
  if (!usable.length) return null;

  const longest = usable[usable.length - 1];
  let basePiece: LengthVariant;
  let extensionMm = 0;
  if (requestedMm <= longest.lengthMm) {
    basePiece = usable.find((v) => v.lengthMm >= requestedMm) ?? usable[0];
  } else {
    basePiece = longest;
    extensionMm = requestedMm - longest.lengthMm;
  }

  const extensionRatePerM = round2(longest.priceAed / (longest.lengthMm / 1000));
  const extensionChargeAed = round2((extensionMm / 1000) * extensionRatePerM);
  const totalPrice = round2(basePiece.priceAed + extensionChargeAed);

  const label =
    extensionMm > 0
      ? `1 × ${basePiece.lengthMm} mm + ${(extensionMm / 1000).toFixed(2)} m extension @ ${extensionRatePerM.toFixed(2)} AED/m`
      : `1 × ${basePiece.lengthMm} mm`;

  return {
    basePiece: { ...basePiece },
    extensionMm,
    extensionRatePerM,
    extensionChargeAed,
    totalPrice,
    requestedMm,
    label,
  };
}
