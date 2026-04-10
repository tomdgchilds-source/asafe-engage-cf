import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Minus, Edit, Package } from "lucide-react";

interface CartItemMobileProps {
  item: any;
  updateQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  getProductImage: (name: string) => string | null;
  getProductDetails: (name: string) => any;
  formatPrice: (price: number) => string;
  editingQuantity: { [key: string]: number };
  handleQuantityInputChange: (id: string, value: string) => void;
  handleQuantityInputBlur: (id: string, item: any) => void;
  handleQuantityInputKeyPress: (e: any, id: string, item: any) => void;
  updateItemMutation: any;
  removeItemMutation: any;
}

export function CartItemMobile({ 
  item, 
  updateQuantity, 
  removeItem, 
  getProductImage, 
  getProductDetails, 
  formatPrice,
  editingQuantity,
  handleQuantityInputChange,
  handleQuantityInputBlur,
  handleQuantityInputKeyPress,
  updateItemMutation,
  removeItemMutation
}: CartItemMobileProps) {
  
  const productDetails = getProductDetails(item.productName);
  const productId = productDetails?.id;
  const imageUrl = getProductImage(item.productName);

  const handleProductClick = () => {
    if (productDetails) {
      window.location.href = `/products/${productDetails.id}`;
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header with Image and Basic Info */}
      <div className="flex items-start p-4 gap-3">
        {/* Product Image */}
        <div className="flex-shrink-0">
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-white border border-gray-200 shadow-sm">
            {imageUrl ? (
              <>
                <img
                  src={imageUrl}
                  alt={item.productName}
                  className="w-full h-full object-contain p-1"
                  loading="lazy"
                  onError={(e) => {
                    // Hide the broken image and show placeholder
                    const img = e.currentTarget;
                    const parent = img.parentElement;
                    if (parent) {
                      img.style.display = 'none';
                      const placeholder = parent.querySelector('.image-placeholder');
                      if (placeholder) {
                        placeholder.classList.remove('hidden');
                      }
                    }
                  }}
                />
                <div className="image-placeholder hidden w-full h-full flex items-center justify-center text-gray-400 bg-gray-50">
                  <Package className="h-8 w-8" />
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-50">
                <Package className="h-8 w-8" />
              </div>
            )}
          </div>
        </div>

        {/* Product Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-tight mb-1 line-clamp-2">
            {item.productName}
          </h3>
          
          {/* Quantity and Price Info */}
          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-2">
            <span className="font-medium">
              {item.quantity}{item.pricingType === "linear_meter" ? "m" : " items"}
            </span>
            <span>•</span>
            <span className="font-bold text-gray-900 dark:text-white">
              {formatPrice(item.totalPrice)}
            </span>
          </div>

          {/* Unit Price */}
          <div className="text-xs text-gray-500">
            {formatPrice(item.unitPrice)}/{item.pricingType === "linear_meter" ? "m" : "item"}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleProductClick}
            className="h-8 w-8 p-0 text-blue-600"
            title="Edit item"
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeItemMutation.mutate(item.id)}
            disabled={removeItemMutation.isPending}
            className="h-8 w-8 p-0 text-red-600"
            title="Remove item"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Quantity Controls - Clean Bottom Section */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Quantity:</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateQuantity(item.id, item.quantity - (item.pricingType === "linear_meter" ? 0.2 : 1))}
              disabled={updateItemMutation.isPending || (item.pricingType === "linear_meter" && item.quantity <= 0.2) || (item.pricingType !== "linear_meter" && item.quantity <= 1)}
              className="h-8 w-8 p-0"
            >
              <Minus className="h-3 w-3" />
            </Button>
            
            <Input
              type="number"
              step={item.pricingType === "linear_meter" ? "0.2" : "1"}
              min={item.pricingType === "linear_meter" ? "0.2" : "1"}
              value={editingQuantity[item.id] !== undefined ? editingQuantity[item.id] : item.quantity}
              onChange={(e) => handleQuantityInputChange(item.id, e.target.value)}
              onBlur={() => handleQuantityInputBlur(item.id, item)}
              onKeyDown={(e) => handleQuantityInputKeyPress(e, item.id, item)}
              className="text-center h-8 text-sm font-medium w-20"
              disabled={updateItemMutation.isPending}
            />
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateQuantity(item.id, item.quantity + (item.pricingType === "linear_meter" ? 0.2 : 1))}
              disabled={updateItemMutation.isPending}
              className="h-8 w-8 p-0"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}