import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const resources = new Hono<{ Bindings: Env; Variables: Variables }>();

// =============================================
// PUBLIC RESOURCE ROUTES
// =============================================

// GET /api/resources
resources.get("/resources", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const resourceType = c.req.query("resourceType");
    const result = await storage.getResources(resourceType);
    return c.json(result);
  } catch (error) {
    console.error("Error fetching resources:", error);
    return c.json({ message: "Failed to fetch resources" }, 500);
  }
});

// GET /api/resources/:id
resources.get("/resources/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const resource = await storage.getResource(c.req.param("id"));
    if (!resource) {
      return c.json({ message: "Resource not found" }, 404);
    }
    return c.json(resource);
  } catch (error) {
    console.error("Error fetching resource:", error);
    return c.json({ message: "Failed to fetch resource" }, 500);
  }
});

// POST /api/resources/:id/download
resources.post("/resources/:id/download", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    await storage.incrementDownloadCount(c.req.param("id"));
    return c.json({ success: true });
  } catch (error) {
    console.error("Error incrementing download count:", error);
    return c.json({ message: "Failed to track download" }, 500);
  }
});

// =============================================
// ADMIN RESOURCE ROUTES
// =============================================

// POST /api/admin/resources
resources.post("/admin/resources", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const user = await storage.getUser(c.get("user").claims.sub);
    if (user?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }

    const body = await c.req.json();
    // TODO: Add Zod validation with insertResourceSchema
    const resource = await storage.createResource(body);
    return c.json(resource);
  } catch (error) {
    console.error("Error creating resource:", error);
    return c.json({ message: "Failed to create resource" }, 500);
  }
});

export default resources;
