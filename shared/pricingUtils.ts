// Unified pricing utilities for consistent price display across the application
export interface PricingData {
  productName: string;
  pricingType: 'linear_meter' | 'standard_item' | 'per_meter' | 'fixed';
  tiers?: {
    min: number;
    max: number;
    price: number;
    tier: number;
  }[];
  basePrice?: number;
  basePricePerMeter?: number;
}

export interface PriceDisplay {
  displayText: string;
  minPrice?: number;
  maxPrice?: number;
  isPerMeter: boolean;
  pricingType: string;
}

/**
 * Get price display information based on product pricing data
 */
export function getPriceDisplay(
  product: any,
  pricingData?: PricingData,
  formatPrice: (price: number) => string = (p) => `AED ${p.toLocaleString()}`
): PriceDisplay {
  // Check if this is a height restrictor or topple barrier (should display highest to lowest)
  const isHeightRestrictorOrTopple = product.name?.toLowerCase().includes('height restrictor') ||
                                     product.name?.toLowerCase().includes('topple barrier') ||
                                     product.category?.toLowerCase().includes('overhead-protection') ||
                                     product.subcategory?.toLowerCase().includes('height-control');
  
  // Check for tiered pricing from productPricing table
  if (pricingData?.tiers && pricingData.tiers.length > 0) {
    const prices = pricingData.tiers.map(t => t.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    // For linear_meter products, show per-meter range
    if (pricingData.pricingType === 'linear_meter' || pricingData.pricingType === 'per_meter') {
      // Show highest to lowest for height restrictors and topple barriers
      const displayText = isHeightRestrictorOrTopple && minPrice !== maxPrice
        ? `${formatPrice(maxPrice)} - ${formatPrice(minPrice)}/m`
        : `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}/m`;
      
      return {
        displayText,
        minPrice,
        maxPrice,
        isPerMeter: true,
        pricingType: pricingData.pricingType
      };
    }
    
    // For standard items with quantity discounts
    if (pricingData.pricingType === 'standard_item') {
      // Show highest to lowest for height restrictors and topple barriers
      const displayText = isHeightRestrictorOrTopple && minPrice !== maxPrice
        ? `${formatPrice(maxPrice)} - ${formatPrice(minPrice)}`
        : `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`;
      
      return {
        displayText,
        minPrice,
        maxPrice,
        isPerMeter: false,
        pricingType: pricingData.pricingType
      };
    }
  }
  
  // Check for variants in specifications (from API)
  if (product.specifications?.variants && Array.isArray(product.specifications.variants)) {
    const variants = product.specifications.variants;
    if (variants.length > 0) {
      const prices = variants.map((v: any) => parseFloat(v.price || 0)).filter((p: number) => p > 0);
      if (prices.length > 0) {
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        
        // Check if it's per-meter based on specifications
        const isPerMeter = product.specifications?.priceCalculation === 'linear_meter' || 
                          product.specifications?.priceCalculation === 'per_meter' ||
                          product.specifications?.measurementUnit === 'meters';
        
        if (minPrice === maxPrice) {
          return {
            displayText: formatPrice(minPrice) + (isPerMeter ? '/m' : ''),
            minPrice,
            maxPrice,
            isPerMeter,
            pricingType: product.specifications?.priceCalculation || 'fixed'
          };
        }
        
        // Show highest to lowest for height restrictors and topple barriers
        const displayText = isHeightRestrictorOrTopple
          ? `${formatPrice(maxPrice)} - ${formatPrice(minPrice)}${isPerMeter ? '/m' : ''}`
          : `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}${isPerMeter ? '/m' : ''}`;
        
        return {
          displayText,
          minPrice,
          maxPrice,
          isPerMeter,
          pricingType: product.specifications?.priceCalculation || 'fixed'
        };
      }
    }
  }
  
  // Check for grouped products with min/max prices
  if (product.hasVariants && product.minPrice && product.maxPrice) {
    const minPrice = parseFloat(String(product.minPrice));
    const maxPrice = parseFloat(String(product.maxPrice));
    
    // Check if it's a per-meter product based on name or category
    const isPerMeterProduct = product.basePricePerMeter && product.basePricePerMeter > 0 ||
                             product.name?.toLowerCase().includes('barrier') ||
                             product.name?.toLowerCase().includes('rail');
    
    if (minPrice === maxPrice) {
      return {
        displayText: formatPrice(minPrice) + (isPerMeterProduct ? '/m' : ''),
        minPrice,
        maxPrice,
        isPerMeter: isPerMeterProduct,
        pricingType: 'variant'
      };
    }
    
    // Show highest to lowest for height restrictors and topple barriers
    const displayText = isHeightRestrictorOrTopple
      ? `${formatPrice(maxPrice)} - ${formatPrice(minPrice)}${isPerMeterProduct ? '/m' : ''}`
      : `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}${isPerMeterProduct ? '/m' : ''}`;
    
    return {
      displayText,
      minPrice,
      maxPrice,
      isPerMeter: isPerMeterProduct,
      pricingType: 'variant'
    };
  }
  
  // Check for basePricePerMeter (simple per-meter pricing)
  if (product.basePricePerMeter && parseFloat(String(product.basePricePerMeter)) > 0) {
    const price = parseFloat(String(product.basePricePerMeter));
    return {
      displayText: `${formatPrice(price)}/m`,
      minPrice: price,
      maxPrice: price,
      isPerMeter: true,
      pricingType: 'per_meter'
    };
  }
  
  // Fall back to simple price
  if (product.price && parseFloat(String(product.price)) > 0) {
    const price = parseFloat(String(product.price));
    return {
      displayText: formatPrice(price),
      minPrice: price,
      maxPrice: price,
      isPerMeter: false,
      pricingType: 'fixed'
    };
  }
  
  // No pricing available
  return {
    displayText: 'Contact for pricing',
    isPerMeter: false,
    pricingType: 'contact'
  };
}

/**
 * Extract pricing data from product specifications or API response
 */
export function extractPricingData(product: any): PricingData | undefined {
  // If product has specifications with variations, extract pricing tiers
  if (product.specifications?.variations && Array.isArray(product.specifications.variations)) {
    const tiers = product.specifications.variations.map((v: any, index: number) => ({
      min: v.minQuantity || 0,
      max: v.maxQuantity || 999,
      price: parseFloat(v.price || 0),
      tier: v.tier || index + 1
    }));
    
    return {
      productName: product.name,
      pricingType: product.specifications.priceCalculation || 'fixed',
      tiers,
      basePrice: product.price ? parseFloat(String(product.price)) : undefined,
      basePricePerMeter: product.basePricePerMeter ? parseFloat(String(product.basePricePerMeter)) : undefined
    };
  }
  
  // If product has variants array directly (from grouped products)
  if (product.variants && Array.isArray(product.variants)) {
    const tiers = product.variants.map((v: any, index: number) => ({
      min: v.minQuantity || 0,
      max: v.maxQuantity || 999,
      price: parseFloat(v.price || 0),
      tier: v.tier || index + 1
    }));
    
    return {
      productName: product.name,
      pricingType: 'variant',
      tiers,
      basePrice: product.price ? parseFloat(String(product.price)) : undefined,
      basePricePerMeter: product.basePricePerMeter ? parseFloat(String(product.basePricePerMeter)) : undefined
    };
  }
  
  return undefined;
}