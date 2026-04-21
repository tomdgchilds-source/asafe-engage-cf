/**
 * TierSwitcher
 *
 * 3-option segmented control presenting the Good / Better / Best
 * barrier ladder for a single cart line or calculator recommendation.
 *
 * Each option shows:
 *   - Tier label + safety margin percentage ("Better · +35%")
 *   - Family name (small, muted)
 *   - AED unit-price delta vs. the currently-selected tier
 *     ("+1,820" grey / "-320" green / "—" when null)
 *
 * Selected tier: yellow (#FFC72C) background with black text.
 * Recommended tier (when not already selected): thin yellow ring plus
 *   an uppercase "RECOMMENDED" eyebrow.
 * Disabled: opacity-60 and pointer-events suppressed.
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  SAFETY_FACTORS,
  TIER_ORDER,
  type BarrierLadder,
  type BarrierTier,
} from "@/utils/barrierLadders";

export interface TierSwitcherProps {
  ladder: BarrierLadder;
  currentTier: BarrierTier;
  recommendedTier?: BarrierTier;
  pricesByTier: Record<BarrierTier, number | null>;
  joulesByTier: Record<BarrierTier, number | null>;
  onSelect: (tier: BarrierTier) => void;
  disabled?: boolean;
  className?: string;
}

const TIER_LABELS: Record<BarrierTier, string> = {
  good: "Good",
  better: "Better",
  best: "Best",
};

/** Format a price delta: positive green-down (cheaper), negative grey-up (more expensive). Returns JSX for styling. */
function formatDelta(delta: number | null): { label: string; cheaper: boolean } | null {
  if (delta == null || !Number.isFinite(delta)) return null;
  if (Math.abs(delta) < 0.5) return { label: "±0", cheaper: false };
  const abs = Math.round(Math.abs(delta)).toLocaleString();
  if (delta < 0) return { label: `\u2212${abs}`, cheaper: true };
  return { label: `+${abs}`, cheaper: false };
}

/** `+35%`, `+15%`, `+70%` — the safety factor margin as a percent string. */
function marginLabel(tier: BarrierTier): string {
  const f = SAFETY_FACTORS[tier];
  if (typeof f !== "number") return "";
  const pct = Math.round((f - 1) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

export function TierSwitcher({
  ladder,
  currentTier,
  recommendedTier,
  pricesByTier,
  joulesByTier,
  onSelect,
  disabled = false,
  className,
}: TierSwitcherProps) {
  // Base price is the currently-selected tier's unit price — all deltas
  // are computed relative to it. When the current tier has no price
  // (null), deltas collapse to "—" across the board.
  const currentPrice = pricesByTier[currentTier];

  const cards = useMemo(() => {
    return TIER_ORDER.map((tier) => {
      const tierCfg = ladder.tiers[tier];
      const price = pricesByTier[tier];
      const joules = joulesByTier[tier];
      const isSelected = tier === currentTier;
      const isRecommended = recommendedTier === tier && !isSelected;
      const delta =
        currentPrice != null && price != null ? price - currentPrice : null;
      return {
        tier,
        label: TIER_LABELS[tier],
        margin: marginLabel(tier),
        family: tierCfg?.family ?? "",
        rationale: tierCfg?.rationale ?? "",
        price,
        joules,
        delta,
        isSelected,
        isRecommended,
      };
    });
  }, [ladder, currentTier, recommendedTier, pricesByTier, joulesByTier, currentPrice]);

  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-2",
        disabled && "opacity-60 pointer-events-none",
        className,
      )}
      data-testid="tier-switcher"
      aria-label="Barrier tier selection"
    >
      {cards.map((c) => {
        const deltaObj = formatDelta(c.delta);
        return (
          <button
            type="button"
            key={c.tier}
            onClick={() => {
              if (disabled) return;
              if (c.isSelected) return;
              onSelect(c.tier);
            }}
            disabled={disabled}
            data-testid={`tier-option-${c.tier}`}
            aria-pressed={c.isSelected}
            title={c.rationale || `${c.label} · ${c.family}`}
            className={cn(
              "relative text-left rounded-md border p-3 transition-all focus:outline-none",
              "focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[#FFC72C]",
              c.isSelected
                ? "bg-[#FFC72C] text-black border-[#FFC72C] shadow-sm"
                : "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700 hover:border-gray-400",
              c.isRecommended &&
                "ring-2 ring-offset-1 ring-[#FFC72C] border-[#FFC72C]/50",
            )}
          >
            {c.isRecommended && (
              <div
                className="text-[10px] font-bold uppercase tracking-wider text-[#B8860B] mb-1"
                data-testid={`tier-recommended-${c.tier}`}
              >
                Recommended
              </div>
            )}
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold">{c.label}</span>
              <span
                className={cn(
                  "text-[11px] font-medium",
                  c.isSelected ? "text-black/70" : "text-gray-500 dark:text-gray-400",
                )}
              >
                · {c.margin}
              </span>
            </div>
            <div
              className={cn(
                "text-[11px] mt-0.5 truncate",
                c.isSelected ? "text-black/70" : "text-gray-500 dark:text-gray-400",
              )}
              title={c.family}
            >
              {c.family || "—"}
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span
                className={cn(
                  "text-[11px] font-mono",
                  c.isSelected ? "text-black/80" : "text-gray-600 dark:text-gray-300",
                )}
              >
                {c.joules != null
                  ? `${c.joules.toLocaleString()}J`
                  : "—"}
              </span>
              {c.isSelected ? (
                <span className="text-[11px] font-semibold text-black/80">
                  Selected
                </span>
              ) : c.price == null ? (
                <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
                  —
                </span>
              ) : deltaObj == null ? (
                <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
                  —
                </span>
              ) : (
                <span
                  className={cn(
                    "text-[11px] font-semibold tabular-nums",
                    deltaObj.cheaper ? "text-green-600" : "text-gray-600 dark:text-gray-400",
                  )}
                >
                  {deltaObj.label}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default TierSwitcher;
