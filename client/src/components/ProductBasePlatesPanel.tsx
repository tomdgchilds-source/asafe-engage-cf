/**
 * ProductBasePlatesPanel — renders the "Available Base Plates" card on the
 * product detail surface. One row per plate compatible with the product,
 * sourced from GET /api/products/:id/base-plates (joined through
 * base_plate_product_compatibility to base_plates).
 *
 * Fetches lazily via react-query on mount; if the product has no compatible
 * plates (rack accessories, add-ons, small components) the whole card returns
 * null so the detail layout stays clean.
 *
 * Data shape (see worker/routes/basePlates.ts):
 *   { id, code, name, description, boltSize, boltLengthMm,
 *     plateDimensionsMm, coating, fixingType, substrateNotes,
 *     isStandardStock, sortOrder }
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Anchor, CheckCircle2, Clock, Info } from "lucide-react";

export interface BasePlate {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  boltSize?: string | null;
  boltLengthMm?: number | null;
  plateDimensionsMm?: string | null;
  coating?: string | null;
  fixingType?: string | null;
  substrateNotes?: string | null;
  isStandardStock?: boolean | null;
  sortOrder?: number | null;
}

interface ProductBasePlatesPanelProps {
  productId: string;
  productName: string;
}

async function fetchProductBasePlates(productId: string): Promise<BasePlate[]> {
  const res = await fetch(`/api/products/${productId}/base-plates`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Failed to load base plates: ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? (data as BasePlate[]) : [];
}

export function ProductBasePlatesPanel({
  productId,
  productName,
}: ProductBasePlatesPanelProps) {
  const { data: plates = [], isLoading } = useQuery({
    queryKey: ["base-plates", productId],
    queryFn: () => fetchProductBasePlates(productId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return null; // quiet while the fetch resolves — don't flash an empty panel
  }
  if (!plates || plates.length === 0) {
    return null;
  }

  return (
    <Card data-testid="product-base-plates-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Anchor className="h-5 w-5 text-yellow-600" />
          Available Base Plates
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Compatible base-plate options for {productName}. The standard
          zinc-nickel electrophoretic plate ships without additional lead time;
          other finishes are available on request.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {plates.map((plate, idx) => (
          <div key={plate.id}>
            {idx > 0 && <Separator className="mb-3" />}
            <div
              className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
              data-testid={`base-plate-row-${plate.code}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{plate.name}</span>
                  <Badge variant="outline" className="text-[11px] font-mono">
                    {plate.code}
                  </Badge>
                  {plate.isStandardStock ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[11px] gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      In stock
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[11px] gap-1 text-muted-foreground"
                    >
                      <Clock className="h-3 w-3" />
                      On request
                    </Badge>
                  )}
                </div>
                {plate.description && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {plate.description}
                  </p>
                )}
                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  {plate.fixingType && (
                    <div className="flex gap-1">
                      <dt className="font-medium">Fixing:</dt>
                      <dd>{plate.fixingType}</dd>
                    </div>
                  )}
                  {plate.boltSize && (
                    <div className="flex gap-1">
                      <dt className="font-medium">Bolt:</dt>
                      <dd>{plate.boltSize}</dd>
                    </div>
                  )}
                  {plate.plateDimensionsMm && (
                    <div className="flex gap-1">
                      <dt className="font-medium">Plate:</dt>
                      <dd>{plate.plateDimensionsMm}</dd>
                    </div>
                  )}
                  {plate.coating && (
                    <div className="flex gap-1">
                      <dt className="font-medium">Coating:</dt>
                      <dd>{plate.coating}</dd>
                    </div>
                  )}
                </dl>
                {plate.substrateNotes && (
                  <div className="mt-1 flex items-start gap-1 text-[11px] text-muted-foreground">
                    <Info className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{plate.substrateNotes}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default ProductBasePlatesPanel;
