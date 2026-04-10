import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, MessageCircle, Copy, Check, X, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ShareOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  customOrderNumber?: string;
  orderUrl: string;
  customerName?: string;
  customerEmail?: string;
  customerMobile?: string;
}

export function ShareOrderModal({
  open,
  onOpenChange,
  orderNumber,
  customOrderNumber,
  orderUrl,
  customerName,
  customerEmail,
  customerMobile,
}: ShareOrderModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"email" | "whatsapp">("email");
  const [emailTo, setEmailTo] = useState(customerEmail || "");
  const [emailSubject, setEmailSubject] = useState(
    `A-SAFE Order Form ${customOrderNumber || orderNumber} - ${customerName || "Your Order"}`
  );
  const [emailBody, setEmailBody] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState(customerMobile || "");
  const [whatsappMessage, setWhatsappMessage] = useState("");
  const [copied, setCopied] = useState(false);

  // Initialize messages when modal opens
  useState(() => {
    const defaultEmailBody = `Dear ${customerName || "Customer"},

Please find your A-SAFE Order Form at the following link:
${orderUrl}

Order Reference: ${customOrderNumber || orderNumber}

This order form contains detailed specifications and pricing for your safety barrier requirements.

Best regards,
A-SAFE Team`;

    const defaultWhatsappMessage = `Hello ${customerName || ""},

Your A-SAFE Order Form ${customOrderNumber || orderNumber} is ready for review:
${orderUrl}

Please let me know if you have any questions.`;

    setEmailBody(defaultEmailBody);
    setWhatsappMessage(defaultWhatsappMessage);
  }, [orderUrl, orderNumber, customOrderNumber, customerName]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(orderUrl);
      setCopied(true);
      toast({
        title: "Link copied",
        description: "Order form link copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Could not copy link to clipboard",
        variant: "destructive",
      });
    }
  };

  const handleSendEmail = () => {
    const mailtoUrl = `mailto:${emailTo}?subject=${encodeURIComponent(
      emailSubject
    )}&body=${encodeURIComponent(emailBody)}`;
    window.open(mailtoUrl, "_blank");
    toast({
      title: "Email client opened",
      description: "Complete sending in your email application",
    });
  };

  const handleSendWhatsApp = () => {
    // Format phone number (remove spaces, dashes, and add country code if needed)
    let formattedNumber = whatsappNumber.replace(/[\s-()]/g, "");
    
    // Add country code if not present (assuming UAE if starts with 5)
    if (formattedNumber.startsWith("5")) {
      formattedNumber = "971" + formattedNumber;
    } else if (formattedNumber.startsWith("05")) {
      formattedNumber = "971" + formattedNumber.substring(1);
    } else if (!formattedNumber.startsWith("+")) {
      formattedNumber = "+" + formattedNumber;
    }

    const whatsappUrl = `https://wa.me/${formattedNumber}?text=${encodeURIComponent(
      whatsappMessage
    )}`;
    window.open(whatsappUrl, "_blank");
    toast({
      title: "WhatsApp opened",
      description: "Complete sending in WhatsApp",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="share-order-modal">
        <DialogHeader>
          <DialogTitle>Share Order Form</DialogTitle>
          <DialogDescription>
            Share order form {customOrderNumber || orderNumber} via email or WhatsApp
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Quick Copy Link */}
          <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <Input
              value={orderUrl}
              readOnly
              className="flex-1 bg-transparent border-0 focus:ring-0"
              data-testid="order-link-input"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              data-testid="copy-link-button"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>

          {/* Tab Selection */}
          <div className="flex gap-2 border-b">
            <button
              onClick={() => setActiveTab("email")}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
                activeTab === "email"
                  ? "border-[#FFC72C] text-[#FFC72C]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="email-tab"
            >
              <Mail className="h-4 w-4" />
              Email
            </button>
            <button
              onClick={() => setActiveTab("whatsapp")}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
                activeTab === "whatsapp"
                  ? "border-[#25D366] text-[#25D366]"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              data-testid="whatsapp-tab"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </button>
          </div>

          {/* Email Tab */}
          {activeTab === "email" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="email-to">To</Label>
                <Input
                  id="email-to"
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="recipient@example.com"
                  data-testid="email-to-input"
                />
              </div>
              <div>
                <Label htmlFor="email-subject">Subject</Label>
                <Input
                  id="email-subject"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  data-testid="email-subject-input"
                />
              </div>
              <div>
                <Label htmlFor="email-body">Message</Label>
                <Textarea
                  id="email-body"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={8}
                  className="resize-none"
                  data-testid="email-body-input"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  data-testid="cancel-email-button"
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  onClick={handleSendEmail}
                  disabled={!emailTo}
                  className="bg-[#FFC72C] hover:bg-[#FFD04F] text-black"
                  data-testid="send-email-button"
                >
                  <Send className="h-4 w-4 mr-1" />
                  Open Email Client
                </Button>
              </div>
            </div>
          )}

          {/* WhatsApp Tab */}
          {activeTab === "whatsapp" && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="whatsapp-number">WhatsApp Number</Label>
                <Input
                  id="whatsapp-number"
                  type="tel"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="+971 50 123 4567"
                  data-testid="whatsapp-number-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter number with country code (e.g., +971 for UAE, +966 for Saudi)
                </p>
              </div>
              <div>
                <Label htmlFor="whatsapp-message">Message</Label>
                <Textarea
                  id="whatsapp-message"
                  value={whatsappMessage}
                  onChange={(e) => setWhatsappMessage(e.target.value)}
                  rows={6}
                  className="resize-none"
                  data-testid="whatsapp-message-input"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  data-testid="cancel-whatsapp-button"
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  onClick={handleSendWhatsApp}
                  disabled={!whatsappNumber}
                  className="bg-[#25D366] hover:bg-[#20BD5C] text-white"
                  data-testid="send-whatsapp-button"
                >
                  <MessageCircle className="h-4 w-4 mr-1" />
                  Open WhatsApp
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}