// ────────────────────────────────────────────────────────────────────────────
// worker/lib/quoteDraftPdf.ts
//
// Server-side renderer for the rep-facing Quote DRAFT PDF.
//
// STRATEGY: same pure-TS PDF byte builder strategy as D's
// pas13AlignmentReportPdf.ts — base-14 fonts only, no third-party PDF
// library, runs cleanly on the Cloudflare Workers runtime. The builder
// itself is duplicated rather than refactored into a shared core because
// (a) the two PDFs have different page layouts and (b) the builder
// surface is small (~250 lines) and a refactor would risk D's existing
// PAS 13 report. We can fold the two together later if a third PDF type
// emerges and the duplication starts hurting.
//
// Wording rule (HARD):
//   - "QUOTE DRAFT — REP REVIEW" banner is non-removable on every page.
//     The PDF must never be confused with a final invoice or contract.
//   - "PAS 13 aligned" / "borderline alignment" / "not PAS 13 aligned" —
//     never "compliant" (per legal guidance, mirrors σ).
//   - "Indicative — verify with A-SAFE engineering for procurement"
//     footnote is rendered on EVERY page.
//   - Disclaimer block: "Quote draft generated <ts>. Pricing valid 30
//     days. Subject to A-SAFE engineering review."
// ────────────────────────────────────────────────────────────────────────────

import type { Pas13Verdict, Verdict } from "../../shared/pas13Rules";
import { pas13Cite, type Pas13Citation, PAS13_PDF_URL } from "../../shared/pas13Citations";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface QuoteZoneForPdf {
  name: string;
  designVehicle: {
    name: string;
    massKg: number;
    speedKmh: number;
    pas13Class: string;
  } | null;
  selectedProductName: string;
  selectedProductSku: string | null;
  quantityOrLengthMeters: number;
  pricingMode: "per_length" | "per_unit";
  unitPriceAed: number;
  extendedAed: number;
  pas13Verdict: Verdict;
  rationale: string;
  citedSections: string[]; // e.g. ["6.1", "5.10"]
}

export interface QuoteLineItemForPdf {
  productId: string;
  productName: string;
  sku: string | null;
  quantityOrLengthMeters: number;
  pricingMode: "per_length" | "per_unit";
  unitPriceAed: number;
  extendedAed: number;
  /** Set when the line item was assembled without a unit price (sparse
   * accessory data). Renders as "Contact A-SAFE for quote". */
  priceMissing?: boolean;
}

export interface QuoteTotalsForPdf {
  subtotalAed: number;
  serviceCareAed?: number;
  serviceCareLabel?: string;
  vatAed?: number;
  vatPct?: number;
  grandTotalAed: number;
}

export interface QuoteDraftPdfInput {
  quoteId: string;
  generatedAt: Date;
  customerCompany?: string | null;
  customerName?: string | null;
  projectName?: string | null;
  projectLocation?: string | null;
  zones: QuoteZoneForPdf[];
  lineItems: QuoteLineItemForPdf[];
  totals: QuoteTotalsForPdf;
  aggregatePas13Verdict: Verdict;
  notes: string;
  appOrigin: string;
}

export interface QuoteDraftPdfOutput {
  pdf: Uint8Array;
  filename: string;
}

// ─── Public entry point ────────────────────────────────────────────────────

export function buildQuoteDraftPdf(input: QuoteDraftPdfInput): QuoteDraftPdfOutput {
  const builder = new PdfBuilder();
  renderQuotePages(builder, input);
  builder.finalise();
  return {
    pdf: builder.bytes(),
    filename: filenameFor(input.quoteId),
  };
}

export function filenameFor(quoteId: string): string {
  const safe = quoteId.replace(/[^A-Za-z0-9._-]+/g, "_");
  return `Quote_Draft-${safe}.pdf`;
}

// ─── Page rendering ────────────────────────────────────────────────────────

function renderQuotePages(pdf: PdfBuilder, input: QuoteDraftPdfInput): void {
  pdf.startPage();

  // Top: A-SAFE yellow header band
  pdf.fillRect(MARGIN_X, PAGE_H - MARGIN_TOP - 30, PAGE_W - 2 * MARGIN_X, 30, ASAFE_YELLOW);
  pdf.text("A-SAFE", MARGIN_X + 14, PAGE_H - MARGIN_TOP - 18, {
    font: "Helvetica-Bold",
    size: 16,
    color: BLACK,
  });
  pdf.text("QUOTE", PAGE_W - MARGIN_X - 14, PAGE_H - MARGIN_TOP - 18, {
    font: "Helvetica-Bold",
    size: 11,
    color: BLACK,
    align: "right",
  });

  // BIG non-removable DRAFT banner — top-of-page
  let y = PAGE_H - MARGIN_TOP - 70;
  pdf.fillRect(MARGIN_X, y - 30, PAGE_W - 2 * MARGIN_X, 30, RED_DARK);
  pdf.text(
    "QUOTE DRAFT - FOR REP REVIEW (NOT A FINAL INVOICE OR CONTRACT)",
    MARGIN_X + 14,
    y - 19,
    {
      font: "Helvetica-Bold",
      size: 12,
      color: WHITE,
    },
  );
  y -= 40;

  // Quote metadata block
  pdf.text(`Quote ID: ${input.quoteId}`, MARGIN_X, y, {
    font: "Helvetica-Bold",
    size: 11,
    color: BLACK,
  });
  y -= 14;
  const dateStr = input.generatedAt.toISOString().slice(0, 10);
  const timeStr = input.generatedAt.toISOString().slice(11, 16) + " UTC";
  pdf.text(`Generated: ${dateStr} ${timeStr}`, MARGIN_X, y, { size: 9, color: GREY });
  y -= 12;
  pdf.text("Status: DRAFT - subject to engineering review", MARGIN_X, y, {
    size: 9,
    color: RED_DARK,
    font: "Helvetica-Bold",
  });
  y -= 16;

  // Customer / project facts
  const facts: Array<[string, string]> = [];
  if (input.customerCompany) facts.push(["Customer", input.customerCompany]);
  if (input.customerName) facts.push(["Contact", input.customerName]);
  if (input.projectName) facts.push(["Project", input.projectName]);
  if (input.projectLocation) facts.push(["Location", input.projectLocation]);
  for (const [label, value] of facts) {
    pdf.text(`${label}:`, MARGIN_X, y, { size: 9, color: GREY });
    pdf.text(value, MARGIN_X + 75, y, { size: 9, color: BLACK });
    y -= 12;
  }
  y -= 6;

  // Aggregate PAS 13 verdict chip
  const chipColour =
    input.aggregatePas13Verdict === "aligned"
      ? GREEN_DARK
      : input.aggregatePas13Verdict === "borderline"
        ? AMBER_DARK
        : RED_DARK;
  const chipLabel =
    input.aggregatePas13Verdict === "aligned"
      ? "PAS 13 ALIGNED"
      : input.aggregatePas13Verdict === "borderline"
        ? "BORDERLINE ALIGNMENT"
        : "NOT PAS 13 ALIGNED";

  const chipH = 30;
  pdf.fillRect(MARGIN_X, y - chipH, PAGE_W - 2 * MARGIN_X, chipH, chipColour);
  pdf.text(chipLabel, MARGIN_X + 14, y - 14, {
    font: "Helvetica-Bold",
    size: 14,
    color: WHITE,
  });
  pdf.text(
    `Aggregate verdict across ${input.zones.length} zone${input.zones.length === 1 ? "" : "s"}`,
    PAGE_W - MARGIN_X - 14,
    y - 14,
    { size: 9, color: WHITE, align: "right" },
  );
  y -= chipH + 12;

  // Per-zone block header
  pdf.text("Per-zone recommendations", MARGIN_X, y, {
    font: "Helvetica-Bold",
    size: 11,
    color: BLACK,
  });
  y -= 4;
  pdf.fillRect(MARGIN_X, y, PAGE_W - 2 * MARGIN_X, 1, ASAFE_YELLOW);
  y -= 12;

  for (const zone of input.zones) {
    if (y < MARGIN_BOTTOM + 90) {
      renderFooter(pdf, input);
      pdf.startPage();
      y = PAGE_H - MARGIN_TOP - 24;
      // Repeat the DRAFT banner on continuation pages — non-removable.
      pdf.fillRect(MARGIN_X, y - 22, PAGE_W - 2 * MARGIN_X, 22, RED_DARK);
      pdf.text(
        "QUOTE DRAFT - FOR REP REVIEW (NOT A FINAL INVOICE OR CONTRACT)",
        MARGIN_X + 8,
        y - 14,
        { font: "Helvetica-Bold", size: 9, color: WHITE },
      );
      y -= 32;
    }

    // Zone name + verdict mini-chip on the right
    pdf.text(truncate(zone.name, 44), MARGIN_X, y, {
      font: "Helvetica-Bold",
      size: 10,
      color: BLACK,
    });
    const zoneChipColor =
      zone.pas13Verdict === "aligned"
        ? GREEN_DARK
        : zone.pas13Verdict === "borderline"
          ? AMBER_DARK
          : RED_DARK;
    const zoneChipLabel =
      zone.pas13Verdict === "aligned"
        ? "Aligned"
        : zone.pas13Verdict === "borderline"
          ? "Borderline"
          : "Not aligned";
    pdf.fillRect(PAGE_W - MARGIN_X - 80, y - 3, 80, 13, zoneChipColor);
    pdf.text(zoneChipLabel, PAGE_W - MARGIN_X - 76, y, {
      font: "Helvetica-Bold",
      size: 8,
      color: WHITE,
    });
    y -= 12;

    if (zone.designVehicle) {
      const dv = zone.designVehicle;
      const vehicleLine = `Design vehicle: ${dv.name} - ${dv.massKg.toLocaleString()} kg @ ${dv.speedKmh.toFixed(1)} km/h (PAS 13 ${dv.pas13Class})`;
      pdf.text(vehicleLine, MARGIN_X, y, { size: 8, color: GREY });
      y -= 11;
    }

    pdf.text(`Recommended: ${truncate(zone.selectedProductName, 60)}`, MARGIN_X, y, {
      size: 9,
      color: BLACK,
    });
    y -= 11;

    const pricingLabel =
      zone.pricingMode === "per_length"
        ? `${zone.quantityOrLengthMeters.toFixed(1)} m`
        : `x ${zone.quantityOrLengthMeters}`;
    const unitLabel = zone.pricingMode === "per_length" ? "/m" : "/unit";
    pdf.text(
      `${pricingLabel} @ AED ${zone.unitPriceAed.toLocaleString()}${unitLabel}  =  AED ${zone.extendedAed.toLocaleString()}`,
      MARGIN_X,
      y,
      { size: 9, color: BLACK },
    );
    pdf.text(
      `Cited: ${zone.citedSections.length > 0 ? zone.citedSections.map((s) => `§${s}`).join(" ") : "—"}`,
      PAGE_W - MARGIN_X,
      y,
      { size: 8, color: BLUE_LINK, align: "right" },
    );
    y -= 11;

    // Rationale — truncated for one-line.
    pdf.text(truncate(zone.rationale, 110), MARGIN_X, y, { size: 8, color: GREY });
    y -= 14;

    pdf.fillRect(MARGIN_X, y, PAGE_W - 2 * MARGIN_X, 0.3, FAINT_GREY);
    y -= 8;
  }

  // ─── Line items table ─────────────────────────────────────────────────
  if (y < MARGIN_BOTTOM + 120) {
    renderFooter(pdf, input);
    pdf.startPage();
    y = PAGE_H - MARGIN_TOP - 24;
    pdf.fillRect(MARGIN_X, y - 22, PAGE_W - 2 * MARGIN_X, 22, RED_DARK);
    pdf.text(
      "QUOTE DRAFT - FOR REP REVIEW (NOT A FINAL INVOICE OR CONTRACT)",
      MARGIN_X + 8,
      y - 14,
      { font: "Helvetica-Bold", size: 9, color: WHITE },
    );
    y -= 32;
  }

  pdf.text("Line items", MARGIN_X, y, { font: "Helvetica-Bold", size: 11, color: BLACK });
  y -= 4;
  pdf.fillRect(MARGIN_X, y, PAGE_W - 2 * MARGIN_X, 1, ASAFE_YELLOW);
  y -= 12;

  // Columns: SKU(80) | Product(220) | Qty(60) | Unit AED(70) | Ext AED(80)
  const colSku = MARGIN_X + 0;
  const colProduct = MARGIN_X + 80;
  const colQty = MARGIN_X + 300;
  const colUnit = MARGIN_X + 380;
  const colExt = MARGIN_X + 470;

  pdf.text("SKU", colSku + 2, y, { font: "Helvetica-Bold", size: 8, color: GREY });
  pdf.text("Product", colProduct + 2, y, { font: "Helvetica-Bold", size: 8, color: GREY });
  pdf.text("Qty/m", colQty + 60, y, { font: "Helvetica-Bold", size: 8, color: GREY, align: "right" });
  pdf.text("Unit (AED)", colUnit + 80, y, {
    font: "Helvetica-Bold",
    size: 8,
    color: GREY,
    align: "right",
  });
  pdf.text("Extended (AED)", colExt + 80, y, {
    font: "Helvetica-Bold",
    size: 8,
    color: GREY,
    align: "right",
  });
  y -= 4;
  pdf.fillRect(MARGIN_X, y, PAGE_W - 2 * MARGIN_X, 0.5, GREY);
  y -= 12;

  for (const item of input.lineItems) {
    if (y < MARGIN_BOTTOM + 100) {
      renderFooter(pdf, input);
      pdf.startPage();
      y = PAGE_H - MARGIN_TOP - 24;
      pdf.fillRect(MARGIN_X, y - 22, PAGE_W - 2 * MARGIN_X, 22, RED_DARK);
      pdf.text(
        "QUOTE DRAFT - FOR REP REVIEW (NOT A FINAL INVOICE OR CONTRACT)",
        MARGIN_X + 8,
        y - 14,
        { font: "Helvetica-Bold", size: 9, color: WHITE },
      );
      y -= 32;
    }

    pdf.text(item.sku || "—", colSku + 2, y, { size: 8, color: BLACK });
    pdf.text(truncate(item.productName, 44), colProduct + 2, y, { size: 8, color: BLACK });
    const qtyStr =
      item.pricingMode === "per_length"
        ? `${item.quantityOrLengthMeters.toFixed(1)} m`
        : `x ${item.quantityOrLengthMeters}`;
    pdf.text(qtyStr, colQty + 60, y, { size: 8, color: BLACK, align: "right" });

    if (item.priceMissing) {
      pdf.text("—", colUnit + 80, y, { size: 8, color: GREY, align: "right" });
      pdf.text("Contact A-SAFE", colExt + 80, y, {
        size: 8,
        color: AMBER_DARK,
        align: "right",
        font: "Helvetica-Bold",
      });
    } else {
      pdf.text(item.unitPriceAed.toLocaleString(), colUnit + 80, y, {
        size: 8,
        color: BLACK,
        align: "right",
      });
      pdf.text(item.extendedAed.toLocaleString(), colExt + 80, y, {
        size: 8,
        color: BLACK,
        align: "right",
        font: "Helvetica-Bold",
      });
    }
    y -= 12;
  }

  // ─── Totals block ────────────────────────────────────────────────────
  y -= 6;
  pdf.fillRect(MARGIN_X, y, PAGE_W - 2 * MARGIN_X, 0.5, GREY);
  y -= 14;

  const totals = input.totals;
  const totalsX = PAGE_W - MARGIN_X - 200;
  const totalsValueX = PAGE_W - MARGIN_X - 4;

  pdf.text("Subtotal", totalsX, y, { size: 9, color: GREY });
  pdf.text(`AED ${totals.subtotalAed.toLocaleString()}`, totalsValueX, y, {
    size: 9,
    color: BLACK,
    align: "right",
  });
  y -= 12;
  if (typeof totals.serviceCareAed === "number" && totals.serviceCareAed > 0) {
    pdf.text(totals.serviceCareLabel || "Service Care", totalsX, y, {
      size: 9,
      color: GREY,
    });
    pdf.text(`AED ${totals.serviceCareAed.toLocaleString()}`, totalsValueX, y, {
      size: 9,
      color: BLACK,
      align: "right",
    });
    y -= 12;
  }
  if (typeof totals.vatAed === "number" && totals.vatAed > 0) {
    pdf.text(`VAT (${(totals.vatPct ?? 0).toFixed(0)}%)`, totalsX, y, {
      size: 9,
      color: GREY,
    });
    pdf.text(`AED ${totals.vatAed.toLocaleString()}`, totalsValueX, y, {
      size: 9,
      color: BLACK,
      align: "right",
    });
    y -= 12;
  }
  pdf.fillRect(totalsX, y, 200, 0.5, BLACK);
  y -= 10;
  pdf.text("Grand total", totalsX, y, { font: "Helvetica-Bold", size: 11, color: BLACK });
  pdf.text(`AED ${totals.grandTotalAed.toLocaleString()}`, totalsValueX, y, {
    font: "Helvetica-Bold",
    size: 11,
    color: BLACK,
    align: "right",
  });
  y -= 24;

  // ─── Notes block ─────────────────────────────────────────────────────
  if (input.notes && input.notes.length > 0) {
    if (y < MARGIN_BOTTOM + 90) {
      renderFooter(pdf, input);
      pdf.startPage();
      y = PAGE_H - MARGIN_TOP - 24;
      pdf.fillRect(MARGIN_X, y - 22, PAGE_W - 2 * MARGIN_X, 22, RED_DARK);
      pdf.text(
        "QUOTE DRAFT - FOR REP REVIEW (NOT A FINAL INVOICE OR CONTRACT)",
        MARGIN_X + 8,
        y - 14,
        { font: "Helvetica-Bold", size: 9, color: WHITE },
      );
      y -= 32;
    }
    pdf.text("Summary", MARGIN_X, y, { font: "Helvetica-Bold", size: 10, color: BLACK });
    y -= 14;
    const wrapped = wrapLines(input.notes, 100);
    for (const line of wrapped) {
      if (y < MARGIN_BOTTOM + 60) break;
      pdf.text(line, MARGIN_X, y, { size: 9, color: BLACK });
      y -= 11;
    }
    y -= 6;
  }

  // ─── Disclaimer block ────────────────────────────────────────────────
  if (y < MARGIN_BOTTOM + 80) {
    renderFooter(pdf, input);
    pdf.startPage();
    y = PAGE_H - MARGIN_TOP - 24;
  }
  pdf.fillRect(MARGIN_X, y - 60, PAGE_W - 2 * MARGIN_X, 60, FAINT_GREY);
  pdf.text("Disclaimer", MARGIN_X + 8, y - 12, {
    font: "Helvetica-Bold",
    size: 9,
    color: BLACK,
  });
  const stamp = input.generatedAt.toISOString();
  const disclaimerLines = [
    `Quote draft generated ${stamp}. Pricing valid 30 days. Subject to A-SAFE engineering review.`,
    "This is a DRAFT for internal rep review only — it is NOT a final invoice or contract.",
    "PAS 13 verdicts are an indicative engineering interpretation of PAS 13:2017 — not a commercial-liability statement.",
    "For procurement, verify all alignment verdicts with A-SAFE engineering: sales@asafe.ae - +971 (4) 8842 422.",
  ];
  let dY = y - 24;
  for (const line of disclaimerLines) {
    pdf.text(line, MARGIN_X + 8, dY, { size: 8, color: BLACK });
    dY -= 9;
  }

  renderFooter(pdf, input);
}

function renderFooter(pdf: PdfBuilder, input: QuoteDraftPdfInput): void {
  const stamp = input.generatedAt.toISOString();
  const lineY = MARGIN_BOTTOM - 20;
  pdf.fillRect(MARGIN_X, lineY + 14, PAGE_W - 2 * MARGIN_X, 1.5, ASAFE_YELLOW);
  pdf.text(
    "Indicative - verify with A-SAFE engineering for procurement.",
    MARGIN_X,
    lineY,
    { font: "Helvetica-Bold", size: 8, color: BLACK },
  );
  pdf.text(`Quote draft - generated ${stamp}.`, MARGIN_X, lineY - 10, {
    size: 7,
    color: GREY,
  });
  pdf.text(
    `${input.appOrigin}${PAS13_PDF_URL}`,
    PAGE_W - MARGIN_X,
    lineY - 10,
    { size: 7, color: BLUE_LINK, align: "right" },
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)).trimEnd() + "…";
}

/** Naive word-wrap for the notes block. Doesn't break mid-word; lines
 * over the limit just spill until the next space. */
function wrapLines(s: string, maxChars: number): string[] {
  const out: string[] = [];
  const words = s.split(/\s+/);
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length <= maxChars) {
      line = (line + " " + w).trim();
    } else {
      if (line) out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out;
}

// ─── PdfBuilder — minimal PDF 1.4 byte writer ──────────────────────────────
//
// Same shape as worker/lib/pas13AlignmentReportPdf.ts. See that file's
// comments for the design rationale.
// ────────────────────────────────────────────────────────────────────────────

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_X = 36;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 60;

const ASAFE_YELLOW: RGB = [1.0, 0.78, 0.17];
const BLACK: RGB = [0.1, 0.1, 0.18];
const WHITE: RGB = [1, 1, 1];
const GREY: RGB = [0.42, 0.42, 0.47];
const FAINT_GREY: RGB = [0.95, 0.95, 0.96];
const GREEN_DARK: RGB = [0.1, 0.5, 0.27];
const AMBER_DARK: RGB = [0.85, 0.55, 0.07];
const RED_DARK: RGB = [0.78, 0.15, 0.15];
const BLUE_LINK: RGB = [0.16, 0.32, 0.78];

type RGB = [number, number, number];

interface TextOptions {
  font?: "Helvetica" | "Helvetica-Bold";
  size?: number;
  color?: RGB;
  align?: "left" | "right";
}

class PdfBuilder {
  private objects: Array<string | Uint8Array> = [];
  private pages: number[] = [];
  private currentContent: string[] = [];
  private currentPageId: number | null = null;
  private finalised: false | { bytes: Uint8Array } = false;

  constructor() {
    this.objects.push("");
    this.objects.push("");
    this.objects.push("");
    this.objects.push(this.fontObject("Helvetica"));
    this.objects.push(this.fontObject("Helvetica-Bold"));
  }

  startPage(): void {
    if (this.currentPageId !== null) this.flushPage();
    this.objects.push("");
    this.currentPageId = this.objects.length - 1;
    this.currentContent = [];
  }

  finalise(): void {
    if (this.currentPageId !== null) this.flushPage();
    if (this.finalised) return;

    this.objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
    const kids = this.pages.map((id) => `${id} 0 R`).join(" ");
    this.objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>`;

    const parts: Uint8Array[] = [];
    const enc = new TextEncoder();
    parts.push(enc.encode("%PDF-1.4\n%\xC3\xA1\xC3\xA9\xC3\xAD\xC3\xB3\n"));

    const offsets: number[] = [];
    let cursor = parts[0].byteLength;
    offsets.push(0);

    for (let i = 1; i < this.objects.length; i++) {
      const body = this.objects[i];
      offsets.push(cursor);
      const header = `${i} 0 obj\n`;
      const footer = `\nendobj\n`;
      const headerBytes = enc.encode(header);
      const footerBytes = enc.encode(footer);
      const bodyBytes = typeof body === "string" ? enc.encode(body) : body;
      parts.push(headerBytes, bodyBytes, footerBytes);
      cursor += headerBytes.byteLength + bodyBytes.byteLength + footerBytes.byteLength;
    }

    const xrefStart = cursor;
    let xref = `xref\n0 ${this.objects.length}\n`;
    xref += `0000000000 65535 f \n`;
    for (let i = 1; i < this.objects.length; i++) {
      xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    parts.push(enc.encode(xref));
    parts.push(
      enc.encode(
        `trailer\n<< /Size ${this.objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
      ),
    );

    let total = 0;
    for (const p of parts) total += p.byteLength;
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.byteLength;
    }
    this.finalised = { bytes: out };
  }

  bytes(): Uint8Array {
    if (!this.finalised) throw new Error("PdfBuilder.finalise() not called");
    return this.finalised.bytes;
  }

  fillRect(x: number, y: number, w: number, h: number, color: RGB): void {
    this.currentContent.push(
      `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg`,
      `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`,
    );
  }

  text(value: string, x: number, y: number, opts: TextOptions = {}): void {
    const font = opts.font ?? "Helvetica";
    const size = opts.size ?? 10;
    const color = opts.color ?? BLACK;
    const fontRef = font === "Helvetica-Bold" ? "F2" : "F1";
    const escaped = pdfEscape(value);

    let drawX = x;
    if (opts.align === "right") {
      const w = approxStringWidth(value, size, font === "Helvetica-Bold");
      drawX = x - w;
    }

    this.currentContent.push(
      `BT`,
      `/${fontRef} ${size} Tf`,
      `${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} rg`,
      `${drawX.toFixed(2)} ${y.toFixed(2)} Td`,
      `(${escaped}) Tj`,
      `ET`,
    );
  }

  private flushPage(): void {
    const pageId = this.currentPageId!;
    const content = this.currentContent.join("\n");
    const contentId = this.objects.length;
    const stream = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    this.objects.push(stream);

    const pageDict =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Contents ${contentId} 0 R ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`;
    this.objects[pageId] = pageDict;
    this.pages.push(pageId);

    this.currentPageId = null;
    this.currentContent = [];
  }

  private fontObject(name: "Helvetica" | "Helvetica-Bold"): string {
    return `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`;
  }
}

function pdfEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\u0080-\uFFFF]/g, (ch) => {
      if (ch === "—") return "-";
      if (ch === "–") return "-";
      if (ch === "·") return "-";
      if (ch === "…") return "...";
      if (ch === "→") return "->";
      if (ch === "°") return String.fromCharCode(0xb0);
      if (ch === "²") return String.fromCharCode(0xb2);
      if (ch === "§") return String.fromCharCode(0xa7);
      if (ch === "×") return "x";
      if (ch === "‘" || ch === "’") return "'";
      if (ch === "“" || ch === "”") return '"';
      return "?";
    });
}

function approxStringWidth(s: string, size: number, bold: boolean): number {
  const factor = bold ? 0.54 : 0.5;
  return s.length * size * factor;
}

// ─── Citation helper used by the route layer ───────────────────────────────

/** Sort + dedupe citations across zones for the PDF top-level reference list. */
export function dedupeCitations(citations: Pas13Citation[]): Pas13Citation[] {
  const seen = new Map<string, Pas13Citation>();
  for (const c of citations) {
    if (!seen.has(c.section)) seen.set(c.section, c);
  }
  // Always thread §6.1, §5.10, §5.9 — same as the alignment report.
  for (const id of ["6.1", "5.10", "5.9"]) {
    if (!seen.has(id)) {
      const c = pas13Cite(id);
      if (c) seen.set(id, c);
    }
  }
  return Array.from(seen.values()).sort((a, b) =>
    sectionSortKey(a.section).localeCompare(sectionSortKey(b.section)),
  );
}

function sectionSortKey(section: string): string {
  if (/^[A-Z]$/.test(section)) return `Z${section}`;
  return section
    .split(".")
    .map((p) => (Number.isFinite(parseInt(p, 10)) ? p.padStart(3, "0") : p))
    .join(".");
}
