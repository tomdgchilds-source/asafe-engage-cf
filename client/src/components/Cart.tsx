import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Minus, ShoppingCart, MapPin, Wrench, Shield, Settings, Calculator, Gift, Calendar, Star, Building, AlertCircle, CheckCircle2, Check, X, Search, Headphones, GraduationCap, ShieldCheck, Clock, DollarSign, Info, FileText, ExternalLink, ChevronDown, ChevronUp, ArrowRight, Save, FolderOpen, Download, Video } from "lucide-react";
import { useAutoMinimize } from "@/hooks/useAutoMinimize";
import { CartItem } from "@/components/CartItem";
import { CartItemMobile } from "@/components/CartItemMobile";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EnhancedQuoteRequestModal } from "@/components/EnhancedQuoteRequestModal";
import { DiscountModal } from "@/components/DiscountModal";
import { DiscountTermsModal } from "@/components/DiscountTermsModal";
import { SpendMoreSaveMoreDiscount } from "@/components/SpendMoreSaveMoreDiscount";
import { ServiceCareModal } from "@/components/ServiceCareModal";
import { CreateOrderModal } from "@/components/CreateOrderModal";
import { LayoutDrawingUpload } from "@/components/LayoutDrawingUpload";
import { LayoutMarkupEditor } from "@/components/LayoutMarkupEditor";
import { CaseStudySelector } from "@/components/CaseStudySelector";
import { CompanyLogoFinder } from "@/components/CompanyLogoFinder";
import { LinkedInSocialReciprocitySimple } from "@/components/LinkedInSocialReciprocitySimple";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { useCurrency } from "@/contexts/CurrencyContext";
import type { Product, LayoutDrawing, CaseStudy, ProjectCaseStudy } from "@shared/schema";
import { Link } from "wouter";

interface CartItemType {
  id: string;
  productName: string;
  quantity: number;
  pricingType: string;
  unitPrice: number;
  totalPrice: number;
  pricingTier?: string;
  notes?: string;
  applicationArea?: string;
  requiresDelivery?: boolean;
  deliveryAddress?: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  requiresInstallation?: boolean;
  category?: string;
  impactRating?: number;
  impactCalculationId?: string;
  calculationContext?: {
    operatingZone?: string;
    vehicleMass: number | string;
    loadMass: number | string;
    speed: number | string;
    speedUnit: string;
    kineticEnergy: number;
    riskLevel: string;
  };
}

interface CartResponse {
  items: CartItemType[];
  totalAmount: number;
  itemCount: number;
  serviceSelection: string | null;
  currency: string;
  exchangeRate: number;
  originalCurrency: string;
  originalTotalAmount: number;
  serviceCarePrice: number;
  deliveryPrice: number;
  installationPrice: number;
  discountAmount: number;
  vatAmount: number;
  finalAmount: number;
  userDiscountSelections?: {
    discountType: 'commitment' | 'quantity' | 'partnership' | 'seasonal';
    percentage: number;
    appliedAmount: number;
    description: string;
    metadata?: {
      commitmentDuration?: number;
      validUntil?: string;
      minimumQuantity?: number;
      minOrder?: number;
    };
  }[];
  hasDelivery: boolean;
  hasInstallation: boolean;
}

export function Cart() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const haptic = useHapticFeedback();
  const { convertPrice, formatPrice, selectedCurrency } = useCurrency();

  // Auto-minimize states for main sections
  const autoMinimize = useAutoMinimize(true);

  // Local state
  const [editingQuantity, setEditingQuantity] = useState<{ [key: string]: number }>({});
  const [company, setCompany] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [location, setLocation] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [serviceCareModalOpen, setServiceCareModalOpen] = useState(false);
  const [createOrderModalOpen, setCreateOrderModalOpen] = useState(false);
  const [isServiceCareExpanded, setIsServiceCareExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // Update mobile state on resize
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [selectedLayoutDrawing, setSelectedLayoutDrawing] = useState<LayoutDrawing | null>(null);
  const [isMarkupEditorOpen, setIsMarkupEditorOpen] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [selectedDiscountType, setSelectedDiscountType] = useState<'commitment' | 'quantity' | 'partnership' | 'seasonal'>('commitment');
  const [saveDraftModalOpen, setSaveDraftModalOpen] = useState(false);
  const [draftNameInput, setDraftNameInput] = useState('');
  const [isCaseStudySelectorOpen, setIsCaseStudySelectorOpen] = useState(false);
  const [selectedCaseStudyIds, setSelectedCaseStudyIds] = useState<string[]>([]);
  const [partnerDiscountCode, setPartnerDiscountCode] = useState('');
  const [partnerDiscountPercent, setPartnerDiscountPercent] = useState(0);
  const [partnerDiscountError, setPartnerDiscountError] = useState('');
  const [installationComplexity, setInstallationComplexity] = useState<'simple' | 'standard' | 'complex'>('standard');
  const [linkedInDiscountAmount, setLinkedInDiscountAmount] = useState(0);
  const [linkedInDiscountData, setLinkedInDiscountData] = useState<any>(null);
  
  // Ref to track auto-save timeout
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch cart data
  const { data: cartData, isLoading } = useQuery<CartItemType[]>({
    queryKey: ['/api/cart'],
    enabled: !!user
  });

  // Fetch products data for details
  const { data: products } = useQuery<Product[]>({
    queryKey: ['/api/products'],
    enabled: !!user
  });

  // Fetch case studies for reference
  const { data: caseStudies = [] } = useQuery<CaseStudy[]>({
    queryKey: ['/api/case-studies'],
    enabled: !!user
  });

  // Fetch user's selected project case studies
  const { data: projectCaseStudies = [] } = useQuery<ProjectCaseStudy[]>({
    queryKey: ['/api/project-case-studies'],
    enabled: !!user
  });

  // Fetch cart project information
  const { data: projectInfo } = useQuery<{company?: string; location?: string; projectDescription?: string}>({
    queryKey: ['/api/cart-project-info'],
    enabled: !!user
  });


  // Load saved project information when data is available
  useEffect(() => {
    if (projectInfo) {
      setCompany(projectInfo.company || '');
      setLocation(projectInfo.location || '');
      setProjectDescription(projectInfo.projectDescription || '');
    }
  }, [projectInfo]);

  // Load saved case study selections
  useEffect(() => {
    if (projectCaseStudies && projectCaseStudies.length > 0) {
      setSelectedCaseStudyIds(projectCaseStudies.map(pcs => pcs.caseStudyId));
    }
  }, [projectCaseStudies]);

  // Auto-populate draft name when modal opens
  useEffect(() => {
    if (saveDraftModalOpen) {
      const parts = [];
      
      // Add company name
      if (company?.trim()) {
        parts.push(company.trim());
      }
      
      // Add location
      if (location?.trim()) {
        parts.push(location.trim());
      }
      
      // Add project description
      if (projectDescription?.trim()) {
        parts.push(projectDescription.trim());
      }
      
      // Add date in format M/D/YYYY (no leading zeros)
      const now = new Date();
      const dateStamp = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
      
      // Join with underscores and add date
      const generatedName = parts.length > 0 
        ? `${parts.join('_')}_${dateStamp}`
        : `Draft Project ${dateStamp}`;
      
      setDraftNameInput(generatedName);
    }
  }, [saveDraftModalOpen, company, location, projectDescription]);
  
  // Clean up autosave timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Auto-save project information mutation
  const saveProjectInfoMutation = useMutation({
    mutationFn: async (data: { company?: string; location?: string; projectDescription?: string }) => {
      return apiRequest('/api/cart-project-info', 'POST', data);
    },
    onError: (error) => {
      console.error("Failed to save project information:", error);
    }
  });

  // Auto-save functions with debouncing
  const autoSaveProjectInfo = (field: string, value: string) => {
    // Clear any existing timeout to prevent multiple saves
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    const data = {
      company: field === 'company' ? value : company,
      location: field === 'location' ? value : location,
      projectDescription: field === 'projectDescription' ? value : projectDescription,
    };
    
    // Debounce the save operation
    autoSaveTimeoutRef.current = setTimeout(() => {
      saveProjectInfoMutation.mutate(data);
      autoSaveTimeoutRef.current = null;
    }, 500);
  };

  // Case study selection mutation
  const updateCaseStudySelectionMutation = useMutation({
    mutationFn: async (caseStudyIds: string[]) => {
      return apiRequest('/api/project-case-studies', 'POST', { caseStudyIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/project-case-studies'] });
      toast({
        title: "Case Studies Updated",
        description: "Your case study references have been saved"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update case study selections",
        variant: "destructive"
      });
    }
  });

  // Draft project mutation
  const saveDraftMutation = useMutation({
    mutationFn: async (data: { projectName: string; description?: string }) => {
      return apiRequest('/api/draft-projects', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/draft-projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      toast({
        title: "Draft Saved",
        description: "Your cart has been saved as a draft project and cleared"
      });
      setSaveDraftModalOpen(false);
      setDraftNameInput('');
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save draft project",
        variant: "destructive"
      });
    }
  });


  // Cart mutations with optimistic updates for instant feedback
  const updateItemMutation = useMutation({
    mutationFn: async (updates: { id: string; quantity?: number; referenceImages?: string[]; [key: string]: any }) => {
      return apiRequest('/api/cart/items', 'PATCH', updates);
    },
    onMutate: async (updates) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['/api/cart'] });
      
      // Snapshot the previous value
      const previousCart = queryClient.getQueryData(['/api/cart']);
      
      // Optimistically update to the new value
      queryClient.setQueryData(['/api/cart'], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((item: any) => {
          if (item.id === updates.id) {
            // Handle quantity updates with price recalculation
            if (updates.quantity !== undefined) {
              const newTotalPrice = item.unitPrice * updates.quantity;
              return { ...item, ...updates, totalPrice: newTotalPrice };
            }
            // Handle other updates (like referenceImages) without price changes
            return { ...item, ...updates };
          }
          return item;
        });
      });
      
      // Return context with snapshot for potential rollback
      return { previousCart };
    },
    onError: (err, variables, context) => {
      // If mutation fails, rollback to previous state
      if (context?.previousCart) {
        queryClient.setQueryData(['/api/cart'], context.previousCart);
      }
      
      // Only show error toast if it's a genuine error, not a pricing recalculation
      const errorMessage = err?.message || '';
      if (!errorMessage.includes('price') && !errorMessage.includes('calculation')) {
        toast({
          title: "Error",
          description: "Failed to update item quantity",
          variant: "destructive"
        });
      }
    },
    onSettled: () => {
      // Always refetch after error or success to sync with server
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      haptic.light();
    }
  });

  const removeItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/cart/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      haptic.medium();
      toast({
        title: "Item Removed",
        description: "Item has been removed from your cart"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove item",
        variant: "destructive"
      });
    }
  });

  const clearCartMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/cart', 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      haptic.heavy();
      toast({
        title: "Cart Cleared",
        description: "All items have been removed from your cart"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clear cart",
        variant: "destructive"
      });
    }
  });

  // Helper functions
  const cartItems = Array.isArray(cartData) ? cartData : [];
  const totalAmount = cartItems.reduce((sum: number, item: any) => sum + (item.totalPrice || 0), 0);
  // Fetch user's current service selection
  const { data: userServiceSelectionData } = useQuery<{serviceOptionId: string}>({
    queryKey: ["/api/user-service-selection"],
    enabled: !!user,
  });
  
  // LinkedIn discount data is managed by LinkedInSocialReciprocity component
  // No need to fetch it separately here

  // Fetch service care options to get details
  const { data: serviceOptions = [] } = useQuery<Array<{id: string, title: string, value: string, chargeable: boolean}>>({
    queryKey: ["/api/service-care-options"],
    enabled: !!user,
  });

  // Fetch user discount selections
  const { data: userDiscountSelectionsData = [] } = useQuery<Array<{
    id: string;
    discountOptionId: string;
    isSelected: boolean;
  }>>({
    queryKey: ["/api/user-discount-selections"],
    enabled: !!user,
  });

  // Fetch discount options to get details
  const { data: discountOptions = [] } = useQuery<Array<{
    id: string;
    title: string;
    discountPercent: number;
    category: string;
  }>>({
    queryKey: ["/api/discount-options"],
    enabled: !!user,
  });

  // Get the selected service details - default to Essential if none selected
  const selectedServiceOption = userServiceSelectionData?.serviceOptionId 
    ? serviceOptions.find((opt: any) => opt.id === userServiceSelectionData.serviceOptionId)
    : serviceOptions.find((opt: any) => opt.id === 'SERVICE_ESSENTIAL');
  const userServiceSelectionTitle = selectedServiceOption?.title || 'Essential Care';
  // Keep the full selection object for CreateOrderModal
  const userServiceSelection = userServiceSelectionData || { serviceOptionId: 'SERVICE_ESSENTIAL' };
  
  // Calculate service package cost
  const servicePackageRate = selectedServiceOption?.chargeable && selectedServiceOption?.value 
    ? parseFloat(selectedServiceOption.value.replace('%', '')) 
    : 0;
  const servicePackageCost = totalAmount * (servicePackageRate / 100);
  
  // Get selected discounts
  const selectedDiscounts = userDiscountSelectionsData
    .filter(selection => selection.isSelected)
    .map(selection => {
      const option = discountOptions.find(opt => opt.id === selection.discountOptionId);
      return option;
    })
    .filter(Boolean);
  
  const totalDiscountPercent = selectedDiscounts.reduce((sum, discount) => sum + (discount?.discountPercent || 0), 0);
  
  // Include partner discount in total discount calculation
  const combinedDiscountPercent = totalDiscountPercent + partnerDiscountPercent;
  const effectiveDiscountPercent = Math.min(combinedDiscountPercent, 35); // Cap at 35% for partner rates
  // Calculate discount amount including LinkedIn discount
  const percentageDiscount = totalAmount * (effectiveDiscountPercent / 100);
  const discountAmount = percentageDiscount + linkedInDiscountAmount;
  const userDiscountSelections = selectedDiscounts;
  
  // Calculate all charges and totals
  const deliveryCharge = totalAmount * 0.096271916; // 9.6271916% of subtotal
  
  // Calculate installation charge based on complexity
  const getInstallationRate = () => {
    switch (installationComplexity) {
      case 'simple':
        return 0.1148264; // 11.48264% for simple
      case 'standard':
        return 0.1938872; // 19.38872% for standard
      case 'complex':
        return 0.26289773; // 26.289773% for complex
      default:
        return 0.1938872; // Default to standard
    }
  };
  const installationCharge = totalAmount * getInstallationRate();
  const subtotalAfterDiscount = totalAmount - discountAmount;
  const grandTotalExVat = subtotalAfterDiscount + deliveryCharge + installationCharge + servicePackageCost;

  const getProductImage = (productName: string): string | null => {
    // First try exact match
    let product = products?.find(p => p.name === productName);
    
    // If no exact match, try to find partial matches for products with variations
    if (!product && products) {
      // Handle bollard variations (e.g., "Bollard, Grey - 210 OD x 1200 mm" -> "Bollard, Grey")
      if (productName.includes("Bollard")) {
        if (productName.includes("Grey")) {
          product = products.find(p => p.name === "Bollard, Grey");
        } else if (productName.includes("Yellow")) {
          product = products.find(p => p.name === "Bollard, Yellow");
        } else if (productName.includes("Monoplex")) {
          product = products.find(p => p.name === "Monoplex Bollard");
        }
      }
      
      // Handle eFlex variations
      if (!product && productName.includes("eFlex")) {
        if (productName.includes("Double Rack")) {
          product = products.find(p => p.name === "eFlex Double Rack End Barrier");
        } else if (productName.includes("Single Rack")) {
          product = products.find(p => p.name === "eFlex Single Rack End Barrier");
        } else if (productName.includes("Pedestrian")) {
          product = products.find(p => p.name === "eFlex Pedestrian Barrier 3 Rail");
        } else if (productName.includes("Single Traffic")) {
          if (productName.includes("Plus")) {
            product = products.find(p => p.name === "eFlex Single Traffic Barrier Plus");
          } else {
            product = products.find(p => p.name === "eFlex Single Traffic Barrier");
          }
        }
      }
      
      // Handle other product variations
      if (!product) {
        // Try to match the base product name by removing specifications
        const baseProductName = productName.split(' - ')[0].split(' – ')[0].trim();
        product = products.find(p => 
          p.name === baseProductName || 
          p.name.startsWith(baseProductName) ||
          baseProductName.startsWith(p.name)
        );
      }
    }
    
    // Primary: Check the standard imageUrl field
    if (product?.imageUrl) return product.imageUrl;
    
    // Secondary: Check for alternative image fields
    const productAny = product as any;
    if (productAny?.image) return productAny.image;
    if (productAny?.thumbnail) return productAny.thumbnail;
    
    // Fallback: Generate API path if product ID exists
    if (product?.id) {
      return `/api/products/${product.id}/image`;
    }
    
    return null;
  };

  const getProductDetails = (productName: string) => {
    return products?.find(p => p.name === productName);
  };

  const updateQuantity = async (id: string, quantity: number) => {
    // Ensure quantity is valid
    const item = cartItems.find(i => i.id === id);
    if (!item) return;
    
    // Validate quantity is a positive number
    if (isNaN(quantity) || quantity <= 0) {
      console.warn('Invalid quantity provided:', quantity);
      return;
    }
    
    const minQty = item.pricingType === 'linear_meter' ? 0.2 : 1;
    const maxQty = 10000; // Reasonable maximum
    const validQuantity = Math.min(Math.max(minQty, quantity), maxQty);
    
    // Only update if the quantity actually changed
    if (item.quantity !== validQuantity) {
      updateItemMutation.mutate({ id, quantity: validQuantity });
    }
  };

  const handleQuantityInputChange = (id: string, value: string) => {
    // Allow empty string for clearing the field
    if (value === '') {
      setEditingQuantity(prev => ({ ...prev, [id]: '' as any }));
      return;
    }
    
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      setEditingQuantity(prev => ({ ...prev, [id]: numValue }));
    }
  };

  const handleQuantityInputBlur = (id: string, item: CartItemType) => {
    const newQuantity = editingQuantity[id];
    
    // If field is empty or invalid, reset to original value
    if (newQuantity === undefined || String(newQuantity) === '' || isNaN(Number(newQuantity))) {
      setEditingQuantity(prev => {
        const { [id]: removed, ...rest } = prev;
        return rest;
      });
      return;
    }
    
    if (newQuantity !== item.quantity) {
      const minQuantity = item.pricingType === "linear_meter" ? 0.2 : 1;
      if (newQuantity >= minQuantity) {
        updateQuantity(id, newQuantity);
      } else {
        // Reset to minimum value if below minimum
        updateQuantity(id, minQuantity);
      }
    }
    
    setEditingQuantity(prev => {
      const { [id]: removed, ...rest } = prev;
      return rest;
    });
  };

  const handleQuantityInputKeyPress = (e: React.KeyboardEvent, id: string, item: CartItemType) => {
    if (e.key === 'Enter') {
      handleQuantityInputBlur(id, item);
    }
  };

  const handleDrawingSelect = (drawing: LayoutDrawing) => {
    if (drawing && drawing.id && drawing.fileUrl) {
      setSelectedLayoutDrawing(drawing);
      setIsMarkupEditorOpen(true);
    } else {
      toast({
        title: "Error",
        description: "Unable to open drawing editor. Drawing data is incomplete.",
        variant: "destructive",
      });
    }
  };

  const handleCaseStudySelectionChange = (selectedIds: string[]) => {
    setSelectedCaseStudyIds(selectedIds);
    updateCaseStudySelectionMutation.mutate(selectedIds);
  };

  // Get selected case study details
  const selectedCaseStudyDetails = caseStudies.filter(cs => 
    selectedCaseStudyIds.includes(cs.id)
  );

  const handleMarkupEditorClose = () => {
    setIsMarkupEditorOpen(false);
    setSelectedLayoutDrawing(null);
  };

  // Validate partner discount code
  const validatePartnerCode = (code: string) => {
    // Reset if code is empty
    if (!code) {
      setPartnerDiscountPercent(0);
      setPartnerDiscountError('');
      return;
    }

    // Check if code matches the pattern EngageXX! where XX is 5-35
    const match = code.match(/^Engage(\d{1,2})!$/);
    
    if (match) {
      const percent = parseInt(match[1]);
      if (percent >= 5 && percent <= 35) {
        setPartnerDiscountPercent(percent);
        setPartnerDiscountError('');
        haptic.success();
      } else {
        setPartnerDiscountPercent(0);
        setPartnerDiscountError('Invalid code.');
        haptic.error();
      }
    } else {
      setPartnerDiscountPercent(0);
      if (code.length > 0) {
        setPartnerDiscountError('Invalid partner code');
        haptic.error();
      }
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full max-w-full mx-auto">
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="text-base sm:text-lg">Project Cart</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">Loading cart...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="w-full max-w-full mx-auto">
        <CardHeader className="pb-3 sm:pb-6">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5" />
              Project Cart ({cartItems.length} {cartItems.length === 1 ? 'item' : 'items'})
            </CardTitle>
            {cartItems.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSaveDraftModalOpen(true)}
                  disabled={saveDraftMutation.isPending}
                  className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500 dark:border-yellow-600 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                  data-testid="button-save-draft"
                >
                  <Save className="h-4 w-4" />
                  Save as Draft
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => clearCartMutation.mutate()}
                  disabled={clearCartMutation.isPending}
                  className="text-red-600 hover:text-red-700"
                  data-testid="button-clear-cart"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear Cart
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">

          {/* Project Information Input */}
          {cartItems.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Project Information
                </h3>
              </div>
              
              <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label htmlFor="company" className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    Company Name
                  </Label>
                  <Input
                    id="company"
                    value={company}
                    onChange={(e) => {
                      setCompany(e.target.value);
                      autoSaveProjectInfo('company', e.target.value);
                    }}
                    placeholder="Enter company name"
                    className="mt-1"
                    data-testid="input-company"
                  />
                </div>
                
                <div>
                  <Label htmlFor="location" className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    Project Location
                  </Label>
                  <Input
                    id="location"
                    value={location}
                    onChange={(e) => {
                      setLocation(e.target.value);
                      autoSaveProjectInfo('location', e.target.value);
                    }}
                    placeholder="Enter project location"
                    className="mt-1"
                    data-testid="input-location"
                  />
                </div>
                
                <div>
                  <Label htmlFor="project" className="text-sm font-medium text-blue-800 dark:text-blue-300">
                    Project Description
                  </Label>
                  <Input
                    id="project"
                    value={projectDescription}
                    onChange={(e) => {
                      setProjectDescription(e.target.value);
                      autoSaveProjectInfo('projectDescription', e.target.value);
                    }}
                    placeholder="Brief project description"
                    className="mt-1"
                    data-testid="input-project-description"
                  />
                </div>
              </div>
              
              {/* Company Logo Finder - Temporarily disabled to debug infinite loop */}
              {/* {company && (
                <div className="mt-4">
                  <CompanyLogoFinder
                    companyName={company}
                    currentLogoUrl={companyLogoUrl}
                    onLogoConfirmed={(logoUrl) => setCompanyLogoUrl(logoUrl)}
                    className="bg-white dark:bg-gray-900"
                  />
                </div>
              )} */}
            </div>
          )}

          {/* Layout Drawing Upload Section - Temporarily disabled to debug infinite loop */}
          {/* {cartItems.length > 0 && (
            <LayoutDrawingUpload
              company={company}
              location={location}
              projectName={projectDescription}
              onDrawingSelect={handleDrawingSelect}
            />
          )} */}

          {/* Case Study References Section */}
          {cartItems.length > 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-green-900 dark:text-green-200 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Case Study References
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCaseStudySelectorOpen(true)}
                  className="text-green-600 dark:text-green-400 border-green-600 dark:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2 h-auto min-h-[32px] whitespace-nowrap"
                  data-testid="button-select-case-studies"
                >
                  <Search className="h-3 w-3 sm:h-4 sm:w-4 mr-1 flex-shrink-0" />
                  <span className="truncate">Select Case Studies</span>
                </Button>
              </div>
              
              {selectedCaseStudyDetails.length > 0 ? (
                <div className="space-y-3">
                  {selectedCaseStudyDetails.map((caseStudy) => (
                    <div key={caseStudy.id} className="bg-white dark:bg-[#121212] border border-gray-200 dark:border-[#2a2a2a] rounded-lg p-3">
                      <div className="flex items-start space-x-3">
                        {caseStudy.imageUrl ? (
                          <img
                            src={caseStudy.imageUrl}
                            alt={caseStudy.title}
                            className="w-16 h-16 object-cover rounded"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center">
                            {caseStudy.contentType === "video" ? (
                              <Video className="h-6 w-6 text-gray-400" />
                            ) : (
                              <FileText className="h-6 w-6 text-gray-400" />
                            )}
                          </div>
                        )}
                        
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                            {caseStudy.title}
                          </h4>
                          {caseStudy.company && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {caseStudy.company} • {caseStudy.industry}
                            </p>
                          )}
                          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                            {caseStudy.description}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            {caseStudy.pdfUrl && (
                              <a
                                href={caseStudy.pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                              >
                                <FileText className="h-3 w-3" />
                                View Document
                              </a>
                            )}
                            {caseStudy.videoUrl && (
                              <a
                                href={caseStudy.videoUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                              >
                                <Video className="h-3 w-3" />
                                Watch Video
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                    These case studies will be included as references in your project documentation
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  No case studies selected. Click "Select Case Studies" to add relevant references to your project.
                </p>
              )}
            </div>
          )}

          {cartItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-empty-cart">
              Your cart is empty
            </div>
          ) : (
            <div className="space-y-4">
              {cartItems.map((item) => {
                // Use mobile-optimized component on small screens
                const Component = isMobile ? CartItemMobile : CartItem;
                
                return (
                  <Component
                    key={item.id}
                    item={item}
                    updateQuantity={updateQuantity}
                    removeItem={() => removeItemMutation.mutate(item.id)}
                    getProductImage={getProductImage}
                    getProductDetails={getProductDetails}
                    formatPrice={formatPrice}
                    editingQuantity={editingQuantity}
                    handleQuantityInputChange={handleQuantityInputChange}
                    handleQuantityInputBlur={handleQuantityInputBlur}
                    handleQuantityInputKeyPress={handleQuantityInputKeyPress}
                    updateItemMutation={updateItemMutation}
                    removeItemMutation={removeItemMutation}
                  />
                );
              })}

              {/* Add More Products Button - Temporarily using onClick to debug */}
              <div className="flex justify-center my-6">
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    className="flex items-center justify-center gap-2 border-2 border-primary bg-primary/5 hover:bg-primary/10 text-primary hover:text-primary w-full sm:w-auto"
                    data-testid="button-browse-products"
                    onClick={() => window.location.href = '/products'}
                  >
                    <Plus className="h-4 w-4" />
                    <span className="text-sm">Browse Products</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="flex items-center justify-center gap-2 border-2 border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 w-full sm:w-auto"
                    data-testid="button-use-calculator"
                    onClick={() => window.location.href = '/calculator'}
                  >
                    <Calculator className="h-4 w-4" />
                    <span className="text-sm">Use Calculator</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Reciprocal Value Discounts */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-4">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <Gift className="h-5 w-5 text-yellow-600" />
                    Reciprocal Value Commitments
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDiscountModalOpen(true)}
                    className="text-yellow-600 dark:text-yellow-400 border-yellow-600 dark:border-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                    data-testid="button-manage-discounts"
                  >
                    <Settings className="h-4 w-4 mr-1" />
                    Unlock Savings
                  </Button>
                </div>
                
                {selectedDiscounts.length > 0 ? (
                  <div className="space-y-2">
                    {selectedDiscounts.map((discount) => (
                      <div key={discount?.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300">{discount?.title}</span>
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                          {discount?.discountPercent}% Off
                        </Badge>
                      </div>
                    ))}
                    <Separator className="my-2" />
                    <div className="flex items-center justify-between font-medium">
                      <span>Total Discount Applied:</span>
                      <span className="text-green-600">{Math.min(totalDiscountPercent, 23)}%</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    No discount commitments selected. Click "Unlock Savings" to explore available options.
                  </p>
                )}
              </div>

              <Separator />

              {/* Service Care Package Selection */}
              <div className="bg-white dark:bg-[#121212] border border-gray-200 dark:border-[#2a2a2a] rounded-lg p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 mb-4">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <Shield className="h-5 w-5 text-blue-600" />
                    Service Care Package
                  </h3>
                  <div className="flex flex-col xs:flex-row items-start xs:items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsServiceCareExpanded(!isServiceCareExpanded)}
                      className="h-8 w-8 p-0"
                      data-testid="button-toggle-service-care"
                      aria-label={isServiceCareExpanded ? "Collapse" : "Expand"}
                    >
                      <ChevronDown 
                        className="h-4 w-4 transition-transform"
                        style={{ transform: isServiceCareExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                      />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setServiceCareModalOpen(true)}
                      className="text-blue-600 hover:bg-blue-50"
                      data-testid="button-view-service-details"
                    >
                      <Settings className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                  </div>
                </div>
                
                {!isServiceCareExpanded && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Selected: {userServiceSelectionTitle ? (
                      <span className="font-medium text-blue-600">{userServiceSelectionTitle}</span>
                    ) : (
                      <span className="text-gray-500">None selected</span>
                    )}
                  </p>
                )}
              </div>

              {/* Partner Rates Discount Box */}
              <div className="bg-white dark:bg-[#121212] border border-gray-200 dark:border-[#2a2a2a] rounded-lg p-3 sm:p-4">
                <div className="flex flex-col gap-3">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                    <Gift className="h-5 w-5 text-purple-600" />
                    Partner Rates
                  </h3>
                  
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="text"
                      placeholder="Enter partner code"
                      value={partnerDiscountCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        setPartnerDiscountCode(code);
                        validatePartnerCode(code);
                      }}
                      className="flex-1"
                      data-testid="input-partner-code"
                    />
                    {partnerDiscountPercent > 0 && (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <span className="text-sm font-medium text-green-600">
                          {partnerDiscountPercent}% discount applied
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {partnerDiscountError && (
                    <p className="text-sm text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {partnerDiscountError}
                    </p>
                  )}
                  
                  <p className="text-xs text-gray-500">
                    Enter your exclusive partner discount code to apply special rates to your order
                  </p>
                </div>
              </div>

              {/* LinkedIn Social Reciprocity - Temporarily disabled to debug infinite loop */}

              {/* Cart Summary */}
              <div className="bg-gray-50 dark:bg-[#0a0a0a] rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-gray-800 dark:text-gray-200">Order Summary</h3>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatPrice(totalAmount)}</span>
                  </div>
                  
                  {totalDiscountPercent > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Reciprocal Savings ({totalDiscountPercent}%):</span>
                      <span>-{formatPrice(totalAmount * (totalDiscountPercent / 100))}</span>
                    </div>
                  )}
                  
                  {partnerDiscountPercent > 0 && (
                    <div className="flex justify-between text-purple-600">
                      <span>Partner Rate ({partnerDiscountPercent}%):</span>
                      <span>-{formatPrice(totalAmount * (partnerDiscountPercent / 100))}</span>
                    </div>
                  )}
                  
                  {linkedInDiscountAmount > 0 && (
                    <div className="flex justify-between text-blue-600">
                      <span>LinkedIn Social Discount:</span>
                      <span>-{formatPrice(linkedInDiscountAmount)}</span>
                    </div>
                  )}
                  
                  {(totalDiscountPercent > 0 || partnerDiscountPercent > 0 || linkedInDiscountAmount > 0) && (
                    <div className="flex justify-between font-medium">
                      <span>Subtotal after savings:</span>
                      <span>{formatPrice(subtotalAfterDiscount)}</span>
                    </div>
                  )}
                  
                  {deliveryCharge > 0 && (
                    <div className="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>Delivery Charges:</span>
                      <span>{formatPrice(deliveryCharge)}</span>
                    </div>
                  )}
                  
                  {installationCharge > 0 && (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">Installation Complexity:</span>
                          {/* Temporarily disabled tooltip to debug infinite loop
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="w-3 h-3 text-gray-400" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-sm">
                                <strong>Simple:</strong> Basic installation (11.48% of material cost)<br/>
                                <strong>Standard:</strong> Regular installation (19.39% of material cost)<br/>
                                <strong>Complex:</strong> Advanced installation with special requirements (26.29% of material cost)
                              </p>
                            </TooltipContent>
                          </Tooltip>
                          */}
                        </div>
                        <Select 
                          value={installationComplexity} 
                          onValueChange={(value: 'simple' | 'standard' | 'complex') => setInstallationComplexity(value)}
                        >
                          <SelectTrigger 
                            className="w-full sm:w-[140px] h-10 text-sm font-medium touch-manipulation focus-visible:ring-2 focus-visible:ring-yellow-500"
                            data-testid="select-installation-complexity"
                          >
                            <SelectValue placeholder="Select complexity" />
                          </SelectTrigger>
                          <SelectContent 
                            className="z-[100020]"
                            align="end"
                            sideOffset={4}
                          >
                            <SelectItem 
                              value="simple" 
                              className="cursor-pointer py-2.5 touch-manipulation"
                            >
                              Simple
                            </SelectItem>
                            <SelectItem 
                              value="standard" 
                              className="cursor-pointer py-2.5 touch-manipulation"
                            >
                              Standard
                            </SelectItem>
                            <SelectItem 
                              value="complex" 
                              className="cursor-pointer py-2.5 touch-manipulation"
                            >
                              Complex
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex justify-between text-gray-600 dark:text-gray-400 text-sm sm:text-base">
                        <span>Installation Charges ({installationComplexity}):</span>
                        <span>{formatPrice(installationCharge)}</span>
                      </div>
                    </>
                  )}
                  
                  {userServiceSelectionTitle && (
                    <div className="flex justify-between text-blue-600">
                      <span>{userServiceSelectionTitle}:</span>
                      <span>{servicePackageCost > 0 ? formatPrice(servicePackageCost) : formatPrice(0)}</span>
                    </div>
                  )}
                  
                  <Separator />
                  
                  <div className="flex justify-between font-semibold text-lg">
                    <span>Grand Total (Ex. VAT):</span>
                    <span>{formatPrice(grandTotalExVat)}</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-4">
                  <Button
                    onClick={() => setQuoteModalOpen(true)}
                    className="flex-1 w-full sm:w-auto"
                    data-testid="button-request-quote"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    <span className="text-sm">Request Quote</span>
                  </Button>
                  
                  <Button
                    onClick={() => setCreateOrderModalOpen(true)}
                    variant="outline"
                    className="flex-1 w-full sm:w-auto"
                    data-testid="button-create-order"
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    <span className="text-sm">Create Order</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <EnhancedQuoteRequestModal
        isOpen={quoteModalOpen}
        onClose={() => setQuoteModalOpen(false)}
        user={user as any}
      />

      <DiscountModal
        isOpen={discountModalOpen}
        onClose={() => setDiscountModalOpen(false)}
        user={user as any}
        cartItems={cartItems}
      />

      <ServiceCareModal
        isOpen={serviceCareModalOpen}
        onClose={() => setServiceCareModalOpen(false)}
        user={user as any}
      />

      <CreateOrderModal
        isOpen={createOrderModalOpen}
        onClose={() => setCreateOrderModalOpen(false)}
        user={user as any}
        cartItems={cartItems}
        userServiceSelection={selectedServiceOption}
        userDiscountSelections={userDiscountSelections}
        impactCalculationId={cartItems.find(item => item.impactCalculationId)?.impactCalculationId}
        partnerDiscountCode={partnerDiscountCode}
        partnerDiscountPercent={partnerDiscountPercent}
        installationComplexity={installationComplexity}
        companyLogoUrl={companyLogoUrl}
        linkedInDiscountAmount={linkedInDiscountAmount}
        linkedInDiscountData={linkedInDiscountData}
      />

      <LayoutMarkupEditor
        isOpen={isMarkupEditorOpen}
        onClose={handleMarkupEditorClose}
        drawing={selectedLayoutDrawing}
        cartItems={cartItems}
      />

      <DiscountTermsModal
        isOpen={termsModalOpen}
        onClose={() => setTermsModalOpen(false)}
        discountType={selectedDiscountType}
      />

      {/* Save Draft Modal */}
      {saveDraftModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#0a0a0a] rounded-lg p-6 w-full max-w-md mx-4 border border-gray-200 dark:border-[#2a2a2a]">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Save className="h-5 w-5 text-yellow-500" />
              Save Cart as Draft Project
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Save your current cart ({cartItems.length} items) as a draft project. Your cart will be cleared after saving.
            </p>
            <div className="space-y-4">
              <div>
                <Label htmlFor="draftName">Project Name</Label>
                <Input
                  id="draftName"
                  value={draftNameInput}
                  onChange={(e) => setDraftNameInput(e.target.value)}
                  placeholder={`Draft Project ${new Date().toLocaleDateString()}`}
                  className="mt-1"
                  data-testid="input-draft-name"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => saveDraftMutation.mutate({ 
                    projectName: draftNameInput || `Draft Project ${new Date().toLocaleDateString()}`,
                    description: projectDescription 
                  })}
                  disabled={saveDraftMutation.isPending}
                  className="flex-1"
                  data-testid="button-confirm-save-draft"
                >
                  {saveDraftMutation.isPending ? 'Saving...' : 'Save Draft'}
                </Button>
                <Button
                  onClick={() => {
                    setSaveDraftModalOpen(false);
                    setDraftNameInput('');
                  }}
                  variant="outline"
                  data-testid="button-cancel-save-draft"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <CaseStudySelector
        open={isCaseStudySelectorOpen}
        onOpenChange={setIsCaseStudySelectorOpen}
        selectedCaseStudies={selectedCaseStudyIds}
        onSelectionChange={handleCaseStudySelectionChange}
      />

    </>
  );
}