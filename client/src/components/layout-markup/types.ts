import type { LayoutDrawing, LayoutMarkup } from "@shared/schema";

export interface CartItem {
  id: string;
  productName: string;
  quantity: number;
}

export interface LayoutMarkupEditorProps {
  isOpen: boolean;
  onClose: () => void;
  drawing: LayoutDrawing | null;
  cartItems: CartItem[];
}

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface MarkupPath {
  id?: string;
  points: DrawingPoint[];
  cartItemId?: string;
  productName?: string;
  comment?: string;
  color?: string;
  /**
   * Real-world barrier width in millimetres, resolved from the selected
   * product when the designer started drawing. When present AND the
   * drawing scale is calibrated, the renderer draws the stroke at this
   * physical width (pixels-per-mm × productWidthMm) instead of the
   * old fixed-screen-pixel behaviour, so the drawn line actually
   * represents the product's footprint.
   */
  productWidthMm?: number;
  /** Catalog product id this markup was drawn against (not the cart item id). */
  productId?: string;
}

/**
 * Markup augmented with the optional real-world width + product id we
 * resolve at draw time. Persisted markups don't yet carry these fields
 * (stored in local state only), but the render path falls back cleanly
 * when they're absent.
 */
export interface MarkupWithProduct {
  productWidthMm?: number;
  productId?: string;
}

export interface CartItemWithMarkings extends CartItem {
  markedCount: number;
  isFullyMarked: boolean;
  isOverMarked: boolean;
}

export type { LayoutDrawing, LayoutMarkup };
