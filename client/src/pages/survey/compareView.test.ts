import { describe, it, expect } from "vitest";
import { formatScoreChange, formatVisitDate, levelClass, netChangeTone, photoSrc } from "./compareView";

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
