// ═══════════════════════════════════════════════════════════════════
// Cart accessory vocabulary
// ═══════════════════════════════════════════════════════════════════
// Sagarika's May 5 feedback (estimation team lead): reps were forgetting
// to capture SS bolts, dock buffers, steel/weld plates, L-brackets,
// height parameters, food-grade boards etc. on quotations, leaving
// estimation chasing every line. We added a project-level free-text
// installation_notes box AND these structured per-line dropdowns so the
// data is queryable rather than buried in prose.
//
// Canonical keys live here so:
//   - UI <select> options stay in sync with the persisted JSONB shape
//   - the order-form PDF builder can label each value the same way
//   - new options can be added in one place without grepping the codebase
//
// Storage column: cart_items.accessories (jsonb). The shape matches
// CartAccessories below — every field is optional.

export type FloorType =
  | "concrete"
  | "tiled"
  | "asphalt"
  | "food-grade-epoxy"
  | "cold-storage"
  | "steel-deck"
  | "other";

export type FixingsType =
  | "zinc-plated"
  | "stainless-steel"
  | "countersunk"
  | "chemical"
  | "weld-plate"
  | "through-bolt"
  | "other";

export type DockBufferType = "none" | "standard" | "heavy-duty" | "custom";

export interface DockBufferSelection {
  type: DockBufferType;
  qty?: number;
}

export interface QtySelection {
  qty: number;
}

export interface CartAccessories {
  floorType?: FloorType;
  fixings?: FixingsType;
  dockBuffers?: DockBufferSelection;
  steelPlates?: QtySelection;
  lBrackets?: QtySelection;
  bollardCaps?: boolean;
  heightExtensionMm?: number | null;
  other?: string;
  notes?: string;
}

// Display labels for the UI dropdowns + PDF rendering. Keep ordering
// stable: the UI uses array index for default-selection nudges and the
// PDF builder iterates these same arrays to format the output.

export const FLOOR_TYPE_OPTIONS: { value: FloorType; label: string }[] = [
  { value: "concrete", label: "Standard concrete" },
  { value: "tiled", label: "Tiled floor" },
  { value: "asphalt", label: "Asphalt" },
  { value: "food-grade-epoxy", label: "Food-grade epoxy" },
  { value: "cold-storage", label: "Cold storage" },
  { value: "steel-deck", label: "Steel deck" },
  { value: "other", label: "Other (see notes)" },
];

export const FIXINGS_OPTIONS: { value: FixingsType; label: string }[] = [
  { value: "zinc-plated", label: "Standard zinc-plated" },
  { value: "stainless-steel", label: "Stainless steel (SS)" },
  { value: "countersunk", label: "Countersunk" },
  { value: "chemical", label: "Chemical anchor" },
  { value: "weld-plate", label: "Weld plate" },
  { value: "through-bolt", label: "Through-bolt" },
  { value: "other", label: "Other (see notes)" },
];

export const DOCK_BUFFER_OPTIONS: { value: DockBufferType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "standard", label: "Standard" },
  { value: "heavy-duty", label: "Heavy-duty" },
  { value: "custom", label: "Custom (see notes)" },
];

// Helper used by the UI form-state to start every line item with a
// consistent shape; the API still accepts a partial object on PATCH and
// merges via Object.assign on the server.
export function defaultAccessories(): CartAccessories {
  return {
    floorType: undefined,
    fixings: undefined,
    dockBuffers: undefined,
    steelPlates: undefined,
    lBrackets: undefined,
    bollardCaps: false,
    heightExtensionMm: null,
    other: "",
    notes: "",
  };
}

// True iff the rep has filled in any structured field. Used to decide
// whether to render the "Configured" badge on the collapsed picker and
// whether the PDF should print a row for this line item at all.
export function hasAnyAccessories(a: CartAccessories | null | undefined): boolean {
  if (!a) return false;
  if (a.floorType) return true;
  if (a.fixings) return true;
  if (a.dockBuffers && a.dockBuffers.type && a.dockBuffers.type !== "none") return true;
  if (a.steelPlates && (a.steelPlates.qty || 0) > 0) return true;
  if (a.lBrackets && (a.lBrackets.qty || 0) > 0) return true;
  if (a.bollardCaps === true) return true;
  if (typeof a.heightExtensionMm === "number" && a.heightExtensionMm > 0) return true;
  if (a.other && a.other.trim()) return true;
  if (a.notes && a.notes.trim()) return true;
  return false;
}

// Look up the human-readable label for a stored value. Falls back to
// the raw key if the vocabulary changes and a row is ahead of the code.
export function labelForFloorType(v: FloorType | undefined): string {
  if (!v) return "";
  const opt = FLOOR_TYPE_OPTIONS.find((o) => o.value === v);
  return opt ? opt.label : String(v);
}

export function labelForFixings(v: FixingsType | undefined): string {
  if (!v) return "";
  const opt = FIXINGS_OPTIONS.find((o) => o.value === v);
  return opt ? opt.label : String(v);
}

export function labelForDockBuffer(v: DockBufferType | undefined): string {
  if (!v) return "";
  const opt = DOCK_BUFFER_OPTIONS.find((o) => o.value === v);
  return opt ? opt.label : String(v);
}

// ═══════════════════════════════════════════════════════════════════
// Priced accessory catalogue (2026-10-15)
// ═══════════════════════════════════════════════════════════════════
// Tom's request: accessories in the cart must carry indicative prices.
// Every accessory a rep can attach to a cart line is one of these codes.
// The DB table `accessory_prices` (migration 2026-10-15-009) is seeded
// from this list and is the live source of prices; this constant is the
// fallback when the table has not been migrated yet and the vocabulary
// the client renders. Codes never change once shipped — they are stored
// on cart_items.accessory_lines and inside orders.items snapshots.
//
// Prices come from scripts/data/pricelist-aed-2025v1.json where a real
// SKU exists. Everything else is NULL + priceToConfirm until the
// estimation team supplies a figure (admin PATCH /api/admin/accessory-prices/:code).

export type AccessoryGroup =
  | "fixings"
  | "plates"
  | "dock"
  | "brackets"
  | "caps"
  | "extensions"
  | "spacers"
  | "other";

/** How an accessory is counted. `per_post` defaults to the post count of a run. */
export type AccessoryUnit = "each" | "per_post" | "per_metre" | "per_pair";

export const ACCESSORY_GROUPS: AccessoryGroup[] = [
  "fixings",
  "plates",
  "dock",
  "brackets",
  "caps",
  "extensions",
  "spacers",
  "other",
];

export const ACCESSORY_UNITS: AccessoryUnit[] = ["each", "per_post", "per_metre", "per_pair"];

export const ACCESSORY_GROUP_LABELS: Record<AccessoryGroup, string> = {
  fixings: "Fixings",
  plates: "Plates",
  dock: "Dock buffers",
  brackets: "Brackets",
  caps: "Caps",
  extensions: "Height extensions",
  spacers: "Spacers",
  other: "Other",
};

export const ACCESSORY_UNIT_LABELS: Record<AccessoryUnit, string> = {
  each: "each",
  per_post: "per post",
  per_metre: "per metre",
  per_pair: "per pair",
};

/** One row of the accessory price list (shape shared by the API and the seed). */
export interface AccessoryPrice {
  code: string;
  label: string;
  group: AccessoryGroup;
  unit: AccessoryUnit;
  /** AED per `unit`; null until the estimation team confirms. */
  priceAed: number | null;
  priceToConfirm: boolean;
  /** Product families the accessory fits (e.g. ["iFlex"]); null = any. */
  appliesToFamilies: string[] | null;
  sku: string | null;
  active: boolean;
  updatedAt?: string | null;
}

/**
 * A priced accessory attached to a cart line. Stored as
 * cart_items.accessory_lines (jsonb array) and copied into orders.items.
 * `quantity` is already resolved (per_post defaults filled in) so a
 * snapshot prices the same forever.
 */
export interface AccessoryLine {
  code: string;
  label: string;
  unit: AccessoryUnit;
  quantity: number;
  /** AED per unit at the time the line was priced; null = not yet priced. */
  unitPriceAed: number | null;
  priceToConfirm: boolean;
}

type CatalogueEntry = Omit<AccessoryPrice, "active" | "updatedAt" | "priceToConfirm"> & {
  priceToConfirm?: boolean;
};

const priced = (
  code: string,
  label: string,
  group: AccessoryGroup,
  unit: AccessoryUnit,
  priceAed: number,
  sku: string,
  appliesToFamilies: string[] | null = null,
): CatalogueEntry => ({ code, label, group, unit, priceAed, sku, appliesToFamilies, priceToConfirm: false });

const tbc = (
  code: string,
  label: string,
  group: AccessoryGroup,
  unit: AccessoryUnit,
  appliesToFamilies: string[] | null = null,
): CatalogueEntry => ({ code, label, group, unit, priceAed: null, sku: null, appliesToFamilies, priceToConfirm: true });

/** Canonical accessory list. Order = display order in the picker. */
export const ACCESSORY_CATALOGUE: ReadonlyArray<AccessoryPrice> = (
  [
    // Fixings — priced per post; no SKU on the 2025 price list.
    tbc("fixing-zinc-plated", "Standard zinc-plated fixings", "fixings", "per_post"),
    tbc("fixing-stainless-steel", "Stainless steel (SS) fixings", "fixings", "per_post"),
    tbc("fixing-countersunk", "Countersunk fixings", "fixings", "per_post"),
    tbc("fixing-chemical-anchor", "Chemical anchors", "fixings", "per_post"),
    tbc("fixing-through-bolt", "Through-bolts", "fixings", "per_post"),
    // Plates
    tbc("weld-plate", "Weld plate", "plates", "per_post"),
    priced("slider-plate-iflex-190", "iFlex 190 Post Slider Plate (230 × 230 mm)", "plates", "per_post", 513.0, "B-03-01-0021", ["iFlex"]),
    priced("slider-plate-eflex", "eFlex Post Slider Plate (180 × 180 mm)", "plates", "per_post", 327.0, "B-03-01-0040", ["eFlex"]),
    // Dock buffers
    priced("dock-buffer-pair", "Dock Buffer (Pair)", "dock", "per_pair", 2287.08, "A-01-22-0002"),
    tbc("dock-buffer-standard", "Dock buffer — standard", "dock", "each"),
    tbc("dock-buffer-heavy-duty", "Dock buffer — heavy-duty", "dock", "each"),
    // Brackets / caps / extensions
    tbc("l-bracket", "L-bracket", "brackets", "each"),
    tbc("bollard-cap", "Bollard cap", "caps", "each"),
    tbc("height-extension", "Height extension", "extensions", "per_post"),
    // FlexiShield column guard spacer sets (real SKUs)
    priced("spacer-flexishield-100-black", "FlexiShield Column Guard Spacer set — 100 mm, Black", "spacers", "each", 612.96, "A-01-14-0051", ["FlexiShield"]),
    priced("spacer-flexishield-100-yellow", "FlexiShield Column Guard Spacer set — 100 mm, Yellow", "spacers", "each", 834.48, "A-01-14-0052", ["FlexiShield"]),
    priced("spacer-flexishield-150-black", "FlexiShield Column Guard Spacer set — 150 mm, Black", "spacers", "each", 640.92, "A-01-14-0053", ["FlexiShield"]),
    priced("spacer-flexishield-150-yellow", "FlexiShield Column Guard Spacer set — 150 mm, Yellow", "spacers", "each", 873.84, "A-01-14-0054", ["FlexiShield"]),
    priced("spacer-flexishield-300-black", "FlexiShield Column Guard Spacer set — 300 mm, Black", "spacers", "each", 701.88, "A-01-14-0055", ["FlexiShield"]),
    priced("spacer-flexishield-300-yellow", "FlexiShield Column Guard Spacer set — 300 mm, Yellow", "spacers", "each", 959.52, "A-01-14-0056", ["FlexiShield"]),
    // Escape hatch
    tbc("other-accessory", "Other accessory (see notes)", "other", "each"),
  ] as CatalogueEntry[]
).map((e) => ({ ...e, priceToConfirm: e.priceToConfirm ?? e.priceAed === null, active: true }));

/** Catalogue row for a code, or undefined when the code is not known. */
export function accessoryCatalogueEntry(code: string | null | undefined): AccessoryPrice | undefined {
  if (!code) return undefined;
  return ACCESSORY_CATALOGUE.find((a) => a.code === code);
}

/**
 * Bridge from the legacy dropdown vocabulary (`CartAccessories.fixings`,
 * `dockBuffers.type`) to a priced accessory code, so the picker can
 * pre-select the matching priced line. null = nothing to price.
 */
export const FIXINGS_ACCESSORY_CODE: Record<FixingsType, string | null> = {
  "zinc-plated": "fixing-zinc-plated",
  "stainless-steel": "fixing-stainless-steel",
  countersunk: "fixing-countersunk",
  chemical: "fixing-chemical-anchor",
  "weld-plate": "weld-plate",
  "through-bolt": "fixing-through-bolt",
  other: "other-accessory",
};

export const DOCK_BUFFER_ACCESSORY_CODE: Record<DockBufferType, string | null> = {
  none: null,
  standard: "dock-buffer-standard",
  "heavy-duty": "dock-buffer-heavy-duty",
  custom: "other-accessory",
};
