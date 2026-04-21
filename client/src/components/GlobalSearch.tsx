import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  X,
  Package,
  Building,
  ShoppingCart,
  FolderOpen,
  Loader2,
  ArrowRight,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useLocation } from "wouter";

// ──────────────────────────────────────────────
// Global header search. Backed by GET /api/search. Floating dropdown
// (not a full modal) triggered by the header input or ⌘K / Ctrl+K.
// Keyboard-first: ↑/↓ moves selection across buckets, Enter opens.
// ──────────────────────────────────────────────

type ProjectHit = {
  id: string;
  name: string;
  customerCompanyName?: string | null;
  isShared: boolean;
  status: string;
};
type CustomerHit = {
  id: string;
  name: string;
  industry?: string | null;
  city?: string | null;
  country?: string | null;
};
type OrderHit = {
  id: string;
  orderNumber: string;
  customOrderNumber?: string | null;
  customerCompany?: string | null;
  grandTotal: string | null;
  currency: string;
  status: string;
};
type ProductHit = {
  id: string;
  name: string;
  category: string;
  imageUrl?: string | null;
  price?: string | null;
  basePricePerMeter?: string | null;
};

interface SearchResponse {
  projects: ProjectHit[];
  customers: CustomerHit[];
  orders: OrderHit[];
  products: ProductHit[];
}

type FlatResult =
  | { bucket: "projects"; item: ProjectHit }
  | { bucket: "customers"; item: CustomerHit }
  | { bucket: "orders"; item: OrderHit }
  | { bucket: "products"; item: ProductHit };

const EMPTY: SearchResponse = {
  projects: [],
  customers: [],
  orders: [],
  products: [],
};

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: searchResults = EMPTY, isLoading } = useQuery<SearchResponse>({
    queryKey: ["/api/search", debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.trim().length < 2) return EMPTY;
      const res = await apiRequest(
        `/api/search?q=${encodeURIComponent(debouncedSearch.trim())}&limit=20`,
        "GET",
      );
      return (await res.json()) as SearchResponse;
    },
    enabled: isAuthenticated && debouncedSearch.trim().length >= 2,
    staleTime: 30_000,
  });

  // Flatten groups into a single ordered list for ↑/↓ navigation.
  const flatResults = useMemo<FlatResult[]>(() => {
    return [
      ...searchResults.projects.map((item) => ({ bucket: "projects" as const, item })),
      ...searchResults.customers.map((item) => ({ bucket: "customers" as const, item })),
      ...searchResults.orders.map((item) => ({ bucket: "orders" as const, item })),
      ...searchResults.products.map((item) => ({ bucket: "products" as const, item })),
    ];
  }, [searchResults]);

  const totalCount = flatResults.length;

  // Reset cursor when the result set changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [debouncedSearch, totalCount]);

  const handleResultClick = useCallback(
    (result: FlatResult) => {
      setIsOpen(false);
      setSearchQuery("");
      switch (result.bucket) {
        case "projects":
          setLocation(`/projects?id=${result.item.id}`);
          break;
        case "customers":
          setLocation(`/projects?customerId=${result.item.id}`);
          break;
        case "orders":
          setLocation(`/order-form/${result.item.id}`);
          break;
        case "products":
          setLocation(`/products?highlight=${result.item.id}`);
          break;
      }
    },
    [setLocation],
  );

  // ⌘K / Ctrl+K opens the search; Esc closes.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen(true);
        // Focus on next tick after render.
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (totalCount ? (i + 1) % totalCount : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (totalCount ? (i - 1 + totalCount) % totalCount : 0));
    } else if (e.key === "Enter" && flatResults[activeIndex]) {
      e.preventDefault();
      handleResultClick(flatResults[activeIndex]);
    }
  };

  // Precompute the flat index where each bucket starts, for highlight mapping.
  const bucketOffsets = useMemo(() => {
    const projOffset = 0;
    const custOffset = projOffset + searchResults.projects.length;
    const ordOffset = custOffset + searchResults.customers.length;
    const prodOffset = ordOffset + searchResults.orders.length;
    return {
      projects: projOffset,
      customers: custOffset,
      orders: ordOffset,
      products: prodOffset,
    };
  }, [searchResults]);

  const hasQuery = searchQuery.trim().length >= 2;
  const hasResults = totalCount > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          type="text"
          placeholder="Search projects, customers, orders…"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onInputKeyDown}
          className="pl-8 pr-16"
          data-testid="global-search-input"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 md:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </div>

      {isOpen && hasQuery && (
        <div
          className="absolute left-0 right-0 mt-2 max-h-[70vh] overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-lg z-50"
          role="listbox"
          data-testid="global-search-dropdown"
        >
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && !hasResults && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No results for &ldquo;{searchQuery}&rdquo;
            </div>
          )}

          {!isLoading && hasResults && (
            <div className="py-2">
              {/* Projects */}
              {searchResults.projects.length > 0 && (
                <SearchGroup
                  icon={<FolderOpen className="h-4 w-4" />}
                  title="Projects"
                  viewAllHref="/projects"
                  onViewAll={() => setIsOpen(false)}
                >
                  {searchResults.projects.map((p, idx) => {
                    const flatIdx = bucketOffsets.projects + idx;
                    return (
                      <ResultRow
                        key={p.id}
                        active={activeIndex === flatIdx}
                        onMouseEnter={() => setActiveIndex(flatIdx)}
                        onClick={() => handleResultClick({ bucket: "projects", item: p })}
                        data-testid={`search-project-${p.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate flex items-center gap-2">
                            {p.name}
                            {p.isShared && (
                              <span className="text-[10px] uppercase tracking-wide rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                                Shared
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {p.customerCompanyName ?? "No customer"} · {p.status}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </ResultRow>
                    );
                  })}
                </SearchGroup>
              )}

              {/* Customers */}
              {searchResults.customers.length > 0 && (
                <SearchGroup
                  icon={<Users className="h-4 w-4" />}
                  title="Customers"
                  viewAllHref="/projects"
                  onViewAll={() => setIsOpen(false)}
                >
                  {searchResults.customers.map((ct, idx) => {
                    const flatIdx = bucketOffsets.customers + idx;
                    return (
                      <ResultRow
                        key={ct.id}
                        active={activeIndex === flatIdx}
                        onMouseEnter={() => setActiveIndex(flatIdx)}
                        onClick={() => handleResultClick({ bucket: "customers", item: ct })}
                        data-testid={`search-customer-${ct.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{ct.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {[ct.industry, ct.city, ct.country].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </ResultRow>
                    );
                  })}
                </SearchGroup>
              )}

              {/* Orders */}
              {searchResults.orders.length > 0 && (
                <SearchGroup
                  icon={<ShoppingCart className="h-4 w-4" />}
                  title="Orders"
                  viewAllHref="/dashboard"
                  onViewAll={() => setIsOpen(false)}
                >
                  {searchResults.orders.map((o, idx) => {
                    const flatIdx = bucketOffsets.orders + idx;
                    const label = o.customOrderNumber
                      ? `${o.orderNumber} · ${o.customOrderNumber}`
                      : o.orderNumber;
                    return (
                      <ResultRow
                        key={o.id}
                        active={activeIndex === flatIdx}
                        onMouseEnter={() => setActiveIndex(flatIdx)}
                        onClick={() => handleResultClick({ bucket: "orders", item: o })}
                        data-testid={`search-order-${o.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{label}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {o.customerCompany ?? "—"} · {o.status} · {o.currency}{" "}
                            {o.grandTotal ?? "0"}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </ResultRow>
                    );
                  })}
                </SearchGroup>
              )}

              {/* Products */}
              {searchResults.products.length > 0 && (
                <SearchGroup
                  icon={<Package className="h-4 w-4" />}
                  title="Products"
                  viewAllHref="/products"
                  onViewAll={() => setIsOpen(false)}
                >
                  {searchResults.products.map((pr, idx) => {
                    const flatIdx = bucketOffsets.products + idx;
                    return (
                      <ResultRow
                        key={pr.id}
                        active={activeIndex === flatIdx}
                        onMouseEnter={() => setActiveIndex(flatIdx)}
                        onClick={() => handleResultClick({ bucket: "products", item: pr })}
                        data-testid={`search-product-${pr.id}`}
                      >
                        {pr.imageUrl ? (
                          <img
                            src={pr.imageUrl}
                            alt=""
                            className="h-8 w-8 rounded object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{pr.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {pr.category}
                            {pr.price ? ` · ${pr.price}` : ""}
                            {pr.basePricePerMeter ? ` · ${pr.basePricePerMeter}/m` : ""}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </ResultRow>
                    );
                  })}
                </SearchGroup>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Presentational helpers
// ──────────────────────────────────────────────

function SearchGroup({
  icon,
  title,
  viewAllHref,
  onViewAll,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  viewAllHref: string;
  onViewAll: () => void;
  children: React.ReactNode;
}) {
  const [, setLocation] = useLocation();
  return (
    <div className="pb-2">
      <div className="px-3 py-1.5 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      <div>{children}</div>
      <button
        type="button"
        className="w-full text-left px-3 py-1.5 text-xs text-primary hover:underline"
        onClick={() => {
          onViewAll();
          setLocation(viewAllHref);
        }}
      >
        View all {title.toLowerCase()} →
      </button>
    </div>
  );
}

function ResultRow({
  active,
  onClick,
  onMouseEnter,
  children,
  ...rest
}: {
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  children: React.ReactNode;
  [key: string]: unknown;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
        active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}

export default GlobalSearch;
