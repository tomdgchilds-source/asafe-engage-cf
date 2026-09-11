import { describe, it, expect } from "vitest";
import {
  buildSnapshot,
  type SnapshotSurveyRow,
  type SnapshotAreaRow,
  type SnapshotPhotoRow,
} from "./snapshot";

const survey: SnapshotSurveyRow = { id: "svy-1" };

function area(overrides: Partial<SnapshotAreaRow> & { id: string }): SnapshotAreaRow {
  return {
    zoneName: "Loading Dock",
    areaName: "Bay 1",
    areaType: "loading_bay",
    currentCondition: "damaged",
    riskLevel: "high",
    riskScore: 12,
    likelihood: 3,
    severity: 4,
    priorityRank: 1,
    recommendedProducts: [{ productId: "p1", productName: "iFlex Double Traffic Barrier+" }],
    aiObservation: "Racking uprights show impact damage.",
    ...overrides,
  };
}

function photo(overrides: Partial<SnapshotPhotoRow> & { objectKey: string }): SnapshotPhotoRow {
  return { areaId: null, ...overrides };
}

describe("buildSnapshot", () => {
  it("freezes surveyId, completedAt (ISO) and one entry per area in the plan shape", () => {
    const snap = buildSnapshot(survey, [area({ id: "a1" })], [], {
      completedAt: new Date("2026-09-11T10:00:00Z"),
    });
    expect(snap.surveyId).toBe("svy-1");
    expect(snap.completedAt).toBe("2026-09-11T10:00:00.000Z");
    expect(snap.areas).toEqual([
      {
        zoneName: "Loading Dock",
        areaName: "Bay 1",
        areaType: "loading_bay",
        riskLevel: "high",
        score: 12,
        priorityRank: 1,
        condition: "damaged",
        recommendedProduct: "iFlex Double Traffic Barrier+",
        photoKeys: [],
        observation: "Racking uprights show impact damage.",
      },
    ]);
  });

  it("orders areas by priorityRank ascending regardless of input order", () => {
    const snap = buildSnapshot(
      survey,
      [
        area({ id: "a3", zoneName: "Aisle 3", priorityRank: 3, riskScore: 4, riskLevel: "low" }),
        area({ id: "a1", zoneName: "Aisle 1", priorityRank: 1, riskScore: 20, riskLevel: "critical" }),
        area({ id: "a2", zoneName: "Aisle 2", priorityRank: 2, riskScore: 9, riskLevel: "medium" }),
      ],
      [],
    );
    expect(snap.areas.map((a) => a.zoneName)).toEqual(["Aisle 1", "Aisle 2", "Aisle 3"]);
    expect(snap.areas.map((a) => a.priorityRank)).toEqual([1, 2, 3]);
  });

  it("recomputes ranks with the risk register when any area lacks priorityRank", () => {
    const snap = buildSnapshot(
      survey,
      [
        area({ id: "a1", zoneName: "Low", priorityRank: null, riskScore: 4, severity: 2 }),
        area({ id: "a2", zoneName: "High", priorityRank: null, riskScore: 16, severity: 4 }),
        area({ id: "a3", zoneName: "Mid", priorityRank: null, riskScore: 9, severity: 3 }),
      ],
      [],
    );
    expect(snap.areas.map((a) => [a.zoneName, a.priorityRank])).toEqual([
      ["High", 1],
      ["Mid", 2],
      ["Low", 3],
    ]);
  });

  it("assigns photoKeys per area from survey_photos.areaId, ordered by takenAt", () => {
    const photos = [
      photo({ objectKey: "k/late.jpg", areaId: "a1", takenAt: new Date("2026-09-11T10:05:00Z") }),
      photo({ objectKey: "k/other.jpg", areaId: "a2", takenAt: new Date("2026-09-11T10:01:00Z") }),
      photo({ objectKey: "k/early.jpg", areaId: "a1", takenAt: new Date("2026-09-11T10:00:00Z") }),
      photo({ objectKey: "k/unlinked.jpg", areaId: null }),
    ];
    const snap = buildSnapshot(
      survey,
      [area({ id: "a1", priorityRank: 1 }), area({ id: "a2", zoneName: "Aisle 2", priorityRank: 2 })],
      photos,
    );
    expect(snap.areas[0].photoKeys).toEqual(["k/early.jpg", "k/late.jpg"]);
    expect(snap.areas[1].photoKeys).toEqual(["k/other.jpg"]);
  });

  it("falls back to legacy photosUrls strings when an area has no linked survey_photos", () => {
    const snap = buildSnapshot(
      survey,
      [area({ id: "a1", photosUrls: ["https://cdn/legacy-1.jpg", 42, "https://cdn/legacy-2.jpg"] })],
      [],
    );
    expect(snap.areas[0].photoKeys).toEqual(["https://cdn/legacy-1.jpg", "https://cdn/legacy-2.jpg"]);
  });

  it("derives score from likelihood × severity when riskScore is absent, and from the level as a last resort", () => {
    const snap = buildSnapshot(
      survey,
      [
        area({ id: "a1", zoneName: "Product", riskScore: null, likelihood: 4, severity: 5, priorityRank: 1 }),
        area({
          id: "a2",
          zoneName: "Legacy",
          riskScore: null,
          likelihood: null,
          severity: null,
          riskLevel: "critical",
          priorityRank: 2,
        }),
      ],
      [],
    );
    expect(snap.areas[0].score).toBe(20);
    expect(snap.areas[1].score).toBe(20);
    expect(snap.areas[1].riskLevel).toBe("critical");
  });

  it("derives riskLevel from the score when the column holds an unknown value", () => {
    const snap = buildSnapshot(
      survey,
      [area({ id: "a1", riskLevel: "urgent", riskScore: 6 })],
      [],
    );
    expect(snap.areas[0].riskLevel).toBe("medium");
  });

  it("reads recommendedProduct from string arrays, object arrays with name, or omits it", () => {
    const snap = buildSnapshot(
      survey,
      [
        area({ id: "a1", zoneName: "A", priorityRank: 1, recommendedProducts: ["RackGuard"] }),
        area({ id: "a2", zoneName: "B", priorityRank: 2, recommendedProducts: [{ name: "Pedestrian Barrier" }] }),
        area({ id: "a3", zoneName: "C", priorityRank: 3, recommendedProducts: null }),
        area({ id: "a4", zoneName: "D", priorityRank: 4, recommendedProducts: "not-an-array" }),
      ],
      [],
    );
    expect(snap.areas[0].recommendedProduct).toBe("RackGuard");
    expect(snap.areas[1].recommendedProduct).toBe("Pedestrian Barrier");
    expect(snap.areas[2]).not.toHaveProperty("recommendedProduct");
    expect(snap.areas[3]).not.toHaveProperty("recommendedProduct");
  });

  it("falls back from aiObservation to issueDescription to description for observation", () => {
    const snap = buildSnapshot(
      survey,
      [
        area({ id: "a1", zoneName: "A", priorityRank: 1, aiObservation: null, issueDescription: "Bent upright." }),
        area({ id: "a2", zoneName: "B", priorityRank: 2, aiObservation: null, issueDescription: null, description: "Notes." }),
        area({ id: "a3", zoneName: "C", priorityRank: 3, aiObservation: null }),
      ],
      [],
    );
    expect(snap.areas.map((a) => a.observation)).toEqual(["Bent upright.", "Notes.", ""]);
  });

  it("is JSON round-trippable and does not share references with the inputs", () => {
    const photos = [photo({ objectKey: "k/1.jpg", areaId: "a1" })];
    const areas = [area({ id: "a1" })];
    const snap = buildSnapshot(survey, areas, photos);
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    snap.areas[0].photoKeys.push("mutated");
    expect(photos).toHaveLength(1);
    expect(areas[0].photosUrls).toBeUndefined();
  });
});
