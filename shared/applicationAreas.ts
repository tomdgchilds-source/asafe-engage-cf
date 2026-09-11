// ────────────────────────────────────────────────────────────────────────────
// shared/applicationAreas.ts
//
// Single source of truth for the site-survey / impact-calculator application
// areas: risk + benefit explainer copy, the PAS 13 default risk level and the
// vehicles a surveyor would typically expect in that zone.
//
// Consumed by client/src/pages/SiteSurvey.tsx, client/src/components/
// VehicleImpactCalculator.tsx and client/src/utils/siteSurveyPdfGenerator.ts
// (previously three drifting local copies).
//
// `defaultRiskLevel` and `suggestedVehicles` are surveyor-on-tablet
// quality-of-life defaults: when the user picks an area type we pre-fill
// these per PAS 13 risk-zone norms so they don't re-enter the same
// conservative defaults on every area card. They remain overridable.
//
// Risk-level defaults follow PAS 13 §6 risk-zone categorisation: anywhere
// people share floor space with MHE is high; pure asset-protection (cold
// store, racking) defaults to medium; structural assets default to high.
// ────────────────────────────────────────────────────────────────────────────

export type ApplicationAreaRiskLevel = "low" | "medium" | "high" | "critical";

export interface ApplicationAreaInfo {
  /** "Current risk" explainer shown to the surveyor and printed in the PDF. */
  risk: string;
  /** "Benefit of protection" explainer shown to the surveyor and printed in the PDF. */
  benefit: string;
  /** Pre-filled risk level when the area type is picked (overridable). */
  defaultRiskLevel: ApplicationAreaRiskLevel;
  /** Vehicle chips suggested for this area (overridable). */
  suggestedVehicles: readonly string[];
}

const APPLICATION_AREA_DATA = {
  "WorkStation(s)": {
    risk: "Employees seated close to vehicle routes remain exposed while distracted. Basic, non-tested barriers are easily damaged and ineffective against real impacts.",
    benefit: "Impact-rated barriers shield staff, reduce repeat maintenance, and prevent costly downtime from accidents.",
    defaultRiskLevel: "high",
    suggestedVehicles: ["Counterbalance Forklift (3-5T)", "Pallet Truck", "Tugger / Tow Tractor"],
  },
  "Pedestrian Walkways": {
    risk: "Painted lines alone offer no protection. Pedestrians are exposed to vehicles, blocked routes, and poor driver visibility.",
    benefit: "Physical barriers safely segregate pedestrians, maintain evacuation routes, and improve MHE efficiency with fewer obstacles.",
    defaultRiskLevel: "high",
    suggestedVehicles: ["Counterbalance Forklift (3-5T)", "Reach Truck", "Pallet Truck"],
  },
  "Crossing Points / Entry & Exits": {
    risk: "Staff crossing high-traffic or blind spots are vulnerable. Painted markings fail to stop vehicles or distracted pedestrians.",
    benefit: "Guided crossings and barriers provide safe, visible, and controlled movement across vehicle zones.",
    defaultRiskLevel: "critical",
    suggestedVehicles: ["Counterbalance Forklift (5T+)", "Reach Truck", "Tugger / Tow Tractor"],
  },
  "Racking": {
    risk: "Vehicle impacts compromise racking integrity, risking collapse, product loss, and costly replacement.",
    benefit: "Barriers preserve racking stability, prevent collapse, and protect both staff and stored goods.",
    defaultRiskLevel: "medium",
    suggestedVehicles: ["Reach Truck", "VNA Truck", "Counterbalance Forklift (3-5T)"],
  },
  "Shutter Doors": {
    risk: "Vehicle damage disrupts workflows, reduces loading capacity, and compromises environmental control.",
    benefit: "Robust barriers protect doors, maintain security, efficiency, and climate control, while avoiding repair downtime.",
    defaultRiskLevel: "medium",
    suggestedVehicles: ["Counterbalance Forklift (3-5T)", "Pallet Truck"],
  },
  "Cold Store Walls": {
    risk: "Insulated panels are easily damaged, causing temperature loss, product spoilage, and high repair costs.",
    benefit: "Barriers prevent panel damage, preserve goods, reduce energy waste, and avoid operational disruption.",
    defaultRiskLevel: "medium",
    suggestedVehicles: ["Reach Truck", "Pallet Truck", "Pump Truck"],
  },
  "Fire Hose Cabinets": {
    risk: "Impact damage can render firefighting equipment unusable, delaying emergency response.",
    benefit: "Barriers ensure cabinets remain accessible and operational, protecting staff, assets, and compliance.",
    defaultRiskLevel: "high",
    suggestedVehicles: ["Counterbalance Forklift (3-5T)", "Pallet Truck"],
  },
  "Columns (Structural / Mezzanine)": {
    risk: "Impacts from vehicles can damage structural or mezzanine columns, threatening building integrity.",
    benefit: "Impact-rated barriers absorb collisions, protect structures, and prevent costly facility repairs.",
    defaultRiskLevel: "high",
    suggestedVehicles: ["Counterbalance Forklift (5T+)", "Reach Truck", "VNA Truck"],
  },
  "Overhead Pipework / Cables": {
    risk: "Overhead utilities are often overlooked. Impacts can disrupt power, processing, or CCTV, causing downtime.",
    benefit: "Barriers protect critical infrastructure, ensuring uninterrupted power and operations.",
    defaultRiskLevel: "medium",
    suggestedVehicles: ["Reach Truck (mast extended)", "VNA Truck"],
  },
  "Loading Docks": {
    risk: "Forklifts risk falling 1–2m from raised docks, endangering operators and damaging equipment.",
    benefit: "Barriers eliminate fall hazards, safeguard operators, and maintain safe, continuous loading operations.",
    defaultRiskLevel: "critical",
    suggestedVehicles: ["Counterbalance Forklift (3-5T)", "Pallet Truck"],
  },
  "Processing Machines": {
    risk: "Vehicle collisions can cause severe equipment damage, downtime, and injury or fatalities.",
    benefit: "Barriers protect machinery, prevent production halts, and safeguard employees from life-threatening risks.",
    defaultRiskLevel: "high",
    suggestedVehicles: ["Counterbalance Forklift (3-5T)", "Tugger / Tow Tractor"],
  },
  "Electrical DBs": {
    risk: "Impact damage risks short circuits, outages, fires, and prolonged downtime from complex repairs.",
    benefit: "Barriers maintain power continuity, reduce outage risks, and mitigate fire hazards.",
    defaultRiskLevel: "high",
    suggestedVehicles: ["Counterbalance Forklift (3-5T)", "Pallet Truck"],
  },
} as const satisfies Record<string, ApplicationAreaInfo>;

/** Union of the canonical area-type labels (matches the survey dropdown). */
export type ApplicationAreaType = keyof typeof APPLICATION_AREA_DATA;

/** Ordered list of the canonical area-type labels. */
export const APPLICATION_AREA_TYPES = Object.keys(
  APPLICATION_AREA_DATA,
) as ApplicationAreaType[];

/**
 * Area-type → explainer copy + defaults. Typed with a `string` index so
 * callers holding a free-text `areaType` (survey rows, PDF) can look up
 * without a cast; unknown keys yield `undefined` at runtime, so guard.
 */
export const applicationAreaData: Record<string, ApplicationAreaInfo> =
  APPLICATION_AREA_DATA;
