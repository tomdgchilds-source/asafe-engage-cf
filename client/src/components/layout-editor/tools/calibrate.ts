/**
 * client/src/components/layout-editor/tools/calibrate.ts
 *
 * Calibrate tool: tap two ends of a known dimension (or press-drag-release
 * along it) and the Editor opens the length dialog (`request: calibrate`).
 * The dialog writes `doc.calibration`; this tool never touches the doc.
 * Angle snap applies so a wall or grid line can be traced square.
 */

import type { Pt } from "@shared/layout/doc";
import { snapAngle } from "@shared/layout/geometry";
import type { ToolContext, ToolDef, ToolInput, ToolResult } from "./types";

export interface CalibrateState {
  a: Pt | null;
  cursor: Pt | null;
}

function snap(p: Pt, a: Pt | null, ctx: ToolContext): Pt {
  return a && ctx.angleSnap ? snapAngle(a, p) : p;
}

function handle(state: CalibrateState, input: ToolInput, ctx: ToolContext): ToolResult<CalibrateState> {
  switch (input.type) {
    case "tap": {
      if (input.tapCount >= 2) return { state };
      if (!state.a) return { state: { a: input.p, cursor: null } };
      const b = snap(input.p, state.a, ctx);
      return { state: { a: null, cursor: null }, request: { kind: "calibrate", a: state.a, b } };
    }
    case "dragStart":
      return { state: { a: input.p, cursor: input.p } };
    case "dragMove":
      return { state: { ...state, cursor: snap(input.p, state.a, ctx) } };
    case "dragEnd": {
      if (!state.a) return { state };
      const b = snap(input.p, state.a, ctx);
      return { state: { a: null, cursor: null }, request: { kind: "calibrate", a: state.a, b } };
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

export const calibrateTool: ToolDef<CalibrateState> = {
  id: "calibrate",
  initial: () => ({ a: null, cursor: null }),
  handle,
  isDrafting: (s) => s.a !== null,
};
