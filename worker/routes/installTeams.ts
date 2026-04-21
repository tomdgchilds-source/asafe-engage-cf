import { Hono } from "hono";
import { and, asc, eq } from "drizzle-orm";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { mutationRateLimit } from "../middleware/rateLimiter";
import { getDb } from "../db";
import { createStorage } from "../storage";
import { installTeams, installTeamMembers } from "../../shared/schema";

// ═══════════════════════════════════════════════════════════════════
// Install teams (external crews)
//
// Teams are org-wide and not tied to users — they represent external
// installation crews with a lead contact, weekly capacity, and a
// roster of members. All authed users can view/create/edit; delete is
// admin-only so we don't lose assignment history accidentally.
// ═══════════════════════════════════════════════════════════════════

const installTeamsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

async function isAdmin(c: any): Promise<boolean> {
  const session = c.get("user");
  if (!session) return false;
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const user = await storage.getUser(session.claims.sub);
  return user?.role === "admin";
}

// ─── Teams ──────────────────────────────────────────────────────────

installTeamsRoutes.get("/install-teams", authMiddleware, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const includeInactive = c.req.query("includeInactive") === "1";
  const rows = includeInactive
    ? await db.select().from(installTeams).orderBy(asc(installTeams.name))
    : await db
        .select()
        .from(installTeams)
        .where(eq(installTeams.active, true))
        .orderBy(asc(installTeams.name));
  return c.json(rows);
});

installTeamsRoutes.get("/install-teams/:id", authMiddleware, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const [team] = await db.select().from(installTeams).where(eq(installTeams.id, id)).limit(1);
  if (!team) return c.json({ message: "Team not found" }, 404);
  const members = await db
    .select()
    .from(installTeamMembers)
    .where(eq(installTeamMembers.teamId, id))
    .orderBy(asc(installTeamMembers.name));
  return c.json({ ...team, members });
});

installTeamsRoutes.post("/install-teams", authMiddleware, mutationRateLimit, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const body = await c.req.json<any>();
  if (!body.name?.trim()) return c.json({ message: "Team name required" }, 400);
  const [created] = await db
    .insert(installTeams)
    .values({
      name: body.name.trim(),
      region: body.region || null,
      leadContactName: body.leadContactName || null,
      contactEmail: body.contactEmail || null,
      contactPhone: body.contactPhone || null,
      capacityJobsPerWeek: body.capacityJobsPerWeek ?? 3,
      colour: body.colour || null,
      active: body.active ?? true,
      notes: body.notes || null,
    })
    .returning();
  return c.json(created, 201);
});

installTeamsRoutes.patch("/install-teams/:id", authMiddleware, mutationRateLimit, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const body = await c.req.json<any>();
  const patch: any = { updatedAt: new Date() };
  for (const k of [
    "name",
    "region",
    "leadContactName",
    "contactEmail",
    "contactPhone",
    "capacityJobsPerWeek",
    "colour",
    "active",
    "notes",
  ]) {
    if (k in body) patch[k] = body[k];
  }
  const [updated] = await db
    .update(installTeams)
    .set(patch)
    .where(eq(installTeams.id, id))
    .returning();
  if (!updated) return c.json({ message: "Team not found" }, 404);
  return c.json(updated);
});

installTeamsRoutes.delete(
  "/install-teams/:id",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    if (!(await isAdmin(c))) return c.json({ message: "Admin access required" }, 403);
    const db = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    // Soft-delete: flip active so assignment history remains intact.
    const [updated] = await db
      .update(installTeams)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(installTeams.id, id))
      .returning();
    if (!updated) return c.json({ message: "Team not found" }, 404);
    return c.json({ ok: true });
  },
);

// ─── Members ────────────────────────────────────────────────────────

installTeamsRoutes.get("/install-teams/:id/members", authMiddleware, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const id = c.req.param("id");
  const rows = await db
    .select()
    .from(installTeamMembers)
    .where(eq(installTeamMembers.teamId, id))
    .orderBy(asc(installTeamMembers.name));
  return c.json(rows);
});

installTeamsRoutes.post(
  "/install-teams/:id/members",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const teamId = c.req.param("id");
    const body = await c.req.json<any>();
    if (!body.name?.trim()) return c.json({ message: "Member name required" }, 400);
    const [created] = await db
      .insert(installTeamMembers)
      .values({
        teamId,
        name: body.name.trim(),
        email: body.email || null,
        phone: body.phone || null,
        roleInTeam: body.roleInTeam || null,
        certifications: body.certifications || null,
        active: body.active ?? true,
      })
      .returning();
    return c.json(created, 201);
  },
);

installTeamsRoutes.patch(
  "/install-team-members/:id",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    const body = await c.req.json<any>();
    const patch: any = { updatedAt: new Date() };
    for (const k of ["name", "email", "phone", "roleInTeam", "certifications", "active"]) {
      if (k in body) patch[k] = body[k];
    }
    const [updated] = await db
      .update(installTeamMembers)
      .set(patch)
      .where(eq(installTeamMembers.id, id))
      .returning();
    if (!updated) return c.json({ message: "Member not found" }, 404);
    return c.json(updated);
  },
);

installTeamsRoutes.delete(
  "/install-team-members/:id",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const id = c.req.param("id");
    await db.delete(installTeamMembers).where(eq(installTeamMembers.id, id));
    return c.json({ ok: true });
  },
);

export default installTeamsRoutes;
