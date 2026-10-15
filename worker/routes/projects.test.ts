import { describe, it, expect } from "vitest";
import {
  DEFAULT_IMPACT_ZONE_MM,
  indexProductsByName,
  lineItemVerdict,
  normaliseProductName,
  parseImpactZoneMm,
  resolveLineItemRating,
  resolveLineVehicleContext,
  type PublicVehicleContext,
} from "./projects";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const forklift: PublicVehicleContext = {
  label: "3,500 kg @ 8.0 km/h, 90°",
  vehicleMassKg: 2500,
  loadMassKg: 1000,
  speedKmh: 8,
  approachAngleDeg: 90,
};

const iFlexDouble = {
  id: "p1",
  name: "iFlex Double Traffic Barrier",
  impactRating: 29000,
  pas13TestJoules: null,
  deflectionZone: 450,
  impactTestingData: null,
};

// ---------------------------------------------------------------------------
// normaliseProductName / indexProductsByName
// ---------------------------------------------------------------------------

describe("normaliseProductName", () => {
  it("ignores case, surrounding and repeated whitespace", () => {
    expect(normaliseProductName("  iFlex   Double Traffic Barrier ")).toBe(
      "iflex double traffic barrier",
    );
    expect(normaliseProductName("IFLEX DOUBLE TRAFFIC BARRIER")).toBe(
      normaliseProductName("iFlex Double Traffic Barrier"),
    );
  });

  it("is empty for missing names", () => {
    expect(normaliseProductName(null)).toBe("");
    expect(normaliseProductName(undefined)).toBe("");
  });
});

describe("indexProductsByName", () => {
  it("finds a catalogue row from a cart line whose name differs only in case/spacing", () => {
    const byName = indexProductsByName([iFlexDouble]);
    expect(byName.get(normaliseProductName("IFLEX  double traffic barrier"))).toBe(iFlexDouble);
    expect(byName.get(normaliseProductName("Pedestrian Barrier"))).toBeUndefined();
  });

  it("keeps the first row when the catalogue has duplicate names", () => {
    const dup = { ...iFlexDouble, id: "p2", impactRating: 1 };
    expect(indexProductsByName([iFlexDouble, dup]).get("iflex double traffic barrier")?.id).toBe("p1");
  });
});

// ---------------------------------------------------------------------------
// parseImpactZoneMm
// ---------------------------------------------------------------------------

describe("parseImpactZoneMm", () => {
  it("prefers the integer deflection_zone column", () => {
    expect(parseImpactZoneMm("250 mm", 450)).toBe(450);
  });

  it("parses free-text impact zones and takes the largest figure", () => {
    expect(parseImpactZoneMm("250 mm", null)).toBe(250);
    expect(parseImpactZoneMm("0–250mm", null)).toBe(250);
    expect(parseImpactZoneMm(320, null)).toBe(320);
  });

  it("falls back to the conservative default when nothing usable is stored", () => {
    expect(parseImpactZoneMm(null, null)).toBe(DEFAULT_IMPACT_ZONE_MM);
    expect(parseImpactZoneMm("", undefined)).toBe(DEFAULT_IMPACT_ZONE_MM);
    expect(parseImpactZoneMm("n/a", 0)).toBe(DEFAULT_IMPACT_ZONE_MM);
  });
});

// ---------------------------------------------------------------------------
// resolveLineItemRating — the lookup the shared view relies on
// ---------------------------------------------------------------------------

describe("resolveLineItemRating", () => {
  it("takes rated joules from the catalogue row when the cart line has none", () => {
    const line = { productName: "iFlex Double Traffic Barrier", quantity: 12 };
    expect(resolveLineItemRating(line, iFlexDouble)).toEqual({ ratedJ: 29000, impactZoneMm: 450 });
  });

  it("prefers pas13TestJoules over impactRating on the catalogue row", () => {
    const product = { ...iFlexDouble, pas13TestJoules: 31000 };
    expect(resolveLineItemRating({ productName: "x" }, product).ratedJ).toBe(31000);
  });

  it("lets a rating keyed on the cart line win over the catalogue", () => {
    const line = { productName: "iFlex Double Traffic Barrier", impactRating: "18000" };
    expect(resolveLineItemRating(line, iFlexDouble).ratedJ).toBe(18000);
    const variant = { productName: "x", selectedVariant: { impactRating: 9000 } };
    expect(resolveLineItemRating(variant, undefined).ratedJ).toBe(9000);
  });

  it("reports 0 joules when neither the line nor the catalogue knows the rating", () => {
    expect(resolveLineItemRating({ productName: "Custom service line" }, undefined)).toEqual({
      ratedJ: 0,
      impactZoneMm: DEFAULT_IMPACT_ZONE_MM,
    });
  });
});

// ---------------------------------------------------------------------------
// resolveLineVehicleContext
// ---------------------------------------------------------------------------

describe("resolveLineVehicleContext", () => {
  it("uses the cart line's saved calculationContext when it is complete", () => {
    const line = {
      calculationContext: { vehicleMass: "4000", loadMass: "500", speed: "10", speedUnit: "kmh", impactAngle: "45" },
    };
    expect(resolveLineVehicleContext(line, forklift)).toMatchObject({
      vehicleMassKg: 4000,
      loadMassKg: 500,
      speedKmh: 10,
      approachAngleDeg: 45,
    });
  });

  it("converts mph and defaults the angle to 90° when the line omits it", () => {
    const line = { calculationContext: { vehicleMass: 2000, speed: 10, speedUnit: "mph" } };
    const ctx = resolveLineVehicleContext(line, null)!;
    expect(ctx.speedKmh).toBeCloseTo(16.09, 1);
    expect(ctx.approachAngleDeg).toBe(90);
  });

  it("falls back to the project context when the line has no usable scenario", () => {
    expect(resolveLineVehicleContext({ calculationContext: null }, forklift)).toBe(forklift);
    expect(resolveLineVehicleContext({ calculationContext: { vehicleMass: 2000 } }, forklift)).toBe(forklift);
    expect(resolveLineVehicleContext({}, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// lineItemVerdict — end to end for one line
// ---------------------------------------------------------------------------

describe("lineItemVerdict", () => {
  it("produces a real verdict once the catalogue supplies the rated joules", () => {
    const line = { productName: "IFLEX DOUBLE TRAFFIC BARRIER", quantity: 3 };
    const verdict = lineItemVerdict(line, iFlexDouble, forklift);
    expect(verdict).not.toBeNull();
    expect(["aligned", "borderline", "not_aligned"]).toContain(verdict!.verdict);
    expect(verdict!.details.productRatedJoulesAt45deg).toBe(29000);
  });

  it("still returns a verdict when the catalogue row has no impact-zone figure", () => {
    const product = { ...iFlexDouble, deflectionZone: null, impactTestingData: null };
    const verdict = lineItemVerdict({ productName: "x" }, product, forklift);
    expect(verdict).not.toBeNull();
  });

  it("is null (verdict pending) without a vehicle scenario or without rated joules", () => {
    expect(lineItemVerdict({ productName: "x" }, iFlexDouble, null)).toBeNull();
    expect(lineItemVerdict({ productName: "Custom line" }, undefined, forklift)).toBeNull();
  });
});
