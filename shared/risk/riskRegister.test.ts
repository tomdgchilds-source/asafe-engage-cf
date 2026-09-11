import { describe, it, expect } from "vitest";
import {
  assessRisk,
  rankAreas,
  riskLevel,
  clampRating,
  describeLikelihood,
  describeSeverity,
  LIKELIHOOD_DESCRIPTORS,
  SEVERITY_DESCRIPTORS,
  RISK_LEVEL_BANDS,
  type RiskInputs,
} from "./riskRegister";

/** A middle-of-the-road zone where no modifier rule fires. */
function baseline(overrides: Partial<RiskInputs> = {}): RiskInputs {
  return {
    vehicleClass: null,
    trafficDensity: "medium",
    pedestrianExposure: "occasional",
    existingProtection: "partial",
    currentCondition: "damaged",
    hazardSeverities: [],
    ...overrides,
  };
}

describe("assessRisk — base ratings", () => {
  it("uses only the traffic and pedestrian bases when no modifier fires", () => {
    const out = assessRisk(baseline());
    expect(out.likelihood).toBe(3);
    expect(out.severity).toBe(3);
    expect(out.score).toBe(9);
    expect(out.level).toBe("medium");
    expect(out.rationale).toEqual([
      "Medium traffic density sets likelihood to 3.",
      "Occasional pedestrian exposure sets severity to 3.",
      "A score of 9 (3 × 3) places the zone at medium level.",
    ]);
  });

  it("maps every traffic density to its likelihood base", () => {
    expect(assessRisk(baseline({ trafficDensity: "low" })).likelihood).toBe(2);
    expect(assessRisk(baseline({ trafficDensity: "medium" })).likelihood).toBe(3);
    expect(assessRisk(baseline({ trafficDensity: "high" })).likelihood).toBe(4);
  });

  it("maps every pedestrian exposure to its severity base", () => {
    expect(assessRisk(baseline({ pedestrianExposure: "none" })).severity).toBe(2);
    expect(assessRisk(baseline({ pedestrianExposure: "occasional" })).severity).toBe(3);
    expect(assessRisk(baseline({ pedestrianExposure: "frequent" })).severity).toBe(4);
    expect(assessRisk(baseline({ pedestrianExposure: "constant" })).severity).toBe(5);
  });
});

describe("assessRisk — likelihood modifiers", () => {
  it("adds 1 for vehicle classes T3 and T4 but not T1 or T2", () => {
    expect(assessRisk(baseline({ vehicleClass: "T1" })).likelihood).toBe(3);
    expect(assessRisk(baseline({ vehicleClass: "T2" })).likelihood).toBe(3);
    const t3 = assessRisk(baseline({ vehicleClass: "T3" }));
    expect(t3.likelihood).toBe(4);
    expect(t3.rationale).toContain("Heavy vehicle class T3 raises likelihood by 1.");
    const t4 = assessRisk(baseline({ vehicleClass: "T4" }));
    expect(t4.likelihood).toBe(4);
    expect(t4.rationale).toContain("Heavy vehicle class T4 raises likelihood by 1.");
  });

  it("adds 1 only when protection is none AND condition is unprotected", () => {
    const both = assessRisk(baseline({ existingProtection: "none", currentCondition: "unprotected" }));
    expect(both.likelihood).toBe(4);
    expect(both.rationale).toContain(
      "No existing protection and an unprotected condition raise likelihood by 1.",
    );
    // Only one half of the condition: no bump.
    expect(assessRisk(baseline({ existingProtection: "none", currentCondition: "damaged" })).likelihood).toBe(3);
    expect(assessRisk(baseline({ existingProtection: "partial", currentCondition: "unprotected" })).likelihood).toBe(3);
  });

  it("subtracts 1 only when protection is adequate AND condition is good", () => {
    const both = assessRisk(baseline({ existingProtection: "adequate", currentCondition: "good" }));
    expect(both.likelihood).toBe(2);
    expect(both.rationale).toContain(
      "Adequate existing protection in good condition lowers likelihood by 1.",
    );
    expect(assessRisk(baseline({ existingProtection: "adequate", currentCondition: "damaged" })).likelihood).toBe(3);
    expect(assessRisk(baseline({ existingProtection: "partial", currentCondition: "good" })).likelihood).toBe(3);
  });
});

describe("assessRisk — severity modifiers", () => {
  it("adds 1 when any hazard is critical, regardless of the others", () => {
    expect(assessRisk(baseline({ hazardSeverities: ["low", "medium", "high"] })).severity).toBe(3);
    const crit = assessRisk(baseline({ hazardSeverities: ["low", "critical"] }));
    expect(crit.severity).toBe(4);
    expect(crit.rationale).toContain("A critical hazard raises severity by 1.");
    // Two critical hazards still add only 1.
    expect(assessRisk(baseline({ hazardSeverities: ["critical", "critical"] })).severity).toBe(4);
  });

  it("adds 1 for high asset criticality only", () => {
    expect(assessRisk(baseline({ assetCriticality: "low" })).severity).toBe(3);
    expect(assessRisk(baseline({ assetCriticality: "medium" })).severity).toBe(3);
    const high = assessRisk(baseline({ assetCriticality: "high" }));
    expect(high.severity).toBe(4);
    expect(high.rationale).toContain("High asset criticality raises severity by 1.");
  });

  it("subtracts 1 only for a T1 vehicle with no pedestrian exposure", () => {
    const both = assessRisk(baseline({ vehicleClass: "T1", pedestrianExposure: "none" }));
    expect(both.severity).toBe(1);
    expect(both.rationale).toContain(
      "A light vehicle class T1 with no pedestrian exposure lowers severity by 1.",
    );
    expect(assessRisk(baseline({ vehicleClass: "T1", pedestrianExposure: "occasional" })).severity).toBe(3);
    expect(assessRisk(baseline({ vehicleClass: "T2", pedestrianExposure: "none" })).severity).toBe(2);
    expect(assessRisk(baseline({ vehicleClass: null, pedestrianExposure: "none" })).severity).toBe(2);
  });
});

describe("assessRisk — clamps and levels", () => {
  it("clamps both ratings to 5 in the worst case and records the cap in the rationale", () => {
    const out = assessRisk({
      vehicleClass: "T4",
      trafficDensity: "high",
      pedestrianExposure: "constant",
      existingProtection: "none",
      currentCondition: "unprotected",
      hazardSeverities: ["critical"],
      assetCriticality: "high",
    });
    // Unclamped: likelihood 4+1+1 = 6, severity 5+1+1 = 7.
    expect(out.likelihood).toBe(5);
    expect(out.severity).toBe(5);
    expect(out.score).toBe(25);
    expect(out.level).toBe("critical");
    expect(out.rationale).toEqual([
      "High traffic density sets likelihood to 4.",
      "Heavy vehicle class T4 raises likelihood by 1.",
      "No existing protection and an unprotected condition raise likelihood by 1.",
      "Likelihood of 6 is capped at 5.",
      "Constant pedestrian exposure sets severity to 5.",
      "A critical hazard raises severity by 1.",
      "High asset criticality raises severity by 1.",
      "Severity of 7 is capped at 5.",
      "A score of 25 (5 × 5) places the zone at critical level.",
    ]);
  });

  it("holds both ratings at the floor of 1 in the best case without a cap sentence", () => {
    const out = assessRisk({
      vehicleClass: "T1",
      trafficDensity: "low",
      pedestrianExposure: "none",
      existingProtection: "adequate",
      currentCondition: "good",
      hazardSeverities: ["low"],
      assetCriticality: "low",
    });
    expect(out.likelihood).toBe(1);
    expect(out.severity).toBe(1);
    expect(out.score).toBe(1);
    expect(out.level).toBe("low");
    expect(out.rationale.some((s) => /capped|floor|minimum/i.test(s))).toBe(false);
  });

  it("clampRating bounds any integer to 1..5", () => {
    expect(clampRating(-3)).toBe(1);
    expect(clampRating(0)).toBe(1);
    expect(clampRating(1)).toBe(1);
    expect(clampRating(5)).toBe(5);
    expect(clampRating(6)).toBe(5);
    expect(clampRating(99)).toBe(5);
  });

  it("assigns levels on the exact band boundaries", () => {
    expect(riskLevel(1)).toBe("low");
    expect(riskLevel(4)).toBe("low");
    expect(riskLevel(5)).toBe("medium");
    expect(riskLevel(9)).toBe("medium");
    expect(riskLevel(10)).toBe("high");
    expect(riskLevel(15)).toBe("high");
    expect(riskLevel(16)).toBe("critical");
    expect(riskLevel(25)).toBe("critical");
  });

  it("reaches each level through assessRisk", () => {
    // 2 × 2 = 4 → low
    expect(assessRisk(baseline({ trafficDensity: "low", pedestrianExposure: "none" })).level).toBe("low");
    // 3 × 3 = 9 → medium
    expect(assessRisk(baseline()).level).toBe("medium");
    // 3 × 4 = 12 → high
    expect(assessRisk(baseline({ pedestrianExposure: "frequent" })).level).toBe("high");
    // 4 × 5 = 20 → critical
    expect(assessRisk(baseline({ trafficDensity: "high", pedestrianExposure: "constant" })).level).toBe("critical");
  });

  it("writes rationale as complete sentences", () => {
    const out = assessRisk(baseline({ vehicleClass: "T3", hazardSeverities: ["critical"] }));
    for (const sentence of out.rationale) {
      expect(sentence).toMatch(/^[A-Z].*\.$/);
    }
  });
});

describe("rankAreas", () => {
  it("ranks by score descending with rank 1 as the most urgent", () => {
    const ranked = rankAreas([
      { id: "a", name: "Aisle 1", score: 6, severity: 3 },
      { id: "b", name: "Dock 2", score: 20, severity: 5 },
      { id: "c", name: "Yard", score: 12, severity: 4 },
    ]);
    expect(ranked.map((r) => [r.id, r.priorityRank])).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
    ]);
  });

  it("breaks score ties by severity descending, then by area name ascending", () => {
    const ranked = rankAreas([
      { id: "x", name: "Zone C", score: 12, severity: 3 },
      { id: "y", name: "Zone B", score: 12, severity: 4 },
      { id: "z", name: "Zone A", score: 12, severity: 3 },
      { id: "w", name: "Zone D", score: 12, severity: 4 },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["y", "w", "z", "x"]);
    expect(ranked.map((r) => r.priorityRank)).toEqual([1, 2, 3, 4]);
  });

  it("falls back to id when score, severity and name are all equal, so ranking is deterministic", () => {
    const ranked = rankAreas([
      { id: "b", name: "Same", score: 9, severity: 3 },
      { id: "a", name: "Same", score: 9, severity: 3 },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("accepts the minimal shape from the plan (id + score) and does not mutate its input", () => {
    const input = [
      { id: "p", score: 4 },
      { id: "q", score: 16 },
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    const ranked = rankAreas(input);
    expect(ranked.map((r) => r.id)).toEqual(["q", "p"]);
    expect(ranked[0]).toMatchObject({ id: "q", score: 16, priorityRank: 1 });
    expect(input).toEqual(snapshot);
    expect(ranked).not.toBe(input);
  });

  it("returns an empty array for no areas", () => {
    expect(rankAreas([])).toEqual([]);
  });
});

describe("descriptors and legend", () => {
  it("describes likelihood 1–5 with the standard wording", () => {
    expect([1, 2, 3, 4, 5].map(describeLikelihood)).toEqual([
      "Rare",
      "Unlikely",
      "Possible",
      "Likely",
      "Almost certain",
    ]);
    expect(LIKELIHOOD_DESCRIPTORS).toHaveLength(5);
  });

  it("describes severity 1–5 with the standard wording", () => {
    expect([1, 2, 3, 4, 5].map(describeSeverity)).toEqual([
      "Negligible",
      "Minor",
      "Moderate",
      "Major",
      "Catastrophic",
    ]);
    expect(SEVERITY_DESCRIPTORS).toHaveLength(5);
  });

  it("clamps out-of-range and fractional inputs to the nearest valid descriptor", () => {
    expect(describeLikelihood(0)).toBe("Rare");
    expect(describeLikelihood(9)).toBe("Almost certain");
    expect(describeSeverity(-1)).toBe("Negligible");
    expect(describeSeverity(3.4)).toBe("Moderate");
    expect(describeSeverity(3.6)).toBe("Major");
  });

  it("RISK_LEVEL_BANDS cover 1..25 contiguously, in ascending order, and agree with riskLevel", () => {
    expect(RISK_LEVEL_BANDS.map((b) => b.level)).toEqual(["low", "medium", "high", "critical"]);
    expect(RISK_LEVEL_BANDS[0].min).toBe(1);
    expect(RISK_LEVEL_BANDS[RISK_LEVEL_BANDS.length - 1].max).toBe(25);
    for (let i = 1; i < RISK_LEVEL_BANDS.length; i++) {
      expect(RISK_LEVEL_BANDS[i].min).toBe(RISK_LEVEL_BANDS[i - 1].max + 1);
    }
    for (let score = 1; score <= 25; score++) {
      const band = RISK_LEVEL_BANDS.find((b) => score >= b.min && score <= b.max);
      expect(band?.level).toBe(riskLevel(score));
    }
  });

  it("gives every band a label, a range string and an action timescale for the legend", () => {
    expect(RISK_LEVEL_BANDS.map((b) => b.range)).toEqual(["1–4", "5–9", "10–15", "16–25"]);
    expect(RISK_LEVEL_BANDS.map((b) => b.actionTimescale)).toEqual([
      "Planned",
      "90 days",
      "30 days",
      "Immediate",
    ]);
    for (const band of RISK_LEVEL_BANDS) {
      expect(band.label.length).toBeGreaterThan(0);
    }
  });
});
