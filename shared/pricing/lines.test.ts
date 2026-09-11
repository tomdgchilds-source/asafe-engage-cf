import { describe, it, expect } from "vitest";
import {
  cartItemsToPricingLines,
  isPerMetreType,
  isPerMetreItem,
  servicePackageAed,
  socialDiscountPercent,
} from "./lines";
import { computeTotals, lineTotalAed, DELIVERY_RATE, INSTALL_RATES, round2 } from "./computeTotals";

describe("cartItemsToPricingLines", () => {
  it("maps a plain per-unit cart row one-to-one", () => {
    const [l] = cartItemsToPricingLines([
      { id: "a", unitPrice: 100, quantity: 3, pricingType: "standard_item", requiresDelivery: true, requiresInstallation: true },
    ]);
    expect(l).toEqual({
      id: "a",
      unitPriceAed: 100,
      quantity: 3,
      pricingType: "per-unit",
      includesDelivery: true,
      includesInstall: true,
      isProduct: true,
    });
  });

  it("accepts numeric strings for unitPrice and quantity (Drizzle numeric columns)", () => {
    const [l] = cartItemsToPricingLines([{ id: "s", unitPrice: "75.50", quantity: "2", pricingType: "per_item" }]);
    expect(l.unitPriceAed).toBe(75.5);
    expect(l.quantity).toBe(2);
    expect(lineTotalAed(l)).toBe(151);
  });

  it("treats every per-metre spelling as per-meter with quantity = metres", () => {
    const spellings = ["linear_meter", "per-meter", "per_meter", "per_metre", "per-metre", "LINEAR_METER", "perMeter"];
    const lines = cartItemsToPricingLines(
      spellings.map((pricingType, i) => ({ id: `m${i}`, unitPrice: 50, quantity: 2.4, pricingType })),
    );
    for (const l of lines) {
      expect(l.pricingType).toBe("per-meter");
      expect(l.quantity).toBe(2.4);
      expect(l.lengthMeters).toBeUndefined();
      expect(lineTotalAed(l)).toBe(120);
    }
    expect(isPerMetreType("linear_meter")).toBe(true);
    expect(isPerMetreType("per_item")).toBe(false);
    expect(isPerMetreType(undefined)).toBe(false);
  });

  it("does not treat per-unit spellings as per-metre", () => {
    for (const t of ["standard_item", "per_item", "per-unit", "single_item", "", null, undefined]) {
      const [l] = cartItemsToPricingLines([{ id: "u", unitPrice: 10, quantity: 4, pricingType: t }]);
      expect(l.pricingType).toBe("per-unit");
      expect(l.quantity).toBe(4);
    }
  });

  it("lengthMeters > 0 makes the line per-metre and becomes its quantity (never double-counted)", () => {
    // shared/layout/quantities.ts stores quantity AND lengthMeters as metres.
    const [both] = cartItemsToPricingLines([
      { id: "L", unitPrice: 100, quantity: 3.5, lengthMeters: 3.5, pricingType: "linear_meter" },
    ]);
    expect(both.pricingType).toBe("per-meter");
    expect(both.quantity).toBe(3.5);
    expect(both.lengthMeters).toBeUndefined();
    expect(lineTotalAed(both)).toBe(350);

    // Type says per-unit but a run length is present → per-metre by length.
    const [byLength] = cartItemsToPricingLines([
      { id: "L2", unitPrice: 100, quantity: 1, lengthMeters: "2.5", pricingType: "per_item" },
    ]);
    expect(byLength.pricingType).toBe("per-meter");
    expect(byLength.quantity).toBe(2.5);
    expect(isPerMetreItem({ pricingType: "per_item", lengthMeters: 2.5 })).toBe(true);

    // Zero / junk length does not flip a per-unit line.
    const [zero] = cartItemsToPricingLines([{ id: "L3", unitPrice: 100, quantity: 2, lengthMeters: 0, pricingType: "per_item" }]);
    expect(zero.pricingType).toBe("per-unit");
    expect(zero.quantity).toBe(2);
  });

  it("legacy lines with the flags undefined carry neither delivery nor install", () => {
    const [l] = cartItemsToPricingLines([{ id: "legacy", unitPrice: 100, quantity: 1, pricingType: "per_item" }]);
    expect(l.includesDelivery).toBe(false);
    expect(l.includesInstall).toBe(false);

    const totals = computeTotals({
      lines: [l],
      complexity: "normal",
      reciprocalDiscountPercent: 0,
      partnerDiscountPercent: 0,
      socialDiscountPercent: 0,
    });
    expect(totals.deliveryAed).toBe(0);
    expect(totals.installAed).toBe(0);
  });

  it("null and false flags do not carry; explicit true or 'true' string carries", () => {
    const lines = cartItemsToPricingLines([
      { id: "n", unitPrice: 1, quantity: 1, pricingType: "per_item", requiresDelivery: null, requiresInstallation: null },
      { id: "f", unitPrice: 1, quantity: 1, pricingType: "per_item", requiresDelivery: false, requiresInstallation: false },
      { id: "t", unitPrice: 1, quantity: 1, pricingType: "per_item", requiresDelivery: true, requiresInstallation: false },
      { id: "str", unitPrice: 1, quantity: 1, pricingType: "per_item", requiresDelivery: "false" as any, requiresInstallation: "true" as any },
    ]);
    expect(lines.map((l) => [l.includesDelivery, l.includesInstall])).toEqual([
      [false, false],
      [false, false],
      [true, false],
      [false, true],
    ]);
  });

  it("falls back to an index id, ignores junk numbers, and tolerates null / empty input", () => {
    const [l] = cartItemsToPricingLines([{ unitPrice: "abc", quantity: null, pricingType: "single_item" }]);
    expect(l.id).toBe("line-0");
    expect(l.unitPriceAed).toBe(0);
    expect(l.quantity).toBe(0);
    expect(l.pricingType).toBe("per-unit");
    expect(l.isProduct).toBe(true);

    const [, second] = cartItemsToPricingLines([{ id: 7 }, null]);
    expect(second.id).toBe("line-1");
    expect(cartItemsToPricingLines([{ id: 7 }])[0].id).toBe("7");
    expect(cartItemsToPricingLines([{ id: "" }])[0].id).toBe("line-0");

    expect(cartItemsToPricingLines(null)).toEqual([]);
    expect(cartItemsToPricingLines(undefined)).toEqual([]);
    expect(cartItemsToPricingLines([])).toEqual([]);
  });

  it("prices a mixed cart the same whether it came from cart_items or an order snapshot", () => {
    const cartRows = [
      { id: "c1", unitPrice: "1000.00", quantity: "2", pricingType: "standard_item", requiresDelivery: true, requiresInstallation: false },
      { id: "c2", unitPrice: "80.00", quantity: "12.5", pricingType: "linear_meter", requiresDelivery: true, requiresInstallation: true },
    ];
    const snapshot = [
      { id: "c1", unitPrice: 1000, quantity: 2, pricingType: "standard_item", requiresDelivery: true, requiresInstallation: false },
      { id: "c2", unitPrice: 80, quantity: 12.5, pricingType: "per-meter", requiresDelivery: true, requiresInstallation: true },
    ];
    const input = (lines: ReturnType<typeof cartItemsToPricingLines>) => ({
      lines,
      complexity: "normal" as const,
      reciprocalDiscountPercent: 10,
      partnerDiscountPercent: 0,
      socialDiscountPercent: 0,
    });
    const a = computeTotals(input(cartItemsToPricingLines(cartRows)));
    const b = computeTotals(input(cartItemsToPricingLines(snapshot)));
    expect(a).toEqual(b);
    expect(a.goodsAed).toBe(3000);
    expect(a.deliveryAed).toBe(round2(3000 * DELIVERY_RATE));
    expect(a.installAed).toBe(round2(1000 * INSTALL_RATES.normal));
  });
});

describe("servicePackageAed", () => {
  it("is a flat % of goods rounded to 2 dp", () => {
    expect(servicePackageAed(3000, 5)).toBe(150);
    expect(servicePackageAed(1234.56, 7.5)).toBe(92.59);
  });
  it("is 0 for no goods, no rate, or junk", () => {
    expect(servicePackageAed(0, 5)).toBe(0);
    expect(servicePackageAed(3000, 0)).toBe(0);
    expect(servicePackageAed(NaN, 5)).toBe(0);
    expect(servicePackageAed(3000, -5)).toBe(0);
  });
});

describe("socialDiscountPercent", () => {
  it("expresses an AED amount as a % of goods, unrounded", () => {
    expect(socialDiscountPercent(30, 3000)).toBe(1);
    expect(socialDiscountPercent(2500, 250000)).toBe(1);
    expect(socialDiscountPercent(100, 30000)).toBeCloseTo(0.3333333, 6);
  });
  it("round-trips the AED amount through computeTotals", () => {
    const goods = 30000;
    const amount = 100;
    const totals = computeTotals({
      lines: cartItemsToPricingLines([{ id: "x", unitPrice: goods, quantity: 1, pricingType: "per_item" }]),
      complexity: "normal",
      reciprocalDiscountPercent: 0,
      partnerDiscountPercent: 0,
      socialDiscountPercent: socialDiscountPercent(amount, goods),
    });
    expect(totals.discountAed).toBe(amount);
  });
  it("is 0 for no goods or no amount", () => {
    expect(socialDiscountPercent(100, 0)).toBe(0);
    expect(socialDiscountPercent(0, 3000)).toBe(0);
    expect(socialDiscountPercent(-5, 3000)).toBe(0);
  });
});
