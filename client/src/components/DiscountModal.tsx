import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Percent, Tag, AlertCircle, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { DiscountTermsModal } from "@/components/DiscountTermsModal";
import { getCombinedDiscount, getDiscountCap } from "@shared/discountLimits";

interface DiscountOption {
  id: string;
  title: string;
  description: string;
  discountPercent: number;
  category: string;
  isActive: boolean;
}

interface UserDiscountSelection {
  id: string;
  userId: string;
  discountOptionId: string;
  isSelected: boolean;
}

interface DiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  cartItems: any[];
}

interface DiscountLimitInfo {
  subtotalAed: number;
  cap: number;
  tier: string;
  rationale: string;
  hardCeiling: number;
  nextTier: { label: string; cap: number; amountToNext: number } | null;
  allTiers: { min: number; cap: number; label: string }[];
}

export function DiscountModal({ isOpen, onClose, user, cartItems }: DiscountModalProps) {
  const [selectedDiscounts, setSelectedDiscounts] = useState<string[]>([]);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [selectedDiscountType, setSelectedDiscountType] = useState<string>("");
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const queryClient = useQueryClient();

  // Fetch available discount options
  const { data: discountOptions = [], isLoading: optionsLoading } = useQuery<DiscountOption[]>({
    queryKey: ["/api/discount-options"],
    enabled: isOpen && !!user,
  });

  // Fetch user's current selections
  const { data: userSelections = [], isLoading: selectionsLoading } = useQuery<UserDiscountSelection[]>({
    queryKey: ["/api/user-discount-selections"],
    enabled: isOpen && !!user,
  });

  // Cart total in AED. Every stored price in the app is AED (CurrencyContext
  // converts for display only), so this is the subtotal the size-tiered
  // caps in shared/discountLimits are defined against.
  const cartTotalAed = (cartItems || []).reduce(
    (sum: number, item: any) => sum + (item.totalPrice || 0),
    0
  );

  // Fetch dynamic cap (tier, next-unlock) from the worker.
  const { data: limitInfo } = useQuery<DiscountLimitInfo>({
    queryKey: ["/api/discount-limit", Math.round(cartTotalAed)],
    queryFn: async () => {
      const res = await fetch(
        `/api/discount-limit?subtotal=${encodeURIComponent(Math.round(cartTotalAed))}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    enabled: isOpen,
    staleTime: 30_000,
  });
  // Same tier table the server uses (shared/discountLimits), so the cap is
  // right even before /api/discount-limit answers.
  const discountCap = limitInfo?.cap ?? getDiscountCap(cartTotalAed);

  // Update selected discounts when user selections load
  useEffect(() => {
    if (userSelections.length > 0) {
      const selected = userSelections
        .filter(selection => selection.isSelected)
        .map(selection => selection.discountOptionId);
      setSelectedDiscounts(selected);
    }
  }, [userSelections]);

  // Save selections mutation
  const saveSelectionsMutation = useMutation({
    mutationFn: async (selections: string[]) => {
      return apiRequest("/api/user-discount-selections", "POST", {
        selections
      });
    },
    onSuccess: () => {
      haptic.save();
      queryClient.invalidateQueries({ queryKey: ["/api/user-discount-selections"] });
      toast({
        title: "Success",
        description: "Your discount selections have been saved",
      });
      onClose();
    },
    onError: (error: any) => {
      haptic.error();
      toast({
        title: "Error",
        description: error.message || "Failed to save discount selections",
        variant: "destructive",
      });
    },
  });

  const handleDiscountToggle = (discountId: string, discountPercent: number) => {
    const isCurrentlySelected = selectedDiscounts.includes(discountId);

    if (isCurrentlySelected) {
      // Remove the discount
      setSelectedDiscounts(prev => prev.filter(id => id !== discountId));
    } else {
      // Check against the server-computed tier cap (25–30% depending on deal size).
      const currentTotal = getTotalDiscount();
      if (currentTotal + discountPercent > discountCap) {
        toast({
          title: "Savings limit reached",
          description: `Your current order qualifies for up to ${discountCap}% (${limitInfo?.tier || "Standard"} tier). ${
            limitInfo?.nextTier
              ? `Add AED ${Math.round(limitInfo.nextTier.amountToNext).toLocaleString()} more to unlock the ${limitInfo.nextTier.label} tier (${limitInfo.nextTier.cap}%).`
              : ""
          }`,
          variant: "destructive",
        });
        return;
      }
      setSelectedDiscounts(prev => [...prev, discountId]);
    }
  };

  const getTotalDiscount = () => {
    return selectedDiscounts.reduce((total, discountId) => {
      const option = discountOptions.find(opt => opt.id === discountId);
      return total + (option?.discountPercent || 0);
    }, 0);
  };

  const getSelectedDiscountsByCategory = () => {
    const selectedOptions = discountOptions.filter(opt => selectedDiscounts.includes(opt.id));
    const categories: { [key: string]: DiscountOption[] } = {};
    
    selectedOptions.forEach(option => {
      if (!categories[option.category]) {
        categories[option.category] = [];
      }
      categories[option.category].push(option);
    });
    
    return categories;
  };

  // Calculate cart total for eligibility checks
  const getCartTotal = () => {
    return cartItems?.reduce((sum: number, item: any) => sum + item.totalPrice, 0) || 0;
  };

  const groupedOptions = discountOptions.reduce((acc, option) => {
    if (!acc[option.category]) {
      acc[option.category] = [];
    }
    acc[option.category].push(option);
    return acc;
  }, {} as { [key: string]: DiscountOption[] });

  const totalDiscount = getTotalDiscount();
  const cartTotal = getCartTotal();
  // Enforce the cap with the same function the cart, order form and Worker
  // apply. Selections saved against a bigger cart can exceed today's tier
  // once items are removed — in that case confirm is disabled until the
  // rep deselects enough to fit.
  const cappedReciprocal = getCombinedDiscount(totalDiscount, 0, cartTotalAed).reciprocal;
  const overCap = totalDiscount > cappedReciprocal;

  if (optionsLoading || selectionsLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5" />
              Loading Discount Options...
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-8">
            <div className="h-6 bg-gray-200 rounded animate-pulse" />
            <div className="h-20 bg-gray-200 rounded animate-pulse" />
            <div className="h-20 bg-gray-200 rounded animate-pulse" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Unlock Savings
          </DialogTitle>
          <DialogDescription className="space-y-3">
            <span className="block">
              Select savings options to apply to your cart.{" "}
              <strong>
                This order qualifies for up to {discountCap}% (
                {limitInfo?.tier || "Standard"} tier)
              </strong>
              {limitInfo?.nextTier && (
                <>
                  {" "}— spend AED{" "}
                  {Math.round(limitInfo.nextTier.amountToNext).toLocaleString()}{" "}
                  more to unlock the {limitInfo.nextTier.label} tier (
                  {limitInfo.nextTier.cap}%).
                </>
              )}
            </span>
            <span className="block text-sm text-gray-600 leading-relaxed">
              At A-SAFE, we believe in creating partnerships that benefit both sides. That's why we offer added value through a reciprocal approach meaning if you share your safety successes, such as a testimonial, referrals, or a LinkedIn post, we can recognize your achievements, promote safer work practices, and celebrate your improvements while enhancing the overall value you receive on your project.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Available Options by Category */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Available Saving Options</h3>
              <Badge
                variant={totalDiscount >= discountCap ? "destructive" : totalDiscount >= discountCap * 0.75 ? "secondary" : "default"}
                className="text-base px-3 py-1"
                data-testid="badge-total-savings"
              >
                Total Savings: -{totalDiscount}%
                {totalDiscount >= discountCap && ` / ${discountCap}% max`}
              </Badge>
            </div>
            
            {Object.entries(groupedOptions).map(([category, options]) => (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="text-base">{category}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {options.map(option => {
                    const isSelected = selectedDiscounts.includes(option.id);
                    const wouldExceedLimit = !isSelected && (totalDiscount + option.discountPercent > discountCap);
                    
                    // Check if this is the 10% flagship discount that requires 500k AED minimum
                    const isEligibleForFlagship = option.discountPercent === 10 && option.id === 'FLAGSHIP_SHOWCASE' 
                      ? cartTotal >= 500000 
                      : true;
                    
                    const isDisabled = wouldExceedLimit || !isEligibleForFlagship;
                    
                    return (
                      <div 
                        key={option.id}
                        className={`border rounded-lg p-4 transition-colors cursor-pointer ${
                          isSelected 
                            ? 'border-green-300 bg-green-50' 
                            : isDisabled 
                              ? 'border-gray-200 bg-gray-50 opacity-50' 
                              : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => !isDisabled && handleDiscountToggle(option.id, option.discountPercent)}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleDiscountToggle(option.id, option.discountPercent)}
                            disabled={isDisabled}
                            className="mt-1"
                            data-testid={`checkbox-discount-${option.id}`}
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium">{option.title}</h4>
                              <Badge 
                                variant={isSelected ? "default" : "outline"}
                                className="ml-2"
                              >
                                -{option.discountPercent}%
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600 mb-3">{option.description}</p>
                            <div className="flex items-center justify-between">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDiscountType(option.id);
                                  setTermsModalOpen(true);
                                }}
                                className="flex items-center gap-1 text-xs"
                              >
                                <FileText className="h-3 w-3" />
                                View Terms
                              </Button>
                            </div>
                            {wouldExceedLimit && (
                              <div className="flex items-center gap-1 mt-2 text-xs text-amber-600">
                                <AlertCircle className="h-3 w-3" />
                                <span>Would exceed {discountCap}% limit for this order size</span>
                              </div>
                            )}
                            {!isEligibleForFlagship && option.id === 'FLAGSHIP_SHOWCASE' && (
                              <div className="flex items-center gap-1 mt-2 text-xs text-red-600">
                                <AlertCircle className="h-3 w-3" />
                                <span>Requires cart total of AED 500,000+ (Current: AED {Math.round(cartTotal).toLocaleString()})</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>

          <Separator />

          {overCap && (
            <div
              className="flex items-center gap-2 text-sm text-red-600"
              data-testid="text-discount-over-cap"
            >
              <AlertCircle className="h-4 w-4" />
              <span>
                Selected savings total {totalDiscount}% but this order size qualifies for
                at most {cappedReciprocal}%. Deselect an option to continue.
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              data-testid="button-cancel-discounts"
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveSelectionsMutation.mutate(selectedDiscounts)}
              disabled={saveSelectionsMutation.isPending || overCap}
              className="flex-1 bg-yellow-400 text-black hover:bg-yellow-500"
              data-testid="button-save-discounts"
            >
              {saveSelectionsMutation.isPending ? "Saving..." : `Apply ${totalDiscount > 0 ? `-${totalDiscount}% ` : ""}Savings`}
            </Button>
          </div>
        </div>
      </DialogContent>
      
      {/* Terms Modal */}
      <DiscountTermsModal
        isOpen={termsModalOpen}
        onClose={() => setTermsModalOpen(false)}
        discountType={selectedDiscountType}
      />
    </Dialog>
  );
}