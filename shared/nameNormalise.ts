// Product-name normalisation helpers — shared by the ingest admin endpoints
// in worker/index.ts (apply-impact-corrections, sync-catalog-to-db,
// apply-master-testing, ingest-maintenance-data, ingest-groundworks,
// ingest-base-plates, upload-certificates).
//
// Every ingest endpoint needs to resolve a PDF-derived family name (e.g.
// "iFlex Single Traffic Barrier+") to a DB `products.name` (e.g.
// "iFlex Single Traffic+"). The historical pattern was to reimplement the
// same fuzzy-match inline — 5 near-identical copies that stripped tokens
// like "barrier" / "guard" / "rail" _too aggressively_. ξ (groundworks) and
// ο (base plates) both flagged false-negatives where conservative matching
// would have succeeded.
//
// We expose three helpers here:
//   - normaliseAggressive — the historical behaviour (strips filler tokens).
//     Kept as a fallback inside matchByNameVariants.
//   - normaliseCanonical  — conservative: lower-case, punctuation/whitespace
//     collapse, "+"/"plus" + CS↔"cold storage" swaps, does NOT strip fillers.
//     This is the preferred primary matching key.
//   - matchByNameVariants — tries canonical → conservative-strip-trailing →
//     aggressive → substring-contains (both directions). Returns the first
//     hit from the supplied index map, or null.
//
// Rule: the variant pipeline only ADDS matches; a name that matched under
// the old aggressive normaliser must still match (the aggressive variant
// is tried as a later step). Don't use this helper for callers that need
// strict equality — it's specifically for ingest fuzzy-match.

/**
 * Aggressive normaliser used historically — lower-cases, collapses
 * punctuation, swaps "+"/"plus" + CS/cold-storage, AND strips filler tokens
 * ("barrier", "rail", "guard", "rack end", "rackend"). Kept for backward
 * compatibility with existing callers that want the old behaviour, and used
 * as a fallback step inside matchByNameVariants.
 */
export function normaliseAggressive(name: string | null | undefined): string {
  if (!name) return "";
  let v = name.toLowerCase().trim();
  v = v.replace(/barrier\+/g, "plus").replace(/\+/g, "plus");
  if (v.startsWith("cs ")) v = v.slice(3) + " cold storage";
  for (const f of [" barrier", " rail", " guard", " rack end", " rackend"]) {
    v = v.split(f).join("");
  }
  v = v.replace(/[^a-z0-9]+/g, " ").trim();
  return v;
}

/**
 * Conservative normaliser — lower-cases, collapses punctuation / whitespace,
 * normalises "+" ↔ "plus", swaps "CS " prefix ↔ " cold storage" suffix, but
 * does NOT strip filler tokens like "barrier" / "guard" / "rail". This is
 * the preferred matching key for the canonical fuzzy-match step: it matches
 * when the PDF name and DB name differ only in case / punctuation / "+"
 * vs "plus" / cold-storage ordering, without over-matching unrelated
 * products that happen to share filler tokens.
 */
export function normaliseCanonical(name: string | null | undefined): string {
  if (!name) return "";
  let v = name.toLowerCase().trim();
  // "+" variants — handle both "barrier+" and bare "+" suffix consistently.
  v = v.replace(/barrier\+/g, "barrier plus").replace(/\+/g, " plus");
  // CS → cold storage: a "CS iFlex X" DB row and a "iFlex X Cold Storage"
  // PDF label should collapse to the same key.
  if (v.startsWith("cs ")) v = v.slice(3) + " cold storage";
  // Collapse any non-alphanumeric run to single space.
  v = v.replace(/[^a-z0-9]+/g, " ").trim();
  return v;
}

/**
 * Conservative + trailing-noise strip. Drops a single trailing filler token
 * (barrier / rail / guard) but keeps mid-string tokens intact. Catches
 * cases like:
 *   "iFlex Single Traffic Barrier" ≈ "iFlex Single Traffic"
 * without flattening
 *   "iFlex Single Traffic Barrier+" → "iFlex Single Traffic plus"
 * (the "+" swap already handles that one via normaliseCanonical).
 *
 * Exported for reuse / testing. Most callers should use matchByNameVariants.
 */
export function normaliseConservativeStripTrailing(
  name: string | null | undefined,
): string {
  const canonical = normaliseCanonical(name);
  if (!canonical) return "";
  const trailers = [
    "barrier",
    "rail",
    "guard",
    "rack end",
    "rackend",
  ];
  for (const t of trailers) {
    const suffix = " " + t;
    if (canonical.endsWith(suffix)) {
      return canonical.slice(0, canonical.length - suffix.length).trim();
    }
  }
  return canonical;
}

/**
 * Try multiple normaliser variants in order, returning the first hit from
 * the candidate map. Use this in place of `index.get(norm(needle))` at
 * ingest match sites.
 *
 * The supplied `index` is expected to be pre-built by the caller keyed by
 * `normaliseCanonical(value)` (recommended) — but callers that built
 * their index under `normaliseAggressive` will still hit on the aggressive
 * fallback step, so this helper is safe to drop in as a replacement.
 *
 * Variant order (first hit wins):
 *   1. canonical                    — "iFlex Single Traffic+" → "iflex single traffic plus"
 *   2. conservative-strip-trailing  — "iFlex Single Traffic Barrier" → "iflex single traffic"
 *   3. aggressive                   — historical filler-strip (backward compat)
 *   4. substring-contains (either)  — last resort, cheapest implementation
 *
 * Returns null if no variant yields a hit.
 *
 * Implementation note: the substring-contains step iterates the map, so
 * it's O(n) in the number of entries. For our ingest use-cases the map
 * is ~60 entries max, so this is fine.
 */
export function matchByNameVariants<T>(
  needle: string | null | undefined,
  index: Map<string, T>,
): T | null {
  if (!needle) return null;

  const variants: Array<string> = [];
  const canonical = normaliseCanonical(needle);
  if (canonical) variants.push(canonical);

  const trimmed = normaliseConservativeStripTrailing(needle);
  if (trimmed && !variants.includes(trimmed)) variants.push(trimmed);

  const aggressive = normaliseAggressive(needle);
  if (aggressive && !variants.includes(aggressive)) variants.push(aggressive);

  for (const v of variants) {
    const hit = index.get(v);
    if (hit !== undefined) return hit as T;
  }

  // Last-resort substring match: iterate keys. Only fire for keys of a
  // reasonable length (>= 6 chars) to avoid catastrophic over-matching on
  // short tokens like "cs" or "rail".
  const minLen = 6;
  const entries = Array.from(index.entries());
  for (const v of variants) {
    if (v.length < minLen) continue;
    for (const [key, value] of entries) {
      if (key.length < minLen) continue;
      if (key === v) continue; // already tried via .get()
      if (key.includes(v) || v.includes(key)) {
        return value;
      }
    }
  }

  return null;
}
