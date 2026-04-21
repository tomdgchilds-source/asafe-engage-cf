# Product Card Impact-Rating Unification Plan

Status: planning only — no code edits made.

Scope: three cards that render impact information — `ProductCard`, `GroupedProductCard`, `ConsolidatedProductCard` — plus the list page that hosts them (`client/src/pages/Products.tsx`, `client/src/pages/SolutionFinder.tsx`).

Schema fields available (from `shared/schema.ts`, `products` table, lines 354-371):

- `impactRating` integer, Joules (line 362)
- `heightMin`, `heightMax` integer, mm (363-364)
- `pas13Compliant` boolean (366)
- `pas13TestMethod` varchar — "pendulum" | "vehicle" | "sled" (367)
- `pas13TestJoules` integer (368)
- `pas13Sections` jsonb (369)
- `pas13CertificationDate` timestamp (370)
- `deflectionZone` integer, mm (371)

Ambient (non-column) fields the cards currently read: `isColdStorage`, `isNew`, `hasVariants`, `productVariants` — these come in via API enrichment, not the schema.

Catalog-only fields (NOT in DB, only in `scripts/data/asafe-catalog.json`): `impactRatingRaw`, `vehicleTest`, `pas13.sections`, `pas13.method`, `heightRange`. These must be either (a) ingested into the schema first or (b) sideloaded as enrichment props — they cannot be read from `Product` today.

---

## 1. Side-by-side comparison of the three cards

| Topic | `ProductCard.tsx` | `GroupedProductCard.tsx` | `ConsolidatedProductCard.tsx` |
|---|---|---|---|
| Impact badge (J) | lines 85-89, yellow `bg-yellow-400 text-black`, rendered only when `impactRating > 0`, format `{n.toLocaleString()}J` (no space before unit) | lines 143-147, identical colour + format to ProductCard | lines 136-148, NOT a badge — shown as inline text `"Impact: {n.toLocaleString()} J"` (space before unit) using `text-primary`; falls back to `"N/A J"` when null; line 86 also shows raw `{n.toLocaleString()} J` inside the variant dropdown |
| Impact range (min-max across variants) | none | none | lines 139-142, shows `{min}-{max} J` when `impactRange.min !== impactRange.max` AND variant picker is collapsed |
| PAS 13 badge / label | not rendered | not rendered | not rendered |
| Test method indicator | not rendered | not rendered | not rendered |
| Vehicle-test tooltip / description | not rendered | not rendered | not rendered |
| Height info | lines 90-94, `bg-blue-500 text-white` badge `"{heightMax}mm Height"` — only `heightMax`, no range | not rendered | not rendered |
| Cold-storage flag | lines 103-107, `bg-cyan-500 text-white` badge `"Cold Storage"` | lines 156-160, same badge; ALSO special-cased by `product.name === 'Cold Storage Bollard'` at lines 115-129 for variant count | not rendered |
| Category / subcategory | lines 95-102, outline badges | lines 148-155, outline badges | not rendered (shows `baseProductName` + match score instead) |
| NEW badge | lines 71-75, `bg-[#FFC72C]` | lines 106-110, identical | not rendered |
| Variant-count badge | lines 77-83, `bg-blue-500` when `hasVariants && productVariants` | lines 113-141, `bg-blue-500` with three-way priority (name-match, `variants` prop, `hasVariants`) | lines 63-97, `variant="outline"` badge that toggles a `<Select>` dropdown |
| Colour scheme summary | Yellow impact + blue height + cyan cold-storage + outline category | Yellow impact + cyan cold-storage + outline category (NO height, NO category label difference) | Primary-colour inline text only; outline variant chip |
| Badge container | `flex gap-1 sm:gap-2 flex-wrap items-center` (line 84) | `flex gap-1 sm:gap-2 flex-wrap items-center` (line 142) | no flex badge row — split between header and footer |

### Cross-cutting code smells

- `ProductCard` uses the Tailwind named colour `bg-yellow-400`; the `NEW` badge uses the brand token `bg-[#FFC72C]`. The task brief calls the brand yellow canonical — cards should switch to `bg-[#FFC72C]`.
- `ConsolidatedProductCard` defines its own local `ProductVariant` interface (lines 9-15) instead of using `Product` from `@shared/schema`. It does not even read `product.category`, `product.subcategory`, `product.heightMax`, or anything PAS-13 related, so it cannot render those badges without a prop-shape change.

---

## 2. Inconsistencies found

- Impact rating format differs: `ProductCard` / `GroupedProductCard` render `"5,800J"` (no space), `ConsolidatedProductCard` renders `"5,800 J"` (space) — visually inconsistent.
- Impact rating presentation differs: cards 1-2 use a coloured BADGE, card 3 uses inline TEXT.
- Impact rating fallback differs: cards 1-2 HIDE the badge when `impactRating` is null/0; card 3 shows literal `"N/A J"` — both behaviours lose info (untested vs. forgot-to-populate is indistinguishable).
- Colour token differs: cards 1-2 use `bg-yellow-400`, which is the Tailwind palette yellow, NOT the brand `#FFC72C` used for the `NEW` badge on the same card.
- No card renders PAS 13 at all, despite 6 PAS-13 columns existing on the schema and the catalog JSON carrying `pas13.certified` / `pas13.method` per product.
- No card renders `pas13TestMethod`, `pas13TestJoules`, or `deflectionZone`, even though they're commonly the deciding factor for a spec-conscious buyer.
- No card surfaces `impactRatingRaw` / `vehicleTest` from the catalog — this is the most valuable narrative ("2.3 tonnes @ 8 kph, 100% transfer, angles 22.5°/45°/90°").
- Height badge exists only on `ProductCard`, and it shows only `heightMax` — no min, no range, no deflection-zone context.
- Cold-storage badge exists on cards 1-2 but not on card 3, even though several catalog entries are explicitly cold-storage products.
- `GroupedProductCard` has a hard-coded `product.name === 'Cold Storage Bollard'` string match at line 115 — brittle data-specific branching in a reusable card.
- `ConsolidatedProductCard` takes a local `ProductVariant` shape (id/name/description/impactRating/price) — it can never render PAS 13, cold storage, category, or height until the prop shape is widened to `Product`.

---

## 3. Unified design proposal — impact section of every card

Primary (always a BADGE, same container in all cards):

- Joules chip — visible when `impactRating > 0`, format `{n.toLocaleString()}J` (no space, matches the majority format on cards 1 & 2), brand yellow `bg-[#FFC72C] text-black`, border-radius from existing `Badge`.
- When an `impactRange` is supplied and min !== max, render `{min}-{max}J` on the same chip (keeps card 3's useful behaviour).

Secondary — PAS 13 chip:

- Rendered when `pas13Compliant === true`. Compact `"PAS 13"` label, neutral tint: `bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100`. Wrapped in a `<Tooltip>` whose content is built from `pas13TestMethod` + `pas13TestJoules`, e.g. `"Pendulum test, 5,800 J"`. If method is null, tooltip shows `"PAS 13:2017 certified"`.

Tertiary — vehicle-test hover card (only when enrichment data is present):

- When props supply a `vehicleTest` or `impactRatingRaw` string (sourced from `asafe-catalog.json` at card-render time, NOT the DB), wrap the primary chip in a `<HoverCard>` showing that longer-form description. Icon affordance: a small `Info` lucide icon after the `J` value.
- Must degrade silently: if no enrichment prop is supplied, the chip renders without hover.

Fallback — no rating:

- Render a muted chip `"No impact rating"` with `variant="outline"` + `text-gray-500`. This distinguishes "untested / informational product" from the current silent-drop behaviour, which hides the ambiguity.

Cold storage + height badges — keep current placement in the same flex row but unify sizing:

- Cold storage: `bg-cyan-500 text-white text-xs px-2 py-1` (same as today, but ensure it exists on all three cards).
- Height: show `{heightMin}-{heightMax}mm` range when both present, else `{heightMax}mm`. Colour `bg-blue-500 text-white text-xs px-2 py-1` (same as today). Currently only on `ProductCard` — extend to the other two.

Ordering in the flex row (left to right): impact chip, PAS 13 chip, height chip, cold-storage chip, category, subcategory. This pins the highest-information signals at the left edge.

---

## 4. Refactor recommendation — extract `<ProductImpactBadges>`

Yes, extract. The three cards already diverge on something as simple as "comma before the J" — without extraction, they will keep drifting. Proposed prop shape:

```ts
interface ProductImpactBadgesProps {
  // Primary
  impactRating?: number | null;
  impactRange?: { min: number; max: number } | null;

  // PAS 13 (from schema)
  pas13Compliant?: boolean | null;
  pas13TestMethod?: string | null;   // "pendulum" | "vehicle" | "sled"
  pas13TestJoules?: number | null;

  // Height (from schema)
  heightMin?: number | null;
  heightMax?: number | null;

  // Ambient flags
  isColdStorage?: boolean;

  // Category labels (optional — ConsolidatedProductCard omits)
  category?: string;
  subcategory?: string | null;

  // Catalog enrichment (optional — undefined means "no hover card")
  vehicleTest?: string | null;
  impactRatingRaw?: string | null;

  // Visual config
  size?: "sm" | "md";           // default "md"
  showFallback?: boolean;       // default true — render "No impact rating" chip
  showCategory?: boolean;       // default true
  className?: string;
}
```

Location: `client/src/components/ProductImpactBadges.tsx`.

Placement rule: the component renders its own `<div className="flex gap-1 sm:gap-2 flex-wrap items-center">`, so each card just drops it in wherever the badge row is today.

---

## 5. Implementation checklist

1. Create `client/src/components/ProductImpactBadges.tsx` implementing the prop shape above. Use `@/components/ui/badge`, `@/components/ui/tooltip`, `@/components/ui/hover-card` (all confirmed to exist). Import `Info` from `lucide-react` for the hover affordance.
2. Decide enrichment pipeline for catalog-only fields (`vehicleTest`, `impactRatingRaw`):
   - Short path: add a lightweight loader at `client/src/lib/catalogEnrichment.ts` that imports `scripts/data/asafe-catalog.json` and exposes `getCatalogEntry(productName): { vehicleTest?, impactRatingRaw? } | undefined`. Cards call this at render.
   - Long path (preferred later): ingest these two fields into the DB — add `impactRatingRaw text` and `vehicleTest text` to `products` in `shared/schema.ts`, backfill from the catalog, then remove the loader. This is out of scope for this unification but called out so we don't paint into a corner.
3. Edit `client/src/components/ProductCard.tsx`:
   - Remove the in-file badge row (lines 84-108 — impact, height, category, subcategory, cold-storage).
   - Keep the outer wrapper flex + the NEW badge + variant-count badge.
   - Insert `<ProductImpactBadges>` fed from the `product` prop. Pass `vehicleTest`/`impactRatingRaw` from the enrichment loader.
4. Edit `client/src/components/GroupedProductCard.tsx`:
   - Remove lines 142-161 (impact, category, subcategory, cold-storage).
   - Remove the `product.name === 'Cold Storage Bollard'` hard-coded branch at lines 113-129; the `isColdStorage` prop on the unified component replaces it. (Cold Storage Bollard variant-count behaviour is a separate concern — leave the variant-count badge logic above the impact badges intact.)
   - Insert `<ProductImpactBadges>` in the same flex row position.
5. Edit `client/src/components/ConsolidatedProductCard.tsx`:
   - Widen `ProductVariant` (lines 9-15) to include `pas13Compliant?`, `pas13TestMethod?`, `pas13TestJoules?`, `heightMin?`, `heightMax?`, `isColdStorage?`, `category?`, `subcategory?`. Callers in `SolutionFinder.tsx` already pass full products — check and widen the call-site types accordingly.
   - Delete the inline impact text block at lines 136-148.
   - Render `<ProductImpactBadges>` at the top of `CardContent`, passing `impactRange` through so the collapsed-variant range behaviour survives.
   - Keep `showFallback={true}` so `"N/A J"` becomes `"No impact rating"`.
6. Sweep `bg-yellow-400` → `bg-[#FFC72C]` inside the new component only. Don't mass-replace elsewhere — other components may use the Tailwind palette yellow intentionally.
7. Unify format to `{n.toLocaleString()}J` (no space) inside the new component. Update the `ConsolidatedProductCard` variant-dropdown label at line 87 to match (that line stays inside the component, it doesn't get extracted).
8. Smoke-test the three host pages:
   - `/products` — grid renders both grouped and non-grouped cards (Products.tsx lines 692-719).
   - `/solution-finder` — ConsolidatedProductCard renders via both call-sites (SolutionFinder.tsx lines 930 and 1457).
9. Verify sort still works: the `impact-desc` / `impact-asc` sort at `Products.tsx:138-139` reads `product.impactRating` directly from the DB — unchanged, still valid.
10. Follow-up (separate PR): move `impactRatingRaw` + `vehicleTest` into the DB so the enrichment loader can be deleted.

---

## 6. Visual mockup

```
Card header
┌────────────────────────────────────────────────────────┐
│ [ hero image ]                                         │
│                                                        │
│ iFlex Pedestrian 3 Rail                         [NEW]  │
│ [3 variants available]                                 │
│                                                        │
│ ┌──────┐ ┌────────┐ ┌─────────────┐ ┌──────────────┐   │
│ │5,800J│ │PAS 13ⓘ│ │450-1100mm   │ │Cold Storage │   │
│ └──────┘ └────────┘ └─────────────┘ └──────────────┘   │
│ [ Pedestrian Barriers ] [ 3 Rail ]                     │
│                                                        │
│ Hover 5,800J → "2.3 t @ 8 kph, 100% transfer, 22.5°…"  │
│ Hover PAS 13 → "Pendulum test, 5,800 J"                │
└────────────────────────────────────────────────────────┘

Fallback row when impactRating is null:
┌────────────────────┐ ┌──────────────┐
│ No impact rating   │ │ Cold Storage │
└────────────────────┘ └──────────────┘
```

Legend: yellow `bg-[#FFC72C]` for impact, neutral grey for PAS 13 chip, blue `bg-blue-500` for height, cyan `bg-cyan-500` for cold storage, outline for category/subcategory. `ⓘ` = small `Info` icon appearing only when catalog enrichment is present.
