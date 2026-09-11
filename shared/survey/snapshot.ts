/**
 * Survey snapshot — the frozen record of a completed survey, written to
 * `site_surveys.snapshot` (jsonb) on completion so a return visit can be
 * compared against it (see ./compare.ts).
 *
 * Shape is exactly as specified in
 * docs/superpowers/plans/2026-09-11-engage-phase3-survey-flagship.md (Task S7).
 *
 * Pure logic: no I/O, no imports from worker or client. Input types are
 * structural mirrors of the Drizzle rows (`siteSurveys`, `siteSurveyAreas`
 * with the Task S0 risk columns, `surveyPhotos`) so callers can pass the
 * rows straight through; every column the builder does not read is optional.
 */

import { rankAreas, riskLevel, RISK_LEVEL_BANDS, type RiskLevel } from "../risk/riskRegister";

// ---------------------------------------------------------------------------
// Output shape (plan: SurveySnapshot)
// ---------------------------------------------------------------------------

export interface SnapshotArea {
  zoneName: string;
  areaName: string;
  areaType: string;
  riskLevel: RiskLevel;
  /** likelihood × severity, 1..25 */
  score: number;
  /** 1 = most urgent within the survey. */
  priorityRank: number;
  /** good | damaged | critical | unprotected (stored as entered). */
  condition: string;
  recommendedProduct?: string;
  /** R2 object keys for the area's photos (legacy URL strings when no linked photos exist). */
  photoKeys: string[];
  observation: string;
}

export interface SurveySnapshot {
  surveyId: string;
  /** ISO-8601 timestamp of completion. */
  completedAt: string;
  /** Ordered by priorityRank ascending. */
  areas: SnapshotArea[];
}

// ---------------------------------------------------------------------------
// Input shapes (structural mirrors of the DB rows)
// ---------------------------------------------------------------------------

export interface SnapshotSurveyRow {
  id: string;
}

export interface SnapshotAreaRow {
  id: string;
  zoneName: string;
  areaName: string;
  areaType: string;
  currentCondition: string;
  riskLevel: string;
  // Task S0 risk columns (optional so pre-migration rows still snapshot).
  riskScore?: number | null;
  likelihood?: number | null;
  severity?: number | null;
  priorityRank?: number | null;
  aiObservation?: string | null;
  // Existing columns the builder reads as fallbacks.
  issueDescription?: string | null;
  description?: string | null;
  recommendedProducts?: unknown;
  photosUrls?: unknown;
}

export interface SnapshotPhotoRow {
  objectKey: string;
  areaId?: string | null;
  takenAt?: Date | string | null;
  createdAt?: Date | string | null;
}

export interface BuildSnapshotOptions {
  /** Defaults to now. */
  completedAt?: Date | string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_LEVELS: ReadonlySet<string> = new Set(RISK_LEVEL_BANDS.map((b) => b.level));

/**
 * Representative score for an area that predates the risk register and only
 * carries a level: the top of the band, so legacy critical zones still sort
 * above freshly scored high zones.
 */
const LEVEL_FALLBACK_SCORE: Record<RiskLevel, number> = {
  low: 4,
  medium: 9,
  high: 15,
  critical: 20,
};

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function toIso(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toISOString();
  }
  return new Date().toISOString();
}

function toMillis(value: Date | string | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  }
  return Number.POSITIVE_INFINITY;
}

/** Resolve the area's score: riskScore → likelihood × severity → level fallback. */
export function resolveAreaScore(area: SnapshotAreaRow): number {
  if (isFiniteNumber(area.riskScore)) return area.riskScore;
  if (isFiniteNumber(area.likelihood) && isFiniteNumber(area.severity)) {
    return area.likelihood * area.severity;
  }
  const level = normaliseLevel(area.riskLevel);
  return LEVEL_FALLBACK_SCORE[level ?? "medium"];
}

function normaliseLevel(value: string | null | undefined): RiskLevel | null {
  const v = (value ?? "").trim().toLowerCase();
  return VALID_LEVELS.has(v) ? (v as RiskLevel) : null;
}

/** Resolve the area's level: the stored column when valid, else derived from the score. */
export function resolveAreaLevel(area: SnapshotAreaRow, score: number): RiskLevel {
  return normaliseLevel(area.riskLevel) ?? riskLevel(score);
}

/**
 * First recommended product name from the `recommended_products` jsonb.
 * Accepts `string[]` or `Array<{ productName?: string; name?: string }>`.
 */
export function resolveRecommendedProduct(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim()) return entry.trim();
    if (entry && typeof entry === "object") {
      const rec = entry as Record<string, unknown>;
      const name = rec.productName ?? rec.name;
      if (typeof name === "string" && name.trim()) return name.trim();
    }
  }
  return undefined;
}

function legacyPhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function resolveObservation(area: SnapshotAreaRow): string {
  for (const candidate of [area.aiObservation, area.issueDescription, area.description]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Produce the frozen snapshot for a survey.
 *
 * - Areas are ordered by `priorityRank` ascending. If any area lacks a rank,
 *   ranks are recomputed for all areas with `rankAreas` from the risk
 *   register (score desc, severity desc, name asc, id asc).
 * - `photoKeys` are the `objectKey`s of `survey_photos` rows whose `areaId`
 *   matches, ordered by `takenAt` then `createdAt` then key. Areas with no
 *   linked photos fall back to string entries of the legacy `photosUrls`.
 * - The result shares no references with the inputs and is JSON-safe.
 */
export function buildSnapshot(
  survey: SnapshotSurveyRow,
  areas: readonly SnapshotAreaRow[],
  photos: readonly SnapshotPhotoRow[],
  options: BuildSnapshotOptions = {},
): SurveySnapshot {
  // Photos grouped by area, in capture order.
  const photosByArea = new Map<string, SnapshotPhotoRow[]>();
  for (const p of photos) {
    if (!p.areaId || !p.objectKey) continue;
    const list = photosByArea.get(p.areaId) ?? [];
    list.push(p);
    photosByArea.set(p.areaId, list);
  }
  for (const list of photosByArea.values()) {
    list.sort((a, b) => {
      const byTaken = toMillis(a.takenAt) - toMillis(b.takenAt);
      if (byTaken !== 0 && !Number.isNaN(byTaken)) return byTaken;
      const byCreated = toMillis(a.createdAt) - toMillis(b.createdAt);
      if (byCreated !== 0 && !Number.isNaN(byCreated)) return byCreated;
      return a.objectKey.localeCompare(b.objectKey, "en");
    });
  }

  // Scores first, so ranking (when needed) uses the same numbers we freeze.
  const scored = areas.map((row) => {
    const score = resolveAreaScore(row);
    return {
      id: row.id,
      row,
      score,
      level: resolveAreaLevel(row, score),
      severity: isFiniteNumber(row.severity) ? row.severity : null,
      name: `${row.zoneName} ${row.areaName}`,
    };
  });

  const everyRanked = scored.every((s) => isFiniteNumber(s.row.priorityRank));
  const ranked = everyRanked
    ? scored.map((s) => ({ ...s, priorityRank: s.row.priorityRank as number }))
    : rankAreas(scored);

  ranked.sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    return a.id.localeCompare(b.id, "en");
  });

  const snapshotAreas: SnapshotArea[] = ranked.map(({ row, score, level, priorityRank }) => {
    const linked = photosByArea.get(row.id)?.map((p) => p.objectKey) ?? [];
    const photoKeys = linked.length > 0 ? linked : legacyPhotoUrls(row.photosUrls);
    const recommendedProduct = resolveRecommendedProduct(row.recommendedProducts);
    const area: SnapshotArea = {
      zoneName: row.zoneName,
      areaName: row.areaName,
      areaType: row.areaType,
      riskLevel: level,
      score,
      priorityRank,
      condition: row.currentCondition,
      photoKeys: [...photoKeys],
      observation: resolveObservation(row),
    };
    if (recommendedProduct !== undefined) area.recommendedProduct = recommendedProduct;
    return area;
  });

  return {
    surveyId: survey.id,
    completedAt: toIso(options.completedAt),
    areas: snapshotAreas,
  };
}
