// ═══════════════════════════════════════════════════════════════════
// Cart accessory vocabulary
// ═══════════════════════════════════════════════════════════════════
// Sagarika's May 5 feedback (estimation team lead): reps were forgetting
// to capture SS bolts, dock buffers, steel/weld plates, L-brackets,
// height parameters, food-grade boards etc. on quotations, leaving
// estimation chasing every line. We added a project-level free-text
// installation_notes box AND these structured per-line dropdowns so the
// data is queryable rather than buried in prose.
//
// Canonical keys live here so:
//   - UI <select> options stay in sync with the persisted JSONB shape
//   - the order-form PDF builder can label each value the same way
//   - new options can be added in one place without grepping the codebase
//
// Storage column: cart_items.accessories (jsonb). The shape matches
// CartAccessories below — every field is optional.

export type FloorType =
  | "concrete"
  | "tiled"
  | "asphalt"
  | "food-grade-epoxy"
  | "cold-storage"
  | "steel-deck"
  | "other";

export type FixingsType =
  | "zinc-plated"
  | "stainless-steel"
  | "countersunk"
  | "chemical"
  | "weld-plate"
  | "through-bolt"
  | "other";

export type DockBufferType = "none" | "standard" | "heavy-duty" | "custom";

export interface DockBufferSelection {
  type: DockBufferType;
  qty?: number;
}

export interface QtySelection {
  qty: number;
}

export interface CartAccessories {
  floorType?: FloorType;
  fixings?: FixingsType;
  dockBuffers?: DockBufferSelection;
  steelPlates?: QtySelection;
  lBrackets?: QtySelection;
  bollardCaps?: boolean;
  heightExtensionMm?: number | null;
  other?: string;
  notes?: string;
}

// Display labels for the UI dropdowns + PDF rendering. Keep ordering
// stable: the UI uses array index for default-selection nudges and the
// PDF builder iterates these same arrays to format the output.

export const FLOOR_TYPE_OPTIONS: { value: FloorType; label: string }[] = [
  { value: "concrete", label: "Standard concrete" },
  { value: "tiled", label: "Tiled floor" },
  { value: "asphalt", label: "Asphalt" },
  { value: "food-grade-epoxy", label: "Food-grade epoxy" },
  { value: "cold-storage", label: "Cold storage" },
  { value: "steel-deck", label: "Steel deck" },
  { value: "other", label: "Other (see notes)" },
];

export const FIXINGS_OPTIONS: { value: FixingsType; label: string }[] = [
  { value: "zinc-plated", label: "Standard zinc-plated" },
  { value: "stainless-steel", label: "Stainless steel (SS)" },
  { value: "countersunk", label: "Countersunk" },
  { value: "chemical", label: "Chemical anchor" },
  { value: "weld-plate", label: "Weld plate" },
  { value: "through-bolt", label: "Through-bolt" },
  { value: "other", label: "Other (see notes)" },
];

export const DOCK_BUFFER_OPTIONS: { value: DockBufferType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "standard", label: "Standard" },
  { value: "heavy-duty", label: "Heavy-duty" },
  { value: "custom", label: "Custom (see notes)" },
];

// Helper used by the UI form-state to start every line item with a
// consistent shape; the API still accepts a partial object on PATCH and
// merges via Object.assign on the server.
export function defaultAccessories(): CartAccessories {
  return {
    floorType: undefined,
    fixings: undefined,
    dockBuffers: undefined,
    steelPlates: undefined,
    lBrackets: undefined,
    bollardCaps: false,
    heightExtensionMm: null,
    other: "",
    notes: "",
  };
}

// True iff the rep has filled in any structured field. Used to decide
// whether to render the "Configured" badge on the collapsed picker and
// whether the PDF should print a row for this line item at all.
export function hasAnyAccessories(a: CartAccessories | null | undefined): boolean {
  if (!a) return false;
  if (a.floorType) return true;
  if (a.fixings) return true;
  if (a.dockBuffers && a.dockBuffers.type && a.dockBuffers.type !== "none") return true;
  if (a.steelPlates && (a.steelPlates.qty || 0) > 0) return true;
  if (a.lBrackets && (a.lBrackets.qty || 0) > 0) return true;
  if (a.bollardCaps === true) return true;
  if (typeof a.heightExtensionMm === "number" && a.heightExtensionMm > 0) return true;
  if (a.other && a.other.trim()) return true;
  if (a.notes && a.notes.trim()) return true;
  return false;
}

// Look up the human-readable label for a stored value. Falls back to
// the raw key if the vocabulary changes and a row is ahead of the code.
export function labelForFloorType(v: FloorType | undefined): string {
  if (!v) return "";
  const opt = FLOOR_TYPE_OPTIONS.find((o) => o.value === v);
  return opt ? opt.label : String(v);
}

export function labelForFixings(v: FixingsType | undefined): string {
  if (!v) return "";
  const opt = FIXINGS_OPTIONS.find((o) => o.value === v);
  return opt ? opt.label : String(v);
}

export function labelForDockBuffer(v: DockBufferType | undefined): string {
  if (!v) return "";
  const opt = DOCK_BUFFER_OPTIONS.find((o) => o.value === v);
  return opt ? opt.label : String(v);
}
