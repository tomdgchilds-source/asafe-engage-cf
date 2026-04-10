import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const companyLogo = new Hono<{ Bindings: Env; Variables: Variables }>();

// ──────────────────────────────────────────────
// POST /api/company-logo/search
// ──────────────────────────────────────────────
companyLogo.post("/api/company-logo/search", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const { companyName, forceRefresh } = await c.req.json<{
      companyName?: string;
      forceRefresh?: boolean;
    }>();

    if (!companyName || companyName.trim().length < 2) {
      return c.json({
        success: false,
        message: "Company name must be at least 2 characters",
      });
    }

    // TODO: implement companyLogoService equivalent for CF Workers
    // const result = await companyLogoService.searchCompanyLogo(companyName, { forceRefresh });
    const result = null as any; // placeholder

    if (result) {
      return c.json({ success: true, logo: result });
    } else {
      return c.json({
        success: false,
        message: "No logo found for this company",
      });
    }
  } catch (error) {
    console.error("Error searching for company logo:", error);
    return c.json(
      { success: false, message: "Failed to search for company logo" },
      500,
    );
  }
});

// ──────────────────────────────────────────────
// POST /api/company-logo/confirm
// ──────────────────────────────────────────────
companyLogo.post("/api/company-logo/confirm", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const { companyName, logoUrl } = await c.req.json<{
      companyName?: string;
      logoUrl?: string;
    }>();

    if (!companyName || !logoUrl) {
      return c.json(
        { success: false, message: "Company name and logo URL are required" },
        400,
      );
    }

    // TODO: implement companyLogoService equivalent for CF Workers
    // const confirmed = await companyLogoService.confirmLogo(companyName, logoUrl);
    const confirmed = false; // placeholder

    return c.json({
      success: confirmed,
      message: confirmed
        ? "Logo confirmed successfully"
        : "Failed to confirm logo",
    });
  } catch (error) {
    console.error("Error confirming company logo:", error);
    return c.json(
      { success: false, message: "Failed to confirm company logo" },
      500,
    );
  }
});

// ──────────────────────────────────────────────
// GET /api/company-logo/cached/:companyName
// ──────────────────────────────────────────────
companyLogo.get(
  "/api/company-logo/cached/:companyName",
  authMiddleware,
  async (c) => {
    try {
      const db = getDb(c.env.DATABASE_URL);
      const storage = createStorage(db);
      const companyName = c.req.param("companyName");

      // TODO: implement companyLogoService equivalent for CF Workers
      // const result = await companyLogoService.searchCompanyLogo(companyName, { forceRefresh: false });
      const result = null as any; // placeholder

      if (result) {
        return c.json({ success: true, logo: result });
      } else {
        return c.json({ success: false, message: "No cached logo found" });
      }
    } catch (error) {
      console.error("Error getting cached logo:", error);
      return c.json({ message: "Failed to get cached logo" }, 500);
    }
  },
);

// ──────────────────────────────────────────────
// GET /api/company-logo/proxy
// ──────────────────────────────────────────────
companyLogo.get("/api/company-logo/proxy", async (c) => {
  try {
    const url = c.req.query("url");

    if (!url || typeof url !== "string") {
      return c.json({ message: "Logo URL is required" }, 400);
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return c.json({ message: "Invalid URL format" }, 400);
    }

    // Fetch the image
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; A-SAFE Portal/1.0)",
      },
    });

    if (!response.ok) {
      return c.json({ message: "Logo not found" }, 404);
    }

    // Get content type
    const contentType = response.headers.get("content-type");
    if (
      contentType &&
      !contentType.startsWith("image/") &&
      !contentType.includes("svg")
    ) {
      return c.json({ message: "URL does not point to an image" }, 400);
    }

    const buffer = await response.arrayBuffer();

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType || "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("Error proxying logo:", error);
    return c.json({ message: "Failed to proxy logo" }, 500);
  }
});

export default companyLogo;
