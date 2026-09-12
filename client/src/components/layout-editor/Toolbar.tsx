/**
 * client/src/components/layout-editor/Toolbar.tsx
 *
 * Tool switcher + undo/redo + zoom. Renders as a horizontal, scrollable
 * bottom bar on phones (`layout="bottom"`, safe-area padded) and as a
 * vertical left rail on larger screens. Every target is 48 × 48 px.
 */

import type { ComponentType } from "react";
import {
  BrickWall,
  CircleDot,
  Crosshair,
  Magnet,
  Maximize2,
  MousePointer2,
  Pentagon,
  Redo2,
  Ruler,
  Spline,
  StickyNote,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOL_LABELS, type ToolId } from "./tools";

export interface ToolbarProps {
  tool: ToolId;
  onToolChange(tool: ToolId): void;
  layout: "bottom" | "rail";
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  angleSnap: boolean;
  onToggleAngleSnap(): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onFit(): void;
  /** Swatch on the run / stamp buttons showing the active family. */
  activeFamilyColour: string;
  calibrated: boolean;
}

const TOOL_ICONS: Record<ToolId, ComponentType<{ className?: string }>> = {
  select: MousePointer2,
  barrierRun: Spline,
  stamp: CircleDot,
  wall: BrickWall,
  dimension: Ruler,
  note: StickyNote,
  zone: Pentagon,
  calibrate: Crosshair,
};

const TOOL_ORDER: ToolId[] = ["select", "barrierRun", "stamp", "wall", "zone", "dimension", "note", "calibrate"];

function ToolButton({
  active,
  label,
  onClick,
  disabled,
  children,
  testId,
  badge,
}: {
  active?: boolean;
  label: string;
  onClick(): void;
  disabled?: boolean;
  children: React.ReactNode;
  testId: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      data-testid={testId}
      className={cn(
        "relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg transition-colors",
        "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
        "disabled:opacity-40 disabled:hover:bg-transparent",
        active && "bg-yellow-400 text-black hover:bg-yellow-400 dark:bg-yellow-400 dark:text-black dark:hover:bg-yellow-400",
      )}
    >
      {children}
      {badge && (
        <span
          className="absolute bottom-1.5 right-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-gray-900"
          style={{ backgroundColor: badge }}
          aria-hidden
        />
      )}
    </button>
  );
}

export function Toolbar({
  tool,
  onToolChange,
  layout,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  angleSnap,
  onToggleAngleSnap,
  onZoomIn,
  onZoomOut,
  onFit,
  activeFamilyColour,
  calibrated,
}: ToolbarProps) {
  const vertical = layout === "rail";
  const Sep = () => <div className={cn("flex-shrink-0 bg-gray-200 dark:bg-gray-700", vertical ? "mx-2 my-1 h-px" : "mx-1 my-2 w-px")} aria-hidden />;

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      data-testid="layout-toolbar"
      className={cn(
        "flex flex-shrink-0 bg-white dark:bg-gray-900",
        vertical
          ? "w-14 flex-col items-center gap-0.5 overflow-y-auto border-r border-gray-200 py-2 dark:border-gray-700"
          : "flex-row items-center gap-0.5 overflow-x-auto border-t border-gray-200 px-2 dark:border-gray-700",
      )}
      style={
        vertical
          ? { paddingLeft: "env(safe-area-inset-left, 0px)" }
          : { paddingBottom: "max(0.25rem, env(safe-area-inset-bottom, 0px))", paddingTop: "0.25rem" }
      }
    >
      {TOOL_ORDER.map((id) => {
        const Icon = TOOL_ICONS[id];
        const badge = id === "barrierRun" || id === "stamp" ? activeFamilyColour : id === "calibrate" && calibrated ? "#16A34A" : undefined;
        return (
          <ToolButton key={id} active={tool === id} label={TOOL_LABELS[id]} onClick={() => onToolChange(id)} testId={`tool-${id}`} badge={badge}>
            <Icon className="h-5 w-5" />
          </ToolButton>
        );
      })}
      <Sep />
      <ToolButton active={angleSnap} label={angleSnap ? "Angle snap on" : "Angle snap off"} onClick={onToggleAngleSnap} testId="tool-angle-snap">
        <Magnet className="h-5 w-5" />
      </ToolButton>
      <Sep />
      <ToolButton label="Undo" onClick={onUndo} disabled={!canUndo} testId="tool-undo">
        <Undo2 className="h-5 w-5" />
      </ToolButton>
      <ToolButton label="Redo" onClick={onRedo} disabled={!canRedo} testId="tool-redo">
        <Redo2 className="h-5 w-5" />
      </ToolButton>
      <Sep />
      <ToolButton label="Zoom in" onClick={onZoomIn} testId="tool-zoom-in">
        <ZoomIn className="h-5 w-5" />
      </ToolButton>
      <ToolButton label="Zoom out" onClick={onZoomOut} testId="tool-zoom-out">
        <ZoomOut className="h-5 w-5" />
      </ToolButton>
      <ToolButton label="Fit to screen" onClick={onFit} testId="tool-fit">
        <Maximize2 className="h-5 w-5" />
      </ToolButton>
    </div>
  );
}
