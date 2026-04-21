import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Info, ShoppingCart, Download } from "lucide-react";
import { ProductImpactBadges } from "@/components/ProductImpactBadges";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import type { Product } from "@shared/schema";

// A kit family = 1 top-level post product + 1 top-level top-rail product.
// Each exposes a `variants` array of length-specific SKUs. Together they
// describe one iFlex Height Restrictor gantry: 2 posts + 1 top rail.
export interface HeightRestrictorKitCardProps {
  familyLabel: string; // e.g. "iFlex Height Restrictor"
  postProduct: Product;
  topRailProduct: Product;
  onViewDetails?: (product: Product) => void;
}

interface VariantRow {
  id?: string;
  itemId?: string;
  sku?: string;
  code?: string;
  name?: string;
  variant?: string;
  length?: number;
  length_mm?: number;
  price?: number;
  kind?: string;
}

function getVariantRows(product: Product): VariantRow[] {
  const raw = (product as any).variants;
  if (Array.isArray(raw)) return raw as VariantRow[];
  return [];
}

function getLengthMm(v: VariantRow): number {
  return v.length_mm ?? v.length ?? 0;
}

function getPrice(v: VariantRow): number {
  return typeof v.price === "number" ? v.price : parseFloat(String(v.price ?? 0)) || 0;
}

export function HeightRestrictorKitCard({
  familyLabel,
  postProduct,
  topRailProduct,
  onViewDetails,
}: HeightRestrictorKitCardProps) {
  const { formatPrice } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const haptic = useHapticFeedback();

  const postVariants = useMemo(
    () =>
      getVariantRows(postProduct)
        .filter((v) => getLengthMm(v) > 0)
        .sort((a, b) => getLengthMm(a) - getLengthMm(b)),
    [postProduct],
  );
  const topRailVariants = useMemo(
    () =>
      getVariantRows(topRailProduct)
        .filter((v) => getLengthMm(v) > 0)
        .sort((a, b) => getLengthMm(a) - getLengthMm(b)),
    [topRailProduct],
  );

  // Default: pick tallest post and a mid-size rail.
  const defaultPost =
    postVariants.find((v) => getLengthMm(v) === 5000) ??
    postVariants[postVariants.length - 1] ??
    null;
  const defaultRail =
    topRailVariants.find((v) => getLengthMm(v) === 4000) ??
    topRailVariants[Math.floor(topRailVariants.length / 2)] ??
    null;

  const [selectedPostMm, setSelectedPostMm] = useState<string>(
    defaultPost ? String(getLengthMm(defaultPost)) : "",
  );
  const [selectedRailMm, setSelectedRailMm] = useState<string>(
    defaultRail ? String(getLengthMm(defaultRail)) : "",
  );
  const [submitting, setSubmitting] = useState(false);

  const selectedPost = postVariants.find(
    (v) => String(getLengthMm(v)) === selectedPostMm,
  );
  const selectedRail = topRailVariants.find(
    (v) => String(getLengthMm(v)) === selectedRailMm,
  );

  const postPrice = selectedPost ? getPrice(selectedPost) : 0;
  const railPrice = selectedRail ? getPrice(selectedRail) : 0;
  const railSpanM = selectedRail ? getLengthMm(selectedRail) / 1000 : 0;
  const railPerMetre = railSpanM > 0 ? railPrice / railSpanM : 0;
  const totalPrice = 2 * postPrice + railPrice;

  const handleDownloadSpec = () => {
    if (postProduct.technicalSheetUrl) {
      window.open(postProduct.technicalSheetUrl, "_blank");
    } else if (topRailProduct.technicalSheetUrl) {
      window.open(topRailProduct.technicalSheetUrl, "_blank");
    }
  };

  const handleAddToCart = async () => {
    if (!selectedPost || !selectedRail) {
      toast({
        title: "Choose a configuration",
        description: "Please select both a post height and a top rail length.",
        variant: "destructive",
      });
      return;
    }
    haptic.addToCart();
    setSubmitting(true);

    // Shared marker so the cart UI / quote PDF can group the pair.
    // cartItems.notes is a free-text field — prefix with [kit:<uuid>]
    // and leave the rest human-readable. See shared/schema.ts cart_items.notes.
    const groupId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `hr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const kitMarker = `[kit:${groupId}]`;
    const humanDesc = `${familyLabel} gantry — ${getLengthMm(selectedPost)}mm posts × 2, ${getLengthMm(selectedRail)}mm top rail × 1`;

    const postName = selectedPost.name ?? selectedPost.variant ?? postProduct.name;
    const railName = selectedRail.name ?? selectedRail.variant ?? topRailProduct.name;

    try {
      // Post: quantity = 2
      await apiRequest("/api/cart", "POST", {
        productName: postName,
        quantity: 2,
        pricingType: "single_item",
        unitPrice: postPrice,
        totalPrice: postPrice * 2,
        pricingTier: "Variant Price",
        notes: `${kitMarker} ${humanDesc} (2 posts)`,
        selectedVariant: {
          itemId: selectedPost.itemId ?? selectedPost.id,
          sku: selectedPost.sku ?? selectedPost.code,
          variant: selectedPost.variant ?? selectedPost.name,
          length: getLengthMm(selectedPost),
          price: postPrice,
          kind: "post",
        },
        requiresDelivery: true,
        requiresInstallation: true,
      });

      // Top Rail: quantity = 1
      await apiRequest("/api/cart", "POST", {
        productName: railName,
        quantity: 1,
        pricingType: "single_item",
        unitPrice: railPrice,
        totalPrice: railPrice,
        pricingTier: "Variant Price",
        notes: `${kitMarker} ${humanDesc} (1 top rail, ${railSpanM}m span)`,
        selectedVariant: {
          itemId: selectedRail.itemId ?? selectedRail.id,
          sku: selectedRail.sku ?? selectedRail.code,
          variant: selectedRail.variant ?? selectedRail.name,
          length: getLengthMm(selectedRail),
          price: railPrice,
          kind: "top-rail",
        },
        requiresDelivery: true,
        requiresInstallation: true,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Kit added to cart",
        description: `${familyLabel}: 2 × ${getLengthMm(selectedPost)}mm post + 1 × ${getLengthMm(selectedRail)}mm rail`,
      });
    } catch (err: any) {
      toast({
        title: "Could not add kit to cart",
        description: err?.message ?? "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Representative product for image/description/badges — post carries the
  // impact rating and is the physical anchor of the gantry.
  const hero = postProduct;
  const imageUrl = hero.imageUrl ?? topRailProduct.imageUrl ?? undefined;

  return (
    <Card
      className="group hover:shadow-lg transition-all duration-300 hover:scale-[1.02] h-full flex flex-col"
      data-testid={`kit-card-${postProduct.id}`}
    >
      <CardHeader className="p-3 sm:p-4 flex-shrink-0">
        <div className="aspect-video rounded-lg overflow-hidden mb-2 bg-gray-100">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={familyLabel}
              loading="lazy"
              className="w-full h-full object-contain bg-gray-50 group-hover:scale-110 transition-transform duration-300"
              data-testid={`kit-image-${postProduct.id}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-100">
              <div className="text-center">
                <ShoppingCart className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Awaiting Authentic Image
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-1">
          <div className="flex items-start gap-2">
            <h3
              className="font-bold text-gray-900 dark:text-white text-sm sm:text-base lg:text-lg leading-tight flex-1"
              data-testid={`kit-name-${postProduct.id}`}
            >
              {familyLabel}
            </h3>
            <Badge className="bg-blue-500 text-white shrink-0 text-[10px] px-1.5 py-0.5 font-bold tracking-wider">
              KIT
            </Badge>
          </div>
          <ProductImpactBadges
            impactRating={hero.impactRating}
            pas13Compliant={hero.pas13Compliant}
            pas13TestMethod={hero.pas13TestMethod}
            pas13TestJoules={hero.pas13TestJoules}
            heightMin={hero.heightMin}
            heightMax={hero.heightMax}
            isColdStorage={(hero as any).isColdStorage}
            category={hero.category}
            subcategory="height-restrictor"
            enrichFromName={hero.name}
          />
        </div>
      </CardHeader>

      <CardContent className="pt-0 px-3 sm:px-4 pb-3 sm:pb-4 flex-1 flex flex-col">
        <p
          className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm mb-3 line-clamp-2"
          data-testid={`kit-description-${postProduct.id}`}
        >
          Configurable gantry: 2 posts + 1 top rail. Protects overhead
          services and sets the safe height for traffic underneath.
        </p>

        {/* Configurator */}
        <div className="space-y-3 mb-3">
          <div>
            <Label htmlFor={`post-h-${postProduct.id}`} className="text-xs font-semibold">
              Post height
            </Label>
            <Select value={selectedPostMm} onValueChange={setSelectedPostMm}>
              <SelectTrigger
                id={`post-h-${postProduct.id}`}
                className="h-9 mt-1"
                data-testid={`kit-post-height-${postProduct.id}`}
              >
                <SelectValue placeholder="Select height" />
              </SelectTrigger>
              <SelectContent>
                {postVariants.map((v) => (
                  <SelectItem key={String(v.id ?? v.sku)} value={String(getLengthMm(v))}>
                    {getLengthMm(v)} mm · {formatPrice(getPrice(v))} each
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`rail-l-${postProduct.id}`} className="text-xs font-semibold">
              Top rail span
            </Label>
            <Select value={selectedRailMm} onValueChange={setSelectedRailMm}>
              <SelectTrigger
                id={`rail-l-${postProduct.id}`}
                className="h-9 mt-1"
                data-testid={`kit-rail-length-${postProduct.id}`}
              >
                <SelectValue placeholder="Select span" />
              </SelectTrigger>
              <SelectContent>
                {topRailVariants.map((v) => (
                  <SelectItem key={String(v.id ?? v.sku)} value={String(getLengthMm(v))}>
                    {getLengthMm(v) / 1000} m · {formatPrice(getPrice(v))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2 pt-2 sm:pt-3 border-t mt-auto">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
              <span>Kit total</span>
              <HoverCard openDelay={150}>
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="Price breakdown"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                </HoverCardTrigger>
                <HoverCardContent className="w-72 text-xs">
                  <div className="font-medium mb-1">Price breakdown</div>
                  <div className="flex justify-between py-0.5">
                    <span>2 × post ({getLengthMm(selectedPost ?? { length_mm: 0 })}mm)</span>
                    <span>{formatPrice(postPrice * 2)}</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span>1 × top rail ({railSpanM}m)</span>
                    <span>{formatPrice(railPrice)}</span>
                  </div>
                  <div className="flex justify-between py-0.5 font-semibold border-t mt-1 pt-1">
                    <span>Total</span>
                    <span>{formatPrice(totalPrice)}</span>
                  </div>
                  {railPerMetre > 0 && (
                    <div className="text-muted-foreground mt-2">
                      Rail equivalent: {formatPrice(railPerMetre)} / m
                    </div>
                  )}
                </HoverCardContent>
              </HoverCard>
            </div>
            <div
              className="text-lg font-bold text-green-600 dark:text-green-400"
              data-testid={`kit-total-${postProduct.id}`}
            >
              {formatPrice(totalPrice)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              2 × {formatPrice(postPrice)} + {formatPrice(railPrice)}
            </div>
          </div>

          <Button
            onClick={handleAddToCart}
            disabled={submitting || !selectedPost || !selectedRail}
            className="w-full bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm"
            size="sm"
            data-testid={`kit-add-to-cart-${postProduct.id}`}
          >
            <ShoppingCart className="h-3 w-3 mr-1" />
            {submitting ? "Adding..." : "Add Kit to Cart"}
          </Button>

          {onViewDetails && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => onViewDetails(postProduct)}
                variant="outline"
                size="sm"
                className="text-xs"
                data-testid={`kit-post-details-${postProduct.id}`}
              >
                Post details
              </Button>
              <Button
                onClick={() => onViewDetails(topRailProduct)}
                variant="outline"
                size="sm"
                className="text-xs"
                data-testid={`kit-rail-details-${topRailProduct.id}`}
              >
                Rail details
              </Button>
            </div>
          )}

          {(postProduct.technicalSheetUrl || topRailProduct.technicalSheetUrl) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadSpec}
              className="w-full text-xs"
              data-testid={`kit-technical-sheet-${postProduct.id}`}
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
