import { useState, useRef, useCallback, useEffect } from "react";
import type { DrawingPoint, MarkupPath } from "../types";
import { getDistance } from "../utils";

interface UseCanvasDrawingOptions {
  isImageFile: boolean;
  isBlankCanvas: boolean;
  imageRef: React.RefObject<HTMLImageElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  pdfDimensions: { width: number; height: number };
}

/**
 * Manages all pan/zoom/draw state and provides coordinate transforms
 * and event handlers for touch and pointer interactions.
 */
export function useCanvasDrawing({
  isImageFile,
  isBlankCanvas,
  imageRef,
  containerRef,
  pdfDimensions,
}: UseCanvasDrawingOptions) {
  // Drawing state
  const [currentPath, setCurrentPath] = useState<MarkupPath | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isInDrawMode, setIsInDrawMode] = useState(false);
  const [pendingPath, setPendingPath] = useState<MarkupPath | null>(null);

  // Zoom and pan state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, clientX: 0, clientY: 0 });
  const [velocity, setVelocity] = useState({ x: 0, y: 0 });
  const animationRef = useRef<number | null>(null);

  // PDF-specific
  const [pdfScale, setPdfScale] = useState<number>(1.0);
  const [pdfRenderKey, setPdfRenderKey] = useState<number>(0);
  const [isZooming, setIsZooming] = useState<boolean>(false);
  const zoomDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Touch state
  const [lastPinchDistance, setLastPinchDistance] = useState<number>(0);
  const [isPinching, setIsPinching] = useState<boolean>(false);
  const [activeTouches, setActiveTouches] = useState<number>(0);

  // Desktop interaction
  const [isMiddleMouseDown, setIsMiddleMouseDown] = useState<boolean>(false);
  const [isPanMode, setIsPanMode] = useState<boolean>(false);
  const [isShiftHeld, setIsShiftHeld] = useState<boolean>(false);
  const [isCtrlHeld, setIsCtrlHeld] = useState<boolean>(false);
  const [mouseClickStartTime, setMouseClickStartTime] = useState<number>(0);
  const [mouseClickStartPos, setMouseClickStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Performance refs
  const transformRef = useRef<{ x: number; y: number; scale: number }>({ x: 0, y: 0, scale: 1 });
  const smoothZoomRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const [isHighQualityRender, setIsHighQualityRender] = useState<boolean>(true);
  const renderDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Dynamic stroke width calculation based on zoom level
  const getStrokeWidth = useCallback((baseWidth: number) => {
    if (isImageFile || isBlankCanvas) {
      const dynamicWidth = (baseWidth * 0.15) / zoomLevel;
      return Math.max(0.05, Math.min(dynamicWidth, 0.5));
    } else {
      const scaleFactor = pdfDimensions.width > 0 ? pdfDimensions.width / 800 : 1;
      return baseWidth * scaleFactor;
    }
  }, [zoomLevel, isImageFile, isBlankCanvas, pdfDimensions.width]);

  const getPointRadius = useCallback((baseRadius: number) => {
    if (isImageFile || isBlankCanvas) {
      const dynamicRadius = (baseRadius * 0.2) / zoomLevel;
      return Math.max(0.1, Math.min(dynamicRadius, 0.8));
    } else {
      const scaleFactor = pdfDimensions.width > 0 ? pdfDimensions.width / 800 : 1;
      return baseRadius * scaleFactor;
    }
  }, [zoomLevel, isImageFile, isBlankCanvas, pdfDimensions.width]);

  // Scale-independent marker size functions for numbered product markers
  const getMarkerRadius = useCallback((baseRadius: number) => {
    if (isImageFile || isBlankCanvas) {
      const scaledRadius = baseRadius / zoomLevel;
      return Math.max(scaledRadius, baseRadius * 0.5);
    } else {
      const scaledRadius = baseRadius / pdfScale;
      return Math.max(scaledRadius, baseRadius * 0.5);
    }
  }, [zoomLevel, isImageFile, isBlankCanvas, pdfScale]);

  const getMarkerFontSize = useCallback((baseFontSize: number) => {
    if (isImageFile || isBlankCanvas) {
      return baseFontSize / zoomLevel;
    } else {
      return baseFontSize / pdfScale;
    }
  }, [zoomLevel, isImageFile, isBlankCanvas, pdfScale]);

  const getMarkerStrokeWidth = useCallback((baseWidth: number) => {
    if (isImageFile || isBlankCanvas) {
      return baseWidth / zoomLevel;
    } else {
      return baseWidth / pdfScale;
    }
  }, [zoomLevel, isImageFile, isBlankCanvas, pdfScale]);

  // Convert screen coordinates to content-space SVG coordinates.
  //
  // Rendered content size is:
  //   - image: natural pixel size × zoomLevel
  //   - PDF:   pdfDimensions (PDF points) × pdfScale
  //
  // So the screen→content inverse is simply (screen - pos) / scale. The
  // old PDF formula used `container.offsetWidth × pdfScale` as the
  // rendered width — that was correct back when the <Page width> prop
  // was `container.width × pdfScale`, but the Page is now rendered at
  // `pdfDimensions.width × pdfScale` (so landscape CAD sheets fill the
  // viewport). If this formula isn't updated to match, click coordinates
  // fall into a wrong spot in PDF-point space and the resulting markup
  // renders off-canvas — exactly the "marked barriers don't show" bug.
  const getRelativeCoordinates = useCallback((clientX: number, clientY: number) => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return { x: 0, y: 0 };

    const screenX = clientX - containerRect.left;
    const screenY = clientY - containerRect.top;

    if ((isImageFile || isBlankCanvas) && imageRef.current) {
      const imageX = (screenX - imagePosition.x) / zoomLevel;
      const imageY = (screenY - imagePosition.y) / zoomLevel;
      return { x: imageX, y: imageY };
    } else {
      // PDF: inverse of `pdfDimensions × pdfScale` → just divide by pdfScale.
      const safePdfScale = pdfScale > 0 ? pdfScale : 1;
      const pdfX = (screenX - imagePosition.x) / safePdfScale;
      const pdfY = (screenY - imagePosition.y) / safePdfScale;
      return { x: pdfX, y: pdfY };
    }
  }, [isImageFile, isBlankCanvas, imagePosition, zoomLevel, pdfScale, pdfDimensions, imageRef, containerRef]);

  // Optimized coordinate calculation that reads from the transform ref
  // (populated on RAF during pinch/pan). Same semantics as above.
  const getRelativeCoordinatesOptimized = useCallback((clientX: number, clientY: number) => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return { x: 0, y: 0 };

    const screenX = clientX - containerRect.left;
    const screenY = clientY - containerRect.top;
    const currentTransform = transformRef.current;
    const safeScale = currentTransform.scale > 0 ? currentTransform.scale : 1;

    if ((isImageFile || isBlankCanvas) && imageRef.current) {
      const imageX = (screenX - currentTransform.x) / safeScale;
      const imageY = (screenY - currentTransform.y) / safeScale;
      return { x: imageX, y: imageY };
    } else {
      const pdfX = (screenX - currentTransform.x) / safeScale;
      const pdfY = (screenY - currentTransform.y) / safeScale;
      return { x: pdfX, y: pdfY };
    }
  }, [isImageFile, isBlankCanvas, pdfDimensions, imageRef, containerRef]);

  // Smooth inertial scrolling effect
  useEffect(() => {
    if (!isDragging && (Math.abs(velocity.x) > 0.5 || Math.abs(velocity.y) > 0.5)) {
      animationRef.current = requestAnimationFrame(() => {
        setImagePosition(prev => ({
          x: prev.x + velocity.x,
          y: prev.y + velocity.y
        }));
        setVelocity(prev => ({
          x: prev.x * 0.95,
          y: prev.y * 0.95
        }));
      });
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [velocity, isDragging]);

  // Touch handlers
  const createTouchStartHandler = (
    preSelectedProduct: string,
    getProductColorFn: (id: string) => string,
    checkQuantityFn: () => boolean,
    hapticDraw: () => void,
    showQuantityToast: () => void,
  ) => (event: React.TouchEvent) => {
    const touches = event.touches.length;
    setActiveTouches(touches);

    if (smoothZoomRef.current) {
      cancelAnimationFrame(smoothZoomRef.current);
      smoothZoomRef.current = null;
    }

    if (touches === 2) {
      event.preventDefault();
      setIsPinching(true);
      setIsDragging(false);
      setIsDrawing(false);
      const distance = getDistance(event.touches[0], event.touches[1]);
      setLastPinchDistance(distance);

      const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      setDragStart({
        x: imagePosition.x,
        y: imagePosition.y,
        clientX: centerX,
        clientY: centerY
      });

      transformRef.current = {
        x: imagePosition.x,
        y: imagePosition.y,
        scale: isImageFile ? zoomLevel : pdfScale
      };
    } else if (touches === 1 && !isPinching) {
      const touch = event.touches[0];

      if (isInDrawMode && preSelectedProduct && !isPanMode && !isShiftHeld) {
        hapticDraw();
        const coords = getRelativeCoordinatesOptimized(touch.clientX, touch.clientY);

        if (checkQuantityFn()) {
          showQuantityToast();
          setIsInDrawMode(false);
          return;
        }

        setIsDrawing(true);
        const color = getProductColorFn(preSelectedProduct);
        setCurrentPath({
          points: [coords],
          cartItemId: preSelectedProduct,
          color: color
        });
      } else {
        setIsDragging(true);
        setIsDrawing(false);
        setDragStart({
          x: imagePosition.x,
          y: imagePosition.y,
          clientX: touch.clientX,
          clientY: touch.clientY
        });

        transformRef.current = {
          x: imagePosition.x,
          y: imagePosition.y,
          scale: isImageFile ? zoomLevel : pdfScale
        };
      }
    }
  };

  const handleTouchMove = useCallback((event: React.TouchEvent) => {
    const now = performance.now();

    if (now - lastFrameTimeRef.current < 16.67) {
      return;
    }
    lastFrameTimeRef.current = now;

    if (event.touches.length === 2 && isPinching && containerRef.current) {
      event.preventDefault();
      const distance = getDistance(event.touches[0], event.touches[1]);

      const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;

      const deltaX = centerX - dragStart.clientX;
      const deltaY = centerY - dragStart.clientY;
      const newPanPosition = {
        x: dragStart.x + deltaX,
        y: dragStart.y + deltaY
      };

      if (lastPinchDistance > 0) {
        const scale = distance / lastPinchDistance;
        const containerRect = containerRef.current.getBoundingClientRect();
        const pinchCenterX = (event.touches[0].clientX + event.touches[1].clientX) / 2 - containerRect.left;
        const pinchCenterY = (event.touches[0].clientY + event.touches[1].clientY) / 2 - containerRect.top;

        if (isImageFile) {
          const newZoom = Math.min(Math.max(zoomLevel * scale, 0.02), 10);
          if (Math.abs(newZoom - zoomLevel) > 0.005) {
            const unscaledX = (pinchCenterX - newPanPosition.x) / zoomLevel;
            const unscaledY = (pinchCenterY - newPanPosition.y) / zoomLevel;

            const zoomedPosition = {
              x: pinchCenterX - (unscaledX * newZoom),
              y: pinchCenterY - (unscaledY * newZoom)
            };

            transformRef.current = {
              x: zoomedPosition.x,
              y: zoomedPosition.y,
              scale: newZoom
            };

            if (!smoothZoomRef.current) {
              smoothZoomRef.current = requestAnimationFrame(() => {
                setImagePosition(zoomedPosition);
                setZoomLevel(newZoom);
                smoothZoomRef.current = null;
              });
            }
          }
        } else {
          const newScale = Math.min(Math.max(pdfScale * scale, 0.02), 10);
          if (Math.abs(newScale - pdfScale) > 0.005) {
            const unscaledX = (pinchCenterX - newPanPosition.x) / pdfScale;
            const unscaledY = (pinchCenterY - newPanPosition.y) / pdfScale;

            const zoomedPosition = {
              x: pinchCenterX - (unscaledX * newScale),
              y: pinchCenterY - (unscaledY * newScale)
            };

            transformRef.current = {
              x: zoomedPosition.x,
              y: zoomedPosition.y,
              scale: newScale
            };

            if (!smoothZoomRef.current) {
              smoothZoomRef.current = requestAnimationFrame(() => {
                setImagePosition(zoomedPosition);
                setPdfScale(newScale);
                smoothZoomRef.current = null;
              });
            }
          }
        }
      } else {
        transformRef.current = {
          x: newPanPosition.x,
          y: newPanPosition.y,
          scale: transformRef.current.scale
        };
        setImagePosition(newPanPosition);
      }

      setLastPinchDistance(distance);
    } else if (event.touches.length === 1 && !isPinching) {
      const touch = event.touches[0];

      if (isDrawing && currentPath) {
        const coords = getRelativeCoordinatesOptimized(touch.clientX, touch.clientY);

        const lastPoint = currentPath.points[currentPath.points.length - 1];
        const dist = Math.sqrt(
          Math.pow(coords.x - lastPoint.x, 2) + Math.pow(coords.y - lastPoint.y, 2)
        );

        if (dist > 0.1) {
          setCurrentPath(prev => prev ? {
            ...prev,
            points: [...prev.points, coords]
          } : null);
        }
      } else if (isDragging && !isDrawing && !isPinching) {
        event.preventDefault();

        const deltaX = touch.clientX - dragStart.clientX;
        const deltaY = touch.clientY - dragStart.clientY;
        const newPosition = {
          x: dragStart.x + deltaX,
          y: dragStart.y + deltaY,
        };

        transformRef.current = {
          x: newPosition.x,
          y: newPosition.y,
          scale: transformRef.current.scale
        };

        setVelocity({
          x: deltaX * 0.05,
          y: deltaY * 0.05
        });

        setImagePosition(newPosition);
      }
    }
  }, [isPinching, dragStart, zoomLevel, pdfScale, imagePosition, isDrawing, isDragging, currentPath, isImageFile, imageRef, lastPinchDistance, getRelativeCoordinatesOptimized, containerRef]);

  const createTouchEndHandler = (
    preSelectedProduct: string,
    finishDrawingFn: (points: DrawingPoint[], product: string) => void,
  ) => (event: React.TouchEvent) => {
    const touches = event.touches.length;
    setActiveTouches(touches);

    if (touches === 0) {
      if (isDrawing) {
        if (currentPath && currentPath.points.length >= 2 && preSelectedProduct) {
          finishDrawingFn(currentPath.points, preSelectedProduct);
        } else {
          setIsDrawing(false);
          setCurrentPath(null);
        }
      } else {
        setIsDrawing(false);
      }

      setIsDragging(false);
      setIsPinching(false);
      setLastPinchDistance(0);
      setDragStart({ x: 0, y: 0, clientX: 0, clientY: 0 });
    } else if (touches === 1 && isPinching) {
      const touch = event.touches[0];
      setIsPinching(false);
      setLastPinchDistance(0);

      if (!isInDrawMode) {
        setIsDragging(true);
        setDragStart({
          x: touch.clientX - imagePosition.x,
          y: touch.clientY - imagePosition.y,
          clientX: touch.clientX,
          clientY: touch.clientY
        });
      }
    }
  };

  // Mouse wheel zoom handler for desktop.
  //
  // IMPORTANT: use MULTIPLICATIVE zoom (factor) not additive, and use the
  // SAME clamp bands for both image and PDF paths. The old code clamped
  // PDF scale to a 0.5 minimum, which broke completely for big A0/A1 CAD
  // sheets where the fit-to-window pdfScale is ~0.05 — the very first
  // wheel event would snap to 0.5 (a massive 10× zoom-in jump) and the
  // user lost their place. With a multiplicative factor the zoom feels
  // uniform regardless of starting scale.
  const handleWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();

    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const mouseX = event.clientX - containerRect.left;
    const mouseY = event.clientY - containerRect.top;

    // Factor per wheel tick — ~12% zoom step. Trackpad smooth-scroll
    // reports many small ticks so cumulative zoom is still responsive.
    const zoomFactor = event.deltaY > 0 ? 1 / 1.12 : 1.12;

    // Full range: 2% to 10× — covers fit-to-window on an A0 sheet all
    // the way to pixel-peeping detail inspection.
    const MIN = 0.02;
    const MAX = 10;

    if (isImageFile || isBlankCanvas) {
      const newZoom = Math.min(Math.max(zoomLevel * zoomFactor, MIN), MAX);
      if (newZoom !== zoomLevel) {
        const unscaledX = (mouseX - imagePosition.x) / zoomLevel;
        const unscaledY = (mouseY - imagePosition.y) / zoomLevel;

        const newPosition = {
          x: mouseX - (unscaledX * newZoom),
          y: mouseY - (unscaledY * newZoom),
        };

        setImagePosition(newPosition);
        setZoomLevel(newZoom);
      }
    } else {
      const newScale = Math.min(Math.max(pdfScale * zoomFactor, MIN), MAX);

      if (Math.abs(newScale - pdfScale) > 0.0001) {
        const docX = (mouseX - imagePosition.x) / pdfScale;
        const docY = (mouseY - imagePosition.y) / pdfScale;

        const newPosition = {
          x: mouseX - (docX * newScale),
          y: mouseY - (docY * newScale),
        };

        setImagePosition(newPosition);
        setPdfScale(newScale);
      }
    }
  }, [isImageFile, isBlankCanvas, zoomLevel, pdfScale, imagePosition, containerRef]);

  return {
    // Drawing state
    currentPath,
    setCurrentPath,
    isDrawing,
    setIsDrawing,
    isInDrawMode,
    setIsInDrawMode,
    pendingPath,
    setPendingPath,

    // Zoom and pan
    zoomLevel,
    setZoomLevel,
    imagePosition,
    setImagePosition,
    isDragging,
    setIsDragging,
    dragStart,
    setDragStart,
    velocity,
    setVelocity,

    // PDF
    pdfScale,
    setPdfScale,
    pdfRenderKey,
    setPdfRenderKey,
    isZooming,
    setIsZooming,

    // Touch
    lastPinchDistance,
    setLastPinchDistance,
    isPinching,
    setIsPinching,
    activeTouches,
    setActiveTouches,

    // Desktop
    isMiddleMouseDown,
    setIsMiddleMouseDown,
    isPanMode,
    setIsPanMode,
    isShiftHeld,
    setIsShiftHeld,
    isCtrlHeld,
    setIsCtrlHeld,
    mouseClickStartTime,
    setMouseClickStartTime,
    mouseClickStartPos,
    setMouseClickStartPos,

    // Performance
    isHighQualityRender,
    setIsHighQualityRender,
    transformRef,

    // Coordinate functions
    getRelativeCoordinates,
    getRelativeCoordinatesOptimized,

    // Stroke/size functions
    getStrokeWidth,
    getPointRadius,
    getMarkerRadius,
    getMarkerFontSize,
    getMarkerStrokeWidth,

    // Event handlers
    createTouchStartHandler,
    handleTouchMove,
    createTouchEndHandler,
    handleWheel,
  };
}
