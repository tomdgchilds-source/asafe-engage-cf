import { describe, it, expect } from "vitest";
import { setVehicleClassTableOverride } from "@shared/pas13Rules";
import {
  areasFromObservationsSchema,
  areaNameFor,
  assessArea,
  assetCriticalityForAreaType,
  buildRiskMatrix,
  hazardSeveritiesFromAnalysis,
  aiObservationFromAnalysis,
  mergeObservations,
  observationsToRiskInputs,
  sortForRegister,
  summariseRegister,
  vehicleClassFromMass,
  type ConfirmedObservation,
} from "./siteSurveys";

// Pure register helpers (Task S3/S4). All tests use the seed PAS 13 vehicle
// class table (T1 ≤1 500 kg/≤6 km/h, T2 ≤3 500/≤10, T3 ≤7 500/≤15, T4 above).
setVehicleClassTableOverride(null);

const obs = (over: Partial<ConfirmedObservation> = {}): ConfirmedObservation => ({
  photoId: "p1",
  areaType: "racking_aisle",
  condition: "damaged",
  hazards: [],
  vehicles: [],
  pedestrianExposure: "occasional",
  existingProtection: "partial",
  observationText: "",
  ...over,
});

describe("vehicleClassFromMass", () => {
  it("classifies total mass (vehicle + load) at speed; boundary rounds up", () => {
    expect(vehicleClassFromMass(1000, 0, 5)).toBe("T1");
    expect(vehicleClassFromMass(3000, 0, 8)).toBe("T2");
    // 3 000 + 1 000 load = 4 000 kg pushes T2 → T3
    expect(vehicleClassFromMass(3000, 1000, 8)).toBe("T3");
    expect(vehicleClassFromMass(9000, 0, 10)).toBe("T4");
    // speed alone can escalate the class
    expect(vehicleClassFromMass(1000, 0, 20)).toBe("T4");
  });

  it("returns null without usable mass or speed", () => {
    expect(vehicleClassFromMass(null, 0, 10)).toBeNull();
    expect(vehicleClassFromMass(2000, 0, 0)).toBeNull();
    expect(vehicleClassFromMass(Number.NaN, 0, 10)).toBeNull();
  });
});

describe("observationsToRiskInputs", () => {
  it("maps a single observation: class from mass, unknowns conservative, racking is high criticality", () => {
    const inputs = observationsToRiskInputs(
      { trafficDensity: "high", vehicleMassKg: 5000, loadMassKg: 1000, speedKmh: 12 },
      [
        obs({
          pedestrianExposure: "unknown",
          existingProtection: "unknown",
          hazards: [
            { tag: "damaged upright", severity: "critical" },
            { tag: "poor marking", severity: "low" },
          ],
        }),
      ],
    );
    expect(inputs).toEqual({
      vehicleClass: "T3",
      trafficDensity: "high",
      pedestrianExposure: "occasional",
      existingProtection: "none",
      currentCondition: "damaged",
      hazardSeverities: ["critical", "low"],
      assetCriticality: "high",
    });
  });

  it("non-structural area types are medium criticality", () => {
    expect(assetCriticalityForAreaType("walkway")).toBe("medium");
    expect(assetCriticalityForAreaType("Structural column")).toBe("high");
    expect(assetCriticalityForAreaType("machinery_guard")).toBe("high");
    expect(assetCriticalityForAreaType(null)).toBe("medium");
  });
});

describe("mergeObservations", () => {
  it("is conservative on every axis and unions hazards / vehicles / text", () => {
    const merged = mergeObservations([
      obs({
        photoId: "a",
        areaType: "walkway",
        condition: "good",
        pedestrianExposure: "constant",
        existingProtection: "adequate",
        hazards: [{ tag: "x", severity: "low" }],
        vehicles: ["forklift"],
        observationText: "First.",
        riskLevelOverride: "medium",
      }),
      obs({
        photoId: "b",
        areaType: "racking_aisle",
        condition: "critical",
        pedestrianExposure: "none",
        existingProtection: "none",
        hazards: [
          { tag: "x", severity: "low" },
          { tag: "y", severity: "critical" },
        ],
        vehicles: ["forklift", "ppt"],
        observationText: "Second.",
        riskLevelOverride: "high",
        floorType: "concrete",
      }),
      obs({ photoId: "c", areaType: "racking_aisle", condition: "damaged" }),
    ]);
    expect(merged.areaType).toBe("racking_aisle"); // most common
    expect(merged.condition).toBe("critical"); // worst
    expect(merged.pedestrianExposure).toBe("constant"); // highest
    expect(merged.existingProtection).toBe("none"); // weakest
    expect(merged.hazards).toEqual([
      { tag: "x", severity: "low" },
      { tag: "y", severity: "critical" },
    ]);
    expect(merged.vehicles).toEqual(["forklift", "ppt"]);
    expect(merged.riskLevelOverride).toBe("high"); // highest override
    expect(merged.floorType).toBe("concrete");
    expect(merged.observationText).toBe("First.\n\nSecond.");
  });

  it("names areas from zone + readable area type with ordinals", () => {
    expect(areaNameFor("Loading Dock", "dock_edge")).toBe("Loading Dock – Dock edge");
    expect(areaNameFor("Loading Dock", "dock_edge", 2)).toBe("Loading Dock – Dock edge (2)");
  });
});

describe("assessArea", () => {
  const products = [
    { id: "weak", name: "Kerb 100", impactRating: 500, price: "50" },
    { id: "strong", name: "iFlex Barrier", impactRating: 200_000, price: "900" },
    { id: "rg", name: "RackGuard", impactRating: 2_000, price: "120" },
  ];

  it("runs the register and PAS 13 energy / recommendation / verdict together", () => {
    const a = assessArea({
      vehicleKg: 5000,
      loadKg: 1000,
      speedKmh: 12,
      angleDeg: 90,
      trafficDensity: "high",
      pedestrianExposure: "frequent",
      existingProtection: "none",
      condition: "unprotected",
      hazardSeverities: ["critical"],
      areaType: "racking_aisle",
      products,
    });
    // likelihood: high=4 (+1 T3, +1 none/unprotected) → 6 capped 5
    // severity: frequent=4 (+1 critical hazard, +1 racking) → 6 capped 5
    expect(a.vehicleClass).toBe("T3");
    expect(a.risk.likelihood).toBe(5);
    expect(a.risk.severity).toBe(5);
    expect(a.risk.score).toBe(25);
    expect(a.risk.level).toBe("critical");
    expect(a.calculatedJoules).toBeCloseTo(0.5 * 6000 * (12 / 3.6) ** 2, 1);
    expect(a.topProduct?.productId).toBe("strong");
    expect(a.topProduct?.notAligned).toBe(false);
    expect(a.pas13Verdict?.verdict).toBe("aligned");
    // racking area with no aligned RackGuard → greyed-out RackGuard appended
    const rg = a.recommendedProducts.find((r) => r.productId === "rg");
    expect(rg?.notAligned).toBe(true);
  });

  it("still assesses risk when vehicle data is missing, skipping PAS 13", () => {
    const a = assessArea({
      vehicleKg: null,
      loadKg: null,
      speedKmh: null,
      trafficDensity: "low",
      pedestrianExposure: "none",
      existingProtection: "adequate",
      condition: "good",
      hazardSeverities: [],
      areaType: "walkway",
      products,
    });
    expect(a.vehicleClass).toBeNull();
    expect(a.risk.likelihood).toBe(1); // low=2, −1 adequate/good
    expect(a.risk.level).toBe("low");
    expect(a.calculatedJoules).toBeNull();
    expect(a.recommendedProducts).toEqual([]);
    expect(a.topProduct).toBeNull();
    expect(a.pas13Verdict).toBeNull();
  });
});

describe("buildRiskMatrix / summariseRegister", () => {
  const areas = [
    { likelihood: 5, severity: 5, riskScore: 25, riskLevel: "critical" },
    { likelihood: 5, severity: 5, riskScore: 25, riskLevel: "critical" },
    { likelihood: 2, severity: 3, riskScore: 6, riskLevel: "medium" },
    { likelihood: 3, severity: 4, riskScore: 12, riskLevel: null }, // band fallback → high
    { likelihood: null, severity: null, riskScore: null, riskLevel: null }, // unassessed
  ];

  it("counts likelihood × severity pairs and ignores unassessed areas", () => {
    const m = buildRiskMatrix(areas);
    expect(m).toHaveLength(5);
    expect(m.every((row) => row.length === 5)).toBe(true);
    expect(m[4][4]).toBe(2);
    expect(m[1][2]).toBe(1);
    expect(m[2][3]).toBe(1);
    expect(m.flat().reduce((s, n) => s + n, 0)).toBe(4);
  });

  it("summarises counts by effective level and the overall highest band", () => {
    expect(summariseRegister(areas)).toEqual({
      total: 5,
      assessed: 4,
      unassessed: 1,
      byLevel: { low: 0, medium: 1, high: 1, critical: 2 },
      overallRiskLevel: "critical",
    });
    expect(summariseRegister([]).overallRiskLevel).toBeNull();
  });

  it("orders the register by priority_rank with unranked last", () => {
    const sorted = sortForRegister([
      { id: "c", priorityRank: null, createdAt: "2026-01-01" },
      { id: "b", priorityRank: 2, createdAt: "2026-01-01" },
      { id: "a", priorityRank: 1, createdAt: "2026-01-01" },
    ]);
    expect(sorted.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });
});

describe("analysis blob helpers", () => {
  it("extracts valid hazard severities and observation text, tolerating junk", () => {
    const analysis = {
      observation: "  Upright bent at base.  ",
      hazards: [{ severity: "high" }, { severity: "bogus" }, null, { tag: "x" }],
    };
    expect(hazardSeveritiesFromAnalysis(analysis)).toEqual(["high"]);
    expect(aiObservationFromAnalysis(analysis)).toBe("Upright bent at base.");
    expect(hazardSeveritiesFromAnalysis(null)).toEqual([]);
    expect(aiObservationFromAnalysis({ observation: "   " })).toBeNull();
    expect(aiObservationFromAnalysis("nope")).toBeNull();
  });
});

describe("areasFromObservationsSchema", () => {
  const valid = {
    zoneName: "Loading Dock",
    mergeIntoOneArea: true,
    trafficDensity: "high",
    vehicleMassKg: 5000,
    speedKmh: 12,
    observations: [
      {
        photoId: "p1",
        areaType: "dock_edge",
        condition: "damaged",
        pedestrianExposure: "unknown",
        existingProtection: "none",
      },
    ],
  };

  it("accepts a minimal body and applies defaults", () => {
    const r = areasFromObservationsSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.loadMassKg).toBe(0);
    expect(r.data.observations[0].hazards).toEqual([]);
    expect(r.data.observations[0].vehicles).toEqual([]);
    expect(r.data.observations[0].observationText).toBe("");
  });

  it("rejects bad enums, empty observations and non-positive mass", () => {
    expect(areasFromObservationsSchema.safeParse({ ...valid, trafficDensity: "huge" }).success).toBe(false);
    expect(areasFromObservationsSchema.safeParse({ ...valid, observations: [] }).success).toBe(false);
    expect(areasFromObservationsSchema.safeParse({ ...valid, vehicleMassKg: 0 }).success).toBe(false);
    expect(
      areasFromObservationsSchema.safeParse({
        ...valid,
        observations: [{ ...valid.observations[0], condition: "meh" }],
      }).success,
    ).toBe(false);
  });
});
