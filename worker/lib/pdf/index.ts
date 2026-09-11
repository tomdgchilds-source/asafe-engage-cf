// ────────────────────────────────────────────────────────────────────────────
// worker/lib/pdf — A-SAFE customer document rendering library (pdf-lib).
//
//   theme.ts   brand colours, risk colours, type scale
//   doc.ts     createDoc / addPage / ensureSpace / finalize, mm()
//   text.ts    measure / wrap / drawText / heading / body / small / label
//   blocks.ts  cover, document control, KPI tiles, risk matrix, table, chip,
//              photo, product card, callout, sign-off, hierarchy of controls,
//              section divider
//   images.ts  fetchImageBytes (R2 / CDN / data URL) and embedImage (JPEG/PNG)
//   assets.ts  embedded logo PNGs, vector halo motif, clipping helpers
//
// Report renderers live in ./reports/ and compose these.
// ────────────────────────────────────────────────────────────────────────────

export * from "./theme";
export * from "./doc";
export * from "./text";
export * from "./blocks";
export * from "./images";
export {
  decodeBase64,
  brandAssetBytes,
  embedBrandImage,
  drawImageFit,
  drawImageCover,
  withClip,
  drawHalo,
  type BrandAssetKey,
  type HaloOptions,
  type Rect,
} from "./assets";
