# A-SAFE Engage CF: Current Product Schema & Pricing Data Map

**Report Date:** 2026-04-20  
**Database:** PostgreSQL (Neon) via Drizzle ORM  
**Current Price List:** PRL-1019-ASF-AED-07112025-1 (pricelist-aed-2025v1.json)

---

## 1. Products Schema

### Core Products Table
**File:** `shared/schema.ts` (lines 328–364)  
**Table Name:** `products`

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar (PK) | UUID, gen_random_uuid() default |
| `name` | varchar | Product family name (e.g. "iFlex Single Traffic Barrier") |
| `category` | varchar | traffic-guardrails, pedestrian-guardrails, bollards, column-protection, rack-protection, height-restrictors, topple-barriers, accessories, etc. |
| `subcategory` | varchar (nullable) | single-rail, double-rail, rack-end, corner-protection, etc. |
| `description` | text | Full product description |
| `specifications` | jsonb (nullable) | Technical specs: impactRating, vehicleTest, heightRange, variants array, variantCount, etc. |
| `impactRating` | integer (nullable) | Energy absorption in joules |
| `heightMin` | integer (nullable) | Minimum height in mm |
| `heightMax` | integer (nullable) | Maximum height in mm |
| `pas13Compliant` | boolean | PAS 13:2017 certification flag (default: false) |
| `pas13TestMethod` | varchar (nullable) | pendulum, vehicle, sled |
| `pas13TestJoules` | integer (nullable) | Joules tested per PAS 13 |
| `pas13Sections` | jsonb (nullable) | Array of compliant PAS 13 sections |
| `pas13CertificationDate` | timestamp (nullable) | When testing was conducted |
| `deflectionZone` | integer (nullable) | Deflection zone in mm per PAS 13 |
| `price` | decimal(10,2) (nullable) | Fixed unit price (for per_unit products) |
| `basePricePerMeter` | decimal(10,2) (nullable) | Price per linear meter (for per_meter products) |
| `currency` | varchar | Default: "AED" |
| `imageUrl` | varchar (nullable) | Product image URL |
| `technicalSheetUrl` | varchar (nullable) | PDF datasheet URL |
| `applications` | jsonb (nullable) | Array of application areas (Warehousing, Racking Protection, etc.) |
| `industries` | jsonb (nullable) | Array of suitable industries (Logistics, Manufacturing, etc.) |
| `features` | jsonb (nullable) | Array of key features |
| `pricingLogic` | varchar (nullable) | "per_meter" or "per_unit" — determines how quantity is interpreted |
| `minimumOrderMeters` | decimal(8,2) (nullable) | Minimum order quantity in meters (for barriers) |
| `isActive` | boolean | Default: true |
| `createdAt` | timestamp | Auto-default |
| `updatedAt` | timestamp | Auto-default |

**Indexes:** None explicit on products table.

**Key Insight:** Products table stores a single flat row per product family. Pricing variants are stored in the `product_pricing` table (see below), not in the products table.

---

### Product Pricing Table
**File:** `shared/schema.ts` (lines 559–579)  
**Table Name:** `product_pricing`

| Column | Type | Notes |
|--------|------|-------|
| `id` | varchar (PK) | UUID |
| `productName` | varchar | Links to product.name (product family name) |
| `pricingType` | varchar | 'linear_meter' (for barriers) or 'per_item' (for bollards, guards) |
| `tier1Min` | varchar | Minimum quantity for tier 1 (e.g. "1") |
| `tier1Max` | varchar | Maximum quantity for tier 1 (e.g. "2") |
| `tier1Price` | varchar | Price in AED for tier 1 |
| `tier2Min` | varchar | Tier 2 minimum (e.g. "2") |
| `tier2Max` | varchar | Tier 2 maximum (e.g. "10") |
| `tier2Price` | varchar | Tier 2 price |
| `tier3Min` | varchar | Tier 3 minimum (e.g. "10") |
| `tier3Max` | varchar | Tier 3 maximum (e.g. "20") |
| `tier3Price` | varchar | Tier 3 price |
| `tier4Min` | varchar | Tier 4 minimum (e.g. "20") |
| `tier4Max` | varchar | Tier 4 maximum (unlimited, often "inf") |
| `tier4Price` | varchar | Tier 4 price (bulk rate) |
| `currency` | varchar | Default: "AED" |
| `isActive` | boolean | Default: true |
| `createdAt` | timestamp | Auto-default |
| `updatedAt` | timestamp | Auto-default |

**Key Insight:** Tiered pricing is stored here, but prices are stored as varchar (not decimal). Tiers are quantity-based, not length-based. For barriers where pricing varies by length (mm), there is **no direct support in this table** — length variants are handled by the seedProducts.ts script which creates separate product records per length, or via the pricelist-aed-2025v1.json which has explicit variant entries.

---

### Cart Items Table
**File:** `shared/schema.ts` (lines 513–556)  
**Table Name:** `cart_items`

| Column | Type | Key Pricing Fields |
|--------|------|-------------------|
| `id` | varchar (PK) | |
| `userId` | varchar (FK) | Links to users.id |
| `productName` | varchar | Product family name |
| `unitPrice` | real | Price per unit or per meter |
| `quantity` | real | For barriers: meters; for items: pieces |
| `totalPrice` | real | unitPrice × quantity |
| `pricingTier` | varchar (nullable) | Tier name or label (e.g. "tier2", "2-10m") |
| `pricingType` | varchar | 'linear_meter' or 'per_item' — matches product.pricingLogic |
| `notes` | text (nullable) | User notes |
| `applicationArea` | text (nullable) | Where product will be installed |
| `requiresDelivery` | boolean | Default: false |
| `requiresInstallation` | boolean | Default: false |
| `columnLength` | varchar (nullable) | For column guards: length in mm |
| `columnWidth` | varchar (nullable) | For column guards: width in mm |
| `sidesToProtect` | integer (nullable) | For column guards: 1–4 |
| `lengthSpacers` | integer (nullable) | For FlexiShield: number of 100mm spacer pairs |
| `widthSpacers` | integer (nullable) | For FlexiShield: number of 100mm spacer pairs |
| `restrictorHeight` | decimal (nullable) | For height restrictor |
| `restrictorWidth` | decimal (nullable) | For height restrictor |
| `toppleHeight` | decimal (nullable) | For topple barrier |
| `toppleWidth` | decimal (nullable) | For topple barrier |
| `calculatorImages` | jsonb (nullable) | Array of image URLs from product configurator |
| `selectedVariant` | jsonb (nullable) | { itemId, variant, length, width, height, price, code } |
| `impactCalculationId` | varchar (FK, nullable) | Links to impact calculations |
| `calculationContext` | jsonb (nullable) | Calculation details for display |
| `referenceImages` | jsonb (nullable) | Array of { url, caption, uploadedAt } |
| `installationLocation` | text (nullable) | Installation detail |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**No explicit indexes on cart_items.**

---

### Quote Request Items Table
**File:** `shared/schema.ts` (lines 488–510)  
**Table Name:** `quote_request_items`

Similar structure to cart_items, with same pricingType/pricingTier fields. Stores line items for submitted quotes.

---

### Other Product-Related Tables

| Table | Lines | Purpose |
|-------|-------|---------|
| `product_media` | 264–280 | Images, videos, PDFs per product (media_type, category, tags) |
| `application_types` | 283–296 | Predefined application areas (Column Protection, Rack Protection, etc.) |
| `product_application_compatibility` | 299–308 | M-to-M: which products suit which applications |
| `vehicle_types` | 236–261 | Vehicle catalog (forklifts, trucks, pallet trucks) with weight specs |
| `vehicle_product_compatibility` | 311–325 | M-to-M: which products suit which vehicles; includes testedConfiguration flag |
| `productResources` | 428–435 | M-to-M: links products to technical sheets, installation guides, etc. |

---

## 2. Seed & Fixture Data

### seedProducts.ts
**File:** `scripts/seedProducts.ts`  
**Creates:** Product records from CSV data (lines 308–364)

**Flow:**
1. Reads two CSVs from `attached_assets/`:
   - `asafe_products_complete_1755642527052.csv` — tiered pricing, impact ratings, image URLs
   - `asafe_master_database_normalized_1756063447141.csv` — dimensions, heights, variants
2. Merges them by product family name (case-insensitive)
3. For each family, inserts one row into `products` table

**Product Families Seeded (14 from hardcoded list):**
- eFlex Single Rack End Barrier (per_unit)
- eFlex Double Rack End Barrier (per_unit)
- Atlas Double Traffic Barrier (per_meter)
- Atlas Double Traffic Barrier+ (per_meter)
- eFlex Single Traffic Barrier (per_meter)
- eFlex Single Traffic Barrier+ (per_meter)
- iFlex Double Traffic Barrier (per_meter)
- iFlex Double Traffic Barrier+ (per_meter)
- iFlex Single Traffic Barrier (per_meter)
- iFlex Single Traffic Barrier+ (per_meter)
- mFlex Single Traffic Barrier (per_meter)
- mFlex Double Traffic Barrier (per_meter)
- flexishield column guard (per_unit)
- flexishield corner guard (per_unit)
- iflex height restrictor (per_unit, PAS 13 compliant)

**Specifications Created:**
```javascript
{
  impactRating: "X Joules",        // e.g. "41,000 Joules"
  vehicleTest: "...",               // e.g. "10.6T at 10 km/h"
  heightRange: "Ymin-Ymax mm",      // e.g. "1000-2400 mm"
  variants: [ "variant1", ... ],    // First 10 unique variants
  variantCount: N                    // Total variant count
}
```

**SKU Naming:** None explicitly used in seed; productName is the family name.

**Pricing:** Baked into CSV source data; base price pulled into `products.price` (per_unit) or `products.basePricePerMeter` (per_meter).

---

### updateProductImages.ts
**File:** `scripts/updateProductImages.ts` (lines 11–50+)  
**Updates:** `products.imageUrl` field with A-SAFE CDN URLs

**Mapping:** Hardcoded product-name-to-URL map. Example:
```javascript
"Atlas Double Traffic Barrier": 
  "https://webcdn.asafe.com/media/2948/atlas-double-traffic-barrier_qu.jpg"
```

**Scope:** ~35+ product names mapped to verified CDN URLs.

---

## 3. Price Fixtures & JSON Data

### pricelist-aed-2025v1.json
**File:** `scripts/data/pricelist-aed-2025v1.json` (428 lines)  
**Format:** Category-based structure with product families and length variants

**Structure:**
```json
{
  "_meta": {
    "source": "PRL-1019-ASF-AED-07112025-1",
    "version": "2025v1",
    "currency": "AED",
    "effectiveDate": "2025-11-07",
    "notes": [
      "Length column listed as Ft on barriers but source-of-truth is mm",
      "Barriers priced per-length SKU. Bollards, guards, accessories priced per unit.",
      "RackGuard row is a rate card — multiple sizes roll up to one AED rate.",
      "Hydraulic Swing Gate 'remaining sizes' require quote-system lookup."
    ]
  },
  "categories": [
    {
      "category": "Pedestrian Barriers",
      "products": [
        {
          "family": "eFlex Pedestrian Barrier",
          "priceBy": "length",
          "variants": [
            { "name": "eFlex Pedestrian Barrier - 1000mm", "lengthMm": 1000, "priceAed": 1806.96 },
            ...
          ]
        },
        ...
      ]
    },
    {
      "category": "Traffic Barriers",
      "products": [ ... ]
    },
    {
      "category": "Topple Barrier",
      "products": [ ... ]
    },
    {
      "category": "Bollards",
      "products": [ ... ]
    },
    // ... and more categories
  ]
}
```

**Categories in Pricelist:**
1. Pedestrian Barriers
2. Traffic Barriers
3. Topple Barrier
4. Bollards
5. Column Protection
6. Accessories
7. Swing Gate / Gate Systems
8. Truck/Coach/Car Stops
9. Height Restrictors
10. RackGuard Kerb Barriers
11. Dock Buffers
12. Slider Base Plates

**Key Points:**
- Prices are **per-length SKU**, not tiered by quantity (e.g., same 1000mm barrier always costs X regardless of qty)
- Barriers specified in **mm, not feet** (despite note mentioning "Ft on barriers")
- Bollards, guards, accessories priced **per unit**
- New products flagged with `"isNew": true` (e.g., 130-T0-P3, 190-T1-P2, etc.)
- RackGuard is a "rate card" — single price covers multiple profile sizes

**95+ SKUs** represented as individual variant entries (family + lengthMm combinations).

---

## 4. Worker Pricing Logic

### pricing.ts
**File:** `worker/routes/pricing.ts`

**Key Routes:**
- `POST /api/product-pricing/calculate` — calls `storage.calculatePrice(productName, quantity)`
- `GET /api/discount-limit?subtotal=<AED>` — returns discount cap tier for order subtotal
- `GET /api/product-pricing` — fetches all product_pricing records
- `POST /api/linkedin-discount` — social discount tracking
- `GET /api/service-care-options` — service tier options

**Discount Cap Logic:**
```typescript
// From shared/discountLimits.ts (referenced)
getDiscountTier(subtotalAed): {
  cap: percent,
  label: string,
  rationale: string
}
```
Returns hard ceiling and tiered caps based on order value.

---

### storage.ts
**File:** `worker/storage.ts`

**Key Methods:**
- `async getProductPricing(): Promise<ProductPricing[]>` (line 1760) — returns all rows from product_pricing table
- `async getProductPricingByName(productName): Promise<any>` (line 1768) — filter by productName
- `async calculatePrice(productName, quantity): Promise<{ unitPrice, totalPrice, tier, requiresQuote? }>` (line 1776) — applies tiered pricing logic

**calculatePrice Logic:**
1. Look up product_pricing by productName
2. If not found → `requiresQuote: true`
3. If found, match quantity against tier ranges (tier1Min–Max, tier2Min–Max, etc.)
4. Return price for applicable tier + tier label

**No per-unit-vs-per-meter distinction in calculatePrice** — it simply matches qty against tier bounds. Length variants must be handled at the product family level or in the UI.

---

## 5. Currency Handling

### currency.ts
**File:** `shared/currency.ts`

**Currency Options:**
```typescript
export const CURRENCY_OPTIONS = [
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' }
];

export const DEFAULT_CURRENCY = 'AED';
```

**Base Currency:** AED (United Arab Emirates Dirham)

**FX Rates Table:**
- `currency_rates` (schema.ts, lines 895–903)
  - `baseCurrency` varchar (default: "AED")
  - `targetCurrency` varchar
  - `rate` decimal(12,6)
  - `lastUpdated` timestamp
  - Unique constraint on (baseCurrency, targetCurrency)

**No live FX conversion code found** in worker/routes/pricing.ts or worker/storage.ts. Prices are assumed AED throughout. If multi-currency support is needed, FX conversion would need to be added at the endpoint level.

**Order Table:**
- `orders.currency` (varchar, default: "AED") — stores order currency, but not used for conversion in current code

---

## 6. Migrations

**Directory:** `/Users/thomaschilds/asafe-engage-cf/migrations/`  
**Status:** Empty or not tracked in this repo. Schema is managed via Drizzle ORM (`shared/schema.ts`) with `npx drizzle-kit generate` / `npx drizzle-kit migrate`.

No explicit SQL migration files found. Drizzle generates and applies migrations from the TypeScript schema definition.

---

## 7. Unit System (mm/m vs in/ft)

### Client-Side Unit Representation

**Barriers:**
- Stored in **millimeters (mm)** in schema
- Displayed to users in **mm** in pricelist (e.g., "eFlex Single Traffic Barrier - 1000mm")
- Quantity in cart interpreted as **meters** for per_meter products (via `pricingType: 'linear_meter'`)
- Example: iFlex Single Traffic Barrier 1000mm costs AED 2,817.48; if you add 5 "units", qty=5 means 5 meters, not 5 pieces

**Cart Item Quantity Field:**
- `cartItems.quantity` (real) — ambiguous: "For barriers: meters, for items: pieces"
- `cartItems.pricingType` disambiguates: 'linear_meter' → interpret qty as meters; 'per_item' → interpret qty as pieces

**No Feet/Inch Support:**
- Pricelist note says "Length column listed as Ft on barriers but source-of-truth is mm"
- No conversion logic found in codebase
- UI always displays mm (e.g., "Length - 1000mm" in AddToCartModal.tsx line ~)

**Height Restrictor & Topple Barrier:**
- Stored with min/max height in mm
- `pricingUtils.ts` (lines 31–35) checks for "height restrictor" or "topple barrier" in name to reverse price display (show highest-to-lowest instead of lowest-to-highest)

---

## 8. Product Variant Modeling

**Key Fields:**

1. **products.specifications (jsonb)**
   - Contains: impactRating, vehicleTest, heightRange, variants[], variantCount
   - Not used for pricing or SKU — just metadata

2. **cartItems.selectedVariant (jsonb)**
   - { itemId, variant, length, width, height, price, code }
   - Allows capturing user-selected variant details at add-to-cart time

3. **pricelist-aed-2025v1.json variants[]**
   - { name, lengthMm, priceAed } — explicit per-length pricing
   - E.g., iFlex Single Traffic comes in 1000mm, 1200mm, 1600mm, etc., each with own price

**No Product Variants Table:**
- Missing a dedicated table (e.g., product_variants) that would link variants to product.id
- Current model: one `products` row per family, with pricing variance handled externally (pricelist.json, product_pricing tiers)
- **GOTCHA:** Reconciling the pricelist's per-length-SKU model against products table's single-family-per-row model will require ETL logic or schema redesign

---

## 9. Per-Meter vs Per-Unit Pricing

**Field:** `products.pricingLogic` (varchar)

**Values Observed:**
- "per_meter" → barriers (eFlex/iFlex/Atlas traffic, pedestrian, topple)
- "per_unit" → bollards, column guards, accessories, height restrictors

**Cart Interpretation:**
- `cartItems.pricingType` mirrors pricingLogic
- If 'linear_meter': qty is in meters, unitPrice is per meter, totalPrice = unitPrice × qty
- If 'per_item': qty is in pieces, unitPrice is per piece, totalPrice = unitPrice × qty

**Pricing Logic:**
- No special handling in calculatePrice (worker/storage.ts line 1776) — just matches qty to tier
- Tier naming (e.g., "1-2m", "2-10m") suggests meters, but stored as varchar so ambiguous

---

## 10. Gotchas & Reconciliation Issues

### Issue 1: Length-Variant Pricing vs Tiered Quantity Pricing
**Current State:** product_pricing table has 4 tiers (tier1–4) based on quantity, but **no length column**.  
**Pricelist State:** Each length variant (1000mm, 1200mm, 2000mm, etc.) has a fixed price, not quantity-tiered.  
**Reconciliation Approach:** 
- Option A: Keep pricelist structure, add lengthMm column to product_pricing and rework calculatePrice
- Option B: Flatten pricelist into product-per-length records (e.g., separate product record "iFlex Single Traffic Barrier 1000mm" with a single fixed price)
- Current code assumes Option B (seedProducts.ts would need update)

### Issue 2: No SKU Field
**Current:** productName used as SKU (e.g., "iFlex Single Traffic Barrier - 1000mm")  
**Risk:** If two products have same name or name changes, cart/order records break  
**Best Practice:** Add explicit `sku` varchar field to products table, use in cartItems/orders instead of productName

### Issue 3: Currency Conversion Table Present But Unused
**currency_rates table exists but no code references it.** All pricing assumes AED. If supporting multi-currency orders, need to:
1. Populate currency_rates table
2. Add conversion logic to calculatePrice endpoint
3. Convert order.totalAmount based on order.currency

### Issue 4: Per-Meter Quantity Ambiguity
**cartItems.quantity is real (decimal).** For barriers, if quantity=2.5, does it mean 2.5 meters? Or 2 pieces + 0.5 meter?  
**Suggestion:** Rename to `quantityMeters` (for barriers) or add explicit `unit` field (meters/pieces).

### Issue 5: pricingUtils.ts Height Restrictor Magic String
**Lines 32–35** check for "height restrictor" or "topple barrier" in product name to reverse sort prices. Fragile.  
**Better:** Add `isHeightRestrictor: boolean` or `priceSortDirection: 'asc' | 'desc'` to products table.

---

## Summary Table: Which Table Has What

| Concept | Table | Field(s) |
|---------|-------|----------|
| Product family | products | id, name, category, pricingLogic |
| Impact rating | products | impactRating, pas13* |
| Length/height specs | products | heightMin, heightMax |
| Unit price (per-meter) | products | basePricePerMeter |
| Unit price (per-unit) | products | price |
| Tiered quantity pricing | product_pricing | tier1–4 (Min/Max/Price) |
| Cart line item | cartItems | productName, quantity, unitPrice, totalPrice, pricingType |
| Variant selection | cartItems.selectedVariant | itemId, variant, length, width, height, price, code |
| Currency | orders, currency_rates | orders.currency; FX rates in currency_rates table |
| PAS 13 compliance | products, vehicle_product_compatibility | pas13*, testedConfiguration |

---

## Reconciliation Checklist for New AED Price List

- [ ] **New Products:** Do any new product families in pricelist (e.g., 130-T0-P3, 190-T*) exist in products table?
- [ ] **Length Variants:** Are length-specific prices (1000mm, 1200mm, 2000mm) represented as separate product records or tier pricing?
- [ ] **Currency:** Pricelist is AED; orders.currency will default to AED. No conversion needed unless supporting other currencies.
- [ ] **Effective Date:** Update seedProducts or loader to use effectiveDate "2025-11-07" for audit trail.
- [ ] **Rate Cards:** RackGuard is a "rate card" (multiple sizes → single price). Verify this maps to single product_pricing row.
- [ ] **SKU Collisions:** Check for duplicates between new pricelist and existing product_pricing (by productName).
- [ ] **Quote System:** Note mentions "Remaining Hydraulic Swing Gate sizes require quote lookup." Ensure cart UI shows "Contact for pricing" if no tier matches.
- [ ] **Tier vs Length:** Decide: are tiers by quantity (current product_pricing model) or by length (pricelist model)?

