// shared/pas13Citations.ts
//
// Section-citation helper for PAS 13:2017. Backed by
// scripts/data/pas13-structure.json — the authoritative TOC + definitions
// extracted from the source PDF during the Level-1 ingestion pass.
//
// Consumers (rule engine σ, compliance-checker surfaces, anywhere a
// citation chip is rendered) call pas13Cite(section) or pas13Section(needle)
// and get back a fully-populated Pas13Citation that can be dropped onto a
// link. The `url` uses the PDF.js convention `#page=N` so a click jumps
// the user to the correct page in an inline PDF viewer.
//
// Wording rule: this app frames the standard as "PAS 13 aligned" — never
// "PAS 13 compliant" — to avoid any commercial-liability claim. Labels
// are phrased accordingly.

import pas13Structure from "../scripts/data/pas13-structure.json";

// ─── Types ────────────────────────────────────────────────────────────────
export interface Pas13Citation {
  /** Section id, e.g. "6.3.2" or "A" for an annex. */
  section: string;
  /** Human-readable title for the section from the TOC. */
  title: string;
  /** PDF viewer page number (1-indexed physical page) — suitable for #page=N. */
  page: number;
  /** Deep link into the R2-served PDF; opens at the correct page. */
  url: string;
  /** Compact label for inline chips: "PAS 13 §6.3.2". */
  shortLabel: string;
  /** Full label for formal references: "PAS 13:2017 §6.3.2 Kinetic energy". */
  longLabel: string;
}

export interface Pas13Definition {
  term: string;
  definition: string;
  page: number;
  /** The 3.x section the term is defined under. */
  section: string;
}

interface TocEntry {
  section: string;
  title: string;
  page: number;
}

interface StructureMeta {
  title: string;
  shortTitle: string;
  publisher: string;
  year: number;
  totalPages: number;
  sourceFile: string;
  [k: string]: unknown;
}

interface Structure {
  _meta: StructureMeta;
  tableOfContents: TocEntry[];
  definitions: Pas13Definition[];
  annexes: Array<{ letter: string; title: string; page: number; informative?: boolean }>;
}

const STRUCTURE: Structure = pas13Structure as Structure;

// Public route that streams the PDF out of R2. Mirrors the
// /api/certificates/:file pattern. Declared here (not imported from a
// constants file) so the helper has zero dependencies on worker code and
// can be safely bundled client-side.
export const PAS13_PDF_URL = "/api/standards/pas-13-2017.pdf";

// ─── Indexes (built once at module load) ──────────────────────────────────
const bySection = new Map<string, TocEntry>();
for (const entry of STRUCTURE.tableOfContents) {
  bySection.set(entry.section, entry);
  // Also index the lowercased variant so callers can pass "a" for an annex
  // letter without worrying about case.
  bySection.set(entry.section.toLowerCase(), entry);
}

// Pre-lower the TOC titles for fuzzy matching — cheaper than lowercasing
// on every pas13Section() call.
const tocLower = STRUCTURE.tableOfContents.map((e) => ({
  entry: e,
  haystack: e.title.toLowerCase(),
}));

// ─── Label formatting ─────────────────────────────────────────────────────
function sectionPrefix(section: string): string {
  // Numbered clauses use the § sign; annexes and other named entries don't.
  if (/^[0-9]/.test(section)) return `§${section}`;
  if (/^[A-Z]$/.test(section)) return `Annex ${section}`;
  // "foreword", "bibliography", "0", "0.1", "0.2" fall through unchanged
  // and get a plain section id so the label still reads naturally.
  return section;
}

function buildCitation(entry: TocEntry): Pas13Citation {
  const prefix = sectionPrefix(entry.section);
  // For annexes the stored title is "Annex A (informative) …"; strip the
  // leading "Annex A " so the long label doesn't double up.
  const titleForLabel = /^[A-Z]$/.test(entry.section)
    ? entry.title.replace(/^Annex\s+[A-Z]\s*/, "")
    : entry.title;
  return {
    section: entry.section,
    title: entry.title,
    page: entry.page,
    url: `${PAS13_PDF_URL}#page=${entry.page}`,
    shortLabel: `PAS 13 ${prefix}`,
    longLabel: `PAS 13:2017 ${prefix} ${titleForLabel}`.trim(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Return the citation for an exact section id (e.g. "6.3.2", "5.10", "A",
 * "bibliography"). Returns null if the section isn't in the TOC.
 */
export function pas13Cite(section: string): Pas13Citation | null {
  if (!section) return null;
  const trimmed = section.trim().replace(/^§/, "").replace(/^clause\s+/i, "");
  const entry = bySection.get(trimmed) || bySection.get(trimmed.toLowerCase());
  if (!entry) return null;
  return buildCitation(entry);
}

/**
 * Fuzzy lookup by TOC title. Case-insensitive substring match, picking the
 * shortest match so "pendulum" resolves to the deepest matching section
 * rather than its parent clause. Returns null if nothing matches.
 */
export function pas13Section(needle: string): Pas13Citation | null {
  if (!needle) return null;
  const q = needle.trim().toLowerCase();
  if (!q) return null;

  // Exact-title match beats substring match.
  for (const { entry, haystack } of tocLower) {
    if (haystack === q) return buildCitation(entry);
  }

  // Substring match; prefer the deepest (longest) section id so that
  // "pendulum test" resolves to 7.5 rather than 7, and "pendulum impact"
  // resolves to 7.5.2 rather than 7.5.
  let best: TocEntry | null = null;
  for (const { entry, haystack } of tocLower) {
    if (!haystack.includes(q)) continue;
    if (!best || entry.section.length > best.section.length) {
      best = entry;
    }
  }
  return best ? buildCitation(best) : null;
}

/**
 * Return the definition record for a §3 term. Accepts either a section id
 * ("3.6") or the term itself ("deflection"). Returns null if not found.
 */
export function pas13Definition(query: string): Pas13Definition | null {
  if (!query) return null;
  const q = query.trim();
  const qLower = q.toLowerCase();
  for (const d of STRUCTURE.definitions) {
    if (d.section === q || d.term.toLowerCase() === qLower) {
      return d;
    }
  }
  return null;
}

/**
 * Flat snapshot of the loaded structure. Useful for surfaces that want to
 * render the entire TOC (e.g. a future PAS 13 index page).
 */
export function pas13Structure_(): Structure {
  return STRUCTURE;
}
