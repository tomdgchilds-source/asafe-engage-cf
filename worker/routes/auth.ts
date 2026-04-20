import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware, handleLogin, destroySession, createSession } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";
import { sendEmail } from "../services/email";

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
    // Day-job label ("BDM" etc) — decoupled from `role` which is permissions.
    jobRole: (user as any).jobRole || "BDM",
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

// POST /api/register — create a new user account
auth.post("/register", async (c) => {
  try {
    const body = await c.req.json<{
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      company?: string;
      phone?: string;
      jobTitle?: string;
    }>();

    if (!body.email || !body.password || !body.firstName || !body.lastName) {
      return c.json({ message: "Email, password, first name, and last name are required" }, 400);
    }

    if (body.password.length < 6) {
      return c.json({ message: "Password must be at least 6 characters" }, 400);
    }

    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    // Check if user already exists
    const existing = await storage.getUserByEmail(body.email.toLowerCase().trim());
    if (existing) {
      return c.json({ message: "An account with this email already exists" }, 409);
    }

    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(body.password, 10);

    const user = await storage.createUser({
      email: body.email.toLowerCase().trim(),
      passwordHash,
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      company: body.company?.trim() || null,
      phone: body.phone?.trim() || null,
      jobTitle: body.jobTitle?.trim() || null,
      role: "customer",
    });

    await createSession(c, user);

    // Fire-and-forget activity log
    try {
      c.executionCtx.waitUntil(
        storage.logUserActivity({
          userId: user.id,
          activityType: "register",
          section: "auth",
          details: { method: "email" },
          ipAddress: c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || undefined,
          userAgent: c.req.header("user-agent") || undefined,
        })
      );
    } catch {}

    return c.json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (error: any) {
    console.error("Registration error:", error);
    return c.json({ message: "Registration failed" }, 500);
  }
});

// POST /api/auth/forgot-password
auth.post("/auth/forgot-password", async (c) => {
  const { email } = await c.req.json();
  if (!email) return c.json({ message: "Email required" }, 400);

  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const result = await storage.createPasswordResetToken(email);

  if (result) {
    const resetUrl = `${c.req.header("origin") || "https://asafe-engage.tom-d-g-childs.workers.dev"}/reset-password?token=${result.token}`;
    await sendEmail(c.env, email, "Reset Your Password - A-SAFE Engage", `
      <h2>Password Reset</h2>
      <p>You requested a password reset. Click the link below to set a new password:</p>
      <p><a href="${resetUrl}" style="background-color: #FFC72C; color: black; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Reset Password</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, ignore this email.</p>
    `);
  }

  // Always return success to prevent email enumeration
  return c.json({ message: "If an account with that email exists, a reset link has been sent." });
});

// POST /api/auth/reset-password
auth.post("/auth/reset-password", async (c) => {
  const { token, newPassword } = await c.req.json();
  if (!token || !newPassword) return c.json({ message: "Token and new password required" }, 400);
  if (newPassword.length < 6) return c.json({ message: "Password must be at least 6 characters" }, 400);

  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const user = await storage.verifyPasswordResetToken(token);

  if (!user) return c.json({ message: "Invalid or expired reset token" }, 400);

  const bcrypt = await import("bcryptjs");
  const hash = await bcrypt.hash(newPassword, 10);
  await storage.resetUserPassword(user.id, hash);

  return c.json({ message: "Password reset successfully" });
});

// ─── Google OAuth ────────────────────────────────────────

// Build base URL from request, trimming any whitespace from env var
function getBaseUrl(c: any): string {
  const envUrl = (c.env.APP_URL || "").trim();
  if (envUrl) return envUrl;
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

// GET /auth/google — redirect to Google
auth.get("/auth/google", async (c) => {
  const state = crypto.randomUUID();
  await c.env.KV_SESSIONS.put(`oauth_state:${state}`, "google", { expirationTtl: 600 });

  const baseUrl = getBaseUrl(c);
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /auth/google/callback
auth.get("/auth/google/callback", async (c) => {
  const steps: string[] = [];
  try {
    steps.push("1. Reading query params");
    const code = c.req.query("code");
    const state = c.req.query("state");
    const googleError = c.req.query("error");

    if (googleError) {
      console.error("Google OAuth denied:", googleError);
      return c.html(`<h2>Google OAuth Error</h2><p>Google denied access: ${googleError}</p><a href="/">Go home</a>`, 400);
    }

    if (!code || !state) {
      return c.html(`<h2>OAuth Error</h2><p>Missing code or state parameter. code=${!!code}, state=${!!state}</p><a href="/">Go home</a>`, 400);
    }

    steps.push("2. Verifying CSRF state in KV");
    const storedState = await c.env.KV_SESSIONS.get(`oauth_state:${state}`);
    if (!storedState) {
      console.error("Invalid OAuth state - not found in KV. state:", state);
      return c.html(`<h2>OAuth Error</h2><p>Invalid or expired state token. This can happen if you took too long to sign in, or if you refreshed the page. Please try again.</p><a href="/api/auth/google">Try again</a> | <a href="/">Go home</a>`, 400);
    }
    await c.env.KV_SESSIONS.delete(`oauth_state:${state}`);

    steps.push("3. Building redirect URI");
    const baseUrl = getBaseUrl(c);
    const redirectUri = `${baseUrl}/api/auth/google/callback`;
    console.log("OAuth callback - baseUrl:", baseUrl, "redirectUri:", redirectUri);

    steps.push("4. Exchanging code for tokens");
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("Google token exchange failed:", tokenRes.status, errBody);
      return c.html(`<h2>OAuth Error</h2><p>Token exchange failed (${tokenRes.status})</p><pre>${errBody}</pre><p>Redirect URI used: ${redirectUri}</p><a href="/">Go home</a>`, 500);
    }

    steps.push("5. Decoding id_token JWT");
    const tokens = await tokenRes.json() as any;
    const payload = JSON.parse(atob(tokens.id_token.split(".")[1]));
    const { sub: googleId, email, given_name, family_name } = payload;
    console.log("OAuth callback - Google user:", email, "googleId:", googleId);

    steps.push("6. Connecting to database");
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    steps.push("7. Looking up user by OAuth (google, " + googleId + ")");
    let user = await storage.getUserByOAuth("google", googleId);
    console.log("OAuth callback - getUserByOAuth result:", user ? user.id : "null");

    if (!user) {
      steps.push("8a. No OAuth user found, checking by email: " + email);
      user = await storage.getUserByEmail(email);
      if (user) {
        steps.push("8b. Found existing user by email, linking OAuth");
        await storage.linkOAuthAccount(user.id, "google", googleId);
      } else {
        steps.push("8c. No existing user, creating new OAuth user");
        user = await storage.createOAuthUser({
          email,
          firstName: given_name || "",
          lastName: family_name || "",
          provider: "google",
          oauthId: googleId,
        });
        console.log("OAuth callback - created new user:", user.id, user.email);
      }
    }

    steps.push("9. Creating session for user " + user.id);
    await createSession(c, user);

    // Fire-and-forget activity log
    try {
      c.executionCtx.waitUntil(
        storage.logUserActivity({
          userId: user.id,
          activityType: "login",
          section: "auth",
          details: { method: "google", email },
          ipAddress: c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || undefined,
          userAgent: c.req.header("user-agent") || undefined,
        })
      );
    } catch {}

    steps.push("10. Redirecting to app");
    // Redirect to / — the React SPA renders Dashboard when authenticated
    return c.redirect("/");
  } catch (err: any) {
    console.error("Google OAuth callback error at step:", steps[steps.length - 1], "error:", err?.message || err, err?.stack);
    const stepsHtml = steps.map(s => `<li>${s}</li>`).join("");
    return c.html(`
      <h2>OAuth Error</h2>
      <p><strong>Error:</strong> ${err?.message || "Unknown error"}</p>
      <h3>Steps completed:</h3>
      <ol>${stepsHtml}</ol>
      <p><a href="/api/auth/google">Try again</a> | <a href="/">Go home</a></p>
    `, 500);
  }
});

// ─── Apple Sign-In ───────────────────────────────────────

// GET /auth/apple — redirect to Apple
auth.get("/auth/apple", async (c) => {
  const state = crypto.randomUUID();
  await c.env.KV_SESSIONS.put(`oauth_state:${state}`, "apple", { expirationTtl: 600 });

  const redirectUri = `${c.env.APP_URL || c.req.header("origin") || "https://asafe-engage.tom-d-g-childs.workers.dev"}/api/auth/apple/callback`;
  const params = new URLSearchParams({
    client_id: c.env.APPLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "name email",
    response_mode: "form_post",
    state,
  });

  return c.redirect(`https://appleid.apple.com/auth/authorize?${params}`);
});

// POST /auth/apple/callback — Apple uses form_post
auth.post("/auth/apple/callback", async (c) => {
  const body = await c.req.parseBody();
  const code = body.code as string;
  const state = body.state as string;
  const userInfo = body.user ? JSON.parse(body.user as string) : null;

  if (!code || !state) return c.redirect("/?error=missing_params");

  const storedState = await c.env.KV_SESSIONS.get(`oauth_state:${state}`);
  if (!storedState) return c.redirect("/?error=invalid_state");
  await c.env.KV_SESSIONS.delete(`oauth_state:${state}`);

  const redirectUri = `${c.env.APP_URL || c.req.header("origin") || "https://asafe-engage.tom-d-g-childs.workers.dev"}/api/auth/apple/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: c.env.APPLE_CLIENT_ID,
      client_secret: c.env.APPLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) return c.redirect("/?error=token_exchange_failed");

  const tokens = await tokenRes.json() as any;
  const payload = JSON.parse(atob(tokens.id_token.split(".")[1]));
  const { sub: appleId, email } = payload;

  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);

  let user = await storage.getUserByOAuth("apple", appleId);

  if (!user) {
    user = await storage.getUserByEmail(email);
    if (user) {
      await storage.linkOAuthAccount(user.id, "apple", appleId);
    } else {
      user = await storage.createOAuthUser({
        email: email || `apple_${appleId}@private.relay`,
        firstName: userInfo?.name?.firstName || "",
        lastName: userInfo?.name?.lastName || "",
        provider: "apple",
        oauthId: appleId,
      });
    }
  }

  await createSession(c, user);

  // Fire-and-forget activity log
  try {
    c.executionCtx.waitUntil(
      storage.logUserActivity({
        userId: user.id,
        activityType: "login",
        section: "auth",
        details: { method: "apple", email },
        ipAddress: c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || undefined,
        userAgent: c.req.header("user-agent") || undefined,
      })
    );
  } catch {}

  return c.redirect("/");
});

export default auth;
