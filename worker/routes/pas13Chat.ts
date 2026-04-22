// ────────────────────────────────────────────────────────────────────────────
// worker/routes/pas13Chat.ts
//
// PAS 13 Level-3 chat surface — a RAG-powered assistant over the PAS 13:2017
// standard text + the A-SAFE "16 steps to learn PAS 13" educational video
// playlist.
//
// Design:
//   1. Authentication: admitted users are any authenticated session. A-SAFE
//      Engage is a rep-only app — every authenticated account is by
//      definition a rep (admin or "customer"-role rep).
//   2. L2-first: if the user's question parses as a deterministic calc
//      scenario (mass + speed + angle), we route straight to
//      shared/pas13Rules.pas13Verdict() — no LLM call. Cheaper, exact,
//      always-cited.
//   3. RAG: for descriptive questions we embed the question with
//      text-embedding-3-small, pull top-k chunks from a bundled
//      pas13-embeddings.json (served via the Worker ASSETS binding / R2),
//      and synthesise an answer with gpt-4o-mini.
//   4. Citations are mandatory. If no chunks pass the relevance floor, the
//      handler returns the "please consult A-SAFE engineering" fallback.
//   5. Every answer includes the PAS13_INDICATIVE_FOOTNOTE verbatim.
// ────────────────────────────────────────────────────────────────────────────

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";
import {
  pas13Verdict,
  PAS13_INDICATIVE_FOOTNOTE,
} from "../../shared/pas13Rules";
import { pas13Cite } from "../../shared/pas13Citations";

const pas13Chat = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Types ────────────────────────────────────────────────────────────────
interface CorpusPdfChunk {
  id: string;
  text: string;
  source: "pdf";
  section: string;
  page: number;
  url: string;
  label: string;
  embedding: number[];
}

interface CorpusVideoChunk {
  id: string;
  text: string;
  source: "video";
  videoId: string;
  videoTitle: string;
  startSec: number;
  endSec: number;
  url: string;
  label: string;
  embedding: number[];
}

type CorpusChunk = CorpusPdfChunk | CorpusVideoChunk;

interface Corpus {
  _meta: {
    builtAt: string;
    model: string;
    pdfChunks: number;
    videoChunks: number;
    totalChunks: number;
  };
  chunks: CorpusChunk[];
}

interface ChatCitation {
  type: "pdf" | "video";
  section?: string;
  page?: number;
  videoId?: string;
  videoTitle?: string;
  startSec?: number;
  url: string;
  label: string;
}

// ─── Corpus loader (cached per-isolate) ───────────────────────────────────
//
// The embeddings JSON lives at /pas13-embeddings.json in the static
// assets bundle. On first call we pull it via the ASSETS binding, parse,
// and keep it warm in the module scope until the isolate is recycled.
let corpusCache: Corpus | null = null;
let corpusLoadingPromise: Promise<Corpus> | null = null;
let corpusLoadMs: number | null = null;

async function loadCorpus(env: Env): Promise<Corpus> {
  if (corpusCache) return corpusCache;
  if (corpusLoadingPromise) return corpusLoadingPromise;
  corpusLoadingPromise = (async () => {
    const t0 = Date.now();
    // Try R2 first (more scalable for 5–15 MB JSON), fall back to the
    // bundled asset.
    let raw: string | null = null;
    const bucket = env.R2_BUCKET;
    if (bucket) {
      try {
        const obj = await bucket.get("pas13/embeddings.json");
        if (obj) {
          raw = await obj.text();
        }
      } catch {
        // ignore and fall through to ASSETS
      }
    }
    if (!raw) {
      try {
        const res = await env.ASSETS.fetch(
          new Request("https://dummy/pas13-embeddings.json"),
        );
        if (res.ok) raw = await res.text();
      } catch {
        // ignore
      }
    }
    if (!raw) {
      throw new Error(
        "PAS 13 embeddings corpus not available: missing both R2 object pas13/embeddings.json and bundled /pas13-embeddings.json",
      );
    }
    const parsed = JSON.parse(raw) as Corpus;
    corpusCache = parsed;
    corpusLoadMs = Date.now() - t0;
    console.log(
      `[pas13Chat] corpus loaded in ${corpusLoadMs}ms (${parsed.chunks.length} chunks)`,
    );
    return parsed;
  })().catch((err) => {
    corpusLoadingPromise = null;
    throw err;
  });
  return corpusLoadingPromise;
}

// ─── Cosine similarity ────────────────────────────────────────────────────
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

async function embedQuery(
  env: Env,
  q: string,
): Promise<{ embedding: number[]; tokens: number }> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: q.slice(0, 8000),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `OpenAI embeddings ${res.status}: ${body.slice(0, 400)}`,
    );
  }
  const data = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
    usage: { total_tokens: number };
  };
  return {
    embedding: data.data[0].embedding,
    tokens: data.usage.total_tokens,
  };
}

// ─── L2 calc-question parser ──────────────────────────────────────────────
//
// Detects scenarios the deterministic engine in shared/pas13Rules.ts can
// answer exactly (KE-at-angle, deflection-zone, safety-margin verdict).
// Heuristics only — if any field is missing we return null and let RAG
// take over.
interface ParsedCalc {
  vehicleMassKg: number;
  speedKmh: number;
  approachAngleDeg: number;
  loadMassKg?: number;
  /** Product-rated joules at 45° if the user specified a product number. */
  productRatedJoulesAt45deg?: number;
  productImpactZoneMaxMm?: number;
}

function parseCalcQuestion(q: string): ParsedCalc | null {
  const text = q.toLowerCase();
  // Mass — look for "5 t", "5 tonne", "5000 kg", "5-tonne".
  let massKg: number | null = null;
  const mTonne = text.match(/(\d+(?:\.\d+)?)\s*(?:-\s*)?(?:t|tonne|tonnes|ton)\b/);
  if (mTonne) massKg = parseFloat(mTonne[1]) * 1000;
  const mKg = text.match(/(\d+(?:\.\d+)?)\s*kg\b/);
  if (!massKg && mKg) massKg = parseFloat(mKg[1]);
  // Speed — "8 km/h", "8 kmh", "5 mph" (ignore mph for now — PAS 13 is km/h)
  let speedKmh: number | null = null;
  const mKmh = text.match(
    /(\d+(?:\.\d+)?)\s*(?:km\/?h|kph|kilometres?\s+per\s+hour)/,
  );
  if (mKmh) speedKmh = parseFloat(mKmh[1]);
  // Angle — "45°", "45 deg", "22.5 degrees"
  let angleDeg: number | null = null;
  const mAngle = text.match(
    /(\d+(?:\.\d+)?)\s*(?:°|deg|degrees?|degree)/,
  );
  if (mAngle) angleDeg = parseFloat(mAngle[1]);
  // Need at least mass + speed to compute KE. Angle defaults to 45° per the
  // reporting convention. If the question asks about a generic "required
  // energy" or "joules" we still compute.
  const looksCalc =
    /\bjoule|\bkj\b|\benergy\b|\bke\b|\bkinetic\b|\brated\b|\brequired\b|\bimpact\b|\bforce\b|\bverdict\b|\baligned\b|\bmargin\b/.test(
      text,
    );
  if (!looksCalc) return null;
  if (massKg === null || speedKmh === null) return null;
  return {
    vehicleMassKg: massKg,
    speedKmh,
    approachAngleDeg: angleDeg ?? 45,
  };
}

function formatL2Answer(
  question: string,
  parsed: ParsedCalc,
): { answer: string; citations: ChatCitation[] } {
  const verdict = pas13Verdict({
    vehicleMassKg: parsed.vehicleMassKg,
    speedKmh: parsed.speedKmh,
    approachAngleDeg: parsed.approachAngleDeg,
    loadMassKg: parsed.loadMassKg,
    productRatedJoulesAt45deg: parsed.productRatedJoulesAt45deg ?? 0,
    productImpactZoneMaxMm: parsed.productImpactZoneMaxMm ?? 0,
  });
  const lines: string[] = [];
  lines.push(
    `For a ${(parsed.vehicleMassKg / 1000).toLocaleString()} t vehicle at ${parsed.speedKmh} km/h on a ${parsed.approachAngleDeg}° approach:`,
  );
  lines.push(
    `- Required absorbed energy at 45° (reporting convention): **${verdict.details.requiredJoulesAt45deg.toLocaleString()} J**.`,
  );
  lines.push(
    `- Energy transfer factor (sin²θ) at ${parsed.approachAngleDeg}°: ${(verdict.details.energyTransferFactor * 100).toFixed(1)}%.`,
  );
  if (parsed.productRatedJoulesAt45deg) {
    lines.push(
      `- Product rated: ${verdict.details.productRatedJoulesAt45deg.toLocaleString()} J at 45°.`,
    );
    lines.push(`- Verdict: **${verdict.summary}**`);
  } else {
    lines.push(
      `- Pair this with a product rating from the A-SAFE catalogue to get a PAS 13 alignment verdict.`,
    );
  }
  for (const n of verdict.notes) lines.push(`- ${n}`);
  for (const w of verdict.warnings) lines.push(`- ⚠ ${w}`);
  lines.push("");
  lines.push(`_${PAS13_INDICATIVE_FOOTNOTE}_`);
  const citations: ChatCitation[] = verdict.citations.map((c) => ({
    type: "pdf",
    section: c.section,
    page: c.page,
    url: c.url,
    label: c.shortLabel,
  }));
  return { answer: lines.join("\n"), citations };
}

// ─── Retrieval ────────────────────────────────────────────────────────────
function topKChunks(
  corpus: Corpus,
  queryEmbedding: number[],
  k: number,
): Array<{ chunk: CorpusChunk; score: number }> {
  const scored: Array<{ chunk: CorpusChunk; score: number }> = [];
  for (const c of corpus.chunks) {
    if (!c.embedding || c.embedding.length !== queryEmbedding.length) continue;
    const s = cosine(c.embedding, queryEmbedding);
    scored.push({ chunk: c, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

function chunkToCitation(c: CorpusChunk): ChatCitation {
  if (c.source === "pdf") {
    return {
      type: "pdf",
      section: c.section || undefined,
      page: c.page,
      url: c.url,
      label: c.label,
    };
  }
  return {
    type: "video",
    videoId: c.videoId,
    videoTitle: c.videoTitle,
    startSec: c.startSec,
    url: c.url,
    label: c.label,
  };
}

// ─── RAG answer synthesis ─────────────────────────────────────────────────
async function ragAnswer(
  env: Env,
  question: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  corpus: Corpus,
): Promise<{
  answer: string;
  citations: ChatCitation[];
  mode: "rag";
  usage: { inTokens: number; outTokens: number };
}> {
  const { embedding } = await embedQuery(env, question);
  const top = topKChunks(corpus, embedding, 8);

  // Relevance floor — if the best cosine is below ~0.15 we have nothing
  // meaningful.
  const FLOOR = 0.15;
  const retrieved = top.filter((t) => t.score >= FLOOR);
  if (retrieved.length === 0) {
    return {
      answer: [
        "I can't find this in PAS 13:2017 — please consult A-SAFE engineering.",
        "",
        `_${PAS13_INDICATIVE_FOOTNOTE}_`,
      ].join("\n"),
      citations: [],
      mode: "rag",
      usage: { inTokens: 0, outTokens: 0 },
    };
  }

  const contextBlocks = retrieved.map((r, i) => {
    const c = r.chunk;
    const header =
      c.source === "pdf"
        ? `[${i + 1}] ${c.label} (pdf)`
        : `[${i + 1}] ${c.label} (video)`;
    return `${header}\n${c.text}`;
  });

  const systemPrompt = [
    "You are a PAS 13:2017 assistant for A-SAFE sales representatives.",
    "Answer ONLY from the provided retrieved context. Never invent details.",
    "Wording rule (hard): use 'PAS 13 aligned' / 'borderline' / 'not aligned' —",
    "NEVER say 'compliant' or 'non-compliant'.",
    "Every answer MUST cite the specific context blocks it draws on, using the",
    "[N] numeric markers inline.",
    "If the context is inadequate, say: 'I can't find this in PAS 13:2017 —",
    "please consult A-SAFE engineering.'",
    `End every answer with: '${PAS13_INDICATIVE_FOOTNOTE}'`,
    "Keep answers under 200 words. Be precise — quote joule figures, mm dimensions,",
    "section numbers, angles verbatim from the context when referring to them.",
  ].join("\n");

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
  ];
  // Truncate history for cost control.
  const recent = history.slice(-6);
  for (const h of recent) {
    messages.push({ role: h.role, content: h.content });
  }
  messages.push({
    role: "user",
    content: [
      `Retrieved context:`,
      "",
      contextBlocks.join("\n\n---\n\n"),
      "",
      `Question: ${question}`,
    ].join("\n"),
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.1,
      max_tokens: 500,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `OpenAI chat ${res.status}: ${body.slice(0, 400)}`,
    );
  }
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };
  let answer = data.choices[0].message.content.trim();
  // Ensure the footnote is present once.
  if (!answer.includes(PAS13_INDICATIVE_FOOTNOTE)) {
    answer = `${answer}\n\n_${PAS13_INDICATIVE_FOOTNOTE}_`;
  }
  return {
    answer,
    citations: retrieved.map((r) => chunkToCitation(r.chunk)),
    mode: "rag",
    usage: {
      inTokens: data.usage.prompt_tokens,
      outTokens: data.usage.completion_tokens,
    },
  };
}

// ─── Rep gate ─────────────────────────────────────────────────────────────
// A-SAFE Engage is a rep-only app by design: every authenticated account is
// either a sales/engineering rep ("customer" role with a jobRole) or an
// admin. We admit any authenticated user whose account is in good standing.
// If the schema later grows an explicit "rep" role, narrow this check here.
async function requireRep(
  c: any,
): Promise<{ ok: true; userId: string } | { ok: false; reason: string }> {
  const session = c.get("user");
  if (!session) return { ok: false, reason: "not_authenticated" };
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const user = await storage.getUser(session.claims.sub);
  if (!user) return { ok: false, reason: "user_not_found" };
  // In Engage, every signed-up user is a rep. Only block hard "inactive"
  // accounts if the schema tracks that (best-effort cast).
  const isActive = (user as any).isActive !== false;
  if (!isActive) return { ok: false, reason: "inactive" };
  return { ok: true, userId: user.id };
}

// ─── Routes ───────────────────────────────────────────────────────────────

// GET /api/pas13/me — tiny flag the UI uses to decide whether to mount the
// "Ask PAS 13" button. Returns { isRep: boolean }.
pas13Chat.get("/pas13/me", authMiddleware, async (c) => {
  const gate = await requireRep(c);
  return c.json({ isRep: gate.ok });
});

// GET /api/pas13/health — checks the corpus is reachable from this isolate.
pas13Chat.get("/pas13/health", authMiddleware, async (c) => {
  const gate = await requireRep(c);
  if (!gate.ok) return c.json({ message: "Rep access required" }, 403);
  try {
    const corpus = await loadCorpus(c.env);
    return c.json({
      ok: true,
      totalChunks: corpus.chunks.length,
      pdfChunks: corpus._meta.pdfChunks,
      videoChunks: corpus._meta.videoChunks,
      builtAt: corpus._meta.builtAt,
      corpusLoadMs,
    });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});

// POST /api/pas13/chat — ask a question. Body: { question, history? }.
pas13Chat.post("/pas13/chat", authMiddleware, async (c) => {
  const gate = await requireRep(c);
  if (!gate.ok) return c.json({ message: "Rep access required" }, 403);

  let body: {
    question?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: "Invalid JSON body" }, 400);
  }
  const question = (body.question ?? "").trim();
  if (!question) return c.json({ message: "question is required" }, 400);
  if (question.length > 2000)
    return c.json({ message: "question too long (max 2000 chars)" }, 400);
  const history = Array.isArray(body.history)
    ? body.history.filter(
        (h) =>
          h &&
          typeof h.content === "string" &&
          (h.role === "user" || h.role === "assistant"),
      )
    : [];

  const t0 = Date.now();

  // L2 first.
  const parsed = parseCalcQuestion(question);
  if (parsed) {
    try {
      const { answer, citations } = formatL2Answer(question, parsed);
      return c.json({
        mode: "l2",
        answer,
        citations,
        latencyMs: Date.now() - t0,
      });
    } catch (err) {
      console.error("[pas13Chat] L2 error, falling back to RAG:", err);
    }
  }

  // RAG.
  try {
    const corpus = await loadCorpus(c.env);
    const result = await ragAnswer(c.env, question, history, corpus);
    return c.json({
      mode: "rag",
      answer: result.answer,
      citations: result.citations,
      usage: result.usage,
      latencyMs: Date.now() - t0,
      corpusLoadMs,
    });
  } catch (err: any) {
    console.error("[pas13Chat] RAG error:", err);
    // Graceful fallback — corpus unavailable or OpenAI unreachable.
    // Return the "consult A-SAFE engineering" line with no citations so
    // the UI still renders sensibly. We keep mode=rag so the client knows
    // it wasn't a deterministic answer.
    const fallback = [
      "I can't answer this from PAS 13:2017 right now — please consult A-SAFE engineering.",
      "",
      `_${PAS13_INDICATIVE_FOOTNOTE}_`,
    ].join("\n");
    return c.json({
      mode: "rag",
      answer: fallback,
      citations: [],
      latencyMs: Date.now() - t0,
      degraded: true,
      degradedReason: err?.message ?? String(err),
    });
  }
});

// POST /api/pas13/admin/embed-from-chunks — one-off endpoint that accepts the
// chunks-only JSON (output of SKIP_EMBED=1 npx tsx scripts/buildPas13Corpus.ts),
// embeds every chunk server-side using the production OPENAI_API_KEY, and
// stores the result at R2 pas13/embeddings.json. Auth: Bearer MIGRATION_TOKEN.
//
// This exists because embedding locally requires an OpenAI key with quota —
// the production worker's key is the source of truth, so we run the embed
// phase here instead of on the developer laptop.
pas13Chat.post("/pas13/admin/embed-from-chunks", async (c) => {
  const expected = c.env.MIGRATION_TOKEN;
  if (!expected) return c.json({ message: "MIGRATION_TOKEN not configured" }, 503);
  if ((c.req.header("authorization") || "") !== `Bearer ${expected}`) {
    return c.json({ message: "Forbidden" }, 403);
  }
  const bucket = c.env.R2_BUCKET;
  if (!bucket) return c.json({ message: "R2 not configured" }, 503);

  const raw = await c.req.text();
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    return c.json(
      { message: "invalid JSON", detail: err?.message ?? String(err) },
      400,
    );
  }
  if (!parsed || !Array.isArray(parsed.chunks)) {
    return c.json({ message: "invalid corpus shape" }, 400);
  }

  const EMBED_BATCH = 96;
  const model = "text-embedding-3-small";
  let totalTokens = 0;
  for (let i = 0; i < parsed.chunks.length; i += EMBED_BATCH) {
    const slice = parsed.chunks.slice(i, i + EMBED_BATCH);
    const pending = slice.filter(
      (c: any) => !Array.isArray(c.embedding) || c.embedding.length === 0,
    );
    if (pending.length === 0) continue;
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        input: pending.map((p: any) => p.text),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return c.json(
        {
          message: "embedding request failed",
          status: res.status,
          detail: body.slice(0, 400),
          completedSoFar: i,
        },
        502,
      );
    }
    const data = (await res.json()) as {
      data: Array<{ embedding: number[] }>;
      usage?: { total_tokens: number };
    };
    totalTokens += data.usage?.total_tokens ?? 0;
    for (let j = 0; j < pending.length; j++) {
      pending[j].embedding = data.data[j].embedding;
    }
  }

  parsed._meta = parsed._meta || {};
  parsed._meta.embeddingsIncluded = true;
  parsed._meta.model = model;
  parsed._meta.embeddedAt = new Date().toISOString();
  parsed._meta.totalEmbeddingTokens = totalTokens;
  parsed._meta.estimatedEmbedCostUSD =
    Math.round((totalTokens / 1_000_000) * 0.02 * 10000) / 10000;

  const body = JSON.stringify(parsed);
  await bucket.put("pas13/embeddings.json", body, {
    httpMetadata: { contentType: "application/json" },
  });
  corpusCache = null;
  corpusLoadingPromise = null;
  return c.json({
    ok: true,
    totalChunks: parsed.chunks.length,
    totalTokens,
    estimatedEmbedCostUSD: parsed._meta.estimatedEmbedCostUSD,
    size: body.length,
  });
});

// POST /api/pas13/admin/ingest — one-off admin endpoint to upload an already
// embedded corpus JSON to R2. Body is the raw JSON file. Auth:
// Authorization: Bearer $MIGRATION_TOKEN.
pas13Chat.post("/pas13/admin/ingest", async (c) => {
  const expected = c.env.MIGRATION_TOKEN;
  if (!expected) {
    return c.json({ message: "MIGRATION_TOKEN not configured" }, 503);
  }
  const got = c.req.header("authorization") || "";
  if (got !== `Bearer ${expected}`) {
    return c.json({ message: "Forbidden" }, 403);
  }
  const bucket = c.env.R2_BUCKET;
  if (!bucket) return c.json({ message: "R2 not configured" }, 503);
  const raw = await c.req.text();
  if (!raw.startsWith("{")) {
    return c.json({ message: "body must be the JSON corpus file" }, 400);
  }
  // Validate shape
  let meta: any;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.chunks)) {
      return c.json({ message: "invalid corpus shape" }, 400);
    }
    meta = parsed._meta;
  } catch (err: any) {
    return c.json(
      { message: "invalid JSON", detail: err?.message ?? String(err) },
      400,
    );
  }
  await bucket.put("pas13/embeddings.json", raw, {
    httpMetadata: { contentType: "application/json" },
  });
  // Blow the in-memory cache so the next chat call pulls fresh.
  corpusCache = null;
  corpusLoadingPromise = null;
  return c.json({
    ok: true,
    size: raw.length,
    meta,
  });
});

export default pas13Chat;
