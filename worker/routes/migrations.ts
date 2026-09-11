/**
 * Schema migrations — admin-driven, repeatable, no psql required.
 *
 *   GET  /api/admin/migrations        list every migration + its status
 *   POST /api/admin/migrations/apply  apply every pending migration in order
 *
 * Migrations are the .sql files in migrations/, embedded at build time via
 * migrations/index.ts (`npm run migrations:index`). Status lives in the
 * schema_migrations table, created here on first use. Files marked
 * `-- applied-historically: yes` ran through the old apply-*-schema
 * endpoints and are auto-recorded as applied the first time the list is
 * fetched, so they never execute again.
 *
 * Both routes need an admin session. Apply additionally requires
 * `Authorization: Bearer <MIGRATION_TOKEN>` when that secret is configured.
 * Each file runs inside its own transaction (Neon HTTP batch) followed by
 * the schema_migrations INSERT, so a failed statement leaves neither the
 * DDL nor the bookkeeping row behind.
 */
import { Hono, type Context } from "hono";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";
import { MIGRATIONS } from "../../migrations/index";

const migrations = new Hono<{ Bindings: Env; Variables: Variables }>();

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;
type Sql = NeonQueryFunction<false, false>;

interface AppliedRow {
  id: string;
  applied_at: string | null;
  applied_by: string | null;
  note: string | null;
}

export interface MigrationStatus {
  id: string;
  appliedHistorically: boolean;
  statementCount: number;
  status: "applied" | "pending";
  appliedAt: string | null;
  appliedBy: string | null;
  note: string | null;
}

export interface ApplyLogEntry {
  id: string;
  status: "applied" | "failed" | "skipped";
  statements: number;
  ms: number;
  error?: string;
}

/**
 * Split a .sql file into individual statements. Strips `--` comments
 * (full-line and inline) and splits on `;`, both only outside single-quoted
 * string literals so a `;` or `--` inside a literal is preserved. Double-
 * quoted identifiers are passed through untouched.
 */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (!inDouble && ch === "'") {
      inSingle = !inSingle;
      buf += ch;
      continue;
    }
    if (!inSingle && ch === '"') {
      inDouble = !inDouble;
      buf += ch;
      continue;
    }
    if (!inSingle && !inDouble && ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      buf += "\n";
      continue;
    }
    if (!inSingle && !inDouble && ch === ";") {
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

async function requireAdmin(c: AppContext): Promise<boolean> {
  const session = c.get("user");
  if (!session) return false;
  const storage = createStorage(getDb(c.env.DATABASE_URL));
  const user = await storage.getUser(session.claims.sub);
  return user?.role === "admin";
}

function actorOf(c: AppContext): string {
  const session = c.get("user") as any;
  return (
    (session?.claims?.email as string | undefined) ||
    (session?.claims?.sub as string | undefined) ||
    "admin"
  );
}

/**
 * Ensure schema_migrations exists, record historically-applied files that
 * are not yet tracked, and return the full status list in file order.
 */
async function loadStatus(
  sql: Sql,
): Promise<MigrationStatus[]> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      applied_by text,
      note text
    )
  `;

  const rows = (await sql`
    SELECT id, applied_at, applied_by, note FROM schema_migrations
  `) as AppliedRow[];
  const applied = new Map(rows.map((r) => [r.id, r]));

  for (const m of MIGRATIONS) {
    if (!m.appliedHistorically || applied.has(m.id)) continue;
    const inserted = (await sql`
      INSERT INTO schema_migrations (id, applied_by, note)
      VALUES (${m.id}, 'historical', 'historical')
      ON CONFLICT (id) DO NOTHING
      RETURNING id, applied_at, applied_by, note
    `) as AppliedRow[];
    if (inserted[0]) applied.set(m.id, inserted[0]);
  }

  return MIGRATIONS.map((m) => {
    const row = applied.get(m.id);
    return {
      id: m.id,
      appliedHistorically: m.appliedHistorically,
      statementCount: splitSqlStatements(m.sql).length,
      status: row ? "applied" : "pending",
      appliedAt: row?.applied_at ?? null,
      appliedBy: row?.applied_by ?? null,
      note: row?.note ?? null,
    };
  });
}

migrations.get("/admin/migrations", authMiddleware, async (c) => {
  if (!(await requireAdmin(c))) {
    return c.json({ message: "Admin access required" }, 403);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ message: "DATABASE_URL not configured" }, 500);
  }
  try {
    const sql = neon(c.env.DATABASE_URL);
    const rows = await loadStatus(sql);
    return c.json({
      migrations: rows,
      pending: rows.filter((r) => r.status === "pending").length,
      tokenRequired: Boolean(c.env.MIGRATION_TOKEN),
    });
  } catch (e: any) {
    console.error("GET /api/admin/migrations failed:", e);
    return c.json({ message: e?.message || String(e) }, 500);
  }
});

migrations.post("/admin/migrations/apply", authMiddleware, async (c) => {
  if (!(await requireAdmin(c))) {
    return c.json({ message: "Admin access required" }, 403);
  }
  if (!c.env.DATABASE_URL) {
    return c.json({ message: "DATABASE_URL not configured" }, 500);
  }
  const expected = c.env.MIGRATION_TOKEN;
  if (expected) {
    const header = c.req.header("authorization") || "";
    const provided = header.toLowerCase().startsWith("bearer ")
      ? header.slice(7).trim()
      : "";
    if (!provided || provided !== expected) {
      return c.json({ message: "Migration token required" }, 401);
    }
  }

  const log: ApplyLogEntry[] = [];
  try {
    const sql = neon(c.env.DATABASE_URL);
    const status = await loadStatus(sql);
    const pending = status.filter((s) => s.status === "pending");
    const actor = actorOf(c);
    let failed = false;

    for (const entry of pending) {
      const file = MIGRATIONS.find((m) => m.id === entry.id)!;
      const statements = splitSqlStatements(file.sql);
      if (failed) {
        log.push({ id: entry.id, status: "skipped", statements: statements.length, ms: 0 });
        continue;
      }
      const started = Date.now();
      try {
        await sql.transaction((txn) => [
          ...statements.map((s) => txn(s)),
          txn`
            INSERT INTO schema_migrations (id, applied_by, note)
            VALUES (${entry.id}, ${actor}, 'applied via /admin/migrations')
            ON CONFLICT (id) DO NOTHING
          `,
        ]);
        log.push({
          id: entry.id,
          status: "applied",
          statements: statements.length,
          ms: Date.now() - started,
        });
      } catch (e: any) {
        failed = true;
        log.push({
          id: entry.id,
          status: "failed",
          statements: statements.length,
          ms: Date.now() - started,
          error: e?.message || String(e),
        });
        console.error(`[migrations] ${entry.id} failed:`, e);
      }
    }

    return c.json(
      {
        ok: !failed,
        applied: log.filter((l) => l.status === "applied").length,
        log,
      },
      failed ? 500 : 200,
    );
  } catch (e: any) {
    console.error("POST /api/admin/migrations/apply failed:", e);
    return c.json({ ok: false, message: e?.message || String(e), log }, 500);
  }
});

export default migrations;
