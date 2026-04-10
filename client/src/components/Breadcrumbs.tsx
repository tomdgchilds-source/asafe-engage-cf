import { Link, useLocation } from "wouter";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export function Breadcrumbs() {
  const [location] = useLocation();
  
  // Generate breadcrumb items from path
  const generateBreadcrumbs = () => {
    // Remove query parameters from location
    const cleanLocation = location.split('?')[0];
    const paths = cleanLocation.split('/').filter(Boolean);
    const queryParams = location.includes('?') ? location.split('?')[1] : '';
    const isFromCalculator = queryParams.includes('from=calculator');
    const breadcrumbs: Array<{ name: string; href: string; icon?: typeof Home }> = [
      { name: 'Home', href: '/', icon: Home }
    ];
    
    if (paths.length === 0) return breadcrumbs;
    
    // Map paths to readable names
    const pathNames: Record<string, string> = {
      'products': 'Products',
      'cart': 'Project Cart',
      'calculator': 'Impact Calculator',
      'case-studies': 'Case Studies',
      'resources': 'Resources',
      'profile': 'Profile',
      'admin': 'Admin Panel',
      'faqs': 'FAQs',
      'about': 'About',
      'contact': 'Contact',
      'solution-finder': 'Solution Finder',
      'site-survey': 'Site Survey',
      'start-new-project': 'Start New Project',
      'orders': 'Orders',
      'quotes': 'Quotes',
      'layout-markup': 'Layout Markup',
      'drawing': 'Drawing'
    };
    
    let currentPath = '';
    paths.forEach((path, index) => {
      currentPath += `/${path}`;
      
      // If we're on a product detail page and coming from calculator
      if (path.startsWith('products') && index === 0 && paths.length === 2 && isFromCalculator) {
        // Add calculator breadcrumb before products
        breadcrumbs.push({
          name: 'Impact Calculator',
          href: '/calculator',
          icon: undefined
        });
      }
      
      const name = pathNames[path] || path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ');
      
      // For product detail pages, show "Product Details" instead of the ID
      const displayName = (path.startsWith('products') && index === 0 && paths.length === 2) 
        ? 'Product Details' 
        : name;
      
      breadcrumbs.push({
        name: displayName,
        href: currentPath,
        icon: undefined
      });
    });
    
    return breadcrumbs;
  };
  
  const breadcrumbs = generateBreadcrumbs();
  
  // Don't show breadcrumbs on home page
  if (breadcrumbs.length === 1) return null;
  
  return (
    <nav 
      className="flex items-center space-x-2 text-sm text-muted-foreground px-4 py-2 bg-card border-b border-border sticky top-16 z-30 md:ml-56 lg:ml-64"
      aria-label="Breadcrumb"
    >
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;
        const Icon = crumb.icon;
        
        return (
          <div key={crumb.href} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground/50" />
            )}
            {isLast ? (
              <span className={cn(
                "font-medium text-foreground flex items-center gap-1",
                "animate-in fade-in slide-in-from-left-2 duration-300"
              )}>
                {Icon && <Icon className="h-4 w-4" />}
                {crumb.name}
              </span>
            ) : (
              <Link href={crumb.href} className={cn(
                "hover:text-foreground transition-colors flex items-center gap-1",
                "hover:underline underline-offset-4"
              )}>
                {Icon && <Icon className="h-4 w-4" />}
                {crumb.name}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}