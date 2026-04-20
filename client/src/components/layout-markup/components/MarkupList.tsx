import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Trash2, ShoppingCart, Package } from "lucide-react";
import type { LayoutMarkup, CartItemWithMarkings } from "../types";
import { apiRequest } from "@/lib/queryClient";

interface MarkupListProps {
  markups: LayoutMarkup[];
  isMarkupsExpanded: boolean;
  setIsMarkupsExpanded: (expanded: boolean) => void;
  isScaleSet: boolean;
  drawing: { id: string; fileName: string; drawingType?: string } | null;
  getCartItemWithMarkings: (cartItemId: string) => CartItemWithMarkings | null;
  getProductColor: (cartItemId: string) => string;
  onDeleteClick: (id: string) => void;
  onTransferToCart: () => void;
  hapticSuccess: () => void;
  toast: (opts: any) => void;
  queryClient: any;
  onClose: () => void;
}

export function MarkupList({
  markups,
  isMarkupsExpanded,
  setIsMarkupsExpanded,
  isScaleSet,
  drawing,
  getCartItemWithMarkings,
  getProductColor,
  onDeleteClick,
  onTransferToCart,
  hapticSuccess,
  toast,
  queryClient,
  onClose,
}: MarkupListProps) {
  if (!markups || markups.length === 0) return null;

  const handleTransfer = async () => {
    hapticSuccess();
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
          totalLength: item.markups.reduce((sum: number, m: any) => sum + (m.calculatedLength || 0), 0),
          coordinates: item.markups.map((m: any) => ({
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
  };

  return (
    <div
      className="absolute touch-enhanced"
      style={{
        zIndex: 50,
        bottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px) + 0.5rem)',
        right: 'max(0.5rem, env(safe-area-inset-right, 0px) + 0.5rem)',
      }}
    >
      {isMarkupsExpanded ? (
        // Expanded View
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border dark:border-gray-700 max-w-[calc(100vw-4rem)] sm:max-w-[90vw] w-max max-h-[40vh] sm:max-h-48 overflow-y-auto -webkit-overflow-scrolling-touch overscroll-behavior-contain">
          <div className="flex items-center justify-between p-2 sm:p-3 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-t-lg">
            <h3 className="text-xs sm:text-sm font-medium">Markings ({markups.length})</h3>
            <div className="flex items-center gap-2">
              {markups.length > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleTransfer}
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
                    onClick={() => onDeleteClick(markup.id)}
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
        // Minimized View
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
  );
}
