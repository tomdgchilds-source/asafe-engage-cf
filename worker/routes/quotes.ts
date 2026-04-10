import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const quotes = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /api/quote-requests - create a new quote request
quotes.post("/quote-requests", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const user = await storage.getUser(userId);
    const {
      requestMethod,
      productInfo,
      cartItems,
      includeCart,
      contactPerson,
      contactEmail,
      company,
      phone,
      customOrderNumber,
      ...otherData
    } = await c.req.json();

    // Prepare the message content
    let message = `Order Form Request from ${contactPerson || user?.firstName + " " + user?.lastName}\n\n`;
    message += `Contact Information:\n`;
    message += `Name: ${contactPerson || user?.firstName + " " + user?.lastName}\n`;
    message += `Email: ${contactEmail || user?.email}\n`;
    message += `Phone: ${phone}\n`;
    message += `Company: ${company || user?.company || "Not specified"}\n\n`;

    message += `Project Details:\n`;
    message += `Location: ${otherData.projectLocation}\n`;
    message += `Timeline: ${otherData.timeline}\n`;
    message += `Application: ${otherData.specificApplication}\n`;
    if (otherData.additionalRequirements) {
      message += `Additional Requirements: ${otherData.additionalRequirements}\n`;
    }
    message += `\n`;

    // Collect product names for the array
    let productNames: string[] = [];

    // Add product or cart information
    if (productInfo) {
      message += `Product Request:\n`;
      message += `Product: ${productInfo.name}\n`;
      message += `Category: ${productInfo.category}\n`;
      message += `Impact Rating: ${productInfo.impactRating}J\n`;
      message += `Quantity: ${otherData.quantity}\n`;
      if (productInfo.price) {
        message += `Unit Price: AED ${Math.round(parseFloat(productInfo.price)).toLocaleString()}\n`;
      }
      productNames = [productInfo.name];
    } else if (includeCart && cartItems && cartItems.length > 0) {
      message += `Cart Items:\n`;
      let totalValue = 0;
      cartItems.forEach((item: any, index: number) => {
        message += `${index + 1}. ${item.productName}\n`;
        message += `   Quantity: ${item.quantity} ${item.pricingType === "per_meter" ? "meters" : "items"}\n`;
        message += `   Unit Price: AED ${Math.round(item.unitPrice).toLocaleString()}\n`;
        message += `   Total: AED ${Math.round(item.totalPrice).toLocaleString()}\n\n`;
        totalValue += item.totalPrice;
        productNames.push(item.productName);
      });
      message += `Cart Total: AED ${Math.round(totalValue).toLocaleString()}\n\n`;
    }

    // Ensure default product names if none collected
    if (productNames.length === 0) {
      productNames = ["General Inquiry"];
    }

    // Generate request number
    const requestNumber = `QR-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    // Create simplified quote request record
    const quoteRequest = await storage.createQuoteRequest({
      userId,
      productNames: productNames,
      contactMethod: requestMethod,
      email: contactEmail || user?.email,
      phoneNumber: phone,
      company: company || user?.company || "",
      customOrderNumber: customOrderNumber || null,
      message: message,
      status: "pending",
    });

    // If cart items exist, save them as quote request items for itemized display
    if (includeCart && cartItems && cartItems.length > 0) {
      for (const item of cartItems) {
        await storage.createQuoteRequestItem({
          quoteRequestId: quoteRequest.id,
          productName: item.productName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          totalPrice: item.totalPrice,
          pricingTier: item.pricingTier,
          pricingType: item.pricingType,
          notes: item.notes,
          requiresDelivery: item.requiresDelivery,
          deliveryAddress: item.deliveryAddress,
          deliveryLatitude: item.deliveryLatitude,
          deliveryLongitude: item.deliveryLongitude,
          requiresInstallation: item.requiresInstallation,
          columnLength: item.columnLength,
          columnWidth: item.columnWidth,
          sidesToProtect: item.sidesToProtect,
        });
      }
    }

    // TODO: Send email notifications via emailService
    // await emailService.sendQuoteRequestConfirmation(emailData);
    // await emailService.sendQuoteRequestToAdmin(emailData);

    // TODO: Send WhatsApp confirmation via whatsappService
    // await whatsappService.sendQuoteRequestConfirmation(emailData);

    return c.json(quoteRequest);
  } catch (error) {
    console.error("Error creating order form request:", error);
    return c.json({ message: "Failed to create order form request" }, 500);
  }
});

// GET /api/quote-requests - list user quote requests
quotes.get("/quote-requests", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const quoteRequests = await storage.getUserQuoteRequests(userId);
    return c.json(quoteRequests);
  } catch (error) {
    console.error("Error fetching order form requests:", error);
    return c.json({ message: "Failed to fetch order form requests" }, 500);
  }
});

// GET /api/quote-requests/stats - get quote request statistics
quotes.get("/quote-requests/stats", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const user = await storage.getUser(userId);

    if (user?.role === "admin") {
      // Admin can see all stats
      const stats = await storage.getQuoteRequestStats();
      return c.json(stats);
    } else {
      // Regular users see their own stats
      const userRequests = await storage.getUserQuoteRequests(userId);
      const stats = {
        total: userRequests.length,
        pending: userRequests.filter((r: any) => r.status === "pending").length,
        inProgress: userRequests.filter((r: any) => r.status === "in_progress").length,
        completed: userRequests.filter((r: any) => r.status === "completed").length,
      };
      return c.json(stats);
    }
  } catch (error) {
    console.error("Error fetching order form request stats:", error);
    return c.json({ message: "Failed to fetch order form request stats" }, 500);
  }
});

// GET /api/quote-requests/:id - get a specific quote request
quotes.get("/quote-requests/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const quoteRequestId = c.req.param("id");

    const quoteRequest = await storage.getQuoteRequest(quoteRequestId);
    if (!quoteRequest) {
      return c.json({ message: "Quote request not found" }, 404);
    }

    // Check if user owns this quote request
    if (quoteRequest.userId !== userId) {
      return c.json({ message: "Access denied" }, 403);
    }

    return c.json(quoteRequest);
  } catch (error) {
    console.error("Error fetching quote request:", error);
    return c.json({ message: "Failed to fetch quote request" }, 500);
  }
});

// GET /api/quote-requests/:id/items - get items for a quote request
quotes.get("/quote-requests/:id/items", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const id = c.req.param("id");
    const quoteRequestItems = await storage.getQuoteRequestItems(id);
    return c.json(quoteRequestItems);
  } catch (error) {
    console.error("Error fetching quote request items:", error);
    return c.json({ message: "Failed to fetch quote request items" }, 500);
  }
});

// DELETE /api/quote-requests/:id - delete a specific quote request
quotes.delete("/quote-requests/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const quoteRequestId = c.req.param("id");

    const quoteRequest = await storage.getQuoteRequest(quoteRequestId);
    if (!quoteRequest) {
      return c.json({ message: "Quote request not found" }, 404);
    }

    // Check if user owns this quote request
    if (quoteRequest.userId !== userId) {
      return c.json({ message: "Access denied" }, 403);
    }

    await storage.deleteQuoteRequest(quoteRequestId);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting quote request:", error);
    return c.json({ message: "Failed to delete quote request" }, 500);
  }
});

// DELETE /api/quote-requests - clear all quote requests for current user
quotes.delete("/quote-requests", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    await storage.clearUserQuoteRequests(userId);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error clearing quote requests:", error);
    return c.json({ message: "Failed to clear quote requests" }, 500);
  }
});

// GET /api/admin/quote-requests - admin: list all quote requests
quotes.get("/admin/quote-requests", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const user = await storage.getUser(c.get("user").claims.sub);
    if (user?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }

    const status = c.req.query("status");
    let quoteRequests;

    if (status && status !== "all") {
      quoteRequests = await storage.getQuoteRequestsByStatus(status);
    } else {
      quoteRequests = await storage.getAllQuoteRequests();
    }

    return c.json(quoteRequests);
  } catch (error) {
    console.error("Error fetching admin quote requests:", error);
    return c.json({ message: "Failed to fetch quote requests" }, 500);
  }
});

// PUT /api/admin/quote-requests/:id/status - admin: update quote request status
quotes.put("/admin/quote-requests/:id/status", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const user = await storage.getUser(c.get("user").claims.sub);
    if (user?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }

    const { status } = await c.req.json();
    const updatedRequest = await storage.updateQuoteRequestStatus(c.req.param("id"), status);
    return c.json(updatedRequest);
  } catch (error) {
    console.error("Error updating quote request status:", error);
    return c.json({ message: "Failed to update quote request status" }, 500);
  }
});

export default quotes;
