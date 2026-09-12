import { describe, expect, it } from "vitest";
import {
  budgetLineFor,
  buildOrderFormItems,
  countUnlinkedAnalysed,
  hasRegisterData,
  registerBudgetTotalAed,
  returnVisitCandidates,
  sortByPriorityRank,
  uniqueZoneNames,
  verdictLabel,
  zoneNamesFromSnapshot,
  type RegisterArea,
  type RegisterProductRecommendation,
} from "./useSurveyRegister";

function product(over: Partial<RegisterProductRecommendation> = {}): RegisterProductRecommendation {
  return {
    productId: "p1",
    productName: "iFlex Traffic Barrier",
    impactRating: 12000,
    imageUrl: null,
    price: "850",
    category: "traffic-guardrails",
    safetyMarginPct: 40,
    pas13Verdict: "aligned",
    notAligned: false,
    reason: "Aligned",
    ...over,
  };
}

function area(over: Partial<RegisterArea> & { id: string }): RegisterArea {
  return {
    siteSurveyId: "s1",
    zoneName: "Zone A",
    areaName: "Racking end",
    areaType: "Racking",
    areaTypeLabel: "Racking",
    currentCondition: "unprotected",
    riskLevel: "high",
    likelihood: 4,
    severity: 3,
    riskScore: 12,
    priorityRank: 1,
    priority: "high",
    trafficDensity: "high",
    pedestrianExposure: "occasional",
    existingProtection: "none",
    vehicleWeight: 3000,
    vehicleSpeed: 8,
    impactAngle: 90,
    loadMass: null,
    calculatedJoules: 7400,
    recommendedLengthM: 12,
    recommendedProducts: [product()],
    topProduct: product(),
    pas13Verdict: null,
    issueDescription: "",
    aiObservation: null,
    recommendedAction: null,
    estimatedCost: null,
    rationale: [],
    photos: [],
    photosUrls: [],
    createdAt: "2026-09-11T10:00:00.000Z",
    updatedAt: null,
    ...over,
  };
}

describe("hasRegisterData", () => {
  it("is false for undefined, empty, or all-null scores", () => {
    expect(hasRegisterData(undefined)).toBe(false);
    expect(hasRegisterData([])).toBe(false);
    expect(hasRegisterData([{ riskScore: null }, { riskScore: null }])).toBe(false);
  });
  it("is true when any area carries a score", () => {
    expect(hasRegisterData([{ riskScore: null }, { riskScore: 6 }])).toBe(true);
  });
});

describe("sortByPriorityRank", () => {
  it("orders by rank ascending with unranked last, newest first", () => {
    const rows = [
      area({ id: "c", priorityRank: null, createdAt: "2026-09-01T00:00:00.000Z" }),
      area({ id: "b", priorityRank: 2 }),
      area({ id: "d", priorityRank: null, createdAt: "2026-09-05T00:00:00.000Z" }),
      area({ id: "a", priorityRank: 1 }),
    ];
    expect(sortByPriorityRank(rows).map((r) => r.id)).toEqual(["a", "b", "d", "c"]);
  });
  it("does not mutate the input", () => {
    const rows = [area({ id: "b", priorityRank: 2 }), area({ id: "a", priorityRank: 1 })];
    sortByPriorityRank(rows);
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("budgetLineFor", () => {
  it("multiplies run length by the top product rate (2 dp)", () => {
    const line = budgetLineFor(area({ id: "a", recommendedLengthM: 12.5, topProduct: product({ price: "850.333" }) }));
    expect(line).toEqual({ ratePerM: 850.33, lengthM: 12.5, totalAed: 10629.13 });
  });
  it("is null without a product, rate, or length", () => {
    expect(budgetLineFor(area({ id: "a", topProduct: null }))).toBeNull();
    expect(budgetLineFor(area({ id: "a", topProduct: product({ price: null }) }))).toBeNull();
    expect(budgetLineFor(area({ id: "a", topProduct: product({ price: "junk" }) }))).toBeNull();
    expect(budgetLineFor(area({ id: "a", recommendedLengthM: null }))).toBeNull();
    expect(budgetLineFor(area({ id: "a", recommendedLengthM: 0 }))).toBeNull();
  });
  it("sums across the register, skipping rows without a line", () => {
    const total = registerBudgetTotalAed([
      area({ id: "a", recommendedLengthM: 10, topProduct: product({ price: 100 }) }),
      area({ id: "b", topProduct: null }),
      area({ id: "c", recommendedLengthM: 2.5, topProduct: product({ price: "40" }) }),
    ]);
    expect(total).toBe(1100);
  });
});

describe("countUnlinkedAnalysed", () => {
  it("counts analysed photos with no area", () => {
    expect(
      countUnlinkedAnalysed([
        { areaId: null, analysisStatus: "done" },
        { areaId: undefined, analysisStatus: "done" },
        { areaId: "a1", analysisStatus: "done" },
        { areaId: null, analysisStatus: "pending" },
        { areaId: null, analysisStatus: "failed" },
      ]),
    ).toBe(2);
    expect(countUnlinkedAnalysed(undefined)).toBe(0);
  });
});

describe("buildOrderFormItems", () => {
  it("emits one line per ranked area with a top product, in register order", () => {
    const items = buildOrderFormItems(
      [
        area({ id: "b", priorityRank: 2, zoneName: "Zone B", recommendedLengthM: null, topProduct: product({ productName: "Bollard", price: 300 }) }),
        area({ id: "none", priorityRank: 3, topProduct: null }),
        area({ id: "a", priorityRank: 1, zoneName: "Zone A", recommendedLengthM: 12, topProduct: product({ price: "850" }) }),
      ],
      { facilityLocation: "Dubai" },
    );
    expect(items.map((i) => i.zoneName)).toEqual(["Zone A", "Zone B"]);

    const [perMetre, perUnit] = items;
    expect(perMetre.pricingType).toBe("linear_meter");
    expect(perMetre.quantity).toBe(12);
    expect(perMetre.unitPrice).toBe(850);
    expect(perMetre.totalPrice).toBe(10200);
    expect(perMetre.deliveryAddress).toBe("Dubai");
    expect(perMetre.requiresDelivery).toBe(true);
    expect(perMetre.requiresInstallation).toBe(true);
    expect(perMetre.notes).toContain("#1 Zone A");
    expect(perMetre.notes).toContain("PAS 13 aligned");

    expect(perUnit.pricingType).toBe("standard_item");
    expect(perUnit.quantity).toBe(1);
    expect(perUnit.productName).toBe("Bollard");
    expect(perUnit.totalPrice).toBe(300);
  });
  it("prefers the stored area verdict over the product verdict in the note", () => {
    const [item] = buildOrderFormItems(
      [
        area({
          id: "a",
          topProduct: product({ pas13Verdict: "aligned" }),
          pas13Verdict: { verdict: "borderline" } as RegisterArea["pas13Verdict"],
        }),
      ],
      null,
    );
    expect(item.notes).toContain("PAS 13 borderline");
  });
});

describe("verdictLabel", () => {
  it("maps verdicts to plain wording", () => {
    expect(verdictLabel("aligned")).toBe("aligned");
    expect(verdictLabel("borderline")).toBe("borderline");
    expect(verdictLabel("not_aligned")).toBe("not aligned");
    expect(verdictLabel(null)).toBe("not assessed");
  });
});

describe("returnVisitCandidates", () => {
  const surveys = [
    { id: "1", title: "Old draft", facilityName: "DHL", status: "draft", surveyDate: "2026-08-01T00:00:00.000Z" },
    { id: "2", title: "DHL Q1", facilityName: "DHL", status: "completed", surveyDate: "2026-03-01T00:00:00.000Z" },
    { id: "3", title: "DHL Q2", facilityName: " dhl ", status: "completed", surveyDate: "2026-06-01T00:00:00.000Z" },
    { id: "4", title: "Amazon", facilityName: "Amazon", status: "completed", surveyDate: "2026-07-01T00:00:00.000Z" },
  ];
  it("lists only completed surveys for the typed facility, newest first", () => {
    expect(returnVisitCandidates(surveys, "DHL").map((s) => s.id)).toEqual(["3", "2"]);
  });
  it("lists every completed survey when no facility is typed", () => {
    expect(returnVisitCandidates(surveys, "").map((s) => s.id)).toEqual(["4", "3", "2"]);
    expect(returnVisitCandidates(undefined, "DHL")).toEqual([]);
  });
});

describe("zone names", () => {
  it("dedupes case-insensitively and keeps first spelling", () => {
    expect(uniqueZoneNames([{ zoneName: "Dock A" }, { zoneName: " dock a " }, { zoneName: "" }, { zoneName: null }, { zoneName: "Dock B" }])).toEqual([
      "Dock A",
      "Dock B",
    ]);
  });
  it("reads zones from a snapshot and tolerates junk", () => {
    expect(zoneNamesFromSnapshot({ areas: [{ zoneName: "Z1" }, { zoneName: "Z2" }, { zoneName: "z1" }] })).toEqual(["Z1", "Z2"]);
    expect(zoneNamesFromSnapshot(null)).toEqual([]);
    expect(zoneNamesFromSnapshot({ areas: "nope" })).toEqual([]);
    expect(zoneNamesFromSnapshot("string")).toEqual([]);
  });
});
