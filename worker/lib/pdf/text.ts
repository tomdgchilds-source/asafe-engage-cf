// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/text.ts
//
// Text primitives. Everything is left-aligned by default; `align` accepts
// "right" for numeric columns and "center" for chips and tiles only. There
// is deliberately no "justify" — the brand guide forbids it.
//
// Type scale (from theme.ts):
//   H1 bold caps 20 pt · H2 bold caps 13 pt with a 2 pt yellow underline
//   24 mm wide · H3 bold 10.5 pt · body 9.5 / 13.5 · small 7.5 grey60 ·
//   label 7 pt caps grey60, 0.05 em tracking.
//
// The standard Helvetica fonts use WinAnsi encoding; characters outside it
// make pdf-lib throw, so `sanitize()` maps the common offenders first.
// ────────────────────────────────────────────────────────────────────────────

import type { PDFFont, PDFPage, RGB } from "pdf-lib";
import { C, LAYOUT, TYPE } from "./theme";
import { ensureSpace, contentWidth, mm, type Page } from "./doc";

export type Align = "left" | "right" | "center";

export interface DrawTextOptions {
  x: number;
  /** Top edge of the text block (not the baseline). */
  y: number;
  size: number;
  font: PDFFont;
  color?: RGB;
  maxWidth?: number;
  lineHeight?: number;
  align?: Align;
  opacity?: number;
  /** Letter spacing as a fraction of `size` (0.05 = 5 %). */
  tracking?: number;
  /** Use `maxWidth` for alignment only; never wrap or break the string. */
  noWrap?: boolean;
}

// Characters Windows-1252 has beyond Latin-1 (all encodable by pdf-lib's
// standard fonts) plus a handful of substitutions for common Unicode that
// isn't.
const SUBSTITUTIONS: Record<string, string> = {
  "≥": ">=",
  "≤": "<=",
  "→": "->",
  "←": "<-",
  "✓": "Yes",
  "✔": "Yes",
  "✗": "No",
  "✘": "No",
  " ": " ",
  " ": " ",
  " ": " ",
  "​": "",
  "−": "-",
  "‑": "-",
  "′": "'",
  "″": '"',
};
const WIN1252_EXTRA = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split(""),
);

/** Replace characters the standard fonts cannot encode. */
export function sanitize(str: string): string {
  let out = "";
  for (const ch of String(str ?? "")) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff) || WIN1252_EXTRA.has(ch)) {
      out += ch;
    } else if (ch in SUBSTITUTIONS) {
      out += SUBSTITUTIONS[ch];
    } else if (code === 0x0a || code === 0x0d || code === 0x09) {
      out += ch;
    } else {
      out += "?";
    }
  }
  return out;
}

export function measure(font: PDFFont, size: number, str: string): number {
  return font.widthOfTextAtSize(sanitize(str), size);
}

/**
 * Word-wrap `str` to `maxWidth` pt. Honors explicit newlines. Words longer
 * than the width are broken character-wise so nothing ever overflows.
 */
export function wrap(font: PDFFont, size: number, str: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = sanitize(str).replace(/\r\n?/g, "\n").split("\n");
  for (const para of paragraphs) {
    const words = para.split(/[ \t]+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Word alone is too wide: break it.
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = "";
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        line = chunk;
      } else {
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function rawPage(p: PDFPage | Page): PDFPage {
  return "cursorY" in p ? p.page : p;
}

/** Baseline offset from the top of a line box, so text sits visually within `lineHeight`. */
function baselineOffset(size: number, lineHeight: number): number {
  // Helvetica ascender ≈ 0.72 em (cap height); centre the caps in the line box.
  return (lineHeight - size * 0.72) / 2 + size * 0.72;
}

/**
 * Draw one string (wrapped when `maxWidth` is given) with its top edge at `y`.
 * Returns the height used. Never justifies.
 */
export function drawText(page: PDFPage | Page, str: string, opts: DrawTextOptions): number {
  const p = rawPage(page);
  const size = opts.size;
  const lineHeight = opts.lineHeight ?? size * 1.35;
  const color = opts.color ?? C.black;
  const align = opts.align ?? "left";
  const tracking = (opts.tracking ?? 0) * size;
  const lines =
    opts.maxWidth && !opts.noWrap ? wrap(opts.font, size, str, opts.maxWidth) : sanitize(str).split(/\r?\n/);
  let y = opts.y - baselineOffset(size, lineHeight);
  for (const line of lines) {
    const w = opts.font.widthOfTextAtSize(line, size) + tracking * Math.max(0, line.length - 1);
    let x = opts.x;
    if (align === "right") x = opts.x + (opts.maxWidth ?? 0) - w;
    else if (align === "center") x = opts.x + ((opts.maxWidth ?? 0) - w) / 2;
    if (tracking > 0) {
      for (const ch of line) {
        p.drawText(ch, { x, y, size, font: opts.font, color, opacity: opts.opacity });
        x += opts.font.widthOfTextAtSize(ch, size) + tracking;
      }
    } else {
      p.drawText(line, { x, y, size, font: opts.font, color, opacity: opts.opacity });
    }
    y -= lineHeight;
  }
  return lines.length * lineHeight;
}

/**
 * Draw wrapped lines at the page cursor, breaking pages line by line.
 * Returns the height used on the final page; `page.doc.current` is the page
 * the text ended on.
 */
function flow(
  page: Page,
  str: string,
  opts: { font: PDFFont; size: number; lead: number; color?: RGB; indent?: number; tracking?: number; after?: number },
): number {
  const doc = page.doc;
  const indent = opts.indent ?? 0;
  const width = contentWidth(page) - indent;
  const lines = wrap(opts.font, opts.size, str, width);
  let p = ensureSpace(doc, page, opts.lead);
  let usedOnPage = 0;
  for (const line of lines) {
    const next = ensureSpace(doc, p, opts.lead);
    if (next !== p) {
      p = next;
      usedOnPage = 0;
    }
    drawText(p, line, {
      x: p.margin.l + indent,
      y: p.cursorY,
      size: opts.size,
      font: opts.font,
      color: opts.color,
      lineHeight: opts.lead,
      tracking: opts.tracking,
    });
    p.cursorY -= opts.lead;
    usedOnPage += opts.lead;
  }
  const after = opts.after ?? 0;
  p.cursorY -= after;
  return usedOnPage + after;
}

/** H1 bold caps 20 pt · H2 bold caps 13 pt with yellow underline · H3 bold 10.5 pt. Records an outline entry. */
export function heading(page: Page, level: 1 | 2 | 3, str: string): number {
  const doc = page.doc;
  const spec = level === 1 ? TYPE.h1 : level === 2 ? TYPE.h2 : TYPE.h3;
  const text = level === 3 ? str : str.toUpperCase();
  const before = level === 1 ? mm(2) : level === 2 ? mm(5) : mm(3);
  const after = level === 1 ? mm(4) : level === 2 ? mm(3.5) : mm(1.5);
  const width = contentWidth(page);
  const lines = wrap(doc.fonts.bold, spec.size, text, width);
  const underline = level === 2 ? mm(1.5) + LAYOUT.h2UnderlinePt : 0;
  // Keep-with-next: a heading never sits alone at the foot of a page.
  const needed = before + lines.length * spec.lead + underline + after + TYPE.body.lead * 3;
  let p = ensureSpace(doc, page, needed);
  if (p === page) p.cursorY -= before;
  const top = p.cursorY;
  doc.outline.push({ level, title: str, page: p.number });
  for (const line of lines) {
    drawText(p, line, { x: p.margin.l, y: p.cursorY, size: spec.size, font: doc.fonts.bold, lineHeight: spec.lead });
    p.cursorY -= spec.lead;
  }
  if (level === 2) {
    p.cursorY -= mm(1.5);
    p.page.drawRectangle({
      x: p.margin.l,
      y: p.cursorY - LAYOUT.h2UnderlinePt,
      width: mm(LAYOUT.h2UnderlineWidthMm),
      height: LAYOUT.h2UnderlinePt,
      color: C.yellow,
    });
    p.cursorY -= LAYOUT.h2UnderlinePt;
  }
  p.cursorY -= after;
  return top - p.cursorY + (p === page ? before : 0);
}

/** Body copy 9.5 / 13.5 pt, left-aligned, paragraph space after. */
export function body(page: Page, str: string, opts: { indent?: number; bold?: boolean; after?: number } = {}): number {
  return flow(page, str, {
    font: opts.bold ? page.doc.fonts.bold : page.doc.fonts.regular,
    size: TYPE.body.size,
    lead: TYPE.body.lead,
    indent: opts.indent,
    after: opts.after ?? mm(2.5),
  });
}

/** 7.5 pt grey60. */
export function small(page: Page, str: string, opts: { indent?: number; after?: number; color?: RGB } = {}): number {
  return flow(page, str, {
    font: page.doc.fonts.regular,
    size: TYPE.small.size,
    lead: TYPE.small.lead,
    color: opts.color ?? C.grey60,
    indent: opts.indent,
    after: opts.after ?? mm(1.5),
  });
}

/** 7 pt caps grey60 with 0.05 em tracking. */
export function label(page: Page, str: string, opts: { indent?: number; after?: number } = {}): number {
  return flow(page, str.toUpperCase(), {
    font: page.doc.fonts.regular,
    size: TYPE.label.size,
    lead: TYPE.label.lead,
    color: C.grey60,
    tracking: TYPE.label.tracking,
    indent: opts.indent,
    after: opts.after ?? mm(1),
  });
}

/** Bulleted list in body size. Square black bullet, 4 mm hanging indent. */
export function bullets(page: Page, items: string[], opts: { indent?: number } = {}): number {
  const doc = page.doc;
  const hang = mm(4);
  const indent = opts.indent ?? 0;
  let used = 0;
  let p = page;
  for (const item of items) {
    p = ensureSpace(doc, p, TYPE.body.lead);
    const bulletY = p.cursorY - TYPE.body.lead / 2 - 1;
    p.page.drawRectangle({ x: p.margin.l + indent + mm(0.5), y: bulletY, width: 2.2, height: 2.2, color: C.black });
    used += flow(p, item, {
      font: doc.fonts.regular,
      size: TYPE.body.size,
      lead: TYPE.body.lead,
      indent: indent + hang,
      after: mm(0.8),
    });
    p = doc.current ?? p;
  }
  p.cursorY -= mm(1.5);
  return used + mm(1.5);
}
