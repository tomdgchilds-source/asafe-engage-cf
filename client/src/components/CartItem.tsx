import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Minus, ShoppingCart, MapPin, Wrench, Calculator, ChevronDown, ChevronUp, Edit, ImagePlus, X, Image, Lightbulb, PenTool, Package, Shield } from "lucide-react";
import { useAutoMinimize } from "@/hooks/useAutoMinimize";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { AddToCartModal } from "@/components/AddToCartModal";
import { TierSwitcher } from "@/components/TierSwitcher";
import {
  findLadderForFamily,
  recommendTier,
  type BarrierTier,
} from "@/utils/barrierLadders";
import {
  useBarrierLadders,
  pickRowForLength,
} from "@/hooks/useBarrierLadders";
import { apiRequest } from "@/lib/queryClient";

interface CartItemProps {
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

// Helper function to upload image to object storage
const uploadImageToStorage = async (file: File): Promise<string> => {
  try {
    // Generate a unique key and upload directly to our worker's PUT endpoint
    const ext = file.name.split('.').pop() || 'bin';
    const key = `uploads/${crypto.randomUUID()}.${ext}`;
    const accessPath = `/api/objects/${key}`;

    // Upload file directly to our worker
    const putResponse = await fetch(accessPath, {
      method: 'PUT',
      body: file,
      credentials: 'include',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
      },
    });

    if (!putResponse.ok) {
      throw new Error('Failed to upload file');
    }

    return accessPath;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
};

export function CartItem({ 
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
}: CartItemProps) {
  const itemAutoMinimize = useAutoMinimize(true);
  const [referenceImages, setReferenceImages] = useState<string[]>(item.referenceImages || []);
  const [uploadingImage, setUploadingImage] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get product details to find the product ID
  const productDetails = getProductDetails(item.productName);
  const productId = productDetails?.id;

  // -------------------------------------------------------------------
  // Good / Better / Best tier switcher wiring
  // -------------------------------------------------------------------
  // Resolve the ladder for this line item's productName. When no ladder
  // matches we skip the switcher entirely. The ladder match is tolerant
  // of trailing suffixes ("- 1600mm", "- Yellow") via the sibling
  // `findLadderForFamily` helper.
  const ladderMatch = useMemo(
    () => findLadderForFamily(item.productName),
    [item.productName],
  );
  const {
    ladders,
    findProductsForFamily,
    priceForFamily,
    joulesForFamily,
  } = useBarrierLadders();
  const [swappingTier, setSwappingTier] = useState(false);

  // Extract the target lengthMm from this item (if it's a lengthed SKU)
  // so we can keep the length fixed when swapping tiers.
  const targetLengthMm: number | null = useMemo(() => {
    const sv = item.selectedVariant || item.specifications?.selectedVariant;
    const fromVariant = sv?.lengthMm ?? sv?.length_mm;
    if (typeof fromVariant === "number" && fromVariant > 0) return fromVariant;
    // Fallback: parse a "1600mm" suffix out of the product name.
    const m = String(item.productName || "").match(/\b(\d{3,5})\s*mm\b/i);
    if (m) {
      const mm = parseInt(m[1], 10);
      if (Number.isFinite(mm) && mm > 0) return mm;
    }
    return null;
  }, [item.productName, item.selectedVariant, item.specifications]);

  // Per-tier unit-price + impact joules lookup. When the line item is a
  // per-length SKU we pick the variant row matching `targetLengthMm`,
  // otherwise we fall back to the family-level helpers.
  const pricesByTier = useMemo((): Record<BarrierTier, number | null> => {
    const out: Record<BarrierTier, number | null> = {
      good: null,
      better: null,
      best: null,
    };
    if (!ladderMatch) return out;
    (Object.keys(ladderMatch.ladder.tiers) as BarrierTier[]).forEach((tier) => {
      const family = ladderMatch.ladder.tiers[tier].family;
      const rows = findProductsForFamily(family);
      if (rows.length === 0) {
        out[tier] = null;
        return;
      }
      if (targetLengthMm != null) {
        const picked = pickRowForLength(rows, targetLengthMm);
        if (picked) {
          const priceRaw = picked.row.price ?? picked.row.basePricePerMeter;
          const n =
            priceRaw == null
              ? null
              : typeof priceRaw === "number"
                ? priceRaw
                : parseFloat(String(priceRaw).split("-")[0]);
          out[tier] = Number.isFinite(n as number) ? (n as number) : null;
          return;
        }
      }
      out[tier] = priceForFamily(family);
    });
    return out;
  }, [ladderMatch, findProductsForFamily, priceForFamily, targetLengthMm]);

  const joulesByTier = useMemo((): Record<BarrierTier, number | null> => {
    const out: Record<BarrierTier, number | null> = {
      good: null,
      better: null,
      best: null,
    };
    if (!ladderMatch) return out;
    (Object.keys(ladderMatch.ladder.tiers) as BarrierTier[]).forEach((tier) => {
      const family = ladderMatch.ladder.tiers[tier].family;
      out[tier] = joulesForFamily(family);
    });
    return out;
  }, [ladderMatch, joulesForFamily]);

  // Auto-recommendation. Pull required joules + riskLevel from the
  // item's linked impact calculation context when present. Normalise
  // "Low Risk" / "high" etc. to the lowercase 4-value enum the sibling
  // helper expects.
  const recommendedTier: BarrierTier | undefined = useMemo(() => {
    if (!ladderMatch) return undefined;
    const ctx = item.calculationContext as
      | { kineticEnergy?: number; riskLevel?: string }
      | undefined;
    const requiredJoules: number | null =
      typeof ctx?.kineticEnergy === "number"
        ? ctx.kineticEnergy
        : typeof item.impactRating === "number"
          ? item.impactRating
          : null;
    const rawRisk = (ctx?.riskLevel ?? item.riskLevel ?? "")
      .toString()
      .toLowerCase();
    const riskLevel: "critical" | "high" | "medium" | "low" | null =
      rawRisk.includes("critical") || rawRisk.includes("extreme")
        ? "critical"
        : rawRisk.includes("high")
          ? "high"
          : rawRisk.includes("medium")
            ? "medium"
            : rawRisk.includes("low")
              ? "low"
              : null;
    try {
      return recommendTier(
        requiredJoules,
        riskLevel,
        ladderMatch.ladder,
        (family) => joulesForFamily(family),
      );
    } catch {
      return undefined;
    }
  }, [ladderMatch, item, joulesForFamily]);

  // Handle tier selection: PATCH the existing cart line with the new
  // family's name + price. When the backend rejects the productName
  // change we fall back to DELETE + POST with the same quantity/options.
  const handleTierSelect = async (newTier: BarrierTier) => {
    if (!ladderMatch) return;
    if (newTier === ladderMatch.tier) return;
    setSwappingTier(true);
    try {
      const family = ladderMatch.ladder.tiers[newTier].family;
      const rows = findProductsForFamily(family);
      if (rows.length === 0) {
        throw new Error(`No catalog product matches family "${family}"`);
      }
      const picked =
        targetLengthMm != null
          ? pickRowForLength(rows, targetLengthMm)
          : { row: rows[0], lengthMm: null };
      if (!picked) throw new Error("No suitable variant found");

      // Compose the new productName: "<family> - <length>mm" when the
      // line item was length-specific, else plain family name from the
      // picked row (which may already carry the suffix for lengthed
      // catalog rows).
      const baseName =
        picked.row.name && picked.row.name.trim().length > 0
          ? picked.row.name
          : family;
      const pickedLen = picked.lengthMm ?? targetLengthMm ?? null;
      const productName =
        targetLengthMm != null && pickedLen != null
          ? /\d{3,5}\s*mm/i.test(baseName)
            ? baseName
            : `${family} - ${pickedLen}mm`
          : baseName;

      const priceRaw = picked.row.price ?? picked.row.basePricePerMeter;
      const unitPrice =
        priceRaw == null
          ? null
          : typeof priceRaw === "number"
            ? priceRaw
            : parseFloat(String(priceRaw).split("-")[0]);
      if (unitPrice == null || !Number.isFinite(unitPrice)) {
        throw new Error("Unit price unavailable for the chosen tier");
      }
      const totalPrice = unitPrice * Number(item.quantity || 1);

      // Try PATCH first — the standard path.
      try {
        await apiRequest(`/api/cart/${item.id}`, "PATCH", {
          productName,
          unitPrice,
          totalPrice,
          pricingTier: newTier,
        });
      } catch (patchErr) {
        // Fallback path: if the backend refuses productName rename via
        // PATCH we re-create the line.
        await apiRequest(`/api/cart/${item.id}`, "DELETE");
        await apiRequest("/api/cart", "POST", {
          productName,
          quantity: item.quantity,
          pricingType: item.pricingType,
          unitPrice,
          totalPrice,
          pricingTier: newTier,
          notes: item.notes,
          applicationArea: item.applicationArea,
          requiresDelivery: item.requiresDelivery,
          deliveryAddress: item.deliveryAddress,
          requiresInstallation: item.requiresInstallation,
          impactCalculationId: item.impactCalculationId,
          calculationContext: item.calculationContext,
          referenceImages: item.referenceImages,
          calculatorImages: item.calculatorImages,
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: `Switched to ${newTier.charAt(0).toUpperCase() + newTier.slice(1)}`,
        description: `Now using ${family}.`,
      });
    } catch (err: any) {
      console.error("Tier swap failed:", err);
      toast({
        title: "Tier change failed",
        description:
          err?.message ?? "Unable to switch tiers. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSwappingTier(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, itemId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check 5-image limit
    if (referenceImages.length >= 5) {
      toast({
        title: "Image Limit Reached",
        description: "Maximum 5 reference images allowed per item",
        variant: "destructive"
      });
      return;
    }
    
    // Check file size (max 10MB per image)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select an image smaller than 10MB",
        variant: "destructive"
      });
      return;
    }

    setUploadingImage(true);
    try {
      // Upload image to object storage
      const objectPath = await uploadImageToStorage(file);
      const newImages = [...referenceImages, objectPath];
      setReferenceImages(newImages);
      
      // Update the cart item with the new reference images
      await updateItemMutation.mutateAsync({
        id: itemId,
        referenceImages: newImages
      });
      
      toast({
        title: "Image Added",
        description: `Reference image added (${newImages.length}/5)`,
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload image. Please try again.",
        variant: "destructive"
      });
    } finally {
      setUploadingImage(false);
      // Reset file input
      if (e.target) e.target.value = '';
    }
  };

  const removeReferenceImage = async (index: number) => {
    const newImages = referenceImages.filter((_, i) => i !== index);
    setReferenceImages(newImages);
    
    await updateItemMutation.mutateAsync({
      id: item.id,
      referenceImages: newImages
    });
  };

  // Create product object for AddToCartModal with existing cart item data
  const productForModal = productDetails ? {
    ...productDetails,
    existingCartItem: {
      id: item.id,
      quantity: item.quantity,
      notes: item.notes,
      applicationArea: item.applicationArea,
      requiresDelivery: item.requiresDelivery,
      deliveryAddress: item.deliveryAddress,
      requiresInstallation: item.requiresInstallation,
      pricingType: item.pricingType,
      calculationContext: item.calculationContext
    }
  } : null;

  return (
    <div
      ref={itemAutoMinimize.cardRef}
      className="border rounded-lg overflow-hidden"
      data-testid={`cart-item-${item.id}`}
    >
      {/* Minimized Header - Always Visible */}
      <div className="p-3 sm:p-4 flex items-center justify-between bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-gray-100 border flex-shrink-0">
            {getProductImage(item.productName) ? (
              <img
                src={getProductImage(item.productName)!}
                alt={item.productName}
                className="w-full h-full object-contain p-1"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 bg-white">
                <ShoppingCart className="h-8 w-8" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 
                className="font-medium text-gray-900 dark:text-white text-sm truncate" 
                title={item.productName}
              >
                {item.productName}
              </h4>
              {/* Source badges based on how item was added */}
              {item.impactCalculationId && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 bg-yellow-50 border-yellow-300">
                  <Calculator className="h-3 w-3 mr-1" />
                  Impact
                </Badge>
              )}
              {item.solutionContext && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 bg-blue-50 border-blue-300">
                  <Lightbulb className="h-3 w-3 mr-1" />
                  Solution
                </Badge>
              )}
              {item.layoutDrawingId && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 bg-green-50 border-green-300">
                  <PenTool className="h-3 w-3 mr-1" />
                  Drawing
                </Badge>
              )}
              {item.siteSurveyId && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 bg-purple-50 border-purple-300">
                  <MapPin className="h-3 w-3 mr-1" />
                  Survey
                </Badge>
              )}
              {/* Product taxonomy badges from the catalog (NEW flag from the
                  2025v1 price list, Cold Storage from the CS product variants). */}
              {productDetails?.isNew && (
                <Badge className="text-[10px] px-1.5 py-0 font-bold tracking-wider bg-[#FFC72C] text-black hover:bg-[#FFC72C]">
                  NEW
                </Badge>
              )}
              {productDetails?.isColdStorage && (
                <Badge className="text-[10px] px-1.5 py-0 bg-cyan-500 text-white hover:bg-cyan-500">
                  Cold Storage
                </Badge>
              )}
              {!item.impactCalculationId && !item.solutionContext && !item.layoutDrawingId && !item.siteSurveyId && (
                <Badge variant="outline" className="text-xs px-1.5 py-0 bg-gray-50 border-gray-300">
                  <Package className="h-3 w-3 mr-1" />
                  Manual
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <span>{item.quantity}{item.pricingType === "linear_meter" ? "m" : " items"}</span>
              <span>•</span>
              <span className="font-medium">{formatPrice(item.totalPrice)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => document.getElementById(`image-upload-${item.id}`)?.click()}
            className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 h-8 w-8 p-0 relative"
            data-testid={`button-add-image-${item.id}`}
            title={referenceImages.length >= 5 ? "Maximum 5 images reached" : `Add reference image (${referenceImages.length}/5)`}
            disabled={uploadingImage || referenceImages.length >= 5}
          >
            {uploadingImage ? (
              <div className="h-4 w-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <ImagePlus className="h-4 w-4" />
                {referenceImages.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                    {referenceImages.length}
                  </span>
                )}
              </>
            )}
          </Button>
          <input
            id={`image-upload-${item.id}`}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleImageUpload(e, item.id)}
          />
          {productForModal ? (
            <AddToCartModal product={productForModal} isEditMode={true}>
              <Button
                variant="ghost"
                size="sm"
                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 w-8 p-0"
                data-testid={`button-edit-${item.id}`}
                title="Modify item"
              >
                <Edit className="h-4 w-4" />
              </Button>
            </AddToCartModal>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled
              className="text-gray-400 h-8 w-8 p-0"
              data-testid={`button-edit-${item.id}`}
              title="Product details not available"
            >
              <Edit className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeItemMutation.mutate(item.id)}
            disabled={removeItemMutation.isPending}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 w-7 p-0"
            data-testid={`button-remove-${item.id}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={itemAutoMinimize.toggleExpanded}
            className="h-7 w-7 p-0"
            data-testid={`button-toggle-${item.id}`}
          >
            {itemAutoMinimize.isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* Expanded Content */}
      {itemAutoMinimize.isExpanded && (
        <div className="p-3 sm:p-4 space-y-3">
          {/* Fully Responsive Layout */}
          <div className="flex flex-col space-y-3 md:grid md:grid-cols-12 md:gap-4 md:space-y-0">
            
            {/* Product Image and Name - Mobile: full width, MD+: 6 columns */}
            <div className="md:col-span-6 flex items-start gap-3">
              <div className="flex-shrink-0">
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-lg overflow-hidden bg-gray-100 border">
                  {getProductImage(item.productName) ? (
                    <img
                      src={getProductImage(item.productName)!}
                      alt={item.productName}
                      className="w-full h-full object-contain p-2"
                      data-testid={`img-product-thumbnail-${item.id}`}
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 bg-white">
                      <ShoppingCart className="h-10 w-10" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <h4 
                  className="font-semibold text-gray-900 dark:text-white leading-tight mb-2 text-sm sm:text-base break-words line-clamp-2" 
                  data-testid={`text-product-name-${item.id}`}
                  title={item.productName}
                >
                  {item.productName}
                </h4>
                
                {/* Product Details - Better spacing on all sizes */}
                <div className="space-y-1.5">
                  {(() => {
                    const product = getProductDetails(item.productName);
                    return (
                      <>
                        {/* Display site survey zone/area info if available */}
                        {(item.zoneName || item.areaName) && (
                          <div className="flex items-center gap-1 text-xs sm:text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                            <MapPin className="h-3 w-3" />
                            <span className="font-medium">
                              Site Survey: {item.zoneName}{item.zoneName && item.areaName ? ' - ' : ''}{item.areaName}
                            </span>
                          </div>
                        )}
                        
                        {/* Display impact rating with site verification badge */}
                        {(item.impactRating || product?.impactRating) && (
                          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                            <span className="font-medium">{(item.impactRating || product?.impactRating)?.toLocaleString()}J</span> Impact Rating
                            {item.impactRating && (
                              <Badge variant="secondary" className="ml-2 text-xs">
                                <Calculator className="h-3 w-3 mr-1" />
                                Site Verified
                              </Badge>
                            )}
                          </p>
                        )}
                        
                        {/* Display risk level if from site survey */}
                        {item.riskLevel && (
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${
                              item.riskLevel === 'critical' ? 'border-red-500 text-red-700' :
                              item.riskLevel === 'high' ? 'border-orange-500 text-orange-700' :
                              item.riskLevel === 'medium' ? 'border-yellow-500 text-yellow-700' :
                              'border-green-500 text-green-700'
                            }`}
                          >
                            {item.riskLevel.charAt(0).toUpperCase() + item.riskLevel.slice(1)} Risk Area
                          </Badge>
                        )}
                        
                        {product?.category && (
                          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 capitalize">
                            {product.category.replace(/-/g, ' ')}
                          </p>
                        )}
                        {item.applicationArea && (
                          <p className="text-xs sm:text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded">
                            <span className="font-medium">Application:</span> {item.applicationArea}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary" className="text-xs px-2 py-0.5">
                            {item.pricingType === "linear_meter" ? "Linear Meter" : "Per Item"}
                          </Badge>
                          {item.pricingTier && (
                            <Badge variant="outline" className="text-xs px-2 py-0.5">
                              {item.pricingTier}
                            </Badge>
                          )}
                        </div>
                        
                        {/* Impact Calculation Context Display */}
                        {item.calculationContext && (
                          <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-center gap-1 mb-1">
                              <Calculator className="h-3 w-3 text-green-600" />
                              <span className="text-xs font-medium text-green-800">Linked Impact Test</span>
                            </div>
                            {item.calculationContext.operatingZone && (
                              <div className="mb-2 p-1.5 bg-blue-50 border border-blue-200 rounded text-xs">
                                <span className="font-medium text-blue-800">📍 Operating Zone:</span>
                                <span className="text-blue-700 ml-1">{item.calculationContext.operatingZone}</span>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-1 text-xs text-green-700">
                              <div>
                                <span className="font-medium">{Math.round(item.calculationContext.kineticEnergy).toLocaleString()}J</span> Energy
                              </div>
                              <div>
                                <span className="font-medium">{item.calculationContext.riskLevel}</span>
                              </div>
                              <div>Vehicle: {item.calculationContext.vehicleMass}kg</div>
                              <div>Speed: {item.calculationContext.speed} {item.calculationContext.speedUnit}</div>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Good / Better / Best Tier Switcher — visible only when
                this line item's productName resolves to a known ladder. */}
            {ladderMatch && (
              <div className="md:col-span-12">
                <div className="border rounded-lg p-3 bg-yellow-50/40 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-900/40">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                        <Shield className="h-4 w-4 text-[#B8860B]" />
                        {ladderMatch.ladder.label} · Good / Better / Best
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Swap this line to a different tier of the same family.
                      </p>
                    </div>
                    {recommendedTier && recommendedTier !== ladderMatch.tier && (
                      <Badge className="bg-[#FFC72C] text-black hover:bg-[#FFC72C] text-[10px] uppercase tracking-wider">
                        Suggest {recommendedTier}
                      </Badge>
                    )}
                  </div>
                  <TierSwitcher
                    ladder={ladderMatch.ladder}
                    currentTier={ladderMatch.tier}
                    recommendedTier={recommendedTier}
                    pricesByTier={pricesByTier}
                    joulesByTier={joulesByTier}
                    onSelect={handleTierSelect}
                    disabled={swappingTier || updateItemMutation.isPending}
                  />
                </div>
              </div>
            )}

            {/* Reference Images Section - Full width */}
            {(referenceImages.length > 0 || item.calculatorImages?.length > 0) && (
              <div className="md:col-span-12">
                <div className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-900">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <Image className="h-4 w-4" />
                      Reference Images ({referenceImages.length}/5)
                    </p>
                    {referenceImages.length < 5 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById(`image-upload-${item.id}`)?.click()}
                        className="text-purple-600 hover:text-purple-700 text-xs"
                        disabled={uploadingImage}
                      >
                        <ImagePlus className="h-3 w-3 mr-1" />
                        Add More
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* Calculator Images */}
                    {item.calculatorImages?.map((img: string, index: number) => (
                      <div key={`calc-${index}`} className="relative group">
                        <img
                          src={img}
                          alt={`Calculator reference ${index + 1}`}
                          className="w-20 h-20 object-cover rounded border"
                          data-testid={`img-calculator-${item.id}-${index}`}
                        />
                        <Badge className="absolute -top-2 -right-2 text-xs" variant="secondary">
                          Calc
                        </Badge>
                      </div>
                    ))}
                    
                    {/* User Uploaded Reference Images */}
                    {referenceImages.map((img, index) => (
                      <div key={`ref-${index}`} className="relative group">
                        <div className="relative">
                          <img
                            src={img}
                            alt={`Reference ${index + 1}`}
                            className="w-20 h-20 object-cover rounded border cursor-pointer hover:opacity-90 transition-opacity"
                            data-testid={`img-reference-${item.id}-${index}`}
                            onClick={() => window.open(img, '_blank')}
                            title="Click to view full size"
                          />
                          <Button
                            variant="destructive"
                            size="sm"
                            className="absolute -top-2 -right-2 h-5 w-5 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => removeReferenceImage(index)}
                            title="Remove image"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="text-xs text-center mt-1 text-gray-500">
                          {index + 1}/5
                        </div>
                      </div>
                    ))}
                    
                    {/* Add Image Placeholder Slots */}
                    {referenceImages.length < 5 && (
                      [...Array(Math.min(2, 5 - referenceImages.length))].map((_, index) => (
                        <div 
                          key={`placeholder-${index}`} 
                          className="w-20 h-20 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded flex items-center justify-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                          onClick={() => document.getElementById(`image-upload-${item.id}`)?.click()}
                          title="Click to add image"
                        >
                          <ImagePlus className="h-6 w-6 text-gray-400" />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Quantity Controls - MD+: 3 columns */}
            <div className="md:col-span-3 flex flex-col justify-center">
              <div className="flex items-center justify-between md:justify-center md:flex-col md:gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 md:mb-1">Quantity:</span>
                <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800 rounded-lg p-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateQuantity(item.id, item.quantity - (item.pricingType === "linear_meter" ? 0.2 : 1))}
                    disabled={updateItemMutation.isPending || (item.pricingType === "linear_meter" && item.quantity <= 0.2) || (item.pricingType !== "linear_meter" && item.quantity <= 1)}
                    data-testid={`button-decrease-${item.id}`}
                    className="h-7 w-7 p-0"
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
                    className="text-center h-7 text-sm font-medium w-16 md:w-20"
                    data-testid={`input-quantity-${item.id}`}
                    disabled={updateItemMutation.isPending}
                  />
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateQuantity(item.id, item.quantity + (item.pricingType === "linear_meter" ? 0.2 : 1))}
                    disabled={updateItemMutation.isPending}
                    data-testid={`button-increase-${item.id}`}
                    className="h-7 w-7 p-0"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">
                {item.pricingType === "linear_meter" ? "meters" : "items"}
              </div>
            </div>

            {/* Price and Actions - MD+: 3 columns */}
            <div className="md:col-span-3 flex flex-row justify-between items-center md:flex-col md:justify-center">
              <div className="text-right md:text-center">
                <div className="font-bold text-lg sm:text-xl text-gray-900 dark:text-white mb-1" 
                     data-testid={`text-total-price-${item.id}`}>
                  {formatPrice(item.totalPrice)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1" 
                     data-testid={`text-unit-price-${item.id}`}>
                  {formatPrice(item.unitPrice)}/{item.pricingType === "linear_meter" ? "m" : "item"}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {item.quantity}{item.pricingType === "linear_meter" ? "m" : " items"} total
                </div>
              </div>
            </div>
          </div>

          {/* Services and Options */}
          {(item.requiresDelivery || item.requiresInstallation) && (
            <div className="flex flex-wrap gap-2">
              {item.requiresDelivery && (
                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
                  <MapPin className="h-3 w-3 sm:h-4 sm:w-4" />
                  Delivery Required
                </div>
              )}
              {item.requiresInstallation && (
                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-orange-600 bg-orange-50 px-3 py-1.5 rounded-full">
                  <Wrench className="h-3 w-3 sm:h-4 sm:w-4" />
                  Installation Required
                </div>
              )}
            </div>
          )}
          
          {/* Delivery Address */}
          {item.requiresDelivery && item.deliveryAddress && (
            <div className="pt-3 border-t">
              <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg break-words leading-relaxed">
                <strong className="text-gray-800 dark:text-gray-200">Delivery to:</strong> {item.deliveryAddress}
              </p>
            </div>
          )}

          {/* Notes */}
          {item.notes && (
            <div className="pt-3 border-t">
              <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg break-words leading-relaxed">
                <strong className="text-gray-800 dark:text-gray-200">Notes:</strong> {item.notes}
              </p>
            </div>
          )}
        </div>
      )}
      
    </div>
  );
}