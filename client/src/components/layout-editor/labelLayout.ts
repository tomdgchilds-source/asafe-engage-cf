/**
 * client/src/components/layout-editor/labelLayout.ts
 *
 * Tiny label placer for the overlay: each label tries four offsets around
 * its anchor (above, below, right, left) and takes the first one that
 * doesn't overlap an already-placed label or a caller-supplied obstacle.
 * If every offset collides the first one wins — a slightly overlapping
 * label beats a missing one on a busy sheet. Pure; all units are content
 * px (the caller pre-scales label boxes by 1/zoom).
 */

import type { Pt } from "@shared/layout/doc";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LabelBox {
  id: string;
  anchor: Pt;
  width: number;
  height: number;
}

export interface PlacedLabel extends Rect {
  id: string;
  /** Which of the four offsets was used (0 above, 1 below, 2 right, 3 left). */
  slot: number;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function candidates(box: LabelBox, gap: number): Rect[] {
  const { anchor, width, height } = box;
  return [
    { x: anchor.x - width / 2, y: anchor.y - gap - height, width, height },
    { x: anchor.x - width / 2, y: anchor.y + gap, width, height },
    { x: anchor.x + gap, y: anchor.y - height / 2, width, height },
    { x: anchor.x - gap - width, y: anchor.y - height / 2, width, height },
  ];
}

export function placeLabels(items: readonly LabelBox[], gap: number, obstacles: readonly Rect[] = []): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const occupied: Rect[] = [...obstacles];
  for (const box of items) {
    const options = candidates(box, gap);
    let chosen = 0;
    for (let i = 0; i < options.length; i++) {
      if (!occupied.some((r) => rectsOverlap(r, options[i]))) {
        chosen = i;
        break;
      }
    }
    const rect = options[chosen];
    placed.push({ id: box.id, slot: chosen, ...rect });
    occupied.push(rect);
  }
  return placed;
}
