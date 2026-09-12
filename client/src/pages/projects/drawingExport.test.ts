import { describe, expect, it } from "vitest";
import {
  exportButtonLabel,
  exportChip,
  exportChipState,
  exportSheetUrl,
  isNotExportedError,
  type DrawingExportStatus,
} from "./drawingExport";

const fresh: DrawingExportStatus = {
  objectKey: "layout-exports/d1/v3.pdf",
  url: "/api/objects/layout-exports/d1/v3.pdf",
  version: 3,
  stale: false,
};

describe("exportChipState", () => {
  it("is 'not_exported' when the endpoint 404'd (null/undefined)", () => {
    expect(exportChipState(null)).toBe("not_exported");
    expect(exportChipState(undefined)).toBe("not_exported");
  });

  it("is 'up_to_date' when the stored export matches the document version", () => {
    expect(exportChipState(fresh)).toBe("up_to_date");
  });

  it("is 'stale' when the document moved past the export", () => {
    expect(exportChipState({ ...fresh, stale: true })).toBe("stale");
  });
});

describe("exportChip", () => {
  it("labels and colours each state (green / amber / grey)", () => {
    expect(exportChip(fresh)).toMatchObject({ label: "Export up to date" });
    expect(exportChip(fresh).className).toContain("green");
    expect(exportChip({ ...fresh, stale: true })).toMatchObject({ label: "Export stale" });
    expect(exportChip({ ...fresh, stale: true }).className).toContain("amber");
    expect(exportChip(null)).toMatchObject({ label: "Not exported" });
    expect(exportChip(null).className).toContain("muted");
  });
});

describe("exportButtonLabel", () => {
  it("offers a first export, a re-export, or the in-flight copy", () => {
    expect(exportButtonLabel(null, false)).toBe("Export sheet");
    expect(exportButtonLabel(fresh, false)).toBe("Re-export sheet");
    expect(exportButtonLabel({ ...fresh, stale: true }, false)).toBe("Re-export sheet");
    expect(exportButtonLabel(null, true)).toBe("Exporting…");
    expect(exportButtonLabel(fresh, true)).toBe("Exporting…");
  });
});

describe("exportSheetUrl", () => {
  it("returns the stored PDF url only when an export exists", () => {
    expect(exportSheetUrl(fresh)).toBe("/api/objects/layout-exports/d1/v3.pdf");
    expect(exportSheetUrl(null)).toBeNull();
    expect(exportSheetUrl({ ...fresh, url: "" })).toBeNull();
  });
});

describe("isNotExportedError", () => {
  it("recognises a 404 by status or legacy '404:' message, nothing else", () => {
    expect(isNotExportedError({ status: 404 })).toBe(true);
    expect(isNotExportedError(new Error("404: Drawing has not been exported yet"))).toBe(true);
    expect(isNotExportedError({ status: 500 })).toBe(false);
    expect(isNotExportedError(new Error("500: boom"))).toBe(false);
    expect(isNotExportedError(null)).toBe(false);
  });
});
