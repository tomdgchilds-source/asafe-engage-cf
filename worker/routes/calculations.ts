import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";
import { insertImpactCalculationSchema } from "@shared/schema";

const calculations = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /api/calculations - save a new impact calculation
calculations.post("/calculations", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const body = await c.req.json();
    const validatedData = insertImpactCalculationSchema.parse({
      ...body,
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
