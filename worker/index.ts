import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Variables } from "./types";
import { authMiddleware } from "./middleware/auth";
import { securityHeaders } from "./middleware/securityHeaders";
import { requestContext } from "./middleware/requestContext";
import { getDb } from "./db";
import { createStorage } from "./storage";
import { runBackups } from "./scheduled/backupExporter";

// Route imports
import auth from "./routes/auth";
import users from "./routes/users";
import products from "./routes/products";
import orders from "./routes/orders";
import cart from "./routes/cart";
import quotes from "./routes/quotes";
import calculations from "./routes/calculations";
import pricing from "./routes/pricing";
import partnerCodes from "./routes/partnerCodes";
import projectsRouter from "./routes/projects";
import caseStudies from "./routes/caseStudies";
import resources from "./routes/resources";
import faqs from "./routes/faqs";
import layoutDrawings from "./routes/layoutDrawings";
import siteSurveys from "./routes/siteSurveys";
import chat from "./routes/chat";
import notifications from "./routes/notifications";
import companyLogo from "./routes/companyLogo";
import globalOffices from "./routes/globalOffices";
import solutionRequests from "./routes/solutionRequests";
import files from "./routes/files";
import safety from "./routes/safety";
import admin from "./routes/admin";
import analytics from "./routes/analytics";
import adminPricelist from "./routes/adminPricelist";
import collaborators from "./routes/collaborators";
import barrierLadders from "./routes/barrierLadders";
import me from "./routes/me";
import search from "./routes/search";
import installations from "./routes/installations";
import installTeams from "./routes/installTeams";
import basePlates from "./routes/basePlates";
import pas13Chat from "./routes/pas13Chat";
import installVideos from "./routes/installVideos";
import recommendBarriers from "./routes/recommendBarriers";
import quote from "./routes/quote";
import communication from "./routes/communication";
import orderForm from "./routes/orderForm";
import { scanOverdueInstallations } from "./scheduled/installationScanner";
import { scanCommSuggestions } from "./scheduled/commSuggestionsScanner";
import migrations from "./routes/migrations";
import surveyPhotos from "./routes/surveyPhotos";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Request-scoped context + logger. Mounted FIRST so every request —
// including ones that get rejected downstream by CORS/auth/limiters —
// is tagged with X-Request-Id and shows up in logs with timing + status.
app.use("*", requestContext);

// Security headers on EVERY response — including the SPA shell served
// via the ASSETS fallback. Mounted right after requestContext so it
// wraps all routes below.
app.use("*", securityHeaders);

// CORS for API routes — restricted to the deployed origin + localhost
// dev. `origin` callback returning `""` blocks cross-origin, while
// returning the origin echoes it back for allowed callers.
const ALLOWED_ORIGINS = new Set([
  "https://asafe-engage.tom-d-g-childs.workers.dev",
  "http://localhost:8787",
  "http://localhost:5173",
]);

app.use("/api/*", cors({
  origin: (origin) => {
    // Same-origin / server-to-server requests have no Origin header.
    if (!origin) return origin as any;
    return ALLOWED_ORIGINS.has(origin) ? origin : "";
  },
  credentials: true,
  allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  maxAge: 86400,
}));

// Global error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ message: "Internal server error" }, 500);
});

// Mount all route groups under /api
app.route("/api", auth);
app.route("/api", users);
app.route("/api", products);
app.route("/api", orders);
app.route("/api", cart);
app.route("/api", quotes);
app.route("/api", calculations);
app.route("/api", pricing);
app.route("/api", partnerCodes);
app.route("/api", projectsRouter);
app.route("/api", caseStudies);
app.route("/api", resources);
app.route("/api", faqs);
app.route("/api", layoutDrawings);
app.route("/api", siteSurveys);
app.route("/api", chat);
app.route("/api", notifications);
app.route("/api", companyLogo);
app.route("/api", globalOffices);
app.route("/api", solutionRequests);
app.route("/api", files);
app.route("/api", safety);
app.route("/api", admin);
app.route("/api", analytics);
app.route("/api", adminPricelist);
app.route("/api", collaborators);
app.route("/api", barrierLadders);
app.route("/api", me);
app.route("/api", search);
app.route("/api", installations);
app.route("/api", installTeams);
app.route("/api", basePlates);
app.route("/api", pas13Chat);
app.route("/api", installVideos);
app.route("/api", recommendBarriers);
app.route("/api", quote);
app.route("/api", communication);
app.route("/api", orderForm);
app.route("/api", migrations);
app.route("/api", surveyPhotos);

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Public runtime config — exposes the Turnstile site key (and any other
// public-safe values) to the SPA. No auth, cached 60s at the edge so the
// SPA fetch-on-boot is effectively free. The secret key is never served.
app.get("/api/config", (c) => {
  // Lazy boot-log of Turnstile key status — emits once per isolate the
  // first time /api/config (or any verify) is hit.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (!g.__turnstileBootLogged) {
    g.__turnstileBootLogged = true;
    if (!c.env.TURNSTILE_SITE_KEY) {
      console.warn("[turnstile] site key missing; client widget disabled");
    }
    if (!c.env.TURNSTILE_SECRET_KEY) {
      console.warn("[turnstile] secret missing; verification skipped");
    }
  }
  c.header("Cache-Control", "public, max-age=60");
  return c.json({
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY ?? null,
  });
});

// Helper: verify the caller is an admin user
async function requireAdmin(c: any): Promise<boolean> {
  const session = c.get("user");
  if (!session) return false;
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const user = await storage.getUser(session.claims.sub);
  return user?.role === "admin";
}

// OAuth diagnostics — admin only
app.get("/api/auth/oauth-debug", authMiddleware, async (c) => {
  if (!(await requireAdmin(c))) return c.json({ message: "Admin access required" }, 403);
  const checks: Record<string, any> = {};

  // 1. Check env vars
  // Secret-presence-only — never leak prefixes of credentials, even to
  // admin users. Length exposure on secrets is also avoided.
  checks.GOOGLE_CLIENT_ID = c.env.GOOGLE_CLIENT_ID ? "set" : "MISSING";
  checks.GOOGLE_CLIENT_SECRET = c.env.GOOGLE_CLIENT_SECRET ? "set" : "MISSING";
  checks.APP_URL = c.env.APP_URL ? `"${c.env.APP_URL}"` : "MISSING";
  checks.APP_URL_trimmed = (c.env.APP_URL || "").trim();
  checks.APP_URL_has_whitespace = c.env.APP_URL !== (c.env.APP_URL || "").trim();
  checks.DATABASE_URL = c.env.DATABASE_URL ? "set" : "MISSING";

  // 2. Check KV binding
  try {
    const testKey = `oauth_debug_test_${Date.now()}`;
    await c.env.KV_SESSIONS.put(testKey, "test", { expirationTtl: 10 });
    const val = await c.env.KV_SESSIONS.get(testKey);
    checks.KV_SESSIONS = val === "test" ? "working" : `read back: ${val}`;
    await c.env.KV_SESSIONS.delete(testKey);
  } catch (e: any) {
    checks.KV_SESSIONS = `ERROR: ${e.message}`;
  }

  // 3. Check DB + OAuth columns
  try {
    const { getDb } = await import("./db");
    const { createStorage } = await import("./storage");
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    // Test a simple query on oauth columns
    const result = await storage.getUserByOAuth("google", "test_nonexistent_id");
    checks.DB_oauth_query = `success (returned ${result ? "user" : "null"})`;
  } catch (e: any) {
    checks.DB_oauth_query = `ERROR: ${e.message}`;
  }

  // 4. Computed redirect URI
  const envUrl = (c.env.APP_URL || "").trim();
  const baseUrl = envUrl || `${new URL(c.req.url).protocol}//${new URL(c.req.url).host}`;
  checks.computed_redirect_uri = `${baseUrl}/api/auth/google/callback`;

  return c.json(checks, 200);
});


// Certificate PDFs: public read-only download of the R2-hosted A-SAFE PAS 13 /
// EN test certificates. Files were pre-uploaded with `wrangler r2 object put`
// under the `certificates/` prefix. This route is intentionally auth-free
// (the /api/objects/* equivalent is gated by authMiddleware, which would block
// anonymous customers browsing /resources from downloading them).
app.get("/api/certificates/:file", async (c) => {
  const file = c.req.param("file");
  // Guard: only allow kebab-case + .pdf (prevents traversal and keeps the
  // surface tight — the manifest slugs are all of the form cert-<product>.pdf).
  if (!/^[a-z0-9][a-z0-9-]*\.pdf$/i.test(file)) {
    return c.json({ message: "Invalid certificate filename" }, 400);
  }
  const bucket = c.env.R2_BUCKET;
  if (!bucket) {
    return c.json({ message: "R2 bucket not configured" }, 500);
  }
  const obj = await bucket.get(`certificates/${file}`);
  if (!obj) {
    return c.json({ message: "Certificate not found" }, 404);
  }
  const headers = new Headers();
  headers.set(
    "Content-Type",
    obj.httpMetadata?.contentType || "application/pdf",
  );
  headers.set("Cache-Control", "public, max-age=86400");
  // Inline so modern browsers render the PDF in-place (matches the Resources
  // UI pattern of window.open in a new tab). `filename*` gives a nicer
  // download name if the user hits Save.
  headers.set(
    "Content-Disposition",
    `inline; filename="${file}"`,
  );
  return new Response(obj.body as any, { headers });
});

// Geo-location endpoint — uses Cloudflare's built-in cf object
app.get("/api/geo", (c) => {
  const cf = (c.req.raw as any).cf;
  return c.json({
    country: cf?.country || null,
    city: cf?.city || null,
    region: cf?.region || null,
    continent: cf?.continent || null,
  });
});

// ─── Public R2 PDF proxies ───────────────────────────────────────────
// Each of these streams a PDF from a fixed R2 prefix without auth so the
// Resources page works for anonymous visitors. The filename regex keeps
// the surface tight (kebab-case + .pdf) and prevents traversal.

// Master Product Impact Testing PDF at testing/<file>.pdf.
app.get("/api/testing/:file", async (c) => {
  const file = c.req.param("file");
  if (!/^[a-z0-9][a-z0-9-]*\.pdf$/i.test(file)) {
    return c.json({ message: "Invalid testing filename" }, 400);
  }
  const bucket = c.env.R2_BUCKET;
  if (!bucket) {
    return c.json({ message: "R2 bucket not configured" }, 500);
  }
  const obj = await bucket.get(`testing/${file}`);
  if (!obj) {
    return c.json({ message: "Testing PDF not found" }, 404);
  }
  const headers = new Headers();
  headers.set(
    "Content-Type",
    obj.httpMetadata?.contentType || "application/pdf",
  );
  headers.set("Cache-Control", "public, max-age=86400");
  headers.set("Content-Disposition", `inline; filename="${file}"`);
  return new Response(obj.body as any, { headers });
});

// Serve the Product Maintenance PDF from R2 at maintenance/<file>.pdf.
// Public read-only; mirrors /api/certificates/:file so the Resources page
// link works without authentication.
app.get("/api/maintenance/:file", async (c) => {
  const file = c.req.param("file");
  if (!/^[a-z0-9][a-z0-9-]*\.pdf$/i.test(file)) {
    return c.json({ message: "Invalid maintenance filename" }, 400);
  }
  const bucket = c.env.R2_BUCKET;
  if (!bucket) {
    return c.json({ message: "R2 bucket not configured" }, 500);
  }
  const obj = await bucket.get(`maintenance/${file}`);
  if (!obj) {
    return c.json({ message: "Maintenance document not found" }, 404);
  }
  const headers = new Headers();
  headers.set(
    "Content-Type",
    obj.httpMetadata?.contentType || "application/pdf",
  );
  headers.set("Cache-Control", "public, max-age=86400");
  headers.set("Content-Disposition", `inline; filename="${file}"`);
  return new Response(obj.body as any, { headers });
});

// Static-PDF read route for hardware manifests (currently the Available
// Base Plates PDF). Mirrors /api/certificates/:file — auth-free so
// anonymous /resources visitors can open it.
app.get("/api/hardware/:file", async (c) => {
  const file = c.req.param("file");
  if (!/^[a-z0-9][a-z0-9-]*\.pdf$/i.test(file)) {
    return c.json({ message: "Invalid hardware filename" }, 400);
  }
  const bucket = c.env.R2_BUCKET;
  if (!bucket) {
    return c.json({ message: "R2 bucket not configured" }, 500);
  }
  const obj = await bucket.get(`hardware/${file}`);
  if (!obj) {
    return c.json({ message: "Hardware PDF not found" }, 404);
  }
  const headers = new Headers();
  headers.set(
    "Content-Type",
    obj.httpMetadata?.contentType || "application/pdf",
  );
  headers.set("Cache-Control", "public, max-age=86400");
  headers.set("Content-Disposition", `inline; filename="${file}"`);
  return new Response(obj.body as any, { headers });
});

// Public-read passthrough for the GroundWorks PDF in R2. Mirrors the
// /api/certificates/:file pattern — no auth so anonymous Resources
// visitors can stream it.
app.get("/api/groundworks/:file", async (c) => {
  const file = c.req.param("file");
  if (!/^[a-z0-9][a-z0-9-]*\.pdf$/i.test(file)) {
    return c.json({ message: "Invalid groundworks filename" }, 400);
  }
  const bucket = c.env.R2_BUCKET;
  if (!bucket) {
    return c.json({ message: "R2 bucket not configured" }, 500);
  }
  const obj = await bucket.get(`groundworks/${file}`);
  if (!obj) {
    return c.json({ message: "Groundworks document not found" }, 404);
  }
  const headers = new Headers();
  headers.set(
    "Content-Type",
    obj.httpMetadata?.contentType || "application/pdf",
  );
  headers.set("Cache-Control", "public, max-age=86400");
  headers.set("Content-Disposition", `inline; filename="${file}"`);
  return new Response(obj.body as any, { headers });
});

// ─── PAS 13:2017 (Level-1) ────────────────────────────────────────────────
// Structural ingestion + authoritative Resource upload. L2 (deterministic
// rule engine) and L3 (RAG chat + video playlist) build on top of this.
// The PDF was pre-uploaded to R2 at `standards/pas-13-2017.pdf` via
// `wrangler r2 object put`. Structure metadata (TOC, definitions, annexes)
// lives at scripts/data/pas13-structure.json and is consumed by
// shared/pas13Citations.ts for in-app citation chips.
//
// Public-read passthrough for the PDF. Mirrors /api/certificates/:file —
// auth-free so anonymous Resources visitors can stream it.
app.get("/api/standards/:file", async (c) => {
  const file = c.req.param("file");
  // Guard: only allow kebab-case + .pdf (prevents traversal). Matches the
  // certificates-route regex for consistency.
  if (!/^[a-z0-9][a-z0-9-]*\.pdf$/i.test(file)) {
    return c.json({ message: "Invalid standard filename" }, 400);
  }
  const bucket = c.env.R2_BUCKET;
  if (!bucket) {
    return c.json({ message: "R2 bucket not configured" }, 500);
  }
  const obj = await bucket.get(`standards/${file}`);
  if (!obj) {
    return c.json({ message: "Standard not found" }, 404);
  }
  const headers = new Headers();
  headers.set(
    "Content-Type",
    obj.httpMetadata?.contentType || "application/pdf",
  );
  headers.set("Cache-Control", "public, max-age=86400");
  headers.set("Content-Disposition", `inline; filename="${file}"`);
  return new Response(obj.body as any, { headers });
});

// ─── PAS 13 Vehicle-Class Thresholds (admin) ──────────────────────────────
// The pas13_vehicle_classes table is created by migration
// 2026-04-30-018-pas13-vehicle-classes (apply from /admin/migrations).

// GET /api/admin/pas13-vehicle-classes
// Returns the current rows in lightest → heaviest order. Gated via the
// session-based requireAdmin pattern (NOT MIGRATION_TOKEN — this is an
// ongoing UI surface).
app.get("/api/admin/pas13-vehicle-classes", authMiddleware, async (c) => {
  if (!(await requireAdmin(c)))
    return c.json({ message: "Admin access required" }, 403);
  if (!c.env.DATABASE_URL) {
    return c.json({ message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    // Defensive: if the table doesn't exist yet (migration not run), fall
    // back to the seed defaults so the admin UI doesn't 500.
    const tableExists = (await sqlClient`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'pas13_vehicle_classes'
      ) AS exists
    `) as Array<{ exists: boolean }>;
    if (!tableExists[0]?.exists) {
      return c.json({
        rows: [],
        bootstrapNeeded: true,
        message:
          "pas13_vehicle_classes table not yet created — apply pending migrations at /admin/migrations first.",
      });
    }

    const rows = (await sqlClient`
      SELECT id, class_code, mass_min_kg, mass_max_kg,
             speed_min_kmh, speed_max_kmh, description,
             updated_at, updated_by
      FROM pas13_vehicle_classes
      ORDER BY mass_min_kg ASC, class_code ASC
    `) as Array<{
      id: string;
      class_code: string;
      mass_min_kg: number;
      mass_max_kg: number | null;
      speed_min_kmh: number;
      speed_max_kmh: number | null;
      description: string;
      updated_at: string | null;
      updated_by: string | null;
    }>;

    return c.json({
      rows: rows.map((r) => ({
        id: r.id,
        classCode: r.class_code,
        massMinKg: r.mass_min_kg,
        massMaxKg: r.mass_max_kg,
        speedMinKmh: r.speed_min_kmh,
        speedMaxKmh: r.speed_max_kmh,
        description: r.description,
        updatedAt: r.updated_at,
        updatedBy: r.updated_by,
      })),
    });
  } catch (e: any) {
    console.error("pas13-vehicle-classes GET failed:", e);
    return c.json({ message: e?.message || String(e) }, 500);
  }
});

// POST /api/admin/pas13-vehicle-classes
// Bulk upsert. Body: { rows: [{ classCode, massMinKg, massMaxKg | null,
//   speedMinKmh, speedMaxKmh | null, description }] }. Each row is upserted
// by classCode; existing rows missing from the payload are NOT deleted —
// callers wanting to drop a class should leave it but set its bounds to
// some sentinel (or extend this endpoint with a soft-delete column later).
//
// Cache invalidation: we wipe the per-isolate KV cache key so the next
// request to anything that needs the active classification table refetches
// the freshly-edited rows.
app.post("/api/admin/pas13-vehicle-classes", authMiddleware, async (c) => {
  if (!(await requireAdmin(c)))
    return c.json({ message: "Admin access required" }, 403);
  if (!c.env.DATABASE_URL) {
    return c.json({ message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const session = c.get("user") as any;
    const actorEmail =
      (session?.claims?.email as string | undefined) ||
      (session?.claims?.sub as string | undefined) ||
      null;
    const body = await c.req.json().catch(() => ({}));
    const rows: Array<{
      classCode?: string;
      massMinKg?: number;
      massMaxKg?: number | null;
      speedMinKmh?: number;
      speedMaxKmh?: number | null;
      description?: string;
    }> = Array.isArray(body?.rows) ? body.rows : [];

    if (rows.length === 0) {
      return c.json({ message: "rows[] required" }, 400);
    }

    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    const accepted: string[] = [];
    const rejected: Array<{ classCode: string | undefined; reason: string }> =
      [];

    for (const r of rows) {
      const code = (r.classCode || "").trim();
      if (!code) {
        rejected.push({ classCode: r.classCode, reason: "classCode required" });
        continue;
      }
      const massMin = Number(r.massMinKg);
      const speedMin = Number(r.speedMinKmh);
      const massMax =
        r.massMaxKg === null || r.massMaxKg === undefined
          ? null
          : Number(r.massMaxKg);
      const speedMax =
        r.speedMaxKmh === null || r.speedMaxKmh === undefined
          ? null
          : Number(r.speedMaxKmh);
      if (!Number.isFinite(massMin) || massMin < 0) {
        rejected.push({ classCode: code, reason: "massMinKg must be ≥ 0" });
        continue;
      }
      if (massMax !== null && (!Number.isFinite(massMax) || massMax <= massMin)) {
        rejected.push({
          classCode: code,
          reason: "massMaxKg must be > massMinKg (or null for open-ended)",
        });
        continue;
      }
      if (!Number.isFinite(speedMin) || speedMin < 0) {
        rejected.push({ classCode: code, reason: "speedMinKmh must be ≥ 0" });
        continue;
      }
      if (
        speedMax !== null &&
        (!Number.isFinite(speedMax) || speedMax <= speedMin)
      ) {
        rejected.push({
          classCode: code,
          reason: "speedMaxKmh must be > speedMinKmh (or null for open-ended)",
        });
        continue;
      }
      const description = (r.description || "").toString();
      await sqlClient`
        INSERT INTO pas13_vehicle_classes (
          class_code, mass_min_kg, mass_max_kg,
          speed_min_kmh, speed_max_kmh, description,
          updated_at, updated_by
        )
        VALUES (
          ${code}, ${massMin}, ${massMax},
          ${speedMin}, ${speedMax}, ${description},
          now(), ${actorEmail}
        )
        ON CONFLICT (class_code) DO UPDATE SET
          mass_min_kg = EXCLUDED.mass_min_kg,
          mass_max_kg = EXCLUDED.mass_max_kg,
          speed_min_kmh = EXCLUDED.speed_min_kmh,
          speed_max_kmh = EXCLUDED.speed_max_kmh,
          description = EXCLUDED.description,
          updated_at = now(),
          updated_by = EXCLUDED.updated_by
      `;
      accepted.push(code);
    }

    // Cache invalidation: bump the in-isolate epoch so the next call to
    // any classifyVehicle()-using endpoint will re-pull. KV invalidation
    // is a best-effort cross-isolate signal — siblings pick it up on
    // their first read by comparing their cached version stamp.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = globalThis as any;
      g.__pas13ClassesEpoch = Date.now();
      if (c.env.KV_SESSIONS) {
        await c.env.KV_SESSIONS.put(
          "pas13:classes:epoch",
          String(g.__pas13ClassesEpoch),
          { expirationTtl: 60 * 60 * 24 * 7 },
        );
      }
    } catch (e) {
      console.warn("pas13 cache-bust soft-failed:", (e as any)?.message);
    }

    return c.json({ ok: true, accepted, rejected });
  } catch (e: any) {
    console.error("pas13-vehicle-classes POST failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Admin usage report — one row per user with the engagement signals
// we care about: orders, calculations, quote requests, quote drafts,
// solution requests, site surveys, layout drawings, projects, login
// count, last login, last activity. Aggregates done in SQL so the
// admin dashboard can render 200 users in one query without N+1.
app.get("/api/admin/users/usage-report", authMiddleware, async (c) => {
  if (!(await requireAdmin(c))) {
    return c.json({ message: "Admin access required" }, 403);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);
    // LEFT JOIN aggregates so a user with zero of any artifact still
    // shows up with zeros (rather than disappearing). Each subquery is
    // a simple COUNT keyed on user_id, so the query plan stays cheap.
    const rows = await sqlClient`
      SELECT
        u.id,
        u.email,
        u.first_name AS "firstName",
        u.last_name AS "lastName",
        u.company,
        u.role,
        u.job_role AS "jobRole",
        u.email_verified AS "emailVerified",
        u.created_at AS "createdAt",
        u.last_login_at AS "lastLoginAt",
        COALESCE(u.login_count, 0) AS "loginCount",
        COALESCE(orders_c.n, 0) AS "ordersCount",
        COALESCE(calcs_c.n, 0) AS "calculationsCount",
        COALESCE(qr_c.n, 0) AS "quoteRequestsCount",
        COALESCE(qd_c.n, 0) AS "quoteDraftsCount",
        COALESCE(sr_c.n, 0) AS "solutionRequestsCount",
        COALESCE(ss_c.n, 0) AS "siteSurveysCount",
        COALESCE(ld_c.n, 0) AS "layoutDrawingsCount",
        COALESCE(p_c.n, 0)  AS "projectsCount",
        COALESCE(act_c.n, 0) AS "activityCount",
        act_c.last_at AS "lastActivityAt"
      FROM users u
      LEFT JOIN (SELECT user_id, COUNT(*)::int AS n FROM orders GROUP BY user_id) orders_c ON orders_c.user_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*)::int AS n FROM impact_calculations GROUP BY user_id) calcs_c ON calcs_c.user_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*)::int AS n FROM quote_requests GROUP BY user_id) qr_c ON qr_c.user_id = u.id
      LEFT JOIN (
        -- quote_drafts uses rep_user_id, not user_id (rep is the
        -- author; the recipient is the customer behind the share token)
        SELECT rep_user_id AS user_id, COUNT(*)::int AS n
        FROM quote_drafts WHERE rep_user_id IS NOT NULL GROUP BY rep_user_id
      ) qd_c ON qd_c.user_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*)::int AS n FROM solution_requests GROUP BY user_id) sr_c ON sr_c.user_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*)::int AS n FROM site_surveys GROUP BY user_id) ss_c ON ss_c.user_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*)::int AS n FROM layout_drawings GROUP BY user_id) ld_c ON ld_c.user_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*)::int AS n FROM projects GROUP BY user_id) p_c ON p_c.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*)::int AS n, MAX(viewed_at) AS last_at
        FROM user_activity GROUP BY user_id
      ) act_c ON act_c.user_id = u.id
      ORDER BY u.created_at DESC NULLS LAST
    `;
    // Hide a couple of admin-only rows (the seeded admin@asafe and any
    // role=admin) so the report shows real customer/rep usage by default.
    // Caller can pass ?include=admins=true if they want everyone.
    const includeAdmins = c.req.query("includeAdmins") === "true";
    const filtered = includeAdmins
      ? rows
      : (rows as any[]).filter((r) => r.role !== "admin");
    return c.json({
      ok: true,
      total: filtered.length,
      generatedAt: new Date().toISOString(),
      rows: filtered,
    });
  } catch (e: any) {
    console.error("usage-report failed:", e);
    // If quote_drafts or another late-added table doesn't exist yet,
    // fail loud-but-graceful so the operator sees which migration to
    // run rather than a silent empty page.
    return c.json(
      {
        ok: false,
        message: e?.message || String(e),
        hint: "If this is a missing-table or missing-column error, apply pending migrations at /admin/migrations first.",
      },
      500,
    );
  }
});

// ─── Email-log diagnostics ──────────────────────────────────────
// Admin GET + replay endpoints for the email_log table (created by
// migration 2026-05-01-019-email-log). Powers /admin/email-log so an
// operator can answer "why didn't my password reset arrive?" without
// grepping Worker logs. Replay issues a fresh sendEmail with the original
// to/subject and a placeholder body — the HTML body is not stored in the
// log on purpose.

// Admin GET — last N email_log rows, optionally filtered by status.
// Defaults to limit=200; clamped at 500 to keep the admin page snappy.
// Auth: existing requireAdmin() pattern (admin role on session user).
app.get("/api/admin/email-log", authMiddleware, async (c) => {
  if (!(await requireAdmin(c))) {
    return c.json({ message: "Admin access required" }, 403);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    // Defensive: if migration hasn't run yet, return an empty list
    // alongside `bootstrapNeeded: true` so the admin UI can render a
    // "Apply schema first" hint instead of a 500.
    const tableExists = (await sqlClient`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'email_log'
      ) AS exists
    `) as Array<{ exists: boolean }>;
    if (!tableExists[0]?.exists) {
      return c.json({
        rows: [],
        bootstrapNeeded: true,
        message:
          "email_log table not yet created — apply pending migrations at /admin/migrations first.",
      });
    }

    // Parse + clamp query params. status is one of the known values or
    // null for "any". limit is bounded so a curious admin can't OOM the
    // worker by passing limit=10000000.
    const statusRaw = c.req.query("status");
    const status =
      statusRaw && ["sent", "failed", "skipped_no_config", "queued"].includes(statusRaw)
        ? statusRaw
        : null;
    const limitRaw = parseInt(c.req.query("limit") || "200", 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(500, Math.max(1, limitRaw))
      : 200;

    // Simple branched query — neon-tagged-template doesn't support
    // conditional WHERE clauses without the sql.fragment helper, so we
    // duplicate the SELECT to keep this file dependency-free.
    const rows = status
      ? ((await sqlClient`
          SELECT id, "to", subject, from_address, status, resend_id,
                 error_code, error_message, response_status, response_body,
                 caller_route, created_at
          FROM email_log
          WHERE status = ${status}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `) as any[])
      : ((await sqlClient`
          SELECT id, "to", subject, from_address, status, resend_id,
                 error_code, error_message, response_status, response_body,
                 caller_route, created_at
          FROM email_log
          ORDER BY created_at DESC
          LIMIT ${limit}
        `) as any[]);

    return c.json({
      rows: rows.map((r) => ({
        id: r.id,
        to: r.to,
        subject: r.subject,
        fromAddress: r.from_address,
        status: r.status,
        resendId: r.resend_id,
        errorCode: r.error_code,
        errorMessage: r.error_message,
        responseStatus: r.response_status,
        responseBody: r.response_body,
        callerRoute: r.caller_route,
        createdAt: r.created_at,
      })),
      total: rows.length,
    });
  } catch (e: any) {
    console.error("GET /api/admin/email-log failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Admin replay — re-issue a previously-attempted email by id. Useful
// after the underlying Resend cause has been fixed (e.g. domain
// verified). Idempotent in the sense that each click logs a fresh
// row; we don't update the original. Body is intentionally a short
// "this is a manual re-send" notice — the original HTML payload isn't
// stored in the log on purpose (privacy + log size).
app.post("/api/admin/email-log/:id/replay", authMiddleware, async (c) => {
  if (!(await requireAdmin(c))) {
    return c.json({ message: "Admin access required" }, 403);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }
  const id = c.req.param("id");
  if (!id) return c.json({ ok: false, message: "id required" }, 400);
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);
    const rows = (await sqlClient`
      SELECT "to", subject, caller_route
      FROM email_log
      WHERE id = ${id}
      LIMIT 1
    `) as Array<{ to: string; subject: string; caller_route: string | null }>;
    if (rows.length === 0) {
      return c.json({ ok: false, message: "Not found" }, 404);
    }
    const row = rows[0];
    // Lazy import to avoid a circular dep with services/email at module load.
    const { sendEmail: sendEmailFn } = await import("./services/email");
    const html = `
      <p>This is a manual re-send of a previously-failed email.</p>
      <p>Original subject: <strong>${row.subject}</strong>.</p>
      <p>If you received this in error, you can safely ignore it.</p>
    `;
    const ok = await sendEmailFn(c.env, row.to, row.subject, html, {
      callerRoute: row.caller_route || "/api/admin/email-log/replay",
    });
    return c.json({ ok, replayed: true, originalId: id });
  } catch (e: any) {
    console.error("POST /api/admin/email-log/:id/replay failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// ─── API 404 ────────────────────────────────────────────
// Unknown /api paths must never fall through to the SPA shell below —
// a JSON 404 is what fetch callers expect.
app.all("/api/*", (c) => c.json({ message: "Not found" }, 404));

// ─── SPA Catch-All ──────────────────────────────────────
// For any non-API route (e.g. /products, /dashboard, /site-survey),
// serve the SPA index.html via the ASSETS binding so client-side
// routing works on direct navigation / page refresh.
app.get("*", async (c) => {
  try {
    return await c.env.ASSETS.fetch(c.req.raw);
  } catch {
    return c.text("Not Found", 404);
  }
});

// ─── Worker Exports ──────────────────────────────────────
// `fetch` is the HTTP handler (Hono app). `scheduled` is the cron handler —
// runs weekly per the trigger in wrangler.toml and dumps four core tables
// to R2 as CSV. See worker/scheduled/backupExporter.ts for details.
export default {
  fetch: app.fetch,
  scheduled: async (
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ) => {
    // Two cron triggers share one handler — dispatch on the cron string
    // from wrangler.toml. Weekly Sunday backup runs the R2 dump; daily
    // scan flags overdue installation phases and nudges notifications.
    const cron = (event as any).cron as string | undefined;
    if (cron === "0 3 * * SUN") {
      ctx.waitUntil(runBackups(env));
    } else if (cron === "0 6 * * *") {
      // Daily 06:00 UTC dispatch:
      //   1. Flag overdue installation phases.
      //   2. Scan project events and write pending comm suggestions.
      // Both are idempotent and cheap; running them in the same cron
      // saves a second trigger registration in wrangler.toml.
      ctx.waitUntil(scanOverdueInstallations(env));
      ctx.waitUntil(scanCommSuggestions(env));
    } else {
      // Unknown schedule — run all to be safe; everything is cheap and idempotent.
      ctx.waitUntil(runBackups(env));
      ctx.waitUntil(scanOverdueInstallations(env));
      ctx.waitUntil(scanCommSuggestions(env));
    }
  },
};
