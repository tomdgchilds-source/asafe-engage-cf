// ─────────────────────────────────────────────────────────
// React Query access to a survey's risk register (Phase 3, Task S5) plus
// the pure helpers the survey detail page needs (unit-tested in
// useSurveyRegister.test.ts).
//
//   useSurveyRegister(surveyId)   GET  /api/site-surveys/:id/register
//   useReassessArea(surveyId)     POST /api/site-surveys/:id/areas/:areaId/reassess
//
// Cache key is ["/api/site-surveys", surveyId, "register"] so the page's
// existing `invalidateQueries({ queryKey: ["/api/site-surveys"] })` calls
// refresh the register too.
//
// The response types below mirror `RegisterArea` / the register handler in
// worker/routes/siteSurveys.ts (Task S4). They are duplicated here rather
// than imported so the client bundle never reaches into worker/.
// ─────────────────────────────────────────────────────────
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Pas13Verdict, Verdict } from "@shared/pas13Rules";
import type { RiskLevel, RiskLevelBand } from "@shared/risk";
import { lineTotalAed, round2 } from "@shared/pricing";
import { apiRequest } from "@/lib/queryClient";

// =============================================
// TYPES (mirror of the server response)
// =============================================

/** One entry of `site_survey_areas.recommended_products`. */
export interface RegisterProductRecommendation {
  productId: string;
  productName: string;
  impactRating: number | null;
  imageUrl: string | null;
  price: string | number | null;
  category: string | null;
  safetyMarginPct: number;
  pas13Verdict: Verdict;
  notAligned: boolean;
  reason: string;
}

export interface RegisterPhoto {
  id: string;
  objectUrl: string;
  zoneName: string | null;
  takenAt: string | null;
  analysisStatus: string;
}

export interface RegisterArea {
  id: string;
  siteSurveyId: string;
  zoneName: string;
  areaName: string;
  areaType: string;
  areaTypeLabel: string;
  currentCondition: string;
  riskLevel: RiskLevel | null;
  likelihood: number | null;
  severity: number | null;
  riskScore: number | null;
  priorityRank: number | null;
  priority: string;
  trafficDensity: string | null;
  pedestrianExposure: string | null;
  existingProtection: string | null;
  vehicleWeight: number | null;
  vehicleSpeed: number | null;
  impactAngle: number | null;
  loadMass: number | null;
  calculatedJoules: number | null;
  recommendedLengthM: number | null;
  recommendedProducts: RegisterProductRecommendation[];
  topProduct: RegisterProductRecommendation | null;
  pas13Verdict: Pas13Verdict | null;
  issueDescription: string;
  aiObservation: string | null;
  recommendedAction: string | null;
  estimatedCost: string | null;
  rationale: string[];
  photos: RegisterPhoto[];
  /** Legacy inline photo URLs (surveys created before survey_photos). */
  photosUrls: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface RegisterSummary {
  total: number;
  assessed: number;
  unassessed: number;
  byLevel: Record<RiskLevel, number>;
  overallRiskLevel: RiskLevel | null;
  photos: number;
  highestPriorityAreaId: string | null;
  highestPriorityZone: string | null;
}

export interface SurveyRegister {
  surveyId: string;
  areas: RegisterArea[];
  /** matrix[likelihood - 1][severity - 1] = count of assessed areas. */
  matrix: number[][];
  summary: RegisterSummary;
  bands: RiskLevelBand[];
}

// =============================================
// QUERIES
// =============================================

export const surveyRegisterKey = (surveyId: string) =>
  ["/api/site-surveys", surveyId, "register"] as const;

export async function fetchSurveyRegister(surveyId: string): Promise<SurveyRegister> {
  const res = await apiRequest(`/api/site-surveys/${encodeURIComponent(surveyId)}/register`, "GET");
  return (await res.json()) as SurveyRegister;
}

export function useSurveyRegister(surveyId: string | undefined) {
  return useQuery<SurveyRegister>({
    queryKey: surveyRegisterKey(surveyId ?? ""),
    enabled: !!surveyId,
    queryFn: () => fetchSurveyRegister(surveyId as string),
    staleTime: 15_000,
  });
}

export function useReassessArea(surveyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (areaId: string) => {
      const res = await apiRequest(
        `/api/site-surveys/${encodeURIComponent(surveyId ?? "")}/areas/${encodeURIComponent(areaId)}/reassess`,
        "POST",
      );
      return (await res.json()) as RegisterArea;
    },
    onSuccess: () => {
      if (!surveyId) return;
      // Ranks of every other row may have moved, so refetch the whole register.
      qc.invalidateQueries({ queryKey: surveyRegisterKey(surveyId) });
      qc.invalidateQueries({ queryKey: ["/api/site-surveys", surveyId, "areas"] });
    },
  });
}

// =============================================
// PURE HELPERS
// =============================================

/** Numeric read of a stored money / length field; junk → 0. */
function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** True when at least one area carries a register score (Task S4 data). */
export function hasRegisterData(areas: readonly Pick<RegisterArea, "riskScore">[] | undefined): boolean {
  return !!areas?.some((a) => typeof a.riskScore === "number" && Number.isFinite(a.riskScore));
}

/** Register order: priority_rank ascending, unranked last (newest first). */
export function sortByPriorityRank<T extends Pick<RegisterArea, "priorityRank" | "createdAt">>(areas: readonly T[]): T[] {
  return [...areas].sort((a, b) => {
    const ra = a.priorityRank ?? Number.POSITIVE_INFINITY;
    const rb = b.priorityRank ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return cb - ca;
  });
}

export interface BudgetLine {
  /** AED per metre used for the line (the top product's stored rate). */
  ratePerM: number;
  lengthM: number;
  /** round2(ratePerM × lengthM) via shared/pricing. */
  totalAed: number;
}

/**
 * Budget line for a register row: `recommendedLengthM × top product rate`.
 * Null when the area has no top product, no positive rate, or no run length —
 * the table then shows a prompt instead of a guessed figure.
 */
export function budgetLineFor(
  area: Pick<RegisterArea, "topProduct" | "recommendedLengthM">,
): BudgetLine | null {
  const ratePerM = round2(num(area.topProduct?.price));
  const lengthM = num(area.recommendedLengthM);
  if (ratePerM <= 0 || lengthM <= 0) return null;
  const totalAed = lineTotalAed({
    id: "budget",
    unitPriceAed: ratePerM,
    quantity: 1,
    lengthMeters: lengthM,
    pricingType: "per-meter",
  });
  return { ratePerM, lengthM, totalAed };
}

/** Sum of every row's budget line (rows without one contribute 0). */
export function registerBudgetTotalAed(areas: readonly Pick<RegisterArea, "topProduct" | "recommendedLengthM">[]): number {
  return round2(areas.reduce((sum, a) => sum + (budgetLineFor(a)?.totalAed ?? 0), 0));
}

export function formatAed(n: number): string {
  return `AED ${n.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Minimal photo shape for the "Review photos" badge (from useSurveyPhotos). */
export interface LinkablePhoto {
  areaId?: string | null;
  analysisStatus: string;
}

/** Analysed photos not yet linked to an area — what the review screen still has to confirm. */
export function countUnlinkedAnalysed(photos: readonly LinkablePhoto[] | undefined): number {
  return (photos ?? []).filter((p) => p.analysisStatus === "done" && !p.areaId).length;
}

// ---- Build order form -----------------------------------------------------

/** One line for POST /api/cart/bulk-add (shape from worker/routes/cart.ts). */
export interface OrderFormItem {
  productName: string;
  /** Metres for per-metre lines (cart_items has no length column), else units. */
  quantity: number;
  pricingType: "linear_meter" | "standard_item";
  unitPrice: number;
  totalPrice: number;
  notes: string;
  applicationArea: string;
  areaName: string;
  zoneName: string;
  impactRating: number | null;
  riskLevel: string | null;
  requiresDelivery: boolean;
  deliveryAddress: string | undefined;
  requiresInstallation: boolean;
}

/**
 * Bulk-add lines for every ranked area with a top product. Areas with a run
 * length become per-metre lines (quantity = metres); the rest are one unit.
 * Order follows the register (priority rank) so the cart reads top-down.
 */
export function buildOrderFormItems(
  areas: readonly RegisterArea[],
  survey: { facilityLocation?: string | null } | null | undefined,
): OrderFormItem[] {
  const items: OrderFormItem[] = [];
  for (const area of sortByPriorityRank(areas)) {
    const product = area.topProduct;
    if (!product) continue;
    const unitPrice = round2(num(product.price));
    const lengthM = num(area.recommendedLengthM);
    const perMetre = lengthM > 0;
    const quantity = perMetre ? lengthM : 1;
    const verdict = area.pas13Verdict?.verdict ?? product.pas13Verdict;
    const rank = area.priorityRank ? `#${area.priorityRank} ` : "";
    items.push({
      productName: product.productName,
      quantity,
      pricingType: perMetre ? "linear_meter" : "standard_item",
      unitPrice,
      totalPrice: round2(unitPrice * quantity),
      notes: `${rank}${area.zoneName} — ${area.areaName}. PAS 13 ${verdictLabel(verdict)}${
        area.riskLevel ? ` · ${area.riskLevel} risk` : ""
      }`,
      applicationArea: area.areaType,
      areaName: area.areaName,
      zoneName: area.zoneName,
      impactRating: product.impactRating,
      riskLevel: area.riskLevel,
      requiresDelivery: true,
      deliveryAddress: survey?.facilityLocation ?? undefined,
      requiresInstallation: true,
    });
  }
  return items;
}

export function verdictLabel(verdict: Verdict | null | undefined): string {
  switch (verdict) {
    case "aligned":
      return "aligned";
    case "borderline":
      return "borderline";
    case "not_aligned":
      return "not aligned";
    default:
      return "not assessed";
  }
}

// ---- Return visits (Task S7, client side) ---------------------------------

/** Minimal survey shape for the "Return visit to…" picker. */
export interface ReturnVisitCandidate {
  id: string;
  title: string;
  facilityName: string;
  facilityLocation?: string | null;
  companyLogoUrl?: string | null;
  status: string;
  surveyDate?: string | null;
  createdAt?: string | null;
  snapshot?: unknown;
}

function normaliseName(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Completed surveys a new survey can be a return visit to. When the rep has
 * typed a facility name only that customer's surveys are listed; otherwise
 * every completed survey is offered (picking one fills the facility in).
 * Newest first.
 */
export function returnVisitCandidates<T extends ReturnVisitCandidate>(
  surveys: readonly T[] | undefined,
  facilityName: string | null | undefined,
): T[] {
  const wanted = normaliseName(facilityName);
  return (surveys ?? [])
    .filter((s) => s.status === "completed")
    .filter((s) => !wanted || normaliseName(s.facilityName) === wanted)
    .sort((a, b) => {
      const ta = new Date(a.surveyDate ?? a.createdAt ?? 0).getTime();
      const tb = new Date(b.surveyDate ?? b.createdAt ?? 0).getTime();
      return tb - ta;
    });
}

/** Unique zone names, first occurrence order, blanks dropped. */
export function uniqueZoneNames(areas: readonly { zoneName?: string | null }[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of areas ?? []) {
    const name = (a.zoneName ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Zone names frozen in a completed survey's snapshot (Task S7), if any. */
export function zoneNamesFromSnapshot(snapshot: unknown): string[] {
  const areas = (snapshot as { areas?: unknown } | null | undefined)?.areas;
  if (!Array.isArray(areas)) return [];
  return uniqueZoneNames(areas as Array<{ zoneName?: string | null }>);
}
