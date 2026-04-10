import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const files = new Hono<{ Bindings: Env; Variables: Variables }>();

// ──────────────────────────────────────────────
// POST /api/objects/upload
// ──────────────────────────────────────────────
files.post("/api/objects/upload", authMiddleware, async (c) => {
  try {
    const bucket = c.env.R2_BUCKET;

    // Generate a unique key for the upload
    const key = `uploads/${crypto.randomUUID()}`;
    const accessPath = `/objects/${key}`;

    // For R2 direct upload, we return the key and let the client PUT to the object route,
    // or we accept the file body here directly.
    // For now, return the path the client should use to access the object after upload.
    return c.json({ uploadKey: key, accessPath });
  } catch (error) {
    console.error("Error getting upload URL:", error);
    return c.json({ message: "Failed to get upload URL" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /objects/:path - file download from R2
// ──────────────────────────────────────────────
files.get("/objects/*", authMiddleware, async (c) => {
  try {
    const bucket = c.env.R2_BUCKET;
    // Extract the path after "/objects/"
    const objectPath = c.req.path.replace(/^\/objects\//, "");

    if (!objectPath) {
      return c.json({ message: "Object path is required" }, 400);
    }

    const object = await bucket.get(objectPath);
    if (!object) {
      return c.json({ message: "Object not found" }, 404);
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      object.httpMetadata?.contentType || "application/octet-stream",
    );
    headers.set("Cache-Control", "public, max-age=3600");

    if (object.httpMetadata?.contentDisposition) {
      headers.set("Content-Disposition", object.httpMetadata.contentDisposition);
    }

    return new Response(object.body as ReadableStream, { headers });
  } catch (error) {
    console.error("Error serving object:", error);
    return c.json({ message: "Failed to serve object" }, 500);
  }
});

// ──────────────────────────────────────────────
// PUT /api/site-references
// ──────────────────────────────────────────────
files.put("/api/site-references", authMiddleware, async (c) => {
  try {
    const { imageUrl, productName, caption, type } = await c.req.json<{
      imageUrl?: string;
      productName?: string;
      caption?: string;
      type?: string;
    }>();

    if (!imageUrl) {
      return c.json({ message: "Image URL is required" }, 400);
    }

    // For R2, extract the object path from the URL
    let objectPath = imageUrl;
    if (imageUrl.startsWith("https://")) {
      try {
        const url = new URL(imageUrl);
        const pathParts = url.pathname.split("/");
        if (pathParts.length > 2) {
          objectPath = `/objects/${pathParts.slice(2).join("/")}`;
        }
      } catch {
        // Keep the original path if URL parsing fails
      }
    }

    return c.json({ objectPath, caption, type });
  } catch (error) {
    console.error("Error setting site reference ACL:", error);
    return c.json({ message: "Failed to set image ACL" }, 500);
  }
});

export default files;
