/**
 * Document references for the A-SAFE customer document system.
 *
 *   ASU-<kind>-<yymm>-<seq>   e.g. ASU-PR-2609-0001
 *
 * `kind` is the two-letter document type, `yymm` the issue month and `seq`
 * a per-(kind, month) counter held in the `document_refs` table. Revisions
 * are letters (A, B, C …) and increment on every ISSUED render of the same
 * document; a DRAFT render carries the literal reference "DRAFT".
 *
 * Pure module — shared by the Worker (allocation, PDF footers) and the client
 * (document register).
 */

export const DOCUMENT_KINDS = {
  RA: "Impact Protection Risk Assessment",
  PR: "Budgetary Proposal",
  OF: "Order Form",
  DS: "Drawing Sheet",
  PS: "PAS 13 Alignment Statement",
  IV: "Installation Verification Report",
} as const;

export type DocumentKind = keyof typeof DOCUMENT_KINDS;

export const DOCUMENT_PREFIX = "ASU";

export const DRAFT_REFERENCE = "DRAFT";

export function isDocumentKind(value: unknown): value is DocumentKind {
  return typeof value === "string" && value in DOCUMENT_KINDS;
}

/** `yymm` for a date (UTC), e.g. 2026-09-12 → "2609". */
export function yymmFor(date: Date = new Date()): string {
  const yy = String(date.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${yy}${mm}`;
}

/**
 * `formatDocumentRef("PR", "2609", 1)` → `"ASU-PR-2609-0001"`.
 * Throws on an unknown kind, a malformed yymm or a non-positive sequence.
 */
export function formatDocumentRef(kind: DocumentKind, yymm: string, seq: number): string {
  if (!isDocumentKind(kind)) throw new Error(`Unknown document kind: ${String(kind)}`);
  if (!/^\d{4}$/.test(yymm)) throw new Error(`Malformed yymm: ${yymm}`);
  if (!Number.isInteger(seq) || seq <= 0) throw new Error(`Sequence must be a positive integer: ${seq}`);
  return `${DOCUMENT_PREFIX}-${kind}-${yymm}-${String(seq).padStart(4, "0")}`;
}

export interface ParsedDocumentRef {
  kind: DocumentKind;
  yymm: string;
  seq: number;
}

/** Inverse of formatDocumentRef; null when the string is not a reference. */
export function parseDocumentRef(ref: string): ParsedDocumentRef | null {
  const m = /^ASU-([A-Z]{2})-(\d{4})-(\d{4,})$/.exec(String(ref ?? "").trim());
  if (!m) return null;
  const kind = m[1];
  if (!isDocumentKind(kind)) return null;
  return { kind, yymm: m[2], seq: parseInt(m[3], 10) };
}

/** First revision is "A"; "A" → "B" … "Z" → "AA". Junk input → "A". */
export function nextRevision(previous: string | null | undefined): string {
  const prev = String(previous ?? "").trim().toUpperCase();
  if (!/^[A-Z]+$/.test(prev)) return "A";
  const chars = prev.split("");
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] === "Z") {
      chars[i] = "A";
      i -= 1;
    } else {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      return chars.join("");
    }
  }
  return `A${chars.join("")}`;
}

/** Object key under which an issued PDF is stored: documents/<kind>/<ref>-<rev>.pdf */
export function documentObjectKey(kind: DocumentKind, ref: string, revision: string): string {
  return `documents/${kind}/${ref}-${revision}.pdf`;
}

/** Filename offered to the browser. */
export function documentFilename(kind: DocumentKind, ref: string, revision: string): string {
  const slug = DOCUMENT_KINDS[kind].replace(/[^A-Za-z0-9]+/g, "-");
  return ref === DRAFT_REFERENCE ? `A-SAFE-${slug}-DRAFT.pdf` : `A-SAFE-${slug}-${ref}-Rev${revision}.pdf`;
}
