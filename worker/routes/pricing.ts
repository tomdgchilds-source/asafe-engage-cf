import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";
import {
  getDiscountTier,
  getNextTierUnlock,
  DISCOUNT_TIERS,
  HARD_DISCOUNT_CEILING,
} from "../../shared/discountLimits";

const pricing = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/product-pricing - get all product pricing
pricing.get("/product-pricing", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const pricingData = await storage.getProductPricing();
    return c.json(pricingData);
  } catch (error) {
    console.error("Error fetching product pricing:", error);
    return c.json({ message: "Failed to fetch product pricing" }, 500);
  }
});

// POST /api/product-pricing/calculate - calculate price for a product
pricing.post("/product-pricing/calculate", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const { productName, quantity } = await c.req.json();
    const result = await storage.calculatePrice(productName, quantity);

    if (result.requiresQuote) {
      return c.json(
        { message: "No pricing available for this product. Please request a quote.", requiresQuote: true },
        400
      );
    }

    return c.json(result);
  } catch (error) {
    console.error("Error calculating price:", error);
    return c.json({ message: "Failed to calculate price" }, 500);
  }
});

// GET /api/discount-options - get all discount options
pricing.get("/discount-options", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const options = await storage.getDiscountOptions();
    return c.json(options);
  } catch (error) {
    console.error("Error fetching discount options:", error);
    return c.json({ message: "Failed to fetch discount options" }, 500);
  }
});

// GET /api/discount-limit?subtotal=<AED>
//
// Returns the applicable reciprocal-discount cap for an order of the given
// AED-equivalent subtotal. Centralised here so the client and the PDF
// generator can't drift from each other.
pricing.get("/discount-limit", async (c) => {
  try {
    const raw = c.req.query("subtotal") ?? "0";
    const subtotalAed = parseFloat(raw);
    const tier = getDiscountTier(subtotalAed);
    const nextUnlock = getNextTierUnlock(subtotalAed);

    return c.json({
      subtotalAed: Number.isFinite(subtotalAed) ? subtotalAed : 0,
      cap: tier.cap,
      tier: tier.label,
      rationale: tier.rationale,
      hardCeiling: HARD_DISCOUNT_CEILING,
      nextTier: nextUnlock
        ? {
            label: nextUnlock.nextTier.label,
            cap: nextUnlock.nextTier.cap,
            amountToNext: nextUnlock.amountToNext,
          }
        : null,
      allTiers: DISCOUNT_TIERS.map((t) => ({ min: t.min, cap: t.cap, label: t.label })),
    });
  } catch (error) {
    console.error("Error computing discount limit:", error);
    return c.json({ message: "Failed to compute discount limit" }, 500);
  }
});

// GET /api/user-discount-selections - get user discount selections
pricing.get("/user-discount-selections", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const selections = await storage.getUserDiscountSelections(userId);
    return c.json(selections);
  } catch (error) {
    console.error("Error fetching user discount selections:", error);
    return c.json({ message: "Failed to fetch discount selections" }, 500);
  }
});

// POST /api/user-discount-selections - save user discount selections
pricing.post("/user-discount-selections", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const { selections } = await c.req.json();
    if (!Array.isArray(selections)) {
      return c.json({ message: "Selections must be an array" }, 400);
    }

    const savedSelections = await storage.saveUserDiscountSelections(userId, selections);
    return c.json(savedSelections);
  } catch (error) {
    console.error("Error saving user discount selections:", error);
    return c.json({ message: "Failed to save discount selections" }, 500);
  }
});

// POST /api/linkedin-discount - save LinkedIn discount
pricing.post("/linkedin-discount", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const { companyUrl, followers, commitment, postUrl, proofUrls, status } = await c.req.json();

    if (!companyUrl || !followers || commitment === undefined) {
      return c.json({ message: "Company URL, followers, and commitment are required" }, 400);
    }

    const result = await storage.upsertLinkedInDiscount(userId, {
      companyUrl,
      followers: Number(followers),
      commitment,
      postUrl,
      proofUrls,
      status,
    });

    return c.json(result);
  } catch (error) {
    console.error("Error saving LinkedIn discount:", error);
    return c.json({ message: "Failed to save LinkedIn discount" }, 500);
  }
});

// GET /api/linkedin-discount - get user LinkedIn discount
pricing.get("/linkedin-discount", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const discount = await storage.getLinkedInDiscountForCart(userId);
    return c.json(discount || null);
  } catch (error) {
    console.error("Error fetching LinkedIn discount:", error);
    return c.json({ message: "Failed to fetch LinkedIn discount" }, 500);
  }
});

// POST /api/linkedin-discount/calculate - calculate LinkedIn discount
pricing.post("/linkedin-discount/calculate", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const { followers, subtotal } = await c.req.json();

    if (!followers || !subtotal) {
      return c.json({ message: "Followers and subtotal are required" }, 400);
    }

    const result = await storage.calculateLinkedInDiscount(Number(followers), Number(subtotal));
    return c.json(result);
  } catch (error) {
    console.error("Error calculating LinkedIn discount:", error);
    return c.json({ message: "Failed to calculate LinkedIn discount" }, 500);
  }
});

// POST /api/linkedin-discount/verify - verify LinkedIn discount
pricing.post("/linkedin-discount/verify", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const { selectionId, verifiedFollowers, status } = await c.req.json();

    if (!selectionId || !verifiedFollowers || !status) {
      return c.json({ message: "Selection ID, verified followers, and status are required" }, 400);
    }

    // Verify the selection belongs to the user
    const selection = await storage.getLinkedInDiscountForCart(userId);
    if (!selection || selection.id !== selectionId) {
      return c.json({ message: "Unauthorized access to discount selection" }, 403);
    }

    const result = await storage.verifyLinkedInDiscount(selectionId, Number(verifiedFollowers), status);
    return c.json(result);
  } catch (error) {
    console.error("Error verifying LinkedIn discount:", error);
    return c.json({ message: "Failed to verify LinkedIn discount" }, 500);
  }
});

// DELETE /api/linkedin-discount - remove LinkedIn discount
pricing.delete("/linkedin-discount", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;

    // Remove LinkedIn discount by unsetting it
    await storage.upsertLinkedInDiscount(userId, {
      companyUrl: "",
      followers: 0,
      commitment: false,
      status: "removed",
    });

    return c.json({ success: true, message: "LinkedIn discount removed" });
  } catch (error) {
    console.error("Error removing LinkedIn discount:", error);
    return c.json({ message: "Failed to remove LinkedIn discount" }, 500);
  }
});

// GET /api/service-care-options - get service care options
pricing.get("/service-care-options", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const options = await storage.getServiceCareOptions();
    return c.json(options);
  } catch (error) {
    console.error("Error fetching service care options:", error);
    return c.json({ message: "Failed to fetch service care options" }, 500);
  }
});

// GET /api/user-service-selection - get user service selection
pricing.get("/user-service-selection", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const selection = await storage.getUserServiceSelection(userId);
    return c.json(selection || null);
  } catch (error) {
    console.error("Error fetching user service selection:", error);
    return c.json({ message: "Failed to fetch service selection" }, 500);
  }
});

// POST /api/user-service-selection - save user service selection
pricing.post("/user-service-selection", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const { serviceOptionId } = await c.req.json();

    if (!serviceOptionId) {
      return c.json({ message: "Service option ID is required" }, 400);
    }

    const savedSelection = await storage.saveUserServiceSelection(userId, serviceOptionId);
    return c.json(savedSelection);
  } catch (error) {
    console.error("Error saving user service selection:", error);
    return c.json({ message: "Failed to save service selection" }, 500);
  }
});

export default pricing;
