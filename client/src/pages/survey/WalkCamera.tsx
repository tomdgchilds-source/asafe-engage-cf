// ─────────────────────────────────────────────────────────
// WalkCamera — live rear-camera preview for the Survey Walk
// (Phase 3, Task S2).
//
// Uses getUserMedia({ video: { facingMode: "environment" } }). Where that
// is unavailable or denied it falls back to a hidden
// <input type="file" capture="environment"> so the shutter still opens the
// phone's native camera. Both paths return a CapturedFrame already
// downscaled to ≤ 1280 px long edge, JPEG 0.82.
// ─────────────────────────────────────────────────────────
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Camera, CameraOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { JPEG_MIME, JPEG_QUALITY, MAX_LONG_EDGE, downscaleTarget } from "./UploadQueue";

export interface CapturedFrame {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
}

export type CameraState = "starting" | "live" | "fallback" | "denied" | "error";

export interface WalkCameraHandle {
  /** Grab the current preview frame. Null when there is no live preview. */
  capture: () => Promise<CapturedFrame | null>;
  /** Open the native camera / file picker fallback. */
  openPicker: () => void;
  /** Current camera state (synchronous read). */
  getState: () => CameraState;
}

// =============================================
// IMAGE HELPERS
// =============================================

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Canvas encode failed"))), type, quality);
  });
}

/** Draw any canvas source at ≤ MAX_LONG_EDGE and encode as JPEG. */
export async function frameFromSource(source: CanvasImageSource, srcWidth: number, srcHeight: number): Promise<CapturedFrame> {
  const target = downscaleTarget(srcWidth, srcHeight, MAX_LONG_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(source, 0, 0, target.width, target.height);
  const blob = await canvasToBlob(canvas, JPEG_MIME, JPEG_QUALITY);
  return { blob, width: target.width, height: target.height, mime: JPEG_MIME };
}

/**
 * Decode a picked/gallery image and downscale it. Goes through <img> so
 * EXIF orientation is applied by the browser before we draw.
 */
export async function fileToFrame(file: Blob): Promise<CapturedFrame> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not decode that image"));
      el.src = url;
    });
    return await frameFromSource(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// =============================================
// COMPONENT
// =============================================

export interface WalkCameraProps {
  className?: string;
  /** A frame produced by the fallback picker. */
  onFrame: (frame: CapturedFrame) => void;
  onStateChange?: (state: CameraState) => void;
  onError?: (message: string) => void;
}

const FALLBACK_COPY: Record<Exclude<CameraState, "live">, { title: string; body: string }> = {
  starting: { title: "Starting camera…", body: "Allow camera access when your phone asks." },
  denied: { title: "Camera access was blocked", body: "Tap the shutter to use your phone's camera app instead. You can re-enable access in browser settings." },
  fallback: { title: "Live preview not available", body: "Tap the shutter to open your phone's camera." },
  error: { title: "Camera could not start", body: "Tap the shutter to open your phone's camera instead." },
};

export const WalkCamera = forwardRef<WalkCameraHandle, WalkCameraProps>(function WalkCamera(
  { className, onFrame, onStateChange, onError },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const stateRef = useRef<CameraState>("starting");
  const [state, setState] = useState<CameraState>("starting");
  const [flash, setFlash] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const callbacksRef = useRef({ onFrame, onStateChange, onError });
  callbacksRef.current = { onFrame, onStateChange, onError };

  const setCamState = useCallback((next: CameraState) => {
    stateRef.current = next;
    setState(next);
    callbacksRef.current.onStateChange?.(next);
  }, []);

  const stopStream = useCallback(() => {
    generationRef.current += 1;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startStream = useCallback(async () => {
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media || typeof media.getUserMedia !== "function" || typeof window === "undefined" || !window.isSecureContext) {
      setCamState("fallback");
      return;
    }
    stopStream();
    const generation = generationRef.current;
    setCamState("starting");
    try {
      const stream = await media.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          /* autoplay policies — the muted inline video still renders once ready */
        }
      }
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (generation === generationRef.current) setCamState("error");
      });
      setCamState("live");
    } catch (err) {
      const name = err && typeof err === "object" ? (err as { name?: string }).name : undefined;
      setCamState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "fallback");
    }
  }, [setCamState, stopStream]);

  // Start on mount; pause while the tab is hidden (saves battery, and iOS
  // kills background streams anyway); restart when visible again.
  useEffect(() => {
    void startStream();
    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") {
        if (stateRef.current === "live" || stateRef.current === "starting") stopStream();
      } else if (!streamRef.current && stateRef.current !== "denied" && stateRef.current !== "fallback") {
        void startStream();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopStream();
    };
  }, [startStream, stopStream]);

  const capture = useCallback(async (): Promise<CapturedFrame | null> => {
    const video = videoRef.current;
    if (stateRef.current !== "live" || !video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
    setFlash(true);
    window.setTimeout(() => setFlash(false), 120);
    return frameFromSource(video, video.videoWidth, video.videoHeight);
  }, []);

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  useImperativeHandle(ref, () => ({ capture, openPicker, getState: () => stateRef.current }), [capture, openPicker]);

  const onPicked = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setDecoding(true);
    try {
      callbacksRef.current.onFrame(await fileToFrame(file));
    } catch (err) {
      callbacksRef.current.onError?.(err instanceof Error ? err.message : "Could not read that photo");
    } finally {
      setDecoding(false);
    }
  }, []);

  const copy = state === "live" ? null : FALLBACK_COPY[state];

  return (
    <div className={cn("relative overflow-hidden bg-black", className)}>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-label="Camera preview"
        className={cn("absolute inset-0 h-full w-full object-cover", state !== "live" && "invisible")}
      />
      {copy && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
          {state === "starting" ? (
            <Loader2 className="h-9 w-9 animate-spin text-[#FFC72C]" aria-hidden />
          ) : state === "denied" ? (
            <CameraOff className="h-9 w-9 text-zinc-400" aria-hidden />
          ) : (
            <Camera className="h-9 w-9 text-zinc-400" aria-hidden />
          )}
          <p className="text-base font-semibold text-white">{copy.title}</p>
          <p className="max-w-xs text-sm text-zinc-400">{copy.body}</p>
        </div>
      )}
      {decoding && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <Loader2 className="h-8 w-8 animate-spin text-[#FFC72C]" aria-hidden />
        </div>
      )}
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 bg-white transition-opacity duration-150", flash ? "opacity-80" : "opacity-0")}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={onPicked}
      />
    </div>
  );
});

export default WalkCamera;
