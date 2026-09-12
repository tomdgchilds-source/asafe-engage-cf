/**
 * client/src/components/layout-editor/tools/select.ts
 *
 * Select tool: tap to select, drag a selected element to move it, drag a
 * vertex handle of the selected element to reshape it, drag the rotation
 * handle of a selected stamp to rotate it, double-tap a segment to insert
 * a vertex, long-press for the context sheet. Dragging empty space pans
 * (the tool asks the Editor for it in screen px so the viewport stays
 * consistent mid-gesture).
 *
 * Moves are previewed via `preview` and committed once on dragEnd, so
 * one drag equals one undo step.
 */

import type { Element, LayoutDoc, Pt, StampElement } from "@shared/layout/doc";
import { elementPoints } from "@shared/layout/doc";
import { dist, hitTest, pointToSegmentDistance, snapToPoint } from "@shared/layout/geometry";
import { getFamily } from "@shared/layout/symbols";
import { pxPerMm } from "@shared/layout/geometry";
import type { ToolContext, ToolDef, ToolInput, ToolResult } from "./types";

export type SelectMode = "idle" | "moveElement" | "moveVertex" | "rotate" | "pan";

export interface SelectState {
  mode: SelectMode;
  elementId: string | null;
  vertexIndex: number | null;
  /** Content point where the drag started (for element moves). */
  origin: Pt | null;
  lastScreen: Pt | null;
  /** Document as it was when the drag started — the preview is derived from it. */
  baseDoc: LayoutDoc | null;
  moved: boolean;
}

const initial = (): SelectState => ({
  mode: "idle",
  elementId: null,
  vertexIndex: null,
  origin: null,
  lastScreen: null,
  baseDoc: null,
  moved: false,
});

/** Screen-px distance of the rotation handle from a stamp's footprint edge. */
export const ROTATION_HANDLE_OFFSET_PX = 28;

/** Where the rotation handle of a stamp sits, in content px. */
export function stampHandlePoint(stamp: StampElement, doc: LayoutDoc, zoom: number): Pt {
  const k = pxPerMm(doc.calibration);
  const half = k ? (getFamily(stamp.familyId).widthMm * k) / 2 : 12 / zoom;
  const r = half + ROTATION_HANDLE_OFFSET_PX / zoom;
  const rad = ((stamp.rotationDeg - 90) * Math.PI) / 180;
  return { x: stamp.at.x + Math.cos(rad) * r, y: stamp.at.y + Math.sin(rad) * r };
}

export function translateElement(el: Element, dx: number, dy: number): Element {
  const t = (p: Pt): Pt => ({ x: p.x + dx, y: p.y + dy });
  switch (el.kind) {
    case "barrierRun":
    case "wall":
    case "zone":
      return { ...el, points: el.points.map(t) };
    case "stamp":
    case "note":
      return { ...el, at: t(el.at) };
    case "dimension":
      return { ...el, a: t(el.a), b: t(el.b) };
  }
}

export function moveVertex(el: Element, index: number, p: Pt): Element {
  switch (el.kind) {
    case "barrierRun":
    case "wall":
    case "zone":
      return { ...el, points: el.points.map((q, i) => (i === index ? p : q)) };
    case "dimension":
      return index === 0 ? { ...el, a: p } : { ...el, b: p };
    case "stamp":
    case "note":
      return { ...el, at: p };
  }
}

export function replaceElement(doc: LayoutDoc, next: Element): LayoutDoc {
  return { ...doc, elements: doc.elements.map((e) => (e.id === next.id ? next : e)) };
}

/** Insert a vertex on the closest segment of a polyline element. */
export function insertVertex(el: Element, p: Pt): Element | null {
  if (el.kind !== "barrierRun" && el.kind !== "wall" && el.kind !== "zone") return null;
  const pts = el.points;
  const closed = el.kind === "zone";
  const n = closed ? pts.length : pts.length - 1;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const d = pointToSegmentDistance(p, pts[i], pts[(i + 1) % pts.length]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return null;
  const points = [...pts.slice(0, best + 1), p, ...pts.slice(best + 1)];
  return { ...el, points };
}

function rotationFor(stamp: StampElement, p: Pt, angleSnap: boolean): number {
  const deg = (Math.atan2(p.y - stamp.at.y, p.x - stamp.at.x) * 180) / Math.PI + 90;
  const norm = ((deg % 360) + 360) % 360;
  return angleSnap ? Math.round(norm / 15) * 15 : Math.round(norm * 10) / 10;
}

function handle(state: SelectState, input: ToolInput, ctx: ToolContext): ToolResult<SelectState> {
  const selected = ctx.selectedId ? ctx.doc.elements.find((e) => e.id === ctx.selectedId) ?? null : null;

  switch (input.type) {
    case "tap": {
      const hit = hitTest(ctx.doc, input.p, ctx.tolerancePx);
      if (input.tapCount >= 2 && hit && hit.segmentIndex !== undefined) {
        const el = ctx.doc.elements.find((e) => e.id === hit.id);
        const next = el ? insertVertex(el, input.p) : null;
        if (next) return { state: initial(), commit: replaceElement(ctx.doc, next), select: next.id };
      }
      return { state: initial(), select: hit?.id ?? null };
    }
    case "longPress": {
      const hit = hitTest(ctx.doc, input.p, ctx.tolerancePx);
      if (!hit) return { state: initial(), select: null };
      return { state: initial(), select: hit.id, request: { kind: "contextMenu", elementId: hit.id, at: input.p } };
    }
    case "dragStart": {
      // Rotation handle of the selected stamp wins over everything.
      if (selected && selected.kind === "stamp") {
        const h = stampHandlePoint(selected, ctx.doc, ctx.zoom);
        if (dist(h, input.p) <= ctx.tolerancePx * 1.5) {
          return { state: { ...initial(), mode: "rotate", elementId: selected.id, baseDoc: ctx.doc, origin: input.p } };
        }
      }
      const hit = hitTest(ctx.doc, input.p, ctx.tolerancePx);
      if (hit && hit.vertexIndex !== undefined && hit.id === ctx.selectedId) {
        return {
          state: { ...initial(), mode: "moveVertex", elementId: hit.id, vertexIndex: hit.vertexIndex, baseDoc: ctx.doc, origin: input.p },
        };
      }
      if (hit) {
        return {
          state: { ...initial(), mode: "moveElement", elementId: hit.id, baseDoc: ctx.doc, origin: input.p },
          select: hit.id,
        };
      }
      return { state: { ...initial(), mode: "pan", lastScreen: input.screen } };
    }
    case "dragMove": {
      if (state.mode === "pan") {
        const last = state.lastScreen ?? input.screen;
        const panBy = { x: input.screen.x - last.x, y: input.screen.y - last.y };
        return { state: { ...state, lastScreen: input.screen, moved: true }, panBy };
      }
      if (!state.baseDoc || !state.elementId || !state.origin) return { state };
      const base = state.baseDoc.elements.find((e) => e.id === state.elementId);
      if (!base) return { state };
      let next: Element | null = null;
      if (state.mode === "moveElement") {
        next = translateElement(base, input.p.x - state.origin.x, input.p.y - state.origin.y);
      } else if (state.mode === "moveVertex" && state.vertexIndex !== null) {
        const own = new Set(elementPoints(base));
        const others = ctx.snapCandidates.filter((c) => !own.has(c));
        const snapped = snapToPoint(input.p, others, ctx.tolerancePx)?.point ?? input.p;
        next = moveVertex(base, state.vertexIndex, snapped);
      } else if (state.mode === "rotate" && base.kind === "stamp") {
        next = { ...base, rotationDeg: rotationFor(base, input.p, ctx.angleSnap) };
      }
      if (!next) return { state };
      return { state: { ...state, moved: true }, preview: replaceElement(state.baseDoc, next) };
    }
    case "dragEnd": {
      if (state.mode === "pan") return { state: initial() };
      if (!state.moved || !state.baseDoc || !state.elementId || !state.origin) return { state: initial(), preview: null };
      // Recompute the final geometry from the end point so the commit matches the last preview.
      const r = handle(state, { type: "dragMove", p: input.p, screen: input.screen, start: input.start }, ctx);
      return { state: initial(), preview: null, commit: r.preview ?? undefined };
    }
    case "dragCancel":
      return { state: initial(), preview: null };
    case "cancel":
      return { state: initial(), preview: null, select: null };
    case "hover":
    case "finish":
    case "undoPoint":
      return { state };
  }
}

export const selectTool: ToolDef<SelectState> = {
  id: "select",
  initial,
  handle,
  isDrafting: () => false,
};
