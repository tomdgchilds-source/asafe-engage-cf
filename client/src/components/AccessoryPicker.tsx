// ═══════════════════════════════════════════════════════════════════
// AccessoryPicker
// ═══════════════════════════════════════════════════════════════════
// Per-line cart-item picker for the structured "what extras does
// installation need?" data: floor type, fixings, dock buffers, steel /
// weld plates, L-brackets, bollard caps, height extension, free-text
// notes. Vocabulary lives in shared/cartAccessories.ts so the option
// keys, labels, and PDF rendering all stay in sync.
//
// Default collapsed; reps expand to fill in. Persists on every change
// (debounced) via PATCH /api/cart/items, alongside the existing cart
// quantity / image edits.
//
// "Apply to all matching" copies the current line's accessories to
// every other cart line in the same product category — useful when an
// entire dock area shares the SS bolt + tile-floor combo.
//
// Priced accessories (Oct 2026): on top of the structured fields, the
// picker lists the price-list accessories that apply to this product
// (GET /api/accessory-prices) with their indicative price, a quantity
// stepper and a running subtotal. Selections persist as
// `accessoryLines` via PATCH /api/cart/:id/accessories; the server
// expands them into extra pricing lines so the cart totals pick them
// up without a second accessory total here.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronUp, Wrench, Copy, CheckCircle2, Minus, Plus, Tag } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import {
  type AccessoryLine,
  type AccessoryPriceOption,
  type CartLineContext,
  type DraftAccessoryLine,
  accessoriesSubtotal,
  accessoryLineFromOption,
  applicableAccessoryOptions,
  effectiveAccessoryQuantity,
  formatAccessoryPrice,
  formatAed,
  savableAccessoryLines,
  unitNoun,
  unitSuffix,
} from "@/lib/customItems";
import {
  type CartAccessories,
  type DockBufferType,
  type FixingsType,
  type FloorType,
  defaultAccessories,
  hasAnyAccessories,
  FLOOR_TYPE_OPTIONS,
  FIXINGS_OPTIONS,
  DOCK_BUFFER_OPTIONS,
} from "@shared/cartAccessories";

interface AccessoryPickerProps {
  // The cart item this picker is attached to.
  itemId: string;
  // Product category used for the "Apply to all matching" affordance.
  // Falls back to product name when category is missing so the button
  // still does something sensible.
  category?: string | null;
  productName: string;
  // Stored accessories blob from the cart row (jsonb). Always shaped
  // like CartAccessories — the server may persist `null` when the rep
  // clears every field.
  initialValue: CartAccessories | null | undefined;
  // Priced accessory selections stored on the cart row (jsonb, may be
  // null). Each line mirrors a price-list option plus a quantity.
  accessoryLines?: AccessoryLine[] | null;
  // Quantity / pricing type of the parent line, used to pre-fill per_post
  // and per_metre quantities with the same formula the server applies.
  lineContext?: CartLineContext;
}

/** Small amber "TBC" chip shown wherever a selected accessory has no price. */
export function TbcChip({ className = "", testId }: { className?: string; testId?: string }) {
  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-700 ${className}`}
      title="At least one accessory price is to be confirmed by estimation"
      data-testid={testId}
    >
      TBC
    </Badge>
  );
}

export function AccessoryPicker({
  itemId,
  category,
  productName,
  initialValue,
  accessoryLines,
  lineContext,
}: AccessoryPickerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { formatPrice, selectedCurrency } = useCurrency();
  // Indicative accessory prices are AED to 2 dp; other display currencies
  // go through the shared converter like every other figure in the app.
  const money = (aed: number) => (selectedCurrency === "AED" ? formatAed(aed) : formatPrice(aed));
  const ctx: CartLineContext = lineContext ?? {};

  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState<CartAccessories>(() => ({
    ...defaultAccessories(),
    ...(initialValue || {}),
  }));

  // Keep local state in sync if the parent re-fetches (e.g. after the
  // "Apply to all matching" button updates this row from elsewhere).
  // Compare by reference + by stringified shape so a no-op refresh
  // doesn't fight the user's typing.
  const lastSyncedRef = useRef<string>(JSON.stringify(initialValue || {}));
  useEffect(() => {
    const incoming = JSON.stringify(initialValue || {});
    if (incoming !== lastSyncedRef.current) {
      lastSyncedRef.current = incoming;
      setValue({ ...defaultAccessories(), ...(initialValue || {}) });
    }
  }, [initialValue]);

  // Debounced PATCH. Mirrors the cart-project-info auto-save pattern
  // in Cart.tsx — 500ms debounce so dropdowns/typing don't hammer the
  // worker.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateMutation = useMutation({
    mutationFn: async (next: CartAccessories) => {
      return apiRequest("/api/cart/items", "PATCH", {
        id: itemId,
        accessories: next,
      });
    },
    onSuccess: () => {
      // Invalidate the cart query so other views refresh.
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error: any) => {
      console.error("Failed to save accessories:", error);
      toast({
        title: "Couldn't save accessory selection",
        description: error?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const queueSave = (next: CartAccessories) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateMutation.mutate(next);
      debounceRef.current = null;
    }, 500);
  };

  // Cleanup the debounce timer on unmount so a save isn't fired into a
  // dead component.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Priced accessories ───────────────────────────────────────────────
  // Price list from the Worker. A failed fetch (endpoint not deployed
  // yet, network) just hides the priced section — the structured fields
  // below keep working.
  const pricesQuery = useQuery<{ items: AccessoryPriceOption[] }>({
    queryKey: ["/api/accessory-prices"],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const options = useMemo(
    () =>
      applicableAccessoryOptions(pricesQuery.data?.items, {
        productName,
        category,
        accessoryLines,
      }),
    [pricesQuery.data, productName, category, accessoryLines],
  );

  const [lines, setLines] = useState<DraftAccessoryLine[]>(() => accessoryLines ?? []);
  const lastLinesRef = useRef<string>(JSON.stringify(accessoryLines ?? []));
  const linesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linesMutation = useMutation({
    mutationFn: async (next: DraftAccessoryLine[]) => {
      // The server re-prices every code against the live list and rejects
      // retired ones, so those are dropped from the body here.
      return apiRequest(`/api/cart/${itemId}/accessories`, "PATCH", {
        accessoryLines: savableAccessoryLines(next, pricesQuery.data?.items),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't save accessory prices",
        description: error?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });
  const queueLinesSave = (next: DraftAccessoryLine[]) => {
    if (linesDebounceRef.current) clearTimeout(linesDebounceRef.current);
    linesDebounceRef.current = setTimeout(() => {
      linesMutation.mutate(next);
      linesDebounceRef.current = null;
    }, 500);
  };
  useEffect(() => {
    return () => {
      if (linesDebounceRef.current) clearTimeout(linesDebounceRef.current);
    };
  }, []);

  // Sync from the server copy — but never while an edit is still queued or
  // in flight. Without this guard, toggling an accessory and then pressing
  // "+" straight after lost the "+": the first PATCH's cart refetch arrived
  // with quantity 6 and overwrote the local 7 before the second PATCH ran.
  useEffect(() => {
    const incoming = JSON.stringify(accessoryLines ?? []);
    if (incoming === lastLinesRef.current) return;
    if (linesDebounceRef.current || linesMutation.isPending) return;
    lastLinesRef.current = incoming;
    setLines(accessoryLines ?? []);
  }, [accessoryLines, linesMutation.isPending]);

  const setLinesAndSave = (next: DraftAccessoryLine[]) => {
    setLines(next);
    queueLinesSave(next);
  };
  const toggleOption = (option: AccessoryPriceOption, on: boolean) => {
    if (on) {
      if (lines.some((l) => l.code === option.code)) return;
      setLinesAndSave([...lines, accessoryLineFromOption(option, ctx)]);
    } else {
      setLinesAndSave(lines.filter((l) => l.code !== option.code));
    }
  };
  const setLineQuantity = (code: string, quantity: number) => {
    const q = Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
    setLinesAndSave(lines.map((l) => (l.code === code ? { ...l, quantity: q } : l)));
  };
  const stepFor = (unit: AccessoryLine["unit"]) => (unit === "per_metre" ? 0.5 : 1);

  const subtotal = accessoriesSubtotal(lines, ctx);
  const hasPricedSection = options.length > 0;

  function patch<K extends keyof CartAccessories>(
    key: K,
    next: CartAccessories[K]
  ) {
    const merged = { ...value, [key]: next };
    setValue(merged);
    queueSave(merged);
  }

  // "Apply to all matching" — finds every other cart line whose
  // category (or product name fallback) matches this row's and PATCHes
  // accessories onto each. Server-side fan-out would be more efficient
  // but the existing endpoint shape is per-id, and there's almost
  // never more than 10 lines in a cart, so a parallel client-side
  // sweep is plenty.
  const applyAllMutation = useMutation({
    mutationFn: async () => {
      // Pull the current cart from the cache to avoid a re-fetch.
      const cart = (queryClient.getQueryData(["/api/cart"]) || []) as Array<{
        id: string;
        category?: string | null;
        productName?: string;
      }>;
      const matchKey = (category || productName || "").toString().toLowerCase();
      const targets = cart.filter((row) => {
        if (row.id === itemId) return false;
        const rowKey = (row.category || row.productName || "")
          .toString()
          .toLowerCase();
        return rowKey === matchKey;
      });
      if (targets.length === 0) return { copied: 0 };
      // Per-post quantities depend on each target's own run length, so
      // they are stripped and the server fills them per line.
      const copiedLines = savableAccessoryLines(lines, pricesQuery.data?.items).map((l) =>
        l.unit === "per_post" ? { ...l, quantity: undefined } : l,
      );
      await Promise.all(
        targets.flatMap((t) => [
          apiRequest("/api/cart/items", "PATCH", {
            id: t.id,
            accessories: value,
          }),
          ...(copiedLines.length > 0
            ? [
                apiRequest(`/api/cart/${t.id}/accessories`, "PATCH", {
                  accessoryLines: copiedLines,
                }),
              ]
            : []),
        ])
      );
      return { copied: targets.length };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: res.copied > 0 ? "Accessories copied" : "Nothing to copy",
        description:
          res.copied > 0
            ? `Applied to ${res.copied} matching line${res.copied === 1 ? "" : "s"}.`
            : `No other cart lines matched "${category || productName}".`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Couldn't apply to matching lines",
        description: error?.message || "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const isConfigured = hasAnyAccessories(value) || lines.length > 0;

  return (
    <div className="md:col-span-12">
      <div className="border rounded-lg bg-blue-50/40 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/40">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
          data-testid={`accessory-picker-toggle-${itemId}`}
          aria-expanded={expanded}
        >
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-blue-700 dark:text-blue-300" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Accessories &amp; installation details
            </span>
            {isConfigured && (
              <Badge className="bg-blue-600 hover:bg-blue-600 text-white text-[10px] uppercase tracking-wider">
                Configured
              </Badge>
            )}
            {!isConfigured && (
              <span className="text-xs text-gray-500">
                (Optional — bolts, plates, dock buffers, etc.)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {subtotal.totalAed > 0 && (
              <span
                className="text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap"
                data-testid={`accessory-subtotal-collapsed-${itemId}`}
              >
                + {money(subtotal.totalAed)}
              </span>
            )}
            {subtotal.hasTbc && <TbcChip testId={`accessory-tbc-collapsed-${itemId}`} />}
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            )}
          </div>
        </button>

        {expanded && (
          <div className="px-3 pb-3 pt-1 grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Priced accessories from the price list */}
            {hasPricedSection && (
              <div className="md:col-span-2 rounded-md border border-blue-200/70 dark:border-blue-900/40 bg-white/60 dark:bg-gray-900/30">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-100 dark:border-blue-900/30">
                  <Tag className="h-3.5 w-3.5 text-blue-700 dark:text-blue-300" />
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                    Priced accessories
                  </span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    Indicative — included in the line total
                  </span>
                </div>
                <ul className="divide-y divide-blue-100 dark:divide-blue-900/30">
                  {options.map((option) => {
                    const line = lines.find((l) => l.code === option.code);
                    const selected = !!line;
                    const qty = line ? effectiveAccessoryQuantity(line, ctx) : 0;
                    const lineTotal =
                      line && !line.priceToConfirm && line.unitPriceAed !== null
                        ? Math.round(line.unitPriceAed * qty * 100) / 100
                        : null;
                    const step = stepFor(option.unit);
                    return (
                      <li
                        key={option.code}
                        className="px-3 py-2 flex flex-col gap-1.5"
                        data-testid={`accessory-option-${itemId}-${option.code}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <label
                            htmlFor={`accessory-opt-${itemId}-${option.code}`}
                            className="flex items-start gap-2 min-w-0 cursor-pointer"
                          >
                            <Switch
                              id={`accessory-opt-${itemId}-${option.code}`}
                              checked={selected}
                              onCheckedChange={(v) => toggleOption(option, v)}
                              className="mt-0.5"
                              data-testid={`accessory-option-toggle-${itemId}-${option.code}`}
                            />
                            <span className="min-w-0">
                              <span className="block text-sm text-gray-800 dark:text-gray-200 leading-tight">
                                {option.label}
                                {!option.active && (
                                  <span className="ml-1 text-[10px] uppercase text-gray-400" title="No longer on the price list; removed from this line on the next save">
                                    retired
                                  </span>
                                )}
                              </span>
                              <span
                                className="block text-xs text-gray-500 dark:text-gray-400"
                                data-testid={`accessory-option-price-${itemId}-${option.code}`}
                              >
                                {option.priceToConfirm || option.priceAed === null || selectedCurrency === "AED"
                                  ? formatAccessoryPrice(option)
                                  : `${formatPrice(option.priceAed)} ${unitSuffix(option.unit)}`}
                                {option.sku ? ` · ${option.sku}` : ""}
                              </span>
                            </span>
                          </label>
                          {selected && (
                            <span className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap shrink-0">
                              {lineTotal === null ? (
                                <TbcChip testId={`accessory-line-tbc-${itemId}-${option.code}`} />
                              ) : (
                                <span data-testid={`accessory-line-total-${itemId}-${option.code}`}>
                                  {money(lineTotal)}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                        {selected && (
                          <div className="flex items-center gap-1.5 pl-11">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => setLineQuantity(option.code, Math.max(0, qty - step))}
                              disabled={qty <= step}
                              aria-label="Decrease quantity"
                              data-testid={`accessory-qty-decrease-${itemId}-${option.code}`}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step={step}
                              value={qty}
                              onChange={(e) => setLineQuantity(option.code, Number(e.target.value))}
                              className="h-7 w-16 text-center text-sm"
                              data-testid={`accessory-qty-${itemId}-${option.code}`}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => setLineQuantity(option.code, qty + step)}
                              aria-label="Increase quantity"
                              data-testid={`accessory-qty-increase-${itemId}-${option.code}`}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {unitNoun(option.unit, qty)}
                              {option.unit === "per_post" && line && line.quantity === undefined
                                ? " (from run length)"
                                : ""}
                            </span>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-blue-100 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-900/10 rounded-b-md">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Accessories subtotal
                  </span>
                  <span className="flex items-center gap-2">
                    {subtotal.hasTbc && <TbcChip testId={`accessory-subtotal-tbc-${itemId}`} />}
                    <span
                      className="text-sm font-semibold text-gray-900 dark:text-white"
                      data-testid={`accessory-subtotal-${itemId}`}
                    >
                      {money(subtotal.totalAed)}
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* Floor type */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Floor type
              </Label>
              <Select
                value={value.floorType ?? ""}
                onValueChange={(v) =>
                  patch("floorType", (v || undefined) as FloorType | undefined)
                }
              >
                <SelectTrigger
                  className="h-9 text-sm"
                  data-testid={`accessory-floor-type-${itemId}`}
                >
                  <SelectValue placeholder="Not specified" />
                </SelectTrigger>
                <SelectContent className="z-[100020]">
                  {FLOOR_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fixings */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Fixings
              </Label>
              <Select
                value={value.fixings ?? ""}
                onValueChange={(v) =>
                  patch("fixings", (v || undefined) as FixingsType | undefined)
                }
              >
                <SelectTrigger
                  className="h-9 text-sm"
                  data-testid={`accessory-fixings-${itemId}`}
                >
                  <SelectValue placeholder="Not specified" />
                </SelectTrigger>
                <SelectContent className="z-[100020]">
                  {FIXINGS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dock buffers */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Dock buffers
              </Label>
              <div className="flex gap-2">
                <Select
                  value={value.dockBuffers?.type ?? "none"}
                  onValueChange={(v) =>
                    patch("dockBuffers", {
                      type: v as DockBufferType,
                      qty: value.dockBuffers?.qty,
                    })
                  }
                >
                  <SelectTrigger
                    className="h-9 text-sm flex-1"
                    data-testid={`accessory-dock-buffers-type-${itemId}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[100020]">
                    {DOCK_BUFFER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  className="h-9 text-sm w-20"
                  placeholder="qty"
                  value={
                    value.dockBuffers?.qty === undefined ||
                    value.dockBuffers?.qty === null
                      ? ""
                      : String(value.dockBuffers.qty)
                  }
                  onChange={(e) => {
                    const raw = e.target.value;
                    const n = raw === "" ? undefined : Math.max(0, Number(raw) || 0);
                    patch("dockBuffers", {
                      type: value.dockBuffers?.type ?? "none",
                      qty: n,
                    });
                  }}
                  data-testid={`accessory-dock-buffers-qty-${itemId}`}
                  disabled={
                    !value.dockBuffers ||
                    value.dockBuffers.type === "none" ||
                    !value.dockBuffers.type
                  }
                />
              </div>
            </div>

            {/* Steel / weld plates */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Steel / weld plates (qty)
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="h-9 text-sm"
                placeholder="0"
                value={
                  value.steelPlates?.qty === undefined ||
                  value.steelPlates?.qty === null
                    ? ""
                    : String(value.steelPlates.qty)
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = raw === "" ? 0 : Math.max(0, Number(raw) || 0);
                  patch("steelPlates", n > 0 ? { qty: n } : undefined);
                }}
                data-testid={`accessory-steel-plates-${itemId}`}
              />
            </div>

            {/* L-brackets */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                L-brackets / corner brackets (qty)
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                className="h-9 text-sm"
                placeholder="0"
                value={
                  value.lBrackets?.qty === undefined ||
                  value.lBrackets?.qty === null
                    ? ""
                    : String(value.lBrackets.qty)
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = raw === "" ? 0 : Math.max(0, Number(raw) || 0);
                  patch("lBrackets", n > 0 ? { qty: n } : undefined);
                }}
                data-testid={`accessory-l-brackets-${itemId}`}
              />
            </div>

            {/* Height extension */}
            <div className="flex flex-col gap-1">
              <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Height extension above standard (mm)
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={10}
                className="h-9 text-sm"
                placeholder="0"
                value={
                  value.heightExtensionMm === undefined ||
                  value.heightExtensionMm === null
                    ? ""
                    : String(value.heightExtensionMm)
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = raw === "" ? null : Math.max(0, Number(raw) || 0);
                  patch("heightExtensionMm", n);
                }}
                data-testid={`accessory-height-extension-${itemId}`}
              />
            </div>

            {/* Bollard caps */}
            <div className="flex items-center justify-between gap-2 md:col-span-2 px-1 py-1 rounded-md hover:bg-blue-100/40 dark:hover:bg-blue-900/20">
              <Label
                htmlFor={`accessory-bollard-caps-${itemId}`}
                className="text-xs font-medium text-gray-700 dark:text-gray-300"
              >
                Bollard caps required
              </Label>
              <Switch
                id={`accessory-bollard-caps-${itemId}`}
                checked={!!value.bollardCaps}
                onCheckedChange={(v) => patch("bollardCaps", v)}
                data-testid={`accessory-bollard-caps-${itemId}`}
              />
            </div>

            {/* Other accessories — free text */}
            <div className="flex flex-col gap-1 md:col-span-2">
              <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Other accessories
              </Label>
              <Input
                type="text"
                className="h-9 text-sm"
                placeholder="e.g. food-grade boards, custom buffer pads"
                value={value.other ?? ""}
                onChange={(e) => patch("other", e.target.value)}
                data-testid={`accessory-other-${itemId}`}
              />
            </div>

            {/* Notes — free text */}
            <div className="flex flex-col gap-1 md:col-span-2">
              <Label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Line notes for installation team
              </Label>
              <Textarea
                rows={2}
                className="text-sm"
                placeholder="Anything specific to this line that the install crew should know."
                value={value.notes ?? ""}
                onChange={(e) => patch("notes", e.target.value)}
                data-testid={`accessory-notes-${itemId}`}
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 md:col-span-2 pt-1">
              <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                {updateMutation.isPending || linesMutation.isPending ? (
                  <span>Saving…</span>
                ) : updateMutation.isSuccess || linesMutation.isSuccess ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    <span>Saved</span>
                  </>
                ) : (
                  <span>Auto-saves as you type.</span>
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => applyAllMutation.mutate()}
                disabled={applyAllMutation.isPending || !isConfigured}
                data-testid={`accessory-apply-all-${itemId}`}
              >
                <Copy className="h-3 w-3 mr-1" />
                Apply to all matching
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
