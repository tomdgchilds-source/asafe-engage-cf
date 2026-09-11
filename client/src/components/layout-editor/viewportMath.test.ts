import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  fitToContent,
  isInertiaDone,
  keyToAction,
  panBy,
  setZoomClamped,
  stepInertia,
  toContent,
  toScreen,
  wheelToAction,
  zoomAt,
  type ViewportState,
} from "./viewportMath";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe("toContent / toScreen", () => {
  const vp: ViewportState = { zoom: 2.5, tx: 120, ty: -40 };

  it("round-trips arbitrary points", () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: 13.37, y: -99.1 },
      { x: 4000, y: 2999.5 },
    ]) {
      const back = toContent(vp, toScreen(vp, p));
      close(back.x, p.x);
      close(back.y, p.y);
      const back2 = toScreen(vp, toContent(vp, p));
      close(back2.x, p.x);
      close(back2.y, p.y);
    }
  });

  it("applies screen = content * zoom + t", () => {
    const s = toScreen(vp, { x: 10, y: 20 });
    close(s.x, 10 * 2.5 + 120);
    close(s.y, 20 * 2.5 - 40);
  });
});

describe("zoomAt", () => {
  it("keeps the content point under the cursor fixed", () => {
    const vp: ViewportState = { zoom: 1.5, tx: 33, ty: 77 };
    const cursor = { x: 250, y: 140 };
    const before = toContent(vp, cursor);
    const next = zoomAt(vp, cursor, 1.8);
    close(next.zoom, 2.7);
    const after = toContent(next, cursor);
    close(after.x, before.x);
    close(after.y, before.y);
  });

  it("clamps to MIN/MAX and still anchors", () => {
    const vp: ViewportState = { zoom: 30, tx: 0, ty: 0 };
    const cursor = { x: 100, y: 100 };
    const before = toContent(vp, cursor);
    const next = zoomAt(vp, cursor, 100);
    expect(next.zoom).toBe(MAX_ZOOM);
    const after = toContent(next, cursor);
    close(after.x, before.x);
    close(after.y, before.y);
    expect(zoomAt({ zoom: 0.05, tx: 0, ty: 0 }, cursor, 0.001).zoom).toBe(MIN_ZOOM);
  });

  it("returns the same object for a no-op factor or an already-clamped zoom", () => {
    const vp: ViewportState = { zoom: MAX_ZOOM, tx: 5, ty: 5 };
    expect(zoomAt(vp, { x: 0, y: 0 }, 1)).toBe(vp);
    expect(zoomAt(vp, { x: 0, y: 0 }, 2)).toBe(vp);
    expect(zoomAt(vp, { x: 0, y: 0 }, -1)).toBe(vp);
    expect(zoomAt(vp, { x: 0, y: 0 }, Number.NaN)).toBe(vp);
  });
});

describe("setZoomClamped", () => {
  it("sets an absolute zoom about an anchor", () => {
    const vp: ViewportState = { zoom: 1, tx: 10, ty: 10 };
    const anchor = { x: 60, y: 60 };
    const before = toContent(vp, anchor);
    const next = setZoomClamped(vp, 4, anchor);
    expect(next.zoom).toBe(4);
    const after = toContent(next, anchor);
    close(after.x, before.x);
    close(after.y, before.y);
  });

  it("clamps garbage to MIN_ZOOM", () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(-3)).toBe(MIN_ZOOM);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(MIN_ZOOM);
    expect(setZoomClamped({ zoom: 1, tx: 0, ty: 0 }, 1000).zoom).toBe(MAX_ZOOM);
  });
});

describe("panBy", () => {
  it("translates without touching zoom", () => {
    const next = panBy({ zoom: 3, tx: 1, ty: 2 }, 10, -5);
    expect(next).toEqual({ zoom: 3, tx: 11, ty: -3 });
  });
  it("is identity for zero deltas", () => {
    const vp = { zoom: 3, tx: 1, ty: 2 };
    expect(panBy(vp, 0, 0)).toBe(vp);
  });
});

describe("fitToContent", () => {
  it("centres a wide sheet inside a tall container with padding", () => {
    const vp = fitToContent(2000, 1000, 800, 1200, 20);
    // width-limited: (800 - 40) / 2000 = 0.38
    close(vp.zoom, 0.38);
    const tl = toScreen(vp, { x: 0, y: 0 });
    const br = toScreen(vp, { x: 2000, y: 1000 });
    close(tl.x, 20);
    close(br.x, 780);
    // vertically centred: content is 380 px tall in a 1200 px container
    close(tl.y, (1200 - 380) / 2);
    close(br.y, (1200 + 380) / 2);
    close((tl.x + br.x) / 2, 400);
    close((tl.y + br.y) / 2, 600);
  });

  it("centres a tall sheet inside a wide container", () => {
    const vp = fitToContent(500, 2000, 1600, 900, 0);
    close(vp.zoom, 0.45);
    const centre = toScreen(vp, { x: 250, y: 1000 });
    close(centre.x, 800);
    close(centre.y, 450);
  });

  it("respects MIN/MAX zoom", () => {
    expect(fitToContent(100000, 100000, 100, 100).zoom).toBe(MIN_ZOOM);
    expect(fitToContent(1, 1, 1000, 1000).zoom).toBe(MAX_ZOOM);
  });

  it("falls back to identity on degenerate sizes", () => {
    expect(fitToContent(0, 100, 800, 600)).toEqual({ zoom: 1, tx: 0, ty: 0 });
    expect(fitToContent(100, 100, 0, 600)).toEqual({ zoom: 1, tx: 0, ty: 0 });
  });
});

describe("inertia", () => {
  it("decays by 0.92 per 60 Hz frame and moves by v*dt", () => {
    const r = stepInertia({ vx: 1, vy: -0.5 }, 1000 / 60);
    close(r.dx, 1000 / 60);
    close(r.dy, -0.5 * (1000 / 60));
    close(r.next.vx, 0.92);
    close(r.next.vy, -0.46);
  });

  it("normalises a dropped frame so two 16ms steps equal one 33ms step in velocity", () => {
    const a = stepInertia(stepInertia({ vx: 1, vy: 0 }, 1000 / 60).next, 1000 / 60).next;
    const b = stepInertia({ vx: 1, vy: 0 }, 2000 / 60).next;
    close(a.vx, b.vx);
  });

  it("eventually stops", () => {
    let v = { vx: 2, vy: 2 };
    let frames = 0;
    while (!isInertiaDone(v) && frames < 1000) {
      v = stepInertia(v, 1000 / 60).next;
      frames++;
    }
    expect(isInertiaDone(v)).toBe(true);
    expect(frames).toBeGreaterThan(10);
    expect(frames).toBeLessThan(200);
  });
});

describe("wheelToAction", () => {
  it("treats ctrl+wheel (trackpad pinch) as zoom about the cursor", () => {
    const a = wheelToAction({ deltaX: 0, deltaY: -50, ctrlKey: true });
    expect(a.type).toBe("zoom");
    if (a.type === "zoom") expect(a.factor).toBeGreaterThan(1);
    const b = wheelToAction({ deltaX: 0, deltaY: 50, ctrlKey: true });
    if (b.type === "zoom") expect(b.factor).toBeLessThan(1);
  });

  it("clamps a violent tick", () => {
    const a = wheelToAction({ deltaX: 0, deltaY: -5000, ctrlKey: true });
    if (a.type === "zoom") expect(a.factor).toBe(2);
  });

  it("pans otherwise, inverting deltas and normalising line mode", () => {
    expect(wheelToAction({ deltaX: 10, deltaY: -20 })).toEqual({ type: "pan", dx: -10, dy: 20 });
    expect(wheelToAction({ deltaX: 1, deltaY: 2, deltaMode: 1 })).toEqual({ type: "pan", dx: -16, dy: -32 });
  });
});

describe("keyToAction", () => {
  it("maps zoom keys, fit and arrows", () => {
    expect(keyToAction({ key: "+" })).toEqual({ type: "zoomIn" });
    expect(keyToAction({ key: "=" })).toEqual({ type: "zoomIn" });
    expect(keyToAction({ key: "-" })).toEqual({ type: "zoomOut" });
    expect(keyToAction({ key: "0" })).toEqual({ type: "fit" });
    expect(keyToAction({ key: "ArrowLeft" })).toEqual({ type: "nudge", dx: -1, dy: 0 });
    expect(keyToAction({ key: "ArrowDown", shiftKey: true })).toEqual({ type: "nudge", dx: 0, dy: 10 });
    expect(keyToAction({ key: "ArrowUp", ctrlKey: true })).toBeNull();
    expect(keyToAction({ key: "a" })).toBeNull();
  });
});
