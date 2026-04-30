// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pas13AlignmentReportPdf.ts
//
// Server-side renderer for the customer-facing PAS 13 Alignment Report PDF.
//
// STRATEGY: Pure-TS PDF byte builder, no third-party PDF library.
// Why not pdfkit? pdfkit pulls in fontkit + node fs streams that don't run
// cleanly on the Cloudflare Workers runtime even with `nodejs_compat`. The
// alternative — generating HTML and round-tripping through html2canvas /
// jsPDF on the client — was the planned fallback in the spec, but text-
// heavy PDFs with the four standard PDF fonts (Helvetica family) can be
// emitted as raw PDF 1.4 bytes in ~250 lines. Zero deps, zero runtime
// surprises, deterministic output that an attacker can't smuggle anything
// dangerous through.
//
// We only use PDF base-14 fonts (Helvetica, Helvetica-Bold) which every
// PDF reader has built in — no font embedding necessary. ASCII / Latin-1
// only; non-Latin characters fall back to "?". For our wording and the
// scenario data shapes that's fine — the rule engine emits English-only
// summaries.
//
// Wording rule: "PAS 13 aligned" / "borderline alignment" / "not PAS 13
// aligned" — never "compliant" (per legal guidance, mirrored on the
// rule engine).
//
// The "Indicative — verify with A-SAFE engineering for procurement"
// footnote is rendered on EVERY page (the spec is hard-line on this).
// ────────────────────────────────────────────────────────────────────────────

import { pas13Verdict, type Pas13Verdict, type Verdict } from "../../shared/pas13Rules";
import { pas13Cite, type Pas13Citation, PAS13_PDF_URL } from "../../shared/pas13Citations";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ReportLineItem {
  productName: string;
  quantity?: number;
  /** From the rule-engine verdict — caller has already run pas13Verdict(). */
  verdict: Pas13Verdict;
}

export interface VehicleContextForReport {
  /** Free-text label: "Counterbalance forklift, 5 t @ 12 km/h" or similar. */
  label: string;
  vehicleMassKg: number;
  loadMassKg: number;
  speedKmh: number;
  approachAngleDeg: number;
}

export interface AlignmentReportInput {
  orderNumber: string;
  customOrderNumber?: string | null;
  generatedAt: Date;
  customerName?: string | null;
  customerCompany?: string | null;
  projectName?: string | null;
  projectLocation?: string | null;
  /** Vehicle context the order's items were rated against. */
  vehicleContext: VehicleContextForReport | null;
  /** Per-line-item verdicts (already computed). */
  lineItems: ReportLineItem[];
  /**
   * Origin of the live app, e.g. "https://asafe-engage.example". Used to
   * print absolute URLs into the PDF — citations and the standards-PDF
   * deep links open in any reader, not just one served from this app.
   */
  appOrigin: string;
}

export interface AlignmentReportOutput {
  /** Raw PDF bytes (application/pdf). */
  pdf: Uint8Array;
  /** Suggested filename — "PAS_13_Alignment_Report-{orderNumber}.pdf". */
  filename: string;
  /** Aggregate verdict surfaced in the PDF header chip. */
  aggregateVerdict: Verdict;
  /** Worst-case (lowest) safety margin across the whole order. */
  worstCaseSafetyMarginPct: number;
  /** Sorted, deduped list of every PAS 13 section the report cites. */
  citedSections: Pas13Citation[];
}

// ─── Public entry point ────────────────────────────────────────────────────

export function buildPas13AlignmentReport(
  input: AlignmentReportInput,
): AlignmentReportOutput {
  const aggregate = computeAggregate(input.lineItems);
  const citedSections = collectCitations(input.lineItems);

  const builder = new PdfBuilder();
  renderPage1(builder, input, aggregate, citedSections);
  // Page 2 is only emitted if the line-item table or citations overflow
  // the first page — render() pushes onto a continuation page from inside
  // the layout helpers when y drops below the bottom margin.
  builder.finalise();

  return {
    pdf: builder.bytes(),
    filename: filenameFor(input.orderNumber),
    aggregateVerdict: aggregate.verdict,
    worstCaseSafetyMarginPct: aggregate.worstMarginPct,
    citedSections,
  };
}

export function filenameFor(orderNumber: string): string {
  // Suffix the file with order number — useful when an admin downloads
  // multiple reports and they pile up in the Downloads folder.
  const safe = orderNumber.replace(/[^A-Za-z0-9._-]+/g, "_");
  return `PAS_13_Alignment_Report-${safe}.pdf`;
}

// ─── Aggregate / citation helpers ──────────────────────────────────────────

interface Aggregate {
  verdict: Verdict;
  worstMarginPct: number;
  alignedCount: number;
  borderlineCount: number;
  notAlignedCount: number;
}

function computeAggregate(items: ReportLineItem[]): Aggregate {
  let worstMarginPct = Number.POSITIVE_INFINITY;
  let alignedCount = 0;
  let borderlineCount = 0;
  let notAlignedCount = 0;
  let aggregateVerdict: Verdict = "aligned";

  for (const it of items) {
    const m = it.verdict.details.safetyMarginPct;
    if (Number.isFinite(m) && m < worstMarginPct) worstMarginPct = m;
    if (it.verdict.verdict === "not_aligned") notAlignedCount++;
    else if (it.verdict.verdict === "borderline") borderlineCount++;
    else alignedCount++;
  }

  // Worst-case verdict wins for the aggregate chip — any "not_aligned"
  // dominates, then any "borderline".
  if (notAlignedCount > 0) aggregateVerdict = "not_aligned";
  else if (borderlineCount > 0) aggregateVerdict = "borderline";
  else aggregateVerdict = "aligned";

  if (!Number.isFinite(worstMarginPct)) worstMarginPct = 0;

  return {
    verdict: aggregateVerdict,
    worstMarginPct,
    alignedCount,
    borderlineCount,
    notAlignedCount,
  };
}

function collectCitations(items: ReportLineItem[]): Pas13Citation[] {
  const seen = new Map<string, Pas13Citation>();
  for (const it of items) {
    for (const c of it.verdict.citations) {
      if (!seen.has(c.section)) seen.set(c.section, c);
    }
  }
  // Always thread §6.1 (KE) and §5.10 (deflection zone) — the rule engine
  // already attaches these but a defensive add is cheap.
  for (const id of ["6.1", "5.10", "5.9"]) {
    if (!seen.has(id)) {
      const c = pas13Cite(id);
      if (c) seen.set(id, c);
    }
  }
  // Sort by section id — annexes ("A", "B") sort after numeric clauses.
  // Use Array.from() rather than spread on the iterator — the latter requires
  // downlevelIteration on the project's current TS target.
  return Array.from(seen.values()).sort((a, b) =>
    sectionSortKey(a.section).localeCompare(sectionSortKey(b.section)),
  );
}

// "6.3.2" → "06.03.02" so 6 < 6.10 etc; "A" → "ZA" so annexes sort last.
function sectionSortKey(section: string): string {
  if (/^[A-Z]$/.test(section)) return `Z${section}`;
  return section
    .split(".")
    .map((p) => (Number.isFinite(parseInt(p, 10)) ? p.padStart(3, "0") : p))
    .join(".");
}

// ─── Page rendering ────────────────────────────────────────────────────────

function renderPage1(
  pdf: PdfBuilder,
  input: AlignmentReportInput,
  agg: Aggregate,
  citedSections: Pas13Citation[],
): void {
  pdf.startPage();

  // Title strip — A-SAFE yellow header. Image embedding adds complexity
  // (PNG decode without Node's image libs) so we render the brand as
  // bold text — same visual weight as the rest of the doc and keeps the
  // PDF zero-dep.
  pdf.fillRect(MARGIN_X, PAGE_H - MARGIN_TOP - 30, PAGE_W - 2 * MARGIN_X, 30, ASAFE_YELLOW);
  pdf.text("A-SAFE", MARGIN_X + 14, PAGE_H - MARGIN_TOP - 18, {
    font: "Helvetica-Bold",
    size: 16,
    color: BLACK,
  });
  pdf.text("PAS 13 ALIGNMENT REPORT", PAGE_W - MARGIN_X - 14, PAGE_H - MARGIN_TOP - 18, {
    font: "Helvetica-Bold",
    size: 11,
    color: BLACK,
    align: "right",
  });

  let y = PAGE_H - MARGIN_TOP - 50;

  // Order metadata block
  const orderLabel = input.customOrderNumber || input.orderNumber;
  pdf.text(`Order: ${orderLabel}`, MARGIN_X, y, { font: "Helvetica-Bold", size: 11, color: BLACK });
  y -= 14;
  const dateStr = input.generatedAt.toISOString().slice(0, 10);
  const timeStr = input.generatedAt.toISOString().slice(11, 16) + " UTC";
  pdf.text(`Generated: ${dateStr} ${timeStr}`, MARGIN_X, y, { size: 9, color: GREY });
  y -= 16;

  // Customer / project facts in a label/value list (one line per field)
  const facts: Array<[string, string]> = [];
  if (input.customerCompany) facts.push(["Customer", input.customerCompany]);
  if (input.customerName) facts.push(["Contact", input.customerName]);
  if (input.projectName) facts.push(["Project", input.projectName]);
  if (input.projectLocation) facts.push(["Location", input.projectLocation]);
  if (input.vehicleContext) {
    facts.push(["Rated against", input.vehicleContext.label]);
    facts.push([
      "Impact context",
      `${input.vehicleContext.vehicleMassKg.toLocaleString()} kg vehicle ` +
        `+ ${input.vehicleContext.loadMassKg.toLocaleString()} kg load · ` +
        `${input.vehicleContext.speedKmh.toFixed(1)} km/h · ${input.vehicleContext.approachAngleDeg}° approach`,
    ]);
  } else {
    facts.push(["Rated against", "No vehicle context — see per-line notes."]);
  }
  for (const [label, value] of facts) {
    pdf.text(`${label}:`, MARGIN_X, y, { size: 9, color: GREY });
    pdf.text(value, MARGIN_X + 75, y, { size: 9, color: BLACK });
    y -= 12;
  }
  y -= 8;

  // Aggregate verdict chip — large coloured rectangle
  const chipColour =
    agg.verdict === "aligned" ? GREEN_DARK : agg.verdict === "borderline" ? AMBER_DARK : RED_DARK;
  const chipLabel =
    agg.verdict === "aligned"
      ? "PAS 13 ALIGNED"
      : agg.verdict === "borderline"
        ? "BORDERLINE ALIGNMENT"
        : "NOT PAS 13 ALIGNED";

  const chipH = 38;
  pdf.fillRect(MARGIN_X, y - chipH, PAGE_W - 2 * MARGIN_X, chipH, chipColour);
  pdf.text(chipLabel, MARGIN_X + 14, y - 16, {
    font: "Helvetica-Bold",
    size: 16,
    color: WHITE,
  });
  // Margin line on the right of the chip.
  const marginText = `Worst-case safety margin: ${agg.worstMarginPct.toFixed(1)}%`;
  pdf.text(marginText, PAGE_W - MARGIN_X - 14, y - 16, {
    font: "Helvetica-Bold",
    size: 11,
    color: WHITE,
    align: "right",
  });
  pdf.text(
    `${agg.alignedCount} aligned · ${agg.borderlineCount} borderline · ${agg.notAlignedCount} not aligned`,
    PAGE_W - MARGIN_X - 14,
    y - 30,
    { size: 9, color: WHITE, align: "right" },
  );
  y -= chipH + 12;

  // Section header: line-items table
  pdf.text("Per-line-item verdict", MARGIN_X, y, {
    font: "Helvetica-Bold",
    size: 11,
    color: BLACK,
  });
  y -= 4;
  pdf.fillRect(MARGIN_X, y, PAGE_W - 2 * MARGIN_X, 1, ASAFE_YELLOW);
  y -= 10;

  // Column layout. Page width minus margins == ~535pt at A4 portrait.
  // [ Product (170) | Rated J@45° (70) | Required J (70) | Margin (50) | Verdict (75) | Cited (90) ]
  const cols = [
    { x: MARGIN_X + 0, w: 170, label: "Product" },
    { x: MARGIN_X + 170, w: 70, label: "Rated J@45°", align: "right" as const },
    { x: MARGIN_X + 240, w: 70, label: "Required J", align: "right" as const },
    { x: MARGIN_X + 310, w: 50, label: "Margin", align: "right" as const },
    { x: MARGIN_X + 360, w: 75, label: "Verdict" },
    { x: MARGIN_X + 435, w: 100, label: "Cited" },
  ];
  for (const col of cols) {
    const labelX =
      col.align === "right" ? col.x + col.w - 4 : col.x + 2;
    pdf.text(col.label, labelX, y, {
      font: "Helvetica-Bold",
      size: 8,
      color: GREY,
      align: col.align,
    });
  }
  y -= 4;
  pdf.fillRect(MARGIN_X, y, PAGE_W - 2 * MARGIN_X, 0.5, GREY);
  y -= 12;

  // Rows
  for (const item of input.lineItems) {
    if (y < MARGIN_BOTTOM + 100) {
      // Need a new page — emit the footer on this one then start fresh.
      renderFooter(pdf, input);
      pdf.startPage();
      y = PAGE_H - MARGIN_TOP - 24;
      pdf.text("PAS 13 Alignment Report (continued)", MARGIN_X, y, {
        font: "Helvetica-Bold",
        size: 11,
        color: BLACK,
      });
      y -= 18;
    }

    const rated = item.verdict.details.productRatedJoulesAt45deg.toLocaleString();
    const required = item.verdict.details.requiredJoulesAt45deg.toLocaleString();
    const marginVal = item.verdict.details.safetyMarginPct;
    const marginStr = `${marginVal.toFixed(1)}%`;
    const verdictLabel =
      item.verdict.verdict === "aligned"
        ? "Aligned"
        : item.verdict.verdict === "borderline"
          ? "Borderline"
          : "Not aligned";
    const citedShort =
      item.verdict.citations.map((c) => `§${c.section}`).slice(0, 3).join(" ") || "—";

    pdf.text(truncate(item.productName, 36), cols[0].x + 2, y, {
      size: 9,
      color: BLACK,
    });
    if (item.quantity != null) {
      pdf.text(`× ${item.quantity}`, cols[0].x + 2, y - 10, {
        size: 8,
        color: GREY,
      });
    }
    pdf.text(rated, cols[1].x + cols[1].w - 4, y, {
      size: 9,
      color: BLACK,
      align: "right",
    });
    pdf.text(required, cols[2].x + cols[2].w - 4, y, {
      size: 9,
      color: BLACK,
      align: "right",
    });
    pdf.text(marginStr, cols[3].x + cols[3].w - 4, y, {
      size: 9,
      color:
        item.verdict.verdict === "not_aligned"
          ? RED_DARK
          : item.verdict.verdict === "borderline"
            ? AMBER_DARK
            : GREEN_DARK,
      align: "right",
    });
    // Verdict chip (mini)
    const chipColor2 =
      item.verdict.verdict === "aligned"
        ? GREEN_DARK
        : item.verdict.verdict === "borderline"
          ? AMBER_DARK
          : RED_DARK;
    pdf.fillRect(cols[4].x + 2, y - 3, 70, 13, chipColor2);
    pdf.text(verdictLabel, cols[4].x + 8, y, {
      font: "Helvetica-Bold",
      size: 8,
      color: WHITE,
    });
    pdf.text(truncate(citedShort, 22), cols[5].x + 2, y, { size: 9, color: BLACK });
    y -= item.quantity != null ? 22 : 16;
  }

  y -= 6;
  pdf.fillRect(MARGIN_X, y, PAGE_W - 2 * MARGIN_X, 0.5, GREY);
  y -= 14;

  // Citations section
  if (y < MARGIN_BOTTOM + 80) {
    renderFooter(pdf, input);
    pdf.startPage();
    y = PAGE_H - MARGIN_TOP - 24;
  }
  pdf.text("Cited PAS 13:2017 sections", MARGIN_X, y, {
    font: "Helvetica-Bold",
    size: 11,
    color: BLACK,
  });
  y -= 4;
  pdf.fillRect(MARGIN_X, y, PAGE_W - 2 * MARGIN_X, 1, ASAFE_YELLOW);
  y -= 12;

  for (const c of citedSections) {
    if (y < MARGIN_BOTTOM + 60) {
      renderFooter(pdf, input);
      pdf.startPage();
      y = PAGE_H - MARGIN_TOP - 24;
    }
    pdf.text(c.shortLabel, MARGIN_X, y, { font: "Helvetica-Bold", size: 9, color: BLACK });
    pdf.text(truncate(c.title, 70), MARGIN_X + 110, y, { size: 9, color: BLACK });
    const url = `${input.appOrigin}${c.url}`;
    pdf.text(url, MARGIN_X, y - 10, { size: 7, color: BLUE_LINK });
    y -= 22;
  }

  // Disclaimer block — tight, conservative wording
  if (y < MARGIN_BOTTOM + 80) {
    renderFooter(pdf, input);
    pdf.startPage();
    y = PAGE_H - MARGIN_TOP - 24;
  }
  y -= 8;
  pdf.fillRect(MARGIN_X, y - 60, PAGE_W - 2 * MARGIN_X, 60, FAINT_GREY);
  pdf.text("Disclaimer", MARGIN_X + 8, y - 12, {
    font: "Helvetica-Bold",
    size: 9,
    color: BLACK,
  });
  const disclaimerLines = [
    "This report is an indicative engineering interpretation of PAS 13:2017 against the impact context recorded for this",
    "order. It is not a commercial-liability statement and does not warrant compliance with PAS 13:2017. Conservative",
    "interpretation is applied throughout — boundary values resolve to the stricter reading.",
    "For procurement, verify all alignment verdicts with A-SAFE engineering — sales@asafe.ae · +971 (4) 8842 422.",
  ];
  let dY = y - 24;
  for (const line of disclaimerLines) {
    pdf.text(line, MARGIN_X + 8, dY, { size: 8, color: BLACK });
    dY -= 9;
  }

  renderFooter(pdf, input);
}

function renderFooter(pdf: PdfBuilder, input: AlignmentReportInput): void {
  // Indicative footnote on EVERY page (hard rule). Plus generation time +
  // source standard.
  const stamp = input.generatedAt.toISOString();
  const lineY = MARGIN_BOTTOM - 20;
  pdf.fillRect(MARGIN_X, lineY + 14, PAGE_W - 2 * MARGIN_X, 1.5, ASAFE_YELLOW);
  pdf.text(
    "Indicative — verify with A-SAFE engineering for procurement.",
    MARGIN_X,
    lineY,
    { font: "Helvetica-Bold", size: 8, color: BLACK },
  );
  pdf.text(
    `Generated ${stamp}. Source: PAS 13:2017.`,
    MARGIN_X,
    lineY - 10,
    { size: 7, color: GREY },
  );
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

// ─── PdfBuilder — minimal PDF 1.4 byte writer ──────────────────────────────
//
// Only what we need: pages, base-14 fonts, text in black/white/yellow, filled
// rectangles. No images, no embedded fonts, no encryption, no compression
// (PDF readers accept uncompressed streams just fine — keeps the bytes
// inspectable and avoids needing a deflate impl in a Worker).
//
// Coordinate system is PostScript-style (origin bottom-left). Units are
// PostScript points (1pt = 1/72 inch). A4 portrait = 595 × 842 pt.
// ────────────────────────────────────────────────────────────────────────────

const PAGE_W = 595; // A4 portrait
const PAGE_H = 842;
const MARGIN_X = 36;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 60;

// Brand palette. Tuples (r, g, b) in 0..1.
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
  // Each PDF object is a separately-numbered piece of content. We assign
  // ids lazily so the Catalog (object 1) and Pages (object 2) are stable.
  private objects: Array<string | Uint8Array> = [];
  private pages: number[] = []; // object ids of each Page
  private currentContent: string[] = [];
  private currentPageId: number | null = null;
  private finalised: false | { bytes: Uint8Array } = false;

  constructor() {
    // Reserve object slots for catalog + pages dictionary. They'll be
    // back-filled at finalise() time once we know the page list.
    this.objects.push(""); // 0 — unused (PDF objects are 1-indexed but we keep a slot)
    this.objects.push(""); // 1 — Catalog
    this.objects.push(""); // 2 — Pages
    this.objects.push(this.fontObject("Helvetica")); // 3
    this.objects.push(this.fontObject("Helvetica-Bold")); // 4
  }

  startPage(): void {
    if (this.currentPageId !== null) this.flushPage();
    // Reserve the Page object id; we'll back-fill when we flush.
    this.objects.push(""); // page object slot
    this.currentPageId = this.objects.length - 1;
    this.currentContent = [];
  }

  finalise(): void {
    if (this.currentPageId !== null) this.flushPage();
    if (this.finalised) return;

    // Catalog
    this.objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
    // Pages
    const kids = this.pages.map((id) => `${id} 0 R`).join(" ");
    this.objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>`;

    // Now emit the byte stream. Header → objects (with byte offsets) → xref → trailer.
    const parts: Uint8Array[] = [];
    const enc = new TextEncoder();
    parts.push(enc.encode("%PDF-1.4\n%\xC3\xA1\xC3\xA9\xC3\xAD\xC3\xB3\n"));

    const offsets: number[] = [];
    let cursor = parts[0].byteLength;

    // Object 0 is the standard "trailer free entry" — record its offset.
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

  // ─── Drawing primitives ────────────────────────────────────────────
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

  // ─── Internals ─────────────────────────────────────────────────────
  private flushPage(): void {
    const pageId = this.currentPageId!;
    const content = this.currentContent.join("\n");
    // Content stream object
    const contentId = this.objects.length;
    const stream = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    this.objects.push(stream);

    // Page object
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

// PDF string escape — only handles the chars that would break a literal
// string. Everything outside Latin-1 falls through; the writer downgrades
// non-Latin characters to "?" because we're using WinAnsiEncoding.
function pdfEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\u0080-\uFFFF]/g, (ch) => {
      // Common typographic dashes / ellipsis we use in the text
      if (ch === "—") return "-";
      if (ch === "–") return "-";
      if (ch === "·") return "-";
      if (ch === "…") return "...";
      if (ch === "→") return "->";
      if (ch === "°") return String.fromCharCode(0xb0); // WinAnsi has 0xB0 = °
      if (ch === "²") return String.fromCharCode(0xb2);
      if (ch === "§") return String.fromCharCode(0xa7);
      if (ch === "×") return "x";
      // Quote curly→straight
      if (ch === "‘" || ch === "’") return "'";
      if (ch === "“" || ch === "”") return '"';
      return "?";
    });
}

// Rough string-width estimator. The base-14 metrics tables are large; for
// a status-report PDF that's mostly Helvetica 8-11pt, a constant
// average-glyph-width approximation is good enough for right-aligned
// columns. (Off by a few percent at most. We don't auto-wrap on these
// numbers.)
function approxStringWidth(s: string, size: number, bold: boolean): number {
  // Helvetica avg glyph width ≈ 0.50 em; bold ≈ 0.54 em.
  const factor = bold ? 0.54 : 0.5;
  return s.length * size * factor;
}
