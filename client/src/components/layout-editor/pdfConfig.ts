/**
 * client/src/components/layout-editor/pdfConfig.ts
 *
 * pdf.js worker + document options for the layout editor's PDF base
 * layer. Carried over from layout-markup/constants.ts so that module can
 * be deleted in Task L3 without the new editor losing its worker.
 *
 * The worker MUST match the pdfjs-dist version react-pdf ships with
 * (react-pdf 10.x → pdfjs-dist 5.4.296). /pdf.worker.min.mjs is copied
 * from node_modules at build time (scripts/copy-pdf-worker.sh). If the
 * console says "Setting up fake worker", check that file resolves and that
 * PDFJS_VERSION below matches the dependency on disk.
 */

import { pdfjs } from "react-pdf";

export const PDF_WORKER_SRC = "/pdf.worker.min.mjs";
export const PDFJS_VERSION = "5.4.296";

if (pdfjs.GlobalWorkerOptions.workerSrc !== PDF_WORKER_SRC) {
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
}

/**
 * Module-level constant on purpose: react-pdf reloads the document whenever
 * the `options` object identity changes.
 */
export const pdfOptions = Object.freeze({
  cMapUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/standard_fonts/`,
  disableWorker: false,
  renderInteractiveForms: false,
  enableXfa: false,
  verbosity: 0,
  maxImageSize: 16777216, // 16 MB — keeps low-end tablets alive on big CAD sheets
  // We re-rasterise at a tiered scale (see BaseLayer) instead of relying on
  // CSS zoom alone, so strokes stay crisp past 4x.
  useOnlyCssZoom: false,
  textLayerMode: 0,
  disableAutoFetch: false,
  disableStream: false,
  disableRange: false,
  isEvalSupported: false,
});
