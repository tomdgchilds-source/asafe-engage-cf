import { Hono } from "hono";
import type { Env, Variables } from "../types";

// Base-plate read APIs — driven by base_plates + base_plate_product_compatibility.
// Schema / ingest live in worker/index.ts (admin endpoints gated by MIGRATION_TOKEN).
// Clients:
//   - ProductBasePlatesPanel on the product detail page (per-product list)
//   - AddToCartModal's "Base plate option" selector (per-product list)
//   - Admin inventory tools (full list)
const basePlates = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/base-plates — returns every plate row. Ordered by sort_order then name.
basePlates.get("/base-plates", async (c) => {
  try {
    if (!c.env.DATABASE_URL) {
      return c.json({ message: "DATABASE_URL not configured" }, 500);
    }
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    // Tolerate the case where the admin schema endpoint hasn't been run yet
    // — return an empty list rather than 500 so the UI degrades cleanly.
    const tableExists = (await sqlClient`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'base_plates'
      ) AS exists
    `) as Array<{ exists: boolean }>;
    if (!tableExists[0]?.exists) {
      return c.json([]);
    }

    const rows = await sqlClient`
      SELECT id, code, name, description, bolt_size AS "boltSize",
             bolt_length_mm AS "boltLengthMm",
             plate_dimensions_mm AS "plateDimensionsMm",
             coating, fixing_type AS "fixingType",
             substrate_notes AS "substrateNotes",
             is_standard_stock AS "isStandardStock",
             sort_order AS "sortOrder"
      FROM base_plates
      ORDER BY sort_order ASC, name ASC
    `;
    return c.json(rows);
  } catch (error) {
    console.error("Error fetching base plates:", error);
    return c.json({ message: "Failed to fetch base plates" }, 500);
  }
});

// GET /api/products/:id/base-plates — plates compatible with a given product,
// joined through base_plate_product_compatibility. Returns the same shape as
// /api/base-plates so the UI can share one renderer.
basePlates.get("/products/:id/base-plates", async (c) => {
  try {
    const productId = c.req.param("id");
    if (!c.env.DATABASE_URL) {
      return c.json({ message: "DATABASE_URL not configured" }, 500);
    }
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    // Tolerate missing tables — same rationale as /api/base-plates.
    const tableExists = (await sqlClient`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'base_plate_product_compatibility'
      ) AS exists
    `) as Array<{ exists: boolean }>;
    if (!tableExists[0]?.exists) {
      return c.json([]);
    }

    const rows = await sqlClient`
      SELECT bp.id, bp.code, bp.name, bp.description,
             bp.bolt_size AS "boltSize",
             bp.bolt_length_mm AS "boltLengthMm",
             bp.plate_dimensions_mm AS "plateDimensionsMm",
             bp.coating,
             bp.fixing_type AS "fixingType",
             bp.substrate_notes AS "substrateNotes",
             bp.is_standard_stock AS "isStandardStock",
             bp.sort_order AS "sortOrder"
      FROM base_plate_product_compatibility c
      JOIN base_plates bp ON bp.id = c.base_plate_id
      WHERE c.product_id = ${productId}
      ORDER BY bp.sort_order ASC, bp.name ASC
    `;
    return c.json(rows);
  } catch (error) {
    console.error("Error fetching plates for product:", error);
    return c.json({ message: "Failed to fetch plates for product" }, 500);
  }
});

export default basePlates;
