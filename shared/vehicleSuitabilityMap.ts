/**
 * Vehicle Suitability Map — bridges the 20 Impact Calculator vehicle types
 * (DB `vehicle_types.name`) to the 26 canonical vehicle-suitability labels
 * used by the Product Suitability PDF dataset (extracted to
 * `scripts/data/product-suitability.json`).
 *
 * Keys are DB vehicle-type names (canonical, as seeded into vehicle_types.name).
 * Values are arrays of PDF vehicle-suitability labels that are conceptually
 * the same vehicle. One DB row may map to multiple PDF labels when the PDF
 * has been finer-grained (e.g. the DB's "Reach Truck" covers both PDF labels
 * "Electric Reach Truck" and "High Rack Stacker").
 *
 * Applied to the DB via `POST /api/admin/apply-vehicle-suitability-labels`
 * which writes each value into vehicle_types.suitability_labels.
 *
 * Used at runtime by `VehicleImpactCalculator` to compute the union of PDF
 * labels for the user's vehicle selection, then intersects against each
 * product's `suitabilityData.vehicleSuitability` to surface the "Products
 * suitable for your vehicles" panel.
 *
 * Rules:
 *  - Empty array is valid (e.g. "Scissor Lift / MEWP", "AGV" — PDF dataset
 *    has no equivalent label). Those vehicles simply contribute nothing to
 *    the cross-reference union.
 *  - Union semantics: a product matches if ANY of its vehicleSuitability
 *    labels is in the selection's union of PDF labels.
 */
export const VEHICLE_SUITABILITY_MAP: Record<string, string[]> = {
  "Pedestrians": ["Pedestrians", "Driver Visual Safety"],
  "Manual Pallet Truck": ["Manual Pallet Truck"],
  "Electric Pallet Truck": ["Electric Pedestrian Truck"],
  "Rider Pallet Truck": ["Electric Pedestrian Truck"],
  "Walkie Stacker": ["Electric Pedestrian Stacker"],
  "Low-Level Order Picker": ["Horizontal Order Picker"],
  "High-Level Order Picker": ["High Rack Stacker", "Horizontal Order Picker"],
  "Counterbalance Forklift (1.5T)": ["Lightweight Counterbalance FLT"],
  "Counterbalance Forklift (2.5T)": ["Lightweight Counterbalance FLT"],
  "Counterbalance Forklift (5T)": [
    "Heavy Duty Counterbalance Truck",
    "Lightweight Counterbalance FLT",
  ],
  "Reach Truck": ["Electric Reach Truck", "High Rack Stacker"],
  "Very Narrow Aisle (VNA) Truck": ["VNA"],
  "Heavy-Duty Forklift (10T+)": [
    "Heavy Duty Counterbalance Truck",
    "Engine Counterbalance Heavy Duty Forklift Truck",
  ],
  "Telehandler": ["Engine Counterbalance Heavy Duty Forklift Truck"],
  "Tow Tractor / Tugger": ["Electric Tow Tractor", "Push Back Truck"],
  "AGV (Automated Guided Vehicle)": [],
  "Scissor Lift / MEWP": [],
  "HGV / Rigid Truck (7.5T)": ["Small Lorry", "Heavy Goods Lorry"],
  "HGV / Articulated Truck (40T)": ["Heavy Goods Lorry"],
  "Delivery Van / Light Commercial": ["Small Van", "Mini Van"],
};

/**
 * All PDF vehicle-suitability labels that are reachable from at least one
 * DB vehicle type (i.e. appear in the map as a value). Useful for sanity-
 * checking coverage.
 */
export function reachablePdfLabels(): Set<string> {
  const out = new Set<string>();
  for (const labels of Object.values(VEHICLE_SUITABILITY_MAP)) {
    for (const l of labels) out.add(l);
  }
  return out;
}
