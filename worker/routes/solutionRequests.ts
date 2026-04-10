import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const solutionRequests = new Hono<{ Bindings: Env; Variables: Variables }>();

// ──────────────────────────────────────────────
// POST /api/solution-requests
// ──────────────────────────────────────────────
solutionRequests.post("/api/solution-requests", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const body = await c.req.json();

    const requestData = { ...body, userId };

    // TODO: port insertSolutionRequestSchema validation
    // const validation = insertSolutionRequestSchema.safeParse(requestData);
    // if (!validation.success) {
    //   return c.json({ message: "Validation failed", errors: validation.error.errors }, 400);
    // }

    // TODO: port performIntelligentMatching
    // const matchingResults = await performIntelligentMatching(requestData);
    // requestData.recommendedProducts = matchingResults.recommendedProducts;
    // requestData.recommendedCaseStudies = matchingResults.recommendedCaseStudies;
    // requestData.matchScore = matchingResults.matchScore;
    // requestData.keywords = matchingResults.extractedKeywords;

    const solutionRequest = await storage.createSolutionRequest(requestData);
    return c.json(solutionRequest);
  } catch (error) {
    console.error("Error creating solution request:", error);
    return c.json({ message: "Failed to create solution request" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/solution-requests
// ──────────────────────────────────────────────
solutionRequests.get("/api/solution-requests", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const result = await storage.getSolutionRequestsByUser(userId);
    return c.json(result);
  } catch (error) {
    console.error("Error fetching solution requests:", error);
    return c.json({ message: "Failed to fetch solution requests" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/solution-requests/:id
// ──────────────────────────────────────────────
solutionRequests.get("/api/solution-requests/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const id = c.req.param("id");

    const solutionRequest = await storage.getSolutionRequest(id, userId);
    if (!solutionRequest) {
      return c.json({ message: "Solution request not found" }, 404);
    }

    // TODO: port getDetailedRecommendations
    // const detailedRecommendations = await getDetailedRecommendations(solutionRequest);

    return c.json({
      ...solutionRequest,
      // detailedRecommendations,
    });
  } catch (error) {
    console.error("Error fetching solution request:", error);
    return c.json({ message: "Failed to fetch solution request" }, 500);
  }
});

// ──────────────────────────────────────────────
// DELETE /api/solution-requests/:id
// ──────────────────────────────────────────────
solutionRequests.delete("/api/solution-requests/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const id = c.req.param("id");

    const solutionRequest = await storage.getSolutionRequest(id, userId);
    if (!solutionRequest) {
      return c.json({ message: "Solution request not found" }, 404);
    }

    await storage.deleteSolutionRequest(id, userId);
    return c.json({ success: true, message: "Solution request deleted successfully" });
  } catch (error) {
    console.error("Error deleting solution request:", error);
    return c.json({ message: "Failed to delete solution request" }, 500);
  }
});

export default solutionRequests;
