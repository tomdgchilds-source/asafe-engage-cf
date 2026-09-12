import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PDFDocument } from "pdf-lib";
import { computeTotals, cartItemsToPricingLines, normaliseComplexity } from "../../../../shared/pricing";
import { decodeBase64 } from "../assets";
import { SAMPLE_PHOTO_JPEG_B64 } from "../samplePhoto";
import { PDFName, PDFRawStream, PDFArray, PDFStream, decodePDFRawStream, rgb, type PDFPage } from "pdf-lib";
import {
  buildProposalModel,
  renderProposalModel,
  quoteDraftToProposalModel,
  totalsForOrder,
  drawingExportCaption,
  drawingExportIsStale,
  DRAWING_EXPORT_STALE_NOTE,
  type RenderMeta,
} from "./proposal";
import { renderOrderFormModel } from "./orderForm";
import type { OrderBundle, ProductInfo, SurveyBundle } from "./shared";

const OUT_DIR = process.env.PDF_SAMPLE_DIR ?? "/private/tmp/claude-501/-Users-thomaschilds/2d881f7c-dcfa-4f66-ba00-cbde0bc3613f/scratchpad";

// Smallest valid 1×1 JPEG (baseline, grey). pdf-lib embeds it happily.
const ONE_PX_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";
const onePx = () => decodeBase64(ONE_PX_JPEG_B64);

function product(name: string, family: string, energy: number, img: Uint8Array | null): ProductInfo {
  return {
    id: `p-${name}`,
    name,
    family,
    sku: `${name.slice(0, 3).toUpperCase()}-001`,
    testedEnergyJ: energy,
    keySpecs: [`Tested to PAS 13:2017 at ${energy.toLocaleString("en-GB")} J`, "Memaplex polymer", "Deflection zone 250 mm"],
    description: "Polymer safety barrier that absorbs impact and returns to shape.",
    datasheetUrl: "https://www.asafe.com/datasheets/iflex.pdf",
    deflectionZoneMm: 250,
    imageRef: null,
    imageBytes: img,
  };
}

const items = [
  { id: "l1", productName: "iFlex Single Traffic", quantity: 1, unitPrice: 410, pricingType: "linear_meter", lengthMeters: 24, requiresDelivery: true, requiresInstallation: true, zoneName: "Aisle 4 rack ends", applicationArea: "Racking" },
  { id: "l2", productName: "Bollard Bumper", quantity: 6, unitPrice: 320, pricingType: "per_item", requiresDelivery: true, requiresInstallation: true, zoneName: "Dock 3", applicationArea: "Loading dock" },
];

function surveyBundle(): SurveyBundle {
  const survey = {
    id: "s1",
    userId: "u1",
    title: "Al Quoz DC survey",
    facilityName: "Gulf Freight Logistics LLC",
    facilityLocation: "Al Quoz Industrial Area 3, Dubai",
    surveyDate: new Date("2026-09-09T08:00:00Z"),
  } as unknown as SurveyBundle["survey"];
  const area = (id: string, zoneName: string, riskLevel: string, rank: number, score: number) =>
    ({ id, siteSurveyId: "s1", zoneName, areaName: zoneName, areaType: "racking", riskLevel, priorityRank: rank, riskScore: score, recommendedProducts: [{ productName: "iFlex Single Traffic" }], recommendedLengthM: 24, estimatedCost: null }) as unknown as SurveyBundle["areas"][number];
  return {
    survey,
    areas: [area("a1", "Aisle 4 rack ends", "critical", 1, 25), area("a2", "Dock 3", "high", 2, 16), area("a3", "Yard columns", "medium", 3, 9)],
    photos: [{ id: "ph1", areaId: "a1", zoneName: "Aisle 4 rack ends", objectKey: "surveys/s1/ph1.jpg", ref: "/api/objects/surveys/s1/ph1.jpg", takenAt: null, tags: ["Unprotected rack end"], bytes: decodeBase64(SAMPLE_PHOTO_JPEG_B64) }],
    owner: { name: "Rami Haddad", title: "Area Sales Manager", email: "rami@asafe.ae", mobile: "+971 50 000 0000", company: "A-SAFE DWC LLC" },
    products: new Map(),
  };
}

/** One-page A3 landscape "vector export" fixture: a framed rectangle and a title, as the layout export route would store. */
let exportFixture: Uint8Array | null = null;
async function exportPdfBytes(): Promise<Uint8Array> {
  if (exportFixture) return exportFixture;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([1190.55, 841.89]);
  page.drawRectangle({ x: 40, y: 40, width: 1110, height: 760, borderWidth: 2, borderColor: rgb(0, 0, 0) });
  page.drawRectangle({ x: 200, y: 300, width: 600, height: 40, color: rgb(1, 0.85, 0) });
  page.drawText("DWGAE002882 Rev 02 — fixture export", { x: 60, y: 60, size: 18 });
  exportFixture = await pdf.save();
  return exportFixture;
}

/** Text drawn on a page: every hex string operand in its content streams, decoded (Helvetica/WinAnsi maps ASCII 1:1). */
function pageText(pdf: PDFDocument, page: PDFPage): string {
  const contents = page.node.get(PDFName.of("Contents"));
  const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  let out = "";
  for (const ref of refs) {
    const stream = pdf.context.lookup(ref);
    if (!(stream instanceof PDFStream)) continue;
    const bytes = stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents();
    const raw = new TextDecoder("latin1").decode(bytes);
    for (const m of raw.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      const hex = m[1];
      let s = "";
      for (let i = 0; i + 1 < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
      out += `${s}\n`;
    }
  }
  return out;
}

function bundle(opts: { snapshot?: boolean; survey?: boolean; drawing?: boolean; exportBytes?: Uint8Array; exportStale?: boolean } = {}): OrderBundle {
  const order = {
    id: "o1",
    userId: "u1",
    orderNumber: "ORD-1001",
    customOrderNumber: "ENG_QUOAE000123",
    currency: "AED",
    fxRateAtOrder: "1",
    items,
    customerCompany: "Gulf Freight Logistics LLC",
    customerName: "Aisha Khalil",
    customerJobTitle: "HSE Manager",
    customerEmail: "aisha@example.ae",
    customerMobile: "+971 50 555 0100",
    installationComplexity: "standard",
    partnerDiscountPercent: 0,
    discountOptions: [{ title: "LinkedIn post", discountPercent: 5 }],
    reciprocalCommitments: {
      commitments: [{ title: "LinkedIn post", description: "One post within 30 days of go-live.", discountPercent: 5 }],
      totalDiscountPercent: 5,
      ...(opts.snapshot
        ? { pricing: { goodsAed: 11760, deliveryAed: 1132.16, installAed: 2280.11, discountPercentApplied: 5, discountAed: 588, servicePackageAed: 0, subtotalAed: 14584.27, vatAed: 0, totalAed: 14584.27 } }
        : {}),
    },
    serviceCareDetails: null,
    servicePackage: null,
    technicalSignature: { signed: true, signedBy: "Eng. Ahmed Saif", jobTitle: "Project Engineer", signedAt: "2026-09-10T09:00:00Z" },
    commercialSignature: null,
    marketingSignature: null,
    projectName: "Al Quoz Distribution Centre",
    projectLocation: "Warehouse 4, Al Quoz Industrial Area 3, Dubai",
    projectDescription: "Rack-end and dock protection.",
  } as unknown as OrderBundle["order"];
  return {
    order,
    items,
    owner: { name: "Rami Haddad", title: "Area Sales Manager", email: "rami@asafe.ae", mobile: "+971 50 000 0000", company: "A-SAFE DWC LLC" },
    project: { id: "pr1", name: "Al Quoz Distribution Centre", location: "Dubai", installationNotes: "150 mm slab confirmed by the client; charging bay has underfloor cabling." } as unknown as OrderBundle["project"],
    survey: opts.survey === false ? null : surveyBundle(),
    products: new Map([
      ["iFlex Single Traffic", product("iFlex Single Traffic", "iFlex", 17000, onePx())],
      ["Bollard Bumper", product("Bollard Bumper", "Bollards", 11000, onePx())],
    ]),
    layoutDrawing: opts.drawing
      ? {
          id: "ld1",
          fileType: "image",
          fileUrl: "/api/objects/x.jpg",
          dwgNumber: "DWGAE002882",
          revision: "02",
          title: "A-SAFE barrier proposal",
          bytes: decodeBase64(SAMPLE_PHOTO_JPEG_B64),
          ...(opts.exportBytes
            ? { exportObjectKey: "layout-exports/ld1/v3.pdf", exportVersion: 3, documentVersion: opts.exportStale ? 5 : 3, exportBytes: opts.exportBytes }
            : {}),
        }
      : null,
    appOrigin: "https://engage.example",
  };
}

const meta = (status: "DRAFT" | "ISSUED"): RenderMeta => ({ status, reference: status === "ISSUED" ? "ASU-PR-2609-0001" : "DRAFT", revision: "A", issuedOn: new Date("2026-09-12T10:00:00Z") });

async function load(bytes: Uint8Array, name: string) {
  expect(new TextDecoder("latin1").decode(bytes.subarray(0, 5))).toBe("%PDF-");
  const pdf = await PDFDocument.load(bytes);
  try {
    mkdirSync(dirname(`${OUT_DIR}/${name}`), { recursive: true });
    writeFileSync(`${OUT_DIR}/${name}`, bytes);
  } catch {
    /* scratchpad unavailable */
  }
  return pdf;
}

describe("buildProposalModel", () => {
  it("returns totals equal to computeTotals on the fixture when no snapshot is stored", () => {
    const b = bundle();
    const model = buildProposalModel(b);
    const expected = computeTotals({
      lines: cartItemsToPricingLines(items),
      complexity: normaliseComplexity("standard"),
      reciprocalDiscountPercent: 5,
      partnerDiscountPercent: 0,
      socialDiscountPercent: 0,
      servicePackageAed: 0,
      vatPercent: 0,
    });
    expect(model.totals.source).toBe("computed");
    expect(model.totals.goodsAed).toBe(expected.goodsAed);
    expect(model.totals.deliveryAed).toBe(expected.deliveryAed);
    expect(model.totals.installAed).toBe(expected.installAed);
    expect(model.totals.discountAed).toBe(expected.discountAed);
    expect(model.totals.subtotalAed).toBe(expected.subtotalAed);
    expect(model.totals.totalAed).toBe(expected.totalAed);
    expect(model.lines.map((l) => l.totalAed)).toEqual(expected.lines.map((l) => l.lineTotalAed));
    expect(model.lines[0].perMetre).toBe(true);
    expect(model.lines[0].lengthM).toBe(24);
  });

  it("reads the stored pricing snapshot verbatim when present", () => {
    const t = totalsForOrder(bundle({ snapshot: true }));
    expect(t.source).toBe("snapshot");
    expect(t.totalAed).toBe(14584.27);
    expect(t.discountAed).toBe(588);
  });

  it("builds zones from the survey in rank order, and by family without one", () => {
    const withSurvey = buildProposalModel(bundle());
    expect(withSurvey.zones.map((z) => z.zone)).toEqual(["Aisle 4 rack ends", "Dock 3", "Yard columns"]);
    expect(withSurvey.zones[0].riskLevel).toBe("critical");
    expect(withSurvey.zones[0].indicativeAed).toBe(9840);
    expect(withSurvey.heroImage).not.toBeNull();
    const noSurvey = buildProposalModel(bundle({ survey: false }));
    expect(noSurvey.zones).toHaveLength(2);
    expect(noSurvey.survey).toBeNull();
    expect(noSurvey.products.map((p) => p.name)).toEqual(["iFlex Single Traffic", "Bollard Bumper"]);
  });
});

describe("renderProposalModel", () => {
  it("renders at least seven pages with two 1×1 JPEG product images", async () => {
    const started = Date.now();
    const bytes = await renderProposalModel(buildProposalModel(bundle()), meta("ISSUED"));
    const pdf = await load(bytes, "proposal-issued.pdf");
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(7);
    expect(Date.now() - started).toBeLessThan(6000);
  });

  it("adds the drawing page when an image layout exists and renders a DRAFT", async () => {
    const withDrawing = await renderProposalModel(buildProposalModel(bundle({ drawing: true })), meta("DRAFT"));
    const without = await renderProposalModel(buildProposalModel(bundle()), meta("DRAFT"));
    const a = await load(withDrawing, "proposal-draft-drawing.pdf");
    const b = await PDFDocument.load(without);
    expect(a.getPageCount()).toBe(b.getPageCount() + 1);
  });

  it("prefers the vector export: adds exactly one A4 landscape page carrying the export and its caption", async () => {
    const exportBytes = await exportPdfBytes();
    const withExport = await renderProposalModel(buildProposalModel(bundle({ drawing: true, exportBytes })), meta("DRAFT"));
    const without = await renderProposalModel(buildProposalModel(bundle()), meta("DRAFT"));
    const a = await load(withExport, "proposal-draft-export.pdf");
    const b = await PDFDocument.load(without);
    expect(a.getPageCount()).toBe(b.getPageCount() + 1);
    const landscape = a.getPages().filter((p) => p.getWidth() > p.getHeight());
    expect(landscape).toHaveLength(1);
    expect(Math.round(landscape[0].getWidth())).toBe(842);
    expect(Math.round(landscape[0].getHeight())).toBe(595);
    // The export is embedded as a form XObject on that page, not rasterised.
    const xobjects = landscape[0].node.Resources()?.lookup(PDFName.of("XObject"));
    expect(String(xobjects)).toMatch(/EmbeddedPdfPage/);
    const text = pageText(a, landscape[0]);
    expect(text).toContain("Layout drawing DWGAE002882 Rev 02");
    expect(text).toContain("export v3");
    expect(text).not.toContain(DRAWING_EXPORT_STALE_NOTE);
    expect(drawingExportCaption({ dwgNumber: "DWGAE002882", revision: "02", exportVersion: 3 })).toBe("Layout drawing DWGAE002882 Rev 02 — export v3");
    expect(drawingExportIsStale({ exportVersion: 3, documentVersion: 3 })).toBe(false);
  });

  it("prints the stale note on the export page when export_version lags document_version", async () => {
    const exportBytes = await exportPdfBytes();
    const bytes = await renderProposalModel(buildProposalModel(bundle({ drawing: true, exportBytes, exportStale: true })), meta("ISSUED"));
    const pdf = await load(bytes, "proposal-issued-export-stale.pdf");
    const landscape = pdf.getPages().filter((p) => p.getWidth() > p.getHeight());
    expect(landscape).toHaveLength(1);
    expect(pageText(pdf, landscape[0])).toContain(DRAWING_EXPORT_STALE_NOTE);
    expect(drawingExportIsStale({ exportVersion: 3, documentVersion: 5 })).toBe(true);
  });

  it("renders a rep quote draft through the same model", async () => {
    const model = quoteDraftToProposalModel({
      quoteId: "q-1234-abcd",
      generatedAt: new Date("2026-09-12T10:00:00Z"),
      customerCompany: "Dnata Cargo",
      projectName: "T2 cargo terminal",
      zones: [{ name: "Dock A", selectedProductName: "iFlex Single Traffic", quantityOrLengthMeters: 12, pricingMode: "per_length", extendedAed: 4920, pas13Verdict: "aligned" }],
      lineItems: [{ productId: "p1", productName: "iFlex Single Traffic", sku: "IST-2M", quantityOrLengthMeters: 12, pricingMode: "per_length", unitPriceAed: 410, extendedAed: 4920 }],
      totals: { subtotalAed: 4920, serviceCareAed: 954, serviceCareLabel: "Service Care (standard)", vatAed: 294, vatPct: 5, grandTotalAed: 6168 },
    });
    expect(model.totals.source).toBe("quote");
    expect(model.totals.totalAed).toBe(6168);
    const pdf = await load(await renderProposalModel(model, meta("DRAFT")), "quote-draft.pdf");
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(6);
  });
});

describe("renderOrderFormModel", () => {
  it("renders scope, terms and acceptance as at least three pages", async () => {
    const bytes = await renderOrderFormModel(buildProposalModel(bundle({ snapshot: true })), { ...meta("ISSUED"), reference: "ASU-OF-2609-0001" });
    const pdf = await load(bytes, "order-form-issued.pdf");
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
  });
});
