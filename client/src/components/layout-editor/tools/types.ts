/**
 * client/src/components/layout-editor/tools/types.ts
 *
 * The tool contract. Every tool is a pure reducer over its own small state:
 * the Editor feeds it gesture events (already in content coordinates,
 * courtesy of useGestures) and applies whatever the result asks for —
 * a history commit, a transient preview during a drag, a selection
 * change, a viewport pan, or a request for UI the tool can't provide
 * itself (a length dialog, a note editor, a context sheet).
 *
 * Tools never touch React, the DOM or the viewport, so they are trivially
 * unit-testable and share one gesture path for finger, pen and mouse.
 */

import type { LayoutDoc, Pt } from "@shared/layout/doc";

export type ToolId = "select" | "barrierRun" | "stamp" | "wall" | "dimension" | "note" | "zone" | "calibrate";

export const TOOL_IDS: readonly ToolId[] = ["select", "barrierRun", "stamp", "wall", "dimension", "note", "zone", "calibrate"];

export interface ToolContext {
  doc: LayoutDoc;
  selectedId: string | null;
  /** Hit / snap tolerance in content px (the Editor derives it from pointer type and zoom). */
  tolerancePx: number;
  /** Screen px per content px — for screen-constant handle geometry. */
  zoom: number;
  /** Active family / product for runs and stamps. */
  familyId: string;
  productId?: string;
  /** 0/45/90° angle snapping for new segments. */
  angleSnap: boolean;
  /** Element vertices to snap new points onto (mutable only because shared geometry takes `Pt[]`). */
  snapCandidates: Pt[];
  newId(): string;
}

export type ToolInput =
  | { type: "tap"; p: Pt; tapCount: number }
  | { type: "longPress"; p: Pt }
  | { type: "dragStart"; p: Pt; screen: Pt }
  | { type: "dragMove"; p: Pt; screen: Pt; start: Pt }
  | { type: "dragEnd"; p: Pt; screen: Pt; start: Pt }
  | { type: "dragCancel" }
  /** Hover / pen-in-range preview (mouse only; touch never sends it). */
  | { type: "hover"; p: Pt }
  /** ✓ button or Enter. */
  | { type: "finish" }
  /** Esc / tool switch. */
  | { type: "cancel" }
  /** "Undo last point" while drawing a polyline. */
  | { type: "undoPoint" };

export type ToolRequest =
  | { kind: "calibrate"; a: Pt; b: Pt }
  | { kind: "noteText"; at: Pt }
  | { kind: "contextMenu"; elementId: string; at: Pt };

export interface ToolResult<S> {
  state: S;
  /** Push this document to history. */
  commit?: LayoutDoc;
  /** Transient document shown while a drag is in flight; `null` clears it. */
  preview?: LayoutDoc | null;
  /** Change the selection (`undefined` leaves it alone). */
  select?: string | null;
  /** Pan the viewport by this many *screen* px (select tool dragging empty space). */
  panBy?: Pt;
  request?: ToolRequest;
}

export interface ToolDef<S> {
  id: ToolId;
  initial(): S;
  handle(state: S, input: ToolInput, ctx: ToolContext): ToolResult<S>;
  /** True while the tool has uncommitted geometry (shows ✓ / ✕ in the HUD). */
  isDrafting(state: S): boolean;
}

/** Helper: result that only updates state. */
export function same<S>(state: S): ToolResult<S> {
  return { state };
}
