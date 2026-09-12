/**
 * client/src/components/layout-editor/useBaseSource.ts
 *
 * Turns a `layout_drawings` row into a `BaseSource` for the Viewport:
 * fetches the file with credentials and exposes a same-origin blob: URL
 * (react-pdf and <img> both accept it; a raw /api/objects URL would 401
 * inside the pdf.js worker), renders the "blank canvas" graph paper
 * locally, and flags DWG/DXF as unsupported. Revokes the blob on change.
 */

import { useEffect, useState } from "react";
import type { BaseSource } from "./BaseLayer";

export interface BaseDrawingLike {
  id: string;
  fileUrl: string;
  fileType: string;
  fileName: string;
}

export type BaseKind = "image" | "pdf" | "canvas" | "dwg";

export function baseKindFor(d: BaseDrawingLike | null): BaseKind | null {
  if (!d) return null;
  const name = (d.fileName || "").toLowerCase();
  if (d.fileType === "canvas" || d.fileUrl === "blank-canvas") return "canvas";
  if (d.fileType === "dwg" || /\.(dwg|dxf)$/.test(name)) return "dwg";
  if (d.fileType === "image" || /\.(jpe?g|png|gif|webp|bmp|svg)$/.test(name)) return "image";
  return "pdf";
}

export interface BaseSourceState {
  source: BaseSource | null;
  kind: BaseKind | null;
  loading: boolean;
  error: string | null;
}

function graphPaperBlob(): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = 4000;
  canvas.height = 4000;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = "#fdfdf8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const grid = 40;
  const major = grid * 5;
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = "#d4e4f7";
  for (let x = 0; x <= canvas.width; x += grid) {
    if (x % major === 0) continue;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += grid) {
    if (y % major === 0) continue;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#a8c5e8";
  for (let x = 0; x <= canvas.width; x += major) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += major) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export function useBaseSource(drawing: BaseDrawingLike | null, enabled = true): BaseSourceState {
  const [state, setState] = useState<BaseSourceState>({ source: null, kind: null, loading: false, error: null });
  const kind = baseKindFor(drawing);
  const fileUrl = drawing?.fileUrl ?? null;

  useEffect(() => {
    if (!enabled || !drawing || !kind || !fileUrl) {
      setState({ source: null, kind, loading: false, error: null });
      return;
    }
    if (kind === "dwg") {
      setState({ source: null, kind, loading: false, error: "DWG / DXF files can't be displayed in the browser. Export the sheet as PDF and upload that." });
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    setState({ source: null, kind, loading: true, error: null });

    (async () => {
      try {
        const blob = kind === "canvas" ? await graphPaperBlob() : await fetchFile(fileUrl, kind);
        if (cancelled) return;
        if (!blob) throw new Error("Could not prepare the drawing");
        url = URL.createObjectURL(blob);
        const source: BaseSource = kind === "pdf" ? { kind: "pdf", url, pageNumber: 1 } : { kind: "image", url, alt: drawing.fileName };
        setState({ source, kind, loading: false, error: null });
      } catch (e) {
        if (cancelled) return;
        setState({ source: null, kind, loading: false, error: e instanceof Error ? e.message : "Failed to load drawing" });
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, drawing?.id, fileUrl, kind]);

  return state;
}

async function fetchFile(fileUrl: string, kind: BaseKind): Promise<Blob> {
  const res = await fetch(fileUrl, {
    credentials: "include",
    headers: { Accept: kind === "pdf" ? "application/pdf" : "image/*" },
  });
  if (!res.ok) throw new Error(`Failed to load file (${res.status})`);
  return res.blob();
}
