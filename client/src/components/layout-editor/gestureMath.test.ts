import { describe, expect, it } from "vitest";
import {
  DOUBLE_TAP_MS,
  LONG_PRESS_MS,
  TAP_MAX_MS,
  TAP_MAX_PX,
  createGestureRecognizer,
  type GestureEvent,
} from "./gestureMath";

function harness() {
  const events: GestureEvent[] = [];
  const rec = createGestureRecognizer((e) => events.push(e));
  const types = () => events.map((e) => e.type);
  return { rec, events, types };
}

describe("tap", () => {
  it("fires for a short, still press", () => {
    const { rec, events } = harness();
    rec.pointerDown({ id: 1, x: 10, y: 10, t: 0, pointerType: "touch" });
    rec.pointerMove({ id: 1, x: 12, y: 11, t: 50 });
    rec.pointerUp({ id: 1, x: 12, y: 11, t: 120 });
    expect(events).toEqual([{ type: "tap", x: 12, y: 11, t: 120, pointerType: "touch", tapCount: 1 }]);
    expect(rec.phase).toBe("idle");
    expect(rec.activePointerCount).toBe(0);
  });

  it("does not fire when held ≥ 250 ms", () => {
    const { rec, events } = harness();
    rec.pointerDown({ id: 1, x: 10, y: 10, t: 0 });
    rec.pointerUp({ id: 1, x: 10, y: 10, t: TAP_MAX_MS });
    expect(events).toEqual([]);
  });

  it("does not fire when moved ≥ 6 px (becomes a drag instead)", () => {
    const { rec, types } = harness();
    rec.pointerDown({ id: 1, x: 0, y: 0, t: 0 });
    rec.pointerMove({ id: 1, x: TAP_MAX_PX, y: 0, t: 20 });
    rec.pointerUp({ id: 1, x: TAP_MAX_PX, y: 0, t: 40 });
    expect(types()).toEqual(["dragStart", "dragMove", "dragEnd"]);
  });

  it("counts double taps", () => {
    const { rec, events } = harness();
    rec.pointerDown({ id: 1, x: 0, y: 0, t: 0 });
    rec.pointerUp({ id: 1, x: 0, y: 0, t: 50 });
    rec.pointerDown({ id: 2, x: 3, y: 3, t: 200 });
    rec.pointerUp({ id: 2, x: 3, y: 3, t: 250 });
    rec.pointerDown({ id: 3, x: 3, y: 3, t: 250 + DOUBLE_TAP_MS + 100 });
    rec.pointerUp({ id: 3, x: 3, y: 3, t: 250 + DOUBLE_TAP_MS + 150 });
    expect(events.map((e) => (e.type === "tap" ? e.tapCount : e.type))).toEqual([1, 2, 1]);
  });
});

describe("long press", () => {
  it("fires after 450 ms without movement and suppresses the tap", () => {
    const { rec, events } = harness();
    rec.pointerDown({ id: 1, x: 5, y: 5, t: 0, pointerType: "touch" });
    rec.pointerMove({ id: 1, x: 7, y: 5, t: 100 });
    rec.longPressTimeout(LONG_PRESS_MS);
    rec.pointerUp({ id: 1, x: 7, y: 5, t: LONG_PRESS_MS + 20 });
    expect(events).toEqual([{ type: "longPress", x: 7, y: 5, pointerType: "touch" }]);
    expect(rec.phase).toBe("idle");
  });

  it("is a no-op if the pointer moved, lifted, or became a drag", () => {
    const { rec, types } = harness();
    rec.pointerDown({ id: 1, x: 0, y: 0, t: 0 });
    rec.pointerMove({ id: 1, x: 20, y: 0, t: 100 });
    rec.longPressTimeout(LONG_PRESS_MS);
    expect(types()).toEqual(["dragStart", "dragMove"]);

    const h2 = harness();
    h2.rec.pointerDown({ id: 1, x: 0, y: 0, t: 0 });
    h2.rec.pointerUp({ id: 1, x: 0, y: 0, t: 100 });
    h2.rec.longPressTimeout(LONG_PRESS_MS);
    expect(h2.types()).toEqual(["tap"]);
  });
});

describe("drag", () => {
  it("emits start at the press point, incremental moves, and end", () => {
    const { rec, events } = harness();
    rec.pointerDown({ id: 1, x: 100, y: 100, t: 0, pointerType: "pen" });
    rec.pointerMove({ id: 1, x: 103, y: 100, t: 10 }); // under threshold: nothing yet
    expect(events).toEqual([]);
    rec.pointerMove({ id: 1, x: 110, y: 104, t: 20 });
    rec.pointerMove({ id: 1, x: 115, y: 104, t: 30 });
    rec.pointerUp({ id: 1, x: 120, y: 110, t: 40 });
    expect(events).toEqual([
      { type: "dragStart", x: 100, y: 100, startX: 100, startY: 100, pointerType: "pen" },
      { type: "dragMove", x: 110, y: 104, dx: 10, dy: 4, startX: 100, startY: 100, pointerType: "pen" },
      { type: "dragMove", x: 115, y: 104, dx: 5, dy: 0, startX: 100, startY: 100, pointerType: "pen" },
      { type: "dragEnd", x: 120, y: 110, startX: 100, startY: 100, pointerType: "pen" },
    ]);
  });

  it("cancels on pointercancel", () => {
    const { rec, types } = harness();
    rec.pointerDown({ id: 1, x: 0, y: 0, t: 0 });
    rec.pointerMove({ id: 1, x: 30, y: 0, t: 10 });
    rec.pointerCancel({ id: 1, x: 30, y: 0, t: 20 });
    expect(types()).toEqual(["dragStart", "dragMove", "dragCancel"]);
    expect(rec.phase).toBe("idle");
  });
});

describe("pan (single pointer flagged pan)", () => {
  it("emits panStart/panMove and a velocity on release", () => {
    const { rec, events } = harness();
    rec.pointerDown({ id: 1, x: 0, y: 0, t: 0, pan: true });
    for (let i = 1; i <= 10; i++) rec.pointerMove({ id: 1, x: i * 10, y: 0, t: i * 10 });
    rec.pointerUp({ id: 1, x: 100, y: 0, t: 100 });
    expect(events[0]).toEqual({ type: "panStart" });
    const moves = events.filter((e) => e.type === "panMove") as Extract<GestureEvent, { type: "panMove" }>[];
    expect(moves.reduce((s, m) => s + m.dx, 0)).toBe(100);
    const end = events[events.length - 1];
    expect(end.type).toBe("panEnd");
    if (end.type === "panEnd") {
      expect(end.vx).toBeCloseTo(1, 5); // 100 px over 100 ms
      expect(end.vy).toBe(0);
    }
  });

  it("reports zero velocity when the pointer paused before release", () => {
    const { rec, events } = harness();
    rec.pointerDown({ id: 1, x: 0, y: 0, t: 0, pan: true });
    rec.pointerMove({ id: 1, x: 50, y: 0, t: 50 });
    rec.pointerUp({ id: 1, x: 50, y: 0, t: 600 });
    const end = events[events.length - 1];
    expect(end).toEqual({ type: "panEnd", vx: 0, vy: 0 });
  });
});

describe("pinch", () => {
  it("cancels an in-flight drag, then zooms about the midpoint and pans with it", () => {
    const { rec, events, types } = harness();
    rec.pointerDown({ id: 1, x: 100, y: 100, t: 0, pointerType: "touch" });
    rec.pointerMove({ id: 1, x: 120, y: 100, t: 10 });
    rec.pointerDown({ id: 2, x: 220, y: 100, t: 20, pointerType: "touch" });
    expect(types()).toEqual(["dragStart", "dragMove", "dragCancel", "pinchStart"]);
    const start = events[3];
    expect(start).toEqual({ type: "pinchStart", cx: 170, cy: 100 });

    // Spread: finger 2 moves right by 100 → distance 100 → 200, centre shifts +50.
    rec.pointerMove({ id: 2, x: 320, y: 100, t: 30 });
    const mv = events[4];
    expect(mv).toEqual({ type: "pinchMove", cx: 220, cy: 100, scale: 2, dx: 50, dy: 0 });

    // Translate both fingers down by 50, one event each. The first move
    // stretches the pair diagonally and the second restores it, so the
    // incremental scales multiply back to 1 and the centre ends up at y=150.
    const before = events.length;
    rec.pointerMove({ id: 1, x: 120, y: 150, t: 40 });
    rec.pointerMove({ id: 2, x: 320, y: 150, t: 50 });
    const moves = events.slice(before) as Extract<GestureEvent, { type: "pinchMove" }>[];
    expect(moves.map((m) => m.type)).toEqual(["pinchMove", "pinchMove"]);
    expect(moves[0].scale * moves[1].scale).toBeCloseTo(1, 9);
    expect(moves.reduce((s, m) => s + m.dy, 0)).toBeCloseTo(50, 9);
    expect(moves[1].cy).toBe(150);

    rec.pointerUp({ id: 1, x: 120, y: 150, t: 60 });
    expect(events[events.length - 1]).toEqual({ type: "pinchEnd" });
    expect(rec.phase).toBe("dead");
    // The lingering finger must not produce a tap or drag.
    rec.pointerMove({ id: 2, x: 400, y: 150, t: 70 });
    rec.pointerUp({ id: 2, x: 400, y: 150, t: 80 });
    expect(events[events.length - 1]).toEqual({ type: "pinchEnd" });
    expect(rec.phase).toBe("idle");
  });

  it("ignores a third pointer", () => {
    const { rec, types } = harness();
    rec.pointerDown({ id: 1, x: 0, y: 0, t: 0 });
    rec.pointerDown({ id: 2, x: 100, y: 0, t: 1 });
    rec.pointerDown({ id: 3, x: 50, y: 50, t: 2 });
    rec.pointerMove({ id: 3, x: 500, y: 500, t: 3 });
    expect(types()).toEqual(["pinchStart"]);
    expect(rec.activePointerCount).toBe(3);
  });

  it("ends a pan cleanly when a second finger lands", () => {
    const { rec, types } = harness();
    rec.pointerDown({ id: 1, x: 0, y: 0, t: 0, pan: true });
    rec.pointerMove({ id: 1, x: 20, y: 0, t: 10 });
    rec.pointerDown({ id: 2, x: 100, y: 0, t: 20 });
    expect(types()).toEqual(["panStart", "panMove", "panEnd", "pinchStart"]);
  });
});

describe("reset", () => {
  it("cancels whatever is in flight and returns to idle", () => {
    const { rec, types } = harness();
    rec.pointerDown({ id: 1, x: 0, y: 0, t: 0 });
    rec.pointerMove({ id: 1, x: 50, y: 0, t: 10 });
    rec.reset();
    expect(types()).toEqual(["dragStart", "dragMove", "dragCancel"]);
    expect(rec.phase).toBe("idle");
    expect(rec.activePointerCount).toBe(0);
  });
});
