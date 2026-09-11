/**
 * Risk register — deterministic 5×5 likelihood × severity assessment for a
 * survey zone, plus ranking and the matrix legend.
 *
 * Rules are encoded exactly as written in
 * docs/superpowers/plans/2026-09-11-engage-phase3-survey-flagship.md (Task S4).
 * Every rule that fires contributes one plain-English sentence to `rationale`
 * so the proposal document can print the reasoning under each zone.
 *
 * Pure logic: no I/O, no imports from worker or client.
 */

export type VehicleClass = "T1" | "T2" | "T3" | "T4";
export type TrafficDensity = "low" | "medium" | "high";
export type PedestrianExposure = "none" | "occasional" | "frequent" | "constant";
export type ExistingProtection = "none" | "partial" | "adequate";
export type CurrentCondition = "good" | "damaged" | "critical" | "unprotected";
export type HazardSeverity = "low" | "medium" | "high" | "critical";
export type AssetCriticality = "low" | "medium" | "high";

export interface RiskInputs {
  /** PAS 13 vehicle class from mass; null when no vehicle data is available. */
  vehicleClass: VehicleClass | null;
  trafficDensity: TrafficDensity;
  pedestrianExposure: PedestrianExposure;
  existingProtection: ExistingProtection;
  currentCondition: CurrentCondition;
  hazardSeverities: HazardSeverity[];
  /** Racking full of stock, machinery, a structural column. */
  assetCriticality?: AssetCriticality;
}

export type RiskRating = 1 | 2 | 3 | 4 | 5;
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskOutput {
  likelihood: RiskRating;
  severity: RiskRating;
  /** likelihood × severity, 1..25 */
  score: number;
  level: RiskLevel;
  /** One sentence per rule that fired, in the order the rules were applied. */
  rationale: string[];
}

// ---------------------------------------------------------------------------
// Descriptors and legend
// ---------------------------------------------------------------------------

/** Index 0 is rating 1. */
export const LIKELIHOOD_DESCRIPTORS = [
  "Rare",
  "Unlikely",
  "Possible",
  "Likely",
  "Almost certain",
] as const;

/** Index 0 is rating 1. */
export const SEVERITY_DESCRIPTORS = [
  "Negligible",
  "Minor",
  "Moderate",
  "Major",
  "Catastrophic",
] as const;

export interface RiskLevelBand {
  level: RiskLevel;
  /** Inclusive score bounds. */
  min: number;
  max: number;
  /** Display label for the legend, e.g. "High". */
  label: string;
  /** Display range for the legend, e.g. "10–15". */
  range: string;
  /** Action timescale printed in the register: Immediate / 30 days / 90 days / Planned. */
  actionTimescale: "Immediate" | "30 days" | "90 days" | "Planned";
  /** One-line meaning for the legend. */
  description: string;
}

/** Ordered ascending; bands are contiguous over 1..25. */
export const RISK_LEVEL_BANDS: readonly RiskLevelBand[] = [
  {
    level: "low",
    min: 1,
    max: 4,
    label: "Low",
    range: "1–4",
    actionTimescale: "Planned",
    description: "Acceptable with routine controls. Include in the planned programme.",
  },
  {
    level: "medium",
    min: 5,
    max: 9,
    label: "Medium",
    range: "5–9",
    actionTimescale: "90 days",
    description: "Tolerable only with additional controls. Act within 90 days.",
  },
  {
    level: "high",
    min: 10,
    max: 15,
    label: "High",
    range: "10–15",
    actionTimescale: "30 days",
    description: "Substantial risk. Act within 30 days and restrict exposure meanwhile.",
  },
  {
    level: "critical",
    min: 16,
    max: 25,
    label: "Critical",
    range: "16–25",
    actionTimescale: "Immediate",
    description: "Intolerable. Take immediate action to protect people and assets.",
  },
] as const;

/** Clamp any number to an integer rating 1..5 (rounds to nearest). */
export function clampRating(n: number): RiskRating {
  const r = Math.round(n);
  if (r < 1) return 1;
  if (r > 5) return 5;
  return r as RiskRating;
}

export function describeLikelihood(n: number): string {
  return LIKELIHOOD_DESCRIPTORS[clampRating(n) - 1];
}

export function describeSeverity(n: number): string {
  return SEVERITY_DESCRIPTORS[clampRating(n) - 1];
}

/** Level from score: ≤4 low, 5–9 medium, 10–15 high, ≥16 critical. */
export function riskLevel(score: number): RiskLevel {
  if (score <= 4) return "low";
  if (score <= 9) return "medium";
  if (score <= 15) return "high";
  return "critical";
}

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

const LIKELIHOOD_BASE: Record<TrafficDensity, RiskRating> = {
  low: 2,
  medium: 3,
  high: 4,
};

const SEVERITY_BASE: Record<PedestrianExposure, RiskRating> = {
  none: 2,
  occasional: 3,
  frequent: 4,
  constant: 5,
};

const TRAFFIC_LABEL: Record<TrafficDensity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const PEDESTRIAN_LABEL: Record<PedestrianExposure, string> = {
  none: "No",
  occasional: "Occasional",
  frequent: "Frequent",
  constant: "Constant",
};

export function assessRisk(i: RiskInputs): RiskOutput {
  const rationale: string[] = [];

  // --- Likelihood -----------------------------------------------------------
  let likelihood: number = LIKELIHOOD_BASE[i.trafficDensity];
  rationale.push(
    `${TRAFFIC_LABEL[i.trafficDensity]} traffic density sets likelihood to ${likelihood}.`,
  );

  if (i.vehicleClass === "T3" || i.vehicleClass === "T4") {
    likelihood += 1;
    rationale.push(`Heavy vehicle class ${i.vehicleClass} raises likelihood by 1.`);
  }

  if (i.existingProtection === "none" && i.currentCondition === "unprotected") {
    likelihood += 1;
    rationale.push("No existing protection and an unprotected condition raise likelihood by 1.");
  }

  if (i.existingProtection === "adequate" && i.currentCondition === "good") {
    likelihood -= 1;
    rationale.push("Adequate existing protection in good condition lowers likelihood by 1.");
  }

  const likelihoodClamped = clampRating(likelihood);
  if (likelihoodClamped !== likelihood) {
    rationale.push(
      likelihood > 5
        ? `Likelihood of ${likelihood} is capped at 5.`
        : `Likelihood of ${likelihood} is held at the minimum of 1.`,
    );
  }

  // --- Severity -------------------------------------------------------------
  let severity: number = SEVERITY_BASE[i.pedestrianExposure];
  rationale.push(
    `${PEDESTRIAN_LABEL[i.pedestrianExposure]} pedestrian exposure sets severity to ${severity}.`,
  );

  if (i.hazardSeverities.includes("critical")) {
    severity += 1;
    rationale.push("A critical hazard raises severity by 1.");
  }

  if (i.assetCriticality === "high") {
    severity += 1;
    rationale.push("High asset criticality raises severity by 1.");
  }

  if (i.vehicleClass === "T1" && i.pedestrianExposure === "none") {
    severity -= 1;
    rationale.push("A light vehicle class T1 with no pedestrian exposure lowers severity by 1.");
  }

  const severityClamped = clampRating(severity);
  if (severityClamped !== severity) {
    rationale.push(
      severity > 5
        ? `Severity of ${severity} is capped at 5.`
        : `Severity of ${severity} is held at the minimum of 1.`,
    );
  }

  // --- Score and level ------------------------------------------------------
  const score = likelihoodClamped * severityClamped;
  const level = riskLevel(score);
  rationale.push(
    `A score of ${score} (${likelihoodClamped} × ${severityClamped}) places the zone at ${level} level.`,
  );

  return {
    likelihood: likelihoodClamped,
    severity: severityClamped,
    score,
    level,
    rationale,
  };
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

export interface RankableArea {
  id: string;
  score: number;
  /** Used to break score ties; areas without it tie at 0. */
  severity?: number | null;
  /** Used to break severity ties; areas without it tie as "". */
  name?: string | null;
}

/**
 * Rank areas by urgency: score descending, then severity descending, then
 * area name ascending, then id ascending so the order is always deterministic.
 * Ranks are 1..n with 1 the most urgent. Returns a new array; the input and
 * its elements are not mutated.
 */
export function rankAreas<T extends RankableArea>(areas: T[]): Array<T & { priorityRank: number }> {
  const sorted = [...areas].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const sa = a.severity ?? 0;
    const sb = b.severity ?? 0;
    if (sb !== sa) return sb - sa;
    const byName = (a.name ?? "").localeCompare(b.name ?? "", "en");
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id, "en");
  });
  return sorted.map((area, idx) => ({ ...area, priorityRank: idx + 1 }));
}
