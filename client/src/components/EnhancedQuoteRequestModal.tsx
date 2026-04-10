import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, MessageCircle, Package, ShoppingCart, User } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Product, User as UserType, CartItem } from "@shared/schema";

const quoteRequestSchema = z.object({
  customerName: z.string().min(1, "Customer name is required"),
  jobTitle: z.string().min(1, "Job title is required"),
  company: z.string().min(1, "Company is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Phone number is required"),
  projectLocation: z.string().min(1, "Project location is required"),
  timeline: z.string().min(1, "Timeline is required"),
  specificApplication: z.string().min(1, "Specific application is required"),
  additionalRequirements: z.string().optional(),
  customOrderNumber: z.string().optional(),
});

type QuoteRequestForm = z.infer<typeof quoteRequestSchema>;

interface EnhancedQuoteRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: Product;
  user: UserType | null;
}

export function EnhancedQuoteRequestModal({ isOpen, onClose, product, user }: EnhancedQuoteRequestModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<"email" | "whatsapp" | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch cart items
  const { data: cartItems = [] } = useQuery<CartItem[]>({
    queryKey: ["/api/cart"],
    enabled: isOpen && !!user,
  });

  const form = useForm<QuoteRequestForm>({
    resolver: zodResolver(quoteRequestSchema),
    defaultValues: {
      customerName: "",
      jobTitle: "",
      company: "",
      email: "",
      phone: "",
      projectLocation: "",
      timeline: "",
      specificApplication: "",
      additionalRequirements: "",
      customOrderNumber: "",
    },
  });

  // Auto-populate user data when available - only for "Your Details" section
  useEffect(() => {
    if (user && isOpen) {
      // Auto-populate only the "Your Details" section (phone), keep top four fields blank
      const currentValues = form.getValues();
      form.reset({
        customerName: '', // Keep blank
        jobTitle: '', // Keep blank
        company: '', // Keep blank
        email: '', // Keep blank
        phone: currentValues.phone || user.phone || '', // Auto-populate from profile
        projectLocation: currentValues.projectLocation || '',
        timeline: currentValues.timeline || '',
        specificApplication: currentValues.specificApplication || '',
        additionalRequirements: currentValues.additionalRequirements || '',
        customOrderNumber: currentValues.customOrderNumber || '',
      });
    }
  }, [user, isOpen, form]);

  const createQuoteRequestMutation = useMutation({
    mutationFn: async (data: QuoteRequestForm & { requestMethod: "email" | "whatsapp" }) => {
      const requestData = {
        ...data,
        userId: user?.id,
        contactPerson: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'Customer',
        contactEmail: user?.email || '',
        company: user?.company || '',
        customOrderNumber: data.customOrderNumber || null,
        productInfo: product ? {
          name: product.name,
          category: product.category,
          impactRating: product.impactRating,
          price: product.price
        } : null,
        cartItems: cartItems.length > 0 ? cartItems : null,
        includeCart: !product // If no specific product, include full cart
      };
      
      return apiRequest(`/api/quote-requests`, "POST", requestData);
    },
    onSuccess: async () => {
      // Clear cart after successful quote submission (if cart items were included)
      if (cartItems.length > 0 && !product) {
        try {
          await apiRequest("/api/cart", "DELETE");
          queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
        } catch (error) {
          console.error("Failed to clear cart after quote submission:", error);
        }
      }
      
      // Refresh quote request stats and lists
      queryClient.invalidateQueries({ queryKey: ["/api/quote-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quote-requests/stats"] });
      
      // Reset form state
      form.reset();
      setSelectedMethod(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to log quote request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (data: QuoteRequestForm) => {
    if (!selectedMethod) {
      toast({
        title: "Select Contact Method",
        description: "Please choose how you'd like to receive your quote.",
        variant: "destructive",
      });
      return;
    }

    // First log the quote request to the database with timestamp
    try {
      await createQuoteRequestMutation.mutateAsync({
        ...data,
        requestMethod: selectedMethod
      });

      // After successful database logging, proceed with the selected method
      if (selectedMethod === "whatsapp") {
        // Generate WhatsApp message
        const message = generateWhatsAppMessage(data, product, cartItems, user);
        const whatsappUrl = `https://wa.me/971503881285?text=${encodeURIComponent(message)}`;
        
        window.open(whatsappUrl, '_blank');
        toast({
          title: "Order Form Request Logged & WhatsApp Opened",
          description: "Order form request has been logged with timestamp. Complete your request in WhatsApp.",
        });
      }

      if (selectedMethod === "email") {
        // Generate email content
        const emailBody = generateEmailMessage(data, product, cartItems, user);
        const subject = product 
          ? `Quote Request - ${product.name}`
          : `Quote Request - Cart Items (${cartItems.length} items)`;
        
        const mailtoUrl = `mailto:support@asafe.ae?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
        
        try {
          window.open(mailtoUrl, '_blank');
          toast({
            title: "Quote Request Logged & Email Opened",
            description: "Quote request has been logged with timestamp. Please send the email to complete your request.",
          });
        } catch (error) {
          // Fallback for some browsers
          window.location.href = mailtoUrl;
        }
      }

      onClose();
    } catch (error) {
      console.error("Failed to log quote request:", error);
      toast({
        title: "Error",
        description: "Failed to log quote request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const generateEmailMessage = (data: QuoteRequestForm, product?: Product, cartItems: CartItem[] = [], user?: UserType | null) => {
    let message = `Dear A-SAFE Sales Team,\n\nI would like to request a quote for the following requirements:\n\n`;
    
    // Customer Info
    message += `Customer Information:\n`;
    message += `Name: ${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Not provided';
    message += `\nEmail: ${user?.email || 'Not provided'}`;
    message += `\nPhone: ${data.phone}`;
    message += `\nCompany: ${user?.company || 'Not provided'}`;
    if (data.customOrderNumber) {
      message += `\nCRM Quote Number: ${data.customOrderNumber}`;
    }
    message += `\n\n`;

    // Project Details
    message += `Project Details:\n`;
    message += `Location: ${data.projectLocation}\n`;
    message += `Timeline: ${data.timeline}\n`;
    message += `Application: ${data.specificApplication}\n`;
    if (data.additionalRequirements) {
      message += `Additional Requirements: ${data.additionalRequirements}\n`;
    }
    message += `\n`;

    // Product/Cart Information
    if (product) {
      message += `Product Request:\n`;
      message += `Product: ${product.name}\n`;
      message += `Category: ${product.category}\n`;
      message += `Impact Rating: ${product.impactRating?.toLocaleString()}J\n`;
      if (product.price) {
        message += `Unit Price: AED ${parseFloat(product.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
      }
    } else if (cartItems.length > 0) {
      message += `Cart Items:\n`;
      let totalValue = 0;
      cartItems.forEach((item, index) => {
        message += `${index + 1}. ${item.productName}\n`;
        message += `   Quantity: ${item.quantity} ${item.pricingType === 'per_meter' ? 'meters' : 'items'}\n`;
        message += `   Unit Price: AED ${item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
        message += `   Total: AED ${item.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n\n`;
        totalValue += item.totalPrice;
      });
      message += `Cart Total: AED ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n\n`;
    }

    message += `Please provide a detailed order form for the above requirements.\n\nThank you for your assistance.\n\nBest regards,\n${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Customer';
    
    return message;
  };

  const generateWhatsAppMessage = (data: QuoteRequestForm, product?: Product, cartItems: CartItem[] = [], user?: UserType | null) => {
    let message = `🏗️ A-SAFE Order Form Request\n\n`;
    
    // Customer Info
    message += `👤 Customer Information:\n`;
    message += `Name: ${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Not provided';
    message += `\nEmail: ${user?.email || 'Not provided'}`;
    message += `\nPhone: ${data.phone}`;
    message += `\nCompany: ${user?.company || 'Not provided'}`;
    if (data.customOrderNumber) {
      message += `\n📌 CRM Quote Number: ${data.customOrderNumber}`;
    }
    message += `\n\n`;

    // Project Details
    message += `📋 Project Details:\n`;
    message += `Location: ${data.projectLocation}\n`;
    message += `Timeline: ${data.timeline}\n`;
    message += `Application: ${data.specificApplication}\n`;
    if (data.additionalRequirements) {
      message += `Additional Requirements: ${data.additionalRequirements}\n`;
    }
    message += `\n`;

    // Product/Cart Information
    if (product) {
      message += `🛡️ Product Request:\n`;
      message += `Product: ${product.name}\n`;
      message += `Category: ${product.category}\n`;
      message += `Impact Rating: ${product.impactRating?.toLocaleString()}J\n`;
      if (product.price) {
        message += `Unit Price: AED ${parseFloat(product.price).toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
      }
    } else if (cartItems.length > 0) {
      message += `🛒 Cart Items:\n`;
      let totalValue = 0;
      cartItems.forEach((item, index) => {
        message += `${index + 1}. ${item.productName}\n`;
        message += `   Quantity: ${item.quantity} ${item.pricingType === 'per_meter' ? 'meters' : 'items'}\n`;
        message += `   Unit Price: AED ${item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
        message += `   Total: AED ${item.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n\n`;
        totalValue += item.totalPrice;
      });
      message += `💰 Cart Total: AED ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n\n`;
    }

    message += `Please provide a detailed quote for the above requirements. Thank you!`;
    
    return message;
  };

  const totalCartValue = cartItems.reduce((sum, item) => sum + item.totalPrice, 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-quote-request">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Request Order Form
          </DialogTitle>
          <DialogDescription>
            Get a personalized order form for your safety barrier requirements
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          {/* Left Column - Form */}
          <div className="lg:col-span-2">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Contact Method Selection */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">Select Contact Method *</label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      type="button"
                      variant={selectedMethod === "email" ? "default" : "outline"}
                      onClick={() => setSelectedMethod("email")}
                      className="flex items-center gap-2 flex-1"
                      data-testid="button-select-email"
                    >
                      <Mail className="h-4 w-4" />
                      Email Quote
                    </Button>
                    <Button
                      type="button"
                      variant={selectedMethod === "whatsapp" ? "default" : "outline"}
                      onClick={() => setSelectedMethod("whatsapp")}
                      className="flex items-center gap-2 flex-1 bg-green-600 hover:bg-green-700 text-white"
                      data-testid="button-select-whatsapp"
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp Order Form
                    </Button>
                  </div>
                </div>

                {/* Customer Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Customer Information</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="customerName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Customer Name *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Full Name" 
                              {...field} 
                              data-testid="input-customer-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="jobTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Job Title *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Position/Role" 
                              {...field} 
                              data-testid="input-job-title"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="company"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Company Name" 
                              {...field} 
                              data-testid="input-company"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email *</FormLabel>
                          <FormControl>
                            <Input 
                              type="email"
                              placeholder="email@company.com" 
                              {...field} 
                              data-testid="input-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                
                {/* Your Details Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Your Details</h3>
                  
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="+971 XX XXX XXXX" 
                            {...field} 
                            data-testid="input-phone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                {/* Project Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Project Information</h3>
                </div>

                <FormField
                  control={form.control}
                  name="customOrderNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CRM Quote Number (Optional)</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., QUO-2025-001 (Your internal reference number)" 
                          {...field} 
                          data-testid="input-custom-order-number"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="projectLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Location *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., Dubai, Abu Dhabi, Sharjah" 
                          {...field} 
                          data-testid="input-location"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="timeline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Timeline *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g., Within 2 weeks, Next month" 
                          {...field} 
                          data-testid="input-timeline"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="specificApplication"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Specific Application *</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Describe how you'll use these safety barriers"
                          className="resize-none"
                          {...field} 
                          data-testid="textarea-application"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="additionalRequirements"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Requirements</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Installation services, special configurations, etc."
                          className="resize-none"
                          {...field} 
                          data-testid="textarea-requirements"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <Button
                    type="submit"
                    disabled={createQuoteRequestMutation.isPending || !selectedMethod}
                    className="flex-1"
                    data-testid="button-submit-quote"
                  >
                    {createQuoteRequestMutation.isPending
                      ? "Sending..."
                      : selectedMethod === "whatsapp"
                      ? "Continue on WhatsApp"
                      : selectedMethod === "email"
                      ? "Send Email Order Form"
                      : "Select Contact Method"}
                  </Button>
                  <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          </div>

          {/* Right Column - Summary */}
          <div className="space-y-3 lg:space-y-4">
            {/* User Info */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <User className="h-4 w-4" />
                  <span className="font-medium">Your Information</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600">Name:</span>
                    <span className="ml-2">{user?.firstName} {user?.lastName}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Email:</span>
                    <span className="ml-2">{user?.email}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Company:</span>
                    <span className="ml-2">{user?.company || 'Not specified'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Product/Cart Summary */}
            {product ? (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="h-4 w-4" />
                    <span className="font-medium">Product</span>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">{product.name}</h4>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs">
                        {product.category}
                      </Badge>
                      <Badge className="bg-blue-500 text-white text-xs">
                        {product.impactRating?.toLocaleString()}J
                      </Badge>
                    </div>
                    {product.price && (
                      <div className="text-sm text-gray-600">
                        AED {Math.round(parseFloat(product.price)).toLocaleString('en-US')}/m
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : cartItems.length > 0 ? (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ShoppingCart className="h-4 w-4" />
                    <span className="font-medium">Cart Items ({cartItems.length})</span>
                  </div>
                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {cartItems.map((item, index) => (
                      <div key={item.id} className="flex justify-between items-start text-sm">
                        <div className="flex-1">
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-gray-600">
                            {item.quantity} {item.pricingType === 'per_meter' ? 'meters' : 'items'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">
                            AED {Math.round(item.totalPrice).toLocaleString('en-US')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="pt-3 border-t mt-3">
                    <div className="flex justify-between font-medium">
                      <span>Total:</span>
                      <span>AED {totalCartValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Contact Method Info */}
            {selectedMethod && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {selectedMethod === "email" ? (
                      <Mail className="h-4 w-4" />
                    ) : (
                      <MessageCircle className="h-4 w-4" />
                    )}
                    <span className="font-medium">
                      {selectedMethod === "email" ? "Email Order Form" : "WhatsApp Order Form"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    {selectedMethod === "email"
                      ? "We'll send a detailed order form to your email within 24 hours."
                      : "Continue the conversation on WhatsApp for instant communication."}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}