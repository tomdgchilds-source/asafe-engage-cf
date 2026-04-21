import { Hono } from "hono";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { mutationRateLimit } from "../middleware/rateLimiter";
import { getDb, type Database } from "../db";
import { createStorage } from "../storage";
import {
  installations,
  installationPhases,
  installationMilestones,
  installationAssignments,
  installTeams,
  orders,
  projects,
  customerCompanies,
} from "../../shared/schema";

// ═══════════════════════════════════════════════════════════════════
// Installation Timeline
//
// Read-wide / write-tracked: every authed user can see every install
// + team, writes stamp createdBy/updatedBy. Admin-only for delete.
//
// Auto-creation entry point is ensureInstallationForOrder — exported
// so the order-status handler (orders.ts) and project-status handler
// (projects.ts) can call it when an order transitions into a "won"
// state. Idempotent on orderId via the partial-unique index.
// ═══════════════════════════════════════════════════════════════════

const installationsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Default phase template ─────────────────────────────────────────
// Simple/standard/complex drive installation day count; the rest are
// generic across the board. `offsetDays` is cumulative from plannedStart.
type PhaseTemplate = {
  name: string;
  description: string;
  durationDays: number;
};

function phaseTemplateFor(complexity: string): PhaseTemplate[] {
  const installDays = complexity === "simple" ? 3 : complexity === "complex" ? 10 : 5;
  const surveyDays = complexity === "complex" ? 7 : 5;
  const deliveryDays = complexity === "complex" ? 7 : 5;
  const commissionDays = complexity === "complex" ? 3 : 2;
  const signOffDays = complexity === "complex" ? 2 : 1;
  return [
    { name: "Site Survey", description: "Confirm measurements, site access, and fixings", durationDays: surveyDays },
    { name: "Delivery Scheduling", description: "Coordinate logistics + site receipt of materials", durationDays: deliveryDays },
    { name: "Installation", description: "On-site installation works", durationDays: installDays },
    { name: "Commissioning", description: "Impact checks, snagging, and final alignment", durationDays: commissionDays },
    { name: "Handover", description: "Walkthrough with customer + handover pack", durationDays: 1 },
    { name: "Sign-off", description: "Customer sign-off + photo evidence", durationDays: signOffDays },
  ];
}

async function seedDefaultPhases(
  db: Database,
  installationId: string,
  complexity: string,
  plannedStart: Date,
): Promise<void> {
  const tpl = phaseTemplateFor(complexity);
  let cursor = new Date(plannedStart.getTime());
  const rows = tpl.map((p, idx) => {
    const start = new Date(cursor.getTime());
    const end = new Date(start.getTime() + p.durationDays * 24 * 60 * 60 * 1000);
    cursor = end;
    return {
      installationId,
      orderIndex: idx,
      name: p.name,
      description: p.description,
      startDate: start,
      endDate: end,
      status: "not_started",
      progress: 0,
    };
  });
  await db.insert(installationPhases).values(rows);
}

// ─── Signal detection ───────────────────────────────────────────────
// "Installation purchased" = ANY of: installationComplexity != 'none',
// servicePackage present, or any line item with requiresInstallation=true.
// Per user spec all three are valid signals, OR'd.
function orderSignalsInstallation(order: any): boolean {
  const complexity = (order.installationComplexity || "").toString().toLowerCase();
  if (complexity && complexity !== "none") return true;
  if (order.servicePackage && Object.keys(order.servicePackage || {}).length > 0) return true;
  const items = Array.isArray(order.items) ? order.items : [];
  if (items.some((i: any) => i?.requiresInstallation === true)) return true;
  return false;
}

function plannedStartFor(order: any): Date {
  // Two-week lead time from order creation by default. If the order has
  // a deliveryDate set, we anchor to that + 2 days (onto-site scheduling).
  if (order.deliveryDate) {
    const d = new Date(order.deliveryDate);
    if (!Number.isNaN(d.getTime())) return new Date(d.getTime() + 2 * 24 * 60 * 60 * 1000);
  }
  const base = order.createdAt ? new Date(order.createdAt) : new Date();
  return new Date(base.getTime() + 14 * 24 * 60 * 60 * 1000);
}

// ─── Public helper (called from orders/projects routes) ─────────────
export async function ensureInstallationForOrder(
  db: Database,
  orderId: string,
  actorUserId: string | null,
): Promise<{ created: boolean; installationId: string | null }> {
  // Idempotent check
  const existing = await db.select().from(installations).where(eq(installations.orderId, orderId)).limit(1);
  if (existing.length > 0) {
    return { created: false, installationId: existing[0].id };
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { created: false, installationId: null };

  if (!orderSignalsInstallation(order)) {
    return { created: false, installationId: null };
  }

  // Best-effort project lookup by (userId, projectName). Orders don't
  // currently carry a projectId FK, so name-match within the owner's
  // projects is the most reliable link we have.
  let projectId: string | null = null;
  let customerCompanyId: string | null = null;
  if (order.projectName && order.userId) {
    const matched = await db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, order.userId), eq(projects.name, order.projectName)))
      .limit(1);
    if (matched[0]) {
      projectId = matched[0].id;
      customerCompanyId = matched[0].customerCompanyId || null;
    }
  }

  const complexity = (order.installationComplexity || "standard").toString();
  const plannedStart = plannedStartFor(order);
  const totalDays = phaseTemplateFor(complexity).reduce((s, p) => s + p.durationDays, 0);
  const plannedEnd = new Date(plannedStart.getTime() + totalDays * 24 * 60 * 60 * 1000);

  const [created] = await db
    .insert(installations)
    .values({
      orderId: order.id,
      projectId,
      customerCompanyId,
      createdByUserId: actorUserId,
      updatedByUserId: actorUserId,
      title: order.projectName || `Installation — order ${order.orderNumber || order.id.slice(0, 8)}`,
      customerName: order.customerCompany || order.customerName || null,
      location: order.projectLocation || null,
      contactName: order.customerName || null,
      contactEmail: order.customerEmail || null,
      contactPhone: order.customerMobile || null,
      source: "order_won",
      complexity,
      status: "planning",
      plannedStart,
      plannedEnd,
      progress: 0,
    })
    .returning();

  await seedDefaultPhases(db, created.id, complexity, plannedStart);
  return { created: true, installationId: created.id };
}

// Project-level hook: when a project moves to "won", best-effort scan
// its orders by (userId, projectName) and fire ensureInstallationForOrder
// for each one that carries install signals.
export async function ensureInstallationsForProject(
  db: Database,
  projectId: string,
  actorUserId: string | null,
): Promise<{ created: number; checked: number }> {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return { created: 0, checked: 0 };
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.userId, project.userId), eq(orders.projectName, project.name)));
  let created = 0;
  for (const o of rows) {
    const res = await ensureInstallationForOrder(db, o.id, actorUserId);
    if (res.created) created += 1;
  }
  return { created, checked: rows.length };
}

// ─── Roll-up progress ───────────────────────────────────────────────
// Recomputes an installation's overall progress and status from its
// phases. Called after any phase mutation so the parent row stays in
// sync without the UI having to aggregate manually.
async function rollUpInstallation(db: Database, installationId: string): Promise<void> {
  const phases = await db
    .select()
    .from(installationPhases)
    .where(eq(installationPhases.installationId, installationId));
  if (phases.length === 0) return;
  const totalProgress = Math.round(
    phases.reduce((s, p) => s + (p.progress ?? 0), 0) / phases.length,
  );
  const anyDelayed = phases.some((p) => p.status === "delayed");
  const anyOnHold = phases.some((p) => p.status === "on_hold");
  const anyInProgress = phases.some((p) => p.status === "in_progress");
  const allComplete = phases.every((p) => p.status === "completed");
  const [current] = await db.select().from(installations).where(eq(installations.id, installationId)).limit(1);
  if (!current) return;

  // Only auto-advance canonical statuses; respect manual on_hold /
  // cancelled choices by the admin.
  let nextStatus = current.status;
  if (current.status !== "on_hold" && current.status !== "cancelled") {
    if (allComplete) nextStatus = "completed";
    else if (anyInProgress) nextStatus = "in_progress";
    else if (anyDelayed) nextStatus = "in_progress";
    else if (anyOnHold) nextStatus = "on_hold";
    else nextStatus = "planning";
  }

  const patch: any = { progress: totalProgress, status: nextStatus, updatedAt: new Date() };
  if (nextStatus === "in_progress" && !current.actualStart) patch.actualStart = new Date();
  if (nextStatus === "completed" && !current.actualEnd) patch.actualEnd = new Date();

  await db.update(installations).set(patch).where(eq(installations.id, installationId));
}

// ─── Helpers ────────────────────────────────────────────────────────

async function isAdmin(c: any): Promise<boolean> {
  const session = c.get("user");
  if (!session) return false;
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const user = await storage.getUser(session.claims.sub);
  return user?.role === "admin";
}

// ─── Installations: list + get + create + update + delete ───────────

installationsRoutes.get("/installations", authMiddleware, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const qStatus = c.req.query("status") || undefined;
  const qTeam = c.req.query("teamId") || undefined;
  const qSource = c.req.query("source") || undefined;
  const qComplexity = c.req.query("complexity") || undefined;
  const qFrom = c.req.query("from") || undefined;
  const qTo = c.req.query("to") || undefined;

  const conds: any[] = [];
  if (qStatus) conds.push(eq(installations.status, qStatus));
  if (qSource) conds.push(eq(installations.source, qSource));
  if (qComplexity) conds.push(eq(installations.complexity, qComplexity));
  if (qFrom) conds.push(gte(installations.plannedStart, new Date(qFrom)));
  if (qTo) conds.push(lte(installations.plannedStart, new Date(qTo)));

  let rows = await db
    .select()
    .from(installations)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(installations.plannedStart));

  // Filter by team via assignments (post-query — small n, no join needed
  // for v1; move to a join if list sizes grow).
  if (qTeam) {
    const assigned = await db
      .select()
      .from(installationAssignments)
      .where(eq(installationAssignments.teamId, qTeam));
    const keep = new Set(assigned.map((a) => a.installationId));
    rows = rows.filter((r) => keep.has(r.id));
  }

  return c.json(rows);
});

installationsRoutes.get("/installations/:id", authMiddleware, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const [install] = await db.select().from(installations).where(eq(installations.id, id)).limit(1);
  if (!install) return c.json({ message: "Installation not found" }, 404);

  const phases = await db
    .select()
    .from(installationPhases)
    .where(eq(installationPhases.installationId, id))
    .orderBy(asc(installationPhases.orderIndex));
  const phaseIds = phases.map((p) => p.id);
  const milestones = phaseIds.length
    ? await db
        .select()
        .from(installationMilestones)
        .where(inArray(installationMilestones.phaseId, phaseIds))
    : [];
  const assignments = await db
    .select()
    .from(installationAssignments)
    .where(eq(installationAssignments.installationId, id));

  // Hydrate team details for each assignment + phase
  const teamIds = Array.from(
    new Set([
      ...assignments.map((a) => a.teamId),
      ...phases.map((p) => p.assignedTeamId).filter(Boolean) as string[],
    ]),
  );
  const teams = teamIds.length
    ? await db.select().from(installTeams).where(inArray(installTeams.id, teamIds))
    : [];

  // Light order + project snapshot for the detail header
  let order: any = null;
  if (install.orderId) {
    const [o] = await db.select().from(orders).where(eq(orders.id, install.orderId)).limit(1);
    order = o || null;
  }
  let project: any = null;
  if (install.projectId) {
    const [p] = await db.select().from(projects).where(eq(projects.id, install.projectId)).limit(1);
    project = p || null;
  }

  return c.json({
    ...install,
    phases: phases.map((p) => ({
      ...p,
      milestones: milestones.filter((m) => m.phaseId === p.id),
      team: teams.find((t) => t.id === p.assignedTeamId) || null,
    })),
    assignments: assignments.map((a) => ({
      ...a,
      team: teams.find((t) => t.id === a.teamId) || null,
    })),
    order,
    project,
  });
});

installationsRoutes.post("/installations", authMiddleware, mutationRateLimit, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const userId = c.get("user").claims.sub;
  const body = await c.req.json<{
    title: string;
    projectId?: string | null;
    customerCompanyId?: string | null;
    customerName?: string | null;
    location?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    source?: "followup" | "rework" | "manual_other";
    complexity?: "simple" | "standard" | "complex";
    plannedStart?: string | null;
    notes?: string | null;
    seedDefaultPhases?: boolean;
  }>();

  if (!body.title?.trim()) {
    return c.json({ message: "Title is required" }, 400);
  }
  const complexity = body.complexity || "standard";
  const plannedStart = body.plannedStart ? new Date(body.plannedStart) : new Date();
  const totalDays = phaseTemplateFor(complexity).reduce((s, p) => s + p.durationDays, 0);
  const plannedEnd = new Date(plannedStart.getTime() + totalDays * 24 * 60 * 60 * 1000);

  const [created] = await db
    .insert(installations)
    .values({
      orderId: null,
      projectId: body.projectId || null,
      customerCompanyId: body.customerCompanyId || null,
      createdByUserId: userId,
      updatedByUserId: userId,
      title: body.title.trim(),
      customerName: body.customerName || null,
      location: body.location || null,
      contactName: body.contactName || null,
      contactEmail: body.contactEmail || null,
      contactPhone: body.contactPhone || null,
      source: body.source || "manual_other",
      complexity,
      status: "planning",
      plannedStart,
      plannedEnd,
      notes: body.notes || null,
      progress: 0,
    })
    .returning();

  if (body.seedDefaultPhases !== false) {
    await seedDefaultPhases(db, created.id, complexity, plannedStart);
  }

  return c.json(created, 201);
});

installationsRoutes.patch("/installations/:id", authMiddleware, mutationRateLimit, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const userId = c.get("user").claims.sub;
  const id = c.req.param("id");
  const body = await c.req.json<any>();

  const patch: any = { updatedByUserId: userId, updatedAt: new Date() };
  const passthrough = [
    "title",
    "customerName",
    "location",
    "contactName",
    "contactEmail",
    "contactPhone",
    "source",
    "complexity",
    "status",
    "progress",
    "notes",
    "projectId",
    "customerCompanyId",
  ];
  for (const k of passthrough) {
    if (k in body) patch[k] = body[k];
  }
  for (const k of ["plannedStart", "plannedEnd", "actualStart", "actualEnd"]) {
    if (k in body) patch[k] = body[k] ? new Date(body[k]) : null;
  }
  // Stamp transition timestamps
  if (body.status === "in_progress") patch.actualStart = patch.actualStart ?? new Date();
  if (body.status === "completed") patch.actualEnd = patch.actualEnd ?? new Date();

  const [updated] = await db
    .update(installations)
    .set(patch)
    .where(eq(installations.id, id))
    .returning();
  if (!updated) return c.json({ message: "Installation not found" }, 404);
  return c.json(updated);
});

installationsRoutes.delete("/installations/:id", authMiddleware, mutationRateLimit, async (c) => {
  if (!(await isAdmin(c))) return c.json({ message: "Admin access required" }, 403);
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  await db.delete(installations).where(eq(installations.id, id));
  return c.json({ ok: true });
});

// ─── Phases ─────────────────────────────────────────────────────────

installationsRoutes.post(
  "/installations/:id/phases",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const body = await c.req.json<any>();
    if (!body.name?.trim()) return c.json({ message: "Phase name required" }, 400);
    // Append to end unless explicit orderIndex given
    const existing = await db
      .select({ idx: installationPhases.orderIndex })
      .from(installationPhases)
      .where(eq(installationPhases.installationId, id));
    const nextIdx =
      typeof body.orderIndex === "number"
        ? body.orderIndex
        : existing.reduce((m, p) => Math.max(m, p.idx ?? 0), -1) + 1;

    const [created] = await db
      .insert(installationPhases)
      .values({
        installationId: id,
        orderIndex: nextIdx,
        name: body.name.trim(),
        description: body.description || null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        status: body.status || "not_started",
        progress: body.progress ?? 0,
        assignedTeamId: body.assignedTeamId || null,
        dependencies: body.dependencies || null,
        notes: body.notes || null,
      })
      .returning();
    await rollUpInstallation(db, id);
    return c.json(created, 201);
  },
);

installationsRoutes.patch(
  "/installation-phases/:id",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const body = await c.req.json<any>();
    const patch: any = { updatedAt: new Date() };
    for (const k of [
      "name",
      "description",
      "status",
      "progress",
      "assignedTeamId",
      "dependencies",
      "notes",
      "orderIndex",
    ]) {
      if (k in body) patch[k] = body[k];
    }
    for (const k of ["startDate", "endDate"]) {
      if (k in body) patch[k] = body[k] ? new Date(body[k]) : null;
    }
    const [updated] = await db
      .update(installationPhases)
      .set(patch)
      .where(eq(installationPhases.id, id))
      .returning();
    if (!updated) return c.json({ message: "Phase not found" }, 404);
    await rollUpInstallation(db, updated.installationId);
    return c.json(updated);
  },
);

installationsRoutes.delete(
  "/installation-phases/:id",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const [phase] = await db
      .select()
      .from(installationPhases)
      .where(eq(installationPhases.id, id))
      .limit(1);
    if (!phase) return c.json({ message: "Phase not found" }, 404);
    await db.delete(installationPhases).where(eq(installationPhases.id, id));
    await rollUpInstallation(db, phase.installationId);
    return c.json({ ok: true });
  },
);

// ─── Milestones ─────────────────────────────────────────────────────

installationsRoutes.post(
  "/installation-phases/:id/milestones",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const phaseId = c.req.param("id");
    const body = await c.req.json<any>();
    if (!body.name?.trim()) return c.json({ message: "Milestone name required" }, 400);
    const [created] = await db
      .insert(installationMilestones)
      .values({
        phaseId,
        name: body.name.trim(),
        date: body.date ? new Date(body.date) : null,
        completed: !!body.completed,
        description: body.description || null,
      })
      .returning();
    return c.json(created, 201);
  },
);

installationsRoutes.patch(
  "/installation-milestones/:id",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const body = await c.req.json<any>();
    const patch: any = { updatedAt: new Date() };
    for (const k of ["name", "completed", "description"]) {
      if (k in body) patch[k] = body[k];
    }
    if ("date" in body) patch.date = body.date ? new Date(body.date) : null;
    const [updated] = await db
      .update(installationMilestones)
      .set(patch)
      .where(eq(installationMilestones.id, id))
      .returning();
    if (!updated) return c.json({ message: "Milestone not found" }, 404);
    return c.json(updated);
  },
);

installationsRoutes.delete(
  "/installation-milestones/:id",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    await db.delete(installationMilestones).where(eq(installationMilestones.id, id));
    return c.json({ ok: true });
  },
);

// ─── Team assignments ───────────────────────────────────────────────

installationsRoutes.post(
  "/installations/:id/assignments",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const body = await c.req.json<{
      teamId: string;
      startDate?: string | null;
      endDate?: string | null;
      notes?: string | null;
    }>();
    if (!body.teamId) return c.json({ message: "teamId required" }, 400);
    const [created] = await db
      .insert(installationAssignments)
      .values({
        installationId: id,
        teamId: body.teamId,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        notes: body.notes || null,
      })
      .returning();
    return c.json(created, 201);
  },
);

installationsRoutes.patch(
  "/installation-assignments/:id",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const body = await c.req.json<any>();
    const patch: any = { updatedAt: new Date() };
    for (const k of ["teamId", "notes"]) {
      if (k in body) patch[k] = body[k];
    }
    for (const k of ["startDate", "endDate"]) {
      if (k in body) patch[k] = body[k] ? new Date(body[k]) : null;
    }
    const [updated] = await db
      .update(installationAssignments)
      .set(patch)
      .where(eq(installationAssignments.id, id))
      .returning();
    if (!updated) return c.json({ message: "Assignment not found" }, 404);
    return c.json(updated);
  },
);

installationsRoutes.delete(
  "/installation-assignments/:id",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    await db.delete(installationAssignments).where(eq(installationAssignments.id, id));
    return c.json({ ok: true });
  },
);

// ─── Manual trigger: create install from an existing order ──────────
// Belt-and-braces entry point so admins can force-create an install
// for an order that was won before this feature shipped (or that
// didn't auto-fire for some reason).

installationsRoutes.post(
  "/installations/from-order/:orderId",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const userId = c.get("user").claims.sub;
    const orderId = c.req.param("orderId");
    const result = await ensureInstallationForOrder(db, orderId, userId);
    if (!result.installationId) {
      return c.json({ message: "Order does not signal installation" }, 400);
    }
    return c.json(result, result.created ? 201 : 200);
  },
);

// ─── Schema migration endpoint ──────────────────────────────────────
// One-shot DDL runner that creates the six installation tables in
// Neon. Mirrors the pattern in adminPricelist.ts: the DATABASE_URL is
// a Workers secret that isn't reachable from a local drizzle-kit push
// without pasting it, so we run the DDL through the worker runtime
// gated by the MIGRATION_TOKEN bearer. CREATE TABLE / INDEX IF NOT
// EXISTS makes this safe to re-run.

installationsRoutes.post("/admin/apply-install-schema", async (c) => {
  const expected = (c.env as any).MIGRATION_TOKEN;
  if (!expected) {
    return c.json(
      { ok: false, message: "MIGRATION_TOKEN not configured on the worker." },
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

  const sqlClient = neon(c.env.DATABASE_URL);
  const db = drizzle(sqlClient);
  const ran: string[] = [];

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS install_teams (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR NOT NULL,
        region VARCHAR,
        lead_contact_name VARCHAR,
        contact_email VARCHAR,
        contact_phone VARCHAR,
        capacity_jobs_per_week INTEGER DEFAULT 3,
        colour VARCHAR,
        active BOOLEAN NOT NULL DEFAULT true,
        notes TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    ran.push("install_teams");
    await db.execute(sql`CREATE INDEX IF NOT EXISTS install_teams_name_idx ON install_teams(name);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS install_teams_active_idx ON install_teams(active);`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS install_team_members (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        team_id VARCHAR NOT NULL REFERENCES install_teams(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        email VARCHAR,
        phone VARCHAR,
        role_in_team VARCHAR,
        certifications JSONB,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    ran.push("install_team_members");
    await db.execute(sql`CREATE INDEX IF NOT EXISTS install_team_members_team_idx ON install_team_members(team_id);`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS installations (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id VARCHAR REFERENCES orders(id),
        project_id VARCHAR REFERENCES projects(id),
        customer_company_id VARCHAR REFERENCES customer_companies(id),
        created_by_user_id VARCHAR REFERENCES users(id),
        updated_by_user_id VARCHAR REFERENCES users(id),
        title VARCHAR NOT NULL,
        customer_name VARCHAR,
        location TEXT,
        contact_name VARCHAR,
        contact_email VARCHAR,
        contact_phone VARCHAR,
        source VARCHAR NOT NULL DEFAULT 'order_won',
        complexity VARCHAR NOT NULL DEFAULT 'standard',
        status VARCHAR NOT NULL DEFAULT 'planning',
        planned_start TIMESTAMP,
        planned_end TIMESTAMP,
        actual_start TIMESTAMP,
        actual_end TIMESTAMP,
        progress INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    ran.push("installations");
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS installations_order_unique ON installations(order_id) WHERE order_id IS NOT NULL;`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS installations_status_idx ON installations(status);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS installations_planned_start_idx ON installations(planned_start);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS installations_project_idx ON installations(project_id);`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS installation_phases (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        installation_id VARCHAR NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL DEFAULT 0,
        name VARCHAR NOT NULL,
        description TEXT,
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        status VARCHAR NOT NULL DEFAULT 'not_started',
        progress INTEGER NOT NULL DEFAULT 0,
        assigned_team_id VARCHAR REFERENCES install_teams(id),
        dependencies JSONB,
        notes TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    ran.push("installation_phases");
    await db.execute(sql`CREATE INDEX IF NOT EXISTS installation_phases_installation_idx ON installation_phases(installation_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS installation_phases_team_idx ON installation_phases(assigned_team_id);`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS installation_milestones (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        phase_id VARCHAR NOT NULL REFERENCES installation_phases(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        date TIMESTAMP,
        completed BOOLEAN NOT NULL DEFAULT false,
        description TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    ran.push("installation_milestones");
    await db.execute(sql`CREATE INDEX IF NOT EXISTS installation_milestones_phase_idx ON installation_milestones(phase_id);`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS installation_assignments (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        installation_id VARCHAR NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
        team_id VARCHAR NOT NULL REFERENCES install_teams(id) ON DELETE RESTRICT,
        start_date TIMESTAMP,
        end_date TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    ran.push("installation_assignments");
    await db.execute(sql`CREATE INDEX IF NOT EXISTS installation_assignments_install_idx ON installation_assignments(installation_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS installation_assignments_team_idx ON installation_assignments(team_id);`);

    return c.json({ ok: true, ran });
  } catch (err) {
    console.error("apply-install-schema failed:", err);
    return c.json(
      {
        ok: false,
        ran,
        message: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});

export default installationsRoutes;
