import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  MapPin, 
  Mail, 
  Phone, 
  MessageCircle, 
  Clock, 
  Globe,
  Send,
  Building,
  Star,
  ExternalLink
} from "lucide-react";
import { InfoPopover } from "@/components/ui/info-popover";
import { SiFacebook, SiLinkedin, SiX, SiYoutube, SiTiktok } from "react-icons/si";
import OfficeSelector, { GlobalOffice } from "@/components/OfficeSelector";

export default function Contact() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedOffice, setSelectedOffice] = useState<GlobalOffice | undefined>();
  const { toast } = useToast();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await apiRequest('/api/contact', 'POST', formData);

      toast({
        title: "Message Sent",
        description: "Thank you for contacting us. We'll respond within 24 hours.",
      });

      // Reset form
      setFormData({
        name: "",
        email: "",
        company: "",
        subject: "",
        message: "",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again or contact us directly.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4 flex items-center justify-center" data-testid="contact-title">
            Contact A-SAFE Globally
            <InfoPopover 
              content="Get in touch with our global offices for expert safety solutions, technical support, and consultation services. Select your preferred office location below."
              iconClassName="h-5 w-5 ml-2 text-gray-400 hover:text-gray-600 cursor-help"
            />
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Contact Information */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {selectedOffice ? (
                    <>
                      {(() => {
                        // Map of all countries to their flag emojis
                        const flagMap: Record<string, string> = {
                          'United Arab Emirates': '🇦🇪',
                          'Saudi Arabia': '🇸🇦',
                          'United Kingdom': '🇬🇧',
                          'United States': '🇺🇸',
                          'Canada': '🇨🇦',
                          'Mexico': '🇲🇽',
                          'Australia': '🇦🇺',
                          'Japan': '🇯🇵',
                          'South Korea': '🇰🇷',
                          'Taiwan': '🇹🇼',
                          'Belgium': '🇧🇪',
                          'France': '🇫🇷',
                          'Germany': '🇩🇪',
                          'Italy': '🇮🇹',
                          'Netherlands': '🇳🇱',
                          'Spain': '🇪🇸',
                          'Sweden': '🇸🇪',
                          'Denmark': '🇩🇰',
                          'Poland': '🇵🇱',
                          'Portugal': '🇵🇹',
                          'Switzerland': '🇨🇭',
                          'Iceland': '🇮🇸',
                          'Slovakia': '🇸🇰',
                          'Romania': '🇷🇴',
                          'Greece': '🇬🇷',
                          'Turkey': '🇹🇷',
                          'India': '🇮🇳',
                          'China': '🇨🇳',
                          'Singapore': '🇸🇬',
                          'Malaysia': '🇲🇾',
                          'Thailand': '🇹🇭',
                          'Indonesia': '🇮🇩',
                          'Philippines': '🇵🇭',
                          'Vietnam': '🇻🇳',
                          'New Zealand': '🇳🇿',
                          'South Africa': '🇿🇦',
                          'Brazil': '🇧🇷',
                          'Argentina': '🇦🇷',
                          'Chile': '🇨🇱',
                          'Colombia': '🇨🇴'
                        };
                        
                        if (selectedOffice.region === "International") {
                          return <Globe className="h-5 w-5" />;
                        } else if (flagMap[selectedOffice.country]) {
                          return <span className="text-xl">{flagMap[selectedOffice.country]}</span>;
                        } else {
                          return <Building className="h-5 w-5" />;
                        }
                      })()}
                      {selectedOffice.region === "International" ? "International Coverage" : selectedOffice.country}
                    </>
                  ) : (
                    <>
                      <Building className="h-5 w-5" />
                      Select Office Location
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Office Selector */}
                <OfficeSelector
                  selectedOffice={selectedOffice}
                  onOfficeSelect={setSelectedOffice}
                  showContactInfo={true}
                  defaultRegion="Middle East"
                  buttonVariant="outline"
                  className="w-full"
                />

                {/* WhatsApp for UAE and Saudi Arabia only */}
                {(selectedOffice?.country === "United Arab Emirates" || selectedOffice?.country === "Saudi Arabia") && (
                  <div className="flex items-start gap-4">
                    <MessageCircle className="h-6 w-6 text-green-600 mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-black mb-1">WhatsApp</h3>
                      <a 
                        href={selectedOffice?.country === "Saudi Arabia" ? "https://wa.me/966530356116" : "https://wa.me/971503881285"}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-green-600 hover:text-green-700 transition-colors"
                      >
                        {selectedOffice?.country === "Saudi Arabia" ? "+966 530356116" : "+971 503881285"}
                      </a>
                    </div>
                  </div>
                )}

                {/* Business Hours */}
                {selectedOffice && (
                  <div className="flex items-start gap-4">
                    <Clock className="h-6 w-6 text-yellow-600 mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-black mb-1">Business Hours</h3>
                      <div className="text-gray-600 text-sm space-y-1">
                        {selectedOffice.country === "Saudi Arabia" ? (
                          <>
                            <p>Sunday - Thursday: 8:30 AM - 5:30 PM</p>
                            <p>Friday - Saturday: Closed</p>
                            <p className="text-xs text-gray-500 mt-2">Gulf Standard Time (GST)</p>
                          </>
                        ) : selectedOffice.region === "Middle East" ? (
                          <>
                            <p>Monday - Friday: 8:30 AM - 5:30 PM</p>
                            <p>Saturday - Sunday: Closed</p>
                            <p className="text-xs text-gray-500 mt-2">Gulf Standard Time (GST)</p>
                          </>
                        ) : selectedOffice.region === "Europe" ? (
                          <>
                            <p>Monday - Friday: 9:00 AM - 5:00 PM</p>
                            <p>Saturday - Sunday: Closed</p>
                            <p className="text-xs text-gray-500 mt-2">Local time zone</p>
                          </>
                        ) : selectedOffice.region === "Americas" ? (
                          <>
                            <p>Monday - Friday: 8:00 AM - 5:00 PM</p>
                            <p>Saturday - Sunday: Closed</p>
                            <p className="text-xs text-gray-500 mt-2">Local time zone</p>
                          </>
                        ) : (
                          <>
                            <p>Monday - Friday: 9:00 AM - 5:00 PM</p>
                            <p>Saturday - Sunday: Closed</p>
                            <p className="text-xs text-gray-500 mt-2">Local time zone</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-4">
                  <Globe className="h-6 w-6 text-yellow-600 mt-1 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-black mb-2">Follow Us</h3>
                    <div className="flex items-center gap-3">
                      <a 
                        href="https://m.facebook.com/ASAFEUK/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        title="Follow us on Facebook"
                        data-testid="link-facebook"
                      >
                        <SiFacebook className="h-4 w-4" />
                      </a>
                      <a 
                        href="https://ae.linkedin.com/company/a-safe-uae" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-2 rounded-full bg-blue-700 text-white hover:bg-blue-800 transition-colors"
                        title="Connect with us on LinkedIn"
                        data-testid="link-linkedin"
                      >
                        <SiLinkedin className="h-4 w-4" />
                      </a>
                      <a 
                        href="http://www.x.com/ASAFE_UK" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-2 rounded-full bg-black text-white hover:bg-gray-800 transition-colors"
                        title="Follow us on X (Twitter)"
                        data-testid="link-twitter"
                      >
                        <SiX className="h-4 w-4" />
                      </a>
                      <a 
                        href="https://www.youtube.com/asafebarrier" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
                        title="Subscribe to our YouTube channel"
                        data-testid="link-youtube"
                      >
                        <SiYoutube className="h-4 w-4" />
                      </a>
                      <a 
                        href="https://www.tiktok.com/@asafegroup?_t=ZS-8z9OURLnDzo&_r=1" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-2 rounded-full bg-black text-white hover:bg-gray-800 transition-colors"
                        title="Follow us on TikTok"
                        data-testid="link-tiktok"
                      >
                        <SiTiktok className="h-4 w-4" />
                      </a>
                    </div>
                    <p className="text-sm text-gray-600 mt-2">
                      Stay updated with our latest products, case studies, and safety insights
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Contact Options - Only for UAE and Saudi Arabia */}
            {(selectedOffice?.country === "United Arab Emirates" || selectedOffice?.country === "Saudi Arabia") && (
              <Card className="bg-yellow-50 border-yellow-200">
                <CardHeader>
                  <CardTitle>Quick Contact Options</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button 
                    asChild 
                    className="w-full bg-green-500 hover:bg-green-600 text-white"
                    data-testid="whatsapp-contact"
                  >
                    <a 
                      href={selectedOffice?.country === "Saudi Arabia" ? "https://wa.me/966530356116" : "https://wa.me/971503881285"}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Chat on WhatsApp
                    </a>
                  </Button>

                  <Button 
                    asChild 
                    variant="outline" 
                    className="w-full"
                    data-testid="email-contact"
                  >
                    <a 
                      href={selectedOffice?.country === "Saudi Arabia" ? "mailto:sales@asafe.sa" : "mailto:support@asafe.ae"}
                      className="flex items-center justify-center gap-2"
                    >
                      <Mail className="h-4 w-4" />
                      Send Email
                    </a>
                  </Button>

                  <Button 
                    asChild 
                    variant="outline" 
                    className="w-full"
                    data-testid="phone-contact"
                  >
                    <a 
                      href={selectedOffice?.country === "Saudi Arabia" ? "tel:+966530356116" : "tel:+97148842422"}
                      className="flex items-center justify-center gap-2"
                    >
                      <Phone className="h-4 w-4" />
                      Call Us
                    </a>
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Service Areas - Only for UAE and Saudi Arabia */}
            {(selectedOffice?.country === "United Arab Emirates" || selectedOffice?.country === "Saudi Arabia") && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Service Areas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">
                    A-SAFE provides comprehensive safety solutions around the world:
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                      United Arab Emirates
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                      Saudi Arabia
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                      Qatar
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                      Kuwait
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                      Bahrain
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
                      Oman
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Contact Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Send us a Message
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name *
                    </label>
                    <Input
                      id="name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      required
                      className="focus:ring-yellow-400 focus:border-yellow-400"
                      data-testid="input-name"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address *
                    </label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      required
                      className="focus:ring-yellow-400 focus:border-yellow-400"
                      data-testid="input-email"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="company" className="block text-sm font-medium text-gray-700 mb-1">
                    Company Name
                  </label>
                  <Input
                    id="company"
                    type="text"
                    value={formData.company}
                    onChange={(e) => handleInputChange("company", e.target.value)}
                    className="focus:ring-yellow-400 focus:border-yellow-400"
                    data-testid="input-company"
                  />
                </div>

                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
                    Subject *
                  </label>
                  <Input
                    id="subject"
                    type="text"
                    value={formData.subject}
                    onChange={(e) => handleInputChange("subject", e.target.value)}
                    required
                    className="focus:ring-yellow-400 focus:border-yellow-400"
                    data-testid="input-subject"
                  />
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                    Message *
                  </label>
                  <Textarea
                    id="message"
                    rows={4}
                    value={formData.message}
                    onChange={(e) => handleInputChange("message", e.target.value)}
                    required
                    className="focus:ring-yellow-400 focus:border-yellow-400"
                    placeholder="Please describe your inquiry, project requirements, or any questions you have about A-SAFE products and services..."
                    data-testid="input-message"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full bg-yellow-400 text-black hover:bg-yellow-500 font-semibold"
                  disabled={isSubmitting}
                  data-testid="submit-form"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-black border-t-transparent rounded-full mr-2"></div>
                      Sending Message...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send Message
                    </>
                  )}
                </Button>

                <p className="text-xs text-gray-500 text-center">
                  We typically respond within 24 hours during business days. 
                  For urgent inquiries, please call or use WhatsApp.
                </p>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Emergency Contact */}
        <Card className="mt-12 bg-red-50 border-red-200">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <Phone className="h-6 w-6 text-red-600 mt-1 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-black mb-2">Emergency Installation Support</h3>
                <p className="text-sm text-gray-700 mb-3">
                  For urgent safety installations or emergency repairs, our 24/7 support team is available:
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button asChild size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50">
                    <a href={selectedOffice?.country === "Saudi Arabia" ? "tel:+966530356116" : "tel:+97148842422"}>
                      Call Emergency Line
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50">
                    <a href={selectedOffice?.country === "Saudi Arabia" ? "https://wa.me/966530356116" : "https://wa.me/971503881285"} target="_blank" rel="noopener noreferrer">
                      Emergency WhatsApp
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
