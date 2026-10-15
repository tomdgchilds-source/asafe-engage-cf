// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/fonts.ts
//
// Brand typography for the PDF renderer.
//
// The brand face is Graphik, which A-SAFE has not licensed for embedding.
// Inter (SIL OFL 1.1, Rasmus Andersson) is the approved substitute: a
// grotesque with near-identical proportions, cap height (0.727 em vs
// Helvetica's 0.72) and weight range. The three static TTFs live in R2 at
// `brand/fonts/Inter-{Regular,SemiBold,Bold}.ttf` (uploaded by
// scripts/uploadBrandFonts.ts) — never in git and never base64'd into the
// Worker bundle, which would add ~1.6 MB to every cold start.
//
//   loadBrandFonts(pdf, env?)  → { regular, semibold, bold, brand }
//                                 Inter embedded as subsets when the TTFs
//                                 can be read; Helvetica / Helvetica-Bold
//                                 (with a console.warn) when they cannot,
//                                 or when no env is given (tests, scripts).
//   isBrandFont(font)          → true for an Inter PDFFont
//   hasGlyph(font, codePoint)  → coverage check used by text.ts so the
//                                 WinAnsi sanitiser only runs for Helvetica.
//
// The TTF bytes (and a parsed fontkit Font for coverage checks) are fetched
// once per isolate and cached at module level; a failed fetch is not cached
// so the next document retries.
// ────────────────────────────────────────────────────────────────────────────

import fontkit from "@pdf-lib/fontkit";
import { StandardFonts, type PDFDocument, type PDFFont } from "pdf-lib";
import type { Env } from "../../types";
import { fetchObjectBytes } from "./images";

export type BrandWeight = "regular" | "semibold" | "bold";

/** The slice of the Worker env the font loader needs (R2 direct, KV fallback). */
export type FontEnv = Pick<Env, "R2_BUCKET" | "FILES_STORE">;

/** R2 / FILES_STORE keys of the three static TTFs. */
export const BRAND_FONT_KEYS: Readonly<Record<BrandWeight, string>> = {
  regular: "brand/fonts/Inter-Regular.ttf",
  semibold: "brand/fonts/Inter-SemiBold.ttf",
  bold: "brand/fonts/Inter-Bold.ttf",
};

const WEIGHTS: readonly BrandWeight[] = ["regular", "semibold", "bold"];

/** A static TTF is ~410 KB; anything much bigger is not the file we uploaded. */
const MAX_FONT_BYTES = 2_000_000;

export interface DocFonts {
  /** Body copy. Inter Regular, or Helvetica. */
  regular: PDFFont;
  /** Labels and table heads. Inter SemiBold, or Helvetica-Bold. */
  semibold: PDFFont;
  /** Headings, KPI figures, the DRAFT watermark. Inter Bold, or Helvetica-Bold. */
  bold: PDFFont;
  /** True when Inter is embedded; false on the Helvetica fallback. */
  brand: boolean;
}

type FontkitFont = ReturnType<typeof fontkit.create>;

interface BrandFontFile {
  bytes: Uint8Array;
  /** Parsed once for `hasGlyphForCodePoint`; pdf-lib parses its own copy. */
  parsed: FontkitFont;
}

type BrandFontFiles = Record<BrandWeight, BrandFontFile>;

let filesPromise: Promise<BrandFontFiles | null> | null = null;

/** Parsed fontkit face for every Inter PDFFont we have embedded (any document). */
const COVERAGE = new WeakMap<PDFFont, FontkitFont>();

async function fetchBrandFontFiles(env: FontEnv): Promise<BrandFontFiles | null> {
  const results = await Promise.all(
    WEIGHTS.map(async (weight) => {
      const key = BRAND_FONT_KEYS[weight];
      // fetchObjectBytes only touches R2_BUCKET / FILES_STORE; the cast keeps
      // callers (and tests) from having to build a full Env.
      const bytes = await fetchObjectBytes(env as Env, key, { maxBytes: MAX_FONT_BYTES });
      return [weight, key, bytes] as const;
    }),
  );
  const missing = results.filter(([, , bytes]) => !bytes).map(([, key]) => key);
  if (missing.length > 0) {
    console.warn(`[pdf/fonts] brand fonts unavailable (${missing.join(", ")}); falling back to Helvetica`);
    return null;
  }
  const files = {} as BrandFontFiles;
  for (const [weight, key, bytes] of results) {
    try {
      files[weight] = { bytes: bytes!, parsed: fontkit.create(bytes!) };
    } catch (err) {
      console.warn(`[pdf/fonts] ${key} is not a usable TrueType file; falling back to Helvetica`, err);
      return null;
    }
  }
  return files;
}

/**
 * The Inter TTFs, fetched once per isolate. Resolves null (after a
 * console.warn) when any of the three cannot be read; that outcome is not
 * cached, so a transient R2 error only affects the current document.
 */
export function loadBrandFontFiles(env: FontEnv): Promise<BrandFontFiles | null> {
  if (!filesPromise) {
    filesPromise = fetchBrandFontFiles(env).then(
      (files) => {
        if (!files) filesPromise = null;
        return files;
      },
      (err: unknown) => {
        filesPromise = null;
        console.warn("[pdf/fonts] brand font fetch failed; falling back to Helvetica", err);
        return null;
      },
    );
  }
  return filesPromise;
}

/** Helvetica / Helvetica-Bold from pdf-lib's built-in standard 14. Never fails. */
export async function embedStandardFonts(pdf: PDFDocument): Promise<DocFonts> {
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  return { regular, semibold: bold, bold, brand: false };
}

/**
 * Embed the brand fonts into `pdf`. With an env whose store holds the Inter
 * TTFs this returns subset-embedded Inter Regular / SemiBold / Bold; without
 * an env, or when any fetch or embed fails, Helvetica / Helvetica-Bold.
 */
export async function loadBrandFonts(pdf: PDFDocument, env?: FontEnv): Promise<DocFonts> {
  const files = env ? await loadBrandFontFiles(env) : null;
  if (!files) return embedStandardFonts(pdf);
  try {
    pdf.registerFontkit(fontkit);
    const [regular, semibold, bold] = await Promise.all(
      WEIGHTS.map((weight) => pdf.embedFont(files[weight].bytes, { subset: true })),
    );
    COVERAGE.set(regular, files.regular.parsed);
    COVERAGE.set(semibold, files.semibold.parsed);
    COVERAGE.set(bold, files.bold.parsed);
    return { regular, semibold, bold, brand: true };
  } catch (err) {
    console.warn("[pdf/fonts] embedding Inter failed; falling back to Helvetica", err);
    return embedStandardFonts(pdf);
  }
}

/** True when `font` is one of the embedded Inter faces (so full Unicode text is safe). */
export function isBrandFont(font: PDFFont): boolean {
  return COVERAGE.has(font);
}

/** Whether an embedded brand font has a glyph for `codePoint`. False for standard fonts. */
export function hasGlyph(font: PDFFont, codePoint: number): boolean {
  const parsed = COVERAGE.get(font);
  return parsed ? parsed.hasGlyphForCodePoint(codePoint) : false;
}

/** Test hook: forget the per-isolate TTF cache so the next load fetches again. */
export function resetBrandFontCache(): void {
  filesPromise = null;
}
