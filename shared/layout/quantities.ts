/**
 * shared/layout/quantities.ts
 *
 * Quantity take-off derived purely from document geometry. Per family we
 * report metres, runs, posts, corners and stamps for the legend / title
 * block; per product we report a line ready for POST /api/cart/bulk-add.
 */

import type { LayoutDoc } from "./doc";
import { getFamily, isStampFamily, type FamilySpec } from "./symbols";
import { detectCorners, postPositions, pxPerMm, runLengthMm } from "./geometry";

/** Matches cart_items.pricing_type as posted by the existing bulk-add callers. */
export type CartPricingType = "linear_meter" | "standard_item";

/** The slice of a catalogue product the take-off needs. */
export interface CatalogProductLike {
  id: string;
  name: string;
  category?: string | null;
  subcategory?: string | null;
  /** per_unit | per_meter | per_length | per_component | per_rate */
  pricingLogic?: string | null;
  basePricePerMeter?: string | number | null;
}

export interface FamilyQuantity {
  familyId: string;
  label: string;
  letter: string;
  colour: string;
  /** Sum of run lengths in metres (0 when uncalibrated). */
  totalLengthM: number;
  runs: number;
  /** Post count across all runs (0 when uncalibrated). */
  posts: number;
  /** Corner posts across all runs (scale-free). */
  corners: number;
  stamps: number;
}

export interface ProductQuantity {
  productId: string;
  productName: string;
  familyId: string;
  pricingType: CartPricingType;
  /** Metres for linear_meter products, pieces for standard_item. */
  quantity: number;
  lengthMeters?: number;
  elementCount: number;
}

export interface QuantitySummary {
  calibrated: boolean;
  families: FamilyQuantity[];
  products: ProductQuantity[];
  /** Runs and stamps with no productId — visible on the sheet but not in the cart. */
  unassignedElements: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pricingTypeFor(product: CatalogProductLike | undefined, family: FamilySpec): CartPricingType {
  if (product) {
    const logic = (product.pricingLogic ?? "").toLowerCase();
    if (logic === "per_length" || logic === "per_meter") return "linear_meter";
    if (logic === "per_unit" || logic === "per_component" || logic === "per_rate") return "standard_item";
    const perMeter = Number(product.basePricePerMeter);
    if (Number.isFinite(perMeter) && perMeter > 0) return "linear_meter";
  }
  return family.stampShape ? "standard_item" : "linear_meter";
}

export function deriveQuantities(doc: LayoutDoc, catalog: CatalogProductLike[]): QuantitySummary {
  const cal = doc.calibration;
  const calibrated = pxPerMm(cal) !== null;
  const byId = new Map<string, CatalogProductLike>();
  for (const p of catalog) byId.set(p.id, p);

  const families = new Map<string, FamilyQuantity>();
  const familyFor = (familyId: string): FamilyQuantity => {
    let f = families.get(familyId);
    if (!f) {
      const spec = getFamily(familyId);
      f = {
        familyId,
        label: spec.label,
        letter: spec.letter,
        colour: spec.colour,
        totalLengthM: 0,
        runs: 0,
        posts: 0,
        corners: 0,
        stamps: 0,
      };
      families.set(familyId, f);
    }
    return f;
  };

  interface Acc {
    familyId: string;
    lengthM: number;
    pieces: number;
    count: number;
  }
  const products = new Map<string, Acc>();
  const productFor = (productId: string, familyId: string): Acc => {
    let a = products.get(productId);
    if (!a) {
      a = { familyId, lengthM: 0, pieces: 0, count: 0 };
      products.set(productId, a);
    }
    return a;
  };

  let unassigned = 0;

  for (const el of doc.elements) {
    if (el.kind === "barrierRun") {
      const spec = getFamily(el.familyId);
      const f = familyFor(el.familyId);
      f.runs += 1;
      f.corners += detectCorners(el.points).length;
      let lengthM = 0;
      if (calibrated) {
        lengthM = (runLengthMm(el.points, cal) ?? 0) / 1000;
        f.totalLengthM += lengthM;
        f.posts += isStampFamily(el.familyId) ? 0 : postPositions(el.points, spec.postSpacingMm, cal).length;
      }
      if (el.productId) {
        const a = productFor(el.productId, el.familyId);
        a.lengthM += lengthM;
        a.pieces += 1;
        a.count += 1;
      } else {
        unassigned += 1;
      }
    } else if (el.kind === "stamp") {
      const f = familyFor(el.familyId);
      f.stamps += 1;
      if (el.productId) {
        const a = productFor(el.productId, el.familyId);
        a.pieces += 1;
        a.count += 1;
      } else {
        unassigned += 1;
      }
    }
  }

  const familyList: FamilyQuantity[] = [];
  for (const f of families.values()) {
    familyList.push({ ...f, totalLengthM: round2(f.totalLengthM) });
  }

  const productList: ProductQuantity[] = [];
  for (const [productId, a] of products) {
    const product = byId.get(productId);
    const family = getFamily(a.familyId);
    const pricingType = pricingTypeFor(product, family);
    const productName = product?.name ?? family.label;
    if (pricingType === "linear_meter") {
      const lengthMeters = round2(Math.max(0, a.lengthM));
      productList.push({ productId, productName, familyId: a.familyId, pricingType, quantity: lengthMeters, lengthMeters, elementCount: a.count });
    } else {
      productList.push({ productId, productName, familyId: a.familyId, pricingType, quantity: a.pieces, elementCount: a.count });
    }
  }

  return { calibrated, families: familyList, products: productList, unassignedElements: unassigned };
}

/** One item in the `items` array of POST /api/cart/bulk-add. */
export interface BulkAddCartItem {
  productName: string;
  quantity: number;
  length?: number;
  pricingType: CartPricingType;
  applicationArea?: string;
  notes?: string;
}

export interface ToCartItemsOptions {
  applicationArea?: string;
}

/** Shape the per-product take-off for the existing bulk-add endpoint. Zero-quantity lines are dropped. */
export function toCartItems(summary: QuantitySummary, opts: ToCartItemsOptions = {}): BulkAddCartItem[] {
  const items: BulkAddCartItem[] = [];
  for (const p of summary.products) {
    if (!(p.quantity > 0)) continue;
    const item: BulkAddCartItem = {
      productName: p.productName,
      quantity: p.quantity,
      pricingType: p.pricingType,
    };
    if (p.pricingType === "linear_meter") {
      item.length = p.lengthMeters;
      item.notes = `From layout: ${p.elementCount} run${p.elementCount === 1 ? "" : "s"}, ${p.lengthMeters} m`;
    } else {
      item.notes = `From layout: ${p.elementCount} placement${p.elementCount === 1 ? "" : "s"}`;
    }
    if (opts.applicationArea) item.applicationArea = opts.applicationArea;
    items.push(item);
  }
  return items;
}
