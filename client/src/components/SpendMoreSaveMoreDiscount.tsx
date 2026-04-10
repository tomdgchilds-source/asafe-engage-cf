import React, { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Percent, DollarSign, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { useAutoMinimize } from "@/hooks/useAutoMinimize";

interface SpendMoreSaveMoreDiscountProps {
  cartItems: any[];
  currency: string;
}

export function SpendMoreSaveMoreDiscount({ cartItems, currency }: SpendMoreSaveMoreDiscountProps) {
  const [dragPosition, setDragPosition] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showPercentage, setShowPercentage] = useState(false);
  const { isExpanded, toggleExpanded, cardRef } = useAutoMinimize(false);

  // Get currency rates for conversion
  const { data: rates = {} } = useQuery<{ [key: string]: number }>({
    queryKey: ["/api/currency/rates"],
  });

  // Constants for the discount scale
  const MAX_CONTRACT_VALUE = 3000000; // 3M AED
  const MAX_DISCOUNT_PERCENT = 35; // 35% max discount
  
  // Calculate current cart total in AED
  const getCurrentCartTotal = () => {
    const total = cartItems?.reduce((sum: number, item: any) => sum + item.totalPrice, 0) || 0;
    // Convert to AED if needed
    if (currency === 'AED') return total;
    const aedRate = 1; // AED is base currency
    const currentRate = rates[currency] || 1;
    return total / currentRate * aedRate;
  };

  const currentCartTotalAED = getCurrentCartTotal();
  
  // Calculate discount percentage based on cart value with curved progression
  // Curved progression achieves exactly 25% discount at 1M AED spend
  const calculateDiscountPercent = (contractValue: number) => {
    if (contractValue <= 0) return 0;
    
    // Using power curve: discount = c * (contractValue/1000000)^k * 25
    // This ensures exactly 25% at 1M AED with smooth curve progression
    const k = 0.3; // Power factor for curve shape
    const baseValue = 1000000; // 1M AED reference point
    const targetDiscount = 25; // 25% discount at 1M AED
    
    const discountPercent = targetDiscount * Math.pow(contractValue / baseValue, k);
    
    return Math.min(discountPercent, MAX_DISCOUNT_PERCENT);
  };

  // Calculate contract value from position (0-1)
  const calculateContractValueFromPosition = (position: number) => {
    return position * MAX_CONTRACT_VALUE;
  };

  // Calculate position from contract value
  const calculatePositionFromContractValue = (contractValue: number) => {
    return Math.min(contractValue / MAX_CONTRACT_VALUE, 1);
  };

  // Current discount based on actual cart value
  const currentDiscountPercent = calculateDiscountPercent(currentCartTotalAED);
  const currentPosition = calculatePositionFromContractValue(currentCartTotalAED);

  // Dragged position values
  const draggedContractValue = calculateContractValueFromPosition(dragPosition || currentPosition);
  const draggedDiscountPercent = calculateDiscountPercent(draggedContractValue);

  // Format currency value
  const formatCurrency = (value: number, targetCurrency: string = currency) => {
    // Convert from AED to target currency
    const convertedValue = targetCurrency === 'AED' ? value : value * (rates[targetCurrency] || 1);
    
    const symbols: { [key: string]: string } = {
      AED: 'د.إ',
      SAR: '﷼',
      GBP: '£',
      USD: '$',
      EUR: '€'
    };

    return `${symbols[targetCurrency] || targetCurrency} ${convertedValue.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  };

  // Calculate savings amount
  const calculateSavings = (contractValue: number, discountPercent: number) => {
    return contractValue * (discountPercent / 100);
  };

  // Handle mouse/touch events for dragging
  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    // Initialize drag position to current position before starting drag
    setDragPosition(currentPosition);
    setIsDragging(true);
    const container = document.getElementById('discount-scale');
    if (container) {
      updatePosition(container, event.clientX);
    }
  };

  // Handle touch events for mobile
  const handleTouchStart = (event: React.TouchEvent) => {
    event.preventDefault();
    event.stopPropagation();
    // Initialize drag position to current position before starting drag
    setDragPosition(currentPosition);
    setIsDragging(true);
    const touch = event.touches[0];
    const container = document.getElementById('discount-scale');
    if (container) {
      updatePosition(container, touch.clientX);
    }
  };

  const handleTouchMove = useCallback((event: TouchEvent) => {
    if (!isDragging) return;
    event.preventDefault();
    const container = document.getElementById('discount-scale');
    if (container && event.touches[0]) {
      updatePosition(container, event.touches[0].clientX);
    }
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isDragging) return;
    const container = document.getElementById('discount-scale');
    if (container) {
      updatePosition(container, event.clientX);
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const updatePosition = (container: HTMLElement, clientX: number) => {
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const position = Math.max(0, Math.min(1, x / rect.width));
    setDragPosition(position);
  };

  // Attach global mouse and touch events
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove, { passive: false });
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  const activePosition = isDragging ? dragPosition : currentPosition;
  const activeContractValue = isDragging ? draggedContractValue : currentCartTotalAED;
  const activeDiscountPercent = isDragging ? draggedDiscountPercent : currentDiscountPercent;
  const activeSavings = calculateSavings(activeContractValue, activeDiscountPercent);

  return (
    <Card ref={cardRef} className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            <CardTitle className="text-lg">Savings Slider</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleExpanded}
            className="h-8 w-8 p-0"
            data-testid="button-toggle-savings-slider"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        {!isExpanded && (
          <p className="text-sm text-gray-600">
            Current savings: {formatCurrency(activeSavings)} ({activeDiscountPercent.toFixed(1)}%)
          </p>
        )}
        {isExpanded && (
          <p className="text-sm text-gray-600">
            See how much you can save! Drag the slider to explore savings at different contract values.
          </p>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-6">
        {/* Current Status */}
        <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
          <div>
            <p className="text-sm font-medium text-blue-900">Current Cart Total</p>
            <p className="text-lg font-semibold text-blue-700">
              {formatCurrency(currentCartTotalAED)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-blue-900">Current Discount</p>
            <Badge className="bg-blue-600 text-white">
              {currentDiscountPercent.toFixed(1)}%
            </Badge>
          </div>
        </div>

        {/* Interactive Scale */}
        <div className="space-y-4">
          <div className="flex justify-between text-xs text-gray-500">
            <span>0 AED (0%)</span>
            <span>3M AED (35%)</span>
          </div>
          
          <div 
            id="discount-scale"
            className="relative h-8 bg-gradient-to-r from-gray-200 via-yellow-300 to-green-500 rounded-full cursor-pointer select-none"
            data-testid="discount-scale"
          >
            {/* Current position indicator (fixed) */}
            <div 
              className="absolute top-0 h-8 w-1 bg-blue-600 rounded-full transform -translate-x-1/2 z-10"
              style={{ left: `${currentPosition * 100}%` }}
            >
              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-xs font-medium text-blue-600">
                Current
              </div>
            </div>

            {/* Interactive marker */}
            <div 
              className={`absolute top-0 h-8 w-4 bg-white border-2 border-gray-800 rounded-full transform -translate-x-1/2 shadow-lg z-20 select-none ${
                isDragging ? 'cursor-grabbing scale-110' : 'cursor-grab hover:scale-105'
              } transition-transform`}
              style={{ left: `${activePosition * 100}%` }}
              data-testid="discount-marker"
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
            >
              <div className="absolute -top-12 left-1/2 transform -translate-x-1/2 bg-popover text-popover-foreground text-xs px-2 py-1 rounded whitespace-nowrap border border-border">
                {activeDiscountPercent.toFixed(1)}%
              </div>
            </div>
          </div>

          <div className="flex justify-between text-xs text-gray-500">
            <span>Drag slider to explore savings</span>
            <span>{isDragging ? "Release to set position" : "Click and drag marker"}</span>
          </div>
        </div>

        {/* Toggle Button - Positioned above values */}
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPercentage(!showPercentage)}
            className="gap-2"
            data-testid="button-toggle-display"
          >
            {showPercentage ? <Percent className="h-4 w-4" /> : <DollarSign className="h-4 w-4" />}
            {showPercentage ? "Show Currency" : "Show Percentage"}
          </Button>
        </div>

        {/* Potential Savings Display */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-green-50 rounded-lg">
            <p className="text-sm font-medium text-green-900">Contract Value</p>
            <p className="text-xl font-bold text-green-700">
              {showPercentage 
                ? `${activeDiscountPercent.toFixed(1)}%` 
                : formatCurrency(activeContractValue)
              }
            </p>
          </div>

          <div className="p-4 bg-orange-50 rounded-lg">
            <p className="text-sm font-medium text-orange-900">Your Savings</p>
            <p className="text-xl font-bold text-orange-700">
              {showPercentage 
                ? `${activeDiscountPercent.toFixed(1)}%`
                : formatCurrency(activeSavings)
              }
            </p>
          </div>
        </div>

        {/* Milestones */}
        <div className="space-y-2">
          <Separator />
          <p className="text-sm font-medium">Discount Milestones:</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
            <div>• 500K AED → {calculateDiscountPercent(500000).toFixed(1)}% discount</div>
            <div>• 1M AED → {calculateDiscountPercent(1000000).toFixed(1)}% discount</div>
            <div>• 2M AED → {calculateDiscountPercent(2000000).toFixed(1)}% discount</div>
            <div>• 3M AED → {calculateDiscountPercent(3000000).toFixed(1)}% discount</div>
          </div>
        </div>

        {/* Spend More Save More Message */}
        {(isDragging || dragPosition > 0) && activeContractValue > currentCartTotalAED && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-semibold text-yellow-800 mb-2">💡 Spend More, Save More!</h3>
            <p className="text-sm text-yellow-800">
              <strong>Add {formatCurrency(activeContractValue - currentCartTotalAED)} more</strong> to your cart to unlock{" "}
              <strong>{activeDiscountPercent.toFixed(1)}% discount</strong> and save an additional{" "}
              <strong>{formatCurrency(activeSavings - calculateSavings(currentCartTotalAED, currentDiscountPercent))}</strong>!
            </p>
            <div className="mt-2 text-xs text-yellow-700">
              Total potential savings: <strong>{formatCurrency(activeSavings)}</strong>
            </div>
          </div>
        )}
        </CardContent>
      )}
    </Card>
  );
}