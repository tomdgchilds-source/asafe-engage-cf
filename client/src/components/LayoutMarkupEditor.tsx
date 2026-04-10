import { useState, useRef, useEffect, useCallback } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Pen, Save, Trash2, Check, Plus, ShoppingCart, Move, Info, Wand2, RotateCcw, Package } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Document, Page, pdfjs } from 'react-pdf';
import { useToast } from "@/hooks/use-toast";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { LayoutDrawing, LayoutMarkup } from "@shared/schema";

// Set PDF.js worker to use local static file served from public directory
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// Mobile-optimized PDF.js configuration
const pdfOptions = {
  cMapUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/cmaps/',
  cMapPacked: true,
  disableWorker: false,
  // Mobile performance optimizations
  renderInteractiveForms: false,
  enableXfa: false,
  // Enhanced mobile rendering settings
  verbosity: 0, // Reduce logging overhead
  maxImageSize: 16777216, // 16MB limit for mobile
  standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/',
  // Better memory management on mobile
  useOnlyCssZoom: true,
  textLayerMode: 0, // Disable text layer for better performance
  disableAutoFetch: false,
  disableStream: false,
  disableRange: false,
  // Mobile-specific optimizations
  isEvalSupported: false // Better security and performance
};

interface CartItem {
  id: string;
  productName: string;
  quantity: number;
}

interface LayoutMarkupEditorProps {
  isOpen: boolean;
  onClose: () => void;
  drawing: LayoutDrawing | null;
  cartItems: CartItem[];
}

interface DrawingPoint {
  x: number;
  y: number;
}

interface MarkupPath {
  id?: string;
  points: DrawingPoint[];
  cartItemId?: string;
  productName?: string;
  comment?: string;
  color?: string;
}

export function LayoutMarkupEditor({ isOpen, onClose, drawing, cartItems }: LayoutMarkupEditorProps) {
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const queryClient = useQueryClient();
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  
  const [markups, setMarkups] = useState<LayoutMarkup[]>([]);
  const [currentPath, setCurrentPath] = useState<MarkupPath | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isInDrawMode, setIsInDrawMode] = useState(false);
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [pendingPath, setPendingPath] = useState<MarkupPath | null>(null);
  const [preSelectedProduct, setPreSelectedProduct] = useState<string>("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [markupToDelete, setMarkupToDelete] = useState<string | null>(null);
  const [showTrashDialog, setShowTrashDialog] = useState(false);

  // Simple color system for products
  const productColors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', 
    '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1',
    '#14B8A6', '#F43F5E', '#A855F7', '#22C55E', '#EAB308'
  ];

  const getProductColor = (cartItemId: string) => {
    const index = cartItems.findIndex(item => item.id === cartItemId);
    return index !== -1 ? productColors[index % productColors.length] : '#6B7280';
  };
  
  const [selectedCartItem, setSelectedCartItem] = useState<string>("");
  const [comment, setComment] = useState("");
  const [barrierRunLengths, setBarrierRunLengths] = useState<string[]>([]);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, clientX: 0, clientY: 0 });
  const [velocity, setVelocity] = useState({ x: 0, y: 0 });
  const animationRef = useRef<number | null>(null);
  const [pdfNumPages, setPdfNumPages] = useState<number>(1);
  const [pdfPageNumber, setPdfPageNumber] = useState<number>(1);
  const [pdfScale, setPdfScale] = useState<number>(1.0); // Start with lower scale for better performance
  const [pdfRenderKey, setPdfRenderKey] = useState<number>(0); // Key to force re-render
  const [isZooming, setIsZooming] = useState<boolean>(false); // Track zoom state
  const zoomDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const transformRef = useRef<{ x: number; y: number; scale: number }>({ x: 0, y: 0, scale: 1 });
  const smoothZoomRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const [pdfDimensions, setPdfDimensions] = useState<{ width: number; height: number }>({ width: 800, height: 1100 });
  const [isImageLoading, setIsImageLoading] = useState<boolean>(true);
  const [isPdfLoading, setIsPdfLoading] = useState<boolean>(true);
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  const [lastPinchDistance, setLastPinchDistance] = useState<number>(0);
  const [isPinching, setIsPinching] = useState<boolean>(false);
  const [activeTouches, setActiveTouches] = useState<number>(0);
  const [isMarkupsExpanded, setIsMarkupsExpanded] = useState<boolean>(false);
  const [autoCollapseTimer, setAutoCollapseTimer] = useState<NodeJS.Timeout | null>(null);
  const [isMiddleMouseDown, setIsMiddleMouseDown] = useState<boolean>(false);
  const [isPanMode, setIsPanMode] = useState<boolean>(false);
  const [isShiftHeld, setIsShiftHeld] = useState<boolean>(false);
  const [isCtrlHeld, setIsCtrlHeld] = useState<boolean>(false);
  const [showHelpGuide, setShowHelpGuide] = useState<boolean>(false);
  
  // Performance optimization states
  const [isHighQualityRender, setIsHighQualityRender] = useState<boolean>(true);
  const renderDebounceRef = useRef<NodeJS.Timeout | null>(null);
  
  // Length validation state
  const [invalidMarkups, setInvalidMarkups] = useState<Set<string>>(new Set());
  const [markupValidation, setMarkupValidation] = useState<Map<string, {expected: number, actual: number}>>(new Map());
  const [selectedMarkupId, setSelectedMarkupId] = useState<string | null>(null);
  const [showMarkupMenu, setShowMarkupMenu] = useState(false);
  const [markupMenuPosition, setMarkupMenuPosition] = useState({ x: 0, y: 0 });
  const [isRepositioning, setIsRepositioning] = useState(false);
  const [repositionMarkupId, setRepositionMarkupId] = useState<string | null>(null);
  
  // Scale calibration states
  const [showScaleDialog, setShowScaleDialog] = useState<boolean>(false);
  const [isSettingScale, setIsSettingScale] = useState<boolean>(false);
  const [scaleStartPoint, setScaleStartPoint] = useState<DrawingPoint | null>(null);
  const [scaleEndPoint, setScaleEndPoint] = useState<DrawingPoint | null>(null);
  const [scaleTempEndPoint, setScaleTempEndPoint] = useState<DrawingPoint | null>(null); // For real-time line preview
  const [actualLength, setActualLength] = useState<string>("");
  const [drawingScale, setDrawingScale] = useState<number | null>(null);
  const [isScaleSet, setIsScaleSet] = useState<boolean>(false);
  const [scaleZoomLevel, setScaleZoomLevel] = useState<number>(1);

  // Determine if the file is an image or blank canvas (moved here to fix initialization error)
  const isImageFile = drawing?.fileType === 'image' || 
    (drawing?.fileName?.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp)$/) !== null);
  
  const isBlankCanvas = drawing?.fileType === 'canvas' || drawing?.fileUrl === 'blank-canvas';

  // Dynamic stroke width calculation based on zoom level - ultra-thin lines for precision
  const getStrokeWidth = useCallback((baseWidth: number) => {
    if (isImageFile || isBlankCanvas) {
      // For images and blank canvas: scale inversely with zoom level
      const dynamicWidth = (baseWidth * 0.15) / zoomLevel;
      return Math.max(0.05, Math.min(dynamicWidth, 0.5));
    } else {
      // For PDFs: use consistent scaling based on PDF dimensions
      const scaleFactor = pdfDimensions.width > 0 ? pdfDimensions.width / 800 : 1;
      return baseWidth * scaleFactor;
    }
  }, [zoomLevel, isImageFile, isBlankCanvas, pdfDimensions.width]);

  const getPointRadius = useCallback((baseRadius: number) => {
    if (isImageFile || isBlankCanvas) {
      // For images and blank canvas: scale inversely with zoom level  
      const dynamicRadius = (baseRadius * 0.2) / zoomLevel;
      return Math.max(0.1, Math.min(dynamicRadius, 0.8));
    } else {
      // For PDFs: use consistent scaling based on PDF dimensions
      const scaleFactor = pdfDimensions.width > 0 ? pdfDimensions.width / 800 : 1;
      return baseRadius * scaleFactor;
    }
  }, [zoomLevel, isImageFile, isBlankCanvas, pdfDimensions.width]);

  // Scale-independent marker size functions for numbered product markers
  // These maintain constant screen size regardless of zoom level
  const getMarkerRadius = useCallback((baseRadius: number) => {
    if (isImageFile || isBlankCanvas) {
      // Keep markers the same size on screen by scaling inversely with zoom
      // Ensure minimum visibility
      const scaledRadius = baseRadius / zoomLevel;
      return Math.max(scaledRadius, baseRadius * 0.5);
    } else {
      // For PDFs: scale based on PDF scale to maintain consistency
      const scaledRadius = baseRadius / pdfScale;
      return Math.max(scaledRadius, baseRadius * 0.5);
    }
  }, [zoomLevel, isImageFile, isBlankCanvas, pdfScale]);

  const getMarkerFontSize = useCallback((baseFontSize: number) => {
    if (isImageFile || isBlankCanvas) {
      // Keep font the same size on screen by scaling inversely with zoom
      return baseFontSize / zoomLevel;
    } else {
      // For PDFs: scale based on PDF scale to maintain consistency
      return baseFontSize / pdfScale;
    }
  }, [zoomLevel, isImageFile, isBlankCanvas, pdfScale]);

  const getMarkerStrokeWidth = useCallback((baseWidth: number) => {
    if (isImageFile || isBlankCanvas) {
      // Keep stroke the same size on screen by scaling inversely with zoom
      return baseWidth / zoomLevel;
    } else {
      // For PDFs: scale based on PDF scale to maintain consistency
      return baseWidth / pdfScale;
    }
  }, [zoomLevel, isImageFile, isBlankCanvas, pdfScale]);


  // Desktop interaction states
  const [mouseClickStartTime, setMouseClickStartTime] = useState<number>(0);
  const [mouseClickStartPos, setMouseClickStartPos] = useState<{x: number, y: number}>({x: 0, y: 0});

  const { data: existingMarkups = [] } = useQuery<LayoutMarkup[]>({
    queryKey: ["/api/layout-drawings", drawing?.id, "markups"],
    enabled: !!drawing?.id && isOpen,
  });

  // Track if help guide has been shown for this drawing session
  const [hasShownHelpGuide, setHasShownHelpGuide] = useState<boolean>(false);

  // Sync existing markups from database with local state
  useEffect(() => {
    if (existingMarkups && existingMarkups.length > 0) {
      setMarkups(existingMarkups);
    }
  }, [existingMarkups]);

  useEffect(() => {
    if (isOpen && drawing?.id) {
      
      // Set scale if it exists
      if (drawing.scale && drawing.isScaleSet) {
        setDrawingScale(drawing.scale);
        setIsScaleSet(true);
        if (drawing.scaleLine && typeof drawing.scaleLine === 'object' && 'zoomLevel' in drawing.scaleLine) {
          setScaleZoomLevel((drawing.scaleLine as any).zoomLevel || 1);
        }
      } else if (!isScaleSet && !hasShownHelpGuide) {
        // Don't automatically show scale dialog - let user trigger it
        setHasShownHelpGuide(true);
        // Show a helpful toast instead
        toast({
          title: "Scale Not Set",
          description: "Click the wand icon to calibrate the drawing scale for accurate barrier length calculations.",
          duration: 5000,
        });
      }
      
      // Only auto-show help guide when drawing tool first loads, not after saving markups
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
        setIsImageLoading(true);
        setIsPdfLoading(false);
      } else {
        setIsPdfLoading(true);
        setIsImageLoading(false);
      }
    }
  }, [drawing?.id, drawing?.fileType, drawing?.fileName, isOpen]);

  // Fix the barrier run lengths initialization to comply with Rules of Hooks
  useEffect(() => {
    if (pendingPath) {
      const corners = detectCorners(pendingPath.points);
      const segments = Math.max(1, corners + 1);
      
      if (barrierRunLengths.length !== segments) {
        setBarrierRunLengths(new Array(segments).fill(''));
      }
    }
  }, [pendingPath, barrierRunLengths.length]);

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
      setCurrentPath(null);
      setPendingPath(null);
      setSelectedCartItem("");
      setComment("");
      setShowProductSelector(false);
      setIsInDrawMode(false);
      // Reset help guide state so it doesn't show again after completing actions
      setHasShownHelpGuide(true);
      
      // Check if all quantity is marked for this product
      const savedCartItemId = newMarkupData.cartItemId as string;
      const cartItem = cartItems.find(item => item.id === savedCartItemId);
      if (cartItem) {
        const updatedMarkings = getCartItemWithMarkings(savedCartItemId);
        const newMarkedCount = (updatedMarkings?.markedCount || 0) + 1;
        
        if (newMarkedCount >= cartItem.quantity) {
          // All items marked - notify and clear selection
          toast({
            title: "Product Fully Marked!",
            description: `All ${cartItem.quantity} units of ${cartItem.productName} have been marked. Please select another product.`,
            duration: 5000,
          });
          setPreSelectedProduct("");
          setIsInDrawMode(false);
        } else {
          // More items remain - keep product selected
          toast({
            title: "Drawing Saved!",
            description: `Marked ${newMarkedCount}/${cartItem.quantity} ${cartItem.productName}. Continue drawing.`,
          });
          // Keep the same product selected for next drawing
          setIsInDrawMode(true);
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
      // Update local state to remove the deleted markup
      setMarkups(currentMarkups => currentMarkups.filter(m => m.id !== deletedId));
      // Close the delete confirmation dialog after successful deletion
      setShowDeleteConfirm(false);
      setMarkupToDelete(null);
      toast({
        title: "Markup Deleted",
        description: "Barrier placement marking has been removed.",
      });
    },
    onError: () => {
      // Close dialog even on error
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

  // Handler for confirming delete
  const handleDeleteConfirm = () => {
    if (markupToDelete) {
      deleteMarkupMutation.mutate(markupToDelete);
      // Don't close dialog here - let the mutation handlers do it
    }
  };

  // Handler for clicking delete button - shows confirmation first
  const handleDeleteClick = (markupId: string) => {
    setMarkupToDelete(markupId);
    setShowDeleteConfirm(true);
  };

  // Add new product to cart
  const addProductToCartMutation = useMutation({
    mutationFn: async (productData: { productName: string; quantity: number }) => {
      return apiRequest("/api/cart", "POST", productData);
    },
    onSuccess: async (response) => {
      const newProduct = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      
      if (pendingPath) {
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

  // Convert screen coordinates to SVG coordinates that are locked to the image
  const getRelativeCoordinates = (clientX: number, clientY: number) => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return { x: 0, y: 0 };

    // Get screen coordinates relative to the main container
    const screenX = clientX - containerRect.left;
    const screenY = clientY - containerRect.top;
    
    if ((isImageFile || isBlankCanvas) && imageRef.current) {
      // For images and blank canvas: Convert to image's natural coordinate system
      const naturalWidth = imageRef.current.naturalWidth || 4000; // 4000 for blank canvas
      const naturalHeight = imageRef.current.naturalHeight || 4000;
      
      // Account for zoom and position to get coordinates in image space
      const imageX = (screenX - imagePosition.x) / zoomLevel;
      const imageY = (screenY - imagePosition.y) / zoomLevel;
      
      // Return coordinates in the image's natural dimensions
      // Allow coordinates to extend beyond bounds for unified canvas behavior
      return {
        x: imageX,
        y: imageY
      };
    } else {
      // For PDFs: Use the actual PDF dimensions for coordinate mapping
      // The PDF is rendered at width * scale, and SVG uses the same dimensions
      
      // Get the rendered PDF dimensions
      const renderedPdfWidth = (containerRef.current?.offsetWidth || 800) * pdfScale;
      const renderedPdfHeight = renderedPdfWidth * (pdfDimensions.height / pdfDimensions.width);
      
      // Convert screen coordinates to PDF coordinates
      // Remove the pan offset to get position relative to PDF origin
      const pdfX = (screenX - imagePosition.x);
      const pdfY = (screenY - imagePosition.y);
      
      // Map to the PDF's actual coordinate system (using real PDF dimensions)
      // The coordinates should be in the PDF's natural coordinate space
      const normalizedX = (pdfX / renderedPdfWidth) * pdfDimensions.width;
      const normalizedY = (pdfY / renderedPdfHeight) * pdfDimensions.height;
      
      return {
        x: normalizedX,
        y: normalizedY
      };
    }
  };

  // Optimized touch handlers for Google Maps-like smoothness
  const handleTouchStart = (event: React.TouchEvent) => {
    const touches = event.touches.length;
    setActiveTouches(touches);

    // Cancel any ongoing smooth animations
    if (smoothZoomRef.current) {
      cancelAnimationFrame(smoothZoomRef.current);
      smoothZoomRef.current = null;
    }

    if (touches === 2) {
      // Two fingers - start pinch gesture and pan
      event.preventDefault();
      setIsPinching(true);
      setIsDragging(false);
      setIsDrawing(false);
      const distance = getDistance(event.touches[0], event.touches[1]);
      setLastPinchDistance(distance);
      
      // Setup for two-finger pan - store current position for smoother movement
      const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      setDragStart({
        x: imagePosition.x,
        y: imagePosition.y,
        clientX: centerX,
        clientY: centerY
      });
      
      // Update transform ref for smooth calculations
      transformRef.current = {
        x: imagePosition.x,
        y: imagePosition.y,
        scale: isImageFile ? zoomLevel : pdfScale
      };
    } else if (touches === 1 && !isPinching) {
      const touch = event.touches[0];
      
      // Always allow panning as the default behavior
      // Only start drawing if explicitly in draw mode AND have a product selected
      if (isInDrawMode && preSelectedProduct && !isPanMode && !isShiftHeld) {
        // Start drawing
        haptic.draw();
        const coords = getRelativeCoordinatesOptimized(touch.clientX, touch.clientY);
        
        // Check if the selected product has available quantity
        const itemWithMarkings = getCartItemWithMarkings(preSelectedProduct);
        const cartItem = cartItems.find(item => item.id === preSelectedProduct);
        if (itemWithMarkings && cartItem && itemWithMarkings.markedCount >= cartItem.quantity) {
          toast({
            title: "Quantity Limit Reached",
            description: `All ${cartItem.quantity} units of ${cartItem.productName} have been marked. Add more to cart to continue.`,
            variant: "destructive",
          });
          setIsInDrawMode(false);
          setPreSelectedProduct("");
          return;
        }
        
        // Start drawing
        setIsDrawing(true);
        const color = getProductColor(preSelectedProduct);
        setCurrentPath({
          points: [coords],
          cartItemId: preSelectedProduct,
          color: color
        });
      } else {
        // Start panning - default behavior for navigation
        // This ensures panning always works
        setIsDragging(true);
        setIsDrawing(false);
        setDragStart({
          x: imagePosition.x,
          y: imagePosition.y,
          clientX: touch.clientX,
          clientY: touch.clientY
        });
        
        // Update transform ref for smooth panning
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
    
    // Throttle touch events for optimal performance (60fps target)
    if (now - lastFrameTimeRef.current < 16.67) {
      return;
    }
    lastFrameTimeRef.current = now;
    
    if (event.touches.length === 2 && isPinching && containerRef.current) {
      event.preventDefault();
      // High-performance pinch zoom and two-finger pan
      const distance = getDistance(event.touches[0], event.touches[1]);
      
      // Calculate center for panning
      const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      const centerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      
      // Improved pan calculation using deltas for smoother movement
      const deltaX = centerX - dragStart.clientX;
      const deltaY = centerY - dragStart.clientY;
      const newPanPosition = {
        x: dragStart.x + deltaX,
        y: dragStart.y + deltaY
      };
      
      if (lastPinchDistance > 0) {
        const rawScale = distance / lastPinchDistance;
        // Smooth scale calculation with momentum
        const scale = rawScale;
        const containerRect = containerRef.current.getBoundingClientRect();
        const pinchCenterX = (event.touches[0].clientX + event.touches[1].clientX) / 2 - containerRect.left;
        const pinchCenterY = (event.touches[0].clientY + event.touches[1].clientY) / 2 - containerRect.top;
        
        if (isImageFile) {
          const newZoom = Math.min(Math.max(zoomLevel * scale, 0.1), 10); // Reduced max zoom for performance
          // Reduced threshold for smoother zoom
          if (Math.abs(newZoom - zoomLevel) > 0.005) {
            const unscaledX = (pinchCenterX - newPanPosition.x) / zoomLevel;
            const unscaledY = (pinchCenterY - newPanPosition.y) / zoomLevel;
            
            const zoomedPosition = {
              x: pinchCenterX - (unscaledX * newZoom),
              y: pinchCenterY - (unscaledY * newZoom)
            };

            // Update transform ref for immediate visual feedback
            transformRef.current = {
              x: zoomedPosition.x,
              y: zoomedPosition.y,
              scale: newZoom
            };

            // Use RAF for smooth updates
            if (!smoothZoomRef.current) {
              smoothZoomRef.current = requestAnimationFrame(() => {
                setImagePosition(zoomedPosition);
                setZoomLevel(newZoom);
                smoothZoomRef.current = null;
              });
            }
          }
        } else {
          const newScale = Math.min(Math.max(pdfScale * scale, 0.1), 5); // Reduced max scale for PDF performance
          // Reduced threshold for PDF zoom
          if (Math.abs(newScale - pdfScale) > 0.005) {
            const unscaledX = (pinchCenterX - newPanPosition.x) / pdfScale;
            const unscaledY = (pinchCenterY - newPanPosition.y) / pdfScale;
            
            const zoomedPosition = {
              x: pinchCenterX - (unscaledX * newScale),
              y: pinchCenterY - (unscaledY * newScale)
            };

            // Update transform ref for immediate visual feedback
            transformRef.current = {
              x: zoomedPosition.x,
              y: zoomedPosition.y,
              scale: newScale
            };

            // Use RAF for smooth PDF zoom
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
        // Update position immediately for responsive pan feel
        transformRef.current = {
          x: newPanPosition.x,
          y: newPanPosition.y,
          scale: transformRef.current.scale
        };
        setImagePosition(newPanPosition);
      }
      
      // Update last distance for next frame
      setLastPinchDistance(distance);
    } else if (event.touches.length === 1 && !isPinching) {
      const touch = event.touches[0];
      
      if (isDrawing && currentPath) {
        // Continue drawing with optimized coordinates
        const coords = getRelativeCoordinatesOptimized(touch.clientX, touch.clientY);
        
        const lastPoint = currentPath.points[currentPath.points.length - 1];
        const distance = Math.sqrt(
          Math.pow(coords.x - lastPoint.x, 2) + Math.pow(coords.y - lastPoint.y, 2)
        );
        
        if (distance > 0.1) { // Lower threshold for smoother real-time drawing
          setCurrentPath(prev => prev ? {
            ...prev,
            points: [...prev.points, coords]
          } : null);
        }
      } else if (isDragging && !isDrawing && !isPinching) {
        // High-performance pan with single finger
        event.preventDefault();
        
        const deltaX = touch.clientX - dragStart.clientX;
        const deltaY = touch.clientY - dragStart.clientY;
        const newPosition = {
          x: dragStart.x + deltaX,
          y: dragStart.y + deltaY,
        };
        
        // Update transform ref for immediate visual feedback
        transformRef.current = {
          x: newPosition.x,
          y: newPosition.y,
          scale: transformRef.current.scale
        };
        
        // Track velocity for momentum scrolling
        setVelocity({
          x: deltaX * 0.05,
          y: deltaY * 0.05
        });
        
        // Direct state update for immediate response
        setImagePosition(newPosition);
      }
    }
  }, [isPinching, dragStart, zoomLevel, pdfScale, imagePosition, isDrawing, isDragging, currentPath, isImageFile, imageRef, lastPinchDistance]);

  // Add smooth inertial scrolling effect
  useEffect(() => {
    if (!isDragging && (Math.abs(velocity.x) > 0.5 || Math.abs(velocity.y) > 0.5)) {
      animationRef.current = requestAnimationFrame(() => {
        setImagePosition(prev => ({
          x: prev.x + velocity.x,
          y: prev.y + velocity.y
        }));
        setVelocity(prev => ({
          x: prev.x * 0.95, // Friction
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

  const handleTouchEnd = (event: React.TouchEvent) => {
    const touches = event.touches.length;
    setActiveTouches(touches);

    if (touches === 0) {
      // All fingers lifted
      if (isDrawing) {
        // Finish drawing with pre-selected product
        if (currentPath && currentPath.points.length >= 2 && preSelectedProduct) {
          const cartItem = cartItems.find(item => item.id === preSelectedProduct);
          if (cartItem) {
            const firstPoint = currentPath.points[0];
            const cornerCount = detectCorners(currentPath.points);
            
            const calculatedLength = calculateBarrierLength(currentPath.points);
            createMarkupMutation.mutate({
              cartItemId: preSelectedProduct,
              productName: cartItem.productName,
              xPosition: firstPoint.x,
              yPosition: firstPoint.y,
              pathData: JSON.stringify(currentPath.points),
              comment: undefined,
              calculatedLength: calculatedLength || undefined,
            });
            
            // Add corner posts if detected
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
            
            // Check if more items remain after this one
            const itemWithMarkings = getCartItemWithMarkings(preSelectedProduct);
            if (itemWithMarkings && (itemWithMarkings.markedCount + 1) < cartItem.quantity) {
              // More items to mark - keep product selected and stay in draw mode
              setIsInDrawMode(true);
              setCurrentPath(null);
              setIsDrawing(false); // Reset drawing state but keep in draw mode
              // Keep preSelectedProduct - don't clear it
            } else {
              // All items will be marked after this - clear selection
              setPreSelectedProduct("");
              setIsInDrawMode(false);
              setCurrentPath(null);
              setIsDrawing(false);
            }
          } else {
            setIsDrawing(false);
            setCurrentPath(null);
            setIsInDrawMode(false);
            setPreSelectedProduct("");
          }
        } else {
          setIsDrawing(false);
          setCurrentPath(null);
        }
      } else {
        // Not in drawing state
        setIsDrawing(false);
      }
      
      setIsDragging(false);
      setIsPinching(false);
      setLastPinchDistance(0);
      setDragStart({ x: 0, y: 0, clientX: 0, clientY: 0 });
    } else if (touches === 1 && isPinching) {
      // One finger remaining, switch from pinch to pan
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

  // Enhanced mouse handlers for desktop
  const handlePointerDown = (event: React.PointerEvent) => {
    // Close context menu if clicking outside
    if (showMarkupMenu) {
      setShowMarkupMenu(false);
      setSelectedMarkupId(null);
    }
    
    if (event.pointerType === 'touch') return; // Handle with touch events
    event.preventDefault();

    // Record click start time and position for click detection
    setMouseClickStartTime(Date.now());
    setMouseClickStartPos({x: event.clientX, y: event.clientY});

    // Handle repositioning mode
    if (isRepositioning && repositionMarkupId && event.button === 0) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      // Convert to normalized coordinates - use the same system as getRelativeCoordinates
      const coords = getRelativeCoordinates(event.clientX, event.clientY);
      const normalizedX = coords.x;
      const normalizedY = coords.y;
      
      // Find the markup to reposition
      const markupToReposition = markups.find(m => m.id === repositionMarkupId);
      if (markupToReposition) {
        const points = parsePathData(markupToReposition);
        if (points.length > 0) {
          // Calculate offset from the first point
          const offsetX = normalizedX - points[0].x;
          const offsetY = normalizedY - points[0].y;
          
          // Apply offset to all points
          const newPoints = points.map(p => ({
            x: p.x + offsetX,
            y: p.y + offsetY
          }));
          
          // Update the markup
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
      
      // Exit repositioning mode
      setIsRepositioning(false);
      setRepositionMarkupId(null);
      setSelectedMarkupId(null);
      return;
    }

    // Handle scale calibration mode
    if (isSettingScale && event.button === 0) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      // Convert to normalized coordinates - use the same system as getRelativeCoordinates
      const coords = getRelativeCoordinates(event.clientX, event.clientY);
      const normalizedX = coords.x;
      const normalizedY = coords.y;
      
      if (!scaleStartPoint) {
        setScaleStartPoint({ x: normalizedX, y: normalizedY });
        toast({
          title: "Start Point Set",
          description: "Now click on the end point of the known dimension"
        });
      } else if (!scaleEndPoint) {
        setScaleEndPoint({ x: normalizedX, y: normalizedY });
        setScaleTempEndPoint(null); // Clear the temporary end point
        setShowScaleDialog(true);
        setIsSettingScale(false);
        toast({
          title: "End Point Set", 
          description: "Enter the actual length of this dimension"
        });
      }
      return;
    }

    // Middle mouse button for panning
    if (event.button === 1) {
      setIsMiddleMouseDown(true);
      setIsDragging(true);
      setDragStart({
        x: event.clientX - imagePosition.x,
        y: event.clientY - imagePosition.y,
        clientX: event.clientX,
        clientY: event.clientY
      });
      return;
    }

    // Right click - prevent context menu and enter pan mode temporarily
    if (event.button === 2) {
      event.preventDefault();
      setIsDragging(true);
      setDragStart({
        x: event.clientX - imagePosition.x,
        y: event.clientY - imagePosition.y,
        clientX: event.clientX,
        clientY: event.clientY
      });
      return;
    }

    // Left click behavior
    if (event.button === 0) {
      if (isInDrawMode && !isPanMode && !isShiftHeld && preSelectedProduct) {
        haptic.draw();
        const coords = getRelativeCoordinates(event.clientX, event.clientY);
        
        // Ensure we have a product selected
        if (!preSelectedProduct) {
          toast({
            title: "Select Product First",
            description: "Please select a product before drawing.",
            variant: "destructive",
          });
          return;
        }
        
        setIsDrawing(true);
        const color = getProductColor(preSelectedProduct);
        setCurrentPath({
          points: [coords],
          cartItemId: preSelectedProduct,
          color: color
        });
      } else {
        // Default to panning for better navigation
        setIsDragging(true);
        setDragStart({
          x: imagePosition.x,
          y: imagePosition.y,
          clientX: event.clientX,
          clientY: event.clientY
        });
      }
    }
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch') return; // Handle with touch events
    
    // Handle scale calibration real-time line preview
    if (isSettingScale && scaleStartPoint && !scaleEndPoint && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      // Convert to normalized coordinates - use the same system as getRelativeCoordinates
      const coords = getRelativeCoordinates(event.clientX, event.clientY);
      const normalizedX = coords.x;
      const normalizedY = coords.y;
      
      setScaleTempEndPoint({ x: normalizedX, y: normalizedY });
    }
    
    // Calculate movement distance for click detection
    const moveDistance = Math.sqrt(
      Math.pow(event.clientX - mouseClickStartPos.x, 2) + 
      Math.pow(event.clientY - mouseClickStartPos.y, 2)
    );
    
    // If we've moved more than 5 pixels, it's a drag, not a click
    const isDragGesture = moveDistance > 5;
    
    if (isDrawing && currentPath) {
      // Real-time drawing feedback - add points as user draws
      const coords = getRelativeCoordinates(event.clientX, event.clientY);
      
      const lastPoint = currentPath.points[currentPath.points.length - 1];
      const distance = Math.sqrt(
        Math.pow(coords.x - lastPoint.x, 2) + Math.pow(coords.y - lastPoint.y, 2)
      );
      
      if (distance > 0.1) { // Lower threshold for smoother drawing
        setCurrentPath(prev => prev ? {
          ...prev,
          points: [...prev.points, coords]
        } : null);
      }
    } else if (isDragging && !isDrawing) {
      const deltaX = event.clientX - dragStart.clientX;
      const deltaY = event.clientY - dragStart.clientY;
      const newPosition = {
        x: dragStart.x + deltaX,
        y: dragStart.y + deltaY,
      };
      setImagePosition(newPosition);
    }
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch') return; // Handle with touch events
    
    // Calculate time and distance to determine if it was a click or drag
    const clickDuration = Date.now() - mouseClickStartTime;
    const moveDistance = Math.sqrt(
      Math.pow(event.clientX - mouseClickStartPos.x, 2) + 
      Math.pow(event.clientY - mouseClickStartPos.y, 2)
    );
    
    const wasClick = clickDuration < 200 && moveDistance < 5;
    
    // Reset middle mouse state
    if (event.button === 1) {
      setIsMiddleMouseDown(false);
    }
    
    if (isDrawing) {
      if (currentPath && currentPath.points.length >= 2 && preSelectedProduct) {
        // Check if this would exceed cart quantity before saving
        const cartItem = cartItems.find(item => item.id === preSelectedProduct);
        if (cartItem) {
          const itemWithMarkings = getCartItemWithMarkings(preSelectedProduct);
          
          // Check if we're about to exceed the quantity
          if (itemWithMarkings && itemWithMarkings.markedCount >= cartItem.quantity) {
            // Ask user if they want to add more to cart
            toast({
              title: "Add More to Cart?",
              description: `You've marked all ${cartItem.quantity} units of ${cartItem.productName}. Add more to continue drawing?`,
              action: (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Add one more and then save the markup
                    addProductToCartMutation.mutate({
                      productName: cartItem.productName,
                      quantity: 1,
                    });
                    // Save the markup after adding to cart
                    setTimeout(() => {
                      const firstPoint = currentPath.points[0];
                      const cornerCount = detectCorners(currentPath.points);
                      const calculatedLength = calculateBarrierLength(currentPath.points);
                      createMarkupMutation.mutate({
                        cartItemId: preSelectedProduct,
                        productName: cartItem.productName,
                        xPosition: firstPoint.x,
                        yPosition: firstPoint.y,
                        pathData: JSON.stringify(currentPath.points),
                        comment: undefined,
                        calculatedLength: calculatedLength || undefined,
                      });
                    }, 500);
                  }}
                >
                  Add +1 & Save
                </Button>
              ),
            });
          } else {
            // Save the drawing normally
            const firstPoint = currentPath.points[0];
            const cornerCount = detectCorners(currentPath.points);
            
            const calculatedLength = calculateBarrierLength(currentPath.points);
            createMarkupMutation.mutate({
              cartItemId: preSelectedProduct,
              productName: cartItem.productName,
              xPosition: firstPoint.x,
              yPosition: firstPoint.y,
              pathData: JSON.stringify(currentPath.points),
              comment: undefined,
              calculatedLength: calculatedLength || undefined,
            });
            
            // Add corner posts if detected
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
            
            // Check if more items remain after this one
            const itemWithMarkings = getCartItemWithMarkings(preSelectedProduct);
            if (itemWithMarkings && (itemWithMarkings.markedCount + 1) < cartItem.quantity) {
              // More items to mark - keep product selected and stay in draw mode
              setIsInDrawMode(true);
              setCurrentPath(null);
              setIsDrawing(false); // Reset drawing state but keep in draw mode
              // Don't clear preSelectedProduct - keep it selected
              return; // Early return to prevent clearing states below
            } else {
              // All items will be marked after this - clear selection
              setPreSelectedProduct("");
              setIsInDrawMode(false);
              setCurrentPath(null);
              setIsDrawing(false);
              return; // Early return after clearing
            }
          }
        }
        // Clear drawing state after handling markup
        setIsDrawing(false);
        setCurrentPath(null);
      } else if (wasClick && currentPath && currentPath.points.length === 1 && preSelectedProduct) {
        // Single click in draw mode - create a point marker
        const clickPoint = currentPath.points[0];
        const cartItem = cartItems.find(item => item.id === preSelectedProduct);
        if (cartItem) {
          const pointPath = [clickPoint, {x: clickPoint.x + 0.1, y: clickPoint.y + 0.1}];
          const calculatedLength = calculateBarrierLength(pointPath);
          createMarkupMutation.mutate({
            cartItemId: preSelectedProduct,
            productName: cartItem.productName,
            xPosition: clickPoint.x,
            yPosition: clickPoint.y,
            pathData: JSON.stringify(pointPath),
            comment: undefined,
            calculatedLength: calculatedLength || undefined,
          });
          
          // Check if more items remain after this one
          const itemWithMarkings = getCartItemWithMarkings(preSelectedProduct);
          if (itemWithMarkings && (itemWithMarkings.markedCount + 1) < cartItem.quantity) {
            // More items to mark - keep product selected and stay in draw mode
            setIsInDrawMode(true);
            setCurrentPath(null);
            setIsDrawing(false);
            // Keep preSelectedProduct - don't clear it
            return;
          } else {
            // All items marked - clear selection
            setPreSelectedProduct("");
            setIsInDrawMode(false);
            setCurrentPath(null);
            setIsDrawing(false);
            return;
          }
        }
        setIsDrawing(false);
        setCurrentPath(null);
      } else {
        // Not a successful drawing - just clear the drawing state
        setIsDrawing(false);
        setCurrentPath(null);
      }
    } else {
      setIsDragging(false);
      setDragStart({ x: 0, y: 0, clientX: 0, clientY: 0 });
    }
  };

  // Mouse wheel zoom handler for desktop - optimized for smooth zoom
  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    
    if (!containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const mouseX = event.clientX - containerRect.left;
    const mouseY = event.clientY - containerRect.top;
    
    // Much smaller zoom steps for smoother experience
    const zoomDelta = event.deltaY > 0 ? -0.03 : 0.03; // Smaller increments
    
    if (isImageFile || isBlankCanvas) {
      // For images and blank canvas - smooth zoom
      const zoomFactor = 1 + zoomDelta;
      const newZoom = Math.min(Math.max(zoomLevel * zoomFactor, 0.1), 50);
      if (newZoom !== zoomLevel) {
        // Zoom towards mouse cursor
        const unscaledX = (mouseX - imagePosition.x) / zoomLevel;
        const unscaledY = (mouseY - imagePosition.y) / zoomLevel;
        
        const newPosition = {
          x: mouseX - (unscaledX * newZoom),
          y: mouseY - (unscaledY * newZoom)
        };
        
        setImagePosition(newPosition);
        setZoomLevel(newZoom);
      }
    } else {
      // For PDFs - smoother zoom with smaller increments
      const currentScale = pdfScale;
      // Use additive scaling for smoother zoom
      const scaleDelta = currentScale * zoomDelta * 1.5; // Proportional scaling
      const newScale = Math.min(Math.max(currentScale + scaleDelta, 0.5), 10);
      
      if (Math.abs(newScale - pdfScale) > 0.001) { // Avoid tiny changes
        // Calculate zoom center point in document space
        const docX = (mouseX - imagePosition.x) / pdfScale;
        const docY = (mouseY - imagePosition.y) / pdfScale;
        
        // Calculate new position to keep mouse point fixed
        const newPosition = {
          x: mouseX - (docX * newScale),
          y: mouseY - (docY * newScale)
        };
        
        setImagePosition(newPosition);
        setPdfScale(newScale);
      }
    }
  };

  // Optimized coordinate calculation with better performance and precision
  const getRelativeCoordinatesOptimized = (clientX: number, clientY: number) => {
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return { x: 0, y: 0 };

    // Get screen coordinates relative to the main container
    const screenX = clientX - containerRect.left;
    const screenY = clientY - containerRect.top;
    
    // Use transform ref for immediate coordinate calculation
    const currentTransform = transformRef.current;
    
    if ((isImageFile || isBlankCanvas) && imageRef.current) {
      // For images and blank canvas: Convert to image's natural coordinate system
      const naturalWidth = imageRef.current.naturalWidth || 4000;
      const naturalHeight = imageRef.current.naturalHeight || 4000;
      
      // Account for zoom and position using cached transform for better precision
      const imageX = (screenX - currentTransform.x) / currentTransform.scale;
      const imageY = (screenY - currentTransform.y) / currentTransform.scale;
      
      return { x: imageX, y: imageY };
    } else {
      // For PDFs: Use the actual PDF dimensions for coordinate mapping
      const renderedPdfWidth = (containerRef.current?.offsetWidth || 800) * currentTransform.scale;
      const renderedPdfHeight = renderedPdfWidth * (pdfDimensions.height / pdfDimensions.width);
      
      // Convert screen coordinates to PDF coordinates with better precision
      const pdfX = (screenX - currentTransform.x);
      const pdfY = (screenY - currentTransform.y);
      
      // Map to the PDF's actual coordinate system
      const normalizedX = (pdfX / renderedPdfWidth) * pdfDimensions.width;
      const normalizedY = (pdfY / renderedPdfHeight) * pdfDimensions.height;
      
      return { x: normalizedX, y: normalizedY };
    }
  };

  // Distance calculation for pinch gestures
  const getDistance = (touch1: React.Touch, touch2: React.Touch) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Generate SVG path string from points
  const generatePathString = (points: DrawingPoint[]) => {
    if (points.length < 2) return '';
    
    let pathString = `M ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
      pathString += ` L ${points[i].x} ${points[i].y}`;
    }
    
    return pathString;
  };

  // Parse stored path data back to points
  const parsePathData = (markup: LayoutMarkup): DrawingPoint[] => {
    try {
      if (markup.pathData) {
        return JSON.parse(markup.pathData);
      } else {
        return [
          { x: markup.xPosition, y: markup.yPosition },
          { x: markup.endX || markup.xPosition, y: markup.endY || markup.yPosition }
        ];
      }
    } catch {
      return [
        { x: markup.xPosition, y: markup.yPosition },
        { x: markup.endX || markup.xPosition, y: markup.endY || markup.yPosition }
      ];
    }
  };

  const onPdfLoadSuccess = (pdf: any) => {
    setPdfNumPages(pdf.numPages);
    setPdfPageNumber(1);
    setIsPdfLoading(false);
    
    // Mobile-optimized PDF dimensions setup
    pdf.getPage(1).then((page: any) => {
      const viewport = page.getViewport({ scale: 1 });
      const container = containerRef.current;
      
      if (container) {
        const containerWidth = container.offsetWidth;
        const isMobile = window.innerWidth < 768;
        
        // Optimize dimensions for mobile performance
        let optimizedDimensions = {
          width: viewport.width,
          height: viewport.height
        };
        
        if (isMobile) {
          // Scale down large PDFs for better mobile performance
          const maxMobileWidth = Math.min(containerWidth * 2, 1200);
          if (viewport.width > maxMobileWidth) {
            const scaleFactor = maxMobileWidth / viewport.width;
            optimizedDimensions = {
              width: viewport.width * scaleFactor,
              height: viewport.height * scaleFactor
            };
          }
          
          // Adjust initial scale for mobile
          if (pdfScale > 0.8) {
            setPdfScale(0.7); // Better initial scale for mobile
          }
        }
        
        setPdfDimensions(optimizedDimensions);
        console.log('PDF dimensions optimized for mobile:', optimizedDimensions);
      } else {
        setPdfDimensions({
          width: viewport.width,
          height: viewport.height
        });
      }
    });
  };

  const handleImageLoad = () => {
    setIsImageLoading(false);
  };

  const handleImageError = (error: any) => {
    console.error('Image load error:', error);
    setIsImageLoading(false);
  };

  const handlePdfError = (error: any) => {
    console.error('PDF load error:', error);
    setIsPdfLoading(false);
  };

  // Calculate actual barrier length based on scale
  const calculateBarrierLength = (points: DrawingPoint[]): number | null => {
    if (!drawingScale || points.length < 2) return null;
    
    let totalLength = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const pixelDistance = Math.sqrt(dx * dx + dy * dy);
      
      // Convert pixels to mm using the scale (pixels per mm)
      totalLength += pixelDistance / drawingScale;
    }
    
    return totalLength;
  };

  // Handle scale calibration
  const handleSetScale = () => {
    if (scaleStartPoint && scaleEndPoint && actualLength) {
      const dx = scaleEndPoint.x - scaleStartPoint.x;
      const dy = scaleEndPoint.y - scaleStartPoint.y;
      const pixelDistance = Math.sqrt(dx * dx + dy * dy);
      const actualLengthMm = parseFloat(actualLength);
      
      if (pixelDistance > 0 && actualLengthMm > 0) {
        const scale = pixelDistance / actualLengthMm; // pixels per mm
        setDrawingScale(scale);
        setIsScaleSet(true);
        
        // Save scale to database
        updateScaleMutation.mutate({
          scale,
          scaleLine: {
            start: scaleStartPoint,
            end: scaleEndPoint,
            actualLength: actualLengthMm,
            zoomLevel: scaleZoomLevel
          },
          isScaleSet: true
        });
        
        setShowScaleDialog(false);
        setIsSettingScale(false);
        setScaleStartPoint(null);
        setScaleEndPoint(null);
      }
    }
  };

  // Enhanced corner detection function to count 90-degree corners
  const detectCorners = (points: { x: number; y: number }[]): number => {
    if (points.length < 3) return 0;
    
    let cornerCount = 0;
    const angleThreshold = 30; // Increased tolerance for better detection
    const minSegmentLength = 0.5; // Minimum segment length to consider
    
    // Simplify path by removing very close points for better corner detection
    const simplifiedPoints = [];
    simplifiedPoints.push(points[0]);
    
    for (let i = 1; i < points.length; i++) {
      const lastPoint = simplifiedPoints[simplifiedPoints.length - 1];
      const currentPoint = points[i];
      const distance = Math.sqrt(
        Math.pow(currentPoint.x - lastPoint.x, 2) + 
        Math.pow(currentPoint.y - lastPoint.y, 2)
      );
      
      // Only add points that are far enough apart
      if (distance >= minSegmentLength) {
        simplifiedPoints.push(currentPoint);
      }
    }
    
    if (simplifiedPoints.length < 3) return 0;
    
    console.log(`Corner detection: ${simplifiedPoints.length} simplified points from ${points.length} original points`);
    
    for (let i = 1; i < simplifiedPoints.length - 1; i++) {
      const prevPoint = simplifiedPoints[i - 1];
      const currentPoint = simplifiedPoints[i];
      const nextPoint = simplifiedPoints[i + 1];
      
      // Calculate vectors
      const vec1 = {
        x: currentPoint.x - prevPoint.x,
        y: currentPoint.y - prevPoint.y
      };
      const vec2 = {
        x: nextPoint.x - currentPoint.x,
        y: nextPoint.y - currentPoint.y
      };
      
      // Calculate angle between vectors
      const dotProduct = vec1.x * vec2.x + vec1.y * vec2.y;
      const magnitude1 = Math.sqrt(vec1.x * vec1.x + vec1.y * vec1.y);
      const magnitude2 = Math.sqrt(vec2.x * vec2.x + vec2.y * vec2.y);
      
      if (magnitude1 === 0 || magnitude2 === 0) continue;
      
      const cosAngle = dotProduct / (magnitude1 * magnitude2);
      const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
      
      console.log(`Point ${i}: angle = ${angle.toFixed(1)}°`);
      
      // Check if angle is approximately 90 degrees (corner) or 180 degrees (straight continuation)
      // We want to detect significant direction changes
      if (Math.abs(angle - 90) <= angleThreshold) {
        cornerCount++;
        console.log(`Corner detected at point ${i}: ${angle.toFixed(1)}°`);
      }
    }
    
    console.log(`Total corners detected: ${cornerCount}`);
    return cornerCount;
  };

  const handleSavePathMarkup = () => {
    if (!pendingPath || !selectedCartItem || pendingPath.points.length < 2) {
      toast({
        title: "Missing Information",
        description: "Please select a product from your cart.",
        variant: "destructive",
      });
      return;
    }

    const cartItem = cartItems.find(item => item.id === selectedCartItem);
    if (!cartItem) return;

    // Check if this would exceed the cart quantity
    const itemWithMarkings = getCartItemWithMarkings(selectedCartItem);
    if (itemWithMarkings && itemWithMarkings.markedCount >= cartItem.quantity) {
      // Prompt to add more to cart
      toast({
        title: "Quantity Exceeded",
        description: `You've already marked all ${cartItem.quantity} units of ${cartItem.productName}. Please add more to your cart first.`,
        variant: "destructive",
        action: (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // Add one more to cart
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

    const firstPoint = pendingPath.points[0];
    
    // Detect 90-degree corners
    const cornerCount = detectCorners(pendingPath.points);
    
    const calculatedLength = calculateBarrierLength(pendingPath.points);
    createMarkupMutation.mutate({
      cartItemId: selectedCartItem,
      productName: cartItem.productName,
      xPosition: firstPoint.x,
      yPosition: firstPoint.y,
      pathData: JSON.stringify(pendingPath.points),
      comment: comment.trim() || undefined,
      calculatedLength: calculatedLength || undefined,
    });

    // Add corner posts to cart if corners detected
    if (cornerCount > 0) {
      addProductToCartMutation.mutate({
        productName: `Corner Posts (${cartItem.productName})`,
        quantity: cornerCount,
      });
      
      toast({
        title: "🔧 Corner Posts Added",
        description: `${cornerCount} corner posts automatically added to cart for your ${cartItem.productName}`,
      });
    } else {
      toast({
        title: "✅ Markup Saved",
        description: "No corners detected - straight barrier layout saved",
      });
    }

    // Show the markups list briefly after saving
    setIsMarkupsExpanded(true);
    
    // Clear any existing timer
    if (autoCollapseTimer) {
      clearTimeout(autoCollapseTimer);
    }
    
    // Auto-collapse after 3 seconds
    const timer = setTimeout(() => {
      setIsMarkupsExpanded(false);
    }, 3000);
    setAutoCollapseTimer(timer);
  };


  // Auto-align function to straighten lines between corners WITHOUT moving endpoints
  const handleAutoAlign = async () => {
    if (!markups || markups.length === 0) return;

    try {
      // Process each markup sequentially to avoid API conflicts
      for (const markup of markups) {
        const points = parsePathData(markup);
        if (points.length < 3) continue;

        // Keep original start and end points
        const originalStart = points[0];
        const originalEnd = points[points.length - 1];

        // Identify corner points by analyzing angle changes
        const cornerIndices = [];
        const angleThreshold = 45; // degrees - points with significant direction changes
        
        for (let i = 1; i < points.length - 1; i++) {
          const prevPoint = points[i - 1];
          const currentPoint = points[i];
          const nextPoint = points[i + 1];
          
          // Calculate vectors
          const vec1 = {
            x: currentPoint.x - prevPoint.x,
            y: currentPoint.y - prevPoint.y
          };
          const vec2 = {
            x: nextPoint.x - currentPoint.x,
            y: nextPoint.y - currentPoint.y
          };
          
          // Calculate angle between vectors
          const dotProduct = vec1.x * vec2.x + vec1.y * vec2.y;
          const magnitude1 = Math.sqrt(vec1.x * vec1.x + vec1.y * vec1.y);
          const magnitude2 = Math.sqrt(vec2.x * vec2.x + vec2.y * vec2.y);
          
          if (magnitude1 === 0 || magnitude2 === 0) continue;
          
          const cosAngle = dotProduct / (magnitude1 * magnitude2);
          const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
          
          // If there's a significant direction change, mark as corner
          if (angle > angleThreshold && angle < (180 - angleThreshold)) {
            cornerIndices.push(i);
          }
        }

        // Always include first and last points indices
        const allCorners = [0, ...cornerIndices, points.length - 1];
        const uniqueCorners = Array.from(new Set(allCorners)).sort((a, b) => a - b);

        // Create aligned points by making each segment straight between corners
        const alignedPoints: { x: number; y: number }[] = [];
        
        // Start with original start point
        alignedPoints.push(originalStart);
        
        // Process intermediate corners
        for (let i = 1; i < uniqueCorners.length - 1; i++) {
          const currentCornerIndex = uniqueCorners[i];
          const currentCorner = points[currentCornerIndex];
          const prevAligned = alignedPoints[alignedPoints.length - 1];
          
          // Determine if segment from previous to current should be horizontal or vertical
          const deltaX = Math.abs(currentCorner.x - prevAligned.x);
          const deltaY = Math.abs(currentCorner.y - prevAligned.y);
          
          if (deltaX > deltaY) {
            // Make horizontal line to this corner
            alignedPoints.push({ x: currentCorner.x, y: prevAligned.y });
          } else {
            // Make vertical line to this corner
            alignedPoints.push({ x: prevAligned.x, y: currentCorner.y });
          }
        }
        
        // Connect to original end point with straight line
        if (alignedPoints.length > 1) {
          const lastAligned = alignedPoints[alignedPoints.length - 1];
          const deltaX = Math.abs(originalEnd.x - lastAligned.x);
          const deltaY = Math.abs(originalEnd.y - lastAligned.y);
          
          // Add intermediate point if needed for clean 90-degree connection
          if (deltaX > 2 && deltaY > 2) {
            if (deltaX > deltaY) {
              alignedPoints.push({ x: originalEnd.x, y: lastAligned.y });
            } else {
              alignedPoints.push({ x: lastAligned.x, y: originalEnd.y });
            }
          }
        }
        
        // End with original end point
        alignedPoints.push(originalEnd);

        // Remove duplicate consecutive points
        const cleanedPoints = [alignedPoints[0]];
        for (let i = 1; i < alignedPoints.length; i++) {
          const prev = cleanedPoints[cleanedPoints.length - 1];
          const curr = alignedPoints[i];
          if (Math.abs(prev.x - curr.x) > 0.5 || Math.abs(prev.y - curr.y) > 0.5) {
            cleanedPoints.push(curr);
          }
        }

        // Update the markup with aligned path data, preserving original endpoints
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

  // Update markup mutation
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

  // Stable keyboard event handlers using useCallback - MUST be called before any conditional return
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Shift') setIsShiftHeld(true);
    if (event.key === 'Control' || event.key === 'Meta') setIsCtrlHeld(true);
    if (event.key === ' ') {
      event.preventDefault();
      setIsPanMode(true);
    }
    if (event.key === 'Escape') {
      setIsInDrawMode(false);
      setCurrentPath(null);
      setIsDrawing(false);
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
      event.preventDefault();
      // Undo last markup if available - use current markups state
      setMarkups(currentMarkups => {
        if (currentMarkups.length > 0) {
          const lastMarkup = currentMarkups[currentMarkups.length - 1];
          deleteMarkupMutation.mutate(lastMarkup.id);
        }
        return currentMarkups;
      });
    }
  }, [deleteMarkupMutation]);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Shift') setIsShiftHeld(false);
    if (event.key === 'Control' || event.key === 'Meta') setIsCtrlHeld(false);
    if (event.key === ' ') {
      event.preventDefault();
      setIsPanMode(false);
    }
  }, []);

  // Keyboard event handlers for desktop
  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isOpen, handleKeyDown, handleKeyUp]);

  const handleClose = () => {
    setCurrentPath(null);
    setPendingPath(null);
    setSelectedCartItem("");
    setComment("");
    setBarrierRunLengths([]);
    setIsInDrawMode(false);
    setIsDrawing(false);
    setShowProductSelector(false);
    setIsMarkupsExpanded(false);
    setPreSelectedProduct("");
    if (autoCollapseTimer) {
      clearTimeout(autoCollapseTimer);
    }
    // Clean up blob URL when closing
    if (imageBlobUrl) {
      URL.revokeObjectURL(imageBlobUrl);
      setImageBlobUrl(null);
    }
    onClose();
  };

  // Fetch authenticated image and convert to blob URL
  useEffect(() => {
    if (!isOpen || !drawing?.fileUrl || (!isImageFile && !isBlankCanvas)) {
      setImageBlobUrl(null);
      return;
    }

    // For blank canvas, create a graph paper canvas blob
    if (isBlankCanvas) {
      const canvas = document.createElement('canvas');
      canvas.width = 4000; // Large canvas for infinite-like scroll
      canvas.height = 4000;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Fill with off-white paper background
        ctx.fillStyle = '#fdfdf8';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add subtle paper texture with noise
        for (let i = 0; i < 100; i++) {
          const x = Math.random() * canvas.width;
          const y = Math.random() * canvas.height;
          const opacity = Math.random() * 0.02;
          ctx.fillStyle = `rgba(180, 170, 160, ${opacity})`;
          ctx.fillRect(x, y, 1, 1);
        }
        
        // Draw graph paper grid lines
        const gridSize = 40; // Standard graph paper size
        const majorGridSize = gridSize * 5; // Major grid lines every 5 squares
        
        // Draw minor grid lines (thin, light blue)
        ctx.strokeStyle = '#d4e4f7';
        ctx.lineWidth = 0.5;
        
        for (let x = 0; x <= canvas.width; x += gridSize) {
          if (x % majorGridSize !== 0) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
          }
        }
        
        for (let y = 0; y <= canvas.height; y += gridSize) {
          if (y % majorGridSize !== 0) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
          }
        }
        
        // Draw major grid lines (thicker, darker blue)
        ctx.strokeStyle = '#a8c5e8';
        ctx.lineWidth = 1;
        
        for (let x = 0; x <= canvas.width; x += majorGridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.stroke();
        }
        
        for (let y = 0; y <= canvas.height; y += majorGridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
        
        // Add margin line (like notebook paper)
        ctx.strokeStyle = '#ffb3ba';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(80, 0);
        ctx.lineTo(80, canvas.height);
        ctx.stroke();
        
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            setImageBlobUrl(url);
            setIsImageLoading(false);
          }
        });
      }
      return;
    }

    let cancelled = false;
    setIsImageLoading(true);

    const fetchImage = async () => {
      try {
        const response = await fetch(drawing.fileUrl, {
          credentials: 'include',
          headers: {
            'Accept': 'image/*',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to load image: ${response.status}`);
        }

        const blob = await response.blob();
        if (!cancelled) {
          const url = URL.createObjectURL(blob);
          setImageBlobUrl(url);
          setIsImageLoading(false);
        }
      } catch (error) {
        console.error('Error loading image:', error);
        if (!cancelled) {
          setIsImageLoading(false);
        }
      }
    };

    fetchImage();

    return () => {
      cancelled = true;
      if (imageBlobUrl) {
        URL.revokeObjectURL(imageBlobUrl);
      }
    };
  }, [isOpen, drawing?.fileUrl, isImageFile, isBlankCanvas, imageBlobUrl]);

  // Early return AFTER all hooks are called
  if (!drawing) return null;

  // Calculate marked quantities for each cart item
  const getMarkedQuantity = (cartItemId: string) => {
    return markups?.filter(markup => markup.cartItemId === cartItemId).length || 0;
  };

  // Get cart item details with marked count
  const getCartItemWithMarkings = (cartItemId: string) => {
    const cartItem = cartItems.find(item => item.id === cartItemId);
    if (!cartItem) return null;
    
    const markedCount = getMarkedQuantity(cartItemId);
    return {
      ...cartItem,
      markedCount,
      isFullyMarked: markedCount >= cartItem.quantity,
      isOverMarked: markedCount > cartItem.quantity
    };
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent 
        className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[95vw] h-[90vh] sm:w-[90vw] sm:h-[85vh] lg:w-[85vw] lg:h-[80vh] flex flex-col p-0 overflow-hidden rounded-lg bg-white dark:bg-gray-900 z-[100000] max-w-none touch-enhanced" 
        style={{
          // Enhanced mobile viewport handling with safe areas
          maxHeight: 'calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 2rem)',
          maxWidth: 'calc(100vw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 1rem)',
        }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={handleClose}
        onInteractOutside={(e) => e.preventDefault()}
        aria-describedby="layout-markup-editor-description"
      >
        {/* Hidden Title for accessibility */}
        <DialogTitle className="sr-only">Layout Drawing Editor</DialogTitle>
        <DialogDescription id="layout-markup-editor-description" className="sr-only">
          Edit and markup your layout drawing. Use the drawing tools to mark barrier placements.
        </DialogDescription>
        
        {/* Header - Mobile Optimized */}
        <div className="p-2 sm:p-3 pb-2 flex-shrink-0 border-b bg-white dark:bg-gray-900 dark:border-gray-700">
          <div className="flex items-center justify-between gap-2 sm:gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {isEditingTitle ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    onBlur={() => {
                      // Save the title when focus is lost
                      if (editedTitle.trim() && editedTitle !== drawing.fileName) {
                        // Update the drawing title
                        updateDrawingTitleMutation.mutate({ id: drawing.id, title: editedTitle.trim() });
                      }
                      setIsEditingTitle(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (editedTitle.trim() && editedTitle !== drawing.fileName) {
                          updateDrawingTitleMutation.mutate({ id: drawing.id, title: editedTitle.trim() });
                        }
                        setIsEditingTitle(false);
                      } else if (e.key === 'Escape') {
                        setEditedTitle(drawing.fileName);
                        setIsEditingTitle(false);
                      }
                    }}
                    className="flex-1 px-2 py-1 text-xs sm:text-sm font-medium bg-white dark:bg-gray-800 border-2 border-purple-500 rounded outline-none focus:ring-2 focus:ring-purple-500"
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                    onClick={() => {
                      if (editedTitle.trim() && editedTitle !== drawing.fileName) {
                        updateDrawingTitleMutation.mutate({ id: drawing.id, title: editedTitle.trim() });
                      }
                      setIsEditingTitle(false);
                    }}
                    data-testid="button-save-title"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => {
                      setEditedTitle(drawing.fileName);
                      setIsEditingTitle(false);
                    }}
                    data-testid="button-cancel-title"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div 
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors cursor-text group flex-1 min-w-0"
                        onClick={() => {
                          setEditedTitle(drawing.fileName);
                          setIsEditingTitle(true);
                        }}
                      >
                        <h2 className="text-xs sm:text-sm truncate font-medium group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                          {drawing.fileName}
                        </h2>
                        <Pen className="h-3 w-3 text-purple-500 flex-shrink-0" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Click to rename drawing</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isScaleSet ? "ghost" : "outline"}
                      size="sm"
                      className={`h-7 w-7 sm:h-8 sm:w-8 p-0 ${!isScaleSet ? 'border-yellow-500' : ''}`}
                      onClick={() => setShowScaleDialog(true)}
                      data-testid="button-scale-calibration"
                    >
                      <Wand2 className={`h-4 w-4 ${!isScaleSet ? 'text-yellow-500' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isScaleSet ? 'Recalibrate Scale' : 'Set Drawing Scale'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                onClick={() => setShowHelpGuide(true)}
                data-testid="button-drawing-help"
              >
                <Info className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleClose} 
                className="h-7 w-7 sm:h-8 sm:w-8 p-0 hover:bg-red-100 dark:hover:bg-red-900/20"
                data-testid="close-drawing-editor"
              >
                <X className="h-4 w-4 text-red-600 dark:text-red-400" />
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content - Full Screen Drawing Area */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Large Drawing Canvas */}
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
                touchAction: 'none', // Always prevent default touch behavior for custom handling
                position: 'relative',
                zIndex: 1,
                // Enhanced iOS hardware acceleration for smoother performance
                transform: 'translateZ(0)',
                WebkitTransform: 'translateZ(0)',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                perspective: 1000,
                WebkitPerspective: 1000,
                willChange: 'transform',
                // Better mobile touch handling
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none',
                WebkitTapHighlightColor: 'transparent'
              }}
            >
              {/* Image/PDF/Canvas Display */}
              {(isImageFile || isBlankCanvas) ? (
                imageBlobUrl ? (
                  <img
                    ref={imageRef}
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
                      imageRendering: '-webkit-optimize-contrast',
                      willChange: 'transform',
                      backfaceVisibility: 'hidden',
                      WebkitBackfaceVisibility: 'hidden',
                    }}
                    onLoad={handleImageLoad}
                    onError={handleImageError}
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
                  <Document 
                    file={drawing.fileUrl} 
                    onLoadSuccess={onPdfLoadSuccess} 
                    onLoadError={handlePdfError}
                    options={pdfOptions}
                    className="drawing-canvas"
                  >
                    <Page
                      key={`page-${pdfScale}-mobile-optimized`}
                      pageNumber={pdfPageNumber}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      renderMode="canvas"
                      width={(containerRef.current?.offsetWidth || 800) * pdfScale}
                      // Mobile performance optimizations
                      devicePixelRatio={window.devicePixelRatio > 2 ? 2 : window.devicePixelRatio}
                      canvasBackground="white"
                      // Add loading component for better UX
                      loading={
                        <div className="flex items-center justify-center h-full w-full bg-gray-100 dark:bg-gray-800">
                          <div className="text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white mx-auto mb-2"></div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Loading PDF...</p>
                          </div>
                        </div>
                      }
                      // Error handling
                      error={
                        <div className="flex items-center justify-center h-full w-full bg-red-50 dark:bg-red-900/20">
                          <div className="text-center text-red-600 dark:text-red-400">
                            <p className="text-sm">Failed to load PDF page</p>
                          </div>
                        </div>
                      }
                    />
                  </Document>
                </div>
              )}

              {/* SVG Drawing Overlay - locked to image/PDF/canvas for proper transformation */}
              <svg
                className="absolute"
                style={(isImageFile || isBlankCanvas) ? {
                  left: 0,
                  top: 0,
                  width: imageRef.current ? `${imageRef.current.naturalWidth}px` : '100%',
                  height: imageRef.current ? `${imageRef.current.naturalHeight}px` : '100%',
                  transform: `translate3d(${imagePosition.x}px, ${imagePosition.y}px, 0) scale(${zoomLevel})`,
                  WebkitTransform: `translate3d(${imagePosition.x}px, ${imagePosition.y}px, 0) scale(${zoomLevel})`,
                  transformOrigin: '0 0',
                  WebkitTransformOrigin: '0 0',
                  zIndex: 10,
                  pointerEvents: 'none'
                } : {
                  left: 0,
                  top: 0,
                  width: `${(containerRef.current?.offsetWidth || 800) * pdfScale}px`,
                  height: `${((containerRef.current?.offsetWidth || 800) * pdfScale * pdfDimensions.height / pdfDimensions.width)}px`,
                  transform: `translate3d(${imagePosition.x}px, ${imagePosition.y}px, 0)`,
                  WebkitTransform: `translate3d(${imagePosition.x}px, ${imagePosition.y}px, 0)`,
                  transformOrigin: '0 0',
                  WebkitTransformOrigin: '0 0',
                  zIndex: 10,
                  pointerEvents: 'none'
                }}
                viewBox={(isImageFile || isBlankCanvas) ? 
                  `0 0 ${imageRef.current?.naturalWidth || 4000} ${imageRef.current?.naturalHeight || 4000}` : 
                  `0 0 ${pdfDimensions.width} ${pdfDimensions.height}`}
                preserveAspectRatio="none"
              >
                {/* Scale calibration line - real-time preview */}
                {isSettingScale && scaleStartPoint && !scaleEndPoint && (
                  <g>
                    {/* Start point */}
                    <circle
                      cx={scaleStartPoint.x}
                      cy={scaleStartPoint.y}
                      r={getPointRadius(10)}
                      fill="#10B981"
                      stroke="white"
                      strokeWidth={getStrokeWidth(2)}
                    />
                    {/* Real-time line preview */}
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
                  const points = parsePathData(markup);
                  const color = markup.cartItemId ? getProductColor(markup.cartItemId) : '#6B7280';
                  const pathString = generatePathString(points);
                  
                  return (
                    <g key={markup.id}>
                      <path
                        d={pathString}
                        stroke={invalidMarkups.has(markup.id) ? '#EF4444' : color}
                        strokeWidth={getStrokeWidth(isBlankCanvas ? 2.5 : 2.0)}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                        opacity={isBlankCanvas ? 0.85 : (isHighQualityRender ? 1 : 0.8)}
                        style={{ 
                          filter: isBlankCanvas 
                            ? 'drop-shadow(0 1px 2px rgba(0,0,50,0.3)) drop-shadow(0 0 1px rgba(0,0,100,0.2))' 
                            : invalidMarkups.has(markup.id) 
                              ? 'drop-shadow(0 0 2px rgba(239,68,68,0.8))'
                              : 'drop-shadow(0 0 1px rgba(0,0,0,0.6))'
                        }}
                      />
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

                {/* Current drawing path - real-time feedback with thin precise lines */}
                {currentPath && currentPath.points.length > 1 && (
                  <path
                    d={generatePathString(currentPath.points)}
                    stroke={currentPath.color || '#FF0000'}
                    strokeWidth={getStrokeWidth(isBlankCanvas ? 2.8 : 2.0)}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    style={{ 
                      filter: isBlankCanvas 
                        ? 'drop-shadow(0 1px 2px rgba(50,0,0,0.4)) drop-shadow(0 0 1px rgba(100,0,0,0.3))'
                        : 'drop-shadow(0 0 1px rgba(255,0,0,0.8))',
                      opacity: isBlankCanvas ? 0.9 : 1
                    }}
                  />
                )}

                {/* Current drawing path - single point with thin precise marker */}
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

              {/* Loading states - Must be above everything */}
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
                    setIsRepositioning(true);
                    setRepositionMarkupId(selectedMarkupId);
                    setShowMarkupMenu(false);
                    toast({
                      title: "Reposition Mode",
                      description: "Click anywhere on the drawing to move this markup",
                    });
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                >
                  <Move className="h-4 w-4" />
                  Reposition
                </button>
                <button
                  onClick={() => {
                    if (selectedMarkupId) {
                      setMarkupToDelete(selectedMarkupId);
                      setShowDeleteConfirm(true);
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

            {/* Floating Action Buttons - Mobile Optimized */}
            <div 
              className="absolute flex flex-col gap-1 sm:gap-2 touch-enhanced" 
              style={{ 
                zIndex: 50,
                // Enhanced mobile positioning with safe areas
                top: 'max(0.5rem, env(safe-area-inset-top, 0px) + 0.5rem)',
                left: 'max(0.5rem, env(safe-area-inset-left, 0px) + 0.5rem)',
              }}
            >
              <Button
                onClick={() => {
                  if (!isInDrawMode) {
                    // Open product selector first before enabling draw mode
                    setShowProductSelector(true);
                    setSelectedCartItem("");
                  } else {
                    // Cancel drawing mode
                    setIsInDrawMode(false);
                    setCurrentPath(null);
                    setIsDrawing(false);
                    setPreSelectedProduct("");
                  }
                }}
                className={`h-12 w-12 rounded-full shadow-lg touch-enhanced ${
                  isInDrawMode ? 'bg-red-600 hover:bg-red-700' : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
                data-testid="toggle-draw-mode"
              >
                {isInDrawMode ? <X className="h-5 w-5" /> : <Pen className="h-5 w-5" />}
              </Button>
              
              {(markups && markups.length > 0) || pendingPath || currentPath ? (
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

            {/* PDF Controls - Must be above drawing layer */}
            {!isImageFile && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-white dark:bg-gray-800 rounded-full shadow-lg px-3 py-2" style={{ zIndex: 50 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPdfPageNumber(Math.max(1, pdfPageNumber - 1))}
                  disabled={pdfPageNumber <= 1}
                  className="h-8 w-8 p-0 rounded-full"
                >
                  ←
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
                  →
                </Button>
              </div>
            )}


          </div>

          {/* Minimizable Markups List - Mobile Optimized */}
          {markups && markups.length > 0 && (
            <div 
              className="absolute touch-enhanced" 
              style={{ 
                zIndex: 50,
                // Enhanced mobile positioning with safe areas
                bottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px) + 0.5rem)',
                right: 'max(0.5rem, env(safe-area-inset-right, 0px) + 0.5rem)',
              }}
            >
              {isMarkupsExpanded ? (
                // Expanded View - Enhanced Mobile Responsive
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 max-w-[calc(100vw-4rem)] sm:max-w-[90vw] w-max max-h-[40vh] sm:max-h-48 overflow-y-auto -webkit-overflow-scrolling-touch overscroll-behavior-contain">
                  <div className="flex items-center justify-between p-2 sm:p-3 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-t-lg">
                    <h3 className="text-xs sm:text-sm font-medium">Markings ({markups.length})</h3>
                    <div className="flex items-center gap-2">
                      {markups.length > 0 && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={async () => {
                            haptic.success();
                            try {
                              // Group markups by product and calculate quantities
                              const productQuantities = new Map<string, { productName: string; quantity: number; markups: any[] }>();
                              
                              markups.forEach(markup => {
                                if (markup.productName) {
                                  const existing = productQuantities.get(markup.productName);
                                  if (existing) {
                                    existing.quantity += 1;
                                    existing.markups.push(markup);
                                  } else {
                                    productQuantities.set(markup.productName, {
                                      productName: markup.productName,
                                      quantity: 1,
                                      markups: [markup]
                                    });
                                  }
                                }
                              });

                              // Convert to items array for bulk add
                              const items = Array.from(productQuantities.values()).map(item => ({
                                productName: item.productName,
                                quantity: item.quantity,
                                pricingType: 'per-unit',
                                unitPrice: 0,
                                layoutDrawingId: drawing?.id,
                                layoutDrawingContext: {
                                  fileName: drawing?.fileName,
                                  drawingType: drawing?.drawingType,
                                  markupCount: item.markups.length,
                                  totalLength: item.markups.reduce((sum, m) => sum + (m.calculatedLength || 0), 0),
                                  coordinates: item.markups.map(m => ({
                                    x: m.xPosition,
                                    y: m.yPosition,
                                    comment: m.comment
                                  }))
                                },
                                applicationArea: 'layout-drawing',
                                notes: `From layout: ${drawing?.fileName || 'Untitled'}`
                              }));

                              const response = await apiRequest('/api/cart/bulk-add', 'POST', {
                                items,
                                projectInfo: {
                                  projectDescription: `Layout Drawing: ${drawing?.fileName || 'Untitled'}`,
                                  layoutDrawingId: drawing?.id,
                                  layoutType: 'layout-markup-editor'
                                },
                                autoSaveExisting: true
                              });

                              const data = await response.json();
                              toast({
                                title: "Project Created",
                                description: data.message || `${items.length} products transferred to project cart`,
                              });
                              queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
                              
                              // Close the editor after successful transfer
                              onClose();
                            } catch (error) {
                              console.error("Error transferring to project:", error);
                              toast({
                                title: "Error",
                                description: "Failed to transfer to project cart. Please try again.",
                                variant: "destructive"
                              });
                            }
                          }}
                          className="h-8 px-2 bg-green-600 hover:bg-green-700 text-white"
                          data-testid="transfer-to-project-cart"
                        >
                          <Package className="h-3 w-3 mr-1" />
                          <span className="hidden sm:inline">Transfer to Cart</span>
                          <span className="sm:hidden">Transfer</span>
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setIsMarkupsExpanded(false)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="p-2 space-y-2">
                    {markups.map((markup, index) => {
                      const cartItem = markup.cartItemId ? getCartItemWithMarkings(markup.cartItemId) : null;
                      const color = markup.cartItemId ? getProductColor(markup.cartItemId) : '#6B7280';
                      return (
                        <div key={markup.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div 
                              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                              style={{ backgroundColor: color }}
                            >
                              {markups.length - index}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">{markup.productName}</p>
                                {cartItem && (
                                  <Badge 
                                    variant={cartItem.isOverMarked ? "destructive" : cartItem.isFullyMarked ? "default" : "secondary"}
                                    className="text-xs px-1 py-0"
                                  >
                                    {cartItem.markedCount}/{cartItem.quantity}
                                  </Badge>
                                )}
                              </div>
                              {markup.comment && (
                                <p className="text-gray-600 truncate">{markup.comment}</p>
                              )}
                              {markup.calculatedLength && isScaleSet && (
                                <p className="text-xs text-blue-600 font-medium">
                                  Length: {(markup.calculatedLength / 1000).toFixed(2)}m
                                </p>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClick(markup.id)}
                            className="h-6 w-6 p-0 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                // Minimized View - Icon with Count
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsMarkupsExpanded(true)}
                  className="bg-white shadow-lg border-2 rounded-full h-12 w-12 p-0 relative"
                >
                  <div className="flex flex-col items-center justify-center">
                    <ShoppingCart className="h-4 w-4" />
                    <span className="text-xs font-bold">{markups.length}</span>
                  </div>
                </Button>
              )}
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>

    {/* Product Selector Modal - Select Product BEFORE Drawing - Moved outside main dialog */}
    <Dialog open={showProductSelector} onOpenChange={(open) => {
          setShowProductSelector(open);
          // Clear selections if modal is closed without selecting
          if (!open && !preSelectedProduct) {
            setSelectedCartItem("");
            setIsInDrawMode(false);
          }
        }}>
          <DialogContent className="w-[calc(100vw-2rem)] max-w-md mx-4 sm:mx-auto z-[100010]" aria-describedby="product-selector-description" style={{ zIndex: 100010 }}>
            <DialogHeader>
              <DialogTitle>Select Product for Drawing</DialogTitle>
              <DialogDescription id="product-selector-description" className="sr-only">
                Select a product from your cart to draw on the layout
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Instructions */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 border rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  {cartItems.length > 0 ? (
                    <>
                      <strong>Option 1:</strong> Choose a product from your cart<br/>
                      <strong>Option 2:</strong> Add a new product to draw<br/>
                      <strong>Note:</strong> Lines will be color-coded and numbered
                    </>
                  ) : (
                    <>
                      <strong>No items in cart!</strong><br/>
                      Click "Add New Product" below to add products directly to your cart, then draw them on the layout.
                    </>
                  )}
                </p>
              </div>

              {cartItems.length > 0 && (
                <div>
                  <Label htmlFor="product-select">Select Product from Cart</Label>
                  <Select value={selectedCartItem} onValueChange={setSelectedCartItem}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose product...">
                      {selectedCartItem && (() => {
                        const item = cartItems.find(i => i.id === selectedCartItem);
                        if (item) {
                          const displayName = item.productName.length > 40 
                            ? item.productName.substring(0, 37) + '...' 
                            : item.productName;
                          return displayName;
                        }
                        return "Choose product...";
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-w-[350px]">
                    {cartItems.map((item) => {
                      const itemWithMarkings = getCartItemWithMarkings(item.id);
                      const displayName = item.productName.length > 45 
                        ? item.productName.substring(0, 42) + '...' 
                        : item.productName;
                      return (
                        <SelectItem key={item.id} value={item.id}>
                          <div className="flex items-center justify-between w-full gap-2">
                            <span className="truncate flex-1" title={item.productName}>
                              {displayName}
                            </span>
                            <Badge 
                              variant={itemWithMarkings?.isOverMarked ? "destructive" : itemWithMarkings?.isFullyMarked ? "default" : "secondary"}
                              className="text-xs flex-shrink-0"
                            >
                              {itemWithMarkings?.markedCount || 0}/{item.quantity}
                            </Badge>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              )}

              <div className="text-center">
                <Button
                  variant={cartItems.length === 0 ? "default" : "outline"}
                  onClick={() => {
                    // Close the product selector modal
                    setShowProductSelector(false);
                    // Navigate to products page to add items to cart
                    window.location.href = '/products';
                  }}
                  className={cartItems.length === 0 ? "w-full bg-[#FFC72C] hover:bg-[#FFD54F] text-black" : "w-full"}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {cartItems.length === 0 ? "Browse Product Catalog" : "Add New Product"}
                </Button>
              </div>

              {/* Show selected product color preview */}
              {selectedCartItem && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div 
                    className="w-8 h-8 rounded-full flex-shrink-0 border-2 border-white shadow"
                    style={{ backgroundColor: getProductColor(selectedCartItem) }}
                  />
                  <div className="text-sm">
                    <p className="font-medium">Drawing Color</p>
                    <p className="text-gray-600">This color will identify your barrier placement</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowProductSelector(false);
                    setSelectedCartItem("");
                    setIsInDrawMode(false);
                    setPreSelectedProduct("");
                  }}
                  className="flex-1"
                  size="sm"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedCartItem) {
                      const item = getCartItemWithMarkings(selectedCartItem);
                      if (item?.isFullyMarked) {
                        toast({
                          title: "Quantity Reached",
                          description: `All ${item.quantity} units of ${item.productName} have been marked. Add more to cart if needed.`,
                          variant: "destructive"
                        });
                        return;
                      }
                      setPreSelectedProduct(selectedCartItem);
                      setIsInDrawMode(true);
                      setShowProductSelector(false);
                      toast({
                        title: "Draw Mode Enabled",
                        description: `Drawing ${item?.productName} (${item?.markedCount || 0}/${item?.quantity} marked)`,
                      });
                    }
                  }}
                  disabled={!selectedCartItem || cartItems.length === 0}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  size="sm"
                >
                  <Pen className="h-4 w-4 mr-2" />
                  Start Drawing
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>


    {/* Delete Confirmation Dialog using AlertDialog component */}
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

    {/* Comprehensive Help Guide Dialog */}
    <Dialog open={showHelpGuide} onOpenChange={setShowHelpGuide}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md mx-4 sm:mx-auto bg-gray-800 text-white border-gray-700 z-[100010]" aria-describedby="help-guide-description" style={{ zIndex: 100010 }}>
        <DialogHeader>
          <DialogTitle className="text-white">Drawing Tool Guide</DialogTitle>
          <DialogDescription id="help-guide-description" className="sr-only">
            Instructions for using the drawing tools
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 text-sm">
          
          {/* Mobile/Touch Instructions */}
          <div>
            <h4 className="font-semibold mb-3 text-yellow-400 flex items-center gap-2">
              📱 Mobile & Touch Device Controls
            </h4>
            <div className="space-y-2 pl-4">
              <div>• <strong>Pinch & spread</strong> - Zoom in/out</div>
              <div>• <strong>Two fingers drag</strong> - Pan around layout</div>
              <div>• <strong>Tap pen button</strong> - Toggle drawing mode on/off</div>
              <div>• <strong>Touch & drag</strong> - Draw barrier lines (when pen active)</div>
              <div>• <strong>Single tap on 1-9</strong> - Place numbered product marker</div>
              <div>• <strong>One finger drag</strong> - Pan layout (when pen inactive)</div>
              <div>• <strong>Long press marker</strong> - Open marker menu (link/delete)</div>
            </div>
          </div>

          {/* Desktop Instructions */}
          <div>
            <h4 className="font-semibold mb-3 text-blue-400 flex items-center gap-2">
              🖥️ Desktop & Laptop Controls
            </h4>
            <div className="space-y-2 pl-4">
              <div>• <span className="font-mono bg-gray-700 px-1 rounded text-yellow-300">Mouse Wheel</span> - Zoom in/out</div>
              <div>• <span className="font-mono bg-gray-700 px-1 rounded text-yellow-300">Click Pen Button</span> - Toggle drawing mode</div>
              <div>• <span className="font-mono bg-gray-700 px-1 rounded text-yellow-300">Left Click + Drag</span> - Draw lines (pen active) / Pan (pen inactive)</div>
              <div>• <span className="font-mono bg-gray-700 px-1 rounded text-yellow-300">Click 1-9 Button</span> - Place numbered product marker</div>
              <div>• <span className="font-mono bg-gray-700 px-1 rounded text-yellow-300">Right Click Marker</span> - Open marker menu (link/delete)</div>
              <div>• <span className="font-mono bg-gray-700 px-1 rounded text-yellow-300">Middle Click</span> - Temporary pan mode</div>
              <div>• <span className="font-mono bg-gray-700 px-1 rounded text-yellow-300">Shift + Drag</span> - Force pan (even in draw mode)</div>
              <div>• <span className="font-mono bg-gray-700 px-1 rounded text-yellow-300">Escape</span> - Exit drawing mode</div>
            </div>
          </div>

          {/* General Instructions */}
          <div>
            <h4 className="font-semibold mb-3 text-green-400 flex items-center gap-2">
              ⚡ General Workflow
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
              ✏️ Start Drawing
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
    <Dialog open={showScaleDialog} onOpenChange={setShowScaleDialog}>
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

          {!isSettingScale && !scaleStartPoint && (
            <div className="text-center py-4">
              <Button
                onClick={() => {
                  setIsSettingScale(true);
                  setShowScaleDialog(false);
                  setScaleZoomLevel(zoomLevel || pdfScale);
                  setScaleTempEndPoint(null);
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

          {(scaleStartPoint && scaleEndPoint) && (
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                Line marked successfully. Enter the actual length:
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={actualLength}
                  onChange={(e) => setActualLength(e.target.value)}
                  placeholder="Enter length"
                  className="flex-1"
                />
                <span className="text-sm text-gray-500">mm</span>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSetScale}
                  disabled={!actualLength || parseFloat(actualLength) <= 0}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Set Scale
                </Button>
                <Button
                  onClick={() => {
                    setScaleStartPoint(null);
                    setScaleEndPoint(null);
                    setIsSettingScale(false);
                    setActualLength("");
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

          {!isSettingScale && isScaleSet && (
            <div className="space-y-3">
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <p className="text-sm text-green-900">
                  ✓ Scale is set. Barrier lengths will be calculated automatically.
                </p>
              </div>
              <Button
                onClick={() => {
                  setIsSettingScale(true);
                  setShowScaleDialog(false);
                  setScaleStartPoint(null);
                  setScaleEndPoint(null);
                  setScaleTempEndPoint(null);
                  setScaleZoomLevel(zoomLevel || pdfScale);
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
                setShowScaleDialog(false);
                if (!isScaleSet) {
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