/**
 * client/src/components/layout-editor/tools/stamp.ts
 *
 * Stamp tool for point products (bollards, column guards, dock buffers).
 * Tap places a stamp with the active family/product at rotation 0. A
 * press-drag-release places the stamp at the press point and orients it
 * toward the finger as it moves, so one gesture sets position *and*
 * rotation. Once placed the stamp is selected; the Select tool's rotation
 * handle takes over from there.
 */

import type { LayoutDoc, Pt, StampElement } from "@shared/layout/doc";
import { getFamily, isStampFamily } from "@shared/layout/symbols";
import type { ToolContext, ToolDef, ToolInput, ToolResult } from "./types";

export interface StampState {
  draft: StampElement | null;
}

/** Stamp families only; a run family falls back to the 190 OD bollard. */
export const FALLBACK_STAMP_FAMILY = "bollard-190";

export function stampFamilyFor(familyId: string): string {
  return isStampFamily(familyId) ? getFamily(familyId).id : FALLBACK_STAMP_FAMILY;
}

function makeStamp(at: Pt, ctx: ToolContext): StampElement {
  const familyId = stampFamilyFor(ctx.familyId);
  const el: StampElement = { kind: "stamp", id: ctx.newId(), familyId, at, rotationDeg: 0 };
  // Only carry the product across when it actually belongs to a stamp family.
  if (ctx.productId && familyId === ctx.familyId) el.productId = ctx.productId;
  return el;
}

function withDraft(doc: LayoutDoc, draft: StampElement): LayoutDoc {
  return { ...doc, elements: [...doc.elements, draft] };
}

function rotationToward(from: Pt, to: Pt, angleSnap: boolean): number {
  const deg = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI + 90;
  const norm = ((deg % 360) + 360) % 360;
  return angleSnap ? Math.round(norm / 15) * 15 : Math.round(norm * 10) / 10;
}

function handle(state: StampState, input: ToolInput, ctx: ToolContext): ToolResult<StampState> {
  switch (input.type) {
    case "tap": {
      if (input.tapCount >= 2) return { state };
      const el = makeStamp(input.p, ctx);
      return { state: { draft: null }, commit: withDraft(ctx.doc, el), select: el.id };
    }
    case "dragStart": {
      const draft = makeStamp(input.p, ctx);
      return { state: { draft }, preview: withDraft(ctx.doc, draft) };
    }
    case "dragMove": {
      if (!state.draft) return { state };
      const draft = { ...state.draft, rotationDeg: rotationToward(state.draft.at, input.p, ctx.angleSnap) };
      return { state: { draft }, preview: withDraft(ctx.doc, draft) };
    }
    case "dragEnd": {
      if (!state.draft) return { state };
      const draft = { ...state.draft, rotationDeg: rotationToward(state.draft.at, input.p, ctx.angleSnap) };
      return { state: { draft: null }, preview: null, commit: withDraft(ctx.doc, draft), select: draft.id };
    }
    case "dragCancel":
    case "cancel":
      return { state: { draft: null }, preview: null };
    case "hover":
    case "longPress":
    case "finish":
    case "undoPoint":
      return { state };
  }
}

export const stampTool: ToolDef<StampState> = {
  id: "stamp",
  initial: () => ({ draft: null }),
  handle,
  isDrafting: (s) => s.draft !== null,
};
