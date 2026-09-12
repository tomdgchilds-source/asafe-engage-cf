// ─────────────────────────────────────────────────────────
// RiskRegister — the register table on the survey detail page (Phase 3,
// Task S5). Rows are the survey's areas in priority order; a row expands
// to its photos, the vision observation, the scoring rationale and a
// "Reassess" button that re-runs the deterministic assessment server-side.
//
// Data comes from GET /api/site-surveys/:id/register via useSurveyRegister.
// ─────────────────────────────────────────────────────────
import { Fragment, useState } from "react";
import { Camera, ChevronDown, ChevronRight, Loader2, RefreshCw, Ruler } from "lucide-react";
import type { Verdict } from "@shared/pas13Rules";
import { RISK_LEVEL_BANDS, describeLikelihood, describeSeverity, type RiskLevel, type RiskLevelBand } from "@shared/risk";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LEVEL_COLORS } from "./RiskHeatmap";
import { budgetLineFor, formatAed, sortByPriorityRank, verdictLabel, type RegisterArea } from "./useSurveyRegister";

// =============================================
// CHIPS (shared with the summary strip on SiteSurvey.tsx)
// =============================================

const LEVEL_CHIP_CLASS: Record<RiskLevel, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-900",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300 border-yellow-200 dark:border-yellow-900",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border-orange-200 dark:border-orange-900",
  critical: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-900",
};

export function LevelChip({
  level,
  bands = RISK_LEVEL_BANDS,
  className,
  size = "sm",
}: {
  level: RiskLevel | null | undefined;
  bands?: readonly RiskLevelBand[];
  className?: string;
  size?: "sm" | "md";
}) {
  if (!level) {
    return (
      <Badge variant="outline" className={cn("font-medium text-muted-foreground", size === "md" && "px-3 py-1 text-sm", className)}>
        Not assessed
      </Badge>
    );
  }
  const band = bands.find((b) => b.level === level);
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-semibold capitalize", LEVEL_CHIP_CLASS[level], size === "md" && "px-3 py-1 text-sm", className)}
      title={band ? `${band.description} Action: ${band.actionTimescale}.` : undefined}
      data-testid={`level-chip-${level}`}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: LEVEL_COLORS[level] }} aria-hidden />
      {band?.label ?? level}
    </Badge>
  );
}

const VERDICT_CHIP_CLASS: Record<Verdict, string> = {
  aligned: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-900",
  borderline: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  not_aligned: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-900",
};

export function VerdictChip({
  verdict,
  marginPct,
  className,
}: {
  verdict: Verdict | null | undefined;
  marginPct?: number | null;
  className?: string;
}) {
  if (!verdict) {
    return (
      <Badge variant="outline" className={cn("whitespace-nowrap text-muted-foreground", className)}>
        No vehicle data
      </Badge>
    );
  }
  const margin = typeof marginPct === "number" && Number.isFinite(marginPct) ? ` ${Math.round(marginPct)}%` : "";
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap font-medium", VERDICT_CHIP_CLASS[verdict], className)} data-testid={`verdict-chip-${verdict}`}>
      PAS 13 {verdictLabel(verdict)}
      {margin}
    </Badge>
  );
}

// =============================================
// TABLE
// =============================================

export interface RiskRegisterProps {
  areas: readonly RegisterArea[];
  bands?: readonly RiskLevelBand[];
  /** Completed surveys are read-only: no Reassess button. */
  readOnly?: boolean;
  onReassess?: (areaId: string) => void;
  /** Area currently being reassessed (spinner on its button). */
  reassessingId?: string | null;
  /** Row to open on first render / when the heatmap is clicked. */
  expandedId?: string | null;
  onExpandedChange?: (areaId: string | null) => void;
  className?: string;
}

function conditionLabel(c: string): string {
  switch (c) {
    case "good":
      return "Good";
    case "damaged":
      return "Damaged";
    case "critical":
      return "Critical";
    case "unprotected":
      return "Unprotected";
    default:
      return c;
  }
}

export function RiskRegister({
  areas,
  bands = RISK_LEVEL_BANDS,
  readOnly,
  onReassess,
  reassessingId,
  expandedId,
  onExpandedChange,
  className,
}: RiskRegisterProps) {
  const [localExpanded, setLocalExpanded] = useState<string | null>(null);
  const controlled = expandedId !== undefined;
  const openId = controlled ? expandedId : localExpanded;
  const setOpenId = (id: string | null) => {
    if (!controlled) setLocalExpanded(id);
    onExpandedChange?.(id);
  };

  const rows = sortByPriorityRank(areas);

  if (rows.length === 0) {
    return (
      <div className={cn("rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground", className)} data-testid="risk-register-empty">
        No areas in the register yet. Continue the walk and confirm the analysed photos to add zones.
      </div>
    );
  }

  return (
    <div className={cn("overflow-x-auto rounded-lg border", className)} data-testid="risk-register">
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="w-12 text-center">#</TableHead>
            <TableHead>Zone</TableHead>
            <TableHead>Area type</TableHead>
            <TableHead>Level</TableHead>
            <TableHead className="text-center">Score</TableHead>
            <TableHead>Recommended barrier</TableHead>
            <TableHead className="text-right">Budget</TableHead>
            <TableHead>PAS 13</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((area) => {
            const open = openId === area.id;
            const budget = budgetLineFor(area);
            const band = area.riskLevel ? bands.find((b) => b.level === area.riskLevel) : undefined;
            const verdict = area.pas13Verdict?.verdict ?? area.topProduct?.pas13Verdict ?? null;
            const marginPct = area.pas13Verdict?.details.safetyMarginPct ?? area.topProduct?.safetyMarginPct ?? null;
            const photoCount = area.photos.length + area.photosUrls.length;
            return (
              <Fragment key={area.id}>
                <TableRow
                  data-testid={`register-row-${area.id}`}
                  data-state={open ? "open" : "closed"}
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : area.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOpenId(open ? null : area.id);
                    }
                  }}
                  tabIndex={0}
                  className={cn("cursor-pointer align-top", open && "bg-muted/40")}
                  style={{ boxShadow: `inset 3px 0 0 ${area.riskLevel ? LEVEL_COLORS[area.riskLevel] : "transparent"}` }}
                >
                  <TableCell className="text-center font-semibold tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
                      {area.priorityRank ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium leading-tight">{area.zoneName}</div>
                    <div className="text-xs text-muted-foreground">{area.areaName}</div>
                    {photoCount > 0 && (
                      <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Camera className="h-3 w-3" aria-hidden />
                        {photoCount}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="leading-tight">{area.areaTypeLabel || area.areaType}</div>
                    <div className="text-xs text-muted-foreground">{conditionLabel(area.currentCondition)}</div>
                  </TableCell>
                  <TableCell>
                    <LevelChip level={area.riskLevel} bands={bands} />
                    {band && <div className="mt-1 text-[11px] text-muted-foreground">{band.actionTimescale}</div>}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {typeof area.riskScore === "number" ? (
                      <>
                        <div className="text-lg font-bold leading-none">{area.riskScore}</div>
                        {area.likelihood && area.severity && (
                          <div className="mt-1 text-[11px] text-muted-foreground" title={`${describeLikelihood(area.likelihood)} × ${describeSeverity(area.severity)}`}>
                            L{area.likelihood} × S{area.severity}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {area.topProduct ? (
                      <div className="flex items-center gap-2">
                        {area.topProduct.imageUrl && (
                          <img src={area.topProduct.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded border bg-white object-contain" loading="lazy" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-medium leading-tight" title={area.topProduct.productName}>
                            {area.topProduct.productName}
                          </div>
                          {area.topProduct.impactRating ? (
                            <div className="text-[11px] text-muted-foreground">{area.topProduct.impactRating.toLocaleString()} J rated</div>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{area.calculatedJoules ? "No aligned product" : "Add vehicle data"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {budget ? (
                      <>
                        <div className="font-semibold">{formatAed(budget.totalAed)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {budget.lengthM} m @ {formatAed(budget.ratePerM)}/m
                        </div>
                      </>
                    ) : area.topProduct ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Ruler className="h-3 w-3" aria-hidden />
                        Add run length
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <VerdictChip verdict={verdict} marginPct={marginPct} />
                  </TableCell>
                </TableRow>

                {open && (
                  <TableRow className="bg-muted/20 hover:bg-muted/20" data-testid={`register-row-detail-${area.id}`}>
                    <TableCell colSpan={8} className="p-4">
                      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        {/* Photos */}
                        <div>
                          <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                            <Camera className="h-4 w-4" aria-hidden />
                            Photos
                            <span className="font-normal text-muted-foreground">({photoCount})</span>
                          </h4>
                          {photoCount === 0 ? (
                            <p className="text-sm text-muted-foreground">No photos linked to this zone.</p>
                          ) : (
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                              {area.photos.map((p) => (
                                <a
                                  key={p.id}
                                  href={p.objectUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="relative aspect-square overflow-hidden rounded-md border bg-muted"
                                  title={p.takenAt ? new Date(p.takenAt).toLocaleString() : undefined}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <img src={p.objectUrl} alt={`${area.zoneName} photo`} className="h-full w-full object-cover" loading="lazy" />
                                  {p.analysisStatus !== "done" && (
                                    <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-center text-[10px] uppercase tracking-wide text-white">
                                      {p.analysisStatus}
                                    </span>
                                  )}
                                </a>
                              ))}
                              {area.photosUrls.map((url, idx) => (
                                <a
                                  key={`legacy-${idx}`}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="aspect-square overflow-hidden rounded-md border bg-muted"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <img src={url} alt={`${area.zoneName} reference ${idx + 1}`} className="h-full w-full object-cover" loading="lazy" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Observation + rationale */}
                        <div className="space-y-3">
                          <div>
                            <h4 className="mb-1 text-sm font-semibold">Observation</h4>
                            <p className="whitespace-pre-line text-sm text-foreground/90">
                              {area.aiObservation || area.issueDescription || "No observation recorded."}
                            </p>
                          </div>
                          {area.recommendedAction && (
                            <div>
                              <h4 className="mb-1 text-sm font-semibold">Recommended action</h4>
                              <p className="text-sm text-foreground/90">{area.recommendedAction}</p>
                            </div>
                          )}
                          <div>
                            <h4 className="mb-1 text-sm font-semibold">Why this score</h4>
                            {area.rationale.length > 0 ? (
                              <ul className="list-disc space-y-0.5 pl-5 text-sm text-foreground/90">
                                {area.rationale.map((line, i) => (
                                  <li key={i}>{line}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted-foreground">Not yet assessed. Reassess to score this zone from its stored fields.</p>
                            )}
                          </div>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                            <div>
                              <dt className="font-medium text-foreground/80">Traffic</dt>
                              <dd className="capitalize">{area.trafficDensity ?? "—"}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-foreground/80">Pedestrians</dt>
                              <dd className="capitalize">{area.pedestrianExposure ?? "—"}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-foreground/80">Existing protection</dt>
                              <dd className="capitalize">{area.existingProtection ?? "—"}</dd>
                            </div>
                            {area.vehicleWeight && area.vehicleSpeed ? (
                              <div className="col-span-2 sm:col-span-3">
                                <dt className="font-medium text-foreground/80">Design vehicle</dt>
                                <dd>
                                  {area.vehicleWeight.toLocaleString()} kg
                                  {area.loadMass ? ` + ${area.loadMass.toLocaleString()} kg load` : ""} at {area.vehicleSpeed} km/h, {area.impactAngle ?? 90}°
                                  {area.calculatedJoules ? ` → ${Math.round(area.calculatedJoules).toLocaleString()} J` : ""}
                                </dd>
                              </div>
                            ) : null}
                          </dl>
                          {!readOnly && onReassess && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="min-h-[40px]"
                              disabled={reassessingId === area.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onReassess(area.id);
                              }}
                              data-testid={`button-reassess-${area.id}`}
                            >
                              {reassessingId === area.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />}
                              Reassess
                            </Button>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default RiskRegister;
