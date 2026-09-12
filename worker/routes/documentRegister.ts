// ────────────────────────────────────────────────────────────────────────────
// worker/routes/documentRegister.ts
//
// Project document register (Phase 3D Task PD6).
//
//   GET  /api/projects/:id/documents
//        → { issued: DocumentIssue[], renderable: RenderableDocument[] }
//   POST /api/projects/:id/documents/:kind/issue
//        body { orderId? | surveyId? | drawingId? | installationId? }
//        → { issue: DocumentIssue }
//
// `issued` is every document_issues row that belongs to the project (by
// project_id, or by the id of an order / survey / drawing / installation the
// project owns), newest first, with a human label per kind and the issuer's
// name. `renderable` is every document the project could produce right now,
// derived from what the project has:
//
//   each order                     → Order Form (OF), Budgetary Proposal (PR),
//                                    PAS 13 Alignment Statement (PS)
//   each site survey on the project → Impact Protection Risk Assessment (RA)
//   each layout drawing            → Drawing Sheet (DS)
//   each installation              → Installation Verification Report (IV)
//
// Issuing calls the renderer for the kind with status ISSUED (never an
// internal fetch: the Worker cannot call itself), which allocates or steps
// the ASU reference, stores the PDF in R2 and records the document_issues
// row. It then appends a row to the project's customer activity feed.
//
// Access: viewer-or-better collaborators (and the owner) can read the
// register; issuing needs editor-or-better.
// ────────────────────────────────────────────────────────────────────────────

import { Hono } from "hono";
import { and, desc, eq, inArray, isNull, or, sql as dsql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { mutationRateLimit } from "../middleware/rateLimiter";
import { getDb } from "../db";
import { createStorage } from "../storage";
import {
  installations,
  layoutDrawings,
  orders,
  siteSurveys,
  type CustomerCompany,
  type Installation,
  type LayoutDrawing,
  type Order,
  type Project,
  type SiteSurvey,
  type User,
} from "../../shared/schema";
import { DOCUMENT_KINDS, isDocumentKind, type DocumentKind } from "../../shared/documents/refs";
import { renderProposal } from "../lib/pdf/reports/proposal";
import { renderOrderForm } from "../lib/pdf/reports/orderForm";
import { renderRiskAssessment } from "../lib/pdf/reports/riskAssessment";
import { renderPas13Statement } from "../lib/pdf/reports/pas13Statement";
import { renderInstallationVerification } from "../lib/pdf/reports/installationVerification";
import { renderDrawingSheet } from "../lib/pdf/reports/drawingSheet";
import { buildDrawingSheetOptions } from "../lib/pdf/reports/drawingSheetLoader";
import {
  allocateDocumentRef,
  recordDocumentIssue,
  reserveDocumentRef,
  type DocumentIssueRow,
} from "../lib/pdf/reports/shared";
import { nextRevision } from "../../shared/documents/refs";
import { ensurePas13ClassesLoaded } from "../services/pas13Classes";
import { _buildAlignmentReportForOrder } from "./orders";
import { buildVerificationInput, loadOverlay } from "./documentsPas13";

const documentRegister = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Response shapes (mirrored in client/src/pages/projects/documentRegister.ts) ──

export interface DocumentSource {
  orderId?: string;
  surveyId?: string;
  drawingId?: string;
  installationId?: string;
}

export interface DocumentIssue {
  id: string;
  kind: DocumentKind;
  /** Human label for the kind, e.g. "Budgetary Proposal". */
  label: string;
  ref: string;
  revision: string;
  status: string | null;
  issuedAt: string | null;
  issuedBy: { id: string; name: string } | null;
  objectKey: string | null;
  /** GET /api/objects/<objectKey>; null when the PDF was not stored. */
  downloadUrl: string | null;
  source: DocumentSource;
}

export interface RenderableDocument {
  /** Stable key for the UI: `<kind>:<subject id>`. */
  key: string;
  kind: DocumentKind;
  label: string;
  /** What the document is about: order number, survey title, drawing number, installation title. */
  subjectLabel: string;
  source: DocumentSource;
  /** GET — renders on demand with the DRAFT watermark; no side effects. */
  draftUrl: string;
  /** POST — issues the next revision (this file's issue route). */
  issueUrl: string;
  lastIssued?: DocumentIssue;
}

export interface DocumentRegisterResponse {
  issued: DocumentIssue[];
  renderable: RenderableDocument[];
}

// ─── Project scope ─────────────────────────────────────────────────────────

interface ProjectScope {
  project: Project;
  customer: CustomerCompany | null;
  orders: Order[];
  surveys: SiteSurvey[];
  drawings: LayoutDrawing[];
  installations: Installation[];
}

/**
 * Everything the project owns that a document can be rendered from. Orders
 * carry projectName rather than a FK, so they (and surveys, which carry
 * neither) are matched the way the rest of the app does: same owner and the
 * project's name, or the customer's company name for surveys.
 */
async function loadProjectScope(db: ReturnType<typeof getDb>, storage: ReturnType<typeof createStorage>, project: Project): Promise<ProjectScope> {
  const customer = project.customerCompanyId ? (await storage.getCustomerCompany(project.customerCompanyId)) ?? null : null;
  const name = project.name.toLowerCase();
  const surveyMatch = customer?.name
    ? or(dsql`lower(${siteSurveys.title}) = ${name}`, dsql`lower(${siteSurveys.facilityName}) = ${customer.name.toLowerCase()}`)
    : dsql`lower(${siteSurveys.title}) = ${name}`;

  const [orderRows, surveyRows, drawingRows] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(and(eq(orders.userId, project.userId), eq(orders.projectName, project.name)))
      .orderBy(desc(orders.createdAt)),
    db
      .select()
      .from(siteSurveys)
      .where(and(eq(siteSurveys.userId, project.userId), surveyMatch))
      .orderBy(desc(siteSurveys.createdAt)),
    db
      .select()
      .from(layoutDrawings)
      .where(and(eq(layoutDrawings.projectId, project.id), isNull(layoutDrawings.deletedAt)))
      .orderBy(desc(layoutDrawings.updatedAt)),
  ]);
  const orderIds = orderRows.map((o) => o.id);
  const installRows = await db
    .select()
    .from(installations)
    .where(orderIds.length ? or(eq(installations.projectId, project.id), inArray(installations.orderId, orderIds)) : eq(installations.projectId, project.id))
    .orderBy(desc(installations.createdAt));
  return { project, customer, orders: orderRows, surveys: surveyRows, drawings: drawingRows, installations: installRows };
}

// ─── document_issues access (raw SQL; the table is not in shared/schema) ──

type IssueRowWithUser = DocumentIssueRow & {
  drawing_id: string | null;
  installation_id: string | null;
  issuer_first_name: string | null;
  issuer_last_name: string | null;
  issuer_email: string | null;
};

function toIssue(row: IssueRowWithUser): DocumentIssue {
  const kind = isDocumentKind(row.kind) ? row.kind : null;
  const name = [row.issuer_first_name, row.issuer_last_name].filter(Boolean).join(" ").trim() || row.issuer_email || "";
  const source: DocumentSource = {};
  if (row.order_id) source.orderId = row.order_id;
  if (row.survey_id) source.surveyId = row.survey_id;
  if (row.drawing_id) source.drawingId = row.drawing_id;
  if (row.installation_id) source.installationId = row.installation_id;
  return {
    id: row.id,
    kind: (kind ?? "PR") as DocumentKind,
    label: kind ? DOCUMENT_KINDS[kind] : String(row.kind),
    ref: row.ref,
    revision: row.revision,
    status: row.status ?? null,
    issuedAt: row.issued_at ? new Date(row.issued_at).toISOString() : null,
    issuedBy: row.issued_by ? { id: row.issued_by, name } : null,
    objectKey: row.object_key ?? null,
    downloadUrl: row.object_key ? `/api/objects/${row.object_key}` : null,
    source,
  };
}

/** Every issue row that belongs to the project, newest first. */
async function listProjectIssues(env: Env, scope: ProjectScope): Promise<DocumentIssue[]> {
  const sql = neon(env.DATABASE_URL);
  const orderIds = scope.orders.map((o) => o.id);
  const surveyIds = scope.surveys.map((s) => s.id);
  const drawingIds = scope.drawings.map((d) => d.id);
  const installationIds = scope.installations.map((i) => i.id);
  const rows = (await sql`
    SELECT di.*, u.first_name AS issuer_first_name, u.last_name AS issuer_last_name, u.email AS issuer_email
    FROM document_issues di
    LEFT JOIN users u ON u.id = di.issued_by
    WHERE di.project_id = ${scope.project.id}
       OR di.order_id = ANY(${orderIds}::text[])
       OR di.survey_id = ANY(${surveyIds}::text[])
       OR di.drawing_id = ANY(${drawingIds}::text[])
       OR di.installation_id = ANY(${installationIds}::text[])
    ORDER BY di.issued_at DESC, di.revision DESC
  `) as IssueRowWithUser[];
  return rows.map(toIssue);
}

/** The issue row just written, by its (unique) object key. */
async function issueByObjectKey(env: Env, objectKey: string): Promise<DocumentIssue | null> {
  const sql = neon(env.DATABASE_URL);
  const rows = (await sql`
    SELECT di.*, u.first_name AS issuer_first_name, u.last_name AS issuer_last_name, u.email AS issuer_email
    FROM document_issues di
    LEFT JOIN users u ON u.id = di.issued_by
    WHERE di.object_key = ${objectKey}
    ORDER BY di.issued_at DESC LIMIT 1
  `) as IssueRowWithUser[];
  return rows[0] ? toIssue(rows[0]) : null;
}

/**
 * Stamp the subject columns the shared recorder does not know about
 * (drawing_id, installation_id) and make sure project_id is set even when
 * the renderer's soft-join could not resolve the project.
 */
async function stampIssueSubject(
  env: Env,
  objectKey: string,
  subject: { projectId: string; drawingId?: string | null; installationId?: string | null },
): Promise<void> {
  const sql = neon(env.DATABASE_URL);
  await sql`
    UPDATE document_issues
    SET project_id = COALESCE(project_id, ${subject.projectId}),
        drawing_id = COALESCE(${subject.drawingId ?? null}, drawing_id),
        installation_id = COALESCE(${subject.installationId ?? null}, installation_id)
    WHERE object_key = ${objectKey}
  `;
}

/** Latest issue of a kind keyed on a drawing or an installation (the shared helper only knows orders and surveys). */
async function latestIssueFor(env: Env, kind: DocumentKind, subject: { drawingId?: string; installationId?: string }): Promise<DocumentIssueRow | null> {
  const sql = neon(env.DATABASE_URL);
  const rows = (subject.drawingId
    ? await sql`SELECT * FROM document_issues WHERE kind = ${kind} AND drawing_id = ${subject.drawingId} ORDER BY issued_at DESC LIMIT 1`
    : subject.installationId
      ? await sql`SELECT * FROM document_issues WHERE kind = ${kind} AND installation_id = ${subject.installationId} ORDER BY issued_at DESC LIMIT 1`
      : []) as DocumentIssueRow[];
  return rows[0] ?? null;
}

async function reserveRefFor(env: Env, kind: DocumentKind, subject: { drawingId?: string; installationId?: string }, at: Date): Promise<{ ref: string; revision: string }> {
  const previous = await latestIssueFor(env, kind, subject);
  if (previous) return { ref: previous.ref, revision: nextRevision(previous.revision) };
  return { ref: await allocateDocumentRef(env, kind, at), revision: "A" };
}

// ─── Renderable documents ──────────────────────────────────────────────────

function sourceMatches(issue: DocumentIssue, kind: DocumentKind, source: DocumentSource): boolean {
  if (issue.kind !== kind) return false;
  if (source.drawingId) return issue.source.drawingId === source.drawingId;
  if (source.installationId) return issue.source.installationId === source.installationId;
  if (source.orderId) return issue.source.orderId === source.orderId;
  if (source.surveyId) return issue.source.surveyId === source.surveyId && !issue.source.orderId;
  return false;
}

function renderables(projectId: string, scope: ProjectScope, issued: DocumentIssue[]): RenderableDocument[] {
  const out: RenderableDocument[] = [];
  const add = (kind: DocumentKind, subjectLabel: string, source: DocumentSource, draftUrl: string) => {
    const id = source.orderId ?? source.surveyId ?? source.drawingId ?? source.installationId ?? "";
    // `issued` is newest first, so the first match is the latest revision.
    const lastIssued = issued.find((i) => sourceMatches(i, kind, source));
    out.push({
      key: `${kind}:${id}`,
      kind,
      label: DOCUMENT_KINDS[kind],
      subjectLabel,
      source,
      draftUrl,
      issueUrl: `/api/projects/${projectId}/documents/${kind}/issue`,
      ...(lastIssued ? { lastIssued } : {}),
    });
  };
  for (const o of scope.orders) {
    const label = `Order ${o.orderNumber}`;
    add("OF", label, { orderId: o.id }, `/api/orders/${o.id}/documents/order-form.pdf?status=draft`);
    add("PR", label, { orderId: o.id }, `/api/orders/${o.id}/documents/proposal.pdf?status=draft`);
    add("PS", label, { orderId: o.id }, `/api/orders/${o.id}/documents/pas13-statement.pdf?status=draft`);
  }
  for (const s of scope.surveys) {
    add("RA", `Survey ${s.title}`, { surveyId: s.id }, `/api/site-surveys/${s.id}/documents/risk-assessment.pdf?status=draft`);
  }
  for (const d of scope.drawings) {
    const label = d.dwgNumber || d.drawingTitle || d.fileName || "Drawing";
    add("DS", `Drawing ${label}`, { drawingId: d.id }, `/api/layout-drawings/${d.id}/documents/sheet.pdf?status=draft`);
  }
  for (const i of scope.installations) {
    add("IV", `Installation ${i.title}`, { installationId: i.id }, `/api/installations/${i.id}/documents/verification.pdf?status=draft`);
  }
  return out;
}

// ─── Access ────────────────────────────────────────────────────────────────

type Ctx = {
  env: Env;
  get: (k: "user") => Variables["user"];
  json: (b: unknown, s: 403 | 404) => Response;
};

async function gateProject(c: Ctx, projectId: string, minRole: "viewer" | "editor") {
  const db = getDb(c.env.DATABASE_URL);
  const storage = createStorage(db);
  const userId = c.get("user").claims.sub;
  const project = await storage.getProject(projectId);
  if (!project) return { error: c.json({ message: "Project not found" }, 404) };
  if (project.userId !== userId) {
    const access = await storage.canAccessProject(projectId, userId, minRole);
    if (!access.allowed) return { error: c.json({ message: "Project not found" }, 404) };
  }
  return { db, storage, userId, project };
}

function displayName(user: User | undefined | null): string | undefined {
  if (!user) return undefined;
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || undefined;
}

// ─── GET /projects/:id/documents ───────────────────────────────────────────

documentRegister.get("/projects/:id/documents", authMiddleware, async (c) => {
  try {
    const gate = await gateProject(c, c.req.param("id"), "viewer");
    if ("error" in gate) return gate.error;
    const scope = await loadProjectScope(gate.db, gate.storage, gate.project);
    const issued = await listProjectIssues(c.env, scope);
    const body: DocumentRegisterResponse = { issued, renderable: renderables(gate.project.id, scope, issued) };
    return c.json(body);
  } catch (error) {
    console.error("Error loading project document register:", error);
    return c.json({ message: "Failed to load documents" }, 500);
  }
});

// ─── POST /projects/:id/documents/:kind/issue ──────────────────────────────

interface IssueBody {
  orderId?: string;
  surveyId?: string;
  drawingId?: string;
  installationId?: string;
}

documentRegister.post("/projects/:id/documents/:kind/issue", authMiddleware, mutationRateLimit, async (c) => {
  try {
    const kindParam = c.req.param("kind").toUpperCase();
    if (!isDocumentKind(kindParam)) return c.json({ message: `Unknown document kind: ${c.req.param("kind")}` }, 400);
    const kind: DocumentKind = kindParam;
    const gate = await gateProject(c, c.req.param("id"), "editor");
    if ("error" in gate) return gate.error;
    const { db, storage, userId, project } = gate;
    const body = (await c.req.json().catch(() => ({}))) as IssueBody;
    const scope = await loadProjectScope(db, storage, project);
    const appOrigin = c.env.APP_URL || new URL(c.req.url).origin;
    const user = await storage.getUser(userId);
    const preparedBy = displayName(user);
    const issuedOn = new Date();

    let objectKey: string | null = null;
    let subjectLabel = "";

    switch (kind) {
      case "OF":
      case "PR": {
        const order = scope.orders.find((o) => o.id === body.orderId);
        if (!order) return c.json({ message: "orderId must name an order on this project" }, 400);
        subjectLabel = `order ${order.orderNumber}`;
        const rendered =
          kind === "OF"
            ? await renderOrderForm(c.env, order.id, { status: "ISSUED", surveyId: body.surveyId ?? null, issuedBy: userId, appOrigin })
            : await renderProposal(c.env, { orderId: order.id, status: "ISSUED", surveyId: body.surveyId ?? null, issuedBy: userId, appOrigin });
        if (!rendered?.objectKey) return c.json({ message: "Order not found" }, 404);
        objectKey = rendered.objectKey;
        await stampIssueSubject(c.env, objectKey, { projectId: project.id });
        break;
      }
      case "PS": {
        const order = scope.orders.find((o) => o.id === body.orderId);
        if (!order) return c.json({ message: "orderId must name an order on this project" }, 400);
        subjectLabel = `order ${order.orderNumber}`;
        await ensurePas13ClassesLoaded(c.env);
        const report = await _buildAlignmentReportForOrder(c.env, storage, order);
        const { ref, revision } = await reserveDocumentRef(c.env, "PS", { orderId: order.id }, issuedOn);
        const out = await renderPas13Statement({ ...report, appOrigin, status: "ISSUED", reference: ref, revision, preparedBy });
        ({ objectKey } = await recordDocumentIssue(c.env, {
          kind: "PS",
          bytes: out.pdf,
          ref,
          revision,
          orderId: order.id,
          projectId: project.id,
          issuedBy: userId,
          at: issuedOn,
        }));
        break;
      }
      case "RA": {
        const survey = scope.surveys.find((s) => s.id === body.surveyId);
        if (!survey) return c.json({ message: "surveyId must name a survey on this project" }, 400);
        subjectLabel = `survey ${survey.title}`;
        const rendered = await renderRiskAssessment(c.env, survey.id, { status: "ISSUED", issuedBy: userId });
        if (!rendered?.objectKey) return c.json({ message: "Survey not found" }, 404);
        objectKey = rendered.objectKey;
        await stampIssueSubject(c.env, objectKey, { projectId: project.id });
        break;
      }
      case "DS": {
        const drawing = scope.drawings.find((d) => d.id === body.drawingId);
        if (!drawing) return c.json({ message: "drawingId must name a drawing on this project" }, 400);
        subjectLabel = `drawing ${drawing.dwgNumber || drawing.drawingTitle || drawing.fileName}`;
        const overlay = await loadOverlay(storage, drawing);
        const { ref, revision } = await reserveRefFor(c.env, "DS", { drawingId: drawing.id }, issuedOn);
        const opts = await buildDrawingSheetOptions(c.env, { drawing, overlay, user, status: "ISSUED" });
        // The sheet prints the drawing's own DWG number and revision; fall
        // back to the register reference when the title block has none.
        opts.titleBlock = { ...opts.titleBlock, dwgNumber: opts.titleBlock.dwgNumber || ref, revision: opts.titleBlock.revision || revision };
        const bytes = await renderDrawingSheet(c.env, opts);
        ({ objectKey } = await recordDocumentIssue(c.env, { kind: "DS", bytes, ref, revision, projectId: project.id, issuedBy: userId, at: issuedOn }));
        await stampIssueSubject(c.env, objectKey, { projectId: project.id, drawingId: drawing.id });
        break;
      }
      case "IV": {
        const install = scope.installations.find((i) => i.id === body.installationId);
        if (!install) return c.json({ message: "installationId must name an installation on this project" }, 400);
        subjectLabel = `installation ${install.title}`;
        const built = await buildVerificationInput(c.env, db, install.id, { status: "ISSUED", preparedBy });
        if (!built) return c.json({ message: "Installation not found" }, 404);
        const { ref, revision } = await reserveRefFor(c.env, "IV", { installationId: install.id }, issuedOn);
        const bytes = await renderInstallationVerification(c.env, { ...built.input, reference: ref, revision, issuedOn });
        ({ objectKey } = await recordDocumentIssue(c.env, {
          kind: "IV",
          bytes,
          ref,
          revision,
          orderId: install.orderId ?? null,
          projectId: project.id,
          issuedBy: userId,
          at: issuedOn,
        }));
        await stampIssueSubject(c.env, objectKey, { projectId: project.id, installationId: install.id });
        break;
      }
    }

    if (!objectKey) return c.json({ message: "Failed to issue document" }, 500);
    const issue = await issueByObjectKey(c.env, objectKey);
    if (!issue) return c.json({ message: "Issued document was not recorded" }, 500);

    // Activity feed: the project's customer activity stream is the
    // project_approvals table (see storage.getProjectActivity), so an issue
    // lands there as a `document_issued` decision with the issuer as actor.
    await storage
      .recordProjectApproval({
        projectId: project.id,
        decision: "document_issued",
        approverName: preparedBy ?? null,
        approverEmail: user?.email ?? null,
        comments: `Issued ${issue.label} ${issue.ref} Rev ${issue.revision} (${subjectLabel})`,
      })
      .catch((err) => console.error("Document issued but activity row failed:", err));

    return c.json({ issue }, 201);
  } catch (error) {
    console.error("Error issuing project document:", error);
    return c.json({ message: "Failed to issue document" }, 500);
  }
});

export default documentRegister;
