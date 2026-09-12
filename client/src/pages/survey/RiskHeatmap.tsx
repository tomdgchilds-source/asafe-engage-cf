// ─────────────────────────────────────────────────────────
// RiskHeatmap — the 5×5 likelihood × severity matrix for a survey
// (Phase 3, Task S5). Pure SVG, no chart library; colours come from the
// register bands so the legend and the cells can never disagree.
//
//   matrix[likelihood - 1][severity - 1] = number of assessed areas
//
// Likelihood runs bottom (1, Rare) to top (5, Almost certain); severity
// runs left (1, Negligible) to right (5, Catastrophic). Counts are printed
// in occupied cells; empty cells stay tinted so the banding reads at a
// glance. Text uses the theme tokens so the chart works in dark mode.
// ─────────────────────────────────────────────────────────
import { useId } from "react";
import {
  LIKELIHOOD_DESCRIPTORS,
  SEVERITY_DESCRIPTORS,
  RISK_LEVEL_BANDS,
  riskLevel,
  type RiskLevel,
  type RiskLevelBand,
} from "@shared/risk";
import { cn } from "@/lib/utils";

/** One colour per band, shared with the level chips on the register table. */
export const LEVEL_COLORS: Record<RiskLevel, string> = {
  low: "#16a34a",
  medium: "#ca8a04",
  high: "#ea580c",
  critical: "#dc2626",
};

const CELL = 48;
const GAP = 4;
const AXIS_LEFT = 34;
const AXIS_BOTTOM = 30;
const PAD = 6;
const GRID = CELL * 5 + GAP * 4;
const WIDTH = AXIS_LEFT + GRID + PAD;
const HEIGHT = PAD + GRID + AXIS_BOTTOM;

export interface RiskHeatmapProps {
  matrix: readonly (readonly number[])[] | undefined;
  bands?: readonly RiskLevelBand[];
  /** Ring the cell for this pair (e.g. the row the rep has expanded). */
  highlight?: { likelihood: number | null; severity: number | null } | null;
  onCellClick?: (likelihood: number, severity: number, count: number) => void;
  /** Hide the band legend beneath the chart. */
  hideLegend?: boolean;
  className?: string;
}

function cellCount(matrix: RiskHeatmapProps["matrix"], likelihood: number, severity: number): number {
  const n = matrix?.[likelihood - 1]?.[severity - 1];
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

export function RiskHeatmap({ matrix, bands = RISK_LEVEL_BANDS, highlight, onCellClick, hideLegend, className }: RiskHeatmapProps) {
  const titleId = useId();
  const total = (matrix ?? []).reduce((s, row) => s + row.reduce((r, n) => r + (n || 0), 0), 0);

  const cells: JSX.Element[] = [];
  for (let l = 5; l >= 1; l -= 1) {
    for (let s = 1; s <= 5; s += 1) {
      const count = cellCount(matrix, l, s);
      const score = l * s;
      const level = riskLevel(score);
      const x = AXIS_LEFT + (s - 1) * (CELL + GAP);
      const y = PAD + (5 - l) * (CELL + GAP);
      const isHighlight = highlight?.likelihood === l && highlight?.severity === s;
      const label = `${LIKELIHOOD_DESCRIPTORS[l - 1]} likelihood × ${SEVERITY_DESCRIPTORS[s - 1]} severity: score ${score}, ${level}, ${count} area${count === 1 ? "" : "s"}`;
      cells.push(
        <g
          key={`${l}-${s}`}
          data-testid={`heatmap-cell-${l}-${s}`}
          role={onCellClick ? "button" : undefined}
          tabIndex={onCellClick ? 0 : undefined}
          onClick={onCellClick ? () => onCellClick(l, s, count) : undefined}
          onKeyDown={
            onCellClick
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onCellClick(l, s, count);
                  }
                }
              : undefined
          }
          className={cn(onCellClick && "cursor-pointer focus:outline-none")}
        >
          <title>{label}</title>
          <rect
            x={x}
            y={y}
            width={CELL}
            height={CELL}
            rx={6}
            fill={LEVEL_COLORS[level]}
            fillOpacity={count > 0 ? 0.9 : 0.16}
            stroke={isHighlight ? "var(--foreground)" : "transparent"}
            strokeWidth={isHighlight ? 2.5 : 0}
          />
          <text
            x={x + CELL / 2}
            y={y + CELL / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={count > 0 ? 18 : 10}
            fontWeight={count > 0 ? 700 : 500}
            fill={count > 0 ? "#ffffff" : "var(--muted-foreground)"}
            fillOpacity={count > 0 ? 1 : 0.7}
          >
            {count > 0 ? count : score}
          </text>
        </g>,
      );
    }
  }

  return (
    <figure className={cn("w-full", className)} data-testid="risk-heatmap">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
        className="mx-auto block h-auto w-full max-w-[340px]"
      >
        <title id={titleId}>
          Risk heatmap: {total} assessed area{total === 1 ? "" : "s"} by likelihood and severity
        </title>

        {/* Y axis: likelihood ratings, 5 at the top */}
        {[5, 4, 3, 2, 1].map((l) => (
          <text
            key={`y-${l}`}
            x={AXIS_LEFT - 8}
            y={PAD + (5 - l) * (CELL + GAP) + CELL / 2}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={11}
            fontWeight={600}
            fill="var(--muted-foreground)"
          >
            <title>{LIKELIHOOD_DESCRIPTORS[l - 1]}</title>
            {l}
          </text>
        ))}
        <text
          transform={`translate(10 ${PAD + GRID / 2}) rotate(-90)`}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10}
          letterSpacing={1}
          fill="var(--muted-foreground)"
        >
          LIKELIHOOD
        </text>

        {cells}

        {/* X axis: severity ratings */}
        {[1, 2, 3, 4, 5].map((s) => (
          <text
            key={`x-${s}`}
            x={AXIS_LEFT + (s - 1) * (CELL + GAP) + CELL / 2}
            y={PAD + GRID + 12}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fontWeight={600}
            fill="var(--muted-foreground)"
          >
            <title>{SEVERITY_DESCRIPTORS[s - 1]}</title>
            {s}
          </text>
        ))}
        <text
          x={AXIS_LEFT + GRID / 2}
          y={PAD + GRID + 25}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10}
          letterSpacing={1}
          fill="var(--muted-foreground)"
        >
          SEVERITY
        </text>
      </svg>

      {!hideLegend && (
        <figcaption className="mt-2 space-y-1.5">
          <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs" aria-label="Risk level bands">
            {bands.map((b) => (
              <li key={b.level} className="flex items-center gap-1.5" title={`${b.description} Action: ${b.actionTimescale}.`}>
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: LEVEL_COLORS[b.level] }} aria-hidden />
                <span className="font-medium">{b.label}</span>
                <span className="text-muted-foreground">{b.range}</span>
              </li>
            ))}
          </ul>
          <p className="text-center text-[11px] leading-snug text-muted-foreground">
            Likelihood 1 {LIKELIHOOD_DESCRIPTORS[0]} → 5 {LIKELIHOOD_DESCRIPTORS[4]} · Severity 1 {SEVERITY_DESCRIPTORS[0]} → 5{" "}
            {SEVERITY_DESCRIPTORS[4]}
          </p>
        </figcaption>
      )}
    </figure>
  );
}

export default RiskHeatmap;
