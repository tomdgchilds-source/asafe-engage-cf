/**
 * scripts/rematchInstallationVideos.ts
 *
 * One-off re-matcher that consumes the EXISTING
 * scripts/data/installation-videos.json (titles + descriptions + chapters
 * already scraped by scrapePlaylist.ts) and re-runs ONLY the matching step
 * against the live product catalog. Used after the C3 tightening of
 * matchFamilyFallback (2026-04-30) so we don't need to re-run yt-dlp on
 * the whole playlist.
 *
 * Outputs the same JSON shape so /api/admin/ingest-installation-videos
 * keeps working untouched.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  matchByNameVariants,
  normaliseCanonical,
} from "../shared/nameNormalise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IN_PATH = path.join(__dirname, "data", "installation-videos.json");
const OUT_PATH = IN_PATH; // overwrite in-place
const PRODUCTS_URL_DEFAULT =
  "https://asafe-engage.tom-d-g-childs.workers.dev/api/products?grouped=false";

const args = process.argv.slice(2);
const productsUrlArg = args.find((a) => a.startsWith("--products-url="));
const PRODUCTS_URL = productsUrlArg
  ? productsUrlArg.slice("--products-url=".length)
  : PRODUCTS_URL_DEFAULT;

interface ProductRow {
  productId: string;
  name: string;
  category: string | null;
  subcategory: string | null;
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
  chapters: Array<{ label: string; startSec: number; endSec: number }>;
  matchedProducts: MatchedProduct[];
}

interface UnmatchedEntry {
  videoId: string;
  title: string;
  reason: string;
}

// ─── Family keywords — kept in lockstep with scrapePlaylist.ts ───────────
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

function extractCandidatePhrases(rawTitle: string): string[] {
  const candidates = new Set<string>();
  let t = rawTitle;
  t = t.replace(/^a-?safe\s*\|\s*/i, "").trim();
  t = t.replace(/^a-?safe\s+/i, "").trim();
  t = t.replace(/^installation of\s+/i, "").trim();
  t = t.replace(/^how to install\s+/i, "").trim();
  t = t.replace(/\s+installation video\s*$/i, "").trim();
  t = t.replace(/\s+installation\s*$/i, "").trim();
  t = t.replace(/\s*install\s*$/i, "").trim();
  t = t.replace(/\s+install\s+instructions.*$/i, "").trim();
  t = t.replace(/,\s*install.*$/i, "").trim();
  candidates.add(t);
  candidates.add(t.replace(/\s+safety barrier\+?\s*$/i, "").trim());
  candidates.add(t.replace(/\s+safety barrier\+?/gi, "").trim());
  candidates.add(t.replace(/\s+barrier\+/i, "+").trim());
  candidates.add(t.replace(/\s+barrier\s*$/i, "").trim());
  candidates.add(t.replace(/\s+installation guide\s*$/i, "").trim());
  candidates.add(t.replace(/\s*safety\s*/gi, " ").replace(/\s{2,}/g, " ").trim());
  candidates.add(t.split(",")[0].trim());
  if (/\bwith\b/i.test(t)) {
    const parts = t.split(/\s+with\s+/i);
    parts.forEach((p) => candidates.add(p.trim()));
  }
  if (t.includes(" + ")) {
    const parts = t.split(" + ");
    parts.forEach((p) => candidates.add(p.trim()));
  }
  for (const c of Array.from(candidates)) {
    let rewritten = c.replace(/rackend/gi, "Rack End");
    rewritten = rewritten.replace(/iflexrail/gi, "iFlex Rail");
    rewritten = rewritten.replace(/rackguard/gi, "RackGuard");
    if (rewritten !== c) candidates.add(rewritten);
  }
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
    const exact = productsByCanonical.get(canonical);
    if (exact) {
      if (!matchesById.has(exact.productId)) {
        matchesById.set(exact.productId, {
          productId: exact.productId,
          productName: exact.name,
          confidence: 1.0,
        });
        method = "exact-canonical";
      }
      continue;
    }
    const hit = matchByNameVariants(phrase, productsByCanonical);
    if (hit) {
      if (!matchesById.has(hit.productId)) {
        matchesById.set(hit.productId, {
          productId: hit.productId,
          productName: hit.name,
          confidence: 0.8,
        });
        method = method === "none" ? "variant" : method;
      }
      continue;
    }
  }

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

/**
 * Tightened family-keyword fallback — see scrapePlaylist.ts for the long
 * docstring. Identical logic, copied here so this one-off re-matcher
 * doesn't have to import a script that loads its own __dirname.
 */
function matchFamilyFallback(
  video: { title: string },
  products: ProductRow[],
): MatchedProduct[] {
  const lower = video.title.toLowerCase();
  if (/\bdock\s+gate\b/.test(lower)) {
    return [];
  }
  type FamHit = (typeof FAMILY_KEYWORDS)[number] & { firstIdx: number };
  const presentFamilies: FamHit[] = [];
  for (const fam of FAMILY_KEYWORDS) {
    const idx = lower.indexOf(fam.keyword);
    if (idx < 0) continue;
    presentFamilies.push({ ...fam, firstIdx: idx });
  }
  if (presentFamilies.length === 0) return [];
  presentFamilies.sort((a, b) => {
    if (a.firstIdx !== b.firstIdx) return a.firstIdx - b.firstIdx;
    return (
      FAMILY_KEYWORDS.indexOf(a as any) - FAMILY_KEYWORDS.indexOf(b as any)
    );
  });
  const winner = presentFamilies[0];
  const inCat = products.filter(
    (p) => (p.category || "").toLowerCase() === winner.category,
  );
  if (inCat.length === 0) return [];
  const hits: MatchedProduct[] = [];
  for (const p of inCat) {
    if (!hits.some((h) => h.productId === p.productId)) {
      hits.push({
        productId: p.productId,
        productName: p.name,
        confidence: 0.6,
      });
    }
  }
  return hits;
}

async function fetchProducts(): Promise<ProductRow[]> {
  console.log(`fetching products from ${PRODUCTS_URL}`);
  const res = await fetch(PRODUCTS_URL, {
    headers: { "User-Agent": "Mozilla/5.0 asafe-rematch" },
  });
  if (!res.ok) throw new Error(`products fetch failed ${res.status}`);
  const rows = (await res.json()) as any[];
  return rows.map((r) => ({
    productId: r.productId || r.id,
    name: r.name,
    category: r.category ?? null,
    subcategory: r.subcategory ?? null,
  }));
}

async function main(): Promise<void> {
  if (!fs.existsSync(IN_PATH)) {
    throw new Error(`input not found: ${IN_PATH}`);
  }
  const before = JSON.parse(fs.readFileSync(IN_PATH, "utf8")) as {
    _meta: any;
    videos: VideoEntry[];
    unmatched: UnmatchedEntry[];
  };

  const products = await fetchProducts();
  console.log(`products fetched: ${products.length}`);
  const productsByCanonical = new Map<string, ProductRow>();
  for (const p of products) {
    const k = normaliseCanonical(p.name);
    if (k && !productsByCanonical.has(k)) productsByCanonical.set(k, p);
  }

  const beforeEdgeCount = before.videos.reduce(
    (n, v) => n + v.matchedProducts.length,
    0,
  );
  const beforeFamilyOnly = before.videos.filter((v) =>
    v.matchedProducts.every((m) => m.confidence === 0.6),
  ).length;
  const beforeUnmatched = before.unmatched.length;

  // Re-run matching for every video. Per-product matches recompute identically
  // (we haven't changed matchVideo); family-fallback runs through the new
  // tightened logic.
  const videosOut: VideoEntry[] = [];
  const unmatchedOut: UnmatchedEntry[] = [];
  let familyOnlyCount = 0;

  for (const v of before.videos) {
    const { matches } = matchVideo(
      { id: v.videoId, title: v.title },
      products,
      productsByCanonical,
    );
    let finalMatches = matches;
    let familyUsed = false;
    if (finalMatches.length === 0) {
      finalMatches = matchFamilyFallback({ title: v.title }, products);
      if (finalMatches.length > 0) familyUsed = true;
    }
    if (familyUsed) familyOnlyCount += 1;
    videosOut.push({ ...v, matchedProducts: finalMatches });
    if (finalMatches.length === 0) {
      unmatchedOut.push({
        videoId: v.videoId,
        title: v.title,
        reason: "No product or family keyword matched",
      });
    }
  }

  // Carry over previously-unmatched entries that aren't in videosOut
  // (defensive — in practice every videoId is in `videos[]` already).
  const seenIds = new Set(videosOut.map((v) => v.videoId));
  for (const u of before.unmatched) {
    if (!seenIds.has(u.videoId) && !unmatchedOut.some((x) => x.videoId === u.videoId)) {
      unmatchedOut.push(u);
    }
  }

  const afterEdgeCount = videosOut.reduce(
    (n, v) => n + v.matchedProducts.length,
    0,
  );

  const out = {
    _meta: {
      ...(before._meta || {}),
      rematchedAt: new Date().toISOString(),
      productsScanned: products.length,
      totalVideos: videosOut.length,
      unmatchedCount: unmatchedOut.length,
      // Reporting fields — surfaced into the ingest endpoint response for
      // before/after evidence on the C3 tightening.
      notMatchedNoFamilyEdge: unmatchedOut.length,
      familyOnlyCount,
    },
    videos: videosOut,
    unmatched: unmatchedOut,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`wrote ${OUT_PATH}`);
  console.log(
    `before: ${beforeEdgeCount} product↔video edges | ${beforeFamilyOnly} family-only | ${beforeUnmatched} unmatched`,
  );
  console.log(
    `after:  ${afterEdgeCount} product↔video edges | ${familyOnlyCount} family-only | ${unmatchedOut.length} unmatched (notMatchedNoFamilyEdge)`,
  );

  // Highlight which videos were over-attached and are now narrower.
  const beforeById = new Map(before.videos.map((v) => [v.videoId, v]));
  for (const v of videosOut) {
    const b = beforeById.get(v.videoId);
    if (!b) continue;
    if (b.matchedProducts.length > v.matchedProducts.length) {
      console.log(
        `narrowed: [${v.videoId}] "${v.title}" — ${b.matchedProducts.length} → ${v.matchedProducts.length} edges`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
