import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const notifications = new Hono<{ Bindings: Env; Variables: Variables }>();

// ──────────────────────────────────────────────
// GET /api/notifications
// ──────────────────────────────────────────────
notifications.get("/notifications", authMiddleware, async (c) => {
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
notifications.get("/notifications/unread", authMiddleware, async (c) => {
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
notifications.patch("/notifications/:id/read", authMiddleware, async (c) => {
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
notifications.patch("/notifications/read-all", authMiddleware, async (c) => {
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

// ──────────────────────────────────────────────
// POST /api/notifications (admin only)
// ──────────────────────────────────────────────
notifications.post("/notifications", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const user = c.get("user");

    // Check admin role via storage
    const userRecord = await storage.getUser(user.claims.sub);
    if (userRecord?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }

    const body = await c.req.json();
    const { userId, type, title, message, metadata } = body;

    if (!userId || !type || !title || !message) {
      return c.json({ message: "Missing required fields: userId, type, title, message" }, 400);
    }

    const notification = await storage.createNotification({
      userId,
      type,
      title,
      message,
      data: metadata || null,
    });

    return c.json(notification, 201);
  } catch (error) {
    console.error("Error creating notification:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// DELETE /api/notifications/:id
// ──────────────────────────────────────────────
notifications.delete("/notifications/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const user = c.get("user");
    const notificationId = c.req.param("id");

    // Fetch the user's notifications to verify ownership
    const userRecord = await storage.getUser(user.claims.sub);
    const isAdmin = userRecord?.role === "admin";

    // Get all notifications for the user to check ownership
    const userNotifications = await storage.getUserNotifications(user.claims.sub, 1000);
    const targetNotification = userNotifications.find((n) => n.id === notificationId);

    if (!targetNotification && !isAdmin) {
      return c.json({ message: "Notification not found or access denied" }, 404);
    }

    // If not admin and notification doesn't belong to user, deny
    if (!isAdmin && (!targetNotification || targetNotification.userId !== user.claims.sub)) {
      return c.json({ message: "Notification not found or access denied" }, 404);
    }

    await storage.deleteNotification(notificationId);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting notification:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

export default notifications;
