// ────────────────────────────────────────────────────────────────────────────
// worker/routes/documentsPas13.ts
//
// Document routes for Phase 3D Task PD4:
//   GET /api/orders/:id/documents/pas13-statement.pdf
//   GET /api/installations/:id/documents/verification.pdf
//   GET /api/layout-drawings/:id/documents/sheet.pdf
//
// Each route loads its data, maps it into the renderer's in-memory input and
// streams application/pdf. `?status=draft` renders with the DRAFT watermark.
// ────────────────────────────────────────────────────────────────────────────

import { Hono } from "hono";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";
import {
  installations,
  installationPhases,
  installationMilestones,
  installationAssignments,
  installTeams,
  orders,
  type LayoutDrawing,
} from "../../shared/schema";
import { ensurePas13ClassesLoaded } from "../services/pas13Classes";
import { _buildAlignmentReportForOrder } from "./orders";
import { renderPas13Statement } from "../lib/pdf/reports/pas13Statement";
import {
  renderInstallationVerification,
  STANDARD_CHECKLIST,
  type CheckStatus,
  type ChecklistRow,
  type Snag,
  type VerificationZone,
} from "../lib/pdf/reports/installationVerification";
import { renderDrawingSheet, familiesInDoc, type DrawingSheetBase, type RevisionRow } from "../lib/pdf/reports/drawingSheet";
import { fetchImageBytes, sniffImage } from "../lib/pdf/images";
import { parseLayoutDoc, type LayoutDoc } from "../../shared/layout/doc";
import { markupsToDoc } from "../../shared/layout/migrateMarkups";
import { docBounds } from "../../shared/layout/geometry";

const documentsPas13 = new Hono<{ Bindings: Env; Variables: Variables }>();

function pdfResponse(bytes: Uint8Array, filename: string, cache = "private, no-store"): Response {
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": cache,
    },
  });
}

function statusFromQuery(c: { req: { query: (k: string) => string | undefined } }): "DRAFT" | "ISSUED" {
  return (c.req.query("status") || "").toLowerCase() === "draft" ? "DRAFT" : "ISSUED";
}

function safeName(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, "_");
}

// ─── PAS 13 Alignment Statement ────────────────────────────────────────────

documentsPas13.get("/orders/:id/documents/pas13-statement.pdf", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const order = await storage.getOrder(c.req.param("id"));
    if (!order) return c.json({ message: "Order not found" }, 404);
    const user = await storage.getUser(userId);
    if (order.userId !== userId && user?.role !== "admin") return c.json({ message: "Not authorized" }, 403);

    await ensurePas13ClassesLoaded(c.env);
    const report = await _buildAlignmentReportForOrder(c.env, storage, order);
    const appOrigin = c.env.APP_URL || new URL(c.req.url).origin;
    const preparedBy = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined : undefined;
    const out = await renderPas13Statement({ ...report, appOrigin, status: statusFromQuery(c), preparedBy });
    const res = pdfResponse(out.pdf, out.filename, "private, max-age=86400");
    res.headers.set("X-PAS13-Aggregate-Verdict", out.aggregateVerdict);
    res.headers.set("X-PAS13-Worst-Margin-Pct", String(out.worstCaseSafetyMarginPct));
    res.headers.set("X-Document-Reference", out.reference);
    return res;
  } catch (error) {
    console.error("Error rendering PAS 13 alignment statement:", error);
    return c.json({ message: "Failed to render PAS 13 alignment statement" }, 500);
  }
});

// ─── Installation Verification Report ──────────────────────────────────────

const CHECK_KEYWORDS: RegExp[] = [
  /post|centre|center|spacing/i,
  /fixing|anchor|bolt|torque/i,
  /deflection|clearance|clear zone/i,
  /sign/i,
  /floor|slab|surface/i,
];

interface MilestoneLite {
  name: string;
  completed: boolean;
  date: Date | null;
}

/** Map milestones onto the standard checklist: completed → pass, present but open → fail, absent → n.a. */
function checklistFromMilestones(ms: MilestoneLite[]): ChecklistRow[] {
  return STANDARD_CHECKLIST.map((item, i) => {
    const hits = ms.filter((m) => CHECK_KEYWORDS[i].test(m.name));
    let status: CheckStatus = "na";
    let comment: string | undefined;
    if (hits.length) {
      status = hits.every((m) => m.completed) ? "pass" : "fail";
      comment = hits.map((m) => `${m.name}${m.completed ? "" : " (outstanding)"}`).join("; ");
    } else {
      comment = "No milestone recorded";
    }
    return { item, status, comment };
  });
}

function imageRef(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  for (const k of ["url", "imageUrl", "fileUrl", "src", "objectKey"]) {
    const v = e[k];
    if (typeof v === "string" && v) return k === "objectKey" ? `/api/objects/${v}` : v;
  }
  return null;
}

function imageText(entry: unknown): string {
  if (!entry || typeof entry !== "object") return "";
  const e = entry as Record<string, unknown>;
  return ["label", "name", "area", "zone", "category", "type", "phase", "caption", "description"]
    .map((k) => (typeof e[k] === "string" ? (e[k] as string) : ""))
    .join(" ")
    .toLowerCase();
}

documentsPas13.get("/installations/:id/documents/verification.pdf", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const id = c.req.param("id");
    const [install] = await db.select().from(installations).where(eq(installations.id, id)).limit(1);
    if (!install) return c.json({ message: "Installation not found" }, 404);

    const phases = await db
      .select()
      .from(installationPhases)
      .where(eq(installationPhases.installationId, id))
      .orderBy(asc(installationPhases.orderIndex));
    const phaseIds = phases.map((p) => p.id);
    const milestones = phaseIds.length
      ? await db.select().from(installationMilestones).where(inArray(installationMilestones.phaseId, phaseIds))
      : [];
    const assignments = await db.select().from(installationAssignments).where(eq(installationAssignments.installationId, id));
    const teamIds = Array.from(new Set([...assignments.map((a) => a.teamId), ...(phases.map((p) => p.assignedTeamId).filter(Boolean) as string[])]));
    const teams = teamIds.length ? await db.select().from(installTeams).where(inArray(installTeams.id, teamIds)) : [];
    const teamName = (tid: string | null | undefined) => teams.find((t) => t.id === tid)?.name ?? null;

    let order: typeof orders.$inferSelect | null = null;
    if (install.orderId) {
      const [o] = await db.select().from(orders).where(and(eq(orders.id, install.orderId))).limit(1);
      order = o ?? null;
    }

    // Zones: the order's application areas, else one zone for the whole job.
    const areas = Array.isArray(order?.applicationAreas) ? (order!.applicationAreas as Array<Record<string, unknown>>) : [];
    const items = Array.isArray(order?.items) ? (order!.items as Array<Record<string, unknown>>) : [];
    const uploaded = Array.isArray(order?.uploadedImages) ? (order!.uploadedImages as unknown[]) : [];
    const milestoneLite: MilestoneLite[] = milestones.map((m) => ({ name: m.name, completed: m.completed, date: m.date }));
    const checklist = checklistFromMilestones(milestoneLite);

    const zoneDefs: Array<{ name: string; location?: string; proposalRef: string | null }> = areas.length
      ? areas.map((a, i) => ({
          name: (typeof a.operatingZone === "string" && a.operatingZone) || `Zone ${i + 1}`,
          location: typeof a.description === "string" ? a.description : undefined,
          proposalRef: typeof a.operationalZoneImageUrl === "string" ? a.operationalZoneImageUrl : null,
        }))
      : [{ name: install.title, location: install.location ?? undefined, proposalRef: null }];

    const zones: VerificationZone[] = [];
    for (const z of zoneDefs) {
      const zoneKey = z.name.toLowerCase();
      const products = items
        .filter((it) => {
          const loc = `${it.installationLocation ?? ""} ${it.applicationArea ?? ""}`.toLowerCase();
          return areas.length === 0 || loc.includes(zoneKey);
        })
        .map((it) => {
          const qty = typeof it.quantity === "number" ? ` × ${it.quantity}` : "";
          return `${String(it.productName ?? "Product")}${qty}`;
        });
      const installedEntry = uploaded.find((u) => {
        const t = imageText(u);
        return /install/.test(t) && (areas.length === 0 || t.includes(zoneKey));
      });
      const proposalPhoto = z.proposalRef ? await fetchImageBytes(c.env, z.proposalRef) : null;
      const installedRef = installedEntry ? imageRef(installedEntry) : null;
      const asInstalledPhoto = installedRef ? await fetchImageBytes(c.env, installedRef) : null;
      zones.push({
        name: z.name,
        location: z.location,
        products,
        proposalPhoto,
        asInstalledPhoto,
        checklist: checklist.map((r) => ({ ...r })),
      });
    }

    // Snags: delayed / on-hold phases and milestones left open in finished phases.
    const snags: Snag[] = [];
    let n = 1;
    for (const p of phases) {
      if (p.status === "delayed" || p.status === "on_hold") {
        snags.push({
          ref: `S${n++}`,
          zone: p.name,
          description: p.notes?.trim() || `${p.name} phase is ${p.status.replace("_", " ")}`,
          severity: p.status === "delayed" ? "major" : "minor",
          owner: teamName(p.assignedTeamId) ?? "A-SAFE UAE projects",
          due: p.endDate ? p.endDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : undefined,
          status: "open",
        });
      }
      for (const m of milestones.filter((m) => m.phaseId === p.id && !m.completed)) {
        if (p.status !== "completed" && !(m.date && m.date.getTime() < Date.now())) continue;
        snags.push({
          ref: `S${n++}`,
          zone: p.name,
          description: m.description?.trim() || `${m.name} not completed`,
          severity: "minor",
          owner: teamName(p.assignedTeamId) ?? "A-SAFE UAE projects",
          due: m.date ? m.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : undefined,
          status: "open",
        });
      }
    }

    const user = await storage.getUser(userId);
    const preparedBy = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined : undefined;
    const bytes = await renderInstallationVerification(c.env, {
      status: statusFromQuery(c),
      installation: {
        title: install.title,
        customerName: install.customerName,
        location: install.location,
        contactName: install.contactName,
        complexity: install.complexity,
        status: install.status,
        progress: install.progress,
        plannedStart: install.plannedStart,
        plannedEnd: install.plannedEnd,
        actualStart: install.actualStart,
        actualEnd: install.actualEnd,
        notes: install.notes,
      },
      order: order ? { orderNumber: order.orderNumber, projectName: order.projectName } : null,
      phases: phases.map((p) => ({
        name: p.name,
        status: p.status,
        startDate: p.startDate,
        endDate: p.endDate,
        progress: p.progress,
        team: teamName(p.assignedTeamId),
      })),
      zones,
      snags,
      installTeam: teamName(assignments[0]?.teamId) ?? teamName(phases.find((p) => p.assignedTeamId)?.assignedTeamId),
      preparedBy,
    });
    return pdfResponse(bytes, `Installation_Verification-${safeName(order?.orderNumber ?? install.id.slice(0, 8))}.pdf`);
  } catch (error) {
    console.error("Error rendering installation verification report:", error);
    return c.json({ message: "Failed to render installation verification report" }, 500);
  }
});

// ─── Drawing sheet ─────────────────────────────────────────────────────────

function revisionRows(v: unknown): RevisionRow[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({ rev: String(r.rev ?? ""), date: String(r.date ?? ""), notes: String(r.notes ?? "") }));
}

async function loadOverlay(storage: ReturnType<typeof createStorage>, drawing: LayoutDrawing): Promise<LayoutDoc> {
  const parsed = parseLayoutDoc(drawing.document);
  if (parsed) return parsed;
  const rows = await storage.getLayoutMarkups(drawing.id);
  return markupsToDoc(rows, drawing);
}

async function loadBase(env: Env, drawing: LayoutDrawing, overlay: LayoutDoc): Promise<DrawingSheetBase> {
  if (!drawing.fileUrl || drawing.fileUrl === "blank-canvas") {
    const b = docBounds(overlay);
    return { kind: "blank", widthPx: b ? Math.max(1400, b.maxX * 1.05) : 1400, heightPx: b ? Math.max(990, b.maxY * 1.05) : 990 };
  }
  const bytes = await fetchImageBytes(env, drawing.fileUrl, { maxBytes: 30_000_000, timeoutMs: 10_000 });
  if (!bytes) throw new Error(`Base drawing not readable: ${drawing.fileUrl}`);
  const isPdf = drawing.fileType === "pdf" || (bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
  if (isPdf) return { kind: "pdf", bytes };
  if (sniffImage(bytes) === "unknown" && drawing.fileType !== "image") return { kind: "pdf", bytes };
  return { kind: "image", bytes };
}

documentsPas13.get("/layout-drawings/:id/documents/sheet.pdf", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const drawing = await storage.getLayoutDrawing(c.req.param("id"));
    if (!drawing || drawing.deletedAt) return c.json({ message: "Drawing not found" }, 404);
    const user = await storage.getUser(userId);
    if (drawing.userId !== userId && user?.role !== "admin") return c.json({ message: "Not authorized" }, 403);

    const overlay = await loadOverlay(storage, drawing);
    const base = await loadBase(c.env, drawing, overlay);
    const initials = user ? `${(user.firstName ?? "")[0] ?? ""}${(user.lastName ?? "")[0] ?? ""}`.toUpperCase() : "";
    const bytes = await renderDrawingSheet(c.env, {
      base,
      overlay,
      legendFamilies: familiesInDoc(overlay),
      titleBlock: {
        dwgNumber: drawing.dwgNumber,
        revision: drawing.revision,
        date: drawing.drawingDate,
        scale: drawing.drawingScale,
        title: drawing.drawingTitle,
        project: [drawing.projectName, drawing.company, drawing.location].filter(Boolean).join(" — "),
        drawnBy: drawing.author || initials || undefined,
        checkedBy: drawing.checkedBy,
        revisionHistory: revisionRows(drawing.revisionHistory),
        notes: drawing.notesSection,
        status: statusFromQuery(c),
      },
    });
    return pdfResponse(bytes, `${safeName(drawing.dwgNumber || drawing.fileName.replace(/\.[^.]+$/, "") || "drawing")}-sheet.pdf`);
  } catch (error) {
    console.error("Error rendering drawing sheet:", error);
    return c.json({ message: "Failed to render drawing sheet" }, 500);
  }
});

export default documentsPas13;
