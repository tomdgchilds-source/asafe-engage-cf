/**
 * worker/services/pas13Classes.ts
 *
 * Worker-side loader for the PAS 13 vehicle classification table. Reads
 * `pas13_vehicle_classes` from Postgres and pushes the rows into
 * shared/pas13Rules.ts via setVehicleClassTableOverride() so server-side
 * classifyVehicle() / pas13Verdict() calls reflect admin edits.
 *
 * Caching strategy:
 *   - Per-isolate in-memory cache, keyed by an epoch stamp written to KV
 *     by POST /api/admin/pas13-vehicle-classes.
 *   - First call in a fresh isolate fetches and caches.
 *   - Subsequent calls cheaply check the KV epoch; refresh only if it has
 *     advanced past the cached version.
 *   - All errors are SOFT — the seed PAS13_VEHICLE_CLASS_TABLE in
 *     shared/pas13Rules.ts is the fallback, and a stale cache is preferred
 *     over a 500 on the user-facing path.
 */

import {
  setVehicleClassTableOverride,
  type VehicleClassRow,
} from "../../shared/pas13Rules";
import type { Env } from "../types";

const KV_EPOCH_KEY = "pas13:classes:epoch";
const KV_CACHE_KEY = "pas13:classes:rows";
// Per-isolate stamps. Initialised to 0 so the first call always loads.
// (globalThis is per-isolate on Cloudflare Workers — fine for our use.)
function isolateState(): {
  loadedEpoch: number;
  inflight: Promise<void> | null;
} {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  if (!g.__pas13ClassesState) {
    g.__pas13ClassesState = { loadedEpoch: 0, inflight: null };
  }
  return g.__pas13ClassesState as { loadedEpoch: number; inflight: Promise<void> | null };
}

/**
 * Convert a DB row (snake_case, NULL max for open-ended) into the
 * VehicleClassRow shape shared/pas13Rules.ts expects (Number.POSITIVE_INFINITY
 * for the open-ended max). We round speed to one decimal in case Postgres
 * persists a tiny FP wobble.
 */
function dbRowToRule(row: {
  class_code: string;
  mass_min_kg: number;
  mass_max_kg: number | null;
  speed_min_kmh: number;
  speed_max_kmh: number | null;
  description: string;
}): VehicleClassRow {
  return {
    classCode: row.class_code,
    label: row.description || row.class_code,
    totalMassMaxKg:
      row.mass_max_kg === null || row.mass_max_kg === undefined
        ? Number.POSITIVE_INFINITY
        : Number(row.mass_max_kg),
    speedMaxKmh:
      row.speed_max_kmh === null || row.speed_max_kmh === undefined
        ? Number.POSITIVE_INFINITY
        : Math.round(Number(row.speed_max_kmh) * 10) / 10,
  };
}

/** Row shape returned by GET /api/admin/pas13-vehicle-classes and
 *  GET /api/pas13/vehicle-classes (camelCase, NULL max = open-ended). */
export interface Pas13VehicleClassApiRow {
  id: string;
  classCode: string;
  massMinKg: number;
  massMaxKg: number | null;
  speedMinKmh: number;
  speedMaxKmh: number | null;
  description: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface Pas13VehicleClassListPayload {
  rows: Pas13VehicleClassApiRow[];
  bootstrapNeeded?: boolean;
  message?: string;
}

/**
 * Read-only list of the current pas13_vehicle_classes rows in the exact
 * payload shape the admin GET returns. No DDL, no writes. Throws on DB
 * error so callers can decide how to surface it; returns
 * `{ rows: [], bootstrapNeeded: true }` when the table has not been
 * created yet.
 */
export async function listPas13VehicleClasses(
  env: Env,
): Promise<Pas13VehicleClassListPayload> {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL not configured");
  const { neon } = await import("@neondatabase/serverless");
  const sqlClient = neon(env.DATABASE_URL);

  const tableExists = (await sqlClient`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = 'pas13_vehicle_classes'
    ) AS exists
  `) as Array<{ exists: boolean }>;
  if (!tableExists[0]?.exists) {
    return {
      rows: [],
      bootstrapNeeded: true,
      message:
        "pas13_vehicle_classes table not yet created — apply pending migrations at /admin/migrations first.",
    };
  }

  const rows = (await sqlClient`
    SELECT id, class_code, mass_min_kg, mass_max_kg,
           speed_min_kmh, speed_max_kmh, description,
           updated_at, updated_by
    FROM pas13_vehicle_classes
    ORDER BY mass_min_kg ASC, class_code ASC
  `) as Array<{
    id: string;
    class_code: string;
    mass_min_kg: number;
    mass_max_kg: number | null;
    speed_min_kmh: number;
    speed_max_kmh: number | null;
    description: string;
    updated_at: string | null;
    updated_by: string | null;
  }>;

  return {
    rows: rows.map((r) => ({
      id: r.id,
      classCode: r.class_code,
      massMinKg: r.mass_min_kg,
      massMaxKg: r.mass_max_kg,
      speedMinKmh: r.speed_min_kmh,
      speedMaxKmh: r.speed_max_kmh,
      description: r.description,
      updatedAt: r.updated_at,
      updatedBy: r.updated_by,
    })),
  };
}

async function fetchAndApply(env: Env): Promise<void> {
  if (!env.DATABASE_URL) return; // soft-fail: keep seed defaults
  const { neon } = await import("@neondatabase/serverless");
  const sqlClient = neon(env.DATABASE_URL);

  // Defensive: skip silently if the table doesn't exist yet (pre-migration).
  const exists = (await sqlClient`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = 'pas13_vehicle_classes'
    ) AS exists
  `) as Array<{ exists: boolean }>;
  if (!exists[0]?.exists) return;

  const rows = (await sqlClient`
    SELECT class_code, mass_min_kg, mass_max_kg,
           speed_min_kmh, speed_max_kmh, description
    FROM pas13_vehicle_classes
    ORDER BY mass_min_kg ASC
  `) as Array<{
    class_code: string;
    mass_min_kg: number;
    mass_max_kg: number | null;
    speed_min_kmh: number;
    speed_max_kmh: number | null;
    description: string;
  }>;

  if (rows.length === 0) return; // empty table → keep seed
  setVehicleClassTableOverride(rows.map(dbRowToRule));

  // Best-effort warm of the KV cache so other isolates that read it can
  // skip their own DB hit on first request.
  try {
    if (env.KV_SESSIONS) {
      await env.KV_SESSIONS.put(KV_CACHE_KEY, JSON.stringify(rows), {
        expirationTtl: 60 * 60 * 24, // 24h — refreshed on every admin edit
      });
    }
  } catch {
    // ignore — the in-memory override is enough for this isolate.
  }
}

/**
 * Ensure the active vehicle-class table reflects the latest admin edit.
 * Cheap on the hot path (string compare against KV); only goes to the DB
 * when the cached epoch is behind. Errors are swallowed (the seed table
 * remains active and the user gets a verdict using the defaults).
 *
 * Intended caller: any worker route that calls classifyVehicle() or
 * pas13Verdict() (e.g. /api/orders, /api/pas13-chat). Call once per
 * request before invoking the rule.
 */
export async function ensurePas13ClassesLoaded(env: Env): Promise<void> {
  const state = isolateState();

  // Inflight dedupe — multiple concurrent requests in the same isolate
  // should share a single DB hit.
  if (state.inflight) {
    try {
      await state.inflight;
    } catch {
      /* swallow */
    }
    return;
  }

  let kvEpoch = 0;
  try {
    if (env.KV_SESSIONS) {
      const raw = await env.KV_SESSIONS.get(KV_EPOCH_KEY);
      kvEpoch = raw ? Number(raw) || 0 : 0;
    }
  } catch {
    /* tolerate KV failures */
  }

  // First load (loadedEpoch === 0) always pulls. Otherwise only refresh
  // when KV is ahead of us — admin edits bump the KV stamp.
  if (state.loadedEpoch !== 0 && kvEpoch <= state.loadedEpoch) {
    return;
  }

  state.inflight = (async () => {
    try {
      await fetchAndApply(env);
      state.loadedEpoch = kvEpoch || Date.now();
    } catch (e) {
      console.warn(
        "ensurePas13ClassesLoaded: load failed, keeping cached/seed table:",
        (e as any)?.message,
      );
    } finally {
      state.inflight = null;
    }
  })();

  await state.inflight;
}
