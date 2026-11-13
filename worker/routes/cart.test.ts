import { describe, it, expect } from "vitest";
import {
  parseCustomCartItemBody,
  customCartItemRow,
  resolveAccessoryLines,
  pricingBasisTier,
  applyServerPricing,
  keepSubSizePrice,
  resolveSubSizePrice,
  selectedVariantSku,
} from "./cart";
import { parseCustomItemFields } from "./customItems";
import { parseAccessoryPricePatch, toAccessoryPrice } from "./accessoryPrices";
import { ACCESSORY_CATALOGUE, type AccessoryPrice } from "../../shared/cartAccessories";
import { cartItemsToPricingLines, computeTotals, lineTotalAed } from "../../shared/pricing";

const priceList = new Map<string, AccessoryPrice>(ACCESSORY_CATALOGUE.map((a) => [a.code, a]));

const validCustom = {
  productName: "Dnata-spec galvanised kick plate",
  description: "Client drawing KP-02",
  customCategory: "product",
  quantity: 4,
  pricingType: "standard_item",
  unitPrice: 185.5,
  requiresDelivery: true,
  requiresInstallation: false,
  pricingBasis: "rep_estimate",
  notes: "Confirm finish with estimation",
  saveToLibrary: true,
};

describe("parseCustomCartItemBody", () => {
  it("accepts a full body and normalises it", () => {
    const r = parseCustomCartItemBody(validCustom);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      productName: "Dnata-spec galvanised kick plate",
      description: "Client drawing KP-02",
      customCategory: "product",
      pricingType: "standard_item",
      unitPrice: 185.5,
      requiresDelivery: true,
      requiresInstallation: false,
      pricingBasis: "rep_estimate",
      quantity: 4,
      notes: "Confirm finish with estimation",
      saveToLibrary: true,
    });
  });

  it("defaults pricingBasis to rep_estimate and the flags to false; accepts numeric strings", () => {
    const r = parseCustomCartItemBody({ productName: " Site survey day rate ", customCategory: "service", quantity: "2", pricingType: "standard_item", unitPrice: "1500" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.productName).toBe("Site survey day rate");
    expect(r.value.pricingBasis).toBe("rep_estimate");
    expect(r.value.requiresDelivery).toBe(false);
    expect(r.value.requiresInstallation).toBe(false);
    expect(r.value.quantity).toBe(2);
    expect(r.value.unitPrice).toBe(1500);
    expect(r.value.description).toBeNull();
    expect(r.value.notes).toBeNull();
    expect(r.value.saveToLibrary).toBe(false);
  });

  it("rejects missing name, bad category / pricing type / basis, negative price and zero quantity", () => {
    const bad = (patch: Record<string, unknown>) => {
      const r = parseCustomCartItemBody({ ...validCustom, ...patch });
      expect(r.ok).toBe(false);
      return r.ok ? "" : r.message;
    };
    expect(bad({ productName: "  " })).toMatch(/productName/);
    expect(bad({ customCategory: "widget" })).toMatch(/customCategory/);
    expect(bad({ pricingType: "per_item" })).toMatch(/pricingType/);
    expect(bad({ pricingBasis: "guess" })).toMatch(/pricingBasis/);
    expect(bad({ unitPrice: -1 })).toMatch(/unitPrice/);
    expect(bad({ unitPrice: "abc" })).toMatch(/unitPrice/);
    expect(bad({ quantity: 0 })).toMatch(/quantity/);
    expect(bad({ quantity: "x", pricingType: "linear_meter" })).toMatch(/metres/);
    expect(parseCustomCartItemBody(null).ok).toBe(false);
    expect(parseCustomItemFields("nope").ok).toBe(false);
  });
});

describe("customCartItemRow", () => {
  it("builds an is_custom cart row priced at unit × quantity with the rep's price untouched", () => {
    const parsed = parseCustomCartItemBody({ ...validCustom, pricingType: "linear_meter", quantity: 12.5, unitPrice: 80 });
    if (!parsed.ok) throw new Error(parsed.message);
    const row = customCartItemRow(parsed.value, "u1", "p1");
    expect(row).toMatchObject({
      userId: "u1",
      projectId: "p1",
      productName: "Dnata-spec galvanised kick plate",
      unitPrice: 80,
      quantity: 12.5,
      totalPrice: 1000,
      pricingTier: "Rep estimate",
      pricingType: "linear_meter",
      requiresDelivery: true,
      requiresInstallation: false,
      isCustom: true,
      customCategory: "product",
      pricingBasis: "rep_estimate",
      accessoryLines: null,
    });
    expect(row.notes).toBe("Client drawing KP-02\nConfirm finish with estimation");
    expect(pricingBasisTier("estimation_team")).toBe("Estimation team price");
    expect(pricingBasisTier("price_list")).toBe("Price list");

    // The same row prices through the shared mapping like any other line.
    const [line] = cartItemsToPricingLines([{ id: "c", ...row }]);
    expect(line.pricingType).toBe("per-meter");
    expect(lineTotalAed(line)).toBe(1000);
  });
});

describe("resolveAccessoryLines", () => {
  const run = { id: "r1", unitPrice: 410, quantity: 24, pricingType: "linear_meter", requiresDelivery: true, requiresInstallation: true };

  it("takes label, unit, price and the to-confirm flag from the price list and defaults per_post quantity to the post count", () => {
    const { lines, unknownCodes } = resolveAccessoryLines(
      [
        { code: "slider-plate-iflex-190", label: "hacked label", unitPriceAed: 1, priceToConfirm: false },
        { code: "fixing-stainless-steel", unitPriceAed: 999 },
        { code: "dock-buffer-pair", quantity: 2 },
      ],
      run,
      priceList,
    );
    expect(unknownCodes).toEqual([]);
    expect(lines).toEqual([
      { code: "slider-plate-iflex-190", label: "iFlex 190 Post Slider Plate (230 × 230 mm)", unit: "per_post", quantity: 12, unitPriceAed: 513, priceToConfirm: false },
      { code: "fixing-stainless-steel", label: "Stainless steel (SS) fixings", unit: "per_post", quantity: 12, unitPriceAed: null, priceToConfirm: true },
      { code: "dock-buffer-pair", label: "Dock Buffer (Pair)", unit: "per_pair", quantity: 2, unitPriceAed: 2287.08, priceToConfirm: false },
    ]);
    // ...and the stored lines price through computeTotals: 24 × 410 + 12 × 513 + 2 × 2287.08 (SS fixings → 0).
    const totals = computeTotals({ lines: cartItemsToPricingLines([{ ...run, accessoryLines: lines }]), complexity: "normal", reciprocalDiscountPercent: 0, partnerDiscountPercent: 0, socialDiscountPercent: 0 });
    expect(totals.goodsAed).toBe(9840 + 6156 + 4574.16);
  });

  it("reports unknown and inactive codes instead of storing them, skips junk, and collapses duplicates", () => {
    const list = new Map(priceList);
    list.set("retired-thing", { ...priceList.get("l-bracket")!, code: "retired-thing", active: false });
    const { lines, unknownCodes } = resolveAccessoryLines(
      [{ code: "nope" }, { code: "retired-thing" }, null, "str", { label: "no code" }, { code: "l-bracket", quantity: 2 }, { code: "l-bracket", quantity: 5 }],
      { id: "b", quantity: 6, pricingType: "per_item" },
      list,
    );
    expect(unknownCodes).toEqual(["nope", "retired-thing"]);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(5);
  });

  it("uses the admin's confirmed price and flag from a DB-shaped row", () => {
    const row = toAccessoryPrice({
      code: "fixing-stainless-steel",
      label: "SS fixings (M12)",
      group: "fixings",
      unit: "per_post",
      priceAed: "42.50",
      priceToConfirm: false,
      appliesToFamilies: null,
      sku: null,
      active: true,
      updatedAt: new Date("2026-10-15T08:00:00Z"),
    });
    expect(row.priceAed).toBe(42.5);
    expect(row.updatedAt).toBe("2026-10-15T08:00:00.000Z");
    const { lines } = resolveAccessoryLines([{ code: "fixing-stainless-steel" }], run, new Map([[row.code, row]]));
    expect(lines[0]).toMatchObject({ label: "SS fixings (M12)", quantity: 12, unitPriceAed: 42.5, priceToConfirm: false });
    expect(resolveAccessoryLines(undefined, run, priceList)).toEqual({ lines: [], unknownCodes: [] });
  });
});

describe("parseAccessoryPricePatch", () => {
  it("stores a price as a 2 dp numeric string and clears the to-confirm flag unless told otherwise", () => {
    expect(parseAccessoryPricePatch({ priceAed: 42.499 })).toEqual({ ok: true, updates: { priceAed: "42.50", priceToConfirm: false } });
    expect(parseAccessoryPricePatch({ priceAed: "10", priceToConfirm: true })).toEqual({ ok: true, updates: { priceAed: "10.00", priceToConfirm: true } });
    expect(parseAccessoryPricePatch({ priceAed: null })).toEqual({ ok: true, updates: { priceAed: null, priceToConfirm: true } });
    expect(parseAccessoryPricePatch({ active: false, label: " Weld plate 10 mm " })).toEqual({ ok: true, updates: { active: false, label: "Weld plate 10 mm" } });
  });

  it("rejects negative prices, non-boolean flags, empty labels and empty bodies", () => {
    expect(parseAccessoryPricePatch({ priceAed: -3 }).ok).toBe(false);
    expect(parseAccessoryPricePatch({ priceToConfirm: "yes" }).ok).toBe(false);
    expect(parseAccessoryPricePatch({ active: 1 }).ok).toBe(false);
    expect(parseAccessoryPricePatch({ label: "" }).ok).toBe(false);
    expect(parseAccessoryPricePatch({}).ok).toBe(false);
    expect(parseAccessoryPricePatch(null).ok).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Sub-size pricing: a line added from an option of a grouped card carries the
// parent row as productName and the picked size as selectedVariant. The
// server prices it from that sub-size on the product row.
// ───────────────────────────────────────────────────────────────────────────

const bollardYellowRow = {
  id: "p-yellow",
  name: "Bollard, Yellow",
  price: "1557.50",
  priceListSource: null,
  specifications: {
    variants: [
      { code: "S-01-07-0057", name: "190 OD x 835 mm", od_mm: 190, price: 1557.5, height_mm: 835, length_mm: null },
      { code: "S-01-07-0053", name: "190 OD x 1200 mm", od_mm: 190, price: 1865.14, height_mm: 1200, length_mm: null },
      { code: "S-01-07-0065", name: "210 OD x 1200 mm", od_mm: 210, price: 2348.11, height_mm: 1200, length_mm: null },
    ],
  },
};
// A price-list row whose spec sub-sizes are stale (older prices).
const trafficGateRow = {
  id: "p-gate",
  name: "Traffic Gate",
  price: "14804.10",
  priceListSource: "PRL-1019-ASF-AED-07112025-1",
  specifications: { variants: [{ code: "A-01-12-0368", name: "2000 mm", price: 14999.59, height_mm: 2000, length_mm: null }] },
};

/** Storage stub: products by name, no product_pricing tier rows unless given. */
function stubStorage(opts: { tiers?: Record<string, { unitPrice: number; tier: string }>; priceVariants?: Record<string, unknown[]> } = {}) {
  const rows: Record<string, any> = { [bollardYellowRow.name]: bollardYellowRow, [trafficGateRow.name]: trafficGateRow };
  const updates: any[] = [];
  return {
    updates,
    async calculatePrice(productName: string, quantity: number) {
      const tier = opts.tiers?.[productName];
      if (tier) return { unitPrice: tier.unitPrice, totalPrice: Math.round(tier.unitPrice * quantity * 100) / 100, tier: tier.tier };
      const row = rows[productName];
      if (!row?.price) return { unitPrice: 0, totalPrice: 0, tier: "No pricing available", requiresQuote: true };
      const unitPrice = parseFloat(row.price);
      return { unitPrice, totalPrice: Math.round(unitPrice * quantity * 100) / 100, tier: "Base Product Price" };
    },
    async getProductByName(name: string) {
      return rows[name];
    },
    async getProductVariants(productId?: string) {
      return opts.priceVariants?.[String(productId)] ?? [];
    },
    async updateCartItem(id: string, patch: any) {
      updates.push({ id, patch });
      return { id, ...patch };
    },
  } as any;
}

describe("selectedVariantSku", () => {
  it("reads code or sku, from an object or a JSON string", () => {
    expect(selectedVariantSku({ code: "S-01-07-0053" })).toBe("S-01-07-0053");
    expect(selectedVariantSku({ sku: " S-01-07-0065 " })).toBe("S-01-07-0065");
    expect(selectedVariantSku(JSON.stringify({ code: "S-01-07-0057" }))).toBe("S-01-07-0057");
    expect(selectedVariantSku(null)).toBeNull();
    expect(selectedVariantSku({})).toBeNull();
    expect(selectedVariantSku("not json")).toBeNull();
    expect(selectedVariantSku({ code: 42 })).toBeNull();
  });
});

describe("applyServerPricing — sub-size lines", () => {
  it("prices a line from the sub-size its selectedVariant SKU names, not the row headline", async () => {
    const item: any = { productName: "Bollard, Yellow", quantity: 4, unitPrice: 1865.14, selectedVariant: { code: "S-01-07-0053", price: 1865.14 } };
    expect(await applyServerPricing(stubStorage(), item)).toBe(true);
    expect(item.unitPrice).toBe(1865.14);
    expect(item.totalPrice).toBe(7460.56);
    expect(item.pricingTier).toBe("Variant Price");
  });

  it("ignores the client's figure: the catalogue sub-size price wins", async () => {
    const item: any = { productName: "Bollard, Yellow", quantity: 2, unitPrice: 1, totalPrice: 2, selectedVariant: { code: "S-01-07-0065", price: 1 } };
    await applyServerPricing(stubStorage(), item);
    expect(item.unitPrice).toBe(2348.11);
    expect(item.totalPrice).toBe(4696.22);
    // The stored variant is corrected too.
    expect(item.selectedVariant.price).toBe(2348.11);
  });

  it("never trusts a client price whose SKU is not a sub-size of the row", async () => {
    // Grey's SKU on the Yellow row, with a made-up price.
    const item: any = { productName: "Bollard, Yellow", quantity: 3, unitPrice: 9.99, selectedVariant: { code: "S-01-07-0078", price: 9.99 } };
    expect(await applyServerPricing(stubStorage(), item)).toBe(true);
    expect(item.unitPrice).toBe(1557.5);
    expect(item.totalPrice).toBe(4672.5);
    expect(item.pricingTier).toBe("Base Product Price");
  });

  it("leaves a line with no selected variant on the row price", async () => {
    const item: any = { productName: "Bollard, Yellow", quantity: 1, unitPrice: 5000 };
    await applyServerPricing(stubStorage(), item);
    expect(item.unitPrice).toBe(1557.5);
  });

  it("does not use stale spec sub-sizes on a price-list row", async () => {
    const item: any = { productName: "Traffic Gate", quantity: 1, unitPrice: 14999.59, selectedVariant: { code: "A-01-12-0368", price: 14999.59 } };
    await applyServerPricing(stubStorage(), item);
    expect(item.unitPrice).toBe(14804.1);
    // Same answer when the row's price-list variants are what flags it.
    const row2: any = { productName: "Bollard, Yellow", quantity: 1, selectedVariant: { code: "S-01-07-0053" } };
    await applyServerPricing(stubStorage({ priceVariants: { "p-yellow": [{ sku: "X", priceAed: "1" }] } }), row2);
    expect(row2.unitPrice).toBe(1557.5);
  });

  it("leaves quantity-tier pricing alone", async () => {
    const item: any = { productName: "Bollard, Yellow", quantity: 10, selectedVariant: { code: "S-01-07-0053" } };
    await applyServerPricing(stubStorage({ tiers: { "Bollard, Yellow": { unitPrice: 1400, tier: "Tier 2 (10pcs+)" } } }), item);
    expect(item.unitPrice).toBe(1400);
    expect(item.pricingTier).toBe("Tier 2 (10pcs+)");
  });

  it("still trusts a client variant price when the catalogue has no price for the name", async () => {
    // Existing behaviour for variant-named lines that match no product row.
    const item: any = { productName: "eFlex Single Rack End Barrier – 1500 mm", quantity: 2, unitPrice: 2100, selectedVariant: { code: "A-01-05-0080" } };
    expect(await applyServerPricing(stubStorage(), item)).toBe(true);
    expect(item.unitPrice).toBe(2100);
    expect(item.totalPrice).toBe(4200);
  });
});

describe("resolveSubSizePrice / keepSubSizePrice", () => {
  it("resolves only per-unit catalogue lines that name a sub-size", async () => {
    const s = stubStorage();
    expect(await resolveSubSizePrice(s, { productName: "Bollard, Yellow", selectedVariant: { code: "S-01-07-0057" } })).toEqual({ sku: "S-01-07-0057", unitPrice: 1557.5 });
    expect(await resolveSubSizePrice(s, { productName: "Bollard, Yellow", pricingType: "linear_meter", selectedVariant: { code: "S-01-07-0057" } })).toBeNull();
    expect(await resolveSubSizePrice(s, { productName: "Bollard, Yellow", isCustom: true, selectedVariant: { code: "S-01-07-0057" } })).toBeNull();
    expect(await resolveSubSizePrice(s, { productName: "No Such Product", selectedVariant: { code: "S-01-07-0057" } })).toBeNull();
    expect(await resolveSubSizePrice(s, { productName: "Bollard, Yellow" })).toBeNull();
  });

  it("puts a sub-size line back on its own price after a quantity change", async () => {
    const s = stubStorage();
    // What storage.updateCartItem returns after re-pricing by name: the row headline.
    const afterUpdate = { id: "c1", productName: "Bollard, Yellow", quantity: 5, unitPrice: "1557.50", totalPrice: "7787.50", selectedVariant: { code: "S-01-07-0053" } };
    const fixed = await keepSubSizePrice(s, afterUpdate, true);
    expect(s.updates).toEqual([{ id: "c1", patch: { unitPrice: 1865.14, totalPrice: 9325.7, pricingTier: "Variant Price" } }]);
    expect(fixed.unitPrice).toBe(1865.14);
  });

  it("writes nothing when the quantity did not change, the price is already right, or the line names no sub-size", async () => {
    const s = stubStorage();
    const line = { id: "c1", productName: "Bollard, Yellow", quantity: 5, unitPrice: "1557.50", totalPrice: "7787.50", selectedVariant: { code: "S-01-07-0053" } };
    expect(await keepSubSizePrice(s, line, false)).toBe(line);
    const right = { ...line, unitPrice: "1865.14", totalPrice: "9325.70" };
    expect(await keepSubSizePrice(s, right, true)).toBe(right);
    const plain = { id: "c2", productName: "Bollard, Yellow", quantity: 5, unitPrice: "1557.50", totalPrice: "7787.50" };
    expect(await keepSubSizePrice(s, plain, true)).toBe(plain);
    expect(s.updates).toEqual([]);
  });
});
