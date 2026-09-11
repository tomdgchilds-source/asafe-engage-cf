import { describe, it, expect } from "vitest";
import { markupsToDoc, type LegacyMarkupRow, type LegacyDrawingRow } from "./migrateMarkups";

const drawing: LegacyDrawingRow = {
  id: "dwg-1",
  scale: 0.2,
  scaleLine: { start: { x: 100, y: 100 }, end: { x: 300, y: 100 }, actualLength: 1000, zoomLevel: 1.5 },
  isScaleSet: true,
  vehicleTypeId: "vt-1",
  floorType: "concrete",
};

const rows: LegacyMarkupRow[] = [
  {
    id: "m1",
    layoutDrawingId: "dwg-1",
    cartItemId: "ci-1",
    productName: "iFlex Double Traffic Barrier+",
    xPosition: 10,
    yPosition: 20,
    endX: null,
    endY: null,
    pathData: JSON.stringify([{ x: 10, y: 20 }, { x: 10, y: 20 }, { x: 210, y: 20 }, { x: 210, y: 220 }]),
    comment: "replace steel barrier",
    calculatedLength: 2000,
    deletedAt: null,
  },
  {
    // Legacy two-point line stored on xPosition/endX with no pathData.
    id: "m2",
    layoutDrawingId: "dwg-1",
    cartItemId: null,
    productName: "eFlex Single Rack End Barrier",
    xPosition: 400,
    yPosition: 400,
    endX: 500,
    endY: 400,
    pathData: null,
    comment: null,
    calculatedLength: null,
    deletedAt: null,
  },
  {
    // Point placement of a bollard -> stamp.
    id: "m3",
    layoutDrawingId: "dwg-1",
    cartItemId: "ci-3",
    productName: "Bollard, Yellow",
    xPosition: 50,
    yPosition: 60,
    endX: null,
    endY: null,
    pathData: JSON.stringify([{ x: 50, y: 60 }]),
    comment: "tarmac floor",
    calculatedLength: null,
    deletedAt: null,
  },
];

describe("markupsToDoc", () => {
  const doc = markupsToDoc(rows, drawing);

  it("builds the calibration from the legacy scale line", () => {
    expect(doc.version).toBe(1);
    expect(doc.calibration).toEqual({ a: { x: 100, y: 100 }, b: { x: 300, y: 100 }, lengthMm: 1000 });
    expect(doc.vehicleTypeId).toBe("vt-1");
    expect(doc.floorType).toBe("concrete");
  });

  it("converts three legacy rows into typed elements", () => {
    expect(doc.elements).toHaveLength(3);
    expect(doc.elements[0]).toEqual({
      kind: "barrierRun",
      id: "m1",
      familyId: "iflex-double-traffic-plus",
      cartItemId: "ci-1",
      points: [{ x: 10, y: 20 }, { x: 210, y: 20 }, { x: 210, y: 220 }],
      note: "replace steel barrier",
    });
    expect(doc.elements[1]).toEqual({
      kind: "barrierRun",
      id: "m2",
      familyId: "rack-end-single",
      points: [{ x: 400, y: 400 }, { x: 500, y: 400 }],
    });
    expect(doc.elements[2]).toEqual({
      kind: "stamp",
      id: "m3",
      familyId: "bollard-190",
      cartItemId: "ci-3",
      at: { x: 50, y: 60 },
      rotationDeg: 0,
      note: "tarmac floor",
    });
  });

  it("resolves productId through the optional lookup", () => {
    const withIds = markupsToDoc(rows, drawing, {
      productIdFor: (row) => (row.productName === "Bollard, Yellow" ? "p-bollard" : undefined),
    });
    expect((withIds.elements[2] as { productId?: string }).productId).toBe("p-bollard");
    expect((withIds.elements[0] as { productId?: string }).productId).toBeUndefined();
  });

  it("skips soft-deleted rows, malformed pathData and degenerate geometry", () => {
    const bad: LegacyMarkupRow[] = [
      { ...rows[0], id: "del", deletedAt: new Date() },
      { ...rows[0], id: "junk", pathData: "{not json" },
      { ...rows[0], id: "dot", pathData: JSON.stringify([{ x: 1, y: 1 }, { x: 1, y: 1 }]) },
      { ...rows[0], id: "empty", pathData: "[]", endX: null, endY: null },
    ];
    const d = markupsToDoc(bad, drawing);
    // "junk" and "empty" fall back to xPosition/endX which is a single point for a run family -> dropped.
    expect(d.elements.map((e) => e.id)).toEqual([]);
  });

  it("synthesises a calibration from a bare scale, and none when unscaled", () => {
    const bare = markupsToDoc([], { ...drawing, scaleLine: null });
    expect(bare.calibration).toEqual({ a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, lengthMm: 1000 });
    const none = markupsToDoc([], { ...drawing, scaleLine: null, scale: null, isScaleSet: false });
    expect(none.calibration).toBeUndefined();
    // isScaleSet=false but a scale line still present: trust the line.
    const unset = markupsToDoc([], { ...drawing, isScaleSet: false });
    expect(unset.calibration?.lengthMm).toBe(1000);
  });

  it("returns an empty doc for no rows", () => {
    expect(markupsToDoc([], { id: "x" }).elements).toEqual([]);
  });
});
