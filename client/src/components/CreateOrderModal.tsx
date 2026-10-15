import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, ApiError } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, ShieldAlert } from "lucide-react";
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
  const [step, setStep] = useState<'selection' | 'customer-details' | 'pas13-blocked'>('selection');
  // PAS 13 pre-flight: POST /api/orders answers 409 + { pas13Blockers } when a
  // line is not aligned with the project's vehicle context. The server allows
  // ?override=true&overrideReason=… (audit-logged), so surface the cited
  // blockers and offer that override instead of a raw-JSON toast + a modal
  // stuck on "Generating…".
  type Pas13Blocker = { productName: string; summary: string };
  const [pas13Blockers, setPas13Blockers] = useState<Pas13Blocker[]>([]);
  const [pas13Warnings, setPas13Warnings] = useState<string[]>([]);
  const [overrideReason, setOverrideReason] = useState('');
  const [pendingOrderData, setPendingOrderData] = useState<any>(null);
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

  // Start clean every time the modal opens so a previous PAS 13 block or
  // error doesn't leave the next attempt stuck on a stale step.
  useEffect(() => {
    if (!isOpen) {
      setStep('selection');
      setPas13Blockers([]);
      setPas13Warnings([]);
      setOverrideReason('');
      setPendingOrderData(null);
      createOrderMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
    mutationFn: async ({
      orderData,
      override,
      overrideReason: reason,
    }: { orderData: any; override?: boolean; overrideReason?: string }) => {
      const qs = override
        ? `?override=true&overrideReason=${encodeURIComponent(reason || "Rep override from order form")}`
        : "";
      const response = await apiRequest(`/api/orders${qs}`, "POST", orderData);
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
    onError: (error: any, variables) => {
      haptic.error();
      // 409 = PAS 13 pre-flight block. ApiError's message is "409: <json>".
      if (error instanceof ApiError && error.status === 409) {
        try {
          const raw = String(error.message).replace(/^409:\s*/, "");
          const parsed = JSON.parse(raw) as {
            message?: string;
            pas13Blockers?: Pas13Blocker[];
            pas13Warnings?: string[];
          };
          setPas13Blockers(parsed.pas13Blockers ?? []);
          setPas13Warnings(parsed.pas13Warnings ?? []);
          setPendingOrderData(variables?.orderData ?? null);
          setStep('pas13-blocked');
          return;
        } catch {
          /* fall through to the generic toast */
        }
      }
      let description = error?.message || "Failed to create order form";
      // Never show raw JSON to the rep — pull the server's message out.
      const m = /^\d{3}:\s*(\{[\s\S]*\})$/.exec(description);
      if (m) {
        try { description = JSON.parse(m[1]).message || description; } catch {}
      }
      toast({ title: "Couldn't create order form", description, variant: "destructive" });
      // Leave the spinner step — give the rep a way back instead.
      if (step === 'selection') setStep('customer-details');
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

    createOrderMutation.mutate({ orderData });
  };

  const handleOverrideAndCreate = () => {
    if (!pendingOrderData) return;
    createOrderMutation.mutate({
      orderData: pendingOrderData,
      override: true,
      overrideReason: overrideReason.trim() || undefined,
    });
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
              : step === 'pas13-blocked'
              ? 'One or more lines need a PAS 13 override'
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

        {step === 'pas13-blocked' && (
          <div className="space-y-4" data-testid="pas13-blocked-panel">
            <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3">
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  PAS 13 pre-flight: {pas13Blockers.length} line{pas13Blockers.length === 1 ? "" : "s"} not aligned
                </p>
                <p className="text-amber-800 dark:text-amber-300 mt-1">
                  Checked against this project's vehicle context. You can go back and change
                  the products, or override with a reason — the override is recorded in the
                  order's audit trail.
                </p>
              </div>
            </div>
            <ul className="space-y-2 max-h-48 overflow-y-auto text-sm" data-testid="pas13-blockers-list">
              {pas13Blockers.map((b, i) => (
                <li key={`${b.productName}-${i}`} className="rounded-md border border-border p-2" data-testid={`pas13-blocker-${i}`}>
                  <div className="font-medium">{b.productName}</div>
                  <div className="text-muted-foreground">{b.summary}</div>
                </li>
              ))}
            </ul>
            {pas13Warnings.length > pas13Blockers.length && (
              <p className="text-xs text-muted-foreground">
                {pas13Warnings.length - pas13Blockers.length} further note{pas13Warnings.length - pas13Blockers.length === 1 ? "" : "s"} will be attached to the order form.
              </p>
            )}
            <div>
              <Label htmlFor="pas13-override-reason">Override reason (recommended)</Label>
              <Textarea
                id="pas13-override-reason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. Customer accepts bollard rating; forklift speed limited to 6 km/h in this aisle."
                rows={3}
                className="mt-1"
                data-testid="textarea-pas13-override-reason"
              />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1" data-testid="button-pas13-back">
                Back to cart
              </Button>
              <Button
                type="button"
                onClick={handleOverrideAndCreate}
                disabled={createOrderMutation.isPending}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-black"
                data-testid="button-pas13-override"
              >
                {createOrderMutation.isPending ? "Creating…" : "Override and create order form"}
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