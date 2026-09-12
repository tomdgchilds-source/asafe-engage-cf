/**
 * client/src/components/layout-editor/guardrails.ts
 *
 * Designer-time PAS 13:2017 rule checker, ported from
 * layout-markup/utils/pas13Guardrails.ts onto the Phase 4 `LayoutDoc`.
 *
 * What changed in the port:
 *   - Barriers are `barrierRun` elements (and `stamp` elements for the
 *     vehicle / substrate rules). No more name-sniffing for "wall".
 *   - Obstacles are `wall` elements, so the deflection-zone rule is real.
 *   - Post centres come from `postPositions` (the same bays the overlay
 *     draws and the take-off counts) compared against the product's rated
 *     max post centre, so the rule fires when a product is rated tighter
 *     than its family default.
 *   - Product lookup is by `productId` (the doc stores it), falling back to
 *     the family spec when the catalogue row is missing.
 *
 * Wording rule (hard, see shared/pas13Rules.ts): user-facing copy says
 * "PAS 13 aligned" / "borderline" / "not aligned" — never "compliant".
 * Conservative interpretation everywhere: boundary cases flag.
 */

import { pas13Cite, type Pas13Citation } from "@shared/pas13Citations";
import {
  classifyVehicle,
  requiredDeflectionZoneMm,
  PAS13_VEHICLE_CLASS_TABLE,
  type VehicleClassRow,
} from "@shared/pas13Rules";
import type { BarrierRunElement, LayoutDoc, StampElement, WallElement } from "@shared/layout/doc";
import { getFamily, isStampFamily } from "@shared/layout/symbols";
import { dist, postPositions, pxPerMm, segmentDistanceMm, type Segment } from "@shared/layout/geometry";

// ─── Types ────────────────────────────────────────────────────────────────

export type GuardrailSeverity = "warning" | "error";

export type GuardrailCode =
  | "post_centre_excessive"
  | "deflection_zone_obstructed"
  | "scale_not_set"
  | "vehicle_class_mismatch"
  | "anchor_floor_mismatch"
  | "underfloor_services_advisory";

export interface GuardrailViolation {
  /** Stable identifier so React reconciles row order across recomputes. */
  id: string;
  /** Element the violation is anchored to (the overlay pulses it). */
  elementId: string;
  severity: GuardrailSeverity;
  code: GuardrailCode;
  message: string;
  /** Undefined for substrate rules whose source isn't a numbered PAS 13 clause. */
  citation?: Pas13Citation;
}

/** Lightweight vehicle_types row — just the fields the rule-checker reads. */
export interface GuardrailVehicleType {
  id: string;
  name?: string | null;
  weightTypical?: string | number | null;
  weightMax?: string | number | null;
  maxSpeed?: number | null;
}

/** Catalogue slice the rules read; built from GET /api/products rows. */
export interface GuardrailCatalogProduct {
  id: string;
  name?: string | null;
  /** PAS 13 cert joules at 45° (products.impactRating / pas13TestJoules). */
  impactRatingJoules?: number | null;
  /** Product's deflection-zone allowance (mm), if known. */
  deflectionZoneMm?: number | null;
  /** Product-level max post centre rating (mm); overrides the family spacing. */
  maxPostCentreMm?: number | null;
  /** GroundWorks substrateNotes — drives anchor/floor mismatch. */
  substrateNotes?: string | null;
}

export interface EvaluateGuardrailsArgs {
  doc: LayoutDoc;
  /** Catalogue rows keyed by product id (missing rows degrade to family specs). */
  products?: ReadonlyMap<string, GuardrailCatalogProduct> | Record<string, GuardrailCatalogProduct | undefined>;
  vehicleTypes?: readonly GuardrailVehicleType[];
  /** Explicit override; defaults to `doc.vehicleTypeId`. */
  vehicleTypeId?: string | null;
  /** Explicit override; defaults to `doc.floorType`, then keyword inference from `notesText`. */
  floorType?: string | null;
  /** Free text (title-block notes + element notes) scanned for substrate keywords. */
  notesText?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

type BarrierElement = BarrierRunElement | StampElement;

function lookupProduct(
  products: EvaluateGuardrailsArgs["products"],
  productId: string | undefined,
): GuardrailCatalogProduct | undefined {
  if (!productId || !products) return undefined;
  if (products instanceof Map) return products.get(productId);
  return (products as Record<string, GuardrailCatalogProduct | undefined>)[productId];
}

function asNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function displayName(el: BarrierElement, product: GuardrailCatalogProduct | undefined): string {
  return product?.name || getFamily(el.familyId).label;
}

/** Product rating first, else the family's post spacing. Null for stamp families. */
function resolveMaxPostCentreMm(el: BarrierRunElement, product: GuardrailCatalogProduct | undefined): number | null {
  if (product && typeof product.maxPostCentreMm === "number" && product.maxPostCentreMm > 0) {
    return product.maxPostCentreMm;
  }
  const spec = getFamily(el.familyId);
  return spec.postSpacingMm > 0 ? spec.postSpacingMm : null;
}

function segmentsOf(points: readonly { x: number; y: number }[]): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) out.push([points[i], points[i + 1]]);
  return out;
}

/** "Energy band" for a vehicle row, ranked against the seed class table. */
function rankVehicleClass(v: GuardrailVehicleType): VehicleClassRow {
  const massKg = asNumber(v.weightTypical) || asNumber(v.weightMax) || 1500;
  const speedKmh = asNumber(v.maxSpeed) || 6;
  const cls = classifyVehicle({ totalMassKg: massKg, speedKmh });
  return (
    PAS13_VEHICLE_CLASS_TABLE.find((r) => r.classCode === cls.classCode) ||
    PAS13_VEHICLE_CLASS_TABLE[PAS13_VEHICLE_CLASS_TABLE.length - 1]
  );
}

function classCodeRank(code: string): number {
  const idx = PAS13_VEHICLE_CLASS_TABLE.findIndex((r) => r.classCode === code);
  return idx >= 0 ? idx : PAS13_VEHICLE_CLASS_TABLE.length - 1;
}

/** Infer a barrier's rated vehicle class from its impact rating joules. */
function ratedClassForJoules(joules: number | null | undefined): string | null {
  if (typeof joules !== "number" || !Number.isFinite(joules) || joules <= 0) return null;
  for (const r of PAS13_VEHICLE_CLASS_TABLE) {
    const m = Number.isFinite(r.totalMassMaxKg) && r.totalMassMaxKg > 0 ? r.totalMassMaxKg : 12000;
    const s = Number.isFinite(r.speedMaxKmh) && r.speedMaxKmh > 0 ? r.speedMaxKmh : 16;
    const kj = 0.5 * m * Math.pow(s / 3.6, 2);
    if (joules <= kj * 1.05) return r.classCode;
  }
  return PAS13_VEHICLE_CLASS_TABLE[PAS13_VEHICLE_CLASS_TABLE.length - 1].classCode;
}

/** Keyword floor-type extraction from free text (last-resort hint). */
export function inferFloorTypeFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\basphalt|tarmac\b/.test(t)) return "asphalt";
  if (/\bconcrete\b/.test(t)) return "concrete";
  if (/\bblock\s*pav|paver\b|paving\b|interlock/.test(t)) return "paving";
  if (/\bsteel\s*deck\b|\bsteel\s*plate\b/.test(t)) return "steel";
  return null;
}

/** Substrate compatibility per A-SAFE GroundWorks PRH-1005. */
export function substrateMismatch(floor: string | null, notes: string | null | undefined): boolean {
  if (!floor || !notes) return false;
  const t = notes.toLowerCase();
  if (floor === "asphalt" && /asphalt\s*(not\s*)?suitable|not\s*recommend/i.test(t)) return true;
  if (floor === "asphalt" && /concrete\s*(slab\s*)?(only|recommend|required)/i.test(t)) return true;
  if (floor !== "concrete" && /concrete\s*only/i.test(t)) return true;
  return false;
}

// ─── Citation helpers ─────────────────────────────────────────────────────

const CITE_SCALE = "5.4";
const CITE_POST_CENTRE = "6.3";
const CITE_DEFLECTION = "5.10";
const CITE_VEHICLE_CLASS = "5";

function cite(section: string): Pas13Citation | undefined {
  return pas13Cite(section) ?? undefined;
}

/** GroundWorks PRH-1005 chip (an A-SAFE product document, not a PAS 13 clause). */
export const GROUNDWORKS_CITATION: Pas13Citation = {
  section: "GW-PRH-1005",
  title: "A-SAFE GroundWorks PRH-1005",
  page: 1,
  url: "/api/standards/groundworks-prh-1005.pdf",
  shortLabel: "GroundWorks PRH-1005",
  longLabel: "A-SAFE GroundWorks PRH-1005 — Substrate prerequisites",
};

// ─── Main entry point ─────────────────────────────────────────────────────

export function evaluateGuardrails(args: EvaluateGuardrailsArgs): GuardrailViolation[] {
  const { doc, products, vehicleTypes = [] } = args;
  const violations: GuardrailViolation[] = [];
  const cal = doc.calibration;
  const k = pxPerMm(cal);
  const calibrated = k !== null;

  const runs: BarrierRunElement[] = [];
  const stamps: StampElement[] = [];
  const walls: WallElement[] = [];
  for (const el of doc.elements) {
    if (el.kind === "barrierRun") runs.push(el);
    else if (el.kind === "stamp") stamps.push(el);
    else if (el.kind === "wall") walls.push(el);
  }
  const barriers: BarrierElement[] = [...runs, ...stamps];

  // ─── Rule 1: scale_not_set ───────────────────────────────────────────
  if (runs.length > 0 && !calibrated) {
    violations.push({
      id: `scale_not_set:${runs[0].id}`,
      elementId: runs[0].id,
      severity: "warning",
      code: "scale_not_set",
      message: "Scale not calibrated; barrier dimensions are visual only. Calibrate the drawing before quoting.",
      citation: cite(CITE_SCALE),
    });
  }

  const floorType = args.floorType ?? doc.floorType ?? inferFloorTypeFromText(args.notesText ?? null);

  // ─── Rule 2: post_centre_excessive ───────────────────────────────────
  // Actual bays from postPositions vs the rated max (>10% over flags).
  if (calibrated) {
    for (const run of runs) {
      if (isStampFamily(run.familyId) || run.points.length < 2) continue;
      const product = lookupProduct(products, run.productId);
      const maxCentreMm = resolveMaxPostCentreMm(run, product);
      if (!maxCentreMm) continue;
      const spacing = getFamily(run.familyId).postSpacingMm;
      const posts = postPositions(run.points, spacing > 0 ? spacing : maxCentreMm, cal);
      let worstBayMm: number | null = null;
      for (let i = 1; i < posts.length; i++) {
        const mm = dist(posts[i - 1], posts[i]) / k;
        if (mm > maxCentreMm * 1.1 && (worstBayMm === null || mm > worstBayMm)) worstBayMm = mm;
      }
      if (worstBayMm !== null) {
        violations.push({
          id: `post_centre_excessive:${run.id}`,
          elementId: run.id,
          severity: "warning",
          code: "post_centre_excessive",
          message: `Post centre ${(worstBayMm / 1000).toFixed(2)} m exceeds ${(maxCentreMm / 1000).toFixed(2)} m max for ${displayName(run, product)} (>10% over rated). Add an intermediate post.`,
          citation: cite(CITE_POST_CENTRE),
        });
      }
    }
  }

  // ─── Rule 3: deflection_zone_obstructed ──────────────────────────────
  // Every run bay vs every wall segment; needs a calibrated scale.
  if (calibrated && walls.length > 0) {
    const wallSegments = walls.flatMap((w) => segmentsOf(w.points).map((s) => ({ wall: w, s })));
    for (const run of runs) {
      if (run.points.length < 2) continue;
      const product = lookupProduct(products, run.productId);
      const impactZoneMm = typeof product?.deflectionZoneMm === "number" ? product.deflectionZoneMm : 200;
      const requiredMm = requiredDeflectionZoneMm(impactZoneMm);
      let worstMm: number | null = null;
      for (const bay of segmentsOf(run.points)) {
        for (const { s } of wallSegments) {
          const mm = segmentDistanceMm(bay, s, cal);
          if (mm !== null && mm <= requiredMm && (worstMm === null || mm < worstMm)) worstMm = mm;
        }
      }
      if (worstMm !== null) {
        violations.push({
          id: `deflection_zone_obstructed:${run.id}`,
          elementId: run.id,
          severity: "error",
          code: "deflection_zone_obstructed",
          message: `Deflection zone obstructed — a wall sits ${Math.round(worstMm)} mm from ${displayName(run, product)} (PAS 13 §5.10 requires ≥${requiredMm} mm including the 600 mm pedestrian safe zone).`,
          citation: cite(CITE_DEFLECTION),
        });
      }
    }
  }

  // ─── Rule 4: vehicle_class_mismatch ──────────────────────────────────
  const vehicleTypeId = args.vehicleTypeId ?? doc.vehicleTypeId ?? null;
  const vehicle = vehicleTypeId ? vehicleTypes.find((v) => v.id === vehicleTypeId) : undefined;
  if (vehicle) {
    const cls = rankVehicleClass(vehicle);
    const fleetRank = classCodeRank(cls.classCode);
    const fleetLabel = vehicle.name ?? cls.classCode;
    for (const el of barriers) {
      const product = lookupProduct(products, el.productId);
      // Unknown rating → treated as the lightest class so we err on flagging.
      const ratedCode = ratedClassForJoules(product?.impactRatingJoules ?? null) ?? PAS13_VEHICLE_CLASS_TABLE[0].classCode;
      if (classCodeRank(ratedCode) < fleetRank) {
        violations.push({
          id: `vehicle_class_mismatch:${el.id}`,
          elementId: el.id,
          severity: "warning",
          code: "vehicle_class_mismatch",
          message: `${displayName(el, product)} is rated for class ${ratedCode}; site fleet includes ${fleetLabel} (class ${cls.classCode}). Verdict will likely be borderline or not aligned.`,
          citation: cite(CITE_VEHICLE_CLASS),
        });
      }
    }
  }

  // ─── Rule 5: anchor_floor_mismatch ───────────────────────────────────
  if (floorType) {
    for (const el of barriers) {
      const product = lookupProduct(products, el.productId);
      if (substrateMismatch(floorType, product?.substrateNotes ?? null)) {
        violations.push({
          id: `anchor_floor_mismatch:${el.id}`,
          elementId: el.id,
          severity: "warning",
          code: "anchor_floor_mismatch",
          message: `${displayName(el, product)} requires a concrete substrate (per GroundWorks PRH-1005); floor type is ${floorType}. Anchor + slab spec may not bind.`,
          citation: GROUNDWORKS_CITATION,
        });
      }
    }
  }

  // ─── Rule 6: underfloor_services_advisory ────────────────────────────
  if (floorType === "underfloor_services") {
    for (const el of barriers) {
      violations.push({
        id: `underfloor_services_advisory:${el.id}`,
        elementId: el.id,
        severity: "warning",
        code: "underfloor_services_advisory",
        message: `Floor type "Underfloor services" — anchor depth may damage utilities (electrical, drains, plumbing). Confirm anchor specs with A-SAFE engineering before installation.`,
        citation: GROUNDWORKS_CITATION,
      });
    }
  }

  return violations;
}

/** Group violations by element for the overlay's severity dots. */
export function groupViolationsByElement(violations: readonly GuardrailViolation[]): Map<string, GuardrailViolation[]> {
  const out = new Map<string, GuardrailViolation[]>();
  for (const v of violations) {
    const list = out.get(v.elementId) ?? [];
    list.push(v);
    out.set(v.elementId, list);
  }
  return out;
}

/** Worst-of dot colour for an element, given its violation set. */
export function worstSeverityDotColour(vs: readonly GuardrailViolation[] | undefined): string | null {
  if (!vs || vs.length === 0) return null;
  return vs.some((v) => v.severity === "error") ? "#EF4444" : "#F59E0B";
}

// ─── Admin silence toggle (localStorage) ──────────────────────────────────

export const PAS13_GUARDRAILS_DISABLED_LS_KEY = "asafe.layoutDrawing.pas13Guardrails.disabled";

export function readGuardrailsDisabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(PAS13_GUARDRAILS_DISABLED_LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeGuardrailsDisabled(disabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (disabled) window.localStorage.setItem(PAS13_GUARDRAILS_DISABLED_LS_KEY, "1");
    else window.localStorage.removeItem(PAS13_GUARDRAILS_DISABLED_LS_KEY);
  } catch {
    /* ignore — storage quota or private mode */
  }
}
