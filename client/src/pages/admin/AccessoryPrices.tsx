/**
 * /admin/accessory-prices
 *
 * Maintains the indicative accessory price list the cart's AccessoryPicker
 * shows beside each option (GET /api/accessory-prices). Admin edits the
 * label, AED price, "price to confirm" flag and active flag per row and
 * saves each row with PATCH /api/admin/accessory-prices/:code. Codes,
 * units and family applicability come from the seed and are read-only
 * here — changing a unit would silently re-price every cart that carries
 * the accessory.
 *
 * Prices are AED (the app is AED-native); display conversion elsewhere is
 * CurrencyContext's job, so this page shows raw AED on purpose.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, RefreshCw, Save, Search, Tag } from "lucide-react";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  type AccessoryPriceOption,
  formatAccessoryPrice,
  parseNumberInput,
  round2,
  unitSuffix,
} from "@/lib/customItems";
import { ACCESSORY_GROUP_LABELS } from "@shared/cartAccessories";

// Admin list includes retired rows; the cart's picker uses the bare URL.
const ADMIN_LIST_KEY = ["/api/accessory-prices?all=1"] as const;

interface PricesResponse {
  items: AccessoryPriceOption[];
  /** "db" once migration 2026-10-15-009 is applied; "catalogue" before. */
  source?: string;
}

interface Draft {
  label: string;
  priceText: string;
  priceToConfirm: boolean;
  active: boolean;
}

type PatchBody = Partial<Pick<AccessoryPriceOption, "label" | "priceAed" | "priceToConfirm" | "active">>;

function draftFrom(item: AccessoryPriceOption): Draft {
  return {
    label: item.label,
    priceText: item.priceAed === null ? "" : String(item.priceAed),
    priceToConfirm: item.priceToConfirm,
    active: item.active,
  };
}

/** Fields that differ from the saved row; undefined when nothing changed. */
function diff(item: AccessoryPriceOption, draft: Draft): PatchBody | undefined {
  const body: PatchBody = {};
  const label = draft.label.trim();
  if (label && label !== item.label) body.label = label;
  const parsed = draft.priceText.trim() === "" ? null : parseNumberInput(draft.priceText);
  const price = parsed === null ? null : Number.isFinite(parsed) && parsed >= 0 ? round2(parsed) : NaN;
  if (!Number.isNaN(price) && price !== item.priceAed) body.priceAed = price;
  if (draft.priceToConfirm !== item.priceToConfirm) body.priceToConfirm = draft.priceToConfirm;
  if (draft.active !== item.active) body.active = draft.active;
  return Object.keys(body).length > 0 ? body : undefined;
}

export default function AccessoryPrices() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const listQuery = useQuery<PricesResponse>({
    queryKey: [...ADMIN_LIST_KEY],
    queryFn: getQueryFn({ on401: "throw" }),
  });
  const items = listQuery.data?.items ?? [];
  const readOnlySource = listQuery.data?.source === "catalogue";

  const save = useMutation<AccessoryPriceOption | null, Error, { code: string; body: PatchBody }>({
    mutationFn: async ({ code, body }) => {
      const res = await apiRequest(`/api/admin/accessory-prices/${encodeURIComponent(code)}`, "PATCH", body);
      const json = (await res.json().catch(() => null)) as { item?: AccessoryPriceOption } | null;
      return json?.item ?? null;
    },
    onSuccess: (_data, { code }) => {
      setDrafts((d) => {
        const next = { ...d };
        delete next[code];
        return next;
      });
      // Both this list and the cart picker's list (bare URL) show the row.
      queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/accessory-prices"),
      });
      toast({ title: "Saved", description: code });
    },
    onError: (err, { code }) => {
      toast({ title: `Could not save ${code}`, description: err.message, variant: "destructive" });
    },
  });

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = items.filter((i) => {
      if (!q) return true;
      return (
        i.label.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        i.group.toLowerCase().includes(q) ||
        (i.sku ?? "").toLowerCase().includes(q) ||
        (i.appliesToFamilies ?? []).some((f) => f.toLowerCase().includes(q))
      );
    });
    const map = new Map<string, AccessoryPriceOption[]>();
    for (const item of filtered) {
      const list = map.get(item.group) ?? [];
      list.push(item);
      map.set(item.group, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items, search]);

  const counts = useMemo(() => {
    let priced = 0;
    let tbc = 0;
    let inactive = 0;
    for (const i of items) {
      if (!i.active) inactive += 1;
      else if (i.priceToConfirm || i.priceAed === null) tbc += 1;
      else priced += 1;
    }
    return { priced, tbc, inactive };
  }, [items]);

  const getDraft = (item: AccessoryPriceOption): Draft => drafts[item.code] ?? draftFrom(item);
  const setDraft = (code: string, item: AccessoryPriceOption, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [code]: { ...(d[code] ?? draftFrom(item)), ...patch } }));

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6" data-testid="admin-accessory-prices">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Tag className="h-6 w-6 text-primary" />
          Accessory prices
        </h1>
        <p className="text-sm text-muted-foreground">
          Indicative AED prices shown in the cart's accessory picker. Leave the price blank or tick
          "Price to confirm" when estimation must price it; retire an option with the Active switch.
        </p>
      </div>

      {readOnlySource && (
        <Card className="border-amber-300 bg-amber-50/60 dark:bg-amber-900/10">
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <CardTitle className="text-base">Showing the bundled catalogue</CardTitle>
              <CardDescription>
                The accessory_prices table is not there yet, so edits will fail. Apply the pending
                migration from Schema migrations first.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      )}

      {listQuery.error && (
        <Card className="border-destructive/40">
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <CardTitle className="text-base">Could not load the price list</CardTitle>
              <CardDescription>{(listQuery.error as Error).message}</CardDescription>
            </div>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">
              {items.length} option{items.length === 1 ? "" : "s"}
            </CardTitle>
            <CardDescription>
              {counts.priced} priced · {counts.tbc} to confirm · {counts.inactive} retired
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search label, code, SKU, family"
                className="pl-8 h-9"
                data-testid="input-accessory-search"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => listQuery.refetch()}
              disabled={listQuery.isFetching}
              data-testid="button-accessory-refresh"
            >
              <RefreshCw className={`h-4 w-4 ${listQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {listQuery.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
          ) : grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center" data-testid="text-accessory-empty">
              {items.length === 0 ? "No accessory prices seeded yet." : "Nothing matches that search."}
            </p>
          ) : (
            grouped.map(([group, rows]) => (
              <section key={group} className="space-y-2" data-testid={`accessory-group-${group}`}>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  {ACCESSORY_GROUP_LABELS[group as keyof typeof ACCESSORY_GROUP_LABELS] ?? group}
                </h2>
                <div className="rounded-md border divide-y">
                  {rows.map((item) => {
                    const draft = getDraft(item);
                    const pending = diff(item, draft);
                    const priceInvalid =
                      draft.priceText.trim() !== "" &&
                      (!Number.isFinite(parseNumberInput(draft.priceText)) || parseNumberInput(draft.priceText) < 0);
                    const saving = save.isPending && save.variables?.code === item.code;
                    return (
                      <div
                        key={item.code}
                        className={`p-3 grid grid-cols-1 md:grid-cols-12 gap-3 md:items-center ${
                          item.active ? "" : "opacity-60"
                        }`}
                        data-testid={`row-accessory-${item.code}`}
                      >
                        {/* Label + meta */}
                        <div className="md:col-span-5 space-y-1 min-w-0">
                          <Input
                            value={draft.label}
                            onChange={(e) => setDraft(item.code, item, { label: e.target.value })}
                            className="h-9"
                            aria-label={`Label for ${item.code}`}
                            data-testid={`input-accessory-label-${item.code}`}
                          />
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                            <code className="font-mono">{item.code}</code>
                            {item.sku && <span>· SKU {item.sku}</span>}
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {unitSuffix(item.unit)}
                            </Badge>
                            {item.appliesToFamilies && item.appliesToFamilies.length > 0 ? (
                              <span className="truncate" title={item.appliesToFamilies.join(", ")}>
                                · {item.appliesToFamilies.join(", ")}
                              </span>
                            ) : (
                              <span>· any product</span>
                            )}
                          </div>
                        </div>

                        {/* Price */}
                        <div className="md:col-span-3 space-y-1">
                          <Label htmlFor={`price-${item.code}`} className="text-[11px] text-gray-500 md:sr-only">
                            Price (AED {unitSuffix(item.unit)})
                          </Label>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 shrink-0">AED</span>
                            <Input
                              id={`price-${item.code}`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step={0.01}
                              value={draft.priceText}
                              onChange={(e) => setDraft(item.code, item, { priceText: e.target.value })}
                              placeholder="blank = TBC"
                              className={`h-9 ${priceInvalid ? "border-destructive" : ""}`}
                              disabled={draft.priceToConfirm}
                              data-testid={`input-accessory-price-${item.code}`}
                            />
                          </div>
                          <p className="text-[11px] text-gray-500 whitespace-nowrap">
                            Shown as:{" "}
                            {formatAccessoryPrice({
                              unit: item.unit,
                              priceToConfirm: draft.priceToConfirm,
                              priceAed:
                                draft.priceText.trim() === "" || priceInvalid
                                  ? null
                                  : parseNumberInput(draft.priceText),
                            })}
                          </p>
                        </div>

                        {/* Flags */}
                        <div className="md:col-span-3 flex items-center gap-4 flex-wrap">
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <Switch
                              checked={draft.priceToConfirm}
                              onCheckedChange={(v) => setDraft(item.code, item, { priceToConfirm: v })}
                              data-testid={`switch-accessory-tbc-${item.code}`}
                            />
                            To confirm
                          </label>
                          <label className="flex items-center gap-2 text-xs cursor-pointer">
                            <Switch
                              checked={draft.active}
                              onCheckedChange={(v) => setDraft(item.code, item, { active: v })}
                              data-testid={`switch-accessory-active-${item.code}`}
                            />
                            Active
                          </label>
                        </div>

                        {/* Save */}
                        <div className="md:col-span-1 flex md:justify-end">
                          <Button
                            size="sm"
                            className="h-9 w-full md:w-auto"
                            disabled={!pending || priceInvalid || saving}
                            onClick={() => pending && save.mutate({ code: item.code, body: pending })}
                            data-testid={`button-accessory-save-${item.code}`}
                          >
                            <Save className="h-4 w-4 md:mr-0 mr-1" />
                            <span className="md:sr-only">{saving ? "Saving…" : "Save"}</span>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
