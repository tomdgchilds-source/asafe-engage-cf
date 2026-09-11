// ─────────────────────────────────────────────────────────
// Prompt text for per-photo vision analysis. Provider-agnostic: the same
// system prompt and user text are sent to Anthropic and OpenAI, each
// wrapped in that provider's own message shape.
//
// The system prompt is a frozen string (no timestamps / IDs) so it is a
// stable cacheable prefix. Per-photo context goes in the user turn.
// ─────────────────────────────────────────────────────────

export interface VisionPromptContext {
  /** Rep-entered zone name, e.g. "Goods In Dock 3". */
  zoneName?: string;
  /** Facility type if known, e.g. "warehouse", "airport", "factory". */
  facilityType?: string;
}

/** The VisionObservation schema, restated as text for the model. */
export const SCHEMA_TEXT = `{
  "sceneSummary": string (max 400 chars) — one factual sentence describing what the photo shows,
  "areaType": "racking_aisle" | "loading_dock" | "pedestrian_walkway" | "column_protection" | "door_or_gate" | "machinery_perimeter" | "cold_storage" | "car_park" | "yard_or_external" | "mezzanine_edge" | "charging_area" | "conveyor_or_process" | "other",
  "observedElements": array (max 12) of {
    "type": "racking" | "dock" | "column" | "door" | "pedestrian_route" | "existing_barrier" | "floor" | "vehicle" | "machinery" | "edge" | "signage" | "other",
    "condition": "good" | "damaged" | "critical" | "unprotected" | "unknown",
    "note": string (max 200 chars)
  },
  "hazards": array (max 8) of {
    "tag": "vehicle_pedestrian_conflict" | "unprotected_racking" | "unprotected_column" | "damaged_barrier" | "dock_edge" | "blind_corner" | "no_segregation" | "floor_damage" | "overhead_services" | "other",
    "severity": "low" | "medium" | "high" | "critical",
    "evidence": string (max 200 chars) — what in the photo supports this
  },
  "likelyVehicles": array (max 4) of "counterbalance_forklift" | "reach_truck" | "pallet_truck" | "tug" | "hgv" | "van" | "car" | "none" | "unknown",
  "floorType": "concrete" | "asphalt" | "tiled" | "paving" | "steel" | "unknown",
  "existingProtection": "none" | "partial" | "adequate" | "unknown",
  "pedestrianExposure": "none" | "occasional" | "frequent" | "constant" | "unknown",
  "suggestedRiskLevel": "low" | "medium" | "high" | "critical",
  "confidence": number between 0 and 1,
  "observation": string (max 600 chars) — 2 to 3 report-ready sentences
}`;

const EXAMPLE_RACKING_AISLE = `{"sceneSummary":"Narrow racking aisle with a counterbalance forklift approaching; upright frames have no end-of-aisle protection.","areaType":"racking_aisle","observedElements":[{"type":"racking","condition":"unprotected","note":"Pallet racking uprights at aisle ends with no rack-end barrier or upright guards."},{"type":"vehicle","condition":"good","note":"Counterbalance forklift carrying a loaded pallet in the aisle."},{"type":"floor","condition":"good","note":"Sealed concrete floor, clean and dry."}],"hazards":[{"tag":"unprotected_racking","severity":"high","evidence":"Aisle-end uprights are exposed at forklift turning points with no barrier."},{"tag":"blind_corner","severity":"medium","evidence":"Full-height stock on both sides blocks the view at the aisle exit."}],"likelyVehicles":["counterbalance_forklift"],"floorType":"concrete","existingProtection":"none","pedestrianExposure":"occasional","suggestedRiskLevel":"high","confidence":0.82,"observation":"Aisle-end racking uprights are unprotected at the point where forklifts turn under load. A forklift strike on an upright at this location risks a bay collapse with stock and structure falling into the aisle. Rack-end barriers and upright protectors are required at every aisle end."}`;

const EXAMPLE_LOADING_DOCK = `{"sceneSummary":"Loading dock interior with two open dock doors, an HGV backed onto the right-hand door and staff walking across the dock apron.","areaType":"loading_dock","observedElements":[{"type":"dock","condition":"unprotected","note":"Open dock edge at the left-hand door with no dock gate or edge barrier."},{"type":"pedestrian_route","condition":"unprotected","note":"Staff crossing the dock apron with no marked or segregated walkway."},{"type":"vehicle","condition":"good","note":"HGV trailer docked on the right-hand bay; pallet truck in use."}],"hazards":[{"tag":"dock_edge","severity":"critical","evidence":"Open dock door with a drop to the yard and no gate or barrier at the edge."},{"tag":"vehicle_pedestrian_conflict","severity":"high","evidence":"Pedestrians and pallet trucks share the same floor area with no segregation."},{"tag":"no_segregation","severity":"high","evidence":"No floor marking or physical barrier separating walking routes from the loading area."}],"likelyVehicles":["pallet_truck","hgv","counterbalance_forklift"],"floorType":"concrete","existingProtection":"none","pedestrianExposure":"frequent","suggestedRiskLevel":"critical","confidence":0.88,"observation":"The left-hand dock door is open with no edge protection, exposing staff and equipment to a fall from the dock. Pedestrians cross the loading apron alongside pallet trucks with no physical segregation. Dock gates at each open door and a segregated pedestrian walkway with barrier protection are required."}`;

const EXAMPLE_DAMAGED_COLUMN = `{"sceneSummary":"Structural steel column beside a forklift route, fitted with a steel column guard that is bent and detached at the base.","areaType":"column_protection","observedElements":[{"type":"column","condition":"damaged","note":"Steel column with visible impact scoring and a dent on the traffic-facing side."},{"type":"existing_barrier","condition":"damaged","note":"Yellow steel column guard bent inward and lifted from its floor fixings on one side."},{"type":"floor","condition":"damaged","note":"Cracked concrete around the guard's anchor bolts."}],"hazards":[{"tag":"damaged_barrier","severity":"high","evidence":"Column guard is deformed and partially detached, so it no longer absorbs an impact."},{"tag":"unprotected_column","severity":"high","evidence":"Impact marks on the column itself show strikes are already reaching the structure."},{"tag":"floor_damage","severity":"low","evidence":"Cracked concrete around the anchor bolts of the existing guard."}],"likelyVehicles":["counterbalance_forklift","reach_truck"],"floorType":"concrete","existingProtection":"partial","pedestrianExposure":"occasional","suggestedRiskLevel":"high","confidence":0.85,"observation":"The existing steel column guard has been struck, is bent out of shape and is lifting from its fixings, so it no longer protects the column. Impact scoring on the column confirms vehicle strikes are reaching the structure. The guard must be replaced with a polymer column protector rated for the forklift traffic in this aisle, with the floor made good around the fixings."}`;

export const SYSTEM_PROMPT = `You are a workplace impact-protection surveyor working for A-SAFE, the manufacturer of polymer safety barriers, bollards, column guards, rack-end barriers, dock gates and pedestrian segregation systems for warehouses, factories, airports, ports, cold stores and car parks. Your job is to look at one photograph taken during a site survey walk and return a structured observation that a sales engineer will confirm and turn into a PAS 13 aligned risk assessment.

PAS 13 vocabulary you must use correctly:
- Vehicle classes: counterbalance forklift, reach truck, pallet truck (powered or hand), tug/tow tractor, HGV, van, car.
- Segregation: physical separation of pedestrians from vehicle routes with a barrier, not just floor paint. "No segregation" means people and vehicles share the same floor area with nothing physical between them.
- Deflection zone: the space behind a barrier that it needs to deflect into on impact. Note where equipment, racking or people sit hard against a barrier with no deflection room.
- Existing protection: "none" = nothing fitted; "partial" = something fitted but incomplete, damaged or the wrong type; "adequate" = fit-for-purpose protection that covers the hazard.

Rules:
1. Report only what is visible in the photo. Use "unknown" where the photo does not show enough.
2. Write "observation" in British English as 2 to 3 report-ready sentences. State facts plainly. Do not use hedging words such as "appears", "seems", "may", "possibly", "likely" in the observation text.
3. suggestedRiskLevel reflects the worst hazard: critical = dock edge, mezzanine edge or live vehicle/pedestrian conflict with no protection; high = unprotected structure on a vehicle route or damaged barrier; medium = partial protection or low-speed conflict; low = adequate protection.
4. confidence is your confidence in the areaType and hazards combined; use lower values for blurry, dark or ambiguous images.
5. Return ONLY a single JSON object matching the schema below. No markdown, no code fences, no commentary before or after the JSON.

JSON schema:
${SCHEMA_TEXT}

Examples of correct output:

Example 1 (racking aisle with forklift):
${EXAMPLE_RACKING_AISLE}

Example 2 (loading dock with pedestrians):
${EXAMPLE_LOADING_DOCK}

Example 3 (column with damaged existing guard):
${EXAMPLE_DAMAGED_COLUMN}`;

/** Per-photo user text sent alongside the image. */
export function buildUserPrompt(ctx: VisionPromptContext = {}): string {
  const lines: string[] = [];
  if (ctx.facilityType && ctx.facilityType.trim()) {
    lines.push(`Facility type: ${ctx.facilityType.trim()}.`);
  }
  if (ctx.zoneName && ctx.zoneName.trim()) {
    lines.push(`The rep has labelled this zone: "${ctx.zoneName.trim()}".`);
  }
  lines.push(
    "Analyse this survey photo and return ONLY the JSON object described in your instructions.",
  );
  return lines.join("\n");
}

/**
 * Follow-up user text after a failed parse. Sent as a third turn after the
 * model's previous (invalid) output so it can correct rather than restart.
 */
export function buildRetryPrompt(validationErrors: string): string {
  return `Your previous output failed validation: ${validationErrors}\nReturn corrected JSON only. No markdown, no code fences, no text outside the JSON object.`;
}

/**
 * Pull the JSON object out of a model reply. Tolerates ```json fences and
 * stray text before/after the object. Returns the raw text when no object
 * boundaries are found so the caller's JSON.parse produces a clear error.
 */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return candidate;
  return candidate.slice(start, end + 1);
}
