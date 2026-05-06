import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, Ruler, Wrench } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

/**
 * QuoteBuilderPanel
 *
 * A focused quote-line builder for three product patterns that don't map
 * cleanly onto the standard "pick a variant, set quantity" flow:
 *
 *   1. Per-length barriers (iFlex / eFlex / mFlex families)
 *      — the rep wants to enter a total length in metres (e.g. 36.8 m)
 *        and have us price it on the family's per-linear-metre rate
 *        rather than hand-stitching a SKU mix.
 *
 *   2. iFlex Height Restrictor kits
 *      — the rep types clear height + clear width. We auto-pick the
 *        closest Post + Top Rail SKU and add 2× post + 1× rail to the
 *        cart in a single click.
 *
 *   3. Hydraulic Swing Gate kits
 *      — the rep types the opening width. We auto-pick the matching
 *        Self-Close SKU and add 1× gate + 1× post to the cart.
 *
 * The panel is rendered inside AddToCartModal so the rep can still fall
 * back to the standard SKU picker if they need something bespoke.
 */

type PriceVariant = {
  id: string;
  sku?: string | null;
  name: string;
  price?: number;
  priceAed?: number | string;
  length?: number | null;
  length_mm?: number | null;
  lengthMm?: number | null;
  kind?: string | null;
};

type CatalogProduct = {
  id?: string;
  productId?: string;
  name: string;
  category?: string;
  pricingLogic?: string;
  basePricePerMeter?: string | number | null;
  price?: string | number | null;
  priceVariants?: PriceVariant[];
};

export type BuilderMode =
  | "length"             // per_meter / per_length barrier — one cart line at linear_meter pricing
  | "length-segmented"   // per_unit family whose variants are different LENGTHS (Rack End Barrier, Step Guard, ForkGuard). Rep enters total metres; we pick the smallest variant whose nominal length covers the request, OR — if the request exceeds the longest variant — base price + per-metre extension at base_price/base_length. ONE cart line either way (no doubling at variant boundaries; see Mohammed Bassil's May 5 feedback).
  | "height-restrictor"
  | "swing-gate";

// Any pricingLogic that encodes "priced by the linear metre / length" — we
// accept the spelling variants we've shipped historically (per_length is the
// pricelist-loader convention; per_meter / per_metre / per_linear_metre were
// earlier seed rows) so a row tagged with any of these surfaces the total-LM
// input. New rows should be written as `per_length` but the UI shouldn't
// break if a synonym sneaks in.
const LINEAR_PRICING_LOGICS = new Set([
  "per_length",
  "per_meter",
  "per_metre",
  "per_linear_metre",
  "per_linear_meter",
]);

export function isLinearPricing(pricingLogic: string | null | undefined): boolean {
  if (!pricingLogic) return false;
  return LINEAR_PRICING_LOGICS.has(pricingLogic.toLowerCase());
}

export function detectBuilderMode(
  product: CatalogProduct,
): BuilderMode | null {
  const n = (product.name || "").toLowerCase();
  if (/height restrictor/.test(n) && /post/.test(n)) return "height-restrictor";
  if (/swing gate/.test(n) && /self-close/.test(n)) return "swing-gate";
  if (isLinearPricing(product.pricingLogic)) return "length";

  // Per-unit family where every variant carries a distinct lengthMm. Covers
  // Rack End Barrier, Step Guard, ForkGuard, Heavy Duty ForkGuard — "how
  // many metres of linear protection do you need?" is how reps actually
  // think about them. Exclude families that technically have a lengthMm
  // but aren't linear runs (e.g. column guards have 100/200/300 labels
  // that read like lengths but describe column cross-section).
  if (product.pricingLogic === "per_unit") {
    const variants = product.priceVariants ?? [];
    const lens = variants
      .map((v) => Number((v as any).length_mm ?? v.lengthMm ?? v.length ?? 0))
      .filter((l) => l > 0);
    const distinct = new Set(lens);
    if (
      variants.length >= 2 &&
      lens.length === variants.length &&
      distinct.size >= 2 &&
      !/column guard/i.test(n) &&
      !/corner guard/i.test(n) &&
      !/bollard/i.test(n)
    ) {
      return "length-segmented";
    }
  }
  return null;
}

interface Props {
  product: CatalogProduct;
  /** All products from /api/products, needed so kit flows can resolve the
   *  matching Post / Top Rail or Gate / Post family by name. */
  allProducts?: CatalogProduct[];
  onComplete?: () => void;
}

export function QuoteBuilderPanel({ product, allProducts = [], onComplete }: Props) {
  const mode = detectBuilderMode(product);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  // Per-length barrier state
  const [totalLength, setTotalLength] = useState("");

  // Kit state (shared by HR + SG)
  const [clearHeight, setClearHeight] = useState("");
  const [clearWidth, setClearWidth] = useState("");

  const perMeterRate = useMemo(() => {
    const explicit = Number(product.basePricePerMeter);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    // Fall back to deriving from the longest variant (lowest per-metre rate).
    const variants = product.priceVariants ?? [];
    const withLength = variants
      .map((v) => ({
        len: Number(v.lengthMm ?? v.length_mm ?? v.length ?? 0),
        price: Number(v.priceAed ?? v.price ?? 0),
      }))
      .filter((v) => v.len > 0 && v.price > 0);
    if (!withLength.length) return 0;
    withLength.sort((a, b) => b.len - a.len);
    const longest = withLength[0];
    return Math.round((longest.price / (longest.len / 1000)) * 100) / 100;
  }, [product]);

  // ─────────────────────────────────────────────────────────────
  // Length-segmented pricing plan (Rack End Barrier, Step Guard,
  // ForkGuard, HD ForkGuard).
  //
  // These products ship as one barrier per nominal length (900mm, 1100mm,
  // 2000mm, 2400mm, ...). The historical behaviour was to greedily fill
  // the requested run with multiple barriers — for a 2.5m request with
  // a 2400mm longest variant, it added 1× 2400 + 1× 900, doubling the
  // price at the boundary. Reps don't actually buy two barriers to make
  // up 100mm; they fit one barrier and pay an extension on the linear
  // metre rate for the difference.
  //
  // The corrected plan picks ONE piece:
  //   - L ≤ longest variant: pick the smallest variant whose nominal
  //     length ≥ L (or the smallest variant if L is below it). The user
  //     pays that variant's unit price.
  //   - L > longest variant: pick the longest variant as the "base"
  //     piece and add a per-metre extension charge for the overflow.
  //     extension_rate = base_price / base_length_m  (so a 2.4m piece
  //     at 2,341.32 AED yields ~975.55 AED/m for the overflow).
  //
  // This keeps the price curve smooth across the boundary and matches
  // how the sales team actually quotes these jobs (see Mohammed
  // Bassil's May 5 feedback: doubling at 2.5m, identical price at 2.6m).
  // ─────────────────────────────────────────────────────────────
  const segmentedPlan = useMemo(() => {
    if (mode !== "length-segmented" || !totalLength) return null;
    const totalMm = Math.round(Number(totalLength) * 1000);
    if (!Number.isFinite(totalMm) || totalMm <= 0) return null;
    const variants = (product.priceVariants ?? [])
      .map((v) => ({
        id: v.id,
        sku: v.sku ?? null,
        name: v.name,
        length: Number(v.lengthMm ?? v.length_mm ?? v.length ?? 0),
        price: Number(v.priceAed ?? v.price ?? 0),
      }))
      .filter((v) => v.length > 0 && v.price > 0)
      .sort((a, b) => a.length - b.length);
    if (!variants.length) return null;

    const longest = variants[variants.length - 1];
    let basePiece: typeof variants[number];
    let extensionMm = 0;
    if (totalMm <= longest.length) {
      // Walk up the (ascending-sorted) variants and pick the first one
      // whose nominal length is ≥ requested length. Falls back to the
      // smallest if the request is below every variant (rare — e.g.
      // someone types 0.5m for a barrier whose smallest piece is 900mm).
      basePiece =
        variants.find((v) => v.length >= totalMm) ?? variants[0];
    } else {
      basePiece = longest;
      extensionMm = totalMm - longest.length;
    }
    const extensionRatePerM =
      Math.round((longest.price / (longest.length / 1000)) * 100) / 100;
    const extensionCharge =
      Math.round(((extensionMm / 1000) * extensionRatePerM) * 100) / 100;
    const totalPrice = Math.round((basePiece.price + extensionCharge) * 100) / 100;
    return {
      basePiece,
      extensionMm,
      extensionRatePerM,
      extensionCharge,
      totalPrice,
      requestedMm: totalMm,
    };
  }, [mode, totalLength, product]);

  // Greedy SKU-mix used by the per-linear-metre `length` mode (iFlex /
  // eFlex / mFlex traffic barriers). These families ARE legitimately
  // built up out of multiple SKUs (Atlas 2× 5m + 1× 1m to make 11m), so
  // the "fill the longest first" heuristic still applies. Length-segmented
  // products use `segmentedPlan` instead — see the comment above.
  const mix = useMemo(() => {
    if (mode !== "length" || !totalLength) return null;
    const totalMm = Math.round(Number(totalLength) * 1000);
    if (!Number.isFinite(totalMm) || totalMm <= 0) return null;
    const variants = (product.priceVariants ?? [])
      .map((v) => ({
        name: v.name,
        length: Number(v.lengthMm ?? v.length_mm ?? v.length ?? 0),
        price: Number(v.priceAed ?? v.price ?? 0),
      }))
      .filter((v) => v.length > 0 && v.price > 0)
      .sort((a, b) => b.length - a.length);
    if (!variants.length) return null;

    let remaining = totalMm;
    const chosen: Array<{ name: string; length: number; qty: number; price: number }> = [];
    for (const v of variants) {
      const qty = Math.floor(remaining / v.length);
      if (qty > 0) {
        chosen.push({ name: v.name, length: v.length, qty, price: v.price });
        remaining -= qty * v.length;
      }
    }
    // Anything leftover rolls to the shortest variant that covers it.
    if (remaining > 0) {
      const smallest = variants[variants.length - 1];
      chosen.push({
        name: smallest.name,
        length: smallest.length,
        qty: 1,
        price: smallest.price,
      });
      remaining -= smallest.length;
    }
    const skuTotal = chosen.reduce((s, c) => s + c.qty * c.price, 0);
    return { chosen, skuTotal, deliveredMm: totalMm - Math.max(0, remaining) };
  }, [mode, totalLength, product]);

  // ─────────────────────────────────────────────────────────────
  // Kit resolution: find matching "sibling" family by name.
  // ─────────────────────────────────────────────────────────────
  const findSibling = (namePart: string): CatalogProduct | undefined =>
    allProducts.find((p) => p.name.toLowerCase().includes(namePart.toLowerCase()));

  const pickClosestVariant = (
    variants: PriceVariant[] | undefined,
    targetMm: number,
  ): PriceVariant | undefined => {
    if (!variants || variants.length === 0) return undefined;
    return variants
      .slice()
      .sort((a, b) => {
        const la = Number(a.lengthMm ?? a.length_mm ?? a.length ?? 0);
        const lb = Number(b.lengthMm ?? b.length_mm ?? b.length ?? 0);
        return Math.abs(la - targetMm) - Math.abs(lb - targetMm);
      })[0];
  };

  // ─────────────────────────────────────────────────────────────
  // Submit handlers
  // ─────────────────────────────────────────────────────────────
  const addTotalLengthLine = async () => {
    const meters = Number(totalLength);
    if (!Number.isFinite(meters) || meters <= 0) {
      toast({ title: "Enter a total length in metres", variant: "destructive" });
      return;
    }
    if (perMeterRate <= 0) {
      toast({
        title: "No per-metre rate on file",
        description: "Use the standard SKU picker below instead.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const unitPrice = perMeterRate;
      const totalPrice = Math.round(meters * unitPrice * 100) / 100;
      await apiRequest("/api/cart", "POST", {
        productName: product.name,
        quantity: meters,
        pricingType: "linear_meter",
        unitPrice,
        totalPrice,
        pricingTier: "Total length",
        notes: mix
          ? `Suggested SKU mix: ${mix.chosen
              .map((c) => `${c.qty}× ${c.length}mm`)
              .join(" · ")}`
          : undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Added to cart",
        description: `${meters} m of ${product.name} · AED ${totalPrice.toLocaleString()}`,
      });
      onComplete?.();
    } catch (err: any) {
      toast({
        title: "Could not add",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Per-unit families with length variants (Rack End Barrier, Step Guard,
  // ForkGuard, HD ForkGuard): rep enters a total length in metres, we
  // submit ONE cart line. Pricing follows `segmentedPlan` — the smallest
  // variant whose nominal length covers the request, OR the longest
  // variant + a per-metre extension charge for any overflow. This is
  // PAS 13 aligned: the rep buys one barrier and pays the lm rate for
  // the difference — no double-barrier doubling at variant boundaries.
  const addLengthSegmentedLines = async () => {
    if (!segmentedPlan) {
      toast({
        title: "Enter a total length in metres",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const meters = Number(totalLength);
      const { basePiece, extensionMm, extensionRatePerM, totalPrice } =
        segmentedPlan;
      const tier =
        extensionMm > 0
          ? `Custom ${meters.toFixed(2)}m (${(basePiece.length / 1000).toFixed(2)}m base + ${(extensionMm / 1000).toFixed(2)}m extension @ AED ${extensionRatePerM.toLocaleString()}/m)`
          : `Nominal ${(basePiece.length / 1000).toFixed(2)}m piece`;
      const noteLines = [
        `Total run requested: ${meters.toFixed(2)} m`,
        `Base piece: ${basePiece.name} (AED ${basePiece.price.toLocaleString()})`,
      ];
      if (extensionMm > 0) {
        noteLines.push(
          `Length extension: ${(extensionMm / 1000).toFixed(2)} m × AED ${extensionRatePerM.toLocaleString()}/m = AED ${segmentedPlan.extensionCharge.toLocaleString()}`,
        );
      }
      await apiRequest("/api/cart", "POST", {
        productName: basePiece.name,
        quantity: 1,
        pricingType: "single_item",
        unitPrice: totalPrice,
        totalPrice,
        pricingTier: tier,
        notes: noteLines.join("\n"),
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Added to cart",
        description:
          extensionMm > 0
            ? `${(basePiece.length / 1000).toFixed(2)}m base + ${(extensionMm / 1000).toFixed(2)}m extension · AED ${totalPrice.toLocaleString()}`
            : `${(basePiece.length / 1000).toFixed(2)}m piece · AED ${totalPrice.toLocaleString()}`,
      });
      onComplete?.();
    } catch (err: any) {
      toast({
        title: "Could not add",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const addHeightRestrictorKit = async () => {
    const h = Number(clearHeight);
    const w = Number(clearWidth);
    if (!h || !w || h <= 0 || w <= 0) {
      toast({
        title: "Enter both clear height and width in mm",
        variant: "destructive",
      });
      return;
    }
    const postFamily = product; // caller gave us the Post family
    const railFamily = findSibling("Height Restrictor - Top Rail");
    if (!railFamily || !railFamily.priceVariants?.length) {
      toast({
        title: "Top rail catalog missing",
        description:
          "Couldn't find the iFlex Height Restrictor Top Rail — please refresh.",
        variant: "destructive",
      });
      return;
    }
    const post = pickClosestVariant(postFamily.priceVariants ?? [], h);
    const rail = pickClosestVariant(railFamily.priceVariants ?? [], w);
    if (!post || !rail) {
      toast({
        title: "Couldn't size the kit",
        description: "No matching post or rail variant found.",
        variant: "destructive",
      });
      return;
    }
    const postPrice = Number(post.priceAed ?? post.price ?? 0);
    const railPrice = Number(rail.priceAed ?? rail.price ?? 0);
    setSubmitting(true);
    try {
      // 2× posts
      await apiRequest("/api/cart", "POST", {
        productName: post.name,
        quantity: 2,
        pricingType: "single_item",
        unitPrice: postPrice,
        totalPrice: postPrice * 2,
        pricingTier: "Kit: Height Restrictor",
        notes: `Clear height ${h}mm × width ${w}mm — 2× post`,
      });
      // 1× rail
      await apiRequest("/api/cart", "POST", {
        productName: rail.name,
        quantity: 1,
        pricingType: "single_item",
        unitPrice: railPrice,
        totalPrice: railPrice,
        pricingTier: "Kit: Height Restrictor",
        notes: `Clear height ${h}mm × width ${w}mm — 1× top rail`,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Height Restrictor kit added",
        description: `2× ${post.lengthMm}mm post + 1× ${rail.lengthMm}mm top rail · AED ${(postPrice * 2 + railPrice).toLocaleString()}`,
      });
      onComplete?.();
    } catch (err: any) {
      toast({
        title: "Could not add kit",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const addSwingGateKit = async () => {
    const w = Number(clearWidth);
    if (!w || w <= 0) {
      toast({ title: "Enter opening width in mm", variant: "destructive" });
      return;
    }
    const gateFamily = product;
    const postFamily = findSibling("Swing Gate (2R) - Post");
    if (!postFamily || !postFamily.priceVariants?.length) {
      toast({
        title: "Swing gate post catalog missing",
        description: "Refresh the page and try again.",
        variant: "destructive",
      });
      return;
    }
    // For gate width we match the variant's widthMm/lengthMm (800 / 1000 / 1200).
    const gate = pickClosestVariant(gateFamily.priceVariants ?? [], w);
    const post = postFamily.priceVariants![0]; // single SKU post
    if (!gate || !post) {
      toast({ title: "Couldn't size the kit", variant: "destructive" });
      return;
    }
    const gatePrice = Number(gate.priceAed ?? gate.price ?? 0);
    const postPrice = Number(post.priceAed ?? post.price ?? 0);
    setSubmitting(true);
    try {
      await apiRequest("/api/cart", "POST", {
        productName: gate.name,
        quantity: 1,
        pricingType: "single_item",
        unitPrice: gatePrice,
        totalPrice: gatePrice,
        pricingTier: "Kit: Swing Gate",
        notes: `Opening width ${w}mm — 1× gate`,
      });
      await apiRequest("/api/cart", "POST", {
        productName: post.name,
        quantity: 1,
        pricingType: "single_item",
        unitPrice: postPrice,
        totalPrice: postPrice,
        pricingTier: "Kit: Swing Gate",
        notes: `Opening width ${w}mm — 1× post`,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Swing Gate kit added",
        description: `Gate + post · AED ${(gatePrice + postPrice).toLocaleString()}`,
      });
      onComplete?.();
    } catch (err: any) {
      toast({
        title: "Could not add kit",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!mode) return null;

  return (
    <div className="border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        {mode === "length" || mode === "length-segmented" ? (
          <Ruler className="h-4 w-4 text-yellow-700" />
        ) : (
          <Wrench className="h-4 w-4 text-yellow-700" />
        )}
        <span className="text-sm font-bold text-yellow-900 dark:text-yellow-200">
          {mode === "length"
            ? "Quote by total length"
            : mode === "length-segmented"
              ? "Quote by total length (auto-pick pieces)"
              : mode === "height-restrictor"
                ? "Build Height Restrictor kit"
                : "Build Swing Gate kit"}
        </span>
        <Badge className="bg-[#FFC72C] text-black text-[10px]">Recommended</Badge>
      </div>

      {(mode === "length" || mode === "length-segmented") && (
        <>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label htmlFor="qb-total-length" className="text-xs">
                Total length required (metres)
              </Label>
              <Input
                id="qb-total-length"
                type="number"
                min="0.1"
                step="0.1"
                placeholder="e.g. 36.8"
                value={totalLength}
                onChange={(e) => setTotalLength(e.target.value)}
                data-testid="input-qb-total-length"
              />
            </div>
            {mode === "length" && perMeterRate > 0 && (
              <div className="text-right text-xs text-gray-600 dark:text-gray-400">
                <div>Linear metre rate</div>
                <div className="text-base font-bold text-gray-900 dark:text-white">
                  AED {perMeterRate.toLocaleString()}/m
                </div>
              </div>
            )}
            {mode === "length-segmented" && (
              <div className="text-right text-xs text-gray-600 dark:text-gray-400">
                <div>Single piece + lm extension</div>
                <div className="text-[11px] text-gray-500 dark:text-gray-500">
                  Picks the smallest piece that covers your length; over the
                  longest variant we add a per-metre extension charge.
                </div>
              </div>
            )}
          </div>
          {mode === "length" && mix && (
            <div className="rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 text-xs space-y-1">
              <div className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Zap className="h-3 w-3" />
                Suggested SKU mix for {Number(totalLength).toFixed(2)} m
              </div>
              <ul className="space-y-0.5 mt-1">
                {mix.chosen.map((c, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-gray-600 dark:text-gray-400"
                  >
                    <span>
                      {c.qty}× {c.length}mm
                    </span>
                    <span>AED {(c.qty * c.price).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-gray-700 dark:text-gray-300">
                <span>SKU-mix total</span>
                <span className="font-bold">AED {mix.skuTotal.toLocaleString()}</span>
              </div>
            </div>
          )}
          {mode === "length-segmented" && segmentedPlan && (
            <div className="rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 text-xs space-y-1">
              <div className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Zap className="h-3 w-3" />
                Pricing plan for {Number(totalLength).toFixed(2)} m
              </div>
              <ul className="space-y-0.5 mt-1">
                <li className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                  <span>
                    1× {(segmentedPlan.basePiece.length / 1000).toFixed(2)}m
                    base piece
                  </span>
                  <span>
                    AED {segmentedPlan.basePiece.price.toLocaleString()}
                  </span>
                </li>
                {segmentedPlan.extensionMm > 0 && (
                  <li className="flex items-center justify-between text-gray-600 dark:text-gray-400">
                    <span>
                      + {(segmentedPlan.extensionMm / 1000).toFixed(2)}m
                      extension @ AED{" "}
                      {segmentedPlan.extensionRatePerM.toLocaleString()}/m
                    </span>
                    <span>
                      AED {segmentedPlan.extensionCharge.toLocaleString()}
                    </span>
                  </li>
                )}
              </ul>
              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-gray-700 dark:text-gray-300">
                <span>Line total</span>
                <span className="font-bold">
                  AED {segmentedPlan.totalPrice.toLocaleString()}
                </span>
              </div>
            </div>
          )}
          <Button
            onClick={
              mode === "length-segmented" ? addLengthSegmentedLines : addTotalLengthLine
            }
            disabled={
              submitting ||
              !totalLength ||
              (mode === "length" && perMeterRate <= 0) ||
              (mode === "length-segmented" && !segmentedPlan)
            }
            className="w-full bg-[#FFC72C] text-black hover:bg-[#FFB700] font-semibold"
            data-testid="button-qb-add-length"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "length-segmented" && segmentedPlan ? (
              `Add ${totalLength || "…"} m to cart (AED ${segmentedPlan.totalPrice.toLocaleString()})`
            ) : (
              `Add ${totalLength || "…"} m to cart`
            )}
          </Button>
        </>
      )}

      {mode === "height-restrictor" && (
        <>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            We'll auto-add 2× posts at the closest matching height and 1× top
            rail at the closest matching width.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="qb-hr-height" className="text-xs">
                Clear height (mm)
              </Label>
              <Input
                id="qb-hr-height"
                type="number"
                min="1000"
                placeholder="e.g. 3000"
                value={clearHeight}
                onChange={(e) => setClearHeight(e.target.value)}
                data-testid="input-qb-hr-height"
              />
            </div>
            <div>
              <Label htmlFor="qb-hr-width" className="text-xs">
                Clear width (mm)
              </Label>
              <Input
                id="qb-hr-width"
                type="number"
                min="1000"
                placeholder="e.g. 4000"
                value={clearWidth}
                onChange={(e) => setClearWidth(e.target.value)}
                data-testid="input-qb-hr-width"
              />
            </div>
          </div>
          <Button
            onClick={addHeightRestrictorKit}
            disabled={submitting || !clearHeight || !clearWidth}
            className="w-full bg-[#FFC72C] text-black hover:bg-[#FFB700] font-semibold"
            data-testid="button-qb-add-hr-kit"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Add kit to cart (2 posts + 1 rail)"
            )}
          </Button>
        </>
      )}

      {mode === "swing-gate" && (
        <>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            We'll auto-add 1× self-close gate at the closest matching width and
            1× post.
          </p>
          <div>
            <Label htmlFor="qb-sg-width" className="text-xs">
              Opening width (mm)
            </Label>
            <Input
              id="qb-sg-width"
              type="number"
              min="500"
              placeholder="e.g. 1000"
              value={clearWidth}
              onChange={(e) => setClearWidth(e.target.value)}
              data-testid="input-qb-sg-width"
            />
          </div>
          <Button
            onClick={addSwingGateKit}
            disabled={submitting || !clearWidth}
            className="w-full bg-[#FFC72C] text-black hover:bg-[#FFB700] font-semibold"
            data-testid="button-qb-add-sg-kit"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Add kit to cart (1 gate + 1 post)"
            )}
          </Button>
        </>
      )}
    </div>
  );
}
