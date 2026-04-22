/**
 * ProductSuitabilityBlock — renders the A-SAFE Product Suitability PDF's
 * spec-sheet layout for a single product, sourced from
 * `products.suitability_data` (jsonb). Appears on the product detail surface
 * below the existing pricing / description blocks.
 *
 * Reads from `product.suitabilityData` with null-tolerance: 46 of ~82 DB rows
 * carry the payload (per the ζ ingestion report); the rest render a small
 * "Technical data not yet available" placeholder rather than nothing, so the
 * detail layout stays stable.
 *
 * Data shape (matches scripts/data/product-suitability.json entries):
 *   environment: { internal, external }
 *   atexSuitability: { suitable, note }
 *   standardBaseAndFixing: { boltSize, baseMaterial, fixingType }
 *   vehicleSuitability: string[]          — canonical PDF labels
 *   fitForPurposeApplications: string[]
 *   impactZone: { minMm, maxMm, note } | null
 *   impactZoneNote?: string               — when impactZone is null
 *   materialProperties: { temperatureRange, ignitionTemperature, flashPoint,
 *                         toxicity, chemicalResistance, weatheringStability,
 *                         lightStability, staticRating, hygieneSeals }
 *   fireInformation: string               — paragraph
 *   environmentalInformation: string      — paragraph
 *   recyclingInformation: { packaging, postAndRails, fixings, bases }
 *
 * Vehicle silhouettes: reuses `/assets/vehicles/<slug>.v4.svg` via the
 * PDF-label-to-DB-slug reverse map below. Labels without a matching v4
 * silhouette (e.g. "Airport Luggage Vehicle", "Charlotte Baggage Truck",
 * "Frame Rail Container", "ULD Can", and the catch-all meta labels) render
 * as label-only Badge chips.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2,
  TreePine,
  Flame,
  ShieldCheck,
  ShieldX,
  Wrench,
  Truck,
  Target,
  Leaf,
  Recycle,
  Ruler,
  CheckCircle2,
  XCircle,
} from "lucide-react";

// PDF canonical vehicle-suitability label → v4 silhouette slug (the public
// asset lives at `/assets/vehicles/<slug>.v4.svg`). When a PDF label maps
// to multiple silhouettes conceptually, we pick the visually closest match.
// Labels not listed here fall back to label-only Badge chips.
const PDF_LABEL_TO_SILHOUETTE: Record<string, string> = {
  "Pedestrians": "pedestrians",
  "Driver Visual Safety": "pedestrians",
  "Manual Pallet Truck": "manual-pallet-truck",
  "Electric Pedestrian Truck": "electric-pallet-truck",
  "Electric Pedestrian Stacker": "walkie-stacker",
  "Horizontal Order Picker": "low-level-order-picker",
  "High Rack Stacker": "high-level-order-picker",
  "Lightweight Counterbalance FLT": "counterbalance-forklift-2-5t",
  "Heavy Duty Counterbalance Truck": "counterbalance-forklift-5t",
  "Engine Counterbalance Heavy Duty Forklift Truck": "heavy-duty-forklift-10t",
  "Electric Reach Truck": "reach-truck",
  "VNA": "very-narrow-aisle-vna-truck",
  "Electric Tow Tractor": "tow-tractor-tugger",
  "Push Back Truck": "tow-tractor-tugger",
  "Small Lorry": "hgv-rigid-truck-7-5t",
  "Heavy Goods Lorry": "hgv-articulated-truck-40t",
  "Small Van": "delivery-van-light-commercial",
  "Mini Van": "delivery-van-light-commercial",
  "Car": "delivery-van-light-commercial",
  "Coach": "hgv-rigid-truck-7-5t",
};

type SuitabilityData = {
  environment?: { internal?: boolean; external?: boolean } | null;
  atexSuitability?: { suitable?: boolean; note?: string } | null;
  standardBaseAndFixing?: {
    boltSize?: string;
    baseMaterial?: string;
    fixingType?: string;
  } | null;
  vehicleSuitability?: string[];
  fitForPurposeApplications?: string[];
  impactZone?: { minMm?: number; maxMm?: number; note?: string } | null;
  impactZoneNote?: string;
  materialProperties?: {
    temperatureRange?: string;
    ignitionTemperature?: string;
    flashPoint?: string;
    toxicity?: string;
    chemicalResistance?: string;
    weatheringStability?: string;
    lightStability?: string;
    staticRating?: string;
    hygieneSeals?: boolean;
  } | null;
  fireInformation?: string;
  environmentalInformation?: string;
  recyclingInformation?: {
    packaging?: string;
    postAndRails?: string;
    fixings?: string;
    bases?: string;
  } | null;
};

export interface ProductSuitabilityBlockProps {
  /** The product row's `suitability_data` jsonb payload. May be null. */
  data: SuitabilityData | null | undefined;
  /** Optional — shown as the card title suffix. */
  productName?: string;
  className?: string;
}

export function ProductSuitabilityBlock({
  data,
  productName,
  className,
}: ProductSuitabilityBlockProps) {
  if (!data) {
    return (
      <Card className={className} data-testid="product-suitability-block-empty">
        <CardHeader>
          <CardTitle className="text-base">Technical Suitability</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Technical suitability data not yet available for this product.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className} data-testid="product-suitability-block">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Product Suitability</span>
          <span className="text-xs font-normal text-gray-500">
            {productName ? `Spec sheet — ${productName}` : "Spec sheet"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Top row: Environment + ATEX + Base/Fixing */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <EnvironmentPanel env={data.environment} />
          <AtexPanel atex={data.atexSuitability} />
          <BaseFixingPanel base={data.standardBaseAndFixing} />
        </div>

        <Separator />

        {/* Vehicle Suitability */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Truck className="w-4 h-4" /> Vehicle Suitability
          </h4>
          <VehicleSuitabilityRow labels={data.vehicleSuitability ?? []} />
        </div>

        {/* Fit for Purpose */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Target className="w-4 h-4" /> Fit-for-Purpose Applications
          </h4>
          <div className="flex flex-wrap gap-2">
            {(data.fitForPurposeApplications ?? []).length === 0 ? (
              <span className="text-xs text-gray-400">—</span>
            ) : (
              (data.fitForPurposeApplications ?? []).map((app) => (
                <Badge
                  key={app}
                  variant="outline"
                  className="text-xs border-yellow-400 bg-yellow-50 text-black"
                  data-testid={`fit-for-purpose-${app}`}
                >
                  {app}
                </Badge>
              ))
            )}
          </div>
        </div>

        {/* Impact Zone */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Ruler className="w-4 h-4" /> Impact Zone
          </h4>
          {data.impactZone?.minMm != null && data.impactZone?.maxMm != null ? (
            <p className="text-sm">
              <span className="font-semibold">
                {data.impactZone.minMm} – {data.impactZone.maxMm} mm
              </span>
              {data.impactZone.note && (
                <span className="text-gray-500 text-xs ml-2">
                  ({data.impactZone.note})
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              {data.impactZoneNote || "Not an impact product."}
            </p>
          )}
        </div>

        <Separator />

        {/* Material Properties */}
        {data.materialProperties && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Material Properties</h4>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/2">Property</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <MaterialRow
                    label="Temperature range"
                    value={data.materialProperties.temperatureRange}
                  />
                  <MaterialRow
                    label="Ignition temperature"
                    value={data.materialProperties.ignitionTemperature}
                  />
                  <MaterialRow
                    label="Flash point"
                    value={data.materialProperties.flashPoint}
                  />
                  <MaterialRow
                    label="Toxicity"
                    value={data.materialProperties.toxicity}
                  />
                  <MaterialRow
                    label="Chemical resistance"
                    value={data.materialProperties.chemicalResistance}
                  />
                  <MaterialRow
                    label="Weathering stability"
                    value={data.materialProperties.weatheringStability}
                  />
                  <MaterialRow
                    label="Light stability"
                    value={data.materialProperties.lightStability}
                  />
                  <MaterialRow
                    label="Static rating"
                    value={data.materialProperties.staticRating}
                  />
                  <MaterialRow
                    label="Hygiene seals"
                    value={
                      data.materialProperties.hygieneSeals === true
                        ? "Yes"
                        : data.materialProperties.hygieneSeals === false
                          ? "No"
                          : undefined
                    }
                  />
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Fire + Environmental paragraphs */}
        {(data.fireInformation || data.environmentalInformation) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.fireInformation && (
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Flame className="w-4 h-4" /> Fire Information
                </h4>
                <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">
                  {data.fireInformation}
                </p>
              </div>
            )}
            {data.environmentalInformation && (
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Leaf className="w-4 h-4" /> Environmental Information
                </h4>
                <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed">
                  {data.environmentalInformation}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Recycling */}
        {data.recyclingInformation && (
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Recycle className="w-4 h-4" /> Recycling Information
            </h4>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead>Recycling Code / Material</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <MaterialRow
                    label="Packaging"
                    value={data.recyclingInformation.packaging}
                  />
                  <MaterialRow
                    label="Posts & rails"
                    value={data.recyclingInformation.postAndRails}
                  />
                  <MaterialRow
                    label="Fixings"
                    value={data.recyclingInformation.fixings}
                  />
                  <MaterialRow
                    label="Bases"
                    value={data.recyclingInformation.bases}
                  />
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EnvironmentPanel({
  env,
}: {
  env: SuitabilityData["environment"];
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
        Environment
      </p>
      <div className="flex items-center gap-3">
        <div
          className={`flex items-center gap-1 text-sm ${env?.internal ? "text-green-700" : "text-gray-400"}`}
          data-testid="env-internal"
        >
          <Building2 className="w-4 h-4" /> Internal
          {env?.internal ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <XCircle className="w-3.5 h-3.5" />
          )}
        </div>
        <div
          className={`flex items-center gap-1 text-sm ${env?.external ? "text-green-700" : "text-gray-400"}`}
          data-testid="env-external"
        >
          <TreePine className="w-4 h-4" /> External
          {env?.external ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <XCircle className="w-3.5 h-3.5" />
          )}
        </div>
      </div>
    </div>
  );
}

function AtexPanel({
  atex,
}: {
  atex: SuitabilityData["atexSuitability"];
}) {
  const suitable = atex?.suitable === true;
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">ATEX</p>
      <div
        className={`flex items-center gap-2 text-sm ${suitable ? "text-green-700" : "text-gray-700"}`}
      >
        {suitable ? (
          <ShieldCheck className="w-4 h-4" />
        ) : (
          <ShieldX className="w-4 h-4 text-gray-400" />
        )}
        <span className="font-semibold">
          {suitable ? "Suitable" : "Not suitable"}
        </span>
      </div>
      {atex?.note && (
        <p className="text-xs text-gray-500 mt-1">{atex.note}</p>
      )}
    </div>
  );
}

function BaseFixingPanel({
  base,
}: {
  base: SuitabilityData["standardBaseAndFixing"];
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1">
        <Wrench className="w-3.5 h-3.5" /> Standard Base & Fixing
      </p>
      <dl className="text-xs space-y-1">
        <Pair label="Bolt" value={base?.boltSize} />
        <Pair label="Base material" value={base?.baseMaterial} />
        <Pair label="Fixing" value={base?.fixingType} />
      </dl>
    </div>
  );
}

function Pair({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="text-gray-500 min-w-[90px]">{label}:</dt>
      <dd className="font-medium text-gray-800 dark:text-gray-200">{value}</dd>
    </div>
  );
}

function MaterialRow({ label, value }: { label: string; value?: string }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <TableRow>
      <TableCell className="text-sm">{label}</TableCell>
      <TableCell className="text-sm font-medium">{value}</TableCell>
    </TableRow>
  );
}

/**
 * Vehicle suitability labels rendered as silhouettes where a v4 SVG exists,
 * otherwise as label-only chips. Uses `/assets/vehicles/<slug>.v4.svg` from
 * the η agent's vehicle-icon drop.
 */
function VehicleSuitabilityRow({ labels }: { labels: string[] }) {
  if (labels.length === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-3 items-start">
      {labels.map((label) => {
        const slug = PDF_LABEL_TO_SILHOUETTE[label];
        if (slug) {
          return (
            <div
              key={label}
              className="flex flex-col items-center gap-1 w-20"
              data-testid={`vehicle-suit-${label}`}
            >
              <div className="h-12 w-16 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded border">
                <img
                  src={`/assets/vehicles/${slug}.v4.svg`}
                  alt={label}
                  className="h-full w-full object-contain p-1"
                  loading="lazy"
                  onError={(e) => {
                    // Graceful fallback: hide image, show label chip behaviour.
                    (e.currentTarget as HTMLImageElement).style.display =
                      "none";
                  }}
                />
              </div>
              <span className="text-[10px] text-gray-600 dark:text-gray-400 text-center leading-tight">
                {label}
              </span>
            </div>
          );
        }
        return (
          <Badge
            key={label}
            variant="outline"
            className="text-xs"
            data-testid={`vehicle-suit-${label}`}
          >
            {label}
          </Badge>
        );
      })}
    </div>
  );
}

export default ProductSuitabilityBlock;
