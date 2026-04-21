import { ReactNode, useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Breadcrumbs } from "./Breadcrumbs";
import { 
  Home, 
  Package, 
  Calculator, 
  FileText, 
  Download, 
  Phone, 
  User, 
  Settings,
  LogOut,
  Menu,
  Eye,
  Shield,
  ShoppingCart,
  Info,
  HelpCircle,
  Lightbulb,
  BarChart3,
  Target,
  FileCheck,
  Compass,
  Building,
  Factory,
  ClipboardCheck,
  ChevronRight,
  ChevronDown,
  X,
  Bell,
  Briefcase,
  BookOpen,
  Video,
  Users,
  MessageCircle,
  TrendingUp
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { CurrencySelector } from "@/components/CurrencySelector";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { NotificationCenter } from "@/components/NotificationCenter";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, isAuthenticated } = useAuth();
  const [location] = useLocation();
  const haptic = useHapticFeedback();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(() => {
    // Persist to localStorage so the sidebar remembers which sections are open.
    try {
      const stored = localStorage.getItem("expandedCategories");
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  });

  // Sync expanded state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("expandedCategories", JSON.stringify(expandedCategories));
    } catch {}
  }, [expandedCategories]);
  
  // Track scroll position for header effects
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-expand the category containing the active page
  useEffect(() => {
    navigationCategories.forEach(category => {
      const hasActiveItem = category.items.some(item => item.href === location);
      if (hasActiveItem && !expandedCategories.includes(category.name)) {
        setExpandedCategories(prev => [...prev, category.name]);
      }
    });
  }, [location]);
  
  // Close mobile menu on route change
  useEffect(() => {
    setIsSheetOpen(false);
  }, [location]);

  // Fetch cart data to show item count
  const { data: cartData } = useQuery({
    queryKey: ["/api/cart"],
    enabled: isAuthenticated,
  });

  const cartItemCount = (cartData && Array.isArray(cartData)) 
    ? cartData.length 
    : 0;

  const navigationCategories = useMemo(() => [
    {
      name: "Quick Access",
      icon: Home,
      items: [
        { name: "Dashboard", href: "/", icon: Home, external: false },
        { name: "Profile", href: "/profile", icon: User, external: false },
        { name: "Project Cart", href: "/cart", icon: ShoppingCart, external: false },
      ]
    },
    {
      name: "Projects & Tools",
      icon: Briefcase,
      items: [
        { name: "Start New Project", href: "/start-new-project", icon: Target, external: false },
        { name: "Solution Finder", href: "/solution-finder", icon: Lightbulb, external: false },
        { name: "Site Survey", href: "/site-survey", icon: ClipboardCheck, external: false },
        { name: "Impact Calculator", href: "/calculator", icon: Calculator, external: false },
        { name: "PAS 13 Compliance", href: "/pas13-compliance", icon: Shield, external: false },
        { name: "Communication Plan", href: "/communication-plan", icon: MessageCircle, external: false },
        { name: "Installation Timeline", href: "/installation-timeline", icon: TrendingUp, external: false },
      ]
    },
    {
      name: "Products & Resources",
      icon: Package,
      items: [
        { name: "Products", href: "/products", icon: Package, external: false },
        { name: "Case Studies", href: "/case-studies", icon: FileText, external: false },
        { name: "Resources", href: "/resources", icon: Download, external: false },
        { name: "PAS 13 Videos", href: "https://youtube.com/playlist?list=PL0sD7WA0DgAPFKBTUeHfMIIWYI0z6KEXn&si=RII3MzaXu-0or1f9", icon: FileCheck, external: true },
        { name: "Discovery Videos", href: "https://youtube.com/playlist?list=PL0sD7WA0DgAMH7v-4ujH3m9CABJvNYRCS&si=AYb8PIxWxd3TcvIL", icon: Compass, external: true },
      ]
    },
    {
      name: "Virtual Experience",
      icon: Video,
      items: [
        { name: "Virtual Application Space", href: "https://www.asafe.com/ar-ae/virtual-a-safe/product-application-space/?utm_term=Vitual&utm_campaign=UK%20Marketing&utm_content=367233215&utm_medium=social&utm_source=linkedin&hss_channel=lcp-2416321", icon: Building, external: true },
        { name: "Virtual Factory Tour", href: "https://www.asafe.com/ar-ae/virtual-a-safe/", icon: Factory, external: true },
      ]
    },
    {
      name: "Support & Info",
      icon: HelpCircle,
      items: [
        { name: "Help Center", href: "/help", icon: BookOpen, external: false },
        { name: "FAQs", href: "/faqs", icon: HelpCircle, external: false },
        { name: "About", href: "/about", icon: Info, external: false },
        { name: "Contact", href: "/contact", icon: Phone, external: false },
      ]
    },
    {
      name: "Administration",
      icon: Shield,
      items: [
        { name: "Admin", href: "/admin", icon: Shield, external: false },
      ]
    }
  ], []);

  const toggleCategory = (categoryName: string) => {
    haptic.toggle();
    setExpandedCategories(prev =>
      prev.includes(categoryName)
        ? prev.filter(name => name !== categoryName)
        : [...prev, categoryName]
    );
  };

  const handleLogout = () => {
    haptic.medium();
    window.location.href = "/api/logout";
  };

  const NavItems = ({ onItemClick, isMobile = false }: { onItemClick?: () => void; isMobile?: boolean }) => {
    const handleNavClick = () => {
      haptic.pageTransition();
      onItemClick?.();
    };
    return (
    <>
      {navigationCategories.map((category) => {
        const CategoryIcon = category.icon;
        const isExpanded = expandedCategories.includes(category.name);
        
        return (
          <div key={category.name} className="mb-2">
            {/* Category Header */}
            <Button
              variant="ghost"
              onClick={() => toggleCategory(category.name)}
              className="w-full justify-between text-foreground hover:bg-muted/50 h-auto py-2 px-3 mb-1"
            >
              <div className="flex items-center">
                <CategoryIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{category.name}</span>
              </div>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
            
            {/* Category Items */}
            {isExpanded && (
              <div className="ml-4 space-y-1 animate-in slide-in-from-top-2 duration-200">
                {category.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location === item.href;
                  
                  if (item.external) {
                    return (
                      <a key={item.name} href={item.href} target="_blank" rel="noopener noreferrer">
                        <Button
                          variant="ghost"
                          className="w-full justify-start text-foreground hover:bg-muted hover:text-primary h-auto py-2 px-3 text-left whitespace-normal transition-colors"
                          data-testid={`nav-${item.name.toLowerCase().replace(' ', '-')}`}
                          onClick={handleNavClick}
                        >
                          <Icon className="mr-2 h-4 w-4 flex-shrink-0" />
                          <span className="text-sm">{item.name}</span>
                        </Button>
                      </a>
                    );
                  }

                  return (
                    <Link key={item.name} href={item.href}>
                      <Button
                        variant={isActive ? "default" : "ghost"}
                        className={cn(
                          "w-full justify-start transition-colors duration-100 h-auto py-2 px-3 text-left whitespace-normal",
                          isActive
                            ? "bg-[#FFC72C] text-black hover:bg-[#FFB700] font-semibold"
                            : "text-foreground hover:bg-[#FFC72C]/10 hover:text-foreground"
                        )}
                        data-testid={`nav-${item.name.toLowerCase().replace(' ', '-')}`}
                        onClick={handleNavClick}
                      >
                        <Icon className="mr-2 h-4 w-4 flex-shrink-0" />
                        <span className="text-sm">{item.name}</span>
                      </Button>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background transition-colors">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background transition-colors">
      {/* Enhanced Sticky Header with Scroll Effects */}
      <header className={cn(
        "bg-card text-foreground fixed top-0 left-0 right-0 z-40 border-b border-border transition-all duration-300",
        scrolled ? "shadow-lg backdrop-blur-md bg-card/95" : "shadow-sm"
      )}>
        <div className="w-full px-2 sm:px-4 md:px-6 lg:px-8 max-w-full">
          <div className="flex items-center justify-between h-14 sm:h-16 w-full gap-2">
            {/* Logo and Menu - Left Section */}
            <div className="flex items-center flex-shrink-0">
              {/* Mobile Menu Trigger */}
              <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="sm" className="md:hidden p-1.5 sm:p-2 touch-manipulation hover:bg-[#FFC72C]/10" data-testid="mobile-menu-trigger">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[85vw] max-w-sm p-0 transition-transform duration-300 ease-out">
                  <div className="flex flex-col h-full">
                    {/* Enhanced Mobile Header */}
                    <div className="p-4 border-b border-border bg-gradient-to-r from-primary/10 to-transparent">
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-foreground">Navigation</h2>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsSheetOpen(false)}
                          className="p-1"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {/* Navigation Items */}
                    <nav className="flex-1 p-4 overflow-y-auto">
                      <div className="space-y-1">
                        <NavItems onItemClick={() => setIsSheetOpen(false)} isMobile={true} />
                      </div>
                    </nav>
                    
                    {/* Footer with Logout */}
                    <div className="border-t border-border p-6">
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          handleLogout();
                          setIsSheetOpen(false);
                        }}
                        className="w-full hover:bg-[#FFC72C]/10 hover:border-[#FFC72C]"
                        data-testid="mobile-logout"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Logout
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              {/* A-SAFE Logo */}
              <Link href="/" className="flex items-center gap-1 sm:gap-2 text-foreground hover:text-primary transition-colors ml-2" data-testid="logo">
                <img 
                  src="/assets/A-SAFE_Logo_Primary_Version.png" 
                  alt="A-SAFE"
                  className="h-6 sm:h-8 w-auto"
                />
                <span className="font-bold text-xs sm:text-sm md:text-lg text-[#FFC72C] hidden min-[400px]:block">ENGAGE</span>
              </Link>
            </div>

            {/* Center Section - Project switcher + Currency Selector & Theme Toggle for desktop */}
            <div className="hidden md:flex items-center justify-center space-x-3">
              <ProjectSwitcher />
              <CurrencySelector />
              <ThemeToggle />
            </div>

            {/* Right Section - User Info & Cart */}
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {/* Currency Selector - Mobile (always visible) */}
              <div className="md:hidden">
                <CurrencySelector />
              </div>

              {/* Cart Icon with Badge - Mobile */}
              <Link href="/cart" className="md:hidden">
                <Button variant="ghost" size="sm" className="relative hover:bg-muted hover:text-primary p-1.5 sm:p-2 touch-manipulation" data-testid="mobile-cart">
                  <ShoppingCart className="h-5 w-5" />
                  {cartItemCount > 0 && (
                    <Badge 
                      variant="secondary" 
                      className="absolute -top-1 -right-1 bg-primary text-primary-foreground border-0 min-w-[1.2rem] h-4 flex items-center justify-center p-0 text-[10px] font-bold"
                    >
                      {cartItemCount}
                    </Badge>
                  )}
                </Button>
              </Link>

              {/* User Welcome & Settings - Desktop */}
              <div className="hidden md:flex items-center space-x-4">
                {/* Global header search (⌘K) — visible to authed users */}
                {isAuthenticated && (
                  <div className="w-72 lg:w-80">
                    <GlobalSearch />
                  </div>
                )}

                <span className="text-sm text-foreground font-medium" data-testid="user-welcome">
                  Welcome, {(user as any)?.name || (user as any)?.email?.split('@')[0] || 'User'}
                </span>

                {/* Notification Center */}
                <NotificationCenter />

                <Link href="/cart" className="relative">
                  <Button variant="ghost" size="sm" className="relative hover:bg-muted hover:text-primary" data-testid="desktop-cart">
                    <ShoppingCart className="h-5 w-5" />
                    {cartItemCount > 0 && (
                      <Badge 
                        variant="secondary" 
                        className="absolute -top-2 -right-2 bg-primary text-primary-foreground border-0 min-w-[1.25rem] h-5 flex items-center justify-center p-0 text-xs font-bold"
                      >
                        {cartItemCount}
                      </Badge>
                    )}
                  </Button>
                </Link>

                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleLogout}
                  data-testid="desktop-logout"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </div>

              {/* Mobile Theme Toggle */}
              <div className="md:hidden">
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Breadcrumb Navigation */}
      <Breadcrumbs />
      
      {/* Navigation Sidebar - Desktop */}
      <div className={cn(
        "hidden md:block fixed left-0 bottom-0 w-56 lg:w-64 bg-card shadow-lg border-r border-border z-20 overflow-y-auto transition-all duration-300",
        location === '/' ? "top-16" : "top-24"
      )}>
        <nav className="p-3">
          <div className="space-y-1">
            <NavItems isMobile={false} />
          </div>
        </nav>
      </div>
      
      {/* Main Content Area */}
      <main className={cn(
        "md:ml-56 lg:ml-64 min-h-screen bg-background transition-all duration-300 px-2 sm:px-4 md:px-6 lg:px-8",
        location === '/' ? "pt-16" : "pt-24"
      )}>
        <div className="max-w-full overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}