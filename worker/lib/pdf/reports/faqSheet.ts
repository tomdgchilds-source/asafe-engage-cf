// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/reports/faqSheet.ts
//
// A-SAFE Frequently Asked Questions (ASU-FQ-…): the customer-facing FAQ
// sheet, rendered server-side on the shared pdf-lib document system.
// Replaces the jsPDF generator that used to live in client/src/pages/FAQs.tsx.
//
// Cover-less A4 portrait:
//   1   Black header band (primary logo, document type line, title, 90 %
//       black halo) · document control strip (reference, revision, issue
//       date, scope) · short introduction · first category
//   1+  Questions grouped by category: H2 category heading with the yellow
//       underline, question in bold, answer in body copy
//   end "Still have questions?" call-out with the A-SAFE UAE office block
//   all Inner-page header ("CUSTOMER FAQ SHEET") and the standard footer
//       (halo icon · "n of N" · title · reference · revision)
//
// Content source: rows an admin has published to the `faqs` table (the same
// source GET /api/faqs serves) when there are any; otherwise the canonical
// list in shared/faqContent.ts, which is also what the FAQs page renders.
// Categories describing the Engage app itself are left out unless they are
// asked for by name.
// ────────────────────────────────────────────────────────────────────────────

import type { Env } from "../../../types";
import { getDb } from "../../../db";
import { createStorage } from "../../../storage";
import { FAQS, FAQ_CATEGORIES, INTERNAL_FAQ_CATEGORIES, faqCategoryTitle, type FaqEntry } from "../../../../shared/faqContent";
import { C, HALO_ON_BLACK, TYPE } from "../theme";
import { createDoc, addPage, ensureSpace, contentWidth, finalize, mm, type Doc, type Page } from "../doc";
import { heading, body, small, drawText, wrap } from "../text";
import { calloutBox } from "../blocks";
import { drawHalo, drawImageFit, embedBrandImage } from "../assets";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FaqSheetOptions {
  /** Category keys to include. Empty or omitted = every customer-facing category. */
  categories?: string[];
  /** Specific FAQ ids to include (takes precedence over `categories`). Unknown ids are ignored. */
  ids?: string[];
  /** Issue date printed in the control strip; defaults to now. */
  issuedOn?: Date;
  /** DRAFT renders carry the watermark. Default ISSUED. */
  status?: "DRAFT" | "ISSUED";
}

export interface FaqSheetOutput {
  /** Raw PDF bytes (application/pdf). */
  pdf: Uint8Array;
  /** "A-SAFE_FAQs.pdf" or "A-SAFE_FAQs-<Category>.pdf" for a single category. */
  filename: string;
  /** Document reference printed on the sheet, e.g. ASU-FQ-2609. */
  reference: string;
  /** Number of questions rendered. */
  count: number;
  /** Category keys rendered, in document order. */
  categories: string[];
}

export const FAQ_SHEET_TITLE = "A-SAFE Frequently Asked Questions";
export const FAQ_SHEET_DOC_TYPE = "Customer FAQ sheet";

const UAE_OFFICE = {
  name: "A-SAFE DWC-LLC",
  address: "Office 220, Building A5, Dubai South Business Park, Dubai, UAE",
  phone: "+971 4 884 2422",
  email: "support@asafe.ae",
  web: "www.asafe.com",
};

// ─── Public entry points ───────────────────────────────────────────────────

/** Load FAQs and render the sheet. Route handlers call this. */
export async function renderFaqSheet(env: Env, opts: FaqSheetOptions = {}): Promise<FaqSheetOutput> {
  const all = await loadFaqs(env);
  return renderFaqSheetFromFaqs(all, opts);
}

/**
 * The FAQ list the sheet draws from: published `faqs` rows when the table
 * has any, else the canonical shared list. Same precedence as the page.
 */
export async function loadFaqs(env: Env): Promise<FaqEntry[]> {
  try {
    const storage = createStorage(getDb(env.DATABASE_URL));
    const rows = await storage.getFaqs();
    const published = rows.filter((r) => r.isPublished !== false && r.question?.trim() && r.answer?.trim());
    if (published.length > 0) {
      return published.map((r) => ({
        id: r.id,
        category: r.category?.trim() || "general",
        question: r.question,
        answer: r.answer,
      }));
    }
  } catch (error) {
    console.error("faqSheet: falling back to shared FAQ content:", error);
  }
  return FAQS.slice();
}

/**
 * Apply the selection rules: explicit ids win; else the named categories;
 * else every category except the internal (app usage) ones.
 */
export function selectFaqs(all: readonly FaqEntry[], opts: FaqSheetOptions = {}): FaqEntry[] {
  const ids = (opts.ids ?? []).map((s) => s.trim()).filter(Boolean);
  if (ids.length > 0) {
    const wanted = new Set(ids);
    return all.filter((f) => wanted.has(f.id));
  }
  const cats = (opts.categories ?? []).map((s) => s.trim()).filter(Boolean);
  if (cats.length > 0) {
    const wanted = new Set(cats);
    return all.filter((f) => wanted.has(f.category));
  }
  return all.filter((f) => !INTERNAL_FAQ_CATEGORIES.includes(f.category));
}

/** Group in canonical category order; categories the shared list doesn't know come last, alphabetically. */
export function groupByCategory(faqs: readonly FaqEntry[]): Array<{ key: string; title: string; description?: string; faqs: FaqEntry[] }> {
  const order = new Map(FAQ_CATEGORIES.map((c, i) => [c.key, i]));
  const groups = new Map<string, FaqEntry[]>();
  for (const f of faqs) {
    const list = groups.get(f.category) ?? [];
    list.push(f);
    groups.set(f.category, list);
  }
  const keys = Array.from(groups.keys()).sort((a, b) => {
    const ia = order.get(a);
    const ib = order.get(b);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return a.localeCompare(b);
  });
  return keys.map((key) => ({
    key,
    title: faqCategoryTitle(key),
    description: FAQ_CATEGORIES.find((c) => c.key === key)?.description,
    faqs: groups.get(key)!,
  }));
}

/** Render from an in-memory list (what the tests use). */
export async function renderFaqSheetFromFaqs(all: readonly FaqEntry[], opts: FaqSheetOptions = {}): Promise<FaqSheetOutput> {
  const selected = selectFaqs(all, opts);
  const groups = groupByCategory(selected);
  const issuedAt = opts.issuedOn ?? new Date();
  const issuedOn = formatDate(issuedAt);
  const reference = faqSheetReference(issuedAt);
  const revision = "A";
  const status = opts.status ?? "ISSUED";

  const doc = await createDoc({
    title: FAQ_SHEET_TITLE,
    reference,
    revision,
    issuedOn,
    docType: FAQ_SHEET_DOC_TYPE,
    status,
  });

  // Page 1 carries the header band instead of the inner-page header.
  let page = addPage(doc, { header: false });
  await headerBand(doc, page);

  // Text primitives may break pages; always continue on doc.current.
  const H = (level: 1 | 2 | 3, s: string) => {
    heading(page, level, s);
    page = doc.current ?? page;
  };
  const B = (s: string, o: { bold?: boolean; after?: number } = {}) => {
    body(page, s, o);
    page = doc.current ?? page;
  };
  const S = (s: string) => {
    small(page, s);
    page = doc.current ?? page;
  };

  page = controlStrip(
    doc,
    page,
    [
      ["Reference", reference],
      ["Revision", revision],
      ["Issue date", issuedOn],
      ["Scope", scopeLabel(selected.length, groups.length)],
    ],
    [1, 0.6, 1.1, 1.6],
  );

  B(
    "This sheet answers the questions A-SAFE UAE is asked most often about polymer impact protection: how the barriers work, how they are tested, and what installation, maintenance and return on investment look like in practice.",
  );
  B(
    "The answers are general guidance. Product selection for a specific site follows a walk-through survey and a PAS 13:2017 impact-energy assessment; your A-SAFE representative confirms the specification before procurement.",
  );

  if (selected.length === 0) {
    ({ page } = calloutBox(doc, page, {
      tone: "grey",
      title: "No questions matched this selection",
      body: "The category or question filter returned nothing. Clear the filter to include every customer-facing question.",
    }));
  }

  for (const group of groups) {
    H(2, group.title);
    if (group.description) S(group.description);
    for (const faq of group.faqs) {
      page = questionAnswer(doc, page, faq);
    }
  }

  // Closing call-out: contact block, call-to-action line in bold.
  page = ensureSpace(doc, page, mm(40));
  ({ page } = calloutBox(doc, page, {
    tone: "yellow",
    title: "Still have questions?",
    body: `Our UAE team gives site-specific guidance on product selection, PAS 13 alignment and installation. ${UAE_OFFICE.name}, ${UAE_OFFICE.address}.`,
  }));
  B(`Call ${UAE_OFFICE.phone}, email ${UAE_OFFICE.email} or visit ${UAE_OFFICE.web}.`, { bold: true });

  const pdf = await finalize(doc);
  return {
    pdf,
    filename: faqSheetFilename(groups.length === 1 ? groups[0].title : undefined),
    reference,
    count: selected.length,
    categories: groups.map((g) => g.key),
  };
}

// ─── Page furniture ────────────────────────────────────────────────────────

/**
 * Black band across the top of page 1: primary logo (yellow on black) top-
 * left, document type line in yellow, title in white bold caps, a 90 % black
 * halo arc cropped to the right edge, and a 3 pt yellow rule underneath.
 */
async function headerBand(doc: Doc, page: Page): Promise<void> {
  const { width, height, margin } = page;
  const bandH = mm(52);
  const bandY = height - bandH;
  page.page.drawRectangle({ x: 0, y: bandY, width, height: bandH, color: C.black });
  page.page.drawRectangle({ x: 0, y: bandY - 3, width, height: 3, color: C.yellow });
  drawHalo(page.page, {
    cx: width - mm(20),
    cy: bandY + mm(4),
    r: mm(46),
    color: HALO_ON_BLACK,
    clip: { x: 0, y: bandY, w: width, h: bandH },
  });

  const logo = await embedBrandImage(doc, "logoPrimary");
  const logoW = mm(40);
  drawImageFit(page.page, logo, { x: margin.l, y: height - mm(8) - (logo.height / logo.width) * logoW, width: logoW });

  let y = bandY + mm(24);
  drawText(page, FAQ_SHEET_DOC_TYPE.toUpperCase(), {
    x: margin.l,
    y,
    size: TYPE.label.size + 1,
    font: doc.fonts.bold,
    color: C.yellow,
    tracking: 0.08,
    lineHeight: TYPE.label.lead + 1,
  });
  y -= mm(6);
  // Same width rule as the cover: the halo is 90 % black on black, so the
  // title may run over it; what matters is that it stays on one line.
  const titleW = contentWidth(page) - mm(6);
  for (const line of wrap(doc.fonts.bold, TYPE.h1.size, FAQ_SHEET_TITLE.toUpperCase(), titleW)) {
    drawText(page, line, { x: margin.l, y, size: TYPE.h1.size, font: doc.fonts.bold, color: C.white, lineHeight: TYPE.h1.lead });
    y -= TYPE.h1.lead;
  }
  page.cursorY = bandY - 3 - mm(8);
}

/** Grey8 strip of label-over-value cells across the content width; `weights` share the width unevenly. */
function controlStrip(doc: Doc, page: Page, cells: Array<[string, string]>, weights?: number[]): Page {
  const cw = contentWidth(page);
  const padX = mm(3);
  const padY = mm(2.2);
  const valueSize = 9;
  const valueLead = 11;
  const w = weights && weights.length === cells.length ? weights : cells.map(() => 1);
  const total = w.reduce((a, b) => a + b, 0);
  const colWs = w.map((n) => (cw * n) / total);
  const colX = colWs.map((_, i) => colWs.slice(0, i).reduce((a, b) => a + b, 0));
  const valueLines = cells.map(([, v], i) => wrap(doc.fonts.bold, valueSize, v, colWs[i] - padX * 2));
  const rows = Math.max(1, ...valueLines.map((l) => l.length));
  const stripH = padY * 2 + TYPE.label.lead + rows * valueLead;
  const p = ensureSpace(doc, page, stripH + mm(6));
  const top = p.cursorY;
  p.page.drawRectangle({ x: p.margin.l, y: top - stripH, width: cw, height: stripH, color: C.grey8 });
  p.page.drawRectangle({ x: p.margin.l, y: top - stripH, width: 3, height: stripH, color: C.yellow });
  cells.forEach(([label], i) => {
    const x = p.margin.l + colX[i] + padX + (i === 0 ? mm(1.5) : 0);
    drawText(p, label.toUpperCase(), {
      x,
      y: top - padY,
      size: TYPE.label.size,
      font: doc.fonts.regular,
      color: C.grey60,
      tracking: TYPE.label.tracking,
      lineHeight: TYPE.label.lead,
    });
    let y = top - padY - TYPE.label.lead;
    for (const line of valueLines[i]) {
      drawText(p, line, { x, y, size: valueSize, font: doc.fonts.bold, color: C.black, lineHeight: valueLead });
      y -= valueLead;
    }
  });
  p.cursorY = top - stripH - mm(6);
  return p;
}

/** Question in bold, answer in body copy; the question never sits alone at the foot of a page. */
function questionAnswer(doc: Doc, page: Page, faq: FaqEntry): Page {
  const cw = contentWidth(page);
  const qLines = wrap(doc.fonts.bold, TYPE.body.size, faq.question, cw);
  const aLines = wrap(doc.fonts.regular, TYPE.body.size, faq.answer, cw);
  // Keep the question with at least two lines of its answer.
  const needed = (qLines.length + Math.min(2, aLines.length)) * TYPE.body.lead + mm(1);
  let p = ensureSpace(doc, page, needed);
  body(p, faq.question, { bold: true, after: mm(1) });
  p = doc.current ?? p;
  body(p, faq.answer, { after: mm(4) });
  p = doc.current ?? p;
  return p;
}

// ─── Formatting ────────────────────────────────────────────────────────────

/** `ASU-FQ-<yymm>` — one public sheet per month; the revision letter stays "A". */
export function faqSheetReference(d: Date): string {
  const yymm = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `ASU-FQ-${yymm}`;
}

export function faqSheetFilename(categoryTitle?: string): string {
  if (!categoryTitle) return "A-SAFE_FAQs.pdf";
  const safe = categoryTitle.replace(/&/g, "and").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `A-SAFE_FAQs-${safe}.pdf`;
}

function scopeLabel(count: number, categories: number): string {
  const q = `${count} ${count === 1 ? "question" : "questions"}`;
  const c = `${categories} ${categories === 1 ? "category" : "categories"}`;
  return `${q} · ${c}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
