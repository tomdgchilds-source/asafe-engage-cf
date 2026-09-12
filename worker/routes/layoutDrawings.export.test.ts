import { describe, it, expect } from "vitest";
import { exportObjectKey, exportStatusFromDrawing, objectUrl } from "./layoutDrawings";

// Pure halves of the Phase 4 export API (plan Task L4). The Hono handlers
// need a DB + R2; these cover the object-key scheme and the staleness rule
// that the drawing cards (Task L5) and the proposal PDF rely on.

describe("exportObjectKey", () => {
  it("scopes the key by drawing id and document version", () => {
    expect(exportObjectKey("abc-123", 4)).toBe("layout-exports/abc-123/v4.pdf");
  });

  it("gives every document version its own object so old exports are never overwritten", () => {
    const keys = [0, 1, 2].map((v) => exportObjectKey("d1", v));
    expect(new Set(keys).size).toBe(3);
    expect(exportObjectKey("d1", 1)).not.toBe(exportObjectKey("d2", 1));
  });
});

describe("objectUrl", () => {
  it("serves the key through GET /api/objects/*", () => {
    expect(objectUrl("layout-exports/d1/v2.pdf")).toBe("/api/objects/layout-exports/d1/v2.pdf");
  });
});

describe("exportStatusFromDrawing", () => {
  it("returns null when the drawing has never been exported", () => {
    expect(exportStatusFromDrawing({ exportObjectKey: null, exportVersion: null, documentVersion: 3 })).toBeNull();
    expect(exportStatusFromDrawing({ exportObjectKey: "", exportVersion: 1, documentVersion: 1 })).toBeNull();
  });

  it("is fresh when exportVersion equals documentVersion", () => {
    expect(
      exportStatusFromDrawing({ exportObjectKey: "layout-exports/d1/v3.pdf", exportVersion: 3, documentVersion: 3 }),
    ).toEqual({
      objectKey: "layout-exports/d1/v3.pdf",
      url: "/api/objects/layout-exports/d1/v3.pdf",
      version: 3,
      stale: false,
    });
  });

  it("is stale once the document has been saved after the export", () => {
    const s = exportStatusFromDrawing({ exportObjectKey: "layout-exports/d1/v3.pdf", exportVersion: 3, documentVersion: 5 });
    expect(s).toMatchObject({ version: 3, stale: true });
  });

  it("treats a missing exportVersion as version 0 (stale unless the doc is also at 0)", () => {
    expect(exportStatusFromDrawing({ exportObjectKey: "k", exportVersion: null, documentVersion: 2 })).toMatchObject({ version: 0, stale: true });
    expect(exportStatusFromDrawing({ exportObjectKey: "k", exportVersion: null, documentVersion: 0 })).toMatchObject({ version: 0, stale: false });
  });
});
