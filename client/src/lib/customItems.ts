/**
 * Pure helpers for priced accessories and rep-entered custom line items.
 *
 * Shared by AccessoryPicker, CustomItemDialog, CustomItemsLibrary, the cart
 * line components and the admin AccessoryPrices page. No React, no fetch —
 * everything here is unit-testable (see customItems.test.ts).
 *
 * The types below mirror the API contract the Worker exposes:
 *   GET  /api/accessory-prices            → { items: AccessoryPriceOption[] }
 *   PATCH /api/cart/:id/accessories        body { accessoryLines }
 *   POST /api/cart/custom                  body CustomCartPayload
 *   GET  /api/custom-items                 → { items: SavedCustomItem[] }
 * Accessory types and the quantity-default formula come from shared/
 * (cartAccessories.ts, pricing/accessories.ts) — the same code the Worker
 * runs — so the picker's pre-filled numbers match what the server stores.
 */

import type { CartLikeItem } from "@shared/pricing";
import { round2 } from "@shared/pricing";
import {
  defaultAccessoryQuantity as sharedDefaultAccessoryQuantity,
  postCountForMetres,
} from "@shared/pricing/accessories";
import type { AccessoryLine, AccessoryPrice, AccessoryUnit } from "@shared/cartAccessories";

export type { AccessoryLine, AccessoryPrice, AccessoryUnit };
export { round2, postCountForMetres };

/** One row of GET /api/accessory-prices (alias kept for the components). */
export type AccessoryPriceOption = AccessoryPrice;

/**
 * Local (unsaved) accessory line. `quantity` is omitted on a freshly
 * toggled per_post line so the server fills it from the run length; the
 * stored `AccessoryLine` always carries one.
 */
export type DraftAccessoryLine = Omit<AccessoryLine, "quantity"> & { quantity?: number };

export type PricingBasis = "price_list" | "rep_estimate" | "estimation_team";
export type CustomCategory = "product" | "accessory" | "service" | "other";
export type CustomPricingType = "standard_item" | "linear_meter";

export interface CustomItemInput {
  productName: string;
  description: string;
  customCategory: CustomCategory;
  quantity: number;
  pricingType: CustomPricingType;
  unitPrice: number;
  requiresDelivery: boolean;
  requiresInstallation: boolean;
  pricingBasis: Exclude<PricingBasis, "price_list">;
  notes: string;
  saveToLibrary: boolean;
}

/** Body of POST /api/cart/custom. */
export interface CustomCartPayload {
  productName: string;
  description?: string;
  customCategory: CustomCategory;
  quantity: number;
  pricingType: CustomPricingType;
  unitPrice: number;
  requiresDelivery: boolean;
  requiresInstallation: boolean;
  pricingBasis: PricingBasis;
  notes?: string;
  saveToLibrary?: boolean;
}

export interface SavedCustomItem {
  id: string;
  productName: string;
  description: string | null;
  customCategory: CustomCategory;
  pricingType: CustomPricingType;
  unitPriceAed: number;
  requiresDelivery: boolean;
  requiresInstallation: boolean;
  pricingBasis: PricingBasis;
  useCount: number;
}

/** The bits of a cart row the quantity defaults need (see CartLikeItem). */
export type CartLineContext = Pick<CartLikeItem, "quantity" | "pricingType" | "lengthMeters">;

export const CUSTOM_CATEGORY_OPTIONS: { value: CustomCategory; label: string }[] = [
  { value: "product", label: "Product" },
  { value: "accessory", label: "Accessory" },
  { value: "service", label: "Service" },
  { value: "other", label: "Other" },
];

export const PRICING_BASIS_LABELS: Record<PricingBasis, string> = {
  price_list: "Price list",
  rep_estimate: "Rep estimate",
  estimation_team: "Estimation team to confirm",
};

const PER_METRE_RE = /met(er|re)/i;

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** "AED 2,287.08" — always 2 dp, en-US grouping. */
export function formatAed(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `AED ${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Suffix shown after an accessory price. */
export function unitSuffix(unit: AccessoryUnit): string {
  switch (unit) {
    case "per_post":
      return "/ post";
    case "per_metre":
      return "/ m";
    case "per_pair":
      return "/ pair";
    default:
      return "each";
  }
}

/** Short noun for the stepper caption: "posts", "m", "pairs", "items". */
export function unitNoun(unit: AccessoryUnit, quantity = 2): string {
  const plural = quantity !== 1;
  switch (unit) {
    case "per_post":
      return plural ? "posts" : "post";
    case "per_metre":
      return "m";
    case "per_pair":
      return plural ? "pairs" : "pair";
    default:
      return plural ? "items" : "item";
  }
}

/**
 * "AED 2,287.08 / pair" or "Price to confirm" when the price list has no
 * figure yet (or the admin flagged it TBC).
 */
export function formatAccessoryPrice(
  option: Pick<AccessoryPriceOption, "priceAed" | "priceToConfirm" | "unit">,
): string {
  if (option.priceToConfirm || option.priceAed === null || !Number.isFinite(option.priceAed)) {
    return "Price to confirm";
  }
  return `${formatAed(option.priceAed)} ${unitSuffix(option.unit)}`;
}

/** True for any of the per-metre spellings the cart has accumulated. */
export function isPerMetre(pricingType: unknown): boolean {
  return PER_METRE_RE.test(String(pricingType ?? ""));
}

/** Run length in metres for a per-metre line (0 for per-unit lines). */
export function runLengthMetres(ctx: CartLineContext): number {
  if (!isPerMetre(ctx.pricingType) && !(num(ctx.lengthMeters) > 0)) return 0;
  const length = num(ctx.lengthMeters);
  return length > 0 ? length : num(ctx.quantity);
}

/**
 * Default quantity for a newly-added accessory line — the shared formula
 * the Worker applies when a PATCH omits the quantity:
 *   per_post  → ceil(metres / 2.2) + 1 for a run, else the line quantity
 *   per_metre → the run metres, else the line quantity
 *   each / per_pair → the line quantity for per-unit lines, 1 for a run
 * Never below 1.
 */
export function defaultAccessoryQuantity(unit: AccessoryUnit, ctx: CartLineContext = {}): number {
  return sharedDefaultAccessoryQuantity(unit, ctx);
}

/** Quantity to display for a line: the stored one, else the default. */
export function effectiveAccessoryQuantity(line: DraftAccessoryLine, ctx: CartLineContext = {}): number {
  const q = num(line.quantity);
  return q > 0 ? q : defaultAccessoryQuantity(line.unit, ctx);
}

/** Line total in AED, or null when the price is still to be confirmed. */
export function accessoryLineTotal(line: DraftAccessoryLine, ctx: CartLineContext = {}): number | null {
  if (line.priceToConfirm || line.unitPriceAed === null || !Number.isFinite(line.unitPriceAed)) {
    return null;
  }
  return round2(line.unitPriceAed * effectiveAccessoryQuantity(line, ctx));
}

export interface AccessoriesSubtotal {
  /** Sum of the priced lines, AED 2 dp. */
  totalAed: number;
  /** True when at least one selected line has no price yet. */
  hasTbc: boolean;
  pricedCount: number;
  tbcCount: number;
}

export function accessoriesSubtotal(
  lines: ReadonlyArray<DraftAccessoryLine> | null | undefined,
  ctx: CartLineContext = {},
): AccessoriesSubtotal {
  let totalAed = 0;
  let pricedCount = 0;
  let tbcCount = 0;
  for (const line of lines ?? []) {
    const t = accessoryLineTotal(line, ctx);
    if (t === null) {
      tbcCount += 1;
    } else {
      pricedCount += 1;
      totalAed = round2(totalAed + t);
    }
  }
  return { totalAed, hasTbc: tbcCount > 0, pricedCount, tbcCount };
}

/** Cart line total including its priced accessories. */
export function lineTotalWithAccessories(
  item: { totalPrice?: number | string | null; accessoryLines?: DraftAccessoryLine[] | null } & CartLineContext,
): number {
  return round2(num(item.totalPrice) + accessoriesSubtotal(item.accessoryLines, item).totalAed);
}

/**
 * Which price-list options apply to a cart line. `appliesToFamilies` is a
 * list of family keywords ("iFlex", "Bollard", …) matched case-insensitively
 * against the product name and category; null means every product.
 * Inactive options are hidden unless the line already carries them.
 */
export function applicableAccessoryOptions(
  options: ReadonlyArray<AccessoryPriceOption> | null | undefined,
  line: { productName?: string | null; category?: string | null; accessoryLines?: DraftAccessoryLine[] | null },
): AccessoryPriceOption[] {
  const hay = `${line.productName ?? ""} ${line.category ?? ""}`.toLowerCase();
  const selected = new Set((line.accessoryLines ?? []).map((l) => l.code));
  return (options ?? []).filter((o) => {
    if (selected.has(o.code)) return true;
    if (!o.active) return false;
    if (!o.appliesToFamilies || o.appliesToFamilies.length === 0) return true;
    return o.appliesToFamilies.some((fam) => fam && hay.includes(String(fam).toLowerCase()));
  });
}

/** Build the line for an option the rep just switched on. */
export function accessoryLineFromOption(
  option: AccessoryPriceOption,
  ctx: CartLineContext = {},
): DraftAccessoryLine {
  const line: DraftAccessoryLine = {
    code: option.code,
    label: option.label,
    unit: option.unit,
    unitPriceAed: option.priceToConfirm ? null : option.priceAed,
    priceToConfirm: option.priceToConfirm || option.priceAed === null,
  };
  // per_post on a run: leave the quantity to the server so its post count
  // is authoritative; the picker shows the same formula meanwhile.
  if (option.unit === "per_post" && runLengthMetres(ctx) > 0) return line;
  return { ...line, quantity: defaultAccessoryQuantity(option.unit, ctx) };
}

/**
 * Lines safe to PATCH: the server rejects codes that are not on the
 * active price list, so a retired accessory still stored on the row is
 * dropped from the body (and therefore from the row) on the next save.
 * When the list has not loaded, send everything and let the server say.
 */
export function savableAccessoryLines(
  lines: ReadonlyArray<DraftAccessoryLine>,
  priceList: ReadonlyArray<AccessoryPriceOption> | null | undefined,
): DraftAccessoryLine[] {
  if (!priceList || priceList.length === 0) return [...lines];
  const active = new Set(priceList.filter((o) => o.active).map((o) => o.code));
  return lines.filter((l) => active.has(l.code));
}

/** Parse a money / quantity text field; "" and junk → NaN. */
export function parseNumberInput(raw: string): number {
  const cleaned = String(raw ?? "").replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return NaN;
  return Number(cleaned);
}

export type CustomItemErrors = Partial<Record<keyof CustomItemInput, string>>;

export function emptyCustomItem(): CustomItemInput {
  return {
    productName: "",
    description: "",
    customCategory: "product",
    quantity: 1,
    pricingType: "standard_item",
    unitPrice: NaN,
    requiresDelivery: true,
    requiresInstallation: true,
    pricingBasis: "rep_estimate",
    notes: "",
    saveToLibrary: false,
  };
}

/**
 * Validation for the custom-item form. A zero price is allowed only when
 * the estimation team will confirm it; a rep estimate must carry a figure.
 */
export function validateCustomItem(input: CustomItemInput): { ok: boolean; errors: CustomItemErrors } {
  const errors: CustomItemErrors = {};
  const name = (input.productName ?? "").trim();
  if (name.length < 2) errors.productName = "Give the item a name (at least 2 characters).";
  if (name.length > 160) errors.productName = "Keep the name under 160 characters.";
  if (!CUSTOM_CATEGORY_OPTIONS.some((o) => o.value === input.customCategory)) {
    errors.customCategory = "Pick a category.";
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    errors.quantity = input.pricingType === "linear_meter" ? "Enter the run length in metres." : "Quantity must be at least 1.";
  } else if (input.pricingType === "standard_item" && !Number.isInteger(input.quantity)) {
    errors.quantity = "Whole units only for per-item pricing.";
  }
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) {
    errors.unitPrice = "Enter a unit price in AED (0 if unknown).";
  } else if (input.unitPrice === 0 && input.pricingBasis !== "estimation_team") {
    errors.unitPrice = "A rep estimate needs a price — or hand it to the estimation team.";
  }
  if (input.pricingBasis !== "rep_estimate" && input.pricingBasis !== "estimation_team") {
    errors.pricingBasis = "Choose who is standing behind this price.";
  }
  if ((input.notes ?? "").length > 2000) errors.notes = "Notes are limited to 2,000 characters.";
  return { ok: Object.keys(errors).length === 0, errors };
}

/** Form state → POST /api/cart/custom body. Call validateCustomItem first. */
export function customItemToCartPayload(input: CustomItemInput): CustomCartPayload {
  const description = (input.description ?? "").trim();
  const notes = (input.notes ?? "").trim();
  return {
    productName: input.productName.trim(),
    description: description || undefined,
    customCategory: input.customCategory,
    quantity: round2(input.quantity),
    pricingType: input.pricingType,
    unitPrice: round2(input.unitPrice),
    requiresDelivery: !!input.requiresDelivery,
    requiresInstallation: !!input.requiresInstallation,
    pricingBasis: input.pricingBasis,
    notes: notes || undefined,
    saveToLibrary: input.saveToLibrary || undefined,
  };
}

/** Saved library item + a quantity → POST /api/cart/custom body. */
export function savedItemToCartPayload(saved: SavedCustomItem, quantity: number): CustomCartPayload {
  return {
    productName: saved.productName,
    description: saved.description ?? undefined,
    customCategory: saved.customCategory,
    quantity: round2(quantity > 0 ? quantity : 1),
    pricingType: saved.pricingType,
    unitPrice: round2(num(saved.unitPriceAed)),
    requiresDelivery: !!saved.requiresDelivery,
    requiresInstallation: !!saved.requiresInstallation,
    pricingBasis: saved.pricingBasis,
  };
}

/** Saved library item → form state, for "edit before adding". */
export function savedItemToFormInput(saved: SavedCustomItem): CustomItemInput {
  return {
    productName: saved.productName,
    description: saved.description ?? "",
    customCategory: saved.customCategory,
    quantity: 1,
    pricingType: saved.pricingType,
    unitPrice: num(saved.unitPriceAed),
    requiresDelivery: !!saved.requiresDelivery,
    requiresInstallation: !!saved.requiresInstallation,
    pricingBasis: saved.pricingBasis === "estimation_team" ? "estimation_team" : "rep_estimate",
    notes: "",
    saveToLibrary: false,
  };
}
