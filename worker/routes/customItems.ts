/**
 * Per-rep library of custom line items (client-specific products,
 * accessories or services that are not on the price list).
 *
 *   GET    /api/custom-items        own items, most used first → { items }
 *   POST   /api/custom-items        save (or bump) an item      → { item }
 *   DELETE /api/custom-items/:id    own item only               → { success: true }
 *
 * POST /api/cart/custom with `saveToLibrary: true` calls the same
 * `upsertCustomLibraryItem` so the library never holds duplicates: a
 * second save with the same name (case-insensitive) refreshes the row and
 * bumps `useCount` instead of inserting again.
 */
import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { mutationRateLimit } from "../middleware/rateLimiter";
import { getDb } from "../db";
import { customItemsLibrary, type CustomItemsLibraryRow } from "../../shared/schema";
import { round2 } from "../../shared/pricing";

const customItems = new Hono<{ Bindings: Env; Variables: Variables }>();

export const CUSTOM_CATEGORIES = ["product", "accessory", "service", "other"] as const;
export type CustomCategory = (typeof CUSTOM_CATEGORIES)[number];

export const CUSTOM_PRICING_TYPES = ["standard_item", "linear_meter"] as const;
export type CustomPricingType = (typeof CUSTOM_PRICING_TYPES)[number];

export const PRICING_BASES = ["price_list", "rep_estimate", "estimation_team"] as const;
export type PricingBasis = (typeof PRICING_BASES)[number];

/** Validated fields shared by a library item and a custom cart line. */
export interface CustomItemFields {
  productName: string;
  description: string | null;
  customCategory: CustomCategory;
  pricingType: CustomPricingType;
  unitPrice: number;
  requiresDelivery: boolean;
  requiresInstallation: boolean;
  pricingBasis: PricingBasis;
}

/** API shape of a library row (numeric → number). */
export interface CustomLibraryItem {
  id: string;
  productName: string;
  description: string | null;
  customCategory: CustomCategory;
  pricingType: CustomPricingType;
  unitPriceAed: number;
  requiresDelivery: boolean;
  requiresInstallation: boolean;
  pricingBasis: PricingBasis;
  useCount: number;
  createdAt: string | null;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v);
}

/**
 * Validate the fields a custom item needs. `pricingBasis` defaults to
 * `rep_estimate` and the delivery / install flags to false; everything
 * else is required.
 */
export function parseCustomItemFields(body: unknown): { ok: true; value: CustomItemFields } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;
  const productName = typeof b.productName === "string" ? b.productName.trim() : "";
  if (!productName) return { ok: false, message: "productName is required" };
  if (productName.length > 200) return { ok: false, message: "productName must be 200 characters or fewer" };
  if (!oneOf(b.customCategory, CUSTOM_CATEGORIES)) return { ok: false, message: `customCategory must be one of ${CUSTOM_CATEGORIES.join(", ")}` };
  if (!oneOf(b.pricingType, CUSTOM_PRICING_TYPES)) return { ok: false, message: `pricingType must be one of ${CUSTOM_PRICING_TYPES.join(", ")}` };
  const unitPrice = num(b.unitPrice ?? b.unitPriceAed);
  if (unitPrice === null || unitPrice < 0) return { ok: false, message: "unitPrice must be a non-negative number (AED)" };
  const basisRaw = b.pricingBasis ?? "rep_estimate";
  if (!oneOf(basisRaw, PRICING_BASES)) return { ok: false, message: `pricingBasis must be one of ${PRICING_BASES.join(", ")}` };
  const description = typeof b.description === "string" && b.description.trim() ? b.description.trim().slice(0, 2000) : null;
  return {
    ok: true,
    value: {
      productName,
      description,
      customCategory: b.customCategory,
      pricingType: b.pricingType,
      unitPrice: round2(unitPrice),
      requiresDelivery: b.requiresDelivery === true,
      requiresInstallation: b.requiresInstallation === true,
      pricingBasis: basisRaw,
    },
  };
}

export function toCustomLibraryItem(row: CustomItemsLibraryRow): CustomLibraryItem {
  return {
    id: row.id,
    productName: row.productName,
    description: row.description ?? null,
    customCategory: oneOf(row.customCategory, CUSTOM_CATEGORIES) ? row.customCategory : "other",
    pricingType: oneOf(row.pricingType, CUSTOM_PRICING_TYPES) ? row.pricingType : "standard_item",
    unitPriceAed: round2(Number(row.unitPriceAed) || 0),
    requiresDelivery: row.requiresDelivery === true,
    requiresInstallation: row.requiresInstallation === true,
    pricingBasis: oneOf(row.pricingBasis, PRICING_BASES) ? row.pricingBasis : "rep_estimate",
    useCount: Number(row.useCount) || 0,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
  };
}

/**
 * Insert a library item, or refresh the rep's existing item of the same
 * name (case-insensitive) and bump its use count. Returns the API shape.
 */
export async function upsertCustomLibraryItem(
  db: ReturnType<typeof getDb>,
  userId: string,
  fields: CustomItemFields,
): Promise<CustomLibraryItem> {
  const existing = await db
    .select()
    .from(customItemsLibrary)
    .where(and(eq(customItemsLibrary.userId, userId), sql`lower(${customItemsLibrary.productName}) = lower(${fields.productName})`))
    .limit(1);
  const values = {
    productName: fields.productName,
    description: fields.description,
    customCategory: fields.customCategory,
    pricingType: fields.pricingType,
    unitPriceAed: fields.unitPrice.toFixed(2),
    requiresDelivery: fields.requiresDelivery,
    requiresInstallation: fields.requiresInstallation,
    pricingBasis: fields.pricingBasis,
  };
  if (existing[0]) {
    const [row] = await db
      .update(customItemsLibrary)
      .set({ ...values, useCount: sql`${customItemsLibrary.useCount} + 1` })
      .where(eq(customItemsLibrary.id, existing[0].id))
      .returning();
    return toCustomLibraryItem(row);
  }
  const [row] = await db
    .insert(customItemsLibrary)
    .values({ ...values, userId, useCount: 1 })
    .returning();
  return toCustomLibraryItem(row);
}

/** Bump `useCount` when a library item is re-used from the picker (best effort). */
export async function touchCustomLibraryItem(db: ReturnType<typeof getDb>, userId: string, id: string): Promise<void> {
  await db
    .update(customItemsLibrary)
    .set({ useCount: sql`${customItemsLibrary.useCount} + 1` })
    .where(and(eq(customItemsLibrary.id, id), eq(customItemsLibrary.userId, userId)));
}

// GET /api/custom-items — the rep's own library, most used first.
customItems.get("/custom-items", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const userId = c.get("user").claims.sub;
    const rows = await db
      .select()
      .from(customItemsLibrary)
      .where(eq(customItemsLibrary.userId, userId))
      .orderBy(desc(customItemsLibrary.useCount), desc(customItemsLibrary.createdAt));
    return c.json({ items: rows.map(toCustomLibraryItem) });
  } catch (error) {
    console.error("Error fetching custom items:", error);
    return c.json({ message: "Failed to fetch custom items" }, 500);
  }
});

// POST /api/custom-items — save a reusable custom item.
customItems.post("/custom-items", authMiddleware, mutationRateLimit, async (c) => {
  try {
    const parsed = parseCustomItemFields(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ message: parsed.message }, 400);
    const db = getDb(c.env.DATABASE_URL);
    const userId = c.get("user").claims.sub;
    const item = await upsertCustomLibraryItem(db, userId, parsed.value);
    return c.json({ item }, 201);
  } catch (error) {
    console.error("Error saving custom item:", error);
    return c.json({ message: "Failed to save custom item" }, 500);
  }
});

// DELETE /api/custom-items/:id — own items only.
customItems.delete("/custom-items/:id", authMiddleware, mutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const userId = c.get("user").claims.sub;
    const deleted = await db
      .delete(customItemsLibrary)
      .where(and(eq(customItemsLibrary.id, c.req.param("id")), eq(customItemsLibrary.userId, userId)))
      .returning({ id: customItemsLibrary.id });
    if (!deleted.length) return c.json({ message: "Custom item not found" }, 404);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting custom item:", error);
    return c.json({ message: "Failed to delete custom item" }, 500);
  }
});

export default customItems;
