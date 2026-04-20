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
} from "../services/email";

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
    const updatedOrder = await storage.updateOrder(c.req.param("id"), {
      status,
    });
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

    // Enrich cart items with product details including images
    const enrichedCartItems = await Promise.all(
      cartItems.map(async (item: any) => {
        const product = await storage.getProductByName(item.productName);
        return {
          ...item,
          imageUrl: product?.imageUrl || null,
          impactRating: product?.impactRating || null,
          category: product?.category || "safety-barriers",
        };
      })
    );

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
    };

    const order = await storage.createOrder(orderData);
    console.log("Created order:", order);

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

    // Clear existing cart items first
    const existingCartItems = await storage.getCartItems(userId);
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

export default orders;
