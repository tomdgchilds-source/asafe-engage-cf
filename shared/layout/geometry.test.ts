import { describe, it, expect } from "vitest";
import type { Calibration, LayoutDoc, Pt } from "./doc";
import {
  pxPerMm,
  runLengthMm,
  postPositions,
  detectCorners,
  segmentDistanceMm,
  segmentDistancePx,
  snapAngle,
  snapToPoint,
  hitTest,
  pointToSegmentDistance,
  docBounds,
} from "./geometry";

// 10 px per mm: a 100 px line is 10 mm.
const cal: Calibration = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, lengthMm: 10 };
// 1 px per mm — makes mm arithmetic easy to read.
const unitCal: Calibration = { a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, lengthMm: 1000 };

describe("pxPerMm", () => {
  it("is dist(a,b) / lengthMm", () => {
    expect(pxPerMm(cal)).toBe(10);
  });
  it("returns null for a missing or degenerate calibration", () => {
    expect(pxPerMm(undefined)).toBeNull();
    expect(pxPerMm({ a: { x: 5, y: 5 }, b: { x: 5, y: 5 }, lengthMm: 100 })).toBeNull();
    expect(pxPerMm({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, lengthMm: 0 })).toBeNull();
    expect(pxPerMm({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, lengthMm: -1 })).toBeNull();
  });
});

describe("runLengthMm", () => {
  it("measures a calibrated square's perimeter", () => {
    // 100 px sides at 10 px/mm = 10 mm each, closed square = 40 mm.
    const square: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 0, y: 0 },
    ];
    expect(runLengthMm(square, cal)).toBeCloseTo(40, 9);
  });
  it("returns null without calibration and 0 for fewer than two points", () => {
    expect(runLengthMm([{ x: 0, y: 0 }, { x: 5, y: 0 }], undefined)).toBeNull();
    expect(runLengthMm([{ x: 0, y: 0 }], cal)).toBe(0);
  });
});

describe("postPositions", () => {
  it("places 6 posts on a 10 m run at 2.2 m spacing", () => {
    const posts = postPositions([{ x: 0, y: 0 }, { x: 10000, y: 0 }], 2200, unitCal);
    expect(posts).toHaveLength(6);
    expect(posts[0]).toEqual({ x: 0, y: 0 });
    expect(posts[5]).toEqual({ x: 10000, y: 0 });
    // Even distribution: every bay is 2 m, all <= 2.2 m spacing.
    for (let i = 1; i < posts.length; i++) {
      expect(posts[i].x - posts[i - 1].x).toBeCloseTo(2000, 6);
    }
  });
  it("puts a post at every vertex and does not duplicate the shared vertex on an L", () => {
    const posts = postPositions(
      [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }],
      2200,
      unitCal,
    );
    // 4 m: 2 bays -> 3 posts; 3 m: 2 bays -> 3 posts; shared corner counted once = 5.
    expect(posts).toHaveLength(5);
    expect(posts.filter((p) => p.x === 4000 && p.y === 0)).toHaveLength(1);
  });
  it("uses a single bay when the segment is shorter than the spacing", () => {
    expect(postPositions([{ x: 0, y: 0 }, { x: 500, y: 0 }], 2200, unitCal)).toHaveLength(2);
  });
  it("returns [] without calibration or with fewer than two distinct points", () => {
    expect(postPositions([{ x: 0, y: 0 }, { x: 500, y: 0 }], 2200, undefined)).toEqual([]);
    expect(postPositions([{ x: 0, y: 0 }, { x: 0, y: 0 }], 2200, unitCal)).toEqual([]);
  });
});

describe("detectCorners", () => {
  it("finds the single corner of an L", () => {
    expect(detectCorners([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }])).toEqual([1]);
  });
  it("ignores gentle bends below the threshold and counts sharp ones", () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 20 }, // ~11 degrees: not a corner
      { x: 300, y: 20 }, // index 3: 90 degree turn into the next segment
      { x: 300, y: 120 }, // index 4: 45 degree turn, below the default 60
      { x: 200, y: 220 },
    ];
    expect(detectCorners(pts)).toEqual([3]);
    expect(detectCorners(pts, 40)).toEqual([3, 4]);
  });
  it("collapses near-duplicate points before measuring", () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100.1, y: 0.1 },
      { x: 100, y: 100 },
    ];
    expect(detectCorners(pts)).toHaveLength(1);
  });
  it("returns [] for fewer than three points", () => {
    expect(detectCorners([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([]);
  });
});

describe("segment distance", () => {
  it("parallel segments: perpendicular gap", () => {
    const d = segmentDistanceMm(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      [{ x: 0, y: 50 }, { x: 100, y: 50 }],
      cal,
    );
    expect(d).toBeCloseTo(5, 9);
  });
  it("skew (non-overlapping) segments: nearest endpoints", () => {
    const d = segmentDistancePx([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 130, y: 40 }, { x: 200, y: 40 }]);
    expect(d).toBeCloseTo(50, 9); // (100,0) -> (130,40)
  });
  it("crossing segments: zero", () => {
    expect(
      segmentDistancePx([{ x: 0, y: 0 }, { x: 100, y: 100 }], [{ x: 0, y: 100 }, { x: 100, y: 0 }]),
    ).toBe(0);
    expect(
      segmentDistanceMm([{ x: 0, y: 0 }, { x: 100, y: 100 }], [{ x: 0, y: 100 }, { x: 100, y: 0 }], cal),
    ).toBe(0);
  });
  it("returns null in mm without calibration", () => {
    expect(segmentDistanceMm([{ x: 0, y: 0 }, { x: 1, y: 0 }], [{ x: 0, y: 1 }, { x: 1, y: 1 }], undefined)).toBeNull();
  });
});

describe("pointToSegmentDistance", () => {
  it("projects inside the segment or clamps to an endpoint", () => {
    expect(pointToSegmentDistance({ x: 50, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(10);
    expect(pointToSegmentDistance({ x: 130, y: 40 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(50);
    expect(pointToSegmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
});

describe("snapAngle", () => {
  it("snaps to the nearest of 0/45/90 while keeping length", () => {
    const prev = { x: 0, y: 0 };
    const p = snapAngle(prev, { x: 100, y: 8 });
    expect(p.x).toBeCloseTo(Math.hypot(100, 8), 9);
    expect(p.y).toBeCloseTo(0, 9);
    const q = snapAngle(prev, { x: 60, y: 70 });
    expect(q.x).toBeCloseTo(q.y, 9);
    const r = snapAngle(prev, { x: -5, y: -80 });
    expect(r.x).toBeCloseTo(0, 9);
    expect(r.y).toBeCloseTo(-Math.hypot(5, 80), 9);
  });
  it("honours a custom angle set", () => {
    const p = snapAngle({ x: 0, y: 0 }, { x: 100, y: 50 }, [30]);
    expect(Math.atan2(p.y, p.x) * (180 / Math.PI)).toBeCloseTo(30, 9);
  });
  it("returns the point unchanged when it coincides with prev", () => {
    expect(snapAngle({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual({ x: 3, y: 3 });
  });
});

describe("snapToPoint", () => {
  const candidates: Pt[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  it("returns the nearest candidate within tolerance", () => {
    expect(snapToPoint({ x: 97, y: 4 }, candidates, 8)).toEqual({ point: { x: 100, y: 0 }, index: 1 });
  });
  it("returns null when nothing is within tolerance", () => {
    expect(snapToPoint({ x: 50, y: 50 }, candidates, 8)).toBeNull();
  });
});

describe("hitTest", () => {
  const doc: LayoutDoc = {
    version: 1,
    elements: [
      { kind: "zone", id: "z1", points: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }], label: "Zone" },
      { kind: "barrierRun", id: "r1", familyId: "iflex-single-traffic", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] },
      { kind: "stamp", id: "s1", familyId: "bollard-190", at: { x: 300, y: 300 }, rotationDeg: 0 },
      { kind: "note", id: "n1", at: { x: 50, y: 300 }, text: "hi" },
      { kind: "dimension", id: "d1", a: { x: 200, y: 50 }, b: { x: 300, y: 50 } },
      { kind: "wall", id: "w1", points: [{ x: 200, y: 200 }, { x: 250, y: 200 }] },
    ],
  };
  it("hits a run segment and reports the segment index", () => {
    const hit = hitTest(doc, { x: 50, y: 4 }, 8);
    expect(hit?.id).toBe("r1");
    expect(hit?.segmentIndex).toBe(0);
    expect(hit?.vertexIndex).toBeUndefined();
  });
  it("prefers a vertex over the segment when within tolerance", () => {
    const hit = hitTest(doc, { x: 102, y: 3 }, 8);
    expect(hit?.id).toBe("r1");
    expect(hit?.vertexIndex).toBe(1);
  });
  it("hits stamps, notes, dimensions and walls by proximity", () => {
    expect(hitTest(doc, { x: 305, y: 296 }, 8)?.id).toBe("s1");
    expect(hitTest(doc, { x: 52, y: 302 }, 8)?.id).toBe("n1");
    expect(hitTest(doc, { x: 250, y: 55 }, 8)?.id).toBe("d1");
    expect(hitTest(doc, { x: 225, y: 203 }, 8)?.id).toBe("w1");
  });
  it("later elements win when overlapping, and zones only hit as a last resort", () => {
    // Inside the zone but far from every other element: zone hit by containment.
    expect(hitTest(doc, { x: 350, y: 100 }, 8)?.id).toBe("z1");
    // Outside everything: null.
    expect(hitTest(doc, { x: 900, y: 900 }, 8)).toBeNull();
  });
});

describe("docBounds", () => {
  it("returns the bounding box of every element or null for an empty doc", () => {
    expect(docBounds({ version: 1, elements: [] })).toBeNull();
    const b = docBounds({
      version: 1,
      elements: [
        { kind: "stamp", id: "s", familyId: "bollard-190", at: { x: 10, y: 20 }, rotationDeg: 0 },
        { kind: "dimension", id: "d", a: { x: -5, y: 0 }, b: { x: 30, y: 40 } },
      ],
    });
    expect(b).toEqual({ minX: -5, minY: 0, maxX: 30, maxY: 40 });
  });
});
