/**
 * ProductGroundWorksBlock — renders the A-SAFE GroundWorks PDF's per-product
 * installation prerequisites for a single product, sourced from
 * `products.ground_works_data` (jsonb). Appears on the product detail
 * surface below the Product Suitability spec-sheet.
 *
 * Null-tolerant: products without a PDF entry (e.g. RackGuard, Alarm Bar,
 * Sign Cap) render nothing at all so the detail layout stays stable.
 *
 * Data shape (matches scripts/data/product-groundworks.json entries, with
 * `_globalRules` / `_sourceDoc` appended at ingest time):
 *   basePlateType               — "standard-180-base" | "standard-230-base-15mm" | ...
 *   minSlabThicknessMm          — number | null
 *   concreteGrade               — "C35 or C28/35"
 *   concreteStandard            — "BS 8500-1 / BS EN 206-1"
 *   postDiameterMm              — number | null
 *   basePlateDimensionsMm       — "180 x 180" | null
 *   anchorSpec                  — "12mm fixing bolts"
 *   anchorDiameterMm            — number | null
 *   anchorDepthMm               — number | null
 *   edgeDistanceMm              — number | null
 *   concretePadLengthMm         — number | null
 *   concretePadLengthNote       — string | null  (when length is variable)
 *   concretePadWidthMm          — number | null
 *   concretePadDepthMm          — number | null
 *   hardcoreDepthMm             — number | null
 *   slabRebarSpec               — string | null
 *   substrateNotes              — string | null
 *   curingDays                  — number | null
 *   sourcePage                  — number (1-16)
 *   _globalRules                — global-PDF rules payload (fallback values)
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  HardHat,
  Ruler,
  Anchor as AnchorIcon,
  AlertTriangle,
  Layers,
  Hammer,
  FileText,
  Clock,
} from "lucide-react";

type GroundWorksEntry = {
  productFamily?: string;
  basePlateType?: string;
  minSlabThicknessMm?: number | null;
  concreteGrade?: string | null;
  concreteStandard?: string | null;
  postDiameterMm?: number | null;
  basePlateDimensionsMm?: string | null;
  anchorSpec?: string | null;
  anchorDiameterMm?: number | null;
  anchorDepthMm?: number | null;
  edgeDistanceMm?: number | null;
  concretePadLengthMm?: number | null;
  concretePadLengthNote?: string | null;
  concretePadWidthMm?: number | null;
  concretePadDepthMm?: number | null;
  hardcoreDepthMm?: number | null;
  slabRebarSpec?: string | null;
  substrateNotes?: string | null;
  curingDays?: number | null;
  sourcePage?: number | null;
  rawText?: string | null;
  _globalRules?: {
    concreteGrade?: string;
    minContinuousSlabThicknessMm?: number;
    hardcoreBaseMinMm?: number;
    curingDays?: number;
    unsuitableSubstrates?: string[];
    shallowSlabNote?: string;
  } | null;
  _sourceDoc?: string | null;
};

function mm(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n} mm`;
}

function padDimensions(data: GroundWorksEntry): string {
  const len =
    data.concretePadLengthMm != null
      ? `${data.concretePadLengthMm}`
      : data.concretePadLengthNote || "—";
  const w = data.concretePadWidthMm != null ? `${data.concretePadWidthMm}` : "—";
  const d = data.concretePadDepthMm != null ? `${data.concretePadDepthMm}` : "—";
  return `${len} × ${w} × ${d} mm`;
}

interface Props {
  data?: GroundWorksEntry | null;
  productName?: string;
}

export function ProductGroundWorksBlock({ data, productName }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Null-safe: products without a PDF entry render nothing.
  if (!data || !data.productFamily) return null;

  const slabThickness = data.minSlabThicknessMm ?? data._globalRules?.minContinuousSlabThicknessMm ?? null;
  const grade = data.concreteGrade ?? data._globalRules?.concreteGrade ?? null;
  const curingDays = data.curingDays ?? data._globalRules?.curingDays ?? null;
  const hardcore = data.hardcoreDepthMm ?? data._globalRules?.hardcoreBaseMinMm ?? null;

  return (
    <Card className="border-amber-200 dark:border-amber-900" data-testid="product-ground-works-block">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <HardHat className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            Ground Works &amp; Installation Prerequisites
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            className="h-8"
            data-testid="button-toggle-ground-works"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Full details
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Source: A-SAFE Ground Works Guide (PRH-1005-A-SAFE). All details to be
          approved by the project engineer prior to commencement of works.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Compact headline grid — always visible */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <HeadlineStat
            icon={<Layers className="h-4 w-4" />}
            label="Min slab thickness"
            value={mm(slabThickness)}
          />
          <HeadlineStat
            icon={<Hammer className="h-4 w-4" />}
            label="Concrete grade"
            value={grade || "—"}
          />
          <HeadlineStat
            icon={<AnchorIcon className="h-4 w-4" />}
            label="Anchor"
            value={data.anchorSpec || "—"}
          />
          <HeadlineStat
            icon={<Ruler className="h-4 w-4" />}
            label="Edge distance"
            value={mm(data.edgeDistanceMm)}
          />
        </div>

        {/* Substrate warning — surfaces the "not tarmac / block paving" rule
            prominently since it's the most common install-blocker. */}
        {data._globalRules?.unsuitableSubstrates &&
        data._globalRules.unsuitableSubstrates.length > 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-medium text-red-900 dark:text-red-200">
                Unsuitable substrates
              </div>
              <div className="text-red-800 dark:text-red-300">
                Not recommended on:{" "}
                {data._globalRules.unsuitableSubstrates.join(", ")}.{" "}
                {data._globalRules.shallowSlabNote}
              </div>
            </div>
          </div>
        ) : null}

        {/* Expandable detail section */}
        {expanded ? (
          <div className="space-y-4 pt-2 border-t">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <DetailRow
                label="Base plate type"
                value={
                  data.basePlateType
                    ? data.basePlateType
                        .split("-")
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(" ")
                    : "—"
                }
              />
              <DetailRow
                label="Post diameter"
                value={mm(data.postDiameterMm)}
              />
              <DetailRow
                label="Base plate dimensions"
                value={data.basePlateDimensionsMm || "—"}
              />
              <DetailRow
                label="Anchor diameter"
                value={mm(data.anchorDiameterMm)}
              />
              <DetailRow
                label="Anchor / embed depth"
                value={mm(data.anchorDepthMm)}
              />
              <DetailRow
                label="Concrete standard"
                value={data.concreteStandard || "—"}
              />
              <DetailRow
                label="Concrete pad (L × W × D)"
                value={padDimensions(data)}
              />
              <DetailRow
                label="Hardcore base depth"
                value={mm(hardcore)}
              />
              {data.slabRebarSpec ? (
                <DetailRow label="Slab rebar" value={data.slabRebarSpec} />
              ) : null}
              {curingDays != null ? (
                <DetailRow
                  label="Concrete cure time"
                  value={`${curingDays} days (min)`}
                />
              ) : null}
              {data.sourcePage ? (
                <DetailRow
                  label="Source page"
                  value={`Page ${data.sourcePage} (PRH-1005)`}
                />
              ) : null}
            </div>

            {data.substrateNotes ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium text-amber-900 dark:text-amber-200">
                      Substrate notes
                    </div>
                    <div className="text-amber-800 dark:text-amber-300">
                      {data.substrateNotes}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Generic install method (from page 5 of the PDF) */}
            <div className="rounded-md border border-slate-200 dark:border-slate-800 p-3 text-sm space-y-1">
              <div className="flex items-center gap-2 font-medium">
                <Clock className="h-4 w-4" />
                Install method (typical — confirm with engineer)
              </div>
              <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground text-xs pl-1">
                <li>Measure base centres and excavate to specified depth.</li>
                <li>Remove all loose material to provide a solid base.</li>
                <li>Fill with min 75 mm hardcore and compact.</li>
                <li>Pour specified concrete and vibrate with a poker.</li>
                <li>Finish concrete to the required level.</li>
                <li>
                  Cure{" "}
                  {curingDays != null ? `for at least ${curingDays} days` : "fully"}{" "}
                  before fixing the barrier.
                </li>
              </ol>
            </div>

            {data.rawText ? (
              <div className="text-xs text-muted-foreground italic">
                Source extract: {data.rawText}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function HeadlineStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b last:border-b-0 pb-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

export default ProductGroundWorksBlock;
