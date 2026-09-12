/**
 * client/src/components/layout-editor/tools/note.ts
 *
 * Note tool: tap where the callout should point and the Editor opens the
 * text sheet (`request: noteText`); the Editor commits the element once
 * the user confirms. Nothing is drafted in the document meanwhile.
 */

import type { ToolDef, ToolInput, ToolResult } from "./types";

export type NoteState = Record<string, never>;

function handle(state: NoteState, input: ToolInput): ToolResult<NoteState> {
  if (input.type === "tap" && input.tapCount < 2) {
    return { state, request: { kind: "noteText", at: input.p } };
  }
  if (input.type === "dragEnd") {
    return { state, request: { kind: "noteText", at: input.p } };
  }
  return { state };
}

export const noteTool: ToolDef<NoteState> = {
  id: "note",
  initial: () => ({}),
  handle,
  isDrafting: () => false,
};
