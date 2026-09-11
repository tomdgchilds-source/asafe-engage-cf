import { describe, it, expect } from "vitest";
import {
  alignedMinRatedJoules,
  computeCalculatorEnergy,
  normaliseImpactAngle,
  productAlignment,
  speedToKmh,
} from "./calculations";
import { requiredAbsorbedJoules, PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT } from "@shared/pas13Rules";
import { computeAreaEnergyJ } from "./siteSurveys";

// PAS 13:2017 §6.1: KE = ½ · (vehicle + load) · (v · sinΘ)², v in m/s
// (km/h ÷ 3.6), sinΘ from the §6.1 table (sin90 = 1, sin67.5 = 0.924,
// sin45 = 0.707, sin22.5 = 0.383, sin10 = 0.1736) — NOT Math.sin.
// "Aligned" needs (rated − required) / rated ≥ 30 %, i.e. rated ≥ required / 0.7.
describe("computeCalculatorEnergy", () => {
  it("case 1 — laden counterbalance, head-on: 2 500 kg + 500 kg at 10 km/h, 90°", () => {
    // m  = 2500 + 500 = 3000 kg (load mass must be included)
    // v  = 10 / 3.6 = 2.7777… m/s ; v² = 7.716049…
    // sin90 = 1 → (v·sinΘ)² = 7.716049…
    // KE = 0.5 · 3000 · 7.716049… = 11 574.07 J
    // Tested-energy requirement = 11 574.07 / 0.7 = 16 534.39 J
    const r = computeCalculatorEnergy({
      vehicleMassKg: 2500,
      loadMassKg: 500,
      speed: 10,
      speedUnit: "kmh",
      impactAngleDeg: 90,
    });
    expect(r.totalMassKg).toBe(3000);
    expect(r.speedKmh).toBeCloseTo(10, 6);
    expect(r.speedMs).toBeCloseTo(2.7778, 3);
    expect(r.sinTheta).toBe(1);
    expect(r.kineticEnergyJ).toBeCloseTo(11574.07, 1);
    expect(r.alignedMinRatedJ).toBeCloseTo(16534.39, 1);
    expect(r.alignedMinSafetyMarginPct).toBe(PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT);
  });

  it("case 2 — mph input, table sine at 45°: 4 000 kg + 1 000 kg at 5 mph, 45°", () => {
    // speed = 5 mph · 1.609344 = 8.04672 km/h → v = 8.04672 / 3.6 = 2.2352 m/s
    // v² = 2.2352² = 4.99611904
    // sin45 = 0.707 (table) → sin² = 0.499849
    // (v·sinΘ)² = 4.99611904 · 0.499849 = 2.4973051…
    // m  = 4000 + 1000 = 5000 kg
    // KE = 0.5 · 5000 · 2.4973051… = 6 243.26 J
    // (raw Math.sin would give sin² = 0.5 → 6 245.15 J; the 1-decimal
    //  tolerance catches a regression to Math.sin)
    // Tested-energy requirement = 6 243.26 / 0.7 = 8 918.95 J
    const r = computeCalculatorEnergy({
      vehicleMassKg: 4000,
      loadMassKg: 1000,
      speed: 5,
      speedUnit: "mph",
      impactAngleDeg: 45,
    });
    expect(r.speedKmh).toBeCloseTo(8.04672, 5);
    expect(r.sinTheta).toBe(0.707);
    expect(r.kineticEnergyJ).toBeCloseTo(6243.26, 1);
    expect(r.alignedMinRatedJ).toBeCloseTo(8918.95, 1);
  });

  it("agrees to the joule with the survey engine and the PAS 13 checker", () => {
    const calc = computeCalculatorEnergy({
      vehicleMassKg: 3000,
      loadMassKg: 0,
      speed: 3, // m/s → 10.8 km/h
      speedUnit: "ms",
      impactAngleDeg: 22.5,
    });
    const survey = computeAreaEnergyJ({ vehicleKg: 3000, loadKg: 0, speedKmh: 10.8, angleDeg: 22.5 });
    const checker = requiredAbsorbedJoules({
      vehicleMassKg: 3000,
      loadMassKg: 0,
      speedKmh: 10.8,
      approachAngleDeg: 22.5,
    });
    expect(calc.kineticEnergyJ).toBeCloseTo(survey, 6);
    expect(calc.kineticEnergyJ).toBeCloseTo(checker, 6);
  });

  it("treats a missing / zero / negative angle as 90° and ignores a negative load", () => {
    const headOn = computeCalculatorEnergy({
      vehicleMassKg: 2000,
      speed: 10,
      speedUnit: "kmh",
      impactAngleDeg: 90,
    }).kineticEnergyJ;
    expect(normaliseImpactAngle(0)).toBe(90);
    expect(normaliseImpactAngle(NaN)).toBe(90);
    expect(normaliseImpactAngle("")).toBe(90);
    expect(normaliseImpactAngle(120)).toBe(90);
    expect(normaliseImpactAngle(45)).toBe(45);
    expect(
      computeCalculatorEnergy({ vehicleMassKg: 2000, speed: 10, speedUnit: "kmh", impactAngleDeg: 0 })
        .kineticEnergyJ,
    ).toBe(headOn);
    expect(
      computeCalculatorEnergy({
        vehicleMassKg: 2000,
        loadMassKg: -500,
        speed: 10,
        speedUnit: "kmh",
        impactAngleDeg: 90,
      }).kineticEnergyJ,
    ).toBe(headOn);
  });
});

describe("speedToKmh", () => {
  it("converts each calculator unit", () => {
    expect(speedToKmh(10, "kmh")).toBe(10);
    expect(speedToKmh(3, "ms")).toBeCloseTo(10.8, 9);
    expect(speedToKmh(5, "mph")).toBeCloseTo(8.04672, 9);
    expect(speedToKmh(NaN, "kmh")).toBe(0);
    expect(speedToKmh(-4, "kmh")).toBe(0);
  });
});

describe("alignedMinRatedJoules / productAlignment", () => {
  // Case 1 above: required = 11 574.07 J.
  //   20 000 J → (20000 − 11574.07) / 20000 = 42.13 %  aligned
  //   15 000 J → (15000 − 11574.07) / 15000 = 22.84 %  not aligned (borderline < 30 %)
  //   10 000 J → (10000 − 11574.07) / 10000 = −15.74 % not aligned (shortfall)
  //   16 534.39 J (the tested-energy requirement) → exactly 30 % → aligned
  const required = 11574.07;

  it("tested-energy requirement is required / 0.7", () => {
    expect(alignedMinRatedJoules(required)).toBeCloseTo(16534.39, 1);
    expect(alignedMinRatedJoules(0)).toBe(0);
    expect(alignedMinRatedJoules(NaN)).toBe(0);
  });

  it("flags anything under the 30 % margin as not aligned, never hides it", () => {
    expect(productAlignment(20000, required)).toMatchObject({ notAligned: false });
    expect(productAlignment(20000, required).safetyMarginPct).toBeCloseTo(42.13, 1);

    expect(productAlignment(15000, required)).toMatchObject({ notAligned: true });
    expect(productAlignment(15000, required).safetyMarginPct).toBeCloseTo(22.84, 1);

    expect(productAlignment(10000, required)).toMatchObject({ notAligned: true });
    expect(productAlignment(10000, required).safetyMarginPct).toBeCloseTo(-15.74, 1);

    const atLine = productAlignment(alignedMinRatedJoules(required), required);
    expect(atLine.safetyMarginPct).toBeCloseTo(30, 6);
    expect(atLine.notAligned).toBe(false);

    expect(productAlignment(null, required)).toEqual({ safetyMarginPct: -100, notAligned: true });
    expect(productAlignment(0, required)).toEqual({ safetyMarginPct: -100, notAligned: true });
  });
});
