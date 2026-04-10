import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const notifications = new Hono<{ Bindings: Env; Variables: Variables }>();

// ──────────────────────────────────────────────
// GET /api/notifications
// ──────────────────────────────────────────────
notifications.get("/api/notifications", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const limit = parseInt(c.req.query("limit") || "50", 10);
    const result = await storage.getUserNotifications(userId, limit);
    return c.json(result);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/notifications/unread
// ──────────────────────────────────────────────
notifications.get("/api/notifications/unread", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const result = await storage.getUnreadNotifications(userId);
    return c.json(result);
  } catch (error) {
    console.error("Error fetching unread notifications:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// PATCH /api/notifications/:id/read
// ──────────────────────────────────────────────
notifications.patch("/api/notifications/:id/read", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const id = c.req.param("id");
    await storage.markNotificationAsRead(id);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// PATCH /api/notifications/read-all
// ──────────────────────────────────────────────
notifications.patch("/api/notifications/read-all", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    await storage.markAllNotificationsAsRead(userId);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

export default notifications;
