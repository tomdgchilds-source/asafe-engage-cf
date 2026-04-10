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
      // Check if adding this discount would exceed 23%
      const currentTotal = getTotalDiscount();
      if (currentTotal + discountPercent > 23) {
        toast({
          title: "Discount Limit Exceeded",
          description: `Adding this discount would exceed the 23% maximum limit. Current total: ${currentTotal}%`,
          variant: "destructive",
        });
        return;
      }
      // Add the discount
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
            <span className="block">Select savings options to apply to your cart{totalDiscount >= 23 ? '. Maximum total savings: 23%' : ''}</span>
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
                variant={totalDiscount >= 20 ? "destructive" : totalDiscount >= 15 ? "secondary" : "default"}
                className="text-base px-3 py-1"
              >
                Total Savings: -{totalDiscount}%{totalDiscount >= 23 && " / 23% max"}
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
                    const wouldExceedLimit = !isSelected && (totalDiscount + option.discountPercent > 23);
                    
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
                                <span>Would exceed 23% limit</span>
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
              disabled={saveSelectionsMutation.isPending}
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