// ────────────────────────────────────────────────────────────────────────────
// shared/productOptions.ts
//
// Pure derivation of the options a customer picks inside one grouped
// catalogue card: a height, an outer diameter, a colour, or a mix.
//
// Owner feedback (Tom): "bollard heights do require separate pricing for
// 1.2 m". The real prices live on each row's `specifications.variants`
// sub-sizes ("Bollard, Yellow" holds 190 OD x 835 mm, 190 OD x 1200 mm and
// 210 OD x 1200 mm, each with its own SKU and price), so a row with priced
// sub-sizes is EXPANDED: one option per sub-size, never one "from" price
// per row. The iFlex 190 Bollard card therefore offers
//
//   835 mm · Yellow            S-01-07-0057
//   1.2 m · Yellow             S-01-07-0053
//   1.2 m · Grey               S-01-07-0078
//   1.2 m · 210 OD · Yellow    S-01-07-0065
//   1.2 m · 210 OD · Grey      S-01-07-0090
//   2 m                        A-01-10-0050
//
// Nothing here renames a product: the DB `name` of the parent row stays the
// cart / pricing key, and the sub-size travels as the line's selectedVariant.
// ────────────────────────────────────────────────────────────────────────────

export interface OptionSource {
  /** Listing id of the row ("family-…"). */
  id?: string | null;
  /** DB id of the row. */
  productId?: string | null;
  name: string;
  sku?: string | null;
  price?: string | number | null;
  heightMin?: number | null;
  heightMax?: number | null;
  /** Object or JSON string; `variants` inside it are the row's sub-sizes. */
  specifications?: unknown;
  /** Price-list variants (product_variants) of the row, when loaded. */
  priceVariants?: unknown[] | null;
  priceListSource?: string | null;
}

/** One priced, SKU'd size of a product row (from `specifications.variants`). */
export interface SubSize {
  sku: string;
  /** As stored, e.g. "190 OD x 1200 mm". */
  name: string;
  priceAed: number;
  heightMm: number | null;
  odMm: number | null;
  /** The stored object, untouched. */
  raw: Record<string, unknown>;
}

/** One pickable option of a catalogue card. */
export interface FamilyOption {
  /** Unique within the card: "<row id>::<sku>" for a sub-size, the row id otherwise. */
  id: string;
  /** Short label for the picker, unique within the card. */
  optionLabel: string;
  /** Overall height in mm, or null when unknown. */
  heightMm: number | null;
  /** Outer diameter in mm, or null when the option carries none. */
  odMm: number | null;
  /** "Yellow" | "Grey" | "Black", or null when the name carries none. */
  colour: string | null;
  sku: string | null;
  /** Exact price of this option; null when the row has none. */
  priceAed: number | null;
  /** Listing id of the product row to hand to the cart ("family-…"). */
  parentId: string | null;
  /** DB id of that row. */
  parentProductId: string | null;
  /** Stored name of that row: the cart line's productName. */
  parentName: string;
  /** The row's own sub-size this option stands for; null = the whole row. */
  subVariant: Record<string, unknown> | null;
}

// "2m", "1.2 m", "- 2m". The trailing \b keeps "1200mm" / "190mm OD" out:
// a millimetre token in a product name is as often a length or a diameter
// as a height, so only a metres token is trusted as the height.
const METRES_TOKEN_RE = /(\d+(?:\.\d+)?)\s*m\b/gi;

/** Height in mm from a metres token in the name ("- 2m", "1.2m"), else null. */
export function parseHeightMetresFromName(name: string | null | undefined): number | null {
  const matches = Array.from(String(name ?? "").matchAll(METRES_TOKEN_RE));
  if (matches.length === 0) return null;
  // The height is a suffix ("iFlex 190 Bollard - 2m"), so take the last token.
  const n = parseFloat(matches[matches.length - 1][1]);
  if (!Number.isFinite(n) || n <= 0 || n > 20) return null;
  return Math.round(n * 1000);
}

/**
 * Height of one variant in mm: the metres token in its name when present,
 * otherwise `heightMax`. Never `heightMin` — on a bollard that column is the
 * lowest height the model is sold in ("Bollard, Yellow" is 835/1200, the 2 m
 * row is 835/2000), not the height of this SKU.
 */
export function deriveHeightMm(v: OptionSource): number | null {
  const fromName = parseHeightMetresFromName(v.name);
  if (fromName) return fromName;
  const max = Number(v.heightMax);
  return Number.isFinite(max) && max > 0 ? Math.round(max) : null;
}

const COLOURS: Array<[RegExp, string]> = [
  [/\byellow\b/i, "Yellow"],
  [/\bgr[ea]y\b/i, "Grey"],
  [/\bblack\b/i, "Black"],
];

/** Colour named in the product name (Yellow / Grey / Black), else null. */
export function deriveColour(name: string | null | undefined): string | null {
  const s = String(name ?? "");
  let best: { index: number; colour: string } | null = null;
  for (const [re, colour] of COLOURS) {
    const m = re.exec(s);
    if (m && (best === null || m.index < best.index)) best = { index: m.index, colour };
  }
  return best ? best.colour : null;
}

/** "1.2 m" / "2 m" / "2.08 m" / "835 mm". */
export function formatHeightMm(mm: number): string {
  if (mm >= 1000) return `${parseFloat((mm / 1000).toFixed(2))} m`;
  return `${Math.round(mm)} mm`;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

function specVariantsOf(row: OptionSource): Record<string, unknown>[] {
  let specs: unknown = row.specifications;
  if (typeof specs === "string") {
    try {
      specs = JSON.parse(specs);
    } catch {
      return [];
    }
  }
  const list = (specs as { variants?: unknown } | null | undefined)?.variants;
  return Array.isArray(list) ? (list.filter((v) => v && typeof v === "object") as Record<string, unknown>[]) : [];
}

/**
 * The priced sub-sizes of a product row, when they are that row's own price
 * source.
 *
 * A row qualifies only when ALL of these hold; otherwise it has none and is
 * treated as a single product:
 *   - it has no price-list variants (`priceVariants` / `priceListSource`):
 *     on a price-list row the price list is authoritative and any
 *     `specifications.variants` left on it are stale;
 *   - every sub-size has a positive price and a SKU, and the SKUs are unique;
 *   - no sub-size is a run length (`length_mm`): lengthed families are
 *     priced by the length planner, not picked as options.
 */
export function productSubSizes(row: OptionSource | null | undefined): SubSize[] {
  if (!row) return [];
  if (Array.isArray(row.priceVariants) && row.priceVariants.length > 0) return [];
  if (typeof row.priceListSource === "string" && row.priceListSource.trim() !== "") return [];
  const raw = specVariantsOf(row);
  if (raw.length === 0) return [];
  const out: SubSize[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    const sku = String(v.code ?? v.sku ?? "").trim();
    const priceAed = num(v.price ?? v.priceAed);
    if (!sku || priceAed === null || seen.has(sku)) return [];
    if (num(v.length_mm ?? v.lengthMm) !== null) return [];
    seen.add(sku);
    const name = String(v.name ?? v.variant ?? "").trim();
    const heightFromName = /x\s*(\d{3,4})\s*mm\b/i.exec(name);
    const odFromName = /\b(\d{2,3})\s*OD\b/i.exec(name);
    out.push({
      sku,
      name,
      priceAed,
      heightMm: num(v.height_mm ?? v.heightMm) ?? (heightFromName ? Number(heightFromName[1]) : null),
      odMm: num(v.od_mm ?? v.odMm) ?? (odFromName ? Number(odFromName[1]) : null),
      raw: v,
    });
  }
  return out;
}

/** The row's sub-size with this SKU, or null when it has none by that SKU. */
export function findProductSubSize(row: OptionSource | null | undefined, sku: string | null | undefined): SubSize | null {
  const wanted = String(sku ?? "").trim();
  if (!wanted) return null;
  return productSubSizes(row).find((s) => s.sku === wanted) ?? null;
}

const COLOUR_RANK = ["Yellow", "Grey", "Black"];
const colourRank = (c: string | null) => {
  if (c === null) return COLOUR_RANK.length + 1;
  const i = COLOUR_RANK.indexOf(c);
  return i === -1 ? COLOUR_RANK.length : i;
};

/**
 * The options of one card, from its priced product rows.
 *
 * A row with priced sub-sizes becomes one option per sub-size (exact price,
 * own SKU); any other row is one option at the row's price. Sorted by
 * height, then outer diameter, then colour (Yellow, Grey, Black), then price.
 *
 * The label is "<height> · <OD> OD · <colour>" from whatever is known. The
 * OD is named only when it differs from the card's base (smallest) OD, so
 * the 190 OD bollards read "1.2 m · Yellow" and the 210 OD ones
 * "1.2 m · 210 OD · Yellow". An option with nothing to say falls back to the
 * row name. Labels that still collide are told apart by SKU, then by name,
 * then by position.
 */
export function deriveFamilyOptions<T extends OptionSource>(rows: T[]): FamilyOption[] {
  type Draft = FamilyOption & { order: number; fallbackName: string };
  const drafts: Draft[] = [];
  rows.forEach((row) => {
    const parentName = String(row.name ?? "");
    const parentId = row.id != null ? String(row.id) : null;
    const base = {
      parentId,
      parentProductId: row.productId != null ? String(row.productId) : null,
      parentName,
      optionLabel: "",
    };
    const subs = productSubSizes(row);
    if (subs.length === 0) {
      drafts.push({
        ...base,
        id: parentId ?? parentName,
        heightMm: deriveHeightMm(row),
        odMm: null,
        colour: deriveColour(parentName),
        sku: row.sku ? String(row.sku) : null,
        priceAed: num(row.price),
        subVariant: null,
        order: drafts.length,
        fallbackName: parentName,
      });
      return;
    }
    for (const s of subs) {
      drafts.push({
        ...base,
        id: `${parentId ?? parentName}::${s.sku}`,
        heightMm: s.heightMm ?? deriveHeightMm(row),
        odMm: s.odMm,
        colour: deriveColour(parentName) ?? deriveColour(s.name),
        sku: s.sku,
        priceAed: s.priceAed,
        subVariant: s.raw,
        order: drafts.length,
        fallbackName: s.name ? `${parentName} - ${s.name}` : parentName,
      });
    }
  });

  const ods = drafts.map((d) => d.odMm).filter((n): n is number => n !== null);
  const baseOd = ods.length > 0 ? Math.min(...ods) : null;
  const last = Number.MAX_SAFE_INTEGER;
  drafts.sort(
    (a, b) =>
      (a.heightMm ?? last) - (b.heightMm ?? last) ||
      (a.odMm ?? baseOd ?? 0) - (b.odMm ?? baseOd ?? 0) ||
      colourRank(a.colour) - colourRank(b.colour) ||
      (a.priceAed ?? last) - (b.priceAed ?? last) ||
      a.order - b.order,
  );

  for (const d of drafts) {
    const parts = [
      d.heightMm ? formatHeightMm(d.heightMm) : null,
      d.odMm !== null && d.odMm !== baseOd ? `${d.odMm} OD` : null,
      d.colour,
    ].filter(Boolean);
    d.optionLabel = parts.length > 0 ? parts.join(" · ") : d.fallbackName;
  }

  const countOf = (labels: string[]) => {
    const counts = new Map<string, number>();
    for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
    return counts;
  };

  // Pass 1: a shared label gains the SKU, or the name when there is no SKU
  // (and the name is not already the label).
  let counts = countOf(drafts.map((d) => d.optionLabel));
  for (const d of drafts) {
    if ((counts.get(d.optionLabel) ?? 0) < 2) continue;
    const suffix = d.sku || (d.fallbackName && d.fallbackName !== d.optionLabel ? d.fallbackName : "");
    if (suffix) d.optionLabel = `${d.optionLabel} · ${suffix}`;
  }

  // Pass 2: anything still shared (same SKU, or same name and no SKU) is
  // numbered so the picker never shows two identical rows.
  counts = countOf(drafts.map((d) => d.optionLabel));
  const seen = new Map<string, number>();
  for (const d of drafts) {
    if ((counts.get(d.optionLabel) ?? 0) < 2) continue;
    const n = (seen.get(d.optionLabel) ?? 0) + 1;
    seen.set(d.optionLabel, n);
    d.optionLabel = `${d.optionLabel} (${n})`;
  }

  return drafts.map(({ order: _order, fallbackName: _fallbackName, ...option }) => option);
}
