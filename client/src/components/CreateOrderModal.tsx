import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { User, UserPlus, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/contexts/CurrencyContext";

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  cartItems: any[];
  userServiceSelection: any;
  userDiscountSelections: any[];
  impactCalculationId?: string;
  partnerDiscountCode?: string;
  partnerDiscountPercent?: number;
  installationComplexity?: 'simple' | 'standard' | 'complex';
  companyLogoUrl?: string;
  linkedInDiscountAmount?: number;
  linkedInDiscountData?: any;
}

export function CreateOrderModal({ 
  isOpen, 
  onClose, 
  user, 
  cartItems, 
  userServiceSelection, 
  userDiscountSelections,
  impactCalculationId,
  partnerDiscountCode,
  partnerDiscountPercent,
  installationComplexity = 'standard',
  companyLogoUrl,
  linkedInDiscountAmount,
  linkedInDiscountData 
}: CreateOrderModalProps) {
  const [step, setStep] = useState<'selection' | 'customer-details'>('selection');
  const [isForUser, setIsForUser] = useState(true);
  const [customerDetails, setCustomerDetails] = useState({
    customerName: '',
    customerJobTitle: '',
    customerCompany: '',
    customerMobile: '',
    customerEmail: ''
  });
  const [customOrderNumber, setCustomOrderNumber] = useState('');
  const [revisionInfo, setRevisionInfo] = useState<any>(null);
  
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { selectedCurrency } = useCurrency();

  // Check for revision info in session storage
  useEffect(() => {
    const storedRevisionInfo = sessionStorage.getItem('orderRevisionInfo');
    if (storedRevisionInfo) {
      setRevisionInfo(JSON.parse(storedRevisionInfo));
    }
  }, [isOpen]);

  // Wave-1 cleanup (May 2026): the team feedback session showed the
  // "For Me / For Customer" selection step + customer-information form
  // was a confusing leftover from the partner-self-service plan.
  // Reps always have an active project with the customer's data
  // already attached, so auto-fire the order creation as soon as the
  // modal opens with a clean state. The modal becomes a brief
  // "Generating order form…" affordance, then redirects to /order-form/:id
  // where the rep can edit the reference number and customer details
  // inline if they need to.
  useEffect(() => {
    if (
      isOpen &&
      step === 'selection' &&
      !createOrderMutation.isPending &&
      !createOrderMutation.isSuccess &&
      !revisionInfo
    ) {
      handleCreateOrder(true, {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, step, revisionInfo]);

  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const response = await apiRequest("/api/orders", "POST", orderData);
      return response.json();
    },
    onSuccess: (data: any) => {
      console.log('Order creation response:', data);
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      
      // Clear revision info from session storage after successful order creation
      sessionStorage.removeItem('orderRevisionInfo');
      
      toast({
        title: revisionInfo ? "Order Revision Created" : "Order Form Created",
        description: revisionInfo 
          ? `Revision #${revisionInfo.revisionCount} has been created successfully`
          : "Your order form has been created successfully",
      });
      
      // Redirect to the order form page
      console.log('Redirecting to order form with ID:', data.id);
      setLocation(`/order-form/${data.id}`);
      onClose();
      resetForm();
    },
    onError: (error: any) => {
      haptic.error();
      toast({
        title: "Error",
        description: error.message || "Failed to create order form",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setStep('selection');
    setIsForUser(true);
    setCustomerDetails({
      customerName: '',
      customerJobTitle: '',
      customerCompany: '',
      customerMobile: '',
      customerEmail: ''
    });
    setCustomOrderNumber('');
  };

  const handleSelectionNext = (forUser: boolean) => {
    setIsForUser(forUser);
    if (forUser) {
      // Create order immediately for user
      handleCreateOrder(true, {});
    } else {
      // Go to customer details step
      setStep('customer-details');
    }
  };

  const handleCreateOrder = (forUser: boolean, details: any) => {
    const orderData = {
      cartItems,
      isForUser: forUser,
      servicePackage: userServiceSelection,
      discountOptions: userDiscountSelections,
      impactCalculationId,
      partnerDiscountCode,
      partnerDiscountPercent,
      installationComplexity,
      linkedInDiscountAmount,
      linkedInDiscountData,
      currency: selectedCurrency, // Add the selected currency
      companyLogoUrl, // Add the company logo URL
      customOrderNumber: customOrderNumber || undefined, // Add custom order number if provided
      // Include revision info if this is a revision
      ...(revisionInfo ? { revisionInfo } : {}),
      ...(!forUser && details)
    };

    createOrderMutation.mutate(orderData);
  };

  const handleCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!customerDetails.customerName || !customerDetails.customerEmail || !customerDetails.customerMobile) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    handleCreateOrder(false, customerDetails);
  };

  const handleInputChange = (field: string, value: string) => {
    setCustomerDetails(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {revisionInfo ? 'Create Order Revision' : 'Create Order Form'}
            {revisionInfo && (
              <Badge variant="secondary" className="ml-2">
                Revision #{revisionInfo.revisionCount}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {revisionInfo
              ? `Creating revision ${revisionInfo.revisionCount} of the original order`
              : step === 'selection'
                ? 'Generating your order form…'
                : 'Enter customer information for the order form'}
          </DialogDescription>
        </DialogHeader>

        {/* Wave-1 cleanup: the auto-fire effect at the top of the
            component immediately calls handleCreateOrder(true, {})
            when the modal opens, so the "selection" step is now just
            a brief loading affordance — no clickable choice. The
            'customer-details' step is preserved for the revision /
            quote-request flows that still need it. */}
        {step === 'selection' && (
          <div className="py-8 flex flex-col items-center gap-3 text-center">
            <FileText className="h-10 w-10 text-yellow-500 animate-pulse" />
            <p className="text-sm text-muted-foreground">
              Generating order form for the active project…
            </p>
          </div>
        )}

        {step === 'selection-legacy-disabled' && (
          <div className="space-y-4">
            <Card 
              className="cursor-pointer hover:bg-gray-50 transition-colors border-2 hover:border-yellow-400"
              onClick={() => handleSelectionNext(true)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <User className="h-8 w-8 text-yellow-600" />
                <div>
                  <h3 className="font-medium">For Me</h3>
                  <p className="text-sm text-gray-600">
                    Use my profile information as the customer
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:bg-gray-50 transition-colors border-2 hover:border-yellow-400"
              onClick={() => handleSelectionNext(false)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <UserPlus className="h-8 w-8 text-blue-600" />
                <div>
                  <h3 className="font-medium">For Another Customer</h3>
                  <p className="text-sm text-gray-600">
                    Enter customer details manually
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="custom-order-number">Custom A-SAFE Order Form Number (Optional)</Label>
              <Input
                id="custom-order-number"
                value={customOrderNumber}
                onChange={(e) => setCustomOrderNumber(e.target.value)}
                placeholder="e.g. ASAFE-2024-001"
                data-testid="input-custom-order-number"
              />
              <p className="text-xs text-gray-500">
                Add your own reference number for CRM alignment and searchability
              </p>
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {step === 'customer-details' && (
          <form onSubmit={handleCustomerSubmit} className="space-y-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="customer-name">Customer Name *</Label>
                <Input
                  id="customer-name"
                  value={customerDetails.customerName}
                  onChange={(e) => handleInputChange('customerName', e.target.value)}
                  placeholder="Full name"
                  required
                  data-testid="input-customer-name"
                />
              </div>

              <div>
                <Label htmlFor="customer-job-title">Job Title</Label>
                <Input
                  id="customer-job-title"
                  value={customerDetails.customerJobTitle}
                  onChange={(e) => handleInputChange('customerJobTitle', e.target.value)}
                  placeholder="e.g. Safety Manager"
                  data-testid="input-customer-job-title"
                />
              </div>

              <div>
                <Label htmlFor="customer-company">Company</Label>
                <Input
                  id="customer-company"
                  value={customerDetails.customerCompany}
                  onChange={(e) => handleInputChange('customerCompany', e.target.value)}
                  placeholder="Company name"
                  data-testid="input-customer-company"
                />
              </div>

              <div>
                <Label htmlFor="customer-mobile">Mobile Number *</Label>
                <Input
                  id="customer-mobile"
                  value={customerDetails.customerMobile}
                  onChange={(e) => handleInputChange('customerMobile', e.target.value)}
                  placeholder="+971 50 123 4567"
                  required
                  data-testid="input-customer-mobile"
                />
              </div>

              <div>
                <Label htmlFor="customer-email">Email Address *</Label>
                <Input
                  id="customer-email"
                  type="email"
                  value={customerDetails.customerEmail}
                  onChange={(e) => handleInputChange('customerEmail', e.target.value)}
                  placeholder="customer@company.com"
                  required
                  data-testid="input-customer-email"
                />
              </div>

              <div>
                <Label htmlFor="custom-order-number-2">Custom A-SAFE Order Form Number (Optional)</Label>
                <Input
                  id="custom-order-number-2"
                  value={customOrderNumber}
                  onChange={(e) => setCustomOrderNumber(e.target.value)}
                  placeholder="e.g. ASAFE-2024-001"
                  data-testid="input-custom-order-number-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Add your own reference number for CRM alignment and searchability
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setStep('selection')}
                className="flex-1"
              >
                Back
              </Button>
              <Button 
                type="submit" 
                disabled={createOrderMutation.isPending}
                className="flex-1 bg-green-600 hover:bg-green-700"
                data-testid="button-submit-order"
              >
                {createOrderMutation.isPending ? "Creating..." : "Create Order Form"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}