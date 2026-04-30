// ────────────────────────────────────────────────────────────────────────────
// worker/routes/recommendBarriers.ts
//
// REST surface for shared/barrierRecommender.ts. Authenticated.
//
// POST /api/recommend-barriers
//   body: RecommendationInput (see shared/barrierRecommender.ts)
//   resp: { results: BarrierRecommendation[], cached: boolean,
//           productCoverage: { withSuitability, total } }
//
// 5-minute response cache keyed by a stable hash of the request body.
// Cache lives in-process on the isolate (Cloudflare workers cold-start
// frequently so this is genuinely per-instance — that's fine for a
// best-effort cache, and avoids the KV write cost on every recommendation
// request). On cache miss we recompute synchronously and store.
// ────────────────────────────────────────────────────────────────────────────

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";
import {
  recommendBarriers,
  recommendationCacheKey,
  type RecommendationInput,
  type RecommenderProduct,
} from "../../shared/barrierRecommender";

const recommendBarriersRouter = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

// In-isolate cache. Cloudflare workers may evict the isolate at any time
// — that's fine; a stale cache miss just recomputes. We bound the size
// to avoid memory bloat when input space is wide.
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
type CacheEntry = { value: unknown; expires: number };
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): unknown | null {
  const e = cache.get(key);
  if (!e) return null;
  if (e.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return e.value;
}

function cacheSet(key: string, value: unknown): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Drop the oldest entry (insertion order) — a cheap LRU-ish.
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

function isValidInput(body: unknown): body is RecommendationInput {
  if (!body || typeof body !== "object") return false;
  const b = body as RecommendationInput;
  if (!Array.isArray(b.vehicleTypes) || !Array.isArray(b.zones)) return false;
  if (!b.environment || typeof b.environment !== "object") return false;
  for (const v of b.vehicleTypes) {
    if (typeof v?.id !== "string") return false;
    if (typeof v.massKg !== "number" || !Number.isFinite(v.massKg)) return false;
    if (typeof v.speedKmh !== "number" || !Number.isFinite(v.speedKmh)) return false;
  }
  for (const z of b.zones) {
    if (typeof z?.name !== "string") return false;
    if (typeof z.areaApplicationType !== "string") return false;
    if (
      z.riskLevel !== "low" &&
      z.riskLevel !== "medium" &&
      z.riskLevel !== "high" &&
      z.riskLevel !== "critical"
    ) {
      return false;
    }
  }
  return true;
}

recommendBarriersRouter.post(
  "/recommend-barriers",
  authMiddleware,
  async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: "Invalid JSON body." }, 400);
    }
    if (!isValidInput(body)) {
      return c.json(
        {
          message:
            "Invalid input shape. Expected { vehicleTypes[], zones[], environment, budget? }.",
        },
        400,
      );
    }

    const input = body as RecommendationInput;

    // Cache key embeds only the recommendation-relevant inputs so
    // identical-input requests resolve from cache. Excludes the user
    // identity — recommendations are deterministic and rep-agnostic.
    const key = recommendationCacheKey(input);
    const cached = cacheGet(key);
    if (cached) {
      return c.json({ ...(cached as object), cached: true });
    }

    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    let products = await storage.getProducts();

    // Strip down to the engine's contract — keeps the response small and
    // pure (no DB-internal columns leaking into the recommender).
    const slim: RecommenderProduct[] = products.map((p: any) => ({
      id: p.id,
      name: p.name,
      category: p.category ?? null,
      impactRating: p.impactRating ?? null,
      pas13TestJoules: p.pas13TestJoules ?? null,
      price: p.price ?? null,
      basePricePerMeter: p.basePricePerMeter ?? null,
      pricingLogic: p.pricingLogic ?? null,
      isColdStorage: p.isColdStorage ?? null,
      suitabilityData: p.suitabilityData ?? null,
      productVariants: Array.isArray(p.productVariants)
        ? p.productVariants
        : Array.isArray(p.variants)
          ? p.variants
          : null,
      impactTestingData: p.impactTestingData ?? null,
    }));

    const results = recommendBarriers(input, slim);

    const productCoverage = {
      withSuitability: slim.filter((p) => !!p.suitabilityData).length,
      total: slim.length,
    };

    const payload = {
      results,
      productCoverage,
      cached: false,
    };

    cacheSet(key, payload);
    return c.json(payload);
  },
);

export default recommendBarriersRouter;
