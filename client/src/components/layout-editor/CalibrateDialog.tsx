/**
 * client/src/components/layout-editor/CalibrateDialog.tsx
 *
 * Two ways to set the scale:
 *   1. Known length — the user has just tapped two points; enter the real
 *      distance in mm / m / ft.
 *   2. Sheet scale — the drawing is a known paper size at a known ratio
 *      ("1:100 on A3"): the whole page width becomes the calibration
 *      line, no tapping needed. Handy for clean CAD PDFs.
 */

import { useEffect, useMemo, useState } from "react";
import { Crosshair, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Calibration, Pt } from "@shared/layout/doc";
import { dist } from "@shared/layout/geometry";

export type LengthUnit = "mm" | "m" | "ft";
const UNIT_TO_MM: Record<LengthUnit, number> = { mm: 1, m: 1000, ft: 304.8 };

/** ISO A-series widths (landscape) in mm. */
export const PAPER_WIDTHS_MM: Record<string, number> = { A4: 297, A3: 420, A2: 594, A1: 841, A0: 1189 };
export const SCALE_RATIOS = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500];

export function toMm(value: number, unit: LengthUnit): number {
  return value * UNIT_TO_MM[unit];
}

/** Calibration for "paper × ratio" given the content width in px. */
export function sheetCalibration(contentWidthPx: number, paper: string, ratio: number): Calibration {
  const widthMm = (PAPER_WIDTHS_MM[paper] ?? PAPER_WIDTHS_MM.A3) * ratio;
  return { a: { x: 0, y: 0 }, b: { x: contentWidthPx, y: 0 }, lengthMm: widthMm };
}

export interface CalibrateDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The two tapped points, when arriving from the calibrate tool. */
  line: { a: Pt; b: Pt } | null;
  naturalWidth: number | null;
  current?: Calibration;
  onConfirm(cal: Calibration): void;
  /** Ask the user to tap two points (closes the dialog and activates the tool). */
  onPickPoints(): void;
}

export function CalibrateDialog({ open, onOpenChange, line, naturalWidth, current, onConfirm, onPickPoints }: CalibrateDialogProps) {
  const [mode, setMode] = useState<"length" | "sheet">("length");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<LengthUnit>("mm");
  const [paper, setPaper] = useState("A3");
  const [ratio, setRatio] = useState("100");

  useEffect(() => {
    if (open) {
      setMode(line ? "length" : "sheet");
      setValue("");
    }
  }, [open, line]);

  const lengthMm = useMemo(() => {
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0 ? toMm(n, unit) : null;
  }, [value, unit]);

  const linePx = line ? dist(line.a, line.b) : 0;
  const preview = lengthMm && linePx > 0 ? linePx / lengthMm : null;

  const confirm = () => {
    if (mode === "length") {
      if (!line || !lengthMm || linePx <= 0) return;
      onConfirm({ a: line.a, b: line.b, lengthMm });
    } else {
      if (!naturalWidth) return;
      onConfirm(sheetCalibration(naturalWidth, paper, Number(ratio)));
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[100010] sm:max-w-md" style={{ zIndex: 100010 }} data-testid="calibrate-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crosshair className="h-5 w-5 text-pink-600" /> Set drawing scale
          </DialogTitle>
          <DialogDescription>Lengths, posts and quantities are derived from this. {current ? "A scale is already set; confirming replaces it." : ""}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
          <button
            type="button"
            onClick={() => setMode("length")}
            className={cn("h-10 rounded-md text-sm font-medium", mode === "length" ? "bg-white shadow dark:bg-gray-900" : "text-gray-600 dark:text-gray-300")}
            data-testid="calibrate-mode-length"
          >
            Known length
          </button>
          <button
            type="button"
            onClick={() => setMode("sheet")}
            className={cn("h-10 rounded-md text-sm font-medium", mode === "sheet" ? "bg-white shadow dark:bg-gray-900" : "text-gray-600 dark:text-gray-300")}
            data-testid="calibrate-mode-sheet"
          >
            Sheet scale
          </button>
        </div>

        {mode === "length" ? (
          line ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">Line marked ({Math.round(linePx)} px). Enter its real length:</p>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirm()}
                  placeholder={unit === "mm" ? "e.g. 6000" : unit === "m" ? "e.g. 6" : "e.g. 20"}
                  className="h-11 flex-1 text-base"
                  data-testid="calibrate-length"
                />
                <Select value={unit} onValueChange={(v) => setUnit(v as LengthUnit)}>
                  <SelectTrigger className="h-11 w-20" data-testid="calibrate-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ zIndex: 100030 }}>
                    <SelectItem value="mm">mm</SelectItem>
                    <SelectItem value="m">m</SelectItem>
                    <SelectItem value="ft">ft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {preview && <p className="text-xs text-gray-500">≈ {preview.toFixed(4)} px per mm · 1 m = {(preview * 1000).toFixed(1)} px on the drawing</p>}
            </div>
          ) : (
            <div className="space-y-3 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-300">Tap the two ends of a dimension you know (a door, a bay, a grid line), then enter its length.</p>
              <Button type="button" onClick={onPickPoints} className="h-11 w-full bg-pink-600 text-white hover:bg-pink-700" data-testid="calibrate-pick-points">
                <Ruler className="mr-2 h-4 w-4" /> Tap two points on the drawing
              </Button>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">If the sheet was plotted at a known ratio, the page width sets the scale — no tapping needed.</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Paper</Label>
                <Select value={paper} onValueChange={setPaper}>
                  <SelectTrigger className="h-11" data-testid="calibrate-paper">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ zIndex: 100030 }}>
                    {Object.keys(PAPER_WIDTHS_MM).map((p) => (
                      <SelectItem key={p} value={p}>
                        {p} landscape ({PAPER_WIDTHS_MM[p]} mm)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ratio</Label>
                <Select value={ratio} onValueChange={setRatio}>
                  <SelectTrigger className="h-11" data-testid="calibrate-ratio">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ zIndex: 100030 }}>
                    {SCALE_RATIOS.map((r) => (
                      <SelectItem key={r} value={String(r)}>
                        1:{r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Page width = {(((PAPER_WIDTHS_MM[paper] ?? 420) * Number(ratio)) / 1000).toFixed(1)} m across {naturalWidth ? `${Math.round(naturalWidth)} px` : "the drawing"}.
              Only accurate when the file is the full uncropped sheet.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={confirm}
            disabled={mode === "length" ? !line || !lengthMm : !naturalWidth}
            className="h-11 bg-primary text-black hover:bg-yellow-400"
            data-testid="calibrate-confirm"
          >
            Set scale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
