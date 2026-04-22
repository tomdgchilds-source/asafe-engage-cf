/**
 * ProductMaintenanceBlock — renders the A-SAFE Product Maintenance PDF's
 * inspection / cleaning / damage-assessment / warranty / spares guidance for
 * a single product, sourced from `products.maintenance_data` (jsonb).
 *
 * Appears on the product detail surface as a compact accordion below the
 * ProductSuitabilityBlock. Null-safe: when the column is empty (product
 * didn't match any family in /api/admin/ingest-maintenance-data) the
 * component renders nothing, keeping the detail layout stable for products
 * outside the barrier/bollard/rack/gate taxonomy (e.g. Traffic Gate
 * Accessories, Height Restrictors).
 *
 * Data shape (matches the merged payload in
 * worker/index.ts :: /api/admin/ingest-maintenance-data):
 *   inspectionFrequency: "monthly" | "quarterly" | "annual" | null
 *   inspectionNotes: string | null
 *   cleaningInstructions: string | null
 *   damageAssessment: string[]
 *   warrantyConditions: string | null
 *   recommendedSpares: string[]
 *   appliedFrom?: string        — which family the merged payload came from
 *   sourceDocRef?: string       — "PRH1001ASAFE260220242"
 *   sourceDocTitle?: string     — "Product Maintenance"
 */
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CalendarCheck,
  Droplets,
  AlertTriangle,
  ShieldCheck,
  Wrench,
} from "lucide-react";

type MaintenanceData = {
  inspectionFrequency?: string | null;
  inspectionNotes?: string | null;
  cleaningInstructions?: string | null;
  damageAssessment?: string[];
  warrantyConditions?: string | null;
  recommendedSpares?: string[];
  appliedFrom?: string;
  sourceDocRef?: string;
  sourceDocTitle?: string;
};

export interface ProductMaintenanceBlockProps {
  /** The product row's `maintenance_data` jsonb payload. May be null. */
  data: MaintenanceData | null | undefined;
  /** Optional — shown as the card title suffix. */
  productName?: string;
  className?: string;
}

/**
 * Title-cases an inspection-frequency string for a small badge. Keeps any
 * non-standard values (e.g. "every 12 months") rendering cleanly as-is.
 */
function formatFrequency(freq: string | null | undefined): string | null {
  if (!freq) return null;
  const trimmed = freq.trim();
  if (!trimmed) return null;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function ProductMaintenanceBlock({
  data,
  productName,
  className,
}: ProductMaintenanceBlockProps) {
  // Null-safe: render nothing when the column is empty. This is the "stay
  // stable" contract — the block never shows an empty-state card, so
  // products outside the maintenance PDF's scope don't get a noisy
  // placeholder.
  if (!data) return null;

  const hasAnyContent =
    data.inspectionFrequency ||
    data.inspectionNotes ||
    data.cleaningInstructions ||
    (data.damageAssessment && data.damageAssessment.length > 0) ||
    data.warrantyConditions ||
    (data.recommendedSpares && data.recommendedSpares.length > 0);

  if (!hasAnyContent) return null;

  const frequencyLabel = formatFrequency(data.inspectionFrequency);

  return (
    <Card className={className} data-testid="product-maintenance-block">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            Maintenance
            {frequencyLabel && (
              <Badge
                className="bg-yellow-400 text-black text-xs ml-2"
                data-testid="maintenance-frequency-badge"
              >
                Inspection: {frequencyLabel}
              </Badge>
            )}
          </span>
          <span className="text-xs font-normal text-gray-500">
            {productName
              ? `${productName} — PRH-1001`
              : "Maintenance guide — PRH-1001"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion
          type="single"
          collapsible
          defaultValue="inspection"
          className="w-full"
        >
          {data.inspectionNotes && (
            <AccordionItem value="inspection">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4" /> Inspection
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {data.inspectionNotes}
              </AccordionContent>
            </AccordionItem>
          )}

          {data.cleaningInstructions && (
            <AccordionItem value="cleaning">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2">
                  <Droplets className="w-4 h-4" /> Cleaning Instructions
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">
                {data.cleaningInstructions}
              </AccordionContent>
            </AccordionItem>
          )}

          {data.damageAssessment && data.damageAssessment.length > 0 && (
            <AccordionItem value="damage">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Damage Assessment
                  <Badge variant="secondary" className="text-xs ml-1">
                    {data.damageAssessment.length}
                  </Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="list-disc pl-5 space-y-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  {data.damageAssessment.map((item, idx) => (
                    <li
                      key={idx}
                      data-testid={`maintenance-damage-item-${idx}`}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          )}

          {data.warrantyConditions && (
            <AccordionItem value="warranty">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" /> Warranty Conditions
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {data.warrantyConditions}
              </AccordionContent>
            </AccordionItem>
          )}

          {data.recommendedSpares && data.recommendedSpares.length > 0 && (
            <AccordionItem value="spares">
              <AccordionTrigger className="text-sm">
                <span className="flex items-center gap-2">
                  <Wrench className="w-4 h-4" /> Recommended Spares
                  <Badge variant="secondary" className="text-xs ml-1">
                    {data.recommendedSpares.length}
                  </Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">
                  {data.recommendedSpares.map((item, idx) => (
                    <li
                      key={idx}
                      data-testid={`maintenance-spare-item-${idx}`}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>

        {data.appliedFrom && (
          <p className="mt-3 text-[10px] text-gray-400">
            Guidance from A-SAFE {data.sourceDocTitle || "Product Maintenance"}{" "}
            ({data.sourceDocRef || "PRH-1001"}) — applied via{" "}
            <span className="font-medium">{data.appliedFrom}</span>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default ProductMaintenanceBlock;
