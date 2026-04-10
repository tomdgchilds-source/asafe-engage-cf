import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Calculator } from 'lucide-react';

interface ProductVariation {
  measurement: string;
  price: number;
}

interface DynamicPriceCalculatorProps {
  product: {
    name: string;
    specifications?: {
      measurementType?: string;
      measurementUnit?: string;
      priceCalculation?: string;
      variations?: ProductVariation[];
    };
    currency?: string;
  };
  onPriceChange?: (price: number, measurement: string) => void;
}

export function DynamicPriceCalculator({ product, onPriceChange }: DynamicPriceCalculatorProps) {
  const [selectedMeasurement, setSelectedMeasurement] = useState<string>('');
  const [customQuantity, setCustomQuantity] = useState<number>(1);
  const [calculatedPrice, setCalculatedPrice] = useState<number>(0);
  const { formatPrice } = useCurrency();

  const specifications = product.specifications;
  if (!specifications?.variations || specifications.variations.length === 0) {
    return null;
  }

  const handleMeasurementChange = (measurement: string) => {
    if (!measurement) return; // Prevent undefined measurement processing
    setSelectedMeasurement(measurement);
    const variation = specifications.variations?.find(v => v.measurement === measurement);
    if (variation && typeof variation.price === 'number') {
      const totalPrice = variation.price * customQuantity;
      setCalculatedPrice(totalPrice);
      onPriceChange?.(totalPrice, measurement);
    }
  };

  const handleQuantityChange = (quantity: number) => {
    if (quantity > 0) {
      setCustomQuantity(quantity);
      if (selectedMeasurement) {
        const variation = specifications.variations?.find(v => v.measurement === selectedMeasurement);
        if (variation) {
          const totalPrice = variation.price * quantity;
          setCalculatedPrice(totalPrice);
          onPriceChange?.(totalPrice, selectedMeasurement);
        }
      }
    }
  };

  return (
    <Card className="mt-4 bg-yellow-50 border-yellow-200">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Calculator className="h-4 w-4 text-yellow-600" />
          <Label className="font-semibold text-yellow-800">Size & Price Calculator</Label>
        </div>
        
        <div className="space-y-3">
          {/* Size Selection */}
          <div>
            <Label className="text-sm font-medium mb-1 block">
              Select {specifications.measurementType} ({specifications.measurementUnit})
            </Label>
            <Select value={selectedMeasurement} onValueChange={handleMeasurementChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={`Choose ${specifications.measurementType}...`} />
              </SelectTrigger>
              <SelectContent>
                {specifications.variations
                  .filter(variation => variation?.measurement) // Filter out invalid variations
                  .map((variation, index) => (
                    <SelectItem 
                      key={`${variation.measurement}-${index}`} 
                      value={variation.measurement || `variation-${index}`}
                    >
                      <div className="flex justify-between items-center w-full">
                        <span>{variation.measurement || 'Unknown Size'}</span>
                        <Badge variant="outline" className="ml-2">
                          {formatPrice(variation.price || 0)}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity Input */}
          <div>
            <Label htmlFor="quantity" className="text-sm font-medium mb-1 block">
              Quantity
            </Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              value={customQuantity}
              onChange={(e) => handleQuantityChange(parseInt(e.target.value) || 1)}
              className="w-full"
              placeholder="Enter quantity"
            />
          </div>

          {/* Price Display */}
          {selectedMeasurement && calculatedPrice > 0 && (
            <div className="pt-2 border-t border-yellow-200">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total Price:</span>
                <span className="text-lg font-bold text-yellow-600">
                  {formatPrice(calculatedPrice)}
                </span>
              </div>
              <div className="text-xs text-gray-600 mt-1">
                {selectedMeasurement} × {customQuantity} {customQuantity > 1 ? 'units' : 'unit'}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}