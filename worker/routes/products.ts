import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMiddleware } from "../middleware/auth";
import { getDb } from "../db";
import { createStorage } from "../storage";

const products = new Hono<{ Bindings: Env; Variables: Variables }>();

// =============================================
// VEHICLE TYPE ROUTES
// =============================================

// GET /api/vehicle-types
products.get("/vehicle-types", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    console.log("Getting all vehicle types");
    const vehicleTypes = await storage.getVehicleTypes();
    console.log(`Found ${vehicleTypes.length} vehicle types`);
    return c.json(vehicleTypes);
  } catch (error) {
    console.error("Error fetching vehicle types:", error);
    return c.json({ message: "Failed to fetch vehicle types" }, 500);
  }
});

// GET /api/vehicle-types/:id
products.get("/vehicle-types/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const vehicleType = await storage.getVehicleTypeById(c.req.param("id"));
    if (!vehicleType) {
      return c.json({ message: "Vehicle type not found" }, 404);
    }
    return c.json(vehicleType);
  } catch (error) {
    console.error("Error fetching vehicle type:", error);
    return c.json({ message: "Failed to fetch vehicle type" }, 500);
  }
});

// GET /api/products-by-vehicle/:vehicleTypeId
products.get("/products-by-vehicle/:vehicleTypeId", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const result = await storage.getProductsByVehicleType(c.req.param("vehicleTypeId"));
    return c.json(result);
  } catch (error) {
    console.error("Error fetching products by vehicle type:", error);
    return c.json({ message: "Failed to fetch products for vehicle type" }, 500);
  }
});

// GET /api/product-media/:productId
products.get("/product-media/:productId", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const media = await storage.getProductMedia(c.req.param("productId"));
    return c.json(media);
  } catch (error) {
    console.error("Error fetching product media:", error);
    return c.json({ message: "Failed to fetch product media" }, 500);
  }
});

// GET /api/product-variants
// Returns every variant row. Pass ?productId=xxx to scope to one family;
// pass ?productName=xxx for a name-based lookup (case-insensitive).
products.get("/product-variants", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const productId = c.req.query("productId");
    const productName = c.req.query("productName");

    let scopedProductId = productId;
    if (!scopedProductId && productName) {
      // Resolve productName → productId (case-insensitive).
      const matches = await storage.getProducts({ search: productName });
      const exact = matches.find(
        (p) => p.name.toLowerCase() === productName.toLowerCase(),
      );
      scopedProductId = exact?.id;
      if (!scopedProductId) return c.json([]);
    }

    const variants = await storage.getProductVariants(scopedProductId);
    return c.json(variants);
  } catch (error) {
    console.error("Error fetching product variants:", error);
    return c.json({ message: "Failed to fetch product variants" }, 500);
  }
});

// =============================================
// APPLICATION TYPE ROUTES
// =============================================

// GET /api/application-types
products.get("/application-types", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const applicationTypes = await storage.getApplicationTypes();
    return c.json(applicationTypes);
  } catch (error) {
    console.error("Error fetching application types:", error);
    return c.json({ message: "Failed to fetch application types" }, 500);
  }
});

// GET /api/application-types/:id
products.get("/application-types/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const applicationType = await storage.getApplicationType(c.req.param("id"));
    if (!applicationType) {
      return c.json({ message: "Application type not found" }, 404);
    }
    return c.json(applicationType);
  } catch (error) {
    console.error("Error fetching application type:", error);
    return c.json({ message: "Failed to fetch application type" }, 500);
  }
});

// GET /api/products-by-application/:applicationTypeId
products.get("/products-by-application/:applicationTypeId", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const compatibilities = await storage.getProductApplicationCompatibilities(
      undefined,
      c.req.param("applicationTypeId")
    );
    const productIds = compatibilities.map((comp) => comp.productId);
    const productList = await Promise.all(
      productIds.map((id) => storage.getProduct(id))
    );
    return c.json(productList.filter((p) => p !== undefined));
  } catch (error) {
    console.error("Error fetching products by application type:", error);
    return c.json({ message: "Failed to fetch products for application type" }, 500);
  }
});

// =============================================
// COMPATIBILITY ROUTES
// =============================================

// GET /api/vehicle-product-compatibility
products.get("/vehicle-product-compatibility", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const productId = c.req.query("productId");
    const vehicleTypeId = c.req.query("vehicleTypeId");
    const compatibilities = await storage.getVehicleProductCompatibilities(
      productId,
      vehicleTypeId
    );
    return c.json(compatibilities);
  } catch (error) {
    console.error("Error fetching vehicle-product compatibilities:", error);
    return c.json({ message: "Failed to fetch compatibilities" }, 500);
  }
});

// GET /api/product-application-compatibility
products.get("/product-application-compatibility", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const productId = c.req.query("productId");
    const applicationTypeId = c.req.query("applicationTypeId");
    const compatibilities = await storage.getProductApplicationCompatibilities(
      productId,
      applicationTypeId
    );
    return c.json(compatibilities);
  } catch (error) {
    console.error("Error fetching product-application compatibilities:", error);
    return c.json({ message: "Failed to fetch compatibilities" }, 500);
  }
});

// =============================================
// PRODUCT ROUTES (Enhanced with Vehicle Filtering)
// =============================================

// GET /api/products
products.get("/products", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const category = c.req.query("category");
    const industry = c.req.query("industry");
    const search = c.req.query("search");
    const grouped = c.req.query("grouped") ?? "true";
    const page = c.req.query("page");
    const pageSize = c.req.query("pageSize");

    // Handle multiple vehicle and application type IDs
    const vehicleTypeIdRaw = c.req.queries("vehicleTypeId");
    const applicationTypeIdRaw = c.req.queries("applicationTypeId");

    const vehicleTypeIds = vehicleTypeIdRaw && vehicleTypeIdRaw.length > 0
      ? vehicleTypeIdRaw
      : undefined;
    const applicationTypeIds = applicationTypeIdRaw && applicationTypeIdRaw.length > 0
      ? applicationTypeIdRaw
      : undefined;

    const allProducts = await storage.getProducts({
      category: category === "all" ? undefined : category,
      industry: industry === "all" ? undefined : industry,
      search: search || undefined,
      vehicleTypeIds,
      applicationTypeIds,
    });

    // Products are already consolidated by family during import
    // Fetch pricing tier data once (not per product) — N+1 fix
    const allPricingData = await storage.getProductPricing();

    // Fetch all per-length/per-SKU price variants once and index by product id.
    // `variants` below is the legacy quantity-tier shape (from product_pricing);
    // we expose the new table separately as `priceVariants` so existing consumers
    // keep working unchanged. The try/catch covers the window before
    // `product_variants` has been migrated onto the target DB.
    let allPriceVariants: any[] = [];
    try {
      allPriceVariants = await storage.getProductVariants();
    } catch (e) {
      console.warn(
        "product_variants unavailable (table missing or query failed); falling back to tiered pricing.",
        e,
      );
    }
    const priceVariantsByProductId: Record<string, any[]> = {};
    for (const v of allPriceVariants) {
      const key = v.productId as string;
      if (!priceVariantsByProductId[key]) priceVariantsByProductId[key] = [];
      priceVariantsByProductId[key].push(v);
    }

    const productsWithVariants = allProducts.map((product) => {
      let variants: any[] = [];
      let specifications: any = product.specifications;

      // Parse existing variants from specifications JSON if available
      if (product.specifications) {
        try {
          const specs =
            typeof product.specifications === "string"
              ? JSON.parse(product.specifications)
              : product.specifications;

          if (specs.variants && Array.isArray(specs.variants)) {
            variants = specs.variants;
          }
          specifications = specs;
        } catch (parseError) {
          console.warn(
            `Failed to parse specifications for product ${product.id}:`,
            parseError
          );
        }
      }

      // NEW: if this product has explicit price-list variants (loaded from
      // the official price list into product_variants), those are the source
      // of truth for the variant picker. Build the `variants` array from them
      // and skip the product_pricing tier fallback below.
      const priceVariants = priceVariantsByProductId[product.id] ?? [];
      let usedPriceVariants = false;
      if (priceVariants.length > 0) {
        variants = priceVariants.map((pv) => ({
          id: pv.id,
          itemId: pv.id,
          sku: pv.sku,
          code: pv.sku ?? undefined, // AddToCartModal expects `code`
          variant: pv.name, // legacy display string
          name: pv.name,
          length: pv.lengthMm ?? undefined,
          length_mm: pv.lengthMm ?? undefined,
          width: pv.widthMm ?? undefined,
          width_mm: pv.widthMm ?? undefined,
          height: pv.heightMm ?? undefined,
          dimensionLabel: pv.dimensionLabel ?? undefined,
          colorLabel: pv.colorLabel ?? undefined,
          kind: pv.kind ?? undefined,
          variantType: pv.variantType,
          price: Number(pv.priceAed),
          currency: pv.currency ?? "AED",
          isNew: pv.isNew ?? false,
          measurement: pv.lengthMm
            ? `${pv.lengthMm}mm`
            : pv.dimensionLabel ?? pv.name,
        }));
        specifications = {
          ...(specifications || {}),
          priceListSource: product.priceListSource ?? null,
          priceListVersion: product.priceListVersion ?? null,
          measurementType:
            product.pricingLogic === "per_length" ? "Length" : "Variant",
          measurementUnit:
            product.pricingLogic === "per_length" ? "mm" : "unit",
          priceCalculation: product.pricingLogic ?? "per_unit",
          variations: variants,
        };
        usedPriceVariants = true;
      }

      // Look up pricing tier data for this product from pre-fetched data.
      // Skip if we already built variants from the authoritative price-list
      // table — tiered legacy pricing can only override when the new data
      // hasn't been loaded for this product.
      try {
        const pricingData = !usedPriceVariants
          ? allPricingData.find((p) => p.productName === product.name)
          : undefined;

        if (pricingData) {
          // Create variations based on pricing tiers
          const pricingVariations: any[] = [];

          if (pricingData.tier1Price && pricingData.tier1Min && pricingData.tier1Max) {
            pricingVariations.push({
              measurement: `${pricingData.tier1Min}-${pricingData.tier1Max} ${pricingData.pricingType === "linear_meter" || pricingData.pricingType === "per_meter" ? "meters" : "units"}`,
              price: parseFloat(pricingData.tier1Price),
              minQuantity: parseFloat(pricingData.tier1Min),
              maxQuantity: parseFloat(pricingData.tier1Max),
              tier: 1,
            });
          }

          if (pricingData.tier2Price && pricingData.tier2Min && pricingData.tier2Max) {
            pricingVariations.push({
              measurement: `${pricingData.tier2Min}-${pricingData.tier2Max} ${pricingData.pricingType === "linear_meter" || pricingData.pricingType === "per_meter" ? "meters" : "units"}`,
              price: parseFloat(pricingData.tier2Price),
              minQuantity: parseFloat(pricingData.tier2Min),
              maxQuantity: parseFloat(pricingData.tier2Max),
              tier: 2,
            });
          }

          if (pricingData.tier3Price && pricingData.tier3Min && pricingData.tier3Max) {
            pricingVariations.push({
              measurement: `${pricingData.tier3Min}-${pricingData.tier3Max} ${pricingData.pricingType === "linear_meter" || pricingData.pricingType === "per_meter" ? "meters" : "units"}`,
              price: parseFloat(pricingData.tier3Price),
              minQuantity: parseFloat(pricingData.tier3Min),
              maxQuantity: parseFloat(pricingData.tier3Max),
              tier: 3,
            });
          }

          if (pricingData.tier4Price && pricingData.tier4Min && pricingData.tier4Max) {
            pricingVariations.push({
              measurement: `${pricingData.tier4Min}-${pricingData.tier4Max} ${pricingData.pricingType === "linear_meter" || pricingData.pricingType === "per_meter" ? "meters" : "units"}`,
              price: parseFloat(pricingData.tier4Price),
              minQuantity: parseFloat(pricingData.tier4Min),
              maxQuantity: parseFloat(pricingData.tier4Max),
              tier: 4,
            });
          }

          // If we have pricing variations, use them instead of existing variants
          if (pricingVariations.length > 0) {
            variants = pricingVariations;

            // Update specifications to include pricing-based variations
            specifications = {
              ...(specifications || {}),
              measurementType:
                pricingData.pricingType === "linear_meter" ||
                pricingData.pricingType === "per_meter"
                  ? "Length"
                  : "Quantity",
              measurementUnit:
                pricingData.pricingType === "linear_meter" ||
                pricingData.pricingType === "per_meter"
                  ? "meters"
                  : "units",
              priceCalculation: pricingData.pricingType,
              variations: pricingVariations,
            };
          }
        }
      } catch (pricingError) {
        console.warn(
          `Failed to fetch pricing for product ${product.name}:`,
          pricingError
        );
      }

      return {
        ...product,
        // Keep the legacy family-* id so the frontend's routing still works,
        // but expose the real DB id as `productId` so variant lookups can
        // resolve it without a name round-trip.
        productId: product.id,
        id: `family-${product.name.replace(/\s+/g, "-").toLowerCase()}`,
        specifications,
        variants,
        priceVariants,
      };
    });

    // Sort by impact rating (descending order — highest first)
    const sortedProducts = productsWithVariants.sort((a, b) => {
      if (!a.impactRating && !b.impactRating) return 0;
      if (!a.impactRating) return 1;
      if (!b.impactRating) return -1;
      return (b.impactRating || 0) - (a.impactRating || 0);
    });

    // If grouped=false, return individual products (existing functionality)
    if (grouped === "false") {
      return c.json(sortedProducts);
    }

    // Group products by base name for consolidated view
    const groupedProducts: Record<string, any> = {};

    // ─────────────────────────────────────────────────────────────
    // Bollard grouping helper.
    //
    // Sales feedback (Shahla, Micah — May 5): all bollard variants of the
    // same model + impact rating should live under ONE card; the variant
    // axis (colour, height, OD) lives inside. The historical grouping
    // kept "Bollard, Yellow" and "Bollard, Grey" as siblings, and the
    // "iFlex Heavy Duty Bollard" parent was a phantom row with no price
    // because the actual SKUs ship as "Heavy Duty Bollard, Yellow, GALV"
    // and "Heavy Duty Bollard, Grey, GALV".
    //
    // The map below resolves any bollard SKU name to its model card. We
    // strip the trailing colour/finish so colour becomes a variant of the
    // grouped card rather than a sibling card. Keep Cold Storage, Heavy
    // Duty, Monoplex 130/190, iFlex Post 130, Sign Post separate per
    // their distinct impact ratings / model lines.
    //
    // Returns null when the product isn't a bollard or doesn't need
    // re-grouping; the caller falls back to its existing rule chain.
    // ─────────────────────────────────────────────────────────────
    const resolveBollardGroupKey = (name: string): string | null => {
      if (name.includes("Cold Storage iFlex 190 Bollard")) {
        return "Cold Storage iFlex 190 Bollard";
      }
      // "Heavy Duty Bollard, Yellow, GALV" + "Heavy Duty Bollard, Grey,
      // GALV" + the legacy "iFlex Heavy Duty Bollard" parent all roll up
      // into the same card. Phantom-parent merging happens below: the
      // priceless parent gets merged into the same group, then the post-
      // grouping pass elevates the priced variants' price band to the
      // card.
      if (
        name === "iFlex Heavy Duty Bollard" ||
        name.startsWith("Heavy Duty Bollard")
      ) {
        return "iFlex Heavy Duty Bollard";
      }
      if (name === "Monoplex 130 Bollard") return "Monoplex 130 Bollard";
      if (name === "Monoplex 190 Bollard") return "Monoplex 190 Bollard";
      if (name === "iFlex Post 130") return "iFlex Post 130";
      if (name.startsWith("Sign Post")) return name; // each sign-post line stays distinct
      // iFlex 190 family — currently a single 2m SKU but Tom wants it
      // surfaced as a family card so future heights drop in cleanly.
      if (name.startsWith("iFlex 190 Bollard")) return "iFlex 190 Bollard";
      // Standard iFlex bollard line: "Bollard, Yellow" + "Bollard, Grey"
      // both come from the same iFlex 190OD/210OD family. Merge them by
      // colour into the iFlex Bollard card.
      if (/^Bollard, (Yellow|Grey)/.test(name)) return "iFlex Bollard";
      return null;
    };

    sortedProducts.forEach((product) => {
      let groupKey = product.name;

      // Define grouping patterns based on product names
      // Products that should NOT be grouped (individual products):
      if (
        product.name === "Car Stop" ||
        product.name === "Coach Stop" ||
        product.name === "Truck Stop" ||
        product.name === "Sign Cap" ||
        (product.name.startsWith("Slide Gate") &&
          !product.name.includes("iFlex")) ||
        product.name === "Atlas Double Traffic Barrier" ||
        product.name === "iFlex Double Traffic Plus" ||
        product.name === "iFlex Single Traffic Plus"
      ) {
        groupKey = product.name;
      } else if (product.name.includes("iFlex Slide Gate")) {
        groupKey = "iFlex Slide Gate";
      } else if (product.category === "bollards") {
        // Bollard category — defer to the bollard helper. If it returns
        // null we still want SOME group (single-card) so use the raw
        // name. This keeps the bollard grouping logic in one place.
        groupKey = resolveBollardGroupKey(product.name) ?? product.name;
      } else if (product.name.includes("Traffic Gate"))
        groupKey = "Traffic Gate";
      else if (product.name.includes("Hydraulic Swing Gate"))
        groupKey = "Hydraulic Swing Gate";
      else if (product.name.includes("eFlex Single Rack End Barrier"))
        groupKey = "eFlex Single Rack End Barrier";
      else if (product.name.includes("eFlex Double Rack End Barrier"))
        groupKey = "eFlex Double Rack End Barrier";
      else if (
        product.name.includes("ForkGuard Kerb Barrier") &&
        !product.name.includes("HD")
      )
        groupKey = "ForkGuard Kerb Barrier";
      else if (product.name.includes("HD ForkGuard Kerb Barrier"))
        groupKey = "HD ForkGuard Kerb Barrier";
      else if (
        product.name.includes("FlexiShield Column Guard") &&
        !product.name.includes("Spacer")
      )
        groupKey = "FlexiShield Column Guard";
      else if (product.name.includes("FlexiShield Corner Guard"))
        groupKey = "FlexiShield Corner Guard";
      else if (product.name.includes("Step Guard"))
        groupKey = "Step Guard";
      else if (product.name.includes("iFlex RackGuard"))
        groupKey = "iFlex RackGuard";
      else if (product.name.includes("Cold Store RackGuard"))
        groupKey = "Cold Store RackGuard";
      else if (product.name.includes("iFlex Rail Column Guard+"))
        groupKey = "iFlex Rail Column Guard+";
      else if (product.name.includes("iFlex Rail Column Guard"))
        groupKey = "iFlex Rail Column Guard";
      else if (product.name.includes("Slider Plate"))
        groupKey = "Slider Plate";

      // Phantom parent detection: a "Heavy Duty Bollard"-style row that
      // has no price, no SKU, and no variants. We still want it to
      // contribute *metadata* (impact rating, description, image) to the
      // grouped card, but it must NOT appear as a selectable variant
      // because it has nothing to add to cart.
      const productPriceNum = parseFloat(String(product.price ?? 0));
      const variantPriceNumbers = ((product.specifications?.variants ??
        product.variants ??
        []) as any[])
        .map((v: any) => parseFloat(v?.price ?? 0))
        .filter((n) => Number.isFinite(n) && n > 0);
      const isPhantomParent =
        (!productPriceNum || productPriceNum <= 0) &&
        variantPriceNumbers.length === 0;

      if (!groupedProducts[groupKey]) {
        groupedProducts[groupKey] = {
          ...product,
          name: groupKey,
          productVariants: [],
          // Seed min/max from the first priced sibling we see; we'll
          // tighten these as more products land in the group. Using
          // Infinity sentinels avoids the historical `0` floor that let
          // a phantom parent set minPrice to 0.
          minPrice: Infinity,
          maxPrice: 0,
          hasVariants: false,
        };
      }

      // Skip phantom parents from the variant list (they have no SKU
      // and no price — letting them in confuses the variant picker)
      // but keep them as a metadata source. If a phantom parent is
      // processed AFTER its priced siblings have already seeded the
      // group, we still want to fold its impact rating / image /
      // description across — these are the fields the phantom row
      // typically carries that the priced rows lack.
      if (!isPhantomParent) {
        groupedProducts[groupKey].productVariants.push(product);
      } else {
        if (product.category === "bollards") {
          console.warn(
            `[products] Treating "${product.name}" (id=${product.productId}) as a phantom bollard parent — no price, no variants. ` +
              `Surfacing siblings under group "${groupKey}" instead. ` +
              `If this is unexpected, check that price-list ingest matched the variant SKUs.`,
          );
        }
        const cur = groupedProducts[groupKey];
        const fillIfMissing = (key: string) => {
          if (
            (cur as any)[key] == null ||
            (cur as any)[key] === "" ||
            (cur as any)[key] === false
          ) {
            const v = (product as any)[key];
            if (v != null && v !== "" && v !== false) {
              (cur as any)[key] = v;
            }
          }
        };
        fillIfMissing("impactRating");
        fillIfMissing("imageUrl");
        fillIfMissing("lifestyleImageUrl");
        fillIfMissing("description");
        fillIfMissing("pas13Compliant");
        fillIfMissing("pas13TestJoules");
        fillIfMissing("technicalSheetUrl");
        fillIfMissing("installationGuideUrl");
      }

      // Check if product has variants in specifications
      let hasSpecVariants = false;
      let specMinPrice = productPriceNum;
      let specMaxPrice = productPriceNum;

      if (
        product.specifications &&
        product.specifications.variants &&
        Array.isArray(product.specifications.variants)
      ) {
        hasSpecVariants = product.specifications.variants.length > 1;
        if (hasSpecVariants) {
          const variantPrices = product.specifications.variants
            .map((v: any) => parseFloat(v.price || 0))
            .filter((p: number) => p > 0);
          if (variantPrices.length > 0) {
            specMinPrice = Math.min(...variantPrices);
            specMaxPrice = Math.max(...variantPrices);
          }
        }
      }

      // Only fold a price into the min/max if it's actually positive.
      // The phantom parent's null/0 price is silently ignored here so
      // the grouped card shows the real "AED X — AED Y" band, not an
      // "AED 0 — …" floor.
      const bandCandidates = [
        groupedProducts[groupKey].minPrice,
        groupedProducts[groupKey].maxPrice,
        ...(productPriceNum > 0 ? [productPriceNum] : []),
        ...(specMinPrice > 0 ? [specMinPrice] : []),
        ...(specMaxPrice > 0 ? [specMaxPrice] : []),
      ].filter((n) => Number.isFinite(n) && n > 0);
      if (bandCandidates.length > 0) {
        groupedProducts[groupKey].minPrice = Math.min(...bandCandidates);
        groupedProducts[groupKey].maxPrice = Math.max(...bandCandidates);
      }

      groupedProducts[groupKey].hasVariants =
        groupedProducts[groupKey].productVariants.length > 1 || hasSpecVariants;

      // Use the lowest priced variant's data as the base (so the card
      // hero image / description comes from a real SKU). Skip phantom
      // parents — we don't want them stamping their metadata over a
      // priced sibling. We DO preserve the existing group's
      // impactRating / image / description / pas13 fields when the
      // priced sibling doesn't have them — those typically come from
      // the phantom parent ("iFlex Heavy Duty Bollard" has the
      // 5,700 J rating but no price; the priced colour variants have
      // a price but no rating). Without this, the card would lose its
      // impact badge as soon as a priced sibling won the min-price
      // slot.
      const groupMin = groupedProducts[groupKey].minPrice;
      const matchesMin =
        productPriceNum > 0 && productPriceNum === groupMin;
      const variantMatchesMin =
        product.specifications?.variants && specMinPrice === groupMin;
      if (!isPhantomParent && (matchesMin || variantMatchesMin)) {
        const prev = groupedProducts[groupKey];
        const preserveIfPresent = (key: string, fallback?: any) =>
          (product as any)[key] != null && (product as any)[key] !== ""
            ? (product as any)[key]
            : (prev as any)[key] ?? fallback;
        groupedProducts[groupKey] = {
          ...prev,
          ...product,
          name: groupKey,
          // Restore aggregate fields after the spread.
          productVariants: prev.productVariants,
          minPrice: prev.minPrice,
          maxPrice: prev.maxPrice,
          hasVariants: prev.hasVariants,
          variants:
            product.specifications?.variants || product.variants,
          // Fields that typically come from the phantom parent and
          // shouldn't be lost when a priced sibling wins the merge.
          impactRating: preserveIfPresent("impactRating"),
          imageUrl: preserveIfPresent("imageUrl"),
          lifestyleImageUrl: preserveIfPresent("lifestyleImageUrl"),
          description: preserveIfPresent("description"),
          pas13Compliant: preserveIfPresent("pas13Compliant"),
          pas13TestJoules: preserveIfPresent("pas13TestJoules"),
          technicalSheetUrl: preserveIfPresent("technicalSheetUrl"),
          installationGuideUrl: preserveIfPresent("installationGuideUrl"),
        };
      }
    });

    // Drop any group that ended up empty (phantom-only with no priced
    // siblings) — we'd rather hide the card entirely than show "AED 0".
    // Also normalise the Infinity sentinel back to 0 / null on cards
    // that legitimately have no priced variants (e.g. an isolated Sign
    // Cap with no price), so the client doesn't choke on Infinity.
    for (const key of Object.keys(groupedProducts)) {
      const g = groupedProducts[key];
      if (!g.productVariants || g.productVariants.length === 0) {
        console.warn(
          `[products] Dropping empty group "${key}" — no priced variants resolved.`,
        );
        delete groupedProducts[key];
        continue;
      }
      if (!Number.isFinite(g.minPrice) || g.minPrice === Infinity) {
        g.minPrice = parseFloat(String(g.price ?? 0)) || 0;
      }
      if (!Number.isFinite(g.maxPrice) || g.maxPrice === 0) {
        g.maxPrice = parseFloat(String(g.price ?? 0)) || g.minPrice;
      }
    }

    const allGrouped = Object.values(groupedProducts);

    // Support pagination if page/pageSize are provided
    const pageNum = page ? parseInt(page, 10) : undefined;
    const pageSizeNum = pageSize ? parseInt(pageSize, 10) : undefined;

    if (pageNum && pageSizeNum) {
      const start = (pageNum - 1) * pageSizeNum;
      const paginated = allGrouped.slice(start, start + pageSizeNum);
      return c.json({
        products: paginated,
        total: allGrouped.length,
        page: pageNum,
        pageSize: pageSizeNum,
      });
    } else {
      return c.json(allGrouped);
    }
  } catch (error) {
    console.error("Error fetching products:", error);
    return c.json({ message: "Failed to fetch products" }, 500);
  }
});

// GET /api/products/recommendations/:jouleRating
// NOTE: This must be registered BEFORE /api/products/:id to avoid
// "recommendations" being captured as an :id param.
products.get("/products/recommendations/:jouleRating", async (c) => {
  try {
    const jouleRating = parseFloat(c.req.param("jouleRating"));
    if (isNaN(jouleRating)) {
      return c.json({ message: "Invalid joule rating" }, 400);
    }

    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const recommendations = await storage.getProductRecommendations(jouleRating);
    return c.json(recommendations);
  } catch (error) {
    console.error("Error fetching product recommendations:", error);
    return c.json({ message: "Failed to fetch recommendations" }, 500);
  }
});

// GET /api/products/variants/:baseName
// NOTE: This must be registered BEFORE /api/products/:id to avoid
// "variants" being captured as an :id param.
products.get("/products/variants/:baseName", async (c) => {
  try {
    const baseName = decodeURIComponent(c.req.param("baseName"));
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);
    const variants = await storage.getProductVariants(baseName);
    return c.json(variants);
  } catch (error) {
    console.error("Error fetching product variants:", error);
    return c.json({ message: "Failed to fetch product variants" }, 500);
  }
});

// GET /api/products/:id
products.get("/products/:id", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    // URL decode the product ID to handle special characters like em-dashes
    const productId = decodeURIComponent(c.req.param("id"));
    console.log("Fetching product with ID:", productId);
    console.log("Raw param received:", c.req.param("id"));

    let product = await storage.getProduct(productId);

    // If not found, try converting em-dashes to triple hyphens (common ID format issue)
    if (!product && productId.includes("\u2013")) {
      const alternativeId = productId.replace(/\u2013/g, "---");
      console.log(`Trying alternative ID format: ${alternativeId}`);
      product = await storage.getProduct(alternativeId);
    }

    // If still not found, try converting triple hyphens to em-dashes
    if (!product && productId.includes("---")) {
      const alternativeId = productId.replace(/---/g, "\u2013");
      console.log(`Trying em-dash ID format: ${alternativeId}`);
      product = await storage.getProduct(alternativeId);
    }

    // Also try searching by name if ID lookup fails
    if (!product) {
      console.log("Attempting product lookup by name similarity");
      const nameBasedProduct = await storage.getProductByNameSimilarity(productId);
      if (nameBasedProduct) {
        product = nameBasedProduct;
      }
    }

    if (!product) {
      console.log(`Product not found after all attempts: ${productId}`);
      return c.json({ message: "Product not found" }, 404);
    }

    // Calculate hasVariants based on specifications
    let hasVariants = false;
    let productVariants: any[] = [];

    // Check if product has variants in specifications
    if (
      product.specifications &&
      (product.specifications as any).variants &&
      Array.isArray((product.specifications as any).variants)
    ) {
      hasVariants = (product.specifications as any).variants.length > 1;
      productVariants = (product.specifications as any).variants;
    }

    // Also try to fetch related product variants based on the product name
    // This helps with grouped products
    try {
      const baseName = product.name
        .replace(/\s*[-\u2013]\s*\d+\s*mm(\s*[-\u2013]\s*\d+\s*mm)?/gi, "")
        .replace(
          /\s*[-\u2013]\s*(standard|plus|heavy[-\s]?duty|light[-\s]?duty)/gi,
          ""
        )
        .replace(/\s*[-\u2013]\s*(single|double|triple|quad)/gi, "")
        .replace(/\s*[-\u2013]\s*\d+\s*sides?/gi, "")
        .replace(/\s*\(\d+\s*rails?\)/gi, "")
        .trim();

      const variants = await storage.getProductVariants(baseName);
      if (variants && variants.length > 1) {
        hasVariants = true;
        productVariants = variants;
      }
    } catch (err) {
      // If fetching variants fails, just use what we have
      console.log("Could not fetch product variants:", err);
    }

    return c.json({
      ...product,
      hasVariants,
      productVariants: productVariants.length > 0 ? productVariants : undefined,
      variants:
        (product.specifications as any)?.variants || (product as any).variants,
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    return c.json({ message: "Failed to fetch product" }, 500);
  }
});

// =============================================
// SEARCH ROUTE
// =============================================

// GET /api/search
products.get("/search", async (c) => {
  try {
    const db = getDb(c.env.DATABASE_URL);
    const storage = createStorage(db);

    const q = c.req.query("q");
    const type = c.req.query("type") || "all";

    if (!q || q.length < 2) {
      return c.json({
        products: [],
        resources: [],
        caseStudies: [],
        orders: [],
        faqs: [],
      });
    }

    // Get userId for user-specific searches (orders) — optional auth
    let userId: string | undefined;
    try {
      const user = c.get("user");
      userId = user?.claims?.sub;
    } catch {
      // Not authenticated — that's fine, userId stays undefined
    }

    // Perform comprehensive search
    const searchResults = await storage.searchAll(q, type, userId);

    console.log(`Search query: "${q}", type: "${type}", results:`, {
      products: searchResults.products.length,
      resources: searchResults.resources.length,
      caseStudies: searchResults.caseStudies.length,
      orders: searchResults.orders.length,
      faqs: searchResults.faqs.length,
    });

    return c.json(searchResults);
  } catch (error) {
    console.error("Search error:", error);
    return c.json(
      {
        message: "Search failed",
        products: [],
        resources: [],
        caseStudies: [],
        orders: [],
        faqs: [],
      },
      500
    );
  }
});

export default products;
