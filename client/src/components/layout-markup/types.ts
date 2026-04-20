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
}

export interface CartItemWithMarkings extends CartItem {
  markedCount: number;
  isFullyMarked: boolean;
  isOverMarked: boolean;
}

export type { LayoutDrawing, LayoutMarkup };
