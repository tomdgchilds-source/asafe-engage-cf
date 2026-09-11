import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";
import { insertImpactCalculationSchema } from "@shared/schema";
import {
  PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT,
  requiredAbsorbedJoules,
  sineFromPas13Table,
} from "@shared/pas13Rules";

// ─── Shared PAS 13 energy helpers for the Vehicle Impact Calculator ────────
//
// The standalone calculator (client/src/components/VehicleImpactCalculator.tsx)
// and this route both derive their joule figures from the SAME shared rule
// engine (shared/pas13Rules.ts) so the calculator, the site survey
// (worker/routes/siteSurveys.ts `computeAreaEnergyJ`) and the PAS 13 checker
// agree to the joule. The client mirrors these few lines for instant display;
// the server recomputes on save and the stored figure is authoritative.
//
// PAS 13:2017 §6.1: KE = ½ · (vehicle + load) · (v · sinΘ)² with sinΘ from the
// §6.1 table (sineFromPas13Table), never Math.sin.

export type CalculatorSpeedUnit = "mph" | "kmh" | "ms";

/** Convert a calculator speed to km/h (the unit the shared engine takes). */
export function speedToKmh(speed: number, unit: CalculatorSpeedUnit): number {
  const s = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  if (unit === "mph") return s * 1.609344;
  if (unit === "ms") return s * 3.6;
  return s;
}

/**
 * Normalise a user-entered impact angle the same way pas13Verdict does:
 * missing / non-finite / ≤ 0 → 90° (worst case, conservative); > 90 → 90.
 */
export function normaliseImpactAngle(angleDeg: unknown): number {
  const n = typeof angleDeg === "number" ? angleDeg : parseFloat(String(angleDeg ?? ""));
  if (!Number.isFinite(n) || n <= 0) return 90;
  return Math.min(90, n);
}

/**
 * Minimum product rated (tested) energy for a PAS 13 "aligned" verdict.
 * pas13Verdict defines margin = (rated − required) / rated, and "aligned"
 * needs margin ≥ PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT (30 %), so
 *   rated ≥ required / (1 − 0.30) = required / 0.7.
 */
export function alignedMinRatedJoules(requiredJ: number): number {
  const req = Number.isFinite(requiredJ) ? Math.max(0, requiredJ) : 0;
  return req / (1 - PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT / 100);
}

export interface CalculatorEnergyInput {
  vehicleMassKg: number;
  loadMassKg?: number;
  speed: number;
  speedUnit: CalculatorSpeedUnit;
  impactAngleDeg: number;
}

export interface CalculatorEnergyResult {
  totalMassKg: number;
  speedKmh: number;
  speedMs: number;
  /** Angle actually used (after normaliseImpactAngle). */
  impactAngleDeg: number;
  /** sinΘ from the PAS 13 §6.1 table (interpolated between tabled angles). */
  sinTheta: number;
  /** Required absorbed energy, J (headline "Kinetic Energy Required"). */
  kineticEnergyJ: number;
  /** Tested-energy requirement: min. product rating for a 30 % aligned margin, J. */
  alignedMinRatedJ: number;
  alignedMinSafetyMarginPct: number;
}

/** Pure: the calculator's full energy picture from raw form inputs. */
export function computeCalculatorEnergy(input: CalculatorEnergyInput): CalculatorEnergyResult {
  const vehicleMassKg = Number.isFinite(input.vehicleMassKg) ? Math.max(0, input.vehicleMassKg) : 0;
  const loadMassKg =
    typeof input.loadMassKg === "number" && Number.isFinite(input.loadMassKg)
      ? Math.max(0, input.loadMassKg)
      : 0;
  const speedKmh = speedToKmh(input.speed, input.speedUnit);
  const impactAngleDeg = normaliseImpactAngle(input.impactAngleDeg);
  const kineticEnergyJ = requiredAbsorbedJoules({
    vehicleMassKg,
    loadMassKg,
    speedKmh,
    approachAngleDeg: impactAngleDeg,
  });
  return {
    totalMassKg: vehicleMassKg + loadMassKg,
    speedKmh,
    speedMs: speedKmh / 3.6,
    impactAngleDeg,
    sinTheta: sineFromPas13Table(impactAngleDeg),
    kineticEnergyJ,
    alignedMinRatedJ: alignedMinRatedJoules(kineticEnergyJ),
    alignedMinSafetyMarginPct: PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT,
  };
}

/**
 * Per-product alignment against a required energy, using the rule engine's
 * margin definition (rated − required) / rated. Anything under the 30 %
 * aligned threshold (borderline or shortfall) is `notAligned` — shown greyed
 * out, never hidden and never promoted.
 */
export function productAlignment(
  ratedJ: number | null | undefined,
  requiredJ: number,
): { safetyMarginPct: number; notAligned: boolean } {
  const rated = typeof ratedJ === "number" && Number.isFinite(ratedJ) ? ratedJ : 0;
  if (rated <= 0) return { safetyMarginPct: -100, notAligned: true };
  const safetyMarginPct = ((rated - Math.max(0, requiredJ)) / rated) * 100;
  return {
    safetyMarginPct,
    notAligned: safetyMarginPct < PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT,
  };
}

const num = (v: unknown): number =>
  typeof v === "number" ? v : parseFloat(String(v ?? ""));

const calculations = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /api/calculations - save a new impact calculation
calculations.post("/calculations", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const body = await c.req.json();
    // Recompute the energy figures server-side from the raw inputs with the
    // shared PAS 13 engine. The stored kineticEnergy is authoritative — a
    // stale client build can never persist a Math.sin-based figure.
    const unitRaw = String(body.speedUnit ?? "kmh");
    const speedUnit: CalculatorSpeedUnit =
      unitRaw === "mph" || unitRaw === "ms" ? unitRaw : "kmh";
    const energy = computeCalculatorEnergy({
      vehicleMassKg: num(body.vehicleMass),
      loadMassKg: num(body.loadMass),
      speed: num(body.speed),
      speedUnit,
      impactAngleDeg: num(body.impactAngle),
    });
    const serverFields = Number.isFinite(energy.kineticEnergyJ)
      ? {
          kineticEnergy: energy.kineticEnergyJ.toFixed(2),
          pas13AdjustedEnergy: energy.alignedMinRatedJ.toFixed(2),
          pas13SafetyMargin: energy.alignedMinSafetyMarginPct.toFixed(2),
        }
      : {};

    const validatedData = insertImpactCalculationSchema.parse({
      ...body,
      ...serverFields,
      userId,
    });

    const calculation = await storage.saveImpactCalculation(validatedData);

    // Fire-and-forget activity log
    try {
      c.executionCtx.waitUntil(
        storage.logUserActivity({
          userId,
          activityType: "calculation",
          section: "calculator",
          details: { calculationId: calculation.id, type: body.calculationType || body.type },
        })
      );
    } catch {}

    return c.json(calculation);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ message: "Invalid calculation data", errors: error.errors }, 400);
    }
    console.error("Error saving calculation:", error);
    return c.json({ message: "Failed to save calculation" }, 500);
  }
});

// GET /api/calculations - list user calculations
calculations.get("/calculations", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const calcs = await storage.getUserCalculations(userId);
    return c.json(calcs);
  } catch (error) {
    console.error("Error fetching calculations:", error);
    return c.json({ message: "Failed to fetch calculations" }, 500);
  }
});

// GET /api/calculations/:id - get a specific calculation
calculations.get("/calculations/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const id = c.req.param("id");
    const calculation = await storage.getCalculation(id);

    if (!calculation) {
      return c.json({ message: "Calculation not found" }, 404);
    }

    // Verify that the calculation belongs to the authenticated user
    if (calculation.userId !== c.get("user").claims.sub) {
      return c.json({ message: "Access denied" }, 403);
    }

    return c.json(calculation);
  } catch (error) {
    console.error("Error fetching calculation:", error);
    return c.json({ message: "Failed to fetch calculation" }, 500);
  }
});

export default calculations;
