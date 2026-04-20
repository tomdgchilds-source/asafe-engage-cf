import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const chat = new Hono<{ Bindings: Env; Variables: Variables }>();

// ──────────────────────────────────────────────
// GET /api/chat/conversations
// ──────────────────────────────────────────────
chat.get("/chat/conversations", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const conversations = await storage.getChatConversations(userId);
    return c.json(conversations);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    return c.json({ message: "Failed to fetch conversations" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/chat/conversations
// ──────────────────────────────────────────────
chat.post("/chat/conversations", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const { title } = await c.req.json<{ title?: string }>();

    if (!title) {
      return c.json({ message: "Title is required" }, 400);
    }

    const conversation = await storage.createChatConversation({ userId, title });
    return c.json(conversation);
  } catch (error) {
    console.error("Error creating conversation:", error);
    return c.json({ message: "Failed to create conversation" }, 500);
  }
});

// ──────────────────────────────────────────────
// DELETE /api/chat/conversations/:id
// ──────────────────────────────────────────────
chat.delete("/chat/conversations/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const conversationId = c.req.param("id");

    await storage.deleteChatConversation(conversationId, userId);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    return c.json({ message: "Failed to delete conversation" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/chat/conversations/:id/messages
// ──────────────────────────────────────────────
chat.get("/chat/conversations/:id/messages", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const conversationId = c.req.param("id");

    const messages = await storage.getChatMessages(conversationId, userId);
    return c.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    return c.json({ message: "Failed to fetch messages" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/chat/conversations/:id/messages
// ──────────────────────────────────────────────
chat.post("/chat/conversations/:id/messages", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const conversationId = c.req.param("id");
    const { content, imageUrl } = await c.req.json<{ content?: string; imageUrl?: string }>();

    if (!content?.trim()) {
      return c.json({ message: "Message content is required" }, 400);
    }

    // Save user message
    await storage.createChatMessage({
      conversationId,
      role: "user",
      content: content.trim(),
      imageUrl: imageUrl || undefined,
    });

    // Get conversation history for context
    const messages = await storage.getChatMessages(conversationId, userId);

    // TODO: Port OpenAI streaming - use fetch to https://api.openai.com/v1/chat/completions
    const openaiMessages = messages.map((msg: any) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: openaiMessages,
      }),
    });

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${err}`);
    }

    const openaiData = (await openaiResponse.json()) as any;
    const aiContent = openaiData.choices?.[0]?.message?.content ?? "";

    // Save AI response
    await storage.createChatMessage({
      conversationId,
      role: "assistant",
      content: aiContent,
    });

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Error sending message:", error);
    const errorMessage = error?.message || "Failed to send message";
    return c.json({ message: errorMessage }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/chat/upload-image
// ──────────────────────────────────────────────
chat.post("/chat/upload-image", authMiddleware, async (c) => {
  try {
    const formData = await c.req.formData();
    const imageFile = formData.get("image") as File | null;

    if (!imageFile) {
      return c.json({ message: "No image file provided" }, 400);
    }

    const buffer = await imageFile.arrayBuffer();
    const base64Image = btoa(
      String.fromCharCode(...new Uint8Array(buffer)),
    );
    const dataUrl = `data:${imageFile.type};base64,${base64Image}`;

    return c.json({ imageUrl: dataUrl });
  } catch (error) {
    console.error("Error uploading image:", error);
    return c.json({ message: "Failed to upload image" }, 500);
  }
});

export default chat;
