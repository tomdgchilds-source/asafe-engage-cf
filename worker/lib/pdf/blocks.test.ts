import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createDoc, addPage, finalize, mm, type Doc } from "./doc";
import {
  coverPage,
  sectionDivider,
  documentControl,
  kpiTiles,
  riskMatrix,
  table,
  chip,
  chipRow,
  photo,
  productCard,
  calloutBox,
  signOffBlock,
  hierarchyOfControls,
  letterTab,
} from "./blocks";
import { embedImage, sniffImage } from "./images";
import { brandAssetBytes } from "./assets";
import { SAMPLE_PHOTO_JPEG_B64 } from "./samplePhoto";
import { decodeBase64 } from "./assets";

const meta = {
  title: "Blocks",
  reference: "ASU-RA-2609-0003",
  revision: "B",
  issuedOn: "11 Sep 2026",
  docType: "Impact Protection Risk Assessment",
  status: "ISSUED" as const,
};

async function fresh(): Promise<Doc> {
  return createDoc(meta);
}

async function pageCount(doc: Doc): Promise<number> {
  const bytes = await finalize(doc);
  expect(new TextDecoder("latin1").decode(bytes.subarray(0, 5))).toBe("%PDF-");
  return (await PDFDocument.load(bytes)).getPageCount();
}

const JPEG = decodeBase64(SAMPLE_PHOTO_JPEG_B64);
// Minimal RIFF/WEBP header — enough to be sniffed, not a decodable image.
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);

describe("blocks", () => {
  it("coverPage with and without a hero photo", async () => {
    const doc = await fresh();
    await coverPage(doc, {
      heroImage: JPEG,
      docTypeLine: "Impact Protection Risk Assessment",
      title: "Al Quoz Distribution Centre",
      subtitle: "Survey",
      client: "Gulf Freight Logistics LLC",
      site: "Warehouse 4, Dubai",
      date: "11 September 2026",
      preparedBy: "R. Haddad",
      reference: "ASU-RA-2609-0003",
      status: "DRAFT",
    });
    await coverPage(doc, {
      docTypeLine: "Budgetary proposal",
      title: "No photo cover",
      client: "Client",
      site: "Site",
      date: "Date",
      preparedBy: "Rep",
      reference: "ASU-PR-2609-0001",
      status: "ISSUED",
    });
    expect(await pageCount(doc)).toBe(2);
  });

  it("sectionDivider with and without an image", async () => {
    const doc = await fresh();
    await sectionDivider(doc, { number: 1, title: "Executive summary" });
    await sectionDivider(doc, { number: 12, title: "Appendices", image: JPEG, strap: "Vehicle classes, energy method, photo index" });
    expect(await pageCount(doc)).toBe(2);
  });

  it("documentControl", async () => {
    const doc = await fresh();
    const page = addPage(doc);
    const r = documentControl(doc, page, [
      { key: "Reference", value: "ASU-RA-2609-0003" },
      { key: "Distribution", value: "A long distribution line ".repeat(8) },
    ]);
    expect(r.height).toBeGreaterThan(mm(20));
    expect(r.page).toBe(page);
    expect(await pageCount(doc)).toBe(1);
  });

  it("kpiTiles caps at four and draws tone strips", async () => {
    const doc = await fresh();
    const page = addPage(doc);
    const r = kpiTiles(doc, page, [
      { label: "Zones", value: "6" },
      { label: "Critical + high", value: "4", tone: "critical" },
      { label: "Investment", value: "AED 1,184,600", sublabel: "ex-VAT" },
      { label: "Photos", value: "23", tone: "low" },
      { label: "Ignored", value: "x" },
    ]);
    expect(r.height).toBeCloseTo(mm(28), 3);
    expect(await pageCount(doc)).toBe(1);
  });

  it("riskMatrix with highlights", async () => {
    const doc = await fresh();
    const page = addPage(doc);
    const counts = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0]);
    counts[4][4] = 2;
    counts[1][2] = 1;
    const r = riskMatrix(doc, page, counts, { highlight: [[5, 5]] });
    expect(r.height).toBeGreaterThan(mm(70));
    expect(await pageCount(doc)).toBe(1);
  });

  it("table repeats its header across page breaks", async () => {
    const doc = await fresh();
    const page = addPage(doc);
    const rows = Array.from({ length: 90 }, (_, i) => ({
      rank: i + 1,
      zone: `Zone ${i + 1} — a fairly long description that wraps onto a second line when needed`,
      level: { text: i % 3 === 0 ? "Critical" : "Low", chip: i % 3 === 0 ? ("critical" as const) : ("low" as const) },
      score: (i % 25) + 1,
    }));
    const r = table(doc, page, {
      headerStyle: "black",
      zebra: true,
      columns: [
        { key: "rank", label: "#", width: mm(10), align: "right" },
        { key: "zone", label: "Zone", width: mm(90) },
        { key: "level", label: "Level", width: mm(30) },
        { key: "score", label: "Score", width: mm(20), align: "right" },
      ],
      rows,
    });
    expect(r.page.number).toBeGreaterThan(1);
    const n = await pageCount(doc);
    expect(n).toBeGreaterThanOrEqual(3);
  });

  it("chip and chipRow", async () => {
    const doc = await fresh();
    const page = addPage(doc);
    const before = page.cursorY;
    const c = chip(page, "Critical", "critical");
    expect(c.height).toBeCloseTo(mm(6), 3);
    expect(page.cursorY).toBeLessThan(before);
    const fixed = chip(page, "Immediate", "black", { x: mm(100), y: mm(100) });
    expect(fixed.width).toBeGreaterThan(mm(10));
    const r = chipRow(page, Array.from({ length: 30 }, (_, i) => ({ label: `Tag ${i}`, tone: "grey" as const })));
    expect(r.height).toBeGreaterThan(mm(12));
    expect(await pageCount(doc)).toBe(1);
  });

  it("photo embeds JPEG and draws a placeholder for WebP", async () => {
    const doc = await fresh();
    const page = addPage(doc);
    const a = await photo(doc, page, JPEG, { maxW: mm(100), maxH: mm(60), caption: "Fig 4.2 — Zone B, loading dock 3, 11 Sep 2026", tags: ["Rack end", "Forklift"] });
    expect(a.height).toBeGreaterThan(mm(60));
    const b = await photo(doc, page, WEBP, { maxW: mm(80), maxH: mm(60), caption: "Placeholder" });
    expect(b.height).toBeGreaterThan(mm(40));
    const c = await photo(doc, page, null, { maxW: mm(80), maxH: mm(60) });
    expect(c.height).toBeGreaterThan(mm(40));
    expect(await pageCount(doc)).toBe(1);
  });

  it("productCard with and without image and prices", async () => {
    const doc = await fresh();
    const page = addPage(doc);
    const png = brandAssetBytes("iconYellow");
    const a = await productCard(doc, page, {
      image: png,
      name: "iFlex RackEnd Barrier",
      family: "iFlex",
      testedEnergyJ: 19200,
      keySpecs: ["Tested to PAS 13:2017", "2.4 m length"],
      why: "Keeps the truck off the upright.",
      quantityLine: "4 × 2.4 m",
      unitPriceAed: 6850,
      lineTotalAed: 27400,
    });
    const b = await productCard(doc, page, {
      name: "Pedestrian Barrier",
      family: "iFlex",
      testedEnergyJ: 4700,
      keySpecs: [],
      why: "",
    });
    expect(a.height).toBeGreaterThan(b.height);
    expect(await pageCount(doc)).toBe(1);
  });

  it("calloutBox in all three tones", async () => {
    const doc = await fresh();
    const page = addPage(doc);
    for (const tone of ["yellow", "black", "grey"] as const) {
      const r = calloutBox(doc, page, { tone, title: "Note", body: "Body ".repeat(60) });
      expect(r.height).toBeGreaterThan(mm(15));
    }
    expect(await pageCount(doc)).toBe(1);
  });

  it("signOffBlock wraps beyond three parties", async () => {
    const doc = await fresh();
    const page = addPage(doc);
    const r = signOffBlock(doc, page, [
      { role: "Technical", name: "A", title: "Engineer", date: "11 Sep 2026" },
      { role: "Commercial" },
      { role: "Marketing" },
      { role: "Client" },
    ]);
    expect(r.height).toBeCloseTo(mm(80), 1);
    expect(await pageCount(doc)).toBe(1);
  });

  it("hierarchyOfControls and letterTab", async () => {
    const doc = await fresh();
    const page = addPage(doc);
    await letterTab(doc, page);
    const r = hierarchyOfControls(doc, page);
    expect(r.height).toBeGreaterThan(mm(55));
    expect(await pageCount(doc)).toBe(1);
  });

  it("blocks break to a new page when the cursor is near the bottom", async () => {
    const doc = await fresh();
    const page = addPage(doc);
    page.cursorY = page.margin.b + mm(10);
    const r = calloutBox(doc, page, { tone: "grey", body: "Overflow" });
    expect(r.page.number).toBe(2);
    expect(await pageCount(doc)).toBe(2);
  });
});

describe("images", () => {
  it("sniffs formats by magic bytes", () => {
    expect(sniffImage(JPEG)).toBe("jpeg");
    expect(sniffImage(brandAssetBytes("iconBlack"))).toBe("png");
    expect(sniffImage(WEBP)).toBe("webp");
    expect(sniffImage(new Uint8Array(20))).toBe("unknown");
  });

  it("embedImage returns dimensions for JPEG/PNG and null otherwise, caching by content", async () => {
    const doc = await fresh();
    const a = await embedImage(doc, JPEG);
    expect(a).not.toBeNull();
    expect(a!.width).toBe(480);
    expect(a!.height).toBe(320);
    const b = await embedImage(doc, JPEG);
    expect(b!.image).toBe(a!.image);
    expect(await embedImage(doc, WEBP)).toBeNull();
    expect(await embedImage(doc, new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
