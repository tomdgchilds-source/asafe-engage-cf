import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Download, ShoppingCart } from "lucide-react";
import { AddToCartModal } from "@/components/AddToCartModal";
import { ProductImpactBadges } from "@/components/ProductImpactBadges";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Product } from "@shared/schema";
import { getPriceDisplay, extractPricingData } from "@shared/pricingUtils";
import { useState } from "react";

interface GroupedProductCardProps {
  product: Product;
  variants?: Product[];
  onViewDetails?: (product: Product) => void;
}

export function GroupedProductCard({ product, variants, onViewDetails }: GroupedProductCardProps) {
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

  const getPriceRange = () => {
    // Use unified pricing service to get consistent price display
    const pricingData = extractPricingData(product);
    const priceDisplay = getPriceDisplay(product, pricingData, formatPrice);
    
    // If we have variants but no pricing data, check variants for pricing
    if (priceDisplay.displayText === 'Contact for pricing' && variants && variants.length > 0) {
      const perMeterPrices = variants
        .map(v => parseFloat(String((v as any).basePricePerMeter || '0')))
        .filter(p => p > 0)
        .sort((a, b) => a - b);
      
      if (perMeterPrices.length > 0) {
        if (perMeterPrices.length === 1) return formatPrice(perMeterPrices[0]) + '/m';
        return `${formatPrice(perMeterPrices[0])} - ${formatPrice(perMeterPrices[perMeterPrices.length - 1])}/m`;
      }
      
      const prices = variants
        .map(v => parseFloat(String(v.price || '0')))
        .filter(p => p > 0)
        .sort((a, b) => a - b);
      
      if (prices.length > 0) {
        const minPrice = prices[0];
        const maxPrice = prices[prices.length - 1];
        
        if (minPrice === maxPrice && variants.length > 1) {
          return `${formatPrice(minPrice)} (${variants.length} sizes)`;
        }
        
        return `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`;
      }
    }
    
    return priceDisplay.displayText;
  };

  return (
    <Card className="group hover:shadow-lg transition-all duration-300 hover:scale-[1.02] h-full flex flex-col" data-testid={`product-card-${product.id}`}>
      <CardHeader className="p-3 sm:p-4 flex-shrink-0">
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
                <p className="text-xs text-gray-500">Awaiting Authentic Image</p>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-1 min-h-0">
          <div className="flex items-start gap-2">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm sm:text-base lg:text-lg leading-tight line-clamp-2 flex-1" data-testid={`product-name-${product.id}`}>
              {product.name}
            </h3>
            {(product as any).isNew && (
              <Badge className="bg-[#FFC72C] text-black shrink-0 text-[10px] px-1.5 py-0.5 font-bold tracking-wider">
                NEW
              </Badge>
            )}
          </div>
          {/* Show variant badge for products with variants */}
          {(() => {
            // Special handling for Cold Storage Bollard - check specification variants
            if (product.name === 'Cold Storage Bollard') {
              const specs = typeof product.specifications === 'string' 
                ? JSON.parse(product.specifications) 
                : product.specifications || {};
              const specVariants = specs.variants || [];
              if (specVariants.length > 0) {
                return (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className="bg-blue-500 text-white text-xs">
                      {specVariants.length} variants available
                    </Badge>
                  </div>
                );
              }
            }
            // Regular variant handling for other products
            if ((variants && variants.length > 1) || (product as any).hasVariants) {
              return (
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-blue-500 text-white text-xs">
                    {variants?.length || (product as any).productVariants?.length || 2} variants available
                  </Badge>
                </div>
              );
            }
            return null;
          })()}
          <ProductImpactBadges
            impactRating={product.impactRating}
            pas13Compliant={product.pas13Compliant}
            pas13TestMethod={product.pas13TestMethod}
            pas13TestJoules={product.pas13TestJoules}
            heightMin={product.heightMin}
            heightMax={product.heightMax}
            isColdStorage={(product as any).isColdStorage}
            category={product.category}
            subcategory={product.subcategory}
            enrichFromName={product.name}
          />
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 px-3 sm:px-4 pb-3 sm:pb-4 flex-1 flex flex-col">
        <div className="flex-1">
          <p className="text-gray-600 text-xs sm:text-sm mb-2 sm:mb-3 line-clamp-2" data-testid={`product-description-${product.id}`}>
            {product.description}
          </p>

          {product.features && Array.isArray(product.features) && product.features.length > 0 && (
            <div className="mb-2 sm:mb-3">
              <h4 className="font-semibold text-xs sm:text-sm mb-1">Key Features:</h4>
              <ul className="text-xs text-gray-600 space-y-0.5">
                {product.features.slice(0, 3).map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <span className="w-1 h-1 bg-yellow-400 rounded-full mr-2 mt-1 flex-shrink-0"></span>
                    <span className="line-clamp-1">{String(feature)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {product.applications && Array.isArray(product.applications) && product.applications.length > 0 && (
            <div className="mb-2 sm:mb-3">
              <h4 className="font-semibold text-xs sm:text-sm mb-1">Applications:</h4>
              <div className="flex flex-wrap gap-1">
                {product.applications.slice(0, 3).map((application, index) => (
                  <Badge key={index} variant="secondary" className="text-xs px-1.5 py-0.5">
                    {String(application)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 sm:space-y-3 pt-2 sm:pt-3 border-t mt-auto">
          {/* Show pricing for all products - price range for variants */}
          <div className="text-center">
            <div className="text-sm font-medium text-gray-600 mb-1">Price:</div>
            <div className="text-lg font-bold text-green-600" data-testid={`product-price-${product.id}`}>
              {getPriceRange()}
            </div>
            {/* Show variant count below price */}
            {((variants && variants.length > 1) || (product as any).hasVariants) && (
              <div className="text-xs text-gray-500 mt-1">
                {(() => {
                  // Priority: passed variants > spec variants > productVariants
                  if (variants && variants.length > 1) return variants.length;
                  
                  // Check for variants in specifications (like Cold Storage Bollard)
                  const specs = typeof product.specifications === 'string' 
                    ? JSON.parse(product.specifications) 
                    : product.specifications || {};
                  if (specs.variants && specs.variants.length > 1) return specs.variants.length;
                  
                  // Finally check productVariants (grouped products)
                  if ((product as any).productVariants?.length > 1) return (product as any).productVariants.length;
                  
                  // Default to 2 if hasVariants is true but we can't determine the count
                  return 2;
                })()} variants available
              </div>
            )}
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
          
          <AddToCartModal 
            product={variants && variants.length > 0 ? { ...product, variants } as any : product as any}
          >
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
              className="w-full text-xs px-2 py-1.5 sm:px-3 sm:py-2"
              data-testid={`download-spec-${product.id}`}
            >
              <Download className="h-3 w-3 mr-1 flex-shrink-0" />
              <span className="truncate">Technical Sheet</span>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}