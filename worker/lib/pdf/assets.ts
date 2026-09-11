// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf/assets.ts
//
// Brand assets for the PDF renderer: the embedded logo / icon PNGs (decoded
// from base64 modules under worker/assets/brand/ — Workers have atob, no
// Buffer here) and the vector "safety halo" motif.
//
// Logo rules (brand guide): primary (yellow on black) wherever a black band
// exists; secondary (yellow icon + black word) on white; never on yellow;
// clear zone = half the height of the "A"; never narrower than 20 mm
// without the strapline.
// ────────────────────────────────────────────────────────────────────────────

import {
  clip,
  endPath,
  LineCapStyle,
  LineJoinStyle,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setLineJoin,
  type PDFImage,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import {
  ICON_BLACK_B64,
  ICON_YELLOW_B64,
  LOGO_PRIMARY_B64,
  LOGO_SECONDARY_B64,
  LOGO_SMALL_B64,
} from "../../assets/brand";
import type { Doc } from "./doc";

export type BrandAssetKey = "logoPrimary" | "logoSecondary" | "logoSmall" | "iconYellow" | "iconBlack";

const B64: Record<BrandAssetKey, string> = {
  logoPrimary: LOGO_PRIMARY_B64, // strapline, for black bands
  logoSecondary: LOGO_SECONDARY_B64, // strapline, for white
  logoSmall: LOGO_SMALL_B64, // no strapline, small placements
  iconYellow: ICON_YELLOW_B64,
  iconBlack: ICON_BLACK_B64,
};

/** Base64 → bytes without Buffer (Worker-safe). */
export function decodeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function brandAssetBytes(key: BrandAssetKey): Uint8Array {
  return decodeBase64(B64[key]);
}

/** Embed a brand PNG once per document; later calls return the cached PDFImage. */
export async function embedBrandImage(doc: Doc, key: BrandAssetKey): Promise<PDFImage> {
  const cached = doc.images.get(key);
  if (cached) return cached;
  const image = await doc.pdf.embedPng(brandAssetBytes(key));
  doc.images.set(key, image);
  return image;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Draw an embedded image at `width` (or `height`) keeping its aspect ratio; returns the drawn size. */
export function drawImageFit(
  page: PDFPage,
  image: PDFImage,
  at: { x: number; y: number; width?: number; height?: number; opacity?: number },
): { width: number; height: number } {
  const ratio = image.width / image.height;
  let width = at.width ?? (at.height ?? image.width) * ratio;
  let height = at.height ?? width / ratio;
  if (at.width && at.height) {
    // Fit inside the box.
    if (width / height > ratio) width = height * ratio;
    else height = width / ratio;
  }
  page.drawImage(image, { x: at.x, y: at.y, width, height, opacity: at.opacity });
  return { width, height };
}

/**
 * Draw an image scaled to fill `rect` (cover-crop), clipped to it.
 */
export function drawImageCover(page: PDFPage, image: PDFImage, rect: Rect, opacity?: number): void {
  const ratio = image.width / image.height;
  let width = rect.w;
  let height = rect.w / ratio;
  if (height < rect.h) {
    height = rect.h;
    width = rect.h * ratio;
  }
  const x = rect.x + (rect.w - width) / 2;
  const y = rect.y + (rect.h - height) / 2;
  withClip(page, rect, () => {
    page.drawImage(image, { x, y, width, height, opacity });
  });
}

/** Run `draw` with the page's graphics clipped to `rect`. */
export function withClip(page: PDFPage, rect: Rect, draw: () => void): void {
  page.pushOperators(pushGraphicsState(), rectangle(rect.x, rect.y, rect.w, rect.h), clip(), endPath());
  try {
    draw();
  } finally {
    page.pushOperators(popGraphicsState());
  }
}

export interface HaloOptions {
  /** Centre of the ring, PDF coordinates. */
  cx: number;
  cy: number;
  /** Outer radius of the ring. */
  r: number;
  color: RGB;
  opacity?: number;
  /** Optional clip rectangle (a band or a photo) — the arc is cropped to it. */
  clip?: Rect;
  /** Draw the "A" chevron legs as well as the arc. Default true. */
  chevron?: boolean;
}

/**
 * The A-SAFE safety-halo motif as vectors: a thick ring open at the bottom,
 * with the "A" chevron dropping through it. Proportions are taken from the
 * icon artwork (ring stroke ≈ 0.32 R centred at 0.84 R; chevron apex just
 * above centre; legs reaching 1.16 R below). Drawn as vectors so it can be
 * tinted (90 % black on black bands, yellow at low opacity on photos) and
 * cropped to a corner with `clip`.
 */
export function drawHalo(page: PDFPage, o: HaloOptions): void {
  const R = o.r;
  const stroke = 0.32 * R;
  const rc = 0.84 * R;
  const deg = Math.PI / 180;
  // SVG space: origin at ring centre, y down. Ring opens between 62° and 118°
  // (the bottom), so the arc runs the long way round over the top.
  const a0 = 62 * deg;
  const a1 = 118 * deg;
  const sx = rc * Math.cos(a0);
  const sy = rc * Math.sin(a0);
  const ex = rc * Math.cos(a1);
  const ey = rc * Math.sin(a1);
  const arc = `M ${f(sx)} ${f(sy)} A ${f(rc)} ${f(rc)} 0 1 0 ${f(ex)} ${f(ey)}`;
  const apexY = -0.085 * R;
  const legX = 0.6 * R;
  const legY = 1.16 * R;
  const legs = `M ${f(-legX)} ${f(legY)} L 0 ${f(apexY)} L ${f(legX)} ${f(legY)}`;

  const draw = () => {
    page.pushOperators(pushGraphicsState(), setLineJoin(LineJoinStyle.Round));
    page.drawSvgPath(arc, {
      x: o.cx,
      y: o.cy,
      borderColor: o.color,
      borderWidth: stroke,
      borderOpacity: o.opacity ?? 1,
      borderLineCap: LineCapStyle.Butt,
    });
    if (o.chevron !== false) {
      page.drawSvgPath(legs, {
        x: o.cx,
        y: o.cy,
        borderColor: o.color,
        borderWidth: stroke,
        borderOpacity: o.opacity ?? 1,
        borderLineCap: LineCapStyle.Butt,
      });
    }
    page.pushOperators(popGraphicsState());
  };
  if (o.clip) withClip(page, o.clip, draw);
  else draw();
}

function f(n: number): string {
  return n.toFixed(2);
}
