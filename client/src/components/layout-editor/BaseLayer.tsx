/**
 * client/src/components/layout-editor/BaseLayer.tsx
 *
 * The customer's floor plan underneath the overlay: an `<img>` for
 * raster uploads, a react-pdf `<Page>` for PDFs. Rendered inside the
 * Viewport's content-space layer, so it draws itself at *natural* size
 * (content pixels) and lets the parent transform handle zoom/pan.
 *
 * Natural size is reported through `onNaturalSize(w, h)` from load
 * callbacks — never read off a ref during render.
 *
 * PDF raster tiers: pdf.js re-rasterises when `<Page width>` changes, so
 * the page is rendered at a tiered, debounced scale and counter-scaled by
 * 1/rasterScale to stay at natural size. Zoom feels instant (the parent
 * transform moves) and sharpness catches up 200 ms after the user settles.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import { pdfOptions } from "./pdfConfig";
import type { Size } from "./viewportMath";

export type BaseSource =
  | {
      kind: "image";
      /** Same-origin blob: URL (fetch the file with credentials first). */
      url: string;
      alt?: string;
    }
  | {
      kind: "pdf";
      /** Same-origin blob: URL — a raw /api/objects URL would 401 inside the worker. */
      url: string;
      pageNumber?: number;
    };

export interface BaseLayerProps {
  source: BaseSource;
  /** Current viewport zoom; drives the PDF raster tier only. */
  zoom: number;
  /** Natural size once known (from `onNaturalSize`); sizes the PDF raster. */
  naturalSize: Size | null;
  onNaturalSize(width: number, height: number): void;
  onError?(error: Error): void;
  /** Total page count, reported once the PDF document loads. */
  onPageCount?(numPages: number): void;
}

/**
 * Tiered raster scale for the PDF page (ported from the previous editor):
 *   zoom ≤ 4   → raster at zoom (pixel-accurate)
 *   4 < z ≤ 12 → raster at 4, CSS-stretch ≤ 3x
 *   z > 12     → raster at 8, CSS-stretch ≤ 5x at zoom 40
 * Caps canvas memory on big A0/A1 sheets while staying sharp enough for
 * barrier placement.
 */
export function computeRasterTier(zoom: number): { rasterScale: number; cssOvershoot: number } {
  if (!(zoom > 0)) return { rasterScale: 1, cssOvershoot: 1 };
  if (zoom <= 4) return { rasterScale: zoom, cssOvershoot: 1 };
  const rasterScale = zoom <= 12 ? 4 : 8;
  return { rasterScale, cssOvershoot: zoom / rasterScale };
}

/** Delay before re-rasterising after the zoom last changed. */
export const RASTER_DEBOUNCE_MS = 200;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

const layerStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  pointerEvents: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
};

function ImageBase({ source, onNaturalSize, onError }: { source: Extract<BaseSource, { kind: "image" }> } & Pick<BaseLayerProps, "onNaturalSize" | "onError">) {
  return (
    <img
      src={source.url}
      alt={source.alt ?? ""}
      draggable={false}
      decoding="async"
      style={{ ...layerStyle, display: "block", width: "auto", height: "auto", maxWidth: "none" }}
      onLoad={(e) => onNaturalSize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
      onError={() => onError?.(new Error("Failed to load image"))}
      data-testid="layout-base-image"
    />
  );
}

function PdfBase({
  source,
  zoom,
  naturalSize,
  onNaturalSize,
  onError,
  onPageCount,
}: { source: Extract<BaseSource, { kind: "pdf" }> } & Omit<BaseLayerProps, "source">) {
  const pageNumber = source.pageNumber ?? 1;
  const debouncedZoom = useDebounced(zoom, RASTER_DEBOUNCE_MS);
  const { rasterScale } = useMemo(() => computeRasterTier(debouncedZoom), [debouncedZoom]);

  // Boost DPR when the raster scale is tiny so 0.1–0.3 mm CAD lines don't
  // fade to sub-pixel grey on a fit-to-window of a big sheet.
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const devicePixelRatio = Math.min(4, Math.max(dpr, 1 / Math.max(0.15, rasterScale)));

  const reported = useRef<string | null>(null);
  const handlePageLoad = useCallback(
    (page: { originalWidth: number; originalHeight: number }) => {
      const key = `${page.originalWidth}x${page.originalHeight}`;
      if (reported.current === key) return;
      reported.current = key;
      onNaturalSize(page.originalWidth, page.originalHeight);
    },
    [onNaturalSize],
  );
  useEffect(() => {
    reported.current = null;
  }, [source.url, pageNumber]);

  const width = naturalSize ? naturalSize.width * rasterScale : undefined;
  const height = naturalSize ? naturalSize.height * rasterScale : undefined;

  return (
    <div style={layerStyle} data-testid="layout-base-pdf">
      <Document
        file={source.url}
        options={pdfOptions}
        loading={null}
        error={null}
        onLoadError={(err) => onError?.(err)}
        onLoadSuccess={(pdf) => onPageCount?.(pdf.numPages)}
      >
        {/* Counter-scale the raster so the page occupies natural size in content space. */}
        <div
          style={{
            transform: `scale(${1 / rasterScale})`,
            transformOrigin: "0 0",
            width,
            height,
          }}
        >
          <Page
            /* Key only on the page, never on scale: a remount mid-render
             * leaves pdf.js' canvas hidden and the drawing blank. */
            key={`page-${pageNumber}`}
            pageNumber={pageNumber}
            width={width}
            devicePixelRatio={devicePixelRatio}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            renderMode="canvas"
            canvasBackground="white"
            loading={null}
            error={null}
            onLoadSuccess={handlePageLoad}
            onLoadError={(err) => onError?.(err)}
            onRenderError={(err) => onError?.(err)}
          />
        </div>
      </Document>
    </div>
  );
}

export const BaseLayer = memo(function BaseLayer(props: BaseLayerProps) {
  if (props.source.kind === "image") {
    return <ImageBase source={props.source} onNaturalSize={props.onNaturalSize} onError={props.onError} />;
  }
  return <PdfBase {...props} source={props.source} />;
});
