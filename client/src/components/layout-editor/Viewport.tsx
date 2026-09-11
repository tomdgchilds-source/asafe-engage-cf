/**
 * client/src/components/layout-editor/Viewport.tsx
 *
 * The scrollable/zoomable stage. Owns the container element the gesture
 * engine binds to, measures it with a ResizeObserver, fits the base
 * drawing on first load (and on the `0` key), and renders two layers:
 *
 *   - content layer: `translate(tx, ty) scale(zoom)` — the BaseLayer plus
 *     `children` (the SVG overlay) drawn in content coordinates;
 *   - screen layer: `hud`, drawn in screen coordinates on top (readouts,
 *     floating buttons) and not transformed.
 *
 * The viewport state itself lives in the caller's `useViewport()` so the
 * toolbar's zoom buttons and the editor's tools share it.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BaseLayer, type BaseSource } from "./BaseLayer";
import { useGestures, type GestureHandlers, type GestureState, type UseGesturesOptions } from "./useGestures";
import type { ViewportApi } from "./useViewport";
import type { Size } from "./viewportMath";

export interface ViewportProps {
  viewport: ViewportApi;
  /** Null while the file is still being fetched (a spinner can go in `hud`). */
  base: BaseSource | null;
  handlers?: GestureHandlers;
  panMode?: boolean;
  /** Passed through to useGestures. */
  gestureOptions?: Omit<UseGesturesOptions, "panMode">;
  /** Screen px kept clear around the drawing when fitting (default 24). */
  fitPadding?: number;
  onNaturalSize?(width: number, height: number): void;
  onBaseError?(error: Error): void;
  onPageCount?(numPages: number): void;
  /** Called with the live gesture state so the owner can pick a cursor / show hints. */
  onGestureState?(state: GestureState): void;
  className?: string;
  style?: CSSProperties;
  /** Rendered in content coordinates above the base drawing (the overlay). */
  children?: ReactNode;
  /** Rendered in screen coordinates above everything. */
  hud?: ReactNode;
}

export interface ViewportHandle {
  /** Fit the base drawing to the container (same as pressing `0`). */
  fit(): void;
  naturalSize: Size | null;
  element: HTMLDivElement | null;
}

const DEFAULT_FIT_PADDING = 24;

export const Viewport = forwardRef<ViewportHandle, ViewportProps>(function Viewport(
  {
    viewport,
    base,
    handlers,
    panMode = false,
    gestureOptions,
    fitPadding = DEFAULT_FIT_PADDING,
    onNaturalSize,
    onBaseError,
    onPageCount,
    onGestureState,
    className,
    style,
    children,
    hud,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [naturalSize, setNaturalSize] = useState<Size | null>(null);
  const hasFitted = useRef(false);

  // Forget the natural size when the base changes so we refit for the new file.
  const baseKey = base ? `${base.kind}:${base.url}:${base.kind === "pdf" ? base.pageNumber ?? 1 : ""}` : "";
  useEffect(() => {
    setNaturalSize(null);
    hasFitted.current = false;
  }, [baseKey]);

  // Container size → viewport (ResizeObserver, so a dialog that finishes
  // animating open after the drawing loaded still fits correctly).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      viewport.setContainerSize(r.width, r.height);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // setContainerSize is stable; re-running on every viewport change would thrash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.setContainerSize]);

  const fit = useCallback(() => {
    const { width, height } = viewport.containerSize;
    if (!naturalSize || !(width > 0) || !(height > 0)) return;
    viewport.fitToContent(naturalSize.width, naturalSize.height, width, height, fitPadding);
    hasFitted.current = true;
  }, [viewport, naturalSize, fitPadding]);

  // First fit: as soon as both the drawing's natural size and a real
  // container size are known.
  useEffect(() => {
    if (hasFitted.current) return;
    fit();
  }, [fit, viewport.containerSize.width, viewport.containerSize.height, naturalSize]);

  const handleNaturalSize = useCallback(
    (width: number, height: number) => {
      if (!(width > 0) || !(height > 0)) return;
      setNaturalSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
      onNaturalSize?.(width, height);
    },
    [onNaturalSize],
  );

  const gestureHandlers: GestureHandlers = {
    ...handlers,
    onFit: () => {
      fit();
      handlers?.onFit?.();
    },
  };

  const gestureState = useGestures(containerRef, viewport, gestureHandlers, { ...gestureOptions, panMode });

  useEffect(() => {
    onGestureState?.(gestureState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gestureState.active, gestureState.spaceHeld]);

  useImperativeHandle(ref, () => ({ fit, naturalSize, element: containerRef.current }), [fit, naturalSize]);

  const cursor =
    gestureState.active === "pan" || gestureState.active === "pinch"
      ? "grabbing"
      : gestureState.spaceHeld || panMode
        ? "grab"
        : undefined;

  const { zoom, tx, ty } = viewport;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label="Layout drawing"
      className={className}
      data-testid="layout-viewport"
      style={{
        position: "relative",
        overflow: "hidden",
        outline: "none",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        WebkitTapHighlightColor: "transparent",
        overscrollBehavior: "none",
        cursor,
        ...style,
      }}
    >
      <div
        data-testid="layout-content-layer"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: naturalSize?.width ?? 0,
          height: naturalSize?.height ?? 0,
          transform: `translate3d(${tx}px, ${ty}px, 0) scale(${zoom})`,
          transformOrigin: "0 0",
          willChange: "transform",
          pointerEvents: "none",
        }}
      >
        {base && (
          <BaseLayer
            source={base}
            zoom={zoom}
            naturalSize={naturalSize}
            onNaturalSize={handleNaturalSize}
            onError={onBaseError}
            onPageCount={onPageCount}
          />
        )}
        {children}
      </div>
      {hud && (
        <div data-testid="layout-hud" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {hud}
        </div>
      )}
    </div>
  );
});
