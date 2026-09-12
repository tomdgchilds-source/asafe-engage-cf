// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/reports/proposal.ts
//
// Budgetary proposal (ASU-PR-<yymm>-<seq>), A4 portrait:
//   1 cover · 2 letter · 3 solution summary by zone · 4 scope of supply ·
//   5 installation and site requirements · 6 commercial terms ·
//   7 product cards · 8 drawing (when an image layout exists) · 9 acceptance
//
// Three layers so other renderers and tests can reuse the pieces:
//   buildProposalModel(bundle)        pure: OrderBundle → ProposalModel
//   renderProposalModel(model, meta)  ProposalModel → PDF bytes
//   renderProposal(env, opts)         loads, reserves a reference when
//                                     ISSUED, renders, stores, records
//
// Money: the order's `reciprocalCommitments.pricing` snapshot when present,
// otherwise computeTotals over the stored items with the stored discount,
// partner and complexity inputs. Never a third formula.
// ────────────────────────────────────────────────────────────────────────────

import type { Env } from "../../../types";
import { createDoc, addPage, finalize, mm, current, contentWidth, type Doc, type Page } from "../doc";
import { heading, body, small, label, bullets, drawText } from "../text";
import { coverPage, documentControl, table, kpiTiles, productCard, photo, calloutBox, signOffBlock, letterTab, type SignOffParty } from "../blocks";
import { C, TYPE, RISK_LABELS, type RiskLevel } from "../theme";
import {
  computeTotals,
  cartItemsToPricingLines,
  lineTotalAed,
  normaliseComplexity,
  INSTALL_RATES,
  type Complexity,
  type PricingResult,
} from "../../../../shared/pricing";
import { DOCUMENT_KINDS, DRAFT_REFERENCE, documentFilename, type DocumentKind } from "../../../../shared/documents/refs";
import {
  loadOrderBundle,
  reserveDocumentRef,
  recordDocumentIssue,
  areaRecommendedProductNames,
  unknownProduct,
  longDate,
  shortDate,
  money,
  metres,
  joules,
  type OrderBundle,
  type OrderItemRow,
  type PersonInfo,
  type ProductInfo,
  type LayoutDrawingInfo,
} from "./shared";

// ─── Model ─────────────────────────────────────────────────────────────────

export interface ProposalLine {
  id: string;
  productName: string;
  family: string;
  sku: string | null;
  description: string;
  testedEnergyJ: number;
  /** Units for per-unit lines; runs (always 1 as stored) for per-metre lines. */
  quantity: number;
  /** Run length in metres for per-metre lines. */
  lengthM: number | null;
  perMetre: boolean;
  unitAed: number;
  totalAed: number;
  zone: string | null;
}

export interface ProposalZoneRow {
  zone: string;
  riskLevel: RiskLevel | null;
  protection: string;
  quantityLine: string;
  indicativeAed: number | null;
}

export interface ProposalTotals {
  goodsAed: number;
  deliveryAed: number;
  installAed: number;
  discountPercentApplied: number;
  discountAed: number;
  servicePackageAed: number;
  subtotalAed: number;
  vatPercent: number;
  vatAed: number;
  totalAed: number;
  source: "snapshot" | "computed" | "quote";
}

export interface ProposalSignOff {
  role: "technical" | "commercial" | "marketing";
  label: string;
  name: string | null;
  title: string | null;
  signedAt: string | null;
}

export interface ProposalCommitment {
  title: string;
  description: string | null;
  discountPercent: number | null;
}

export interface ProposalModel {
  orderId: string | null;
  orderNumber: string | null;
  projectId: string | null;
  surveyId: string | null;
  client: {
    company: string;
    contact: string | null;
    contactTitle: string | null;
    email: string | null;
    mobile: string | null;
    address: string | null;
  };
  project: { name: string; location: string | null; description: string | null };
  preparedBy: PersonInfo;
  date: Date;
  currency: string;
  fxRate: number;
  survey: { title: string; date: Date | null; zoneCount: number; highestLevel: RiskLevel | null } | null;
  zones: ProposalZoneRow[];
  lines: ProposalLine[];
  totals: ProposalTotals;
  complexity: Complexity;
  installationNotes: string | null;
  commitments: ProposalCommitment[];
  serviceCare: { label: string; aed: number } | null;
  /** Unique products used, in first-use order. */
  products: ProductInfo[];
  heroImage: Uint8Array | null;
  drawing: LayoutDrawingInfo | null;
  approvals: ProposalSignOff[];
  /** True when a rep-facing quote draft, not an order, produced the model. */
  isQuoteDraft: boolean;
}

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function riskLevelOf(v: unknown): RiskLevel | null {
  const s = String(v ?? "").toLowerCase();
  return s === "low" || s === "medium" || s === "high" || s === "critical" ? s : null;
}

const LEVEL_RANK: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3, critical: 4 };

function signOffFrom(role: ProposalSignOff["role"], raw: unknown): ProposalSignOff {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const signed = !!r.signed;
  return {
    role,
    label: role === "technical" ? "Technical approval" : role === "commercial" ? "Commercial approval" : "Marketing approval",
    name: signed ? String(r.signedBy ?? r.name ?? "") || null : null,
    title: signed ? String(r.jobTitle ?? r.signerJobTitle ?? "") || null : null,
    signedAt: signed && (r.signedAt || r.date) ? shortDate(String(r.signedAt ?? r.date)) : null,
  };
}

/** Line description: variant, application area and rep notes, kept to one sentence each. */
function lineDescription(it: OrderItemRow, product: ProductInfo): string {
  const parts: string[] = [];
  const variant = it.selectedVariant as { label?: string; name?: string; lengthMm?: number } | null | undefined;
  if (variant?.label || variant?.name) parts.push(String(variant.label ?? variant.name));
  else if (variant?.lengthMm) parts.push(`${variant.lengthMm} mm`);
  if (it.applicationArea) parts.push(String(it.applicationArea));
  if (product.deflectionZoneMm) parts.push(`deflection zone ${product.deflectionZoneMm} mm`);
  if (typeof it.notes === "string" && it.notes.trim()) parts.push(it.notes.trim());
  return parts.join(" · ");
}

/** Totals: stored snapshot when the order carries one, else computeTotals with the stored inputs. */
export function totalsForOrder(bundle: Pick<OrderBundle, "order" | "items">): ProposalTotals {
  const order = bundle.order as Record<string, unknown>;
  const reciprocal = (order.reciprocalCommitments ?? null) as Record<string, unknown> | null;
  const snap = (reciprocal?.pricing ?? null) as Record<string, unknown> | null;
  if (snap && Number.isFinite(Number(snap.totalAed)) && Number.isFinite(Number(snap.goodsAed))) {
    const vatAed = num(snap.vatAed);
    const subtotal = num(snap.subtotalAed);
    return {
      goodsAed: num(snap.goodsAed),
      deliveryAed: num(snap.deliveryAed),
      installAed: num(snap.installAed),
      discountPercentApplied: num(snap.discountPercentApplied),
      discountAed: num(snap.discountAed),
      servicePackageAed: num(snap.servicePackageAed),
      subtotalAed: subtotal,
      vatPercent: subtotal > 0 && vatAed > 0 ? Math.round((vatAed / subtotal) * 100) : 0,
      vatAed,
      totalAed: num(snap.totalAed),
      source: "snapshot",
    };
  }
  let reciprocalPct = Number(reciprocal?.totalDiscountPercent ?? NaN);
  if (!Number.isFinite(reciprocalPct)) {
    reciprocalPct = 0;
    for (const o of Array.isArray(order.discountOptions) ? (order.discountOptions as unknown[]) : []) {
      if (o && typeof o === "object" && typeof (o as { discountPercent?: unknown }).discountPercent === "number") {
        reciprocalPct += (o as { discountPercent: number }).discountPercent;
      }
    }
  }
  const result: PricingResult = computeTotals({
    lines: cartItemsToPricingLines(bundle.items),
    complexity: normaliseComplexity(order.installationComplexity as string | null),
    reciprocalDiscountPercent: reciprocalPct,
    partnerDiscountPercent: num(order.partnerDiscountPercent),
    socialDiscountPercent: 0,
    servicePackageAed: num((order.serviceCareDetails as { cost?: unknown } | null)?.cost),
    vatPercent: 0,
  });
  return { ...result, vatPercent: 0, source: "computed" };
}

/** Pure: OrderBundle → ProposalModel. */
export function buildProposalModel(bundle: OrderBundle): ProposalModel {
  const order = bundle.order;
  const o = order as unknown as Record<string, unknown>;
  const pricingLines = cartItemsToPricingLines(bundle.items);
  const products: ProductInfo[] = [];
  const seen = new Set<string>();

  const lines: ProposalLine[] = bundle.items.map((it, i) => {
    const product = bundle.products.get(it.productName) ?? unknownProduct(it.productName, it.category);
    if (!seen.has(product.name)) {
      seen.add(product.name);
      products.push(product);
    }
    const pl = pricingLines[i];
    const perMetre = pl.pricingType === "per-meter";
    return {
      id: pl.id,
      productName: it.productName,
      family: product.family,
      sku: product.sku ?? it.sku ?? null,
      description: lineDescription(it, product),
      testedEnergyJ: product.testedEnergyJ || num(it.impactRating),
      quantity: perMetre ? 1 : pl.quantity,
      lengthM: perMetre ? pl.quantity : null,
      perMetre,
      unitAed: pl.unitPriceAed,
      totalAed: lineTotalAed(pl),
      zone: it.zoneName ?? it.areaName ?? it.applicationArea ?? null,
    };
  });

  // Zones: from the survey when we have one, else grouped by family.
  const zones: ProposalZoneRow[] = [];
  let surveyInfo: ProposalModel["survey"] = null;
  if (bundle.survey && bundle.survey.areas.length) {
    const s = bundle.survey;
    let highest: RiskLevel | null = null;
    for (const a of s.areas) {
      const level = riskLevelOf(a.riskLevel);
      if (level && (!highest || LEVEL_RANK[level] > LEVEL_RANK[highest])) highest = level;
      const zoneKey = String(a.zoneName || a.areaName).toLowerCase();
      const matched = lines.filter((l) => l.zone && l.zone.toLowerCase() === zoneKey);
      const recommended = areaRecommendedProductNames(a);
      const protection = matched.length ? Array.from(new Set(matched.map((l) => l.productName))).join(", ") : recommended.join(", ") || "To be confirmed";
      const qty = matched.length
        ? matched.map((l) => (l.perMetre ? metres(l.lengthM ?? 0) : `${l.quantity} no.`)).join(" + ")
        : a.recommendedLengthM
          ? metres(Number(a.recommendedLengthM))
          : "";
      const aed = matched.length ? matched.reduce((sum, l) => sum + l.totalAed, 0) : a.estimatedCost ? num(a.estimatedCost) : null;
      zones.push({ zone: a.zoneName || a.areaName, riskLevel: level, protection, quantityLine: qty, indicativeAed: aed });
    }
    surveyInfo = { title: s.survey.title, date: s.survey.surveyDate ?? null, zoneCount: s.areas.length, highestLevel: highest };
  } else {
    const byFamily = new Map<string, ProposalLine[]>();
    for (const l of lines) byFamily.set(l.family, [...(byFamily.get(l.family) ?? []), l]);
    for (const [family, ls] of byFamily) {
      zones.push({
        zone: ls[0].zone ?? family,
        riskLevel: null,
        protection: Array.from(new Set(ls.map((l) => l.productName))).join(", "),
        quantityLine: ls.map((l) => (l.perMetre ? metres(l.lengthM ?? 0) : `${l.quantity} no.`)).join(" + "),
        indicativeAed: ls.reduce((sum, l) => sum + l.totalAed, 0),
      });
    }
  }

  const reciprocal = (o.reciprocalCommitments ?? null) as { commitments?: unknown[] } | null;
  const commitments: ProposalCommitment[] = [];
  const rawCommitments = Array.isArray(reciprocal?.commitments) ? reciprocal!.commitments : Array.isArray(o.discountOptions) ? (o.discountOptions as unknown[]) : [];
  for (const c of rawCommitments) {
    if (typeof c === "string") commitments.push({ title: c, description: null, discountPercent: null });
    else if (c && typeof c === "object") {
      const r = c as { title?: string; description?: string; discountPercent?: number };
      if (r.title) commitments.push({ title: r.title, description: r.description ?? null, discountPercent: typeof r.discountPercent === "number" ? r.discountPercent : null });
    }
  }

  const totals = totalsForOrder(bundle);
  const serviceDetails = o.serviceCareDetails as { packageName?: string } | null;
  const servicePkg = o.servicePackage as { title?: string } | string | null;
  const serviceCare =
    totals.servicePackageAed > 0
      ? { label: serviceDetails?.packageName || (typeof servicePkg === "string" ? servicePkg : servicePkg?.title) || "Service Care", aed: totals.servicePackageAed }
      : null;

  const heroPhoto = bundle.survey?.photos.find((p) => p.bytes) ?? null;
  const fx = Number(o.fxRateAtOrder);

  return {
    orderId: order.id,
    orderNumber: order.customOrderNumber || order.orderNumber || null,
    projectId: bundle.project?.id ?? null,
    surveyId: bundle.survey?.survey.id ?? null,
    client: {
      company: order.customerCompany || bundle.survey?.survey.facilityName || "Customer",
      contact: order.customerName ?? null,
      contactTitle: order.customerJobTitle ?? null,
      email: order.customerEmail ?? null,
      mobile: order.customerMobile ?? null,
      address: bundle.project?.defaultDeliveryAddress ?? order.projectLocation ?? bundle.survey?.survey.facilityLocation ?? null,
    },
    project: {
      name: order.projectName || bundle.project?.name || bundle.survey?.survey.title || order.customerCompany || "Impact protection",
      location: order.projectLocation ?? bundle.project?.location ?? bundle.survey?.survey.facilityLocation ?? null,
      description: order.projectDescription ?? bundle.project?.description ?? null,
    },
    preparedBy: bundle.owner,
    date: new Date(),
    currency: (order.currency || "AED").toUpperCase(),
    fxRate: Number.isFinite(fx) && fx > 0 ? fx : 1,
    survey: surveyInfo,
    zones,
    lines,
    totals,
    complexity: normaliseComplexity(order.installationComplexity),
    installationNotes: bundle.project?.installationNotes ?? (typeof o.installationNotes === "string" ? o.installationNotes : null),
    commitments,
    serviceCare,
    products,
    heroImage: heroPhoto?.bytes ?? null,
    drawing: bundle.layoutDrawing,
    approvals: [
      signOffFrom("technical", order.technicalSignature),
      signOffFrom("commercial", order.commercialSignature),
      signOffFrom("marketing", order.marketingSignature),
    ],
    isQuoteDraft: false,
  };
}

// ─── Quote draft → model (rep-facing quote route) ──────────────────────────

export interface QuoteDraftLike {
  quoteId: string;
  generatedAt: Date;
  customerCompany?: string | null;
  customerName?: string | null;
  projectName?: string | null;
  projectLocation?: string | null;
  preparedBy?: PersonInfo | null;
  zones: Array<{
    name: string;
    selectedProductName: string;
    quantityOrLengthMeters: number;
    pricingMode: "per_length" | "per_unit";
    extendedAed: number;
    pas13Verdict?: string | null;
    rationale?: string | null;
  }>;
  lineItems: Array<{
    productId: string;
    productName: string;
    sku: string | null;
    quantityOrLengthMeters: number;
    pricingMode: "per_length" | "per_unit";
    unitPriceAed: number;
    extendedAed: number;
    priceMissing?: boolean;
  }>;
  totals: { subtotalAed: number; serviceCareAed?: number; serviceCareLabel?: string; vatAed?: number; vatPct?: number; grandTotalAed: number };
  notes?: string | null;
  products?: Map<string, ProductInfo>;
}

/** A quote draft carries its own figures; they are shown as stored, never recomputed. */
export function quoteDraftToProposalModel(q: QuoteDraftLike): ProposalModel {
  const products: ProductInfo[] = [];
  const seen = new Set<string>();
  const lines: ProposalLine[] = q.lineItems.map((li, i) => {
    const product = q.products?.get(li.productName) ?? unknownProduct(li.productName);
    if (!seen.has(product.name)) {
      seen.add(product.name);
      products.push(product);
    }
    const perMetre = li.pricingMode === "per_length";
    return {
      id: `q-${i}`,
      productName: li.productName,
      family: product.family,
      sku: li.sku,
      description: li.priceMissing ? "Price on application — contact A-SAFE" : "",
      testedEnergyJ: product.testedEnergyJ,
      quantity: perMetre ? 1 : li.quantityOrLengthMeters,
      lengthM: perMetre ? li.quantityOrLengthMeters : null,
      perMetre,
      unitAed: li.unitPriceAed,
      totalAed: li.extendedAed,
      zone: null,
    };
  });
  const verdictLevel = (v: string | null | undefined): RiskLevel | null => (v === "not_aligned" ? "high" : v === "borderline" ? "medium" : v === "aligned" ? "low" : null);
  const zones: ProposalZoneRow[] = q.zones.map((z) => ({
    zone: z.name,
    riskLevel: verdictLevel(z.pas13Verdict),
    protection: z.selectedProductName,
    quantityLine: z.pricingMode === "per_length" ? metres(z.quantityOrLengthMeters) : `${z.quantityOrLengthMeters} no.`,
    indicativeAed: z.extendedAed,
  }));
  const service = q.totals.serviceCareAed ?? 0;
  const vat = q.totals.vatAed ?? 0;
  return {
    orderId: null,
    orderNumber: `QUOTE-${q.quoteId.slice(0, 8).toUpperCase()}`,
    projectId: null,
    surveyId: null,
    client: { company: q.customerCompany || "Customer", contact: q.customerName ?? null, contactTitle: null, email: null, mobile: null, address: q.projectLocation ?? null },
    project: { name: q.projectName || q.customerCompany || "Impact protection", location: q.projectLocation ?? null, description: q.notes ?? null },
    preparedBy: q.preparedBy ?? { name: "A-SAFE UAE", title: null, email: null, mobile: null, company: "A-SAFE DWC LLC" },
    date: q.generatedAt,
    currency: "AED",
    fxRate: 1,
    survey: null,
    zones,
    lines,
    totals: {
      goodsAed: q.totals.subtotalAed,
      deliveryAed: 0,
      installAed: 0,
      discountPercentApplied: 0,
      discountAed: 0,
      servicePackageAed: service,
      subtotalAed: q.totals.subtotalAed + service,
      vatPercent: q.totals.vatPct ?? (vat > 0 ? 5 : 0),
      vatAed: vat,
      totalAed: q.totals.grandTotalAed,
      source: "quote",
    },
    complexity: "normal",
    installationNotes: null,
    commitments: [],
    serviceCare: service > 0 ? { label: q.totals.serviceCareLabel || "Service Care", aed: service } : null,
    products,
    heroImage: null,
    drawing: null,
    approvals: [signOffFrom("technical", null), signOffFrom("commercial", null), signOffFrom("marketing", null)],
    isQuoteDraft: true,
  };
}

// ─── Rendering ─────────────────────────────────────────────────────────────

export interface RenderMeta {
  status: "DRAFT" | "ISSUED";
  reference: string;
  revision: string;
  issuedOn: Date;
}

function fmt(model: ProposalModel) {
  return (aed: number) => money(aed, model.currency, model.fxRate);
}

function complexityLabel(c: Complexity): string {
  return c === "simple" ? "Simple" : c === "complex" ? "Complex" : "Standard";
}

/** Two-column key/value lines drawn at the cursor (label over value). */
function metaGrid(page: Page, cells: Array<[string, string]>): Page {
  const doc = page.doc;
  const cw = contentWidth(page);
  const colW = (cw - mm(6)) / 2;
  const rowH = mm(11);
  const rows = Math.ceil(cells.length / 2);
  let p = page;
  p = doc.current && doc.current.cursorY - rows * rowH < p.margin.b ? addPage(doc) : p;
  const top = p.cursorY;
  cells.forEach(([k, v], i) => {
    const x = p.margin.l + (i % 2) * (colW + mm(6));
    const y = top - Math.floor(i / 2) * rowH;
    drawText(p, k.toUpperCase(), { x, y, size: TYPE.label.size, font: doc.fonts.regular, color: C.grey60, tracking: TYPE.label.tracking, lineHeight: TYPE.label.lead });
    drawText(p, v || "—", { x, y: y - TYPE.label.lead, size: TYPE.table.size + 0.5, font: doc.fonts.bold, maxWidth: colW, lineHeight: TYPE.table.lead, noWrap: true });
  });
  p.cursorY = top - rows * rowH - mm(3);
  return p;
}

/** Cover page. */
export async function drawCover(doc: Doc, model: ProposalModel, meta: RenderMeta, kind: DocumentKind): Promise<Page> {
  const ref = meta.status === "ISSUED" ? `${meta.reference}  ·  Rev ${meta.revision}` : DRAFT_REFERENCE;
  return coverPage(doc, {
    heroImage: model.heroImage ?? undefined,
    docTypeLine: DOCUMENT_KINDS[kind],
    title: model.project.name,
    subtitle:
      kind === "PR"
        ? `Impact protection proposal for ${model.client.company}${model.project.location ? `, ${model.project.location}` : ""}`
        : `Scope of supply, commercial terms and acceptance for ${model.client.company}`,
    client: model.client.company,
    site: model.project.location || model.client.address || "As surveyed",
    date: longDate(meta.issuedOn),
    preparedBy: `${model.preparedBy.name}${model.preparedBy.title ? `, ${model.preparedBy.title}` : ""}, A-SAFE UAE`,
    reference: ref,
    status: meta.status,
  });
}

/** Letter page: yellow tab, address block, three paragraphs, signature. */
export async function drawLetter(doc: Doc, model: ProposalModel, meta: RenderMeta): Promise<Page> {
  let page = addPage(doc, { header: false });
  await letterTab(doc, page);
  const cw = contentWidth(page);

  // Address block left, date / reference right.
  const addr = [model.client.contact, model.client.contactTitle, model.client.company, model.client.address].filter(Boolean) as string[];
  const top = page.cursorY;
  let y = top;
  for (const line of addr) {
    y -= drawText(page, line, { x: page.margin.l, y, size: TYPE.body.size, font: doc.fonts.regular, maxWidth: cw * 0.55, lineHeight: TYPE.body.lead });
  }
  const rightX = page.margin.l + cw * 0.62;
  const rightW = cw * 0.38;
  let ry = top;
  for (const [k, v] of [
    ["Date", longDate(meta.issuedOn)],
    ["Our reference", meta.status === "ISSUED" ? `${meta.reference} Rev ${meta.revision}` : "DRAFT — not for issue"],
    ["Your reference", model.orderNumber ?? "—"],
  ] as Array<[string, string]>) {
    drawText(page, k.toUpperCase(), { x: rightX, y: ry, size: TYPE.label.size, font: doc.fonts.regular, color: C.grey60, tracking: TYPE.label.tracking, lineHeight: TYPE.label.lead });
    ry -= TYPE.label.lead;
    ry -= drawText(page, v, { x: rightX, y: ry, size: TYPE.table.size + 0.5, font: doc.fonts.bold, maxWidth: rightW, lineHeight: TYPE.table.lead });
    ry -= mm(1.5);
  }
  page.cursorY = Math.min(y, ry) - mm(8);

  const salutation = model.client.contact ? `Dear ${model.client.contact.split(" ")[0]},` : "Dear Sir or Madam,";
  body(page, salutation);
  page = current(doc);

  heading(page, 3, `Budgetary proposal — ${model.project.name}`);
  page = current(doc);

  const zoneCount = model.zones.length;
  const surveyed = model.survey
    ? `Thank you for the time on site. On ${model.survey.date ? longDate(model.survey.date) : "the survey date"} we walked ${model.survey.zoneCount} ${model.survey.zoneCount === 1 ? "zone" : "zones"} at ${model.project.location || model.client.company} and recorded the vehicle movements, existing protection and impact history in each. ${
        model.survey.highestLevel ? `The highest risk recorded is ${RISK_LABELS[model.survey.highestLevel].toLowerCase()}.` : ""
      }`
    : `Thank you for your enquiry. This proposal covers ${zoneCount} ${zoneCount === 1 ? "area" : "areas"} at ${model.project.location || model.client.company}, based on the vehicle and layout information you supplied.`;
  body(page, surveyed.trim());
  page = current(doc);

  const families = Array.from(new Set(model.products.map((p) => p.family)));
  body(
    page,
    `We propose ${families.length ? families.join(", ") : "A-SAFE polymer safety barrier"} protection across ${zoneCount} ${zoneCount === 1 ? "zone" : "zones"}, selected against the PAS 13:2017 impact-energy method so each product's tested energy exceeds the energy of the vehicle that could strike it. The scope of supply, installation requirements and commercial terms follow. The indicative investment is ${fmt(model)(model.totals.subtotalAed)} ex-VAT.`,
  );
  page = current(doc);
  body(
    page,
    "Please review the scope with your operations and HSE leads. On acceptance we confirm the survey dimensions, issue the layout drawing for approval and schedule installation. Pricing is budgetary and valid for 30 days from the date above.",
  );
  page = current(doc);

  page.cursorY -= mm(4);
  body(page, "Yours sincerely,");
  page = current(doc);
  page.cursorY -= mm(10);
  body(page, model.preparedBy.name, { bold: true, after: mm(0.5) });
  page = current(doc);
  const sig = [model.preparedBy.title, model.preparedBy.company || "A-SAFE DWC LLC", model.preparedBy.mobile, model.preparedBy.email].filter(Boolean).join("  ·  ");
  if (sig) small(page, sig);
  return current(doc);
}

/** Solution summary by zone (or by family when there is no survey). */
export function drawSolutionSummary(doc: Doc, model: ProposalModel): Page {
  let page = addPage(doc);
  heading(page, 1, "Solution summary");
  page = current(doc);
  body(
    page,
    model.survey
      ? `Zones from the ${model.survey.title} risk register, in priority order, with the protection proposed for each. Indicative values are ex-VAT and exclude delivery and installation.`
      : "Proposed protection grouped by product family. Indicative values are ex-VAT and exclude delivery and installation.",
  );
  page = current(doc);
  const f = fmt(model);
  ({ page } = table(doc, page, {
    headerStyle: "yellow",
    zebra: true,
    columns: [
      { key: "n", label: "#", width: mm(8), align: "right" },
      { key: "zone", label: "Zone", width: mm(40) },
      { key: "level", label: "Risk level", width: mm(24) },
      { key: "protection", label: "Proposed protection", width: mm(58) },
      { key: "qty", label: "Length / qty", width: mm(22), align: "right" },
      { key: "aed", label: `Indicative ${model.currency}`, width: mm(28), align: "right" },
    ],
    rows: model.zones.map((z, i) => ({
      n: i + 1,
      zone: z.zone,
      level: z.riskLevel ? { text: RISK_LABELS[z.riskLevel], chip: z.riskLevel } : "—",
      protection: z.protection,
      qty: z.quantityLine || "—",
      aed: z.indicativeAed !== null ? f(z.indicativeAed).replace(`${model.currency} `, "") : "TBC",
    })),
  }));
  const withLevel = model.zones.filter((z) => z.riskLevel);
  ({ page } = kpiTiles(doc, page, [
    { label: "Zones", value: String(model.zones.length), sublabel: model.survey ? "From the risk register" : "By product family" },
    {
      label: "Critical + high",
      value: String(withLevel.filter((z) => z.riskLevel === "critical" || z.riskLevel === "high").length),
      sublabel: withLevel.length ? "Action within 30 days" : "No survey scoring",
      tone: withLevel.some((z) => z.riskLevel === "critical") ? "critical" : withLevel.some((z) => z.riskLevel === "high") ? "high" : "neutral",
    },
    { label: "Products", value: String(model.products.length), sublabel: "See appendix for datasheets" },
    { label: "Indicative investment", value: f(model.totals.subtotalAed), sublabel: "Ex-VAT, valid 30 days" },
  ]));
  return page;
}

/** Scope of supply: line table, delivery, installation, commitments, totals. Reused by the order form. */
export function drawScopeOfSupply(doc: Doc, model: ProposalModel, opts: { newPage?: boolean } = {}): Page {
  let page = opts.newPage === false ? current(doc) : addPage(doc);
  heading(page, 1, "Scope of supply");
  page = current(doc);
  const f = fmt(model);
  const cur = model.currency;
  const strip = (s: string) => s.replace(`${cur} `, "");

  ({ page } = table(doc, page, {
    headerStyle: "black",
    zebra: true,
    columns: [
      { key: "n", label: "#", width: mm(8), align: "right" },
      { key: "item", label: "Item", width: mm(44) },
      { key: "desc", label: "Description", width: mm(46) },
      { key: "energy", label: "Tested energy", width: mm(22), align: "right" },
      { key: "qty", label: "Qty × length", width: mm(22), align: "right" },
      { key: "unit", label: `Unit ${cur}`, width: mm(20), align: "right" },
      { key: "total", label: `Total ${cur}`, width: mm(22), align: "right" },
    ],
    rows: model.lines.map((l, i) => ({
      n: i + 1,
      item: { text: l.productName, bold: true },
      desc: [l.sku ? `SKU ${l.sku}` : "", l.description].filter(Boolean).join(" · "),
      energy: l.testedEnergyJ > 0 ? joules(l.testedEnergyJ) : "—",
      qty: l.perMetre ? `${l.quantity} × ${metres(l.lengthM ?? 0)}` : `${l.quantity} no.`,
      unit: l.unitAed > 0 ? strip(f(l.unitAed)) + (l.perMetre ? "/m" : "") : "POA",
      total: l.totalAed > 0 ? strip(f(l.totalAed)) : "POA",
    })),
  }));

  // Totals block, right-aligned key/value rows.
  const t = model.totals;
  const rows: Array<[string, string, boolean]> = [[`Goods`, f(t.goodsAed), false]];
  if (t.discountAed > 0) rows.push([`Reciprocal value commitments (${t.discountPercentApplied.toLocaleString("en-GB", { maximumFractionDigits: 2 })} %)`, `- ${f(t.discountAed)}`, false]);
  if (t.deliveryAed > 0) rows.push(["Delivery", f(t.deliveryAed), false]);
  if (t.installAed > 0) rows.push([`Installation (${complexityLabel(model.complexity).toLowerCase()} complexity)`, f(t.installAed), false]);
  if (t.servicePackageAed > 0) rows.push([model.serviceCare?.label ?? "Service Care", f(t.servicePackageAed), false]);
  rows.push(["Total ex-VAT", f(t.subtotalAed), true]);
  if (t.vatAed > 0) {
    rows.push([`VAT ${t.vatPercent} %`, f(t.vatAed), false]);
    rows.push(["Total incl. VAT", f(t.totalAed), true]);
  }
  const cw = contentWidth(page);
  const boxW = mm(92);
  const rowH = mm(7);
  const need = rows.length * rowH + mm(6);
  if (page.cursorY - need < page.margin.b) page = addPage(doc);
  const x0 = page.margin.l + cw - boxW;
  let y = page.cursorY;
  for (const [k, v, bold] of rows) {
    if (bold) page.page.drawRectangle({ x: x0, y: y - rowH, width: boxW, height: rowH, color: C.yellow });
    drawText(page, k, { x: x0 + mm(2.5), y, size: TYPE.table.size, font: bold ? doc.fonts.bold : doc.fonts.regular, lineHeight: rowH, maxWidth: boxW * 0.62, noWrap: true });
    drawText(page, v, { x: x0, y, size: TYPE.table.size + (bold ? 1 : 0), font: bold ? doc.fonts.bold : doc.fonts.regular, maxWidth: boxW - mm(2.5), align: "right", lineHeight: rowH });
    y -= rowH;
    page.page.drawLine({ start: { x: x0, y }, end: { x: x0 + boxW, y }, thickness: 0.5, color: C.grey20 });
  }
  page.cursorY = y - mm(5);

  if (model.commitments.length) {
    heading(page, 3, "Reciprocal value commitments applied");
    page = current(doc);
    bullets(
      page,
      model.commitments.map((c) => `${c.title}${c.discountPercent ? ` — ${c.discountPercent} %` : ""}${c.description ? `. ${c.description}` : ""}`),
    );
    page = current(doc);
  }
  ({ page } = calloutBox(doc, page, {
    tone: "grey",
    title: "Budgetary",
    body: `Prices are budgetary, ex-VAT, in ${cur}${cur !== "AED" ? ` (converted from AED at ${model.fxRate})` : ""} and valid for 30 days from the issue date. Quantities and run lengths are confirmed on the approved layout drawing before order.${
      model.isQuoteDraft ? " Quote draft for rep review — figures indicative until confirmed by the estimation team." : ""
    }`,
  }));
  return page;
}

/** Installation and site requirements. */
export function drawInstallation(doc: Doc, model: ProposalModel): Page {
  let page = addPage(doc);
  heading(page, 1, "Installation and site requirements");
  page = current(doc);
  const rate = INSTALL_RATES[model.complexity] * 100;
  heading(page, 2, "Installation complexity");
  page = current(doc);
  body(
    page,
    `Installation is priced at ${complexityLabel(model.complexity).toLowerCase()} complexity (${rate.toFixed(1)} % of goods carrying installation). ${
      model.complexity === "simple"
        ? "Open floor, clear access, standard 150 mm concrete slab and no out-of-hours working."
        : model.complexity === "complex"
          ? "Restricted access, phased working around live operations, non-standard floor or fixings, or night working."
          : "Working around a live operation with normal access; standard concrete slab and fixings."
    }`,
  );
  page = current(doc);
  heading(page, 2, "Floor and fixings");
  page = current(doc);
  bullets(page, [
    "Posts are fixed with resin or mechanical anchors into a reinforced concrete slab of at least 150 mm; slab thickness and reinforcement are assumed until verified on site.",
    "Fixing centres, anchor depth and edge distances follow the A-SAFE GroundWorks specification for each product.",
    "Underfloor services within 300 mm of any post position must be identified by the client before drilling.",
  ]);
  page = current(doc);
  heading(page, 2, "Access and programme");
  page = current(doc);
  bullets(page, [
    "Lead time 4–6 weeks from order confirmation to delivery; installation follows delivery and typically runs at 40–60 linear metres per team per day.",
    "The installation team needs a marked-out, cleared area, a forklift for offloading, and a permit-to-work where the site requires one.",
    "Work is scheduled in normal hours; out-of-hours working is quoted separately.",
  ]);
  page = current(doc);
  heading(page, 2, "Client responsibilities");
  page = current(doc);
  bullets(page, [
    "Confirm run lengths and post positions on the layout drawing before manufacture.",
    "Provide floor construction details or allow a pull-out test where the slab is unknown.",
    "Clear the work area, provide site induction and access, and remove or relocate existing protection unless included in scope.",
  ]);
  page = current(doc);
  if (model.installationNotes) {
    ({ page } = calloutBox(doc, page, { tone: "yellow", title: "Site notes from the survey", body: model.installationNotes }));
  }
  return page;
}

/** Commercial terms. Reused by the order form. */
export function drawCommercialTerms(doc: Doc, model: ProposalModel, opts: { newPage?: boolean } = {}): Page {
  let page = opts.newPage === false ? current(doc) : addPage(doc);
  heading(page, 1, "Commercial terms");
  page = current(doc);
  const terms: Array<[string, string]> = [
    ["Payment", "50 % with order, 50 % on delivery, before installation. Bank transfer to A-SAFE DWC LLC; invoices in the proposal currency."],
    ["Lead time", "4–6 weeks from receipt of purchase order and deposit to delivery, subject to stock at time of order."],
    ["Warranty", "As per A-SAFE standard terms and conditions of sale."],
    ["Validity", "30 days from the issue date. Prices are budgetary until confirmed by the A-SAFE estimation team on the approved layout drawing."],
    ["VAT", model.totals.vatAed > 0 ? `UAE VAT at ${model.totals.vatPercent} % is shown above.` : "Prices are ex-VAT. UAE VAT at 5 % is applied at invoice."],
    ["Exclusions", "Civil works, floor repairs and making good, permits and site passes, out-of-hours working, removal of existing protection, and anything not listed in the scope of supply."],
    ["Standards", "Products are tested to PAS 13:2017 by the pendulum method. Selection is indicative until confirmed by A-SAFE engineering; verify with A-SAFE engineering for procurement."],
  ];
  ({ page } = documentControl(doc, page, terms.map(([key, value]) => ({ key, value })), { title: "Terms of supply" }));
  return page;
}

/** Product cards appendix, one per product used. */
export async function drawProductAppendix(doc: Doc, model: ProposalModel): Promise<Page> {
  let page = addPage(doc);
  heading(page, 1, "Appendix — Products");
  page = current(doc);
  small(page, "One card per product in the scope of supply. Tested energy is the PAS 13:2017 pendulum test figure.");
  page = current(doc);
  const f = fmt(model);
  for (const p of model.products) {
    const lines = model.lines.filter((l) => l.productName === p.name);
    const qty = lines.map((l) => (l.perMetre ? `${l.quantity} × ${metres(l.lengthM ?? 0)}` : `${l.quantity} no.`)).join(" + ");
    const total = lines.reduce((s, l) => s + l.totalAed, 0);
    const zones = Array.from(new Set(lines.map((l) => l.zone).filter(Boolean))) as string[];
    ({ page } = await productCard(doc, page, {
      image: p.imageBytes,
      name: p.name,
      family: p.family,
      testedEnergyJ: p.testedEnergyJ,
      keySpecs: p.keySpecs.length ? p.keySpecs : ["Specification on the product datasheet"],
      why: zones.length ? `Proposed for ${zones.join(", ")}.` : p.description ? p.description.split(/\.\s+/)[0] + "." : "",
      quantityLine: qty || undefined,
      unitPriceAed: lines[0]?.unitAed || undefined,
      lineTotalAed: total || undefined,
    }));
    if (p.datasheetUrl) {
      small(page, `Datasheet: ${p.datasheetUrl}`);
      page = current(doc);
    }
  }
  return page;
}

/** Drawing page when the layout drawing is an image. */
export async function drawDrawingPage(doc: Doc, model: ProposalModel): Promise<Page | null> {
  if (!model.drawing?.bytes) return null;
  let page = addPage(doc);
  heading(page, 1, "Layout drawing");
  page = current(doc);
  const d = model.drawing;
  const cap = [d.dwgNumber ? `Drawing ${d.dwgNumber}` : "Layout drawing", d.revision ? `Rev ${d.revision}` : "", d.title ?? ""].filter(Boolean).join(" · ");
  ({ page } = await photo(doc, page, d.bytes, {
    maxW: contentWidth(page),
    maxH: page.height * 0.62,
    caption: `${cap}. Not to scale. Post positions confirmed on the approved drawing before manufacture.`,
  }));
  return page;
}

/** Acceptance: technical / commercial / marketing sign-off and the PO line. Reused by the order form. */
export function drawAcceptance(doc: Doc, model: ProposalModel, opts: { newPage?: boolean } = {}): Page {
  let page = opts.newPage === false ? current(doc) : addPage(doc);
  heading(page, 1, "Acceptance");
  page = current(doc);
  body(
    page,
    "Signature below confirms acceptance of the scope of supply and commercial terms in this document. Technical approval confirms the product selection and layout; commercial approval confirms the price and terms; marketing approval confirms the reciprocal value commitments.",
  );
  page = current(doc);
  const parties: SignOffParty[] = model.approvals
    .filter((a) => a.role !== "marketing" || model.commitments.length > 0 || a.name)
    .map((a) => ({ role: a.label, name: a.name ?? undefined, title: a.title ?? undefined, date: a.signedAt ?? undefined }));
  ({ page } = signOffBlock(doc, page, parties));
  ({ page } = signOffBlock(doc, page, [
    { role: "Accepted for the client", title: model.client.company },
    { role: "A-SAFE UAE", name: model.preparedBy.name, title: model.preparedBy.title ?? undefined },
  ]));
  page = metaGrid(page, [
    ["Purchase order reference", ""],
    ["PO date", ""],
    ["Our reference", model.orderNumber ?? "—"],
    ["Document", `${doc.meta.reference}${doc.meta.status === "ISSUED" ? ` Rev ${doc.meta.revision}` : ""}`],
  ]);
  label(page, "Please return a signed copy with your purchase order to your A-SAFE contact.");
  return current(doc);
}

/** ProposalModel → PDF bytes. */
export async function renderProposalModel(model: ProposalModel, meta: RenderMeta): Promise<Uint8Array> {
  const doc = await createDoc({
    title: DOCUMENT_KINDS.PR,
    reference: meta.status === "ISSUED" ? meta.reference : DRAFT_REFERENCE,
    revision: meta.revision,
    issuedOn: shortDate(meta.issuedOn),
    docType: DOCUMENT_KINDS.PR,
    status: meta.status,
  });
  await drawCover(doc, model, meta, "PR");
  await drawLetter(doc, model, meta);
  drawSolutionSummary(doc, model);
  drawScopeOfSupply(doc, model);
  drawInstallation(doc, model);
  drawCommercialTerms(doc, model);
  await drawProductAppendix(doc, model);
  await drawDrawingPage(doc, model);
  drawAcceptance(doc, model);
  return finalize(doc);
}

// ─── Entry point ───────────────────────────────────────────────────────────

export interface RenderDocumentOptions {
  orderId: string;
  surveyId?: string | null;
  status: "DRAFT" | "ISSUED";
  /** User id recorded on the issue row. */
  issuedBy?: string | null;
  appOrigin?: string;
}

export interface RenderedDocument {
  bytes: Uint8Array;
  kind: DocumentKind;
  reference: string;
  revision: string;
  status: "DRAFT" | "ISSUED";
  objectKey: string | null;
  filename: string;
  model: ProposalModel;
}

/** Load the order, build the model, render, and (when ISSUED) store and record the issue. */
export async function renderProposal(env: Env, opts: RenderDocumentOptions): Promise<RenderedDocument | null> {
  const bundle = await loadOrderBundle(env, opts.orderId, { surveyId: opts.surveyId, appOrigin: opts.appOrigin });
  if (!bundle) return null;
  const model = buildProposalModel(bundle);
  return renderFromModel(env, "PR", model, opts, (m, meta) => renderProposalModel(m, meta));
}

/** Shared issue flow for any order-backed document kind. */
export async function renderFromModel(
  env: Env,
  kind: DocumentKind,
  model: ProposalModel,
  opts: RenderDocumentOptions,
  render: (model: ProposalModel, meta: RenderMeta) => Promise<Uint8Array>,
): Promise<RenderedDocument> {
  const issuedOn = new Date();
  const subject = { orderId: opts.orderId, surveyId: model.surveyId };
  const { reference, revision } =
    opts.status === "ISSUED"
      ? await reserveDocumentRef(env, kind, subject, issuedOn).then((r) => ({ reference: r.ref, revision: r.revision }))
      : { reference: DRAFT_REFERENCE, revision: "A" };
  const bytes = await render(model, { status: opts.status, reference, revision, issuedOn });
  let objectKey: string | null = null;
  if (opts.status === "ISSUED") {
    ({ objectKey } = await recordDocumentIssue(env, {
      kind,
      bytes,
      ref: reference,
      revision,
      orderId: opts.orderId,
      surveyId: model.surveyId,
      projectId: model.projectId,
      issuedBy: opts.issuedBy ?? null,
      at: issuedOn,
    }));
  }
  return { bytes, kind, reference, revision, status: opts.status, objectKey, filename: documentFilename(kind, reference, revision), model };
}
