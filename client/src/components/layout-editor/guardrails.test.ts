import { describe, expect, it } from "vitest";
import type { LayoutDoc, Element } from "@shared/layout/doc";
import {
  evaluateGuardrails,
  groupViolationsByElement,
  inferFloorTypeFromText,
  substrateMismatch,
  worstSeverityDotColour,
  type GuardrailCatalogProduct,
} from "./guardrails";

/** 1000 px = 10 000 mm → 0.1 px/mm. */
const CAL = { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, lengthMm: 10000 };

/** 10 m iFlex run along y = 0. */
const run = (over: Partial<Extract<Element, { kind: "barrierRun" }>> = {}): Element => ({
  kind: "barrierRun",
  id: "run1",
  familyId: "iflex-single-traffic",
  points: [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
  ],
  ...over,
});

const stamp = (over: Partial<Extract<Element, { kind: "stamp" }>> = {}): Element => ({
  kind: "stamp",
  id: "stamp1",
  familyId: "bollard-190",
  at: { x: 500, y: 300 },
  rotationDeg: 0,
  ...over,
});

const doc = (elements: Element[], extra: Partial<LayoutDoc> = {}, calibrated = true): LayoutDoc => ({
  version: 1,
  elements,
  ...(calibrated ? { calibration: CAL } : {}),
  ...extra,
});

const codes = (vs: ReturnType<typeof evaluateGuardrails>) => vs.map((v) => v.code);

describe("scale_not_set", () => {
  it("fires once when runs exist and the doc is uncalibrated", () => {
    const vs = evaluateGuardrails({ doc: doc([run(), run({ id: "run2" })], {}, false) });
    expect(codes(vs)).toEqual(["scale_not_set"]);
    expect(vs[0].elementId).toBe("run1");
    expect(vs[0].severity).toBe("warning");
    expect(vs[0].citation?.section).toBeTruthy();
  });

  it("is silent when calibrated, or when there are only stamps", () => {
    expect(codes(evaluateGuardrails({ doc: doc([run()]) }))).toEqual([]);
    expect(codes(evaluateGuardrails({ doc: doc([stamp()], {}, false) }))).toEqual([]);
  });
});

describe("post_centre_excessive", () => {
  it("uses the actual post bays against a product rated tighter than the family", () => {
    // 10 m at 2200 mm family spacing → 5 bays of 2000 mm. Product rated 1500 → 2000 > 1650.
    const products: Record<string, GuardrailCatalogProduct> = {
      p1: { id: "p1", name: "iFlex Tight", maxPostCentreMm: 1500 },
    };
    const vs = evaluateGuardrails({ doc: doc([run({ productId: "p1" })]), products });
    expect(codes(vs)).toEqual(["post_centre_excessive"]);
    expect(vs[0].message).toContain("2.00 m");
    expect(vs[0].message).toContain("1.50 m");
    expect(vs[0].message).toContain("iFlex Tight");
  });

  it("does not fire when bays sit within the family spacing (posts are auto-distributed)", () => {
    expect(codes(evaluateGuardrails({ doc: doc([run()]) }))).toEqual([]);
  });

  it("needs a calibration", () => {
    const products = { p1: { id: "p1", maxPostCentreMm: 100 } };
    const vs = evaluateGuardrails({ doc: doc([run({ productId: "p1" })], {}, false), products });
    expect(codes(vs)).toEqual(["scale_not_set"]);
  });
});

describe("deflection_zone_obstructed", () => {
  const wall = (yPx: number): Element => ({
    kind: "wall",
    id: "wall1",
    points: [
      { x: -200, y: yPx },
      { x: 1200, y: yPx },
    ],
  });

  it("flags a wall inside the 200 mm default + 600 mm pedestrian zone", () => {
    // 50 px = 500 mm < 800 mm required.
    const vs = evaluateGuardrails({ doc: doc([run(), wall(50)]) });
    expect(codes(vs)).toEqual(["deflection_zone_obstructed"]);
    expect(vs[0].severity).toBe("error");
    expect(vs[0].message).toContain("500 mm");
    expect(vs[0].message).toContain("800 mm");
  });

  it("is clear when the wall is far enough away", () => {
    // 100 px = 1000 mm > 800 mm.
    expect(codes(evaluateGuardrails({ doc: doc([run(), wall(100)]) }))).toEqual([]);
  });

  it("uses the product's deflection zone when known", () => {
    const products = { p1: { id: "p1", deflectionZoneMm: 500 } }; // 1100 mm required
    const vs = evaluateGuardrails({ doc: doc([run({ productId: "p1" }), wall(100)]), products });
    expect(codes(vs)).toEqual(["deflection_zone_obstructed"]);
    expect(vs[0].message).toContain("1100 mm");
  });

  it("is skipped without a calibration (scale_not_set covers it)", () => {
    expect(codes(evaluateGuardrails({ doc: doc([run(), wall(10)], {}, false) }))).toEqual(["scale_not_set"]);
  });
});

describe("vehicle_class_mismatch", () => {
  const forklift = { id: "v-t3", name: "Counterbalance", weightTypical: 7000, maxSpeed: 14 };

  it("warns for every barrier rated below the fleet class (unknown rating = lightest)", () => {
    const vs = evaluateGuardrails({
      doc: doc([run(), stamp()], { vehicleTypeId: "v-t3" }),
      vehicleTypes: [forklift],
    });
    expect(codes(vs)).toEqual(["vehicle_class_mismatch", "vehicle_class_mismatch"]);
    expect(vs.map((v) => v.elementId)).toEqual(["run1", "stamp1"]);
    expect(vs[0].message).toContain("Counterbalance");
    expect(vs[0].message).toContain("class T3");
  });

  it("is silent when the product is rated for the fleet class or heavier", () => {
    const products = { p1: { id: "p1", impactRatingJoules: 400_000 } };
    const vs = evaluateGuardrails({
      doc: doc([run({ productId: "p1" })], { vehicleTypeId: "v-t3" }),
      vehicleTypes: [forklift],
      products,
    });
    expect(codes(vs)).toEqual([]);
  });

  it("honours an explicit vehicleTypeId override and unknown ids", () => {
    const vs = evaluateGuardrails({ doc: doc([run()]), vehicleTypes: [forklift], vehicleTypeId: "v-t3" });
    expect(codes(vs)).toEqual(["vehicle_class_mismatch"]);
    expect(codes(evaluateGuardrails({ doc: doc([run()], { vehicleTypeId: "nope" }), vehicleTypes: [forklift] }))).toEqual([]);
  });
});

describe("anchor_floor_mismatch / underfloor_services_advisory", () => {
  const products = { p1: { id: "p1", name: "Atlas", substrateNotes: "Concrete slab only; asphalt not suitable" } };

  it("warns when the doc floor type conflicts with the product substrate notes", () => {
    const vs = evaluateGuardrails({ doc: doc([run({ productId: "p1" })], { floorType: "asphalt" }), products });
    expect(codes(vs)).toEqual(["anchor_floor_mismatch"]);
    expect(vs[0].citation?.section).toBe("GW-PRH-1005");
    expect(codes(evaluateGuardrails({ doc: doc([run({ productId: "p1" })], { floorType: "concrete" }), products }))).toEqual([]);
  });

  it("falls back to keyword inference from notes text", () => {
    const vs = evaluateGuardrails({ doc: doc([run({ productId: "p1" })]), products, notesText: "Install on asphalt yard" });
    expect(codes(vs)).toEqual(["anchor_floor_mismatch"]);
  });

  it("emits one underfloor advisory per barrier element", () => {
    const vs = evaluateGuardrails({ doc: doc([run(), stamp()], { floorType: "underfloor_services" }) });
    expect(codes(vs)).toEqual(["underfloor_services_advisory", "underfloor_services_advisory"]);
  });

  it("helpers: substrateMismatch and inferFloorTypeFromText", () => {
    expect(substrateMismatch("asphalt", "concrete slab recommended")).toBe(true);
    expect(substrateMismatch("tiles", "concrete only")).toBe(true);
    expect(substrateMismatch("concrete", "concrete only")).toBe(false);
    expect(substrateMismatch(null, "concrete only")).toBe(false);
    expect(inferFloorTypeFromText("tarmac apron")).toBe("asphalt");
    expect(inferFloorTypeFromText("interlock paving")).toBe("paving");
    expect(inferFloorTypeFromText("")).toBeNull();
  });
});

describe("grouping", () => {
  it("groups by element and picks the worst dot colour", () => {
    const wall: Element = { kind: "wall", id: "w", points: [{ x: 0, y: 20 }, { x: 1000, y: 20 }] };
    const vs = evaluateGuardrails({ doc: doc([run(), wall], { floorType: "underfloor_services" }) });
    const g = groupViolationsByElement(vs);
    expect(g.get("run1")?.map((v) => v.code).sort()).toEqual(["deflection_zone_obstructed", "underfloor_services_advisory"]);
    expect(worstSeverityDotColour(g.get("run1"))).toBe("#EF4444");
    expect(worstSeverityDotColour([{ ...vs[0], severity: "warning" }])).toBe("#F59E0B");
    expect(worstSeverityDotColour(undefined)).toBeNull();
  });
});
