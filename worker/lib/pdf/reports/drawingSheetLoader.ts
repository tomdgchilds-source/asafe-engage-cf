// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/reports/drawingSheetLoader.ts
//
// Shared glue between a `layout_drawings` row and `renderDrawingSheet`:
// loading the base file (PDF page / image / blank field), mapping the row's
// title-block columns onto `DrawingTitleBlock`, and naming the output file.
//
// Used by GET /api/layout-drawings/:id/documents/sheet.pdf (on-demand
// render) and POST /api/layout-drawings/:id/export (Phase 4 Task L4, stored
// in R2 at `export_object_key`). Both must produce byte-identical sheets for
// the same drawing + document, so neither route maps the title block itself.
// ────────────────────────────────────────────────────────────────────────────

import type { Env } from "../../../types";
import type { LayoutDrawing } from "../../../../shared/schema";
import type { LayoutDoc } from "../../../../shared/layout/doc";
import { docBounds } from "../../../../shared/layout/geometry";
import { fetchImageBytes, sniffImage } from "../images";
import {
  renderDrawingSheet,
  familiesInDoc,
  type DrawingSheetBase,
  type DrawingSheetOptions,
  type DrawingTitleBlock,
  type RevisionRow,
} from "./drawingSheet";

/** Minimal shape of the signed-in user needed for the "drawn by" initials. */
export interface SheetUser {
  firstName?: string | null;
  lastName?: string | null;
}

/** Coerce the `revisionHistory` JSON column into typed rows (tolerates junk). */
export function revisionRows(v: unknown): RevisionRow[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({ rev: String(r.rev ?? ""), date: String(r.date ?? ""), notes: String(r.notes ?? "") }));
}

/** "JD" from first + last name; "" when nothing is known. */
export function userInitials(user: SheetUser | null | undefined): string {
  if (!user) return "";
  return `${(user.firstName ?? "")[0] ?? ""}${(user.lastName ?? "")[0] ?? ""}`.toUpperCase();
}

/**
 * Map the drawing row's title-block columns onto the renderer's input.
 * `drawnBy` prefers the explicit author column, then the exporter's initials.
 */
export function titleBlockFromDrawing(
  drawing: LayoutDrawing,
  user: SheetUser | null | undefined,
  status: "DRAFT" | "ISSUED" = "ISSUED",
): DrawingTitleBlock {
  const initials = userInitials(user);
  return {
    dwgNumber: drawing.dwgNumber,
    revision: drawing.revision,
    date: drawing.drawingDate,
    scale: drawing.drawingScale,
    title: drawing.drawingTitle,
    project: [drawing.projectName, drawing.company, drawing.location].filter(Boolean).join(" — "),
    drawnBy: drawing.author || initials || undefined,
    checkedBy: drawing.checkedBy,
    revisionHistory: revisionRows(drawing.revisionHistory),
    notes: drawing.notesSection,
    status,
  };
}

/**
 * Resolve the drawing's base file. Blank-canvas drawings get a white field
 * sized to the overlay's bounds; uploaded files are sniffed so a PDF stored
 * with a stale `fileType` still embeds as a page rather than an image.
 */
export async function loadDrawingBase(env: Env, drawing: LayoutDrawing, overlay: LayoutDoc): Promise<DrawingSheetBase> {
  if (!drawing.fileUrl || drawing.fileUrl === "blank-canvas") {
    const b = docBounds(overlay);
    return { kind: "blank", widthPx: b ? Math.max(1400, b.maxX * 1.05) : 1400, heightPx: b ? Math.max(990, b.maxY * 1.05) : 990 };
  }
  const bytes = await fetchImageBytes(env, drawing.fileUrl, { maxBytes: 30_000_000, timeoutMs: 10_000 });
  if (!bytes) throw new Error(`Base drawing not readable: ${drawing.fileUrl}`);
  const isPdf = drawing.fileType === "pdf" || (bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
  if (isPdf) return { kind: "pdf", bytes };
  if (sniffImage(bytes) === "unknown" && drawing.fileType !== "image") return { kind: "pdf", bytes };
  return { kind: "image", bytes };
}

export interface DrawingSheetInput {
  drawing: LayoutDrawing;
  overlay: LayoutDoc;
  user?: SheetUser | null;
  status?: "DRAFT" | "ISSUED";
}

/** Build the full renderer options (base + overlay + legend + title block) for a drawing. */
export async function buildDrawingSheetOptions(env: Env, input: DrawingSheetInput): Promise<DrawingSheetOptions> {
  const base = await loadDrawingBase(env, input.drawing, input.overlay);
  return {
    base,
    overlay: input.overlay,
    legendFamilies: familiesInDoc(input.overlay),
    titleBlock: titleBlockFromDrawing(input.drawing, input.user, input.status ?? "ISSUED"),
  };
}

/** Load the base and render the A3 sheet for a drawing row + document. */
export async function renderDrawingSheetForDrawing(env: Env, input: DrawingSheetInput): Promise<Uint8Array> {
  const opts = await buildDrawingSheetOptions(env, input);
  return renderDrawingSheet(env, opts);
}

/** `<dwgNumber|fileName stem|drawing>-sheet.pdf`, filesystem-safe. */
export function drawingSheetFileName(drawing: Pick<LayoutDrawing, "dwgNumber" | "fileName">): string {
  const stem = drawing.dwgNumber || (drawing.fileName ?? "").replace(/\.[^.]+$/, "") || "drawing";
  return `${stem.replace(/[^A-Za-z0-9._-]+/g, "_")}-sheet.pdf`;
}
