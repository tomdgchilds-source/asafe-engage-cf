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

export type BuilderMode = "length" | "height-restrictor" | "swing-gate";

export function detectBuilderMode(
  product: CatalogProduct,
): BuilderMode | null {
  const n = (product.name || "").toLowerCase();
  if (/height restrictor/.test(n) && /post/.test(n)) return "height-restrictor";
  if (/swing gate/.test(n) && /self-close/.test(n)) return "swing-gate";
  if (product.pricingLogic === "per_length") return "length";
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

  // Optimal SKU-mix suggestion for the entered total length. Greedy: use the
  // longest available variant until we can't, then step down. Keeps the UX
  // transparent ("we'll supply 3× 2400mm + 1× 1600mm runs") without locking
  // the rep in — they can always revise in-cart.
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
        {mode === "length" ? (
          <Ruler className="h-4 w-4 text-yellow-700" />
        ) : (
          <Wrench className="h-4 w-4 text-yellow-700" />
        )}
        <span className="text-sm font-bold text-yellow-900 dark:text-yellow-200">
          {mode === "length"
            ? "Quote by total length"
            : mode === "height-restrictor"
              ? "Build Height Restrictor kit"
              : "Build Swing Gate kit"}
        </span>
        <Badge className="bg-[#FFC72C] text-black text-[10px]">Recommended</Badge>
      </div>

      {mode === "length" && (
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
            {perMeterRate > 0 && (
              <div className="text-right text-xs text-gray-600 dark:text-gray-400">
                <div>Linear metre rate</div>
                <div className="text-base font-bold text-gray-900 dark:text-white">
                  AED {perMeterRate.toLocaleString()}/m
                </div>
              </div>
            )}
          </div>
          {mix && (
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
          <Button
            onClick={addTotalLengthLine}
            disabled={submitting || !totalLength || perMeterRate <= 0}
            className="w-full bg-[#FFC72C] text-black hover:bg-[#FFB700] font-semibold"
            data-testid="button-qb-add-length"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
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
