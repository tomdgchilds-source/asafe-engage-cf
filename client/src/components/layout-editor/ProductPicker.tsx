/**
 * client/src/components/layout-editor/ProductPicker.tsx
 *
 * Family + product chooser. Bottom sheet on phones (≤ 768 px), side
 * panel on larger screens. Lists every catalogue family with its colour
 * swatch (runs first, then stamp families), then the products that map
 * to the chosen family via `familyForProduct`. A family with no
 * catalogue products can still be drawn — the run just has no productId
 * and shows as "unassigned" in the take-off.
 *
 * Rendered without a Radix portal on purpose: the Editor already lives
 * in a full-screen Dialog, and a nested modal would steal focus from the
 * gesture surface on iOS.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FAMILIES, FAMILY_IDS, getFamily, isStampFamily, type FamilyId } from "@shared/layout/symbols";
import { useProductsByFamily, type CatalogProduct } from "./catalog";
import { FamilySwatch } from "./Legend";

export interface ProductPickerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  mobile: boolean;
  products: readonly CatalogProduct[];
  isLoading?: boolean;
  familyId: string;
  productId?: string;
  /** Which families to show: run tools want linear families, the stamp tool wants stamp families. */
  mode: "run" | "stamp" | "all";
  onSelect(familyId: FamilyId, productId?: string): void;
}

export const LAST_FAMILY_LS_KEY = "asafe.layoutEditor.lastFamily";
export const LAST_PRODUCT_LS_KEY = "asafe.layoutEditor.lastProduct";

export function readLastSelection(): { familyId: string | null; productId: string | null } {
  try {
    return {
      familyId: window.localStorage.getItem(LAST_FAMILY_LS_KEY),
      productId: window.localStorage.getItem(LAST_PRODUCT_LS_KEY),
    };
  } catch {
    return { familyId: null, productId: null };
  }
}

export function writeLastSelection(familyId: string, productId?: string): void {
  try {
    window.localStorage.setItem(LAST_FAMILY_LS_KEY, familyId);
    if (productId) window.localStorage.setItem(LAST_PRODUCT_LS_KEY, productId);
    else window.localStorage.removeItem(LAST_PRODUCT_LS_KEY);
  } catch {
    /* private mode */
  }
}

export function ProductPicker({ open, onOpenChange, mobile, products, isLoading, familyId, productId, mode, onSelect }: ProductPickerProps) {
  const [browsing, setBrowsing] = useState<FamilyId | null>(null);
  const [query, setQuery] = useState("");
  const byFamily = useProductsByFamily(products);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setBrowsing(null);
      setQuery("");
    }
  }, [open]);

  const families = useMemo(() => {
    const ids = FAMILY_IDS.filter((id) => (mode === "all" ? true : mode === "stamp" ? isStampFamily(id) : !isStampFamily(id)));
    return ids.map((id) => ({ spec: FAMILIES[id], count: byFamily.get(id)?.length ?? 0 }));
  }, [mode, byFamily]);

  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.subcategory ?? "").toLowerCase().includes(q))
      .slice(0, 40);
  }, [query, products]);

  const choose = (fid: FamilyId, pid?: string) => {
    writeLastSelection(fid, pid);
    onSelect(fid, pid);
    onOpenChange(false);
  };

  if (!open) return null;

  const familyProducts = browsing ? byFamily.get(browsing) ?? [] : [];

  return (
    <>
      <div
        className={cn("absolute inset-0 z-40 bg-black/30", !mobile && "bg-transparent")}
        onClick={() => onOpenChange(false)}
        aria-hidden
        data-testid="product-picker-backdrop"
      />
      <div
        role="dialog"
        aria-label="Choose product"
        data-testid="product-picker"
        className={cn(
          "absolute z-50 flex flex-col bg-white shadow-2xl dark:bg-gray-900",
          mobile
            ? "inset-x-0 bottom-0 max-h-[75%] rounded-t-2xl border-t border-gray-200 dark:border-gray-700"
            : "bottom-2 right-2 top-2 w-[340px] rounded-xl border border-gray-200 dark:border-gray-700",
        )}
        style={mobile ? { paddingBottom: "env(safe-area-inset-bottom, 0px)" } : undefined}
      >
        {mobile && <div className="mx-auto mt-2 h-1.5 w-10 flex-shrink-0 rounded-full bg-gray-300 dark:bg-gray-700" aria-hidden />}
        <div className="flex flex-shrink-0 items-center gap-2 px-3 py-2">
          {browsing ? (
            <button
              type="button"
              onClick={() => setBrowsing(null)}
              className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Back to families"
              data-testid="product-picker-back"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : null}
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {browsing ? getFamily(browsing).label : mode === "stamp" ? "Point products" : "Barrier families"}
          </h3>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
            data-testid="product-picker-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!browsing && (
          <div className="flex-shrink-0 px-3 pb-2">
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 dark:border-gray-700 dark:bg-gray-800">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isLoading ? "Loading catalogue…" : "Search products"}
                className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
                data-testid="product-picker-search"
              />
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
          {searchHits ? (
            searchHits.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-gray-500">No products match "{query.trim()}".</p>
            ) : (
              <ul className="space-y-0.5">
                {searchHits.map((p) => {
                  const fid = familyIdForProduct(p, byFamily);
                  const fam = getFamily(fid);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => choose(fam.id, p.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                        data-testid={`product-pick-${p.id}`}
                      >
                        <FamilySwatch familyId={fam.id} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-gray-900 dark:text-gray-100">{p.name}</span>
                          <span className="block truncate text-xs text-gray-500">{fam.label}</span>
                        </span>
                        {p.id === productId && <Check className="h-4 w-4 text-green-600" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : browsing ? (
            <ul className="space-y-0.5">
              <li>
                <button
                  type="button"
                  onClick={() => choose(browsing)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                  data-testid="product-pick-family-only"
                >
                  <FamilySwatch familyId={browsing} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-gray-900 dark:text-gray-100">Family only (no product)</span>
                    <span className="block text-xs text-gray-500">Draw now, assign a product later</span>
                  </span>
                  {familyId === browsing && !productId && <Check className="h-4 w-4 text-green-600" />}
                </button>
              </li>
              {familyProducts.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => choose(browsing, p.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                    data-testid={`product-pick-${p.id}`}
                  >
                    <FamilySwatch familyId={browsing} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-gray-900 dark:text-gray-100">{p.name}</span>
                      {p.subcategory && <span className="block truncate text-xs text-gray-500">{p.subcategory.replace(/-/g, " ")}</span>}
                    </span>
                    {p.id === productId && <Check className="h-4 w-4 text-green-600" />}
                  </button>
                </li>
              ))}
              {familyProducts.length === 0 && !isLoading && (
                <li className="px-2 py-4 text-center text-xs text-gray-500">No catalogue products map to this family yet.</li>
              )}
            </ul>
          ) : (
            <ul className="space-y-0.5">
              {families.map(({ spec, count }) => (
                <li key={spec.id}>
                  <button
                    type="button"
                    onClick={() => (count > 0 ? setBrowsing(spec.id) : choose(spec.id))}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-800",
                      familyId === spec.id && "bg-yellow-50 dark:bg-yellow-900/20",
                    )}
                    data-testid={`family-pick-${spec.id}`}
                  >
                    <FamilySwatch familyId={spec.id} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
                        <span className="mr-1.5 font-mono text-xs text-gray-500">{spec.letter}</span>
                        {spec.label}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {count > 0 ? `${count} product${count === 1 ? "" : "s"}` : "No catalogue products"}
                        {spec.postSpacingMm > 0 ? ` · posts @ ${(spec.postSpacingMm / 1000).toFixed(1)} m` : ""}
                      </span>
                    </span>
                    {familyId === spec.id && <Check className="h-4 w-4 text-green-600" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function familyIdForProduct(p: CatalogProduct, byFamily: Map<FamilyId, CatalogProduct[]>): FamilyId {
  for (const [fid, list] of byFamily) if (list.some((x) => x.id === p.id)) return fid;
  return "iflex-single-traffic";
}
