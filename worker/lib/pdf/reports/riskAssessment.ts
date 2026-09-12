// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/reports/riskAssessment.ts
//
// Impact Protection Risk Assessment (ASU-RA-<yymm>-<seq>), A4 portrait. The
// chargeable survey report: an HSE-consultancy document that happens to be
// written by the manufacturer of the solution.
//
// Page order (Task PD2):
//   cover · document control (+ about) · contents · 1 executive summary
//   (KPI tiles, 5×5 matrix, "since last visit" strip) · 2 scope and
//   methodology (standards, hierarchy of controls) · 3 site context (vehicle
//   fleet) · 4 risk register · 5… one section per zone in rank order ·
//   prioritised action plan · indicative investment · limitations and
//   assumptions · appendices A–D
//
// Three layers, as in proposal.ts:
//   buildRiskAssessmentModel(bundle, register)   pure
//   renderRiskAssessmentModel(model, meta)       model → PDF bytes
//   renderRiskAssessment(env, surveyId, opts)    loads, reserves a reference
//                                                when ISSUED, renders, stores,
//                                                records the issue
//
// Contents page: a page is reserved after document control; section starts
// are collected while rendering and drawn onto it last, so the page numbers
// are real. Every text primitive may break a page, so the writer re-reads
// `doc.current` after each call (a stale Page reference forces blank pages).
// ────────────────────────────────────────────────────────────────────────────

import { eq } from "drizzle-orm";
import type { Env } from "../../../types";
import { getDb } from "../../../db";
import { createStorage } from "../../../storage";
import { surveyPhotos as surveyPhotosTable, type SiteSurveyArea, type SurveyPhoto } from "../../../../shared/schema";
import {
  RISK_LEVEL_BANDS,
  LIKELIHOOD_DESCRIPTORS,
  SEVERITY_DESCRIPTORS,
  type RiskLevel,
  type RiskLevelBand,
} from "../../../../shared/risk/riskRegister";
import {
  PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT,
  PAS13_INDICATIVE_FOOTNOTE,
  PAS13_SINE_TABLE,
  PAS13_VERSION,
  classifyVehicle,
  getActiveVehicleClassTable,
  requiredAbsorbedJoules,
  type Pas13Verdict,
  type Verdict,
} from "../../../../shared/pas13Rules";
import type { ComparisonSummary, ZoneComparison } from "../../../../shared/survey";
import { computeTotals, type PricingLine } from "../../../../shared/pricing";
import { DOCUMENT_KINDS, DRAFT_REFERENCE, documentFilename, type DocumentKind } from "../../../../shared/documents/refs";
import {
  toRegisterArea,
  sortForRegister,
  groupPhotosByArea,
  buildRiskMatrix,
  summariseRegister,
  buildCompareResponse,
  type RegisterArea,
  type RegisterSummary,
  type AreaProductRecommendation,
  type CompareResponse,
} from "../../../routes/siteSurveys";
import { ensurePas13ClassesLoaded } from "../../../services/pas13Classes";
import { createDoc, addPage, ensureSpace, finalize, mm, contentWidth, type Doc, type Page } from "../doc";
import { heading, body, small, bullets, drawText, measure, wrap } from "../text";
import {
  coverPage,
  documentControl,
  kpiTiles,
  riskMatrix,
  table,
  chip,
  chipRow,
  photo,
  productCard,
  calloutBox,
  hierarchyOfControls,
  type TableCellValue,
} from "../blocks";
import { embedImage } from "../images";
import { C, TYPE, RISK_LABELS, TIMESCALES, type Timescale, type Tone } from "../theme";
import { verdictLabel, verdictTone } from "./pas13Statement";
import { drawScopeOfSupply, type ProposalModel, type ProposalLine, type RenderMeta } from "./proposal";
import {
  loadSurveyBundle,
  reserveDocumentRef,
  recordDocumentIssue,
  unknownProduct,
  longDate,
  shortDate,
  money,
  metres,
  joules,
  type SurveyBundle,
  type PersonInfo,
  type ProductInfo,
} from "./shared";

// ─── Register payload (the GET /api/site-surveys/:id/register shape) ───────

export interface RegisterPayload {
  surveyId: string;
  areas: RegisterArea[];
  /** matrix[likelihood - 1][severity - 1] */
  matrix: number[][];
  summary: RegisterSummary & { photos?: number; highestPriorityAreaId?: string | null; highestPriorityZone?: string | null };
  bands?: readonly RiskLevelBand[];
}

export interface RiskAssessmentExtras {
  /** Return-visit comparison when the survey has a previous visit with a snapshot. */
  comparison?: CompareResponse | null;
}

// ─── Model ─────────────────────────────────────────────────────────────────

export interface RaPhoto {
  id: string;
  /** "Fig 5.1" */
  figure: string;
  caption: string;
  tags: string[];
  bytes: Uint8Array | null;
  zoneName: string;
}

export interface RaVehicle {
  classCode: string | null;
  classLabel: string | null;
  massKg: number | null;
  loadKg: number;
  speedKmh: number | null;
  angleDeg: number;
  /** Impact energy at the recorded angle, J. Null without mass and speed. */
  energyJ: number | null;
}

export interface RaPas13 {
  verdict: Verdict | null;
  energyJ: number | null;
  requiredWithMarginJ: number | null;
  productName: string | null;
  productRatedJ: number | null;
  marginPct: number | null;
}

export interface RaProduct {
  info: ProductInfo;
  recommendation: AreaProductRecommendation;
  /** AED per metre for length-priced products, else null. */
  pricePerMetreAed: number | null;
  /** Headline unit price for per-unit products, else null. */
  unitPriceAed: number | null;
}

export interface RaZone {
  id: string;
  rank: number;
  /** Section number in the report (5 + index). */
  section: number;
  zoneName: string;
  areaName: string;
  areaTypeLabel: string;
  condition: string;
  trafficDensity: string | null;
  pedestrianExposure: string | null;
  existingProtection: string | null;
  level: RiskLevel | null;
  likelihood: number | null;
  severity: number | null;
  score: number | null;
  timescale: Timescale | null;
  band: RiskLevelBand | null;
  observation: string;
  rationale: string[];
  hazardTags: string[];
  vehicle: RaVehicle;
  pas13: RaPas13;
  product: RaProduct | null;
  recommendation: string;
  lengthM: number | null;
  /** Indicative cost, ex-VAT; null when nothing is priced. */
  indicativeAed: number | null;
  /** "24 m" / "1 no." / "" */
  quantityLine: string;
  perMetre: boolean;
  photos: RaPhoto[];
}

export interface RaFleetRow {
  classCode: string | null;
  classLabel: string | null;
  massKg: number;
  loadKg: number;
  speedKmh: number;
  /** Head-on (90°) energy, J. */
  energyJ: number;
  zones: string[];
}

export interface RaComparison {
  previousTitle: string;
  previousCompletedAt: string;
  summary: ComparisonSummary;
  rows: ZoneComparison[];
}

export interface RiskAssessmentModel {
  surveyId: string;
  title: string;
  client: string;
  site: string;
  surveyDate: Date | null;
  surveyStatus: string;
  description: string | null;
  requestedBy: { name: string; position: string | null; email: string | null; mobile: string | null } | null;
  preparedBy: PersonInfo;
  zones: RaZone[];
  matrix: number[][];
  summary: { total: number; assessed: number; byLevel: Record<RiskLevel, number>; overall: RiskLevel | null; photos: number };
  fleet: RaFleetRow[];
  investment: { totalAed: number; pricedZones: number };
  topActions: string[];
  heroImage: Uint8Array | null;
  /** Every photo in figure order (zone photos first), for Appendix C. */
  photoIndex: RaPhoto[];
  /** Unique recommended products, first-use order, for Appendix D. */
  products: ProductInfo[];
  comparison: RaComparison | null;
  /** True when the register has no areas: renders the shorter "survey in progress" document. */
  inProgress: boolean;
}

const FIRST_ZONE_SECTION = 5;

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function bandFor(level: RiskLevel | null): RiskLevelBand | null {
  return level ? (RISK_LEVEL_BANDS.find((b) => b.level === level) ?? null) : null;
}

function classLabelFor(code: string | null): string | null {
  if (!code) return null;
  return getActiveVehicleClassTable().find((r) => r.classCode === code)?.label ?? null;
}

function vehicleFor(a: RegisterArea): RaVehicle {
  const massKg = num(a.vehicleWeight);
  const speedKmh = num(a.vehicleSpeed);
  const loadKg = Math.max(0, num(a.loadMass) ?? 0);
  const rawAngle = num(a.impactAngle);
  const angleDeg = rawAngle && rawAngle > 0 ? Math.min(90, Math.max(5, rawAngle)) : 90;
  const usable = massKg !== null && massKg > 0 && speedKmh !== null && speedKmh > 0;
  const classCode = usable ? classifyVehicle({ totalMassKg: massKg + loadKg, speedKmh }).classCode : null;
  const energyJ =
    num(a.calculatedJoules) ?? (usable ? requiredAbsorbedJoules({ vehicleMassKg: massKg, loadMassKg: loadKg, speedKmh, approachAngleDeg: angleDeg }) : null);
  return { classCode, classLabel: classLabelFor(classCode), massKg, loadKg, speedKmh, angleDeg, energyJ };
}

function pas13For(a: RegisterArea, vehicle: RaVehicle, product: RaProduct | null): RaPas13 {
  const v = a.pas13Verdict as Pas13Verdict | null;
  const rec = product?.recommendation ?? null;
  const energyJ = vehicle.energyJ;
  const productRatedJ = num(v?.details?.productRatedJoulesAt45deg) || product?.info.testedEnergyJ || num(rec?.impactRating) || null;
  const marginPct = num(v?.details?.safetyMarginPct) ?? num(rec?.safetyMarginPct);
  const verdict: Verdict | null = v?.verdict ?? rec?.pas13Verdict ?? null;
  return {
    verdict,
    energyJ,
    requiredWithMarginJ: energyJ !== null ? energyJ * (1 + PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT / 100) : null,
    productName: rec?.productName ?? null,
    productRatedJ: productRatedJ && productRatedJ > 0 ? productRatedJ : null,
    marginPct,
  };
}

function productFor(a: RegisterArea, bundle: SurveyBundle): RaProduct | null {
  const rec = a.topProduct;
  if (!rec?.productName) return null;
  const base = bundle.products.get(rec.productName) ?? unknownProduct(rec.productName, rec.category);
  const info: ProductInfo = {
    ...base,
    testedEnergyJ: base.testedEnergyJ || num(rec.impactRating) || 0,
    keySpecs: base.keySpecs.length ? base.keySpecs : num(rec.impactRating) ? [`Tested to ${PAS13_VERSION} at ${joules(num(rec.impactRating) as number)}`] : [],
  };
  const perMetre = rec.pricingType === "per-meter" && num(rec.pricePerMetreAed) !== null && (num(rec.pricePerMetreAed) as number) > 0;
  return {
    info,
    recommendation: rec,
    pricePerMetreAed: perMetre ? num(rec.pricePerMetreAed) : null,
    unitPriceAed: !perMetre ? num(rec.price) : null,
  };
}

function zoneCost(a: RegisterArea, product: RaProduct | null, lengthM: number | null): { aed: number | null; perMetre: boolean; quantityLine: string } {
  const stored = num(a.estimatedCost);
  const runLine = lengthM && lengthM > 0 ? metres(lengthM) : "";
  if (stored !== null && stored > 0) return { aed: stored, perMetre: false, quantityLine: runLine || (product ? "1 no." : "") };
  if (!product) return { aed: null, perMetre: false, quantityLine: runLine };
  if (product.pricePerMetreAed !== null) {
    if (lengthM && lengthM > 0) return { aed: Math.round(product.pricePerMetreAed * lengthM * 100) / 100, perMetre: true, quantityLine: metres(lengthM) };
    return { aed: null, perMetre: true, quantityLine: "Length TBC" };
  }
  if (product.unitPriceAed !== null && product.unitPriceAed > 0) return { aed: product.unitPriceAed, perMetre: false, quantityLine: runLine || "1 no." };
  return { aed: null, perMetre: false, quantityLine: runLine };
}

function captionFor(zoneName: string, areaName: string, dateText: string): string {
  const a = areaName.trim();
  const z = zoneName.trim();
  const where = !a || a.toLowerCase() === z.toLowerCase() ? z : a.toLowerCase().startsWith(z.toLowerCase()) ? a : `${z}, ${a}`;
  return dateText ? `${where}, ${dateText}` : where;
}

/** Pure: SurveyBundle + register payload → RiskAssessmentModel. */
export function buildRiskAssessmentModel(bundle: SurveyBundle, register: RegisterPayload, extras: RiskAssessmentExtras = {}): RiskAssessmentModel {
  const survey = bundle.survey;
  const photosById = new Map(bundle.photos.map((p) => [p.id, p]));
  const usedPhotoIds = new Set<string>();
  const products: ProductInfo[] = [];
  const seenProducts = new Set<string>();
  const surveyDate = survey.surveyDate ? new Date(survey.surveyDate) : null;

  const ordered = [...register.areas].sort((a, b) => (a.priorityRank ?? Number.MAX_SAFE_INTEGER) - (b.priorityRank ?? Number.MAX_SAFE_INTEGER));

  const zones: RaZone[] = ordered.map((a, index) => {
    const rank = a.priorityRank ?? index + 1;
    const section = FIRST_ZONE_SECTION + index;
    const level = a.riskLevel ?? null;
    const band = bandFor(level);
    const likelihood = num(a.likelihood);
    const severity = num(a.severity);
    const score = num(a.riskScore) ?? (likelihood !== null && severity !== null ? likelihood * severity : null);
    const vehicle = vehicleFor(a);
    const product = productFor(a, bundle);
    if (product && !seenProducts.has(product.info.name)) {
      seenProducts.add(product.info.name);
      products.push(product.info);
    }
    const lengthM = num(a.recommendedLengthM);
    const cost = zoneCost(a, product, lengthM);

    // Photos: register rows joined to the bundle for bytes and tags, plus any
    // bundle photo linked to this area the register did not list.
    const ids: string[] = [];
    for (const p of a.photos) if (!ids.includes(p.id)) ids.push(p.id);
    for (const p of bundle.photos) if (p.areaId === a.id && !ids.includes(p.id)) ids.push(p.id);
    const photos: RaPhoto[] = ids.map((id, i) => {
      usedPhotoIds.add(id);
      const info = photosById.get(id);
      const taken = info?.takenAt ?? a.photos.find((p) => p.id === id)?.takenAt ?? surveyDate;
      return {
        id,
        figure: `Fig ${section}.${i + 1}`,
        caption: captionFor(a.zoneName, a.areaName, taken ? shortDate(taken) : ""),
        tags: info?.tags ?? [],
        bytes: info?.bytes ?? null,
        zoneName: a.zoneName,
      };
    });
    // Photos with bytes lead so the hero is always a real image when one exists.
    photos.sort((x, y) => Number(!!y.bytes) - Number(!!x.bytes));
    photos.forEach((p, i) => (p.figure = `Fig ${section}.${i + 1}`));
    const hazardTags = Array.from(new Set(photos.flatMap((p) => p.tags))).slice(0, 6);

    const rationale = a.rationale.length
      ? a.rationale
      : likelihood !== null && severity !== null
        ? [
            `Likelihood rated ${likelihood} (${LIKELIHOOD_DESCRIPTORS[likelihood - 1]}).`,
            `Severity rated ${severity} (${SEVERITY_DESCRIPTORS[severity - 1]}).`,
            `A score of ${score} places the zone at ${level ?? "an unassessed"} level.`,
          ]
        : ["The zone has not been scored. Likelihood and severity are to be assessed on the next visit."];

    const recommendation =
      (a.recommendedAction ?? "").trim() ||
      (product ? `Install ${product.info.name}${lengthM && lengthM > 0 ? ` over ${metres(lengthM)}` : ""}.` : "Protection to be confirmed by the A-SAFE estimation team.");

    return {
      id: a.id,
      rank,
      section,
      zoneName: a.zoneName,
      areaName: a.areaName,
      areaTypeLabel: a.areaTypeLabel,
      condition: a.currentCondition,
      trafficDensity: a.trafficDensity,
      pedestrianExposure: a.pedestrianExposure,
      existingProtection: a.existingProtection,
      level,
      likelihood,
      severity,
      score,
      timescale: band?.actionTimescale ?? null,
      band,
      observation: (a.aiObservation ?? "").trim() || (a.issueDescription ?? "").trim() || "No observation recorded.",
      rationale,
      hazardTags,
      vehicle,
      pas13: pas13For(a, vehicle, product),
      product,
      recommendation,
      lengthM,
      indicativeAed: cost.aed,
      quantityLine: cost.quantityLine,
      perMetre: cost.perMetre,
      photos,
    };
  });

  // Fleet: one row per distinct (mass, load, speed).
  const fleetMap = new Map<string, RaFleetRow>();
  for (const z of zones) {
    const v = z.vehicle;
    if (v.massKg === null || v.speedKmh === null || v.massKg <= 0 || v.speedKmh <= 0) continue;
    const key = `${v.massKg}:${v.loadKg}:${v.speedKmh}`;
    const row = fleetMap.get(key) ?? {
      classCode: v.classCode,
      classLabel: v.classLabel,
      massKg: v.massKg,
      loadKg: v.loadKg,
      speedKmh: v.speedKmh,
      energyJ: requiredAbsorbedJoules({ vehicleMassKg: v.massKg, loadMassKg: v.loadKg, speedKmh: v.speedKmh, approachAngleDeg: 90 }),
      zones: [],
    };
    if (!row.zones.includes(z.zoneName)) row.zones.push(z.zoneName);
    fleetMap.set(key, row);
  }
  const fleet = Array.from(fleetMap.values()).sort((a, b) => b.massKg + b.loadKg - (a.massKg + a.loadKg));

  const priced = zones.filter((z) => z.indicativeAed !== null);
  const investment = { totalAed: Math.round(priced.reduce((s, z) => s + (z.indicativeAed as number), 0) * 100) / 100, pricedZones: priced.length };

  const matrix =
    Array.isArray(register.matrix) && register.matrix.length === 5 && register.matrix.every((r) => Array.isArray(r) && r.length === 5)
      ? register.matrix.map((r) => r.map((n) => Number(n) || 0))
      : buildRiskMatrix(register.areas);
  const s = register.summary;
  const byLevel: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const l of Object.keys(byLevel) as RiskLevel[]) byLevel[l] = Number(s?.byLevel?.[l] ?? 0) || 0;
  const overall = (s?.overallRiskLevel ?? null) as RiskLevel | null;

  const heroImage = zones.find((z) => z.photos[0]?.bytes)?.photos[0]?.bytes ?? bundle.photos.find((p) => p.bytes)?.bytes ?? null;

  const photoIndex: RaPhoto[] = zones.flatMap((z) => z.photos);
  bundle.photos
    .filter((p) => !usedPhotoIds.has(p.id))
    .forEach((p, i) => {
      photoIndex.push({
        id: p.id,
        figure: `Site ${i + 1}`,
        caption: captionFor(p.zoneName ?? "Site", "", p.takenAt ?? surveyDate ? shortDate(p.takenAt ?? surveyDate) : ""),
        tags: p.tags,
        bytes: p.bytes,
        zoneName: p.zoneName ?? "Site",
      });
    });

  const topActions = zones.slice(0, 3).map((z) => `${z.zoneName}: ${z.recommendation.replace(/\s*Action timescale:.*$/i, "")}${z.timescale ? ` (${z.timescale})` : ""}`);

  const cmp = extras.comparison ?? null;
  const comparison: RaComparison | null = cmp
    ? { previousTitle: cmp.previous.title, previousCompletedAt: cmp.previous.completedAt, summary: cmp.summary, rows: cmp.rows }
    : null;

  return {
    surveyId: survey.id,
    title: survey.title,
    client: survey.facilityName,
    site: survey.facilityLocation || survey.facilityName,
    surveyDate,
    surveyStatus: survey.status,
    description: (survey.description ?? "").trim() || null,
    requestedBy: survey.requestedByName
      ? { name: survey.requestedByName, position: survey.requestedByPosition ?? null, email: survey.requestedByEmail ?? null, mobile: survey.requestedByMobile ?? null }
      : null,
    preparedBy: bundle.owner,
    zones,
    matrix,
    summary: { total: Number(s?.total ?? zones.length) || zones.length, assessed: Number(s?.assessed ?? 0) || 0, byLevel, overall, photos: Number(s?.photos ?? bundle.photos.length) || bundle.photos.length },
    fleet,
    investment,
    topActions,
    heroImage,
    photoIndex,
    products,
    comparison,
    inProgress: zones.length === 0,
  };
}

// ─── Writer: cursor-safe wrappers over the text primitives ─────────────────

interface TocEntry {
  level: 1 | 2;
  label: string;
  page: number;
}

class Writer {
  page: Page;
  readonly toc: TocEntry[] = [];
  constructor(readonly doc: Doc) {
    this.page = doc.current ?? addPage(doc);
  }
  /** Re-read the page the cursor is on after any primitive that may break pages. */
  sync(): Page {
    this.page = this.doc.current ?? this.page;
    return this.page;
  }
  newPage(): Page {
    this.page = addPage(this.doc);
    return this.page;
  }
  /** New page + H1 + contents entry. */
  section(label: string): void {
    this.newPage();
    heading(this.page, 1, label);
    this.sync();
    this.toc.push({ level: 1, label, page: this.page.number });
  }
  h2(label: string, opts: { toc?: boolean } = {}): void {
    heading(this.page, 2, label);
    this.sync();
    if (opts.toc !== false) this.toc.push({ level: 2, label, page: this.page.number });
  }
  h3(label: string): void {
    heading(this.page, 3, label);
    this.sync();
  }
  body(text: string, opts?: Parameters<typeof body>[2]): void {
    body(this.page, text, opts);
    this.sync();
  }
  small(text: string): void {
    small(this.page, text);
    this.sync();
  }
  bullets(items: string[]): void {
    bullets(this.page, items);
    this.sync();
  }
}

// ─── Rendering ─────────────────────────────────────────────────────────────

function fmtAed(aed: number): string {
  return money(aed).replace("AED ", "");
}

function pct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${Math.round(n)} %`;
}

function timescaleHeading(t: Timescale): string {
  return t === "Immediate" ? "Immediate" : t === "Planned" ? "Planned programme" : `Within ${t}`;
}

function levelCell(level: RiskLevel | null): TableCellValue {
  return level ? { text: RISK_LABELS[level], chip: level } : "—";
}

function titleCaseWord(s: string | null): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
}

/** Standards and guidance block: the same wording in every report. */
export const STANDARDS_REFERENCED: readonly string[] = [
  "PAS 13:2017 Code of practice for safety barriers used in traffic management within workplace environments (BSI).",
  "HSE HSG136 A guide to workplace transport safety.",
  "HSE HSG76 Warehousing and storage: a guide to health and safety.",
  "ISO 45001:2018 clause 6.1 (hazard identification and risk assessment).",
  "The client's statutory duties arise under UAE federal labour law and applicable emirate OSH frameworks (Abu Dhabi OSHAD-SF where relevant).",
];

export const LIMITATIONS: readonly string[] = [
  "Visual survey only. No destructive testing, load testing or measurement of floor construction was carried out.",
  "Floor construction is assumed to be a reinforced concrete slab of at least 150 mm unless verified; fixings are specified on that basis.",
  "Vehicle masses, loads and speeds are as supplied by the client or observed during the walk-through and have not been independently verified.",
  "Energy calculations are indicative until confirmed by the A-SAFE estimation team against the approved layout drawing.",
  "Product selection is indicative; PAS 13 alignment verdicts are engineering interpretations, not certificates of compliance.",
  "Indicative investment figures are budgetary, ex-VAT, exclude civil works and making good, and are valid for 30 days from the issue date.",
  "Drawings and photographs are not to scale unless stated.",
  "The assessment reflects site conditions on the survey date. Changes to layout, vehicles or operations require reassessment.",
];

async function drawCoverFor(doc: Doc, model: RiskAssessmentModel, meta: RenderMeta): Promise<void> {
  const ref = meta.status === "ISSUED" ? `${meta.reference}  ·  Rev ${meta.revision}` : DRAFT_REFERENCE;
  await coverPage(doc, {
    heroImage: model.heroImage ?? undefined,
    docTypeLine: DOCUMENT_KINDS.RA,
    title: model.title,
    subtitle: model.inProgress
      ? `Survey in progress — workplace transport impact risk assessment for ${model.client}`
      : `Workplace transport impact risk assessment of ${model.zones.length} ${model.zones.length === 1 ? "zone" : "zones"} at ${model.site}`,
    client: model.client,
    site: model.site,
    date: longDate(meta.issuedOn),
    preparedBy: `${model.preparedBy.name}${model.preparedBy.title ? `, ${model.preparedBy.title}` : ""}, A-SAFE UAE`,
    reference: ref,
    status: meta.status,
  });
}

function drawDocumentControl(w: Writer, model: RiskAssessmentModel, meta: RenderMeta): void {
  w.newPage();
  heading(w.page, 1, "Document control");
  w.sync();
  w.toc.push({ level: 1, label: "Document control", page: w.page.number });
  const distribution = [
    model.requestedBy ? `${model.requestedBy.name}${model.requestedBy.position ? `, ${model.requestedBy.position}` : ""}, ${model.client}` : `${model.client} — HSE and operations management`,
    "A-SAFE UAE project file",
  ].join("; ");
  ({ page: w.page } = documentControl(w.doc, w.page, [
    { key: "Reference", value: meta.status === "ISSUED" ? meta.reference : "DRAFT — not for issue" },
    { key: "Revision", value: meta.status === "ISSUED" ? meta.revision : "—" },
    { key: "Status", value: meta.status },
    { key: "Issue date", value: longDate(meta.issuedOn) },
    { key: "Document type", value: DOCUMENT_KINDS.RA },
    { key: "Client", value: model.client },
    { key: "Site", value: model.site },
    { key: "Survey date", value: model.surveyDate ? longDate(model.surveyDate) : "—" },
    { key: "Prepared by", value: `${model.preparedBy.name}${model.preparedBy.title ? `, ${model.preparedBy.title}` : ""}, A-SAFE UAE` },
    { key: "Reviewed by", value: "" },
    { key: "Distribution", value: distribution },
  ]));

  w.h2("About this report", { toc: false });
  w.body(
    `This report records the workplace transport impact risks identified during A-SAFE's survey of ${model.client} at ${model.site}${model.surveyDate ? ` on ${longDate(model.surveyDate)}` : ""}. Each zone is scored on a 5 × 5 likelihood × severity matrix, the impact energy of the vehicles that use it is calculated by the ${PAS13_VERSION} method, and a protection measure is recommended with an action timescale. The register, action plan and indicative investment are intended for the client's HSE file and capital planning.`,
  );
  w.body(
    "Findings are stated in plain terms. Where a zone is described as unprotected, no impact-rated barrier was present on the survey date. Recommendations are engineering controls and complement, not replace, the site's traffic-management and behavioural controls.",
  );
  if (model.inProgress) {
    ({ page: w.page } = calloutBox(w.doc, w.page, {
      tone: "yellow",
      title: "Survey in progress",
      body: "No zones have been assessed on this survey yet. This document carries the survey scope, method and standards so the client can see what the assessment will cover; the risk register, zone findings, action plan and indicative investment are added once the walk-through is complete.",
    }));
  }
}

function drawContents(doc: Doc, page: Page, toc: TocEntry[]): void {
  heading(page, 1, "Contents");
  const { regular, bold } = doc.fonts;
  const size = TYPE.body.size;
  const lead = TYPE.body.lead;
  const cw = contentWidth(page);
  let entries = toc;
  const heightOf = (list: TocEntry[]) => list.reduce((h, e) => h + lead + (e.level === 1 ? mm(1) : 0), 0);
  if (heightOf(entries) > page.cursorY - page.margin.b) entries = toc.filter((e) => e.level === 1);
  let y = page.cursorY;
  for (const e of entries) {
    if (y - lead < page.margin.b) break;
    const font = e.level === 1 ? bold : regular;
    const indent = e.level === 1 ? 0 : mm(8);
    const numText = String(e.page);
    const numW = measure(font, size, numText);
    const labelMaxW = cw - indent - numW - mm(10);
    const labelText = wrap(font, size, e.label, labelMaxW)[0] ?? "";
    const labelW = measure(font, size, labelText);
    drawText(page, labelText, { x: page.margin.l + indent, y, size, font, lineHeight: lead });
    drawText(page, numText, { x: page.margin.l, y, size, font, maxWidth: cw, align: "right", lineHeight: lead });
    const ruleY = y - lead * 0.72;
    page.page.drawLine({
      start: { x: page.margin.l + indent + labelW + mm(2), y: ruleY },
      end: { x: page.margin.l + cw - numW - mm(2), y: ruleY },
      thickness: 0.4,
      color: C.grey20,
      dashArray: [1, 2],
    });
    y -= lead + (e.level === 1 ? mm(1) : 0);
  }
  page.cursorY = y;
}

function drawExecutiveSummary(w: Writer, model: RiskAssessmentModel): void {
  w.section("1  Executive summary");
  const n = model.zones.length;
  const by = model.summary.byLevel;
  if (model.inProgress) {
    w.body(`A-SAFE is carrying out a workplace transport impact risk assessment for ${model.client} at ${model.site}. No zones have been recorded on the register yet, so this document states the scope, method and standards only.`);
    ({ page: w.page } = kpiTiles(w.doc, w.page, [
      { label: "Zones assessed", value: "0", sublabel: "Survey in progress" },
      { label: "Critical + high", value: "0", tone: "neutral" },
      { label: "Indicative investment", value: "TBC", sublabel: "Ex-VAT, budgetary" },
      { label: "Photos on file", value: String(model.summary.photos) },
    ]));
    return;
  }
  const zoneList = model.zones.map((z) => z.zoneName).join(", ");
  w.body(
    `A-SAFE surveyed ${n} ${n === 1 ? "zone" : "zones"} at ${model.client}, ${model.site}${model.surveyDate ? ` on ${longDate(model.surveyDate)}` : ""}: ${zoneList}. The survey recorded the vehicles using each zone, the pedestrian exposure, the existing protection and its condition, with photographic evidence for every finding.`,
  );
  const top = model.zones[0];
  w.body(
    `Of the ${n} ${n === 1 ? "zone" : "zones"} assessed, ${by.critical} ${by.critical === 1 ? "is" : "are"} critical, ${by.high} high, ${by.medium} medium and ${by.low} low. The overall site risk level is ${model.summary.overall ? RISK_LABELS[model.summary.overall].toLowerCase() : "not yet rated"}. The highest-priority zone is ${top.zoneName}${top.score !== null ? ` (score ${top.score}, ${top.level ? RISK_LABELS[top.level].toLowerCase() : "unrated"})` : ""}.`,
  );
  w.body("The three actions that reduce the most risk are:", { after: mm(1) });
  w.bullets(model.topActions);

  const critHigh = by.critical + by.high;
  ({ page: w.page } = kpiTiles(w.doc, w.page, [
    { label: "Zones assessed", value: String(n), sublabel: `${model.summary.assessed} scored on the 5 × 5 matrix` },
    { label: "Critical + high", value: String(critHigh), sublabel: critHigh ? "Action within 30 days" : "No urgent zones", tone: by.critical ? "critical" : by.high ? "high" : "low" },
    {
      label: "Indicative investment",
      value: model.investment.pricedZones ? money(model.investment.totalAed) : "TBC",
      sublabel: model.investment.pricedZones ? `Ex-VAT, budgetary, ${model.investment.pricedZones} of ${n} zones priced` : "Pricing to be confirmed",
    },
    { label: "Photos on file", value: String(model.summary.photos), sublabel: "See Appendix C" },
  ]));

  w.page = ensureSpace(w.doc, w.page, mm(105));
  w.h2("Risk profile", { toc: false });
  w.small("Number of zones at each likelihood × severity pair. Outlined cells hold the zones on this register.");
  const highlight = model.zones
    .filter((z) => z.likelihood !== null && z.severity !== null)
    .map((z) => [z.likelihood as number, z.severity as number] as [number, number]);
  ({ page: w.page } = riskMatrix(w.doc, w.page, model.matrix, { highlight }));

  if (model.comparison) drawSinceLastVisit(w, model.comparison);
}

function drawSinceLastVisit(w: Writer, cmp: RaComparison): void {
  w.page = ensureSpace(w.doc, w.page, mm(70));
  w.h2("Since last visit", { toc: false });
  w.small(`Compared with ${cmp.previousTitle}, completed ${shortDate(cmp.previousCompletedAt)}. Improved: score fell by 2 or more, or the level dropped a band. Worse: score or level rose.`);
  const s = cmp.summary;
  ({ page: w.page } = kpiTiles(w.doc, w.page, [
    { label: "Improved", value: String(s.improved), tone: "low" },
    { label: "Unchanged", value: String(s.same), tone: "neutral" },
    { label: "Worse", value: String(s.worse), tone: s.worse ? "critical" : "neutral" },
    { label: "New / removed", value: `${s.new} / ${s.removed}`, sublabel: `Net score change ${s.netScoreChange >= 0 ? "+" : ""}${s.netScoreChange}` },
  ]));
  const deltaTone = (d: ZoneComparison["delta"]): Tone => (d === "improved" ? "low" : d === "worse" ? "critical" : d === "new" ? "yellow" : "grey");
  ({ page: w.page } = table(w.doc, w.page, {
    headerStyle: "yellow",
    zebra: true,
    columns: [
      { key: "zone", label: "Zone", width: mm(40) },
      { key: "before", label: "Before", width: mm(22), align: "right" },
      { key: "after", label: "After", width: mm(22), align: "right" },
      { key: "delta", label: "Change", width: mm(24) },
      { key: "note", label: "Note", width: mm(66) },
    ],
    rows: cmp.rows.slice(0, 10).map((r) => ({
      zone: { text: r.zone, bold: true },
      before: r.before ? `${r.before.score} ${RISK_LABELS[r.before.riskLevel]}` : "—",
      after: r.after ? `${r.after.score} ${RISK_LABELS[r.after.riskLevel]}` : "—",
      delta: { text: r.delta, chip: deltaTone(r.delta) },
      note: r.notes[0] ?? "",
    })),
  }));
}

function drawScopeAndMethodology(w: Writer, model: RiskAssessmentModel): void {
  w.section("2  Scope and methodology");
  w.h2("What was done");
  const zoneNames = model.zones.map((z) => z.zoneName);
  w.bullets([
    `Walk-through observational survey of ${model.client}, ${model.site}${model.surveyDate ? `, carried out on ${longDate(model.surveyDate)}` : ""} by ${model.preparedBy.name}, A-SAFE UAE.`,
    zoneNames.length ? `Areas covered: ${zoneNames.join("; ")}.` : "Areas covered: to be recorded as the walk-through proceeds.",
    "Areas excluded: any area not listed above was not assessed. External roads, car parks and areas closed on the survey date are outside the scope unless named.",
    "Each zone was photographed, the vehicles using it identified, and the existing protection and its condition recorded.",
  ]);
  w.h2("Assessment method");
  w.bullets([
    `Impact energy for each zone is calculated by the ${PAS13_VERSION} impact-energy method, KE = ½ × m × (v × sin A)², from the total mass of the vehicle and its load, its speed and the approach angle to the barrier (Appendix B).`,
    "Risk is scored on a 5 × 5 likelihood × severity matrix. Likelihood follows traffic density, vehicle class and the state of existing protection; severity follows pedestrian exposure, hazard severity and asset criticality. The rules applied to each zone are printed as bullets under its findings.",
    `Scores are banded: ${RISK_LEVEL_BANDS.map((b) => `${b.label} ${b.range} (${b.actionTimescale.toLowerCase()})`).join("; ")}.`,
    `Recommended products are selected so their tested energy exceeds the calculated impact energy by at least ${PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT} %; below that margin the selection is marked borderline and referred to A-SAFE engineering.`,
  ]);
  w.h2("Data sources");
  w.bullets([
    `${model.summary.photos} site ${model.summary.photos === 1 ? "photograph" : "photographs"} taken during the survey, indexed in Appendix C.`,
    "Observations recorded on site by the A-SAFE representative.",
    "Vehicle types, masses, loads and speeds as supplied by the client or observed on the survey date.",
    `A-SAFE product test data (${PAS13_VERSION} pendulum test) for the recommended products.`,
  ]);
  w.h2("Standards and guidance referenced");
  w.bullets([...STANDARDS_REFERENCED]);
  w.page = ensureSpace(w.doc, w.page, mm(95));
  w.h2("Hierarchy of controls");
  ({ page: w.page } = hierarchyOfControls(w.doc, w.page));
}

function drawSiteContext(w: Writer, model: RiskAssessmentModel): void {
  w.section("3  Site context");
  w.h2("Facility");
  w.body(`${model.client}, ${model.site}.${model.requestedBy ? ` Survey requested by ${model.requestedBy.name}${model.requestedBy.position ? `, ${model.requestedBy.position}` : ""}.` : ""}`);
  w.h2("Operations");
  if (model.description) {
    w.body(model.description);
  } else if (model.zones.length) {
    const types = Array.from(new Set(model.zones.map((z) => z.areaTypeLabel.toLowerCase())));
    w.body(`Operations as observed during the walk-through: ${types.join(", ")} across ${model.zones.length} ${model.zones.length === 1 ? "zone" : "zones"}. The representative did not record a separate description of the operation.`);
  } else {
    w.body("Operations are to be described once the walk-through is complete.");
  }
  w.h2("Vehicle fleet");
  if (model.fleet.length) {
    ({ page: w.page } = table(w.doc, w.page, {
      headerStyle: "yellow",
      zebra: true,
      columns: [
        { key: "cls", label: "Class", width: mm(14) },
        { key: "desc", label: "Description", width: mm(52) },
        { key: "mass", label: "Mass", width: mm(20), align: "right" },
        { key: "load", label: "Load", width: mm(18), align: "right" },
        { key: "speed", label: "Speed", width: mm(20), align: "right" },
        { key: "energy", label: "Energy 90°", width: mm(24), align: "right" },
        { key: "zones", label: "Zones", width: mm(26) },
      ],
      rows: model.fleet.map((f) => ({
        cls: { text: f.classCode ?? "—", bold: true },
        desc: f.classLabel ?? "Vehicle as recorded",
        mass: `${Math.round(f.massKg).toLocaleString("en-GB")} kg`,
        load: f.loadKg > 0 ? `${Math.round(f.loadKg).toLocaleString("en-GB")} kg` : "—",
        speed: `${f.speedKmh.toLocaleString("en-GB", { maximumFractionDigits: 1 })} km/h`,
        energy: joules(f.energyJ),
        zones: f.zones.join(", "),
      })),
    }));
    w.small("Class per the PAS 13 vehicle classification in Appendix A. Speed is the typical operating speed recorded on site. Energy is the head-on figure; per-zone figures use the recorded approach angle.");
  } else {
    w.body("No vehicle data has been recorded against the zones on this survey. Vehicle mass and speed are required before impact energies can be calculated.");
  }
  if (model.zones.length) {
    w.h2("Traffic and pedestrian exposure");
    ({ page: w.page } = table(w.doc, w.page, {
      headerStyle: "yellow",
      zebra: true,
      columns: [
        { key: "zone", label: "Zone", width: mm(44) },
        { key: "type", label: "Area type", width: mm(34) },
        { key: "traffic", label: "Traffic", width: mm(22) },
        { key: "ped", label: "Pedestrians", width: mm(26) },
        { key: "prot", label: "Protection", width: mm(26) },
        { key: "cond", label: "Condition", width: mm(22) },
      ],
      rows: model.zones.map((z) => ({
        zone: { text: z.zoneName, bold: true },
        type: z.areaTypeLabel,
        traffic: titleCaseWord(z.trafficDensity),
        ped: titleCaseWord(z.pedestrianExposure),
        prot: titleCaseWord(z.existingProtection),
        cond: titleCaseWord(z.condition),
      })),
    }));
  }
}

function drawRiskRegister(w: Writer, model: RiskAssessmentModel): void {
  w.section("4  Risk register");
  w.small("Zones in priority order. L = likelihood, S = severity (1–5); score = L × S. Timescale follows the risk band.");
  ({ page: w.page } = table(w.doc, w.page, {
    headerStyle: "black",
    zebra: true,
    columns: [
      { key: "rank", label: "#", width: mm(8), align: "right" },
      { key: "zone", label: "Zone", width: mm(36) },
      { key: "type", label: "Area type", width: mm(24) },
      { key: "level", label: "Level", width: mm(20) },
      { key: "l", label: "L", width: mm(8), align: "right" },
      { key: "s", label: "S", width: mm(8), align: "right" },
      { key: "score", label: "Score", width: mm(12), align: "right" },
      { key: "rec", label: "Recommendation", width: mm(48) },
      { key: "when", label: "Timescale", width: mm(20) },
    ],
    rows: model.zones.map((z) => ({
      rank: z.rank,
      zone: { text: z.zoneName, bold: true },
      type: z.areaTypeLabel,
      level: levelCell(z.level),
      l: z.likelihood ?? "—",
      s: z.severity ?? "—",
      score: z.score ?? "—",
      rec: z.recommendation.replace(/\s*Action timescale:.*$/i, ""),
      when: z.timescale ?? "—",
    })),
  }));
  w.h2("Risk bands", { toc: false });
  ({ page: w.page } = table(w.doc, w.page, {
    headerStyle: "yellow",
    columns: [
      { key: "level", label: "Level", width: mm(24) },
      { key: "range", label: "Score", width: mm(18), align: "right" },
      { key: "when", label: "Timescale", width: mm(24) },
      { key: "desc", label: "Meaning", width: mm(108) },
    ],
    rows: [...RISK_LEVEL_BANDS].reverse().map((b) => ({
      level: { text: b.label, chip: b.level },
      range: b.range,
      when: b.actionTimescale,
      desc: b.description,
    })),
  }));
}

async function drawZone(w: Writer, z: RaZone): Promise<void> {
  w.section(`${z.section}  ${z.zoneName}`);
  const chips: Array<{ label: string; tone: Tone }> = [{ label: `Rank ${z.rank}`, tone: "black" }];
  if (z.level) chips.push({ label: RISK_LABELS[z.level], tone: z.level });
  if (z.score !== null) chips.push({ label: `Score ${z.score}`, tone: "grey" });
  if (z.timescale) chips.push({ label: z.timescale, tone: "yellow" });
  chips.push({ label: z.areaTypeLabel, tone: "grey" });
  ({ page: w.page } = chipRow(w.page, chips));

  // Hero photo + up to three thumbnails.
  const cw = contentWidth(w.page);
  const [hero, ...rest] = z.photos;
  if (hero) {
    ({ page: w.page } = await photo(w.doc, w.page, hero.bytes, {
      maxW: cw,
      maxH: mm(80),
      caption: `${hero.figure} — ${hero.caption}`,
      tags: z.hazardTags.length ? z.hazardTags : hero.tags,
    }));
  }
  const thumbs = rest.slice(0, 3);
  if (thumbs.length) {
    const thumbH = mm(36);
    w.page = ensureSpace(w.doc, w.page, thumbH + mm(18));
    const gutter = mm(4);
    const thumbW = (cw - gutter * 2) / 3;
    let used = 0;
    for (let i = 0; i < thumbs.length; i++) {
      const t = thumbs[i];
      const r = await photo(w.doc, w.page, t.bytes, {
        maxW: thumbW,
        maxH: thumbH,
        caption: `${t.figure} — ${t.caption}`,
        x: w.page.margin.l + i * (thumbW + gutter),
        inline: true,
      });
      used = Math.max(used, r.height);
    }
    w.page.cursorY -= used;
  }

  w.h3("Observation");
  w.body(z.observation);

  w.h3("Risk assessment");
  if (z.likelihood !== null && z.severity !== null) {
    w.body(
      `Likelihood ${z.likelihood} (${LIKELIHOOD_DESCRIPTORS[z.likelihood - 1]}) × Severity ${z.severity} (${SEVERITY_DESCRIPTORS[z.severity - 1]}) = ${z.score}${z.level ? ` — ${RISK_LABELS[z.level]}` : ""}`,
      { bold: true, after: mm(1) },
    );
  }
  w.bullets(z.rationale);

  w.page = ensureSpace(w.doc, w.page, mm(62));
  w.h3(`${PAS13_VERSION} assessment`);
  const v = z.vehicle;
  const p = z.pas13;
  if (v.energyJ !== null && v.massKg !== null && v.speedKmh !== null) {
    const lines = [
      `Vehicle class: ${v.classCode ?? "—"}${v.classLabel ? ` — ${v.classLabel}` : ""}`,
      `Impact energy: ${joules(v.energyJ)} at ${Math.round(v.angleDeg)}° (${Math.round(v.massKg + v.loadKg).toLocaleString("en-GB")} kg total mass at ${v.speedKmh.toLocaleString("en-GB", { maximumFractionDigits: 1 })} km/h)`,
      `Required rating with ${PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT} % margin: ${p.requiredWithMarginJ !== null ? joules(p.requiredWithMarginJ) : "—"}`,
      `Selected product: ${p.productName ?? "not yet selected"}${p.productRatedJ ? ` — tested to ${joules(p.productRatedJ)}` : ""}`,
      `Margin: ${pct(p.marginPct)}`,
    ];
    ({ page: w.page } = calloutBox(w.doc, w.page, { tone: "grey", title: `${PAS13_VERSION} impact-energy check`, body: lines.join("\n") }));
    if (p.verdict) {
      w.page = ensureSpace(w.doc, w.page, mm(12));
      chip(w.page, verdictLabel(p.verdict), verdictTone(p.verdict));
    }
  } else {
    ({ page: w.page } = calloutBox(w.doc, w.page, {
      tone: "grey",
      title: "Vehicle data not recorded",
      body: "No vehicle mass or speed was recorded for this zone, so the impact energy has not been calculated. Confirm the heaviest vehicle using the zone and its typical speed before a product is selected.",
    }));
  }
  w.small(PAS13_INDICATIVE_FOOTNOTE);

  w.page = ensureSpace(w.doc, w.page, z.product ? mm(80) : mm(25));
  w.h3("Recommendation");
  if (z.product) {
    const info = z.product.info;
    const priceLine = z.product.pricePerMetreAed !== null ? z.product.pricePerMetreAed : z.product.unitPriceAed ?? undefined;
    ({ page: w.page } = await productCard(w.doc, w.page, {
      image: info.imageBytes,
      name: info.name,
      family: info.family,
      testedEnergyJ: info.testedEnergyJ,
      keySpecs: info.keySpecs.length ? info.keySpecs : ["Specification on the product datasheet"],
      why: z.product.recommendation.reason || z.recommendation,
      quantityLine: z.quantityLine || undefined,
      unitPriceAed: priceLine && priceLine > 0 ? priceLine : undefined,
      lineTotalAed: z.indicativeAed ?? undefined,
    }));
  } else {
    w.body(z.recommendation);
  }

  w.h3("Action");
  w.body(
    `${z.recommendation.replace(/\s*Action timescale:.*$/i, "")}${z.timescale && z.band ? ` Action timescale: ${z.timescale}. ${z.band.description}` : " Action timescale to be set once the zone is scored."}`,
  );
}

function drawActionPlan(w: Writer, model: RiskAssessmentModel, sectionNo: number): void {
  w.section(`${sectionNo}  Prioritised action plan`);
  w.body("Actions grouped by timescale, in register order within each group. Timescales run from the issue date of this report.");
  for (const t of TIMESCALES) {
    const rows = model.zones.filter((z) => z.timescale === t);
    if (!rows.length) continue;
    w.h2(timescaleHeading(t), { toc: false });
    ({ page: w.page } = table(w.doc, w.page, {
      headerStyle: "yellow",
      zebra: true,
      columns: [
        { key: "rank", label: "#", width: mm(8), align: "right" },
        { key: "zone", label: "Zone", width: mm(40) },
        { key: "level", label: "Level", width: mm(20) },
        { key: "action", label: "Action", width: mm(66) },
        { key: "product", label: "Product", width: mm(40) },
      ],
      rows: rows.map((z) => ({
        rank: z.rank,
        zone: { text: z.zoneName, bold: true },
        level: levelCell(z.level),
        action: z.recommendation.replace(/\s*Action timescale:.*$/i, ""),
        product: z.product?.info.name ?? "TBC",
      })),
    }));
  }
  const unscored = model.zones.filter((z) => !z.timescale);
  if (unscored.length) {
    w.h2("Not yet scored", { toc: false });
    w.bullets(unscored.map((z) => `${z.zoneName}: assess likelihood and severity on the next visit.`));
  }
}

/** A minimal ProposalModel so the proposal's scope-of-supply drawer prints the investment lines and totals. */
export function investmentProposalModel(model: RiskAssessmentModel, meta: RenderMeta): ProposalModel {
  const lines: ProposalLine[] = [];
  const pricing: PricingLine[] = [];
  for (const z of model.zones) {
    if (z.indicativeAed === null) continue;
    const info = z.product?.info ?? unknownProduct("Impact protection (budget)");
    const perMetre = z.perMetre && z.lengthM !== null && z.lengthM > 0 && z.product?.pricePerMetreAed !== null;
    const unitAed = perMetre ? (z.product?.pricePerMetreAed as number) : z.indicativeAed;
    lines.push({
      id: z.id,
      productName: info.name,
      family: info.family,
      sku: info.sku,
      description: `${z.zoneName}${z.areaName && z.areaName !== z.zoneName ? ` · ${z.areaName}` : ""}`,
      testedEnergyJ: info.testedEnergyJ,
      quantity: 1,
      lengthM: perMetre ? z.lengthM : null,
      perMetre,
      unitAed,
      totalAed: z.indicativeAed,
      zone: z.zoneName,
    });
    pricing.push({
      id: z.id,
      unitPriceAed: unitAed,
      quantity: 1,
      lengthMeters: perMetre ? (z.lengthM as number) : undefined,
      pricingType: perMetre ? "per-meter" : "per-unit",
    });
  }
  const totals = computeTotals({
    lines: pricing,
    complexity: "normal",
    reciprocalDiscountPercent: 0,
    partnerDiscountPercent: 0,
    socialDiscountPercent: 0,
    servicePackageAed: 0,
    vatPercent: 0,
  });
  return {
    orderId: null,
    orderNumber: null,
    projectId: null,
    surveyId: model.surveyId,
    client: {
      company: model.client,
      contact: model.requestedBy?.name ?? null,
      contactTitle: model.requestedBy?.position ?? null,
      email: model.requestedBy?.email ?? null,
      mobile: model.requestedBy?.mobile ?? null,
      address: model.site,
    },
    project: { name: model.title, location: model.site, description: model.description },
    preparedBy: model.preparedBy,
    date: meta.issuedOn,
    currency: "AED",
    fxRate: 1,
    survey: null,
    zones: [],
    lines,
    totals: { ...totals, vatPercent: 0, source: "computed" },
    complexity: "normal",
    installationNotes: null,
    commitments: [],
    serviceCare: null,
    products: model.products,
    heroImage: null,
    drawing: null,
    approvals: [],
    isQuoteDraft: false,
  };
}

function drawInvestment(w: Writer, model: RiskAssessmentModel, meta: RenderMeta, sectionNo: number): void {
  w.section(`${sectionNo}  Indicative investment`);
  w.body("Budgetary figures per zone for the recommended protection, ex-VAT. Run lengths are as recorded on site and are confirmed on the layout drawing before order.");
  ({ page: w.page } = table(w.doc, w.page, {
    headerStyle: "black",
    zebra: true,
    columns: [
      { key: "rank", label: "#", width: mm(8), align: "right" },
      { key: "zone", label: "Zone", width: mm(44) },
      { key: "level", label: "Level", width: mm(20) },
      { key: "product", label: "Recommended protection", width: mm(52) },
      { key: "qty", label: "Length / qty", width: mm(22), align: "right" },
      { key: "aed", label: "Indicative AED", width: mm(28), align: "right" },
    ],
    rows: [
      ...model.zones.map((z) => ({
        rank: z.rank,
        zone: { text: z.zoneName, bold: true },
        level: levelCell(z.level),
        product: z.product?.info.name ?? "To be confirmed",
        qty: z.quantityLine || "—",
        aed: z.indicativeAed !== null ? fmtAed(z.indicativeAed) : "TBC",
      })),
      {
        rank: "",
        zone: { text: "Total, ex-VAT", bold: true },
        level: "",
        product: model.investment.pricedZones < model.zones.length ? `${model.zones.length - model.investment.pricedZones} zone(s) unpriced` : "",
        qty: "",
        aed: { text: model.investment.pricedZones ? fmtAed(model.investment.totalAed) : "TBC", bold: true },
      },
    ],
  }));
  if (model.investment.pricedZones) {
    const before = w.doc.outline.length;
    w.page = drawScopeOfSupply(w.doc, investmentProposalModel(model, meta), { newPage: false });
    const entry = w.doc.outline[before];
    if (entry) w.toc.push({ level: 2, label: "Scope of supply (indicative)", page: entry.page });
  } else {
    ({ page: w.page } = calloutBox(w.doc, w.page, {
      tone: "grey",
      title: "Budgetary",
      body: "No prices are recorded against the recommended products yet. The A-SAFE estimation team confirms product selection, run lengths and pricing on the approved layout drawing; figures are then ex-VAT and valid for 30 days.",
    }));
  }
}

function drawLimitations(w: Writer, sectionNo: number): void {
  w.section(`${sectionNo}  Limitations and assumptions`);
  w.bullets([...LIMITATIONS]);
}

function drawAppendixA(w: Writer, model: RiskAssessmentModel): void {
  w.section("Appendix A  PAS 13 vehicle classes");
  w.body(
    `${PAS13_VERSION} does not publish a numbered vehicle-class table; the classes below are A-SAFE's working taxonomy from total mass (vehicle plus load) and speed, aligned with BITA guidance and the PAS 13 test-speed envelope. On a boundary the heavier class applies.`,
  );
  const onSite = new Set(model.fleet.map((f) => f.classCode));
  ({ page: w.page } = table(w.doc, w.page, {
    headerStyle: "yellow",
    zebra: true,
    columns: [
      { key: "code", label: "Class", width: mm(16) },
      { key: "label", label: "Description", width: mm(86) },
      { key: "mass", label: "Total mass", width: mm(26), align: "right" },
      { key: "speed", label: "Speed", width: mm(22), align: "right" },
      { key: "site", label: "", width: mm(24) },
    ],
    rows: getActiveVehicleClassTable().map((r) => ({
      code: { text: r.classCode, bold: true },
      label: r.label,
      mass: Number.isFinite(r.totalMassMaxKg) ? `<= ${Math.round(r.totalMassMaxKg).toLocaleString("en-GB")} kg` : "Above",
      speed: Number.isFinite(r.speedMaxKmh) ? `<= ${r.speedMaxKmh} km/h` : "Above",
      site: onSite.has(r.classCode) ? { text: "On site", chip: "yellow" as Tone } : "",
    })),
  }));
}

function drawAppendixB(w: Writer, model: RiskAssessmentModel): void {
  w.section("Appendix B  Energy calculation method");
  w.body(`Impact energy is calculated per ${PAS13_VERSION} clause 6.1:`, { after: mm(1) });
  w.body("KE = ½ × m × (v × sin A)²", { bold: true });
  w.body(
    "where KE is the kinetic energy to be absorbed in joules (J), m the total mass of the vehicle and its load in kg, v the speed in metres per second (km/h ÷ 3.6) and A the approach angle between the vehicle's path and the barrier. A head-on impact is 90°; a glancing impact transfers only the sine-squared fraction of the vehicle's energy.",
  );
  w.body(`The sine values below are those tabulated in ${PAS13_VERSION} clause 6.1; intermediate angles are interpolated and never rounded below the tabled value.`);
  ({ page: w.page } = table(w.doc, w.page, {
    headerStyle: "yellow",
    zebra: true,
    columns: [
      { key: "angle", label: "Approach angle", width: mm(36), align: "right" },
      { key: "sin", label: "sin A", width: mm(30), align: "right" },
      { key: "factor", label: "Energy transfer (sin² A)", width: mm(46), align: "right" },
      { key: "share", label: "Share of head-on energy", width: mm(46), align: "right" },
    ],
    rows: PAS13_SINE_TABLE.map((r) => ({
      angle: `${r.angleDeg}°`,
      sin: r.sin.toFixed(4),
      factor: (r.sin * r.sin).toFixed(3),
      share: `${Math.round(r.sin * r.sin * 100)} %`,
    })),
  }));
  const ex = model.zones.find((z) => z.vehicle.energyJ !== null && z.vehicle.massKg !== null && z.vehicle.speedKmh !== null);
  if (ex) {
    const v = ex.vehicle;
    const total = (v.massKg as number) + v.loadKg;
    const vms = (v.speedKmh as number) / 3.6;
    w.h2("Worked example", { toc: false });
    w.body(
      `${ex.zoneName}: total mass ${Math.round(total).toLocaleString("en-GB")} kg (${Math.round(v.massKg as number).toLocaleString("en-GB")} kg vehicle${v.loadKg ? ` + ${Math.round(v.loadKg).toLocaleString("en-GB")} kg load` : ""}), speed ${(v.speedKmh as number).toLocaleString("en-GB", { maximumFractionDigits: 1 })} km/h = ${vms.toFixed(2)} m/s, approach angle ${Math.round(v.angleDeg)}°. KE = ½ × ${Math.round(total).toLocaleString("en-GB")} × (${vms.toFixed(2)} × sin ${Math.round(v.angleDeg)}°)² = ${joules(v.energyJ as number)}. With the ${PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT} % selection margin the barrier should be tested to at least ${joules(ex.pas13.requiredWithMarginJ as number)}.`,
    );
  }
  w.small(PAS13_INDICATIVE_FOOTNOTE);
}

async function drawAppendixC(w: Writer, model: RiskAssessmentModel): Promise<void> {
  w.section("Appendix C  Photo index");
  w.small(`${model.photoIndex.length} ${model.photoIndex.length === 1 ? "photograph" : "photographs"} in figure order. Full-size images are held on the A-SAFE Engage survey record.`);
  const cols = 4;
  const rowsPerPage = 6;
  const gutter = mm(3);
  const cw = contentWidth(w.page);
  const cellW = (cw - gutter * (cols - 1)) / cols;
  const captionH = TYPE.small.lead * 3 + mm(1);
  const imgH = mm(30);
  const cellH = imgH + captionH + mm(3);
  let i = 0;
  for (const p of model.photoIndex) {
    const col = i % cols;
    if (col === 0) {
      w.page = ensureSpace(w.doc, w.page, cellH);
    }
    const x = w.page.margin.l + col * (cellW + gutter);
    const top = w.page.cursorY;
    const embedded = p.bytes ? await embedImage(w.doc, p.bytes) : null;
    if (embedded) {
      const ratio = embedded.width / embedded.height;
      let dw = cellW;
      let dh = dw / ratio;
      if (dh > imgH) {
        dh = imgH;
        dw = dh * ratio;
      }
      w.page.page.drawImage(embedded.image, { x: x + (cellW - dw) / 2, y: top - imgH + (imgH - dh) / 2, width: dw, height: dh });
    } else {
      w.page.page.drawRectangle({ x, y: top - imgH, width: cellW, height: imgH, color: C.grey8 });
      drawText(w.page, "NO IMAGE", { x, y: top - imgH / 2 + TYPE.label.lead / 2, size: TYPE.label.size, font: w.doc.fonts.regular, color: C.grey60, maxWidth: cellW, align: "center", lineHeight: TYPE.label.lead, tracking: TYPE.label.tracking });
    }
    w.page.page.drawRectangle({ x, y: top - imgH, width: cellW, height: imgH, borderColor: C.grey20, borderWidth: 0.5 });
    drawText(w.page, p.figure, { x, y: top - imgH - mm(1), size: TYPE.small.size, font: w.doc.fonts.bold, color: C.black, lineHeight: TYPE.small.lead, maxWidth: cellW, noWrap: true });
    const capLines = wrap(w.doc.fonts.regular, TYPE.small.size, p.caption, cellW).slice(0, 2);
    capLines.forEach((line, li) => {
      drawText(w.page, line, { x, y: top - imgH - mm(1) - TYPE.small.lead * (li + 1), size: TYPE.small.size, font: w.doc.fonts.regular, color: C.grey60, lineHeight: TYPE.small.lead });
    });
    if (col === cols - 1 || i === model.photoIndex.length - 1) w.page.cursorY = top - cellH;
    i++;
    if (i % (cols * rowsPerPage) === 0 && i < model.photoIndex.length) w.newPage();
  }
  if (!model.photoIndex.length) w.body("No photographs are on file for this survey.");
}

function drawAppendixD(w: Writer, model: RiskAssessmentModel): void {
  w.section("Appendix D  Product datasheet references");
  if (!model.products.length) {
    w.body("No products have been recommended yet. Datasheets are appended once the estimation team confirms the selection.");
    return;
  }
  ({ page: w.page } = table(w.doc, w.page, {
    headerStyle: "yellow",
    zebra: true,
    columns: [
      { key: "product", label: "Product", width: mm(48) },
      { key: "family", label: "Family", width: mm(28) },
      { key: "energy", label: "Tested energy", width: mm(24), align: "right" },
      { key: "zones", label: "Zones", width: mm(34) },
      { key: "sheet", label: "Datasheet", width: mm(40) },
    ],
    rows: model.products.map((p) => ({
      product: { text: p.name, bold: true },
      family: p.family,
      energy: p.testedEnergyJ > 0 ? joules(p.testedEnergyJ) : "—",
      zones: model.zones.filter((z) => z.product?.info.name === p.name).map((z) => z.zoneName).join(", "),
      sheet: p.datasheetUrl ?? "On request from A-SAFE UAE",
    })),
  }));
  w.small(`Tested energies are ${PAS13_VERSION} pendulum-test figures published by A-SAFE. Datasheets carry the full specification, deflection zones and fixing details.`);
}

/** RiskAssessmentModel → PDF bytes. */
export async function renderRiskAssessmentModel(model: RiskAssessmentModel, meta: RenderMeta): Promise<Uint8Array> {
  const doc = await createDoc({
    title: DOCUMENT_KINDS.RA,
    reference: meta.status === "ISSUED" ? meta.reference : DRAFT_REFERENCE,
    revision: meta.revision,
    issuedOn: shortDate(meta.issuedOn),
    docType: DOCUMENT_KINDS.RA,
    status: meta.status,
  });
  await drawCoverFor(doc, model, meta);
  const w = new Writer(doc);
  drawDocumentControl(w, model, meta);
  const contentsPage = addPage(doc);
  w.toc.push({ level: 1, label: "Contents", page: contentsPage.number });

  drawExecutiveSummary(w, model);
  drawScopeAndMethodology(w, model);
  drawSiteContext(w, model);
  if (!model.inProgress) {
    drawRiskRegister(w, model);
    for (const z of model.zones) await drawZone(w, z);
    let n = FIRST_ZONE_SECTION + model.zones.length;
    drawActionPlan(w, model, n++);
    drawInvestment(w, model, meta, n++);
    drawLimitations(w, n++);
  } else {
    drawLimitations(w, 4);
  }
  drawAppendixA(w, model);
  drawAppendixB(w, model);
  if (!model.inProgress) {
    await drawAppendixC(w, model);
    drawAppendixD(w, model);
  }

  drawContents(doc, contentsPage, w.toc);
  return finalize(doc);
}

// ─── Loading and the issue flow ────────────────────────────────────────────

export interface RiskAssessmentInputs {
  bundle: SurveyBundle;
  register: RegisterPayload;
  comparison: CompareResponse | null;
}

/** Everything the model needs, from the database. Null when the survey does not exist. */
export async function loadRiskAssessmentInputs(env: Env, surveyId: string): Promise<RiskAssessmentInputs | null> {
  await ensurePas13ClassesLoaded(env).catch(() => undefined);
  const bundle = await loadSurveyBundle(env, surveyId, { withPhotoBytes: true, withProductImages: true, maxPhotos: 80 });
  if (!bundle) return null;
  const db = getDb(env.DATABASE_URL);
  const storage = createStorage(db);
  const photoRows: SurveyPhoto[] = await db.select().from(surveyPhotosTable).where(eq(surveyPhotosTable.siteSurveyId, surveyId));
  const areas: SiteSurveyArea[] = sortForRegister(bundle.areas);
  const photosByArea = groupPhotosByArea(photoRows);
  const summary = summariseRegister(areas);
  const highest = areas.find((a) => a.priorityRank !== null && a.priorityRank !== undefined);
  const register: RegisterPayload = {
    surveyId,
    areas: areas.map((a) => toRegisterArea(a, photosByArea.get(a.id) ?? [])),
    matrix: buildRiskMatrix(areas),
    summary: { ...summary, photos: photoRows.length, highestPriorityAreaId: highest?.id ?? null, highestPriorityZone: highest?.zoneName ?? null },
    bands: RISK_LEVEL_BANDS,
  };
  let comparison: CompareResponse | null = null;
  const previousId = bundle.survey.previousSurveyId;
  if (previousId) {
    const previous = await storage.getSiteSurvey(previousId).catch(() => undefined);
    if (previous && previous.userId === bundle.survey.userId) {
      comparison = buildCompareResponse(previous, bundle.survey, areas, photoRows);
    }
  }
  return { bundle, register, comparison };
}

export interface RenderRiskAssessmentOptions {
  status: "DRAFT" | "ISSUED";
  /** User id recorded on the issue row. */
  issuedBy?: string | null;
}

export interface RenderedRiskAssessment {
  bytes: Uint8Array;
  kind: DocumentKind;
  reference: string;
  revision: string;
  status: "DRAFT" | "ISSUED";
  objectKey: string | null;
  filename: string;
  model: RiskAssessmentModel;
}

/** Load the survey, build the model, render, and (when ISSUED) store and record the issue. */
export async function renderRiskAssessment(env: Env, surveyId: string, opts: RenderRiskAssessmentOptions): Promise<RenderedRiskAssessment | null> {
  const inputs = await loadRiskAssessmentInputs(env, surveyId);
  if (!inputs) return null;
  const model = buildRiskAssessmentModel(inputs.bundle, inputs.register, { comparison: inputs.comparison });
  const kind: DocumentKind = "RA";
  const issuedOn = new Date();
  const subject = { surveyId };
  const { reference, revision } =
    opts.status === "ISSUED"
      ? await reserveDocumentRef(env, kind, subject, issuedOn).then((r) => ({ reference: r.ref, revision: r.revision }))
      : { reference: DRAFT_REFERENCE, revision: "A" };
  const bytes = await renderRiskAssessmentModel(model, { status: opts.status, reference, revision, issuedOn });
  let objectKey: string | null = null;
  if (opts.status === "ISSUED") {
    ({ objectKey } = await recordDocumentIssue(env, {
      kind,
      bytes,
      ref: reference,
      revision,
      surveyId,
      projectId: null,
      issuedBy: opts.issuedBy ?? null,
      at: issuedOn,
    }));
  }
  return { bytes, kind, reference, revision, status: opts.status, objectKey, filename: documentFilename(kind, reference, revision), model };
}
