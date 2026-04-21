import { createMiddleware } from "hono/factory";
import type { Env, Variables } from "../types";
import { getDb } from "../db";
import { createStorage } from "../storage";

/**
 * Ensures the authenticated user can access the project referenced by
 * :projectId in the URL. Sets `c.var.projectRole` to "owner" | "editor"
 * | "viewer" so downstream handlers can gate mutations by role.
 *
 * Usage:
 *   router.get("/projects/:id", authMiddleware, requireProjectAccess("viewer"), handler)
 *   router.patch("/projects/:id", authMiddleware, requireProjectAccess("editor"), handler)
 */
export function requireProjectAccess(
  minRole: "viewer" | "editor" | "owner" = "viewer",
) {
  return createMiddleware<{ Bindings: Env; Variables: Variables & { projectRole?: string } }>(
    async (c, next) => {
      const session = c.get("user");
      if (!session) return c.json({ message: "Unauthorized" }, 401);
      const projectId = c.req.param("id") || c.req.param("projectId");
      if (!projectId) return c.json({ message: "Missing projectId" }, 400);
      const storage = createStorage(getDb(c.env.DATABASE_URL));
      const { allowed, role } = await storage.canAccessProject(
        projectId,
        session.claims.sub,
        minRole,
      );
      if (!allowed) {
        return c.json({ message: "Forbidden" }, 403);
      }
      c.set("projectRole", role ?? "viewer");
      await next();
    },
  );
}
