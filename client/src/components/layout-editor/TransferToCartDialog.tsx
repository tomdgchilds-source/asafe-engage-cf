/**
 * client/src/components/layout-editor/TransferToCartDialog.tsx
 *
 * Confirm table built from `deriveQuantities` (per product: metres for
 * linear items, pieces for stamps), then POST /api/cart/bulk-add with
 * `toCartItems`. `autoSaveExisting: false` so the current cart is
 * appended to, never swept into a draft.
 */

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LayoutDoc } from "@shared/layout/doc";
import { deriveQuantities, toCartItems, type CatalogProductLike } from "@shared/layout/quantities";
import { getFamily } from "@shared/layout/symbols";
import { FamilySwatch } from "./Legend";

export interface TransferToCartDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  doc: LayoutDoc;
  catalog: readonly CatalogProductLike[];
  applicationArea?: string;
  /** Number of error-severity guardrail violations (shown as a caution, not a gate). */
  errorCount?: number;
}

export function TransferToCartDialog({ open, onOpenChange, doc, catalog, applicationArea, errorCount = 0 }: TransferToCartDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => deriveQuantities(doc, catalog as CatalogProductLike[]), [doc, catalog]);
  const items = useMemo(() => toCartItems(summary, { applicationArea }), [summary, applicationArea]);

  const transfer = async () => {
    if (items.length === 0) return;
    setBusy(true);
    try {
      const res = await apiRequest("/api/cart/bulk-add", "POST", { items, autoSaveExisting: false });
      const body = (await res.json()) as { itemsAdded?: number; skipped?: string[] };
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      const skipped = body.skipped?.length ?? 0;
      toast({
        title: `${body.itemsAdded ?? items.length} line${(body.itemsAdded ?? items.length) === 1 ? "" : "s"} added to cart`,
        description: skipped > 0 ? `${skipped} could not be priced and were skipped.` : "Quantities were taken from the drawing.",
      });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Transfer failed", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[100010] sm:max-w-lg" style={{ zIndex: 100010 }} data-testid="transfer-to-cart-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" /> Transfer to cart
          </DialogTitle>
          <DialogDescription>Quantities are derived from the drawing geometry. Review before adding.</DialogDescription>
        </DialogHeader>

        {!summary.calibrated && summary.families.some((f) => f.runs > 0) && (
          <Caution>Drawing is not calibrated — run lengths are 0 m. Set the scale first for metre quantities.</Caution>
        )}
        {summary.unassignedElements > 0 && (
          <Caution>
            {summary.unassignedElements} element{summary.unassignedElements === 1 ? "" : "s"} have no product assigned and will not be transferred.
          </Caution>
        )}
        {errorCount > 0 && <Caution>{errorCount} PAS 13 issue{errorCount === 1 ? "" : "s"} flagged as not aligned. You can still transfer; the drawing keeps the warnings.</Caution>}

        {summary.products.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">Nothing to transfer yet — assign products to runs and stamps first.</p>
        ) : (
          <div className="max-h-[50vh] overflow-auto rounded-md border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500 dark:bg-gray-800">
                <tr>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">From</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {summary.products.map((p) => (
                  <tr key={p.productId} data-testid={`transfer-row-${p.productId}`}>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <FamilySwatch familyId={p.familyId} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-gray-900 dark:text-gray-100">{p.productName}</div>
                          <div className="text-xs text-gray-500">{getFamily(p.familyId).label}</div>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                      {p.pricingType === "linear_meter" ? `${p.quantity.toFixed(2)} m` : `${p.quantity} pcs`}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-xs text-gray-500">
                      {p.elementCount} {p.pricingType === "linear_meter" ? (p.elementCount === 1 ? "run" : "runs") : p.elementCount === 1 ? "placement" : "placements"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="h-11">
            Cancel
          </Button>
          <Button type="button" onClick={transfer} disabled={busy || items.length === 0} className="h-11 bg-primary text-black hover:bg-yellow-400" data-testid="transfer-confirm">
            {busy ? "Adding…" : `Add ${items.length} line${items.length === 1 ? "" : "s"} to cart`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Caution({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}
