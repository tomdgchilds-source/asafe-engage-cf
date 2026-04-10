import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const caseStudies = new Hono<{ Bindings: Env; Variables: Variables }>();

// =============================================
// PUBLIC CASE STUDY ROUTES
// =============================================

// GET /api/case-studies
caseStudies.get("/case-studies", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const industry = c.req.query("industry");
    const contentType = c.req.query("contentType");
    const result = await storage.getCaseStudies(industry, contentType);
    return c.json(result);
  } catch (error) {
    console.error("Error fetching case studies:", error);
    return c.json({ message: "Failed to fetch case studies" }, 500);
  }
});

// GET /api/case-studies/:id
caseStudies.get("/case-studies/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const caseStudy = await storage.getCaseStudy(c.req.param("id"));
    if (!caseStudy) {
      return c.json({ message: "Case study not found" }, 404);
    }
    return c.json(caseStudy);
  } catch (error) {
    console.error("Error fetching case study:", error);
    return c.json({ message: "Failed to fetch case study" }, 500);
  }
});

// =============================================
// ADMIN CASE STUDY ROUTES
// =============================================

// POST /api/admin/case-studies
caseStudies.post("/admin/case-studies", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const user = await storage.getUser(c.get("user").claims.sub);
    if (user?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }

    const body = await c.req.json();
    // TODO: Add Zod validation with insertCaseStudySchema
    const caseStudy = await storage.createCaseStudy(body);
    return c.json(caseStudy);
  } catch (error) {
    console.error("Error creating case study:", error);
    return c.json({ message: "Failed to create case study" }, 500);
  }
});

// =============================================
// PROJECT CASE STUDY ROUTES
// =============================================

// GET /api/project-case-studies
caseStudies.get("/project-case-studies", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const projectCaseStudies = await storage.getProjectCaseStudies(userId);
    return c.json(projectCaseStudies);
  } catch (error) {
    console.error("Error fetching project case studies:", error);
    return c.json({ message: "Failed to fetch project case studies" }, 500);
  }
});

// POST /api/project-case-studies
caseStudies.post("/project-case-studies", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const { caseStudyIds } = await c.req.json();

    if (!Array.isArray(caseStudyIds)) {
      return c.json({ message: "caseStudyIds must be an array" }, 400);
    }

    const updatedSelections = await storage.updateProjectCaseStudies(userId, caseStudyIds);
    return c.json(updatedSelections);
  } catch (error) {
    console.error("Error updating project case studies:", error);
    return c.json({ message: "Failed to update project case studies" }, 500);
  }
});

export default caseStudies;
