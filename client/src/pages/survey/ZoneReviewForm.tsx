// ─────────────────────────────────────────────────────────
// ZoneReviewForm — the per-zone fields under a zone's observation cards
// (Phase 3, Task S3): traffic density, vehicle + load mass, speed,
// recommended run length, the merge toggle and the "Confirm zone" button.
// After confirmation it renders the returned RegisterArea summaries inline.
// ─────────────────────────────────────────────────────────
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RiskLevelChip } from "./ObservationCard";
import {
  TRAFFIC_DENSITIES,
  VERDICT_CLASS,
  VERDICT_LABEL,
  humanise,
  validateZoneForm,
  type RegisterAreaSummary,
  type TrafficDensity,
  type ZoneDefaults,
  type ZoneFormState,
  type ZoneValidationError,
} from "./reviewMapping";

const VALIDATION_MESSAGE: Record<ZoneValidationError, string> = {
  no_observations: "Nothing to confirm in this zone.",
  vehicle_mass: "Vehicle mass must be between 1 and 200,000 kg.",
  load_mass: "Load mass must be between 0 and 200,000 kg.",
  speed: "Speed must be between 1 and 120 km/h.",
  length: "Run length must be between 0 and 10,000 m.",
};

function parseNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, "").trim());
  return raw.trim() === "" || !Number.isFinite(n) ? null : n;
}

// =============================================
// RESULT SUMMARY
// =============================================

export function RegisterAreaSummaryCard({ area }: { area: RegisterAreaSummary }) {
  const verdict = area.pas13Verdict?.verdict ?? null;
  return (
    <div data-testid={`register-area-${area.id}`} className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {area.priorityRank !== null && (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#1D1D1B] px-1.5 text-xs font-bold text-white" title="Priority within this survey">
            #{area.priorityRank}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-900">{area.areaName}</span>
        <RiskLevelChip level={area.riskLevel} />
        {area.riskScore !== null && (
          <span className="text-xs font-medium text-zinc-600" title="Likelihood × severity">
            Score {area.riskScore}
            {area.likelihood !== null && area.severity !== null ? ` (${area.likelihood}×${area.severity})` : ""}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {area.topProduct ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-zinc-800">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
            <span className="truncate font-medium">{area.topProduct.productName}</span>
            <span className="shrink-0 text-xs text-zinc-500">{Math.round(area.topProduct.safetyMarginPct)}% margin</span>
          </span>
        ) : (
          <span className="text-zinc-600">No product recommendation yet.</span>
        )}
        {verdict && (
          <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ring-1", VERDICT_CLASS[verdict])} title={area.pas13Verdict?.summary}>
            {VERDICT_LABEL[verdict]}
          </span>
        )}
        {area.recommendedLengthM !== null && <span className="text-xs text-zinc-500">{area.recommendedLengthM} m run</span>}
      </div>
      {area.rationale.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-zinc-600">
          {area.rationale.slice(0, 4).map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// =============================================
// FORM
// =============================================

export interface ZoneReviewFormProps {
  zoneName: string;
  form: ZoneFormState;
  /** Where the mass/speed defaults came from, for the hint line. */
  defaults: ZoneDefaults;
  /** Cards that will be sent when the zone is confirmed. */
  observationCount: number;
  /** Photos in this zone still waiting for analysis (confirm is blocked). */
  pendingCount: number;
  onChange: (patch: Partial<ZoneFormState>) => void;
  onConfirm: () => void;
  confirming?: boolean;
  error?: string | null;
  /** Areas returned by the server once the zone is confirmed. */
  result?: RegisterAreaSummary[];
  className?: string;
}

export function ZoneReviewForm({
  zoneName,
  form,
  defaults,
  observationCount,
  pendingCount,
  onChange,
  onConfirm,
  confirming,
  error,
  result,
  className,
}: ZoneReviewFormProps) {
  const idBase = `zone-${zoneName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  const patch = (p: Partial<ZoneFormState>) => onChange({ ...p, touched: true });
  const validation = validateZoneForm(form, observationCount);
  const blocked = confirming || pendingCount > 0 || validation !== null;

  if (result && result.length > 0) {
    return (
      <div data-testid={`zone-result-${zoneName}`} className={cn("space-y-2 rounded-xl border border-emerald-200 bg-white p-3 shadow-sm", className)}>
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
          <Check className="h-4 w-4" aria-hidden />
          Zone confirmed — {result.length === 1 ? "1 area" : `${result.length} areas`} added to the risk register
        </div>
        {result.map((a) => (
          <RegisterAreaSummaryCard key={a.id} area={a} />
        ))}
      </div>
    );
  }

  return (
    <div data-testid={`zone-form-${zoneName}`} className={cn("rounded-xl border border-zinc-200 bg-white p-3 shadow-sm", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Zone details</p>
      <p className="mt-0.5 text-xs text-zinc-500">
        Mass and speed pre-filled for a {humanise(defaults.vehicleType).toLowerCase()}
        {defaults.classCode ? ` (PAS 13 class ${defaults.classCode})` : ""}. Adjust to what runs through this zone.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idBase}-traffic`} className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Traffic density
          </Label>
          <Select value={form.trafficDensity} onValueChange={(v) => patch({ trafficDensity: v as TrafficDensity })}>
            <SelectTrigger id={`${idBase}-traffic`} className="h-11 bg-white text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRAFFIC_DENSITIES.map((d) => (
                <SelectItem key={d} value={d}>
                  {humanise(d)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idBase}-speed`} className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Speed (km/h)
          </Label>
          <Input
            id={`${idBase}-speed`}
            type="number"
            inputMode="decimal"
            min={1}
            max={120}
            step={0.5}
            value={form.speedKmh}
            onChange={(e) => patch({ speedKmh: parseNumber(e.target.value) ?? 0 })}
            className="h-11 bg-white text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idBase}-mass`} className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Vehicle mass (kg)
          </Label>
          <Input
            id={`${idBase}-mass`}
            type="number"
            inputMode="numeric"
            min={1}
            max={200000}
            step={50}
            value={form.vehicleMassKg}
            onChange={(e) => patch({ vehicleMassKg: parseNumber(e.target.value) ?? 0 })}
            className="h-11 bg-white text-base"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idBase}-load`} className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Load mass (kg)
          </Label>
          <Input
            id={`${idBase}-load`}
            type="number"
            inputMode="numeric"
            min={0}
            max={200000}
            step={50}
            value={form.loadMassKg}
            onChange={(e) => patch({ loadMassKg: parseNumber(e.target.value) ?? 0 })}
            className="h-11 bg-white text-base"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${idBase}-length`} className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Recommended run length (m)
          </Label>
          <Input
            id={`${idBase}-length`}
            type="number"
            inputMode="decimal"
            min={0}
            max={10000}
            step={0.5}
            placeholder="e.g. 24"
            value={form.recommendedLengthM ?? ""}
            onChange={(e) => patch({ recommendedLengthM: parseNumber(e.target.value) })}
            className="h-11 bg-white text-base"
          />
          <p className="text-xs text-zinc-500">Used for the budget line in the proposal. Leave blank if you will measure later.</p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2.5">
        <div className="min-w-0">
          <Label htmlFor={`${idBase}-merge`} className="text-sm font-medium text-zinc-900">
            Merge photos into one area
          </Label>
          <p className="text-xs text-zinc-500">
            {form.mergeIntoOneArea
              ? `One register entry for ${zoneName}, using the worst case across its photos.`
              : `One register entry per photo (${observationCount}).`}
          </p>
        </div>
        <Switch id={`${idBase}-merge`} checked={form.mergeIntoOneArea} onCheckedChange={(v) => patch({ mergeIntoOneArea: v })} />
      </div>

      {(error || (validation && form.touched)) && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error ?? VALIDATION_MESSAGE[validation as ZoneValidationError]}
        </p>
      )}

      <Button
        type="button"
        onClick={onConfirm}
        disabled={blocked}
        data-testid={`confirm-zone-${zoneName}`}
        className="mt-3 h-12 w-full gap-2 bg-[#FFC72C] text-base font-semibold text-[#1D1D1B] hover:bg-[#e6b327] disabled:opacity-60"
      >
        {confirming ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Check className="h-5 w-5" aria-hidden />}
        {confirming
          ? "Confirming…"
          : pendingCount > 0
            ? `Waiting for ${pendingCount} photo${pendingCount === 1 ? "" : "s"} to analyse`
            : `Confirm zone (${observationCount} photo${observationCount === 1 ? "" : "s"})`}
      </Button>
    </div>
  );
}

export default ZoneReviewForm;
