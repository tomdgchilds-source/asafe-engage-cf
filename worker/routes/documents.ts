// ────────────────────────────────────────────────────────────────────────────
// worker/routes/documents.ts
//
// Customer document endpoints (Phase 3D). Every document is rendered by
// worker/lib/pdf/reports/* from the same data the app shows on screen.
//
//   GET /api/orders/:id/documents/order-form.pdf?status=draft|issued
//   GET /api/orders/:id/documents/proposal.pdf?status=draft|issued&surveyId=
//
// Owner-or-admin gated. `status=issued` allocates a reference
// (ASU-<kind>-<yymm>-<seq>), stores the PDF at documents/<kind>/<ref>-<rev>.pdf
// and records a document_issues row; the default (draft) renders with a
// DRAFT watermark and no side effects.
//
// Public callers (share view, approval landing page) use the token-gated
// variants at the bottom of this file; they always get a DRAFT render.
// TODO(PD6): once the document register exists, serve the latest ISSUED
// object_key from document_issues to public callers instead of re-rendering.
// ────────────────────────────────────────────────────────────────────────────

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import type { Order } from "../../shared/schema";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";
import { renderProposal } from "../lib/pdf/reports/proposal";
import { renderOrderForm } from "../lib/pdf/reports/orderForm";
import type { RenderedDocument } from "../lib/pdf/reports/proposal";

const documents = new Hono<{ Bindings: Env; Variables: Variables }>();

function statusParam(raw: string | undefined): "DRAFT" | "ISSUED" {
  return String(raw ?? "").trim().toLowerCase() === "issued" ? "ISSUED" : "DRAFT";
}

function serveDocument(doc: RenderedDocument): Response {
  return new Response(doc.bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.filename}"`,
      "Content-Length": String(doc.bytes.byteLength),
      "Cache-Control": doc.status === "ISSUED" ? "private, max-age=3600" : "private, no-store",
      "X-Document-Reference": doc.reference,
      "X-Document-Revision": doc.revision,
      "X-Document-Status": doc.status,
      ...(doc.objectKey ? { "X-Document-Object-Key": doc.objectKey } : {}),
    },
  });
}

/** Owner-or-admin gate. Returns the order or a Response to send. */
async function gateOrder(c: { env: Env; get: (k: "user") => Variables["user"]; json: (b: unknown, s: 403 | 404) => Response }, orderId: string) {
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const userId = c.get("user").claims.sub;
  const order = await storage.getOrder(orderId);
  if (!order) return { error: c.json({ message: "Order not found" }, 404) };
  if (order.userId !== userId) {
    const user = await storage.getUser(userId);
    if (user?.role !== "admin") return { error: c.json({ message: "Not authorized" }, 403) };
  }
  return { order, userId };
}

// ─── Public, token-gated order form ────────────────────────────────────────
//
// The share view and the approval landing page (client/src/pages/
// SharedOrderView.tsx, ApprovalLanding.tsx) fetch the same bytes without a
// session: either an order share token or a live approval token names the
// order. Always a DRAFT-status render: an anonymous caller never allocates
// a reference or writes a document_issues row.

type TokenLookup = { order: Order; status?: undefined } | { order?: undefined; status: 404 | 410 };

async function orderForToken(env: Env, token: string, orderId?: string): Promise<TokenLookup> {
  const db = getDb(env.DATABASE_URL);
  const storage = createStorage(db);
  const shared = await storage.getOrderByShareToken(token).catch(() => undefined);
  if (shared) {
    const exp = shared.shareTokenExpiresAt;
    if (exp && new Date(exp).getTime() < Date.now()) return { status: 410 as const };
    if (orderId && shared.id !== orderId) return { status: 404 as const };
    return { order: shared };
  }
  const approval = await storage.getApprovalTokenByToken(token).catch(() => undefined);
  if (approval && !approval.revokedAt && new Date(approval.expiresAt).getTime() > Date.now()) {
    if (orderId && approval.orderId !== orderId) return { status: 404 as const };
    const order = await storage.getOrder(approval.orderId);
    if (order) return { order };
  }
  return { status: 404 as const };
}

async function servePublicOrderForm(c: { env: Env; req: { url: string }; json: (b: unknown, s: 404 | 410 | 500) => Response }, token: string, orderId?: string) {
  const found = await orderForToken(c.env, token, orderId);
  if (!found.order) return c.json({ message: found.status === 410 ? "Link expired or revoked" : "Order not found" }, found.status ?? 404);
  const rendered = await renderOrderForm(c.env, found.order.id, { status: "DRAFT", appOrigin: c.env.APP_URL || new URL(c.req.url).origin });
  if (!rendered) return c.json({ message: "Order not found" }, 404);
  return serveDocument(rendered);
}

documents.get("/public/orders/:token/documents/order-form.pdf", async (c) => {
  try {
    return await servePublicOrderForm(c, c.req.param("token"));
  } catch (error) {
    console.error("Error rendering shared order form:", error);
    return c.json({ message: "Failed to render order form" }, 500);
  }
});

// `?token=` on the owner route lets an anonymous approver or share-link
// holder fetch the order form without a session. Hono runs handlers in
// registration order, so this middleware is registered BEFORE the authed
// GET below: with a token it answers here, without one it falls through.
documents.use("/orders/:id/documents/order-form.pdf", async (c, next) => {
  const token = c.req.query("token");
  if (!token) return next();
  try {
    return await servePublicOrderForm(c, token, c.req.param("id"));
  } catch (error) {
    console.error("Error rendering token-gated order form:", error);
    return c.json({ message: "Failed to render order form" }, 500);
  }
});

documents.get("/orders/:id/documents/order-form.pdf", authMiddleware, async (c) => {
  try {
    const orderId = c.req.param("id");
    const gate = await gateOrder(c, orderId);
    if ("error" in gate) return gate.error;
    const rendered = await renderOrderForm(c.env, orderId, {
      status: statusParam(c.req.query("status")),
      surveyId: c.req.query("surveyId") || null,
      issuedBy: gate.userId,
      appOrigin: c.env.APP_URL || new URL(c.req.url).origin,
    });
    if (!rendered) return c.json({ message: "Order not found" }, 404);
    return serveDocument(rendered);
  } catch (error) {
    console.error("Error rendering order form:", error);
    return c.json({ message: "Failed to render order form" }, 500);
  }
});

documents.get("/orders/:id/documents/proposal.pdf", authMiddleware, async (c) => {
  try {
    const orderId = c.req.param("id");
    const gate = await gateOrder(c, orderId);
    if ("error" in gate) return gate.error;
    const rendered = await renderProposal(c.env, {
      orderId,
      status: statusParam(c.req.query("status")),
      surveyId: c.req.query("surveyId") || null,
      issuedBy: gate.userId,
      appOrigin: c.env.APP_URL || new URL(c.req.url).origin,
    });
    if (!rendered) return c.json({ message: "Order not found" }, 404);
    return serveDocument(rendered);
  } catch (error) {
    console.error("Error rendering proposal:", error);
    return c.json({ message: "Failed to render proposal" }, 500);
  }
});

export default documents;
