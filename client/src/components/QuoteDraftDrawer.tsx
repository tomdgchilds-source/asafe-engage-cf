// ────────────────────────────────────────────────────────────────────────────
// client/src/components/QuoteDraftDrawer.tsx
//
// Slide-over drawer for the Quoting AI assistant. Renders the response from
// POST /api/quote/draft as a clean spec-sheet layout: per-zone, per-line-item,
// totals at bottom, PDF preview iframe on the right.
//
// Used by the Site Survey, Solution Finder, and Project detail pages — all
// three surfaces invoke a "Generate Quote Draft" CTA, then mount this drawer
// with the response. Promote-to-Cart hands off to the existing /api/cart/bulk-
// add → /api/orders flow without touching that surface.
//
// Wording: matches σ — "PAS 13 aligned" / "borderline" / "not aligned".
// "DRAFT — for rep review" banner non-removable at the top of the drawer.
// ────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, ShoppingCart, FileText, AlertTriangle } from "lucide-react";

export interface QuoteDraftPayload {
  quoteId: string;
  customerCompany?: string | null;
  projectName?: string | null;
  projectLocation?: string | null;
  zones: Array<{
    name: string;
    designVehicle: {
      name: string;
      massKg: number;
      speedKmh: number;
      pas13Class: string;
    } | null;
    selectedOption: {
      productId: string;
      productName: string;
      recommendedVariantSku: string | null;
      quantityOrLengthMeters: number;
      pricingMode: "per_length" | "per_unit";
      unitPriceAed: number;
      estimatedAedTotal: number;
      pas13Verdict: {
        verdict: "aligned" | "borderline" | "not_aligned";
        details: { safetyMarginPct: number };
      };
      rationale: string;
    } | null;
    alternativesConsidered: number;
    rationale: string;
  }>;
  lineItems: Array<{
    productId: string;
    productName: string;
    sku: string | null;
    quantityOrLengthMeters: number;
    pricingMode: "per_length" | "per_unit";
    unitPriceAed: number;
    extendedAed: number;
    priceMissing?: boolean;
  }>;
  totals: {
    subtotalAed: number;
    serviceCareAed?: number;
    serviceCareLabel?: string;
    vatAed?: number;
    vatPct?: number;
    grandTotalAed: number;
  };
  aggregatePas13Verdict: "aligned" | "borderline" | "not_aligned";
  notes: string;
  pdfUrl: string;
  createdAt: string;
  draftStatus: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: QuoteDraftPayload | null;
  isGenerating?: boolean;
}

const VERDICT_LABEL = {
  aligned: "PAS 13 aligned",
  borderline: "Borderline alignment",
  not_aligned: "Not PAS 13 aligned",
} as const;

const VERDICT_BG = {
  aligned: "bg-green-700 text-white",
  borderline: "bg-amber-600 text-white",
  not_aligned: "bg-red-700 text-white",
} as const;

export function QuoteDraftDrawer({ open, onOpenChange, draft, isGenerating }: Props) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [promoting, setPromoting] = useState(false);

  // Group line items into priced + price-missing for the spec-sheet display.
  const priced = useMemo(
    () => (draft?.lineItems ?? []).filter((li) => !li.priceMissing),
    [draft],
  );
  const priceMissing = useMemo(
    () => (draft?.lineItems ?? []).filter((li) => !!li.priceMissing),
    [draft],
  );

  const handleDownload = () => {
    if (!draft) return;
    window.open(draft.pdfUrl, "_blank");
  };

  const handlePromote = async () => {
    if (!draft) return;
    setPromoting(true);
    try {
      const res = await fetch(`/api/quote/${draft.quoteId}/promote-to-cart`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`promote ${res.status}`);
      const promotePayload = await res.json();
      const items = promotePayload.items as any[];
      const projectInfo = promotePayload.projectInfo as any;

      const bulkRes = await fetch("/api/cart/bulk-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items,
          projectInfo,
          autoSaveExisting: true,
        }),
      });
      if (!bulkRes.ok) throw new Error(`bulk-add ${bulkRes.status}`);
      toast({
        title: "Cart loaded",
        description: `${items.length} item${items.length === 1 ? "" : "s"} added to cart from the quote draft.`,
      });
      onOpenChange(false);
      setLocation("/cart");
    } catch (err) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Promote failed",
        description: "Could not load this quote into the cart. Try again.",
      });
    } finally {
      setPromoting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl md:max-w-5xl overflow-y-auto"
        data-testid="quote-draft-drawer"
      >
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>Quote Draft</SheetTitle>
            {draft && (
              <Badge
                className={VERDICT_BG[draft.aggregatePas13Verdict]}
                data-testid="quote-draft-aggregate-verdict"
              >
                {VERDICT_LABEL[draft.aggregatePas13Verdict]}
              </Badge>
            )}
          </div>
          <SheetDescription>
            Composed from the recommendation engine — review, edit, then download or
            promote to an order.
          </SheetDescription>
        </SheetHeader>

        {/* Non-removable DRAFT banner */}
        <div className="mt-3 rounded-md bg-red-700 px-4 py-2 text-sm font-bold text-white">
          QUOTE DRAFT — FOR REP REVIEW (NOT A FINAL INVOICE OR CONTRACT)
        </div>

        {isGenerating && (
          <div className="flex h-72 items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Composing quote draft…
            </div>
          </div>
        )}

        {!isGenerating && draft && (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Left: spec-sheet */}
            <div className="space-y-4 text-sm">
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="font-semibold">{draft.customerCompany ?? "—"}</div>
                <div className="text-muted-foreground">
                  {draft.projectName ?? "—"}
                  {draft.projectLocation ? ` · ${draft.projectLocation}` : ""}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Quote ID: <code className="font-mono">{draft.quoteId}</code>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Per-zone recommendations
                </h3>
                <div className="space-y-2">
                  {draft.zones.map((z, idx) => {
                    const v: "aligned" | "borderline" | "not_aligned" =
                      z.selectedOption?.pas13Verdict.verdict ?? "not_aligned";
                    return (
                      <div
                        key={idx}
                        className="rounded-md border p-2"
                        data-testid={`quote-zone-${idx}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium">{z.name}</div>
                          <Badge className={VERDICT_BG[v]}>
                            {VERDICT_LABEL[v]}
                          </Badge>
                        </div>
                        {z.designVehicle && (
                          <div className="text-xs text-muted-foreground">
                            {z.designVehicle.name} ·{" "}
                            {z.designVehicle.massKg.toLocaleString()} kg @{" "}
                            {z.designVehicle.speedKmh.toFixed(1)} km/h (
                            {z.designVehicle.pas13Class})
                          </div>
                        )}
                        {z.selectedOption ? (
                          <div className="mt-1 text-xs">
                            <div className="font-medium">
                              {z.selectedOption.productName}
                            </div>
                            <div className="text-muted-foreground">
                              {z.selectedOption.pricingMode === "per_length"
                                ? `${z.selectedOption.quantityOrLengthMeters.toFixed(1)} m`
                                : `× ${z.selectedOption.quantityOrLengthMeters}`}{" "}
                              @ AED {z.selectedOption.unitPriceAed.toLocaleString()} ={" "}
                              <span className="font-bold">
                                AED {z.selectedOption.estimatedAedTotal.toLocaleString()}
                              </span>
                            </div>
                            <div className="text-muted-foreground">
                              {z.selectedOption.pas13Verdict.details.safetyMarginPct.toFixed(1)}
                              % safety margin · {z.alternativesConsidered} option
                              {z.alternativesConsidered === 1 ? "" : "s"} considered
                            </div>
                          </div>
                        ) : (
                          <div className="mt-1 text-xs text-amber-700">
                            <AlertTriangle className="mr-1 inline h-3 w-3" />
                            No PAS-13-aligned product matched this zone — verify with
                            engineering.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Line items
                </h3>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1 font-medium">SKU</th>
                      <th className="py-1 font-medium">Product</th>
                      <th className="py-1 text-right font-medium">Qty/m</th>
                      <th className="py-1 text-right font-medium">Unit (AED)</th>
                      <th className="py-1 text-right font-medium">Ext. (AED)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priced.map((li, i) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="py-1 font-mono text-[11px]">
                          {li.sku ?? "—"}
                        </td>
                        <td className="py-1">{li.productName}</td>
                        <td className="py-1 text-right">
                          {li.pricingMode === "per_length"
                            ? `${li.quantityOrLengthMeters.toFixed(1)} m`
                            : `× ${li.quantityOrLengthMeters}`}
                        </td>
                        <td className="py-1 text-right">
                          {li.unitPriceAed.toLocaleString()}
                        </td>
                        <td className="py-1 text-right font-bold">
                          {li.extendedAed.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {priceMissing.map((li, i) => (
                      <tr
                        key={`pm-${i}`}
                        className="border-b last:border-b-0 bg-amber-50"
                      >
                        <td className="py-1 font-mono text-[11px]">
                          {li.sku ?? "—"}
                        </td>
                        <td className="py-1">{li.productName}</td>
                        <td className="py-1 text-right">
                          {li.pricingMode === "per_length"
                            ? `${li.quantityOrLengthMeters.toFixed(1)} m`
                            : `× ${li.quantityOrLengthMeters}`}
                        </td>
                        <td className="py-1 text-right">—</td>
                        <td className="py-1 text-right font-bold text-amber-700">
                          Contact A-SAFE
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>AED {draft.totals.subtotalAed.toLocaleString()}</span>
                </div>
                {draft.totals.serviceCareAed != null &&
                  draft.totals.serviceCareAed > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {draft.totals.serviceCareLabel ?? "Service Care"}
                      </span>
                      <span>
                        AED {draft.totals.serviceCareAed.toLocaleString()}
                      </span>
                    </div>
                  )}
                {draft.totals.vatAed != null && draft.totals.vatAed > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      VAT ({(draft.totals.vatPct ?? 0).toFixed(0)}%)
                    </span>
                    <span>AED {draft.totals.vatAed.toLocaleString()}</span>
                  </div>
                )}
                <div className="mt-1 flex justify-between border-t pt-1 text-base font-bold">
                  <span>Grand total</span>
                  <span>AED {draft.totals.grandTotalAed.toLocaleString()}</span>
                </div>
              </div>

              {draft.notes && (
                <div className="rounded-md border bg-yellow-50 p-3 text-xs">
                  <div className="font-semibold">Summary</div>
                  <div className="mt-1 whitespace-pre-wrap">{draft.notes}</div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 pb-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownload}
                  data-testid="button-quote-download-pdf"
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Download PDF
                </Button>
                <Button
                  size="sm"
                  className="bg-[#FFC72C] text-black hover:bg-[#F0B800]"
                  onClick={handlePromote}
                  disabled={promoting || priced.length === 0}
                  data-testid="button-quote-promote-to-order"
                >
                  {promoting ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ShoppingCart className="mr-1 h-3.5 w-3.5" />
                  )}
                  Add all to cart and submit order
                </Button>
              </div>
            </div>

            {/* Right: PDF preview */}
            <div className="hidden md:block">
              <div className="sticky top-4 h-[calc(100vh-8rem)] rounded-md border bg-muted/40">
                <div className="flex items-center justify-between border-b px-3 py-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    PDF preview
                  </span>
                  <a
                    href={draft.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 underline"
                  >
                    Open in new tab
                  </a>
                </div>
                <iframe
                  src={draft.pdfUrl}
                  className="h-[calc(100%-2rem)] w-full"
                  title="Quote draft PDF preview"
                />
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
