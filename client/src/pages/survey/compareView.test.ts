import { describe, it, expect } from "vitest";
import {
  DELTA_META,
  formatScoreChange,
  formatVisitDate,
  levelClass,
  missingAfterCopy,
  netChangeTone,
  photoSrc,
  summaryCells,
} from "./compareView";

describe("photoSrc", () => {
  it("prefixes bare R2 keys with /api/objects/", () => {
    expect(photoSrc("surveys/abc/photo.jpg")).toBe("/api/objects/surveys/abc/photo.jpg");
  });
  it("passes through absolute URLs, data/blob URLs and already-prefixed paths", () => {
    expect(photoSrc("https://cdn.example.com/x.jpg")).toBe("https://cdn.example.com/x.jpg");
    expect(photoSrc("/api/objects/x.jpg")).toBe("/api/objects/x.jpg");
    expect(photoSrc("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
    expect(photoSrc("  ")).toBe("");
  });
});

describe("formatScoreChange / netChangeTone", () => {
  it("signs the change and treats zero as ±0", () => {
    expect(formatScoreChange(3)).toBe("+3");
    expect(formatScoreChange(-11)).toBe("−11");
    expect(formatScoreChange(0)).toBe("±0");
    expect(formatScoreChange(NaN)).toBe("±0");
  });
  it("maps direction to tone (lower risk is good)", () => {
    expect(netChangeTone(-4)).toBe("good");
    expect(netChangeTone(2)).toBe("bad");
    expect(netChangeTone(0)).toBe("flat");
  });
});

describe("formatVisitDate / levelClass", () => {
  it("formats ISO dates and falls back to In progress", () => {
    expect(formatVisitDate("2026-09-12T10:00:00.000Z")).toMatch(/12 Sep(t)? 2026/);
    expect(formatVisitDate(undefined)).toBe("In progress");
    expect(formatVisitDate("not-a-date")).toBe("In progress");
  });
  it("returns a neutral class for unknown levels", () => {
    expect(levelClass("critical")).toContain("red");
    expect(levelClass("HIGH")).toContain("orange");
    expect(levelClass(undefined)).toContain("zinc");
  });
});

describe("pending zones", () => {
  const base = { improved: 2, same: 1, worse: 0, new: 1, removed: 0, pending: 0, netScoreChange: -9 };

  it("renders the pending delta as a grey 'Not yet assessed' badge", () => {
    expect(DELTA_META.pending.label).toBe("Not yet assessed");
    expect(DELTA_META.pending.className).toContain("zinc");
    expect(DELTA_META.pending.className).not.toContain("amber");
  });

  it("adds a 'Not yet assessed' cell to the summary strip only when something is pending", () => {
    expect(summaryCells(base).map((c) => c.key)).toEqual(["improved", "same", "worse", "new", "removed"]);
    const cells = summaryCells({ ...base, pending: 3 });
    expect(cells.map((c) => c.key)).toEqual(["improved", "same", "worse", "new", "removed", "pending"]);
    expect(cells[5]).toMatchObject({ label: "Not yet assessed", value: 3 });
    expect(cells[5].className).toContain("zinc");
  });

  it("keeps a genuine improvement green while zones are still pending", () => {
    expect(netChangeTone({ ...base, pending: 3 }.netScoreChange)).toBe("good");
  });

  it("explains an empty After column differently for pending vs removed zones", () => {
    expect(missingAfterCopy("pending")).toBe("Not yet assessed on this visit.");
    expect(missingAfterCopy("removed")).toBe("Not surveyed on this visit.");
  });
});
