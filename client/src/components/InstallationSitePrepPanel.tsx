/**
 * InstallationSitePrepPanel — surfaces the *strictest* ground-prep
 * requirements across every product on a given installation so the project
 * manager can plan site prep before the install window starts.
 *
 * Non-destructive: does NOT auto-generate install tasks. Reads
 * products.ground_works_data (populated by /api/admin/ingest-groundworks)
 * and reduces across the installation's order items, picking the
 * worst-case value per field:
 *   - minSlabThicknessMm  → MAX (thickest slab wins)
 *   - anchorDepthMm       → MAX
 *   - anchorDiameterMm    → MAX
 *   - edgeDistanceMm      → MAX
 *   - concretePadDepthMm  → MAX
 *   - hardcoreDepthMm     → MAX
 *   - curingDays          → MAX
 *   - concreteGrade       → alphabetical max (C35 beats C28/35)
 *   - substrateNotes      → union
 *
 * When none of the installation's products have a groundWorksData payload
 * the component renders nothing — the panel is purely additive.
 *
 * Data sourcing: the InstallationTimeline's detail drawer ships
 * `detail.order.items` (orders.items jsonb). Each item carries `productId`
 * or `name` (legacy). We query /api/products once and match on both.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HardHat, AlertTriangle, Layers, Anchor as AnchorIcon, Ruler, Hammer, Clock } from "lucide-react";

type GroundWorksEntry = {
  productFamily?: string;
  minSlabThicknessMm?: number | null;
  concreteGrade?: string | null;
  anchorSpec?: string | null;
  anchorDiameterMm?: number | null;
  anchorDepthMm?: number | null;
  edgeDistanceMm?: number | null;
  concretePadDepthMm?: number | null;
  hardcoreDepthMm?: number | null;
  curingDays?: number | null;
  substrateNotes?: string | null;
  _globalRules?: {
    unsuitableSubstrates?: string[];
    shallowSlabNote?: string;
  } | null;
};

type ProductRow = {
  id: string;
  name: string;
  groundWorksData?: GroundWorksEntry | null;
};

type OrderItem = {
  productId?: string;
  id?: string;
  name?: string;
  productName?: string;
};

interface Props {
  order?: { items?: OrderItem[] | null } | null;
}

function maxNum(vals: Array<number | null | undefined>): number | null {
  const nums = vals.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

// Concrete grade comparison — C35 > C32/40 > C28/35 > C25 ordered by 1st numeric token.
function strictestGrade(grades: Array<string | null | undefined>): string | null {
  const cleaned = grades.filter((g): g is string => typeof g === "string" && g.length > 0);
  if (cleaned.length === 0) return null;
  const scored = cleaned.map((g) => {
    const m = g.match(/C(\d{2})/);
    return { g, score: m ? parseInt(m[1], 10) : 0 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].g;
}

export function InstallationSitePrepPanel({ order }: Props) {
  const items: OrderItem[] = Array.isArray(order?.items) ? order!.items! : [];

  // Pull /api/products once — returns groundWorksData inline via the single-
  // fetch pattern used by ProductSuitabilityBlock. Safe to enable only when
  // there's at least one order item to match against.
  const { data: products = [] } = useQuery<ProductRow[]>({
    queryKey: ["/api/products"],
    enabled: items.length > 0,
  });

  const matchedEntries = useMemo<GroundWorksEntry[]>(() => {
    if (products.length === 0 || items.length === 0) return [];
    const byId = new Map<string, ProductRow>();
    const byName = new Map<string, ProductRow>();
    for (const p of products) {
      byId.set(p.id, p);
      if (p.name) byName.set(p.name.toLowerCase().trim(), p);
    }
    const seen = new Set<string>();
    const out: GroundWorksEntry[] = [];
    for (const item of items) {
      const itemId = item.productId || item.id;
      const itemName = (item.name || item.productName || "").toLowerCase().trim();
      let product: ProductRow | undefined;
      if (itemId && byId.has(itemId)) product = byId.get(itemId);
      else if (itemName && byName.has(itemName)) product = byName.get(itemName);
      if (!product || !product.groundWorksData) continue;
      if (seen.has(product.id)) continue;
      seen.add(product.id);
      out.push(product.groundWorksData);
    }
    return out;
  }, [items, products]);

  const summary = useMemo(() => {
    if (matchedEntries.length === 0) return null;
    return {
      productCount: matchedEntries.length,
      familyNames: matchedEntries
        .map((e) => e.productFamily)
        .filter((x): x is string => !!x),
      maxSlab: maxNum(matchedEntries.map((e) => e.minSlabThicknessMm)),
      maxAnchorDepth: maxNum(matchedEntries.map((e) => e.anchorDepthMm)),
      maxAnchorDia: maxNum(matchedEntries.map((e) => e.anchorDiameterMm)),
      maxEdge: maxNum(matchedEntries.map((e) => e.edgeDistanceMm)),
      maxPadDepth: maxNum(matchedEntries.map((e) => e.concretePadDepthMm)),
      maxHardcore: maxNum(matchedEntries.map((e) => e.hardcoreDepthMm)),
      maxCure: maxNum(matchedEntries.map((e) => e.curingDays)),
      grade: strictestGrade(matchedEntries.map((e) => e.concreteGrade)),
      substrateNotes: Array.from(
        new Set(
          matchedEntries.map((e) => e.substrateNotes).filter((x): x is string => !!x),
        ),
      ),
      unsuitable: Array.from(
        new Set(
          matchedEntries
            .flatMap((e) => e._globalRules?.unsuitableSubstrates || [])
            .filter((x) => !!x),
        ),
      ),
    };
  }, [matchedEntries]);

  // No panel when there's nothing to show — purely additive.
  if (!summary) return null;

  return (
    <Card
      className="border-amber-200 dark:border-amber-900"
      data-testid="installation-site-prep-panel"
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HardHat className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Site Prep Requirements
          <Badge variant="secondary" className="ml-auto">
            Strictest across {summary.productCount}{" "}
            {summary.productCount === 1 ? "product" : "products"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
          <Stat
            icon={<Layers className="h-3.5 w-3.5" />}
            label="Min slab"
            value={summary.maxSlab != null ? `${summary.maxSlab} mm` : "—"}
          />
          <Stat
            icon={<Hammer className="h-3.5 w-3.5" />}
            label="Concrete grade"
            value={summary.grade || "—"}
          />
          <Stat
            icon={<AnchorIcon className="h-3.5 w-3.5" />}
            label="Max anchor"
            value={
              summary.maxAnchorDia != null
                ? `${summary.maxAnchorDia} mm ⌀`
                : "—"
            }
          />
          <Stat
            icon={<Ruler className="h-3.5 w-3.5" />}
            label="Edge distance"
            value={summary.maxEdge != null ? `≥ ${summary.maxEdge} mm` : "—"}
          />
          <Stat
            icon={<Layers className="h-3.5 w-3.5" />}
            label="Pad depth"
            value={summary.maxPadDepth != null ? `${summary.maxPadDepth} mm` : "—"}
          />
          <Stat
            icon={<Hammer className="h-3.5 w-3.5" />}
            label="Hardcore"
            value={summary.maxHardcore != null ? `${summary.maxHardcore} mm` : "—"}
          />
          <Stat
            icon={<AnchorIcon className="h-3.5 w-3.5" />}
            label="Anchor depth"
            value={
              summary.maxAnchorDepth != null ? `${summary.maxAnchorDepth} mm` : "—"
            }
          />
          <Stat
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Cure time"
            value={summary.maxCure != null ? `${summary.maxCure} days min` : "—"}
          />
        </div>

        {summary.unsuitable.length > 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-2 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <span className="text-red-800 dark:text-red-300">
              Unsuitable substrates: {summary.unsuitable.join(", ")}. Verify slab
              continuity and OMM / pull-out test before install window.
            </span>
          </div>
        ) : null}

        {summary.familyNames.length > 0 ? (
          <div className="text-xs text-muted-foreground">
            Covers: {summary.familyNames.join(" · ")}
          </div>
        ) : null}

        <div className="text-[11px] text-muted-foreground italic">
          Source: A-SAFE Ground Works Guide (PRH-1005). These are the strictest
          values across this installation's products — all details to be
          approved by the project engineer.
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border p-2">
      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

export default InstallationSitePrepPanel;
