import { getPriceDisplay, extractPricingData } from "@shared/pricingUtils";
import { formatHeightMm } from "@shared/productOptions";

// "1.2 m" / "2 m" / "835 mm" for the picker and summary line. One formatter
// for the server's `optionLabel` and the client's height-only fallback.
export { formatHeightMm };

// ---------------------------------------------------------------------------
// Height-variant detection.
//
// Sales feedback (Shahla, 5 May): bollards were listed once per height
// ("iFlex 190 Bollard - 2m" next to "iFlex 190 Bollard - 1.2m"). The server
// already folds them into one family (worker/routes/products.options.ts,
// resolveBollardGroupKey); these helpers decide whether that family's
// variants differ ONLY by height so the card can offer a height picker
// instead of the generic "N variants" badge.
//
// A height is read from, in order:
//   1. a trailing "<n> m" / "<n> mm" token in the name ("- 2m", "1200mm"),
//   2. the schema `heightMin` / `heightMax` columns when they describe a
//      single height (equal, or only one set).
// ---------------------------------------------------------------------------

export interface HeightVariantLike {
  id: string;
  name: string;
  heightMin?: number | null;
  heightMax?: number | null;
}

export interface HeightVariant<T extends HeightVariantLike> {
  product: T;
  heightMm: number;
}

// Matches "2m", "1.2 m", "1200mm", "1500 mm". The trailing \b stops the
// `m` alternative from swallowing the first letter of "mm", and keeps
// "190 Bollard" (no unit) from matching.
const HEIGHT_TOKEN_RE = /(\d+(?:\.\d+)?)\s*(mm|m)\b/gi;

/** Height in mm parsed from the product name, or null when absent. */
export function parseHeightMmFromName(name: string): number | null {
  const matches = Array.from(name.matchAll(HEIGHT_TOKEN_RE));
  if (matches.length === 0) return null;
  // The height is a suffix ("iFlex 190 Bollard - 2m"), so take the last token.
  const [, value, unit] = matches[matches.length - 1];
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return unit.toLowerCase() === "m" ? Math.round(n * 1000) : Math.round(n);
}

/** Single height (mm) for one variant, or null when it can't be determined. */
export function getVariantHeightMm(p: HeightVariantLike): number | null {
  const fromName = parseHeightMmFromName(p.name ?? "");
  if (fromName) return fromName;
  const min = p.heightMin ?? null;
  const max = p.heightMax ?? null;
  if (max && (min === null || min === max)) return max;
  if (min && max === null) return min;
  return null;
}

/** Name with the height token (and its separator) removed, normalised for comparison. */
export function stripHeightFromName(name: string): string {
  return name
    .replace(/\s*[-–—,]?\s*\d+(?:\.\d+)?\s*(mm|m)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Returns the variants sorted by height when every variant has a distinct
 * height and the names differ only by that height; otherwise null.
 */
export function getHeightVariants<T extends HeightVariantLike>(
  variants: T[] | undefined,
): HeightVariant<T>[] | null {
  if (!variants || variants.length < 2) return null;
  const resolved: HeightVariant<T>[] = [];
  for (const v of variants) {
    const heightMm = getVariantHeightMm(v);
    if (!heightMm) return null;
    resolved.push({ product: v, heightMm });
  }
  const heights = new Set(resolved.map((r) => r.heightMm));
  if (heights.size !== resolved.length) return null;
  const baseNames = new Set(resolved.map((r) => stripHeightFromName(r.product.name ?? "")));
  if (baseNames.size !== 1) return null;
  return resolved.sort((a, b) => a.heightMm - b.heightMm);
}

// ---------------------------------------------------------------------------
// Option picker.
//
// Owner feedback (Tom): "bollard heights do require separate pricing for
// 1.2 m". The grouped API gives every card an `options` list
// (shared/productOptions.ts): one entry per priced sub-size of its rows,
// each with its own SKU and exact price (iFlex 190 Bollard: 835 mm Yellow,
// 1.2 m Yellow, 1.2 m Grey, 1.2 m 210 OD Yellow, 1.2 m 210 OD Grey, 2 m).
// When those options are described by a height, a diameter or a colour, the
// card offers ONE labelled Select over them. Cards the server could only
// label by name keep the generic "N variants" presentation, and height-only
// families without server options still get the picker through
// getHeightVariants.
// ---------------------------------------------------------------------------

export interface OptionVariantLike extends HeightVariantLike {
  price?: string | number | null;
}

/** One entry of a card's `options`, as the grouped API returns it. */
export interface ServerOption {
  id: string;
  optionLabel: string;
  heightMm: number | null;
  odMm: number | null;
  colour: string | null;
  sku: string | null;
  priceAed: number | null;
  /** Listing id of the product row this option belongs to. */
  parentId: string | null;
  parentProductId?: string | null;
  parentName: string;
  /** The row's own sub-size; null when the option is the whole row. */
  subVariant: Record<string, unknown> | null;
}

export interface ProductOption<T extends OptionVariantLike> {
  /** Unique within the card; the Select's value. */
  id: string;
  /** The product row handed to the cart / details for this option. */
  product: T;
  /** "1.2 m · Yellow" / "1.2 m · 210 OD · Grey" / "2 m". */
  label: string;
  heightMm: number | null;
  odMm: number | null;
  colour: string | null;
  /** Price of this option; 0 when it has none. */
  price: number;
  /** True only for a whole-row option whose row spans prices; never for a sub-size. */
  priceIsFrom: boolean;
  isPerMeter: boolean;
  /** SKU of the row's sub-size this option stands for; null = the whole row. */
  subVariantSku: string | null;
  /** That sub-size as stored on the row (name, height, OD, price). */
  subVariant: Record<string, unknown> | null;
}

export interface ProductOptionSet<T extends OptionVariantLike> {
  /** Label of the Select: "Height", "Colour", "Size / colour", "Option", … */
  axisLabel: string;
  /** True when the options differ by height and nothing else. */
  heightOnly: boolean;
  /** Server order (height, OD, colour), or height then price for the fallback. */
  options: ProductOption<T>[];
  /** Id of the lowest-priced option: the default selection. */
  defaultId: string;
}

function axisLabelFor(options: Array<{ heightMm: number | null; odMm: number | null; colour: string | null }>) {
  const height = new Set(options.map((o) => o.heightMm)).size > 1;
  // An option with no OD recorded (the 2 m bollard) is not a different diameter.
  const od = new Set(options.map((o) => o.odMm).filter((n) => n !== null)).size > 1;
  const colour = new Set(options.map((o) => o.colour)).size > 1;
  const size = height && od ? "Size" : height ? "Height" : od ? "Diameter" : null;
  const axisLabel = size && colour ? `${size} / colour` : size ?? (colour ? "Colour" : "Option");
  return { axisLabel, heightOnly: height && !od && !colour };
}

/**
 * The options of one family, or null when it should keep the generic
 * "N variants" presentation.
 *
 * `serverOptions` is the card's `options` from the grouped API. It is used
 * when there are at least two, each is described by a height, a diameter or
 * a colour, and each points at one of `variants`.
 */
export function getProductOptions<T extends OptionVariantLike>(
  variants: T[] | undefined,
  serverOptions?: ServerOption[] | null,
): ProductOptionSet<T> | null {
  if (!variants || variants.length === 0) return null;

  let options: ProductOption<T>[] | null = null;

  if (Array.isArray(serverOptions) && serverOptions.length >= 2) {
    const byId = new Map(variants.map((v) => [v.id, v] as const));
    const usable =
      serverOptions.every(
        (o) =>
          o &&
          typeof o.id === "string" &&
          typeof o.optionLabel === "string" &&
          o.optionLabel.trim() !== "" &&
          (o.heightMm != null || o.odMm != null || (o.colour != null && o.colour !== "")) &&
          o.parentId != null &&
          byId.has(o.parentId),
      ) &&
      new Set(serverOptions.map((o) => o.id)).size === serverOptions.length &&
      new Set(serverOptions.map((o) => o.optionLabel)).size === serverOptions.length;
    if (usable) {
      options = serverOptions.map((o) => {
        const product = byId.get(o.parentId as string) as T;
        const base = {
          id: o.id,
          product,
          label: o.optionLabel,
          heightMm: o.heightMm ?? null,
          odMm: o.odMm ?? null,
          colour: o.colour || null,
        };
        if (o.subVariant && o.sku) {
          // A sub-size has one exact price of its own.
          return { ...base, price: Number(o.priceAed) > 0 ? Number(o.priceAed) : 0, priceIsFrom: false, isPerMeter: false, subVariantSku: o.sku, subVariant: o.subVariant };
        }
        return { ...base, ...rowPrice(product), subVariantSku: null, subVariant: null };
      });
    }
  }

  if (!options) {
    const heights = getHeightVariants(variants);
    if (!heights) return null;
    options = heights.map((h) => ({
      id: h.product.id,
      product: h.product,
      label: formatHeightMm(h.heightMm),
      heightMm: h.heightMm,
      odMm: null,
      colour: null,
      ...rowPrice(h.product),
      subVariantSku: null,
      subVariant: null,
    }));
    const last = Number.MAX_SAFE_INTEGER;
    options.sort(
      (a, b) =>
        (a.heightMm ?? last) - (b.heightMm ?? last) ||
        (a.price > 0 ? a.price : last) - (b.price > 0 ? b.price : last) ||
        a.label.localeCompare(b.label),
    );
  }

  const priced = options.filter((o) => o.price > 0);
  const cheapest = priced.length > 0 ? priced.reduce((m, o) => (o.price < m.price ? o : m)) : options[0];

  return { ...axisLabelFor(options), options, defaultId: cheapest.id };
}

/** Price of a whole product row as the catalogue displays it (lowest, and whether it spans). */
function rowPrice(product: OptionVariantLike): { price: number; priceIsFrom: boolean; isPerMeter: boolean } {
  const display = getPriceDisplay(product, extractPricingData(product));
  const own = parseFloat(String(product.price ?? "0")) || 0;
  const min = display.minPrice && display.minPrice > 0 ? display.minPrice : own;
  const max = display.maxPrice && display.maxPrice > 0 ? display.maxPrice : min;
  return { price: min, priceIsFrom: max > min, isPerMeter: display.isPerMeter };
}
