import { describe, it, expect } from "vitest";
import { parseCustomCartItemBody, customCartItemRow, resolveAccessoryLines, pricingBasisTier } from "./cart";
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
