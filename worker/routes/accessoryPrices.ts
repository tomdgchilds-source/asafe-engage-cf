/**
 * Accessory price list.
 *
 *   GET   /api/accessory-prices                 any signed-in user → { items: AccessoryPrice[] }
 *   PATCH /api/admin/accessory-prices/:code     admin → { item: AccessoryPrice }
 *
 * Rows live in `accessory_prices` (migration 2026-10-15-009), seeded from
 * shared/cartAccessories.ts ACCESSORY_CATALOGUE. Until the migration has
 * been applied the GET falls back to the catalogue itself (same shape,
 * `source: "catalogue"`) so the cart picker still renders.
 */
import { Hono, type Context } from "hono";
import { asc, eq } from "drizzle-orm";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { mutationRateLimit } from "../middleware/rateLimiter";
import { getDb } from "../db";
import { createStorage } from "../storage";
import { accessoryPrices, type AccessoryPriceRow } from "../../shared/schema";
import {
  ACCESSORY_CATALOGUE,
  ACCESSORY_GROUPS,
  ACCESSORY_UNITS,
  type AccessoryGroup,
  type AccessoryPrice,
  type AccessoryUnit,
} from "../../shared/cartAccessories";
import { round2 } from "../../shared/pricing";

const accessoryPricesRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

async function requireAdmin(c: AppContext): Promise<boolean> {
  const session = c.get("user");
  if (!session) return false;
  const storage = createStorage(getDb(c.env.DATABASE_URL));
  const user = await storage.getUser(session.claims.sub);
  return user?.role === "admin";
}

/** DB row (numeric → string) → API shape (numbers). */
export function toAccessoryPrice(row: AccessoryPriceRow): AccessoryPrice {
  const price = row.priceAed === null || row.priceAed === undefined ? null : Number(row.priceAed);
  const group = (ACCESSORY_GROUPS as string[]).includes(row.group) ? (row.group as AccessoryGroup) : "other";
  const unit = (ACCESSORY_UNITS as string[]).includes(row.unit) ? (row.unit as AccessoryUnit) : "each";
  return {
    code: row.code,
    label: row.label,
    group,
    unit,
    priceAed: price !== null && Number.isFinite(price) ? round2(price) : null,
    priceToConfirm: row.priceToConfirm !== false,
    appliesToFamilies: Array.isArray(row.appliesToFamilies) && row.appliesToFamilies.length ? row.appliesToFamilies : null,
    sku: row.sku ?? null,
    active: row.active !== false,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

/**
 * The live price list as a Map by code. Reads `accessory_prices`; when the
 * table is missing (migration pending) or the read fails, returns the
 * catalogue so pricing never silently drops to "unknown code".
 */
export async function loadAccessoryPriceList(
  db: ReturnType<typeof getDb>,
): Promise<{ byCode: Map<string, AccessoryPrice>; source: "db" | "catalogue" }> {
  try {
    const rows = await db.select().from(accessoryPrices).orderBy(asc(accessoryPrices.group), asc(accessoryPrices.label));
    if (rows.length > 0) {
      return { byCode: new Map(rows.map((r) => [r.code, toAccessoryPrice(r)])), source: "db" };
    }
  } catch (err) {
    console.warn("[accessory-prices] falling back to catalogue:", err instanceof Error ? err.message : err);
  }
  return { byCode: new Map(ACCESSORY_CATALOGUE.map((a) => [a.code, a])), source: "catalogue" };
}

/** Catalogue display order (group, then label) for a list of prices. */
function sortForDisplay(items: AccessoryPrice[]): AccessoryPrice[] {
  const groupRank = new Map(ACCESSORY_GROUPS.map((g, i) => [g, i]));
  return [...items].sort((a, b) => {
    const g = (groupRank.get(a.group) ?? 99) - (groupRank.get(b.group) ?? 99);
    return g !== 0 ? g : a.label.localeCompare(b.label);
  });
}

// GET /api/accessory-prices — every active row (admins also see inactive with ?all=1).
accessoryPricesRoute.get("/accessory-prices", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const { byCode, source } = await loadAccessoryPriceList(db);
    const includeInactive = c.req.query("all") === "1" && (await requireAdmin(c));
    const items = sortForDisplay([...byCode.values()].filter((a) => includeInactive || a.active));
    return c.json({ items, source });
  } catch (error) {
    console.error("Error fetching accessory prices:", error);
    return c.json({ message: "Failed to fetch accessory prices" }, 500);
  }
});

export interface AccessoryPricePatch {
  priceAed?: number | null;
  priceToConfirm?: boolean;
  active?: boolean;
  label?: string;
}

/** Validate the admin PATCH body. Returns the column updates or an error message. */
export function parseAccessoryPricePatch(body: unknown): { ok: true; updates: Partial<AccessoryPriceRow> } | { ok: false; message: string } {
  if (!body || typeof body !== "object") return { ok: false, message: "Body must be a JSON object" };
  const b = body as Record<string, unknown>;
  const updates: Partial<AccessoryPriceRow> = {};
  if ("priceAed" in b) {
    if (b.priceAed === null) {
      updates.priceAed = null;
      // An unpriced row is always "to confirm" unless the body says otherwise.
      if (!("priceToConfirm" in b)) updates.priceToConfirm = true;
    } else {
      const n = typeof b.priceAed === "string" ? parseFloat(b.priceAed) : (b.priceAed as number);
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return { ok: false, message: "priceAed must be a non-negative number or null" };
      updates.priceAed = round2(n).toFixed(2);
      if (!("priceToConfirm" in b)) updates.priceToConfirm = false;
    }
  }
  if ("priceToConfirm" in b) {
    if (typeof b.priceToConfirm !== "boolean") return { ok: false, message: "priceToConfirm must be a boolean" };
    updates.priceToConfirm = b.priceToConfirm;
  }
  if ("active" in b) {
    if (typeof b.active !== "boolean") return { ok: false, message: "active must be a boolean" };
    updates.active = b.active;
  }
  if ("label" in b) {
    const label = typeof b.label === "string" ? b.label.trim() : "";
    if (!label || label.length > 200) return { ok: false, message: "label must be 1–200 characters" };
    updates.label = label;
  }
  if (Object.keys(updates).length === 0) return { ok: false, message: "No fields to update" };
  return { ok: true, updates };
}

// PATCH /api/admin/accessory-prices/:code — admin edits price / flag / label / active.
accessoryPricesRoute.patch("/admin/accessory-prices/:code", authMiddleware, mutationRateLimit, async (c) => {
  try {
    if (!(await requireAdmin(c))) return c.json({ message: "Admin access required" }, 403);
    const code = c.req.param("code");
    const parsed = parseAccessoryPricePatch(await c.req.json().catch(() => null));
    if (!parsed.ok) return c.json({ message: parsed.message }, 400);
    const db = getDb(c.env.DATABASE_URL);
    const [row] = await db
      .update(accessoryPrices)
      .set({ ...parsed.updates, updatedAt: new Date() })
      .where(eq(accessoryPrices.code, code))
      .returning();
    if (!row) return c.json({ message: `Unknown accessory code: ${code}` }, 404);
    return c.json({ item: toAccessoryPrice(row) });
  } catch (error) {
    console.error("Error updating accessory price:", error);
    return c.json({ message: "Failed to update accessory price" }, 500);
  }
});

export default accessoryPricesRoute;
