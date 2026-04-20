import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Plus, Minus, MapPin, Wrench, ChevronDown, ChevronUp, Package, Calculator, Ruler, AlertCircle, CheckCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCurrency } from "@/contexts/CurrencyContext";
import { GoogleMapSelector } from "./GoogleMapSelector";
import { SiteReferenceUploader } from "./SiteReferenceUploader";
import { ForkGuardKerbCalculator } from "./ForkGuardKerbCalculator";
import { QuoteBuilderPanel } from "./QuoteBuilderPanel";
import {
  calculateHeightRestrictorPricing as calcHeightRestrictor,
  calculateIFlexRailPricing as calcIFlexRail,
  calculateToppleBarrierPricing as calcToppleBarrier,
} from "@/utils/pricingCalculators";

interface Product {
  id: string;
  name: string;
  category: string;
  impactRating?: number;
  specifications?: any;
  variants?: Product[];
}

interface AddToCartModalProps {
  product: Product & {
    existingCartItem?: {
      id: string;
      quantity: number;
      notes?: string;
      applicationArea?: string;
      requiresDelivery?: boolean;
      deliveryAddress?: string;
      requiresInstallation?: boolean;
      pricingType?: string;
      calculationContext?: any;
    };
  };
  children?: React.ReactNode;
  impactCalculationId?: string | null;
  variants?: Product[];
  showVariantSelector?: boolean;
  isEditMode?: boolean;
  calculationContext?: {
    operatingZone: string;
    vehicleMass: number | string;
    loadMass: number | string;
    speed: number | string;
    speedUnit: string;
    impactAngle: number | string;
    kineticEnergy: number;
    riskLevel: string;
    totalMass: number;
    speedMs: number;
  };
  calculatorImages?: string[];
}

interface PricingData {
  unitPrice: number;
  totalPrice: number;
  tier: string;
}

export function AddToCartModal({ product, children, impactCalculationId, calculationContext, variants, showVariantSelector, calculatorImages, isEditMode = false }: AddToCartModalProps) {
  const [, setLocation] = useLocation();
  const existingItem = product.existingCartItem;

  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(existingItem?.quantity || 0);
  const [notes, setNotes] = useState(existingItem?.notes || "");
  const [applicationArea, setApplicationArea] = useState(existingItem?.applicationArea || "");
  const [pricingData, setPricingData] = useState<PricingData | null>(null);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const [requiresQuote, setRequiresQuote] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);
  
  // Delivery options
  const [requiresDelivery, setRequiresDelivery] = useState(existingItem?.requiresDelivery ?? true);
  const [showDeliveryOptions, setShowDeliveryOptions] = useState(false);
  const [deliveryLocation, setDeliveryLocation] = useState<{ address: string; lat: number; lng: number } | null>(
    existingItem?.deliveryAddress ? { address: existingItem.deliveryAddress, lat: 0, lng: 0 } : null
  );
  const [manualAddress, setManualAddress] = useState(existingItem?.deliveryAddress || "");
  
  // Installation options
  const [requiresInstallation, setRequiresInstallation] = useState(existingItem?.requiresInstallation ?? true);
  
  // Site reference images
  const [referenceImages, setReferenceImages] = useState<any[]>([]);
  const [installationLocation, setInstallationLocation] = useState("");
  
  // Column guard specific options
  const [columnLength, setColumnLength] = useState("");
  const [columnWidth, setColumnWidth] = useState("");
  const [sidesToProtect, setSidesToProtect] = useState<number>(4);
  const [threeSidesDouble, setThreeSidesDouble] = useState<'length' | 'width'>('length'); // For 3 sides: which dimension to double
  
  // Height restrictor specific options
  const [restrictorHeight, setRestrictorHeight] = useState("");
  const [restrictorWidth, setRestrictorWidth] = useState("");
  const [restrictorHeightError, setRestrictorHeightError] = useState("");
  const [restrictorWidthError, setRestrictorWidthError] = useState("");
  
  // Topple Barrier specific options
  const [toppleHeight, setToppleHeight] = useState("");
  const [toppleWidth, setToppleWidth] = useState("");
  
  // FlexiShield spacer options (added in pairs)
  const [lengthSpacers, setLengthSpacers] = useState(0);
  const [widthSpacers, setWidthSpacers] = useState(0);
  const [recommendedVariant, setRecommendedVariant] = useState<any>(null);
  const [autoCalculatedSpacers, setAutoCalculatedSpacers] = useState<{length: number; width: number} | null>(null);
  const [configurationMode, setConfigurationMode] = useState<'standard' | 'custom'>('standard');
  
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const queryClient = useQueryClient();
  const { formatPrice } = useCurrency();

  // Pricing calculations delegated to @/utils/pricingCalculators
  const calculateHeightRestrictorPricing = () =>
    calcHeightRestrictor(restrictorHeight, restrictorWidth);
  
  const calculateIFlexRailPricing = () =>
    calcIFlexRail(columnLength, columnWidth, sidesToProtect, threeSidesDouble, quantity, product.name);

  const calculateToppleBarrierPricing = () =>
    calcToppleBarrier(toppleHeight, toppleWidth);

  // Helper functions to determine product types
  // Column guard UI (length/width/sides config) should not show for spacer kits or corner guards
  const isColumnGuard = (product.category === "column-protection" ||
    product.name.toLowerCase().includes("column guard") ||
    product.name.toLowerCase().includes("column protector"))
    && !product.name.toLowerCase().includes("spacer")
    && !product.name.toLowerCase().includes("corner guard");
  
  const isFlexiShieldColumnGuard = product.name.toLowerCase().includes("flexishield column guard")
    && !product.name.toLowerCase().includes("spacer");
  const isIFlexRailColumnGuard = product.name.toLowerCase().includes("iflex rail column guard");
  const isToppleBarrier = product.name.toLowerCase().includes("topple barrier") || product.name.toLowerCase().includes("topple guardrail");
  
  const isBollard = product.category === "bollards";
  const isRackEndBarrier = product.name.toLowerCase().includes("rack end barrier");
  const isHeightRestrictor = product.name.toLowerCase().includes("height restrictor");
  const isTrafficBarrier = product.category === "traffic-barriers" && !product.name.toLowerCase().includes("gate");
  const isPedestrianBarrier = product.name.toLowerCase().includes("pedestrian barrier");
  const isVehicleStop = product.category === "vehicle-stops" || product.name === "Vehicle Stops";
  const isGate = product.category === "gates" || product.name.toLowerCase().includes("gate") || product.name === "Slide Gates";

  // Helper functions for cost calculations
  const getDeliveryCost = () => {
    if (!pricingData || !requiresDelivery) return 0;
    return pricingData.totalPrice * 0.096271916; // 9.6271916% of total product cost
  };

  const getInstallationCost = () => {
    if (!pricingData || !requiresInstallation) return 0;
    return pricingData.totalPrice * 0.235679237; // 23.5679237% of total product cost
  };

  const getFinalTotal = () => {
    if (!pricingData) return 0;
    return pricingData.totalPrice + getDeliveryCost() + getInstallationCost();
  };

  // Determine pricing type and quantity rules based on product category
  const getProductConfig = () => {
    if (isBollard) {
      return {
        isLinearMeter: false,
        step: 1,
        minQuantity: 1,
        maxQuantity: undefined, // No limit for bollards
        unit: "units",
        quantityLabel: "Quantity (Individual Units)"
      };
    }
    
    if (isRackEndBarrier) {
      return {
        isLinearMeter: false,
        step: 1,
        minQuantity: 1,
        maxQuantity: undefined, // No limit for racking projects
        unit: "sets",
        quantityLabel: "Quantity (Sets)"
      };
    }
    
    if (isHeightRestrictor) {
      return {
        isLinearMeter: false,
        step: 1,
        minQuantity: 1,
        maxQuantity: undefined, // No limit for height restrictors
        unit: "units",
        quantityLabel: "Quantity (Units)"
      };
    }
    
    // Traffic and Pedestrian barriers with per-meter pricing
    if (isTrafficBarrier || isPedestrianBarrier) {
      // Check if this barrier has per-meter pricing
      const hasPerMeterPricing = (product as any).basePricePerMeter && (product as any).basePricePerMeter > 0;
      return {
        isLinearMeter: hasPerMeterPricing, // Use per-meter if base_price_per_meter exists
        step: hasPerMeterPricing ? 0.1 : 1, // Allow 0.1m increments for per-meter products
        minQuantity: hasPerMeterPricing ? 0.8 : 1,
        maxQuantity: undefined, // No limit for barriers
        unit: hasPerMeterPricing ? "meters" : "units",
        quantityLabel: hasPerMeterPricing ? "Length (Meters)" : "Quantity (Units)"
      };
    }
    
    if (isVehicleStop) {
      return {
        isLinearMeter: false,
        step: 1,
        minQuantity: 1,
        maxQuantity: undefined, // No limit for vehicle stops
        unit: "units",
        quantityLabel: "Quantity (Units)"
      };
    }
    
    if (isFlexiShieldColumnGuard) {
      return {
        isLinearMeter: false,
        step: 1,
        minQuantity: 1,
        maxQuantity: undefined, // No limit for FlexiShield Column Guards
        unit: "units", 
        quantityLabel: "Quantity (Units)"
      };
    }
    
    if (isIFlexRailColumnGuard) {
      return {
        isLinearMeter: false,
        step: 1,
        minQuantity: 1,
        maxQuantity: undefined, // No limit for iFlex Rail Column Guards
        unit: "units", 
        quantityLabel: "Quantity (Units)"
      };
    }
    
    if (isToppleBarrier) {
      return {
        isLinearMeter: false,
        step: 1,
        minQuantity: 1,
        maxQuantity: undefined, // No limit for Topple Barriers
        unit: "units",
        quantityLabel: "Quantity (Units)"
      };
    }
    
    // Default for other products
    return {
      isLinearMeter: false,
      step: 1,
      minQuantity: 1,
      maxQuantity: undefined, // No limit for default products
      unit: "items",
      quantityLabel: "Quantity"
    };
  };

  const config = getProductConfig();
  const isLinearMeter = config.isLinearMeter;
  const step = config.step;
  const minQuantity = config.minQuantity;
  const maxQuantity = config.maxQuantity;
  const unit = config.unit;
  const quantityLabel = config.quantityLabel;

  // Get available variants from product specifications or variants array
  const getAvailableVariants = () => {
    try {
      // For FlexiShield Column Guard, we need to fetch all FlexiShield products as "variants"
      if (isFlexiShieldColumnGuard) {
        // Return empty for now, we'll use a different approach
        return [];
      }
      
      // Check for productVariants from our new grouping system
      // This should be checked first as it contains actual product variants, not pricing tiers
      if ((product as any).productVariants && Array.isArray((product as any).productVariants)) {
        // Only return productVariants if there's more than one (grouped products)
        const variants = (product as any).productVariants;
        if (variants.length > 1) {
          return variants;
        }
      }
      
      // For products that have pricing tiers but not actual variants, 
      // we don't want to show them as selectable options
      // Check if these are actual product variants or just pricing tiers
      if (product.variants && Array.isArray(product.variants)) {
        // Cold Storage Bollard has actual variants with height/diameter properties
        if (product.name === 'Cold Storage Bollard') {
          return product.variants;
        }
        
        // If all items have pricing fields like minQuantity, maxQuantity, these are pricing tiers, not variants
        const isPricingTier = product.variants.every((v: any) => 
          v.hasOwnProperty('minQuantity') || v.hasOwnProperty('tier') || v.hasOwnProperty('measurement')
        );
        if (!isPricingTier) {
          return product.variants;
        }
      }
      
      // Fallback to existing variant logic
      const specs = typeof product.specifications === 'string' 
        ? JSON.parse(product.specifications) 
        : product.specifications || {};
      
      // Use the variants array from the new product structure, but check if they're pricing tiers
      const specVariants = specs.variants || specs.availableVariants || [];
      if (specVariants.length > 0) {
        const isPricingTier = specVariants.every((v: any) => 
          v.hasOwnProperty('minQuantity') || v.hasOwnProperty('tier') || v.hasOwnProperty('measurement')
        );
        if (!isPricingTier) {
          return specVariants;
        }
      }
      
      return [];
    } catch (e) {
      return [];
    }
  };

  const availableVariants = getAvailableVariants();
  // Only show variants section if product explicitly has variants or there are real selectable variants
  const hasVariants = ((product as any).hasVariants === true && availableVariants.length > 0) || 
    availableVariants.length > 1;

  // Catalog snapshot used by QuoteBuilderPanel so Height Restrictor /
  // Swing Gate kits can resolve their sibling families (Post ↔ Top Rail /
  // Gate ↔ Post) without a second round-trip.
  const { data: allCatalogProducts = [] } = useQuery<any[]>({
    queryKey: ["/api/products"],
    enabled: open,
  });

  // For FlexiShield Column Guard - fetch the grouped product and extract all variants
  const { data: allFlexiShieldProducts = [], isLoading: isLoadingFlexiShield } = useQuery({
    queryKey: ['/api/products'],
    enabled: isFlexiShieldColumnGuard,
    select: (data: any[]) => {
      
      // Find the FlexiShield Column Guard grouped product
      const flexiShieldGroup = data.find((p: any) => {
        return p.name && p.name.toLowerCase() === 'flexishield column guard';
      });

      if (!flexiShieldGroup) return [];

      // Read the size variants from the top-level `variants` array or `specifications.variants`
      const rawVariants: any[] =
        (Array.isArray(flexiShieldGroup.variants) && flexiShieldGroup.variants) ||
        (flexiShieldGroup.specifications?.variants as any[]) ||
        [];

      if (!rawVariants.length) return [];

      // Extract dimensions and normalize for UI use
      const flexiProducts = rawVariants
        .filter((variant: any) => {
          // Exclude spacers — we only want base column guards
          return variant && variant.name && !variant.name.toLowerCase().includes('spacer');
        })
        .map((variant: any, idx: number) => {
          const variantName = String(variant.name)
            .replace('FlexiShield Column Guard – ', '')
            .replace('FlexiShield Column Guard ', '')
            .replace(' mm', 'mm');

          let length = parseInt(variant.length_mm || variant.Length_mm || 0);
          let width = parseInt(variant.width_mm || variant.Width_mm || 0);

          // If dimensions not present, extract from name like "150x150 mm"
          if (!length || !width) {
            const dimensionMatch = variantName.match(/(\d+)\s*x\s*(\d+)/);
            if (dimensionMatch) {
              length = parseInt(dimensionMatch[1]);
              width = parseInt(dimensionMatch[2]);
            }
          }

          const variantId = variant.id || variant.code || `${flexiShieldGroup.id}-v${idx}`;

          return {
            id: variantId,
            name: variant.name,
            price: parseFloat(variant.price) || 0,
            variant: variantName,
            length: length,
            width: width,
            itemId: variantId,
            code: variant.code,
          };
        })
        .sort((a: any, b: any) => (a.length || 0) - (b.length || 0));

      return flexiProducts;
    }
  });

  // Get processed variants for specific product types
  const getProcessedVariants = () => {
    if (!hasVariants) return [];
    
    if (isBollard) {
      // Group bollards by height, show color options
      const heightGroups = availableVariants.reduce((groups: any, variant: any) => {
        // Extract height - could be string like "835mm" or just "835"
        let height = variant.height || 'Unknown';
        // If height is a string with "mm", extract just the number
        if (typeof height === 'string' && height.includes('mm')) {
          height = height.replace('mm', '');
        }
        if (!groups[height]) {
          groups[height] = [];
        }
        groups[height].push(variant);
        return groups;
      }, {});
      
      return Object.entries(heightGroups).map(([height, variants]: [string, any]) => ({
        id: `height-${height}`,
        label: `${height}mm Height`,
        variants: variants,
        type: 'height'
      }));
    }
    
    if (isRackEndBarrier) {
      // Extract length from variant name/specifications and sort by ascending length
      const extractLength = (variant: any): number => {
        // Try multiple ways to extract length
        if (variant.length) return parseInt(variant.length);
        if (variant.Length_mm) return parseInt(variant.Length_mm);
        
        // Extract from variant name - look for pattern like "1500 mm", "– 1500 mm", etc.
        const name = variant.name || variant.variant || '';
        const lengthMatch = name.match(/(\d{3,4})\s*mm/);
        if (lengthMatch) return parseInt(lengthMatch[1]);
        
        // Extract from specifications if it's a string
        if (typeof variant.specifications === 'string') {
          try {
            const specs = JSON.parse(variant.specifications);
            if (specs.length_mm) return parseInt(specs.length_mm);
            if (specs.Length_mm) return parseInt(specs.Length_mm);
          } catch (e) {}
        } else if (variant.specifications) {
          if (variant.specifications.length_mm) return parseInt(variant.specifications.length_mm);
          if (variant.specifications.Length_mm) return parseInt(variant.specifications.Length_mm);
        }
        
        return 9999; // Unknown lengths go to end
      };
      
      // Sort variants by length (ascending order)
      const sortedVariants = [...availableVariants].sort((a, b) => {
        return extractLength(a) - extractLength(b);
      });
      
      // Group by length but maintain sorted order
      const lengthGroups: { [key: string]: any[] } = {};
      sortedVariants.forEach(variant => {
        const length = extractLength(variant);
        const lengthKey = length === 9999 ? 'Other' : length.toString();
        if (!lengthGroups[lengthKey]) {
          lengthGroups[lengthKey] = [];
        }
        lengthGroups[lengthKey].push(variant);
      });
      
      // Return groups in ascending length order
      return Object.keys(lengthGroups)
        .sort((a, b) => {
          if (a === 'Other') return 1;
          if (b === 'Other') return -1;
          return parseInt(a) - parseInt(b);
        })
        .map(length => ({
          id: `length-${length}`,
          label: length === 'Other' ? 'Other Length' : `${length}mm Length`,
          variants: lengthGroups[length],
          type: 'length'
        }));
    }
    
    if (isVehicleStop && product.name === "Vehicle Stops") {
      // For vehicle stops, show vehicle type variants
      return availableVariants.map((variant: any, index: number) => {
        const variantName = variant.name || `Option ${index + 1}`;
        const shortName = variantName.replace(' Stop', '');
        
        return {
          id: variant.id || `vehicle-stop-${index}`,
          label: shortName,
          variants: [variant],
          type: 'vehicle-stop',
          price: variant.price
        };
      });
    }
    
    if (isGate) {
      // For slide gates, show width variants
      if (product.name === "Slide Gates") {
        return availableVariants.map((variant: any, index: number) => {
          const widthMatch = variant.name.match(/(\d+mm)/);
          const width = widthMatch ? widthMatch[1] : `Option ${index + 1}`;
          
          return {
            id: variant.id || `slide-gate-${index}`,
            label: width,
            variants: [variant],
            type: 'slide-gate',
            price: variant.price
          };
        });
      }
      
      // For other gates, combine variant name with length information
      return availableVariants.map((variant: any, index: number) => {
        const variantName = variant.variant || variant.name || `Option ${index + 1}`;
        const length = variant.length ? `${variant.length}mm` : '';
        const label = length ? `${variantName} ${length}` : variantName;
        
        return {
          id: variant.id || variant.itemId || `variant-${index}`,
          label: label,
          variants: [variant],
          type: 'gate'
        };
      });
    }
    
    // Default variant processing for other products - sort by extracted dimensions
    const extractDimension = (variant: any): number => {
      // Try to extract numeric dimensions from name/variant
      const name = variant.name || variant.variant || '';
      
      // Look for patterns like "1500mm", "190 OD", "100x100", etc.
      const dimensionMatch = name.match(/(\d{2,4})(?:x\d{2,4})?(?:\s*(?:mm|OD))?/i);
      if (dimensionMatch) return parseInt(dimensionMatch[1]);
      
      // Try specifications
      if (variant.length) return parseInt(variant.length);
      if (variant.Length_mm) return parseInt(variant.Length_mm);
      if (variant.width) return parseInt(variant.width);
      if (variant.Width_mm) return parseInt(variant.Width_mm);
      if (variant.height) return parseInt(variant.height);
      if (variant.Height_mm) return parseInt(variant.Height_mm);
      
      return 9999; // Unknown dimensions go to end
    };
    
    // Sort variants by dimension (ascending order)
    const sortedVariants = [...availableVariants].sort((a, b) => {
      return extractDimension(a) - extractDimension(b);
    });
    
    return sortedVariants.map((variant: any, index: number) => ({
      id: variant.id || variant.itemId || `variant-${index}`,
      label: variant.variant || variant.name || `Option ${index + 1}`,
      variants: [variant],
      type: 'default'
    }));
  };

  const processedVariants = getProcessedVariants();

  // Auto-suggest FlexiShield Column Guard size and spacers
  const suggestColumnGuardConfiguration = (length: number, width: number) => {
    // Removed debug: console.log('suggestColumnGuardConfiguration called:', { length, width, productsCount: allFlexiShieldProducts.length });
    
    if (!isFlexiShieldColumnGuard || !allFlexiShieldProducts.length) {
// Not FlexiShield or no products
      return null;
    }
    
    // Use the smaller dimension as the base and calculate spacers for the larger dimension
    const baseDimension = Math.min(length, width);
    const extendedDimension = Math.max(length, width);
    
    // Find the best matching standard product for the base dimension
    // First try to find exact match, then closest larger size
    // Removed debug: console.log('Looking for exact match for baseDimension:', baseDimension);
    let suitableProduct = allFlexiShieldProducts.find((product: any) => {
      const isExactMatch = product.length === baseDimension && product.width === baseDimension;
// Check exact match
      return isExactMatch;
    });
    
    // Removed debug: console.log('Exact match found:', suitableProduct ? suitableProduct.variant : 'none');
    
    // If no exact match, find the smallest product that's larger than baseDimension
    if (!suitableProduct) {
// No exact match, looking for larger products
      const largerProducts = allFlexiShieldProducts
        .filter((product: any) => product.length >= baseDimension && product.width >= baseDimension)
        .sort((a: any, b: any) => (a.length * a.width) - (b.length * b.width));
// Found larger products
      suitableProduct = largerProducts[0];
    }
    
    // Removed debug: console.log('Suitable product found for base dimension:', suitableProduct);
    
    if (suitableProduct) {
      // Calculate spacers needed:
      // - No spacers needed for the base dimension (since we chose a product that fits)
      // - Spacers needed to extend one side from baseDimension to extendedDimension
      const baseSize = suitableProduct.length; // Square product
      const spacersNeeded = Math.max(0, Math.ceil((extendedDimension - baseSize) / 100));
      
      // Determine which dimension needs spacers
      const lengthSpacersNeeded = length === extendedDimension ? spacersNeeded : 0;
      const widthSpacersNeeded = width === extendedDimension ? spacersNeeded : 0;
      
      // Spacers calculated
      
      // Ensure quantity is set
      if (quantity === 0) {
        setQuantity(1);
      }
      
      setRecommendedVariant(suitableProduct);
      setSelectedVariant(suitableProduct);
      setAutoCalculatedSpacers({ length: lengthSpacersNeeded, width: widthSpacersNeeded });
      setLengthSpacers(lengthSpacersNeeded);
      setWidthSpacers(widthSpacersNeeded);
      
      const result = {
        variant: suitableProduct,
        lengthSpacers: lengthSpacersNeeded,
        widthSpacers: widthSpacersNeeded,
        baseSize: { length: suitableProduct.length, width: suitableProduct.width },
        finalLength: suitableProduct.length + (lengthSpacersNeeded * 100),
        finalWidth: suitableProduct.width + (widthSpacersNeeded * 100)
      };
      
// Return configuration
      return result;
    }
    
    // Removed debug: console.log('No suitable product found');
    return null;
  };
  
  // Handle column dimension input changes with immediate pricing update
  const handleColumnDimensionChange = (lengthValue?: string, widthValue?: string) => {
    const length = parseFloat(lengthValue || columnLength);
    const width = parseFloat(widthValue || columnWidth);
    
    // Removed debug: console.log('Column dimension change:', { length, width, allFlexiShieldProducts: allFlexiShieldProducts.length });
    
    if (!isNaN(length) && !isNaN(width) && length > 0 && width > 0 && allFlexiShieldProducts.length > 0) {
      const result = suggestColumnGuardConfiguration(length, width);
// Configuration found
      
      // Force immediate price calculation if configuration was found
      if (result) {
        // Calculate pricing immediately with spacers included
        const basePrice = result.variant.price || 0;
        const spacerCostPer100mm = 859.87; // AED per 100mm spacer pair from database
        const totalSpacerPairs = result.lengthSpacers + result.widthSpacers;
        const spacerCost = totalSpacerPairs * spacerCostPer100mm;
        const finalUnitPrice = basePrice + spacerCost;
        
  // Pricing calculated
        
        setPricingData({
          unitPrice: finalUnitPrice,
          totalPrice: finalUnitPrice * (quantity || 1),
          tier: totalSpacerPairs > 0 ? "Custom Configuration with Spacers" : "Base Guard"
        });
      } else {
  // No suitable configuration found
        setPricingData(null);
      }
    } else {
      // Invalid input or no products loaded
      // Reset to defaults when invalid input
      setRecommendedVariant(null);
      setAutoCalculatedSpacers(null);
      setLengthSpacers(0);
      setWidthSpacers(0);
      setPricingData(null);
    }
  };

  const calculatePriceMutation = useMutation({
    mutationFn: async (qty: number): Promise<PricingData> => {
      setIsLoadingPrice(true);
      
      // Use custom pricing for Topple Barriers
      if (isToppleBarrier && toppleHeight && toppleWidth) {
        const customPricing = calculateToppleBarrierPricing();
        setIsLoadingPrice(false);
        return {
          unitPrice: customPricing.unitPrice,
          totalPrice: customPricing.unitPrice * qty,
          tier: customPricing.tier
        };
      }
      
      // Use custom pricing for height restrictors
      if (isHeightRestrictor && (restrictorHeight || restrictorWidth)) {
        const customPricing = calculateHeightRestrictorPricing();
        setIsLoadingPrice(false);
        return {
          unitPrice: customPricing.unitPrice,
          totalPrice: customPricing.unitPrice * qty,
          tier: customPricing.tier
        };
      }
      
      // Use custom pricing for iFlex Rail Column Guards
      if (isIFlexRailColumnGuard && (columnLength || columnWidth)) {
        const customPricing = calculateIFlexRailPricing();
        setIsLoadingPrice(false);
        return customPricing;
      }
      
      // For traffic or pedestrian barriers with per-meter pricing, calculate based on meters
      if ((isTrafficBarrier || isPedestrianBarrier) && (product as any).basePricePerMeter && (product as any).basePricePerMeter > 0) {
        // Check for tiered pricing in specifications or variants
        let perMeterPrice = parseFloat((product as any).basePricePerMeter);
        let tierLabel = `${qty}m`;
        
        // Check if product has tiered pricing in specifications
        if (product.specifications) {
          const specs = typeof product.specifications === 'string' 
            ? JSON.parse(product.specifications)
            : product.specifications;
          
          // Look for pricing variations/tiers
          if (specs.variations || specs.variants) {
            const variations = specs.variations || specs.variants || [];
            
            // Find the appropriate tier based on quantity
            for (const variation of variations) {
              if (variation.measurement && variation.price) {
                // Parse the measurement range (e.g., "1-2 meters", "2-10 meters", "10-20 meters", "20+ meters")
                const measurementStr = variation.measurement.toLowerCase();
                let minQty = 0;
                let maxQty = Infinity;
                
                // Extract min and max from measurement string
                if (measurementStr.includes('+')) {
                  // Handle "20+ meters" format
                  const match = measurementStr.match(/(\d+(?:\.\d+)?)\+/);
                  if (match) {
                    minQty = parseFloat(match[1]);
                    maxQty = Infinity;
                  }
                } else if (measurementStr.includes('-')) {
                  // Handle "1-2 meters" format
                  const match = measurementStr.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
                  if (match) {
                    minQty = parseFloat(match[1]);
                    maxQty = parseFloat(match[2]);
                  }
                }
                
                // Check if current quantity falls within this tier
                if (qty >= minQty && qty <= maxQty) {
                  perMeterPrice = parseFloat(variation.price);
                  tierLabel = variation.measurement;
                  break;
                }
              }
            }
          }
        }
        
        // Also check product.variants array for tiered pricing
        if (!tierLabel.includes('meter') && product.variants && Array.isArray(product.variants)) {
          for (const variant of product.variants) {
            if (variant.measurement && variant.price) {
              const measurementStr = variant.measurement.toLowerCase();
              let minQty = 0;
              let maxQty = Infinity;
              
              if (measurementStr.includes('+')) {
                const match = measurementStr.match(/(\d+(?:\.\d+)?)\+/);
                if (match) {
                  minQty = parseFloat(match[1]);
                  maxQty = Infinity;
                }
              } else if (measurementStr.includes('-')) {
                const match = measurementStr.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
                if (match) {
                  minQty = parseFloat(match[1]);
                  maxQty = parseFloat(match[2]);
                }
              }
              
              if (qty >= minQty && qty <= maxQty) {
                perMeterPrice = parseFloat(variant.price);
                tierLabel = variant.measurement;
                break;
              }
            }
          }
        }
        
        const totalPrice = perMeterPrice * qty; // qty is in meters
        setIsLoadingPrice(false);
        return {
          unitPrice: perMeterPrice,
          totalPrice: totalPrice,
          tier: tierLabel.includes('meter') ? tierLabel : `${qty}m at ${perMeterPrice} AED/m`
        };
      }
      
      // If variant is selected, use its specific pricing
      if (selectedVariant && selectedVariant.price) {
        let unitPrice = selectedVariant.price;
        
        // Add spacer costs for FlexiShield Column Guard
        if (isFlexiShieldColumnGuard) {
          const spacerCostPer100mm = 859.87; // AED per 100mm spacer pair from database
          const totalSpacerPairs = lengthSpacers + widthSpacers;
          const spacerCost = totalSpacerPairs * spacerCostPer100mm;
          unitPrice += spacerCost;
        }
        
        const totalPrice = unitPrice * qty;
        setIsLoadingPrice(false);
        return {
          unitPrice,
          totalPrice,
          tier: isFlexiShieldColumnGuard && (lengthSpacers > 0 || widthSpacers > 0) 
            ? "Custom Configuration with Spacers" 
            : "Variant Pricing"
        };
      }
      
      const response = await apiRequest("/api/product-pricing/calculate", "POST", {
        productName: selectedVariant ? selectedVariant.name : product.name,
        quantity: qty,
      });
      setIsLoadingPrice(false);
      return response.json();
    },
    onSuccess: (data: PricingData) => {
      // Only set pricing data if it's not fallback pricing
      if (data.tier !== "Fallback") {
        setPricingData(data);
        setRequiresQuote(false);
      } else {
        setPricingData(null);
        setRequiresQuote(true);
        toast({
          title: "Pricing Unavailable",
          description: "Pricing information is not available for this product. Please contact us for a quote.",
          variant: "default",
        });
      }
    },
    onError: (error: any) => {
      setIsLoadingPrice(false);
      console.error("Pricing calculation error:", error);
      // Check if this is a "requires quote" error from the API
      const errorMessage = error.message || "Unknown error";
      if (errorMessage.includes("request a quote") || errorMessage.includes("No pricing available")) {
        setPricingData(null);
        setRequiresQuote(true);
      } else {
        setRequiresQuote(false);
        toast({
          title: "Error",
          description: `Failed to calculate pricing: ${errorMessage}`,
          variant: "destructive",
        });
      }
    },
  });

  const addToCartMutation = useMutation({
    mutationFn: async () => {
      if (!pricingData) throw new Error("No pricing data available");
      
      // Determine delivery address - prefer map location, fallback to manual address
      const finalDeliveryAddress = deliveryLocation?.address || manualAddress.trim() || null;
      
      // If in edit mode, update the existing cart item
      if (isEditMode && existingItem?.id) {
        const response = await apiRequest(`/api/cart/${existingItem.id}`, "PATCH", {
          quantity,
          pricingType: isLinearMeter ? "linear_meter" : "single_item",
          notes: notes.trim() || undefined,
          applicationArea: applicationArea.trim() || undefined,
          requiresDelivery,
          deliveryAddress: requiresDelivery ? finalDeliveryAddress : null,
          requiresInstallation,
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
          installationLocation: installationLocation.trim() || undefined,
        });
        return response.json();
      }
      
      // Otherwise, add a new item to the cart
      const response = await apiRequest("/api/cart", "POST", {
        productName: selectedVariant ? selectedVariant.name : product.name,
        quantity,
        pricingType: isLinearMeter ? "linear_meter" : "single_item",
        unitPrice: pricingData.unitPrice,
        totalPrice: pricingData.totalPrice,
        pricingTier: pricingData.tier,
        notes: notes.trim() || undefined,
        applicationArea: applicationArea.trim() || undefined,
        // Delivery options
        requiresDelivery,
        deliveryAddress: requiresDelivery ? finalDeliveryAddress : null,
        deliveryLatitude: requiresDelivery && deliveryLocation ? deliveryLocation.lat : null,
        deliveryLongitude: requiresDelivery && deliveryLocation ? deliveryLocation.lng : null,
        // Installation options
        requiresInstallation,
        // Column guard specific data
        columnLength: isColumnGuard ? columnLength : undefined,
        columnWidth: isColumnGuard ? columnWidth : undefined,
        sidesToProtect: isColumnGuard && !isFlexiShieldColumnGuard ? sidesToProtect : undefined,
        // FlexiShield spacer data
        lengthSpacers: isFlexiShieldColumnGuard ? lengthSpacers : undefined,
        widthSpacers: isFlexiShieldColumnGuard ? widthSpacers : undefined,
        // Height restrictor specific data
        restrictorHeight: isHeightRestrictor && restrictorHeight ? parseFloat(restrictorHeight) : undefined,
        restrictorWidth: isHeightRestrictor && restrictorWidth ? parseFloat(restrictorWidth) : undefined,
        // Topple Barrier specific data
        toppleHeight: isToppleBarrier && toppleHeight ? parseFloat(toppleHeight) : undefined,
        toppleWidth: isToppleBarrier && toppleWidth ? parseFloat(toppleWidth) : undefined,
        // Impact calculation linkage
        impactCalculationId,
        calculationContext,
        // Calculator images (if provided)
        calculatorImages: calculatorImages || [],
        // Site reference images
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
        installationLocation: installationLocation.trim() || undefined,
        // Selected variant information
        selectedVariant: selectedVariant ? {
          itemId: selectedVariant.itemId,
          variant: selectedVariant.variant,
          length: selectedVariant.length,
          width: selectedVariant.width,
          height: selectedVariant.height,
          price: selectedVariant.price,
          code: selectedVariant.code
        } : null,
      });
      return response.json();
    },
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Success",
        description: isEditMode 
          ? `${selectedVariant ? selectedVariant.name : product.name} updated in cart`
          : `${selectedVariant ? selectedVariant.name : product.name} added to cart`,
      });
      setOpen(false);
      setQuantity(minQuantity);
      setNotes("");
      setApplicationArea("");
      setPricingData(null);
      setRequiresDelivery(true);
      setShowDeliveryOptions(false);
      setDeliveryLocation(null);
      setManualAddress("");
      setRequiresInstallation(true);
      // Reset site reference images
      setReferenceImages([]);
      setInstallationLocation("");
      // Reset variant selection
      setSelectedVariant(null);
      // Reset column guard specific fields
      setColumnLength("");
      setColumnWidth("");
      setSidesToProtect(4);
      // Reset height restrictor fields
      setRestrictorHeight("");
      setRestrictorWidth("");
      // Reset Topple Barrier fields
      setToppleHeight("");
      setToppleWidth("");
    },
    onError: (error: any) => {
      console.error("Add to cart error:", error);
      haptic.error();
      toast({
        title: "Error",
        description: `Failed to add to cart: ${error.message || "Unknown error"}`,
        variant: "destructive",
      });
    },
  });

  const updateQuantity = (newQuantity: number) => {
    if (newQuantity < minQuantity || (maxQuantity !== undefined && newQuantity > maxQuantity)) return;
    
    // Round to nearest step increment for linear meters
    if (isLinearMeter) {
      newQuantity = Math.round(newQuantity / step) * step;
      // Ensure minimum quantity is maintained
      if (newQuantity < minQuantity) {
        newQuantity = minQuantity;
      }
    } else {
      // For single items, ensure whole numbers
      newQuantity = Math.round(newQuantity);
    }
    
    setQuantity(newQuantity);
    
    // For Height Restrictor, update pricing based on custom dimensions
    if (isHeightRestrictor) {
      const pricing = calculateHeightRestrictorPricing();
      setPricingData({
        unitPrice: pricing.unitPrice,
        totalPrice: pricing.unitPrice * newQuantity,
        tier: pricing.tier
      });
    }
    // For iFlex Rail Column Guard, update pricing based on dimensions
    else if (isIFlexRailColumnGuard) {
      const pricing = calculateIFlexRailPricing();
      setPricingData({
        unitPrice: pricing.unitPrice,
        totalPrice: pricing.unitPrice * newQuantity,
        tier: pricing.tier
      });
    } else {
      calculatePriceMutation.mutate(newQuantity);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      // Reset to minimum quantity when opening
      const initialQuantity = minQuantity;
      setQuantity(initialQuantity);
      
      // For Height Restrictor, set initial pricing
      if (isHeightRestrictor) {
        const pricing = calculateHeightRestrictorPricing();
        setPricingData({
          unitPrice: pricing.unitPrice,
          totalPrice: pricing.unitPrice * initialQuantity,
          tier: pricing.tier
        });
      }
      // For iFlex Rail Column Guard, set initial pricing
      else if (isIFlexRailColumnGuard) {
        const pricing = calculateIFlexRailPricing();
        setPricingData({
          unitPrice: pricing.unitPrice,
          totalPrice: pricing.unitPrice * initialQuantity,
          tier: pricing.tier
        });
      }
      // Only calculate price if not FlexiShield, Height Restrictor, or Topple Barrier (they have custom logic)
      else if (!isFlexiShieldColumnGuard && !isHeightRestrictor && !isToppleBarrier) {
        calculatePriceMutation.mutate(initialQuantity);
      }
    }
  };

  // Recalculate Height Restrictor pricing when dimensions change
  useEffect(() => {
    if (isHeightRestrictor && open && (restrictorHeight || restrictorWidth)) {
      const pricing = calculateHeightRestrictorPricing();
      setPricingData({
        unitPrice: pricing.unitPrice,
        totalPrice: pricing.unitPrice * quantity,
        tier: pricing.tier
      });
    }
  }, [restrictorHeight, restrictorWidth, quantity, isHeightRestrictor, open]);
  
  // Recalculate iFlex Rail Column Guard pricing when dimensions or sides change
  useEffect(() => {
    if (isIFlexRailColumnGuard && open && (columnLength || columnWidth || sidesToProtect)) {
      const pricing = calculateIFlexRailPricing();
      setPricingData({
        unitPrice: pricing.unitPrice,
        totalPrice: pricing.unitPrice * quantity,
        tier: pricing.tier
      });
    }
  }, [columnLength, columnWidth, sidesToProtect, threeSidesDouble, quantity, isIFlexRailColumnGuard, open]);

  // Recalculate Topple Barrier pricing when dimensions change
  useEffect(() => {
    if (isToppleBarrier && open && toppleHeight && toppleWidth) {
      const pricing = calculateToppleBarrierPricing();
      setPricingData({
        unitPrice: pricing.unitPrice,
        totalPrice: pricing.unitPrice * quantity,
        tier: pricing.tier
      });
    }
  }, [toppleHeight, toppleWidth, quantity, isToppleBarrier, open]);

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          {children || (
            <Button variant="outline" size="sm" data-testid={`button-add-to-cart-${product.id}`}>
              <ShoppingCart className="h-4 w-4 mr-2" />
              Add to Cart
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto add-to-cart-modal-content" data-testid={`modal-add-to-cart-${product.id}`}>
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Modify Cart Item" : "Add to Cart"}</DialogTitle>
            <DialogDescription>
              {isEditMode ? `Update quantity and options for ${product.name}` : `Configure quantity and options for ${product.name}`}
            </DialogDescription>
          </DialogHeader>

        <div className="space-y-4">
          {/* Quote Builder panel — renders for per-length barriers + kit
              products (Height Restrictor, Swing Gate). Rep enters total
              length or kit dimensions and the cart gets the right lines
              in one click. Falls back silently to the standard picker for
              products that don't match. */}
          <QuoteBuilderPanel
            product={product as any}
            allProducts={allCatalogProducts}
            onComplete={() => {
              handleOpenChange(false);
            }}
          />
          {/* Product Info Card — always shown at top, especially useful for single-SKU items like Spacer Set */}
          {(() => {
            const isSpacerKit = product.name.toLowerCase().includes("spacer");
            const singleVariant = availableVariants.length === 1 ? availableVariants[0] : null;
            const showInfo = isSpacerKit || (singleVariant && singleVariant.name && !hasVariants);
            if (!showInfo) return null;
            const v = singleVariant;
            const dims: string[] = [];
            if (v?.length_mm) dims.push(`Length ${v.length_mm}mm`);
            if (v?.width_mm) dims.push(`Width ${v.width_mm}mm`);
            if (v?.height_mm) dims.push(`Height ${v.height_mm}mm`);
            if (v?.od_mm) dims.push(`OD ${v.od_mm}mm`);
            return (
              <div className="space-y-2 border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg" data-testid="product-info-card">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-yellow-700" />
                  <Label className="text-base font-semibold text-yellow-900 dark:text-yellow-100">Product Details</Label>
                </div>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-700 dark:text-gray-300">Product:</span>
                    <span className="font-medium text-black dark:text-white">{product.name}</span>
                  </div>
                  {v?.name && (
                    <div className="flex justify-between">
                      <span className="text-gray-700 dark:text-gray-300">Size / Variant:</span>
                      <span className="font-medium text-black dark:text-white">{v.name}</span>
                    </div>
                  )}
                  {dims.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-700 dark:text-gray-300">Dimensions:</span>
                      <span className="font-medium text-black dark:text-white">{dims.join(" × ")}</span>
                    </div>
                  )}
                  {v?.code && (
                    <div className="flex justify-between">
                      <span className="text-gray-700 dark:text-gray-300">Product Code:</span>
                      <span className="font-mono text-xs text-black dark:text-white">{v.code}</span>
                    </div>
                  )}
                  {isSpacerKit && (
                    <div className="mt-2 p-2 bg-white dark:bg-black/30 rounded border border-yellow-400 text-xs text-gray-800 dark:text-gray-200">
                      <strong>Note:</strong> Spacers are sold in pairs. One unit = one pair of {v?.length_mm || 100}mm spacers.
                      Use pairs to extend the FlexiShield Column Guard coverage on larger columns (e.g. 2 length pairs + 1 width pair adds 200mm to length and 100mm to width).
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Product Variant Selection - Show when showVariantSelector is true */}
          {showVariantSelector && variants && variants.length > 0 && (
            <div className="space-y-3 border border-purple-200 bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-purple-600" />
                <Label className="text-base font-medium text-purple-800">Select Product Variant</Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="variant-select" className="text-sm">
                  Choose specific model ({variants.length} variants available)
                </Label>
                <Select 
                  value={selectedVariant?.id || ""} 
                  onValueChange={(variantId) => {
                    const variant = variants.find((v: any) => v.id === variantId);
                    setSelectedVariant(variant);
                    if (variant) {
                      // Recalculate price for the selected variant
                      calculatePriceMutation.mutate(quantity);
                    }
                  }}
                  data-testid="variant-selector"
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a variant..." />
                  </SelectTrigger>
                  <SelectContent>
                    {variants.sort((a: any, b: any) => {
                      // Extract numeric dimensions for sorting
                      const extractDimension = (variant: any): number => {
                        const name = variant.name || '';
                        // Try to extract first number from name (usually the length)
                        const match = name.match(/(\d+)\s*mm/);
                        return match ? parseInt(match[1]) : 9999;
                      };
                      const dimA = extractDimension(a);
                      const dimB = extractDimension(b);
                      if (dimA !== dimB) return dimA - dimB;
                      // If dimensions are equal, sort by price
                      const priceA = parseFloat(a.price || '0');
                      const priceB = parseFloat(b.price || '0');
                      return priceA - priceB;
                    }).map((variant: any) => (
                      <SelectItem key={variant.id} value={variant.id}>
                        <div className="flex justify-between items-center w-full">
                          <span>{variant.name}</span>
                          <span className="text-yellow-600 font-medium ml-4">
                            {formatPrice(parseFloat(variant.price || '0'))}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Product Variant Selection - Show when product has selectable variants (NOT for FlexiShield or iFlex Rail which have their own config flows) */}
          {!showVariantSelector && availableVariants.length > 1 && !isFlexiShieldColumnGuard && !isIFlexRailColumnGuard && !((product as any).basePricePerMeter && (product as any).basePricePerMeter > 0) && (
            <div className="space-y-3 border border-yellow-200 bg-yellow-50 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-yellow-600" />
                <Label className="text-base font-medium text-yellow-800">Select Product Variant</Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="variant-select" className="text-sm">
                  Choose specific model ({availableVariants.length} available)
                </Label>
                <Select
                  value={selectedVariant?.id || selectedVariant?.code || ""}
                  onValueChange={(variantId) => {
                    const variant = availableVariants.find((v: any) => (v.id || v.code) === variantId);
                    setSelectedVariant(variant);
                    if (variant) {
                      // Recalculate price for the selected variant
                      calculatePriceMutation.mutate(quantity);
                    }
                  }}
                  data-testid="variant-selector"
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a variant..." />
                  </SelectTrigger>
                  <SelectContent>
                    {[...availableVariants].sort((a: any, b: any) => {
                      // Extract numeric dimensions for sorting
                      const extractDimension = (variant: any): number => {
                        const name = variant.name || '';
                        // Try mm match first (e.g., "1200mm"), then OD match (e.g., "130 OD"), then any number
                        const mmMatch = name.match(/(\d+)\s*mm/i);
                        if (mmMatch) return parseInt(mmMatch[1]);
                        const odMatch = name.match(/(\d+)\s*OD/i);
                        if (odMatch) return parseInt(odMatch[1]);
                        const anyNum = name.match(/(\d+)/);
                        return anyNum ? parseInt(anyNum[1]) : 9999;
                      };
                      const dimA = extractDimension(a);
                      const dimB = extractDimension(b);
                      if (dimA !== dimB) return dimA - dimB;
                      // If dimensions are equal, sort by price
                      const priceA = parseFloat(a.price || '0');
                      const priceB = parseFloat(b.price || '0');
                      return priceA - priceB;
                    }).map((variant: any) => {
                      const variantKey = variant.id || variant.code || variant.name;
                      return (
                        <SelectItem key={variantKey} value={variantKey}>
                          <div className="flex justify-between items-center w-full">
                            <span>{variant.name}</span>
                            <span className="text-yellow-600 font-medium ml-4">
                              {formatPrice(variant.price)}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* ForGuard Kerb Length Calculator - Show only for ForGuard Kerb products */}
          {product.name?.includes('ForkGuard Kerb') && (
            <div className="space-y-4">
              <ForkGuardKerbCalculator 
                onCalculate={(combination) => {
                  // Calculate total quantity from all kerb lengths
                  const totalQuantity = combination.lengths.reduce((sum, item) => sum + item.quantity, 0);
                  setQuantity(totalQuantity);
                  // Store the combination for later use when adding to cart
                  (window as any).__forkGuardCombination = combination;
                }}
                onAddToCart={async (items) => {
                  // Add each kerb variant to cart
                  for (const item of items) {
                    const cartItem = {
                      productName: item.productName,
                      quantity: item.quantity,
                      unitPrice: item.unitPrice,
                      totalPrice: item.unitPrice * item.quantity,
                      pricingType: 'per_item',
                      notes: notes || `Part of ForGuard Kerb combination`,
                      applicationArea: applicationArea,
                      requiresDelivery,
                      deliveryAddress: requiresDelivery ? (deliveryLocation?.address || manualAddress) : null,
                      requiresInstallation,
                      referenceImages: referenceImages.length > 0 ? JSON.stringify(referenceImages) : null,
                      installationLocation: installationLocation || null,
                    };
                    
                    try {
                      await apiRequest('/api/cart', 'POST', cartItem);
                    } catch (error) {
                      console.error('Error adding kerb item to cart:', error);
                    }
                  }
                  
                  toast({
                    title: "Success",
                    description: "ForGuard Kerb combination added to cart",
                  });
                  haptic("success");
                  setOpen(false);
                  queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
                }}
              />
              <Separator />
            </div>
          )}

          {/* Impact Calculation Context - Display when available */}
          {calculationContext && (
            <div className="space-y-3 border border-green-200 bg-green-50 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-green-600" />
                <Label className="text-base font-medium text-green-800">Linked Impact Test Result</Label>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Kinetic Energy:</span>
                  <div className="text-lg font-bold text-green-700">
                    {Math.round(calculationContext.kineticEnergy).toLocaleString()} J
                  </div>
                </div>
                <div>
                  <span className="font-medium">Risk Level:</span>
                  <div className="font-semibold text-green-700">{calculationContext.riskLevel}</div>
                </div>
                <div>
                  <span className="font-medium">Vehicle Mass:</span>
                  <div>{calculationContext.vehicleMass} kg</div>
                </div>
                <div>
                  <span className="font-medium">Load Mass:</span>
                  <div>{calculationContext.loadMass} kg</div>
                </div>
                <div>
                  <span className="font-medium">Speed:</span>
                  <div>{calculationContext.speed} {calculationContext.speedUnit}</div>
                </div>
                <div>
                  <span className="font-medium">Impact Angle:</span>
                  <div>{calculationContext.impactAngle}°</div>
                </div>
              </div>
              <div className="text-xs text-green-600 bg-green-100 p-2 rounded">
                This product was recommended based on your impact calculation results. The test details will be linked to this cart item.
              </div>
            </div>
          )}

          {/* Column Guard Specific Options - Only for NON-FlexiShield column guards */}
          {isColumnGuard && !isFlexiShieldColumnGuard && (
            <div className="space-y-4 border border-blue-200 bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-600" />
                <Label className="text-base font-medium text-blue-800">Column Specifications</Label>
              </div>
              
              {/* Column Dimensions */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 items-end">
                  <div className="flex flex-col">
                    <Label htmlFor="column-length" className="mb-2 text-xs font-medium">
                      Column Length (mm)
                    </Label>
                    <Input
                      id="column-length"
                      type="number"
                      value={columnLength}
                      onChange={(e) => {
                        const value = e.target.value;
                        setColumnLength(value);
                      }}
                      placeholder="e.g., 150"
                      min="1"
                      data-testid="input-column-length"
                    />
                  </div>
                  <div className="flex flex-col">
                    <Label htmlFor="column-width" className="mb-2 text-xs font-medium">
                      Column Width (mm) {sidesToProtect === 1 && <span className="text-gray-400">(Not required for 1 side)</span>}
                    </Label>
                    <Input
                      id="column-width"
                      type="number"
                      value={columnWidth}
                      onChange={(e) => {
                        const value = e.target.value;
                        setColumnWidth(value);
                      }}
                      placeholder={sidesToProtect === 1 ? "Not required" : "e.g., 150"}
                      min="1"
                      disabled={sidesToProtect === 1}
                      className={sidesToProtect === 1 ? "opacity-50 cursor-not-allowed" : ""}
                      data-testid="input-column-width"
                    />
                  </div>
                </div>
                
              </div>

              {/* Sides to Protect (not for FlexiShield Column Guard) */}
              {!isFlexiShieldColumnGuard && (
                <div className="space-y-2">
                  <Label htmlFor="sides-to-protect" className="text-xs">
                    Number of Sides to Protect
                  </Label>
                  <select
                    id="sides-to-protect"
                    value={sidesToProtect}
                    onChange={(e) => setSidesToProtect(Number(e.target.value))}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid="select-sides-to-protect"
                  >
                    <option value={1}>1 Side</option>
                    <option value={2}>2 Sides</option>
                    <option value={3}>3 Sides</option>
                    <option value={4}>4 Sides</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Select how many sides of the column need protection
                  </p>
                </div>
              )}
              
              {/* 3 Sides Configuration - which dimension to double */}
              {!isFlexiShieldColumnGuard && sidesToProtect === 3 && (
                <div className="space-y-2">
                  <Label htmlFor="three-sides-config" className="text-xs">
                    Which dimension appears on two sides?
                  </Label>
                  <select
                    id="three-sides-config"
                    value={threeSidesDouble}
                    onChange={(e) => setThreeSidesDouble(e.target.value as 'length' | 'width')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid="select-three-sides-double"
                  >
                    <option value="length">
                      Length (protect 2 × {columnLength || '?'}mm sides + 1 × {columnWidth || '?'}mm side)
                    </option>
                    <option value="width">
                      Width (protect 2 × {columnWidth || '?'}mm sides + 1 × {columnLength || '?'}mm side)
                    </option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    For 3-sided protection, specify which dimension covers two opposite sides
                  </p>
                </div>
              )}
              
              {!isFlexiShieldColumnGuard && (
                <div className="text-sm text-blue-700 bg-blue-100 p-3 rounded">
                  <p><strong>Note:</strong> Column dimensions help us provide accurate pricing and ensure proper fit for your specific application.</p>
                </div>
              )}
            </div>
          )}

          {/* FlexiShield Column Guard Configuration Choice - OUTSIDE hasVariants condition */}
          {isFlexiShieldColumnGuard && (
            <div className="space-y-3 border border-yellow-200 bg-yellow-50 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-yellow-600" />
                <Label className="text-base font-medium text-yellow-800">Size Configuration Selection</Label>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => {
                        setConfigurationMode('standard');
                        setColumnLength('');
                        setColumnWidth('');
                        setRecommendedVariant(null);
                        setAutoCalculatedSpacers(null);
                        setLengthSpacers(0);
                        setWidthSpacers(0);
                        setPricingData(null);
                      }}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        configurationMode === 'standard'
                          ? 'bg-yellow-500 text-white shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                      data-testid="button-standard-sizes"
                    >
                      Standard Sizes
                    </button>
                    <button
                      onClick={() => {
                        setConfigurationMode('custom');
                        setSelectedVariant(null);
                        setLengthSpacers(0);
                        setWidthSpacers(0);
                        setPricingData(null);
                      }}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        configurationMode === 'custom'
                          ? 'bg-yellow-500 text-white shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                      data-testid="button-custom-dimensions"
                    >
                      Custom Dimensions
                    </button>
                  </div>
                </div>

                {configurationMode === 'standard' && (
                  <div className="space-y-3">
                    <Label>Select Standard Column Guard Size</Label>
                    <p className="text-sm text-gray-600">Choose from our 11 standard sizes. Perfect if your column matches these dimensions.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {isLoadingFlexiShield ? (
                        <div className="col-span-full text-center py-4 text-gray-500">
                          Loading standard sizes...
                        </div>
                      ) : allFlexiShieldProducts.length > 0 ? (
                        allFlexiShieldProducts.map((variant: any, index: number) => (
                          <button
                            key={`standard-${variant.id || variant.itemId || index}`}
                            onClick={() => {
                        // Selected variant
                              setSelectedVariant(variant);
                              setRecommendedVariant(null);
                              setAutoCalculatedSpacers(null);
                              setLengthSpacers(0);
                              setWidthSpacers(0);
                              const unitPrice = variant.price || 0;
                              const totalPrice = unitPrice * (quantity || 1);
                              setPricingData({
                                unitPrice,
                                totalPrice,
                                tier: "Standard Size"
                              });
                        // Set pricing data
                            }}
                            className={`p-3 border rounded-lg text-left transition-colors ${
                              selectedVariant?.id === variant.id || selectedVariant?.itemId === variant.itemId
                                ? 'border-yellow-500 bg-yellow-100' 
                                : 'border-gray-200 hover:border-yellow-300'
                            }`}
                            data-testid={`button-standard-size-${(variant.variant || variant.name || 'size')?.replace(/[^a-zA-Z0-9]/g, '-')}`}
                          >
                            <div className="font-medium text-sm">{variant.variant || variant.name || 'Size Option'}</div>
                            <div className="text-sm text-yellow-600 font-semibold">{formatPrice(variant.price || 0)}</div>
                            {variant.length && variant.width && (
                              <div className="text-xs text-gray-500 mt-1">
                                {variant.length}mm × {variant.width}mm
                              </div>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="col-span-full text-center py-4 text-gray-500">
                          No standard sizes found. Please try refreshing the page.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {configurationMode === 'custom' && (
                  <div className="space-y-4">
                    <Label>Enter Custom Column Dimensions</Label>
                    <p className="text-sm text-gray-600">
                      We'll find the best base size and calculate spacers needed. For example, a 300×500mm column uses a 300×300mm base guard + 2 pairs of 100mm spacers.
                    </p>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="custom-column-length" className="text-sm">Column Length (mm)</Label>
                        <Input
                          id="custom-column-length"
                          type="number"
                          value={columnLength}
                          onChange={(e) => {
                            const value = e.target.value;
                            setColumnLength(value);
                            if (value && columnWidth) {
                              handleColumnDimensionChange(value, columnWidth);
                            }
                          }}
                          placeholder="e.g., 300"
                          min="50"
                          max="1200"
                          data-testid="input-custom-column-length"
                        />
                      </div>
                      <div>
                        <Label htmlFor="custom-column-width" className="text-sm">Column Width (mm)</Label>
                        <Input
                          id="custom-column-width"
                          type="number"
                          value={columnWidth}
                          onChange={(e) => {
                            const value = e.target.value;
                            setColumnWidth(value);
                            if (columnLength && value) {
                              handleColumnDimensionChange(columnLength, value);
                            }
                          }}
                          placeholder="e.g., 500"
                          min="50"
                          max="1200"
                          data-testid="input-custom-column-width"
                        />
                      </div>
                    </div>

                    {/* Show either calculation result or "no pricing" message */}
                    {columnLength && columnWidth && (
                      <div>
                        {recommendedVariant && autoCalculatedSpacers ? (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                              <span className="font-medium text-green-800">Custom Configuration Calculated</span>
                            </div>
                            <div className="text-sm space-y-2">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="text-gray-600">Base Guard:</span>
                                  <div className="font-medium">{recommendedVariant.variant || recommendedVariant.name}</div>
                                  <div className="text-green-600 font-semibold">{formatPrice(recommendedVariant.price || 0)}</div>
                                </div>
                                <div>
                                  <span className="text-gray-600">Spacers Needed:</span>
                                  <div>Length: {autoCalculatedSpacers.length} pairs (+{autoCalculatedSpacers.length * 100}mm)</div>
                                  <div>Width: {autoCalculatedSpacers.width} pairs (+{autoCalculatedSpacers.width * 100}mm)</div>
                                  {(autoCalculatedSpacers.length + autoCalculatedSpacers.width) > 0 && (
                                    <div className="text-green-600 font-semibold">
                                      Spacer cost: {formatPrice((autoCalculatedSpacers.length + autoCalculatedSpacers.width) * 150)}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="pt-2 border-t border-green-200">
                                <div className="flex justify-between items-center">
                                  <span className="font-medium">Total Unit Price:</span>
                                  <span className="text-lg font-bold text-green-600">
                                    {formatPrice((recommendedVariant.price || 0) + ((autoCalculatedSpacers.length + autoCalculatedSpacers.width) * 150))}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-600 mt-1">
                                  Final coverage: {parseInt(columnLength) + (autoCalculatedSpacers.length * 100)}mm × {parseInt(columnWidth) + (autoCalculatedSpacers.width * 100)}mm
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <AlertCircle className="h-4 w-4 text-orange-600" />
                              <span className="font-medium text-orange-800">Pricing Not Available</span>
                            </div>
                            <p className="text-sm text-orange-700">
                              This product requires a custom quote. Please contact our sales team for accurate pricing and availability.
                            </p>
                            <ul className="text-xs text-orange-600 mt-2 list-disc list-inside">
                              <li>Pricing varies based on quantity, specifications, and location</li>
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Height Restrictor Custom Dimensions Configuration */}
          {isHeightRestrictor && (
            <div className="space-y-3 border border-purple-200 bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-purple-600" />
                <Label className="text-base font-medium text-purple-800">Custom Height Restrictor Dimensions</Label>
              </div>
              
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Configure your custom height restrictor dimensions. Standard size is 2000mm H x 4000mm W. 
                  Pricing is calculated based on total area.
                </p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <Label htmlFor="restrictor-height" className="mb-2 text-xs font-medium">
                      Height (mm)
                    </Label>
                    <Input
                      id="restrictor-height"
                      type="number"
                      value={restrictorHeight}
                      onChange={(e) => {
                        const value = e.target.value;
                        const numValue = parseFloat(value);
                        
                        // Allow empty input for clearing
                        if (value === "") {
                          setRestrictorHeight("");
                          setRestrictorHeightError("");
                          return;
                        }
                        
                        // Validate range
                        if (!isNaN(numValue)) {
                          if (numValue < 2000) {
                            setRestrictorHeightError("Height must be at least 2000mm");
                          } else if (numValue > 8000) {
                            setRestrictorHeightError("Height cannot exceed 8000mm");
                          } else {
                            setRestrictorHeightError("");
                          }
                          setRestrictorHeight(value);
                        }
                      }}
                      onBlur={(e) => {
                        const value = e.target.value;
                        const numValue = parseFloat(value);
                        
                        // Auto-correct to limits on blur
                        if (!isNaN(numValue)) {
                          if (numValue < 2000) {
                            setRestrictorHeight("2000");
                            setRestrictorHeightError("");
                          } else if (numValue > 8000) {
                            setRestrictorHeight("8000");
                            setRestrictorHeightError("");
                          }
                        } else if (value === "") {
                          setRestrictorHeight("2000");
                          setRestrictorHeightError("");
                        }
                      }}
                      placeholder="2000"
                      min="2000"
                      max="8000"
                      className={restrictorHeightError ? "border-red-500" : ""}
                      data-testid="input-restrictor-height"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Min: 2000mm, Max: 8000mm
                    </p>
                    {restrictorHeightError && (
                      <p className="text-xs text-red-500 mt-1">{restrictorHeightError}</p>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <Label htmlFor="restrictor-width" className="mb-2 text-xs font-medium">
                      Width (mm)
                    </Label>
                    <Input
                      id="restrictor-width"
                      type="number"
                      value={restrictorWidth}
                      onChange={(e) => {
                        const value = e.target.value;
                        const numValue = parseFloat(value);
                        
                        // Allow empty input for clearing
                        if (value === "") {
                          setRestrictorWidth("");
                          setRestrictorWidthError("");
                          return;
                        }
                        
                        // Validate range
                        if (!isNaN(numValue)) {
                          if (numValue < 1000) {
                            setRestrictorWidthError("Width must be at least 1000mm");
                          } else if (numValue > 6000) {
                            setRestrictorWidthError("Width cannot exceed 6000mm");
                          } else {
                            setRestrictorWidthError("");
                          }
                          setRestrictorWidth(value);
                        }
                      }}
                      onBlur={(e) => {
                        const value = e.target.value;
                        const numValue = parseFloat(value);
                        
                        // Auto-correct to limits on blur
                        if (!isNaN(numValue)) {
                          if (numValue < 1000) {
                            setRestrictorWidth("1000");
                            setRestrictorWidthError("");
                          } else if (numValue > 6000) {
                            setRestrictorWidth("6000");
                            setRestrictorWidthError("");
                          }
                        } else if (value === "") {
                          setRestrictorWidth("4000");
                          setRestrictorWidthError("");
                        }
                      }}
                      placeholder="4000"
                      min="1000"
                      max="6000"
                      className={restrictorWidthError ? "border-red-500" : ""}
                      data-testid="input-restrictor-width"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Min: 1000mm, Max: 6000mm
                    </p>
                    {restrictorWidthError && (
                      <p className="text-xs text-red-500 mt-1">{restrictorWidthError}</p>
                    )}
                  </div>
                </div>
                
                {(restrictorHeight || restrictorWidth) && !restrictorHeightError && !restrictorWidthError && (
                  <div className="bg-purple-100 border border-purple-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="h-4 w-4 text-purple-600" />
                      <span className="font-medium text-purple-800">Configuration Summary</span>
                    </div>
                    <div className="text-sm text-purple-700">
                      <div>Height: {restrictorHeight || '2000'}mm</div>
                      <div>Width: {restrictorWidth || '4000'}mm</div>
                      <div>Total Area: {((parseFloat(restrictorHeight) || 2000) * (parseFloat(restrictorWidth) || 4000) / 1000000).toFixed(2)} m²</div>
                    </div>
                  </div>
                )}
                
                <div className="text-sm text-purple-700 bg-purple-100 p-3 rounded">
                  <p><strong>Note:</strong> Height restrictors are custom manufactured to your exact specifications. Lead time may vary based on dimensions.</p>
                </div>
              </div>
            </div>
          )}

          {/* Topple Barrier Configuration */}
          {isToppleBarrier && (
            <div className="space-y-4 border border-purple-200 bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-purple-600" />
                <Label className="text-base font-medium text-purple-800">Topple Barrier Configuration</Label>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="topple-height" className="text-sm">Height (mm)</Label>
                  <Select value={toppleHeight} onValueChange={setToppleHeight}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select height..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2080">2.08m (4 rails)</SelectItem>
                      <SelectItem value="3600">3.6m (6 rails)</SelectItem>
                      <SelectItem value="5300">5.3m (8 rails)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="topple-width" className="text-sm">Width (mm)</Label>
                  <Select value={toppleWidth} onValueChange={setToppleWidth}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select width..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="500">500mm</SelectItem>
                      <SelectItem value="600">600mm</SelectItem>
                      <SelectItem value="700">700mm</SelectItem>
                      <SelectItem value="800">800mm</SelectItem>
                      <SelectItem value="900">900mm</SelectItem>
                      <SelectItem value="1000">1000mm</SelectItem>
                      <SelectItem value="1100">1100mm</SelectItem>
                      <SelectItem value="1200">1200mm</SelectItem>
                      <SelectItem value="1300">1300mm</SelectItem>
                      <SelectItem value="1400">1400mm</SelectItem>
                      <SelectItem value="1500">1500mm</SelectItem>
                      <SelectItem value="1600">1600mm</SelectItem>
                      <SelectItem value="1700">1700mm</SelectItem>
                      <SelectItem value="1800">1800mm</SelectItem>
                      <SelectItem value="1900">1900mm</SelectItem>
                      <SelectItem value="2000">2000mm</SelectItem>
                      <SelectItem value="2100">2100mm</SelectItem>
                      <SelectItem value="2200">2200mm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {toppleHeight && toppleWidth && (
                <div className="text-sm text-purple-700 bg-purple-100 p-3 rounded">
                  <p><strong>Selected Configuration:</strong> {(parseFloat(toppleHeight) / 1000).toFixed(2)}m H × {toppleWidth}mm W</p>
                  <p className="mt-1">Barrier includes 2 posts and {toppleHeight === '2080' ? '4' : toppleHeight === '3600' ? '6' : '8'} horizontal rails.</p>
                  <p className="mt-1">Ideal for warehouse racking topple prevention and ground level protection.</p>
                </div>
              )}
            </div>
          )}

          {/* Product-Specific Variant Selection - NOT for products with grouped variants, NOT FlexiShield and NOT per-meter products */}
          {hasVariants && !((product as any).productVariants && (product as any).productVariants.length > 1) && !isFlexiShieldColumnGuard && !isLinearMeter && (
            <div className="space-y-3 border border-yellow-200 bg-yellow-50 p-4 rounded-lg">
              <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-yellow-600" />
                <Label className="text-base font-medium text-yellow-800">
                  {isBollard && "Height & Color Selection"}
                  {isRackEndBarrier && "Length Selection"}
                  {isHeightRestrictor && "Size Selection"}
                  {!isBollard && !isRackEndBarrier && !isHeightRestrictor && "Size Selection"}
                </Label>
              </div>
              
              {isBollard && (
                <div className="space-y-3">
                  <Label>Select Height and Color</Label>
                  {processedVariants.sort((a: any, b: any) => {
                    // Sort height groups by dimension
                    const extractHeight = (group: any) => {
                      const name = group.label || group.id || '';
                      const match = name.match(/(\d+)mm/);
                      return match ? parseInt(match[1]) : 0;
                    };
                    return extractHeight(a) - extractHeight(b);
                  }).map((heightGroup: any) => (
                    <div key={heightGroup.id} className="space-y-2">
                      <div className="font-medium text-sm text-yellow-800">{heightGroup.label.replace('Unknownmm Height', 'Height & Color Selection')}</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {heightGroup.variants.sort((a: any, b: any) => {
                          // Sort variants within each height group by color
                          const nameA = a.variant || a.name || '';
                          const nameB = b.variant || b.name || '';
                          return nameA.localeCompare(nameB);
                        }).map((variant: any) => (
                          <button
                            key={variant.id}
                            onClick={() => {
                              setSelectedVariant(variant);
                              calculatePriceMutation.mutate(quantity);
                            }}
                            className={`p-3 border rounded-lg text-left transition-colors ${
                              selectedVariant?.id === variant.id 
                                ? 'border-yellow-500 bg-yellow-100' 
                                : 'border-gray-200 hover:border-yellow-300'
                            }`}
                          >
                            <div className="font-medium">
                              {variant.variant?.trim() || variant.name || 'Select Option'}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isRackEndBarrier && (
                <div className="space-y-3">
                  <Label>Select Length (Common racking lengths shown first)</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {processedVariants.sort((a: any, b: any) => {
                      // Sort by length dimension, keeping common lengths first
                      if (a.isCommon && !b.isCommon) return -1;
                      if (!a.isCommon && b.isCommon) return 1;
                      
                      const extractLength = (group: any) => {
                        const name = group.label || group.id || '';
                        const match = name.match(/(\d+)mm/);
                        return match ? parseInt(match[1]) : 0;
                      };
                      return extractLength(a) - extractLength(b);
                    }).map((lengthGroup: any) => (
                      <button
                        key={lengthGroup.id}
                        onClick={() => {
                          const variant = lengthGroup.variants[0]; // Use first variant in group
                          setSelectedVariant(variant);
                          calculatePriceMutation.mutate(quantity);
                        }}
                        className={`p-3 border rounded-lg text-left transition-colors ${
                          lengthGroup.isCommon ? 'border-blue-200 bg-blue-50' : 'border-gray-200'
                        } ${
                          selectedVariant?.length === lengthGroup.variants[0]?.length 
                            ? 'border-yellow-500 bg-yellow-100' 
                            : 'hover:border-yellow-300'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div className="font-medium">{lengthGroup.label}</div>
                          {lengthGroup.isCommon && (
                            <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded">Common</span>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatPrice(lengthGroup.variants[0]?.price || 0)}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}



              {!isBollard && !isRackEndBarrier && !isFlexiShieldColumnGuard && (
                <div className="space-y-2">
                  <Label htmlFor="variant-select">Choose Size/Variant</Label>
                  <Select 
                    value={selectedVariant?.id || selectedVariant?.itemId || ""}
                    onValueChange={(value) => {
                      if (!value) return; // Prevent undefined value processing
                      const variant = availableVariants.find((v: any) => (v.id || v.itemId) === value);
                      if (variant) {
                        setSelectedVariant(variant);
                        calculatePriceMutation.mutate(quantity);
                      }
                    }}
                  >
                    <SelectTrigger data-testid="select-variant">
                      <SelectValue placeholder="Select size..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableVariants
                        .filter((variant: any) => variant && (variant.id || variant.itemId)) // Filter out invalid variants
                        .sort((a: any, b: any) => {
                          // Enhanced sorting logic matching the Products page
                          const extractDimension = (variant: any): number => {
                            const name = variant.name || variant.variant || '';
                            
                            // Extract numeric dimensions from variant name or specific properties
                            // Check direct properties first
                            if (variant.length) return parseInt(variant.length);
                            if (variant.width) return parseInt(variant.width);
                            if (variant.height) return parseInt(variant.height);
                            
                            // Extract from name patterns
                            const dimensionMatches = [
                              name.match(/\u2013\s*(\d{3,4})\s*mm/), // "– 1500 mm" pattern
                              name.match(/(\d{3,4})\s*x\s*(\d{3,4})/), // "900 x 900" pattern
                              name.match(/(\d{2,3})\s*OD/), // "190 OD" pattern
                              name.match(/(\d{3,4})\s*mm/) // "1500mm" pattern
                            ];
                            
                            for (const match of dimensionMatches) {
                              if (match) return parseInt(match[1]);
                            }
                            
                            return 9999; // Unknown dimensions go to end
                          };
                          
                          const dimA = extractDimension(a);
                          const dimB = extractDimension(b);
                          
                          if (dimA !== dimB) return dimA - dimB;
                          
                          // If dimensions are equal, sort by price
                          const priceA = parseFloat(String(a.price || a.Price_AED || '0'));
                          const priceB = parseFloat(String(b.price || b.Price_AED || '0'));
                          if (priceA !== priceB) return priceA - priceB;
                          
                          // Finally, sort by name
                          const nameA = a.variant || a.name || '';
                          const nameB = b.variant || b.name || '';
                          return nameA.localeCompare(nameB);
                        })
                        .map((variant: any, index: number) => (
                          <SelectItem 
                            key={variant.id || variant.itemId || `variant-${index}`} 
                            value={variant.id || variant.itemId || `variant-${index}`}
                          >
                            <div className="flex justify-between items-center w-full">
                              <span>{variant.variant || variant.Variant || variant.name || `${variant.length || variant.width || variant.height}mm` || 'Standard Size'}</span>
                              <span className="text-sm text-muted-foreground ml-4">
                                {formatPrice(variant.price || variant.Price_AED || 0)}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
                
              {selectedVariant && (
                <div className="text-sm text-yellow-700 bg-yellow-100 p-2 rounded">
                  <strong>Selected:</strong> {selectedVariant.variant || selectedVariant.Variant || selectedVariant.name || 'Selected Size'} - {formatPrice(selectedVariant.price || selectedVariant.Price_AED || 0)}
                  {selectedVariant.length && <div>Length: {selectedVariant.length}mm</div>}
                  {selectedVariant.height && <div>Height: {selectedVariant.height}mm</div>}
                  {(selectedVariant.code || selectedVariant.Code) && <div>Product Code: {selectedVariant.code || selectedVariant.Code}</div>}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="quantity">
              {quantityLabel}
            </Label>
            {isRackEndBarrier && (
              <p className="text-xs text-muted-foreground">
                Typical orders: 2500mm x 20 qty, 1100mm x 4 qty for racking projects
              </p>
            )}
            {isTrafficBarrier && isLinearMeter && (
              <p className="text-xs text-muted-foreground">
                Enter the length in meters. Price calculated at per-meter rate.
              </p>
            )}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateQuantity(quantity - step)}
                disabled={quantity <= minQuantity || isLoadingPrice}
                data-testid="button-decrease-quantity"
                className="flex-shrink-0"
              >
                <Minus className="h-3 w-3" />
              </Button>
              <Input
                id="quantity"
                type="number"
                step={step}
                value={quantity}
                className="text-center sm:text-left"
                onChange={(e) => {
                  const value = e.target.value;
                  
                  // Allow completely empty input
                  if (value === "") {
                    setQuantity(0);
                    return;
                  }
                  
                  // Remove leading zeros for better UX (except for decimal numbers like 0.5)
                  let cleanedValue = value;
                  if (!value.includes('.')) {
                    cleanedValue = value.replace(/^0+/, '') || '0';
                  } else if (value.match(/^0+\./)) {
                    // Keep single zero before decimal (0.5)
                    cleanedValue = '0' + value.replace(/^0+/, '');
                  }
                  
                  // Allow partial decimal inputs like "." or "0." or "1." etc for linear meters
                  if (isLinearMeter && cleanedValue.match(/^\d*\.$/)) {
                    // Keep the partial decimal input as is during typing
                    setQuantity(parseFloat(cleanedValue.replace('.', '')) || 0);
                    return;
                  }
                  
                  const inputValue = parseFloat(cleanedValue);
                  if (isNaN(inputValue) || inputValue < 0) {
                    return; // Don't allow negative numbers or invalid input
                  }
                  
                  // Update the input value
                  setQuantity(inputValue);
                  
                  // Update the actual input field value to remove leading zeros
                  if (cleanedValue !== value) {
                    e.target.value = cleanedValue;
                  }
                }}
                onBlur={(e) => {
                  // Validate and correct value on blur
                  const inputValue = parseFloat(e.target.value);
                  if (isNaN(inputValue) || inputValue < minQuantity) {
                    setQuantity(minQuantity);
                    calculatePriceMutation.mutate(minQuantity);
                    return;
                  }
                  updateQuantity(inputValue);
                }}
                onKeyDown={(e) => {
                  // Allow backspace and delete to clear all content
                  if (e.key === "Backspace" || e.key === "Delete") {
                    if (e.currentTarget.value === "0" || e.currentTarget.value.length === 1) {
                      e.preventDefault();
                      setQuantity(0);
                      return;
                    }
                  }
                  
                  // Calculate price on Enter key and minimize keyboard
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const inputValue = parseFloat(e.currentTarget.value);
                    if (!isNaN(inputValue) && inputValue >= minQuantity) {
                      updateQuantity(inputValue);
                      // Blur the input to minimize keyboard on mobile
                      e.currentTarget.blur();
                      // Scroll to pricing section after a brief delay
                      setTimeout(() => {
                        const pricingSection = document.querySelector('[data-testid="pricing-info"]');
                        if (pricingSection) {
                          pricingSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                      }, 300);
                    } else {
                      // If invalid value, blur anyway to minimize keyboard
                      e.currentTarget.blur();
                    }
                  }
                }}
                min={minQuantity}
                data-testid="input-quantity"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateQuantity(quantity + step)}
                disabled={isLoadingPrice}
                data-testid="button-increase-quantity"
                className="flex-shrink-0"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            {isLinearMeter ? (
              <p className="text-sm text-muted-foreground">
                Minimum 0.8 meters, increments of 0.1m
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Single item quantity
              </p>
            )}
          </div>

          {pricingData && (
            <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 bg-muted rounded-lg" data-testid="pricing-info">
              {/* Show dynamic pricing tier message for Cold Storage products */}
              {(product.name?.includes('Cold Storage') && pricingData.tier?.includes('Tier')) && (
                <div className="bg-green-100 border border-green-300 rounded-lg p-2 mb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-800">
                      Volume Discount Active!
                    </span>
                  </div>
                  <p className="text-xs text-green-700 mt-1">
                    You're in {pricingData.tier} - Order more meters to unlock better pricing
                  </p>
                </div>
              )}
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-0">
                <span className="text-sm sm:text-base">Unit Price:</span>
                <span className="font-medium text-sm sm:text-base" data-testid="text-unit-price">
                  {formatPrice(pricingData.unitPrice)}/{isLinearMeter ? "m" : "item"}
                  {pricingData.tier?.includes('Spacers') && (
                    <div className="text-xs text-green-600 mt-1">Includes spacers</div>
                  )}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-0">
                <div className="flex items-center gap-1">
                  <span className="text-sm sm:text-base">Pricing Tier:</span>
                  {/* Show tiered pricing info for cold storage barriers */}
                  {product.name?.includes('Cold Storage') && (isLinearMeter || pricingData.tier?.includes('Tier')) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <div className="space-y-2 text-xs">
                          <p className="font-semibold">Volume Pricing Tiers:</p>
                          {isLinearMeter ? (
                            // For barriers with meter-based pricing
                            <ul className="space-y-1">
                              <li className={quantity >= 1 && quantity <= 2 ? 'font-bold text-green-500' : ''}>
                                • 1-2 meters: {product.name.includes('Pedestrian') ? 'AED 1,953.66/m' : 
                                              product.name.includes('Single Traffic') ? 'AED 2,227.20/m' : 'Base pricing'}
                              </li>
                              <li className={quantity > 2 && quantity <= 10 ? 'font-bold text-green-500' : ''}>
                                • 2-10 meters: {product.name.includes('Pedestrian') ? 'AED 1,609.47/m (~18% off)' : 
                                               product.name.includes('Single Traffic') ? 'AED 1,821.11/m (~18% off)' : '~18% discount'}
                              </li>
                              <li className={quantity > 10 && quantity <= 20 ? 'font-bold text-green-500' : ''}>
                                • 10-20 meters: {product.name.includes('Pedestrian') ? 'AED 1,447.86/m (~26% off)' : 
                                                product.name.includes('Single Traffic') ? 'AED 1,612.23/m (~28% off)' : '~26% discount'}
                              </li>
                              <li className={quantity > 20 ? 'font-bold text-green-500' : ''}>
                                • 20+ meters: {product.name.includes('Pedestrian') ? 'AED 1,389.98/m (~29% off)' : 
                                              product.name.includes('Single Traffic') ? 'AED 1,537.14/m (~31% off)' : '~29% discount'}
                              </li>
                            </ul>
                          ) : (
                            // For bollards with unit-based pricing
                            <ul className="space-y-1">
                              <li>• Tier 1 (1-2 units): Base pricing</li>
                              <li>• Tier 2 (2-10 units): ~18% discount</li>
                              <li>• Tier 3 (10-20 units): ~26% discount</li>
                              <li>• Tier 4 (20+ units): ~29% discount</li>
                            </ul>
                          )}
                          <p className="text-muted-foreground mt-2">Order more {isLinearMeter ? 'meters' : 'units'} to automatically unlock better pricing!</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <Badge 
                  variant={pricingData.tier?.includes('Tier 4') ? 'default' : 'secondary'} 
                  className={`text-xs ${pricingData.tier?.includes('Tier 4') ? 'bg-green-600' : ''}`}
                  data-testid="badge-pricing-tier"
                >
                  {pricingData.tier}
                </Badge>
              </div>
              <Separator />
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-0">
                <span className="text-sm sm:text-base">Product Subtotal:</span>
                <span data-testid="text-product-subtotal" className="text-sm sm:text-base">
                  {formatPrice(pricingData.totalPrice)}
                </span>
              </div>
              {requiresDelivery && (
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-0 text-blue-600">
                  <span className="text-sm sm:text-base">Delivery:</span>
                  <span data-testid="text-delivery-cost" className="text-sm sm:text-base">
                    {formatPrice(getDeliveryCost())}
                  </span>
                </div>
              )}
              {requiresInstallation && (
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-0 text-orange-600">
                  <span className="text-sm sm:text-base">Installation:</span>
                  <span data-testid="text-installation-cost" className="text-sm sm:text-base">
                    {formatPrice(getInstallationCost())}
                  </span>
                </div>
              )}
              <Separator />
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-0 text-lg font-semibold">
                <span className="text-base sm:text-lg">Total:</span>
                <span data-testid="text-total-price" className="text-base sm:text-lg">
                  {formatPrice(getFinalTotal())}
                </span>
              </div>
            </div>
          )}

          {!pricingData && !isLoadingPrice && (
            <div className="space-y-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg" data-testid="pricing-unavailable">
              <div className="flex items-center gap-2 text-yellow-800">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">{requiresQuote ? "Quote Required" : "Pricing Not Available"}</span>
              </div>
              <p className="text-sm text-yellow-700">
                {requiresQuote
                  ? "No standard pricing is configured for this product. Use the \"Request Quote\" button below to get a custom quote from our sales team."
                  : "This product requires a custom quote. Please contact our sales team for accurate pricing and availability."}
              </p>
              <div className="text-xs text-yellow-600">
                <p>• Pricing varies based on quantity, specifications, and location</p>
                <p>• Size options and per-piece pricing will be provided in your quote</p>
              </div>
            </div>
          )}

          {isLoadingPrice && (
            <div className="text-center py-4 text-muted-foreground">
              Calculating pricing...
            </div>
          )}

          <div className="space-y-4">
            <Separator />
            
            {/* Delivery Options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <Label className="text-base font-medium">
                    Delivery {pricingData && `(${formatPrice(getDeliveryCost())})`}
                  </Label>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm ${!requiresDelivery ? 'font-medium' : 'text-muted-foreground'}`}>No</span>
                  <Switch
                    checked={requiresDelivery}
                    onCheckedChange={(checked) => {
                      setRequiresDelivery(checked);
                      if (!checked) {
                        setShowDeliveryOptions(false);
                        setDeliveryLocation(null);
                        setManualAddress("");
                      }
                    }}
                    data-testid="switch-requires-delivery"
                  />
                  <span className={`text-sm ${requiresDelivery ? 'font-medium' : 'text-muted-foreground'}`}>Yes</span>
                </div>
              </div>

              {requiresDelivery && (
                <Collapsible open={showDeliveryOptions} onOpenChange={setShowDeliveryOptions}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-full justify-between" data-testid="button-toggle-delivery-options">
                      Select Delivery Location
                      {showDeliveryOptions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="manual-address">Known Location Address</Label>
                      <Textarea
                        id="manual-address"
                        value={manualAddress}
                        onChange={(e) => setManualAddress(e.target.value)}
                        placeholder="Enter a known address or location description..."
                        rows={2}
                        data-testid="textarea-manual-address"
                      />
                    </div>
                    
                    <div className="text-center text-sm text-muted-foreground">
                      - OR -
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Select Location on Map</Label>
                      <GoogleMapSelector
                        onLocationSelect={setDeliveryLocation}
                        selectedLocation={deliveryLocation}
                        className="w-full"
                      />
                      {deliveryLocation && (
                        <div className="text-sm text-muted-foreground bg-muted p-2 rounded">
                          <strong>Selected Location:</strong><br />
                          {deliveryLocation.address}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>

            {/* Installation Options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  <Label className="text-base font-medium">
                    Installation {pricingData && `(${formatPrice(getInstallationCost())})`}
                  </Label>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm ${!requiresInstallation ? 'font-medium' : 'text-muted-foreground'}`}>No</span>
                  <Switch
                    checked={requiresInstallation}
                    onCheckedChange={setRequiresInstallation}
                    data-testid="switch-requires-installation"
                  />
                  <span className={`text-sm ${requiresInstallation ? 'font-medium' : 'text-muted-foreground'}`}>Yes</span>
                </div>
              </div>
              
              {requiresInstallation && (
                <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
                  <p>Our certified installation team will contact you after your order to schedule professional installation.</p>
                </div>
              )}
            </div>
          </div>

          {/* Site Reference Images */}
          <div className="space-y-4">
            <Separator />
            <SiteReferenceUploader
              productName={selectedVariant ? selectedVariant.name : product.name}
              onImagesUploaded={setReferenceImages}
              existingImages={referenceImages}
              installationLocation={installationLocation}
              onLocationChange={setInstallationLocation}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="application-area">
              Application Area (Optional)
            </Label>
            <Input
              id="application-area"
              value={applicationArea}
              onChange={(e) => setApplicationArea(e.target.value)}
              placeholder="e.g. Inbound Workstation A"
              data-testid="input-application-area"
            />
            <p className="text-xs text-muted-foreground">
              Specify the location or area where this product will be installed for reference
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">
              Additional Notes (Optional)
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special requirements or notes..."
              rows={3}
              data-testid="textarea-notes"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1"
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            {requiresQuote && !pricingData ? (
              <Button
                onClick={() => {
                  setOpen(false);
                  // Navigate to the products page where the quote modal can be triggered
                  setLocation(`/products?requestQuote=${encodeURIComponent(product.name)}`);
                }}
                className="flex-1 bg-amber-600 hover:bg-amber-700"
                data-testid="button-request-quote"
              >
                Request Quote
              </Button>
            ) : (
              <Button
                onClick={() => addToCartMutation.mutate()}
                disabled={!pricingData || addToCartMutation.isPending || (isColumnGuard && configurationMode === 'custom' && (!columnLength || !columnWidth)) || (hasVariants && !isLinearMeter && !selectedVariant)}
                className="flex-1"
                data-testid="button-confirm-add-to-cart"
              >
                {addToCartMutation.isPending
                  ? (isEditMode ? "Updating..." : "Adding...")
                  : !pricingData
                    ? "Calculating..."
                    : (isEditMode ? "Update Cart" : "Add to Cart")
                }
              </Button>
            )}
          </div>

          {/* Inline error banner for persistent visibility */}
          {addToCartMutation.isError && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                {(() => {
                  const msg = (addToCartMutation.error as any)?.message || "Unknown error";
                  // Clean up JSON wrapper from API error responses
                  try {
                    const parsed = JSON.parse(msg.replace(/^\d+:\s*/, ''));
                    return parsed.message || msg;
                  } catch {
                    return msg.replace(/^\d+:\s*/, '');
                  }
                })()}
              </span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </TooltipProvider>
  );
}