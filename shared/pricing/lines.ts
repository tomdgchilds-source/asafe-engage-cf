/**
 * Cart / order items → `PricingLine[]`.
 *
 * The ONE mapping from what the app stores (`cart_items` rows, the
 * `orders.items` jsonb snapshot, the client's cart response) onto the
 * shape `computeTotals` prices. The Worker (order creation, public share
 * view, order-form PDF) and the client (Cart, OrderForm) all call this so
 * a line can never be priced two different ways.
 *
 * Rules:
 * - Per-metre when `pricingType` is any per-metre spelling the app has
 *   accumulated (`linear_meter`, `per-meter`, `per_meter`, `per_metre`,
 *   …) OR `lengthMeters > 0`. Everything else is per-unit.
 * - Per-metre lines carry metres in `quantity` and AED/m in `unitPrice`
 *   (`cart_items` has no length column). When an item also carries
 *   `lengthMeters > 0` that value IS the metres figure, so it becomes the
 *   line's `quantity`; `lengthMeters` is never forwarded to the
 *   `PricingLine`, otherwise `computeTotals` would multiply by it twice.
 * - `includesDelivery` / `includesInstall` mirror `requiresDelivery` /
 *   `requiresInstallation`. An unflagged line (flag undefined / null —
 *   a legacy `orders.items` snapshot from before the columns existed)
 *   still carries delivery and install; only an explicit `false` opts
 *   out. `cart_items` rows always carry an explicit boolean (column
 *   default false) so this only affects legacy snapshots.
 * - Every line is a product line (`isProduct: true`); service packages
 *   are added separately via `servicePackageAed`.
 * - Accessory sub-lines (`accessoryLines` on a cart row — see
 *   shared/pricing/accessories.ts) become extra per-unit `PricingLine`s
 *   with id `<itemId>:acc:<code>`, priced at `quantity × unitPriceAed`
 *   (null price → 0) and inheriting the parent's delivery / install flags.
 *   They are appended AFTER every parent line so `lines[i]` still matches
 *   `items[i]` for the first `items.length` entries.
 */
import type { PricingLine } from "./computeTotals";
import { round2 } from "./computeTotals";
import { accessoryLineId, normaliseAccessoryLines } from "./accessories";

/**
 * Tolerant view of a cart row / order item. Covers `cart_items`, the
 * `orders.items` snapshot and the client's cart response — anything with
 * a price, a quantity and a pricing type.
 */
export interface CartLikeItem {
  id?: string | number | null;
  /** AED per unit, or AED per metre for per-metre lines. Numeric strings accepted. */
  unitPrice?: string | number | null;
  /** Units, or metres for per-metre lines. Numeric strings accepted. */
  quantity?: string | number | null;
  /** 'linear_meter' | 'standard_item' | 'per_item' | 'per-meter' | 'per-unit' | 'per_meter' | … */
  pricingType?: string | null;
  requiresDelivery?: boolean | null;
  requiresInstallation?: boolean | null;
  /** Run length in metres. When > 0 the line is per-metre and this is its quantity. */
  lengthMeters?: string | number | null;
  /** Priced accessories attached to the line (`AccessoryLine[]`, or a JSON string of one). */
  accessoryLines?: unknown;
  /** Rep-authored line (POST /api/cart/custom). Display only; priced like any other line. */
  isCustom?: boolean | null;
  /** 'price_list' | 'rep_estimate' | 'estimation_team'. Display only. */
  pricingBasis?: string | null;
}

/** Numeric read of a stored money / quantity field; junk → 0. */
function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * Delivery / install flag. A line carries the charge only when the flag is
 * explicitly true (or the string "true"). Undefined / null / false do not.
 * This matches the server's historical behaviour, so legacy order snapshots
 * that predate the flags keep the totals they were issued with.
 */
function carries(flag: unknown): boolean {
  if (flag === true) return true;
  if (typeof flag === "string" && flag.trim().toLowerCase() === "true") return true;
  return false;
}

/** Any of the per-metre spellings the cart has accumulated over time. */
export function isPerMetreType(pricingType: unknown): boolean {
  return /met(er|re)/i.test(String(pricingType ?? ""));
}

/** Per-metre when the type says so or the item carries a positive run length. */
export function isPerMetreItem(item: CartLikeItem | null | undefined): boolean {
  if (!item) return false;
  return isPerMetreType(item.pricingType) || num(item.lengthMeters) > 0;
}

/** The PricingLine id a cart row gets: its own id, else `line-<index>`. */
export function pricingLineId(item: CartLikeItem | null | undefined, index: number): string {
  const id = item?.id;
  return id === undefined || id === null || id === "" ? `line-${index}` : String(id);
}

/**
 * Accessory sub-lines of one cart row as `PricingLine`s. Per-unit, id
 * `<parentId>:acc:<code>`, parent's delivery / install flags, product
 * lines (they sit inside the goods figure and the discount base).
 */
export function accessoryPricingLines(item: CartLikeItem | null | undefined, parentId: string): PricingLine[] {
  const it: CartLikeItem = item ?? {};
  return normaliseAccessoryLines(it.accessoryLines, it).map((acc) => ({
    id: accessoryLineId(parentId, acc.code),
    unitPriceAed: acc.unitPriceAed === null ? 0 : acc.unitPriceAed,
    quantity: acc.quantity,
    pricingType: "per-unit" as const,
    includesDelivery: carries(it.requiresDelivery),
    includesInstall: carries(it.requiresInstallation),
    isProduct: true,
  }));
}

/**
 * Cart rows / `orders.items` snapshot → `PricingLine[]` for computeTotals.
 * Parents first (index-aligned with `items`), then every accessory
 * sub-line in item order.
 */
export function cartItemsToPricingLines(
  items: ReadonlyArray<CartLikeItem | null | undefined> | null | undefined,
): PricingLine[] {
  const rows = items ?? [];
  const parents: PricingLine[] = rows.map((item, i) => {
    const it: CartLikeItem = item ?? {};
    const perMetre = isPerMetreItem(it);
    const metres = num(it.lengthMeters);
    return {
      id: pricingLineId(it, i),
      unitPriceAed: num(it.unitPrice),
      quantity: perMetre && metres > 0 ? metres : num(it.quantity),
      pricingType: perMetre ? "per-meter" : "per-unit",
      includesDelivery: carries(it.requiresDelivery),
      includesInstall: carries(it.requiresInstallation),
      isProduct: true,
    };
  });
  const accessories: PricingLine[] = [];
  rows.forEach((item, i) => {
    accessories.push(...accessoryPricingLines(item, parents[i].id));
  });
  return [...parents, ...accessories];
}

/**
 * Service package cost: a flat % of goods, added after discount and never
 * discounted. `pkgPercent` is the number in front of the "%" on the
 * service-care option (e.g. 5 for "5%").
 */
export function servicePackageAed(goodsAed: number, pkgPercent: number): number {
  const goods = num(goodsAed);
  const pct = num(pkgPercent);
  if (goods <= 0 || pct <= 0) return 0;
  return round2(goods * (pct / 100));
}

/**
 * LinkedIn / social reciprocity is stored as an AED amount (≤ 2,500 and
 * ≤ 1 % of goods). `computeTotals` takes it as a % of goods so it shares
 * the combined ceiling. Not rounded: the AED amount is the promise, and
 * rounding the % to 2 dp would move the deducted AED on large orders.
 */
export function socialDiscountPercent(amountAed: number, goodsAed: number): number {
  const amount = num(amountAed);
  const goods = num(goodsAed);
  if (amount <= 0 || goods <= 0) return 0;
  return (amount / goods) * 100;
}
