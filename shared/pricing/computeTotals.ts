/**
 * The ONE place order money is computed.
 *
 * Imported by the Worker (order creation, order-form PDF, quote promotion)
 * and the client (Cart, OrderForm) so the two can never drift again.
 *
 * Every figure is AED and rounded to 2 dp with `round2` (never `toFixed`).
 * Discount caps come from `shared/discountLimits.ts` and are not restated
 * here.
 */
import { COMBINED_DISCOUNT_CEILING, getCombinedDiscount } from "../discountLimits";

export type Complexity = "simple" | "normal" | "complex";

export interface PricingLine {
  id: string;
  /** AED per unit (per-unit lines) or AED per metre (per-metre lines). */
  unitPriceAed: number;
  /** Units, or number of runs for per-metre lines. */
  quantity: number;
  /** Run length in metres for per-metre lines. Ignored for per-unit lines. */
  lengthMeters?: number;
  pricingType: "per-unit" | "per-meter";
  /** Line carries the delivery charge. Default true. */
  includesDelivery?: boolean;
  /** Line carries the installation charge. Default true. */
  includesInstall?: boolean;
  /**
   * false for service / accessory lines. Non-product lines still count
   * toward goods but are excluded from the discount base. Default true.
   */
  isProduct?: boolean;
}

export interface PricingInput {
  lines: PricingLine[];
  complexity: Complexity;
  /** Sum of the reciprocal commitments the customer selected (raw, uncapped). */
  reciprocalDiscountPercent: number;
  /** Raw partner-code % (clamped to PARTNER_DISCOUNT_CAP inside). */
  partnerDiscountPercent: number;
  /** LinkedIn / social reciprocity, as a % of goods. Stacks on top of the
   *  reciprocal + partner result; the COMBINED_DISCOUNT_CEILING still holds. */
  socialDiscountPercent: number;
  /** Flat AED, added after discount, never discounted. */
  servicePackageAed?: number;
  /** Default 0 (budgetary). Pass 5 for UAE VAT when requested. */
  vatPercent?: number;
}

export interface PricingResult {
  goodsAed: number;
  /** DELIVERY_RATE × goods carrying delivery. */
  deliveryAed: number;
  /** INSTALL_RATES[complexity] × goods carrying install. */
  installAed: number;
  /** Final % after every cap in discountLimits. */
  discountPercentApplied: number;
  /** discountPercentApplied × product goods only. */
  discountAed: number;
  servicePackageAed: number;
  /** goods − discount + delivery + install + service. */
  subtotalAed: number;
  vatAed: number;
  totalAed: number;
  lines: Array<{ id: string; lineTotalAed: number }>;
}

/** 9.6271916 % of goods carrying delivery. */
export const DELIVERY_RATE = 0.096271916;

/** Installation as a fraction of goods carrying install, by complexity. */
export const INSTALL_RATES: Record<Complexity, number> = {
  simple: 0.1148264, // 11.48264 %
  normal: 0.1938872, // 19.38872 %
  complex: 0.26289773, // 26.289773 %
};

/** Round to 2 dp. Money must go through this, never `toFixed`. */
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Non-finite or negative → 0. */
function nonNeg(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Accepts whatever the DB / UI stores for installation complexity
 * ("standard" is the legacy label for "normal") and returns a Complexity.
 * Unknown or missing → "normal", matching the historical default.
 */
export function normaliseComplexity(value: string | null | undefined): Complexity {
  const v = (value ?? "").toString().trim().toLowerCase();
  if (v === "simple") return "simple";
  if (v === "complex") return "complex";
  return "normal";
}

/** Line total, rounded once after multiplying. */
export function lineTotalAed(line: PricingLine): number {
  const unit = nonNeg(line.unitPriceAed);
  const qty = nonNeg(line.quantity);
  const length = line.pricingType === "per-meter" ? nonNeg(line.lengthMeters ?? 1) || 0 : 1;
  return round2(unit * qty * length);
}

export function computeTotals(input: PricingInput): PricingResult {
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const rate = INSTALL_RATES[input.complexity] ?? INSTALL_RATES.normal;

  const perLine: Array<{ id: string; lineTotalAed: number }> = [];
  let goods = 0;
  let discountBase = 0;
  let deliveryBase = 0;
  let installBase = 0;

  for (const line of lines) {
    const total = lineTotalAed(line);
    perLine.push({ id: line.id, lineTotalAed: total });
    goods = round2(goods + total);
    if (line.isProduct !== false) discountBase = round2(discountBase + total);
    if (line.includesDelivery !== false) deliveryBase = round2(deliveryBase + total);
    if (line.includesInstall !== false) installBase = round2(installBase + total);
  }

  const deliveryAed = round2(deliveryBase * DELIVERY_RATE);
  const installAed = round2(installBase * rate);

  // Caps: tiered reciprocal (25–30 % by AED goods), partner ≤ 15 %, and the
  // 40 % combined ceiling with partner shaved first — all in discountLimits.
  const combined = getCombinedDiscount(
    nonNeg(input.reciprocalDiscountPercent),
    nonNeg(input.partnerDiscountPercent),
    goods,
  );
  const discountPercentApplied = Math.min(
    combined.combined + nonNeg(input.socialDiscountPercent),
    COMBINED_DISCOUNT_CEILING,
  );
  const discountAed = round2(discountBase * (discountPercentApplied / 100));

  const servicePackageAed = round2(nonNeg(input.servicePackageAed));
  const subtotalAed = round2(goods - discountAed + deliveryAed + installAed + servicePackageAed);
  const vatAed = round2(subtotalAed * (nonNeg(input.vatPercent) / 100));
  const totalAed = round2(subtotalAed + vatAed);

  return {
    goodsAed: goods,
    deliveryAed,
    installAed,
    discountPercentApplied,
    discountAed,
    servicePackageAed,
    subtotalAed,
    vatAed,
    totalAed,
    lines: perLine,
  };
}
