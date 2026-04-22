import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Variables } from "./types";
import { authMiddleware } from "./middleware/auth";
import { securityHeaders } from "./middleware/securityHeaders";
import { requestContext } from "./middleware/requestContext";
import { getDb } from "./db";
import { createStorage } from "./storage";
import { runBackups } from "./scheduled/backupExporter";
import {
  matchByNameVariants,
  normaliseCanonical,
} from "../shared/nameNormalise";

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
import { scanOverdueInstallations } from "./scheduled/installationScanner";

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

// DB schema check + auto-fix for missing columns — admin only
app.get("/api/admin/fix-schema", authMiddleware, async (c) => {
  if (!(await requireAdmin(c))) return c.json({ message: "Admin access required" }, 403);
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(c.env.DATABASE_URL);

    // Check if oauth columns exist
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN ('oauth_provider', 'oauth_id', 'password_reset_token', 'password_reset_expiry')
    `;

    const existingCols = cols.map((r: any) => r.column_name);
    const results: string[] = [];

    if (!existingCols.includes("oauth_provider")) {
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR`;
      results.push("Added oauth_provider column");
    } else {
      results.push("oauth_provider already exists");
    }

    if (!existingCols.includes("oauth_id")) {
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_id VARCHAR`;
      results.push("Added oauth_id column");
    } else {
      results.push("oauth_id already exists");
    }

    if (!existingCols.includes("password_reset_token")) {
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR`;
      results.push("Added password_reset_token column");
    } else {
      results.push("password_reset_token already exists");
    }

    if (!existingCols.includes("password_reset_expiry")) {
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expiry TIMESTAMP`;
      results.push("Added password_reset_expiry column");
    } else {
      results.push("password_reset_expiry already exists");
    }

    // users.jobRole — day-job label (BDM / Engineering Manager / etc).
    // Decoupled from `role` which controls permissions.
    if (!existingCols.includes("job_role")) {
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS job_role VARCHAR DEFAULT 'BDM'`;
      results.push("Added users.job_role column");
    } else {
      results.push("users.job_role already exists");
    }

    // users.activeProjectId — current opportunity the rep is working on.
    // Header chip + every downstream form default reads from this.
    if (!existingCols.includes("active_project_id")) {
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS active_project_id VARCHAR`;
      results.push("Added users.active_project_id column");
    } else {
      results.push("users.active_project_id already exists");
    }

    // customer_companies — cross-project customer records (logo, address,
    // industry). One Dnata record feeds every Dnata project.
    const ccExists = await sql`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'customer_companies')
    `;
    if (!ccExists[0]?.exists) {
      await sql`
        CREATE TABLE IF NOT EXISTS customer_companies (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR NOT NULL,
          name VARCHAR NOT NULL,
          logo_url VARCHAR,
          industry VARCHAR,
          billing_address TEXT,
          city VARCHAR,
          country VARCHAR,
          website VARCHAR,
          notes TEXT,
          created_at TIMESTAMP DEFAULT now(),
          updated_at TIMESTAMP DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS customer_companies_user_idx ON customer_companies (user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS customer_companies_name_lower_idx ON customer_companies (lower(name))`;
      results.push("Created customer_companies table");
    } else {
      results.push("customer_companies table already exists");
    }

    // projects — one opportunity against one customer.
    const projExists = await sql`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'projects')
    `;
    if (!projExists[0]?.exists) {
      await sql`
        CREATE TABLE IF NOT EXISTS projects (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR NOT NULL,
          customer_company_id VARCHAR,
          name VARCHAR NOT NULL,
          location VARCHAR,
          description TEXT,
          status VARCHAR DEFAULT 'active',
          default_delivery_address TEXT,
          default_installation_complexity VARCHAR,
          preferred_reciprocal_commitment_ids JSONB,
          preferred_service_option_id VARCHAR,
          last_accessed_at TIMESTAMP DEFAULT now(),
          created_at TIMESTAMP DEFAULT now(),
          updated_at TIMESTAMP DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS projects_user_idx ON projects (user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS projects_customer_idx ON projects (customer_company_id)`;
      await sql`CREATE INDEX IF NOT EXISTS projects_last_accessed_idx ON projects (last_accessed_at)`;
      results.push("Created projects table");
    } else {
      results.push("projects table already exists");
    }

    // project_contacts — customer-side decision-makers per project. Roles
    // drive approval-chain email dispatch defaults.
    const pcExists = await sql`
      SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'project_contacts')
    `;
    if (!pcExists[0]?.exists) {
      await sql`
        CREATE TABLE IF NOT EXISTS project_contacts (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id VARCHAR NOT NULL,
          customer_company_id VARCHAR,
          name VARCHAR NOT NULL,
          job_title VARCHAR,
          email VARCHAR,
          mobile VARCHAR,
          role VARCHAR,
          notes TEXT,
          last_interacted_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT now(),
          updated_at TIMESTAMP DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS project_contacts_project_idx ON project_contacts (project_id)`;
      await sql`CREATE INDEX IF NOT EXISTS project_contacts_email_idx ON project_contacts (lower(email))`;
      results.push("Created project_contacts table");
    } else {
      results.push("project_contacts table already exists");
    }

    // Also check and add cart_items columns that may be missing
    const cartCols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'cart_items'
    `;
    const existingCartCols = cartCols.map((r: any) => r.column_name);

    const cartMigrations: [string, string][] = [
      // Specialty product dimensions
      ["restrictor_height", "DECIMAL"],
      ["restrictor_width", "DECIMAL"],
      ["topple_height", "DECIMAL"],
      ["topple_width", "DECIMAL"],
      // Calculator/configurator data
      ["calculator_images", "JSONB"],
      ["selected_variant", "JSONB"],
      // Application area
      ["application_area", "TEXT"],
      // Column guard fields
      ["column_length", "VARCHAR"],
      ["column_width", "VARCHAR"],
      ["sides_to_protect", "INTEGER"],
      // FlexiShield spacer fields
      ["length_spacers", "INTEGER"],
      ["width_spacers", "INTEGER"],
      // Impact calculation linkage
      ["impact_calculation_id", "VARCHAR"],
      ["calculation_context", "JSONB"],
      // Site reference images
      ["reference_images", "JSONB"],
      ["installation_location", "TEXT"],
      // Delivery options
      ["requires_delivery", "BOOLEAN DEFAULT false"],
      ["delivery_address", "TEXT"],
      ["delivery_latitude", "DECIMAL(10,8)"],
      ["delivery_longitude", "DECIMAL(11,8)"],
      // Installation options
      ["requires_installation", "BOOLEAN DEFAULT false"],
    ];

    for (const [col, colType] of cartMigrations) {
      if (!existingCartCols.includes(col)) {
        await sql(`ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS ${col} ${colType}`);
        results.push(`Added cart_items.${col} column`);
      } else {
        results.push(`cart_items.${col} already exists`);
      }
    }

    // Check cart_project_info has companyLogoUrl column
    const cpiCols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'cart_project_info'
    `;
    const existingCpiCols = cpiCols.map((r: any) => r.column_name);
    if (!existingCpiCols.includes("company_logo_url")) {
      await sql`ALTER TABLE cart_project_info ADD COLUMN IF NOT EXISTS company_logo_url VARCHAR`;
      results.push("Added cart_project_info.company_logo_url column");
    } else {
      results.push("cart_project_info.company_logo_url already exists");
    }

    // Check user_service_selections table exists
    const userServiceSelectionsExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'user_service_selections'
      )
    `;
    if (!userServiceSelectionsExists[0]?.exists) {
      await sql`
        CREATE TABLE IF NOT EXISTS user_service_selections (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR NOT NULL,
          service_option_id VARCHAR NOT NULL,
          is_selected BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT now(),
          updated_at TIMESTAMP DEFAULT now()
        )
      `;
      results.push("Created user_service_selections table");
    } else {
      results.push("user_service_selections table already exists");
    }

    // Partner discount codes — server-authoritative replacement for the old
    // Engage<N>! regex. These tables allow auditable, revocable, usage-capped
    // partner rates tied to specific channel partners.
    const partnerCodesExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'partner_codes'
      )
    `;
    if (!partnerCodesExists[0]?.exists) {
      await sql`
        CREATE TABLE IF NOT EXISTS partner_codes (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          code VARCHAR NOT NULL UNIQUE,
          partner_name VARCHAR NOT NULL,
          discount_percent INTEGER NOT NULL CHECK (discount_percent BETWEEN 1 AND 35),
          valid_from TIMESTAMP,
          valid_to TIMESTAMP,
          usage_cap INTEGER,
          usage_count INTEGER NOT NULL DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT true,
          notes TEXT,
          created_by VARCHAR,
          created_at TIMESTAMP DEFAULT now(),
          updated_at TIMESTAMP DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS partner_codes_code_lower_idx ON partner_codes (LOWER(code))`;
      results.push("Created partner_codes table");
    } else {
      results.push("partner_codes table already exists");
    }

    // Layout-drawings title-block fields (matches A-SAFE DWC LLC CAD template).
    // Added columns if missing so existing drawings still resolve.
    const ldCols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'layout_drawings'
    `;
    const existingLd = ldCols.map((r: any) => r.column_name);
    const ldNew: Array<[string, string]> = [
      ["dwg_number", "VARCHAR"],
      ["revision", "VARCHAR"],
      ["drawing_date", "VARCHAR"],
      ["drawing_title", "VARCHAR"],
      ["drawing_scale", "VARCHAR"],
      ["author", "VARCHAR"],
      ["checked_by", "VARCHAR"],
      ["revision_history", "JSONB"],
      ["notes_section", "TEXT"],
    ];
    for (const [col, type] of ldNew) {
      if (!existingLd.includes(col)) {
        await sql(`ALTER TABLE layout_drawings ADD COLUMN IF NOT EXISTS ${col} ${type}`);
        results.push(`Added layout_drawings.${col}`);
      }
    }

    const partnerCodeRedemptionsExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'partner_code_redemptions'
      )
    `;
    if (!partnerCodeRedemptionsExists[0]?.exists) {
      await sql`
        CREATE TABLE IF NOT EXISTS partner_code_redemptions (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          partner_code_id VARCHAR NOT NULL,
          user_id VARCHAR NOT NULL,
          order_id VARCHAR,
          cart_subtotal NUMERIC(12,2),
          discount_percent_applied INTEGER NOT NULL,
          redeemed_at TIMESTAMP NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS partner_redemptions_code_idx ON partner_code_redemptions (partner_code_id)`;
      await sql`CREATE INDEX IF NOT EXISTS partner_redemptions_user_idx ON partner_code_redemptions (user_id)`;
      results.push("Created partner_code_redemptions table");
    } else {
      results.push("partner_code_redemptions table already exists");
    }

    // Marketing sign-off signature column — the orders table historically had
    // technical_signature + commercial_signature but marketing was represented
    // only by free-form comments. Section-level approvals now require a signed
    // record for all three legs so the live view and PDF render consistently.
    const ordersCols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'orders'
        AND column_name = 'marketing_signature'
    `;
    if (ordersCols.length === 0) {
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS marketing_signature JSONB`;
      results.push("Added orders.marketing_signature column");
    } else {
      results.push("orders.marketing_signature already exists");
    }

    // Magic-link approval flow — next-approver-email capture column on orders.
    // Populated incrementally as each approver enters the email of the next
    // person in the chain (Technical → Commercial → Marketing).
    const ordersNextApproverCol = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'orders'
        AND column_name = 'next_approver_emails'
    `;
    if (ordersNextApproverCol.length === 0) {
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS next_approver_emails JSONB`;
      results.push("Added orders.next_approver_emails column");
    } else {
      results.push("orders.next_approver_emails already exists");
    }

    // Magic-link approval tokens table. 30-day expiry, single-use. The token
    // column is indexed uniquely — it's the bearer credential from the email
    // link and every lookup hits it. Order-scoped index supports the "revoke
    // everything outstanding for this order" admin path.
    const approvalTokensExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'approval_tokens'
      )
    `;
    if (!approvalTokensExists[0]?.exists) {
      await sql`
        CREATE TABLE IF NOT EXISTS approval_tokens (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          token VARCHAR NOT NULL UNIQUE,
          order_id VARCHAR NOT NULL REFERENCES orders(id),
          section VARCHAR NOT NULL,
          expected_email VARCHAR NOT NULL,
          issued_at TIMESTAMP NOT NULL DEFAULT now(),
          expires_at TIMESTAMP NOT NULL,
          used_at TIMESTAMP,
          revoked_at TIMESTAMP,
          created_by VARCHAR REFERENCES users(id),
          created_at TIMESTAMP DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_approval_tokens_token ON approval_tokens (token)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_approval_tokens_order ON approval_tokens (order_id)`;
      results.push("Created approval_tokens table");
    } else {
      results.push("approval_tokens table already exists");
    }

    // Order-scoped audit log. Append-only — every significant event in an
    // order's approval lifecycle (dispatch, click, approve, reject, revoke,
    // self-approve-next) lands here. Denormalized on purpose: actorEmail is
    // populated for magic-link approvers who have no user account.
    const orderAuditLogExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'order_audit_log'
      )
    `;
    if (!orderAuditLogExists[0]?.exists) {
      await sql`
        CREATE TABLE IF NOT EXISTS order_audit_log (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          order_id VARCHAR NOT NULL REFERENCES orders(id),
          event_type VARCHAR NOT NULL,
          section VARCHAR,
          actor_user_id VARCHAR REFERENCES users(id),
          actor_email VARCHAR,
          details JSONB,
          ip_address VARCHAR,
          user_agent TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_order_audit_log_order ON order_audit_log (order_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_order_audit_log_created ON order_audit_log (created_at)`;
      results.push("Created order_audit_log table");
    } else {
      results.push("order_audit_log table already exists");
    }

    return c.json({ success: true, results });
  } catch (e: any) {
    console.error("Admin endpoint error:", e);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

// Seed products endpoint — populates the products table from all A-SAFE CSV data (33 families, 101 SKUs)
app.get("/api/admin/seed-products", authMiddleware, async (c) => {
  if (!(await requireAdmin(c))) return c.json({ message: "Admin access required" }, 403);
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);
    const { PRODUCT_SEED_DATA, PRICING_TIER_SEED_DATA } = await import("./data/seedData");

    const force = c.req.query("force") === "true";

    // Clear existing products if force=true, otherwise skip if already seeded
    if (force) {
      await sqlClient`DELETE FROM product_pricing WHERE true`;
      await sqlClient`DELETE FROM products WHERE true`;
    } else {
      const existing = await sqlClient`SELECT count(*) as cnt FROM products WHERE is_active = true`;
      if (parseInt(existing[0].cnt) >= 30) {
        return c.json({ message: `Products already seeded (${existing[0].cnt} active products). Use ?force=true to reseed.`, skipped: true });
      }
      // Clean partial seed
      await sqlClient`DELETE FROM product_pricing WHERE true`;
      await sqlClient`DELETE FROM products WHERE true`;
    }

    // Seed products from PRODUCT_SEED_DATA (33 families)
    const results: string[] = [];
    for (const p of PRODUCT_SEED_DATA) {
      await sqlClient`
        INSERT INTO products (id, name, category, subcategory, description, impact_rating, height_min, height_max,
          pas_13_compliant, price, base_price_per_meter, currency, image_url, applications, industries, features,
          pricing_logic, specifications, is_active, created_at, updated_at)
        VALUES (
          gen_random_uuid(), ${p.name}, ${p.category}, ${p.subcategory || null}, ${p.description},
          ${p.impact_rating}, ${p.height_min}, ${p.height_max}, ${p.pas13},
          ${p.price}, ${p.base_price_per_meter || null}, 'AED', ${p.image_url},
          ${JSON.stringify(p.applications)}::jsonb, ${JSON.stringify(p.industries)}::jsonb,
          ${JSON.stringify(p.features)}::jsonb, ${p.pricing_logic},
          ${p.specifications ? JSON.stringify(p.specifications) : null}::jsonb,
          true, now(), now()
        )
      `;
      const variantCount = p.specifications?.variants?.length || 0;
      results.push(`Created: ${p.name} (${variantCount} variants)`);
    }

    // Seed pricing tiers
    for (const t of PRICING_TIER_SEED_DATA) {
      await sqlClient`
        INSERT INTO product_pricing (id, product_name, pricing_type,
          tier1_min, tier1_max, tier1_price,
          tier2_min, tier2_max, tier2_price,
          tier3_min, tier3_max, tier3_price,
          tier4_min, tier4_max, tier4_price,
          is_active, created_at, updated_at)
        VALUES (
          gen_random_uuid(), ${t.product_name}, ${t.pricing_type},
          ${t.tier1_min}, ${t.tier1_max}, ${t.tier1_price},
          ${t.tier2_min}, ${t.tier2_max}, ${t.tier2_price},
          ${t.tier3_min}, ${t.tier3_max}, ${t.tier3_price},
          ${t.tier4_min}, ${t.tier4_max}, ${t.tier4_price},
          true, now(), now()
        )
      `;
    }
    results.push(`Seeded ${PRICING_TIER_SEED_DATA.length} pricing tiers`);

    return c.json({ success: true, products: PRODUCT_SEED_DATA.length, pricingTiers: PRICING_TIER_SEED_DATA.length, results });
  } catch (e: any) {
    console.error("Admin endpoint error:", e);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

// Seed case studies endpoint — populates the case_studies table with A-SAFE case studies
app.get("/api/admin/seed-case-studies", authMiddleware, async (c) => {
  if (!(await requireAdmin(c))) return c.json({ message: "Admin access required" }, 403);
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);
    const { CASE_STUDY_SEED_DATA } = await import("./data/seedData");

    const force = c.req.query("force") === "true";

    if (force) {
      await sqlClient`DELETE FROM project_case_studies WHERE true`;
      await sqlClient`DELETE FROM case_studies WHERE true`;
    } else {
      const existing = await sqlClient`SELECT count(*) as cnt FROM case_studies WHERE is_published = true`;
      if (parseInt(existing[0].cnt) >= 5) {
        return c.json({ message: `Case studies already seeded (${existing[0].cnt} published). Use ?force=true to reseed.`, skipped: true });
      }
      await sqlClient`DELETE FROM project_case_studies WHERE true`;
      await sqlClient`DELETE FROM case_studies WHERE true`;
    }

    const results: string[] = [];
    for (const cs of CASE_STUDY_SEED_DATA) {
      await sqlClient`
        INSERT INTO case_studies (id, title, industry, company, description, challenge, solution, outcomes,
          image_url, pdf_url, video_url, content_type, is_published, created_at, updated_at)
        VALUES (
          gen_random_uuid(), ${cs.title}, ${cs.industry}, ${cs.company}, ${cs.description},
          ${cs.challenge}, ${cs.solution}, ${JSON.stringify(cs.outcomes)}::jsonb,
          ${cs.imageUrl}, ${cs.pdfUrl}, ${cs.videoUrl}, ${cs.contentType},
          ${cs.isPublished}, now(), now()
        )
      `;
      results.push(`Created: ${cs.title}`);
    }

    return c.json({ success: true, caseStudies: CASE_STUDY_SEED_DATA.length, results });
  } catch (e: any) {
    console.error("Admin endpoint error:", e);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

// Seed discount options and service care options
app.get("/api/admin/seed-options", authMiddleware, async (c) => {
  if (!(await requireAdmin(c))) return c.json({ message: "Admin access required" }, 403);
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);
    const results: string[] = [];

    // Seed discount options (reciprocal value commitments) — GCC-tuned 8-item list.
    // The previous 12-option list was consolidated: LOGO_USAGE folded into
    // LINKEDIN_POST, SITE_PHOTOGRAPHY + VIDEO_TESTIMONIAL folded into CASE_STUDY,
    // REFERENCE_SITE folded into REFERRALS. The retired IDs are explicitly
    // deactivated so existing selections resolve but they disappear from pickers.
    const discountOptions = [
      // ── Financial ──────────────────────────────────────────────
      { id: "ADVANCE_PAYMENT", title: "100% Advance Payment", description: "Full payment within 7 days of proforma invoice. Clawed back if payment slips beyond 14 days.", discountPercent: 5, category: "Financial" },
      // ── Service ────────────────────────────────────────────────
      { id: "SERVICE_CONTRACT", title: "3-Year Service & Maintenance SLA", description: "Signed three-year service agreement with agreed maintenance cadence and response SLAs.", discountPercent: 6, category: "Service" },
      // ── Marketing (consolidated bundles) ───────────────────────
      { id: "LINKEDIN_POST", title: "LinkedIn Post + Logo Rights", description: "One approved LinkedIn post featuring the A-SAFE installation, plus logo-usage rights in A-SAFE marketing. Delivered within 30 days of install.", discountPercent: 3, category: "Marketing" },
      { id: "CASE_STUDY", title: "Case Study Bundle (photo + written + video)", description: "Full content package: on-site photography, a written case study, and one short-form video testimonial. Delivered within 90 days.", discountPercent: 7, category: "Marketing" },
      { id: "PRESS_RELEASE", title: "Joint Press Release + Named Speaker", description: "Co-branded press release on launch, plus a named speaker slot at one A-SAFE regional event within 12 months.", discountPercent: 5, category: "Marketing" },
      // ── Business Development ───────────────────────────────────
      { id: "REFERRALS", title: "Qualified Referrals / Reference-Site Access", description: "Either provide qualified referrals (discount released on first conversion) OR allow up to four reference-site visits per year.", discountPercent: 5, category: "Business Development" },
      // ── Partnership ────────────────────────────────────────────
      { id: "FLAGSHIP_SHOWCASE", title: "Flagship Showcase Site (min AED 500k)", description: "Facility featured as an A-SAFE flagship reference site with permanent branded signage and on-site hosting rights.", discountPercent: 10, category: "Partnership" },
      { id: "EXCLUSIVE_SUPPLIER", title: "3-Year Exclusive Supplier Agreement", description: "Written exclusivity for A-SAFE as sole safety-barrier supplier for three years across the signatory's GCC sites.", discountPercent: 12, category: "Partnership" },
    ];

    for (const opt of discountOptions) {
      await sqlClient`
        INSERT INTO discount_options (id, title, description, discount_percent, category, is_active)
        VALUES (${opt.id}, ${opt.title}, ${opt.description}, ${opt.discountPercent}, ${opt.category}, true)
        ON CONFLICT (id) DO UPDATE SET
          title = ${opt.title},
          description = ${opt.description},
          discount_percent = ${opt.discountPercent},
          category = ${opt.category},
          is_active = true
      `;
      results.push(`Discount: ${opt.title} (${opt.discountPercent}%)`);
    }

    // Retired options: keep the rows (so historical orders still resolve the
    // id → title / percent) but mark inactive so they're hidden from pickers.
    const retiredIds = ["LOGO_USAGE", "SITE_PHOTOGRAPHY", "VIDEO_TESTIMONIAL", "REFERENCE_SITE"];
    for (const id of retiredIds) {
      await sqlClient`
        UPDATE discount_options SET is_active = false WHERE id = ${id}
      `;
      results.push(`Retired: ${id}`);
    }

    // Seed a starter set of partner codes. Real codes should be created via
    // the admin endpoint — these are only here so the system isn't empty on
    // a fresh install. Use `ON CONFLICT DO NOTHING` so we don't reset usage
    // counts on repeat seed runs.
    const starterPartnerCodes = [
      { code: "GULF-SAFETY-2026", partnerName: "Gulf Safety Partners", discountPercent: 10, usageCap: 50, notes: "Seed: GCC channel partner — 2026 plan." },
      { code: "DXB-PREMIER-15",  partnerName: "Dubai Premier Industrial", discountPercent: 15, usageCap: 25, notes: "Seed: Tier-1 Dubai reseller." },
      { code: "KSA-ALJAZEERA-20", partnerName: "Al Jazeera Safety KSA",   discountPercent: 20, usageCap: 15, notes: "Seed: Saudi exclusive rep." },
      { code: "DEMO-TEST-5",     partnerName: "Internal Demo",            discountPercent: 5,  usageCap: null, notes: "Seed: internal testing only." },
    ];
    for (const pc of starterPartnerCodes) {
      await sqlClient`
        INSERT INTO partner_codes (code, partner_name, discount_percent, usage_cap, notes, is_active)
        VALUES (${pc.code}, ${pc.partnerName}, ${pc.discountPercent}, ${pc.usageCap}, ${pc.notes}, true)
        ON CONFLICT (code) DO NOTHING
      `;
      results.push(`Partner code seeded (if new): ${pc.code} (${pc.discountPercent}%)`);
    }

    // Seed service care options — renamed + repositioned to match GCC
    // buyer language and give a defensible ladder from Essential → Strategic.
    // IDs stay stable (SERVICE_BASIC / STANDARD / PREMIUM / ENTERPRISE) so
    // historical selections still resolve; only titles/descriptions change.
    const serviceOptions = [
      {
        id: "SERVICE_BASIC",
        title: "Essential Care",
        description:
          "Annual safety inspection, incident-reporting portal access, and quarterly A-SAFE product bulletin. Ideal for smaller sites that self-service between inspections.",
        chargeable: false,
        value: "Free",
      },
      {
        id: "SERVICE_STANDARD",
        title: "Plus Care",
        description:
          "Bi-annual inspections, one scheduled maintenance visit per year, minor repairs included, +1-year extended warranty, and priority business-hours support.",
        chargeable: true,
        value: "5%",
      },
      {
        id: "SERVICE_PREMIUM",
        title: "Pro Care",
        description:
          "Quarterly inspections, two maintenance visits per year, replacement parts at cost, named engineer contact, same-day critical-failure response, +2-year extended warranty (capped at 10M impact cycles), and an annual on-site training refresher.",
        chargeable: true,
        value: "10%",
      },
      {
        id: "SERVICE_ENTERPRISE",
        title: "Strategic Care",
        description:
          "Monthly inspections, unlimited maintenance visits, replacement parts free + priority stock, 24/7 support with 4-hour SLA, dedicated account manager, quarterly certified training programme, +3-year extended warranty (capped at 10M impact cycles), and an annual signed PAS 13 conformance audit report.",
        chargeable: true,
        value: "15%",
      },
    ];

    for (const svc of serviceOptions) {
      await sqlClient`
        INSERT INTO service_care_options (id, title, description, chargeable, value, is_active)
        VALUES (${svc.id}, ${svc.title}, ${svc.description}, ${svc.chargeable}, ${svc.value}, true)
        ON CONFLICT (id) DO UPDATE SET
          title = ${svc.title},
          description = ${svc.description},
          chargeable = ${svc.chargeable},
          value = ${svc.value},
          is_active = true
      `;
      results.push(`Service: ${svc.title} (${svc.value})`);
    }

    return c.json({ success: true, discountOptions: discountOptions.length, serviceOptions: serviceOptions.length, results });
  } catch (e: any) {
    console.error("Admin endpoint error:", e);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

// Seed FAQs — populates the faqs table from comprehensive A-SAFE FAQ data
app.get("/api/admin/seed-faqs", authMiddleware, async (c) => {
  if (!(await requireAdmin(c))) return c.json({ message: "Admin access required" }, 403);
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);
    const results: string[] = [];

    const force = c.req.query("force") === "true";

    if (force) {
      await sqlClient`DELETE FROM faqs WHERE true`;
    } else {
      const existing = await sqlClient`SELECT count(*) as cnt FROM faqs WHERE is_published = true`;
      if (parseInt(existing[0].cnt) >= 10) {
        return c.json({ message: `FAQs already seeded (${existing[0].cnt} published). Use ?force=true to reseed.`, skipped: true });
      }
      await sqlClient`DELETE FROM faqs WHERE true`;
    }

    const FAQ_SEED_DATA = [
      // Product & Technology
      { category: "Product & Technology", question: "What makes A-SAFE barriers different from steel barriers?", answer: "A-SAFE barriers are made from advanced polymer technology that flexes and absorbs impact energy. Unlike steel, which transfers impact to the floor and often needs replacing after a collision, A-SAFE barriers self-recover, protecting people, equipment, floors, and vehicles while reducing long-term costs.", priority: 1 },
      { category: "Product & Technology", question: "What does PAS 13 crash testing mean?", answer: "PAS 13 is an internationally recognized code of practice that defines how barriers should be tested and installed. A-SAFE barriers are independently crash-tested to these rigorous standards, so you can trust they perform exactly as promised when it matters most.", priority: 2 },
      { category: "Product & Technology", question: "What materials are A-SAFE barriers made from?", answer: "Our barriers are made from patented advanced polymer blends called Memaplex and Monoplex, specifically engineered to flex, absorb energy, and return to shape after impact.", priority: 3 },
      { category: "Product & Technology", question: "Can A-SAFE barriers be used in automated warehouses or with AGVs (Automated Guided Vehicles)?", answer: "Yes. Our barriers are designed to guide and protect both manned and unmanned traffic. In highly automated environments, they help define pathways for AGVs and protect robotics, storage systems, and segregate personnel zones to not interfere or disrupt AGV traffic flow.", priority: 4 },
      { category: "Product & Technology", question: "What innovations are coming next for barrier technology?", answer: "We are working on integrating smart technology, such as sensors and IoT connectivity, into barrier systems. These will help facilities track impacts, analyze risk hotspots, and make data-driven improvements.", priority: 5 },

      // Safety & Performance
      { category: "Safety & Performance", question: "Do A-SAFE barriers stop forklifts completely?", answer: "They are designed to absorb energy and slow vehicles safely while protecting structures and people. Depending on the impact conditions, the barrier can stop or significantly decelerate a vehicle, preventing serious damage or injury.", priority: 1 },
      { category: "Safety & Performance", question: "Can barriers protect against racking damage?", answer: "Yes. Specially designed racking protectors and low-level barriers shield racking legs and structures from forklift impacts, which are one of the most common causes of warehouse damage and racking collapse.", priority: 2 },
      { category: "Safety & Performance", question: "Do A-SAFE barriers comply with OSHA and EU regulations?", answer: "Yes. A-SAFE barriers are designed and installed in compliance with international safety standards, including OSHA requirements and EU directives for workplace safety.", priority: 3 },
      { category: "Safety & Performance", question: "How do A-SAFE barriers support a safety culture in the workplace?", answer: "Barriers are a visual and practical commitment to protecting people. They help set boundaries, encourage safe behavior, and show that management prioritizes safety - creating a stronger safety culture.", priority: 4 },
      { category: "Safety & Performance", question: "Do A-SAFE barriers reduce workplace stress?", answer: "Yes. When pedestrians and operators see clear segregation and protection, it reduces anxiety. This leads to a calmer, more confident workforce and improved productivity.", priority: 5 },
      { category: "Safety & Performance", question: "How do barriers help prevent legal and compliance issues?", answer: "Proper impact protection helps companies comply with health and safety regulations, reducing the risk of fines, legal claims, and insurance disputes after incidents.", priority: 6 },
      { category: "Safety & Performance", question: "Do barriers make forklift drivers overconfident?", answer: "No. In fact, clear separation of vehicles and pedestrians reduces driver stress and increases attentiveness. Barriers are a safeguard, not a substitute for safe driving practices.", priority: 7 },

      // Installation & Planning
      { category: "Installation & Planning", question: "How long does installation take?", answer: "It really depends on site size and complexity. Our teams work around your operations to minimize downtime and disruption and it is typically a lot faster than steel alternative barriers due to A-SAFE modular assembly and supplied, fit-for-purpose floor fixings.", priority: 1 },
      { category: "Installation & Planning", question: "Do you offer on-site safety assessments?", answer: "Yes. Our expert team will visit your site, review traffic and pedestrian risks, and provide a customized safety plan. This service is free of charge and comes with a detailed proposal.", priority: 2 },
      { category: "Installation & Planning", question: "Do you provide CAD drawings for planning?", answer: "Yes. We create detailed CAD layouts to help you visualize barrier placement and ensure your system integrates seamlessly with your facility.", priority: 3 },
      { category: "Installation & Planning", question: "Can A-SAFE provide 3D visualizations before installation?", answer: "Yes. Our team can provide 3D models of your facility showing exactly where barriers will be installed (customer supplied Revit design required). This makes planning clear for decision-makers and stakeholders.", priority: 4 },
      { category: "Installation & Planning", question: "Can barriers be installed without drilling into floors?", answer: "In some cases, temporary or surface-mounted solutions can be provided. However, for maximum impact protection, anchoring barriers to the floor ensures full crash-tested performance. We also have special slider base plates to allow for full impact performance along with the ability to easily remove barriers without any tools e.g. for periodic maintenance etc.", priority: 5 },

      // Maintenance & Durability
      { category: "Maintenance & Durability", question: "Are A-SAFE barriers maintenance-free?", answer: "Unlike steel barriers, A-SAFE barriers don't rust, need repainting, or warp after impact. Periodic visual checks are all that's needed, but we can also provide periodic inspections or training for your teams on site.", priority: 1 },
      { category: "Maintenance & Durability", question: "What's the lifespan of a polymer barrier?", answer: "A-SAFE barriers typically last years longer than steel alternatives because they absorb impacts rather than bend or break. They retain their strength and appearance even in demanding environments.", priority: 2 },
      { category: "Maintenance & Durability", question: "Do you provide training for barrier inspection?", answer: "Absolutely. We provide guidance and optional training for your staff to carry out periodic visual inspections, ensuring your system performs optimally.", priority: 3 },
      { category: "Maintenance & Durability", question: "How do I know when it's time to replace a barrier?", answer: "Polymer barriers are highly durable and self-recover after impact, but if a barrier has sustained a major hit, it should be inspected. We provide clear guidelines and can offer inspections to confirm integrity.", priority: 4 },
      { category: "Maintenance & Durability", question: "What happens if an A-SAFE barrier is hit multiple times?", answer: "Our unique polymer design absorbs impacts and flexes back into shape. Repeated minor impacts typically cause no damage. After severe or repeated collisions in the same spot, the barrier can be inspected and individual parts replaced as and when may be necessary.", priority: 5 },

      // Applications & Industries
      { category: "Applications & Industries", question: "What industries are A-SAFE barriers suitable for?", answer: "Our barriers are used across logistics, food & drink, automotive, airports, manufacturing, and pharmaceuticals. Any industry that values the protection of people, assets, and infrastructure can benefit from A-SAFE systems.", priority: 1 },
      { category: "Applications & Industries", question: "Can barriers integrate with other safety systems?", answer: "Yes. We can integrate barriers with gates, access control, and warning signage. Our solutions can also be designed to complement automated systems like sensors or traffic lights.", priority: 2 },
      { category: "Applications & Industries", question: "Can barriers help protect sensitive machinery or infrastructure?", answer: "Absolutely. We offer barriers and bollards specifically designed to shield machinery, control panels, conveyors, columns, and even building walls from impact damage.", priority: 3 },
      { category: "Applications & Industries", question: "Are there options for outdoor use (loading bays, car parks)?", answer: "Yes. A-SAFE provides outdoor-rated barriers and bollards with UV protection and weather-resistant finishes. These are ideal for truck yards, car parks, and external walkways.", priority: 4 },
      { category: "Applications & Industries", question: "Are barriers resistant to chemicals, oils, and weather?", answer: "Our advanced polymers are resistant to most chemicals, oils, and fuels. Outdoor barrier solutions also include UV stabilizers to withstand weather without fading or degrading.", priority: 5 },
      { category: "Applications & Industries", question: "Are there lightweight options for low-speed areas?", answer: "Yes. We offer a range of barrier types, from lightweight pedestrian guides for low-speed areas to heavy-duty systems for high-traffic, high-impact zones.", priority: 6 },

      // Flexibility & Customization
      { category: "Flexibility & Customization", question: "Can barriers be moved if my layout changes?", answer: "Yes. A-SAFE barriers are modular and can be relocated or reconfigured as your facility changes, making them a flexible long-term investment.", priority: 1 },
      { category: "Flexibility & Customization", question: "Can A-SAFE barriers be customized in color or design?", answer: "Yes. Our barriers are available in a range of high-visibility standard colors, and we also offer custom colors to match your corporate branding or site requirements (custom colours may incur additional fees for production).", priority: 2 },
      { category: "Flexibility & Customization", question: "What are the environmental benefits of polymer barriers?", answer: "Our barriers are 100% recyclable and have a longer lifespan than steel, which reduces material waste. Lower replacement frequency also means fewer resources consumed over the life of your system.", priority: 3 },

      // Business & ROI
      { category: "Business & ROI", question: "How do barriers help with insurance compliance?", answer: "Properly installed, crash-tested barriers reduce risks, which can support compliance with insurer requirements and in some cases help reduce premiums.", priority: 1 },
      { category: "Business & ROI", question: "Can barriers prevent vehicle downtime costs?", answer: "Yes. Barriers absorb impacts to protect vehicles from major structural damage, which reduces repair costs, downtime, and productivity losses.", priority: 2 },
      { category: "Business & ROI", question: "What's the typical payback period for an A-SAFE system?", answer: "Most clients see a return on investment within 18-24 months through reduced repairs, downtime, and accident costs. Many report savings that continue for years after installation.", priority: 3 },
      { category: "Business & ROI", question: "How do I get a budget estimate before a site visit?", answer: "You can request an initial estimate by sharing site layouts and vehicle details with us. For accurate pricing, a site assessment is recommended, but we can give rough costs quickly based on your basic information.", priority: 4 },
      { category: "Business & ROI", question: "Can I start with a small project and expand later?", answer: "Yes. Many clients start with a pilot area or high-risk zone. As they see the results, they expand coverage. A-SAFE barriers are modular and easy to extend as needed.", priority: 5 },

      // Assessment & Support
      { category: "Assessment & Support", question: "How do I know which barrier strength I need?", answer: "We assess your site for factors such as vehicle weight, speed, and traffic flow. From this, we recommend a barrier system engineered to absorb the specific impact forces in your facility. We can also share some indicative potential impact forces based upon your vehicle details when input into our impact calculator.", priority: 1 },
      { category: "Assessment & Support", question: "How do barriers affect warehouse traffic flow?", answer: "Properly planned barrier systems guide safe vehicle and pedestrian movement, making facilities more organized. This reduces congestion, improves flow, and minimizes near-misses.", priority: 2 },
      { category: "Assessment & Support", question: "How do I request a free consultation?", answer: "Simply fill out our online form or call your nearest A-SAFE office. One of our safety specialists will contact you to arrange a site visit or virtual assessment at a convenient time.", priority: 3 },
      { category: "Assessment & Support", question: "Do you work internationally?", answer: "A-SAFE has a global presence with offices and partners in multiple regions. We supply and install barrier solutions worldwide, adapting to local standards and languages.", priority: 4 },

      // App Usage & Platform
      { category: "App Usage & Platform", question: "How does the Impact Calculator help me choose the right barriers?", answer: "The Impact Calculator uses PAS 13 methodology to calculate kinetic energy based on your vehicle specifications (weight, speed, turning angles). It provides instant product recommendations with impact ratings and safety margins, eliminating guesswork and ensuring you select barriers engineered for your specific application.", priority: 1 },
      { category: "App Usage & Platform", question: "What makes the A-SAFE ENGAGE product catalog better than traditional catalogs?", answer: "Our interactive catalog features real product data, authentic imagery, detailed specifications, and impact ratings. You can filter by industry, application, and impact requirements while viewing live pricing in multiple currencies. Each product includes comprehensive technical details and installation guides.", priority: 2 },
      { category: "App Usage & Platform", question: "How do case studies on the platform help me make better decisions?", answer: "Case studies provide real-world examples from your industry with authentic video content from A-SAFE's projects. You can see actual implementations, measurable outcomes, and ROI data from similar facilities. Filter by industry to find relevant applications and proven results that support your business case.", priority: 3 },
      { category: "App Usage & Platform", question: "What resources are available in the app to support my projects?", answer: "The Resources section includes installation guides, technical certificates, CAD drawings, BIM objects, and video tutorials. All resources are categorized by product line and downloadable. You also get access to A-SAFE's virtual product space and factory tour for immersive learning.", priority: 4 },
      { category: "App Usage & Platform", question: "How does the cart system help me manage multiple projects?", answer: "The intelligent cart system supports multi-currency pricing, automatic discount calculations, and quantity-based pricing tiers. It includes VAT calculations, delivery costs, and installation estimates. You can save carts for different projects and generate detailed quotes with all project specifications.", priority: 5 },
      { category: "App Usage & Platform", question: "Can I save and track my calculations for future reference?", answer: "Yes! The Calculations History feature saves all your impact calculations with full details including vehicle specs, recommended products, and safety margins. You can revisit previous calculations, modify parameters, and use them as templates for similar projects, building your personal library of solutions.", priority: 6 },
      { category: "App Usage & Platform", question: "How does the quote request feature streamline my procurement process?", answer: "Quote requests automatically pull your user profile data, selected products, and calculation results. The system generates comprehensive technical specifications and submits directly to A-SAFE experts. You get faster, more accurate quotes with all technical details pre-populated, reducing back-and-forth communication.", priority: 7 },
      { category: "App Usage & Platform", question: "What advantages does the mobile app experience offer?", answer: "The mobile-optimized platform lets you access calculations, product specs, and resources on-site. Touch-friendly interface allows quick barrier selection during facility walks, instant access to installation guides, and the ability to share technical data with your team immediately.", priority: 8 },
      { category: "App Usage & Platform", question: "How does my user profile enhance my experience?", answer: "Your profile stores company information, preferences, and project history. It automatically populates quote forms, personalizes product recommendations, and maintains your discount tier status. The system learns your usage patterns to surface relevant content and streamline repeat processes.", priority: 9 },
      { category: "App Usage & Platform", question: "How does the platform save me time compared to traditional methods?", answer: "ENGAGE eliminates multiple steps: instant impact calculations vs. manual engineering, immediate product filtering vs. catalog browsing, one-click quote requests vs. phone calls and emails, downloadable resources vs. requesting documents, and real-time pricing vs. waiting for quotes. Users typically save 60-80% of procurement time.", priority: 10 },
    ];

    // Batch inserts (10 per query) to stay under Cloudflare subrequest limit
    for (let i = 0; i < FAQ_SEED_DATA.length; i += 10) {
      const batch = FAQ_SEED_DATA.slice(i, i + 10);
      const values = batch.map(f =>
        `(gen_random_uuid(), '${f.question.replace(/'/g, "''")}', '${f.answer.replace(/'/g, "''")}', '${f.category}', ${f.priority}, true, now(), now())`
      ).join(",\n");
      await sqlClient(`INSERT INTO faqs (id, question, answer, category, priority, is_published, created_at, updated_at) VALUES ${values}`);
      for (const f of batch) {
        results.push(`FAQ: ${f.category} - ${f.question.substring(0, 50)}...`);
      }
    }

    return c.json({ success: true, faqs: FAQ_SEED_DATA.length, results });
  } catch (e: any) {
    console.error("Admin endpoint error:", e);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

// Seed vehicle types — populates the vehicle_types table for the Impact Calculator
app.get("/api/admin/seed-vehicle-types", authMiddleware, async (c) => {
  if (!(await requireAdmin(c))) return c.json({ message: "Admin access required" }, 403);
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);
    const results: string[] = [];

    const force = c.req.query("force") === "true";
    if (force) {
      await sqlClient`DELETE FROM vehicle_types WHERE true`;
    } else {
      const existing = await sqlClient`SELECT count(*) as cnt FROM vehicle_types WHERE is_active = true`;
      if (parseInt(existing[0].cnt) >= 5) {
        return c.json({ message: `Vehicle types already seeded (${existing[0].cnt} active). Use ?force=true to reseed.`, skipped: true });
      }
      await sqlClient`DELETE FROM vehicle_types WHERE true`;
    }

    // Iconify public MDI icon URLs — free SVG icons
    const ic = (name: string, color = "FFC72C") =>
      `https://api.iconify.design/mdi/${name}.svg?color=%23${color}&height=64`;

    // Common MHE (Material Handling Equipment) types with realistic specs
    const VEHICLE_SEED_DATA = [
      { name: "Pedestrians", category: "pedestrian", description: "Workers on foot - walking speed around 5 km/h, average mass 80 kg per person.", weightMin: 60, weightMax: 120, weightTypical: 80, maxSpeed: 5, capacityMin: null, capacityMax: null, iconUrl: ic("walk"), hexColor: "#6B7280", applicationAreas: ["Pedestrian Walkways","Production Lines","Warehouse Aisles"], industries: ["Logistics","Manufacturing","Retail","Food & Beverage"], sortOrder: 10, isPopular: true },
      { name: "Manual Pallet Truck", category: "pallet-truck", description: "Hand-pumped pallet jack. Operator-walking unit with 2.5T lifting capacity typical.", weightMin: 70, weightMax: 120, weightTypical: 95, maxSpeed: 6, capacityMin: 2000, capacityMax: 3000, iconUrl: "https://api.iconify.design/material-symbols/pallet.svg?color=%23FFC72C&height=64", hexColor: "#3B82F6", applicationAreas: ["Loading Docks","Warehouse Aisles","Retail Back-of-House"], industries: ["Logistics","Retail","Food & Beverage"], sortOrder: 20, isPopular: true },
      { name: "Electric Pallet Truck", category: "pallet-truck", description: "Powered pallet truck (pedestrian-operated). Typical loaded weight 500-800 kg.", weightMin: 400, weightMax: 900, weightTypical: 650, maxSpeed: 8, capacityMin: 1500, capacityMax: 3000, iconUrl: ic("forklift"), hexColor: "#3B82F6", applicationAreas: ["Loading Docks","Warehouse Aisles","Goods-in Areas"], industries: ["Logistics","Manufacturing","Retail"], sortOrder: 21, isPopular: true },
      { name: "Rider Pallet Truck", category: "pallet-truck", description: "Stand-on or ride-on powered pallet truck. Higher speed than pedestrian models.", weightMin: 700, weightMax: 1500, weightTypical: 1100, maxSpeed: 12, capacityMin: 2000, capacityMax: 3500, iconUrl: ic("forklift"), hexColor: "#3B82F6", applicationAreas: ["Loading Docks","Long Warehouse Routes","Cross-Dock Operations"], industries: ["Logistics","E-commerce","Manufacturing"], sortOrder: 22, isPopular: false },
      { name: "Walkie Stacker", category: "stacker", description: "Pedestrian-operated stacker truck for light stacking up to 3m lift height.", weightMin: 500, weightMax: 900, weightTypical: 700, maxSpeed: 6, capacityMin: 1000, capacityMax: 1500, iconUrl: ic("forklift"), hexColor: "#8B5CF6", applicationAreas: ["Light Stacking","Retail Stockrooms","Narrow Aisles"], industries: ["Retail","Warehousing"], sortOrder: 30, isPopular: false },
      { name: "Low-Level Order Picker", category: "stacker", description: "Operator stands on platform, picks cases at low levels. Common in e-commerce fulfilment.", weightMin: 1200, weightMax: 2000, weightTypical: 1600, maxSpeed: 10, capacityMin: 1500, capacityMax: 2500, iconUrl: ic("forklift"), hexColor: "#8B5CF6", applicationAreas: ["Order Picking Aisles","E-commerce Fulfilment"], industries: ["E-commerce","Logistics","Retail"], sortOrder: 31, isPopular: true },
      { name: "High-Level Order Picker", category: "stacker", description: "Operator platform rises to pick at height. Typical in pallet racking warehouses.", weightMin: 2500, weightMax: 4000, weightTypical: 3200, maxSpeed: 12, capacityMin: 1000, capacityMax: 1500, iconUrl: ic("forklift"), hexColor: "#8B5CF6", applicationAreas: ["Narrow Aisle Racking","Pick Modules"], industries: ["Logistics","E-commerce"], sortOrder: 32, isPopular: false },
      { name: "Counterbalance Forklift (1.5T)", category: "forklift", description: "Small counterbalance forklift, typical warehouse workhorse for 1.5T loads.", weightMin: 2400, weightMax: 3000, weightTypical: 2700, maxSpeed: 18, capacityMin: 1000, capacityMax: 1800, iconUrl: ic("forklift"), hexColor: "#EF4444", applicationAreas: ["Loading Docks","Warehouse Aisles","Production Floor"], industries: ["Logistics","Manufacturing","Food & Beverage"], sortOrder: 40, isPopular: true },
      { name: "Counterbalance Forklift (2.5T)", category: "forklift", description: "Medium counterbalance forklift - most common forklift size in logistics.", weightMin: 3500, weightMax: 4500, weightTypical: 4000, maxSpeed: 20, capacityMin: 2000, capacityMax: 3000, iconUrl: ic("forklift"), hexColor: "#EF4444", applicationAreas: ["Loading Docks","Warehouse Aisles","Production Floor","Outdoor Yards"], industries: ["Logistics","Manufacturing","Food & Beverage","Automotive"], sortOrder: 41, isPopular: true },
      { name: "Counterbalance Forklift (5T)", category: "forklift", description: "Heavy-duty counterbalance forklift for 5T loads, common in steel and heavy goods.", weightMin: 6500, weightMax: 8500, weightTypical: 7500, maxSpeed: 22, capacityMin: 4000, capacityMax: 5500, iconUrl: ic("forklift"), hexColor: "#EF4444", applicationAreas: ["Heavy Goods Yards","Steel Stockyards","Large Warehouses"], industries: ["Manufacturing","Steel","Construction","Automotive"], sortOrder: 42, isPopular: true },
      { name: "Reach Truck", category: "reach-truck", description: "Narrow aisle stand-on reach truck. Extends forks forward to place/retrieve racking loads.", weightMin: 3000, weightMax: 4500, weightTypical: 3700, maxSpeed: 14, capacityMin: 1400, capacityMax: 2500, iconUrl: ic("forklift"), hexColor: "#F59E0B", applicationAreas: ["Narrow Aisle Racking","High-Bay Storage"], industries: ["Logistics","E-commerce","Manufacturing"], sortOrder: 50, isPopular: true },
      { name: "Very Narrow Aisle (VNA) Truck", category: "reach-truck", description: "Turret truck for VNA storage. Turns forks 90 degrees to pick from both sides of aisle.", weightMin: 6000, weightMax: 9000, weightTypical: 7500, maxSpeed: 12, capacityMin: 1000, capacityMax: 1500, iconUrl: ic("forklift"), hexColor: "#F59E0B", applicationAreas: ["VNA Storage","High-Density Racking","Cold Storage"], industries: ["Logistics","Cold Storage","E-commerce"], sortOrder: 51, isPopular: false },
      { name: "Heavy-Duty Forklift (10T+)", category: "heavy-duty", description: "Large industrial forklift for container and heavy goods handling. 10-16T lift capacity.", weightMin: 12000, weightMax: 18000, weightTypical: 15000, maxSpeed: 22, capacityMin: 10000, capacityMax: 16000, iconUrl: ic("forklift"), hexColor: "#B91C1C", applicationAreas: ["Ports","Container Yards","Steel Plants","Heavy Industry"], industries: ["Logistics","Steel","Construction","Ports"], sortOrder: 60, isPopular: false },
      { name: "Telehandler", category: "heavy-duty", description: "Telescopic handler / boom lift truck. Extends forks to reach high and far.", weightMin: 6000, weightMax: 12000, weightTypical: 8500, maxSpeed: 25, capacityMin: 2500, capacityMax: 5000, iconUrl: ic("excavator"), hexColor: "#B91C1C", applicationAreas: ["Construction Sites","Outdoor Yards","Agriculture"], industries: ["Construction","Agriculture","Ports"], sortOrder: 61, isPopular: false },
      { name: "Tow Tractor / Tugger", category: "tugger", description: "Electric tug for pulling trains of trolleys. Common in automotive assembly plants.", weightMin: 600, weightMax: 1500, weightTypical: 1000, maxSpeed: 16, capacityMin: 3000, capacityMax: 15000, iconUrl: ic("tractor"), hexColor: "#10B981", applicationAreas: ["Production Lines","Assembly Plants","Long Warehouse Routes"], industries: ["Automotive","Manufacturing","Aerospace"], sortOrder: 70, isPopular: true },
      { name: "AGV (Automated Guided Vehicle)", category: "tugger", description: "Unmanned automated vehicle following fixed paths or using SLAM/vision navigation.", weightMin: 400, weightMax: 1200, weightTypical: 700, maxSpeed: 6, capacityMin: 500, capacityMax: 2000, iconUrl: ic("robot-industrial"), hexColor: "#10B981", applicationAreas: ["Automated Warehouses","Production Lines","E-commerce"], industries: ["E-commerce","Automotive","Electronics"], sortOrder: 71, isPopular: true },
      { name: "Scissor Lift / MEWP", category: "mewp", description: "Mobile elevated work platform. Used for maintenance and installation at height.", weightMin: 1800, weightMax: 3500, weightTypical: 2500, maxSpeed: 5, capacityMin: 200, capacityMax: 500, iconUrl: ic("elevator-up"), hexColor: "#A855F7", applicationAreas: ["Maintenance Zones","Warehouse Aisles","Indoor Construction"], industries: ["Construction","Maintenance","Logistics"], sortOrder: 80, isPopular: false },
      { name: "HGV / Rigid Truck (7.5T)", category: "truck", description: "Rigid body HGV for local deliveries. Common at loading docks and yards.", weightMin: 7500, weightMax: 12000, weightTypical: 10000, maxSpeed: 40, capacityMin: 4000, capacityMax: 7500, iconUrl: ic("truck"), hexColor: "#0EA5E9", applicationAreas: ["Loading Docks","Outdoor Yards","Delivery Points"], industries: ["Logistics","Retail","Food & Beverage"], sortOrder: 90, isPopular: true },
      { name: "HGV / Articulated Truck (40T)", category: "truck", description: "Articulated lorry (tractor + trailer). Heaviest on-site vehicle; slow manoeuvring.", weightMin: 25000, weightMax: 44000, weightTypical: 36000, maxSpeed: 15, capacityMin: 20000, capacityMax: 28000, iconUrl: ic("truck-trailer"), hexColor: "#0EA5E9", applicationAreas: ["Loading Docks","Outdoor Yards","Truck Parks"], industries: ["Logistics","Manufacturing","Retail"], sortOrder: 91, isPopular: true },
      { name: "Delivery Van / Light Commercial", category: "truck", description: "Van or light truck under 3.5T GVW. Common in urban logistics and last-mile delivery.", weightMin: 1800, weightMax: 3500, weightTypical: 2800, maxSpeed: 50, capacityMin: 800, capacityMax: 1500, iconUrl: ic("van-utility"), hexColor: "#0EA5E9", applicationAreas: ["Loading Docks","Yards","Urban Delivery"], industries: ["Logistics","E-commerce","Retail"], sortOrder: 92, isPopular: false },
    ];

    // Batch insert (5 per query) to stay under Cloudflare subrequest limit
    for (let i = 0; i < VEHICLE_SEED_DATA.length; i += 5) {
      const batch = VEHICLE_SEED_DATA.slice(i, i + 5);
      const values = batch.map(v => {
        const esc = (s: any) => s == null ? "NULL" : `'${String(s).replace(/'/g, "''")}'`;
        const num = (n: any) => n == null ? "NULL" : String(n);
        return `(gen_random_uuid(), ${esc(v.name)}, ${esc(v.category)}, ${esc(v.description)}, ${num(v.weightMin)}, ${num(v.weightMax)}, ${num(v.weightTypical)}, ${num(v.maxSpeed)}, ${num(v.capacityMin)}, ${num(v.capacityMax)}, ${esc(v.iconUrl)}, ${esc(v.hexColor)}, ${esc(JSON.stringify(v.applicationAreas))}::jsonb, ${esc(JSON.stringify(v.industries))}::jsonb, true, ${v.isPopular}, ${v.sortOrder}, now(), now())`;
      }).join(",\n");
      await sqlClient(`INSERT INTO vehicle_types (id, name, category, description, weight_min, weight_max, weight_typical, max_speed, capacity_min, capacity_max, icon_url, hex_color, application_areas, industries, is_active, is_popular, sort_order, created_at, updated_at) VALUES ${values}`);
      for (const v of batch) results.push(`Vehicle: ${v.name} (${v.weightTypical}kg @ ${v.maxSpeed}km/h)`);
    }

    return c.json({ success: true, vehicleTypes: VEHICLE_SEED_DATA.length, results });
  } catch (e: any) {
    console.error("Admin endpoint error:", e);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

// Apply locally-hosted vehicle thumbnails — the Wikimedia CDN rate-limits
// hotlinked fetches from browsers (we saw cards rendering placeholders
// instead of photos in prod). We now ship the 20 licence-safe images
// from scripts/data/vehicle-image-map.json inside the Cloudflare ASSETS
// binding and this endpoint flips each vehicle_types row over to its
// local `/assets/vehicles/<slug>.<ext>` path. Matched by name (unique).
//
// Gated by MIGRATION_TOKEN, same pattern as /admin/apply-install-schema.
app.post("/api/admin/apply-vehicle-thumbnails", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }

  try {
    const mapModule = await import("../scripts/data/vehicle-image-map-local.json");
    const map = (mapModule as any).default || mapModule;
    const entries: Array<{ name: string; localPath: string }> = map.vehicles || [];

    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);
    const updates: Array<{ name: string; localPath: string; rows: number }> = [];

    for (const e of entries) {
      const result = await sqlClient`
        UPDATE vehicle_types
        SET thumbnail_url = ${e.localPath}, updated_at = now()
        WHERE name = ${e.name}
        RETURNING id
      `;
      updates.push({ name: e.name, localPath: e.localPath, rows: (result as any[]).length });
    }

    return c.json({
      ok: true,
      total: entries.length,
      updated: updates.filter((u) => u.rows > 0).length,
      notMatched: updates.filter((u) => u.rows === 0).map((u) => u.name),
      updates,
    });
  } catch (e: any) {
    console.error("apply-vehicle-thumbnails failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Cart → Project link: adds cart_items.project_id (nullable FK to
// projects.id with ON DELETE SET NULL so deleting a project doesn't
// cascade-wipe its cart history), creates a supporting index, and
// backfills existing rows from each owner's users.active_project_id
// (only where the user has one — orphans with NULL project_id stay
// visible to their owner as legacy items).
//
// Idempotent; re-running converges. Gated by MIGRATION_TOKEN, same
// pattern as /admin/apply-install-schema.
app.post("/api/admin/apply-cart-project-link", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }

  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }

  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    // Column probe: was the FK already present before this run?
    const preCols = await sqlClient`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'cart_items' AND column_name = 'project_id'
    `;
    const existedBefore = (preCols as any[]).length > 0;

    await sqlClient`
      ALTER TABLE cart_items
      ADD COLUMN IF NOT EXISTS project_id VARCHAR
      REFERENCES projects(id) ON DELETE SET NULL
    `;

    // Index probe.
    const preIdx = await sqlClient`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'cart_items' AND indexname = 'cart_items_project_idx'
    `;
    const indexExistedBefore = (preIdx as any[]).length > 0;

    await sqlClient`
      CREATE INDEX IF NOT EXISTS cart_items_project_idx ON cart_items(project_id)
    `;

    // Backfill: assign each existing cart row the owner's currently-
    // active project, only where project_id IS NULL and the user has
    // one. Users without an active_project_id keep NULL (orphans).
    const backfillResult = await sqlClient`
      UPDATE cart_items ci
      SET project_id = u.active_project_id
      FROM users u
      WHERE ci.user_id = u.id
        AND ci.project_id IS NULL
        AND u.active_project_id IS NOT NULL
      RETURNING ci.id
    `;
    const backfilled = (backfillResult as any[]).length;

    return c.json({
      ok: true,
      altered: existedBefore ? 0 : 1,
      indexed: indexExistedBefore ? 0 : 1,
      backfilled,
    });
  } catch (e: any) {
    console.error("apply-cart-project-link failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Layout Drawings → Project link: adds layout_drawings.project_id
// (nullable FK to projects.id with ON DELETE SET NULL so deleting a
// project doesn't cascade-wipe its drawing history), creates a
// supporting index, and backfills existing rows from each owner's
// users.active_project_id (only where the user has one — orphans with
// NULL project_id stay visible to their owner as legacy drawings).
//
// Markups inherit project scoping via their parent drawing FK, so
// no parallel column is added to layout_markups.
//
// Idempotent; re-running converges. Gated by MIGRATION_TOKEN, same
// pattern as /admin/apply-cart-project-link.
app.post("/api/admin/apply-layout-project-link", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }

  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }

  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    // Column probe: was the FK already present before this run?
    const preCols = await sqlClient`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'layout_drawings' AND column_name = 'project_id'
    `;
    const existedBefore = (preCols as any[]).length > 0;

    await sqlClient`
      ALTER TABLE layout_drawings
      ADD COLUMN IF NOT EXISTS project_id VARCHAR
      REFERENCES projects(id) ON DELETE SET NULL
    `;

    // Index probe.
    const preIdx = await sqlClient`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'layout_drawings' AND indexname = 'layout_drawings_project_idx'
    `;
    const indexExistedBefore = (preIdx as any[]).length > 0;

    await sqlClient`
      CREATE INDEX IF NOT EXISTS layout_drawings_project_idx ON layout_drawings(project_id)
    `;

    // Backfill: assign each existing drawing row the owner's currently-
    // active project, only where project_id IS NULL and the user has
    // one. Users without an active_project_id keep NULL (orphans).
    const backfillResult = await sqlClient`
      UPDATE layout_drawings ld
      SET project_id = u.active_project_id
      FROM users u
      WHERE ld.user_id = u.id
        AND ld.project_id IS NULL
        AND u.active_project_id IS NOT NULL
      RETURNING ld.id
    `;
    const backfilled = (backfillResult as any[]).length;

    return c.json({
      ok: true,
      altered: existedBefore ? 0 : 1,
      indexed: indexExistedBefore ? 0 : 1,
      backfilled,
    });
  } catch (e: any) {
    console.error("apply-layout-project-link failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Apply impact rating corrections from the verification report.
// Reads the bundled patch file at build time and runs targeted UPDATEs
// on the products table for entries where the live asafe.com page
// differed from the catalog value. Idempotent — re-running applies the
// same values, no-op if already up to date.
//
// Gated by MIGRATION_TOKEN (bearer). Matches by products.name ILIKE
// familyName, since the catalog uses the family name which is what's
// stored in the products.name column.
app.post("/api/admin/apply-impact-corrections", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }

  try {
    // Dynamic import so builds succeed even if the patch file hasn't
    // been generated yet (first deploy after scaffolding this endpoint).
    //
    // ?source=cert loads cert-impact-patch.json (authoritative PAS 13 /
    // EN test certificates); default loads impact-verification-patch.json
    // (catalog vs live-page reconciliation).
    const source = c.req.query("source") || "default";
    let patchData: any;
    try {
      if (source === "cert") {
        patchData = (await import("../scripts/data/cert-impact-patch.json")).default || (await import("../scripts/data/cert-impact-patch.json"));
      } else {
        patchData = (await import("../scripts/data/impact-verification-patch.json")).default || (await import("../scripts/data/impact-verification-patch.json"));
      }
    } catch {
      return c.json({
        ok: false,
        message: "No patch file bundled — run scripts/mergeImpactVerification.ts first.",
      }, 404);
    }

    const patches: Array<{
      familyName: string;
      productUrl: string;
      status: string;
      currentValue: number | null;
      newValue: number | null;
      pas13Certified: boolean | null;
      pas13Method: string | null;
    }> = patchData.patches || [];

    if (patches.length === 0) {
      return c.json({ ok: true, applied: 0, message: "No corrections in patch file." });
    }

    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);
    const applied: Array<{ familyName: string; matched: number; newValue: number | null }> = [];
    const notMatched: string[] = [];

    // Pre-index DB products by canonical name so we can fuzzy-match patch
    // familyName → DB id via matchByNameVariants. Falls back through the
    // historical aggressive normaliser so no previously-matching patch
    // regresses (only additions).
    const dbRows = (await sqlClient`SELECT id, name FROM products`) as Array<{
      id: string;
      name: string;
    }>;
    const byCanonical = new Map<string, { id: string; name: string }>();
    for (const row of dbRows) {
      const k = normaliseCanonical(row.name);
      if (k && !byCanonical.has(k)) byCanonical.set(k, row);
    }

    for (const p of patches) {
      // Try exact name match first, then ILIKE with the family name.
      // Keep updates narrow — only overwrite impactRating + pas13 bits
      // that we're confident about from the live page.
      const sets: string[] = [];
      const params: any[] = [];

      if (p.newValue != null) {
        sets.push("impact_rating = $" + (params.length + 1));
        params.push(p.newValue);
      }
      if (p.pas13Certified != null) {
        sets.push("pas_13_compliant = $" + (params.length + 1));
        params.push(p.pas13Certified);
      }
      if (p.pas13Method) {
        sets.push("pas_13_test_method = $" + (params.length + 1));
        params.push(p.pas13Method);
      }
      if (p.newValue != null) {
        sets.push("pas_13_test_joules = $" + (params.length + 1));
        params.push(p.newValue);
      }
      sets.push("updated_at = now()");

      if (sets.length <= 1) continue; // nothing to update

      // Primary path: exact case-insensitive match (preserves historical
      // behaviour). If it misses, fall through to matchByNameVariants
      // (canonical → strip-trailing → aggressive → substring).
      const nameIdx = params.length + 1;
      const paramsExact = [...params, p.familyName];
      let res = (await sqlClient(
        `UPDATE products SET ${sets.join(", ")} WHERE lower(name) = lower($${nameIdx}) RETURNING id`,
        paramsExact,
      )) as any[];

      if (res.length === 0) {
        const hit = matchByNameVariants(p.familyName, byCanonical);
        if (hit) {
          const fuzzyIdx = params.length + 1;
          const paramsFuzzy = [...params, hit.id];
          res = (await sqlClient(
            `UPDATE products SET ${sets.join(", ")} WHERE id = $${fuzzyIdx} RETURNING id`,
            paramsFuzzy,
          )) as any[];
        }
      }

      if (res.length === 0) {
        notMatched.push(p.familyName);
      } else {
        applied.push({ familyName: p.familyName, matched: res.length, newValue: p.newValue });
      }
    }

    return c.json({
      ok: true,
      totalPatches: patches.length,
      applied: applied.length,
      notMatched,
      details: applied,
    });
  } catch (e: any) {
    console.error("apply-impact-corrections failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Sync catalog → DB for impact rating + PAS 13 fields.
//
// The products table has drifted from scripts/data/asafe-catalog.json
// (which we've since verified matches asafe.com). Some DB rows have
// 2x or 1.47x the correct Joule value — likely a historical double-
// apply. This endpoint pulls the catalog in and writes catalog values
// onto the matching product rows. Matching is fuzzy on name
// (normalizes "+" vs "plus", drops "barrier/rail" filler words,
// swaps "CS " prefix ↔ " Cold Storage" suffix).
//
// Idempotent; re-running produces no further changes once converged.
// Gated by MIGRATION_TOKEN, same pattern as the other admin one-offs.
app.post("/api/admin/sync-catalog-to-db", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }

  try {
    const catalogModule: any = await import("../scripts/data/asafe-catalog.json");
    const catalog = catalogModule.default || catalogModule;
    const catalogProducts: any[] = Array.isArray(catalog)
      ? catalog
      : catalog.products || [];

    // Build catalog index by canonical name (conservative) + URL slug
    // fallback. matchByNameVariants handles "+"/"plus", CS/cold-storage,
    // trailing-filler-strip, and the historical aggressive normaliser as
    // fallback — see shared/nameNormalise.ts.
    const catByKey = new Map<string, any>();
    for (const p of catalogProducts) {
      const k = normaliseCanonical(p.familyName);
      if (k && !catByKey.has(k)) catByKey.set(k, p);
      if (p.productUrl) {
        const slug = String(p.productUrl)
          .replace(/\/$/, "")
          .split("/")
          .pop()
          ?.replace(/-/g, " ");
        const slugKey = normaliseCanonical(slug || "");
        if (slugKey && !catByKey.has(slugKey)) catByKey.set(slugKey, p);
      }
    }

    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);
    const dbProducts = (await sqlClient`
      SELECT id, name, impact_rating, pas_13_compliant, pas_13_test_method, pas_13_test_joules
      FROM products
    `) as any[];

    const updates: any[] = [];
    const unmatched: Array<{ id: string; name: string }> = [];
    const alreadyOk: Array<{ id: string; name: string }> = [];

    for (const p of dbProducts) {
      const cat = matchByNameVariants(p.name, catByKey);
      if (!cat) {
        unmatched.push({ id: p.id, name: p.name });
        continue;
      }
      const catRating = cat.impactRating ?? null;
      const catMethod = (cat.pas13 || {}).method ?? null;
      const catCertified =
        (cat.pas13 || {}).certified != null ? !!(cat.pas13 || {}).certified : null;

      // Only touch fields where the catalog has a definitive value AND
      // the DB differs. Never blank-out an existing DB value just
      // because the catalog is ambiguous.
      const changes: Record<string, any> = {};
      if (catRating != null && catRating !== p.impact_rating) {
        changes.impact_rating = catRating;
      }
      if (catRating != null && catRating !== p.pas_13_test_joules) {
        changes.pas_13_test_joules = catRating;
      }
      if (catCertified != null && catCertified !== p.pas_13_compliant) {
        changes.pas_13_compliant = catCertified;
      }
      if (catMethod && catMethod !== p.pas_13_test_method) {
        changes.pas_13_test_method = catMethod;
      }

      if (Object.keys(changes).length === 0) {
        alreadyOk.push({ id: p.id, name: p.name });
        continue;
      }

      const setFragments: string[] = [];
      const params: any[] = [];
      for (const [col, val] of Object.entries(changes)) {
        setFragments.push(`${col} = $${params.length + 1}`);
        params.push(val);
      }
      setFragments.push("updated_at = now()");
      params.push(p.id);
      const q = `UPDATE products SET ${setFragments.join(", ")} WHERE id = $${params.length}`;
      await sqlClient(q, params);
      updates.push({
        id: p.id,
        name: p.name,
        catalogFamilyName: cat.familyName,
        changes,
      });
    }

    return c.json({
      ok: true,
      summary: {
        db_total: dbProducts.length,
        updated: updates.length,
        already_ok: alreadyOk.length,
        unmatched: unmatched.length,
      },
      updates,
      unmatched,
    });
  } catch (e: any) {
    console.error("sync-catalog-to-db failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
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

// Seed the `resources` table with the 10 A-SAFE PAS 13 / EN test certificate
// PDFs pre-uploaded to R2 at `certificates/<slug>.pdf`. One resources row per
// certificate plus one `product_resources` junction row per linked product
// family (looked up by name — same fuzzy-normalise pattern as
// /admin/sync-catalog-to-db). Idempotent: matched by a composite
// (title, resource_type) so re-running is a no-op.
//
// Gated by MIGRATION_TOKEN (bearer), same pattern as the sibling one-offs.
app.post("/api/admin/upload-certificates", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }

  try {
    const manifestModule: any = await import(
      "../scripts/data/certificate-manifest.json"
    );
    const manifest = manifestModule.default || manifestModule;
    const certs: Array<{
      slug: string;
      title: string;
      description: string;
      fileSize: number;
      productFamilies: string[];
      productMatchHints: string[];
    }> = manifest.certificates || [];

    const resourceType: string = manifest.resourceType || "Certificate";
    const category: string = manifest.resourceCategory || "Safety Standards";
    const thumbnailUrl: string | null = manifest.thumbnailUrl || null;
    const urlPattern: string =
      manifest.publicUrlPattern || "/api/certificates/{slug}.pdf";

    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    // Pull every product name → uuid so we can resolve match hints without
    // N round-trips per cert. `products.name` is unique.
    const dbProducts = (await sqlClient`
      SELECT id, name
      FROM products
    `) as any[];

    // Two indexes: exact-id for when the manifest supplies a `family-*`
    // slug (derived from name via the public-API convention), and
    // normalised-name (canonical) for fuzzy hints — matchByNameVariants
    // handles "+"/"plus", CS ↔ cold storage, trailing-filler-strip, and
    // the historical aggressive fallback (shared/nameNormalise.ts).
    const byFamilyId = new Map<string, any>();
    const byNormName = new Map<string, any>();
    for (const p of dbProducts) {
      const familyId = `family-${String(p.name).replace(/\s+/g, "-").toLowerCase()}`;
      byFamilyId.set(familyId, p);
      const nk = normaliseCanonical(p.name);
      if (nk && !byNormName.has(nk)) byNormName.set(nk, p);
    }

    const inserted: Array<{
      slug: string;
      resourceId: string;
      linkedProducts: string[];
      unmatched: string[];
    }> = [];
    const skipped: Array<{ slug: string; reason: string }> = [];

    for (const cert of certs) {
      const fileUrl = urlPattern.replace("{slug}", cert.slug);

      // Idempotency: does a resource with this title + type already exist?
      const existing = (await sqlClient`
        SELECT id
        FROM resources
        WHERE title = ${cert.title} AND resource_type = ${resourceType}
        LIMIT 1
      `) as any[];

      let resourceId: string;
      if (existing.length > 0) {
        resourceId = existing[0].id;
        // Keep description/url in sync in case the manifest was tweaked —
        // but only rewrite if the fileUrl actually changed (cheap no-op
        // otherwise).
        await sqlClient`
          UPDATE resources
          SET description = ${cert.description},
              file_url = ${fileUrl},
              file_size = ${cert.fileSize},
              file_type = 'pdf',
              category = ${category},
              thumbnail_url = ${thumbnailUrl},
              is_active = true,
              updated_at = now()
          WHERE id = ${resourceId}
        `;
        skipped.push({ slug: cert.slug, reason: "already existed; refreshed metadata" });
      } else {
        const rows = (await sqlClient`
          INSERT INTO resources (
            title, category, resource_type, description,
            file_url, thumbnail_url, file_size, file_type,
            download_count, is_active, created_at, updated_at
          ) VALUES (
            ${cert.title}, ${category}, ${resourceType}, ${cert.description},
            ${fileUrl}, ${thumbnailUrl}, ${cert.fileSize}, 'pdf',
            0, true, now(), now()
          )
          RETURNING id
        `) as any[];
        resourceId = rows[0].id;
      }

      // Link each matched product family via product_resources. Resolve
      // via explicit family-* id first, then fall back to fuzzy name hints.
      const linked = new Set<string>();
      const unmatched: string[] = [];

      const candidateKeys: string[] = [
        ...(cert.productFamilies || []),
        ...(cert.productMatchHints || []),
      ];

      for (const key of candidateKeys) {
        let product: any | undefined =
          byFamilyId.get(key) ||
          matchByNameVariants(key, byNormName) ||
          undefined;
        if (!product) {
          // Try key as a hint even if it looks like a family id
          const stripped = key.replace(/^family-/, "").replace(/-/g, " ");
          product = matchByNameVariants(stripped, byNormName) || undefined;
        }
        if (!product) {
          unmatched.push(key);
          continue;
        }
        if (linked.has(product.id)) continue;
        linked.add(product.id);
        // ON CONFLICT DO NOTHING — the junction has a unique(product_id,
        // resource_id) constraint so double-runs converge.
        await sqlClient`
          INSERT INTO product_resources (product_id, resource_id)
          VALUES (${product.id}, ${resourceId})
          ON CONFLICT (product_id, resource_id) DO NOTHING
        `;
      }

      inserted.push({
        slug: cert.slug,
        resourceId,
        linkedProducts: Array.from(linked),
        unmatched,
      });
    }

    return c.json({
      ok: true,
      inserted: inserted.length,
      bucket: manifest.bucket,
      publicUrlPattern: urlPattern,
      resourceType,
      category,
      results: inserted,
      skipped,
    });
  } catch (e: any) {
    console.error("upload-certificates failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// One-off: normalise `pricing_logic` on barrier families that were tagged
// with a legacy synonym (per_meter) so the Add-to-Cart UI exposes a total
// linear-metre input (QuoteBuilderPanel keys off per_length). The patch
// entries are canonicalised in scripts/data/barrier-pricing-fix.json.
// Gated by MIGRATION_TOKEN (bearer); idempotent — running it twice is a
// no-op because updates converge on the target pricing_logic.
app.post("/api/admin/fix-barrier-pricing", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }

  try {
    const patchModule: any = await import(
      "../scripts/data/barrier-pricing-fix.json"
    );
    const patch = patchModule.default || patchModule;
    const updatesList: Array<{
      id: string;
      name: string;
      current_pricingType: string;
      correct_pricingType: string;
    }> = patch.updates || [];

    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    const updated: Array<{
      id: string;
      name: string;
      from: string | null;
      to: string;
    }> = [];
    const unmatched: Array<{ id: string; name: string }> = [];

    for (const entry of updatesList) {
      // Match by exact name — the /api/products surface exposes a
      // synthetic `family-*` slug as `id`, but the real DB primary key is
      // a UUID. Name is the stable public handle shared between the
      // patch JSON and the DB, and it's unique on products.
      const rows = (await sqlClient`
        SELECT id, name, pricing_logic
        FROM products
        WHERE name = ${entry.name}
      `) as any[];
      if (!rows.length) {
        unmatched.push({ id: entry.id, name: entry.name });
        continue;
      }
      const row = rows[0];
      await sqlClient(
        `UPDATE products SET pricing_logic = $1, updated_at = now() WHERE id = $2`,
        [entry.correct_pricingType, row.id],
      );
      updated.push({
        id: row.id,
        name: row.name,
        from: row.pricing_logic,
        to: entry.correct_pricingType,
      });
    }

    return c.json({ ok: true, updated, unmatched });
  } catch (e: any) {
    console.error("fix-barrier-pricing failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Seed resources — populates resources table with A-SAFE technical docs, videos, guides
app.get("/api/admin/seed-resources", authMiddleware, async (c) => {
  if (!(await requireAdmin(c))) return c.json({ message: "Admin access required" }, 403);
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);
    const results: string[] = [];

    const force = c.req.query("force") === "true";

    if (force) {
      await sqlClient`DELETE FROM resources WHERE true`;
    } else {
      const existing = await sqlClient`SELECT count(*) as cnt FROM resources WHERE is_active = true`;
      if (parseInt(existing[0].cnt) >= 5) {
        return c.json({ message: `Resources already seeded (${existing[0].cnt} active). Use ?force=true to reseed.`, skipped: true });
      }
      await sqlClient`DELETE FROM resources WHERE true`;
    }

    const RESOURCE_SEED_DATA = [
      // ─── PAS 13 Video Series (from A-SAFE website) ───
      { title: "PAS 13 Video Series: Complete Playlist", category: "Safety Standards", resourceType: "Video", description: "Complete PAS 13 video series covering the internationally recognized code of practice for industrial safety barriers, crash testing methodology, and compliance requirements.", fileUrl: "https://www.youtube.com/playlist?list=PL0sD7WA0DgAPFKBTUeHfMIIWYI0z6KEXn", thumbnailUrl: "https://webcdn.asafe.com/media/4250/atlas-double-traffic-barrier-ramp.jpg", fileType: "video" },
      { title: "A-SAFE Discovery Video Series", category: "Company", resourceType: "Video", description: "Discover A-SAFE's manufacturing facility, innovation processes, and the people behind the world's leading safety barrier technology.", fileUrl: "https://www.youtube.com/playlist?list=PL0sD7WA0DgAMH7v-4ujH3m9CABJvNYRCS", thumbnailUrl: "https://webcdn.asafe.com/media/lthn25rg/190_monoplex_bollard_product_image-7-min.jpg", fileType: "video" },

      // ─── Installation Videos (verified YouTube IDs from A-SAFE website) ───
      { title: "iFlex Single Traffic Barrier - Installation Guide", category: "Traffic Barriers", resourceType: "Installation Video", description: "Step-by-step installation video for the iFlex Single Traffic Barrier. Covers floor preparation, anchor bolt installation, barrier assembly, and post-installation checks.", fileUrl: "https://www.youtube.com/watch?v=18zWfav5lKs", thumbnailUrl: "https://webcdn.asafe.com/media/4240/iflex-single-traffic-barrier-ramp.jpg", fileType: "video" },
      { title: "iFlex Double Traffic Barrier - Installation Guide", category: "Traffic Barriers", resourceType: "Installation Video", description: "Complete installation guide for the iFlex Double Traffic Barrier including component identification, fixing procedures, and alignment checks.", fileUrl: "https://www.youtube.com/watch?v=23gTgR_mjHQ", thumbnailUrl: "https://webcdn.asafe.com/media/4248/iflex-double-traffic-barrier-ramp.jpg", fileType: "video" },
      { title: "Atlas Double Traffic Barrier - Installation Guide", category: "Traffic Barriers", resourceType: "Installation Video", description: "Installation video for A-SAFE's heaviest-duty Atlas Double Traffic Barrier. Heavy-duty fixing procedures and assembly for maximum impact protection.", fileUrl: "https://www.youtube.com/watch?v=n3gAC_P3mms", thumbnailUrl: "https://webcdn.asafe.com/media/4250/atlas-double-traffic-barrier-ramp.jpg", fileType: "video" },
      { title: "iFlex Single Traffic Barrier+ - Installation Guide", category: "Traffic Barriers", resourceType: "Installation Video", description: "Installation guide for the iFlex Single Traffic Barrier+ with integrated handrail. Covers barrier and handrail assembly for pedestrian protection.", fileUrl: "https://www.youtube.com/watch?v=zDZoDYyvYBs", thumbnailUrl: "https://webcdn.asafe.com/media/4255/iflex-single-traffic-barrierplus-ramp.jpg", fileType: "video" },
      { title: "iFlex Double Traffic Barrier+ - Installation Guide", category: "Traffic Barriers", resourceType: "Installation Video", description: "Complete installation video for the iFlex Double Traffic Barrier+ with pedestrian handrail integration.", fileUrl: "https://www.youtube.com/watch?v=Uxgo-YkNxsY", thumbnailUrl: "https://webcdn.asafe.com/media/4256/iflex-double-barrierplus-ramp.jpg", fileType: "video" },
      { title: "mFlex Single Traffic Barrier - Installation Guide", category: "Traffic Barriers", resourceType: "Installation Video", description: "Installation guide for the mFlex micro single traffic barrier designed for lighter-duty applications.", fileUrl: "https://www.youtube.com/watch?v=xbRReGmSf2A", thumbnailUrl: "https://webcdn.asafe.com/media/4235/mflex-single-traffic-ramp.jpg", fileType: "video" },
      { title: "mFlex Double Traffic Barrier - Installation Guide", category: "Traffic Barriers", resourceType: "Installation Video", description: "Installation guide for the mFlex micro double traffic barrier for pedestrian and light vehicle environments.", fileUrl: "https://www.youtube.com/watch?v=2ww3-Q_Ocv0", thumbnailUrl: "https://webcdn.asafe.com/media/4244/mflex-double-traffic-ramp.jpg", fileType: "video" },
      { title: "eFlex Single Traffic Barrier - Installation Guide", category: "Traffic Barriers", resourceType: "Installation Video", description: "Step-by-step installation for the eFlex Single Traffic Barrier. Lightweight, efficient barrier assembly for rack protection environments.", fileUrl: "https://www.youtube.com/watch?v=emzIVpZ3pNI", thumbnailUrl: "https://webcdn.asafe.com/media/4238/eflex-single-traffic-barrier.jpg", fileType: "video" },
      { title: "eFlex Single Traffic Barrier+ - Installation Guide", category: "Traffic Barriers", resourceType: "Installation Video", description: "Installation guide for the eFlex Single Traffic Barrier+ with handrail for pedestrian walkway segregation.", fileUrl: "https://www.youtube.com/watch?v=y8yKLrPsInE", thumbnailUrl: "https://webcdn.asafe.com/media/4253/eflex-single-trafficplus-ramp.jpg", fileType: "video" },
      { title: "Atlas Double Traffic Barrier+ - Installation Guide", category: "Traffic Barriers", resourceType: "Installation Video", description: "Installation video for the heavy-duty Atlas Double Traffic Barrier+ with pedestrian handrail.", fileUrl: "https://www.youtube.com/watch?v=ngdfH3Y40Lc", thumbnailUrl: "https://webcdn.asafe.com/media/4259/atlas-double-traffic-barrierplus-ramp.jpg", fileType: "video" },
      { title: "eFlex Single Rack End Barrier - Installation Guide", category: "Rack Protection", resourceType: "Installation Video", description: "Installation guide for the eFlex Single Rack End Barrier. Protect racking uprights from forklift impacts.", fileUrl: "https://www.youtube.com/watch?v=BfEEZiLJJYk", thumbnailUrl: "https://webcdn.asafe.com/media/4266/eflex-single-rackend-ramp.jpg", fileType: "video" },
      { title: "eFlex Double Rack End Barrier - Installation Guide", category: "Rack Protection", resourceType: "Installation Video", description: "Installation video for the eFlex Double Rack End Barrier providing enhanced racking protection.", fileUrl: "https://www.youtube.com/watch?v=D5u2988AWmY", thumbnailUrl: "https://webcdn.asafe.com/media/4268/eflex-double-rackend-ramp.jpg", fileType: "video" },
      { title: "iFlex Single Rack End Barrier - Installation Guide", category: "Rack Protection", resourceType: "Installation Video", description: "Installation guide for the iFlex Single Rack End Barrier — heavy-duty racking protection.", fileUrl: "https://www.youtube.com/watch?v=KWHXVONtW2E", thumbnailUrl: "https://webcdn.asafe.com/media/4269/iflex-single-rackend-barrier-ramp.jpg", fileType: "video" },
      { title: "RackGuard - Installation Guide", category: "Rack Protection", resourceType: "Installation Video", description: "Installation video for the iFlex RackGuard rack leg protector. Direct protection for individual racking uprights.", fileUrl: "https://www.youtube.com/watch?v=Tci9UQGyNtc", thumbnailUrl: "https://webcdn.asafe.com/media/4271/rackguard-drop-test.jpg", fileType: "video" },
      { title: "FlexiShield Column Guard - Installation Guide", category: "Column Protection", resourceType: "Installation Video", description: "Installation guide for the FlexiShield wraparound column guard. Protect structural columns from vehicle impacts.", fileUrl: "https://www.youtube.com/watch?v=9uDOyduwrHY", thumbnailUrl: "https://webcdn.asafe.com/media/4263/flexishield-column-guard-ramp.jpg", fileType: "video" },
      { title: "FlexiShield Corner Guard - Installation Guide", category: "Column Protection", resourceType: "Installation Video", description: "Installation video for the FlexiShield Corner Guard protecting building corners and wall edges.", fileUrl: "https://www.youtube.com/watch?v=lhT8Jotkkfw", thumbnailUrl: "https://webcdn.asafe.com/media/5353/flexishieldcornerguard_qtr1156x556.jpg", fileType: "video" },
      { title: "iFlex Bollard - Installation Guide", category: "Bollards", resourceType: "Installation Video", description: "Installation guide for the standard iFlex Bollard. Quick anchor-bolt installation for pedestrian and infrastructure protection.", fileUrl: "https://www.youtube.com/watch?v=C7nwQzrVQRo", thumbnailUrl: "https://webcdn.asafe.com/media/5621/iflexbollard_190_1200_front277x130.jpg", fileType: "video" },
      { title: "iFlex Heavy Duty Bollard - Installation Guide", category: "Bollards", resourceType: "Installation Video", description: "Installation video for the iFlex Heavy Duty Bollard designed for high-impact environments.", fileUrl: "https://www.youtube.com/watch?v=w16XfYC1KyQ", thumbnailUrl: "https://webcdn.asafe.com/media/6092/iflexheavydutybollard__front277x130.jpg", fileType: "video" },
      { title: "ForkGuard Kerb Barrier - Installation Guide", category: "Kerb Barriers", resourceType: "Installation Video", description: "Step-by-step installation for the ForkGuard Kerb Barrier. Low-level traffic guidance and lane definition.", fileUrl: "https://www.youtube.com/watch?v=Gh_EDkZj4no", thumbnailUrl: "https://webcdn.asafe.com/media/0lkhom3p/forkguard_qutr1.jpg", fileType: "video" },
      { title: "HD ForkGuard Kerb Barrier - Installation Guide", category: "Kerb Barriers", resourceType: "Installation Video", description: "Installation guide for the Heavy Duty ForkGuard Kerb Barrier for high-traffic environments.", fileUrl: "https://www.youtube.com/watch?v=OlTNKLt715c", thumbnailUrl: "https://webcdn.asafe.com/media/2hljhqtr/forkguard_insitu_1.jpg", fileType: "video" },
      { title: "iFlex Swing Gate (Short) - Installation Guide", category: "Gates & Access", resourceType: "Installation Video", description: "Installation video for the iFlex hydraulic self-closing swing gate. Controlled access within barrier runs.", fileUrl: "https://www.youtube.com/watch?v=fLU6S59nruQ", thumbnailUrl: "https://webcdn.asafe.com/media/2974/iflex-swinggate_short_qu.jpg", fileType: "video" },
      { title: "Traffic Gate - Installation Guide", category: "Gates & Access", resourceType: "Installation Video", description: "Installation guide for the A-SAFE Traffic Gate providing wide vehicle access within barrier systems.", fileUrl: "https://www.youtube.com/watch?v=cFPXTroPu_k", thumbnailUrl: "https://webcdn.asafe.com/media/wl1debok/traffic_gate_2_1156x556.jpg", fileType: "video" },
      { title: "iFlex Height Restrictor - Installation Guide", category: "Height Restrictors", resourceType: "Installation Video", description: "Installation video for the iFlex Height Restrictor. Protect overhead assets and low-clearance areas.", fileUrl: "https://www.youtube.com/watch?v=i3E-Ls1u2aI", thumbnailUrl: "https://webcdn.asafe.com/media/5679/iflexheightrestrictsitu1156x556_03.jpg", fileType: "video" },
      { title: "Step Guard - Installation Guide", category: "Pedestrian Safety", resourceType: "Installation Video", description: "Installation guide for the A-SAFE Step Guard pedestrian crossing point within barrier runs.", fileUrl: "https://www.youtube.com/watch?v=l_6MZQLY0bI", thumbnailUrl: "https://webcdn.asafe.com/media/11977/product_image_2_qutr_578x278.jpg", fileType: "video" },
      { title: "Alarm Bar - Installation Guide", category: "Accessories", resourceType: "Installation Video", description: "Installation video for the A-SAFE Alarm Bar — audible alert system for barrier impacts.", fileUrl: "https://www.youtube.com/watch?v=7m29wBJwQbU", thumbnailUrl: "https://webcdn.asafe.com/media/4871/alarmbar_qtr.jpg", fileType: "video" },
      { title: "Slider Plate - Installation Guide", category: "Accessories", resourceType: "Installation Video", description: "Installation guide for A-SAFE Slider Plates allowing tool-free barrier removal for maintenance access.", fileUrl: "https://www.youtube.com/watch?v=f50qFr0naMY", thumbnailUrl: "https://webcdn.asafe.com/media/3580/sliderplates_158_front.jpg", fileType: "video" },

      // ─── Technical Datasheets ───
      { title: "iFlex Single Traffic Barrier - Technical Datasheet", category: "Traffic Barriers", resourceType: "Technical Datasheet", description: "Complete technical specifications including dimensions, impact ratings, fixings, and installation requirements.", fileUrl: "https://www.asafe.com/en-gb/products/iflex-single-traffic-barrier/", thumbnailUrl: "https://webcdn.asafe.com/media/4240/iflex-single-traffic-barrier-ramp.jpg", fileType: "pdf" },
      { title: "iFlex Double Traffic Barrier - Technical Datasheet", category: "Traffic Barriers", resourceType: "Technical Datasheet", description: "Complete specifications for the iFlex Double Traffic Barrier including dimensions, impact ratings, and fixings.", fileUrl: "https://www.asafe.com/en-gb/products/iflex-double-traffic-barrier/", thumbnailUrl: "https://webcdn.asafe.com/media/4248/iflex-double-traffic-barrier-ramp.jpg", fileType: "pdf" },
      { title: "Atlas Double Traffic Barrier - Technical Datasheet", category: "Traffic Barriers", resourceType: "Technical Datasheet", description: "Full specifications for A-SAFE's heaviest-duty barrier. Impact ratings, dimensions, and engineering data.", fileUrl: "https://www.asafe.com/en-gb/products/atlas-double-traffic-barrier/", thumbnailUrl: "https://webcdn.asafe.com/media/4250/atlas-double-traffic-barrier-ramp.jpg", fileType: "pdf" },
      { title: "eFlex Single Rack End Barrier - Technical Datasheet", category: "Rack Protection", resourceType: "Technical Datasheet", description: "Technical specifications for the eFlex single-rail rack end barrier including impact data and dimensions.", fileUrl: "https://www.asafe.com/en-gb/products/eflex-single-rackend-barrier/", thumbnailUrl: "https://webcdn.asafe.com/media/4266/eflex-single-rackend-ramp.jpg", fileType: "pdf" },
      { title: "FlexiShield Column Guard - Technical Datasheet", category: "Column Protection", resourceType: "Technical Datasheet", description: "Specifications for the FlexiShield column guard including wrap-around dimensions and material data.", fileUrl: "https://www.asafe.com/en-gb/products/flexishield-column-guard/", thumbnailUrl: "https://webcdn.asafe.com/media/4263/flexishield-column-guard-ramp.jpg", fileType: "pdf" },
      { title: "Bollard Range - Technical Datasheet", category: "Bollards", resourceType: "Technical Datasheet", description: "Technical specifications for the complete A-SAFE bollard range including standard, heavy-duty, and Monoplex.", fileUrl: "https://www.asafe.com/en-gb/products/iflex-bollard/", thumbnailUrl: "https://webcdn.asafe.com/media/6386/iflex-heavy-duty-bollard-ramp-test.jpg", fileType: "pdf" },
      { title: "ForkGuard Kerb Barrier - Technical Datasheet", category: "Kerb Barriers", resourceType: "Technical Datasheet", description: "Full specifications for the ForkGuard kerb barrier including standard and HD variants.", fileUrl: "https://www.asafe.com/en-gb/products/forkguard-kerb-barrier/", thumbnailUrl: "https://webcdn.asafe.com/media/6382/iflex-forkguard-ramp-test.jpg", fileType: "pdf" },

      // ─── Safety Certificates ───
      { title: "PAS 13 Compliance Certificate", category: "Safety Standards", resourceType: "Certificate", description: "Official PAS 13 compliance certification. Independently verified crash test results and performance classifications.", fileUrl: "https://www.asafe.com/en-gb/pas-13/", thumbnailUrl: "https://webcdn.asafe.com/media/4250/atlas-double-traffic-barrier-ramp.jpg", fileType: "pdf" },
      { title: "ISO 9001 Quality Management Certificate", category: "Safety Standards", resourceType: "Certificate", description: "ISO 9001 quality management system certification for consistent product quality.", fileUrl: "https://www.asafe.com/en-gb/about-a-safe/", thumbnailUrl: "https://webcdn.asafe.com/media/lthn25rg/190_monoplex_bollard_product_image-7-min.jpg", fileType: "pdf" },
      { title: "ISO 14001 Environmental Management Certificate", category: "Safety Standards", resourceType: "Certificate", description: "Environmental management certification confirming sustainable manufacturing and recyclable products.", fileUrl: "https://www.asafe.com/en-gb/about-a-safe/", thumbnailUrl: "https://webcdn.asafe.com/media/5621/iflexbollard_190_1200_front277x130.jpg", fileType: "pdf" },

      // ─── Industry Application Guides ───
      { title: "Warehouse & Distribution Centre Safety Guide", category: "Applications", resourceType: "Application Guide", description: "Complete barrier planning guide for warehouses. Traffic management, pedestrian segregation, and racking protection.", fileUrl: "https://www.asafe.com/en-gb/industries/warehousing-distribution/", thumbnailUrl: "https://webcdn.asafe.com/media/10497/dsv_header_loading_doors-min.jpg", fileType: "pdf" },
      { title: "Manufacturing Facility Protection Guide", category: "Applications", resourceType: "Application Guide", description: "Barrier solutions for manufacturing: machinery protection, production line segregation, traffic management.", fileUrl: "https://www.asafe.com/en-gb/industries/manufacturing/", thumbnailUrl: "https://webcdn.asafe.com/media/3459/bosch_3000x1200.jpg", fileType: "pdf" },
      { title: "Food & Beverage Industry Safety Guide", category: "Applications", resourceType: "Application Guide", description: "Hygiene-compliant barrier solutions for food and beverage. Chemical-resistant and easy to clean.", fileUrl: "https://www.asafe.com/en-gb/industries/food-drink/", thumbnailUrl: "https://webcdn.asafe.com/media/3465/cocacola_3000x1200.jpg", fileType: "pdf" },
      { title: "Automotive Industry Safety Solutions", category: "Applications", resourceType: "Application Guide", description: "Barrier planning for automotive manufacturing. Production line protection and worker segregation.", fileUrl: "https://www.asafe.com/en-gb/industries/automotive/", thumbnailUrl: "https://webcdn.asafe.com/media/3477/nissan_3000x1400.jpg", fileType: "pdf" },
      { title: "Airport & Aviation Safety Guide", category: "Applications", resourceType: "Application Guide", description: "Safety barriers for airports: baggage handling, aircraft maintenance, and ground traffic management.", fileUrl: "https://www.asafe.com/en-gb/industries/airports/", thumbnailUrl: "https://webcdn.asafe.com/media/3468/heathrow_3000x1200.jpg", fileType: "pdf" },
      { title: "Pharmaceutical & Healthcare Facility Guide", category: "Applications", resourceType: "Application Guide", description: "Clean-room compatible barriers for pharmaceutical facilities. Chemical-resistant polymers for controlled environments.", fileUrl: "https://www.asafe.com/en-gb/industries/health-hygiene/", thumbnailUrl: "https://webcdn.asafe.com/media/3472/johnsonjohnson_3000x1200.jpg", fileType: "pdf" },

      // ─── ROI & Business Resources ───
      { title: "Total Cost of Ownership Calculator Guide", category: "Business", resourceType: "Business Guide", description: "Calculate the true cost of barrier ownership: investment, maintenance, replacement, and downtime. Polymer vs steel.", fileUrl: "https://www.asafe.com/en-gb/pas-13/", thumbnailUrl: "https://webcdn.asafe.com/media/actjmr21/asafe-19-20230124-catoen-natie-0760.jpg", fileType: "pdf" },
      { title: "Safety Investment ROI Guide", category: "Business", resourceType: "Business Guide", description: "Build a business case for safety investment with ROI templates, risk metrics, and insurance analysis.", fileUrl: "https://www.asafe.com/en-gb/about-a-safe/", thumbnailUrl: "https://webcdn.asafe.com/media/8585/drone_sonoco_001.jpg", fileType: "pdf" },

      // ─── Virtual Experiences ───
      { title: "A-SAFE Virtual Product Space", category: "Virtual Tours", resourceType: "Virtual Tour", description: "Explore A-SAFE's complete product range in an immersive 3D virtual environment with interactive scenarios.", fileUrl: "https://www.asafe.com/en-gb/virtual-a-safe/", thumbnailUrl: "https://webcdn.asafe.com/media/9380/a-safe_protection.jpg", fileType: "link" },
      { title: "A-SAFE Factory Virtual Tour", category: "Virtual Tours", resourceType: "Virtual Tour", description: "Immersive virtual tour of A-SAFE's manufacturing facility in Halifax, UK. See how barriers are engineered and produced.", fileUrl: "https://www.asafe.com/en-gb/virtual-a-safe/", thumbnailUrl: "https://webcdn.asafe.com/media/lthn25rg/190_monoplex_bollard_product_image-7-min.jpg", fileType: "link" },
    ];

    // Batch inserts (8 per query) to stay under Cloudflare subrequest limit
    for (let i = 0; i < RESOURCE_SEED_DATA.length; i += 8) {
      const batch = RESOURCE_SEED_DATA.slice(i, i + 8);
      const values = batch.map(r =>
        `(gen_random_uuid(), '${r.title.replace(/'/g, "''")}', '${r.category.replace(/'/g, "''")}', '${r.resourceType.replace(/'/g, "''")}', '${(r.description || "").replace(/'/g, "''")}', '${r.fileUrl.replace(/'/g, "''")}', ${r.thumbnailUrl ? `'${r.thumbnailUrl.replace(/'/g, "''")}'` : 'NULL'}, ${r.fileType ? `'${r.fileType}'` : 'NULL'}, 0, true, now(), now())`
      ).join(",\n");
      await sqlClient(`INSERT INTO resources (id, title, category, resource_type, description, file_url, thumbnail_url, file_type, download_count, is_active, created_at, updated_at) VALUES ${values}`);
      for (const r of batch) {
        results.push(`Resource: ${r.title}`);
      }
    }

    return c.json({ success: true, resources: RESOURCE_SEED_DATA.length, results });
  } catch (e: any) {
    console.error("Admin endpoint error:", e);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

// Update product images — updates image URLs from verified A-SAFE CDN
app.get("/api/admin/update-product-images", authMiddleware, async (c) => {
  if (!(await requireAdmin(c))) return c.json({ message: "Admin access required" }, 403);
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    const IMAGE_URL_MAP: Record<string, string> = {
      "Alarm Bar": "https://webcdn.asafe.com/media/4871/alarmbar_qtr.jpg",
      "Atlas Double Traffic Barrier": "https://webcdn.asafe.com/media/2948/atlas-double-traffic-barrier_qu.jpg",
      "Atlas Double Traffic Barrier+": "https://webcdn.asafe.com/media/2947/atlas-double-trafficplus-barrier_qu.jpg",
      "Bollard, Grey": "https://webcdn.asafe.com/media/5621/iflexbollard_190_1200_front277x130.jpg",
      "Bollard, Yellow": "https://webcdn.asafe.com/media/5621/iflexbollard_190_1200_front277x130.jpg",
      "Car Stop": "https://webcdn.asafe.com/media/9762/carstop4_front_277x130.jpg",
      "Coach Stop": "https://webcdn.asafe.com/media/9772/coachstop_front_277x130.jpg",
      "Dock Buffer (Pair)": "https://webcdn.asafe.com/media/9796/dockbuffer_front_277x130.jpg",
      "FlexiShield Column Guard": "https://webcdn.asafe.com/media/2956/flexishield-column-guard-wraparound-_qu.jpg",
      "FlexiShield Column Guard Spacer Set": "https://webcdn.asafe.com/media/2956/flexishield-column-guard-wraparound-_qu.jpg",
      "FlexiShield Corner Guard": "https://webcdn.asafe.com/media/5353/flexishieldcornerguard_qtr1156x556.jpg",
      "ForkGuard Kerb Barrier": "https://webcdn.asafe.com/media/0lkhom3p/forkguard_qutr1.jpg",
      "HD ForkGuard Kerb Barrier": "https://webcdn.asafe.com/media/2hljhqtr/forkguard_insitu_1.jpg",
      "Heavy Duty Bollard, Grey, GALV": "https://webcdn.asafe.com/media/6092/iflexheavydutybollard__front277x130.jpg",
      "Heavy Duty Bollard, Yellow, GALV": "https://webcdn.asafe.com/media/6092/iflexheavydutybollard__front277x130.jpg",
      "Hydraulic Swing Gate, Self-Close": "https://webcdn.asafe.com/media/2974/iflex-swinggate_short_qu.jpg",
      "Monoplex Bollard": "https://webcdn.asafe.com/media/lthn25rg/190_monoplex_bollard_product_image-7-min.jpg",
      "Slider Plate": "https://webcdn.asafe.com/media/3580/sliderplates_158_front.jpg",
      "Step Guard": "https://webcdn.asafe.com/media/11977/product_image_2_qutr_578x278.jpg",
      "Traffic Gate": "https://webcdn.asafe.com/media/wl1debok/traffic_gate_2_1156x556.jpg",
      "Truck Stop": "https://webcdn.asafe.com/media/9766/truckstop_front_277x130.jpg",
      "eFlex Double Rack End Barrier": "https://webcdn.asafe.com/media/2981/reflex_doublerailrackendbarrier_qu.jpg",
      "eFlex Single Rack End Barrier": "https://webcdn.asafe.com/media/2984/reflex_singlerailrackendbarrier_qu.jpg",
      "eFlex Single Traffic Barrier": "https://webcdn.asafe.com/media/2990/reflex-single-traffic-barrier_qu.jpg",
      "eFlex Single Traffic Barrier+": "https://webcdn.asafe.com/media/2989/reflex-single-traffic-plus-barrier_qu.jpg",
      "iFlex Double Traffic Barrier": "https://webcdn.asafe.com/media/4751/iflex-double-traffic-barrier_qu.jpg",
      "iFlex Double Traffic Barrier+": "https://webcdn.asafe.com/media/2957/iflex-double-trafficplus-barrier_qu.jpg",
      "iFlex RackGuard": "https://webcdn.asafe.com/media/3567/rackguard-rack-leg-protector_front.jpg",
      "iFlex Single Traffic Barrier": "https://webcdn.asafe.com/media/2970/iflex-single-traffic-barrier_qu.jpg",
      "iFlex Single Traffic Barrier+": "https://webcdn.asafe.com/media/2969/iflex-single-trafficplus-barrier_qu.jpg",
      "iFlex Height Restrictor": "https://webcdn.asafe.com/media/5679/iflexheightrestrictsitu1156x556_03.jpg",
      "mFlex Double Traffic Barrier": "https://webcdn.asafe.com/media/2975/mflex-double-traffic-barrier-micro-_qu.jpg",
      "mFlex Single Traffic Barrier": "https://webcdn.asafe.com/media/2976/mflex-single-traffic-barrier-micro-_qu.jpg",
    };

    const results: string[] = [];
    for (const [name, url] of Object.entries(IMAGE_URL_MAP)) {
      const result = await sqlClient`UPDATE products SET image_url = ${url} WHERE name = ${name} RETURNING id, name`;
      if (result.length > 0) {
        results.push(`Updated: ${name}`);
      } else {
        results.push(`Not found: ${name}`);
      }
    }

    return c.json({ success: true, total: Object.keys(IMAGE_URL_MAP).length, results });
  } catch (e: any) {
    console.error("Admin endpoint error:", e);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

// One-time admin role promotion �� set a user's role to admin by email
// Usage: /api/admin/promote-user?email=admin@asafe.com
app.get("/api/admin/promote-user", authMiddleware, async (c) => {
  if (!(await requireAdmin(c))) return c.json({ message: "Admin access required" }, 403);
  // NOTE: This is a setup utility. In production, restrict or remove this endpoint.

  try {
    const email = c.req.query("email");
    if (!email) {
      return c.json({ message: "email query param required" }, 400);
    }
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(c.env.DATABASE_URL);
    const result = await sql`UPDATE users SET role = 'admin' WHERE email = ${email} RETURNING id, email, role`;
    if (result.length === 0) {
      return c.json({ message: "User not found" }, 404);
    }
    return c.json({ success: true, user: result[0] });
  } catch (e: any) {
    console.error("Admin endpoint error:", e);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

// Bootstrap admin — public endpoint guarded by a secret token
// Usage: GET /api/bootstrap-admin?token=asafe-engage-reset-2026&password=newPassword123
// Resets the admin@asafe.com password and ensures the user has admin role.
app.get("/api/bootstrap-admin", async (c) => {
  const BOOTSTRAP_TOKEN = "asafe-engage-reset-2026";
  const token = c.req.query("token");
  if (token !== BOOTSTRAP_TOKEN) {
    return c.json({ message: "Invalid bootstrap token" }, 403);
  }
  try {
    const newPassword = c.req.query("password") || "asafe2024";
    if (newPassword.length < 6) {
      return c.json({ message: "Password must be at least 6 characters" }, 400);
    }

    const bcrypt = (await import("bcryptjs")).default;
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const email = "admin@asafe.com";

    // Check if admin exists
    const existing = await sqlClient`SELECT id FROM users WHERE email = ${email}`;

    if (existing.length > 0) {
      // Update password and ensure admin role
      await sqlClient`
        UPDATE users
        SET password_hash = ${passwordHash}, role = 'admin', updated_at = now()
        WHERE email = ${email}
      `;
      return c.json({
        success: true,
        action: "updated",
        email,
        password: newPassword,
        message: `Admin password reset. Login at /api/login with email ${email} and password ${newPassword}`,
      });
    } else {
      // Create new admin
      await sqlClient`
        INSERT INTO users (id, email, password_hash, first_name, last_name, role, created_at, updated_at)
        VALUES (gen_random_uuid(), ${email}, ${passwordHash}, 'Admin', 'User', 'admin', now(), now())
      `;
      return c.json({
        success: true,
        action: "created",
        email,
        password: newPassword,
        message: `Admin user created. Login at /api/login with email ${email} and password ${newPassword}`,
      });
    }
  } catch (e: any) {
    console.error("Admin endpoint error:", e);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

// Create test user — guarded by bootstrap token, useful for team onboarding
// Usage: GET /api/bootstrap-user?token=asafe-engage-reset-2026&email=user@team.com&password=test1234&firstName=John&lastName=Doe
app.get("/api/bootstrap-user", async (c) => {
  const BOOTSTRAP_TOKEN = "asafe-engage-reset-2026";
  const token = c.req.query("token");
  if (token !== BOOTSTRAP_TOKEN) {
    return c.json({ message: "Invalid bootstrap token" }, 403);
  }
  try {
    const email = (c.req.query("email") || "").toLowerCase().trim();
    const password = c.req.query("password") || "";
    const firstName = c.req.query("firstName") || "Team";
    const lastName = c.req.query("lastName") || "Member";
    const role = c.req.query("role") || "user";

    if (!email || !password) {
      return c.json({ message: "email and password query params required" }, 400);
    }
    if (password.length < 6) {
      return c.json({ message: "Password must be at least 6 characters" }, 400);
    }

    const bcrypt = (await import("bcryptjs")).default;
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    const passwordHash = await bcrypt.hash(password, 10);
    const existing = await sqlClient`SELECT id FROM users WHERE email = ${email}`;

    if (existing.length > 0) {
      await sqlClient`
        UPDATE users
        SET password_hash = ${passwordHash}, first_name = ${firstName}, last_name = ${lastName}, role = ${role}, updated_at = now()
        WHERE email = ${email}
      `;
      return c.json({ success: true, action: "updated", email, password, role });
    } else {
      await sqlClient`
        INSERT INTO users (id, email, password_hash, first_name, last_name, role, created_at, updated_at)
        VALUES (gen_random_uuid(), ${email}, ${passwordHash}, ${firstName}, ${lastName}, ${role}, now(), now())
      `;
      return c.json({ success: true, action: "created", email, password, role });
    }
  } catch (e: any) {
    console.error("Admin endpoint error:", e);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

// Product Suitability schema — idempotent DDL adding two jsonb columns:
//   products.suitability_data        — spec-sheet payload per product
//   vehicle_types.suitability_labels — string[] of PDF vehicle-suitability
//                                      labels each calculator vehicle matches
// Gated by MIGRATION_TOKEN (bearer). Safe to re-run.
app.post("/api/admin/apply-suitability-schema", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    // Probe which columns existed before the DDL runs, so we can report
    // altered=N (N = new columns actually created on this run).
    const pre = (await sqlClient`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE (table_name = 'products' AND column_name = 'suitability_data')
         OR (table_name = 'vehicle_types' AND column_name = 'suitability_labels')
    `) as Array<{ table_name: string; column_name: string }>;
    const existing = new Set(pre.map((r) => `${r.table_name}.${r.column_name}`));

    await sqlClient`ALTER TABLE products ADD COLUMN IF NOT EXISTS suitability_data jsonb`;
    await sqlClient`ALTER TABLE vehicle_types ADD COLUMN IF NOT EXISTS suitability_labels jsonb`;
    // Defensive: schema.ts now also references maintenance_data and
    // ground_works_data jsonb columns (added by a concurrent agent's
    // GroundWorks/Maintenance work). Drizzle's `select()` on the products
    // table reads every column declared in the schema, so /api/products
    // 500s with `column "X" does not exist` until those columns land in
    // PG. Idempotent ADD COLUMN IF NOT EXISTS so this is safe even when
    // the other agent's own DDL endpoint runs first.
    await sqlClient`ALTER TABLE products ADD COLUMN IF NOT EXISTS maintenance_data jsonb`;
    await sqlClient`ALTER TABLE products ADD COLUMN IF NOT EXISTS ground_works_data jsonb`;

    // Supporting GIN index on the vehicleSuitability array inside suitability_data.
    // Lets the Impact Calculator's cross-reference filter run as an index scan
    // instead of a full-table filter once volume grows.
    const preIdx = (await sqlClient`
      SELECT indexname FROM pg_indexes
      WHERE indexname = 'products_suitability_vehicle_idx'
    `) as Array<{ indexname: string }>;
    const indexExistedBefore = preIdx.length > 0;
    await sqlClient`
      CREATE INDEX IF NOT EXISTS products_suitability_vehicle_idx
      ON products USING GIN ((suitability_data -> 'vehicleSuitability'))
    `;

    const altered =
      (existing.has("products.suitability_data") ? 0 : 1) +
      (existing.has("vehicle_types.suitability_labels") ? 0 : 1);

    return c.json({
      ok: true,
      altered,
      indexed: indexExistedBefore ? 0 : 1,
      columns: {
        "products.suitability_data": existing.has("products.suitability_data")
          ? "already-present"
          : "added",
        "vehicle_types.suitability_labels": existing.has(
          "vehicle_types.suitability_labels",
        )
          ? "already-present"
          : "added",
      },
    });
  } catch (e: any) {
    console.error("apply-suitability-schema failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Ingest the extracted Product Suitability PDF dataset into
// products.suitability_data. For each PDF product with matchedDbIds.length > 0,
// writes the full per-product entry to the corresponding DB row(s).
// Idempotent; re-running overwrites with the same payload.
app.post("/api/admin/ingest-product-suitability", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const datasetModule: any = await import(
      "../scripts/data/product-suitability.json"
    );
    const dataset = datasetModule.default || datasetModule;
    const pdfProducts: any[] = dataset.products || [];

    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    // The PDF dataset's `matchedDbIds` use the synthetic "family-<slug>"
    // shape the /api/products route builds from each DB product name
    // (see worker/routes/products.ts ~line 409:
    //   id: `family-${product.name.replace(/\s+/g, "-").toLowerCase()}`).
    // We reverse-resolve back to the real DB UUIDs by slugifying each row.
    const familySlug = (name: string): string =>
      `family-${name.replace(/\s+/g, "-").toLowerCase()}`;
    const dbRows = (await sqlClient`
      SELECT id, name FROM products WHERE is_active = true
    `) as Array<{ id: string; name: string }>;
    const slugToDbIds = new Map<string, string[]>();
    for (const row of dbRows) {
      const s = familySlug(row.name);
      const list = slugToDbIds.get(s) || [];
      list.push(row.id);
      slugToDbIds.set(s, list);
    }

    let ingested = 0;
    let pdfMatched = 0;
    let pdfUnmatched = 0;
    const unmatchedPdfIds: string[] = [];
    const missingDbRows: Array<{ familySlug: string; productName: string }> =
      [];

    for (const p of pdfProducts) {
      const familyIds: string[] = Array.isArray(p.matchedDbIds)
        ? p.matchedDbIds
        : [];
      if (familyIds.length === 0) {
        pdfUnmatched++;
        unmatchedPdfIds.push(p.productName);
        continue;
      }
      pdfMatched++;
      // Store the full per-product PDF entry (minus matchedDbIds/sourceFile
      // — bookkeeping, not UI-relevant).
      const { matchedDbIds: _m, sourceFile: _s, ...payload } = p;
      for (const slug of familyIds) {
        const realIds = slugToDbIds.get(slug) || [];
        if (realIds.length === 0) {
          missingDbRows.push({ familySlug: slug, productName: p.productName });
          continue;
        }
        for (const dbId of realIds) {
          const result = (await sqlClient`
            UPDATE products
            SET suitability_data = ${JSON.stringify(payload)}::jsonb,
                updated_at = now()
            WHERE id = ${dbId}
            RETURNING id
          `) as Array<{ id: string }>;
          if (result.length > 0) {
            ingested += result.length;
          }
        }
      }
    }

    return c.json({
      ok: true,
      summary: {
        pdfProducts: pdfProducts.length,
        pdfMatched,
        pdfUnmatched,
        dbRowsIngested: ingested,
        missingFamilySlugs: missingDbRows.length,
      },
      missingDbRows,
      unmatchedPdfProducts: unmatchedPdfIds,
    });
  } catch (e: any) {
    console.error("ingest-product-suitability failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Apply VEHICLE_SUITABILITY_MAP (shared/vehicleSuitabilityMap.ts) into
// vehicle_types.suitability_labels. Each entry keyed by DB vehicle name
// writes its PDF-label array (possibly empty) to the matching row.
// Idempotent; re-running overwrites with the same payload.
app.post("/api/admin/apply-vehicle-suitability-labels", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const { VEHICLE_SUITABILITY_MAP } = await import(
      "../shared/vehicleSuitabilityMap"
    );
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    const results: Array<{ name: string; labels: string[]; rows: number }> = [];
    let labelled = 0;
    const notMatched: string[] = [];
    for (const [name, labels] of Object.entries(VEHICLE_SUITABILITY_MAP)) {
      const r = (await sqlClient`
        UPDATE vehicle_types
        SET suitability_labels = ${JSON.stringify(labels)}::jsonb,
            updated_at = now()
        WHERE name = ${name}
        RETURNING id
      `) as Array<{ id: string }>;
      if (r.length > 0) labelled += r.length;
      else notMatched.push(name);
      results.push({ name, labels, rows: r.length });
    }
    return c.json({
      ok: true,
      summary: {
        mapEntries: Object.keys(VEHICLE_SUITABILITY_MAP).length,
        rowsUpdated: labelled,
        notMatched: notMatched.length,
      },
      notMatched,
      results,
    });
  } catch (e: any) {
    console.error("apply-vehicle-suitability-labels failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
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

// ─── Master Impact Testing — Reconciled patch + Resource upload (ν) ───
// This block is appended to the tail of the file deliberately so concurrent
// agents (ι, κ, μ, ξ, ο, θ) writing in this region don't collide on rebase.
// Three endpoints + a public PDF route, all gated by MIGRATION_TOKEN where
// they mutate state. Pattern mirrors the existing apply-impact-corrections
// and upload-certificates endpoints — see those for the canonical shape.

// Public read-only download for the master Product Impact Testing PDF
// uploaded to R2 at testing/<file>.pdf. Auth-free so the Resources page
// can link to it for anonymous customers (same rationale as the
// /api/certificates/:file endpoint).
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

// One-shot DDL — adds products.impact_testing_data jsonb if missing.
// Stores the per-product master-doc geometry (post diameter, rail diameter,
// impact zone, fork-guard / bollard heights, impact-angle scope, source
// page) without disturbing any existing column. Idempotent IF NOT EXISTS.
app.post("/api/admin/apply-master-testing-schema", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json(
      { ok: false, message: "MIGRATION_TOKEN not configured" },
      500,
    );
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);
    await sqlClient`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS impact_testing_data jsonb
    `;
    return c.json({ ok: true, message: "products.impact_testing_data ensured" });
  } catch (e: any) {
    console.error("apply-master-testing-schema failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Apply the reconciled master Impact Testing patch to the products table.
// Reads scripts/data/master-testing-patch.json (built by
// scripts/buildMasterTestingPatch.mjs from product-impact-testing.json +
// cert-impact-patch.json). For each patch entry:
//   - If newValue is non-null AND the cert won (or cert-only), update
//     impact_rating + pas_13_test_joules + pas_13_compliant + pas_13_test_method.
//   - Always write the master-doc geometry payload into
//     products.impact_testing_data so the spec-sheet block can render
//     post diameter / rail diameter / impact zone / angle scope.
//   - When the cert-side joule conflicts with an existing impact_rating in
//     the DB, prefer the cert (matches /apply-impact-corrections behaviour).
//
// Idempotent — re-running converges. Gated by MIGRATION_TOKEN (bearer).
// Matches by lower(products.name) = lower(familyName).
app.post("/api/admin/apply-master-testing", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json(
      { ok: false, message: "MIGRATION_TOKEN not configured" },
      500,
    );
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }
  try {
    let patchData: any;
    try {
      patchData =
        (await import("../scripts/data/master-testing-patch.json")).default ||
        (await import("../scripts/data/master-testing-patch.json"));
    } catch {
      return c.json(
        {
          ok: false,
          message:
            "No master-testing-patch.json bundled — run scripts/buildMasterTestingPatch.mjs first.",
        },
        404,
      );
    }

    type PatchEntry = {
      familyName: string;
      status: string;
      newValue: number | null;
      pas13Certified: boolean | null;
      pas13Method: string | null;
      impactRatingRaw: string | null;
      vehicleTest: string | null;
      masterPostDiameter: string | null;
      masterRailDiameter: string | null;
      masterImpactZone: string | null;
      masterForkGuardHeight: string | null;
      masterBollardHeight: string | null;
      masterImpactAngleScope: string | null;
      masterPageNum: number | null;
      notes: string | null;
    };
    const patches: PatchEntry[] = patchData.patches || [];
    if (patches.length === 0) {
      return c.json({ ok: true, applied: 0, message: "No patches to apply." });
    }

    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    const applied: Array<{
      familyName: string;
      matched: number;
      newValue: number | null;
      status: string;
    }> = [];
    const notMatched: string[] = [];

    // Pre-index DB products for fuzzy fallback. Primary path is still
    // case-insensitive equality; matchByNameVariants only fires when that
    // misses (e.g. PDF uses "iFlex Single Traffic Barrier" but DB name is
    // "iFlex Single Traffic"). Purely additive — never overrides a strict
    // match. See shared/nameNormalise.ts.
    const dbRows = (await sqlClient`SELECT id, name FROM products`) as Array<{
      id: string;
      name: string;
    }>;
    const byCanonical = new Map<string, { id: string; name: string }>();
    for (const row of dbRows) {
      const k = normaliseCanonical(row.name);
      if (k && !byCanonical.has(k)) byCanonical.set(k, row);
    }

    for (const p of patches) {
      const impactTestingData = {
        sourcePdf:
          "ASAFE_ProductImpactTesting_PRH-1012-A-SAFE-30012024-1.pdf",
        documentReference: "PRH-1012-A-SAFE-30012024-1",
        sourcePage: p.masterPageNum,
        postDiameter: p.masterPostDiameter,
        railDiameter: p.masterRailDiameter,
        impactZone: p.masterImpactZone,
        forkGuardHeight: p.masterForkGuardHeight,
        bollardHeight: p.masterBollardHeight,
        impactAngleScope: p.masterImpactAngleScope,
        certFamily:
          p.status === "certOnly" ||
          p.status === "certWon" ||
          p.status === "agreed"
            ? p.impactRatingRaw
            : null,
        vehicleTest: p.vehicleTest,
        reconciliationStatus: p.status,
        reconciliationNotes: p.notes,
      };

      const sets: string[] = [];
      const params: any[] = [];

      sets.push("impact_testing_data = $" + (params.length + 1));
      params.push(JSON.stringify(impactTestingData));

      if (p.newValue != null) {
        sets.push("impact_rating = $" + (params.length + 1));
        params.push(p.newValue);
        sets.push("pas_13_test_joules = $" + (params.length + 1));
        params.push(p.newValue);
      }
      if (p.pas13Certified != null) {
        sets.push("pas_13_compliant = $" + (params.length + 1));
        params.push(p.pas13Certified);
      }
      if (p.pas13Method) {
        sets.push("pas_13_test_method = $" + (params.length + 1));
        params.push(p.pas13Method);
      }
      sets.push("updated_at = now()");

      // Strict match first (historical behaviour).
      const nameIdx = params.length + 1;
      const paramsExact = [...params, p.familyName];
      let res = (await sqlClient(
        `UPDATE products SET ${sets.join(", ")} WHERE lower(name) = lower($${nameIdx}) RETURNING id`,
        paramsExact,
      )) as any[];

      // Fuzzy fallback — only fires when strict missed.
      if (res.length === 0) {
        const hit = matchByNameVariants(p.familyName, byCanonical);
        if (hit) {
          const fuzzyIdx = params.length + 1;
          const paramsFuzzy = [...params, hit.id];
          res = (await sqlClient(
            `UPDATE products SET ${sets.join(", ")} WHERE id = $${fuzzyIdx} RETURNING id`,
            paramsFuzzy,
          )) as any[];
        }
      }

      if (res.length === 0) {
        notMatched.push(p.familyName);
      } else {
        applied.push({
          familyName: p.familyName,
          matched: res.length,
          newValue: p.newValue,
          status: p.status,
        });
      }
    }

    return c.json({
      ok: true,
      totalPatches: patches.length,
      applied: applied.length,
      notMatched,
      reconciliationSummary: patchData.reconciliationSummary,
      details: applied,
    });
  } catch (e: any) {
    console.error("apply-master-testing failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Seed the resources table with one row pointing at the master Impact
// Testing PDF (uploaded out-of-band to R2 at testing/product-impact-
// testing-master.pdf). Idempotent — matched by (title, resource_type) per
// κ's upload-certificates pattern.
app.post("/api/admin/upload-master-testing-resource", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json(
      { ok: false, message: "MIGRATION_TOKEN not configured" },
      500,
    );
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }
  try {
    const title =
      "Product Impact Testing — Master Document (PRH-1012, May 2024)";
    const description =
      "A-SAFE Product Impact Suitability master document. 47-page reference covering 43 protective products with per-product post/rail diameters, impact-zone ranges, impact-angle scope (45°/90° vs 90°-only), and the per-vehicle traffic-light suitability matrix at typical workplace weights and speeds. Companion to the individual PAS 13 / EN test certificates indexed under Safety Standards.";
    const resourceType = "Test Report";
    const category = "Safety Standards";
    const fileUrl = "/api/testing/product-impact-testing-master.pdf";
    const fileSize = 20274739;
    const thumbnailUrl =
      "https://webcdn.asafe.com/media/4250/atlas-double-traffic-barrier-ramp.jpg";

    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    const existing = (await sqlClient`
      SELECT id
      FROM resources
      WHERE title = ${title} AND resource_type = ${resourceType}
      LIMIT 1
    `) as any[];

    let resourceId: string;
    let action: string;
    if (existing.length > 0) {
      resourceId = existing[0].id;
      await sqlClient`
        UPDATE resources
        SET description = ${description},
            file_url = ${fileUrl},
            file_size = ${fileSize},
            file_type = 'pdf',
            category = ${category},
            thumbnail_url = ${thumbnailUrl},
            is_active = true,
            updated_at = now()
        WHERE id = ${resourceId}
      `;
      action = "refreshed";
    } else {
      const rows = (await sqlClient`
        INSERT INTO resources (
          title, category, resource_type, description,
          file_url, thumbnail_url, file_size, file_type,
          download_count, is_active, created_at, updated_at
        ) VALUES (
          ${title}, ${category}, ${resourceType}, ${description},
          ${fileUrl}, ${thumbnailUrl}, ${fileSize}, 'pdf',
          0, true, now(), now()
        )
        RETURNING id
      `) as any[];
      resourceId = rows[0].id;
      action = "inserted";
    }

    return c.json({
      ok: true,
      action,
      resourceId,
      title,
      fileUrl,
      resourceType,
      category,
    });
  } catch (e: any) {
    console.error("upload-master-testing-resource failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Product Maintenance schema — idempotent DDL adding one jsonb column:
//   products.maintenance_data — per-product maintenance/inspection/cleaning/
//                               warranty/spares payload merged from the
//                               A-SAFE Product Maintenance PDF (PRH-1001).
// Gated by MIGRATION_TOKEN (bearer). Safe to re-run.
app.post("/api/admin/apply-maintenance-schema", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    const pre = (await sqlClient`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'maintenance_data'
    `) as Array<{ column_name: string }>;
    const existed = pre.length > 0;

    await sqlClient`ALTER TABLE products ADD COLUMN IF NOT EXISTS maintenance_data jsonb`;

    return c.json({
      ok: true,
      altered: existed ? 0 : 1,
      column: existed ? "already-present" : "added",
    });
  } catch (e: any) {
    console.error("apply-maintenance-schema failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Ingest the extracted Product Maintenance PDF dataset into
// products.maintenance_data. The source PDF is generic — one __GLOBAL__
// entry plus four per-family entries (Memaplex / Monoplex / RackGuard /
// Traffic Gate). For each DB product we pick the best-matching family entry
// (by name prefix OR category keyword), merge it with the __GLOBAL__ entry
// (family takes precedence), and write the composed payload. Products that
// don't match any family stay null (UI renders nothing).
// Idempotent; re-running overwrites with the same payload.
app.post("/api/admin/ingest-maintenance-data", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const datasetModule: any = await import(
      "../scripts/data/product-maintenance.json"
    );
    const dataset = datasetModule.default || datasetModule;
    const entries: any[] = dataset.products || [];

    const globalEntry = entries.find((e) => e.global === true) || null;
    const familyEntries = entries.filter((e) => e.global !== true);

    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    // Pull every product row so we can match locally in one query.
    const dbProducts = (await sqlClient`
      SELECT id, name, category, subcategory
      FROM products
    `) as Array<{
      id: string;
      name: string;
      category: string | null;
      subcategory: string | null;
    }>;

    // Maintenance matching is asymmetric: we check whether each DB product
    // "contains" a family label (not strict map lookup). For each product
    // we try the conservative canonical form first, then fall back to the
    // aggressive form for backward-compat with previously-matching rows.
    // See shared/nameNormalise.ts for the helper semantics.
    const { normaliseAggressive } = await import("../shared/nameNormalise");

    function containsAnyVariant(haystackName: string, needle: string): boolean {
      const hCanon = normaliseCanonical(haystackName);
      const nCanon = normaliseCanonical(needle);
      if (nCanon && (hCanon.startsWith(nCanon) || hCanon.includes(nCanon))) {
        return true;
      }
      const hAgg = normaliseAggressive(haystackName);
      const nAgg = normaliseAggressive(needle);
      if (nAgg && (hAgg.startsWith(nAgg) || hAgg.includes(nAgg))) {
        return true;
      }
      return false;
    }

    function containsKeyword(haystack: string, keyword: string): boolean {
      const hCanon = normaliseCanonical(haystack);
      const kCanon = normaliseCanonical(keyword);
      if (kCanon && hCanon.includes(kCanon)) return true;
      const hAgg = normaliseAggressive(haystack);
      const kAgg = normaliseAggressive(keyword);
      if (kAgg && hAgg.includes(kAgg)) return true;
      return false;
    }

    let matched = 0;
    const matchedRows: Array<{ id: string; name: string; family: string }> = [];
    const unmatched: Array<{ id: string; name: string }> = [];

    for (const product of dbProducts) {
      // Find the first family whose appliesToFamilies / appliesToCategoryKeywords
      // matches this product. Family prefix/containment matching wins over
      // category keyword matching (more specific).
      let matchedFamily: any = null;
      for (const fam of familyEntries) {
        const families: string[] = Array.isArray(fam.appliesToFamilies)
          ? fam.appliesToFamilies
          : [];
        if (families.some((f) => f && containsAnyVariant(product.name, f))) {
          matchedFamily = fam;
          break;
        }
      }
      if (!matchedFamily) {
        for (const fam of familyEntries) {
          const keywords: string[] = Array.isArray(fam.appliesToCategoryKeywords)
            ? fam.appliesToCategoryKeywords
            : [];
          if (
            keywords.some((k) => {
              if (!k) return false;
              return (
                containsKeyword(product.category || "", k) ||
                containsKeyword(product.subcategory || "", k) ||
                containsKeyword(product.name, k)
              );
            })
          ) {
            matchedFamily = fam;
            break;
          }
        }
      }

      if (!matchedFamily) {
        unmatched.push({ id: product.id, name: product.name });
        continue;
      }

      // Merge — family overrides global where keys overlap. Damage
      // assessments + spare parts concatenate (family first, deduped).
      const damageAssessment = [
        ...(matchedFamily.damageAssessment || []),
        ...(globalEntry?.damageAssessment || []),
      ];
      const recommendedSpares = [
        ...(matchedFamily.recommendedSpares || []),
        ...(globalEntry?.recommendedSpares || []),
      ];
      const seenDamage = new Set<string>();
      const seenSpares = new Set<string>();
      const mergedPayload = {
        inspectionFrequency:
          matchedFamily.inspectionFrequency ||
          globalEntry?.inspectionFrequency ||
          null,
        inspectionNotes:
          matchedFamily.inspectionNotes ||
          globalEntry?.inspectionNotes ||
          null,
        cleaningInstructions:
          matchedFamily.cleaningInstructions ||
          globalEntry?.cleaningInstructions ||
          null,
        damageAssessment: damageAssessment.filter((d: string) => {
          if (seenDamage.has(d)) return false;
          seenDamage.add(d);
          return true;
        }),
        warrantyConditions:
          matchedFamily.warrantyConditions ||
          globalEntry?.warrantyConditions ||
          null,
        recommendedSpares: recommendedSpares.filter((s: string) => {
          if (seenSpares.has(s)) return false;
          seenSpares.add(s);
          return true;
        }),
        appliedFrom: matchedFamily.productName,
        sourceDocRef: dataset?._meta?.docRef || null,
        sourceDocTitle: dataset?._meta?.docTitle || null,
      };

      const result = (await sqlClient`
        UPDATE products
        SET maintenance_data = ${JSON.stringify(mergedPayload)}::jsonb,
            updated_at = now()
        WHERE id = ${product.id}
        RETURNING id
      `) as Array<{ id: string }>;
      if (result.length > 0) {
        matched++;
        matchedRows.push({
          id: product.id,
          name: product.name,
          family: matchedFamily.productName,
        });
      }
    }

    return c.json({
      ok: true,
      matched,
      unmatched: unmatched.length,
      unmatchedProducts: unmatched,
      familyCounts: familyEntries.reduce(
        (acc: Record<string, number>, fam) => {
          acc[fam.productName] = matchedRows.filter(
            (r) => r.family === fam.productName,
          ).length;
          return acc;
        },
        {},
      ),
      totalProducts: dbProducts.length,
    });
  } catch (e: any) {
    console.error("ingest-maintenance-data failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Seed the `resources` table with the A-SAFE Product Maintenance guide PDF
// (PRH-1001). The PDF is pre-uploaded to R2 at
// maintenance/product-maintenance-guide.pdf via `wrangler r2 object put`.
// Idempotent — matched by (title, resource_type).
// Gated by MIGRATION_TOKEN (bearer), same pattern as /admin/upload-certificates.
app.post("/api/admin/upload-maintenance-guide", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }

  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    const title = "A-SAFE Product Maintenance Guide (PRH-1001)";
    const resourceType = "Maintenance Guide";
    const category = "Maintenance";
    const description =
      "Official A-SAFE maintenance and cleaning guide covering barrier inspection, " +
      "pins/caps/base-plate fixing checks, Memaplex & Monoplex cleaning methods, " +
      "chemical-resistance tables, and damage-assessment indicators for all product " +
      "families (Memaplex / Monoplex / RackGuard / Traffic Gates).";
    const fileUrl = "/api/maintenance/product-maintenance-guide.pdf";
    const fileSize = 10818781; // bytes
    const thumbnailUrl: string | null = null;

    const existing = (await sqlClient`
      SELECT id
      FROM resources
      WHERE title = ${title} AND resource_type = ${resourceType}
      LIMIT 1
    `) as any[];

    let resourceId: string;
    let action: "inserted" | "refreshed";
    if (existing.length > 0) {
      resourceId = existing[0].id;
      action = "refreshed";
      await sqlClient`
        UPDATE resources
        SET description = ${description},
            file_url = ${fileUrl},
            file_size = ${fileSize},
            file_type = 'pdf',
            category = ${category},
            thumbnail_url = ${thumbnailUrl},
            is_active = true,
            updated_at = now()
        WHERE id = ${resourceId}
      `;
    } else {
      const rows = (await sqlClient`
        INSERT INTO resources (
          title, category, resource_type, description,
          file_url, thumbnail_url, file_size, file_type,
          download_count, is_active, created_at, updated_at
        ) VALUES (
          ${title}, ${category}, ${resourceType}, ${description},
          ${fileUrl}, ${thumbnailUrl}, ${fileSize}, 'pdf',
          0, true, now(), now()
        )
        RETURNING id
      `) as any[];
      resourceId = rows[0].id;
      action = "inserted";
    }

    return c.json({ ok: true, action, resourceId, fileUrl });
  } catch (e: any) {
    console.error("upload-maintenance-guide failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
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

// Base-plates schema — idempotent DDL for:
//   base_plates (5 plate SKUs from the Available Base Plates PDF)
//   base_plate_product_compatibility (many-to-many product<->plate edges)
// Gated by MIGRATION_TOKEN (bearer). Safe to re-run.
app.post("/api/admin/apply-base-plates-schema", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    const preTables = (await sqlClient`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('base_plates', 'base_plate_product_compatibility')
    `) as Array<{ table_name: string }>;
    const existing = new Set(preTables.map((r) => r.table_name));

    await sqlClient`
      CREATE TABLE IF NOT EXISTS base_plates (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR NOT NULL UNIQUE,
        name VARCHAR NOT NULL,
        description TEXT,
        bolt_size VARCHAR,
        bolt_length_mm INTEGER,
        plate_dimensions_mm VARCHAR,
        coating VARCHAR,
        fixing_type VARCHAR,
        substrate_notes TEXT,
        is_standard_stock BOOLEAN DEFAULT false,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      )
    `;

    await sqlClient`
      CREATE TABLE IF NOT EXISTS base_plate_product_compatibility (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        base_plate_id VARCHAR NOT NULL REFERENCES base_plates(id) ON DELETE CASCADE,
        product_id VARCHAR NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT now(),
        CONSTRAINT bp_compat_unique UNIQUE (base_plate_id, product_id)
      )
    `;
    await sqlClient`
      CREATE INDEX IF NOT EXISTS bp_compat_product_idx
      ON base_plate_product_compatibility (product_id)
    `;
    await sqlClient`
      CREATE INDEX IF NOT EXISTS bp_compat_plate_idx
      ON base_plate_product_compatibility (base_plate_id)
    `;

    return c.json({
      ok: true,
      tables: {
        base_plates: existing.has("base_plates") ? "already-present" : "created",
        base_plate_product_compatibility: existing.has(
          "base_plate_product_compatibility",
        )
          ? "already-present"
          : "created",
      },
      created:
        (existing.has("base_plates") ? 0 : 1) +
        (existing.has("base_plate_product_compatibility") ? 0 : 1),
    });
  } catch (e: any) {
    console.error("apply-base-plates-schema failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Insert the iFlex Heavy Duty Bollard product row from
// scripts/data/asafe-catalog.json if it's missing. The BP-GALV base plate
// compatibility maps to "Heavy Duty Bollard" (alias → "iFlex Heavy Duty
// Bollard"), but the DB has no matching row; without this seed the plate
// ends up with zero edges even though the PDF lists it as compatible.
//
// Idempotent — skips insert if a row with this name already exists.
// Gated by MIGRATION_TOKEN (bearer), same pattern as the sibling one-offs.
app.post("/api/admin/seed-heavy-duty-bollard", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const catalogModule: any = await import("../scripts/data/asafe-catalog.json");
    const catalog = catalogModule.default || catalogModule;
    const catalogProducts: any[] = Array.isArray(catalog)
      ? catalog
      : catalog.products || [];
    const entry = catalogProducts.find(
      (p: any) => p?.familyName === "iFlex Heavy Duty Bollard",
    );
    if (!entry) {
      return c.json(
        {
          ok: false,
          message: "iFlex Heavy Duty Bollard not found in asafe-catalog.json",
        },
        404,
      );
    }

    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    // Idempotency: if a row with this name already exists, reactivate it
    // (in case a previous ingest soft-deleted it) and short-circuit without
    // re-inserting.
    const existing = (await sqlClient`
      SELECT id, name, is_active FROM products
      WHERE lower(name) = lower(${entry.familyName})
      LIMIT 1
    `) as Array<{ id: string; name: string; is_active: boolean | null }>;
    if (existing.length > 0) {
      const wasInactive = existing[0].is_active === false;
      if (wasInactive) {
        await sqlClient`
          UPDATE products
          SET is_active = true, updated_at = now()
          WHERE id = ${existing[0].id}
        `;
      }
      return c.json({
        ok: true,
        skipped: true,
        reason: wasInactive
          ? "Product existed inactive; reactivated"
          : "Product already exists",
        id: existing[0].id,
        name: existing[0].name,
        reactivated: wasInactive,
      });
    }

    const pas13 = entry.pas13 || {};
    const heightMin = entry?.heightRange?.minMm ?? null;
    const heightMax = entry?.heightRange?.maxMm ?? null;
    const imageUrl = Array.isArray(entry.imageUrls) && entry.imageUrls.length > 0
      ? entry.imageUrls[0]
      : null;
    const applications = Array.isArray(entry.applications)
      ? entry.applications
      : [];
    const industries = Array.isArray(entry.industries) ? entry.industries : [];
    const features = Array.isArray(entry.features) ? entry.features : [];

    // Insert with the same column set as seed-products. Price left null —
    // Heavy Duty Bollard is a catalog family without a DB price list
    // entry; variants carry their own SKU pricing once the pricelist
    // ingest is rerun.
    const rows = (await sqlClient`
      INSERT INTO products (
        id, name, category, subcategory, description,
        impact_rating, height_min, height_max,
        pas_13_compliant, pas_13_test_method, pas_13_test_joules,
        currency, image_url,
        applications, industries, features,
        pricing_logic, technical_sheet_url, installation_guide_url,
        is_active, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), ${entry.familyName}, ${entry.category || "bollards"},
        ${entry.subcategory || null}, ${entry.description || ""},
        ${entry.impactRating ?? null}, ${heightMin}, ${heightMax},
        ${pas13.certified ?? false}, ${pas13.method ?? null},
        ${pas13.joules ?? entry.impactRating ?? null},
        'AED', ${imageUrl},
        ${JSON.stringify(applications)}::jsonb,
        ${JSON.stringify(industries)}::jsonb,
        ${JSON.stringify(features)}::jsonb,
        'per_unit',
        ${entry.technicalSheetUrl || null},
        ${entry.installationGuideUrl || null},
        true, now(), now()
      )
      RETURNING id, name
    `) as Array<{ id: string; name: string }>;

    return c.json({
      ok: true,
      inserted: true,
      id: rows[0].id,
      name: rows[0].name,
      source: "scripts/data/asafe-catalog.json (iFlex Heavy Duty Bollard)",
    });
  } catch (e: any) {
    console.error("seed-heavy-duty-bollard failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Ingest scripts/data/base-plates.json into base_plates +
// base_plate_product_compatibility. Idempotent — ON CONFLICT on plate code
// updates metadata; ON CONFLICT on the (plate,product) edge is a no-op.
// Compatibility mapping fuzzy-matches the PDF's product-family label to
// products.name via a curated alias list embedded in the JSON, falling back
// to case-insensitive partial match. Unresolved families surface under
// `unmatchedFamilies` in the response body.
app.post("/api/admin/ingest-base-plates", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const datasetModule: any = await import(
      "../scripts/data/base-plates.json"
    );
    const dataset = datasetModule.default || datasetModule;
    const plates: any[] = dataset.plates || [];
    const compatibility: Array<{ product: string; plates: string[] }> =
      dataset.compatibility || [];
    const aliases: Record<string, string[]> = dataset.productFamilyAliases || {};

    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    // Upsert plates. ON CONFLICT(code) refreshes metadata; (xmax = 0)
    // distinguishes insert vs update.
    let platesInserted = 0;
    const plateIdByCode: Record<string, string> = {};
    for (let i = 0; i < plates.length; i++) {
      const p = plates[i];
      const isStd = p.code === "BP-STD-ZN";
      const r = (await sqlClient`
        INSERT INTO base_plates (
          code, name, description, bolt_size, bolt_length_mm,
          plate_dimensions_mm, coating, fixing_type, substrate_notes,
          is_standard_stock, sort_order
        ) VALUES (
          ${p.code}, ${p.name}, ${p.description ?? null}, ${p.boltSize ?? null},
          ${p.boltLengthMm ?? null}, ${p.plateDimensionsMm ?? null},
          ${p.coating ?? null}, ${p.fixingType ?? null},
          ${p.substrateNotes ?? null}, ${isStd}, ${i}
        )
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          bolt_size = EXCLUDED.bolt_size,
          bolt_length_mm = EXCLUDED.bolt_length_mm,
          plate_dimensions_mm = EXCLUDED.plate_dimensions_mm,
          coating = EXCLUDED.coating,
          fixing_type = EXCLUDED.fixing_type,
          substrate_notes = EXCLUDED.substrate_notes,
          is_standard_stock = EXCLUDED.is_standard_stock,
          sort_order = EXCLUDED.sort_order,
          updated_at = now()
        RETURNING id, code, (xmax = 0) AS inserted
      `) as Array<{ id: string; code: string; inserted: boolean }>;
      if (r[0]) {
        plateIdByCode[r[0].code] = r[0].id;
        if (r[0].inserted) platesInserted++;
      }
    }

    // Pull all products once — resolving PDF labels to DB products via
    // explicit alias list first, then case-insensitive substring match,
    // then canonical-normaliser fallback (handles "+"/"plus", CS ↔ cold
    // storage, trailing-filler variants). See shared/nameNormalise.ts.
    const dbProducts = (await sqlClient`
      SELECT id, name FROM products WHERE is_active IS NOT FALSE
    `) as Array<{ id: string; name: string }>;
    const dbByLowerName = new Map<string, { id: string; name: string }>();
    const dbByCanonical = new Map<string, { id: string; name: string }>();
    for (const p of dbProducts) {
      dbByLowerName.set(p.name.toLowerCase(), p);
      const k = normaliseCanonical(p.name);
      if (k && !dbByCanonical.has(k)) dbByCanonical.set(k, p);
    }

    function resolveProducts(familyLabel: string): Array<{ id: string; name: string }> {
      const resolved = new Map<string, { id: string; name: string }>();
      const candidates = aliases[familyLabel] || [familyLabel];
      for (const alias of candidates) {
        const low = alias.toLowerCase();
        const exact = dbByLowerName.get(low);
        if (exact) {
          resolved.set(exact.id, exact);
          continue;
        }
        // Partial match with a min-length guard so short words don't
        // over-match.
        let addedPartial = false;
        for (const p of dbProducts) {
          const pLow = p.name.toLowerCase();
          if (pLow === low) {
            resolved.set(p.id, p);
            addedPartial = true;
          } else if (low.length >= 8 && (pLow.includes(low) || low.includes(pLow))) {
            resolved.set(p.id, p);
            addedPartial = true;
          }
        }
        // Canonical-variant fallback — only fires when neither exact nor
        // partial matched. Purely additive; never replaces a partial hit.
        if (!addedPartial) {
          const hit = matchByNameVariants(alias, dbByCanonical);
          if (hit) resolved.set(hit.id, hit);
        }
      }
      return [...resolved.values()];
    }

    let edgesInserted = 0;
    let edgesSkippedDup = 0;
    const unmatchedFamilies: string[] = [];
    const edgeDetails: Array<{
      family: string;
      matchedDbProducts: string[];
      plateCodes: string[];
      edgesAdded: number;
    }> = [];

    for (const entry of compatibility) {
      const productsFound = resolveProducts(entry.product);
      if (productsFound.length === 0) {
        unmatchedFamilies.push(entry.product);
        continue;
      }
      let addedForEntry = 0;
      for (const plateCode of entry.plates) {
        const plateId = plateIdByCode[plateCode];
        if (!plateId) continue;
        for (const prod of productsFound) {
          const r = (await sqlClient`
            INSERT INTO base_plate_product_compatibility (base_plate_id, product_id)
            VALUES (${plateId}, ${prod.id})
            ON CONFLICT ON CONSTRAINT bp_compat_unique DO NOTHING
            RETURNING id
          `) as Array<{ id: string }>;
          if (r.length > 0) {
            edgesInserted++;
            addedForEntry++;
          } else {
            edgesSkippedDup++;
          }
        }
      }
      edgeDetails.push({
        family: entry.product,
        matchedDbProducts: productsFound.map((p) => p.name),
        plateCodes: entry.plates,
        edgesAdded: addedForEntry,
      });
    }

    return c.json({
      ok: true,
      summary: {
        platesInDataset: plates.length,
        platesInserted,
        platesUpserted: plates.length,
        compatibilityEntries: compatibility.length,
        unmatchedFamilies: unmatchedFamilies.length,
        dbProductsScanned: dbProducts.length,
        edgesInserted,
        edgesSkippedDup,
      },
      unmatchedFamilies,
      edgeDetails,
    });
  } catch (e: any) {
    console.error("ingest-base-plates failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Seed the Available Base Plates PDF into the resources table. The PDF is
// pre-uploaded to R2 at hardware/available-base-plates.pdf via wrangler
// before this runs; this endpoint just creates/refreshes the resources row
// so the /resources page lists it. Idempotent — matched by file_url.
app.post("/api/admin/upload-base-plates-pdf", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    const fileUrl = "/api/hardware/available-base-plates.pdf";
    const title = "Available Base Plates";
    const category = "Base Plates";
    const resourceType = "Technical Specifications";
    const description =
      "Compatibility matrix for A-SAFE base-plate SKUs (Standard Zinc nickel electrophoretic, Countersunk Bolts, SS 316 Standard, SS 316 Countersunk, Galvanised Steel) across all major barrier, bollard, rack-end, gate and height-restrictor product families. Lists which plate is stocked vs available on request.";

    const existing = (await sqlClient`
      SELECT id FROM resources WHERE file_url = ${fileUrl} LIMIT 1
    `) as Array<{ id: string }>;

    if (existing[0]) {
      await sqlClient`
        UPDATE resources
        SET title = ${title}, category = ${category},
            resource_type = ${resourceType}, description = ${description},
            file_type = 'pdf', updated_at = now(), is_active = true
        WHERE id = ${existing[0].id}
      `;
      return c.json({ ok: true, action: "updated", resourceId: existing[0].id });
    }

    const inserted = (await sqlClient`
      INSERT INTO resources (title, category, resource_type, description, file_url, file_type, is_active)
      VALUES (${title}, ${category}, ${resourceType}, ${description}, ${fileUrl}, 'pdf', true)
      RETURNING id
    `) as Array<{ id: string }>;

    return c.json({ ok: true, action: "inserted", resourceId: inserted[0]?.id });
  } catch (e: any) {
    console.error("upload-base-plates-pdf failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
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

// ─── GroundWorks: schema + ingest + R2 resource listing ──────────────
// Three MIGRATION_TOKEN-gated one-offs, same pattern as the sibling
// Product Suitability / Maintenance ingests above. Source doc:
// ASAFE_GroundWorks_PRH-1005-A-SAFE-26022024 (per-product installation
// prerequisites — slab thickness, concrete grade, anchor spec, anchor
// depth, edge distance, pad dimensions). 53 entries covering ~48 of
// the ~68 catalog families.

// Idempotent DDL. products.ground_works_data jsonb nullable.
app.post("/api/admin/apply-groundworks-schema", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    const pre = (await sqlClient`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'ground_works_data'
    `) as Array<{ column_name: string }>;
    const alreadyPresent = pre.length > 0;

    await sqlClient`ALTER TABLE products ADD COLUMN IF NOT EXISTS ground_works_data jsonb`;

    return c.json({
      ok: true,
      altered: alreadyPresent ? 0 : 1,
      columns: {
        "products.ground_works_data": alreadyPresent ? "already-present" : "added",
      },
    });
  } catch (e: any) {
    console.error("apply-groundworks-schema failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Ingest scripts/data/product-groundworks.json into
// products.ground_works_data. Fuzzy-matches each entry's productFamily to
// products.name using the same normaliser as /admin/sync-catalog-to-db
// and /admin/upload-certificates, so naming variants
// ("iFlex Single Traffic Barrier+" ↔ "iflex single traffic plus") converge.
// Idempotent — re-running overwrites with the same payload.
app.post("/api/admin/ingest-groundworks", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const datasetModule: any = await import(
      "../scripts/data/product-groundworks.json"
    );
    const dataset = datasetModule.default || datasetModule;
    const entries: any[] = dataset.entries || [];
    const meta = dataset._meta || {};

    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    // Build DB index by canonical (conservative) name. matchByNameVariants
    // tries canonical → strip-trailing → aggressive → substring in order,
    // so previously-matching rows still hit and additional "barrier/rail/
    // guard" variants now match too. See shared/nameNormalise.ts.
    const dbRows = (await sqlClient`SELECT id, name FROM products`) as any[];
    const byNorm = new Map<string, any>();
    for (const p of dbRows) {
      const k = normaliseCanonical(p.name);
      if (k && !byNorm.has(k)) byNorm.set(k, p);
    }

    let matched = 0;
    let dbRowsUpdated = 0;
    const unmatchedFamilies: string[] = [];
    const results: Array<{ family: string; dbId: string | null }> = [];

    for (const e of entries) {
      const family = e.productFamily as string;
      const product = matchByNameVariants(family, byNorm);
      if (!product) {
        unmatchedFamilies.push(family);
        results.push({ family, dbId: null });
        continue;
      }
      matched++;

      // Inline the global rules on each row so the product-detail block can
      // render without a second fetch (kept small — ~1kB per product).
      const payload = {
        ...e,
        _globalRules: meta.globalRules || null,
        _sourceDoc: meta.source || null,
      };

      const r = (await sqlClient`
        UPDATE products
        SET ground_works_data = ${JSON.stringify(payload)}::jsonb,
            updated_at = now()
        WHERE id = ${product.id}
        RETURNING id
      `) as any[];
      if (r.length > 0) dbRowsUpdated += r.length;
      results.push({ family, dbId: product.id });
    }

    return c.json({
      ok: true,
      summary: {
        entries: entries.length,
        matchedFamilies: matched,
        unmatchedFamilies: unmatchedFamilies.length,
        dbRowsUpdated,
      },
      unmatchedFamilies,
      results,
    });
  } catch (e: any) {
    console.error("ingest-groundworks failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

// Register the GroundWorks PDF as a resources row + link it to every
// product whose ground_works_data is non-null. The PDF is pre-uploaded
// to R2 at `groundworks/a-safe-groundworks-guide.pdf` by the deploy
// runbook and served via /api/groundworks/<slug>. Idempotent on
// (title, resource_type).
app.post("/api/admin/upload-groundworks-resource", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ ok: false, message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    const title = "A-SAFE Ground Works Guide";
    const resourceType = "Installation Guide";
    const category = "Installation";
    const description =
      "Per-product ground-prep and installation prerequisites: minimum slab thickness, concrete grade (BS 8500-1 / BS EN 206-1), anchor spec + depth, edge distance, concrete-pad dimensions, hardcore depth, substrate notes and drilling safety guidance. Source: PRH-1005-A-SAFE (Feb 2024).";
    const fileUrl = "/api/groundworks/a-safe-groundworks-guide.pdf";
    const thumbnailUrl =
      "https://webcdn.asafe.com/media/4250/atlas-double-traffic-barrier-ramp.jpg";
    // Approx PDF size (~28MB) for the resources row bookkeeping.
    const fileSize = 28 * 1024 * 1024;

    const existing = (await sqlClient`
      SELECT id FROM resources
      WHERE title = ${title} AND resource_type = ${resourceType}
      LIMIT 1
    `) as any[];

    let resourceId: string;
    let action: "created" | "refreshed";
    if (existing.length > 0) {
      resourceId = existing[0].id;
      action = "refreshed";
      await sqlClient`
        UPDATE resources
        SET description = ${description},
            file_url = ${fileUrl},
            thumbnail_url = ${thumbnailUrl},
            file_size = ${fileSize},
            file_type = 'pdf',
            category = ${category},
            is_active = true,
            updated_at = now()
        WHERE id = ${resourceId}
      `;
    } else {
      const rows = (await sqlClient`
        INSERT INTO resources (
          title, category, resource_type, description,
          file_url, thumbnail_url, file_size, file_type,
          download_count, is_active, created_at, updated_at
        ) VALUES (
          ${title}, ${category}, ${resourceType}, ${description},
          ${fileUrl}, ${thumbnailUrl}, ${fileSize}, 'pdf',
          0, true, now(), now()
        )
        RETURNING id
      `) as any[];
      resourceId = rows[0].id;
      action = "created";
    }

    // Link every product that has ground_works_data populated to this
    // resource via product_resources. ON CONFLICT keeps it idempotent.
    const linked = (await sqlClient`
      SELECT id FROM products WHERE ground_works_data IS NOT NULL
    `) as any[];
    let junctionsAdded = 0;
    for (const p of linked) {
      const r = (await sqlClient`
        INSERT INTO product_resources (product_id, resource_id)
        VALUES (${p.id}, ${resourceId})
        ON CONFLICT (product_id, resource_id) DO NOTHING
        RETURNING id
      `) as any[];
      if (r.length > 0) junctionsAdded++;
    }

    return c.json({
      ok: true,
      action,
      resourceId,
      title,
      resourceType,
      fileUrl,
      productsLinked: linked.length,
      junctionsAdded,
    });
  } catch (e: any) {
    console.error("upload-groundworks-resource failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
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

// Seed the `resources` table with the PAS 13:2017 standard. The PDF is
// pre-uploaded to R2 at `standards/pas-13-2017.pdf` (see the runbook).
// One resources row of type="Standard", category="Safety Standards",
// with fileUrl pointing at /api/standards/pas-13-2017.pdf so the
// Resources page streams it back out of R2.
//
// Idempotent on the resource slug (matched by title + resource_type) —
// re-running converges. Gated by MIGRATION_TOKEN (bearer), same pattern
// as the sibling /api/admin/upload-* endpoints.
app.post("/api/admin/seed-pas13-resource", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ ok: false, message: "MIGRATION_TOKEN not configured" }, 500);
  }
  const auth = c.req.header("authorization") || "";
  const provided = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!provided || provided !== expected) {
    return c.json({ ok: false, message: "Unauthorized" }, 401);
  }

  try {
    const title =
      "PAS 13:2017 — Code of practice for safety barriers used in traffic management";
    const description =
      "BSI PAS 13:2017 Code of practice for safety barriers used in traffic management within workplace environments, with test methods for safety barrier impact resilience. Covers risk assessment, safety-barrier design, kinetic-energy calculation, and pendulum / vehicle / sled-and-ramp impact test methods. This app is PAS 13 aligned and references the standard for structural guidance.";
    const resourceType = "Standard";
    const category = "Safety Standards";
    const fileUrl = "/api/standards/pas-13-2017.pdf";
    const thumbnailUrl: string | null = null;

    // Confirm the R2 object exists before we insert the DB row — otherwise
    // the Resources page will render a broken link. Defensive: the
    // upload step is manual (wrangler r2 object put) so this guards
    // against ordering mistakes.
    const bucket = c.env.R2_BUCKET;
    if (!bucket) {
      return c.json(
        { ok: false, message: "R2 bucket not configured" },
        500,
      );
    }
    const head = await bucket.head("standards/pas-13-2017.pdf");
    if (!head) {
      return c.json(
        {
          ok: false,
          message:
            "R2 object standards/pas-13-2017.pdf not found — upload the PDF before seeding.",
        },
        412,
      );
    }
    const fileSize = head.size ?? null;

    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    // Idempotency: does a resource with this title + type already exist?
    const existing = (await sqlClient`
      SELECT id
      FROM resources
      WHERE title = ${title} AND resource_type = ${resourceType}
      LIMIT 1
    `) as any[];

    if (existing.length > 0) {
      const resourceId = existing[0].id;
      // Keep description/url in sync in case the metadata was tweaked.
      await sqlClient`
        UPDATE resources
        SET description = ${description},
            file_url = ${fileUrl},
            file_size = ${fileSize},
            file_type = 'pdf',
            category = ${category},
            thumbnail_url = ${thumbnailUrl},
            is_active = true,
            updated_at = now()
        WHERE id = ${resourceId}
      `;
      return c.json({
        ok: true,
        resourceId,
        alreadyExists: true,
        fileUrl,
        fileSize,
      });
    }

    const rows = (await sqlClient`
      INSERT INTO resources (
        title, category, resource_type, description,
        file_url, thumbnail_url, file_size, file_type,
        download_count, is_active, created_at, updated_at
      ) VALUES (
        ${title}, ${category}, ${resourceType}, ${description},
        ${fileUrl}, ${thumbnailUrl}, ${fileSize}, 'pdf',
        0, true, now(), now()
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `) as any[];

    // ON CONFLICT DO NOTHING means an empty result set on a race — re-read
    // by title to return a deterministic id either way.
    let resourceId: string;
    if (rows.length > 0) {
      resourceId = rows[0].id;
    } else {
      const refetch = (await sqlClient`
        SELECT id FROM resources
        WHERE title = ${title} AND resource_type = ${resourceType}
        LIMIT 1
      `) as any[];
      if (refetch.length === 0) {
        return c.json(
          { ok: false, message: "Insert failed and no existing row found" },
          500,
        );
      }
      resourceId = refetch[0].id;
    }

    return c.json({
      ok: true,
      resourceId,
      alreadyExists: false,
      fileUrl,
      fileSize,
    });
  } catch (e: any) {
    console.error("seed-pas13-resource failed:", e);
    return c.json({ ok: false, message: e?.message || String(e) }, 500);
  }
});

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
      ctx.waitUntil(scanOverdueInstallations(env));
    } else {
      // Unknown schedule — run both to be safe; cheap and idempotent.
      ctx.waitUntil(runBackups(env));
      ctx.waitUntil(scanOverdueInstallations(env));
    }
  },
};
