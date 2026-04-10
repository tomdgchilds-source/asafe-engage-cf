import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calculator, Package, Info, AlertCircle } from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";

interface KerbLength {
  length: number; // in mm
  name: string;
  basePrice: number; // price per item in AED for tier 1
}

interface OptimalCombination {
  lengths: { length: KerbLength; quantity: number }[];
  totalLength: number;
  waste: number;
  totalPrice: number;
  tierPricing: {
    tier: string;
    pricePerUnit: number;
  };
}

interface ForkGuardKerbCalculatorProps {
  onCalculate: (combination: OptimalCombination) => void;
  onAddToCart?: (items: { productName: string; quantity: number; unitPrice: number }[]) => void;
}

export function ForkGuardKerbCalculator({ onCalculate, onAddToCart }: ForkGuardKerbCalculatorProps) {
  const [requiredLength, setRequiredLength] = useState<string>("");
  const [optimalCombination, setOptimalCombination] = useState<OptimalCombination | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const { formatPrice } = useCurrency();

  // Available ForGuard Kerb lengths with tiered pricing
  const availableLengths: KerbLength[] = [
    { length: 1965, name: "ForkGuard Kerb – 1965 mm", basePrice: 525.17 },
    { length: 1865, name: "ForkGuard Kerb – 1865 mm", basePrice: 498.85 },
    { length: 1765, name: "ForkGuard Kerb – 1765 mm", basePrice: 472.53 },
    { length: 1665, name: "ForkGuard Kerb – 1665 mm", basePrice: 446.21 },
    { length: 1565, name: "ForkGuard Kerb – 1565 mm", basePrice: 419.89 },
    { length: 1465, name: "ForkGuard Kerb – 1465 mm", basePrice: 393.57 },
    { length: 1365, name: "ForkGuard Kerb – 1365 mm", basePrice: 367.25 },
  ];

  // Tiered pricing structure (quantity-based)
  const getTierPricing = (totalQuantity: number): { tier: string; multiplier: number } => {
    if (totalQuantity >= 50) {
      return { tier: "50+ items (30% discount)", multiplier: 0.70 };
    } else if (totalQuantity >= 20) {
      return { tier: "20-50 items (20% discount)", multiplier: 0.80 };
    } else if (totalQuantity >= 5) {
      return { tier: "5-20 items (10% discount)", multiplier: 0.90 };
    } else {
      return { tier: "1-5 items (Standard pricing)", multiplier: 1.00 };
    }
  };

  const calculateOptimalCombination = () => {
    const targetLength = parseFloat(requiredLength) * 1000; // Convert meters to mm
    
    if (!targetLength || targetLength <= 0) {
      setOptimalCombination(null);
      return;
    }

    // Dynamic programming approach to find optimal combination
    const dp: { [key: number]: { lengths: Map<number, number>; waste: number } } = {};
    dp[0] = { lengths: new Map(), waste: 0 };

    // For each possible total length up to target + max waste
    for (let currentLength = 0; currentLength <= targetLength + 500; currentLength++) {
      if (!dp[currentLength]) continue;

      // Try adding each available length
      for (const kerbLength of availableLengths) {
        const newLength = currentLength + kerbLength.length;
        
        if (newLength >= targetLength && newLength <= targetLength + 500) {
          // Check if this is a better solution
          const waste = newLength - targetLength;
          if (!dp[newLength] || dp[newLength].waste > waste) {
            const newLengths = new Map(dp[currentLength].lengths);
            newLengths.set(kerbLength.length, (newLengths.get(kerbLength.length) || 0) + 1);
            dp[newLength] = { lengths: newLengths, waste };
          }
        }
        
        // Continue building if under target
        if (newLength < targetLength) {
          const newLengths = new Map(dp[currentLength].lengths);
          newLengths.set(kerbLength.length, (newLengths.get(kerbLength.length) || 0) + 1);
          dp[newLength] = { lengths: newLengths, waste: 0 };
        }
      }
    }

    // Find the best solution (closest to target length)
    let bestSolution = null;
    let minWaste = Infinity;
    
    for (let length = targetLength; length <= targetLength + 500; length++) {
      if (dp[length] && dp[length].waste < minWaste) {
        minWaste = dp[length].waste;
        bestSolution = { totalLength: length, ...dp[length] };
      }
    }

    if (bestSolution) {
      // Convert to final format
      const lengths = [];
      let totalQuantity = 0;
      
      for (const [lengthValue, quantity] of bestSolution.lengths.entries()) {
        const kerbLength = availableLengths.find(l => l.length === lengthValue);
        if (kerbLength && quantity > 0) {
          lengths.push({ length: kerbLength, quantity });
          totalQuantity += quantity;
        }
      }

      // Sort by length (longest first)
      lengths.sort((a, b) => b.length.length - a.length.length);

      // Calculate pricing based on total quantity
      const tierInfo = getTierPricing(totalQuantity);
      const totalPrice = lengths.reduce((sum, item) => {
        return sum + (item.length.basePrice * tierInfo.multiplier * item.quantity);
      }, 0);

      const combination: OptimalCombination = {
        lengths,
        totalLength: bestSolution.totalLength,
        waste: bestSolution.waste,
        totalPrice,
        tierPricing: {
          tier: tierInfo.tier,
          pricePerUnit: tierInfo.multiplier,
        },
      };

      setOptimalCombination(combination);
      onCalculate(combination);
    } else {
      // Fallback: Use greedy algorithm if DP doesn't find a solution
      const greedyCombination = calculateGreedyCombination(targetLength);
      setOptimalCombination(greedyCombination);
      onCalculate(greedyCombination);
    }
  };

  const calculateGreedyCombination = (targetLength: number): OptimalCombination => {
    const combination: { length: KerbLength; quantity: number }[] = [];
    let remainingLength = targetLength;
    let totalQuantity = 0;

    // Start with the longest lengths to minimize joints
    for (const kerbLength of availableLengths) {
      if (remainingLength >= kerbLength.length) {
        const quantity = Math.floor(remainingLength / kerbLength.length);
        if (quantity > 0) {
          combination.push({ length: kerbLength, quantity });
          remainingLength -= quantity * kerbLength.length;
          totalQuantity += quantity;
        }
      }
    }

    // If there's remaining length, add one more of the smallest that fits
    if (remainingLength > 0) {
      const smallestFitting = [...availableLengths].reverse().find(l => l.length >= remainingLength);
      if (smallestFitting) {
        const existing = combination.find(c => c.length.length === smallestFitting.length);
        if (existing) {
          existing.quantity++;
        } else {
          combination.push({ length: smallestFitting, quantity: 1 });
        }
        totalQuantity++;
      } else {
        // Use the smallest available length
        const smallest = availableLengths[availableLengths.length - 1];
        combination.push({ length: smallest, quantity: 1 });
        totalQuantity++;
      }
    }

    // Calculate total length and waste
    const totalLength = combination.reduce((sum, item) => sum + item.length.length * item.quantity, 0);
    const waste = totalLength - targetLength;

    // Calculate pricing
    const tierInfo = getTierPricing(totalQuantity);
    const totalPrice = combination.reduce((sum, item) => {
      return sum + (item.length.basePrice * tierInfo.multiplier * item.quantity);
    }, 0);

    return {
      lengths: combination,
      totalLength,
      waste,
      totalPrice,
      tierPricing: {
        tier: tierInfo.tier,
        pricePerUnit: tierInfo.multiplier,
      },
    };
  };

  const handleAddToCart = () => {
    if (!optimalCombination || !onAddToCart) return;

    const items = optimalCombination.lengths.map(item => ({
      productName: item.length.name,
      quantity: item.quantity,
      unitPrice: item.length.basePrice * optimalCombination.tierPricing.pricePerUnit,
    }));

    onAddToCart(items);
  };

  return (
    <Card className="border-2 border-yellow-400">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-yellow-600" />
          ForkGuard Kerb Length Calculator
        </CardTitle>
        <CardDescription>
          Calculate the optimal combination of kerb lengths for your project
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="required-length">Required Total Length (meters)</Label>
          <div className="flex gap-2">
            <Input
              id="required-length"
              type="number"
              placeholder="Enter length in meters"
              value={requiredLength}
              onChange={(e) => setRequiredLength(e.target.value)}
              step="0.1"
              min="0"
              data-testid="input-required-length"
            />
            <Button onClick={calculateOptimalCombination} data-testid="button-calculate">
              Calculate
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Available lengths: 1365mm to 1965mm in 100mm increments
          </p>
        </div>

        {optimalCombination && (
          <div className="space-y-4">
            <Alert className="border-green-200 bg-green-50">
              <AlertCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <div className="space-y-2">
                  <p className="font-semibold">Optimal combination found!</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Required: {requiredLength}m ({(parseFloat(requiredLength) * 1000).toFixed(0)}mm)</div>
                    <div>Actual: {(optimalCombination.totalLength / 1000).toFixed(2)}m ({optimalCombination.totalLength}mm)</div>
                    <div>Excess: {optimalCombination.waste}mm ({((optimalCombination.waste / (parseFloat(requiredLength) * 1000)) * 100).toFixed(1)}%)</div>
                    <div>Joints: {optimalCombination.lengths.reduce((sum, item) => sum + item.quantity, 0) - 1}</div>
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Recommended Products</h4>
                <Badge variant="secondary" className="bg-yellow-100">
                  {optimalCombination.tierPricing.tier}
                </Badge>
              </div>
              
              {optimalCombination.lengths.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Package className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="font-medium">{item.length.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.length.length}mm × {item.quantity} = {item.length.length * item.quantity}mm
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {formatPrice(item.length.basePrice * optimalCombination.tierPricing.pricePerUnit * item.quantity)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatPrice(item.length.basePrice * optimalCombination.tierPricing.pricePerUnit)} each
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between mb-4">
                <span className="text-lg font-semibold">Total Price</span>
                <span className="text-2xl font-bold text-yellow-600">
                  {formatPrice(optimalCombination.totalPrice)}
                </span>
              </div>
              
              {onAddToCart && (
                <Button onClick={handleAddToCart} className="w-full" data-testid="button-add-calculated-to-cart">
                  Add Calculated Items to Cart
                </Button>
              )}
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Installation Note:</strong> This calculation optimizes for minimal joints while using standard lengths. 
                Consider site-specific requirements and allow for 5-10mm gaps between sections for thermal expansion.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}