import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const faqs = new Hono<{ Bindings: Env; Variables: Variables }>();

// =============================================
// PUBLIC FAQ ROUTES
// =============================================

// GET /api/faqs
faqs.get("/faqs", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const category = c.req.query("category");
    const result = await storage.getFaqs(category);
    return c.json(result);
  } catch (error) {
    console.error("Error fetching FAQs:", error);
    return c.json({ message: "Failed to fetch FAQs" }, 500);
  }
});

// =============================================
// ADMIN FAQ ROUTES
// =============================================

// POST /api/admin/faqs
faqs.post("/admin/faqs", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const user = await storage.getUser(c.get("user").claims.sub);
    if (user?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }

    const body = await c.req.json();
    // TODO: Add Zod validation with insertFaqSchema
    const faq = await storage.createFaq(body);
    return c.json(faq);
  } catch (error) {
    console.error("Error creating FAQ:", error);
    return c.json({ message: "Failed to create FAQ" }, 500);
  }
});

export default faqs;
