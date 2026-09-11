import { describe, it, expect } from "vitest";
import { computeTotals, normaliseComplexity, type PricingInput } from "./computeTotals";
import { HARD_DISCOUNT_CEILING, COMBINED_DISCOUNT_CEILING } from "../discountLimits";

const base = (over: Partial<PricingInput> = {}): PricingInput => ({
  lines: [],
  complexity: "normal",
  reciprocalDiscountPercent: 0,
  partnerDiscountPercent: 0,
  socialDiscountPercent: 0,
  ...over,
});

describe("computeTotals", () => {
  it("(a) single per-unit line, normal complexity, no discount", () => {
    const r = computeTotals(
      base({
        lines: [{ id: "L1", unitPriceAed: 1000, quantity: 2, pricingType: "per-unit" }],
      }),
    );
    expect(r.goodsAed).toBe(2000);
    // 2000 × 9.6271916 % = 192.543832 → 192.54
    expect(r.deliveryAed).toBe(192.54);
    // 2000 × 19.38872 % = 387.7744 → 387.77
    expect(r.installAed).toBe(387.77);
    expect(r.discountPercentApplied).toBe(0);
    expect(r.discountAed).toBe(0);
    expect(r.servicePackageAed).toBe(0);
    expect(r.subtotalAed).toBe(2580.31);
    expect(r.vatAed).toBe(0);
    expect(r.totalAed).toBe(2580.31);
    expect(r.lines).toEqual([{ id: "L1", lineTotalAed: 2000 }]);
  });

  it("(b) per-metre line 3 × 2.4 m", () => {
    const r = computeTotals(
      base({
        complexity: "simple",
        lines: [
          { id: "M1", unitPriceAed: 100, quantity: 3, lengthMeters: 2.4, pricingType: "per-meter" },
        ],
      }),
    );
    // 100 × 3 × 2.4 = 720 (float noise must be rounded away)
    expect(r.lines).toEqual([{ id: "M1", lineTotalAed: 720 }]);
    expect(r.goodsAed).toBe(720);
    // 720 × 9.6271916 % = 69.31577952 → 69.32
    expect(r.deliveryAed).toBe(69.32);
    // simple: 720 × 11.48264 % = 82.675008 → 82.68
    expect(r.installAed).toBe(82.68);
    expect(r.subtotalAed).toBe(872);
    expect(r.totalAed).toBe(872);
  });

  it("(b2) per-metre line without lengthMeters treats length as 1", () => {
    const r = computeTotals(
      base({
        lines: [{ id: "M2", unitPriceAed: 100, quantity: 3, pricingType: "per-meter" }],
      }),
    );
    expect(r.goodsAed).toBe(300);
  });

  it("(b3) install rates by complexity: simple / normal / complex", () => {
    const line = { id: "X", unitPriceAed: 10000, quantity: 1, pricingType: "per-unit" as const };
    expect(computeTotals(base({ lines: [line], complexity: "simple" })).installAed).toBe(1148.26);
    expect(computeTotals(base({ lines: [line], complexity: "normal" })).installAed).toBe(1938.87);
    expect(computeTotals(base({ lines: [line], complexity: "complex" })).installAed).toBe(2628.98);
  });

  it("(c) discount cap: 35 % requested → 30 % applied (Platinum tier, ≥ AED 2m)", () => {
    const r = computeTotals(
      base({
        lines: [{ id: "BIG", unitPriceAed: 2_000_000, quantity: 1, pricingType: "per-unit" }],
        reciprocalDiscountPercent: 35,
      }),
    );
    expect(r.discountPercentApplied).toBe(30);
    expect(r.discountPercentApplied).toBeLessThanOrEqual(HARD_DISCOUNT_CEILING);
    expect(r.discountAed).toBe(600_000);
  });

  it("(c2) discount cap follows the size tiers in discountLimits (Standard tier caps at 25 %)", () => {
    const r = computeTotals(
      base({
        lines: [{ id: "S", unitPriceAed: 10_000, quantity: 1, pricingType: "per-unit" }],
        reciprocalDiscountPercent: 35,
      }),
    );
    expect(r.discountPercentApplied).toBe(25);
    expect(r.discountAed).toBe(2500);
  });

  it("(d) partner 15 % + reciprocal 30 % → 40 % combined ceiling, partner shaved first", () => {
    const r = computeTotals(
      base({
        lines: [{ id: "BIG", unitPriceAed: 2_000_000, quantity: 1, pricingType: "per-unit" }],
        reciprocalDiscountPercent: 30,
        partnerDiscountPercent: 15,
      }),
    );
    expect(r.discountPercentApplied).toBe(COMBINED_DISCOUNT_CEILING);
    expect(r.discountPercentApplied).toBe(40);
    expect(r.discountAed).toBe(800_000);
  });

  it("(d2) partner alone is clamped to 15 %", () => {
    const r = computeTotals(
      base({
        lines: [{ id: "S", unitPriceAed: 10_000, quantity: 1, pricingType: "per-unit" }],
        partnerDiscountPercent: 35,
      }),
    );
    expect(r.discountPercentApplied).toBe(15);
    expect(r.discountAed).toBe(1500);
  });

  it("(d3) social discount stacks on top but the 40 % combined ceiling still holds", () => {
    const small = computeTotals(
      base({
        lines: [{ id: "S", unitPriceAed: 10_000, quantity: 1, pricingType: "per-unit" }],
        reciprocalDiscountPercent: 10,
        socialDiscountPercent: 1,
      }),
    );
    expect(small.discountPercentApplied).toBe(11);
    expect(small.discountAed).toBe(1100);

    const maxed = computeTotals(
      base({
        lines: [{ id: "S", unitPriceAed: 10_000, quantity: 1, pricingType: "per-unit" }],
        reciprocalDiscountPercent: 25,
        partnerDiscountPercent: 15,
        socialDiscountPercent: 1,
      }),
    );
    expect(maxed.discountPercentApplied).toBe(40);
  });

  it("(e) service package is added flat after discount and is never discounted", () => {
    const r = computeTotals(
      base({
        lines: [{ id: "P", unitPriceAed: 1000, quantity: 1, pricingType: "per-unit" }],
        reciprocalDiscountPercent: 10,
        servicePackageAed: 500,
      }),
    );
    expect(r.discountPercentApplied).toBe(10);
    expect(r.discountAed).toBe(100); // 10 % of goods (1000), NOT of goods + service (1500)
    expect(r.servicePackageAed).toBe(500);
    // 1000 − 100 + 96.27 + 193.89 + 500
    expect(r.subtotalAed).toBe(1690.16);
    expect(r.totalAed).toBe(1690.16);
  });

  it("(e2) non-product lines count toward goods but not toward the discount base", () => {
    const r = computeTotals(
      base({
        lines: [
          { id: "P", unitPriceAed: 1000, quantity: 1, pricingType: "per-unit" },
          { id: "SVC", unitPriceAed: 200, quantity: 1, pricingType: "per-unit", isProduct: false, includesDelivery: false, includesInstall: false },
        ],
        reciprocalDiscountPercent: 10,
      }),
    );
    expect(r.goodsAed).toBe(1200);
    expect(r.discountAed).toBe(100);
    // Delivery / install on the product line only
    expect(r.deliveryAed).toBe(96.27);
    expect(r.installAed).toBe(193.89);
  });

  it("(e3) includesDelivery / includesInstall flags exclude a line from those charges", () => {
    const r = computeTotals(
      base({
        lines: [
          { id: "A", unitPriceAed: 1000, quantity: 1, pricingType: "per-unit", includesDelivery: false },
          { id: "B", unitPriceAed: 1000, quantity: 1, pricingType: "per-unit", includesInstall: false },
        ],
      }),
    );
    expect(r.goodsAed).toBe(2000);
    expect(r.deliveryAed).toBe(96.27); // only line B
    expect(r.installAed).toBe(193.89); // only line A
  });

  it("(f) VAT 5 % on subtotal", () => {
    const plain = computeTotals(
      base({
        lines: [{ id: "P", unitPriceAed: 1000, quantity: 1, pricingType: "per-unit", includesDelivery: false, includesInstall: false }],
        vatPercent: 5,
      }),
    );
    expect(plain.subtotalAed).toBe(1000);
    expect(plain.vatAed).toBe(50);
    expect(plain.totalAed).toBe(1050);

    const full = computeTotals(
      base({
        lines: [{ id: "L1", unitPriceAed: 1000, quantity: 2, pricingType: "per-unit" }],
        vatPercent: 5,
      }),
    );
    expect(full.subtotalAed).toBe(2580.31);
    expect(full.vatAed).toBe(129.02); // 129.0155 → 129.02
    expect(full.totalAed).toBe(2709.33);
  });

  it("(f2) VAT defaults to 0 (budgetary)", () => {
    const r = computeTotals(
      base({ lines: [{ id: "P", unitPriceAed: 1000, quantity: 1, pricingType: "per-unit" }] }),
    );
    expect(r.vatAed).toBe(0);
    expect(r.totalAed).toBe(r.subtotalAed);
  });

  it("(g) rounding: 3 × 0.333 on one line is 1.00 (rounded after multiplying), never 0.999", () => {
    const r = computeTotals(
      base({
        lines: [{ id: "R", unitPriceAed: 0.333, quantity: 3, pricingType: "per-unit", includesDelivery: false, includesInstall: false }],
      }),
    );
    expect(r.lines[0].lineTotalAed).toBe(1);
    expect(r.goodsAed).toBe(1);
    expect(r.totalAed).toBe(1);
  });

  it("(g2) rounding: every reported figure is an exact 2 dp number and goods equals the sum of the reported lines", () => {
    const r = computeTotals(
      base({
        lines: [
          { id: "A", unitPriceAed: 0.333, quantity: 1, pricingType: "per-unit" },
          { id: "B", unitPriceAed: 0.333, quantity: 1, pricingType: "per-unit" },
          { id: "C", unitPriceAed: 0.333, quantity: 1, pricingType: "per-unit" },
          { id: "D", unitPriceAed: 0.1, quantity: 1, pricingType: "per-unit" },
          { id: "E", unitPriceAed: 0.2, quantity: 1, pricingType: "per-unit" },
        ],
        vatPercent: 5,
      }),
    );
    const sumOfLines = r.lines.reduce((s, l) => s + l.lineTotalAed, 0);
    expect(r.goodsAed).toBe(Math.round(sumOfLines * 100) / 100);
    expect(r.goodsAed).toBe(1.29); // 0.33 + 0.33 + 0.33 + 0.1 + 0.2 — not 1.2900000000000003
    for (const v of [r.goodsAed, r.deliveryAed, r.installAed, r.discountAed, r.subtotalAed, r.vatAed, r.totalAed]) {
      expect(Number.isInteger(Math.round(v * 100))).toBe(true);
      expect(v).toBe(Math.round(v * 100) / 100);
    }
    expect(r.subtotalAed).toBe(Math.round((r.goodsAed - r.discountAed + r.deliveryAed + r.installAed + r.servicePackageAed) * 100) / 100);
    expect(r.totalAed).toBe(Math.round((r.subtotalAed + r.vatAed) * 100) / 100);
  });

  it("(h) garbage in: NaN / negative / non-finite inputs are treated as 0", () => {
    const r = computeTotals(
      base({
        lines: [
          { id: "N", unitPriceAed: Number.NaN, quantity: 2, pricingType: "per-unit" },
          { id: "Q", unitPriceAed: 100, quantity: -1, pricingType: "per-unit" },
          { id: "OK", unitPriceAed: 100, quantity: 1, pricingType: "per-unit" },
        ],
        reciprocalDiscountPercent: -5,
        partnerDiscountPercent: Number.NaN,
        socialDiscountPercent: -1,
        servicePackageAed: Number.NaN,
        vatPercent: -5,
      }),
    );
    expect(r.goodsAed).toBe(100);
    expect(r.discountPercentApplied).toBe(0);
    expect(r.servicePackageAed).toBe(0);
    expect(r.vatAed).toBe(0);
    expect(r.lines.map((l) => l.lineTotalAed)).toEqual([0, 0, 100]);
  });

  it("(i) empty cart is all zeros", () => {
    const r = computeTotals(base());
    expect(r).toEqual({
      goodsAed: 0, deliveryAed: 0, installAed: 0, discountPercentApplied: 0, discountAed: 0,
      servicePackageAed: 0, subtotalAed: 0, vatAed: 0, totalAed: 0, lines: [],
    });
  });
});

describe("normaliseComplexity", () => {
  it("maps the legacy 'standard' label and unknowns to 'normal'", () => {
    expect(normaliseComplexity("simple")).toBe("simple");
    expect(normaliseComplexity("normal")).toBe("normal");
    expect(normaliseComplexity("standard")).toBe("normal");
    expect(normaliseComplexity("complex")).toBe("complex");
    expect(normaliseComplexity("COMPLEX")).toBe("complex");
    expect(normaliseComplexity(undefined)).toBe("normal");
    expect(normaliseComplexity(null)).toBe("normal");
    expect(normaliseComplexity("banana")).toBe("normal");
  });
});
