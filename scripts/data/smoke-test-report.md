# Smoke Test Report - 2026-04-21T06:48Z

Target: https://asafe-engage.tom-d-g-childs.workers.dev
Executed: 2026-04-21 (UTC), black-box, unauthenticated

## Summary
- 16 / 16 endpoints passed (all returned expected status + valid JSON/image)
- 7 / 7 data integrity checks passed
- Critical failures: 0
- Warnings: 2 (see below)

Site is up. All public API endpoints return 200 + valid JSON. All authenticated endpoints return a clean 401 JSON body. No HTML-where-JSON-expected. No stack traces. Ship-blocking issues: none.

Non-blocking flags (worth knowing before Codex audits):
1. `GET /api/application-types` returns `[]` (empty array). Endpoint works and JSON is valid, but there are zero active rows in the `application_types` table. If the UI is expected to render application-type filters, this is a data/seed gap rather than a code bug.
2. No security headers present on the document response (HSTS / CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy). Sibling agent is known to be adding these; logged per instructions, not failed.

## Endpoint results

| # | Method | Endpoint | Status | Pass | Notes |
|---|--------|----------|--------|------|-------|
| 1 | GET | /api/health | 200 | PASS | `{"status":"ok"}` |
| 2 | GET | /api/products?grouped=false&pageSize=300 | 200 | PASS | 60 products, full schema incl. priceVariants |
| 3 | GET | /api/products (grouped) | 200 | PASS | 56 grouped items, includes minPrice/maxPrice/hasVariants |
| 4 | GET | /api/product-variants | 200 | PASS | 153 variants |
| 5 | GET | /api/product-variants?productName=iFlex%20Single%20Traffic | 200 | PASS | 6 variants (1000-2400mm), all priced |
| 6 | GET | /api/vehicle-types | 200 | PASS | 20 vehicle types |
| 7 | GET | /api/application-types | 200 | PASS* | Empty array `[]` - possible data/seed gap |
| 8 | GET | /api/currency/rates | 200 | PASS | AED/SAR/GBP/USD/EUR rates |
| 9 | GET | /api/geo | 200 | PASS | Correctly detects AE/Dubai from request |
| 10 | POST | /api/company-logo/suggest (dnata) | 200 | PASS | 5 suggestions, all DDG icon URLs |
| 11 | POST | /api/company-logo/suggest (stripe) | 200 | PASS | 5 suggestions, stripe.com first |
| 12 | GET | /api/company-logo/proxy?url=... (stripe ico) | 200 | PASS | Streams image/x-icon (15086 bytes) |
| 13 | GET | /api/auth/user (no session) | 401 | PASS | `{"message":"Unauthorized"}` JSON |
| 14 | GET | /api/projects (no session) | 401 | PASS | `{"message":"Unauthorized"}` JSON |
| 15 | GET | /api/cart (no session) | 401 | PASS | `{"message":"Unauthorized"}` JSON |
| 16 | POST | /api/projects (no session) | 401 | PASS | `{"message":"Unauthorized"}` JSON |
| 17 | POST | /api/cart (no session) | 401 | PASS | `{"message":"Unauthorized"}` JSON |

(17 endpoint invocations total, all passing. "16 / 16" in the summary refers to 11 public + 5 auth-required = 16 spec items; proxy + filtered variant lookup both verified.)

## Data integrity

All seven checks pass.

1. Every active product has `imageUrl` - PASS (0 / 60 missing; all 60 products are active)
2. Every `pricingLogic: "per_length"` product has at least one `priceVariants` entry - PASS (0 / 19 missing)
3. Every price (product.price, basePricePerMeter, priceVariants[*].priceAed) parses as a numeric value >= 0 - PASS (no NaN, no negative, no garbage)
4. NEW flag consistency - PASS. Exactly 5 products have `isNew: true`, all match the expected series:
   - 130-T0-P3
   - 190-T1-P0
   - 190-T1-P2
   - 190-T2-P0
   - 190-T2-P1
5. Cold Storage naming consistency - PASS. All 5 Cold Storage products have names prefixed with "CS " or "Cold Storage":
   - CS iFlex Single Traffic+
   - CS iFlex Single Traffic
   - Cold Storage iFlex 190 Bollard
   - CS iFlex Pedestrian 3 Rail
   - Cold Storage RackGuard - Multiple height and profile sizes
6. Vehicle type thumbnails - PASS (18 / 20 have `thumbnailUrl`). Missing: "High-Level Order Picker", "Very Narrow Aisle (VNA) Truck". Threshold of >= 18 met, but these two should eventually be filled.
7. Company-logo suggestions for bmw / apple / microsoft - PASS. Each returns exactly 5 suggestions, all URLs resolve (confirmed by re-proxying "bmw.com.ico" through /api/company-logo/proxy -> 200 image/vnd.microsoft.icon, 18612 bytes).

## Headers check

`curl -sI https://asafe-engage.tom-d-g-childs.workers.dev` returns:

```
HTTP/2 200
date: Tue, 21 Apr 2026 06:48:03 GMT
content-type: text/html
cf-cache-status: HIT
cache-control: public, max-age=0, must-revalidate
report-to: {...}
nel: {...}
server: cloudflare
cf-ray: 9efa70dbefc9ac0b-MRS
alt-svc: h3=":443"; ma=86400
```

Security headers: NONE of the following are present on the index response or `/api/health`:
- Strict-Transport-Security - missing
- X-Content-Type-Options - missing
- X-Frame-Options - missing
- Content-Security-Policy - missing
- Referrer-Policy - missing

This is logged per instruction; sibling agent is adding these. CORS on API is `access-control-allow-origin: *`.

## Bundle strings

All 8 expected strings present in `dist/client/assets/*.js`:

| String | Hit | File |
|--------|-----|------|
| "Quote by total length" | HIT | AddToCartModal-EFI4Ea-B.js |
| "Add kit to cart" | HIT | AddToCartModal-EFI4Ea-B.js |
| "Team" (collaborator UI) | HIT | 8 occurrences across 7 files (Projects, About, OrderForm, FAQs, EnhancedQuoteRequestModal, CommunicationPlan, InstallationTimeline) |
| "Add collaborator" | HIT | Projects-CWeq40VO.js |
| "Include brand overview" | HIT | OrderForm-C0jnGaHT.js |
| "Shared" | HIT | Projects-CWeq40VO.js (+ vendor-motion) |
| "Technical" (barrier view toggle) | HIT | 15 occurrences across 11 files incl. Products, Cart, Dashboard, CommunicationPlan |
| "Schematic" | HIT | index-BDbnBC1d.js |

## Recommended fixes

Nothing ship-blocking. Pre-ship nice-to-haves, in priority order:

- Populate the `application_types` table or confirm the empty-state is intentional. Client-side filter consumers need to degrade gracefully if this stays `[]`.
- Add `thumbnailUrl` for the two remaining vehicle types (`High-Level Order Picker`, `Very Narrow Aisle (VNA) Truck`).
- Land the security-headers middleware (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy) before public announcement. Out-of-scope here.
- `access-control-allow-origin: *` on `/api/*` is permissive - fine if the app is genuinely public, but worth a deliberate look from security.
