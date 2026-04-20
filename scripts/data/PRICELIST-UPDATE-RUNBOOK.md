# Price List Update — Runbook

**Source:** PRL-1019-ASF-AED-07112025-1 (AED, effective 2025-11-07)
**Version:** 2025v1

This runbook applies the latest A-SAFE UAE price list + new products to
the live DB, plus enriches the catalog with metadata scraped from
asafe.com.

---

## What this delivers

1. **Up-to-date AED pricing** for 52 product families, 151 priced SKUs.
2. **New products** flagged on the price list (`130-T0-P3`, `190-T1-P0`,
   `190-T1-P2`, `190-T2-P0`, `190-T2-P1`) created with correct categories.
3. **Cold Storage variants** as first-class products (CS iFlex Pedestrian
   3 Rail, CS iFlex Single Traffic+, CS iFlex Single Traffic, Cold
   Storage iFlex 190 Bollard, Cold Storage RackGuard).
4. **Exact per-length pricing** via the new `product_variants` table.
   Code that reads `products.price` / `products.basePricePerMeter` still
   works (representative values), but the picker will show real SKU prices.
5. **Enriched catalog data** (images, impact ratings, PAS 13 flags,
   install guide URLs) from an automated scrape of asafe.com.

## Files added / changed

| Path | Purpose |
|------|---------|
| `shared/schema.ts` | Added `product_variants` table + new columns on `products` (`sku`, `isNew`, `isColdStorage`, `priceListSource`, `priceListVersion`, `priceListEffectiveDate`, `installationGuideUrl`). |
| `scripts/data/pricelist-aed-2025v1.json` | Canonical structured price list (source of truth for the loader). |
| `scripts/loadPriceList.ts` | Idempotent loader: upserts products + replaces their variants. |
| `scripts/mergeCatalog.ts` | Merges scraped asafe.com data into products (images, specs, impact, PAS 13). |
| `scripts/data/asafe-catalog.json` | Scraped catalog (written by the background scrape agent). |
| `scripts/data/current-schema-report.md` | Reference doc of the current schema + pricing shape. |
| `worker/routes/products.ts` | Added `GET /api/product-variants`; inlines `priceVariants` on `/api/products`; prefers new table over legacy tiers. |
| `worker/storage.ts` | Added `getProductVariants(productId?)`. |

---

## Apply order

```bash
# 1. Push the new schema (adds product_variants table + new columns).
#    This is additive; no existing data is dropped.
DATABASE_URL="<prod>" npm run db:push

# 2. Dry-run the price list loader first to see what will change.
DATABASE_URL="<prod>" npx tsx scripts/loadPriceList.ts --dry-run

# 3. Apply for real.
DATABASE_URL="<prod>" npx tsx scripts/loadPriceList.ts

# 4. Merge the scraped asafe.com catalog once the scrape agent finishes
#    (it writes scripts/data/asafe-catalog.json, now present — 68 products).
#    By default this ONLY enriches existing priced products (images,
#    specs, PAS 13, impact rating) — it does NOT create new rows.
#
#    --create-missing is available if you've sourced prices for the
#    Atlas / mFlex / other catalog-only series and need them in the
#    live app. Do NOT pass it otherwise — quote-only rows without
#    pricing clutter the cart and were deliberately removed.
DATABASE_URL="<prod>" npx tsx scripts/mergeCatalog.ts --dry-run
DATABASE_URL="<prod>" npx tsx scripts/mergeCatalog.ts              # live, enrichment only

# 5. Build + deploy.
npm run deploy
```

---

## Re-running / idempotency

- `loadPriceList.ts` is fully idempotent — it matches by family name
  (case-insensitive), overwrites prices/flags, and `DELETE` + re-inserts
  the variant rows for each family. Running it twice in a row is safe.
- `mergeCatalog.ts` only overwrites empty fields by default. Pass
  `--force` to overwrite non-empty fields (e.g. if we want to refresh
  descriptions from a new scrape).

## Families deliberately NOT in the price list

`seedProducts.ts` still seeds a handful of legacy families
(Atlas Double Traffic Barrier, mFlex variants, legacy Rack End Barriers)
that aren't on the new AED price list. `loadPriceList.ts` leaves those
rows alone (match-by-name means unmatched rows are untouched).

If any of those should be retired from the catalog, the clean move is
`UPDATE products SET is_active=false WHERE name IN (...)` rather than
deleting — order and cart history reference them.

## What the UI will show

- Per-length barriers (iFlex Single Traffic etc.) get a length picker
  with each SKU's exact AED price.
- Per-unit items (bollards, column guards, etc.) get a size/variant
  picker the same way.
- Products flagged `is_new` will render the "NEW" pill (requires a
  frontend tweak if the UI doesn't already honour `isNew`).

## Sanity check queries

```sql
-- Every family now has a priceListSource stamp.
SELECT name, pricing_logic, price, base_price_per_meter, is_new, is_cold_storage,
       price_list_source, price_list_version
FROM products
WHERE price_list_source = 'PRL-1019-ASF-AED-07112025-1'
ORDER BY category, name;

-- Variant count per family.
SELECT p.name, COUNT(pv.id) AS variant_count, MIN(pv.price_aed) AS min_price,
       MAX(pv.price_aed) AS max_price
FROM products p
LEFT JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = true
WHERE p.price_list_source = 'PRL-1019-ASF-AED-07112025-1'
GROUP BY p.name
ORDER BY p.name;

-- New products flagged.
SELECT name, category FROM products WHERE is_new = true;
```

## Rollback

Fully reversible:

```sql
-- Nuke variants loaded by this pricelist run.
DELETE FROM product_variants
WHERE product_id IN (
  SELECT id FROM products WHERE price_list_source = 'PRL-1019-ASF-AED-07112025-1'
);
-- Roll new product families back to is_active=false (not deleted, so
-- cart/order history is preserved).
UPDATE products SET is_active = false
WHERE is_new = true AND price_list_source = 'PRL-1019-ASF-AED-07112025-1';
```

If we need to go further and drop the new table entirely, drizzle-kit
generate + drop the `product_variants` table migration.
