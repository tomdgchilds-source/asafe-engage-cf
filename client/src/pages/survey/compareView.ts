// ─────────────────────────────────────────────────────────
// compareView — pure presentation helpers for SurveyCompare (Phase 3, Task S7).
// No React, no I/O; unit-tested in compareView.test.ts.
// ─────────────────────────────────────────────────────────
import type { ComparisonSummary, ZoneComparison, ZoneDelta } from "@shared/survey";

/** Payload of GET /api/site-surveys/:id/compare (mirrors worker/routes/siteSurveys.ts CompareResponse). */
export interface CompareVisit {
  id: string;
  title: string;
  /** ISO-8601; absent while the current survey is still in progress. */
  completedAt?: string;
}

export interface CompareResponse {
  previous: CompareVisit & { completedAt: string };
  current: CompareVisit;
  rows: ZoneComparison[];
  summary: ComparisonSummary;
}

/**
 * Resolve a snapshot photo key to an <img> src. Keys are R2 object keys served
 * by GET /api/objects/<key>; legacy surveys may carry full URLs or already-
 * prefixed paths in `photoKeys`, which pass through untouched.
 */
export function photoSrc(key: string): string {
  const k = key.trim();
  if (!k) return "";
  if (/^(https?:|data:|blob:)/i.test(k) || k.startsWith("/")) return k;
  return `/api/objects/${k}`;
}

/** Signed score movement for the delta badge and summary strip. */
export function formatScoreChange(change: number): string {
  if (!Number.isFinite(change) || change === 0) return "±0";
  return change > 0 ? `+${change}` : `−${Math.abs(change)}`;
}

/** Visit date for the header; "In progress" when the visit is not complete. */
export function formatVisitDate(iso?: string | null): string {
  if (!iso) return "In progress";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "In progress";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export const DELTA_META: Record<ZoneDelta, { label: string; className: string }> = {
  improved: { label: "Improved", className: "bg-green-100 text-green-800 border-green-200" },
  same: { label: "Same", className: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  worse: { label: "Worse", className: "bg-red-100 text-red-800 border-red-200" },
  new: { label: "New zone", className: "bg-blue-100 text-blue-800 border-blue-200" },
  removed: { label: "Not revisited", className: "bg-amber-100 text-amber-800 border-amber-200" },
};

/** Risk level chip colours — same palette as the SiteSurvey page. */
export const LEVEL_CLASS: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

export function levelClass(level: string | undefined): string {
  return LEVEL_CLASS[(level ?? "").toLowerCase()] ?? "bg-zinc-100 text-zinc-700";
}

/** Colour the net score change by direction (lower is better). */
export function netChangeTone(change: number): "good" | "bad" | "flat" {
  if (change < 0) return "good";
  if (change > 0) return "bad";
  return "flat";
}
