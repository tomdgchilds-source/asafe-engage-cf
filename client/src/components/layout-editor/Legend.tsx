/**
 * client/src/components/layout-editor/Legend.tsx
 *
 * Legend rows and the family swatch, both derived from `FAMILIES` + the
 * document via `deriveQuantities`, so the on-screen legend, the
 * title-block key and the cart transfer always agree. `legendRows` is
 * the single model both the Legend panel and TitleBlock consume.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LayoutDoc } from "@shared/layout/doc";
import { deriveQuantities, type CatalogProductLike, type FamilyQuantity } from "@shared/layout/quantities";
import { getFamily, type FamilySpec } from "@shared/layout/symbols";

export interface LegendRow extends FamilyQuantity {
  spec: FamilySpec;
  /** Product names used under this family (for the title-block key). */
  productNames: string[];
}

export function legendRows(doc: LayoutDoc, catalog: readonly CatalogProductLike[]): LegendRow[] {
  const summary = deriveQuantities(doc, catalog as CatalogProductLike[]);
  const namesByFamily = new Map<string, Set<string>>();
  for (const p of summary.products) {
    const set = namesByFamily.get(p.familyId) ?? new Set<string>();
    set.add(p.productName);
    namesByFamily.set(p.familyId, set);
  }
  return summary.families
    .map((f) => ({ ...f, spec: getFamily(f.familyId), productNames: [...(namesByFamily.get(f.familyId) ?? [])] }))
    .sort((a, b) => a.spec.letter.localeCompare(b.spec.letter));
}

/** Small colour + stroke-style swatch for a family. */
export function FamilySwatch({ familyId, className }: { familyId: string; className?: string }) {
  const spec = getFamily(familyId);
  return (
    <svg width={28} height={16} viewBox="0 0 28 16" className={cn("flex-shrink-0", className)} aria-hidden>
      {spec.stampShape === "circle" && <circle cx={14} cy={8} r={6} fill={spec.colour} />}
      {spec.stampShape === "square" && <rect x={8} y={2} width={12} height={12} fill={spec.colour} />}
      {spec.stampShape === "rect" && <rect x={5} y={4} width={18} height={8} fill={spec.colour} />}
      {!spec.stampShape && (
        <>
          <line x1={2} y1={8} x2={26} y2={8} stroke={spec.colour} strokeWidth={spec.strokeStyle === "single" ? 3 : 6} strokeDasharray={spec.strokeStyle === "dashed" ? "5 3" : undefined} />
          {spec.strokeStyle === "double" && <line x1={2} y1={8} x2={26} y2={8} stroke="#ffffff" strokeWidth={1.6} />}
          <circle cx={4} cy={8} r={3} fill={spec.colour} />
          <circle cx={24} cy={8} r={3} fill={spec.colour} />
        </>
      )}
    </svg>
  );
}

export interface LegendProps {
  doc: LayoutDoc;
  catalog: readonly CatalogProductLike[];
  defaultCollapsed?: boolean;
  className?: string;
}

export function Legend({ doc, catalog, defaultCollapsed = false, className }: LegendProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const rows = useMemo(() => legendRows(doc, catalog), [doc, catalog]);
  const calibrated = rows.length > 0 && !!doc.calibration;
  if (rows.length === 0) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto flex max-h-[45vh] w-[260px] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white/95 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-gray-900/95",
        className,
      )}
      data-testid="layout-legend"
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
        aria-expanded={!collapsed}
        data-testid="layout-legend-toggle"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <Layers className="h-4 w-4" /> Legend
          <span className="text-xs font-normal text-gray-500">{rows.length}</span>
        </span>
        {collapsed ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronUp className="h-4 w-4 text-gray-500" />}
      </button>
      {!collapsed && (
        <ul className="divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
          {rows.map((r) => (
            <li key={r.familyId} className="flex items-start gap-2 px-3 py-1.5" data-testid={`legend-row-${r.familyId}`}>
              <span className="w-4 pt-0.5 font-mono text-xs font-bold text-gray-700 dark:text-gray-300">{r.spec.letter}</span>
              <FamilySwatch familyId={r.familyId} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-gray-900 dark:text-gray-100">{r.spec.label}</span>
                <span className="block text-[11px] text-gray-500">
                  {r.runs > 0 && (calibrated ? `${r.totalLengthM.toFixed(1)} m · ${r.posts} posts` : `${r.runs} run${r.runs === 1 ? "" : "s"} · uncalibrated`)}
                  {r.runs > 0 && r.stamps > 0 && " · "}
                  {r.stamps > 0 && `${r.stamps} ×`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
