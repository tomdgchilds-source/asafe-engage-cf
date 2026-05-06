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

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { ChevronDown, ChevronUp, Wrench, Copy, CheckCircle2 } from "lucide-react";
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
}

export function AccessoryPicker({
  itemId,
  category,
  productName,
  initialValue,
}: AccessoryPickerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
      await Promise.all(
        targets.map((t) =>
          apiRequest("/api/cart/items", "PATCH", {
            id: t.id,
            accessories: value,
          })
        )
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

  const isConfigured = hasAnyAccessories(value);

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
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          )}
        </button>

        {expanded && (
          <div className="px-3 pb-3 pt-1 grid grid-cols-1 md:grid-cols-2 gap-3">
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
                {updateMutation.isPending ? (
                  <span>Saving…</span>
                ) : updateMutation.isSuccess ? (
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
