// ────────────────────────────────────────────────────────────────────────────
// shared/barrierRecommender.ts
//
// Deterministic, rule-based PAS-13-aligned barrier recommender. Given a list
// of vehicles + zones + environment + (optional) budget, returns the top
// barrier options per zone, ranked by a composite `fitScore` that combines
// PAS 13 alignment, suitability match, and budget weight.
//
// Pure TypeScript — no ML, no LLM. Works on the client (Site Survey inline
// recommendations), on the worker (POST /api/recommend-barriers), and in
// tests. Imports σ's existing PAS 13 rule engine (pas13Verdict + classify-
// Vehicle) for the alignment verdict and the vehicle-suitability map for
// product-vehicle compatibility — does NOT replicate that logic.
//
// CONSERVATIVE INTERPRETATION (matches σ's policy across the codebase):
//   - design-vehicle = HEAVIEST + FASTEST of the input vehicles whose
//     suitability matches the zone's application type.
//   - vehicle classification on a boundary → heavier class
//     (delegated to classifyVehicle()).
//   - if the design vehicle has no exact entry in the suitability map, we
//     pick the closest analogue and emit a warning so the rep can verify.
//   - any candidate whose pas13Verdict is "not_aligned" is EXCLUDED from
//     options. Borderline candidates are admitted with a trade-off note.
//   - cost optimisation never overrides alignment — fitScore weights
//     alignment > suitability match > budget.
//
// USER-FACING WORDING (hard, per legal guidance):
//   - "PAS 13 aligned" / "borderline" / "not aligned" — never "compliant".
//   - Every rationale ends with the σ indicative footnote so the legal
//     wording can't drift in the UI layer.
// ────────────────────────────────────────────────────────────────────────────

import {
  pas13Verdict,
  classifyVehicle,
  PAS13_INDICATIVE_FOOTNOTE,
  type Pas13Verdict,
} from "./pas13Rules";
import { VEHICLE_SUITABILITY_MAP } from "./vehicleSuitabilityMap";

// ─── Public types ──────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RecommendationVehicle {
  /**
   * Free-form id — typically the DB vehicle_types row name or the form
   * field's identifier. Used in rationales so the rep recognises which
   * vehicle drove the recommendation.
   */
  id: string;
  massKg: number;
  speedKmh: number;
  /**
   * Optional canonical DB vehicle-type label (e.g. "Counterbalance Forklift
   * (5T)"). When present we resolve it through VEHICLE_SUITABILITY_MAP to
   * produce a richer match. When absent we fall back to a fuzzy analogue
   * picked from the map's keys.
   */
  dbVehicleTypeName?: string;
}

export interface RecommendationZone {
  name: string;
  /**
   * Free-form area-application label (e.g. "Pedestrian Walkways", "Racking",
   * "Loading Docks"). Compared against each product's
   * suitabilityData.fitForPurposeApplications by case-insensitive
   * substring match — the PDF taxonomy isn't perfectly aligned with the
   * Site Survey UI labels so a strict equality match would be too brittle.
   */
  areaApplicationType: string;
  /** Optional run length for per_length pricing. Falls back to 1 m. */
  lengthMeters?: number;
  /** Optional override quantity for per_unit pricing. Falls back to 1. */
  quantity?: number;
  riskLevel: RiskLevel;
  /**
   * Optional approach angle (degrees). Defaults to 90 (worst case) per
   * σ's conservative rule.
   */
  approachAngleDeg?: number;
}

export interface RecommendationEnvironment {
  internal: boolean;
  external: boolean;
  coldStorage: boolean;
  atex: boolean;
}

export interface RecommendationBudget {
  /** Maximum AED total acceptable for this zone (single recommendation). */
  maxAed?: number;
}

export interface RecommendationInput {
  vehicleTypes: RecommendationVehicle[];
  zones: RecommendationZone[];
  environment: RecommendationEnvironment;
  budget?: RecommendationBudget;
}

/** Subset of the Product row this engine consumes. Anything not listed is
 * ignored. Defined here (rather than imported from `shared/schema.ts`) so
 * the engine compiles cleanly in any context — including the SPA bundle —
 * without dragging in drizzle. */
export interface RecommenderProduct {
  id: string;
  name: string;
  category?: string | null;
  impactRating?: number | null;
  pas13TestJoules?: number | null;
  price?: number | string | null;
  basePricePerMeter?: number | string | null;
  pricingLogic?: string | null; // per_unit | per_meter | per_length | per_component | per_rate
  isColdStorage?: boolean | null;
  suitabilityData?: {
    environment?: { internal?: boolean; external?: boolean } | null;
    atexSuitability?: { suitable?: boolean; note?: string } | null;
    vehicleSuitability?: string[] | null;
    fitForPurposeApplications?: string[] | null;
    impactZone?: { minMm?: number; maxMm?: number; note?: string } | null;
  } | null;
  productVariants?: Array<{
    id: string;
    sku?: string | null;
    name?: string | null;
    lengthMm?: number | null;
    priceAed?: number | string | null;
    variantType?: string | null;
  }> | null;
  impactTestingData?: {
    impactZone?: number | null;
  } | null;
}

export type Pas13VerdictLabel = Pas13Verdict["verdict"];

export interface BarrierRecommendationOption {
  productId: string;
  productName: string;
  rationale: string;
  /** Length in meters for per_length pricing; integer count for per_unit. */
  quantityOrLengthMeters: number;
  estimatedAedTotal: number;
  pas13Verdict: Pas13Verdict;
  fitScore: number;
  /** Optional human note ("Cheaper option but borderline alignment"). */
  tradeOff?: string;
  /** Optional warning surfaced to the rep ("exact match not in PAS 13
   * vehicle taxonomy; using closest analogue"). */
  warnings?: string[];
  /** Per-meter or per-unit unit price used in the cost calc, AED. */
  unitPriceAed: number;
  pricingMode: "per_length" | "per_unit";
  /**
   * Variant SKU we'd add to the cart if the rep accepts. Picked as the
   * variant whose lengthMm is closest to the requested run length (for
   * per_length families) or the canonical default variant (for per_unit
   * families). Null when the product has no variants on file.
   */
  recommendedVariantSku: string | null;
  recommendedVariantName: string | null;
  /** Indicative footnote — verbatim from σ. */
  footnote: typeof PAS13_INDICATIVE_FOOTNOTE;
}

export interface BarrierRecommendation {
  zone: string;
  designVehicle: {
    id: string;
    massKg: number;
    speedKmh: number;
    classCode: string;
    suitabilityLabels: string[];
    /** True when the design vehicle's name didn't have a direct
     * VEHICLE_SUITABILITY_MAP entry and we fell back to a closest-analogue
     * lookup. */
    usedClosestAnalogue: boolean;
  } | null;
  options: BarrierRecommendationOption[];
  /** Surface-level rep notes — e.g. "no products found for this zone". */
  notes: string[];
}

// ─── Constants tuned to the spec's algorithm ──────────────────────────────

const ALIGNED_BONUS = 0.4;
const BORDERLINE_BONUS = 0.2;
const FIT_FOR_PURPOSE_BONUS = 0.2;
const COLD_STORAGE_BONUS = 0.1;
const BUDGET_BONUS_MAX = 0.2;
const BORDERLINE_BUDGET_PENALTY = 0.1;
const HIGH_RISK_HEADROOM_PENALTY_BORDERLINE = 0.05;

/** Keep responses small + UI scannable — top-3 per zone. */
const MAX_OPTIONS_PER_ZONE = 3;

// ─── Small helpers ─────────────────────────────────────────────────────────

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function lc(s: string | null | undefined): string {
  return (s ?? "").toString().toLowerCase().trim();
}

function arrLc(a: string[] | null | undefined): string[] {
  return Array.isArray(a) ? a.map(lc) : [];
}

/**
 * Resolve a vehicle to its set of canonical PDF suitability labels. When
 * the vehicle has a direct DB-name match, return its entry verbatim. Else
 * fall back to a fuzzy analogue: the map key whose lower-cased name shares
 * the most word-overlap with the input id/name — this is the conservative
 * read of "exact match not in PAS 13 vehicle taxonomy; using closest
 * analogue".
 */
function resolveSuitabilityLabels(
  vehicle: RecommendationVehicle,
): { labels: string[]; usedClosestAnalogue: boolean; analogueKey: string | null } {
  const dbName = vehicle.dbVehicleTypeName ?? vehicle.id;
  if (dbName && VEHICLE_SUITABILITY_MAP[dbName] !== undefined) {
    return {
      labels: VEHICLE_SUITABILITY_MAP[dbName],
      usedClosestAnalogue: false,
      analogueKey: null,
    };
  }
  // Fuzzy fallback — pick the map key with the highest word-overlap.
  const needle = lc(dbName).split(/[^a-z0-9]+/).filter(Boolean);
  if (needle.length === 0) {
    return { labels: [], usedClosestAnalogue: false, analogueKey: null };
  }
  let best: string | null = null;
  let bestScore = 0;
  for (const key of Object.keys(VEHICLE_SUITABILITY_MAP)) {
    const keyTokens = lc(key).split(/[^a-z0-9]+/).filter(Boolean);
    let score = 0;
    for (const t of needle) {
      if (keyTokens.includes(t)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  if (best && bestScore > 0) {
    return {
      labels: VEHICLE_SUITABILITY_MAP[best],
      usedClosestAnalogue: true,
      analogueKey: best,
    };
  }
  return { labels: [], usedClosestAnalogue: false, analogueKey: null };
}

/**
 * Stop-word list for application-type fuzzy matching. Conservative —
 * keeps domain-specific keywords like "dock" / "rack" / "column" which
 * are themselves valid signals. We strip generic English connectors and
 * non-discriminating filler ("protection" alone is too broad to be a
 * standalone match across this dataset).
 */
const APP_STOPWORDS = new Set([
  "and",
  "or",
  "the",
  "for",
  "with",
  "to",
  "of",
  "a",
  "an",
  "in",
  "on",
  "at",
  "protection",
  "area",
  "areas",
  "system",
  "systems",
  "barrier",
  "barriers",
]);

function tokenizeApp(s: string): string[] {
  return s
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => t.replace(/s$/, "")) // crude singular form
    .filter((t) => t.length >= 3 && !APP_STOPWORDS.has(t));
}

/**
 * Determine whether a product's fitForPurposeApplications matches the
 * zone's areaApplicationType. Substring match (case-insensitive) in
 * either direction, with a stop-word-aware token-overlap fallback so
 * "Loading Docks" matches "Service yard and dock protection" via the
 * shared keyword "dock".
 *
 * Singular ↔ plural normalisation: rough trim of trailing 's' on tokens
 * before comparison ("walkways" ≈ "walkway"). PAS 13 product taxonomy is
 * inconsistent on this and we don't want a brittle equality check.
 */
function fitsApplication(
  product: RecommenderProduct,
  zone: RecommendationZone,
): boolean {
  const apps = arrLc(product.suitabilityData?.fitForPurposeApplications);
  if (apps.length === 0) return false;
  const z = lc(zone.areaApplicationType);
  if (z.length === 0) return false;
  const ztokens = tokenizeApp(z);
  for (const app of apps) {
    if (app.length === 0) continue;
    if (app === z) return true;
    if (app.includes(z) || z.includes(app)) return true;
    const atokens = tokenizeApp(app);
    let overlap = 0;
    for (const t of ztokens) if (atokens.includes(t)) overlap++;
    if (overlap >= 1 && ztokens.length > 0 && atokens.length > 0) return true;
  }
  return false;
}

/**
 * Vehicle-product suitability match: any of the product's vehicleSuitability
 * labels intersects the design vehicle's resolved label set.
 */
function fitsVehicle(
  product: RecommenderProduct,
  designVehicleLabels: string[],
): boolean {
  const productLabels = arrLc(product.suitabilityData?.vehicleSuitability);
  if (productLabels.length === 0 || designVehicleLabels.length === 0) {
    return false;
  }
  const wanted = new Set(designVehicleLabels.map(lc));
  for (const l of productLabels) if (wanted.has(l)) return true;
  return false;
}

/** Environment compatibility. Conservative reads:
 *  - product's `suitabilityData.environment` may be null → treat as
 *    "permits both internal and external" (i.e. no exclusion).
 *  - cold storage zones require either `product.isColdStorage` true OR a
 *    suitability dataset that doesn't explicitly forbid it (we don't have
 *    a forbidden-cold flag, so default to allowing it but with a missing-
 *    flag note from the caller).
 *  - ATEX: zone requires ATEX → product MUST have
 *    suitabilityData.atexSuitability.suitable === true.
 */
function fitsEnvironment(
  product: RecommenderProduct,
  env: RecommendationEnvironment,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const sd = product.suitabilityData;
  // ATEX gate — strict.
  if (env.atex) {
    const atexOk = sd?.atexSuitability?.suitable === true;
    if (!atexOk) {
      return { ok: false, reasons: ["ATEX-rated zone requires explicit ATEX suitability."] };
    }
    reasons.push("ATEX suitable");
  }
  // Internal/external — only enforce if product explicitly disclaims.
  if (sd?.environment) {
    if (env.internal && sd.environment.internal === false) {
      return { ok: false, reasons: ["Product not rated for internal use."] };
    }
    if (env.external && sd.environment.external === false) {
      return { ok: false, reasons: ["Product not rated for external use."] };
    }
  }
  return { ok: true, reasons };
}

/**
 * Pick the design vehicle for a zone: HEAVIEST + FASTEST of the input
 * vehicles whose suitability labels intersect at least one product that
 * could plausibly serve this zone.
 *
 * Pragmatic implementation: we don't pre-filter products here — we just
 * pick the worst-case (heaviest mass × fastest speed → highest KE) of the
 * input vehicles. The product-side fit-check is done downstream in
 * `recommendBarriers`. This keeps the function pure and lets the caller
 * pass any product set.
 *
 * CONSERVATIVE: ties broken by whichever has higher mass (mass dominates
 * KE more than speed at workplace velocities).
 */
function pickDesignVehicle(
  vehicles: RecommendationVehicle[],
): RecommendationVehicle | null {
  if (vehicles.length === 0) return null;
  let best = vehicles[0];
  let bestKe = ke(best);
  for (let i = 1; i < vehicles.length; i++) {
    const k = ke(vehicles[i]);
    if (k > bestKe) {
      best = vehicles[i];
      bestKe = k;
    } else if (k === bestKe && vehicles[i].massKg > best.massKg) {
      best = vehicles[i];
    }
  }
  return best;
}

function ke(v: RecommendationVehicle): number {
  const m = Math.max(0, v.massKg);
  const vMs = Math.max(0, v.speedKmh) / 3.6;
  return 0.5 * m * vMs * vMs;
}

/**
 * Cost: per_length families price by meter; everything else by unit. We
 * recognise "per_meter" as an alias for "per_length" because both shapes
 * appear in the schema (`pricingLogic` enum).
 */
function pricingMode(product: RecommenderProduct): "per_length" | "per_unit" {
  const logic = lc(product.pricingLogic);
  if (logic === "per_length" || logic === "per_meter") return "per_length";
  // basePricePerMeter populated alone is also a per-length family.
  if (toNumber(product.basePricePerMeter) > 0 && !product.pricingLogic) {
    return "per_length";
  }
  return "per_unit";
}

function unitPriceAed(
  product: RecommenderProduct,
  mode: "per_length" | "per_unit",
): number {
  if (mode === "per_length") {
    const ppm = toNumber(product.basePricePerMeter);
    if (ppm > 0) return ppm;
    // Fall back to the smallest variant priceAed normalised to /m via
    // lengthMm — if the family's basePricePerMeter wasn't set explicitly.
    const variants = product.productVariants ?? [];
    let best = 0;
    for (const v of variants) {
      const lenMm = v.lengthMm ?? 0;
      const priceAed = toNumber(v.priceAed);
      if (lenMm > 0 && priceAed > 0) {
        const perM = priceAed / (lenMm / 1000);
        if (best === 0 || perM < best) best = perM;
      }
    }
    return best > 0 ? best : toNumber(product.price);
  }
  // per_unit — the headline product.price is the canonical unit price.
  const p = toNumber(product.price);
  if (p > 0) return p;
  // Fallback to lowest variant price.
  const variants = product.productVariants ?? [];
  let lowest = 0;
  for (const v of variants) {
    const priceAed = toNumber(v.priceAed);
    if (priceAed > 0 && (lowest === 0 || priceAed < lowest)) lowest = priceAed;
  }
  return lowest;
}

function pickRecommendedVariant(
  product: RecommenderProduct,
  zone: RecommendationZone,
): { sku: string | null; name: string | null } {
  const variants = product.productVariants ?? [];
  if (variants.length === 0) return { sku: null, name: null };
  const targetMm = (zone.lengthMeters ?? 0) * 1000;
  if (targetMm > 0) {
    let best = variants[0];
    let bestDist = Math.abs((best.lengthMm ?? 0) - targetMm);
    for (const v of variants) {
      const lenMm = v.lengthMm ?? 0;
      if (lenMm <= 0) continue;
      const d = Math.abs(lenMm - targetMm);
      if (d < bestDist) {
        best = v;
        bestDist = d;
      }
    }
    return { sku: best.sku ?? null, name: best.name ?? null };
  }
  // No length hint → first variant.
  const v = variants[0];
  return { sku: v.sku ?? null, name: v.name ?? null };
}

/** Cost calc: lengthMeters * basePricePerMeter for per_length, quantity *
 *  unitPrice for per_unit. Returns AED total rounded to nearest dirham. */
function estimateCost(
  product: RecommenderProduct,
  zone: RecommendationZone,
): { total: number; quantityOrLengthMeters: number; unitPrice: number; mode: "per_length" | "per_unit" } {
  const mode = pricingMode(product);
  const unit = unitPriceAed(product, mode);
  if (mode === "per_length") {
    const lengthM = zone.lengthMeters && zone.lengthMeters > 0 ? zone.lengthMeters : 1;
    return {
      total: Math.round(lengthM * unit),
      quantityOrLengthMeters: lengthM,
      unitPrice: unit,
      mode,
    };
  }
  const qty = zone.quantity && zone.quantity > 0 ? zone.quantity : 1;
  return {
    total: Math.round(qty * unit),
    quantityOrLengthMeters: qty,
    unitPrice: unit,
    mode,
  };
}

/** Risk-aware budget weight. Spec: +0.2 if total under budget; -0.1 if
 *  borderline AND budget high (rep would prefer alignment headroom). */
function budgetWeight(
  costTotal: number,
  budget: RecommendationBudget | undefined,
  verdict: Pas13VerdictLabel,
): { score: number; tradeOff?: string } {
  if (!budget || !Number.isFinite(budget.maxAed) || (budget.maxAed ?? 0) <= 0) {
    return { score: 0 };
  }
  const max = budget.maxAed!;
  if (costTotal <= max) {
    // Linear preference: cheaper relative to the cap → higher bonus.
    const fraction = costTotal / max;
    const score = BUDGET_BONUS_MAX * (1 - Math.max(0, Math.min(1, fraction)));
    if (verdict === "borderline" && fraction < 0.5) {
      // Borderline + plenty of budget left → gently penalise so an aligned
      // option a tier up wins. The rep can still pick this one.
      return {
        score: score - BORDERLINE_BUDGET_PENALTY,
        tradeOff:
          "Cheaper option but only borderline PAS 13 alignment — consider a higher-rated barrier given the remaining budget headroom.",
      };
    }
    return { score };
  }
  return {
    score: -BUDGET_BONUS_MAX,
    tradeOff: `Over budget — AED ${costTotal.toLocaleString()} vs cap AED ${max.toLocaleString()}.`,
  };
}

function riskHeadroomPenalty(
  verdict: Pas13VerdictLabel,
  risk: RiskLevel,
): { score: number; tradeOff?: string } {
  // High/critical zones with borderline alignment: nudge ranking toward
  // the next-tier barrier.
  if (
    verdict === "borderline" &&
    (risk === "high" || risk === "critical")
  ) {
    return {
      score: -HIGH_RISK_HEADROOM_PENALTY_BORDERLINE,
      tradeOff: `Borderline alignment in a ${risk}-risk zone — verify safety margin with engineering.`,
    };
  }
  return { score: 0 };
}

// ─── Main entry point ──────────────────────────────────────────────────────

/**
 * Compute top-3 barrier recommendations per zone. Pure deterministic.
 *
 * The function never throws on malformed input — it always returns a
 * BarrierRecommendation entry per zone (with `options: []` when no
 * suitable products are found, and a `notes` array explaining why so the
 * UI can surface the gap to the rep).
 */
export function recommendBarriers(
  input: RecommendationInput,
  products: RecommenderProduct[],
): BarrierRecommendation[] {
  const out: BarrierRecommendation[] = [];

  for (const zone of input.zones) {
    const notes: string[] = [];

    const designVehicle = pickDesignVehicle(input.vehicleTypes);
    if (!designVehicle) {
      out.push({
        zone: zone.name,
        designVehicle: null,
        options: [],
        notes: [
          "No vehicles supplied — cannot compute PAS 13 alignment.",
          PAS13_INDICATIVE_FOOTNOTE,
        ],
      });
      continue;
    }

    const { labels: suitabilityLabels, usedClosestAnalogue, analogueKey } =
      resolveSuitabilityLabels(designVehicle);

    if (usedClosestAnalogue && analogueKey) {
      notes.push(
        `Exact match for "${designVehicle.dbVehicleTypeName ?? designVehicle.id}" not in PAS 13 vehicle taxonomy; using closest analogue "${analogueKey}".`,
      );
    } else if (suitabilityLabels.length === 0) {
      notes.push(
        `No PAS 13 suitability mapping found for "${designVehicle.dbVehicleTypeName ?? designVehicle.id}" — recommendations may be incomplete.`,
      );
    }

    const designClass = classifyVehicle({
      totalMassKg: designVehicle.massKg,
      speedKmh: designVehicle.speedKmh,
    });

    // ─── Filter + rank candidate products ───────────────────────────────
    type Scored = {
      product: RecommenderProduct;
      verdict: Pas13Verdict;
      fitScore: number;
      cost: ReturnType<typeof estimateCost>;
      tradeOffs: string[];
      warnings: string[];
      rationaleParts: string[];
    };

    const scored: Scored[] = [];

    for (const product of products) {
      // Hard gates first.
      const productImpactJ =
        toNumber(product.impactRating) || toNumber(product.pas13TestJoules);

      // Without an impact rating we can't compute alignment — skip with
      // a mild conservative read (don't surface the product). The PAS 13
      // verdict engine already short-circuits to not_aligned but emitting
      // a not_aligned card to the rep would be noise.
      if (productImpactJ <= 0) continue;

      // suitabilityData absence — coverage gap. Skip and accumulate a note
      // at the zone level so the rep knows why the catalog might look thin.
      if (!product.suitabilityData) continue;

      // Vehicle suitability gate.
      if (!fitsVehicle(product, suitabilityLabels)) continue;

      // Application-type gate.
      if (!fitsApplication(product, zone)) continue;

      // Environment gate.
      const envCheck = fitsEnvironment(product, input.environment);
      if (!envCheck.ok) continue;

      // Compute the PAS 13 verdict for this product against the design
      // vehicle. Worst-case angle if the zone didn't supply one.
      const productImpactZoneMaxMm =
        product.suitabilityData?.impactZone?.maxMm ??
        toNumber(product.impactTestingData?.impactZone) ??
        0;

      const verdict = pas13Verdict({
        vehicleMassKg: designVehicle.massKg,
        speedKmh: designVehicle.speedKmh,
        approachAngleDeg: zone.approachAngleDeg ?? 90,
        productRatedJoulesAt45deg: productImpactJ,
        productImpactZoneMaxMm,
      });

      // Hard exclusion for not_aligned (per spec).
      if (verdict.verdict === "not_aligned") continue;

      // Score.
      let fitScore = 0;
      const tradeOffs: string[] = [];
      const productWarnings: string[] = [];
      const rationaleParts: string[] = [];

      if (verdict.verdict === "aligned") {
        fitScore += ALIGNED_BONUS;
        rationaleParts.push(
          `PAS 13 aligned with ${verdict.details.safetyMarginPct.toFixed(1)}% safety margin against ${
            designVehicle.dbVehicleTypeName ?? designVehicle.id
          } (class ${designClass.classCode})`,
        );
      } else {
        fitScore += BORDERLINE_BONUS;
        rationaleParts.push(
          `Borderline PAS 13 alignment (${verdict.details.safetyMarginPct.toFixed(1)}% margin)`,
        );
      }

      // Application bonus — already gated; bump for explicit listing.
      fitScore += FIT_FOR_PURPOSE_BONUS;
      rationaleParts.push(
        `Listed for "${zone.areaApplicationType}" applications`,
      );

      // Cold storage bonus (when zone in coldStorage env).
      if (input.environment.coldStorage && product.isColdStorage === true) {
        fitScore += COLD_STORAGE_BONUS;
        rationaleParts.push("Cold-storage rated");
      } else if (input.environment.coldStorage && product.isColdStorage !== true) {
        // Don't exclude (lack of flag isn't an explicit disclaim) but warn.
        productWarnings.push(
          "Cold-storage flag not set on this product — verify cold-environment suitability before order.",
        );
      }

      // Cost + budget weight.
      const cost = estimateCost(product, zone);
      const budgetW = budgetWeight(cost.total, input.budget, verdict.verdict);
      fitScore += budgetW.score;
      if (budgetW.tradeOff) tradeOffs.push(budgetW.tradeOff);

      // Risk-aware penalty (tightens borderline ranks in high-risk zones).
      const riskW = riskHeadroomPenalty(verdict.verdict, zone.riskLevel);
      fitScore += riskW.score;
      if (riskW.tradeOff) tradeOffs.push(riskW.tradeOff);

      // Closest-analogue → propagate as a per-option warning so the rep
      // sees it on the card, not just at the zone level.
      if (usedClosestAnalogue && analogueKey) {
        productWarnings.push(
          `Vehicle "${designVehicle.dbVehicleTypeName ?? designVehicle.id}" not in PAS 13 taxonomy; matched closest analogue "${analogueKey}".`,
        );
      }

      // Clamp.
      if (fitScore < 0) fitScore = 0;
      if (fitScore > 1) fitScore = 1;

      scored.push({
        product,
        verdict,
        fitScore,
        cost,
        tradeOffs,
        warnings: productWarnings,
        rationaleParts,
      });
    }

    // Sort by fitScore desc, then by cost asc as tiebreaker.
    scored.sort((a, b) => {
      if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
      return a.cost.total - b.cost.total;
    });

    // Take top N, augment with cross-option trade-off notes.
    const top = scored.slice(0, MAX_OPTIONS_PER_ZONE);
    const options: BarrierRecommendationOption[] = top.map((s, idx) => {
      const tradeOffs = [...s.tradeOffs];
      if (idx > 0) {
        const ref = top[0];
        const deltaPct =
          ref.cost.total > 0
            ? ((s.cost.total - ref.cost.total) / ref.cost.total) * 100
            : 0;
        if (Math.abs(deltaPct) >= 5) {
          tradeOffs.push(
            deltaPct > 0
              ? `+${deltaPct.toFixed(0)}% AED vs option 1 (${ref.product.name})`
              : `${deltaPct.toFixed(0)}% AED vs option 1 (${ref.product.name})`,
          );
        }
      } else if (top.length > 1) {
        // Option 1 — call out alignment headroom vs cheaper options.
        const cheapest = [...top].sort((a, b) => a.cost.total - b.cost.total)[0];
        if (cheapest.product.id !== s.product.id && s.cost.total > cheapest.cost.total) {
          const deltaPct = ((s.cost.total - cheapest.cost.total) / cheapest.cost.total) * 100;
          if (deltaPct >= 5) {
            tradeOffs.push(
              `Best alignment but +${deltaPct.toFixed(0)}% AED vs cheapest option (${cheapest.product.name}).`,
            );
          }
        }
      }

      const variant = pickRecommendedVariant(s.product, zone);
      const rationale =
        s.rationaleParts.join("; ") + ". " + PAS13_INDICATIVE_FOOTNOTE;

      return {
        productId: s.product.id,
        productName: s.product.name,
        rationale,
        quantityOrLengthMeters: s.cost.quantityOrLengthMeters,
        estimatedAedTotal: s.cost.total,
        pas13Verdict: s.verdict,
        fitScore: Math.round(s.fitScore * 1000) / 1000,
        tradeOff: tradeOffs.length > 0 ? tradeOffs.join(" ") : undefined,
        warnings: s.warnings.length > 0 ? s.warnings : undefined,
        unitPriceAed: s.cost.unitPrice,
        pricingMode: s.cost.mode,
        recommendedVariantSku: variant.sku,
        recommendedVariantName: variant.name,
        footnote: PAS13_INDICATIVE_FOOTNOTE,
      };
    });

    // Coverage gap notes.
    const productsWithSuitability = products.filter((p) => !!p.suitabilityData).length;
    const productsTotal = products.length;
    if (
      options.length === 0 &&
      productsWithSuitability < productsTotal
    ) {
      notes.push(
        `${productsTotal - productsWithSuitability} of ${productsTotal} products are missing PAS 13 suitability data and were skipped.`,
      );
    }
    if (options.length === 0 && productsTotal > 0 && productsWithSuitability > 0) {
      notes.push(
        "No products in the catalog match this zone's vehicle + application + environment requirements.",
      );
    }
    notes.push(PAS13_INDICATIVE_FOOTNOTE);

    out.push({
      zone: zone.name,
      designVehicle: {
        id: designVehicle.id,
        massKg: designVehicle.massKg,
        speedKmh: designVehicle.speedKmh,
        classCode: designClass.classCode,
        suitabilityLabels,
        usedClosestAnalogue,
      },
      options,
      notes,
    });
  }

  return out;
}

// ─── Cache key helper for the worker route ─────────────────────────────────

/**
 * Stable hash of a RecommendationInput — used by the route layer to key
 * the 5-minute response cache. Pure JSON.stringify with a deterministic
 * key order.
 */
export function recommendationCacheKey(input: RecommendationInput): string {
  const norm = {
    v: input.vehicleTypes
      .map((v) => ({
        i: v.id,
        m: v.massKg,
        s: v.speedKmh,
        d: v.dbVehicleTypeName ?? null,
      }))
      .sort((a, b) => (a.i < b.i ? -1 : 1)),
    z: input.zones
      .map((z) => ({
        n: z.name,
        a: z.areaApplicationType,
        l: z.lengthMeters ?? null,
        q: z.quantity ?? null,
        r: z.riskLevel,
        ang: z.approachAngleDeg ?? null,
      }))
      .sort((a, b) => (a.n < b.n ? -1 : 1)),
    e: input.environment,
    b: input.budget?.maxAed ?? null,
  };
  return JSON.stringify(norm);
}
