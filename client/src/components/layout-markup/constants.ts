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
  // Better memory management on mobile
  useOnlyCssZoom: true,
  textLayerMode: 0, // Disable text layer for better performance
  disableAutoFetch: false,
  disableStream: false,
  disableRange: false,
  // Mobile-specific optimizations
  isEvalSupported: false // Better security and performance
};

// Simple color system for products
export const productColors = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1',
  '#14B8A6', '#F43F5E', '#A855F7', '#22C55E', '#EAB308'
];
