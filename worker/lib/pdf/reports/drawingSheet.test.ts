import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Env } from "../../../types";
import type { LayoutDoc } from "../../../../shared/layout/doc";
import { renderDrawingSheet, familiesInDoc, formatLength } from "./drawingSheet";

const env = {} as Env;

/** A valid 1 × 1 baseline JPEG (134 bytes). */
const ONE_PX_JPEG = Uint8Array.from(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
    "base64",
  ),
);

const OUT_DIR = "/private/tmp/claude-501/-Users-thomaschilds/2d881f7c-dcfa-4f66-ba00-cbde0bc3613f/scratchpad";

function save(name: string, bytes: Uint8Array): void {
  try {
    mkdirSync(dirname(`${OUT_DIR}/${name}`), { recursive: true });
    writeFileSync(`${OUT_DIR}/${name}`, bytes);
  } catch {
    /* best effort */
  }
}

/** One-page A4 landscape floor plan with a few walls, generated in the test. */
async function fixturePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([841.89, 595.28]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 60, y: 60, width: 720, height: 470, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 2 });
  page.drawLine({ start: { x: 300, y: 60 }, end: { x: 300, y: 320 }, thickness: 2, color: rgb(0.2, 0.2, 0.2) });
  page.drawText("WAREHOUSE 4 — GROUND FLOOR", { x: 70, y: 540, size: 14, font });
  return pdf.save();
}

const overlay: LayoutDoc = {
  version: 1,
  // 100 px = 1 000 mm → 0.1 px/mm.
  calibration: { a: { x: 60, y: 40 }, b: { x: 160, y: 40 }, lengthMm: 1000 },
  elements: [
    { kind: "zone", id: "z1", points: [{ x: 80, y: 80 }, { x: 280, y: 80 }, { x: 280, y: 200 }, { x: 80, y: 200 }], label: "Pedestrian zone" },
    { kind: "wall", id: "w1", points: [{ x: 300, y: 60 }, { x: 300, y: 320 }] },
    { kind: "barrierRun", id: "r1", familyId: "iflex-double-traffic", points: [{ x: 100, y: 250 }, { x: 600, y: 250 }, { x: 600, y: 450 }] },
    { kind: "barrierRun", id: "r2", familyId: "pedestrian-3-rail", points: [{ x: 80, y: 210 }, { x: 280, y: 210 }] },
    { kind: "stamp", id: "s1", familyId: "bollard-190", at: { x: 320, y: 100 }, rotationDeg: 0 },
    { kind: "stamp", id: "s2", familyId: "column-guard", at: { x: 700, y: 120 }, rotationDeg: 30 },
    { kind: "dimension", id: "d1", a: { x: 100, y: 500 }, b: { x: 600, y: 500 } },
    { kind: "note", id: "n1", at: { x: 650, y: 300 }, text: "Confirm slab depth before fixing" },
  ],
};

const titleBlock = {
  dwgNumber: "DWGAE002882",
  revision: "02",
  date: "12-SEP-2026",
  scale: "1:100",
  title: "A-SAFE barrier proposal — warehouse 4",
  project: "Gulf Freight Logistics — Al Quoz",
  drawnBy: "RH",
  checkedBy: "SS",
  revisionHistory: [
    { rev: "01", date: "10-SEP-2026", notes: "First issue" },
    { rev: "02", date: "12-SEP-2026", notes: "Bollards added at dock 3" },
  ],
  notes: "All dimensions in mm\nFixings M12 resin anchors to 150 mm slab",
};

describe("renderDrawingSheet", () => {
  it("renders a PDF base with overlay onto one A3 landscape page under 2 MB", async () => {
    const base = await fixturePdf();
    const bytes = await renderDrawingSheet(env, {
      base: { kind: "pdf", bytes: base },
      overlay,
      titleBlock,
      legendFamilies: familiesInDoc(overlay),
    });
    save("drawing-sheet-pdf.pdf", bytes);
    expect(new TextDecoder("latin1").decode(bytes.subarray(0, 5))).toBe("%PDF-");
    expect(bytes.byteLength).toBeLessThan(2_000_000);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeGreaterThan(height);
    expect(width).toBeCloseTo(1190.55, 0);
    expect(height).toBeCloseTo(841.89, 0);
  });

  it("renders a 1 × 1 JPEG base with the overlay and legend", async () => {
    const bytes = await renderDrawingSheet(env, {
      base: { kind: "image", bytes: ONE_PX_JPEG },
      overlay: { ...overlay, calibration: undefined },
      titleBlock: { ...titleBlock, status: "DRAFT" },
      legendFamilies: ["iflex-double-traffic", "pedestrian-3-rail", "bollard-190", "column-guard"],
    });
    save("drawing-sheet-jpeg.pdf", bytes);
    expect(bytes.byteLength).toBeLessThan(2_000_000);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeGreaterThan(height);
    expect(width).toBeCloseTo(1190.55, 0);
  });

  it("renders a blank base without an overlay or legend", async () => {
    const bytes = await renderDrawingSheet(env, {
      base: { kind: "blank", widthPx: 1400, heightPx: 990 },
      titleBlock: {},
      legendFamilies: [],
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it("derives legend families in order of first use", () => {
    expect(familiesInDoc(overlay)).toEqual(["iflex-double-traffic", "pedestrian-3-rail", "bollard-190", "column-guard"]);
    expect(familiesInDoc(null)).toEqual([]);
  });

  it("formats lengths in m above 1 000 mm", () => {
    expect(formatLength(2400)).toBe("2.40 m");
    expect(formatLength(650)).toBe("650 mm");
  });
});
