/**
 * client/src/components/layout-editor/useHistory.ts
 *
 * Undo/redo over immutable `LayoutDoc` snapshots. The pure functions at
 * the top own all the semantics (tested in useHistory.test.ts); the hook
 * is a thin `useReducer` wrapper that also binds the keyboard shortcuts:
 *
 *   Cmd/Ctrl+Z          undo
 *   Cmd/Ctrl+Shift+Z    redo
 *   Ctrl+Y              redo (Windows convention)
 *
 * Snapshots are never mutated — callers always `push` a *new* document
 * object, so `past`/`present`/`future` can share structure freely and a
 * snapshot handed to the save layer stays stable while the request is
 * in flight. `past` is capped at HISTORY_CAP entries (oldest dropped).
 *
 * `reset` replaces the present and clears both stacks: used when the
 * document is (re)loaded from the server, including after a 409.
 * `replace` swaps the present without recording a step: used for
 * transient edits (dragging a vertex) that should only land in history
 * once the gesture ends.
 */

import { useCallback, useEffect, useMemo, useReducer } from "react";

export const HISTORY_CAP = 200;

export interface HistoryState<T> {
  past: readonly T[];
  present: T;
  future: readonly T[];
}

export function createHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [] };
}

/** Record `next` as a new step. A no-op when `next` is the current present. */
export function historyPush<T>(s: HistoryState<T>, next: T, cap = HISTORY_CAP): HistoryState<T> {
  if (next === s.present) return s;
  const past = s.past.length >= cap ? s.past.slice(s.past.length - cap + 1) : s.past;
  return { past: [...past, s.present], present: next, future: [] };
}

export function historyUndo<T>(s: HistoryState<T>): HistoryState<T> {
  if (s.past.length === 0) return s;
  const previous = s.past[s.past.length - 1];
  return { past: s.past.slice(0, -1), present: previous, future: [s.present, ...s.future] };
}

export function historyRedo<T>(s: HistoryState<T>): HistoryState<T> {
  if (s.future.length === 0) return s;
  const [next, ...rest] = s.future;
  return { past: [...s.past, s.present], present: next, future: rest };
}

/** Replace the present without recording a step (transient edits). */
export function historyReplace<T>(s: HistoryState<T>, present: T): HistoryState<T> {
  if (present === s.present) return s;
  return { past: s.past, present, future: s.future };
}

/** New baseline: clears both stacks. */
export function historyReset<T>(s: HistoryState<T>, present: T): HistoryState<T> {
  if (present === s.present && s.past.length === 0 && s.future.length === 0) return s;
  return createHistory(present);
}

export function canUndo<T>(s: HistoryState<T>): boolean {
  return s.past.length > 0;
}

export function canRedo<T>(s: HistoryState<T>): boolean {
  return s.future.length > 0;
}

// ─── Keyboard ───────────────────────────────────────────────────────────────

export type HistoryKeyAction = "undo" | "redo" | null;

export interface HistoryKeyInput {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/** Map a keydown to undo/redo. Pure so the shortcut table is testable. */
export function historyKeyAction(ev: HistoryKeyInput): HistoryKeyAction {
  if (ev.altKey) return null;
  const mod = !!(ev.metaKey || ev.ctrlKey);
  if (!mod) return null;
  const k = ev.key.toLowerCase();
  if (k === "z") return ev.shiftKey ? "redo" : "undo";
  if (k === "y" && ev.ctrlKey && !ev.metaKey) return "redo";
  return null;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

type Action<T> =
  | { type: "push"; next: T }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "replace"; present: T }
  | { type: "reset"; present: T };

function reducer<T>(s: HistoryState<T>, a: Action<T>): HistoryState<T> {
  switch (a.type) {
    case "push":
      return historyPush(s, a.next);
    case "undo":
      return historyUndo(s);
    case "redo":
      return historyRedo(s);
    case "replace":
      return historyReplace(s, a.present);
    case "reset":
      return historyReset(s, a.present);
  }
}

export interface HistoryApi<T> {
  present: T;
  canUndo: boolean;
  canRedo: boolean;
  /** Number of recorded steps behind the present (for a "3 changes" readout). */
  depth: number;
  push(next: T): void;
  undo(): void;
  redo(): void;
  replace(present: T): void;
  reset(present: T): void;
}

export interface UseHistoryOptions {
  /** Bind Cmd/Ctrl+Z / Shift+Z / Ctrl+Y on `window`. Default true. */
  keyboard?: boolean;
  /** Skip the shortcuts while true (a text field has focus, a modal is open). */
  disabled?: boolean;
}

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function useHistory<T>(initial: T, options: UseHistoryOptions = {}): HistoryApi<T> {
  const { keyboard = true, disabled = false } = options;
  const [state, dispatch] = useReducer(reducer as (s: HistoryState<T>, a: Action<T>) => HistoryState<T>, initial, createHistory);

  const push = useCallback((next: T) => dispatch({ type: "push", next }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const replace = useCallback((present: T) => dispatch({ type: "replace", present }), []);
  const reset = useCallback((present: T) => dispatch({ type: "reset", present }), []);

  useEffect(() => {
    if (!keyboard || disabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const action = historyKeyAction(e);
      if (!action) return;
      e.preventDefault();
      if (action === "undo") undo();
      else redo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keyboard, disabled, undo, redo]);

  return useMemo<HistoryApi<T>>(
    () => ({
      present: state.present,
      canUndo: canUndo(state),
      canRedo: canRedo(state),
      depth: state.past.length,
      push,
      undo,
      redo,
      replace,
      reset,
    }),
    [state, push, undo, redo, replace, reset],
  );
}
