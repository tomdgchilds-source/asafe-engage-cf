import { Link, useLocation } from "wouter";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_TOKEN_RE = /^[0-9a-f]{24,}$/i;

/** True for a path segment that is a database id rather than a word. */
export function isOpaqueId(segment: string): boolean {
  return UUID_RE.test(segment) || HEX_TOKEN_RE.test(segment);
}

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
      'site-survey': 'Site survey',
      'start-new-project': 'Start New Project',
      'orders': 'Orders',
      'quotes': 'Quotes',
      'layout-markup': 'Layout Markup',
      'drawing': 'Drawing',
      'order-form': 'Order form',
      'pas13-compliance': 'PAS 13 Alignment Checker',
      'layout-drawings': 'Layout Drawings',
      'layout-drawing': 'Layout Drawings',
      'calculations-history': 'Calculations History',
    };

    // Sub-pages that sit under an entity id (e.g. /site-survey/:id/review).
    // Keyed by the top-level section so the same word can mean different
    // things in different areas.
    const subPageNames: Record<string, Record<string, string>> = {
      'site-survey': {
        review: 'Review photos',
        walk: 'Survey walk',
        compare: 'Since last visit',
      },
    };

    let currentPath = '';
    paths.forEach((path, index) => {
      currentPath += `/${path}`;

      // Never render a raw id segment (/site-survey/<uuid>/review,
      // /order-form/<uuid>). The segments after it still link through
      // the full path, so navigation is unaffected.
      if (isOpaqueId(path)) return;

      // If we're on a product detail page and coming from calculator
      if (path.startsWith('products') && index === 0 && paths.length === 2 && isFromCalculator) {
        // Add calculator breadcrumb before products
        breadcrumbs.push({
          name: 'Impact Calculator',
          href: '/calculator',
          icon: undefined
        });
      }

      const section = paths[0];
      const underId = index >= 2 && isOpaqueId(paths[index - 1]);
      const subName = underId ? subPageNames[section]?.[path] : undefined;

      const name =
        subName ||
        pathNames[path] ||
        path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, ' ');

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