/**
 * One-click PDF export of a framed layout drawing (title block + canvas +
 * barrier key + footer). Captures the DOM of the title-block frame via
 * html2canvas and drops the resulting raster into an A3 landscape jsPDF
 * page so the output matches the manually-produced CAD deliverable.
 *
 * Why raster instead of vector: the drawing viewport is an <img> transformed
 * with CSS, plus SVG overlays for markup paths. Re-implementing the whole
 * thing in vector-PDF primitives would be a week of work; html2canvas gives
 * us a pixel-accurate snapshot at high DPI with zero structural changes.
 *
 * If the user later wants a vector PDF (smaller file size, text-searchable),
 * we can swap this for a dedicated jsPDF composer that recreates the title
 * block cell-by-cell and embeds the underlying drawing as an image.
 */
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export interface ExportLayoutPdfOptions {
  /** DOM node to capture. Should be the TitleBlockFrame root. */
  node: HTMLElement;
  /** Filename (without extension). Defaults to a dated A-SAFE name. */
  filename?: string;
  /** Paper size. A3 landscape matches the printed template. */
  paper?: "A3" | "A4" | "A1";
  /**
   * Pixel ratio for html2canvas. 2 is a good balance — higher produces
   * sharper output but balloons file size. Cap at 3 to avoid OOM.
   */
  scale?: number;
  /**
   * Optional callback so the UI can show progress hints
   * ("rendering…", "compressing…", "saving…"). Values are 0..1.
   */
  onProgress?: (pct: number, label: string) => void;
}

const PAPER_SIZES_MM: Record<NonNullable<ExportLayoutPdfOptions["paper"]>, [number, number]> = {
  A4: [297, 210], // landscape
  A3: [420, 297],
  A1: [841, 594],
};

/**
 * Capture a DOM node and place it on a single landscape PDF page, scaled
 * to fit with a small margin so the printed edge isn't flush against the
 * paper boundary. Triggers a browser download via jsPDF.save().
 */
export async function exportLayoutDrawingPdf({
  node,
  filename,
  paper = "A3",
  scale = 2,
  onProgress,
}: ExportLayoutPdfOptions): Promise<void> {
  if (!node) throw new Error("No DOM node provided for PDF export");

  onProgress?.(0.05, "Preparing capture…");

  // Pre-paint hint so the browser flushes any pending renders/scroll.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  onProgress?.(0.15, "Capturing layout…");

  // html2canvas renders the node at its on-screen size × scale. We clamp
  // scale because very large drawings × 3x pixel ratio will run the tab
  // out of memory on low-end devices.
  const safeScale = Math.min(Math.max(scale, 1), 3);

  const canvas = await html2canvas(node, {
    backgroundColor: "#ffffff",
    scale: safeScale,
    // Don't taint the canvas with cross-origin images — our auth-gated
    // /api/objects/* images are same-origin so CORS isn't an issue in prod.
    useCORS: true,
    allowTaint: false,
    // Skip any scrolling inside the node — we want the entire content.
    scrollX: 0,
    scrollY: -window.scrollY,
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
    logging: false,
  });

  onProgress?.(0.65, "Building PDF…");

  const [pageWmm, pageHmm] = PAPER_SIZES_MM[paper];
  const marginMm = 8;
  const availableWmm = pageWmm - marginMm * 2;
  const availableHmm = pageHmm - marginMm * 2;

  // Scale the captured image to fit the available area while preserving
  // aspect. We'll centre it on the page.
  const imgRatio = canvas.width / canvas.height;
  const pageRatio = availableWmm / availableHmm;

  let drawWmm: number;
  let drawHmm: number;
  if (imgRatio > pageRatio) {
    // Image is wider than the page — fit to width.
    drawWmm = availableWmm;
    drawHmm = drawWmm / imgRatio;
  } else {
    drawHmm = availableHmm;
    drawWmm = drawHmm * imgRatio;
  }
  const offsetX = marginMm + (availableWmm - drawWmm) / 2;
  const offsetY = marginMm + (availableHmm - drawHmm) / 2;

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: paper.toLowerCase() as "a1" | "a3" | "a4",
    compress: true,
  });

  // JPEG is smaller than PNG for photos + greyscale rasters. Quality 0.92
  // is visually indistinguishable from PNG at our DPI.
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

  pdf.addImage(dataUrl, "JPEG", offsetX, offsetY, drawWmm, drawHmm, undefined, "FAST");

  onProgress?.(0.9, "Saving file…");

  const defaultName = `A-SAFE_Layout_${new Date().toISOString().split("T")[0]}.pdf`;
  pdf.save(filename ? `${filename}.pdf` : defaultName);

  onProgress?.(1, "Done");
}
