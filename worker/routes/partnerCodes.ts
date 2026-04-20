import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const partnerCodesRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Rate limiting: users attempting codes are limited to 10 validate() calls
 * per 60 seconds per user (or per IP if unauthenticated). Uses the existing
 * KV_SESSIONS namespace since we already have it bound.
 */
async function rateLimited(env: Env, key: string): Promise<boolean> {
  if (!env.KV_SESSIONS) return false;
  const bucketKey = `ratelimit:partner-validate:${key}`;
  const current = parseInt((await env.KV_SESSIONS.get(bucketKey)) || "0", 10);
  if (current >= 10) return true;
  await env.KV_SESSIONS.put(bucketKey, String(current + 1), { expirationTtl: 60 });
  return false;
}

/**
 * Admin guard: only users with the admin flag can manage codes.
 * Route-level (the storage layer is not role-aware).
 */
async function requireAdmin(c: any): Promise<{ ok: true } | { ok: false; res: Response }> {
  const user = c.get("user");
  if (!user?.claims?.sub) {
    return { ok: false, res: c.json({ message: "Unauthorized" }, 401) };
  }
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const full = await storage.getUser(user.claims.sub);
  // Either the dedicated admin column OR role === "admin" qualifies.
  if (!(full as any)?.isAdmin && (full as any)?.role !== "admin") {
    return { ok: false, res: c.json({ message: "Admin only" }, 403) };
  }
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────
// POST /api/partner-codes/validate
//
// Request body: { code: string }
// Response:     { valid: true, partnerName, discountPercent } | { valid: false, reason }
//
// IMPORTANT: This endpoint never returns a listing of codes, even on admin
// sessions. The admin listing is a separate endpoint guarded by the admin
// flag, below.
// ──────────────────────────────────────────────────────────────
partnerCodesRoutes.post("/partner-codes/validate", authMiddleware, async (c) => {
  try {
    const userId = c.get("user")?.claims?.sub ?? "anon";
    if (await rateLimited(c.env, userId)) {
      return c.json({ valid: false, reason: "rate_limited" }, 429);
    }

    const body = await c.req.json<{ code?: string }>().catch(() => ({} as any));
    const code = (body?.code || "").trim();
    if (!code) {
      return c.json({ valid: false, reason: "invalid" });
    }

    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    // validate is per-user — the per-user caps (same-code 12mo,
    // total-redemptions 12mo) are enforced here so the client can show the
    // friendly error from the reasonMap before checkout.
    const result = await storage.validatePartnerCode(code, userId);

    if (result.valid) {
      return c.json({
        valid: true,
        partnerName: result.partnerName,
        discountPercent: result.discountPercent,
      });
    }
    return c.json({ valid: false, reason: result.reason });
  } catch (err) {
    console.error("validate partner code failed", err);
    return c.json({ valid: false, reason: "server_error" }, 500);
  }
});

// ──────────────────────────────────────────────────────────────
// Admin: GET /api/admin/partner-codes
// ──────────────────────────────────────────────────────────────
partnerCodesRoutes.get("/admin/partner-codes", authMiddleware, async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.res;

  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const rows = await storage.listPartnerCodes();
  return c.json(rows);
});

// ──────────────────────────────────────────────────────────────
// Admin: POST /api/admin/partner-codes
// Body: { code, partnerName, discountPercent, validFrom?, validTo?, usageCap?, notes? }
// ──────────────────────────────────────────────────────────────
partnerCodesRoutes.post("/admin/partner-codes", authMiddleware, async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.res;

  try {
    const body = await c.req.json<{
      code?: string;
      partnerName?: string;
      discountPercent?: number;
      validFrom?: string | null;
      validTo?: string | null;
      usageCap?: number | null;
      notes?: string | null;
    }>();
    if (!body.code || !body.partnerName || typeof body.discountPercent !== "number") {
      return c.json({ message: "code, partnerName and discountPercent are required" }, 400);
    }

    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const user = c.get("user");
    const row = await storage.createPartnerCode({
      code: body.code,
      partnerName: body.partnerName,
      discountPercent: body.discountPercent,
      validFrom: body.validFrom ? new Date(body.validFrom) : null,
      validTo: body.validTo ? new Date(body.validTo) : null,
      usageCap: body.usageCap ?? null,
      notes: body.notes ?? null,
      createdBy: user?.claims?.sub ?? null,
    });
    return c.json(row, 201);
  } catch (err: any) {
    console.error("create partner code failed", err);
    const msg = err?.message || "Failed to create partner code";
    return c.json({ message: msg }, 400);
  }
});

// ──────────────────────────────────────────────────────────────
// Admin: PATCH /api/admin/partner-codes/:id/active
// Body: { isActive: boolean }
// ──────────────────────────────────────────────────────────────
partnerCodesRoutes.patch("/admin/partner-codes/:id/active", authMiddleware, async (c) => {
  const gate = await requireAdmin(c);
  if (!gate.ok) return gate.res;

  const id = c.req.param("id");
  const body = await c.req.json<{ isActive?: boolean }>();
  if (typeof body.isActive !== "boolean") {
    return c.json({ message: "isActive boolean required" }, 400);
  }
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  await storage.setPartnerCodeActive(id, body.isActive);
  return c.json({ ok: true });
});

export default partnerCodesRoutes;
