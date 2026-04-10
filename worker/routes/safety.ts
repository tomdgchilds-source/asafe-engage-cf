import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const safety = new Hono<{ Bindings: Env; Variables: Variables }>();

// =============================================
// SAFETY METRICS
// =============================================

// ──────────────────────────────────────────────
// GET /api/safety-metrics
// ──────────────────────────────────────────────
safety.get("/api/safety-metrics", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const metricType = c.req.query("metricType");
    const metrics = await storage.getUserSafetyMetrics(userId, metricType);
    return c.json(metrics);
  } catch (error) {
    console.error("Error fetching safety metrics:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/safety-metrics
// ──────────────────────────────────────────────
safety.post("/api/safety-metrics", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const body = await c.req.json();

    // TODO: port insertSafetyMetricsSchema validation
    const validatedData = { ...body, userId };

    const metric = await storage.createSafetyMetric(validatedData);
    return c.json(metric, 201);
  } catch (error) {
    console.error("Error creating safety metric:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// =============================================
// COMPLIANCE CHECKS
// =============================================

// ──────────────────────────────────────────────
// GET /api/compliance-checks
// ──────────────────────────────────────────────
safety.get("/api/compliance-checks", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const region = c.req.query("region");
    const checks = await storage.getComplianceChecks(userId, region);
    return c.json(checks);
  } catch (error) {
    console.error("Error fetching compliance checks:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/compliance-checks
// ──────────────────────────────────────────────
safety.post("/api/compliance-checks", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const body = await c.req.json();

    // TODO: port insertComplianceCheckSchema validation
    const validatedData = { ...body, userId };

    const check = await storage.createComplianceCheck(validatedData);
    return c.json(check, 201);
  } catch (error) {
    console.error("Error creating compliance check:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// =============================================
// SMART REORDERING
// =============================================

// ──────────────────────────────────────────────
// GET /api/smart-reorders
// ──────────────────────────────────────────────
safety.get("/api/smart-reorders", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const status = c.req.query("status");
    const reorders = await storage.getSmartReorders(userId, status);
    return c.json(reorders);
  } catch (error) {
    console.error("Error fetching smart reorders:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/smart-reorders
// ──────────────────────────────────────────────
safety.post("/api/smart-reorders", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const body = await c.req.json();

    // TODO: port insertSmartReorderSchema validation
    const validatedData = { ...body, userId };

    const reorder = await storage.createSmartReorder(validatedData);
    return c.json(reorder, 201);
  } catch (error) {
    console.error("Error creating smart reorder:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// PUT /api/smart-reorders/:id
// ──────────────────────────────────────────────
safety.put("/api/smart-reorders/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const id = c.req.param("id");
    const body = await c.req.json();

    // TODO: implement updateSmartReorder in storage
    const updated = await (storage as any).updateSmartReorder(id, { ...body, userId });
    return c.json(updated);
  } catch (error) {
    console.error("Error updating smart reorder:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// =============================================
// TRAINING
// =============================================

// ──────────────────────────────────────────────
// GET /api/training-modules
// ──────────────────────────────────────────────
safety.get("/api/training-modules", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const category = c.req.query("category");
    const difficulty = c.req.query("difficulty");
    const modules = await storage.getTrainingModules(category, difficulty);
    return c.json(modules);
  } catch (error) {
    console.error("Error fetching training modules:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/training-modules/:id
// ──────────────────────────────────────────────
safety.get("/api/training-modules/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const id = c.req.param("id");
    const mod = await storage.getTrainingModule(id);
    if (!mod) {
      return c.json({ message: "Training module not found" }, 404);
    }
    return c.json(mod);
  } catch (error) {
    console.error("Error fetching training module:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/training-progress
// ──────────────────────────────────────────────
safety.get("/api/training-progress", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const moduleId = c.req.query("moduleId");
    const progress = await storage.getUserTrainingProgress(userId, moduleId);
    return c.json(progress);
  } catch (error) {
    console.error("Error fetching training progress:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// PATCH /api/training-progress/:moduleId
// ──────────────────────────────────────────────
safety.patch("/api/training-progress/:moduleId", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const moduleId = c.req.param("moduleId");
    const { progressPercentage, timeSpent } = await c.req.json<{
      progressPercentage?: number;
      timeSpent?: number;
    }>();

    const progress = await storage.updateTrainingProgress(
      userId,
      moduleId,
      progressPercentage,
      timeSpent,
    );
    return c.json(progress);
  } catch (error) {
    console.error("Error updating training progress:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// =============================================
// FORUM
// =============================================

// ──────────────────────────────────────────────
// GET /api/forum/categories
// ──────────────────────────────────────────────
safety.get("/api/forum/categories", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const categories = await storage.getForumCategories();
    return c.json(categories);
  } catch (error) {
    console.error("Error fetching forum categories:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/forum/categories/:categoryId/topics
// ──────────────────────────────────────────────
safety.get("/api/forum/categories/:categoryId/topics", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const categoryId = c.req.param("categoryId");
    const limit = parseInt(c.req.query("limit") || "20", 10);
    const offset = parseInt(c.req.query("offset") || "0", 10);

    const topics = await storage.getForumTopics(categoryId, limit, offset);
    return c.json(topics);
  } catch (error) {
    console.error("Error fetching forum topics:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/forum/topics
// ──────────────────────────────────────────────
safety.post("/api/forum/topics", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const body = await c.req.json();

    // TODO: port insertForumTopicSchema validation
    const validatedData = { ...body, authorId: userId };

    const topic = await storage.createForumTopic(validatedData);
    return c.json(topic, 201);
  } catch (error) {
    console.error("Error creating forum topic:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/forum/topics/:topicId/replies
// ──────────────────────────────────────────────
safety.get("/api/forum/topics/:topicId/replies", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const topicId = c.req.param("topicId");
    const limit = parseInt(c.req.query("limit") || "20", 10);
    const offset = parseInt(c.req.query("offset") || "0", 10);

    const replies = await storage.getForumReplies(topicId, limit, offset);
    return c.json(replies);
  } catch (error) {
    console.error("Error fetching forum replies:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/forum/topics/:topicId/replies
// ──────────────────────────────────────────────
safety.post("/api/forum/topics/:topicId/replies", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const topicId = c.req.param("topicId");
    const body = await c.req.json();

    // TODO: implement createForumReply in storage
    const validatedData = { ...body, topicId, authorId: userId };
    const reply = await (storage as any).createForumReply(validatedData);
    return c.json(reply, 201);
  } catch (error) {
    console.error("Error creating forum reply:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// =============================================
// MARKET TRENDS
// =============================================

// ──────────────────────────────────────────────
// GET /api/market-trends
// ──────────────────────────────────────────────
safety.get("/api/market-trends", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const region = c.req.query("region");
    const industry = c.req.query("industry");
    const isPublic = c.req.query("isPublic");
    const trends = await storage.getMarketTrends(
      region,
      industry,
      isPublic ? isPublic === "true" : undefined,
    );
    return c.json(trends);
  } catch (error) {
    console.error("Error fetching market trends:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// =============================================
// CONTRACTS
// =============================================

// ──────────────────────────────────────────────
// GET /api/contracts
// ──────────────────────────────────────────────
safety.get("/api/contracts", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const status = c.req.query("status");
    const contracts = await storage.getUserContracts(userId, status);
    return c.json(contracts);
  } catch (error) {
    console.error("Error fetching contracts:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/contracts
// ──────────────────────────────────────────────
safety.post("/api/contracts", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const body = await c.req.json();

    // TODO: port insertContractSchema validation
    const validatedData = { ...body, userId, createdBy: userId };

    const contract = await storage.createContract(validatedData);
    return c.json(contract, 201);
  } catch (error) {
    console.error("Error creating contract:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// =============================================
// CONVERSATIONS (non-chat, general messaging)
// =============================================

// ──────────────────────────────────────────────
// GET /api/conversations
// ──────────────────────────────────────────────
safety.get("/api/conversations", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const conversations = await storage.getUserConversations(userId);
    return c.json(conversations);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/conversations
// ──────────────────────────────────────────────
safety.post("/api/conversations", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const body = await c.req.json();

    // TODO: port insertConversationSchema validation
    const validatedData = { ...body, createdBy: userId };

    const conversation = await storage.createConversation(validatedData);

    // Add creator as participant
    await storage.addConversationParticipant(conversation.id, userId, "admin");

    return c.json(conversation, 201);
  } catch (error) {
    console.error("Error creating conversation:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/conversations/:id/messages
// ──────────────────────────────────────────────
safety.get("/api/conversations/:id/messages", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const id = c.req.param("id");
    const limit = parseInt(c.req.query("limit") || "50", 10);
    const offset = parseInt(c.req.query("offset") || "0", 10);

    const messages = await storage.getConversationMessages(id, limit, offset);
    return c.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/conversations/:id/messages
// ──────────────────────────────────────────────
safety.post("/api/conversations/:id/messages", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const conversationId = c.req.param("id");
    const body = await c.req.json();

    // TODO: port insertMessageSchema validation
    const validatedData = { ...body, conversationId, senderId: userId };

    const message = await storage.createMessage(validatedData);
    return c.json(message, 201);
  } catch (error) {
    console.error("Error creating message:", error);
    return c.json({ message: "Internal server error" }, 500);
  }
});

// =============================================
// SAFETY TIPS
// =============================================

// ──────────────────────────────────────────────
// GET /api/safety-tips
// ──────────────────────────────────────────────
safety.get("/api/safety-tips", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const category = c.req.query("category");
    const triggerType = c.req.query("triggerType");
    const zone = c.req.query("zone");
    const productId = c.req.query("productId");

    // TODO: port direct Drizzle query for safety tips with filtering
    // For now, delegate to storage layer
    const tips = await (storage as any).getSafetyTips({
      category,
      triggerType,
      zone,
      productId,
    });

    return c.json(tips);
  } catch (error) {
    console.error("Error fetching safety tips:", error);
    return c.json({ error: "Failed to fetch safety tips" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/safety-tips/:tipId/feedback
// ──────────────────────────────────────────────
safety.post("/api/safety-tips/:tipId/feedback", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const tipId = c.req.param("tipId");
    const userId = c.get("user").claims.sub;
    const { helpful } = await c.req.json<{ helpful?: boolean }>();

    // TODO: port direct Drizzle update for userSafetyTipInteractions
    await (storage as any).updateSafetyTipFeedback(userId, tipId, helpful);

    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating tip feedback:", error);
    return c.json({ error: "Failed to update feedback" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/safety-progress
// ──────────────────────────────────────────────
safety.get("/api/safety-progress", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;

    // TODO: port direct Drizzle query for safetyProgress with recommendations
    const result = await (storage as any).getSafetyProgress(userId);

    return c.json(result);
  } catch (error) {
    console.error("Error fetching safety progress:", error);
    return c.json({ error: "Failed to fetch safety progress" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/safety-progress
// ──────────────────────────────────────────────
safety.post("/api/safety-progress", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const updates = await c.req.json();

    // TODO: port direct Drizzle update for safetyProgress
    await (storage as any).updateSafetyProgress(userId, updates);

    return c.json({ success: true });
  } catch (error) {
    console.error("Error updating safety progress:", error);
    return c.json({ error: "Failed to update safety progress" }, 500);
  }
});

export default safety;
