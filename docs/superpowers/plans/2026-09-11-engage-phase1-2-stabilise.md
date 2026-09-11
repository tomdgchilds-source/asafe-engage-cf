# Engage Phase 1 + 2: Stabilise and Close the Feedback List

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make A-SAFE Engage safe, fast on phones, navigable, and numerically consistent, and close every open item from the 5 May 2026 team feedback session, so the sales team can be given the tool.

**Architecture:** Cloudflare Worker (Hono, `worker/`) + React/Vite SPA (`client/src/`) + shared TypeScript (`shared/`) + Neon Postgres via Drizzle. No local database exists; verification is by unit tests on pure logic (vitest), `tsc --noEmit`, and live checks against a Cloudflare preview version (`wrangler versions upload`) before promotion.

**Tech Stack:** TypeScript 5.6, Hono 4, Drizzle, React 18, TanStack Query 5, wouter, Tailwind, jsPDF (client), vitest (new), Playwright.

**Rules for every task:**
- Work only in the files listed under "Owns". If you must touch another file, stop and report why instead.
- Do not commit. The orchestrator reviews and commits per wave.
- Keep the files you touch free of `tsc` errors (`npx tsc --noEmit -p tsconfig.json 2>&1 | grep <your file>`). Do not "fix" errors in files you do not own.
- No `console.log` left behind. Delete any you find in files you own.
- Report back: what changed (file:line), how you verified it, anything you could not do.

**Context every worker needs:**
- Review report with findings and line references: `docs/superpowers/plans/2026-09-11-engage-review-findings.md` (copy of the published review's content).
- The app is AED-native. All stored money is AED. Display conversion happens only in `client/src/contexts/CurrencyContext.tsx`.
- Auth: session cookie; `authMiddleware` in `worker/middleware/auth.ts`; `c.get("user").claims.sub` is the user id.
- Storage layer: `worker/storage.ts` (`createStorage(db)`), Drizzle tables in `shared/schema.ts`.

---

## Wave 1 (parallel, disjoint files)

### Task A: Security hardening

**Owns:** `worker/index.ts` (lines 2420-2620 region only: `promote-user`, `bootstrap-admin`, `bootstrap-user`), `worker/routes/admin.ts`, `worker/middleware/securityHeaders.ts`, `wrangler.toml` (comment block only).

- [ ] **A1.** Delete the `GET /api/bootstrap-admin` and `GET /api/bootstrap-user` handlers from `worker/index.ts` entirely. Replace with nothing. Remove `BOOTSTRAP_TOKEN` from the secrets comment in `wrangler.toml` and add a comment: `# Bootstrap endpoints removed 2026-09-11. Create users with: DATABASE_URL=... npx tsx scripts/createUser.ts <email> <password> [first] [last]; promote with scripts/promoteAdmin.ts.`
- [ ] **A2.** Create `scripts/promoteAdmin.ts` mirroring `scripts/createUser.ts`: takes an email, sets `users.role = 'admin'` and upserts an `admin_users` row (see `worker/routes/admin.ts` for the columns it expects). Usage line printed on missing args.
- [ ] **A3.** Delete `GET /api/admin/promote-user` from `worker/index.ts`.
- [ ] **A4.** In `worker/routes/admin.ts`: remove the promote-on-read side effect in `GET /api/admin/session` (lines ~110-118). The session check must only read. Keep the admin-login promotion (`POST /api/admin/login`) but make it explicit: log `[admin] promoted <email> via admin login`.
- [ ] **A5.** `worker/middleware/securityHeaders.ts:91`: change `microphone=()` to `microphone=(self)`. Voice notes use the Web Speech API which needs mic permission.
- [ ] **A6.** In `worker/routes/admin.ts`, replace each inline `storage.getUser(...).role === "admin"` check with a single local `requireAdmin(c, storage)` helper defined at the top of the file (async, returns boolean, responds 403 itself is NOT its job; caller returns 403). Behaviour unchanged.
- [ ] **A7.** Verify: `grep -n "bootstrap" worker/index.ts` returns nothing; `npx tsc --noEmit` shows no errors in owned files.

### Task B: Mobile performance

**Owns:** `client/src/pages/Products.tsx`, `client/src/components/ProductBasePlatesPanel.tsx`, `client/src/hooks/useAuth.ts`, `client/src/hooks/useActiveProject.ts`, `client/src/contexts/CurrencyContext.tsx`, `client/src/components/Layout.tsx` (query `enabled` flags only; Task C owns its nav content), `client/src/components/NotificationCenter.tsx`, `client/src/components/Pas13ChatPanel.tsx` (query `enabled` only), `client/src/components/MobileOptimizer.tsx`, `client/public/sw.js`, `client/index.html`, `client/src/main.tsx`, `vite.config.ts`, `client/src/lib/queryClient.ts`.

- [ ] **B1. Kill the base-plates N+1.** `ProductBasePlatesPanel` is rendered once per product in the catalogue list (`Products.tsx:619` region). Change so the panel only mounts inside the expanded product-detail view (the `individualProduct` branch), never in the list. If the list already only renders it in detail view, confirm and instead find why 53 requests fire (likely `GroupedProductCard`/`ConsolidatedProductCard` → not owned; report). Target: catalogue load makes ≤ 6 API calls. Measure with the browser network panel on `/products`.
- [ ] **B2. Gate authenticated probes on auth.** On public pages `/api/cart`, `/api/active-project`, `/api/calculations`, `/api/site-surveys`, `/api/pas13/me`, `/api/notifications` fire and 401. For each `useQuery` that hits an authenticated endpoint in the owned files, add `enabled: isAuthenticated` from `useAuth()`. `useAuth` itself must expose `isAuthenticated` derived from the `/api/auth/user` query and must be the only caller of that endpoint (dedupe: one `queryKey: ["/api/auth/user"]`). Target: zero 401s in the console on `/`, `/products`, `/calculator` when logged out.
- [ ] **B3. Service worker versioning.** Replace the hand-edited `VERSION = "v3-2026-04-30"` with a build-time value. In `vite.config.ts` add a tiny plugin (`closeBundle`) that reads `client/public/sw.js`, replaces `__SW_VERSION__` with `Date.now().toString(36)`, and writes the result to `dist/client/sw.js`. Change `sw.js` to `const VERSION = "__SW_VERSION__";`. Vite copies `public/` before `closeBundle`, so the plugin overwrites the copied file.
- [ ] **B4. Chunk-load recovery.** In `client/src/main.tsx` add:
  ```ts
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault();
    const key = "asafe:reloaded-for-chunk";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    window.location.reload();
  });
  ```
  and clear the key on successful app mount. This handles the "went blank after a deploy" case.
- [ ] **B5. Prefetch hygiene.** `MobileOptimizer.tsx` prefetches `/api/auth/user`, `/api/products`, `/api/cart` via `<link rel=prefetch>`. Remove the `/api/cart` and `/api/auth/user` prefetches (they 401 for logged-out users and duplicate the query client).
- [ ] **B6. React Query defaults.** In `client/src/lib/queryClient.ts` set `staleTime: 60_000` and `refetchOnWindowFocus: false` as defaults if not already, and `retry: (count, err) => !(err?.status === 401) && count < 2`.
- [ ] **B7.** Verify with the live preview: `/products` logged-out → count network calls to `/api/` (target ≤ 6) and console errors (target 0).

### Task C: Navigation and information architecture

**Owns:** `client/src/components/Layout.tsx` (sidebar content; Task B owns only query flags in the same file, coordinate by editing different regions), `client/src/pages/Dashboard.tsx`, `client/src/pages/StartNewProject.tsx`, `client/src/pages/SolutionFinder.tsx` (link fix only), `client/src/pages/IndustryCaseStudies.tsx` (link fix only), `client/src/components/AdminRoute.tsx`, `client/src/App.tsx` (route additions only).

- [ ] **C1. Sidebar.** New grouping:
  - **Work**: Dashboard `/`, Projects `/projects`, Project Cart `/cart`
  - **Start**: Site Survey `/site-survey`, Layout Drawing `/layout-drawings`, Browse Products `/products`
  - **Tools**: Impact Calculator `/calculator`, PAS 13 Alignment `/pas13-compliance`, Calculations History `/calculations-history`
  - **Delivery**: Installation Timeline, Install Teams, Communication Plan
  - **Library**: Case Studies, Resources, the two YouTube links
  - **Support**: Help, FAQs, About, Contact
  - **Administration**: shown only when the current user has `role === "admin"` (from `useAuth().user.role`).
  Remove the "Virtual Experience" group (move its two links under Library). Remove Solution Finder entirely.
- [ ] **C2. Dashboard.** Remove the Solution Finder card. Rename "Start New Project" card actions to three: "Site survey", "Layout drawing", "Browse products". Add a "Projects" card linking to `/projects` showing count of active projects (use the existing `/api/projects` query if present in the file; otherwise a plain link).
- [ ] **C3. Start New Project.** Reduce to three primary options (Survey, Drawing, Products) with the Impact Calculator shown as a secondary "tool" link. Fix the `/draft-projects` link → `/projects`. Remove the Solution Finder option.
- [ ] **C4. Broken links.** `SolutionFinder.tsx:1230` `/impact-calculator` → `/calculator`. `IndustryCaseStudies.tsx` `href="/api/login"` (3 places) → `href="/"` with a `?signin=1` query that the Landing page already handles if it does; otherwise plain `/`.
- [ ] **C5. Admin gate on the client.** `AdminRoute.tsx` is fine; just ensure the sidebar filter in C1 uses the same source of truth.
- [ ] **C6.** Verify: every sidebar link resolves to a registered route in `App.tsx`; `grep -rn "solution-finder" client/src` returns only the route registration and the page file.

### Task D: Order-form PDF images restored

**Owns:** `client/src/pages/OrderForm.tsx` (download handler region ~870-910 only), `client/src/utils/orderFormPdfGenerator.ts`.

- [ ] **D1.** Point the main Download button back at the client-side `generateOrderFormPDF` (the image-capable generator). Keep the v2 server route available behind a secondary "Download (text-only, fast)" link so nothing is lost.
- [ ] **D2.** Port the "Installation notes" section that v2 renders (`worker/lib/orderFormPdfV2.ts`, search "Installation Notes") into `orderFormPdfGenerator.ts` after the line-items table: heading "Installation notes", the `order.installationNotes` text wrapped at page width, skipped when empty.
- [ ] **D3.** Make image loading resilient: in `loadImage` (`orderFormPdfGenerator.ts:188-214`) add an 8 s timeout and on failure return `null` so a dead CDN image never blocks the PDF. Every call site must handle `null` by skipping the image.
- [ ] **D4.** Unit placement: in the line-items table, render the impact rating as `19,200 J` (unit beside number) and show `Length` beside `Qty` for per-metre lines (`pricingType === 'per-meter'` or `lengthMeters` present). This is Jam's request.
- [ ] **D5.** Verify by running `npx tsx scripts/testPdfGenerators.ts` if it exercises the order-form generator (read it first); otherwise add a minimal vitest that calls `generateOrderFormPDF` with a fixture order and asserts it returns a Blob/ArrayBuffer of > 10 KB. jsPDF runs in node with `jsdom`? If not feasible in node, document manual verification steps instead.

### Task F: Site survey correctness fixes

**Owns:** `client/src/pages/SiteSurvey.tsx`, `client/src/hooks/useOfflineSurvey.ts`, `worker/routes/siteSurveys.ts`, `shared/schema.ts` (survey Zod schemas region only, ~lines 987-997).

- [ ] **F1. Build Project modal.** `SiteSurvey.tsx:2394-2481`: entries are `{productId, productName, ...}`. Fix `product.id` → `product.productId`, `product.name` → `product.productName` everywhere in that modal, including the `qty-` input ids and the `productName` sent to `POST /api/cart/bulk-add`.
- [ ] **F2. Two-tap add-to-cart.** `SiteSurvey.tsx:195-265`: after the fetch resolves, open the modal in the same tick (set product and `open=true` together), and show a toast on fetch failure instead of `console.error`.
- [ ] **F3. Phantom surveys.** `useOfflineSurvey` / `SiteSurvey.tsx:407-414`: remove the auto-POST on reconnect for the *new survey* form. Keep the localStorage draft. On reconnect just show the "reconnected, draft kept" banner.
- [ ] **F4. Zod validation.** Wire `insertSiteSurveySchema` and `insertSiteSurveyAreaSchema` (already in `shared/schema.ts`) into `POST /api/site-surveys`, `PUT /api/site-surveys/:id`, `POST /api/site-surveys/:id/areas`, `PUT /api/site-survey-areas/:id`. Use `.partial()` for PUT. Strip `userId`, `siteSurveyId`, `id`, `createdAt`, `updatedAt` from client bodies with `.omit()`. Return 400 with `fromZodError(err).message` on failure. Delete the four `// TODO: Add Zod validation` comments.
- [ ] **F5. Impact angle clamp.** `siteSurveys.ts:275`: clamp `impactAngle` to [5, 90] server-side; treat 0/undefined as 90.
- [ ] **F6. Photo payload.** In the area create/update handlers, if `photosUrls` contains data URLs, upload each to R2 via the same helper `worker/routes/files.ts` uses (export a `putObject(env, key, bytes, contentType)` from there if one is not exported; if you must add an export to `files.ts`, that is allowed for this task only) and replace with `/api/objects/<key>` URLs before saving. Key format: `survey-photos/<areaId>/<uuid>.jpg`.
- [ ] **F7.** Add `worker/routes/siteSurveys.test.ts` with vitest tests for the pure helpers you extract (angle clamp, data-URL detection/parsing). Keep route handlers thin.

### Task I: Cart line presentation

**Owns:** `client/src/components/CartItem.tsx`, `client/src/components/CartItemMobile.tsx`.

- [ ] **I1.** Show length beside quantity for per-metre lines: `Qty 3 × 2.4 m` style. Show unit beside value for impact rating: `19,200 J`, never on a second line.
- [ ] **I2.** Ensure the Good/Better/Best switcher only renders when `ladderMatch` exists AND the line has an impact calculation (already gated May 6; confirm and keep).
- [ ] **I3.** `npx tsc --noEmit` clean for owned files.

### Task G: Tooling and CI

**Owns:** `package.json`, `.github/workflows/*`, `e2e/playwright.config.ts`, `vitest.config.ts` (new), `tsconfig.json`, and TS-error fixes ONLY in these files: `client/src/pages/AdminDashboard.tsx`, `client/src/pages/ApprovalLanding.tsx`, `client/src/utils/siteSurveyPdfGenerator.ts`, `worker/routes/auth.ts`, `client/src/pages/ProfileCompletion.tsx`, `worker/storage.ts`, `worker/middleware/auth.ts`, `client/src/pages/VerificationPage.tsx`, `worker/routes/products.ts`, `worker/routes/projects.ts`, `worker/routes/companyLogo.ts`, `worker/routes/collaborators.ts`, `worker/routes/cart.ts`, `client/src/pages/CaseStudies.tsx`, `client/src/components/ProductComparison.tsx`, `client/src/components/CompanyLogoFinder.tsx`, `client/src/pages/AdminLogin.tsx`, `client/src/hooks/useHapticFeedback.ts`, `client/src/components/ResourceCard.tsx`, `client/src/components/QuoteDraftDrawer.tsx`, `client/src/components/ProductCard.tsx`, `client/src/components/GroupedProductCard.tsx`, `client/src/components/AIChat.tsx`, `worker/routes/safety.ts`, `worker/routes/layoutDrawings.ts`, `worker/routes/chat.ts`, `shared/pricingUtils.ts`, `client/src/pages/admin/PartnerCodesTab.tsx`, `client/src/pages/ResetPassword.tsx`, `client/src/pages/LayoutDrawing.tsx`, `client/src/components/layout-markup/**`.

- [ ] **G1.** `npm i -D vitest @vitest/coverage-v8`. Add `vitest.config.ts` with `test.include: ["shared/**/*.test.ts", "worker/**/*.test.ts", "client/src/**/*.test.ts"]`, `environment: "node"`, and the same `@`/`@shared` aliases as vite.
- [ ] **G2.** `package.json` scripts: `"typecheck": "tsc --noEmit -p tsconfig.json"`, `"test": "vitest run"`, `"test:watch": "vitest"`, `"check": "npm run typecheck && npm run test"`.
- [ ] **G3.** Fix every `tsc` error in the owned files. Fix real bugs where the error reveals one; use narrow casts only where Drizzle typing is the problem, with a one-line comment. Do not add `// @ts-ignore`.
- [ ] **G4.** CI: rename workflow to `ci.yml`: jobs `check` (npm ci, `npm run check`, `npm run build`) on PR and push. Keep the e2e job but make it run only on `workflow_dispatch` and on push to main, against `E2E_BASE_URL` provided as a workflow input defaulting to the production URL. The orchestrator will run e2e manually against preview URLs.
- [ ] **G5.** `wrangler.toml`: leave to orchestrator.
- [ ] **G6.** Verify: `npm run typecheck` reports errors only in files owned by other Wave 1 tasks (list them in your report).

---

## Wave 2 (after Wave 1 is committed)

### Task E1: One pricing module (shared, tested)

**Owns:** `shared/pricing/` (new directory), `shared/discountLimits.ts`, `shared/pricingUtils.ts`, `client/src/utils/cart-pricing.ts` (delete).

Create `shared/pricing/computeTotals.ts` exporting:

```ts
export type Complexity = "simple" | "normal" | "complex";
export interface PricingLine {
  id: string;
  unitPriceAed: number;      // per unit or per metre
  quantity: number;          // units, or number of runs
  lengthMeters?: number;     // for per-metre lines
  pricingType: "per-unit" | "per-meter";
  includesDelivery?: boolean; // default true
  includesInstall?: boolean;  // default true
  isProduct?: boolean;        // false for service/accessory lines (no discount)
}
export interface PricingInput {
  lines: PricingLine[];
  complexity: Complexity;
  reciprocalDiscountPercent: number;   // sum of selected commitments
  partnerDiscountPercent: number;      // 0..15
  socialDiscountPercent: number;       // 0..?
  servicePackageAed?: number;          // flat, after discount
  vatPercent?: number;                 // default 0 (budgetary) ; 5 for UAE when requested
}
export interface PricingResult {
  goodsAed: number;
  deliveryAed: number;      // 9.6271916% of goods carrying delivery
  installAed: number;       // 11.48264 / 19.38872 / 26.289773 % by complexity of goods carrying install
  discountPercentApplied: number; // capped by getCombinedDiscount()
  discountAed: number;      // on goodsAed only
  servicePackageAed: number;
  subtotalAed: number;      // goods - discount + delivery + install + service
  vatAed: number;
  totalAed: number;
  lines: Array<{ id: string; lineTotalAed: number }>;
}
export function computeTotals(input: PricingInput): PricingResult
```
Rules: line total = `unitPriceAed × quantity × (lengthMeters ?? 1)` for per-metre, `unitPriceAed × quantity` for per-unit, rounded to 2 dp. Discount base is product lines only. Delivery/install are computed on product lines flagged for them. All intermediate values rounded to 2 dp with `Math.round(x*100)/100`; totals never use `toFixed`. Discount cap uses `getCombinedDiscount` from `shared/discountLimits.ts` (30 % hard ceiling; 40 % combined with partner/social per existing rules; read that file and encode exactly what it says).

Also create `shared/pricing/lengthPlan.ts` by moving the "longest piece + per-metre extension" plan from `client/src/components/QuoteBuilderPanel.tsx:173-218` into a pure function `planLength(variants: {sku:string; lengthMm:number; priceAed:number}[], targetMm: number): { basePiece; extensionMm; extensionRatePerM; totalPrice; label }`.

- [ ] **E1.1** Write `shared/pricing/computeTotals.test.ts` first: (a) single per-unit line, normal complexity, no discount → known numbers; (b) per-metre line 3 × 2.4 m; (c) discount cap: 35 % requested → 30 % applied; (d) partner 15 % + reciprocal 30 % → 40 % cap behaviour per `discountLimits`; (e) service package not discounted; (f) VAT 5 % on subtotal; (g) rounding: 3 lines at 0.333 each sum to 1.00 not 0.999.
- [ ] **E1.2** Write `shared/pricing/lengthPlan.test.ts`: 2.4 m → single 2400 piece; 2.5 m → 2400 base + 0.1 m extension at base rate; 2.6 m > 2.5 m; 1.0 m → smallest variant.
- [ ] **E1.3** Implement both. Delete `client/src/utils/cart-pricing.ts` (unused).
- [ ] **E1.4** `npm test` green.

### Task E2: Server adopts the pricing module

**Owns:** `worker/routes/orders.ts`, `worker/routes/orderForm.ts`, `worker/routes/quote.ts` (promote-to-cart + totals only), `worker/routes/cart.ts`, `worker/routes/pricing.ts`, `worker/storage.ts` (`calculatePrice` tier selection only).

- [ ] **E2.1** `POST /api/orders`: compute totals with `computeTotals` from the server's own view of cart items (never trust client totals). Store `discountPercentApplied`, `partnerDiscountPercent` (deducted), `currency` AND a new `fxRateAtOrder` numeric column (add to `shared/schema.ts` `orders` — coordinate: this task may add ONE column and the matching `ALTER TABLE` in a new `migrations/2026-09-11-orders-fx-rate.sql`). Totals stored in AED; `currency` + `fxRateAtOrder` let consumers display converted.
- [ ] **E2.2** Emails and public share view: format money as `formatMoney(aed × fxRateAtOrder, currency)`; add a tiny `worker/lib/money.ts` helper.
- [ ] **E2.3** `orderForm.ts:220-226` PDF totals → `computeTotals`. Fix the "VAT line then Ex. VAT label" contradiction: budgetary order forms show no VAT line and the label "Total (ex. VAT)".
- [ ] **E2.4** Order number: use `crypto.getRandomValues` for the 5-char tail and retry up to 5× on unique violation.
- [ ] **E2.5** `quote.ts:666-669` promote-to-cart: per-length lines → `quantity = 1`, `lengthMeters` is not a column, so set `quantity = metres`, `pricingType = 'per-meter'`, `unitPrice = per-metre rate`, `totalPrice = unitPrice × quantity`. Route through the same price recalculation `POST /api/cart` uses.
- [ ] **E2.6** `storage.ts:1998-2013` tier selection: respect `product_pricing.pricing_type` (`linear_meter` vs `per_item`) for labels and comparison; boundaries are `>= min && < nextMin` (document this as the rule; client must match).
- [ ] **E2.7** Tests: `worker/routes/orders.test.ts` for the order-number generator (format, retry). Everything else is exercised via E1's tests.

### Task E3: Client adopts the pricing module

**Owns:** `client/src/components/Cart.tsx`, `client/src/pages/OrderForm.tsx` (totals region), `client/src/components/AddToCartModal.tsx`, `client/src/components/SpendMoreSaveMoreDiscount.tsx`, `client/src/components/DiscountModal.tsx`, `client/src/components/QuoteBuilderPanel.tsx`, `client/src/components/DynamicPriceCalculator.tsx` (delete, orphan).

- [ ] **E3.1** Cart and OrderForm totals → `computeTotals`. Delete the local rate constants.
- [ ] **E3.2** `AddToCartModal.tsx:888-895`: `parseFloat(selectedVariant.price)` before adding spacer cost. Tier boundary: `>= min && < nextMin`. Use `planLength` for per-unit multi-length families (Rack End, Step Guard, ForkGuard, HD ForkGuard) so the 2.5 m case prices as one piece plus extension everywhere. Show the plan label under the price.
- [ ] **E3.3** `SpendMoreSaveMoreDiscount.tsx`: operate in AED, convert only for display via `CurrencyContext`; delete the broken `useQuery` without `queryFn`; cap the curve at `HARD_DISCOUNT_CEILING`.
- [ ] **E3.4** `DiscountModal.tsx:75-78` fix the stale comment; enforce the cap in the UI using `getCombinedDiscount` and disable the confirm button when over.
- [ ] **E3.5** Fix `Cart.tsx:201` link `/order-form` → open the create-order flow instead (the button that already exists lower on the page), or hide the link if no order exists.
- [ ] **E3.6** `QuoteBuilderPanel.tsx` imports `planLength` from shared; delete its local copy.
- [ ] **E3.7** `npm run check` green for owned files.

### Task H: Dead code and migration routes

**Owns:** `worker/index.ts` (everything except the ~8 runtime endpoints listed below), `migrations/` (new), the orphan files listed.

- [ ] **H1.** Move every one-off `apply-*-schema`, `seed-*`, `ingest-*`, `upload-*`, `fix-*`, `backfill-*` route body out of `worker/index.ts`. For each: extract any raw SQL into `migrations/applied/<yyyy-mm-dd>-<name>.sql` (verbatim), and delete the route. Keep only: `/api/health`, `/api/config`, `/api/geo`, the six static-file proxies (`/api/certificates|testing|maintenance|hardware|groundworks|standards/:file`), `/api/admin/email-log`, `/api/admin/users/usage-report`, `/api/admin/pas13-vehicle-classes`, `/api/auth/oauth-debug`, the `app.route(...)` mounts, middleware, the `scheduled` export, and the asset fallback. Target: `worker/index.ts` under 600 lines.
- [ ] **H2.** Add `migrations/README.md`: "These SQL files were applied to production via now-removed HTTP endpoints. They are kept for history. New schema changes: write a `.sql` here and apply with `psql $DATABASE_URL -f`."
- [ ] **H3.** Delete: `client/src/pages/MeetingNotes.tsx`, `client/src/pages/Admin.tsx` (and its lazy import in `App.tsx` — coordinate: one-line removal allowed), `client/src/components/{AdminOrdersTable,ApplicationTypeFilter,AutoSaveIndicator,CustomerIndicator,DraftProjectsList,FAQSection,HelpTooltip,ProgressIndicator,SafetyProgressRadar,SafetyTips,SmartFormField,VehicleTypeFilter,WhatsAppButton}.tsx`, `client/src/hooks/useKeyboardShortcuts.ts`, `worker/lib/safetyMatching.ts`, `worker/services/whatsapp.ts`, `public/` (root duplicate; Vite uses `client/public`). Before each deletion run `grep -rn "<basename>" client worker shared` and abort that deletion if any import exists.
- [ ] **H4.** `worker/routes/safety.ts`: delete the forum, contracts, conversations, smart-reorder, safety-tips, safety-progress handlers that call non-existent storage methods (`(storage as any).xxx`). Keep only handlers whose storage methods exist. Remove the router mount if nothing remains.
- [ ] **H5.** `npm run build` succeeds; `npm run typecheck` reports no new errors.

### Task J: Bollard height as a variant picker

**Owns:** `client/src/pages/Products.tsx` (grouping region), `client/src/components/GroupedProductCard.tsx`, `client/src/components/ConsolidatedProductCard.tsx`.

- [ ] **J1.** Where a family has variants that differ only by height (iFlex 190 bollard 1.2 m / 2 m etc., detect via `heightMin/heightMax` or a `(\d+(\.\d+)?)\s*m` suffix in the name), render one card with a height `<Select>` that switches the displayed price and the product passed to Add to Cart.
- [ ] **J2.** Keep the "Post height" select already present on kits (Height Restrictor) consistent in style.
- [ ] **J3.** Verify on `/products` that bollards appear once per model with a height picker.

### Task K: Survey and calculator alignment (Phase 2 part of survey)

**Owns:** `worker/routes/siteSurveys.ts` (`calculate-impact` handler only), `shared/pas13Rules.ts` (exports only), `client/src/components/VehicleImpactCalculator.tsx` (shared copy of `applicationAreaData` only).

- [ ] **K1.** `calculate-impact`: replace the private KE formula and 0 % margin with the PAS 13 engine: `energyTransferFactor`/`sineFromPas13Table`, include load mass if provided, filter products by `PAS13_ALIGNED_MIN_SAFETY_MARGIN_PCT`. Remove the racking override that force-recommends an under-rated product; instead return the under-rated product flagged `notAligned: true` with the existing justification text so the UI can show it greyed out.
- [ ] **K2.** Move `applicationAreaData` to `shared/applicationAreas.ts` and import it from `SiteSurvey.tsx`, `siteSurveyPdfGenerator.ts`, and `VehicleImpactCalculator.tsx` (edit those three imports only).
- [ ] **K3.** Tests: `worker/routes/siteSurveys.calc.test.ts` for the extracted pure function `computeAreaEnergyJ({vehicleKg, loadKg, speedKmh, angleDeg})` against three hand-computed cases.

---

## Verification and release (orchestrator)

- [ ] After each wave: `npm run check`, `npm run build`, review `git diff`, commit per task with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, push.
- [ ] `npx wrangler versions upload` → preview URL → run `E2E_BASE_URL=<preview> npm run test:e2e` with the QA account → manual checks listed per task.
- [ ] `npx wrangler versions deploy` to promote. Record the version id in the commit message of a `chore(release)` commit.
- [ ] Update the review artifact's tracker statuses.
