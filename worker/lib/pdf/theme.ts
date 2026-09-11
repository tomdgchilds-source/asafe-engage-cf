// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/theme.ts
//
// The A-SAFE brand encoded as constants for the PDF renderer (2023 A-SAFE
// Brand Guidelines). Every colour, type size and spacing decision the
// document system makes should trace back to this file so the PDFs, the
// HTML share pages and the email templates stay in step.
//
// Rules this file enforces by construction:
//   - Yellow is the only accent. The secondary palette (red / orange / teal /
//     blue) exists for risk chips, matrix cells and status only. Never use
//     it for headlines or body copy.
//   - Headlines: Helvetica-Bold, uppercase, black or white.
//   - Body: Helvetica regular, left-aligned. No justification, no centring.
//   - Emphasis by weight only; colour is reserved for links and status.
// ────────────────────────────────────────────────────────────────────────────

import { rgb, type RGB } from "pdf-lib";

export const BRAND = {
  yellow: "#FFC72C", // Pantone 7548C, the only accent
  black: "#1D1D1B", // print black (RGB 29/29/27)
  white: "#FFFFFF",
  grey90: "#333331",
  grey60: "#6E6E6B",
  grey40: "#A3A3A0",
  grey20: "#D9D9D6",
  grey8: "#F2F2F0",
  // Secondary palette: infographics and status only, never headlines or body copy
  red: "#E94B5F", // Pantone 1785C – critical
  orange: "#F88D2A", // Pantone 715C  – high
  teal: "#66C9BA", // Pantone 570C  – low / good
  blue: "#92C0E9", // Pantone 283C  – informational
} as const;

export const RISK_COLOURS = {
  low: BRAND.teal,
  medium: BRAND.yellow,
  high: BRAND.orange,
  critical: BRAND.red,
} as const;

export type BrandColourKey = keyof typeof BRAND;
export type RiskLevel = keyof typeof RISK_COLOURS;

/** Tones a chip / tile strip / callout can carry. Risk levels plus neutrals. */
export type Tone = RiskLevel | "black" | "grey" | "yellow" | "white" | "blue" | "neutral";

/** Convert a `#RRGGBB` string to a pdf-lib RGB colour. */
export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Linear mix of two hex colours; `t` = 0 returns `a`, 1 returns `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const va = (pa >> shift) & 255;
    const vb = (pb >> shift) & 255;
    return Math.round(va + (vb - va) * t);
  };
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(ch(16))}${toHex(ch(8))}${toHex(ch(0))}`;
}

/** pdf-lib colour objects, built once. */
export const C: Record<BrandColourKey, RGB> = Object.fromEntries(
  (Object.keys(BRAND) as BrandColourKey[]).map((k) => [k, hexToRgb(BRAND[k])]),
) as Record<BrandColourKey, RGB>;

/** Risk-level colours as pdf-lib RGB. */
export const RISK_RGB: Record<RiskLevel, RGB> = {
  low: hexToRgb(RISK_COLOURS.low),
  medium: hexToRgb(RISK_COLOURS.medium),
  high: hexToRgb(RISK_COLOURS.high),
  critical: hexToRgb(RISK_COLOURS.critical),
};

/** "90 % black": the halo arc tint on black bands. */
export const HALO_ON_BLACK = hexToRgb(mixHex(BRAND.black, BRAND.white, 0.1));

/** Background fill for a tone. */
export function toneFill(tone: Tone): RGB {
  switch (tone) {
    case "low":
    case "medium":
    case "high":
    case "critical":
      return RISK_RGB[tone];
    case "black":
      return C.black;
    case "yellow":
      return C.yellow;
    case "blue":
      return C.blue;
    case "white":
      return C.white;
    case "grey":
    case "neutral":
    default:
      return C.grey20;
  }
}

/** Text colour that reads on `toneFill(tone)`. */
export function toneText(tone: Tone): RGB {
  return tone === "black" || tone === "critical" ? C.white : C.black;
}

/**
 * 5 × 5 likelihood × severity banding. Scores are 1–25.
 *   1–4  low · 5–9 medium · 10–15 high · 16–25 critical
 */
export function riskLevel(score: number): RiskLevel {
  if (score >= 16) return "critical";
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const LIKELIHOOD_DESCRIPTORS: ReadonlyArray<string> = [
  "Rare",
  "Unlikely",
  "Possible",
  "Likely",
  "Almost certain",
];

export const SEVERITY_DESCRIPTORS: ReadonlyArray<string> = [
  "Negligible",
  "Minor",
  "Moderate",
  "Major",
  "Catastrophic",
];

export const TIMESCALES = ["Immediate", "30 days", "90 days", "Planned"] as const;
export type Timescale = (typeof TIMESCALES)[number];

/** Type scale (points). `lead` is the line height. */
export const TYPE = {
  display: { size: 26, lead: 30 }, // cover title
  h1: { size: 20, lead: 24 }, // bold caps
  h2: { size: 13, lead: 17 }, // bold caps + 2 pt yellow underline 24 mm wide
  h3: { size: 10.5, lead: 14 }, // bold, sentence case
  body: { size: 9.5, lead: 13.5 },
  table: { size: 8.5, lead: 11.5 },
  small: { size: 7.5, lead: 10 },
  label: { size: 7, lead: 9, tracking: 0.05 }, // caps, grey60, 0.05 em tracking
  chip: { size: 7, lead: 9 },
  kpi: { size: 22, lead: 26 },
} as const;

/** Page furniture in mm; converted with `mm()` from doc.ts at use sites. */
export const LAYOUT = {
  marginMm: 18,
  footerRulePt: 0.5,
  footerRuleFromBottomMm: 12,
  headerFromTopMm: 11,
  h2UnderlineWidthMm: 24,
  h2UnderlinePt: 2,
  chipHeightMm: 6,
  gutterMm: 4,
} as const;
