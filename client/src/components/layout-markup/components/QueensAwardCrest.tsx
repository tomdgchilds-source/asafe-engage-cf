/**
 * Stylised Queens Award for Enterprise emblem, rendered as inline SVG so it
 * scales crisply on screen and in html2canvas-driven PDF exports without
 * needing a PNG asset. Not an exact heraldic reproduction of the official
 * crest — it's a branded visual placeholder that matches the size + spirit
 * of the emblem on the manually-produced A-SAFE CAD sheet.
 *
 * If / when you drop the official PNG in /client/src/assets/, swap the SVG
 * for an <img> and keep the same 40x40 box.
 */
export function QueensAwardCrest({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 60 60"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Queens Award for Enterprise"
    >
      {/* Laurel-wreath ring */}
      <circle cx="30" cy="30" r="28" fill="#fff" stroke="#1b3a78" strokeWidth="1" />
      <g stroke="#1b3a78" strokeWidth="0.8" fill="none" strokeLinecap="round">
        {/* Left laurel arc */}
        <path d="M12 40 Q6 30 12 20" />
        <path d="M14 38 L10 36" />
        <path d="M13 34 L9 32" />
        <path d="M13 30 L9 28" />
        <path d="M14 26 L10 24" />
        <path d="M15 22 L11 20" />
        {/* Right laurel arc */}
        <path d="M48 40 Q54 30 48 20" />
        <path d="M46 38 L50 36" />
        <path d="M47 34 L51 32" />
        <path d="M47 30 L51 28" />
        <path d="M46 26 L50 24" />
        <path d="M45 22 L49 20" />
      </g>

      {/* Crown (stylised) */}
      <g fill="#c8a64b" stroke="#7a5e1e" strokeWidth="0.5">
        <path d="M22 14 L24 10 L26 14 L28 9 L30 14 L32 9 L34 14 L36 10 L38 14 L38 18 L22 18 Z" />
        <circle cx="24" cy="10" r="0.9" fill="#b22234" />
        <circle cx="28" cy="9" r="0.9" fill="#b22234" />
        <circle cx="32" cy="9" r="0.9" fill="#b22234" />
        <circle cx="36" cy="10" r="0.9" fill="#b22234" />
      </g>

      {/* Central shield / "E" mark */}
      <g>
        <rect x="23" y="22" width="14" height="18" rx="2" fill="#1b3a78" stroke="#1b3a78" />
        <text
          x="30"
          y="34.5"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="13"
          fontWeight="bold"
          textAnchor="middle"
          fill="#f4c63b"
        >
          E
        </text>
      </g>

      {/* Banner */}
      <g>
        <path
          d="M14 46 L46 46 L44 52 L16 52 Z"
          fill="#b22234"
          stroke="#7a1822"
          strokeWidth="0.5"
        />
        <text
          x="30"
          y="50.5"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="4.2"
          fontWeight="bold"
          textAnchor="middle"
          fill="#fff"
          letterSpacing="0.5"
        >
          QUEENS AWARD
        </text>
      </g>
    </svg>
  );
}
