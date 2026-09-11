// ─────────────────────────────────────────────────────────
// SurveyWalk — the flagship on-site capture screen (Phase 3, Task S2).
//
// Route: /site-survey/:id/walk   (registered in App.tsx by the orchestrator)
//
// Full-screen, dark, portrait-first. A rep walks the site with a phone:
// tap the 72 px shutter, photos are downscaled on-device and queued in
// IndexedDB, uploaded when online, analysed server-side, and the
// thumbnail strip shows each photo's status. "Finish walk" goes to the
// review screen (Task S3) at /site-survey/:id/review.
// ─────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, CloudUpload, Images, Loader2, Mic, RefreshCw, WifiOff, X } from "lucide-react";
import type { SiteSurvey } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { WalkCamera, fileToFrame, type CameraState, type CapturedFrame, type WalkCameraHandle } from "./WalkCamera";
import { ZoneChip } from "./ZoneChip";
import { useUploadQueue } from "./useUploadQueue";
import { usePatchSurveyPhoto, useReanalysePhoto, useSurveyPhotos, type SurveyPhotoView } from "./useSurveyPhotos";
import { defaultZoneName, uniqueZones } from "./UploadQueue";

// =============================================
// CONSTANTS
// =============================================

/** A voice note recorded within this window after a shot attaches to that shot; otherwise it waits for the next one. */
const VOICE_ATTACH_WINDOW_MS = 60_000;
const STRIP_LENGTH = 6;
const GPS_TIMEOUT_MS = 3_000;
const GPS_FRESH_MS = 60_000;

type StripStatus = "queued" | "uploading" | "stuck" | "pending" | "done" | "failed" | "skipped";

interface StripEntry {
  key: string;
  src: string;
  status: StripStatus;
  sortAt: number;
  zone: string;
  onTap?: () => void;
}

const DOT_CLASS: Record<StripStatus, string> = {
  queued: "bg-zinc-400",
  uploading: "bg-zinc-100 animate-pulse",
  stuck: "bg-red-500",
  pending: "bg-amber-400 animate-pulse",
  done: "bg-emerald-400",
  failed: "bg-red-500",
  skipped: "bg-zinc-500",
};

const DOT_LABEL: Record<StripStatus, string> = {
  queued: "Queued for upload",
  uploading: "Uploading",
  stuck: "Upload failed — tap to retry",
  pending: "Analysing",
  done: "Analysed",
  failed: "Analysis failed — tap to retry",
  skipped: "Uploaded (AI analysis off)",
};

function stripStatusOf(photo: SurveyPhotoView): StripStatus {
  switch (photo.analysisStatus) {
    case "done":
      return "done";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    default:
      return "pending";
  }
}

// =============================================
// GPS — non-blocking latest fix
// =============================================

interface GeoFix {
  lat: number;
  lng: number;
  at: number;
}

function useGeoFix() {
  const fixRef = useRef<GeoFix | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let watchId: number | null = null;
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          fixRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() };
        },
        () => {
          /* denied or unavailable — photos simply go without coordinates */
        },
        { enableHighAccuracy: false, maximumAge: 15_000, timeout: 10_000 },
      );
    } catch {
      /* ignore */
    }
    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  /** Fresh cached fix (from the watch) or null — synchronous, never blocks the shutter. */
  const cachedFix = useCallback((): GeoFix | null => {
    const cached = fixRef.current;
    return cached && Date.now() - cached.at < GPS_FRESH_MS ? cached : null;
  }, []);

  /** One-shot lookup capped at GPS_TIMEOUT_MS, falling back to whatever the watch has. Never throws. */
  const lookupFix = useCallback(async (): Promise<GeoFix | null> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return fixRef.current;
    return new Promise<GeoFix | null>((resolve) => {
      let settled = false;
      const finish = (v: GeoFix | null) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      const timer = setTimeout(() => finish(fixRef.current), GPS_TIMEOUT_MS);
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            clearTimeout(timer);
            const fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() };
            fixRef.current = fix;
            finish(fix);
          },
          () => {
            clearTimeout(timer);
            finish(fixRef.current);
          },
          { enableHighAccuracy: false, maximumAge: 15_000, timeout: GPS_TIMEOUT_MS },
        );
      } catch {
        clearTimeout(timer);
        finish(fixRef.current);
      }
    });
  }, []);

  return { cachedFix, lookupFix };
}

// =============================================
// PAGE
// =============================================

export default function SurveyWalk() {
  const params = useParams<{ id: string }>();
  const surveyId = params.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const hapticRef = useRef(haptic);
  hapticRef.current = haptic;
  const { cachedFix, lookupFix } = useGeoFix();

  const cameraRef = useRef<WalkCameraHandle>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [cameraState, setCameraState] = useState<CameraState>("starting");
  const [capturing, setCapturing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);

  // ---- data
  const { data: survey } = useQuery<SiteSurvey>({
    queryKey: ["/api/site-surveys", surveyId],
    enabled: !!surveyId,
  });
  const photosQuery = useSurveyPhotos(surveyId);
  const photos = useMemo(() => photosQuery.data ?? [], [photosQuery.data]);
  const reanalyse = useReanalysePhoto(surveyId);
  const patchPhoto = usePatchSurveyPhoto(surveyId);

  // ---- voice note plumbing (declared before the queue so onUploaded can see it)
  const lastShotRef = useRef<{ kind: "queued" | "uploaded"; id: string; at: number } | null>(null);

  const queue = useUploadQueue(surveyId, {
    onUploaded: (photo, item) => {
      hapticRef.current.light();
      const last = lastShotRef.current;
      if (last && last.kind === "queued" && last.id === item.id) {
        lastShotRef.current = { kind: "uploaded", id: photo.id, at: last.at };
      }
    },
  });

  // ---- zone
  const zoneStorageKey = surveyId ? `survey-walk:zone:${surveyId}` : null;
  const [zoneName, setZoneNameState] = useState<string>(() => {
    if (!zoneStorageKey) return "";
    try {
      return localStorage.getItem(zoneStorageKey) ?? "";
    } catch {
      return "";
    }
  });
  const zoneName_ = zoneName; // (alias keeps the effect deps readable)
  useEffect(() => {
    // First open with nothing remembered: continue the latest zone on the server, else Zone 1.
    if (zoneName_ || !photosQuery.isSuccess) return;
    const latest = photos[0]?.zoneName?.trim();
    setZoneNameState(latest || defaultZoneName(uniqueZones(photos.map((p) => p.zoneName))));
  }, [zoneName_, photosQuery.isSuccess, photos]);
  const activeZone = zoneName || "Zone 1";
  const setZoneName = useCallback(
    (name: string) => {
      setZoneNameState(name);
      if (zoneStorageKey) {
        try {
          localStorage.setItem(zoneStorageKey, name);
        } catch {
          /* private mode */
        }
      }
    },
    [zoneStorageKey],
  );

  const zones = useMemo(
    () => uniqueZones([activeZone, ...queue.items.map((i) => i.zoneName), ...photos.map((p) => p.zoneName)]),
    [activeZone, queue.items, photos],
  );
  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const i of queue.items) counts[i.zoneName] = (counts[i.zoneName] ?? 0) + 1;
    for (const p of photos) {
      const z = p.zoneName?.trim();
      if (z) counts[z] = (counts[z] ?? 0) + 1;
    }
    return counts;
  }, [queue.items, photos]);

  // ---- lock the page behind the walk screen
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ---- haptics when analysis lands
  const statusRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const prev = statusRef.current;
    const next = new Map<string, string>();
    let completed = false;
    let failed = false;
    for (const p of photos) {
      next.set(p.id, p.analysisStatus);
      const was = prev.get(p.id);
      if (was === "pending" && p.analysisStatus === "done") completed = true;
      if (was === "pending" && p.analysisStatus === "failed") failed = true;
    }
    statusRef.current = next;
    if (completed) hapticRef.current.success();
    else if (failed) hapticRef.current.warning();
  }, [photos]);

  // ---- capture
  const [pendingNote, setPendingNote] = useState("");
  const pendingNoteRef = useRef(pendingNote);
  pendingNoteRef.current = pendingNote;

  const enqueueFrame = useCallback(
    async (frame: CapturedFrame) => {
      if (!surveyId) return;
      const takenAt = new Date().toISOString();
      const fix = cachedFix();
      const note = pendingNoteRef.current.trim();
      const item = await queue.enqueue({
        surveyId,
        blob: frame.blob,
        mime: frame.mime,
        width: frame.width,
        height: frame.height,
        zoneName: activeZone,
        lat: fix?.lat,
        lng: fix?.lng,
        takenAt,
        voiceNote: note || undefined,
      });
      if (note) setPendingNote("");
      lastShotRef.current = { kind: "queued", id: item.id, at: Date.now() };
      // No fresh fix yet (cold start / permission just granted): back-fill in the
      // background so the shutter and thumbnail never wait on GPS.
      if (!fix) {
        void lookupFix().then((late) => {
          if (late) queue.updateLocation(item.id, late.lat, late.lng);
        });
      }
    },
    [surveyId, cachedFix, lookupFix, queue, activeZone],
  );

  const takeShot = useCallback(async () => {
    const cam = cameraRef.current;
    if (!cam || capturing || !surveyId) return;
    if (cam.getState() !== "live") {
      haptic.light();
      cam.openPicker();
      return;
    }
    setCapturing(true);
    haptic.medium();
    let frame: CapturedFrame | null = null;
    try {
      frame = await cam.capture();
    } catch (err) {
      console.error("[survey-walk] capture failed:", err);
    } finally {
      setCapturing(false);
    }
    if (!frame) {
      cam.openPicker();
      return;
    }
    try {
      await enqueueFrame(frame);
    } catch (err) {
      console.error("[survey-walk] enqueue failed:", err);
      haptic.error();
      toast({ title: "Couldn't save that photo", description: "Try again.", variant: "destructive" });
    }
  }, [capturing, surveyId, haptic, enqueueFrame, toast]);

  const onFallbackFrame = useCallback(
    (frame: CapturedFrame) => {
      haptic.medium();
      void enqueueFrame(frame).catch((err) => {
        console.error("[survey-walk] enqueue failed:", err);
        toast({ title: "Couldn't save that photo", variant: "destructive" });
      });
    },
    [haptic, enqueueFrame, toast],
  );

  const onGalleryPicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (files.length === 0) return;
      setImporting(true);
      let failures = 0;
      try {
        for (const file of files) {
          try {
            await enqueueFrame(await fileToFrame(file));
          } catch (err) {
            failures += 1;
            console.error("[survey-walk] import failed:", err);
          }
        }
      } finally {
        setImporting(false);
      }
      if (failures > 0) {
        haptic.warning();
        toast({ title: `${failures} image${failures === 1 ? "" : "s"} couldn't be imported`, variant: "destructive" });
      } else {
        haptic.upload();
      }
    },
    [enqueueFrame, haptic, toast],
  );

  // ---- voice notes (hold the mic)
  const speech = useSpeechRecognition();
  const transcriptRef = useRef(speech.transcript);
  transcriptRef.current = speech.transcript;
  const wasListeningRef = useRef(false);
  const micHeldRef = useRef(false);

  useEffect(() => {
    if (speech.listening) {
      wasListeningRef.current = true;
      return;
    }
    if (!wasListeningRef.current) return;
    wasListeningRef.current = false;
    // Final results can land just after stop(); give them a beat.
    const timer = setTimeout(() => {
      const text = transcriptRef.current.trim();
      speech.reset();
      if (!text) return;
      const last = lastShotRef.current;
      if (last && Date.now() - last.at < VOICE_ATTACH_WINDOW_MS) {
        if (last.kind === "queued" && queue.items.some((i) => i.id === last.id)) {
          const existing = queue.items.find((i) => i.id === last.id)?.voiceNote?.trim();
          queue.updateVoiceNote(last.id, existing ? `${existing} ${text}` : text);
        } else if (last.kind === "uploaded") {
          const existing = photos.find((p) => p.id === last.id)?.voiceNote?.trim();
          patchPhoto.mutate({ photoId: last.id, patch: { voiceNote: existing ? `${existing} ${text}` : text } });
        } else {
          setPendingNote((prev) => (prev ? `${prev} ${text}` : text));
          return;
        }
        hapticRef.current.save();
        toast({ title: "Note added to last photo", description: text.length > 80 ? `${text.slice(0, 80)}…` : text });
      } else {
        setPendingNote((prev) => (prev ? `${prev} ${text}` : text));
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.listening]);

  const micDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (micHeldRef.current) return;
      micHeldRef.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      haptic.light();
      speech.reset();
      speech.start();
    },
    [haptic, speech],
  );
  const micUp = useCallback(() => {
    if (!micHeldRef.current) return;
    micHeldRef.current = false;
    speech.stop();
  }, [speech]);

  // ---- finish
  const goReview = useCallback(() => {
    haptic.pageTransition();
    navigate(`/site-survey/${surveyId}/review`);
  }, [haptic, navigate, surveyId]);
  const finishWalk = useCallback(() => {
    if (queue.queuedCount > 0) setFinishOpen(true);
    else goReview();
  }, [queue.queuedCount, goReview]);
  const goBack = useCallback(() => {
    haptic.pageTransition();
    navigate("/site-survey");
  }, [haptic, navigate]);

  // ---- thumbnail strip: newest first, queued + uploaded merged
  const strip = useMemo<StripEntry[]>(() => {
    const queued: StripEntry[] = queue.items.map((it) => ({
      key: `q:${it.id}`,
      src: queue.previewUrl(it.id),
      status: it.stuck ? "stuck" : queue.uploadingId === it.id ? "uploading" : "queued",
      sortAt: it.createdAt,
      zone: it.zoneName,
      onTap: it.stuck ? () => queue.retry(it.id) : undefined,
    }));
    const uploaded: StripEntry[] = photos.map((p) => ({
      key: `p:${p.id}`,
      src: p.objectUrl,
      status: stripStatusOf(p),
      sortAt: Date.parse(p.takenAt ?? p.createdAt ?? "") || 0,
      zone: p.zoneName ?? "",
      onTap: p.analysisStatus === "failed" ? () => reanalyse.mutate(p.id) : undefined,
    }));
    return [...queued, ...uploaded].sort((a, b) => b.sortAt - a.sortAt).slice(0, STRIP_LENGTH);
  }, [queue, photos, reanalyse]);

  const totalShots = photos.length + queue.queuedCount;
  const analysing = photos.filter((p) => p.analysisStatus === "pending").length;
  const shutterDisabled = capturing || importing || !surveyId;

  if (!surveyId) {
    return (
      <div className="fixed inset-0 z-[45] flex items-center justify-center bg-[#1D1D1B] p-6 text-center text-white">
        <p>No survey selected.</p>
      </div>
    );
  }

  return (
    <div
      data-testid="survey-walk"
      className="fixed inset-0 z-[45] flex select-none flex-col bg-[#1D1D1B] text-white landscape:flex-row md:flex-row"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {/* ── Preview column ─────────────────────────────── */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Header overlays the preview */}
        <header className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/80 via-black/40 to-transparent pb-8 pl-[max(8px,env(safe-area-inset-left))] pr-2 pt-[max(8px,env(safe-area-inset-top))] landscape:pr-2">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={goBack}
              aria-label="Back to surveys"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white active:bg-white/10"
            >
              <ChevronLeft className="h-7 w-7" aria-hidden />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-tight">{survey?.title ?? "Survey walk"}</p>
              <p className="truncate text-xs text-zinc-300">
                {survey?.facilityName ?? ""}
                {totalShots > 0 ? ` · ${totalShots} photo${totalShots === 1 ? "" : "s"}` : ""}
              </p>
            </div>
            <ZoneChip zoneName={activeZone} zones={zones} counts={zoneCounts} onChange={setZoneName} />
          </div>
          <div className="pointer-events-auto mt-2 flex flex-wrap items-center gap-2 pl-1">
            {queue.queuedCount > 0 && (
              <span
                data-testid="queued-badge"
                className="inline-flex h-7 items-center gap-1 rounded-full bg-black/60 px-2.5 text-xs font-medium text-zinc-100 ring-1 ring-white/15"
              >
                {queue.uploadingId ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#FFC72C]" aria-hidden /> : <CloudUpload className="h-3.5 w-3.5" aria-hidden />}
                {queue.queuedCount} queued
              </span>
            )}
            {analysing > 0 && (
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-black/60 px-2.5 text-xs font-medium text-amber-300 ring-1 ring-amber-400/30">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden />
                {analysing} analysing
              </span>
            )}
            {!queue.online && (
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-black/60 px-2.5 text-xs font-medium text-zinc-200 ring-1 ring-white/15">
                <WifiOff className="h-3.5 w-3.5" aria-hidden />
                Offline — uploads resume when back online
              </span>
            )}
          </div>
        </header>

        <WalkCamera
          ref={cameraRef}
          className="min-h-0 flex-1"
          onFrame={onFallbackFrame}
          onStateChange={setCameraState}
          onError={(message) => toast({ title: message, variant: "destructive" })}
        />

        {/* Voice note state, floating above the bottom of the preview */}
        {(speech.listening || pendingNote) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-3">
            <div
              className={cn(
                "pointer-events-auto flex max-w-full items-center gap-2 rounded-2xl px-3 py-2 text-sm shadow-lg ring-1",
                speech.listening ? "bg-[#FFC72C] text-[#1D1D1B] ring-[#FFC72C]" : "bg-black/70 text-zinc-100 ring-white/15",
              )}
            >
              {speech.listening ? (
                <>
                  <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-600" aria-hidden />
                  <span className="truncate">{speech.interim || speech.transcript || "Listening… keep holding the mic"}</span>
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 shrink-0 text-[#FFC72C]" aria-hidden />
                  <span className="truncate">
                    <span className="text-zinc-400">Note for next shot: </span>
                    {pendingNote}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingNote("")}
                    aria-label="Discard note"
                    className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full active:bg-white/10"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Controls: bottom bar (portrait) / right rail (landscape, tablet) ── */}
      <div
        className={cn(
          "flex shrink-0 flex-col gap-3 bg-[#1D1D1B] px-3 pt-3",
          "pb-[max(12px,env(safe-area-inset-bottom))]",
          "landscape:h-full landscape:w-[164px] landscape:justify-between landscape:pr-[max(12px,env(safe-area-inset-right))] landscape:pt-[max(12px,env(safe-area-inset-top))]",
          "md:h-full md:w-[184px] md:justify-between md:pr-[max(12px,env(safe-area-inset-right))] md:pt-[max(12px,env(safe-area-inset-top))]",
        )}
      >
        {/* Thumbnail strip */}
        <div
          data-testid="thumb-strip"
          className="flex min-h-[64px] gap-2 overflow-x-auto overflow-y-hidden landscape:min-h-0 landscape:flex-1 landscape:flex-col landscape:overflow-x-hidden landscape:overflow-y-auto md:min-h-0 md:flex-1 md:flex-col md:overflow-x-hidden md:overflow-y-auto"
          style={{ scrollbarWidth: "none" }}
        >
          {strip.length === 0 ? (
            <p className="self-center text-xs text-zinc-500 landscape:text-center md:text-center">
              {cameraState === "live" ? "Tap the shutter to take your first photo" : "Tap the shutter to open your camera"}
            </p>
          ) : (
            strip.map((entry) => {
              const Wrapper = entry.onTap ? "button" : "div";
              return (
                <Wrapper
                  key={entry.key}
                  {...(entry.onTap ? { type: "button" as const, onClick: entry.onTap } : {})}
                  title={`${DOT_LABEL[entry.status]}${entry.zone ? ` · ${entry.zone}` : ""}`}
                  aria-label={`${DOT_LABEL[entry.status]}${entry.zone ? `, ${entry.zone}` : ""}`}
                  className={cn(
                    "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-800 ring-1 ring-white/10",
                    entry.onTap && "active:scale-95",
                  )}
                >
                  {entry.src ? (
                    <img src={entry.src} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
                  ) : null}
                  <span
                    aria-hidden
                    className={cn("absolute right-1 top-1 h-3 w-3 rounded-full ring-2 ring-black/70", DOT_CLASS[entry.status])}
                  />
                  {(entry.status === "stuck" || entry.status === "failed") && (
                    <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-red-600/90 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                      <RefreshCw className="h-3 w-3" aria-hidden />
                      Retry
                    </span>
                  )}
                </Wrapper>
              );
            })
          )}
        </div>

        {/* Gallery · Shutter · Mic */}
        <div className="flex items-center justify-around landscape:flex-col landscape:gap-5 md:flex-col md:gap-5">
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={importing}
            aria-label="Import from gallery"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-white ring-1 ring-white/10 transition-transform active:scale-95 disabled:opacity-50"
          >
            {importing ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : <Images className="h-6 w-6" aria-hidden />}
          </button>
          <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" aria-hidden tabIndex={-1} onChange={onGalleryPicked} />

          <button
            type="button"
            data-testid="shutter"
            onClick={takeShot}
            disabled={shutterDisabled}
            aria-label="Take photo"
            className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#FFC72C] shadow-[0_0_0_4px_#1D1D1B,0_0_0_7px_#FFC72C] transition-transform active:scale-90 disabled:opacity-60"
          >
            {capturing ? (
              <Loader2 className="h-7 w-7 animate-spin text-[#1D1D1B]" aria-hidden />
            ) : (
              <span aria-hidden className="h-[58px] w-[58px] rounded-full bg-[#FFC72C] ring-2 ring-inset ring-[#1D1D1B]/20" />
            )}
          </button>

          {speech.supported ? (
            <button
              type="button"
              data-testid="mic"
              onPointerDown={micDown}
              onPointerUp={micUp}
              onPointerCancel={micUp}
              onPointerLeave={micUp}
              onContextMenu={(e) => e.preventDefault()}
              aria-label="Hold to record a voice note"
              aria-pressed={speech.listening}
              style={{ touchAction: "none" }}
              className={cn(
                "flex h-14 w-14 items-center justify-center rounded-full ring-1 transition-all",
                speech.listening
                  ? "scale-110 bg-red-600 text-white ring-red-400"
                  : "bg-zinc-800 text-white ring-white/10 active:scale-95",
              )}
            >
              <Mic className="h-6 w-6" aria-hidden />
            </button>
          ) : (
            <span className="h-14 w-14" aria-hidden />
          )}
        </div>

        <Button
          type="button"
          data-testid="finish-walk"
          onClick={finishWalk}
          className="h-12 w-full bg-white text-base font-semibold text-[#1D1D1B] hover:bg-zinc-200 landscape:h-12 md:h-12"
        >
          Finish walk
        </Button>
      </div>

      <AlertDialog open={finishOpen} onOpenChange={setFinishOpen}>
        <AlertDialogContent className="border-zinc-800 bg-[#1D1D1B] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[#FFC72C]" aria-hidden />
              {queue.queuedCount} photo{queue.queuedCount === 1 ? "" : "s"} still uploading
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              {queue.online
                ? "Give them a moment to finish, or leave now — anything still queued is kept on this phone and uploads the next time you open this walk."
                : "You're offline. Queued photos are kept on this phone and upload the next time you open this walk with a connection."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800 hover:text-white">Keep waiting</AlertDialogCancel>
            <AlertDialogAction onClick={goReview} className="bg-[#FFC72C] text-[#1D1D1B] hover:bg-[#e6b327]">
              Finish anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
