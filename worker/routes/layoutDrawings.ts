import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import {
  mutationRateLimit,
  heavyMutationRateLimit,
} from "../middleware/rateLimiter";
import { getDb } from "../db";
import { createStorage } from "../storage";

const layoutDrawings = new Hono<{ Bindings: Env; Variables: Variables }>();

// All layout drawing and markup routes require authentication
layoutDrawings.use("/layout-drawings/*", authMiddleware);
layoutDrawings.use("/layout-drawings", authMiddleware);
layoutDrawings.use("/layout-markups/*", authMiddleware);

/**
 * Check that the currently authenticated user owns the parent layout drawing of a given markup.
 * Returns the owning drawing's userId if found, or null if the markup doesn't exist.
 */
async function markupBelongsToUser(
  c: any,
  markupId: string,
  userId: string,
): Promise<{ ok: boolean; reason: "not_found" | "forbidden" | null }> {
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  // Fetch markups via all drawings the user owns and see if this markup is among them.
  // This avoids needing a separate getLayoutMarkupById storage method.
  const userDrawings = await storage.getLayoutDrawings(userId);
  for (const drawing of userDrawings) {
    const markups = await storage.getLayoutMarkups(drawing.id);
    if (markups.some((m: any) => m.id === markupId)) {
      return { ok: true, reason: null };
    }
  }
  return { ok: false, reason: "forbidden" };
}

// =============================================
// LAYOUT DRAWING ROUTES
// =============================================

// GET /api/layout-drawings - list user drawings scoped to their active
// project. Optional ?projectId=<id> override lets the client peek
// another project's drawings (used by ProjectSwitcher to decide whether
// the switch-confirm dialog needs to fire). If the user has no active
// project and no override is supplied, falls back to returning
// EVERYTHING they own (backward compatible). Project-scoped queries
// also return project_id IS NULL orphans — drawings created before
// this feature, or before the user picked a project.
layoutDrawings.get("/layout-drawings", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const overrideRaw = c.req.query("projectId");
    let scope: string | null | undefined;
    if (overrideRaw !== undefined) {
      // Empty / "null" / "none" strings → explicit orphan-only view.
      scope = overrideRaw && overrideRaw !== "null" && overrideRaw !== "none"
        ? overrideRaw
        : null;
    } else {
      const user = await storage.getUser(userId);
      scope = (user as any)?.activeProjectId ?? undefined;
    }
    const drawings = await storage.getLayoutDrawings(userId, scope);
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
    const userId = c.get("user").claims.sub;
    const drawing = await storage.getLayoutDrawing(c.req.param("id"));
    if (!drawing || drawing.userId !== userId) {
      return c.json({ error: "Layout drawing not found" }, 404);
    }
    return c.json(drawing);
  } catch (error) {
    console.error("Error fetching layout drawing:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/layout-drawings — drawing upload, heavy-tier limit.
layoutDrawings.post("/layout-drawings", heavyMutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const body = await c.req.json();
    const { projectName, company, location, fileName, fileUrl, fileType, thumbnailUrl } = body;

    // Stamp the active project so per-project filtering picks it up.
    // Body override wins when present; otherwise fall back to the
    // user's current activeProjectId. Never silently drop it.
    let projectId: string | null | undefined = body.projectId;
    if (projectId === undefined) {
      const user = await storage.getUser(userId);
      projectId = (user as any)?.activeProjectId ?? null;
    }

    // Auto-populate title-block defaults so the branded frame looks
    // complete the moment a drawing is uploaded. The user can override
    // any of these via the title-block editor later.
    const dwgNumber = `DWGAE${String(Math.floor(100000 + Math.random() * 900000))}`;
    const today = new Date();
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const drawingDate = `${String(today.getDate()).padStart(2,"0")}-${months[today.getMonth()]}-${today.getFullYear()}`;

    const drawing = await storage.createLayoutDrawing({
      userId,
      projectId,
      projectName,
      company,
      location,
      fileName,
      fileUrl,
      fileType,
      thumbnailUrl,
      dwgNumber,
      revision: "00",
      drawingDate,
      drawingTitle: "A-SAFE BARRIER PROPOSAL",
      drawingScale: "NTS",
    } as any);

    return c.json(drawing, 201);
  } catch (error) {
    console.error("Error creating layout drawing:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/layout-drawings/blank-canvas — equivalent to upload, heavy-tier.
layoutDrawings.post("/layout-drawings/blank-canvas", heavyMutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const body = await c.req.json();
    const { projectName, company, location } = body;

    // Stamp the active project (same rule as the upload POST).
    let projectId: string | null | undefined = body.projectId;
    if (projectId === undefined) {
      const user = await storage.getUser(userId);
      projectId = (user as any)?.activeProjectId ?? null;
    }

    const drawing = await storage.createLayoutDrawing({
      userId,
      projectId,
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
layoutDrawings.delete("/layout-drawings/:id", mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const drawing = await storage.getLayoutDrawing(c.req.param("id"));
    if (!drawing || drawing.userId !== userId) {
      return c.json({ error: "Layout drawing not found" }, 404);
    }
    await storage.deleteLayoutDrawing(c.req.param("id"));
    return c.body(null, 204);
  } catch (error) {
    console.error("Error deleting layout drawing:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/layout-drawings/:id/restore
layoutDrawings.post("/layout-drawings/:id/restore", mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const drawing = await storage.getLayoutDrawing(c.req.param("id"));
    if (!drawing || drawing.userId !== userId) {
      return c.json({ error: "Layout drawing not found" }, 404);
    }
    await storage.restoreLayoutDrawing(c.req.param("id"));
    return c.body(null, 204);
  } catch (error) {
    console.error("Error restoring layout drawing:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// DELETE /api/layout-drawings/:id/permanent
layoutDrawings.delete("/layout-drawings/:id/permanent", mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const drawing = await storage.getLayoutDrawing(c.req.param("id"));
    if (!drawing || drawing.userId !== userId) {
      return c.json({ error: "Layout drawing not found" }, 404);
    }
    await storage.permanentlyDeleteLayoutDrawing(c.req.param("id"));
    return c.body(null, 204);
  } catch (error) {
    console.error("Error permanently deleting layout drawing:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PUT /api/layout-drawings/:id/scale
layoutDrawings.put("/layout-drawings/:id/scale", mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const drawing = await storage.getLayoutDrawing(c.req.param("id"));
    if (!drawing || drawing.userId !== userId) {
      return c.json({ error: "Layout drawing not found" }, 404);
    }
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

// POST /api/layout-drawings/:id/copy-to-project
// Clones a drawing (title/image/calibration + all markups) into a
// destination project the caller also owns. Smaller jobs frequently
// belong to a larger site family, so the same drawing legitimately
// needs to live in more than one project. The new row gets a fresh
// id, `project_id = destination`, and a copied set of markups that
// point to the new drawing id. Source drawing is untouched.
layoutDrawings.post("/layout-drawings/:id/copy-to-project", mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const sourceId = c.req.param("id");
    const { projectId: destProjectId } = await c.req.json();

    if (!destProjectId || typeof destProjectId !== "string") {
      return c.json({ error: "projectId is required" }, 400);
    }

    // Validate caller owns the source drawing.
    const source = await storage.getLayoutDrawing(sourceId);
    if (!source || source.userId !== userId) {
      return c.json({ error: "Layout drawing not found" }, 404);
    }

    // Validate caller owns the destination project.
    const destProject = await storage.getProject(destProjectId);
    if (!destProject || (destProject as any).userId !== userId) {
      return c.json({ error: "Destination project not found" }, 404);
    }

    // Refuse to copy into the same project — prevents accidental dupes
    // on the same project and keeps the client dialog's job clear.
    if ((source as any).projectId && (source as any).projectId === destProjectId) {
      return c.json({ error: "Source already belongs to that project" }, 400);
    }

    // Copy the drawing row with the destination project stamped.
    // Strip id / createdAt / updatedAt / deletedAt so the DB generates
    // fresh ones. Everything else (title-block metadata, calibration,
    // file pointers) rides along verbatim.
    const { id: _srcId, createdAt: _srcC, updatedAt: _srcU, deletedAt: _srcD, projectId: _srcP, ...carry } = source as any;
    const copied = await storage.createLayoutDrawing({
      ...carry,
      userId,
      projectId: destProjectId,
    } as any);

    // Carry over markups too — a drawing without its markups is a
    // blank template, not a copy. Reset ids and point them at the
    // new drawing.
    const srcMarkups = await storage.getLayoutMarkups(sourceId);
    for (const m of srcMarkups) {
      const { id: _mId, createdAt: _mC, updatedAt: _mU, deletedAt: _mD, layoutDrawingId: _mL, ...mCarry } = m as any;
      await storage.createLayoutMarkup({
        ...mCarry,
        layoutDrawingId: copied.id,
      } as any);
    }

    return c.json(copied, 201);
  } catch (error) {
    console.error("Error copying layout drawing to project:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PATCH /api/layout-drawings/:id
// Accepts either the legacy { fileName } payload (title edit from the
// toolbar) OR the richer title-block metadata payload used by the frame
// editor (dwgNumber / revision / author / etc). Fields not present in
// the body are left untouched so partial updates are safe.
layoutDrawings.patch("/layout-drawings/:id", mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const drawing = await storage.getLayoutDrawing(c.req.param("id"));
    if (!drawing || drawing.userId !== userId) {
      return c.json({ error: "Layout drawing not found" }, 404);
    }

    const body = await c.req.json();

    // Legacy single-field path (toolbar rename).
    if (typeof body.fileName === "string" && Object.keys(body).length === 1) {
      if (!body.fileName.trim()) {
        return c.json({ error: "File name is required" }, 400);
      }
      const updated = await storage.updateLayoutDrawingTitle(
        c.req.param("id"),
        body.fileName.trim()
      );
      return c.json(updated);
    }

    // Full metadata path — whitelist the fields we actually persist.
    const allowed: Record<string, any> = {};
    const fields = [
      "fileName",
      "dwgNumber",
      "revision",
      "drawingDate",
      "drawingTitle",
      "drawingScale",
      "author",
      "checkedBy",
      "projectName",
      "company",
      "location",
      "revisionHistory",
      "notesSection",
    ];
    for (const f of fields) {
      if (f in body) allowed[f] = body[f];
    }
    allowed.updatedAt = new Date();

    const updated = await storage.updateLayoutDrawing(
      c.req.param("id"),
      allowed
    );
    return c.json(updated);
  } catch (error) {
    console.error("Error updating layout drawing:", error);
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
    const userId = c.get("user").claims.sub;
    const drawing = await storage.getLayoutDrawing(c.req.param("drawingId"));
    if (!drawing || drawing.userId !== userId) {
      return c.json({ error: "Layout drawing not found" }, 404);
    }
    const markups = await storage.getLayoutMarkups(c.req.param("drawingId"));
    return c.json(markups);
  } catch (error) {
    console.error("Error fetching layout markups:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /api/layout-drawings/:drawingId/markups
layoutDrawings.post("/layout-drawings/:drawingId/markups", mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const drawing = await storage.getLayoutDrawing(c.req.param("drawingId"));
    if (!drawing || drawing.userId !== userId) {
      return c.json({ error: "Layout drawing not found" }, 404);
    }
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

// PUT /api/layout-markups/:id — owner only
layoutDrawings.put("/layout-markups/:id", mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const markupId = c.req.param("id");

    const check = await markupBelongsToUser(c, markupId, userId);
    if (!check.ok) {
      return c.json({ error: "Forbidden" }, 403);
    }

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

    const markup = await storage.updateLayoutMarkup(markupId, {
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

// DELETE /api/layout-markups/:id — owner only
layoutDrawings.delete("/layout-markups/:id", mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const markupId = c.req.param("id");

    const check = await markupBelongsToUser(c, markupId, userId);
    if (!check.ok) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await storage.deleteLayoutMarkup(markupId);
    return c.body(null, 204);
  } catch (error) {
    console.error("Error deleting layout markup:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default layoutDrawings;
