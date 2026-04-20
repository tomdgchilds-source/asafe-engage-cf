import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";

const files = new Hono<{ Bindings: Env; Variables: Variables }>();

// ──────────────────────────────────────────────
// Storage abstraction: uses R2 if available, otherwise falls back to KV
// ──────────────────────────────────────────────
async function storeFile(
  env: Env,
  key: string,
  data: ArrayBuffer | ReadableStream,
  contentType: string
): Promise<void> {
  const bucket = env.R2_BUCKET;
  if (bucket) {
    await bucket.put(key, data, {
      httpMetadata: { contentType },
    });
    return;
  }

  // Fallback: store in KV as base64 with metadata
  const kv = env.FILES_STORE;
  if (!kv) {
    throw new Error("No file storage available (neither R2 nor FILES_STORE KV)");
  }

  let arrayBuf: ArrayBuffer;
  if (data instanceof ArrayBuffer) {
    arrayBuf = data;
  } else {
    // ReadableStream → ArrayBuffer
    const reader = (data as ReadableStream).getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    arrayBuf = merged.buffer;
  }

  // Convert to base64 for KV storage
  const bytes = new Uint8Array(arrayBuf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  // Store metadata + data together
  const payload = JSON.stringify({
    contentType,
    data: base64,
    size: bytes.length,
    uploadedAt: new Date().toISOString(),
  });

  // KV limit is 25MB per value — more than enough for photos
  await kv.put(`file:${key}`, payload);
}

async function getFile(
  env: Env,
  key: string
): Promise<{ body: ReadableStream | ArrayBuffer; contentType: string } | null> {
  // Try R2 first
  const bucket = env.R2_BUCKET;
  if (bucket) {
    const object = await bucket.get(key);
    if (!object) return null;
    return {
      body: object.body as ReadableStream,
      contentType: object.httpMetadata?.contentType || "application/octet-stream",
    };
  }

  // Fallback: KV
  const kv = env.FILES_STORE;
  if (!kv) return null;

  const raw = await kv.get(`file:${key}`);
  if (!raw) return null;

  try {
    const { contentType, data } = JSON.parse(raw);
    // Decode base64 → ArrayBuffer
    const binaryStr = atob(data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return {
      body: bytes.buffer,
      contentType: contentType || "application/octet-stream",
    };
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────
// POST /api/objects/upload — accepts multipart form data
// ──────────────────────────────────────────────
files.post("/objects/upload", authMiddleware, async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return c.json({ message: "No file provided" }, 400);
    }

    // Generate a unique key
    const ext = file.name.split(".").pop() || "bin";
    const key = `uploads/${crypto.randomUUID()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    await storeFile(c.env, key, arrayBuffer, file.type || "application/octet-stream");

    const accessPath = `/api/objects/${key}`;

    return c.json({
      uploadURL: accessPath,
      accessPath,
      uploadKey: key,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    return c.json({ message: "Failed to upload file" }, 500);
  }
});

// ──────────────────────────────────────────────
// PUT /api/objects/:path+ — direct file upload by key (used by Uppy S3 plugin)
// ──────────────────────────────────────────────
files.put("/objects/*", authMiddleware, async (c) => {
  try {
    const objectPath = c.req.path.replace(/^(\/api)?\/objects\//, "");
    if (!objectPath) {
      return c.json({ message: "Object path is required" }, 400);
    }

    const contentType = c.req.header("Content-Type") || "application/octet-stream";
    const body = await c.req.arrayBuffer();

    await storeFile(c.env, objectPath, body, contentType);

    // CRITICAL: The Uppy AwsS3 plugin client hangs forever if the PUT response
    // doesn't include an ETag header (see @uppy/aws-s3 ~line 371). Compute a
    // quick SHA-256 of the payload and return it as the ETag so Uppy's
    // "upload-success" event fires.
    const hashBuf = await crypto.subtle.digest("SHA-256", body);
    const hashHex = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const etag = `"${hashHex.slice(0, 32)}"`;

    // Uppy also reads these via XHR.getAllResponseHeaders(), which requires
    // Access-Control-Expose-Headers for cross-origin requests. Our app is
    // same-origin so browsers already expose all headers, but the header
    // is set anyway for correctness.
    c.header("ETag", etag);
    c.header("Access-Control-Expose-Headers", "ETag, Location");
    c.header("Location", `/api/objects/${objectPath}`);

    return c.json({ success: true, path: `/api/objects/${objectPath}`, etag });
  } catch (error) {
    console.error("Error uploading object:", error);
    return c.json({ message: "Failed to upload object" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /objects/:path - file download
// ──────────────────────────────────────────────
files.get("/objects/*", authMiddleware, async (c) => {
  try {
    const objectPath = c.req.path.replace(/^(\/api)?\/objects\//, "");

    if (!objectPath) {
      return c.json({ message: "Object path is required" }, 400);
    }

    const result = await getFile(c.env, objectPath);
    if (!result) {
      return c.json({ message: "Object not found" }, 404);
    }

    const headers = new Headers();
    headers.set("Content-Type", result.contentType);
    headers.set("Cache-Control", "public, max-age=3600");

    return new Response(result.body as any, { headers });
  } catch (error) {
    console.error("Error serving object:", error);
    return c.json({ message: "Failed to serve object" }, 500);
  }
});

// ──────────────────────────────────────────────
// PUT /api/site-references
// ──────────────────────────────────────────────
files.put("/site-references", authMiddleware, async (c) => {
  try {
    const { imageUrl, productName, caption, type } = await c.req.json<{
      imageUrl?: string;
      productName?: string;
      caption?: string;
      type?: string;
    }>();

    if (!imageUrl) {
      return c.json({ message: "Image URL is required" }, 400);
    }

    let objectPath = imageUrl;
    if (imageUrl.startsWith("https://")) {
      try {
        const url = new URL(imageUrl);
        const pathParts = url.pathname.split("/");
        if (pathParts.length > 2) {
          objectPath = `/objects/${pathParts.slice(2).join("/")}`;
        }
      } catch {
        // Keep the original path if URL parsing fails
      }
    }

    return c.json({ objectPath, caption, type });
  } catch (error) {
    console.error("Error setting site reference ACL:", error);
    return c.json({ message: "Failed to set image ACL" }, 500);
  }
});

// ──────────────────────────────────────────────
// PUT /api/operational-zone-images — process uploaded zone images
// ──────────────────────────────────────────────
files.put("/operational-zone-images", authMiddleware, async (c) => {
  try {
    const { imageURL } = await c.req.json<{ imageURL?: string }>();

    if (!imageURL) {
      return c.json({ message: "Image URL is required" }, 400);
    }

    let objectPath = imageURL;
    if (imageURL.startsWith("/api/objects/")) {
      objectPath = imageURL;
    } else if (imageURL.startsWith("/objects/")) {
      objectPath = `/api${imageURL}`;
    }

    return c.json({ objectPath });
  } catch (error) {
    console.error("Error processing zone image:", error);
    return c.json({ message: "Failed to process zone image" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/cart-reference-images/upload — proxy upload for cart reference images
// ──────────────────────────────────────────────
files.post("/cart-reference-images/upload", authMiddleware, async (c) => {
  try {
    const key = `uploads/${crypto.randomUUID()}`;
    const accessPath = `/api/objects/${key}`;

    return c.json({ uploadURL: accessPath, uploadKey: key, accessPath });
  } catch (error) {
    console.error("Error getting cart image upload URL:", error);
    return c.json({ message: "Failed to get upload URL" }, 500);
  }
});

// ──────────────────────────────────────────────
// PUT /api/cart-reference-images — finalize cart reference image
// ──────────────────────────────────────────────
files.put("/cart-reference-images", authMiddleware, async (c) => {
  try {
    const { imageUrl, fileName } = await c.req.json<{
      imageUrl?: string;
      fileName?: string;
    }>();

    if (!imageUrl) {
      return c.json({ message: "Image URL is required" }, 400);
    }

    let objectPath = imageUrl;
    if (imageUrl.startsWith("/api/objects/")) {
      objectPath = imageUrl;
    } else if (imageUrl.startsWith("/objects/")) {
      objectPath = `/api${imageUrl}`;
    }

    return c.json({ objectPath, fileName });
  } catch (error) {
    console.error("Error finalizing cart reference image:", error);
    return c.json({ message: "Failed to finalize image" }, 500);
  }
});

export default files;
