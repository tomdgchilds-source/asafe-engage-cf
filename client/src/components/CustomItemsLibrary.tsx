// ═══════════════════════════════════════════════════════════════════
// CustomItemsLibrary
// ═══════════════════════════════════════════════════════════════════
// The rep's saved custom line items (GET /api/custom-items): things the
// price list doesn't carry but the same rep quotes again and again —
// crane hire, a bespoke ramp, a site-survey day. Each row can be added
// straight to the cart with a quantity (POST /api/cart/custom), opened
// in the form to tweak first (`onEdit`), or deleted.
//
// Rendered inside CustomItemDialog's "My library" tab; kept separate so
// it can be reused elsewhere (e.g. a quote builder) without the form.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/contexts/CurrencyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { BookmarkPlus, Pencil, ShoppingCart, Trash2 } from "lucide-react";
import {
  type SavedCustomItem,
  CUSTOM_CATEGORY_OPTIONS,
  PRICING_BASIS_LABELS,
  formatAed,
  parseNumberInput,
  savedItemToCartPayload,
} from "@/lib/customItems";

interface CustomItemsLibraryProps {
  /** Called after an item lands in the cart (dialog closes itself). */
  onAdded?: (item: SavedCustomItem) => void;
  /** Open the item in the form to adjust before adding. */
  onEdit?: (item: SavedCustomItem) => void;
}

function categoryLabel(value: SavedCustomItem["customCategory"]): string {
  return CUSTOM_CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function CustomItemsLibrary({ onAdded, onEdit }: CustomItemsLibraryProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatPrice, selectedCurrency } = useCurrency();
  const money = (aed: number) => (selectedCurrency === "AED" ? formatAed(aed) : formatPrice(aed));

  const [qtyById, setQtyById] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<SavedCustomItem | null>(null);

  const libraryQuery = useQuery<{ items: SavedCustomItem[] }>({
    queryKey: ["/api/custom-items"],
    staleTime: 60_000,
  });
  const items = libraryQuery.data?.items ?? [];

  const addMutation = useMutation({
    mutationFn: async (item: SavedCustomItem) => {
      const qty = parseNumberInput(qtyById[item.id] ?? "1");
      const res = await apiRequest(
        "/api/cart/custom",
        "POST",
        savedItemToCartPayload(item, Number.isFinite(qty) ? qty : 1),
      );
      return { item, body: await res.json().catch(() => null) };
    },
    onSuccess: ({ item }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      // useCount changes server-side.
      queryClient.invalidateQueries({ queryKey: ["/api/custom-items"] });
      toast({ title: "Added to cart", description: item.productName });
      onAdded?.(item);
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't add to cart",
        description: error?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (item: SavedCustomItem) => {
      await apiRequest(`/api/custom-items/${encodeURIComponent(item.id)}`, "DELETE");
      return item;
    },
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-items"] });
      toast({ title: "Removed from your library", description: item.productName });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't delete",
        description: error?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  if (libraryQuery.isLoading) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center" data-testid="custom-library-loading">
        Loading your library…
      </p>
    );
  }

  if (libraryQuery.error) {
    return (
      <p className="text-sm text-destructive py-8 text-center" data-testid="custom-library-error">
        Couldn't load your library: {(libraryQuery.error as Error).message}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className="text-center py-8 px-4 text-sm text-muted-foreground border border-dashed rounded-lg"
        data-testid="custom-library-empty"
      >
        <BookmarkPlus className="h-6 w-6 mx-auto mb-2 text-gray-400" />
        Nothing saved yet. Tick <strong>Save to my library</strong> on a new custom item and it will
        appear here for next time.
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="custom-library">
      {items.map((item) => {
        const isMetre = item.pricingType === "linear_meter";
        const qtyText = qtyById[item.id] ?? "1";
        return (
          <div
            key={item.id}
            className="border rounded-lg p-3 flex flex-col gap-2 bg-white dark:bg-gray-900"
            data-testid={`custom-library-item-${item.id}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white leading-tight break-words">
                  {item.productName}
                </p>
                {item.description && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{item.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {categoryLabel(item.customCategory)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {PRICING_BASIS_LABELS[item.pricingBasis] ?? item.pricingBasis}
                  </Badge>
                  {item.useCount > 0 && (
                    <span className="text-[10px] text-gray-400">used {item.useCount}×</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                  {money(Number(item.unitPriceAed) || 0)}
                </p>
                <p className="text-[11px] text-gray-500">{isMetre ? "per metre" : "per item"}</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <label htmlFor={`custom-library-qty-${item.id}`} className="text-xs text-gray-600 dark:text-gray-400">
                  {isMetre ? "Metres" : "Qty"}
                </label>
                <Input
                  id={`custom-library-qty-${item.id}`}
                  type="number"
                  inputMode="decimal"
                  min={isMetre ? 0.1 : 1}
                  step={isMetre ? 0.1 : 1}
                  value={qtyText}
                  onChange={(e) => setQtyById((m) => ({ ...m, [item.id]: e.target.value }))}
                  className="h-8 w-20 text-sm text-center"
                  data-testid={`custom-library-qty-${item.id}`}
                />
              </div>
              <div className="flex items-center gap-1">
                {onEdit && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => onEdit(item)}
                    title="Edit before adding"
                    data-testid={`custom-library-edit-${item.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setPendingDelete(item)}
                  disabled={deleteMutation.isPending}
                  title="Delete from library"
                  data-testid={`custom-library-delete-${item.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => addMutation.mutate(item)}
                  disabled={addMutation.isPending}
                  data-testid={`custom-library-add-${item.id}`}
                >
                  <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                  Add to cart
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      <ConfirmationDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete from your library?"
        description={
          pendingDelete
            ? `"${pendingDelete.productName}" will be removed from your saved items. Cart lines already added are not affected.`
            : ""
        }
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
