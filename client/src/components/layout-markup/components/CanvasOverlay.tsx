import { useEffect, useMemo, useState } from "react";
import { Document, Page } from 'react-pdf';
import { Button } from "@/components/ui/button";
import { X, Pen, Wand2, Move, Trash2, ShoppingCart } from "lucide-react";
import { pdfOptions } from "../constants";
import { generatePathString, parsePathData } from "../utils";
import { computeBarrierSymbol } from "@/utils/barrierSymbol";
import type { CartItem, DrawingPoint, MarkupPath, LayoutMarkup } from "../types";

/**
 * Tiered raster scale for the PDF <Page>.
 *
 * With `useOnlyCssZoom: false`, pdf.js re-rasterises the page every
 * time the <Page width> prop changes. That keeps strokes crisp at any
 * zoom — but re-rastering a big A0/A1 CAD sheet at 40× would blow past
 * 1GB of canvas memory on a low-end tablet. So we tier:
 *
 *   zoom ≤ 4   → raster at the actual zoom (pixel-accurate, 0-4×
 *                range covers the overwhelming majority of sessions)
 *   4 < z ≤ 12 → raster at 4×, CSS-scale the fractional overshoot
 *                by (z/4) → gives ~3× CSS stretch which stays visually
 *                acceptable up to 12× zoom
 *   z > 12    → raster at 8×, CSS-scale the rest (max 5× stretch at
 *                zoom 40) — still sharp enough for barrier placement,
 *                and caps raster memory at 4× the base-fit canvas
 *
 * Returns { rasterScale, cssOvershoot } where the <Page> uses
 * rasterScale and the wrapper <div> uses transform:scale(cssOvershoot).
 */
function computeRasterTier(zoom: number): { rasterScale: number; cssOvershoot: number } {
  if (zoom <= 4) {
    return { rasterScale: zoom, cssOvershoot: 1 };
  }
  if (zoom <= 12) {
    const rasterScale = Math.min(zoom, 4);
    return { rasterScale, cssOvershoot: zoom / rasterScale };
  }
  const rasterScale = Math.min(zoom, 8);
  return { rasterScale, cssOvershoot: zoom / rasterScale };
}

interface CanvasOverlayProps {
  // Drawing metadata
  drawing: { id: string; fileName: string; fileUrl: string; fileType?: string; drawingType?: string };
  isImageFile: boolean;
  isBlankCanvas: boolean;
  /** DWG / DXF — shown as a download placeholder instead of rendered. */
  isDwgFile?: boolean;

  // Refs
  imageRef: React.RefObject<HTMLImageElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  pdfContainerRef: React.RefObject<HTMLDivElement>;

  // Image/blob state
  imageBlobUrl: string | null;
  /** Same-origin blob URL for the fetched PDF. Blob URLs sidestep the
   * DataCloneError that typed-array inputs cause on re-render (react-pdf
   * transfers typed arrays to its worker, detaching the main-thread buffer).
   */
  pdfBlobUrl?: string | null;
  isImageLoading: boolean;
  isPdfLoading: boolean;

  // Transform state
  imagePosition: { x: number; y: number };
  zoomLevel: number;
  pdfScale: number;
  pdfDimensions: { width: number; height: number };
  pdfPageNumber: number;
  pdfNumPages: number;

  // Drawing state
  currentPath: MarkupPath | null;
  pendingPath: MarkupPath | null;
  markups: LayoutMarkup[];
  isInDrawMode: boolean;
  isPanMode: boolean;
  isShiftHeld: boolean;
  isDragging: boolean;
  isMiddleMouseDown: boolean;
  isHighQualityRender: boolean;

  // Rendering view mode for barrier markups. "technical" renders the
  // scale-accurate post + rail top view; "schematic" renders the legacy
  // flat polyline.
  viewMode: "technical" | "schematic";
  /** Pixels per mm for the calibrated drawing. Null/0 falls back to schematic. */
  drawingScale: number | null;
  /** Cart items used as a fallback for resolving a markup's product name. */
  cartItems: CartItem[];

  // Scale calibration state
  isSettingScale: boolean;
  scaleStartPoint: DrawingPoint | null;
  scaleEndPoint: DrawingPoint | null;
  scaleTempEndPoint: DrawingPoint | null;

  // Markup interaction state
  invalidMarkups: Set<string>;
  selectedMarkupId: string | null;
  setSelectedMarkupId: (id: string | null) => void;
  showMarkupMenu: boolean;
  setShowMarkupMenu: (show: boolean) => void;
  markupMenuPosition: { x: number; y: number };
  setMarkupMenuPosition: (pos: { x: number; y: number }) => void;
  isRepositioning: boolean;
  setIsRepositioning: (repositioning: boolean) => void;
  setRepositionMarkupId: (id: string | null) => void;

  // Rendering functions
  getStrokeWidth: (base: number) => number;
  /**
   * Scale-aware stroke width for markups that carry a real-world
   * productWidthMm. Returns null when not resolvable (no product, no
   * scale calibration) — render falls back to getStrokeWidth.
   */
  getProductStrokeWidth: (
    markup: { productWidthMm?: number | null } | null | undefined,
  ) => number | null;
  getPointRadius: (base: number) => number;
  getMarkerRadius: (base: number) => number;
  getMarkerFontSize: (base: number) => number;
  getMarkerStrokeWidth: (base: number) => number;
  getProductColor: (cartItemId: string) => string;

  /**
   * Width (mm) of the product the designer is currently drawing with.
   * Used so the live `currentPath` preview renders at the correct
   * physical width before the markup is saved.
   */
  activeProductWidthMm?: number | null;

  // Event handlers
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
  handleWheel: (e: React.WheelEvent) => void;

  // Callbacks
  onImageLoad: () => void;
  onImageError: (error: any) => void;
  onPdfLoadSuccess: (pdf: any) => void;
  onPdfError: (error: any) => void;
  setPdfPageNumber: (page: number) => void;
  onDeleteClick: (id: string) => void;
  onRepositionStart: (markupId: string) => void;
  toast: (opts: any) => void;
}

export function CanvasOverlay({
  drawing,
  isImageFile,
  isBlankCanvas,
  isDwgFile,
  imageRef,
  containerRef,
  pdfContainerRef,
  imageBlobUrl,
  pdfBlobUrl,
  isImageLoading,
  isPdfLoading,
  imagePosition,
  zoomLevel,
  pdfScale,
  pdfDimensions,
  pdfPageNumber,
  pdfNumPages,
  currentPath,
  pendingPath,
  markups,
  isInDrawMode,
  isPanMode,
  isShiftHeld,
  isDragging,
  isMiddleMouseDown,
  isHighQualityRender,
  viewMode,
  drawingScale,
  cartItems,
  isSettingScale,
  scaleStartPoint,
  scaleEndPoint,
  scaleTempEndPoint,
  invalidMarkups,
  selectedMarkupId,
  setSelectedMarkupId,
  showMarkupMenu,
  setShowMarkupMenu,
  markupMenuPosition,
  setMarkupMenuPosition,
  isRepositioning,
  setIsRepositioning,
  setRepositionMarkupId,
  getStrokeWidth,
  getProductStrokeWidth,
  activeProductWidthMm,
  getPointRadius,
  getMarkerRadius,
  getMarkerFontSize,
  getMarkerStrokeWidth,
  getProductColor,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  handleWheel,
  onImageLoad,
  onImageError,
  onPdfLoadSuccess,
  onPdfError,
  setPdfPageNumber,
  onDeleteClick,
  onRepositionStart,
  toast,
}: CanvasOverlayProps) {
  // Pre-parse + pre-compute the Technical-view top-view symbol for every
  // markup. Each markup's points are a flat array inside pathData, which
  // parsePathData already returns — memoise so we don't re-parse-and-compute
  // on every unrelated re-render (pan, zoom, selection, hover state). The
  // cartItems dependency is for the productName fallback lookup.
  const markupSymbols = useMemo(() => {
    return markups.map((markup) => {
      const points = parsePathData(markup);
      const productName =
        (markup as any).productName ??
        cartItems.find((ci) => ci.id === markup.cartItemId)?.productName ??
        null;
      const symbol =
        viewMode === "technical" && productName && drawingScale
          ? computeBarrierSymbol(points, drawingScale, productName)
          : null;
      return { points, symbol };
    });
    // markups itself is the identity we key on — React Query returns a new
    // array on refetch, and the user's in-session edits also produce a new
    // array. viewMode / drawingScale / cartItems all force a recompute too.
  }, [markups, viewMode, drawingScale, cartItems]);

  // Debounced raster scale: wheel scroll fires 30+ events/sec, and each
  // re-raster cancels the last mid-render. Keep a live CSS-only preview
  // tracking the user's zoom, and only push a new pdf.js raster after
  // 200ms of no new zoom events. Pan feels instant; crispness catches up.
  const [debouncedPdfScale, setDebouncedPdfScale] = useState(pdfScale);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPdfScale(pdfScale);
    }, 200);
    return () => clearTimeout(timer);
  }, [pdfScale]);

  // Debounced tier drives the actual raster <Page scale> so pdf.js only
  // re-rasterises once the user settles. The live zoom (pdfScale) drives
  // the CSS overshoot on the wrapper below, so the user's zoom still
  // feels instant even if pdf.js is mid-raster.
  const rasterTier = useMemo(() => computeRasterTier(debouncedPdfScale), [debouncedPdfScale]);

  // The rendered-canvas pixel dimensions (what pdf.js actually paints)
  // are pdfDimensions × rasterTier.rasterScale. To keep on-screen size
  // aligned with the user's current zoom, we CSS-scale the Page canvas
  // by (pdfScale / rasterTier.rasterScale). When user and raster tiers
  // match, this is exactly 1 and no CSS scaling is applied.
  const pdfCssOvershoot = pdfScale / rasterTier.rasterScale;

  return (
    <div className="flex-1 relative bg-gray-50 dark:bg-gray-800 overflow-hidden">
      <div
        ref={containerRef}
        className="w-full h-full relative overflow-hidden select-none drawing-canvas-container no-overscroll"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          cursor: isInDrawMode && !isPanMode && !isShiftHeld ? 'crosshair' :
                  isDragging || isPanMode || isShiftHeld || isMiddleMouseDown ? 'grabbing' : 'grab',
          touchAction: 'none',
          position: 'relative',
          zIndex: 1,
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          perspective: 1000,
          WebkitPerspective: 1000,
          willChange: 'transform',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          WebkitTapHighlightColor: 'transparent'
        } as React.CSSProperties}
      >
        {/* DWG / DXF — placeholder with download + guidance. Full
            in-browser DWG rendering needs a wasm viewer or Autodesk APS
            translation, so for now we store the file verbatim and tell
            the user to export a PDF / PNG for interactive markup. */}
        {isDwgFile ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-800 p-8">
            <div className="max-w-md text-center space-y-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm">
              <div className="mx-auto w-14 h-14 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-7 h-7 text-yellow-600" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h10l6 6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M14 4v6h6"/></svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  AutoCAD DWG / DXF file
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  <code className="font-mono text-xs">{drawing.fileName}</code>
                </p>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                The file is safely stored on this project. To mark barrier placements
                interactively, please export the drawing from AutoCAD as a <strong>PDF</strong> or
                <strong> PNG</strong> and upload that version.
              </p>
              <a
                href={drawing.fileUrl}
                download={drawing.fileName}
                className="inline-flex items-center gap-2 bg-primary text-black font-semibold px-4 py-2 rounded hover:bg-yellow-400 text-sm"
                data-testid="download-dwg"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>
                Download original
              </a>
            </div>
          </div>
        ) : (isImageFile || isBlankCanvas) ? (
          imageBlobUrl ? (
            <img
              ref={imageRef as React.RefObject<HTMLImageElement>}
              src={imageBlobUrl}
              alt={drawing.fileName}
              className="absolute pointer-events-none layout-drawing-image"
              style={{
                left: 0,
                top: 0,
                transform: `translate3d(${imagePosition.x}px, ${imagePosition.y}px, 0) scale(${zoomLevel})`,
                WebkitTransform: `translate3d(${imagePosition.x}px, ${imagePosition.y}px, 0) scale(${zoomLevel})`,
                transformOrigin: '0 0',
                WebkitTransformOrigin: '0 0',
                width: 'auto',
                height: 'auto',
                maxWidth: 'none',
                imageRendering: '-webkit-optimize-contrast' as any,
                willChange: 'transform',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
              onLoad={onImageLoad}
              onError={onImageError}
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">Loading image...</p>
              </div>
            </div>
          )
        ) : (
          <div
            ref={pdfContainerRef}
            className="w-full h-full relative"
            style={{
              transform: `translate(${imagePosition.x}px, ${imagePosition.y}px)`,
              transformOrigin: '0 0',
            }}
          >
            {/* Wait for the credentials-aware fetch to produce a blob URL
                before handing to react-pdf. Passing the raw /api/objects/
                URL would 401 inside react-pdf's worker; passing a typed
                array would DataCloneError on any re-render. A blob: URL
                is the only path that survives both. */}
            {!pdfBlobUrl ? (
              <div className="flex items-center justify-center h-full w-full bg-gray-100 dark:bg-gray-800">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Loading PDF...</p>
                </div>
              </div>
            ) : (
            <Document
              file={pdfBlobUrl}
              onLoadSuccess={onPdfLoadSuccess}
              onLoadError={onPdfError}
              options={pdfOptions}
              className="drawing-canvas"
            >
              {/* Wrap the <Page> so we can CSS-scale the rastered canvas
               * to match the user's current zoom without remounting the
               * page. When liveTier.rasterScale matches the debounced
               * rasterTier.rasterScale AND the raw zoom, overshoot is 1
               * and the canvas is shown at its native size.
               *
               * During active zoom: the raster stays at the debounced
               * scale (so we aren't re-rasterising 30×/sec), and the CSS
               * overshoot animates live → zoom feels instant, then sharpens
               * when the user stops. */}
              <div
                style={{
                  transform: `scale(${pdfCssOvershoot})`,
                  transformOrigin: '0 0',
                  width: `${pdfDimensions.width * rasterTier.rasterScale}px`,
                  height: `${pdfDimensions.height * rasterTier.rasterScale}px`,
                }}
              >
              <Page
                /* NEVER key on pdfScale — that forces a remount on every
                 * scale change and pdf.js leaves the canvas with
                 * visibility:hidden while it re-renders. With a
                 * ResizeObserver constantly nudging pdfScale to fit the
                 * viewport, the Page ends up permanently hidden and the
                 * drawing appears blank. Key only on the actual page
                 * number so we remount only when the user navigates. */
                key={`page-${pdfPageNumber}`}
                pageNumber={pdfPageNumber}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                renderMode="canvas"
                /* rasterTier.rasterScale is the tiered (and debounced)
                 * raster resolution — NOT the user's raw zoom. pdf.js
                 * re-rasterises when this changes, so we only push a new
                 * value after 200ms of zoom idle. For zoom ≤ 4 this is
                 * identical to pdfScale (pixel-accurate); past 4 the CSS
                 * overshoot on the wrapper covers the rest. */
                width={pdfDimensions.width * rasterTier.rasterScale}
                /* Boost the rendering-DPR when the fit scale is small
                 * so thin CAD lines (0.1–0.3mm) stay visible. On a
                 * fit-to-window of a big A0/A1 sheet pdfScale can be
                 * ~0.05, and a 2x DPR renders those lines sub-pixel
                 * — the entire drawing fades to near-white 240-grey.
                 * At higher rasterScales we don't need the DPR boost,
                 * because the base raster is already high-res. */
                devicePixelRatio={Math.min(4, Math.max(window.devicePixelRatio || 1, 1 / Math.max(0.15, rasterTier.rasterScale)))}
                canvasBackground="white"
                loading={
                  <div className="flex items-center justify-center h-full w-full bg-gray-100 dark:bg-gray-800">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto mb-2"></div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Loading PDF...</p>
                    </div>
                  </div>
                }
                error={
                  <div className="flex items-center justify-center h-full w-full bg-red-50 dark:bg-red-900/20">
                    <div className="text-center text-red-600 dark:text-red-400">
                      <p className="text-sm">Failed to load PDF page</p>
                    </div>
                  </div>
                }
              />
              </div>
            </Document>
            )}
          </div>
        )}

        {/* SVG Drawing Overlay */}
        <svg
          className="absolute"
          style={(isImageFile || isBlankCanvas) ? {
            left: 0,
            top: 0,
            width: imageRef.current ? `${(imageRef.current as HTMLImageElement).naturalWidth}px` : '100%',
            height: imageRef.current ? `${(imageRef.current as HTMLImageElement).naturalHeight}px` : '100%',
            transform: `translate3d(${imagePosition.x}px, ${imagePosition.y}px, 0) scale(${zoomLevel})`,
            WebkitTransform: `translate3d(${imagePosition.x}px, ${imagePosition.y}px, 0) scale(${zoomLevel})`,
            transformOrigin: '0 0',
            WebkitTransformOrigin: '0 0',
            zIndex: 10,
            pointerEvents: 'none'
          } : {
            left: 0,
            top: 0,
            // Match the Page's actual render size (pdfDimensions in PDF
            // points × pdfScale) so the SVG markup overlay lines up with
            // the rendered canvas exactly.
            width: `${pdfDimensions.width * pdfScale}px`,
            height: `${pdfDimensions.height * pdfScale}px`,
            transform: `translate3d(${imagePosition.x}px, ${imagePosition.y}px, 0)`,
            WebkitTransform: `translate3d(${imagePosition.x}px, ${imagePosition.y}px, 0)`,
            transformOrigin: '0 0',
            WebkitTransformOrigin: '0 0',
            zIndex: 10,
            pointerEvents: 'none'
          }}
          viewBox={(isImageFile || isBlankCanvas) ?
            `0 0 ${(imageRef.current as HTMLImageElement)?.naturalWidth || 4000} ${(imageRef.current as HTMLImageElement)?.naturalHeight || 4000}` :
            `0 0 ${pdfDimensions.width} ${pdfDimensions.height}`}
          preserveAspectRatio="none"
        >
          {/* Scale calibration line - real-time preview */}
          {isSettingScale && scaleStartPoint && !scaleEndPoint && (
            <g>
              <circle
                cx={scaleStartPoint.x}
                cy={scaleStartPoint.y}
                r={getPointRadius(10)}
                fill="#10B981"
                stroke="white"
                strokeWidth={getStrokeWidth(2)}
              />
              {scaleTempEndPoint && (
                <>
                  <line
                    x1={scaleStartPoint.x}
                    y1={scaleStartPoint.y}
                    x2={scaleTempEndPoint.x}
                    y2={scaleTempEndPoint.y}
                    stroke="#10B981"
                    strokeWidth={getStrokeWidth(2)}
                    strokeDasharray="3 2"
                    opacity={0.7}
                  />
                  <circle
                    cx={scaleTempEndPoint.x}
                    cy={scaleTempEndPoint.y}
                    r={getPointRadius(8)}
                    fill="#10B981"
                    stroke="white"
                    strokeWidth={getStrokeWidth(1.5)}
                    opacity={0.7}
                  />
                </>
              )}
            </g>
          )}

          {scaleStartPoint && scaleEndPoint && (
            <g>
              <line
                x1={scaleStartPoint.x}
                y1={scaleStartPoint.y}
                x2={scaleEndPoint.x}
                y2={scaleEndPoint.y}
                stroke="#10B981"
                strokeWidth={getStrokeWidth(3)}
                strokeDasharray="5 3"
              />
              <circle
                cx={scaleStartPoint.x}
                cy={scaleStartPoint.y}
                r={getPointRadius(10)}
                fill="#10B981"
                stroke="white"
                strokeWidth={getStrokeWidth(2)}
              />
              <circle
                cx={scaleEndPoint.x}
                cy={scaleEndPoint.y}
                r={getPointRadius(10)}
                fill="#10B981"
                stroke="white"
                strokeWidth={getStrokeWidth(2)}
              />
            </g>
          )}

          {/* Existing markup paths */}
          {markups.map((markup, index) => {
            const { points, symbol } = markupSymbols[index];
            const color = markup.cartItemId ? getProductColor(markup.cartItemId) : '#6B7280';
            const pathString = generatePathString(points);

            return (
              <g key={markup.id}>
                {symbol ? (
                  <>
                    {/* Rails first so posts sit on top. Each rail is
                        a rectangle rotated to the segment's angle and
                        trimmed at its ends to the post circumference. */}
                    {symbol.rails.map((r, ri) => {
                      const dx = r.x2 - r.x1;
                      const dy = r.y2 - r.y1;
                      const len = Math.hypot(dx, dy);
                      if (len < 0.1) return null;
                      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                      const mx = (r.x1 + r.x2) / 2;
                      const my = (r.y1 + r.y2) / 2;
                      return (
                        <rect
                          key={ri}
                          x={mx - len / 2}
                          y={my - r.widthPx / 2}
                          width={len}
                          height={r.widthPx}
                          fill={r.colour}
                          stroke="#000"
                          strokeWidth={0.6}
                          transform={`rotate(${angle} ${mx} ${my})`}
                          opacity={0.95}
                        />
                      );
                    })}
                    {symbol.posts.map((p, pi) => (
                      <circle
                        key={pi}
                        cx={p.x}
                        cy={p.y}
                        r={p.radiusPx}
                        fill={p.colour}
                        stroke="#000"
                        strokeWidth={0.6}
                      />
                    ))}
                    {/* Hover label: family + total length + post / rail counts */}
                    <title>
                      {`${symbol.spec.family} · ${(symbol.totalLengthMm / 1000).toFixed(2)} m · ${symbol.postCount} posts · ${symbol.railCount} rails`}
                    </title>
                  </>
                ) : (() => {
                  // Scale-aware stroke when the markup carries a real
                  // product width AND the drawing is calibrated. Falls
                  // back to the legacy fixed-pixel stroke otherwise so
                  // pre-calibration freehand drawings still render.
                  const productStroke = getProductStrokeWidth(
                    markup as { productWidthMm?: number | null },
                  );
                  const strokeWidth =
                    productStroke ?? getStrokeWidth(isBlankCanvas ? 2.5 : 2.0);
                  const isPhysicalWidth = productStroke !== null;

                  return (
                    <path
                      d={pathString}
                      stroke={invalidMarkups.has(markup.id) ? '#EF4444' : color}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                      // Physical-width bands read better slightly more
                      // translucent — the viewer sees the CAD linework
                      // underneath the barrier band rather than a
                      // fully-opaque yellow slab.
                      opacity={
                        isPhysicalWidth
                          ? 0.7
                          : isBlankCanvas
                            ? 0.85
                            : isHighQualityRender
                              ? 1
                              : 0.8
                      }
                      style={{
                        filter: isBlankCanvas
                          ? 'drop-shadow(0 1px 2px rgba(0,0,50,0.3)) drop-shadow(0 0 1px rgba(0,0,100,0.2))'
                          : invalidMarkups.has(markup.id)
                            ? 'drop-shadow(0 0 2px rgba(239,68,68,0.8))'
                            : 'drop-shadow(0 0 1px rgba(0,0,0,0.6))'
                      }}
                    />
                  );
                })()}
                {points.length > 0 && (
                  <g
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isRepositioning) return;
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      setSelectedMarkupId(markup.id);
                      setMarkupMenuPosition({
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top
                      });
                      setShowMarkupMenu(true);
                    }}
                    style={{ cursor: isRepositioning ? 'default' : 'pointer' }}
                  >
                    <circle
                      cx={points[0].x}
                      cy={points[0].y}
                      r={getMarkerRadius(selectedMarkupId === markup.id ? 20 : 16)}
                      fill={invalidMarkups.has(markup.id) ? '#EF4444' : (selectedMarkupId === markup.id ? '#EF4444' : color)}
                      stroke="white"
                      strokeWidth={getMarkerStrokeWidth(selectedMarkupId === markup.id ? 2 : 1.5)}
                    />
                    <text
                      x={points[0].x}
                      y={points[0].y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="white"
                      fontSize={getMarkerFontSize(16)}
                      fontWeight="bold"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {markups.length - index}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Current drawing path - real-time feedback. When the
              designer is drawing with a calibrated scale + a known
              product width we render the live preview at its real
              physical size, so what they see IS what they'll get. */}
          {currentPath && currentPath.points.length > 1 && (() => {
            const liveProductStroke = getProductStrokeWidth(
              activeProductWidthMm
                ? { productWidthMm: activeProductWidthMm }
                : null,
            );
            const liveStrokeWidth =
              liveProductStroke ?? getStrokeWidth(isBlankCanvas ? 2.8 : 2.0);
            const isPhysicalWidth = liveProductStroke !== null;
            return (
            <path
              d={generatePathString(currentPath.points)}
              stroke={currentPath.color || '#FF0000'}
              strokeWidth={liveStrokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              style={{
                filter: isBlankCanvas
                  ? 'drop-shadow(0 1px 2px rgba(50,0,0,0.4)) drop-shadow(0 0 1px rgba(100,0,0,0.3))'
                  : 'drop-shadow(0 0 1px rgba(255,0,0,0.8))',
                opacity: isPhysicalWidth ? 0.65 : isBlankCanvas ? 0.9 : 1
              }}
            />
          )}

          {/* Current drawing path - single point */}
          {currentPath && currentPath.points.length === 1 && (
            <circle
              cx={currentPath.points[0].x}
              cy={currentPath.points[0].y}
              r={getPointRadius(5.0)}
              fill={currentPath.color || '#FF0000'}
              stroke="white"
              strokeWidth={getStrokeWidth(1.5)}
              style={{
                filter: 'drop-shadow(0 0 1px rgba(255,0,0,0.8))',
                opacity: 1
              }}
            />
          )}

          {/* Pending path */}
          {pendingPath && pendingPath.points.length > 1 && (
            <path
              d={generatePathString(pendingPath.points)}
              stroke="#F59E0B"
              strokeWidth={getStrokeWidth(isBlankCanvas ? 3.0 : 2.5)}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={isBlankCanvas ? 0.85 : 1}
              style={{
                filter: isBlankCanvas
                  ? 'drop-shadow(0 1px 2px rgba(100,80,0,0.3)) drop-shadow(0 0 1px rgba(150,100,0,0.2))'
                  : 'drop-shadow(0 0 1px rgba(245,158,11,0.8))'
              }}
            />
          )}
        </svg>

        {/* Loading states */}
        {(isImageLoading || isPdfLoading) && !isBlankCanvas && (
          <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900" style={{ zIndex: 60 }}>
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Loading drawing...</p>
            </div>
          </div>
        )}
      </div>

      {/* Repositioning Indicator */}
      {isRepositioning && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg" style={{ zIndex: 70 }}>
          <div className="flex items-center gap-2">
            <Move className="h-4 w-4" />
            <span className="text-sm font-medium">Click to reposition markup</span>
          </div>
        </div>
      )}

      {/* Markup Context Menu */}
      {showMarkupMenu && (
        <div
          className="absolute bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 py-2 min-w-[160px]"
          style={{
            left: markupMenuPosition.x,
            top: markupMenuPosition.y,
            zIndex: 70
          }}
        >
          <button
            onClick={() => {
              if (selectedMarkupId) {
                onRepositionStart(selectedMarkupId);
              }
              setShowMarkupMenu(false);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <Move className="h-4 w-4" />
            Reposition
          </button>
          <button
            onClick={() => {
              if (selectedMarkupId) {
                onDeleteClick(selectedMarkupId);
              }
              setShowMarkupMenu(false);
              setSelectedMarkupId(null);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-red-600 dark:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
          <div className="border-t dark:border-gray-700 my-1"></div>
          <button
            onClick={() => {
              setShowMarkupMenu(false);
              setSelectedMarkupId(null);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <X className="h-4 w-4" />
            Cancel
          </button>
        </div>
      )}

      {/* PDF Controls */}
      {!isImageFile && !isBlankCanvas && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-white dark:bg-gray-800 rounded-full shadow-lg px-3 py-2" style={{ zIndex: 50 }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPdfPageNumber(Math.max(1, pdfPageNumber - 1))}
            disabled={pdfPageNumber <= 1}
            className="h-8 w-8 p-0 rounded-full"
          >
            &larr;
          </Button>
          <span className="text-sm font-medium px-3">
            {pdfPageNumber} / {pdfNumPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPdfPageNumber(Math.min(pdfNumPages, pdfPageNumber + 1))}
            disabled={pdfPageNumber >= pdfNumPages}
            className="h-8 w-8 p-0 rounded-full"
          >
            &rarr;
          </Button>
        </div>
      )}
    </div>
  );
}
