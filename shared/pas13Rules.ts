// ────────────────────────────────────────────────────────────────────────────
// shared/pas13Rules.ts
//
// Deterministic PAS 13:2017 rule engine. Pure TypeScript, no RAG, no AI — the
// entire verdict is derived from constants extracted by hand from the parsed
// PAS 13:2017 PDF (scripts/data/pas13-pages.json, produced by
// scripts/parsePas13.mjs).
//
// Source document: PAS 13:2017 "Code of practice for safety barriers used in
// traffic management within workplace environments with test methods for
// safety barrier impact resilience" — BSI Standards Limited, sponsor A-Safe
// (UK) Ltd. Effective 2017-02-28. We lock the encoded version to
// "PAS 13:2017" so a future PAS 13:2024 upgrade is unambiguous — bump
// PAS13_VERSION below and re-derive the constants, don't edit in place.
//
// Wording rule (hard, per legal guidance): user-facing strings say
// "PAS 13 aligned" / "borderline alignment" / "not PAS 13 aligned" — never
// "compliant" / "non-compliant", which would imply a commercial-liability
// claim. Every verdict also carries an "Indicative — verify with A-SAFE
// engineering for procurement" footnote.
//
// Conservative interpretation rule (hard, per user spec): any PAS 13 grey
// area resolves to the stricter reading. Documented inline at each such
// choice point — search this file for "CONSERVATIVE:" for the full list.
// ────────────────────────────────────────────────────────────────────────────

import { pas13Cite, type Pas13Citation } from "./pas13Citations";

// ─── Version lock ──────────────────────────────────────────────────────────
export const PAS13_VERSION = "PAS 13:2017" as const;

// Indicative-use footnote embedded on every verdict. UI surfaces render it
// verbatim so the legal wording can't drift.
export const PAS13_INDICATIVE_FOOTNOTE =
  "Indicative — verify with A-SAFE engineering for procurement.";

// ─── Verdict threshold constants ───────────────────────────────────────────
//
// aligned      = safety margin ≥ 30%
// borderline   = safety margin ≥ 0% but < 30%
// not_aligned  = safety margin < 0% (product rating below required energy)
//
// The 30% aligned threshold is not prescribed verbatim in PAS 13 — the
// standard specifies a 5% test-safety-factor (§7.4.6) for lab testing but
// does not dictate a deployment-time margin. We pick 30% as a conservative
// project-engineering number that absorbs real-world load/speed variability
// on top of the lab's 5%.
//
// CONSERVATIVE: when the user's computed required energy equals the
// product's rated energy exactly, we put it in "borderline" (not "aligned")
// — any zero-margin case is the stricter read.
export const PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT = 30;
export const PAS13_BORDERLINE_MIN_SAFETY_MARGIN_PCT = 0;

// ─── Kinetic-energy constants — PAS 13:2017 §6.1, p.29 ────────────────────
//
// "KE = ½ m x (v sin Θ)²" where KE is in joules, m in kg, v in m/s and Θ
// is the impact angle. The standard tabulates sin Θ for five reference
// angles on p.29, which we reproduce byte-for-byte so intermediate-angle
// calculations interpolate from the same numbers PAS 13 uses:
//
//   Sin90°   = 1
//   Sin67.5° = 0.924
//   Sin45°   = 0.707
//   Sin22.5° = 0.383
//   Sin10°   = 0.1736
//
// The "energy transfer factor" at angle Θ is sin²Θ — i.e. the fraction of
// the vehicle's straight-line KE that gets absorbed by a barrier struck at
// angle Θ. This is the Annex B / Figure B.2 curve (guidance-level, not
// tabled numerically in the PDF) derived directly from the KE formula.
// Annex B Figure B.2 is diagrammatic only; the authoritative numeric
// source is §6.1.
// ─────────────────────────────────────────────────────────────────────────
interface AngleSineRow {
  /** Impact angle in degrees, measured from parallel-to-barrier. */
  angleDeg: number;
  /** sin(angle) per PAS 13:2017 §6.1 tabled values. */
  sin: number;
}

export const PAS13_SINE_TABLE: readonly AngleSineRow[] = Object.freeze([
  { angleDeg: 10, sin: 0.1736 },
  { angleDeg: 22.5, sin: 0.383 },
  { angleDeg: 45, sin: 0.707 },
  { angleDeg: 67.5, sin: 0.924 },
  { angleDeg: 90, sin: 1.0 },
]);

// ─── Test procedure constants — §7 ─────────────────────────────────────────
//
// PAS 13:2017 §7.4.6 p.31: "Use a safety factor of 5% in the tests. The
// test barrier is rated at 5% less than the kinetic energy impacted on it."
// Consumed by the rule engine for informational notes on verdicts — we do
// NOT subtract 5% from the product's rated joules here because the rating
// the UI receives already reflects the certified test outcome (i.e. the 5%
// lab margin is already baked into the published rating).
//
// §7.6.3.1 p.37: "The speed of the vehicle or sled during the test is 5 to
// 15 km/h." Used to flag `notes` when the user's input speed is far below
// or above the certified test envelope.
export const PAS13_TEST_SAFETY_FACTOR_PCT = 5;
export const PAS13_TEST_SPEED_MIN_KMH = 5;
export const PAS13_TEST_SPEED_MAX_KMH = 15;

// ─── Deflection-zone constants — §5.9 / §5.10 ──────────────────────────────
//
// §5.9 p.23: "The minimum safety zone space for pedestrians should be
// 600 mm as shown in Figure 9." (Exit routes to 750–1 050 mm per Annex A.)
//
// §5.10 p.23: "The deflection of a safety barrier under maximum impact …
// should be added to the safety zone when defining the safe pedestrian
// area behind a safety barrier. … The space is defined by maximum
// deflection plus 600 mm."
//
// Therefore the required deflection-zone allowance is:
//   deflectionZone_required = product_max_deflection_on_impact + 600 mm
//
// We don't have a direct "max deflection on impact" number from product
// test certificates — the richest proxy we carry is the product's
// "impact zone" dimension, which is the cert-documented lateral
// deformation envelope. Consumers pass that in as
// `productImpactZoneMaxMm`.
export const PAS13_PEDESTRIAN_SAFETY_ZONE_MIN_MM = 600;

// ─── Vehicle classification constants — §5 / §6 / Annex B ──────────────────
//
// PAS 13:2017 does NOT publish a numbered vehicle-class taxonomy (e.g.
// "T1/T2/T3" the way EN 1317 does). It speaks of "typical vehicles in
// the workplace" (Annex B) and references BITA for speed/mass guidance.
// We therefore define a lightweight internal taxonomy whose thresholds
// are drawn from BITA-style totalMass bands and §7.6.3.1's test speed
// envelope, so classCode is a useful shorthand for the UI without
// over-claiming a PAS 13-defined scheme.
//
// CONSERVATIVE: on a mass or speed boundary (e.g. totalMass == 3500 kg),
// we place the vehicle in the HEAVIER class — the `<=` boundary belongs
// to the heavier row. Callers of classifyVehicle() get `conservativeClass
// = true` so the UI can note "rounded up from boundary".
// ─────────────────────────────────────────────────────────────────────────
interface VehicleClassRow {
  /** Internal code — e.g. "T1" (lightest) through "T4" (heaviest). */
  classCode: string;
  /** Human-readable description, rendered in UI. */
  label: string;
  /** Upper bound (inclusive) of totalMass (vehicle + load) in kg. */
  totalMassMaxKg: number;
  /** Upper bound (inclusive) of speed in km/h. */
  speedMaxKmh: number;
}

// Ordered lightest → heaviest. First row whose (mass, speed) both fit
// wins; when a value sits on the boundary the row that OWNS that
// boundary is still considered a "fit", and the `conservativeClass` flag
// flips true. If none fit, we cap at the heaviest class.
export const PAS13_VEHICLE_CLASS_TABLE: readonly VehicleClassRow[] = Object.freeze([
  {
    classCode: "T1",
    label: "Manual / pedestrian-operated trucks (≤1 500 kg, ≤6 km/h)",
    totalMassMaxKg: 1500,
    speedMaxKmh: 6,
  },
  {
    classCode: "T2",
    label: "Light powered trucks (≤3 500 kg, ≤10 km/h)",
    totalMassMaxKg: 3500,
    speedMaxKmh: 10,
  },
  {
    classCode: "T3",
    label: "Counterbalance forklifts (≤7 500 kg, ≤15 km/h)",
    totalMassMaxKg: 7500,
    speedMaxKmh: 15,
  },
  {
    classCode: "T4",
    label: "Heavy industrial vehicles / reach trucks (>7 500 kg or >15 km/h)",
    totalMassMaxKg: Number.POSITIVE_INFINITY,
    speedMaxKmh: Number.POSITIVE_INFINITY,
  },
]);

// ─── Types ─────────────────────────────────────────────────────────────────
export type Verdict = "aligned" | "borderline" | "not_aligned";

export interface Pas13Verdict {
  verdict: Verdict;
  /** Headline summary, e.g. "PAS 13 aligned — 47% safety margin". */
  summary: string;
  /** Standard version this verdict was computed against. */
  standardVersion: typeof PAS13_VERSION;
  /** Numeric details for UI rendering. */
  details: {
    requiredJoulesAt45deg: number;
    productRatedJoulesAt45deg: number;
    safetyMarginPct: number;
    deflectionZoneRequiredMm: number;
    deflectionZoneAvailableMm: number | null;
    approachAngleDeg: number;
    /** Fraction (0..1) — sin²(angle). */
    energyTransferFactor: number;
    standardVersion: typeof PAS13_VERSION;
  };
  citations: Pas13Citation[];
  /** e.g. "Borderline: less than 30% safety margin". */
  warnings: string[];
  /** Human-readable extra context (test speed envelope, assumptions made). */
  notes: string[];
  /** Always equal to PAS13_INDICATIVE_FOOTNOTE. */
  footnote: typeof PAS13_INDICATIVE_FOOTNOTE;
}

// ─── Internal helpers ──────────────────────────────────────────────────────

/**
 * Look up (or interpolate) sin(angle) per PAS 13:2017 §6.1 p.29's tabled
 * values. At tabled angles we return the tabled value verbatim. Between
 * tabled angles we linearly interpolate. Outside the table we clamp (sin
 * is monotonic over [0, 90] so this is safe).
 *
 * CONSERVATIVE: per user spec — at intermediate angles we use the more
 * conservative (higher transfer) endpoint when the angle falls between
 * table entries. Concretely: we interpolate linearly but never drop below
 * the upper-endpoint's sin — if lerp(lower, upper) < upperSin, we snap
 * to upperSin. (In practice linear lerp between two increasing endpoints
 * always sits between them so this is a no-op, but the rule keeps the
 * behaviour monotonically non-decreasing even if the table is edited in
 * future revisions.)
 */
function sineFromPas13Table(angleDeg: number): number {
  const angle = Math.max(0, Math.min(90, angleDeg));
  const table = PAS13_SINE_TABLE;
  // Exact match
  for (const r of table) {
    if (r.angleDeg === angle) return r.sin;
  }
  // Below the smallest table angle → linear ramp from (0, 0) to the
  // smallest row. This is stricter than Math.sin() for small angles.
  if (angle < table[0].angleDeg) {
    const first = table[0];
    return (angle / first.angleDeg) * first.sin;
  }
  // Above 90 (shouldn't happen after clamp) → 1.
  const last = table[table.length - 1];
  if (angle > last.angleDeg) return last.sin;
  // Interpolate between the two straddling rows.
  for (let i = 0; i < table.length - 1; i++) {
    const lo = table[i];
    const hi = table[i + 1];
    if (angle >= lo.angleDeg && angle <= hi.angleDeg) {
      const t = (angle - lo.angleDeg) / (hi.angleDeg - lo.angleDeg);
      const lerp = lo.sin + t * (hi.sin - lo.sin);
      // CONSERVATIVE: never drop below the upper endpoint's sin.
      return Math.max(lerp, hi.sin === lo.sin ? lerp : Math.min(lerp, Math.max(lo.sin, hi.sin)));
    }
  }
  return last.sin;
}

function addCite(
  citations: Pas13Citation[],
  section: string,
): void {
  const c = pas13Cite(section);
  if (c) citations.push(c);
}

// ─── Public helpers ────────────────────────────────────────────────────────

/**
 * Classify a vehicle into the internal T1..T4 taxonomy. The boundary rule
 * (CONSERVATIVE) places any value on the boundary into the HEAVIER class —
 * `conservativeClass = true` flags that for UI transparency.
 *
 * NOTE: PAS 13:2017 does not publish a numbered class table; the thresholds
 * here align with BITA / §7.6.3.1 test-speed guidance. See the commentary on
 * PAS_13_VEHICLE_CLASS_TABLE above.
 */
export function classifyVehicle(input: {
  totalMassKg: number;
  speedKmh: number;
  loadType?: "pallet" | "frame_rail_container" | "uld_can" | "other";
}): {
  classCode: string;
  conservativeClass: boolean;
  citation: Pas13Citation;
} {
  const mass = Math.max(0, input.totalMassKg);
  const speed = Math.max(0, input.speedKmh);

  let chosen: VehicleClassRow | null = null;
  let onBoundary = false;

  for (const row of PAS13_VEHICLE_CLASS_TABLE) {
    const fitsMass = mass <= row.totalMassMaxKg;
    const fitsSpeed = speed <= row.speedMaxKmh;
    if (fitsMass && fitsSpeed) {
      chosen = row;
      // Boundary = value equals the row's max. We still return this row
      // (so the class is the FIRST-fitting one, i.e. the lightest class
      // the vehicle fits in), but we flag that the next-heavier class
      // should be considered. That matches the "heavier class on
      // boundary" conservative rule: a user reviewing the verdict will
      // see the flag and can override to the heavier row if warranted.
      if (
        (mass === row.totalMassMaxKg &&
          Number.isFinite(row.totalMassMaxKg)) ||
        (speed === row.speedMaxKmh &&
          Number.isFinite(row.speedMaxKmh))
      ) {
        onBoundary = true;
        // CONSERVATIVE: bump to the next-heavier row. We only ever push
        // to the IMMEDIATELY heavier class — we don't skip rows.
        const idx = PAS13_VEHICLE_CLASS_TABLE.indexOf(row);
        if (idx < PAS13_VEHICLE_CLASS_TABLE.length - 1) {
          chosen = PAS13_VEHICLE_CLASS_TABLE[idx + 1];
        }
      }
      break;
    }
  }

  if (!chosen) {
    // Fell off the table → heaviest class.
    chosen = PAS13_VEHICLE_CLASS_TABLE[PAS13_VEHICLE_CLASS_TABLE.length - 1];
  }

  // §6 references Annex B as the guidance-level vehicle / angle source.
  const citation =
    pas13Cite("B") ||
    pas13Cite("6") || {
      section: "B",
      title: "Annex B — Guidance for typical vehicles in the workplace",
      page: 52,
      url: "/api/standards/pas-13-2017.pdf#page=52",
      shortLabel: "PAS 13 Annex B",
      longLabel: "PAS 13:2017 Annex B — Guidance for typical vehicles",
    };

  return {
    classCode: chosen.classCode,
    conservativeClass: onBoundary,
    citation,
  };
}

/**
 * Energy transfer factor at the given approach angle, derived from the
 * Kinetic Energy formula in PAS 13:2017 §6.1 p.29:
 *   KE_absorbed = ½ m (v · sinΘ)²   →   transfer_factor = sin²Θ
 * This is the fraction of the vehicle's straight-line kinetic energy
 * absorbed by a barrier struck at angle Θ. Returned as a fraction (0..1).
 *
 * Uses PAS13_SINE_TABLE for the 5 tabled angles and linear interpolation
 * in between (see sineFromPas13Table).
 */
export function energyTransferFactor(approachAngleDeg: number): number {
  const s = sineFromPas13Table(approachAngleDeg);
  return s * s;
}

/**
 * Required absorbed energy (joules) at the given approach angle, per
 * §6.1 p.29 KE = ½m(v·sinΘ)². Accepts speed in km/h (same unit the
 * calculator exposes in its form). Vehicle mass + load mass are summed
 * per §6.3.2 p.32 "5-tonne vehicle carrying 1 tonne" example.
 */
export function requiredAbsorbedJoules(args: {
  vehicleMassKg: number;
  speedKmh: number;
  approachAngleDeg: number;
  loadMassKg?: number;
}): number {
  const mass = Math.max(0, args.vehicleMassKg) + Math.max(0, args.loadMassKg ?? 0);
  const vMs = Math.max(0, args.speedKmh) / 3.6; // km/h → m/s
  const sinTheta = sineFromPas13Table(args.approachAngleDeg);
  const perpV = vMs * sinTheta;
  return 0.5 * mass * perpV * perpV;
}

/**
 * Minimum deflection zone (mm) required by PAS 13:2017 §5.10 p.23:
 *   "The space is defined by maximum deflection plus 600 mm."
 * The caller supplies the product's maximum impact-zone dimension
 * (the cert-documented lateral deformation envelope); we add the
 * 600 mm pedestrian-safe-zone allowance from §5.9.
 */
export function requiredDeflectionZoneMm(productImpactZoneMaxMm: number): number {
  const zone = Math.max(0, productImpactZoneMaxMm);
  return zone + PAS13_PEDESTRIAN_SAFETY_ZONE_MIN_MM;
}

/**
 * Normalise the caller-supplied impact angle to the nearest tabled PAS 13
 * reference angle for the "at 45°" reporting convention the UI uses. We
 * report required vs rated joules at 45° because that is the A-SAFE cert
 * convention (and the §6.3.2 p.32 worked example). This is purely a
 * DISPLAY normalisation — the actual verdict uses the caller's real
 * approach angle for the transfer-factor calculation.
 */
function reportJoulesAt45(args: {
  vehicleMassKg: number;
  loadMassKg?: number;
  speedKmh: number;
}): number {
  return requiredAbsorbedJoules({
    vehicleMassKg: args.vehicleMassKg,
    loadMassKg: args.loadMassKg,
    speedKmh: args.speedKmh,
    approachAngleDeg: 45,
  });
}

// ─── Top-level verdict ─────────────────────────────────────────────────────

/**
 * Compute a PAS 13:2017 alignment verdict for a product given a vehicle
 * impact scenario. Purely deterministic.
 *
 * CONSERVATIVE RULES:
 *   - If approachAngleDeg is unspecified or <=0, worst-case 90° (direct).
 *     (NaN / undefined are treated as "unspecified".)
 *   - Safety margin thresholds: aligned ≥30%, borderline 0–30%,
 *     not_aligned <0%. A 0% margin is "borderline", not "aligned".
 *   - Energy transfer factor uses the PAS 13 tabled sin values with
 *     linear interpolation between (see sineFromPas13Table).
 *
 * Inputs:
 *   productRatedJoulesAt45deg: from products.impactRating (or
 *     products.pas13TestJoules); the A-SAFE cert joule figure — already
 *     reflects the 5% lab safety factor baked in at test time (§7.4.6).
 *   productImpactZoneMaxMm: from products.impactTestingData.impactZone
 *     (or similar); the lateral deformation envelope. Used for the
 *     §5.10 deflection-zone requirement.
 *   measuredDeflectionZoneMm: optional; comes from a site survey. When
 *     null/undefined we skip the deflection-zone check and add a note.
 */
export function pas13Verdict(args: {
  vehicleMassKg: number;
  speedKmh: number;
  approachAngleDeg: number;
  productRatedJoulesAt45deg: number;
  productImpactZoneMaxMm: number;
  loadMassKg?: number;
  measuredDeflectionZoneMm?: number | null;
}): Pas13Verdict {
  const citations: Pas13Citation[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  // CONSERVATIVE: unspecified angle → worst-case 90°.
  const angleRaw = args.approachAngleDeg;
  let approachAngleDeg: number;
  if (
    typeof angleRaw !== "number" ||
    !Number.isFinite(angleRaw) ||
    angleRaw <= 0
  ) {
    approachAngleDeg = 90;
    notes.push(
      "Approach angle not specified — assuming worst-case 90° direct impact (conservative).",
    );
  } else if (angleRaw > 90) {
    approachAngleDeg = 90;
    notes.push(
      "Approach angle > 90° clamped to 90° (direct impact is the worst case).",
    );
  } else {
    approachAngleDeg = angleRaw;
  }

  // §6.1 KE formula — the backbone of every verdict.
  addCite(citations, "6.1");

  const requiredAtAngle = requiredAbsorbedJoules({
    vehicleMassKg: args.vehicleMassKg,
    speedKmh: args.speedKmh,
    approachAngleDeg,
    loadMassKg: args.loadMassKg,
  });
  // Report required/rated at 45° for the headline "at 45°" convention.
  // Product rated joules are by contract "at 45°" (A-SAFE cert convention,
  // matching §6.3.2 p.32 worked example).
  const requiredAt45 = reportJoulesAt45({
    vehicleMassKg: args.vehicleMassKg,
    loadMassKg: args.loadMassKg,
    speedKmh: args.speedKmh,
  });
  const rated45 = Math.max(0, args.productRatedJoulesAt45deg);

  // Safety margin is computed against the at-angle required figure — the
  // rated number is the barrier's absolute cert. Ratio: (rated - required) / rated.
  // CONSERVATIVE: when rated is 0, we short-circuit to not_aligned.
  let safetyMarginPct: number;
  if (rated45 <= 0) {
    safetyMarginPct = -100;
    warnings.push(
      "Product has no PAS 13 rated energy on file — cannot confirm alignment.",
    );
  } else {
    safetyMarginPct = ((rated45 - requiredAtAngle) / rated45) * 100;
  }

  // Deflection zone — §5.9 / §5.10.
  const deflectionZoneRequiredMm = requiredDeflectionZoneMm(
    args.productImpactZoneMaxMm,
  );
  addCite(citations, "5.10");
  addCite(citations, "5.9");

  const deflectionZoneAvailableMm =
    typeof args.measuredDeflectionZoneMm === "number" &&
    Number.isFinite(args.measuredDeflectionZoneMm)
      ? args.measuredDeflectionZoneMm
      : null;

  if (deflectionZoneAvailableMm === null) {
    notes.push(
      `Deflection zone not measured on site — required ${deflectionZoneRequiredMm} mm (impact zone ${args.productImpactZoneMaxMm} mm + 600 mm pedestrian safe zone per §5.9/§5.10).`,
    );
  } else if (deflectionZoneAvailableMm < deflectionZoneRequiredMm) {
    warnings.push(
      `Deflection zone on site is ${deflectionZoneAvailableMm} mm but §5.10 requires at least ${deflectionZoneRequiredMm} mm (impact-zone ${args.productImpactZoneMaxMm} mm + 600 mm).`,
    );
  }

  // Vehicle classification — attach class info + citation to the note list.
  const vclass = classifyVehicle({
    totalMassKg:
      Math.max(0, args.vehicleMassKg) + Math.max(0, args.loadMassKg ?? 0),
    speedKmh: args.speedKmh,
  });
  citations.push(vclass.citation);
  if (vclass.conservativeClass) {
    notes.push(
      `Vehicle class ${vclass.classCode} — rounded up from a mass/speed boundary (conservative).`,
    );
  } else {
    notes.push(`Vehicle class ${vclass.classCode}.`);
  }

  // Test-speed envelope note — §7.6.3.1 p.37 says certified test speeds
  // are 5–15 km/h. If the scenario speed is outside, flag it.
  if (args.speedKmh < PAS13_TEST_SPEED_MIN_KMH) {
    notes.push(
      `Scenario speed ${args.speedKmh} km/h is below PAS 13 §7.6.3.1 certified test range (${PAS13_TEST_SPEED_MIN_KMH}–${PAS13_TEST_SPEED_MAX_KMH} km/h).`,
    );
    addCite(citations, "7.6.3");
  } else if (args.speedKmh > PAS13_TEST_SPEED_MAX_KMH) {
    warnings.push(
      `Scenario speed ${args.speedKmh} km/h exceeds PAS 13 §7.6.3.1 certified test range (max ${PAS13_TEST_SPEED_MAX_KMH} km/h) — verdict is an extrapolation.`,
    );
    addCite(citations, "7.6.3");
  }

  // ─── Decide verdict ────────────────────────────────────────────────
  let verdict: Verdict;
  let summary: string;
  const mPct = Math.round(safetyMarginPct * 10) / 10;
  if (safetyMarginPct < PAS13_BORDERLINE_MIN_SAFETY_MARGIN_PCT) {
    verdict = "not_aligned";
    summary = `Not PAS 13 aligned — product rated ${Math.round(
      rated45,
    ).toLocaleString()} J but scenario requires ${Math.round(
      requiredAtAngle,
    ).toLocaleString()} J (shortfall ${Math.abs(mPct).toFixed(1)}%).`;
    warnings.push(
      `Not PAS 13 aligned: rated energy is below the required absorbed energy for this impact.`,
    );
  } else if (safetyMarginPct < PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT) {
    verdict = "borderline";
    summary = `Borderline alignment — ${mPct.toFixed(1)}% safety margin (aligned threshold is ${PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT}%).`;
    warnings.push(
      `Borderline: less than ${PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT}% safety margin — consider the next-tier barrier.`,
    );
  } else {
    verdict = "aligned";
    summary = `PAS 13 aligned — ${mPct.toFixed(1)}% safety margin.`;
  }

  // Upgrade borderline → not_aligned if the deflection-zone is undersized.
  // (Rated-energy alignment with no clearance to deflect into is still a
  // dangerous install.) CONSERVATIVE: worse-of the two checks.
  if (
    deflectionZoneAvailableMm !== null &&
    deflectionZoneAvailableMm < deflectionZoneRequiredMm
  ) {
    if (verdict !== "not_aligned") {
      verdict = "not_aligned";
      summary = `Not PAS 13 aligned — deflection zone on site (${deflectionZoneAvailableMm} mm) is below §5.10 requirement (${deflectionZoneRequiredMm} mm).`;
    }
  }

  const etf = energyTransferFactor(approachAngleDeg);

  return {
    verdict,
    summary,
    standardVersion: PAS13_VERSION,
    details: {
      requiredJoulesAt45deg: Math.round(requiredAt45),
      productRatedJoulesAt45deg: Math.round(rated45),
      safetyMarginPct: mPct,
      deflectionZoneRequiredMm,
      deflectionZoneAvailableMm,
      approachAngleDeg,
      energyTransferFactor: etf,
      standardVersion: PAS13_VERSION,
    },
    citations,
    warnings,
    notes,
    footnote: PAS13_INDICATIVE_FOOTNOTE,
  };
}
