import { describe, expect, it } from "vitest";
import {
  accessoriesSubtotal,
  accessoryLineFromOption,
  applicableAccessoryOptions,
  customItemToCartPayload,
  defaultAccessoryQuantity,
  emptyCustomItem,
  formatAccessoryPrice,
  formatAed,
  lineTotalWithAccessories,
  parseNumberInput,
  postCountForMetres,
  savableAccessoryLines,
  savedItemToCartPayload,
  validateCustomItem,
  type DraftAccessoryLine,
  type AccessoryPriceOption,
  type SavedCustomItem,
} from "./customItems";

const option = (over: Partial<AccessoryPriceOption> = {}): AccessoryPriceOption => ({
  code: "ss-fixings-pair",
  label: "Stainless steel fixings",
  group: "fixings",
  unit: "per_pair",
  priceAed: 2287.08,
  priceToConfirm: false,
  appliesToFamilies: null,
  sku: null,
  active: true,
  ...over,
});

describe("price formatting", () => {
  it("formats AED to 2 dp with grouping", () => {
    expect(formatAed(2287.08)).toBe("AED 2,287.08");
    expect(formatAed(5)).toBe("AED 5.00");
    expect(formatAed(NaN)).toBe("AED 0.00");
  });

  it("appends the unit suffix", () => {
    expect(formatAccessoryPrice(option())).toBe("AED 2,287.08 / pair");
    expect(formatAccessoryPrice(option({ unit: "per_post", priceAed: 45 }))).toBe("AED 45.00 / post");
    expect(formatAccessoryPrice(option({ unit: "per_metre", priceAed: 12.5 }))).toBe("AED 12.50 / m");
    expect(formatAccessoryPrice(option({ unit: "each", priceAed: 99 }))).toBe("AED 99.00 each");
  });

  it("says 'Price to confirm' when there is no price or the TBC flag is set", () => {
    expect(formatAccessoryPrice(option({ priceAed: null }))).toBe("Price to confirm");
    expect(formatAccessoryPrice(option({ priceToConfirm: true }))).toBe("Price to confirm");
  });
});

describe("default quantities", () => {
  it("counts posts as ceil(L / 2.2) + 1 (shared formula)", () => {
    expect(postCountForMetres(0)).toBe(0);
    expect(postCountForMetres(1)).toBe(2);
    expect(postCountForMetres(2.2)).toBe(2);
    expect(postCountForMetres(2.5)).toBe(3);
    expect(postCountForMetres(10)).toBe(6);
  });

  it("per_post on a per-metre run uses the post count", () => {
    expect(defaultAccessoryQuantity("per_post", { quantity: 10, pricingType: "linear_meter" })).toBe(6);
    expect(defaultAccessoryQuantity("per_post", { quantity: 1, pricingType: "single_item", lengthMeters: 10 })).toBe(6);
  });

  it("per_post on a per-unit line (bollard, lengthed SKU) is one per unit", () => {
    expect(defaultAccessoryQuantity("per_post", { quantity: 4, pricingType: "single_item" })).toBe(4);
  });

  it("per_metre takes the run metres; each / per_pair follow the line quantity for units, 1 for runs", () => {
    expect(defaultAccessoryQuantity("per_metre", { quantity: 12.4, pricingType: "linear_meter" })).toBe(12.4);
    expect(defaultAccessoryQuantity("per_metre", { quantity: 3, pricingType: "single_item" })).toBe(3);
    expect(defaultAccessoryQuantity("per_pair", { quantity: 12, pricingType: "linear_meter" })).toBe(1);
    expect(defaultAccessoryQuantity("each", { quantity: 5, pricingType: "single_item" })).toBe(5);
  });

  it("never returns less than 1", () => {
    expect(defaultAccessoryQuantity("per_post", {})).toBe(1);
    expect(defaultAccessoryQuantity("per_metre", { quantity: 0 })).toBe(1);
  });

  it("leaves per_post quantity to the server on a run, fills it for per-unit lines", () => {
    const run = accessoryLineFromOption(option({ unit: "per_post", priceAed: 45 }), {
      quantity: 10,
      pricingType: "linear_meter",
    });
    expect(run.quantity).toBeUndefined();
    const bollard = accessoryLineFromOption(option({ unit: "per_post", priceAed: 45 }), {
      quantity: 4,
      pricingType: "single_item",
    });
    expect(bollard.quantity).toBe(4);
  });

  it("copies price and TBC flag from the option", () => {
    const l = accessoryLineFromOption(option({ priceAed: null, priceToConfirm: true }), { quantity: 1 });
    expect(l.unitPriceAed).toBeNull();
    expect(l.priceToConfirm).toBe(true);
    expect(l.quantity).toBe(1);
  });
});

describe("subtotals", () => {
  const lines: DraftAccessoryLine[] = [
    { code: "a", label: "A", unit: "per_pair", quantity: 2, unitPriceAed: 2287.08, priceToConfirm: false },
    { code: "b", label: "B", unit: "each", quantity: 3, unitPriceAed: 10.005, priceToConfirm: false },
    { code: "c", label: "C", unit: "each", quantity: 1, unitPriceAed: null, priceToConfirm: true },
  ];

  it("sums priced lines and flags TBC ones", () => {
    const s = accessoriesSubtotal(lines);
    expect(s.totalAed).toBe(4604.18); // 4574.16 + 30.02
    expect(s.hasTbc).toBe(true);
    expect(s.pricedCount).toBe(2);
    expect(s.tbcCount).toBe(1);
  });

  it("uses the default quantity for a line the server has not filled yet", () => {
    const s = accessoriesSubtotal(
      [{ code: "p", label: "P", unit: "per_post", unitPriceAed: 10, priceToConfirm: false }],
      { quantity: 10, pricingType: "linear_meter" },
    );
    expect(s.totalAed).toBe(60);
  });

  it("adds accessories onto the cart line total", () => {
    expect(lineTotalWithAccessories({ totalPrice: "100.5", accessoryLines: lines })).toBe(4704.68);
    expect(lineTotalWithAccessories({ totalPrice: 100, accessoryLines: null })).toBe(100);
  });
});

describe("applicable options", () => {
  const opts = [
    option({ code: "any" }),
    option({ code: "iflex-only", appliesToFamilies: ["iFlex"] }),
    option({ code: "bollard-only", appliesToFamilies: ["Bollard"] }),
    option({ code: "retired", active: false }),
  ];

  it("filters by family keyword against name and category, case-insensitively", () => {
    const codes = applicableAccessoryOptions(opts, { productName: "IFLEX Single Traffic - 2400mm" }).map((o) => o.code);
    expect(codes).toEqual(["any", "iflex-only"]);
  });

  it("keeps an inactive option the line already carries", () => {
    const codes = applicableAccessoryOptions(opts, {
      productName: "Bollard, Grey",
      accessoryLines: [{ code: "retired", label: "x", unit: "each", quantity: 1, unitPriceAed: 1, priceToConfirm: false }],
    }).map((o) => o.code);
    expect(codes).toEqual(["any", "bollard-only", "retired"]);
  });

  it("drops retired / unknown codes from the PATCH body once the price list is known", () => {
    const lines: DraftAccessoryLine[] = [
      { code: "any", label: "A", unit: "each", quantity: 1, unitPriceAed: 1, priceToConfirm: false },
      { code: "retired", label: "R", unit: "each", quantity: 1, unitPriceAed: 1, priceToConfirm: false },
      { code: "gone", label: "G", unit: "each", quantity: 1, unitPriceAed: 1, priceToConfirm: false },
    ];
    expect(savableAccessoryLines(lines, opts).map((l) => l.code)).toEqual(["any"]);
    expect(savableAccessoryLines(lines, undefined).map((l) => l.code)).toEqual(["any", "retired", "gone"]);
  });
});

describe("custom item validation", () => {
  it("rejects the empty form", () => {
    const { ok, errors } = validateCustomItem(emptyCustomItem());
    expect(ok).toBe(false);
    expect(errors.productName).toBeTruthy();
    expect(errors.unitPrice).toBeTruthy();
  });

  it("accepts a priced rep estimate", () => {
    const { ok, errors } = validateCustomItem({ ...emptyCustomItem(), productName: "Custom ramp", unitPrice: 1500 });
    expect(errors).toEqual({});
    expect(ok).toBe(true);
  });

  it("requires a figure for a rep estimate but allows 0 for the estimation team", () => {
    const base = { ...emptyCustomItem(), productName: "Site survey day", unitPrice: 0 };
    expect(validateCustomItem(base).errors.unitPrice).toBeTruthy();
    expect(validateCustomItem({ ...base, pricingBasis: "estimation_team" }).ok).toBe(true);
  });

  it("checks quantity by pricing type", () => {
    const base = { ...emptyCustomItem(), productName: "Rail", unitPrice: 10 };
    expect(validateCustomItem({ ...base, quantity: 1.5 }).errors.quantity).toBeTruthy();
    expect(validateCustomItem({ ...base, quantity: 1.5, pricingType: "linear_meter" }).ok).toBe(true);
    expect(validateCustomItem({ ...base, quantity: 0 }).errors.quantity).toBeTruthy();
  });

  it("parses typed numbers tolerantly", () => {
    expect(parseNumberInput("AED 1,250.50")).toBe(1250.5);
    expect(parseNumberInput("")).toBeNaN();
    expect(parseNumberInput("abc")).toBeNaN();
  });
});

describe("payloads", () => {
  it("trims and drops empty optional fields", () => {
    const p = customItemToCartPayload({
      ...emptyCustomItem(),
      productName: "  Custom ramp ",
      description: " ",
      unitPrice: 1500.005,
      quantity: 2,
      notes: "",
      saveToLibrary: false,
    });
    expect(p).toEqual({
      productName: "Custom ramp",
      description: undefined,
      customCategory: "product",
      quantity: 2,
      pricingType: "standard_item",
      unitPrice: 1500.01,
      requiresDelivery: true,
      requiresInstallation: true,
      pricingBasis: "rep_estimate",
      notes: undefined,
      saveToLibrary: undefined,
    });
  });

  it("maps a saved library item onto the cart body", () => {
    const saved: SavedCustomItem = {
      id: "ci1",
      productName: "Crane hire",
      description: "Half day",
      customCategory: "service",
      pricingType: "standard_item",
      unitPriceAed: 3200,
      requiresDelivery: false,
      requiresInstallation: false,
      pricingBasis: "estimation_team",
      useCount: 3,
    };
    expect(savedItemToCartPayload(saved, 0)).toMatchObject({
      productName: "Crane hire",
      description: "Half day",
      quantity: 1,
      unitPrice: 3200,
      pricingBasis: "estimation_team",
      requiresDelivery: false,
    });
  });
});
