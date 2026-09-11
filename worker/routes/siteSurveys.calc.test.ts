import { describe, it, expect } from "vitest";
import { computeAreaEnergyJ } from "./siteSurveys";

// PAS 13:2017 §6.1: KE = ½ · m · (v · sinΘ)², with m = vehicle + load (kg),
// v in m/s (km/h ÷ 3.6) and sinΘ taken from the §6.1 table
// (sin90 = 1, sin67.5 = 0.924, sin45 = 0.707, sin22.5 = 0.383, sin10 = 0.1736),
// NOT Math.sin — that is what shared/pas13Rules.ts encodes and what the
// survey handler must reuse.
describe("computeAreaEnergyJ", () => {
  it("head-on, unladen: 2 000 kg at 10 km/h, 90°", () => {
    // m = 2000 + 0 = 2000 kg
    // v = 10 / 3.6 = 2.7777… m/s ; v² = 7.7160…
    // sin90 = 1 → (v·sinΘ)² = 7.7160…
    // KE = 0.5 · 2000 · 7.7160… = 7 716.05 J
    expect(
      computeAreaEnergyJ({ vehicleKg: 2000, loadKg: 0, speedKmh: 10, angleDeg: 90 }),
    ).toBeCloseTo(7716.05, 1);
  });

  it("laden §6.3.2-style example: 5 000 kg + 1 000 kg load at 8 km/h, 45°", () => {
    // m = 5000 + 1000 = 6000 kg  (load mass must be included)
    // v = 8 / 3.6 = 2.2222… m/s ; v² = 4.9383…
    // sin45 = 0.707 (table) → sin² = 0.499849
    // (v·sinΘ)² = 4.9383… · 0.499849 = 2.46839…
    // KE = 0.5 · 6000 · 2.46839… = 7 405.17 J
    // (raw Math.sin would give sin² = 0.5 → 7 407.41 J, so a regression to
    //  Math.sin is caught by the 1-decimal tolerance)
    expect(
      computeAreaEnergyJ({ vehicleKg: 5000, loadKg: 1000, speedKmh: 8, angleDeg: 45 }),
    ).toBeCloseTo(7405.17, 1);
  });

  it("glancing, load omitted: 3 000 kg at 12 km/h, 22.5°", () => {
    // m = 3000 + (undefined → 0) = 3000 kg
    // v = 12 / 3.6 = 3.3333… m/s ; v² = 11.1111…
    // sin22.5 = 0.383 (table) → sin² = 0.146689
    // (v·sinΘ)² = 11.1111… · 0.146689 = 1.62988…
    // KE = 0.5 · 3000 · 1.62988… = 2 444.82 J
    expect(
      computeAreaEnergyJ({ vehicleKg: 3000, speedKmh: 12, angleDeg: 22.5 }),
    ).toBeCloseTo(2444.82, 1);
  });

  it("treats angle 0 / missing as head-on and ignores a negative load", () => {
    const headOn = computeAreaEnergyJ({ vehicleKg: 2000, speedKmh: 10, angleDeg: 90 });
    expect(computeAreaEnergyJ({ vehicleKg: 2000, speedKmh: 10, angleDeg: 0 })).toBe(headOn);
    expect(
      computeAreaEnergyJ({ vehicleKg: 2000, loadKg: -500, speedKmh: 10, angleDeg: 90 }),
    ).toBe(headOn);
  });
});

import { recommendProductsForArea } from "./siteSurveys";
import { PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT } from "@shared/pas13Rules";

// Scenario: 2 000 kg at 10 km/h head-on → 7 716 J required (case 1 above).
// Margin = (rated − required) / rated:
//   20 000 J → 61.4 %  aligned
//   10 000 J → 22.8 %  borderline (below the 30 % gate)
//    5 000 J → −54 %   not aligned
const scenario = { vehicleKg: 2000, loadKg: 0, speedKmh: 10, angleDeg: 90 };
const products = [
  { id: "a", name: "iFlex Barrier – 1000 mm", impactRating: 20000 },
  { id: "b", name: "iFlex Barrier – 2000 mm", impactRating: 40000 },
  { id: "c", name: "Pedestrian Barrier", impactRating: 10000 },
  { id: "d", name: "RackGuard 400", impactRating: 5000 },
];

describe("recommendProductsForArea", () => {
  it(`recommends only products at or above the ${PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT}% margin, one per family`, () => {
    const out = recommendProductsForArea({ products, ...scenario, isRackingArea: false });
    expect(out.map((r) => r.productId)).toEqual(["a"]); // b same family, a is the economical aligned pick
    expect(out[0].notAligned).toBe(false);
    expect(out[0].pas13Verdict).toBe("aligned");
    expect(out[0].safetyMarginPct).toBeGreaterThanOrEqual(PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT);
  });

  it("appends the under-rated RackGuard for racking areas flagged notAligned, never as a recommendation", () => {
    const out = recommendProductsForArea({ products, ...scenario, isRackingArea: true });
    expect(out.map((r) => r.productId)).toEqual(["a", "d"]);
    const rg = out[1];
    expect(rg.notAligned).toBe(true);
    expect(rg.pas13Verdict).toBe("not_aligned");
    expect(rg.reason).toContain("Specifically designed for racking protection");
    expect(rg.reason).toContain("below calculated 7716J");
  });
});
