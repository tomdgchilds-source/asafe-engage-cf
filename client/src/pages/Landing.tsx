import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Calculator, Package, FileText, Download, Users, Star, ExternalLink, MapPin, Mail, Phone } from "lucide-react";
import OfficeSelector, { GlobalOffice } from "@/components/OfficeSelector";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";

export default function Landing() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [selectedOffice, setSelectedOffice] = useState<GlobalOffice | undefined>();
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [registerMode, setRegisterMode] = useState(false);
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regCompany, setRegCompany] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);
  const haptic = useHapticFeedback();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError(null);
    setRegLoading(true);
    haptic.formSubmit();
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
          firstName: regFirstName,
          lastName: regLastName,
          company: regCompany || undefined,
        }),
        credentials: "include",
      });
      if (res.ok) {
        haptic.success();
        // Invalidate the auth cache so useAuth refetches and picks up the new session
        await qc.invalidateQueries({ queryKey: ["/api/auth/user"] });
        await qc.refetchQueries({ queryKey: ["/api/auth/user"] });
        setLocation("/");
      } else {
        haptic.error();
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setRegError(data.message ?? "Registration failed.");
      }
    } catch {
      haptic.error();
      setRegError("Network error. Please try again.");
    } finally {
      setRegLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    haptic.formSubmit();
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
        credentials: "include",
      });
      if (res.ok) {
        haptic.success();
        // Invalidate the auth cache so useAuth refetches and picks up the new session
        await qc.invalidateQueries({ queryKey: ["/api/auth/user"] });
        await qc.refetchQueries({ queryKey: ["/api/auth/user"] });
        setLocation("/");
      } else {
        haptic.error();
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setLoginError(data.message ?? "Login failed.");
      }
    } catch {
      haptic.error();
      setLoginError("Network error. Please try again.");
    } finally {
      setLoginLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-background text-foreground shadow-lg sticky top-0 z-50">
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
              <h1 className="text-2xl font-bold leading-tight text-primary ml-4" data-testid="brand-title">ENGAGE</h1>
            </div>

            {/* Sign In Button */}
            <div className="flex items-center">
              <Button
                onClick={() => setLoginOpen(true)}
                className="bg-primary text-primary-foreground hover:bg-yellow-300 whitespace-nowrap"
                data-testid="login-button"
              >
                Sign In
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-black via-gray-800 to-black text-white py-10 sm:py-16 md:py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6">
            Welcome to <span className="text-primary">A-SAFE ENGAGE</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl lg:text-2xl mb-6 sm:mb-8 max-w-3xl mx-auto">
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
      <section id="features" className="py-10 sm:py-16 asafe-section-alt">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl asafe-heading mb-4">Pioneering Workplace Safety</h2>
            <p className="asafe-subheading text-base sm:text-lg max-w-2xl mx-auto">
              Creating the safest and most advanced workplaces in the world with scientifically engineered safety solutions
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <Card className="asafe-card">
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <Shield className="h-6 w-6 sm:h-8 sm:w-8 text-primary-foreground" />
                </div>
                <h3 className="font-bold text-lg sm:text-xl mb-2">Protecting People</h3>
                <p className="text-muted-foreground">
                  Keep people safe, reduce risk and drive efficiency with industrial-strength guardrails and barriers that flex upon impact.
                </p>
              </CardContent>
            </Card>

            <Card className="asafe-card">
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <Calculator className="h-8 w-8 text-primary-foreground" />
                </div>
                <h3 className="font-bold text-lg sm:text-xl mb-2">Impact Calculator</h3>
                <p className="text-muted-foreground">
                  Calculate kinetic energy using PAS 13 methodology and get personalized product recommendations.
                </p>
              </CardContent>
            </Card>

            <Card className="asafe-card">
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <Package className="h-8 w-8 text-primary-foreground" />
                </div>
                <h3 className="font-bold text-lg sm:text-xl mb-2">Complete Catalog</h3>
                <p className="text-muted-foreground">
                  Explore our comprehensive range of safety barriers, bollards, column guards, and specialized protection solutions.
                </p>
              </CardContent>
            </Card>

            <Card className="asafe-card">
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <FileText className="h-8 w-8 text-primary-foreground" />
                </div>
                <h3 className="font-bold text-lg sm:text-xl mb-2">Case Studies</h3>
                <p className="text-muted-foreground">
                  Discover how A-SAFE solutions transform workplace safety across manufacturing, logistics, and pharmaceutical industries.
                </p>
              </CardContent>
            </Card>

            <Card className="asafe-card">
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <Download className="h-8 w-8 text-primary-foreground" />
                </div>
                <h3 className="font-bold text-lg sm:text-xl mb-2">Resource Center</h3>
                <p className="text-muted-foreground">
                  Access installation guides, PAS 13 certifications, safety templates, and technical specifications.
                </p>
              </CardContent>
            </Card>

            <Card className="asafe-card">
              <CardContent className="p-4 sm:p-6 text-center">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <Users className="h-8 w-8 text-primary-foreground" />
                </div>
                <h3 className="font-bold text-lg sm:text-xl mb-2">Expert Support</h3>
                <p className="text-muted-foreground">
                  Get support from our global team with comprehensive installation services around the world.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* About A-SAFE Section */}
      <section className="py-10 sm:py-16 asafe-section">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl asafe-heading mb-4 sm:mb-6">About A-SAFE</h2>
              <p className="asafe-subheading mb-4 sm:mb-6 text-base sm:text-lg">
                A-SAFE is the global leader in workplace safety solutions, protecting people, assets, and operations across 65+ countries. Our patented Memaplex™ technology and PAS 13 certified products have set the industry standard for nearly 40 years.
              </p>
              
              {/* Google Maps Rating in About Section */}
              <div className="bg-muted p-4 rounded-lg mb-6">
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <Star className="h-5 w-5 text-primary" />
                  Trusted by Our Customers
                </h3>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-primary text-primary" />
                    ))}
                  </div>
                  <span className="text-lg font-bold text-foreground">5.0</span>
                  <span className="text-muted-foreground">• Written Testimonials</span>
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
              
              <h3 className="text-xl font-bold text-foreground mb-4">Why Choose A-SAFE?</h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-primary-foreground text-sm font-bold">1</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Global Leader</h3>
                    <p className="text-muted-foreground">Nearly 40 years of experience serving 65+ countries worldwide with industry-leading safety solutions.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-primary-foreground text-sm font-bold">2</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">PAS 13 Certified</h3>
                    <p className="text-muted-foreground">All products tested to rigorous PAS 13 standards and independently certified by TÜV Nord.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-primary-foreground text-sm font-bold">3</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Memaplex™ Technology</h3>
                    <p className="text-muted-foreground">Proprietary triple-layer polymer system that flexes, absorbs energy, and bounces back after impact.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-primary-foreground text-sm font-bold">4</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Low Maintenance</h3>
                    <p className="text-muted-foreground">No rust, corrosion, or fading. Never needs painting and requires minimal maintenance.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="text-center mt-6 lg:mt-0">
              <img
                src="https://webcdn.asafe.com/media/vgghaahs/safety_innovation_1156x556.jpg"
                alt="A-SAFE Safety Innovation"
                loading="lazy"
                className="rounded-lg shadow-lg w-full max-h-64 sm:max-h-80 lg:max-h-none object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-10 sm:py-16 bg-black text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-gray-300 text-base sm:text-lg mb-6 sm:mb-8 max-w-2xl mx-auto">
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
              className="bg-primary text-primary-foreground font-semibold hover:bg-yellow-300 border-primary"
            >
              <a href="mailto:support@asafe.ae">Contact Sales</a>
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={loginOpen} onOpenChange={(open) => { setLoginOpen(open); if (!open) { setForgotMode(false); setForgotSent(false); setRegisterMode(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{forgotMode ? "Reset Your Password" : registerMode ? "Create Your Account" : "Sign in to A-SAFE ENGAGE"}</DialogTitle>
          </DialogHeader>
          {registerMode ? (
            <form onSubmit={handleRegister} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="reg-first-name">First Name</Label>
                  <Input id="reg-first-name" required value={regFirstName} onChange={(e) => setRegFirstName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reg-last-name">Last Name</Label>
                  <Input id="reg-last-name" required value={regLastName} onChange={(e) => setRegLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-email">Email</Label>
                <Input id="reg-email" type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-company">Company (optional)</Label>
                <Input id="reg-company" value={regCompany} onChange={(e) => setRegCompany(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="reg-password">Password</Label>
                <Input id="reg-password" type="password" required minLength={6} value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
              </div>
              {regError && <p className="text-sm text-red-600">{regError}</p>}
              <Button type="submit" disabled={regLoading} className="w-full bg-primary text-primary-foreground hover:bg-yellow-300">
                {regLoading ? "Creating account..." : "Create Account"}
              </Button>
              <div className="text-center">
                <Button type="button" variant="link" onClick={() => { setRegisterMode(false); setRegError(null); }} className="text-sm text-muted-foreground hover:text-primary">
                  Already have an account? Sign in
                </Button>
              </div>
            </form>
          ) : forgotMode ? (
            forgotSent ? (
              <div className="space-y-4 pt-2 text-center">
                <p className="text-sm text-muted-foreground">If an account with that email exists, a reset link has been sent. Please check your inbox.</p>
                <Button
                  type="button"
                  variant="link"
                  onClick={() => { setForgotMode(false); setForgotSent(false); }}
                  className="text-sm"
                >
                  Back to login
                </Button>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setForgotLoading(true);
                  try {
                    await fetch("/api/auth/forgot-password", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email: forgotEmail }),
                    });
                    setForgotSent(true);
                  } catch {
                    // still show success to prevent enumeration
                    setForgotSent(true);
                  } finally {
                    setForgotLoading(false);
                  }
                }}
                className="space-y-4 pt-2"
              >
                <p className="text-sm text-muted-foreground">Enter your email address and we'll send you a link to reset your password.</p>
                <div className="space-y-1">
                  <Label htmlFor="forgot-email">Email</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full bg-primary text-primary-foreground hover:bg-yellow-300"
                >
                  {forgotLoading ? "Sending..." : "Send Reset Link"}
                </Button>
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setForgotMode(false)}
                  className="w-full text-sm"
                >
                  Back to login
                </Button>
              </form>
            )
          ) : (
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
                className="w-full bg-primary text-primary-foreground hover:bg-yellow-300"
              >
                {loginLoading ? "Signing in…" : "Sign In"}
              </Button>
              <div className="text-center">
                <Button
                  type="button"
                  variant="link"
                  onClick={() => { setForgotMode(true); setForgotEmail(loginEmail); }}
                  className="text-sm text-muted-foreground hover:text-primary"
                >
                  Forgot password?
                </Button>
              </div>

              {/* Divider */}
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-background text-muted-foreground">or continue with</span>
                </div>
              </div>

              {/* OAuth Buttons */}
              <div className="space-y-2">
                <a href="/api/auth/google" className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-border rounded-md hover:bg-muted transition-colors">
                  <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                  <span className="font-medium">Sign in with Google</span>
                </a>
                {/* Apple Sign In — requires Apple Developer Program credentials */}
              </div>

              <div className="text-center pt-2">
                <Button type="button" variant="link" onClick={() => { setRegisterMode(true); setLoginError(null); }} className="text-sm text-muted-foreground hover:text-primary">
                  Don't have an account? Create one
                </Button>
              </div>
            </form>
          )}
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
                  <Link href="/industry-case-studies/manufacturing" className="hover:text-primary transition-colors cursor-pointer">
                    Manufacturing
                  </Link>
                </li>
                <li>
                  <Link href="/industry-case-studies/logistics" className="hover:text-primary transition-colors cursor-pointer">
                    Logistics & Warehousing
                  </Link>
                </li>
                <li>
                  <Link href="/industry-case-studies/pharmaceuticals" className="hover:text-primary transition-colors cursor-pointer">
                    Pharmaceuticals
                  </Link>
                </li>
                <li>
                  <Link href="/industry-case-studies/automotive" className="hover:text-primary transition-colors cursor-pointer">
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
