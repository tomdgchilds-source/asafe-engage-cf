/**
 * client/src/components/layout-editor/tools/polyline.ts
 *
 * One reducer behind the Barrier run, Wall and Zone tools. Vertices are
 * added by tapping; a press-drag-release adds a segment in one gesture;
 * a double tap (or ✓ / Enter) finishes. New points snap to existing
 * element vertices within tolerance and, with angle snap on, to 0/45/90°
 * from the previous vertex. The draft is kept in tool state (not in the
 * document) so an unfinished run never reaches the save layer.
 */

import type { Element, LayoutDoc, Pt } from "@shared/layout/doc";
import { snapAngle, snapToPoint, dist } from "@shared/layout/geometry";
import type { ToolContext, ToolDef, ToolInput, ToolResult } from "./types";

export interface PolylineState {
  points: Pt[];
  /** Rubber-band end while dragging or hovering. */
  cursor: Pt | null;
  dragging: boolean;
}

export type PolylineKind = "barrierRun" | "wall" | "zone";

export function snapPoint(p: Pt, prev: Pt | null, ctx: ToolContext): Pt {
  const hit = snapToPoint(p, ctx.snapCandidates, ctx.tolerancePx);
  if (hit) return hit.point;
  if (prev && ctx.angleSnap) return snapAngle(prev, p);
  return p;
}

const MIN_POINTS: Record<PolylineKind, number> = { barrierRun: 2, wall: 2, zone: 3 };

/** Default label for a new zone (the Inspector offers the alternatives). */
export const DEFAULT_ZONE_LABEL = "Pedestrian zone";

function buildElement(kind: PolylineKind, points: Pt[], ctx: ToolContext): Element {
  const id = ctx.newId();
  switch (kind) {
    case "barrierRun": {
      const el: Element = { kind: "barrierRun", id, familyId: ctx.familyId, points };
      if (ctx.productId) el.productId = ctx.productId;
      return el;
    }
    case "wall":
      return { kind: "wall", id, points };
    case "zone":
      return { kind: "zone", id, points, label: DEFAULT_ZONE_LABEL };
  }
}

function addPoint(points: Pt[], p: Pt): Pt[] {
  const last = points[points.length - 1];
  if (last && dist(last, p) < 0.5) return points;
  return [...points, p];
}

export function createPolylineTool(kind: PolylineKind): ToolDef<PolylineState> {
  const initial = (): PolylineState => ({ points: [], cursor: null, dragging: false });

  const finish = (state: PolylineState, ctx: ToolContext): ToolResult<PolylineState> => {
    if (state.points.length < MIN_POINTS[kind]) return { state: initial() };
    const el = buildElement(kind, state.points, ctx);
    const commit: LayoutDoc = { ...ctx.doc, elements: [...ctx.doc.elements, el] };
    return { state: initial(), commit, select: el.id };
  };

  const handle = (state: PolylineState, input: ToolInput, ctx: ToolContext): ToolResult<PolylineState> => {
    const prev = state.points[state.points.length - 1] ?? null;
    switch (input.type) {
      case "tap": {
        if (input.tapCount >= 2 && state.points.length >= MIN_POINTS[kind]) return finish(state, ctx);
        if (input.tapCount >= 2) return { state };
        const p = snapPoint(input.p, prev, ctx);
        return { state: { points: addPoint(state.points, p), cursor: null, dragging: false } };
      }
      case "dragStart": {
        const p = snapPoint(input.p, prev, ctx);
        const points = state.points.length === 0 ? [p] : state.points;
        return { state: { points, cursor: p, dragging: true } };
      }
      case "dragMove": {
        const anchor = state.points[state.points.length - 1] ?? null;
        return { state: { ...state, cursor: snapPoint(input.p, anchor, ctx) } };
      }
      case "dragEnd": {
        const anchor = state.points[state.points.length - 1] ?? null;
        const p = snapPoint(input.p, anchor, ctx);
        return { state: { points: addPoint(state.points, p), cursor: null, dragging: false } };
      }
      case "dragCancel":
        return { state: { ...state, cursor: null, dragging: false } };
      case "hover":
        if (state.points.length === 0) return { state };
        return { state: { ...state, cursor: snapPoint(input.p, prev, ctx) } };
      case "undoPoint":
        return { state: { ...state, points: state.points.slice(0, -1), cursor: null } };
      case "finish":
        return finish(state, ctx);
      case "cancel":
        return { state: initial() };
      case "longPress":
        return { state };
    }
  };

  return { id: kind, initial, handle, isDrafting: (s) => s.points.length > 0 };
}
