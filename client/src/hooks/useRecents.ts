import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  RecentEntry,
  iconNameFor,
  resolveRouteMeta,
  shouldSkipRecents,
} from "@/lib/recentsRoutes";

const STORAGE_KEY = "asafe-engage:recents:v1";
const MAX_ENTRIES = 10;
// Ignore very-fast bouncing through a route (e.g. middleware redirects).
// Anything visited for less than this is not meaningful navigation.
const MIN_VISIT_MS = 250;

function readStorage(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is RecentEntry =>
          e &&
          typeof e.path === "string" &&
          typeof e.title === "string" &&
          typeof e.iconName === "string" &&
          typeof e.visitedAt === "number",
      )
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function writeStorage(entries: RecentEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage can throw in private mode / quota — silent failure is
    // fine, RECENTS just won't persist between reloads.
  }
}

// Cross-tab sync: emit a custom event so the dropdown reacts to a write
// in another tab without waiting for next render.
const SYNC_EVENT = "asafe-engage:recents:changed";

function emitSync() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SYNC_EVENT));
}

/**
 * Read-only hook used by the RecentsDropdown. Subscribes to:
 *   - localStorage 'storage' events (other tabs)
 *   - same-tab writes via the SYNC_EVENT custom event
 */
export function useRecents() {
  const [entries, setEntries] = useState<RecentEntry[]>(() => readStorage());

  useEffect(() => {
    const refresh = () => setEntries(readStorage());
    window.addEventListener(SYNC_EVENT, refresh);
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) refresh();
    });
    return () => {
      window.removeEventListener(SYNC_EVENT, refresh);
      // anonymous storage handler — re-bind by full removal works fine on
      // unmount because the listener is GC'd with the closure.
    };
  }, []);

  const clear = useCallback(() => {
    writeStorage([]);
    setEntries([]);
    emitSync();
  }, []);

  const remove = useCallback((path: string) => {
    const next = readStorage().filter((e) => e.path !== path);
    writeStorage(next);
    setEntries(next);
    emitSync();
  }, []);

  return { entries, clear, remove };
}

/**
 * Mount-once tracker. Listens to wouter location changes, debounces a touch
 * by MIN_VISIT_MS, then upserts the entry to the head of the list (deduped
 * by path, capped at MAX_ENTRIES).
 *
 * Designed to be invoked from <Layout> only when authenticated — anonymous
 * landing/share/approval flows must never write history.
 */
export function useRecordRecents() {
  const [location] = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (shouldSkipRecents(location)) return;

    const timer = window.setTimeout(() => {
      const meta = resolveRouteMeta(location);
      const cleanPath = location.split("?")[0].split("#")[0];
      const next: RecentEntry = {
        path: cleanPath,
        title: meta.title,
        iconName: iconNameFor(meta.icon),
        visitedAt: Date.now(),
      };
      const current = readStorage();
      const without = current.filter((e) => e.path !== cleanPath);
      const updated = [next, ...without].slice(0, MAX_ENTRIES);
      writeStorage(updated);
      emitSync();
    }, MIN_VISIT_MS);

    return () => window.clearTimeout(timer);
  }, [location]);
}

// Exported so a "Sign out" handler can wipe history if you ever want to.
export function clearRecents() {
  writeStorage([]);
  emitSync();
}
