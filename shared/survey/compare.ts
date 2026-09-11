/**
 * Return-visit comparison — pairs the zones of two SurveySnapshots by name
 * and describes what changed, in the language a consultant would put in the
 * "Since last visit" strip of the proposal.
 *
 * Pairing (conservative, deterministic):
 *   1. Exact match on the normalised zone label (case / whitespace /
 *      punctuation insensitive, via `normaliseCanonical`).
 *   2. For zones still unpaired, a fuzzy match on token overlap (Jaccard)
 *      ≥ FUZZY_THRESHOLD, accepted only when it is the unique best candidate
 *      in BOTH directions. Anything ambiguous falls back to new / removed.
 *
 * Delta (plan wording, encoded exactly):
 *   improved — score dropped by ≥ 2, or the level dropped a band
 *   worse    — score rose, or the level rose a band
 *   same     — otherwise
 *
 * Pure logic: no I/O, no imports from worker or client.
 */

import { normaliseCanonical } from "../nameNormalise";
import { RISK_LEVEL_BANDS, type RiskLevel } from "../risk/riskRegister";
import type { SnapshotArea, SurveySnapshot } from "./snapshot";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A snapshot area, optionally carrying the product the rep recorded as
 * installed on the return visit. `installedProduct` is not part of the
 * frozen SurveySnapshot shape; callers may decorate `after` areas with it.
 */
export type ComparableArea = SnapshotArea & { installedProduct?: string };

export type ComparableSnapshot = Omit<SurveySnapshot, "areas"> & { areas: ComparableArea[] };

export type ZoneDelta = "improved" | "same" | "worse" | "new" | "removed";

export interface ZoneComparison {
  /** Display label: the after-visit zone name when present, else the before name. */
  zone: string;
  before?: ComparableArea;
  after?: ComparableArea;
  delta: ZoneDelta;
  /**
   * after.score − before.score for paired zones; +after.score for new zones;
   * −before.score for removed zones (the change in the site's registered risk).
   */
  scoreChange: number;
  /** Consultant-style sentences; the first always describes the score movement. */
  notes: string[];
}

export interface ComparisonSummary {
  improved: number;
  same: number;
  worse: number;
  new: number;
  removed: number;
  /** Sum of `scoreChange` across all rows. */
  netScoreChange: number;
}

// ---------------------------------------------------------------------------
// Name normalisation and fuzzy scoring
// ---------------------------------------------------------------------------

/** Minimum Jaccard token overlap for a fuzzy pairing. */
export const FUZZY_THRESHOLD = 0.6;

/** Case / whitespace / punctuation-insensitive key for a zone name. */
export function normaliseZoneName(name: string | null | undefined): string {
  return normaliseCanonical(name);
}

function tokens(name: string | null | undefined): Set<string> {
  const key = normaliseZoneName(name);
  return new Set(key ? key.split(" ") : []);
}

/** Jaccard overlap of the normalised tokens of two zone names, 0..1. */
export function zoneTokenOverlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  const union = ta.size + tb.size - shared;
  return union === 0 ? 0 : shared / union;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

interface Labelled {
  area: ComparableArea;
  /** Display label; zoneName, or "zoneName – areaName" when the zone name repeats. */
  label: string;
  key: string;
}

/**
 * Label each area by zone name; where a zone name repeats within a snapshot
 * (several areas confirmed under one zone), disambiguate with the area name.
 */
function labelAreas(areas: readonly ComparableArea[]): Labelled[] {
  const counts = new Map<string, number>();
  for (const a of areas) {
    const k = normaliseZoneName(a.zoneName);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return areas.map((area) => {
    const duplicate = (counts.get(normaliseZoneName(area.zoneName)) ?? 0) > 1;
    const label =
      duplicate && area.areaName && normaliseZoneName(area.areaName) !== normaliseZoneName(area.zoneName)
        ? `${area.zoneName} – ${area.areaName}`
        : area.zoneName;
    return { area, label, key: normaliseZoneName(label) };
  });
}

// ---------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------

interface Pair {
  before?: Labelled;
  after?: Labelled;
}

function pairAreas(before: Labelled[], after: Labelled[]): Pair[] {
  const pairs: Pair[] = [];
  const usedBefore = new Set<number>();
  const usedAfter = new Set<number>();

  // 1. Exact key match (first unused occurrence wins, in snapshot order).
  const afterByKey = new Map<string, number[]>();
  after.forEach((a, idx) => {
    const list = afterByKey.get(a.key) ?? [];
    list.push(idx);
    afterByKey.set(a.key, list);
  });
  before.forEach((b, bi) => {
    if (!b.key) return;
    const candidates = afterByKey.get(b.key) ?? [];
    const ai = candidates.find((i) => !usedAfter.has(i));
    if (ai === undefined) return;
    usedBefore.add(bi);
    usedAfter.add(ai);
    pairs.push({ before: b, after: after[ai] });
  });

  // 2. Fuzzy: mutual unique best above threshold.
  const freeBefore = before.map((_, i) => i).filter((i) => !usedBefore.has(i));
  const freeAfter = after.map((_, i) => i).filter((i) => !usedAfter.has(i));

  const overlap = new Map<string, number>();
  const score = (bi: number, ai: number): number => {
    const k = `${bi}:${ai}`;
    let v = overlap.get(k);
    if (v === undefined) {
      v = zoneTokenOverlap(before[bi].label, after[ai].label);
      overlap.set(k, v);
    }
    return v;
  };

  const best = (
    others: number[],
    scorer: (o: number) => number,
  ): { idx: number; unique: boolean } | null => {
    let bestScore = 0;
    let bestIdx = -1;
    let ties = 0;
    for (const o of others) {
      const s = scorer(o);
      if (s < FUZZY_THRESHOLD) continue;
      if (s > bestScore) {
        bestScore = s;
        bestIdx = o;
        ties = 1;
      } else if (s === bestScore) {
        ties += 1;
      }
    }
    if (bestIdx < 0) return null;
    return { idx: bestIdx, unique: ties === 1 };
  };

  for (const bi of freeBefore) {
    if (usedBefore.has(bi)) continue;
    const b = best(freeAfter.filter((i) => !usedAfter.has(i)), (ai) => score(bi, ai));
    if (!b || !b.unique) continue;
    const a = best(freeBefore.filter((i) => !usedBefore.has(i)), (bj) => score(bj, b.idx));
    if (!a || !a.unique || a.idx !== bi) continue;
    usedBefore.add(bi);
    usedAfter.add(b.idx);
    pairs.push({ before: before[bi], after: after[b.idx] });
  }

  // 3. Leftovers.
  after.forEach((a, ai) => {
    if (!usedAfter.has(ai)) pairs.push({ after: a });
  });
  before.forEach((b, bi) => {
    if (!usedBefore.has(bi)) pairs.push({ before: b });
  });

  return pairs;
}

// ---------------------------------------------------------------------------
// Delta and notes
// ---------------------------------------------------------------------------

const LEVEL_INDEX: Record<RiskLevel, number> = Object.fromEntries(
  RISK_LEVEL_BANDS.map((b, i) => [b.level, i]),
) as Record<RiskLevel, number>;

function levelIndex(level: RiskLevel): number {
  return LEVEL_INDEX[level] ?? 1;
}

function describe(area: ComparableArea): string {
  return `${area.score} (${area.riskLevel})`;
}

function pairedDelta(before: ComparableArea, after: ComparableArea): ZoneDelta {
  const change = after.score - before.score;
  const bandMove = levelIndex(after.riskLevel) - levelIndex(before.riskLevel);
  if (change > 0 || bandMove > 0) return "worse";
  if (change <= -2 || bandMove < 0) return "improved";
  return "same";
}

function pairedNotes(before: ComparableArea, after: ComparableArea, delta: ZoneDelta): string[] {
  const notes: string[] = [];
  const product = after.installedProduct ?? after.recommendedProduct;

  if (delta === "improved") {
    notes.push(
      `Score fell from ${describe(before)} to ${describe(after)}` +
        (product ? ` after ${product} installation.` : "."),
    );
  } else if (delta === "worse") {
    notes.push(`Score rose from ${describe(before)} to ${describe(after)}.`);
    if (after.recommendedProduct) notes.push(`${after.recommendedProduct} is recommended.`);
  } else if (after.score === before.score) {
    notes.push(`Score unchanged at ${describe(after)}.`);
    if (after.recommendedProduct) notes.push(`${after.recommendedProduct} remains recommended.`);
  } else {
    notes.push(
      `Score moved from ${before.score} to ${after.score} and remains at ${after.riskLevel} level.`,
    );
    if (after.recommendedProduct) notes.push(`${after.recommendedProduct} remains recommended.`);
  }

  if (before.condition !== after.condition) {
    notes.push(`Condition changed from ${before.condition} to ${after.condition}.`);
  }
  if (before.priorityRank !== after.priorityRank) {
    notes.push(`Priority rank moved from ${before.priorityRank} to ${after.priorityRank}.`);
  }
  return notes;
}

function newNotes(after: ComparableArea): string[] {
  const notes = [`New zone identified at ${after.riskLevel} level (score ${after.score}).`];
  if (after.recommendedProduct) notes.push(`${after.recommendedProduct} is recommended.`);
  return notes;
}

function removedNotes(before: ComparableArea): string[] {
  return [
    `Zone not surveyed on the return visit; last recorded at ${before.riskLevel} level (score ${before.score}).`,
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compare two snapshots zone by zone.
 *
 * Rows are ordered by the after-snapshot's `priorityRank` (most urgent
 * first), followed by removed zones in the before-snapshot's rank order.
 */
export function compareSnapshots(
  before: ComparableSnapshot,
  after: ComparableSnapshot,
): ZoneComparison[] {
  const pairs = pairAreas(labelAreas(before.areas), labelAreas(after.areas));

  const rows: ZoneComparison[] = pairs.map(({ before: b, after: a }) => {
    if (b && a) {
      const delta = pairedDelta(b.area, a.area);
      return {
        zone: a.label,
        before: b.area,
        after: a.area,
        delta,
        scoreChange: a.area.score - b.area.score,
        notes: pairedNotes(b.area, a.area, delta),
      };
    }
    if (a) {
      return {
        zone: a.label,
        after: a.area,
        delta: "new",
        scoreChange: a.area.score,
        notes: newNotes(a.area),
      };
    }
    const removed = b as Labelled;
    return {
      zone: removed.label,
      before: removed.area,
      delta: "removed",
      scoreChange: -removed.area.score,
      notes: removedNotes(removed.area),
    };
  });

  rows.sort((x, y) => {
    if (x.after && y.after) return x.after.priorityRank - y.after.priorityRank;
    if (x.after) return -1;
    if (y.after) return 1;
    return (x.before as ComparableArea).priorityRank - (y.before as ComparableArea).priorityRank;
  });

  return rows;
}

/** Counts per delta plus the net score change, for the report strip. */
export function summariseComparison(rows: readonly ZoneComparison[]): ComparisonSummary {
  const summary: ComparisonSummary = {
    improved: 0,
    same: 0,
    worse: 0,
    new: 0,
    removed: 0,
    netScoreChange: 0,
  };
  for (const row of rows) {
    summary[row.delta] += 1;
    summary.netScoreChange += row.scoreChange;
  }
  return summary;
}
