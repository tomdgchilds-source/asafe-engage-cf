import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Download, ShoppingCart } from "lucide-react";
import { AddToCartModal } from "@/components/AddToCartModal";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Product } from "@shared/schema";
import { getPriceDisplay, extractPricingData } from "@shared/pricingUtils";
import { useState } from "react";
// NO FALLBACK IMAGES - Only authentic images allowed

interface ProductCardProps {
  product: Product;
  onViewDetails?: (product: Product) => void;
}

export function ProductCard({ product, onViewDetails }: ProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const { formatPrice } = useCurrency();
  
  const handleViewDetails = () => {
    if (onViewDetails) {
      onViewDetails(product);
    }
  };

  const handleDownloadSpec = () => {
    if (product.technicalSheetUrl) {
      window.open(product.technicalSheetUrl, '_blank');
    }
  };

  const handleImageError = () => {
    setImageError(true);
  };

  const getImageSrc = (): string | undefined => {
    // Only return authentic images - no fallbacks allowed
    return product.imageUrl || undefined;
  };



  return (
    <Card className="group hover:shadow-lg transition-all duration-300 hover:scale-[1.02]" data-testid={`product-card-${product.id}`}>
      <CardHeader className="p-3 sm:p-4">
        <div className="aspect-video rounded-lg overflow-hidden mb-2 bg-gray-100">
          {product.imageUrl ? (
            <img
              src={getImageSrc()}
              alt={product.name}
              loading="lazy"
              onError={handleImageError}
              className="w-full h-full object-contain bg-gray-50 group-hover:scale-110 transition-transform duration-300"
              data-testid={`product-image-${product.id}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-100">
              <div className="text-center">
                <ShoppingCart className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p className="text-xs text-gray-500 dark:text-gray-400">Awaiting Authentic Image</p>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-1">
          <h3 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base lg:text-lg leading-tight" data-testid={`product-name-${product.id}`}>
            {product.name}
          </h3>
          {(product as any).hasVariants && (product as any).productVariants && (
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-blue-500 text-white text-xs">
                {(product as any).productVariants.length} variants available
              </Badge>
            </div>
          )}
          <div className="flex gap-1 sm:gap-2 flex-wrap items-center">
            {product.impactRating && product.impactRating > 0 && (
              <Badge className="bg-yellow-400 text-black hover:bg-yellow-500 shrink-0 text-xs px-2 py-1">
                {product.impactRating.toLocaleString()}J
              </Badge>
            )}
            {product.heightMax && (
              <Badge className="bg-blue-500 text-white text-xs px-2 py-1">
                {product.heightMax}mm Height
              </Badge>
            )}
            <Badge variant="outline" className="text-xs px-2 py-1">
              {product.category}
            </Badge>
            {product.subcategory && (
              <Badge variant="outline" className="text-xs px-2 py-1">
                {product.subcategory}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 px-3 sm:px-4 pb-3 sm:pb-4">
        <p className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm mb-2 sm:mb-3 line-clamp-2" data-testid={`product-description-${product.id}`}>
          {product.description}
        </p>

        {product.features && Array.isArray(product.features) && product.features.length > 0 && (
          <div className="mb-3 sm:mb-4">
            <h4 className="font-semibold text-xs sm:text-sm mb-1 sm:mb-2">Key Features:</h4>
            <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
              {(product.features as string[]).slice(0, 3).map((feature, index) => (
                <li key={index} className="flex items-center">
                  <span className="w-1 h-1 bg-yellow-400 rounded-full mr-2"></span>
                  <span>{String(feature)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {product.applications && Array.isArray(product.applications) && product.applications.length > 0 && (
          <div className="mb-3 sm:mb-4">
            <h4 className="font-semibold text-xs sm:text-sm mb-1 sm:mb-2">Applications:</h4>
            <div className="flex flex-wrap gap-1">
              {(product.applications as string[]).slice(0, 3).map((application, index) => (
                <Badge key={index} variant="secondary" className="text-xs px-2 py-1">
                  {String(application)}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 pt-2 sm:pt-3 border-t">
          {/* Show pricing for all products using unified pricing service */}
          <div>
            {(() => {
              const pricingData = extractPricingData(product);
              const priceDisplay = getPriceDisplay(product, pricingData, formatPrice);
              
              return priceDisplay.displayText !== 'Contact for pricing' ? (
                <div className="text-center">
                  <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Price:</div>
                  <div className="text-lg font-bold text-green-600 dark:text-green-400" data-testid={`product-price-${product.id}`}>
                    {priceDisplay.displayText}
                  </div>
                  {(product as any).hasVariants && (product as any).productVariants && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {(product as any).productVariants.length} variants available
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-gray-400 text-center">Contact for pricing</div>
              );
            })()}
          </div>
          
          <Button
            onClick={handleViewDetails}
            className="w-full bg-black text-white hover:bg-gray-800 text-xs sm:text-sm"
            size="sm"
            data-testid={`button-view-details-${product.id}`}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            View Details
          </Button>
          
          <AddToCartModal product={product as any}>
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm"
              size="sm"
              data-testid={`button-add-to-cart-${product.id}`}
            >
              <ShoppingCart className="h-3 w-3 mr-1" />
              Add to Cart
            </Button>
          </AddToCartModal>
          
          {product.technicalSheetUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadSpec}
              className="w-full hover:bg-yellow-50 dark:hover:bg-yellow-900/20 text-xs sm:text-sm"
              data-testid={`button-download-spec-${product.id}`}
            >
              <Download className="h-3 w-3 mr-1" />
              Technical Sheet
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
