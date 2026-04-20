import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  Users, 
  Globe, 
  Star, 
  Award, 
  CheckCircle, 
  ArrowRight,
  Target,
  Handshake,
  Building2,
  MessageCircle,
  Mail,
  Phone
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState } from "react";
import { useLocation } from "wouter";

export default function About() {
  const [, setLocation] = useLocation();
  const [showContactModal, setShowContactModal] = useState(false);

  const handleContactAction = (type: 'contact' | 'whatsapp-me') => {
    switch (type) {
      case 'contact':
        setLocation('/contact');
        break;
      case 'whatsapp-me':
        // Keep Middle East WhatsApp as a quick contact option
        window.open('https://wa.me/971585992500?text=Hello%2C%20I%27m%20interested%20in%20A-SAFE%20safety%20solutions%20and%20would%20like%20to%20speak%20with%20an%20expert.', '_blank');
        break;
    }
    setShowContactModal(false);
  };
  const benefits = [
    {
      icon: Shield,
      title: "Enhanced Safety Management",
      description: "Access comprehensive safety solutions with real-time impact calculations and product recommendations tailored to your specific needs."
    },
    {
      icon: Target,
      title: "Precise Product Selection",
      description: "Use our PAS 13 certified calculator to find the exact safety barriers that match your operational requirements and impact loads."
    },
    {
      icon: Building2,
      title: "Streamlined Operations",
      description: "Manage your entire safety procurement process from calculation to order fulfillment in one integrated platform."
    },
    {
      icon: Users,
      title: "Expert Support",
      description: "Connect with our safety engineering team for personalized consultations and technical guidance throughout your project."
    },
    {
      icon: Globe,
      title: "Global Standards",
      description: "Benefit from internationally certified solutions trusted by 65+ countries and backed by nearly 40 years of safety expertise."
    },
    {
      icon: Handshake,
      title: "Partnership Benefits",
      description: "Join our collaborative network of safety-focused organizations working together to create safer, more efficient workplaces."
    }
  ];

  const features = [
    "Real-time impact calculations using PAS 13 methodology",
    "Comprehensive product catalog with technical specifications",
    "Personalized quote generation and order management",
    "Access to case studies and industry-specific resources",
    "Direct connection to A-SAFE's technical support team",
    "Layout markup tools for precise safety planning"
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-black mb-4" data-testid="about-title">
            About A-SAFE ENGAGE
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Your comprehensive safety solution portal designed to empower businesses worldwide with cutting-edge workplace protection technology.
          </p>
        </div>

        {/* Collaboration Images Section */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="text-center text-2xl mb-4">Partnership & Collaboration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
              {/* A-SAFE Team Collaboration */}
              <div className="text-center">
                <div className="rounded-lg shadow-lg w-full h-48 mb-4 bg-[#FFC72C] flex items-center justify-center border-2 border-black">
                  <div className="text-center">
                    <Users className="h-12 w-12 text-black mx-auto mb-2" />
                    <div className="text-sm font-medium text-black">Industry Partnership</div>
                  </div>
                </div>
                <h3 className="font-semibold text-lg">Working with Industry Leaders</h3>
                <p className="text-muted-foreground">Collaborating with global companies like Unilever to create safer work environments.</p>
              </div>
              
              {/* Engineering Team */}
              <div className="text-center">
                <div className="rounded-lg shadow-lg w-full h-48 mb-4 bg-black dark:bg-gray-900 flex items-center justify-center border-2 border-[#FFC72C]">
                  <div className="text-center">
                    <Building2 className="h-12 w-12 text-[#FFC72C] mx-auto mb-2" />
                    <div className="text-sm font-medium text-[#FFC72C]">Engineering Innovation</div>
                  </div>
                </div>
                <h3 className="font-semibold text-lg">Innovation Through Teamwork</h3>
                <p className="text-muted-foreground">Our engineering teams work collaboratively to develop cutting-edge safety solutions.</p>
              </div>
              
              {/* Customer Partnership */}
              <div className="text-center">
                <div className="rounded-lg shadow-lg w-full h-48 mb-4 bg-gray-100 dark:bg-gray-800 flex items-center justify-center border-2 border-[#FFC72C]">
                  <div className="text-center">
                    <Handshake className="h-12 w-12 text-black dark:text-[#FFC72C] mx-auto mb-2" />
                    <div className="text-sm font-medium text-black dark:text-[#FFC72C]">Customer Success</div>
                  </div>
                </div>
                <h3 className="font-semibold text-lg">Customer Success Stories</h3>
                <p className="text-muted-foreground">Building lasting partnerships that deliver measurable safety improvements and ROI.</p>
              </div>
            </div>
            
            <div className="bg-yellow-50 p-6 rounded-lg text-center">
              <h3 className="font-bold text-xl text-black mb-2">Let's Work Together</h3>
              <p className="text-muted-foreground">
                Join our growing community of safety-conscious organizations. Together, we're creating the safest and most efficient workplaces in the world.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Application Benefits */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-yellow-600" />
                Platform Benefits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {benefits.map((benefit, index) => {
                  const Icon = benefit.icon;
                  return (
                    <div key={index} className="flex items-start space-x-3">
                      <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                        <Icon className="h-4 w-4 text-yellow-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-black">{benefit.title}</h3>
                        <p className="text-gray-600 text-sm">{benefit.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-600" />
                Key Features
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <p className="text-foreground text-sm">{feature}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Why Choose A-SAFE Section */}
        <Card className="mb-12">
          <CardContent className="p-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
              <div>
                <h2 className="text-3xl font-bold text-black mb-6">Why Choose A-SAFE ENGAGE?</h2>
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-black text-sm font-bold">1</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Global Leader</h3>
                      <p className="text-muted-foreground">Nearly 40 years of experience serving 65+ countries with industry-leading safety solutions.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-black text-sm font-bold">2</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Certified Excellence</h3>
                      <p className="text-muted-foreground">PAS 13 certified products with independent TÜV Nord testing and validation.</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3">
                    <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-black text-sm font-bold">3</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">Proven Results</h3>
                      <p className="text-muted-foreground">Trusted by Fortune 500 companies worldwide for their most critical safety applications.</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col sm:flex-row gap-4">
                  <Button 
                    className="bg-yellow-400 hover:bg-yellow-500 text-black"
                    onClick={() => setShowContactModal(true)}
                  >
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Get Started Today
                  </Button>
                  <Button 
                    variant="outline" 
                    className="border-yellow-400 text-yellow-600 hover:bg-yellow-50"
                    onClick={() => setShowContactModal(true)}
                  >
                    Contact Our Team
                  </Button>
                </div>
              </div>
              
              <div className="text-center">
                <img
                  src="https://webcdn.asafe.com/media/iyvhq2wy/a-safe-memaflex-barrier-system.jpg"
                  alt="A-SAFE Memaflex barrier system - innovative safety technology"
                  className="rounded-lg shadow-lg w-full"
                  loading="lazy"
                  onError={(e) => {
                    // Gracefully hide broken image rather than showing a broken icon
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <div className="mt-4">
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                    <Award className="h-3 w-3 mr-1" />
                    Patented Memaplex™ Technology
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Section */}
        <Card className="mb-12 bg-gradient-to-r from-black to-gray-800 text-white">
          <CardContent className="p-8">
            <h2 className="text-2xl font-bold text-center mb-8">Trusted Worldwide</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div>
                <div className="text-3xl font-bold text-yellow-400">65+</div>
                <div className="text-gray-300">Countries Served</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-yellow-400">40</div>
                <div className="text-gray-300">Years of Excellence</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-yellow-400">5.0</div>
                <div className="text-gray-300">Google Rating</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-yellow-400">1000s</div>
                <div className="text-gray-300">Satisfied Customers</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Call to Action */}
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold text-black mb-4">Ready to Transform Your Workplace Safety?</h2>
            <p className="text-gray-700 mb-6 max-w-2xl mx-auto">
              Join thousands of companies worldwide who trust A-SAFE ENGAGE to protect their people, assets, and operations. 
              Experience the difference that comes from working with the global leader in workplace safety solutions.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-yellow-400 hover:bg-yellow-500 text-black"
                onClick={() => setShowContactModal(true)}
              >
                <Shield className="h-4 w-4 mr-2" />
                Start Your Safety Journey
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="border-yellow-400 text-yellow-600 hover:bg-yellow-50"
                onClick={() => setShowContactModal(true)}
              >
                <Users className="h-4 w-4 mr-2" />
                Speak with an Expert
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contact Modal */}
      <Dialog open={showContactModal} onOpenChange={setShowContactModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-bold text-foreground">
              Contact A-SAFE
            </DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              Choose your preferred method to get in touch with our safety experts
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 mt-6">
            {/* Full Contact Page Option */}
            <Button
              onClick={() => handleContactAction('contact')}
              className="w-full flex items-center justify-start gap-4 h-16 bg-yellow-400 hover:bg-yellow-500 text-black"
            >
              <Mail className="h-6 w-6" />
              <div className="text-left">
                <div className="font-semibold">Contact Our Global Offices</div>
                <div className="text-sm opacity-90">Choose your preferred office location</div>
              </div>
            </Button>

            {/* Quick WhatsApp Option */}
            <Button
              onClick={() => handleContactAction('whatsapp-me')}
              variant="outline"
              className="w-full flex items-center justify-start gap-4 h-16 border-2 border-green-500 text-green-600 hover:bg-green-50"
            >
              <MessageCircle className="h-6 w-6" />
              <div className="text-left">
                <div className="font-semibold">Quick WhatsApp (Middle East)</div>
                <div className="text-sm opacity-75">Instant chat with our Dubai team</div>
              </div>
            </Button>
          </div>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Global offices available with various time zones and contact methods
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}