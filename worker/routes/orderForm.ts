// ────────────────────────────────────────────────────────────────────────────
// worker/routes/orderForm.ts
//
// Legacy order-form PDF paths, kept so links already in customers' inboxes
// keep working. Both serve the Phase 3D order form rendered by
// worker/lib/pdf/reports/orderForm.ts — the same bytes as
// GET /api/orders/:id/documents/order-form.pdf (worker/routes/documents.ts).
//
//   GET  /api/orders/:id/order-form.pdf          owner-or-admin, DRAFT render
//   GET  /api/share/orders/:token/order-form.pdf public, share-token gated
//
// The v2 pure-TS builder (worker/lib/orderFormPdfV2.ts) and its admin
// sample endpoint were removed with the document system.
// ────────────────────────────────────────────────────────────────────────────

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";
import { renderOrderForm } from "../lib/pdf/reports/orderForm";
import type { RenderedDocument } from "../lib/pdf/reports/proposal";

const orderForm = new Hono<{ Bindings: Env; Variables: Variables }>();

function respond(doc: RenderedDocument, cacheControl: string): Response {
  return new Response(doc.bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.filename}"`,
      "Content-Length": String(doc.bytes.byteLength),
      "Cache-Control": cacheControl,
      "X-Document-Reference": doc.reference,
      "X-Document-Revision": doc.revision,
    },
  });
}

orderForm.get("/orders/:id/order-form.pdf", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const orderId = c.req.param("id");
    const order = await storage.getOrder(orderId);
    if (!order) return c.json({ message: "Order not found" }, 404);
    if (order.userId !== userId) {
      const user = await storage.getUser(userId);
      if (user?.role !== "admin") return c.json({ message: "Not authorized" }, 403);
    }
    const rendered = await renderOrderForm(c.env, orderId, {
      status: "DRAFT",
      issuedBy: userId,
      appOrigin: c.env.APP_URL || new URL(c.req.url).origin,
    });
    if (!rendered) return c.json({ message: "Order not found" }, 404);
    return respond(rendered, "private, no-store");
  } catch (error) {
    console.error("Error rendering order-form PDF:", error);
    return c.json({ message: "Failed to render order form" }, 500);
  }
});

orderForm.get("/share/orders/:token/order-form.pdf", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const order = await storage.getOrderByShareToken(c.req.param("token"));
    if (!order) return c.json({ message: "Order not found" }, 404);
    const exp = order.shareTokenExpiresAt;
    if (exp && new Date(exp).getTime() < Date.now()) {
      return c.json({ message: "Share link has expired" }, 410);
    }
    const rendered = await renderOrderForm(c.env, order.id, {
      status: "DRAFT",
      appOrigin: c.env.APP_URL || new URL(c.req.url).origin,
    });
    if (!rendered) return c.json({ message: "Order not found" }, 404);
    return respond(rendered, "public, max-age=300");
  } catch (error) {
    console.error("Error rendering shared order-form PDF:", error);
    return c.json({ message: "Failed to render order form" }, 500);
  }
});

export default orderForm;
