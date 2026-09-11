/**
 * client/src/components/layout-editor/useViewport.ts
 *
 * React state wrapper around `viewportMath`. Every mutation is a pure
 * function of the previous state, so the gesture engine, toolbar buttons
 * and keyboard shortcuts can all call these without stale-closure risk:
 * `getState()` reads the latest committed state synchronously (kept in a
 * ref, updated inside the setter, never during render).
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { Pt } from "@shared/layout/doc";
import {
  IDENTITY_VIEWPORT,
  MAX_ZOOM,
  MIN_ZOOM,
  fitToContent as fitToContentPure,
  panBy as panByPure,
  setZoomClamped as setZoomClampedPure,
  toContent as toContentPure,
  toScreen as toScreenPure,
  zoomAt as zoomAtPure,
  type Size,
  type ViewportState,
} from "./viewportMath";

export { MIN_ZOOM, MAX_ZOOM };
export type { ViewportState, Size };

export interface ViewportApi extends ViewportState {
  /** Last container size reported via `setContainerSize` (0×0 until measured). */
  containerSize: Size;
  setContainerSize(width: number, height: number): void;
  /** Fit `contentW×contentH` inside the container, centred, with screen-px padding. */
  fitToContent(contentW: number, contentH: number, containerW: number, containerH: number, padding?: number): void;
  /** Multiply zoom by `factor`, keeping the content under `screenPt` fixed. */
  zoomAt(screenPt: Pt, factor: number): void;
  panBy(dx: number, dy: number): void;
  toContent(screenPt: Pt): Pt;
  toScreen(contentPt: Pt): Pt;
  /** Absolute zoom, clamped to [MIN_ZOOM, MAX_ZOOM]; anchors on the container centre by default. */
  setZoomClamped(zoom: number, anchorScreen?: Pt): void;
  setState(next: ViewportState): void;
  /** Latest committed state, safe to read inside event handlers and rAF loops. */
  getState(): ViewportState;
}

export function useViewport(initial: ViewportState = IDENTITY_VIEWPORT): ViewportApi {
  const [state, setStateRaw] = useState<ViewportState>(initial);
  const stateRef = useRef<ViewportState>(initial);
  const [containerSize, setContainerSizeState] = useState<Size>({ width: 0, height: 0 });
  const containerRef = useRef<Size>({ width: 0, height: 0 });

  const commit = useCallback((next: ViewportState) => {
    if (next === stateRef.current) return;
    stateRef.current = next;
    setStateRaw(next);
  }, []);

  const getState = useCallback(() => stateRef.current, []);

  const setContainerSize = useCallback((width: number, height: number) => {
    const cur = containerRef.current;
    if (cur.width === width && cur.height === height) return;
    containerRef.current = { width, height };
    setContainerSizeState(containerRef.current);
  }, []);

  const fitToContent = useCallback(
    (contentW: number, contentH: number, containerW: number, containerH: number, padding = 0) => {
      commit(fitToContentPure(contentW, contentH, containerW, containerH, padding));
    },
    [commit],
  );

  const zoomAt = useCallback(
    (screenPt: Pt, factor: number) => commit(zoomAtPure(stateRef.current, screenPt, factor)),
    [commit],
  );

  const panBy = useCallback((dx: number, dy: number) => commit(panByPure(stateRef.current, dx, dy)), [commit]);

  const toContent = useCallback((screenPt: Pt) => toContentPure(stateRef.current, screenPt), []);
  const toScreen = useCallback((contentPt: Pt) => toScreenPure(stateRef.current, contentPt), []);

  const setZoomClamped = useCallback(
    (zoom: number, anchorScreen?: Pt) => {
      const anchor = anchorScreen ?? { x: containerRef.current.width / 2, y: containerRef.current.height / 2 };
      commit(setZoomClampedPure(stateRef.current, zoom, anchor));
    },
    [commit],
  );

  return useMemo<ViewportApi>(
    () => ({
      zoom: state.zoom,
      tx: state.tx,
      ty: state.ty,
      containerSize,
      setContainerSize,
      fitToContent,
      zoomAt,
      panBy,
      toContent,
      toScreen,
      setZoomClamped,
      setState: commit,
      getState,
    }),
    [state, containerSize, setContainerSize, fitToContent, zoomAt, panBy, toContent, toScreen, setZoomClamped, commit, getState],
  );
}
