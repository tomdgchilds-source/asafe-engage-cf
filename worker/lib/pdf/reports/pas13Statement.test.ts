import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument, PDFArray, PDFRawStream, PDFName, type PDFRef } from "pdf-lib";
import { pas13Verdict } from "../../../../shared/pas13Rules";
import { renderPas13Statement, buildPas13AlignmentReport, filenameFor, computeAggregate, type ReportLineItem } from "./pas13Statement";

const OUT = "/private/tmp/claude-501/-Users-thomaschilds/2d881f7c-dcfa-4f66-ba00-cbde0bc3613f/scratchpad/pas13-statement.pdf";

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

const ctx = { vehicleMassKg: 3200, loadMassKg: 1200, speedKmh: 8, approachAngleDeg: 45 };

function item(productName: string, ratedJ: number, quantity = 2): ReportLineItem {
  return {
    productName,
    quantity,
    verdict: pas13Verdict({ ...ctx, productRatedJoulesAt45deg: ratedJ, productImpactZoneMaxMm: 250 }),
  };
}

const lineItems: ReportLineItem[] = [
  item("iFlex Double Traffic Barrier+", 19200),
  item("iFlex RackEnd Barrier", 12000, 4),
  item("iFlex Pedestrian 3 Rail Barrier", 2000, 6),
];

const input = {
  orderNumber: "ASU-2026-0417",
  customOrderNumber: "GFL-PO-88",
  generatedAt: new Date("2026-09-12T09:30:00Z"),
  customerName: "Amira Khalil",
  customerCompany: "Gulf Freight Logistics LLC",
  projectName: "Warehouse 4 impact protection",
  projectLocation: "Al Quoz Industrial Area 3, Dubai",
  vehicleContext: { label: "Counterbalance forklift, 4.4 t @ 8 km/h", ...ctx },
  lineItems,
  appOrigin: "https://engage.asafe.ae",
  preparedBy: "Rami Haddad",
  preparedByTitle: "Area Sales Manager, A-SAFE UAE",
};

describe("renderPas13Statement", () => {
  it("renders 2–4 A4 pages with the required content and footnote", async () => {
    const started = Date.now();
    const out = await renderPas13Statement(input);
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
    expect(pdf.getPageCount()).toBeLessThanOrEqual(4);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 0);
    expect(height).toBeCloseTo(841.89, 0);
    expect(elapsed).toBeLessThan(4000);

    expect(out.filename).toBe("PAS_13_Alignment_Statement-ASU-2026-0417.pdf");
    expect(out.reference).toBe("ASU-PS-2609-0417");
    expect(out.aggregateVerdict).toBe("not_aligned");
    expect(out.worstCaseSafetyMarginPct).toBeLessThan(0);
    expect(out.citedSections.map((c) => c.section)).toContain("6.1");

    expect(await containsText(out.pdf, "PAS 13 ALIGNMENT STATEMENT")).toBe(true);
    expect(await containsText(out.pdf, "PRODUCT ALIGNMENT")).toBe(true);
    expect(await containsText(out.pdf, "Indicative")).toBe(true);
    expect(await containsText(out.pdf, "compliant")).toBe(false);
  });

  it("keeps the legacy alias and filename helper", async () => {
    expect(buildPas13AlignmentReport).toBe(renderPas13Statement);
    expect(filenameFor("A/B 12")).toBe("PAS_13_Alignment_Statement-A_B_12.pdf");
  });

  it("aggregates the worst verdict and margin", () => {
    const agg = computeAggregate(lineItems);
    expect(agg.notAlignedCount).toBeGreaterThanOrEqual(1);
    expect(agg.verdict).toBe("not_aligned");
    expect(computeAggregate([item("Big barrier", 90000)]).verdict).toBe("aligned");
    expect(computeAggregate([]).worstMarginPct).toBe(0);
  });

  it("renders without a vehicle context and as a draft", async () => {
    const out = await renderPas13Statement({ ...input, vehicleContext: null, status: "DRAFT", lineItems: lineItems.slice(0, 1) });
    const pdf = await PDFDocument.load(out.pdf);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(await containsText(out.pdf, "DRAFT")).toBe(true);
  });
});
