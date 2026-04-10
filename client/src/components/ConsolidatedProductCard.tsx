import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, Star, ArrowRight, Package, ChevronDown } from "lucide-react";
import { Link } from "wouter";

interface ProductVariant {
  id: string;
  name: string;
  description: string;
  impactRating?: number;
  price?: number;
}

interface ConsolidatedProductCardProps {
  baseProductName: string;
  product: ProductVariant;
  variants?: ProductVariant[];
  score: number;
  matchingReasons?: string[];
  impactRange?: {
    min: number;
    max: number;
  };
  index: number;
}

export function ConsolidatedProductCard({
  baseProductName,
  product,
  variants,
  score,
  matchingReasons,
  impactRange,
  index
}: ConsolidatedProductCardProps) {
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant>(product);
  const [showVariants, setShowVariants] = useState(false);

  const handleVariantChange = (variantId: string) => {
    const variant = variants?.find(v => v.id === variantId);
    if (variant) {
      setSelectedVariant(variant);
    }
  };

  const extractVariantDetail = (fullName: string) => {
    // Extract size or variant detail from full product name
    const match = fullName.match(/[-–]\s*(.+)$/);
    return match ? match[1] : fullName;
  };

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{baseProductName}</CardTitle>
            
            {/* Variants indicator and selector */}
            {variants && variants.length > 1 && (
              <div className="mt-2 space-y-2">
                <Badge 
                  variant="outline" 
                  className="text-xs cursor-pointer"
                  onClick={() => setShowVariants(!showVariants)}
                >
                  <Package className="h-3 w-3 mr-1" />
                  {variants.length} variants available
                  <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${showVariants ? 'rotate-180' : ''}`} />
                </Badge>
                
                {showVariants && (
                  <Select value={selectedVariant.id} onValueChange={handleVariantChange}>
                    <SelectTrigger className="w-full text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {variants.map(variant => (
                        <SelectItem key={variant.id} value={variant.id}>
                          <div className="flex justify-between items-center w-full">
                            <span>{extractVariantDetail(variant.name)}</span>
                            {variant.impactRating && (
                              <span className="text-xs text-gray-500 ml-2">
                                {variant.impactRating.toLocaleString()} J
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            
            <div className="flex items-center mt-2">
              <Star className="h-4 w-4 text-primary mr-1" />
              <span className="font-medium text-sm">Score: {score}</span>
            </div>
          </div>
          <Badge variant="secondary">{index + 1}</Badge>
        </div>
      </CardHeader>
      
      <CardContent>
        <p className="text-sm text-gray-600 mb-4 line-clamp-3">
          {selectedVariant.description}
        </p>
        
        {matchingReasons && matchingReasons.length > 0 && (
          <div className="mb-4">
            <h5 className="font-medium text-sm mb-2">Why this matches:</h5>
            <ul className="space-y-1">
              {matchingReasons.map((reason: string, idx: number) => (
                <li key={idx} className="flex items-center text-xs">
                  <CheckCircle className="h-3 w-3 text-green-500 mr-2 flex-shrink-0" />
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Selected variant details */}
        {showVariants && variants && variants.length > 1 && (
          <div className="p-2 bg-gray-50 rounded-md mb-3">
            <p className="text-xs font-medium text-gray-700">Selected variant:</p>
            <p className="text-xs text-gray-600">{extractVariantDetail(selectedVariant.name)}</p>
          </div>
        )}

        {/* Impact rating display */}
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm">
            <span className="font-medium">Impact: </span>
            {impactRange && impactRange.min !== impactRange.max && !showVariants ? (
              <span className="text-primary font-bold">
                {impactRange.min.toLocaleString()} - {impactRange.max.toLocaleString()} J
              </span>
            ) : (
              <span className="text-primary font-bold">
                {selectedVariant.impactRating?.toLocaleString() || 'N/A'} J
              </span>
            )}
          </div>
          <Link href={`/products/${selectedVariant.id}`}>
            <Button size="sm" variant="outline" data-testid={`button-view-product-${selectedVariant.id}`}>
              View Details
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}