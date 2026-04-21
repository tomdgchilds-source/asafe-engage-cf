import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Info } from "lucide-react";
import { getCatalogEnrichment } from "@/lib/catalogEnrichment";

// Unified impact-rating + PAS 13 + cold-storage + height badge row used
// by ProductCard, GroupedProductCard, and ConsolidatedProductCard. Keeps
// colour / format / fallback consistent across the three. See
// scripts/data/product-card-unification-plan.md for the spec.

interface ProductImpactBadgesProps {
  // Primary
  impactRating?: number | null;
  impactRange?: { min: number; max: number } | null;

  // PAS 13 (from schema)
  pas13Compliant?: boolean | null;
  pas13TestMethod?: string | null;
  pas13TestJoules?: number | null;

  // Height (from schema)
  heightMin?: number | null;
  heightMax?: number | null;

  // Ambient
  isColdStorage?: boolean;

  // Category labels
  category?: string | null;
  subcategory?: string | null;

  // Enrichment (catalog narrative). If `enrichFromName` is supplied we
  // look up catalogEnrichment; explicit props still win.
  vehicleTest?: string | null;
  impactRatingRaw?: string | null;
  enrichFromName?: string;

  // Visual config
  size?: "sm" | "md";
  showFallback?: boolean;
  showCategory?: boolean;
  className?: string;
}

function humanMethod(method: string | null | undefined): string | null {
  if (!method) return null;
  const norm = method.toLowerCase();
  if (norm === "pendulum") return "Pendulum test";
  if (norm === "vehicle") return "Vehicle test";
  if (norm === "sled") return "Sled test";
  return method;
}

export function ProductImpactBadges({
  impactRating,
  impactRange,
  pas13Compliant,
  pas13TestMethod,
  pas13TestJoules,
  heightMin,
  heightMax,
  isColdStorage,
  category,
  subcategory,
  vehicleTest,
  impactRatingRaw,
  enrichFromName,
  size = "md",
  showFallback = true,
  showCategory = true,
  className,
}: ProductImpactBadgesProps) {
  const chipPadding = size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1";

  // Optional enrichment. Explicit props win over lookup.
  const enrichment = enrichFromName ? getCatalogEnrichment(enrichFromName) : null;
  const effectiveVehicleTest = vehicleTest ?? enrichment?.vehicleTest ?? null;
  const effectiveImpactRaw = impactRatingRaw ?? enrichment?.impactRatingRaw ?? null;
  const effectiveMethod = pas13TestMethod ?? enrichment?.pas13Method ?? null;
  const effectivePas13 = pas13Compliant ?? (enrichment?.pas13Certified || false);

  const hasHoverText = !!(effectiveVehicleTest || effectiveImpactRaw);
  const hasImpact = typeof impactRating === "number" && impactRating > 0;
  const hasRange =
    impactRange && impactRange.min > 0 && impactRange.max > 0 && impactRange.min !== impactRange.max;

  const impactLabel = hasRange
    ? `${impactRange!.min.toLocaleString()}-${impactRange!.max.toLocaleString()}J`
    : hasImpact
      ? `${impactRating!.toLocaleString()}J`
      : null;

  // Height: show range if both present, else single value
  const heightLabel = (() => {
    if (heightMin && heightMax && heightMin !== heightMax) {
      return `${heightMin}-${heightMax}mm`;
    }
    if (heightMax) return `${heightMax}mm`;
    if (heightMin) return `${heightMin}mm`;
    return null;
  })();

  const pas13TooltipText = (() => {
    if (effectiveMethod && pas13TestJoules) {
      return `${humanMethod(effectiveMethod)}, ${pas13TestJoules.toLocaleString()} J`;
    }
    if (effectiveMethod) return humanMethod(effectiveMethod);
    return "PAS 13:2017 certified";
  })();

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className={`flex gap-1 sm:gap-2 flex-wrap items-center ${className || ""}`}
        data-testid="product-impact-badges"
      >
        {/* Primary: impact rating chip. Wrapped in HoverCard when we
            have a narrative vehicleTest / raw string; plain chip otherwise. */}
        {impactLabel ? (
          hasHoverText ? (
            <HoverCard openDelay={200}>
              <HoverCardTrigger asChild>
                <Badge
                  className={`bg-[#FFC72C] text-black hover:bg-[#FFB300] shrink-0 ${chipPadding} cursor-default`}
                  data-testid="impact-badge"
                >
                  {impactLabel}
                  <Info className="h-3 w-3 ml-1 opacity-70" />
                </Badge>
              </HoverCardTrigger>
              <HoverCardContent className="w-80 text-xs">
                <div className="font-medium mb-1">Impact test details</div>
                {effectiveImpactRaw && <p className="mb-1">{effectiveImpactRaw}</p>}
                {effectiveVehicleTest && effectiveVehicleTest !== effectiveImpactRaw && (
                  <p className="text-muted-foreground">{effectiveVehicleTest}</p>
                )}
              </HoverCardContent>
            </HoverCard>
          ) : (
            <Badge
              className={`bg-[#FFC72C] text-black hover:bg-[#FFB300] shrink-0 ${chipPadding}`}
              data-testid="impact-badge"
            >
              {impactLabel}
            </Badge>
          )
        ) : showFallback ? (
          <Badge
            variant="outline"
            className={`text-gray-500 shrink-0 ${chipPadding}`}
            data-testid="impact-badge-fallback"
          >
            No impact rating
          </Badge>
        ) : null}

        {/* PAS 13 chip */}
        {effectivePas13 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                className={`bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100 hover:bg-gray-200 shrink-0 ${chipPadding}`}
                data-testid="pas13-badge"
              >
                PAS 13
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{pas13TooltipText}</TooltipContent>
          </Tooltip>
        )}

        {/* Height */}
        {heightLabel && (
          <Badge className={`bg-blue-500 text-white shrink-0 ${chipPadding}`} data-testid="height-badge">
            {heightLabel} Height
          </Badge>
        )}

        {/* Cold storage */}
        {isColdStorage && (
          <Badge
            className={`bg-cyan-500 text-white shrink-0 ${chipPadding}`}
            data-testid="cold-storage-badge"
          >
            Cold Storage
          </Badge>
        )}

        {/* Category / subcategory */}
        {showCategory && category && (
          <Badge variant="outline" className={`shrink-0 ${chipPadding}`}>
            {category}
          </Badge>
        )}
        {showCategory && subcategory && (
          <Badge variant="outline" className={`shrink-0 ${chipPadding}`}>
            {subcategory}
          </Badge>
        )}
      </div>
    </TooltipProvider>
  );
}
