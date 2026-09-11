import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";
import {
  sendOrderConfirmationEmail,
  sendOrderSubmittedNotification,
  sendOrderRejectionEmail,
  sendApprovalRequestEmail,
  sendOrderPdfEmail,
} from "../services/email";
import { ensureInstallationForOrder } from "./installations";
import { pas13Verdict, type Pas13Verdict } from "../../shared/pas13Rules";
import { ensurePas13ClassesLoaded } from "../services/pas13Classes";
import {
  buildPas13AlignmentReport,
  filenameFor as pas13ReportFilename,
  type ReportLineItem as Pas13ReportLineItem,
  type VehicleContextForReport,
} from "../lib/pas13AlignmentReportPdf";
import {
  computeTotals,
  normaliseComplexity,
  round2,
  type PricingResult,
} from "../../shared/pricing";
import { getCombinedDiscount } from "../../shared/discountLimits";
import {
  formatMoney,
  orderItemsToPricingLines,
  resolveFxRate,
} from "../lib/money";

// ─── Order number ────────────────────────────────────────────────────────
//
// `ENG_QUOAE` prefix per the rep-feedback spec. The customer-facing
// order-form PDF and the comm-suggestion scanner both render this verbatim,
// so the format is the visible "Order Ref" on every artefact. Scheme:
//
//   ENG_QUOAE  <YYMMDD>  <XXXXX>
//   ↑ prefix   ↑ date    ↑ random tail (5 chars, A-Z0-9)
//
// The date prefix keeps refs roughly chronological in lists; the tail comes
// from crypto.getRandomValues (~60M possibilities/day) and the insert is
// retried on a unique violation so concurrent submits can't collide.
export const ORDER_NUMBER_PREFIX = "ENG_QUOAE";
export const ORDER_NUMBER_MAX_ATTEMPTS = 5;
const ORDER_TAIL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ORDER_TAIL_LENGTH = 5;
// Largest multiple of 36 that fits in a byte; bytes at or above it are
// rejected so `byte % 36` is uniform.
const ORDER_TAIL_UNBIASED_LIMIT = 252;

function cryptoRandomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function generateOrderNumber(
  now: Date = new Date(),
  randomBytes: (n: number) => Uint8Array = cryptoRandomBytes,
): string {
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  let tail = "";
  while (tail.length < ORDER_TAIL_LENGTH) {
    const bytes = randomBytes(ORDER_TAIL_LENGTH * 2);
    for (const b of bytes) {
      if (b >= ORDER_TAIL_UNBIASED_LIMIT) continue;
      tail += ORDER_TAIL_ALPHABET[b % ORDER_TAIL_ALPHABET.length];
      if (tail.length === ORDER_TAIL_LENGTH) break;
    }
    if (bytes.length === 0) break; // defensive: a broken source can't loop forever
  }
  return `${ORDER_NUMBER_PREFIX}${yy}${mm}${dd}${tail}`;
}

/** Postgres unique_violation (23505), as surfaced by Drizzle / neon. */
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; cause?: { code?: unknown }; message?: unknown };
  if (e.code === "23505" || e.cause?.code === "23505") return true;
  return typeof e.message === "string" && /duplicate key|unique constraint/i.test(e.message);
}

/**
 * Runs `insert(orderNumber)` with a fresh number each time, retrying only on
 * a unique violation, up to ORDER_NUMBER_MAX_ATTEMPTS. Any other error is
 * rethrown immediately.
 */
export async function insertWithUniqueOrderNumber<T>(
  insert: (orderNumber: string) => Promise<T>,
  opts: {
    attempts?: number;
    now?: Date;
    randomBytes?: (n: number) => Uint8Array;
  } = {},
): Promise<{ order: T; orderNumber: string; attempts: number }> {
  const max = Math.max(1, opts.attempts ?? ORDER_NUMBER_MAX_ATTEMPTS);
  let lastErr: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    const orderNumber = generateOrderNumber(opts.now ?? new Date(), opts.randomBytes);
    try {
      const order = await insert(orderNumber);
      return { order, orderNumber, attempts: attempt };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Percent from a service-care option's `value` ("5%", "Free" → 0). */
function serviceCarePercent(option: { chargeable?: boolean | null; value?: string | null } | null | undefined): number {
  if (!option || !option.chargeable || typeof option.value !== "string") return 0;
  const m = option.value.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : 0;
}

/** The pricing snapshot persisted on the order (inside reciprocalCommitments). */
function pricingSnapshot(totals: PricingResult, extra: {
  reciprocalDiscountPercent: number;
  partnerDiscountPercent: number;
  socialDiscountPercent: number;
  fxRateAtOrder: number;
  currency: string;
}) {
  return {
    goodsAed: totals.goodsAed,
    deliveryAed: totals.deliveryAed,
    installAed: totals.installAed,
    discountPercentApplied: totals.discountPercentApplied,
    discountAed: totals.discountAed,
    servicePackageAed: totals.servicePackageAed,
    subtotalAed: totals.subtotalAed,
    vatAed: totals.vatAed,
    totalAed: totals.totalAed,
    ...extra,
  };
}

// Order statuses that represent "this order is won and moving towards
// delivery/install". When an order enters any of these, we try to
// auto-create an installation (idempotent on orderId). Kept broad so a
// skip of one status still triggers on the next.
const WON_STATUSES = new Set([
  "approved",
  "processing",
  "in_production",
  "shipped",
  "delivered",
  "installation_in_progress",
  "installed",
  "invoiced",
  "paid",
  "fulfilled",
]);

const orders = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/admin/orders - admin order listing
orders.get("/admin/orders", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const user = await storage.getUser(c.get("user").claims.sub);
    if (user?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }

    const status = c.req.query("status");
    let result;

    if (status && status !== "all") {
      result = await storage.getOrdersByStatus(status);
    } else {
      result = await storage.getAllOrders();
    }

    return c.json(result);
  } catch (error) {
    console.error("Error fetching admin orders:", error);
    return c.json({ message: "Failed to fetch orders" }, 500);
  }
});

// PUT /api/admin/orders/:id/status - admin update order status
orders.put("/admin/orders/:id/status", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const user = await storage.getUser(c.get("user").claims.sub);
    if (user?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }

    const { status } = await c.req.json();
    const orderId = c.req.param("id");
    const updatedOrder = await storage.updateOrder(orderId, {
      status,
    });

    // Auto-create an installation record when the order enters a won
    // lifecycle state. Idempotent on orderId; silent no-op if no
    // install signals on the order. Fire-and-forget so a failure here
    // doesn't block the kanban move.
    if (status && WON_STATUSES.has(String(status))) {
      try {
        const actorId = c.get("user").claims.sub;
        await ensureInstallationForOrder(db, orderId, actorId);
      } catch (err) {
        console.error("[installations] auto-create on order-won failed:", err);
      }
    }

    return c.json(updatedOrder);
  } catch (error) {
    console.error("Error updating order status:", error);
    return c.json({ message: "Failed to update order status" }, 500);
  }
});

// GET /api/orders - list user orders
orders.get("/orders", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const result = await storage.getUserOrders(userId);
    return c.json(result);
  } catch (error) {
    console.error("Error fetching orders:", error);
    return c.json({ message: "Failed to fetch orders" }, 500);
  }
});

// POST /api/orders - create order
orders.post("/orders", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const {
      cartItems,
      isForUser,
      servicePackage,
      discountOptions,
      impactCalculationId,
      customerName,
      customerJobTitle,
      customerCompany,
      customerMobile,
      customerEmail,
      partnerDiscountCode,
      partnerDiscountPercent,
      installationComplexity,
      currency,
      revisionInfo,
      projectName,
      projectLocation,
      projectDescription,
      applicationAreas,
      layoutDrawingId,
      layoutMarkups,
      uploadedImages,
      projectCaseStudies,
      reciprocalCommitments,
      serviceCareDetails,
      customOrderNumber,
      companyLogoUrl,
    } = await c.req.json();

    // ────────────────────────────────────────────────────────────────
    // Money. Everything below is computed from the SERVER's own read of
    // the cart and the user's saved discount / service selections. The
    // client-supplied `cartItems`, `discountOptions`, `servicePackage`
    // and `partnerDiscountPercent` are never used for arithmetic — they
    // only survive as display context on the order row.
    // ────────────────────────────────────────────────────────────────
    const placingUser = await storage.getUser(userId);
    const activeProjectId = (placingUser as any)?.activeProjectId ?? undefined;
    const serverCartItems = await storage.getUserCart(userId, activeProjectId);
    if (!Array.isArray(serverCartItems) || serverCartItems.length === 0) {
      return c.json({ message: "Your cart is empty — add products before creating an order." }, 400);
    }
    if (Array.isArray(cartItems) && cartItems.length !== serverCartItems.length) {
      console.warn(
        `[orders] client sent ${cartItems.length} cart lines, server cart has ${serverCartItems.length}; using server cart`,
      );
    }

    // Reciprocal commitments the user has actually saved (not what the
    // client claims). Sum of the option percentages, uncapped — the cap is
    // applied inside computeTotals via discountLimits.
    const [savedSelections, allDiscountOptions] = await Promise.all([
      storage.getUserDiscountSelections(userId),
      storage.getDiscountOptions(),
    ]);
    const optionById = new Map(allDiscountOptions.map((o) => [o.id, o]));
    const selectedDiscountOptions = savedSelections
      .map((s) => optionById.get(s.discountOptionId))
      .filter((o): o is NonNullable<typeof o> => !!o);
    const reciprocalDiscountPercent = selectedDiscountOptions.reduce(
      (sum, o) => sum + (Number(o.discountPercent) || 0),
      0,
    );

    // Partner code: re-validate server-side; the client's % is ignored.
    let partnerDiscountRaw = 0;
    if (partnerDiscountCode) {
      const validation = await storage.validatePartnerCode(String(partnerDiscountCode), userId);
      if (validation.valid) partnerDiscountRaw = Number(validation.discountPercent) || 0;
    }

    // Service package: the user's saved selection wins; fall back to the
    // option id the client sent, but always read the % from the DB row.
    const [savedService, serviceOptions] = await Promise.all([
      storage.getUserServiceSelection(userId),
      storage.getServiceCareOptions(),
    ]);
    const serviceOptionId =
      savedService?.serviceOptionId || servicePackage?.id || servicePackage?.serviceOptionId || null;
    const serviceOption = serviceOptionId
      ? serviceOptions.find((o) => o.id === serviceOptionId) || null
      : null;

    const complexity = normaliseComplexity(installationComplexity);
    const pricingLines = orderItemsToPricingLines(serverCartItems);

    // First pass without the service package to learn the goods figure the
    // service % applies to; second pass is the real one.
    const goodsOnly = computeTotals({
      lines: pricingLines,
      complexity,
      reciprocalDiscountPercent,
      partnerDiscountPercent: partnerDiscountRaw,
      socialDiscountPercent: 0,
    });
    const servicePackageAed = round2(goodsOnly.goodsAed * (serviceCarePercent(serviceOption) / 100));

    // LinkedIn social reciprocity is an AED amount (capped at 2,500 / 1 %
    // of goods) computed from the user's saved follower count. Express it
    // as a % of goods so it flows through the same cap chain.
    let socialDiscountPercent = 0;
    try {
      const social = await storage.getLinkedInDiscountForCart(userId);
      const data = (social?.linkedinDiscountData ?? null) as { followers?: number; status?: string } | null;
      if (data && data.status !== "removed" && Number(data.followers) > 0 && goodsOnly.goodsAed > 0) {
        const { cappedDiscount } = await storage.calculateLinkedInDiscount(
          Number(data.followers),
          goodsOnly.goodsAed,
        );
        socialDiscountPercent = round2((cappedDiscount / goodsOnly.goodsAed) * 100);
      }
    } catch (err) {
      console.warn("[orders] LinkedIn discount lookup failed (ignored):", err);
    }

    const totals = computeTotals({
      lines: pricingLines,
      complexity,
      reciprocalDiscountPercent,
      partnerDiscountPercent: partnerDiscountRaw,
      socialDiscountPercent,
      servicePackageAed,
      vatPercent: 0, // budgetary order form — VAT is not quoted
    });
    const totalAmount = totals.totalAed;
    const servicePackageCost = totals.servicePackageAed;
    // Partner % actually deducted after the 15 % cap and the 40 % combined
    // ceiling (partner shaved first) — same call computeTotals makes.
    const capped = getCombinedDiscount(reciprocalDiscountPercent, partnerDiscountRaw, totals.goodsAed);
    const partnerDiscountApplied = Math.round(capped.partner);
    const reciprocalDiscountApplied = capped.reciprocal;
    const appliedDiscountPercent = totals.discountPercentApplied;

    const orderCurrency = String(currency || "AED").toUpperCase();
    const fxRateAtOrder = await resolveFxRate(orderCurrency);

    // Enrich cart items with product details including images. We also
    // capture the product row on the enriched item so the PAS 13 pre-flight
    // below doesn't have to round-trip the DB a second time.
    const enrichedCartItems = await Promise.all(
      serverCartItems.map(async (item: any) => {
        const product = await storage.getProductByName(item.productName);
        return {
          ...item,
          imageUrl: product?.imageUrl || null,
          impactRating: product?.impactRating || null,
          category: product?.category || "safety-barriers",
          __product: product || null,
        };
      })
    );

    // ────────────────────────────────────────────────────────────────
    // PAS 13:2017 alignment pre-flight
    // ────────────────────────────────────────────────────────────────
    // For each line item, compute a verdict against the cart line's own
    // calculationContext (what the user saw when adding the product).
    // Fallback: the heaviest vehicle across the user's impact calculations.
    //
    //   aligned      → pass through silently
    //   borderline   → accumulate warnings on pas13Warnings; insert proceeds
    //   not_aligned  → HTTP 409 with a cited error, UNLESS ?override=true
    //                  was passed — in which case we audit-log the override
    //                  reason and proceed, with the warnings persisted.
    //
    // "New going forward": we only check on INSERT. Previously-submitted
    // orders are not retrofitted.
    const override = String(c.req.query("override") || "").toLowerCase() === "true";
    const overrideReason = c.req.query("overrideReason") || null;

    let fallbackContext: {
      vehicleMassKg: number;
      loadMassKg: number;
      speedKmh: number;
      approachAngleDeg: number;
    } | null = null;
    try {
      const userCalcs = await storage.getUserCalculations(userId);
      if (Array.isArray(userCalcs) && userCalcs.length > 0) {
        const heaviest = [...userCalcs].sort((a: any, b: any) => {
          const am = Number(a.vehicleMass || 0) + Number(a.loadMass || 0);
          const bm = Number(b.vehicleMass || 0) + Number(b.loadMass || 0);
          return bm - am;
        })[0] as any;
        const speedNum = Number(heaviest.speed || 0);
        const unit = String(heaviest.speedUnit || "kmh");
        const speedKmh =
          unit === "mph" ? speedNum * 1.60934 : unit === "ms" ? speedNum * 3.6 : speedNum;
        fallbackContext = {
          vehicleMassKg: Number(heaviest.vehicleMass || 0),
          loadMassKg: Number(heaviest.loadMass || 0),
          speedKmh,
          approachAngleDeg: Number(heaviest.impactAngle || 0) || 90,
        };
      }
    } catch (err) {
      console.warn("[pas13] could not resolve heaviest-vehicle fallback:", err);
    }

    const pas13Warnings: string[] = [];
    const pas13Blockers: Array<{
      productName: string;
      summary: string;
      citations: Pas13Verdict["citations"];
      details: Pas13Verdict["details"];
    }> = [];

    // Pull the latest admin-edited T1..T4 thresholds before classifying.
    // Cheap on hot path (cached against KV epoch); soft-fails to seed.
    await ensurePas13ClassesLoaded(c.env);

    for (const item of enrichedCartItems) {
      const product = (item as any).__product;
      const ctx = (item as any).calculationContext as any;
      let vehicleMassKg = 0;
      let loadMassKg = 0;
      let speedKmh = 0;
      let approachAngleDeg = 90;
      if (
        ctx &&
        Number(ctx.vehicleMass || 0) +
          Number(ctx.loadMass || 0) >
          0 &&
        Number(ctx.speed || 0) > 0
      ) {
        vehicleMassKg = Number(ctx.vehicleMass || 0);
        loadMassKg = Number(ctx.loadMass || 0);
        const sNum = Number(ctx.speed || 0);
        const sUnit = String(ctx.speedUnit || "kmh");
        speedKmh =
          sUnit === "mph" ? sNum * 1.60934 : sUnit === "ms" ? sNum * 3.6 : sNum;
        approachAngleDeg = Number(ctx.impactAngle || 0) || 90;
      } else if (fallbackContext) {
        vehicleMassKg = fallbackContext.vehicleMassKg;
        loadMassKg = fallbackContext.loadMassKg;
        speedKmh = fallbackContext.speedKmh;
        approachAngleDeg = fallbackContext.approachAngleDeg;
      } else {
        // No context anywhere — skip pre-flight for this item. We still
        // attach a note so the UI surfaces that the check was skipped.
        pas13Warnings.push(
          `${item.productName}: PAS 13 pre-flight skipped — no vehicle context on cart line or project.`,
        );
        continue;
      }

      const ratedJoules =
        Number(product?.impactRating || 0) ||
        Number(product?.pas13TestJoules || 0) ||
        Number((item as any).impactRating || 0) ||
        0;

      // Best-effort impact-zone read from the product's impactTestingData.
      const impactZoneRaw = product?.impactTestingData?.impactZone || null;
      let impactZoneMm = 200;
      if (typeof impactZoneRaw === "string") {
        const m = impactZoneRaw.match(/(\d{1,5})/g);
        if (m && m.length > 0) {
          const max = Math.max(...m.map((x) => parseInt(x, 10)));
          if (Number.isFinite(max) && max > 0) impactZoneMm = max;
        }
      }
      if (Number(product?.deflectionZone || 0) > 0) {
        impactZoneMm = Number(product.deflectionZone);
      }

      const verdict = pas13Verdict({
        vehicleMassKg,
        loadMassKg,
        speedKmh,
        approachAngleDeg,
        productRatedJoulesAt45deg: ratedJoules,
        productImpactZoneMaxMm: impactZoneMm,
      });

      if (verdict.verdict === "not_aligned") {
        pas13Blockers.push({
          productName: item.productName,
          summary: verdict.summary,
          citations: verdict.citations,
          details: verdict.details,
        });
        pas13Warnings.push(
          `${item.productName}: ${verdict.summary}`,
          ...verdict.warnings.map((w) => `${item.productName}: ${w}`),
        );
      } else if (verdict.verdict === "borderline") {
        pas13Warnings.push(
          `${item.productName}: ${verdict.summary}`,
          ...verdict.warnings.map((w) => `${item.productName}: ${w}`),
        );
      }
    }

    if (pas13Blockers.length > 0 && !override) {
      // Block with HTTP 409 — explicit cited error. UI surfaces the list.
      return c.json(
        {
          message: "One or more items are not PAS 13 aligned for this project's impact context.",
          pas13Blockers,
          pas13Warnings,
          override: {
            hint:
              "Append ?override=true&overrideReason=... to force submit. Rep override is logged in the audit trail.",
          },
        },
        409,
      );
    }

    // Strip the temporary __product before persisting — we don't want to
    // duplicate the entire product row inside orders.items.
    for (const it of enrichedCartItems) {
      delete (it as any).__product;
    }

    // Gather comprehensive project data
    let fullApplicationAreas = applicationAreas;
    let fullLayoutMarkups = layoutMarkups;
    const fullUploadedImages = uploadedImages;
    const fullProjectCaseStudies = projectCaseStudies;

    if (!fullApplicationAreas && impactCalculationId) {
      const userCalculations = await storage.getUserCalculations(userId);
      fullApplicationAreas = userCalculations || [];
    }

    if (layoutDrawingId && !fullLayoutMarkups) {
      const markups = await storage.getLayoutMarkups(layoutDrawingId);
      fullLayoutMarkups = markups || [];
    }

    // Snapshot of the money as computed here, so every later consumer
    // (emails, share view, PDF) can read the figures without re-deriving.
    // `totalDiscountPercent` keeps its historical meaning (the reciprocal
    // % applied); `discountPercentApplied` is the combined figure.
    const snapshot = pricingSnapshot(totals, {
      reciprocalDiscountPercent: reciprocalDiscountApplied,
      partnerDiscountPercent: partnerDiscountApplied,
      socialDiscountPercent,
      fxRateAtOrder,
      currency: orderCurrency,
    });
    const fullReciprocalCommitments = {
      ...(reciprocalCommitments && typeof reciprocalCommitments === "object"
        ? reciprocalCommitments
        : {
            commitments: selectedDiscountOptions,
            explanationText:
              "At A-SAFE, we believe in creating partnerships that benefit both sides. That's why we offer added value through a reciprocal approach meaning if you share your safety successes, such as a testimonial, referrals, or a LinkedIn post, we can recognize your achievements, promote safer work practices, and celebrate your improvements while enhancing the overall value you receive on your project.",
          }),
      totalDiscountPercent: reciprocalDiscountApplied,
      discountPercentApplied: appliedDiscountPercent,
      pricing: snapshot,
    };

    const fullServiceCareDetails =
      serviceCareDetails ||
      (serviceOption
        ? {
            packageName: serviceOption.title,
            packageTier: serviceOption.id,
            services: (servicePackage?.features as unknown[]) || [],
            cost: servicePackageCost,
            chargeable: serviceOption.chargeable,
          }
        : null);

    const orderData = {
      userId,
      customOrderNumber: customOrderNumber || undefined,
      companyLogoUrl: companyLogoUrl || undefined,
      status: "submitted_for_review" as const,
      // Stored in AED. `currency` + `fxRateAtOrder` let consumers display
      // the converted figure without re-fetching a rate.
      totalAmount: totalAmount.toString(),
      currency: orderCurrency,
      fxRateAtOrder: fxRateAtOrder.toString(),
      items: enrichedCartItems || [],
      isForUser: isForUser !== undefined ? isForUser : true,
      servicePackage: serviceOption ?? servicePackage ?? null,
      discountOptions: selectedDiscountOptions,
      impactCalculationId,
      installationComplexity: installationComplexity || "standard",
      revisionCount: revisionInfo?.revisionCount || 0,
      isRevision: revisionInfo?.isRevision || false,
      ...(partnerDiscountCode && partnerDiscountApplied > 0 ? { partnerDiscountCode } : {}),
      ...(partnerDiscountApplied > 0 ? { partnerDiscountPercent: partnerDiscountApplied } : {}),
      ...(revisionInfo?.originalOrderId
        ? { originalOrderId: revisionInfo.originalOrderId }
        : {}),
      ...(revisionInfo?.previousOrderId
        ? { previousOrderId: revisionInfo.previousOrderId }
        : {}),
      ...(projectName ? { projectName } : {}),
      ...(projectLocation ? { projectLocation } : {}),
      ...(projectDescription ? { projectDescription } : {}),
      ...(fullApplicationAreas
        ? { applicationAreas: fullApplicationAreas }
        : {}),
      ...(layoutDrawingId ? { layoutDrawingId } : {}),
      ...(fullLayoutMarkups ? { layoutMarkups: fullLayoutMarkups } : {}),
      ...(fullUploadedImages ? { uploadedImages: fullUploadedImages } : {}),
      ...(fullProjectCaseStudies
        ? { projectCaseStudies: fullProjectCaseStudies }
        : {}),
      ...(fullReciprocalCommitments
        ? { reciprocalCommitments: fullReciprocalCommitments }
        : {}),
      ...(fullServiceCareDetails
        ? { serviceCareDetails: fullServiceCareDetails }
        : {}),
      ...(isForUser
        ? {}
        : {
            customerName,
            customerJobTitle,
            customerCompany,
            customerMobile,
            customerEmail,
          }),
      // PAS 13:2017 pre-flight warnings — null when the order is fully
      // aligned, otherwise an array of per-item messages. Blockers that
      // got overridden are also captured here so the audit trail is
      // complete on the order itself (not just in order_audit_log).
      ...(pas13Warnings.length > 0 ? { pas13Warnings } : {}),
    };

    const { order, orderNumber } = await insertWithUniqueOrderNumber((candidate) =>
      storage.createOrder({ ...orderData, orderNumber: candidate }),
    );

    // Audit-log the PAS 13 override when it fired. The blocker details are
    // captured verbatim so the admin-side review has the full cited reason.
    if (pas13Blockers.length > 0 && override) {
      try {
        await storage.appendOrderAuditLog({
          orderId: order.id,
          eventType: "pas13_override",
          actorUserId: userId,
          details: {
            overrideReason: overrideReason || null,
            blockers: pas13Blockers,
            warnings: pas13Warnings,
          },
        });
      } catch (err) {
        console.warn("[pas13] override audit-log write failed:", err);
      }
    }

    // If a partner code was used, redeem it server-side. redeemPartnerCode()
    // does a conditional increment + audit-row insert, so it enforces the
    // usage cap and produces a trail even if the client bypassed the
    // validation UI. If redemption fails (cap just hit, code deactivated,
    // etc), we DO NOT block the order — we strip the partner discount so
    // downstream invoicing matches a verified redemption.
    let finalTotals = totals;
    if (partnerDiscountCode && partnerDiscountApplied > 0) {
      try {
        const subtotalForAudit = Number.isFinite(totalAmount) ? Number(totalAmount) : null;
        const redeemed = await storage.redeemPartnerCode(
          partnerDiscountCode,
          userId,
          order.id,
          subtotalForAudit
        );
        if (!redeemed) {
          console.warn(
            `Partner code ${partnerDiscountCode} could not be redeemed for order ${order.id} — stripping from order.`
          );
          // Re-price without the partner component so the stored total
          // matches what was actually granted.
          finalTotals = computeTotals({
            lines: pricingLines,
            complexity,
            reciprocalDiscountPercent,
            partnerDiscountPercent: 0,
            socialDiscountPercent,
            servicePackageAed,
            vatPercent: 0,
          });
          await storage.updateOrder(order.id, {
            partnerDiscountCode: null as any,
            partnerDiscountPercent: null as any,
            totalAmount: finalTotals.totalAed.toString(),
            reciprocalCommitments: {
              ...fullReciprocalCommitments,
              discountPercentApplied: finalTotals.discountPercentApplied,
              pricing: pricingSnapshot(finalTotals, {
                reciprocalDiscountPercent: reciprocalDiscountApplied,
                partnerDiscountPercent: 0,
                socialDiscountPercent,
                fxRateAtOrder,
                currency: orderCurrency,
              }),
            },
          });
        }
      } catch (redeemErr) {
        console.error("Partner code redemption failed:", redeemErr);
      }
    }

    // Fire-and-forget activity log
    try {
      c.executionCtx.waitUntil(
        storage.logUserActivity({
          userId,
          activityType: "create_order",
          section: "orders",
          details: { orderNumber, orderId: order.id },
        })
      );
    } catch {}

    // Fire-and-forget notifications — failures must not break order creation.
    // Use waitUntil so the worker keeps running after the response is sent.
    const notificationWork = (async () => {
      try {
        // Resolve email address: explicit customer email, or the placing user's email
        const orderUser = isForUser ? await storage.getUser(userId) : null;
        const emailAddress = customerEmail || orderUser?.email || "";
        const resolvedCustomerName =
          customerName ||
          [orderUser?.firstName, orderUser?.lastName].filter(Boolean).join(" ") ||
          "Customer";

        const itemCount = enrichedCartItems?.length ?? 0;
        const formattedTotal = formatMoney(finalTotals.totalAed, orderCurrency, fxRateAtOrder);

        // ────────────────────────────────────────────────────────────
        // PAS 13 Alignment Report — attach the customer-facing PDF to
        // the confirmation email, AND include a "see download link"
        // fallback in the body so the email still ships if PDF
        // generation or the Resend attachment upload fails.
        //
        // Fire-and-forget pattern: any failure here logs and continues
        // — the confirmation email always sends, with or without the
        // attachment. Spec hard rule: don't break existing email flow.
        // ────────────────────────────────────────────────────────────
        let pas13ReportPdf:
          | {
              filename: string;
              contentBase64: string;
              aggregateLabel: string;
            }
          | undefined;
        let pas13ReportUrl: string | undefined;
        try {
          const appOrigin =
            c.env.APP_URL ||
            `${new URL(c.req.url).origin}`;
          pas13ReportUrl = `${appOrigin}/api/orders/${order.id}/pas13-report.pdf`;
          const reportInput = await _buildAlignmentReportForOrder(
            c.env,
            storage,
            order as any,
          );
          const built = buildPas13AlignmentReport({
            ...reportInput,
            appOrigin,
          });
          const aggregateLabel =
            built.aggregateVerdict === "aligned"
              ? "PAS 13 ALIGNED"
              : built.aggregateVerdict === "borderline"
                ? "BORDERLINE ALIGNMENT"
                : "NOT PAS 13 ALIGNED";
          pas13ReportPdf = {
            filename: built.filename ?? pas13ReportFilename(orderNumber),
            contentBase64: bytesToBase64(built.pdf),
            aggregateLabel,
          };
        } catch (pdfErr) {
          // Don't block the email — the body falls back to the download link.
          console.error("[pas13] alignment-report PDF generation failed:", pdfErr);
        }

        // Send order confirmation to customer
        if (emailAddress) {
          await sendOrderConfirmationEmail(
            c.env,
            {
              to: emailAddress,
              orderNumber,
              totalAmount: formattedTotal,
              itemCount,
              pas13ReportPdf,
              pas13ReportUrl,
            },
            { callerRoute: "/api/orders" },
          );
        }

        // Notify admin team via email (routed by currency)
        await sendOrderSubmittedNotification(c.env, {
          orderNumber,
          customerName: resolvedCustomerName,
          customerEmail: emailAddress,
          totalAmount: formattedTotal,
          currency: orderCurrency,
        });
      } catch (err) {
        console.error("Order notification error (non-blocking):", err);
      }
    })();

    // Use Cloudflare Workers waitUntil to run after response is sent
    c.executionCtx.waitUntil(notificationWork);

    return c.json(order);
  } catch (error) {
    console.error("Error creating order:", error);
    return c.json({ message: "Failed to create order" }, 500);
  }
});

// GET /api/orders/:id - get single order
orders.get("/orders/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const order = await storage.getOrder(c.req.param("id"));
    if (!order) {
      return c.json({ message: "Order not found" }, 404);
    }
    if (order.userId !== userId) {
      return c.json({ message: "Order not found" }, 404);
    }
    return c.json(order);
  } catch (error) {
    console.error("Error fetching order:", error);
    return c.json({ message: "Failed to fetch order" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/orders/:id/pas13-report.pdf
//
// Customer-facing PAS 13 Alignment Report PDF. Re-runs each cart line item
// through pas13Verdict() against the project's vehicle context (heaviest
// vehicle wins if multiple), assembles the PDF server-side, returns
// application/pdf. Auth: order owner OR any admin.
//
// Cache: private, max-age=86400. Underlying data is stable once an order
// is submitted, so a 24h TTL keeps repeat downloads cheap without staling.
// ──────────────────────────────────────────────
orders.get("/orders/:id/pas13-report.pdf", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const orderId = c.req.param("id");

    const order = await storage.getOrder(orderId);
    if (!order) {
      return c.json({ message: "Order not found" }, 404);
    }

    // Auth: owner OR admin can download. Mirrors the audit-log endpoint.
    const user = await storage.getUser(userId);
    const isOwner = order.userId === userId;
    const isAdmin = user?.role === "admin";
    if (!isOwner && !isAdmin) {
      return c.json({ message: "Not authorized" }, 403);
    }

    // Re-run the PAS 13 verdict for each line item. We DO NOT recompute
    // the rule logic here — we delegate to shared/pas13Rules's
    // pas13Verdict(). The PDF builder accepts the verdict objects verbatim.
    await ensurePas13ClassesLoaded(c.env);
    const report = await buildAlignmentReportForOrder(c.env, storage, order);

    // Construct a sensible app-origin so the PDF's deep-links open in a
    // standalone viewer.
    const appOrigin =
      c.env.APP_URL ||
      `${new URL(c.req.url).origin}`;

    const out = buildPas13AlignmentReport({
      ...report,
      appOrigin,
    });

    const filename = pas13ReportFilename(order.orderNumber);

    return new Response(out.pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(out.pdf.byteLength),
        // Stable per-order data → safe to cache in private caches.
        "Cache-Control": "private, max-age=86400",
        "X-PAS13-Aggregate-Verdict": out.aggregateVerdict,
        "X-PAS13-Worst-Margin-Pct": String(out.worstCaseSafetyMarginPct),
      },
    });
  } catch (error) {
    console.error("Error rendering PAS 13 alignment report:", error);
    return c.json({ message: "Failed to render PAS 13 alignment report" }, 500);
  }
});

// ──────────────────────────────────────────────
// buildAlignmentReportForOrder
//
// Resolves an order + its products into the input shape expected by
// buildPas13AlignmentReport(). Used by both the GET endpoint above and
// the email-attachment hook in the order-create flow so the same verdict
// data lands in the PDF and the email attachment.
//
// Heaviest-vehicle-wins selection mirrors the POST /api/orders pre-flight:
// when no per-line calculationContext is set, fall back to the user's
// heaviest impact calculation, then the order's own application-area
// calculations as a last resort. Each line item is rated against the
// SAME vehicle context as the pre-flight that gated the order — so the
// report won't disagree with the gate that let the order through.
// ──────────────────────────────────────────────
async function buildAlignmentReportForOrder(
  env: Env,
  storage: ReturnType<typeof createStorage>,
  order: Awaited<ReturnType<ReturnType<typeof createStorage>["getOrder"]>> & object,
): Promise<{
  orderNumber: string;
  customOrderNumber?: string | null;
  generatedAt: Date;
  customerName?: string | null;
  customerCompany?: string | null;
  projectName?: string | null;
  projectLocation?: string | null;
  vehicleContext: VehicleContextForReport | null;
  lineItems: Pas13ReportLineItem[];
}> {
  // Resolve a fallback vehicle context. Prefer the order's
  // applicationAreas (a project-time impact scenario list); fall back to
  // the placing user's heaviest impact calculation. Either way we pick the
  // heaviest (mass + load) vehicle — same heuristic as POST /api/orders.
  let fallback: VehicleContextForReport | null = null;
  try {
    const areas = (order as any).applicationAreas as any[] | null | undefined;
    const heaviestFromAreas = pickHeaviestImpactScenario(areas);
    if (heaviestFromAreas) fallback = heaviestFromAreas;
  } catch {}
  if (!fallback) {
    try {
      const userCalcs = await storage.getUserCalculations(order.userId);
      const heaviestFromUser = pickHeaviestImpactScenario(userCalcs as any[]);
      if (heaviestFromUser) fallback = heaviestFromUser;
    } catch {}
  }

  const items = Array.isArray(order.items) ? (order.items as any[]) : [];
  const lineItems: Pas13ReportLineItem[] = [];

  for (const item of items) {
    // Pull the product so we can read impactRating / impactZone — same
    // shape POST /api/orders consumed.
    const product = await storage.getProductByName(item.productName).catch(() => null);

    // Per-line context wins over the fallback.
    const ctx = item.calculationContext as any;
    let vehicleMassKg = 0;
    let loadMassKg = 0;
    let speedKmh = 0;
    let approachAngleDeg = 90;
    if (
      ctx &&
      Number(ctx.vehicleMass || 0) + Number(ctx.loadMass || 0) > 0 &&
      Number(ctx.speed || 0) > 0
    ) {
      vehicleMassKg = Number(ctx.vehicleMass || 0);
      loadMassKg = Number(ctx.loadMass || 0);
      const sNum = Number(ctx.speed || 0);
      const sUnit = String(ctx.speedUnit || "kmh");
      speedKmh =
        sUnit === "mph" ? sNum * 1.60934 : sUnit === "ms" ? sNum * 3.6 : sNum;
      approachAngleDeg = Number(ctx.impactAngle || 0) || 90;
    } else if (fallback) {
      vehicleMassKg = fallback.vehicleMassKg;
      loadMassKg = fallback.loadMassKg;
      speedKmh = fallback.speedKmh;
      approachAngleDeg = fallback.approachAngleDeg;
    }

    const ratedJoules =
      Number(product?.impactRating || 0) ||
      Number((product as any)?.pas13TestJoules || 0) ||
      Number(item.impactRating || 0) ||
      0;

    const impactZoneRaw = (product as any)?.impactTestingData?.impactZone || null;
    let impactZoneMm = 200;
    if (typeof impactZoneRaw === "string") {
      const m = impactZoneRaw.match(/(\d{1,5})/g);
      if (m && m.length > 0) {
        const max = Math.max(...m.map((x: string) => parseInt(x, 10)));
        if (Number.isFinite(max) && max > 0) impactZoneMm = max;
      }
    }
    if (Number((product as any)?.deflectionZone || 0) > 0) {
      impactZoneMm = Number((product as any).deflectionZone);
    }

    const verdict = pas13Verdict({
      vehicleMassKg,
      loadMassKg,
      speedKmh,
      approachAngleDeg,
      productRatedJoulesAt45deg: ratedJoules,
      productImpactZoneMaxMm: impactZoneMm,
    });

    lineItems.push({
      productName: item.productName,
      quantity: typeof item.quantity === "number" ? item.quantity : undefined,
      verdict,
    });
  }

  return {
    orderNumber: order.orderNumber,
    customOrderNumber: order.customOrderNumber ?? null,
    generatedAt: new Date(),
    customerName: order.customerName ?? null,
    customerCompany: order.customerCompany ?? null,
    projectName: order.projectName ?? null,
    projectLocation: order.projectLocation ?? null,
    vehicleContext: fallback,
    lineItems,
  };
}

function pickHeaviestImpactScenario(rows: any[] | null | undefined): VehicleContextForReport | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const scored = rows
    .map((r) => ({
      row: r,
      mass: Number(r?.vehicleMass || 0) + Number(r?.loadMass || 0),
    }))
    .filter((s) => s.mass > 0)
    .sort((a, b) => b.mass - a.mass);
  if (scored.length === 0) return null;
  const heaviest = scored[0].row;
  const speedNum = Number(heaviest.speed || 0);
  const unit = String(heaviest.speedUnit || "kmh");
  const speedKmh =
    unit === "mph" ? speedNum * 1.60934 : unit === "ms" ? speedNum * 3.6 : speedNum;
  const vehicleMassKg = Number(heaviest.vehicleMass || 0);
  const loadMassKg = Number(heaviest.loadMass || 0);
  const approachAngleDeg = Number(heaviest.impactAngle || 0) || 90;
  const labelParts: string[] = [];
  if (heaviest.vehicleType || heaviest.vehicleName) {
    labelParts.push(String(heaviest.vehicleType || heaviest.vehicleName));
  } else {
    labelParts.push("Vehicle scenario");
  }
  labelParts.push(`${(vehicleMassKg + loadMassKg).toLocaleString()} kg total`);
  labelParts.push(`${speedKmh.toFixed(1)} km/h`);
  labelParts.push(`${approachAngleDeg}° approach`);
  return {
    label: labelParts.join(" - "),
    vehicleMassKg,
    loadMassKg,
    speedKmh,
    approachAngleDeg,
  };
}

/** Internal helper — exported only for the order-create email hook. */
export async function _buildAlignmentReportForOrder(
  env: Env,
  storage: ReturnType<typeof createStorage>,
  order: Awaited<ReturnType<ReturnType<typeof createStorage>["getOrder"]>> & object,
) {
  return buildAlignmentReportForOrder(env, storage, order);
}

// Workers runtime exposes btoa() but not Buffer; this helper bridges
// Uint8Array → base64 without pulling Node's Buffer in. Resend wants
// the attachment as raw base64 (no data URI prefix).
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[],
    );
  }
  return btoa(binary);
}

// POST /api/orders/:id/sign - sign order (technical or commercial)
orders.post("/orders/:id/sign", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const orderId = c.req.param("id");

    const order = await storage.getOrder(orderId);
    if (!order || order.userId !== userId) {
      return c.json({ message: "Order not found" }, 404);
    }

    const { signatureType, signature, signerJobTitle, signerMobile, signedAt } =
      await c.req.json();

    const signatureData = {
      signed: true,
      signature,
      signerJobTitle,
      signerMobile,
      signedAt,
    };

    if (signatureType === "technical") {
      await storage.updateOrder(orderId, {
        technicalSignature: signatureData,
      });
    } else if (signatureType === "commercial") {
      await storage.updateOrder(orderId, {
        commercialSignature: signatureData,
      });
    } else {
      return c.json({ message: "Invalid signature type" }, 400);
    }

    // Check if both signatures are completed and auto-advance
    const updatedOrder = await storage.getOrder(orderId);
    if (updatedOrder) {
      const techSig = updatedOrder.technicalSignature as any;
      const commSig = updatedOrder.commercialSignature as any;

      if (
        techSig?.signed &&
        commSig?.signed &&
        updatedOrder.status === "pending"
      ) {
        await storage.updateOrder(orderId, {
          status: "submitted_for_review",
        });
      }
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error signing order:", error);
    return c.json({ message: "Failed to sign order" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/orders/:id/approve-section
// Section-level sign-off for Technical / Commercial / Marketing. Separate
// from the legacy /sign endpoint because:
//   * Marketing is a new third section — /sign never knew about it.
//   * We accept richer signer metadata (jobTitle, mobile, display date) and
//     persist a normalized OrderSectionSignature object.
//   * Authorization allows either the order owner OR the customer the order
//     is on behalf of (matched by email), so B2B customers can sign their
//     own authorization block without first becoming the order's creator.
// ──────────────────────────────────────────────
orders.post("/orders/:id/approve-section", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const orderId = c.req.param("id");

    const order = await storage.getOrder(orderId);
    if (!order) {
      return c.json({ message: "Order not found" }, 404);
    }

    // Authorization: owner OR the customer-on-behalf (by email match). We
    // intentionally compare lower-cased + trimmed emails — case differences
    // on case-insensitive mailboxes are routine in the wild and rejecting
    // them would silently lock legit customers out of approving.
    const user = await storage.getUser(userId);
    const isOwner = order.userId === userId;
    const customerEmail = (order.customerEmail || "").trim().toLowerCase();
    const userEmail = (user?.email || "").trim().toLowerCase();
    const isCustomer =
      !!customerEmail && !!userEmail && customerEmail === userEmail;

    if (!isOwner && !isCustomer) {
      return c.json({ message: "Not authorized to approve this order" }, 403);
    }

    const body = await c.req.json<{
      section?: string;
      signedBy?: string;
      jobTitle?: string;
      mobile?: string;
      date?: string;
    }>();

    const section = body.section;
    if (
      section !== "technical" &&
      section !== "commercial" &&
      section !== "marketing"
    ) {
      return c.json(
        { message: "Invalid section — expected technical|commercial|marketing" },
        400,
      );
    }

    const signedBy = (body.signedBy || "").trim();
    const jobTitle = (body.jobTitle || "").trim();
    if (!signedBy || !jobTitle) {
      return c.json(
        { message: "signedBy and jobTitle are required" },
        400,
      );
    }

    // Capture caller IP from Cloudflare's CF-Connecting-IP header when
    // present (populated on the Workers runtime) — falls back to x-forwarded-
    // for so local dev still produces something usable.
    const ipAddress =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      undefined;

    const signature = {
      signed: true as const,
      signedBy,
      jobTitle,
      mobile: body.mobile?.trim() || undefined,
      // Server-authoritative timestamp. Clients may also send a human-readable
      // `date` (e.g. "20 Apr 2026") for display parity with the PDF, stored
      // alongside but never substituted for the ISO timestamp.
      signedAt: new Date().toISOString(),
      date: body.date?.trim() || undefined,
      ipAddress,
    };

    // Route through the shared applySectionApproval helper — same write path
    // as the magic-link consume endpoint so the audit-log stays consistent
    // regardless of whether the approver signed in-app or via an email link.
    const updated = await storage.applySectionApproval({
      orderId,
      section,
      signature,
      actorUserId: userId,
      actorEmail: user?.email || null,
      ipAddress: ipAddress ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    });

    // Legacy user-activity trail — kept alongside the new order_audit_log
    // table so existing dashboards that query user_activity_logs don't go
    // blank. Fire-and-forget: a logging hiccup can't undo a sign-off.
    try {
      c.executionCtx.waitUntil(
        storage.logUserActivity({
          userId,
          activityType: "approve_order_section",
          section: "orders",
          details: { orderId, section, signedBy, jobTitle },
        }),
      );
    } catch {}

    return c.json(updated);
  } catch (error) {
    console.error("Error approving order section:", error);
    return c.json({ message: "Failed to approve section" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/orders/:id/approval-status
// Small convenience read so the live view can poll/refresh just the three
// signatures without re-hydrating the full order payload (which includes
// enriched cart items, layout markups, images, etc.).
// ──────────────────────────────────────────────
orders.get("/orders/:id/approval-status", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const orderId = c.req.param("id");

    const order = await storage.getOrder(orderId);
    if (!order) {
      return c.json({ message: "Order not found" }, 404);
    }

    // Same auth envelope as the write path — owner or customer-by-email.
    const user = await storage.getUser(userId);
    const isOwner = order.userId === userId;
    const customerEmail = (order.customerEmail || "").trim().toLowerCase();
    const userEmail = (user?.email || "").trim().toLowerCase();
    const isCustomer =
      !!customerEmail && !!userEmail && customerEmail === userEmail;
    if (!isOwner && !isCustomer) {
      return c.json({ message: "Not authorized" }, 403);
    }

    const status = await storage.getOrderApprovalStatus(orderId);
    return c.json(status ?? { technical: null, commercial: null, marketing: null });
  } catch (error) {
    console.error("Error fetching approval status:", error);
    return c.json({ message: "Failed to fetch approval status" }, 500);
  }
});

// POST /api/orders/:id/submit-for-review
orders.post("/orders/:id/submit-for-review", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const orderId = c.req.param("id");
    const order = await storage.getOrder(orderId);

    if (!order || order.userId !== userId) {
      return c.json({ message: "Order not found" }, 404);
    }

    const techSig = order.technicalSignature as any;
    const commSig = order.commercialSignature as any;

    if (techSig?.signed && commSig?.signed) {
      await storage.updateOrder(orderId, {
        status: "submitted_for_review",
      });

      return c.json({
        success: true,
        message: "Order submitted for admin review",
      });
    } else {
      return c.json(
        { message: "Both signatures required before submission" },
        400
      );
    }
  } catch (error) {
    console.error("Error submitting order for review:", error);
    return c.json({ message: "Failed to submit order for review" }, 500);
  }
});

// POST /api/orders/:id/restore-to-cart - restore order to cart for revision
orders.post("/orders/:id/restore-to-cart", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const order = await storage.getOrder(c.req.param("id"));

    if (!order) {
      return c.json({ message: "Order not found" }, 404);
    }

    if (order.userId !== userId) {
      return c.json({ message: "Not authorized to access this order" }, 403);
    }


    // Clear existing cart items for the ACTIVE PROJECT only. Without the
    // project filter, restoring an order revision for Project A would wipe
    // cart items the user was building under Project B (cart is now
    // per-project since commit 427b7fd). If the user has no active
    // project, fall back to the old user-wide clear so orphans still drain.
    const user = await storage.getUser(userId);
    const activeProjectId = (user as any)?.activeProjectId ?? undefined;
    const existingCartItems = await storage.getUserCart(userId, activeProjectId);
    for (const item of existingCartItems) {
      await storage.removeFromCart(item.id);
    }

    // Restore each order item to cart
    const orderItems = (order.items || []) as any[];

    for (const orderItem of orderItems) {
      const cartItem = {
        userId,
        productName: orderItem.productName,
        quantity: orderItem.quantity,
        unitPrice: orderItem.unitPrice,
        totalPrice: orderItem.totalPrice,
        category: orderItem.category,
        impactRating: orderItem.impactRating,
        pricingType: orderItem.pricingType,
        pricingTier: orderItem.pricingTier,
        imageUrl: orderItem.imageUrl,
        applicationArea: orderItem.applicationArea,
        columnLength: orderItem.columnLength,
        columnWidth: orderItem.columnWidth,
        lengthSpacers: orderItem.lengthSpacers,
        widthSpacers: orderItem.widthSpacers,
        sidesToProtect: orderItem.sidesToProtect,
        requiresDelivery: orderItem.requiresDelivery,
        deliveryAddress: orderItem.deliveryAddress,
        deliveryLatitude: orderItem.deliveryLatitude,
        deliveryLongitude: orderItem.deliveryLongitude,
        impactCalculationId: orderItem.impactCalculationId,
        calculationContext: orderItem.calculationContext,
        notes: orderItem.notes,
        referenceImages: orderItem.referenceImages,
        installationLocation: orderItem.installationLocation,
        calculatorImages: orderItem.calculatorImages,
        selectedVariant: orderItem.selectedVariant,
      };
      await storage.addToCart(cartItem);
    }

    // Restore service package selection if exists
    const orderServicePackage = order.servicePackage as any;
    if (orderServicePackage) {
      try {
        const serviceOptionId =
          orderServicePackage.id ||
          orderServicePackage.serviceOptionId ||
          orderServicePackage.title;

        if (serviceOptionId) {
          await storage.saveUserServiceSelection(userId, serviceOptionId);
        } else {
          console.warn(
            "Service package could not be restored - invalid serviceOptionId"
          );
        }
      } catch (serviceError) {
        console.warn(
          "Could not restore service package:",
          serviceError
        );
      }
    }

    // Restore discount selections if exist
    const orderDiscountOptions = order.discountOptions as any[];
    if (orderDiscountOptions && orderDiscountOptions.length > 0) {
      try {
        // Collect all discount option IDs to save in bulk
        const discountOptionIds = orderDiscountOptions
          .map((d: any) => d.id || d.discountOptionId || d.title)
          .filter(Boolean);

        if (discountOptionIds.length > 0) {
          await storage.saveUserDiscountSelections(userId, discountOptionIds);
        }
      } catch (discountError) {
        console.warn(
          "Could not restore discount options:",
          discountError
        );
      }
    }

    // Restore project information
    await storage.saveCartProjectInfo(userId, {
      company: (order as any).customerCompany || "",
      location: (order as any).projectLocation || "",
      projectDescription: (order as any).projectDescription || "",
    });

    const revisionInfo = {
      originalOrderId: (order as any).originalOrderId || order.id,
      previousOrderId: order.id,
      revisionCount: ((order as any).revisionCount || 0) + 1,
    };

    return c.json({
      message: "Order successfully restored to cart for revision",
      cartItemsCount: orderItems.length,
      revisionInfo,
    });
  } catch (error) {
    console.error("Error restoring order to cart:", error);

    let errorMessage = "Failed to restore order to cart";
    if (error instanceof Error) {
      if (error.message.includes("service_option_id")) {
        errorMessage =
          "Failed to restore service package. Please reconfigure it in the cart.";
      } else if (error.message.includes("discount_option_id")) {
        errorMessage =
          "Failed to restore discount options. Please reconfigure them in the cart.";
      }
    }

    return c.json({ message: errorMessage }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/orders/:id/reject — admin rejects an order
// ──────────────────────────────────────────────
orders.post("/orders/:id/reject", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const userRecord = await storage.getUser(userId);
    if (userRecord?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }

    const orderId = c.req.param("id");
    const order = await storage.getOrder(orderId);
    if (!order) {
      return c.json({ message: "Order not found" }, 404);
    }

    const { reason } = await c.req.json<{ reason?: string }>();

    const rejectionReason = reason || "Order rejected by admin";

    await storage.updateOrder(orderId, {
      status: "rejected",
      rejectionReason,
    });

    // Fire-and-forget: email the order owner about the rejection
    const notificationWork = (async () => {
      try {
        // Resolve email: explicit customer email on the order, or the owner's account email
        let emailAddress = order.customerEmail || "";
        if (!emailAddress) {
          const orderOwner = await storage.getUser(order.userId);
          emailAddress = orderOwner?.email || "";
        }
        if (emailAddress) {
          await sendOrderRejectionEmail(c.env, {
            to: emailAddress,
            orderNumber: order.orderNumber,
            reason: rejectionReason,
          });
        }
      } catch (err) {
        console.error("Rejection email error (non-blocking):", err);
      }
    })();

    c.executionCtx.waitUntil(notificationWork);

    return c.json({
      success: true,
      message: "Order rejected",
    });
  } catch (error) {
    console.error("Error rejecting order:", error);
    return c.json({ message: "Failed to reject order" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/orders/:id/rejection-notification — notify user of rejection
// ──────────────────────────────────────────────
orders.post("/orders/:id/rejection-notification", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const userRecord = await storage.getUser(userId);
    if (userRecord?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }

    const orderId = c.req.param("id");
    const order = await storage.getOrder(orderId);
    if (!order) {
      return c.json({ message: "Order not found" }, 404);
    }

    // Create an in-app notification for the order owner
    await storage.createNotification({
      userId: order.userId,
      type: "order_rejected",
      title: "Order Rejected",
      message: `Your order #${order.orderNumber || orderId.slice(0, 8)} has been rejected. Please review the feedback and resubmit.`,
      data: { orderId },
    });

    // Fire-and-forget: also send rejection email
    const notificationWork = (async () => {
      try {
        let emailAddress = order.customerEmail || "";
        if (!emailAddress) {
          const orderOwner = await storage.getUser(order.userId);
          emailAddress = orderOwner?.email || "";
        }
        if (emailAddress) {
          await sendOrderRejectionEmail(c.env, {
            to: emailAddress,
            orderNumber: order.orderNumber || orderId.slice(0, 8),
            reason: (order as any).rejectionReason || "Order rejected by admin",
          });
        }
      } catch (err) {
        console.error("Rejection notification email error (non-blocking):", err);
      }
    })();

    c.executionCtx.waitUntil(notificationWork);

    return c.json({
      success: true,
      message: "Rejection notification sent",
    });
  } catch (error) {
    console.error("Error sending rejection notification:", error);
    return c.json({ message: "Failed to send rejection notification" }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Magic-link approval flow
//
// Three sections, approver-by-approver. Each approver either (a) enters the
// next approver's email → we dispatch a new magic-link email, or (b) selects
// "I have authority for the next step too" → we audit-log and let them sign
// inline on their next screen.
//
// Token endpoints are intentionally public (possession-of-token is the only
// auth). The request-approval and revoke-token endpoints require auth.
// ══════════════════════════════════════════════════════════════════════════

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SECTIONS = ["technical", "commercial", "marketing"] as const;
type Section = typeof SECTIONS[number];

// Rate limit on consume attempts per token per hour. Using KV_SESSIONS for
// durability across Workers isolates — it's the only KV already bound and
// a 1-hour TTL key is trivially cheap. We key on the opaque token so an
// attacker who doesn't know it can't pre-burn the budget on someone else's
// token.
const CONSUME_RATE_LIMIT_MAX = 5;
const CONSUME_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

// Returns the next section in the Technical → Commercial → Marketing chain,
// or null if we're already at the last section.
function nextSection(section: Section): Section | null {
  const idx = SECTIONS.indexOf(section);
  if (idx < 0 || idx >= SECTIONS.length - 1) return null;
  return SECTIONS[idx + 1];
}

// 32-char hex (128 bits). Two randomUUID() halves give us 256 bits of entropy
// pre-truncation — plenty of headroom for the 32-char output the spec asked
// for. We prefer getRandomValues over string-munging randomUUID() output so
// the token is dense hex with no hyphens to break URL parsing.
function generateToken(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Mask the local-part of an email for the public token-info endpoint. We only
// keep the first character — enough for an approver to recognise "yes that's
// my inbox" without handing a scraper a full PII-for-order mapping.
function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const head = local[0] ?? "";
  return `${head}${"*".repeat(Math.max(2, local.length - 1))}${domain}`;
}

// Helper for the token-info response. We never return the raw expectedEmail
// on the public endpoint — only the masked form and section/order summary.
function buildTokenValidityReason(
  token: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date } | undefined,
): { valid: true } | { valid: false; reason: "not_found" | "expired" | "used" | "revoked" } {
  if (!token) return { valid: false, reason: "not_found" };
  if (token.revokedAt) return { valid: false, reason: "revoked" };
  if (token.usedAt) return { valid: false, reason: "used" };
  if (token.expiresAt.getTime() < Date.now()) return { valid: false, reason: "expired" };
  return { valid: true };
}

// Shared logic used by both the dispatch endpoint and the auto-dispatch-on-
// consume flow. Creates the token, persists the captured approver email on
// the order, dispatches the email, and writes the email_sent + captured
// audit events.
//
// Returns { tokenId, expiresAt } so the caller can surface the expiry to the
// UI. NEVER returns the raw token value — that only ever goes out via email.
async function dispatchApprovalRequest(
  c: any,
  storage: ReturnType<typeof createStorage>,
  opts: {
    order: any;
    section: Section;
    approverEmail: string;
    approverName?: string;
    createdByUserId: string;
    actorEmail?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<{ tokenId: string; expiresAt: Date }> {
  const { order, section, approverEmail, approverName, createdByUserId } = opts;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  const created = await storage.createApprovalToken({
    token,
    orderId: order.id,
    section,
    expectedEmail: approverEmail.trim(),
    expiresAt,
    usedAt: null as any,
    revokedAt: null as any,
    createdBy: createdByUserId,
  } as any);

  // Persist the captured email on orders.nextApproverEmails[section] so the
  // live view can render "Pending with foo@bar.com" without joining tokens.
  const currentMap = ((order.nextApproverEmails as Record<string, string> | null) || {});
  const nextApproverEmails = { ...currentMap, [section]: approverEmail.trim() };
  await storage.updateOrder(order.id, { nextApproverEmails } as any);

  // Audit: the previous approver / sales rep captured the next approver's
  // email. Separate event-type from email_sent so we can reconstruct which
  // dispatches succeeded vs. merely recorded an intent.
  try {
    await storage.appendOrderAuditLog({
      orderId: order.id,
      eventType: "approver_email_captured",
      section,
      actorUserId: createdByUserId,
      actorEmail: opts.actorEmail ?? null,
      details: { tokenId: created.id, nextApproverEmail: approverEmail.trim(), approverName: approverName ?? null },
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
    });
  } catch (err) {
    console.error("Audit log (approver_email_captured) failed:", err);
  }

  // Build the sales contact block. We resolve from the order owner — the
  // person whose quota is paying for this sale — with conservative fallbacks
  // so the email never goes out with "undefined" in a contact field.
  const ownerUser = await storage.getUser(order.userId);
  const salesContact = {
    name:
      [ownerUser?.firstName, ownerUser?.lastName].filter(Boolean).join(" ") ||
      ownerUser?.email ||
      "A-SAFE Sales",
    email: ownerUser?.email || c.env.EMAIL_FROM || "sales@asafe.ae",
    phone: ownerUser?.phone || undefined,
    // Day-job label (e.g. "BDM") for the sales rep's signature in the
    // approval email. `role` is permissions; `jobRole` is the business-
    // card title the approver will recognise.
    jobRole: (ownerUser as any)?.jobRole || "BDM",
  };

  const appUrl = (c.env.APP_URL || "https://asafe-engage.tom-d-g-childs.workers.dev").replace(/\/$/, "");
  const approvalUrl = `${appUrl}/approve/${token}`;
  const pdfDownloadUrl = `${approvalUrl}?pdf=1`;

  const formattedTotal = formatMoney(
    Number(order.totalAmount || 0),
    order.currency || "AED",
    (order as any).fxRateAtOrder,
  );

  // Fire-and-forget via waitUntil — email delivery is best-effort relative
  // to the token write (the token is now persisted; sales can resend). But
  // we await INSIDE the waitUntil handler so we can append the email_sent
  // audit row AFTER Resend confirms.
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const result = await sendApprovalRequestEmail(
          c.env,
          {
            to: approverEmail.trim(),
            approverName,
            section,
            orderNumber: order.orderNumber,
            customOrderNumber: order.customOrderNumber || undefined,
            clientCompany: order.customerCompany || order.projectName || "your company",
            clientCompanyLogoUrl: order.companyLogoUrl || undefined,
            salesContact,
            grandTotal: formattedTotal,
            currency: order.currency || "AED",
            approvalUrl,
            pdfDownloadUrl,
            expiresAt,
          },
          { callerRoute: "/api/orders/approval-request" },
        );

        await storage.appendOrderAuditLog({
          orderId: order.id,
          eventType: "email_sent",
          section,
          actorUserId: createdByUserId,
          actorEmail: opts.actorEmail ?? null,
          details: {
            tokenId: created.id,
            approverEmail: approverEmail.trim(),
            section,
            ok: result.ok,
            messageId: result.messageId || null,
            error: result.error || null,
          },
          ipAddress: opts.ipAddress ?? null,
          userAgent: opts.userAgent ?? null,
        });
      } catch (err) {
        console.error("Approval email dispatch / audit failed:", err);
      }
    })(),
  );

  return { tokenId: created.id, expiresAt };
}

// ──────────────────────────────────────────────
// POST /api/orders/:id/request-approval
// Auth: sales rep (admin role) OR order owner.
// Dispatches a magic-link email to the specified approver for the given
// section. Never returns the token value — only an opaque tokenId + expiry.
// ──────────────────────────────────────────────
orders.post("/orders/:id/request-approval", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const orderId = c.req.param("id");

    const order = await storage.getOrder(orderId);
    if (!order) {
      return c.json({ message: "Order not found" }, 404);
    }

    const user = await storage.getUser(userId);
    const isOwner = order.userId === userId;
    const isSalesRep = user?.role === "admin";
    if (!isOwner && !isSalesRep) {
      return c.json({ message: "Not authorized to dispatch approvals for this order" }, 403);
    }

    const body = await c.req.json<{ section?: string; approverEmail?: string; approverName?: string }>();
    const section = body.section;
    if (section !== "technical" && section !== "commercial" && section !== "marketing") {
      return c.json({ message: "Invalid section — expected technical|commercial|marketing" }, 400);
    }

    const approverEmail = (body.approverEmail || "").trim();
    // Minimum sanity: must contain an @ and a dot. Anything stricter belongs
    // in the validator library, not a route handler.
    if (!approverEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(approverEmail)) {
      return c.json({ message: "approverEmail is required and must be a valid email" }, 400);
    }

    const ipAddress =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      undefined;

    const result = await dispatchApprovalRequest(c, storage, {
      order,
      section,
      approverEmail,
      approverName: body.approverName?.trim() || undefined,
      createdByUserId: userId,
      actorEmail: user?.email || null,
      ipAddress: ipAddress ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    });

    return c.json({ tokenId: result.tokenId, expiresAt: result.expiresAt.toISOString() });
  } catch (error) {
    console.error("Error dispatching approval request:", error);
    return c.json({ message: "Failed to dispatch approval request" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/approval-tokens/:token
// Public (possession-of-token is auth). Returns non-sensitive summary data
// so the magic-link landing page can render. The approver's email is
// returned MASKED — full email disclosure would turn this into a PII probe.
// Always audit-logs the click, regardless of validity.
// ──────────────────────────────────────────────
orders.get("/approval-tokens/:token", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const tokenStr = c.req.param("token");
    const row = await storage.getApprovalTokenByToken(tokenStr);

    const ipAddress =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const userAgent = c.req.header("user-agent") || null;

    // Log the click even on miss — this is how we'd notice a token-guessing
    // attack. For a miss we have no orderId though, so we skip the audit row
    // (the table is FK-constrained on orderId). Surface in server logs instead.
    if (!row) {
      console.warn(`approval-token lookup: not_found (ip=${ipAddress})`);
      return c.json({ valid: false, reason: "not_found" as const }, 404);
    }

    // Log the click against the real order. actorEmail is the expectedEmail
    // because that's our best guess for who's holding the link.
    try {
      await storage.appendOrderAuditLog({
        orderId: row.orderId,
        eventType: "magic_link_clicked",
        section: row.section,
        actorUserId: null,
        actorEmail: row.expectedEmail,
        details: { tokenId: row.id },
        ipAddress,
        userAgent,
      });
    } catch (err) {
      console.error("Audit log (magic_link_clicked) failed:", err);
    }

    const validity = buildTokenValidityReason(row);
    if (!validity.valid) {
      return c.json({ valid: false, reason: validity.reason });
    }

    const order = await storage.getOrder(row.orderId);
    return c.json({
      valid: true,
      orderId: row.orderId,
      orderNumber: order?.orderNumber || null,
      customOrderNumber: order?.customOrderNumber || null,
      section: row.section,
      expectedEmailMasked: maskEmail(row.expectedEmail),
      expiresAt: row.expiresAt,
    });
  } catch (error) {
    console.error("Error looking up approval token:", error);
    return c.json({ message: "Failed to look up approval token" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/approval-tokens/:token/order-data
//
// Public endpoint — possession-of-token is the auth gate. Returns the
// FULL order data the anonymous magic-link approver needs to generate
// the order-form PDF client-side. Validates the token first (same
// validity checks as the lookup endpoint). Intentionally DOES NOT
// mark the token as used — generating / downloading a PDF shouldn't
// burn the single-use budget; only the approve / reject action does.
//
// Returns a shape compatible with `OrderFormPdfData` so the client
// generator can be called directly without additional fetches.
// ──────────────────────────────────────────────
orders.get("/approval-tokens/:token/order-data", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const tokenStr = c.req.param("token");
    const row = await storage.getApprovalTokenByToken(tokenStr);
    const validity = buildTokenValidityReason(row);
    if (!row || !validity.valid) {
      return c.json(
        { valid: false, reason: (validity as any).reason || "not_found" },
        404,
      );
    }

    const order = await storage.getOrder(row.orderId);
    if (!order) {
      return c.json({ valid: false, reason: "not_found" }, 404);
    }

    // Resolve the sales rep so the PDF's Prepared-By card is accurate
    // (and the contact card matches the email signature). jobRole is
    // decoupled from permission role — we ship the day-job title.
    const ownerUser = await storage.getUser(order.userId);
    const preparedBy = ownerUser
      ? {
          name:
            [ownerUser.firstName, ownerUser.lastName].filter(Boolean).join(" ") ||
            ownerUser.email ||
            "A-SAFE Sales",
          email: ownerUser.email || c.env.EMAIL_FROM || "sales@asafe.ae",
          phone: ownerUser.phone || null,
          jobRole: (ownerUser as any)?.jobRole || "BDM",
          jobTitle: ownerUser.jobTitle || null,
          company: ownerUser.company || "A-SAFE DWC LLC",
        }
      : null;

    return c.json({
      valid: true,
      section: row.section,
      order,
      preparedBy,
    });
  } catch (error) {
    console.error("Error fetching order-data by token:", error);
    return c.json({ message: "Failed to load order data" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/approval-tokens/:token/consume
// Public endpoint — possession-of-token is the auth gate. Rate-limited to
// 5 attempts per token per hour via KV_SESSIONS (see top of file).
//
// Approve path: validates the token, writes the section signature (through
// the shared applySectionApproval helper), marks the token used, and — if
// the approver either captured a next-approver email or declared self-
// authority — dispatches the next magic link or records self-approved-next.
//
// Reject path: moves order to status=rejected, emails the sales rep, audit-
// logs. Token is marked used on reject too (rejection is terminal for this
// leg — a new token must be issued to try again).
// ──────────────────────────────────────────────
orders.post("/approval-tokens/:token/consume", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const tokenStr = c.req.param("token");

    // Rate limit BEFORE doing any DB work — a hot attacker should be bounced
    // at the KV layer. We key on the token string itself (the attacker must
    // know the token to burn its budget; if they do, they've already won).
    const rateKey = `rl:approval-consume:${tokenStr}`;
    const currentCountRaw = await c.env.KV_SESSIONS.get(rateKey);
    const currentCount = currentCountRaw ? parseInt(currentCountRaw, 10) : 0;
    if (currentCount >= CONSUME_RATE_LIMIT_MAX) {
      return c.json(
        { message: "Too many attempts — please wait an hour and try again." },
        429,
      );
    }
    // Increment first: a concurrent attacker can't exploit a race to sneak
    // an extra attempt in, because each successful put bumps the counter.
    await c.env.KV_SESSIONS.put(rateKey, String(currentCount + 1), {
      expirationTtl: CONSUME_RATE_LIMIT_WINDOW_SECONDS,
    });

    const row = await storage.getApprovalTokenByToken(tokenStr);
    const validity = buildTokenValidityReason(row);
    if (!row || !validity.valid) {
      return c.json(
        { valid: false, reason: (validity as any).reason || "not_found" },
        400,
      );
    }

    const body = await c.req.json<{
      signedBy?: string;
      jobTitle?: string;
      mobile?: string;
      nextApproverEmail?: string;
      nextApproverName?: string;
      selfApproveNext?: boolean;
      rejectReason?: string;
      action?: "approve" | "reject";
      date?: string;
    }>();

    const action = body.action;
    if (action !== "approve" && action !== "reject") {
      return c.json({ message: "action must be 'approve' or 'reject'" }, 400);
    }

    const order = await storage.getOrder(row.orderId);
    if (!order) {
      return c.json({ message: "Order not found" }, 404);
    }

    const ipAddress =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    const userAgent = c.req.header("user-agent") || null;

    // ─── Reject path ────────────────────────────────────────────
    // Rejection is *not* a terminal state for the order. The sales rep is
    // told (email + in-app notification) so they can fix whatever the
    // approver flagged and re-dispatch the chain. We:
    //   - clear the rejected section's signature so the section is
    //     re-approvable after the fix,
    //   - leave later sections untouched (Commercial/Marketing signatures
    //     may still be valid once the issue is resolved),
    //   - set the order status to "revision_requested" so the sales rep
    //     sees it in their queue but it isn't locked as "rejected",
    //   - mark the token used (single-use) so the external approver
    //     can't double-submit; sales re-issues a fresh link.
    if (action === "reject") {
      const rejectReason = (body.rejectReason || "").trim() || "Rejected via magic-link approver";
      const signedBy = (body.signedBy || row.expectedEmail).trim();
      const sectionCol =
        row.section === "technical"
          ? "technicalSignature"
          : row.section === "commercial"
            ? "commercialSignature"
            : "marketingSignature";

      await storage.updateOrder(order.id, {
        status: "revision_requested",
        rejectionReason: rejectReason,
        rejectedBy: signedBy,
        rejectionDate: new Date(),
        [sectionCol]: null,
      } as any);

      await storage.markApprovalTokenUsed(row.id);

      try {
        await storage.appendOrderAuditLog({
          orderId: order.id,
          eventType: "rejected",
          section: row.section,
          actorUserId: null,
          actorEmail: row.expectedEmail,
          details: { tokenId: row.id, rejectReason, signedBy },
          ipAddress,
          userAgent,
        });
      } catch (err) {
        console.error("Audit log (rejected) failed:", err);
      }

      // Email + in-app notify the sales rep (order owner).
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const orderOwner = await storage.getUser(order.userId);
            // In-app notification — sales rep sees it on their dashboard.
            if (orderOwner) {
              await storage.createNotification({
                userId: orderOwner.id,
                type: "order_rejected",
                title: `${row.section.charAt(0).toUpperCase() + row.section.slice(1)} approval rejected`,
                message: `Order ${order.orderNumber} — ${signedBy} rejected the ${row.section} section. Reason: ${rejectReason}`,
                relatedId: order.id,
              } as any);
            }
            // Email — sent to the sales rep's own address (NOT the customer),
            // per product spec: rejections go back to sales to fix + re-send.
            const to = orderOwner?.email || "";
            if (to) {
              await sendOrderRejectionEmail(c.env, {
                to,
                orderNumber: order.orderNumber,
                reason: `[${row.section.toUpperCase()} approval] ${rejectReason}\n\nRejected by: ${signedBy}`,
              });
            }
          } catch (err) {
            console.error("Rejection notify (magic-link) failed:", err);
          }
        })(),
      );

      const refreshed = await storage.getOrder(order.id);
      return c.json({ success: true, action: "reject", order: refreshed });
    }

    // ─── Approve path ───────────────────────────────────────────
    const signedBy = (body.signedBy || "").trim();
    const jobTitle = (body.jobTitle || "").trim();
    if (!signedBy || !jobTitle) {
      return c.json({ message: "signedBy and jobTitle are required to approve" }, 400);
    }

    const signature = {
      signed: true as const,
      signedBy,
      jobTitle,
      mobile: body.mobile?.trim() || undefined,
      signedAt: new Date().toISOString(),
      date: body.date?.trim() || undefined,
      ipAddress: ipAddress ?? undefined,
    };

    // Cast through schema's Section type — row.section is varchar.
    const sectionTyped = row.section as Section;

    const updated = await storage.applySectionApproval({
      orderId: order.id,
      section: sectionTyped,
      signature,
      actorUserId: null,
      actorEmail: row.expectedEmail,
      tokenId: row.id,
      ipAddress,
      userAgent,
    });

    // Single-use: consume the token now that the signature is persisted.
    await storage.markApprovalTokenUsed(row.id);

    // Handle next-section routing. Three cases:
    //   1. selfApproveNext=true  → audit-log self_approved_next and stop.
    //      The client will render the next section's form inline.
    //   2. nextApproverEmail set → auto-dispatch the next magic link.
    //   3. Neither              → nothing to do; sales will decide later.
    const next = nextSection(sectionTyped);
    let dispatchedNext: { tokenId: string; expiresAt: string } | null = null;

    if (next && body.selfApproveNext === true) {
      try {
        await storage.appendOrderAuditLog({
          orderId: order.id,
          eventType: "self_approved_next",
          section: next,
          actorUserId: null,
          actorEmail: row.expectedEmail,
          details: { tokenId: row.id, fromSection: sectionTyped, toSection: next },
          ipAddress,
          userAgent,
        });
      } catch (err) {
        console.error("Audit log (self_approved_next) failed:", err);
      }
    } else if (next && body.nextApproverEmail) {
      const nextEmail = body.nextApproverEmail.trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
        // The approver who just signed is "dispatching" on behalf of the
        // order owner — they have no user account. We attribute createdBy
        // to the order owner so the audit trail points to an accountable
        // party, and note the actual actor in actorEmail + details.
        const dispatch = await dispatchApprovalRequest(c, storage, {
          order,
          section: next,
          approverEmail: nextEmail,
          approverName: body.nextApproverName?.trim() || undefined,
          createdByUserId: order.userId,
          actorEmail: row.expectedEmail,
          ipAddress,
          userAgent,
        });
        dispatchedNext = {
          tokenId: dispatch.tokenId,
          expiresAt: dispatch.expiresAt.toISOString(),
        };
      }
    }

    const approvalStatus = await storage.getOrderApprovalStatus(order.id);
    return c.json({
      success: true,
      action: "approve",
      order: updated,
      approvalStatus,
      dispatchedNext,
    });
  } catch (error) {
    console.error("Error consuming approval token:", error);
    return c.json({ message: "Failed to process approval" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/orders/:id/audit-log
// Auth: order owner OR sales rep (admin). Returns newest-first.
// ──────────────────────────────────────────────
orders.get("/orders/:id/audit-log", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const orderId = c.req.param("id");

    const order = await storage.getOrder(orderId);
    if (!order) {
      return c.json({ message: "Order not found" }, 404);
    }

    const user = await storage.getUser(userId);
    const isOwner = order.userId === userId;
    const isSalesRep = user?.role === "admin";
    if (!isOwner && !isSalesRep) {
      return c.json({ message: "Not authorized" }, 403);
    }

    const rows = await storage.getOrderAuditLog(orderId);
    return c.json(rows);
  } catch (error) {
    console.error("Error fetching audit log:", error);
    return c.json({ message: "Failed to fetch audit log" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/orders/:id/revoke-token
// Auth: order owner OR sales rep. Body: {tokenId} OR {section}. Marks the
// matching token revoked. Useful when sales needs to redirect an approval
// to a different email.
// ──────────────────────────────────────────────
orders.post("/orders/:id/revoke-token", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const orderId = c.req.param("id");

    const order = await storage.getOrder(orderId);
    if (!order) {
      return c.json({ message: "Order not found" }, 404);
    }

    const user = await storage.getUser(userId);
    const isOwner = order.userId === userId;
    const isSalesRep = user?.role === "admin";
    if (!isOwner && !isSalesRep) {
      return c.json({ message: "Not authorized" }, 403);
    }

    const body = await c.req.json<{ tokenId?: string; section?: string }>();

    // Resolve token: explicit ID wins; otherwise look up the active token for
    // the given section. This lets UIs with a "cancel pending" button on the
    // section row revoke without having to track the tokenId themselves.
    let tokenRow = null as Awaited<ReturnType<typeof storage.getApprovalTokenById>> | null;
    if (body.tokenId) {
      tokenRow = (await storage.getApprovalTokenById(body.tokenId)) ?? null;
    } else if (body.section) {
      const found = await storage.findActiveApprovalTokenForSection(orderId, body.section);
      tokenRow = found ?? null;
    } else {
      return c.json({ message: "tokenId or section is required" }, 400);
    }

    if (!tokenRow || tokenRow.orderId !== orderId) {
      return c.json({ message: "Token not found for this order" }, 404);
    }
    if (tokenRow.revokedAt) {
      return c.json({ message: "Token already revoked", tokenId: tokenRow.id });
    }
    if (tokenRow.usedAt) {
      return c.json({ message: "Token already used — nothing to revoke" }, 400);
    }

    await storage.revokeApprovalToken(tokenRow.id);

    const ipAddress =
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      null;
    try {
      await storage.appendOrderAuditLog({
        orderId,
        eventType: "token_revoked",
        section: tokenRow.section,
        actorUserId: userId,
        actorEmail: user?.email || null,
        details: { tokenId: tokenRow.id, revokedApproverEmail: tokenRow.expectedEmail },
        ipAddress,
        userAgent: c.req.header("user-agent") ?? null,
      });
    } catch (err) {
      console.error("Audit log (token_revoked) failed:", err);
    }

    return c.json({ success: true, tokenId: tokenRow.id });
  } catch (error) {
    console.error("Error revoking approval token:", error);
    return c.json({ message: "Failed to revoke token" }, 500);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Order lifecycle v2 — status transitions, share-link, email-to-customer,
// admin kanban. Additive to the legacy PUT /admin/orders/:id/status flow;
// new clients should prefer the PATCH endpoint below so the transition is
// enforced server-side and an audit-log entry is always written.
// ══════════════════════════════════════════════════════════════════════════

// The v2 lifecycle taxonomy. Persisted in orders.status. The legacy values
// (pending, submitted_for_review, processing, …) still exist in historical
// rows — the PATCH endpoint only accepts transitions between the v2 values,
// but queries over the table tolerate either.
const LIFECYCLE_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "in_production",
  "delivered",
  "installed",
  "invoiced",
  "paid",
  "cancelled",
] as const;
type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

// Role-gated transition table. Each `from` lists the allowed `to` values;
// attempts outside this table are rejected with 400. We encode "ANY →
// cancelled" explicitly rather than as a wildcard so the check is a simple
// lookup — keeps the authorization logic boring.
//
// Keyed as "from": { to: requiredRole }, where requiredRole is "owner" or
// "admin". "owner" means order.userId === session user.
const ALLOWED_TRANSITIONS: Record<
  string,
  Partial<Record<LifecycleStatus, "owner" | "admin">>
> = {
  draft: { submitted: "owner", cancelled: "admin" },
  submitted: { approved: "admin", cancelled: "admin" },
  approved: { in_production: "admin", cancelled: "admin" },
  in_production: { delivered: "admin", cancelled: "admin" },
  delivered: { installed: "admin", cancelled: "admin" },
  installed: { invoiced: "admin", cancelled: "admin" },
  invoiced: { paid: "admin", cancelled: "admin" },
  paid: { cancelled: "admin" },
  // Legacy statuses — treat as "submitted" for transition purposes so
  // in-flight orders can still progress. Admins can move anything to
  // approved / cancelled; owners can move back to submitted.
  pending: { submitted: "owner", approved: "admin", cancelled: "admin" },
  submitted_for_review: { approved: "admin", cancelled: "admin", in_production: "admin" },
  processing: { approved: "admin", in_production: "admin", cancelled: "admin" },
  rejected: { submitted: "owner", cancelled: "admin" },
  revision_requested: { submitted: "owner", cancelled: "admin" },
};

function isLifecycleStatus(v: unknown): v is LifecycleStatus {
  return typeof v === "string" && (LIFECYCLE_STATUSES as readonly string[]).includes(v);
}

// 16-char hex. Uses getRandomValues so the source of entropy is the runtime's
// CSPRNG (required for bearer-token material in the Workers runtime).
function hex16(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ──────────────────────────────────────────────
// PATCH /api/orders/:id/status
// Role-gated transitions. Owner can submit a draft; admins run the rest
// of the chain. Appends an "status_change" audit-log entry with before/
// after + optional note.
// ──────────────────────────────────────────────
orders.patch("/orders/:id/status", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const orderId = c.req.param("id");

    const order = await storage.getOrder(orderId);
    if (!order) {
      return c.json({ message: "Order not found" }, 404);
    }

    const user = await storage.getUser(userId);
    const isAdmin = user?.role === "admin";
    const isOwner = order.userId === userId;

    const body = await c.req.json<{ status?: string; note?: string }>();
    const nextStatus = body.status;
    if (!isLifecycleStatus(nextStatus)) {
      return c.json(
        {
          message: `Invalid status — expected one of ${LIFECYCLE_STATUSES.join(", ")}`,
        },
        400,
      );
    }

    const currentStatus = (order.status || "draft") as string;
    const allowedFrom = ALLOWED_TRANSITIONS[currentStatus];
    const requiredRole = allowedFrom?.[nextStatus];
    if (!requiredRole) {
      return c.json(
        { message: `Transition ${currentStatus} → ${nextStatus} is not allowed` },
        400,
      );
    }

    // Authorization — "owner" transitions also allow admins (admins can do
    // anything an owner can), but "admin" transitions do NOT allow owners.
    if (requiredRole === "admin" && !isAdmin) {
      return c.json({ message: "Admin access required for this transition" }, 403);
    }
    if (requiredRole === "owner" && !isOwner && !isAdmin) {
      return c.json({ message: "Only the order owner can perform this transition" }, 403);
    }

    const now = new Date();
    const updated = await storage.updateOrder(orderId, {
      status: nextStatus,
      statusChangedAt: now,
      statusChangedBy: userId,
    } as any);

    // Audit log — append before returning so the client sees the new state
    // alongside a written history. Failure here is non-fatal (DB/network
    // hiccup shouldn't undo a status change), but we surface in server logs.
    try {
      const ipAddress =
        c.req.header("cf-connecting-ip") ||
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
        null;
      await storage.appendOrderAuditLog({
        orderId,
        eventType: "status_change",
        section: null as any,
        actorUserId: userId,
        actorEmail: user?.email || null,
        details: {
          from: currentStatus,
          to: nextStatus,
          note: body.note?.trim() || null,
        },
        ipAddress,
        userAgent: c.req.header("user-agent") || null,
      } as any);
    } catch (err) {
      console.error("Audit log (status_change) failed:", err);
    }

    return c.json(updated);
  } catch (error) {
    console.error("Error patching order status:", error);
    return c.json({ message: "Failed to update order status" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/orders/:id/share-link — owner-only
// Generates a high-entropy share token with a configurable TTL. Returns
// the URL so the UI can copy it straight to clipboard.
// ──────────────────────────────────────────────
orders.post("/orders/:id/share-link", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const orderId = c.req.param("id");

    const order = await storage.getOrder(orderId);
    if (!order) {
      return c.json({ message: "Order not found" }, 404);
    }
    if (order.userId !== userId) {
      return c.json({ message: "Only the order owner can create a share link" }, 403);
    }

    const body = await c.req
      .json<{ expiresInDays?: number }>()
      .catch(() => ({}) as { expiresInDays?: number });

    // Clamp to 1..90 days. Default 30. We coerce via Number() rather than
    // parseInt so "0.5" becomes 0 and gets clamped — safer than letting a
    // decimal day become a token that expires in hours.
    const rawDays = Number(body.expiresInDays);
    const days = Math.max(
      1,
      Math.min(90, Number.isFinite(rawDays) && rawDays > 0 ? Math.floor(rawDays) : 30),
    );

    // Token = uuid + "-" + 16 hex chars. Combined ~160 bits of entropy.
    const token = `${crypto.randomUUID()}-${hex16()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    await storage.updateOrder(orderId, {
      shareToken: token,
      shareTokenCreatedAt: now,
      shareTokenCreatedBy: userId,
      shareTokenExpiresAt: expiresAt,
    } as any);

    const appUrl = (c.env.APP_URL || "https://asafe-engage.tom-d-g-childs.workers.dev").replace(
      /\/$/,
      "",
    );
    const url = `${appUrl}/share/order/${token}`;

    return c.json({ token, url, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    console.error("Error creating share link:", error);
    return c.json({ message: "Failed to create share link" }, 500);
  }
});

// ──────────────────────────────────────────────
// DELETE /api/orders/:id/share-link — owner-only. Nulls out all 4 cols.
// ──────────────────────────────────────────────
orders.delete("/orders/:id/share-link", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const orderId = c.req.param("id");

    const order = await storage.getOrder(orderId);
    if (!order) {
      return c.json({ message: "Order not found" }, 404);
    }
    if (order.userId !== userId) {
      return c.json({ message: "Only the order owner can revoke a share link" }, 403);
    }

    await storage.updateOrder(orderId, {
      shareToken: null,
      shareTokenCreatedAt: null,
      shareTokenCreatedBy: null,
      shareTokenExpiresAt: null,
    } as any);

    return c.json({ success: true });
  } catch (error) {
    console.error("Error revoking share link:", error);
    return c.json({ message: "Failed to revoke share link" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/public/orders/:token — NO auth required
//
// Returns a sanitised read-only view of an order for the anonymous
// customer behind a share link. We explicitly strip everything that
// could leak PII or internal workflow state: customer email/mobile,
// internal notes, magic-link tokens, full reciprocal commitments
// detail (we surface only the total amount), any ...Token or
// ...Secret field.
// ──────────────────────────────────────────────
orders.get("/public/orders/:token", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const tokenStr = c.req.param("token");
    const order = await storage.getOrderByShareToken(tokenStr);
    if (!order) {
      return c.json({ message: "Link expired or revoked" }, 404);
    }

    const expires = (order as any).shareTokenExpiresAt as Date | null;
    if (expires && new Date(expires).getTime() < Date.now()) {
      return c.json({ message: "Link expired or revoked" }, 410);
    }

    // Sanitise: only surface fields that belong on the customer's side.
    // Reciprocal commitments kept as `{ totalDiscountPercent }` only — the
    // detail block (per-commitment promises) is internal.
    const reciprocal = (order as any).reciprocalCommitments as
      | { totalDiscountPercent?: number }
      | null
      | undefined;

    const items = Array.isArray(order.items) ? order.items : [];
    const sanitisedItems = (items as any[]).map((item: any) => {
      // Strip any field that smells like a token/secret; belt-and-suspenders
      // because items is a freeform jsonb.
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(item || {})) {
        if (/token|secret/i.test(k)) continue;
        cleaned[k] = v;
      }
      return cleaned;
    });

    // Recompute the money from the order's own line snapshot with the one
    // shared pricing module. The sanitiser is the only place that hits the
    // customer so the math must be deterministic and match the PDF.
    const snapshot = (reciprocal as any)?.pricing as
      | { reciprocalDiscountPercent?: number; partnerDiscountPercent?: number; socialDiscountPercent?: number }
      | undefined;
    const publicTotals = computeTotals({
      lines: orderItemsToPricingLines(sanitisedItems),
      complexity: normaliseComplexity(order.installationComplexity),
      reciprocalDiscountPercent: Number(snapshot?.reciprocalDiscountPercent ?? reciprocal?.totalDiscountPercent ?? 0),
      partnerDiscountPercent: Number(snapshot?.partnerDiscountPercent ?? order.partnerDiscountPercent ?? 0),
      socialDiscountPercent: Number(snapshot?.socialDiscountPercent ?? 0),
      servicePackageAed: Number((order.serviceCareDetails as any)?.cost ?? 0),
      vatPercent: 0,
    });
    const subtotal = publicTotals.goodsAed;
    const deliveryCharge = publicTotals.deliveryAed;
    const installationCharge = publicTotals.installAed;
    const fxRateAtOrder = (order as any).fxRateAtOrder ?? null;

    return c.json({
      isPublicView: true,
      orderNumber: order.orderNumber,
      customOrderNumber: order.customOrderNumber,
      customerCompany: order.customerCompany,
      customerName: order.customerName,
      // Deliberately omit: customerEmail, customerMobile, internal notes.
      orderDate: order.orderDate,
      status: order.status,
      statusChangedAt: (order as any).statusChangedAt,
      // All money below is AED; multiply by fxRateAtOrder to show `currency`.
      currency: order.currency,
      fxRateAtOrder,
      subtotal,
      grandTotal: Number(order.totalAmount) || publicTotals.totalAed,
      totalAmount: order.totalAmount,
      formattedTotal: formatMoney(
        Number(order.totalAmount) || publicTotals.totalAed,
        order.currency,
        fxRateAtOrder,
      ),
      deliveryCharge,
      installationCharge,
      discountPercentApplied: publicTotals.discountPercentApplied,
      discountAmount: publicTotals.discountAed,
      installationComplexity: order.installationComplexity,
      items: sanitisedItems,
      companyLogoUrl: order.companyLogoUrl,
      projectName: order.projectName,
      projectLocation: order.projectLocation,
      projectDescription: order.projectDescription,
      servicePackage: order.servicePackage,
      serviceCareDetails: order.serviceCareDetails,
      applicationAreas: order.applicationAreas,
      layoutMarkups: order.layoutMarkups,
      uploadedImages: order.uploadedImages,
      reciprocalCommitments: reciprocal
        ? { totalDiscountPercent: reciprocal.totalDiscountPercent || 0 }
        : null,
      approvalStatus: {
        technical: (order.technicalSignature as any)?.signed ? "approved" : "pending",
        commercial: (order.commercialSignature as any)?.signed ? "approved" : "pending",
        marketing: (order.marketingSignature as any)?.signed ? "approved" : "pending",
      },
      shareTokenExpiresAt: (order as any).shareTokenExpiresAt,
    });
  } catch (error) {
    console.error("Error loading public order view:", error);
    return c.json({ message: "Failed to load order" }, 500);
  }
});

// ──────────────────────────────────────────────
// POST /api/orders/:id/email — owner-only
// Body: { to?, ccSelf?, pdfBase64 }. Client generates the PDF and hands
// us the base64 bytes so we can attach via Resend.
// ──────────────────────────────────────────────
orders.post("/orders/:id/email", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const orderId = c.req.param("id");

    const order = await storage.getOrder(orderId);
    if (!order) {
      return c.json({ message: "Order not found" }, 404);
    }
    if (order.userId !== userId) {
      return c.json({ message: "Only the order owner can email this order" }, 403);
    }

    const body = await c.req.json<{
      to?: string;
      ccSelf?: boolean;
      pdfBase64?: string;
    }>();

    const to = (body.to || order.customerEmail || "").trim();
    if (!to) {
      return c.json(
        { message: "No recipient — provide `to` or set customerEmail on the order" },
        400,
      );
    }
    if (!body.pdfBase64) {
      return c.json({ message: "pdfBase64 is required" }, 400);
    }

    const ownerUser = await storage.getUser(order.userId);
    const repName =
      [ownerUser?.firstName, ownerUser?.lastName].filter(Boolean).join(" ") ||
      ownerUser?.email ||
      null;
    const repEmail = ownerUser?.email || null;

    // Share URL — surfaces only if there's an active, unexpired share token.
    const appUrl = (c.env.APP_URL || "https://asafe-engage.tom-d-g-childs.workers.dev").replace(
      /\/$/,
      "",
    );
    const tokenExp = (order as any).shareTokenExpiresAt as Date | null;
    const shareUrl =
      order.shareToken && (!tokenExp || new Date(tokenExp).getTime() > Date.now())
        ? `${appUrl}/share/order/${order.shareToken}`
        : null;

    const displayRef = order.customOrderNumber || order.orderNumber;

    const result = await sendOrderPdfEmail({
      to,
      customerName: order.customerName ?? null,
      orderRef: displayRef,
      customerCompany: order.customerCompany ?? null,
      repName,
      repEmail,
      shareUrl,
      pdfBase64: body.pdfBase64,
      pdfFilename: `A-SAFE_Order_${displayRef.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`,
      env: {
        RESEND_API_KEY: c.env.RESEND_API_KEY,
        EMAIL_FROM: c.env.EMAIL_FROM,
        ADMIN_NOTIFICATION_EMAILS: c.env.ADMIN_NOTIFICATION_EMAILS,
      },
    });

    // Copy-to-self: send the same message to the rep's own inbox. Best-
    // effort — if the primary succeeded, we don't flip ok=false on a
    // ccSelf failure.
    if (result.ok && body.ccSelf && repEmail && repEmail.toLowerCase() !== to.toLowerCase()) {
      try {
        await sendOrderPdfEmail({
          to: repEmail,
          customerName: order.customerName ?? null,
          orderRef: displayRef,
          customerCompany: order.customerCompany ?? null,
          repName,
          repEmail,
          shareUrl,
          pdfBase64: body.pdfBase64,
          pdfFilename: `A-SAFE_Order_${displayRef.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`,
          env: {
            RESEND_API_KEY: c.env.RESEND_API_KEY,
            EMAIL_FROM: c.env.EMAIL_FROM,
            ADMIN_NOTIFICATION_EMAILS: c.env.ADMIN_NOTIFICATION_EMAILS,
          },
        });
      } catch (err) {
        console.error("ccSelf email failed (non-blocking):", err);
      }
    }

    if (result.ok) {
      try {
        const ipAddress =
          c.req.header("cf-connecting-ip") ||
          c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
          null;
        await storage.appendOrderAuditLog({
          orderId,
          eventType: "email_sent",
          section: null as any,
          actorUserId: userId,
          actorEmail: ownerUser?.email || null,
          details: { to, messageId: result.messageId || null, ccSelf: !!body.ccSelf },
          ipAddress,
          userAgent: c.req.header("user-agent") || null,
        } as any);
      } catch (err) {
        console.error("Audit log (email_sent) failed:", err);
      }
      return c.json({ ok: true, messageId: result.messageId });
    }

    return c.json({ ok: false, error: result.error || "send_failed" }, 502);
  } catch (error) {
    console.error("Error emailing order PDF:", error);
    return c.json({ ok: false, error: "Failed to email order" }, 500);
  }
});

// ──────────────────────────────────────────────
// GET /api/admin/orders/kanban — admin-only
// Returns all 9 buckets even when empty so the client can render
// consistent columns without extra null-handling.
// ──────────────────────────────────────────────
orders.get("/admin/orders/kanban", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const user = await storage.getUser(c.get("user").claims.sub);
    if (user?.role !== "admin") {
      return c.json({ message: "Admin access required" }, 403);
    }

    const all = await storage.getAllOrders();

    type Summary = {
      id: string;
      orderNumber: string;
      customOrderNumber: string | null;
      customerCompany: string | null;
      customerName: string | null;
      grandTotal: string | null;
      currency: string;
      status: string;
      statusChangedAt: string | null;
      createdAt: string | null;
    };

    // Initialise every bucket to [] so the response shape is stable even
    // when zero orders occupy a column — keeps the client grid simple.
    const result: Record<string, Summary[]> = {};
    for (const s of LIFECYCLE_STATUSES) result[s] = [];

    for (const o of all) {
      const status = (o.status || "draft") as string;
      // Route legacy statuses into their closest v2 bucket so the board
      // doesn't hide in-flight work.
      const bucket: LifecycleStatus =
        isLifecycleStatus(status)
          ? (status as LifecycleStatus)
          : status === "pending"
            ? "draft"
            : status === "submitted_for_review"
              ? "submitted"
              : status === "processing"
                ? "approved"
                : status === "shipped"
                  ? "delivered"
                  : status === "installation_in_progress"
                    ? "delivered"
                    : status === "fulfilled"
                      ? "installed"
                      : status === "rejected" || status === "revision_requested"
                        ? "submitted"
                        : "draft";

      result[bucket].push({
        id: o.id,
        orderNumber: o.orderNumber,
        customOrderNumber: o.customOrderNumber ?? null,
        customerCompany: o.customerCompany ?? null,
        customerName: o.customerName ?? null,
        grandTotal: o.totalAmount ?? null,
        currency: o.currency || "AED",
        status,
        statusChangedAt: (o as any).statusChangedAt
          ? new Date((o as any).statusChangedAt).toISOString()
          : null,
        createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : null,
      });
    }

    return c.json(result);
  } catch (error) {
    console.error("Error building kanban view:", error);
    return c.json({ message: "Failed to build kanban view" }, 500);
  }
});

export default orders;
