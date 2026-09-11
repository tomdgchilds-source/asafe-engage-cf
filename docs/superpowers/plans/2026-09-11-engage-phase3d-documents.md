# Engage Phase 3D: Customer-Facing Document System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan supersedes Task S6 in `2026-09-11-engage-phase3-survey-flagship.md`.

**Goal:** Every document a customer receives from Engage reads as the work of an HSE consultancy that happens to manufacture the solution: rigorous, standards-referenced, visually on-brand, and worth paying for. The survey report becomes a chargeable "Impact Protection Risk Assessment"; the proposal, order form, drawing sheet, PAS 13 statement, and post-installation report all share one design system.

**Architecture:** One server-side rendering library (`worker/lib/pdf/`) built on `pdf-lib`, with a brand theme module, layout primitives, reusable blocks (cover, document control, risk matrix, register table, zone page, product card, sign-off), and one renderer per document type. Images (site photos, product photos, logos, drawing exports) are fetched from R2 or the A-SAFE CDN. The same theme drives the HTML share pages and email templates so on-screen and printed material match.

**Tech Stack:** `pdf-lib` 1.17 (Worker-safe, embeds JPEG/PNG, copies PDF pages), Helvetica/Helvetica-Bold standard fonts (no licence or embedding needed; Graphik can be dropped in later via `@pdf-lib/fontkit` and an R2-hosted TTF if A-SAFE supplies the licence), vitest.

---

## Brand rules the renderer must encode (from the 2023 A-SAFE Brand Guidelines)

**Colour** (`theme.ts`):
```ts
export const BRAND = {
  yellow: "#FFC72C",   // Pantone 7548C, the only accent
  black:  "#1D1D1B",   // print black (RGB 29/29/27)
  white:  "#FFFFFF",
  grey90: "#333331", grey60: "#6E6E6B", grey40: "#A3A3A0", grey20: "#D9D9D6", grey8: "#F2F2F0",
  // Secondary palette: infographics and status only, never headlines or body copy
  red:    "#E94B5F",   // Pantone 1785C – critical
  orange: "#F88D2A",   // Pantone 715C  – high
  teal:   "#66C9BA",   // Pantone 570C  – low / good
  blue:   "#92C0E9",   // Pantone 283C  – informational
};
export const RISK_COLOURS = { low: BRAND.teal, medium: BRAND.yellow, high: BRAND.orange, critical: BRAND.red };
```
**Type:** headlines bold, uppercase, black or white; body regular, left-aligned, never justified or centred; emphasis by weight only, never by colour (colour is for links); "A-SAFE" always capitalised; call-to-action lines in bold.
**Logo:** primary (yellow on black) whenever a black band exists; secondary (yellow icon + black word) on white; never on yellow with yellow; clear zone = half the height of the "A"; minimum 20 mm wide without strapline. Files: `attached_assets/A-SAFE_Logo_Assets/LOGO/PNG/*` and `ICON/PNG/*` — copy the four needed PNGs to `worker/assets/brand/` and import them as base64 modules (small, < 60 KB each) so the Worker never fetches them.
**Motifs:** the "safety halo" partial arc (icon cropped to a corner, drawn as vector at 90 % black on black bands or yellow at low opacity on photos); black header band on covers and section dividers; yellow parallelogram tab on letter-style pages; yellow header bar with black text on tables (internal-form style).
**Page furniture:** A4 portrait for reports, A3 landscape for drawings. Margins 18 mm. Footer: small halo icon + page number bottom-left; document title · reference · revision bottom-right; a 0.5 pt grey20 rule above. Header on inner pages: document type in grey60 caps, right-aligned.

## Content rules ("HSE consultant angle")

- Every report has **document control**: reference (`ASU-RA-<yymm>-<seq>`), revision, issue date, prepared by (name, role), reviewed by (blank line if none), client, site, distribution, and a status stamp (DRAFT / ISSUED).
- **Scope and methodology** state what was done (walk-through observational survey, date, duration, areas covered and excluded), the assessment method (PAS 13:2017 impact-energy methodology; 5×5 likelihood × severity matrix), and the data sources (photos, rep observations, client-supplied vehicle data).
- **Standards and guidance referenced**, always the same block: PAS 13:2017 *Code of practice for safety barriers used in traffic management within workplace environments* (BSI); HSE HSG136 *A guide to workplace transport safety*; HSE HSG76 *Warehousing and storage: a guide to health and safety*; ISO 45001:2018 clause 6.1 (hazard identification and risk assessment); and, for UAE clients, a short line that the client's statutory duties arise under UAE federal labour law and applicable emirate OSH frameworks (Abu Dhabi OSHAD-SF where relevant). The implementing agent MUST verify the exact titles of any regulation it names via web search before shipping copy, and must not invent article numbers.
- **Hierarchy of controls** appears once, as a graphic, with A-SAFE barriers positioned as an engineering control and a sentence that they complement, not replace, traffic-management and behavioural controls.
- **Risk register** uses likelihood 1–5 × severity 1–5 with the legend printed; every zone has a rank, a score, a level, an observation, a recommendation, and an action timescale (Immediate / 30 days / 90 days / Planned).
- **Limitations and assumptions** section is mandatory: visual survey only, no destructive testing, floor construction assumed unless verified, vehicle data as supplied, energy calculations indicative until confirmed by the estimation team, drawings not to scale unless stated.
- **Indicative investment** is shown per zone and in total, ex-VAT, clearly labelled budgetary and valid 30 days.
- Language: British English, plain, active, third person for findings ("The rack end at aisle 4 is unprotected"), no hedging adjectives, numbers with units, Joules as `19,200 J`, lengths as `2.4 m`.
- Photos are evidence: each carries a caption `Fig 4.2 — Zone B, loading dock 3, 11 Sep 2026` and, where the vision service produced tags, the hazard tags as small chips under the caption.

---

## Task PD1: Rendering library

**Owns:** `worker/lib/pdf/` (new: `theme.ts`, `doc.ts`, `text.ts`, `blocks.ts`, `images.ts`, `assets.ts`, `index.ts`, `*.test.ts`), `worker/assets/brand/` (new; four logo PNGs as `.ts` base64 modules), `package.json` (`pdf-lib` dependency — coordinate with orchestrator; do not run npm install yourself unless told).

`doc.ts`
```ts
export interface DocMeta { title: string; reference: string; revision: string; issuedOn: string; docType: string; status: "DRAFT"|"ISSUED" }
export interface Doc { pdf: PDFDocument; fonts: { regular: PDFFont; bold: PDFFont }; meta: DocMeta; pages: Page[] }
export interface Page { page: PDFPage; cursorY: number; margin: { l: number; r: number; t: number; b: number }; number: number }
export async function createDoc(meta: DocMeta): Promise<Doc>
export function addPage(doc: Doc, opts?: { size?: "A4"|"A3L"; header?: boolean; footer?: boolean }): Page
export function ensureSpace(doc: Doc, page: Page, needed: number): Page   // adds a page when cursor would overflow
export async function finalize(doc: Doc): Promise<Uint8Array>            // stamps page numbers "n of N"
export const mm: (n: number) => number   // 1 mm = 2.8346 pt
```
`text.ts`: `measure(font, size, str)`, `wrap(font, size, str, maxWidth) → string[]`, `drawText(page, str, {x, y, size, font, color, maxWidth, lineHeight, align: "left" (default; never "justify")})` returning height, `heading(page, level: 1|2|3, str)` (H1 bold caps 20 pt, H2 bold caps 13 pt with a 2 pt yellow underline 24 mm wide, H3 bold 10.5 pt), `body(page, str)` (9.5 pt / 13.5 pt lead), `small(page, str)` (7.5 pt grey60), `label(page, str)` (7 pt caps grey60 with 0.05 em tracking).

`blocks.ts` (each returns the height used and handles page breaks via `ensureSpace`):
- `coverPage(doc, {heroImage?: bytes, docTypeLine, title, subtitle, client, site, date, preparedBy, reference, status})` — photo top 58 % (or a black field with the halo when no photo), black band below with title in white, yellow strapline logo, halo arc at 90 % black bottom-right, status stamp top-right of the band.
- `documentControl(doc, page, rows)` — two-column key/value table with a yellow header bar.
- `kpiTiles(doc, page, tiles: {label, value, sublabel?, tone?}[])` — up to 4 tiles, value bold 22 pt, thin grey20 border, tone strip on the left for risk levels.
- `riskMatrix(doc, page, counts: number[5][5], {highlight?})` — 5×5 grid, cells coloured by band, counts drawn as black numerals, axes labelled "Likelihood" / "Severity" with 1–5 descriptors.
- `table(doc, page, {columns: {key, label, width, align?}[], rows, zebra?: boolean, headerStyle: "yellow"|"black"})` — header bar repeated after page breaks, 8.5 pt body, tabular numerals via right-aligned columns.
- `chip(page, label, tone)` — small filled rectangle 6 mm high, 7 pt bold caps.
- `photo(doc, page, bytes, {maxW, maxH, caption, tags?})` — fits, keeps aspect, 0.5 pt grey20 border, caption in small.
- `productCard(doc, page, {image?, name, family, testedEnergyJ, keySpecs: string[], why, unitPriceAed?, lineTotalAed?})` — 2-column card with a black header bar and the tested-energy callout in a yellow box, mirroring the A-SAFE datasheet style.
- `calloutBox(doc, page, {tone: "yellow"|"black"|"grey", title?, body})`.
- `signOffBlock(doc, page, parties: {role, name?, title?, date?}[])` — three equal boxes with signature lines.
- `hierarchyOfControls(doc, page)` — inverted five-band triangle (Eliminate, Substitute, Engineering controls, Administrative, PPE) with the Engineering band in yellow and a one-line note.
- `sectionDivider(doc, {number, title, image?})` — black full-page band like the brand-guide section pages.

`images.ts`: `fetchImageBytes(env, ref, {timeoutMs: 6000, maxBytes: 4_000_000})` for `/api/objects/<key>` (R2 direct), `https://webcdn.asafe.com/...`, data URLs; `embedImage(doc, bytes)` sniffing JPEG/PNG magic bytes, returning `{ image, width, height }` or `null`; WebP/HEIC return null and the caller draws a labelled grey placeholder.

Tests: `blocks.test.ts` renders each block on a fresh doc and asserts page count and no throw; `text.test.ts` wraps a 300-word paragraph at 160 mm and asserts no line exceeds the width; `doc.test.ts` asserts "1 of 3" stamping and that output begins with `%PDF-`.

## Task PD2: Impact Protection Risk Assessment report

**Owns:** `worker/lib/pdf/reports/riskAssessment.ts`, `worker/routes/documents.ts` (new; mount in `worker/index.ts` one line), `shared/documents/refs.ts` (reference generator + test).

`renderRiskAssessment(env, surveyId, {status})`. Page order:
1. Cover (hero = best-scored photo of the highest-priority zone, else black field).
2. Document control + distribution + status; short "About this report" paragraph.
3. Contents (generated from section starts; two-level).
4. Executive summary: three paragraphs (site and scope; headline risk profile with counts by level; the top three actions), four KPI tiles (zones assessed, critical + high, indicative investment AED, photos on file), the 5×5 matrix with counts.
5. Scope and methodology; standards and guidance referenced; hierarchy of controls graphic.
6. Site context: facility, operations described by the rep, vehicle fleet table (class, mass, load, typical speed), traffic and pedestrian notes.
7. Risk register table sorted by rank (rank, zone, area type, level chip, L, S, score, recommendation, timescale).
8. Zone findings, one section per zone in rank order: hero photo with caption and tags, up to 3 thumbnails, "Observation", "Risk assessment" (L/S rationale bullets), "PAS 13 assessment" box (vehicle class, energy J at angle, required rating with 30 % margin, selected product rating, verdict chip), "Recommendation" with product card, "Action" with timescale.
9. Prioritised action plan: table grouped by timescale.
10. Indicative investment summary by zone and total, ex-VAT, budgetary note.
11. Limitations and assumptions.
12. Appendices: A. PAS 13 vehicle classes (from `pas13Classes`), B. Energy calculation method with the formula and the sine table, C. Photo index (thumbnail grid 4 × 6 per page with figure numbers), D. Product datasheet references.

Reference: `ASU-RA-<yymm>-<0001>` from a per-month counter table `document_refs` (id, kind, yymm, seq); revision starts at `A` and increments on each ISSUED render; DRAFT renders carry a diagonal "DRAFT" watermark at 8 % black on every page.

Routes: `GET /api/site-surveys/:id/documents/risk-assessment.pdf?status=draft|issued` (issued stores at `proposal_object_key`-style column `risk_assessment_object_key` and logs `document_issues` row: id, kind, ref, revision, survey_id, issued_by, issued_at, object_key).

Test: fixture survey with 3 areas, 6 tiny JPEGs → ≥ 12 pages, contains "RISK REGISTER", "LIMITATIONS", renders under 4 s.

## Task PD3: Budgetary proposal and order form

**Owns:** `worker/lib/pdf/reports/proposal.ts`, `worker/lib/pdf/reports/orderForm.ts`, routes in `worker/routes/documents.ts`, deletion of `worker/lib/orderFormPdfV2.ts`, `worker/lib/quoteDraftPdf.ts`, `client/src/utils/orderFormPdfGenerator.ts` and its test, and call-site swaps in `client/src/pages/OrderForm.tsx` (download handlers only), `worker/routes/orderForm.ts`, `worker/routes/quote.ts`.

Proposal (`ASU-PR-<yymm>-<seq>`), A4 portrait:
1. Cover.
2. Letter page: yellow tab with logo, client address block, date, reference, "Dear …", three short paragraphs (what we surveyed, what we propose, what happens next), signed by the rep with title and mobile.
3. Solution summary by zone: table (zone, risk level, proposed protection, length/qty, indicative AED).
4. Scope of supply: the order-form line table (item, description, tested energy, qty × length, unit AED, total AED) using `computeTotals`; then delivery, installation (complexity named), reciprocal value commitments applied, total ex-VAT, "valid 30 days".
5. Installation and site requirements: complexity rationale, floor and fixings assumptions, access, programme estimate, client responsibilities.
6. Commercial terms: payment, lead time, warranty line, exclusions, VAT note.
7. Product cards appendix (one per family used).
8. Drawing page(s) when an export exists.
9. Acceptance: technical / commercial / marketing sign-off blocks (existing approval chain), PO reference line.

Order form (`ASU-OF-<yymm>-<seq>`) = pages 4, 6, 9 of the proposal as a standalone.

Routes: `GET /api/site-surveys/:id/documents/proposal.pdf`, `GET /api/orders/:id/documents/order-form.pdf`. The order-form page's Download buttons point here; the public share and approval views serve the same bytes.

## Task PD4: Drawing sheet, PAS 13 statement, and verification report

**Owns:** `worker/lib/pdf/reports/drawingSheet.ts` (used by Phase 4 L4), `worker/lib/pdf/reports/pas13Statement.ts` (replaces `worker/lib/pas13AlignmentReportPdf.ts`), `worker/lib/pdf/reports/installationVerification.ts`, routes.

- Drawing sheet: A3 landscape title-block frame as vectors (dwg no, rev, date, scale, title, project, drawn/checked, revision table, notes, legend from the symbol library, "DO NOT SCALE", A-SAFE UAE address), drawing area receives the base page/image plus overlay from Phase 4.
- PAS 13 Alignment Statement (`ASU-PS-…`): 2–4 pages: purpose, vehicle classes on site, per-product alignment table (product, tested energy, required, margin, verdict), citations block, signature.
- Installation Verification Report (`ASU-IV-…`): generated from the installation timeline module after completion: as-installed photo per zone beside the proposal photo, checklist (post centres, fixings, deflection zone clear, signage), snag list, handover sign-off. This is the document that closes the loop and supports a maintenance/inspection service.

## Task PD5: Share pages and emails match the system

**Owns:** `client/src/pages/SharedProjectView.tsx`, `client/src/pages/SharedOrderView.tsx`, `client/src/pages/ApprovalLanding.tsx`, `client/src/styles/document.css` (new), `worker/services/email.ts` (templates only).

- A `document-shell` CSS class set: black header band with yellow logo, uppercase bold headings, yellow table headers, risk chips in the RISK_COLOURS, left-aligned body, halo motif as an SVG. The three public pages render inside it and offer "Download PDF" which hits the PD2/PD3 routes.
- Email templates: one base layout (black header band, yellow rule, grey8 footer with the UAE office block), used by order confirmation, approval request, proposal delivery, and install-team digest. Subject lines carry the document reference.

## Task PD6: Document register in the app

**Owns:** `client/src/pages/Projects.tsx` (new "Documents" tab), `worker/routes/documents.ts` (list endpoint), `shared/schema.ts` (`document_issues`, `document_refs` tables) + migration SQL.

- Projects → Documents tab lists every issued document (kind, ref, rev, date, issued by, download, "Issue new revision"), and a "Draft" row per renderable document that has not been issued.
- Issuing increments the revision, stores the PDF in R2, and appends to the project activity feed.

---

## Verification (orchestrator)
- `npm run check`; render each report from fixtures in tests.
- Preview version: open each PDF from a real survey and order; check cover, document control, contents page numbers, matrix counts equal register rows, photos with captions, product cards with images, totals equal the app's totals, sign-off blocks, DRAFT watermark on drafts and none on issued.
- Read two pages aloud for tone: no marketing fluff, every claim measurable.
