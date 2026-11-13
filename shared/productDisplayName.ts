// ────────────────────────────────────────────────────────────────────────────
// shared/productDisplayName.ts
//
// What a customer reads for a catalogue product, where the stored name is
// too bare to stand alone on a cart line or a proposal.
//
// The iFlex 190 bollards are stored as "Bollard, Yellow" / "Bollard, Grey"
// (each holding priced sub-sizes: 190 OD x 835 mm, 190 OD x 1200 mm,
// 210 OD x 1200 mm) and "iFlex 190 Bollard - 2m". A cart line keeps the row
// name as `productName` and the picked size as `selectedVariant`; together
// they read as one product line:
//
//   "Bollard, Yellow" + 190 OD x 1200 mm  → "iFlex 190 Bollard, 1.2 m, Yellow"
//   "Bollard, Yellow" + 190 OD x 835 mm   → "iFlex 190 Bollard, 835 mm, Yellow"
//   "Bollard, Grey"   + 210 OD x 1200 mm  → "iFlex 190 Bollard, 1.2 m, 210 OD, Grey"
//   "Bollard, Yellow" (no size recorded)  → "iFlex 190 Bollard, Yellow"
//   "iFlex 190 Bollard - 2m"              → "iFlex 190 Bollard, 2 m"
//
// The size comes from the variant's own height / OD (never a per-SKU table),
// so any other row with sub-sizes reads "<row name>, <height>, <OD> OD".
//
// DISPLAY ONLY. The stored name is the key for pricing, product lookups and
// cart rows — never write the result of this function back, and never look
// anything up with it. Only an exact row name is rewritten: a longer legacy
// line such as "Bollard, Grey - 210 OD x 1200 mm" already says what it is.
// ────────────────────────────────────────────────────────────────────────────

import { formatHeightMm } from "./productOptions";

const IFLEX_190 = "iFlex 190 Bollard";

const BARE_BOLLARD_RE = /^Bollard,\s*(Yellow|Grey)$/i;
const IFLEX_190_HEIGHT_RE = /^iFlex 190 Bollard\s*[-–]\s*(\d+(?:\.\d+)?)\s*m$/i;

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** The parts of a cart line's `selectedVariant` this helper reads. */
export interface DisplayVariant {
  /** Stored name of the row the sub-size belongs to; must equal the line's productName. */
  parentName?: string | null;
  name?: string | null;
  variant?: string | null;
  heightMm?: number | string | null;
  height_mm?: number | string | null;
  odMm?: number | string | null;
  od_mm?: number | string | null;
}

const positive = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Height and OD of a sub-size, from its fields or its "190 OD x 1200 mm" name. */
function subSizeOf(name: string, variant: unknown): { heightMm: number | null; odMm: number | null } | null {
  let v: unknown = variant;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const sv = v as DisplayVariant;
  // Only a variant recorded as a sub-size OF THIS ROW changes the name; a
  // length or tier variant on any other line is left alone.
  if (typeof sv.parentName !== "string" || sv.parentName.trim() !== name) return null;
  const label = String(sv.name ?? sv.variant ?? "");
  const heightFromName = /x\s*(\d{3,4})\s*mm\b/i.exec(label);
  const odFromName = /\b(\d{2,3})\s*OD\b/i.exec(label);
  const heightMm = positive(sv.heightMm ?? sv.height_mm) ?? (heightFromName ? Number(heightFromName[1]) : null);
  const odMm = positive(sv.odMm ?? sv.od_mm) ?? (odFromName ? Number(odFromName[1]) : null);
  return heightMm === null && odMm === null ? null : { heightMm, odMm };
}

/**
 * Customer-facing name for a stored product name, optionally with the cart
 * line's `selectedVariant`. Unchanged unless described above.
 */
export function productDisplayName(name: string | null | undefined, selectedVariant?: unknown): string {
  const raw = String(name ?? "");
  const trimmed = raw.trim();
  const sub = subSizeOf(trimmed, selectedVariant);
  const size = (base: string) => [
    sub?.heightMm ? formatHeightMm(sub.heightMm) : null,
    // The OD is part of the size unless the product name already states it
    // ("iFlex 190 Bollard" is the 190 OD; the 210 OD one must say so).
    sub?.odMm && !new RegExp(`\\b${sub.odMm}\\b`).test(base) ? `${sub.odMm} OD` : null,
  ];

  const bare = BARE_BOLLARD_RE.exec(trimmed);
  if (bare) return [IFLEX_190, ...size(IFLEX_190), titleCase(bare[1])].filter(Boolean).join(", ");

  const height = IFLEX_190_HEIGHT_RE.exec(trimmed);
  if (height) return `${IFLEX_190}, ${parseFloat(height[1])} m`;

  if (sub) return [trimmed, ...size(trimmed)].filter(Boolean).join(", ");

  return raw;
}
