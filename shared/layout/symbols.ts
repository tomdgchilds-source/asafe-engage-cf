/**
 * shared/layout/symbols.ts
 *
 * The symbol library: one entry per A-SAFE product family with the colour,
 * stroke style, legend letter and the real-world numbers (post spacing,
 * rail width, post OD) that the overlay, legend, title-block key, vector
 * export and quantity take-off all derive from. Keeping this in one table
 * means a run drawn on screen, the legend swatch beside it, the exported
 * PDF and the cart line all agree.
 *
 * Post OD / rail width / spacing numbers are ported from
 * client/src/utils/barrierSymbol.ts (the legacy per-family spec table) so
 * the new editor draws the same footprints the order-form PDF already does.
 *
 * Colours are chosen to read on a white CAD sheet (relative luminance
 * < 0.5, no yellows) and to be distinct from one another; variants inside a
 * family share a hue so the sheet still groups visually.
 */

export type StrokeStyle = "double" | "single" | "dashed";
export type StampShape = "circle" | "square" | "rect";

export interface FamilySpec {
  /** Stable kebab-case id stored on every element. */
  id: FamilyId;
  /** Human label for the legend and title-block key. */
  label: string;
  /** Hex colour used for the overlay stroke, legend swatch and export. */
  colour: string;
  strokeStyle: StrokeStyle;
  /** Max centre-to-centre post spacing (mm). 0 for stamp families. */
  postSpacingMm: number;
  /** Plan-view footprint width (mm): rail width for runs, body width for stamps. */
  widthMm: number;
  /** Post outside diameter (mm). */
  postOdMm: number;
  /** Present only for point products placed with the stamp tool. */
  stampShape?: StampShape;
  /** Single legend letter, unique across the library. */
  letter: string;
}

export const FAMILY_IDS = [
  "iflex-single-traffic",
  "iflex-single-traffic-plus",
  "iflex-double-traffic",
  "iflex-double-traffic-plus",
  "eflex-single-traffic",
  "eflex-single-traffic-plus",
  "eflex-double-traffic",
  "mflex-single-traffic",
  "mflex-double-traffic",
  "atlas-single-traffic",
  "atlas-double-traffic",
  "atlas-double-traffic-plus",
  "pedestrian-3-rail",
  "rackguard",
  "rack-end-single",
  "rack-end-double",
  "bollard-130",
  "bollard-190",
  "bollard-heavy-duty",
  "column-guard",
  "dock-buffer",
  "forkguard",
  "height-restrictor",
  "tape-barrier",
] as const;

export type FamilyId = (typeof FAMILY_IDS)[number];

export const DEFAULT_FAMILY_ID: FamilyId = "iflex-single-traffic";

const IFLEX_SPACING = 2200;

export const FAMILIES: Record<FamilyId, FamilySpec> = {
  "iflex-single-traffic": {
    id: "iflex-single-traffic",
    label: "iFlex Single Traffic Barrier",
    colour: "#B45309",
    strokeStyle: "double",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 125,
    postOdMm: 190,
    letter: "A",
  },
  "iflex-single-traffic-plus": {
    id: "iflex-single-traffic-plus",
    label: "iFlex Single Traffic Barrier+",
    colour: "#92400E",
    strokeStyle: "double",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 125,
    postOdMm: 190,
    letter: "B",
  },
  "iflex-double-traffic": {
    id: "iflex-double-traffic",
    label: "iFlex Double Traffic Barrier",
    colour: "#EA580C",
    strokeStyle: "double",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 125,
    postOdMm: 190,
    letter: "C",
  },
  "iflex-double-traffic-plus": {
    id: "iflex-double-traffic-plus",
    label: "iFlex Double Traffic Barrier+",
    colour: "#9A3412",
    strokeStyle: "double",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 125,
    postOdMm: 190,
    letter: "D",
  },
  "eflex-single-traffic": {
    id: "eflex-single-traffic",
    label: "eFlex Single Traffic Barrier",
    colour: "#2563EB",
    strokeStyle: "double",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 75,
    postOdMm: 130,
    letter: "E",
  },
  "eflex-single-traffic-plus": {
    id: "eflex-single-traffic-plus",
    label: "eFlex Single Traffic Barrier+",
    colour: "#1E40AF",
    strokeStyle: "double",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 75,
    postOdMm: 130,
    letter: "F",
  },
  "eflex-double-traffic": {
    id: "eflex-double-traffic",
    label: "eFlex Double Traffic Barrier",
    colour: "#0891B2",
    strokeStyle: "double",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 75,
    postOdMm: 130,
    letter: "G",
  },
  "mflex-single-traffic": {
    id: "mflex-single-traffic",
    label: "mFlex Single Traffic Barrier",
    colour: "#7C3AED",
    strokeStyle: "double",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 80,
    postOdMm: 158,
    letter: "H",
  },
  "mflex-double-traffic": {
    id: "mflex-double-traffic",
    label: "mFlex Double Traffic Barrier",
    colour: "#5B21B6",
    strokeStyle: "double",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 80,
    postOdMm: 158,
    letter: "I",
  },
  "atlas-single-traffic": {
    id: "atlas-single-traffic",
    label: "Atlas Single Traffic Barrier",
    colour: "#DC2626",
    strokeStyle: "double",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 130,
    postOdMm: 190,
    letter: "J",
  },
  "atlas-double-traffic": {
    id: "atlas-double-traffic",
    label: "Atlas Double Traffic Barrier",
    colour: "#991B1B",
    strokeStyle: "double",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 130,
    postOdMm: 190,
    letter: "K",
  },
  "atlas-double-traffic-plus": {
    id: "atlas-double-traffic-plus",
    label: "Atlas Double Traffic Barrier+",
    colour: "#BE123C",
    strokeStyle: "double",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 130,
    postOdMm: 190,
    letter: "L",
  },
  "pedestrian-3-rail": {
    id: "pedestrian-3-rail",
    label: "iFlex Pedestrian 3 Rail Barrier",
    colour: "#15803D",
    strokeStyle: "single",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 60,
    postOdMm: 190,
    letter: "M",
  },
  rackguard: {
    id: "rackguard",
    label: "iFlex RackGuard",
    colour: "#0D9488",
    strokeStyle: "dashed",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 100,
    postOdMm: 130,
    letter: "N",
  },
  "rack-end-single": {
    id: "rack-end-single",
    label: "eFlex Single Rack End Barrier",
    colour: "#4D7C0F",
    strokeStyle: "single",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 75,
    postOdMm: 130,
    letter: "O",
  },
  "rack-end-double": {
    id: "rack-end-double",
    label: "eFlex Double Rack End Barrier",
    colour: "#365314",
    strokeStyle: "double",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 75,
    postOdMm: 130,
    letter: "P",
  },
  "bollard-130": {
    id: "bollard-130",
    label: "Bollard 130 OD",
    colour: "#DB2777",
    strokeStyle: "single",
    postSpacingMm: 0,
    widthMm: 130,
    postOdMm: 130,
    stampShape: "circle",
    letter: "Q",
  },
  "bollard-190": {
    id: "bollard-190",
    label: "Bollard 190 OD",
    colour: "#9D174D",
    strokeStyle: "single",
    postSpacingMm: 0,
    widthMm: 190,
    postOdMm: 190,
    stampShape: "circle",
    letter: "R",
  },
  "bollard-heavy-duty": {
    id: "bollard-heavy-duty",
    label: "Heavy Duty Bollard",
    colour: "#C026D3",
    strokeStyle: "single",
    postSpacingMm: 0,
    widthMm: 210,
    postOdMm: 210,
    stampShape: "circle",
    letter: "S",
  },
  "column-guard": {
    id: "column-guard",
    label: "FlexiShield Column Guard",
    colour: "#4F46E5",
    strokeStyle: "single",
    postSpacingMm: 0,
    widthMm: 600,
    postOdMm: 0,
    stampShape: "square",
    letter: "T",
  },
  "dock-buffer": {
    id: "dock-buffer",
    label: "Dock Buffer",
    colour: "#78350F",
    strokeStyle: "single",
    postSpacingMm: 0,
    widthMm: 450,
    postOdMm: 0,
    stampShape: "rect",
    letter: "U",
  },
  forkguard: {
    id: "forkguard",
    label: "ForkGuard Kerb Barrier",
    colour: "#0369A1",
    strokeStyle: "single",
    postSpacingMm: IFLEX_SPACING,
    widthMm: 100,
    postOdMm: 100,
    letter: "V",
  },
  "height-restrictor": {
    id: "height-restrictor",
    label: "iFlex Height Restrictor",
    colour: "#475569",
    strokeStyle: "single",
    postSpacingMm: 0,
    widthMm: 190,
    postOdMm: 190,
    letter: "W",
  },
  "tape-barrier": {
    id: "tape-barrier",
    label: "Tape Barrier",
    colour: "#1F2937",
    strokeStyle: "dashed",
    postSpacingMm: 3000,
    widthMm: 50,
    postOdMm: 90,
    letter: "X",
  },
};

export function isFamilyId(v: unknown): v is FamilyId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(FAMILIES, v);
}

/** Look up a family, falling back to the default so rendering never throws on a stale id. */
export function getFamily(id: string): FamilySpec {
  return isFamilyId(id) ? FAMILIES[id] : FAMILIES[DEFAULT_FAMILY_ID];
}

export function isStampFamily(id: string): boolean {
  return getFamily(id).stampShape !== undefined;
}

// ─── Product → family resolution ────────────────────────────────────────────

/**
 * The slice of a catalogue product we need. Accepts the full DB row, the
 * lightweight client `CatalogProduct`, or a legacy markup's bare name.
 */
export interface ProductLike {
  id?: string;
  name?: string | null;
  category?: string | null;
  subcategory?: string | null;
  suitabilityData?: { family?: unknown; [key: string]: unknown } | null;
}

/**
 * Ordered name matchers. First hit wins, so the more specific patterns
 * (plus variants, rack end before eFlex, height restrictor before iFlex)
 * sit above the generic ones.
 */
const NAME_MATCHERS: Array<[RegExp, FamilyId]> = [
  [/height\s*restrictor/i, "height-restrictor"],
  [/rack\s*guard/i, "rackguard"],
  [/double.*rack\s*end/i, "rack-end-double"],
  [/rack\s*end/i, "rack-end-single"],
  [/fork\s*guard|kerb\s*barrier/i, "forkguard"],
  [/dock\s*buffer/i, "dock-buffer"],
  [/column\s*guard|corner\s*guard/i, "column-guard"],
  [/tape\s*barrier|belt\s*barrier|retractable/i, "tape-barrier"],
  [/heavy\s*duty.*bollard|bollard.*heavy\s*duty|\bHD\b.*bollard/i, "bollard-heavy-duty"],
  [/monoplex.*130|130.*bollard|bollard.*130|monoplex\s*bollard/i, "bollard-130"],
  [/bollard/i, "bollard-190"],
  [/pedestrian|3\s*rail|three\s*rail/i, "pedestrian-3-rail"],
  [/i[fF]lex.*single.*traffic.*\+/i, "iflex-single-traffic-plus"],
  [/i[fF]lex.*double.*traffic.*\+/i, "iflex-double-traffic-plus"],
  [/i[fF]lex.*double.*traffic/i, "iflex-double-traffic"],
  [/i[fF]lex.*traffic/i, "iflex-single-traffic"],
  [/e[fF]lex.*single.*traffic.*\+/i, "eflex-single-traffic-plus"],
  [/e[fF]lex.*double.*traffic/i, "eflex-double-traffic"],
  [/e[fF]lex/i, "eflex-single-traffic"],
  [/m[fF]lex.*double/i, "mflex-double-traffic"],
  [/m[fF]lex/i, "mflex-single-traffic"],
  [/atlas.*double.*\+/i, "atlas-double-traffic-plus"],
  [/atlas.*double/i, "atlas-double-traffic"],
  [/atlas/i, "atlas-single-traffic"],
  [/i[fF]lex/i, "iflex-single-traffic"],
];

function familyFromName(name: string): FamilyId | null {
  for (const [re, id] of NAME_MATCHERS) {
    if (re.test(name)) return id;
  }
  return null;
}

function familyFromCategory(category: string, subcategory: string): FamilyId | null {
  const both = `${category} ${subcategory}`;
  if (/bollard/.test(both)) {
    if (/heavy/.test(subcategory)) return "bollard-heavy-duty";
    if (/monoplex|130/.test(subcategory)) return "bollard-130";
    return "bollard-190";
  }
  if (/column|corner/.test(both)) return "column-guard";
  if (/rack-end/.test(subcategory)) return "rack-end-single";
  if (/rack/.test(both)) return "rackguard";
  if (/dock/.test(both)) return "dock-buffer";
  if (/height/.test(both)) return "height-restrictor";
  if (/kerb|fork/.test(subcategory)) return "forkguard";
  if (/pedestrian/.test(both)) return "pedestrian-3-rail";
  if (/traffic|guardrail|barrier/.test(category)) {
    return /double/.test(subcategory) ? "iflex-double-traffic" : "iflex-single-traffic";
  }
  return null;
}

/**
 * Map a catalogue product to a family id. Resolution order:
 *   1. `suitabilityData.family` when it is already a known family id.
 *   2. Product name matchers (the live catalogue names all resolve here).
 *   3. Category / subcategory fallback for the long tail.
 *   4. `DEFAULT_FAMILY_ID` — deterministic, never throws.
 */
export function familyForProduct(product: ProductLike | null | undefined): FamilyId {
  if (!product) return DEFAULT_FAMILY_ID;

  const explicit = product.suitabilityData?.family;
  if (isFamilyId(explicit)) return explicit;

  const name = (product.name ?? "").trim();
  if (name) {
    const byName = familyFromName(name);
    if (byName) return byName;
  }

  const category = (product.category ?? "").toLowerCase();
  const subcategory = (product.subcategory ?? "").toLowerCase();
  if (category || subcategory) {
    const byCategory = familyFromCategory(category, subcategory);
    if (byCategory) return byCategory;
  }

  return DEFAULT_FAMILY_ID;
}
