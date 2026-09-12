/**
 * client/src/components/layout-editor/Inspector.tsx
 *
 * Properties for the selected element (length, posts, product, note,
 * zone label, stamp rotation, dimension readout) plus duplicate / delete.
 * Sits above the toolbar on phones and in the top-right on larger
 * screens. Also exports the long-press context sheet.
 */

import { useEffect, useState } from "react";
import { Copy, MessageSquarePlus, Package, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Element, LayoutDoc } from "@shared/layout/doc";
import { detectCorners, dist, postPositions, pxPerMm, runLengthMm } from "@shared/layout/geometry";
import { getFamily, isStampFamily } from "@shared/layout/symbols";
import type { CatalogProduct } from "./catalog";
import { FamilySwatch } from "./Legend";
import { formatMm } from "./Overlay";

export interface InspectorProps {
  doc: LayoutDoc;
  element: Element;
  products: readonly CatalogProduct[];
  mobile: boolean;
  onChange(next: Element): void;
  onDelete(): void;
  onDuplicate(): void;
  onChangeProduct(): void;
  onClose(): void;
  className?: string;
}

export const ZONE_LABEL_PRESETS = ["Pedestrian zone", "Vehicle zone", "Loading bay", "Exclusion zone"];

function useDraftText(value: string, commit: (v: string) => void) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return { text, setText, blur: () => text !== value && commit(text) };
}

export function Inspector({ doc, element, products, mobile, onChange, onDelete, onDuplicate, onChangeProduct, onClose, className }: InspectorProps) {
  const k = pxPerMm(doc.calibration);
  const fam = element.kind === "barrierRun" || element.kind === "stamp" ? getFamily(element.familyId) : null;
  const product = element.kind === "barrierRun" || element.kind === "stamp" ? products.find((p) => p.id === element.productId) : undefined;

  const noteValue = element.kind === "barrierRun" || element.kind === "stamp" ? element.note ?? "" : element.kind === "note" ? element.text : "";
  const note = useDraftText(noteValue, (v) => {
    if (element.kind === "note") onChange({ ...element, text: v });
    else if (element.kind === "barrierRun" || element.kind === "stamp") onChange({ ...element, note: v || undefined });
  });
  const label = useDraftText(element.kind === "barrierRun" ? element.label ?? "" : element.kind === "zone" ? element.label : "", (v) => {
    if (element.kind === "barrierRun") onChange({ ...element, label: v || undefined });
    else if (element.kind === "zone") onChange({ ...element, label: v });
  });

  let title = "";
  let stats: string[] = [];
  switch (element.kind) {
    case "barrierRun": {
      title = fam?.label ?? "Barrier run";
      const mm = runLengthMm(element.points, doc.calibration);
      const posts = k && fam && !isStampFamily(fam.id) ? postPositions(element.points, fam.postSpacingMm, doc.calibration).length : null;
      stats = [
        mm !== null ? `Length ${formatMm(mm)}` : "Uncalibrated",
        posts !== null ? `${posts} posts` : "",
        `${detectCorners(element.points).length} corners`,
        `${element.points.length} vertices`,
      ].filter(Boolean);
      break;
    }
    case "stamp":
      title = fam?.label ?? "Stamp";
      stats = [`Rotation ${Math.round(element.rotationDeg)}°`];
      break;
    case "wall": {
      title = "Wall";
      const mm = runLengthMm(element.points, doc.calibration);
      stats = [mm !== null ? `Length ${formatMm(mm)}` : "Uncalibrated", `${element.points.length} vertices`];
      break;
    }
    case "zone":
      title = "Zone";
      stats = [`${element.points.length} vertices`];
      break;
    case "dimension": {
      title = "Dimension";
      const px = dist(element.a, element.b);
      stats = [k ? formatMm(px / k) : "Uncalibrated"];
      break;
    }
    case "note":
      title = "Note";
      break;
  }

  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-col gap-2 rounded-lg border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-gray-900/95",
        mobile ? "w-full" : "w-[300px]",
        className,
      )}
      data-testid="layout-inspector"
    >
      <div className="flex items-start gap-2">
        {fam && <FamilySwatch familyId={fam.id} className="mt-1" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</div>
          {stats.length > 0 && <div className="text-xs text-gray-500">{stats.join(" · ")}</div>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
          <X className="h-4 w-4" />
        </button>
      </div>

      {(element.kind === "barrierRun" || element.kind === "stamp") && (
        <button
          type="button"
          onClick={onChangeProduct}
          className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-2 py-2 text-left text-xs hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          data-testid="inspector-change-product"
        >
          <Package className="h-4 w-4 flex-shrink-0 text-gray-500" />
          <span className="min-w-0 flex-1 truncate">{product ? product.name : "No product assigned — tap to choose"}</span>
        </button>
      )}

      {element.kind === "stamp" && (
        <label className="flex items-center gap-2 text-xs">
          <span className="w-16 text-gray-500">Rotation</span>
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={Math.round(element.rotationDeg) % 360}
            onChange={(e) => onChange({ ...element, rotationDeg: Number(e.target.value) })}
            className="flex-1"
            data-testid="inspector-rotation"
          />
          <span className="w-10 text-right font-mono">{Math.round(element.rotationDeg) % 360}°</span>
        </label>
      )}

      {element.kind === "zone" && (
        <div className="flex flex-wrap gap-1">
          {ZONE_LABEL_PRESETS.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => onChange({ ...element, label: z })}
              className={cn("rounded-full border px-2 py-1 text-[11px]", element.label === z ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30" : "border-gray-300 dark:border-gray-700")}
            >
              {z}
            </button>
          ))}
        </div>
      )}

      {(element.kind === "barrierRun" || element.kind === "zone") && (
        <label className="flex items-center gap-2 text-xs">
          <span className="w-16 text-gray-500">Label</span>
          <input
            value={label.text}
            onChange={(e) => label.setText(e.target.value)}
            onBlur={label.blur}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            placeholder={element.kind === "barrierRun" ? "Auto (A1, A2…)" : "Zone label"}
            className="h-9 flex-1 rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800"
            data-testid="inspector-label"
          />
        </label>
      )}

      {(element.kind === "barrierRun" || element.kind === "stamp" || element.kind === "note") && (
        <label className="flex items-start gap-2 text-xs">
          <span className="w-16 pt-2 text-gray-500">{element.kind === "note" ? "Text" : "Note"}</span>
          <textarea
            value={note.text}
            onChange={(e) => note.setText(e.target.value)}
            onBlur={note.blur}
            rows={2}
            placeholder={element.kind === "note" ? "Note text" : "Optional note for this element"}
            className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
            data-testid="inspector-note"
          />
        </label>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDuplicate} className="h-10 flex-1" data-testid="inspector-duplicate">
          <Copy className="mr-1.5 h-4 w-4" /> Duplicate
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={onDelete} className="h-10 flex-1" data-testid="inspector-delete">
          <Trash2 className="mr-1.5 h-4 w-4" /> Delete
        </Button>
      </div>
    </div>
  );
}

// ─── Long-press context sheet ────────────────────────────────────────────────

export interface ElementContextSheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  element: Element | null;
  onDuplicate(): void;
  onDelete(): void;
  onChangeProduct(): void;
  onAddNote(): void;
}

export function ElementContextSheet({ open, onOpenChange, element, onDuplicate, onDelete, onChangeProduct, onAddNote }: ElementContextSheetProps) {
  const canProduct = element?.kind === "barrierRun" || element?.kind === "stamp";
  const act = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[100010] max-w-xs sm:max-w-xs" style={{ zIndex: 100010 }} data-testid="element-context-sheet">
        <DialogHeader>
          <DialogTitle className="text-base">{element ? elementTitle(element) : "Element"}</DialogTitle>
          <DialogDescription className="sr-only">Actions for the selected element</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button type="button" variant="outline" className="h-12 justify-start" onClick={act(onDuplicate)} data-testid="context-duplicate">
            <Copy className="mr-2 h-4 w-4" /> Duplicate
          </Button>
          {canProduct && (
            <Button type="button" variant="outline" className="h-12 justify-start" onClick={act(onChangeProduct)} data-testid="context-change-product">
              <Package className="mr-2 h-4 w-4" /> Change product
            </Button>
          )}
          <Button type="button" variant="outline" className="h-12 justify-start" onClick={act(onAddNote)} data-testid="context-add-note">
            <MessageSquarePlus className="mr-2 h-4 w-4" /> Add note
          </Button>
          <Button type="button" variant="destructive" className="h-12 justify-start" onClick={act(onDelete)} data-testid="context-delete">
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function elementTitle(el: Element): string {
  switch (el.kind) {
    case "barrierRun":
      return getFamily(el.familyId).label;
    case "stamp":
      return getFamily(el.familyId).label;
    case "wall":
      return "Wall";
    case "zone":
      return el.label || "Zone";
    case "dimension":
      return "Dimension";
    case "note":
      return "Note";
  }
}
