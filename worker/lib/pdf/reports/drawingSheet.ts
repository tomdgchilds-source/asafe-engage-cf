// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/reports/drawingSheet.ts
//
// A3 landscape drawing sheet: the customer's base drawing (a PDF page or an
// image) placed in the drawing area, the Phase 4 `LayoutDoc` overlay drawn
// on top as vectors at page scale, a right-hand legend built from the
// symbol library, and a vector title block ported from the DOM
// TitleBlockFrame (dwg no, rev, date, scale, title, project, drawn,
// checked, revision table, notes, approval, "DO NOT SCALE", A-SAFE UAE
// address, confidentiality strip).
//
// Coordinates: every overlay point is in *content pixels* of the base
// (image natural size, or PDF page points at scale 1). The base is fitted
// into the drawing area with a uniform scale `s`; a content point (x, y)
// lands at (ox + x·s, oy + drawnH − y·s). Real-world widths (rail width,
// post OD) come from the doc's calibration: 1 mm = pxPerMm·s pt on the
// sheet, so a 190 mm post prints as a 190 mm circle at the sheet's scale.
//
// Used by Phase 4 Task L4 (POST /api/layout-drawings/:id/export) and by
// GET /api/layout-drawings/:id/documents/sheet.pdf.
// ────────────────────────────────────────────────────────────────────────────

import { PDFDocument, LineCapStyle, degrees, type PDFEmbeddedPage, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import type { Env } from "../../../types";
import { C, TYPE, hexToRgb } from "../theme";
import { createDoc, addPage, finalize, mm, type Doc, type Page } from "../doc";
import { drawText, measure, wrap } from "../text";
import { drawImageFit, embedBrandImage, withClip, type Rect } from "../assets";
import { embedImage } from "../images";
import type { LayoutDoc, Element, Pt, Calibration } from "../../../../shared/layout/doc";
import { FAMILIES, getFamily, type FamilyId, type FamilySpec } from "../../../../shared/layout/symbols";
import { pxPerMm, postPositions, dist, runLengthMm, dedupePoints } from "../../../../shared/layout/geometry";

// ─── Public types ──────────────────────────────────────────────────────────

export type DrawingSheetBase =
  | { kind: "pdf"; bytes: Uint8Array; /** 0-based page to place; default 0. */ pageIndex?: number }
  | { kind: "image"; bytes: Uint8Array }
  /** No base file (blank canvas drawings): a white field of this content size. */
  | { kind: "blank"; widthPx: number; heightPx: number };

export interface RevisionRow {
  rev: string;
  date: string;
  notes: string;
}

export interface DrawingTitleBlock {
  dwgNumber?: string | null;
  revision?: string | null;
  /** "DD-MMM-YYYY"; defaults to today. */
  date?: string | null;
  /** "NTS", "1:100", … Defaults to "NTS". */
  scale?: string | null;
  title?: string | null;
  project?: string | null;
  /** Initials or name of the person who drew the sheet. */
  drawnBy?: string | null;
  checkedBy?: string | null;
  revisionHistory?: RevisionRow[] | null;
  /** Free-text notes; string is split on newlines. */
  notes?: string[] | string | null;
  /** Draws a DRAFT watermark when "DRAFT". Default "ISSUED". */
  status?: "DRAFT" | "ISSUED";
  office?: Partial<OfficeBlock>;
}

export interface OfficeBlock {
  name: string;
  addressLines: string[];
  phone: string;
  web: string;
}

export interface DrawingSheetOptions {
  base: DrawingSheetBase;
  overlay?: LayoutDoc;
  titleBlock: DrawingTitleBlock;
  /** Families to list in the legend, in order. Usually the families the overlay uses. */
  legendFamilies: FamilyId[];
}

export const A_SAFE_UAE_OFFICE: OfficeBlock = {
  name: "A-SAFE DWC LLC",
  addressLines: ["Office #220, Building A5", "Dubai South, Business Park", "Dubai, UAE"],
  phone: "Tel: 04 884 2422",
  web: "www.asafe.com",
};

export const CONFIDENTIALITY_TEXT =
  "This document is confidential and the information contained therein, including the design principles and copyright, is the property of A-SAFE DWC LLC. It may not be used, copied or reproduced, in part or whole, by any third party, or used for manufacture or any other purpose without the prior authority of A-SAFE DWC LLC.";

/** Families used by a document's runs and stamps, in order of first use. */
export function familiesInDoc(doc: LayoutDoc | undefined | null): FamilyId[] {
  const out: FamilyId[] = [];
  if (!doc) return out;
  for (const el of doc.elements) {
    if (el.kind !== "barrierRun" && el.kind !== "stamp") continue;
    const id = getFamily(el.familyId).id;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** "DD-MMM-YYYY" to match the printed template. */
export function formatDrawingDate(d: Date = new Date()): string {
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${String(d.getDate()).padStart(2, "0")}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

// ─── Sheet geometry (pt) ───────────────────────────────────────────────────

const FRAME_MARGIN = mm(10);
const TITLE_BLOCK_H = mm(44);
const LEGEND_W = mm(62);
const STRIP_H = mm(5);
const RULE = 0.6;
const THIN = 0.35;

interface Frame {
  outer: Rect;
  drawing: Rect;
  legend: Rect | null;
  title: Rect;
  strip: Rect;
}

function computeFrame(page: Page, hasLegend: boolean): Frame {
  const outer = { x: FRAME_MARGIN, y: FRAME_MARGIN, w: page.width - FRAME_MARGIN * 2, h: page.height - FRAME_MARGIN * 2 };
  const strip = { x: outer.x, y: outer.y, w: outer.w, h: STRIP_H };
  const title = { x: outer.x, y: strip.y + strip.h, w: outer.w, h: TITLE_BLOCK_H };
  const bodyY = title.y + title.h;
  const bodyH = outer.y + outer.h - bodyY;
  const legend = hasLegend ? { x: outer.x + outer.w - LEGEND_W, y: bodyY, w: LEGEND_W, h: bodyH } : null;
  const drawing = { x: outer.x, y: bodyY, w: outer.w - (legend ? legend.w : 0), h: bodyH };
  return { outer, drawing, legend, title, strip };
}

// ─── Entry point ───────────────────────────────────────────────────────────

/**
 * Render one A3 landscape sheet. `env` is accepted for parity with the other
 * renderers (future asset fetches); nothing here touches bindings today.
 */
export async function renderDrawingSheet(_env: Env, opts: DrawingSheetOptions): Promise<Uint8Array> {
  const tb = opts.titleBlock;
  const status = tb.status ?? "ISSUED";
  const title = (tb.title || "A-SAFE BARRIER PROPOSAL").trim();
  const dwgNumber = (tb.dwgNumber || "TBD").trim();
  const revision = (tb.revision || "00").trim();
  const doc = await createDoc({
    title,
    reference: dwgNumber,
    revision,
    issuedOn: tb.date || formatDrawingDate(),
    docType: "Layout drawing",
    status,
  });
  const page = addPage(doc, { size: "A3L", header: false, footer: false });
  const legendFamilies = opts.legendFamilies.filter((id, i, arr) => arr.indexOf(id) === i);
  const frame = computeFrame(page, legendFamilies.length > 0);

  // Frame lines.
  page.page.drawRectangle({ ...rectArgs(frame.outer), borderColor: C.black, borderWidth: 1.2 });
  page.page.drawLine({ start: { x: frame.title.x, y: frame.title.y + frame.title.h }, end: { x: frame.title.x + frame.title.w, y: frame.title.y + frame.title.h }, thickness: 1.2, color: C.black });

  // Base + overlay inside the drawing area.
  const placement = await placeBase(doc, page, opts.base, frame.drawing);
  if (placement && opts.overlay) {
    withClip(page.page, frame.drawing, () => drawOverlay(doc, page.page, opts.overlay!, placement));
  }

  if (frame.legend) drawLegend(doc, page.page, frame.legend, legendFamilies);
  await drawTitleBlock(doc, page.page, frame.title, tb, { title, dwgNumber, revision });
  drawStrip(doc, page.page, frame.strip);

  return finalize(doc);
}

function rectArgs(r: Rect) {
  return { x: r.x, y: r.y, width: r.w, height: r.h };
}

// ─── Base placement ────────────────────────────────────────────────────────

interface Placement {
  /** Bottom-left of the drawn base on the sheet. */
  ox: number;
  oy: number;
  /** Uniform scale: sheet pt per content px. */
  s: number;
  contentW: number;
  contentH: number;
  drawnW: number;
  drawnH: number;
}

function fit(area: Rect, contentW: number, contentH: number, pad: number): Placement {
  const availW = area.w - pad * 2;
  const availH = area.h - pad * 2;
  const s = Math.min(availW / contentW, availH / contentH);
  const drawnW = contentW * s;
  const drawnH = contentH * s;
  return {
    ox: area.x + pad + (availW - drawnW) / 2,
    oy: area.y + pad + (availH - drawnH) / 2,
    s,
    contentW,
    contentH,
    drawnW,
    drawnH,
  };
}

async function placeBase(doc: Doc, page: Page, base: DrawingSheetBase, area: Rect): Promise<Placement | null> {
  const pad = mm(4);
  if (base.kind === "blank") {
    const w = base.widthPx > 0 ? base.widthPx : 1400;
    const h = base.heightPx > 0 ? base.heightPx : 990;
    const p = fit(area, w, h, pad);
    page.page.drawRectangle({ x: p.ox, y: p.oy, width: p.drawnW, height: p.drawnH, color: C.white, borderColor: C.grey20, borderWidth: THIN });
    return p;
  }
  if (base.kind === "pdf") {
    let embedded: PDFEmbeddedPage | null = null;
    try {
      const src = await PDFDocument.load(base.bytes, { ignoreEncryption: true });
      const count = src.getPageCount();
      const index = Math.min(Math.max(0, base.pageIndex ?? 0), Math.max(0, count - 1));
      if (count > 0) embedded = await doc.pdf.embedPage(src.getPage(index));
    } catch {
      embedded = null;
    }
    if (!embedded) {
      placeholder(doc, page.page, area, "BASE DRAWING COULD NOT BE READ");
      return null;
    }
    const p = fit(area, embedded.width, embedded.height, pad);
    page.page.drawPage(embedded, { x: p.ox, y: p.oy, width: p.drawnW, height: p.drawnH });
    return p;
  }
  const img = await embedImage(doc, base.bytes);
  if (!img) {
    placeholder(doc, page.page, area, "IMAGE FORMAT NOT SUPPORTED (WEBP / HEIC)");
    return null;
  }
  const p = fit(area, img.width, img.height, pad);
  page.page.drawImage(img.image, { x: p.ox, y: p.oy, width: p.drawnW, height: p.drawnH });
  return p;
}

function placeholder(doc: Doc, page: PDFPage, area: Rect, text: string): void {
  page.drawRectangle({ x: area.x + mm(4), y: area.y + mm(4), width: area.w - mm(8), height: area.h - mm(8), color: C.grey8 });
  drawText(page, text, {
    x: area.x,
    y: area.y + area.h / 2 + TYPE.label.lead,
    size: TYPE.label.size + 2,
    font: doc.fonts.bold,
    color: C.grey60,
    maxWidth: area.w,
    align: "center",
    tracking: TYPE.label.tracking,
    lineHeight: TYPE.label.lead + 2,
  });
}

// ─── Overlay ───────────────────────────────────────────────────────────────

interface Mapper {
  pt: (p: Pt) => { x: number; y: number };
  /** Sheet points per real millimetre, or null when uncalibrated. */
  ptPerMm: number | null;
  s: number;
  cal: Calibration | undefined;
}

function makeMapper(placement: Placement, doc: LayoutDoc): Mapper {
  const k = pxPerMm(doc.calibration);
  return {
    pt: (p) => ({ x: placement.ox + p.x * placement.s, y: placement.oy + placement.drawnH - p.y * placement.s }),
    ptPerMm: k === null ? null : k * placement.s,
    s: placement.s,
    cal: doc.calibration,
  };
}

/** Width on the sheet for a real-world mm value, with a legibility floor. */
function realWidth(m: Mapper, widthMm: number, minPt: number, fallbackPt: number): number {
  if (m.ptPerMm === null) return fallbackPt;
  return Math.max(minPt, widthMm * m.ptPerMm);
}

const WALL_GREY = C.grey60;
const ZONE_FILL = hexToRgb("#92C0E9");

function drawOverlay(doc: Doc, page: PDFPage, layout: LayoutDoc, placement: Placement): void {
  const m = makeMapper(placement, layout);
  // Draw order: zones (under), walls, runs, stamps, dimensions, notes (over).
  const order: Element["kind"][] = ["zone", "wall", "barrierRun", "stamp", "dimension", "note"];
  let runNo = 0;
  const runNumbers = new Map<string, number>();
  for (const el of layout.elements) if (el.kind === "barrierRun") runNumbers.set(el.id, ++runNo);
  for (const kind of order) {
    for (const el of layout.elements) {
      if (el.kind !== kind) continue;
      switch (el.kind) {
        case "zone":
          drawZone(doc, page, m, el.points, el.label);
          break;
        case "wall":
          drawWall(page, m, el.points);
          break;
        case "barrierRun":
          drawRun(doc, page, m, el.points, getFamily(el.familyId), el.label ?? `${getFamily(el.familyId).letter}${runNumbers.get(el.id) ?? ""}`);
          break;
        case "stamp":
          drawStamp(doc, page, m, el.at, el.rotationDeg, getFamily(el.familyId));
          break;
        case "dimension":
          drawDimension(doc, page, m, el.a, el.b);
          break;
        case "note":
          drawNote(doc, page, m, el.at, el.text);
          break;
      }
    }
  }
}

function drawPolyline(page: PDFPage, pts: Array<{ x: number; y: number }>, o: { thickness: number; color: RGB; dash?: number[]; opacity?: number }): void {
  for (let i = 1; i < pts.length; i++) {
    page.drawLine({
      start: pts[i - 1],
      end: pts[i],
      thickness: o.thickness,
      color: o.color,
      dashArray: o.dash,
      opacity: o.opacity,
      lineCap: LineCapStyle.Round,
    });
  }
}

/** Offset a polyline's segments sideways by `d` pt (positive = left of travel). */
function offsetSegments(pts: Array<{ x: number; y: number }>, d: number): Array<[{ x: number; y: number }, { x: number; y: number }]> {
  const out: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    const nx = (-(b.y - a.y) / len) * d;
    const ny = ((b.x - a.x) / len) * d;
    out.push([{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }]);
  }
  return out;
}

function drawRun(doc: Doc, page: PDFPage, m: Mapper, points: Pt[], fam: FamilySpec, label: string): void {
  const raw = dedupePoints(points);
  if (raw.length < 2) return;
  const pts = raw.map(m.pt);
  const colour = hexToRgb(fam.colour);
  const railW = realWidth(m, fam.widthMm, 1.2, 2.4);
  const line = Math.max(0.5, Math.min(1.4, railW * 0.28));

  if (fam.strokeStyle === "double") {
    // Two rails either side of the centreline, plus a faint centreline.
    for (const sign of [1, -1]) {
      for (const [a, b] of offsetSegments(pts, (sign * railW) / 2)) {
        page.drawLine({ start: a, end: b, thickness: line, color: colour, lineCap: LineCapStyle.Round });
      }
    }
    drawPolyline(page, pts, { thickness: 0.3, color: colour, opacity: 0.5 });
  } else if (fam.strokeStyle === "dashed") {
    drawPolyline(page, pts, { thickness: Math.max(1, railW), color: colour, dash: [mm(2), mm(1.2)] });
  } else {
    drawPolyline(page, pts, { thickness: Math.max(1, railW), color: colour });
  }

  // Posts: every vertex plus even spacing when calibrated; vertices only otherwise.
  const posts = m.ptPerMm !== null && fam.postSpacingMm > 0 ? postPositions(raw, fam.postSpacingMm, m.cal) : raw;
  const r = realWidth(m, fam.postOdMm, 1.6, 2.2) / 2;
  for (const p of posts) {
    const q = m.pt(p);
    page.drawCircle({ x: q.x, y: q.y, size: r, color: C.white, borderColor: colour, borderWidth: Math.max(0.5, r * 0.35) });
  }

  // Label at the midpoint of the longest segment, offset to the left of travel.
  let best = 0;
  let bestLen = -1;
  for (let i = 1; i < pts.length; i++) {
    const l = dist(pts[i - 1], pts[i]);
    if (l > bestLen) {
      bestLen = l;
      best = i;
    }
  }
  const a = pts[best - 1];
  const b = pts[best];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const off = railW / 2 + mm(1.6);
  const lx = mid.x - ((b.y - a.y) / len) * off;
  const ly = mid.y + ((b.x - a.x) / len) * off;
  const lengthMm = runLengthMm(raw, m.cal);
  const text = lengthMm !== null ? `${label}  ${formatLength(lengthMm)}` : label;
  labelBox(doc, page, lx, ly, text, colour);
}

function drawStamp(doc: Doc, page: PDFPage, m: Mapper, at: Pt, rotationDeg: number, fam: FamilySpec): void {
  const c = m.pt(at);
  const colour = hexToRgb(fam.colour);
  const w = realWidth(m, fam.widthMm || fam.postOdMm || 190, 3, 5);
  const shape = fam.stampShape ?? "circle";
  if (shape === "circle") {
    page.drawCircle({ x: c.x, y: c.y, size: w / 2, color: colour, opacity: 0.9, borderColor: C.black, borderWidth: 0.4 });
  } else {
    const h = shape === "rect" ? w * 0.45 : w;
    // Rotate about the centre: pdf-lib rotates about the rectangle origin, so
    // pre-rotate the offset of the bottom-left corner.
    const rad = (-rotationDeg * Math.PI) / 180;
    const dx = -w / 2;
    const dy = -h / 2;
    const x = c.x + dx * Math.cos(rad) - dy * Math.sin(rad);
    const y = c.y + dx * Math.sin(rad) + dy * Math.cos(rad);
    page.drawRectangle({ x, y, width: w, height: h, color: colour, opacity: 0.9, borderColor: C.black, borderWidth: 0.4, rotate: degrees(-rotationDeg) });
  }
  // Letter beside the symbol.
  labelBox(doc, page, c.x + w / 2 + mm(1.2), c.y + mm(1.5), fam.letter, colour);
}

function drawWall(page: PDFPage, m: Mapper, points: Pt[]): void {
  const pts = dedupePoints(points).map(m.pt);
  if (pts.length < 2) return;
  drawPolyline(page, pts, { thickness: realWidth(m, 150, 2.2, 3), color: WALL_GREY });
}

function drawZone(doc: Doc, page: PDFPage, m: Mapper, points: Pt[], label: string): void {
  const pts = dedupePoints(points).map(m.pt);
  if (pts.length < 3) return;
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${(-p.y).toFixed(2)}`).join(" ") + " Z";
  page.drawSvgPath(path, { x: 0, y: 0, color: ZONE_FILL, opacity: 0.16, borderColor: hexToRgb("#2563EB"), borderWidth: 0.6, borderOpacity: 0.7, borderDashArray: [mm(1.5), mm(1)] });
  if (label) {
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const w = measure(doc.fonts.bold, 7, label.toUpperCase()) + mm(3);
    drawText(page, label.toUpperCase(), { x: cx - w / 2, y: cy + 4, size: 7, font: doc.fonts.bold, color: hexToRgb("#1E40AF"), maxWidth: w, align: "center", lineHeight: 8, tracking: 0.04 });
  }
}

function drawDimension(doc: Doc, page: PDFPage, m: Mapper, a: Pt, b: Pt): void {
  const A = m.pt(a);
  const B = m.pt(b);
  const len = Math.hypot(B.x - A.x, B.y - A.y);
  if (len < 0.5) return;
  const ux = (B.x - A.x) / len;
  const uy = (B.y - A.y) / len;
  page.drawLine({ start: A, end: B, thickness: 0.5, color: C.black });
  const head = Math.min(mm(2.2), len / 3);
  const half = head * 0.38;
  for (const [tip, dir] of [
    [A, 1],
    [B, -1],
  ] as Array<[{ x: number; y: number }, number]>) {
    const bx = tip.x + ux * head * dir;
    const by = tip.y + uy * head * dir;
    const path = `M ${tip.x.toFixed(2)} ${(-tip.y).toFixed(2)} L ${(bx - uy * half).toFixed(2)} ${(-(by + ux * half)).toFixed(2)} L ${(bx + uy * half).toFixed(2)} ${(-(by - ux * half)).toFixed(2)} Z`;
    page.drawSvgPath(path, { x: 0, y: 0, color: C.black });
  }
  // Extension ticks.
  for (const p of [A, B]) {
    page.drawLine({ start: { x: p.x - uy * mm(1.2), y: p.y + ux * mm(1.2) }, end: { x: p.x + uy * mm(1.2), y: p.y - ux * mm(1.2) }, thickness: 0.4, color: C.black });
  }
  const mmLen = m.ptPerMm === null ? null : len / m.ptPerMm;
  const text = mmLen === null ? "NOT CALIBRATED" : formatLength(mmLen);
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  labelBox(doc, page, mid.x - uy * mm(2.2), mid.y + ux * mm(2.2) + mm(1.5), text, C.black, true);
}

function drawNote(doc: Doc, page: PDFPage, m: Mapper, at: Pt, text: string): void {
  const p = m.pt(at);
  const size = 7;
  const maxW = mm(48);
  const lines = wrap(doc.fonts.regular, size, text, maxW - mm(3));
  const w = Math.min(maxW, Math.max(...lines.map((l) => measure(doc.fonts.regular, size, l))) + mm(3));
  const h = lines.length * (size * 1.3) + mm(2);
  const bx = p.x + mm(3);
  const by = p.y + mm(2);
  page.drawCircle({ x: p.x, y: p.y, size: 1.4, color: C.black });
  page.drawLine({ start: p, end: { x: bx, y: by }, thickness: 0.4, color: C.black });
  page.drawRectangle({ x: bx, y: by, width: w, height: h, color: C.white, borderColor: C.black, borderWidth: 0.5 });
  drawText(page, lines.join("\n"), { x: bx + mm(1.5), y: by + h - mm(1), size, font: doc.fonts.regular, color: C.black, lineHeight: size * 1.3 });
}

/** Small white box with bold text, centred horizontally on `cx`, top at `cy`. */
function labelBox(doc: Doc, page: PDFPage, cx: number, cy: number, text: string, colour: RGB, centre = false): void {
  const size = 6.5;
  const w = measure(doc.fonts.bold, size, text) + mm(2.4);
  const h = mm(3.6);
  const x = centre ? cx - w / 2 : cx;
  page.drawRectangle({ x, y: cy - h, width: w, height: h, color: C.white, borderColor: colour, borderWidth: 0.5 });
  drawText(page, text, { x: x + mm(1.2), y: cy, size, font: doc.fonts.bold, color: C.black, lineHeight: h });
}

export function formatLength(lengthMm: number): string {
  if (lengthMm >= 1000) return `${(lengthMm / 1000).toFixed(2)} m`;
  return `${Math.round(lengthMm)} mm`;
}

/** Trim `str` with an ellipsis so it fits `maxW` pt on one line. */
function fitText(font: Doc["fonts"]["regular"], size: number, str: string, maxW: number): string {
  if (measure(font, size, str) <= maxW) return str;
  let s = str;
  while (s.length > 1 && measure(font, size, `${s}…`) > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

// ─── Legend ────────────────────────────────────────────────────────────────

function drawLegend(doc: Doc, page: PDFPage, area: Rect, families: FamilyId[]): void {
  page.drawLine({ start: { x: area.x, y: area.y }, end: { x: area.x, y: area.y + area.h }, thickness: 1.2, color: C.black });
  const pad = mm(3);
  let y = area.y + area.h - pad;
  y -= drawText(page, "A-SAFE BARRIER KEY", { x: area.x + pad, y, size: 8.5, font: doc.fonts.bold, color: C.black, tracking: 0.05, lineHeight: 11 });
  page.drawRectangle({ x: area.x + pad, y: y - 1, width: mm(16), height: 1.5, color: C.yellow });
  y -= mm(4);
  const cols = ["Symbol", "Product"];
  drawText(page, cols[0].toUpperCase(), { x: area.x + pad, y, size: TYPE.label.size, font: doc.fonts.regular, color: C.grey60, tracking: TYPE.label.tracking, lineHeight: TYPE.label.lead });
  drawText(page, cols[1].toUpperCase(), { x: area.x + pad + mm(20), y, size: TYPE.label.size, font: doc.fonts.regular, color: C.grey60, tracking: TYPE.label.tracking, lineHeight: TYPE.label.lead });
  y -= TYPE.label.lead + mm(1);
  page.drawLine({ start: { x: area.x + pad, y }, end: { x: area.x + area.w - pad, y }, thickness: THIN, color: C.grey40 });
  y -= mm(1.5);

  const rowH = mm(8);
  const symW = mm(17);
  const textX = area.x + pad + mm(20);
  const textW = area.w - pad * 2 - mm(20);
  for (const id of families) {
    if (y - rowH < area.y + pad) break;
    const fam = FAMILIES[id];
    const colour = hexToRgb(fam.colour);
    const cy = y - rowH / 2;
    const sx = area.x + pad;
    // Symbol swatch: mirrors the overlay stroke style.
    if (fam.stampShape) {
      const size = mm(3.2);
      if (fam.stampShape === "circle") page.drawCircle({ x: sx + symW / 2, y: cy, size: size / 2, color: colour, borderColor: C.black, borderWidth: 0.4 });
      else page.drawRectangle({ x: sx + symW / 2 - size / 2, y: cy - (fam.stampShape === "rect" ? size * 0.25 : size / 2), width: size, height: fam.stampShape === "rect" ? size * 0.5 : size, color: colour, borderColor: C.black, borderWidth: 0.4 });
    } else if (fam.strokeStyle === "double") {
      page.drawLine({ start: { x: sx, y: cy + 1.4 }, end: { x: sx + symW, y: cy + 1.4 }, thickness: 0.9, color: colour });
      page.drawLine({ start: { x: sx, y: cy - 1.4 }, end: { x: sx + symW, y: cy - 1.4 }, thickness: 0.9, color: colour });
      for (const px of [sx + 1.5, sx + symW / 2, sx + symW - 1.5]) page.drawCircle({ x: px, y: cy, size: 1.6, color: C.white, borderColor: colour, borderWidth: 0.6 });
    } else if (fam.strokeStyle === "dashed") {
      page.drawLine({ start: { x: sx, y: cy }, end: { x: sx + symW, y: cy }, thickness: 1.6, color: colour, dashArray: [mm(1.6), mm(1)] });
    } else {
      page.drawLine({ start: { x: sx, y: cy }, end: { x: sx + symW, y: cy }, thickness: 1.6, color: colour });
      for (const px of [sx + 1.5, sx + symW - 1.5]) page.drawCircle({ x: px, y: cy, size: 1.5, color: C.white, borderColor: colour, borderWidth: 0.6 });
    }
    // Letter and label.
    drawText(page, `${fam.letter}`, { x: textX, y: y - mm(1), size: 8, font: doc.fonts.bold, color: C.black, lineHeight: 9 });
    drawText(page, fam.label, { x: textX + mm(5), y: y - mm(1), size: 6.8, font: doc.fonts.regular, color: C.black, maxWidth: textW - mm(5), lineHeight: 8 });
    y -= rowH;
    page.drawLine({ start: { x: area.x + pad, y }, end: { x: area.x + area.w - pad, y }, thickness: THIN, color: C.grey20 });
  }
  // Note under the key.
  const note = "Post centres and rail widths are drawn to the sheet scale where the drawing is calibrated; symbols are otherwise schematic.";
  const noteLines = wrap(doc.fonts.regular, 6, note, area.w - pad * 2);
  drawText(page, noteLines.join("\n"), { x: area.x + pad, y: area.y + pad + noteLines.length * 7.5, size: 6, font: doc.fonts.regular, color: C.grey60, lineHeight: 7.5 });
}

// ─── Title block ───────────────────────────────────────────────────────────

interface Resolved {
  title: string;
  dwgNumber: string;
  revision: string;
}

async function drawTitleBlock(doc: Doc, page: PDFPage, area: Rect, tb: DrawingTitleBlock, r: Resolved): Promise<void> {
  const office: OfficeBlock = { ...A_SAFE_UAE_OFFICE };
  for (const [k, v] of Object.entries(tb.office ?? {})) {
    if (v !== undefined && v !== null) (office as unknown as Record<string, unknown>)[k] = v;
  }
  const { regular, bold } = doc.fonts;
  const y0 = area.y;
  const top = area.y + area.h;
  const cell = (x: number, y: number, w: number, h: number) => page.drawRectangle({ x, y, width: w, height: h, borderColor: C.black, borderWidth: RULE });
  const kv = (x: number, yTop: number, w: number, h: number, key: string, value: string, opts: { bold?: boolean; mono?: boolean } = {}) => {
    cell(x, yTop - h, w, h);
    const keyW = measure(bold, 6.5, `${key} -`) + mm(1.5);
    const font = opts.bold ? bold : regular;
    drawText(page, `${key} -`, { x: x + mm(1.5), y: yTop, size: 6.5, font: bold, color: C.black, lineHeight: h });
    drawText(page, fitText(font, 7.5, value, w - keyW - mm(3)), { x: x + mm(1.5) + keyW, y: yTop, size: 7.5, font, color: C.black, lineHeight: h, noWrap: true });
  };

  // Column widths (left grid | revision | notes | approval | office | logo).
  const logoW = mm(58);
  const officeW = mm(56);
  const approvalW = mm(36);
  const notesW = mm(48);
  const revW = mm(56);
  const gridW = area.w - logoW - officeW - approvalW - notesW - revW;
  const rowH = area.h / 4;

  // ── Left grid: 4 rows ──
  let x = area.x;
  const c1 = gridW * 0.36;
  const c2 = gridW * 0.16;
  const c3 = gridW * 0.26;
  const c4 = gridW - c1 - c2 - c3;
  kv(x, top, c1, rowH, "Dwg No", r.dwgNumber, { mono: true });
  kv(x + c1, top, c2, rowH, "Rev", r.revision);
  kv(x + c1 + c2, top, c3, rowH, "Date", tb.date || formatDrawingDate());
  kv(x + c1 + c2 + c3, top, c4, rowH, "Scale", tb.scale || "NTS");
  kv(x, top - rowH, gridW, rowH, "Title", r.title.toUpperCase(), { bold: true });
  kv(x, top - rowH * 2, c1 + c2, rowH, "Project", tb.project || "—", { bold: true });
  kv(x + c1 + c2, top - rowH * 2, c3, rowH, "Drawn", tb.drawnBy || "—");
  kv(x + c1 + c2 + c3, top - rowH * 2, c4, rowH, "Checked", tb.checkedBy || "—");
  // "Do not scale" banner.
  page.drawRectangle({ x, y: y0, width: gridW, height: rowH, color: C.grey8, borderColor: C.black, borderWidth: RULE });
  drawText(page, fitText(bold, 7, "NOTE: DO NOT SCALE. WORK TO GIVEN DIMENSIONS ONLY.", gridW - mm(3)), { x: x + mm(1.5), y: y0 + rowH, size: 7, font: bold, color: C.black, lineHeight: rowH, noWrap: true });
  x += gridW;

  // ── Revision history ──
  const headH = mm(5);
  const tableHead = (hx: number, hw: number, label: string) => {
    page.drawRectangle({ x: hx, y: top - headH, width: hw, height: headH, color: C.grey8, borderColor: C.black, borderWidth: RULE });
    drawText(page, label.toUpperCase(), { x: hx + mm(1.5), y: top, size: 6.5, font: bold, color: C.black, lineHeight: headH, tracking: 0.04 });
  };
  tableHead(x, revW, "Revision history");
  const revRows = [...(tb.revisionHistory ?? [])].slice(-3);
  while (revRows.length < 3) revRows.push({ rev: "", date: "", notes: "" });
  const subH = mm(4);
  const bodyH = area.h - headH;
  const revRowH = (bodyH - subH) / 3;
  const rc = [mm(9), mm(17), revW - mm(26)];
  let ry = top - headH;
  // Sub-header.
  let cx = x;
  for (const [i, lab] of ["Rev", "Date", "Notes"].entries()) {
    cell(cx, ry - subH, rc[i], subH);
    drawText(page, lab, { x: cx + mm(1), y: ry, size: 6, font: bold, color: C.black, lineHeight: subH });
    cx += rc[i];
  }
  ry -= subH;
  for (const row of revRows) {
    cx = x;
    for (const [i, val] of [row.rev, row.date, row.notes].entries()) {
      cell(cx, ry - revRowH, rc[i], revRowH);
      drawText(page, fitText(regular, 6.5, val ?? "", rc[i] - mm(2)), { x: cx + mm(1), y: ry, size: 6.5, font: regular, color: C.black, lineHeight: revRowH, noWrap: true });
      cx += rc[i];
    }
    ry -= revRowH;
  }
  x += revW;

  // ── Notes ──
  tableHead(x, notesW, "Notes section");
  const noteLines = (Array.isArray(tb.notes) ? tb.notes : (tb.notes ?? "").split(/\r?\n/)).map((s) => s.trim()).filter(Boolean).slice(0, 4);
  while (noteLines.length < 4) noteLines.push("");
  const noteRowH = bodyH / 4;
  let ny = top - headH;
  for (const line of noteLines) {
    cell(x, ny - noteRowH, notesW, noteRowH);
    drawText(page, fitText(regular, 6.5, line ? `- ${line}` : "-", notesW - mm(3)), { x: x + mm(1.5), y: ny, size: 6.5, font: regular, color: C.black, lineHeight: noteRowH, noWrap: true });
    ny -= noteRowH;
  }
  x += notesW;

  // ── Drawing approval ──
  tableHead(x, approvalW, "Drawing approval");
  const apRowH = bodyH / 3;
  let ay = top - headH;
  for (const lab of ["Date", "Approved by", "Signature"]) {
    cell(x, ay - apRowH, approvalW, apRowH);
    drawText(page, lab, { x: x + mm(1.5), y: ay, size: 6.5, font: bold, color: C.black, lineHeight: apRowH });
    ay -= apRowH;
  }
  x += approvalW;

  // ── Office ──
  cell(x, y0, officeW, area.h);
  let oy = top - mm(3);
  oy -= drawText(page, office.name, { x: x + mm(2.5), y: oy, size: 7.5, font: bold, color: C.black, lineHeight: 9.5 });
  oy -= mm(1);
  for (const line of office.addressLines) oy -= drawText(page, line, { x: x + mm(2.5), y: oy, size: 6.8, font: regular, color: C.grey90, lineHeight: 8.5 });
  oy -= mm(1.5);
  oy -= drawText(page, office.phone, { x: x + mm(2.5), y: oy, size: 6.8, font: regular, color: C.grey90, lineHeight: 8.5 });
  drawText(page, office.web, { x: x + mm(2.5), y: oy, size: 6.8, font: regular, color: C.grey90, lineHeight: 8.5 });
  x += officeW;

  // ── Logo (secondary: yellow icon + black word, on white) ──
  cell(x, y0, logoW, area.h);
  const logo: PDFImage = await embedBrandImage(doc, "logoSecondary");
  const maxLogoW = logoW - mm(10);
  const maxLogoH = area.h - mm(12);
  const ratio = logo.width / logo.height;
  let lw = maxLogoW;
  let lh = lw / ratio;
  if (lh > maxLogoH) {
    lh = maxLogoH;
    lw = lh * ratio;
  }
  drawImageFit(page, logo, { x: x + (logoW - lw) / 2, y: y0 + (area.h - lh) / 2, width: lw });
}

function drawStrip(doc: Doc, page: PDFPage, area: Rect): void {
  page.drawRectangle({ ...rectArgs(area), color: C.black });
  drawText(page, fitText(doc.fonts.regular, 5.6, CONFIDENTIALITY_TEXT, area.w - mm(6)), {
    x: area.x + mm(3),
    y: area.y + area.h,
    size: 5.6,
    font: doc.fonts.regular,
    color: C.grey20,
    lineHeight: area.h,
    noWrap: true,
  });
}
