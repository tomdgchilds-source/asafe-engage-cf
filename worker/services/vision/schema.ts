// ─────────────────────────────────────────────────────────
// VisionObservation — the structured result of analysing one survey
// photo. Both providers (Anthropic, OpenAI) must return JSON that parses
// against this schema; anything else is retried once, then rejected.
// Keep this in sync with the schema text in prompt.ts.
// ─────────────────────────────────────────────────────────
import { z } from "zod";

export const AreaTypeEnum = z.enum([
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
]);
export type AreaType = z.infer<typeof AreaTypeEnum>;

export const ObservedElementTypeEnum = z.enum([
  "racking",
  "dock",
  "column",
  "door",
  "pedestrian_route",
  "existing_barrier",
  "floor",
  "vehicle",
  "machinery",
  "edge",
  "signage",
  "other",
]);

export const ElementConditionEnum = z.enum([
  "good",
  "damaged",
  "critical",
  "unprotected",
  "unknown",
]);

export const HazardTagEnum = z.enum([
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
]);

export const SeverityEnum = z.enum(["low", "medium", "high", "critical"]);

export const VehicleEnum = z.enum([
  "counterbalance_forklift",
  "reach_truck",
  "pallet_truck",
  "tug",
  "hgv",
  "van",
  "car",
  "none",
  "unknown",
]);

export const FloorTypeEnum = z.enum([
  "concrete",
  "asphalt",
  "tiled",
  "paving",
  "steel",
  "unknown",
]);

export const ExistingProtectionEnum = z.enum(["none", "partial", "adequate", "unknown"]);

export const PedestrianExposureEnum = z.enum([
  "none",
  "occasional",
  "frequent",
  "constant",
  "unknown",
]);

export const VisionObservation = z.object({
  sceneSummary: z.string().max(400),
  areaType: AreaTypeEnum,
  observedElements: z
    .array(
      z.object({
        type: ObservedElementTypeEnum,
        condition: ElementConditionEnum,
        note: z.string().max(200),
      }),
    )
    .max(12),
  hazards: z
    .array(
      z.object({
        tag: HazardTagEnum,
        severity: SeverityEnum,
        evidence: z.string().max(200),
      }),
    )
    .max(8),
  likelyVehicles: z.array(VehicleEnum).max(4),
  floorType: FloorTypeEnum,
  existingProtection: ExistingProtectionEnum,
  pedestrianExposure: PedestrianExposureEnum,
  suggestedRiskLevel: SeverityEnum,
  confidence: z.number().min(0).max(1),
  // 2-3 report-ready sentences, British English, no hedging words like "appears"
  observation: z.string().max(600),
});
export type VisionObservation = z.infer<typeof VisionObservation>;
