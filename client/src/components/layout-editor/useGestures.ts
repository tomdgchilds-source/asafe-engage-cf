/**
 * client/src/components/layout-editor/useGestures.ts
 *
 * DOM adapter for the pure recogniser in `gestureMath.ts`. Attaches a
 * single Pointer Events code path (no touch/mouse handlers) to the
 * element, captures pointers, and:
 *
 *   - drives the viewport itself for pan, pinch, wheel, inertia and the
 *     keyboard zoom keys, so tools never see those;
 *   - forwards tap / long-press / drag to `handlers` with both screen and
 *     content coordinates, so tools work in `LayoutDoc` space directly;
 *   - forwards arrow-key nudges (`onNudge`) and the `0` key (`onFit`).
 *
 * A single-pointer drag pans when the space bar is held, the middle
 * mouse button is used, or `options.panMode` is on (hand tool); otherwise
 * it is a tool drag. Two pointers always pinch/pan.
 *
 * Inertia after a pan decays at 0.92 per frame, is cancelled by the next
 * pointerdown or wheel, and is skipped entirely when the user prefers
 * reduced motion.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Pt } from "@shared/layout/doc";
import { LONG_PRESS_MS, createGestureRecognizer, type GestureEvent, type PointerKind } from "./gestureMath";
import {
  INERTIA_MIN_START_SPEED,
  KEY_ZOOM_STEP,
  isInertiaDone,
  keyToAction,
  speed,
  stepInertia,
  wheelToAction,
  type Velocity,
} from "./viewportMath";
import type { ViewportApi } from "./useViewport";

export interface GesturePoint {
  /** Content pixels — the `LayoutDoc` coordinate space. */
  content: Pt;
  /** Screen pixels relative to the element's top-left. */
  screen: Pt;
  pointerType: PointerKind;
}

export interface GestureHandlers {
  onTap?(p: GesturePoint & { tapCount: number }): void;
  onLongPress?(p: GesturePoint): void;
  onDragStart?(p: GesturePoint): void;
  /** `p` is the current point; `start` where the drag began. */
  onDragMove?(p: GesturePoint, start: GesturePoint): void;
  onDragEnd?(p: GesturePoint, start: GesturePoint): void;
  onDragCancel?(): void;
  /** Arrow keys; dx/dy in screen px (1, or 10 with shift). */
  onNudge?(dx: number, dy: number): void;
  /** The `0` key — the owner knows the content size, so it performs the fit. */
  onFit?(): void;
}

export interface UseGesturesOptions {
  /** Hand tool: every single-pointer drag pans. */
  panMode?: boolean;
  /** Default true. Ignored (treated as false) under prefers-reduced-motion. */
  inertia?: boolean;
  /** Detach every listener while true (e.g. a modal is open). */
  disabled?: boolean;
}

export type ActiveGesture = "idle" | "drag" | "pan" | "pinch";

export interface GestureState {
  /** Space bar currently held — show a grab cursor. */
  spaceHeld: boolean;
  active: ActiveGesture;
}

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function useGestures(
  ref: RefObject<HTMLElement | null>,
  viewport: ViewportApi,
  handlers: GestureHandlers,
  options: UseGesturesOptions = {},
): GestureState {
  const { panMode = false, inertia = true, disabled = false } = options;

  // Latest handlers/viewport without re-binding listeners on every render.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const panModeRef = useRef(panMode);
  panModeRef.current = panMode;
  const inertiaRef = useRef(inertia);
  inertiaRef.current = inertia;

  const [spaceHeld, setSpaceHeld] = useState(false);
  const [active, setActive] = useState<ActiveGesture>("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    let spaceDown = false;
    let hovered = false;
    let rect: DOMRect = el.getBoundingClientRect();
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let inertiaFrame: number | null = null;
    let dragStart: GesturePoint | null = null;

    const vp = () => viewportRef.current;

    const toScreenPt = (clientX: number, clientY: number): Pt => ({ x: clientX - rect.left, y: clientY - rect.top });

    const point = (screen: Pt, pointerType: PointerKind): GesturePoint => ({
      screen,
      content: vp().toContent(screen),
      pointerType,
    });

    const clearLongPress = () => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const cancelInertia = () => {
      if (inertiaFrame !== null) {
        cancelAnimationFrame(inertiaFrame);
        inertiaFrame = null;
      }
    };

    const startInertia = (v0: Velocity) => {
      cancelInertia();
      if (!inertiaRef.current || prefersReducedMotion()) return;
      if (speed(v0) < INERTIA_MIN_START_SPEED) return;
      let v = v0;
      let last = performance.now();
      const step = (now: number) => {
        const r = stepInertia(v, now - last);
        last = now;
        v = r.next;
        vp().panBy(r.dx, r.dy);
        if (isInertiaDone(v)) {
          inertiaFrame = null;
          return;
        }
        inertiaFrame = requestAnimationFrame(step);
      };
      inertiaFrame = requestAnimationFrame(step);
    };

    const recognizer = createGestureRecognizer((ev: GestureEvent) => {
      const h = handlersRef.current;
      switch (ev.type) {
        case "tap":
          h.onTap?.({ ...point({ x: ev.x, y: ev.y }, ev.pointerType), tapCount: ev.tapCount });
          return;
        case "longPress":
          h.onLongPress?.(point({ x: ev.x, y: ev.y }, ev.pointerType));
          return;
        case "dragStart":
          dragStart = point({ x: ev.startX, y: ev.startY }, ev.pointerType);
          setActive("drag");
          h.onDragStart?.(dragStart);
          return;
        case "dragMove":
          if (dragStart) h.onDragMove?.(point({ x: ev.x, y: ev.y }, ev.pointerType), dragStart);
          return;
        case "dragEnd":
          if (dragStart) h.onDragEnd?.(point({ x: ev.x, y: ev.y }, ev.pointerType), dragStart);
          dragStart = null;
          setActive("idle");
          return;
        case "dragCancel":
          dragStart = null;
          setActive("idle");
          h.onDragCancel?.();
          return;
        case "panStart":
          setActive("pan");
          return;
        case "panMove":
          vp().panBy(ev.dx, ev.dy);
          return;
        case "panEnd":
          setActive("idle");
          startInertia({ vx: ev.vx, vy: ev.vy });
          return;
        case "pinchStart":
          setActive("pinch");
          return;
        case "pinchMove": {
          const v = vp();
          // Zoom about the current midpoint, then follow the midpoint's motion.
          if (ev.scale !== 1) v.zoomAt({ x: ev.cx, y: ev.cy }, ev.scale);
          if (ev.dx !== 0 || ev.dy !== 0) v.panBy(ev.dx, ev.dy);
          return;
        }
        case "pinchEnd":
          setActive("idle");
          return;
      }
    });

    const shouldPan = (e: PointerEvent) => spaceDown || panModeRef.current || (e.pointerType === "mouse" && e.button === 1);

    const onPointerDown = (e: PointerEvent) => {
      // Right button is reserved for the browser / a future context menu.
      if (e.pointerType === "mouse" && e.button === 2) return;
      cancelInertia();
      rect = el.getBoundingClientRect();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Capture can fail if the pointer is already gone; the gesture still works.
      }
      // Give the element keyboard focus so shortcuts work after a tap on touch devices.
      if (document.activeElement !== el && !isEditableTarget(document.activeElement)) {
        el.focus({ preventScroll: true });
      }
      e.preventDefault();
      const s = toScreenPt(e.clientX, e.clientY);
      recognizer.pointerDown({ id: e.pointerId, x: s.x, y: s.y, t: e.timeStamp, pointerType: e.pointerType, pan: shouldPan(e) });
      clearLongPress();
      if (recognizer.phase === "pressed") {
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          recognizer.longPressTimeout(performance.now());
        }, LONG_PRESS_MS);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (recognizer.phase === "idle") return;
      const s = toScreenPt(e.clientX, e.clientY);
      recognizer.pointerMove({ id: e.pointerId, x: s.x, y: s.y, t: e.timeStamp, pointerType: e.pointerType });
    };

    const release = (e: PointerEvent) => {
      try {
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      release(e);
      const s = toScreenPt(e.clientX, e.clientY);
      recognizer.pointerUp({ id: e.pointerId, x: s.x, y: s.y, t: e.timeStamp, pointerType: e.pointerType });
      if (recognizer.activePointerCount === 0) clearLongPress();
    };

    const onPointerCancel = (e: PointerEvent) => {
      release(e);
      const s = toScreenPt(e.clientX, e.clientY);
      recognizer.pointerCancel({ id: e.pointerId, x: s.x, y: s.y, t: e.timeStamp, pointerType: e.pointerType });
      if (recognizer.activePointerCount === 0) clearLongPress();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelInertia();
      rect = el.getBoundingClientRect();
      const action = wheelToAction(e);
      if (action.type === "zoom") vp().zoomAt(toScreenPt(e.clientX, e.clientY), action.factor);
      else vp().panBy(action.dx, action.dy);
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    const onPointerEnter = () => {
      hovered = true;
    };
    const onPointerLeave = () => {
      hovered = false;
    };

    /** Keyboard shortcuts apply while the pointer is over the editor or it has focus. */
    const engaged = () => hovered || el === document.activeElement || el.contains(document.activeElement);

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (!engaged()) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (!e.repeat && !spaceDown) {
          spaceDown = true;
          setSpaceHeld(true);
        }
        return;
      }
      const action = keyToAction(e);
      if (!action) return;
      e.preventDefault();
      const v = vp();
      const centre = { x: v.containerSize.width / 2, y: v.containerSize.height / 2 };
      switch (action.type) {
        case "zoomIn":
          v.zoomAt(centre, KEY_ZOOM_STEP);
          return;
        case "zoomOut":
          v.zoomAt(centre, 1 / KEY_ZOOM_STEP);
          return;
        case "fit":
          handlersRef.current.onFit?.();
          return;
        case "nudge":
          handlersRef.current.onNudge?.(action.dx, action.dy);
          return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        if (spaceDown) {
          spaceDown = false;
          setSpaceHeld(false);
        }
      }
    };

    // If the window loses focus mid-space-hold we never get the keyup.
    const onBlur = () => {
      if (spaceDown) {
        spaceDown = false;
        setSpaceHeld(false);
      }
    };

    el.style.touchAction = "none";
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
    el.addEventListener("pointerenter", onPointerEnter);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      recognizer.reset();
      clearLongPress();
      cancelInertia();
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerCancel);
      el.removeEventListener("pointerenter", onPointerEnter);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      setSpaceHeld(false);
      setActive("idle");
    };
  }, [ref, disabled]);

  return { spaceHeld, active };
}
