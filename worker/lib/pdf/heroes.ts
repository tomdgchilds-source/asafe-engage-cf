// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/heroes.ts
//
// Real A-SAFE reference photography for covers, section dividers, share
// pages and the FAQ sheet. Every image comes from a published `case_studies`
// row (webcdn.asafe.com photographs of actual installations: Heineken,
// Heathrow, DHL, BMW …). Nothing in this module can produce synthetic bytes:
// when no case study has a usable image the picker returns null and the
// caller falls back to the plain black cover field.
//
//   pickHeroImage(env, ctx)  → { bytes, caption, sourceUrl, client, industry }
//   pickHeroUrl(env, ctx)    → { url, caption, client, industry } (no fetch;
//                              for the public /api/brand/hero endpoint)
//   resolveHeroIndustries()  → ranked case-study industries for a context
//                              (pure; exported for tests)
//
// Captions always name the client and industry so a reader can see it is an
// A-SAFE reference installation, never the customer's own site.
// Rows and image bytes are cached per isolate.
// ────────────────────────────────────────────────────────────────────────────

import type { Env } from "../../types";
import { getDb } from "../../db";
import { createStorage } from "../../storage";
import { fetchImageBytes, sniffImage } from "./images";

/** The `case_studies.industry` values in the catalogue, as stored. */
export const CASE_STUDY_INDUSTRIES = {
  logistics: "Warehousing & Logistics",
  food: "Food & Beverage",
  automotive: "automotive",
  airports: "airports",
  manufacturing: "manufacturing",
  recycling: "recycling-packaging",
  parking: "parking-lot",
  multiple: "multiple",
} as const;

export type CaseStudyIndustry = (typeof CASE_STUDY_INDUSTRIES)[keyof typeof CASE_STUDY_INDUSTRIES];

/** Human form of a stored industry value for captions ("automotive manufacturing"). */
export const INDUSTRY_LABELS: Record<string, string> = {
  "Warehousing & Logistics": "warehousing & logistics",
  "Food & Beverage": "food & beverage",
  automotive: "automotive manufacturing",
  airports: "airports",
  manufacturing: "manufacturing",
  "recycling-packaging": "recycling & packaging",
  "parking-lot": "parking",
  multiple: "multi-site",
};

export const DEFAULT_HERO_INDUSTRY: CaseStudyIndustry = CASE_STUDY_INDUSTRIES.logistics;

/**
 * Keyword → ranked case-study industries. The first entry is the best
 * match; later entries are the nearest substitutes when the catalogue has
 * no photo for it (there are no "manufacturing" or "parking-lot" case
 * studies today, so those lean on automotive plants and logistics sites).
 * Keys are matched as whole words, case-insensitively, against the
 * customer's industry, facility type, survey area types and free text.
 */
const KEYWORD_RULES: ReadonlyArray<{ pattern: RegExp; industries: CaseStudyIndustry[] }> = [
  // Airports and aviation
  { pattern: /\b(airport|airports|aviation|airside|airline|baggage|terminal|flight catering|ground handling|air cargo|cargo village)\b/i, industries: ["airports", "Warehousing & Logistics"] },
  // Food, drink and hygienic production
  { pattern: /\b(food|foods|beverage|beverages|drink|drinks|brewery|brewing|dairy|bakery|bottling|fmcg|confectioner\w*|pharma\w*|hygien\w*|cold ?store\w*|cold ?chain|catering)\b/i, industries: ["Food & Beverage", "Warehousing & Logistics"] },
  // Automotive and heavy manufacturing
  { pattern: /\b(automotive|car plant|vehicle (?:plant|assembly|manufactur\w*)|assembly (?:line|plant)|oem|tyre|tire)\b/i, industries: ["automotive", "manufacturing", "Warehousing & Logistics"] },
  { pattern: /\b(manufactur\w*|factory|factories|production|plant|industrial|engineering|machin\w*|fabrication|steel|metal\w*|processing)\b/i, industries: ["manufacturing", "automotive", "Warehousing & Logistics"] },
  // Recycling and packaging
  { pattern: /\b(recycl\w*|waste|packaging|paper|pulp|cardboard|plastics?|mrf)\b/i, industries: ["recycling-packaging", "Warehousing & Logistics"] },
  // Parking
  { pattern: /\b(parking|car ?park\w*|multi-?storey)\b/i, industries: ["parking-lot", "Warehousing & Logistics", "automotive"] },
  // Warehousing, logistics, retail, ports
  { pattern: /\b(warehous\w*|logistic\w*|distribution|3pl|freight|forward\w*|fulfil\w*|e-?commerce|retail|supply chain|courier|parcel|storage|depot|port|ports|maritime|container\w*|loading dock\w*|racking|dock\w*)\b/i, industries: ["Warehousing & Logistics"] },
];

/**
 * Survey area types (shared/applicationAreas.ts keys) that carry an
 * industry signal. Most area types are generic (columns, pedestrian
 * walkways, electrical DBs) and vote for nothing.
 */
const AREA_TYPE_RULES: ReadonlyArray<{ pattern: RegExp; industries: CaseStudyIndustry[] }> = [
  { pattern: /loading dock|racking|shutter door/i, industries: ["Warehousing & Logistics"] },
  { pattern: /cold store/i, industries: ["Food & Beverage", "Warehousing & Logistics"] },
  { pattern: /processing machine|workstation/i, industries: ["manufacturing", "automotive", "Food & Beverage"] },
];

export interface HeroContext {
  /** Customer or project industry as the app stores it (free text). */
  industry?: string | null;
  /** Facility or workplace type (warehouse, airport, factory …). */
  facilityType?: string | null;
  /** Survey area types or zone names. */
  areaTypes?: ReadonlyArray<string | null | undefined> | null;
  /** Any customer-facing free text (facility name, project title, description). */
  text?: string | null;
  /**
   * Stable tie-break so one customer always gets the same reference photo
   * across revisions (survey id, order id, share token …).
   */
  seed?: string | null;
}

export interface HeroPick {
  bytes: Uint8Array;
  /** "A-SAFE installation at Heineken, food & beverage" */
  caption: string;
  sourceUrl: string;
  client: string;
  industry: string;
  /** Case study title, for alt text and admin tooling. */
  title: string;
}

export interface HeroUrlPick {
  url: string;
  caption: string;
  client: string;
  industry: string;
  title: string;
}

/** Shape of the case-study rows the picker needs (a subset of the table). */
export interface HeroCandidate {
  id: string;
  title: string;
  industry: string;
  company: string | null;
  imageUrl: string | null;
  isPublished?: boolean | null;
  createdAt?: Date | string | null;
}

function scoreList(ranked: Map<string, number>, industries: CaseStudyIndustry[], weight: number): void {
  industries.forEach((ind, i) => {
    const pts = weight * (industries.length - i);
    ranked.set(ind, (ranked.get(ind) ?? 0) + pts);
  });
}

function matchKeywords(ranked: Map<string, number>, text: string, weight: number): void {
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(text)) scoreList(ranked, rule.industries, weight);
  }
}

/**
 * Ranked case-study industries for a context, best first. The explicit
 * industry carries most weight, then the facility type, then area types,
 * then free text. The default industry always closes the list so a
 * catalogue with any published photo yields a pick.
 */
export function resolveHeroIndustries(ctx: HeroContext = {}): CaseStudyIndustry[] {
  const ranked = new Map<string, number>();
  const direct = String(ctx.industry ?? "").trim();
  if (direct) {
    // An exact stored value (e.g. "Food & Beverage") is the strongest signal.
    const exact = (Object.values(CASE_STUDY_INDUSTRIES) as string[]).find((v) => v.toLowerCase() === direct.toLowerCase());
    if (exact) ranked.set(exact, (ranked.get(exact) ?? 0) + 100);
    matchKeywords(ranked, direct.replace(/[-_]/g, " "), 10);
  }
  const facility = String(ctx.facilityType ?? "").trim();
  if (facility) matchKeywords(ranked, facility.replace(/[-_]/g, " "), 6);
  for (const a of ctx.areaTypes ?? []) {
    const s = String(a ?? "").trim();
    if (!s) continue;
    for (const rule of AREA_TYPE_RULES) if (rule.pattern.test(s)) scoreList(ranked, rule.industries, 1);
  }
  const text = String(ctx.text ?? "").trim();
  if (text) matchKeywords(ranked, text, 2);
  const ordered = Array.from(ranked.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k as CaseStudyIndustry);
  if (!ordered.includes(DEFAULT_HERO_INDUSTRY)) ordered.push(DEFAULT_HERO_INDUSTRY);
  return ordered;
}

/** FNV-1a over a string; used only to spread ties deterministically. */
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const ALLOWED_IMAGE_HOST = /^https:\/\/(webcdn\.asafe\.com|www\.asafe\.com|asafe\.com)\//i;

function usable(c: HeroCandidate): boolean {
  return !!c.imageUrl && ALLOWED_IMAGE_HOST.test(c.imageUrl) && c.isPublished !== false;
}

/**
 * Choose the best case study for a context: highest-ranked industry first;
 * within one industry the seed picks a stable member, else the newest row.
 * Pure — exported so tests can run it on fixtures.
 */
export function chooseHeroCandidate(rows: ReadonlyArray<HeroCandidate>, ctx: HeroContext = {}): HeroCandidate | null {
  const pool = rows.filter(usable);
  if (!pool.length) return null;
  const ranking = resolveHeroIndustries(ctx);
  for (const industry of ranking) {
    const group = pool.filter((r) => r.industry.toLowerCase() === industry.toLowerCase());
    if (!group.length) continue;
    return pickFromGroup(group, ctx.seed);
  }
  // Catalogue has photos but none in a ranked industry: any published photo
  // is still a real A-SAFE installation.
  return pickFromGroup(pool, ctx.seed);
}

function pickFromGroup(group: HeroCandidate[], seed: string | null | undefined): HeroCandidate {
  const sorted = [...group].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta || a.id.localeCompare(b.id);
  });
  if (!seed) return sorted[0];
  return sorted[hashSeed(seed) % sorted.length];
}

export function industryLabel(industry: string): string {
  return INDUSTRY_LABELS[industry] ?? industry.replace(/[-_]/g, " ").toLowerCase();
}

export function heroCaption(c: Pick<HeroCandidate, "company" | "industry" | "title">): string {
  const client = (c.company ?? "").trim() || c.title;
  return `A-SAFE installation at ${client}, ${industryLabel(c.industry)}`;
}

/** The caption covers carry: explicit that the photo is not the client's site. */
export function referenceCaption(pick: Pick<HeroPick, "caption">): string {
  return `Reference photograph — ${pick.caption}. Not the client's site.`;
}

// ─── Per-isolate caches ────────────────────────────────────────────────────

const ROWS_TTL_MS = 10 * 60 * 1000;
let rowsCache: { at: number; rows: HeroCandidate[] } | null = null;
let rowsInflight: Promise<HeroCandidate[]> | null = null;

const BYTES_CACHE_MAX = 12;
const bytesCache = new Map<string, Promise<Uint8Array | null>>();

/** Test hook: forget cached rows and bytes. */
export function resetHeroCache(): void {
  rowsCache = null;
  rowsInflight = null;
  bytesCache.clear();
}

/** Test hook: seed the row cache so unit tests never touch a database. */
export function primeHeroRows(rows: HeroCandidate[]): void {
  rowsCache = { at: Date.now(), rows };
}

async function loadRows(env: Env): Promise<HeroCandidate[]> {
  if (rowsCache && Date.now() - rowsCache.at < ROWS_TTL_MS) return rowsCache.rows;
  if (rowsInflight) return rowsInflight;
  rowsInflight = (async () => {
    try {
      if (!env.DATABASE_URL) return rowsCache?.rows ?? [];
      const storage = createStorage(getDb(env.DATABASE_URL));
      const rows = (await storage.getCaseStudies()) as HeroCandidate[];
      const out = rows.map((r) => ({
        id: r.id,
        title: r.title,
        industry: r.industry,
        company: r.company ?? null,
        imageUrl: r.imageUrl ?? null,
        isPublished: r.isPublished,
        createdAt: r.createdAt ?? null,
      }));
      rowsCache = { at: Date.now(), rows: out };
      return out;
    } catch (err) {
      console.warn("[heroes] case-study load failed:", err);
      return rowsCache?.rows ?? [];
    } finally {
      rowsInflight = null;
    }
  })();
  return rowsInflight;
}

/**
 * Bytes for a CDN photo, JPEG / PNG only. Tries a width-limited rendition
 * first (the CDN ignores unknown query parameters, so this is safe) and
 * falls back to the original. Null when neither is a usable image.
 */
function loadBytes(env: Env, url: string): Promise<Uint8Array | null> {
  const cached = bytesCache.get(url);
  if (cached) return cached;
  const p = (async () => {
    const sized = url.includes("?") ? `${url}&width=1800` : `${url}?width=1800`;
    for (const candidate of [sized, url]) {
      const bytes = await fetchImageBytes(env, candidate, { maxBytes: 6_000_000 });
      if (bytes) {
        const kind = sniffImage(bytes);
        if (kind === "jpeg" || kind === "png") return bytes;
      }
    }
    return null;
  })();
  if (bytesCache.size >= BYTES_CACHE_MAX) {
    const first = bytesCache.keys().next().value;
    if (first !== undefined) bytesCache.delete(first);
  }
  bytesCache.set(url, p);
  p.then((b) => {
    if (!b) bytesCache.delete(url);
  }).catch(() => bytesCache.delete(url));
  return p;
}

/** CDN URL + caption for the best reference installation; no image fetch. */
export async function pickHeroUrl(env: Env, ctx: HeroContext = {}): Promise<HeroUrlPick | null> {
  const rows = await loadRows(env);
  const c = chooseHeroCandidate(rows, ctx);
  if (!c || !c.imageUrl) return null;
  return { url: c.imageUrl, caption: heroCaption(c), client: (c.company ?? "").trim() || c.title, industry: c.industry, title: c.title };
}

/**
 * Bytes + caption for the best reference installation. Walks down the
 * ranking when a photo cannot be fetched or is not JPEG / PNG. Never throws;
 * null when the catalogue has nothing usable.
 */
export async function pickHeroImage(env: Env, ctx: HeroContext = {}): Promise<HeroPick | null> {
  try {
    const rows = await loadRows(env);
    const tried = new Set<string>();
    let remaining = rows;
    for (let i = 0; i < 6; i++) {
      const c = chooseHeroCandidate(remaining, ctx);
      if (!c || !c.imageUrl || tried.has(c.id)) return null;
      tried.add(c.id);
      const bytes = await loadBytes(env, c.imageUrl);
      if (bytes) {
        return {
          bytes,
          caption: heroCaption(c),
          sourceUrl: c.imageUrl,
          client: (c.company ?? "").trim() || c.title,
          industry: c.industry,
          title: c.title,
        };
      }
      remaining = remaining.filter((r) => r.id !== c.id);
    }
    return null;
  } catch (err) {
    console.warn("[heroes] pickHeroImage failed:", err);
    return null;
  }
}
