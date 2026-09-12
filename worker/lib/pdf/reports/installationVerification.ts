// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/reports/installationVerification.ts
//
// Installation Verification Report (ASU-IV-…): the document that closes the
// loop after the install team has finished. Generated from the installation
// timeline (phases, milestones, teams) plus the order's zones and photos.
//
// Pages (A4 portrait):
//   1  Cover — hero is the first as-installed photo, else the black field
//   2  Document control · summary tiles · programme (phases) table
//   3+ One section per zone: proposal photo beside as-installed photo,
//      products installed, checklist (post centres / fixings / deflection
//      zone clear / signage / floor condition) with pass / fail / n.a.
//      chips, notes
//   n  Snag list · limitations · handover sign-off
//
// The renderer takes an in-memory input so tests and the route loader
// (worker/routes/documentsPas13.ts) share one contract.
// ────────────────────────────────────────────────────────────────────────────

import type { Env } from "../../../types";
import { C, TYPE, type Tone } from "../theme";
import { createDoc, addPage, ensureSpace, contentWidth, finalize, mm, type Doc, type Page } from "../doc";
import { heading, body, small, bullets, drawText, wrap } from "../text";
import {
  coverPage,
  documentControl,
  kpiTiles,
  table,
  chip,
  photo,
  calloutBox,
  signOffBlock,
  type TableCellValue,
} from "../blocks";

// ─── Types ─────────────────────────────────────────────────────────────────

export type CheckStatus = "pass" | "fail" | "na";

export interface ChecklistRow {
  item: string;
  status: CheckStatus;
  comment?: string;
}

export interface VerificationZone {
  name: string;
  location?: string;
  /** Product names installed in this zone. */
  products?: string[];
  proposalPhoto?: Uint8Array | null;
  proposalCaption?: string;
  asInstalledPhoto?: Uint8Array | null;
  asInstalledCaption?: string;
  checklist: ChecklistRow[];
  notes?: string;
}

export interface Snag {
  ref: string;
  zone?: string;
  description: string;
  severity?: "minor" | "major";
  owner?: string;
  due?: string;
  status: "open" | "closed";
}

export interface PhaseSummary {
  name: string;
  status: string; // not_started | in_progress | completed | delayed | on_hold
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  progress?: number | null;
  team?: string | null;
}

export interface InstallationSummary {
  title: string;
  customerName?: string | null;
  location?: string | null;
  contactName?: string | null;
  complexity?: string | null;
  status?: string | null;
  progress?: number | null;
  plannedStart?: Date | string | null;
  plannedEnd?: Date | string | null;
  actualStart?: Date | string | null;
  actualEnd?: Date | string | null;
  notes?: string | null;
}

export interface VerificationInput {
  reference?: string;
  revision?: string;
  status?: "DRAFT" | "ISSUED";
  issuedOn?: Date;
  installation: InstallationSummary;
  order?: { orderNumber: string; projectName?: string | null } | null;
  phases: PhaseSummary[];
  zones: VerificationZone[];
  snags: Snag[];
  installTeam?: string | null;
  preparedBy?: string;
  preparedByTitle?: string;
  clientRepresentative?: string;
}

/** The standard check items, in the order they print. */
export const STANDARD_CHECKLIST = [
  "Post centres to drawing",
  "Fixings complete and torqued",
  "Deflection zone clear",
  "Signage in place",
  "Floor condition acceptable",
] as const;

// ─── Entry point ───────────────────────────────────────────────────────────

export async function renderInstallationVerification(_env: Env, input: VerificationInput): Promise<Uint8Array> {
  const issued = input.issuedOn ?? new Date();
  const reference = input.reference ?? defaultReference(issued, input.order?.orderNumber);
  const revision = input.revision ?? "A";
  const status = input.status ?? "ISSUED";
  const issuedOn = formatDate(issued);
  const inst = input.installation;
  const preparedBy = input.preparedBy ?? (input.installTeam ? `${input.installTeam} (install team)` : "A-SAFE UAE install team");

  const doc = await createDoc({
    title: "Installation Verification Report",
    reference,
    revision,
    issuedOn,
    docType: "Installation Verification Report",
    status,
  });

  // 1 · Cover
  const hero = input.zones.find((z) => z.asInstalledPhoto)?.asInstalledPhoto ?? null;
  await coverPage(doc, {
    heroImage: hero ?? undefined,
    docTypeLine: "Installation Verification Report",
    title: inst.title,
    subtitle: "As-installed verification of A-SAFE impact protection against the proposal, with checklist, snag list and handover sign-off",
    client: inst.customerName || "—",
    site: inst.location || "—",
    date: issuedOn,
    preparedBy,
    reference: `${reference}  ·  Rev ${revision}`,
    status,
  });

  // 2 · Document control + summary + programme
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
  H(1, "Document control");
  ({ page } = documentControl(doc, page, [
    { key: "Reference", value: reference },
    { key: "Revision", value: revision },
    { key: "Issue date", value: issuedOn },
    { key: "Order", value: input.order ? [input.order.orderNumber, input.order.projectName].filter(Boolean).join(" — ") : "—" },
    { key: "Client", value: [inst.customerName, inst.contactName].filter(Boolean).join(" — ") || "—" },
    { key: "Site", value: inst.location || "—" },
    { key: "Install team", value: input.installTeam || "—" },
    { key: "Prepared by", value: input.preparedBy ? `${input.preparedBy}${input.preparedByTitle ? `, ${input.preparedByTitle}` : ""}` : preparedBy },
    { key: "Reviewed by", value: "" },
    { key: "Distribution", value: "Client HSE / facilities; A-SAFE UAE projects; A-SAFE UAE service" },
  ]));

  const checks = input.zones.flatMap((z) => z.checklist);
  const applicable = checks.filter((c) => c.status !== "na");
  const passed = applicable.filter((c) => c.status === "pass").length;
  const openSnags = input.snags.filter((s) => s.status === "open").length;
  const programme = programmeDays(inst);
  H(2, "Summary");
  ({ page } = kpiTiles(doc, page, [
    { label: "Zones verified", value: String(input.zones.length) },
    {
      label: "Checks passed",
      value: applicable.length ? `${passed} of ${applicable.length}` : "—",
      tone: applicable.length === 0 ? "neutral" : passed === applicable.length ? "low" : "high",
    },
    { label: "Open snags", value: String(openSnags), tone: openSnags === 0 ? "low" : "high" },
    { label: "Programme", value: programme.value, sublabel: programme.sublabel },
  ]));
  B(summaryParagraph(input, passed, applicable.length, openSnags));

  H(2, "Programme");
  ({ page } = table(doc, page, {
    headerStyle: "yellow",
    zebra: true,
    columns: [
      { key: "phase", label: "Phase", width: mm(40) },
      { key: "planned", label: "Planned", width: mm(48) },
      { key: "team", label: "Team", width: mm(34) },
      { key: "progress", label: "Progress", width: mm(18), align: "right" },
      { key: "status", label: "Status", width: mm(30) },
    ],
    rows: input.phases.map((p) => ({
      phase: { text: p.name, bold: true },
      planned: [fmtShort(p.startDate), fmtShort(p.endDate)].filter(Boolean).join(" – ") || "—",
      team: p.team || "—",
      progress: `${Math.round(p.progress ?? 0)} %`,
      status: { text: phaseLabel(p.status), chip: phaseTone(p.status) },
    })),
  }));

  // 3 · Zones
  for (const [i, zone] of input.zones.entries()) {
    page = addPage(doc);
    H(1, `Zone ${i + 1} — ${zone.name}`);
    if (zone.location) S(zone.location);
    page = await photoPair(doc, page, zone, i + 1);
    if (zone.products && zone.products.length) {
      H(3, "Products installed");
      L(zone.products);
    }
    H(3, "Verification checklist");
    ({ page } = table(doc, page, {
      headerStyle: "black",
      columns: [
        { key: "item", label: "Check", width: mm(60) },
        { key: "result", label: "Result", width: mm(22) },
        { key: "comment", label: "Comment", width: mm(88) },
      ],
      rows: zone.checklist.map((c): Record<string, TableCellValue> => ({
        item: c.item,
        result: { text: checkLabel(c.status), chip: checkTone(c.status) },
        comment: c.comment ?? "",
      })),
    }));
    if (zone.notes) {
      H(3, "Notes");
      B(zone.notes);
    }
  }

  // 4 · Snags, limitations, handover
  page = addPage(doc);
  H(1, "Snag list");
  if (input.snags.length === 0) {
    B("No snags were recorded at handover.");
  } else {
    ({ page } = table(doc, page, {
      headerStyle: "yellow",
      zebra: true,
      columns: [
        { key: "ref", label: "Ref", width: mm(12) },
        { key: "zone", label: "Zone", width: mm(28) },
        { key: "desc", label: "Description", width: mm(64) },
        { key: "sev", label: "Severity", width: mm(18) },
        { key: "owner", label: "Owner", width: mm(22) },
        { key: "due", label: "Due", width: mm(18) },
        { key: "status", label: "Status", width: mm(16) },
      ],
      rows: input.snags.map((s): Record<string, TableCellValue> => ({
        ref: { text: s.ref, bold: true },
        zone: s.zone ?? "—",
        desc: s.description,
        sev: { text: s.severity === "major" ? "Major" : "Minor", chip: s.severity === "major" ? "high" : "medium" },
        owner: s.owner ?? "—",
        due: s.due ?? "—",
        status: { text: s.status === "open" ? "Open" : "Closed", chip: s.status === "open" ? "critical" : "low" },
      })),
    }));
  }

  H(2, "Limitations");
  ({ page } = calloutBox(doc, page, {
    tone: "grey",
    body: "Verification is visual and dimensional at the time of handover. Fixings are checked for completeness and torque marks, not pull-tested. Floor condition is recorded as observed; slab construction is as advised by the client. Photographs show the installation on the date stated and are evidence of condition at handover only. This report does not extend the product warranty and does not replace periodic inspection, which A-SAFE UAE recommends at twelve-month intervals or after any recorded impact.",
  }));

  H(2, "Handover sign-off");
  B("Signature confirms that the installation has been walked through, the checklist results are agreed, and any open snags are listed above with an owner and a date.");
  ({ page } = signOffBlock(doc, page, [
    { role: "Install team lead", name: input.installTeam ?? undefined, title: "A-SAFE UAE installation partner", date: issuedOn },
    { role: "A-SAFE UAE projects", name: input.preparedBy, title: input.preparedByTitle ?? "Projects" },
    { role: "Client representative", name: input.clientRepresentative ?? inst.contactName ?? undefined, title: inst.customerName ?? undefined },
  ]));

  return finalize(doc);
}

// ─── Blocks ────────────────────────────────────────────────────────────────

/** Proposal photo (left) beside as-installed photo (right), captions under each; grey placeholders when missing. */
async function photoPair(doc: Doc, page: Page, zone: VerificationZone, n: number): Promise<Page> {
  const cw = contentWidth(page);
  const gutter = mm(4);
  const w = (cw - gutter) / 2;
  const maxH = mm(62);
  const labelH = TYPE.label.lead + mm(1);
  let p = ensureSpace(doc, page, maxH + labelH + mm(16));
  const top = p.cursorY;
  const left = p.margin.l;
  const right = p.margin.l + w + gutter;

  const label = (x: number, text: string) =>
    drawText(p, text.toUpperCase(), {
      x,
      y: top,
      size: TYPE.label.size,
      font: doc.fonts.bold,
      color: C.grey60,
      tracking: TYPE.label.tracking,
      lineHeight: TYPE.label.lead,
    });
  label(left, "Proposal");
  label(right, "As installed");
  p.cursorY = top - labelH;
  const startY = p.cursorY;

  const captionL = zone.proposalCaption ?? `Fig ${n}.1 — ${zone.name}, proposal`;
  const captionR = zone.asInstalledCaption ?? `Fig ${n}.2 — ${zone.name}, as installed`;
  const hL = await slot(doc, p, zone.proposalPhoto ?? null, { x: left, w, maxH, caption: captionL });
  p.cursorY = startY;
  const hR = await slot(doc, p, zone.asInstalledPhoto ?? null, { x: right, w, maxH, caption: captionR });
  p.cursorY = startY - Math.max(hL, hR);
  return p;
}

async function slot(doc: Doc, p: Page, bytes: Uint8Array | null, o: { x: number; w: number; maxH: number; caption: string }): Promise<number> {
  if (bytes) {
    const r = await photo(doc, p, bytes, { maxW: o.w, maxH: o.maxH, caption: o.caption, x: o.x, inline: true });
    return r.height;
  }
  const h = o.w * 0.66;
  const top = p.cursorY;
  p.page.drawRectangle({ x: o.x, y: top - h, width: o.w, height: h, color: C.grey8, borderColor: C.grey20, borderWidth: 0.5 });
  drawText(p, "NO PHOTO ON FILE", {
    x: o.x,
    y: top - h / 2 + TYPE.label.lead / 2,
    size: TYPE.label.size,
    font: doc.fonts.regular,
    color: C.grey60,
    maxWidth: o.w,
    align: "center",
    tracking: TYPE.label.tracking,
    lineHeight: TYPE.label.lead,
  });
  const lines = wrap(doc.fonts.regular, TYPE.small.size, o.caption, o.w);
  let y = top - h - mm(1.5);
  for (const line of lines) {
    drawText(p, line, { x: o.x, y, size: TYPE.small.size, font: doc.fonts.regular, color: C.grey60, lineHeight: TYPE.small.lead });
    y -= TYPE.small.lead;
  }
  return top - y + mm(3);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

export function checkLabel(s: CheckStatus): string {
  return s === "pass" ? "Pass" : s === "fail" ? "Fail" : "N/A";
}

export function checkTone(s: CheckStatus): Tone {
  return s === "pass" ? "low" : s === "fail" ? "critical" : "grey";
}

function phaseLabel(s: string): string {
  switch (s) {
    case "completed":
      return "Completed";
    case "in_progress":
      return "In progress";
    case "delayed":
      return "Delayed";
    case "on_hold":
      return "On hold";
    default:
      return "Not started";
  }
}

function phaseTone(s: string): Tone {
  switch (s) {
    case "completed":
      return "low";
    case "in_progress":
      return "blue";
    case "delayed":
      return "high";
    case "on_hold":
      return "medium";
    default:
      return "grey";
  }
}

function summaryParagraph(input: VerificationInput, passed: number, applicable: number, openSnags: number): string {
  const inst = input.installation;
  const parts: string[] = [];
  const start = fmtLong(inst.actualStart ?? inst.plannedStart);
  const end = fmtLong(inst.actualEnd ?? inst.plannedEnd);
  parts.push(
    `The installation at ${inst.location || "the site"} ${inst.actualEnd ? "was completed" : "is scheduled to complete"}${end ? ` on ${end}` : ""}${start ? `, having started on ${start}` : ""}.`,
  );
  parts.push(`${input.zones.length} zone${input.zones.length === 1 ? "" : "s"} were walked through against the proposal.`);
  if (applicable > 0) parts.push(`${passed} of ${applicable} applicable checks passed.`);
  parts.push(openSnags === 0 ? "No snags remain open." : `${openSnags} snag${openSnags === 1 ? "" : "s"} remain open and are listed with owners and dates.`);
  return parts.join(" ");
}

function programmeDays(inst: InstallationSummary): { value: string; sublabel: string } {
  const ps = toDate(inst.plannedStart);
  const pe = toDate(inst.plannedEnd);
  const as = toDate(inst.actualStart);
  const ae = toDate(inst.actualEnd);
  const planned = ps && pe ? Math.max(1, Math.round((pe.getTime() - ps.getTime()) / 86_400_000)) : null;
  const actual = as && ae ? Math.max(1, Math.round((ae.getTime() - as.getTime()) / 86_400_000)) : null;
  if (actual !== null) return { value: `${actual} d`, sublabel: planned !== null ? `Planned ${planned} d` : "Actual duration" };
  if (planned !== null) return { value: `${planned} d`, sublabel: "Planned duration" };
  return { value: "—", sublabel: "No dates recorded" };
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtShort(v: Date | string | null | undefined): string {
  const d = toDate(v);
  return d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
}

function fmtLong(v: Date | string | null | undefined): string {
  const d = toDate(v);
  return d ? formatDate(d) : "";
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function defaultReference(d: Date, orderNumber?: string | null): string {
  const yymm = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const digits = (orderNumber ?? "").replace(/\D/g, "");
  const seq = (digits.slice(-4) || "0001").padStart(4, "0");
  return `ASU-IV-${yymm}-${seq}`;
}
