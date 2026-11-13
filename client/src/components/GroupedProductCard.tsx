import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink, Download, ShoppingCart } from "lucide-react";
import { AddToCartModal } from "@/components/AddToCartModal";
import { ProductImpactBadges } from "@/components/ProductImpactBadges";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Product } from "@shared/schema";
import { getPriceDisplay, extractPricingData } from "@shared/pricingUtils";
import { getProductOptions } from "@/lib/productOptions";
import { productDisplayName } from "@shared/productDisplayName";
import { useMemo, useState } from "react";

// Option / height detection lives in @/lib/productOptions (pure, unit-tested);
// re-exported here for the cards that import it from this module.
export {
  formatHeightMm,
  getHeightVariants,
  getProductOptions,
  getVariantHeightMm,
  parseHeightMmFromName,
  stripHeightFromName,
  type HeightVariant,
  type HeightVariantLike,
  type OptionVariantLike,
  type ProductOption,
  type ProductOptionSet,
  type ServerOption,
} from "@/lib/productOptions";

interface GroupedProductCardProps {
  product: Product;
  variants?: Product[];
  onViewDetails?: (product: Product) => void;
}

export function GroupedProductCard({ product, variants, onViewDetails }: GroupedProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const { formatPrice } = useCurrency();

  // Families with height / diameter / colour options (iFlex 190 Bollard:
  // 835 mm Yellow … 2 m) get a picker over the server's `options`, one per
  // priced sub-size; everything else keeps the "N variants" presentation.
  const serverOptions = (product as any).options;
  const optionSet = useMemo(() => getProductOptions(variants, serverOptions), [variants, serverOptions]);
  const [selectedOptionId, setSelectedOptionId] = useState<string>(
    () => optionSet?.defaultId ?? "",
  );
  const selectedOption =
    optionSet?.options.find((o) => o.id === selectedOptionId) ??
    optionSet?.options.find((o) => o.id === optionSet.defaultId) ??
    null;
  // The product handed to View Details / Add to Cart / badges. For an option
  // family this is the product row the option belongs to; a sub-size of that
  // row (835 mm, 1.2 m 210 OD, …) rides along as `initialVariantSku`, so the
  // cart gets that size's own price. Otherwise it's the family card as before.
  const activeProduct: Product = selectedOption ? selectedOption.product : product;
  // What the selected option reads as on a cart line / proposal.
  const selectedOptionName = selectedOption
    ? productDisplayName(
        activeProduct.name,
        selectedOption.subVariant ? { ...selectedOption.subVariant, parentName: activeProduct.name } : undefined,
      )
    : "";
  // Impact rating follows the picked option. The family's figure stands in
  // only when NO option carries its own (Heavy Duty: the rating lives on a
  // priceless parent row) — a rating tested on one option (the 2 m bollard)
  // is never shown against a sibling that has none recorded.
  const optionsCarryOwnRating = !!optionSet?.options.some((o) => o.product.impactRating != null);
  const activeImpactRating = selectedOption
    ? activeProduct.impactRating ?? (optionsCarryOwnRating ? null : product.impactRating)
    : product.impactRating;

  const handleViewDetails = () => {
    if (onViewDetails) {
      onViewDetails(activeProduct);
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
    // Option family: the price follows the picked option, not the family range.
    if (selectedOption) {
      // A sub-size has one exact price: show it, never the row's range.
      if (selectedOption.subVariantSku && selectedOption.price > 0) {
        return formatPrice(selectedOption.price);
      }
      const sel = selectedOption.product;
      const selDisplay = getPriceDisplay(sel, extractPricingData(sel), formatPrice);
      const selPrice = parseFloat(String(sel.price ?? "0"));
      if (selDisplay.displayText === "Contact for pricing" && selPrice > 0) {
        return formatPrice(selPrice);
      }
      return selDisplay.displayText;
    }

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
            // Option family: say so instead of the generic variant count.
            if (optionSet) {
              return (
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    className="bg-blue-500 text-white text-xs"
                    data-testid={optionSet.heightOnly ? `product-heights-${product.id}` : `product-options-${product.id}`}
                  >
                    {optionSet.options.length} {optionSet.heightOnly ? "heights" : "options"} available
                  </Badge>
                </div>
              );
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
            impactRating={activeImpactRating}
            pas13Compliant={activeProduct.pas13Compliant ?? product.pas13Compliant}
            pas13TestMethod={activeProduct.pas13TestMethod ?? product.pas13TestMethod}
            pas13TestJoules={activeProduct.pas13TestJoules ?? product.pas13TestJoules}
            heightMin={selectedOption ? selectedOption.heightMm ?? activeProduct.heightMin : product.heightMin}
            heightMax={selectedOption ? selectedOption.heightMm ?? activeProduct.heightMax : product.heightMax}
            isColdStorage={(product as any).isColdStorage}
            category={product.category}
            subcategory={product.subcategory}
            enrichFromName={activeProduct.name}
          />
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 px-3 sm:px-4 pb-3 sm:pb-4 flex-1 flex flex-col">
        <div className="flex-1">
          <p className="text-gray-600 text-xs sm:text-sm mb-2 sm:mb-3 line-clamp-2" data-testid={`product-description-${product.id}`}>
            {product.description}
          </p>

          {Array.isArray(product.features) && product.features.length > 0 && (
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

          {Array.isArray(product.applications) && product.applications.length > 0 && (
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
          {/* Option picker for families whose variants are a height and/or a
              colour (bollards). One Select; each row carries its own price.
              Styled to match the "Post height" select on HeightRestrictorKitCard. */}
          {optionSet && selectedOption && (
            <div>
              <Label htmlFor={`height-${product.id}`} className="text-xs font-semibold">
                {optionSet.axisLabel}
              </Label>
              <Select value={selectedOption.id} onValueChange={setSelectedOptionId}>
                <SelectTrigger
                  id={`height-${product.id}`}
                  className="h-9 mt-1"
                  data-testid={`product-height-${product.id}`}
                >
                  <SelectValue placeholder={`Select ${optionSet.axisLabel.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {optionSet.options.map((o) => (
                    <SelectItem key={o.id} value={o.id} data-testid={`product-option-${o.id}`}>
                      {o.label}
                      {o.price > 0
                        ? ` · ${o.priceIsFrom ? "from " : ""}${formatPrice(o.price)}${o.isPerMeter ? "/m" : ""}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Show pricing for all products - price range for variants */}
          <div className="text-center">
            <div className="text-sm font-medium text-gray-600 mb-1">Price:</div>
            <div className="text-lg font-bold text-green-600" data-testid={`product-price-${product.id}`}>
              {getPriceRange()}
            </div>
            {/* Option family: name the selected SKU under the price */}
            {selectedOption && (
              <div className="text-xs text-gray-500 mt-1" data-testid={`product-height-summary-${product.id}`}>
                {selectedOptionName}
                {selectedOption.subVariantSku ? ` · SKU ${selectedOption.subVariantSku}` : ""}
              </div>
            )}
            {/* Show variant count below price */}
            {!optionSet && ((variants && variants.length > 1) || (product as any).hasVariants) && (
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
            key={`${activeProduct.id}::${selectedOption?.subVariantSku ?? ""}`}
            initialVariantSku={selectedOption?.subVariantSku ?? undefined}
            product={
              selectedOption
                ? (activeProduct as any) // concrete option SKU; the modal adds exactly this product
                : variants && variants.length > 0
                  ? ({ ...product, variants } as any)
                  : (product as any)
            }
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