# Engage Phase 3: Survey as the Flagship

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rep walks a warehouse, airport, or factory with a phone, takes photos, and leaves with a PAS 13-aligned risk assessment, recommended A-SAFE barriers per zone, and one polished proposal document that includes the budgetary order form.

**Architecture:** New "Survey Walk" capture mode (camera-first, offline-queued uploads to R2) feeds a vision-analysis service that returns structured observations per photo. Reps confirm observations in a review screen; confirmed observations become survey areas. A deterministic risk register (likelihood × severity) and the existing PAS 13 engine produce the assessment. A server-side pdf-lib renderer produces the proposal document; it replaces both client-side jsPDF generators. Surveys are snapshotted on completion so return visits can be compared.

**Tech Stack:** Existing stack plus `pdf-lib` (Worker-side PDF with JPEG/PNG embedding), IndexedDB (via a 60-line wrapper, no library) for the offline upload queue, Anthropic Messages API via `fetch` (Claude Haiku 4.5, cheapest vision-capable Claude) with an OpenAI `gpt-4o-mini` fallback when `ANTHROPIC_API_KEY` is absent.

**Model policy (Tom: "whichever is best, keep costs low"):** default `claude-haiku-4-5-20251001` for per-photo analysis; one call per photo, image downscaled to ≤ 1280 px before upload so each call is roughly 1,500 input tokens. Provider is selected at runtime by env presence, so nothing breaks if only the OpenAI key exists. Before writing any Anthropic call, the implementing agent MUST load the `claude-api` skill.

**Rules for every task:** same as Phase 1 (owned files only, no commits, keep owned files `tsc`-clean, tests for pure logic, report file:line).

---

## Data model changes (Task S0, orchestrator applies SQL)

`migrations/2026-09-12-survey-flagship.sql`:

```sql
-- Per-photo records (replaces the photos_urls jsonb array for new surveys; old arrays still read)
CREATE TABLE IF NOT EXISTS survey_photos (
  id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  site_survey_id varchar NOT NULL REFERENCES site_surveys(id) ON DELETE CASCADE,
  area_id       varchar REFERENCES site_survey_areas(id) ON DELETE SET NULL,
  zone_name     varchar,
  object_key    varchar NOT NULL,               -- R2 key
  width         integer, height integer,
  taken_at      timestamp DEFAULT now(),
  lat           double precision, lng double precision,
  voice_note    text,
  analysis      jsonb,                          -- VisionObservation, null until analysed
  analysis_status varchar NOT NULL DEFAULT 'pending', -- pending|done|failed|skipped
  analysis_model varchar,
  created_at    timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS survey_photos_survey_idx ON survey_photos(site_survey_id);

ALTER TABLE site_survey_areas
  ADD COLUMN IF NOT EXISTS likelihood integer,          -- 1..5
  ADD COLUMN IF NOT EXISTS severity integer,            -- 1..5
  ADD COLUMN IF NOT EXISTS risk_score integer,          -- likelihood*severity
  ADD COLUMN IF NOT EXISTS priority_rank integer,       -- 1 = most urgent within survey
  ADD COLUMN IF NOT EXISTS load_mass real,
  ADD COLUMN IF NOT EXISTS traffic_density varchar,     -- low|medium|high
  ADD COLUMN IF NOT EXISTS pedestrian_exposure varchar, -- none|occasional|frequent|constant
  ADD COLUMN IF NOT EXISTS existing_protection varchar, -- none|partial|adequate
  ADD COLUMN IF NOT EXISTS recommended_length_m real,   -- rep-entered run length for costing
  ADD COLUMN IF NOT EXISTS pas13_verdict jsonb,         -- output of pas13Verdict for the chosen product
  ADD COLUMN IF NOT EXISTS ai_observation text;

ALTER TABLE site_surveys
  ADD COLUMN IF NOT EXISTS previous_survey_id varchar REFERENCES site_surveys(id),
  ADD COLUMN IF NOT EXISTS snapshot jsonb,              -- frozen SurveySnapshot at completion
  ADD COLUMN IF NOT EXISTS proposal_object_key varchar; -- last rendered proposal PDF in R2
```

Mirror every column in `shared/schema.ts` (Drizzle) with matching Zod insert schemas.

---

## Task S1: Vision analysis service

**Owns:** `worker/services/vision/` (new: `index.ts`, `anthropic.ts`, `openai.ts`, `schema.ts`, `prompt.ts`, `vision.test.ts`), `worker/routes/surveyPhotos.ts` (new), mount line in `worker/index.ts`.

`worker/services/vision/schema.ts`:
```ts
import { z } from "zod";
export const AreaTypeEnum = z.enum([
  "racking_aisle","loading_dock","pedestrian_walkway","column_protection","door_or_gate",
  "machinery_perimeter","cold_storage","car_park","yard_or_external","mezzanine_edge",
  "charging_area","conveyor_or_process","other"]);
export const VisionObservation = z.object({
  sceneSummary: z.string().max(400),
  areaType: AreaTypeEnum,
  observedElements: z.array(z.object({
    type: z.enum(["racking","dock","column","door","pedestrian_route","existing_barrier","floor","vehicle","machinery","edge","signage","other"]),
    condition: z.enum(["good","damaged","critical","unprotected","unknown"]),
    note: z.string().max(200),
  })).max(12),
  hazards: z.array(z.object({
    tag: z.enum(["vehicle_pedestrian_conflict","unprotected_racking","unprotected_column","damaged_barrier","dock_edge","blind_corner","no_segregation","floor_damage","overhead_services","other"]),
    severity: z.enum(["low","medium","high","critical"]),
    evidence: z.string().max(200),
  })).max(8),
  likelyVehicles: z.array(z.enum(["counterbalance_forklift","reach_truck","pallet_truck","tug","hgv","van","car","none","unknown"])).max(4),
  floorType: z.enum(["concrete","asphalt","tiled","paving","steel","unknown"]),
  existingProtection: z.enum(["none","partial","adequate","unknown"]),
  pedestrianExposure: z.enum(["none","occasional","frequent","constant","unknown"]),
  suggestedRiskLevel: z.enum(["low","medium","high","critical"]),
  confidence: z.number().min(0).max(1),
  observation: z.string().max(600), // 2-3 report-ready sentences, British English, no hedging words like "appears"
});
export type VisionObservation = z.infer<typeof VisionObservation>;
```

`worker/services/vision/index.ts`:
```ts
export interface VisionProvider { name: string; analyse(imageBytes: Uint8Array, mime: string, ctx: {zoneName?: string; facilityType?: string}): Promise<VisionObservation>; }
export function getVisionProvider(env: Env): VisionProvider | null  // anthropic if ANTHROPIC_API_KEY, else openai if OPENAI_API_KEY, else null
export async function analysePhoto(env, bytes, mime, ctx): Promise<{ observation: VisionObservation; model: string }>
```
- Prompt (`prompt.ts`): system text describing A-SAFE's job (impact protection for workplaces), the PAS 13 vocabulary (vehicle classes, segregation, deflection zone), the JSON schema (as text), and the instruction to return ONLY JSON. Include 3 few-shot examples in the prompt as text (racking aisle with forklift; loading dock with pedestrians; column with damaged existing barrier).
- Both providers request JSON output, parse with `VisionObservation.safeParse`, and on failure retry once with the validation errors appended ("Your previous output failed validation: … Return corrected JSON only."). On second failure throw `VisionParseError`.
- Wrap provider calls with the existing `withOpenAiRetry`-style helper (generalise it to `withRetry(label, fn)` in `worker/lib/retryOpenAi.ts` without changing existing callers).
- Tests: `vision.test.ts` covers `safeParse` on a good fixture, a bad fixture (missing field), and provider selection by env.

Routes (`worker/routes/surveyPhotos.ts`), all `authMiddleware` + survey ownership check:
- `POST /api/site-surveys/:id/photos` multipart or JSON `{ bytesBase64, mime, zoneName?, lat?, lng?, width?, height?, takenAt? }` → puts to R2 key `survey-photos/<surveyId>/<uuid>.jpg`, inserts `survey_photos` row with `analysis_status='pending'`, returns the row. Then **fire-and-forget** `c.executionCtx.waitUntil(analyseAndStore(...))` which calls `analysePhoto` and updates the row (`done`/`failed`).
- `GET /api/site-surveys/:id/photos` → rows (with `objectUrl: /api/objects/<key>`).
- `POST /api/survey-photos/:photoId/reanalyse` → re-run.
- `PATCH /api/survey-photos/:photoId` → `{ zoneName?, areaId?, voiceNote? }`.
- `DELETE /api/survey-photos/:photoId`.
- Rate limit: `heavyMutationRateLimit`.

## Task S2: Survey Walk capture UI

**Owns:** `client/src/pages/survey/` (new: `SurveyWalk.tsx`, `WalkCamera.tsx`, `ZoneChip.tsx`, `UploadQueue.ts`, `useUploadQueue.ts`, `idb.ts`), route `/site-survey/:id/walk` in `App.tsx` (one line), `client/public/manifest.json` (start_url `/`, shortcut → `/site-survey?new=1` stays).

Behaviour:
- Full-screen, dark, portrait-first. Top: survey title + current zone chip (tap to rename / "New zone"). Centre: live camera preview via `getUserMedia({ video: { facingMode: "environment" } })`; fallback to `<input capture>` if getUserMedia is unavailable. Bottom: large shutter (72 px), gallery-import button, mic button (hold to record a voice note transcribed with Web Speech API into `voiceNote`), "Finish walk" button.
- On shutter: draw the frame to a canvas at max 1280 px long edge, JPEG 0.82, read GPS via `navigator.geolocation.getCurrentPosition` (non-blocking, 3 s timeout), enqueue `{ surveyId, blob, zoneName, lat, lng, takenAt, width, height, voiceNote }` in IndexedDB (`idb.ts`: `open`, `put`, `getAll`, `delete` over one store `uploads`).
- `useUploadQueue`: processes the queue whenever online; POSTs to `/api/site-surveys/:id/photos`; on success deletes the queue item and optimistically adds the photo to the React Query cache for `["survey-photos", surveyId]`; exponential backoff on failure; badge shows `N queued`.
- A thumbnail strip along the bottom shows the last 6 shots with a small status dot: grey (queued), amber (analysing), green (analysed), red (failed, tap to retry).
- "Finish walk" → `/site-survey/:id/review`.
- Haptics via existing `useHapticFeedback` on shutter and on analysis complete.
- Landscape and tablet: camera preview centred, controls in a right rail.

## Task S3: Review and confirm

**Owns:** `client/src/pages/survey/SurveyReview.tsx`, `client/src/pages/survey/ObservationCard.tsx`, `client/src/pages/survey/useSurveyPhotos.ts`, route `/site-survey/:id/review`.

Behaviour:
- Groups photos by `zoneName`. Each zone shows its photos as a horizontal strip and, for each analysed photo, an `ObservationCard`: AI scene summary, area-type select (pre-selected), hazards as removable chips with severity colour, condition and risk selects (pre-filled), vehicle chips (multi-select, pre-selected), pedestrian exposure, existing protection, floor type, and the report-ready observation text in an editable textarea. Low-confidence (< 0.5) cards show an amber "Check this" banner.
- Zone-level fields (one per zone): traffic density (low/medium/high), typical vehicle mass and load mass (pre-filled from PAS 13 vehicle class defaults in `pas13Classes`), speed (default from class), recommended run length in metres (rep enters), and a "Merge photos into one area" toggle (default on: one area per zone; off: one area per photo).
- "Confirm zone" → `POST /api/site-surveys/:id/areas/from-observations` with the confirmed payload; server creates the area(s), links photos (`survey_photos.area_id`), stores `ai_observation`, runs the PAS 13 calc (Phase 2 Task K1 endpoint) and the risk register (Task S4), and returns the area with `recommendedProducts`, `pas13Verdict`, `riskScore`, `priorityRank`.
- "All zones confirmed" → back to the survey detail page, which now shows the risk register (Task S5 UI).

Photos that fail analysis can still be confirmed manually (card with empty defaults).

## Task S4: Risk register (pure logic + server)

**Owns:** `shared/risk/` (new: `riskRegister.ts`, `riskRegister.test.ts`), `worker/routes/siteSurveys.ts` (`areas/from-observations` handler + `complete` handler additions), `worker/storage.ts` (survey area create/update to include new columns; `rankSurveyAreas`).

`shared/risk/riskRegister.ts`:
```ts
export interface RiskInputs {
  vehicleClass: "T1"|"T2"|"T3"|"T4"|null;      // from pas13Classes by mass
  trafficDensity: "low"|"medium"|"high";
  pedestrianExposure: "none"|"occasional"|"frequent"|"constant";
  existingProtection: "none"|"partial"|"adequate";
  currentCondition: "good"|"damaged"|"critical"|"unprotected";
  hazardSeverities: Array<"low"|"medium"|"high"|"critical">;
  assetCriticality?: "low"|"medium"|"high";     // racking full of stock, machinery, structural column
}
export interface RiskOutput { likelihood: 1|2|3|4|5; severity: 1|2|3|4|5; score: number; level: "low"|"medium"|"high"|"critical"; rationale: string[] }
export function assessRisk(i: RiskInputs): RiskOutput
export function rankAreas<T extends {score:number; id:string}>(areas: T[]): Array<T & {priorityRank:number}>
```
Rules (encode exactly):
- likelihood base by trafficDensity (low 2, medium 3, high 4); +1 if vehicleClass T3/T4; +1 if existingProtection none and currentCondition unprotected; −1 if existingProtection adequate and condition good; clamp 1..5.
- severity base by pedestrianExposure (none 2, occasional 3, frequent 4, constant 5); +1 if any hazard critical; +1 if assetCriticality high; −1 if vehicleClass T1 and pedestrianExposure none; clamp 1..5.
- score = likelihood × severity; level: ≤4 low, 5–9 medium, 10–15 high, ≥16 critical.
- rationale: one sentence per rule that fired.
Tests: at least 8 cases including clamps and rank ties (ties broken by severity then by area name).

## Task S5: Survey detail page — risk register and actions

**Owns:** `client/src/pages/SiteSurvey.tsx` (survey detail section only; the Phase 1 agent has finished with it by now), `client/src/pages/survey/RiskRegister.tsx`, `client/src/pages/survey/RiskHeatmap.tsx`.

- Replace the flat area list with: summary strip (areas, photos, overall level, highest-priority zone), a 5×5 heatmap (SVG, theme tokens, counts in cells), and the register table sorted by `priorityRank` with columns: rank, zone, area type, level chip, score, recommended barrier, budget line (from `recommended_length_m × unit rate`, using `shared/pricing`), PAS 13 verdict chip. Row expands to photos + observation + rationale.
- Primary actions: "Continue walk", "Generate proposal" (Task S6), "Build order form" (bulk-add recommended barriers with their lengths to the cart, using the fixed modal from Phase 1), "Complete survey" (snapshot, Task S7).
- Remove "Generate quote draft" button (the proposal replaces it) but keep the route alive for now.

## Task S6: Proposal document (server-side pdf-lib)

**Owns:** `worker/lib/pdf/` (new: `doc.ts` layout primitives, `theme.ts`, `images.ts`, `proposal.ts`, `orderForm.ts`, `proposal.test.ts`), `worker/routes/proposal.ts` (new), mount line in `worker/index.ts`, `package.json` (`pdf-lib` dependency), deletion of `client/src/utils/siteSurveyPdfGenerator.ts` and `client/src/utils/orderFormPdfGenerator.ts` and `worker/lib/orderFormPdfV2.ts` and `worker/lib/quoteDraftPdf.ts` once the new renderer is wired (and their call sites in `SiteSurvey.tsx`, `OrderForm.tsx`, `orderForm.ts`, `quote.ts` — one-line replacements allowed).

`doc.ts` primitives: `createDoc({title})`, `page(doc, {size:"A4"|"A4-landscape"})`, `text(page, str, {x,y,size,font,color,maxWidth,lineHeight,align})` returning height used, `table(page, {columns, rows, x, y, width})` with automatic page breaks, `image(page, bytes, {x,y,w,h,fit})` (JPEG via `embedJpg`, PNG via `embedPng`, sniff by magic bytes; on failure draw a labelled grey box), `chip(page, label, level)`, `header/footer` with A-SAFE yellow rule, page numbers, document ref, date. Fonts: Helvetica + Helvetica-Bold (standard 14, no embedding). Colours: A-SAFE yellow `#FFC72C`, ink `#17160F`, level colours matching the app chips.

`images.ts`: `fetchImage(env, urlOrKey, {maxBytes: 3_000_000, timeoutMs: 6000})` → bytes or null. Handles `/api/objects/<key>` (read R2 directly), `https://webcdn.asafe.com/...` (fetch), data URLs (decode). Product images: prefer `products.imageUrl`.

`proposal.ts` `renderProposal(env, {surveyId, projectId?, includeOrderForm: boolean, includeDrawing: boolean})` → `Uint8Array`. Pages:
1. Cover: customer logo (if any), facility, "Observational impact protection survey and proposal", date, prepared by (rep name, email, mobile), A-SAFE UAE address block, document ref `SS-<id8>`.
2. Executive summary: 3 KPI tiles (areas surveyed, high/critical zones, budget total), overall level, the heatmap (drawn as vector rectangles), top-3 priorities with one line each.
3. Risk register table (rank, zone, area type, level, score, recommendation, budget).
4. One page per area in priority order: hero photo (largest) + up to 3 thumbnails; observation text; PAS 13 box (vehicle class, energy J, required rating, chosen product rating, margin %, verdict chip); recommended barrier card (product image, name, one-line why, indicative AED per metre and line budget); rationale bullets.
5. Layout drawing page(s) if `includeDrawing` and the project has a drawing export in R2 (Phase 4 provides `layout_drawings.export_object_key`; until then, skip silently).
6. Budgetary order form if `includeOrderForm`: line items from the cart (or from the register if the cart is empty) via `computeTotals`; complexity; totals ex-VAT; validity 30 days; the technical/commercial sign-off blocks that exist today.
7. Methodology and next steps: PAS 13 explanation (reuse the existing copy in `pas13Rules.ts` citations), risk matrix legend, contact.

`orderForm.ts` `renderOrderForm(env, orderId)` reuses the same primitives for the standalone order form (replaces v2 and the client generator).

Routes: `GET /api/site-surveys/:id/proposal.pdf?orderForm=1&drawing=1` streams the PDF (and stores it at `proposal_object_key`), `GET /api/orders/:id/form.pdf`. Both `authMiddleware` + ownership; the existing public share views may call an internal renderer for the customer copy.

Tests: `proposal.test.ts` renders a fixture survey with two areas and two 1×1 JPEG fixtures and asserts the output starts with `%PDF`, has ≥ 5 pages (`PDFDocument.load(bytes).getPageCount()`), and completes in under 3 s.

## Task S7: Snapshots and return visits

**Owns:** `worker/routes/siteSurveys.ts` (`complete` handler, new `compare` endpoint), `shared/survey/snapshot.ts` (+ test), `client/src/pages/survey/SurveyCompare.tsx`, route `/site-survey/:id/compare`.

- `SurveySnapshot = { surveyId, completedAt, areas: Array<{ zoneName, areaName, areaType, riskLevel, score, priorityRank, condition, recommendedProduct?, photoKeys: string[], observation }> }`. Written to `site_surveys.snapshot` on complete.
- New survey dialog gets "Return visit to…" picker listing the customer's completed surveys; sets `previous_survey_id` and pre-creates zones with the same names.
- `GET /api/site-surveys/:id/compare` → pairs zones by name (case-insensitive, fuzzy on `nameNormalise`) and returns `{ zone, before, after, delta: "improved"|"same"|"worse"|"new"|"removed" }`.
- `SurveyCompare.tsx`: two-column cards per zone with before/after hero photo, level chips, and the delta badge. Proposal page 2 gets a "Since last visit" strip when `previous_survey_id` is set.

---

## Verification (orchestrator)
- `npm run check` and `npm run build` green.
- Preview version: walk flow on a phone-width viewport with a real photo (use the browser's fake camera or the gallery import path), analysis returns within 10 s, review screen pre-fills, confirm creates areas with risk scores, proposal PDF opens with images.
- Cost check: log `analysis_model` and input/output token counts per photo in `email_log`-style table `ai_usage` (id, kind, model, input_tokens, output_tokens, cost_usd_est, created_at) — add to S1.
