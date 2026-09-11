import { describe, expect, it } from "vitest";
import {
  backoffDelayMs,
  buildUploadBody,
  defaultZoneName,
  downscaleTarget,
  earliestRetryAt,
  isRetryableStatus,
  markFailed,
  nextDue,
  normaliseZoneName,
  orderQueue,
  resetForRetry,
  uniqueZones,
  type QueuedUpload,
} from "./UploadQueue";

function item(over: Partial<QueuedUpload> & { id: string }): QueuedUpload {
  return {
    surveyId: "s1",
    blob: new Blob(["x"], { type: "image/jpeg" }),
    mime: "image/jpeg",
    zoneName: "Zone 1",
    width: 100,
    height: 50,
    takenAt: "2026-09-11T10:00:00.000Z",
    createdAt: 1000,
    attempts: 0,
    nextAttemptAt: 0,
    ...over,
  };
}

describe("backoffDelayMs", () => {
  it("doubles from 2 s and caps at 60 s", () => {
    expect(backoffDelayMs(0)).toBe(0);
    expect(backoffDelayMs(1)).toBe(2_000);
    expect(backoffDelayMs(2)).toBe(4_000);
    expect(backoffDelayMs(3)).toBe(8_000);
    expect(backoffDelayMs(5)).toBe(32_000);
    expect(backoffDelayMs(6)).toBe(60_000);
    expect(backoffDelayMs(50)).toBe(60_000);
  });
  it("tolerates garbage input", () => {
    expect(backoffDelayMs(-3)).toBe(0);
    expect(backoffDelayMs(Number.NaN)).toBe(0);
  });
});

describe("queue ordering", () => {
  it("orders FIFO by createdAt with id tie-break and does not mutate", () => {
    const list = [item({ id: "b", createdAt: 2 }), item({ id: "a", createdAt: 2 }), item({ id: "c", createdAt: 1 })];
    const ordered = orderQueue(list);
    expect(ordered.map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(list.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("nextDue skips stuck and not-yet-due items", () => {
    const list = [
      item({ id: "stuck", createdAt: 1, stuck: true }),
      item({ id: "later", createdAt: 2, nextAttemptAt: 5_000 }),
      item({ id: "ready", createdAt: 3, nextAttemptAt: 1_000 }),
    ];
    expect(nextDue(list, 1_000)?.id).toBe("ready");
    expect(nextDue(list, 999)).toBeNull();
    expect(nextDue(list, 6_000)?.id).toBe("later");
  });

  it("earliestRetryAt reports the soonest future attempt", () => {
    const list = [
      item({ id: "a", nextAttemptAt: 9_000 }),
      item({ id: "b", nextAttemptAt: 4_000 }),
      item({ id: "c", nextAttemptAt: 100, stuck: true }),
    ];
    expect(earliestRetryAt(list, 1_000)).toBe(4_000);
    expect(earliestRetryAt(list, 10_000)).toBeNull();
    expect(earliestRetryAt([], 0)).toBeNull();
  });
});

describe("failure handling", () => {
  it("classifies retryable statuses", () => {
    expect(isRetryableStatus(undefined)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(413)).toBe(false);
  });

  it("markFailed schedules exponential retries for transient errors", () => {
    const first = markFailed(item({ id: "x" }), new TypeError("Failed to fetch"), 10_000);
    expect(first.attempts).toBe(1);
    expect(first.stuck).toBe(false);
    expect(first.nextAttemptAt).toBe(12_000);
    const second = markFailed(first, Object.assign(new Error("503: down"), { status: 503 }), 20_000);
    expect(second.attempts).toBe(2);
    expect(second.nextAttemptAt).toBe(24_000);
    expect(second.lastError).toContain("503");
  });

  it("markFailed parks 4xx as stuck and resetForRetry clears it", () => {
    const stuck = markFailed(item({ id: "x" }), new Error("413: Photo exceeds"), 10_000);
    expect(stuck.stuck).toBe(true);
    expect(nextDue([stuck], Number.MAX_SAFE_INTEGER)).toBeNull();
    const reset = resetForRetry(stuck, 50_000);
    expect(reset.stuck).toBe(false);
    expect(reset.attempts).toBe(0);
    expect(reset.lastError).toBeUndefined();
    expect(nextDue([reset], 50_000)?.id).toBe("x");
  });
});

describe("downscaleTarget", () => {
  it("leaves small images alone", () => {
    expect(downscaleTarget(800, 600)).toEqual({ width: 800, height: 600, scale: 1 });
    expect(downscaleTarget(1280, 720)).toEqual({ width: 1280, height: 720, scale: 1 });
  });
  it("caps the long edge at 1280 in either orientation", () => {
    expect(downscaleTarget(4032, 3024)).toEqual({ width: 1280, height: 960, scale: 1280 / 4032 });
    const portrait = downscaleTarget(3024, 4032);
    expect(portrait.height).toBe(1280);
    expect(portrait.width).toBe(960);
  });
  it("rounds to whole pixels and never yields zero", () => {
    const t = downscaleTarget(5000, 1);
    expect(t.width).toBe(1280);
    expect(t.height).toBe(1);
    expect(downscaleTarget(0, 0)).toEqual({ width: 1, height: 1, scale: 1 });
  });
  it("honours a custom max edge", () => {
    expect(downscaleTarget(2000, 1000, 500)).toEqual({ width: 500, height: 250, scale: 0.25 });
  });
});

describe("zone names", () => {
  it("defaults to Zone 1 when nothing exists", () => {
    expect(defaultZoneName([])).toBe("Zone 1");
  });
  it("continues past the highest numbered zone, ignoring renamed zones", () => {
    expect(defaultZoneName(["Zone 1", "Loading bay", "zone 3"])).toBe("Zone 4");
    expect(defaultZoneName(["Zone 12", "Zone 2"])).toBe("Zone 13");
    expect(defaultZoneName(["Zone A", "Zone"])).toBe("Zone 1");
  });
  it("normalises whitespace and falls back when blank", () => {
    expect(normaliseZoneName("  Dock   3 ", "Zone 1")).toBe("Dock 3");
    expect(normaliseZoneName("   ", "Zone 1")).toBe("Zone 1");
    expect(normaliseZoneName(undefined, "Zone 2")).toBe("Zone 2");
    expect(normaliseZoneName("x".repeat(500), "Zone 1")).toHaveLength(200);
  });
  it("uniqueZones keeps first-seen order and drops blanks", () => {
    expect(uniqueZones(["Zone 1", null, "Dock", "Zone 1", "", "Dock "])).toEqual(["Zone 1", "Dock"]);
  });
});

describe("buildUploadBody", () => {
  it("includes only finite coordinates", () => {
    const withGps = buildUploadBody(item({ id: "a", lat: 25.2, lng: 55.3 }), "QUJD");
    expect(withGps).toEqual({
      bytesBase64: "QUJD",
      mime: "image/jpeg",
      zoneName: "Zone 1",
      width: 100,
      height: 50,
      takenAt: "2026-09-11T10:00:00.000Z",
      lat: 25.2,
      lng: 55.3,
    });
    const noGps = buildUploadBody(item({ id: "b", lat: Number.NaN }), "QUJD");
    expect("lat" in noGps).toBe(false);
    expect("lng" in noGps).toBe(false);
  });
});
