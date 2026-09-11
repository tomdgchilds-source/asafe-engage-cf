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
import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Height-variant detection.
//
// Sales feedback (Shahla, 5 May): bollards were listed once per height
// ("iFlex 190 Bollard - 2m" next to "iFlex 190 Bollard - 1.2m"). The server
// already folds them into one family (worker/routes/products.ts,
// resolveBollardGroupKey); these helpers decide whether that family's
// variants differ ONLY by height so the card can offer a height picker
// instead of the generic "N variants" badge.
//
// A height is read from, in order:
//   1. a trailing "<n> m" / "<n> mm" token in the name ("- 2m", "1200mm"),
//   2. the schema `heightMin` / `heightMax` columns when they describe a
//      single height (equal, or only one set).
// ---------------------------------------------------------------------------

export interface HeightVariantLike {
  id: string;
  name: string;
  heightMin?: number | null;
  heightMax?: number | null;
}

export interface HeightVariant<T extends HeightVariantLike> {
  product: T;
  heightMm: number;
}

// Matches "2m", "1.2 m", "1200mm", "1500 mm". The trailing \b stops the
// `m` alternative from swallowing the first letter of "mm", and keeps
// "190 Bollard" (no unit) from matching.
const HEIGHT_TOKEN_RE = /(\d+(?:\.\d+)?)\s*(mm|m)\b/gi;

/** Height in mm parsed from the product name, or null when absent. */
export function parseHeightMmFromName(name: string): number | null {
  const matches = Array.from(name.matchAll(HEIGHT_TOKEN_RE));
  if (matches.length === 0) return null;
  // The height is a suffix ("iFlex 190 Bollard - 2m"), so take the last token.
  const [, value, unit] = matches[matches.length - 1];
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return unit.toLowerCase() === "m" ? Math.round(n * 1000) : Math.round(n);
}

/** Single height (mm) for one variant, or null when it can't be determined. */
export function getVariantHeightMm(p: HeightVariantLike): number | null {
  const fromName = parseHeightMmFromName(p.name ?? "");
  if (fromName) return fromName;
  const min = p.heightMin ?? null;
  const max = p.heightMax ?? null;
  if (max && (min === null || min === max)) return max;
  if (min && max === null) return min;
  return null;
}

/** Name with the height token (and its separator) removed, normalised for comparison. */
export function stripHeightFromName(name: string): string {
  return name
    .replace(/\s*[-–—,]?\s*\d+(?:\.\d+)?\s*(mm|m)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** "1.2 m" / "2 m" / "835 mm" for the picker and summary line. */
export function formatHeightMm(mm: number): string {
  if (mm >= 1000) {
    const metres = mm / 1000;
    return `${Number.isInteger(metres) ? metres : metres.toFixed(1)} m`;
  }
  return `${mm} mm`;
}

/**
 * Returns the variants sorted by height when every variant has a distinct
 * height and the names differ only by that height; otherwise null.
 */
export function getHeightVariants<T extends HeightVariantLike>(
  variants: T[] | undefined,
): HeightVariant<T>[] | null {
  if (!variants || variants.length < 2) return null;
  const resolved: HeightVariant<T>[] = [];
  for (const v of variants) {
    const heightMm = getVariantHeightMm(v);
    if (!heightMm) return null;
    resolved.push({ product: v, heightMm });
  }
  const heights = new Set(resolved.map((r) => r.heightMm));
  if (heights.size !== resolved.length) return null;
  const baseNames = new Set(resolved.map((r) => stripHeightFromName(r.product.name ?? "")));
  if (baseNames.size !== 1) return null;
  return resolved.sort((a, b) => a.heightMm - b.heightMm);
}

interface GroupedProductCardProps {
  product: Product;
  variants?: Product[];
  onViewDetails?: (product: Product) => void;
}

export function GroupedProductCard({ product, variants, onViewDetails }: GroupedProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const { formatPrice } = useCurrency();

  // Height-only families (e.g. iFlex 190 Bollard 1.2 m / 2 m) get a picker;
  // everything else keeps the existing "N variants" presentation.
  const heightVariants = useMemo(() => getHeightVariants(variants), [variants]);
  const [selectedHeightId, setSelectedHeightId] = useState<string>(
    () => heightVariants?.[0]?.product.id ?? "",
  );
  const selectedHeight =
    heightVariants?.find((h) => h.product.id === selectedHeightId) ?? heightVariants?.[0] ?? null;
  // The product handed to View Details / Add to Cart / badges. For a height
  // family this is the concrete height SKU, so the cart gets the right
  // price and name; otherwise it's the family card as before.
  const activeProduct: Product = selectedHeight ? selectedHeight.product : product;

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
    // Height family: the price follows the picked height, not the family range.
    if (selectedHeight) {
      const sel = selectedHeight.product;
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
            // Height-only family: say so instead of the generic variant count.
            if (heightVariants) {
              return (
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-blue-500 text-white text-xs" data-testid={`product-heights-${product.id}`}>
                    {heightVariants.length} heights available
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
            impactRating={activeProduct.impactRating ?? product.impactRating}
            pas13Compliant={activeProduct.pas13Compliant ?? product.pas13Compliant}
            pas13TestMethod={activeProduct.pas13TestMethod ?? product.pas13TestMethod}
            pas13TestJoules={activeProduct.pas13TestJoules ?? product.pas13TestJoules}
            heightMin={selectedHeight ? selectedHeight.heightMm : product.heightMin}
            heightMax={selectedHeight ? selectedHeight.heightMm : product.heightMax}
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
          {/* Height picker for families that differ only by height (bollards).
              Styled to match the "Post height" select on HeightRestrictorKitCard. */}
          {heightVariants && (
            <div>
              <Label htmlFor={`height-${product.id}`} className="text-xs font-semibold">
                Height
              </Label>
              <Select value={selectedHeightId || heightVariants[0].product.id} onValueChange={setSelectedHeightId}>
                <SelectTrigger
                  id={`height-${product.id}`}
                  className="h-9 mt-1"
                  data-testid={`product-height-${product.id}`}
                >
                  <SelectValue placeholder="Select height" />
                </SelectTrigger>
                <SelectContent>
                  {heightVariants.map(({ product: v, heightMm }) => {
                    const price = parseFloat(String(v.price ?? "0"));
                    return (
                      <SelectItem key={v.id} value={v.id} data-testid={`product-height-option-${v.id}`}>
                        {formatHeightMm(heightMm)}
                        {price > 0 ? ` · ${formatPrice(price)}` : ""}
                      </SelectItem>
                    );
                  })}
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
            {/* Height family: name the selected SKU under the price */}
            {selectedHeight && (
              <div className="text-xs text-gray-500 mt-1" data-testid={`product-height-summary-${product.id}`}>
                {formatHeightMm(selectedHeight.heightMm)} · {selectedHeight.product.name}
              </div>
            )}
            {/* Show variant count below price */}
            {!heightVariants && ((variants && variants.length > 1) || (product as any).hasVariants) && (
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
            key={activeProduct.id}
            product={
              selectedHeight
                ? (activeProduct as any) // concrete height SKU; the modal adds exactly this product
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