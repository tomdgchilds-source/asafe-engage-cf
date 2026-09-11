/**
 * client/src/components/layout-editor/viewportMath.ts
 *
 * Pure viewport transform maths for the layout editor. No React, no DOM.
 *
 * A viewport maps *content* pixels (the natural size of the base image, or
 * the PDF page at scale 1 — the same space every `Pt` in a `LayoutDoc`
 * lives in) to *screen* pixels relative to the top-left of the editor
 * container:
 *
 *     screen = content * zoom + (tx, ty)
 *
 * Everything in here is a pure function of a `ViewportState` so it can be
 * unit-tested without a browser and reused by the SVG overlay, the
 * gesture engine and the toolbar zoom buttons.
 */

import type { Pt } from "@shared/layout/doc";

/**
 * 40x covers pixel-peeping on a 1:100 A0 sheet; 2% lets big landscape
 * CAD sheets still fit on a phone. Same bounds as the previous editor.
 */
export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 40;

export interface ViewportState {
  zoom: number;
  tx: number;
  ty: number;
}

export interface Size {
  width: number;
  height: number;
}

export const IDENTITY_VIEWPORT: ViewportState = Object.freeze({ zoom: 1, tx: 0, ty: 0 });

export function clampZoom(zoom: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return min;
  return Math.min(max, Math.max(min, zoom));
}

/** Screen → content. */
export function toContent(vp: ViewportState, screen: Pt): Pt {
  return { x: (screen.x - vp.tx) / vp.zoom, y: (screen.y - vp.ty) / vp.zoom };
}

/** Content → screen. */
export function toScreen(vp: ViewportState, content: Pt): Pt {
  return { x: content.x * vp.zoom + vp.tx, y: content.y * vp.zoom + vp.ty };
}

export function panBy(vp: ViewportState, dx: number, dy: number): ViewportState {
  if (dx === 0 && dy === 0) return vp;
  return { zoom: vp.zoom, tx: vp.tx + dx, ty: vp.ty + dy };
}

/**
 * Set an absolute zoom (clamped) while keeping the content point under
 * `anchorScreen` fixed on screen. Without an anchor the screen origin is
 * the fixed point.
 */
export function setZoomClamped(vp: ViewportState, zoom: number, anchorScreen: Pt = { x: 0, y: 0 }): ViewportState {
  const next = clampZoom(zoom);
  if (next === vp.zoom) return vp;
  const k = next / vp.zoom;
  return {
    zoom: next,
    tx: anchorScreen.x - (anchorScreen.x - vp.tx) * k,
    ty: anchorScreen.y - (anchorScreen.y - vp.ty) * k,
  };
}

/** Multiply the zoom by `factor` about a screen point (cursor / pinch centre). */
export function zoomAt(vp: ViewportState, screenPt: Pt, factor: number): ViewportState {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return vp;
  return setZoomClamped(vp, vp.zoom * factor, screenPt);
}

/**
 * Zoom so the whole content fits inside the container with `padding`
 * screen px on every side, centred. Degenerate inputs (zero sizes) fall
 * back to the identity viewport so the caller never divides by zero.
 */
export function fitToContent(
  contentW: number,
  contentH: number,
  containerW: number,
  containerH: number,
  padding = 0,
): ViewportState {
  if (!(contentW > 0) || !(contentH > 0) || !(containerW > 0) || !(containerH > 0)) {
    return { ...IDENTITY_VIEWPORT };
  }
  const availW = Math.max(1, containerW - padding * 2);
  const availH = Math.max(1, containerH - padding * 2);
  const zoom = clampZoom(Math.min(availW / contentW, availH / contentH));
  return {
    zoom,
    tx: (containerW - contentW * zoom) / 2,
    ty: (containerH - contentH * zoom) / 2,
  };
}

// ─── Inertia ────────────────────────────────────────────────────────────────

export interface Velocity {
  /** px per ms */
  vx: number;
  vy: number;
}

export const INERTIA_DECAY = 0.92;
/** Frame the decay constant is expressed against (60 Hz). */
export const INERTIA_FRAME_MS = 1000 / 60;
/** Below this speed (px/ms) the fling is over. */
export const INERTIA_STOP_SPEED = 0.02;
/** A release slower than this (px/ms) does not fling at all. */
export const INERTIA_MIN_START_SPEED = 0.08;

/**
 * Apply one inertia step: returns the pan delta for this frame and the
 * decayed velocity. `decay` is per 60 Hz frame; `dtMs` is normalised so a
 * dropped frame doesn't change the fling distance.
 */
export function stepInertia(v: Velocity, dtMs: number, decay = INERTIA_DECAY): { dx: number; dy: number; next: Velocity } {
  const dt = Math.max(0, Math.min(dtMs, 4 * INERTIA_FRAME_MS));
  const dx = v.vx * dt;
  const dy = v.vy * dt;
  const f = Math.pow(decay, dt / INERTIA_FRAME_MS);
  return { dx, dy, next: { vx: v.vx * f, vy: v.vy * f } };
}

export function speed(v: Velocity): number {
  return Math.hypot(v.vx, v.vy);
}

export function isInertiaDone(v: Velocity, stopSpeed = INERTIA_STOP_SPEED): boolean {
  return speed(v) < stopSpeed;
}

// ─── Wheel / keyboard → viewport actions ────────────────────────────────────

export interface WheelInput {
  deltaX: number;
  deltaY: number;
  /** 0 = pixels, 1 = lines, 2 = pages (WheelEvent.deltaMode). */
  deltaMode?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export type WheelAction = { type: "zoom"; factor: number } | { type: "pan"; dx: number; dy: number };

const LINE_PX = 16;
const PAGE_PX = 400;
/** Per-event zoom is clamped so a single violent wheel tick can't jump 10x. */
const WHEEL_ZOOM_MIN_FACTOR = 0.5;
const WHEEL_ZOOM_MAX_FACTOR = 2;

function normaliseDelta(delta: number, mode: number | undefined): number {
  if (mode === 1) return delta * LINE_PX;
  if (mode === 2) return delta * PAGE_PX;
  return delta;
}

/**
 * Trackpad pinch arrives as a wheel event with `ctrlKey` set (Chrome,
 * Safari, Firefox all do this); ctrl+wheel on a mouse looks identical,
 * which is exactly the desktop zoom convention. Everything else is a pan.
 */
export function wheelToAction(ev: WheelInput): WheelAction {
  const dy = normaliseDelta(ev.deltaY, ev.deltaMode);
  if (ev.ctrlKey || ev.metaKey) {
    const factor = Math.exp(-dy * 0.01);
    return { type: "zoom", factor: Math.min(WHEEL_ZOOM_MAX_FACTOR, Math.max(WHEEL_ZOOM_MIN_FACTOR, factor)) };
  }
  const dx = normaliseDelta(ev.deltaX, ev.deltaMode);
  return { type: "pan", dx: -dx, dy: -dy };
}

export interface KeyInput {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export type KeyAction =
  | { type: "zoomIn" }
  | { type: "zoomOut" }
  | { type: "fit" }
  | { type: "nudge"; dx: number; dy: number };

export const KEY_ZOOM_STEP = 1.25;
export const NUDGE_PX = 1;
export const NUDGE_PX_SHIFT = 10;

/**
 * `+`/`=` zoom in, `-`/`_` zoom out, `0` fit, arrows nudge (shift = 10 px).
 * Ctrl/Cmd combinations are left to the browser / history hook, except
 * Ctrl/Cmd+0 / +/- which we take over so the page itself doesn't zoom.
 */
export function keyToAction(ev: KeyInput): KeyAction | null {
  if (ev.altKey) return null;
  switch (ev.key) {
    case "+":
    case "=":
      return { type: "zoomIn" };
    case "-":
    case "_":
      return { type: "zoomOut" };
    case "0":
      return { type: "fit" };
  }
  if (ev.ctrlKey || ev.metaKey) return null;
  const step = ev.shiftKey ? NUDGE_PX_SHIFT : NUDGE_PX;
  switch (ev.key) {
    case "ArrowLeft":
      return { type: "nudge", dx: -step, dy: 0 };
    case "ArrowRight":
      return { type: "nudge", dx: step, dy: 0 };
    case "ArrowUp":
      return { type: "nudge", dx: 0, dy: -step };
    case "ArrowDown":
      return { type: "nudge", dx: 0, dy: step };
  }
  return null;
}
