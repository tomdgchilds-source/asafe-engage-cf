/**
 * Pure helpers for the per-drawing export status chip on the project
 * detail page (Phase 4 Task L5, client half). The worker exposes
 * GET /api/layout-drawings/:id/export → { objectKey, url, version, stale }
 * or 404 when the drawing has never been exported; POST re-renders the
 * A3 sheet. Everything that decides what the chip says lives here so it
 * can be unit-tested without React.
 */

export type DrawingExportStatus = {
  objectKey: string;
  url: string;
  /** documentVersion the stored PDF was rendered from. */
  version: number;
  /** True when the document has been saved since the export was rendered. */
  stale: boolean;
};

export type ExportChipState = "up_to_date" | "stale" | "not_exported";

export type ExportChip = {
  state: ExportChipState;
  label: string;
  /** Tailwind classes for the chip (light + dark). */
  className: string;
};

const CHIPS: Record<ExportChipState, ExportChip> = {
  up_to_date: {
    state: "up_to_date",
    label: "Export up to date",
    className:
      "border-green-200 bg-green-100 text-green-800 dark:border-green-900 dark:bg-green-900/30 dark:text-green-300",
  },
  stale: {
    state: "stale",
    label: "Export stale",
    className:
      "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-900/30 dark:text-amber-300",
  },
  not_exported: {
    state: "not_exported",
    label: "Not exported",
    className:
      "border-border bg-muted text-muted-foreground",
  },
};

/**
 * Map the export endpoint's response (null/undefined when it 404'd) to
 * the chip the card should show.
 */
export function exportChipState(
  status: DrawingExportStatus | null | undefined,
): ExportChipState {
  if (!status) return "not_exported";
  return status.stale ? "stale" : "up_to_date";
}

export function exportChip(status: DrawingExportStatus | null | undefined): ExportChip {
  return CHIPS[exportChipState(status)];
}

/** Button copy: first export vs. re-export, with an in-flight variant. */
export function exportButtonLabel(
  status: DrawingExportStatus | null | undefined,
  pending: boolean,
): string {
  if (pending) return "Exporting…";
  return exportChipState(status) === "not_exported" ? "Export sheet" : "Re-export sheet";
}

/** The sheet link is only offered when the server has a stored PDF. */
export function exportSheetUrl(status: DrawingExportStatus | null | undefined): string | null {
  return status?.url ? status.url : null;
}

/** True when a fetch error is the "never exported" 404 rather than a real failure. */
export function isNotExportedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: unknown }).status;
  if (typeof status === "number") return status === 404;
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" && /^404:/.test(message);
}
