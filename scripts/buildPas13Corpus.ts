// ────────────────────────────────────────────────────────────────────────────
// scripts/buildPas13Corpus.ts
//
// PAS 13 / A-SAFE knowledge corpus builder. Combines:
//   1. The PAS 13:2017 PDF text (chunked by ~500 tokens, 50-token overlap),
//      tagged with section+page from scripts/data/pas13-structure.json.
//   2. Every video in the A-SAFE "16 steps to learn PAS 13" playlist, via
//      OpenAI Whisper (preferred) or yt-dlp auto-captions (fallback).
//   3. A-SAFE Product Suitability (PRH-1009) — one chunk per product, from
//      scripts/data/product-suitability.json.
//   4. A-SAFE Product Maintenance (PRH-1001) — one chunk per family overlay
//      (incl. GLOBAL), from scripts/data/product-maintenance.json.
//   5. A-SAFE GroundWorks (PRH-1005) — one chunk per family/base-plate entry,
//      from scripts/data/product-groundworks.json.
//   6. A-SAFE Master Impact Testing (PRH-1012) — one chunk per product, from
//      scripts/data/product-impact-testing.json.
//
// Output: scripts/data/pas13-embeddings.json — a single flat JSON file with
// { chunks: [{ id, text, source, embedding, …metadata }], _meta }.
//
// Idempotent: a manifest-sidecar keyed by chunk-text sha256 is used to skip
// chunks already embedded in a previous run.
//
// Defensive: if a structured JSON for one of the 4 A-SAFE PDFs is missing or
// malformed, that source is logged and skipped — the rest of the build still
// succeeds. We never silently swallow PAS 13 PDF or playlist failures.
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
  // "whisper" when the chunk came from an OpenAI Whisper transcript file in
  // /tmp/pas13-whisper/<videoId>.json; "auto" when we fell back to the
  // yt-dlp auto-caption VTT. Tagged on every video chunk so the citation
  // metadata is auditable on the L3 surface.
  transcribedBy: "whisper" | "auto";
}

// One chunk per product — Product Suitability PDF (PRH-1009).
interface SuitabilityChunk {
  id: string;
  text: string;
  source: "suitability_pdf";
  productName: string;
  category?: string;
  page: number;
  url: string;
  label: string;
}

// One chunk per family overlay (incl. GLOBAL) — Product Maintenance (PRH-1001).
interface MaintenanceChunk {
  id: string;
  text: string;
  source: "maintenance_pdf";
  productFamily: string;
  url: string;
  label: string;
}

// One chunk per family/base-plate entry — GroundWorks PDF (PRH-1005).
interface GroundworksChunk {
  id: string;
  text: string;
  source: "groundworks_pdf";
  productFamily: string;
  basePlateType?: string;
  page?: number;
  url: string;
  label: string;
}

// One chunk per product — Master Impact Testing PDF (PRH-1012).
interface ImpactTestingChunk {
  id: string;
  text: string;
  source: "impact_testing_pdf";
  productName: string;
  page?: number;
  url: string;
  label: string;
}

type CorpusChunk = (
  | PdfChunk
  | VideoChunk
  | SuitabilityChunk
  | MaintenanceChunk
  | GroundworksChunk
  | ImpactTestingChunk
) & {
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

// ─── Whisper transcript loader ────────────────────────────────────────────
//
// Whisper outputs are produced out-of-band by the local-shell loop that
// posts each downloaded mp3 to /api/pas13/admin/whisper-transcribe and saves
// the JSON response to /tmp/pas13-whisper/<videoId>.json. Shape:
//   { transcript: string, segments: [{ start, end, text }] }
// We prefer Whisper over auto-captions when the file exists AND the result
// looks reasonable (length > 100 chars + sane words-per-second ratio).
const WHISPER_DIR =
  process.env.PAS13_WHISPER_DIR || "/tmp/pas13-whisper";

interface WhisperFile {
  transcript: string;
  segments: Array<{ start: number; end: number; text: string }>;
  duration?: number | null;
}

function loadWhisper(videoId: string): WhisperFile | null {
  const p = `${WHISPER_DIR}/${videoId}.json`;
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as WhisperFile;
    if (!raw || typeof raw.transcript !== "string") return null;
    if (!Array.isArray(raw.segments) || raw.segments.length === 0) return null;
    return raw;
  } catch {
    return null;
  }
}

// Defensive sanity check: silent audio sometimes comes back as a single
// "[Music]" segment or near-empty text. Reject anything obviously broken so
// we fall back to the (noisier but real) auto-captions.
function whisperLooksGood(w: WhisperFile): boolean {
  const t = (w.transcript || "").trim();
  if (t.length <= 100) return false;
  const words = t.split(/\s+/).filter(Boolean).length;
  const dur =
    w.duration ??
    (w.segments.length ? w.segments[w.segments.length - 1].end : 0);
  if (dur > 0) {
    const wps = words / dur;
    // Real speech is ~1.5–3.5 words/sec; well-below 0.4 is likely silence
    // or a music-only clip mis-recognised.
    if (wps < 0.4) return false;
  }
  return true;
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
  transcribedBy: "whisper" | "auto",
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
      transcribedBy,
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

// ─── Slug helper for chunk ids ────────────────────────────────────────────
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// ─── Source 2: Product Suitability (PRH-1009) ─────────────────────────────
//
// scripts/data/product-suitability.json: one entry per product. We flatten
// each entry into a single ~250–500 token chunk that names the product,
// its category, ATEX status, vehicle suitability, fit-for-purpose
// applications, impact zone, base plate spec, material/fire/recycling
// notes — everything a rep might ask. One chunk per product so a
// retrieval like "ATEX suitability of iFlex Pedestrian" pulls the right
// one.
function loadSuitabilityProducts(): any[] | null {
  const p = resolve(DATA_DIR, "product-suitability.json");
  if (!existsSync(p)) {
    console.warn(`[suitability] missing ${p} — skipping`);
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    if (!raw || !Array.isArray(raw.products)) {
      console.warn(`[suitability] malformed (no products array) — skipping`);
      return null;
    }
    return raw.products;
  } catch (err) {
    console.warn(`[suitability] parse failed: ${(err as Error).message}`);
    return null;
  }
}

function chunkSuitability(products: any[]): SuitabilityChunk[] {
  const chunks: SuitabilityChunk[] = [];
  for (const p of products) {
    const productName = String(p.productName || "").trim();
    if (!productName) continue;
    const category = String(p.category || "").trim();
    const page = Number(p.pageNumber) || 0;
    const lines: string[] = [];
    lines.push(`Product: ${productName}`);
    if (category) lines.push(`Category: ${category}`);
    if (p.environment) {
      const envs: string[] = [];
      if (p.environment.internal) envs.push("internal");
      if (p.environment.external) envs.push("external");
      if (envs.length) lines.push(`Environment: ${envs.join(", ")}`);
    }
    if (p.atexSuitability) {
      lines.push(
        `ATEX (explosive atmospheres): ${
          p.atexSuitability.suitable ? "Suitable" : "Not suitable"
        }${p.atexSuitability.note ? ` — ${p.atexSuitability.note}` : ""}`,
      );
    }
    if (p.standardBaseAndFixing) {
      const b = p.standardBaseAndFixing;
      const parts: string[] = [];
      if (b.boltSize) parts.push(`bolt: ${b.boltSize}`);
      if (b.fixingType) parts.push(`fixing: ${b.fixingType}`);
      if (b.baseMaterial) parts.push(`base material: ${b.baseMaterial}`);
      if (parts.length)
        lines.push(`Standard base & fixing: ${parts.join("; ")}`);
    }
    if (Array.isArray(p.vehicleSuitability) && p.vehicleSuitability.length) {
      lines.push(
        `Suitable vehicles/users: ${p.vehicleSuitability.join("; ")}`,
      );
    }
    if (
      Array.isArray(p.fitForPurposeApplications) &&
      p.fitForPurposeApplications.length
    ) {
      lines.push(
        `Fit-for-purpose applications: ${p.fitForPurposeApplications.join("; ")}`,
      );
    }
    if (p.impactZone && (p.impactZone.minMm || p.impactZone.maxMm)) {
      lines.push(
        `Impact zone: ${p.impactZone.note || `${p.impactZone.minMm ?? "?"}–${p.impactZone.maxMm ?? "?"} mm`}`,
      );
    } else if (p.impactZoneNote) {
      lines.push(`Impact zone note: ${p.impactZoneNote}`);
    }
    if (p.materialProperties) {
      const m = p.materialProperties;
      const matBits: string[] = [];
      if (m.temperatureRange) matBits.push(`temp ${m.temperatureRange}`);
      if (m.ignitionTemperature)
        matBits.push(`ignition ${m.ignitionTemperature}`);
      if (m.flashPoint) matBits.push(`flash point ${m.flashPoint}`);
      if (m.toxicity) matBits.push(`toxicity ${m.toxicity}`);
      if (m.chemicalResistance)
        matBits.push(`chemical resistance ${m.chemicalResistance}`);
      if (m.weatheringStability)
        matBits.push(`weathering ${m.weatheringStability}`);
      if (m.lightStability) matBits.push(`light stability ${m.lightStability}`);
      if (m.staticRating) matBits.push(`static ${m.staticRating}`);
      if (typeof m.hygieneSeals === "boolean")
        matBits.push(`hygiene seals: ${m.hygieneSeals ? "yes" : "no"}`);
      if (matBits.length)
        lines.push(`Material properties: ${matBits.join("; ")}`);
    }
    if (typeof p.fireInformation === "string" && p.fireInformation.trim()) {
      lines.push(`Fire information: ${p.fireInformation.trim()}`);
    }
    if (
      typeof p.environmentalInformation === "string" &&
      p.environmentalInformation.trim()
    ) {
      lines.push(
        `Environmental information: ${p.environmentalInformation.trim()}`,
      );
    }
    if (p.recyclingInformation) {
      const r = p.recyclingInformation;
      const rec: string[] = [];
      if (r.packaging) rec.push(`packaging ${r.packaging}`);
      if (r.postAndRails) rec.push(`post & rails ${r.postAndRails}`);
      if (r.fixings) rec.push(`fixings ${r.fixings}`);
      if (r.bases) rec.push(`bases ${r.bases}`);
      if (rec.length) lines.push(`Recycling: ${rec.join("; ")}`);
    }
    const text = lines.join("\n").trim();
    if (text.length < 60) continue;
    const id = "suit_" + slug(productName) + "_" + sha256(text);
    const url = page
      ? `/api/standards/product-suitability.pdf#page=${page}`
      : `/api/standards/product-suitability.pdf`;
    chunks.push({
      id,
      text,
      source: "suitability_pdf",
      productName,
      category: category || undefined,
      page,
      url,
      label: page
        ? `Product Suitability (PRH-1009) — ${productName} (p.${page})`
        : `Product Suitability (PRH-1009) — ${productName}`,
    });
  }
  return chunks;
}

// ─── Source 3: Product Maintenance (PRH-1001) ─────────────────────────────
//
// 5 entries: 1 GLOBAL overlay + 4 family-specific overlays (Memaplex,
// Monoplex, RackGuard, Traffic Gate). Each is a self-contained
// inspection/cleaning/damage/spares block. Per the task, chunk by family.
function loadMaintenanceFamilies(): any[] | null {
  const p = resolve(DATA_DIR, "product-maintenance.json");
  if (!existsSync(p)) {
    console.warn(`[maintenance] missing ${p} — skipping`);
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    if (!raw || !Array.isArray(raw.products)) {
      console.warn(`[maintenance] malformed (no products array) — skipping`);
      return null;
    }
    return raw.products;
  } catch (err) {
    console.warn(`[maintenance] parse failed: ${(err as Error).message}`);
    return null;
  }
}

function chunkMaintenance(families: any[]): MaintenanceChunk[] {
  const chunks: MaintenanceChunk[] = [];
  for (const f of families) {
    const familyName = String(f.productName || "").trim();
    if (!familyName) continue;
    // Friendly label: "GLOBAL" instead of "__GLOBAL__".
    const friendly = familyName === "__GLOBAL__" ? "GLOBAL" : familyName;
    const lines: string[] = [];
    lines.push(`Maintenance scope: ${friendly}`);
    if (Array.isArray(f.appliesToFamilies) && f.appliesToFamilies.length) {
      lines.push(`Applies to families: ${f.appliesToFamilies.join(", ")}`);
    }
    if (
      Array.isArray(f.appliesToCategoryKeywords) &&
      f.appliesToCategoryKeywords.length
    ) {
      lines.push(
        `Applies to categories: ${f.appliesToCategoryKeywords.join(", ")}`,
      );
    }
    if (f.inspectionFrequency) {
      lines.push(`Inspection frequency: ${f.inspectionFrequency}`);
    }
    if (f.inspectionNotes) {
      lines.push(`Inspection notes: ${f.inspectionNotes}`);
    }
    if (f.cleaningInstructions) {
      lines.push(`Cleaning: ${f.cleaningInstructions}`);
    }
    if (Array.isArray(f.damageAssessment) && f.damageAssessment.length) {
      lines.push(`Damage assessment:`);
      for (const d of f.damageAssessment) lines.push(`  • ${d}`);
    }
    if (f.warrantyConditions) {
      lines.push(`Warranty conditions: ${f.warrantyConditions}`);
    }
    if (Array.isArray(f.recommendedSpares) && f.recommendedSpares.length) {
      lines.push(
        `Recommended spares: ${f.recommendedSpares.join("; ")}`,
      );
    }
    const text = lines.join("\n").trim();
    if (text.length < 80) continue;
    const id = "maint_" + slug(friendly) + "_" + sha256(text);
    chunks.push({
      id,
      text,
      source: "maintenance_pdf",
      productFamily: friendly,
      url: `/api/maintenance/product-maintenance-guide.pdf`,
      label: `Product Maintenance (PRH-1001) — ${friendly}`,
    });
  }
  return chunks;
}

// ─── Source 4: GroundWorks (PRH-1005) ─────────────────────────────────────
//
// scripts/data/product-groundworks.json: one entry per product family /
// base-plate combination. Each chunk lists slab thickness, concrete grade,
// bolt spec, pad dimensions, hardcore depth, edge distance, curing days
// and substrate notes — everything a site surveyor or rep needs.
function loadGroundworksEntries(): {
  entries: any[];
  basePlateById: Map<string, any>;
} | null {
  const p = resolve(DATA_DIR, "product-groundworks.json");
  if (!existsSync(p)) {
    console.warn(`[groundworks] missing ${p} — skipping`);
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    const entries: any[] = Array.isArray(raw?.entries) ? raw.entries : [];
    if (entries.length === 0) {
      console.warn(`[groundworks] malformed (no entries) — skipping`);
      return null;
    }
    const basePlateById = new Map<string, any>();
    if (Array.isArray(raw?._meta?.basePlateTypes)) {
      for (const bp of raw._meta.basePlateTypes) {
        if (bp && bp.id) basePlateById.set(String(bp.id), bp);
      }
    }
    return { entries, basePlateById };
  } catch (err) {
    console.warn(`[groundworks] parse failed: ${(err as Error).message}`);
    return null;
  }
}

function chunkGroundworks(
  entries: any[],
  basePlateById: Map<string, any>,
): GroundworksChunk[] {
  const chunks: GroundworksChunk[] = [];
  for (const e of entries) {
    const productFamily = String(e.productFamily || "").trim();
    if (!productFamily) continue;
    const basePlateType = String(e.basePlateType || "").trim();
    const bp = basePlateType ? basePlateById.get(basePlateType) : undefined;
    const lines: string[] = [];
    lines.push(`Product family: ${productFamily}`);
    if (basePlateType) {
      const bpLabel = bp?.label ? ` (${bp.label})` : "";
      lines.push(`Base plate type: ${basePlateType}${bpLabel}`);
    }
    if (e.minSlabThicknessMm)
      lines.push(`Minimum slab thickness: ${e.minSlabThicknessMm} mm`);
    if (e.concreteGrade) lines.push(`Concrete grade: ${e.concreteGrade}`);
    if (e.concreteStandard)
      lines.push(`Concrete standard: ${e.concreteStandard}`);
    if (e.postDiameterMm)
      lines.push(`Post diameter: ${e.postDiameterMm} mm OD`);
    if (e.basePlateDimensionsMm)
      lines.push(`Base plate dimensions: ${e.basePlateDimensionsMm} mm`);
    if (e.anchorSpec) lines.push(`Anchor spec: ${e.anchorSpec}`);
    if (e.anchorDiameterMm)
      lines.push(`Anchor diameter: ${e.anchorDiameterMm} mm`);
    if (e.anchorDepthMm) lines.push(`Anchor depth: ${e.anchorDepthMm} mm`);
    if (e.edgeDistanceMm) lines.push(`Edge distance: ${e.edgeDistanceMm} mm`);
    if (e.concretePadLengthMm)
      lines.push(`Concrete pad length: ${e.concretePadLengthMm} mm`);
    if (e.concretePadLengthNote)
      lines.push(`Concrete pad length note: ${e.concretePadLengthNote}`);
    if (e.concretePadWidthMm)
      lines.push(`Concrete pad width: ${e.concretePadWidthMm} mm`);
    if (e.concretePadDepthMm)
      lines.push(`Concrete pad depth: ${e.concretePadDepthMm} mm`);
    if (e.hardcoreDepthMm)
      lines.push(`Hardcore depth: ${e.hardcoreDepthMm} mm`);
    if (e.curingDays) lines.push(`Concrete curing days: ${e.curingDays}`);
    if (e.slabRebarSpec)
      lines.push(`Slab rebar specification: ${e.slabRebarSpec}`);
    if (e.substrateNotes) lines.push(`Substrate notes: ${e.substrateNotes}`);
    if (e.rawText) lines.push(`Source note: ${e.rawText}`);
    const text = lines.join("\n").trim();
    if (text.length < 60) continue;
    const page = Number(e.sourcePage) || 0;
    const id =
      "gw_" + slug(productFamily) + "_" + (basePlateType ? slug(basePlateType) : "x") + "_" + sha256(text);
    chunks.push({
      id,
      text,
      source: "groundworks_pdf",
      productFamily,
      basePlateType: basePlateType || undefined,
      page: page || undefined,
      url: `/api/groundworks/a-safe-groundworks-guide.pdf`,
      label: page
        ? `GroundWorks (PRH-1005) — ${productFamily} (p.${page})`
        : `GroundWorks (PRH-1005) — ${productFamily}`,
    });
  }
  return chunks;
}

// ─── Source 5: Master Impact Testing (PRH-1012) ───────────────────────────
//
// scripts/data/product-impact-testing.json: one row per tested product with
// its post diameter, rail diameter, impact zone, ForkGuard / bollard
// height, impact-angle scope (45° + 90° vs 90°-only). Chunk by product.
function loadImpactTestingProducts(): any[] | null {
  const p = resolve(DATA_DIR, "product-impact-testing.json");
  if (!existsSync(p)) {
    console.warn(`[impact-testing] missing ${p} — skipping`);
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    if (!raw || !Array.isArray(raw.products)) {
      console.warn(
        `[impact-testing] malformed (no products array) — skipping`,
      );
      return null;
    }
    return raw.products;
  } catch (err) {
    console.warn(`[impact-testing] parse failed: ${(err as Error).message}`);
    return null;
  }
}

function chunkImpactTesting(products: any[]): ImpactTestingChunk[] {
  const chunks: ImpactTestingChunk[] = [];
  for (const p of products) {
    const productName = String(p.name || "").trim();
    if (!productName) continue;
    const lines: string[] = [];
    lines.push(`Product: ${productName}`);
    lines.push(`Source: A-SAFE Master Impact Testing document (PRH-1012)`);
    if (p.postDiameter)
      lines.push(`Post diameter (mm / inches): ${p.postDiameter}`);
    if (p.railDiameter)
      lines.push(`Rail diameter (mm / inches): ${p.railDiameter}`);
    if (p.impactZone)
      lines.push(`Impact zone (mm / inches): ${p.impactZone}`);
    if (p.forkGuardHeight)
      lines.push(`ForkGuard height: ${p.forkGuardHeight}`);
    if (p.bollardHeight) lines.push(`Bollard height: ${p.bollardHeight}`);
    if (p.impactAngleScope) {
      const friendly =
        p.impactAngleScope === "45+90"
          ? "45° + 90° (per PAS 13:2017 + A-SAFE in-house 90° head-on)"
          : p.impactAngleScope === "90"
            ? "90° head-on only (bollards / posts)"
            : p.impactAngleScope;
      lines.push(`Impact-angle test scope: ${friendly}`);
    }
    if (p.testMethod) lines.push(`Test method: ${p.testMethod}`);
    const text = lines.join("\n").trim();
    if (text.length < 40) continue;
    const page = Number(p.pageNum) || 0;
    const id = "test_" + slug(productName) + "_" + sha256(text);
    chunks.push({
      id,
      text,
      source: "impact_testing_pdf",
      productName,
      page: page || undefined,
      url: `/api/testing/product-impact-testing-master.pdf`,
      label: page
        ? `Master Impact Testing (PRH-1012) — ${productName} (p.${page})`
        : `Master Impact Testing (PRH-1012) — ${productName}`,
    });
  }
  return chunks;
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

// ─── Existing chunks fallback ─────────────────────────────────────────────
//
// When PAS 13 PDF or yt-dlp playlist scraping is unavailable on this host,
// preserve whatever PAS 13 PDF / video chunks already shipped in
// scripts/data/pas13-chunks.json (or scripts/data/pas13-embeddings.json).
// Embeddings on those chunks are kept verbatim — they are valid for the
// same text-embedding-3-small model.
function loadExistingChunks(filterSources: Array<CorpusChunk["source"]>): {
  chunks: CorpusChunk[];
  fromPath: string | null;
} {
  for (const fname of ["pas13-embeddings.json", "pas13-chunks.json"]) {
    const p = resolve(DATA_DIR, fname);
    if (!existsSync(p)) continue;
    try {
      const raw = JSON.parse(readFileSync(p, "utf8"));
      if (raw && Array.isArray(raw.chunks)) {
        const matching = raw.chunks.filter(
          (c: CorpusChunk) => c && filterSources.includes(c.source),
        );
        if (matching.length > 0) {
          return { chunks: matching, fromPath: p };
        }
      }
    } catch {
      // ignore
    }
  }
  return { chunks: [], fromPath: null };
}

// ─── Main ────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  const structure = loadStructure();

  // PAS 13 PDF — defensive: if the source file is missing on this host,
  // keep the chunks already in pas13-chunks.json / pas13-embeddings.json
  // rather than failing the whole build.
  let pdfChunks: PdfChunk[] = [];
  if (existsSync(PDF_PATH)) {
    try {
      console.log("→ Parsing PAS 13 PDF...");
      const pages = await parsePdfPages(PDF_PATH);
      pdfChunks = chunkPdfPages(pages, structure.tableOfContents);
      console.log(`  ${pdfChunks.length} PDF chunks from ${pages.length} pages`);
    } catch (err) {
      console.warn(
        `  [pas13-pdf] parse failed (${(err as Error).message}) — falling back to existing chunks`,
      );
      const fallback = loadExistingChunks(["pdf"]);
      pdfChunks = fallback.chunks as PdfChunk[];
      if (fallback.fromPath) {
        console.log(
          `  reused ${pdfChunks.length} PDF chunks from ${fallback.fromPath}`,
        );
      }
    }
  } else {
    console.warn(
      `  [pas13-pdf] ${PDF_PATH} missing — falling back to existing chunks`,
    );
    const fallback = loadExistingChunks(["pdf"]);
    pdfChunks = fallback.chunks as PdfChunk[];
    if (fallback.fromPath) {
      console.log(
        `  reused ${pdfChunks.length} PDF chunks from ${fallback.fromPath}`,
      );
    }
  }

  // Playlist scrape — defensive: if yt-dlp isn't installed or auth fails,
  // keep existing video chunks (preferring Whisper-transcribed ones if
  // present).
  let videos: PlaylistEntry[] = [];
  if (existsSync(YT_DLP)) {
    try {
      console.log("→ Scraping playlist...");
      videos = scrapePlaylist();
      console.log(`  ${videos.length} videos found`);
    } catch (err) {
      console.warn(
        `  [playlist] scrape failed (${(err as Error).message}) — falling back to existing chunks`,
      );
    }
  } else {
    console.warn(
      `  [playlist] yt-dlp at ${YT_DLP} missing — falling back to existing chunks`,
    );
  }

  const videoChunks: VideoChunk[] = [];
  const captionsReport: Array<{
    id: string;
    title: string;
    cues: number;
    chunks: number;
    ok: boolean;
    transcribedBy: "whisper" | "auto" | "none";
  }> = [];

  if (videos.length === 0) {
    // Re-use existing video chunks unmodified.
    const fallback = loadExistingChunks(["video"]);
    videoChunks.push(...(fallback.chunks as VideoChunk[]));
    if (fallback.fromPath) {
      console.log(
        `  reused ${videoChunks.length} video chunks from ${fallback.fromPath}`,
      );
    }
  }

  for (const v of videos) {
    // Prefer Whisper transcripts over yt-dlp auto-captions when both exist.
    // Auto-caption duplication on GCC-accented voiceovers (the τ flag) means
    // Whisper is materially cleaner where we have it.
    const whisper = loadWhisper(v.id);
    if (whisper && whisperLooksGood(whisper)) {
      const cues = whisper.segments.map((s) => ({
        startSec: s.start,
        endSec: s.end,
        text: s.text,
      }));
      const chunks = chunkVideo(v.id, v.title, cues, "whisper");
      videoChunks.push(...chunks);
      captionsReport.push({
        id: v.id,
        title: v.title,
        cues: cues.length,
        chunks: chunks.length,
        ok: true,
        transcribedBy: "whisper",
      });
      console.log(
        `  ${v.id} "${v.title}" → whisper: ${cues.length} segs → ${chunks.length} chunks`,
      );
      continue;
    }
    if (whisper && !whisperLooksGood(whisper)) {
      console.warn(
        `  [whisper-rejected] ${v.id} "${v.title}" — falling back to auto-captions`,
      );
    }
    const vtt = fetchAutoCaptions(v.id);
    if (!vtt) {
      captionsReport.push({
        id: v.id,
        title: v.title,
        cues: 0,
        chunks: 0,
        ok: false,
        transcribedBy: "none",
      });
      console.warn(`  [no-caps] ${v.id} "${v.title}"`);
      continue;
    }
    const cues = parseVtt(vtt);
    const chunks = chunkVideo(v.id, v.title, cues, "auto");
    videoChunks.push(...chunks);
    captionsReport.push({
      id: v.id,
      title: v.title,
      cues: cues.length,
      chunks: chunks.length,
      ok: true,
      transcribedBy: "auto",
    });
    console.log(
      `  ${v.id} "${v.title}" → auto: ${cues.length} cues → ${chunks.length} chunks`,
    );
  }

  // ─── Source 2: Product Suitability ───────────────────────────────────
  console.log("→ Loading Product Suitability (PRH-1009)...");
  const suitabilityProducts = loadSuitabilityProducts();
  const suitabilityChunks: SuitabilityChunk[] = suitabilityProducts
    ? chunkSuitability(suitabilityProducts)
    : [];
  console.log(`  ${suitabilityChunks.length} suitability chunks`);

  // ─── Source 3: Product Maintenance ───────────────────────────────────
  console.log("→ Loading Product Maintenance (PRH-1001)...");
  const maintenanceFamilies = loadMaintenanceFamilies();
  const maintenanceChunks: MaintenanceChunk[] = maintenanceFamilies
    ? chunkMaintenance(maintenanceFamilies)
    : [];
  console.log(`  ${maintenanceChunks.length} maintenance chunks`);

  // ─── Source 4: GroundWorks ───────────────────────────────────────────
  console.log("→ Loading GroundWorks (PRH-1005)...");
  const gw = loadGroundworksEntries();
  const groundworksChunks: GroundworksChunk[] = gw
    ? chunkGroundworks(gw.entries, gw.basePlateById)
    : [];
  console.log(`  ${groundworksChunks.length} groundworks chunks`);

  // ─── Source 5: Master Impact Testing ─────────────────────────────────
  console.log("→ Loading Master Impact Testing (PRH-1012)...");
  const impactTestingProducts = loadImpactTestingProducts();
  const impactTestingChunks: ImpactTestingChunk[] = impactTestingProducts
    ? chunkImpactTesting(impactTestingProducts)
    : [];
  console.log(`  ${impactTestingChunks.length} impact-testing chunks`);

  // Dedupe by sha256(text) — Maintenance and Suitability share boilerplate
  // (e.g. polypropylene fire-information appears verbatim across most
  // products). Keep the first occurrence so the kept chunk's metadata
  // (productName / source) wins.
  const seenText = new Set<string>();
  function dedupe<T extends CorpusChunk>(arr: T[]): T[] {
    const out: T[] = [];
    let dropped = 0;
    for (const c of arr) {
      const h = sha256(c.text);
      if (seenText.has(h)) {
        dropped++;
        continue;
      }
      seenText.add(h);
      out.push(c);
    }
    if (dropped > 0) {
      console.log(`  dedupe: dropped ${dropped} duplicate chunks`);
    }
    return out;
  }

  const allChunks: CorpusChunk[] = [
    ...dedupe<CorpusChunk>(pdfChunks),
    ...dedupe<CorpusChunk>(videoChunks),
    ...dedupe<CorpusChunk>(suitabilityChunks),
    ...dedupe<CorpusChunk>(maintenanceChunks),
    ...dedupe<CorpusChunk>(groundworksChunks),
    ...dedupe<CorpusChunk>(impactTestingChunks),
  ];
  console.log(
    `→ Total: ${allChunks.length} chunks (` +
      `${pdfChunks.length} PAS 13 PDF, ` +
      `${videoChunks.length} video, ` +
      `${suitabilityChunks.length} suitability, ` +
      `${maintenanceChunks.length} maintenance, ` +
      `${groundworksChunks.length} groundworks, ` +
      `${impactTestingChunks.length} impact-testing)`,
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

  const whisperVideoChunks = videoChunks.filter(
    (c) => c.transcribedBy === "whisper",
  ).length;
  const autoVideoChunks = videoChunks.filter(
    (c) => c.transcribedBy === "auto",
  ).length;

  // Count by source (post-dedupe).
  const bySource = allChunks.reduce<Record<string, number>>((acc, c) => {
    acc[c.source] = (acc[c.source] || 0) + 1;
    return acc;
  }, {});

  const out = {
    _meta: {
      builtAt: new Date().toISOString(),
      model: EMBED_MODEL,
      pdfChunks: bySource.pdf ?? 0,
      videoChunks: bySource.video ?? 0,
      suitabilityChunks: bySource.suitability_pdf ?? 0,
      maintenanceChunks: bySource.maintenance_pdf ?? 0,
      groundworksChunks: bySource.groundworks_pdf ?? 0,
      impactTestingChunks: bySource.impact_testing_pdf ?? 0,
      whisperVideoChunks,
      autoVideoChunks,
      totalChunks: allChunks.length,
      bySource,
      totalEmbeddingTokens: embedUsage.totalTokens,
      // text-embedding-3-small pricing: $0.02 per 1M tokens
      estimatedEmbedCostUSD:
        Math.round((embedUsage.totalTokens / 1_000_000) * 0.02 * 10000) / 10000,
      captionsReport,
      standardVersion: "PAS 13:2017",
      playlistUrl: PLAYLIST_URL,
      sources: [
        "PAS 13:2017 (BSI)",
        "A-SAFE PAS 13 educational video playlist",
        "A-SAFE Product Suitability (PRH-1009)",
        "A-SAFE Product Maintenance (PRH-1001)",
        "A-SAFE GroundWorks (PRH-1005)",
        "A-SAFE Master Impact Testing (PRH-1012)",
      ],
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
