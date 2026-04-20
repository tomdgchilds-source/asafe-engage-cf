import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Pen, Plus, PackagePlus, ExternalLink, Check, ChevronsUpDown, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { CartItem, CartItemWithMarkings } from "../types";

/**
 * Shape of a product coming back from GET /api/products. Only a subset of the
 * fields matter here (name + category + a measurement hint) — the rest is
 * metadata we surface for context when the user picks from the dropdown.
 */
interface CatalogProduct {
  id: string;
  name: string;
  category?: string;
  subcategory?: string;
  description?: string;
  specifications?: {
    measurementType?: string; // "Length" | "Quantity" | etc.
    measurementUnit?: string; // "meters" | "feet" | "pieces"
  } | null;
}

interface ProductSidebarProps {
  showProductSelector: boolean;
  setShowProductSelector: (show: boolean) => void;
  cartItems: CartItem[];
  selectedCartItem: string;
  setSelectedCartItem: (id: string) => void;
  preSelectedProduct: string;
  setPreSelectedProduct: (id: string) => void;
  setIsInDrawMode: (mode: boolean) => void;
  getCartItemWithMarkings: (cartItemId: string) => CartItemWithMarkings | null;
  getProductColor: (cartItemId: string) => string;
  onNavigateToProducts: () => void;
  onStartDrawing: () => void;
  /**
   * Add a new product directly to cart from within the drawing tool.
   * Resolves to the new cart item so the caller can auto-select it.
   */
  onAddProductToCart?: (name: string, quantity: number) => Promise<CartItem | null>;
  toast: (opts: any) => void;
}

export function ProductSidebar({
  showProductSelector,
  setShowProductSelector,
  cartItems,
  selectedCartItem,
  setSelectedCartItem,
  preSelectedProduct,
  setPreSelectedProduct,
  setIsInDrawMode,
  getCartItemWithMarkings,
  getProductColor,
  onNavigateToProducts,
  onStartDrawing,
  onAddProductToCart,
  toast,
}: ProductSidebarProps) {
  // ── Inline "add product" state ───────────────────────────────────────
  // Instead of a free-text field, users now pick from the actual product
  // catalog via a searchable combobox. They can still type to filter or
  // fall back to a custom name as an escape hatch.
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [inlineQty, setInlineQty] = useState<string>("1");
  const [isAdding, setIsAdding] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);

  // Fetch the catalog lazily — only when the selector dialog is open.
  const { data: catalog = [], isLoading: catalogLoading } = useQuery<CatalogProduct[]>({
    queryKey: ["/api/products", "layout-drawing-picker"],
    queryFn: async () => {
      const res = await fetch("/api/products?grouped=false&pageSize=200", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed to load catalog (${res.status})`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: showProductSelector,
    staleTime: 5 * 60 * 1000, // 5 min — catalog rarely changes during a session
  });

  // Sort alphabetically by name, then group by category for a tidy dropdown.
  const groupedCatalog = useMemo(() => {
    const byCategory = new Map<string, CatalogProduct[]>();
    for (const p of catalog) {
      const cat = (p.category || "other").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(p);
    }
    for (const list of byCategory.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    // Sort categories alphabetically too.
    return Array.from(byCategory.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [catalog]);

  const selectedCatalogProduct = useMemo(
    () => catalog.find((p) => p.id === selectedCatalogId) || null,
    [catalog, selectedCatalogId]
  );

  // Reset inline form whenever the dialog re-opens.
  useEffect(() => {
    if (showProductSelector) {
      setSelectedCatalogId("");
      setCustomName("");
      setInlineQty("1");
      setIsAdding(false);
      setComboboxOpen(false);
    }
  }, [showProductSelector]);

  const handleInlineAdd = async () => {
    // Catalog selection takes priority; custom name is the fallback.
    const chosenName = selectedCatalogProduct?.name || customName.trim();
    const qty = parseInt(inlineQty, 10);

    if (!chosenName) {
      toast({
        title: "Pick a product",
        description: "Select a product from the catalog, or type a custom name.",
        variant: "destructive",
      });
      return;
    }
    if (!Number.isFinite(qty) || qty < 1) {
      toast({
        title: "Invalid quantity",
        description: "Quantity must be 1 or greater.",
        variant: "destructive",
      });
      return;
    }
    if (!onAddProductToCart) {
      toast({
        title: "Not available",
        description: "Add-to-cart from the drawing tool isn't wired up.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsAdding(true);
      const newItem = await onAddProductToCart(chosenName, qty);
      if (newItem?.id) {
        setSelectedCartItem(newItem.id);
        setSelectedCatalogId("");
        setCustomName("");
        setInlineQty("1");
        toast({
          title: "Added to cart",
          description: `${chosenName} (×${qty}) is ready to draw.`,
        });
      }
    } catch {
      // Parent mutation toasts on error.
    } finally {
      setIsAdding(false);
    }
  };

  const hasCartItems = cartItems.length > 0;
  const resolvedName = selectedCatalogProduct?.name || customName.trim();
  const measurementType = selectedCatalogProduct?.specifications?.measurementType;
  const measurementUnit = selectedCatalogProduct?.specifications?.measurementUnit;
  const isLengthProduct = measurementType?.toLowerCase() === "length";

  return (
    <Dialog
      open={showProductSelector}
      onOpenChange={(open) => {
        setShowProductSelector(open);
        if (!open && !preSelectedProduct) {
          setSelectedCartItem("");
          setIsInDrawMode(false);
        }
      }}
    >
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-md mx-4 sm:mx-auto z-[100010] max-h-[90vh] overflow-y-auto"
        aria-describedby="product-selector-description"
        style={{ zIndex: 100010 }}
      >
        <DialogHeader>
          <DialogTitle>Select product for drawing</DialogTitle>
          <DialogDescription id="product-selector-description" className="sr-only">
            Pick a product from your cart, or search the full catalog to add a new product — it'll be added to the cart and auto-selected for drawing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instructions */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 border rounded-lg p-3">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              {hasCartItems ? (
                <>Pick an existing cart item <strong>or</strong> search the catalog below — lines will be colour-coded and numbered.</>
              ) : (
                <><strong>No items in cart yet.</strong> Search the product catalog below to add a product and start drawing.</>
              )}
            </p>
          </div>

          {/* ── Existing cart item selector ───────────────────────── */}
          {hasCartItems && (
            <div className="space-y-2">
              <Label htmlFor="product-select">Select product from cart</Label>
              <Select value={selectedCartItem} onValueChange={setSelectedCartItem}>
                <SelectTrigger className="w-full" data-testid="select-cart-product">
                  <SelectValue placeholder="Choose product…">
                    {selectedCartItem && (() => {
                      const item = cartItems.find((i) => i.id === selectedCartItem);
                      if (item) {
                        const displayName = item.productName.length > 40
                          ? item.productName.substring(0, 37) + '…'
                          : item.productName;
                        return displayName;
                      }
                      return "Choose product…";
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-w-[350px]">
                  {cartItems.map((item) => {
                    const itemWithMarkings = getCartItemWithMarkings(item.id);
                    const displayName = item.productName.length > 45
                      ? item.productName.substring(0, 42) + '…'
                      : item.productName;
                    return (
                      <SelectItem key={item.id} value={item.id}>
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="truncate flex-1" title={item.productName}>
                            {displayName}
                          </span>
                          <Badge
                            variant={itemWithMarkings?.isOverMarked ? "destructive" : itemWithMarkings?.isFullyMarked ? "default" : "secondary"}
                            className="text-xs flex-shrink-0"
                          >
                            {itemWithMarkings?.markedCount || 0}/{item.quantity}
                          </Badge>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Catalog-backed inline add-to-cart form ────────────── */}
          <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <PackagePlus className="h-4 w-4 text-primary" />
              <Label className="text-sm font-semibold">
                {hasCartItems ? "Or add a new product from the catalog" : "Add a product from the catalog"}
              </Label>
            </div>

            {/* Searchable catalog combobox */}
            <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboboxOpen}
                  disabled={isAdding || catalogLoading}
                  className="w-full justify-between text-left font-normal"
                  data-testid="button-catalog-combobox"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {selectedCatalogProduct ? (
                      <span className="truncate">{selectedCatalogProduct.name}</span>
                    ) : customName ? (
                      <span className="truncate italic text-muted-foreground">
                        Custom: {customName}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {catalogLoading ? "Loading catalog…" : "Search products (type to filter)…"}
                      </span>
                    )}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="p-0 w-[--radix-popover-trigger-width] max-h-[60vh]"
                align="start"
                style={{ zIndex: 100020 }}
              >
                <Command>
                  <CommandInput
                    placeholder="Search iFlex, eFlex, Bollard, Rack End…"
                    value={customName}
                    onValueChange={(v) => {
                      setCustomName(v);
                      // Typing breaks the pairing with a catalog selection — clear it
                      // so the user knows they'll be adding a custom-named product.
                      if (selectedCatalogId) setSelectedCatalogId("");
                    }}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {customName.trim() ? (
                        <div className="p-3 text-sm">
                          <p className="text-muted-foreground mb-2">No catalog match for "{customName.trim()}".</p>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="w-full"
                            onClick={() => setComboboxOpen(false)}
                            data-testid="button-use-custom-name"
                          >
                            Use "{customName.trim()}" as a custom name
                          </Button>
                        </div>
                      ) : (
                        <div className="p-3 text-sm text-muted-foreground">No products found.</div>
                      )}
                    </CommandEmpty>
                    {groupedCatalog.map(([category, products]) => (
                      <CommandGroup key={category} heading={category}>
                        {products.map((p) => {
                          const isSelected = selectedCatalogId === p.id;
                          const mType = p.specifications?.measurementType;
                          return (
                            <CommandItem
                              key={p.id}
                              value={`${p.name} ${p.subcategory || ""} ${p.description || ""}`}
                              onSelect={() => {
                                setSelectedCatalogId(p.id);
                                setCustomName("");
                                setComboboxOpen(false);
                              }}
                              data-testid={`catalog-option-${p.id}`}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  isSelected ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="truncate font-medium">{p.name}</div>
                                {p.subcategory && (
                                  <div className="text-xs text-muted-foreground truncate">
                                    {p.subcategory.replace(/-/g, " ")}
                                    {mType ? ` · ${mType}` : ""}
                                  </div>
                                )}
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Hint about length-based measurement — only when picking a
                linear product, since drawing it on the layout is how we
                derive the total barrier length. */}
            {isLengthProduct && (
              <div className="text-[11px] bg-primary/10 border border-primary/30 text-foreground rounded px-2 py-1.5">
                <strong>{selectedCatalogProduct?.name}</strong> is priced by length.
                Set quantity to the number of separate runs you plan to draw — the
                system will auto-calculate each run's length in {measurementUnit || "metres"} after you mark the scale.
              </div>
            )}

            {/* Quantity + action row */}
            <div className="flex gap-2 items-end">
              <div className="space-y-1">
                <Label htmlFor="inline-qty" className="text-xs text-muted-foreground">
                  {isLengthProduct ? "Runs" : "Qty"}
                </Label>
                <Input
                  id="inline-qty"
                  type="number"
                  min={1}
                  step={1}
                  value={inlineQty}
                  onChange={(e) => setInlineQty(e.target.value)}
                  disabled={isAdding}
                  className="w-24"
                  data-testid="input-inline-product-qty"
                />
              </div>
              <Button
                onClick={handleInlineAdd}
                disabled={isAdding || !resolvedName}
                className="flex-1 bg-primary text-black hover:bg-yellow-400"
                size="sm"
                data-testid="button-inline-add-product"
              >
                <Plus className="h-4 w-4 mr-2" />
                {isAdding ? "Adding…" : "Add to cart & draw"}
              </Button>
            </div>

            <button
              type="button"
              onClick={onNavigateToProducts}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline flex items-center gap-1"
              data-testid="link-browse-catalog"
            >
              <ExternalLink className="h-3 w-3" />
              Or browse the full product catalog (leaves drawing)
            </button>
          </div>

          {/* Show selected product color preview */}
          {selectedCartItem && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div
                className="w-8 h-8 rounded-full flex-shrink-0 border-2 border-white shadow"
                style={{ backgroundColor: getProductColor(selectedCartItem) }}
              />
              <div className="text-sm">
                <p className="font-medium">Drawing colour</p>
                <p className="text-gray-600 dark:text-gray-400">
                  This colour will identify the barrier on the drawing.
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowProductSelector(false);
                setSelectedCartItem("");
                setIsInDrawMode(false);
                setPreSelectedProduct("");
              }}
              className="flex-1"
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedCartItem) {
                  const item = getCartItemWithMarkings(selectedCartItem);
                  if (item?.isFullyMarked) {
                    toast({
                      title: "Quantity reached",
                      description: `All ${item.quantity} units of ${item.productName} have been marked. Add more if needed.`,
                      variant: "destructive",
                    });
                    return;
                  }
                  setPreSelectedProduct(selectedCartItem);
                  setIsInDrawMode(true);
                  setShowProductSelector(false);
                  toast({
                    title: "Draw mode enabled",
                    description: `Drawing ${item?.productName} (${item?.markedCount || 0}/${item?.quantity} marked)`,
                  });
                }
              }}
              disabled={!selectedCartItem}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              size="sm"
              data-testid="button-start-drawing"
            >
              <Pen className="h-4 w-4 mr-2" />
              Start drawing
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
