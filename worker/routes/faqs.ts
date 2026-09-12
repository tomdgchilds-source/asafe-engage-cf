import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";
import { renderFaqSheet } from "../lib/pdf/reports/faqSheet";

const faqs = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Comma-separated (or repeated) query values → trimmed, de-duplicated list. */
function listParam(values: string[] | undefined): string[] {
  const out = new Set<string>();
  for (const v of values ?? []) for (const part of v.split(",")) if (part.trim()) out.add(part.trim());
  return Array.from(out);
}

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

// GET /api/faqs/documents/faq-sheet.pdf?category=a,b&ids=x,y&download=1
// Public, like the FAQ list. Branded A4 sheet rendered server-side; `ids`
// wins over `category`; neither = every customer-facing category.
// `download=1` sends the file as an attachment instead of inline.
faqs.get("/faqs/documents/faq-sheet.pdf", async (c) => {
  try {
    const out = await renderFaqSheet(c.env, {
      categories: listParam(c.req.queries("category")),
      ids: listParam(c.req.queries("ids")),
      status: (c.req.query("status") || "").toLowerCase() === "draft" ? "DRAFT" : "ISSUED",
    });
    const disposition = c.req.query("download") === "1" ? "attachment" : "inline";
    return new Response(out.pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${out.filename}"`,
        "Content-Length": String(out.pdf.byteLength),
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Error rendering FAQ sheet:", error);
    return c.json({ message: "Failed to render FAQ sheet" }, 500);
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
