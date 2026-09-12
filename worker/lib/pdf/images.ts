// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/images.ts
//
// Image acquisition and embedding for the document system.
//
//   fetchImageBytes(env, ref)  → bytes for `/api/objects/<key>` (R2 direct,
//                                 FILES_STORE KV fallback), the A-SAFE CDN
//                                 (https://webcdn.asafe.com/…) and data URLs.
//                                 Never throws; null on timeout / too large /
//                                 disallowed host.
//   fetchObjectBytes(env, key) → bytes for any stored object by its R2 / KV
//                                 key (e.g. a `layout-exports/…` vector PDF).
//                                 Same store path as above, no image
//                                 sniffing; never throws.
//   embedImage(doc, bytes)     → { image, width, height } for JPEG / PNG by
//                                 magic-byte sniffing; null for WebP / HEIC /
//                                 anything else so the caller can draw a
//                                 labelled placeholder.
// ────────────────────────────────────────────────────────────────────────────

import type { PDFImage } from "pdf-lib";
import type { Env } from "../../types";
import type { Doc } from "./doc";
import { decodeBase64 } from "./assets";

export interface FetchImageOptions {
  timeoutMs?: number;
  maxBytes?: number;
}

const DEFAULTS: Required<FetchImageOptions> = { timeoutMs: 6000, maxBytes: 4_000_000 };

/** Hosts we will fetch over HTTPS. */
const ALLOWED_HOSTS = new Set(["webcdn.asafe.com", "www.asafe.com", "asafe.com"]);

const OBJECTS_PREFIX = "/api/objects/";

export async function fetchImageBytes(
  env: Env,
  ref: string,
  opts: FetchImageOptions = {},
): Promise<Uint8Array | null> {
  const { timeoutMs, maxBytes } = { ...DEFAULTS, ...opts };
  if (!ref) return null;
  try {
    if (ref.startsWith("data:")) return dataUrlBytes(ref, maxBytes);

    // Same-origin object paths, absolute or relative.
    let objectKey: string | null = null;
    if (ref.startsWith(OBJECTS_PREFIX)) {
      objectKey = ref.slice(OBJECTS_PREFIX.length);
    } else if (/^https?:\/\//i.test(ref)) {
      const url = new URL(ref);
      if (url.pathname.startsWith(OBJECTS_PREFIX)) objectKey = url.pathname.slice(OBJECTS_PREFIX.length);
    }
    if (objectKey !== null) return storedObjectBytes(env, decodeURIComponent(objectKey), maxBytes);

    if (/^https:\/\//i.test(ref)) {
      const url = new URL(ref);
      if (!ALLOWED_HOSTS.has(url.hostname)) return null;
      return remoteBytes(url, timeoutMs, maxBytes);
    }
    return null;
  } catch {
    return null;
  }
}

/** Stored, non-image objects (vector PDF exports) are larger than photos. */
const OBJECT_MAX_BYTES = 25_000_000;

/**
 * Bytes of a stored object by key (R2 direct, FILES_STORE KV fallback).
 * Accepts a bare key or an `/api/objects/<key>` path. Null when missing,
 * over `maxBytes`, or on any store error.
 */
export async function fetchObjectBytes(
  env: Env,
  key: string,
  opts: Pick<FetchImageOptions, "maxBytes"> = {},
): Promise<Uint8Array | null> {
  const maxBytes = opts.maxBytes ?? OBJECT_MAX_BYTES;
  const bare = key.startsWith(OBJECTS_PREFIX) ? key.slice(OBJECTS_PREFIX.length) : key;
  if (!bare) return null;
  try {
    return await storedObjectBytes(env, decodeURIComponent(bare), maxBytes);
  } catch {
    return null;
  }
}

function dataUrlBytes(ref: string, maxBytes: number): Uint8Array | null {
  const comma = ref.indexOf(",");
  if (comma < 0) return null;
  const header = ref.slice(5, comma);
  const payload = ref.slice(comma + 1);
  if (!/;base64$/i.test(header)) return null;
  const bytes = decodeBase64(payload.replace(/\s/g, ""));
  return bytes.byteLength > maxBytes ? null : bytes;
}

async function storedObjectBytes(env: Env, key: string, maxBytes: number): Promise<Uint8Array | null> {
  const bucket = env.R2_BUCKET;
  if (bucket) {
    const object = await bucket.get(key);
    if (!object) return null;
    if (object.size > maxBytes) return null;
    const buf = await object.arrayBuffer();
    return new Uint8Array(buf);
  }
  const kv = env.FILES_STORE;
  if (!kv) return null;
  const raw = await kv.get(`file:${key}`);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as { data?: string };
  if (!parsed.data) return null;
  const bytes = decodeBase64(parsed.data);
  return bytes.byteLength > maxBytes ? null : bytes;
}

async function remoteBytes(url: URL, timeoutMs: number, maxBytes: number): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: "image/jpeg,image/png,image/*;q=0.8" },
    });
    if (!res.ok) return null;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) return null;
    return new Uint8Array(buf);
  } finally {
    clearTimeout(timer);
  }
}

export type ImageKind = "jpeg" | "png" | "webp" | "heic" | "gif" | "unknown";

/** Identify an image by its magic bytes. */
export function sniffImage(bytes: Uint8Array): ImageKind {
  if (bytes.length < 12) return "unknown";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "gif";
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (/^(heic|heix|hevc|hevx|mif1|msf1|avif)$/.test(brand)) return "heic";
  }
  return "unknown";
}

export interface EmbeddedImage {
  image: PDFImage;
  width: number;
  height: number;
}

/** Cheap content hash so the same photo is embedded once per document. */
function fnv1a(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `img:${bytes.length}:${h.toString(16)}`;
}

/**
 * Embed JPEG or PNG bytes. Returns null for any other format (WebP, HEIC,
 * GIF, garbage) — the caller draws a labelled grey placeholder instead.
 */
export async function embedImage(doc: Doc, bytes: Uint8Array): Promise<EmbeddedImage | null> {
  const kind = sniffImage(bytes);
  if (kind !== "jpeg" && kind !== "png") return null;
  const key = fnv1a(bytes);
  const cached = doc.images.get(key);
  if (cached) return { image: cached, width: cached.width, height: cached.height };
  try {
    const image = kind === "jpeg" ? await doc.pdf.embedJpg(bytes) : await doc.pdf.embedPng(bytes);
    doc.images.set(key, image);
    return { image, width: image.width, height: image.height };
  } catch {
    return null;
  }
}
