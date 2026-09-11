// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/blocks.ts
//
// Reusable layout blocks for A-SAFE customer documents. Each block draws at
// the page cursor, moves it, handles page breaks through ensureSpace, and
// returns `{ height, page }` — the height used on the final page and the
// page it ended on. Full-page blocks (cover, section divider) return the
// Page they created.
//
// Look: black bands with the yellow strapline logo and a 90 % black halo
// arc; yellow header bars with black text on tables and forms; thin grey20
// rules; uppercase bold headlines; generous white space; body left-aligned.
// ────────────────────────────────────────────────────────────────────────────

import { degrees, type PDFImage, type RGB } from "pdf-lib";
import {
  C,
  HALO_ON_BLACK,
  LAYOUT,
  LIKELIHOOD_DESCRIPTORS,
  SEVERITY_DESCRIPTORS,
  TYPE,
  riskLevel,
  toneFill,
  toneText,
  type RiskLevel,
  type Tone,
} from "./theme";
import { addPage, contentHeight, contentWidth, ensureSpace, mm, type Doc, type Page } from "./doc";
import { drawText, measure, sanitize, wrap, small, type Align } from "./text";
import { drawHalo, drawImageCover, drawImageFit, embedBrandImage } from "./assets";
import { embedImage } from "./images";

export interface BlockResult {
  height: number;
  page: Page;
}

const CHIP_H = mm(LAYOUT.chipHeightMm);
const GUTTER = mm(LAYOUT.gutterMm);

// ─── Cover ─────────────────────────────────────────────────────────────────

export interface CoverOptions {
  heroImage?: Uint8Array;
  docTypeLine: string;
  title: string;
  subtitle?: string;
  client: string;
  site: string;
  date: string;
  preparedBy: string;
  reference: string;
  status: "DRAFT" | "ISSUED";
}

/**
 * Cover: photo across the top 58 % (or a black field with a yellow halo when
 * there is no photo), black band below with the title in white, the yellow
 * strapline logo bottom-left, a 90 % black halo arc bottom-right, and the
 * status stamp top-right of the band.
 */
export async function coverPage(doc: Doc, o: CoverOptions): Promise<Page> {
  const page = addPage(doc, { size: "A4", header: false, footer: false });
  const { width, height, margin } = page;
  const bandH = height * 0.42;
  const heroRect = { x: 0, y: bandH, w: width, h: height - bandH };

  // Hero.
  const hero = o.heroImage ? await embedImage(doc, o.heroImage) : null;
  if (hero) {
    drawImageCover(page.page, hero.image, heroRect);
    drawHalo(page.page, {
      cx: width * 0.12,
      cy: heroRect.y + heroRect.h * 0.55,
      r: width * 0.42,
      color: C.yellow,
      opacity: 0.28,
      clip: heroRect,
    });
  } else {
    page.page.drawRectangle({ x: 0, y: 0, width, height, color: C.black });
    drawHalo(page.page, {
      cx: width * 0.78,
      cy: heroRect.y + heroRect.h * 0.28,
      r: width * 0.5,
      color: C.yellow,
      clip: heroRect,
    });
  }

  // Band.
  page.page.drawRectangle({ x: 0, y: 0, width, height: bandH, color: C.black });
  page.page.drawRectangle({ x: 0, y: bandH - 3, width, height: 3, color: C.yellow });
  drawHalo(page.page, {
    cx: width - mm(22),
    cy: mm(8),
    r: mm(62),
    color: HALO_ON_BLACK,
    clip: { x: 0, y: 0, w: width, h: bandH - 3 },
  });

  const cw = contentWidth(page);
  let y = bandH - mm(12);

  // Document type line + status stamp.
  drawText(page, o.docTypeLine.toUpperCase(), {
    x: margin.l,
    y,
    size: TYPE.label.size + 1,
    font: doc.fonts.bold,
    color: C.yellow,
    tracking: 0.08,
    lineHeight: TYPE.label.lead + 1,
  });
  stamp(page, o.status, width - margin.r, y + mm(1));
  y -= mm(9);

  // Title.
  const titleW = cw - mm(6);
  const titleLines = wrap(doc.fonts.bold, TYPE.display.size, o.title.toUpperCase(), titleW);
  for (const line of titleLines) {
    drawText(page, line, {
      x: margin.l,
      y,
      size: TYPE.display.size,
      font: doc.fonts.bold,
      color: C.white,
      lineHeight: TYPE.display.lead,
    });
    y -= TYPE.display.lead;
  }
  if (o.subtitle) {
    y -= mm(1.5);
    y -= drawText(page, o.subtitle, {
      x: margin.l,
      y,
      size: 11,
      font: doc.fonts.regular,
      color: C.grey20,
      maxWidth: titleW,
      lineHeight: 14.5,
    });
  }

  // Meta grid: two columns, label over value.
  y -= mm(7);
  const cells: Array<[string, string]> = [
    ["Client", o.client],
    ["Site", o.site],
    ["Date", o.date],
    ["Prepared by", o.preparedBy],
    ["Reference", o.reference],
  ];
  const colW = (cw - mm(40)) / 2;
  const rowH = mm(11);
  cells.forEach(([k, v], i) => {
    const cx = margin.l + (i % 2) * (colW + GUTTER);
    const cy = y - Math.floor(i / 2) * rowH;
    drawText(page, k.toUpperCase(), {
      x: cx,
      y: cy,
      size: TYPE.label.size,
      font: doc.fonts.regular,
      color: C.grey40,
      tracking: TYPE.label.tracking,
      lineHeight: TYPE.label.lead,
    });
    drawText(page, v, {
      x: cx,
      y: cy - TYPE.label.lead,
      size: 9,
      font: doc.fonts.bold,
      color: C.white,
      maxWidth: colW,
      lineHeight: 11,
    });
  });

  // Logo bottom-left (primary: yellow on black).
  const logo = await embedBrandImage(doc, "logoPrimary");
  drawImageFit(page.page, logo, { x: margin.l, y: margin.b, width: mm(46) });

  page.cursorY = 0;
  return page;
}

/** Status stamp: outlined yellow box with bold caps, right edge at `rightX`, top at `topY`. */
function stamp(page: Page, status: "DRAFT" | "ISSUED", rightX: number, topY: number): void {
  const doc = page.doc;
  const text = status;
  const size = 8;
  const padX = mm(2.5);
  const w = measure(doc.fonts.bold, size, text) + 2 * padX + size * 0.08 * (text.length - 1);
  const h = mm(6.5);
  page.page.drawRectangle({
    x: rightX - w,
    y: topY - h,
    width: w,
    height: h,
    borderColor: C.yellow,
    borderWidth: 1,
  });
  drawText(page, text, {
    x: rightX - w + padX,
    y: topY,
    size,
    font: doc.fonts.bold,
    color: C.yellow,
    tracking: 0.08,
    lineHeight: h,
  });
}

// ─── Section divider ───────────────────────────────────────────────────────

export interface SectionDividerOptions {
  number: string | number;
  title: string;
  image?: Uint8Array;
  /** Optional one-line strap under the title. */
  strap?: string;
}

/** Full-page black band with the section number in yellow, like the brand-guide section pages. */
export async function sectionDivider(doc: Doc, o: SectionDividerOptions): Promise<Page> {
  const page = addPage(doc, { size: "A4", header: false, footer: false });
  const { width, height, margin } = page;
  page.page.drawRectangle({ x: 0, y: 0, width, height, color: C.black });

  let bandTop = height;
  const img = o.image ? await embedImage(doc, o.image) : null;
  if (img) {
    const rect = { x: 0, y: height * 0.55, w: width, h: height * 0.45 };
    drawImageCover(page.page, img.image, rect);
    page.page.drawRectangle({ x: 0, y: rect.y - 3, width, height: 3, color: C.yellow });
    bandTop = rect.y - 3;
  }
  drawHalo(page.page, {
    cx: width - mm(30),
    cy: mm(0),
    r: mm(85),
    color: HALO_ON_BLACK,
    clip: { x: 0, y: 0, w: width, h: bandTop },
  });

  const num = String(o.number).padStart(2, "0");
  let y = img ? bandTop - mm(22) : height * 0.62;
  y -= drawText(page, num, { x: margin.l, y, size: 64, font: doc.fonts.bold, color: C.yellow, lineHeight: 70 });
  y -= mm(2);
  const titleLines = wrap(doc.fonts.bold, 28, o.title.toUpperCase(), contentWidth(page) - mm(10));
  for (const line of titleLines) {
    drawText(page, line, { x: margin.l, y, size: 28, font: doc.fonts.bold, color: C.white, lineHeight: 33 });
    y -= 33;
  }
  if (o.strap) {
    y -= mm(3);
    drawText(page, o.strap, {
      x: margin.l,
      y,
      size: 10.5,
      font: doc.fonts.regular,
      color: C.grey20,
      maxWidth: contentWidth(page) - mm(30),
      lineHeight: 14,
    });
  }

  const logo = await embedBrandImage(doc, "logoPrimary");
  drawImageFit(page.page, logo, { x: margin.l, y: margin.b, width: mm(40) });
  page.cursorY = 0;
  return page;
}

// ─── Document control ──────────────────────────────────────────────────────

export interface KeyValueRow {
  key: string;
  value: string;
}

/** Two-column key / value table with a yellow header bar. */
export function documentControl(
  doc: Doc,
  page: Page,
  rows: KeyValueRow[],
  opts: { title?: string } = {},
): BlockResult {
  const cw = contentWidth(page);
  const keyW = mm(45);
  const padY = mm(1.8);
  const padX = mm(2.5);
  const size = TYPE.table.size;
  const lead = TYPE.table.lead;
  const headerH = mm(8);

  const drawHeaderBar = (p: Page) => {
    p.page.drawRectangle({ x: p.margin.l, y: p.cursorY - headerH, width: cw, height: headerH, color: C.yellow });
    drawText(p, (opts.title ?? "Document control").toUpperCase(), {
      x: p.margin.l + padX,
      y: p.cursorY,
      size: TYPE.table.size + 0.5,
      font: doc.fonts.bold,
      color: C.black,
      tracking: 0.04,
      lineHeight: headerH,
    });
    p.cursorY -= headerH;
  };

  let p = ensureSpace(doc, page, headerH + lead * 2 + padY * 2);
  const startY = p.cursorY;
  drawHeaderBar(p);
  let used = 0;
  for (const row of rows) {
    const lines = wrap(doc.fonts.regular, size, row.value, cw - keyW - padX * 2);
    const rowH = Math.max(1, lines.length) * lead + padY * 2;
    const next = ensureSpace(doc, p, rowH);
    if (next !== p) {
      p = next;
      drawHeaderBar(p);
    }
    const top = p.cursorY;
    drawText(p, row.key, { x: p.margin.l + padX, y: top - padY, size, font: doc.fonts.bold, lineHeight: lead });
    let ly = top - padY;
    for (const line of lines) {
      drawText(p, line, { x: p.margin.l + keyW + padX, y: ly, size, font: doc.fonts.regular, lineHeight: lead });
      ly -= lead;
    }
    p.cursorY -= rowH;
    p.page.drawLine({
      start: { x: p.margin.l, y: p.cursorY },
      end: { x: p.margin.l + cw, y: p.cursorY },
      thickness: 0.5,
      color: C.grey20,
    });
    used += rowH;
  }
  p.cursorY -= mm(4);
  return { height: p === page ? startY - p.cursorY : used + mm(4), page: p };
}

// ─── KPI tiles ─────────────────────────────────────────────────────────────

export interface KpiTile {
  label: string;
  value: string;
  sublabel?: string;
  tone?: Tone;
}

/** Up to four tiles across the content width; value bold 22 pt; tone strip on the left. */
export function kpiTiles(doc: Doc, page: Page, tiles: KpiTile[]): BlockResult {
  const items = tiles.slice(0, 4);
  const n = Math.max(1, items.length);
  const cw = contentWidth(page);
  const tileW = (cw - (n - 1) * GUTTER) / n;
  const tileH = mm(24);
  const p = ensureSpace(doc, page, tileH + mm(4));
  const top = p.cursorY;
  const padX = mm(3.5);
  items.forEach((t, i) => {
    const x = p.margin.l + i * (tileW + GUTTER);
    p.page.drawRectangle({
      x,
      y: top - tileH,
      width: tileW,
      height: tileH,
      borderColor: C.grey20,
      borderWidth: 0.5,
      color: C.white,
    });
    let tx = x + padX;
    if (t.tone && t.tone !== "neutral") {
      p.page.drawRectangle({ x, y: top - tileH, width: mm(2), height: tileH, color: toneFill(t.tone) });
      tx += mm(1.5);
    }
    const innerW = tileW - (tx - x) - padX;
    drawText(p, t.label.toUpperCase(), {
      x: tx,
      y: top - mm(3),
      size: TYPE.label.size,
      font: doc.fonts.regular,
      color: C.grey60,
      tracking: TYPE.label.tracking,
      lineHeight: TYPE.label.lead,
      maxWidth: innerW,
    });
    // Shrink the value if it would not fit.
    let vs = TYPE.kpi.size;
    while (vs > 12 && measure(doc.fonts.bold, vs, t.value) > innerW) vs -= 1;
    drawText(p, t.value, { x: tx, y: top - mm(8), size: vs, font: doc.fonts.bold, lineHeight: vs * 1.15 });
    if (t.sublabel) {
      drawText(p, t.sublabel, {
        x: tx,
        y: top - tileH + mm(3) + TYPE.small.lead,
        size: TYPE.small.size,
        font: doc.fonts.regular,
        color: C.grey60,
        maxWidth: innerW,
        lineHeight: TYPE.small.lead,
      });
    }
  });
  p.cursorY = top - tileH - mm(4);
  return { height: tileH + mm(4), page: p };
}

// ─── Risk matrix ───────────────────────────────────────────────────────────

export interface RiskMatrixOptions {
  /** Cells to outline, as [likelihood, severity] pairs (1–5). */
  highlight?: Array<[number, number]>;
  /** Show the legend row of level chips under the grid. Default true. */
  legend?: boolean;
}

/**
 * 5 × 5 likelihood × severity grid. `counts[l - 1][s - 1]` is the number of
 * zones scored at likelihood `l`, severity `s`. Likelihood runs up the left
 * axis (5 at the top), severity along the bottom.
 */
export function riskMatrix(doc: Doc, page: Page, counts: number[][], opts: RiskMatrixOptions = {}): BlockResult {
  const cellW = mm(24);
  const cellH = mm(11);
  const axisW = mm(7);
  const descW = mm(30);
  const gridW = cellW * 5;
  const bottomLabels = mm(10);
  const axisH = mm(6);
  const legendH = opts.legend === false ? 0 : CHIP_H + mm(4);
  const total = cellH * 5 + bottomLabels + axisH + legendH + mm(4);
  const p = ensureSpace(doc, page, total);
  const top = p.cursorY;
  const gx = p.margin.l + axisW + descW;
  const gy = top - cellH * 5; // bottom of grid
  const highlight = new Set((opts.highlight ?? []).map(([l, s]) => `${l}:${s}`));

  for (let l = 5; l >= 1; l--) {
    const rowY = gy + (l - 1) * cellH;
    // Row descriptor.
    drawText(p, `${l}  ${LIKELIHOOD_DESCRIPTORS[l - 1]}`, {
      x: p.margin.l + axisW,
      y: rowY + cellH,
      size: TYPE.small.size,
      font: doc.fonts.regular,
      color: C.grey60,
      lineHeight: cellH,
      maxWidth: descW - mm(2),
    });
    for (let s = 1; s <= 5; s++) {
      const x = gx + (s - 1) * cellW;
      const score = l * s;
      p.page.drawRectangle({
        x,
        y: rowY,
        width: cellW,
        height: cellH,
        color: toneFill(riskLevel(score)),
        opacity: 0.85,
        borderColor: C.white,
        borderWidth: 1,
      });
      const count = counts[l - 1]?.[s - 1] ?? 0;
      drawText(p, String(count), {
        x,
        y: rowY + cellH,
        size: count > 0 ? 11 : 8,
        font: count > 0 ? doc.fonts.bold : doc.fonts.regular,
        color: C.black,
        opacity: count > 0 ? 1 : 0.45,
        maxWidth: cellW,
        align: "center",
        lineHeight: cellH,
      });
      if (highlight.has(`${l}:${s}`)) {
        p.page.drawRectangle({ x: x + 1, y: rowY + 1, width: cellW - 2, height: cellH - 2, borderColor: C.black, borderWidth: 1.5 });
      }
    }
  }

  // Likelihood axis title (rotated, reads bottom to top).
  const lTitle = "LIKELIHOOD";
  const lw = measure(doc.fonts.bold, TYPE.label.size, lTitle);
  p.page.drawText(lTitle, {
    x: p.margin.l + TYPE.label.size,
    y: gy + (cellH * 5 - lw) / 2,
    size: TYPE.label.size,
    font: doc.fonts.bold,
    color: C.grey60,
    rotate: degrees(90),
  });

  // Severity labels under the grid.
  for (let s = 1; s <= 5; s++) {
    const x = gx + (s - 1) * cellW;
    drawText(p, `${s}`, { x, y: gy - mm(1), size: TYPE.small.size, font: doc.fonts.bold, color: C.grey60, maxWidth: cellW, align: "center", lineHeight: TYPE.small.lead });
    drawText(p, SEVERITY_DESCRIPTORS[s - 1], {
      x,
      y: gy - mm(1) - TYPE.small.lead,
      size: TYPE.small.size,
      font: doc.fonts.regular,
      color: C.grey60,
      maxWidth: cellW,
      align: "center",
      lineHeight: TYPE.small.lead,
    });
  }
  drawText(p, "SEVERITY", {
    x: gx,
    y: gy - bottomLabels - mm(0.5),
    size: TYPE.label.size,
    font: doc.fonts.bold,
    color: C.grey60,
    maxWidth: gridW,
    align: "center",
    lineHeight: axisH,
  });

  // Legend.
  let y = gy - bottomLabels - axisH - mm(2);
  if (opts.legend !== false) {
    let x = gx;
    const bands: Array<[RiskLevel, string]> = [
      ["low", "Low 1–4"],
      ["medium", "Medium 5–9"],
      ["high", "High 10–15"],
      ["critical", "Critical 16–25"],
    ];
    for (const [level, text] of bands) {
      const r = chip(p, text, level, { x, y });
      x += r.width + mm(2.5);
    }
    y -= CHIP_H + mm(2);
  }
  p.cursorY = y - mm(2);
  return { height: top - p.cursorY, page: p };
}

// ─── Table ─────────────────────────────────────────────────────────────────

export interface TableColumn {
  key: string;
  label: string;
  /** Column width in pt (use mm()). Widths are scaled down if they exceed the content width. */
  width: number;
  align?: Align;
}

export interface TableCell {
  text: string;
  /** Render as a chip of this tone instead of plain text. */
  chip?: Tone;
  bold?: boolean;
  color?: RGB;
  align?: Align;
}

export type TableCellValue = string | number | null | undefined | TableCell;

export interface TableOptions {
  columns: TableColumn[];
  rows: Array<Record<string, TableCellValue>>;
  zebra?: boolean;
  headerStyle: "yellow" | "black";
  /** Body font size; default 8.5 pt. */
  fontSize?: number;
}

/** Data table: header bar repeated after page breaks, 8.5 pt body, right-aligned numeric columns. */
export function table(doc: Doc, page: Page, o: TableOptions): BlockResult {
  const cw = contentWidth(page);
  const rawTotal = o.columns.reduce((s, c) => s + c.width, 0);
  const scale = rawTotal > cw ? cw / rawTotal : 1;
  const widths = o.columns.map((c) => c.width * scale);
  const size = o.fontSize ?? TYPE.table.size;
  const lead = size * 1.35;
  const padX = mm(2);
  const padY = mm(1.6);
  const headerH = mm(7.5);
  const headerFill = o.headerStyle === "black" ? C.black : C.yellow;
  const headerText = o.headerStyle === "black" ? C.white : C.black;

  const drawHeader = (p: Page) => {
    p.page.drawRectangle({ x: p.margin.l, y: p.cursorY - headerH, width: cw, height: headerH, color: headerFill });
    let x = p.margin.l;
    o.columns.forEach((c, i) => {
      drawText(p, c.label.toUpperCase(), {
        x: x + padX,
        y: p.cursorY,
        size: size - 1,
        font: doc.fonts.bold,
        color: headerText,
        maxWidth: widths[i] - padX * 2,
        align: c.align ?? "left",
        lineHeight: headerH,
        tracking: 0.03,
        noWrap: true,
      });
      x += widths[i];
    });
    p.cursorY -= headerH;
  };

  const asCell = (v: TableCellValue): TableCell => {
    if (v === null || v === undefined) return { text: "" };
    if (typeof v === "object") return v;
    return { text: typeof v === "number" ? formatNumber(v) : String(v) };
  };

  let p = ensureSpace(doc, page, headerH + lead + padY * 2);
  const startY = p.cursorY;
  drawHeader(p);
  let used = 0;
  o.rows.forEach((row, ri) => {
    const cells = o.columns.map((c) => asCell(row[c.key]));
    const linesPer = cells.map((cell, i) =>
      cell.chip ? [] : wrap(cell.bold ? doc.fonts.bold : doc.fonts.regular, size, cell.text, widths[i] - padX * 2),
    );
    const textH = Math.max(lead, ...linesPer.map((ls) => ls.length * lead), ...cells.map((c) => (c.chip ? CHIP_H : 0)));
    const rowH = textH + padY * 2;
    const next = ensureSpace(doc, p, rowH);
    if (next !== p) {
      p = next;
      drawHeader(p);
    }
    const top = p.cursorY;
    if (o.zebra && ri % 2 === 1) {
      p.page.drawRectangle({ x: p.margin.l, y: top - rowH, width: cw, height: rowH, color: C.grey8 });
    }
    let x = p.margin.l;
    cells.forEach((cell, i) => {
      const col = o.columns[i];
      const align = cell.align ?? col.align ?? "left";
      if (cell.chip) {
        const w = chipWidth(doc, cell.text);
        const cx = align === "right" ? x + widths[i] - padX - w : align === "center" ? x + (widths[i] - w) / 2 : x + padX;
        chip(p, cell.text, cell.chip, { x: cx, y: top - padY });
      } else {
        let ly = top - padY;
        for (const line of linesPer[i]) {
          drawText(p, line, {
            x: x + padX,
            y: ly,
            size,
            font: cell.bold ? doc.fonts.bold : doc.fonts.regular,
            color: cell.color ?? C.black,
            maxWidth: widths[i] - padX * 2,
            align,
            lineHeight: lead,
          });
          ly -= lead;
        }
      }
      x += widths[i];
    });
    p.cursorY -= rowH;
    p.page.drawLine({
      start: { x: p.margin.l, y: p.cursorY },
      end: { x: p.margin.l + cw, y: p.cursorY },
      thickness: 0.5,
      color: C.grey20,
    });
    used += rowH;
  });
  // Closing rule slightly heavier.
  p.page.drawLine({
    start: { x: p.margin.l, y: p.cursorY },
    end: { x: p.margin.l + cw, y: p.cursorY },
    thickness: 0.75,
    color: C.grey40,
  });
  p.cursorY -= mm(4);
  return { height: p === page ? startY - p.cursorY : used + mm(4), page: p };
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-GB") : n.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

// ─── Chip ──────────────────────────────────────────────────────────────────

function chipWidth(doc: Doc, text: string): number {
  const t = sanitize(text).toUpperCase();
  return measure(doc.fonts.bold, TYPE.chip.size, t) + TYPE.chip.size * 0.04 * Math.max(0, t.length - 1) + mm(5);
}

/**
 * Small filled rectangle, 6 mm high, 7 pt bold caps. With `at` it draws at
 * that top-left point; without, at the cursor (and advances it).
 */
export function chip(page: Page, text: string, tone: Tone, at?: { x: number; y: number }): { width: number; height: number } {
  const doc = page.doc;
  const w = chipWidth(doc, text);
  const x = at?.x ?? page.margin.l;
  const y = at?.y ?? page.cursorY;
  page.page.drawRectangle({ x, y: y - CHIP_H, width: w, height: CHIP_H, color: toneFill(tone) });
  drawText(page, text.toUpperCase(), {
    x: x + mm(2.5),
    y,
    size: TYPE.chip.size,
    font: doc.fonts.bold,
    color: toneText(tone),
    tracking: 0.04,
    lineHeight: CHIP_H,
  });
  if (!at) page.cursorY -= CHIP_H + mm(2);
  return { width: w, height: CHIP_H };
}

/** A row of chips at the cursor, wrapping to a new line when full. */
export function chipRow(page: Page, items: Array<{ label: string; tone: Tone }>): BlockResult {
  const cw = contentWidth(page);
  let p = ensureSpace(page.doc, page, CHIP_H + mm(2));
  const top = p.cursorY;
  let x = p.margin.l;
  let y = p.cursorY;
  for (const it of items) {
    const w = chipWidth(p.doc, it.label);
    if (x + w > p.margin.l + cw && x > p.margin.l) {
      x = p.margin.l;
      y -= CHIP_H + mm(1.5);
      p.cursorY = y;
      p = ensureSpace(p.doc, p, CHIP_H + mm(2));
      y = p.cursorY;
    }
    chip(p, it.label, it.tone, { x, y });
    x += w + mm(1.5);
  }
  p.cursorY = y - CHIP_H - mm(2);
  return { height: top - p.cursorY, page: p };
}

// ─── Photo ─────────────────────────────────────────────────────────────────

export interface PhotoOptions {
  maxW: number;
  maxH: number;
  caption?: string;
  tags?: string[];
  /** Left edge; defaults to the left margin. */
  x?: number;
  /** Do not move the cursor (for placing photos side by side). */
  inline?: boolean;
}

/**
 * Fit a photo inside maxW × maxH keeping aspect, 0.5 pt grey20 border,
 * caption in small, hazard tags as chips. Unsupported formats draw a
 * labelled grey placeholder of the same box.
 */
export async function photo(doc: Doc, page: Page, bytes: Uint8Array | null, o: PhotoOptions): Promise<BlockResult> {
  const embedded = bytes ? await embedImage(doc, bytes) : null;
  const maxH = Math.min(o.maxH, contentHeight(page) - mm(25));
  let w = o.maxW;
  let h = maxH;
  if (embedded) {
    const ratio = embedded.width / embedded.height;
    w = o.maxW;
    h = w / ratio;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
  } else {
    h = Math.min(maxH, o.maxW * 0.66);
  }
  const captionLines = o.caption ? wrap(doc.fonts.regular, TYPE.small.size, o.caption, w) : [];
  const captionH = captionLines.length * TYPE.small.lead + (captionLines.length ? mm(1.5) : 0);
  const tagsH = o.tags && o.tags.length ? mm(5) + mm(1.5) : 0;
  const total = h + captionH + tagsH + mm(3);
  const p = ensureSpace(doc, page, total);
  const x = o.x ?? p.margin.l;
  const top = p.cursorY;

  if (embedded) {
    p.page.drawImage(embedded.image, { x, y: top - h, width: w, height: h });
  } else {
    p.page.drawRectangle({ x, y: top - h, width: w, height: h, color: C.grey8 });
    drawText(p, "IMAGE FORMAT NOT SUPPORTED (WEBP / HEIC)", {
      x,
      y: top - h / 2 + TYPE.label.lead / 2,
      size: TYPE.label.size,
      font: doc.fonts.regular,
      color: C.grey60,
      maxWidth: w,
      align: "center",
      tracking: TYPE.label.tracking,
      lineHeight: TYPE.label.lead,
    });
  }
  p.page.drawRectangle({ x, y: top - h, width: w, height: h, borderColor: C.grey20, borderWidth: 0.5 });

  let y = top - h - mm(1.5);
  for (const line of captionLines) {
    drawText(p, line, { x, y, size: TYPE.small.size, font: doc.fonts.regular, color: C.grey60, lineHeight: TYPE.small.lead });
    y -= TYPE.small.lead;
  }
  if (o.tags && o.tags.length) {
    let tx = x;
    for (const tag of o.tags) {
      const tw = miniChip(p, tag, tx, y);
      if (tx + tw > x + w) break;
      tx += tw + mm(1.2);
    }
    y -= mm(5) + mm(1.5);
  }
  const bottom = y - mm(3);
  if (!o.inline) p.cursorY = bottom;
  return { height: top - bottom, page: p };
}

/** 5 mm grey chip used for hazard tags under captions. Returns its width. */
function miniChip(page: Page, text: string, x: number, y: number): number {
  const doc = page.doc;
  const size = 6.5;
  const t = sanitize(text).toUpperCase();
  const w = measure(doc.fonts.bold, size, t) + mm(3.5);
  page.page.drawRectangle({ x, y: y - mm(5), width: w, height: mm(5), color: C.grey20 });
  drawText(page, t, { x: x + mm(1.75), y, size, font: doc.fonts.bold, color: C.grey90, lineHeight: mm(5) });
  return w;
}

// ─── Product card ──────────────────────────────────────────────────────────

export interface ProductCardOptions {
  image?: Uint8Array | null;
  name: string;
  family: string;
  testedEnergyJ: number;
  keySpecs: string[];
  why: string;
  unitPriceAed?: number;
  lineTotalAed?: number;
  /** e.g. "2 × 6.0 m" — shown beside the prices when given. */
  quantityLine?: string;
}

/** Two-column card with a black header bar and the tested-energy callout in a yellow box (datasheet style). */
export async function productCard(doc: Doc, page: Page, o: ProductCardOptions): Promise<BlockResult> {
  const cw = contentWidth(page);
  const headerH = mm(10);
  const pad = mm(4);
  const imgColW = mm(50);
  const rightX0 = imgColW + pad * 2;
  const rightW = cw - rightX0 - pad;
  const energyBoxH = mm(14);
  const specSize = 8.5;
  const specLead = 11.5;
  const whyLines = wrap(doc.fonts.regular, TYPE.body.size, o.why, rightW);
  const specLines = o.keySpecs.map((s) => wrap(doc.fonts.regular, specSize, s, rightW - mm(4)));
  const specsH = specLines.reduce((a, ls) => a + ls.length * specLead, 0) + (o.keySpecs.length ? mm(2) : 0);
  const whyH = whyLines.length * TYPE.body.lead + (whyLines.length ? mm(2) + TYPE.label.lead : 0);
  const rightH = energyBoxH + mm(3) + specsH + whyH;
  const hasPrice = o.unitPriceAed !== undefined || o.lineTotalAed !== undefined;
  const priceH = hasPrice ? mm(9) : 0;
  const bodyH = Math.max(rightH, mm(40)) + pad * 2;
  const total = headerH + bodyH + priceH;
  const p = ensureSpace(doc, page, total + mm(4));
  const top = p.cursorY;
  const x0 = p.margin.l;

  // Frame + header.
  p.page.drawRectangle({ x: x0, y: top - total, width: cw, height: total, borderColor: C.grey20, borderWidth: 0.5, color: C.white });
  p.page.drawRectangle({ x: x0, y: top - headerH, width: cw, height: headerH, color: C.black });
  drawText(p, o.name.toUpperCase(), {
    x: x0 + pad,
    y: top,
    size: 11,
    font: doc.fonts.bold,
    color: C.white,
    lineHeight: headerH,
    maxWidth: cw * 0.62,
  });
  drawText(p, o.family.toUpperCase(), {
    x: x0 + cw * 0.62,
    y: top,
    size: TYPE.label.size,
    font: doc.fonts.bold,
    color: C.yellow,
    tracking: 0.06,
    lineHeight: headerH,
    maxWidth: cw * 0.38 - pad,
    align: "right",
  });

  // Left: product image or placeholder.
  const imgTop = top - headerH - pad;
  const imgH = Math.min(mm(40), bodyH - pad * 2);
  const embedded = o.image ? await embedImage(doc, o.image) : null;
  if (embedded) {
    const ratio = embedded.width / embedded.height;
    let w = imgColW;
    let h = w / ratio;
    if (h > imgH) {
      h = imgH;
      w = h * ratio;
    }
    p.page.drawImage(embedded.image, { x: x0 + pad + (imgColW - w) / 2, y: imgTop - imgH + (imgH - h) / 2, width: w, height: h });
  } else {
    p.page.drawRectangle({ x: x0 + pad, y: imgTop - imgH, width: imgColW, height: imgH, color: C.grey8 });
    drawText(p, "PRODUCT IMAGE", {
      x: x0 + pad,
      y: imgTop - imgH / 2 + TYPE.label.lead / 2,
      size: TYPE.label.size,
      font: doc.fonts.regular,
      color: C.grey60,
      maxWidth: imgColW,
      align: "center",
      tracking: TYPE.label.tracking,
      lineHeight: TYPE.label.lead,
    });
  }

  // Right: energy callout.
  const rx = x0 + rightX0;
  let y = imgTop;
  p.page.drawRectangle({ x: rx, y: y - energyBoxH, width: rightW, height: energyBoxH, color: C.yellow });
  drawText(p, "TESTED IMPACT ENERGY", {
    x: rx + mm(3),
    y: y - mm(2),
    size: TYPE.label.size,
    font: doc.fonts.bold,
    color: C.black,
    tracking: TYPE.label.tracking,
    lineHeight: TYPE.label.lead,
  });
  drawText(p, `${formatNumber(o.testedEnergyJ)} J`, {
    x: rx + mm(3),
    y: y - mm(2) - TYPE.label.lead,
    size: 15,
    font: doc.fonts.bold,
    color: C.black,
    lineHeight: 17,
  });
  drawText(p, "PAS 13:2017 test method", {
    x: rx,
    y: y - mm(2) - TYPE.label.lead,
    size: TYPE.small.size,
    font: doc.fonts.regular,
    color: C.black,
    maxWidth: rightW - mm(3),
    align: "right",
    lineHeight: 17,
  });
  y -= energyBoxH + mm(3);

  // Specs.
  for (const ls of specLines) {
    p.page.drawRectangle({ x: rx + mm(0.5), y: y - specLead / 2 - 1, width: 2, height: 2, color: C.black });
    for (const line of ls) {
      drawText(p, line, { x: rx + mm(4), y, size: specSize, font: doc.fonts.regular, lineHeight: specLead });
      y -= specLead;
    }
  }
  if (o.keySpecs.length) y -= mm(2);

  // Why.
  if (whyLines.length) {
    drawText(p, "WHY THIS PRODUCT", {
      x: rx,
      y,
      size: TYPE.label.size,
      font: doc.fonts.regular,
      color: C.grey60,
      tracking: TYPE.label.tracking,
      lineHeight: TYPE.label.lead,
    });
    y -= TYPE.label.lead + mm(0.5);
    for (const line of whyLines) {
      drawText(p, line, { x: rx, y, size: TYPE.body.size, font: doc.fonts.regular, lineHeight: TYPE.body.lead });
      y -= TYPE.body.lead;
    }
  }

  // Price strip.
  if (hasPrice) {
    const sy = top - total;
    p.page.drawRectangle({ x: x0, y: sy, width: cw, height: priceH, color: C.grey8 });
    p.page.drawLine({ start: { x: x0, y: sy + priceH }, end: { x: x0 + cw, y: sy + priceH }, thickness: 0.5, color: C.grey20 });
    const parts: string[] = [];
    if (o.quantityLine) parts.push(o.quantityLine);
    if (o.unitPriceAed !== undefined) parts.push(`Unit AED ${formatNumber(o.unitPriceAed)}`);
    drawText(p, parts.join("   ·   "), { x: x0 + pad, y: sy + priceH, size: TYPE.table.size, font: doc.fonts.regular, lineHeight: priceH, color: C.grey90 });
    if (o.lineTotalAed !== undefined) {
      drawText(p, `AED ${formatNumber(o.lineTotalAed)} ex-VAT`, {
        x: x0,
        y: sy + priceH,
        size: TYPE.table.size + 1,
        font: doc.fonts.bold,
        maxWidth: cw - pad,
        align: "right",
        lineHeight: priceH,
      });
    }
  }

  p.cursorY = top - total - mm(4);
  return { height: total + mm(4), page: p };
}

// ─── Callout box ───────────────────────────────────────────────────────────

export interface CalloutOptions {
  tone: "yellow" | "black" | "grey";
  title?: string;
  body: string;
}

/** Filled box with optional bold caps title. Yellow: black text. Black: white text, yellow title. Grey: grey8 with a black left bar. */
export function calloutBox(doc: Doc, page: Page, o: CalloutOptions): BlockResult {
  const cw = contentWidth(page);
  const pad = mm(4);
  const textW = cw - pad * 2 - (o.tone === "grey" ? mm(1.5) : 0);
  const lines = wrap(doc.fonts.regular, TYPE.body.size, o.body, textW);
  const titleH = o.title ? TYPE.body.lead + mm(1) : 0;
  const boxH = pad * 2 + titleH + lines.length * TYPE.body.lead;
  const p = ensureSpace(doc, page, boxH + mm(4));
  const top = p.cursorY;
  const x0 = p.margin.l;
  const fill = o.tone === "yellow" ? C.yellow : o.tone === "black" ? C.black : C.grey8;
  const text = o.tone === "black" ? C.white : C.black;
  const titleColor = o.tone === "black" ? C.yellow : C.black;
  p.page.drawRectangle({ x: x0, y: top - boxH, width: cw, height: boxH, color: fill });
  let tx = x0 + pad;
  if (o.tone === "grey") {
    p.page.drawRectangle({ x: x0, y: top - boxH, width: 3, height: boxH, color: C.black });
    tx += mm(1.5);
  }
  let y = top - pad;
  if (o.title) {
    drawText(p, o.title.toUpperCase(), { x: tx, y, size: TYPE.body.size, font: doc.fonts.bold, color: titleColor, tracking: 0.03, lineHeight: TYPE.body.lead });
    y -= titleH;
  }
  for (const line of lines) {
    drawText(p, line, { x: tx, y, size: TYPE.body.size, font: doc.fonts.regular, color: text, lineHeight: TYPE.body.lead });
    y -= TYPE.body.lead;
  }
  p.cursorY = top - boxH - mm(4);
  return { height: boxH + mm(4), page: p };
}

// ─── Sign-off ──────────────────────────────────────────────────────────────

export interface SignOffParty {
  role: string;
  name?: string;
  title?: string;
  date?: string;
}

/** Three equal boxes per row with signature and date lines. */
export function signOffBlock(doc: Doc, page: Page, parties: SignOffParty[]): BlockResult {
  const cw = contentWidth(page);
  const perRow = 3;
  const boxW = (cw - GUTTER * (perRow - 1)) / perRow;
  const boxH = mm(36);
  const stripH = mm(6.5);
  const pad = mm(3);
  let p = page;
  const startY = page.cursorY;
  let used = 0;
  for (let r = 0; r < parties.length; r += perRow) {
    p = ensureSpace(doc, p, boxH + mm(4));
    const top = p.cursorY;
    parties.slice(r, r + perRow).forEach((party, i) => {
      const x = p.margin.l + i * (boxW + GUTTER);
      p.page.drawRectangle({ x, y: top - boxH, width: boxW, height: boxH, borderColor: C.grey20, borderWidth: 0.5, color: C.white });
      p.page.drawRectangle({ x, y: top - stripH, width: boxW, height: stripH, color: C.grey8 });
      drawText(p, party.role.toUpperCase(), {
        x: x + pad,
        y: top,
        size: TYPE.label.size,
        font: doc.fonts.bold,
        color: C.grey90,
        tracking: TYPE.label.tracking,
        lineHeight: stripH,
        maxWidth: boxW - pad * 2,
      });
      let y = top - stripH - mm(2.5);
      if (party.name) {
        drawText(p, party.name, { x: x + pad, y, size: TYPE.table.size, font: doc.fonts.bold, lineHeight: TYPE.table.lead, maxWidth: boxW - pad * 2 });
        y -= TYPE.table.lead;
      }
      if (party.title) {
        drawText(p, party.title, { x: x + pad, y, size: TYPE.small.size, font: doc.fonts.regular, color: C.grey60, lineHeight: TYPE.small.lead, maxWidth: boxW - pad * 2 });
      }
      // Signature and date lines.
      const sigY = top - boxH + mm(13);
      const dateY = top - boxH + mm(5);
      for (const [ly, lab, val] of [
        [sigY, "Signature", undefined],
        [dateY, "Date", party.date],
      ] as Array<[number, string, string | undefined]>) {
        p.page.drawLine({ start: { x: x + pad, y: ly }, end: { x: x + boxW - pad, y: ly }, thickness: 0.5, color: C.grey40 });
        drawText(p, lab.toUpperCase(), { x: x + pad, y: ly - mm(0.5), size: 6, font: doc.fonts.regular, color: C.grey60, tracking: 0.05, lineHeight: 7 });
        if (val) drawText(p, val, { x: x + pad, y: ly + mm(4), size: TYPE.table.size, font: doc.fonts.regular, lineHeight: TYPE.table.lead });
      }
    });
    p.cursorY = top - boxH - mm(4);
    used += boxH + mm(4);
  }
  return { height: p === page ? startY - p.cursorY : used, page: p };
}

// ─── Hierarchy of controls ─────────────────────────────────────────────────

const HIERARCHY: Array<{ label: string; note: string; fill: RGB; text: RGB }> = [
  { label: "Eliminate", note: "Remove the hazard: separate vehicles and people by design.", fill: C.grey90, text: C.white },
  { label: "Substitute", note: "Replace the hazard: lower-mass vehicles, lower speeds, fewer movements.", fill: C.grey60, text: C.white },
  { label: "Engineering controls", note: "Physical protection that absorbs impact: A-SAFE polymer safety barriers.", fill: C.yellow, text: C.black },
  { label: "Administrative", note: "Traffic-management plan, training, speed limits, signage.", fill: C.grey40, text: C.black },
  { label: "PPE", note: "High-visibility clothing. Last line of defence.", fill: C.grey20, text: C.black },
];

/** Inverted five-band triangle with the Engineering band in yellow and a one-line note. */
export function hierarchyOfControls(doc: Doc, page: Page): BlockResult {
  const cw = contentWidth(page);
  const triW = mm(92);
  const bandH = mm(11);
  const noteX = triW + mm(6);
  const noteW = cw - noteX;
  const total = bandH * 5 + mm(3) + TYPE.body.lead * 2 + mm(4);
  const p = ensureSpace(doc, page, total);
  const top = p.cursorY;
  const x0 = p.margin.l;
  const widthAt = (i: number) => triW * (1 - 0.64 * (i / 5));
  HIERARCHY.forEach((band, i) => {
    const wTop = widthAt(i);
    const wBot = widthAt(i + 1);
    const yTop = top - i * bandH;
    const cx = x0 + triW / 2;
    const path = `M ${cx - wTop / 2} 0 L ${cx + wTop / 2} 0 L ${cx + wBot / 2} ${bandH} L ${cx - wBot / 2} ${bandH} Z`;
    p.page.drawSvgPath(path, { x: 0, y: yTop, color: band.fill, borderColor: C.white, borderWidth: 1 });
    drawText(p, band.label.toUpperCase(), {
      x: cx - wBot / 2,
      y: yTop,
      size: TYPE.label.size + 0.5,
      font: doc.fonts.bold,
      color: band.text,
      maxWidth: wBot,
      align: "center",
      tracking: 0.05,
      lineHeight: bandH,
    });
    drawText(p, band.note, {
      x: x0 + noteX,
      y: yTop - (bandH - TYPE.small.lead) / 2,
      size: TYPE.small.size,
      font: i === 2 ? doc.fonts.bold : doc.fonts.regular,
      color: i === 2 ? C.black : C.grey60,
      maxWidth: noteW,
      lineHeight: TYPE.small.lead,
    });
  });
  let y = top - bandH * 5 - mm(3);
  y -= drawText(
    p,
    "A-SAFE barriers are an engineering control. They complement, and do not replace, traffic-management and behavioural controls.",
    { x: x0, y, size: TYPE.body.size, font: doc.fonts.regular, maxWidth: cw, lineHeight: TYPE.body.lead },
  );
  p.cursorY = y - mm(4);
  return { height: top - p.cursorY, page: p };
}

// ─── Small helpers other renderers reuse ───────────────────────────────────

/** Draw a labelled figure caption at the cursor in `small`. */
export function caption(page: Page, text: string): number {
  return small(page, text);
}

/** Embed and return a brand logo image for renderers that place logos themselves. */
export async function brandLogo(doc: Doc, key: "logoPrimary" | "logoSecondary" | "logoSmall"): Promise<PDFImage> {
  return embedBrandImage(doc, key);
}

/**
 * Yellow parallelogram tab across the top-left of a letter-style page, with
 * the secondary logo on the white to its right (never yellow on yellow).
 * Pulls the cursor below the tab.
 */
export async function letterTab(doc: Doc, page: Page): Promise<void> {
  const w = mm(34);
  const h = mm(14);
  const skew = mm(5);
  const yTop = page.height;
  page.page.drawSvgPath(`M 0 0 L ${w} 0 L ${w - skew} ${h} L 0 ${h} Z`, { x: 0, y: yTop, color: C.yellow });
  const logo = await embedBrandImage(doc, "logoSmall");
  drawImageFit(page.page, logo, { x: w + mm(6), y: yTop - h + mm(3), height: h - mm(6) });
  page.cursorY = Math.min(page.cursorY, yTop - h - mm(10));
}
