import { describe, it, expect } from "vitest";
import { checkBaseVersion, legacyScaleFromCalibration } from "./layoutDrawings";

// Pure halves of the Phase 4 document API (plan Task L4). The Hono handlers
// themselves need a DB; these cover the version gate and the legacy mirror
// that older screens (layout-markup editor, proposal PDF) depend on.

describe("checkBaseVersion", () => {
  it("accepts a baseVersion equal to the current documentVersion", () => {
    expect(checkBaseVersion(3, 3)).toEqual({ ok: true, baseVersion: 3 });
    expect(checkBaseVersion(0, 0)).toEqual({ ok: true, baseVersion: 0 });
  });

  it("returns 409 when baseVersion is stale or ahead of the row", () => {
    expect(checkBaseVersion(2, 3)).toMatchObject({ ok: false, status: 409 });
    expect(checkBaseVersion(4, 3)).toMatchObject({ ok: false, status: 409 });
  });

  it("returns 400 for a missing or malformed baseVersion", () => {
    expect(checkBaseVersion(undefined, 0)).toMatchObject({ ok: false, status: 400 });
    expect(checkBaseVersion("1", 1)).toMatchObject({ ok: false, status: 400 });
    expect(checkBaseVersion(1.5, 1)).toMatchObject({ ok: false, status: 400 });
    expect(checkBaseVersion(-1, 0)).toMatchObject({ ok: false, status: 400 });
    expect(checkBaseVersion(NaN, 0)).toMatchObject({ ok: false, status: 400 });
  });
});

describe("legacyScaleFromCalibration", () => {
  it("maps a calibration to scale (px/mm), scaleLine and isScaleSet", () => {
    // 300 px line = 1500 mm → 0.2 px/mm
    const out = legacyScaleFromCalibration({ a: { x: 100, y: 50 }, b: { x: 400, y: 50 }, lengthMm: 1500 });
    expect(out.isScaleSet).toBe(true);
    expect(out.scale).toBeCloseTo(0.2, 10);
    expect(out.scaleLine).toEqual({
      start: { x: 100, y: 50 },
      end: { x: 400, y: 50 },
      actualLength: 1500,
      zoomLevel: 1,
    });
  });

  it("uses the true euclidean length for a diagonal line", () => {
    // 3-4-5 triangle: 500 px over 2500 mm → 0.2 px/mm
    const out = legacyScaleFromCalibration({ a: { x: 0, y: 0 }, b: { x: 300, y: 400 }, lengthMm: 2500 });
    expect(out.scale).toBeCloseTo(0.2, 10);
  });

  it("clears the legacy columns when there is no calibration", () => {
    expect(legacyScaleFromCalibration(undefined)).toEqual({ scale: null, scaleLine: null, isScaleSet: false });
  });

  it("clears the legacy columns for a degenerate (zero-length) line", () => {
    expect(
      legacyScaleFromCalibration({ a: { x: 10, y: 10 }, b: { x: 10, y: 10 }, lengthMm: 1000 }),
    ).toEqual({ scale: null, scaleLine: null, isScaleSet: false });
  });

  it("round-trips through migrateMarkups' calibrationFromDrawing", async () => {
    const { calibrationFromDrawing } = await import("../../shared/layout/migrateMarkups");
    const cal = { a: { x: 12, y: 34 }, b: { x: 212, y: 34 }, lengthMm: 4000 };
    const legacy = legacyScaleFromCalibration(cal);
    expect(calibrationFromDrawing({ id: "d1", scale: legacy.scale, scaleLine: legacy.scaleLine, isScaleSet: legacy.isScaleSet })).toEqual(cal);
  });
});
