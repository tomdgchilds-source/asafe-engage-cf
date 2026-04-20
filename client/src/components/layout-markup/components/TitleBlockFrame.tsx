import { forwardRef, useMemo } from "react";
import { Pencil, Download, Printer, X as XIcon } from "lucide-react";
// Real brand assets — use the official A-SAFE strapline logo and the
// extracted Queens Award crest from the reference CAD sheet. Both live in
// client/src/assets/brand/ so vite handles them as module imports (with
// content-hash cache busting) and they ship in the JS bundle.
import asafeLogo from "@/assets/brand/asafe-logo-strapline.png";
import queensAwardImg from "@/assets/brand/queens-award.png";
import type { LayoutMarkup } from "@shared/schema";

/**
 * Metadata block rendered inside the title frame. All fields are optional —
 * a drawing that hasn't been filled in yet gracefully falls back to "TBD"
 * / the current date / a generated drawing number so the frame is always
 * complete looking.
 */
export interface TitleBlockMeta {
  dwgNumber?: string | null;
  revision?: string | null;
  drawingDate?: string | null;   // "DD-MMM-YYYY"
  drawingTitle?: string | null;  // defaults to "A-SAFE BARRIER PROPOSAL"
  drawingScale?: string | null;  // defaults to "NTS"
  project?: string | null;       // top-line client / project
  author?: string | null;        // initials
  checkedBy?: string | null;     // initials
  revisionHistory?: Array<{ rev: string; date: string; notes: string }> | null;
  notesSection?: string | null;
  /** Copy displayed in the top-right address block. */
  officeName?: string;
  officeAddressLines?: string[];
  officePhone?: string;
  officeWeb?: string;
}

export interface BarrierKeyEntry {
  /** Letter shown in the key, e.g. "A.1", "B", "C" */
  letter: string;
  /** Full product name e.g. "iFlex Bollard — 190mm OD × 835mm H" */
  label: string;
  /** Swatch colour used for the product in the drawing */
  color: string;
}

interface TitleBlockFrameProps {
  meta: TitleBlockMeta;
  /** Optional — dynamically built from the markups on the drawing. */
  barrierKey?: BarrierKeyEntry[];
  /** Callback when the user clicks the edit button on the title block. */
  onEditMeta?: () => void;
  /** Callback when the user clicks "Download PDF". */
  onExportPdf?: () => void;
  /** Print-preview mode: when true the frame is scaled to A3 landscape
   * proportions for a WYSIWYG preview of the PDF export. */
  isPrintPreview?: boolean;
  /** Toggle print-preview mode. */
  onTogglePrintPreview?: () => void;
  /** Hide action buttons (used when we're rendering OFFSCREEN for capture). */
  hideActionButtons?: boolean;
  /** Progress label shown while the PDF export is running. */
  exportProgressLabel?: string | null;
  /** Main content — the canvas viewport goes here. */
  children: React.ReactNode;
}

const DEFAULT_OFFICE = {
  officeName: "A-SAFE DWC LLC",
  officeAddressLines: ["Office #220, Building A5", "Dubai South, Business Park", "Dubai, UAE"],
  officePhone: "Tel: 04 884 2422",
  officeWeb: "www.asafe.com",
};

/** Format today as "DD-MMM-YYYY" to match the printed template. */
function todayDdMmmYyyy(): string {
  const d = new Date();
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const dd = String(d.getDate()).padStart(2, "0");
  return `${dd}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

/** Small helper for title-block cells to keep the grid consistent.
 * Kept deliberately tight — the sales team spends 95% of their time looking
 * at the drawing, not the metadata frame around it. */
function Cell({
  label,
  value,
  span = 1,
  className = "",
  mono = false,
}: {
  label?: string;
  value?: React.ReactNode;
  span?: number;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div
      className={`border-r border-b border-black px-1.5 py-[1px] leading-tight truncate ${className}`}
      style={{ gridColumn: `span ${span}` }}
    >
      {label && (
        <span className="font-semibold text-[8px] mr-1">{label}</span>
      )}
      <span className={mono ? "font-mono text-[9px]" : "text-[9px]"}>{value ?? ""}</span>
    </div>
  );
}

/**
 * Full-width A-SAFE CAD drawing title block, styled to match the
 * DWC LLC drawing template (DWGAE-series). Renders as HTML around the
 * children (the drawing canvas), so the editor view looks like a printed
 * deliverable the moment a drawing is uploaded.
 */
export const TitleBlockFrame = forwardRef<HTMLDivElement, TitleBlockFrameProps>(function TitleBlockFrame({
  meta,
  barrierKey,
  onEditMeta,
  onExportPdf,
  isPrintPreview,
  onTogglePrintPreview,
  hideActionButtons,
  exportProgressLabel,
  children,
}, ref) {
  const office = {
    ...DEFAULT_OFFICE,
    ...(meta.officeName ? { officeName: meta.officeName } : {}),
    ...(meta.officeAddressLines ? { officeAddressLines: meta.officeAddressLines } : {}),
    ...(meta.officePhone ? { officePhone: meta.officePhone } : {}),
    ...(meta.officeWeb ? { officeWeb: meta.officeWeb } : {}),
  };

  // Build the revision history with at least 3 blank rows so the block
  // always has the "CAD template" look even on a brand-new drawing.
  const revisionRows = useMemo(() => {
    const rows = meta.revisionHistory || [];
    const blanks = Math.max(0, 3 - rows.length);
    return [
      ...rows,
      ...Array.from({ length: blanks }, () => ({ rev: "", date: "", notes: "" })),
    ];
  }, [meta.revisionHistory]);

  const notesLines = (meta.notesSection || "").split(/\n/).filter(Boolean);
  const notesRows = useMemo(() => {
    const filled = notesLines.length ? notesLines : [""];
    const padded = filled.length < 3 ? [...filled, ...Array.from({ length: 3 - filled.length }, () => "")] : filled;
    return padded;
  }, [notesLines]);

  // In print-preview mode we render the frame at a fixed A3-landscape aspect
  // ratio (420:297 ≈ 1.414) so the user sees exactly what the PDF export
  // will produce. A neutral grey backdrop surrounds the "page" to reinforce
  // the print metaphor.
  // In non-preview mode the outer wrapper has to be `flex-1 min-h-0` so
  // the frame actually stretches inside its flex-column parent — without
  // min-h-0 flex children don't shrink below their content height and the
  // canvas area collapses to the bare minimum (we saw this as a ~79px
  // strip instead of a full-size drawing viewport).
  const previewWrapperClass = isPrintPreview
    ? "flex flex-col items-center justify-center h-full w-full bg-gray-300 dark:bg-gray-800 overflow-auto p-4"
    : "flex-1 min-h-0 flex flex-col w-full";
  const frameBaseClass =
    "flex-1 min-h-0 flex flex-col w-full bg-white dark:bg-gray-900 overflow-hidden";
  const frameClass = isPrintPreview
    ? "flex flex-col bg-white text-black overflow-hidden shadow-2xl"
    : frameBaseClass;
  const previewStyle = isPrintPreview
    ? {
        // A3 landscape: 420 × 297mm → 1.414 aspect ratio
        aspectRatio: "420 / 297",
        width: "min(100%, 1400px)",
        maxHeight: "calc(100vh - 160px)",
      }
    : undefined;

  return (
    <div className={previewWrapperClass}>
      <div
        ref={ref}
        className={frameClass}
        style={previewStyle}
      >
      {/* ── TITLE BLOCK (top header strip) ───────────────────────── */}
      <div
        className="flex-shrink-0 bg-white text-black border-b-2 border-black relative"
        data-testid="title-block-frame"
      >
        {/* Action buttons strip — above the title block, right-aligned.
            Hidden during capture so they don't appear in the exported PDF. */}
        {!hideActionButtons && (onEditMeta || onExportPdf || onTogglePrintPreview) && (
          <div
            className="absolute top-1 right-1 z-20 flex items-center gap-1.5"
            data-html2canvas-ignore="true"
          >
            {exportProgressLabel && (
              <span className="text-[10px] bg-black/80 text-white px-2 py-0.5 rounded animate-pulse">
                {exportProgressLabel}
              </span>
            )}
            {onEditMeta && (
              <button
                type="button"
                onClick={onEditMeta}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-yellow-400 hover:bg-yellow-500 text-black rounded shadow"
                data-testid="edit-title-block"
              >
                <Pencil className="h-3 w-3" />
                Edit metadata
              </button>
            )}
            {onTogglePrintPreview && (
              <button
                type="button"
                onClick={onTogglePrintPreview}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-gray-700 hover:bg-gray-800 text-white rounded shadow"
                data-testid="toggle-print-preview"
              >
                {isPrintPreview ? <><XIcon className="h-3 w-3" />Exit preview</> : <><Printer className="h-3 w-3" />Print preview</>}
              </button>
            )}
            {onExportPdf && (
              <button
                type="button"
                onClick={onExportPdf}
                disabled={!!exportProgressLabel}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded shadow"
                data-testid="download-layout-pdf"
              >
                <Download className="h-3 w-3" />
                Download PDF
              </button>
            )}
          </div>
        )}

        <div className="flex">
          {/* LEFT — main title-block grid */}
          <div className="flex-1 grid grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto_1fr] text-[9px] border-t border-l border-black">
            {/* Row 1 */}
            <Cell label="Dwg No  -" value={meta.dwgNumber || "TBD"} span={2} mono />
            <Cell label="Rev  -" value={meta.revision || "00"} span={1} mono />
            <Cell label="Date  -" value={meta.drawingDate || todayDdMmmYyyy()} span={1} mono />
            <Cell label="Scale  -" value={meta.drawingScale || "NTS"} span={1} mono />
            <Cell label="" value="" span={3} className="bg-gray-50" />
            {/* Row 2 */}
            <Cell label="Title  -" value={meta.drawingTitle || "A-SAFE BARRIER PROPOSAL"} span={4} className="font-semibold" />
            <Cell label="" value="" span={4} className="bg-gray-50" />
            {/* Row 3 */}
            <Cell label="Project  -" value={meta.project || "—"} span={2} className="font-semibold" />
            <Cell label="Author  -" value={meta.author || "—"} span={1} mono />
            <Cell label="Checked By  -" value={meta.checkedBy || "—"} span={1} mono />
            <Cell label="" value="" span={4} className="bg-gray-50" />
            {/* Row 4 — "do not scale" banner */}
            <div
              className="col-span-4 border-r border-b border-black bg-gray-100 px-1.5 py-1 font-bold text-[8px] leading-tight"
            >
              NOTE: DO NOT SCALE.
              <br />
              WORK TO GIVEN DIMENSIONS ONLY
            </div>
            <div className="col-span-4 border-r border-b border-black bg-gray-50" />
          </div>

          {/* REVISION HISTORY | NOTES SECTION | DRAWING APPROVAL — middle block */}
          <div className="flex border-t border-black text-[8px]">
            {/* Revision History */}
            <div className="w-[170px] border-r border-l border-black">
              <div className="bg-gray-100 font-semibold px-1 py-0.5 border-b border-black">
                Revision History
              </div>
              <div className="grid grid-cols-[30px_60px_1fr] border-b border-black font-semibold">
                <div className="px-1 border-r border-black">Rev</div>
                <div className="px-1 border-r border-black">Date</div>
                <div className="px-1">Notes</div>
              </div>
              {revisionRows.slice(0, 3).map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[30px_60px_1fr] border-b border-black h-[12px]"
                >
                  <div className="px-1 border-r border-black font-mono">{r.rev || ""}</div>
                  <div className="px-1 border-r border-black font-mono">{r.date || ""}</div>
                  <div className="px-1 truncate">{r.notes || ""}</div>
                </div>
              ))}
            </div>

            {/* Notes Section */}
            <div className="w-[150px] border-r border-black">
              <div className="bg-gray-100 font-semibold px-1 py-0.5 border-b border-black">
                Notes Section
              </div>
              {notesRows.slice(0, 4).map((n, i) => (
                <div key={i} className="border-b border-black h-[12px] px-1 truncate">
                  {n ? `- ${n}` : "-"}
                </div>
              ))}
            </div>

            {/* Drawing Approval */}
            <div className="w-[120px] border-r border-black">
              <div className="bg-gray-100 font-semibold px-1 py-0.5 border-b border-black">
                Drawing Approval
              </div>
              <div className="border-b border-black h-[12px] px-1">
                <span className="font-semibold">Date</span>
              </div>
              <div className="border-b border-black h-[12px] px-1">
                <span className="font-semibold">Approved By</span>
              </div>
              <div className="border-b border-black h-[12px] px-1">
                <span className="font-semibold">Signature</span>
              </div>
            </div>
          </div>

          {/* RIGHT — office address + logo */}
          <div className="flex border-t border-black">
            <div className="w-[200px] border-r border-black px-2 py-0.5 text-[9px] leading-tight flex flex-col justify-center gap-0.5">
              <div>
                <div className="font-bold">{office.officeName}</div>
                <div className="mt-1 text-gray-700">
                  {office.officeAddressLines.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              </div>
              <div className="text-gray-700">
                <div>{office.officePhone}</div>
                <div>{office.officeWeb}</div>
              </div>
            </div>
            {/* Real A-SAFE strapline logo — icon + wordmark in one asset, no
                hand-crafted text block. The strapline line underneath is
                added as plain text for crispness at small print sizes
                (the raster strapline in the PNG turns mushy below ~14px). */}
            <div className="w-[210px] border-r border-black bg-white flex flex-col items-center justify-center px-3 py-1">
              <img
                src={asafeLogo}
                alt="A-SAFE"
                className="h-7 w-auto object-contain"
                draggable={false}
              />
              <div className="text-[7px] font-semibold text-gray-700 uppercase tracking-[0.18em] mt-0.5">
                Pioneering Workplace Safety
              </div>
            </div>
          </div>
        </div>

        {/* Confidentiality strip */}
        <div
          className="bg-[#2d5a9c] text-white text-[8px] italic text-center px-3 py-[3px]"
          data-testid="confidentiality-strip"
        >
          This document is confidential and the information contained therein,
          including the design principles and copyright is the property of A-SAFE DWC LLC.
          The document and/or the information therein may not be used, copied or reproduced,
          in part of whole to any third party, or used for manufacture or other purpose
          without prior authority of A-SAFE DWC LLC.
        </div>
      </div>

      {/* ── MAIN CANVAS AREA (children) — with optional barrier key on the right ── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Must be `flex` so CanvasOverlay's outer `flex-1` resolves to a
            real pixel height. Without the flex context `h-full` inside
            the canvas container can't resolve past 0 and the whole
            drawing viewport collapses to ~39px. */}
        <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">{children}</div>

        {/* Right-hand barrier key — only rendered when there are markups
            (we don't want an empty panel eating real estate). */}
        {barrierKey && barrierKey.length > 0 && (
          <aside className="w-[220px] flex-shrink-0 border-l-2 border-black bg-white text-black overflow-y-auto">
            <div className="px-3 py-2 border-b border-black">
              <h3 className="font-semibold text-sm underline underline-offset-2">A-Safe Barrier Key</h3>
              <div className="grid grid-cols-2 mt-2 text-[10px] font-semibold text-gray-700">
                <div>Typical Elevation</div>
                <div>Plan View</div>
              </div>
            </div>
            <ul className="divide-y divide-gray-200">
              {barrierKey.map((b) => (
                <li key={b.letter} className="px-3 py-2 flex items-start gap-2">
                  <span className="font-semibold text-[11px] text-yellow-700 whitespace-nowrap">
                    {b.letter}:-
                  </span>
                  <span className="flex-1">
                    <span className="inline-block w-3 h-3 rounded-sm mr-1 align-middle border border-gray-400" style={{ backgroundColor: b.color }} />
                    <span className="text-[11px] align-middle">{b.label}</span>
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      {/* ── QUEENS AWARD FOOTER — real crest + strapline, extracted from
          the A-SAFE DWC LLC reference CAD sheet so it matches the printed
          deliverable exactly. Kept compact so the drawing area keeps the
          lion's share of vertical space. ── */}
      <div className="flex-shrink-0 bg-white text-black border-t border-black px-3 py-0.5 flex justify-end items-center">
        <img
          src={queensAwardImg}
          alt="Winners of the Queens Award for International Trade 2014 and 2018"
          className="h-6 w-auto object-contain"
          draggable={false}
        />
      </div>
      </div>
    </div>
  );
});
