import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Calculator, Package, FileText, Download, Users, Star, ExternalLink, MapPin, Mail, Phone } from "lucide-react";
import OfficeSelector, { GlobalOffice } from "@/components/OfficeSelector";

export default function Landing() {
  const [selectedOffice, setSelectedOffice] = useState<GlobalOffice | undefined>();
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
        credentials: "include",
      });
      if (res.ok) {
        window.location.href = "/";
      } else {
        const data = await res.json().catch(() => ({}));
        setLoginError(data.message ?? "Login failed.");
      }
    } catch {
      setLoginError("Network error. Please try again.");
    } finally {
      setLoginLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white text-black shadow-lg sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center h-16 w-full">
            {/* Logo */}
            <div className="flex items-center flex-shrink-0">
              <img 
                src="/assets/A-SAFE_Logo_Primary_Version.png" 
                alt="A-SAFE Logo" 
                className="h-10 w-auto"
              />
            </div>

            {/* Centered ENGAGE Title */}
            <div className="flex-1 flex justify-center">
              <h1 className="text-2xl font-bold leading-tight text-yellow-400 ml-4" data-testid="brand-title">ENGAGE</h1>
            </div>

            {/* Sign In Button */}
            <div className="flex items-center">
              <Button
                onClick={() => setLoginOpen(true)}
                className="bg-yellow-400 text-black hover:bg-yellow-500 whitespace-nowrap"
                data-testid="login-button"
              >
                Sign In
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-black via-gray-800 to-black text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Welcome to <span className="text-yellow-400">A-SAFE ENGAGE</span>
          </h1>
          <p className="text-xl md:text-2xl mb-8 max-w-3xl mx-auto">
            The dedicated B2B pre-sales enablement tool for A-SAFE's safety barrier solutions. Design workplace protection layouts, calculate precise impact requirements using PAS 13 methodology, explore certified product catalogs, and manage comprehensive safety projects with expert support.
          </p>
          <div className="flex flex-col md:flex-row gap-4 justify-center">
            <Button
              onClick={() => setLoginOpen(true)}
              size="lg"
              className="asafe-cta-primary"
              data-testid="get-started-button"
            >
              Get Started
            </Button>
            <Button 
              asChild 
              variant="outline" 
              size="lg"
              className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            >
              <a href="#features">Learn More</a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 asafe-section-alt">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl asafe-heading mb-4">Pioneering Workplace Safety</h2>
            <p className="asafe-subheading text-lg max-w-2xl mx-auto">
              Creating the safest and most advanced workplaces in the world with scientifically engineered safety solutions
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="asafe-card">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-8 w-8 text-black" />
                </div>
                <h3 className="font-bold text-xl mb-2">Protecting People</h3>
                <p className="text-muted-foreground">
                  Keep people safe, reduce risk and drive efficiency with industrial-strength guardrails and barriers that flex upon impact.
                </p>
              </CardContent>
            </Card>

            <Card className="asafe-card">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calculator className="h-8 w-8 text-white" />
                </div>
                <h3 className="font-bold text-xl mb-2">Impact Calculator</h3>
                <p className="text-muted-foreground">
                  Calculate kinetic energy using PAS 13 methodology and get personalized product recommendations.
                </p>
              </CardContent>
            </Card>

            <Card className="asafe-card">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Package className="h-8 w-8 text-white" />
                </div>
                <h3 className="font-bold text-xl mb-2">Complete Catalog</h3>
                <p className="text-muted-foreground">
                  Explore our comprehensive range of safety barriers, bollards, column guards, and specialized protection solutions.
                </p>
              </CardContent>
            </Card>

            <Card className="asafe-card">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-white" />
                </div>
                <h3 className="font-bold text-xl mb-2">Case Studies</h3>
                <p className="text-muted-foreground">
                  Discover how A-SAFE solutions transform workplace safety across manufacturing, logistics, and pharmaceutical industries.
                </p>
              </CardContent>
            </Card>

            <Card className="asafe-card">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Download className="h-8 w-8 text-white" />
                </div>
                <h3 className="font-bold text-xl mb-2">Resource Center</h3>
                <p className="text-muted-foreground">
                  Access installation guides, PAS 13 certifications, safety templates, and technical specifications.
                </p>
              </CardContent>
            </Card>

            <Card className="asafe-card">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <h3 className="font-bold text-xl mb-2">Expert Support</h3>
                <p className="text-muted-foreground">
                  Get support from our global team with comprehensive installation services around the world.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* About A-SAFE Section */}
      <section className="py-16 asafe-section">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <div>
              <h2 className="text-3xl asafe-heading mb-6">About A-SAFE</h2>
              <p className="asafe-subheading mb-6 text-lg">
                A-SAFE is the global leader in workplace safety solutions, protecting people, assets, and operations across 65+ countries. Our patented Memaplex™ technology and PAS 13 certified products have set the industry standard for nearly 40 years.
              </p>
              
              {/* Google Maps Rating in About Section */}
              <div className="bg-gray-50 p-4 rounded-lg mb-6">
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500" />
                  Trusted by Our Customers
                </h3>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <span className="text-lg font-bold text-gray-800">5.0</span>
                  <span className="text-gray-600">• Written Testimonials</span>
                </div>
                <a 
                  href="https://maps.app.goo.gl/55wf4FPkAe2NfKDHA?g_st=ipc" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors font-medium"
                >
                  <span>See what our customers say</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              
              <h3 className="text-xl font-bold text-black mb-4">Why Choose A-SAFE?</h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-black text-sm font-bold">1</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Global Leader</h3>
                    <p className="text-muted-foreground">Nearly 40 years of experience serving 65+ countries worldwide with industry-leading safety solutions.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-black text-sm font-bold">2</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">PAS 13 Certified</h3>
                    <p className="text-muted-foreground">All products tested to rigorous PAS 13 standards and independently certified by TÜV Nord.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-black text-sm font-bold">3</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Memaplex™ Technology</h3>
                    <p className="text-muted-foreground">Proprietary triple-layer polymer system that flexes, absorbs energy, and bounces back after impact.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-black text-sm font-bold">4</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Low Maintenance</h3>
                    <p className="text-muted-foreground">No rust, corrosion, or fading. Never needs painting and requires minimal maintenance.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="text-center">
              <img
                src="https://webcdn.asafe.com/media/vgghaahs/safety_innovation_1156x556.jpg"
                alt="A-SAFE Safety Innovation"
                loading="lazy"
                className="rounded-lg shadow-lg w-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-16 bg-black text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-gray-300 text-lg mb-8 max-w-2xl mx-auto">
            Join thousands of companies worldwide who trust A-SAFE to protect their people, assets, and operations.
          </p>
          <div className="flex flex-col md:flex-row gap-4 justify-center">
            <Button
              onClick={() => setLoginOpen(true)}
              size="lg"
              className="asafe-cta-primary"
            >
              Access Portal
            </Button>
            <Button 
              asChild 
              variant="outline" 
              size="lg"
              className="border-white text-black bg-white hover:bg-gray-100"
            >
              <a href="mailto:support@asafe.ae">Contact Sales</a>
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in to A-SAFE ENGAGE</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleLogin} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>
            {loginError && <p className="text-sm text-red-600">{loginError}</p>}
            <Button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-yellow-400 text-black hover:bg-yellow-500"
            >
              {loginLoading ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="bg-asafe-black text-white py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-bold mb-4 text-primary">Contact A-SAFE Globally</h3>
              <OfficeSelector
                selectedOffice={selectedOffice}
                onOfficeSelect={setSelectedOffice}
                showContactInfo={true}
                defaultRegion="Middle East"
                buttonVariant="ghost"
                className="text-white"
              />
            </div>
            <div>
              <h4 className="font-semibold mb-4">Industries</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/industry-case-studies/manufacturing" className="hover:text-yellow-300 transition-colors cursor-pointer">
                    Manufacturing
                  </Link>
                </li>
                <li>
                  <Link href="/industry-case-studies/logistics" className="hover:text-yellow-300 transition-colors cursor-pointer">
                    Logistics & Warehousing
                  </Link>
                </li>
                <li>
                  <Link href="/industry-case-studies/pharmaceuticals" className="hover:text-yellow-300 transition-colors cursor-pointer">
                    Pharmaceuticals
                  </Link>
                </li>
                <li>
                  <Link href="/industry-case-studies/automotive" className="hover:text-yellow-300 transition-colors cursor-pointer">
                    Automotive
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-500 mt-8 pt-8 text-center text-sm text-gray-300">
            <p>&copy; 2025 {selectedOffice?.companyName || 'A-SAFE'}. All rights reserved. | Pioneering Workplace Safety</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
