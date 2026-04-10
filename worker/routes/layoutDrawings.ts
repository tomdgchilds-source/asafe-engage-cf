import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const layoutDrawings = new Hono<{ Bindings: Env; Variables: Variables }>();

// All layout drawing routes require authentication
layoutDrawings.use("/*", authMiddleware);

// =============================================
// LAYOUT DRAWING ROUTES
// =============================================

// GET /api/layout-drawings
layoutDrawings.get("/layout-drawings", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const drawings = await storage.getLayoutDrawings(userId);
    return c.json(drawings);
  } catch (error) {
    console.error("Error fetching layout drawings:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /api/layout-drawings/trash (must be before :id to avoid matching "trash" as an id)
layoutDrawings.get("/layout-drawings/trash", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const trashedDrawings = await storage.getTrashedLayoutDrawings(userId);
    return c.json(trashedDrawings);
  } catch (error) {
    console.error("Error fetching trashed drawings:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /api/layout-drawings/:id
layoutDrawings.get("/layout-drawings/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const drawing = await storage.getLayoutDrawing(c.req.param("id"));
    if (!drawing) {
      return c.json({ error: "Layout drawing not found" }, 404);
    }
    return c.json(drawing);
  } catch (error) {
    console.error("Error fetching layout drawing:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/layout-drawings
layoutDrawings.post("/layout-drawings", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const { projectName, company, location, fileName, fileUrl, fileType, thumbnailUrl } =
      await c.req.json();

    const drawing = await storage.createLayoutDrawing({
      userId,
      projectName,
      company,
      location,
      fileName,
      fileUrl,
      fileType,
      thumbnailUrl,
    });

    return c.json(drawing, 201);
  } catch (error) {
    console.error("Error creating layout drawing:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/layout-drawings/blank-canvas
layoutDrawings.post("/layout-drawings/blank-canvas", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const { projectName, company, location } = await c.req.json();

    const drawing = await storage.createLayoutDrawing({
      userId,
      projectName,
      company,
      location,
      fileName: `Blank Canvas - ${new Date().toLocaleDateString()}`,
      fileUrl: "blank-canvas",
      fileType: "canvas",
      thumbnailUrl: null,
    });

    return c.json(drawing, 201);
  } catch (error) {
    console.error("Error creating blank canvas:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// DELETE /api/layout-drawings/:id (soft delete)
layoutDrawings.delete("/layout-drawings/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    await storage.deleteLayoutDrawing(c.req.param("id"));
    return c.body(null, 204);
  } catch (error) {
    console.error("Error deleting layout drawing:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/layout-drawings/:id/restore
layoutDrawings.post("/layout-drawings/:id/restore", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    await storage.restoreLayoutDrawing(c.req.param("id"));
    return c.body(null, 204);
  } catch (error) {
    console.error("Error restoring layout drawing:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// DELETE /api/layout-drawings/:id/permanent
layoutDrawings.delete("/layout-drawings/:id/permanent", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    await storage.permanentlyDeleteLayoutDrawing(c.req.param("id"));
    return c.body(null, 204);
  } catch (error) {
    console.error("Error permanently deleting layout drawing:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PUT /api/layout-drawings/:id/scale
layoutDrawings.put("/layout-drawings/:id/scale", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const { scale, scaleLine, isScaleSet } = await c.req.json();

    const updatedDrawing = await storage.updateLayoutDrawingScale(c.req.param("id"), {
      scale,
      scaleLine,
      isScaleSet,
    });

    return c.json(updatedDrawing);
  } catch (error) {
    console.error("Error updating layout drawing scale:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PATCH /api/layout-drawings/:id (update title)
layoutDrawings.patch("/layout-drawings/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const { fileName } = await c.req.json();

    if (!fileName || !fileName.trim()) {
      return c.json({ error: "File name is required" }, 400);
    }

    const updatedDrawing = await storage.updateLayoutDrawingTitle(
      c.req.param("id"),
      fileName.trim()
    );

    return c.json(updatedDrawing);
  } catch (error) {
    console.error("Error updating layout drawing title:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// =============================================
// LAYOUT MARKUP ROUTES
// =============================================

// GET /api/layout-drawings/:drawingId/markups
layoutDrawings.get("/layout-drawings/:drawingId/markups", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const markups = await storage.getLayoutMarkups(c.req.param("drawingId"));
    return c.json(markups);
  } catch (error) {
    console.error("Error fetching layout markups:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/layout-drawings/:drawingId/markups
layoutDrawings.post("/layout-drawings/:drawingId/markups", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const {
      cartItemId,
      productName,
      xPosition,
      yPosition,
      endX,
      endY,
      pathData,
      comment,
      calculatedLength,
    } = await c.req.json();

    const markup = await storage.createLayoutMarkup({
      layoutDrawingId: c.req.param("drawingId"),
      cartItemId,
      productName,
      xPosition,
      yPosition,
      endX,
      endY,
      pathData,
      comment,
      calculatedLength,
    });

    return c.json(markup, 201);
  } catch (error) {
    console.error("Error creating layout markup:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PUT /api/layout-markups/:id
layoutDrawings.put("/layout-markups/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const {
      cartItemId,
      productName,
      xPosition,
      yPosition,
      endX,
      endY,
      pathData,
      comment,
      calculatedLength,
    } = await c.req.json();

    const markup = await storage.updateLayoutMarkup(c.req.param("id"), {
      cartItemId,
      productName,
      xPosition,
      yPosition,
      endX,
      endY,
      pathData,
      comment,
      calculatedLength,
    });

    return c.json(markup);
  } catch (error) {
    console.error("Error updating layout markup:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// DELETE /api/layout-markups/:id
layoutDrawings.delete("/layout-markups/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    await storage.deleteLayoutMarkup(c.req.param("id"));
    return c.body(null, 204);
  } catch (error) {
    console.error("Error deleting layout markup:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default layoutDrawings;
