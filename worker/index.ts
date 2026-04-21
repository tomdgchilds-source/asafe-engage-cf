import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, Variables } from "./types";
import { authMiddleware } from "./middleware/auth";
import { securityHeaders } from "./middleware/securityHeaders";
import { getDb } from "./db";
import { createStorage } from "./storage";

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

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Security headers on EVERY response — including the SPA shell served
// via the ASSETS fallback. Mounted first so it wraps all routes below.
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

export default app;
