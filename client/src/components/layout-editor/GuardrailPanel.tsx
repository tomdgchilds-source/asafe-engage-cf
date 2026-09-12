/**
 * client/src/components/layout-editor/GuardrailPanel.tsx
 *
 * Stacked panel of live PAS 13 guardrail violations — a straight port of
 * layout-markup/components/Pas13GuardrailPanel.tsx (same look, same
 * locked "aligned / borderline / not aligned" vocabulary, same
 * indicative footnote) with `onShowOnCanvas` now taking an element id.
 * Positioning is left to the Editor via `className`/`style`.
 */

import { useState, type CSSProperties } from "react";
import { AlertTriangle, Ban, ChevronDown, ChevronUp, ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAS13_INDICATIVE_FOOTNOTE } from "@shared/pas13Rules";
import type { GuardrailViolation } from "./guardrails";

export interface GuardrailPanelProps {
  violations: readonly GuardrailViolation[];
  /** Pulse the matching element on the canvas. */
  onShowOnCanvas: (elementId: string) => void;
  /** Mirrors the admin "Disable guardrails" toggle. */
  isDisabled: boolean;
  onToggleDisabled: () => void;
  defaultCollapsed?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function GuardrailPanel({ violations, onShowOnCanvas, isDisabled, onToggleDisabled, defaultCollapsed = false, className, style }: GuardrailPanelProps) {
  const [collapsed, setCollapsed] = useState<boolean>(defaultCollapsed);

  const errorCount = violations.filter((v) => v.severity === "error").length;
  const warnCount = violations.filter((v) => v.severity === "warning").length;
  const verdictLabel = isDisabled ? "guardrails silenced" : errorCount > 0 ? "not aligned" : warnCount > 0 ? "borderline" : "aligned";
  const verdictColour = isDisabled ? "bg-gray-500" : errorCount > 0 ? "bg-red-600" : warnCount > 0 ? "bg-amber-500" : "bg-emerald-600";

  return (
    <div
      className={cn(
        "pointer-events-auto flex flex-col gap-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900",
        "max-h-[60vh] w-[300px] sm:w-[320px]",
        className,
      )}
      style={style}
      data-testid="pas13-guardrail-panel"
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between gap-2 rounded-t-lg border-b bg-gray-50 px-3 py-2 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
        aria-expanded={!collapsed}
        data-testid="pas13-guardrail-toggle"
      >
        <div className="flex min-w-0 items-center gap-2">
          {errorCount > 0 ? (
            <ShieldAlert className="h-4 w-4 flex-shrink-0 text-red-600" />
          ) : warnCount > 0 ? (
            <ShieldAlert className="h-4 w-4 flex-shrink-0 text-amber-500" />
          ) : (
            <ShieldCheck className="h-4 w-4 flex-shrink-0 text-emerald-600" />
          )}
          <h3 className="truncate text-sm font-semibold">PAS 13 Checks</h3>
          <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white", verdictColour)} data-testid="pas13-verdict-badge">
            {verdictLabel}
          </span>
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronUp className="h-4 w-4 text-gray-500" />}
      </button>

      {!collapsed && (
        <div className="overflow-y-auto">
          {isDisabled ? (
            <div className="space-y-2 px-3 py-3 text-xs text-gray-600 dark:text-gray-400">
              <p>PAS 13 guardrails are silenced. Re-enable them so the canvas can flag post-centre, deflection-zone, and substrate issues in real time.</p>
              <Button variant="outline" size="sm" onClick={onToggleDisabled} className="w-full text-xs" data-testid="pas13-guardrails-enable">
                Re-enable PAS 13 guardrails
              </Button>
            </div>
          ) : violations.length === 0 ? (
            <div className="flex items-start gap-2 px-3 py-4 text-xs text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>
                <p className="font-medium">PAS 13 aligned</p>
                <p className="mt-0.5 text-gray-600 dark:text-gray-400">No live PAS 13 issues detected on the current drawing.</p>
              </div>
            </div>
          ) : (
            <ul className="divide-y dark:divide-gray-700" data-testid="pas13-violation-list">
              {violations.map((v) => (
                <ViolationRow key={v.id} violation={v} onShowOnCanvas={() => onShowOnCanvas(v.elementId)} />
              ))}
            </ul>
          )}

          <div className="space-y-1.5 border-t bg-gray-50 px-3 py-2 text-[10px] text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
            <p>{PAS13_INDICATIVE_FOOTNOTE}</p>
            {!isDisabled && (
              <button type="button" onClick={onToggleDisabled} className="underline hover:text-gray-700 dark:hover:text-gray-200" data-testid="pas13-guardrails-disable">
                Disable PAS 13 guardrails (admin)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ViolationRow({ violation, onShowOnCanvas }: { violation: GuardrailViolation; onShowOnCanvas: () => void }) {
  const isError = violation.severity === "error";
  const Icon = isError ? Ban : AlertTriangle;
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50" data-testid={`pas13-violation-${violation.code}`}>
      <div className="flex items-start gap-2">
        <Icon className={cn("mt-0.5 h-4 w-4 flex-shrink-0", isError ? "text-red-600" : "text-amber-500")} aria-hidden />
        <p className="text-xs leading-snug text-gray-800 dark:text-gray-200">{violation.message}</p>
      </div>
      <div className="flex items-center gap-1.5 pl-6">
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30" onClick={onShowOnCanvas} data-testid={`pas13-violation-show-${violation.code}`}>
          Show on canvas
        </Button>
        {violation.citation && (
          <a
            href={violation.citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            data-testid={`pas13-violation-cite-${violation.code}`}
          >
            {violation.citation.shortLabel}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
    </li>
  );
}
