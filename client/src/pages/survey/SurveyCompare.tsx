// ─────────────────────────────────────────────────────────
// SurveyCompare — "Since last visit" view for a return-visit survey
// (Phase 3, Task S7).
//
// Route: /site-survey/:id/compare   (registered in App.tsx by the orchestrator)
//
// Reads GET /api/site-surveys/:id/compare and renders a header with both
// visit dates, a summary strip, then one card per zone with before/after
// hero photo, level chip, score, delta badge and the consultant notes.
// Two columns on desktop; stacks on mobile.
// ─────────────────────────────────────────────────────────
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { ArrowLeft, ImageOff, Loader2 } from "lucide-react";
import type { ComparableArea, ZoneComparison } from "@shared/survey";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DELTA_META,
  formatScoreChange,
  formatVisitDate,
  levelClass,
  netChangeTone,
  photoSrc,
  type CompareResponse,
} from "./compareView";

const BACK_PATH = "/site-survey";

async function fetchComparison(surveyId: string): Promise<CompareResponse | null> {
  const res = await fetch(`/api/site-surveys/${encodeURIComponent(surveyId)}/compare`, {
    credentials: "include",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return (await res.json()) as CompareResponse;
}

// =============================================
// Sub-components
// =============================================

function LevelChip({ level }: { level: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize",
        levelClass(level),
      )}
    >
      {level}
    </span>
  );
}

function DeltaBadge({ row }: { row: ZoneComparison }) {
  const meta = DELTA_META[row.delta];
  return (
    <span
      data-testid={`delta-${row.delta}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
        meta.className,
      )}
    >
      {meta.label}
      <span className="font-mono tabular-nums opacity-80">{formatScoreChange(row.scoreChange)}</span>
    </span>
  );
}

function HeroPhoto({ area, alt }: { area: ComparableArea | undefined; alt: string }) {
  const key = area?.photoKeys?.[0];
  const src = key ? photoSrc(key) : "";
  return (
    <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-zinc-100">
      {src ? (
        <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-zinc-400">
          <ImageOff className="h-6 w-6" aria-hidden />
          <span className="text-xs">{area ? "No photo" : "Not surveyed"}</span>
        </div>
      )}
    </div>
  );
}

function VisitColumn({
  label,
  area,
  zone,
}: {
  label: "Before" | "After";
  area: ComparableArea | undefined;
  zone: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <HeroPhoto area={area} alt={`${zone} – ${label.toLowerCase()}`} />
      {area ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <LevelChip level={area.riskLevel} />
            <span className="text-sm text-zinc-700">
              Score <span className="font-semibold tabular-nums">{area.score}</span>
              <span className="text-zinc-400"> / 25</span>
            </span>
            <span className="text-xs text-zinc-500">Rank #{area.priorityRank}</span>
          </div>
          <p className="text-sm text-zinc-800">
            {area.areaName}
            <span className="text-zinc-400"> · </span>
            <span className="capitalize text-zinc-600">{area.condition}</span>
          </p>
          {area.recommendedProduct && (
            <p className="text-xs text-zinc-600">Recommended: {area.recommendedProduct}</p>
          )}
          {area.observation && (
            <p className="line-clamp-3 text-xs text-zinc-500" title={area.observation}>
              {area.observation}
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-zinc-400">{label === "Before" ? "Not present on the previous visit." : "Not surveyed on this visit."}</p>
      )}
    </div>
  );
}

function ZoneCard({ row }: { row: ZoneComparison }) {
  return (
    <article
      data-testid={`compare-zone-${row.zone}`}
      className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[#1D1D1B]">{row.zone}</h2>
        <DeltaBadge row={row} />
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <VisitColumn label="Before" area={row.before} zone={row.zone} />
        <VisitColumn label="After" area={row.after} zone={row.zone} />
      </div>
      {row.notes.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-zinc-100 pt-3 text-sm text-zinc-700">
          {row.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

function SummaryStrip({ summary }: { summary: CompareResponse["summary"] }) {
  const tone = netChangeTone(summary.netScoreChange);
  const cells: Array<{ label: string; value: number; className: string }> = [
    { label: "Improved", value: summary.improved, className: "text-green-700" },
    { label: "Same", value: summary.same, className: "text-zinc-700" },
    { label: "Worse", value: summary.worse, className: "text-red-700" },
    { label: "New", value: summary.new, className: "text-blue-700" },
    { label: "Removed", value: summary.removed, className: "text-amber-700" },
  ];
  return (
    <section
      aria-label="Comparison summary"
      className="grid grid-cols-3 gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm sm:grid-cols-6"
    >
      {cells.map((cell) => (
        <div key={cell.label} className="text-center">
          <p className={cn("text-2xl font-bold tabular-nums", cell.className)}>{cell.value}</p>
          <p className="text-xs text-zinc-500">{cell.label}</p>
        </div>
      ))}
      <div className="col-span-3 text-center sm:col-span-1">
        <p
          className={cn(
            "text-2xl font-bold tabular-nums",
            tone === "good" && "text-green-700",
            tone === "bad" && "text-red-700",
            tone === "flat" && "text-zinc-700",
          )}
        >
          {formatScoreChange(summary.netScoreChange)}
        </p>
        <p className="text-xs text-zinc-500">Net score change</p>
      </div>
    </section>
  );
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1 text-zinc-700">
      <Link href={BACK_PATH}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to survey
      </Link>
    </Button>
  );
}

// =============================================
// Page
// =============================================

export default function SurveyCompare() {
  const { id: surveyId = "" } = useParams<{ id: string }>();

  const { data, isLoading, isError, error } = useQuery<CompareResponse | null>({
    queryKey: ["/api/site-surveys", surveyId, "compare"],
    queryFn: () => fetchComparison(surveyId),
    enabled: Boolean(surveyId),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-4 sm:px-6">
      <BackLink />

      {isLoading && (
        <div className="flex items-center gap-2 py-12 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Loading comparison…
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load the comparison. {(error as Error)?.message}
        </div>
      )}

      {!isLoading && !isError && data === null && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-[#1D1D1B]">No previous visit to compare</h1>
          <p className="mt-1 text-sm text-zinc-600">
            This survey is not linked to a completed earlier survey. Start a new survey as a
            &ldquo;Return visit to…&rdquo; to see what changed.
          </p>
        </div>
      )}

      {data && (
        <>
          <header className="mb-4 mt-2">
            <h1 className="text-2xl font-bold text-[#1D1D1B]">Since last visit</h1>
            <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg bg-zinc-50 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Previous visit</p>
                <p className="font-medium text-zinc-800">{data.previous.title}</p>
                <p className="text-zinc-600">{formatVisitDate(data.previous.completedAt)}</p>
              </div>
              <div className="rounded-lg bg-[#FFC72C]/15 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-zinc-500">This visit</p>
                <p className="font-medium text-zinc-800">{data.current.title}</p>
                <p className="text-zinc-600">{formatVisitDate(data.current.completedAt)}</p>
              </div>
            </div>
          </header>

          <SummaryStrip summary={data.summary} />

          <div className="mt-4 space-y-4">
            {data.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">No zones recorded on either visit yet.</p>
            ) : (
              data.rows.map((row) => <ZoneCard key={`${row.delta}:${row.zone}`} row={row} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}
