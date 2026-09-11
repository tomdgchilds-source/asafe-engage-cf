import { describe, it, expect } from "vitest";
import {
  clampImpactAngle,
  hasDataUrls,
  isDataUrl,
  parseDataUrl,
  surveyPhotoKey,
  MIN_IMPACT_ANGLE,
  MAX_IMPACT_ANGLE,
} from "./siteSurveys";

// 1x1 transparent PNG, base64.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG_DATA_URL = `data:image/png;base64,${PNG_B64}`;
const JPEG_DATA_URL = `data:image/jpeg;base64,${btoa("\xff\xd8\xff\xe0jpegbytes")}`;

describe("clampImpactAngle", () => {
  it("treats 0, undefined, null, empty and non-numeric as head-on (90)", () => {
    expect(clampImpactAngle(0)).toBe(90);
    expect(clampImpactAngle("0")).toBe(90);
    expect(clampImpactAngle(undefined)).toBe(90);
    expect(clampImpactAngle(null)).toBe(90);
    expect(clampImpactAngle("")).toBe(90);
    expect(clampImpactAngle("abc")).toBe(90);
    expect(clampImpactAngle(NaN)).toBe(90);
  });

  it("passes through values already inside [5, 90]", () => {
    expect(clampImpactAngle(5)).toBe(5);
    expect(clampImpactAngle(45)).toBe(45);
    expect(clampImpactAngle("30.5")).toBe(30.5);
    expect(clampImpactAngle(90)).toBe(90);
  });

  it("clamps out-of-range values to the [5, 90] bounds", () => {
    expect(clampImpactAngle(1)).toBe(MIN_IMPACT_ANGLE);
    expect(clampImpactAngle(4.99)).toBe(MIN_IMPACT_ANGLE);
    expect(clampImpactAngle(-30)).toBe(MIN_IMPACT_ANGLE);
    expect(clampImpactAngle(91)).toBe(MAX_IMPACT_ANGLE);
    expect(clampImpactAngle(180)).toBe(MAX_IMPACT_ANGLE);
    expect(clampImpactAngle("500")).toBe(MAX_IMPACT_ANGLE);
  });
});

describe("isDataUrl", () => {
  it("recognises base64 data URLs", () => {
    expect(isDataUrl(PNG_DATA_URL)).toBe(true);
    expect(isDataUrl(JPEG_DATA_URL)).toBe(true);
    expect(isDataUrl("DATA:IMAGE/JPEG;BASE64,AAAA")).toBe(true);
  });

  it("rejects hosted URLs, non-base64 data URLs and non-strings", () => {
    expect(isDataUrl("/api/objects/uploads/abc.jpg")).toBe(false);
    expect(isDataUrl("https://example.com/photo.jpg")).toBe(false);
    expect(isDataUrl("data:text/plain,hello")).toBe(false);
    expect(isDataUrl(null)).toBe(false);
    expect(isDataUrl(undefined)).toBe(false);
    expect(isDataUrl(42)).toBe(false);
    expect(isDataUrl({ url: PNG_DATA_URL })).toBe(false);
  });
});

describe("hasDataUrls", () => {
  it("is true only for arrays containing at least one data URL", () => {
    expect(hasDataUrls([PNG_DATA_URL])).toBe(true);
    expect(hasDataUrls(["/api/objects/a.jpg", JPEG_DATA_URL])).toBe(true);
    expect(hasDataUrls(["/api/objects/a.jpg", "https://x/y.png"])).toBe(false);
    expect(hasDataUrls([])).toBe(false);
    expect(hasDataUrls(undefined)).toBe(false);
    expect(hasDataUrls(null)).toBe(false);
    expect(hasDataUrls(PNG_DATA_URL)).toBe(false); // a bare string is not a list
  });
});

describe("parseDataUrl", () => {
  it("decodes a PNG data URL into bytes with the right content type and extension", () => {
    const parsed = parseDataUrl(PNG_DATA_URL);
    expect(parsed).not.toBeNull();
    expect(parsed!.contentType).toBe("image/png");
    expect(parsed!.extension).toBe("png");
    // PNG magic number
    expect(Array.from(parsed!.bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(parsed!.bytes.length).toBe(atob(PNG_B64).length);
  });

  it("maps image/jpeg to .jpg and lower-cases the mime type", () => {
    const parsed = parseDataUrl(JPEG_DATA_URL.replace("image/jpeg", "IMAGE/JPEG"));
    expect(parsed!.contentType).toBe("image/jpeg");
    expect(parsed!.extension).toBe("jpg");
    expect(Array.from(parsed!.bytes.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
  });

  it("falls back to .jpg for unknown image types", () => {
    const parsed = parseDataUrl(`data:image/x-unknown;base64,${btoa("abc")}`);
    expect(parsed!.extension).toBe("jpg");
    expect(new TextDecoder().decode(parsed!.bytes)).toBe("abc");
  });

  it("tolerates whitespace/newlines inside the base64 payload", () => {
    const wrapped = `data:image/png;base64,${PNG_B64.slice(0, 20)}\n${PNG_B64.slice(20)}`;
    expect(parseDataUrl(wrapped)!.bytes.length).toBe(atob(PNG_B64).length);
  });

  it("returns null for non-data URLs and malformed base64", () => {
    expect(parseDataUrl("/api/objects/uploads/abc.jpg")).toBeNull();
    expect(parseDataUrl("data:text/plain,hello")).toBeNull();
    expect(parseDataUrl("data:image/png;base64,***not-base64***")).toBeNull();
  });
});

describe("surveyPhotoKey", () => {
  it("builds survey-photos/<areaId>/<uuid>.<ext>", () => {
    expect(surveyPhotoKey("area-1", "jpg", "uuid-x")).toBe("survey-photos/area-1/uuid-x.jpg");
    expect(surveyPhotoKey("area-1", "png", "uuid-y")).toBe("survey-photos/area-1/uuid-y.png");
  });

  it("defaults to .jpg and a fresh uuid per call", () => {
    const a = surveyPhotoKey("area-2");
    const b = surveyPhotoKey("area-2");
    expect(a).toMatch(/^survey-photos\/area-2\/[0-9a-f-]{36}\.jpg$/);
    expect(a).not.toBe(b);
  });
});
