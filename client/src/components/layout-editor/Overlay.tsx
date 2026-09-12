/**
 * client/src/components/layout-editor/Overlay.tsx
 *
 * The one SVG overlay, drawn in content coordinates inside the Viewport's
 * transformed layer. Everything that should stay a constant size on
 * screen (handles, label text, minimum stroke widths) is scaled by
 * `s = 1 / zoom`; everything real-world (rail width, post OD, stamp
 * footprint) is scaled by `k = pxPerMm(calibration)` once calibrated.
 *
 * Draw order: zones → walls → runs (+posts) → stamps → dimensions →
 * notes → run labels → selection → tool draft → calibration line →
 * guardrail dots. Pointer events are off — the Viewport owns gestures.
 */

import { memo, useMemo } from "react";
import type { BarrierRunElement, DimensionElement, Element, LayoutDoc, NoteElement, Pt, StampElement, WallElement, ZoneElement } from "@shared/layout/doc";
import { elementPoints } from "@shared/layout/doc";
import { dist, polylineLengthPx, postPositions, pxPerMm, runLengthMm } from "@shared/layout/geometry";
import { getFamily, type FamilySpec } from "@shared/layout/symbols";
import { placeLabels, type LabelBox } from "./labelLayout";
import { stampHandlePoint, type ToolDraft, type ToolId } from "./tools";
import { worstSeverityDotColour, type GuardrailViolation } from "./guardrails";

export interface OverlayProps {
  doc: LayoutDoc;
  width: number;
  height: number;
  zoom: number;
  selectedId: string | null;
  draft: ToolDraft;
  activeTool: ToolId;
  activeFamilyId: string;
  violationsByElement?: Map<string, GuardrailViolation[]>;
  pulseElementId?: string | null;
  /** Show the calibration line (calibrate tool active, or "show scale" on). */
  showCalibration?: boolean;
}

export const SELECTION_COLOUR = "#2563EB";
export const CALIBRATION_COLOUR = "#DB2777";
const WALL_COLOUR = "#6B7280";
const WALL_WIDTH_MM = 150;
const FONT = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

function pathD(points: readonly Pt[], close = false): string {
  if (points.length === 0) return "";
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  return close ? `${d} Z` : d;
}

/** Point half-way along a polyline (by length). */
function midpointAlong(points: readonly Pt[]): Pt {
  if (points.length === 1) return points[0];
  const half = polylineLengthPx(points as Pt[]) / 2;
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = dist(points[i - 1], points[i]);
    if (acc + seg >= half && seg > 0) {
      const t = (half - acc) / seg;
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * t, y: points[i - 1].y + (points[i].y - points[i - 1].y) * t };
    }
    acc += seg;
  }
  return points[points.length - 1];
}

function centroid(points: readonly Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function runStrokeWidth(fam: FamilySpec, k: number | null, s: number): number {
  return k ? Math.max(fam.widthMm * k, 1.5 * s) : 6 * s;
}

function postRadius(fam: FamilySpec, k: number | null, s: number): number {
  return k ? Math.max((fam.postOdMm * k) / 2, 2.5 * s) : 4 * s;
}

function stampHalf(fam: FamilySpec, k: number | null, s: number): number {
  return k ? Math.max((fam.widthMm * k) / 2, 3 * s) : 10 * s;
}

function zoneFill(label: string): string {
  const l = label.toLowerCase();
  if (/vehicle|truck|forklift|traffic/.test(l)) return "rgba(217, 119, 6, 0.18)";
  if (/pedestrian|walk|people/.test(l)) return "rgba(22, 163, 74, 0.18)";
  return "rgba(37, 99, 235, 0.14)";
}

function zoneStroke(label: string): string {
  const l = label.toLowerCase();
  if (/vehicle|truck|forklift|traffic/.test(l)) return "#B45309";
  if (/pedestrian|walk|people/.test(l)) return "#15803D";
  return "#1D4ED8";
}

// ─── Element renderers ──────────────────────────────────────────────────────

function RunShape({ el, k, s, fam }: { el: BarrierRunElement; k: number | null; s: number; fam: FamilySpec }) {
  const w = runStrokeWidth(fam, k, s);
  const d = pathD(el.points);
  return (
    <g data-element-id={el.id} data-kind="barrierRun">
      <path
        d={d}
        fill="none"
        stroke={fam.colour}
        strokeWidth={w}
        strokeLinejoin="round"
        strokeLinecap="butt"
        strokeDasharray={fam.strokeStyle === "dashed" ? `${w * 3} ${w * 1.5}` : undefined}
      />
      {fam.strokeStyle === "double" && w * (1 / s) >= 4 && (
        <path d={d} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={w * 0.3} strokeLinejoin="round" strokeLinecap="butt" />
      )}
    </g>
  );
}

function Posts({ el, k, s, fam, cal }: { el: BarrierRunElement; k: number | null; s: number; fam: FamilySpec; cal: LayoutDoc["calibration"] }) {
  if (!k || fam.postSpacingMm <= 0) return null;
  const r = postRadius(fam, k, s);
  const posts = postPositions(el.points, fam.postSpacingMm, cal);
  return (
    <g>
      {posts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={r} fill={fam.colour} stroke="#ffffff" strokeWidth={Math.min(1 * s, r * 0.3)} />
      ))}
    </g>
  );
}

function StampShape({ el, k, s, fam }: { el: StampElement; k: number | null; s: number; fam: FamilySpec }) {
  const half = stampHalf(fam, k, s);
  const shape = fam.stampShape ?? "circle";
  const showLetter = half / s >= 7;
  const fontSize = Math.min(half * 1.1, 12 * s);
  return (
    <g data-element-id={el.id} data-kind="stamp" transform={`rotate(${el.rotationDeg} ${el.at.x} ${el.at.y})`}>
      {shape === "circle" && <circle cx={el.at.x} cy={el.at.y} r={half} fill={fam.colour} fillOpacity={0.9} stroke="#ffffff" strokeWidth={1 * s} />}
      {shape === "square" && (
        <rect x={el.at.x - half} y={el.at.y - half} width={half * 2} height={half * 2} fill={fam.colour} fillOpacity={0.9} stroke="#ffffff" strokeWidth={1 * s} />
      )}
      {shape === "rect" && (
        <rect x={el.at.x - half} y={el.at.y - half / 2} width={half * 2} height={half} fill={fam.colour} fillOpacity={0.9} stroke="#ffffff" strokeWidth={1 * s} />
      )}
      {/* Orientation tick so rotation is visible on symmetric shapes. */}
      <line x1={el.at.x} y1={el.at.y} x2={el.at.x} y2={el.at.y - half} stroke="#ffffff" strokeWidth={1.2 * s} strokeOpacity={0.9} />
      {showLetter && (
        <text x={el.at.x} y={el.at.y} fontSize={fontSize} fontFamily={FONT} fontWeight={700} fill="#ffffff" textAnchor="middle" dominantBaseline="central">
          {fam.letter}
        </text>
      )}
    </g>
  );
}

function WallShape({ el, k, s }: { el: WallElement; k: number | null; s: number }) {
  const w = k ? Math.max(WALL_WIDTH_MM * k, 4 * s) : 8 * s;
  return (
    <path
      data-element-id={el.id}
      data-kind="wall"
      d={pathD(el.points)}
      fill="none"
      stroke={WALL_COLOUR}
      strokeOpacity={0.9}
      strokeWidth={w}
      strokeLinejoin="miter"
      strokeLinecap="square"
    />
  );
}

function ZoneShape({ el, s }: { el: ZoneElement; s: number }) {
  if (el.points.length < 2) return null;
  const c = centroid(el.points);
  return (
    <g data-element-id={el.id} data-kind="zone">
      <path d={pathD(el.points, true)} fill={zoneFill(el.label)} stroke={zoneStroke(el.label)} strokeWidth={1.5 * s} strokeDasharray={`${6 * s} ${4 * s}`} strokeLinejoin="round" />
      {el.label && el.points.length >= 3 && (
        <text
          x={c.x}
          y={c.y}
          fontSize={12 * s}
          fontFamily={FONT}
          fontWeight={600}
          fill={zoneStroke(el.label)}
          stroke="#ffffff"
          strokeWidth={3 * s}
          style={{ paintOrder: "stroke" }}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {el.label}
        </text>
      )}
    </g>
  );
}

function arrowHead(tip: Pt, from: Pt, size: number): string {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  const a1 = ang + Math.PI - Math.PI / 7;
  const a2 = ang + Math.PI + Math.PI / 7;
  const p1 = { x: tip.x + Math.cos(a1) * size, y: tip.y + Math.sin(a1) * size };
  const p2 = { x: tip.x + Math.cos(a2) * size, y: tip.y + Math.sin(a2) * size };
  return `M${tip.x} ${tip.y} L${p1.x} ${p1.y} L${p2.x} ${p2.y} Z`;
}

export function formatMm(mm: number | null): string {
  if (mm === null || !Number.isFinite(mm)) return "— mm";
  if (mm >= 10000) return `${(mm / 1000).toFixed(2)} m`;
  return `${Math.round(mm)} mm`;
}

function DimensionShape({ el, k, s, colour = "#111827" }: { el: DimensionElement; k: number | null; s: number; colour?: string }) {
  const len = dist(el.a, el.b);
  if (len === 0) return null;
  const mid = { x: (el.a.x + el.b.x) / 2, y: (el.a.y + el.b.y) / 2 };
  let ang = (Math.atan2(el.b.y - el.a.y, el.b.x - el.a.x) * 180) / Math.PI;
  if (ang > 90 || ang < -90) ang += 180;
  const nx = -(el.b.y - el.a.y) / len;
  const ny = (el.b.x - el.a.x) / len;
  const off = 9 * s;
  const text = k ? formatMm(len / k) : "— mm";
  const arrow = 8 * s;
  return (
    <g data-element-id={el.id} data-kind="dimension">
      <line x1={el.a.x} y1={el.a.y} x2={el.b.x} y2={el.b.y} stroke={colour} strokeWidth={1.2 * s} />
      <line x1={el.a.x - nx * 6 * s} y1={el.a.y - ny * 6 * s} x2={el.a.x + nx * 6 * s} y2={el.a.y + ny * 6 * s} stroke={colour} strokeWidth={1.2 * s} />
      <line x1={el.b.x - nx * 6 * s} y1={el.b.y - ny * 6 * s} x2={el.b.x + nx * 6 * s} y2={el.b.y + ny * 6 * s} stroke={colour} strokeWidth={1.2 * s} />
      <path d={arrowHead(el.a, el.b, arrow)} fill={colour} />
      <path d={arrowHead(el.b, el.a, arrow)} fill={colour} />
      <text
        x={mid.x + nx * off}
        y={mid.y + ny * off}
        transform={`rotate(${ang} ${mid.x + nx * off} ${mid.y + ny * off})`}
        fontSize={11 * s}
        fontFamily={FONT}
        fontWeight={600}
        fill={colour}
        stroke="#ffffff"
        strokeWidth={3 * s}
        style={{ paintOrder: "stroke" }}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {text}
      </text>
    </g>
  );
}

function wrapText(text: string, maxChars = 28): string[] {
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > maxChars && line) {
        out.push(line);
        line = w;
      } else {
        line = (line + " " + w).trim();
      }
    }
    out.push(line);
  }
  return out.length ? out.slice(0, 6) : [""];
}

function NoteShape({ el, s }: { el: NoteElement; s: number }) {
  const lines = wrapText(el.text || "Note");
  const lineH = 14 * s;
  const pad = 6 * s;
  const w = (Math.max(...lines.map((l) => l.length), 4) * 6.4 + 12) * s;
  const h = lines.length * lineH + pad * 2;
  const bx = el.at.x + 14 * s;
  const by = el.at.y - 14 * s - h;
  return (
    <g data-element-id={el.id} data-kind="note">
      <line x1={el.at.x} y1={el.at.y} x2={bx} y2={by + h} stroke="#111827" strokeWidth={1 * s} />
      <circle cx={el.at.x} cy={el.at.y} r={3.5 * s} fill="#FACC15" stroke="#111827" strokeWidth={1 * s} />
      <rect x={bx} y={by} width={w} height={h} rx={3 * s} fill="#FEF9C3" stroke="#CA8A04" strokeWidth={1 * s} />
      <text x={bx + pad} y={by + pad} fontSize={11 * s} fontFamily={FONT} fill="#1F2937" dominantBaseline="hanging">
        {lines.map((l, i) => (
          <tspan key={i} x={bx + pad} dy={i === 0 ? 0 : lineH}>
            {l}
          </tspan>
        ))}
      </text>
    </g>
  );
}

// ─── Labels ─────────────────────────────────────────────────────────────────

/** Family letter + per-family run number, e.g. "A1", "A2", "C1". Stable in element order. */
export function runLabels(doc: LayoutDoc): Map<string, string> {
  const counters = new Map<string, number>();
  const out = new Map<string, string>();
  for (const el of doc.elements) {
    if (el.kind !== "barrierRun") continue;
    const fam = getFamily(el.familyId);
    const n = (counters.get(fam.letter) ?? 0) + 1;
    counters.set(fam.letter, n);
    out.set(el.id, el.label || `${fam.letter}${n}`);
  }
  return out;
}

function Labels({ doc, s }: { doc: LayoutDoc; s: number }) {
  const placed = useMemo(() => {
    const labels = runLabels(doc);
    const boxes: LabelBox[] = [];
    for (const el of doc.elements) {
      if (el.kind !== "barrierRun" || el.points.length === 0) continue;
      const text = labels.get(el.id) ?? "";
      boxes.push({ id: el.id, anchor: midpointAlong(el.points), width: (text.length * 7 + 10) * s, height: 16 * s });
    }
    return { labels, placed: placeLabels(boxes, 8 * s) };
  }, [doc, s]);

  return (
    <g>
      {placed.placed.map((p) => {
        const el = doc.elements.find((e) => e.id === p.id) as BarrierRunElement | undefined;
        if (!el) return null;
        const fam = getFamily(el.familyId);
        return (
          <g key={p.id}>
            <rect x={p.x} y={p.y} width={p.width} height={p.height} rx={3 * s} fill="#ffffff" fillOpacity={0.95} stroke={fam.colour} strokeWidth={1 * s} />
            <text x={p.x + p.width / 2} y={p.y + p.height / 2} fontSize={11 * s} fontFamily={FONT} fontWeight={700} fill={fam.colour} textAnchor="middle" dominantBaseline="central">
              {placed.labels.get(p.id)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ─── Selection ──────────────────────────────────────────────────────────────

function Selection({ el, doc, zoom, s, k }: { el: Element; doc: LayoutDoc; zoom: number; s: number; k: number | null }) {
  const handleR = 7 * s;
  const handles = (pts: readonly Pt[]) =>
    pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={handleR} fill="#ffffff" stroke={SELECTION_COLOUR} strokeWidth={2 * s} />);

  switch (el.kind) {
    case "barrierRun":
    case "wall":
    case "zone": {
      const fam = el.kind === "barrierRun" ? getFamily(el.familyId) : null;
      const base = el.kind === "barrierRun" && fam ? runStrokeWidth(fam, k, s) : el.kind === "wall" ? (k ? Math.max(WALL_WIDTH_MM * k, 4 * s) : 8 * s) : 1.5 * s;
      return (
        <g>
          <path d={pathD(el.points, el.kind === "zone")} fill="none" stroke={SELECTION_COLOUR} strokeOpacity={0.35} strokeWidth={base + 8 * s} strokeLinejoin="round" strokeLinecap="round" />
          <path d={pathD(el.points, el.kind === "zone")} fill="none" stroke={SELECTION_COLOUR} strokeWidth={1.5 * s} strokeDasharray={`${5 * s} ${4 * s}`} strokeLinejoin="round" />
          {handles(el.points)}
        </g>
      );
    }
    case "stamp": {
      const fam = getFamily(el.familyId);
      const half = stampHalf(fam, k, s);
      const h = stampHandlePoint(el, doc, zoom);
      return (
        <g>
          <circle cx={el.at.x} cy={el.at.y} r={half * 1.45 + 6 * s} fill="none" stroke={SELECTION_COLOUR} strokeWidth={1.5 * s} strokeDasharray={`${5 * s} ${4 * s}`} />
          <line x1={el.at.x} y1={el.at.y} x2={h.x} y2={h.y} stroke={SELECTION_COLOUR} strokeWidth={1.5 * s} />
          <circle cx={h.x} cy={h.y} r={handleR + 1 * s} fill="#ffffff" stroke={SELECTION_COLOUR} strokeWidth={2 * s} />
          <path
            d={`M${h.x - 3.5 * s} ${h.y - 1 * s} a ${4 * s} ${4 * s} 0 1 1 ${1 * s} ${4 * s}`}
            fill="none"
            stroke={SELECTION_COLOUR}
            strokeWidth={1.4 * s}
            strokeLinecap="round"
          />
        </g>
      );
    }
    case "dimension":
      return (
        <g>
          <line x1={el.a.x} y1={el.a.y} x2={el.b.x} y2={el.b.y} stroke={SELECTION_COLOUR} strokeOpacity={0.35} strokeWidth={10 * s} strokeLinecap="round" />
          {handles([el.a, el.b])}
        </g>
      );
    case "note":
      return <g>{handles([el.at])}</g>;
  }
}

// ─── Draft ──────────────────────────────────────────────────────────────────

function Draft({ draft, s, k, activeFamilyId, cal }: { draft: ToolDraft; s: number; k: number | null; activeFamilyId: string; cal: LayoutDoc["calibration"] }) {
  if (!draft) return null;
  if (draft.kind === "polyline") {
    const fam = draft.tool === "barrierRun" ? getFamily(activeFamilyId) : null;
    const colour = fam ? fam.colour : draft.tool === "wall" ? WALL_COLOUR : "#1D4ED8";
    const w = fam ? runStrokeWidth(fam, k, s) : draft.tool === "wall" ? (k ? Math.max(WALL_WIDTH_MM * k, 4 * s) : 8 * s) : 1.5 * s;
    const all = draft.cursor ? [...draft.points, draft.cursor] : draft.points;
    const lengthMm = k ? runLengthMm(all, cal) : null;
    const last = all[all.length - 1];
    return (
      <g>
        <path d={pathD(draft.points)} fill="none" stroke={colour} strokeWidth={w} strokeOpacity={0.75} strokeLinejoin="round" />
        {draft.cursor && draft.points.length > 0 && (
          <line
            x1={draft.points[draft.points.length - 1].x}
            y1={draft.points[draft.points.length - 1].y}
            x2={draft.cursor.x}
            y2={draft.cursor.y}
            stroke={colour}
            strokeWidth={Math.max(1.5 * s, w * 0.5)}
            strokeDasharray={`${6 * s} ${4 * s}`}
          />
        )}
        {draft.tool === "zone" && draft.points.length >= 2 && (
          <path d={pathD(all, true)} fill={zoneFill("")} stroke="none" />
        )}
        {draft.points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={5 * s} fill="#ffffff" stroke={colour} strokeWidth={2 * s} />
        ))}
        {lengthMm !== null && last && (
          <text
            x={last.x + 12 * s}
            y={last.y - 12 * s}
            fontSize={12 * s}
            fontFamily={FONT}
            fontWeight={700}
            fill={colour}
            stroke="#ffffff"
            strokeWidth={3 * s}
            style={{ paintOrder: "stroke" }}
          >
            {formatMm(lengthMm)}
          </text>
        )}
      </g>
    );
  }
  // line draft (dimension / calibrate)
  const colour = draft.tool === "calibrate" ? CALIBRATION_COLOUR : "#111827";
  return (
    <g>
      <circle cx={draft.a.x} cy={draft.a.y} r={5 * s} fill="#ffffff" stroke={colour} strokeWidth={2 * s} />
      {draft.b && (
        <>
          {draft.tool === "dimension" ? (
            <DimensionShape el={{ kind: "dimension", id: "__draft", a: draft.a, b: draft.b }} k={k} s={s} colour={colour} />
          ) : (
            <line x1={draft.a.x} y1={draft.a.y} x2={draft.b.x} y2={draft.b.y} stroke={colour} strokeWidth={2 * s} strokeDasharray={`${6 * s} ${4 * s}`} />
          )}
          <circle cx={draft.b.x} cy={draft.b.y} r={5 * s} fill="#ffffff" stroke={colour} strokeWidth={2 * s} />
        </>
      )}
    </g>
  );
}

function CalibrationLine({ doc, s }: { doc: LayoutDoc; s: number }) {
  const cal = doc.calibration;
  if (!cal) return null;
  const mid = { x: (cal.a.x + cal.b.x) / 2, y: (cal.a.y + cal.b.y) / 2 };
  return (
    <g data-kind="calibration">
      <line x1={cal.a.x} y1={cal.a.y} x2={cal.b.x} y2={cal.b.y} stroke={CALIBRATION_COLOUR} strokeWidth={2 * s} strokeDasharray={`${8 * s} ${4 * s}`} />
      <circle cx={cal.a.x} cy={cal.a.y} r={4 * s} fill={CALIBRATION_COLOUR} />
      <circle cx={cal.b.x} cy={cal.b.y} r={4 * s} fill={CALIBRATION_COLOUR} />
      <text x={mid.x} y={mid.y - 8 * s} fontSize={11 * s} fontFamily={FONT} fontWeight={700} fill={CALIBRATION_COLOUR} stroke="#ffffff" strokeWidth={3 * s} style={{ paintOrder: "stroke" }} textAnchor="middle">
        Scale: {formatMm(cal.lengthMm)}
      </text>
    </g>
  );
}

function elementAnchor(el: Element): Pt | null {
  const pts = elementPoints(el);
  if (pts.length === 0) return null;
  if (el.kind === "barrierRun" || el.kind === "wall") return midpointAlong(pts);
  if (el.kind === "zone") return centroid(pts);
  return pts[0];
}

// ─── Overlay ────────────────────────────────────────────────────────────────

export const Overlay = memo(function Overlay({
  doc,
  width,
  height,
  zoom,
  selectedId,
  draft,
  activeTool,
  activeFamilyId,
  violationsByElement,
  pulseElementId,
  showCalibration,
}: OverlayProps) {
  const s = 1 / Math.max(zoom, 1e-6);
  const cal = doc.calibration;
  const k = pxPerMm(cal);
  const selected = selectedId ? doc.elements.find((e) => e.id === selectedId) ?? null : null;

  const zones: ZoneElement[] = [];
  const walls: WallElement[] = [];
  const runs: BarrierRunElement[] = [];
  const stamps: StampElement[] = [];
  const dims: DimensionElement[] = [];
  const notes: NoteElement[] = [];
  for (const el of doc.elements) {
    switch (el.kind) {
      case "zone":
        zones.push(el);
        break;
      case "wall":
        walls.push(el);
        break;
      case "barrierRun":
        runs.push(el);
        break;
      case "stamp":
        stamps.push(el);
        break;
      case "dimension":
        dims.push(el);
        break;
      case "note":
        notes.push(el);
        break;
    }
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
      data-testid="layout-overlay"
      aria-hidden
    >
      <style>{`@keyframes le-pulse{0%{r:${10 * s}px;opacity:.9}100%{r:${30 * s}px;opacity:0}}`}</style>
      <g>{zones.map((z) => <ZoneShape key={z.id} el={z} s={s} />)}</g>
      <g>{walls.map((w) => <WallShape key={w.id} el={w} k={k} s={s} />)}</g>
      <g>
        {runs.map((r) => (
          <RunShape key={r.id} el={r} k={k} s={s} fam={getFamily(r.familyId)} />
        ))}
      </g>
      <g>
        {runs.map((r) => (
          <Posts key={r.id} el={r} k={k} s={s} fam={getFamily(r.familyId)} cal={cal} />
        ))}
      </g>
      <g>
        {stamps.map((st) => (
          <StampShape key={st.id} el={st} k={k} s={s} fam={getFamily(st.familyId)} />
        ))}
      </g>
      <g>{dims.map((d) => <DimensionShape key={d.id} el={d} k={k} s={s} />)}</g>
      <g>{notes.map((n) => <NoteShape key={n.id} el={n} s={s} />)}</g>
      <Labels doc={doc} s={s} />
      {selected && activeTool === "select" && <Selection el={selected} doc={doc} zoom={zoom} s={s} k={k} />}
      {selected && activeTool !== "select" && (
        <g opacity={0.6}>
          <Selection el={selected} doc={doc} zoom={zoom} s={s} k={k} />
        </g>
      )}
      <Draft draft={draft} s={s} k={k} activeFamilyId={activeFamilyId} cal={cal} />
      {(showCalibration || activeTool === "calibrate") && <CalibrationLine doc={doc} s={s} />}
      {violationsByElement && violationsByElement.size > 0 && (
        <g>
          {doc.elements.map((el) => {
            const colour = worstSeverityDotColour(violationsByElement.get(el.id));
            if (!colour) return null;
            const a = elementAnchor(el);
            if (!a) return null;
            const pulse = pulseElementId === el.id;
            return (
              <g key={el.id}>
                {pulse && <circle cx={a.x} cy={a.y} r={10 * s} fill="none" stroke={colour} strokeWidth={3 * s} style={{ animation: "le-pulse 1s ease-out 3" }} />}
                <circle cx={a.x} cy={a.y - 10 * s} r={6 * s} fill={colour} stroke="#ffffff" strokeWidth={1.5 * s} />
                <text x={a.x} y={a.y - 10 * s} fontSize={8 * s} fontFamily={FONT} fontWeight={800} fill="#ffffff" textAnchor="middle" dominantBaseline="central">
                  !
                </text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
});
