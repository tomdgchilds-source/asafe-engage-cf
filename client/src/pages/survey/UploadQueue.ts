// ─────────────────────────────────────────────────────────
// Survey Walk upload queue — pure logic + the single network call.
// (Phase 3, Task S2)
//
// Everything above `uploadQueuedItem` is pure and unit-tested:
// ordering, backoff maths, downscale target size, zone-name defaults.
// The React hook (useUploadQueue.ts) owns state, IndexedDB persistence
// and timers; this module never touches React or the DOM.
// ─────────────────────────────────────────────────────────
import { apiRequest } from "@/lib/queryClient";
import type { SurveyPhotoView } from "./useSurveyPhotos";

// =============================================
// TYPES
// =============================================

export interface QueuedUpload {
  /** Client-side id (uuid) — also the IndexedDB key. */
  id: string;
  surveyId: string;
  blob: Blob;
  mime: string;
  zoneName: string;
  lat?: number;
  lng?: number;
  width: number;
  height: number;
  /** ISO 8601 with offset — what the server's `takenAt` validator expects. */
  takenAt: string;
  voiceNote?: string;
  /** Epoch ms; FIFO order key. */
  createdAt: number;
  /** Failed attempts so far. */
  attempts: number;
  /** Epoch ms; the item is not tried again before this. */
  nextAttemptAt: number;
  lastError?: string;
  /** Non-retryable failure (4xx). Stays in the queue until the rep taps retry. */
  stuck?: boolean;
}

export type NewUpload = Omit<QueuedUpload, "id" | "createdAt" | "attempts" | "nextAttemptAt" | "lastError" | "stuck">;

// =============================================
// CONSTANTS
// =============================================

/** Long-edge cap for on-device downscaling (matches the vision service's ~1,500-token budget). */
export const MAX_LONG_EDGE = 1280;
export const JPEG_QUALITY = 0.82;
export const JPEG_MIME = "image/jpeg";

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 60_000;

// =============================================
// PURE: BACKOFF + ORDERING
// =============================================

/**
 * Exponential backoff after `failures` consecutive failed attempts:
 * 2 s, 4 s, 8 s, 16 s, 32 s, then capped at 60 s. Zero failures → no delay.
 */
export function backoffDelayMs(failures: number, base = BACKOFF_BASE_MS, max = BACKOFF_MAX_MS): number {
  if (!Number.isFinite(failures) || failures <= 0) return 0;
  const exp = Math.min(failures - 1, 30); // guard against 2**huge
  return Math.min(base * 2 ** exp, max);
}

/** FIFO by createdAt, tie-broken by id so ordering is deterministic. */
export function orderQueue<T extends { createdAt: number; id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The next item eligible to upload right now (oldest first), or null. */
export function nextDue<T extends QueuedUpload>(items: readonly T[], now: number): T | null {
  for (const item of orderQueue(items)) {
    if (item.stuck) continue;
    if (item.nextAttemptAt <= now) return item;
  }
  return null;
}

/** Earliest future retry time among retryable items, or null when nothing is waiting. */
export function earliestRetryAt(items: readonly QueuedUpload[], now: number): number | null {
  let best: number | null = null;
  for (const item of items) {
    if (item.stuck) continue;
    if (item.nextAttemptAt > now && (best === null || item.nextAttemptAt < best)) best = item.nextAttemptAt;
  }
  return best;
}

/**
 * Network errors (no status), 408/425/429 and every 5xx are worth retrying.
 * Any other 4xx (400 bad payload, 401, 403, 404 survey gone, 413 too big)
 * will not fix itself — the item is parked as `stuck` for a manual retry.
 */
export function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true;
  if (status === 408 || status === 425 || status === 429) return true;
  return status >= 500;
}

export function statusOfError(err: unknown): number | undefined {
  if (err && typeof err === "object" && typeof (err as { status?: unknown }).status === "number") {
    return (err as { status: number }).status;
  }
  if (err instanceof Error) {
    const m = /^(\d{3}):/.exec(err.message);
    if (m) return Number(m[1]);
  }
  return undefined;
}

export function markFailed<T extends QueuedUpload>(item: T, err: unknown, now: number): T {
  const attempts = item.attempts + 1;
  const status = statusOfError(err);
  const retryable = isRetryableStatus(status);
  const message = err instanceof Error ? err.message : String(err);
  return {
    ...item,
    attempts,
    stuck: !retryable,
    lastError: message.slice(0, 300),
    nextAttemptAt: retryable ? now + backoffDelayMs(attempts) : Number.MAX_SAFE_INTEGER,
  };
}

export function resetForRetry<T extends QueuedUpload>(item: T, now: number): T {
  return { ...item, attempts: 0, stuck: false, lastError: undefined, nextAttemptAt: now };
}

// =============================================
// PURE: IMAGE TARGET SIZE
// =============================================

export interface DownscaleTarget {
  width: number;
  height: number;
  scale: number;
}

/**
 * Target dimensions so the long edge is ≤ `maxEdge`, preserving aspect
 * ratio and never upscaling. Both edges are rounded to whole pixels and
 * clamped to ≥ 1 so a canvas can always be created.
 */
export function downscaleTarget(width: number, height: number, maxEdge = MAX_LONG_EDGE): DownscaleTarget {
  const w = Math.max(1, Math.floor(width || 1));
  const h = Math.max(1, Math.floor(height || 1));
  const longEdge = Math.max(w, h);
  if (longEdge <= maxEdge) return { width: w, height: h, scale: 1 };
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
    scale,
  };
}

// =============================================
// PURE: ZONE NAMES
// =============================================

export const ZONE_NAME_MAX = 200;

/** Trim, collapse whitespace, cap at the server's 200-char limit; fall back when empty. */
export function normaliseZoneName(raw: string | null | undefined, fallback: string): string {
  const cleaned = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, ZONE_NAME_MAX);
  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * Next unused "Zone N". Scans existing names for the `Zone <n>` pattern and
 * returns one past the highest number seen (so renaming Zone 2 to "Loading
 * bay" still yields Zone 3 next, not a confusing second "Zone 2").
 */
export function defaultZoneName(existing: Iterable<string>): string {
  let highest = 0;
  for (const name of existing) {
    const m = /^\s*zone\s+(\d{1,4})\s*$/i.exec(name ?? "");
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return `Zone ${highest + 1}`;
}

/** Unique zone names in first-seen order (case-sensitive, blanks dropped). */
export function uniqueZones(names: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const v = (n ?? "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

// =============================================
// NETWORK
// =============================================

export interface UploadBody {
  bytesBase64: string;
  mime: string;
  zoneName: string;
  lat?: number;
  lng?: number;
  width: number;
  height: number;
  takenAt: string;
}

export function buildUploadBody(item: QueuedUpload, bytesBase64: string): UploadBody {
  const body: UploadBody = {
    bytesBase64,
    mime: item.mime,
    zoneName: item.zoneName,
    width: item.width,
    height: item.height,
    takenAt: item.takenAt,
  };
  if (typeof item.lat === "number" && Number.isFinite(item.lat)) body.lat = item.lat;
  if (typeof item.lng === "number" && Number.isFinite(item.lng)) body.lng = item.lng;
  return body;
}

/** Blob → raw base64 (no data: prefix). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read photo"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

export type RequestFn = (url: string, method: string, data?: unknown) => Promise<Response>;

/**
 * POST one queued photo. Throws on failure (the caller decides retry vs
 * stuck via `markFailed`). A voice note rides along in a follow-up PATCH
 * — the upload route does not accept it — and a PATCH failure is logged
 * but not thrown, because the photo itself is already safely stored.
 */
export async function uploadQueuedItem(item: QueuedUpload, request: RequestFn = apiRequest): Promise<SurveyPhotoView> {
  const bytesBase64 = await blobToBase64(item.blob);
  const res = await request(`/api/site-surveys/${encodeURIComponent(item.surveyId)}/photos`, "POST", buildUploadBody(item, bytesBase64));
  let photo = (await res.json()) as SurveyPhotoView;

  const note = item.voiceNote?.trim();
  if (note) {
    try {
      const patched = await request(`/api/survey-photos/${encodeURIComponent(photo.id)}`, "PATCH", { voiceNote: note.slice(0, 4000) });
      photo = (await patched.json()) as SurveyPhotoView;
    } catch (err) {
      console.warn("[survey-walk] voice note PATCH failed; photo kept:", err);
    }
  }
  return photo;
}
