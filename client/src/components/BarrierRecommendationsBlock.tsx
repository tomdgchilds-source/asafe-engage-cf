// ────────────────────────────────────────────────────────────────────────────
// BarrierRecommendationsBlock
//
// Renders the output of POST /api/recommend-barriers (shared/barrier-
// Recommender.ts) — top-3 PAS-13-aligned barrier options per zone, with
// alignment verdict, fit score, rationale, and an Add-to-Cart button that
// pushes the recommended SKU + quantity into the project cart.
//
// Used in:
//   - SolutionFinder.tsx — augments the existing rule-based matches with
//     the new engine's deterministic verdicts.
//   - SiteSurvey.tsx — surfaced inline beneath a survey area once the rep
//     has provided vehicle + zone metadata.
// ────────────────────────────────────────────────────────────────────────────

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, ShoppingCart, AlertTriangle, ExternalLink, Info } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  BarrierRecommendation,
  BarrierRecommendationOption,
} from "../../../shared/barrierRecommender";

export interface BarrierRecommendationsBlockProps {
  /** Output of POST /api/recommend-barriers — { results, productCoverage, cached }. */
  data: {
    results: BarrierRecommendation[];
    productCoverage?: { withSuitability: number; total: number };
    cached?: boolean;
  } | null | undefined;
  isLoading?: boolean;
  /** Optional context for cart additions — projectId / source label. */
  cartContext?: {
    projectId?: string;
    source?: "solution-finder" | "site-survey";
    sourceTitle?: string;
  };
  className?: string;
}

function verdictBadge(label: BarrierRecommendationOption["pas13Verdict"]["verdict"]): {
  className: string;
  text: string;
} {
  switch (label) {
    case "aligned":
      return {
        className: "bg-green-100 text-green-800 border-green-300",
        text: "PAS 13 aligned",
      };
    case "borderline":
      return {
        className: "bg-yellow-100 text-yellow-800 border-yellow-300",
        text: "Borderline",
      };
    default:
      return {
        className: "bg-red-100 text-red-800 border-red-300",
        text: "Not aligned",
      };
  }
}

function formatAed(n: number): string {
  return `AED ${Math.round(n).toLocaleString()}`;
}

export function BarrierRecommendationsBlock({
  data,
  isLoading,
  cartContext,
  className,
}: BarrierRecommendationsBlockProps) {
  const { toast } = useToast();

  const totalOptions = useMemo(() => {
    if (!data?.results) return 0;
    return data.results.reduce((acc, r) => acc + r.options.length, 0);
  }, [data?.results]);

  const handleAddToCart = async (
    zone: BarrierRecommendation,
    option: BarrierRecommendationOption,
  ) => {
    try {
      // Cart payload mirrors the legacy shape (worker/routes/cart.ts) so the
      // existing /api/cart/bulk-add handler accepts it without server-side
      // changes.
      const items = [
        {
          productName: option.productName,
          quantity: option.pricingMode === "per_unit" ? option.quantityOrLengthMeters : 1,
          length: option.pricingMode === "per_length" ? option.quantityOrLengthMeters : undefined,
          pricingType:
            option.pricingMode === "per_length" ? "linear_meter" : "standard_item",
          unitPrice: option.unitPriceAed,
          variantSku: option.recommendedVariantSku ?? undefined,
          variantName: option.recommendedVariantName ?? undefined,
          applicationArea: zone.zone,
          notes:
            `PAS 13 ${option.pas13Verdict.verdict} — ${option.pas13Verdict.summary}` +
            (option.tradeOff ? ` | ${option.tradeOff}` : ""),
          solutionContext: {
            zone: zone.zone,
            designVehicleId: zone.designVehicle?.id,
            designVehicleClass: zone.designVehicle?.classCode,
            pas13Verdict: option.pas13Verdict.verdict,
            pas13SafetyMarginPct: option.pas13Verdict.details.safetyMarginPct,
            fitScore: option.fitScore,
            source: cartContext?.source ?? "barrier-recommender",
          },
        },
      ];
      const response = await apiRequest("/api/cart/bulk-add", "POST", {
        items,
        projectInfo: cartContext?.projectId
          ? { projectId: cartContext.projectId }
          : {
              projectDescription: cartContext?.sourceTitle
                ? `Recommended barrier — ${cartContext.sourceTitle}`
                : `Recommended barrier — ${zone.zone}`,
              solutionType: cartContext?.source ?? "barrier-recommender",
            },
        autoSaveExisting: true,
      });
      const json = (await response.json()) as { message?: string };
      toast({
        title: "Added to project cart",
        description:
          json?.message ||
          `${option.productName} (${option.pas13Verdict.verdict === "aligned" ? "PAS 13 aligned" : "borderline"}) added.`,
      });
    } catch (err) {
      console.error("Add-to-cart failed:", err);
      toast({
        variant: "destructive",
        title: "Add-to-cart failed",
        description: "Could not add the recommended barrier to the cart. Please try again.",
      });
    }
  };

  if (isLoading) {
    return (
      <Card className={className} data-testid="barrier-recommendations-loading">
        <CardHeader>
          <CardTitle className="text-base flex items-center">
            <Shield className="h-4 w-4 mr-2 text-primary" />
            Computing PAS 13 barrier recommendations…
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 animate-pulse bg-gray-100 rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.results || data.results.length === 0) {
    return null;
  }

  return (
    <div className={className} data-testid="barrier-recommendations-block">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-bold flex items-center">
            <Shield className="h-5 w-5 mr-2 text-primary" />
            PAS 13 Barrier Recommendations
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Deterministic, rule-based — derived from σ's PAS 13:2017 rule
            engine and the product suitability dataset.
          </p>
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-3">
          <span>
            {data.results.length} zone{data.results.length === 1 ? "" : "s"}
          </span>
          <span>{totalOptions} ranked options</span>
          {data.productCoverage && (
            <span className="inline-flex items-center gap-1">
              <Info className="h-3 w-3" />
              Catalog coverage: {data.productCoverage.withSuitability}/
              {data.productCoverage.total} products
            </span>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {data.results.map((zone) => (
          <Card
            key={zone.zone}
            className="border-l-4 border-l-primary"
            data-testid={`recommendation-zone-${zone.zone.replace(/\s+/g, "-")}`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="text-base">{zone.zone}</CardTitle>
                  {zone.designVehicle && (
                    <p className="text-xs text-gray-600 mt-1">
                      Design vehicle: <strong>{zone.designVehicle.id}</strong>{" "}
                      ({zone.designVehicle.massKg} kg @ {zone.designVehicle.speedKmh} km/h
                      , class {zone.designVehicle.classCode})
                      {zone.designVehicle.usedClosestAnalogue && (
                        <span className="ml-2 text-yellow-700">
                          — closest analogue used
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className="text-xs">
                  Top {zone.options.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {zone.options.length === 0 && (
                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-xs text-yellow-800">
                  <AlertTriangle className="h-3 w-3 inline mr-1" />
                  No suitable barriers found for this zone. Notes:
                  <ul className="list-disc ml-5 mt-1">
                    {zone.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
              {zone.options.map((option, idx) => {
                const v = verdictBadge(option.pas13Verdict.verdict);
                return (
                  <div
                    key={option.productId}
                    className="border rounded-lg p-3 bg-white space-y-2"
                    data-testid={`recommendation-option-${option.productId}`}
                  >
                    <div className="flex items-start justify-between flex-wrap gap-2">
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary text-black font-bold text-xs flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-semibold text-sm">
                            {option.productName}
                          </div>
                          {option.recommendedVariantName && (
                            <div className="text-xs text-gray-600">
                              SKU: {option.recommendedVariantSku ?? "—"} ·{" "}
                              {option.recommendedVariantName}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`${v.className} border text-xs`}>
                          {v.text}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          Fit {(option.fitScore * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                    <p className="text-xs text-gray-700">{option.rationale}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-600">
                      <div>
                        <span className="font-semibold">Quantity</span>
                        <div>
                          {option.pricingMode === "per_length"
                            ? `${option.quantityOrLengthMeters} m`
                            : `${option.quantityOrLengthMeters} unit${option.quantityOrLengthMeters === 1 ? "" : "s"}`}
                        </div>
                      </div>
                      <div>
                        <span className="font-semibold">Unit price</span>
                        <div>
                          {formatAed(option.unitPriceAed)}
                          {option.pricingMode === "per_length" ? " / m" : " / unit"}
                        </div>
                      </div>
                      <div>
                        <span className="font-semibold">Estimated total</span>
                        <div>{formatAed(option.estimatedAedTotal)}</div>
                      </div>
                      <div>
                        <span className="font-semibold">Safety margin</span>
                        <div>
                          {option.pas13Verdict.details.safetyMarginPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    {option.tradeOff && (
                      <div className="text-xs text-yellow-800 bg-yellow-50 p-2 rounded">
                        <AlertTriangle className="h-3 w-3 inline mr-1" />
                        {option.tradeOff}
                      </div>
                    )}
                    {option.warnings && option.warnings.length > 0 && (
                      <ul className="list-disc ml-5 text-xs text-yellow-700 space-y-1">
                        {option.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    )}
                    {option.pas13Verdict.citations.length > 0 && (
                      <div className="text-xs text-gray-500 flex flex-wrap gap-1">
                        Citations:
                        {option.pas13Verdict.citations.map((c, i) => (
                          <span
                            key={i}
                            className="px-1.5 py-0.5 bg-gray-100 rounded"
                            title={c.longLabel}
                          >
                            {c.shortLabel}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 italic">
                      {option.footnote}
                    </p>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => handleAddToCart(zone, option)}
                        data-testid={`button-add-recommendation-${option.productId}`}
                      >
                        <ShoppingCart className="h-3 w-3 mr-1" />
                        Add to Cart
                      </Button>
                      <Link href={`/products/${option.productId}`}>
                        <Button size="sm" variant="outline">
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View Product
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
              {zone.notes.length > 0 && (
                <div className="text-[11px] text-gray-500 italic border-t pt-2">
                  {zone.notes.map((n, i) => (
                    <div key={i}>{n}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
