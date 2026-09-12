/**
 * client/src/components/layout-editor/useDocSync.ts
 *
 * Loads `GET /api/layout-drawings/:id/document` and keeps the server in
 * step with the editor's document via a debounced (800 ms)
 * `PUT .../document { document, baseVersion }`.
 *
 * Optimistic concurrency: every PUT sends the last version we received;
 * a 409 hands back `{ current: { document, version } }`, which we adopt
 * (`onConflict` → the Editor resets history) and surface as a toast.
 * Other failures back off and retry; the indicator shows "Save failed —
 * will retry" meanwhile.
 *
 * The hook compares documents by reference: the Editor's history hands
 * out immutable snapshots, so `doc !== lastSaved` means "dirty" with no
 * deep compare. A save that finishes while a newer doc is already
 * pending immediately schedules the next one. `flush()` saves at once
 * (used on close) with `keepalive` so the request survives unmount.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { parseLayoutDoc, type LayoutDoc } from "@shared/layout/doc";

export const DOC_SAVE_DEBOUNCE_MS = 800;
const RETRY_BASE_MS = 3000;
const RETRY_MAX_MS = 30_000;

export type DocSyncStatus = "loading" | "idle" | "dirty" | "saving" | "saved" | "error" | "load-error";

export interface DocSyncOptions {
  drawingId: string | null;
  /** Current editor document (null until loaded). */
  doc: LayoutDoc | null;
  onLoaded(doc: LayoutDoc, version: number, migratedFromMarkups: boolean): void;
  /** Server has a newer version; adopt it. */
  onConflict(doc: LayoutDoc, version: number): void;
  onLoadError?(error: Error): void;
  debounceMs?: number;
}

export interface DocSyncApi {
  status: DocSyncStatus;
  version: number;
  lastSavedAt: number | null;
  error: string | null;
  /** Save now (skips the debounce). Resolves when the request settles. */
  flush(): Promise<void>;
  /** Re-fetch from the server (after a load error). */
  reload(): void;
}

export function useDocSync(opts: DocSyncOptions): DocSyncApi {
  const { drawingId, doc, onLoaded, onConflict, onLoadError, debounceMs = DOC_SAVE_DEBOUNCE_MS } = opts;

  const [status, setStatus] = useState<DocSyncStatus>("loading");
  const [version, setVersion] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const versionRef = useRef(0);
  const lastSavedDocRef = useRef<LayoutDoc | null>(null);
  const docRef = useRef<LayoutDoc | null>(doc);
  docRef.current = doc;
  const loadedRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failuresRef = useRef(0);

  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const onConflictRef = useRef(onConflict);
  onConflictRef.current = onConflict;
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  const clearTimers = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (retryRef.current !== null) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
  };

  // ─── Load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadedRef.current = false;
    lastSavedDocRef.current = null;
    failuresRef.current = 0;
    clearTimers();
    if (!drawingId) return;
    let cancelled = false;
    setStatus("loading");
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/layout-drawings/${drawingId}/document`, { credentials: "include" });
        if (!res.ok) throw new Error(`Failed to load drawing document (${res.status})`);
        const body = (await res.json()) as { document: unknown; version: number; migratedFromMarkups?: boolean };
        const parsed = parseLayoutDoc(body.document);
        if (!parsed) throw new Error("Drawing document is malformed");
        if (cancelled) return;
        versionRef.current = typeof body.version === "number" ? body.version : 0;
        setVersion(versionRef.current);
        lastSavedDocRef.current = parsed;
        loadedRef.current = true;
        setStatus("idle");
        onLoadedRef.current(parsed, versionRef.current, !!body.migratedFromMarkups);
      } catch (e) {
        if (cancelled) return;
        const err = e instanceof Error ? e : new Error(String(e));
        setStatus("load-error");
        setError(err.message);
        onLoadErrorRef.current?.(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [drawingId, reloadTick]);

  // ─── Save ─────────────────────────────────────────────────────────────
  const save = useCallback(
    async (keepalive = false): Promise<void> => {
      if (!drawingId || !loadedRef.current) return;
      if (inFlightRef.current) return inFlightRef.current;
      const snapshot = docRef.current;
      if (!snapshot || snapshot === lastSavedDocRef.current) return;

      const run = (async () => {
        setStatus("saving");
        try {
          const res = await fetch(`/api/layout-drawings/${drawingId}/document`, {
            method: "PUT",
            credentials: "include",
            keepalive,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ document: snapshot, baseVersion: versionRef.current }),
          });
          if (res.status === 409) {
            const body = (await res.json().catch(() => null)) as { current?: { document: unknown; version: number } } | null;
            const current = body?.current ? parseLayoutDoc(body.current.document) : null;
            if (current && body?.current) {
              versionRef.current = body.current.version;
              setVersion(versionRef.current);
              lastSavedDocRef.current = current;
              setStatus("saved");
              setLastSavedAt(Date.now());
              setError(null);
              failuresRef.current = 0;
              onConflictRef.current(current, versionRef.current);
              return;
            }
            throw new Error("Drawing changed elsewhere and could not be reloaded");
          }
          if (!res.ok) {
            const text = (await res.text().catch(() => "")) || res.statusText;
            throw new Error(`${res.status}: ${text}`);
          }
          const body = (await res.json()) as { version: number };
          versionRef.current = typeof body.version === "number" ? body.version : versionRef.current + 1;
          setVersion(versionRef.current);
          lastSavedDocRef.current = snapshot;
          failuresRef.current = 0;
          setError(null);
          setLastSavedAt(Date.now());
          setStatus(docRef.current !== snapshot ? "dirty" : "saved");
        } catch (e) {
          failuresRef.current += 1;
          setError(e instanceof Error ? e.message : String(e));
          setStatus("error");
          const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (failuresRef.current - 1));
          if (retryRef.current !== null) clearTimeout(retryRef.current);
          retryRef.current = setTimeout(() => {
            retryRef.current = null;
            void save();
          }, delay);
        } finally {
          inFlightRef.current = null;
        }
      })();
      inFlightRef.current = run;
      await run;
      // Something changed while we were saving → go again after the debounce.
      if (docRef.current && docRef.current !== lastSavedDocRef.current && failuresRef.current === 0) {
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          void save();
        }, debounceMs);
      }
    },
    [drawingId, debounceMs],
  );

  // Debounce every document change.
  useEffect(() => {
    if (!loadedRef.current || !doc || doc === lastSavedDocRef.current) return;
    setStatus((s) => (s === "saving" ? s : "dirty"));
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void save();
    }, debounceMs);
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [doc, debounceMs, save]);

  const flush = useCallback(async () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await save(true);
  }, [save]);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  // Best-effort save on unmount (tab close is handled by the Editor's beforeunload).
  useEffect(() => {
    return () => {
      clearTimers();
      if (docRef.current && docRef.current !== lastSavedDocRef.current && loadedRef.current && drawingId && !inFlightRef.current) {
        void fetch(`/api/layout-drawings/${drawingId}/document`, {
          method: "PUT",
          credentials: "include",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document: docRef.current, baseVersion: versionRef.current }),
        }).catch(() => undefined);
      }
    };
  }, [drawingId]);

  return { status, version, lastSavedAt, error, flush, reload };
}
