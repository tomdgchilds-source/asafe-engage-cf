import { useState } from "react";
import { AlertTriangle, Ban, ChevronDown, ChevronUp, ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAS13_INDICATIVE_FOOTNOTE } from "@shared/pas13Rules";
import type { GuardrailViolation } from "../utils/pas13Guardrails";

/**
 * Stacked panel of inline PAS 13 guardrail violations. Renders to the
 * right of the Layout Drawing canvas (collapsible). Each row carries:
 *
 *   - Severity icon (warning / error)
 *   - Message + a "Show on canvas" pulse trigger
 *   - Citation chip (clickable; opens the deep-link PAS 13 PDF page)
 *
 * Wording is locked to σ's "PAS 13 aligned / borderline / not aligned"
 * vocabulary — no "compliant" anywhere — and the panel always renders
 * the indicative footnote so legal can't drift on us.
 */
export interface Pas13GuardrailPanelProps {
  violations: readonly GuardrailViolation[];
  /** Pulse the matching markup on the canvas. */
  onShowOnCanvas: (markupId: string) => void;
  /** Mirrors the admin "Disable guardrails" toggle. */
  isDisabled: boolean;
  /** Toggle the admin silence switch (writes to localStorage). */
  onToggleDisabled: () => void;
}

export function Pas13GuardrailPanel({
  violations,
  onShowOnCanvas,
  isDisabled,
  onToggleDisabled,
}: Pas13GuardrailPanelProps) {
  const [collapsed, setCollapsed] = useState<boolean>(false);

  const errorCount = violations.filter((v) => v.severity === "error").length;
  const warnCount = violations.filter((v) => v.severity === "warning").length;
  const verdictLabel = isDisabled
    ? "guardrails silenced"
    : errorCount > 0
      ? "not aligned"
      : warnCount > 0
        ? "borderline"
        : "aligned";
  const verdictColour = isDisabled
    ? "bg-gray-500"
    : errorCount > 0
      ? "bg-red-600"
      : warnCount > 0
        ? "bg-amber-500"
        : "bg-emerald-600";

  return (
    <div
      className={cn(
        "absolute touch-enhanced flex flex-col gap-1 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700",
        "max-h-[60vh] w-[300px] sm:w-[320px] overflow-hidden",
      )}
      style={{
        zIndex: 55,
        top: "max(4rem, env(safe-area-inset-top, 0px) + 4rem)",
        right: "max(0.5rem, env(safe-area-inset-right, 0px) + 0.5rem)",
      }}
      data-testid="pas13-guardrail-panel"
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg"
        aria-expanded={!collapsed}
        data-testid="pas13-guardrail-toggle"
      >
        <div className="flex items-center gap-2 min-w-0">
          {errorCount > 0 ? (
            <ShieldAlert className="h-4 w-4 text-red-600 flex-shrink-0" />
          ) : warnCount > 0 ? (
            <ShieldAlert className="h-4 w-4 text-amber-500 flex-shrink-0" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
          )}
          <h3 className="text-sm font-semibold truncate">PAS 13 Checks</h3>
          <span
            className={cn(
              "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white",
              verdictColour,
            )}
            data-testid="pas13-verdict-badge"
          >
            {verdictLabel}
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        )}
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="overflow-y-auto -webkit-overflow-scrolling-touch">
          {isDisabled ? (
            <div className="px-3 py-3 text-xs text-gray-600 dark:text-gray-400 space-y-2">
              <p>
                PAS 13 guardrails are silenced. Re-enable them so the canvas
                can flag post-centre, deflection-zone, and substrate issues
                in real time.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={onToggleDisabled}
                className="w-full text-xs"
                data-testid="pas13-guardrails-enable"
              >
                Re-enable PAS 13 guardrails
              </Button>
            </div>
          ) : violations.length === 0 ? (
            <div className="px-3 py-4 text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">PAS 13 aligned</p>
                <p className="text-gray-600 dark:text-gray-400 mt-0.5">
                  No live PAS 13 issues detected on the current markups.
                </p>
              </div>
            </div>
          ) : (
            <ul
              className="divide-y dark:divide-gray-700"
              data-testid="pas13-violation-list"
            >
              {violations.map((v) => (
                <ViolationRow
                  key={v.id}
                  violation={v}
                  onShowOnCanvas={() => onShowOnCanvas(v.markupId)}
                />
              ))}
            </ul>
          )}

          {/* Footer — admin disable toggle + indicative footnote (locked
              wording per σ engine). */}
          <div className="px-3 py-2 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-[10px] text-gray-500 dark:text-gray-400 space-y-1.5">
            <p>{PAS13_INDICATIVE_FOOTNOTE}</p>
            {!isDisabled && (
              <button
                type="button"
                onClick={onToggleDisabled}
                className="underline hover:text-gray-700 dark:hover:text-gray-200"
                data-testid="pas13-guardrails-disable"
              >
                Disable PAS 13 guardrails (admin)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ViolationRow({
  violation,
  onShowOnCanvas,
}: {
  violation: GuardrailViolation;
  onShowOnCanvas: () => void;
}) {
  const isError = violation.severity === "error";
  const Icon = isError ? Ban : AlertTriangle;
  return (
    <li
      className="px-3 py-2 flex flex-col gap-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50"
      data-testid={`pas13-violation-${violation.code}`}
    >
      <div className="flex items-start gap-2">
        <Icon
          className={cn(
            "h-4 w-4 flex-shrink-0 mt-0.5",
            isError ? "text-red-600" : "text-amber-500",
          )}
          aria-hidden
        />
        <p className="text-xs leading-snug text-gray-800 dark:text-gray-200">
          {violation.message}
        </p>
      </div>
      <div className="flex items-center gap-1.5 pl-6">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
          onClick={onShowOnCanvas}
          data-testid={`pas13-violation-show-${violation.code}`}
        >
          Show on canvas
        </Button>
        {violation.citation && (
          <a
            href={violation.citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 px-1.5 py-0.5 rounded"
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
