// ────────────────────────────────────────────────────────────────────────────
// worker/scheduled/commSuggestionsScanner.ts
//
// Daily scan that walks every active project and turns trigger events into
// pending comm_suggestions rows. Runs at 06:30 UTC via the cron handler in
// worker/index.ts (chained off the existing daily 0 6 * * * trigger).
//
// What "trigger" means here: a real event that fired on the project (eg. a
// site survey was marked completed, a quote was sent, an installation was
// scheduled). The scanner looks at the timestamps of those events and
// matches them against comm_templates.trigger_event + trigger_offset_days.
//
// Idempotency: a suggestion row is identified by (project_id, template_id,
// trigger_event_at). If a row with the same triple is already 'pending' or
// 'sent', we skip. Dismissed rows are NOT re-suggested either — once a rep
// kills a suggestion it stays killed for that event.
//
// What this DOES NOT do: send messages. The scanner only ever writes a
// pending row. The rep approves and sends from the UI — see the brief.
// ────────────────────────────────────────────────────────────────────────────

import type { Env } from "../types";

interface ScanResult {
  ok: boolean;
  scannedProjects: number;
  newSuggestions: number;
  skippedExisting: number;
  errors: number;
  message?: string;
}

export async function scanCommSuggestions(env: Env): Promise<ScanResult> {
  if (!env.DATABASE_URL) {
    return {
      ok: false,
      scannedProjects: 0,
      newSuggestions: 0,
      skippedExisting: 0,
      errors: 0,
      message: "DATABASE_URL missing",
    };
  }

  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(env.DATABASE_URL);

  // Defensive DDL — same shape as worker/routes/communication.ts so the
  // scanner can run cold against a fresh DB.
  try {
    await sql`
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
  } catch (err) {
    console.warn("[comm/scan] DDL ensure failed:", err);
  }

  // Pull every active template that wants a trigger.
  const templates = (await sql`
    SELECT id, scenario, title, channel, subject, body, trigger_event,
           trigger_offset_days
    FROM comm_templates
    WHERE is_active = true
      AND trigger_event IS NOT NULL
  `) as any[];

  if (!templates.length) {
    return {
      ok: true,
      scannedProjects: 0,
      newSuggestions: 0,
      skippedExisting: 0,
      errors: 0,
      message: "no triggered templates configured",
    };
  }

  // Bucket templates by trigger event so we issue one project-wide query
  // per event type instead of N per template.
  const byEvent = new Map<string, any[]>();
  for (const t of templates) {
    const k = t.trigger_event as string;
    if (!byEvent.has(k)) byEvent.set(k, []);
    byEvent.get(k)!.push(t);
  }

  let scanned = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;
  const now = new Date();

  // Active projects — owned by a real rep (so rep_user_id is populated).
  const projects = (await sql`
    SELECT id, name, user_id, status
    FROM projects
    WHERE status IS NULL OR status IN ('active', 'won')
  `) as any[];
  scanned = projects.length;

  // ─── Helper: resolve the trigger event timestamp per project ───────
  // Each event needs a different join. Instead of branching inside the
  // project loop, we batch-load every event's timestamp keyed by
  // project_id, then look up O(1) inside the loop.
  const eventTimestamps = new Map<string, Map<string, Date>>();

  async function loadEventTimestamps(event: string) {
    if (eventTimestamps.has(event)) return;
    const map = new Map<string, Date>();
    try {
      switch (event) {
        case "site-survey-complete": {
          // siteSurveys.status = 'completed' OR siteSurveys.status = 'shared'.
          // We use updated_at as the "completed at" timestamp because there
          // isn't a dedicated completedAt column.
          const rows = (await sql`
            SELECT user_id, updated_at
            FROM site_surveys
            WHERE status IN ('completed', 'shared')
          `) as any[];
          // siteSurveys aren't keyed to project_id directly — they're
          // keyed to user_id. We use the rep's most-recent active project
          // when the survey doesn't have an explicit projectId. Skip
          // gracefully if the survey was for a different rep's project.
          for (const r of rows) {
            // Use user_id as the lookup key; the project loop will check
            // that the project belongs to that user.
            const k = `user:${r.user_id}`;
            const existing = map.get(k);
            const ts = new Date(r.updated_at);
            if (!existing || ts > existing) map.set(k, ts);
          }
          break;
        }
        case "quote-sent": {
          const rows = (await sql`
            SELECT project_id, updated_at
            FROM quote_drafts
            WHERE status IN ('sent', 'shared')
              AND project_id IS NOT NULL
          `) as any[];
          for (const r of rows) {
            const ts = new Date(r.updated_at);
            const existing = map.get(r.project_id);
            if (!existing || ts > existing) map.set(r.project_id, ts);
          }
          break;
        }
        case "order-confirmed": {
          // Either an order moved past 'pending' OR the project was
          // marked won. We pick whichever happened first.
          let orderRows: any[] = [];
          try {
            orderRows = (await sql`
              SELECT o.id, o.user_id, o.status, o.updated_at,
                     o.created_at,
                     p.id AS project_id
              FROM orders o
              LEFT JOIN projects p ON p.user_id = o.user_id
                AND p.name IS NOT DISTINCT FROM o.project_name
              WHERE o.status IN ('submitted_for_review', 'processing', 'fulfilled', 'shipped')
            `) as any[];
          } catch {
            orderRows = [];
          }
          for (const r of orderRows) {
            if (!r.project_id) continue;
            const ts = new Date(r.updated_at || r.created_at);
            const existing = map.get(r.project_id);
            if (!existing || ts < existing) map.set(r.project_id, ts);
          }
          const wonRows = (await sql`
            SELECT id, updated_at FROM projects WHERE status = 'won'
          `) as any[];
          for (const r of wonRows) {
            const ts = new Date(r.updated_at);
            const existing = map.get(r.id);
            if (!existing || ts < existing) map.set(r.id, ts);
          }
          break;
        }
        case "install-scheduled": {
          const rows = (await sql`
            SELECT project_id, planned_start
            FROM installations
            WHERE planned_start IS NOT NULL
              AND project_id IS NOT NULL
          `) as any[];
          for (const r of rows) {
            const ts = new Date(r.planned_start);
            const existing = map.get(r.project_id);
            if (!existing || ts > existing) map.set(r.project_id, ts);
          }
          break;
        }
        case "install-completed": {
          const rows = (await sql`
            SELECT project_id, actual_end, updated_at
            FROM installations
            WHERE status = 'completed'
              AND project_id IS NOT NULL
          `) as any[];
          for (const r of rows) {
            const ts = new Date(r.actual_end || r.updated_at);
            const existing = map.get(r.project_id);
            if (!existing || ts > existing) map.set(r.project_id, ts);
          }
          break;
        }
        case "order-delivered": {
          let rows: any[] = [];
          try {
            rows = (await sql`
              SELECT o.user_id, o.updated_at, p.id AS project_id
              FROM orders o
              LEFT JOIN projects p ON p.user_id = o.user_id
                AND p.name IS NOT DISTINCT FROM o.project_name
              WHERE o.status IN ('fulfilled', 'shipped')
            `) as any[];
          } catch {
            rows = [];
          }
          for (const r of rows) {
            if (!r.project_id) continue;
            const ts = new Date(r.updated_at);
            const existing = map.get(r.project_id);
            if (!existing || ts > existing) map.set(r.project_id, ts);
          }
          break;
        }
        default:
          // Unknown event — leave the map empty, the project loop will skip.
          break;
      }
    } catch (err) {
      console.warn(`[comm/scan] event lookup ${event} failed:`, err);
      errors += 1;
    }
    eventTimestamps.set(event, map);
  }

  for (const event of Array.from(byEvent.keys())) {
    await loadEventTimestamps(event);
  }

  // For each project × triggered template, decide if we need to insert.
  for (const project of projects) {
    for (const [event, tmpls] of Array.from(byEvent.entries())) {
      const map = eventTimestamps.get(event)!;
      const eventAt =
        map.get(project.id) ||
        // Survey case — keyed by user_id rather than project_id.
        map.get(`user:${project.user_id}`);
      if (!eventAt) continue;

      for (const tmpl of tmpls) {
        const offsetDays = tmpl.trigger_offset_days ?? 0;
        const dueAt = new Date(eventAt.getTime() + offsetDays * 86_400_000);
        // Skip suggestions whose due date hasn't arrived yet.
        if (dueAt > now) continue;

        try {
          // Idempotency check — same project + template + bucket of
          // event time (rounded to the day) means we've seen this trigger
          // already and shouldn't double-suggest.
          const existing = (await sql`
            SELECT id, status FROM comm_suggestions
            WHERE project_id = ${project.id}
              AND template_id = ${tmpl.id}
              AND DATE(due_at) = ${dueAt.toISOString().slice(0, 10)}
            LIMIT 1
          `) as any[];
          if (existing.length) {
            skipped += 1;
            continue;
          }

          // Dynamic placeholders — keep this lightweight in the scanner;
          // the API render endpoint can re-render fresher data when the
          // rep opens it. We pre-render so the suggestion list shows
          // something meaningful even if the rep is offline.
          const renderedBody = await renderQuick(sql, project.id, project.user_id, tmpl);
          const renderedSubject = tmpl.subject
            ? await renderQuickField(sql, project.id, project.user_id, tmpl.subject)
            : null;

          await sql`
            INSERT INTO comm_suggestions
              (project_id, template_id, due_at, status, rendered_body,
               rendered_subject, rep_user_id)
            VALUES (
              ${project.id},
              ${tmpl.id},
              ${dueAt.toISOString()},
              'pending',
              ${renderedBody},
              ${renderedSubject},
              ${project.user_id}
            )
          `;
          created += 1;
        } catch (err) {
          console.warn(
            `[comm/scan] insert failed for project=${project.id} template=${tmpl.id}:`,
            err,
          );
          errors += 1;
        }
      }
    }
  }

  console.log(
    `[comm/scan] done — scanned=${scanned} created=${created} skipped=${skipped} errors=${errors}`,
  );

  return {
    ok: true,
    scannedProjects: scanned,
    newSuggestions: created,
    skippedExisting: skipped,
    errors,
  };
}

// ─── Inline placeholder build — tighter than the route helper because we
// don't want N extra queries per (project × template). One project read
// per inserted row, cached locally.

const projectCache = new Map<
  string,
  {
    customer_first_name: string;
    customer_company: string;
    project_name: string;
    project_ref: string;
    site_address: string;
    rep_name: string;
    company_name: string;
    quote_ref: string;
    quote_total_aed: string;
    install_date: string;
  }
>();

async function loadProjectContext(
  sql: any,
  projectId: string,
  userId: string,
) {
  if (projectCache.has(projectId)) return projectCache.get(projectId)!;

  const rows = (await sql`
    SELECT p.name AS project_name, p.location, p.default_delivery_address,
           p.id, cc.name AS customer_company_name
    FROM projects p
    LEFT JOIN customer_companies cc ON cc.id = p.customer_company_id
    WHERE p.id = ${projectId} LIMIT 1
  `) as any[];
  const r = rows[0] || {};

  const contactRows = (await sql`
    SELECT name FROM project_contacts
    WHERE project_id = ${projectId}
    ORDER BY
      CASE WHEN role = 'primary' THEN 0 ELSE 1 END,
      created_at DESC
    LIMIT 1
  `) as any[];

  const repRows = (await sql`
    SELECT first_name, last_name FROM users WHERE id = ${userId} LIMIT 1
  `) as any[];

  let quoteRows: any[] = [];
  try {
    quoteRows = (await sql`
      SELECT id, total_aed FROM quote_drafts
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC LIMIT 1
    `) as any[];
  } catch {
    quoteRows = [];
  }

  let installRows: any[] = [];
  try {
    installRows = (await sql`
      SELECT planned_start FROM installations
      WHERE project_id = ${projectId} AND planned_start IS NOT NULL
      ORDER BY planned_start DESC LIMIT 1
    `) as any[];
  } catch {
    installRows = [];
  }

  const ctx = {
    customer_first_name: ((contactRows[0]?.name || "") as string).split(" ")[0] || "there",
    customer_company: r.customer_company_name || "",
    project_name: r.project_name || "your project",
    project_ref: `ENG-PRJ-${(r.id || "").slice(0, 8).toUpperCase()}`,
    site_address: r.default_delivery_address || r.location || "your site",
    rep_name:
      [repRows[0]?.first_name, repRows[0]?.last_name]
        .filter(Boolean)
        .join(" ") || "your A-SAFE rep",
    company_name: "A-SAFE",
    quote_ref: quoteRows[0]
      ? `ENG_QUOAE${(quoteRows[0].id || "").slice(0, 6).toUpperCase()}`
      : "",
    quote_total_aed: quoteRows[0]?.total_aed
      ? Number(quoteRows[0].total_aed).toLocaleString("en-AE", {
          style: "currency",
          currency: "AED",
          minimumFractionDigits: 2,
        })
      : "",
    install_date: installRows[0]?.planned_start
      ? new Date(installRows[0].planned_start).toLocaleDateString("en-GB", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "",
  };
  projectCache.set(projectId, ctx);
  return ctx;
}

async function renderQuick(
  sql: any,
  projectId: string,
  userId: string,
  tmpl: any,
): Promise<string> {
  const ctx = await loadProjectContext(sql, projectId, userId);
  return tmpl.body.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m: string, k: string) => {
    const v = (ctx as any)[k];
    if (v === undefined || v === null || v === "") return `{{${k}}}`;
    return String(v);
  });
}

async function renderQuickField(
  sql: any,
  projectId: string,
  userId: string,
  field: string,
): Promise<string> {
  const ctx = await loadProjectContext(sql, projectId, userId);
  return field.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m: string, k: string) => {
    const v = (ctx as any)[k];
    if (v === undefined || v === null || v === "") return `{{${k}}}`;
    return String(v);
  });
}
