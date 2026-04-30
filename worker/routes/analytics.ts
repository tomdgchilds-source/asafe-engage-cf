import { Hono } from "hono";
import { z } from "zod";
import { sql } from "drizzle-orm";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";
import { sendEmail } from "../services/email";

const analytics = new Hono<{ Bindings: Env; Variables: Variables }>();

// ──────────────────────────────────────────────
// Dashboard cache — keyed per-rep + window. 5-minute TTL keeps the
// heavy SQL aggregates out of the hot path on a tab-switch / refresh.
// In-isolate Map; cold-starts repopulate. We never cache cross-rep
// data under one key, so admin-vs-rep view drift is impossible.
// ──────────────────────────────────────────────
const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;
const dashboardCache = new Map<string, { at: number; payload: unknown }>();

function cacheGet(key: string): unknown | null {
  const hit = dashboardCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > DASHBOARD_CACHE_TTL_MS) {
    dashboardCache.delete(key);
    return null;
  }
  return hit.payload;
}

function cacheSet(key: string, payload: unknown): void {
  dashboardCache.set(key, { at: Date.now(), payload });
  // Cap cache to ~50 entries to avoid runaway memory in long-lived isolates.
  if (dashboardCache.size > 50) {
    let oldestKey: string | undefined;
    let oldestAt = Infinity;
    dashboardCache.forEach((v, k) => {
      if (v.at < oldestAt) {
        oldestAt = v.at;
        oldestKey = k;
      }
    });
    if (oldestKey) dashboardCache.delete(oldestKey);
  }
}

// Parse a window query: ?from=ISO&to=ISO. Defaults to last 30 days.
function parseWindow(c: any): { from: Date; to: Date; days: number } {
  const toRaw = c.req.query("to");
  const fromRaw = c.req.query("from");
  const to = toRaw ? new Date(toRaw) : new Date();
  const from = fromRaw
    ? new Date(fromRaw)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const days = Math.max(
    1,
    Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)),
  );
  return { from, to, days };
}

// POST /api/contact
analytics.post("/contact", async (c) => {
  try {
    const contactSchema = z.object({
      name: z.string().min(1, "Name is required"),
      email: z.string().email("Valid email is required"),
      company: z.string().optional(),
      subject: z.string().min(1, "Subject is required"),
      message: z.string().min(1, "Message is required"),
    });

    const body = await c.req.json();
    const data = contactSchema.parse(body);

    // Team notification email
    const teamHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #FFC72C; padding: 20px; text-align: center;">
          <h1 style="color: #000; margin: 0;">New Contact Form Submission</h1>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p><strong>Name:</strong> ${data.name}</p>
          <p><strong>Email:</strong> ${data.email}</p>
          <p><strong>Company:</strong> ${data.company || "Not specified"}</p>
          <p><strong>Subject:</strong> ${data.subject}</p>
          <p><strong>Message:</strong></p>
          <div style="background: white; padding: 15px; border-radius: 5px;">${data.message}</div>
        </div>
      </div>
    `;

    // Confirmation email to the person who submitted the form
    const confirmationHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #FFC72C; padding: 20px; text-align: center;">
          <h1 style="color: #000; margin: 0;">We Received Your Message</h1>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p>Hi ${data.name},</p>
          <p>Thank you for contacting A-SAFE. We have received your message regarding <strong>${data.subject}</strong> and our team will get back to you shortly.</p>
          <p>If you need immediate assistance, please don't hesitate to call your nearest A-SAFE office.</p>
          <br />
          <p>Best regards,<br />The A-SAFE Team</p>
        </div>
        <div style="padding: 16px; text-align: center; color: #888; font-size: 12px;">
          <p>A-SAFE - Pioneering Workplace Safety</p>
        </div>
      </div>
    `;

    // Send emails in the background so they don't block the response
    c.executionCtx.waitUntil(
      (async () => {
        try {
          await Promise.all([
            sendEmail(
              c.env,
              c.env.CONTACT_EMAIL || c.env.EMAIL_FROM,
              `Contact Form: ${data.subject}`,
              teamHtml,
            ),
            sendEmail(
              c.env,
              data.email,
              "We received your message - A-SAFE ENGAGE",
              confirmationHtml,
            ),
          ]);
        } catch (emailError) {
          console.error("Failed to send contact form emails:", emailError);
        }
      })(),
    );

    return c.json({ message: "Message sent successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ message: error.errors[0].message }, 400);
    }
    console.error("Failed to send contact form:", error);
    return c.json({ message: "Failed to send message. Please try again." }, 500);
  }
});

// POST /api/activity/record
analytics.post("/activity/record", authMiddleware, async (c) => {
  try {
    const userId = c.get("user").claims.sub;
    const { itemType, itemId, itemTitle, itemCategory, itemSubcategory, itemImage, metadata } =
      await c.req.json();

    if (!itemType || !itemId || !itemTitle) {
      return c.json(
        { message: "Missing required fields: itemType, itemId, and itemTitle are required" },
        400
      );
    }

    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const activity = await storage.recordUserActivity({
      userId,
      itemType,
      itemId,
      itemTitle,
      itemCategory,
      itemSubcategory,
      itemImage,
      metadata,
      viewCount: 1,
    });

    return c.json(activity);
  } catch (error) {
    console.error("Error recording user activity:", error);
    return c.json({ message: "Failed to record activity" }, 500);
  }
});

// GET /api/activity/recent
analytics.get("/activity/recent", authMiddleware, async (c) => {
  try {
    const userId = c.get("user").claims.sub;
    const limit = parseInt(c.req.query("limit") || "50");
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const activities = await storage.getUserRecentActivity(userId, limit);
    return c.json(activities);
  } catch (error) {
    console.error("Error fetching recent activity:", error);
    return c.json({ message: "Failed to fetch recent activity" }, 500);
  }
});

// DELETE /api/activity/cleanup
analytics.delete("/activity/cleanup", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userRecord = await storage.getUser(c.get("user").claims.sub);
    if (userRecord?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }
    await storage.cleanupOldActivity();
    return c.json({ success: true, message: "Old activities cleaned up successfully" });
  } catch (error) {
    console.error("Error cleaning up old activities:", error);
    return c.json({ message: "Failed to cleanup old activities" }, 500);
  }
});

// GET /api/currency/rates
analytics.get("/currency/rates", async (c) => {
  try {
    // Simplified currency service — fetch from exchangerate-api or return fallback rates
    const fallbackRates: Record<string, number> = {
      AED: 1,
      SAR: 1.02,
      GBP: 0.22,
      USD: 0.27,
      EUR: 0.25,
    };

    try {
      const res = await fetch("https://api.exchangerate-api.com/v4/latest/AED");
      if (res.ok) {
        const data = (await res.json()) as { rates: Record<string, number> };
        return c.json({
          AED: 1,
          SAR: data.rates.SAR || fallbackRates.SAR,
          GBP: data.rates.GBP || fallbackRates.GBP,
          USD: data.rates.USD || fallbackRates.USD,
          EUR: data.rates.EUR || fallbackRates.EUR,
        });
      }
    } catch {
      // Fall through to fallback rates
    }

    return c.json(fallbackRates);
  } catch (error) {
    console.error("Error fetching currency rates:", error);
    return c.json({ message: "Failed to fetch currency rates" }, 500);
  }
});

// GET /api/reminders/settings - user reminder preferences (stub)
analytics.get("/reminders/settings", authMiddleware, async (c) => {
  return c.json({ enabled: false, frequency: "daily" });
});

// POST /api/reminders/settings - save user reminder preferences (stub)
analytics.post("/reminders/settings", authMiddleware, async (c) => {
  const body = await c.req.json();
  return c.json({ enabled: body.enabled || false, frequency: body.frequency || "daily" });
});

// GET /api/reminders/quotes - get quote reminders (stub)
analytics.get("/reminders/quotes", authMiddleware, async (c) => {
  return c.json([]);
});

// ──────────────────────────────────────────────
// GET /api/analytics/dashboard
//
// Single-pane sales analytics roll-up. Surfaces every signal we now
// collect (PAS 13 verdicts, project shares & approvals, install KPIs,
// top SKUs, customer locations, data completeness). Cached per-rep
// per-window for 5 min in-isolate to keep dashboard refreshes cheap.
//
// Auth: any authed user. Admins see org-wide; everyone else sees
// only their own data. `?repUserId=…` lets admins drill down to a
// specific rep — silently ignored for non-admins.
//
// Filters: ?from=ISO&to=ISO. Defaults to last 30 days.
// ──────────────────────────────────────────────
analytics.get("/analytics/dashboard", authMiddleware, async (c) => {
  try {
    const userId = c.get("user").claims.sub;
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userRecord = await storage.getUser(userId);
    const isAdmin = userRecord?.role === "admin";

    const { from, to, days } = parseWindow(c);
    const repFilter = c.req.query("repUserId");
    // Effective rep: admin can override via ?repUserId, otherwise
    // an admin sees org-wide (null), and a rep is locked to themselves.
    const scopeUserId = isAdmin ? repFilter || null : userId;
    const cacheKey = `dash:${scopeUserId ?? "ORG"}:${from.toISOString()}:${to.toISOString()}`;

    const cached = cacheGet(cacheKey);
    if (cached) {
      c.header("X-Analytics-Cache", "HIT");
      return c.json(cached);
    }

    // Drizzle's sql template gives us a typed Neon pg client. We use raw
    // SQL for the aggregates — Drizzle's query builder is more verbose
    // than necessary for GROUP BY / window-function work.
    //
    // Neon's HTTP driver returns a NeonHttpQueryResult; .rows is the
    // array we want. Cast to any[] for compactness — the SELECT shape
    // is enforced by the SQL itself, not the type system.
    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    const userClause = scopeUserId
      ? sql`AND o.user_id = ${scopeUserId}`
      : sql``;
    const projectUserClause = scopeUserId
      ? sql`AND p.user_id = ${scopeUserId}`
      : sql``;
    const cartUserClause = scopeUserId
      ? sql`AND ci.user_id = ${scopeUserId}`
      : sql``;

    const exec = async (q: any) => {
      const r = (await db.execute(q)) as any;
      return (r.rows ?? r) as any[];
    };

    // ─── KPI cards: orders this window (count + AED), active projects,
    //     compliance score (data completeness across products) ─────
    const [orderKpiRow] = await exec(sql`
      SELECT
        COUNT(*)::int AS order_count,
        COALESCE(SUM(o.total_amount::numeric), 0)::float AS aed_total,
        COUNT(*) FILTER (WHERE o.status IN ('fulfilled','installed','invoiced','paid'))::int AS won_count,
        COUNT(*) FILTER (WHERE o.pas_13_warnings IS NULL OR jsonb_array_length(o.pas_13_warnings) = 0)::int AS aligned_orders
      FROM orders o
      WHERE o.created_at >= ${fromIso}::timestamptz
        AND o.created_at <= ${toIso}::timestamptz
        ${userClause}
    `);

    const [projectKpiRow] = await exec(sql`
      SELECT
        COUNT(*)::int AS active_projects,
        COUNT(DISTINCT p.location)::int AS distinct_locations
      FROM projects p
      WHERE p.status = 'active'
        ${projectUserClause}
    `);

    // ─── PAS 13 verdict distribution: classify each order with PAS 13
    //     warnings JSONB. Empty/null → aligned, else not_aligned. The
    //     in-flight verdict-per-line precision lives at submit time;
    //     for the dashboard we use the persisted summary on orders.
    const [pasRow] = await exec(sql`
      SELECT
        COUNT(*) FILTER (WHERE o.pas_13_warnings IS NULL OR jsonb_array_length(o.pas_13_warnings) = 0)::int AS aligned,
        COUNT(*) FILTER (
          WHERE o.pas_13_warnings IS NOT NULL
          AND jsonb_array_length(o.pas_13_warnings) BETWEEN 1 AND 2
        )::int AS borderline,
        COUNT(*) FILTER (
          WHERE o.pas_13_warnings IS NOT NULL
          AND jsonb_array_length(o.pas_13_warnings) >= 3
        )::int AS not_aligned
      FROM orders o
      WHERE o.created_at >= ${fromIso}::timestamptz
        AND o.created_at <= ${toIso}::timestamptz
        ${userClause}
    `);

    // ─── Recommendation acceptance rate: union all `recommended_products`
    //     from solution_requests + site_survey_areas in the window, then
    //     intersect with cart_items.product_name to compute %.
    //     Defensive: tables may be sparse — empty result returns 0/0.
    const recRows = await exec(sql`
      WITH recs AS (
        SELECT DISTINCT
          sr.user_id,
          jsonb_array_elements(sr.recommended_products)->>'name' AS product_name,
          DATE_TRUNC('day', sr.created_at) AS day
        FROM solution_requests sr
        WHERE sr.created_at >= ${fromIso}::timestamptz
          AND sr.created_at <= ${toIso}::timestamptz
          ${scopeUserId ? sql`AND sr.user_id = ${scopeUserId}` : sql``}
          AND sr.recommended_products IS NOT NULL
        UNION ALL
        SELECT DISTINCT
          p.user_id,
          jsonb_array_elements(ssa.recommended_products)->>'productName' AS product_name,
          DATE_TRUNC('day', ssa.created_at) AS day
        FROM site_survey_areas ssa
        JOIN site_surveys ss ON ss.id = ssa.site_survey_id
        JOIN projects p ON p.user_id = ss.user_id
        WHERE ssa.created_at >= ${fromIso}::timestamptz
          AND ssa.created_at <= ${toIso}::timestamptz
          ${scopeUserId ? sql`AND ss.user_id = ${scopeUserId}` : sql``}
          AND ssa.recommended_products IS NOT NULL
      ),
      ordered AS (
        SELECT DISTINCT ci.user_id, ci.product_name, DATE_TRUNC('day', ci.created_at) AS day
        FROM cart_items ci
        JOIN orders o ON o.user_id = ci.user_id
        WHERE ci.created_at >= ${fromIso}::timestamptz
          AND ci.created_at <= ${toIso}::timestamptz
          ${cartUserClause}
      )
      SELECT
        TO_CHAR(r.day, 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS recs,
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM ordered o
            WHERE o.user_id = r.user_id
              AND o.product_name ILIKE r.product_name
          )
        )::int AS accepted
      FROM recs r
      WHERE r.product_name IS NOT NULL
      GROUP BY r.day
      ORDER BY r.day ASC
    `);

    // ─── Project approval funnel: shared (count of projects with
    //     share_token issued in window) → viewed (project_view_audit
    //     rows) → approved (project_approvals.decision='approved')
    //     → ordered (orders linked to those projects).
    const [funnelRow] = await exec(sql`
      WITH scoped_projects AS (
        SELECT p.id, p.user_id, p.share_token_created_at
        FROM projects p
        WHERE 1=1 ${projectUserClause}
      ),
      shared AS (
        SELECT id FROM scoped_projects
        WHERE share_token_created_at >= ${fromIso}::timestamptz
          AND share_token_created_at <= ${toIso}::timestamptz
      )
      SELECT
        (SELECT COUNT(*)::int FROM shared) AS shared,
        (SELECT COUNT(DISTINCT pva.project_id)::int
         FROM project_view_audit pva
         WHERE pva.project_id IN (SELECT id FROM scoped_projects)
           AND pva.viewed_at >= ${fromIso}::timestamptz
           AND pva.viewed_at <= ${toIso}::timestamptz) AS viewed,
        (SELECT COUNT(DISTINCT pa.project_id)::int
         FROM project_approvals pa
         WHERE pa.project_id IN (SELECT id FROM scoped_projects)
           AND pa.decision = 'approved'
           AND pa.created_at >= ${fromIso}::timestamptz
           AND pa.created_at <= ${toIso}::timestamptz) AS approved,
        (SELECT COUNT(DISTINCT i.project_id)::int
         FROM installations i
         WHERE i.project_id IN (SELECT id FROM scoped_projects)
           AND i.created_at >= ${fromIso}::timestamptz
           AND i.created_at <= ${toIso}::timestamptz) AS ordered
    `);

    // ─── Top products by AED (last window) ──────────────────────────
    const topProductsRows = await exec(sql`
      SELECT
        ci.product_name,
        COALESCE(SUM(ci.total_price::numeric), 0)::float AS aed_total,
        COALESCE(SUM(ci.quantity::numeric), 0)::float AS units,
        COUNT(*)::int AS line_count
      FROM cart_items ci
      WHERE ci.created_at >= ${fromIso}::timestamptz
        AND ci.created_at <= ${toIso}::timestamptz
        ${cartUserClause}
      GROUP BY ci.product_name
      ORDER BY aed_total DESC
      LIMIT 10
    `);

    // ─── Customer location bar chart (top 10 cities) ───────────────
    const locationRows = await exec(sql`
      SELECT
        COALESCE(NULLIF(p.location, ''), 'Unspecified') AS location,
        COUNT(*)::int AS project_count
      FROM projects p
      WHERE p.created_at >= ${fromIso}::timestamptz
        AND p.created_at <= ${toIso}::timestamptz
        ${projectUserClause}
      GROUP BY location
      ORDER BY project_count DESC
      LIMIT 10
    `);

    // ─── Install team on-time performance ──────────────────────────
    //     "On time" = actual_end <= planned_end (or still in-progress
    //     and planned_end is in the future). Computed across the
    //     joined assignments to bucket per-team.
    const installTeamRows = await exec(sql`
      SELECT
        it.id AS team_id,
        it.name AS team_name,
        COUNT(DISTINCT i.id)::int AS install_count,
        AVG(i.progress)::float AS avg_progress,
        COUNT(DISTINCT i.id) FILTER (
          WHERE i.actual_end IS NOT NULL
            AND i.planned_end IS NOT NULL
            AND i.actual_end <= i.planned_end
        )::int AS on_time_completed,
        COUNT(DISTINCT i.id) FILTER (
          WHERE i.actual_end IS NOT NULL
        )::int AS completed_count
      FROM install_teams it
      LEFT JOIN installation_assignments ia ON ia.team_id = it.id
      LEFT JOIN installations i ON i.id = ia.installation_id
        AND i.created_at >= ${fromIso}::timestamptz
        AND i.created_at <= ${toIso}::timestamptz
      GROUP BY it.id, it.name
      HAVING COUNT(DISTINCT i.id) > 0
      ORDER BY install_count DESC
      LIMIT 12
    `);

    // ─── Compliance / data completeness across product catalog ────
    //     "How well-equipped is the catalog?" — every dataset gates
    //     a UI block, so completeness = "ready to ship a quote".
    const [completenessRow] = await exec(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE suitability_data IS NOT NULL)::int AS with_suitability,
        COUNT(*) FILTER (WHERE maintenance_data IS NOT NULL)::int AS with_maintenance,
        COUNT(*) FILTER (WHERE ground_works_data IS NOT NULL)::int AS with_groundworks,
        COUNT(*) FILTER (WHERE impact_testing_data IS NOT NULL)::int AS with_impact_testing,
        COUNT(*) FILTER (WHERE impact_rating IS NOT NULL)::int AS with_impact_rating,
        COUNT(*) FILTER (WHERE pas_13_compliant = true)::int AS pas13_certified,
        COUNT(*) FILTER (WHERE image_url IS NOT NULL AND needs_image_review = false)::int AS with_clean_imagery
      FROM products
      WHERE is_active = true
    `);

    // ─── Order conversion timeline (per-day count + AED) ──────────
    const timelineRows = await exec(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('day', o.created_at), 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(o.total_amount::numeric), 0)::float AS aed_total
      FROM orders o
      WHERE o.created_at >= ${fromIso}::timestamptz
        AND o.created_at <= ${toIso}::timestamptz
        ${userClause}
      GROUP BY DATE_TRUNC('day', o.created_at)
      ORDER BY day ASC
    `);

    // ─── Most-shared / hottest projects (proxy for video / install
    //     content engagement, since we can't see plays server-side).
    //     We surface project view counts grouped per-project.
    const hotProjectsRows = await exec(sql`
      SELECT
        p.id,
        p.name,
        p.location,
        COUNT(pva.id)::int AS views,
        (SELECT COUNT(*)::int FROM project_approvals pa
         WHERE pa.project_id = p.id AND pa.decision = 'approved') AS approvals
      FROM projects p
      LEFT JOIN project_view_audit pva ON pva.project_id = p.id
        AND pva.viewed_at >= ${fromIso}::timestamptz
        AND pva.viewed_at <= ${toIso}::timestamptz
      WHERE 1=1 ${projectUserClause}
      GROUP BY p.id, p.name, p.location
      HAVING COUNT(pva.id) > 0
      ORDER BY views DESC
      LIMIT 8
    `);

    // ─── Roll up data completeness as an overall score ────────────
    const totalProducts = Number(completenessRow?.total ?? 0) || 1;
    const datasets = [
      {
        key: "suitability",
        label: "Suitability data",
        covered: Number(completenessRow?.with_suitability ?? 0),
      },
      {
        key: "maintenance",
        label: "Maintenance data",
        covered: Number(completenessRow?.with_maintenance ?? 0),
      },
      {
        key: "groundworks",
        label: "GroundWorks data",
        covered: Number(completenessRow?.with_groundworks ?? 0),
      },
      {
        key: "impactTesting",
        label: "Impact testing",
        covered: Number(completenessRow?.with_impact_testing ?? 0),
      },
      {
        key: "impactRating",
        label: "Impact rating",
        covered: Number(completenessRow?.with_impact_rating ?? 0),
      },
      {
        key: "pas13",
        label: "PAS 13 certified",
        covered: Number(completenessRow?.pas13_certified ?? 0),
      },
      {
        key: "imagery",
        label: "Clean imagery",
        covered: Number(completenessRow?.with_clean_imagery ?? 0),
      },
    ].map((d) => ({
      ...d,
      total: totalProducts,
      pct: Math.round((d.covered / totalProducts) * 100),
    }));
    const complianceScore = Math.round(
      datasets.reduce((acc, d) => acc + d.pct, 0) / datasets.length,
    );

    // ─── Recommendation acceptance time-series rollup ─────────────
    const recAcceptanceTimeline = recRows.map((r: any) => ({
      day: String(r.day),
      recs: Number(r.recs ?? 0),
      accepted: Number(r.accepted ?? 0),
      rate:
        Number(r.recs ?? 0) > 0
          ? Math.round((Number(r.accepted) / Number(r.recs)) * 100)
          : 0,
    }));
    const totalRecs = recAcceptanceTimeline.reduce((s, r) => s + r.recs, 0);
    const totalAccepted = recAcceptanceTimeline.reduce(
      (s, r) => s + r.accepted,
      0,
    );
    const recAcceptanceRate =
      totalRecs > 0 ? Math.round((totalAccepted / totalRecs) * 100) : 0;

    const payload = {
      window: {
        from: fromIso,
        to: toIso,
        days,
        scope: scopeUserId ? "rep" : "org",
        repUserId: scopeUserId,
        isAdmin,
      },
      kpis: {
        orderCount: Number(orderKpiRow?.order_count ?? 0),
        aedTotal: Number(orderKpiRow?.aed_total ?? 0),
        wonCount: Number(orderKpiRow?.won_count ?? 0),
        alignedOrderCount: Number(orderKpiRow?.aligned_orders ?? 0),
        activeProjects: Number(projectKpiRow?.active_projects ?? 0),
        distinctLocations: Number(projectKpiRow?.distinct_locations ?? 0),
        complianceScore,
        recAcceptanceRate,
      },
      pas13Verdicts: {
        aligned: Number(pasRow?.aligned ?? 0),
        borderline: Number(pasRow?.borderline ?? 0),
        notAligned: Number(pasRow?.not_aligned ?? 0),
      },
      recAcceptance: {
        totalRecs,
        totalAccepted,
        rate: recAcceptanceRate,
        timeline: recAcceptanceTimeline,
      },
      approvalFunnel: {
        shared: Number(funnelRow?.shared ?? 0),
        viewed: Number(funnelRow?.viewed ?? 0),
        approved: Number(funnelRow?.approved ?? 0),
        ordered: Number(funnelRow?.ordered ?? 0),
      },
      topProducts: topProductsRows.map((r: any) => ({
        productName: String(r.product_name ?? "Unknown"),
        aedTotal: Number(r.aed_total ?? 0),
        units: Number(r.units ?? 0),
        lineCount: Number(r.line_count ?? 0),
      })),
      locations: locationRows.map((r: any) => ({
        location: String(r.location ?? "Unspecified"),
        projectCount: Number(r.project_count ?? 0),
      })),
      installTeams: installTeamRows.map((r: any) => {
        const completed = Number(r.completed_count ?? 0);
        const onTime = Number(r.on_time_completed ?? 0);
        return {
          teamId: String(r.team_id),
          teamName: String(r.team_name ?? "Unnamed"),
          installCount: Number(r.install_count ?? 0),
          avgProgress: Math.round(Number(r.avg_progress ?? 0)),
          onTimeCount: onTime,
          completedCount: completed,
          onTimePct: completed > 0 ? Math.round((onTime / completed) * 100) : 0,
        };
      }),
      compliance: {
        totalProducts: Number(completenessRow?.total ?? 0),
        datasets,
        score: complianceScore,
      },
      orderTimeline: timelineRows.map((r: any) => ({
        day: String(r.day),
        orderCount: Number(r.order_count ?? 0),
        aedTotal: Number(r.aed_total ?? 0),
      })),
      hotProjects: hotProjectsRows.map((r: any) => ({
        id: String(r.id),
        name: String(r.name ?? "Untitled"),
        location: String(r.location ?? ""),
        views: Number(r.views ?? 0),
        approvals: Number(r.approvals ?? 0),
      })),
    };

    cacheSet(cacheKey, payload);
    c.header("X-Analytics-Cache", "MISS");
    return c.json(payload);
  } catch (error) {
    console.error("Error building analytics dashboard:", error);
    return c.json({ message: "Failed to build analytics dashboard" }, 500);
  }
});

export default analytics;
