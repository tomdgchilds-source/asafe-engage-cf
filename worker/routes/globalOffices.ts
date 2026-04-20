import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const globalOffices = new Hono<{ Bindings: Env; Variables: Variables }>();

// ──────────────────────────────────────────────
// GET /api/global-offices
// ──────────────────────────────────────────────
globalOffices.get("/global-offices", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const region = c.req.query("region");
    const country = c.req.query("country");
    const officeType = c.req.query("officeType");
    const offices = await storage.getGlobalOffices({ region, country, officeType });
    return c.json(offices);
  } catch (error) {
    console.error("Error fetching global offices:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/global-offices/region/:region
// ──────────────────────────────────────────────
globalOffices.get("/global-offices/region/:region", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const offices = await storage.getGlobalOfficesByRegion(c.req.param("region"));
    return c.json(offices);
  } catch (error) {
    console.error("Error fetching offices by region:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/global-offices/country/:country
// ──────────────────────────────────────────────
globalOffices.get("/global-offices/country/:country", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const offices = await storage.getGlobalOfficesByCountry(c.req.param("country"));
    return c.json(offices);
  } catch (error) {
    console.error("Error fetching offices by country:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/global-offices/default/:region
// ──────────────────────────────────────────────
globalOffices.get("/global-offices/default/:region", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const office = await storage.getDefaultOfficeForRegion(c.req.param("region"));
    if (!office) {
      return c.json({ message: "No default office found for region" }, 404);
    }
    return c.json(office);
  } catch (error) {
    console.error("Error fetching default office:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/global-offices/:id
// ──────────────────────────────────────────────
globalOffices.get("/global-offices/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const office = await storage.getGlobalOffice(c.req.param("id"));
    if (!office) {
      return c.json({ message: "Office not found" }, 404);
    }
    return c.json(office);
  } catch (error) {
    console.error("Error fetching office:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/global-offices (admin only)
// ──────────────────────────────────────────────
globalOffices.post("/global-offices", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const user = c.get("user");

    // Check admin role via storage
    const userRecord = await storage.getUser(user.claims.sub);
    if (userRecord?.role !== "admin") {
      return c.json({ message: "Forbidden" }, 403);
    }

    const body = await c.req.json();
    const office = await storage.createGlobalOffice(body);
    return c.json(office, 201);
  } catch (error) {
    console.error("Error creating office:", error);
    return c.json({ message: "Failed to create office" }, 500);
  }
});

// ──────────────────────────────────────────────
// PUT /api/global-offices/:id (admin only)
// ──────────────────────────────────────────────
globalOffices.put("/global-offices/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const user = c.get("user");

    const userRecord = await storage.getUser(user.claims.sub);
    if (userRecord?.role !== "admin") {
      return c.json({ message: "Forbidden" }, 403);
    }

    const body = await c.req.json();
    const updatedOffice = await storage.updateGlobalOffice(c.req.param("id"), body);
    return c.json(updatedOffice);
  } catch (error) {
    console.error("Error updating office:", error);
    return c.json({ message: "Failed to update office" }, 500);
  }
});

// ──────────────────────────────────────────────
// DELETE /api/global-offices/:id (admin only)
// ──────────────────────────────────────────────
globalOffices.delete("/global-offices/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const user = c.get("user");

    const userRecord = await storage.getUser(user.claims.sub);
    if (userRecord?.role !== "admin") {
      return c.json({ message: "Forbidden" }, 403);
    }

    await storage.deleteGlobalOffice(c.req.param("id"));
    return c.body(null, 204);
  } catch (error) {
    console.error("Error deleting office:", error);
    return c.json({ message: "Failed to delete office" }, 500);
  }
});

export default globalOffices;
