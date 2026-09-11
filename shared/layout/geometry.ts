/**
 * shared/layout/geometry.ts
 *
 * Pure geometry over `LayoutDoc` content points. Everything here is used by
 * the client overlay (hit testing, snapping, post rendering), the quantity
 * take-off and the server-side vector export, so it stays free of DOM and
 * framework imports.
 *
 * Behaviour ported from client/src/components/layout-markup/utils.ts and
 * client/src/utils/barrierSymbol.ts: posts at every vertex with even
 * distribution per segment (no bay longer than the family spacing), and
 * corner detection that first collapses near-duplicate points.
 */

import type { Calibration, LayoutDoc, Element, ElementKind, Pt } from "./doc";
import { elementPoints } from "./doc";

export type Segment = [Pt, Pt];

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Points closer than this (px) are treated as the same vertex. */
export const DUPLICATE_POINT_EPSILON_PX = 0.5;

const DEG = 180 / Math.PI;

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Drop consecutive points closer than `epsilon` so zero-length segments never reach the maths. */
export function dedupePoints(points: Pt[], epsilon = DUPLICATE_POINT_EPSILON_PX): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || dist(last, p) >= epsilon) out.push(p);
  }
  return out;
}

// ─── Calibration ────────────────────────────────────────────────────────────

/** Content pixels per millimetre, or null when the calibration is missing or degenerate. */
export function pxPerMm(cal: Calibration | undefined | null): number | null {
  if (!cal) return null;
  if (!(cal.lengthMm > 0)) return null;
  const px = dist(cal.a, cal.b);
  if (!(px > 0)) return null;
  const ratio = px / cal.lengthMm;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
}

export function polylineLengthPx(points: Pt[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

/** Real length of a polyline in mm, or null when uncalibrated. */
export function runLengthMm(points: Pt[], cal: Calibration | undefined | null): number | null {
  const k = pxPerMm(cal);
  if (k === null) return null;
  return polylineLengthPx(points) / k;
}

// ─── Posts ──────────────────────────────────────────────────────────────────

/**
 * Post centres for a run: one at every vertex, plus evenly distributed
 * intermediate posts so that no bay exceeds `spacingMm`. A shared vertex
 * between two segments is emitted once. Returns [] when uncalibrated or the
 * run has fewer than two distinct points.
 */
export function postPositions(points: Pt[], spacingMm: number, cal: Calibration | undefined | null): Pt[] {
  const k = pxPerMm(cal);
  if (k === null || !(spacingMm > 0)) return [];
  const pts = dedupePoints(points);
  if (pts.length < 2) return [];

  const posts: Pt[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const segMm = dist(a, b) / k;
    const bays = Math.max(1, Math.ceil(segMm / spacingMm - 1e-9));
    for (let j = 1; j <= bays; j++) {
      const t = j / bays;
      posts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return posts;
}

// ─── Corners ────────────────────────────────────────────────────────────────

/** Unsigned turning angle (degrees, 0..180) at vertex `b` of a→b→c. */
export function turnAngleDeg(a: Pt, b: Pt, c: Pt): number {
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return 0;
  const cos = (v1x * v2x + v1y * v2y) / (m1 * m2);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * DEG;
}

/**
 * Indices (into the de-duplicated polyline) of vertices where the run turns
 * by at least `minAngleDeg`. `detectCorners(pts).length` is the corner-post
 * count; the indices let the overlay draw a corner marker.
 */
export function detectCorners(points: Pt[], minAngleDeg = 60): number[] {
  const pts = dedupePoints(points);
  if (pts.length < 3) return [];
  const out: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    if (turnAngleDeg(pts[i - 1], pts[i], pts[i + 1]) >= minAngleDeg - 1e-9) out.push(i);
  }
  return out;
}

// ─── Distances ──────────────────────────────────────────────────────────────

/** Shortest distance from `p` to segment a→b (handles a===b). */
export function pointToSegmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + dx * t, y: a.y + dy * t });
}

function orient(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Pt, b: Pt, p: Pt): boolean {
  return (
    Math.min(a.x, b.x) - 1e-9 <= p.x &&
    p.x <= Math.max(a.x, b.x) + 1e-9 &&
    Math.min(a.y, b.y) - 1e-9 <= p.y &&
    p.y <= Math.max(a.y, b.y) + 1e-9
  );
}

/** True when the two closed segments share at least one point. */
export function segmentsIntersect(s: Segment, t: Segment): boolean {
  const [p1, p2] = s;
  const [q1, q2] = t;
  const o1 = orient(p1, p2, q1);
  const o2 = orient(p1, p2, q2);
  const o3 = orient(q1, q2, p1);
  const o4 = orient(q1, q2, p2);
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, p2, q2)) return true;
  if (o3 === 0 && onSegment(q1, q2, p1)) return true;
  if (o4 === 0 && onSegment(q1, q2, p2)) return true;
  return false;
}

/** True segment-to-segment distance in content px (0 when they cross or touch). */
export function segmentDistancePx(s: Segment, t: Segment): number {
  if (segmentsIntersect(s, t)) return 0;
  return Math.min(
    pointToSegmentDistance(s[0], t[0], t[1]),
    pointToSegmentDistance(s[1], t[0], t[1]),
    pointToSegmentDistance(t[0], s[0], s[1]),
    pointToSegmentDistance(t[1], s[0], s[1]),
  );
}

/** Segment-to-segment distance in mm, or null when uncalibrated. */
export function segmentDistanceMm(s: Segment, t: Segment, cal: Calibration | undefined | null): number | null {
  const k = pxPerMm(cal);
  if (k === null) return null;
  return segmentDistancePx(s, t) / k;
}

// ─── Snapping ───────────────────────────────────────────────────────────────

/**
 * Snap the direction prev→p to the nearest allowed angle (each entry in
 * `angles` is mirrored through all four quadrants, so [0,45,90] gives every
 * 45° heading). Length is preserved. Returns `p` unchanged if it coincides
 * with `prev`.
 */
export function snapAngle(prev: Pt, p: Pt, angles: number[] = [0, 45, 90]): Pt {
  const dx = p.x - prev.x;
  const dy = p.y - prev.y;
  const len = Math.hypot(dx, dy);
  if (len === 0 || angles.length === 0) return p;
  const heading = Math.atan2(dy, dx) * DEG;

  let best = heading;
  let bestDiff = Infinity;
  for (const base of angles) {
    for (const candidate of [base, base + 90, base + 180, base + 270, base - 90, base - 180, base - 270]) {
      let diff = Math.abs(((heading - candidate + 540) % 360) - 180);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = candidate;
      }
    }
  }
  const rad = best / DEG;
  return { x: prev.x + Math.cos(rad) * len, y: prev.y + Math.sin(rad) * len };
}

export interface SnapResult {
  point: Pt;
  index: number;
}

/** Nearest candidate within `tolerancePx` of `p`, or null. */
export function snapToPoint(p: Pt, candidates: Pt[], tolerancePx: number): SnapResult | null {
  let best: SnapResult | null = null;
  let bestD = tolerancePx;
  for (let i = 0; i < candidates.length; i++) {
    const d = dist(p, candidates[i]);
    if (d <= bestD) {
      bestD = d;
      best = { point: candidates[i], index: i };
    }
  }
  return best;
}

// ─── Hit testing ────────────────────────────────────────────────────────────

export interface HitResult {
  id: string;
  kind: ElementKind;
  /** Set when the hit is on a vertex (runs, walls, zones, dimension ends). */
  vertexIndex?: number;
  /** Set when the hit is on a segment between vertices. */
  segmentIndex?: number;
  distancePx: number;
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const crosses = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function hitPolyline(el: Element, pts: Pt[], p: Pt, tol: number, closed: boolean): HitResult | null {
  // Vertices first so a tap near a corner grabs the handle, not the edge.
  let bestVertex: HitResult | null = null;
  for (let i = 0; i < pts.length; i++) {
    const d = dist(p, pts[i]);
    if (d <= tol && (!bestVertex || d < bestVertex.distancePx)) {
      bestVertex = { id: el.id, kind: el.kind, vertexIndex: i, distancePx: d };
    }
  }
  if (bestVertex) return bestVertex;

  let bestSeg: HitResult | null = null;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const d = pointToSegmentDistance(p, a, b);
    if (d <= tol && (!bestSeg || d < bestSeg.distancePx)) {
      bestSeg = { id: el.id, kind: el.kind, segmentIndex: i, distancePx: d };
    }
  }
  return bestSeg;
}

/**
 * Find the element under `p`. Elements are tested top-most first (last in
 * the array wins), with zone *containment* only used as a last resort so a
 * zone never steals a tap meant for the run drawn inside it.
 */
export function hitTest(doc: LayoutDoc, p: Pt, tolerancePx: number): HitResult | null {
  let containedZone: HitResult | null = null;
  for (let i = doc.elements.length - 1; i >= 0; i--) {
    const el = doc.elements[i];
    switch (el.kind) {
      case "barrierRun":
      case "wall": {
        const hit = hitPolyline(el, el.points, p, tolerancePx, false);
        if (hit) return hit;
        break;
      }
      case "zone": {
        const hit = hitPolyline(el, el.points, p, tolerancePx, true);
        if (hit) return hit;
        if (!containedZone && el.points.length >= 3 && pointInPolygon(p, el.points)) {
          containedZone = { id: el.id, kind: el.kind, distancePx: 0 };
        }
        break;
      }
      case "dimension": {
        const hit = hitPolyline(el, [el.a, el.b], p, tolerancePx, false);
        if (hit) return hit;
        break;
      }
      case "stamp":
      case "note": {
        const d = dist(p, el.at);
        if (d <= tolerancePx) return { id: el.id, kind: el.kind, distancePx: d };
        break;
      }
    }
  }
  return containedZone;
}

// ─── Bounds ─────────────────────────────────────────────────────────────────

export function pointsBounds(points: Pt[]): Bounds | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** Bounding box of every element in the doc (calibration excluded), or null when empty. */
export function docBounds(doc: LayoutDoc): Bounds | null {
  const all: Pt[] = [];
  for (const el of doc.elements) all.push(...elementPoints(el));
  return pointsBounds(all);
}
