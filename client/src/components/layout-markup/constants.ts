import { pdfjs } from 'react-pdf';

// PDF.js worker — MUST match the pdfjs-dist version react-pdf ships with.
// react-pdf 10.4.1 → pdfjs-dist 5.4.296. The worker file lives in
// /public/pdf.worker.min.mjs, copied from node_modules at build time (see
// scripts/copy-pdf-worker.sh, invoked from npm run build).
//
// If you see "Failed to load PDF file" or "Setting up fake worker" in the
// console, verify:
//   1. /pdf.worker.min.mjs resolves (HTTP 200) on the deployed site
//   2. Its contents match node_modules/pdfjs-dist/build/pdf.worker.min.mjs
//   3. PDFJS_VERSION below matches the pdfjs-dist dep on disk
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// Pin helper-asset URLs to the matching pdfjs version. Drift between
// react-pdf's bundled pdfjs and the CDN version here causes silent font
// failures on PDFs that reference CID/Type0 fonts (most AutoCAD exports).
const PDFJS_VERSION = '5.4.296';

// Mobile-optimized PDF.js configuration
export const pdfOptions = {
  cMapUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
  cMapPacked: true,
  disableWorker: false,
  // Mobile performance optimizations
  renderInteractiveForms: false,
  enableXfa: false,
  // Enhanced mobile rendering settings
  verbosity: 0, // Reduce logging overhead
  maxImageSize: 16777216, // 16MB limit for mobile
  standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/standard_fonts/`,
  // useOnlyCssZoom:true told pdf.js to rasterise the page once at 1× and
  // let the browser CSS-scale the bitmap for every subsequent zoom. That
  // keeps memory low but goes visibly blurry past ~2-3× zoom — which is
  // exactly where designers start doing fine-detail barrier placement.
  // We now drive the actual <Page scale={…}> from the zoom level (tiered
  // — see CanvasOverlay) so pdf.js re-rasterises at a matching resolution
  // and strokes stay crisp at 10×+ zoom. CSS scale still handles the
  // fractional overshoot to keep zoom interaction instant.
  useOnlyCssZoom: false,
  textLayerMode: 0, // Disable text layer for better performance
  disableAutoFetch: false,
  disableStream: false,
  disableRange: false,
  // Mobile-specific optimizations
  isEvalSupported: false // Better security and performance
};

// Shared zoom clamp bounds — used by both the mouse-wheel handler and
// the pinch-to-zoom path in useCanvasDrawing, plus the on-screen zoom
// buttons in index.tsx. Bumping MAX_ZOOM here is the single lever for
// "let designers zoom further in".
//
// 40× covers pixel-peeping on a 1:100 A0 sheet (real-world mm → ~0.1px
// at fit-to-window would become ~4px at 40×, comfortably clickable).
// Lower bound stays at 2% so big landscape CAD sheets can still fit.
export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 40;

// Simple color system for products
export const productColors = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1',
  '#14B8A6', '#F43F5E', '#A855F7', '#22C55E', '#EAB308'
];
