import { describe, it, expect } from "vitest";
import {
  buildCompareResponse,
  isSurveySnapshot,
  resolveCurrentSnapshot,
  type CompareSurveyRow,
} from "./siteSurveys";
import type { SurveySnapshot } from "@shared/survey";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const snapshotArea = (over: Partial<SurveySnapshot["areas"][number]> = {}) => ({
  zoneName: "Loading dock",
  areaName: "Dock 1",
  areaType: "loading_dock",
  riskLevel: "high" as const,
  score: 15,
  priorityRank: 1,
  condition: "damaged",
  photoKeys: ["surveys/prev/dock.jpg"],
  observation: "Bent upright",
  ...over,
});

const previousSnapshot: SurveySnapshot = {
  surveyId: "prev",
  completedAt: "2026-06-01T09:00:00.000Z",
  areas: [
    snapshotArea(),
    snapshotArea({ zoneName: "Aisle 4", areaName: "Racking", areaType: "racking_aisle", score: 6, riskLevel: "medium", priorityRank: 2 }),
  ],
};

const previous: CompareSurveyRow = {
  id: "prev",
  title: "Spring visit",
  status: "completed",
  snapshot: previousSnapshot,
};

const liveAreas = [
  {
    id: "a1",
    zoneName: "Loading Dock",
    areaName: "Dock 1",
    areaType: "loading_dock",
    currentCondition: "good",
    riskLevel: "low",
    riskScore: 4,
    likelihood: 2,
    severity: 2,
    priorityRank: 1,
    recommendedProducts: [{ productName: "iFlex Double Traffic Barrier" }],
  },
  {
    id: "a2",
    zoneName: "Charging bay",
    areaName: "FLT chargers",
    areaType: "charging_area",
    currentCondition: "unprotected",
    riskLevel: "high",
    riskScore: 12,
    likelihood: 4,
    severity: 3,
    priorityRank: 2,
  },
];

const livePhotos = [
  { objectKey: "surveys/cur/dock-after.jpg", areaId: "a1", takenAt: "2026-09-12T08:00:00.000Z" },
  { objectKey: "surveys/cur/charger.jpg", areaId: "a2", takenAt: "2026-09-12T08:05:00.000Z" },
];

// ---------------------------------------------------------------------------
// isSurveySnapshot
// ---------------------------------------------------------------------------

describe("isSurveySnapshot", () => {
  it("accepts a well-formed snapshot", () => {
    expect(isSurveySnapshot(previousSnapshot)).toBe(true);
  });

  it("rejects null, primitives, and partial objects", () => {
    expect(isSurveySnapshot(null)).toBe(false);
    expect(isSurveySnapshot("snapshot")).toBe(false);
    expect(isSurveySnapshot({})).toBe(false);
    expect(isSurveySnapshot({ surveyId: "x", completedAt: "y" })).toBe(false);
    expect(isSurveySnapshot({ surveyId: "x", completedAt: "y", areas: [{ zoneName: "z" }] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveCurrentSnapshot
// ---------------------------------------------------------------------------

describe("resolveCurrentSnapshot", () => {
  it("uses the frozen snapshot for a completed survey", () => {
    const current: CompareSurveyRow = { id: "cur", title: "Now", status: "completed", snapshot: previousSnapshot };
    const { snapshot, frozen } = resolveCurrentSnapshot(current, liveAreas, livePhotos);
    expect(frozen).toBe(true);
    expect(snapshot).toBe(previousSnapshot);
  });

  it("builds a live snapshot for a draft survey, or a completed one with no snapshot", () => {
    const draft: CompareSurveyRow = { id: "cur", title: "Now", status: "draft", snapshot: null };
    const live = resolveCurrentSnapshot(draft, liveAreas, livePhotos);
    expect(live.frozen).toBe(false);
    expect(live.snapshot.surveyId).toBe("cur");
    expect(live.snapshot.areas.map((a) => a.zoneName)).toEqual(["Loading Dock", "Charging bay"]);
    expect(live.snapshot.areas[0].photoKeys).toEqual(["surveys/cur/dock-after.jpg"]);

    const legacy: CompareSurveyRow = { id: "cur", title: "Now", status: "completed", snapshot: { broken: true } };
    expect(resolveCurrentSnapshot(legacy, liveAreas, livePhotos).frozen).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildCompareResponse
// ---------------------------------------------------------------------------

describe("buildCompareResponse", () => {
  it("returns null when the previous survey has no usable snapshot", () => {
    const noSnap: CompareSurveyRow = { ...previous, snapshot: null };
    const current: CompareSurveyRow = { id: "cur", title: "Now", status: "draft" };
    expect(buildCompareResponse(noSnap, current, liveAreas, livePhotos)).toBeNull();
  });

  it("pairs zones case-insensitively and classifies improved / new / removed with a live current", () => {
    const current: CompareSurveyRow = { id: "cur", title: "Return visit", status: "draft" };
    const res = buildCompareResponse(previous, current, liveAreas, livePhotos);
    expect(res).not.toBeNull();
    const byZone = Object.fromEntries(res!.rows.map((r) => [r.zone, r]));

    expect(byZone["Loading Dock"].delta).toBe("improved");
    expect(byZone["Loading Dock"].before?.photoKeys).toEqual(["surveys/prev/dock.jpg"]);
    expect(byZone["Loading Dock"].after?.photoKeys).toEqual(["surveys/cur/dock-after.jpg"]);
    expect(byZone["Loading Dock"].scoreChange).toBe(-11);
    expect(byZone["Charging bay"].delta).toBe("new");
    expect(byZone["Aisle 4"].delta).toBe("removed");

    expect(res!.summary).toEqual({ improved: 1, same: 0, worse: 0, new: 1, removed: 1, netScoreChange: -11 + 12 - 6 });
    expect(res!.previous).toEqual({ id: "prev", title: "Spring visit", completedAt: "2026-06-01T09:00:00.000Z" });
    // Live current: no completedAt on the visit header.
    expect(res!.current).toEqual({ id: "cur", title: "Return visit" });
  });

  it("reports completedAt for the current visit when its snapshot is frozen", () => {
    const frozen: SurveySnapshot = {
      surveyId: "cur",
      completedAt: "2026-09-12T10:00:00.000Z",
      areas: [snapshotArea({ score: 20, riskLevel: "critical", condition: "critical" })],
    };
    const current: CompareSurveyRow = { id: "cur", title: "Return visit", status: "completed", snapshot: frozen };
    const res = buildCompareResponse(previous, current, [], []);
    expect(res!.current.completedAt).toBe("2026-09-12T10:00:00.000Z");
    expect(res!.rows[0].delta).toBe("worse");
    expect(res!.summary.worse).toBe(1);
    expect(res!.summary.removed).toBe(1);
  });
});
