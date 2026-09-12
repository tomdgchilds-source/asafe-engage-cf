export * from "./viewportMath";
export * from "./gestureMath";
export { useViewport, type ViewportApi } from "./useViewport";
export { useGestures, type GestureHandlers, type GesturePoint, type GestureState, type UseGesturesOptions, type ActiveGesture } from "./useGestures";
export { Viewport, type ViewportProps, type ViewportHandle } from "./Viewport";
export { BaseLayer, computeRasterTier, RASTER_DEBOUNCE_MS, type BaseLayerProps, type BaseSource } from "./BaseLayer";
export { pdfOptions, PDF_WORKER_SRC, PDFJS_VERSION } from "./pdfConfig";

// ─── Task L3: tools, overlay, editor (additions only; L2 exports above unchanged) ───
export { LayoutEditor, type LayoutEditorProps } from "./Editor";
export { Overlay, formatMm, runLabels, type OverlayProps } from "./Overlay";
export { Toolbar, type ToolbarProps } from "./Toolbar";
export { ProductPicker, readLastSelection, writeLastSelection, type ProductPickerProps } from "./ProductPicker";
export { Legend, FamilySwatch, legendRows, type LegendProps, type LegendRow } from "./Legend";
export { Inspector, ElementContextSheet, type InspectorProps } from "./Inspector";
export { GuardrailPanel, type GuardrailPanelProps } from "./GuardrailPanel";
export { TitleBlock, FLOOR_TYPE_LABELS, scaleLabel, type TitleBlockMeta, type FloorType, type TitleBlockProps } from "./TitleBlock";
export { TitleBlockEditor } from "./TitleBlockEditor";
export { CalibrateDialog, sheetCalibration, toMm, PAPER_WIDTHS_MM, SCALE_RATIOS, type LengthUnit } from "./CalibrateDialog";
export { NoteDialog } from "./NoteDialog";
export { TransferToCartDialog, type TransferToCartDialogProps } from "./TransferToCartDialog";
export { useHistory, HISTORY_CAP, type HistoryApi } from "./useHistory";
export { useDocSync, DOC_SAVE_DEBOUNCE_MS, type DocSyncApi, type DocSyncStatus } from "./useDocSync";
export { useBaseSource, baseKindFor, type BaseKind } from "./useBaseSource";
export { evaluateGuardrails, groupViolationsByElement, worstSeverityDotColour, type GuardrailViolation, type GuardrailCode } from "./guardrails";
export { placeLabels, type LabelBox, type PlacedLabel } from "./labelLayout";
export { useCatalog, useVehicleTypes, guardrailProductsFromCatalog, groupProductsByFamily, type CatalogProduct } from "./catalog";
export * from "./tools";
