/// <reference types="vitest" />
/**
 * Vitest-style regression tests for barrierSymbol.ts.
 *
 * If vitest is not wired into the project yet, this file still acts as a
 * readable specification of expected behaviour and can be dropped into a
 * vitest run at any time — the describe/it/expect globals it references
 * match Jest / Vitest conventions.
 */

import {
  computeBarrierSymbol,
  getBarrierSpec,
  type PolylinePoint,
} from "./barrierSymbol";

describe("getBarrierSpec", () => {
  it("resolves iFlex Single Traffic to iFlex 190 Traffic", () => {
    const spec = getBarrierSpec("iFlex Single Traffic - 1600mm");
    expect(spec.family).toBe("iFlex 190 Traffic");
    expect(spec.postOdMm).toBe(190);
    expect(spec.railWidthMm).toBe(125);
    expect(spec.railColour).toBe("#FFC72C");
  });

  it("resolves iFlex Double Traffic+ to iFlex 190 Traffic", () => {
    const spec = getBarrierSpec("iFlex Double Traffic+");
    expect(spec.family).toBe("iFlex 190 Traffic");
  });

  it("resolves iFlex Pedestrian variants to iFlex 190 Pedestrian", () => {
    const spec = getBarrierSpec("iFlex Pedestrian 3 Rail - 2200mm");
    expect(spec.family).toBe("iFlex 190 Pedestrian");
    expect(spec.railWidthMm).toBe(60);
  });

  it("routes CS iFlex to the Cold Storage spec, not standard iFlex", () => {
    const spec = getBarrierSpec("CS iFlex Single Traffic - 1000mm");
    expect(spec.family).toBe("Cold Storage iFlex");
    expect(spec.railColour).toBe("#F5F5F5");
  });

  it("routes 'Cold Storage iFlex Pedestrian' to Cold Storage spec", () => {
    const spec = getBarrierSpec("Cold Storage iFlex Pedestrian - 1500mm");
    expect(spec.family).toBe("Cold Storage iFlex");
  });

  it("resolves Monoplex 130 by name", () => {
    const spec = getBarrierSpec("Monoplex 130 Bollard");
    expect(spec.family).toBe("Monoplex 130");
    expect(spec.railWidthMm).toBe(0);
  });

  it("resolves Monoplex 190 by name", () => {
    const spec = getBarrierSpec("Monoplex 190");
    expect(spec.family).toBe("Monoplex 190");
    expect(spec.railWidthMm).toBe(0);
  });

  it("resolves eFlex family", () => {
    const spec = getBarrierSpec("eFlex 130 - 2200mm");
    expect(spec.family).toBe("eFlex 130");
    expect(spec.postOdMm).toBe(130);
  });

  it("resolves mFlex family", () => {
    const spec = getBarrierSpec("mFlex 158");
    expect(spec.family).toBe("mFlex 158");
    expect(spec.postOdMm).toBe(158);
  });

  it("resolves Atlas family with post OD 200", () => {
    const spec = getBarrierSpec("Atlas Traffic 2200");
    expect(spec.family).toBe("Atlas 190");
    expect(spec.postOdMm).toBe(200);
  });

  it("resolves 130-T0-P3 prefix", () => {
    const spec = getBarrierSpec("130-T0-P3 Pedestrian");
    expect(spec.family).toBe("130-T0-P3");
    expect(spec.railWidthMm).toBe(55);
  });

  it("resolves 190-T\\d-P\\d prefix to 190-T-series", () => {
    const spec = getBarrierSpec("190-T3-P2 Traffic Run");
    expect(spec.family).toBe("190-T-series");
    expect(spec.railWidthMm).toBe(100);
  });

  it("resolves Topple Barrier by keyword", () => {
    const spec = getBarrierSpec("Topple Tested Barrier 2.2m");
    expect(spec.family).toBe("Topple Barrier");
  });

  it("defaults to iFlex 190 Traffic when no matcher hits", () => {
    const spec = getBarrierSpec("Unknown Mystery Product");
    expect(spec.family).toBe("iFlex 190 Traffic");
  });

  it("defaults to iFlex 190 Traffic for empty input", () => {
    const spec = getBarrierSpec("");
    expect(spec.family).toBe("iFlex 190 Traffic");
  });
});

describe("computeBarrierSymbol — guard clauses", () => {
  it("returns null for empty input", () => {
    expect(computeBarrierSymbol([], 1, "iFlex Single Traffic")).toBeNull();
  });

  it("returns null for a single point", () => {
    const pts: PolylinePoint[] = [{ x: 0, y: 0 }];
    expect(computeBarrierSymbol(pts, 1, "iFlex Single Traffic")).toBeNull();
  });

  it("returns null when drawingScale is 0 (not calibrated)", () => {
    const pts: PolylinePoint[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(computeBarrierSymbol(pts, 0, "iFlex Single Traffic")).toBeNull();
  });

  it("returns null for negative drawingScale", () => {
    const pts: PolylinePoint[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(computeBarrierSymbol(pts, -0.5, "iFlex Single Traffic")).toBeNull();
  });
});

describe("computeBarrierSymbol — horizontal lines at 1px/mm", () => {
  const scale = 1; // 1 px per mm → geometry numbers equal mm values
  const product = "iFlex Single Traffic";

  it("2200mm → 2 posts at each end, 1 rail", () => {
    const sym = computeBarrierSymbol(
      [
        { x: 0, y: 0 },
        { x: 2200, y: 0 },
      ],
      scale,
      product,
    )!;
    expect(sym).not.toBeNull();
    expect(sym.postCount).toBe(2);
    expect(sym.railCount).toBe(1);
    expect(sym.posts[0].x).toBeCloseTo(0);
    expect(sym.posts[1].x).toBeCloseTo(2200);
    expect(sym.totalLengthMm).toBeCloseTo(2200);
  });

  it("4400mm → 3 posts at 0/2200/4400, 2 rails", () => {
    const sym = computeBarrierSymbol(
      [
        { x: 0, y: 0 },
        { x: 4400, y: 0 },
      ],
      scale,
      product,
    )!;
    expect(sym.postCount).toBe(3);
    expect(sym.railCount).toBe(2);
    expect(sym.posts.map((p) => p.x)).toEqual([0, 2200, 4400]);
  });

  it("6600mm → 4 posts, 3 rails", () => {
    const sym = computeBarrierSymbol(
      [
        { x: 0, y: 0 },
        { x: 6600, y: 0 },
      ],
      scale,
      product,
    )!;
    expect(sym.postCount).toBe(4);
    expect(sym.railCount).toBe(3);
    expect(sym.posts.map((p) => p.x)).toEqual([0, 2200, 4400, 6600]);
  });

  it("5000mm → 4 posts evenly at 0/1666.67/3333.33/5000 (3 bays)", () => {
    const sym = computeBarrierSymbol(
      [
        { x: 0, y: 0 },
        { x: 5000, y: 0 },
      ],
      scale,
      product,
    )!;
    expect(sym.postCount).toBe(4);
    expect(sym.railCount).toBe(3);
    expect(sym.posts[0].x).toBeCloseTo(0);
    expect(sym.posts[1].x).toBeCloseTo(5000 / 3);
    expect(sym.posts[2].x).toBeCloseTo((5000 / 3) * 2);
    expect(sym.posts[3].x).toBeCloseTo(5000);
  });
});

describe("computeBarrierSymbol — polyline bends", () => {
  it("L-shape polyline: bend is a post, no duplicate at the join", () => {
    // Two 2200mm segments meeting at (2200, 0).
    const pts: PolylinePoint[] = [
      { x: 0, y: 0 },
      { x: 2200, y: 0 },
      { x: 2200, y: 2200 },
    ];
    const sym = computeBarrierSymbol(pts, 1, "iFlex Single Traffic")!;
    // Expected posts: (0,0), (2200,0) [shared bend], (2200,2200) → 3 posts.
    expect(sym.postCount).toBe(3);
    expect(sym.railCount).toBe(2);
    expect(sym.posts[0]).toMatchObject({ x: 0, y: 0 });
    expect(sym.posts[1]).toMatchObject({ x: 2200, y: 0 });
    expect(sym.posts[2]).toMatchObject({ x: 2200, y: 2200 });

    // Duplicate guard: (2200, 0) appears exactly once.
    const atBend = sym.posts.filter(
      (p) => Math.abs(p.x - 2200) < 0.001 && Math.abs(p.y - 0) < 0.001,
    );
    expect(atBend).toHaveLength(1);
  });

  it("L-shape with 4400mm legs → intermediate posts per leg, bend shared", () => {
    const pts: PolylinePoint[] = [
      { x: 0, y: 0 },
      { x: 4400, y: 0 },
      { x: 4400, y: 4400 },
    ];
    const sym = computeBarrierSymbol(pts, 1, "iFlex Single Traffic")!;
    // Leg 1: posts at x=0, 2200, 4400. Leg 2: posts at y=0, 2200, 4400 (y=0
    // deduped against leg 1's tail). Total = 3 + 2 = 5 posts.
    expect(sym.postCount).toBe(5);
    expect(sym.railCount).toBe(4);
  });
});

describe("computeBarrierSymbol — Monoplex (bollard-only)", () => {
  it("Monoplex 130 produces posts but zero rails", () => {
    const sym = computeBarrierSymbol(
      [
        { x: 0, y: 0 },
        { x: 4400, y: 0 },
      ],
      1,
      "Monoplex 130 Bollard",
    )!;
    expect(sym.spec.family).toBe("Monoplex 130");
    expect(sym.railCount).toBe(0);
    expect(sym.rails).toHaveLength(0);
    // Bollards still follow the 2200mm max spacing rule.
    expect(sym.postCount).toBe(3);
  });

  it("Monoplex 190 is bollard-only too", () => {
    const sym = computeBarrierSymbol(
      [
        { x: 0, y: 0 },
        { x: 2200, y: 0 },
      ],
      1,
      "Monoplex 190",
    )!;
    expect(sym.railCount).toBe(0);
    expect(sym.postCount).toBe(2);
  });
});

describe("computeBarrierSymbol — scaling and clamping", () => {
  it("post radius scales linearly at 1 px/mm (iFlex 190 → 95px)", () => {
    const sym = computeBarrierSymbol(
      [
        { x: 0, y: 0 },
        { x: 2200, y: 0 },
      ],
      1,
      "iFlex Single Traffic",
    )!;
    expect(sym.posts[0].radiusPx).toBeCloseTo(95);
  });

  it("clamps post radius to 2px at very small drawing scales (0.01 px/mm)", () => {
    const sym = computeBarrierSymbol(
      [
        { x: 0, y: 0 },
        { x: 220, y: 0 }, // 22000mm → many posts; scale keeps px small
      ],
      0.01,
      "iFlex Single Traffic",
    )!;
    // 95mm * 0.01 = 0.95px → clamped to 2px.
    expect(sym.posts[0].radiusPx).toBe(2);
  });

  it("rail width clamps to 1.5px when spec would otherwise render sub-pixel", () => {
    const sym = computeBarrierSymbol(
      [
        { x: 0, y: 0 },
        { x: 220, y: 0 },
      ],
      0.01,
      "iFlex Single Traffic",
    )!;
    // 125mm * 0.01 = 1.25px → clamped to 1.5px.
    expect(sym.rails[0].widthPx).toBe(1.5);
  });

  it("rail trim leaves a visible gap at each post (length shorter than centre distance)", () => {
    const sym = computeBarrierSymbol(
      [
        { x: 0, y: 0 },
        { x: 2200, y: 0 },
      ],
      1,
      "iFlex Single Traffic",
    )!;
    const rail = sym.rails[0];
    const railLen = Math.hypot(rail.x2 - rail.x1, rail.y2 - rail.y1);
    // Centre distance 2200px minus 2 * 95px trim = 2010px.
    expect(railLen).toBeCloseTo(2010);
    expect(rail.x1).toBeCloseTo(95);
    expect(rail.x2).toBeCloseTo(2200 - 95);
  });

  it("total length sums polyline segments in mm", () => {
    const sym = computeBarrierSymbol(
      [
        { x: 0, y: 0 },
        { x: 2200, y: 0 },
        { x: 2200, y: 1100 },
      ],
      1,
      "iFlex Single Traffic",
    )!;
    expect(sym.totalLengthMm).toBeCloseTo(3300);
  });
});
