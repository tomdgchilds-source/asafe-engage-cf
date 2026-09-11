import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFArray, PDFRawStream, PDFName, type PDFRef } from "pdf-lib";
import { createDoc, addPage, ensureSpace, finalize, mm, contentWidth } from "./doc";

const meta = {
  title: "Test Report",
  reference: "ASU-RA-2609-0001",
  revision: "A",
  issuedOn: "11 Sep 2026",
  docType: "Impact Protection Risk Assessment",
  status: "ISSUED" as const,
};

/**
 * pdf-lib deflates page content streams and writes text as hex strings.
 * Inflate every page's content and look for `s` in hex form.
 */
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
      const raw = stream.contents;
      const filter = stream.dict.get(PDFName.of("Filter"));
      const text = filter ? inflateSync(raw).toString("latin1") : Buffer.from(raw).toString("latin1");
      if (text.toLowerCase().includes(hex)) return true;
    }
  }
  return false;
}

describe("doc", () => {
  it("mm converts at 2.8346 pt", () => {
    expect(mm(10)).toBeCloseTo(28.346, 3);
    expect(mm(210)).toBeCloseTo(595.27, 1);
  });

  it("stamps 'n of N' footers and starts with %PDF-", async () => {
    const doc = await createDoc(meta);
    addPage(doc);
    addPage(doc);
    addPage(doc);
    const bytes = await finalize(doc);
    expect(new TextDecoder("latin1").decode(bytes.subarray(0, 5))).toBe("%PDF-");
    expect(await containsText(bytes, "1 of 3")).toBe(true);
    expect(await containsText(bytes, "2 of 3")).toBe(true);
    expect(await containsText(bytes, "3 of 3")).toBe(true);
    expect(await containsText(bytes, "Rev A")).toBe(true);
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(3);
    expect(loaded.getTitle()).toContain("ASU-RA-2609-0001");
  });

  it("uses A4 portrait with 18 mm margins and A3 landscape on request", async () => {
    const doc = await createDoc(meta);
    const a4 = addPage(doc);
    expect(a4.width).toBeCloseTo(595.28, 1);
    expect(a4.height).toBeCloseTo(841.89, 1);
    expect(a4.margin.l).toBeCloseTo(mm(18), 3);
    expect(contentWidth(a4)).toBeCloseTo(mm(174), 1);
    const a3 = addPage(doc, { size: "A3L" });
    expect(a3.width).toBeGreaterThan(a3.height);
    expect(a3.width).toBeCloseTo(1190.55, 1);
  });

  it("ensureSpace adds a page only when the cursor would overflow", async () => {
    const doc = await createDoc(meta);
    const p1 = addPage(doc);
    expect(ensureSpace(doc, p1, mm(50))).toBe(p1);
    p1.cursorY = p1.margin.b + mm(10);
    const p2 = ensureSpace(doc, p1, mm(50));
    expect(p2).not.toBe(p1);
    expect(p2.number).toBe(2);
    expect(doc.current).toBe(p2);
    expect(doc.pages.length).toBe(2);
  });

  it("draws a DRAFT watermark only on DRAFT documents", async () => {
    const draft = await createDoc({ ...meta, status: "DRAFT" });
    addPage(draft);
    const draftBytes = await finalize(draft);
    expect(await containsText(draftBytes, "DRAFT")).toBe(true);

    const issued = await createDoc(meta);
    addPage(issued);
    const issuedBytes = await finalize(issued);
    expect(await containsText(issuedBytes, "DRAFT")).toBe(false);
  });
});
