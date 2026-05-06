// ────────────────────────────────────────────────────────────────────────────
// worker/routes/communication.ts
//
// Communication Plan — pre-written templates + trigger-based suggestions for
// rep-to-customer comms. Reps pick a template (or auto-receive a suggestion
// from the daily scanner), the server renders {{placeholders}} from the
// active project, and the rep ships it via WhatsApp deeplink or email.
//
// Endpoints (all authed unless noted):
//   GET    /api/communication/templates                — list active templates
//   GET    /api/communication/templates/:id/render     — placeholder-fill
//   GET    /api/communication/suggestions              — pending for current rep
//   POST   /api/communication/suggestions/:id/dismiss  — drop a pending one
//   POST   /api/communication/suggestions/:id/sent     — mark approved+sent
//   POST   /api/communication/suggestions/scan         — admin: run the daily
//                                                        trigger scanner now
//   POST   /api/admin/communication/templates          — admin: create
//   PATCH  /api/admin/communication/templates/:id      — admin: edit
//
// HARD RULES (mirrors A-SAFE / σ policy):
//   - Templates use "PAS 13 aligned" — never "compliant".
//   - The scanner NEVER sends messages. It only writes a comm_suggestions row
//     for a rep to approve. All sends are click-to-approve in the UI.
//   - Persistence is defensive: CREATE TABLE IF NOT EXISTS so the route
//     functions even if the migration endpoint hasn't been run yet.
// ────────────────────────────────────────────────────────────────────────────

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { mutationRateLimit } from "../middleware/rateLimiter";
import { getDb } from "../db";
import { createStorage } from "../storage";
import {
  DEFAULT_COMM_TEMPLATES,
  renderTemplate,
  type CommPlaceholders,
} from "../../shared/commTemplates";

const communication = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── DDL — defensive create on first request ────────────────────────────
let didEnsureDdl = false;
async function ensureCommTables(env: Env): Promise<void> {
  if (didEnsureDdl) return;
  if (!env.DATABASE_URL) return;
  const { neon } = await import("@neondatabase/serverless");
  const sqlClient = neon(env.DATABASE_URL);
  await sqlClient`
    CREATE TABLE IF NOT EXISTS comm_templates (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      scenario VARCHAR NOT NULL,
      title VARCHAR NOT NULL,
      channel VARCHAR NOT NULL,
      subject VARCHAR,
      body TEXT NOT NULL,
      trigger_event VARCHAR,
      trigger_offset_days INTEGER,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    )
  `;
  await sqlClient`CREATE INDEX IF NOT EXISTS comm_templates_scenario_idx ON comm_templates(scenario)`;
  await sqlClient`CREATE INDEX IF NOT EXISTS comm_templates_trigger_idx ON comm_templates(trigger_event)`;

  await sqlClient`
    CREATE TABLE IF NOT EXISTS comm_suggestions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id VARCHAR REFERENCES projects(id) ON DELETE CASCADE,
      template_id VARCHAR REFERENCES comm_templates(id) ON DELETE SET NULL,
      suggested_at TIMESTAMP DEFAULT now(),
      due_at TIMESTAMP,
      status VARCHAR DEFAULT 'pending',
      rendered_body TEXT,
      rendered_subject VARCHAR,
      rep_user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT now(),
      updated_at TIMESTAMP DEFAULT now()
    )
  `;
  await sqlClient`CREATE INDEX IF NOT EXISTS comm_suggestions_rep_idx ON comm_suggestions(rep_user_id)`;
  await sqlClient`CREATE INDEX IF NOT EXISTS comm_suggestions_project_idx ON comm_suggestions(project_id)`;
  await sqlClient`CREATE INDEX IF NOT EXISTS comm_suggestions_status_idx ON comm_suggestions(status)`;
  didEnsureDdl = true;
}

// ─── Helpers ────────────────────────────────────────────────────────────

async function requireAdmin(c: any): Promise<boolean> {
  const session = c.get("user");
  if (!session) return false;
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const user = await storage.getUser(session.claims.sub);
  return user?.role === "admin";
}

// Build the placeholder map for a project. Pulls customer / site /
// rep / latest-quote info via Drizzle/storage where available, falling
// back to plain SQL for anything else. Keep this in sync with
// shared/commTemplates.ts placeholder list.
async function buildPlaceholders(
  env: Env,
  projectId: string | null,
  repUserId: string | null,
): Promise<CommPlaceholders> {
  const out: CommPlaceholders = {};
  if (!env.DATABASE_URL) return out;

  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(env.DATABASE_URL);

  // Rep info — first/last name + email + phone (from users.phone).
  if (repUserId) {
    try {
      const rows = (await sql`
        SELECT first_name, last_name, email, phone, job_title
        FROM users WHERE id = ${repUserId} LIMIT 1
      `) as any[];
      const r = rows[0];
      if (r) {
        out.rep_name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "your A-SAFE rep";
        out.rep_email = r.email || "";
        out.rep_phone = r.phone || "";
        out.rep_title = r.job_title || "";
      }
    } catch (err) {
      console.warn("[comm] rep lookup failed:", err);
    }
  }

  if (projectId) {
    try {
      const rows = (await sql`
        SELECT
          p.name AS project_name,
          p.location AS project_location,
          p.description AS project_description,
          p.default_delivery_address,
          p.id AS project_id,
          cc.name AS customer_company_name,
          cc.id AS customer_company_id
        FROM projects p
        LEFT JOIN customer_companies cc ON cc.id = p.customer_company_id
        WHERE p.id = ${projectId} LIMIT 1
      `) as any[];
      const r = rows[0];
      if (r) {
        out.project_name = r.project_name || "";
        out.project_ref = `ENG-PRJ-${(r.project_id || "").slice(0, 8).toUpperCase()}`;
        out.site_address = r.default_delivery_address || r.project_location || "";
        out.customer_name = r.customer_company_name || "";
        out.customer_company = r.customer_company_name || "";
      }

      // Primary customer contact for {{customer_first_name}}.
      const contactRows = (await sql`
        SELECT name, email, mobile
        FROM project_contacts
        WHERE project_id = ${projectId}
        ORDER BY
          CASE WHEN role = 'primary' THEN 0 ELSE 1 END,
          last_interacted_at DESC NULLS LAST,
          created_at DESC
        LIMIT 1
      `) as any[];
      const c0 = contactRows[0];
      if (c0) {
        out.customer_contact_name = c0.name || "";
        out.customer_first_name = (c0.name || "").split(" ")[0] || "";
        out.customer_email = c0.email || "";
        out.customer_phone = c0.mobile || "";
      }

      // Latest sent quote for the project — drives {{quote_ref}} +
      // {{quote_total_aed}}. Looks at quote_drafts first, then orders
      // (which carries customOrderNumber that matches A-SAFE CRM).
      let quoteRows: any[] = [];
      try {
        quoteRows = (await sql`
          SELECT id, total_aed, created_at
          FROM quote_drafts
          WHERE project_id = ${projectId}
          ORDER BY created_at DESC
          LIMIT 1
        `) as any[];
      } catch {
        quoteRows = [];
      }
      if (quoteRows[0]) {
        const q = quoteRows[0];
        out.quote_ref = `ENG_QUOAE${(q.id || "").slice(0, 6).toUpperCase()}`;
        if (q.total_aed != null) {
          out.quote_total_aed = Number(q.total_aed).toLocaleString("en-AE", {
            style: "currency",
            currency: "AED",
            minimumFractionDigits: 2,
          });
        }
      }

      // Installation date for {{install_date}}.
      let installRows: any[] = [];
      try {
        installRows = (await sql`
          SELECT planned_start
          FROM installations
          WHERE project_id = ${projectId}
          ORDER BY planned_start DESC NULLS LAST
          LIMIT 1
        `) as any[];
      } catch {
        installRows = [];
      }
      if (installRows[0]?.planned_start) {
        const d = new Date(installRows[0].planned_start);
        out.install_date = d.toLocaleDateString("en-GB", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }
    } catch (err) {
      console.warn("[comm] project lookup failed:", err);
    }
  }

  // Static defaults so a missing field renders sensibly rather than as
  // a literal "{{customer_name}}" in the customer's inbox.
  out.company_name = out.company_name || "A-SAFE";
  out.rep_name = out.rep_name || "your A-SAFE rep";
  return out;
}

// ─── GET /api/communication/templates ──────────────────────────────────
communication.get("/communication/templates", authMiddleware, async (c) => {
  await ensureCommTables(c.env).catch(() => {});

  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(c.env.DATABASE_URL);
  try {
    const rows = (await sql`
      SELECT id, scenario, title, channel, subject, body, trigger_event,
             trigger_offset_days, is_active
      FROM comm_templates
      WHERE is_active = true
      ORDER BY scenario, title
    `) as any[];
    return c.json(rows);
  } catch (err: any) {
    console.error("[comm] list templates failed:", err);
    return c.json({ message: err?.message || "Failed to load templates" }, 500);
  }
});

// ─── GET /api/communication/templates/:id/render?projectId=… ──────────
// Renders the placeholders against the chosen project (defaults to the
// rep's active project when projectId omitted). Returns plain text for
// WhatsApp templates, retains markdown/HTML for email templates.
communication.get(
  "/communication/templates/:id/render",
  authMiddleware,
  async (c) => {
    await ensureCommTables(c.env).catch(() => {});
    const id = c.req.param("id");
    const userId = c.get("user").claims.sub;
    const projectIdParam = c.req.query("projectId");

    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(c.env.DATABASE_URL);

    try {
      const rows = (await sql`
        SELECT id, scenario, title, channel, subject, body, trigger_event,
               trigger_offset_days, is_active
        FROM comm_templates
        WHERE id = ${id}
        LIMIT 1
      `) as any[];
      const tmpl = rows[0];
      if (!tmpl) return c.json({ message: "Template not found" }, 404);

      // Resolve the project: query string > active project.
      let projectId = projectIdParam || null;
      if (!projectId) {
        const activeRows = (await sql`
          SELECT active_project_id FROM users WHERE id = ${userId} LIMIT 1
        `) as any[];
        projectId = activeRows[0]?.active_project_id || null;
      }

      const placeholders = await buildPlaceholders(c.env, projectId, userId);
      const renderedBody = renderTemplate(tmpl.body, placeholders, tmpl.channel);
      const renderedSubject = tmpl.subject
        ? renderTemplate(tmpl.subject, placeholders, "email")
        : null;

      return c.json({
        id: tmpl.id,
        scenario: tmpl.scenario,
        title: tmpl.title,
        channel: tmpl.channel,
        subject: renderedSubject,
        body: renderedBody,
        placeholders,
        projectId,
      });
    } catch (err: any) {
      console.error("[comm] render failed:", err);
      return c.json({ message: err?.message || "Failed to render template" }, 500);
    }
  },
);

// ─── GET /api/communication/suggestions ────────────────────────────────
// Pending suggestions for the calling rep. Includes a flattened template
// snapshot so the UI doesn't need a second round-trip.
communication.get("/communication/suggestions", authMiddleware, async (c) => {
  await ensureCommTables(c.env).catch(() => {});
  const userId = c.get("user").claims.sub;

  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(c.env.DATABASE_URL);
  try {
    const rows = (await sql`
      SELECT
        s.id, s.project_id, s.template_id, s.suggested_at, s.due_at,
        s.status, s.rendered_body, s.rendered_subject, s.rep_user_id,
        t.scenario, t.title, t.channel, t.subject AS template_subject,
        p.name AS project_name,
        cc.name AS customer_company_name
      FROM comm_suggestions s
      LEFT JOIN comm_templates t ON t.id = s.template_id
      LEFT JOIN projects p ON p.id = s.project_id
      LEFT JOIN customer_companies cc ON cc.id = p.customer_company_id
      WHERE s.rep_user_id = ${userId}
        AND s.status = 'pending'
      ORDER BY s.due_at ASC NULLS LAST, s.suggested_at DESC
    `) as any[];
    return c.json(rows);
  } catch (err: any) {
    console.error("[comm] list suggestions failed:", err);
    return c.json({ message: err?.message || "Failed to load suggestions" }, 500);
  }
});

// ─── POST /api/communication/suggestions/:id/dismiss ──────────────────
communication.post(
  "/communication/suggestions/:id/dismiss",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    await ensureCommTables(c.env).catch(() => {});
    const id = c.req.param("id");
    const userId = c.get("user").claims.sub;

    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(c.env.DATABASE_URL);
    try {
      const result = (await sql`
        UPDATE comm_suggestions
        SET status = 'dismissed', updated_at = now()
        WHERE id = ${id} AND rep_user_id = ${userId}
        RETURNING id
      `) as any[];
      if (!result.length) return c.json({ message: "Not found" }, 404);
      return c.json({ ok: true });
    } catch (err: any) {
      console.error("[comm] dismiss failed:", err);
      return c.json({ message: err?.message || "Failed to dismiss" }, 500);
    }
  },
);

// ─── POST /api/communication/suggestions/:id/sent ────────────────────
// Stamped after the rep has clicked "Open in WhatsApp" or "Open Email"
// AND confirmed they pressed send (the UI prompts them — we don't
// auto-send anything from the server).
communication.post(
  "/communication/suggestions/:id/sent",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    await ensureCommTables(c.env).catch(() => {});
    const id = c.req.param("id");
    const userId = c.get("user").claims.sub;

    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(c.env.DATABASE_URL);
    try {
      const result = (await sql`
        UPDATE comm_suggestions
        SET status = 'sent', updated_at = now()
        WHERE id = ${id} AND rep_user_id = ${userId}
        RETURNING id
      `) as any[];
      if (!result.length) return c.json({ message: "Not found" }, 404);
      return c.json({ ok: true });
    } catch (err: any) {
      console.error("[comm] mark-sent failed:", err);
      return c.json({ message: err?.message || "Failed to mark sent" }, 500);
    }
  },
);

// ─── POST /api/admin/communication/templates ──────────────────────────
communication.post(
  "/admin/communication/templates",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    if (!(await requireAdmin(c))) {
      return c.json({ message: "Admin access required" }, 403);
    }
    await ensureCommTables(c.env).catch(() => {});

    const body = await c.req.json<{
      scenario: string;
      title: string;
      channel: "whatsapp" | "email" | "both";
      subject?: string;
      body: string;
      triggerEvent?: string | null;
      triggerOffsetDays?: number | null;
      isActive?: boolean;
    }>();

    if (!body.scenario || !body.title || !body.body || !body.channel) {
      return c.json({ message: "scenario, title, channel, body are required" }, 400);
    }

    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(c.env.DATABASE_URL);
    try {
      const rows = (await sql`
        INSERT INTO comm_templates
          (scenario, title, channel, subject, body, trigger_event,
           trigger_offset_days, is_active)
        VALUES (
          ${body.scenario},
          ${body.title},
          ${body.channel},
          ${body.subject ?? null},
          ${body.body},
          ${body.triggerEvent ?? null},
          ${body.triggerOffsetDays ?? null},
          ${body.isActive ?? true}
        )
        RETURNING *
      `) as any[];
      return c.json(rows[0], 201);
    } catch (err: any) {
      console.error("[comm] create template failed:", err);
      return c.json({ message: err?.message || "Failed to create template" }, 500);
    }
  },
);

// ─── PATCH /api/admin/communication/templates/:id ────────────────────
communication.patch(
  "/admin/communication/templates/:id",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    if (!(await requireAdmin(c))) {
      return c.json({ message: "Admin access required" }, 403);
    }
    await ensureCommTables(c.env).catch(() => {});
    const id = c.req.param("id");
    const body = await c.req.json<{
      scenario?: string;
      title?: string;
      channel?: "whatsapp" | "email" | "both";
      subject?: string | null;
      body?: string;
      triggerEvent?: string | null;
      triggerOffsetDays?: number | null;
      isActive?: boolean;
    }>();

    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(c.env.DATABASE_URL);
    try {
      // Build a single COALESCE-style UPDATE so callers can patch any
      // subset of fields without us hand-rolling N variants.
      const rows = (await sql`
        UPDATE comm_templates SET
          scenario = COALESCE(${body.scenario ?? null}, scenario),
          title = COALESCE(${body.title ?? null}, title),
          channel = COALESCE(${body.channel ?? null}, channel),
          subject = ${body.subject === undefined ? sql`subject` : body.subject},
          body = COALESCE(${body.body ?? null}, body),
          trigger_event = ${body.triggerEvent === undefined ? sql`trigger_event` : body.triggerEvent},
          trigger_offset_days = ${body.triggerOffsetDays === undefined ? sql`trigger_offset_days` : body.triggerOffsetDays},
          is_active = COALESCE(${body.isActive ?? null}, is_active),
          updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `) as any[];
      if (!rows.length) return c.json({ message: "Not found" }, 404);
      return c.json(rows[0]);
    } catch (err: any) {
      console.error("[comm] patch template failed:", err);
      return c.json({ message: err?.message || "Failed to patch template" }, 500);
    }
  },
);

// ─── POST /api/communication/suggestions/scan ────────────────────────
// On-demand trigger scan. The same logic runs daily via the cron
// handler in worker/index.ts. Admin-only because mass-suggesting on a
// fresh DB can fan out to a lot of rows.
communication.post(
  "/communication/suggestions/scan",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    if (!(await requireAdmin(c))) {
      return c.json({ message: "Admin access required" }, 403);
    }
    const { scanCommSuggestions } = await import("../scheduled/commSuggestionsScanner");
    const result = await scanCommSuggestions(c.env);
    return c.json(result);
  },
);

export default communication;

// ─── Default templates export ────────────────────────────────────────
// Re-exported so the migration endpoint in worker/index.ts can seed
// them without a circular import on the route file. Keep DEFAULT_COMM
// _TEMPLATES as the source of truth in shared/commTemplates.ts.
export { DEFAULT_COMM_TEMPLATES };
