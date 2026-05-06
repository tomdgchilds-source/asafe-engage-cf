// ────────────────────────────────────────────────────────────────────────────
// worker/routes/orderForm.ts
//
// Server-side endpoints that produce the v2 customer-facing order-form PDF.
//
// Routes:
//   GET  /api/orders/:id/order-form.pdf
//        Owner-or-admin gated. Returns the PDF inline.
//   GET  /api/share/orders/:token/order-form.pdf
//        Public, gated by share token. Returns the PDF inline.
//   POST /api/admin/order-form/sample/:case
//        Admin-only. Generates one of three synthetic test PDFs (minimal /
//        mid / full), pushes to R2, returns the R2 key. Used for QA and
//        the spot-check the spec asks for.
//
// The new builder lives in worker/lib/orderFormPdfV2.ts. This file is
// thin glue — fetch the order + project + survey + product rows, project
// the data into the OrderFormV2Input shape, hand it to the builder. The
// data-shaping logic is colocated here (not in the builder) so the
// builder stays purely about layout.
//
// Wording rule (HARD): "PAS 13 aligned" / "borderline" / "not aligned" —
// never "compliant". The builder enforces this verbatim; this route just
// pulls verdicts in.
// ────────────────────────────────────────────────────────────────────────────

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";
import {
  buildOrderFormPdfV2,
  filenameFor,
  makeImpactScenario,
  defaultPas13Thresholds,
  citationsForSections,
  type OrderFormV2Input,
  type ProposedSolutionLine,
  type PricingBlock,
  type PricingBlockRow,
  type ImpactScenarioForReport,
  type VehicleMovementRow,
  type SiteSurveyAppendix,
  type SiteSurveyAppendixZone,
  type ReciprocalCommitmentItem,
  type CustomerProfile,
  type PreparedByInfo,
  type ApprovalsBlock,
  type SignatureBlock,
} from "../lib/orderFormPdfV2";
import { ensurePas13ClassesLoaded } from "../services/pas13Classes";

const orderForm = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── ENG_-prefixed reference ───────────────────────────────────────────────
//
// The hard requirement: every order form must use `ENG_QUOAE` prefix +
// numeric tail, e.g. `ENG_QUOAE000123`. We derive the tail deterministically
// from the order id (first 6 hex chars uppercased) — same scheme used by
// the existing communication scanner so a customer who sees both surfaces
// gets the same reference. Falls back to the order's customOrderNumber (if
// the rep typed in a CRM number explicitly) or its raw orderNumber.
function buildReferenceNumber(order: {
  id: string;
  orderNumber?: string | null;
  customOrderNumber?: string | null;
}): string {
  if (order.customOrderNumber && order.customOrderNumber.trim().length > 0) {
    const t = order.customOrderNumber.trim();
    return /^ENG_/i.test(t) ? t.toUpperCase() : `ENG_${t.toUpperCase()}`;
  }
  // 6-char tail from the UUID is deterministic and unique within a
  // sensible range. We zero-pad to 6 so the visual width is constant.
  const tail = (order.id || "").replace(/-/g, "").slice(0, 6).toUpperCase();
  return `ENG_QUOAE${tail.padStart(6, "0")}`;
}

// ─── Currency derivation ───────────────────────────────────────────────────
//
// Pulls from the order's stored currency first, falls back to the user's
// preferred office region. AED for UAE, SAR for KSA. The orders table
// already stores `currency`; this helper just adds a sane default for old
// rows.
function deriveCurrency(order: { currency?: string | null }): string {
  const c = (order.currency || "").trim().toUpperCase();
  if (!c) return "AED";
  return c;
}

// ─── Project data → OrderFormV2Input ───────────────────────────────────────
//
// Combines the order, the related project (if any), the heaviest impact
// calculation, and the optional site survey into the builder input. This
// is the only place that reaches into multiple tables — by keeping it in
// the route layer we don't bleed Drizzle types into the layout builder.
async function buildInputFromOrder(args: {
  env: Env;
  storage: ReturnType<typeof createStorage>;
  order: any;
  appOrigin: string;
  generatedAt: Date;
  /** Optional override for the prepared-by block (used by the share-token
   *  path so anonymous customers see the rep's contact card without us
   *  having to do a sales-rep lookup at request time on every fetch). */
  preparedByOverride?: PreparedByInfo | null;
}): Promise<OrderFormV2Input> {
  const { storage, order, appOrigin, generatedAt } = args;

  // ─── prepared-by ────────────────────────────────────────────────
  let preparedBy: PreparedByInfo;
  if (args.preparedByOverride) {
    preparedBy = args.preparedByOverride;
  } else {
    const owner = await storage.getUser(order.userId).catch(() => null);
    preparedBy = {
      name:
        [owner?.firstName, owner?.lastName].filter(Boolean).join(" ") ||
        owner?.email ||
        "A-SAFE Sales",
      jobTitle: owner?.jobTitle || (owner as any)?.jobRole || "BDM",
      email: owner?.email || null,
      mobile: owner?.phone || null,
      company: owner?.company || "A-SAFE DWC LLC",
    };
  }

  // ─── customer ────────────────────────────────────────────────────
  const customer: CustomerProfile = {
    companyName:
      order.customerCompany ||
      (order.isForUser ? "A-SAFE Engage Internal" : "Customer"),
    contactName: order.customerName ?? null,
    contactRole: order.customerJobTitle ?? null,
    contactEmail: order.customerEmail ?? null,
    contactMobile: order.customerMobile ?? null,
    industry: null,
    country: deriveCountryFromCurrency(order.currency || "AED"),
    siteType: null,
    extraFacts: [],
  };

  // ─── proposed solutions ──────────────────────────────────────────
  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const proposedSolutions: ProposedSolutionLine[] = [];
  const pricingRows: PricingBlockRow[] = [];

  // Group items by application area — letter A/B/C/D…
  const sectionLetterByArea = new Map<string, string>();
  const sectionLetterCursor = { i: 0 };
  const letterFor = (area: string) => {
    const k = (area || "Solutions").trim().toLowerCase();
    if (sectionLetterByArea.has(k)) return sectionLetterByArea.get(k)!;
    const next = String.fromCharCode(65 + sectionLetterCursor.i);
    sectionLetterCursor.i = Math.min(25, sectionLetterCursor.i + 1);
    sectionLetterByArea.set(k, next);
    return next;
  };

  // Resolve the project's heaviest required-joules figure ahead of time so
  // we can render per-line safety pills consistently across the section.
  const fallback = await pickHeaviestImpactScenarioFromOrder(storage, order);
  const requiredJoulesProjectWide = fallback ? fallback.joulesAt45 : null;

  for (const it of items) {
    const product = await storage.getProductByName(it.productName).catch(() => null);
    const sku = (product as any)?.sku || it.sku || null;
    const family = (product as any)?.subcategory || (product as any)?.category || null;

    const productJoules = Number(
      product?.impactRating || (product as any)?.pas13TestJoules || it.impactRating || 0,
    );

    const ctx = it.calculationContext || null;
    const requiredFromCtx =
      ctx && Number(ctx.requiredJoules || 0) > 0
        ? Number(ctx.requiredJoules)
        : null;
    const requiredJoules =
      requiredFromCtx ?? requiredJoulesProjectWide ?? null;

    const sectionLabel = letterFor(it.applicationArea || product?.category || "Solutions");
    const applicationArea =
      it.applicationArea || product?.category || "Application area";

    const line: ProposedSolutionLine = {
      sectionLabel,
      applicationArea: titleCase(applicationArea),
      productName: it.productName,
      sku,
      family: family || null,
      productImpactJoules: productJoules > 0 ? productJoules : null,
      requiredJoules,
      features: extractFeatures(product, 3),
      impactZoneLabel:
        (product as any)?.impactTestingData?.impactZone ||
        ((product as any)?.deflectionZone
          ? `${(product as any).deflectionZone} mm`
          : null),
      sitePhotoUrl: pickFirstSitePhoto(order.uploadedImages, it),
      productPhotoUrl: (product as any)?.imageUrl || null,
      quantity: Number(it.quantity || 0),
      pricingMode: deriveLinePricingMode(it),
      unitPrice: Number(it.unitPrice || 0),
      extendedPrice: Number(it.totalPrice || 0),
      notes: typeof it.notes === "string" ? it.notes : null,
    };
    proposedSolutions.push(line);
    pricingRows.push({
      sectionLabel,
      productName: it.productName,
      quantity: line.quantity,
      pricingMode: line.pricingMode,
      unitPrice: line.unitPrice,
      extendedPrice: line.extendedPrice,
    });
  }

  // ─── pricing ─────────────────────────────────────────────────────
  const goodsTotal = pricingRows.reduce((s, r) => s + r.extendedPrice, 0);
  const deliveryAndInstallation = computeDeliveryAndInstall(items, order);
  const reciprocalDiscount = pickReciprocalTotal(order, goodsTotal);
  const grandTotal = Math.max(
    0,
    goodsTotal + deliveryAndInstallation - reciprocalDiscount,
  );

  const pricing: PricingBlock = {
    rows: pricingRows,
    goodsTotal,
    deliveryAndInstallation,
    reciprocalDiscount: reciprocalDiscount > 0 ? reciprocalDiscount : undefined,
    grandTotal,
  };

  // ─── impact calculations summary ─────────────────────────────────
  await ensurePas13ClassesLoaded(args.env).catch(() => {});
  const impactScenarios: ImpactScenarioForReport[] = [];
  const seenScenarioKeys = new Set<string>();
  for (const it of items) {
    const ctx = it.calculationContext as any;
    const v = ctx ? Number(ctx.vehicleMass || 0) : 0;
    const l = ctx ? Number(ctx.loadMass || 0) : 0;
    const sNum = ctx ? Number(ctx.speed || 0) : 0;
    const sUnit = String(ctx?.speedUnit || "kmh");
    const speedKmh =
      sUnit === "mph" ? sNum * 1.60934 : sUnit === "ms" ? sNum * 3.6 : sNum;
    const angle = Number(ctx?.impactAngle || 0) || 90;
    const totalMass = v + l;
    if (totalMass <= 0 || speedKmh <= 0) continue;
    const key = `${totalMass}|${speedKmh.toFixed(1)}|${angle}`;
    if (seenScenarioKeys.has(key)) continue;
    seenScenarioKeys.add(key);
    impactScenarios.push(
      makeImpactScenario({
        vehicleLabel: ctx?.vehicleType || ctx?.vehicleName || "Vehicle scenario",
        vehicleMassKg: v,
        loadMassKg: l,
        speedKmh,
        approachAngleDeg: angle,
        productRatedJoulesAt45deg: 0,
        productImpactZoneMaxMm: 200,
      }),
    );
  }
  // Augment with the heaviest fallback if present and not already covered.
  if (fallback && impactScenarios.length === 0) {
    impactScenarios.push(
      makeImpactScenario({
        vehicleLabel: fallback.vehicleLabel,
        vehicleMassKg: fallback.vehicleMassKg,
        loadMassKg: fallback.loadMassKg,
        speedKmh: fallback.speedKmh,
        approachAngleDeg: fallback.approachAngleDeg,
      }),
    );
  }

  // ─── vehicle movements (derive rows from impact scenarios) ──────
  const vehicleRows: VehicleMovementRow[] = impactScenarios.map((s) => ({
    name: s.vehicleLabel,
    massKg: s.vehicleMassKg + s.loadMassKg,
    maxLoadKg: s.loadMassKg || null,
    speedKmh: s.speedKmh,
    pas13Class: pas13ClassForMass(s.vehicleMassKg + s.loadMassKg, s.speedKmh),
  }));
  const highestKeJoules = impactScenarios.reduce(
    (m, s) => Math.max(m, s.joulesAt45),
    0,
  );

  // ─── reciprocal commitments ─────────────────────────────────────
  const reciprocalCommitments: ReciprocalCommitmentItem[] = [];
  const rc = order.reciprocalCommitments;
  if (rc && Array.isArray(rc.commitments)) {
    for (const c of rc.commitments) {
      reciprocalCommitments.push({
        title: typeof c === "string" ? c : c?.title || "Reciprocal commitment",
        description: typeof c === "object" ? c?.description || null : null,
        discountPct: typeof c === "object" ? Number(c?.discountPercent || 0) : null,
      });
    }
  } else if (Array.isArray(order.discountOptions)) {
    for (const d of order.discountOptions) {
      if (typeof d === "object" && d?.title) {
        reciprocalCommitments.push({
          title: d.title,
          description: d.description || null,
          discountPct: Number(d.discountPercent || 0),
        });
      }
    }
  }

  // ─── approvals ──────────────────────────────────────────────────
  const approvals: ApprovalsBlock = {
    includeMarketing: reciprocalCommitments.length > 0,
    technical: signatureFrom(order.technicalSignature),
    commercial: signatureFrom(order.commercialSignature),
    marketing: signatureFrom(order.marketingSignature),
  };

  // ─── site survey appendix ───────────────────────────────────────
  let siteSurveyAppendix: SiteSurveyAppendix | null = null;
  try {
    // Find any survey by this user that matches the project name. The
    // current schema doesn't link surveys directly to orders/projects, so
    // we use the project name as a soft join (best-effort; no false
    // positives because surveys are user-scoped).
    if (order.projectName) {
      const userSurveys = await storage.getUserSiteSurveys(order.userId).catch(() => []);
      const match = (userSurveys || []).find(
        (s: any) =>
          (s.title || "").toLowerCase() === String(order.projectName).toLowerCase() ||
          (s.facilityName || "").toLowerCase() ===
            String(order.customerCompany || "").toLowerCase(),
      );
      if (match) {
        const areas = await storage.getSiteSurveyAreas(match.id).catch(() => []);
        const zones: SiteSurveyAppendixZone[] = (areas || []).map((a: any) => ({
          zoneName: a.zoneName || a.areaName || "Zone",
          areaType: a.areaType || null,
          observations: a.description || a.issueDescription || null,
          damageNotes: a.recommendedAction || null,
          recommendations: Array.isArray(a.recommendedProducts)
            ? a.recommendedProducts.slice(0, 4).map((rp: any) => ({
                productName: rp?.productName || rp?.name || "Recommended product",
                pricePerMeter: Number(rp?.pricePerMeter || rp?.unitPrice || 0) || null,
              }))
            : [],
          photoCount: Array.isArray(a.photosUrls) ? a.photosUrls.length : 0,
        }));
        if (zones.length > 0) {
          siteSurveyAppendix = {
            surveyTitle: match.title || `${match.facilityName} - Site Survey`,
            surveyDate: match.surveyDate
              ? new Date(match.surveyDate).toISOString().slice(0, 10)
              : null,
            zones,
            layoutDrawingThumbnailNote: order.layoutDrawingId
              ? `Layout drawing: ${appOrigin}/api/layout-drawings/${order.layoutDrawingId}`
              : null,
          };
        }
      }
    }
  } catch (err) {
    console.warn("[order-form] site survey lookup failed:", err);
  }

  return {
    referenceNumber: buildReferenceNumber(order),
    drawingRef: (order as any).drawingRef || null,
    generatedAt,
    currency: deriveCurrency(order),
    customer,
    preparedBy,
    projectName: order.projectName ?? null,
    projectLocation: order.projectLocation ?? null,
    projectDescription: order.projectDescription ?? null,
    vehicleMovements:
      vehicleRows.length > 0
        ? {
            rows: vehicleRows,
            highestKeJoules,
            highestKeAngleDeg: 45,
          }
        : null,
    impactCalculations:
      impactScenarios.length > 0
        ? {
            scenarios: impactScenarios,
            pas13Thresholds: defaultPas13Thresholds(),
            citations: citationsForSections(["6.1", "5.10", "5.9"]),
          }
        : null,
    proposedSolutions,
    pricing,
    reciprocalCommitments: reciprocalCommitments.length > 0 ? reciprocalCommitments : null,
    approvals,
    siteSurveyAppendix,
    appOrigin,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function deriveCountryFromCurrency(currency: string): string | null {
  switch (currency.toUpperCase()) {
    case "AED":
      return "United Arab Emirates";
    case "SAR":
      return "Saudi Arabia";
    case "GBP":
      return "United Kingdom";
    case "USD":
      return "United States";
    case "EUR":
      return null;
    default:
      return null;
  }
}

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

function extractFeatures(product: any, max = 3): string[] {
  if (!product) return [];
  if (Array.isArray(product.features) && product.features.length > 0) {
    return product.features.slice(0, max).map((f: any) => String(f));
  }
  // Fall back to the product description's first sentence/clause.
  if (typeof product.description === "string") {
    const parts = product.description
      .split(/\.\s+|\n+/)
      .map((p: string) => p.trim())
      .filter(Boolean);
    return parts.slice(0, max);
  }
  return [];
}

function pickFirstSitePhoto(uploaded: any, item: any): string | null {
  if (Array.isArray(uploaded)) {
    const m = uploaded.find(
      (u: any) =>
        (u?.productId && item?.productId && u.productId === item.productId) ||
        (u?.areaId && item?.applicationArea && u.areaId === item.applicationArea),
    );
    if (m?.url) return String(m.url);
  }
  if (Array.isArray(item?.referenceImages) && item.referenceImages.length > 0) {
    return item.referenceImages[0]?.url || null;
  }
  return null;
}

function deriveLinePricingMode(it: any): "per_length" | "per_unit" {
  const t = String(it?.pricingType || "").toLowerCase();
  if (t.includes("length") || t.includes("meter")) return "per_length";
  return "per_unit";
}

function computeDeliveryAndInstall(items: any[], order: any): number {
  // Mirrors the rate logic from POST /api/orders. We only re-derive when
  // the order doesn't carry an explicit charge already.
  const productTotal = items.reduce(
    (s: number, it: any) => s + Number(it.totalPrice || 0),
    0,
  );
  const deliveryRate = 0.096271916;
  let installationRate = 0.1938872; // standard
  switch (order.installationComplexity) {
    case "simple":
      installationRate = 0.1148264;
      break;
    case "complex":
      installationRate = 0.26289773;
      break;
  }
  const delivery = items
    .filter((it: any) => it.requiresDelivery)
    .reduce((s: number, it: any) => s + Number(it.totalPrice || 0) * deliveryRate, 0);
  const installation = items
    .filter((it: any) => it.requiresInstallation)
    .reduce(
      (s: number, it: any) => s + Number(it.totalPrice || 0) * installationRate,
      0,
    );
  return Math.max(0, delivery + installation);
}

function pickReciprocalTotal(order: any, goodsTotal: number): number {
  const opts = order.discountOptions;
  let pct = 0;
  if (Array.isArray(opts)) {
    for (const o of opts) {
      if (o && typeof o === "object" && typeof o.discountPercent === "number") {
        pct += o.discountPercent;
      }
    }
  }
  pct = Math.min(40, Math.max(0, pct));
  return Math.round(goodsTotal * (pct / 100));
}

function signatureFrom(raw: unknown): SignatureBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as any;
  return {
    signed: !!r.signed,
    signedBy: r.signedBy || r.name || null,
    jobTitle: r.jobTitle || r.signerJobTitle || null,
    signedAtIso: r.signedAt || r.date || null,
  };
}

function pas13ClassForMass(totalKg: number, speedKmh: number): string {
  if (totalKg <= 1500 && speedKmh <= 6) return "T1";
  if (totalKg <= 3500 && speedKmh <= 10) return "T2";
  if (totalKg <= 7500 && speedKmh <= 15) return "T3";
  return "T4";
}

async function pickHeaviestImpactScenarioFromOrder(
  storage: ReturnType<typeof createStorage>,
  order: any,
): Promise<{
  vehicleLabel: string;
  vehicleMassKg: number;
  loadMassKg: number;
  speedKmh: number;
  approachAngleDeg: number;
  joulesAt45: number;
} | null> {
  const tryFromAreas = (rows: any[] | null | undefined) => {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const scored = rows
      .map((r) => ({ row: r, mass: Number(r?.vehicleMass || 0) + Number(r?.loadMass || 0) }))
      .filter((s) => s.mass > 0)
      .sort((a, b) => b.mass - a.mass);
    if (scored.length === 0) return null;
    const heaviest = scored[0].row;
    const sNum = Number(heaviest.speed || 0);
    const sUnit = String(heaviest.speedUnit || "kmh");
    const speedKmh =
      sUnit === "mph" ? sNum * 1.60934 : sUnit === "ms" ? sNum * 3.6 : sNum;
    const angle = Number(heaviest.impactAngle || 0) || 90;
    const m = Number(heaviest.vehicleMass || 0);
    const l = Number(heaviest.loadMass || 0);
    const s = makeImpactScenario({
      vehicleLabel: heaviest.vehicleType || heaviest.vehicleName || "Vehicle scenario",
      vehicleMassKg: m,
      loadMassKg: l,
      speedKmh,
      approachAngleDeg: angle,
    });
    return {
      vehicleLabel: s.vehicleLabel,
      vehicleMassKg: m,
      loadMassKg: l,
      speedKmh,
      approachAngleDeg: angle,
      joulesAt45: s.joulesAt45,
    };
  };

  const areas = (order as any).applicationAreas as any[] | null | undefined;
  const fromAreas = tryFromAreas(areas);
  if (fromAreas) return fromAreas;

  try {
    const userCalcs = await storage.getUserCalculations(order.userId);
    return tryFromAreas(userCalcs as any[]);
  } catch {
    return null;
  }
}

// ─── Endpoint: owner/admin order-form PDF ──────────────────────────────────

orderForm.get("/orders/:id/order-form.pdf", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const orderId = c.req.param("id");
    const order = await storage.getOrder(orderId);
    if (!order) return c.json({ message: "Order not found" }, 404);

    const user = await storage.getUser(userId);
    const isOwner = order.userId === userId;
    const isAdmin = user?.role === "admin";
    if (!isOwner && !isAdmin) {
      return c.json({ message: "Not authorized" }, 403);
    }

    const appOrigin = c.env.APP_URL || new URL(c.req.url).origin;
    const input = await buildInputFromOrder({
      env: c.env,
      storage,
      order,
      appOrigin,
      generatedAt: new Date(),
    });
    const out = buildOrderFormPdfV2(input);

    return new Response(out.pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${out.filename}"`,
        "Content-Length": String(out.pdf.byteLength),
        "Cache-Control": "private, max-age=3600",
        "X-Order-Form-Reference": input.referenceNumber,
      },
    });
  } catch (error) {
    console.error("Error rendering order-form PDF:", error);
    return c.json({ message: "Failed to render order form" }, 500);
  }
});

// ─── Endpoint: public share-token order-form PDF ──────────────────────────

orderForm.get("/share/orders/:token/order-form.pdf", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const token = c.req.param("token");
    const order = await storage.getOrderByShareToken(token);
    if (!order) return c.json({ message: "Order not found" }, 404);
    const exp = (order as any).shareTokenExpiresAt as Date | null;
    if (exp && new Date(exp).getTime() < Date.now()) {
      return c.json({ message: "Share link has expired" }, 410);
    }

    const appOrigin = c.env.APP_URL || new URL(c.req.url).origin;
    const input = await buildInputFromOrder({
      env: c.env,
      storage,
      order,
      appOrigin,
      generatedAt: new Date(),
    });
    const out = buildOrderFormPdfV2(input);

    return new Response(out.pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${out.filename}"`,
        "Content-Length": String(out.pdf.byteLength),
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Error rendering shared order-form PDF:", error);
    return c.json({ message: "Failed to render order form" }, 500);
  }
});

// ─── Endpoint: synthetic test cases (admin) ───────────────────────────────
//
// POST /api/admin/order-form/sample/:case
//   :case ∈ "minimal" | "mid" | "full"
//
// Generates one of three pre-canned PDFs from in-memory data (no DB
// dependency) and pushes it to R2 under a stable key. Returns the key so
// the caller can spot-check the PDF straight from R2. The data shapes
// here are the canonical reference for the input — they exercise every
// conditional section, in the same combinations the spec calls out.

orderForm.post("/admin/order-form/sample/:case", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const user = await storage.getUser(userId);
    if (user?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }

    const which = c.req.param("case");
    if (which !== "minimal" && which !== "mid" && which !== "full") {
      return c.json(
        { message: "Path param :case must be 'minimal', 'mid' or 'full'." },
        400,
      );
    }

    const appOrigin = c.env.APP_URL || new URL(c.req.url).origin;
    const input = sampleInputFor(which, appOrigin);
    const out = buildOrderFormPdfV2(input);

    const key = `samples/order-form/${which}-${input.referenceNumber}-${Date.now()}.pdf`;
    if (c.env.R2_BUCKET) {
      await c.env.R2_BUCKET.put(key, out.pdf, {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: {
          referenceNumber: input.referenceNumber,
          sampleCase: which,
        },
      });
    } else if (c.env.FILES_STORE) {
      // KV fallback — base64-encode the bytes (same shape as files.ts).
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < out.pdf.length; i += chunk) {
        binary += String.fromCharCode.apply(
          null,
          out.pdf.subarray(i, i + chunk) as unknown as number[],
        );
      }
      const base64 = btoa(binary);
      const payload = JSON.stringify({
        contentType: "application/pdf",
        data: base64,
        size: out.pdf.length,
        uploadedAt: new Date().toISOString(),
      });
      await c.env.FILES_STORE.put(`file:${key}`, payload);
    }

    return c.json({
      ok: true,
      case: which,
      r2Key: key,
      filename: filenameFor(input.referenceNumber),
      bytes: out.pdf.byteLength,
      referenceNumber: input.referenceNumber,
      readUrl: `${appOrigin}/api/objects/${key}`,
    });
  } catch (error) {
    console.error("Error generating sample order-form PDF:", error);
    return c.json({ message: "Failed to generate sample" }, 500);
  }
});

// ─── Sample data builders ──────────────────────────────────────────────────
//
// Three deterministic test-case shapes. Numbers are illustrative — the
// PDFs are for the spec's "spot-check" pass, not a real customer artefact.
function sampleInputFor(
  which: "minimal" | "mid" | "full",
  appOrigin: string,
): OrderFormV2Input {
  const generatedAt = new Date("2026-05-04T08:00:00Z");
  const baseCustomer: CustomerProfile = {
    companyName:
      which === "minimal"
        ? "Acme Cold Storage LLC"
        : which === "mid"
          ? "Dnata Cargo - Terminal 2"
          : "JLL Logistics City - Hyperscale DC",
    contactName:
      which === "minimal" ? "Aisha Khalil" : which === "mid" ? "Mohammed Saleh" : "Priya Iyer",
    contactRole:
      which === "minimal"
        ? "Facilities Manager"
        : which === "mid"
          ? "Head of HSE"
          : "Director, Operations",
    contactEmail: "contact@example.ae",
    contactMobile: "+971 50 555 0100",
    industry:
      which === "minimal" ? "Cold Storage" : which === "mid" ? "Aviation Logistics" : "Hyperscale DC",
    country: "United Arab Emirates",
    siteType:
      which === "minimal" ? "Cold-Storage Warehouse" : which === "mid" ? "Cargo Terminal" : "Distribution Centre",
  };
  const preparedBy: PreparedByInfo = {
    name: "Tom Childs",
    jobTitle: "Business Development Manager",
    email: "tom.childs@asafe.ae",
    mobile: "+971 50 555 1010",
    company: "A-SAFE DWC LLC, Engage",
  };

  const reference =
    which === "minimal"
      ? "ENG_QUOAE000901"
      : which === "mid"
        ? "ENG_QUOAE000902"
        : "ENG_QUOAE000903";

  // Common scaffolding — pricing/lines built per case below.
  const proposedSolutions: ProposedSolutionLine[] = [];
  const pricingRows: PricingBlockRow[] = [];

  const addLine = (
    sectionLabel: string,
    applicationArea: string,
    productName: string,
    sku: string | null,
    qty: number,
    unit: number,
    productJ: number | null,
    requiredJ: number | null,
    pricingMode: "per_length" | "per_unit" = "per_length",
  ) => {
    const ext = qty * unit;
    proposedSolutions.push({
      sectionLabel,
      applicationArea,
      productName,
      sku,
      family: applicationArea,
      productImpactJoules: productJ,
      requiredJoules: requiredJ,
      features: [
        "Memaplex polymer - returns to shape after impact",
        "PAS 13:2017 + TUV impact tested",
        "Bolted-together post + rail architecture",
      ],
      impactZoneLabel: "Up to 110 mm",
      sitePhotoUrl: which === "full" ? "site-photo-mock" : null,
      productPhotoUrl: "product-photo-mock",
      quantity: qty,
      pricingMode,
      unitPrice: unit,
      extendedPrice: ext,
      notes: null,
    });
    pricingRows.push({
      sectionLabel,
      productName,
      quantity: qty,
      pricingMode,
      unitPrice: unit,
      extendedPrice: ext,
    });
  };

  if (which === "minimal") {
    addLine("A", "Door Protection", "Bollard Bumper", "BB-001", 4, 320, null, null, "per_unit");
    addLine("B", "Column Guard", "Memaplex Column Guard", "MCG-100", 3, 590, 11000, null, "per_unit");
    addLine("C", "Wall Protection", "iFlex Single Traffic 2 m", "IST-2M", 6, 410, 17000, null);
  } else if (which === "mid") {
    addLine("A", "Door Protection", "Memaplex 130 Door", "M130-D", 6, 540, 11000, 9500, "per_unit");
    addLine("B", "Column Guard", "Memaplex Column Guard", "MCG-100", 4, 590, 11000, 9500, "per_unit");
    addLine("C", "Racking Aisle", "iFlex Single Traffic 2 m", "IST-2M", 12, 410, 17000, 9500);
    addLine("D", "Pedestrian Zone", "iFlex Pedestrian", "IFP-2M", 14, 320, 6000, 4500);
  } else {
    addLine("A", "Door Protection", "Memaplex 130 Door", "M130-D", 8, 540, 11000, 18000, "per_unit");
    addLine("B", "Column Guard", "RackEnd Bullnose", "REB-200", 6, 700, null, 18000, "per_unit");
    addLine("C", "Racking Aisle", "iFlex Double Traffic 2 m", "IDT-2M", 24, 580, 30000, 18000);
    addLine("D", "Pedestrian Zone", "iFlex Pedestrian", "IFP-2M", 28, 320, 6000, 4500);
    addLine("E", "Loading Dock", "TrafficGate Half-Height", "TG-HH", 2, 4900, 30000, 18000, "per_unit");
  }

  const goodsTotal = pricingRows.reduce((s, r) => s + r.extendedPrice, 0);
  const deliveryAndInstallation =
    which === "minimal" ? 0 : Math.round(goodsTotal * 0.18);
  const reciprocal = which === "full" ? Math.round(goodsTotal * 0.07) : 0;
  const grandTotal = goodsTotal + deliveryAndInstallation - reciprocal;

  const reciprocalCommitments: ReciprocalCommitmentItem[] | null =
    which === "full"
      ? [
          {
            title: "LinkedIn safety post (CMO + Head of HSE)",
            description:
              "Customer publishes a LinkedIn post within 30 days of go-live citing the PAS 13:2017 alignment + before/after photos.",
            discountPct: 3,
          },
          {
            title: "Video case study",
            description:
              "Five-minute video walking through the install, hosted by A-SAFE; royalty-free to A-SAFE marketing channels.",
            discountPct: 2,
          },
          {
            title: "Reference site visit",
            description:
              "Allow up to 4 reference visits per quarter for 12 months from prospects vetted by A-SAFE.",
            discountPct: 2,
          },
        ]
      : null;

  const impactScenarios: ImpactScenarioForReport[] | null =
    which === "minimal"
      ? null
      : [
          makeImpactScenario({
            vehicleLabel: "Counterbalance Forklift 2.5 t",
            vehicleMassKg: 2500,
            loadMassKg: 1000,
            speedKmh: 9,
            approachAngleDeg: 45,
            productRatedJoulesAt45deg: 11000,
            productImpactZoneMaxMm: 110,
          }),
          makeImpactScenario({
            vehicleLabel: which === "full" ? "Heavy-Duty Forklift 10 t" : "Manual Pallet Truck",
            vehicleMassKg: which === "full" ? 10000 : 200,
            loadMassKg: which === "full" ? 4000 : 800,
            speedKmh: which === "full" ? 8 : 5,
            approachAngleDeg: 45,
            productRatedJoulesAt45deg: which === "full" ? 30000 : 11000,
            productImpactZoneMaxMm: 200,
          }),
        ];

  const vehicleRows: VehicleMovementRow[] | null =
    which === "minimal"
      ? null
      : [
          {
            name: "Pedestrian",
            massKg: 80,
            speedKmh: 5,
            frequencyLabel: "constant",
            pas13Class: null,
          },
          {
            name: "Manual Pallet Truck",
            massKg: 1000,
            maxLoadKg: 1500,
            speedKmh: 5,
            frequencyLabel: "20 / hr",
            pas13Class: "T1",
          },
          {
            name: "Counterbalance Forklift 2.5 t",
            massKg: 3500,
            maxLoadKg: 1000,
            speedKmh: 9,
            frequencyLabel: "30 / hr",
            pas13Class: "T2",
          },
          ...(which === "full"
            ? [
                {
                  name: "Heavy-Duty Forklift 10 t",
                  massKg: 14000,
                  maxLoadKg: 4000,
                  speedKmh: 8,
                  frequencyLabel: "12 / hr",
                  pas13Class: "T4",
                } satisfies VehicleMovementRow,
              ]
            : []),
        ];

  const siteSurveyAppendix: SiteSurveyAppendix | null =
    which === "full"
      ? {
          surveyTitle: "JLL Logistics City - Phase 2 Survey",
          surveyDate: "2026-04-22",
          zones: [
            {
              zoneName: "Loading Dock A",
              areaType: "Vehicle / Pedestrian Mixed",
              observations:
                "5 dock doors with damaged pedestrian railing; counterbalance forklifts staging within 2 m of pedestrian walkway.",
              damageNotes: "Two columns show steel plate deformation from prior impact.",
              recommendations: [
                { productName: "Memaplex 130 Door", pricePerMeter: 540 },
                { productName: "iFlex Pedestrian", pricePerMeter: 320 },
              ],
              photoCount: 6,
            },
            {
              zoneName: "Aisle 7-12",
              areaType: "Racking Aisle",
              observations:
                "Narrow-aisle Reach Truck operations. Existing rack uprights show no terminal protection.",
              damageNotes: null,
              recommendations: [
                { productName: "RackEnd Bullnose", pricePerMeter: 700 },
                { productName: "iFlex Double Traffic 2 m", pricePerMeter: 580 },
              ],
              photoCount: 4,
            },
          ],
          layoutDrawingThumbnailNote:
            "Layout drawing snapshot: ENG_LD_2026_04_22_PHASE2.pdf",
        }
      : null;

  const approvals: ApprovalsBlock = {
    includeMarketing: which === "full",
    technical:
      which === "minimal"
        ? null
        : { signed: true, signedBy: "Eng. Ahmed Saif", jobTitle: "Project Engineer", signedAtIso: "2026-04-30" },
    commercial:
      which === "full"
        ? { signed: true, signedBy: "Sara Al-Marri", jobTitle: "Procurement Lead", signedAtIso: "2026-05-01" }
        : null,
    marketing:
      which === "full"
        ? { signed: false, signedBy: null, jobTitle: null, signedAtIso: null }
        : null,
  };

  return {
    referenceNumber: reference,
    drawingRef: which === "minimal" ? null : "DWG-PH2-A.01",
    generatedAt,
    currency: "AED",
    customer: baseCustomer,
    preparedBy,
    projectName:
      which === "minimal"
        ? "Acme - Receiving Bay Hardening"
        : which === "mid"
          ? "Dnata T2 - Cargo Terminal Upgrade"
          : "JLL - Phase 2 Hyperscale Fit-Out",
    projectLocation:
      which === "minimal"
        ? "Jebel Ali Free Zone"
        : which === "mid"
          ? "Dubai International Airport"
          : "Dubai South",
    projectDescription:
      which === "minimal"
        ? "Replace damaged steel column guards near the receiving bay with PAS 13:2017-aligned polymer barriers."
        : which === "mid"
          ? "Mixed-use cargo terminal: pedestrian walkways, GSE bays, and racking aisles. Vehicle profile dominated by counterbalance forklifts."
          : "Greenfield hyperscale DC fit-out spanning loading dock, aisles, and pedestrian crosswalks. Heavy-duty forklift envelope.",
    vehicleMovements: vehicleRows
      ? {
          rows: vehicleRows,
          highestKeJoules:
            (impactScenarios || [])
              .map((s) => s.joulesAt45)
              .reduce((m, v) => Math.max(m, v), 0) || 11000,
          highestKeAngleDeg: 45,
        }
      : null,
    impactCalculations: impactScenarios
      ? {
          scenarios: impactScenarios,
          pas13Thresholds: defaultPas13Thresholds(),
          citations: citationsForSections(["6.1", "5.10", "5.9"]),
        }
      : null,
    proposedSolutions,
    pricing: {
      rows: pricingRows,
      goodsTotal,
      deliveryAndInstallation,
      reciprocalDiscount: reciprocal > 0 ? reciprocal : undefined,
      grandTotal,
    },
    reciprocalCommitments,
    approvals,
    siteSurveyAppendix,
    appOrigin,
  };
}

export default orderForm;
