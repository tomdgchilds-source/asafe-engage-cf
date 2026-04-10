import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Mail, MessageCircle, Package } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import type { Product, User } from "@shared/schema";

const quoteRequestSchema = z.object({
  projectLocation: z.string().min(1, "Project location is required"),
  timeline: z.string().min(1, "Timeline is required"),
  specificApplication: z.string().min(1, "Specific application is required"),
  additionalRequirements: z.string().optional(),
  phone: z.string().min(1, "Phone number is required"),
  preferredContact: z.enum(["email", "phone"]),
});

type QuoteRequestForm = z.infer<typeof quoteRequestSchema>;

interface QuoteRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  user: User | null;
}

export function QuoteRequestModal({ isOpen, onClose, product, user }: QuoteRequestModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<"email" | "whatsapp" | null>(null);
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const queryClient = useQueryClient();

  // Reset state when modal opens or closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedMethod(null);
    }
  }, [isOpen]);

  const form = useForm<QuoteRequestForm>({
    resolver: zodResolver(quoteRequestSchema),
    defaultValues: {
      projectLocation: "",
      timeline: "",
      specificApplication: "",
      additionalRequirements: "",
      phone: "",
      preferredContact: "email",
    },
  });

  const createQuoteRequestMutation = useMutation({
    mutationFn: async (data: QuoteRequestForm & { requestMethod: "email" | "whatsapp" }) => {
      return apiRequest(`/api/quote-requests`, "POST", {
        productId: product.id,
        productName: product.name,
        productCategory: product.category,
        impactRating: product.impactRating || 0,
        price: product.price || "0",
        currency: product.currency || "SAR",
        requestMethod: data.requestMethod,
        projectLocation: data.projectLocation,
        timeline: data.timeline,
        specificApplication: data.specificApplication,
        additionalRequirements: data.additionalRequirements,
        phone: data.phone,
        preferredContact: data.preferredContact,
      });
    },
    onSuccess: () => {
      haptic.success();
      queryClient.invalidateQueries({ queryKey: ["/api/quote-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quote-requests/stats"] });
      toast({
        title: "Quote Request Submitted",
        description: `Your quote request has been submitted via ${selectedMethod === "whatsapp" ? "WhatsApp" : "email"}.`,
      });
      onClose();
      form.reset();
      setSelectedMethod(null);
    },
    onError: (error) => {
      console.error("Quote request error:", error);
      haptic.error();
      toast({
        title: "Error",
        description: "Failed to submit quote request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleMethodSelect = (method: "email" | "whatsapp") => {
    setSelectedMethod(method);
  };

  const handleSubmit = (data: QuoteRequestForm) => {
    if (!selectedMethod) return;

    if (selectedMethod === "whatsapp") {
      // Generate WhatsApp message
      const userFullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
      const whatsappMessage = `Hello A-SAFE Team,

I would like to request a quote for the following product:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Product: ${product.name}
Category: ${product.category.replace('-', ' ').toUpperCase()}
Impact Rating: ${product.impactRating?.toLocaleString() || 'N/A'}J
Price: ${product.currency || 'SAR'} ${product.price ? parseFloat(product.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Contact for pricing'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROJECT REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Location: ${data.projectLocation}
Timeline: ${data.timeline}
Application: ${data.specificApplication}
${data.additionalRequirements ? `Additional Requirements: ${data.additionalRequirements}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTACT INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name: ${userFullName}
Email: ${user?.email || '[Email]'}
Company: ${user?.company || '[Company]'}
Phone: ${data.phone}

Thank you for your assistance!

Generated from A-SAFE ENGAGE Portal
${new Date().toLocaleDateString('en-GB')}`;

      // Create WhatsApp URL
      const whatsappNumber = "+971504777499"; // A-SAFE UAE WhatsApp number
      const whatsappUrl = `https://wa.me/${whatsappNumber.replace('+', '')}?text=${encodeURIComponent(whatsappMessage)}`;
      window.open(whatsappUrl, '_blank');
    } else {
      // Generate email
      const userFullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
      const supportEmail = "support@asafe.ae";
      const subject = `Quote Request: ${product.name} - A-SAFE Product Inquiry`;
      
      // Simplified email body to avoid URL length issues
      const emailBody = `Dear A-SAFE Sales Team,

Quote request for: ${product.name}

Product Details:
- Category: ${product.category.replace('-', ' ').toUpperCase()}
- Impact Rating: ${product.impactRating?.toLocaleString() || 'N/A'}J

Requirements:
- Location: ${data.projectLocation}
- Timeline: ${data.timeline}
- Application: ${data.specificApplication}

Contact: ${userFullName}
Email: ${user?.email}
Phone: ${data.phone}
Company: ${user?.company || 'Not specified'}

Please provide detailed quotation.

Best regards,
${userFullName}`;

      try {
        const mailtoUrl = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
        
        // Try opening with window.open first, fallback to window.location.href
        const emailWindow = window.open(mailtoUrl);
        if (!emailWindow) {
          window.location.href = mailtoUrl;
        }
        
        // Show success toast
        toast({
          title: "Email Opened",
          description: "Your email client should open with the quote request details.",
        });
      } catch (error) {
        console.error("Email error:", error);
        toast({
          title: "Email Error",
          description: "Unable to open email client. Please copy the details manually.",
          variant: "destructive",
        });
      }
    }

    // Save the quote request to database
    createQuoteRequestMutation.mutate({
      ...data,
      requestMethod: selectedMethod,
    });
  };

  if (!selectedMethod) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md" data-testid="quote-method-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-yellow-400" />
              Choose Quote Method
            </DialogTitle>
            <DialogDescription>
              How would you like to send your quote request for {product.name}?
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Card 
              className="cursor-pointer hover:bg-gray-50 transition-colors border-2 hover:border-yellow-400"
              onClick={() => handleMethodSelect("email")}
              data-testid="method-email"
            >
              <CardContent className="p-6 text-center">
                <Mail className="h-8 w-8 text-blue-500 mx-auto mb-3" />
                <h3 className="font-semibold text-black mb-2">Email Quote Request</h3>
                <p className="text-sm text-gray-600">
                  Send a detailed quote request directly to our sales team via email
                </p>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:bg-gray-50 transition-colors border-2 hover:border-yellow-400"
              onClick={() => handleMethodSelect("whatsapp")}
              data-testid="method-whatsapp"
            >
              <CardContent className="p-6 text-center">
                <MessageCircle className="h-8 w-8 text-green-500 mx-auto mb-3" />
                <h3 className="font-semibold text-black mb-2">WhatsApp Quote Request</h3>
                <p className="text-sm text-gray-600">
                  Connect instantly with our sales team via WhatsApp for faster response
                </p>
              </CardContent>
            </Card>

            <Button 
              variant="outline" 
              onClick={onClose}
              className="w-full"
              data-testid="cancel-quote"
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="quote-form-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-yellow-400" />
            Quote Request Details
          </DialogTitle>
          <DialogDescription>
            Complete the form below to request a quote for {product.name}
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4">
          <Badge variant="secondary" className="flex items-center gap-1 w-fit">
            {selectedMethod === "whatsapp" ? (
              <MessageCircle className="h-3 w-3" />
            ) : (
              <Mail className="h-3 w-3" />
            )}
            {selectedMethod === "whatsapp" ? "WhatsApp" : "Email"} Request
          </Badge>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="projectLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Location *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Dubai, UAE" {...field} data-testid="input-location" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="timeline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Installation Timeline *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Q1 2025, ASAP" {...field} data-testid="input-timeline" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., +971 50 123 4567" {...field} data-testid="input-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="specificApplication"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Specific Application *</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe your safety requirements and application details..."
                      className="min-h-20"
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
                  <FormLabel>Additional Requirements (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Any specific requirements, custom colors, installation services needed..."
                      className="min-h-20"
                      {...field}
                      data-testid="textarea-requirements"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedMethod(null)}
                data-testid="button-back"
              >
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-yellow-400 hover:bg-yellow-500 text-black"
                disabled={createQuoteRequestMutation.isPending}
                data-testid="button-submit-quote"
              >
                {createQuoteRequestMutation.isPending ? "Submitting..." : 
                 selectedMethod === "whatsapp" ? "Send via WhatsApp" : "Send via Email"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}