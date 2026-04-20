import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const siteSurveys = new Hono<{ Bindings: Env; Variables: Variables }>();

// All site survey routes require authentication
siteSurveys.use("/site-surveys/*", authMiddleware);
siteSurveys.use("/site-surveys", authMiddleware);
siteSurveys.use("/site-survey-areas/*", authMiddleware);
siteSurveys.use("/site-survey-areas", authMiddleware);

// =============================================
// SITE SURVEY ROUTES
// =============================================

// GET /api/site-surveys
siteSurveys.get("/site-surveys", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const surveys = await storage.getUserSiteSurveys(userId);
    return c.json(surveys);
  } catch (error) {
    console.error("Error fetching site surveys:", error);
    return c.json({ message: "Failed to fetch site surveys" }, 500);
  }
});

// GET /api/site-surveys/:id
siteSurveys.get("/site-surveys/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const survey = await storage.getSiteSurvey(c.req.param("id"));
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey not found" }, 404);
    }
    return c.json(survey);
  } catch (error) {
    console.error("Error fetching site survey:", error);
    return c.json({ message: "Failed to fetch site survey" }, 500);
  }
});

// POST /api/site-surveys
siteSurveys.post("/site-surveys", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const body = await c.req.json();

    // TODO: Add Zod validation with insertSiteSurveySchema
    const validatedData = {
      ...body,
      userId,
    };

    const survey = await storage.createSiteSurvey(validatedData);

    // Fire-and-forget activity log
    try {
      c.executionCtx.waitUntil(
        storage.logUserActivity({
          userId,
          activityType: "create_survey",
          section: "site-surveys",
          details: { surveyId: survey.id, title: body.title || body.name },
        })
      );
    } catch {}

    return c.json(survey, 201);
  } catch (error) {
    console.error("Error creating site survey:", error);
    return c.json({ message: "Failed to create site survey" }, 500);
  }
});

// PUT /api/site-surveys/:id
siteSurveys.put("/site-surveys/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const survey = await storage.getSiteSurvey(c.req.param("id"));
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey not found" }, 404);
    }
    const body = await c.req.json();

    // TODO: Add Zod validation with insertSiteSurveySchema.partial()
    const updatedSurvey = await storage.updateSiteSurvey(c.req.param("id"), body);
    return c.json(updatedSurvey);
  } catch (error) {
    console.error("Error updating site survey:", error);
    return c.json({ message: "Failed to update site survey" }, 500);
  }
});

// POST /api/site-surveys/:id/complete
siteSurveys.post("/site-surveys/:id/complete", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const survey = await storage.getSiteSurvey(c.req.param("id"));
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey not found" }, 404);
    }
    const completedSurvey = await storage.completeSiteSurvey(c.req.param("id"));
    return c.json(completedSurvey);
  } catch (error) {
    console.error("Error completing site survey:", error);
    return c.json({ message: "Failed to complete site survey" }, 500);
  }
});

// DELETE /api/site-surveys/:id
siteSurveys.delete("/site-surveys/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const survey = await storage.getSiteSurvey(c.req.param("id"));
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey not found" }, 404);
    }
    await storage.deleteSiteSurvey(c.req.param("id"));
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting site survey:", error);
    return c.json({ message: "Failed to delete site survey" }, 500);
  }
});

// =============================================
// SITE SURVEY AREA ROUTES
// =============================================

// GET /api/site-surveys/:id/areas
siteSurveys.get("/site-surveys/:id/areas", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const survey = await storage.getSiteSurvey(c.req.param("id"));
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey not found" }, 404);
    }
    const areas = await storage.getSiteSurveyAreas(c.req.param("id"));
    return c.json(areas);
  } catch (error) {
    console.error("Error fetching site survey areas:", error);
    return c.json({ message: "Failed to fetch site survey areas" }, 500);
  }
});

// POST /api/site-surveys/:id/areas
siteSurveys.post("/site-surveys/:id/areas", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const survey = await storage.getSiteSurvey(c.req.param("id"));
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey not found" }, 404);
    }
    const body = await c.req.json();

    // TODO: Add Zod validation with insertSiteSurveyAreaSchema
    const validatedData = {
      ...body,
      siteSurveyId: c.req.param("id"),
    };

    const area = await storage.createSiteSurveyArea(validatedData);
    return c.json(area, 201);
  } catch (error) {
    console.error("Error creating site survey area:", error);
    return c.json({ message: "Failed to create site survey area" }, 500);
  }
});

// PUT /api/site-survey-areas/:id
siteSurveys.put("/site-survey-areas/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;

    // Ownership check: area -> parent survey -> userId
    const area = await storage.getSiteSurveyArea(c.req.param("id"));
    if (!area) {
      return c.json({ error: "Site survey area not found" }, 404);
    }
    const survey = await storage.getSiteSurvey(area.siteSurveyId);
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey area not found" }, 404);
    }

    const body = await c.req.json();

    // TODO: Add Zod validation with insertSiteSurveyAreaSchema.partial()

    // Only reset the impact calculation when inputs that actually affect it change.
    // Editing zone name, photos, Matterport URL, description, etc. should NOT wipe
    // an existing calculation.
    const calcInputFields = ["vehicleWeight", "vehicleSpeed", "impactAngle"];
    const calcInputChanged = calcInputFields.some((k) => k in body);
    const isProductSelectionUpdate =
      "recommendedProducts" in body && !calcInputChanged;

    let dataToUpdate;
    if (isProductSelectionUpdate) {
      dataToUpdate = body;
    } else if (calcInputChanged) {
      // User actually changed a calc input — invalidate the stored result.
      dataToUpdate = {
        ...body,
        calculatedJoules: null,
        recommendedProducts: [],
      };
    } else {
      // Non-calc edits (matterportUrl, photosUrls, names, description, etc.)
      // leave the existing calculation intact.
      dataToUpdate = body;
    }

    const updatedArea = await storage.updateSiteSurveyArea(c.req.param("id"), dataToUpdate);
    return c.json(updatedArea);
  } catch (error) {
    console.error("Error updating site survey area:", error);
    return c.json({ message: "Failed to update site survey area" }, 500);
  }
});

// POST /api/site-survey-areas/:id/calculate-impact
siteSurveys.post("/site-survey-areas/:id/calculate-impact", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;
    const areaId = c.req.param("id");

    // Ownership check: area -> parent survey -> userId
    const currentArea = await storage.getSiteSurveyArea(areaId);
    if (!currentArea) {
      return c.json({ error: "Site survey area not found" }, 404);
    }
    const survey = await storage.getSiteSurvey(currentArea.siteSurveyId);
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey area not found" }, 404);
    }

    const { vehicleWeight, vehicleSpeed, impactAngle = 90 } = await c.req.json();

    if (!vehicleWeight || !vehicleSpeed) {
      return c.json({ message: "Vehicle weight, speed, and impact angle are required" }, 400);
    }
    const isRackingArea = currentArea?.areaType?.toLowerCase().includes("racking");

    // PAS 13 calculation: KE = 0.5 x m x (v x sin theta)^2
    const massKg = parseFloat(vehicleWeight);
    const speedKmh = parseFloat(vehicleSpeed);
    const angleRadians = (parseFloat(impactAngle) * Math.PI) / 180;
    const velocityMs = speedKmh / 3.6; // Convert km/h to m/s
    const velocityComponent = velocityMs * Math.sin(angleRadians);
    const kineticEnergy = 0.5 * massKg * Math.pow(velocityComponent, 2);

    // Get ALL products from database
    const allProducts = await storage.getProducts();

    // Filter ALL products that meet or exceed the calculated energy
    const qualifiedProducts = allProducts.filter((product) => {
      const rating = product.impactRating || 0;
      return rating >= kineticEnergy;
    });

    // Smart grouping: Keep one variant per unique product type
    const productTypeMap = new Map<string, any>();

    qualifiedProducts.forEach((product) => {
      let baseProductName = product.name
        .replace(/\s*–\s*\d+\s*mm.*$/i, "")
        .replace(/\s*-\s*\d+\s*mm.*$/i, "")
        .replace(/\s*\d+mm\s*x\s*\d+mm.*$/i, "")
        .replace(/\s*\d+\s*mm.*$/i, "")
        .replace(/\s*\(\d+.*\).*$/i, "")
        .replace(/\s*\d+L.*$/i, "")
        .replace(/\s+Plus$/i, " Plus")
        .trim();

      if (!productTypeMap.has(baseProductName)) {
        const safetyMargin = Math.round(
          ((product.impactRating! - kineticEnergy) / kineticEnergy) * 100
        );
        productTypeMap.set(baseProductName, {
          productId: product.id,
          productName: product.name,
          impactRating: product.impactRating,
          imageUrl: product.imageUrl,
          price: product.price,
          category: product.category,
          safetyMargin,
          reason:
            safetyMargin >= 20
              ? `Rated for ${product.impactRating}J (${safetyMargin}% safety margin)`
              : safetyMargin > 0
                ? `Rated for ${product.impactRating}J (${safetyMargin}% margin - consider higher rated option)`
                : `Rated for ${product.impactRating}J (meets minimum requirement)`,
        });
      } else {
        const existing = productTypeMap.get(baseProductName);
        const newSafetyMargin = Math.round(
          ((product.impactRating! - kineticEnergy) / kineticEnergy) * 100
        );

        const isNewBetter =
          (newSafetyMargin >= 20 &&
            newSafetyMargin <= 50 &&
            (existing.safetyMargin < 20 || existing.safetyMargin > 50)) ||
          (newSafetyMargin >= 20 &&
            newSafetyMargin <= 50 &&
            existing.safetyMargin >= 20 &&
            existing.safetyMargin <= 50 &&
            Math.abs(newSafetyMargin - 25) < Math.abs(existing.safetyMargin - 25)) ||
          (existing.safetyMargin < 20 &&
            newSafetyMargin >= 0 &&
            newSafetyMargin < existing.safetyMargin) ||
          (existing.safetyMargin > 50 &&
            newSafetyMargin >= 20 &&
            newSafetyMargin < existing.safetyMargin);

        if (isNewBetter) {
          productTypeMap.set(baseProductName, {
            productId: product.id,
            productName: product.name,
            impactRating: product.impactRating,
            imageUrl: product.imageUrl,
            price: product.price,
            category: product.category,
            safetyMargin: newSafetyMargin,
            reason:
              newSafetyMargin >= 20
                ? `Rated for ${product.impactRating}J (${newSafetyMargin}% safety margin)`
                : newSafetyMargin > 0
                  ? `Rated for ${product.impactRating}J (${newSafetyMargin}% margin - consider higher rated option)`
                  : `Rated for ${product.impactRating}J (meets minimum requirement)`,
          });
        }
      }
    });

    // Convert map to array and sort by impact rating
    let recommendedProducts = Array.from(productTypeMap.values())
      .map(({ safetyMargin, ...product }) => product)
      .sort((a, b) => (a.impactRating || 0) - (b.impactRating || 0));

    // For racking areas, ensure RackGuard is included
    if (isRackingArea) {
      const hasRackGuard = recommendedProducts.some((p) =>
        p.productName.toLowerCase().includes("rackguard")
      );

      if (!hasRackGuard) {
        const rackGuardProducts = allProducts.filter((p) =>
          p.name.toLowerCase().includes("rackguard")
        );

        if (rackGuardProducts.length > 0) {
          let optimalRackGuard = rackGuardProducts[0];
          let optimalDifference = Math.abs(
            (rackGuardProducts[0].impactRating || 0) - kineticEnergy
          );

          rackGuardProducts.forEach((product) => {
            const difference = Math.abs((product.impactRating || 0) - kineticEnergy);
            if (
              product.impactRating! >= kineticEnergy &&
              (optimalRackGuard.impactRating! < kineticEnergy || difference < optimalDifference)
            ) {
              optimalRackGuard = product;
              optimalDifference = difference;
            } else if (
              optimalRackGuard.impactRating! < kineticEnergy &&
              difference < optimalDifference
            ) {
              optimalRackGuard = product;
              optimalDifference = difference;
            }
          });

          const impactDifference = optimalRackGuard.impactRating
            ? Math.round(
                ((optimalRackGuard.impactRating - kineticEnergy) / kineticEnergy) * 100
              )
            : -100;

          recommendedProducts.unshift({
            productId: optimalRackGuard.id,
            productName: optimalRackGuard.name,
            impactRating: optimalRackGuard.impactRating,
            imageUrl: optimalRackGuard.imageUrl,
            price: optimalRackGuard.price,
            category: optimalRackGuard.category,
            reason:
              impactDifference >= 0
                ? `Specifically designed for racking protection. Rated for ${optimalRackGuard.impactRating}J (${impactDifference}% margin)`
                : `Specifically designed for racking protection. Note: Rated for ${optimalRackGuard.impactRating}J (below calculated ${Math.round(kineticEnergy)}J), but typical forklift speeds near racking are 1-2 kph during loading/unloading operations.`,
          });
        }
      }
    }

    // Update the area with calculation results
    const updatedArea = await storage.updateSiteSurveyArea(areaId, {
      vehicleWeight: massKg,
      vehicleSpeed: speedKmh,
      impactAngle: parseFloat(impactAngle),
      calculatedJoules: kineticEnergy,
      recommendedProducts,
    });

    return c.json({
      area: updatedArea,
      kineticEnergy: Math.round(kineticEnergy),
      recommendedProducts,
      calculation: {
        mass: massKg,
        speed: speedKmh,
        angle: impactAngle,
        velocityComponent: velocityComponent.toFixed(2),
      },
    });
  } catch (error) {
    console.error("Error calculating impact:", error);
    return c.json({ message: "Failed to calculate impact energy" }, 500);
  }
});

// DELETE /api/site-survey-areas/:id
siteSurveys.delete("/site-survey-areas/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const userId = c.get("user").claims.sub;

    // Ownership check: area -> parent survey -> userId
    const area = await storage.getSiteSurveyArea(c.req.param("id"));
    if (!area) {
      return c.json({ error: "Site survey area not found" }, 404);
    }
    const survey = await storage.getSiteSurvey(area.siteSurveyId);
    if (!survey || survey.userId !== userId) {
      return c.json({ error: "Site survey area not found" }, 404);
    }

    await storage.deleteSiteSurveyArea(c.req.param("id"));
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting site survey area:", error);
    return c.json({ message: "Failed to delete site survey area" }, 500);
  }
});

export default siteSurveys;
