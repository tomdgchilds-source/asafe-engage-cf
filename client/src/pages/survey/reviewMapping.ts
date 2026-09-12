// ─────────────────────────────────────────────────────────
// reviewMapping — pure mapping for the Survey Review screen (Phase 3, Task S3).
//
//   VisionObservation (photo.analysis)  →  ObservationCardState (card defaults)
//   ObservationCardState                →  ConfirmedObservation (request body item)
//   observed vehicle types              →  PAS 13 class defaults for the zone form
//   photos                              →  zones (grouped, ordered, confirmed?)
//
// No React, no I/O. The request body shapes mirror `confirmedObservationSchema`
// and `areasFromObservationsSchema` in worker/routes/siteSurveys.ts exactly.
// ─────────────────────────────────────────────────────────
import { APPLICATION_AREA_TYPES } from "@shared/applicationAreas";
import { PAS13_VEHICLE_CLASS_TABLE, type VehicleClassRow } from "@shared/pas13Rules";
import type { SurveyPhotoView } from "./useSurveyPhotos";

// =============================================
// VOCABULARIES (mirror worker/services/vision/schema.ts + siteSurveys.ts)
// =============================================

export const VISION_AREA_TYPES = [
  "racking_aisle",
  "loading_dock",
  "pedestrian_walkway",
  "column_protection",
  "door_or_gate",
  "machinery_perimeter",
  "cold_storage",
  "car_park",
  "yard_or_external",
  "mezzanine_edge",
  "charging_area",
  "conveyor_or_process",
  "other",
] as const;
export type VisionAreaType = (typeof VISION_AREA_TYPES)[number];

export const ELEMENT_CONDITIONS = ["good", "damaged", "critical", "unprotected", "unknown"] as const;
export type ElementCondition = (typeof ELEMENT_CONDITIONS)[number];

/** What the server's `confirmedObservationSchema.condition` accepts. */
export const AREA_CONDITIONS = ["good", "damaged", "critical", "unprotected"] as const;
export type AreaCondition = (typeof AREA_CONDITIONS)[number];

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const HAZARD_TAGS = [
  "vehicle_pedestrian_conflict",
  "unprotected_racking",
  "unprotected_column",
  "damaged_barrier",
  "dock_edge",
  "blind_corner",
  "no_segregation",
  "floor_damage",
  "overhead_services",
  "other",
] as const;
export type HazardTag = (typeof HAZARD_TAGS)[number];

export const VEHICLE_TYPES = [
  "counterbalance_forklift",
  "reach_truck",
  "pallet_truck",
  "tug",
  "hgv",
  "van",
  "car",
] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const FLOOR_TYPES = ["concrete", "asphalt", "tiled", "paving", "steel", "unknown"] as const;
export type FloorType = (typeof FLOOR_TYPES)[number];

export const PEDESTRIAN_EXPOSURES = ["none", "occasional", "frequent", "constant", "unknown"] as const;
export type PedestrianExposure = (typeof PEDESTRIAN_EXPOSURES)[number];

export const EXISTING_PROTECTIONS = ["none", "partial", "adequate", "unknown"] as const;
export type ExistingProtection = (typeof EXISTING_PROTECTIONS)[number];

export const TRAFFIC_DENSITIES = ["low", "medium", "high"] as const;
export type TrafficDensity = (typeof TRAFFIC_DENSITIES)[number];

/** Structural mirror of VisionObservation (worker/services/vision/schema.ts). */
export interface VisionAnalysis {
  sceneSummary: string;
  areaType: string;
  observedElements: Array<{ type: string; condition: string; note: string }>;
  hazards: Array<{ tag: string; severity: string; evidence: string }>;
  likelyVehicles: string[];
  floorType: string;
  existingProtection: string;
  pedestrianExposure: string;
  suggestedRiskLevel: string;
  confidence: number;
  observation: string;
}

/** Below this the card shows the amber "Check this" banner. */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

/** Photos with no zone are grouped under this name. */
export const UNZONED_NAME = "Unzoned";

// =============================================
// LABELS
// =============================================

/** "vehicle_pedestrian_conflict" → "Vehicle pedestrian conflict". */
export function humanise(value: string): string {
  const words = value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!words) return "";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  counterbalance_forklift: "Counterbalance forklift",
  reach_truck: "Reach truck",
  pallet_truck: "Pallet truck",
  tug: "Tug / tow tractor",
  hgv: "HGV",
  van: "Van",
  car: "Car",
};

export const HAZARD_LABELS: Record<HazardTag, string> = {
  vehicle_pedestrian_conflict: "Vehicle / pedestrian conflict",
  unprotected_racking: "Unprotected racking",
  unprotected_column: "Unprotected column",
  damaged_barrier: "Damaged barrier",
  dock_edge: "Dock edge",
  blind_corner: "Blind corner",
  no_segregation: "No segregation",
  floor_damage: "Floor damage",
  overhead_services: "Overhead services",
  other: "Other hazard",
};

export function hazardLabel(tag: string): string {
  return (HAZARD_LABELS as Record<string, string>)[tag] ?? humanise(tag);
}

export function vehicleLabel(type: string): string {
  return (VEHICLE_LABELS as Record<string, string>)[type] ?? humanise(type);
}

// =============================================
// AREA TYPES
// =============================================

/** Area types the vision model can name that the app's canonical list lacks. */
export const EXTRA_AREA_TYPES = ["Car Park", "Yard / External", "Mezzanine Edge", "Charging Area", "Other"] as const;

/** Options for the area-type select: the app's canonical types, then the extras. */
export const AREA_TYPE_OPTIONS: readonly string[] = [...APPLICATION_AREA_TYPES, ...EXTRA_AREA_TYPES];

export const DEFAULT_AREA_TYPE = "Other";

const VISION_AREA_TYPE_TO_APP: Record<VisionAreaType, string> = {
  racking_aisle: "Racking",
  loading_dock: "Loading Docks",
  pedestrian_walkway: "Pedestrian Walkways",
  column_protection: "Columns (Structural / Mezzanine)",
  door_or_gate: "Shutter Doors",
  machinery_perimeter: "Processing Machines",
  cold_storage: "Cold Store Walls",
  car_park: "Car Park",
  yard_or_external: "Yard / External",
  mezzanine_edge: "Mezzanine Edge",
  charging_area: "Charging Area",
  conveyor_or_process: "Processing Machines",
  other: "Other",
};

/** Vision `areaType` → the app's area-type label; unknown values → "Other". */
export function mapAreaType(visionAreaType: string | null | undefined): string {
  const key = (visionAreaType ?? "").trim() as VisionAreaType;
  return VISION_AREA_TYPE_TO_APP[key] ?? DEFAULT_AREA_TYPE;
}

// =============================================
// CARD STATE
// =============================================

export interface CardHazard {
  tag: string;
  severity: RiskLevel;
  evidence: string;
}

export interface ObservationCardState {
  photoId: string;
  sceneSummary: string;
  areaType: string;
  condition: AreaCondition;
  riskLevel: RiskLevel;
  /** "ai": pre-filled suggestion, register decides. "rep": explicit override sent to the server. */
  riskSource: "ai" | "rep";
  hazards: CardHazard[];
  vehicles: string[];
  pedestrianExposure: PedestrianExposure;
  existingProtection: ExistingProtection;
  floorType: FloorType;
  observationText: string;
  /** 0..1 from the model; null when the card was built without an analysis. */
  confidence: number | null;
  /** Whether the defaults came from a model analysis or are empty placeholders. */
  seededFrom: "analysis" | "empty";
  /** True once the rep edits anything — an arriving analysis must not overwrite edits. */
  touched: boolean;
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

const CONDITION_WORST_FIRST: readonly AreaCondition[] = ["critical", "unprotected", "damaged", "good"];

/**
 * The area's current condition, derived from what the model saw: the worst
 * element condition (critical > unprotected > damaged > good). "unknown"
 * elements are ignored. A damaged-barrier hazard is at least "damaged".
 * With nothing usable, no existing protection → "unprotected", else "good".
 */
export function deriveCondition(analysis: Pick<VisionAnalysis, "observedElements" | "hazards" | "existingProtection">): AreaCondition {
  const seen = new Set<AreaCondition>();
  for (const el of analysis.observedElements ?? []) {
    if (oneOf(AREA_CONDITIONS, el.condition)) seen.add(el.condition);
  }
  if ((analysis.hazards ?? []).some((h) => h.tag === "damaged_barrier")) seen.add("damaged");
  for (const c of CONDITION_WORST_FIRST) if (seen.has(c)) return c;
  return analysis.existingProtection === "none" ? "unprotected" : "good";
}

/** Card with empty defaults — for failed / skipped / not-yet-analysed photos. */
export function emptyCard(photoId: string, seed: { voiceNote?: string | null } = {}): ObservationCardState {
  return {
    photoId,
    sceneSummary: "",
    areaType: DEFAULT_AREA_TYPE,
    condition: "unprotected",
    riskLevel: "medium",
    riskSource: "ai",
    hazards: [],
    vehicles: [],
    pedestrianExposure: "unknown",
    existingProtection: "unknown",
    floorType: "unknown",
    observationText: (seed.voiceNote ?? "").trim(),
    confidence: null,
    seededFrom: "empty",
    touched: false,
  };
}

/** Card pre-filled from a VisionObservation. Tolerates unexpected enum values. */
export function cardFromAnalysis(photoId: string, analysis: VisionAnalysis): ObservationCardState {
  const hazards: CardHazard[] = (analysis.hazards ?? [])
    .filter((h) => typeof h.tag === "string" && h.tag.trim().length > 0)
    .map((h) => ({
      tag: h.tag,
      severity: oneOf(RISK_LEVELS, h.severity) ? h.severity : "medium",
      evidence: h.evidence ?? "",
    }));
  const vehicles = Array.from(
    new Set((analysis.likelyVehicles ?? []).filter((v): v is VehicleType => oneOf(VEHICLE_TYPES, v))),
  );
  const confidence =
    typeof analysis.confidence === "number" && Number.isFinite(analysis.confidence)
      ? Math.min(1, Math.max(0, analysis.confidence))
      : null;
  return {
    photoId,
    sceneSummary: analysis.sceneSummary ?? "",
    areaType: mapAreaType(analysis.areaType),
    condition: deriveCondition(analysis),
    riskLevel: oneOf(RISK_LEVELS, analysis.suggestedRiskLevel) ? analysis.suggestedRiskLevel : "medium",
    riskSource: "ai",
    hazards,
    vehicles,
    pedestrianExposure: oneOf(PEDESTRIAN_EXPOSURES, analysis.pedestrianExposure) ? analysis.pedestrianExposure : "unknown",
    existingProtection: oneOf(EXISTING_PROTECTIONS, analysis.existingProtection) ? analysis.existingProtection : "unknown",
    floorType: oneOf(FLOOR_TYPES, analysis.floorType) ? analysis.floorType : "unknown",
    observationText: (analysis.observation ?? "").trim(),
    confidence,
    seededFrom: "analysis",
    touched: false,
  };
}

/** Loose structural check so a malformed `analysis` JSON never crashes the screen. */
export function isVisionAnalysis(value: unknown): value is VisionAnalysis {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.areaType === "string" && typeof v.observation === "string" && Array.isArray(v.hazards);
}

/** Build the right card for a photo from its current server state. */
export function cardForPhoto(photo: Pick<SurveyPhotoView, "id" | "analysis" | "analysisStatus" | "voiceNote">): ObservationCardState {
  if (photo.analysisStatus === "done" && isVisionAnalysis(photo.analysis)) {
    return cardFromAnalysis(photo.id, photo.analysis);
  }
  return emptyCard(photo.id, { voiceNote: photo.voiceNote });
}

/**
 * When a photo's analysis lands after its card was created, replace the empty
 * placeholder — but never a card the rep has already edited.
 */
export function shouldReseed(existing: ObservationCardState | undefined, photo: Pick<SurveyPhotoView, "analysisStatus" | "analysis">): boolean {
  if (!existing) return true;
  if (existing.touched || existing.seededFrom === "analysis") return false;
  return photo.analysisStatus === "done" && isVisionAnalysis(photo.analysis);
}

export function isLowConfidence(card: Pick<ObservationCardState, "confidence" | "seededFrom">): boolean {
  return card.seededFrom === "analysis" && card.confidence !== null && card.confidence < LOW_CONFIDENCE_THRESHOLD;
}

// =============================================
// CARD → REQUEST BODY
// =============================================

/** One item of `areasFromObservationsSchema.observations` (server shape). */
export interface ConfirmedObservationBody {
  photoId: string;
  areaType: string;
  condition: AreaCondition;
  riskLevelOverride?: RiskLevel;
  hazards: Array<{ tag: string; severity: RiskLevel }>;
  vehicles: string[];
  pedestrianExposure: PedestrianExposure;
  existingProtection: ExistingProtection;
  floorType?: string;
  observationText: string;
}

export function cardToObservation(card: ObservationCardState): ConfirmedObservationBody {
  const body: ConfirmedObservationBody = {
    photoId: card.photoId,
    areaType: card.areaType.trim().slice(0, 80) || DEFAULT_AREA_TYPE,
    condition: card.condition,
    hazards: card.hazards.slice(0, 20).map((h) => ({ tag: h.tag.trim().slice(0, 60), severity: h.severity })),
    vehicles: Array.from(new Set(card.vehicles.map((v) => v.trim()).filter(Boolean))).slice(0, 10),
    pedestrianExposure: card.pedestrianExposure,
    existingProtection: card.existingProtection,
    observationText: card.observationText.trim().slice(0, 4000),
  };
  if (card.riskSource === "rep") body.riskLevelOverride = card.riskLevel;
  if (card.floorType !== "unknown") body.floorType = card.floorType;
  return body;
}

// =============================================
// ZONE DEFAULTS FROM PAS 13 CLASSES
// =============================================

/** Typical unladen vehicle mass and rated load per vehicle type (kg). */
export const VEHICLE_MASS_PRESETS: Record<VehicleType, { vehicleKg: number; loadKg: number }> = {
  pallet_truck: { vehicleKg: 700, loadKg: 800 },
  tug: { vehicleKg: 2_500, loadKg: 1_000 },
  car: { vehicleKg: 1_500, loadKg: 0 },
  van: { vehicleKg: 2_500, loadKg: 1_000 },
  counterbalance_forklift: { vehicleKg: 3_500, loadKg: 1_000 },
  reach_truck: { vehicleKg: 4_000, loadKg: 1_500 },
  hgv: { vehicleKg: 12_000, loadKg: 20_000 },
};

/** Plan default: counterbalance forklift 3,500 kg + 1,000 kg load. */
export const FALLBACK_VEHICLE: VehicleType = "counterbalance_forklift";
/** Plan default when no class speed applies. */
export const FALLBACK_SPEED_KMH = 10;

export interface ZoneDefaults {
  vehicleMassKg: number;
  loadMassKg: number;
  speedKmh: number;
  /** PAS 13 class implied by the heaviest observed vehicle, or null if the table has no fit. */
  classCode: string | null;
  /** The vehicle type the defaults were taken from. */
  vehicleType: VehicleType;
}

/** First class row (lightest → heaviest) whose mass ceiling fits `totalMassKg`. */
export function classForMass(totalMassKg: number, table: readonly VehicleClassRow[] = PAS13_VEHICLE_CLASS_TABLE): VehicleClassRow | null {
  const sorted = [...table].sort((a, b) => a.totalMassMaxKg - b.totalMassMaxKg);
  return sorted.find((row) => totalMassKg <= row.totalMassMaxKg) ?? sorted[sorted.length - 1] ?? null;
}

/**
 * Zone-form defaults from the vehicle types observed across the zone's cards.
 * Picks the heaviest observed vehicle's preset, classifies it against the PAS
 * 13 table, and uses that class's speed ceiling when it is finite (T4 is
 * open-ended, so it falls back to 10 km/h).
 */
export function zoneDefaultsFromVehicles(vehicles: readonly string[], table: readonly VehicleClassRow[] = PAS13_VEHICLE_CLASS_TABLE): ZoneDefaults {
  const known = vehicles.filter((v): v is VehicleType => oneOf(VEHICLE_TYPES, v));
  let vehicleType: VehicleType = FALLBACK_VEHICLE;
  let best = -1;
  for (const v of known) {
    const p = VEHICLE_MASS_PRESETS[v];
    const total = p.vehicleKg + p.loadKg;
    if (total > best) {
      best = total;
      vehicleType = v;
    }
  }
  const preset = VEHICLE_MASS_PRESETS[vehicleType];
  const row = classForMass(preset.vehicleKg + preset.loadKg, table);
  const speedKmh = row && Number.isFinite(row.speedMaxKmh) ? row.speedMaxKmh : FALLBACK_SPEED_KMH;
  return {
    vehicleMassKg: preset.vehicleKg,
    loadMassKg: preset.loadKg,
    speedKmh,
    classCode: row?.classCode ?? null,
    vehicleType,
  };
}

// =============================================
// ZONE FORM + REQUEST
// =============================================

export interface ZoneFormState {
  trafficDensity: TrafficDensity;
  vehicleMassKg: number;
  loadMassKg: number;
  speedKmh: number;
  /** Rep-entered run length in metres; null until entered. */
  recommendedLengthM: number | null;
  mergeIntoOneArea: boolean;
  /** True once the rep edits any zone field — vehicle-driven defaults stop applying. */
  touched: boolean;
}

export function zoneFormFromDefaults(defaults: ZoneDefaults): ZoneFormState {
  return {
    trafficDensity: "medium",
    vehicleMassKg: defaults.vehicleMassKg,
    loadMassKg: defaults.loadMassKg,
    speedKmh: defaults.speedKmh,
    recommendedLengthM: null,
    mergeIntoOneArea: true,
    touched: false,
  };
}

/** Body of POST /api/site-surveys/:id/areas/from-observations (server shape). */
export interface AreasFromObservationsRequest {
  zoneName: string;
  mergeIntoOneArea: boolean;
  trafficDensity: TrafficDensity;
  vehicleMassKg: number;
  loadMassKg: number;
  speedKmh: number;
  recommendedLengthM?: number;
  observations: ConfirmedObservationBody[];
}

export type ZoneValidationError =
  | "no_observations"
  | "vehicle_mass"
  | "load_mass"
  | "speed"
  | "length";

/** Mirrors the server's numeric bounds so the button can be disabled with a reason. */
export function validateZoneForm(form: ZoneFormState, observationCount: number): ZoneValidationError | null {
  if (observationCount < 1) return "no_observations";
  if (!(form.vehicleMassKg > 0) || form.vehicleMassKg > 200_000) return "vehicle_mass";
  if (!(form.loadMassKg >= 0) || form.loadMassKg > 200_000) return "load_mass";
  if (!(form.speedKmh > 0) || form.speedKmh > 120) return "speed";
  if (form.recommendedLengthM !== null && (!(form.recommendedLengthM >= 0) || form.recommendedLengthM > 10_000)) return "length";
  return null;
}

export function buildZoneRequest(zoneName: string, form: ZoneFormState, cards: readonly ObservationCardState[]): AreasFromObservationsRequest {
  const body: AreasFromObservationsRequest = {
    zoneName: zoneName.trim().slice(0, 120),
    mergeIntoOneArea: form.mergeIntoOneArea,
    trafficDensity: form.trafficDensity,
    vehicleMassKg: form.vehicleMassKg,
    loadMassKg: form.loadMassKg,
    speedKmh: form.speedKmh,
    observations: cards.slice(0, 50).map(cardToObservation),
  };
  if (form.recommendedLengthM !== null && form.recommendedLengthM >= 0) body.recommendedLengthM = form.recommendedLengthM;
  return body;
}

// =============================================
// ZONES FROM PHOTOS
// =============================================

export interface ZoneGroup {
  zoneName: string;
  /** Oldest first (walk order). */
  photos: SurveyPhotoView[];
  /** Photos the server has already linked to an area. */
  confirmedPhotos: SurveyPhotoView[];
  /** Photos still awaiting confirmation. */
  openPhotos: SurveyPhotoView[];
  /** True when every photo in the zone is linked to an area. */
  confirmed: boolean;
}

function photoTime(p: Pick<SurveyPhotoView, "takenAt" | "createdAt">): number {
  const t = Date.parse(p.takenAt ?? p.createdAt ?? "");
  return Number.isFinite(t) ? t : 0;
}

/** Group photos by zone (first-seen order by time), each zone's photos oldest first. */
export function groupPhotosByZone(photos: readonly SurveyPhotoView[]): ZoneGroup[] {
  const ordered = [...photos].sort((a, b) => photoTime(a) - photoTime(b) || a.id.localeCompare(b.id));
  const byZone = new Map<string, SurveyPhotoView[]>();
  for (const p of ordered) {
    const name = (p.zoneName ?? "").trim() || UNZONED_NAME;
    const list = byZone.get(name);
    if (list) list.push(p);
    else byZone.set(name, [p]);
  }
  return Array.from(byZone, ([zoneName, list]) => {
    const confirmedPhotos = list.filter((p) => !!p.areaId);
    const openPhotos = list.filter((p) => !p.areaId);
    return { zoneName, photos: list, confirmedPhotos, openPhotos, confirmed: list.length > 0 && openPhotos.length === 0 };
  });
}

export function isPhotoPending(photo: Pick<SurveyPhotoView, "analysisStatus">): boolean {
  return photo.analysisStatus === "pending";
}

export function isPhotoUnanalysed(photo: Pick<SurveyPhotoView, "analysisStatus" | "analysis">): boolean {
  return photo.analysisStatus !== "done" || !isVisionAnalysis(photo.analysis);
}

// =============================================
// REGISTER AREA (response summary shown after confirm)
// =============================================

/** The slice of the server's RegisterArea the review screen renders. */
export interface RegisterAreaSummary {
  id: string;
  zoneName: string;
  areaName: string;
  areaType: string;
  areaTypeLabel: string;
  riskLevel: RiskLevel | null;
  likelihood: number | null;
  severity: number | null;
  riskScore: number | null;
  priorityRank: number | null;
  recommendedLengthM: number | null;
  topProduct: { productId: string; productName: string; safetyMarginPct: number; notAligned: boolean; reason: string } | null;
  pas13Verdict: { verdict: "aligned" | "borderline" | "not_aligned"; summary: string } | null;
  rationale: string[];
  photos: Array<{ id: string }>;
}

export interface FromObservationsResponse {
  zoneName: string;
  areas: RegisterAreaSummary[];
}

export const RISK_LEVEL_CLASS: Record<RiskLevel, string> = {
  low: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  medium: "bg-amber-100 text-amber-800 ring-amber-200",
  high: "bg-orange-100 text-orange-800 ring-orange-200",
  critical: "bg-red-100 text-red-800 ring-red-200",
};

export const VERDICT_CLASS: Record<"aligned" | "borderline" | "not_aligned", string> = {
  aligned: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  borderline: "bg-amber-100 text-amber-800 ring-amber-200",
  not_aligned: "bg-red-100 text-red-800 ring-red-200",
};

export const VERDICT_LABEL: Record<"aligned" | "borderline" | "not_aligned", string> = {
  aligned: "PAS 13 aligned",
  borderline: "PAS 13 borderline",
  not_aligned: "Not PAS 13 aligned",
};
