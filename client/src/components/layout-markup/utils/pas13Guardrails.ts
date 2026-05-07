// ────────────────────────────────────────────────────────────────────────────
// pas13Guardrails.ts
//
// Designer-time PAS 13:2017 rule checker for the Layout Drawing tool.
//
// Wired into the canvas so violations recompute on every markup / scale /
// vehicle-selection change. Each violation rendered to the user as an
// inline chip (warning/error severity) with a deep-link citation back to
// the underlying PAS 13 section.
//
// Reuses σ's deterministic engine in `shared/pas13Rules.ts` for everything
// it touches — never re-implements the verdict math here.
//
// Wording rule (hard, see shared/pas13Rules.ts comment): user-facing copy
// says "PAS 13 aligned" / "borderline" / "not aligned" — never
// "compliant" / "non-compliant". The panel footer always carries the
// indicative footnote verbatim.
//
// Conservative interpretation: any boundary case resolves to the stricter
// reading. E.g. post centre that EQUALS the rated max passes (we trigger
// only above 110% of max), but vehicle class on a boundary does flag.
// ────────────────────────────────────────────────────────────────────────────

import { pas13Cite, type Pas13Citation } from "@shared/pas13Citations";
import {
  classifyVehicle,
  requiredDeflectionZoneMm,
  PAS13_VEHICLE_CLASS_TABLE,
  type VehicleClassRow,
} from "@shared/pas13Rules";
import type { LayoutMarkup } from "@shared/schema";
import { getBarrierSpec } from "@/utils/barrierSymbol";
import { parsePathData, getProductWidthMm } from "../utils";
import type { DrawingPoint } from "../types";

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
  /**
   * Markup the violation is anchored to. For `scale_not_set` we still pin
   * to the first barrier markup so the canvas pulse still has a target.
   */
  markupId: string;
  severity: GuardrailSeverity;
  code: GuardrailCode;
  /** Human-readable message rendered on the chip and the canvas tooltip. */
  message: string;
  /** Citation chip data, when applicable. Undefined for floor-type
   *  violations whose source isn't a numbered PAS 13 clause. */
  citation?: Pas13Citation;
}

/** Lightweight VehicleType row — just the fields the rule-checker reads. */
export interface VehicleType {
  id: string;
  name?: string | null;
  weightTypical?: string | number | null;
  weightMax?: string | number | null;
  maxSpeed?: number | null;
}

/** A markup as the canvas knows about it (LayoutMarkup) plus the optional
 *  productWidthMm / productId we resolve at draw time. */
export type GuardrailMarkup = LayoutMarkup & {
  productWidthMm?: number | null;
  productId?: string | null;
};

/**
 * Optional: catalog product details we can use to upgrade fidelity (e.g.
 * read groundWorksData.substrateNotes for the floor-mismatch rule).
 * Lookup is keyed by productName because cartItemId rarely maps to a
 * catalog row directly inside the layout drawing tool.
 */
export interface GuardrailProductLookup {
  /** Map productName → minimal catalog spec the rules need. */
  byName?: Record<string, GuardrailCatalogProduct | undefined>;
}

export interface GuardrailCatalogProduct {
  id?: string;
  name?: string;
  /** PAS 13 cert joules at 45° (products.impactRating / pas13TestJoules). */
  impactRatingJoules?: number | null;
  /** Product's deflection-zone allowance (mm), if known. */
  deflectionZoneMm?: number | null;
  /** Family-level max post centre rating (mm), e.g. 2200 for iFlex. */
  maxPostCentreMm?: number | null;
  /** GroundWorks substrateNotes — drives anchor/floor mismatch. */
  substrateNotes?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Rough heuristic — barriers vs walls/obstacles. We don't have a markup-
 *  type column on `layout_markups`, so we infer from productName / comment.
 *  CONSERVATIVE: anything we can't classify is treated as a barrier (so
 *  the engine errs on the side of running checks rather than skipping). */
function classifyMarkupKind(
  m: GuardrailMarkup,
): "barrier" | "wall" | "obstacle" {
  const name = `${m.productName ?? ""} ${m.comment ?? ""}`.toLowerCase();
  if (/\bwall\b|\bpartition\b|\bracking\b|\brack\s*end\b/.test(name)) return "wall";
  if (
    /\bobstacle\b|\bcolumn\b|\bbeam\b|\bpillar\b|\bdoor\b|\bopening\b|\bbuilding\b/.test(
      name,
    )
  ) {
    return "obstacle";
  }
  return "barrier";
}

/** Distance from a point to a finite line segment, all in content-space px. */
function pointToSegmentPx(
  p: DrawingPoint,
  a: DrawingPoint,
  b: DrawingPoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

/** Minimum distance between two finite line segments (content-space px).
 *  Robust to parallel + zero-length cases. */
function segmentToSegmentPx(
  a1: DrawingPoint,
  a2: DrawingPoint,
  b1: DrawingPoint,
  b2: DrawingPoint,
): number {
  // Sample the four endpoint-to-other-segment distances; lower bound for
  // the true segment-to-segment minimum on non-intersecting segments.
  const d1 = pointToSegmentPx(a1, b1, b2);
  const d2 = pointToSegmentPx(a2, b1, b2);
  const d3 = pointToSegmentPx(b1, a1, a2);
  const d4 = pointToSegmentPx(b2, a1, a2);
  // Detect intersection (Δ in segment intersection test). When segments
  // intersect, min distance is 0.
  const ax = a2.x - a1.x;
  const ay = a2.y - a1.y;
  const bx = b2.x - b1.x;
  const by = b2.y - b1.y;
  const denom = ax * by - ay * bx;
  if (Math.abs(denom) > 1e-9) {
    const dx = b1.x - a1.x;
    const dy = b1.y - a1.y;
    const t = (dx * by - dy * bx) / denom;
    const u = (dx * ay - dy * ax) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return 0;
    }
  }
  return Math.min(d1, d2, d3, d4);
}

/** Materialise every (segment) bay in a polyline as an array. We avoid
 *  iterators here so the file stays clean of `--downlevelIteration`
 *  complaints under the project's current TS target (ES2017). */
function bays(points: readonly DrawingPoint[]): Array<{
  a: DrawingPoint;
  b: DrawingPoint;
}> {
  const out: Array<{ a: DrawingPoint; b: DrawingPoint }> = [];
  for (let i = 0; i < points.length - 1; i++) {
    out.push({ a: points[i], b: points[i + 1] });
  }
  return out;
}

/** Convert content-space pixel distance to mm using a calibrated scale.
 *  Returns null if scale not set. */
function pxToMm(px: number, drawingScale: number | null): number | null {
  if (!drawingScale || !Number.isFinite(drawingScale) || drawingScale <= 0) {
    return null;
  }
  return px / drawingScale;
}

function mmToPx(mm: number, drawingScale: number | null): number | null {
  if (!drawingScale || !Number.isFinite(drawingScale) || drawingScale <= 0) {
    return null;
  }
  return mm * drawingScale;
}

function asNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Resolve the family-level max post-centre rating (mm) for a markup.
 *  Pulls from the catalog row when available; otherwise falls back to
 *  the barrier-symbol spec table (which already covers iFlex/eFlex/
 *  Atlas/Topple/Monoplex etc.). */
function resolveMaxPostCentreMm(
  markup: GuardrailMarkup,
  product: GuardrailCatalogProduct | undefined,
): number | null {
  if (
    product &&
    typeof product.maxPostCentreMm === "number" &&
    product.maxPostCentreMm > 0
  ) {
    return product.maxPostCentreMm;
  }
  const name = markup.productName ?? "";
  if (!name) return null;
  const spec = getBarrierSpec(name);
  return spec.maxCentreSpacingMm > 0 ? spec.maxCentreSpacingMm : null;
}

/** "Energy band" for a vehicle row, used by the vehicle-class mismatch
 *  rule. We rank each vehicle's typical mass × maxSpeed and compare to
 *  the seed PAS13_VEHICLE_CLASS_TABLE. */
function rankVehicleClass(v: VehicleType): VehicleClassRow {
  const massKg =
    asNumber(v.weightTypical) || asNumber(v.weightMax) || 1500;
  const speedKmh = asNumber(v.maxSpeed) || 6;
  const cls = classifyVehicle({ totalMassKg: massKg, speedKmh });
  // Map back to the row to read its energy ceilings.
  return (
    PAS13_VEHICLE_CLASS_TABLE.find((r) => r.classCode === cls.classCode) ||
    PAS13_VEHICLE_CLASS_TABLE[PAS13_VEHICLE_CLASS_TABLE.length - 1]
  );
}

/** Ranked classCode integer; bigger means heavier class. */
function classCodeRank(code: string): number {
  const idx = PAS13_VEHICLE_CLASS_TABLE.findIndex(
    (r) => r.classCode === code,
  );
  return idx >= 0 ? idx : PAS13_VEHICLE_CLASS_TABLE.length - 1;
}

/** Heuristic: infer barrier's rated vehicle class from its impact rating
 *  joules. Sound for the seed thresholds (T1≈9 kJ, T2≈48 kJ, T3≈325 kJ). */
function ratedClassForJoules(joules: number | null | undefined): string | null {
  if (typeof joules !== "number" || !Number.isFinite(joules) || joules <= 0) {
    return null;
  }
  // Rough KE = 0.5 * mass * (speed/3.6)² for each row's max-(mass, speed).
  for (const r of PAS13_VEHICLE_CLASS_TABLE) {
    const m =
      Number.isFinite(r.totalMassMaxKg) && r.totalMassMaxKg > 0
        ? r.totalMassMaxKg
        : 12000;
    const s =
      Number.isFinite(r.speedMaxKmh) && r.speedMaxKmh > 0
        ? r.speedMaxKmh
        : 16;
    const kj = 0.5 * m * Math.pow(s / 3.6, 2);
    if (joules <= kj * 1.05) return r.classCode;
  }
  return PAS13_VEHICLE_CLASS_TABLE[PAS13_VEHICLE_CLASS_TABLE.length - 1].classCode;
}

/** Heuristic floor-type extraction: look at the layout drawing's free-text
 *  fields (notes, comments) for known substrate keywords. PAS 13 doesn't
 *  define a floor-type taxonomy but A-SAFE GroundWorks PRH-1005 enumerates
 *  the substrate language. */
function inferFloorTypeFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\basphalt|tarmac\b/.test(t)) return "asphalt";
  if (/\bconcrete\b/.test(t)) return "concrete";
  if (/\bblock\s*pav|paver\b|paving\b/.test(t)) return "paving";
  if (/\bsteel\s*deck\b|\bsteel\s*plate\b/.test(t)) return "steel";
  return null;
}

/** Substrate compatibility per A-SAFE GroundWorks PRH-1005: products with
 *  "concrete-only" notes can't be installed on asphalt / paving / steel. */
function substrateMismatch(
  floor: string | null,
  notes: string | null | undefined,
): boolean {
  if (!floor || !notes) return false;
  const t = notes.toLowerCase();
  // "Concrete slab recommended; asphalt not suitable"-style copy is the
  // canonical phrasing in product-groundworks.json.
  if (floor === "asphalt" && /asphalt\s*(not\s*)?suitable|not\s*recommend/i.test(t)) {
    return true;
  }
  if (floor === "asphalt" && /concrete\s*(slab\s*)?(only|recommend|required)/i.test(t)) {
    return true;
  }
  if (floor !== "concrete" && /concrete\s*only/i.test(t)) {
    return true;
  }
  return false;
}

// ─── Citation helpers ─────────────────────────────────────────────────────

const CITE_SCALE = "5.4";
const CITE_POST_CENTRE = "6.3";
const CITE_DEFLECTION = "5.10";
const CITE_VEHICLE_CLASS = "5";

function cite(section: string): Pas13Citation | undefined {
  const c = pas13Cite(section);
  return c ?? undefined;
}

// GroundWorks PRH-1005 citation chip (synthetic — not in the PAS 13 TOC,
// since it's an A-SAFE product document, not the PAS 13 standard itself).
const GROUNDWORKS_CITATION: Pas13Citation = {
  section: "GW-PRH-1005",
  title: "A-SAFE GroundWorks PRH-1005",
  page: 1,
  url: "/api/standards/groundworks-prh-1005.pdf",
  shortLabel: "GroundWorks PRH-1005",
  longLabel: "A-SAFE GroundWorks PRH-1005 — Substrate prerequisites",
};

// ─── Main entry point ─────────────────────────────────────────────────────

export interface EvaluateGuardrailsArgs {
  markups: GuardrailMarkup[];
  scale: { drawingScale: number | null; isScaleSet: boolean };
  selectedVehicleTypeIds: string[];
  vehicleTypes: VehicleType[];
  /** Optional catalog lookup for fidelity upgrades. Falls back to
   *  on-name heuristics when not supplied. */
  productLookup?: GuardrailProductLookup;
  /** Free-text "floor type" hint pulled from the drawing's notes /
   *  metadata. The layout drawing schema doesn't carry a dedicated
   *  field today (see report); pass `null` when none is known. */
  layoutFloorType?: string | null;
  /** Free-text notes from the layout drawing record — we scan these for
   *  asphalt / concrete / paving keywords as a last-resort floor hint. */
  layoutNotesText?: string | null;
}

export function evaluateGuardrails(
  args: EvaluateGuardrailsArgs,
): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const { markups, scale, selectedVehicleTypeIds, vehicleTypes, productLookup } = args;

  const barriers: GuardrailMarkup[] = [];
  const obstacles: GuardrailMarkup[] = [];
  for (const m of markups) {
    const kind = classifyMarkupKind(m);
    if (kind === "barrier") barriers.push(m);
    else obstacles.push(m);
  }

  // ─── Rule 1: scale_not_set ─────────────────────────────────────────────
  // Cite §5.4 (Scaled drawings — guidance on calibrated layouts).
  if (barriers.length > 0 && !scale.isScaleSet) {
    violations.push({
      id: `scale_not_set:${barriers[0].id}`,
      markupId: barriers[0].id,
      severity: "warning",
      code: "scale_not_set",
      message:
        "Scale not calibrated; barrier dimensions are visual only. Set the drawing scale before quoting.",
      citation: cite(CITE_SCALE),
    });
  }

  // Lookup hash for catalog data (optional fidelity).
  const lookupByName = productLookup?.byName ?? {};

  // Pre-resolve barrier polylines once.
  const barrierPolys = barriers.map((m) => ({
    markup: m,
    points: parsePathData(m),
    product: m.productName ? lookupByName[m.productName] : undefined,
  }));
  const obstaclePolys = obstacles.map((m) => ({
    markup: m,
    points: parsePathData(m),
    kind: classifyMarkupKind(m),
  }));

  // Resolve the active floor type (explicit field if a future schema
  // adds it, else infer from notes text).
  const floorType =
    args.layoutFloorType ??
    inferFloorTypeFromText(args.layoutNotesText ?? null);

  // ─── Rule 2: post_centre_excessive ─────────────────────────────────────
  // For each barrier polyline, walk vertex-to-vertex and flag a bay whose
  // length exceeds the rated max post centre by >10%. CONSERVATIVE: we
  // pin to the first vertex of the offending bay so "Show on canvas"
  // points to the right region.
  for (const { markup, points, product } of barrierPolys) {
    if (points.length < 2) continue;
    const maxCentreMm = resolveMaxPostCentreMm(markup, product);
    if (!maxCentreMm) continue;

    let worstBayLenMm: number | null = null;
    for (const { a, b } of bays(points)) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const px = Math.hypot(dx, dy);
      const mm = pxToMm(px, scale.drawingScale);
      if (mm === null) break; // no scale → fall back to scale_not_set rule
      if (mm > maxCentreMm * 1.1) {
        if (worstBayLenMm === null || mm > worstBayLenMm) worstBayLenMm = mm;
      }
    }
    if (worstBayLenMm !== null) {
      violations.push({
        id: `post_centre_excessive:${markup.id}`,
        markupId: markup.id,
        severity: "warning",
        code: "post_centre_excessive",
        message: `Post centre ${(worstBayLenMm / 1000).toFixed(2)} m exceeds ${(maxCentreMm / 1000).toFixed(
          2,
        )} m max for ${markup.productName ?? "this barrier"} (>10% over rated). Add an intermediate post.`,
        citation: cite(CITE_POST_CENTRE),
      });
    }
  }

  // ─── Rule 3: deflection_zone_obstructed ────────────────────────────────
  // For each barrier line, check whether any wall/obstacle markup sits
  // within `requiredDeflectionZoneMm(impactZone)` of the barrier polyline
  // in content-space. We need a calibrated scale to convert mm → px;
  // without it we skip silently (the scale_not_set rule already nudges
  // the user). CONSERVATIVE: when the product's impactZone is unknown we
  // fall back to 200 mm (matches PAS13ComplianceChecker's default).
  if (scale.isScaleSet && scale.drawingScale && obstaclePolys.length > 0) {
    for (const { markup, points, product } of barrierPolys) {
      if (points.length < 2) continue;
      const impactZoneMm =
        (product && typeof product.deflectionZoneMm === "number"
          ? product.deflectionZoneMm
          : null) ?? 200;
      const requiredMm = requiredDeflectionZoneMm(impactZoneMm);
      const requiredPx = mmToPx(requiredMm, scale.drawingScale);
      if (requiredPx === null) continue;

      let worstClearanceMm: number | null = null;
      let offenderName: string | null = null;
      for (const obs of obstaclePolys) {
        if (obs.points.length < 1) continue;
        // Compare every barrier bay to every obstacle bay (or single point).
        for (const bay of bays(points)) {
          if (obs.points.length >= 2) {
            for (const obay of bays(obs.points)) {
              const px = segmentToSegmentPx(bay.a, bay.b, obay.a, obay.b);
              if (px <= requiredPx) {
                const clearanceMm = pxToMm(px, scale.drawingScale) ?? 0;
                if (
                  worstClearanceMm === null ||
                  clearanceMm < worstClearanceMm
                ) {
                  worstClearanceMm = clearanceMm;
                  offenderName =
                    obs.markup.productName ?? obs.markup.comment ?? obs.kind;
                }
              }
            }
          } else {
            const p = obs.points[0];
            const px = pointToSegmentPx(p, bay.a, bay.b);
            if (px <= requiredPx) {
              const clearanceMm = pxToMm(px, scale.drawingScale) ?? 0;
              if (
                worstClearanceMm === null ||
                clearanceMm < worstClearanceMm
              ) {
                worstClearanceMm = clearanceMm;
                offenderName =
                  obs.markup.productName ?? obs.markup.comment ?? obs.kind;
              }
            }
          }
        }
      }
      if (worstClearanceMm !== null) {
        violations.push({
          id: `deflection_zone_obstructed:${markup.id}`,
          markupId: markup.id,
          severity: "error",
          code: "deflection_zone_obstructed",
          message: `Deflection zone obstructed — ${offenderName ?? "an object"} sits ${Math.round(
            worstClearanceMm,
          )} mm from this barrier (PAS 13 §5.10 requires ≥${requiredMm} mm including the 600 mm pedestrian safe zone).`,
          citation: cite(CITE_DEFLECTION),
        });
      }
    }
  }

  // ─── Rule 4: vehicle_class_mismatch ────────────────────────────────────
  // If any selected vehicle type ranks at a heavier class than the
  // barrier's rated class (inferred from impactRating joules), warn.
  if (selectedVehicleTypeIds.length > 0 && vehicleTypes.length > 0) {
    const idSet = new Set(selectedVehicleTypeIds);
    const selectedRows = vehicleTypes.filter((v) => idSet.has(v.id));
    if (selectedRows.length > 0) {
      // Heaviest vehicle in the user's selection.
      let maxRank = -1;
      let maxLabel = "";
      let maxClassCode = "";
      for (const v of selectedRows) {
        const cls = rankVehicleClass(v);
        const rank = classCodeRank(cls.classCode);
        if (rank > maxRank) {
          maxRank = rank;
          maxLabel = v.name ?? cls.classCode;
          maxClassCode = cls.classCode;
        }
      }
      // For each barrier markup, compare its rated class to the heaviest
      // user vehicle. CONSERVATIVE: barrier whose rating is unknown is
      // treated as T1 (lightest) so we err on flagging.
      for (const { markup, product } of barrierPolys) {
        const ratedJoules = product?.impactRatingJoules ?? null;
        const ratedCode =
          ratedClassForJoules(ratedJoules) ??
          PAS13_VEHICLE_CLASS_TABLE[0].classCode;
        const ratedRank = classCodeRank(ratedCode);
        if (ratedRank < maxRank) {
          violations.push({
            id: `vehicle_class_mismatch:${markup.id}`,
            markupId: markup.id,
            severity: "warning",
            code: "vehicle_class_mismatch",
            message: `${markup.productName ?? "Barrier"} is rated for class ${ratedCode}; site fleet includes ${maxLabel} (class ${maxClassCode}). Verdict will likely be borderline or not aligned.`,
            citation: cite(CITE_VEHICLE_CLASS),
          });
        }
      }
    }
  }

  // ─── Rule 5: anchor_floor_mismatch ─────────────────────────────────────
  // Compares the layout's inferred floor type (asphalt / concrete / etc.)
  // against the product's GroundWorks substrateNotes. If we can't infer
  // a floor type, the rule degrades to "no signal" — no violation, no
  // false positive.
  if (floorType) {
    for (const { markup, product } of barrierPolys) {
      const notes = product?.substrateNotes ?? null;
      if (substrateMismatch(floorType, notes)) {
        violations.push({
          id: `anchor_floor_mismatch:${markup.id}`,
          markupId: markup.id,
          severity: "warning",
          code: "anchor_floor_mismatch",
          message: `${markup.productName ?? "This barrier"} requires a concrete substrate (per GroundWorks PRH-1005); detected floor type is ${floorType}. Anchor + slab spec may not bind.`,
          citation: GROUNDWORKS_CITATION,
        });
      }
    }
  }

  // ─── Rule 6: underfloor_services_advisory ──────────────────────────────
  // Floor type "underfloor_services" means the slab has utilities below
  // (electrical, drains, plumbing). Anchor depths from the standard
  // GroundWorks spec may damage them. We surface one advisory chip per
  // barrier so designers / engineering verify before installation.
  if (floorType === "underfloor_services") {
    for (const { markup } of barrierPolys) {
      violations.push({
        id: `underfloor_services_advisory:${markup.id}`,
        markupId: markup.id,
        severity: "warning",
        code: "underfloor_services_advisory",
        message: `Floor type "Underfloor services" — anchor depth may damage utilities (electrical, drains, plumbing). Confirm anchor specs with A-SAFE engineering before installation.`,
        citation: GROUNDWORKS_CITATION,
      });
    }
  }

  return violations;
}

/** Group violations by markupId for fast SVG-overlay rendering. */
export function groupViolationsByMarkup(
  violations: readonly GuardrailViolation[],
): Map<string, GuardrailViolation[]> {
  const out = new Map<string, GuardrailViolation[]>();
  for (const v of violations) {
    const list = out.get(v.markupId) ?? [];
    list.push(v);
    out.set(v.markupId, list);
  }
  return out;
}

/** Worst-of dot colour for a markup, given its violation set. */
export function worstSeverityDotColour(
  vs: readonly GuardrailViolation[] | undefined,
): string | null {
  if (!vs || vs.length === 0) return null;
  return vs.some((v) => v.severity === "error") ? "#EF4444" : "#F59E0B";
}

/** Localstorage key the admin "Disable PAS 13 guardrails" toggle writes to.
 *  Read by the Layout Drawing tool on mount; flips the panel into a
 *  silenced (no chips, no submit gate) state when truthy. */
export const PAS13_GUARDRAILS_DISABLED_LS_KEY =
  "asafe.layoutDrawing.pas13Guardrails.disabled";

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
    if (disabled) {
      window.localStorage.setItem(PAS13_GUARDRAILS_DISABLED_LS_KEY, "1");
    } else {
      window.localStorage.removeItem(PAS13_GUARDRAILS_DISABLED_LS_KEY);
    }
  } catch {
    /* ignore — storage quota or private mode */
  }
}
