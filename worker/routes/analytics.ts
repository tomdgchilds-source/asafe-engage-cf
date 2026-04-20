import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";
import { sendEmail } from "../services/email";

const analytics = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /api/contact
analytics.post("/contact", async (c) => {
  try {
    const contactSchema = z.object({
      name: z.string().min(1, "Name is required"),
      email: z.string().email("Valid email is required"),
      company: z.string().optional(),
      subject: z.string().min(1, "Subject is required"),
      message: z.string().min(1, "Message is required"),
    });

    const body = await c.req.json();
    const data = contactSchema.parse(body);

    // Team notification email
    const teamHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #FFC72C; padding: 20px; text-align: center;">
          <h1 style="color: #000; margin: 0;">New Contact Form Submission</h1>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p><strong>Name:</strong> ${data.name}</p>
          <p><strong>Email:</strong> ${data.email}</p>
          <p><strong>Company:</strong> ${data.company || "Not specified"}</p>
          <p><strong>Subject:</strong> ${data.subject}</p>
          <p><strong>Message:</strong></p>
          <div style="background: white; padding: 15px; border-radius: 5px;">${data.message}</div>
        </div>
      </div>
    `;

    // Confirmation email to the person who submitted the form
    const confirmationHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #FFC72C; padding: 20px; text-align: center;">
          <h1 style="color: #000; margin: 0;">We Received Your Message</h1>
        </div>
        <div style="padding: 20px; background-color: #f9f9f9;">
          <p>Hi ${data.name},</p>
          <p>Thank you for contacting A-SAFE. We have received your message regarding <strong>${data.subject}</strong> and our team will get back to you shortly.</p>
          <p>If you need immediate assistance, please don't hesitate to call your nearest A-SAFE office.</p>
          <br />
          <p>Best regards,<br />The A-SAFE Team</p>
        </div>
        <div style="padding: 16px; text-align: center; color: #888; font-size: 12px;">
          <p>A-SAFE - Pioneering Workplace Safety</p>
        </div>
      </div>
    `;

    // Send emails in the background so they don't block the response
    c.executionCtx.waitUntil(
      (async () => {
        try {
          await Promise.all([
            sendEmail(
              c.env,
              c.env.CONTACT_EMAIL || c.env.EMAIL_FROM,
              `Contact Form: ${data.subject}`,
              teamHtml,
            ),
            sendEmail(
              c.env,
              data.email,
              "We received your message - A-SAFE ENGAGE",
              confirmationHtml,
            ),
          ]);
        } catch (emailError) {
          console.error("Failed to send contact form emails:", emailError);
        }
      })(),
    );

    return c.json({ message: "Message sent successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ message: error.errors[0].message }, 400);
    }
    console.error("Failed to send contact form:", error);
    return c.json({ message: "Failed to send message. Please try again." }, 500);
  }
});

// POST /api/activity/record
analytics.post("/activity/record", authMiddleware, async (c) => {
  try {
    const userId = c.get("user").claims.sub;
    const { itemType, itemId, itemTitle, itemCategory, itemSubcategory, itemImage, metadata } =
      await c.req.json();

    if (!itemType || !itemId || !itemTitle) {
      return c.json(
        { message: "Missing required fields: itemType, itemId, and itemTitle are required" },
        400
      );
    }

    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const activity = await storage.recordUserActivity({
      userId,
      itemType,
      itemId,
      itemTitle,
      itemCategory,
      itemSubcategory,
      itemImage,
      metadata,
      viewCount: 1,
    });

    return c.json(activity);
  } catch (error) {
    console.error("Error recording user activity:", error);
    return c.json({ message: "Failed to record activity" }, 500);
  }
});

// GET /api/activity/recent
analytics.get("/activity/recent", authMiddleware, async (c) => {
  try {
    const userId = c.get("user").claims.sub;
    const limit = parseInt(c.req.query("limit") || "50");
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const activities = await storage.getUserRecentActivity(userId, limit);
    return c.json(activities);
  } catch (error) {
    console.error("Error fetching recent activity:", error);
    return c.json({ message: "Failed to fetch recent activity" }, 500);
  }
});

// DELETE /api/activity/cleanup
analytics.delete("/activity/cleanup", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userRecord = await storage.getUser(c.get("user").claims.sub);
    if (userRecord?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }
    await storage.cleanupOldActivity();
    return c.json({ success: true, message: "Old activities cleaned up successfully" });
  } catch (error) {
    console.error("Error cleaning up old activities:", error);
    return c.json({ message: "Failed to cleanup old activities" }, 500);
  }
});

// GET /api/currency/rates
analytics.get("/currency/rates", async (c) => {
  try {
    // Simplified currency service — fetch from exchangerate-api or return fallback rates
    const fallbackRates: Record<string, number> = {
      AED: 1,
      SAR: 1.02,
      GBP: 0.22,
      USD: 0.27,
      EUR: 0.25,
    };

    try {
      const res = await fetch("https://api.exchangerate-api.com/v4/latest/AED");
      if (res.ok) {
        const data = (await res.json()) as { rates: Record<string, number> };
        return c.json({
          AED: 1,
          SAR: data.rates.SAR || fallbackRates.SAR,
          GBP: data.rates.GBP || fallbackRates.GBP,
          USD: data.rates.USD || fallbackRates.USD,
          EUR: data.rates.EUR || fallbackRates.EUR,
        });
      }
    } catch {
      // Fall through to fallback rates
    }

    return c.json(fallbackRates);
  } catch (error) {
    console.error("Error fetching currency rates:", error);
    return c.json({ message: "Failed to fetch currency rates" }, 500);
  }
});

// GET /api/reminders/settings - user reminder preferences (stub)
analytics.get("/reminders/settings", authMiddleware, async (c) => {
  return c.json({ enabled: false, frequency: "daily" });
});

// POST /api/reminders/settings - save user reminder preferences (stub)
analytics.post("/reminders/settings", authMiddleware, async (c) => {
  const body = await c.req.json();
  return c.json({ enabled: body.enabled || false, frequency: body.frequency || "daily" });
});

// GET /api/reminders/quotes - get quote reminders (stub)
analytics.get("/reminders/quotes", authMiddleware, async (c) => {
  return c.json([]);
});

export default analytics;
