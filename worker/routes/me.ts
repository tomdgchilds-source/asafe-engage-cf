import { Hono } from "hono";
import { getCookie, deleteCookie } from "hono/cookie";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { accountDeletionRateLimit } from "../middleware/rateLimiter";
import { getDb } from "../db";
import { createStorage } from "../storage";

// ─────────────────────────────────────────────────────────
// Self-service account routes.
//
// Currently exposes a single endpoint: DELETE /api/me/account. This
// is a GDPR-style "right to erasure" flow — the user asks for their
// identity to be dissociated from the account. What we actually do:
//
//   1. Anonymise PII on the users row (email, names, phone, job
//      title, profile image).
//   2. Flip users.is_active to false so the account can no longer log
//      in or be used by any app surface.
//   3. Destroy the current session (both the KV entry AND the cookie)
//      so the caller is immediately logged out on the next request.
//
// Intentionally NOT done here (all tracked as a TODO below):
//   - Deleting orders / projects / quote requests / cart history. The
//     sales team needs an audit trail for at least 90 days after a
//     contract event. A separate cron job (not yet built) will purge
//     the soft-deleted users + their child rows after the retention
//     window elapses.
//
// The endpoint is tightly rate-limited (see accountDeletionRateLimit)
// so an attacker who somehow obtained a valid cookie can't use this
// to nuke an account quickly, and so honest mistakes (double-click)
// hit a limit instead of both going through.
// ─────────────────────────────────────────────────────────

const me = new Hono<{ Bindings: Env; Variables: Variables }>();

// DELETE /api/me/account — soft-delete the authenticated user.
me.delete(
  "/me/account",
  authMiddleware,
  accountDeletionRateLimit,
  async (c) => {
    const session = c.get("user");
    const userId = session.claims.sub;

    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    try {
      // Sanity-check the user actually exists before mutating.
      const existing = await storage.getUser(userId);
      if (!existing) {
        return c.json({ message: "Account not found" }, 404);
      }

      // Mint a per-user deletion marker. We keep it inside the email so
      // the unique constraint on users.email continues to hold even if
      // multiple users delete their accounts. The local-part includes a
      // short UUID chunk to guarantee uniqueness; the domain
      // `asafe-engage.local` is reserved and never receives mail.
      const marker = crypto.randomUUID();
      const anonymisedEmail = `deleted-${marker}@asafe-engage.local`;

      // Soft-delete on the users row. We rely on SQL directly for
      // `is_active` because that column may not be part of the Drizzle
      // schema yet — the column is added idempotently by the same
      // ALTER TABLE IF NOT EXISTS path used by /api/admin/fix-schema.
      const { neon } = await import("@neondatabase/serverless");
      const sql = neon(c.env.DATABASE_URL);

      // Ensure the is_active column exists before writing to it. This
      // keeps the route self-healing on fresh environments where the
      // admin/fix-schema migration hasn't been run yet.
      await sql`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true
      `;

      // Anonymise + deactivate in a single UPDATE so nothing lingers
      // half-updated on error.
      await sql`
        UPDATE users
        SET
          email = ${anonymisedEmail},
          first_name = NULL,
          last_name = NULL,
          phone = NULL,
          job_title = NULL,
          profile_image_url = NULL,
          password_hash = NULL,
          password_reset_token = NULL,
          password_reset_expiry = NULL,
          oauth_provider = NULL,
          oauth_id = NULL,
          is_active = false,
          updated_at = now()
        WHERE id = ${userId}
      `;

      // Destroy the KV session entry + drop the cookie. Not using
      // destroySession() because it only clears the caller's sid —
      // here we explicitly want the same behaviour, but we also log
      // the outcome for the audit trail.
      const sid = getCookie(c, "sid");
      if (sid) {
        try {
          await c.env.KV_SESSIONS.delete(`session:${sid}`);
        } catch {
          // Non-fatal: the cookie delete below still logs the user out
          // on the client.
        }
      }
      deleteCookie(c, "sid", { path: "/" });

      // Fire-and-forget activity log — append an explicit deletion
      // record so admin audits can trace the event back even though
      // the PII is gone from the users row.
      try {
        c.executionCtx.waitUntil(
          storage.logUserActivity({
            userId,
            activityType: "account_deleted",
            section: "me",
            details: { anonymisedEmail },
            ipAddress:
              c.req.header("cf-connecting-ip") ||
              c.req.header("x-forwarded-for") ||
              undefined,
            userAgent: c.req.header("user-agent") || undefined,
          })
        );
      } catch {
        // Non-fatal.
      }

      // TODO(security/ops): schedule a 90-day purge job.
      // When that cron is built it should:
      //   - find users with is_active = false AND updated_at older than 90 days
      //   - cascade-delete or anonymise dependent rows (orders_* audit log
      //     actor fields, project_collaborators, cart_items already tied to
      //     userId, etc.) following the retention policy in SECURITY.md.
      // Until then we keep the anonymised user row so downstream foreign
      // keys (orders.userId, etc.) stay intact.

      return c.json({
        success: true,
        message:
          "Account anonymised. You have been signed out. Associated orders and project data are retained for audit and will be purged after 90 days.",
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Account deletion failed:", err);
      return c.json(
        { message: "Failed to delete account. Please try again later." },
        500
      );
    }
  }
);

export default me;
