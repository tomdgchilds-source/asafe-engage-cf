/// <reference types="vitest" />
/**
 * Vitest-style regression tests for barrierLadders.ts.
 *
 * If vitest isn't wired into the project yet, this file still acts as a
 * readable specification of expected behaviour and can be dropped into a
 * vitest run at any time — the describe/it/expect globals it references
 * match Jest / Vitest conventions.
 */

import {
  findLadderForFamily,
  findLadderForApplication,
  safetyMargin,
  recommendTier,
  LADDERS,
  type BarrierLadder,
} from "./barrierLadders";

function ladderById(id: string): BarrierLadder {
  const ladder = LADDERS.find((l) => l.id === id);
  if (!ladder) throw new Error(`test fixture missing ladder "${id}"`);
  return ladder;
}

describe("findLadderForFamily", () => {
  it("resolves 'iFlex Single Traffic - 1600mm' to single-traffic/better", () => {
    const hit = findLadderForFamily("iFlex Single Traffic - 1600mm");
    expect(hit).not.toBeNull();
    expect(hit!.ladder.id).toBe("single-traffic");
    expect(hit!.tier).toBe("better");
  });

  it("resolves 'eFlex Pedestrian Barrier' to pedestrian/good", () => {
    const hit = findLadderForFamily("eFlex Pedestrian Barrier");
    expect(hit).not.toBeNull();
    expect(hit!.ladder.id).toBe("pedestrian");
    expect(hit!.tier).toBe("good");
  });

  it("is case-insensitive", () => {
    const hit = findLadderForFamily("IFLEX SINGLE TRAFFIC");
    expect(hit).not.toBeNull();
    expect(hit!.ladder.id).toBe("single-traffic");
    expect(hit!.tier).toBe("better");
  });

  it("returns null for unknown products", () => {
    expect(findLadderForFamily("Unknown Product")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(findLadderForFamily("")).toBeNull();
  });
});

describe("findLadderForApplication", () => {
  it("matches a known application area case-insensitively", () => {
    const ladder = findLadderForApplication("pedestrian walkways");
    expect(ladder).not.toBeNull();
    expect(ladder!.id).toBe("pedestrian");
  });

  it("matches via substring", () => {
    const ladder = findLadderForApplication("Column");
    expect(ladder).not.toBeNull();
    expect(ladder!.id).toBe("column");
  });

  it("returns null for unknown areas", () => {
    expect(findLadderForApplication("Rocket Launchpad")).toBeNull();
  });
});

describe("safetyMargin", () => {
  it("computes (product - required) / required", () => {
    expect(safetyMargin(15000, 10000)).toBeCloseTo(0.5, 10);
  });

  it("returns 0 when requiredJoules is 0", () => {
    expect(safetyMargin(10000, 0)).toBe(0);
  });

  it("returns 0 when requiredJoules is negative", () => {
    expect(safetyMargin(10000, -50)).toBe(0);
  });

  it("returns 0 when productJoules is missing", () => {
    expect(safetyMargin(null, 10000)).toBe(0);
    expect(safetyMargin(undefined, 10000)).toBe(0);
  });

  it("returns a negative margin when product is weaker than required", () => {
    expect(safetyMargin(8000, 10000)).toBeCloseTo(-0.2, 10);
  });
});

describe("recommendTier", () => {
  const singleTraffic = ladderById("single-traffic");

  it("returns 'best' when riskLevel is 'critical' regardless of joules", () => {
    expect(
      recommendTier(10000, "critical", singleTraffic, () => 999_999),
    ).toBe("best");
    // Even when nothing would qualify by joules:
    expect(recommendTier(10000, "critical", singleTraffic, () => 0)).toBe(
      "best",
    );
  });

  it("returns 'better' when riskLevel is 'high'", () => {
    expect(recommendTier(10000, "high", singleTraffic, () => 12000)).toBe(
      "better",
    );
  });

  it("picks the lowest qualifying tier by safety factor", () => {
    // required 10000J, all families rated 12000J → margin 0.20 > good's 0.15
    // so the first qualifying tier is "good".
    expect(
      recommendTier(10000, "medium", singleTraffic, () => 12000),
    ).toBe("good");
  });

  it("falls back to 'best' when no tier meets the threshold", () => {
    // required 10000J, all families rated 8000J → none qualify, so "best".
    expect(recommendTier(10000, "medium", singleTraffic, () => 8000)).toBe(
      "best",
    );
  });

  it("defaults to 'better' when requiredJoules is missing", () => {
    expect(recommendTier(null, "medium", singleTraffic, () => 12000)).toBe(
      "better",
    );
    expect(recommendTier(0, "low", singleTraffic, () => 12000)).toBe(
      "better",
    );
  });

  it("skips tiers when the lookup has no data for that family", () => {
    // good: unknown, better: 15000 (qualifies vs 10000 * 1.35 = 13500), best: unknown
    const lookup = (family: string) =>
      family === singleTraffic.tiers.better.family ? 15000 : null;
    expect(recommendTier(10000, "medium", singleTraffic, lookup)).toBe(
      "better",
    );
  });
});
