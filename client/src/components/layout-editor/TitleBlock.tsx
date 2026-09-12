/**
 * client/src/components/layout-editor/TitleBlock.tsx
 *
 * A-SAFE DWC LLC drawing title block (ported from
 * layout-markup/components/TitleBlockFrame.tsx) wrapped around the
 * viewport. The barrier key on the right is derived from `FAMILIES` +
 * the document through `legendRows`, so it always matches the Legend.
 * Action buttons are supplied by the Editor via `actions`; the
 * html2canvas/print-preview machinery is gone (export is server-side).
 */

import { forwardRef, useMemo, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import asafeLogo from "@/assets/brand/asafe-logo-strapline.png";
import queensAwardImg from "@/assets/brand/queens-award.png";
import type { LayoutDoc } from "@shared/layout/doc";
import type { CatalogProductLike } from "@shared/layout/quantities";
import { FamilySwatch, legendRows } from "./Legend";

/** Substrate type; mirrors `layout_drawings.floor_type`. */
export type FloorType = "concrete" | "asphalt" | "interlock" | "tiles" | "underfloor_services" | "other";

export const FLOOR_TYPE_LABELS: Array<{ value: FloorType; label: string }> = [
  { value: "concrete", label: "Concrete" },
  { value: "asphalt", label: "Asphalt" },
  { value: "interlock", label: "Interlock" },
  { value: "tiles", label: "Tiles" },
  { value: "underfloor_services", label: "Underfloor services" },
  { value: "other", label: "Other" },
];

export interface TitleBlockMeta {
  dwgNumber?: string | null;
  revision?: string | null;
  drawingDate?: string | null;
  drawingTitle?: string | null;
  drawingScale?: string | null;
  project?: string | null;
  author?: string | null;
  checkedBy?: string | null;
  revisionHistory?: Array<{ rev: string; date: string; notes: string }> | null;
  notesSection?: string | null;
  floorType?: FloorType | null;
  vehicleTypeId?: string | null;
}

const OFFICE = {
  officeName: "A-SAFE DWC LLC",
  officeAddressLines: ["Office #220, Building A5", "Dubai South, Business Park", "Dubai, UAE"],
  officePhone: "Tel: 04 884 2422",
  officeWeb: "www.asafe.com",
};

export function todayDdMmmYyyy(): string {
  const d = new Date();
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${String(d.getDate()).padStart(2, "0")}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

/** Scale text for the title block: explicit override, else derived from the calibration. */
export function scaleLabel(meta: TitleBlockMeta, doc: LayoutDoc | null): string {
  if (meta.drawingScale) return meta.drawingScale;
  return doc?.calibration ? "CALIBRATED" : "NTS";
}

function Cell({ label, value, span = 1, className = "", mono = false }: { label?: string; value?: ReactNode; span?: number; className?: string; mono?: boolean }) {
  return (
    <div className={`truncate border-b border-r border-black px-1.5 py-[1px] leading-tight ${className}`} style={{ gridColumn: `span ${span}` }}>
      {label && <span className="mr-1 text-[8px] font-semibold">{label}</span>}
      <span className={mono ? "font-mono text-[9px]" : "text-[9px]"}>{value ?? ""}</span>
    </div>
  );
}

export interface TitleBlockProps {
  meta: TitleBlockMeta;
  doc: LayoutDoc | null;
  catalog: readonly CatalogProductLike[];
  onEditMeta?: () => void;
  /** Extra buttons rendered top-right of the header strip. */
  actions?: ReactNode;
  /** Phones: header strip and key are hidden, only the children render. */
  compact?: boolean;
  children: ReactNode;
}

export const TitleBlock = forwardRef<HTMLDivElement, TitleBlockProps>(function TitleBlock({ meta, doc, catalog, onEditMeta, actions, compact, children }, ref) {
  const revisionRows = useMemo(() => {
    const rows = meta.revisionHistory || [];
    const blanks = Math.max(0, 3 - rows.length);
    return [...rows, ...Array.from({ length: blanks }, () => ({ rev: "", date: "", notes: "" }))];
  }, [meta.revisionHistory]);

  const notesRows = useMemo(() => {
    const lines = (meta.notesSection || "").split(/\n/).filter(Boolean);
    const filled = lines.length ? lines : [""];
    return filled.length < 3 ? [...filled, ...Array.from({ length: 3 - filled.length }, () => "")] : filled;
  }, [meta.notesSection]);

  const key = useMemo(() => (doc ? legendRows(doc, catalog) : []), [doc, catalog]);

  if (compact) {
    return (
      <div ref={ref} className="flex min-h-0 w-full flex-1 flex-col bg-white dark:bg-gray-900">
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div ref={ref} className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-white dark:bg-gray-900">
        <div className="relative flex-shrink-0 border-b-2 border-black bg-white text-black" data-testid="title-block-frame">
          <div className="absolute right-1 top-1 z-20 flex items-center gap-1.5">
            {actions}
            {onEditMeta && (
              <button
                type="button"
                onClick={onEditMeta}
                className="flex items-center gap-1 rounded bg-yellow-400 px-2 py-1 text-[10px] text-black shadow hover:bg-yellow-500"
                data-testid="edit-title-block"
              >
                <Pencil className="h-3 w-3" />
                Edit metadata
              </button>
            )}
          </div>

          <div className="flex overflow-x-auto">
            <div className="grid flex-1 grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto_1fr] border-l border-t border-black text-[9px]">
              <Cell label="Dwg No  -" value={meta.dwgNumber || "TBD"} span={2} mono />
              <Cell label="Rev  -" value={meta.revision || "00"} span={1} mono />
              <Cell label="Date  -" value={meta.drawingDate || todayDdMmmYyyy()} span={1} mono />
              <Cell label="Scale  -" value={scaleLabel(meta, doc)} span={1} mono />
              <Cell label="" value="" span={3} className="bg-gray-50" />
              <Cell label="Title  -" value={meta.drawingTitle || "A-SAFE BARRIER PROPOSAL"} span={4} className="font-semibold" />
              <Cell label="" value="" span={4} className="bg-gray-50" />
              <Cell label="Project  -" value={meta.project || "—"} span={2} className="font-semibold" />
              <Cell label="Author  -" value={meta.author || "—"} span={1} mono />
              <Cell label="Checked By  -" value={meta.checkedBy || "—"} span={1} mono />
              <Cell label="" value="" span={4} className="bg-gray-50" />
              <div className="col-span-4 border-b border-r border-black bg-gray-100 px-1.5 py-1 text-[8px] font-bold leading-tight">
                NOTE: DO NOT SCALE.
                <br />
                WORK TO GIVEN DIMENSIONS ONLY
              </div>
              <div className="col-span-4 border-b border-r border-black bg-gray-50" />
            </div>

            <div className="flex border-t border-black text-[8px]">
              <div className="w-[170px] border-l border-r border-black">
                <div className="border-b border-black bg-gray-100 px-1 py-0.5 font-semibold">Revision History</div>
                <div className="grid grid-cols-[30px_60px_1fr] border-b border-black font-semibold">
                  <div className="border-r border-black px-1">Rev</div>
                  <div className="border-r border-black px-1">Date</div>
                  <div className="px-1">Notes</div>
                </div>
                {revisionRows.slice(0, 3).map((r, i) => (
                  <div key={i} className="grid h-[12px] grid-cols-[30px_60px_1fr] border-b border-black">
                    <div className="border-r border-black px-1 font-mono">{r.rev || ""}</div>
                    <div className="border-r border-black px-1 font-mono">{r.date || ""}</div>
                    <div className="truncate px-1">{r.notes || ""}</div>
                  </div>
                ))}
              </div>
              <div className="w-[150px] border-r border-black">
                <div className="border-b border-black bg-gray-100 px-1 py-0.5 font-semibold">Notes Section</div>
                {notesRows.slice(0, 4).map((n, i) => (
                  <div key={i} className="h-[12px] truncate border-b border-black px-1">
                    {n ? `- ${n}` : "-"}
                  </div>
                ))}
              </div>
              <div className="w-[120px] border-r border-black">
                <div className="border-b border-black bg-gray-100 px-1 py-0.5 font-semibold">Drawing Approval</div>
                <div className="h-[12px] border-b border-black px-1 font-semibold">Date</div>
                <div className="h-[12px] border-b border-black px-1 font-semibold">Approved By</div>
                <div className="h-[12px] border-b border-black px-1 font-semibold">Signature</div>
              </div>
            </div>

            <div className="flex border-t border-black">
              <div className="flex w-[200px] flex-col justify-center gap-0.5 border-r border-black px-2 py-0.5 text-[9px] leading-tight">
                <div>
                  <div className="font-bold">{OFFICE.officeName}</div>
                  <div className="mt-1 text-gray-700">
                    {OFFICE.officeAddressLines.map((l, i) => (
                      <div key={i}>{l}</div>
                    ))}
                  </div>
                </div>
                <div className="text-gray-700">
                  <div>{OFFICE.officePhone}</div>
                  <div>{OFFICE.officeWeb}</div>
                </div>
              </div>
              <div className="flex w-[210px] flex-col items-center justify-center border-r border-black bg-white px-3 py-1">
                <img src={asafeLogo} alt="A-SAFE" className="h-7 w-auto object-contain" draggable={false} />
                <div className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.18em] text-gray-700">Pioneering Workplace Safety</div>
              </div>
            </div>
          </div>

          <div className="bg-[#2d5a9c] px-3 py-[3px] text-center text-[8px] italic text-white" data-testid="confidentiality-strip">
            This document is confidential and the information contained therein, including the design principles and copyright is the property of A-SAFE DWC LLC. The document
            and/or the information therein may not be used, copied or reproduced, in part of whole to any third party, or used for manufacture or other purpose without prior
            authority of A-SAFE DWC LLC.
          </div>
        </div>

        <div className="relative flex flex-1 overflow-hidden">
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
          {key.length > 0 && (
            <aside className="w-[220px] flex-shrink-0 overflow-y-auto border-l-2 border-black bg-white text-black" data-testid="title-block-key">
              <div className="border-b border-black px-3 py-2">
                <h3 className="text-sm font-semibold underline underline-offset-2">A-Safe Barrier Key</h3>
              </div>
              <ul className="divide-y divide-gray-200">
                {key.map((row) => (
                  <li key={row.familyId} className="flex items-start gap-2 px-3 py-2">
                    <span className="whitespace-nowrap text-[11px] font-semibold text-yellow-700">{row.spec.letter}:-</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <FamilySwatch familyId={row.familyId} />
                        <span className="text-[11px]">{row.spec.label}</span>
                      </span>
                      {row.productNames.length > 0 && <span className="block truncate text-[10px] text-gray-600">{row.productNames.join(", ")}</span>}
                      <span className="block text-[10px] text-gray-600">
                        {row.runs > 0 && (doc?.calibration ? `${row.totalLengthM.toFixed(1)} m · ${row.posts} posts` : `${row.runs} runs`)}
                        {row.runs > 0 && row.stamps > 0 && " · "}
                        {row.stamps > 0 && `${row.stamps} ×`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center justify-end border-t border-black bg-white px-3 py-0.5 text-black">
          <img src={queensAwardImg} alt="Winners of the Queens Award for International Trade 2014 and 2018" className="h-6 w-auto object-contain" draggable={false} />
        </div>
      </div>
    </div>
  );
});
