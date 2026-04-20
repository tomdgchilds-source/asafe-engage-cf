import { createMiddleware } from "hono/factory";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import bcrypt from "bcryptjs";
import type { Env, Variables, SessionData } from "../types";
import { getDb } from "../db";
import { createStorage } from "../storage";
import type { Context } from "hono";

const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

// Get session from KV by cookie sid
async function getSession(c: Context<{ Bindings: Env }>): Promise<SessionData | null> {
  const sid = getCookie(c, "sid");
  if (!sid) return null;
  const data = await c.env.KV_SESSIONS.get<SessionData>(`session:${sid}`, "json");
  if (!data) return null;
  if (data.expires_at < Math.floor(Date.now() / 1000)) {
    await c.env.KV_SESSIONS.delete(`session:${sid}`);
    return null;
  }
  return data;
}

// Create a new session in KV and set the cookie
export async function createSession(
  c: Context<{ Bindings: Env }>,
  user: { id: string; email: string | null; firstName: string | null; lastName: string | null }
): Promise<SessionData> {
  const sid = crypto.randomUUID();
  const session: SessionData = {
    claims: {
      sub: user.id,
      email: user.email ?? undefined,
      first_name: user.firstName ?? undefined,
      last_name: user.lastName ?? undefined,
    },
    expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL,
  };
  await c.env.KV_SESSIONS.put(`session:${sid}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });
  setCookie(c, "sid", sid, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL,
    path: "/",
  });
  return session;
}

// Destroy session
export async function destroySession(c: Context<{ Bindings: Env }>): Promise<void> {
  const sid = getCookie(c, "sid");
  if (sid) {
    await c.env.KV_SESSIONS.delete(`session:${sid}`);
    deleteCookie(c, "sid", { path: "/" });
  }
}

// Auth middleware — requires valid session, sets c.var.user
export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const session = await getSession(c);
    if (!session) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    c.set("user", session);
    await next();
  }
);

// Optional auth — sets c.var.user if session exists, but doesn't block
export const optionalAuth = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const session = await getSession(c);
    if (session) {
      c.set("user", session);
    }
    await next();
  }
);

// Login handler — verify email+password, create session
export async function handleLogin(c: Context<{ Bindings: Env }>) {
  const body = await c.req.json<{ email: string; password: string }>();
  if (!body.email || !body.password) {
    return c.json({ message: "Email and password are required" }, 400);
  }

  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const user = await storage.getUserByEmail(body.email.toLowerCase().trim());

  if (!user || !user.passwordHash) {
    return c.json({ message: "Invalid email or password" }, 401);
  }

  const valid = await bcrypt.compare(body.password, user.passwordHash);
  if (!valid) {
    return c.json({ message: "Invalid email or password" }, 401);
  }

  await createSession(c, user);

  // Fire-and-forget activity log
  try {
    c.executionCtx.waitUntil(
      storage.logUserActivity({
        userId: user.id,
        activityType: "login",
        section: "auth",
        details: { method: "email" },
        ipAddress: c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || undefined,
        userAgent: c.req.header("user-agent") || undefined,
      })
    );
  } catch {}

  return c.json({ ok: true });
}
