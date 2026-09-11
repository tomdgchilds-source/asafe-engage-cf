// ─────────────────────────────────────────────────────────
// useUploadQueue — offline-first photo upload queue for the Survey Walk
// (Phase 3, Task S2).
//
// - Items persist in IndexedDB (idb.ts) so a killed tab or a dead
//   battery loses nothing; they reload when the walk is reopened.
// - Drains FIFO whenever online; one upload in flight at a time.
// - Transient failures back off exponentially (UploadQueue.ts); 4xx
//   failures park the item as `stuck` until the rep taps retry.
// - On success the item is deleted and the photo is written straight
//   into the React Query cache for ["survey-photos", surveyId].
// ─────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { UPLOADS_STORE, idbDelete, idbGetAll, idbPut, idbSupported } from "./idb";
import {
  earliestRetryAt,
  markFailed,
  nextDue,
  orderQueue,
  resetForRetry,
  uploadQueuedItem,
  type NewUpload,
  type QueuedUpload,
} from "./UploadQueue";
import { upsertPhotoInCache, type SurveyPhotoView } from "./useSurveyPhotos";

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface UseUploadQueueOptions {
  onUploaded?: (photo: SurveyPhotoView, item: QueuedUpload) => void;
  onFailed?: (item: QueuedUpload, err: unknown) => void;
}

export interface UploadQueueApi {
  /** Queue items for this survey, FIFO. */
  items: QueuedUpload[];
  queuedCount: number;
  /** Id of the item currently being POSTed, if any. */
  uploadingId: string | null;
  /** True once the persisted queue has been read from IndexedDB. */
  loaded: boolean;
  online: boolean;
  enqueue: (input: NewUpload) => Promise<QueuedUpload>;
  retry: (id: string) => void;
  remove: (id: string) => Promise<void>;
  updateVoiceNote: (id: string, voiceNote: string) => void;
  /** Back-fill GPS on a still-queued item (no-op once it has uploaded). */
  updateLocation: (id: string, lat: number, lng: number) => void;
  /** Object URL for an item's blob (cached; revoked when the item leaves the queue). */
  previewUrl: (id: string) => string;
  /** Kick the drain loop (e.g. after the tab becomes visible). */
  drain: () => void;
}

export function useUploadQueue(surveyId: string | undefined, opts: UseUploadQueueOptions = {}): UploadQueueApi {
  const qc = useQueryClient();
  const online = useOnlineStatus();
  const [items, setItems] = useState<QueuedUpload[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const itemsRef = useRef<QueuedUpload[]>([]);
  const drainingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewsRef = useRef(new Map<string, string>());
  const mountedRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Replace the queue atomically (ref first so drain() never reads stale state).
  const commit = useCallback((updater: (prev: QueuedUpload[]) => QueuedUpload[]) => {
    const next = orderQueue(updater(itemsRef.current));
    itemsRef.current = next;
    if (mountedRef.current) setItems(next);
  }, []);

  const persist = useCallback(async (item: QueuedUpload) => {
    if (!idbSupported()) return;
    try {
      await idbPut(UPLOADS_STORE, item);
    } catch (err) {
      console.warn("[survey-walk] IndexedDB put failed (kept in memory):", err);
    }
  }, []);

  const forget = useCallback(async (id: string) => {
    if (!idbSupported()) return;
    try {
      await idbDelete(UPLOADS_STORE, id);
    } catch (err) {
      console.warn("[survey-walk] IndexedDB delete failed:", err);
    }
  }, []);

  const revokePreview = useCallback((id: string) => {
    const url = previewsRef.current.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      previewsRef.current.delete(id);
    }
  }, []);

  const previewUrl = useCallback((id: string): string => {
    const cached = previewsRef.current.get(id);
    if (cached) return cached;
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item) return "";
    const url = URL.createObjectURL(item.blob);
    previewsRef.current.set(id, url);
    return url;
  }, []);

  // Mount / unmount bookkeeping.
  useEffect(() => {
    mountedRef.current = true;
    const previews = previewsRef.current;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      for (const url of previews.values()) URL.revokeObjectURL(url);
      previews.clear();
    };
  }, []);

  // Load the persisted queue for this survey.
  useEffect(() => {
    let cancelled = false;
    itemsRef.current = [];
    setItems([]);
    setLoaded(false);
    if (!surveyId) {
      setLoaded(true);
      return;
    }
    (async () => {
      let rows: QueuedUpload[] = [];
      if (idbSupported()) {
        try {
          const all = await idbGetAll<QueuedUpload>(UPLOADS_STORE);
          rows = all.filter((r) => r && r.surveyId === surveyId && r.blob instanceof Blob);
        } catch (err) {
          console.warn("[survey-walk] IndexedDB read failed (starting empty):", err);
        }
      }
      if (cancelled) return;
      // A reopened walk should try straight away rather than honour a stale backoff.
      const now = Date.now();
      commit(() => rows.map((r) => (r.stuck ? r : { ...r, nextAttemptAt: Math.min(r.nextAttemptAt, now) })));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [surveyId, commit]);

  const drainRef = useRef<() => Promise<void>>(async () => {});
  const drain = useCallback(async () => {
    if (!surveyId || drainingRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    drainingRef.current = true;
    try {
      for (;;) {
        if (!mountedRef.current) break;
        const item = nextDue(itemsRef.current, Date.now());
        if (!item) break;
        setUploadingId(item.id);
        try {
          const photo = await uploadQueuedItem(item);
          await forget(item.id);
          commit((prev) => prev.filter((p) => p.id !== item.id));
          revokePreview(item.id);
          upsertPhotoInCache(qc, surveyId, photo);
          optsRef.current.onUploaded?.(photo, item);
        } catch (err) {
          // Merge from the latest copy so a voice note / GPS back-filled mid-upload survives the failure.
          const latest = itemsRef.current.find((p) => p.id === item.id) ?? item;
          const failed = markFailed(latest, err, Date.now());
          await persist(failed);
          commit((prev) => prev.map((p) => (p.id === item.id ? failed : p)));
          optsRef.current.onFailed?.(failed, err);
          if (typeof navigator !== "undefined" && navigator.onLine === false) break;
        }
      }
    } finally {
      drainingRef.current = false;
      if (mountedRef.current) setUploadingId(null);
    }
    // Wake up again when the earliest backoff expires.
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const now = Date.now();
    const at = earliestRetryAt(itemsRef.current, now);
    if (at !== null && mountedRef.current) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void drainRef.current();
      }, Math.max(50, at - now));
    }
  }, [surveyId, qc, commit, persist, forget, revokePreview]);
  drainRef.current = drain;

  // Drain when loaded, when connectivity returns, and when something is added.
  useEffect(() => {
    if (loaded && online) void drain();
  }, [loaded, online, items.length, drain]);

  // Also when the tab comes back to the foreground (iOS suspends timers).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void drainRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const enqueue = useCallback(
    async (input: NewUpload): Promise<QueuedUpload> => {
      const item: QueuedUpload = { ...input, id: newId(), createdAt: Date.now(), attempts: 0, nextAttemptAt: 0 };
      await persist(item);
      commit((prev) => [...prev, item]);
      return item;
    },
    [persist, commit],
  );

  const retry = useCallback(
    (id: string) => {
      const now = Date.now();
      let updated: QueuedUpload | undefined;
      commit((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          updated = resetForRetry(p, now);
          return updated;
        }),
      );
      if (updated) void persist(updated);
      void drainRef.current();
    },
    [commit, persist],
  );

  const remove = useCallback(
    async (id: string) => {
      await forget(id);
      commit((prev) => prev.filter((p) => p.id !== id));
      revokePreview(id);
    },
    [forget, commit, revokePreview],
  );

  const updateVoiceNote = useCallback(
    (id: string, voiceNote: string) => {
      let updated: QueuedUpload | undefined;
      commit((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          updated = { ...p, voiceNote };
          return updated;
        }),
      );
      if (updated) void persist(updated);
    },
    [commit, persist],
  );

  const updateLocation = useCallback(
    (id: string, lat: number, lng: number) => {
      let updated: QueuedUpload | undefined;
      commit((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p;
          updated = { ...p, lat, lng };
          return updated;
        }),
      );
      if (updated) void persist(updated);
    },
    [commit, persist],
  );

  const kick = useCallback(() => {
    void drainRef.current();
  }, []);

  return {
    items,
    queuedCount: items.length,
    uploadingId,
    loaded,
    online,
    enqueue,
    retry,
    remove,
    updateVoiceNote,
    updateLocation,
    previewUrl,
    drain: kick,
  };
}

export default useUploadQueue;
