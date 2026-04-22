/**
 * Installation Videos — read APIs.
 *
 * Backs the ProductInstallVideos panel on the product detail page + the
 * "Watch before site visit" panel on Installation Timeline. Ingest lives
 * in worker/index.ts under /api/admin/ingest-installation-videos
 * (MIGRATION_TOKEN-gated).
 *
 * Data model:
 *   - resources.resource_type = 'Installation Video'
 *   - resources.external_id    = YouTube video ID (dedupe key)
 *   - resources.file_url       = https://www.youtube.com/embed/<id>
 *   - resources.external_url   = https://youtu.be/<id>
 *   - resources.description    = playlist description + chapter lines
 *   - product_resources(product_id, resource_id) — m2m edges.
 *
 * Endpoints:
 *   GET /api/products/:id/install-videos — videos linked to one product.
 *   GET /api/installations/:id/install-videos — union of videos across
 *       every product on the install's underlying order's cart items.
 */
import { Hono } from "hono";
import type { Env, Variables } from "../types";

const installVideos = new Hono<{ Bindings: Env; Variables: Variables }>();

type VideoRow = {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  externalUrl: string | null;
  videoId: string | null;
  thumbnailUrl: string | null;
  category: string | null;
  createdAt: string | null;
};

// Renders a `resources` row into the client-side shape expected by
// ProductInstallVideos + InstallationTimeline. Keeps one source of truth
// for the videoId / embed URL / share URL split.
function mapRow(r: any): VideoRow {
  const videoId = r.external_id || r.externalId || extractVideoId(r.file_url || r.fileUrl);
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    fileUrl: r.file_url || r.fileUrl,
    externalUrl: r.external_url || r.externalUrl || (videoId ? `https://youtu.be/${videoId}` : null),
    videoId: videoId || null,
    thumbnailUrl: r.thumbnail_url || r.thumbnailUrl,
    category: r.category,
    createdAt: r.created_at || r.createdAt,
  };
}

// Pull `<id>` out of any of the three A-SAFE URL shapes stored on
// `resources.file_url`:  watch?v=  |  youtu.be/  |  /embed/
function extractVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m1 = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (m1) return m1[1];
  const m2 = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (m2) return m2[1];
  const m3 = url.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/);
  if (m3) return m3[1];
  return null;
}

// GET /api/products/:id/install-videos
// Returns every `Installation Video` resource linked via product_resources
// to this product. Accepts the same id format as the rest of the product
// API — URL-decoded before hitting the DB.
installVideos.get("/products/:id/install-videos", async (c) => {
  try {
    const productId = decodeURIComponent(c.req.param("id"));
    if (!c.env.DATABASE_URL) return c.json({ message: "DATABASE_URL not configured" }, 500);
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    // Defensive: product_resources / resources.external_id only exist after
    // sibling ingest endpoints have run. Feature-detect both so a fresh
    // DB returns [] instead of 500.
    const tableRows = (await sqlClient`
      SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'product_resources'
      ) AS exists
    `) as Array<{ exists: boolean }>;
    if (!tableRows[0]?.exists) return c.json([]);

    const colRows = (await sqlClient`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'resources' AND column_name = 'external_id'
    `) as Array<{ column_name: string }>;
    const hasExternalId = colRows.length > 0;

    const rows = hasExternalId
      ? ((await sqlClient`
          SELECT r.id, r.title, r.description, r.file_url, r.thumbnail_url,
                 r.category, r.created_at, r.external_id, r.external_url
          FROM product_resources pr
          JOIN resources r ON r.id = pr.resource_id
          WHERE pr.product_id = ${productId}
            AND r.resource_type = 'Installation Video'
            AND r.is_active = true
          ORDER BY r.title ASC
        `) as any[])
      : ((await sqlClient`
          SELECT r.id, r.title, r.description, r.file_url, r.thumbnail_url,
                 r.category, r.created_at
          FROM product_resources pr
          JOIN resources r ON r.id = pr.resource_id
          WHERE pr.product_id = ${productId}
            AND r.resource_type = 'Installation Video'
            AND r.is_active = true
          ORDER BY r.title ASC
        `) as any[]);
    return c.json(rows.map(mapRow));
  } catch (err) {
    console.error("install-videos (product) failed:", err);
    return c.json({ message: "Failed to fetch installation videos" }, 500);
  }
});

// GET /api/installations/:id/install-videos
// Returns the union of install-video resources for every product on the
// install's linked order's items[]. Powers the "Watch before site visit"
// panel on /installation-timeline. Items are jsonb on orders.items, one
// row per cart line with `productId` (and/or `productName` fallback).
installVideos.get("/installations/:id/install-videos", async (c) => {
  try {
    const installationId = decodeURIComponent(c.req.param("id"));
    if (!c.env.DATABASE_URL) return c.json({ message: "DATABASE_URL not configured" }, 500);
    const { neon } = await import("@neondatabase/serverless");
    const sqlClient = neon(c.env.DATABASE_URL);

    // Load the install and its linked order (if any).
    const installRows = (await sqlClient`
      SELECT id, order_id FROM installations WHERE id = ${installationId} LIMIT 1
    `) as Array<{ id: string; order_id: string | null }>;
    if (installRows.length === 0) return c.json({ message: "Installation not found" }, 404);
    const install = installRows[0];
    if (!install.order_id) return c.json([]);

    const orderRows = (await sqlClient`
      SELECT items FROM orders WHERE id = ${install.order_id} LIMIT 1
    `) as Array<{ items: any }>;
    const order = orderRows[0];
    if (!order || !Array.isArray(order.items)) return c.json([]);

    // items[] entries carry either `productId` (real UUID) or a family
    // slug — we resolve both when collecting. Empty cart ⇒ empty list.
    const productIds = new Set<string>();
    const productNames = new Set<string>();
    for (const it of order.items) {
      if (it?.productId && typeof it.productId === "string") {
        productIds.add(it.productId);
      }
      if (it?.productName && typeof it.productName === "string") {
        productNames.add(it.productName);
      }
      // Variant rows use `id` = `family-<slug>` from the products route; not
      // useful for product_resources lookups but kept here for future-proofing.
    }

    // Resolve productNames to product ids (best-effort, case-insensitive).
    if (productNames.size > 0) {
      const namesArr = Array.from(productNames);
      const nameRows = (await sqlClient`
        SELECT id FROM products WHERE lower(name) = ANY(${namesArr.map((n) => n.toLowerCase())})
      `) as Array<{ id: string }>;
      for (const r of nameRows) productIds.add(r.id);
    }

    if (productIds.size === 0) return c.json([]);

    // Feature-detect external_id col — pre-ingest DBs return an empty list
    // cleanly instead of 500-ing on a missing column.
    const colRows = (await sqlClient`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'resources' AND column_name = 'external_id'
    `) as Array<{ column_name: string }>;
    const hasExternalId = colRows.length > 0;

    const ids = Array.from(productIds);
    const rows = hasExternalId
      ? ((await sqlClient`
          SELECT DISTINCT r.id, r.title, r.description, r.file_url, r.thumbnail_url,
                 r.category, r.created_at, r.external_id, r.external_url
          FROM product_resources pr
          JOIN resources r ON r.id = pr.resource_id
          WHERE pr.product_id = ANY(${ids})
            AND r.resource_type = 'Installation Video'
            AND r.is_active = true
          ORDER BY r.title ASC
        `) as any[])
      : ((await sqlClient`
          SELECT DISTINCT r.id, r.title, r.description, r.file_url, r.thumbnail_url,
                 r.category, r.created_at
          FROM product_resources pr
          JOIN resources r ON r.id = pr.resource_id
          WHERE pr.product_id = ANY(${ids})
            AND r.resource_type = 'Installation Video'
            AND r.is_active = true
          ORDER BY r.title ASC
        `) as any[]);
    return c.json(rows.map(mapRow));
  } catch (err) {
    console.error("install-videos (installation) failed:", err);
    return c.json({ message: "Failed to fetch installation videos" }, 500);
  }
});

export default installVideos;
