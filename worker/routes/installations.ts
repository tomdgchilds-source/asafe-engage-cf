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
import {
  sendInstallTeamVideoDigest,
  type InstallTeamDigestProductGroup,
  type InstallTeamDigestResult,
} from "../services/email";

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
//
// Side-effect: when a team is assigned, fire the watch-before-site-visit
// digest to install_teams.contact_email — per-product Installation Video
// thumbnails so the team lead has the A-SAFE training queued. Best-effort:
// failures log but never block the assignment insert.

// Builds the product-grouped video bundle that powers the install-team
// digest. Walks installation → orderId → orders.items[] → product ids,
// then resolves each product's "Installation Video" resources via the
// product_resources join. Optionally pulls a one-line site-prep summary
// from products.ground_works_data per product.
//
// Exported so the test endpoint in worker/index.ts can reuse the same
// composition path without code duplication.
export async function buildInstallTeamDigestPayload(
  databaseUrl: string,
  installationId: string,
): Promise<{
  installation: any | null;
  team: any | null;
  productGroups: InstallTeamDigestProductGroup[];
}> {
  const sqlClient = neon(databaseUrl);

  // 1. Installation row
  const installRows = (await sqlClient`
    SELECT id, order_id, title, location, planned_start
    FROM installations WHERE id = ${installationId} LIMIT 1
  `) as Array<{
    id: string;
    order_id: string | null;
    title: string;
    location: string | null;
    planned_start: string | null;
  }>;
  const install = installRows[0] || null;
  if (!install) {
    return { installation: null, team: null, productGroups: [] };
  }

  // 2. Latest assignment for the team (so the test endpoint can re-use this
  // path keyed off installationAssignmentId — the caller resolves which
  // team to use; we just hydrate the digest payload).

  // 3. Walk to products via the install's underlying order.
  const productIdSet = new Set<string>();
  if (install.order_id) {
    const orderRows = (await sqlClient`
      SELECT items FROM orders WHERE id = ${install.order_id} LIMIT 1
    `) as Array<{ items: any }>;
    const order = orderRows[0];
    const items = Array.isArray(order?.items) ? order.items : [];
    const productNames = new Set<string>();
    for (const it of items) {
      if (it?.productId && typeof it.productId === "string") productIdSet.add(it.productId);
      if (it?.productName && typeof it.productName === "string") productNames.add(it.productName);
    }
    if (productNames.size > 0) {
      const namesArr = Array.from(productNames).map((n) => n.toLowerCase());
      const nameRows = (await sqlClient`
        SELECT id FROM products WHERE lower(name) = ANY(${namesArr})
      `) as Array<{ id: string }>;
      for (const r of nameRows) productIdSet.add(r.id);
    }
  }

  if (productIdSet.size === 0) {
    return { installation: install, team: null, productGroups: [] };
  }

  // 4. Pull product metadata (name + ground_works_data). ground_works_data
  // may not exist on legacy DBs — guard with information_schema feature
  // detection so this stays safe to deploy ahead of the column landing.
  const colRows = (await sqlClient`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'ground_works_data'
  `) as Array<{ column_name: string }>;
  const hasGroundWorks = colRows.length > 0;

  const ids = Array.from(productIdSet);
  const productRows = hasGroundWorks
    ? ((await sqlClient`
        SELECT id, name, ground_works_data
        FROM products WHERE id = ANY(${ids})
      `) as Array<{ id: string; name: string; ground_works_data: any }>)
    : ((await sqlClient`
        SELECT id, name, NULL::jsonb AS ground_works_data
        FROM products WHERE id = ANY(${ids})
      `) as Array<{ id: string; name: string; ground_works_data: any }>);

  // 5. Pull every Installation Video resource linked to these products in
  // a single round-trip, then bucket them by product. Mirrors the shape
  // used by /api/installations/:id/install-videos so the resulting cards
  // stay visually consistent with the in-app panel.
  const hasExternalIdRows = (await sqlClient`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'resources' AND column_name = 'external_id'
  `) as Array<{ column_name: string }>;
  const hasExternalId = hasExternalIdRows.length > 0;

  const videoEdges = hasExternalId
    ? ((await sqlClient`
        SELECT pr.product_id, r.id, r.title, r.description, r.file_url,
               r.thumbnail_url, r.external_id, r.external_url
        FROM product_resources pr
        JOIN resources r ON r.id = pr.resource_id
        WHERE pr.product_id = ANY(${ids})
          AND r.resource_type = 'Installation Video'
          AND r.is_active = true
        ORDER BY r.title ASC
      `) as Array<{
        product_id: string;
        id: string;
        title: string;
        description: string | null;
        file_url: string;
        thumbnail_url: string | null;
        external_id: string | null;
        external_url: string | null;
      }>)
    : ((await sqlClient`
        SELECT pr.product_id, r.id, r.title, r.description, r.file_url,
               r.thumbnail_url, NULL AS external_id, NULL AS external_url
        FROM product_resources pr
        JOIN resources r ON r.id = pr.resource_id
        WHERE pr.product_id = ANY(${ids})
          AND r.resource_type = 'Installation Video'
          AND r.is_active = true
        ORDER BY r.title ASC
      `) as Array<{
        product_id: string;
        id: string;
        title: string;
        description: string | null;
        file_url: string;
        thumbnail_url: string | null;
        external_id: string | null;
        external_url: string | null;
      }>);

  const groups: InstallTeamDigestProductGroup[] = productRows.map((p) => {
    const videos = videoEdges
      .filter((e) => e.product_id === p.id)
      .map((e) => {
        const videoId =
          e.external_id ||
          extractYoutubeIdLocal(e.file_url) ||
          null;
        return {
          id: e.id,
          title: e.title,
          description: e.description,
          videoId,
          thumbnailUrl:
            e.thumbnail_url ||
            (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null),
          externalUrl:
            e.external_url ||
            (videoId ? `https://youtu.be/${videoId}` : null),
          fileUrl: e.file_url,
        };
      });
    return {
      productId: p.id,
      productName: p.name,
      videos,
      groundWorksSummary: summariseGroundWorks(p.ground_works_data),
    };
  });

  return { installation: install, team: null, productGroups: groups };
}

function extractYoutubeIdLocal(url: string | null | undefined): string | null {
  if (!url) return null;
  const m1 = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (m1) return m1[1];
  const m2 = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (m2) return m2[1];
  const m3 = url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
  if (m3) return m3[1];
  return null;
}

// One-paragraph distillation of the per-product groundWorksData blob.
// Pulls the four highest-signal fields a fitter cares about before
// arriving on site: slab thickness, anchor spec, anchor depth, edge
// distance. Falls back to the substrate / pad info when those aren't
// populated. Returns null when the row has no usable shape.
function summariseGroundWorks(data: any): string | null {
  if (!data || typeof data !== "object") return null;
  const parts: string[] = [];
  // anchor spec — combine fixingType + diameter when both present.
  const anchor =
    data.anchorSpec ||
    [data.anchorFixingType || data.fixingType, data.anchorDiameterMm ? `M${data.anchorDiameterMm}` : null]
      .filter(Boolean)
      .join(" ") ||
    null;
  if (anchor) parts.push(`anchor: ${anchor}`);
  if (data.anchorDepthMm) parts.push(`depth ${data.anchorDepthMm}mm`);
  if (data.edgeDistanceMm) parts.push(`edge ${data.edgeDistanceMm}mm`);
  // slab thickness — `minSlabThicknessMm` per-product, else `_globalRules.minContinuousSlabThicknessMm`.
  const slab =
    data.minSlabThicknessMm ||
    data?._globalRules?.minContinuousSlabThicknessMm ||
    null;
  if (slab) parts.push(`min slab ${slab}mm`);
  // pad — useful when slab thickness is null.
  if (!slab && data.concretePadDepthMm) parts.push(`pad depth ${data.concretePadDepthMm}mm`);
  if (data.basePlateDimensionsMm) parts.push(`base plate ${data.basePlateDimensionsMm}`);
  if (parts.length === 0) return null;
  return parts.join(", ");
}

// Resolves and fires the digest email for a given installation + team.
// Caller (route handler / test endpoint) supplies the team row so we
// don't double-fetch when the assignment payload already has it.
//
// Wrapped so the route handler can `void`-await this (fire-and-forget)
// without juggling try/catch — every failure path returns a structured
// result and logs internally.
export async function fireInstallTeamDigest(
  env: Env,
  installationId: string,
  team: { id: string; name: string | null; leadContactName: string | null; contactEmail: string | null } | null,
): Promise<InstallTeamDigestResult> {
  if (!team) {
    console.warn(`[install-team-digest] No team supplied for installation ${installationId} — skipping.`);
    return {
      ok: false,
      sent: false,
      recipient: "",
      videoCount: 0,
      productCount: 0,
      reason: "no_team",
    };
  }
  if (!team.contactEmail) {
    console.warn(
      `[install-team-digest] Team ${team.id} has no contact_email — skipping email for installation ${installationId}.`,
    );
    return {
      ok: false,
      sent: false,
      recipient: "",
      videoCount: 0,
      productCount: 0,
      reason: "team_no_contact_email",
    };
  }

  try {
    const { installation, productGroups } = await buildInstallTeamDigestPayload(
      env.DATABASE_URL,
      installationId,
    );
    if (!installation) {
      return {
        ok: false,
        sent: false,
        recipient: team.contactEmail,
        videoCount: 0,
        productCount: 0,
        reason: "installation_not_found",
      };
    }

    const baseUrl = env.APP_URL || "https://asafe-engage.tom-d-g-childs.workers.dev";
    const installationUrl = `${baseUrl.replace(/\/$/, "")}/installation-timeline?installationId=${encodeURIComponent(installationId)}`;

    return await sendInstallTeamVideoDigest(
      env,
      {
        to: team.contactEmail,
        teamName: team.name || null,
        leadContactName: team.leadContactName || null,
        installationTitle: installation.title,
        installationLocation: installation.location || null,
        installationPlannedStart: installation.planned_start || null,
        installationUrl,
        productGroups,
      },
      { callerRoute: "/api/installations/team-digest" },
    );
  } catch (err) {
    console.error(
      `[install-team-digest] fireInstallTeamDigest failed for installation=${installationId} team=${team.id}:`,
      err,
    );
    return {
      ok: false,
      sent: false,
      recipient: team.contactEmail || "",
      videoCount: 0,
      productCount: 0,
      reason: err instanceof Error ? err.message : "unknown",
    };
  }
}

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

    // Fire-and-forget: per-product install-video digest to the team lead.
    // Wrapped in try/catch so a Resend / DB hiccup never bubbles out and
    // turns a successful assignment into a 500.
    try {
      const [team] = await db
        .select()
        .from(installTeams)
        .where(eq(installTeams.id, body.teamId))
        .limit(1);
      if (team) {
        // Don't await — the assignment response shouldn't block on Resend's
        // round-trip. The helper handles its own error logging.
        void fireInstallTeamDigest(c.env, id, {
          id: team.id,
          name: team.name || null,
          leadContactName: team.leadContactName || null,
          contactEmail: team.contactEmail || null,
        }).catch((err) => {
          console.error("[install-team-digest] background send threw:", err);
        });
      } else {
        console.warn(`[install-team-digest] assignment ${created.id} created but team ${body.teamId} not found.`);
      }
    } catch (err) {
      // Belt-and-braces — swallow anything so the assignment still returns 201.
      console.error("[install-team-digest] pre-fire lookup failed:", err);
    }

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
