# Engage Phase 4: Layout Editor Rebuild

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload a customer's floor plan (PDF or image), calibrate it, and mark up A-SAFE products as a legible, family-coded overlay that works identically with a finger on a phone or tablet and a mouse on a laptop, with quantities derived from geometry, local undo/redo, and a sharp vector PDF export that drops into the proposal document.

**Architecture:** A new `client/src/components/layout-editor/` module replaces `layout-markup/`. One pointer-events gesture engine drives pan, pinch, tap, drag, and long-press. The drawing is a single versioned JSON document (`LayoutDoc`) rendered as an SVG overlay above the base image/PDF; history is in-memory with debounced saves and optimistic concurrency. A symbol library defines per-family colour, shape, and post spacing so the overlay, legend, title-block key, and quantities all derive from the same data. Export is server-side with pdf-lib: the original PDF page is copied and the overlay is drawn as vectors on top.

**Tech Stack:** React 18, SVG, Pointer Events, `react-pdf` (kept for on-screen PDF raster), `pdf-lib` (server export), vitest.

**Rules for every task:** same as Phase 1.

---

## Data model (Task L0)

`migrations/2026-09-13-layout-doc.sql`:
```sql
ALTER TABLE layout_drawings
  ADD COLUMN IF NOT EXISTS document jsonb,            -- LayoutDoc
  ADD COLUMN IF NOT EXISTS document_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS export_object_key varchar, -- last vector export in R2
  ADD COLUMN IF NOT EXISTS export_version integer;
```
`layout_markups` rows are migrated lazily: on first `GET /api/layout-drawings/:id/document` with `document IS NULL`, convert rows to `LayoutDoc.elements` (each row → `barrierRun` with `points` from `pathData`, `productId`/`cartItemId`, `comment`), store, and mark `layout_markups.deleted_at` for that drawing.

## Task L1: Document model, symbol library, geometry (pure, tested)

**Owns:** `shared/layout/` (new: `doc.ts`, `symbols.ts`, `geometry.ts`, `quantities.ts`, `migrateMarkups.ts`, tests for each).

```ts
export type Mm = number;
export interface Pt { x: number; y: number }            // content pixels of the base drawing
export interface Calibration { a: Pt; b: Pt; lengthMm: Mm } // pxPerMm = dist(a,b)/lengthMm
export type Element =
  | { kind: "barrierRun"; id: string; familyId: string; productId?: string; cartItemId?: string; points: Pt[]; label?: string; note?: string }
  | { kind: "stamp";      id: string; familyId: string; productId?: string; at: Pt; rotationDeg: number; note?: string } // bollard, column guard, dock buffer
  | { kind: "wall";       id: string; points: Pt[] }
  | { kind: "dimension";  id: string; a: Pt; b: Pt }
  | { kind: "note";       id: string; at: Pt; text: string }
  | { kind: "zone";       id: string; points: Pt[]; label: string }; // pedestrian zone / vehicle zone shading
export interface LayoutDoc { version: 1; calibration?: Calibration; elements: Element[]; vehicleTypeId?: string; floorType?: string }
```
`symbols.ts`: `FAMILIES: Record<familyId, { label; colour; strokeStyle: "double"|"single"|"dashed"; postSpacingMm; widthMm; postOdMm; stampShape?: "circle"|"square"|"rect"; letter: string }>` for iFlex/eFlex/mFlex/Atlas single+double traffic, pedestrian 3-rail, RackGuard, rack end, bollards (130/190/heavy), column guard, dock buffer, forkguard, height restrictor, tape barrier. `familyForProduct(product)` maps a catalogue product (by name/category/`suitabilityData.family`) to a family id with a deterministic fallback.

`geometry.ts`: `pxPerMm(cal)`, `runLengthMm(points, cal)`, `postPositions(points, spacingMm, cal)` (posts at every vertex plus even spacing per segment, last bay ≤ spacing), `detectCorners(points, minAngleDeg=60)`, `segmentDistanceMm(segA, segB, cal)` (true segment-to-segment), `snapAngle(prev, p, [0,45,90])`, `snapToPoint(p, candidates, tolerancePx)`, `hitTest(doc, p, tolerancePx)`.

`quantities.ts`: `deriveQuantities(doc, catalog)` → per family `{ familyId, totalLengthM, runs, posts, corners, stamps }` and per product `{ productId, quantity, lengthMeters, pricingType }` ready for `POST /api/cart/bulk-add`.

`migrateMarkups.ts`: `markupsToDoc(rows, drawing)`.

Tests: geometry (length on a calibrated square, post count for 2.2 m spacing over 10 m = 6 posts, corner detection on an L, segment distance parallel/skew/crossing), quantities on a fixture doc, migration of three legacy rows.

## Task L2: Gesture engine and viewport

**Owns:** `client/src/components/layout-editor/` (new: `useViewport.ts`, `useGestures.ts`, `Viewport.tsx`, `BaseLayer.tsx`).

- `useViewport`: `{ zoom, tx, ty }` with `fitToContent`, `zoomAt(screenPt, factor)`, `panBy`, min/max zoom, `toContent(screenPt)`, `toScreen(contentPt)`. Pure functions unit-tested.
- `useGestures(el, handlers)`: Pointer Events only (`pointerdown/move/up/cancel`, `setPointerCapture`), tracks active pointers; recognises tap (< 250 ms, < 6 px), long-press (450 ms, < 6 px), drag, two-pointer pinch (zoom about midpoint) + pan, wheel zoom (ctrl/trackpad) and wheel pan, `touch-action: none` on the element. Inertia after pan (0.92 decay, cancelled on next pointerdown). Keyboard: space+drag pan, `+ - 0`, arrows nudge selection.
- `BaseLayer`: image via `<img>` or PDF page via react-pdf with the existing raster tiers; exposes `naturalWidth/Height` through a callback so the overlay never reads refs during render.

## Task L3: Tools, overlay, legend

**Owns:** `client/src/components/layout-editor/` (`Editor.tsx`, `Overlay.tsx`, `tools/*.ts` one per tool, `Toolbar.tsx`, `ProductPicker.tsx`, `Legend.tsx`, `Inspector.tsx`, `useHistory.ts`, `useDocSync.ts`), `client/src/pages/LayoutDrawing.tsx` (swap to the new editor), deletion of `client/src/components/layout-markup/**` when done.

- Tools: **Select** (tap to select, drag to move, handles to edit vertices, long-press → context sheet: duplicate, delete, change product, add note), **Barrier run** (tap-tap-tap vertices, double-tap or ✓ to finish; live length readout; angle snap toggle; endpoint snap), **Stamp** (tap to place, drag handle to rotate), **Wall**, **Dimension**, **Note**, **Zone**, **Calibrate** (two taps + length dialog with mm/m/ft and a "1:100 on A3" helper).
- Overlay: SVG in content coordinates; runs drawn with the family stroke style at real width once calibrated (min 1.5 screen px), posts as circles at `postPositions`, stamps with the family shape, walls thick grey, zones translucent, dimensions with arrowheads and mm text, notes as callouts. Labels (family letter + run number) placed with a simple collision pass (try 4 offsets, pick first free). Selection halo and handles.
- `useHistory`: immutable `LayoutDoc` snapshots, `undo/redo`, `Cmd/Ctrl+Z / Shift+Z`, capped at 200.
- `useDocSync`: debounced 800 ms `PUT /api/layout-drawings/:id/document { document, baseVersion }` → 409 on mismatch → reload + toast "Drawing was updated elsewhere; reloaded". Save state indicator reuses `SavedAgoIndicator`.
- `ProductPicker`: bottom sheet on mobile, side panel on desktop; lists catalogue families with colour swatch, then products; remembers last used.
- `Legend` and title-block key both read `FAMILIES` + the doc, so they always match.
- Toolbar: bottom on ≤ 768 px, left rail otherwise; 48 px targets; safe-area insets.
- PAS 13 guardrails: port `pas13Guardrails.ts` rules to the new doc (walls now exist, so the deflection rule works); panel unchanged in look.
- "Transfer to cart" uses `deriveQuantities`; shows a confirm table first.

## Task L4: Server document API and vector export

**Owns:** `worker/routes/layoutDrawings.ts` (new document endpoints; legacy markup endpoints kept for one release), `worker/lib/pdf/layoutExport.ts`, `worker/routes/layoutExport.ts`.

- `GET /api/layout-drawings/:id/document` (lazy migration), `PUT .../document` (optimistic concurrency on `document_version`), `POST .../export` → renders vector PDF, stores at `export_object_key`, returns `{ objectKey, url }`.
- Export: for PDF bases, `PDFDocument.load(original)`, take page 1 (or the page the rep chose), draw elements with pdf-lib vector ops (lines with width in points = mm × scale of the page), posts as circles, labels with Helvetica; for image bases, embed the image at its size then draw. Then add the title-block frame (port the DOM title block to vector: dwg no, rev, date, scale, title, project, author, checked by, revision table, notes, legend, "DO NOT SCALE", A-SAFE address). A3 landscape.
- Tests: export a fixture doc onto a 1-page fixture PDF and assert page count 1 and size < 2 MB.

## Task L5: Proposal integration and cleanup

**Owns:** `worker/lib/pdf/proposal.ts` (drawing page uses `export_object_key`), `client/src/pages/Projects.tsx` (drawing card shows "Export up to date / Export stale" and a button), deletion of `client/src/utils/layoutDrawingPdfExport.ts` and the `html2canvas`/`jspdf` dependencies if nothing else imports them.

---

## Verification (orchestrator)
- Unit tests green; `npm run check`; build size of the drawing chunk reported before/after.
- Preview: on a phone viewport, upload a PDF, calibrate, draw a run with a finger, pinch-zoom while drawing, undo, place a bollard, add a wall next to a run and see the deflection warning, export, and open the export.
