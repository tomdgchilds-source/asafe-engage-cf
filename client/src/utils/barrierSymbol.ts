/**
 * barrierSymbol.ts
 *
 * Pure module that converts a barrier polyline (traced by a sales rep over a
 * calibrated CAD drawing) into scale-accurate top-view geometry: posts drawn
 * as filled circles at their real outside diameter, rails as rectangles
 * between consecutive posts. The output is consumed by both the SVG layout
 * editor and the jsPDF order-form PDF generator, so this module is kept
 * dependency-free (no React, no `@/components/...` imports).
 *
 * Top-view convention: multi-rail families (2-rail, 3-rail) are
 * indistinguishable in plan view, so we always draw a single rail per run
 * regardless of the product's rail count. Every polyline vertex is itself a
 * post; intermediate posts are evenly distributed along each segment with a
 * max centre-to-centre spacing of 2200mm.
 *
 * "Min 2px" rule: at very small drawing scales (large plans zoomed out),
 * scale-accurate post radii and rail widths can drop below 1px and vanish.
 * We clamp post radius to >=2px and rail width to >=1.5px so the symbols
 * remain visible even on tiny thumbnails.
 */

export interface BarrierSpec {
  /** Display label for the family (e.g. "iFlex 190 Traffic") */
  family: string;
  /** Post outside diameter in mm */
  postOdMm: number;
  /** Max centre-to-centre post spacing in mm */
  maxCentreSpacingMm: number;
  /** Visual width of the rail rectangle in plan view (mm) */
  railWidthMm: number;
  /** Primary rail colour (hex) */
  railColour: string;
  /** Post colour (hex) */
  postColour: string;
}

export interface PolylinePoint {
  x: number;
  y: number;
}

export interface BarrierSymbolPost {
  x: number;
  y: number;
  radiusPx: number;
  colour: string;
}

export interface BarrierSymbolRail {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  widthPx: number;
  colour: string;
}

export interface BarrierSymbol {
  posts: BarrierSymbolPost[];
  /** Each rail bay between two consecutive posts */
  rails: BarrierSymbolRail[];
  /** Derived stats for the hover label */
  totalLengthMm: number;
  postCount: number;
  railCount: number;
  spec: BarrierSpec;
}

export type SpecKey =
  | "iFlex 190 Traffic"
  | "iFlex 190 Pedestrian"
  | "eFlex 130"
  | "mFlex 158"
  | "Atlas 190"
  | "Monoplex 130"
  | "Monoplex 190"
  | "130-T0-P3"
  | "190-T-series"
  | "Topple Barrier"
  | "Cold Storage iFlex";

interface SpecEntry {
  spec: BarrierSpec;
  matchers: RegExp[];
}

const MIN_POST_RADIUS_PX = 2;
const MIN_RAIL_WIDTH_PX = 1.5;
const JOIN_DEDUPE_EPSILON_PX = 0.1;

/**
 * Spec table. Order matters: matchers are tried top-to-bottom, and the first
 * entry whose regexes hit wins. Cold Storage sits above the plain iFlex
 * entries so the CS override takes precedence over the generic iFlex
 * matcher.
 */
const SPECS: Record<SpecKey, SpecEntry> = {
  "Cold Storage iFlex": {
    spec: {
      family: "Cold Storage iFlex",
      postOdMm: 190,
      maxCentreSpacingMm: 2200,
      railWidthMm: 125,
      railColour: "#F5F5F5",
      postColour: "#1f1f1f",
    },
    matchers: [
      /\bCS\b.*traffic/i,
      /cold storage.*traffic/i,
      /\bCS\b.*pedestrian/i,
      /cold storage.*pedestrian/i,
    ],
  },
  "iFlex 190 Pedestrian": {
    spec: {
      family: "iFlex 190 Pedestrian",
      postOdMm: 190,
      maxCentreSpacingMm: 2200,
      railWidthMm: 60,
      railColour: "#FFC72C",
      postColour: "#1f1f1f",
    },
    matchers: [/i[fF]lex.*pedestrian/i],
  },
  "iFlex 190 Traffic": {
    spec: {
      family: "iFlex 190 Traffic",
      postOdMm: 190,
      maxCentreSpacingMm: 2200,
      railWidthMm: 125,
      railColour: "#FFC72C",
      postColour: "#1f1f1f",
    },
    matchers: [
      // Specific single/double traffic variants (don't match Pedestrian).
      /i[fF]lex.*(single|double).*traffic(\+)?$/i,
      // Fallback for any iFlex + traffic combination.
      /i[fF]lex.*traffic/i,
    ],
  },
  "eFlex 130": {
    spec: {
      family: "eFlex 130",
      postOdMm: 130,
      maxCentreSpacingMm: 2200,
      railWidthMm: 75,
      railColour: "#FFC72C",
      postColour: "#1f1f1f",
    },
    matchers: [/e[fF]lex/i],
  },
  "mFlex 158": {
    spec: {
      family: "mFlex 158",
      postOdMm: 158,
      maxCentreSpacingMm: 2200,
      railWidthMm: 80,
      railColour: "#FFC72C",
      postColour: "#1f1f1f",
    },
    matchers: [/m[fF]lex/i],
  },
  "Atlas 190": {
    spec: {
      family: "Atlas 190",
      postOdMm: 200,
      maxCentreSpacingMm: 2200,
      railWidthMm: 130,
      railColour: "#FFC72C",
      postColour: "#1f1f1f",
    },
    matchers: [/atlas/i],
  },
  "Monoplex 130": {
    spec: {
      family: "Monoplex 130",
      postOdMm: 130,
      maxCentreSpacingMm: 2200,
      railWidthMm: 0,
      railColour: "#FFC72C",
      postColour: "#1f1f1f",
    },
    matchers: [/monoplex.*130/i],
  },
  "Monoplex 190": {
    spec: {
      family: "Monoplex 190",
      postOdMm: 190,
      maxCentreSpacingMm: 2200,
      railWidthMm: 0,
      railColour: "#FFC72C",
      postColour: "#1f1f1f",
    },
    matchers: [/monoplex.*190/i],
  },
  "130-T0-P3": {
    spec: {
      family: "130-T0-P3",
      postOdMm: 130,
      maxCentreSpacingMm: 2200,
      railWidthMm: 55,
      railColour: "#FFC72C",
      postColour: "#1f1f1f",
    },
    matchers: [/^130-t0-p3/i],
  },
  "190-T-series": {
    spec: {
      family: "190-T-series",
      postOdMm: 190,
      maxCentreSpacingMm: 2200,
      railWidthMm: 100,
      railColour: "#FFC72C",
      postColour: "#1f1f1f",
    },
    matchers: [/^190-t\d-p\d/i],
  },
  "Topple Barrier": {
    spec: {
      family: "Topple Barrier",
      postOdMm: 190,
      maxCentreSpacingMm: 2200,
      railWidthMm: 130,
      railColour: "#FFC72C",
      postColour: "#1f1f1f",
    },
    matchers: [/topple/i],
  },
};

/**
 * Iteration order for matcher resolution. Cold Storage first so CS-prefixed
 * iFlex names don't fall through to the generic iFlex matchers.
 */
const SPEC_ORDER: SpecKey[] = [
  "Cold Storage iFlex",
  "iFlex 190 Pedestrian",
  "iFlex 190 Traffic",
  "eFlex 130",
  "mFlex 158",
  "Atlas 190",
  "Monoplex 130",
  "Monoplex 190",
  "130-T0-P3",
  "190-T-series",
  "Topple Barrier",
];

const DEFAULT_SPEC_KEY: SpecKey = "iFlex 190 Traffic";

/**
 * Look up the BarrierSpec for a given product name using fuzzy regex matching
 * against the SPECS table. Falls through to the iFlex 190 Traffic default
 * when no matcher hits.
 */
export function getBarrierSpec(productName: string): BarrierSpec {
  const name = (productName ?? "").trim();
  if (name.length > 0) {
    for (const key of SPEC_ORDER) {
      const entry = SPECS[key];
      for (const matcher of entry.matchers) {
        if (matcher.test(name)) {
          return entry.spec;
        }
      }
    }
  }
  return SPECS[DEFAULT_SPEC_KEY].spec;
}

/**
 * Build a scale-accurate top-view symbol for a barrier run.
 *
 * Returns `null` when the polyline has fewer than 2 points or the drawing
 * scale is not calibrated (<=0). Otherwise walks each segment, emits posts
 * at even intervals respecting the max centre-to-centre spacing, and emits
 * one rail rectangle per bay trimmed at each end by the post radius so the
 * rail terminates visually at the circumference of the post circle rather
 * than its centre.
 */
export function computeBarrierSymbol(
  points: PolylinePoint[],
  drawingScale: number,
  productName: string,
): BarrierSymbol | null {
  if (!points || points.length < 2) {
    return null;
  }
  if (!(drawingScale > 0)) {
    return null;
  }

  const spec = getBarrierSpec(productName);

  // Scale-accurate post radius / rail width, clamped to a minimum visible
  // size so symbols don't vanish at very small drawing scales.
  const rawRadiusPx = (spec.postOdMm / 2) * drawingScale;
  const postRadiusPx = Math.max(MIN_POST_RADIUS_PX, rawRadiusPx);
  const rawRailWidthPx = spec.railWidthMm * drawingScale;
  const railWidthPx =
    spec.railWidthMm <= 0 ? 0 : Math.max(MIN_RAIL_WIDTH_PX, rawRailWidthPx);

  const posts: BarrierSymbolPost[] = [];
  const rails: BarrierSymbolRail[] = [];
  let totalLengthMm = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segmentLengthPx = Math.hypot(dx, dy);

    if (segmentLengthPx === 0) {
      continue;
    }

    const segmentLengthMm = segmentLengthPx / drawingScale;
    totalLengthMm += segmentLengthMm;

    const nBays = Math.max(
      1,
      Math.ceil(segmentLengthMm / spec.maxCentreSpacingMm),
    );
    const nPosts = nBays + 1;

    // Emit posts. Skip the first post on any segment after the first when it
    // duplicates the previous segment's last post (within an epsilon).
    const localPosts: BarrierSymbolPost[] = [];
    for (let j = 0; j < nPosts; j += 1) {
      const t = j / nBays;
      const px = a.x + dx * t;
      const py = a.y + dy * t;
      localPosts.push({
        x: px,
        y: py,
        radiusPx: postRadiusPx,
        colour: spec.postColour,
      });
    }

    if (i > 0 && posts.length > 0) {
      const prev = posts[posts.length - 1];
      const first = localPosts[0];
      if (
        Math.hypot(first.x - prev.x, first.y - prev.y) <=
        JOIN_DEDUPE_EPSILON_PX
      ) {
        localPosts.shift();
      }
    }

    // Rails are emitted based on adjacent post CENTRES within this segment.
    // We compute rail endpoints from the original pre-dedupe positions so
    // the rail between the bend and its neighbour stays correct even when
    // the shared post is deduped from the posts array.
    if (spec.railWidthMm > 0) {
      const unitX = dx / segmentLengthPx;
      const unitY = dy / segmentLengthPx;
      const trim = postRadiusPx;

      for (let j = 0; j < nBays; j += 1) {
        const t1 = j / nBays;
        const t2 = (j + 1) / nBays;
        const cx1 = a.x + dx * t1;
        const cy1 = a.y + dy * t1;
        const cx2 = a.x + dx * t2;
        const cy2 = a.y + dy * t2;
        rails.push({
          x1: cx1 + unitX * trim,
          y1: cy1 + unitY * trim,
          x2: cx2 - unitX * trim,
          y2: cy2 - unitY * trim,
          widthPx: railWidthPx,
          colour: spec.railColour,
        });
      }
    }

    posts.push(...localPosts);
  }

  return {
    posts,
    rails,
    totalLengthMm,
    postCount: posts.length,
    railCount: rails.length,
    spec,
  };
}
