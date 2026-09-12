// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/reports/shared.ts
//
// Data loaders and issue bookkeeping shared by every report renderer
// (proposal, order form, risk assessment, PAS 13 statement …).
//
//   loadOrderBundle(env, orderId, { surveyId? })  → OrderBundle
//   loadSurveyBundle(env, surveyId)               → SurveyBundle
//   loadProductsByName(env, storage, names)       → Map<name, ProductInfo>
//   issueDocument(env, …) / allocateDocumentRef   → document_refs / document_issues
//
// Renderers never touch the database directly: they take a bundle (or a
// pure model built from one) so tests can hand them an in-memory fixture.
// ────────────────────────────────────────────────────────────────────────────

import { and, desc, eq, isNull } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import type { Env } from "../../../types";
import { getDb } from "../../../db";
import { createStorage } from "../../../storage";
import {
  layoutDrawings,
  projects,
  surveyPhotos as surveyPhotosTable,
  type LayoutDrawing,
  type Order,
  type Project,
  type SiteSurvey,
  type SiteSurveyArea,
  type SurveyPhoto,
  type User,
} from "../../../../shared/schema";
import { putObject } from "../../../routes/files";
import {
  documentObjectKey,
  formatDocumentRef,
  nextRevision,
  yymmFor,
  type DocumentKind,
} from "../../../../shared/documents/refs";
import { fetchImageBytes, fetchObjectBytes } from "../images";

// ─── People ────────────────────────────────────────────────────────────────

export interface PersonInfo {
  name: string;
  title: string | null;
  email: string | null;
  mobile: string | null;
  company: string | null;
}

export function personFromUser(user: User | null | undefined): PersonInfo {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return {
    name: name || user?.email || "A-SAFE UAE",
    title: user?.jobTitle || (user as { jobRole?: string | null } | undefined)?.jobRole || null,
    email: user?.email ?? null,
    mobile: user?.phone ?? null,
    company: user?.company || "A-SAFE DWC LLC",
  };
}

// ─── Products ──────────────────────────────────────────────────────────────

export interface ProductInfo {
  id: string | null;
  name: string;
  /** Product family for grouping and the card header (subcategory, else category). */
  family: string;
  sku: string | null;
  /** PAS 13 tested energy in joules (pas13TestJoules, else impactRating). 0 when unknown. */
  testedEnergyJ: number;
  keySpecs: string[];
  description: string | null;
  datasheetUrl: string | null;
  deflectionZoneMm: number | null;
  imageRef: string | null;
  /** JPEG / PNG bytes when the image could be fetched; null otherwise. */
  imageBytes: Uint8Array | null;
}

type ProductRow = {
  id: string;
  name: string;
  category: string;
  subcategory?: string | null;
  description?: string | null;
  sku?: string | null;
  impactRating?: number | null;
  pas13TestJoules?: number | null;
  deflectionZone?: number | null;
  features?: unknown;
  technicalSheetUrl?: string | null;
  imageUrl?: string | null;
  heightMin?: number | null;
  heightMax?: number | null;
  impactTestingData?: unknown;
};

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Up to four short specification bullets from a product row. */
export function productKeySpecs(p: ProductRow): string[] {
  const out: string[] = [];
  const energy = Number(p.pas13TestJoules || p.impactRating || 0);
  if (energy > 0) out.push(`Tested to PAS 13:2017 at ${energy.toLocaleString("en-GB")} J`);
  if (p.deflectionZone) out.push(`Deflection zone ${p.deflectionZone} mm`);
  if (p.heightMin || p.heightMax) {
    const h = p.heightMin && p.heightMax && p.heightMin !== p.heightMax ? `${p.heightMin}–${p.heightMax} mm` : `${p.heightMax ?? p.heightMin} mm`;
    out.push(`Height ${h}`);
  }
  if (Array.isArray(p.features)) {
    for (const f of p.features) {
      if (out.length >= 4) break;
      const s = String(f ?? "").trim();
      if (s) out.push(s);
    }
  }
  if (out.length < 2 && typeof p.description === "string") {
    const first = p.description.split(/\.\s+|\n+/).map((s) => s.trim()).find(Boolean);
    if (first) out.push(first.length > 110 ? `${first.slice(0, 107)}…` : first);
  }
  return out.slice(0, 4);
}

export function productInfoFromRow(p: ProductRow, imageBytes: Uint8Array | null = null): ProductInfo {
  return {
    id: p.id,
    name: p.name,
    family: titleCase(p.subcategory || p.category || "Safety barriers"),
    sku: p.sku ?? null,
    testedEnergyJ: Number(p.pas13TestJoules || p.impactRating || 0) || 0,
    keySpecs: productKeySpecs(p),
    description: p.description ?? null,
    datasheetUrl: p.technicalSheetUrl ?? null,
    deflectionZoneMm: p.deflectionZone ?? null,
    imageRef: p.imageUrl ?? null,
    imageBytes,
  };
}

/** Placeholder ProductInfo for a line whose product is no longer in the catalogue. */
export function unknownProduct(name: string, family?: string | null): ProductInfo {
  return {
    id: null,
    name,
    family: titleCase(family || "Safety barriers"),
    sku: null,
    testedEnergyJ: 0,
    keySpecs: [],
    description: null,
    datasheetUrl: null,
    deflectionZoneMm: null,
    imageRef: null,
    imageBytes: null,
  };
}

/**
 * Catalogue rows for a set of product names, with their hero image fetched
 * (R2 / CDN / data URL) so the renderer can embed it. Names that miss the
 * catalogue get a placeholder entry.
 */
export async function loadProductsByName(
  env: Env,
  storage: ReturnType<typeof createStorage>,
  names: Iterable<string>,
  opts: { withImages?: boolean } = {},
): Promise<Map<string, ProductInfo>> {
  const out = new Map<string, ProductInfo>();
  const unique = Array.from(new Set(Array.from(names).map((n) => String(n ?? "").trim()).filter(Boolean)));
  await Promise.all(
    unique.map(async (name) => {
      const row = (await storage.getProductByName(name).catch(() => undefined)) as ProductRow | undefined;
      if (!row) {
        out.set(name, unknownProduct(name));
        return;
      }
      const bytes = opts.withImages !== false && row.imageUrl ? await fetchImageBytes(env, row.imageUrl) : null;
      out.set(name, productInfoFromRow(row, bytes));
    }),
  );
  return out;
}

// ─── Survey ────────────────────────────────────────────────────────────────

export interface PhotoInfo {
  id: string;
  areaId: string | null;
  zoneName: string | null;
  objectKey: string;
  ref: string;
  takenAt: Date | null;
  /** Hazard tags from the vision analysis when present. */
  tags: string[];
  bytes: Uint8Array | null;
}

export interface SurveyBundle {
  survey: SiteSurvey;
  areas: SiteSurveyArea[];
  photos: PhotoInfo[];
  owner: PersonInfo;
  /** Recommended products across all areas, keyed by product name. */
  products: Map<string, ProductInfo>;
}

function photoTags(analysis: unknown): string[] {
  const a = analysis as { tags?: unknown; hazards?: unknown; hazardTags?: unknown } | null;
  const raw = a?.hazardTags ?? a?.hazards ?? a?.tags;
  if (!Array.isArray(raw)) return [];
  return raw.map((t) => (typeof t === "string" ? t : (t as { label?: string })?.label ?? "")).filter(Boolean).slice(0, 4);
}

export function photoInfoFromRow(p: SurveyPhoto, bytes: Uint8Array | null = null): PhotoInfo {
  return {
    id: p.id,
    areaId: p.areaId ?? null,
    zoneName: p.zoneName ?? null,
    objectKey: p.objectKey,
    ref: `/api/objects/${p.objectKey}`,
    takenAt: p.takenAt ?? null,
    tags: photoTags(p.analysis),
    bytes,
  };
}

/** Recommended product names stored on an area (`recommendedProducts` jsonb). */
export function areaRecommendedProductNames(area: SiteSurveyArea): string[] {
  const raw = area.recommendedProducts;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((rp) => (typeof rp === "string" ? rp : (rp as { productName?: string; name?: string })?.productName ?? (rp as { name?: string })?.name ?? ""))
    .map((s) => String(s).trim())
    .filter(Boolean);
}

/** Areas in register order: priorityRank ascending, then risk score descending. */
export function sortAreas(areas: SiteSurveyArea[]): SiteSurveyArea[] {
  const level = (l: string | null | undefined) => ({ critical: 4, high: 3, medium: 2, low: 1 })[String(l ?? "")] ?? 0;
  return [...areas].sort((a, b) => {
    const ra = a.priorityRank ?? Number.MAX_SAFE_INTEGER;
    const rb = b.priorityRank ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    const sa = a.riskScore ?? level(a.riskLevel) * 5;
    const sb = b.riskScore ?? level(b.riskLevel) * 5;
    return sb - sa;
  });
}

export async function loadSurveyBundle(
  env: Env,
  surveyId: string,
  opts: { withPhotoBytes?: boolean; withProductImages?: boolean; maxPhotos?: number } = {},
): Promise<SurveyBundle | null> {
  const db = getDb(env.DATABASE_URL);
  const storage = createStorage(db);
  const survey = await storage.getSiteSurvey(surveyId);
  if (!survey) return null;
  const [areas, photoRows, ownerRow] = await Promise.all([
    storage.getSiteSurveyAreas(surveyId),
    db.select().from(surveyPhotosTable).where(eq(surveyPhotosTable.siteSurveyId, surveyId)),
    storage.getUser(survey.userId).catch(() => undefined),
  ]);
  const limited = opts.maxPhotos ? photoRows.slice(0, opts.maxPhotos) : photoRows;
  const photos = await Promise.all(
    limited.map(async (p) => photoInfoFromRow(p, opts.withPhotoBytes ? await fetchImageBytes(env, `/api/objects/${p.objectKey}`) : null)),
  );
  const names = new Set<string>();
  for (const a of areas) for (const n of areaRecommendedProductNames(a)) names.add(n);
  const products = await loadProductsByName(env, storage, names, { withImages: opts.withProductImages });
  return { survey, areas: sortAreas(areas), photos, owner: personFromUser(ownerRow), products };
}

// ─── Order ─────────────────────────────────────────────────────────────────

/** One `orders.items` entry, as the app stores it (tolerant view). */
export interface OrderItemRow {
  id?: string | number | null;
  productId?: string | null;
  productName: string;
  sku?: string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  totalPrice?: number | string | null;
  pricingType?: string | null;
  lengthMeters?: number | string | null;
  requiresDelivery?: boolean | null;
  requiresInstallation?: boolean | null;
  applicationArea?: string | null;
  zoneName?: string | null;
  areaName?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  impactRating?: number | null;
  notes?: string | null;
  calculationContext?: Record<string, unknown> | null;
  selectedVariant?: Record<string, unknown> | null;
}

export interface LayoutDrawingInfo {
  id: string;
  fileType: string;
  fileUrl: string;
  dwgNumber: string | null;
  revision: string | null;
  title: string | null;
  /** Raster bytes of an image-type drawing; the fallback when no vector export exists. */
  bytes: Uint8Array | null;
  /** Server-side vector export (`layout-exports/…` A3 PDF in R2), when the drawing has one. */
  exportObjectKey?: string | null;
  /** documentVersion the export was rendered from. */
  exportVersion?: number | null;
  /** Live documentVersion; the export is stale when it differs from exportVersion. */
  documentVersion?: number | null;
  /** The export PDF's bytes when it could be fetched; the renderer prefers these over `bytes`. */
  exportBytes?: Uint8Array | null;
}

export interface OrderBundle {
  order: Order;
  items: OrderItemRow[];
  owner: PersonInfo;
  project: Project | null;
  survey: SurveyBundle | null;
  products: Map<string, ProductInfo>;
  layoutDrawing: LayoutDrawingInfo | null;
  appOrigin: string;
}

export function orderItems(order: { items?: unknown }): OrderItemRow[] {
  return (Array.isArray(order.items) ? order.items : []).filter((it): it is OrderItemRow => !!it && typeof it === "object" && !!(it as OrderItemRow).productName);
}

/** Soft-join the order's project by (owner, name) — orders carry projectName, not a FK. */
async function findProjectForOrder(db: ReturnType<typeof getDb>, order: Order): Promise<Project | null> {
  if (!order.projectName) return null;
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, order.userId), eq(projects.name, order.projectName)))
    .limit(1);
  return rows[0] ?? null;
}

/** The survey for this order: explicit id, else the owner's survey whose title matches the project name. */
async function findSurveyIdForOrder(storage: ReturnType<typeof createStorage>, order: Order): Promise<string | null> {
  const surveys = await storage.getUserSiteSurveys(order.userId).catch(() => []);
  const pn = String(order.projectName ?? "").toLowerCase();
  const cc = String(order.customerCompany ?? "").toLowerCase();
  const match = surveys.find(
    (s) => (pn && String(s.title ?? "").toLowerCase() === pn) || (cc && String(s.facilityName ?? "").toLowerCase() === cc),
  );
  return match?.id ?? null;
}

async function loadLayoutDrawing(env: Env, db: ReturnType<typeof getDb>, id: string | null | undefined, project: Project | null): Promise<LayoutDrawingInfo | null> {
  const isImageType = (r: LayoutDrawing) => /^(image|png|jpe?g)$/i.test(r.fileType);
  let row: LayoutDrawing | undefined;
  if (id) {
    [row] = await db.select().from(layoutDrawings).where(eq(layoutDrawings.id, id)).limit(1);
  } else if (project) {
    // Most recent drawing with a vector export wins (any base type); else the
    // most recent image-type drawing, which we can still embed as a raster.
    const recent = await db
      .select()
      .from(layoutDrawings)
      .where(and(eq(layoutDrawings.projectId, project.id), isNull(layoutDrawings.deletedAt)))
      .orderBy(desc(layoutDrawings.updatedAt))
      .limit(25);
    row = recent.find((r) => !!r.exportObjectKey) ?? recent.find(isImageType);
  }
  if (!row || row.deletedAt) return null;
  const exportBytes = row.exportObjectKey ? await fetchObjectBytes(env, row.exportObjectKey) : null;
  const isImage = isImageType(row) && row.fileUrl !== "blank-canvas";
  // The raster is only needed as a fallback; skip the fetch when the export loaded.
  const bytes = isImage && !exportBytes ? await fetchImageBytes(env, row.fileUrl) : null;
  return {
    id: row.id,
    fileType: row.fileType,
    fileUrl: row.fileUrl,
    dwgNumber: row.dwgNumber ?? null,
    revision: row.revision ?? null,
    title: row.drawingTitle ?? row.projectName ?? null,
    bytes,
    exportObjectKey: row.exportObjectKey ?? null,
    exportVersion: row.exportVersion ?? null,
    documentVersion: row.documentVersion ?? 0,
    exportBytes,
  };
}

export async function loadOrderBundle(
  env: Env,
  orderId: string,
  opts: { surveyId?: string | null; appOrigin?: string; withImages?: boolean } = {},
): Promise<OrderBundle | null> {
  const db = getDb(env.DATABASE_URL);
  const storage = createStorage(db);
  const order = await storage.getOrder(orderId);
  if (!order) return null;
  const items = orderItems(order);
  const [ownerRow, project] = await Promise.all([
    storage.getUser(order.userId).catch(() => undefined),
    findProjectForOrder(db, order).catch(() => null),
  ]);
  const surveyId = opts.surveyId || (await findSurveyIdForOrder(storage, order));
  const withImages = opts.withImages !== false;
  const [survey, products, layoutDrawing] = await Promise.all([
    surveyId ? loadSurveyBundle(env, surveyId, { withPhotoBytes: withImages, withProductImages: false, maxPhotos: 12 }) : Promise.resolve(null),
    loadProductsByName(env, storage, items.map((it) => it.productName), { withImages }),
    loadLayoutDrawing(env, db, order.layoutDrawingId, project).catch(() => null),
  ]);
  return {
    order,
    items,
    owner: personFromUser(ownerRow),
    project,
    survey,
    products,
    layoutDrawing,
    appOrigin: opts.appOrigin || env.APP_URL || "",
  };
}

// ─── Document issue bookkeeping ────────────────────────────────────────────

export interface DocumentIssueRow {
  id: string;
  kind: DocumentKind;
  ref: string;
  revision: string;
  survey_id: string | null;
  order_id: string | null;
  project_id: string | null;
  issued_by: string | null;
  issued_at: string;
  object_key: string | null;
  status: string | null;
}

/** Next sequence for (kind, yymm) — an upsert on document_refs. */
export async function allocateDocumentRef(env: Env, kind: DocumentKind, at: Date = new Date()): Promise<string> {
  const sql = neon(env.DATABASE_URL);
  const yymm = yymmFor(at);
  const rows = (await sql`
    INSERT INTO document_refs (kind, yymm, seq) VALUES (${kind}, ${yymm}, 1)
    ON CONFLICT (kind, yymm) DO UPDATE SET seq = document_refs.seq + 1
    RETURNING seq
  `) as Array<{ seq: number }>;
  const seq = Number(rows[0]?.seq ?? 1);
  return formatDocumentRef(kind, yymm, seq);
}

/** Most recent issue of this kind for an order or survey, if any. */
export async function latestDocumentIssue(
  env: Env,
  kind: DocumentKind,
  subject: { orderId?: string | null; surveyId?: string | null },
): Promise<DocumentIssueRow | null> {
  const sql = neon(env.DATABASE_URL);
  const rows = (subject.orderId
    ? await sql`SELECT * FROM document_issues WHERE kind = ${kind} AND order_id = ${subject.orderId} ORDER BY issued_at DESC LIMIT 1`
    : subject.surveyId
      ? await sql`SELECT * FROM document_issues WHERE kind = ${kind} AND survey_id = ${subject.surveyId} ORDER BY issued_at DESC LIMIT 1`
      : []) as DocumentIssueRow[];
  return rows[0] ?? null;
}

export interface IssueDocumentOptions {
  kind: DocumentKind;
  bytes: Uint8Array;
  orderId?: string | null;
  surveyId?: string | null;
  projectId?: string | null;
  issuedBy?: string | null;
  at?: Date;
}

export interface IssuedDocument {
  ref: string;
  revision: string;
  objectKey: string;
}

/**
 * Reserve the reference and revision an ISSUED render will carry. The first
 * issue for a subject allocates a new reference at revision A; later issues
 * reuse the reference and step the revision letter.
 */
export async function reserveDocumentRef(
  env: Env,
  kind: DocumentKind,
  subject: { orderId?: string | null; surveyId?: string | null },
  at: Date = new Date(),
): Promise<{ ref: string; revision: string }> {
  const previous = await latestDocumentIssue(env, kind, subject);
  if (previous) return { ref: previous.ref, revision: nextRevision(previous.revision) };
  return { ref: await allocateDocumentRef(env, kind, at), revision: "A" };
}

/** Store the rendered bytes and record the issue. Call after rendering with the reserved ref. */
export async function recordDocumentIssue(
  env: Env,
  o: IssueDocumentOptions & { ref: string; revision: string },
): Promise<IssuedDocument> {
  const objectKey = documentObjectKey(o.kind, o.ref, o.revision);
  await putObject(env, objectKey, o.bytes, "application/pdf");
  const sql = neon(env.DATABASE_URL);
  await sql`
    INSERT INTO document_issues (kind, ref, revision, survey_id, order_id, project_id, issued_by, issued_at, object_key, status)
    VALUES (${o.kind}, ${o.ref}, ${o.revision}, ${o.surveyId ?? null}, ${o.orderId ?? null}, ${o.projectId ?? null},
            ${o.issuedBy ?? null}, ${(o.at ?? new Date()).toISOString()}, ${objectKey}, 'ISSUED')
  `;
  return { ref: o.ref, revision: o.revision, objectKey };
}

// ─── Formatting helpers shared by renderers ────────────────────────────────

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "12 September 2026" */
export function longDate(d: Date | string | null | undefined = new Date()): string {
  const date = d instanceof Date ? d : d ? new Date(d) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "12 Sep 2026" */
export function shortDate(d: Date | string | null | undefined = new Date()): string {
  const date = d instanceof Date ? d : d ? new Date(d) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()].slice(0, 3)} ${date.getUTCFullYear()}`;
}

/** "AED 12,345.00" — the AED figure converted through the frozen order rate. */
export function money(aed: number, currency = "AED", fxRate: unknown = 1): string {
  const code = (currency || "AED").toUpperCase();
  const rate = code === "AED" ? 1 : Number(fxRate);
  const amount = (Number.isFinite(aed) ? aed : 0) * (Number.isFinite(rate) && rate > 0 ? rate : 1);
  return `${code} ${amount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "2.4 m" / "12 m" */
export function metres(n: number): string {
  return `${Number.isInteger(n) ? n : Number(n.toFixed(2))} m`;
}

/** "19,200 J" */
export function joules(n: number): string {
  return `${Math.round(n).toLocaleString("en-GB")} J`;
}
