/**
 * shared/layout/migrateMarkups.ts
 *
 * One-way conversion of legacy `layout_markups` rows into a `LayoutDoc`.
 * Runs lazily on the first GET /api/layout-drawings/:id/document when the
 * drawing has no document yet (see plan Task L0). Pure: takes row-shaped
 * objects, returns a doc, never touches the DB.
 *
 * Legacy coordinate convention: `pathData` is a JSON array of content-pixel
 * points; older rows stored a two-point line on xPosition/yPosition +
 * endX/endY. The schema comment calls xPosition a percentage but the
 * editor always wrote content pixels, so we treat them as such.
 */

import type { Calibration, Element, LayoutDoc, Pt } from "./doc";
import { LAYOUT_DOC_VERSION } from "./doc";
import { dedupePoints } from "./geometry";
import { familyForProduct, isStampFamily } from "./symbols";

/** Drizzle row shape from shared/schema.ts#layoutMarkups (camelCase). */
export interface LegacyMarkupRow {
  id: string;
  layoutDrawingId?: string;
  cartItemId?: string | null;
  productName?: string | null;
  xPosition: number;
  yPosition: number;
  endX?: number | null;
  endY?: number | null;
  pathData?: string | null;
  comment?: string | null;
  calculatedLength?: number | null;
  deletedAt?: Date | string | null;
}

/** The slice of a layout_drawings row the migration needs. */
export interface LegacyDrawingRow {
  id: string;
  /** Legacy px-per-mm scale factor. */
  scale?: number | null;
  /** {start, end, actualLength (mm), zoomLevel} written by useScaleCalibration. */
  scaleLine?: unknown;
  isScaleSet?: boolean | null;
  vehicleTypeId?: string | null;
  floorType?: string | null;
}

export interface MigrateOptions {
  /** Resolve a catalogue product id for a row (e.g. by cart item or name). */
  productIdFor?: (row: LegacyMarkupRow) => string | undefined;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function toPt(v: unknown): Pt | null {
  if (typeof v !== "object" || v === null) return null;
  const { x, y } = v as { x?: unknown; y?: unknown };
  return isFiniteNumber(x) && isFiniteNumber(y) ? { x, y } : null;
}

/** Build the calibration from the legacy scale line, else synthesise one from the bare scale. */
export function calibrationFromDrawing(drawing: LegacyDrawingRow): Calibration | undefined {
  const line = drawing.scaleLine as { start?: unknown; end?: unknown; actualLength?: unknown } | null | undefined;
  if (line && typeof line === "object") {
    const a = toPt(line.start);
    const b = toPt(line.end);
    const lengthMm = line.actualLength;
    if (a && b && isFiniteNumber(lengthMm) && lengthMm > 0 && (a.x !== b.x || a.y !== b.y)) {
      return { a, b, lengthMm };
    }
  }
  if (isFiniteNumber(drawing.scale) && drawing.scale > 0) {
    // scale is px/mm; a 1 m reference line is scale*1000 px long.
    return { a: { x: 0, y: 0 }, b: { x: drawing.scale * 1000, y: 0 }, lengthMm: 1000 };
  }
  return undefined;
}

/** Points for a row: pathData when it parses, else the xPosition/endX pair. Consecutive duplicates collapsed. */
export function pointsFromRow(row: LegacyMarkupRow): Pt[] {
  let pts: Pt[] | null = null;
  if (row.pathData) {
    try {
      const parsed: unknown = JSON.parse(row.pathData);
      if (Array.isArray(parsed)) {
        const out: Pt[] = [];
        for (const item of parsed) {
          const p = toPt(item);
          if (p) out.push(p);
        }
        pts = out;
      }
    } catch {
      pts = null;
    }
  }
  if (!pts || pts.length === 0) {
    if (!isFiniteNumber(row.xPosition) || !isFiniteNumber(row.yPosition)) return [];
    const start = { x: row.xPosition, y: row.yPosition };
    const end = {
      x: isFiniteNumber(row.endX) ? row.endX : row.xPosition,
      y: isFiniteNumber(row.endY) ? row.endY : row.yPosition,
    };
    pts = [start, end];
  }
  return dedupePoints(pts);
}

function rowToElement(row: LegacyMarkupRow, opts: MigrateOptions): Element | null {
  const pts = pointsFromRow(row);
  if (pts.length === 0) return null;

  const familyId = familyForProduct({ name: row.productName ?? undefined });
  const productId = opts.productIdFor?.(row);
  const cartItemId = row.cartItemId ?? undefined;
  const note = row.comment?.trim() || undefined;

  if (isStampFamily(familyId)) {
    // Point products: use the first point regardless of how the legacy row was drawn.
    const el: Element = { kind: "stamp", id: row.id, familyId, at: pts[0], rotationDeg: 0 };
    if (productId) el.productId = productId;
    if (cartItemId) el.cartItemId = cartItemId;
    if (note) el.note = note;
    return el;
  }

  if (pts.length < 2) return null;
  const el: Element = { kind: "barrierRun", id: row.id, familyId, points: pts };
  if (productId) el.productId = productId;
  if (cartItemId) el.cartItemId = cartItemId;
  if (note) el.note = note;
  return el;
}

/**
 * Convert legacy markup rows for one drawing into a LayoutDoc. Soft-deleted
 * rows, rows with no usable geometry, and runs with a single point are
 * skipped; nothing here throws on bad data.
 */
export function markupsToDoc(rows: LegacyMarkupRow[], drawing: LegacyDrawingRow, opts: MigrateOptions = {}): LayoutDoc {
  const elements: Element[] = [];
  for (const row of rows) {
    if (row.deletedAt) continue;
    const el = rowToElement(row, opts);
    if (el) elements.push(el);
  }

  const doc: LayoutDoc = { version: LAYOUT_DOC_VERSION, elements };
  const calibration = calibrationFromDrawing(drawing);
  if (calibration) doc.calibration = calibration;
  if (drawing.vehicleTypeId) doc.vehicleTypeId = drawing.vehicleTypeId;
  if (drawing.floorType) doc.floorType = drawing.floorType;
  return doc;
}
