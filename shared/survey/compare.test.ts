import { describe, it, expect } from "vitest";
import {
  compareSnapshots,
  summariseComparison,
  normaliseZoneName,
  zoneTokenOverlap,
  type ComparableArea,
} from "./compare";
import type { SurveySnapshot } from "./snapshot";

function zone(
  zoneName: string,
  score: number,
  priorityRank: number,
  overrides: Partial<ComparableArea> = {},
): ComparableArea {
  const riskLevel =
    score <= 4 ? "low" : score <= 9 ? "medium" : score <= 15 ? "high" : "critical";
  return {
    zoneName,
    areaName: zoneName,
    areaType: "racking",
    riskLevel,
    score,
    priorityRank,
    condition: "damaged",
    photoKeys: [],
    observation: "",
    ...overrides,
  };
}

function snap(id: string, areas: ComparableArea[]): SurveySnapshot {
  return { surveyId: id, completedAt: "2026-09-11T10:00:00.000Z", areas };
}

describe("normaliseZoneName", () => {
  it("is case, whitespace and punctuation insensitive", () => {
    expect(normaliseZoneName("  Loading-Dock   (North) ")).toBe("loading dock north");
    expect(normaliseZoneName("LOADING DOCK NORTH")).toBe(normaliseZoneName("loading_dock.north"));
  });
});

describe("zoneTokenOverlap", () => {
  it("is Jaccard overlap of normalised tokens", () => {
    expect(zoneTokenOverlap("Loading Dock", "Loading Dock A")).toBeCloseTo(2 / 3);
    expect(zoneTokenOverlap("Aisle 1", "Aisle 2")).toBeCloseTo(1 / 3);
    expect(zoneTokenOverlap("", "Aisle 2")).toBe(0);
  });
});

describe("compareSnapshots", () => {
  it("pairs zones whose names differ only in case, spacing and punctuation", () => {
    const rows = compareSnapshots(
      snap("s1", [zone("Loading Dock", 16, 1)]),
      snap("s2", [zone("loading-dock", 9, 1)]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].zone).toBe("loading-dock");
    expect(rows[0].before?.score).toBe(16);
    expect(rows[0].after?.score).toBe(9);
    expect(rows[0].delta).toBe("improved");
    expect(rows[0].scoreChange).toBe(-7);
  });

  it("marks improved when the score drops by at least 2 and names the installed product", () => {
    const rows = compareSnapshots(
      snap("s1", [zone("Racking Aisle 4", 16, 1)]),
      snap("s2", [zone("Racking Aisle 4", 9, 1, { recommendedProduct: "RackGuard", condition: "good" })]),
    );
    expect(rows[0].delta).toBe("improved");
    expect(rows[0].notes[0]).toBe(
      "Score fell from 16 (critical) to 9 (medium) after RackGuard installation.",
    );
    expect(rows[0].notes).toContain("Condition changed from damaged to good.");
  });

  it("prefers installedProduct over recommendedProduct in the improvement note", () => {
    const rows = compareSnapshots(
      snap("s1", [zone("Dock", 12, 1)]),
      snap("s2", [
        zone("Dock", 6, 1, { recommendedProduct: "iFlex Single", installedProduct: "Pedestrian Barrier" }),
      ]),
    );
    expect(rows[0].notes[0]).toBe(
      "Score fell from 12 (high) to 6 (medium) after Pedestrian Barrier installation.",
    );
  });

  it("marks improved on a level-band drop even if the score fell by only 1", () => {
    const rows = compareSnapshots(
      snap("s1", [zone("Dock", 10, 1)]),
      snap("s2", [zone("Dock", 9, 1)]),
    );
    expect(rows[0].delta).toBe("improved");
    expect(rows[0].scoreChange).toBe(-1);
    expect(rows[0].notes[0]).toBe("Score fell from 10 (high) to 9 (medium).");
  });

  it("marks same when the score falls by 1 within the same band, and worse on any rise", () => {
    const rows = compareSnapshots(
      snap("s1", [zone("Dock", 8, 1), zone("Aisle", 6, 2)]),
      snap("s2", [zone("Dock", 7, 2), zone("Aisle", 7, 1)]),
    );
    const dock = rows.find((r) => r.zone === "Dock")!;
    const aisle = rows.find((r) => r.zone === "Aisle")!;
    expect(dock.delta).toBe("same");
    expect(dock.scoreChange).toBe(-1);
    expect(dock.notes[0]).toBe("Score moved from 8 to 7 and remains at medium level.");
    expect(aisle.delta).toBe("worse");
    expect(aisle.scoreChange).toBe(1);
    expect(aisle.notes[0]).toBe("Score rose from 6 (medium) to 7 (medium).");
  });

  it("reports an unchanged score as same with a plain note and the standing recommendation", () => {
    const rows = compareSnapshots(
      snap("s1", [zone("Dock", 9, 1, { recommendedProduct: "iFlex Single" })]),
      snap("s2", [zone("Dock", 9, 1, { recommendedProduct: "iFlex Single" })]),
    );
    expect(rows[0].delta).toBe("same");
    expect(rows[0].notes).toEqual([
      "Score unchanged at 9 (medium).",
      "iFlex Single remains recommended.",
    ]);
  });

  it("fuzzy-pairs on token overlap >= 0.6 when the match is unambiguous", () => {
    const rows = compareSnapshots(
      snap("s1", [zone("Loading Dock", 16, 1)]),
      snap("s2", [zone("Loading Dock A", 4, 1)]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].delta).toBe("improved");
    expect(rows[0].before?.zoneName).toBe("Loading Dock");
    expect(rows[0].after?.zoneName).toBe("Loading Dock A");
  });

  it("does not fuzzy-pair below the 0.6 threshold", () => {
    const rows = compareSnapshots(
      snap("s1", [zone("Aisle 1", 16, 1)]),
      snap("s2", [zone("Aisle 2", 4, 1)]),
    );
    expect(rows.map((r) => r.delta).sort()).toEqual(["new", "removed"]);
  });

  it("falls back to new/removed when a fuzzy match is ambiguous", () => {
    const rows = compareSnapshots(
      snap("s1", [zone("Loading Dock", 16, 1)]),
      snap("s2", [zone("Loading Dock North", 4, 1), zone("Loading Dock South", 6, 2)]),
    );
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.delta === "new")).toHaveLength(2);
    expect(rows.filter((r) => r.delta === "removed")).toHaveLength(1);
  });

  it("still exact-pairs alongside an ambiguous fuzzy cluster", () => {
    const rows = compareSnapshots(
      snap("s1", [zone("Loading Dock", 16, 1), zone("Dock North", 10, 2)]),
      snap("s2", [zone("Loading Dock North", 4, 2), zone("Dock North", 4, 1)]),
    );
    const exact = rows.find((r) => r.zone === "Dock North")!;
    expect(exact.delta).toBe("improved");
    // "Loading Dock" vs "Loading Dock North" is 2/3 but "Dock North" is already
    // exact-paired, so the remaining candidate is unambiguous.
    const fuzzy = rows.find((r) => r.zone === "Loading Dock North")!;
    expect(fuzzy.before?.zoneName).toBe("Loading Dock");
    expect(fuzzy.delta).toBe("improved");
  });

  it("describes new and removed zones with consultant notes and signed scoreChange", () => {
    const rows = compareSnapshots(
      snap("s1", [zone("Old Zone", 12, 1)]),
      snap("s2", [zone("New Zone", 20, 1, { recommendedProduct: "iFlex Double" })]),
    );
    const added = rows.find((r) => r.delta === "new")!;
    const gone = rows.find((r) => r.delta === "removed")!;
    expect(added.before).toBeUndefined();
    expect(added.scoreChange).toBe(20);
    expect(added.notes).toEqual([
      "New zone identified at critical level (score 20).",
      "iFlex Double is recommended.",
    ]);
    expect(gone.after).toBeUndefined();
    expect(gone.scoreChange).toBe(-12);
    expect(gone.notes).toEqual([
      "Zone not surveyed on the return visit; last recorded at high level (score 12).",
    ]);
  });

  it("orders rows by the after-snapshot priorityRank, then removed rows by before rank", () => {
    const rows = compareSnapshots(
      snap("s1", [zone("Gone A", 9, 1), zone("Kept", 12, 2), zone("Gone B", 6, 3)]),
      snap("s2", [zone("Brand New", 20, 1), zone("Kept", 4, 2)]),
    );
    expect(rows.map((r) => r.zone)).toEqual(["Brand New", "Kept", "Gone A", "Gone B"]);
  });

  it("notes a change in priority rank", () => {
    const rows = compareSnapshots(
      snap("s1", [zone("Dock", 16, 1), zone("Aisle", 12, 2)]),
      snap("s2", [zone("Dock", 4, 2), zone("Aisle", 12, 1)]),
    );
    const dock = rows.find((r) => r.zone === "Dock")!;
    expect(dock.notes).toContain("Priority rank moved from 1 to 2.");
  });

  it("disambiguates duplicate zone names within one snapshot using the area name", () => {
    const rows = compareSnapshots(
      snap("s1", [
        zone("Racking", 16, 1, { areaName: "Aisle 1" }),
        zone("Racking", 12, 2, { areaName: "Aisle 2" }),
      ]),
      snap("s2", [
        zone("Racking", 4, 2, { areaName: "Aisle 1" }),
        zone("Racking", 12, 1, { areaName: "Aisle 2" }),
      ]),
    );
    expect(rows.map((r) => [r.zone, r.delta])).toEqual([
      ["Racking – Aisle 2", "same"],
      ["Racking – Aisle 1", "improved"],
    ]);
  });

  it("handles empty snapshots", () => {
    expect(compareSnapshots(snap("s1", []), snap("s2", []))).toEqual([]);
    const onlyAfter = compareSnapshots(snap("s1", []), snap("s2", [zone("Dock", 9, 1)]));
    expect(onlyAfter.map((r) => r.delta)).toEqual(["new"]);
  });
});

describe("summariseComparison", () => {
  it("counts each delta and sums scoreChange", () => {
    const rows = compareSnapshots(
      snap("s1", [
        zone("A", 16, 1),
        zone("B", 9, 2),
        zone("C", 6, 3),
        zone("Gone", 12, 4),
      ]),
      snap("s2", [
        zone("A", 4, 3), // improved, -12
        zone("B", 9, 2), // same, 0
        zone("C", 10, 1), // worse, +4
        zone("New", 6, 4), // new, +6
      ]),
    );
    expect(summariseComparison(rows)).toEqual({
      improved: 1,
      same: 1,
      worse: 1,
      new: 1,
      removed: 1,
      netScoreChange: -12 + 0 + 4 + 6 - 12,
    });
  });

  it("returns zeros for an empty comparison", () => {
    expect(summariseComparison([])).toEqual({
      improved: 0,
      same: 0,
      worse: 0,
      new: 0,
      removed: 0,
      netScoreChange: 0,
    });
  });
});
