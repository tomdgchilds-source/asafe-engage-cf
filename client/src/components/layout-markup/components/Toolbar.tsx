import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { X, Pen, Check, Wand2, Info, Layers, Minus, Squircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LayoutDrawing, MarkupPath, LayoutMarkup } from "../types";

interface ToolbarProps {
  drawing: LayoutDrawing;
  isEditingTitle: boolean;
  editedTitle: string;
  setEditedTitle: (title: string) => void;
  setIsEditingTitle: (editing: boolean) => void;
  onUpdateTitle: (id: string, title: string) => void;
  isScaleSet: boolean;
  onShowScaleDialog: () => void;
  onShowHelpGuide: () => void;
  onClose: () => void;
  /** Current rendering view mode for barrier markups. */
  viewMode: "technical" | "schematic";
  /** Switch between scale-accurate top-view (technical) and flat polylines (schematic). */
  onViewModeChange: (m: "technical" | "schematic") => void;
  /**
   * Right-angle snap toggle. When active, new line segments are
   * constrained to 0°/45°/90° relative to the previous anchor point.
   * Also snaps freshly-drawn endpoints to existing markup endpoints
   * within 8 screen pixels.
   */
  isRightAngleSnap: boolean;
  onToggleRightAngleSnap: () => void;
}

export function Toolbar({
  drawing,
  isEditingTitle,
  editedTitle,
  setEditedTitle,
  setIsEditingTitle,
  onUpdateTitle,
  isScaleSet,
  onShowScaleDialog,
  onShowHelpGuide,
  onClose,
  viewMode,
  onViewModeChange,
  isRightAngleSnap,
  onToggleRightAngleSnap,
}: ToolbarProps) {
  return (
    <div className="p-2 sm:p-3 pb-2 flex-shrink-0 border-b bg-white dark:bg-gray-900 dark:border-gray-700">
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isEditingTitle ? (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={() => {
                  if (editedTitle.trim() && editedTitle !== drawing.fileName) {
                    onUpdateTitle(drawing.id, editedTitle.trim());
                  }
                  setIsEditingTitle(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (editedTitle.trim() && editedTitle !== drawing.fileName) {
                      onUpdateTitle(drawing.id, editedTitle.trim());
                    }
                    setIsEditingTitle(false);
                  } else if (e.key === 'Escape') {
                    setEditedTitle(drawing.fileName);
                    setIsEditingTitle(false);
                  }
                }}
                className="flex-1 px-2 py-1 text-xs sm:text-sm font-medium bg-white dark:bg-gray-800 border-2 border-purple-500 rounded outline-none focus:ring-2 focus:ring-purple-500"
                autoFocus
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                onClick={() => {
                  if (editedTitle.trim() && editedTitle !== drawing.fileName) {
                    onUpdateTitle(drawing.id, editedTitle.trim());
                  }
                  setIsEditingTitle(false);
                }}
                data-testid="button-save-title"
              >
                <Check className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => {
                  setEditedTitle(drawing.fileName);
                  setIsEditingTitle(false);
                }}
                data-testid="button-cancel-title"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors cursor-text group flex-1 min-w-0"
                    onClick={() => {
                      setEditedTitle(drawing.fileName);
                      setIsEditingTitle(true);
                    }}
                  >
                    <h2 className="text-xs sm:text-sm truncate font-medium group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                      {drawing.fileName}
                    </h2>
                    <Pen className="h-3 w-3 text-purple-500 flex-shrink-0" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Click to rename drawing</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Technical / Schematic view toggle — governs how barrier
              markups are drawn (scale-accurate post+rail top view vs.
              legacy flat polylines). Keyboard shortcut: V. */}
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => onViewModeChange("technical")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium",
                viewMode === "technical"
                  ? "bg-[#FFC72C] text-black"
                  : "bg-white text-foreground hover:bg-muted",
              )}
              title="Post + rail top view (V)"
              data-testid="view-technical"
            >
              <Layers className="h-3.5 w-3.5" /> Technical
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("schematic")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border-l border-border",
                viewMode === "schematic"
                  ? "bg-[#FFC72C] text-black"
                  : "bg-white text-foreground hover:bg-muted",
              )}
              title="Schematic lines (V)"
              data-testid="view-schematic"
            >
              <Minus className="h-3.5 w-3.5" /> Schematic
            </button>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isRightAngleSnap ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-7 w-7 sm:h-8 sm:w-8 p-0",
                    isRightAngleSnap && "bg-[#FFC72C] text-black hover:bg-yellow-400",
                  )}
                  onClick={onToggleRightAngleSnap}
                  data-testid="button-right-angle-snap"
                  aria-pressed={isRightAngleSnap}
                >
                  <Squircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Right-angle snap (0°/45°/90°) + endpoint snap — toggle</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={isScaleSet ? "ghost" : "outline"}
                  size="sm"
                  className={`h-7 w-7 sm:h-8 sm:w-8 p-0 ${!isScaleSet ? 'border-yellow-500' : ''}`}
                  onClick={onShowScaleDialog}
                  data-testid="button-scale-calibration"
                >
                  <Wand2 className={`h-4 w-4 ${!isScaleSet ? 'text-yellow-500' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isScaleSet ? 'Recalibrate Scale' : 'Set Drawing Scale'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 sm:h-8 sm:w-8 p-0"
            onClick={onShowHelpGuide}
            data-testid="button-drawing-help"
          >
            <Info className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-7 w-7 sm:h-8 sm:w-8 p-0 hover:bg-red-100 dark:hover:bg-red-900/20"
            data-testid="close-drawing-editor"
          >
            <X className="h-4 w-4 text-red-600 dark:text-red-400" />
          </Button>
        </div>
      </div>
    </div>
  );
}
