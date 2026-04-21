import { Hono } from "hono";
import { and, or, eq, ilike, inArray, desc } from "drizzle-orm";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";
import {
  projects,
  customerCompanies,
  orders,
  products,
  projectCollaborators,
} from "@shared/schema";

// ──────────────────────────────────────────────
// GET /api/search
//
// Cross-entity header search. Returns up to 20 hits per bucket.
// Entities are scoped to what the user is allowed to see:
//   - projects: owned + shared-with-me (via project_collaborators)
//   - customers: only the user's own (leak prevention on shared tenancy)
//   - orders:    only the user's own (legacy behaviour)
//   - products:  active rows only, name/category/subcategory matches
// ──────────────────────────────────────────────
const search = new Hono<{ Bindings: Env; Variables: Variables }>();

const PER_BUCKET_LIMIT = 20;
const EMPTY = {
  projects: [] as unknown[],
  customers: [] as unknown[],
  orders: [] as unknown[],
  products: [] as unknown[],
};

search.get("/search", authMiddleware, async (c) => {
  try {
    const rawQ = c.req.query("q") ?? "";
    const q = rawQ.trim();

    // Don't run expensive fan-out for empty / single-char queries —
    // matches too many rows and clobbers the debounce.
    if (q.length < 2) {
      return c.json(EMPTY);
    }

    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const pattern = `%${q}%`;

    // Fetch the IDs the user can see once, reuse for projects + orders scoping
    const projectIds = await storage.accessibleProjectIds(userId);

    // ── Projects: owned OR shared, name/location/description LIKE q
    const projectRows = projectIds.length
      ? await db
          .select({
            id: projects.id,
            userId: projects.userId,
            name: projects.name,
            status: projects.status,
            customerCompanyId: projects.customerCompanyId,
          })
          .from(projects)
          .where(
            and(
              inArray(projects.id, projectIds),
              or(
                ilike(projects.name, pattern),
                ilike(projects.location, pattern),
                ilike(projects.description, pattern),
              ),
            ),
          )
          .limit(PER_BUCKET_LIMIT)
      : [];

    // Pull in customer company names for the matched projects so the
    // dropdown row can show "Dnata Terminal 2 — Dnata" without a
    // second client round-trip.
    const customerIdsForProjects = Array.from(
      new Set(
        projectRows
          .map((p) => p.customerCompanyId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const projectCustomerMap = new Map<string, string>();
    if (customerIdsForProjects.length) {
      const cs = await db
        .select({ id: customerCompanies.id, name: customerCompanies.name })
        .from(customerCompanies)
        .where(inArray(customerCompanies.id, customerIdsForProjects));
      cs.forEach((row) => projectCustomerMap.set(row.id, row.name));
    }

    const projectsResult = projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      customerCompanyName: p.customerCompanyId
        ? projectCustomerMap.get(p.customerCompanyId) ?? null
        : null,
      isShared: p.userId !== userId,
      status: p.status ?? "active",
    }));

    // ── Customers: user-owned only (cross-rep leak prevention)
    const customerRows = await db
      .select({
        id: customerCompanies.id,
        name: customerCompanies.name,
        industry: customerCompanies.industry,
        city: customerCompanies.city,
        country: customerCompanies.country,
      })
      .from(customerCompanies)
      .where(
        and(
          eq(customerCompanies.userId, userId),
          or(
            ilike(customerCompanies.name, pattern),
            ilike(customerCompanies.industry, pattern),
            ilike(customerCompanies.city, pattern),
            ilike(customerCompanies.country, pattern),
          ),
        ),
      )
      .limit(PER_BUCKET_LIMIT);

    const customersResult = customerRows.map((ct) => ({
      id: ct.id,
      name: ct.name,
      industry: ct.industry ?? null,
      city: ct.city ?? null,
      country: ct.country ?? null,
    }));

    // ── Orders: user's own orders (legacy scoping)
    const orderRows = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customOrderNumber: orders.customOrderNumber,
        customerCompany: orders.customerCompany,
        totalAmount: orders.totalAmount,
        currency: orders.currency,
        status: orders.status,
      })
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          or(
            ilike(orders.orderNumber, pattern),
            ilike(orders.customOrderNumber, pattern),
            ilike(orders.customerCompany, pattern),
            ilike(orders.customerName, pattern),
            ilike(orders.projectName, pattern),
          ),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(PER_BUCKET_LIMIT);

    const ordersResult = orderRows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customOrderNumber: o.customOrderNumber ?? null,
      customerCompany: o.customerCompany ?? null,
      // Schema stores `totalAmount` (decimal-as-string); surface under
      // `grandTotal` to match the public search envelope contract.
      grandTotal: o.totalAmount,
      currency: o.currency,
      status: o.status,
    }));

    // ── Products: active catalog rows only; cap explicitly
    const productRows = await db
      .select({
        id: products.id,
        name: products.name,
        category: products.category,
        imageUrl: products.imageUrl,
        price: products.price,
        basePricePerMeter: products.basePricePerMeter,
      })
      .from(products)
      .where(
        and(
          eq(products.isActive, true),
          or(
            ilike(products.name, pattern),
            ilike(products.category, pattern),
            ilike(products.subcategory, pattern),
          ),
        ),
      )
      .limit(PER_BUCKET_LIMIT);

    const productsResult = productRows.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      imageUrl: p.imageUrl ?? null,
      price: p.price ?? null,
      basePricePerMeter: p.basePricePerMeter ?? null,
    }));

    return c.json({
      projects: projectsResult,
      customers: customersResult,
      orders: ordersResult,
      products: productsResult,
    });
  } catch (error) {
    console.error("Error running global search:", error);
    return c.json({ message: "Search failed" }, 500);
  }
});

export default search;
