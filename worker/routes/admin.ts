import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware, createSession } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const admin = new Hono<{ Bindings: Env; Variables: Variables }>();

// ──────────────────────────────────────────────
// POST /api/admin/login
// ──────────────────────────────────────────────
admin.post("/admin/login", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const { username, password } = await c.req.json<{
      username?: string;
      password?: string;
    }>();

    if (!username || !password) {
      return c.json({ message: "Username and password required" }, 400);
    }

    const adminUser = await storage.getAdminByUsername(username);
    if (!adminUser) {
      return c.json({ message: "Invalid credentials" }, 401);
    }

    const bcrypt = await import("bcryptjs");
    const isValidPassword = await bcrypt.compare(password, adminUser.passwordHash);
    if (!isValidPassword) {
      return c.json({ message: "Invalid credentials" }, 401);
    }

    if (!(adminUser as any).isActive) {
      return c.json({ message: "Account disabled" }, 403);
    }

    // Update last login
    await storage.updateAdminLastLogin(adminUser.id);

    const adminEmail = (adminUser as any).email;
    const adminFullName = (adminUser as any).fullName || adminUser.username;
    const adminRole = (adminUser as any).role || "admin";

    // Find or create a matching user in the users table so the regular
    // session-based auth system works for admin pages too
    let regularUser = adminEmail ? await storage.getUserByEmail(adminEmail) : null;
    if (regularUser && regularUser.role !== "admin") {
      // Promote existing user to admin role
      await storage.updateUser(regularUser.id, { role: "admin" });
      regularUser = await storage.getUser(regularUser.id);
    }

    // Create a regular session (sets the `sid` cookie that authMiddleware reads)
    const userForSession = regularUser || {
      id: adminUser.id,
      email: adminEmail,
      firstName: adminFullName.split(" ")[0],
      lastName: adminFullName.split(" ").slice(1).join(" ") || null,
    };
    await createSession(c, userForSession);

    // Also store admin-specific session data in KV for backward compat
    const adminSessionId = crypto.randomUUID();
    const sessionData = {
      id: adminUser.id,
      username: adminUser.username,
      fullName: adminFullName,
      email: adminEmail,
      role: adminRole,
    };

    await c.env.KV_SESSIONS.put(
      `admin:${adminSessionId}`,
      JSON.stringify(sessionData),
      { expirationTtl: 86400 },
    );

    return c.json(sessionData);
  } catch (error) {
    console.error("Admin login error:", error);
    return c.json({ message: "Login failed" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/admin/session — verify admin session
// ──────────────────────────────────────────────
admin.get("/admin/session", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const userRecord = await storage.getUser(userId);

    // Check regular users table for admin role
    if (userRecord?.role !== "admin") {
      // Also check if this user's email matches an admin_users entry
      const adminByEmail = userRecord?.email
        ? await storage.getAdminByEmail(userRecord.email)
        : null;
      if (!adminByEmail) {
        return c.json({ message: "Not an admin" }, 403);
      }
      // Promote the user to admin since they have a matching admin_users record
      await storage.updateUser(userId, { role: "admin" });
    }

    return c.json({
      id: userRecord!.id,
      email: userRecord!.email,
      firstName: userRecord!.firstName,
      lastName: userRecord!.lastName,
      fullName: [userRecord!.firstName, userRecord!.lastName].filter(Boolean).join(" ") || "Admin",
      role: "admin",
    });
  } catch (error) {
    console.error("Admin session check error:", error);
    return c.json({ message: "Session invalid" }, 401);
  }
});

// ──────────────────────────────────────────────
// POST /api/admin/logout — clear admin session
// ──────────────────────────────────────────────
admin.post("/admin/logout", async (c) => {
  try {
    const { getCookie, deleteCookie } = await import("hono/cookie");
    const sid = getCookie(c, "sid");
    if (sid) {
      await c.env.KV_SESSIONS.delete(`session:${sid}`);
      await c.env.KV_SESSIONS.delete(`admin:${sid}`);
      deleteCookie(c, "sid", { path: "/" });
    }
    return c.json({ message: "Logged out" });
  } catch (error) {
    console.error("Admin logout error:", error);
    return c.json({ message: "Logout failed" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/admin/stats
// ──────────────────────────────────────────────
admin.get("/admin/stats", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userRecord = await storage.getUser(c.get("user").claims.sub);
    if (userRecord?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }

    const allUsers = await storage.getAllUsers();
    const allOrders = await storage.getAllOrders();
    const allCalculations = await storage.getAllCalculations();
    const allProducts = await storage.getProducts();

    // Calculate stats
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const newUsersThisMonth = allUsers.filter(
      (u: any) => u.createdAt && new Date(u.createdAt) >= startOfMonth,
    ).length;

    const calculationsThisMonth = allCalculations.filter(
      (c: any) => c.createdAt && new Date(c.createdAt) >= startOfMonth,
    ).length;

    const productCategories = [
      ...new Set(allProducts.map((p: any) => p.category)),
    ].length;

    return c.json({
      totalUsers: allUsers.length,
      totalProducts: allProducts.length,
      totalCalculations: allCalculations.length,
      totalOrders: allOrders.length,
      productCategories,
      newUsersThisMonth,
      calculationsThisMonth,
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    return c.json({ message: "Failed to fetch admin stats" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/admin/users
// ──────────────────────────────────────────────
admin.get("/admin/users", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userRecord = await storage.getUser(c.get("user").claims.sub);
    if (userRecord?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }
    const users = await storage.getAllUsers();
    return c.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    return c.json({ message: "Failed to fetch users" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/admin/products
// ──────────────────────────────────────────────
admin.get("/admin/products", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userRecord = await storage.getUser(c.get("user").claims.sub);
    if (userRecord?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }
    const products = await storage.getProducts();
    return c.json(products);
  } catch (error) {
    console.error("Error fetching admin products:", error);
    return c.json({ message: "Failed to fetch admin products" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/admin/calculations
// ──────────────────────────────────────────────
admin.get("/admin/calculations", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userRecord = await storage.getUser(c.get("user").claims.sub);
    if (userRecord?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }
    const calculations = await storage.getAllCalculations();
    return c.json(calculations);
  } catch (error) {
    console.error("Error fetching admin calculations:", error);
    return c.json({ message: "Failed to fetch admin calculations" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/admin/activities
// ──────────────────────────────────────────────
admin.get("/admin/activities", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userRecord = await storage.getUser(c.get("user").claims.sub);
    if (userRecord?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }
    const activities = await storage.getAllUserActivities();
    return c.json(activities);
  } catch (error) {
    console.error("Error fetching activities:", error);
    return c.json({ message: "Failed to fetch activities" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/admin/users/:userId/activities
// ──────────────────────────────────────────────
admin.get("/admin/users/:userId/activities", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userRecord = await storage.getUser(c.get("user").claims.sub);
    if (userRecord?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }
    const userId = c.req.param("userId");
    const activities = await storage.getUserActivities(userId);
    return c.json(activities);
  } catch (error) {
    console.error("Error fetching user activities:", error);
    return c.json({ message: "Failed to fetch user activities" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/admin/users/:userId/details
// ──────────────────────────────────────────────
admin.get("/admin/users/:userId/details", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userRecord = await storage.getUser(c.get("user").claims.sub);
    if (userRecord?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }
    const userId = c.req.param("userId");

    const user = await storage.getUser(userId);
    const orders = await storage.getUserOrders(userId);
    const calculations = await storage.getUserCalculations(userId);
    const activities = await storage.getUserActivities(userId);
    const quoteRequests = await storage.getUserQuoteRequests(userId);
    const solutionRequests = await storage.getSolutionRequestsByUser(userId);
    const siteSurveys = await storage.getUserSiteSurveys(userId);

    return c.json({
      user,
      orders,
      calculations,
      activities,
      quoteRequests,
      solutionRequests,
      siteSurveys,
    });
  } catch (error) {
    console.error("Error fetching user details:", error);
    return c.json({ message: "Failed to fetch user details" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/admin/case-studies
// ──────────────────────────────────────────────
admin.post("/admin/case-studies", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const user = await storage.getUser(c.get("user").claims.sub);
    if (user?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }

    const body = await c.req.json();
    // TODO: port insertCaseStudySchema validation
    const caseStudy = await storage.createCaseStudy(body);
    return c.json(caseStudy);
  } catch (error) {
    console.error("Error creating case study:", error);
    return c.json({ message: "Failed to create case study" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/admin/resources
// ──────────────────────────────────────────────
admin.post("/admin/resources", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const user = await storage.getUser(c.get("user").claims.sub);
    if (user?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }

    const body = await c.req.json();
    // TODO: port insertResourceSchema validation
    const resource = await storage.createResource(body);
    return c.json(resource);
  } catch (error) {
    console.error("Error creating resource:", error);
    return c.json({ message: "Failed to create resource" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/admin/faqs
// ──────────────────────────────────────────────
admin.post("/admin/faqs", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const user = await storage.getUser(c.get("user").claims.sub);
    if (user?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }

    const body = await c.req.json();
    // TODO: port insertFaqSchema validation
    const faq = await storage.createFaq(body);
    return c.json(faq);
  } catch (error) {
    console.error("Error creating FAQ:", error);
    return c.json({ message: "Failed to create FAQ" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/analytics/quotes
// ──────────────────────────────────────────────
admin.get("/analytics/quotes", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const quotes = await storage.getUserQuoteRequests(userId);
    const orders = await storage.getUserOrders(userId);
    const calculations = await storage.getUserCalculations(userId);

    // Calculate basic metrics
    const totalQuotes = quotes.length;
    const totalValue = quotes.reduce(
      (sum: number, quote: any) => sum + parseFloat(quote.totalAmount || "0"),
      0,
    );
    const averageValue = totalQuotes > 0 ? totalValue / totalQuotes : 0;

    // Enhanced conversion metrics
    const convertedQuotes = orders.filter((order: any) =>
      quotes.some((quote: any) => quote.id === order.quoteRequestId),
    ).length;
    const conversionRate =
      totalQuotes > 0 ? (convertedQuotes / totalQuotes) * 100 : 0;

    // Conversion funnel
    const conversionFunnel = {
      calculations: calculations.length,
      quotes: quotes.length,
      sent: quotes.filter((q: any) => q.status === "sent").length,
      viewed: quotes.filter(
        (q: any) => q.status === "viewed" || q.status === "revised",
      ).length,
      converted: convertedQuotes,
    };

    // Win/loss analysis
    const winLossAnalysis = {
      won: quotes.filter(
        (q: any) => q.status === "accepted" || q.status === "converted",
      ).length,
      lost: quotes.filter(
        (q: any) => q.status === "rejected" || q.status === "expired",
      ).length,
      pending: quotes.filter(
        (q: any) => q.status === "pending" || q.status === "sent",
      ).length,
      revised: quotes.filter((q: any) => q.status === "revised").length,
    };

    // Get timeline data
    const timelineData = quotes
      .map((quote: any) => ({
        id: quote.id,
        date: quote.createdAt,
        status: quote.status,
        amount: parseFloat(quote.totalAmount || "0"),
        customerCompany: quote.customerCompany,
        lastUpdated: quote.updatedAt,
      }))
      .sort(
        (a: any, b: any) =>
          new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

    // Monthly trends
    const monthlyData: Record<
      string,
      { count: number; value: number; converted: number }
    > = {};
    quotes.forEach((quote: any) => {
      const date = new Date(quote.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { count: 0, value: 0, converted: 0 };
      }
      monthlyData[monthKey].count++;
      monthlyData[monthKey].value += parseFloat(quote.totalAmount || "0");
      if (quote.status === "accepted" || quote.status === "converted") {
        monthlyData[monthKey].converted++;
      }
    });

    return c.json({
      totalQuotes,
      totalValue,
      averageValue,
      conversionRate,
      conversionFunnel,
      winLossAnalysis,
      timelineData,
      monthlyData,
      recentQuotes: timelineData.slice(0, 5),
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return c.json({ error: "Failed to fetch analytics" }, 500);
  }
});

export default admin;
