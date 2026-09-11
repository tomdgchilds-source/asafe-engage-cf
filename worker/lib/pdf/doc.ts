// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/doc.ts
//
// Document and page lifecycle for the A-SAFE document system on pdf-lib.
//
//   createDoc(meta)            → Doc with Helvetica / Helvetica-Bold embedded
//   addPage(doc, opts)         → new A4 portrait or A3 landscape page with
//                                 18 mm margins, inner-page header drawn
//   ensureSpace(doc, page, n)  → same page, or a fresh one when `n` pt would
//                                 overflow the bottom margin
//   finalize(doc)              → footers ("n of N", title · ref · rev), DRAFT
//                                 watermark when status is DRAFT, bytes out
//
// Cursor model: every Page carries `cursorY`, the y coordinate (PDF space,
// origin bottom-left) of the next free line. Primitives and blocks draw at
// the cursor and move it down. Whenever a primitive breaks a page it calls
// ensureSpace, which registers the new page as `doc.current`; callers that
// pass a page explicitly should read `doc.current` afterwards, or use the
// `{ page }` a block returns.
// ────────────────────────────────────────────────────────────────────────────

import {
  PDFDocument,
  StandardFonts,
  PageSizes,
  degrees,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { C, LAYOUT, TYPE } from "./theme";
import { embedBrandImage } from "./assets";

/** 1 mm = 2.8346 pt. */
export const mm = (n: number): number => n * 2.8346;

export type PageSize = "A4" | "A3L";

export interface DocMeta {
  title: string;
  reference: string;
  revision: string;
  issuedOn: string;
  docType: string;
  status: "DRAFT" | "ISSUED";
}

export interface Page {
  page: PDFPage;
  cursorY: number;
  margin: { l: number; r: number; t: number; b: number };
  number: number;
  size: PageSize;
  width: number;
  height: number;
  header: boolean;
  footer: boolean;
  /** Back-reference so text primitives can reach fonts and break pages. */
  doc: Doc;
}

export interface OutlineEntry {
  level: 1 | 2 | 3;
  title: string;
  page: number;
}

export interface Doc {
  pdf: PDFDocument;
  fonts: { regular: PDFFont; bold: PDFFont };
  meta: DocMeta;
  pages: Page[];
  /** The page most recently created; where the cursor lives. */
  current: Page | null;
  /** Embedded brand images, keyed by asset name. */
  images: Map<string, PDFImage>;
  /** Headings recorded by `heading()`; a contents page can read this. */
  outline: OutlineEntry[];
}

export interface AddPageOptions {
  size?: PageSize;
  /** Draw the document-type header (grey60 caps, right-aligned). Default true. */
  header?: boolean;
  /** Reserve and draw the footer at finalize. Default true. */
  footer?: boolean;
}

const SIZES: Record<PageSize, [number, number]> = {
  A4: [PageSizes.A4[0], PageSizes.A4[1]],
  A3L: [PageSizes.A3[1], PageSizes.A3[0]],
};

export async function createDoc(meta: DocMeta): Promise<Doc> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(`${meta.title} — ${meta.reference} Rev ${meta.revision}`);
  pdf.setSubject(meta.docType);
  pdf.setAuthor("A-SAFE");
  pdf.setProducer("A-SAFE Engage");
  pdf.setCreator("A-SAFE Engage document system");
  pdf.setCreationDate(new Date());
  const doc: Doc = {
    pdf,
    fonts: { regular, bold },
    meta,
    pages: [],
    current: null,
    images: new Map(),
    outline: [],
  };
  // The footer icon is drawn on every inner page; embed it once up front so
  // addPage / finalize can stay synchronous.
  await embedBrandImage(doc, "iconBlack");
  return doc;
}

export function addPage(doc: Doc, opts: AddPageOptions = {}): Page {
  const size = opts.size ?? "A4";
  const [width, height] = SIZES[size];
  const pdfPage = doc.pdf.addPage([width, height]);
  const m = mm(LAYOUT.marginMm);
  const page: Page = {
    page: pdfPage,
    cursorY: height - m,
    margin: { l: m, r: m, t: m, b: m },
    number: doc.pages.length + 1,
    size,
    width,
    height,
    header: opts.header ?? true,
    footer: opts.footer ?? true,
    doc,
  };
  doc.pages.push(page);
  doc.current = page;
  if (page.header) drawHeader(doc, page);
  return page;
}

/** Returns `page` when `needed` pt still fit above the bottom margin, else a new page of the same kind. */
export function ensureSpace(doc: Doc, page: Page, needed: number): Page {
  if (page.cursorY - needed >= page.margin.b) return page;
  return addPage(doc, { size: page.size, header: page.header, footer: page.footer });
}

/** Usable width between the left and right margins. */
export function contentWidth(page: Page): number {
  return page.width - page.margin.l - page.margin.r;
}

/** Usable height between the top and bottom margins. */
export function contentHeight(page: Page): number {
  return page.height - page.margin.t - page.margin.b;
}

/** Move the cursor down by `n` pt. */
export function space(page: Page, n: number): void {
  page.cursorY -= n;
}

/** The page the cursor is on; throws if no page has been added yet. */
export function current(doc: Doc): Page {
  if (!doc.current) throw new Error("Doc has no pages yet — call addPage first");
  return doc.current;
}

function drawHeader(doc: Doc, page: Page): void {
  const text = doc.meta.docType.toUpperCase();
  const size = TYPE.label.size;
  const font = doc.fonts.regular;
  const tracking = size * TYPE.label.tracking;
  const width = font.widthOfTextAtSize(text, size) + tracking * Math.max(0, text.length - 1);
  let x = page.width - page.margin.r - width;
  const y = page.height - mm(LAYOUT.headerFromTopMm);
  for (const ch of text) {
    page.page.drawText(ch, { x, y, size, font, color: C.grey60 });
    x += font.widthOfTextAtSize(ch, size) + tracking;
  }
}

function drawFooter(doc: Doc, page: Page, total: number): void {
  const { regular } = doc.fonts;
  const ruleY = mm(LAYOUT.footerRuleFromBottomMm);
  page.page.drawLine({
    start: { x: page.margin.l, y: ruleY },
    end: { x: page.width - page.margin.r, y: ruleY },
    thickness: LAYOUT.footerRulePt,
    color: C.grey20,
  });

  // Bottom-left: small halo icon + "n of N".
  const icon = doc.images.get("iconBlack");
  const iconH = mm(4);
  const baseY = ruleY - mm(6.5);
  let x = page.margin.l;
  if (icon) {
    const iconW = (icon.width / icon.height) * iconH;
    page.page.drawImage(icon, { x, y: baseY - mm(0.6), width: iconW, height: iconH });
    x += iconW + mm(2.5);
  }
  page.page.drawText(`${page.number} of ${total}`, {
    x,
    y: baseY,
    size: TYPE.small.size,
    font: regular,
    color: C.grey60,
  });

  // Bottom-right: title · reference · revision.
  const right = `${doc.meta.title}  ·  ${doc.meta.reference}  ·  Rev ${doc.meta.revision}`;
  const rw = regular.widthOfTextAtSize(right, TYPE.small.size);
  page.page.drawText(right, {
    x: page.width - page.margin.r - rw,
    y: baseY,
    size: TYPE.small.size,
    font: regular,
    color: C.grey60,
  });
}

function drawWatermark(doc: Doc, page: Page): void {
  const text = "DRAFT";
  const size = page.size === "A3L" ? 220 : 140;
  const font = doc.fonts.bold;
  const w = font.widthOfTextAtSize(text, size);
  const cx = page.width / 2;
  const cy = page.height / 2;
  const cos = Math.SQRT1_2;
  // Centre the rotated baseline on the page centre.
  const x = cx - (w / 2) * cos + (size * 0.36) * cos;
  const y = cy - (w / 2) * cos - (size * 0.36) * cos;
  page.page.drawText(text, {
    x,
    y,
    size,
    font,
    color: C.black,
    opacity: 0.08,
    rotate: degrees(45),
  });
}

/** Draw footers ("n of N"), the DRAFT watermark when applicable, and serialise. */
export async function finalize(doc: Doc): Promise<Uint8Array> {
  const total = doc.pages.length;
  for (const page of doc.pages) {
    if (page.footer) drawFooter(doc, page, total);
    if (doc.meta.status === "DRAFT") drawWatermark(doc, page);
  }
  return doc.pdf.save({ useObjectStreams: true });
}
