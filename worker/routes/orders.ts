import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

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

    const appliedDiscountPercent = Math.min(totalDiscountPercent, 20);
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

    // TODO: Port emailService - send order confirmation email
    // TODO: Port whatsappService - send order confirmation via WhatsApp
    // TODO: Port slackService - send order notification to team channel
    // if (customerEmail || (isForUser && user?.email)) {
    //   const user = isForUser ? await storage.getUser(userId) : null;
    //   const emailAddress = customerEmail || user?.email || '';
    //   const phoneNumber = customerMobile || user?.phone || '';
    //   const confirmationData = { ...order, items: enrichedCartItems, ... };
    //   await emailService.sendOrderConfirmation(confirmationData);
    //   await whatsappService.sendOrderConfirmation(confirmationData);
    // }
    // await slackService.sendOrderNotification(order, enrichedCartItems, { ... });
    // await storage.updateOrder(order.id, { slackNotificationSent: true });

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

    const order = await storage.getOrder(c.req.param("id"));
    if (!order) {
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

    const { signatureType, signature, signerJobTitle, signerMobile, signedAt } =
      await c.req.json();
    const orderId = c.req.param("id");

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

// POST /api/orders/:id/submit-for-review
orders.post("/orders/:id/submit-for-review", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const orderId = c.req.param("id");
    const order = await storage.getOrder(orderId);

    if (!order) {
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
          await storage.saveUserServiceSelection({
            userId,
            serviceOptionId,
            additionalInfo: orderServicePackage.additionalInfo || "",
          });
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
        const existingDiscounts =
          await storage.getUserDiscountSelections(userId);
        for (const discount of existingDiscounts) {
          await storage.deleteUserDiscountSelection(discount.id);
        }

        for (const discount of orderDiscountOptions) {
          const discountOptionId =
            discount.id || discount.discountOptionId || discount.title;

          if (discountOptionId) {
            await storage.saveUserDiscountSelection({
              userId,
              discountOptionId,
              additionalInfo: discount.additionalInfo || "",
            });
            console.log(
              "Discount option restored successfully:",
              discountOptionId
            );
          } else {
            console.warn(
              "Discount option could not be restored - invalid discountOptionId"
            );
          }
        }
      } catch (discountError) {
        console.warn(
          "Could not restore discount options:",
          discountError
        );
      }
    }

    // Restore project information
    const projectInfo = {
      userId,
      company: (order as any).customerCompany || "",
      location: (order as any).projectLocation || "",
      projectDescription: (order as any).projectDescription || "",
      projectName: (order as any).projectName || "",
    };

    await storage.saveCartProjectInfo(projectInfo);

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

export default orders;
