/**
 * Order money helpers for the Worker.
 *
 * Every stored figure is AED. An order carries `currency` (what the rep
 * chose) and `fxRateAtOrder` (AED → currency multiplier captured when the
 * order was created) so every downstream consumer — emails, the public
 * share view, PDFs — converts the same way and the number never drifts
 * after the fact.
 */
/** Same table `GET /api/currency/rates` falls back to. AED → X multipliers. */
export const FALLBACK_FX_RATES: Record<string, number> = {
  AED: 1,
  SAR: 1.02,
  GBP: 0.22,
  USD: 0.27,
  EUR: 0.25,
};

const FX_SOURCE_URL = "https://api.exchangerate-api.com/v4/latest/AED";

/** Live AED → X table; throws on any network / shape problem. */
export async function fetchFxTable(): Promise<Record<string, number>> {
  const res = await fetch(FX_SOURCE_URL);
  if (!res.ok) throw new Error(`fx http ${res.status}`);
  const data = (await res.json()) as { rates?: Record<string, number> };
  if (!data || typeof data.rates !== "object" || data.rates === null) {
    throw new Error("fx payload missing rates");
  }
  return data.rates;
}

/**
 * AED → `currency` multiplier to freeze onto the order. AED is always 1.
 * Falls back to FALLBACK_FX_RATES when the live source fails, and to 1 for
 * a currency nobody knows so the stored total is at least AED-correct.
 */
export async function resolveFxRate(
  currency: string | null | undefined,
  fetchTable: () => Promise<Record<string, number>> = fetchFxTable,
): Promise<number> {
  const code = (currency || "AED").toUpperCase();
  if (code === "AED") return 1;
  let live: Record<string, number> | null = null;
  try {
    live = await fetchTable();
  } catch {
    live = null;
  }
  const candidate = live?.[code] ?? FALLBACK_FX_RATES[code];
  return typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0
    ? candidate
    : 1;
}

/** Safe numeric read of a stored rate. AED is always 1; junk is 1. */
export function fxRateOrOne(currency: string | null | undefined, rate: unknown): number {
  if ((currency || "AED").toUpperCase() === "AED") return 1;
  const n = typeof rate === "string" ? parseFloat(rate) : (rate as number);
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * `formatMoney(aed, currency, fxRateAtOrder)` → "GBP 1,234.56".
 * The AED figure is converted through the frozen rate, never re-fetched.
 */
export function formatMoney(
  aed: number,
  currency: string | null | undefined,
  fxRate: unknown,
): string {
  const code = (currency || "AED").toUpperCase();
  const amount = Number.isFinite(aed) ? aed * fxRateOrOne(code, fxRate) : 0;
  return `${code} ${amount.toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Cart rows / `orders.items` snapshot → `PricingLine[]` for computeTotals.
 *
 * The mapping lives in `shared/pricing/lines.ts` (`cartItemsToPricingLines`)
 * so the Worker and the client price a line identically. Re-exported under
 * the Worker's historical name for `worker/routes/orderForm.ts`.
 */
export { cartItemsToPricingLines as orderItemsToPricingLines } from "../../shared/pricing";
