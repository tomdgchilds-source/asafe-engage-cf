import { describe, it, expect } from "vitest";
import type { LayoutDoc } from "./doc";
import { deriveQuantities, toCartItems, type CatalogProductLike } from "./quantities";

// 1 px per mm.
const fixture: LayoutDoc = {
  version: 1,
  calibration: { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, lengthMm: 1000 },
  elements: [
    // 10 m straight iFlex single: 6 posts, 0 corners.
    { kind: "barrierRun", id: "r1", familyId: "iflex-single-traffic", productId: "p-iflex-s", points: [{ x: 0, y: 0 }, { x: 10000, y: 0 }] },
    // 4 m + 3 m L of the same family and product: 5 posts, 1 corner.
    { kind: "barrierRun", id: "r2", familyId: "iflex-single-traffic", productId: "p-iflex-s", points: [{ x: 0, y: 5000 }, { x: 4000, y: 5000 }, { x: 4000, y: 8000 }] },
    // 2 m Atlas double with no product assigned.
    { kind: "barrierRun", id: "r3", familyId: "atlas-double-traffic", points: [{ x: 0, y: 9000 }, { x: 2000, y: 9000 }] },
    // Three bollards, two of them linked to the catalogue.
    { kind: "stamp", id: "s1", familyId: "bollard-190", productId: "p-bollard", at: { x: 100, y: 100 }, rotationDeg: 0 },
    { kind: "stamp", id: "s2", familyId: "bollard-190", productId: "p-bollard", at: { x: 200, y: 100 }, rotationDeg: 0 },
    { kind: "stamp", id: "s3", familyId: "bollard-190", at: { x: 300, y: 100 }, rotationDeg: 0 },
    // Non-product elements are ignored.
    { kind: "wall", id: "w1", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
    { kind: "note", id: "n1", at: { x: 0, y: 0 }, text: "x" },
    { kind: "zone", id: "z1", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], label: "z" },
    { kind: "dimension", id: "d1", a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
  ],
};

const catalog: CatalogProductLike[] = [
  { id: "p-iflex-s", name: "iFlex Single Traffic Barrier", category: "traffic-guardrails", pricingLogic: "per_length", basePricePerMeter: "1200.00" },
  { id: "p-bollard", name: "Bollard, Yellow", category: "bollards", pricingLogic: "per_unit" },
];

describe("deriveQuantities", () => {
  const q = deriveQuantities(fixture, catalog);

  it("reports calibration and aggregates per family", () => {
    expect(q.calibrated).toBe(true);
    const iflex = q.families.find((f) => f.familyId === "iflex-single-traffic")!;
    expect(iflex.runs).toBe(2);
    expect(iflex.totalLengthM).toBeCloseTo(17, 9);
    expect(iflex.posts).toBe(11);
    expect(iflex.corners).toBe(1);
    expect(iflex.stamps).toBe(0);
    expect(iflex.letter).toBe("A");
    const atlas = q.families.find((f) => f.familyId === "atlas-double-traffic")!;
    expect(atlas.runs).toBe(1);
    expect(atlas.totalLengthM).toBeCloseTo(2, 9);
    expect(atlas.posts).toBe(2);
    const bollards = q.families.find((f) => f.familyId === "bollard-190")!;
    expect(bollards.stamps).toBe(3);
    expect(bollards.runs).toBe(0);
    expect(bollards.totalLengthM).toBe(0);
    expect(q.families.map((f) => f.familyId)).toEqual(["iflex-single-traffic", "atlas-double-traffic", "bollard-190"]);
  });

  it("aggregates per product ready for bulk-add", () => {
    expect(q.products).toEqual([
      { productId: "p-iflex-s", productName: "iFlex Single Traffic Barrier", familyId: "iflex-single-traffic", pricingType: "linear_meter", quantity: 17, lengthMeters: 17, elementCount: 2 },
      { productId: "p-bollard", productName: "Bollard, Yellow", familyId: "bollard-190", pricingType: "standard_item", quantity: 2, elementCount: 2 },
    ]);
  });

  it("counts elements that have no product assignment", () => {
    expect(q.unassignedElements).toBe(2); // r3 + s3
  });

  it("falls back to the family label and family pricing when the product is not in the catalogue", () => {
    const doc: LayoutDoc = {
      ...fixture,
      elements: [{ kind: "barrierRun", id: "r", familyId: "eflex-single-traffic", productId: "ghost", points: [{ x: 0, y: 0 }, { x: 3000, y: 0 }] }],
    };
    const r = deriveQuantities(doc, []);
    expect(r.products).toEqual([
      { productId: "ghost", productName: "eFlex Single Traffic Barrier", familyId: "eflex-single-traffic", pricingType: "linear_meter", quantity: 3, lengthMeters: 3, elementCount: 1 },
    ]);
  });

  it("rounds lengths to 2 dp and never reports negative or NaN", () => {
    const doc: LayoutDoc = {
      ...fixture,
      elements: [{ kind: "barrierRun", id: "r", familyId: "iflex-single-traffic", productId: "p-iflex-s", points: [{ x: 0, y: 0 }, { x: 1234.5678, y: 0 }] }],
    };
    const r = deriveQuantities(doc, catalog);
    expect(r.products[0].lengthMeters).toBe(1.23);
    expect(r.products[0].quantity).toBe(1.23);
  });

  it("reports zero lengths and posts when the doc is not calibrated", () => {
    const r = deriveQuantities({ ...fixture, calibration: undefined }, catalog);
    expect(r.calibrated).toBe(false);
    const iflex = r.families.find((f) => f.familyId === "iflex-single-traffic")!;
    expect(iflex.runs).toBe(2);
    expect(iflex.totalLengthM).toBe(0);
    expect(iflex.posts).toBe(0);
    expect(iflex.corners).toBe(1); // corners are scale-free
    expect(r.products.find((p) => p.productId === "p-bollard")?.quantity).toBe(2);
  });
});

describe("toCartItems", () => {
  it("shapes products for POST /api/cart/bulk-add", () => {
    const items = toCartItems(deriveQuantities(fixture, catalog), { applicationArea: "Dock 3" });
    expect(items).toEqual([
      { productName: "iFlex Single Traffic Barrier", quantity: 17, length: 17, pricingType: "linear_meter", applicationArea: "Dock 3", notes: "From layout: 2 runs, 17 m" },
      { productName: "Bollard, Yellow", quantity: 2, pricingType: "standard_item", applicationArea: "Dock 3", notes: "From layout: 2 placements" },
    ]);
  });
});
