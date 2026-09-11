/**
 * shared/layout/doc.ts
 *
 * The versioned JSON document that backs the Phase 4 layout editor
 * (`layout_drawings.document`). Pure types + a defensive parser so the
 * worker can validate what it reads back from jsonb and the client can
 * trust what it renders. No React, no DB, no DOM.
 *
 * Coordinate space: every `Pt` is in *content pixels* of the base drawing
 * (the natural width/height of the image, or the PDF page rendered at
 * scale 1). Real-world lengths come from `Calibration`, which is two
 * content points plus the distance between them in millimetres; see
 * `geometry.ts#pxPerMm`.
 */

export type Mm = number;

export interface Pt {
  x: number;
  y: number;
}

/** pxPerMm = dist(a, b) / lengthMm */
export interface Calibration {
  a: Pt;
  b: Pt;
  lengthMm: Mm;
}

export interface BarrierRunElement {
  kind: "barrierRun";
  id: string;
  familyId: string;
  productId?: string;
  cartItemId?: string;
  points: Pt[];
  label?: string;
  note?: string;
}

/** Point products: bollards, column guards, dock buffers, ... */
export interface StampElement {
  kind: "stamp";
  id: string;
  familyId: string;
  productId?: string;
  cartItemId?: string;
  at: Pt;
  rotationDeg: number;
  note?: string;
}

export interface WallElement {
  kind: "wall";
  id: string;
  points: Pt[];
}

export interface DimensionElement {
  kind: "dimension";
  id: string;
  a: Pt;
  b: Pt;
}

export interface NoteElement {
  kind: "note";
  id: string;
  at: Pt;
  text: string;
}

/** Pedestrian / vehicle zone shading. */
export interface ZoneElement {
  kind: "zone";
  id: string;
  points: Pt[];
  label: string;
}

export type Element =
  | BarrierRunElement
  | StampElement
  | WallElement
  | DimensionElement
  | NoteElement
  | ZoneElement;

export type ElementKind = Element["kind"];

export interface LayoutDoc {
  version: 1;
  calibration?: Calibration;
  elements: Element[];
  vehicleTypeId?: string;
  floorType?: string;
}

export const LAYOUT_DOC_VERSION = 1 as const;

export function createEmptyDoc(): LayoutDoc {
  return { version: LAYOUT_DOC_VERSION, elements: [] };
}

export function isStampElement(el: Element): el is StampElement {
  return el.kind === "stamp";
}

export function isBarrierRunElement(el: Element): el is BarrierRunElement {
  return el.kind === "barrierRun";
}

/** Elements whose geometry is an open or closed polyline (`points`). */
export function isPolylineElement(
  el: Element,
): el is BarrierRunElement | WallElement | ZoneElement {
  return el.kind === "barrierRun" || el.kind === "wall" || el.kind === "zone";
}

/** Every content point an element occupies, in drawing order. */
export function elementPoints(el: Element): Pt[] {
  switch (el.kind) {
    case "barrierRun":
    case "wall":
    case "zone":
      return el.points;
    case "stamp":
    case "note":
      return [el.at];
    case "dimension":
      return [el.a, el.b];
  }
}

// ─── Parsing ────────────────────────────────────────────────────────────────

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parsePt(v: unknown): Pt | null {
  if (!isRecord(v)) return null;
  if (!isFiniteNumber(v.x) || !isFiniteNumber(v.y)) return null;
  return { x: v.x, y: v.y };
}

function parsePts(v: unknown): Pt[] | null {
  if (!Array.isArray(v)) return null;
  const out: Pt[] = [];
  for (const item of v) {
    const p = parsePt(item);
    if (!p) return null;
    out.push(p);
  }
  return out;
}

function optString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function parseCalibration(v: unknown): Calibration | undefined {
  if (!isRecord(v)) return undefined;
  const a = parsePt(v.a);
  const b = parsePt(v.b);
  if (!a || !b || !isFiniteNumber(v.lengthMm) || v.lengthMm <= 0) return undefined;
  return { a, b, lengthMm: v.lengthMm };
}

/**
 * Validate one element. Returns null for anything malformed so a single
 * bad row can never take the whole document down.
 */
export function parseElement(v: unknown): Element | null {
  if (!isRecord(v)) return null;
  const id = optString(v.id);
  if (!id) return null;

  switch (v.kind) {
    case "barrierRun": {
      const familyId = optString(v.familyId);
      const points = parsePts(v.points);
      if (!familyId || !points) return null;
      const el: BarrierRunElement = { kind: "barrierRun", id, familyId, points };
      const productId = optString(v.productId);
      const cartItemId = optString(v.cartItemId);
      const label = optString(v.label);
      const note = optString(v.note);
      if (productId) el.productId = productId;
      if (cartItemId) el.cartItemId = cartItemId;
      if (label) el.label = label;
      if (note) el.note = note;
      return el;
    }
    case "stamp": {
      const familyId = optString(v.familyId);
      const at = parsePt(v.at);
      if (!familyId || !at) return null;
      const el: StampElement = {
        kind: "stamp",
        id,
        familyId,
        at,
        rotationDeg: isFiniteNumber(v.rotationDeg) ? v.rotationDeg : 0,
      };
      const productId = optString(v.productId);
      const cartItemId = optString(v.cartItemId);
      const note = optString(v.note);
      if (productId) el.productId = productId;
      if (cartItemId) el.cartItemId = cartItemId;
      if (note) el.note = note;
      return el;
    }
    case "wall": {
      const points = parsePts(v.points);
      if (!points) return null;
      return { kind: "wall", id, points };
    }
    case "dimension": {
      const a = parsePt(v.a);
      const b = parsePt(v.b);
      if (!a || !b) return null;
      return { kind: "dimension", id, a, b };
    }
    case "note": {
      const at = parsePt(v.at);
      if (!at || typeof v.text !== "string") return null;
      return { kind: "note", id, at, text: v.text };
    }
    case "zone": {
      const points = parsePts(v.points);
      if (!points) return null;
      return { kind: "zone", id, points, label: typeof v.label === "string" ? v.label : "" };
    }
    default:
      return null;
  }
}

/**
 * Parse an unknown value (typically `layout_drawings.document` from jsonb)
 * into a `LayoutDoc`. Returns null when the envelope is wrong; malformed
 * elements and calibrations are dropped rather than failing the whole doc.
 */
export function parseLayoutDoc(v: unknown): LayoutDoc | null {
  if (!isRecord(v)) return null;
  if (v.version !== LAYOUT_DOC_VERSION) return null;
  if (!Array.isArray(v.elements)) return null;

  const elements: Element[] = [];
  for (const raw of v.elements) {
    const el = parseElement(raw);
    if (el) elements.push(el);
  }

  const doc: LayoutDoc = { version: LAYOUT_DOC_VERSION, elements };
  const calibration = parseCalibration(v.calibration);
  if (calibration) doc.calibration = calibration;
  const vehicleTypeId = optString(v.vehicleTypeId);
  if (vehicleTypeId) doc.vehicleTypeId = vehicleTypeId;
  const floorType = optString(v.floorType);
  if (floorType) doc.floorType = floorType;
  return doc;
}
