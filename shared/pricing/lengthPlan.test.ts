import { describe, it, expect } from "vitest";
import { planLength, type LengthVariant } from "./lengthPlan";

// Rack End Barrier style family: one piece per nominal length.
// 2400 mm at AED 2400 gives a clean 1,000 AED/m extension rate.
const RACK_END: LengthVariant[] = [
  { sku: "RE-2400", lengthMm: 2400, priceAed: 2400 },
  { sku: "RE-900", lengthMm: 900, priceAed: 900 },
  { sku: "RE-2000", lengthMm: 2000, priceAed: 2000 },
  { sku: "RE-1100", lengthMm: 1100, priceAed: 1100 },
];

describe("planLength", () => {
  it("2.4 m → single 2400 piece, no extension", () => {
    const p = planLength(RACK_END, 2400)!;
    expect(p).not.toBeNull();
    expect(p.basePiece).toEqual({ sku: "RE-2400", lengthMm: 2400, priceAed: 2400 });
    expect(p.extensionMm).toBe(0);
    expect(p.extensionChargeAed).toBe(0);
    expect(p.extensionRatePerM).toBe(1000);
    expect(p.totalPrice).toBe(2400);
    expect(p.requestedMm).toBe(2400);
    expect(p.label).toBe("1 × 2400 mm");
  });

  it("2.5 m → 2400 base + 0.1 m extension at the base per-metre rate (not two barriers)", () => {
    const p = planLength(RACK_END, 2500)!;
    expect(p.basePiece.sku).toBe("RE-2400");
    expect(p.extensionMm).toBe(100);
    expect(p.extensionRatePerM).toBe(1000);
    expect(p.extensionChargeAed).toBe(100);
    expect(p.totalPrice).toBe(2500);
    expect(p.label).toBe("1 × 2400 mm + 0.10 m extension @ 1000.00 AED/m");
  });

  it("2.6 m prices strictly above 2.5 m (smooth curve across the boundary)", () => {
    const at25 = planLength(RACK_END, 2500)!;
    const at26 = planLength(RACK_END, 2600)!;
    expect(at26.totalPrice).toBeGreaterThan(at25.totalPrice);
    expect(at26.totalPrice).toBe(2600);
    expect(at26.extensionMm).toBe(200);
    // and 2.5 m is nowhere near double the 2.4 m price
    expect(at25.totalPrice).toBeLessThan(planLength(RACK_END, 2400)!.totalPrice * 1.1);
  });

  it("1.0 m → smallest variant when every variant is at least that long", () => {
    const noShort = RACK_END.filter((v) => v.lengthMm >= 1000);
    const p = planLength(noShort, 1000)!;
    expect(p.basePiece.sku).toBe("RE-1100");
    expect(p.extensionMm).toBe(0);
    expect(p.totalPrice).toBe(1100);
  });

  it("1.0 m with a 900 mm variant → smallest variant that is ≥ 1000 mm (1100), never the 900", () => {
    const p = planLength(RACK_END, 1000)!;
    expect(p.basePiece.sku).toBe("RE-1100");
    expect(p.totalPrice).toBe(1100);
  });

  it("below every variant (0.5 m) → the smallest variant", () => {
    const p = planLength(RACK_END, 500)!;
    expect(p.basePiece.sku).toBe("RE-900");
    expect(p.extensionMm).toBe(0);
    expect(p.totalPrice).toBe(900);
  });

  it("extension rate is derived from the LONGEST variant and rounded to 2 dp", () => {
    const real: LengthVariant[] = [
      { sku: "RE-900", lengthMm: 900, priceAed: 1012.5 },
      { sku: "RE-2400", lengthMm: 2400, priceAed: 2341.32 },
    ];
    const p = planLength(real, 3000)!;
    expect(p.extensionRatePerM).toBe(975.55); // 2341.32 / 2.4 = 975.55
    expect(p.extensionMm).toBe(600);
    expect(p.extensionChargeAed).toBe(585.33); // 0.6 × 975.55
    expect(p.totalPrice).toBe(2926.65);
  });

  it("ignores variants with no length or no price", () => {
    const p = planLength(
      [
        { sku: "BAD-0", lengthMm: 0, priceAed: 500 },
        { sku: "BAD-FREE", lengthMm: 3000, priceAed: 0 },
        ...RACK_END,
      ],
      2500,
    )!;
    expect(p.basePiece.sku).toBe("RE-2400");
    expect(p.totalPrice).toBe(2500);
  });

  it("returns null for no usable variants or a non-positive / non-finite target", () => {
    expect(planLength([], 2400)).toBeNull();
    expect(planLength([{ sku: "X", lengthMm: 0, priceAed: 0 }], 2400)).toBeNull();
    expect(planLength(RACK_END, 0)).toBeNull();
    expect(planLength(RACK_END, -5)).toBeNull();
    expect(planLength(RACK_END, Number.NaN)).toBeNull();
  });

  it("does not mutate the caller's variants array", () => {
    const copy = RACK_END.map((v) => ({ ...v }));
    planLength(copy, 2500);
    expect(copy).toEqual(RACK_END);
  });
});
