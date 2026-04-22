// ────────────────────────────────────────────────────────────────────────────
// scripts/buildPas13Corpus.ts
//
// PAS 13 Level-3 corpus builder. Combines:
//   1. The PAS 13:2017 PDF text (chunked by ~500 tokens, 50-token overlap),
//      tagged with section+page from scripts/data/pas13-structure.json.
//   2. Every video in the A-SAFE "16 steps to learn PAS 13" playlist, via
//      yt-dlp auto-captions (VTT) chunked by rolling-window timestamps.
//
// Output: scripts/data/pas13-embeddings.json — a single flat JSON file with
// { chunks: [{ id, text, source, embedding, …metadata }], _meta }.
//
// Idempotent: a manifest-sidecar keyed by chunk-text sha256 is used to skip
// chunks already embedded in a previous run.
//
// Usage:
//   npx tsx scripts/buildPas13Corpus.ts
//
// Env: OPENAI_API_KEY must be set (read from ~/.wrangler local secrets or
// from shell export). Model: text-embedding-3-small.
// ────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "data");
const OUT_PATH = resolve(DATA_DIR, "pas13-embeddings.json");

const PDF_PATH =
  process.env.PAS13_PDF_PATH ||
  "/Users/thomaschilds/Downloads/British Standard - PAS_13_Code of Practice - PDF_.pdf";

const PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL0sD7WA0DgAPFKBTUeHfMIIWYI0z6KEXn";

const YT_DLP =
  process.env.YT_DLP_BIN ||
  "/Users/thomaschilds/Library/Python/3.14/bin/yt-dlp";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// SKIP_EMBED=1 builds the chunks file only (no embeddings) — useful when the
// local OPENAI_API_KEY is out of quota or absent. The production worker's
// /api/pas13/admin/embed-from-chunks endpoint can finish the embedding phase
// server-side using the key bound in wrangler secrets.
const SKIP_EMBED = process.env.SKIP_EMBED === "1";
if (!SKIP_EMBED && !OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY not set (pass SKIP_EMBED=1 to build chunks only)");
  process.exit(1);
}

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_BATCH = 64;

interface PdfChunk {
  id: string;
  text: string;
  source: "pdf";
  section: string; // best-effort section id from TOC
  page: number;
  url: string;
  label: string;
}

interface VideoChunk {
  id: string;
  text: string;
  source: "video";
  videoId: string;
  videoTitle: string;
  startSec: number;
  endSec: number;
  url: string;
  label: string;
}

type CorpusChunk = (PdfChunk | VideoChunk) & {
  embedding?: number[];
};

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 20);
}

// ─── Approx-token helpers (≈4 chars per token; good enough for chunking) ───
function approxTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

// ─── PAS 13 structure loader ─────────────────────────────────────────────
interface StructureEntry {
  section: string;
  title: string;
  page: number;
}
function loadStructure(): { tableOfContents: StructureEntry[] } {
  const p = resolve(DATA_DIR, "pas13-structure.json");
  return JSON.parse(readFileSync(p, "utf8"));
}

function sectionForPage(
  toc: StructureEntry[],
  pageNum: number,
): StructureEntry | null {
  // Find the last TOC entry whose page <= pageNum.
  let best: StructureEntry | null = null;
  for (const e of toc) {
    if (e.page <= pageNum) {
      if (!best || e.page > best.page) best = e;
      else if (e.page === best.page && e.section.length > best.section.length) {
        best = e;
      }
    }
  }
  return best;
}

// ─── PDF → chunks ─────────────────────────────────────────────────────────
async function parsePdfPages(
  pdfPath: string,
): Promise<Array<{ page: number; text: string }>> {
  const fileUrl = "file://" + encodeURI(pdfPath);
  const doc = await getDocument({ url: fileUrl, useSystemFonts: true })
    .promise;
  const pages: Array<{ page: number; text: string }> = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const tc = await p.getTextContent();
    const text = tc.items
      .map((it: any) => (typeof it.str === "string" ? it.str : ""))
      .filter((s: string) => s.length > 0)
      .join(" ");
    pages.push({ page: i, text });
  }
  return pages;
}

function chunkPdfPages(
  pages: Array<{ page: number; text: string }>,
  toc: StructureEntry[],
): PdfChunk[] {
  const TARGET_TOK = 500;
  const OVERLAP_TOK = 50;
  const TARGET_CHAR = TARGET_TOK * 4;
  const OVERLAP_CHAR = OVERLAP_TOK * 4;
  const chunks: PdfChunk[] = [];
  for (const { page, text } of pages) {
    if (!text || text.trim().length < 30) continue;
    const sec = sectionForPage(toc, page);
    const sectionId = sec?.section ?? "";
    const sectionTitle = sec?.title ?? "";
    // Sliding-window chunking within a single page
    let i = 0;
    while (i < text.length) {
      const end = Math.min(text.length, i + TARGET_CHAR);
      const piece = text.slice(i, end).trim();
      if (piece.length >= 80) {
        const id =
          "pdf_" +
          page.toString().padStart(3, "0") +
          "_" +
          sha256(piece);
        chunks.push({
          id,
          text: piece,
          source: "pdf",
          section: sectionId,
          page,
          url: `/api/standards/pas-13-2017.pdf#page=${page}`,
          label: sectionId
            ? `PAS 13 §${sectionId}${sectionTitle ? ` — ${sectionTitle}` : ""} (p.${page})`
            : `PAS 13:2017 p.${page}`,
        });
      }
      if (end >= text.length) break;
      i = end - OVERLAP_CHAR;
      if (i <= 0) i = end;
    }
  }
  return chunks;
}

// ─── Video captions → chunks ──────────────────────────────────────────────
interface PlaylistEntry {
  id: string;
  title: string;
  duration?: number;
}

function scrapePlaylist(): PlaylistEntry[] {
  const raw = execFileSync(
    YT_DLP,
    ["--flat-playlist", "--dump-json", PLAYLIST_URL],
    { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  const videos: PlaylistEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj.id && obj.title) {
        videos.push({ id: obj.id, title: obj.title, duration: obj.duration });
      }
    } catch {
      // ignore
    }
  }
  return videos;
}

function fetchAutoCaptions(videoId: string): string | null {
  // Writes /tmp/yt/<id>.en.vtt (or nothing if captions missing)
  const tmpDir = "/tmp/yt";
  mkdirSync(tmpDir, { recursive: true });
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const r = spawnSync(
    YT_DLP,
    [
      "--skip-download",
      "--write-auto-sub",
      "--sub-lang",
      "en",
      "--convert-subs",
      "vtt",
      "--output",
      `${tmpDir}/%(id)s.%(ext)s`,
      url,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.warn(`[captions] ${videoId}: yt-dlp failed`);
    return null;
  }
  // Look for the produced file
  const candidates = [
    `${tmpDir}/${videoId}.en.vtt`,
    `${tmpDir}/${videoId}.en-US.vtt`,
    `${tmpDir}/${videoId}.en-GB.vtt`,
    `${tmpDir}/${videoId}.en-en.vtt`,
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  return null;
}

function parseVtt(
  vtt: string,
): Array<{ startSec: number; endSec: number; text: string }> {
  const entries: Array<{ startSec: number; endSec: number; text: string }> = [];
  const lines = vtt.split(/\r?\n/);
  let i = 0;
  const timeRe =
    /^(\d{2}):(\d{2}):(\d{2}\.\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2}\.\d{3})/;
  while (i < lines.length) {
    const m = lines[i].match(timeRe);
    if (!m) {
      i++;
      continue;
    }
    const startSec =
      parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
    const endSec =
      parseInt(m[4]) * 3600 + parseInt(m[5]) * 60 + parseFloat(m[6]);
    i++;
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].match(timeRe)) {
      buf.push(lines[i]);
      i++;
    }
    const rawText = buf.join(" ");
    // Strip VTT inline tags like <00:00:00.000><c> ...
    const text = rawText
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    if (text) entries.push({ startSec, endSec, text });
  }
  // Dedupe rolling auto-caption duplicates (YouTube repeats cues with overlap)
  const deduped: typeof entries = [];
  for (const e of entries) {
    const last = deduped[deduped.length - 1];
    if (last && last.text === e.text) {
      last.endSec = e.endSec;
      continue;
    }
    if (last && e.text.startsWith(last.text) && e.text.length > last.text.length) {
      last.text = e.text;
      last.endSec = e.endSec;
      continue;
    }
    deduped.push({ ...e });
  }
  return deduped;
}

function chunkVideo(
  videoId: string,
  videoTitle: string,
  cues: Array<{ startSec: number; endSec: number; text: string }>,
): VideoChunk[] {
  // ~60 second rolling chunks, capped at ~450 tokens.
  const WINDOW_SEC = 60;
  const MAX_CHAR = 1800;
  const chunks: VideoChunk[] = [];
  let bufText: string[] = [];
  let bufStart: number | null = null;
  let bufEnd = 0;
  const flush = (lastEnd: number) => {
    if (!bufText.length || bufStart === null) return;
    const text = bufText.join(" ").trim();
    if (text.length < 60) return;
    const startSecInt = Math.floor(bufStart);
    const id = "vid_" + videoId + "_" + startSecInt + "_" + sha256(text);
    chunks.push({
      id,
      text,
      source: "video",
      videoId,
      videoTitle,
      startSec: startSecInt,
      endSec: Math.floor(lastEnd),
      url: `https://youtu.be/${videoId}?t=${startSecInt}`,
      label: `${videoTitle} @ ${formatTs(startSecInt)}`,
    });
  };
  for (const cue of cues) {
    if (bufStart === null) bufStart = cue.startSec;
    bufText.push(cue.text);
    bufEnd = cue.endSec;
    const joined = bufText.join(" ");
    if (
      cue.endSec - bufStart >= WINDOW_SEC ||
      joined.length >= MAX_CHAR
    ) {
      flush(cue.endSec);
      bufText = [];
      bufStart = null;
    }
  }
  flush(bufEnd);
  return chunks;
}

function formatTs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── OpenAI embeddings ────────────────────────────────────────────────────
async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: texts,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI embeddings ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
    usage: { prompt_tokens: number; total_tokens: number };
  };
  embedUsage.totalTokens += data.usage?.total_tokens ?? 0;
  return data.data.map((d) => d.embedding);
}

const embedUsage = { totalTokens: 0 };

async function embedAll(
  chunks: CorpusChunk[],
  cache: Map<string, number[]>,
): Promise<void> {
  const pending: CorpusChunk[] = [];
  for (const c of chunks) {
    const h = sha256(c.text);
    const prev = cache.get(h);
    if (prev) c.embedding = prev;
    else pending.push(c);
  }
  for (let i = 0; i < pending.length; i += EMBED_BATCH) {
    const batch = pending.slice(i, i + EMBED_BATCH);
    const embs = await embedBatch(batch.map((b) => b.text));
    for (let j = 0; j < batch.length; j++) {
      batch[j].embedding = embs[j];
      cache.set(sha256(batch[j].text), embs[j]);
    }
    const done = Math.min(pending.length, i + EMBED_BATCH);
    console.log(
      `[embed] ${done}/${pending.length} (tokens so far ${embedUsage.totalTokens.toLocaleString()})`,
    );
  }
}

// ─── Main ────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  const structure = loadStructure();

  console.log("→ Parsing PAS 13 PDF...");
  const pages = await parsePdfPages(PDF_PATH);
  const pdfChunks = chunkPdfPages(pages, structure.tableOfContents);
  console.log(`  ${pdfChunks.length} PDF chunks from ${pages.length} pages`);

  console.log("→ Scraping playlist...");
  const videos = scrapePlaylist();
  console.log(`  ${videos.length} videos found`);

  const videoChunks: VideoChunk[] = [];
  const captionsReport: Array<{
    id: string;
    title: string;
    cues: number;
    chunks: number;
    ok: boolean;
  }> = [];
  for (const v of videos) {
    const vtt = fetchAutoCaptions(v.id);
    if (!vtt) {
      captionsReport.push({
        id: v.id,
        title: v.title,
        cues: 0,
        chunks: 0,
        ok: false,
      });
      console.warn(`  [no-caps] ${v.id} "${v.title}"`);
      continue;
    }
    const cues = parseVtt(vtt);
    const chunks = chunkVideo(v.id, v.title, cues);
    videoChunks.push(...chunks);
    captionsReport.push({
      id: v.id,
      title: v.title,
      cues: cues.length,
      chunks: chunks.length,
      ok: true,
    });
    console.log(
      `  ${v.id} "${v.title}" → ${cues.length} cues → ${chunks.length} chunks`,
    );
  }

  const allChunks: CorpusChunk[] = [...pdfChunks, ...videoChunks];
  console.log(
    `→ Total: ${allChunks.length} chunks (${pdfChunks.length} PDF + ${videoChunks.length} video)`,
  );

  // Idempotency cache: prior embeddings keyed by chunk-text sha.
  const cache = new Map<string, number[]>();
  if (existsSync(OUT_PATH)) {
    try {
      const prev = JSON.parse(readFileSync(OUT_PATH, "utf8"));
      if (prev && Array.isArray(prev.chunks)) {
        for (const c of prev.chunks) {
          if (c.text && Array.isArray(c.embedding)) {
            cache.set(sha256(c.text), c.embedding);
          }
        }
        console.log(`  cache loaded: ${cache.size} prior embeddings`);
      }
    } catch {
      // ignore corrupt cache
    }
  }

  if (!SKIP_EMBED) {
    console.log("→ Embedding...");
    await embedAll(allChunks, cache);
    const missing = allChunks.filter((c) => !c.embedding).length;
    if (missing > 0) {
      throw new Error(`${missing} chunks failed to embed`);
    }
  } else {
    console.log("→ SKIP_EMBED=1 — writing chunks without embeddings");
  }

  const out = {
    _meta: {
      builtAt: new Date().toISOString(),
      model: EMBED_MODEL,
      pdfChunks: pdfChunks.length,
      videoChunks: videoChunks.length,
      totalChunks: allChunks.length,
      totalEmbeddingTokens: embedUsage.totalTokens,
      // text-embedding-3-small pricing: $0.02 per 1M tokens
      estimatedEmbedCostUSD:
        Math.round((embedUsage.totalTokens / 1_000_000) * 0.02 * 10000) / 10000,
      captionsReport,
      standardVersion: "PAS 13:2017",
      playlistUrl: PLAYLIST_URL,
      embeddingsIncluded: !SKIP_EMBED,
    },
    chunks: allChunks,
  };
  // Write chunks file separately when skipping embeddings so the upload
  // endpoint can discriminate cleanly.
  const outputPath = SKIP_EMBED
    ? resolve(DATA_DIR, "pas13-chunks.json")
    : OUT_PATH;
  writeFileSync(outputPath, JSON.stringify(out));
  console.log(`wrote ${outputPath} (${(JSON.stringify(out).length / 1024 / 1024).toFixed(2)} MB)`);
  if (!SKIP_EMBED) {
    console.log(
      `embedding tokens: ${embedUsage.totalTokens.toLocaleString()} (~$${out._meta.estimatedEmbedCostUSD})`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
