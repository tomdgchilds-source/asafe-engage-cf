// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/reports/pas13Statement.ts
//
// PAS 13 Alignment Statement (ASU-PS-…): the customer-facing statement of
// how each product on an order aligns with PAS 13:2017 for the vehicle
// context it was rated against. Replaces worker/lib/pas13AlignmentReportPdf.ts
// (hand-rolled PDF bytes) with the shared pdf-lib document system so it
// carries the same cover furniture, document control and sign-off as the
// risk assessment and proposal.
//
// Pages (A4 portrait, 2–4 depending on order size):
//   1  Letter tab · title · status and aggregate verdict · document control ·
//      KPI tiles · purpose · basis of assessment (vehicle context and the
//      PAS 13 vehicle classes on site) · method
//   2+ Per-product alignment table · notes · clauses cited · limitations ·
//      declaration and signatures
//
// Wording rule (legal): "PAS 13 aligned" / "borderline alignment" /
// "not PAS 13 aligned" — never "compliant". The indicative footnote is
// printed on every page.
//
// The input shape is the one worker/routes/orders.ts already assembles
// (`AlignmentReportInput`), so the call sites only swap the import and add
// `await`. Verdicts are computed by shared/pas13Rules#pas13Verdict upstream;
// nothing here re-derives them.
// ────────────────────────────────────────────────────────────────────────────

import {
  classifyVehicle,
  getActiveVehicleClassTable,
  PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT,
  PAS13_INDICATIVE_FOOTNOTE,
  PAS13_VERSION,
  type Pas13Verdict,
  type Verdict,
} from "../../../../shared/pas13Rules";
import { pas13Cite, PAS13_PDF_URL, type Pas13Citation } from "../../../../shared/pas13Citations";
import { C, TYPE, type Tone } from "../theme";
import { createDoc, addPage, finalize, mm, type Doc, type Page } from "../doc";
import { heading, body, small, bullets, drawText } from "../text";
import { documentControl, kpiTiles, table, chipRow, calloutBox, signOffBlock, letterTab, type TableCellValue } from "../blocks";

// ─── Types (kept compatible with the previous renderer) ────────────────────

export interface ReportLineItem {
  productName: string;
  quantity?: number;
  /** From the rule engine — the caller has already run pas13Verdict(). */
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
  vehicleContext: VehicleContextForReport | null;
  lineItems: ReportLineItem[];
  /** Origin of the live app; used to print absolute deep links to the standard. */
  appOrigin: string;
}

export interface Pas13StatementInput extends AlignmentReportInput {
  /** Document reference; defaults to `ASU-PS-<yymm>-<order suffix>`. */
  reference?: string;
  /** Revision letter; default "A". */
  revision?: string;
  /** DRAFT renders carry the watermark. Default ISSUED. */
  status?: "DRAFT" | "ISSUED";
  preparedBy?: string;
  preparedByTitle?: string;
}

export interface AlignmentReportOutput {
  /** Raw PDF bytes (application/pdf). */
  pdf: Uint8Array;
  /** "PAS_13_Alignment_Statement-<order>.pdf" */
  filename: string;
  /** Worst-case verdict across the order. */
  aggregateVerdict: Verdict;
  /** Lowest safety margin across the order (percent). */
  worstCaseSafetyMarginPct: number;
  /** Sorted, de-duplicated clauses the statement cites. */
  citedSections: Pas13Citation[];
  /** Document reference printed on the statement. */
  reference: string;
}

export type Pas13StatementOutput = AlignmentReportOutput;

// ─── Public entry points ───────────────────────────────────────────────────

export async function renderPas13Statement(input: Pas13StatementInput): Promise<Pas13StatementOutput> {
  const aggregate = computeAggregate(input.lineItems);
  const citedSections = collectCitations(input.lineItems);
  const reference = input.reference ?? defaultReference(input);
  const revision = input.revision ?? "A";
  const status = input.status ?? "ISSUED";
  const issuedOn = formatDate(input.generatedAt);

  const doc = await createDoc({
    title: "PAS 13 Alignment Statement",
    reference,
    revision,
    issuedOn,
    docType: "PAS 13 Alignment Statement",
    status,
  });

  let page = addPage(doc);
  // Text primitives may break pages; always continue on doc.current.
  const H = (level: 1 | 2 | 3, s: string) => {
    heading(page, level, s);
    page = doc.current ?? page;
  };
  const B = (s: string) => {
    body(page, s);
    page = doc.current ?? page;
  };
  const S = (s: string) => {
    small(page, s);
    page = doc.current ?? page;
  };
  const L = (items: string[]) => {
    bullets(page, items);
    page = doc.current ?? page;
  };
  await letterTab(doc, page);
  H(1, "PAS 13 Alignment Statement");
  ({ page } = chipRow(page, [
    { label: status, tone: status === "DRAFT" ? "grey" : "black" },
    { label: verdictLabel(aggregate.verdict), tone: verdictTone(aggregate.verdict) },
    { label: `Worst-case margin ${formatPct(aggregate.worstMarginPct)}`, tone: "grey" },
  ]));

  const client = [input.customerCompany, input.customerName].filter(Boolean).join(" — ") || "—";
  const site = [input.projectName, input.projectLocation].filter(Boolean).join(", ") || "—";
  const orderLabel = input.customOrderNumber ? `${input.orderNumber} (${input.customOrderNumber})` : input.orderNumber;
  ({ page } = documentControl(doc, page, [
    { key: "Reference", value: reference },
    { key: "Revision", value: revision },
    { key: "Issue date", value: issuedOn },
    { key: "Order", value: orderLabel },
    { key: "Client", value: client },
    { key: "Site", value: site },
    { key: "Prepared by", value: input.preparedBy ? `${input.preparedBy}${input.preparedByTitle ? `, ${input.preparedByTitle}` : ""}` : "A-SAFE UAE estimation team" },
    { key: "Reviewed by", value: "" },
    { key: "Standard", value: `${PAS13_VERSION} Code of practice for safety barriers used in traffic management within workplace environments (BSI)` },
  ]));

  ({ page } = kpiTiles(doc, page, [
    { label: "Products assessed", value: String(input.lineItems.length) },
    { label: "PAS 13 aligned", value: String(aggregate.alignedCount), tone: "low" },
    {
      label: "Borderline / not aligned",
      value: `${aggregate.borderlineCount} / ${aggregate.notAlignedCount}`,
      tone: aggregate.notAlignedCount > 0 ? "critical" : aggregate.borderlineCount > 0 ? "medium" : "low",
    },
    { label: "Worst-case margin", value: formatPct(aggregate.worstMarginPct), sublabel: `Aligned at >= ${PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT} %` },
  ]));

  H(2, "Purpose");
  B(`This statement records how each product on order ${input.orderNumber} aligns with ${PAS13_VERSION} for the vehicle context recorded against the order. It is issued so the client's safety file shows the impact energy each barrier was selected to absorb, the energy the site's vehicles can deliver, and the margin between the two.`,
  );
  B("Verdicts are indicative engineering interpretations. They support, and do not replace, the client's own risk assessment and the confirmation A-SAFE engineering gives at procurement.",
  );

  H(2, "Basis of assessment");
  page = basisSection(doc, page, input);

  H(2, "Method");
  L([
    `Impact energy is calculated from the vehicle's total mass (vehicle plus load) and speed, E = ½ m v², per ${PAS13_VERSION} clause 6.1, then adjusted for the approach angle by the sine table in the same clause.`,
    "Product ratings are the energies absorbed in the PAS 13 test at 45°; required energies are reported on the same basis.",
    `A product is PAS 13 aligned when its tested energy exceeds the required energy by at least ${PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT} %; between 0 % and ${PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT} % the alignment is borderline; below the required energy the product is not PAS 13 aligned.`,
    "Deflection zones are checked against the product's tested impact zone (clause 5.10) where a site measurement was supplied.",
    "Where the standard leaves a grey area, the stricter reading is applied: boundary values place a vehicle in the heavier class and an unspecified approach angle is taken as 90°.",
  ]);

  H(2, "Product alignment");
  S("Energies in joules (J) at 45°. Margin = (tested − required) ÷ required.");
  ({ page } = productTable(doc, page, input.lineItems));
  page = notesSection(doc, page, input.lineItems);

  H(2, "Standards and clauses cited");
  ({ page } = table(doc, page, {
    headerStyle: "black",
    zebra: true,
    columns: [
      { key: "clause", label: "Clause", width: mm(24) },
      { key: "title", label: "Title", width: mm(110) },
      { key: "page", label: "Page", width: mm(14), align: "right" },
      { key: "link", label: "Reference", width: mm(26) },
    ],
    rows: citedSections.map((c) => ({
      clause: { text: c.shortLabel, bold: true },
      title: c.title,
      page: c.page,
      link: `p. ${c.page}`,
    })),
  }));
  S(`Standard on file: ${absoluteUrl(input.appOrigin, PAS13_PDF_URL)}. Also referenced: HSE HSG136 A guide to workplace transport safety; HSE HSG76 Warehousing and storage: a guide to health and safety; ISO 45001:2018 clause 6.1.`);

  H(2, "Limitations");
  ({ page } = calloutBox(doc, page, {
    tone: "grey",
    title: "Indicative interpretation",
    body: `This statement is an indicative engineering interpretation of ${PAS13_VERSION} against the impact context recorded for this order. It is not a commercial-liability statement and does not warrant compliance with ${PAS13_VERSION}. Vehicle masses, speeds and approach angles are as supplied by the client or observed during survey; floor construction and fixings are assumed suitable until verified on site. For procurement, verify every verdict with A-SAFE engineering — sales@asafe.ae, +971 4 884 2422.`,
  }));

  H(2, "Declaration");
  B(`The products listed have been assessed against the vehicle context above using the ${PAS13_VERSION} impact-energy method. Any change to vehicle type, load, speed or approach angle on site requires the assessment to be repeated.`,
  );
  ({ page } = signOffBlock(doc, page, [
    { role: "Prepared by", name: input.preparedBy, title: input.preparedByTitle ?? "A-SAFE UAE", date: issuedOn },
    { role: "Reviewed by", title: "A-SAFE engineering" },
    { role: "Acknowledged for the client", name: input.customerName ?? undefined, title: input.customerCompany ?? undefined },
  ]));

  drawFootnotes(doc);
  const pdf = await finalize(doc);
  return {
    pdf,
    filename: filenameFor(input.orderNumber),
    aggregateVerdict: aggregate.verdict,
    worstCaseSafetyMarginPct: aggregate.worstMarginPct,
    citedSections,
    reference,
  };
}

/** Alias kept so existing call sites only change the import path and add `await`. */
export const buildPas13AlignmentReport = renderPas13Statement;

export function filenameFor(orderNumber: string): string {
  const safe = orderNumber.replace(/[^A-Za-z0-9._-]+/g, "_");
  return `PAS_13_Alignment_Statement-${safe}.pdf`;
}

// ─── Sections ──────────────────────────────────────────────────────────────

function basisSection(doc: Doc, page: Page, input: AlignmentReportInput): Page {
  const ctx = input.vehicleContext;
  if (!ctx) {
    ({ page } = calloutBox(doc, page, {
      tone: "grey",
      title: "No vehicle context recorded",
      body: "No vehicle mass, speed or approach angle was recorded against this order or its project. Each product below is assessed against the context on its own line item where one exists; otherwise the verdict is shown as not assessable and must be confirmed with A-SAFE engineering before procurement.",
    }));
    return page;
  }
  const totalKg = ctx.vehicleMassKg + ctx.loadMassKg;
  const cls = classifyVehicle({ totalMassKg: totalKg, speedKmh: ctx.speedKmh });
  body(
    page,
    `Vehicle context: ${ctx.label}. Vehicle mass ${formatInt(ctx.vehicleMassKg)} kg, load ${formatInt(ctx.loadMassKg)} kg, total ${formatInt(totalKg)} kg, speed ${ctx.speedKmh.toFixed(1)} km/h, approach angle ${Math.round(ctx.approachAngleDeg)}°. This places the vehicle in PAS 13 class ${cls.classCode}${cls.conservativeClass ? " (rounded up from a class boundary)" : ""}.`,
  );
  page = doc.current ?? page;
  const rows = getActiveVehicleClassTable().map((r) => ({
    code: { text: r.classCode, bold: true },
    label: r.label,
    mass: Number.isFinite(r.totalMassMaxKg) ? `<= ${formatInt(r.totalMassMaxKg)} kg` : "Above",
    speed: Number.isFinite(r.speedMaxKmh) ? `<= ${r.speedMaxKmh} km/h` : "Above",
    site: r.classCode === cls.classCode ? { text: "On site", chip: "yellow" as Tone } : "",
  }));
  ({ page } = table(doc, page, {
    headerStyle: "yellow",
    zebra: true,
    columns: [
      { key: "code", label: "Class", width: mm(16) },
      { key: "label", label: "Description", width: mm(86) },
      { key: "mass", label: "Total mass", width: mm(26), align: "right" },
      { key: "speed", label: "Speed", width: mm(22), align: "right" },
      { key: "site", label: "", width: mm(24) },
    ],
    rows,
  }));
  return page;
}

function productTable(doc: Doc, page: Page, items: ReportLineItem[]) {
  const rows: Array<Record<string, TableCellValue>> = items.map((it) => {
    const d = it.verdict.details;
    return {
      product: { text: it.productName, bold: true },
      qty: it.quantity ?? "",
      tested: d.productRatedJoulesAt45deg > 0 ? formatJ(d.productRatedJoulesAt45deg) : "—",
      required: d.requiredJoulesAt45deg > 0 ? formatJ(d.requiredJoulesAt45deg) : "—",
      margin: { text: formatPct(d.safetyMarginPct), bold: true },
      verdict: { text: verdictLabel(it.verdict.verdict), chip: verdictTone(it.verdict.verdict) },
      cited: it.verdict.citations.map((c) => `§${c.section}`).slice(0, 4).join(" "),
    };
  });
  return table(doc, page, {
    headerStyle: "yellow",
    zebra: true,
    columns: [
      { key: "product", label: "Product", width: mm(50) },
      { key: "qty", label: "Qty", width: mm(10), align: "right" },
      { key: "tested", label: "Tested", width: mm(22), align: "right" },
      { key: "required", label: "Required", width: mm(22), align: "right" },
      { key: "margin", label: "Margin", width: mm(16), align: "right" },
      { key: "verdict", label: "Verdict", width: mm(34) },
      { key: "cited", label: "Clauses", width: mm(20) },
    ],
    rows,
  });
}

function notesSection(doc: Doc, page: Page, items: ReportLineItem[]): Page {
  const lines = new Map<string, string[]>();
  for (const it of items) {
    for (const w of it.verdict.warnings) addNote(lines, w, it.productName);
    for (const n of it.verdict.notes) addNote(lines, n, it.productName);
  }
  if (lines.size === 0) return page;
  heading(page, 3, "Notes and warnings");
  page = doc.current ?? page;
  const out: string[] = [];
  for (const [text, products] of lines) {
    const scope = products.length === items.length ? "All products" : products.join(", ");
    out.push(`${scope}: ${text}`);
  }
  bullets(page, out);
  return doc.current ?? page;
}

function addNote(map: Map<string, string[]>, text: string, product: string): void {
  const t = text.trim();
  if (!t) return;
  const list = map.get(t) ?? [];
  if (!list.includes(product)) list.push(product);
  map.set(t, list);
}

/** The indicative footnote on every page, just above the footer rule. */
function drawFootnotes(doc: Doc): void {
  for (const p of doc.pages) {
    drawText(p, PAS13_INDICATIVE_FOOTNOTE, {
      x: p.margin.l,
      y: mm(17),
      size: TYPE.small.size,
      font: doc.fonts.bold,
      color: C.black,
      lineHeight: TYPE.small.lead,
    });
  }
}

// ─── Aggregate / citations ─────────────────────────────────────────────────

interface Aggregate {
  verdict: Verdict;
  worstMarginPct: number;
  alignedCount: number;
  borderlineCount: number;
  notAlignedCount: number;
}

export function computeAggregate(items: ReportLineItem[]): Aggregate {
  let worstMarginPct = Number.POSITIVE_INFINITY;
  let alignedCount = 0;
  let borderlineCount = 0;
  let notAlignedCount = 0;
  for (const it of items) {
    const m = it.verdict.details.safetyMarginPct;
    if (Number.isFinite(m) && m < worstMarginPct) worstMarginPct = m;
    if (it.verdict.verdict === "not_aligned") notAlignedCount++;
    else if (it.verdict.verdict === "borderline") borderlineCount++;
    else alignedCount++;
  }
  const verdict: Verdict = notAlignedCount > 0 ? "not_aligned" : borderlineCount > 0 ? "borderline" : "aligned";
  if (!Number.isFinite(worstMarginPct)) worstMarginPct = 0;
  return { verdict, worstMarginPct, alignedCount, borderlineCount, notAlignedCount };
}

export function collectCitations(items: ReportLineItem[]): Pas13Citation[] {
  const seen = new Map<string, Pas13Citation>();
  for (const it of items) for (const c of it.verdict.citations) if (!seen.has(c.section)) seen.set(c.section, c);
  // Always thread the energy, deflection-zone and classification clauses.
  for (const id of ["6.1", "5.10", "5.9"]) {
    if (!seen.has(id)) {
      const c = pas13Cite(id);
      if (c) seen.set(id, c);
    }
  }
  return Array.from(seen.values()).sort((a, b) => sectionSortKey(a.section).localeCompare(sectionSortKey(b.section)));
}

function sectionSortKey(section: string): string {
  if (/^[A-Z]$/.test(section)) return `Z${section}`;
  return section
    .split(".")
    .map((p) => (Number.isFinite(parseInt(p, 10)) ? p.padStart(3, "0") : p))
    .join(".");
}

// ─── Formatting ────────────────────────────────────────────────────────────

export function verdictLabel(v: Verdict): string {
  return v === "aligned" ? "PAS 13 aligned" : v === "borderline" ? "Borderline alignment" : "Not PAS 13 aligned";
}

export function verdictTone(v: Verdict): Tone {
  return v === "aligned" ? "low" : v === "borderline" ? "medium" : "critical";
}

function formatJ(n: number): string {
  return `${formatInt(n)} J`;
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${Math.round(n)} %`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function defaultReference(input: AlignmentReportInput): string {
  const d = input.generatedAt;
  const yymm = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const digits = input.orderNumber.replace(/\D/g, "");
  const seq = (digits.slice(-4) || "0001").padStart(4, "0");
  return `ASU-PS-${yymm}-${seq}`;
}

function absoluteUrl(origin: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${origin.replace(/\/$/, "")}${path}`;
}
