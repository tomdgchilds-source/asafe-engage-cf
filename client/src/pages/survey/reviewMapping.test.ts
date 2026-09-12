import { describe, expect, it } from "vitest";
import { PAS13_VEHICLE_CLASS_TABLE } from "@shared/pas13Rules";
import {
  AREA_TYPE_OPTIONS,
  buildZoneRequest,
  cardForPhoto,
  cardFromAnalysis,
  cardToObservation,
  classForMass,
  deriveCondition,
  emptyCard,
  groupPhotosByZone,
  isLowConfidence,
  isVisionAnalysis,
  mapAreaType,
  shouldReseed,
  validateZoneForm,
  zoneDefaultsFromVehicles,
  zoneFormFromDefaults,
  type VisionAnalysis,
} from "./reviewMapping";
import type { SurveyPhotoView } from "./useSurveyPhotos";

const analysis: VisionAnalysis = {
  sceneSummary: "Racking aisle with a counterbalance forklift and no end-of-aisle protection.",
  areaType: "racking_aisle",
  observedElements: [
    { type: "racking", condition: "unprotected", note: "No end-of-aisle barrier" },
    { type: "floor", condition: "good", note: "Sound concrete" },
    { type: "vehicle", condition: "unknown", note: "Forklift in aisle" },
  ],
  hazards: [
    { tag: "unprotected_racking", severity: "high", evidence: "Uprights exposed to forklift impact" },
    { tag: "vehicle_pedestrian_conflict", severity: "medium", evidence: "Picker working in aisle" },
  ],
  likelyVehicles: ["counterbalance_forklift", "pallet_truck", "unknown"],
  floorType: "concrete",
  existingProtection: "none",
  pedestrianExposure: "occasional",
  suggestedRiskLevel: "high",
  confidence: 0.82,
  observation: "The racking run is exposed to forklift traffic with no end-of-aisle protection. A rated barrier is required.",
};

function photo(overrides: Partial<SurveyPhotoView>): SurveyPhotoView {
  return {
    id: "p1",
    siteSurveyId: "s1",
    areaId: null,
    zoneName: "Zone 1",
    objectKey: "survey-photos/s1/p1.jpg",
    width: 1280,
    height: 960,
    takenAt: "2026-09-12T08:00:00.000Z",
    lat: null,
    lng: null,
    voiceNote: null,
    analysis: null,
    analysisStatus: "pending",
    analysisModel: null,
    createdAt: "2026-09-12T08:00:00.000Z",
    objectUrl: "/api/objects/survey-photos/s1/p1.jpg",
    ...overrides,
  };
}

describe("mapAreaType", () => {
  it("maps every vision area type onto an option in the select", () => {
    const visionTypes = [
      "racking_aisle", "loading_dock", "pedestrian_walkway", "column_protection", "door_or_gate",
      "machinery_perimeter", "cold_storage", "car_park", "yard_or_external", "mezzanine_edge",
      "charging_area", "conveyor_or_process", "other",
    ];
    for (const t of visionTypes) {
      expect(AREA_TYPE_OPTIONS).toContain(mapAreaType(t));
    }
    expect(mapAreaType("racking_aisle")).toBe("Racking");
    expect(mapAreaType("loading_dock")).toBe("Loading Docks");
    expect(mapAreaType("column_protection")).toBe("Columns (Structural / Mezzanine)");
  });

  it("falls back to Other for unknown or missing values", () => {
    expect(mapAreaType("spaceport")).toBe("Other");
    expect(mapAreaType(null)).toBe("Other");
  });
});

describe("deriveCondition", () => {
  it("takes the worst element condition", () => {
    expect(deriveCondition(analysis)).toBe("unprotected");
    expect(
      deriveCondition({ ...analysis, observedElements: [{ type: "column", condition: "damaged", note: "" }, { type: "column", condition: "critical", note: "" }] }),
    ).toBe("critical");
  });

  it("treats a damaged-barrier hazard as at least damaged", () => {
    expect(
      deriveCondition({
        observedElements: [{ type: "existing_barrier", condition: "unknown", note: "" }],
        hazards: [{ tag: "damaged_barrier", severity: "medium", evidence: "" }],
        existingProtection: "partial",
      }),
    ).toBe("damaged");
  });

  it("uses existing protection when no element condition is usable", () => {
    expect(deriveCondition({ observedElements: [], hazards: [], existingProtection: "none" })).toBe("unprotected");
    expect(deriveCondition({ observedElements: [], hazards: [], existingProtection: "adequate" })).toBe("good");
  });
});

describe("cardFromAnalysis", () => {
  it("pre-fills every field from the observation", () => {
    const card = cardFromAnalysis("p1", analysis);
    expect(card.areaType).toBe("Racking");
    expect(card.condition).toBe("unprotected");
    expect(card.riskLevel).toBe("high");
    expect(card.riskSource).toBe("ai");
    expect(card.hazards).toEqual([
      { tag: "unprotected_racking", severity: "high", evidence: "Uprights exposed to forklift impact" },
      { tag: "vehicle_pedestrian_conflict", severity: "medium", evidence: "Picker working in aisle" },
    ]);
    // "unknown" is not a vehicle chip
    expect(card.vehicles).toEqual(["counterbalance_forklift", "pallet_truck"]);
    expect(card.pedestrianExposure).toBe("occasional");
    expect(card.existingProtection).toBe("none");
    expect(card.floorType).toBe("concrete");
    expect(card.observationText).toBe(analysis.observation);
    expect(card.confidence).toBe(0.82);
    expect(card.seededFrom).toBe("analysis");
    expect(card.touched).toBe(false);
  });

  it("tolerates unexpected enum values without throwing", () => {
    const card = cardFromAnalysis("p1", {
      ...analysis,
      suggestedRiskLevel: "extreme",
      pedestrianExposure: "lots",
      existingProtection: "some",
      floorType: "lava",
      likelyVehicles: ["hovercraft"],
      hazards: [{ tag: "other", severity: "?", evidence: "" }],
      confidence: Number.NaN,
    });
    expect(card.riskLevel).toBe("medium");
    expect(card.pedestrianExposure).toBe("unknown");
    expect(card.existingProtection).toBe("unknown");
    expect(card.floorType).toBe("unknown");
    expect(card.vehicles).toEqual([]);
    expect(card.hazards[0].severity).toBe("medium");
    expect(card.confidence).toBeNull();
  });
});

describe("cardForPhoto / shouldReseed / isLowConfidence", () => {
  it("uses the analysis only when status is done and the JSON is well-formed", () => {
    expect(cardForPhoto(photo({ analysisStatus: "done", analysis })).seededFrom).toBe("analysis");
    expect(cardForPhoto(photo({ analysisStatus: "failed", analysis })).seededFrom).toBe("empty");
    expect(cardForPhoto(photo({ analysisStatus: "done", analysis: { junk: true } })).seededFrom).toBe("empty");
    expect(isVisionAnalysis(analysis)).toBe(true);
    expect(isVisionAnalysis({ areaType: 1 })).toBe(false);
  });

  it("seeds the empty card's observation from the voice note", () => {
    expect(emptyCard("p1", { voiceNote: "  Rack end needs a barrier " }).observationText).toBe("Rack end needs a barrier");
    expect(emptyCard("p1").observationText).toBe("");
  });

  it("reseeds an untouched empty card when its analysis arrives, never an edited one", () => {
    const done = photo({ analysisStatus: "done", analysis });
    expect(shouldReseed(undefined, done)).toBe(true);
    expect(shouldReseed(emptyCard("p1"), done)).toBe(true);
    expect(shouldReseed({ ...emptyCard("p1"), touched: true }, done)).toBe(false);
    expect(shouldReseed(cardFromAnalysis("p1", analysis), done)).toBe(false);
    expect(shouldReseed(emptyCard("p1"), photo({ analysisStatus: "pending" }))).toBe(false);
  });

  it("flags confidence below 0.5 only for analysed cards", () => {
    expect(isLowConfidence(cardFromAnalysis("p1", { ...analysis, confidence: 0.3 }))).toBe(true);
    expect(isLowConfidence(cardFromAnalysis("p1", { ...analysis, confidence: 0.5 }))).toBe(false);
    expect(isLowConfidence(emptyCard("p1"))).toBe(false);
  });
});

describe("cardToObservation", () => {
  it("produces the server's confirmedObservationSchema shape", () => {
    const body = cardToObservation(cardFromAnalysis("p1", analysis));
    expect(body).toEqual({
      photoId: "p1",
      areaType: "Racking",
      condition: "unprotected",
      hazards: [
        { tag: "unprotected_racking", severity: "high" },
        { tag: "vehicle_pedestrian_conflict", severity: "medium" },
      ],
      vehicles: ["counterbalance_forklift", "pallet_truck"],
      pedestrianExposure: "occasional",
      existingProtection: "none",
      floorType: "concrete",
      observationText: analysis.observation,
    });
    expect(body).not.toHaveProperty("riskLevelOverride");
  });

  it("sends riskLevelOverride only when the rep changed the risk", () => {
    const card = { ...cardFromAnalysis("p1", analysis), riskLevel: "critical" as const, riskSource: "rep" as const };
    expect(cardToObservation(card).riskLevelOverride).toBe("critical");
  });

  it("omits floorType when unknown and dedupes vehicles", () => {
    const card = { ...emptyCard("p1"), vehicles: ["tug", "tug", " hgv "] };
    const body = cardToObservation(card);
    expect(body).not.toHaveProperty("floorType");
    expect(body.vehicles).toEqual(["tug", "hgv"]);
    expect(body.condition).toBe("unprotected");
  });
});

describe("zoneDefaultsFromVehicles", () => {
  it("falls back to a counterbalance forklift 3,500 kg + 1,000 kg (T3, 15 km/h)", () => {
    const d = zoneDefaultsFromVehicles([]);
    expect(d).toMatchObject({ vehicleMassKg: 3_500, loadMassKg: 1_000, speedKmh: 15, classCode: "T3", vehicleType: "counterbalance_forklift" });
    expect(zoneDefaultsFromVehicles(["unknown", "none"]).vehicleType).toBe("counterbalance_forklift");
  });

  it("uses the heaviest observed vehicle and that class's speed ceiling", () => {
    expect(zoneDefaultsFromVehicles(["pallet_truck"])).toMatchObject({ vehicleMassKg: 700, loadMassKg: 800, speedKmh: 6, classCode: "T1" });
    expect(zoneDefaultsFromVehicles(["pallet_truck", "reach_truck"])).toMatchObject({ vehicleType: "reach_truck", classCode: "T3", speedKmh: 15 });
  });

  it("falls back to 10 km/h when the class is open-ended", () => {
    expect(zoneDefaultsFromVehicles(["hgv"])).toMatchObject({ classCode: "T4", speedKmh: 10, vehicleMassKg: 12_000, loadMassKg: 20_000 });
  });

  it("honours an admin-edited class table", () => {
    const table = PAS13_VEHICLE_CLASS_TABLE.map((r) => (r.classCode === "T3" ? { ...r, speedMaxKmh: 12 } : r));
    expect(zoneDefaultsFromVehicles([], table).speedKmh).toBe(12);
    expect(classForMass(4_500, table)?.classCode).toBe("T3");
    expect(classForMass(1_500)?.classCode).toBe("T1");
    expect(classForMass(999_999)?.classCode).toBe("T4");
  });
});

describe("buildZoneRequest / validateZoneForm", () => {
  it("matches areasFromObservationsSchema and omits an unset run length", () => {
    const form = zoneFormFromDefaults(zoneDefaultsFromVehicles(["counterbalance_forklift"]));
    const cards = [cardFromAnalysis("p1", analysis), emptyCard("p2")];
    const req = buildZoneRequest("  Loading bay 3  ", form, cards);
    expect(req).toMatchObject({
      zoneName: "Loading bay 3",
      mergeIntoOneArea: true,
      trafficDensity: "medium",
      vehicleMassKg: 3_500,
      loadMassKg: 1_000,
      speedKmh: 15,
    });
    expect(req).not.toHaveProperty("recommendedLengthM");
    expect(req.observations.map((o) => o.photoId)).toEqual(["p1", "p2"]);
  });

  it("includes the run length when entered", () => {
    const form = { ...zoneFormFromDefaults(zoneDefaultsFromVehicles([])), recommendedLengthM: 24.5, mergeIntoOneArea: false };
    expect(buildZoneRequest("Z", form, [emptyCard("p1")]).recommendedLengthM).toBe(24.5);
    expect(buildZoneRequest("Z", form, [emptyCard("p1")]).mergeIntoOneArea).toBe(false);
  });

  it("validates against the server bounds", () => {
    const ok = zoneFormFromDefaults(zoneDefaultsFromVehicles([]));
    expect(validateZoneForm(ok, 1)).toBeNull();
    expect(validateZoneForm(ok, 0)).toBe("no_observations");
    expect(validateZoneForm({ ...ok, vehicleMassKg: 0 }, 1)).toBe("vehicle_mass");
    expect(validateZoneForm({ ...ok, loadMassKg: -1 }, 1)).toBe("load_mass");
    expect(validateZoneForm({ ...ok, speedKmh: 121 }, 1)).toBe("speed");
    expect(validateZoneForm({ ...ok, recommendedLengthM: 10_001 }, 1)).toBe("length");
  });
});

describe("groupPhotosByZone", () => {
  it("groups by zone in first-seen time order, photos oldest first, and flags confirmed zones", () => {
    const photos = [
      photo({ id: "c", zoneName: "Dock", takenAt: "2026-09-12T08:05:00.000Z", areaId: "a1" }),
      photo({ id: "b", zoneName: "Zone 1", takenAt: "2026-09-12T08:01:00.000Z" }),
      photo({ id: "a", zoneName: "Zone 1", takenAt: "2026-09-12T08:00:00.000Z" }),
      photo({ id: "d", zoneName: null, takenAt: "2026-09-12T08:09:00.000Z" }),
      photo({ id: "e", zoneName: "Dock", takenAt: "2026-09-12T08:06:00.000Z", areaId: "a1" }),
    ];
    const zones = groupPhotosByZone(photos);
    expect(zones.map((z) => z.zoneName)).toEqual(["Zone 1", "Dock", "Unzoned"]);
    expect(zones[0].photos.map((p) => p.id)).toEqual(["a", "b"]);
    expect(zones[0].confirmed).toBe(false);
    expect(zones[1].confirmed).toBe(true);
    expect(zones[1].confirmedPhotos).toHaveLength(2);
    expect(zones[1].openPhotos).toHaveLength(0);
  });

  it("treats a partially linked zone as open for the unlinked photos only", () => {
    const zones = groupPhotosByZone([
      photo({ id: "a", areaId: "a1" }),
      photo({ id: "b", takenAt: "2026-09-12T08:01:00.000Z" }),
    ]);
    expect(zones[0].confirmed).toBe(false);
    expect(zones[0].openPhotos.map((p) => p.id)).toEqual(["b"]);
  });
});
