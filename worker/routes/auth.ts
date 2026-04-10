import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware, handleLogin, destroySession } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /api/login
auth.post("/login", async (c) => {
  return handleLogin(c);
});

// GET /api/logout
auth.get("/logout", async (c) => {
  await destroySession(c);
  return c.redirect("/");
});

// GET /api/auth/user — returns current user profile
auth.get("/auth/user", authMiddleware, async (c) => {
  const userId = c.get("user").claims.sub;
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const user = await storage.getUser(userId);

  if (!user) {
    return c.json({ message: "User not found" }, 404);
  }

  return c.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    company: user.company,
    phone: user.phone,
    jobTitle: user.jobTitle,
    department: user.department,
    address: user.address,
    city: user.city,
    country: user.country,
    role: user.role,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    profileCompleted: user.profileCompleted,
    mustCompleteProfile: user.mustCompleteProfile,
    profileImageUrl: user.profileImageUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

export default auth;
