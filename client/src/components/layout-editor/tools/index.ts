/**
 * client/src/components/layout-editor/tools/index.ts
 *
 * Tool registry. `TOOLS[id]` gives the reducer for a tool id; the Editor
 * keeps one `ToolState` slot and re-initialises it whenever the tool
 * changes. Tools are typed loosely here (`ToolDef<any>`) because the
 * Editor never inspects tool state itself — the Overlay receives the
 * draft through `toolDraft` selectors below.
 */

import type { Pt } from "@shared/layout/doc";
import { createPolylineTool, type PolylineState } from "./polyline";
import { selectTool, type SelectState } from "./select";
import { stampTool, type StampState } from "./stamp";
import { dimensionTool, type DimensionState } from "./dimension";
import { noteTool, type NoteState } from "./note";
import { calibrateTool, type CalibrateState } from "./calibrate";
import type { ToolDef, ToolId } from "./types";

export * from "./types";
export { createPolylineTool, snapPoint, DEFAULT_ZONE_LABEL, type PolylineState } from "./polyline";
export {
  selectTool,
  stampHandlePoint,
  translateElement,
  moveVertex,
  replaceElement,
  insertVertex,
  ROTATION_HANDLE_OFFSET_PX,
  type SelectState,
  type SelectMode,
} from "./select";
export { stampTool, stampFamilyFor, FALLBACK_STAMP_FAMILY, type StampState } from "./stamp";
export { dimensionTool, type DimensionState } from "./dimension";
export { noteTool, type NoteState } from "./note";
export { calibrateTool, type CalibrateState } from "./calibrate";

export const barrierRunTool = createPolylineTool("barrierRun");
export const wallTool = createPolylineTool("wall");
export const zoneTool = createPolylineTool("zone");

export type AnyToolState = SelectState | PolylineState | StampState | DimensionState | NoteState | CalibrateState;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TOOLS: Record<ToolId, ToolDef<any>> = {
  select: selectTool,
  barrierRun: barrierRunTool,
  stamp: stampTool,
  wall: wallTool,
  dimension: dimensionTool,
  note: noteTool,
  zone: zoneTool,
  calibrate: calibrateTool,
};

/** What the Overlay draws for an in-progress gesture, in content px. */
export type ToolDraft =
  | { kind: "polyline"; tool: "barrierRun" | "wall" | "zone"; points: Pt[]; cursor: Pt | null }
  | { kind: "line"; tool: "dimension" | "calibrate"; a: Pt; b: Pt | null }
  | null;

export function toolDraft(id: ToolId, state: AnyToolState): ToolDraft {
  switch (id) {
    case "barrierRun":
    case "wall":
    case "zone": {
      const s = state as PolylineState;
      return s.points.length > 0 ? { kind: "polyline", tool: id, points: s.points, cursor: s.cursor } : null;
    }
    case "dimension":
    case "calibrate": {
      const s = state as DimensionState | CalibrateState;
      return s.a ? { kind: "line", tool: id, a: s.a, b: s.cursor } : null;
    }
    default:
      return null;
  }
}

export const TOOL_LABELS: Record<ToolId, string> = {
  select: "Select",
  barrierRun: "Barrier run",
  stamp: "Stamp",
  wall: "Wall",
  dimension: "Dimension",
  note: "Note",
  zone: "Zone",
  calibrate: "Calibrate",
};

/** Single-key shortcuts (desktop). */
export const TOOL_KEYS: Record<string, ToolId> = {
  v: "select",
  b: "barrierRun",
  s: "stamp",
  w: "wall",
  d: "dimension",
  n: "note",
  z: "zone",
  c: "calibrate",
};
