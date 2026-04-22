// ────────────────────────────────────────────────────────────────────────────
// Pas13VerdictPanel
//
// UI surface for a Pas13Verdict — verdict chip (green/amber/red), headline
// summary, required-vs-rated joules, cited §sections as small chips, and the
// mandatory "Indicative" footnote. The accompanying barrier-recommendation
// logic lives in VehicleImpactCalculator and is UNCHANGED — this panel is
// additive. Wording is locked ("PAS 13 aligned" / "borderline alignment" /
// "not PAS 13 aligned" — never "compliant").
// ────────────────────────────────────────────────────────────────────────────
import { CheckCircle, AlertTriangle, XCircle, Shield, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Pas13Verdict } from "@shared/pas13Rules";

function verdictColours(verdict: Pas13Verdict["verdict"]) {
  if (verdict === "aligned") {
    return {
      chip: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-300",
      ring: "border-green-400",
      accent: "text-green-600 dark:text-green-400",
      icon: CheckCircle,
      label: "PAS 13 aligned",
    };
  }
  if (verdict === "borderline") {
    return {
      chip: "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200 border-yellow-400",
      ring: "border-yellow-500",
      accent: "text-yellow-700 dark:text-yellow-300",
      icon: AlertTriangle,
      label: "Borderline alignment",
    };
  }
  return {
    chip: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-400",
    ring: "border-red-500",
    accent: "text-red-600 dark:text-red-400",
    icon: XCircle,
    label: "Not PAS 13 aligned",
  };
}

export interface Pas13VerdictPanelProps {
  verdict: Pas13Verdict;
  /** When true, render as a light inline strip (used on the Compliance Checker
   *  per-line-item list). Default is false — a full card. */
  compact?: boolean;
}

export function Pas13VerdictPanel({ verdict, compact = false }: Pas13VerdictPanelProps) {
  const c = verdictColours(verdict.verdict);
  const Icon = c.icon;

  const marginLabel = `${verdict.details.safetyMarginPct > 0 ? "+" : ""}${verdict.details.safetyMarginPct.toFixed(
    1,
  )}%`;

  if (compact) {
    return (
      <div
        className={`flex flex-col gap-2 rounded-md border p-3 ${c.ring}`}
        data-testid="pas13-verdict-panel"
        data-verdict={verdict.verdict}
      >
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${c.accent}`} />
          <span className={`text-xs font-semibold uppercase tracking-wide ${c.accent}`}>
            {c.label}
          </span>
          <Badge className={`ml-auto border ${c.chip}`} data-testid="pas13-safety-margin">
            {marginLabel} margin
          </Badge>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-200">{verdict.summary}</p>
        <div className="flex flex-wrap gap-1">
          {verdict.citations.map((cite) => (
            <a
              key={`${cite.section}-${cite.page ?? ""}`}
              href={"url" in cite && cite.url ? cite.url : undefined}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded border border-gray-300 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <FileText className="h-3 w-3" />
              {cite.shortLabel}
            </a>
          ))}
        </div>
        <p className="text-[10px] italic text-gray-500 dark:text-gray-400">
          {verdict.footnote}
        </p>
      </div>
    );
  }

  return (
    <Card className={`border-2 ${c.ring}`} data-testid="pas13-verdict-panel" data-verdict={verdict.verdict}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className={`h-5 w-5 ${c.accent}`} />
          <span>PAS 13:2017 alignment</span>
          <Badge className={`ml-auto border ${c.chip}`}>
            <Icon className="mr-1 h-3.5 w-3.5" />
            {c.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-100" data-testid="pas13-summary">
          {verdict.summary}
        </p>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Required absorbed energy (at 45°)
            </p>
            <p className="text-lg font-semibold" data-testid="pas13-required-joules">
              {verdict.details.requiredJoulesAt45deg.toLocaleString()} J
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Product rated (at 45°)
            </p>
            <p className="text-lg font-semibold" data-testid="pas13-rated-joules">
              {verdict.details.productRatedJoulesAt45deg.toLocaleString()} J
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Safety margin
            </p>
            <p className={`text-lg font-semibold ${c.accent}`} data-testid="pas13-margin-pct">
              {marginLabel}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Transfer factor (sin²θ)
            </p>
            <p className="text-lg font-semibold">
              {(verdict.details.energyTransferFactor * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Deflection zone required
            </p>
            <p className="text-sm font-medium">
              ≥ {verdict.details.deflectionZoneRequiredMm} mm
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Deflection zone on site
            </p>
            <p className="text-sm font-medium">
              {verdict.details.deflectionZoneAvailableMm === null
                ? "Not measured"
                : `${verdict.details.deflectionZoneAvailableMm} mm`}
            </p>
          </div>
        </div>

        {verdict.citations.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
              Cited sections
            </p>
            <div className="flex flex-wrap gap-1.5">
              {verdict.citations.map((cite) => (
                <a
                  key={`${cite.section}-${cite.page ?? ""}`}
                  href={"url" in cite && cite.url ? cite.url : undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-gray-300 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                  data-testid={`pas13-cite-${cite.section}`}
                >
                  <FileText className="h-3 w-3" />
                  {cite.shortLabel}
                </a>
              ))}
            </div>
          </div>
        )}

        {verdict.warnings.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-xs text-yellow-700 dark:text-yellow-300">
            {verdict.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}

        {verdict.notes.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-xs text-gray-500 dark:text-gray-400">
            {verdict.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}

        <p className="pt-1 text-[11px] italic text-gray-500 dark:text-gray-400">
          {verdict.footnote}
        </p>
      </CardContent>
    </Card>
  );
}
