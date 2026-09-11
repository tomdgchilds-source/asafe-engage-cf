import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import {
  mutationRateLimit,
  heavyMutationRateLimit,
} from "../middleware/rateLimiter";
import { getDb } from "../db";
import { createStorage } from "../storage";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { and, eq, inArray } from "drizzle-orm";
import {
  insertSiteSurveySchema,
  insertSiteSurveyAreaSchema,
  surveyPhotos as surveyPhotosTable,
  type SiteSurveyArea,
  type SurveyPhoto,
} from "@shared/schema";
import { putObject } from "./files";
import {
  PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT,
  PAS13_INDICATIVE_FOOTNOTE,
  PAS13_VERSION,
  classifyVehicle,
  pas13Verdict,
  requiredAbsorbedJoules,
  sineFromPas13Table,
  type Pas13Verdict,
  type Verdict,
} from "@shared/pas13Rules";
import {
  assessRisk,
  riskLevel,
  RISK_LEVEL_BANDS,
  type AssetCriticality,
  type CurrentCondition,
  type ExistingProtection,
  type HazardSeverity,
  type PedestrianExposure,
  type RiskInputs,
  type RiskLevel,
  type RiskOutput,
  type TrafficDensity,
  type VehicleClass,
} from "@shared/risk/riskRegister";
import { ensurePas13ClassesLoaded } from "../services/pas13Classes";

const siteSurveys = new Hono<{ Bindings: Env; Variables: Variables }>();

// =============================================
// PURE HELPERS (unit-tested in siteSurveys.test.ts)
// =============================================

export const MIN_IMPACT_ANGLE = 5;
export const MAX_IMPACT_ANGLE = 90;

/**
 * Normalise a client-supplied impact angle (degrees). 0, undefined, null,
 * empty and non-numeric values all mean "head-on" and become 90. Anything
 * else is clamped to [5, 90] so sin(theta) never collapses the energy to ~0.
 */
export function clampImpactAngle(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  if (!Number.isFinite(n) || n === 0) return MAX_IMPACT_ANGLE;
  return Math.min(MAX_IMPACT_ANGLE, Math.max(MIN_IMPACT_ANGLE, n));
}

/** Parse an optional load mass (kg). Missing, non-numeric or negative → 0. */
export function parseLoadKg(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Required absorbed energy (J) for a survey area, per PAS 13:2017 §6.1
 * KE = ½ · (vehicle + load) · (v · sinΘ)². Delegates to the shared rule
 * engine so the sinΘ comes from the §6.1 table (not Math.sin) and the
 * calculator, survey and PAS 13 verdicts all agree. Angle is normalised
 * with clampImpactAngle (0 / missing → 90° head-on, else [5, 90]).
 */
export function computeAreaEnergyJ(args: {
  vehicleKg: number;
  loadKg?: number;
  speedKmh: number;
  angleDeg: number;
}): number {
  return requiredAbsorbedJoules({
    vehicleMassKg: args.vehicleKg,
    loadMassKg: args.loadKg,
    speedKmh: args.speedKmh,
    approachAngleDeg: clampImpactAngle(args.angleDeg),
  });
}

/** Minimal product shape the recommender needs (structurally satisfied by Product). */
export interface RecommendableProduct {
  id: string;
  name: string;
  impactRating?: number | null;
  imageUrl?: string | null;
  price?: string | number | null;
  category?: string | null;
  suitabilityData?: unknown;
  impactTestingData?: unknown;
}

/** One entry of `site_survey_areas.recommended_products`. */
export interface AreaProductRecommendation {
  productId: string;
  productName: string;
  impactRating: number | null;
  imageUrl: string | null;
  price: string | number | null;
  category: string | null;
  /** PAS 13 safety margin, (rated − required) / rated × 100. */
  safetyMarginPct: number;
  pas13Verdict: Verdict;
  /** True when the product does NOT meet the 30 % aligned margin — UI greys it out. */
  notAligned: boolean;
  reason: string;
}

/** Strip length / size suffixes so variants of one product family group together. */
function baseProductName(name: string): string {
  return name
    .replace(/\s*–\s*\d+\s*mm.*$/i, "")
    .replace(/\s*-\s*\d+\s*mm.*$/i, "")
    .replace(/\s*\d+mm\s*x\s*\d+mm.*$/i, "")
    .replace(/\s*\d+\s*mm.*$/i, "")
    .replace(/\s*\(\d+.*\).*$/i, "")
    .replace(/\s*\d+L.*$/i, "")
    .replace(/\s+Plus$/i, " Plus")
    .trim();
}

function isRackGuardName(name: string): boolean {
  return name.toLowerCase().includes("rackguard");
}

/** Cert-documented lateral deformation envelope (mm), or 0 when unknown. */
function impactZoneMaxMm(p: RecommendableProduct): number {
  const suit = p.suitabilityData as
    | { impactZone?: { maxMm?: unknown } | null }
    | null
    | undefined;
  const fromSuit = Number(suit?.impactZone?.maxMm);
  if (Number.isFinite(fromSuit) && fromSuit > 0) return fromSuit;
  const test = p.impactTestingData as { impactZone?: unknown } | null | undefined;
  const fromTest = Number(test?.impactZone);
  return Number.isFinite(fromTest) && fromTest > 0 ? fromTest : 0;
}

/**
 * Build the recommended-product list for a survey area using the PAS 13
 * rule engine (pas13Verdict). Only products whose safety margin is at
 * least PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT are recommended, one variant
 * per product family (the most economical still-aligned one).
 *
 * Racking areas: if no RackGuard makes the aligned list, the strongest
 * RackGuard is appended flagged `notAligned: true` with the racking
 * justification so the UI can show it greyed out — it is never presented
 * as a recommendation.
 */
export function recommendProductsForArea(args: {
  products: readonly RecommendableProduct[];
  vehicleKg: number;
  loadKg?: number;
  speedKmh: number;
  angleDeg: number;
  isRackingArea: boolean;
}): AreaProductRecommendation[] {
  const angleDeg = clampImpactAngle(args.angleDeg);
  const requiredJ = computeAreaEnergyJ({
    vehicleKg: args.vehicleKg,
    loadKg: args.loadKg,
    speedKmh: args.speedKmh,
    angleDeg,
  });

  const verdictFor = (p: RecommendableProduct) =>
    pas13Verdict({
      vehicleMassKg: args.vehicleKg,
      loadMassKg: args.loadKg,
      speedKmh: args.speedKmh,
      approachAngleDeg: angleDeg,
      productRatedJoulesAt45deg: p.impactRating ?? 0,
      productImpactZoneMaxMm: impactZoneMaxMm(p),
    });

  const toEntry = (
    p: RecommendableProduct,
    v: ReturnType<typeof pas13Verdict>,
    reason: string,
  ): AreaProductRecommendation => ({
    productId: p.id,
    productName: p.name,
    impactRating: p.impactRating ?? null,
    imageUrl: p.imageUrl ?? null,
    price: p.price ?? null,
    category: p.category ?? null,
    safetyMarginPct: v.details.safetyMarginPct,
    pas13Verdict: v.verdict,
    notAligned: v.verdict !== "aligned",
    reason,
  });

  const byFamily = new Map<string, AreaProductRecommendation>();
  for (const p of args.products) {
    if (!p.impactRating || p.impactRating <= 0) continue;
    const v = verdictFor(p);
    if (v.verdict !== "aligned") continue; // margin < PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT
    const entry = toEntry(p, v, `Rated for ${p.impactRating}J — ${v.summary}`);
    const family = baseProductName(p.name);
    const existing = byFamily.get(family);
    if (!existing || entry.safetyMarginPct < existing.safetyMarginPct) {
      byFamily.set(family, entry);
    }
  }

  const recommended = Array.from(byFamily.values()).sort(
    (a, b) => (a.impactRating ?? 0) - (b.impactRating ?? 0),
  );

  if (args.isRackingArea && !recommended.some((r) => isRackGuardName(r.productName))) {
    const rackGuards = args.products.filter(
      (p) => isRackGuardName(p.name) && (p.impactRating ?? 0) > 0,
    );
    if (rackGuards.length > 0) {
      const best = rackGuards.reduce((a, b) =>
        (b.impactRating ?? 0) > (a.impactRating ?? 0) ? b : a,
      );
      const v = verdictFor(best);
      const reason =
        v.verdict === "not_aligned"
          ? `Specifically designed for racking protection. Note: Rated for ${best.impactRating}J (below calculated ${Math.round(requiredJ)}J), but typical forklift speeds near racking are 1-2 kph during loading/unloading operations.`
          : `Specifically designed for racking protection. ${v.summary}`;
      recommended.push(toEntry(best, v, reason));
    }
  }

  return recommended;
}

const DATA_URL_RE = /^data:([^;,]+);base64,([\s\S]*)$/i;

/** True for `data:<mime>;base64,<payload>` strings. */
export function isDataUrl(value: unknown): value is string {
  return typeof value === "string" && DATA_URL_RE.test(value);
}

/** True when a `photosUrls` payload contains at least one base64 data URL. */
export function hasDataUrls(urls: unknown): urls is unknown[] {
  return Array.isArray(urls) && urls.some(isDataUrl);
}

export interface ParsedDataUrl {
  contentType: string;
  bytes: Uint8Array;
  extension: string;
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
};

/**
 * Decode a base64 data URL into bytes + content type. Returns null for
 * anything that is not a well-formed base64 data URL. Uses atob so it runs
 * unchanged in the Workers runtime (no Buffer).
 */
export function parseDataUrl(url: string): ParsedDataUrl | null {
  const match = DATA_URL_RE.exec(url);
  if (!match) return null;
  const contentType = match[1].toLowerCase();
  let binary: string;
  try {
    binary = atob(match[2].replace(/\s/g, ""));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { contentType, bytes, extension: MIME_EXTENSIONS[contentType] ?? "jpg" };
}

/** Object key for a survey-area photo: `survey-photos/<areaId>/<uuid>.<ext>`. */
export function surveyPhotoKey(
  areaId: string,
  extension = "jpg",
  uuid: string = crypto.randomUUID()
): string {
  return `survey-photos/${areaId}/${uuid}.${extension}`;
}

/**
 * Upload every base64 data URL in `urls` to object storage and return the
 * list with those entries replaced by served `/api/objects/<key>` URLs.
 * Already-hosted URLs pass through untouched; undecodable data URLs and
 * non-string entries are dropped so multi-MB strings never reach Postgres.
 */
async function materialisePhotoUrls(env: Env, areaId: string, urls: unknown[]): Promise<string[]> {
  const results = await Promise.all(
    urls.map(async (url): Promise<string | null> => {
      if (typeof url !== "string") return null;
      if (!isDataUrl(url)) return url;
      const parsed = parseDataUrl(url);
      if (!parsed) return null;
      const key = surveyPhotoKey(areaId, parsed.extension);
      await putObject(env, key, parsed.bytes, parsed.contentType);
      return `/api/objects/${key}`;
    })
  );
  return results.filter((u): u is string => u !== null);
}

// =============================================
// RISK REGISTER — PURE HELPERS (unit-tested in siteSurveys.register.test.ts)
// =============================================
// Observation → RiskInputs mapping, PAS 13 vehicle class by mass, the 5×5
// count matrix and level summaries. Nothing in this section touches I/O.

export const TRAFFIC_DENSITIES = ["low", "medium", "high"] as const;
export const PEDESTRIAN_EXPOSURES = ["none", "occasional", "frequent", "constant"] as const;
export const EXISTING_PROTECTIONS = ["none", "partial", "adequate"] as const;
export const AREA_CONDITIONS = ["good", "damaged", "critical", "unprotected"] as const;
export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export const HAZARD_SEVERITIES = ["low", "medium", "high", "critical"] as const;

/** Vision-model values that are accepted on input but have no register meaning. */
const UNKNOWN = "unknown";

const hazardSchema = z.object({
  tag: z.string().trim().min(1).max(60),
  severity: z.enum(HAZARD_SEVERITIES),
});

/** One rep-confirmed observation (one photo) from the review screen (Task S3). */
export const confirmedObservationSchema = z.object({
  photoId: z.string().trim().min(1),
  areaType: z.string().trim().min(1).max(80),
  condition: z.enum(AREA_CONDITIONS),
  riskLevelOverride: z.enum(RISK_LEVELS).optional(),
  hazards: z.array(hazardSchema).max(20).default([]),
  vehicles: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  // The vision model may say "unknown"; the register maps that conservatively.
  pedestrianExposure: z.enum([...PEDESTRIAN_EXPOSURES, UNKNOWN]),
  existingProtection: z.enum([...EXISTING_PROTECTIONS, UNKNOWN]),
  floorType: z.string().trim().max(40).optional(),
  observationText: z.string().trim().max(4000).default(""),
});
export type ConfirmedObservation = z.infer<typeof confirmedObservationSchema>;

/** Body of POST /api/site-surveys/:id/areas/from-observations. */
export const areasFromObservationsSchema = z.object({
  zoneName: z.string().trim().min(1).max(120),
  mergeIntoOneArea: z.boolean(),
  trafficDensity: z.enum(TRAFFIC_DENSITIES),
  vehicleMassKg: z.number().positive().max(200_000),
  loadMassKg: z.number().min(0).max(200_000).default(0),
  speedKmh: z.number().positive().max(120),
  recommendedLengthM: z.number().min(0).max(10_000).optional(),
  observations: z.array(confirmedObservationSchema).min(1).max(50),
});
export type AreasFromObservationsBody = z.infer<typeof areasFromObservationsSchema>;

const LEVEL_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const CONDITION_WORST_FIRST: readonly CurrentCondition[] = ["critical", "unprotected", "damaged", "good"];
const PEDESTRIAN_ORDER: Record<PedestrianExposure, number> = { none: 0, occasional: 1, frequent: 2, constant: 3 };
const PROTECTION_ORDER: Record<ExistingProtection, number> = { none: 0, partial: 1, adequate: 2 };

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

/** Unknown / missing pedestrian exposure is treated as "occasional" (never as "none"). */
export function normalisePedestrianExposure(value: unknown): PedestrianExposure {
  return isOneOf(PEDESTRIAN_EXPOSURES, value) ? value : "occasional";
}

/** Unknown / missing existing protection is treated as "none". */
export function normaliseExistingProtection(value: unknown): ExistingProtection {
  return isOneOf(EXISTING_PROTECTIONS, value) ? value : "none";
}

/** Unknown / missing traffic density is treated as "medium". */
export function normaliseTrafficDensity(value: unknown): TrafficDensity {
  return isOneOf(TRAFFIC_DENSITIES, value) ? value : "medium";
}

/** Unknown / missing condition is treated as "unprotected". */
export function normaliseCondition(value: unknown): CurrentCondition {
  return isOneOf(AREA_CONDITIONS, value) ? value : "unprotected";
}

export function isRiskLevel(value: unknown): value is RiskLevel {
  return isOneOf(RISK_LEVELS, value);
}

export function maxRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return LEVEL_ORDER[b] > LEVEL_ORDER[a] ? b : a;
}

/** The worst condition in a set: critical > unprotected > damaged > good. */
export function worstCondition(conditions: readonly CurrentCondition[]): CurrentCondition {
  for (const c of CONDITION_WORST_FIRST) if (conditions.includes(c)) return c;
  return "unprotected";
}

/**
 * PAS 13 vehicle class (T1..T4) for the register from total mass and speed,
 * via the shared classifier (admin-editable table when
 * ensurePas13ClassesLoaded has run). Null when there is no usable mass/speed
 * or the table uses codes outside T1..T4.
 */
export function vehicleClassFromMass(
  vehicleKg: number | null | undefined,
  loadKg: number | null | undefined,
  speedKmh: number | null | undefined,
): VehicleClass | null {
  const mass = Number(vehicleKg);
  const speed = Number(speedKmh);
  if (!Number.isFinite(mass) || mass <= 0 || !Number.isFinite(speed) || speed <= 0) return null;
  const total = mass + parseLoadKg(loadKg);
  const { classCode } = classifyVehicle({ totalMassKg: total, speedKmh: speed });
  return classCode === "T1" || classCode === "T2" || classCode === "T3" || classCode === "T4"
    ? classCode
    : null;
}

/** Racking, structural columns and machinery are high-criticality assets. */
export function assetCriticalityForAreaType(areaType: string | null | undefined): AssetCriticality {
  const t = (areaType ?? "").toLowerCase();
  return t.includes("racking") || t.includes("column") || t.includes("machinery") ? "high" : "medium";
}

/** "racking_aisle" → "Racking aisle"; already-readable names pass through. */
export function areaTypeLabel(areaType: string): string {
  const words = areaType.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!words) return "Area";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "Loading Dock – Dock edge" (+ " (2)" when `ordinal` > 1). */
export function areaNameFor(zoneName: string, areaType: string, ordinal = 1): string {
  const base = `${zoneName.trim()} – ${areaTypeLabel(areaType)}`;
  return ordinal > 1 ? `${base} (${ordinal})` : base;
}

/** Map a register level onto the legacy `priority` column. */
export function priorityForLevel(level: RiskLevel): "low" | "medium" | "high" | "urgent" {
  return level === "critical" ? "urgent" : level;
}

export interface MergedObservation {
  areaType: string;
  condition: CurrentCondition;
  pedestrianExposure: PedestrianExposure;
  existingProtection: ExistingProtection;
  hazards: Array<{ tag: string; severity: HazardSeverity }>;
  vehicles: string[];
  floorType: string | null;
  riskLevelOverride: RiskLevel | null;
  observationText: string;
}

/**
 * Collapse one or more confirmed observations into the inputs for a single
 * area. Conservative on every axis: the most common area type (first wins a
 * tie), the worst condition, the highest pedestrian exposure, the weakest
 * existing protection, the union of hazards and vehicles, and the highest
 * rep override. Observation texts are joined as paragraphs.
 */
export function mergeObservations(observations: readonly ConfirmedObservation[]): MergedObservation {
  if (observations.length === 0) throw new Error("mergeObservations: no observations");

  const typeCounts = new Map<string, number>();
  for (const o of observations) typeCounts.set(o.areaType, (typeCounts.get(o.areaType) ?? 0) + 1);
  let areaType = observations[0].areaType;
  for (const [t, n] of typeCounts) if (n > (typeCounts.get(areaType) ?? 0)) areaType = t;

  let pedestrianExposure: PedestrianExposure = "none";
  let existingProtection: ExistingProtection = "adequate";
  let riskLevelOverride: RiskLevel | null = null;
  const hazards: MergedObservation["hazards"] = [];
  const vehicles = new Set<string>();
  const texts: string[] = [];
  let floorType: string | null = null;

  for (const o of observations) {
    const pe = normalisePedestrianExposure(o.pedestrianExposure);
    if (PEDESTRIAN_ORDER[pe] > PEDESTRIAN_ORDER[pedestrianExposure]) pedestrianExposure = pe;
    const ep = normaliseExistingProtection(o.existingProtection);
    if (PROTECTION_ORDER[ep] < PROTECTION_ORDER[existingProtection]) existingProtection = ep;
    if (o.riskLevelOverride) {
      riskLevelOverride = riskLevelOverride
        ? maxRiskLevel(riskLevelOverride, o.riskLevelOverride)
        : o.riskLevelOverride;
    }
    for (const h of o.hazards) {
      if (!hazards.some((x) => x.tag === h.tag && x.severity === h.severity)) hazards.push(h);
    }
    for (const v of o.vehicles) vehicles.add(v);
    if (o.observationText) texts.push(o.observationText);
    if (!floorType && o.floorType && o.floorType !== UNKNOWN) floorType = o.floorType;
  }

  return {
    areaType,
    condition: worstCondition(observations.map((o) => o.condition)),
    pedestrianExposure,
    existingProtection,
    hazards,
    vehicles: [...vehicles],
    floorType,
    riskLevelOverride,
    observationText: texts.join("\n\n"),
  };
}

/** Zone-level inputs shared by every observation in a confirm request. */
export interface ZoneRiskContext {
  trafficDensity: TrafficDensity;
  vehicleMassKg: number;
  loadMassKg?: number;
  speedKmh: number;
}

/** Observation(s) → RiskInputs for shared/risk/riskRegister assessRisk. */
export function observationsToRiskInputs(
  zone: ZoneRiskContext,
  observations: readonly ConfirmedObservation[],
): RiskInputs {
  const merged = mergeObservations(observations);
  return {
    vehicleClass: vehicleClassFromMass(zone.vehicleMassKg, zone.loadMassKg, zone.speedKmh),
    trafficDensity: zone.trafficDensity,
    pedestrianExposure: merged.pedestrianExposure,
    existingProtection: merged.existingProtection,
    currentCondition: merged.condition,
    hazardSeverities: merged.hazards.map((h) => h.severity),
    assetCriticality: assetCriticalityForAreaType(merged.areaType),
  };
}

/** Hazard severities inside a stored `survey_photos.analysis` (VisionObservation) blob. */
export function hazardSeveritiesFromAnalysis(analysis: unknown): HazardSeverity[] {
  const hazards = (analysis as { hazards?: unknown } | null | undefined)?.hazards;
  if (!Array.isArray(hazards)) return [];
  return hazards
    .map((h) => (h as { severity?: unknown } | null)?.severity)
    .filter((s): s is HazardSeverity => isOneOf(HAZARD_SEVERITIES, s));
}

/** The report-ready `observation` sentence(s) inside a stored analysis blob, or null. */
export function aiObservationFromAnalysis(analysis: unknown): string | null {
  const text = (analysis as { observation?: unknown } | null | undefined)?.observation;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

/** Minimal area shape the matrix / summary helpers need. */
export interface RegisterCountable {
  likelihood?: number | null;
  severity?: number | null;
  riskScore?: number | null;
  riskLevel?: string | null;
}

/**
 * The level the register reports for an area: the stored `riskLevel` when it
 * is a valid level (it is set from the score band on assessment, or by a rep
 * override), otherwise the band of `riskScore`; null when neither exists.
 */
export function effectiveRiskLevel(area: RegisterCountable): RiskLevel | null {
  if (isRiskLevel(area.riskLevel)) return area.riskLevel;
  if (typeof area.riskScore === "number" && Number.isFinite(area.riskScore)) {
    return riskLevel(area.riskScore);
  }
  return null;
}

/** True when the area has been assessed (both ratings stored as 1..5). */
export function isAssessed(area: RegisterCountable): boolean {
  const l = area.likelihood;
  const s = area.severity;
  return (
    typeof l === "number" && typeof s === "number" && l >= 1 && l <= 5 && s >= 1 && s <= 5
  );
}

/**
 * 5×5 count matrix: `matrix[likelihood - 1][severity - 1]` is the number of
 * assessed areas with that pair. Unassessed areas are not counted.
 */
export function buildRiskMatrix(areas: readonly RegisterCountable[]): number[][] {
  const matrix = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0));
  for (const a of areas) {
    if (!isAssessed(a)) continue;
    matrix[Math.round(a.likelihood as number) - 1][Math.round(a.severity as number) - 1] += 1;
  }
  return matrix;
}

export interface RegisterSummary {
  total: number;
  assessed: number;
  unassessed: number;
  byLevel: Record<RiskLevel, number>;
  overallRiskLevel: RiskLevel | null;
}

/** Counts by effective level plus the overall (highest) level for the survey. */
export function summariseRegister(areas: readonly RegisterCountable[]): RegisterSummary {
  const byLevel: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  let overall: RiskLevel | null = null;
  let assessed = 0;
  for (const a of areas) {
    if (isAssessed(a)) assessed += 1;
    const level = effectiveRiskLevel(a);
    if (!level) continue;
    byLevel[level] += 1;
    overall = overall ? maxRiskLevel(overall, level) : level;
  }
  return {
    total: areas.length,
    assessed,
    unassessed: areas.length - assessed,
    byLevel,
    overallRiskLevel: overall,
  };
}

/** Highest effective level across the survey's areas, or null when there are none. */
export function overallRiskLevelFor(areas: readonly RegisterCountable[]): RiskLevel | null {
  return summariseRegister(areas).overallRiskLevel;
}

// ---- Full area assessment (risk + PAS 13 energy + recommendations) ---------

export interface AreaAssessmentInput {
  vehicleKg: number | null | undefined;
  loadKg: number | null | undefined;
  speedKmh: number | null | undefined;
  angleDeg?: number | null;
  trafficDensity: TrafficDensity;
  pedestrianExposure: PedestrianExposure;
  existingProtection: ExistingProtection;
  condition: CurrentCondition;
  hazardSeverities: HazardSeverity[];
  areaType: string;
  products: readonly RecommendableProduct[];
}

export interface AreaAssessment {
  risk: RiskOutput;
  vehicleClass: VehicleClass | null;
  /** Null when there is no usable vehicle mass / speed. */
  calculatedJoules: number | null;
  recommendedProducts: AreaProductRecommendation[];
  /** First aligned recommendation (the most economical aligned product), or null. */
  topProduct: AreaProductRecommendation | null;
  /** Full pas13Verdict for `topProduct`, stored as `pas13_verdict`. */
  pas13Verdict: Pas13Verdict | null;
}

/**
 * Deterministic assessment of one area from its stored / confirmed fields.
 * The PAS 13 part is skipped (nulls, empty list) when the vehicle mass or
 * speed is missing; the risk part always runs.
 */
export function assessArea(input: AreaAssessmentInput): AreaAssessment {
  const vehicleClass = vehicleClassFromMass(input.vehicleKg, input.loadKg, input.speedKmh);
  const risk = assessRisk({
    vehicleClass,
    trafficDensity: input.trafficDensity,
    pedestrianExposure: input.pedestrianExposure,
    existingProtection: input.existingProtection,
    currentCondition: input.condition,
    hazardSeverities: input.hazardSeverities,
    assetCriticality: assetCriticalityForAreaType(input.areaType),
  });

  const vehicleKg = Number(input.vehicleKg);
  const speedKmh = Number(input.speedKmh);
  if (!Number.isFinite(vehicleKg) || vehicleKg <= 0 || !Number.isFinite(speedKmh) || speedKmh <= 0) {
    return {
      risk,
      vehicleClass,
      calculatedJoules: null,
      recommendedProducts: [],
      topProduct: null,
      pas13Verdict: null,
    };
  }

  const loadKg = parseLoadKg(input.loadKg);
  const angleDeg = clampImpactAngle(input.angleDeg);
  const isRackingArea = input.areaType.toLowerCase().includes("racking");
  const calculatedJoules = computeAreaEnergyJ({ vehicleKg, loadKg, speedKmh, angleDeg });
  const recommendedProducts = recommendProductsForArea({
    products: input.products,
    vehicleKg,
    loadKg,
    speedKmh,
    angleDeg,
    isRackingArea,
  });
  const topProduct = recommendedProducts.find((r) => !r.notAligned) ?? recommendedProducts[0] ?? null;
  const topProductRow = topProduct
    ? input.products.find((p) => p.id === topProduct.productId) ?? null
    : null;
  const verdict = topProductRow
    ? pas13Verdict({
        vehicleMassKg: vehicleKg,
        loadMassKg: loadKg,
        speedKmh,
        approachAngleDeg: angleDeg,
        productRatedJoulesAt45deg: topProductRow.impactRating ?? 0,
        productImpactZoneMaxMm: impactZoneMaxMm(topProductRow),
      })
    : null;

  return {
    risk,
    vehicleClass,
    calculatedJoules,
    recommendedProducts,
    topProduct,
    pas13Verdict: verdict,
  };
}

/** Rationale sentences are persisted one per line in `justification`. */
export function rationaleToJustification(rationale: readonly string[]): string {
  return rationale.join("\n");
}

export function justificationToRationale(justification: string | null | undefined): string[] {
  return (justification ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Served URL for a survey photo object key (mirrors worker/routes/surveyPhotos.ts objectUrlFor). */
export function photoObjectUrl(objectKey: string): string {
  return `/api/objects/${objectKey}`;
}

/** Photo fields the register exposes per area. */
export interface RegisterPhoto {
  id: string;
  objectUrl: string;
  zoneName: string | null;
  takenAt: string | null;
  analysisStatus: string;
}

/** One row of the risk register (Task S5 table + expanded row). */
export interface RegisterArea {
  id: string;
  siteSurveyId: string;
  zoneName: string;
  areaName: string;
  areaType: string;
  areaTypeLabel: string;
  currentCondition: string;
  riskLevel: RiskLevel | null;
  likelihood: number | null;
  severity: number | null;
  riskScore: number | null;
  priorityRank: number | null;
  priority: string;
  trafficDensity: string | null;
  pedestrianExposure: string | null;
  existingProtection: string | null;
  vehicleWeight: number | null;
  vehicleSpeed: number | null;
  impactAngle: number | null;
  loadMass: number | null;
  calculatedJoules: number | null;
  recommendedLengthM: number | null;
  recommendedProducts: AreaProductRecommendation[];
  topProduct: AreaProductRecommendation | null;
  pas13Verdict: Pas13Verdict | null;
  issueDescription: string;
  aiObservation: string | null;
  recommendedAction: string | null;
  estimatedCost: string | null;
  rationale: string[];
  photos: RegisterPhoto[];
  /** Legacy inline photo URLs (surveys created before survey_photos). */
  photosUrls: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

export function toRegisterPhoto(p: SurveyPhoto): RegisterPhoto {
  return {
    id: p.id,
    objectUrl: photoObjectUrl(p.objectKey),
    zoneName: p.zoneName ?? null,
    takenAt: toIso(p.takenAt),
    analysisStatus: p.analysisStatus,
  };
}

export function toRegisterArea(area: SiteSurveyArea, photos: readonly SurveyPhoto[] = []): RegisterArea {
  const recommendedProducts = Array.isArray(area.recommendedProducts)
    ? (area.recommendedProducts as AreaProductRecommendation[])
    : [];
  const assessed = isAssessed(area);
  return {
    id: area.id,
    siteSurveyId: area.siteSurveyId,
    zoneName: area.zoneName,
    areaName: area.areaName,
    areaType: area.areaType,
    areaTypeLabel: areaTypeLabel(area.areaType),
    currentCondition: area.currentCondition,
    riskLevel: effectiveRiskLevel(area),
    likelihood: assessed ? area.likelihood : null,
    severity: assessed ? area.severity : null,
    riskScore: area.riskScore ?? null,
    priorityRank: area.priorityRank ?? null,
    priority: area.priority,
    trafficDensity: area.trafficDensity ?? null,
    pedestrianExposure: area.pedestrianExposure ?? null,
    existingProtection: area.existingProtection ?? null,
    vehicleWeight: area.vehicleWeight ?? null,
    vehicleSpeed: area.vehicleSpeed ?? null,
    impactAngle: area.impactAngle ?? null,
    loadMass: area.loadMass ?? null,
    calculatedJoules: area.calculatedJoules ?? null,
    recommendedLengthM: area.recommendedLengthM ?? null,
    recommendedProducts,
    topProduct: recommendedProducts.find((r) => !r.notAligned) ?? recommendedProducts[0] ?? null,
    pas13Verdict: (area.pas13Verdict as Pas13Verdict | null) ?? null,
    issueDescription: area.issueDescription,
    aiObservation: area.aiObservation ?? null,
    recommendedAction: area.recommendedAction ?? null,
    estimatedCost: area.estimatedCost ?? null,
    rationale: assessed ? justificationToRationale(area.justification) : [],
    photos: photos.map(toRegisterPhoto),
    photosUrls: Array.isArray(area.photosUrls)
      ? (area.photosUrls as unknown[]).filter((u): u is string => typeof u === "string")
      : [],
    createdAt: toIso(area.createdAt),
    updatedAt: toIso(area.updatedAt),
  };
}

/** Order for the register: priority_rank ascending, unranked last (newest first). */
export function sortForRegister<T extends { priorityRank?: number | null; createdAt?: Date | string | null }>(
  areas: readonly T[],
): T[] {
  return [...areas].sort((a, b) => {
    const ra = a.priorityRank ?? Number.POSITIVE_INFINITY;
    const rb = b.priorityRank ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return cb - ca;
  });
}

/** Group survey photos by their linked area id (unlinked photos are dropped). */
export function groupPhotosByArea(photos: readonly SurveyPhoto[]): Map<string, SurveyPhoto[]> {
  const byArea = new Map<string, SurveyPhoto[]>();
  for (const p of photos) {
    if (!p.areaId) continue;
    const list = byArea.get(p.areaId) ?? [];
    list.push(p);
    byArea.set(p.areaId, list);
  }
  return byArea;
}

/** Plain-English recommended action for the register row / proposal. */
export function recommendedActionFor(
  topProduct: AreaProductRecommendation | null,
  recommendedLengthM: number | null | undefined,
  level: RiskLevel,
): string | null {
  if (!topProduct) return null;
  const band = RISK_LEVEL_BANDS.find((b) => b.level === level);
  const run =
    typeof recommendedLengthM === "number" && recommendedLengthM > 0
      ? ` over ${recommendedLengthM} m`
      : "";
  const when = band ? ` Action timescale: ${band.actionTimescale}.` : "";
  return `Install ${topProduct.productName}${run}.${when}`;
}

// =============================================
// REQUEST BODY SCHEMAS
// =============================================
// Server-owned columns (id, userId, siteSurveyId, createdAt, updatedAt) are
// never accepted from the client; the handlers set them explicitly.

const surveyCreateSchema = insertSiteSurveySchema.omit({ userId: true });
const surveyUpdateSchema = surveyCreateSchema.partial();
const areaCreateSchema = insertSiteSurveyAreaSchema.omit({ siteSurveyId: true });
const areaUpdateSchema = areaCreateSchema.partial();

type ParsedBody<S extends z.ZodTypeAny> =
  | { ok: true; data: z.infer<S> }
  | { ok: false; message: string };

function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): ParsedBody<S> {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, message: fromZodError(result.error).message };
}

/** Clamp `impactAngle` when the client supplied one (leave absent/null alone). */
function normaliseAreaAngle<T extends { impactAngle?: number | null }>(data: T): T {
  if (data.impactAngle === undefined || data.impactAngle === null) return data;
  return { ...data, impactAngle: clampImpactAngle(data.impactAngle) };
}

// All site survey routes require authentication
siteSurveys.use("/site-surveys/*", authMiddleware);
siteSurveys.use("/site-surveys", authMiddleware);
siteSurveys.use("/site-survey-areas/*", authMiddleware);
siteSurveys.use("/site-survey-areas", authMiddleware);

// =============================================
// SITE SURVEY ROUTES
// =============================================

// GET /api/site-surveys
siteSurveys.get("/site-surveys", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const surveys = await storage.getUserSiteSurveys(userId);
    return c.json(surveys);
  } catch (error) {
    console.error("Error fetching site surveys:", error);
    return c.json({ message: "Failed to fetch site surveys" }, 500);
  }
});

// GET /api/site-surveys/:id
siteSurveys.get("/site-surveys/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const survey = await storage.getSiteSurvey(c.req.param("id"));
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey not found" }, 404);
    }
    return c.json(survey);
  } catch (error) {
    console.error("Error fetching site survey:", error);
    return c.json({ message: "Failed to fetch site survey" }, 500);
  }
});

// POST /api/site-surveys — survey creation, heavy tier.
siteSurveys.post("/site-surveys", heavyMutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const parsed = parseBody(surveyCreateSchema, await c.req.json());
    if (!parsed.ok) {
      return c.json({ message: parsed.message }, 400);
    }
    const body = parsed.data;

    const survey = await storage.createSiteSurvey({ ...body, userId });

    // Fire-and-forget activity log
    try {
      c.executionCtx.waitUntil(
        storage.logUserActivity({
          userId,
          activityType: "create_survey",
          section: "site-surveys",
          details: { surveyId: survey.id, title: body.title },
        })
      );
    } catch {}

    return c.json(survey, 201);
  } catch (error) {
    console.error("Error creating site survey:", error);
    return c.json({ message: "Failed to create site survey" }, 500);
  }
});

// PUT /api/site-surveys/:id — survey write, heavy tier.
siteSurveys.put("/site-surveys/:id", heavyMutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const survey = await storage.getSiteSurvey(c.req.param("id"));
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey not found" }, 404);
    }
    const parsed = parseBody(surveyUpdateSchema, await c.req.json());
    if (!parsed.ok) {
      return c.json({ message: parsed.message }, 400);
    }

    const updatedSurvey = await storage.updateSiteSurvey(c.req.param("id"), parsed.data);
    return c.json(updatedSurvey);
  } catch (error) {
    console.error("Error updating site survey:", error);
    return c.json({ message: "Failed to update site survey" }, 500);
  }
});

// POST /api/site-surveys/:id/complete
siteSurveys.post("/site-surveys/:id/complete", mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const survey = await storage.getSiteSurvey(c.req.param("id"));
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey not found" }, 404);
    }
    const surveyId = c.req.param("id");

    // Freeze the register order before completing so the snapshot and the
    // proposal read the same ranks.
    await storage.rankSurveyAreas(surveyId);
    const areas = await storage.getSiteSurveyAreas(surveyId);
    let completedSurvey = await storage.completeSiteSurvey(surveyId);

    // Overall level = highest register band across the areas (Task S4).
    const overallRiskLevel = overallRiskLevelFor(areas);
    if (overallRiskLevel && completedSurvey.overallRiskLevel !== overallRiskLevel) {
      completedSurvey = await storage.updateSiteSurvey(surveyId, { overallRiskLevel });
    }

    // HOOK (Task S7): build the frozen SurveySnapshot from `areas` + linked
    // survey_photos here and persist it with
    // storage.updateSiteSurvey(surveyId, { snapshot }) before responding.

    return c.json(completedSurvey);
  } catch (error) {
    console.error("Error completing site survey:", error);
    return c.json({ message: "Failed to complete site survey" }, 500);
  }
});

// DELETE /api/site-surveys/:id
siteSurveys.delete("/site-surveys/:id", mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const survey = await storage.getSiteSurvey(c.req.param("id"));
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey not found" }, 404);
    }
    await storage.deleteSiteSurvey(c.req.param("id"));
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting site survey:", error);
    return c.json({ message: "Failed to delete site survey" }, 500);
  }
});

// =============================================
// SITE SURVEY AREA ROUTES
// =============================================

// GET /api/site-surveys/:id/areas
siteSurveys.get("/site-surveys/:id/areas", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const survey = await storage.getSiteSurvey(c.req.param("id"));
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey not found" }, 404);
    }
    const areas = await storage.getSiteSurveyAreas(c.req.param("id"));
    return c.json(areas);
  } catch (error) {
    console.error("Error fetching site survey areas:", error);
    return c.json({ message: "Failed to fetch site survey areas" }, 500);
  }
});

// POST /api/site-surveys/:id/areas — area creation, heavy tier.
siteSurveys.post("/site-surveys/:id/areas", heavyMutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const survey = await storage.getSiteSurvey(c.req.param("id"));
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey not found" }, 404);
    }
    const parsed = parseBody(areaCreateSchema, await c.req.json());
    if (!parsed.ok) {
      return c.json({ message: parsed.message }, 400);
    }
    const { photosUrls, ...rest } = normaliseAreaAngle(parsed.data);
    const needsPhotoUpload = hasDataUrls(photosUrls);

    // The photo key embeds the area id, so create first with only the
    // already-hosted URLs, then upload any inline photos and patch the row.
    let area = await storage.createSiteSurveyArea({
      ...rest,
      siteSurveyId: c.req.param("id"),
      photosUrls: needsPhotoUpload ? photosUrls.filter((u) => !isDataUrl(u)) : photosUrls,
    });
    if (needsPhotoUpload) {
      area = await storage.updateSiteSurveyArea(area.id, {
        photosUrls: await materialisePhotoUrls(c.env, area.id, photosUrls),
      });
    }
    return c.json(area, 201);
  } catch (error) {
    console.error("Error creating site survey area:", error);
    return c.json({ message: "Failed to create site survey area" }, 500);
  }
});

// PUT /api/site-survey-areas/:id
siteSurveys.put("/site-survey-areas/:id", mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;

    // Ownership check: area -> parent survey -> userId
    const area = await storage.getSiteSurveyArea(c.req.param("id"));
    if (!area) {
      return c.json({ error: "Site survey area not found" }, 404);
    }
    const survey = await storage.getSiteSurvey(area.siteSurveyId);
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey area not found" }, 404);
    }

    const parsed = parseBody(areaUpdateSchema, await c.req.json());
    if (!parsed.ok) {
      return c.json({ message: parsed.message }, 400);
    }
    const body = normaliseAreaAngle(parsed.data);
    if (hasDataUrls(body.photosUrls)) {
      body.photosUrls = await materialisePhotoUrls(c.env, c.req.param("id"), body.photosUrls);
    }

    // Only reset the impact calculation when inputs that actually affect it change.
    // Editing zone name, photos, Matterport URL, description, etc. should NOT wipe
    // an existing calculation.
    const calcInputFields = ["vehicleWeight", "vehicleSpeed", "impactAngle"];
    const calcInputChanged = calcInputFields.some((k) => k in body);
    const isProductSelectionUpdate =
      "recommendedProducts" in body && !calcInputChanged;

    let dataToUpdate: typeof body;
    if (isProductSelectionUpdate) {
      dataToUpdate = body;
    } else if (calcInputChanged) {
      // User actually changed a calc input — invalidate the stored result.
      dataToUpdate = {
        ...body,
        calculatedJoules: null,
        recommendedProducts: [],
      };
    } else {
      // Non-calc edits (matterportUrl, photosUrls, names, description, etc.)
      // leave the existing calculation intact.
      dataToUpdate = body;
    }

    const updatedArea = await storage.updateSiteSurveyArea(c.req.param("id"), dataToUpdate);
    return c.json(updatedArea);
  } catch (error) {
    console.error("Error updating site survey area:", error);
    return c.json({ message: "Failed to update site survey area" }, 500);
  }
});

// POST /api/site-survey-areas/:id/calculate-impact
siteSurveys.post("/site-survey-areas/:id/calculate-impact", mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const areaId = c.req.param("id");

    // Ownership check: area -> parent survey -> userId
    const currentArea = await storage.getSiteSurveyArea(areaId);
    if (!currentArea) {
      return c.json({ error: "Site survey area not found" }, 404);
    }
    const survey = await storage.getSiteSurvey(currentArea.siteSurveyId);
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey area not found" }, 404);
    }

    const body = await c.req.json();
    const { vehicleWeight, vehicleSpeed, impactAngle: rawImpactAngle } = body;

    if (!vehicleWeight || !vehicleSpeed) {
      return c.json({ message: "Vehicle weight and speed are required" }, 400);
    }
    const massKg = parseFloat(vehicleWeight);
    const speedKmh = parseFloat(vehicleSpeed);
    if (
      !Number.isFinite(massKg) || massKg <= 0 ||
      !Number.isFinite(speedKmh) || speedKmh <= 0
    ) {
      return c.json({ message: "Vehicle weight and speed must be positive numbers" }, 400);
    }
    // Optional load mass (kg) — accepted as `loadMass` or `loadWeight`.
    const loadKg = parseLoadKg(body.loadMass ?? body.loadWeight);
    // 0 / missing angle means head-on (90°); otherwise clamp to [5, 90].
    const impactAngle = clampImpactAngle(rawImpactAngle);
    const isRackingArea = currentArea.areaType?.toLowerCase().includes("racking") ?? false;

    // PAS 13:2017 §6.1 KE = ½ (m_vehicle + m_load) (v sinΘ)² via the shared
    // rule engine, so this matches the calculator and PAS 13 verdict panels.
    const kineticEnergy = computeAreaEnergyJ({
      vehicleKg: massKg,
      loadKg,
      speedKmh,
      angleDeg: impactAngle,
    });

    const allProducts = await storage.getProducts();
    const recommendedProducts = recommendProductsForArea({
      products: allProducts,
      vehicleKg: massKg,
      loadKg,
      speedKmh,
      angleDeg: impactAngle,
      isRackingArea,
    });

    // Update the area with calculation results
    const updatedArea = await storage.updateSiteSurveyArea(areaId, {
      vehicleWeight: massKg,
      vehicleSpeed: speedKmh,
      impactAngle,
      calculatedJoules: kineticEnergy,
      recommendedProducts,
    });

    const velocityMs = speedKmh / 3.6; // km/h → m/s
    return c.json({
      area: updatedArea,
      kineticEnergy: Math.round(kineticEnergy),
      recommendedProducts,
      calculation: {
        mass: massKg,
        loadMass: loadKg,
        speed: speedKmh,
        angle: impactAngle,
        velocityComponent: (velocityMs * sineFromPas13Table(impactAngle)).toFixed(2),
        alignedMinSafetyMarginPct: PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT,
        standardVersion: PAS13_VERSION,
        footnote: PAS13_INDICATIVE_FOOTNOTE,
      },
    });
  } catch (error) {
    console.error("Error calculating impact:", error);
    return c.json({ message: "Failed to calculate impact energy" }, 500);
  }
});

// DELETE /api/site-survey-areas/:id
siteSurveys.delete("/site-survey-areas/:id", mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;

    // Ownership check: area -> parent survey -> userId
    const area = await storage.getSiteSurveyArea(c.req.param("id"));
    if (!area) {
      return c.json({ error: "Site survey area not found" }, 404);
    }
    const survey = await storage.getSiteSurvey(area.siteSurveyId);
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey area not found" }, 404);
    }

    await storage.deleteSiteSurveyArea(c.req.param("id"));
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting site survey area:", error);
    return c.json({ message: "Failed to delete site survey area" }, 500);
  }
});

// =============================================
// RISK REGISTER ROUTES (Phase 3, Tasks S3/S4)
// =============================================

/** Fields written by every assessment (from-observations and reassess). */
function assessmentColumns(a: AreaAssessment, level: RiskLevel) {
  return {
    likelihood: a.risk.likelihood,
    severity: a.risk.severity,
    riskScore: a.risk.score,
    riskLevel: level,
    priority: priorityForLevel(level),
    justification: rationaleToJustification(a.risk.rationale),
    pas13Verdict: a.pas13Verdict,
  };
}

// POST /api/site-surveys/:id/areas/from-observations — confirm a zone from
// the review screen: creates the area(s), links photos, runs the PAS 13
// energy calc + product recommendations and the risk register, re-ranks.
siteSurveys.post(
  "/site-surveys/:id/areas/from-observations",
  heavyMutationRateLimit,
  async (c) => {
    try {
      const db = getDb(c.env.DATABASE_URL);
      const storage = createStorage(db);
      const userId = c.get("user").claims.sub;
      const surveyId = c.req.param("id");
      const survey = await storage.getSiteSurvey(surveyId);
      if (!survey || survey.userId !== userId) {
        return c.json({ error: "Site survey not found" }, 404);
      }
      const parsed = parseBody(areasFromObservationsSchema, await c.req.json());
      if (!parsed.ok) {
        return c.json({ message: parsed.message }, 400);
      }
      const body = parsed.data;

      // Every referenced photo must belong to this survey.
      const photoIds = [...new Set(body.observations.map((o) => o.photoId))];
      const photos = await db
        .select()
        .from(surveyPhotosTable)
        .where(
          and(eq(surveyPhotosTable.siteSurveyId, surveyId), inArray(surveyPhotosTable.id, photoIds)),
        );
      const photoById = new Map(photos.map((p) => [p.id, p]));
      const missing = photoIds.filter((id) => !photoById.has(id));
      if (missing.length > 0) {
        return c.json(
          { message: `Unknown photo id(s) for this survey: ${missing.join(", ")}` },
          400,
        );
      }

      await ensurePas13ClassesLoaded(c.env);
      const products = await storage.getProducts();

      const groups: ConfirmedObservation[][] = body.mergeIntoOneArea
        ? [body.observations]
        : body.observations.map((o) => [o]);

      const created: Array<{ area: SiteSurveyArea; photos: SurveyPhoto[] }> = [];
      const nameOrdinals = new Map<string, number>();
      for (const group of groups) {
        const merged = mergeObservations(group);
        const ordinal = (nameOrdinals.get(merged.areaType) ?? 0) + 1;
        nameOrdinals.set(merged.areaType, ordinal);
        const groupPhotos = group.map((o) => photoById.get(o.photoId) as SurveyPhoto);

        const assessment = assessArea({
          vehicleKg: body.vehicleMassKg,
          loadKg: body.loadMassKg,
          speedKmh: body.speedKmh,
          angleDeg: MAX_IMPACT_ANGLE,
          trafficDensity: body.trafficDensity,
          pedestrianExposure: merged.pedestrianExposure,
          existingProtection: merged.existingProtection,
          condition: merged.condition,
          hazardSeverities: merged.hazards.map((h) => h.severity),
          areaType: merged.areaType,
          products,
        });
        const level = merged.riskLevelOverride ?? assessment.risk.level;
        const aiObservation =
          groupPhotos
            .map((p) => aiObservationFromAnalysis(p.analysis))
            .filter((t): t is string => t !== null)
            .join("\n\n") || null;
        const firstGps = groupPhotos.find((p) => p.lat !== null && p.lng !== null);

        const area = await storage.createSiteSurveyArea({
          siteSurveyId: surveyId,
          zoneName: body.zoneName,
          areaType: merged.areaType,
          areaName: areaNameFor(body.zoneName, merged.areaType, ordinal),
          currentCondition: merged.condition,
          issueDescription: merged.observationText || aiObservation || "No observation recorded.",
          recommendedAction: recommendedActionFor(
            assessment.topProduct,
            body.recommendedLengthM,
            level,
          ),
          coordinates: firstGps ? { lat: firstGps.lat, lng: firstGps.lng } : null,
          photosUrls: groupPhotos.map((p) => photoObjectUrl(p.objectKey)),
          vehicleWeight: body.vehicleMassKg,
          vehicleSpeed: body.speedKmh,
          impactAngle: MAX_IMPACT_ANGLE,
          calculatedJoules: assessment.calculatedJoules,
          recommendedProducts: assessment.recommendedProducts,
          loadMass: body.loadMassKg,
          trafficDensity: body.trafficDensity,
          pedestrianExposure: merged.pedestrianExposure,
          existingProtection: merged.existingProtection,
          recommendedLengthM: body.recommendedLengthM ?? null,
          aiObservation,
          ...assessmentColumns(assessment, level),
        });

        await db
          .update(surveyPhotosTable)
          .set({ areaId: area.id, zoneName: body.zoneName })
          .where(
            and(
              eq(surveyPhotosTable.siteSurveyId, surveyId),
              inArray(
                surveyPhotosTable.id,
                group.map((o) => o.photoId),
              ),
            ),
          );
        created.push({
          area,
          photos: groupPhotos.map((p) => ({ ...p, areaId: area.id, zoneName: body.zoneName })),
        });
      }

      const ranked = await storage.rankSurveyAreas(surveyId);
      const rankById = new Map(ranked.map((a) => [a.id, a.priorityRank ?? null]));

      return c.json(
        {
          zoneName: body.zoneName,
          areas: created.map(({ area, photos: areaPhotos }) =>
            toRegisterArea({ ...area, priorityRank: rankById.get(area.id) ?? null }, areaPhotos),
          ),
        },
        201,
      );
    } catch (error) {
      console.error("Error creating areas from observations:", error);
      return c.json({ message: "Failed to create areas from observations" }, 500);
    }
  },
);

// POST /api/site-surveys/:id/areas/:areaId/reassess — re-run the assessment
// from the stored area fields (after a rep edits the area). Hazard
// severities come from the linked photos' vision analysis.
siteSurveys.post("/site-surveys/:id/areas/:areaId/reassess", mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const surveyId = c.req.param("id");
    const areaId = c.req.param("areaId");
    const survey = await storage.getSiteSurvey(surveyId);
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey not found" }, 404);
    }
    const area = await storage.getSiteSurveyArea(areaId);
    if (!area || area.siteSurveyId !== surveyId) {
      return c.json({ error: "Site survey area not found" }, 404);
    }

    await ensurePas13ClassesLoaded(c.env);
    const products = await storage.getProducts();
    const photos = await db
      .select()
      .from(surveyPhotosTable)
      .where(eq(surveyPhotosTable.areaId, areaId));

    const assessment = assessArea({
      vehicleKg: area.vehicleWeight,
      loadKg: area.loadMass,
      speedKmh: area.vehicleSpeed,
      angleDeg: area.impactAngle,
      trafficDensity: normaliseTrafficDensity(area.trafficDensity),
      pedestrianExposure: normalisePedestrianExposure(area.pedestrianExposure),
      existingProtection: normaliseExistingProtection(area.existingProtection),
      condition: normaliseCondition(area.currentCondition),
      hazardSeverities: photos.flatMap((p) => hazardSeveritiesFromAnalysis(p.analysis)),
      areaType: area.areaType,
      products,
    });
    const level = assessment.risk.level;

    const updated = await storage.updateSiteSurveyArea(areaId, {
      ...assessmentColumns(assessment, level),
      // Keep an existing calculation when the area has no vehicle data.
      ...(assessment.calculatedJoules !== null
        ? {
            calculatedJoules: assessment.calculatedJoules,
            recommendedProducts: assessment.recommendedProducts,
            recommendedAction: recommendedActionFor(
              assessment.topProduct,
              area.recommendedLengthM,
              level,
            ),
          }
        : {}),
    });

    const ranked = await storage.rankSurveyAreas(surveyId);
    const priorityRank = ranked.find((a) => a.id === areaId)?.priorityRank ?? null;
    return c.json(toRegisterArea({ ...updated, priorityRank }, photos));
  } catch (error) {
    console.error("Error reassessing site survey area:", error);
    return c.json({ message: "Failed to reassess site survey area" }, 500);
  }
});

// GET /api/site-surveys/:id/register — the risk register: areas by
// priority_rank, the 5×5 count matrix and counts by level.
siteSurveys.get("/site-surveys/:id/register", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const surveyId = c.req.param("id");
    const survey = await storage.getSiteSurvey(surveyId);
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey not found" }, 404);
    }

    const [areas, photos] = await Promise.all([
      storage.getSiteSurveyAreas(surveyId),
      db.select().from(surveyPhotosTable).where(eq(surveyPhotosTable.siteSurveyId, surveyId)),
    ]);
    const photosByArea = groupPhotosByArea(photos);
    const ordered = sortForRegister(areas);
    const summary = summariseRegister(areas);
    const highest = ordered.find((a) => a.priorityRank !== null && a.priorityRank !== undefined);

    return c.json({
      surveyId,
      areas: ordered.map((a) => toRegisterArea(a, photosByArea.get(a.id) ?? [])),
      matrix: buildRiskMatrix(areas),
      summary: {
        ...summary,
        photos: photos.length,
        highestPriorityAreaId: highest?.id ?? null,
        highestPriorityZone: highest?.zoneName ?? null,
      },
      bands: RISK_LEVEL_BANDS,
    });
  } catch (error) {
    console.error("Error fetching risk register:", error);
    return c.json({ message: "Failed to fetch risk register" }, 500);
  }
});

export default siteSurveys;
