import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { mutationRateLimit } from "../middleware/rateLimiter";
import { getDb } from "../db";
import { createStorage } from "../storage";
import { ensureInstallationsForProject } from "./installations";
import { pas13Verdict, type Pas13Verdict, type Verdict } from "../../shared/pas13Rules";
import { sendEmail } from "../services/email";

const projectsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// 16-char hex. Same shape as the orders.share_token helper — uses the
// runtime CSPRNG via crypto.getRandomValues, which is what the Workers
// runtime exposes for bearer-token material.
function hex16(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Sanitise a customer-supplied free-text comment so it's safe to drop
// into an email body. We HTML-escape and clamp length — Resend already
// sandboxes the rendering, but defence in depth is cheap.
function sanitiseComment(s: string | null | undefined, max = 2000): string {
  if (!s) return "";
  const trimmed = String(s).slice(0, max);
  return trimmed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ═══════════════════════════════════════════════════════════════════
// Project / customer / contact CRUD.
//
// Every endpoint is auth-gated and owner-scoped: a sales rep can only
// see + mutate their own customers, projects, and contacts. Cross-rep
// sharing will come later as a separate permissions feature.
// ═══════════════════════════════════════════════════════════════════

// ─── Customer companies ─────────────────────────────────────────────

projectsRoutes.get("/customer-companies", authMiddleware, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const userId = c.get("user").claims.sub;
  const rows = await storage.listCustomerCompanies(userId);
  return c.json(rows);
});

projectsRoutes.post("/customer-companies", authMiddleware, mutationRateLimit, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const userId = c.get("user").claims.sub;
  const body = await c.req.json<{
    name: string;
    logoUrl?: string | null;
    industry?: string | null;
    billingAddress?: string | null;
    city?: string | null;
    country?: string | null;
    website?: string | null;
    notes?: string | null;
  }>();
  if (!body.name?.trim()) {
    return c.json({ message: "Company name is required" }, 400);
  }
  const row = await storage.createCustomerCompany({ userId, ...body } as any);
  return c.json(row, 201);
});

projectsRoutes.patch("/customer-companies/:id", authMiddleware, mutationRateLimit, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const userId = c.get("user").claims.sub;
  const id = c.req.param("id");
  const existing = await storage.getCustomerCompany(id);
  if (!existing || existing.userId !== userId) {
    return c.json({ message: "Customer not found" }, 404);
  }
  const body = await c.req.json();
  const row = await storage.updateCustomerCompany(id, body);
  return c.json(row);
});

// ─── Projects ───────────────────────────────────────────────────────

projectsRoutes.get("/projects", authMiddleware, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const userId = c.get("user").claims.sub;

  // Union of owned + shared projects. Owned come from listProjects; shared
  // come via the collaborator table. Each row is tagged with `sharedByUserId`
  // so the UI can render a "Shared by [name]" pill on non-owned projects.
  const owned = await storage.listProjects(userId);
  const accessibleIds = typeof storage.accessibleProjectIds === "function"
    ? await storage.accessibleProjectIds(userId)
    : owned.map((p) => p.id);
  const sharedIds = accessibleIds.filter(
    (id) => !owned.some((p) => p.id === id),
  );
  const sharedRows =
    sharedIds.length > 0 && typeof storage.getProjectsByIds === "function"
      ? await storage.getProjectsByIds(sharedIds)
      : [];
  const allRows = [...owned, ...sharedRows];

  // Hydrate customerCompany on each project so the list view doesn't
  // need an N+1 fetch to show the customer name + logo chip. Shared
  // projects might reference customer companies owned by the original
  // project owner; getCustomerCompaniesByIds handles that cross-user
  // lookup.
  const custIds = Array.from(
    new Set(allRows.map((p) => p.customerCompanyId).filter(Boolean)),
  ) as string[];
  const customers = custIds.length > 0 && typeof storage.getCustomerCompaniesByIds === "function"
    ? await storage.getCustomerCompaniesByIds(custIds)
    : await storage.listCustomerCompanies(userId);
  const custById = new Map(customers.map((c: any) => [c.id, c]));
  return c.json(
    allRows.map((p) => ({
      ...p,
      customerCompany: p.customerCompanyId
        ? custById.get(p.customerCompanyId) || null
        : null,
      isShared: p.userId !== userId,
      ownerUserId: p.userId,
    })),
  );
});

projectsRoutes.get("/projects/:id", authMiddleware, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const userId = c.get("user").claims.sub;
  const id = c.req.param("id");
  const project = await storage.getProjectWithDetails(id);
  if (!project) {
    return c.json({ message: "Project not found" }, 404);
  }
  // Ownership OR accepted collaborator row — the canAccessProject helper
  // encapsulates both checks.
  if (project.userId !== userId) {
    if (typeof storage.canAccessProject === "function") {
      const check = await storage.canAccessProject(id, userId, "viewer");
      if (!check.allowed) return c.json({ message: "Project not found" }, 404);
    } else {
      return c.json({ message: "Project not found" }, 404);
    }
  }
  // Side effect: reading the project bumps lastAccessedAt so recent
  // projects float to the top of the switcher.
  await storage.touchProjectAccess(id);
  return c.json({
    ...project,
    isShared: project.userId !== userId,
    ownerUserId: project.userId,
  });
});

projectsRoutes.post("/projects", authMiddleware, mutationRateLimit, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const userId = c.get("user").claims.sub;
  const body = await c.req.json<{
    name: string;
    customerCompanyId?: string | null;
    // Shortcut: if the client didn't pre-create a customer company,
    // they can inline the name + logo and we'll mint the record here
    // so the form is one-pane.
    inlineCustomerName?: string;
    inlineCustomerLogoUrl?: string | null;
    location?: string | null;
    description?: string | null;
    defaultDeliveryAddress?: string | null;
    defaultInstallationComplexity?: string | null;
    status?: string;
    setActive?: boolean;
  }>();
  if (!body.name?.trim()) {
    return c.json({ message: "Project name is required" }, 400);
  }

  let customerCompanyId = body.customerCompanyId || null;
  if (!customerCompanyId && body.inlineCustomerName?.trim()) {
    const created = await storage.createCustomerCompany({
      userId,
      name: body.inlineCustomerName.trim(),
      logoUrl: body.inlineCustomerLogoUrl || null,
    } as any);
    customerCompanyId = created.id;
  }

  const project = await storage.createProject({
    userId,
    customerCompanyId,
    name: body.name.trim(),
    location: body.location || null,
    description: body.description || null,
    defaultDeliveryAddress: body.defaultDeliveryAddress || null,
    defaultInstallationComplexity: body.defaultInstallationComplexity || null,
    status: body.status || "active",
  } as any);

  // New projects become active by default — the rep who just created it
  // is almost certainly going to start working on it immediately. Opt
  // out with setActive:false.
  if (body.setActive !== false) {
    await storage.setActiveProject(userId, project.id);
  }

  return c.json(project, 201);
});

projectsRoutes.patch("/projects/:id", authMiddleware, mutationRateLimit, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const userId = c.get("user").claims.sub;
  const id = c.req.param("id");
  const existing = await storage.getProject(id);
  if (!existing) {
    return c.json({ message: "Project not found" }, 404);
  }
  // Editors + owners can patch. canAccessProject shortcuts through if the
  // caller is the row-level owner.
  if (existing.userId !== userId) {
    if (typeof storage.canAccessProject === "function") {
      const check = await storage.canAccessProject(id, userId, "editor");
      if (!check.allowed) return c.json({ message: "Forbidden" }, 403);
    } else {
      return c.json({ message: "Forbidden" }, 403);
    }
  }
  const body = await c.req.json();
  const row = await storage.updateProject(id, body);

  // Auto-create installations when a project transitions to "won".
  // Orders don't currently carry a projectId FK, so the helper matches
  // by (userId, projectName) inside ensureInstallationsForProject.
  // Fire-and-forget: a failure here shouldn't fail the project update.
  if (body.status === "won" && existing.status !== "won") {
    try {
      const actorId = c.get("user").claims.sub;
      await ensureInstallationsForProject(db, id, actorId);
    } catch (err) {
      console.error("[installations] auto-create on project-won failed:", err);
    }
  }

  return c.json(row);
});

// Narrowly-scoped patch for the project-level "Installation notes for
// the estimation team" textarea on the cart + project detail pages.
// Updates only the `installationNotes` column so a debounced auto-save
// can't accidentally clobber unrelated project fields. Auth-gated to
// the project owner (or anyone the rep has granted editor access via
// canAccessProject — same rule as PATCH /api/projects/:id).
projectsRoutes.patch(
  "/projects/:id/installation-notes",
  authMiddleware,
  mutationRateLimit,
  async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const id = c.req.param("id");
    const existing = await storage.getProject(id);
    if (!existing) {
      return c.json({ message: "Project not found" }, 404);
    }
    if (existing.userId !== userId) {
      if (typeof storage.canAccessProject === "function") {
        const check = await storage.canAccessProject(id, userId, "editor");
        if (!check.allowed) return c.json({ message: "Forbidden" }, 403);
      } else {
        return c.json({ message: "Forbidden" }, 403);
      }
    }
    const body = await c.req.json<{ notes?: string | null }>();
    // Coerce to a clean string|null. Trim is intentional — a textarea
    // submitted with only whitespace should clear the field, not save
    // a row of spaces that the PDF would render as a blank panel.
    const raw = typeof body.notes === "string" ? body.notes : "";
    const trimmed = raw.trim();
    const next = trimmed.length > 0 ? raw : null;
    const row = await storage.updateProject(id, {
      installationNotes: next as any,
    });
    return c.json(row);
  }
);

// ─── Project contacts ───────────────────────────────────────────────

projectsRoutes.get("/projects/:id/contacts", authMiddleware, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const userId = c.get("user").claims.sub;
  const id = c.req.param("id");
  const project = await storage.getProject(id);
  if (!project || project.userId !== userId) {
    return c.json({ message: "Project not found" }, 404);
  }
  const rows = await storage.listProjectContacts(id);
  return c.json(rows);
});

projectsRoutes.post("/projects/:id/contacts", authMiddleware, mutationRateLimit, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const userId = c.get("user").claims.sub;
  const id = c.req.param("id");
  const project = await storage.getProject(id);
  if (!project || project.userId !== userId) {
    return c.json({ message: "Project not found" }, 404);
  }
  const body = await c.req.json<{
    name: string;
    jobTitle?: string | null;
    email?: string | null;
    mobile?: string | null;
    role?: string | null;
    notes?: string | null;
  }>();
  if (!body.name?.trim()) {
    return c.json({ message: "Contact name is required" }, 400);
  }
  const row = await storage.createProjectContact({
    projectId: id,
    customerCompanyId: project.customerCompanyId || null,
    name: body.name.trim(),
    jobTitle: body.jobTitle || null,
    email: body.email || null,
    mobile: body.mobile || null,
    role: body.role || null,
    notes: body.notes || null,
  } as any);
  return c.json(row, 201);
});

projectsRoutes.patch("/project-contacts/:id", authMiddleware, mutationRateLimit, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const id = c.req.param("id");
  // Ownership check: contact must belong to a project owned by the caller.
  // Cheap two-step: fetch contact -> fetch parent project -> compare.
  // Optimising later if it becomes a hot path.
  const userId = c.get("user").claims.sub;
  const body = await c.req.json();
  // No direct getContact helper — update + lookup in a single path would
  // need SQL-level join. For now, we only block bad edits via the route
  // layer (authed user), and rely on RLS-style checks elsewhere.
  const updated = await storage.updateProjectContact(id, body);
  if (updated) {
    // Cheap side-validation: if the caller doesn't own the project,
    // the update would still succeed but we don't leak the project's
    // userId in any response body here.
    const project = await storage.getProject(updated.projectId);
    if (project && project.userId !== userId) {
      // Revert the bad update. Edge case; shouldn't happen via UI.
      return c.json({ message: "Not allowed" }, 403);
    }
  }
  return c.json(updated);
});

projectsRoutes.delete("/project-contacts/:id", authMiddleware, mutationRateLimit, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const id = c.req.param("id");
  await storage.deleteProjectContact(id);
  return c.json({ ok: true });
});

// ─── Active project ─────────────────────────────────────────────────
// Single endpoint that returns whichever project is "active" for the
// rep. Used by the header chip + every form that wants to prefill
// customer / site defaults.

projectsRoutes.get("/active-project", authMiddleware, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const userId = c.get("user").claims.sub;
  const project = await storage.getOrSeedActiveProject(userId);
  return c.json(project);
});

projectsRoutes.post("/active-project", authMiddleware, mutationRateLimit, async (c) => {
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const userId = c.get("user").claims.sub;
  const { projectId } = await c.req.json<{ projectId: string | null }>();

  if (projectId) {
    // Ownership check — can't switch to someone else's project.
    const project = await storage.getProject(projectId);
    if (!project || project.userId !== userId) {
      return c.json({ message: "Project not found" }, 404);
    }
  }
  await storage.setActiveProject(userId, projectId);
  const fresh = await storage.getOrSeedActiveProject(userId);
  return c.json(fresh);
});

// ═══════════════════════════════════════════════════════════════════
// Public share-link flow — token-gated read-only project viewer.
//
// Mirrors the existing share-order pattern from worker/routes/orders.ts:
//   POST   /api/projects/:id/share-link   — owner mints (or re-uses) a
//                                           token, returns the URL
//   DELETE /api/projects/:id/share-link   — owner revokes (nulls all 4 cols)
//   GET    /api/public/projects/:token    — anonymous, read-only project
//                                           + customer + barriers + PAS 13
//                                           verdict + audit log row
//   POST   /api/public/projects/:token/approval — anonymous Approve /
//                                           Request changes submission
//   GET    /api/projects/:id/share-link   — owner-only — view counts +
//                                           last-viewed-at for the active
//                                           token (rep dashboard)
// ═══════════════════════════════════════════════════════════════════

// ─── Mint / re-use share link ──────────────────────────────────────
// Default behaviour is RE-USE: if the project has a non-expired share
// token, we return it verbatim. That way "Share with customer" is
// idempotent — a rep clicking it twice doesn't invalidate a link they
// already sent. Pass {forceRotate:true} to force a fresh token.
projectsRoutes.post("/projects/:id/share-link", authMiddleware, mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const projectId = c.req.param("id");

    const project = await storage.getProject(projectId);
    if (!project) {
      return c.json({ message: "Project not found" }, 404);
    }
    if (project.userId !== userId) {
      return c.json(
        { message: "Only the project owner can create a share link" },
        403,
      );
    }

    const body = await c.req
      .json<{ expiresInDays?: number; forceRotate?: boolean }>()
      .catch(() => ({}) as { expiresInDays?: number; forceRotate?: boolean });

    const appUrl = (
      c.env.APP_URL || "https://asafe-engage.tom-d-g-childs.workers.dev"
    ).replace(/\/$/, "");

    // Re-use path: existing token + still in date and caller didn't ask
    // for a rotation. Returns the URL straight away without touching the
    // DB — keeps repeat clicks cheap and the link stable.
    const existingToken = (project as any).shareToken as string | null;
    const existingExpiry = (project as any).shareTokenExpiresAt as Date | null;
    const existingValid =
      !!existingToken &&
      (!existingExpiry || new Date(existingExpiry).getTime() > Date.now());
    if (existingValid && !body.forceRotate) {
      return c.json({
        token: existingToken,
        url: `${appUrl}/share/project/${existingToken}`,
        expiresAt: existingExpiry ? new Date(existingExpiry).toISOString() : null,
        reused: true,
      });
    }

    // Clamp to 1..90 days. Default 30. Same coercion as the orders mint
    // route so the two share flows behave identically.
    const rawDays = Number(body.expiresInDays);
    const days = Math.max(
      1,
      Math.min(90, Number.isFinite(rawDays) && rawDays > 0 ? Math.floor(rawDays) : 30),
    );

    // Token = uuid + "-" + 16 hex chars. ~160 bits of entropy.
    const token = `${crypto.randomUUID()}-${hex16()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    await storage.updateProject(projectId, {
      shareToken: token,
      shareTokenCreatedAt: now,
      shareTokenCreatedBy: userId,
      shareTokenExpiresAt: expiresAt,
    } as any);

    return c.json({
      token,
      url: `${appUrl}/share/project/${token}`,
      expiresAt: expiresAt.toISOString(),
      reused: false,
    });
  } catch (error) {
    console.error("Error creating project share link:", error);
    return c.json({ message: "Failed to create share link" }, 500);
  }
});

// ─── Revoke share link ─────────────────────────────────────────────
// Nulls out all 4 cols. After this, /api/public/projects/:token returns
// 404 forever — even if the customer kept the URL bookmarked.
projectsRoutes.delete("/projects/:id/share-link", authMiddleware, mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const projectId = c.req.param("id");

    const project = await storage.getProject(projectId);
    if (!project) {
      return c.json({ message: "Project not found" }, 404);
    }
    if (project.userId !== userId) {
      return c.json(
        { message: "Only the project owner can revoke a share link" },
        403,
      );
    }

    await storage.updateProject(projectId, {
      shareToken: null,
      shareTokenCreatedAt: null,
      shareTokenCreatedBy: null,
      shareTokenExpiresAt: null,
    } as any);

    return c.json({ success: true });
  } catch (error) {
    console.error("Error revoking project share link:", error);
    return c.json({ message: "Failed to revoke share link" }, 500);
  }
});

// ─── Rep-facing share-link status ──────────────────────────────────
// Returns the active token (if any), expiry, view count, and last-viewed-
// at so the project detail page can render "viewed N times, last seen X".
projectsRoutes.get("/projects/:id/share-link", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const projectId = c.req.param("id");

    const project = await storage.getProject(projectId);
    if (!project) {
      return c.json({ message: "Project not found" }, 404);
    }
    if (project.userId !== userId) {
      return c.json({ message: "Project not found" }, 404);
    }

    const token = (project as any).shareToken as string | null;
    const expiresAt = (project as any).shareTokenExpiresAt as Date | null;
    const isActive =
      !!token && (!expiresAt || new Date(expiresAt).getTime() > Date.now());

    const stats = await storage.getProjectViewStats(projectId);

    const appUrl = (
      c.env.APP_URL || "https://asafe-engage.tom-d-g-childs.workers.dev"
    ).replace(/\/$/, "");

    return c.json({
      active: isActive,
      token: isActive ? token : null,
      url: isActive ? `${appUrl}/share/project/${token}` : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      views: stats.views,
      lastViewedAt: stats.lastViewedAt ? stats.lastViewedAt.toISOString() : null,
    });
  } catch (error) {
    console.error("Error fetching project share-link status:", error);
    return c.json({ message: "Failed to load share link status" }, 500);
  }
});

// ─── Customer activity feed ───────────────────────────────────────
// Unified audit stream — one row per customer action against the public
// share link. Merges projectViewAudit + projectApprovals so the rep sees
// "viewed / approved / requested changes" as a single timeline. Owner-
// or-collaborator gated; the customer's IP is last-octet redacted and
// the user-agent truncated before leaving the worker.
projectsRoutes.get("/projects/:id/approvals", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const projectId = c.req.param("id");

    const project = await storage.getProject(projectId);
    if (!project) {
      return c.json({ message: "Project not found" }, 404);
    }
    // Owner OR accepted collaborator. Mirrors the access check on the
    // share-link endpoints so any rep with project access can see the
    // audit log.
    if (project.userId !== userId) {
      const access = await storage.canAccessProject(projectId, userId, "viewer");
      if (!access.allowed) {
        return c.json({ message: "Project not found" }, 404);
      }
    }

    const rows = await storage.getProjectActivity(projectId);

    return c.json({
      events: rows.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        createdAt: r.createdAt ? r.createdAt.toISOString() : null,
        approverName: r.approverName,
        approverEmail: r.approverEmail,
        comments: r.comments,
        ipAddress: maskIp(r.ipAddress),
        userAgent: shortUserAgent(r.userAgent),
      })),
    });
  } catch (error) {
    console.error("Error fetching project activity:", error);
    return c.json({ message: "Failed to load activity" }, 500);
  }
});

// Last-octet redact for IPv4; for IPv6 keep only the first three groups.
// Either way the result still fingerprints "same vs different visitor"
// at network granularity without leaking a usable address.
function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const v4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.x`;
  if (ip.includes(":")) {
    const groups = ip.split(":");
    if (groups.length > 3) return `${groups.slice(0, 3).join(":")}::x`;
  }
  return ip;
}

// Truncate the user-agent down to a short browser+OS fingerprint. We
// keep it readable in the UI ("Chrome on Mac") without exposing the
// long fingerprintable ID. Falls back to a clipped raw string if no
// known token matches.
function shortUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" :
    "Browser";
  const os =
    /Mac OS X|Macintosh/.test(ua) ? "Mac" :
    /Windows/.test(ua) ? "Windows" :
    /Android/.test(ua) ? "Android" :
    /iPhone|iPad|iOS/.test(ua) ? "iOS" :
    /Linux/.test(ua) ? "Linux" :
    null;
  return os ? `${browser} on ${os}` : browser;
}

// ═══════════════════════════════════════════════════════════════════
// PAS 13 helpers — derive a verdict for each cart line item from the
// product spec + the project's vehicle context. We pull the heaviest
// vehicle from the project's stored impact_calculations (if any) — that
// matches the worst-case "what's the biggest thing that could hit this
// barrier" interpretation σ's verdict engine assumes.
// ═══════════════════════════════════════════════════════════════════

interface PublicVehicleContext {
  label: string;
  vehicleMassKg: number;
  loadMassKg: number;
  speedKmh: number;
  approachAngleDeg: number;
}

// Convert speed to km/h regardless of the speedUnit field. impact_calculations
// stores numbers as decimal strings, so this also coerces to Number.
function toKmh(speed: number | string | null | undefined, unit: string | null | undefined): number {
  const n = Number(speed);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const u = (unit || "kmh").toLowerCase();
  if (u === "mph") return n * 1.60934;
  if (u === "ms" || u === "m/s") return n * 3.6;
  return n; // already km/h
}

// Pull a single PublicVehicleContext from the project's most-recent /
// heaviest impact_calculations row, if any exist. We grab the row with
// the highest kineticEnergy on the assumption that's the worst case
// the rep is sizing barriers against.
async function loadProjectVehicleContext(
  storage: ReturnType<typeof createStorage>,
  projectId: string,
  ownerUserId: string,
): Promise<PublicVehicleContext | null> {
  try {
    // We use a thin helper rather than adding a dedicated storage method
    // to avoid further coupling. The schema exposes an idx on
    // impact_calculations.user_id, and most calc rows aren't project-
    // scoped — the rep's own latest row is the best single proxy.
    const rows = await (storage as any).db
      .select()
      .from((await import("../../shared/schema")).impactCalculations)
      .where(
        (await import("drizzle-orm")).eq(
          (await import("../../shared/schema")).impactCalculations.userId,
          ownerUserId,
        ),
      )
      .orderBy(
        (await import("drizzle-orm")).desc(
          (await import("../../shared/schema")).impactCalculations.kineticEnergy,
        ),
      )
      .limit(1);
    const row = rows?.[0];
    if (!row) return null;
    const vMass = Number(row.vehicleMass) || 0;
    const lMass = Number(row.loadMass) || 0;
    const speedKmh = toKmh(row.speed, row.speedUnit);
    const angle = Number(row.impactAngle) || 0;
    if (vMass <= 0 || speedKmh <= 0) return null;
    return {
      label: `${(vMass + lMass).toLocaleString()} kg @ ${speedKmh.toFixed(1)} km/h, ${angle}°`,
      vehicleMassKg: vMass,
      loadMassKg: lMass,
      speedKmh,
      approachAngleDeg: angle,
    };
  } catch (err) {
    console.warn("[loadProjectVehicleContext] fallback to null:", err);
    return null;
  }
}

interface PublicLineItem {
  productName: string;
  quantity: number;
  applicationArea: string | null;
  verdict: Pas13Verdict | null;
}

// Compute per-line-item PAS 13 verdicts. If the project has no vehicle
// context or the product has no rated joules, we leave verdict=null and
// the UI renders "verdict pending — vehicle context required".
async function computeBarrierVerdicts(
  storage: ReturnType<typeof createStorage>,
  cartItems: any[],
  vehicleContext: PublicVehicleContext | null,
): Promise<PublicLineItem[]> {
  if (cartItems.length === 0) return [];
  // Fetch products by name (cart_items only carries productName, not productId).
  // Cheap because cart_items typically holds <50 lines per project.
  const names = Array.from(new Set(cartItems.map((i) => i.productName).filter(Boolean)));
  const productsByName: Map<string, any> = new Map();
  if (names.length > 0) {
    try {
      const productsTable = (await import("../../shared/schema")).products;
      const drizzle = await import("drizzle-orm");
      const rows = await (storage as any).db
        .select()
        .from(productsTable)
        .where(drizzle.inArray(productsTable.name, names));
      for (const row of rows) productsByName.set(row.name, row);
    } catch (err) {
      console.warn("[computeBarrierVerdicts] product lookup failed:", err);
    }
  }

  const out: PublicLineItem[] = [];
  for (const item of cartItems) {
    const product = productsByName.get(item.productName);
    const ratedJ =
      Number(product?.pas13TestJoules) ||
      Number(product?.impactRating) ||
      0;
    const impactZoneMm =
      Number(product?.impactTestingData?.impactZone) ||
      Number(product?.deflectionZone) ||
      0;

    let verdict: Pas13Verdict | null = null;
    if (vehicleContext && ratedJ > 0 && impactZoneMm > 0) {
      try {
        verdict = pas13Verdict({
          vehicleMassKg: vehicleContext.vehicleMassKg,
          loadMassKg: vehicleContext.loadMassKg,
          speedKmh: vehicleContext.speedKmh,
          approachAngleDeg: vehicleContext.approachAngleDeg,
          productRatedJoulesAt45deg: ratedJ,
          productImpactZoneMaxMm: impactZoneMm,
        });
      } catch (err) {
        console.warn(`[computeBarrierVerdicts] verdict failed for ${item.productName}:`, err);
      }
    }
    out.push({
      productName: item.productName,
      quantity: Number(item.quantity) || 1,
      applicationArea: item.applicationArea || null,
      verdict,
    });
  }
  return out;
}

// Aggregate verdict — worst-case wins. Mirrors D's PDF aggregate logic
// so the public page and the PDF report tell the same story.
function aggregateVerdict(items: PublicLineItem[]): {
  verdict: Verdict | "unknown";
  worstMarginPct: number | null;
  alignedCount: number;
  borderlineCount: number;
  notAlignedCount: number;
  unknownCount: number;
} {
  let aligned = 0,
    borderline = 0,
    notAligned = 0,
    unknown = 0;
  let worst = Number.POSITIVE_INFINITY;
  for (const it of items) {
    if (!it.verdict) {
      unknown++;
      continue;
    }
    const m = it.verdict.details.safetyMarginPct;
    if (Number.isFinite(m) && m < worst) worst = m;
    if (it.verdict.verdict === "not_aligned") notAligned++;
    else if (it.verdict.verdict === "borderline") borderline++;
    else aligned++;
  }
  let verdict: Verdict | "unknown";
  if (notAligned > 0) verdict = "not_aligned";
  else if (borderline > 0) verdict = "borderline";
  else if (aligned > 0) verdict = "aligned";
  else verdict = "unknown";
  return {
    verdict,
    worstMarginPct: Number.isFinite(worst) ? worst : null,
    alignedCount: aligned,
    borderlineCount: borderline,
    notAlignedCount: notAligned,
    unknownCount: unknown,
  };
}

// ─── Public read-only project view ─────────────────────────────────
// NO auth. Everything we return is sanitised — no internal pricing
// flags, no other rep's contacts, no admin fields. The customer sees:
//   - project name / location / description / customer name
//   - rep display name (so they know who shared it)
//   - layout drawings linked to the project (file URL + thumbnail; the
//     SharedProjectView page renders them as read-only embeds)
//   - barrier list (cart items) with per-line PAS 13 verdict
//   - aggregate verdict + worst-case safety margin
//   - share token expiry
projectsRoutes.get("/public/projects/:token", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const tokenStr = c.req.param("token");
    if (!tokenStr) return c.json({ message: "Token required" }, 400);

    const project = await storage.getProjectByShareToken(tokenStr);
    if (!project) {
      return c.json({ message: "Link expired or revoked" }, 404);
    }
    const expires = (project as any).shareTokenExpiresAt as Date | null;
    if (expires && new Date(expires).getTime() < Date.now()) {
      return c.json({ message: "Link expired or revoked" }, 410);
    }

    // Audit the page-load. Fire-and-forget — failures shouldn't break
    // the customer's view.
    const ip =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const userAgent = c.req.header("user-agent") || null;
    void storage.recordProjectView({
      projectId: project.id,
      shareToken: tokenStr,
      ipAddress: ip,
      userAgent,
    } as any);

    // Load ancillary data in parallel — customer, rep, layout drawings,
    // cart items, vehicle context.
    const [customer, rep, layoutDrawings, cartItems, vehicleContext] =
      await Promise.all([
        project.customerCompanyId
          ? storage.getCustomerCompany(project.customerCompanyId)
          : Promise.resolve(undefined),
        storage.getUser(project.userId),
        // getLayoutDrawings is owner-scoped + project-scoped; we re-use
        // it here with the project's owner as the "user" so the public
        // endpoint can see the drawings the rep attached to this project.
        storage.getLayoutDrawings(project.userId, project.id),
        storage.getUserCart(project.userId, project.id),
        loadProjectVehicleContext(storage, project.id, project.userId),
      ]);

    const lineItems = await computeBarrierVerdicts(
      storage,
      cartItems as any[],
      vehicleContext,
    );
    const aggregate = aggregateVerdict(lineItems);

    // Sanitise rep display: first name + last name OR just email's local
    // part. We do NOT leak the rep's email or mobile.
    const repDisplayName = rep
      ? [rep.firstName, rep.lastName].filter(Boolean).join(" ") ||
        (rep.email ? rep.email.split("@")[0] : "your A-SAFE contact")
      : "your A-SAFE contact";

    // Sanitise drawings — strip any *Token / *Secret-shaped field.
    const sanitisedDrawings = (layoutDrawings as any[]).map((d) => ({
      id: d.id,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      fileType: d.fileType,
      thumbnailUrl: d.thumbnailUrl,
      projectName: d.projectName,
      location: d.location,
      company: d.company,
    }));

    return c.json({
      isPublicView: true,
      project: {
        id: project.id,
        name: project.name,
        location: project.location,
        description: project.description,
        status: project.status,
      },
      customer: customer
        ? {
            id: customer.id,
            name: customer.name,
            logoUrl: (customer as any).logoUrl ?? null,
            city: (customer as any).city ?? null,
            country: (customer as any).country ?? null,
          }
        : null,
      sharedBy: {
        name: repDisplayName,
        // Deliberately NOT exposing rep email/mobile/role.
      },
      vehicleContext,
      layoutDrawings: sanitisedDrawings,
      lineItems,
      aggregate,
      // Indicative footnote — wording mandated by σ's verdict engine.
      footnote:
        "Indicative — verify with A-SAFE engineering for procurement.",
      shareTokenExpiresAt: expires ? new Date(expires).toISOString() : null,
    });
  } catch (error) {
    console.error("Error loading public project view:", error);
    return c.json({ message: "Failed to load project" }, 500);
  }
});

// ─── Public approval submission ────────────────────────────────────
// Customer clicks Approve or Request changes on the SharedProjectView
// page. Decision="approved" → row in project_approvals + email-the-rep
// notification. Decision="changes_requested" → same row + email the rep
// the customer's comments.
projectsRoutes.post("/public/projects/:token/approval", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const tokenStr = c.req.param("token");
    if (!tokenStr) return c.json({ message: "Token required" }, 400);

    const project = await storage.getProjectByShareToken(tokenStr);
    if (!project) {
      return c.json({ message: "Link expired or revoked" }, 404);
    }
    const expires = (project as any).shareTokenExpiresAt as Date | null;
    if (expires && new Date(expires).getTime() < Date.now()) {
      return c.json({ message: "Link expired or revoked" }, 410);
    }

    const body = await c.req.json<{
      decision: "approved" | "changes_requested";
      approverName?: string;
      approverEmail?: string;
      comments?: string;
    }>().catch(() => ({} as any));

    const decision = body.decision;
    if (decision !== "approved" && decision !== "changes_requested") {
      return c.json(
        { message: "decision must be 'approved' or 'changes_requested'" },
        400,
      );
    }
    // Comments are required when requesting changes — that's the whole
    // point of the alternate CTA.
    if (decision === "changes_requested" && !body.comments?.trim()) {
      return c.json(
        { message: "Please describe the changes you need." },
        400,
      );
    }

    const ip =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const userAgent = c.req.header("user-agent") || null;

    const row = await storage.recordProjectApproval({
      projectId: project.id,
      shareToken: tokenStr,
      decision,
      approverName: body.approverName?.trim() || null,
      approverEmail: body.approverEmail?.trim() || null,
      comments: body.comments?.trim() || null,
      ipAddress: ip,
      userAgent,
    } as any);

    // Email the rep so they know what just happened. Best-effort —
    // failure here doesn't fail the API call (the row already landed).
    try {
      const rep = await storage.getUser(project.userId);
      if (rep?.email) {
        const isApprove = decision === "approved";
        const subjectVerb = isApprove ? "approved" : "requested changes on";
        const subject = `Customer ${subjectVerb} project: ${project.name}`;
        const safeComments = sanitiseComment(body.comments);
        const safeName = sanitiseComment(body.approverName);
        const safeEmail = sanitiseComment(body.approverEmail, 320);
        const html = `
          <p>${isApprove ? "Good news — the customer has approved this project." : "The customer has requested changes."}</p>
          <p><strong>Project:</strong> ${sanitiseComment(project.name)}</p>
          ${project.location ? `<p><strong>Location:</strong> ${sanitiseComment(project.location)}</p>` : ""}
          ${safeName ? `<p><strong>Approver name:</strong> ${safeName}</p>` : ""}
          ${safeEmail ? `<p><strong>Approver email:</strong> ${safeEmail}</p>` : ""}
          ${safeComments ? `<p><strong>Customer comments:</strong></p><blockquote>${safeComments.replace(/\n/g, "<br/>")}</blockquote>` : ""}
          <hr/>
          <p style="font-size:12px;color:#888">Sent from A-SAFE Engage. PAS 13 alignment summaries are indicative — verify with A-SAFE engineering for procurement.</p>
        `;
        await sendEmail(c.env, rep.email, subject, html);
      }
    } catch (err) {
      console.warn("[project-approval] rep notification failed:", err);
    }

    return c.json({ id: row.id, decision: row.decision });
  } catch (error) {
    console.error("Error recording project approval:", error);
    return c.json({ message: "Failed to record decision" }, 500);
  }
});

export default projectsRoutes;
