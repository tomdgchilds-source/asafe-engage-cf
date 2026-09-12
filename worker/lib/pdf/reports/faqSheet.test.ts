import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument, PDFArray, PDFRawStream, PDFName, type PDFRef } from "pdf-lib";
import type { FaqEntry } from "../../../../shared/faqContent";
import {
  renderFaqSheetFromFaqs,
  selectFaqs,
  groupByCategory,
  faqSheetReference,
  faqSheetFilename,
} from "./faqSheet";

const OUT = "/private/tmp/claude-501/-Users-thomaschilds/2d881f7c-dcfa-4f66-ba00-cbde0bc3613f/scratchpad/faq-sheet.pdf";

/** pdf-lib deflates content streams and writes text as hex; inflate and search. */
async function containsText(bytes: Uint8Array, s: string): Promise<boolean> {
  const hex = Array.from(s, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("").toLowerCase();
  const pdf = await PDFDocument.load(bytes);
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents();
    if (!contents) continue;
    const refs: PDFRef[] = contents instanceof PDFArray ? (contents.asArray() as PDFRef[]) : [contents as unknown as PDFRef];
    for (const ref of refs) {
      const stream = pdf.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) continue;
      const filter = stream.dict.get(PDFName.of("Filter"));
      const text = filter ? inflateSync(stream.contents).toString("latin1") : Buffer.from(stream.contents).toString("latin1");
      if (text.toLowerCase().includes(hex)) return true;
    }
  }
  return false;
}

const LONG =
  "A-SAFE barriers are made from an advanced polymer that flexes on impact, absorbs the energy and returns to shape, so the floor, the vehicle and the barrier itself are protected. Because the energy is dissipated in the barrier rather than transferred to the slab, floor fixings stay sound and the barrier stays in service after repeated strikes, which is where most of the whole-life saving against steel comes from.";

function faq(n: number, category: string): FaqEntry {
  return {
    id: `fixture-${category}-${n}`,
    category,
    question: `Fixture question ${n}: what happens when a forklift hits the barrier at speed?`,
    answer: `${LONG} (${n})`,
  };
}

/** 12 FAQs across 3 categories: 5 + 4 + 3, plus 2 internal ones the default selection drops. */
const fixture: FaqEntry[] = [
  ...[1, 2, 3, 4, 5].map((n) => faq(n, "product-technology")),
  ...[6, 7, 8, 9].map((n) => faq(n, "safety-performance")),
  ...[10, 11, 12].map((n) => faq(n, "business-roi")),
];
const internal: FaqEntry[] = [faq(13, "app-usage-platform"), faq(14, "app-usage-platform")];

describe("renderFaqSheetFromFaqs", () => {
  it("renders 12 fixture FAQs across 3 categories on at least 2 A4 pages", async () => {
    const started = Date.now();
    const out = await renderFaqSheetFromFaqs([...fixture, ...internal], { issuedOn: new Date("2026-09-12T09:30:00Z") });
    const elapsed = Date.now() - started;
    try {
      mkdirSync(OUT.slice(0, OUT.lastIndexOf("/")), { recursive: true });
      writeFileSync(OUT, out.pdf);
    } catch {
      /* best effort */
    }
    expect(new TextDecoder("latin1").decode(out.pdf.subarray(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(out.pdf);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 0);
    expect(height).toBeCloseTo(841.89, 0);
    expect(elapsed).toBeLessThan(4000);

    expect(out.count).toBe(12);
    expect(out.categories).toEqual(["product-technology", "safety-performance", "business-roi"]);
    expect(out.reference).toBe("ASU-FQ-2609");
    expect(out.filename).toBe("A-SAFE_FAQs.pdf");

    expect(await containsText(out.pdf, "A-SAFE FREQUENTLY ASKED QUESTIONS")).toBe(true);
    expect(await containsText(out.pdf, "PRODUCT & TECHNOLOGY")).toBe(true);
    expect(await containsText(out.pdf, "BUSINESS & ROI")).toBe(true);
    expect(await containsText(out.pdf, "Fixture question 12")).toBe(true);
    // Callout titles are drawn with letter tracking (one Tj per glyph), so assert on the body.
    expect(await containsText(out.pdf, "Our UAE team gives site-specific guidance")).toBe(true);
    expect(await containsText(out.pdf, "Call +971 4 884 2422")).toBe(true);
    // Internal (app usage) questions are left out by default.
    expect(await containsText(out.pdf, "Fixture question 13")).toBe(false);
  });

  it("filters by category and by ids, and names the file after a single category", async () => {
    const byCat = await renderFaqSheetFromFaqs(fixture, { categories: ["business-roi"], issuedOn: new Date("2026-01-05") });
    expect(byCat.count).toBe(3);
    expect(byCat.categories).toEqual(["business-roi"]);
    expect(byCat.filename).toBe("A-SAFE_FAQs-Business_and_ROI.pdf");
    expect(byCat.reference).toBe("ASU-FQ-2601");
    expect(await containsText(byCat.pdf, "Fixture question 10")).toBe(true);
    expect(await containsText(byCat.pdf, "Fixture question 1:")).toBe(false);

    const byIds = await renderFaqSheetFromFaqs([...fixture, ...internal], {
      ids: ["fixture-safety-performance-7", "fixture-app-usage-platform-13", "missing"],
      categories: ["business-roi"],
    });
    expect(byIds.count).toBe(2);
    expect(byIds.categories).toEqual(["safety-performance", "app-usage-platform"]);
  });

  it("renders an empty selection as a single page with a notice, and drafts with the watermark", async () => {
    const out = await renderFaqSheetFromFaqs(fixture, { ids: ["nothing"], status: "DRAFT" });
    const pdf = await PDFDocument.load(out.pdf);
    expect(out.count).toBe(0);
    expect(pdf.getPageCount()).toBe(1);
    expect(await containsText(out.pdf, "The category or question filter returned nothing")).toBe(true);
    expect(await containsText(out.pdf, "DRAFT")).toBe(true);
  });
});

describe("selection helpers", () => {
  it("selectFaqs: ids win over categories; default drops internal categories", () => {
    const all = [...fixture, ...internal];
    expect(selectFaqs(all).length).toBe(12);
    expect(selectFaqs(all, { categories: ["app-usage-platform"] }).length).toBe(2);
    expect(selectFaqs(all, { categories: [" product-technology ", ""] }).length).toBe(5);
    expect(selectFaqs(all, { ids: ["fixture-business-roi-12"], categories: ["product-technology"] }).map((f) => f.id)).toEqual([
      "fixture-business-roi-12",
    ]);
  });

  it("groupByCategory keeps canonical order and appends unknown categories last", () => {
    const groups = groupByCategory([faq(1, "zzz-custom"), faq(2, "business-roi"), faq(3, "product-technology"), faq(4, "aaa-custom")]);
    expect(groups.map((g) => g.key)).toEqual(["product-technology", "business-roi", "aaa-custom", "zzz-custom"]);
    expect(groups[0].title).toBe("Product & Technology");
    expect(groups[2].title).toBe("aaa custom");
  });

  it("reference and filename helpers", () => {
    expect(faqSheetReference(new Date("2025-12-31"))).toBe("ASU-FQ-2512");
    expect(faqSheetFilename()).toBe("A-SAFE_FAQs.pdf");
    expect(faqSheetFilename("Safety & Performance")).toBe("A-SAFE_FAQs-Safety_and_Performance.pdf");
  });
});
