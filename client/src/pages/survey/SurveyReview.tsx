// ─────────────────────────────────────────────────────────
// SurveyReview — review and confirm AI observations after a walk
// (Phase 3, Task S3).
//
// Route: /site-survey/:id/review   (registered in App.tsx by the orchestrator)
//
// Photos are grouped by zone. Each zone shows a thumbnail strip, one
// ObservationCard per photo and a ZoneReviewForm. "Confirm zone" POSTs
// /api/site-surveys/:id/areas/from-observations and shows the returned
// register areas inline. When every zone is confirmed, "Open survey" goes
// to /site-survey?open=<id>.
// ─────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, ChevronLeft, ClipboardCheck, Loader2 } from "lucide-react";
import type { SiteSurvey } from "@shared/schema";
import { PAS13_VEHICLE_CLASS_TABLE, type VehicleClassRow } from "@shared/pas13Rules";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { apiRequest } from "@/lib/queryClient";
import { ObservationCard } from "./ObservationCard";
import { ZoneReviewForm } from "./ZoneReviewForm";
import { surveyPhotosKey, useReanalysePhoto, useSurveyPhotos, type SurveyPhotoView } from "./useSurveyPhotos";
import {
  buildZoneRequest,
  cardForPhoto,
  groupPhotosByZone,
  isPhotoPending,
  shouldReseed,
  zoneDefaultsFromVehicles,
  zoneFormFromDefaults,
  type FromObservationsResponse,
  type ObservationCardState,
  type RegisterAreaSummary,
  type ZoneFormState,
  type ZoneGroup,
} from "./reviewMapping";

// =============================================
// PAS 13 CLASS TABLE (admin-editable; seed fallback for non-admins)
// =============================================

interface AdminClassRow {
  classCode: string;
  massMaxKg: number | null;
  speedMaxKmh: number | null;
  description: string;
}

function usePas13ClassTable(): readonly VehicleClassRow[] {
  const q = useQuery<readonly VehicleClassRow[]>({
    queryKey: ["pas13-vehicle-classes", "review"],
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () => {
      // Any failure (403/500/network) simply keeps the seed table.
      const res = await fetch("/api/pas13/vehicle-classes", { credentials: "include" });
      if (!res.ok) return PAS13_VEHICLE_CLASS_TABLE;
      const json = (await res.json()) as { rows?: AdminClassRow[] };
      const rows = (json.rows ?? []).map<VehicleClassRow>((r) => ({
        classCode: r.classCode,
        label: r.description || r.classCode,
        totalMassMaxKg: r.massMaxKg === null ? Number.POSITIVE_INFINITY : Number(r.massMaxKg),
        speedMaxKmh: r.speedMaxKmh === null ? Number.POSITIVE_INFINITY : Number(r.speedMaxKmh),
      }));
      return rows.length > 0 ? rows : PAS13_VEHICLE_CLASS_TABLE;
    },
  });
  return q.data ?? PAS13_VEHICLE_CLASS_TABLE;
}

// =============================================
// ZONE SECTION
// =============================================

interface ZoneSectionProps {
  surveyId: string;
  zone: ZoneGroup;
  index: number;
  cards: Record<string, ObservationCardState>;
  onCardChange: (photoId: string, patch: Partial<ObservationCardState>) => void;
  form: ZoneFormState;
  onFormChange: (patch: Partial<ZoneFormState>) => void;
  classTable: readonly VehicleClassRow[];
  result?: RegisterAreaSummary[];
  onConfirmed: (zoneName: string, areas: RegisterAreaSummary[]) => void;
}

function ZoneSection({ surveyId, zone, index, cards, onCardChange, form, onFormChange, classTable, result, onConfirmed }: ZoneSectionProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const reanalyse = useReanalysePhoto(surveyId);

  const openCards = useMemo(
    () => zone.openPhotos.map((p) => cards[p.id]).filter((c): c is ObservationCardState => !!c),
    [zone.openPhotos, cards],
  );
  const pendingCount = zone.openPhotos.filter(isPhotoPending).length;
  const confirmableCards = useMemo(
    () => openCards.filter((c) => !isPhotoPending(zone.openPhotos.find((p) => p.id === c.photoId) as SurveyPhotoView)),
    [openCards, zone.openPhotos],
  );

  const defaults = useMemo(
    () => zoneDefaultsFromVehicles(openCards.flatMap((c) => c.vehicles), classTable),
    [openCards, classTable],
  );

  const confirm = useMutation({
    mutationFn: async () => {
      const body = buildZoneRequest(zone.zoneName, form, confirmableCards);
      const res = await apiRequest(`/api/site-surveys/${encodeURIComponent(surveyId)}/areas/from-observations`, "POST", body);
      return (await res.json()) as FromObservationsResponse;
    },
    onSuccess: (data) => {
      const linked = new Map<string, string>();
      for (const area of data.areas) for (const p of area.photos) linked.set(p.id, area.id);
      // Mark the photos as linked immediately; the refetch below confirms it.
      qc.setQueryData<SurveyPhotoView[]>(surveyPhotosKey(surveyId), (prev) =>
        (prev ?? []).map((p) => (linked.has(p.id) ? { ...p, areaId: linked.get(p.id) ?? p.areaId, zoneName: data.zoneName } : p)),
      );
      void qc.invalidateQueries({ queryKey: surveyPhotosKey(surveyId) });
      void qc.invalidateQueries({ queryKey: ["/api/site-surveys", surveyId] });
      void qc.invalidateQueries({ queryKey: ["/api/site-surveys"] });
      haptic.save();
      onConfirmed(data.zoneName, data.areas);
    },
    onError: (err: unknown) => {
      haptic.error();
      toast({ title: "Could not confirm zone", description: err instanceof Error ? err.message : "Please try again.", variant: "destructive" });
    },
  });

  const allConfirmed = zone.confirmed || (result?.length ?? 0) > 0;

  return (
    <section data-testid={`zone-section-${zone.zoneName}`} className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            allConfirmed ? "bg-emerald-600 text-white" : "bg-[#FFC72C] text-[#1D1D1B]",
          )}
        >
          {allConfirmed ? <Check className="h-4 w-4" aria-hidden /> : index + 1}
        </span>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-zinc-900">{zone.zoneName}</h2>
        <span className="text-xs text-zinc-500">
          {zone.photos.length} photo{zone.photos.length === 1 ? "" : "s"}
          {zone.confirmedPhotos.length > 0 && !zone.confirmed ? ` · ${zone.confirmedPhotos.length} confirmed` : ""}
        </span>
      </div>

      {/* Thumbnail strip */}
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]">
        {zone.photos.map((p, i) => (
          <a
            key={p.id}
            href={`#photo-${p.id}`}
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-200 ring-1 ring-zinc-200"
            aria-label={`Photo ${i + 1} in ${zone.zoneName}`}
          >
            <img src={p.objectUrl} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
            <span
              aria-hidden
              className={cn(
                "absolute right-1 top-1 h-3 w-3 rounded-full ring-2 ring-white",
                p.areaId
                  ? "bg-emerald-500"
                  : p.analysisStatus === "pending"
                    ? "animate-pulse bg-amber-400"
                    : p.analysisStatus === "done"
                      ? "bg-emerald-400"
                      : "bg-red-500",
              )}
            />
          </a>
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {zone.photos.map((p, i) => (
          <div key={p.id} id={`photo-${p.id}`} className="scroll-mt-24">
            <ObservationCard
              photo={p}
              card={cards[p.id]}
              index={i + 1}
              confirmed={!!p.areaId}
              onChange={p.areaId ? undefined : (patch) => onCardChange(p.id, patch)}
              onRetry={p.areaId ? undefined : () => reanalyse.mutate(p.id)}
              retrying={reanalyse.isPending && reanalyse.variables === p.id}
            />
          </div>
        ))}
      </div>

      {(!zone.confirmed || result) && (
        <ZoneReviewForm
          zoneName={zone.zoneName}
          form={form}
          defaults={defaults}
          observationCount={confirmableCards.length}
          pendingCount={pendingCount}
          onChange={onFormChange}
          onConfirm={() => confirm.mutate()}
          confirming={confirm.isPending}
          error={confirm.isError ? "The server rejected this zone. Check the values and try again." : null}
          result={result}
        />
      )}
    </section>
  );
}

// =============================================
// PAGE
// =============================================

export default function SurveyReview() {
  const params = useParams<{ id: string }>();
  const surveyId = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const haptic = useHapticFeedback();

  const { data: survey } = useQuery<SiteSurvey>({
    queryKey: ["/api/site-surveys", surveyId],
    enabled: !!surveyId,
  });
  const photosQuery = useSurveyPhotos(surveyId);
  const photos = useMemo(() => photosQuery.data ?? [], [photosQuery.data]);
  const classTable = usePas13ClassTable();

  const zones = useMemo(() => groupPhotosByZone(photos), [photos]);

  // ---- card state, seeded from analyses as they arrive (never over rep edits)
  const [cards, setCards] = useState<Record<string, ObservationCardState>>({});
  useEffect(() => {
    setCards((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const p of photos) {
        if (shouldReseed(prev[p.id], p)) {
          next[p.id] = cardForPhoto(p);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [photos]);

  const onCardChange = useCallback((photoId: string, patch: Partial<ObservationCardState>) => {
    setCards((prev) => (prev[photoId] ? { ...prev, [photoId]: { ...prev[photoId], ...patch } } : prev));
  }, []);

  // ---- zone forms: defaults follow the observed vehicles until the rep touches the form
  const [forms, setForms] = useState<Record<string, ZoneFormState>>({});
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  useEffect(() => {
    setForms((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const z of zones) {
        const existing = prev[z.zoneName];
        if (existing?.touched) continue;
        const vehicles = z.openPhotos.flatMap((p) => cardsRef.current[p.id]?.vehicles ?? []);
        const fresh = zoneFormFromDefaults(zoneDefaultsFromVehicles(vehicles, classTable));
        if (
          !existing ||
          existing.vehicleMassKg !== fresh.vehicleMassKg ||
          existing.loadMassKg !== fresh.loadMassKg ||
          existing.speedKmh !== fresh.speedKmh
        ) {
          next[z.zoneName] = fresh;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [zones, cards, classTable]);

  const onFormChange = useCallback((zoneName: string, patch: Partial<ZoneFormState>) => {
    setForms((prev) => ({ ...prev, [zoneName]: { ...(prev[zoneName] ?? zoneFormFromDefaults(zoneDefaultsFromVehicles([]))), ...patch } }));
  }, []);

  // ---- results per zone (returned register areas)
  const [results, setResults] = useState<Record<string, RegisterAreaSummary[]>>({});
  const onConfirmed = useCallback(
    (zoneName: string, areas: RegisterAreaSummary[]) => {
      setResults((prev) => ({ ...prev, [zoneName]: areas }));
      toast({
        title: `${zoneName} confirmed`,
        description: areas.length === 1 ? `${areas[0].areaName} added to the risk register.` : `${areas.length} areas added to the risk register.`,
      });
    },
    [toast],
  );

  // ---- totals
  const totalPhotos = photos.length;
  const confirmedZones = zones.filter((z) => z.confirmed || (results[z.zoneName]?.length ?? 0) > 0).length;
  const allConfirmed = zones.length > 0 && confirmedZones === zones.length;
  const pendingTotal = photos.filter(isPhotoPending).length;

  const openSurvey = () => {
    haptic.select();
    toast({ title: "All zones confirmed", description: "Opening the survey's risk register." });
    navigate(`/site-survey?open=${encodeURIComponent(surveyId ?? "")}`);
  };

  if (!surveyId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-center text-zinc-700">
        <p>No survey selected.</p>
      </div>
    );
  }

  return (
    <div data-testid="survey-review" className="min-h-screen bg-zinc-100 pb-[max(96px,env(safe-area-inset-bottom))]">
      {/* Dark header, same aesthetic as the walk screen */}
      <header className="sticky top-0 z-20 bg-[#1D1D1B] text-white shadow-md">
        <div className="flex items-center gap-2 pl-[max(8px,env(safe-area-inset-left))] pr-3 pt-[max(8px,env(safe-area-inset-top))] pb-2">
          <button
            type="button"
            onClick={() => navigate(`/site-survey/${surveyId}/walk`)}
            aria-label="Back to walk"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white active:bg-white/10"
          >
            <ChevronLeft className="h-7 w-7" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight">{survey?.title ?? "Review observations"}</p>
            <p className="truncate text-xs text-zinc-300">
              {survey?.facilityName ? `${survey.facilityName} · ` : ""}
              {totalPhotos} photo{totalPhotos === 1 ? "" : "s"} · {zones.length} zone{zones.length === 1 ? "" : "s"}
              {zones.length > 0 ? ` · ${confirmedZones} confirmed` : ""}
            </p>
          </div>
          {pendingTotal > 0 && (
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-black/60 px-2.5 text-xs font-medium text-amber-300 ring-1 ring-amber-400/30">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden />
              {pendingTotal} analysing
            </span>
          )}
        </div>
        {zones.length > 0 && (
          <div className="h-1 w-full bg-white/10">
            <div
              className="h-full bg-[#FFC72C] transition-[width]"
              style={{ width: `${Math.round((confirmedZones / zones.length) * 100)}%` }}
              aria-hidden
            />
          </div>
        )}
      </header>

      <main className="mx-auto max-w-2xl space-y-8 px-3 pt-4">
        {photosQuery.isLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading photos…
          </div>
        )}

        {!photosQuery.isLoading && photos.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center">
            <Camera className="mx-auto h-8 w-8 text-zinc-400" aria-hidden />
            <p className="mt-2 text-sm font-medium text-zinc-800">No photos yet</p>
            <p className="mt-1 text-sm text-zinc-500">Walk the site and take photos first; they will appear here for review.</p>
            <Button type="button" onClick={() => navigate(`/site-survey/${surveyId}/walk`)} className="mt-4 h-11 bg-[#1D1D1B] text-white hover:bg-black">
              Start walk
            </Button>
          </div>
        )}

        {zones.map((zone, i) => (
          <ZoneSection
            key={zone.zoneName}
            surveyId={surveyId}
            zone={zone}
            index={i}
            cards={cards}
            onCardChange={onCardChange}
            form={forms[zone.zoneName] ?? zoneFormFromDefaults(zoneDefaultsFromVehicles([], classTable))}
            onFormChange={(patch) => onFormChange(zone.zoneName, patch)}
            classTable={classTable}
            result={results[zone.zoneName]}
            onConfirmed={onConfirmed}
          />
        ))}
      </main>

      {/* Sticky footer: finish */}
      {zones.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="min-w-0 flex-1 text-sm text-zinc-600">
              {allConfirmed ? "All zones confirmed." : `${confirmedZones} of ${zones.length} zone${zones.length === 1 ? "" : "s"} confirmed`}
            </div>
            <Button
              type="button"
              onClick={openSurvey}
              disabled={!allConfirmed}
              data-testid="open-survey"
              className="h-12 gap-2 bg-[#1D1D1B] px-5 text-base font-semibold text-white hover:bg-black disabled:opacity-50"
            >
              <ClipboardCheck className="h-5 w-5" aria-hidden />
              Open survey
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
