/**
 * /api/projects/:id/collaborators  + /api/users/searchable
 *
 * Shared-access plumbing for projects: list / add / update / remove
 * collaborators, plus a searchable user picker for the "Add teammate"
 * modal. Role model is owner | editor | viewer (see storage.canAccessProject
 * for the access semantics). Instant-grant invites, no accept step — a
 * new collaborator row lands with acceptedAt=now() and shows up in the
 * invitee's Projects list immediately.
 */

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { requireProjectAccess } from "../middleware/projectAccess";
import { getDb } from "../db";
import { createStorage } from "../storage";

const collaborators = new Hono<{ Bindings: Env; Variables: Variables }>();

// List collaborators on a project. Any accessible user can read — including
// editors and viewers — so the Team tab works in all roles.
collaborators.get(
  "/projects/:id/collaborators",
  authMiddleware,
  requireProjectAccess("viewer"),
  async (c) => {
    try {
      const storage = createStorage(getDb(c.env.DATABASE_URL));
      const rows = await storage.listCollaborators(c.req.param("id"));
      return c.json(rows);
    } catch (err) {
      console.error("listCollaborators failed", err);
      return c.json({ message: "Failed to list collaborators" }, 500);
    }
  },
);

// Add a collaborator. Editors + owners can add; viewers cannot.
// Fires an in-app notification for the invitee so they see the new
// project in their feed.
collaborators.post(
  "/projects/:id/collaborators",
  authMiddleware,
  requireProjectAccess("editor"),
  async (c) => {
    try {
      const storage = createStorage(getDb(c.env.DATABASE_URL));
      const projectId = c.req.param("id");
      const session = c.get("user");
      const body = await c.req.json<{
        userId?: string;
        role?: "owner" | "editor" | "viewer";
      }>();
      if (!body.userId || !body.role) {
        return c.json({ message: "userId and role required" }, 400);
      }
      if (!["owner", "editor", "viewer"].includes(body.role)) {
        return c.json({ message: "Invalid role" }, 400);
      }
      if (body.userId === session.claims.sub) {
        return c.json(
          { message: "You're already on this project as owner" },
          400,
        );
      }

      const row = await storage.addCollaborator({
        projectId,
        userId: body.userId,
        role: body.role,
        invitedBy: session.claims.sub,
      });

      // Best-effort notification. Fire-and-forget so a missing notifications
      // service never blocks the add. Look up the project for the title.
      try {
        const [proj] = await storage.getProjectById
          ? [await storage.getProjectById(projectId)]
          : [null as any];
        const projectName = proj?.name || "a project";
        if (typeof (storage as any).createNotification === "function") {
          await (storage as any).createNotification({
            userId: body.userId,
            type: "project_share",
            title: `Added to ${projectName}`,
            message: `You now have ${body.role} access.`,
            metadata: { projectId, role: body.role, invitedBy: session.claims.sub },
          });
        }
      } catch (notifyErr) {
        console.warn("notification (project_share) failed", notifyErr);
      }

      return c.json(row, 201);
    } catch (err) {
      console.error("addCollaborator failed", err);
      return c.json({ message: "Failed to add collaborator" }, 500);
    }
  },
);

// Update a collaborator's role. Owner only — editors can add people but
// shouldn't be able to hand someone the keys.
collaborators.patch(
  "/projects/:id/collaborators/:collabId",
  authMiddleware,
  requireProjectAccess("owner"),
  async (c) => {
    try {
      const storage = createStorage(getDb(c.env.DATABASE_URL));
      const projectId = c.req.param("id");
      const body = await c.req.json<{
        userId?: string;
        role?: "owner" | "editor" | "viewer";
      }>();
      if (!body.userId || !body.role) {
        return c.json({ message: "userId and role required" }, 400);
      }
      if (!["owner", "editor", "viewer"].includes(body.role)) {
        return c.json({ message: "Invalid role" }, 400);
      }
      const ok = await storage.updateCollaboratorRole(
        projectId,
        body.userId,
        body.role,
      );
      if (!ok) return c.json({ message: "Collaborator not found" }, 404);
      return c.json({ ok: true });
    } catch (err) {
      console.error("updateCollaboratorRole failed", err);
      return c.json({ message: "Failed to update role" }, 500);
    }
  },
);

// Remove a collaborator. Owner only. A user can also remove themselves
// (leave a project) — handled below via a different permission check.
collaborators.delete(
  "/projects/:id/collaborators/:collabId",
  authMiddleware,
  async (c) => {
    try {
      const storage = createStorage(getDb(c.env.DATABASE_URL));
      const projectId = c.req.param("id");
      const session = c.get("user");
      const body = await c.req.json<{ userId?: string }>().catch(() => ({}));
      const targetUserId = body.userId ?? session.claims.sub;

      // Self-leave requires only project access. Removing someone else
      // requires owner.
      const selfLeave = targetUserId === session.claims.sub;
      const { allowed } = await storage.canAccessProject(
        projectId,
        session.claims.sub,
        selfLeave ? "viewer" : "owner",
      );
      if (!allowed) return c.json({ message: "Forbidden" }, 403);

      const ok = await storage.removeCollaborator(projectId, targetUserId);
      if (!ok) return c.json({ message: "Collaborator not found" }, 404);
      return c.body(null, 204);
    } catch (err) {
      console.error("removeCollaborator failed", err);
      return c.json({ message: "Failed to remove collaborator" }, 500);
    }
  },
);

// Picker endpoint for the "Add teammate" modal. Excludes the caller,
// the project owner, and any existing collaborators so the UI doesn't
// offer duplicates.
collaborators.get("/users/searchable", authMiddleware, async (c) => {
  try {
    const storage = createStorage(getDb(c.env.DATABASE_URL));
    const session = c.get("user");
    const q = c.req.query("q") || "";
    const projectId = c.req.query("projectId");
    const rows = await storage.listShareableUsers({
      excludeUserId: session.claims.sub,
      excludeProjectId: projectId,
      query: q,
    });
    return c.json(rows);
  } catch (err) {
    console.error("listShareableUsers failed", err);
    return c.json({ message: "Failed to load users" }, 500);
  }
});

export default collaborators;
