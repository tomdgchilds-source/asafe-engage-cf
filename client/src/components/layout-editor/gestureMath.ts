/**
 * client/src/components/layout-editor/gestureMath.ts
 *
 * Pure pointer-gesture recogniser. Feed it pointer samples (id, screen
 * position, timestamp, whether this pointer should pan) and it emits
 * high-level gesture events. It owns no timers and touches no DOM, so the
 * whole state machine is unit-testable; `useGestures` is the thin DOM
 * adapter that wires Pointer Events, `setPointerCapture`, the long-press
 * timeout and the viewport into it.
 *
 * One code path for mouse, pen and touch: a "drag" is a drag whatever
 * produced it. The only per-device decision is made by the caller at
 * pointerdown via `PointerInput.pan` (space held, middle button, hand
 * tool), which turns a single-pointer drag into a viewport pan.
 *
 * Recognised gestures
 *   tap        press + release within TAP_MAX_MS, moved < TAP_MAX_PX
 *   longPress  held LONG_PRESS_MS without moving TAP_MAX_PX
 *   drag       moved ≥ TAP_MAX_PX with one pointer (tool interaction)
 *   pan        same, but the pointer was flagged `pan` (viewport moves)
 *   pinch      two pointers: zoom about the midpoint + pan by its motion
 */

export const TAP_MAX_MS = 250;
export const TAP_MAX_PX = 6;
export const LONG_PRESS_MS = 450;
/** Two taps closer than this (ms / px) count as a double tap. */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_PX = 20;
/** Velocity is estimated over the last window of pan samples. */
export const VELOCITY_WINDOW_MS = 100;

export type PointerKind = "mouse" | "pen" | "touch" | string;

export interface PointerInput {
  id: number;
  x: number;
  y: number;
  /** Milliseconds; only differences matter. */
  t: number;
  pointerType?: PointerKind;
  /** Decided by the caller on pointerdown: should a single-pointer drag pan the viewport? */
  pan?: boolean;
}

export type GesturePhase = "idle" | "pressed" | "drag" | "pan" | "pinch" | "dead";

export type GestureEvent =
  | { type: "tap"; x: number; y: number; t: number; pointerType: PointerKind; tapCount: number }
  | { type: "longPress"; x: number; y: number; pointerType: PointerKind }
  | { type: "dragStart"; x: number; y: number; startX: number; startY: number; pointerType: PointerKind }
  | { type: "dragMove"; x: number; y: number; dx: number; dy: number; startX: number; startY: number; pointerType: PointerKind }
  | { type: "dragEnd"; x: number; y: number; startX: number; startY: number; pointerType: PointerKind }
  | { type: "dragCancel" }
  | { type: "panStart" }
  | { type: "panMove"; dx: number; dy: number }
  /** vx/vy in px per ms, for inertia. Zero on cancel. */
  | { type: "panEnd"; vx: number; vy: number }
  | { type: "pinchStart"; cx: number; cy: number }
  /** `scale` is the incremental factor since the last pinchMove; dx/dy the midpoint's motion. */
  | { type: "pinchMove"; cx: number; cy: number; scale: number; dx: number; dy: number }
  | { type: "pinchEnd" };

export type GestureEmit = (ev: GestureEvent) => void;

interface TrackedPointer {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startT: number;
  pointerType: PointerKind;
  pan: boolean;
}

interface Sample {
  x: number;
  y: number;
  t: number;
}

export interface GestureRecognizer {
  pointerDown(p: PointerInput): void;
  pointerMove(p: PointerInput): void;
  pointerUp(p: PointerInput): void;
  pointerCancel(p: PointerInput): void;
  /** Call LONG_PRESS_MS after the most recent pointerdown; no-op unless still a clean press. */
  longPressTimeout(now: number): void;
  /** Forget everything (e.g. element unmounted mid-gesture). Emits cancels for anything in flight. */
  reset(): void;
  readonly phase: GesturePhase;
  readonly activePointerCount: number;
}

export function createGestureRecognizer(emit: GestureEmit): GestureRecognizer {
  const pointers = new Map<number, TrackedPointer>();
  let phase: GesturePhase = "idle";
  /** The pointer driving a press / drag / pan. */
  let primaryId: number | null = null;
  /** The two pointers driving a pinch. */
  let pinchIds: [number, number] | null = null;
  let pinchPrevCx = 0;
  let pinchPrevCy = 0;
  let pinchPrevDist = 0;
  let samples: Sample[] = [];
  let lastTap: Sample | null = null;
  let lastTapCount = 0;

  function movedFromStart(tp: TrackedPointer): number {
    return Math.hypot(tp.x - tp.startX, tp.y - tp.startY);
  }

  function pushSample(x: number, y: number, t: number) {
    samples.push({ x, y, t });
    // Keep a little more than the window so the oldest sample brackets it.
    while (samples.length > 2 && samples[0].t < t - VELOCITY_WINDOW_MS * 2) samples.shift();
  }

  function velocityAt(t: number): { vx: number; vy: number } {
    if (samples.length < 2) return { vx: 0, vy: 0 };
    const last = samples[samples.length - 1];
    // Released after a pause → no fling.
    if (t - last.t > VELOCITY_WINDOW_MS) return { vx: 0, vy: 0 };
    let first = samples[0];
    for (const s of samples) {
      if (s.t >= last.t - VELOCITY_WINDOW_MS) {
        first = s;
        break;
      }
    }
    const dt = last.t - first.t;
    if (dt <= 0) return { vx: 0, vy: 0 };
    return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
  }

  function pinchGeometry(): { cx: number; cy: number; d: number } | null {
    if (!pinchIds) return null;
    const a = pointers.get(pinchIds[0]);
    const b = pointers.get(pinchIds[1]);
    if (!a || !b) return null;
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(b.x - a.x, b.y - a.y) };
  }

  function beginPinch(idA: number, idB: number) {
    pinchIds = [idA, idB];
    const g = pinchGeometry();
    if (!g) return;
    pinchPrevCx = g.cx;
    pinchPrevCy = g.cy;
    pinchPrevDist = g.d;
    phase = "pinch";
    emit({ type: "pinchStart", cx: g.cx, cy: g.cy });
  }

  /** Abort whatever single-pointer gesture is in flight (second finger landed, cancel, reset). */
  function abortSinglePointer() {
    if (phase === "drag") emit({ type: "dragCancel" });
    if (phase === "pan") emit({ type: "panEnd", vx: 0, vy: 0 });
    samples = [];
  }

  function settle() {
    phase = pointers.size === 0 ? "idle" : "dead";
    if (phase === "idle") {
      primaryId = null;
      pinchIds = null;
      samples = [];
    }
  }

  return {
    get phase() {
      return phase;
    },
    get activePointerCount() {
      return pointers.size;
    },

    pointerDown(p) {
      const tp: TrackedPointer = {
        id: p.id,
        x: p.x,
        y: p.y,
        startX: p.x,
        startY: p.y,
        startT: p.t,
        pointerType: p.pointerType ?? "mouse",
        pan: !!p.pan,
      };
      pointers.set(p.id, tp);

      switch (phase) {
        case "idle":
          phase = "pressed";
          primaryId = p.id;
          samples = [];
          return;
        case "pressed":
        case "drag":
        case "pan": {
          // Second pointer: whatever the first was doing becomes a pinch.
          abortSinglePointer();
          const first = primaryId;
          if (first !== null && pointers.has(first)) beginPinch(first, p.id);
          else settle();
          return;
        }
        case "pinch":
        case "dead":
          // Third+ pointer, or a finger landing after a pinch ended:
          // tracked so we know when everything lifts, but ignored.
          return;
      }
    },

    pointerMove(p) {
      const tp = pointers.get(p.id);
      if (!tp) return;
      const prevX = tp.x;
      const prevY = tp.y;
      tp.x = p.x;
      tp.y = p.y;

      switch (phase) {
        case "pressed": {
          if (p.id !== primaryId) return;
          if (movedFromStart(tp) < TAP_MAX_PX) return;
          if (tp.pan) {
            phase = "pan";
            emit({ type: "panStart" });
            pushSample(tp.startX, tp.startY, tp.startT);
            pushSample(tp.x, tp.y, p.t);
            emit({ type: "panMove", dx: tp.x - tp.startX, dy: tp.y - tp.startY });
          } else {
            phase = "drag";
            emit({ type: "dragStart", x: tp.startX, y: tp.startY, startX: tp.startX, startY: tp.startY, pointerType: tp.pointerType });
            emit({
              type: "dragMove",
              x: tp.x,
              y: tp.y,
              dx: tp.x - tp.startX,
              dy: tp.y - tp.startY,
              startX: tp.startX,
              startY: tp.startY,
              pointerType: tp.pointerType,
            });
          }
          return;
        }
        case "drag": {
          if (p.id !== primaryId) return;
          emit({
            type: "dragMove",
            x: tp.x,
            y: tp.y,
            dx: tp.x - prevX,
            dy: tp.y - prevY,
            startX: tp.startX,
            startY: tp.startY,
            pointerType: tp.pointerType,
          });
          return;
        }
        case "pan": {
          if (p.id !== primaryId) return;
          pushSample(tp.x, tp.y, p.t);
          emit({ type: "panMove", dx: tp.x - prevX, dy: tp.y - prevY });
          return;
        }
        case "pinch": {
          if (!pinchIds || (p.id !== pinchIds[0] && p.id !== pinchIds[1])) return;
          const g = pinchGeometry();
          if (!g) return;
          const scale = pinchPrevDist > 0 && g.d > 0 ? g.d / pinchPrevDist : 1;
          const dx = g.cx - pinchPrevCx;
          const dy = g.cy - pinchPrevCy;
          pinchPrevCx = g.cx;
          pinchPrevCy = g.cy;
          pinchPrevDist = g.d;
          if (scale !== 1 || dx !== 0 || dy !== 0) emit({ type: "pinchMove", cx: g.cx, cy: g.cy, scale, dx, dy });
          return;
        }
        case "idle":
        case "dead":
          return;
      }
    },

    pointerUp(p) {
      const tp = pointers.get(p.id);
      if (!tp) return;
      tp.x = p.x;
      tp.y = p.y;
      pointers.delete(p.id);

      switch (phase) {
        case "pressed": {
          if (p.id !== primaryId) return settle();
          const held = p.t - tp.startT;
          if (held < TAP_MAX_MS && movedFromStart(tp) < TAP_MAX_PX) {
            let tapCount = 1;
            if (lastTap && p.t - lastTap.t <= DOUBLE_TAP_MS && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) <= DOUBLE_TAP_PX) {
              tapCount = lastTapCount + 1;
            }
            lastTap = { x: p.x, y: p.y, t: p.t };
            lastTapCount = tapCount;
            emit({ type: "tap", x: p.x, y: p.y, t: p.t, pointerType: tp.pointerType, tapCount });
          }
          return settle();
        }
        case "drag": {
          if (p.id !== primaryId) return settle();
          emit({ type: "dragEnd", x: tp.x, y: tp.y, startX: tp.startX, startY: tp.startY, pointerType: tp.pointerType });
          return settle();
        }
        case "pan": {
          if (p.id !== primaryId) return settle();
          pushSample(tp.x, tp.y, p.t);
          const v = velocityAt(p.t);
          emit({ type: "panEnd", vx: v.vx, vy: v.vy });
          return settle();
        }
        case "pinch": {
          if (pinchIds && (p.id === pinchIds[0] || p.id === pinchIds[1])) {
            emit({ type: "pinchEnd" });
            pinchIds = null;
          }
          return settle();
        }
        case "dead":
        case "idle":
          return settle();
      }
    },

    pointerCancel(p) {
      const tp = pointers.get(p.id);
      if (!tp) return;
      pointers.delete(p.id);
      if (phase === "pinch") {
        if (pinchIds && (p.id === pinchIds[0] || p.id === pinchIds[1])) {
          emit({ type: "pinchEnd" });
          pinchIds = null;
        }
      } else if (p.id === primaryId) {
        abortSinglePointer();
      }
      settle();
    },

    longPressTimeout(now) {
      if (phase !== "pressed" || primaryId === null) return;
      const tp = pointers.get(primaryId);
      if (!tp) return;
      if (now - tp.startT < LONG_PRESS_MS - 1) return;
      if (movedFromStart(tp) >= TAP_MAX_PX) return;
      emit({ type: "longPress", x: tp.x, y: tp.y, pointerType: tp.pointerType });
      // The release that follows must not also count as a tap.
      phase = "dead";
    },

    reset() {
      if (phase === "pinch") emit({ type: "pinchEnd" });
      else abortSinglePointer();
      pointers.clear();
      phase = "idle";
      primaryId = null;
      pinchIds = null;
      samples = [];
    },
  };
}
