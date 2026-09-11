// ─────────────────────────────────────────────────────────
// Survey Walk photo routes (Phase 3, Task S1).
//
//   POST   /api/site-surveys/:id/photos        upload + queue analysis
//   GET    /api/site-surveys/:id/photos        list (with objectUrl)
//   POST   /api/survey-photos/:photoId/reanalyse
//   PATCH  /api/survey-photos/:photoId         { zoneName?, areaId?, voiceNote? }
//   DELETE /api/survey-photos/:photoId
//
// Every route is authenticated and checks the parent survey belongs to
// the caller (same rule as siteSurveys.ts: survey.userId === user.sub).
// Analysis runs fire-and-forget via executionCtx.waitUntil so the upload
// returns immediately with analysis_status='pending'; the client polls GET.
// ─────────────────────────────────────────────────────────
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { heavyMutationRateLimit } from "../middleware/rateLimiter";
import { getDb, type Database } from "../db";
import { aiUsage, siteSurveys, siteSurveyAreas, surveyPhotos as surveyPhotosTable } from "@shared/schema";
import type { SurveyPhoto } from "@shared/schema";
import { putObject } from "./files";
import {
  analysePhoto,
  getVisionProvider,
  VisionParseError,
  type VisionCallUsage,
} from "../services/vision";

const surveyPhotos = new Hono<{ Bindings: Env; Variables: Variables }>();

// =============================================
// PURE HELPERS
// =============================================

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Decoded-bytes cap for one photo. Client downscales to ≤1280px so real uploads are ~200-500KB. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Normalise a client mime; anything unrecognised is treated as JPEG. */
export function normalisePhotoMime(mime: unknown): string {
  const m = typeof mime === "string" ? mime.toLowerCase().trim() : "";
  if (m === "image/jpg") return "image/jpeg";
  return m in MIME_EXTENSIONS ? m : "image/jpeg";
}

/** R2 key for a survey photo: `survey-photos/<surveyId>/<uuid>.<ext>`. */
export function photoObjectKey(
  surveyId: string,
  mime: string,
  uuid: string = crypto.randomUUID(),
): string {
  const ext = MIME_EXTENSIONS[normalisePhotoMime(mime)] ?? "jpg";
  return `survey-photos/${surveyId}/${uuid}.${ext}`;
}

/** Served URL for an object key (see worker/routes/files.ts GET /api/objects/*). */
export function objectUrlFor(key: string): string {
  return `/api/objects/${key}`;
}

export type SurveyPhotoView = SurveyPhoto & { objectUrl: string };

export function withObjectUrl(row: SurveyPhoto): SurveyPhotoView {
  return { ...row, objectUrl: objectUrlFor(row.objectKey) };
}

/** base64 (with or without a data: prefix) → bytes, using atob for the Workers runtime. */
export function decodeBase64Photo(input: string): Uint8Array | null {
  const payload = input.includes(",") && /^data:/i.test(input) ? input.slice(input.indexOf(",") + 1) : input;
  let binary: string;
  try {
    binary = atob(payload.replace(/\s/g, ""));
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// =============================================
// REQUEST BODY SCHEMAS
// =============================================

const optionalNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : typeof v === "string" ? Number(v) : v),
  z.number().finite().optional(),
);

const photoMetaSchema = z.object({
  mime: z.string().optional(),
  zoneName: z.string().max(200).optional(),
  facilityType: z.string().max(100).optional(),
  lat: optionalNumber,
  lng: optionalNumber,
  width: optionalNumber,
  height: optionalNumber,
  takenAt: z.string().datetime({ offset: true }).optional(),
});

const photoJsonSchema = photoMetaSchema.extend({
  bytesBase64: z.string().min(1),
});

const photoPatchSchema = z
  .object({
    zoneName: z.string().max(200).nullable().optional(),
    areaId: z.string().nullable().optional(),
    voiceNote: z.string().max(4000).nullable().optional(),
  })
  .strict();

type UploadInput = z.infer<typeof photoMetaSchema> & { bytes: Uint8Array };

/**
 * Accept either JSON `{ bytesBase64, mime, ... }` or multipart form data
 * with a `file` part plus the same metadata fields as strings.
 */
async function readUpload(
  c: { req: { header(name: string): string | undefined; json(): Promise<unknown>; parseBody(): Promise<Record<string, unknown>> } },
): Promise<{ ok: true; data: UploadInput } | { ok: false; message: string; status: 400 | 413 }> {
  const contentType = c.req.header("content-type") ?? "";
  let meta: z.infer<typeof photoMetaSchema>;
  let bytes: Uint8Array | null;

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.parseBody();
    const file = form.file ?? form.photo;
    if (!(file instanceof File)) {
      return { ok: false, message: "Multipart upload requires a `file` part", status: 400 };
    }
    const parsed = photoMetaSchema.safeParse({ ...form, file: undefined, photo: undefined, mime: form.mime ?? file.type });
    if (!parsed.success) return { ok: false, message: fromZodError(parsed.error).message, status: 400 };
    meta = parsed.data;
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return { ok: false, message: "Invalid JSON body", status: 400 };
    }
    const parsed = photoJsonSchema.safeParse(body);
    if (!parsed.success) return { ok: false, message: fromZodError(parsed.error).message, status: 400 };
    const { bytesBase64, ...rest } = parsed.data;
    meta = rest;
    bytes = decodeBase64Photo(bytesBase64);
    if (!bytes) return { ok: false, message: "bytesBase64 is not valid base64", status: 400 };
  }

  if (bytes.length === 0) return { ok: false, message: "Photo is empty", status: 400 };
  if (bytes.length > MAX_PHOTO_BYTES) {
    return { ok: false, message: `Photo exceeds ${MAX_PHOTO_BYTES} bytes`, status: 413 };
  }
  return { ok: true, data: { ...meta, bytes } };
}

// =============================================
// DB HELPERS
// =============================================

async function loadOwnedSurvey(db: Database, surveyId: string, userId: string) {
  const [survey] = await db
    .select({ id: siteSurveys.id, userId: siteSurveys.userId, facilityName: siteSurveys.facilityName })
    .from(siteSurveys)
    .where(eq(siteSurveys.id, surveyId));
  if (!survey || survey.userId !== userId) return null;
  return survey;
}

async function loadOwnedPhoto(db: Database, photoId: string, userId: string) {
  const [row] = await db
    .select({ photo: surveyPhotosTable, ownerId: siteSurveys.userId })
    .from(surveyPhotosTable)
    .innerJoin(siteSurveys, eq(siteSurveys.id, surveyPhotosTable.siteSurveyId))
    .where(eq(surveyPhotosTable.id, photoId));
  if (!row || row.ownerId !== userId) return null;
  return row.photo;
}

/** Read an object back (R2 first, FILES_STORE KV fallback — mirrors files.ts getFile). */
async function readObjectBytes(env: Env, key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (env.R2_BUCKET) {
    const object = await env.R2_BUCKET.get(key);
    if (!object) return null;
    return {
      bytes: new Uint8Array(await object.arrayBuffer()),
      contentType: object.httpMetadata?.contentType || "image/jpeg",
    };
  }
  const kv = env.FILES_STORE;
  if (!kv) return null;
  const raw = await kv.get(`file:${key}`);
  if (!raw) return null;
  try {
    const { contentType, data } = JSON.parse(raw) as { contentType?: string; data: string };
    const bytes = decodeBase64Photo(data);
    if (!bytes) return null;
    return { bytes, contentType: contentType || "image/jpeg" };
  } catch {
    return null;
  }
}

/** Persist one ai_usage row. Never throws — a logging failure must not fail the analysis. */
async function recordUsage(db: Database, surveyId: string, u: VisionCallUsage): Promise<void> {
  try {
    await db.insert(aiUsage).values({
      kind: u.kind,
      model: u.model,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      costUsdEst: u.costUsdEst.toFixed(6),
      surveyId,
    });
  } catch (err) {
    console.error("[survey-photos] failed to record ai_usage:", err);
  }
}

/**
 * Run vision analysis for one stored photo and write the result back to
 * its row (`done` with analysis + model, or `failed`). Designed to run
 * inside executionCtx.waitUntil — it swallows and logs every error.
 */
export async function analyseAndStore(
  env: Env,
  photoId: string,
  opts: { surveyId: string; objectKey: string; mime: string; zoneName?: string | null; facilityType?: string | null; bytes?: Uint8Array },
): Promise<void> {
  const db = getDb(env.DATABASE_URL);
  try {
    let bytes = opts.bytes;
    let mime = opts.mime;
    if (!bytes) {
      const stored = await readObjectBytes(env, opts.objectKey);
      if (!stored) throw new Error(`object not found: ${opts.objectKey}`);
      bytes = stored.bytes;
      mime = stored.contentType;
    }
    const { observation, model } = await analysePhoto(env, bytes, mime, {
      zoneName: opts.zoneName ?? undefined,
      facilityType: opts.facilityType ?? undefined,
      onUsage: (u) => recordUsage(db, opts.surveyId, u),
    });
    await db
      .update(surveyPhotosTable)
      .set({ analysis: observation, analysisStatus: "done", analysisModel: model })
      .where(eq(surveyPhotosTable.id, photoId));
  } catch (err) {
    const reason = err instanceof VisionParseError ? "parse" : "error";
    console.error(`[survey-photos] analysis failed (${reason}) for photo ${photoId}:`, err);
    try {
      await db
        .update(surveyPhotosTable)
        .set({ analysisStatus: "failed" })
        .where(eq(surveyPhotosTable.id, photoId));
    } catch (updateErr) {
      console.error("[survey-photos] failed to mark photo failed:", updateErr);
    }
  }
}

// =============================================
// ROUTES
// =============================================

surveyPhotos.use("/site-surveys/:id/photos", authMiddleware);
surveyPhotos.use("/survey-photos/*", authMiddleware);

// POST /api/site-surveys/:id/photos — upload, insert pending row, queue analysis.
surveyPhotos.post("/site-surveys/:id/photos", heavyMutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const userId = c.get("user").claims.sub;
    const surveyId = c.req.param("id");
    const survey = await loadOwnedSurvey(db, surveyId, userId);
    if (!survey) return c.json({ error: "Site survey not found" }, 404);

    const upload = await readUpload(c);
    if (!upload.ok) return c.json({ message: upload.message }, upload.status);
    const { bytes, ...meta } = upload.data;
    const mime = normalisePhotoMime(meta.mime);

    const objectKey = photoObjectKey(surveyId, mime);
    await putObject(c.env, objectKey, bytes, mime);

    const providerAvailable = getVisionProvider(c.env) !== null;
    const [row] = await db
      .insert(surveyPhotosTable)
      .values({
        siteSurveyId: surveyId,
        zoneName: meta.zoneName ?? null,
        objectKey,
        width: meta.width !== undefined ? Math.round(meta.width) : null,
        height: meta.height !== undefined ? Math.round(meta.height) : null,
        takenAt: meta.takenAt ? new Date(meta.takenAt) : new Date(),
        lat: meta.lat ?? null,
        lng: meta.lng ?? null,
        analysisStatus: providerAvailable ? "pending" : "skipped",
      })
      .returning();

    if (providerAvailable) {
      try {
        c.executionCtx.waitUntil(
          analyseAndStore(c.env, row.id, {
            surveyId,
            objectKey,
            mime,
            zoneName: meta.zoneName,
            facilityType: meta.facilityType,
            bytes,
          }),
        );
      } catch (err) {
        // No execution context (e.g. unit tests) — run detached instead.
        console.warn("[survey-photos] waitUntil unavailable, running analysis detached:", err);
        void analyseAndStore(c.env, row.id, { surveyId, objectKey, mime, zoneName: meta.zoneName, facilityType: meta.facilityType, bytes });
      }
    }

    return c.json(withObjectUrl(row), 201);
  } catch (error) {
    console.error("Error uploading survey photo:", error);
    return c.json({ message: "Failed to upload survey photo" }, 500);
  }
});

// GET /api/site-surveys/:id/photos — all photos for a survey, newest first.
surveyPhotos.get("/site-surveys/:id/photos", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const userId = c.get("user").claims.sub;
    const surveyId = c.req.param("id");
    const survey = await loadOwnedSurvey(db, surveyId, userId);
    if (!survey) return c.json({ error: "Site survey not found" }, 404);

    const rows = await db
      .select()
      .from(surveyPhotosTable)
      .where(eq(surveyPhotosTable.siteSurveyId, surveyId))
      .orderBy(desc(surveyPhotosTable.createdAt));
    return c.json(rows.map(withObjectUrl));
  } catch (error) {
    console.error("Error listing survey photos:", error);
    return c.json({ message: "Failed to list survey photos" }, 500);
  }
});

// POST /api/survey-photos/:photoId/reanalyse — re-run vision analysis.
surveyPhotos.post("/survey-photos/:photoId/reanalyse", heavyMutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const userId = c.get("user").claims.sub;
    const photo = await loadOwnedPhoto(db, c.req.param("photoId"), userId);
    if (!photo) return c.json({ error: "Photo not found" }, 404);

    if (!getVisionProvider(c.env)) {
      const [row] = await db
        .update(surveyPhotosTable)
        .set({ analysisStatus: "skipped" })
        .where(eq(surveyPhotosTable.id, photo.id))
        .returning();
      return c.json(withObjectUrl(row));
    }

    const [row] = await db
      .update(surveyPhotosTable)
      .set({ analysisStatus: "pending" })
      .where(eq(surveyPhotosTable.id, photo.id))
      .returning();

    const job = analyseAndStore(c.env, photo.id, {
      surveyId: photo.siteSurveyId,
      objectKey: photo.objectKey,
      mime: normalisePhotoMime(photo.objectKey.endsWith(".png") ? "image/png" : photo.objectKey.endsWith(".webp") ? "image/webp" : "image/jpeg"),
      zoneName: photo.zoneName,
    });
    try {
      c.executionCtx.waitUntil(job);
    } catch {
      void job;
    }
    return c.json(withObjectUrl(row), 202);
  } catch (error) {
    console.error("Error re-analysing survey photo:", error);
    return c.json({ message: "Failed to re-analyse survey photo" }, 500);
  }
});

// PATCH /api/survey-photos/:photoId — { zoneName?, areaId?, voiceNote? }
surveyPhotos.patch("/survey-photos/:photoId", heavyMutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const userId = c.get("user").claims.sub;
    const photo = await loadOwnedPhoto(db, c.req.param("photoId"), userId);
    if (!photo) return c.json({ error: "Photo not found" }, 404);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ message: "Invalid JSON body" }, 400);
    }
    const parsed = photoPatchSchema.safeParse(body);
    if (!parsed.success) return c.json({ message: fromZodError(parsed.error).message }, 400);
    const patch = parsed.data;
    if (Object.keys(patch).length === 0) return c.json({ message: "No fields to update" }, 400);

    // An areaId must belong to the same survey — never let a photo be
    // attached to another user's area.
    if (patch.areaId) {
      const [area] = await db
        .select({ id: siteSurveyAreas.id })
        .from(siteSurveyAreas)
        .where(and(eq(siteSurveyAreas.id, patch.areaId), eq(siteSurveyAreas.siteSurveyId, photo.siteSurveyId)));
      if (!area) return c.json({ message: "areaId does not belong to this survey" }, 400);
    }

    const [row] = await db
      .update(surveyPhotosTable)
      .set(patch)
      .where(eq(surveyPhotosTable.id, photo.id))
      .returning();
    return c.json(withObjectUrl(row));
  } catch (error) {
    console.error("Error updating survey photo:", error);
    return c.json({ message: "Failed to update survey photo" }, 500);
  }
});

// DELETE /api/survey-photos/:photoId — remove row and best-effort delete the object.
surveyPhotos.delete("/survey-photos/:photoId", heavyMutationRateLimit, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const userId = c.get("user").claims.sub;
    const photo = await loadOwnedPhoto(db, c.req.param("photoId"), userId);
    if (!photo) return c.json({ error: "Photo not found" }, 404);

    await db.delete(surveyPhotosTable).where(eq(surveyPhotosTable.id, photo.id));

    const cleanup = (async () => {
      try {
        if (c.env.R2_BUCKET) await c.env.R2_BUCKET.delete(photo.objectKey);
        else if (c.env.FILES_STORE) await c.env.FILES_STORE.delete(`file:${photo.objectKey}`);
      } catch (err) {
        console.warn("[survey-photos] object cleanup failed:", photo.objectKey, err);
      }
    })();
    try {
      c.executionCtx.waitUntil(cleanup);
    } catch {
      void cleanup;
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting survey photo:", error);
    return c.json({ message: "Failed to delete survey photo" }, 500);
  }
});

export default surveyPhotos;
