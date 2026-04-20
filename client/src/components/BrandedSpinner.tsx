import asafeIcon from "@/assets/asafe-icon-yellow.png";

/**
 * Branded A-SAFE loading spinner.
 *
 * Shows the yellow A-SAFE icon with a rotating triangular wedge orbiting
 * around it. Use in place of generic Loader2 / spinner animations.
 *
 * <BrandedSpinner size={48} />
 * <BrandedSpinner size="sm" />  // 20px
 * <BrandedSpinner size="md" />  // 40px
 * <BrandedSpinner size="lg" />  // 72px
 * <BrandedSpinner size="xl" />  // 128px (for fullscreen loading)
 */
type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl" | number;

const SIZE_MAP: Record<Exclude<SpinnerSize, number>, number> = {
  xs: 16,
  sm: 20,
  md: 40,
  lg: 72,
  xl: 128,
};

interface BrandedSpinnerProps {
  size?: SpinnerSize;
  /** Optional label rendered below the spinner (e.g. "Uploading…"). */
  label?: string;
  /** If true, rotates in the reverse direction. */
  reverse?: boolean;
  className?: string;
}

export function BrandedSpinner({
  size = "md",
  label,
  reverse = false,
  className = "",
}: BrandedSpinnerProps) {
  const px = typeof size === "number" ? size : SIZE_MAP[size];

  return (
    <div className={`inline-flex flex-col items-center justify-center gap-2 ${className}`}>
      <div
        className="relative"
        style={{ width: px, height: px }}
        role="status"
        aria-label={label || "Loading"}
      >
        {/* Static A-SAFE icon in centre (60% of container so the arc orbits outside it) */}
        <img
          src={asafeIcon}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 m-auto object-contain"
          style={{ width: px * 0.58, height: px * 0.58 }}
        />

        {/* Rotating wedge (SVG arc) orbiting around the icon */}
        <svg
          viewBox="-50 -50 100 100"
          className="absolute inset-0"
          style={{
            animation: `asafe-spin ${reverse ? "1.4s" : "1.2s"} linear infinite${reverse ? " reverse" : ""}`,
          }}
        >
          {/* Primary wedge: a thick, short arc (strokeDasharray) that reads as a rotating wedge */}
          <circle
            cx="0"
            cy="0"
            r="44"
            fill="none"
            stroke="#FFC72C"
            strokeWidth={px < 28 ? 6 : 4}
            strokeDasharray="36 260"
            strokeLinecap="round"
          />
        </svg>
      </div>
      {label && (
        <span className="text-xs text-muted-foreground font-medium animate-pulse">
          {label}
        </span>
      )}
    </div>
  );
}

/** Full-page centred spinner for route transitions. */
export function BrandedPageLoader({ label }: { label?: string }) {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <BrandedSpinner size="xl" label={label || "Loading…"} />
    </div>
  );
}

/** Compact inline spinner for buttons. */
export function BrandedInlineSpinner({ className = "" }: { className?: string }) {
  return <BrandedSpinner size="xs" className={className} />;
}
