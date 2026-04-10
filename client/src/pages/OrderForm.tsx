import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  FileText, 
  User, 
  Building, 
  Phone, 
  Mail, 
  Package, 
  Calculator,
  Shield,
  Crown,
  Percent,
  PenTool,
  Signature,
  Download,
  CheckCircle,
  Share2,
  Copy,
  Calendar,
  MapPin,
  Truck,
  Wrench,
  Star,
  Zap,
  Clock,
  Send,
  Cog,
  CheckCircle2,
  Image,
  Eye,
  ZoomIn,
  ZoomOut,
  X,
  MessageCircle,
  Lock,
  Edit3,
  Gift
} from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { generateOrderFormPDF } from "@/utils/orderFormPdfGenerator";
import { useLocation } from "wouter";
import { ShareOrderModal } from "@/components/ShareOrderModal";

interface OrderFormData {
  id: string;
  orderNumber: string;
  customOrderNumber?: string;
  companyLogoUrl?: string;
  isForUser: boolean;
  customerName?: string;
  customerJobTitle?: string;
  customerCompany?: string;
  customerMobile?: string;
  customerEmail?: string;
  items: any[];
  servicePackage?: any;
  valueCommitments?: any[];
  discountOptions?: any[]; // Keep for backward compatibility
  impactCalculationId?: string;
  totalAmount: number;
  currency: string;
  technicalSignature?: any;
  commercialSignature?: any;
  createdAt: string;
  user: any;
  impactCalculation?: any;
  status?: string;
  layoutDrawings?: any[];
}

export function OrderForm() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  console.log('OrderForm ID from useParams:', id);
  const { formatPrice } = useCurrency();
  const { toast } = useToast();
  const [technicalSignature, setTechnicalSignature] = useState("");
  const [commercialSignature, setCommercialSignature] = useState("");
  const [technicalSignerJobTitle, setTechnicalSignerJobTitle] = useState("");
  const [technicalSignerMobile, setTechnicalSignerMobile] = useState("");
  const [commercialSignerJobTitle, setCommercialSignerJobTitle] = useState("");
  const [commercialSignerMobile, setCommercialSignerMobile] = useState("");
  const [marketingSignature, setMarketingSignature] = useState("");
  const [marketingSignerJobTitle, setMarketingSignerJobTitle] = useState("");
  const [marketingSignerMobile, setMarketingSignerMobile] = useState("");
  const [technicalComments, setTechnicalComments] = useState("");
  const [commercialComments, setCommercialComments] = useState("");
  const [marketingComments, setMarketingComments] = useState("");
  const [shareableUrl, setShareableUrl] = useState("");
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectionType, setRejectionType] = useState<'technical' | 'marketing'>('technical');
  const [rejectionReason, setRejectionReason] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [customOrderNumber, setCustomOrderNumber] = useState("");
  const technicalCanvasRef = useRef<HTMLCanvasElement>(null);
  const commercialCanvasRef = useRef<HTMLCanvasElement>(null);
  const marketingCanvasRef = useRef<HTMLCanvasElement>(null);

  // Generate shareable URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareableUrl(window.location.href);
    }
  }, [id]);

  // Handle Revise Order - restore order data back to cart
  const handleReviseOrder = async () => {
    if (!orderData) return;

    try {
      // Show loading toast
      toast({
        title: "Restoring Order to Cart",
        description: "Please wait while we load your order data...",
      });

      // Call API to restore order to cart
      await apiRequest(`/api/orders/${id}/restore-to-cart`, 'POST');

      // Invalidate cart queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/cart-project-info'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/user-service-selection'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/user-discount-selections'] });

      toast({
        title: "Order Restored",
        description: "Your order has been loaded into the cart. You can now make revisions.",
      });

      // Navigate to cart
      setLocation('/cart');
    } catch (error) {
      console.error('Error restoring order:', error);
      toast({
        title: "Error",
        description: "Failed to restore order. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Fetch order data
  const { data: orderData, isLoading, error } = useQuery<OrderFormData>({
    queryKey: ["/api/orders", id],
    enabled: !!id,
  });

  // Fetch service care options for detailed display
  const { data: serviceCareOptions } = useQuery({
    queryKey: ["/api/service-care-options"],
  });

  // Fetch value commitment options for detailed display
  const { data: valueCommitmentOptions } = useQuery({
    queryKey: ["/api/discount-options"],
  });
  const discountOptions = valueCommitmentOptions; // Alias for backward compatibility

  // Fetch layout drawings for this order
  const { data: layoutDrawings } = useQuery({
    queryKey: ["/api/layout-drawings"],
    enabled: !!orderData?.user?.id,
  });

  // Fetch project case studies
  const { data: projectCaseStudies } = useQuery({
    queryKey: ["/api/project-case-studies"],
    enabled: !!orderData?.user?.id,
  });

  // Fetch user profile data for consultant section
  const { data: userProfile } = useQuery({
    queryKey: ["/api/auth/profile"],
    enabled: !!orderData?.user?.id,
  });

  // Fetch cart project info
  const { data: cartProjectInfo } = useQuery({
    queryKey: ["/api/cart-project-info"],
    enabled: !!orderData?.user?.id,
  });

  // Fetch user service selection
  const { data: userServiceSelection } = useQuery({
    queryKey: ["/api/user-service-selection"],
    enabled: !!orderData?.user?.id,
  });

  // Fetch user value commitment selections
  const { data: userValueCommitmentSelections } = useQuery({
    queryKey: ["/api/user-discount-selections"],
    enabled: !!orderData?.user?.id,
  });
  const userDiscountSelections = userValueCommitmentSelections; // Alias for backward compatibility
  
  console.log('Query enabled:', !!id, 'isLoading:', isLoading, 'error:', error, 'data:', orderData);

  const signOrderMutation = useMutation({
    mutationFn: async (signatureData: any) => {
      return apiRequest(`/api/orders/${id}/sign`, "POST", signatureData);
    },
    onSuccess: async (data, variables) => {
      // Invalidate and refetch the order data to show updated signature
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      
      // Check if both signatures are now completed after this signature
      const updatedOrder = await queryClient.fetchQuery({
        queryKey: ["/api/orders", id],
        staleTime: 0 // Force fresh fetch
      });
      
      // If both signatures are completed, automatically submit order for admin review
      if (updatedOrder && (updatedOrder as any)?.technicalSignature?.signed && (updatedOrder as any)?.commercialSignature?.signed) {
        try {
          await apiRequest(`/api/orders/${id}/submit-for-review`, "POST", {});
          toast({
            title: "Order Submitted for Review",
            description: "Both signatures completed! Order has been submitted to administrators for processing.",
          });
        } catch (error) {
          console.error("Failed to submit order for review:", error);
        }
      } else {
        toast({
          title: "Signature Added",
          description: "Your signature has been recorded successfully",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save signature",
        variant: "destructive",
      });
    },
  });

  // Handle rejection submission
  const handleRejection = async () => {
    if (!rejectionReason.trim()) {
      toast({
        title: "Rejection Reason Required",
        description: "Please provide a reason for rejecting the order",
        variant: "destructive",
      });
      return;
    }

    try {
      // Submit rejection to API
      await apiRequest(`/api/orders/${id}/reject`, "POST", {
        rejectedBy: rejectionType,
        rejectionReason: rejectionReason.trim(),
        rejectionDate: new Date().toISOString(),
      });

      // Send notification to relevant parties
      await apiRequest(`/api/orders/${id}/rejection-notification`, "POST", {
        rejectedBy: rejectionType,
        rejectionReason: rejectionReason.trim(),
        technicalComments: orderData?.technicalComments || '',
        marketingComments: orderData?.marketingComments || '',
      });

      toast({
        title: "Order Rejected",
        description: "The order has been rejected and notifications have been sent",
      });

      // Refresh order data
      queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
      setShowRejectionModal(false);
      setRejectionReason("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reject order",
        variant: "destructive",
      });
    }
  };

  const handleSignature = (type: 'technical' | 'commercial' | 'marketing') => {
    let signature = '';
    let signerJobTitle = '';
    let signerMobile = '';
    let comments = '';
    
    if (type === 'technical') {
      signature = technicalSignature;
      signerJobTitle = technicalSignerJobTitle;
      signerMobile = technicalSignerMobile;
      comments = technicalComments;
    } else if (type === 'commercial') {
      signature = commercialSignature;
      signerJobTitle = commercialSignerJobTitle;
      signerMobile = commercialSignerMobile;
      comments = commercialComments;
    } else if (type === 'marketing') {
      signature = marketingSignature;
      signerJobTitle = marketingSignerJobTitle;
      signerMobile = marketingSignerMobile;
      comments = marketingComments;
    }

    if (!signature.trim() || !signerJobTitle.trim() || !signerMobile.trim()) {
      toast({
        title: "Missing Information",
        description: "Please enter your signature, job position, and mobile number",
        variant: "destructive",
      });
      return;
    }

    signOrderMutation.mutate({
      signatureType: type,
      signature: signature.trim(),
      signerJobTitle: signerJobTitle.trim(),
      signerMobile: signerMobile.trim(),
      comments: comments.trim(),
      signedAt: new Date().toISOString(),
    });

    if (type === 'technical') {
      setTechnicalSignature("");
      setTechnicalSignerJobTitle("");
      setTechnicalSignerMobile("");
      setTechnicalComments("");
    } else if (type === 'commercial') {
      setCommercialSignature("");
      setCommercialSignerJobTitle("");
      setCommercialSignerMobile("");
      setCommercialComments("");
    } else if (type === 'marketing') {
      setMarketingSignature("");
      setMarketingSignerJobTitle("");
      setMarketingSignerMobile("");
      setMarketingComments("");
    }
  };

  const copyShareableUrl = () => {
    navigator.clipboard.writeText(shareableUrl);
    toast({
      title: "Link Copied",
      description: "Shareable order form link copied to clipboard",
    });
  };

  const downloadPDF = async () => {
    if (!orderData) {
      toast({
        title: "Error",
        description: "Order data not available",
        variant: "destructive",
      });
      return;
    }

    try {
      // Calculate order summary values - matching Cart logic exactly
      const subtotal = orderData.items.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0);
      
      // Get discount amount using actual reciprocal percentages
      let reciprocalDiscountPercentage = 0;
      if (orderData.discountOptions && orderData.discountOptions.length > 0) {
        // Calculate total discount from actual percentages, capped at 23%
        reciprocalDiscountPercentage = Math.min(
          orderData.discountOptions.reduce((total: number, opt: any) => {
            // If opt is an object with discountPercent, use it; otherwise look it up
            if (opt.discountPercent !== undefined) {
              return total + opt.discountPercent;
            }
            // Fallback to looking up in discountOptions array
            const discountOption = discountOptions?.find((d: any) => d.id === opt);
            return total + (discountOption?.discountPercent || 0);
          }, 0),
          23
        );
      }
      
      // Add partner discount if available
      const partnerDiscountPercent = (orderData as any).partnerDiscountPercent || 0;
      
      // Add LinkedIn discount if available
      const linkedInDiscountAmount = (orderData as any).linkedInDiscountAmount || 0;
      
      // Calculate total discounts
      const percentageDiscountTotal = Math.min(reciprocalDiscountPercentage + partnerDiscountPercent, 35); // Cap at 35% for partner rates
      const percentageDiscountAmount = subtotal * (percentageDiscountTotal / 100);
      const discountAmount = percentageDiscountAmount + linkedInDiscountAmount;
      const subtotalAfterDiscount = subtotal - discountAmount;
      
      // Calculate service package cost
      let servicePackageCost = 0;
      if (orderData.servicePackage && serviceCareOptions && Array.isArray(serviceCareOptions)) {
        const serviceOption = serviceCareOptions.find((opt: any) => opt.title === orderData.servicePackage);
        if (serviceOption?.chargeable && serviceOption?.value) {
          const serviceRate = parseFloat(serviceOption.value.replace('%', ''));
          servicePackageCost = subtotalAfterDiscount * (serviceRate / 100);
        }
      }
      
      // Calculate delivery and installation charges based on ORIGINAL subtotal (before discounts)
      // This matches the Cart.tsx logic
      const deliveryRate = 0.096271916;
      
      // Get installation rate based on complexity
      const getInstallationRate = () => {
        switch (orderData.installationComplexity) {
          case 'simple':
            return 0.1148264;
          case 'standard':
            return 0.1938872;
          case 'complex':
            return 0.26289773;
          default:
            return 0.1938872; // Default to standard
        }
      };
      const installationRate = getInstallationRate();
      
      const deliveryCharge = subtotal * deliveryRate;  // Based on original subtotal
      const installationCharge = subtotal * installationRate;  // Based on original subtotal
      
      // Calculate grand total
      const grandTotal = subtotalAfterDiscount + servicePackageCost + deliveryCharge + installationCharge;
      
      // Prepare customer data
      const customer = orderData.isForUser && orderData.user ? {
        name: `${orderData.user.firstName || ''} ${orderData.user.lastName || ''}`.trim(),
        jobTitle: orderData.user.jobTitle,
        company: orderData.user.company,
        mobile: orderData.user.phone,
        email: orderData.user.email,
      } : {
        name: orderData.customerName,
        jobTitle: orderData.customerJobTitle,
        company: orderData.customerCompany,
        mobile: orderData.customerMobile,
        email: orderData.customerEmail,
      };
      
      // Prepare PDF data with complete user profile information
      const pdfData = {
        orderNumber: orderData.orderNumber,
        customerName: customer.name,
        customerJobTitle: customer.jobTitle,
        customerCompany: customer.company,
        customerMobile: customer.mobile,
        customerEmail: customer.email,
        orderDate: orderData.createdAt,
        items: orderData.items,
        servicePackage: orderData.servicePackage,
        discountOptions: orderData.discountOptions?.map((opt: any) => 
          Array.isArray(discountOptions) ? discountOptions.find((d: any) => d.id === opt)?.title || opt : opt
        ),
        // Pass full discount details for comprehensive display in PDF
        discountDetails: orderData.discountOptions?.filter((opt: any) => 
          typeof opt === 'object' && opt.id
        ),
        partnerDiscountCode: (orderData as any).partnerDiscountCode,
        partnerDiscountPercent: partnerDiscountPercent,
        partnerDiscountAmount: partnerDiscountPercent > 0 ? subtotal * (partnerDiscountPercent / 100) : 0,
        reciprocalDiscountAmount: reciprocalDiscountPercentage > 0 ? subtotal * (reciprocalDiscountPercentage / 100) : 0,
        linkedInDiscountAmount: linkedInDiscountAmount,
        linkedInDiscountData: (orderData as any).linkedInDiscountData,
        totalAmount: parseFloat(orderData.totalAmount),
        currency: orderData.currency, // Use the currency from order data
        technicalSignature: orderData.technicalSignature,
        commercialSignature: orderData.commercialSignature,
        impactCalculation: orderData.impactCalculation,
        layoutDrawings: orderLayoutDrawings, // Add layout drawings with markups
        subtotal,
        discountAmount,
        servicePackageCost,
        deliveryCharge,
        installationCharge,
        installationComplexity: orderData.installationComplexity || 'standard',
        grandTotal,
        // Pass complete user profile data including profile image
        user: userProfile ? {
          ...orderData.user,
          firstName: userProfile.firstName || orderData.user?.firstName,
          lastName: userProfile.lastName || orderData.user?.lastName,
          email: userProfile.email || orderData.user?.email,
          phone: userProfile.phone || orderData.user?.phone,
          jobTitle: userProfile.jobTitle || orderData.user?.jobTitle,
          company: userProfile.company || orderData.user?.company,
          department: userProfile.department || orderData.user?.department,
          profileImageUrl: userProfile.profileImageUrl || orderData.user?.profileImageUrl,
        } : orderData.user,
        isForUser: orderData.isForUser, // Pass isForUser flag
      };
      
      // Generate PDF with order-specific currency formatting
      const orderFormatPrice = (value: number) => {
        // Use order's currency, not the current context currency
        return formatPrice(value, orderData.currency);
      };
      await generateOrderFormPDF(pdfData, orderFormatPrice);
      
      toast({
        title: "PDF Downloaded",
        description: `Order form ${orderData.orderNumber} has been downloaded`,
      });
    } catch (error: any) {
      console.error("PDF generation error:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="h-8 bg-gray-200 rounded animate-pulse" />
          <div className="h-64 bg-gray-200 rounded animate-pulse" />
          <div className="h-32 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!orderData) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Order Form Not Found</h2>
            <p className="text-gray-600 dark:text-gray-400">The requested order form could not be found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const customer = orderData.isForUser ? orderData.user : {
    firstName: orderData.customerName?.split(' ')[0] || '',
    lastName: orderData.customerName?.split(' ').slice(1).join(' ') || '',
    email: orderData.customerEmail,
    company: orderData.customerCompany,
    phone: orderData.customerMobile,
    jobTitle: orderData.customerJobTitle,
  };

  // Check if form is editable (no signatures yet)
  const isFormEditable = !orderData?.technicalSignature?.signed && !orderData?.commercialSignature?.signed;

  // Full-screen image viewer functions
  const openFullScreen = (imageUrl: string) => {
    setFullScreenImage(imageUrl);
    setZoomLevel(1);
  };

  const closeFullScreen = () => {
    setFullScreenImage(null);
    setZoomLevel(1);
  };

  const zoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.25, 3));
  };

  const zoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
  };

  // Filter layout drawings to show only those associated with order items
  const orderLayoutDrawings = (layoutDrawings as any[])?.filter((drawing: any) => {
    return orderData?.items?.some(item => item.layoutDrawingId === drawing.id);
  }) || [];

  // Progress bar logic
  const getProgressStep = () => {
    const hasTechnicalSignature = orderData?.technicalSignature?.signed;
    const hasCommercialSignature = orderData?.commercialSignature?.signed;
    const status = orderData?.status;

    if (!hasTechnicalSignature || !hasCommercialSignature) {
      return 1; // Pending Signatures
    }

    switch (status) {
      case 'submitted_for_review':
      case 'processing':
        return 2; // Submitted for Processing
      case 'shipped':
        return 3; // Order Shipped
      case 'installation_in_progress':
        return 4; // Installation in Progress
      case 'fulfilled':
        return 5; // Order Fulfilled
      default:
        return 1; // Default to pending signatures
    }
  };

  const currentStep = getProgressStep();

  const progressSteps = [
    { 
      step: 1, 
      label: 'Pending Signatures', 
      icon: Clock,
      description: 'Awaiting technical and commercial approval'
    },
    { 
      step: 2, 
      label: 'Submitted for Processing', 
      icon: Send,
      description: 'Order submitted and under review'
    },
    { 
      step: 3, 
      label: 'Order Shipped', 
      icon: Truck,
      description: 'Products shipped and en route'
    },
    { 
      step: 4, 
      label: 'Installation in Progress', 
      icon: Cog,
      description: 'Installation team on-site'
    },
    { 
      step: 5, 
      label: 'Order Fulfilled', 
      icon: CheckCircle2,
      description: 'Installation complete and operational'
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Header with Shareable Link */}
        <Card>
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <img src="/asafe-logo.jpeg" alt="A-SAFE Logo" className="h-10" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900 dark:text-white">
              {customer.company && (
                <div className="text-xl text-gray-800 dark:text-gray-200 mb-1">
                  <Building className="h-5 w-5 inline mr-2" />
                  {customer.company}
                </div>
              )}
              {orderData.impactCalculation?.operatingZone && (
                <div className="text-lg text-gray-700 dark:text-gray-300 mb-1">
                  <MapPin className="h-4 w-4 inline mr-2" />
                  {orderData.impactCalculation.operatingZone}
                </div>
              )}
              {orderData.notes && (
                <div className="text-base text-gray-600 dark:text-gray-400 mb-2 font-normal">
                  <FileText className="h-4 w-4 inline mr-2" />
                  {orderData.notes}
                </div>
              )}
              <div className="text-lg text-yellow-600 dark:text-yellow-400 border-t border-gray-200 pt-2 mt-2">
                ORDER FORM
              </div>
            </CardTitle>

            {/* Progress Bar */}
            <div className="mt-6 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Order Progress</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">Step {currentStep} of 5</span>
              </div>
              
              {/* Progress Steps */}
              <div className="relative">
                {/* Progress Line */}
                <div className="absolute top-6 left-0 w-full h-0.5 bg-gray-200">
                  <div 
                    className="h-full bg-yellow-400 transition-all duration-500"
                    style={{ width: `${((currentStep - 1) / 4) * 100}%` }}
                  />
                </div>
                
                {/* Step Circles and Labels */}
                <div className="relative flex justify-between">
                  {progressSteps.map((progressStep) => {
                    const isCompleted = currentStep > progressStep.step;
                    const isCurrent = currentStep === progressStep.step;
                    const IconComponent = progressStep.icon;
                    
                    return (
                      <div key={progressStep.step} className="flex flex-col items-center">
                        <div 
                          className={`
                            flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all duration-300
                            ${isCompleted 
                              ? 'bg-green-100 border-green-500 text-green-600 dark:text-green-400' 
                              : isCurrent 
                                ? 'bg-yellow-100 border-yellow-400 text-yellow-600 dark:text-yellow-400'
                                : 'bg-gray-100 border-gray-300 text-gray-400'
                            }
                          `}
                        >
                          {isCompleted ? (
                            <CheckCircle className="w-6 h-6" />
                          ) : (
                            <IconComponent className="w-6 h-6" />
                          )}
                        </div>
                        <div className="mt-2 text-center max-w-24">
                          <div 
                            className={`
                              text-xs font-medium leading-tight
                              ${isCompleted || isCurrent ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}
                            `}
                          >
                            {progressStep.label}
                          </div>
                          {isCurrent && (
                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-tight">
                              {progressStep.description}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-4 gap-4">
              <div className="flex flex-col items-center sm:items-start gap-2 w-full sm:w-auto">
                <div className="flex flex-col gap-1">
                  <Badge variant="outline" className="text-base sm:text-lg px-3 sm:px-4 py-1 sm:py-2">
                    Order #{orderData.orderNumber}
                  </Badge>
                  {orderData.customOrderNumber && (
                    <Badge variant="secondary" className="text-sm px-3 py-1">
                      A-SAFE Ref: {orderData.customOrderNumber}
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 text-center sm:text-left">
                  Created: {new Date(orderData.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-center sm:justify-end w-full sm:w-auto">
                <Button onClick={() => setShowShareModal(true)} variant="outline" size="sm">
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
                <Button onClick={downloadPDF} variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
                <Button onClick={handleReviseOrder} variant="outline" size="sm" className="bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 border-blue-200 dark:border-blue-800">
                  <Edit3 className="h-4 w-4 mr-2" />
                  Revise Order
                </Button>
              </div>
            </div>
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <Label className="text-sm font-medium text-blue-800 dark:text-blue-300">Shareable Order Form URL:</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input 
                  value={shareableUrl} 
                  readOnly 
                  className="text-sm bg-white border-blue-200 dark:border-blue-800"
                />
                <Button onClick={copyShareableUrl} size="sm" variant="outline">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Customer Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Customer Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Company Logo Display */}
            {orderData.companyLogoUrl && (
              <div className="flex justify-center mb-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 max-w-[250px]">
                  <img 
                    src={orderData.companyLogoUrl} 
                    alt="Company Logo" 
                    className="max-h-20 object-contain"
                  />
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Customer Name</Label>
              <p className="text-lg font-medium">
                {customer.firstName} {customer.lastName}
              </p>
            </div>
            {customer.jobTitle && (
              <div>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Job Title</Label>
                <p className="text-lg">{customer.jobTitle}</p>
              </div>
            )}
            {customer.company && (
              <div>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Company</Label>
                <p className="text-lg flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  {customer.company}
                </p>
              </div>
            )}
            <div>
              <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</Label>
              <p className="text-lg flex items-center gap-2">
                <Mail className="h-4 w-4" />
                {customer.email}
              </p>
            </div>
            {customer.phone && (
              <div>
                <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Mobile</Label>
                <p className="text-lg flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  {customer.phone}
                </p>
              </div>
            )}
            <div>
              <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Order Date</Label>
              <p className="text-lg">
                {new Date(orderData.createdAt).toLocaleDateString()}
              </p>
            </div>
            </div>
          </CardContent>
        </Card>

        {/* Your A-SAFE Consultant */}
        {userProfile && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Your A-SAFE Consultant
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-6">
                {/* Profile Picture */}
                <div className="flex-shrink-0">
                  <div className="w-36 h-36 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 shadow-lg">
                    {userProfile.profileImageUrl ? (
                      <img 
                        src={userProfile.profileImageUrl} 
                        alt={`${userProfile.firstName} ${userProfile.lastName}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // If image fails to load, hide it and show fallback
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          // Show the fallback div
                          const fallback = target.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div 
                      className={`w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-700 ${userProfile.profileImageUrl ? 'hidden' : 'flex'}`}
                      style={{ display: userProfile.profileImageUrl ? 'none' : 'flex' }}
                    >
                      <User className="h-16 w-16 text-gray-400 dark:text-gray-500" />
                    </div>
                  </div>
                </div>
                
                {/* Consultant Information */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</Label>
                    <p className="text-lg font-medium">
                      {userProfile.firstName} {userProfile.lastName}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Job Title</Label>
                    <p className="text-lg">{userProfile.jobTitle || 'Sales Consultant'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Department</Label>
                    <p className="text-lg">{userProfile.department || 'Sales'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Company</Label>
                    <p className="text-lg flex items-center gap-2">
                      <Building className="h-4 w-4" />
                      {userProfile.company || 'A-SAFE Middle East'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</Label>
                    <p className="text-lg flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      {userProfile.email}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone</Label>
                    <p className="text-lg flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      {userProfile.phone || '+971 4884 2422'}
                    </p>
                  </div>
                  {userProfile.address && (
                    <div className="md:col-span-2">
                      <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Office Location</Label>
                      <p className="text-lg flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        {userProfile.address}, {userProfile.city}, {userProfile.country}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Impact Calculation Results */}
        {orderData.impactCalculation && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Impact Calculation Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Operating Zone</Label>
                  <p className="text-lg font-medium">{orderData.impactCalculation.operatingZone}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Impact Rating</Label>
                  <p className="text-lg font-medium">{orderData.impactCalculation.impactRating}J</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Speed</Label>
                  <p className="text-lg">{orderData.impactCalculation.speed} km/h</p>
                </div>
              </div>
              {orderData.impactCalculation.vehicleType && (
                <div>
                  <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Vehicle Type</Label>
                  <p className="text-lg">{orderData.impactCalculation.vehicleType}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Application Areas with Impact Calculations */}
        {orderData.applicationAreas && orderData.applicationAreas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Application Areas & Impact Calculations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {orderData.applicationAreas.map((area: any, index: number) => (
                  <div key={index} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                    <div className="mb-4">
                      <h4 className="font-semibold text-lg flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-yellow-600" />
                        {area.operatingZone || `Area ${index + 1}`}
                      </h4>
                      {area.operationalZoneImageUrl && (
                        <div className="mt-3">
                          <img 
                            src={area.operationalZoneImageUrl} 
                            alt={`Operational zone: ${area.operatingZone}`}
                            className="w-full max-w-md rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => window.open(area.operationalZoneImageUrl, '_blank')}
                          />
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                      <div>
                        <Label className="text-xs text-gray-600 dark:text-gray-400">Vehicle Type</Label>
                        <p className="font-medium">{area.vehicleType || 'Standard Vehicle'}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-600 dark:text-gray-400">Vehicle Mass</Label>
                        <p className="font-medium">{area.vehicleMass} kg</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-600 dark:text-gray-400">Load Mass</Label>
                        <p className="font-medium">{area.loadMass} kg</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-600 dark:text-gray-400">Speed</Label>
                        <p className="font-medium">{area.speed} {area.speedUnit}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-600 dark:text-gray-400">Impact Angle</Label>
                        <p className="font-medium">{area.impactAngle}°</p>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-600 dark:text-gray-400">Kinetic Energy</Label>
                        <p className="font-bold text-yellow-600">{area.kineticEnergy} Joules</p>
                      </div>
                    </div>
                    
                    {area.recommendedProducts && area.recommendedProducts.length > 0 && (
                      <div>
                        <Label className="text-sm font-medium mb-2 block">Recommended Products for this Area:</Label>
                        <div className="bg-white dark:bg-gray-900 rounded p-3 space-y-2">
                          {area.recommendedProducts.map((product: any, pIndex: number) => (
                            <div key={pIndex} className="flex items-center justify-between text-sm">
                              <span>{product.name || product}</span>
                              {product.quantity && (
                                <Badge variant="outline">Qty: {product.quantity}</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Layout Drawing with Markups and Legend */}
        {orderData.layoutDrawingId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Layout Drawing & Product Positioning
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Drawing Display */}
                <div className="relative bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                  <div className="aspect-video relative">
                    {/* This would be replaced with actual drawing component */}
                    <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                      <div className="text-center">
                        <Image className="h-12 w-12 mx-auto mb-2" />
                        <p>Layout drawing with marked product positions</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Markup Legend */}
                {orderData.layoutMarkups && orderData.layoutMarkups.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <Label className="font-semibold mb-3 block">Product Position Legend:</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {orderData.layoutMarkups.map((markup: any, index: number) => (
                        <div key={index} className="flex items-center gap-3">
                          <div 
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs"
                            style={{ backgroundColor: markup.color || '#FFC72C' }}
                          >
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{markup.productName}</p>
                            {markup.comment && (
                              <p className="text-xs text-gray-600 dark:text-gray-400">{markup.comment}</p>
                            )}
                            {markup.calculatedLength && (
                              <p className="text-xs text-gray-500">Length: {(markup.calculatedLength / 1000).toFixed(2)}m</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Uploaded Images Gallery */}
        {orderData.uploadedImages && orderData.uploadedImages.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Project Images
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {orderData.uploadedImages.map((image: any, index: number) => (
                  <div key={index} className="relative group">
                    <div className="aspect-square bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                      <img 
                        src={image.url} 
                        alt={image.caption || `Project image ${index + 1}`}
                        className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                        onClick={() => window.open(image.url, '_blank')}
                      />
                    </div>
                    {image.caption && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 text-center">{image.caption}</p>
                    )}
                    {image.area && (
                      <Badge variant="outline" className="absolute top-2 left-2 text-xs">
                        {image.area}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Product Items */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Order Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {orderData.items.map((item: any, index: number) => (
                <div key={index} className="border rounded-lg p-6 bg-white">
                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Product Image */}
                    <div className="flex-shrink-0 mx-auto md:mx-0">
                      <div className="w-32 h-32 bg-gray-100 rounded-lg border overflow-hidden">
                        {item.imageUrl ? (
                          <img 
                            src={item.imageUrl} 
                            alt={item.productName}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              target.nextElementSibling?.classList.remove('hidden');
                            }}
                          />
                        ) : null}
                        <div className={`w-full h-full flex items-center justify-center text-gray-400 ${item.imageUrl ? 'hidden' : ''}`}>
                          <div className="text-center">
                            <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                            <p className="text-xs text-gray-500 dark:text-gray-400">A-SAFE Product</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Product Details */}
                    <div className="flex-1 space-y-3 sm:space-y-4">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                        <h3 className="font-semibold text-xl text-gray-900 dark:text-white">{item.productName}</h3>
                        <Badge variant="outline" className="w-fit">{item.category}</Badge>
                      </div>
                      
                      {/* Product Specifications & Impact Test Results */}
                      <div className="space-y-3">
                        <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                          <Label className="text-gray-700 dark:text-gray-300 text-sm font-medium mb-2 block">Product Specifications:</Label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Impact Rating:</span>
                              <span className="font-medium text-yellow-600 dark:text-yellow-400 bg-yellow-100 px-2 py-1 rounded font-bold">
                                {item.impactRating ? `${item.impactRating.toLocaleString()}J` : 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Material:</span>
                              <span className="font-medium text-gray-900 dark:text-white">Memaplex™</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Category:</span>
                              <span className="font-medium text-gray-900 dark:text-white">{item.category?.replace('-', ' ').toUpperCase()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">Pricing Tier:</span>
                              <span className="font-medium text-gray-900 dark:text-white">{item.pricingTier}</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Impact Test Results */}
                        {item.calculationContext && (
                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <Label className="text-blue-800 dark:text-blue-300 text-sm font-medium mb-3 flex items-center gap-2 block">
                              <Zap className="h-4 w-4" />
                              Impact Test Results:
                            </Label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                              <div className="flex justify-between">
                                <span className="text-blue-600 dark:text-blue-400">Test Speed:</span>
                                <span className="font-medium text-blue-900 dark:text-blue-200">
                                  {item.calculationContext.speed} {item.calculationContext.speedUnit}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-blue-600 dark:text-blue-400">Vehicle Mass:</span>
                                <span className="font-medium text-blue-900 dark:text-blue-200">
                                  {typeof item.calculationContext.vehicleMass === 'string' 
                                    ? parseFloat(item.calculationContext.vehicleMass).toLocaleString() 
                                    : item.calculationContext.vehicleMass?.toLocaleString() || 'N/A'} kg
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-blue-600 dark:text-blue-400">Load Mass:</span>
                                <span className="font-medium text-blue-900 dark:text-blue-200">
                                  {typeof item.calculationContext.loadMass === 'string' 
                                    ? parseFloat(item.calculationContext.loadMass).toLocaleString() 
                                    : item.calculationContext.loadMass?.toLocaleString() || 'N/A'} kg
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-blue-600 dark:text-blue-400">Total Mass:</span>
                                <span className="font-medium text-blue-900 dark:text-blue-200">
                                  {item.calculationContext.totalMass?.toLocaleString() || 'N/A'} kg
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-blue-600 dark:text-blue-400">Kinetic Energy:</span>
                                <span className="font-medium text-blue-900 dark:text-blue-200">
                                  {item.calculationContext.kineticEnergy 
                                    ? Math.round(item.calculationContext.kineticEnergy).toLocaleString() 
                                    : 'N/A'} J
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-blue-600 dark:text-blue-400">Risk Level:</span>
                                <span className={`font-medium px-2 py-1 rounded text-xs ${
                                  item.calculationContext.riskLevel === 'High Risk' 
                                    ? 'bg-red-100 text-red-800' 
                                    : item.calculationContext.riskLevel === 'Medium Risk'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-green-100 text-green-800'
                                }`}>
                                  {item.calculationContext.riskLevel || 'Standard'}
                                </span>
                              </div>
                            </div>
                            
                            {/* Application Zone */}
                            {item.calculationContext.operatingZone && (
                              <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                                <div className="flex items-start gap-2">
                                  <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
                                  <div>
                                    <Label className="text-blue-800 dark:text-blue-300 text-xs font-medium">Application Zone:</Label>
                                    <p className="text-blue-700 text-sm mt-1">{item.calculationContext.operatingZone}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* Safety Compliance */}
                            <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                              <div className="flex items-center gap-2 text-xs text-blue-700">
                                <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                <span className="font-medium">Verified to exceed required impact rating by 20% safety margin</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Pricing Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <Label className="text-gray-600 dark:text-gray-400 text-sm">Quantity</Label>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {item.quantity} {item.pricingType === 'linear_meter' ? 'm' : 'units'}
                            </p>
                          </div>
                          <div className="flex justify-between">
                            <Label className="text-gray-600 dark:text-gray-400 text-sm">Unit Price</Label>
                            <p className="font-medium text-gray-900 dark:text-white">{formatPrice(item.unitPrice)}</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <Label className="text-gray-600 dark:text-gray-400 text-sm">Delivery</Label>
                            <div className="flex items-center gap-1">
                              {item.requiresDelivery && <Truck className="h-3 w-3 text-green-600 dark:text-green-400" />}
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {item.requiresDelivery ? 'Included' : 'Not required'}
                              </p>
                            </div>
                          </div>
                          <div className="flex justify-between items-center">
                            <Label className="text-gray-600 dark:text-gray-400 text-sm">Installation</Label>
                            <div className="flex items-center gap-1">
                              {item.requiresInstallation && <Wrench className="h-3 w-3 text-blue-600 dark:text-blue-400" />}
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {item.requiresInstallation ? 'Included' : 'Not required'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Application Area and Total */}
                      <div className="pt-3 border-t border-gray-200">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
                          <div className="flex-1">
                            {item.applicationArea && (
                              <div>
                                <Label className="text-gray-600 dark:text-gray-400 text-sm">Application Area:</Label>
                                <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">{item.applicationArea}</p>
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <Label className="text-gray-600 dark:text-gray-400 text-sm block">Item Total</Label>
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{formatPrice(item.totalPrice)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Layout Drawings */}
        {orderLayoutDrawings.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Layout Drawings
                {!isFormEditable && (
                  <Badge variant="outline" className="text-xs">
                    <Lock className="h-3 w-3 mr-1" />
                    Locked
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orderLayoutDrawings.map((drawing: any) => (
                  <div key={drawing.id} className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                    <div className="aspect-square bg-gray-100 rounded-lg mb-3 overflow-hidden relative group">
                      {drawing.fileType?.includes('image') ? (
                        <img 
                          src={drawing.fileUrl} 
                          alt={drawing.fileName}
                          className="w-full h-full object-cover cursor-pointer transition-transform group-hover:scale-105"
                          onClick={() => openFullScreen(drawing.fileUrl)}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 cursor-pointer"
                             onClick={() => openFullScreen(drawing.fileUrl)}>
                          <div className="text-center">
                            <FileText className="h-12 w-12 mx-auto mb-2" />
                            <p className="text-sm">PDF Drawing</p>
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Button
                          size="sm"
                          className="bg-white dark:bg-gray-800 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                          onClick={() => openFullScreen(drawing.fileUrl)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Full Size
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm truncate">{drawing.fileName}</h4>
                      {drawing.projectName && (
                        <p className="text-xs text-gray-600 dark:text-gray-400">Project: {drawing.projectName}</p>
                      )}
                      {drawing.location && (
                        <p className="text-xs text-gray-600 dark:text-gray-400">Location: {drawing.location}</p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Uploaded: {new Date(drawing.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Product Legend for Layout Drawings */}
              {orderData.items && orderData.items.length > 0 && (
                <div className="mt-6 border-t pt-6">
                  <h4 className="font-medium text-sm mb-4 flex items-center gap-2">
                    <List className="h-4 w-4" />
                    Product Legend
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {orderData.items.map((item: any, index: number) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="w-8 h-8 bg-yellow-400 rounded flex items-center justify-center text-xs font-bold">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{item.productName}</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Qty: {item.quantity} | {item.height}mm
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <Eye className="h-4 w-4 inline mr-1" />
                  Click on any drawing thumbnail to view in full screen with zoom capabilities.
                  {orderData.items && orderData.items.length > 0 && " Numbers on drawings correspond to the product legend above."}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Project Case Studies References */}
        {projectCaseStudies && projectCaseStudies.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Case Study References
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {projectCaseStudies.map((studyRef: any) => {
                  const study = studyRef.caseStudy;
                  return (
                    <div key={studyRef.id} className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="font-semibold text-lg mb-1">{study?.title}</h4>
                          {study?.company && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              <Building className="h-4 w-4 inline mr-1" />
                              {study.company}
                            </p>
                          )}
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                            {study?.description}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {study?.tags?.map((tag: string, index: number) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {study?.downloadUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(study.downloadUrl, '_blank')}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        )}
                      </div>
                      {studyRef.notes && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <Label className="text-sm font-medium text-gray-500 dark:text-gray-400">Reference Notes:</Label>
                          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{studyRef.notes}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Service Care Package - Enhanced with Full Breakdown */}
        {(orderData.serviceCareDetails || orderData.servicePackage) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Service Care Package
                {!isFormEditable && (
                  <Badge variant="outline" className="text-xs">
                    <Lock className="h-3 w-3 mr-1" />
                    Locked
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const selectedServiceOption = serviceCareOptions?.find(
                  (option: any) => option.id === (orderData.servicePackage.serviceOptionId || orderData.servicePackage.id)
                );
                
                return (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {(orderData.servicePackage.serviceOptionId || orderData.servicePackage.id) === "SERVICE_ENHANCED" && <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
                          {(orderData.servicePackage.serviceOptionId || orderData.servicePackage.id) === "SERVICE_ELITE" && <Star className="h-5 w-5 text-purple-600" />}
                          {(orderData.servicePackage.serviceOptionId || orderData.servicePackage.id) === "SERVICE_ESSENTIAL" && <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />}
                          <h3 className="font-medium text-lg">
                            {selectedServiceOption?.title || 'Enhanced Care'}
                          </h3>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 mb-3">
                          {selectedServiceOption?.description || 'Bi-annual maintenance, staff training, priority repairs, preferential parts pricing. Chargeable service package.'}
                        </p>
                        
                        {/* Service Features */}
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                          <Label className="text-blue-800 dark:text-blue-300 font-semibold mb-3 block">Included Features:</Label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {(orderData.servicePackage.serviceOptionId || orderData.servicePackage.id) === "SERVICE_ENHANCED" && (
                              <>
                                <div className="flex items-center gap-2 text-sm text-blue-700">
                                  <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                  <span>Bi-annual maintenance visits</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-blue-700">
                                  <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                  <span>Staff training sessions</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-blue-700">
                                  <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                  <span>Priority repair service</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-blue-700">
                                  <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                  <span>Preferential parts pricing</span>
                                </div>
                              </>
                            )}
                            {(orderData.servicePackage.serviceOptionId || orderData.servicePackage.id) === "SERVICE_ELITE" && (
                              <>
                                <div className="flex items-center gap-2 text-sm text-purple-700">
                                  <Star className="h-4 w-4 text-purple-600" />
                                  <span>Quarterly inspections</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-purple-700">
                                  <Star className="h-4 w-4 text-purple-600" />
                                  <span>Unlimited call-outs</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-purple-700">
                                  <Star className="h-4 w-4 text-purple-600" />
                                  <span>48-72h response time</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-purple-700">
                                  <Star className="h-4 w-4 text-purple-600" />
                                  <span>Extended warranty coverage</span>
                                </div>
                              </>
                            )}
                            {(orderData.servicePackage.serviceOptionId || orderData.servicePackage.id) === "SERVICE_ESSENTIAL" && (
                              <>
                                <div className="flex items-center gap-2 text-sm text-green-700">
                                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                                  <span>Annual inspection included</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-green-700">
                                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                                  <span>Basic technical support</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <Badge 
                        variant="secondary" 
                        className={`text-lg px-3 py-1 ${
                          selectedServiceOption?.value === "Free" 
                            ? "bg-green-100 text-green-800" 
                            : "bg-orange-100 text-orange-800"
                        }`}
                      >
                        {selectedServiceOption?.value || '5%'}
                      </Badge>
                    </div>
                  </div>
                );
              })()} 
            </CardContent>
          </Card>
        )}

        {/* Reciprocal Value Commitments - Enhanced with Explanation */}
        {(orderData.reciprocalCommitments || orderData.discountOptions) && (orderData.reciprocalCommitments?.commitments?.length > 0 || orderData.discountOptions?.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-yellow-600" />
                Reciprocal Value Commitments
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Partnership Explanation */}
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
                  {orderData.reciprocalCommitments?.explanationText || 
                   "At A-SAFE, we believe in creating partnerships that benefit both sides. That's why we offer added value through a reciprocal approach meaning if you share your safety successes, such as a testimonial, referrals, or a LinkedIn post, we can recognize your achievements, promote safer work practices, and celebrate your improvements while enhancing the overall value you receive on your project."}
                </p>
              </div>

              {/* Commitments List */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <Label className="font-semibold mb-3 block">Selected Commitments:</Label>
                <div className="space-y-3">
                  {(orderData.reciprocalCommitments?.commitments || orderData.discountOptions || []).map((selection: any, index: number) => {
                    // Handle both direct objects and ID references
                    const discount = selection.discountPercent !== undefined 
                      ? selection 
                      : discountOptions?.find((opt: any) => opt.id === (selection.discountOptionId || selection));
                    
                    return (
                      <div key={index} className="border-b border-yellow-200 dark:border-yellow-700 pb-2 last:border-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{discount?.title || 'Commitment'}</span>
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                            {discount?.discountPercent || 0}% Off
                          </Badge>
                        </div>
                        {discount?.description && (
                          <p className="text-xs text-gray-600 dark:text-gray-400">{discount.description}</p>
                        )}
                      </div>
                    );
                  })}
                  <Separator className="my-2" />
                  <div className="flex items-center justify-between font-medium text-lg">
                    <span>Total Reciprocal Value:</span>
                    <span className="text-green-600">
                      {orderData.reciprocalCommitments?.totalDiscountPercent || 
                       Math.min(
                        (orderData.discountOptions || []).reduce((total: number, sel: any) => {
                          if (sel.discountPercent !== undefined) {
                            return total + sel.discountPercent;
                          }
                          const discount = discountOptions?.find((opt: any) => opt.id === (sel.discountOptionId || sel));
                          return total + (discount?.discountPercent || 0);
                        }, 0),
                        23
                      )}% Savings
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Order Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Order Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Products Subtotal */}
              <div className="flex justify-between items-center">
                <Label className="text-gray-600 dark:text-gray-400">Subtotal:</Label>
                <p className="font-medium">
                  {formatPrice(orderData.items?.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0) || 0)}
                </p>
              </div>
              
              {/* Applied Discounts - Reciprocal Savings */}
              {orderData.discountOptions && orderData.discountOptions.length > 0 && (
                <>
                  {(() => {
                    const reciprocalDiscountPercent = Math.min(
                      orderData.discountOptions.reduce((total: number, sel: any) => {
                        // Handle both object format and ID format
                        if (sel.discountPercent !== undefined) {
                          return total + sel.discountPercent;
                        }
                        const discount = discountOptions?.find((opt: any) => opt.id === (sel.discountOptionId || sel));
                        return total + (discount?.discountPercent || 0);
                      }, 0),
                      23
                    );
                    const partnerDiscountPercent = (orderData as any).partnerDiscountPercent || 0;
                    const subtotal = orderData.items?.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0) || 0;
                    
                    return (
                      <>
                        {reciprocalDiscountPercent > 0 && (
                          <div className="flex justify-between items-center text-green-600">
                            <Label className="text-sm">Reciprocal Savings ({reciprocalDiscountPercent}%):</Label>
                            <p className="font-medium">-{formatPrice(subtotal * (reciprocalDiscountPercent / 100))}</p>
                          </div>
                        )}
                        {partnerDiscountPercent > 0 && (
                          <div className="flex justify-between items-center text-purple-600">
                            <Label className="text-sm">Partner Rate ({partnerDiscountPercent}%):</Label>
                            <p className="font-medium">-{formatPrice(subtotal * (partnerDiscountPercent / 100))}</p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  
                  {(() => {
                    const reciprocalDiscountPercent = Math.min(
                      orderData.discountOptions.reduce((total: number, sel: any) => {
                        if (sel.discountPercent !== undefined) {
                          return total + sel.discountPercent;
                        }
                        const discount = discountOptions?.find((opt: any) => opt.id === (sel.discountOptionId || sel));
                        return total + (discount?.discountPercent || 0);
                      }, 0),
                      23
                    );
                    const partnerDiscountPercent = (orderData as any).partnerDiscountPercent || 0;
                    const totalDiscountPercent = Math.min(reciprocalDiscountPercent + partnerDiscountPercent, 35);
                    const subtotal = orderData.items?.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0) || 0;
                    const discountAmount = subtotal * (totalDiscountPercent / 100);
                    const subtotalAfterDiscount = subtotal - discountAmount;
                    
                    return (
                      <div className="flex justify-between items-center font-medium">
                        <Label>Subtotal after savings:</Label>
                        <p>{formatPrice(subtotalAfterDiscount)}</p>
                      </div>
                    );
                  })()}
                </>
              )}
              
              {/* Delivery & Installation - based on original subtotal */}
              <div className="flex justify-between items-center text-gray-600 dark:text-gray-400">
                <Label className="text-sm">Delivery Charges:</Label>
                <p className="font-medium">
                  {(() => {
                    const subtotal = orderData.items?.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0) || 0;
                    return formatPrice(subtotal * 0.096271916);
                  })()}
                </p>
              </div>
              <div className="flex justify-between items-center text-gray-600 dark:text-gray-400">
                <Label className="text-sm">Installation Charges ({orderData.installationComplexity || 'standard'}):</Label>
                <p className="font-medium">
                  {(() => {
                    const subtotal = orderData.items?.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0) || 0;
                    const getInstallationRate = () => {
                      switch (orderData.installationComplexity) {
                        case 'simple':
                          return 0.1148264;
                        case 'standard':
                          return 0.1938872;
                        case 'complex':
                          return 0.26289773;
                        default:
                          return 0.1938872;
                      }
                    };
                    return formatPrice(subtotal * getInstallationRate());
                  })()}
                </p>
              </div>
              
              {/* Service Package */}
              {orderData.servicePackage && (
                <div className="flex justify-between items-center text-blue-600">
                  <Label className="text-sm">
                    {serviceCareOptions?.find((opt: any) => opt.id === (orderData.servicePackage.serviceOptionId || orderData.servicePackage.id))?.title || 'Service Package'}:
                  </Label>
                  <p className="font-medium">
                    {(() => {
                      const serviceOption = serviceCareOptions?.find((opt: any) => 
                        opt.id === (orderData.servicePackage.serviceOptionId || orderData.servicePackage.id)
                      );
                      if (!serviceOption?.chargeable) return formatPrice(0);
                      
                      const reciprocalDiscountPercent = Math.min(
                        orderData.discountOptions?.reduce((total: number, sel: any) => {
                          if (sel.discountPercent !== undefined) {
                            return total + sel.discountPercent;
                          }
                          const discount = discountOptions?.find((opt: any) => opt.id === (sel.discountOptionId || sel));
                          return total + (discount?.discountPercent || 0);
                        }, 0) || 0,
                        23
                      );
                      const partnerDiscountPercent = (orderData as any).partnerDiscountPercent || 0;
                      const totalDiscountPercent = Math.min(reciprocalDiscountPercent + partnerDiscountPercent, 35);
                      const subtotal = orderData.items?.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0) || 0;
                      const discountAmount = subtotal * (totalDiscountPercent / 100);
                      const subtotalAfterDiscount = subtotal - discountAmount;
                      
                      if (serviceOption?.value?.includes('%')) {
                        const rate = parseFloat(serviceOption.value.replace('%', ''));
                        return formatPrice(subtotalAfterDiscount * (rate / 100));
                      }
                      return formatPrice(0);
                    })()}
                  </p>
                </div>
              )}
              
              {/* Grand Total */}
              <Separator className="my-3" />
              <div className="flex justify-between items-center">
                <Label className="text-lg font-semibold">Grand Total (Ex. VAT):</Label>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {(() => {
                    const subtotal = orderData.items?.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0) || 0;
                    
                    // Calculate discount
                    const reciprocalDiscountPercent = Math.min(
                      orderData.discountOptions?.reduce((total: number, sel: any) => {
                        if (sel.discountPercent !== undefined) {
                          return total + sel.discountPercent;
                        }
                        const discount = discountOptions?.find((opt: any) => opt.id === (sel.discountOptionId || sel));
                        return total + (discount?.discountPercent || 0);
                      }, 0) || 0,
                      23
                    );
                    const partnerDiscountPercent = (orderData as any).partnerDiscountPercent || 0;
                    const totalDiscountPercent = Math.min(reciprocalDiscountPercent + partnerDiscountPercent, 35);
                    const discountAmount = subtotal * (totalDiscountPercent / 100);
                    const subtotalAfterDiscount = subtotal - discountAmount;
                    
                    // Delivery and installation based on original subtotal
                    const deliveryCharge = subtotal * 0.096271916;
                    const getInstallationRate = () => {
                      switch (orderData.installationComplexity) {
                        case 'simple':
                          return 0.1148264;
                        case 'standard':
                          return 0.1938872;
                        case 'complex':
                          return 0.26289773;
                        default:
                          return 0.1938872;
                      }
                    };
                    const installationCharge = subtotal * getInstallationRate();
                    
                    // Service package cost
                    let servicePackageCost = 0;
                    if (orderData.servicePackage) {
                      const serviceOption = serviceCareOptions?.find((opt: any) => 
                        opt.id === (orderData.servicePackage.serviceOptionId || orderData.servicePackage.id)
                      );
                      if (serviceOption?.chargeable && serviceOption?.value?.includes('%')) {
                        const rate = parseFloat(serviceOption.value.replace('%', ''));
                        servicePackageCost = subtotalAfterDiscount * (rate / 100);
                      }
                    }
                    
                    const grandTotal = subtotalAfterDiscount + deliveryCharge + installationCharge + servicePackageCost;
                    return formatPrice(grandTotal);
                  })()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Signature Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Signature className="h-5 w-5" />
              Customer Approval
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Technical Signature */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-medium flex items-center gap-2">
                    <PenTool className="h-4 w-4" />
                    Technical Approval
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    I confirm the technical specifications meet our requirements
                  </p>
                </div>
                {orderData.technicalSignature?.signed && (
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                )}
              </div>
              
              {orderData.technicalSignature?.signed ? (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-green-800 font-medium">Technical Approval Completed</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <Label className="text-green-700 font-medium">Signed by:</Label>
                        <p className="text-green-900 font-medium">{orderData.technicalSignature.signature}</p>
                      </div>
                      {orderData.technicalSignature.signerJobTitle && (
                        <div>
                          <Label className="text-green-700 font-medium">Job Position:</Label>
                          <p className="text-green-900">{orderData.technicalSignature.signerJobTitle}</p>
                        </div>
                      )}
                      {orderData.technicalSignature.signerMobile && (
                        <div>
                          <Label className="text-green-700 font-medium">Mobile Number:</Label>
                          <p className="text-green-900">{orderData.technicalSignature.signerMobile}</p>
                        </div>
                      )}
                      <div>
                        <Label className="text-green-700 font-medium">Date & Time:</Label>
                        <p className="text-green-900">{new Date(orderData.technicalSignature.signedAt).toLocaleString()}</p>
                      </div>
                    </div>
                    {orderData.technicalSignature.comments && (
                      <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-700">
                        <Label className="text-green-700 font-medium">Comments:</Label>
                        <p className="text-green-900 mt-1">{orderData.technicalSignature.comments}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="technical-signature">Your Signature</Label>
                    <Textarea
                      id="technical-signature"
                      value={technicalSignature}
                      onChange={(e) => setTechnicalSignature(e.target.value)}
                      placeholder="Type your full name to sign"
                      className="resize-none"
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <Label htmlFor="technical-job-title">Job Position</Label>
                      <Input
                        id="technical-job-title"
                        value={technicalSignerJobTitle}
                        onChange={(e) => setTechnicalSignerJobTitle(e.target.value)}
                        placeholder="Enter your job position"
                      />
                    </div>
                    <div>
                      <Label htmlFor="technical-mobile">Mobile Number</Label>
                      <Input
                        id="technical-mobile"
                        value={technicalSignerMobile}
                        onChange={(e) => setTechnicalSignerMobile(e.target.value)}
                        placeholder="Enter your mobile number"
                        type="tel"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="technical-comments">Comments (Optional)</Label>
                    <Textarea
                      id="technical-comments"
                      value={technicalComments}
                      onChange={(e) => setTechnicalComments(e.target.value)}
                      placeholder="Add any technical notes or comments"
                      className="resize-none"
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => handleSignature('technical')}
                      disabled={!technicalSignature.trim() || !technicalSignerJobTitle.trim() || !technicalSignerMobile.trim() || signOrderMutation.isPending}
                      className="flex-1"
                    >
                      Sign Technical Approval
                    </Button>
                    <Button 
                      onClick={() => {
                        setRejectionType('technical');
                        setShowRejectionModal(true);
                      }}
                      variant="destructive"
                      className="flex-1"
                    >
                      Reject Order
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Marketing Approval - Only shown if discounts are selected */}
            {orderData.discountOptions && orderData.discountOptions.length > 0 && (
              <div className="border rounded-lg p-4 bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-medium flex items-center gap-2">
                      <Percent className="h-4 w-4" />
                      Marketing Approval
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Marketing approval required for value commitments
                    </p>
                  </div>
                  {orderData.marketingSignature?.signed && (
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  )}
                </div>
                
                {orderData.marketingSignature?.signed ? (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <span className="text-green-800 font-medium">Marketing Approval Completed</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <Label className="text-green-700 font-medium">Signed by:</Label>
                          <p className="text-green-900 font-medium">{orderData.marketingSignature.signature}</p>
                        </div>
                        {orderData.marketingSignature.signerJobTitle && (
                          <div>
                            <Label className="text-green-700 font-medium">Job Position:</Label>
                            <p className="text-green-900">{orderData.marketingSignature.signerJobTitle}</p>
                          </div>
                        )}
                        {orderData.marketingSignature.signerMobile && (
                          <div>
                            <Label className="text-green-700 font-medium">Mobile Number:</Label>
                            <p className="text-green-900">{orderData.marketingSignature.signerMobile}</p>
                          </div>
                        )}
                        <div>
                          <Label className="text-green-700 font-medium">Date & Time:</Label>
                          <p className="text-green-900">{new Date(orderData.marketingSignature.signedAt).toLocaleString()}</p>
                        </div>
                      </div>
                      {orderData.marketingSignature.comments && (
                        <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-700">
                          <Label className="text-green-700 font-medium">Comments:</Label>
                          <p className="text-green-900 mt-1">{orderData.marketingSignature.comments}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="marketing-signature">Your Signature</Label>
                      <Textarea
                        id="marketing-signature"
                        value={marketingSignature}
                        onChange={(e) => setMarketingSignature(e.target.value)}
                        placeholder="Type your full name to sign"
                        className="resize-none"
                        rows={2}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <Label htmlFor="marketing-job-title">Job Position</Label>
                        <Input
                          id="marketing-job-title"
                          value={marketingSignerJobTitle}
                          onChange={(e) => setMarketingSignerJobTitle(e.target.value)}
                          placeholder="Enter your job position"
                        />
                      </div>
                      <div>
                        <Label htmlFor="marketing-mobile">Mobile Number</Label>
                        <Input
                          id="marketing-mobile"
                          value={marketingSignerMobile}
                          onChange={(e) => setMarketingSignerMobile(e.target.value)}
                          placeholder="Enter your mobile number"
                          type="tel"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="marketing-comments">Comments (Optional)</Label>
                      <Textarea
                        id="marketing-comments"
                        value={marketingComments}
                        onChange={(e) => setMarketingComments(e.target.value)}
                        placeholder="Add any marketing notes or comments about the value commitments"
                        className="resize-none"
                        rows={3}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        onClick={() => handleSignature('marketing')}
                        disabled={!marketingSignature.trim() || !marketingSignerJobTitle.trim() || !marketingSignerMobile.trim() || signOrderMutation.isPending}
                        className="flex-1"
                      >
                        Sign Marketing Approval
                      </Button>
                      <Button 
                        onClick={() => {
                          setRejectionType('marketing');
                          setShowRejectionModal(true);
                        }}
                        variant="destructive"
                        className="flex-1"
                      >
                        Reject Order
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Commercial Signature */}
            <div className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-medium flex items-center gap-2">
                    <Crown className="h-4 w-4" />
                    Commercial Approval
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    I approve the commercial terms and pricing
                  </p>
                </div>
                {orderData.commercialSignature?.signed && (
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                )}
              </div>
              
              {orderData.commercialSignature?.signed ? (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-green-800 font-medium">Commercial Approval Completed</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <Label className="text-green-700 font-medium">Signed by:</Label>
                        <p className="text-green-900 font-medium">{orderData.commercialSignature.signature}</p>
                      </div>
                      {orderData.commercialSignature.signerJobTitle && (
                        <div>
                          <Label className="text-green-700 font-medium">Job Position:</Label>
                          <p className="text-green-900">{orderData.commercialSignature.signerJobTitle}</p>
                        </div>
                      )}
                      {orderData.commercialSignature.signerMobile && (
                        <div>
                          <Label className="text-green-700 font-medium">Mobile Number:</Label>
                          <p className="text-green-900">{orderData.commercialSignature.signerMobile}</p>
                        </div>
                      )}
                      <div>
                        <Label className="text-green-700 font-medium">Date & Time:</Label>
                        <p className="text-green-900">{new Date(orderData.commercialSignature.signedAt).toLocaleString()}</p>
                      </div>
                    </div>
                    {orderData.commercialSignature.comments && (
                      <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-700">
                        <Label className="text-green-700 font-medium">Comments:</Label>
                        <p className="text-green-900 mt-1">{orderData.commercialSignature.comments}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="commercial-signature">Your Signature</Label>
                    <Textarea
                      id="commercial-signature"
                      value={commercialSignature}
                      onChange={(e) => setCommercialSignature(e.target.value)}
                      placeholder="Type your full name to sign"
                      className="resize-none"
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <Label htmlFor="commercial-job-title">Job Position</Label>
                      <Input
                        id="commercial-job-title"
                        value={commercialSignerJobTitle}
                        onChange={(e) => setCommercialSignerJobTitle(e.target.value)}
                        placeholder="Enter your job position"
                      />
                    </div>
                    <div>
                      <Label htmlFor="commercial-mobile">Mobile Number</Label>
                      <Input
                        id="commercial-mobile"
                        value={commercialSignerMobile}
                        onChange={(e) => setCommercialSignerMobile(e.target.value)}
                        placeholder="Enter your mobile number"
                        type="tel"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="commercial-comments">Comments (Optional)</Label>
                    <Textarea
                      id="commercial-comments"
                      value={commercialComments}
                      onChange={(e) => setCommercialComments(e.target.value)}
                      placeholder="Add any commercial notes or comments"
                      className="resize-none"
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => handleSignature('commercial')}
                      disabled={!commercialSignature.trim() || !commercialSignerJobTitle.trim() || !commercialSignerMobile.trim() || signOrderMutation.isPending}
                      className="flex-1"
                    >
                      Sign Commercial Approval
                    </Button>
                    <Button 
                      onClick={() => {
                        setRejectionType('commercial');
                        setShowRejectionModal(true);
                      }}
                      variant="destructive"
                      className="flex-1"
                    >
                      Reject Order
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* A-SAFE Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              A-SAFE Middle East Contact
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <div>
                  <p className="font-medium">Dubai Office</p>
                  <p>Office 220, Dubai South Business Park, Dubai, UAE</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <div>
                  <p className="font-medium">Phone</p>
                  <p>+971 4884 2422</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <div>
                  <p className="font-medium">Email</p>
                  <p>support@asafe.ae</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                <div>
                  <p className="font-medium">5.0 ⭐ Written Testimonials</p>
                  <a 
                    href="https://maps.app.goo.gl/55wf4FPkAe2NfKDHA?g_st=ipc" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    View on Google Maps
                  </a>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <Card>
          <CardContent className="text-center py-6 text-gray-500 dark:text-gray-400">
            <div className="flex items-center justify-center gap-2 mb-2">
              <img src="/asafe-logo.jpeg" alt="A-SAFE Logo" className="h-6" />
              <p className="font-medium">A-SAFE ENGAGE Portal</p>
            </div>
            <p className="text-sm">This order form was generated on {new Date().toLocaleDateString()}</p>
            <p className="text-sm">For inquiries, please contact your A-SAFE representative</p>
          </CardContent>
        </Card>
      </div>

      {/* Full-Screen Image Viewer Dialog */}
      <Dialog open={!!fullScreenImage} onOpenChange={closeFullScreen}>
        <DialogContent className="max-w-[95vw] w-full max-h-[95vh] overflow-hidden p-2">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Layout Drawing - Full Screen View
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={zoomOut}
                  disabled={zoomLevel <= 0.5}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm font-mono px-2">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={zoomIn}
                  disabled={zoomLevel >= 3}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-gray-100 rounded-lg p-4 min-h-[70vh]">
            {fullScreenImage && (
              <div 
                className="w-full h-full flex items-center justify-center"
                style={{ 
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: 'center',
                  transition: 'transform 0.2s ease'
                }}
              >
                {fullScreenImage.includes('.pdf') ? (
                  <div className="text-center">
                    <FileText className="h-20 w-20 mx-auto mb-4 text-gray-400" />
                    <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">PDF Document</p>
                    <Button 
                      onClick={() => window.open(fullScreenImage, '_blank')}
                      className="flex items-center gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      Open PDF in New Tab
                    </Button>
                  </div>
                ) : (
                  <img 
                    src={fullScreenImage} 
                    alt="Layout Drawing Full View"
                    className="max-w-full max-h-full object-contain"
                    style={{ 
                      maxWidth: 'none',
                      maxHeight: 'none',
                      width: 'auto',
                      height: 'auto'
                    }}
                  />
                )}
              </div>
            )}
          </div>
          <div className="pt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            <p className="flex items-center justify-center gap-2">
              <ZoomIn className="h-4 w-4" />
              Use zoom controls above to get a closer look at marking details
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rejection Modal */}
      <Dialog open={showRejectionModal} onOpenChange={setShowRejectionModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <X className="h-5 w-5 text-red-600" />
              Reject Order
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2">
                Rejecting as: <span className="font-bold capitalize">{rejectionType} Approver</span>
              </Label>
            </div>
            <div>
              <Label htmlFor="rejection-reason">Rejection Reason (Required)</Label>
              <Textarea
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Please provide a detailed reason for rejecting this order..."
                className="resize-none"
                rows={5}
              />
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                This action will:
              </p>
              <ul className="text-sm text-yellow-700 dark:text-yellow-300 mt-2 space-y-1">
                <li>• Notify all previous approvers via email</li>
                <li>• Send WhatsApp message to the A-SAFE consultant</li>
                <li>• Include the rejection reason in all notifications</li>
                <li>• Mark the order as rejected in the system</li>
              </ul>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => {
                  setShowRejectionModal(false);
                  setRejectionReason("");
                }}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleRejection}
                variant="destructive"
                disabled={!rejectionReason.trim()}
                className="flex-1"
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Order Modal */}
      <ShareOrderModal
        open={showShareModal}
        onOpenChange={setShowShareModal}
        orderNumber={orderData.orderNumber}
        customOrderNumber={orderData.customOrderNumber}
        orderUrl={shareableUrl}
        customerName={customer.firstName + ' ' + customer.lastName}
        customerEmail={customer.email}
        customerMobile={customer.phone}
      />
    </div>
  );
}