import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Pen, Check, Wand2, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { LayoutMarkup } from "@shared/schema";

import type { LayoutMarkupEditorProps, DrawingPoint, MarkupPath } from "./types";
import { isImageFileType, isBlankCanvasType, getProductColor as getProductColorUtil, getCartItemWithMarkings as getCartItemWithMarkingsUtil, getMarkedQuantity, detectCorners, calculateBarrierLength, parsePathData, getProductWidthMm } from "./utils";
import { useCanvasDrawing } from "./hooks/useCanvasDrawing";
import { useImageLoader } from "./hooks/useImageLoader";
import { useScaleCalibration } from "./hooks/useScaleCalibration";
import { MIN_ZOOM, MAX_ZOOM } from "./constants";
import { Toolbar } from "./components/Toolbar";
import { ProductSidebar } from "./components/ProductSidebar";
import { CanvasOverlay } from "./components/CanvasOverlay";
import { MarkupList } from "./components/MarkupList";
import { TitleBlockFrame, type BarrierKeyEntry, type TitleBlockMeta } from "./components/TitleBlockFrame";
import { TitleBlockEditor } from "./components/TitleBlockEditor";
import { exportLayoutDrawingPdf } from "@/utils/layoutDrawingPdfExport";

export function LayoutMarkupEditor({ isOpen, onClose, drawing, cartItems }: LayoutMarkupEditorProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const queryClient = useQueryClient();
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Determine file types
  // DWG / DXF files are native AutoCAD. We store them verbatim — the
  // viewer shows a placeholder with a download CTA because rendering DWG
  // in-browser requires either a heavy wasm library or Autodesk APS
  // server-side translation (out of scope for this sprint). Detect FIRST
  // so the image / PDF branches don't try to parse a DWG blob.
  const isDwgFile =
    drawing?.fileType === 'dwg' ||
    (drawing?.fileName || '').toLowerCase().match(/\.(dwg|dxf)$/) !== null;
  const isImageFile = !isDwgFile && isImageFileType(drawing);
  const isBlankCanvas = isBlankCanvasType(drawing);
  // Anything that isn't an image/blank-canvas/DWG is treated as a PDF —
  // matches the back-end's fileType field and catches .pdf extensions.
  const isPdfFile = !isDwgFile && !isImageFile && !isBlankCanvas && (
    drawing?.fileType === 'pdf' ||
    (drawing?.fileName || '').toLowerCase().endsWith('.pdf')
  );

  // PDF dimensions must be declared before useCanvasDrawing which depends on it
  const [pdfDimensions, setPdfDimensions] = useState<{ width: number; height: number }>({ width: 800, height: 1100 });

  // Scale calibration (pixels-per-mm + the zoom it was captured at).
  // useCanvasDrawing needs these so getProductStrokeWidth can render
  // barrier bands at their real physical width. Declared before the
  // canvas hook so we can pass the current values in.
  const scale = useScaleCalibration();

  // Custom hooks
  const canvas = useCanvasDrawing({
    isImageFile,
    isBlankCanvas,
    imageRef,
    containerRef,
    pdfDimensions,
    drawingScale: scale.drawingScale,
    scaleZoomLevel: scale.scaleZoomLevel,
  });

  const [markups, setMarkups] = useState<LayoutMarkup[]>([]);
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [preSelectedProduct, setPreSelectedProduct] = useState<string>("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [markupToDelete, setMarkupToDelete] = useState<string | null>(null);
  const [showTrashDialog, setShowTrashDialog] = useState(false);
  const [selectedCartItem, setSelectedCartItem] = useState<string>("");
  const [comment, setComment] = useState("");
  const [barrierRunLengths, setBarrierRunLengths] = useState<string[]>([]);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [pdfNumPages, setPdfNumPages] = useState<number>(1);
  const [pdfPageNumber, setPdfPageNumber] = useState<number>(1);
  const [isPdfLoading, setIsPdfLoading] = useState<boolean>(true);
  const [isMarkupsExpanded, setIsMarkupsExpanded] = useState<boolean>(false);
  const [autoCollapseTimer, setAutoCollapseTimer] = useState<NodeJS.Timeout | null>(null);
  const [showHelpGuide, setShowHelpGuide] = useState<boolean>(false);
  // Title-block editor modal + print-preview + PDF export state
  const [showTitleBlockEditor, setShowTitleBlockEditor] = useState<boolean>(false);
  const [isPrintPreview, setIsPrintPreview] = useState<boolean>(false);
  const [exportProgressLabel, setExportProgressLabel] = useState<string | null>(null);
  const titleBlockFrameRef = useRef<HTMLDivElement>(null);

  // Length validation state
  const [invalidMarkups, setInvalidMarkups] = useState<Set<string>>(new Set());
  const [markupValidation, setMarkupValidation] = useState<Map<string, { expected: number; actual: number }>>(new Map());
  const [selectedMarkupId, setSelectedMarkupId] = useState<string | null>(null);
  const [showMarkupMenu, setShowMarkupMenu] = useState(false);
  const [markupMenuPosition, setMarkupMenuPosition] = useState({ x: 0, y: 0 });
  const [isRepositioning, setIsRepositioning] = useState(false);
  const [repositionMarkupId, setRepositionMarkupId] = useState<string | null>(null);

  // Track if help guide has been shown for this drawing session
  const [hasShownHelpGuide, setHasShownHelpGuide] = useState<boolean>(false);

  // Rendering view mode: "technical" shows scale-accurate post+rail top-view
  // geometry for product-linked markups; "schematic" is the legacy flat
  // polyline rendering. Defaults to "technical".
  const [viewMode, setViewMode] = useState<"technical" | "schematic">("technical");

  // Image loader
  const imageLoader = useImageLoader({
    isOpen,
    fileUrl: drawing?.fileUrl,
    isImageFile,
    isBlankCanvas,
    isPdfFile,
  });

  // Wrapper functions for utility calls that need current state
  const getProductColor = (cartItemId: string) => getProductColorUtil(cartItemId, cartItems);
  const getCartItemWithMarkings = (cartItemId: string) => getCartItemWithMarkingsUtil(cartItemId, cartItems, markups);

  // Real-world width of the currently-being-drawn product. Used by the
  // live path preview so the ribbon renders at its actual physical
  // footprint (e.g. 130mm iFlex vs 190mm Atlas) before the markup is
  // committed. Derived from the cart-item's productName via the same
  // name-matcher we use at save time.
  const activeProductWidthMm = (() => {
    if (!preSelectedProduct) return null;
    const cartItem = cartItems.find((ci) => ci.id === preSelectedProduct);
    return cartItem ? getProductWidthMm({ name: cartItem.productName }) : null;
  })();

  // Query existing markups
  const { data: existingMarkups = [] } = useQuery<LayoutMarkup[]>({
    queryKey: ["/api/layout-drawings", drawing?.id, "markups"],
    enabled: !!drawing?.id && isOpen,
  });

  // Sync existing markups from database with local state
  useEffect(() => {
    if (existingMarkups && existingMarkups.length > 0) {
      setMarkups(existingMarkups);
    }
  }, [existingMarkups]);

  // Auto-clear the endpoint-snap indicator after the pulse animation
  // finishes (~800ms). The SVG animate runs fill=freeze, so if we
  // don't clear the state the ring would sit there forever at
  // opacity 0. Clearing the state removes it from the DOM entirely.
  useEffect(() => {
    if (!canvas.lastSnappedEndpoint) return;
    const timer = setTimeout(() => canvas.setLastSnappedEndpoint(null), 800);
    return () => clearTimeout(timer);
  }, [canvas.lastSnappedEndpoint, canvas.setLastSnappedEndpoint]);

  // Initialize drawing state when opened
  useEffect(() => {
    if (isOpen && drawing?.id) {
      if (drawing.scale && drawing.isScaleSet) {
        scale.setDrawingScale(drawing.scale);
        scale.setIsScaleSet(true);
        if (drawing.scaleLine && typeof drawing.scaleLine === 'object' && 'zoomLevel' in drawing.scaleLine) {
          scale.setScaleZoomLevel((drawing.scaleLine as any).zoomLevel || 1);
        }
      } else if (!scale.isScaleSet && !hasShownHelpGuide) {
        setHasShownHelpGuide(true);
        toast({
          title: "Scale Not Set",
          description: "Click the wand icon to calibrate the drawing scale for accurate barrier length calculations.",
          duration: 5000,
        });
      }

      if (!hasShownHelpGuide && drawing.isScaleSet) {
        setShowHelpGuide(true);
        setHasShownHelpGuide(true);
      }
    }
  }, [existingMarkups, isOpen, drawing?.id, hasShownHelpGuide]);

  // Reset loading states when drawing changes
  useEffect(() => {
    if (isOpen && drawing?.id) {
      const isImageType = drawing.fileType === 'image' ||
        drawing.fileName.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/);

      if (isImageType) {
        imageLoader.setIsImageLoading(true);
        setIsPdfLoading(false);
      } else {
        setIsPdfLoading(true);
        imageLoader.setIsImageLoading(false);
      }
    }
  }, [drawing?.id, drawing?.fileType, drawing?.fileName, isOpen]);

  // Fix the barrier run lengths initialization
  useEffect(() => {
    if (canvas.pendingPath) {
      const corners = detectCorners(canvas.pendingPath.points);
      const segments = Math.max(1, corners + 1);

      if (barrierRunLengths.length !== segments) {
        setBarrierRunLengths(new Array(segments).fill(''));
      }
    }
  }, [canvas.pendingPath, barrierRunLengths.length]);

  // Fit-to-container helper. Single source of truth for "make whatever
  // drawing we loaded fill the viewport". Called on first load AND
  // whenever the container resizes (ResizeObserver effect below) — so a
  // dialog that finishes animating in AFTER the drawing loaded still ends
  // up with a full-size view. Must be declared BEFORE the useEffect that
  // references it in its dep array (otherwise TDZ ReferenceError).
  const fitContentToContainer = useCallback((
    contentWidth: number,
    contentHeight: number,
    mode: "image" | "pdf",
  ) => {
    const container = containerRef.current;
    if (!container || !contentWidth || !contentHeight) return;
    const cw = container.offsetWidth;
    const ch = container.offsetHeight;
    if (!cw || !ch) return;

    const padding = 0.96;
    const fit = Math.min(
      (cw / contentWidth) * padding,
      (ch / contentHeight) * padding,
      1.0,
    );
    const scale = Math.max(0.05, fit);
    const scaledW = contentWidth * scale;
    const scaledH = contentHeight * scale;
    const posX = Math.max(0, (cw - scaledW) / 2);
    const posY = Math.max(0, (ch - scaledH) / 2);

    if (mode === "pdf") canvas.setPdfScale(scale);
    else canvas.setZoomLevel(scale);
    canvas.setImagePosition({ x: posX, y: posY });
  }, [canvas, containerRef]);

  // Keep the latest fit function in a ref so the ResizeObserver effect
  // below doesn't have to depend on its identity. Without this, any
  // parent re-render (e.g. user zoom updating pdfScale) would tear down
  // and recreate the ResizeObserver, refiring a fit after the 220ms
  // settle — which stomps the user's zoom back to fit-to-window.
  const fitRef = useRef(fitContentToContainer);
  fitRef.current = fitContentToContainer;

  // ResizeObserver — when the canvas container's real size becomes known
  // (dialog animation finishes, barrier-key panel toggles, user resizes
  // window), re-run the auto-fit so the drawing always fills the viewport.
  // Without this, a PDF that loads while the dialog is still animating in
  // ends up scaled against a 79-pixel-tall container and shows as a thin
  // strip instead of a full drawing.
  useEffect(() => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;

    const refit = () => {
      if (isImageFile || isBlankCanvas) {
        const img = imageRef.current;
        if (img?.naturalWidth && img?.naturalHeight) {
          fitRef.current(img.naturalWidth, img.naturalHeight, "image");
        }
      } else if (isPdfFile && pdfDimensions.width && pdfDimensions.height) {
        fitRef.current(pdfDimensions.width, pdfDimensions.height, "pdf");
      }
    };

    // Debounce with a SETTLE delay. The dialog open animation causes
    // rapid container-size changes over ~250ms; each change would alter
    // pdfScale, change the react-pdf Page's `width` prop, and force pdf.js
    // to cancel + restart its render. If that happens after the canvas
    // was marked visibility:hidden, it can stay hidden forever because
    // the render that would flip it back never completes. Waiting for
    // the container to be stable for 200ms before the first fit sidesteps
    // this race entirely.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastW = 0;
    let lastH = 0;
    const scheduled = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const w = container.offsetWidth;
        const h = container.offsetHeight;
        if (Math.abs(w - lastW) < 4 && Math.abs(h - lastH) < 4) return;
        lastW = w;
        lastH = h;
        refit();
      }, 220);
    };

    const ro = new ResizeObserver(scheduled);
    ro.observe(container);
    // Fire once after the settle delay in case the element was already
    // at final size.
    scheduled();

    return () => {
      ro.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [
    // Intentionally NO `fitContentToContainer` here — it's a fresh
    // object every render (useCanvasDrawing returns a non-memoized
    // object), which would tear down and recreate the ResizeObserver
    // on every parent render and stomp the user's zoom back to fit.
    // We access the latest version via fitRef.current instead.
    isOpen,
    isImageFile,
    isBlankCanvas,
    isPdfFile,
    pdfDimensions.width,
    pdfDimensions.height,
    imageLoader.imageBlobUrl,
    imageLoader.pdfBlobUrl,
  ]);

  // --- Mutations ---

  const createMarkupMutation = useMutation({
    mutationFn: async (markupData: {
      cartItemId?: string;
      productName?: string;
      xPosition: number;
      yPosition: number;
      endX?: number;
      endY?: number;
      pathData?: string;
      comment?: string;
      calculatedLength?: number;
    }) => {
      const response = await fetch(`/api/layout-drawings/${drawing?.id}/markups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(markupData),
      });
      if (!response.ok) throw new Error('Failed to create markup');
      return response.json() as Promise<LayoutMarkup>;
    },
    onSuccess: (newMarkupData: LayoutMarkup) => {
      haptic.save();
      queryClient.invalidateQueries({ queryKey: ["/api/layout-drawings", drawing?.id, "markups"] });
      setMarkups([...markups, newMarkupData]);
      canvas.setCurrentPath(null);
      canvas.setPendingPath(null);
      setSelectedCartItem("");
      setComment("");
      setShowProductSelector(false);
      canvas.setIsInDrawMode(false);
      setHasShownHelpGuide(true);

      const savedCartItemId = newMarkupData.cartItemId as string;
      const cartItem = cartItems.find(item => item.id === savedCartItemId);
      if (cartItem) {
        const updatedMarkings = getCartItemWithMarkings(savedCartItemId);
        const newMarkedCount = (updatedMarkings?.markedCount || 0) + 1;

        if (newMarkedCount >= cartItem.quantity) {
          toast({
            title: "Product Fully Marked!",
            description: `All ${cartItem.quantity} units of ${cartItem.productName} have been marked. Please select another product.`,
            duration: 5000,
          });
          setPreSelectedProduct("");
          canvas.setIsInDrawMode(false);
        } else {
          toast({
            title: "Drawing Saved!",
            description: `Marked ${newMarkedCount}/${cartItem.quantity} ${cartItem.productName}. Continue drawing.`,
          });
          canvas.setIsInDrawMode(true);
        }
      } else {
        toast({
          title: "Drawing Saved!",
          description: "Barrier placement marking has been saved.",
        });
      }
    },
    onError: () => {
      haptic.error();
      toast({
        title: "Error",
        description: "Failed to save drawing. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Persist title-block metadata to the drawing record. This is what
  // populates the dynamic cells on the frame (dwg no, revision, etc).
  const updateTitleBlockMutation = useMutation({
    mutationFn: async (meta: TitleBlockMeta) => {
      const response = await fetch(`/api/layout-drawings/${drawing?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          dwgNumber: meta.dwgNumber ?? null,
          revision: meta.revision ?? null,
          drawingDate: meta.drawingDate ?? null,
          drawingTitle: meta.drawingTitle ?? null,
          drawingScale: meta.drawingScale ?? null,
          author: meta.author ?? null,
          checkedBy: meta.checkedBy ?? null,
          projectName: meta.project ?? null,
          revisionHistory: meta.revisionHistory ?? null,
          notesSection: meta.notesSection ?? null,
        }),
      });
      if (!response.ok) throw new Error("Failed to save drawing metadata");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layout-drawings"] });
      toast({ title: "Drawing metadata saved" });
    },
    onError: () => {
      toast({
        title: "Couldn't save metadata",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateDrawingTitleMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const response = await fetch(`/api/layout-drawings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fileName: title }),
      });
      if (!response.ok) throw new Error('Failed to update title');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layout-drawings"] });
      toast({
        title: "Title Updated",
        description: "The drawing title has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update the title. Please try again.",
        variant: "destructive",
      });
      setEditedTitle(drawing?.fileName || "");
    },
  });

  const deleteMarkupMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/layout-markups/${id}`, "DELETE");
    },
    onSuccess: (_, deletedId) => {
      haptic.delete();
      queryClient.invalidateQueries({ queryKey: ["/api/layout-drawings", drawing?.id, "markups"] });
      setMarkups(currentMarkups => currentMarkups.filter(m => m.id !== deletedId));
      setShowDeleteConfirm(false);
      setMarkupToDelete(null);
      toast({
        title: "Markup Deleted",
        description: "Barrier placement marking has been removed.",
      });
    },
    onError: () => {
      setShowDeleteConfirm(false);
      setMarkupToDelete(null);
      toast({
        title: "Error",
        description: "Failed to delete markup. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateScaleMutation = useMutation({
    mutationFn: async (scaleData: { scale: number; scaleLine: any; isScaleSet: boolean }) => {
      return apiRequest(`/api/layout-drawings/${drawing?.id}/scale`, "PUT", scaleData);
    },
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ["/api/layout-drawings"] });
      toast({
        title: "Scale Set",
        description: "Drawing scale has been calibrated successfully.",
      });
    },
  });

  const addProductToCartMutation = useMutation({
    mutationFn: async (productData: { productName: string; quantity: number }) => {
      return apiRequest("/api/cart", "POST", productData);
    },
    onSuccess: async (response) => {
      const newProduct = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });

      if (canvas.pendingPath) {
        setSelectedCartItem(newProduct.id);
      }

      toast({
        title: "Product Added",
        description: "New product added to cart.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add product to cart.",
        variant: "destructive",
      });
    },
  });

  const updateMarkupMutation = useMutation({
    mutationFn: async ({ id, pathData, endX, endY }: { id: string; pathData: string; endX: number; endY: number }) => {
      return apiRequest(`/api/layout-markups/${id}`, "PUT", {
        pathData,
        endX,
        endY,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layout-drawings", drawing?.id, "markups"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to align drawing. Please try again.",
        variant: "destructive",
      });
    },
  });

  // --- Handlers ---

  const handleDeleteConfirm = () => {
    if (markupToDelete) {
      deleteMarkupMutation.mutate(markupToDelete);
    }
  };

  const handleDeleteClick = (markupId: string) => {
    setMarkupToDelete(markupId);
    setShowDeleteConfirm(true);
  };

  // Shared drawing completion logic used by both touch and pointer handlers
  const finishDrawing = (pathPoints: DrawingPoint[], selectedProduct: string) => {
    const cartItem = cartItems.find(item => item.id === selectedProduct);
    if (!cartItem) {
      canvas.setIsDrawing(false);
      canvas.setCurrentPath(null);
      canvas.setIsInDrawMode(false);
      setPreSelectedProduct("");
      return;
    }

    // Endpoint snap: if the just-drawn segment's LAST point sits within
    // ~8 screen pixels of an existing markup's start or end, snap to
    // that existing endpoint so runs join cleanly. Candidates = the
    // first and last point of every other markup.
    let snappedPoints = pathPoints;
    if (pathPoints.length >= 2) {
      const candidates: DrawingPoint[] = [];
      for (const m of markups) {
        const pts = parsePathData(m);
        if (pts.length > 0) {
          candidates.push(pts[0]);
          if (pts.length > 1) candidates.push(pts[pts.length - 1]);
        }
      }
      const lastPoint = pathPoints[pathPoints.length - 1];
      const { point: snappedLast, snappedTo } = canvas.snapToEndpoint(lastPoint, candidates);
      if (snappedTo) {
        snappedPoints = [...pathPoints.slice(0, -1), snappedLast];
        canvas.setLastSnappedEndpoint(snappedLast);
      } else {
        canvas.setLastSnappedEndpoint(null);
      }
    }

    const firstPoint = snappedPoints[0];
    const cornerCount = detectCorners(snappedPoints);
    const calculatedLength = calculateBarrierLength(snappedPoints, scale.drawingScale);

    createMarkupMutation.mutate({
      cartItemId: selectedProduct,
      productName: cartItem.productName,
      xPosition: firstPoint.x,
      yPosition: firstPoint.y,
      pathData: JSON.stringify(snappedPoints),
      comment: undefined,
      calculatedLength: calculatedLength || undefined,
    });

    if (cornerCount > 0) {
      addProductToCartMutation.mutate({
        productName: `Corner Posts (${cartItem.productName})`,
        quantity: cornerCount,
      });
      toast({
        title: "Corner Posts Added",
        description: `${cornerCount} corner posts automatically added for ${cartItem.productName}`,
      });
    }

    const itemWithMarkings = getCartItemWithMarkings(selectedProduct);
    if (itemWithMarkings && (itemWithMarkings.markedCount + 1) < cartItem.quantity) {
      canvas.setIsInDrawMode(true);
      canvas.setCurrentPath(null);
      canvas.setIsDrawing(false);
    } else {
      setPreSelectedProduct("");
      canvas.setIsInDrawMode(false);
      canvas.setCurrentPath(null);
      canvas.setIsDrawing(false);
    }
  };

  // Touch event handlers (delegate to canvas hook)
  const handleTouchStart = canvas.createTouchStartHandler(
    preSelectedProduct,
    getProductColor,
    () => {
      const itemWithMarkings = getCartItemWithMarkings(preSelectedProduct);
      const cartItem = cartItems.find(item => item.id === preSelectedProduct);
      return !!(itemWithMarkings && cartItem && itemWithMarkings.markedCount >= cartItem.quantity);
    },
    () => haptic.draw(),
    () => {
      const cartItem = cartItems.find(item => item.id === preSelectedProduct);
      toast({
        title: "Quantity Limit Reached",
        description: `All ${cartItem?.quantity} units of ${cartItem?.productName} have been marked. Add more to cart to continue.`,
        variant: "destructive",
      });
      setPreSelectedProduct("");
    },
  );

  const handleTouchEnd = canvas.createTouchEndHandler(
    preSelectedProduct,
    finishDrawing,
  );

  // Pointer (mouse) handlers
  const handlePointerDown = (event: React.PointerEvent) => {
    if (showMarkupMenu) {
      setShowMarkupMenu(false);
      setSelectedMarkupId(null);
    }

    if (event.pointerType === 'touch') return;
    event.preventDefault();

    canvas.setMouseClickStartTime(Date.now());
    canvas.setMouseClickStartPos({ x: event.clientX, y: event.clientY });

    // Handle repositioning mode
    if (isRepositioning && repositionMarkupId && event.button === 0) {
      const coords = canvas.getRelativeCoordinates(event.clientX, event.clientY);
      const markupToReposition = markups.find(m => m.id === repositionMarkupId);
      if (markupToReposition) {
        const points = parsePathData(markupToReposition);
        if (points.length > 0) {
          const offsetX = coords.x - points[0].x;
          const offsetY = coords.y - points[0].y;
          const newPoints = points.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));

          updateMarkupMutation.mutate({
            id: repositionMarkupId,
            pathData: JSON.stringify(newPoints),
            endX: newPoints[newPoints.length - 1].x,
            endY: newPoints[newPoints.length - 1].y,
          });

          toast({
            title: "Markup Repositioned",
            description: "The barrier placement has been moved to the new location",
          });
        }
      }

      setIsRepositioning(false);
      setRepositionMarkupId(null);
      setSelectedMarkupId(null);
      return;
    }

    // Handle scale calibration mode
    if (scale.isSettingScale && event.button === 0) {
      const coords = canvas.getRelativeCoordinates(event.clientX, event.clientY);

      if (!scale.scaleStartPoint) {
        scale.setScaleStartPoint({ x: coords.x, y: coords.y });
        toast({
          title: "Start Point Set",
          description: "Now click on the end point of the known dimension"
        });
      } else if (!scale.scaleEndPoint) {
        scale.setScaleEndPoint({ x: coords.x, y: coords.y });
        scale.setScaleTempEndPoint(null);
        scale.setShowScaleDialog(true);
        scale.setIsSettingScale(false);
        toast({
          title: "End Point Set",
          description: "Enter the actual length of this dimension"
        });
      }
      return;
    }

    // Middle mouse button for panning
    if (event.button === 1) {
      canvas.setIsMiddleMouseDown(true);
      canvas.setIsDragging(true);
      canvas.setDragStart({
        x: event.clientX - canvas.imagePosition.x,
        y: event.clientY - canvas.imagePosition.y,
        clientX: event.clientX,
        clientY: event.clientY
      });
      return;
    }

    // Right click - pan
    if (event.button === 2) {
      event.preventDefault();
      canvas.setIsDragging(true);
      canvas.setDragStart({
        x: event.clientX - canvas.imagePosition.x,
        y: event.clientY - canvas.imagePosition.y,
        clientX: event.clientX,
        clientY: event.clientY
      });
      return;
    }

    // Left click
    if (event.button === 0) {
      if (canvas.isInDrawMode && !canvas.isPanMode && !canvas.isShiftHeld && preSelectedProduct) {
        haptic.draw();
        const coords = canvas.getRelativeCoordinates(event.clientX, event.clientY);

        if (!preSelectedProduct) {
          toast({
            title: "Select Product First",
            description: "Please select a product before drawing.",
            variant: "destructive",
          });
          return;
        }

        canvas.setIsDrawing(true);
        const color = getProductColor(preSelectedProduct);
        canvas.setCurrentPath({
          points: [coords],
          cartItemId: preSelectedProduct,
          color: color
        });
      } else {
        canvas.setIsDragging(true);
        canvas.setDragStart({
          x: canvas.imagePosition.x,
          y: canvas.imagePosition.y,
          clientX: event.clientX,
          clientY: event.clientY
        });
      }
    }
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch') return;

    // Handle scale calibration real-time line preview
    if (scale.isSettingScale && scale.scaleStartPoint && !scale.scaleEndPoint && containerRef.current) {
      const coords = canvas.getRelativeCoordinates(event.clientX, event.clientY);
      scale.setScaleTempEndPoint({ x: coords.x, y: coords.y });
    }

    const moveDistance = Math.sqrt(
      Math.pow(event.clientX - canvas.mouseClickStartPos.x, 2) +
      Math.pow(event.clientY - canvas.mouseClickStartPos.y, 2)
    );

    if (canvas.isDrawing && canvas.currentPath) {
      const rawCoords = canvas.getRelativeCoordinates(event.clientX, event.clientY);

      // Right-angle snap operates relative to the FIRST point of the
      // current stroke (so a straight line doesn't wiggle with every
      // wobble of the cursor). If the user releases snap mid-stroke
      // we fall through to the raw coord.
      const anchor = canvas.currentPath.points[0];
      const coords = canvas.applyRightAngleSnap(anchor, rawCoords, canvas.isRightAngleSnap);

      const lastPoint = canvas.currentPath.points[canvas.currentPath.points.length - 1];
      const distance = Math.sqrt(
        Math.pow(coords.x - lastPoint.x, 2) + Math.pow(coords.y - lastPoint.y, 2)
      );

      if (distance > 0.1) {
        // In right-angle snap mode we REPLACE the final point instead
        // of appending — a snapped line is always anchor→current, not
        // a squiggle through every intermediate mouse position.
        if (canvas.isRightAngleSnap) {
          canvas.setCurrentPath(prev => prev ? {
            ...prev,
            points: [prev.points[0], coords],
          } : null);
        } else {
          canvas.setCurrentPath(prev => prev ? {
            ...prev,
            points: [...prev.points, coords],
          } : null);
        }
      }
    } else if (canvas.isDragging && !canvas.isDrawing) {
      const deltaX = event.clientX - canvas.dragStart.clientX;
      const deltaY = event.clientY - canvas.dragStart.clientY;
      const newPosition = {
        x: canvas.dragStart.x + deltaX,
        y: canvas.dragStart.y + deltaY,
      };
      canvas.setImagePosition(newPosition);
    }
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch') return;

    const clickDuration = Date.now() - canvas.mouseClickStartTime;
    const moveDistance = Math.sqrt(
      Math.pow(event.clientX - canvas.mouseClickStartPos.x, 2) +
      Math.pow(event.clientY - canvas.mouseClickStartPos.y, 2)
    );

    const wasClick = clickDuration < 200 && moveDistance < 5;

    if (event.button === 1) {
      canvas.setIsMiddleMouseDown(false);
    }

    if (canvas.isDrawing) {
      if (canvas.currentPath && canvas.currentPath.points.length >= 2 && preSelectedProduct) {
        const cartItem = cartItems.find(item => item.id === preSelectedProduct);
        if (cartItem) {
          const itemWithMarkings = getCartItemWithMarkings(preSelectedProduct);

          if (itemWithMarkings && itemWithMarkings.markedCount >= cartItem.quantity) {
            toast({
              title: "Add More to Cart?",
              description: `You've marked all ${cartItem.quantity} units of ${cartItem.productName}. Add more to continue drawing?`,
              action: (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    addProductToCartMutation.mutate({
                      productName: cartItem.productName,
                      quantity: 1,
                    });
                    setTimeout(() => {
                      if (canvas.currentPath) {
                        const firstPoint = canvas.currentPath.points[0];
                        const cornerCount = detectCorners(canvas.currentPath.points);
                        const calculatedLength = calculateBarrierLength(canvas.currentPath.points, scale.drawingScale);
                        createMarkupMutation.mutate({
                          cartItemId: preSelectedProduct,
                          productName: cartItem.productName,
                          xPosition: firstPoint.x,
                          yPosition: firstPoint.y,
                          pathData: JSON.stringify(canvas.currentPath.points),
                          comment: undefined,
                          calculatedLength: calculatedLength || undefined,
                        });
                      }
                    }, 500);
                  }}
                >
                  Add +1 & Save
                </Button>
              ),
            });
          } else {
            finishDrawing(canvas.currentPath.points, preSelectedProduct);
            return;
          }
        }
        canvas.setIsDrawing(false);
        canvas.setCurrentPath(null);
      } else if (wasClick && canvas.currentPath && canvas.currentPath.points.length === 1 && preSelectedProduct) {
        const clickPoint = canvas.currentPath.points[0];
        const cartItem = cartItems.find(item => item.id === preSelectedProduct);
        if (cartItem) {
          const pointPath = [clickPoint, { x: clickPoint.x + 0.1, y: clickPoint.y + 0.1 }];
          const calculatedLength = calculateBarrierLength(pointPath, scale.drawingScale);
          createMarkupMutation.mutate({
            cartItemId: preSelectedProduct,
            productName: cartItem.productName,
            xPosition: clickPoint.x,
            yPosition: clickPoint.y,
            pathData: JSON.stringify(pointPath),
            comment: undefined,
            calculatedLength: calculatedLength || undefined,
          });

          const itemWithMarkings = getCartItemWithMarkings(preSelectedProduct);
          if (itemWithMarkings && (itemWithMarkings.markedCount + 1) < cartItem.quantity) {
            canvas.setIsInDrawMode(true);
            canvas.setCurrentPath(null);
            canvas.setIsDrawing(false);
            return;
          } else {
            setPreSelectedProduct("");
            canvas.setIsInDrawMode(false);
            canvas.setCurrentPath(null);
            canvas.setIsDrawing(false);
            return;
          }
        }
        canvas.setIsDrawing(false);
        canvas.setCurrentPath(null);
      } else {
        canvas.setIsDrawing(false);
        canvas.setCurrentPath(null);
      }
    } else {
      canvas.setIsDragging(false);
      canvas.setDragStart({ x: 0, y: 0, clientX: 0, clientY: 0 });
    }
  };

  // Auto-align function
  const handleAutoAlign = async () => {
    if (!markups || markups.length === 0) return;

    try {
      for (const markup of markups) {
        const points = parsePathData(markup);
        if (points.length < 3) continue;

        const originalStart = points[0];
        const originalEnd = points[points.length - 1];

        const cornerIndices: number[] = [];
        const angleThreshold = 45;

        for (let i = 1; i < points.length - 1; i++) {
          const prevPoint = points[i - 1];
          const currentPoint = points[i];
          const nextPoint = points[i + 1];

          const vec1 = { x: currentPoint.x - prevPoint.x, y: currentPoint.y - prevPoint.y };
          const vec2 = { x: nextPoint.x - currentPoint.x, y: nextPoint.y - currentPoint.y };

          const dotProduct = vec1.x * vec2.x + vec1.y * vec2.y;
          const magnitude1 = Math.sqrt(vec1.x * vec1.x + vec1.y * vec1.y);
          const magnitude2 = Math.sqrt(vec2.x * vec2.x + vec2.y * vec2.y);

          if (magnitude1 === 0 || magnitude2 === 0) continue;

          const cosAngle = dotProduct / (magnitude1 * magnitude2);
          const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);

          if (angle > angleThreshold && angle < (180 - angleThreshold)) {
            cornerIndices.push(i);
          }
        }

        const allCorners = [0, ...cornerIndices, points.length - 1];
        const uniqueCorners = Array.from(new Set(allCorners)).sort((a, b) => a - b);

        const alignedPoints: { x: number; y: number }[] = [];
        alignedPoints.push(originalStart);

        for (let i = 1; i < uniqueCorners.length - 1; i++) {
          const currentCornerIndex = uniqueCorners[i];
          const currentCorner = points[currentCornerIndex];
          const prevAligned = alignedPoints[alignedPoints.length - 1];

          const deltaX = Math.abs(currentCorner.x - prevAligned.x);
          const deltaY = Math.abs(currentCorner.y - prevAligned.y);

          if (deltaX > deltaY) {
            alignedPoints.push({ x: currentCorner.x, y: prevAligned.y });
          } else {
            alignedPoints.push({ x: prevAligned.x, y: currentCorner.y });
          }
        }

        if (alignedPoints.length > 1) {
          const lastAligned = alignedPoints[alignedPoints.length - 1];
          const deltaX = Math.abs(originalEnd.x - lastAligned.x);
          const deltaY = Math.abs(originalEnd.y - lastAligned.y);

          if (deltaX > 2 && deltaY > 2) {
            if (deltaX > deltaY) {
              alignedPoints.push({ x: originalEnd.x, y: lastAligned.y });
            } else {
              alignedPoints.push({ x: lastAligned.x, y: originalEnd.y });
            }
          }
        }

        alignedPoints.push(originalEnd);

        const cleanedPoints = [alignedPoints[0]];
        for (let i = 1; i < alignedPoints.length; i++) {
          const prev = cleanedPoints[cleanedPoints.length - 1];
          const curr = alignedPoints[i];
          if (Math.abs(prev.x - curr.x) > 0.5 || Math.abs(prev.y - curr.y) > 0.5) {
            cleanedPoints.push(curr);
          }
        }

        await updateMarkupMutation.mutateAsync({
          id: markup.id,
          pathData: JSON.stringify(cleanedPoints),
          endX: originalEnd.x,
          endY: originalEnd.y,
        });
      }

      toast({
        title: "Auto-Calibrate Complete",
        description: "Lines straightened between corners without moving endpoints.",
      });
    } catch (error) {
      toast({
        title: "Alignment Error",
        description: "Failed to align some drawings. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Keyboard handlers
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Shift') canvas.setIsShiftHeld(true);
    if (event.key === 'Control' || event.key === 'Meta') canvas.setIsCtrlHeld(true);
    if (event.key === ' ') {
      event.preventDefault();
      canvas.setIsPanMode(true);
    }
    if (event.key === 'Escape') {
      canvas.setIsInDrawMode(false);
      canvas.setCurrentPath(null);
      canvas.setIsDrawing(false);
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
      event.preventDefault();
      setMarkups(currentMarkups => {
        if (currentMarkups.length > 0) {
          const lastMarkup = currentMarkups[currentMarkups.length - 1];
          deleteMarkupMutation.mutate(lastMarkup.id);
        }
        return currentMarkups;
      });
    }
    // "V" toggles between technical and schematic rendering. Bail out when
    // the user is typing into an input / textarea / contentEditable so we
    // don't hijack the title-rename field or comment box.
    if ((event.key === 'v' || event.key === 'V') && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      const isTyping =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (active?.isContentEditable ?? false);
      if (!isTyping) {
        event.preventDefault();
        setViewMode((m) => (m === 'technical' ? 'schematic' : 'technical'));
      }
    }
  }, [deleteMarkupMutation]);

  // Zoom keyboard shortcuts — scoped to the layout-drawing container so
  // they don't hijack "+" / "-" in any other context. Only act when the
  // event target is inside the canvas container and we're not typing in
  // an input. Step factor 1.25 matches a comfortable keyboard-paced zoom
  // (too small and each press feels unresponsive; too big and you
  // overshoot).
  //
  // Bindings:
  //   +  /  =   → zoom in 1.25×
  //   -  /  _   → zoom out 1/1.25×
  //   0         → fit to page
  //   1         → 100% (pixel-accurate)
  const handleZoomShortcut = useCallback((event: KeyboardEvent) => {
    if (!isOpen) return;
    const container = containerRef.current;
    if (!container) return;
    // Container-scoped: only fire when focus / target sits inside the
    // canvas container. Dialog root contains the container so the whole
    // layout-drawing UI counts, but unrelated app UI (sidebar, nav) does
    // not steal the shortcut.
    const target = event.target as Node | null;
    if (target && !container.contains(target) && target !== document.body) {
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const tag = active?.tagName;
    const isTyping =
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      (active?.isContentEditable ?? false);
    if (isTyping) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key;
    if (key === '+' || key === '=') {
      event.preventDefault();
      const factor = 1.25;
      if (isImageFile || isBlankCanvas) {
        canvas.setZoomLevel((z) => Math.min(MAX_ZOOM, z * factor));
      } else if (isPdfFile) {
        canvas.setPdfScale((s) => Math.min(MAX_ZOOM, s * factor));
      }
    } else if (key === '-' || key === '_') {
      event.preventDefault();
      const factor = 1 / 1.25;
      if (isImageFile || isBlankCanvas) {
        canvas.setZoomLevel((z) => Math.max(MIN_ZOOM, z * factor));
      } else if (isPdfFile) {
        canvas.setPdfScale((s) => Math.max(MIN_ZOOM, s * factor));
      }
    } else if (key === '0') {
      event.preventDefault();
      // Fit to page — reuse the same path the zoom-fit button uses.
      if (isImageFile || isBlankCanvas) {
        const img = imageRef.current;
        if (img?.naturalWidth && img?.naturalHeight) {
          fitRef.current(img.naturalWidth, img.naturalHeight, "image");
        }
      } else if (isPdfFile && pdfDimensions.width && pdfDimensions.height) {
        fitRef.current(pdfDimensions.width, pdfDimensions.height, "pdf");
      }
    } else if (key === '1') {
      event.preventDefault();
      // 100% — native 1:1 scale. Centre the drawing in the viewport.
      const container = containerRef.current;
      if (!container) return;
      const cw = container.offsetWidth;
      const ch = container.offsetHeight;
      if (isImageFile || isBlankCanvas) {
        const img = imageRef.current;
        if (img?.naturalWidth && img?.naturalHeight) {
          canvas.setZoomLevel(1);
          canvas.setImagePosition({
            x: Math.max(0, (cw - img.naturalWidth) / 2),
            y: Math.max(0, (ch - img.naturalHeight) / 2),
          });
        }
      } else if (isPdfFile && pdfDimensions.width && pdfDimensions.height) {
        canvas.setPdfScale(1);
        canvas.setImagePosition({
          x: Math.max(0, (cw - pdfDimensions.width) / 2),
          y: Math.max(0, (ch - pdfDimensions.height) / 2),
        });
      }
    }
  }, [isOpen, isImageFile, isBlankCanvas, isPdfFile, pdfDimensions.width, pdfDimensions.height, canvas]);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Shift') canvas.setIsShiftHeld(false);
    if (event.key === 'Control' || event.key === 'Meta') canvas.setIsCtrlHeld(false);
    if (event.key === ' ') {
      event.preventDefault();
      canvas.setIsPanMode(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('keydown', handleZoomShortcut);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('keydown', handleZoomShortcut);
    };
  }, [isOpen, handleKeyDown, handleKeyUp, handleZoomShortcut]);

  // Close handler
  const handleClose = () => {
    canvas.setCurrentPath(null);
    canvas.setPendingPath(null);
    setSelectedCartItem("");
    setComment("");
    setBarrierRunLengths([]);
    canvas.setIsInDrawMode(false);
    canvas.setIsDrawing(false);
    setShowProductSelector(false);
    setIsMarkupsExpanded(false);
    setPreSelectedProduct("");
    if (autoCollapseTimer) {
      clearTimeout(autoCollapseTimer);
    }
    imageLoader.cleanup();
    onClose();
  };

  // Fit-to-container helper. Single source of truth for "make whatever
  // drawing we loaded fill the viewport". Called both on first load and
  // whenever the container resizes (ResizeObserver below) — so a dialog
  // that finishes animating in AFTER the drawing loaded still ends up with
  // a full-size view.
  // PDF callbacks
  const onPdfLoadSuccess = (pdf: any) => {
    setPdfNumPages(pdf.numPages);
    setPdfPageNumber(1);
    setIsPdfLoading(false);

    pdf.getPage(1).then((page: any) => {
      const viewport = page.getViewport({ scale: 1 });
      // Setting pdfDimensions triggers the ResizeObserver effect, which
      // owns the fit-to-container pdfScale. We deliberately DO NOT also
      // call fitContentToContainer here — doing both creates two rapid
      // setPdfScale updates during the dialog open animation, which can
      // interrupt pdf.js mid-render and leave the canvas stuck with
      // visibility:hidden.
      setPdfDimensions({ width: viewport.width, height: viewport.height });
    });
  };

  const handleImageLoad = () => {
    imageLoader.setIsImageLoading(false);
    const img = imageRef.current;
    if (!img) return;
    fitContentToContainer(img.naturalWidth, img.naturalHeight, "image");
  };

  const handleImageError = (error: any) => {
    console.error('Image load error:', error);
    imageLoader.setIsImageLoading(false);
    toast({
      title: "Couldn't display drawing",
      description: "The image failed to load. It may be corrupted or in an unsupported format.",
      variant: "destructive",
    });
  };

  const handlePdfError = (error: any) => {
    console.error('PDF load error:', error);
    setIsPdfLoading(false);
  };

  // Scale calibration handler
  // One-click PDF export. Captures the title-block frame DOM via html2canvas
  // and writes an A3-landscape PDF matching the printed deliverable.
  const handleExportPdf = async () => {
    const node = titleBlockFrameRef.current;
    if (!node) {
      toast({
        title: "Couldn't export",
        description: "The drawing frame isn't ready yet — try again in a moment.",
        variant: "destructive",
      });
      return;
    }
    try {
      // If we're in print-preview mode the frame is already scaled; the
      // capture will honour on-screen layout. If not, we capture at the
      // current size which is still correct aspect.
      const drawingFileBase = (drawing?.fileName || "A-SAFE_Layout").replace(/\.[^.]+$/, "");
      await exportLayoutDrawingPdf({
        node,
        filename: `${drawingFileBase}_${new Date().toISOString().split("T")[0]}`,
        paper: "A3",
        scale: 2,
        onProgress: (_pct, label) => setExportProgressLabel(label),
      });
      toast({ title: "PDF downloaded", description: "Your A3 drawing has been saved." });
    } catch (err) {
      console.error("PDF export failed", err);
      toast({
        title: "Export failed",
        description: "Please try again, or reduce the drawing zoom and retry.",
        variant: "destructive",
      });
    } finally {
      setExportProgressLabel(null);
    }
  };

  const handleSetScale = () => {
    const result = scale.calculateScale();
    if (result) {
      scale.setDrawingScale(result.scale);
      scale.setIsScaleSet(true);

      updateScaleMutation.mutate({
        scale: result.scale,
        scaleLine: result.scaleLine,
        isScaleSet: true
      });

      scale.setShowScaleDialog(false);
      scale.resetCalibration();
    }
  };

  const handleSavePathMarkup = () => {
    if (!canvas.pendingPath || !selectedCartItem || canvas.pendingPath.points.length < 2) {
      toast({
        title: "Missing Information",
        description: "Please select a product from your cart.",
        variant: "destructive",
      });
      return;
    }

    const cartItem = cartItems.find(item => item.id === selectedCartItem);
    if (!cartItem) return;

    const itemWithMarkings = getCartItemWithMarkings(selectedCartItem);
    if (itemWithMarkings && itemWithMarkings.markedCount >= cartItem.quantity) {
      toast({
        title: "Quantity Exceeded",
        description: `You've already marked all ${cartItem.quantity} units of ${cartItem.productName}. Please add more to your cart first.`,
        variant: "destructive",
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              addProductToCartMutation.mutate({
                productName: cartItem.productName,
                quantity: 1,
              });
            }}
          >
            Add +1
          </Button>
        ),
      });
      return;
    }

    const firstPoint = canvas.pendingPath.points[0];
    const cornerCount = detectCorners(canvas.pendingPath.points);
    const calculatedLength = calculateBarrierLength(canvas.pendingPath.points, scale.drawingScale);

    createMarkupMutation.mutate({
      cartItemId: selectedCartItem,
      productName: cartItem.productName,
      xPosition: firstPoint.x,
      yPosition: firstPoint.y,
      pathData: JSON.stringify(canvas.pendingPath.points),
      comment: comment.trim() || undefined,
      calculatedLength: calculatedLength || undefined,
    });

    if (cornerCount > 0) {
      addProductToCartMutation.mutate({
        productName: `Corner Posts (${cartItem.productName})`,
        quantity: cornerCount,
      });

      toast({
        title: "\ud83d\udd27 Corner Posts Added",
        description: `${cornerCount} corner posts automatically added to cart for your ${cartItem.productName}`,
      });
    } else {
      toast({
        title: "\u2705 Markup Saved",
        description: "No corners detected - straight barrier layout saved",
      });
    }

    setIsMarkupsExpanded(true);

    if (autoCollapseTimer) {
      clearTimeout(autoCollapseTimer);
    }

    const timer = setTimeout(() => {
      setIsMarkupsExpanded(false);
    }, 3000);
    setAutoCollapseTimer(timer);
  };

  // Build the title-block metadata from the drawing record. Any missing
  // field falls back to a sensible default at render time inside the frame.
  const titleBlockMeta: TitleBlockMeta = {
    dwgNumber: (drawing as any)?.dwgNumber || null,
    revision: (drawing as any)?.revision || null,
    drawingDate: (drawing as any)?.drawingDate || null,
    drawingTitle: (drawing as any)?.drawingTitle || null,
    drawingScale: (drawing as any)?.drawingScale || null,
    author: (drawing as any)?.author || null,
    checkedBy: (drawing as any)?.checkedBy || null,
    project: (drawing as any)?.projectName || (drawing as any)?.company || null,
    revisionHistory: (drawing as any)?.revisionHistory || null,
    notesSection: (drawing as any)?.notesSection || null,
  };

  // Compose the barrier key from drawn markups. Each distinct cartItemId
  // gets the next letter (A, B, C, …) so the printed drawing matches the
  // manual convention ("A.1 - iFlex Bollard", etc).
  const barrierKey: BarrierKeyEntry[] = (() => {
    const seen = new Map<string, { label: string; color: string }>();
    for (const m of markups) {
      const id = m.cartItemId || "";
      if (!id || seen.has(id)) continue;
      const cartItem = cartItems.find((c) => c.id === id);
      if (!cartItem) continue;
      seen.set(id, {
        label: cartItem.productName,
        color: getProductColor(id),
      });
    }
    const letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
    return Array.from(seen.values()).map((v, i) => ({
      letter: letters[i] || String(i + 1),
      label: v.label,
      color: v.color,
    }));
  })();

  // Early return AFTER all hooks are called
  if (!drawing) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent
          className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[98vw] h-[96vh] flex flex-col p-0 overflow-hidden rounded-lg bg-white dark:bg-gray-900 z-[100000] max-w-none max-h-none gap-0 touch-enhanced"
          style={{
            // Give the drawing viewport all the room we can, leaving a 2%
            // breathing margin on all sides so the dialog corners still
            // read as a dialog. Previously tight sm:/lg: breakpoints
            // capped the height which starved the PDF canvas area.
            maxHeight: 'calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 0.5rem)',
            maxWidth: 'calc(100vw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 0.5rem)',
          }}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={handleClose}
          onInteractOutside={(e) => e.preventDefault()}
          aria-describedby="layout-markup-editor-description"
        >
          <DialogTitle className="sr-only">Layout Drawing Editor</DialogTitle>
          <DialogDescription id="layout-markup-editor-description" className="sr-only">
            Edit and markup your layout drawing. Use the drawing tools to mark barrier placements.
          </DialogDescription>

          {/* Header / Toolbar */}
          <Toolbar
            drawing={drawing}
            isEditingTitle={isEditingTitle}
            editedTitle={editedTitle}
            setEditedTitle={setEditedTitle}
            setIsEditingTitle={setIsEditingTitle}
            onUpdateTitle={(id, title) => updateDrawingTitleMutation.mutate({ id, title })}
            isScaleSet={scale.isScaleSet}
            onShowScaleDialog={() => scale.setShowScaleDialog(true)}
            onShowHelpGuide={() => setShowHelpGuide(true)}
            onClose={handleClose}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            isRightAngleSnap={canvas.isRightAngleSnap}
            onToggleRightAngleSnap={() => canvas.setIsRightAngleSnap((v) => !v)}
          />

          {/* Main Content — wrapped with the A-SAFE branded title-block frame
              so uploaded layouts look like printed deliverables on open. */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
            <TitleBlockFrame
              ref={titleBlockFrameRef}
              meta={titleBlockMeta}
              barrierKey={barrierKey}
              onEditMeta={() => setShowTitleBlockEditor(true)}
              onExportPdf={handleExportPdf}
              isPrintPreview={isPrintPreview}
              onTogglePrintPreview={() => setIsPrintPreview((v) => !v)}
              exportProgressLabel={exportProgressLabel}
            >
            <CanvasOverlay
              drawing={drawing}
              isImageFile={isImageFile}
              isBlankCanvas={isBlankCanvas}
              isDwgFile={isDwgFile}
              imageRef={imageRef}
              containerRef={containerRef}
              pdfContainerRef={pdfContainerRef}
              imageBlobUrl={imageLoader.imageBlobUrl}
              pdfBlobUrl={imageLoader.pdfBlobUrl}
              isImageLoading={imageLoader.isImageLoading}
              isPdfLoading={isPdfLoading}
              imagePosition={canvas.imagePosition}
              zoomLevel={canvas.zoomLevel}
              pdfScale={canvas.pdfScale}
              pdfDimensions={pdfDimensions}
              pdfPageNumber={pdfPageNumber}
              pdfNumPages={pdfNumPages}
              currentPath={canvas.currentPath}
              pendingPath={canvas.pendingPath}
              markups={markups}
              isInDrawMode={canvas.isInDrawMode}
              isPanMode={canvas.isPanMode}
              isShiftHeld={canvas.isShiftHeld}
              isDragging={canvas.isDragging}
              isMiddleMouseDown={canvas.isMiddleMouseDown}
              isHighQualityRender={canvas.isHighQualityRender}
              viewMode={viewMode}
              drawingScale={scale.drawingScale}
              cartItems={cartItems}
              isSettingScale={scale.isSettingScale}
              scaleStartPoint={scale.scaleStartPoint}
              scaleEndPoint={scale.scaleEndPoint}
              scaleTempEndPoint={scale.scaleTempEndPoint}
              invalidMarkups={invalidMarkups}
              selectedMarkupId={selectedMarkupId}
              setSelectedMarkupId={setSelectedMarkupId}
              showMarkupMenu={showMarkupMenu}
              setShowMarkupMenu={setShowMarkupMenu}
              markupMenuPosition={markupMenuPosition}
              setMarkupMenuPosition={setMarkupMenuPosition}
              isRepositioning={isRepositioning}
              setIsRepositioning={setIsRepositioning}
              setRepositionMarkupId={setRepositionMarkupId}
              getStrokeWidth={canvas.getStrokeWidth}
              getProductStrokeWidth={canvas.getProductStrokeWidth}
              activeProductWidthMm={activeProductWidthMm}
              lastSnappedEndpoint={canvas.lastSnappedEndpoint}
              getPointRadius={canvas.getPointRadius}
              getMarkerRadius={canvas.getMarkerRadius}
              getMarkerFontSize={canvas.getMarkerFontSize}
              getMarkerStrokeWidth={canvas.getMarkerStrokeWidth}
              getProductColor={getProductColor}
              handleTouchStart={handleTouchStart}
              handleTouchMove={canvas.handleTouchMove}
              handleTouchEnd={handleTouchEnd}
              handlePointerDown={handlePointerDown}
              handlePointerMove={handlePointerMove}
              handlePointerUp={handlePointerUp}
              handleWheel={canvas.handleWheel}
              onImageLoad={handleImageLoad}
              onImageError={handleImageError}
              onPdfLoadSuccess={onPdfLoadSuccess}
              onPdfError={handlePdfError}
              setPdfPageNumber={setPdfPageNumber}
              onDeleteClick={handleDeleteClick}
              onRepositionStart={(markupId) => {
                setIsRepositioning(true);
                setRepositionMarkupId(markupId);
                toast({
                  title: "Reposition Mode",
                  description: "Click anywhere on the drawing to move this markup",
                });
              }}
              toast={toast}
            />
            </TitleBlockFrame>

            {/* Floating Action Buttons */}
            <div
              className="absolute flex flex-col gap-1 sm:gap-2 touch-enhanced"
              style={{
                zIndex: 50,
                top: 'max(0.5rem, env(safe-area-inset-top, 0px) + 0.5rem)',
                left: 'max(0.5rem, env(safe-area-inset-left, 0px) + 0.5rem)',
              }}
            >
              <Button
                onClick={() => {
                  if (!canvas.isInDrawMode) {
                    setShowProductSelector(true);
                    setSelectedCartItem("");
                  } else {
                    canvas.setIsInDrawMode(false);
                    canvas.setCurrentPath(null);
                    canvas.setIsDrawing(false);
                    setPreSelectedProduct("");
                  }
                }}
                className={`h-12 w-12 rounded-full shadow-lg touch-enhanced ${
                  canvas.isInDrawMode ? 'bg-red-600 hover:bg-red-700' : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
                data-testid="toggle-draw-mode"
              >
                {canvas.isInDrawMode ? <X className="h-5 w-5" /> : <Pen className="h-5 w-5" />}
              </Button>

              {(markups && markups.length > 0) || canvas.pendingPath || canvas.currentPath ? (
                <Button
                  onClick={handleAutoAlign}
                  className="h-12 w-12 rounded-full shadow-lg bg-green-600 hover:bg-green-700 text-white touch-enhanced"
                  data-testid="auto-align"
                  disabled={!markups || markups.length === 0}
                >
                  <Wand2 className="h-5 w-5" />
                </Button>
              ) : null}
            </div>

            {/* On-screen zoom controls — critical for desktop precision and
                for tablet/phone users without a mouse wheel. Bottom-left so
                they don't clash with the pen / auto-align buttons at the
                top-left or the PDF pagination at the bottom-centre. Touch
                targets are 44×44px minimum per Apple HIG.
                Hidden in DWG mode since there's no canvas to zoom. */}
            {!isDwgFile && (
              <div
                className="absolute flex flex-col gap-1 bg-black/70 backdrop-blur-sm rounded-lg p-1 shadow-lg"
                style={{
                  zIndex: 50,
                  bottom: 'max(1rem, env(safe-area-inset-bottom, 0px) + 1rem)',
                  left: 'max(1rem, env(safe-area-inset-left, 0px) + 1rem)',
                }}
                data-testid="zoom-controls"
              >
                <button
                  type="button"
                  onClick={() => {
                    const factor = 1.5;
                    if (isImageFile || isBlankCanvas) {
                      canvas.setZoomLevel((z) => Math.min(MAX_ZOOM, z * factor));
                    } else if (isPdfFile) {
                      canvas.setPdfScale((s) => Math.min(MAX_ZOOM, s * factor));
                    }
                  }}
                  className="w-11 h-11 rounded-md text-white hover:bg-white/20 active:bg-white/30 flex items-center justify-center text-lg font-bold"
                  title="Zoom in"
                  aria-label="Zoom in"
                  data-testid="zoom-in"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Re-run fit-to-container using the latest fitRef. Resets
                    // both scale AND position so the drawing is centred.
                    if (isImageFile || isBlankCanvas) {
                      const img = imageRef.current;
                      if (img?.naturalWidth && img?.naturalHeight) {
                        fitRef.current(img.naturalWidth, img.naturalHeight, "image");
                      }
                    } else if (isPdfFile && pdfDimensions.width && pdfDimensions.height) {
                      fitRef.current(pdfDimensions.width, pdfDimensions.height, "pdf");
                    }
                  }}
                  className="w-11 h-11 rounded-md text-white hover:bg-white/20 active:bg-white/30 flex items-center justify-center"
                  title="Fit to window"
                  aria-label="Fit to window"
                  data-testid="zoom-fit"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <path d="M4 9V4h5M15 4h5v5M4 15v5h5M20 15v5h-5" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const factor = 1 / 1.5;
                    if (isImageFile || isBlankCanvas) {
                      canvas.setZoomLevel((z) => Math.max(MIN_ZOOM, z * factor));
                    } else if (isPdfFile) {
                      canvas.setPdfScale((s) => Math.max(MIN_ZOOM, s * factor));
                    }
                  }}
                  className="w-11 h-11 rounded-md text-white hover:bg-white/20 active:bg-white/30 flex items-center justify-center text-xl font-bold"
                  title="Zoom out"
                  aria-label="Zoom out"
                  data-testid="zoom-out"
                >
                  −
                </button>
                {/* Current zoom % read-out — helpful when scale-calibrating */}
                <div className="text-[10px] text-white/80 text-center pt-1 pb-0.5 font-mono tabular-nums">
                  {Math.round(
                    (isImageFile || isBlankCanvas ? canvas.zoomLevel : canvas.pdfScale) * 100
                  )}
                  %
                </div>
              </div>
            )}

            {/* Draw-mode status banner — makes it obvious that the canvas is
                ready to receive strokes and which product is being drawn. */}
            {canvas.isInDrawMode && preSelectedProduct && (() => {
              const active = cartItems.find((i) => i.id === preSelectedProduct);
              const marked = getCartItemWithMarkings(preSelectedProduct);
              const color = getProductColor(preSelectedProduct);
              return (
                <div
                  className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 pointer-events-none"
                  style={{ zIndex: 55 }}
                  data-testid="draw-mode-banner"
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full border border-white"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs font-medium">
                    Drawing {active?.productName || "product"} — click & drag to mark ({marked?.markedCount || 0}/{active?.quantity || 1})
                  </span>
                </div>
              );
            })()}

            {/* Empty-cart nudge — when no product is preselected and there are
                no cart items yet, show a floating hint that points users at the
                pen button so they can open the product selector and inline-add. */}
            {!canvas.isInDrawMode && !preSelectedProduct && cartItems.length === 0 && !imageLoader.isImageLoading && !isPdfLoading && (
              <div
                className="absolute top-2 left-1/2 -translate-x-1/2 bg-primary text-black px-4 py-2 rounded-full shadow-lg flex items-center gap-2 pointer-events-none"
                style={{ zIndex: 55 }}
                data-testid="draw-empty-cart-hint"
              >
                <Pen className="h-4 w-4" />
                <span className="text-xs font-semibold">
                  Tap the pen (top-left) to add barriers to this drawing
                </span>
              </div>
            )}

            {/* Markup List */}
            <MarkupList
              markups={markups}
              isMarkupsExpanded={isMarkupsExpanded}
              setIsMarkupsExpanded={setIsMarkupsExpanded}
              isScaleSet={scale.isScaleSet}
              drawing={drawing}
              getCartItemWithMarkings={getCartItemWithMarkings}
              getProductColor={getProductColor}
              onDeleteClick={handleDeleteClick}
              onTransferToCart={() => {}}
              hapticSuccess={() => haptic.success()}
              toast={toast}
              queryClient={queryClient}
              onClose={onClose}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Selector Modal */}
      <ProductSidebar
        showProductSelector={showProductSelector}
        setShowProductSelector={setShowProductSelector}
        cartItems={cartItems}
        selectedCartItem={selectedCartItem}
        setSelectedCartItem={setSelectedCartItem}
        preSelectedProduct={preSelectedProduct}
        setPreSelectedProduct={setPreSelectedProduct}
        setIsInDrawMode={(mode) => canvas.setIsInDrawMode(mode)}
        getCartItemWithMarkings={getCartItemWithMarkings}
        getProductColor={getProductColor}
        onNavigateToProducts={() => {
          setShowProductSelector(false);
          setLocation('/products');
        }}
        onStartDrawing={() => {}}
        onAddProductToCart={async (name, quantity) => {
          // Inline add: hit the cart endpoint directly so we can return the
          // created item for immediate selection inside the ProductSidebar.
          try {
            const res = await apiRequest("/api/cart", "POST", { productName: name, quantity });
            const newItem = await res.json();
            queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
            return newItem;
          } catch (err) {
            toast({
              title: "Error",
              description: "Failed to add product to cart.",
              variant: "destructive",
            });
            return null;
          }
        }}
        toast={toast}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={(open) => {
        setShowDeleteConfirm(open);
        if (!open) {
          setMarkupToDelete(null);
        }
      }}>
        <AlertDialogContent className="z-[100025]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Markup</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this barrier placement marking? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDeleteConfirm(false);
              setMarkupToDelete(null);
            }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Title-block metadata editor */}
      <TitleBlockEditor
        isOpen={showTitleBlockEditor}
        onOpenChange={setShowTitleBlockEditor}
        initial={titleBlockMeta}
        onSave={async (meta) => {
          await updateTitleBlockMutation.mutateAsync(meta);
        }}
      />

      {/* Help Guide Dialog */}
      <Dialog open={showHelpGuide} onOpenChange={setShowHelpGuide}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md mx-4 sm:mx-auto bg-gray-800 text-white border-gray-700 z-[100010]" aria-describedby="help-guide-description" style={{ zIndex: 100010 }}>
          <DialogHeader>
            <DialogTitle className="text-white">Drawing Tool Guide</DialogTitle>
            <DialogDescription id="help-guide-description" className="sr-only">
              Instructions for using the drawing tools
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 text-sm">
            <div>
              <h4 className="font-semibold mb-3 text-yellow-400 flex items-center gap-2">
                {"📱"} Mobile & Touch Device Controls
              </h4>
              <div className="space-y-2 pl-4">
                <div>{"•"} <strong>Pinch & spread</strong> - Zoom in/out</div>
                <div>{"•"} <strong>Two fingers drag</strong> - Pan around layout</div>
                <div>{"•"} <strong>Tap pen button</strong> - Toggle drawing mode on/off</div>
                <div>{"•"} <strong>Touch & drag</strong> - Draw barrier lines (when pen active)</div>
                <div>{"•"} <strong>Single tap on 1-9</strong> - Place numbered product marker</div>
                <div>{"•"} <strong>One finger drag</strong> - Pan layout (when pen inactive)</div>
                <div>{"•"} <strong>Long press marker</strong> - Open marker menu (link/delete)</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-3 text-blue-400 flex items-center gap-2">
                {"🖥️"} Desktop & Laptop Controls
              </h4>
              <div className="space-y-2 pl-4">
                <div>{"•"} <span className="font-mono bg-gray-700 px-1 rounded text-yellow-300">Mouse Wheel</span> - Zoom in/out</div>
                <div>{"•"} <span className="font-mono bg-gray-700 px-1 rounded text-yellow-300">Click Pen Button</span> - Toggle drawing mode</div>
                <div>{"•"} <span className="font-mono bg-gray-700 px-1 rounded text-yellow-300">Left Click + Drag</span> - Draw lines (pen active) / Pan (pen inactive)</div>
                <div>{"•"} <span className="font-mono bg-gray-700 px-1 rounded text-yellow-300">Click 1-9 Button</span> - Place numbered product marker</div>
                <div>{"•"} <span className="font-mono bg-gray-700 px-1 rounded text-yellow-300">Right Click Marker</span> - Open marker menu (link/delete)</div>
                <div>{"•"} <span className="font-mono bg-gray-700 px-1 rounded text-yellow-300">Middle Click</span> - Temporary pan mode</div>
                <div>{"•"} <span className="font-mono bg-gray-700 px-1 rounded text-yellow-300">Shift + Drag</span> - Force pan (even in draw mode)</div>
                <div>{"•"} <span className="font-mono bg-gray-700 px-1 rounded text-yellow-300">Escape</span> - Exit drawing mode</div>
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-3 text-green-400 flex items-center gap-2">
                {"⚡"} General Workflow
              </h4>
              <div className="space-y-2 pl-4">
                <div>1. <strong>Upload/Create</strong> - Upload layout drawing or start with blank canvas</div>
                <div>2. <strong>Set Scale</strong> - Calibrate drawing scale for accurate measurements</div>
                <div>3. <strong>Draw Barriers</strong> - Use pen tool to mark barrier locations</div>
                <div>4. <strong>Place Markers</strong> - Add numbered markers (1-9) for specific products</div>
                <div>5. <strong>Link Products</strong> - Connect markers to products in your cart</div>
                <div>6. <strong>Auto-Straighten</strong> - System automatically detects and straightens lines</div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-700 flex gap-3">
              <Button
                onClick={() => setShowHelpGuide(false)}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-black dark:text-black font-medium"
              >
                {"✏️"} Start Drawing
              </Button>
              <Button
                onClick={() => setShowHelpGuide(false)}
                variant="outline"
                className="border-gray-600 text-gray-300 hover:bg-gray-700"
              >
                Close Guide
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Scale Calibration Dialog */}
      <Dialog open={scale.showScaleDialog} onOpenChange={scale.setShowScaleDialog}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md mx-4 sm:mx-auto z-[100010]" aria-describedby="scale-dialog-description" style={{ zIndex: 100010 }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-yellow-500" />
              Set Drawing Scale
            </DialogTitle>
            <DialogDescription id="scale-dialog-description" className="sr-only">
              Set the drawing scale for accurate barrier length calculations
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-900">
                To enable accurate barrier length calculations, please calibrate your drawing scale by marking a known dimension.
              </p>
            </div>

            {!scale.isSettingScale && !scale.scaleStartPoint && (
              <div className="text-center py-4">
                <Button
                  onClick={() => {
                    scale.setIsSettingScale(true);
                    scale.setShowScaleDialog(false);
                    scale.setScaleZoomLevel(canvas.zoomLevel || canvas.pdfScale);
                    scale.setScaleTempEndPoint(null);
                    toast({
                      title: "Scale Calibration Mode",
                      description: "Click on the start point of a known dimension"
                    });
                  }}
                  className="bg-yellow-500 hover:bg-yellow-600 text-black dark:text-black"
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  Start Calibration
                </Button>
              </div>
            )}

            {(scale.scaleStartPoint && scale.scaleEndPoint) && (
              <div className="space-y-3">
                <div className="text-sm text-gray-600">
                  Line marked successfully. Enter the actual length:
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={scale.actualLength}
                    onChange={(e) => scale.setActualLength(e.target.value)}
                    placeholder="Enter length"
                    className="flex-1"
                  />
                  <span className="text-sm text-gray-500">mm</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSetScale}
                    disabled={!scale.actualLength || parseFloat(scale.actualLength) <= 0}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Set Scale
                  </Button>
                  <Button
                    onClick={() => {
                      scale.resetCalibration();
                      scale.setActualLength("");
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                </div>
              </div>
            )}

            {!scale.isSettingScale && scale.isScaleSet && (
              <div className="space-y-3">
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <p className="text-sm text-green-900">
                    {"✓"} Scale is set. Barrier lengths will be calculated automatically.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    scale.setIsSettingScale(true);
                    scale.setShowScaleDialog(false);
                    scale.resetCalibration();
                    scale.setScaleZoomLevel(canvas.zoomLevel || canvas.pdfScale);
                    toast({
                      title: "Recalibrate Scale",
                      description: "Click on the start point of a known dimension"
                    });
                  }}
                  variant="outline"
                  className="w-full"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Recalibrate Scale
                </Button>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  scale.setShowScaleDialog(false);
                  if (!scale.isScaleSet) {
                    toast({
                      title: "Scale Not Set",
                      description: "Barrier lengths won't be calculated",
                      variant: "destructive"
                    });
                  }
                }}
                variant="outline"
              >
                Skip for Now
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
