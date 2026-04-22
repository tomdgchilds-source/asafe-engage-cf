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

    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 5)
      .toUpperCase()}`;

    // Calculate total amount
    const productTotal = cartItems.reduce(
      (sum: number, item: any) => sum + item.totalPrice,
      0
    );

    // Calculate delivery costs
    const deliveryTotal = cartItems
      .filter((item: any) => item.requiresDelivery)
      .reduce(
        (sum: number, item: any) => sum + item.totalPrice * 0.096271916,
        0
      );

    // Calculate installation costs based on complexity
    const getInstallationRate = () => {
      switch (installationComplexity) {
        case "simple":
          return 0.1148264;
        case "standard":
          return 0.1938872;
        case "complex":
          return 0.26289773;
        default:
          return 0.1938872;
      }
    };
    const installationTotal = cartItems
      .filter((item: any) => item.requiresInstallation)
      .reduce(
        (sum: number, item: any) =>
          sum + item.totalPrice * getInstallationRate(),
        0
      );

    // Calculate service package cost
    let servicePackageCost = 0;
    if (servicePackage && servicePackage.chargeable && servicePackage.value) {
      const percentageMatch = servicePackage.value.match(
        /(\d+(?:\.\d+)?)%/
      );
      if (percentageMatch) {
        const percentage = parseFloat(percentageMatch[1]);
        servicePackageCost = productTotal * (percentage / 100);
      }
    }

    // Calculate discount amount
    const totalDiscountPercent = discountOptions.reduce(
      (sum: number, discount: any) => {
        return sum + (discount.discountPercent || 0);
      },
      0
    );

    // Discounts are applied as selected. Cap at 100% as a sanity check to
    // prevent negative prices, but no business-rule-driven 20% ceiling.
    const appliedDiscountPercent = Math.min(Math.max(totalDiscountPercent, 0), 100);
    const subtotal =
      productTotal + deliveryTotal + installationTotal + servicePackageCost;
    const discountAmount = subtotal * (appliedDiscountPercent / 100);
    const totalAmount = Math.max(subtotal - discountAmount, 0);

    // Enrich cart items with product details including images. We also
    // capture the product row on the enriched item so the PAS 13 pre-flight
    // below doesn't have to round-trip the DB a second time.
    const enrichedCartItems = await Promise.all(
      cartItems.map(async (item: any) => {
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
      const userCalculations =
        await storage.getUserImpactCalculations(userId);
      fullApplicationAreas = userCalculations || [];
    }

    if (layoutDrawingId && !fullLayoutMarkups) {
      const markups = await storage.getLayoutMarkups(layoutDrawingId);
      fullLayoutMarkups = markups || [];
    }

    const fullReciprocalCommitments = reciprocalCommitments || {
      commitments: discountOptions,
      explanationText:
        "At A-SAFE, we believe in creating partnerships that benefit both sides. That's why we offer added value through a reciprocal approach meaning if you share your safety successes, such as a testimonial, referrals, or a LinkedIn post, we can recognize your achievements, promote safer work practices, and celebrate your improvements while enhancing the overall value you receive on your project.",
      totalDiscountPercent: appliedDiscountPercent,
    };

    const fullServiceCareDetails =
      serviceCareDetails ||
      (servicePackage
        ? {
            packageName: servicePackage.title,
            packageTier: servicePackage.id,
            services: servicePackage.features || [],
            cost: servicePackageCost,
            chargeable: servicePackage.chargeable,
          }
        : null);

    const orderData = {
      userId,
      orderNumber,
      customOrderNumber: customOrderNumber || undefined,
      companyLogoUrl: companyLogoUrl || undefined,
      status: "submitted_for_review" as const,
      totalAmount: totalAmount.toString(),
      currency: currency || "AED",
      items: enrichedCartItems || [],
      isForUser: isForUser !== undefined ? isForUser : true,
      servicePackage,
      discountOptions,
      impactCalculationId,
      installationComplexity: installationComplexity || "standard",
      revisionCount: revisionInfo?.revisionCount || 0,
      isRevision: revisionInfo?.isRevision || false,
      ...(partnerDiscountCode ? { partnerDiscountCode } : {}),
      ...(partnerDiscountPercent ? { partnerDiscountPercent } : {}),
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

    const order = await storage.createOrder(orderData);
    console.log("Created order:", order);

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
    if (partnerDiscountCode) {
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
          await storage.updateOrder(order.id, {
            partnerDiscountCode: null as any,
            partnerDiscountPercent: null as any,
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
        const formattedTotal = `${currency || "AED"} ${Number(totalAmount).toLocaleString("en", { minimumFractionDigits: 2 })}`;

        // Send order confirmation to customer
        if (emailAddress) {
          await sendOrderConfirmationEmail(c.env, {
            to: emailAddress,
            orderNumber,
            totalAmount: formattedTotal,
            itemCount,
          });
        }

        // Notify admin team via email (routed by currency)
        await sendOrderSubmittedNotification(c.env, {
          orderNumber,
          customerName: resolvedCustomerName,
          customerEmail: emailAddress,
          totalAmount: formattedTotal,
          currency: (currency || "AED") as string,
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

    console.log(
      "Restoring order:",
      order.id,
      "for user:",
      userId,
      "as revision"
    );

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
    console.log("Restoring", orderItems.length, "items to cart");

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
          console.log(
            "Service package restored successfully:",
            serviceOptionId
          );
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
          console.log(
            "Discount options restored successfully:",
            discountOptionIds
          );
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
      metadata: JSON.stringify({ orderId }),
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

  const formattedTotal = `${order.currency || "AED"} ${Number(order.totalAmount || 0).toLocaleString("en", { minimumFractionDigits: 2 })}`;

  // Fire-and-forget via waitUntil — email delivery is best-effort relative
  // to the token write (the token is now persisted; sales can resend). But
  // we await INSIDE the waitUntil handler so we can append the email_sent
  // audit row AFTER Resend confirms.
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const result = await sendApprovalRequestEmail(c.env, {
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
        });

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

    // Recompute delivery / installation charges using the same logic as the
    // client. Safer than trusting cached numbers on the order row — the
    // sanitiser is the only place that hits the customer so the math must
    // be deterministic.
    const subtotal = sanitisedItems.reduce(
      (sum: number, item: any) => sum + (Number(item.totalPrice) || 0),
      0,
    );
    const deliveryCharge = sanitisedItems
      .filter((i: any) => i.requiresDelivery)
      .reduce((sum: number, i: any) => sum + (Number(i.totalPrice) || 0) * 0.096271916, 0);
    const installationRate =
      order.installationComplexity === "simple"
        ? 0.1148264
        : order.installationComplexity === "complex"
          ? 0.26289773
          : 0.1938872;
    const installationCharge = sanitisedItems
      .filter((i: any) => i.requiresInstallation)
      .reduce((sum: number, i: any) => sum + (Number(i.totalPrice) || 0) * installationRate, 0);

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
      currency: order.currency,
      subtotal,
      grandTotal: Number(order.totalAmount) || subtotal + deliveryCharge + installationCharge,
      totalAmount: order.totalAmount,
      deliveryCharge,
      installationCharge,
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
