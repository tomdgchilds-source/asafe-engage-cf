import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Offline-first draft hook for site surveys (or any other localStorage-backed
 * form). Writes a debounced copy to localStorage on every change so the user
 * can go offline / refresh / drop the tab without losing work, and flushes to
 * the server via a caller-supplied callback whenever the network returns.
 *
 * Keys:
 *   survey-draft-<surveyId>       - latest draft JSON
 *   survey-draft-<surveyId>-meta  - { updatedAt, syncedAt }
 *
 * Strategy is last-write-wins; a draft is considered "pending" when its
 * updatedAt is newer than its syncedAt (or syncedAt is null).
 */

export type OfflineSurveyStatus =
  | 'idle'
  | 'saving-local'
  | 'queued'
  | 'syncing'
  | 'synced'
  | 'error';

export interface UseOfflineSurveyOptions<T> {
  /** Stable per-survey key. Usually `surveyId` or `draftId`. */
  surveyId: string;
  /** Debounce window before flushing to localStorage. Default 500ms. */
  autosaveMs?: number;
  /** Called when the network returns (or forceSync() is invoked) with a pending draft. */
  onOnlineFlush?: (draft: T) => Promise<void>;
}

export interface UseOfflineSurveyResult<T> {
  draft: T | null;
  setDraft: (patch: Partial<T>) => void;
  replaceDraft: (next: T) => void;
  status: OfflineSurveyStatus;
  pendingPushCount: number;
  online: boolean;
  forceSync: () => Promise<void>;
}

interface DraftMeta {
  updatedAt: number;
  syncedAt: number | null;
}

function metaKey(surveyId: string) {
  return `survey-draft-${surveyId}-meta`;
}

function draftKey(surveyId: string) {
  return `survey-draft-${surveyId}`;
}

function safeGetItem(key: string): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  } catch {
    // Storage full / disabled / private mode — swallow; the hook still holds the
    // draft in memory.
  }
}

function safeRemoveItem(key: string) {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  } catch {
    /* swallow */
  }
}

function readMeta(surveyId: string): DraftMeta {
  const raw = safeGetItem(metaKey(surveyId));
  if (!raw) return { updatedAt: 0, syncedAt: null };
  try {
    const parsed = JSON.parse(raw);
    return {
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
      syncedAt: typeof parsed.syncedAt === 'number' ? parsed.syncedAt : null,
    };
  } catch {
    return { updatedAt: 0, syncedAt: null };
  }
}

function writeMeta(surveyId: string, meta: DraftMeta) {
  safeSetItem(metaKey(surveyId), JSON.stringify(meta));
}

function pendingCountFromMeta(meta: DraftMeta): number {
  if (meta.updatedAt === 0) return 0;
  if (meta.syncedAt === null) return 1;
  return meta.updatedAt > meta.syncedAt ? 1 : 0;
}

export function useOfflineSurvey<T>(
  opts: UseOfflineSurveyOptions<T>
): UseOfflineSurveyResult<T> {
  const { surveyId, autosaveMs = 500, onOnlineFlush } = opts;

  const [draft, setDraftState] = useState<T | null>(() => {
    const raw = safeGetItem(draftKey(surveyId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  });

  const [status, setStatus] = useState<OfflineSurveyStatus>('idle');
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [pendingPushCount, setPendingPushCount] = useState<number>(() =>
    pendingCountFromMeta(readMeta(surveyId))
  );

  // Keep the latest draft + callback in refs so timers and listeners don't go
  // stale without us re-attaching them on every render.
  const draftRef = useRef<T | null>(draft);
  const onFlushRef = useRef<typeof onOnlineFlush>(onOnlineFlush);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlightRef = useRef(false);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    onFlushRef.current = onOnlineFlush;
  }, [onOnlineFlush]);

  // Reload from storage whenever the surveyId changes (user switches drafts).
  useEffect(() => {
    const raw = safeGetItem(draftKey(surveyId));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as T;
        setDraftState(parsed);
        draftRef.current = parsed;
      } catch {
        /* ignore */
      }
    } else {
      setDraftState(null);
      draftRef.current = null;
    }
    setPendingPushCount(pendingCountFromMeta(readMeta(surveyId)));
    setStatus('idle');
  }, [surveyId]);

  const persistDraft = useCallback(
    (next: T) => {
      safeSetItem(draftKey(surveyId), JSON.stringify(next));
      const meta: DraftMeta = {
        updatedAt: Date.now(),
        syncedAt: readMeta(surveyId).syncedAt,
      };
      writeMeta(surveyId, meta);
      setPendingPushCount(pendingCountFromMeta(meta));
      setStatus(navigator.onLine ? 'queued' : 'queued');
    },
    [surveyId]
  );

  const scheduleLocalSave = useCallback(
    (next: T) => {
      setStatus('saving-local');
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        persistDraft(next);
      }, autosaveMs);
    },
    [autosaveMs, persistDraft]
  );

  const setDraft = useCallback(
    (patch: Partial<T>) => {
      setDraftState((prev) => {
        const base = (prev ?? {}) as T;
        const next = { ...base, ...patch } as T;
        draftRef.current = next;
        scheduleLocalSave(next);
        return next;
      });
    },
    [scheduleLocalSave]
  );

  const replaceDraft = useCallback(
    (next: T) => {
      draftRef.current = next;
      setDraftState(next);
      scheduleLocalSave(next);
    },
    [scheduleLocalSave]
  );

  const forceSync = useCallback(async () => {
    if (syncInFlightRef.current) return;
    const meta = readMeta(surveyId);
    if (pendingCountFromMeta(meta) === 0) {
      setStatus('synced');
      return;
    }
    const current = draftRef.current;
    if (!current || !onFlushRef.current) {
      setStatus('queued');
      return;
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus('queued');
      return;
    }

    syncInFlightRef.current = true;
    setStatus('syncing');
    try {
      await onFlushRef.current(current);
      const nextMeta: DraftMeta = {
        updatedAt: meta.updatedAt,
        syncedAt: Date.now(),
      };
      writeMeta(surveyId, nextMeta);
      setPendingPushCount(pendingCountFromMeta(nextMeta));
      setStatus('synced');
    } catch (err) {
      console.error('[useOfflineSurvey] flush failed:', err);
      setStatus('error');
    } finally {
      syncInFlightRef.current = false;
    }
  }, [surveyId]);

  // Watch online/offline events. When we come back online with a pending
  // draft, attempt a flush.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setOnline(true);
      // Small delay — give the browser a tick to settle DNS/connections.
      setTimeout(() => {
        void forceSync();
      }, 250);
    };
    const handleOffline = () => {
      setOnline(false);
      setStatus((prev) => (prev === 'syncing' ? 'queued' : prev));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [forceSync]);

  // Clean up the debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    draft,
    setDraft,
    replaceDraft,
    status,
    pendingPushCount,
    online,
    forceSync,
  };
}

export default useOfflineSurvey;
