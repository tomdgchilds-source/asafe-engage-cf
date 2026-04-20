import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const cart = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/cart - list user cart items
cart.get("/cart", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const cartItems = await storage.getUserCart(userId);
    return c.json(cartItems);
  } catch (error) {
    console.error("Error fetching cart items:", error);
    return c.json({ message: "Failed to fetch cart items" }, 500);
  }
});

// POST /api/cart - add item to cart
cart.post("/cart", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const body = await c.req.json();
    const cartItem = { ...body, userId };

    // Fix referenceImages if it's a string
    if (cartItem.referenceImages && typeof cartItem.referenceImages === "string") {
      try {
        cartItem.referenceImages = JSON.parse(cartItem.referenceImages);
      } catch (parseError) {
        console.error("Error parsing referenceImages:", parseError);
        cartItem.referenceImages = [];
      }
    }

    // Fix calculationContext if it's a string
    if (
      cartItem.calculationContext &&
      typeof cartItem.calculationContext === "string"
    ) {
      try {
        cartItem.calculationContext = JSON.parse(cartItem.calculationContext);
      } catch (parseError) {
        console.error("Error parsing calculationContext:", parseError);
        cartItem.calculationContext = null;
      }
    }

    // Fix calculatorImages if it's a string
    if (
      cartItem.calculatorImages &&
      typeof cartItem.calculatorImages === "string"
    ) {
      try {
        cartItem.calculatorImages = JSON.parse(cartItem.calculatorImages);
      } catch (parseError) {
        console.error("Error parsing calculatorImages:", parseError);
        cartItem.calculatorImages = [];
      }
    }

    // Fix selectedVariant if it's a string
    if (
      cartItem.selectedVariant &&
      typeof cartItem.selectedVariant === "string"
    ) {
      try {
        cartItem.selectedVariant = JSON.parse(cartItem.selectedVariant);
      } catch (parseError) {
        console.error("Error parsing selectedVariant:", parseError);
        cartItem.selectedVariant = null;
      }
    }

    // Recalculate pricing to apply tiered discounts
    if (cartItem.productName && cartItem.quantity) {
      console.log(
        `Recalculating price for new cart item: ${cartItem.productName} with quantity: ${cartItem.quantity}`
      );
      const pricingResult = await storage.calculatePrice(
        cartItem.productName,
        cartItem.quantity
      );

      if (pricingResult.requiresQuote) {
        // No pricing tier found for this product name. If the client provided a
        // valid unitPrice (e.g. from a selected variant), trust it and compute
        // the total rather than rejecting the request.
        const clientUnitPrice = parseFloat(cartItem.unitPrice);
        if (!isNaN(clientUnitPrice) && clientUnitPrice > 0) {
          cartItem.totalPrice = Math.round(clientUnitPrice * cartItem.quantity * 100) / 100;
          cartItem.unitPrice = Math.round(clientUnitPrice * 100) / 100;
          cartItem.pricingTier = cartItem.pricingTier || "Variant Price";
          console.log(
            `Using client-provided variant price: Unit=${cartItem.unitPrice}, Total=${cartItem.totalPrice}`
          );
        } else {
          return c.json(
            { message: "No pricing available for this product. Please request a quote." },
            400
          );
        }
      } else {
        cartItem.unitPrice = pricingResult.unitPrice;
        cartItem.totalPrice = pricingResult.totalPrice;
        cartItem.pricingTier = pricingResult.tier;

        console.log(
          `Applied pricing: Unit=${pricingResult.unitPrice}, Total=${pricingResult.totalPrice}, Tier=${pricingResult.tier}`
        );
      }
    }

    const newCartItem = await storage.addToCart(cartItem);

    // Fire-and-forget activity log
    try {
      c.executionCtx.waitUntil(
        storage.logUserActivity({
          userId,
          activityType: "add_to_cart",
          section: "cart",
          details: { productName: cartItem.productName, quantity: cartItem.quantity },
        })
      );
    } catch {}

    return c.json(newCartItem);
  } catch (error) {
    console.error("Error adding to cart:", error);
    return c.json({ message: "Failed to add to cart" }, 500);
  }
});

// POST /api/cart/bulk-add - bulk add items from Build Project
cart.post("/cart/bulk-add", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const { items, projectInfo, autoSaveExisting = true } = await c.req.json();

    let existingItems: any[] | undefined;

    // Check for existing cart items and auto-save as draft if needed
    if (autoSaveExisting) {
      existingItems = await storage.getCartItems(userId);
      if (existingItems && existingItems.length > 0) {
        const draftProject = await storage.createDraftProject({
          userId,
          name: `Auto-saved Draft ${new Date().toLocaleDateString()}`,
          description:
            "Auto-saved from cart before loading new site survey project",
          cartSnapshot: existingItems,
          projectData: {
            autoSaved: true,
            previousItemCount: existingItems.length,
          },
        });

        await storage.clearCart(userId);
        console.log(
          `Auto-saved ${existingItems.length} items as draft project: ${draftProject.id}`
        );
      }
    }

    // Add project info if provided
    if (projectInfo) {
      await storage.upsertCartProjectInfo({
        userId,
        company: projectInfo.company || "",
        location: projectInfo.location || "",
        projectDescription: projectInfo.projectDescription || "",
        companyLogoUrl: projectInfo.companyLogoUrl || "",
        siteSurveyId: projectInfo.siteSurveyId || null,
        siteSurveyTitle: projectInfo.siteSurveyTitle || null,
      });
    }

    // Add all items to cart with their metadata
    const addedItems = [];
    for (const item of items) {
      const cartItem = {
        ...item,
        userId,
        siteSurveyId: projectInfo?.siteSurveyId,
        areaName: item.areaName,
        zoneName: item.zoneName,
        impactRating: item.impactRating,
        impactCalculationId: item.impactCalculationId,
        riskLevel: item.riskLevel,
      };
      const newItem = await storage.addToCart(cartItem);
      addedItems.push(newItem);
    }

    return c.json({
      success: true,
      itemsAdded: addedItems.length,
      items: addedItems,
      message:
        existingItems && existingItems.length > 0
          ? `Previous cart saved as draft. ${addedItems.length} items added to new project cart.`
          : `${addedItems.length} items added to cart.`,
    });
  } catch (error) {
    console.error("Error bulk adding to cart:", error);
    return c.json({ message: "Failed to bulk add to cart" }, 500);
  }
});

// PATCH /api/cart/items - update cart item fields
cart.patch("/cart/items", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const { id, quantity, referenceImages, ...otherUpdates } =
      await c.req.json();

    if (!id) {
      return c.json({ message: "ID is required" }, 400);
    }

    const updates: any = {};
    if (quantity !== undefined) updates.quantity = quantity;
    if (referenceImages !== undefined) updates.referenceImages = referenceImages;
    Object.assign(updates, otherUpdates);

    if (Object.keys(updates).length === 0) {
      return c.json({ message: "No fields to update" }, 400);
    }

    const updatedItem = await storage.updateCartItem(id, updates);
    return c.json(updatedItem);
  } catch (error) {
    console.error("Error updating cart item:", error);
    return c.json({ message: "Failed to update cart item" }, 500);
  }
});

// PUT /api/cart/:id - update cart item by id
cart.put("/cart/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const body = await c.req.json();
    const updatedItem = await storage.updateCartItem(c.req.param("id"), body);
    return c.json(updatedItem);
  } catch (error) {
    console.error("Error updating cart item:", error);
    return c.json({ message: "Failed to update cart item" }, 500);
  }
});

// DELETE /api/cart/:id - remove single cart item
cart.delete("/cart/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    await storage.removeFromCart(c.req.param("id"));

    // Fire-and-forget activity log
    try {
      c.executionCtx.waitUntil(
        storage.logUserActivity({
          userId,
          activityType: "remove_from_cart",
          section: "cart",
          details: { cartItemId: c.req.param("id") },
        })
      );
    } catch {}

    return c.json({ success: true });
  } catch (error) {
    console.error("Error removing from cart:", error);
    return c.json({ message: "Failed to remove from cart" }, 500);
  }
});

// DELETE /api/cart - clear all cart items for user
cart.delete("/cart", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    await storage.clearUserCart(userId);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error clearing cart:", error);
    return c.json({ message: "Failed to clear cart" }, 500);
  }
});

// POST /api/cart/check-existing-data - check for existing cart data before loading drafts
cart.post("/cart/check-existing-data", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;

    const cartItems = await storage.getUserCart(userId);
    const projectInfo = await storage.getCartProjectInfo(userId);
    const layoutDrawings = await storage.getLayoutDrawings(userId);
    const projectCaseStudies = await storage.getProjectCaseStudies(userId);
    const calculations = await storage.getUserCalculations(userId);
    const discountSelections = await storage.getUserDiscountSelections(userId);
    const serviceSelections = await storage.getUserServiceSelection(userId);

    const hasExistingData = {
      cartItems: cartItems.length > 0,
      projectInfo:
        !!projectInfo &&
        (!!projectInfo.company ||
          !!projectInfo.location ||
          !!projectInfo.projectDescription),
      layoutDrawings: layoutDrawings.length > 0,
      projectCaseStudies: projectCaseStudies.length > 0,
      calculations: calculations.length > 0,
      discountSelections: discountSelections.length > 0,
      serviceSelections: !!serviceSelections,
    };

    const hasAnyData = Object.values(hasExistingData).some(Boolean);

    return c.json({
      hasExistingData: hasAnyData,
      existingData: {
        cartItems,
        projectInfo,
        layoutDrawings,
        projectCaseStudies,
        calculations,
        discountSelections,
        serviceSelections: serviceSelections ? [serviceSelections] : [],
      },
      breakdown: hasExistingData,
    });
  } catch (error) {
    console.error("Error checking existing cart data:", error);
    return c.json({ message: "Failed to check existing cart data" }, 500);
  }
});

// GET /api/cart-project-info - get project info for current cart
cart.get("/cart-project-info", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const projectInfo = await storage.getCartProjectInfo(userId);
    return c.json(
      projectInfo || { company: "", location: "", projectDescription: "" }
    );
  } catch (error) {
    console.error("Error fetching cart project info:", error);
    return c.json({ message: "Failed to fetch project information" }, 500);
  }
});

// POST /api/cart-project-info - save project info for current cart
cart.post("/cart-project-info", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const { company, location, projectDescription, companyLogoUrl } = await c.req.json();

    const projectInfo = await storage.saveCartProjectInfo(userId, {
      company: company || null,
      location: location || null,
      projectDescription: projectDescription || null,
      companyLogoUrl: companyLogoUrl || null,
    } as any);
    return c.json(projectInfo);
  } catch (error) {
    console.error("Error saving cart project info:", error);
    return c.json({ message: "Failed to save project information" }, 500);
  }
});

// ============================================
// Draft Project routes
// ============================================

// GET /api/draft-projects - list user draft projects
cart.get("/draft-projects", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const draftProjects = await storage.getUserDraftProjects(userId);
    return c.json(draftProjects);
  } catch (error) {
    console.error("Error fetching draft projects:", error);
    return c.json({ message: "Failed to fetch draft projects" }, 500);
  }
});

// GET /api/draft-projects/:id - get single draft project
cart.get("/draft-projects/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const draftProject = await storage.getDraftProject(c.req.param("id"));
    if (!draftProject) {
      return c.json({ message: "Draft project not found" }, 404);
    }
    if (draftProject.userId !== c.get("user").claims.sub) {
      return c.json({ message: "Unauthorized" }, 403);
    }
    return c.json(draftProject);
  } catch (error) {
    console.error("Error fetching draft project:", error);
    return c.json({ message: "Failed to fetch draft project" }, 500);
  }
});

// POST /api/draft-projects - create draft project from current cart
cart.post("/draft-projects", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const body = await c.req.json();

    // Get ALL cart-related data comprehensively
    const cartItems = await storage.getUserCart(userId);
    const projectInfo = await storage.getCartProjectInfo(userId);
    const layoutDrawings = await storage.getLayoutDrawings(userId);
    const projectCaseStudies = await storage.getProjectCaseStudies(userId);
    const calculations = await storage.getUserCalculations(userId);
    const discountSelections = await storage.getUserDiscountSelections(userId);
    const serviceSelection = await storage.getUserServiceSelection(userId);

    // Get layout markups for all layout drawings
    const layoutMarkups: any[] = [];
    for (const drawing of layoutDrawings) {
      try {
        const markups = await storage.getLayoutMarkups(drawing.id);
        layoutMarkups.push(...markups);
      } catch (error) {
        console.error(
          `Error fetching markups for drawing ${drawing.id}:`,
          error
        );
      }
    }

    if (cartItems.length === 0) {
      return c.json(
        { message: "Cannot save empty cart as draft project" },
        400
      );
    }

    // Calculate total amount
    const totalAmount = cartItems.reduce(
      (sum: number, item: any) => sum + Number(item.totalPrice || 0),
      0
    );

    // Prepare comprehensive cart data
    const comprehensiveCartData = {
      cartItems,
      projectInfo,
      layoutDrawings,
      layoutMarkups,
      projectCaseStudies,
      impactCalculations: calculations,
      discountSelections,
      serviceSelections: serviceSelection ? [serviceSelection] : [],
    };

    const draftData = {
      userId,
      projectName:
        body.projectName ||
        `Draft Project ${new Date().toLocaleDateString()}`,
      description: body.description || "",
      totalAmount: totalAmount.toString(),
      currency: "AED",
      cartData: comprehensiveCartData,
      discountSelections,
      serviceSelections: serviceSelection ? [serviceSelection] : [],
    };

    const newDraft = await storage.createDraftProject(draftData);

    // Clear cart after saving as draft if requested
    if (body.clearCart !== false) {
      await storage.clearUserCart(userId);

      if (body.clearAllData !== false) {
        try {
          await storage.saveCartProjectInfo(userId, {
            company: "",
            location: "",
            projectDescription: "",
          });
          await storage.updateProjectCaseStudies(userId, []);
        } catch (clearError) {
          console.error("Error clearing additional data:", clearError);
        }
      }
    }

    return c.json(newDraft);
  } catch (error) {
    console.error("Error creating draft project:", error);
    return c.json({ message: "Failed to create draft project" }, 500);
  }
});

// PUT /api/draft-projects/:id - update draft project
cart.put("/draft-projects/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const draftProject = await storage.getDraftProject(c.req.param("id"));
    if (!draftProject) {
      return c.json({ message: "Draft project not found" }, 404);
    }
    if (draftProject.userId !== c.get("user").claims.sub) {
      return c.json({ message: "Unauthorized" }, 403);
    }

    const updates = await c.req.json();
    const updatedDraft = await storage.updateDraftProject(
      c.req.param("id"),
      updates
    );
    return c.json(updatedDraft);
  } catch (error) {
    console.error("Error updating draft project:", error);
    return c.json({ message: "Failed to update draft project" }, 500);
  }
});

// DELETE /api/draft-projects/:id - delete draft project
cart.delete("/draft-projects/:id", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const draftProject = await storage.getDraftProject(c.req.param("id"));
    if (!draftProject) {
      return c.json({ message: "Draft project not found" }, 404);
    }
    if (draftProject.userId !== c.get("user").claims.sub) {
      return c.json({ message: "Unauthorized" }, 403);
    }

    await storage.deleteDraftProject(c.req.param("id"));
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting draft project:", error);
    return c.json({ message: "Failed to delete draft project" }, 500);
  }
});

// POST /api/draft-projects/:id/load - load draft project back into cart
cart.post("/draft-projects/:id/load", authMiddleware, async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const userId = c.get("user").claims.sub;
    const body = await c.req.json().catch(() => ({}));
    const draftProject = await storage.getDraftProject(c.req.param("id"));

    if (!draftProject) {
      return c.json({ message: "Draft project not found" }, 404);
    }
    if (draftProject.userId !== userId) {
      return c.json({ message: "Unauthorized" }, 403);
    }

    // Clear current cart first if requested
    if (body.clearCart !== false) {
      await storage.clearUserCart(userId);

      try {
        await storage.saveCartProjectInfo(userId, {
          company: "",
          location: "",
          projectDescription: "",
        });
        await storage.updateProjectCaseStudies(userId, []);
      } catch (clearError) {
        console.error("Error clearing related data:", clearError);
      }
    }

    const cartData = draftProject.cartData as any;
    const loadedItems: any[] = [];
    const restoredData = {
      cartItems: 0,
      projectInfo: false,
      layoutDrawings: 0,
      layoutMarkups: 0,
      projectCaseStudies: 0,
      calculations: 0,
      discountSelections: 0,
      serviceSelections: 0,
    };

    // Handle both old format (array) and new format (object)
    if (Array.isArray(cartData)) {
      for (const item of cartData) {
        const { id, createdAt, updatedAt, ...cartItem } = item;
        const newItem = await storage.addToCart({ ...cartItem, userId });
        loadedItems.push(newItem);
        restoredData.cartItems++;
      }
    } else if (cartData && typeof cartData === "object") {
      // Restore cart items
      if (cartData.cartItems && Array.isArray(cartData.cartItems)) {
        for (const item of cartData.cartItems) {
          const { id, createdAt, updatedAt, ...cartItem } = item;
          const newItem = await storage.addToCart({ ...cartItem, userId });
          loadedItems.push(newItem);
          restoredData.cartItems++;
        }
      }

      // Restore project info
      if (cartData.projectInfo) {
        try {
          await storage.saveCartProjectInfo(userId, cartData.projectInfo);
          restoredData.projectInfo = true;
        } catch (error) {
          console.error("Error restoring project info:", error);
        }
      }

      // Restore layout drawings
      if (
        cartData.layoutDrawings &&
        Array.isArray(cartData.layoutDrawings)
      ) {
        for (const drawing of cartData.layoutDrawings) {
          try {
            const { id, createdAt, updatedAt, ...drawingData } = drawing;
            const newDrawing = await storage.createLayoutDrawing({
              ...drawingData,
              userId,
            });
            restoredData.layoutDrawings++;

            // Restore markups for this drawing
            if (
              cartData.layoutMarkups &&
              Array.isArray(cartData.layoutMarkups)
            ) {
              const drawingMarkups = cartData.layoutMarkups.filter(
                (m: any) => m.layoutDrawingId === drawing.id
              );
              for (const markup of drawingMarkups) {
                try {
                  const {
                    id: markupId,
                    createdAt: markupCreated,
                    updatedAt: markupUpdated,
                    layoutDrawingId,
                    ...markupData
                  } = markup;
                  await storage.createLayoutMarkup({
                    ...markupData,
                    layoutDrawingId: newDrawing.id,
                    userId,
                  });
                  restoredData.layoutMarkups++;
                } catch (markupError) {
                  console.error(
                    "Error restoring layout markup:",
                    markupError
                  );
                }
              }
            }
          } catch (error) {
            console.error("Error restoring layout drawing:", error);
          }
        }
      }

      // Restore project case studies
      if (
        cartData.projectCaseStudies &&
        Array.isArray(cartData.projectCaseStudies)
      ) {
        try {
          const caseStudyIds = cartData.projectCaseStudies.map(
            (cs: any) => cs.caseStudyId
          );
          await storage.updateProjectCaseStudies(userId, caseStudyIds);
          restoredData.projectCaseStudies = caseStudyIds.length;
        } catch (error) {
          console.error("Error restoring project case studies:", error);
        }
      }

      // Restore calculations
      if (
        cartData.impactCalculations &&
        Array.isArray(cartData.impactCalculations)
      ) {
        for (const calculation of cartData.impactCalculations) {
          try {
            const { id, createdAt, updatedAt, ...calcData } = calculation;
            await storage.createCalculation({ ...calcData, userId });
            restoredData.calculations++;
          } catch (error) {
            console.error("Error restoring calculation:", error);
          }
        }
      }
    }

    // Load discount selections (from both old and new format)
    const discountSelections =
      cartData?.discountSelections ||
      (draftProject as any).discountSelections;
    if (discountSelections && Array.isArray(discountSelections)) {
      try {
        const discountIds = discountSelections.map(
          (d: any) => d.discountOptionId
        );
        await storage.saveUserDiscountSelections(userId, discountIds);
        restoredData.discountSelections = discountIds.length;
      } catch (error) {
        console.error("Error restoring discount selections:", error);
      }
    }

    // Load service selection (from both old and new format)
    const serviceSelections =
      cartData?.serviceSelections ||
      (draftProject as any).serviceSelections;
    if (serviceSelections && Array.isArray(serviceSelections)) {
      try {
        if (serviceSelections.length > 0) {
          await storage.saveUserServiceSelection(
            userId,
            serviceSelections[0].serviceOptionId
          );
          restoredData.serviceSelections = 1;
        }
      } catch (error) {
        console.error("Error restoring service selection:", error);
      }
    }

    return c.json({
      success: true,
      loadedItems,
      restoredData,
      message: `Successfully restored draft project with ${restoredData.cartItems} cart items, ${restoredData.layoutDrawings} layout drawings, ${restoredData.layoutMarkups} markups, ${restoredData.projectCaseStudies} case studies, and ${restoredData.calculations} calculations.`,
    });
  } catch (error) {
    console.error("Error loading draft project:", error);
    return c.json({ message: "Failed to load draft project" }, 500);
  }
});

export default cart;
