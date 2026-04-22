/**
 * scripts/scrapePlaylist.ts
 *
 * Scrapes A-SAFE's Installation Videos YouTube playlist
 * (PL0sD7WA0DgAOGIVdB761OnG6m5pWmFYtp) via yt-dlp, fuzzy-matches each
 * video to products in the live /api/products catalog, and writes the
 * enriched dataset to scripts/data/installation-videos.json for the
 * /api/admin/ingest-installation-videos endpoint to consume.
 *
 * Pipeline (dependencies are idempotent at each step):
 *   1. yt-dlp --flat-playlist --dump-json  → per-video metadata (id,
 *      title, duration, thumbnails).
 *   2. yt-dlp --skip-download --get-description  → full description
 *      per video, so we can pull chapter timestamps out of it.
 *   3. curl /api/products  → live product catalog (uses --grouped=false
 *      so every family row is visible, including CS/+/variant shapes).
 *   4. matchByNameVariants() from shared/nameNormalise to resolve each
 *      title-mined candidate phrase to product rows. Multi-product
 *      matches recorded when the title names two products (e.g.
 *      "iFlex ForkGuard Kerb Barrier" maps to both iFlex ForkGuard
 *      Kerb and generic ForkGuard). Family-level keyword fallback
 *      (e.g. title contains "Bollard" with no specific hit → attach
 *      to every bollard product) tagged confidence 0.6.
 *   5. Emit the scripts/data/installation-videos.json file shape
 *      consumed by the ingest endpoint:
 *        { _meta, videos[{ videoId, title, duration, thumbnailUrl,
 *          description, publishedAt, chapters[], matchedProducts[] }],
 *          unmatched[{ videoId, title, reason }] }
 *
 * Usage:
 *   npx tsx scripts/scrapePlaylist.ts                 # full pipeline
 *   npx tsx scripts/scrapePlaylist.ts --skip-scrape   # reuse /tmp/playlist.jsonl + cached desc
 *   npx tsx scripts/scrapePlaylist.ts --products-url=<override>
 *
 * Safe to re-run: overwrites scripts/data/installation-videos.json only.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  matchByNameVariants,
  normaliseCanonical,
} from "../shared/nameNormalise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PL0sD7WA0DgAOGIVdB761OnG6m5pWmFYtp";
const PLAYLIST_ID = "PL0sD7WA0DgAOGIVdB761OnG6m5pWmFYtp";
const OUT_PATH = path.join(__dirname, "data", "installation-videos.json");
const JSONL_CACHE = "/tmp/playlist.jsonl";
const DESC_CACHE_DIR = "/tmp/yt-desc";
const PRODUCTS_URL_DEFAULT =
  "https://asafe-engage.tom-d-g-childs.workers.dev/api/products?grouped=false";

// ─── CLI flags ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
const SKIP_SCRAPE = args.includes("--skip-scrape");
const productsUrlArg = args.find((a) => a.startsWith("--products-url="));
const PRODUCTS_URL = productsUrlArg
  ? productsUrlArg.slice("--products-url=".length)
  : PRODUCTS_URL_DEFAULT;

// ─── Types ──────────────────────────────────────────────────────────

interface ProductRow {
  productId: string;
  name: string;
  category: string | null;
  subcategory: string | null;
}

interface Chapter {
  label: string;
  startSec: number;
  endSec: number;
}

interface MatchedProduct {
  productId: string;
  productName: string;
  confidence: number;
}

interface VideoEntry {
  videoId: string;
  title: string;
  duration: number;
  thumbnailUrl: string;
  description: string;
  publishedAt: string | null;
  chapters: Chapter[];
  matchedProducts: MatchedProduct[];
}

interface UnmatchedEntry {
  videoId: string;
  title: string;
  reason: string;
}

// ─── yt-dlp runners ─────────────────────────────────────────────────

function runYtDlp(args: string[], opts: { captureStdout?: boolean } = {}): {
  stdout: string;
  stderr: string;
  code: number;
} {
  const res = spawnSync("yt-dlp", args, {
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024,
  });
  if (res.error) {
    throw res.error;
  }
  return {
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    code: typeof res.status === "number" ? res.status : -1,
  };
}

function scrapePlaylistFlat(): Array<Record<string, any>> {
  if (SKIP_SCRAPE && fs.existsSync(JSONL_CACHE)) {
    const txt = fs.readFileSync(JSONL_CACHE, "utf8");
    return txt.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  }
  console.log(`scraping playlist flat metadata: ${PLAYLIST_URL}`);
  const r = runYtDlp([
    "--flat-playlist",
    "--dump-json",
    "--no-warnings",
    PLAYLIST_URL,
  ]);
  if (r.code !== 0) {
    throw new Error(`yt-dlp --flat-playlist failed (${r.code}): ${r.stderr}`);
  }
  fs.writeFileSync(JSONL_CACHE, r.stdout);
  return r.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function fetchDescription(videoId: string): string {
  fs.mkdirSync(DESC_CACHE_DIR, { recursive: true });
  const cachePath = path.join(DESC_CACHE_DIR, `${videoId}.txt`);
  if (SKIP_SCRAPE && fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, "utf8");
  }
  const r = runYtDlp([
    "--skip-download",
    "--get-description",
    "--no-warnings",
    `https://www.youtube.com/watch?v=${videoId}`,
  ]);
  // yt-dlp may print an empty description on private/age-gated videos — don't
  // throw, just record as empty so the pipeline keeps moving.
  const out = r.code === 0 ? r.stdout.trimEnd() : "";
  fs.writeFileSync(cachePath, out);
  return out;
}

// ─── Chapter parser ─────────────────────────────────────────────────
// A-SAFE install-video descriptions use the standard YouTube chapter
// convention: one `MM:SS Label` or `HH:MM:SS Label` per line, with the
// first chapter at 00:00. Anything not matching that shape we ignore.

function parseChapters(description: string, durationSec: number): Chapter[] {
  const lines = description.split(/\r?\n/);
  const re = /^\s*(\d{1,2}:\d{2}(?::\d{2})?)\s+(.{2,})$/;
  const stamps: Array<{ start: number; label: string }> = [];
  for (const l of lines) {
    const m = l.match(re);
    if (!m) continue;
    const ts = m[1];
    const parts = ts.split(":").map((n) => parseInt(n, 10));
    let secs = 0;
    if (parts.length === 2) secs = parts[0] * 60 + parts[1];
    else if (parts.length === 3) secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
    stamps.push({ start: secs, label: m[2].trim() });
  }
  if (stamps.length < 2) return []; // YT chapter parser needs ≥ 2
  if (stamps[0].start !== 0) return []; // must start at 00:00
  stamps.sort((a, b) => a.start - b.start);
  const chapters: Chapter[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const end =
      i + 1 < stamps.length ? stamps[i + 1].start : durationSec || stamps[i].start;
    chapters.push({
      label: stamps[i].label,
      startSec: stamps[i].start,
      endSec: end,
    });
  }
  return chapters;
}

// ─── Product fetch ──────────────────────────────────────────────────

async function fetchProducts(): Promise<ProductRow[]> {
  console.log(`fetching products from ${PRODUCTS_URL}`);
  const res = await fetch(PRODUCTS_URL, {
    headers: { "User-Agent": "Mozilla/5.0 asafe-install-videos-scraper" },
  });
  if (!res.ok) {
    throw new Error(`products fetch failed ${res.status}`);
  }
  const rows = (await res.json()) as any[];
  return rows.map((r) => ({
    productId: r.productId || r.id,
    name: r.name,
    category: r.category ?? null,
    subcategory: r.subcategory ?? null,
  }));
}

// ─── Matcher ────────────────────────────────────────────────────────
// Builds a canonical-keyed index of every product, then for each video
// title runs matchByNameVariants on a small set of candidate phrases
// mined from the title. The `conservative-stripped` match flag tells us
// whether the hit came from normalise-canonical (=1.0) or one of the
// fallback variants (=0.8). Substring-contains is the last resort =0.5.
// Family-keyword fallback (0.6) is applied AFTER per-product matching
// only when no product matched — so a specific hit always wins.

const FAMILY_KEYWORDS: Array<{ keyword: string; category: string; label: string }> = [
  { keyword: "bollard", category: "bollards", label: "All bollards" },
  {
    keyword: "pedestrian",
    category: "pedestrian-guardrails",
    label: "Pedestrian barriers",
  },
  {
    keyword: "traffic",
    category: "traffic-guardrails",
    label: "Traffic barriers",
  },
  { keyword: "rack", category: "rack-protection", label: "Rack protection" },
  {
    keyword: "column",
    category: "column-protection",
    label: "Column protection",
  },
  { keyword: "gate", category: "gates", label: "Gates" },
  {
    keyword: "height restrictor",
    category: "height-restrictors",
    label: "Height restrictors",
  },
  { keyword: "kerb", category: "kerb-barriers", label: "Kerb barriers" },
  { keyword: "topple", category: "topple-barriers", label: "Topple barriers" },
];

// Candidate phrases to try from a title. The title shape is usually
// "A-SAFE | Installation of <product-phrase>" or "How to install <product-phrase>"
// or "<product-phrase> Installation Video". We mine a handful of variations
// because product names in the YT titles add words like "Safety" and "Barrier"
// that the DB rows don't always include.
function extractCandidatePhrases(rawTitle: string): string[] {
  const candidates = new Set<string>();
  let t = rawTitle;

  // Strip leading A-SAFE marker + separators.
  t = t.replace(/^a-?safe\s*\|\s*/i, "").trim();
  t = t.replace(/^a-?safe\s+/i, "").trim();

  // Strip "Installation of" / "How to install" / trailing "Installation Video".
  t = t.replace(/^installation of\s+/i, "").trim();
  t = t.replace(/^how to install\s+/i, "").trim();
  t = t.replace(/\s+installation video\s*$/i, "").trim();
  t = t.replace(/\s+installation\s*$/i, "").trim();
  t = t.replace(/\s*install\s*$/i, "").trim();
  t = t.replace(/\s+install\s+instructions.*$/i, "").trim();

  // Strip trailing ", install instructions" fragments.
  t = t.replace(/,\s*install.*$/i, "").trim();

  candidates.add(t);

  // Drop the trailing "Safety Barrier" / "Safety Barrier+" — product rows use
  // just "Traffic" / "Traffic+" for these.
  candidates.add(t.replace(/\s+safety barrier\+?\s*$/i, "").trim());
  candidates.add(t.replace(/\s+safety barrier\+?/gi, "").trim());

  // Drop trailing "Barrier" / "Barrier+" on their own (so "iFlex Single
  // Traffic Barrier+" → "iFlex Single Traffic+" — matches DB).
  candidates.add(t.replace(/\s+barrier\+/i, "+").trim());
  candidates.add(t.replace(/\s+barrier\s*$/i, "").trim());

  // Drop trailing "Installation Guide" fragment.
  candidates.add(t.replace(/\s+installation guide\s*$/i, "").trim());

  // Replace "Safety Barrier" with "" and also try the raw form.
  candidates.add(t.replace(/\s*safety\s*/gi, " ").replace(/\s{2,}/g, " ").trim());

  // Drop ", Airport" style suffixes after a comma.
  candidates.add(t.split(",")[0].trim());

  // Finally: split on " + " and " with " — some titles list two products
  // (e.g. "iFlex Single RackEnd Safety Barrier with iFlex ForkGuard"). We
  // record each side as its own candidate AND keep the joint phrase, so a
  // hit on either will register.
  if (/\bwith\b/i.test(t)) {
    const parts = t.split(/\s+with\s+/i);
    parts.forEach((p) => candidates.add(p.trim()));
  }
  if (t.includes(" + ")) {
    const parts = t.split(" + ");
    parts.forEach((p) => candidates.add(p.trim()));
  }

  // Normalise "RackEnd" → "Rack End" — DB uses the latter.
  // Normalise "iFlexRail" → "iFlex Rail" — DB uses the spaced form.
  // Normalise "Rackguard" → "RackGuard" — DB is camelCased.
  for (const c of Array.from(candidates)) {
    let rewritten = c.replace(/rackend/gi, "Rack End");
    rewritten = rewritten.replace(/iflexrail/gi, "iFlex Rail");
    rewritten = rewritten.replace(/rackguard/gi, "RackGuard");
    if (rewritten !== c) candidates.add(rewritten);
  }

  // Extra: if title contains "Monoplex" without a size, add just "Monoplex"
  // as a candidate so the variant matcher's substring fallback catches
  // Monoplex 190 / 130 bollards (rather than EVERY bollard in the family).
  if (/\bmonoplex\b/i.test(t) && !/\b(130|190)\b/.test(t)) {
    candidates.add("Monoplex");
  }

  return Array.from(candidates).filter((c) => c.length >= 3);
}

function matchVideo(
  video: { id: string; title: string },
  products: ProductRow[],
  productsByCanonical: Map<string, ProductRow>,
): { matches: MatchedProduct[]; method: string } {
  const phrases = extractCandidatePhrases(video.title);
  const matchesById = new Map<string, MatchedProduct>();
  let method = "none";

  for (const phrase of phrases) {
    const canonical = normaliseCanonical(phrase);
    if (!canonical) continue;

    // Step 1: exact canonical — confidence 1.0
    const exact = productsByCanonical.get(canonical);
    if (exact) {
      if (!matchesById.has(exact.productId)) {
        matchesById.set(exact.productId, {
          productId: exact.productId,
          productName: exact.name,
          confidence: 1.0,
        });
        method = "exact-canonical";
      } else {
        matchesById.get(exact.productId)!.confidence = Math.max(
          matchesById.get(exact.productId)!.confidence,
          1.0,
        );
      }
      continue;
    }

    // Step 2: matchByNameVariants (canonical / conservative-strip / aggressive / substring)
    const hit = matchByNameVariants(phrase, productsByCanonical);
    if (hit) {
      const keyLen = canonical.length;
      const rowLen = normaliseCanonical(hit.name).length;
      // conservative-strip or aggressive hit → 0.8; pure substring → 0.5.
      const confidence =
        keyLen >= 6 && rowLen >= 6 && (keyLen < rowLen || rowLen < keyLen)
          ? 0.8
          : 0.8;
      if (!matchesById.has(hit.productId)) {
        matchesById.set(hit.productId, {
          productId: hit.productId,
          productName: hit.name,
          confidence,
        });
        method = method === "none" ? "variant" : method;
      }
      continue;
    }
  }

  // Substring fallback — if nothing matched via matchByNameVariants, try a
  // final case-insensitive .includes() on the raw title against each product
  // name. This catches cases like "130 Bollard Installation Video" vs
  // DB row "Monoplex 130 Bollard" where the canonical keys don't overlap
  // enough for the variant matcher. Confidence 0.5.
  if (matchesById.size === 0) {
    const lowerTitle = video.title.toLowerCase();
    for (const p of products) {
      const n = p.name.toLowerCase();
      if (n.length < 5) continue;
      if (lowerTitle.includes(n)) {
        if (!matchesById.has(p.productId)) {
          matchesById.set(p.productId, {
            productId: p.productId,
            productName: p.name,
            confidence: 0.5,
          });
          method = "substring";
        }
      }
    }
  }

  return { matches: Array.from(matchesById.values()), method };
}

function matchFamilyFallback(
  video: { title: string },
  products: ProductRow[],
): MatchedProduct[] {
  const lower = video.title.toLowerCase();
  const hits: MatchedProduct[] = [];
  for (const fam of FAMILY_KEYWORDS) {
    if (!lower.includes(fam.keyword)) continue;
    const inCat = products.filter(
      (p) => (p.category || "").toLowerCase() === fam.category,
    );
    if (inCat.length === 0) continue;
    for (const p of inCat) {
      if (!hits.some((h) => h.productId === p.productId)) {
        hits.push({
          productId: p.productId,
          productName: p.name,
          confidence: 0.6,
        });
      }
    }
  }
  return hits;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const flat = scrapePlaylistFlat();
  console.log(`flat metadata rows: ${flat.length}`);

  // Drop private / unavailable entries (yt-dlp flags them with title
  // "[Private video]" and duration null).
  const videos = flat.filter(
    (e) => e && e.id && typeof e.duration === "number" && e.duration > 0,
  );
  const dropped = flat.length - videos.length;
  if (dropped > 0) {
    console.warn(`dropping ${dropped} unavailable/private entries`);
  }

  const products = await fetchProducts();
  console.log(`products fetched: ${products.length}`);

  // Build canonical-keyed index for matchByNameVariants.
  const productsByCanonical = new Map<string, ProductRow>();
  for (const p of products) {
    const k = normaliseCanonical(p.name);
    if (k && !productsByCanonical.has(k)) {
      productsByCanonical.set(k, p);
    }
  }

  const videoEntries: VideoEntry[] = [];
  const unmatched: UnmatchedEntry[] = [];

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    process.stdout.write(
      `[${i + 1}/${videos.length}] ${v.id} ${v.title.slice(0, 60)}…\r`,
    );
    const desc = fetchDescription(v.id);
    const chapters = parseChapters(desc, v.duration || 0);
    const { matches } = matchVideo(
      { id: v.id, title: v.title },
      products,
      productsByCanonical,
    );

    let finalMatches = matches;
    let familyUsed = false;
    if (finalMatches.length === 0) {
      finalMatches = matchFamilyFallback({ title: v.title }, products);
      if (finalMatches.length > 0) familyUsed = true;
    }

    // Pick the best thumbnail — prefer the largest width available.
    const thumbs = Array.isArray(v.thumbnails) ? v.thumbnails : [];
    const biggest = thumbs.reduce(
      (best: any, t: any) =>
        (t.width || 0) > (best?.width || 0) ? t : best,
      thumbs[0] || null,
    );
    const thumbnailUrl =
      biggest?.url ||
      `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;

    videoEntries.push({
      videoId: v.id,
      title: v.title,
      duration: v.duration || 0,
      thumbnailUrl,
      description: desc,
      publishedAt: v.timestamp
        ? new Date(v.timestamp * 1000).toISOString()
        : v.release_timestamp
          ? new Date(v.release_timestamp * 1000).toISOString()
          : null,
      chapters,
      matchedProducts: finalMatches,
    });

    if (finalMatches.length === 0) {
      unmatched.push({
        videoId: v.id,
        title: v.title,
        reason: "No product or family keyword matched",
      });
    } else if (familyUsed) {
      // Not an unmatched — but track for reporting.
    }
  }
  process.stdout.write("\n");

  const out = {
    _meta: {
      playlistId: PLAYLIST_ID,
      playlistUrl: PLAYLIST_URL,
      scrapedAt: new Date().toISOString(),
      totalVideos: videoEntries.length,
      productsScanned: products.length,
      unmatchedCount: unmatched.length,
    },
    videos: videoEntries,
    unmatched,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`wrote ${OUT_PATH}`);

  // Summary
  const withMatch = videoEntries.filter((v) => v.matchedProducts.length > 0);
  const familyOnly = withMatch.filter((v) =>
    v.matchedProducts.every((m) => m.confidence === 0.6),
  );
  console.log(
    `summary: ${videoEntries.length} videos | ${withMatch.length} matched | ${familyOnly.length} family-only | ${unmatched.length} unmatched`,
  );
  if (unmatched.length) {
    console.log("unmatched:");
    for (const u of unmatched) console.log(`  - [${u.videoId}] ${u.title}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
