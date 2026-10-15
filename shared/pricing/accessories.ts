/**
 * Accessory sub-lines: quantity defaults, normalisation and totals.
 *
 * An accessory attached to a cart line (`cart_items.accessory_lines`) is
 * priced at `quantity × unitPriceAed`. An unpriced accessory (null price,
 * `priceToConfirm: true`) prices at 0 and is flagged so documents print
 * "TBC" and exclude it from the total. `cartItemsToPricingLines`
 * (./lines.ts) turns every accessory line into an extra `PricingLine`, so
 * computeTotals is still the only place money is added up.
 */
import type { AccessoryLine, AccessoryUnit } from "../cartAccessories";
import { ACCESSORY_UNITS } from "../cartAccessories";
import { round2 } from "./computeTotals";
import type { CartLikeItem } from "./lines";
import { isPerMetreItem } from "./lines";

/** Nominal post pitch for barrier runs (metres). Posts = ceil(L / pitch) + 1. */
export const POST_PITCH_METRES = 2.2;

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** Posts needed for a run: `ceil(lengthMetres / 2.2) + 1`; 0 for no length. */
export function postCountForMetres(lengthMetres: number): number {
  const m = num(lengthMetres);
  if (m <= 0) return 0;
  return Math.ceil(m / POST_PITCH_METRES) + 1;
}

/** Metres of a per-metre item (`lengthMeters` wins over `quantity`), else 0. */
function metresOf(item: CartLikeItem | null | undefined): number {
  if (!item || !isPerMetreItem(item)) return 0;
  const length = num(item.lengthMeters);
  return length > 0 ? length : num(item.quantity);
}

/**
 * Default quantity for an accessory on a cart line when the rep has not
 * typed one:
 * - `per_post`: post count of a per-metre run; the item quantity otherwise
 *   (one post per bollard / guard).
 * - `per_metre`: run metres; the item quantity for per-unit lines.
 * - `each` / `per_pair`: the item quantity for per-unit lines, 1 for runs.
 * Never below 1 so a saved line is always priceable.
 */
export function defaultAccessoryQuantity(unit: AccessoryUnit, item: CartLikeItem | null | undefined): number {
  const perMetre = isPerMetreItem(item);
  const metres = metresOf(item);
  const units = Math.max(0, num(item?.quantity));
  let q: number;
  switch (unit) {
    case "per_post":
      q = perMetre ? postCountForMetres(metres) : units;
      break;
    case "per_metre":
      q = perMetre ? metres : units;
      break;
    case "each":
    case "per_pair":
    default:
      q = perMetre ? 1 : units;
      break;
  }
  return q > 0 ? q : 1;
}

export function isAccessoryUnit(v: unknown): v is AccessoryUnit {
  return typeof v === "string" && (ACCESSORY_UNITS as string[]).includes(v);
}

/**
 * Coerce one stored / posted accessory line into the canonical shape.
 * Returns null when there is no usable code. A missing or non-positive
 * quantity falls back to `defaultAccessoryQuantity`. A null / junk price
 * becomes `null` + `priceToConfirm: true`; a numeric price keeps the flag
 * the caller set (so an admin can mark a priced row "to confirm").
 */
export function normaliseAccessoryLine(raw: unknown, item: CartLikeItem | null | undefined): AccessoryLine | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const code = typeof r.code === "string" ? r.code.trim() : "";
  if (!code) return null;
  const unit: AccessoryUnit = isAccessoryUnit(r.unit) ? r.unit : "each";
  const qtyRaw = num(r.quantity);
  const quantity = qtyRaw > 0 ? qtyRaw : defaultAccessoryQuantity(unit, item);
  const priceRaw = r.unitPriceAed;
  const price =
    priceRaw === null || priceRaw === undefined || priceRaw === ""
      ? null
      : typeof priceRaw === "number" || typeof priceRaw === "string"
        ? num(priceRaw)
        : null;
  const unitPriceAed = price !== null && price >= 0 ? round2(price) : null;
  return {
    code,
    label: typeof r.label === "string" && r.label.trim() ? r.label.trim() : code,
    unit,
    quantity,
    unitPriceAed,
    priceToConfirm: unitPriceAed === null ? true : r.priceToConfirm === true,
  };
}

/** Tolerant array read of `cart_items.accessory_lines` (array, JSON string, or junk → []). */
export function normaliseAccessoryLines(raw: unknown, item: CartLikeItem | null | undefined): AccessoryLine[] {
  let arr: unknown = raw;
  if (typeof arr === "string") {
    try {
      arr = JSON.parse(arr);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: AccessoryLine[] = [];
  for (const entry of arr) {
    const line = normaliseAccessoryLine(entry, item);
    if (line) out.push(line);
  }
  return out;
}

/** `quantity × unitPriceAed`, 2 dp; 0 when the price is null. */
export function accessoryLineTotalAed(line: Pick<AccessoryLine, "quantity" | "unitPriceAed">): number {
  const qty = num(line.quantity);
  const unit = line.unitPriceAed === null ? 0 : num(line.unitPriceAed);
  if (qty <= 0 || unit <= 0) return 0;
  return round2(qty * unit);
}

/** Sum of the priced accessory lines (unpriced lines add 0). */
export function accessoryLinesTotalAed(lines: ReadonlyArray<Pick<AccessoryLine, "quantity" | "unitPriceAed">> | null | undefined): number {
  let total = 0;
  for (const l of lines ?? []) total = round2(total + accessoryLineTotalAed(l));
  return total;
}

/** True when any line is still waiting for a price. */
export function hasPriceToConfirm(lines: ReadonlyArray<Pick<AccessoryLine, "priceToConfirm" | "unitPriceAed">> | null | undefined): boolean {
  return (lines ?? []).some((l) => l.priceToConfirm || l.unitPriceAed === null);
}

/** `<itemId>:acc:<code>` — the PricingLine id of an accessory sub-line. */
export function accessoryLineId(parentId: string, code: string): string {
  return `${parentId}:acc:${code}`;
}

/** Split an accessory PricingLine id back into its parent id and code; null for a parent line. */
export function parseAccessoryLineId(id: string): { parentId: string; code: string } | null {
  const i = id.indexOf(":acc:");
  if (i <= 0) return null;
  return { parentId: id.slice(0, i), code: id.slice(i + 5) };
}
