/**
 * client/src/components/layout-editor/tools/dimension.ts
 *
 * Dimension tool: tap A then tap B, or press-drag-release from A to B.
 * Ends snap to element vertices; with angle snap on, B snaps to 0/45/90°
 * from A so dimensions run square to the sheet.
 */

import type { DimensionElement, LayoutDoc, Pt } from "@shared/layout/doc";
import { snapAngle, snapToPoint } from "@shared/layout/geometry";
import type { ToolContext, ToolDef, ToolInput, ToolResult } from "./types";

export interface DimensionState {
  a: Pt | null;
  cursor: Pt | null;
}

function snap(p: Pt, a: Pt | null, ctx: ToolContext): Pt {
  const hit = snapToPoint(p, ctx.snapCandidates, ctx.tolerancePx);
  if (hit) return hit.point;
  return a && ctx.angleSnap ? snapAngle(a, p) : p;
}

function commitDimension(a: Pt, b: Pt, ctx: ToolContext): ToolResult<DimensionState> {
  const el: DimensionElement = { kind: "dimension", id: ctx.newId(), a, b };
  const commit: LayoutDoc = { ...ctx.doc, elements: [...ctx.doc.elements, el] };
  return { state: { a: null, cursor: null }, preview: null, commit, select: el.id };
}

function handle(state: DimensionState, input: ToolInput, ctx: ToolContext): ToolResult<DimensionState> {
  switch (input.type) {
    case "tap": {
      if (input.tapCount >= 2) return { state };
      const p = snap(input.p, state.a, ctx);
      if (!state.a) return { state: { a: p, cursor: null } };
      return commitDimension(state.a, p, ctx);
    }
    case "dragStart": {
      const p = snap(input.p, null, ctx);
      return { state: { a: p, cursor: p } };
    }
    case "dragMove":
      return { state: { ...state, cursor: snap(input.p, state.a, ctx) } };
    case "dragEnd": {
      if (!state.a) return { state };
      return commitDimension(state.a, snap(input.p, state.a, ctx), ctx);
    }
    case "hover":
      return state.a ? { state: { ...state, cursor: snap(input.p, state.a, ctx) } } : { state };
    case "dragCancel":
    case "cancel":
    case "undoPoint":
      return { state: { a: null, cursor: null } };
    case "finish":
    case "longPress":
      return { state };
  }
}

export const dimensionTool: ToolDef<DimensionState> = {
  id: "dimension",
  initial: () => ({ a: null, cursor: null }),
  handle,
  isDrafting: (s) => s.a !== null,
};
