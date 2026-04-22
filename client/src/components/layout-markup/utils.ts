import type { DrawingPoint, CartItem, CartItemWithMarkings, LayoutMarkup } from "./types";
import { productColors } from "./constants";
import { getBarrierSpec } from "@/utils/barrierSymbol";

/**
 * Shape of an A-SAFE catalog product as far as we care about here.
 * Kept permissive so callers can pass either the full DB row or the
 * lightweight `CatalogProduct` used inside the drawing-tool sidebar.
 */
export interface ProductWidthSource {
  id?: string;
  name?: string;
  category?: string;
  subcategory?: string;
  specifications?: {
    width_mm?: number;
    widthMm?: number;
    postOdMm?: number;
    [key: string]: unknown;
  } | null;
}

/**
 * Resolve the real-world width (millimetres) of a barrier product so we
 * can render its footprint to scale on the drawing.
 *
 * Resolution order (highest precedence first):
 *   1. `specifications.width_mm` / `widthMm` / `postOdMm` on the product
 *      row itself — the one-stop-shop when the product team curates
 *      explicit widths.
 *   2. The shared `getBarrierSpec` name-matcher used by the technical
 *      symbol renderer (iFlex / eFlex / mFlex / Atlas / Topple /
 *      Monoplex). Reusing it keeps the post-diameter source of truth in
 *      one place — if the matcher picks up "iFlex Pedestrian" as 190mm
 *      here, the technical view already agrees.
 *   3. A category fallback for non-barrier families (bollards, rack
 *      guards, kerb, step guards) where width is either irrelevant
 *      (point markers) or highly variant-specific. We default to 100mm
 *      with a TODO so designers get a plausible ribbon instead of
 *      nothing.
 *   4. `null` when nothing matches — caller falls back to the legacy
 *      fixed-pixel stroke.
 */
export const getProductWidthMm = (product: ProductWidthSource | null | undefined): number | null => {
  if (!product) return null;

  // 1. Explicit spec on the product row.
  const specs = product.specifications;
  if (specs && typeof specs === "object") {
    const explicit =
      (typeof specs.width_mm === "number" && specs.width_mm) ||
      (typeof specs.widthMm === "number" && specs.widthMm) ||
      (typeof specs.postOdMm === "number" && specs.postOdMm);
    if (explicit && explicit > 0) return explicit;
  }

  const name = (product.name ?? "").trim();

  // 2. Name-matcher via the existing barrier-symbol spec table. This
  //    covers iFlex / eFlex / mFlex / Atlas / Topple / Monoplex / the
  //    raw 130-T0-P3 and 190-T-series SKUs — always returns a spec
  //    (falls through to iFlex 190 Traffic), so we only trust it when
  //    the name clearly identifies a barrier family.
  const looksLikeBarrier =
    /\b(iFlex|eFlex|mFlex|Atlas|Topple|Monoplex|Rack[- ]?Guard|Rail|Bollard|ForkGuard|Kerb|StepGuard|Height Restrictor)\b/i.test(
      name,
    ) ||
    /(guardrail|barrier)/i.test(name) ||
    /^130-/.test(name) ||
    /^190-/.test(name);

  if (looksLikeBarrier && name.length > 0) {
    const spec = getBarrierSpec(name);
    if (spec.postOdMm > 0) return spec.postOdMm;
  }

  // 3. Category fallback for the long tail.
  const category = (product.category ?? "").toLowerCase();
  const subcategory = (product.subcategory ?? "").toLowerCase();

  if (/bollard/.test(category + " " + subcategory)) return 130;
  if (/rack[- ]?guard|fork[- ]?guard|rack-end/.test(category + " " + subcategory)) return 100;
  if (/kerb|step[- ]?guard/.test(category + " " + subcategory)) return 100;

  // TODO: supplement with a per-subcategory width map if we start
  // supporting more non-barrier product families on the drawing.
  return null;
};

/**
 * Get the assigned color for a product based on its position in the cart.
 */
export const getProductColor = (cartItemId: string, cartItems: CartItem[]): string => {
  const index = cartItems.findIndex(item => item.id === cartItemId);
  return index !== -1 ? productColors[index % productColors.length] : '#6B7280';
};

/**
 * Get marked quantity count for a cart item from markups.
 */
export const getMarkedQuantity = (cartItemId: string, markups: LayoutMarkup[]): number => {
  return markups?.filter(markup => markup.cartItemId === cartItemId).length || 0;
};

/**
 * Get cart item details enriched with marking counts.
 */
export const getCartItemWithMarkings = (
  cartItemId: string,
  cartItems: CartItem[],
  markups: LayoutMarkup[]
): CartItemWithMarkings | null => {
  const cartItem = cartItems.find(item => item.id === cartItemId);
  if (!cartItem) return null;

  const markedCount = getMarkedQuantity(cartItemId, markups);
  return {
    ...cartItem,
    markedCount,
    isFullyMarked: markedCount >= cartItem.quantity,
    isOverMarked: markedCount > cartItem.quantity
  };
};

/**
 * Distance calculation for pinch gestures.
 */
export const getDistance = (touch1: React.Touch, touch2: React.Touch): number => {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Generate SVG path string from points.
 */
export const generatePathString = (points: DrawingPoint[]): string => {
  if (points.length < 2) return '';

  let pathString = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length; i++) {
    pathString += ` L ${points[i].x} ${points[i].y}`;
  }

  return pathString;
};

/**
 * Parse stored path data back to points.
 */
export const parsePathData = (markup: LayoutMarkup): DrawingPoint[] => {
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

/**
 * Enhanced corner detection function to count 90-degree corners.
 */
export const detectCorners = (points: { x: number; y: number }[]): number => {
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

    console.log(`Point ${i}: angle = ${angle.toFixed(1)}\u00b0`);

    // Check if angle is approximately 90 degrees (corner) or 180 degrees (straight continuation)
    // We want to detect significant direction changes
    if (Math.abs(angle - 90) <= angleThreshold) {
      cornerCount++;
      console.log(`Corner detected at point ${i}: ${angle.toFixed(1)}\u00b0`);
    }
  }

  console.log(`Total corners detected: ${cornerCount}`);
  return cornerCount;
};

/**
 * Calculate actual barrier length based on scale.
 */
export const calculateBarrierLength = (points: DrawingPoint[], drawingScale: number | null): number | null => {
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

/**
 * Determine if the file is an image based on drawing metadata.
 * Accepts all common raster and vector formats that browsers render natively.
 */
export const isImageFileType = (drawing: { fileType?: string; fileName: string } | null): boolean => {
  if (!drawing) return false;
  return drawing.fileType === 'image' ||
    (drawing.fileName?.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp|tif|tiff|svg|avif|heic|heif)$/) !== null);
};

/**
 * Determine if the drawing is a blank canvas.
 */
export const isBlankCanvasType = (drawing: { fileType?: string; fileUrl?: string } | null): boolean => {
  if (!drawing) return false;
  return drawing.fileType === 'canvas' || drawing.fileUrl === 'blank-canvas';
};
