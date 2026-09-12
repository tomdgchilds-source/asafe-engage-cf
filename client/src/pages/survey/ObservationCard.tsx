// ─────────────────────────────────────────────────────────
// ObservationCard — one photo's AI observation, editable by the rep before
// the zone is confirmed (Phase 3, Task S3).
//
// Three states:
//   pending   → photo + "Analysing…" placeholder (no fields yet)
//   editable  → pre-filled fields (from analysis) or empty defaults
//                (failed / skipped photos, with a "Retry analysis" button)
//   confirmed → compact read-only card once the photo is linked to an area
// ─────────────────────────────────────────────────────────
import { useMemo, type ReactNode } from "react";
import { AlertTriangle, Check, Loader2, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SurveyPhotoView } from "./useSurveyPhotos";
import {
  AREA_CONDITIONS,
  AREA_TYPE_OPTIONS,
  EXISTING_PROTECTIONS,
  FLOOR_TYPES,
  HAZARD_TAGS,
  PEDESTRIAN_EXPOSURES,
  RISK_LEVELS,
  RISK_LEVEL_CLASS,
  VEHICLE_TYPES,
  hazardLabel,
  humanise,
  isLowConfidence,
  vehicleLabel,
  type AreaCondition,
  type CardHazard,
  type ExistingProtection,
  type FloorType,
  type ObservationCardState,
  type PedestrianExposure,
  type RiskLevel,
} from "./reviewMapping";

// =============================================
// SMALL PIECES
// =============================================

const HAZARD_CHIP_CLASS: Record<RiskLevel, string> = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-800",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  high: "border-orange-200 bg-orange-50 text-orange-900",
  critical: "border-red-200 bg-red-50 text-red-900",
};

const HAZARD_DOT_CLASS: Record<RiskLevel, string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-orange-500",
  critical: "bg-red-600",
};

function HazardChip({ hazard, onRemove }: { hazard: CardHazard; onRemove?: () => void }) {
  return (
    <span
      title={hazard.evidence || undefined}
      className={cn(
        "inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border pl-2.5 text-sm font-medium",
        onRemove ? "pr-1" : "pr-2.5",
        HAZARD_CHIP_CLASS[hazard.severity],
      )}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", HAZARD_DOT_CLASS[hazard.severity])} aria-hidden />
      <span className="truncate">{hazardLabel(hazard.tag)}</span>
      <span className="text-[11px] uppercase tracking-wide opacity-70">{hazard.severity}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove hazard ${hazardLabel(hazard.tag)}`}
          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/5 active:bg-black/10"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </span>
  );
}

function VehicleChip({ type, selected, onToggle }: { type: string; selected: boolean; onToggle?: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!onToggle}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-full border px-3 text-sm transition-colors disabled:cursor-default",
        selected
          ? "border-[#1D1D1B] bg-[#1D1D1B] text-white"
          : "border-zinc-300 bg-white text-zinc-700 active:bg-zinc-100",
      )}
    >
      {selected && <Check className="h-3.5 w-3.5" aria-hidden />}
      {vehicleLabel(type)}
    </button>
  );
}

export function RiskLevelChip({ level, className }: { level: RiskLevel | null; className?: string }) {
  if (!level) {
    return (
      <span className={cn("inline-flex h-6 items-center rounded-full bg-zinc-100 px-2 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200", className)}>
        Not assessed
      </span>
    );
  }
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold uppercase tracking-wide ring-1", RISK_LEVEL_CLASS[level], className)}>
      {level}
    </span>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

function Field({ label, htmlFor, hint, children, className }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

const TRIGGER_CLASS = "h-11 bg-white text-base";

// =============================================
// CARD
// =============================================

export interface ObservationCardProps {
  photo: SurveyPhotoView;
  /** Card state; undefined while the photo is still pending analysis. */
  card?: ObservationCardState;
  /** 1-based position within the zone strip. */
  index: number;
  onChange?: (patch: Partial<ObservationCardState>) => void;
  onRetry?: () => void;
  retrying?: boolean;
  /** Set when the photo is already linked to an area — renders read-only. */
  confirmed?: boolean;
  className?: string;
}

export function ObservationCard({ photo, card, index, onChange, onRetry, retrying, confirmed, className }: ObservationCardProps) {
  const pending = photo.analysisStatus === "pending";
  const failed = photo.analysisStatus === "failed" || photo.analysisStatus === "skipped";
  const lowConfidence = card ? isLowConfidence(card) : false;
  const readOnly = !!confirmed || !onChange;

  const patch = (p: Partial<ObservationCardState>) => onChange?.({ ...p, touched: true });

  const addableHazards = useMemo(
    () => HAZARD_TAGS.filter((tag) => !card?.hazards.some((h) => h.tag === tag)),
    [card?.hazards],
  );

  const thumb = (
    <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-zinc-200 ring-1 ring-zinc-200 sm:h-28 sm:w-28">
      <img src={photo.objectUrl} alt={`Photo ${index}`} className="h-full w-full object-cover" loading="lazy" draggable={false} />
      <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[11px] font-semibold text-white">#{index}</span>
    </div>
  );

  // ── confirmed (read-only) ─────────────────────────────
  if (confirmed) {
    return (
      <div data-testid={`observation-card-${photo.id}`} className={cn("flex gap-3 rounded-xl border border-emerald-200 bg-white p-3 shadow-sm", className)}>
        {thumb}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-emerald-100 px-2 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
              <Check className="h-3 w-3" aria-hidden />
              Confirmed
            </span>
            {card && <span className="truncate text-sm font-medium text-zinc-800">{card.areaType}</span>}
          </div>
          <p className="mt-1.5 line-clamp-3 text-sm text-zinc-600">
            {card?.observationText || card?.sceneSummary || "Linked to an area in the risk register."}
          </p>
        </div>
      </div>
    );
  }

  // ── pending ───────────────────────────────────────────
  if (pending || !card) {
    return (
      <div data-testid={`observation-card-${photo.id}`} className={cn("flex gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm", className)}>
        {thumb}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-amber-700">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Analysing photo…
          </span>
          <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-100" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
        </div>
      </div>
    );
  }

  // ── editable ──────────────────────────────────────────
  const idBase = `obs-${photo.id}`;
  return (
    <div data-testid={`observation-card-${photo.id}`} className={cn("rounded-xl border border-zinc-200 bg-white shadow-sm", className)}>
      {/* Banner: low confidence or failed analysis */}
      {lowConfidence && (
        <div className="flex items-start gap-2 rounded-t-xl border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <span>
            <span className="font-semibold">Check this.</span> The AI was only {Math.round((card.confidence ?? 0) * 100)}% confident — confirm every field before you move on.
          </span>
        </div>
      )}
      {failed && (
        <div className="flex items-center gap-2 rounded-t-xl border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          <AlertTriangle className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
          <span className="flex-1">
            {photo.analysisStatus === "skipped" ? "Analysis skipped" : "Analysis failed"} — fill this in manually or retry.
          </span>
          {onRetry && (
            <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={retrying} className="h-9 gap-1.5 bg-white">
              {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
              Retry analysis
            </Button>
          )}
        </div>
      )}

      <div className="space-y-4 p-3">
        {/* Photo + scene summary */}
        <div className="flex gap-3">
          {thumb}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Scene</p>
            <p className="mt-1 text-sm leading-snug text-zinc-800">
              {card.sceneSummary || (failed ? "No AI summary for this photo." : "No summary.")}
            </p>
            {card.seededFrom === "analysis" && card.confidence !== null && !lowConfidence && (
              <p className="mt-1 text-xs text-zinc-500">AI confidence {Math.round(card.confidence * 100)}%</p>
            )}
          </div>
        </div>

        {/* Area type + condition */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Area type" htmlFor={`${idBase}-area`}>
            <Select value={card.areaType} onValueChange={(v) => patch({ areaType: v })} disabled={readOnly}>
              <SelectTrigger id={`${idBase}-area`} className={TRIGGER_CLASS}>
                <SelectValue placeholder="Select area type" />
              </SelectTrigger>
              <SelectContent>
                {AREA_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Current condition" htmlFor={`${idBase}-condition`}>
            <Select value={card.condition} onValueChange={(v) => patch({ condition: v as AreaCondition })} disabled={readOnly}>
              <SelectTrigger id={`${idBase}-condition`} className={TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AREA_CONDITIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {humanise(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Hazards */}
        <Field label="Hazards">
          <div className="flex flex-wrap gap-2">
            {card.hazards.length === 0 && <span className="text-sm text-zinc-500">No hazards recorded.</span>}
            {card.hazards.map((h) => (
              <HazardChip
                key={h.tag}
                hazard={h}
                onRemove={readOnly ? undefined : () => patch({ hazards: card.hazards.filter((x) => x.tag !== h.tag) })}
              />
            ))}
            {!readOnly && addableHazards.length > 0 && (
              <Select
                value=""
                onValueChange={(tag) => patch({ hazards: [...card.hazards, { tag, severity: "medium", evidence: "" }] })}
              >
                <SelectTrigger aria-label="Add hazard" className="h-9 w-auto gap-1 rounded-full border-dashed bg-white px-3 text-sm text-zinc-600">
                  <SelectValue placeholder="+ Add hazard" />
                </SelectTrigger>
                <SelectContent>
                  {addableHazards.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {hazardLabel(tag)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {!readOnly && card.hazards.length > 0 && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {card.hazards.map((h) => (
                <div key={h.tag} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-700">{hazardLabel(h.tag)}</span>
                  <Select
                    value={h.severity}
                    onValueChange={(v) =>
                      patch({ hazards: card.hazards.map((x) => (x.tag === h.tag ? { ...x, severity: v as RiskLevel } : x)) })
                    }
                  >
                    <SelectTrigger aria-label={`Severity of ${hazardLabel(h.tag)}`} className="h-9 w-28 bg-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RISK_LEVELS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {humanise(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </Field>

        {/* Risk */}
        <Field
          label="Risk level"
          htmlFor={`${idBase}-risk`}
          hint={
            card.riskSource === "ai"
              ? card.seededFrom === "analysis"
                ? "AI suggestion. The risk register sets the final level unless you change this."
                : "Default. The risk register sets the final level unless you change this."
              : "Your override — this replaces the register's level for this area."
          }
        >
          <div className="flex items-center gap-2">
            <Select value={card.riskLevel} onValueChange={(v) => patch({ riskLevel: v as RiskLevel, riskSource: "rep" })} disabled={readOnly}>
              <SelectTrigger id={`${idBase}-risk`} className={cn(TRIGGER_CLASS, "flex-1")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RISK_LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {humanise(l)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <RiskLevelChip level={card.riskLevel} />
          </div>
        </Field>

        {/* Vehicles */}
        <Field label="Vehicles seen or expected">
          <div className="flex flex-wrap gap-2">
            {VEHICLE_TYPES.map((v) => (
              <VehicleChip
                key={v}
                type={v}
                selected={card.vehicles.includes(v)}
                onToggle={
                  readOnly
                    ? undefined
                    : () =>
                        patch({
                          vehicles: card.vehicles.includes(v) ? card.vehicles.filter((x) => x !== v) : [...card.vehicles, v],
                        })
                }
              />
            ))}
          </div>
        </Field>

        {/* Pedestrians / protection / floor */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Pedestrian exposure" htmlFor={`${idBase}-ped`}>
            <Select value={card.pedestrianExposure} onValueChange={(v) => patch({ pedestrianExposure: v as PedestrianExposure })} disabled={readOnly}>
              <SelectTrigger id={`${idBase}-ped`} className={TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PEDESTRIAN_EXPOSURES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {humanise(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Existing protection" htmlFor={`${idBase}-prot`}>
            <Select value={card.existingProtection} onValueChange={(v) => patch({ existingProtection: v as ExistingProtection })} disabled={readOnly}>
              <SelectTrigger id={`${idBase}-prot`} className={TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXISTING_PROTECTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {humanise(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Floor type" htmlFor={`${idBase}-floor`}>
            <Select value={card.floorType} onValueChange={(v) => patch({ floorType: v as FloorType })} disabled={readOnly}>
              <SelectTrigger id={`${idBase}-floor`} className={TRIGGER_CLASS}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FLOOR_TYPES.map((f) => (
                  <SelectItem key={f} value={f}>
                    {humanise(f)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Observation text */}
        <Field label="Observation (goes in the report)" htmlFor={`${idBase}-obs`}>
          <Textarea
            id={`${idBase}-obs`}
            value={card.observationText}
            onChange={(e) => patch({ observationText: e.target.value })}
            readOnly={readOnly}
            rows={4}
            maxLength={4000}
            placeholder="Two or three report-ready sentences describing the hazard and what protection is required."
            className="bg-white text-base leading-snug"
          />
        </Field>
      </div>
    </div>
  );
}

export default ObservationCard;
